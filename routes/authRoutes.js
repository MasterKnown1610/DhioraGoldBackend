const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const asyncHandler = require('../middleware/asyncHandler');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { uploadSingle, uploadMultiple } = require('../middleware/upload');

const router = express.Router();

const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Invalid email'),
  body('phoneNumber')
    .optional()
    .trim(),
];

const loginValidation = [
  body('password').notEmpty().withMessage('Password is required'),
  body('email').optional().trim().isEmail().withMessage('Invalid email'),
  body('phoneNumber').optional().trim(),
];

router.post(
  '/register',
  registerValidation,
  validate,
  asyncHandler(async (req, res, next) => {
    if (!req.body.email && !req.body.phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Either email or phoneNumber is required',
      });
    }
    next();
  }),
  asyncHandler(authController.register)
);

router.post(
  '/login',
  loginValidation,
  validate,
  asyncHandler(async (req, res, next) => {
    if (!req.body.email && !req.body.phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Either email or phoneNumber is required',
      });
    }
    next();
  }),
  asyncHandler(authController.login)
);

router.get('/me', requireAuth, asyncHandler(authController.getMe));

const registerServiceProviderValidation = [
  body('userName').trim().notEmpty().withMessage('User name is required'),
  body('serviceProvided').trim().notEmpty().withMessage('Service provided is required'),
  body('address').optional().trim(),
  body('state').trim().notEmpty().withMessage('State is required'),
  body('district').trim().notEmpty().withMessage('District is required'),
  body('city').trim().notEmpty().withMessage('City is required'),
  body('pincode').trim().notEmpty().withMessage('Pincode is required'),
  body('phoneNumber').optional().trim(),
];

router.post(
  '/register-service-provider',
  requireAuth,
  uploadSingle,
  registerServiceProviderValidation,
  validate,
  asyncHandler(authController.registerServiceProvider)
);

const updateServiceProviderValidation = [
  body('userName').optional().trim(),
  body('serviceProvided').optional().trim(),
  body('address').optional().trim(),
  body('state').optional().trim(),
  body('district').optional().trim(),
  body('city').optional().trim(),
  body('pincode').optional().trim(),
  body('phoneNumber').optional().trim(),
];

router.patch(
  '/service-provider',
  requireAuth,
  uploadSingle,
  updateServiceProviderValidation,
  validate,
  asyncHandler(authController.updateServiceProvider)
);

const registerShopValidation = [
  body('shopName').trim().notEmpty().withMessage('Shop name is required'),
  body('address').trim().notEmpty().withMessage('Address is required'),
  body('pincode').trim().notEmpty().withMessage('Pincode is required'),
  body('state').trim().notEmpty().withMessage('State is required'),
  body('district').trim().notEmpty().withMessage('District is required'),
  body('city').trim().notEmpty().withMessage('City is required'),
  body('whatsappNumber').optional().trim(),
  body('openingHours').optional(),
];

router.post(
  '/register-shop',
  requireAuth,
  uploadMultiple,
  registerShopValidation,
  validate,
  asyncHandler(authController.registerShop)
);

const updateShopValidation = [
  body('shopName').optional().trim(),
  body('address').optional().trim(),
  body('pincode').optional().trim(),
  body('state').optional().trim(),
  body('district').optional().trim(),
  body('city').optional().trim(),
  body('whatsappNumber').optional().trim(),
  body('openingHours').optional(),
];

router.patch(
  '/shop',
  requireAuth,
  uploadMultiple,
  updateShopValidation,
  validate,
  asyncHandler(authController.updateShop)
);

const forgotPasswordValidation = [
  body('email').optional().trim().isEmail().withMessage('Invalid email'),
  body('phoneNumber').optional().trim(),
];

router.post(
  '/forgot-password',
  forgotPasswordValidation,
  validate,
  asyncHandler(async (req, res, next) => {
    if (!req.body.email && !req.body.phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Either email or phoneNumber is required',
      });
    }
    next();
  }),
  asyncHandler(authController.forgotPassword)
);

const resetPasswordValidation = [
  body('resetToken').notEmpty().withMessage('Reset token is required'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters'),
];

router.post(
  '/reset-password',
  resetPasswordValidation,
  validate,
  asyncHandler(authController.resetPassword)
);

const changePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters'),
];

router.post(
  '/change-password',
  requireAuth,
  changePasswordValidation,
  validate,
  asyncHandler(authController.changePassword)
);

module.exports = router;
