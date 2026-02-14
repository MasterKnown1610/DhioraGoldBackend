const Complaint = require('../models/Complaint');
const asyncHandler = require('../middleware/asyncHandler');
const { paginate } = require('../utils/pagination');

/**
 * @route   POST /api/help
 * @body    name, subject, message, email?, phoneNumber?
 * If JWT provided, userId is attached to complaint.
 */
exports.createComplaint = asyncHandler(async (req, res) => {
  const { name, email, phoneNumber, subject, message } = req.body;

  if (!email && !phoneNumber) {
    return res.status(400).json({
      success: false,
      message: 'Either email or phoneNumber is required for contact',
    });
  }

  const complaint = await Complaint.create({
    name,
    email: email || undefined,
    phoneNumber: phoneNumber || undefined,
    subject,
    message,
    userId: req.user?.id || null,
  });

  res.status(201).json({
    success: true,
    message: 'Complaint submitted successfully',
    data: complaint,
  });
});

/**
 * @route   GET /api/help
 * Optional auth: if JWT provided, returns only that user's complaints (with pagination).
 * Without JWT returns 401 or empty - we'll allow only authenticated users to list their complaints.
 */
exports.getMyComplaints = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const query = Complaint.find({ userId: req.user.id }).sort({ createdAt: -1 });
  const { data, pagination } = await paginate(query, { page, limit });

  res.status(200).json({
    success: true,
    data,
    pagination,
  });
});
