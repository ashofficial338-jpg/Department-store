import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { put } from '@vercel/blob';
import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';

// On Vercel the filesystem is read-only, so images go to Vercel Blob when a
// BLOB_READ_WRITE_TOKEN is configured; locally they are written to UPLOAD_DIR.
const useBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

const uniqueName = (file) => `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;

let storage;
if (useBlob) {
  storage = multer.memoryStorage();
} else {
  const uploadPath = path.resolve(env.uploadDir);
  if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
  storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadPath),
    filename: (req, file, cb) => cb(null, uniqueName(file)),
  });
}

const ALLOWED = ['.jpg', '.jpeg', '.png', '.webp'];

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED.includes(ext)) {
    return cb(new ApiError(400, 'Only JPG, PNG, and WEBP images are allowed.'));
  }
  cb(null, true);
}

const multerUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: env.maxUploadMb * 1024 * 1024 },
});

// Sets `file.url` on every uploaded file, whichever storage backend is in use.
async function finalize(req, res, next) {
  try {
    const files = req.files || (req.file ? [req.file] : []);
    for (const file of files) {
      if (useBlob) {
        const blob = await put(`uploads/${uniqueName(file)}`, file.buffer, {
          access: 'public',
          contentType: file.mimetype,
        });
        file.url = blob.url;
      } else {
        file.url = `/uploads/${file.filename}`;
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}

export const upload = {
  array: (field, max) => [multerUpload.array(field, max), finalize],
  single: (field) => [multerUpload.single(field), finalize],
};

export default upload;
