const Promotion = require('../models/Promotion');
const asyncHandler = require('../middleware/asyncHandler');
const { uploadToCloudinary, deleteFromCloudinary } = require('../middleware/upload');

/**
 * @route   GET /api/promotions
 * Returns only active promotions (endDate >= today).
 * Excludes expired promotions.
 */
exports.getPromotions = asyncHandler(async (req, res) => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const promotions = await Promotion.find({
    startDate: { $lte: new Date() },
    endDate: { $gte: now },
  })
    .sort({ startDate: -1 })
    .lean();

  res.status(200).json({
    success: true,
    data: promotions,
  });
});

/**
 * @route   GET /api/promotions/all
 * Admin: returns ALL promotions including expired (for management UI).
 */
exports.getAllPromotions = asyncHandler(async (req, res) => {
  const promotions = await Promotion.find().sort({ startDate: -1 }).lean();

  res.status(200).json({
    success: true,
    data: promotions,
  });
});

/**
 * @route   POST /api/promotions
 * Create a new promotion.
 * @body    title, description?, startDate, endDate, imageUrl?
 */
exports.createPromotion = asyncHandler(async (req, res) => {
  const { title, description, startDate, endDate, imageUrl, ctaType, ctaValue, ctaLabel, ctaMessage } = req.body;

  if (!title?.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Title is required',
    });
  }
  if (!startDate) {
    return res.status(400).json({
      success: false,
      message: 'Start date is required',
    });
  }
  if (!endDate) {
    return res.status(400).json({
      success: false,
      message: 'End date is required',
    });
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return res.status(400).json({
      success: false,
      message: 'Invalid date format',
    });
  }
  if (end < start) {
    return res.status(400).json({
      success: false,
      message: 'End date must be after start date',
    });
  }

  let imageUrlToUse = imageUrl?.trim() || undefined;
  if (req.file) {
    imageUrlToUse = await uploadToCloudinary(req.file.buffer, 'goldbackend/promotions', req.file.mimetype);
  }

  const promotion = await Promotion.create({
    title: title.trim(),
    description: description?.trim() || '',
    startDate: start,
    endDate: end,
    imageUrl: imageUrlToUse,
    ctaType: ctaType && ['phone', 'website', 'whatsapp'].includes(ctaType) ? ctaType : undefined,
    ctaValue: ctaValue?.trim() || undefined,
    ctaLabel: ctaLabel?.trim() || undefined,
    ctaMessage: ctaMessage?.trim() || undefined,
  });

  res.status(201).json({
    success: true,
    data: promotion,
  });
});

/**
 * @route   PATCH /api/promotions/:id
 * Update a promotion.
 */
exports.updatePromotion = asyncHandler(async (req, res) => {
  const promotion = await Promotion.findById(req.params.id);
  if (!promotion) {
    return res.status(404).json({ success: false, message: 'Promotion not found' });
  }

  const { title, description, startDate, endDate, imageUrl, ctaType, ctaValue, ctaLabel, ctaMessage, removeImage } = req.body;
  if (title !== undefined) promotion.title = title.trim() || promotion.title;
  if (description !== undefined) promotion.description = description?.trim() || '';
  if (startDate) {
    const start = new Date(startDate);
    if (!isNaN(start.getTime())) promotion.startDate = start;
  }
  if (endDate) {
    const end = new Date(endDate);
    if (!isNaN(end.getTime())) promotion.endDate = end;
  }
  if (req.file) {
    promotion.imageUrl = await uploadToCloudinary(req.file.buffer, 'goldbackend/promotions', req.file.mimetype);
  } else if (removeImage === 'true' || removeImage === true) {
    promotion.imageUrl = null;
  } else if (imageUrl !== undefined) {
    promotion.imageUrl = imageUrl?.trim() || null;
  }
  if (ctaType !== undefined) promotion.ctaType = ctaType && ['phone', 'website', 'whatsapp'].includes(ctaType) ? ctaType : null;
  if (ctaValue !== undefined) promotion.ctaValue = ctaValue?.trim() || null;
  if (ctaLabel !== undefined) promotion.ctaLabel = ctaLabel?.trim() || null;
  if (ctaMessage !== undefined) promotion.ctaMessage = ctaMessage?.trim() || null;

  await promotion.save();

  res.status(200).json({
    success: true,
    data: promotion,
  });
});

/**
 * @route   DELETE /api/promotions/:id
 * Deletes the promotion and its image from Cloudinary if present.
 */
exports.deletePromotion = asyncHandler(async (req, res) => {
  const promotion = await Promotion.findById(req.params.id);
  if (!promotion) {
    return res.status(404).json({ success: false, message: 'Promotion not found' });
  }

  if (promotion.imageUrl) {
    try {
      await deleteFromCloudinary(promotion.imageUrl);
    } catch (err) {
      // Log but don't fail the delete; promotion record is still removed
      console.error('Failed to delete promotion image from Cloudinary:', err?.message || err);
    }
  }

  await Promotion.findByIdAndDelete(req.params.id);

  res.status(200).json({
    success: true,
    message: 'Promotion deleted',
  });
});
