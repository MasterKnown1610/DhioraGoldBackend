const express = require('express');
const paymentController = require('../controllers/paymentController');
const asyncHandler = require('../middleware/asyncHandler');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/create-order', requireAuth, asyncHandler(paymentController.createOrder));
router.post('/verify', asyncHandler(paymentController.verifyPayment));

module.exports = router;
