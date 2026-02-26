const express = require('express');
const subscriptionController = require('../controllers/subscriptionController');
const asyncHandler = require('../middleware/asyncHandler');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/create', requireAuth, asyncHandler(subscriptionController.createSubscription));

module.exports = router;
