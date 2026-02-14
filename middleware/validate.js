const { validationResult } = require('express-validator');

/**
 * Middleware to run validation and return 400 with errors if invalid.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const payload = {
      success: false,
      message: 'Validation failed',
      errors: errors.array().map((e) => ({ field: e.path, msg: e.msg })),
    };
    // Debug: when sending FormData, body is only set after multer runs. If body is empty, client may have sent wrong Content-Type.
    if (process.env.NODE_ENV !== 'production' && req.method === 'POST' && req.originalUrl?.includes('promotions')) {
      payload.debug = {
        contentType: req.headers['content-type'] || '(none)',
        bodyKeys: req.body && typeof req.body === 'object' ? Object.keys(req.body) : [],
      };
    }
    return res.status(400).json(payload);
  }
  next();
};

module.exports = validate;
