const express = require('express');
const { body } = require('express-validator');
const helpController = require('../controllers/helpController');
const asyncHandler = require('../middleware/asyncHandler');
const validate = require('../middleware/validate');
const { optionalAuth, requireAuth } = require('../middleware/auth');

const router = express.Router();

const createComplaintValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('subject').trim().notEmpty().withMessage('Subject is required'),
  body('message').trim().notEmpty().withMessage('Message is required'),
  body('email').optional().trim().isEmail().withMessage('Invalid email'),
  body('phoneNumber').optional().trim(),
];

router.post(
  '/',
  optionalAuth,
  createComplaintValidation,
  validate,
  asyncHandler(async (req, res, next) => {
    if (!req.body.email && !req.body.phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Either email or phoneNumber is required for contact',
      });
    }
    next();
  }),
  asyncHandler(helpController.createComplaint)
);

router.get('/', requireAuth, asyncHandler(helpController.getMyComplaints));

module.exports = router;
