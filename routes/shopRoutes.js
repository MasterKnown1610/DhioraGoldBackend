const express = require('express');
const { body } = require('express-validator');
const shopController = require('../controllers/shopController');
const asyncHandler = require('../middleware/asyncHandler');
const validate = require('../middleware/validate');
const { optionalAuth } = require('../middleware/auth');
const { uploadMultiple } = require('../middleware/upload');

const router = express.Router();

const registerShopValidation = [
  body('shopName').trim().notEmpty().withMessage('Shop name is required'),
  body('address').trim().notEmpty().withMessage('Address is required'),
  body('pincode').trim().notEmpty().withMessage('Pincode is required'),
  body('phoneNumber').trim().notEmpty().withMessage('Phone number is required'),
  body('state').trim().notEmpty().withMessage('State is required'),
  body('district').trim().notEmpty().withMessage('District is required'),
  body('whatsappNumber').optional().trim(),
  body('openingHours').optional(),
];

router.post(
  '/',
  uploadMultiple,
  registerShopValidation,
  validate,
  asyncHandler(shopController.registerShop)
);

router.get('/', optionalAuth, asyncHandler(shopController.getAllShops));
router.get('/:id', optionalAuth, asyncHandler(shopController.getShop));

module.exports = router;
