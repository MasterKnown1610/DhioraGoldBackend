require('dotenv').config();
const express = require('express');
const path = require('path');

const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// Load Cloudinary config (for uploads)
require('./config/cloudinary');

const authRoutes = require('./routes/authRoutes');
const shopRoutes = require('./routes/shopRoutes');
const userRoutes = require('./routes/userRoutes');
const helpRoutes = require('./routes/helpRoutes');
const promotionRoutes = require('./routes/promotionRoutes');
const admobRoutes = require('./routes/admobRoutes');
const goldRoutes = require('./routes/goldRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const referralRoutes = require('./routes/referralRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const catalogRoutes = require('./routes/catalogRoutes');
const publicRoutes = require('./routes/publicRoutes');
const shareRoutes = require('./routes/shareRoutes');

// Connect DB once at cold start (safe for serverless)
connectDB();

const app = express();

// Webhook must receive raw body for Razorpay signature verification (mount before json parser)
app.use('/api/webhook', express.raw({ type: 'application/json' }), webhookRoutes);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/users', userRoutes);
app.use('/api/help', helpRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/admob', admobRoutes);
app.use('/api/gold', goldRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/referral', referralRoutes);
app.use('/api/catalogs', catalogRoutes);
app.use('/api/public', publicRoutes);
app.use('/share', shareRoutes);

// Admin UI static
app.use('/promotions-admin', express.static(path.join(__dirname, 'website')));
app.get('/promotions-admin', (req, res) => res.redirect('/promotions-admin/'));

// Unified admin dashboard
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'website', 'admin-dashboard.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ success: true, message: 'API is running' });
});

// AdMob app-ads.txt (no auth, public, text/plain)
app.get('/app-ads.txt', (req, res) => {
  res.type('text/plain');
  res.send('google.com, pub-4292460929510961, DIRECT, f08c47fec0942fa0');
});

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use(errorHandler);

module.exports = app;

