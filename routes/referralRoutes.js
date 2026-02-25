const express = require('express');
const referralController = require('../controllers/referralController');
const asyncHandler = require('../middleware/asyncHandler');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/me', requireAuth, asyncHandler(referralController.getMe));
router.post('/request-refund', requireAuth, asyncHandler(referralController.requestRefund));
router.get('/withdrawal-requests', asyncHandler(referralController.listWithdrawalRequests));
router.patch('/withdrawal-requests/:userId', asyncHandler(referralController.processWithdrawalRequest));

module.exports = router;
