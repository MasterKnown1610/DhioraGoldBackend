const express = require('express');
const { body } = require('express-validator');
const userController = require('../controllers/userController');
const asyncHandler = require('../middleware/asyncHandler');
const validate = require('../middleware/validate');
const { optionalAuth } = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');

const router = express.Router();

const registerUserValidation = [
  body('userName').trim().notEmpty().withMessage('User name is required'),
  body('serviceProvided').trim().notEmpty().withMessage('Service provided is required'),
  body('address').optional().trim(),
  body('state').optional().trim(),
  body('district').optional().trim(),
  body('pincode').optional().trim(),
  body('phoneNumber').optional().trim(),
];

router.post(
  '/',
  uploadSingle,
  registerUserValidation,
  validate,
  asyncHandler(userController.registerUser)
);

router.get('/', optionalAuth, asyncHandler(userController.getAllUsers));
router.get('/:id', optionalAuth, asyncHandler(userController.getUser));

module.exports = router;
