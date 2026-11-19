// Clear all data, keep the admin login and setup.
//   node seed/clearKeepAdmin.js                          -> dry run: shows what would be deleted
//   node seed/clearKeepAdmin.js --apply                  -> full backup to server/backups first, then deletes
//   add --keep-products                                  -> also keep the product NAME list (Product Master);
//                                                           GST %, prices, images, category/brand/vendor links reset
// Kept: admin / super-admin users, System Settings, role permissions, tax rates, the store and DC setup,
// report templates and database job history. Everything else (sales, purchase orders, purchase invoices,
// returns, DCs, stock, vendors, customers, ledgers, logs, other users... and products unless --keep-products)
// is deleted. Restore from Settings > Database Backup if needed.
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { backupAllNow } from '../services/dbTransfer.js';
import { FULL_ACCESS_ROLES } from '../config/permissions.js';

const KEEP = new Set(['settings', 'rolepermissions', 'taxrates', 'stores', 'distributioncenters', 'migrationruns', 'reporttemplates']);
const ADMIN_FILTER = { $or: [{ isAdmin: true }, { role: { $in: FULL_ACCESS_ROLES } }] };
// Values wiped from kept products: only the name (and its SKU / status) remains.
const PRODUCT_RESET = {
  $set: { gstRate: 0, purchasePrice: 0, sellingPrice: 0, mrp: 0, discountPercent: 0, images: [] },
  $unset: { taxRate: '', category: '', subcategory: '', brand: '', primarySupplier: '', primaryVendor: '', hsn: '', description: '', barcode: '' },
};

async function run() {
  const apply = process.argv.includes('--apply');
  const keepProducts = process.argv.includes('--keep-products');
  await connectDB();
  const { db } = mongoose.connection;
  const users = db.collection('users');
  const admins = await users.find(ADMIN_FILTER).project({ email: 1, role: 1 }).toArray();
  if (!admins.length) throw new Error('No admin user found - refusing to clear (you would be locked out). Run npm run seed:admin first.');
  console.log(`Admins kept: ${admins.map((a) => `${a.email} (${a.role})`).join(', ')}`);

  const names = (await db.listCollections().toArray()).map((c) => c.name).filter((n) => !n.startsWith('system.') && !KEEP.has(n)).sort();
  if (apply) {
    const backup = await backupAllNow(keepProducts ? 'before-clear-keep-products' : 'before-clear-all-keep-admin');
    console.log(`Backup written: backups/${backup.name} (${backup.documents} documents)`);
  }
  for (const name of names) {
    if (name === 'products' && keepProducts) {
      const products = db.collection('products');
      const gone = await products.countDocuments({ status: 'discontinued' });
      const kept = await products.countDocuments({ status: { $ne: 'discontinued' } });
      if (apply) {
        await products.deleteMany({ status: 'discontinued' });
        await products.updateMany({}, PRODUCT_RESET);
      }
      console.log(`${apply ? 'kept    ' : 'would keep'} products${' '.repeat(16)} ${kept} names (GST %/prices reset to 0; ${gone} deleted products removed)`);
      continue;
    }
    const filter = name === 'users' ? { $nor: [ADMIN_FILTER] } : {};
    const count = await db.collection(name).countDocuments(filter);
    if (apply && count) await db.collection(name).deleteMany(filter);
    console.log(`${apply ? 'cleared' : 'would clear'} ${name.padEnd(24)} ${count}`);
  }
  console.log(apply ? 'Done.' : 'Dry run only - add --apply to delete.');
}

run()
  .catch((err) => { console.error(err.message); process.exitCode = 1; })
  .finally(() => mongoose.connection.close());
