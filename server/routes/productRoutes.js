import { Router } from 'express';
import {
  listProducts, getProduct, createProduct, updateProduct, deleteProduct,
  uploadProductImages, setPrimaryImage, deleteProductImage, extractFromImage,
} from '../controllers/productController.js';
import { exportProducts, importTemplate, importProducts, importUpload } from '../controllers/productTransferController.js';
import { protect, adminOnly, requirePermission, requirePermissionForWrites } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = Router();
// Product information is readable by every signed-in user (POS, pickers); changes need the products module.
router.use(protect, requirePermissionForWrites('products'));

router.get('/', listProducts);
// Import / export - declared before '/:id' so the paths aren't read as product ids.
router.get('/export', requirePermission('products', 'reports'), exportProducts);
router.get('/import/template', requirePermission('products'), importTemplate);
router.post('/import', importUpload, importProducts);
router.get('/:id', getProduct);
router.post('/', createProduct);
router.put('/:id', adminOnly, updateProduct);
router.delete('/:id', adminOnly, deleteProduct);

router.post('/:id/images', upload.array('images', 8), uploadProductImages);
router.put('/:id/images/:imageId/primary', adminOnly, setPrimaryImage);
router.delete('/:id/images/:imageId', adminOnly, deleteProductImage);

router.post('/ai/extract-from-image', upload.single('image'), extractFromImage);

export default router;
