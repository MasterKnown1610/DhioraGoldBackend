const asyncHandler = require('../middleware/asyncHandler');
const GlobalUser = require('../models/GlobalUser');
const authController = require('./authController');

const REFUND_THRESHOLD = 10;

/**
 * @route   GET /api/referral/me
 * Requires auth. Returns referral code, balance and whether user can request refund (≥ ₹10).
 */
exports.getMe = asyncHandler(async (req, res) => {
  const globalUser = req.user;
  if (!globalUser) {
    return res.status(401).json({ success: false, message: 'Login required' });
  }

  const referralCode = await authController.ensureReferralCode(globalUser);
  const balance = globalUser.referralBalance ?? 0;
  const canRefund = balance >= REFUND_THRESHOLD && !globalUser.referralRefundRequestedAt;

  res.status(200).json({
    success: true,
    data: {
      referralCode: referralCode || null,
      referralBalance: balance,
      canRefund,
      refundRequestedAt: globalUser.referralRefundRequestedAt || null,
    },
  });
});

/**
 * @route   POST /api/referral/request-refund
 * @body    amount (optional) - amount to withdraw; must be >= 10 and <= referralBalance. If omitted, full balance is used.
 * Requires auth. Marks refund as requested with the given amount.
 */
exports.requestRefund = asyncHandler(async (req, res) => {
  const globalUser = req.user;
  if (!globalUser) {
    return res.status(401).json({ success: false, message: 'Login required' });
  }

  const balance = globalUser.referralBalance ?? 0;
  if (balance < REFUND_THRESHOLD) {
    return res.status(400).json({
      success: false,
      message: 'Minimum balance of ₹10 is required to enable withdrawal.',
    });
  }

  if (globalUser.referralRefundRequestedAt) {
    return res.status(400).json({
      success: false,
      message: 'A withdrawal request is already pending approval.',
    });
  }

  let amountToWithdraw = balance;
  if (req.body != null && req.body.amount != null) {
    const requested = Number(req.body.amount);
    if (!Number.isFinite(requested) || requested < REFUND_THRESHOLD) {
      return res.status(400).json({
        success: false,
        message: 'Please enter an amount greater than ₹10 and less than or equal to your available balance.',
      });
    }
    if (requested > balance) {
      return res.status(400).json({
        success: false,
        message: 'Please enter an amount greater than ₹10 and less than or equal to your available balance.',
      });
    }
    amountToWithdraw = requested;
  }

  const withdrawalType = req.body?.withdrawalType === 'gpay' ? 'gpay' : 'phonepe';
  const withdrawalPhone = String(req.body?.withdrawalPhone ?? '').trim().replace(/\D/g, '');
  if (withdrawalPhone.length !== 10) {
    return res.status(400).json({
      success: false,
      message: 'Please enter a valid 10-digit mobile number for PhonePe/GPay.',
    });
  }

  globalUser.referralRefundRequestedAt = new Date();
  globalUser.referralWithdrawalAmount = amountToWithdraw;
  globalUser.referralWithdrawalType = withdrawalType;
  globalUser.referralWithdrawalPhone = withdrawalPhone;
  globalUser.referralBalance = Math.max(0, (globalUser.referralBalance ?? 0) - amountToWithdraw);
  await globalUser.save();

  res.status(200).json({
    success: true,
    message: 'Your withdrawal request has been raised successfully and is pending approval.',
    data: {
      amount: amountToWithdraw,
      refundRequestedAt: globalUser.referralRefundRequestedAt,
    },
  });
});

/**
 * @route   GET /api/referral/withdrawal-requests
 * Admin: list all pending referral withdrawal requests.
 */
exports.listWithdrawalRequests = asyncHandler(async (req, res) => {
  const list = await GlobalUser.find(
    { referralRefundRequestedAt: { $ne: null } },
    'name email phoneNumber referralCode referralBalance referralRefundRequestedAt referralWithdrawalAmount referralWithdrawalType referralWithdrawalPhone'
  )
    .sort({ referralRefundRequestedAt: -1 })
    .lean();
  res.status(200).json({ success: true, data: list });
});

/**
 * @route   PATCH /api/referral/withdrawal-requests/:userId
 * @body    { action: 'approve' | 'reject' }
 * Admin: approve or reject a withdrawal request.
 */
exports.processWithdrawalRequest = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { action } = req.body || {};
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({
      success: false,
      message: 'action must be "approve" or "reject"',
    });
  }
  const globalUser = await GlobalUser.findById(userId);
  if (!globalUser) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }
  if (!globalUser.referralRefundRequestedAt) {
    return res.status(400).json({
      success: false,
      message: 'No pending withdrawal request for this user',
    });
  }
  const amount = globalUser.referralWithdrawalAmount ?? 0;
  globalUser.referralRefundRequestedAt = null;
  globalUser.referralWithdrawalAmount = null;
  globalUser.referralWithdrawalType = null;
  globalUser.referralWithdrawalPhone = null;
  if (action === 'reject') {
    globalUser.referralBalance = (globalUser.referralBalance ?? 0) + amount;
  }
  await globalUser.save();
  res.status(200).json({
    success: true,
    message: action === 'approve' ? 'Withdrawal approved.' : 'Withdrawal rejected. Amount has been re-added to the customer wallet.',
    data: { action, userId, amount },
  });
});
