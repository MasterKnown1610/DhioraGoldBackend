const express = require('express');
const router = express.Router();
const Shop = require('../models/Shop');
const User = require('../models/User');

const BASE = 'https://dhiora-gold-backend.vercel.app';
const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.goldapplive';
const APP_STORE  = 'https://apps.apple.com/app/dhiora-gold/id6744494047';

const html = ({ name, subtitle, address, imageUrl, type, id }) => {
  const deepLink  = `dhioragold://${type}/${id}`;
  const intentUrl = `intent://${type}/${id}#Intent;scheme=dhioragold;package=com.goldapplive;S.browser_fallback_url=${encodeURIComponent(PLAY_STORE)};end`;
  const avatarHtml = imageUrl
    ? `<img src="${imageUrl}" class="avatar" alt="${name}" onerror="this.style.display='none'">`
    : `<div class="avatar-placeholder">${type === 'shop' ? '🏪' : '👤'}</div>`;
  const addrHtml = address ? `<div class="address">📍 ${address}</div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta property="og:title" content="${name} on Dhiora Gold" />
  <meta property="og:description" content="${subtitle}" />
  ${imageUrl ? `<meta property="og:image" content="${imageUrl}" />` : ''}
  <title>${name} – Dhiora Gold</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f0f23;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .card{background:#1a1a35;border-radius:20px;padding:32px 24px;max-width:380px;width:100%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.4)}
    .logo{color:#F8C24D;font-size:12px;font-weight:700;letter-spacing:3px;margin-bottom:24px;opacity:.9}
    .avatar{width:84px;height:84px;border-radius:50%;object-fit:cover;margin:0 auto 16px;display:block;border:3px solid #F8C24D}
    .avatar-placeholder{width:84px;height:84px;border-radius:50%;background:#2a2a4a;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:34px;border:3px solid #F8C24D}
    .name{font-size:22px;font-weight:800;color:#F8C24D;margin-bottom:6px;line-height:1.3}
    .subtitle{color:#bbb;font-size:14px;margin-bottom:6px}
    .address{color:#888;font-size:13px;margin-bottom:24px}
    .btn{display:block;width:100%;padding:14px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;margin-bottom:12px;cursor:pointer;transition:opacity .2s}
    .btn:hover{opacity:.88}
    .btn-app{background:#F8C24D;color:#000}
    .btn-play{background:#34A853;color:#fff}
    .btn-apple{background:#555;color:#fff}
    .divider{color:#555;font-size:12px;margin:4px 0 12px}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">✦ DHIORA GOLD</div>
    ${avatarHtml}
    <div class="name">${name}</div>
    <div class="subtitle">${subtitle}</div>
    ${addrHtml}
    <a href="${deepLink}" id="openBtn" class="btn btn-app">Open in Dhiora Gold App</a>
    <div class="divider">— App not installed? —</div>
    <a href="${PLAY_STORE}" class="btn btn-play">📱 Download on Play Store</a>
    <a href="${APP_STORE}" class="btn btn-apple">🍎 Download on App Store</a>
  </div>
  <script>
    var ua = navigator.userAgent || '';
    var btn = document.getElementById('openBtn');
    if (/Android/i.test(ua)) {
      btn.href = "${intentUrl}";
    } else if (/iPhone|iPad|iPod/i.test(ua)) {
      btn.href = "${deepLink}";
      // Try opening; if still here after 1.5s nothing happens (user uses store buttons)
      setTimeout(function(){ window.location = "${deepLink}"; }, 300);
    }
  </script>
</body>
</html>`;
};

// GET /share/shop/:shopId
router.get('/shop/:shopId', async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.shopId).select('shopName address city state images whatsappNumber phoneNumber');
    if (!shop) return res.status(404).send('<h2>Shop not found</h2>');
    const parts = [shop.city, shop.district, shop.state].filter(Boolean);
    res.send(html({
      name: shop.shopName,
      subtitle: 'Gold & Jewellery Shop',
      address: parts.join(', ') || shop.address || '',
      imageUrl: shop.images?.[0] || null,
      type: 'shop',
      id: shop._id,
    }));
  } catch (_) {
    res.status(500).send('<h2>Something went wrong</h2>');
  }
});

// GET /share/user/:userId
router.get('/user/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('userName serviceProvided city district state address profileImage');
    if (!user) return res.status(404).send('<h2>User not found</h2>');
    const parts = [user.city, user.district, user.state].filter(Boolean);
    res.send(html({
      name: user.userName,
      subtitle: user.serviceProvided || 'Service Provider',
      address: parts.join(', ') || user.address || '',
      imageUrl: user.profileImage || null,
      type: 'user',
      id: user._id,
    }));
  } catch (_) {
    res.status(500).send('<h2>Something went wrong</h2>');
  }
});

module.exports = router;
