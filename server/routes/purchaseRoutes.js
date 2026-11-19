import { Router } from 'express';
import {
  createPurchase, listPurchases, getPurchase, approvePurchase, receiveGoods, payVendor,
  createPurchaseInvoice, listPurchaseInvoices, getPurchaseInvoice,
  createPurchaseReturn, listPurchaseReturns, getPurchaseReturn,
} from '../controllers/purchaseController.js';
import { protect, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(protect);

// Vendor payments are also made from Finance > Payables.
router.post('/:id/pay', requirePermission('purchasing', 'finance'), payVendor);
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
router.post('/:id/approve', approvePurchase);
router.post('/:id/receive', receiveGoods); // retired: answers with a pointer to Inward DC

export default router;
