/**
 * Build MongoDB regex search for multiple fields (case-insensitive).
 * @param {string} searchText - Search string from query
 * @param {string[]} fields - Field names to search in
 * @returns {Object} MongoDB $or condition or {} if no search
 */
const buildSearchFilter = (searchText, fields) => {
  if (!searchText || typeof searchText !== 'string') return {};
  const trimmed = searchText.trim();
  if (!trimmed) return {};

  const regex = new RegExp(trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const orConditions = fields.map((field) => ({ [field]: regex }));
  return { $or: orConditions };
};

/**
 * Keys that should use exact match (e.g. pincode) instead of regex.
 */
const EXACT_MATCH_KEYS = ['pincode'];

/**
 * Build filter object from query params (state, district, pincode, etc.)
 * Only includes keys that are present and non-empty.
 * Uses exact match for pincode; case-insensitive regex for others.
 */
const buildQueryFilters = (query, allowedKeys) => {
  const filter = {};
  allowedKeys.forEach((key) => {
    const value = query[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      const trimmed = String(value).trim();
      if (EXACT_MATCH_KEYS.includes(key)) {
        filter[key] = trimmed;
      } else {
        filter[key] = new RegExp(trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      }
    }
  });
  return filter;
};

module.exports = { buildSearchFilter, buildQueryFilters };
