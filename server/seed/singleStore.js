// One-time conversion to a SINGLE department store with ONE central stock.
//
//   node seed/singleStore.js --store=ST01 --keep-dc=DC02            (dry run: prints what would change)
//   node seed/singleStore.js --store=ST01 --keep-dc=DC02 --apply    (backs up, then changes the data)
//
// What --apply does:
//   1. Full database backup to server/backups (restorable from Settings > Database).
//   2. For every product, adds the stock held at every other store / distribution center into the main
//      store's Inventory row (current, reserved, damaged, returned, in-transit and opening stock), then
//      removes the now-merged per-location rows. Total stock per product is unchanged.
//   3. Moves batches onto the main store.
//   4. Marks every other store inactive, and every distribution center except --keep-dc inactive.
//      Nothing is deleted, so old documents still show their store / DC. The kept DC is only a receiving
//      point for the Inward DC screen - its stock is booked on the central stock.
//   5. Users assigned to another store are assigned to the main store.
// Products, sales, purchases, customers and transactions are not touched. Safe to run again.
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { backupAllNow } from '../services/dbTransfer.js';

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const APPLY = process.argv.includes('--apply');
const STORE_CODE = arg('store');
const KEEP_DC = arg('keep-dc');
const FIELDS = ['currentStock', 'reservedStock', 'damagedStock', 'returnedStock', 'inTransitStock', 'openingStock'];

async function run() {
  if (!STORE_CODE) throw new Error('Pass --store=<code> of the store to keep, e.g. --store=ST01');
  await connectDB();
  const { db } = mongoose.connection;
  const stores = db.collection('stores');
  const dcs = db.collection('distributioncenters');
  const inventories = db.collection('inventories');

  const main = await stores.findOne({ code: STORE_CODE });
  if (!main) throw new Error(`No store with code ${STORE_CODE}.`);
  const keepDc = KEEP_DC ? await dcs.findOne({ code: KEEP_DC }) : null;
  if (KEEP_DC && !keepDc) throw new Error(`No distribution center with code ${KEEP_DC}.`);
  console.log(`Main store: ${main.name} (${main.code})${keepDc ? ` | receiving DC kept active: ${keepDc.name} (${keepDc.code})` : ''}`);

  // ---- plan ----
  const totalsBefore = await inventories.aggregate([{ $group: { _id: null, ...Object.fromEntries(FIELDS.map((f) => [f, { $sum: `$${f}` }])) } }]).next();
  const perProduct = await inventories.aggregate([
    { $group: { _id: '$product', rows: { $push: { _id: '$_id', store: '$store' } }, ...Object.fromEntries(FIELDS.map((f) => [f, { $sum: { $ifNull: [`$${f}`, 0] } }])) } },
  ]).toArray();
  const toMerge = perProduct.filter((p) => p.rows.length > 1 || String(p.rows[0].store) !== String(main._id));
  const moved = await inventories.aggregate([
    { $match: { $or: [{ store: { $ne: main._id } }, { store: null }], currentStock: { $ne: 0 } } },
    { $group: { _id: null, units: { $sum: '$currentStock' }, rows: { $sum: 1 } } },
  ]).next();
  const otherStores = await stores.find({ _id: { $ne: main._id }, isActive: { $ne: false } }).project({ name: 1, code: 1 }).toArray();
  const otherDcs = await dcs.find({ ...(keepDc ? { _id: { $ne: keepDc._id } } : {}), status: { $ne: 'inactive' } }).project({ name: 1, code: 1 }).toArray();
  const batches = await db.collection('batches').countDocuments({ $or: [{ store: { $ne: main._id } }, { distributionCenter: { $ne: null } }] });
  const users = await db.collection('users').countDocuments({ store: { $nin: [null, main._id] } });

  console.log(`Products to consolidate: ${toMerge.length} (of ${perProduct.length}); stock units moving to ${main.code}: ${moved?.units || 0} from ${moved?.rows || 0} row(s)`);
  console.log(`Stores to deactivate: ${otherStores.map((s) => `${s.name} (${s.code})`).join(', ') || 'none'}`);
  console.log(`DCs to deactivate: ${otherDcs.map((d) => `${d.name} (${d.code})`).join(', ') || 'none'}`);
  console.log(`Batches to move: ${batches}; users to reassign: ${users}`);
  if (!APPLY) { console.log('\nDry run only - nothing changed. Re-run with --apply.'); return; }

  // ---- apply ----
  const backup = await backupAllNow('before-single-store');
  console.log(`Backup written: backups/${backup.name} (${backup.documents} documents)`);

  for (const p of toMerge) {
    const sums = Object.fromEntries(FIELDS.map((f) => [f, p[f] || 0]));
    const keep = p.rows.find((r) => String(r.store) === String(main._id));
    let keepId = keep?._id;
    if (keepId) await inventories.updateOne({ _id: keepId }, { $set: { ...sums, updatedAt: new Date() }, $unset: { distributionCenter: '' } });
    else keepId = (await inventories.insertOne({ product: p._id, store: main._id, ...sums, createdAt: new Date(), updatedAt: new Date(), __v: 0 })).insertedId;
    await inventories.deleteMany({ product: p._id, _id: { $ne: keepId } });
  }
  await db.collection('batches').updateMany({ $or: [{ store: { $ne: main._id } }, { distributionCenter: { $ne: null } }] }, { $set: { store: main._id }, $unset: { distributionCenter: '' } });
  await stores.updateOne({ _id: main._id }, { $set: { isActive: true } });
  await stores.updateMany({ _id: { $ne: main._id } }, { $set: { isActive: false } });
  await dcs.updateMany(keepDc ? { _id: { $ne: keepDc._id } } : {}, { $set: { status: 'inactive' } });
  if (keepDc) await dcs.updateOne({ _id: keepDc._id }, { $set: { status: 'active' } });
  await db.collection('users').updateMany({ store: { $nin: [null, main._id] } }, { $set: { store: main._id } });

  // ---- verify ----
  const totalsAfter = await inventories.aggregate([{ $group: { _id: null, ...Object.fromEntries(FIELDS.map((f) => [f, { $sum: `$${f}` }])) } }]).next();
  const dupes = await inventories.aggregate([{ $group: { _id: '$product', n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }, { $count: 'n' }]).next();
  const elsewhere = await inventories.countDocuments({ store: { $ne: main._id } });
  for (const f of FIELDS) {
    if ((totalsBefore?.[f] || 0) !== (totalsAfter?.[f] || 0)) throw new Error(`${f} total changed: ${totalsBefore?.[f]} -> ${totalsAfter?.[f]}. Restore backups/${backup.name}.`);
  }
  if (dupes?.n || elsewhere) throw new Error(`Consolidation incomplete (${dupes?.n || 0} duplicated products, ${elsewhere} rows elsewhere). Restore backups/${backup.name}.`);
  console.log(`Done. Stock totals unchanged (current stock ${totalsAfter?.currentStock || 0}); one central Inventory row per product at ${main.name}.`);
}

run()
  .catch((err) => { console.error(`[single-store] ${err.message}`); process.exitCode = 1; })
  .finally(() => mongoose.connection.close());
