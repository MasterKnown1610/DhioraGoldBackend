const express = require('express');
const { body } = require('express-validator');
const promotionController = require('../controllers/promotionController');
const asyncHandler = require('../middleware/asyncHandler');
const validate = require('../middleware/validate');
const { uploadSingle } = require('../middleware/upload');

const router = express.Router();

const createPromotionValidation = [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('description').optional().trim(),
  body('startDate').notEmpty().withMessage('Start date is required'),
  body('endDate').notEmpty().withMessage('End date is required'),
  body('imageUrl').optional().trim(),
  body('ctaType').optional().isIn(['phone', 'website', 'whatsapp']),
  body('ctaValue').optional().trim(),
  body('ctaLabel').optional().trim(),
  body('ctaMessage').optional().trim(),
];

const updatePromotionValidation = [
  body('title').optional().trim(),
  body('description').optional().trim(),
  body('startDate').optional(),
  body('endDate').optional(),
  body('imageUrl').optional().trim(),
  body('removeImage').optional(),
  body('ctaType').optional().isIn(['phone', 'website', 'whatsapp']),
  body('ctaValue').optional().trim(),
  body('ctaLabel').optional().trim(),
  body('ctaMessage').optional().trim(),
];

// Public: get active promotions only (endDate >= today)
router.get('/', asyncHandler(promotionController.getPromotions));

// Admin: get all promotions including expired
router.get('/all', asyncHandler(promotionController.getAllPromotions));

router.post('/', uploadSingle, createPromotionValidation, validate, asyncHandler(promotionController.createPromotion));
router.patch('/:id', uploadSingle, updatePromotionValidation, validate, asyncHandler(promotionController.updatePromotion));
router.delete('/:id', asyncHandler(promotionController.deletePromotion));

module.exports = router;
