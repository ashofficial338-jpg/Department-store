import multer from 'multer';
import path from 'path';
import Vendor, { VERIFICATION_STATUSES, DOC_TYPES, REQUIRED_DOCS } from '../models/Vendor.js';
import VendorDocument from '../models/VendorDocument.js';
import Purchase from '../models/Purchase.js';
import PurchaseInvoice from '../models/PurchaseInvoice.js';
import { billedAmount } from '../utils/payables.js';
import catchAsync from '../utils/catchAsync.js';
import ApiError from '../utils/ApiError.js';
import recordAudit from '../utils/audit.js';
import { getPagination, buildPaginatedResponse } from '../utils/pagination.js';
import { literalRegex, number, oneOf, escapeRegex } from '../utils/validate.js';
import { requireFields, getFieldRules } from '../utils/fieldRules.js';

export const STATUS_LABEL = { pending: 'Pending Verification', verified: 'Verified', rejected: 'Rejected', on_hold: 'On Hold' };
const LIST_FIELDS = '-verificationHistory';

// ---------- validation ----------
const GSTIN_RX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_RX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_RX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const PHONE_RX = /^[6-9][0-9]{9}$/;
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIN_RX = /^[1-9][0-9]{5}$/;

const str = (v, max = 200) => (v === undefined || v === null ? undefined : String(v).trim().slice(0, max));

// Accept the usual ways people type numbers: "+91 93000 00059", "093000-00059", "641 605", "33abcde 1234f1z5".
// Normalise first, validate after (never cut a value short before cleaning it).
export function normPhone(v) {
  if (v === undefined || v === null) return undefined;
  let d = String(v).replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}
export const compact = (v) => (v === undefined || v === null ? undefined : String(v).replace(/[\s.-]/g, '').toUpperCase());
const bad = (field, message) => new ApiError(400, message, { field });

// Picks and checks the editable fields. `partial` = only validate what was sent (edit).
function cleanBody(body = {}, { partial = false } = {}) {
  const out = {};
  const set = (k, v) => { if (v !== undefined) out[k] = v; };
  set('name', str(body.name, 120));
  set('companyName', str(body.companyName, 160));
  set('contactPerson', str(body.contactPerson, 120));
  set('phone', normPhone(body.phone));
  set('alternatePhone', normPhone(body.alternatePhone));
  set('email', str(body.email, 120)?.toLowerCase());
  set('address', str(body.address, 500));
  set('city', str(body.city, 80));
  set('state', str(body.state, 80));
  set('pincode', body.pincode === undefined || body.pincode === null ? undefined : String(body.pincode).replace(/\s+/g, ''));
  set('gstin', compact(body.gstin));
  set('pan', compact(body.pan));
  set('paymentTerms', str(body.paymentTerms, 40));
  if (body.creditLimit !== undefined && body.creditLimit !== '') out.creditLimit = number(body.creditLimit, 'Credit limit', { min: 0, max: 1e9 });
  if (body.status !== undefined) out.status = oneOf(body.status, ['active', 'inactive'], 'Status');
  if (body.bankDetails && typeof body.bankDetails === 'object') {
    const b = body.bankDetails;
    out.bankDetails = {
      accountName: str(b.accountName, 120) || '', accountNumber: compact(b.accountNumber) || '',
      ifsc: compact(b.ifsc) || '', bankName: str(b.bankName, 120) || '', branch: str(b.branch, 120) || '',
    };
  }

  // Each error names its field (details.field) so the form can show it under the right box.
  if (!partial || out.name !== undefined) { if (!out.name) throw bad('name', 'Vendor name is required.'); }
  // Mobile is optional (unless made mandatory in Settings > Mandatory Fields); when given it must be valid.
  if (out.phone && !PHONE_RX.test(out.phone)) throw bad('phone', 'Enter a valid 10-digit mobile number (starting with 6-9).');
  if (out.phone === '') out.phone = undefined;
  if (out.alternatePhone && !PHONE_RX.test(out.alternatePhone)) throw bad('alternatePhone', 'Alternate number must be a valid 10-digit mobile number.');
  if (out.email && !EMAIL_RX.test(out.email)) throw bad('email', 'Enter a valid email address.');
  if (out.pincode && !PIN_RX.test(out.pincode)) throw bad('pincode', 'PIN code must be 6 digits.');
  if (out.gstin && !GSTIN_RX.test(out.gstin)) throw bad('gstin', 'GSTIN must be 15 characters, e.g. 33ABCDE1234F1Z5.');
  if (out.pan && !PAN_RX.test(out.pan)) throw bad('pan', 'PAN must be 10 characters, e.g. ABCDE1234F.');
  if (out.gstin && out.pan && out.gstin.slice(2, 12) !== out.pan) throw bad('pan', 'PAN does not match the PAN inside the GSTIN (characters 3-12).');
  const bank = out.bankDetails;
  if (bank?.ifsc && !IFSC_RX.test(bank.ifsc)) throw bad('bankDetails.ifsc', 'IFSC must be 11 characters, e.g. SBIN0001234.');
  if (bank?.accountNumber && !/^[0-9]{9,18}$/.test(bank.accountNumber)) throw bad('bankDetails.accountNumber', 'Bank account number must be 9-18 digits.');
  return out;
}

// Fields whose change means the vendor must be checked again.
const KEY_FIELDS = ['name', 'gstin', 'pan'];
const BANK_FIELDS = ['accountNumber', 'ifsc', 'accountName'];

function addHistory(vendor, req, entry) {
  vendor.verificationHistory.push({ ...entry, by: req.user._id, byName: req.user.name || req.user.email, at: new Date() });
}

async function assertNoDuplicate({ gstin, pan, name }, exceptId) {
  const not = exceptId ? { _id: { $ne: exceptId } } : {};
  if (gstin && await Vendor.exists({ gstin, ...not })) throw new ApiError(409, `A vendor with GSTIN ${gstin} already exists.`, { field: 'gstin' });
  if (pan && await Vendor.exists({ pan, ...not })) throw new ApiError(409, `A vendor with PAN ${pan} already exists.`, { field: 'pan' });
  if (name && await Vendor.exists({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), ...not })) {
    throw new ApiError(409, `A vendor named "${name}" already exists.`, { field: 'name' });
  }
}

// ---------- list / read ----------
const SORTS = { name: 'name', createdAt: 'createdAt', updatedAt: 'updatedAt', verificationStatus: 'verificationStatus' };

export const list = catchAsync(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.verificationStatus) filter.verificationStatus = oneOf(String(req.query.verificationStatus), VERIFICATION_STATUSES, 'Verification status');
  if (req.query.status) filter.status = oneOf(String(req.query.status), ['active', 'inactive'], 'Status');
  if (req.query.search) {
    const rx = literalRegex(req.query.search);
    filter.$or = ['name', 'companyName', 'gstin', 'pan', 'phone', 'contactPerson', 'city'].map((f) => ({ [f]: rx }));
  }
  const sortKey = SORTS[req.query.sort] || 'createdAt';
  const dir = req.query.order === 'asc' ? 1 : -1;
  const [docs, total, counts] = await Promise.all([
    Vendor.find(filter).select(LIST_FIELDS).sort({ [sortKey]: dir, _id: dir }).collation({ locale: 'en' }).skip(skip).limit(limit),
    Vendor.countDocuments(filter),
    Vendor.aggregate([{ $group: { _id: '$verificationStatus', n: { $sum: 1 } } }]),
  ]);
  const summary = Object.fromEntries(VERIFICATION_STATUSES.map((s) => [s, 0]));
  counts.forEach((c) => { summary[c._id || 'pending'] = (summary[c._id || 'pending'] || 0) + c.n; });
  summary.all = Object.values(summary).reduce((a, b) => a + b, 0);
  res.json({ success: true, ...buildPaginatedResponse({ docs, total, page, limit }), summary });
});

// Dropdown lookups. `?verified=true` returns only verified, active vendors (POs, invoices, payments).
export const listAll = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.verified === 'true') Object.assign(filter, { verificationStatus: 'verified', status: { $ne: 'inactive' } });
  // Purchase entry: verified suppliers plus new ones awaiting verification (those orders stay drafts).
  if (req.query.forPurchase === 'true') Object.assign(filter, { verificationStatus: { $in: ['verified', 'pending', 'on_hold'] }, status: { $ne: 'inactive' } });
  if (req.query.status) filter.status = String(req.query.status);
  const docs = await Vendor.find(filter).select('name companyName gstin verificationStatus status').sort({ name: 1 }).collation({ locale: 'en' });
  res.json({ success: true, data: docs });
});

export const getOne = catchAsync(async (req, res) => {
  const vendor = await Vendor.findById(req.params.id).populate('verifiedBy', 'name');
  if (!vendor) throw new ApiError(404, 'Vendor not found.');
  res.json({ success: true, data: vendor });
});

// ---------- create / update / delete ----------
// Supplier entry from the purchase screen: only the name is needed (phone / GSTIN optional). A supplier
// that already exists (same GSTIN, mobile number or name) is re-used, so no duplicate vendor is created.
// New suppliers start as Pending Verification; orders with them stay drafts until an admin verifies them.
export const quickCreate = catchAsync(async (req, res) => {
  const name = str(req.body?.name, 120)?.replace(/\s+/g, ' ');
  if (!name) throw bad('name', 'Supplier name is required.');
  const phone = req.body?.phone ? normPhone(req.body.phone) : undefined;
  if (phone && !PHONE_RX.test(phone)) throw bad('phone', 'Enter a valid 10-digit mobile number (starting with 6-9).');
  const gstin = req.body?.gstin ? compact(req.body.gstin) : undefined;
  if (gstin && !GSTIN_RX.test(gstin)) throw bad('gstin', 'GSTIN must be 15 characters, e.g. 33ABCDE1234F1Z5.');
  await requireFields('vendor', { phone, gstin, address: str(req.body?.address, 500), city: str(req.body?.city, 80) }, { partial: true });

  const nameRx = new RegExp(`^${escapeRegex(name)}$`, 'i');
  const existing = (gstin && await Vendor.findOne({ gstin }))
    || (phone && await Vendor.findOne({ phone }))
    || await Vendor.findOne({ name: nameRx });
  if (existing) {
    return res.json({ success: true, data: existing, existing: true, message: `"${existing.name}" is already registered - using the existing supplier.` });
  }
  const vendor = new Vendor({
    name, phone, gstin, pan: gstin ? gstin.slice(2, 12) : undefined,
    address: str(req.body?.address, 500), city: str(req.body?.city, 80), verificationStatus: 'pending',
  });
  addHistory(vendor, req, { action: 'registered', toStatus: 'pending', remarks: 'Added during purchase entry - awaiting verification' });
  await vendor.save();
  await recordAudit({ req, action: 'vendor.create', entity: 'Vendor', entityId: vendor._id, newValue: { name: vendor.name, via: 'purchase entry' } });
  res.status(201).json({ success: true, data: vendor, existing: false });
});

// Configured mandatory supplier fields (all optional by default).
const vendorRuleValues = (b) => ({
  phone: b.phone, contactPerson: b.contactPerson, email: b.email, address: b.address, city: b.city, pincode: b.pincode,
  gstin: b.gstin, pan: b.pan, ...(b.bankDetails ? { bankAccount: b.bankDetails.accountNumber, ifsc: b.bankDetails.ifsc } : {}),
});

export const create = catchAsync(async (req, res) => {
  const body = cleanBody(req.body);
  await requireFields('vendor', vendorRuleValues(body));
  await assertNoDuplicate(body);
  const vendor = new Vendor({ ...body, verificationStatus: 'pending' });
  addHistory(vendor, req, { action: 'registered', toStatus: 'pending', remarks: 'Vendor registered - awaiting verification' });
  await vendor.save();
  await recordAudit({ req, action: 'vendor.create', entity: 'Vendor', entityId: vendor._id, newValue: { name: vendor.name, gstin: vendor.gstin } });
  res.status(201).json({ success: true, data: vendor });
});

export const update = catchAsync(async (req, res) => {
  const vendor = await Vendor.findById(req.params.id);
  if (!vendor) throw new ApiError(404, 'Vendor not found.');
  const body = cleanBody(req.body, { partial: true });
  await requireFields('vendor', Object.fromEntries(Object.entries(vendorRuleValues(body)).filter(([, v]) => v !== undefined || false)), { partial: true });
  await assertNoDuplicate({ gstin: body.gstin, pan: body.pan, name: body.name }, vendor._id);
  const merged = { gstin: body.gstin ?? vendor.gstin, pan: body.pan ?? vendor.pan };
  if (merged.gstin && merged.pan && merged.gstin.slice(2, 12) !== merged.pan) throw bad('pan', 'PAN does not match the PAN inside the GSTIN (characters 3-12).');

  const changed = KEY_FIELDS.filter((k) => body[k] !== undefined && (body[k] || '') !== (vendor[k] || ''))
    .concat(BANK_FIELDS.filter((k) => body.bankDetails && (body.bankDetails[k] || '') !== (vendor.bankDetails?.[k] || '')).map((k) => `bank ${k}`));
  const before = vendor.verificationStatus;
  Object.assign(vendor, body);
  if (body.bankDetails) vendor.bankDetails = body.bankDetails;

  // Verified or rejected vendors whose key details change go back to the verification queue.
  if (changed.length && ['verified', 'rejected'].includes(before)) {
    vendor.verificationStatus = 'pending';
    vendor.verifiedAt = undefined;
    vendor.verifiedBy = undefined;
    addHistory(vendor, req, { action: 'status_changed', fromStatus: before, toStatus: 'pending', remarks: `Details changed (${changed.join(', ')}) - re-verification needed` });
  } else {
    addHistory(vendor, req, { action: 'details_updated', remarks: changed.length ? `Changed: ${changed.join(', ')}` : 'Details updated' });
  }
  await vendor.save();
  await recordAudit({ req, action: 'vendor.update', entity: 'Vendor', entityId: vendor._id, newValue: { changed, verificationStatus: vendor.verificationStatus } });
  res.json({ success: true, data: vendor });
});

export const remove = catchAsync(async (req, res) => {
  const vendor = await Vendor.findById(req.params.id);
  if (!vendor) throw new ApiError(404, 'Vendor not found.');
  const used = await Purchase.exists({ vendor: vendor._id }) || await PurchaseInvoice.exists({ vendor: vendor._id });
  if (used) {
    // Has history: keep it (documents reference it) but take it out of use.
    vendor.status = 'inactive';
    addHistory(vendor, req, { action: 'details_updated', remarks: 'Marked inactive (has purchase history, cannot be deleted)' });
    await vendor.save();
    return res.json({ success: true, message: 'Vendor has purchase history, so it was marked inactive instead of deleted.', data: vendor });
  }
  await VendorDocument.deleteMany({ vendor: vendor._id });
  await vendor.deleteOne();
  await recordAudit({ req, action: 'vendor.delete', entity: 'Vendor', entityId: vendor._id, oldValue: { name: vendor.name } });
  res.json({ success: true, message: 'Vendor deleted.' });
});

// ---------- documents ----------
const DOC_MIME = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
export const MAX_DOC_MB = 5;
export const docUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOC_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!DOC_MIME[ext]) return cb(new ApiError(400, 'Upload a PDF, JPG, PNG or WEBP file.'));
    cb(null, true);
  },
}).single('file');

const looksLike = (buf, mime) => {
  if (mime === 'application/pdf') return buf.slice(0, 4).toString() === '%PDF';
  if (mime === 'image/png') return buf[0] === 0x89 && buf.slice(1, 4).toString() === 'PNG';
  if (mime === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8;
  if (mime === 'image/webp') return buf.slice(8, 12).toString() === 'WEBP';
  return false;
};

export const uploadDocument = catchAsync(async (req, res) => {
  const vendor = await Vendor.findById(req.params.id);
  if (!vendor) throw new ApiError(404, 'Vendor not found.');
  const docType = oneOf(String(req.body.docType || ''), Object.keys(DOC_TYPES), 'Document type');
  if (!req.file) throw new ApiError(400, 'Choose a file to upload.');
  const mimeType = DOC_MIME[path.extname(req.file.originalname).toLowerCase()];
  if (!looksLike(req.file.buffer, mimeType)) throw new ApiError(400, 'The file content does not match its type. Upload the original PDF or image.');

  const fileName = path.basename(req.file.originalname).replace(/[^\w.\- ()]/g, '_').slice(0, 120);
  const stored = await VendorDocument.create({ vendor: vendor._id, docType, fileName, mimeType, size: req.file.size, data: req.file.buffer });
  // One file per document type: a new upload replaces the old one.
  const old = vendor.documents.filter((d) => d.docType === docType);
  vendor.documents = vendor.documents.filter((d) => d.docType !== docType);
  vendor.documents.push({ docType, file: stored._id, fileName, mimeType, size: req.file.size, uploadedBy: req.user._id });
  const before = vendor.verificationStatus;
  if (before === 'verified' && old.length && REQUIRED_DOCS.includes(docType)) {
    vendor.verificationStatus = 'pending';
    vendor.verifiedAt = undefined;
    addHistory(vendor, req, { action: 'status_changed', fromStatus: before, toStatus: 'pending', remarks: `${DOC_TYPES[docType]} replaced - re-verification needed` });
  }
  addHistory(vendor, req, { action: 'document_uploaded', remarks: `${DOC_TYPES[docType]}: ${fileName}${old.length ? ' (replaced earlier file)' : ''}` });
  await vendor.save();
  if (old.length) await VendorDocument.deleteMany({ _id: { $in: old.map((d) => d.file) } });
  res.status(201).json({ success: true, data: vendor });
});

export const downloadDocument = catchAsync(async (req, res) => {
  const vendor = await Vendor.findById(req.params.id).select('documents');
  const meta = vendor?.documents.id(req.params.docId);
  if (!meta) throw new ApiError(404, 'Document not found.');
  const file = await VendorDocument.findById(meta.file);
  if (!file) throw new ApiError(404, 'Document file is missing.');
  res.set({
    'Content-Type': file.mimeType,
    'Content-Disposition': `inline; filename="${(file.fileName || 'document').replace(/"/g, '')}"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(file.data);
});

export const deleteDocument = catchAsync(async (req, res) => {
  const vendor = await Vendor.findById(req.params.id);
  const meta = vendor?.documents.id(req.params.docId);
  if (!meta) throw new ApiError(404, 'Document not found.');
  const before = vendor.verificationStatus;
  vendor.documents.pull(meta._id);
  if (before === 'verified' && REQUIRED_DOCS.includes(meta.docType)) {
    vendor.verificationStatus = 'pending';
    vendor.verifiedAt = undefined;
    addHistory(vendor, req, { action: 'status_changed', fromStatus: before, toStatus: 'pending', remarks: `${DOC_TYPES[meta.docType]} removed - re-verification needed` });
  }
  addHistory(vendor, req, { action: 'document_removed', remarks: `${DOC_TYPES[meta.docType]}: ${meta.fileName}` });
  await vendor.save();
  await VendorDocument.deleteOne({ _id: meta.file });
  res.json({ success: true, data: vendor });
});

// ---------- verification ----------
// What must be in place before a vendor can be verified.
// What is needed before a supplier can be marked Verified: the name, plus whatever an administrator made
// mandatory in Settings > Mandatory Fields (Supplier verification). Everything else is shown as optional.
export function verificationChecklist(v, rules = {}) {
  const has = (t) => v.documents.some((d) => d.docType === t);
  const opt = (k) => !rules[k];
  const lab = (l, k) => `${l}${opt(k) ? ' (optional)' : ''}`;
  return [
    { key: 'name', label: 'Vendor name', ok: !!v.name },
    { key: 'contact', label: lab('Contact number', 'phone'), ok: !!v.phone, optional: opt('phone') },
    { key: 'address', label: lab('Address', 'address'), ok: !!v.address, optional: opt('address') },
    { key: 'gstin', label: lab('GSTIN', 'gstin'), ok: !!v.gstin, optional: opt('gstin') },
    { key: 'pan', label: lab('PAN number', 'pan'), ok: !!v.pan, optional: opt('pan') },
    { key: 'bank', label: lab('Bank account & IFSC', 'bank'), ok: !!(v.bankDetails?.accountNumber && v.bankDetails?.ifsc), optional: opt('bank') },
    ...Object.keys(DOC_TYPES).map((t) => {
      const optional = !REQUIRED_DOCS.includes(t);
      return { key: t, label: `${DOC_TYPES[t]}${optional ? ' (optional)' : ''}`, ok: has(t), optional };
    }),
  ];
}

export const checklist = catchAsync(async (req, res) => {
  const vendor = await Vendor.findById(req.params.id).select('name phone address gstin pan bankDetails documents');
  if (!vendor) throw new ApiError(404, 'Vendor not found.');
  res.json({ success: true, data: verificationChecklist(vendor, (await getFieldRules()).vendorVerification) });
});

export const verify = catchAsync(async (req, res) => {
  const status = oneOf(String(req.body.status || ''), VERIFICATION_STATUSES, 'Verification status');
  const remarks = str(req.body.remarks, 500) || '';
  const vendor = await Vendor.findById(req.params.id);
  if (!vendor) throw new ApiError(404, 'Vendor not found.');
  const before = vendor.verificationStatus;
  if (before === status) throw new ApiError(400, `Vendor is already ${STATUS_LABEL[status]}.`);
  const vrules = (await getFieldRules()).vendorVerification;
  if (status !== 'verified' && !remarks && vrules.remarks) throw new ApiError(400, `Give a remark for marking the vendor ${STATUS_LABEL[status]}.`);
  if (status === 'verified') {
    const missing = verificationChecklist(vendor, vrules).filter((c) => !c.ok && !c.optional).map((c) => c.label);
    if (missing.length) throw new ApiError(400, `Cannot verify yet - missing: ${missing.join(', ')}.`);
    vendor.verifiedAt = new Date();
    vendor.verifiedBy = req.user._id;
  } else {
    vendor.verifiedAt = undefined;
    vendor.verifiedBy = undefined;
  }
  vendor.verificationStatus = status;
  vendor.lastRemarks = remarks || undefined;
  addHistory(vendor, req, { action: 'status_changed', fromStatus: before, toStatus: status, remarks: remarks || 'All details and documents checked' });
  await vendor.save();
  await recordAudit({ req, action: `vendor.${status === 'verified' ? 'approve' : status}`, entity: 'Vendor', entityId: vendor._id, oldValue: { verificationStatus: before }, newValue: { verificationStatus: status, remarks } });
  res.json({ success: true, data: vendor });
});

// ---------- dashboard ----------
export const vendorDashboard = catchAsync(async (req, res) => {
  const vendor = await Vendor.findById(req.params.id).select(LIST_FIELDS);
  if (!vendor) throw new ApiError(404, 'Vendor not found.');
  const purchases = await Purchase.find({ vendor: vendor._id });
  const totalPurchases = purchases.reduce((s, p) => s + (p.grandTotal || 0), 0);
  const paidAmount = purchases.reduce((s, p) => s + (p.amountPaid || 0), 0);
  // Owed = what has been invoiced (orders from before purchase invoices count in full), less payments.
  const outstanding = purchases.filter((p) => !['draft', 'cancelled'].includes(p.status)).reduce((s, p) => s + billedAmount(p), 0) - paidAmount;
  res.json({
    success: true,
    data: {
      vendor, totalPurchases, paidAmount, outstandingAmount: outstanding, purchaseCount: purchases.length,
      recentPurchases: purchases.sort((a, b) => b.createdAt - a.createdAt).slice(0, 10),
    },
  });
});

export const vendorController = {
  list, listAll, getOne, create, quickCreate, update, remove, uploadDocument, downloadDocument, deleteDocument, checklist, verify, vendorDashboard,
};
export default vendorController;
