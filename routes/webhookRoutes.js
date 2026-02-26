const express = require('express');
const webhookController = require('../controllers/webhookController');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();

router.post('/razorpay', asyncHandler(webhookController.handleRazorpayWebhook));

module.exports = router;
