/**
 * Deterministic spending behavior scorer — no AI, pure math.
 * Same transaction set always produces the same scores, so the emotional
 * score shown on the dashboard never changes between refreshes unless the
 * user's actual transactions change.
 */

// ─── Category / subcategory effectiveness tables ──────────────────────────────
// Score 0–100: higher = more intentional / necessary purchase.

const CAT_BASE = {
  RENT_AND_UTILITIES:  94,
  GENERAL_SERVICES:    62,
  HEALTH:              82,
  TRANSPORTATION:      58,
  FOOD_AND_DRINK:      46,
  SHOPS:               40,
  ENTERTAINMENT:       36,
  TRAVEL:              54,
  PERSONAL_CARE:       48,
  OTHER:               44,
};

// Subcategory scores override the category base when present.
const SUB_SCORE = {
  // Essentials
  Rent:           95,
  Electric:       92,
  Gas:            91,
  Phone:          86,
  Internet:       85,
  'Cloud Storage':75,
  Groceries:      88,

  // Health / wellness
  Gyms:           72,
  Pharmacy:       84,
  Doctor:         90,

  // Moderate — planned discretionary
  Streaming:      57,
  Music:          55,
  Membership:     60,
  Software:       66,
  Events:         50,
  Apps:           44,
  Rideshare:      46,
  Restaurants:    50,
  Coffee:         42,

  // Higher-impulse
  'Fast Food':    28,
  Bars:           20,
  Clothing:       34,
  'Fast Fashion': 22,
  Electronics:    38,
  General:        38,
  Beauty:         36,
  Gaming:         30,
};

// ─── Merchants known to be impulse / emotional ────────────────────────────────
const DELIVERY_MERCHANTS = new Set([
  'DoorDash', 'Uber Eats', 'Grubhub', 'Instacart', 'Postmates',
  'Seamless', 'Caviar', 'DoorDash Drive',
]);

const IMPULSE_MERCHANTS = new Set([
  'SHEIN', 'ASOS', 'Fashion Nova', 'PrettyLittleThing', 'Zara',
  'H&M', 'TikTok Shop',
]);

const NECESSITY_CATS = new Set([
  'RENT_AND_UTILITIES', 'HEALTH', 'TRANSPORTATION',
]);

// ─── Per-transaction effectiveness rating ─────────────────────────────────────
/**
 * @param {object} txn   - single transaction
 * @param {object[]} all - full transaction list (for relative/frequency context)
 * @returns {number} 0–100
 */
export function rateTransaction(txn, all) {
  const cat = (txn.category || 'OTHER').toUpperCase().replace(/ /g, '_');
  const sub = txn.subcategory || '';
  const merchant = txn.merchant || txn.name || '';

  // ── Base score ──────────────────────────────────────────────────────────────
  let score = SUB_SCORE[sub] ?? CAT_BASE[cat] ?? 44;

  // ── Merchant overrides ──────────────────────────────────────────────────────
  if (DELIVERY_MERCHANTS.has(merchant)) score = Math.min(score, 32);
  if (IMPULSE_MERCHANTS.has(merchant))  score = Math.min(score, 28);

  // ── Online channel penalty (non-utility) ────────────────────────────────────
  if (txn.channel === 'online' && !NECESSITY_CATS.has(cat)) {
    score -= 5;
  }

  // ── Amount penalty — compare to median of discretionary transactions ─────────
  const discretionary = all.filter(t =>
    t.amount > 0 &&
    !NECESSITY_CATS.has((t.category || '').toUpperCase().replace(/ /g, '_'))
  );
  const amounts = discretionary.map(t => t.amount).sort((a, b) => a - b);
  const median  = amounts[Math.floor(amounts.length / 2)] || 30;

  if      (txn.amount > median * 3.5) score -= 14;
  else if (txn.amount > median * 2.0) score -= 7;
  else if (txn.amount < 12)           score += 4; // small / low-impact

  // ── Repeat-merchant penalty (habitual pattern within 7 days) ────────────────
  const txDate = new Date(txn.date).getTime();
  const repeatNearby = all.filter(t =>
    t.id !== txn.id &&
    (t.merchant || t.name) === merchant &&
    Math.abs(new Date(t.date).getTime() - txDate) < 7 * 86400 * 1000
  );
  if      (repeatNearby.length >= 3) score -= 18;
  else if (repeatNearby.length === 2) score -= 11;
  else if (repeatNearby.length === 1) score -= 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ─── Overall emotional score ───────────────────────────────────────────────────
/**
 * Computes a 0–100 emotional spending score from the transaction list.
 * 0 = fully intentional / disciplined.
 * 100 = almost entirely emotion-driven.
 *
 * Four signals, each 0–1, combined with fixed weights:
 *  1. Impulse-category spend as % of total        (35 %)
 *  2. Food-delivery spend as % of total           (30 %)
 *  3. Repeat-merchant habit pattern               (20 %)
 *  4. Online impulse spend as % of total          (15 %)
 *
 * @param {object[]} txns
 * @returns {number} 0–100
 */
export function calcEmotionalScore(txns) {
  if (!txns || txns.length === 0) return 30;

  const spending = txns.filter(t => t.amount > 0);
  if (spending.length === 0) return 30;

  const total = spending.reduce((s, t) => s + t.amount, 0);
  if (total === 0) return 30;

  const IMPULSE_CATS = new Set(['FOOD_AND_DRINK', 'SHOPS', 'ENTERTAINMENT', 'PERSONAL_CARE']);
  const ESSENTIAL_SUBS = new Set([
    'Groceries', 'Rent', 'Electric', 'Gas', 'Phone', 'Internet', 'Gyms',
    'Pharmacy', 'Doctor',
  ]);

  // ── Signal 1: impulse-category spend ratio ──────────────────────────────────
  let impulsiveSpend = 0;
  spending.forEach(t => {
    const cat = (t.category || '').toUpperCase().replace(/ /g, '_');
    const sub = t.subcategory || '';
    if (ESSENTIAL_SUBS.has(sub)) return; // don't count groceries etc.
    if (IMPULSE_CATS.has(cat)) impulsiveSpend += t.amount;
  });
  const impulseRatio = Math.min(impulsiveSpend / total, 1);

  // ── Signal 2: food-delivery ratio ───────────────────────────────────────────
  const deliverySpend = spending
    .filter(t => DELIVERY_MERCHANTS.has(t.merchant || t.name || ''))
    .reduce((s, t) => s + t.amount, 0);
  const deliveryRatio = Math.min(deliverySpend / total, 1);

  // ── Signal 3: repeat-merchant habit ─────────────────────────────────────────
  const mCounts = {};
  spending.forEach(t => {
    const m = t.merchant || t.name || '?';
    mCounts[m] = (mCounts[m] || 0) + 1;
  });
  // Number of merchants visited 3+ times
  const habitMerchants = Object.values(mCounts).filter(c => c >= 3).length;
  const repeatRatio    = Math.min(habitMerchants / 5, 1); // cap at 5 habit merchants

  // ── Signal 4: online impulse ratio ──────────────────────────────────────────
  const onlineImpulse = spending.filter(t => {
    const cat = (t.category || '').toUpperCase().replace(/ /g, '_');
    return t.channel === 'online' && IMPULSE_CATS.has(cat);
  }).reduce((s, t) => s + t.amount, 0);
  const onlineImpulseRatio = Math.min(onlineImpulse / total, 1);

  // ── Weighted combination ─────────────────────────────────────────────────────
  const raw = (
    impulseRatio       * 0.35 +
    deliveryRatio      * 0.30 +
    repeatRatio        * 0.20 +
    onlineImpulseRatio * 0.15
  );

  // Typical "high" raw score is ~0.65. Normalise so 0.65+ → ~100.
  const score = Math.round(Math.min(raw / 0.65, 1) * 100);
  return Math.max(5, Math.min(95, score));
}
