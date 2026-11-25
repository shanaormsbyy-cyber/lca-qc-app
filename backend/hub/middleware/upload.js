const multer = require('multer');
const path = require('path');
const fs = require('fs');

const MAX_BYTES = 50 * 1024 * 1024;

function allowedMime(mime) {
  return mime.startsWith('image/')
    || mime.startsWith('video/')
    || mime === 'application/pdf'
    || mime === 'text/plain'
    || mime === 'application/msword'
    || mime === 'application/vnd.ms-excel'
    || mime === 'application/vnd.ms-powerpoint'
    || mime.startsWith('application/vnd.openxmlformats-officedocument.');
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function makeUpload(uploadsDir) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => { fs.mkdirSync(uploadsDir, { recursive: true }); cb(null, uploadsDir); },
    filename: (req, file, cb) => {
      const safe = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`);
    },
  });
  return multer({
    storage,
    limits: { fileSize: MAX_BYTES },
    fileFilter: (req, file, cb) => {
      if (allowedMime(file.mimetype || '')) cb(null, true);
      else cb(httpError(400, 'File type not allowed'));
    },
  });
}

// Wrap a multer handler so its errors become JSON HTTP errors and partial files are removed.
function handleUpload(multerHandler) {
  return (req, res, next) => {
    multerHandler(req, res, (err) => {
      if (!err) return next();
      cleanupFiles(req);
      if (err.code === 'LIMIT_FILE_SIZE') return next(httpError(413, 'File too large (max 50MB)'));
      if (err.status) return next(err);
      return next(httpError(400, err.message || 'Upload failed'));
    });
  };
}

function uploadedFiles(req) {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  if (req.files && typeof req.files === 'object') return Object.values(req.files).flat();
  return [];
}

function cleanupFiles(req) {
  for (const f of uploadedFiles(req)) { try { fs.unlinkSync(f.path); } catch (_) {} }
}

module.exports = { makeUpload, handleUpload, cleanupFiles, uploadedFiles, httpError, MAX_BYTES };
