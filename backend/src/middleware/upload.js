const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

// Where uploaded files live. Resolved once here so the esbuild bundle (which
// collapses __dirname into dist/) and `node src/server.js` agree.
const UPLOAD_ROOT = path.resolve(process.cwd(), process.env.UPLOAD_DIR || './uploads');

const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true });
ensureDir(UPLOAD_ROOT);

// Every accepted MIME type, mapped onto the attachment_kind enum. The README
// asks for images, PDF, DOC/DOCX and audio.
const MIME_KIND = {
    'image/jpeg': 'IMAGE',
    'image/jpg': 'IMAGE',
    'image/png': 'IMAGE',
    'image/webp': 'IMAGE',
    'image/heic': 'IMAGE',
    'image/heif': 'IMAGE',
    'application/pdf': 'PDF',
    'application/msword': 'DOC',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOC',
    'application/vnd.oasis.opendocument.text': 'DOC',
    'text/plain': 'DOC',
    'audio/mpeg': 'AUDIO',
    'audio/mp3': 'AUDIO',
    'audio/mp4': 'AUDIO',
    'audio/m4a': 'AUDIO',
    'audio/x-m4a': 'AUDIO',
    'audio/aac': 'AUDIO',
    'audio/wav': 'AUDIO',
    'audio/x-wav': 'AUDIO',
    'audio/webm': 'AUDIO',
    'audio/ogg': 'AUDIO',
    'audio/aiff': 'AUDIO',
    'audio/x-aiff': 'AUDIO',
    'audio/amr': 'AUDIO',
    'audio/3gpp': 'AUDIO',
};

// Some Android recorders send octet-stream; fall back to the extension.
const EXT_KIND = {
    '.jpg': 'IMAGE', '.jpeg': 'IMAGE', '.png': 'IMAGE', '.webp': 'IMAGE', '.heic': 'IMAGE',
    '.pdf': 'PDF',
    '.doc': 'DOC', '.docx': 'DOC', '.odt': 'DOC', '.txt': 'DOC',
    '.mp3': 'AUDIO', '.m4a': 'AUDIO', '.aac': 'AUDIO', '.wav': 'AUDIO',
    '.ogg': 'AUDIO', '.aiff': 'AUDIO', '.aif': 'AUDIO', '.amr': 'AUDIO', '.3gp': 'AUDIO',
};

const kindFor = (mimetype, originalname) =>
    MIME_KIND[mimetype] || EXT_KIND[path.extname(originalname || '').toLowerCase()] || null;

const storage = multer.diskStorage({
    destination: (req, _file, cb) => {
        // Bucket per user so one user's files can never be enumerated from
        // another's directory listing.
        const dir = path.join(UPLOAD_ROOT, req.userId);
        try {
            ensureDir(dir);
            cb(null, dir);
        } catch (err) {
            cb(err);
        }
    },
    filename: (_req, file, cb) => {
        // Never trust the client's filename on disk — it's kept in the DB for
        // display, but the stored name is a random uuid.
        const ext = path.extname(file.originalname || '').toLowerCase().slice(0, 10);
        cb(null, `${crypto.randomUUID()}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: {
        fileSize: (parseInt(process.env.MAX_UPLOAD_MB, 10) || 50) * 1024 * 1024,
        files: 10,
    },
    fileFilter: (_req, file, cb) => {
        if (!kindFor(file.mimetype, file.originalname)) {
            return cb(new Error(`Unsupported file type: ${file.mimetype || path.extname(file.originalname)}`));
        }
        return cb(null, true);
    },
});

// APK upload for the admin's app-release flow.
const apkUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 300 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (!file.originalname.toLowerCase().endsWith('.apk')) {
            return cb(new Error('Only .apk files are accepted'));
        }
        return cb(null, true);
    },
});

module.exports = { upload, apkUpload, UPLOAD_ROOT, kindFor };
