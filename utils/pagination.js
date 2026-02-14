/**
 * Reusable pagination helper.
 * @param {Object} query - Mongoose query object
 * @param {Object} options - { page, limit }
 * @returns {Object} { data, pagination: { page, limit, total, totalPages } }
 */
const paginate = async (query, options = {}) => {
  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(options.limit, 10) || 10));
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    query.clone().skip(skip).limit(limit).exec(),
    query.countDocuments().exec(),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
};

module.exports = { paginate };
