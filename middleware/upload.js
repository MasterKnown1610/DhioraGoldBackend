const multer = require('multer');
const cloudinary = require('../config/cloudinary');

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
 * Multer: single file (e.g. profile image)
 */
const uploadSingle = upload.single('image');

/**
 * Multer: up to 5 files (e.g. shop images)
 */
const uploadMultiple = upload.array('images', 5);

module.exports = {
  upload,
  uploadSingle,
  uploadMultiple,
  uploadToCloudinary,
};
