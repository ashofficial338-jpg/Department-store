// Same rules as the server (server/controllers/vendorController.js), checked before saving so a bad
// value is shown under its field instead of failing the request.

export function normPhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}
export const compact = (v) => String(v || '').replace(/[\s.-]/g, '').toUpperCase();

const GSTIN_RX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_RX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_RX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const PHONE_RX = /^[6-9][0-9]{9}$/;
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIN_RX = /^[1-9][0-9]{5}$/;

// Returns { field: message } for every problem (empty object = OK). Bank fields use 'bankDetails.x'.
export function validateVendor(f) {
  const e = {};
  const phone = normPhone(f.phone);
  const alt = normPhone(f.alternatePhone);
  const gstin = compact(f.gstin);
  const pan = compact(f.pan);
  const pin = String(f.pincode || '').replace(/\s+/g, '');
  const acct = compact(f.bankDetails?.accountNumber);
  const ifsc = compact(f.bankDetails?.ifsc);

  if (!String(f.name || '').trim()) e.name = 'Vendor name is required.';
  if (!PHONE_RX.test(phone)) e.phone = 'Enter a valid 10-digit mobile number (starting with 6-9).';
  if (alt && !PHONE_RX.test(alt)) e.alternatePhone = 'Enter a valid 10-digit mobile number.';
  if (f.email && !EMAIL_RX.test(String(f.email).trim())) e.email = 'Enter a valid email address.';
  if (pin && !PIN_RX.test(pin)) e.pincode = 'PIN code must be 6 digits.';
  if (gstin && !GSTIN_RX.test(gstin)) e.gstin = 'GSTIN must be 15 characters, e.g. 33ABCDE1234F1Z5.';
  if (pan && !PAN_RX.test(pan)) e.pan = 'PAN must be 10 characters, e.g. ABCDE1234F.';
  else if (gstin && pan && GSTIN_RX.test(gstin) && gstin.slice(2, 12) !== pan) e.pan = 'PAN does not match the PAN inside the GSTIN (characters 3–12).';
  if (acct && !/^[0-9]{9,18}$/.test(acct)) e['bankDetails.accountNumber'] = 'Account number must be 9–18 digits.';
  if (ifsc && !IFSC_RX.test(ifsc)) e['bankDetails.ifsc'] = 'IFSC must be 11 characters, e.g. SBIN0001234.';
  if (f.creditLimit !== '' && f.creditLimit !== undefined && !(Number(f.creditLimit) >= 0)) e.creditLimit = 'Credit limit cannot be negative.';
  return e;
}
