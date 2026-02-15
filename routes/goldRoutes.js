const express = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  unlockPhone,
  boostShop,
  removeAds,
  getWallet,
} = require('../controllers/goldController');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();

router.use(requireAuth);

router.post('/unlock-phone', asyncHandler(unlockPhone));
router.post('/boost-shop', asyncHandler(boostShop));
router.post('/remove-ads', asyncHandler(removeAds));
router.get('/wallet', asyncHandler(getWallet));

module.exports = router;
