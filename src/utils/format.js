/**
 * Number Formatting Utility
 * Notation: K, M, B, T, Qa, Qi, Sx, Sp, Oc, No, AA, AB, AC...
 */

const SUFFIXES = [
  '',       // 0:  < 1,000
  'K',      // 1:  thousands
  'M',      // 2:  millions
  'B',      // 3:  billions
  'T',      // 4:  trillions
  'Qa',     // 5:  quadrillions
  'Qi',     // 6:  quintillions
  'Sx',     // 7:  sextillions
  'Sp',     // 8:  septillions
  'Oc',     // 9:  octillions
  'No',     // 10: nonillions
];

/**
 * Generate double-letter suffixes: AA, AB, AC ... AZ, BA, BB ...
 */
function getDoubleSuffix(index) {
  // index 0 = AA, 1 = AB, ... 25 = AZ, 26 = BA ...
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const first = letters[Math.floor(index / 26)];
  const second = letters[index % 26];
  return first && second ? first + second : '??';
}

/**
 * Format a number using the idle game notation system.
 * @param {number} value
 * @param {number} decimals - decimal places (default 2)
 * @returns {string}
 */
export function formatNumber(value, decimals = 2) {
  if (!isFinite(value) || isNaN(value)) return '0.00';
  if (value < 0) return '-' + formatNumber(-value, decimals);
  if (value < 1000) return value.toFixed(decimals);

  // Find the tier
  const tier = Math.floor(Math.log10(value) / 3);

  if (tier < SUFFIXES.length) {
    const suffix = SUFFIXES[tier];
    const scaled = value / Math.pow(1000, tier);
    return scaled.toFixed(decimals) + suffix;
  }

  // Double-letter suffixes start at tier 11 (decillions)
  const doubleIndex = tier - SUFFIXES.length;
  const suffix = getDoubleSuffix(doubleIndex);
  const scaled = value / Math.pow(1000, tier);
  return scaled.toFixed(decimals) + suffix;
}

/**
 * Format credits with a ₢ symbol
 */
export function formatCredits(value) {
  return '₢' + formatNumber(value, 2);
}

/**
 * Format a unit count (ore, refined product)
 */
export function formatUnits(value) {
  return formatNumber(value, 2);
}

/**
 * Format a percentage (0-100)
 */
export function formatPercent(value) {
  return value.toFixed(1) + '%';
}

/**
 * Format time duration in seconds to human readable
 */
export function formatDuration(seconds) {
  if (seconds < 60) return seconds.toFixed(0) + 's';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ' + (seconds % 60).toFixed(0) + 's';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ' + Math.floor((seconds % 3600) / 60) + 'm';
  return Math.floor(seconds / 86400) + 'd ' + Math.floor((seconds % 86400) / 3600) + 'h';
}

/**
 * Parse a formatted number string back to a raw number
 * (used for save/load validation)
 */
export function parseFormattedNumber(str) {
  if (typeof str === 'number') return str;
  const suffixMap = {
    'K': 1e3, 'M': 1e6, 'B': 1e9, 'T': 1e12,
    'Qa': 1e15, 'Qi': 1e18, 'Sx': 1e21, 'Sp': 1e24,
    'Oc': 1e27, 'No': 1e30
  };
  for (const [suffix, multiplier] of Object.entries(suffixMap)) {
    if (str.endsWith(suffix)) {
      return parseFloat(str.slice(0, -suffix.length)) * multiplier;
    }
  }
  return parseFloat(str) || 0;
}
