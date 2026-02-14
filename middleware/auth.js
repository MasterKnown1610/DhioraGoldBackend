const jwt = require('jsonwebtoken');
const GlobalUser = require('../models/GlobalUser');

/**
 * Optional JWT auth: decode token if provided, attach user to req.
 * Request continues even without token (for public endpoints).
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await GlobalUser.findById(decoded.id).select('-password');
    req.user = user || null;
    next();
  } catch {
    req.user = null;
    next();
  }
};

/**
 * Required auth: must have valid JWT or 401.
 */
const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authorized, token missing' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await GlobalUser.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Not authorized, invalid token' });
  }
};

module.exports = { optionalAuth, requireAuth };
