const multer = require('multer');
const sharp = require('sharp');
const cloudinary = require('../config/cloudinary');

/**
 * Quality presets for catalog image compression.
 *
 * standard — max 1280px, JPEG q72   → ~0.1–0.25 MB per image (big phone photos shrink ~95%)
 * hd       — max 2560px, JPEG q90   → ~0.5–1.5 MB per image (preserves fine detail)
 */
const IMAGE_QUALITY_PRESETS = {
  standard: { maxDimension: 1280, quality: 72 },
  hd:       { maxDimension: 2560, quality: 90 },
};

/**
 * Compress an image buffer using sharp.
 * Always outputs JPEG for consistent sizing.
 *
 * @param {Buffer} buffer - Raw image buffer from multer
 * @param {'standard'|'hd'} quality - Quality preset
 * @returns {Promise<Buffer>} Compressed JPEG buffer
 */
const compressImage = async (buffer, quality = 'standard') => {
  const preset = IMAGE_QUALITY_PRESETS[quality] || IMAGE_QUALITY_PRESETS.standard;
  return sharp(buffer)
    .resize(preset.maxDimension, preset.maxDimension, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: preset.quality })
    .toBuffer();
};

// In-memory storage for multer (files will be sent to Cloudinary in controller)
const memoryStorage = multer.memoryStorage();

const upload = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = /image\/(jpeg|jpg|png|gif|webp)/;
    if (allowed.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (jpeg, jpg, png, gif, webp) are allowed'), false);
    }
  },
});

/**
 * Upload single file to Cloudinary, return secure_url.
 * @param {Buffer} buffer - File buffer
 * @param {string} folder - Cloudinary folder
 * @param {string} mimetype - Optional MIME type (default image/jpeg)
 */
const uploadToCloudinary = (buffer, folder = 'goldbackend', mimetype = 'image/jpeg') => {
  const dataUri = `data:${mimetype};base64,${buffer.toString('base64')}`;
  return cloudinary.uploader.upload(dataUri, { folder }).then((result) => result.secure_url);
};

/**
 * Extract Cloudinary public_id from a secure_url.
 * URL format: .../upload/v<version>/<public_id>.<ext>  (public_id may contain slashes, e.g. folder/name)
 */
const getPublicIdFromUrl = (imageUrl) => {
  if (!imageUrl || typeof imageUrl !== 'string') return null;
  const parts = imageUrl.split(/\/v\d+\//);
  if (parts.length < 2) return null;
  const withExt = parts[1].trim();
  if (!withExt) return null;
  return withExt.replace(/\.[^.]+$/, '');
};

/**
 * Delete an image from Cloudinary by its secure_url.
 * @param {string} imageUrl - Full Cloudinary secure_url
 * @returns {Promise<void>} Resolves when done; rejects on error
 */
const deleteFromCloudinary = (imageUrl) => {
  const publicId = getPublicIdFromUrl(imageUrl);
  if (!publicId) return Promise.resolve();
  return cloudinary.uploader.destroy(publicId);
};

/**
 * Multer: single file (e.g. profile image)
 */
const uploadSingle = upload.single('image');

/**
 * Multer: up to 5 files (e.g. shop images)
 */
const uploadMultiple = upload.array('images', 5);

/**
 * Multer: up to 10 files for catalog bulk upload
 */
const uploadCatalogBulk = upload.array('images', 10);

module.exports = {
  upload,
  uploadSingle,
  uploadMultiple,
  uploadCatalogBulk,
  uploadToCloudinary,
  deleteFromCloudinary,
  compressImage,
  IMAGE_QUALITY_PRESETS,
};
