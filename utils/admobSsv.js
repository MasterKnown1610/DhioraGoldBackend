/**
 * AdMob Server-Side Verification (SSV) helper.
 * Google sends GET /api/admob/reward?user_id=&reward_amount=&signature=&key_id=
 * In production, verify the signature using Google's public keys (ECDSA).
 * @see https://developers.google.com/admob/android/rewarded-video-ssv
 * Optional: npm install @exoshtw/admob-ssv for full verification.
 */

/**
 * Validates that required SSV query params are present.
 * For production: use Google's verifier keys to verify signature with key_id.
 * @param {Object} params - { user_id, reward_amount, signature, key_id }
 * @returns {{ valid: boolean, message?: string }}
 */
function validateAdMobSsvParams(params) {
  const { user_id, reward_amount, signature, key_id } = params;
  if (!user_id || !signature || !key_id) {
    return { valid: false, message: 'Missing required SSV params: user_id, signature, key_id' };
  }
  const amount = Number(reward_amount);
  if (Number.isNaN(amount) || amount < 1) {
    return { valid: false, message: 'Invalid or missing reward_amount' };
  }
  // Production: verify signature with Google's public key for key_id
  // e.g. using @exoshtw/admob-ssv or fetching from Google and verifying ECDSA
  return { valid: true };
}

module.exports = { validateAdMobSsvParams };
