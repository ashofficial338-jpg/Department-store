import { Router } from 'express';
import multer from 'multer';
import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { ensureBackupDir } from '../services/dbTransfer.js';
import {
  status, runs, run, backups, restore, createBackup, downloadBackup, uploadBackup,
} from '../controllers/databaseController.js';

// Database status, backups and restore from a backup file: administrators only.
const router = Router();
router.use(protect, adminOnly);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      if (env.isServerless) return cb(new ApiError(400, 'Backup files can only be imported when the server runs on your own computer.'));
      cb(null, ensureBackupDir());
    },
    filename: (req, file, cb) => cb(null, `import-${Date.now()}.jsonl.gz`),
  }),
  fileFilter: (req, file, cb) => (/\.jsonl\.gz$/i.test(file.originalname) ? cb(null, true) : cb(new ApiError(400, 'Only .jsonl.gz backup files can be imported.'))),
  limits: { fileSize: 1024 * 1024 * 1024 },
});

router.get('/status', status);
router.get('/runs', runs);
router.get('/runs/:id', run);
router.get('/backups', backups);
router.post('/backups', createBackup);
router.post('/backups/upload', upload.single('file'), uploadBackup);
router.get('/backups/:name/download', downloadBackup);
router.post('/restore', restore);

export default router;
