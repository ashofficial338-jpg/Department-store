import { Router } from 'express';
import {
  createPurchase, listPurchases, getPurchase, approvePurchase, receiveGoods, payVendor,
  updatePurchase, cancelPurchase, quickProduct, quickBrand,
  createPurchaseInvoice, listPurchaseInvoices, getPurchaseInvoice, payPurchaseInvoice,
  createPurchaseReturn, listPurchaseReturns, getPurchaseReturn,
} from '../controllers/purchaseController.js';
import { protect, requirePermission, adminOnly } from '../middleware/auth.js';

const router = Router();
router.use(protect);

// Vendor payments are also made from Finance > Payables.
router.post('/:id/pay', requirePermission('purchasing', 'finance'), payVendor);
router.post('/invoices/:id/pay', requirePermission('purchasing', 'finance'), payPurchaseInvoice);
// DC staff pick the purchase invoice / return an Inward or Outward DC is raised against.
router.get('/invoices', requirePermission('purchasing', 'dc'), listPurchaseInvoices);
router.get('/invoices/:id', requirePermission('purchasing', 'dc'), getPurchaseInvoice);
router.get('/returns', requirePermission('purchasing', 'dc'), listPurchaseReturns);
router.get('/returns/:id', requirePermission('purchasing', 'dc'), getPurchaseReturn);
router.use(requirePermission('purchasing'));

router.post('/invoices', createPurchaseInvoice);
router.post('/returns', createPurchaseReturn);
router.get('/', listPurchases);
router.get('/:id', getPurchase);
router.post('/', createPurchase);
// Quick entry from the purchase screen (find-or-create: existing names are re-used, never duplicated).
router.post('/quick/product', quickProduct);
router.post('/quick/brand', quickBrand);
router.post('/:id/approve', approvePurchase);
// Changing or cancelling an existing order is for administrators; other users send an Edit Request.
router.put('/:id', adminOnly, updatePurchase);
router.delete('/:id', adminOnly, cancelPurchase);
router.post('/:id/receive', receiveGoods); // retired: answers with a pointer to Inward DC

export default router;
