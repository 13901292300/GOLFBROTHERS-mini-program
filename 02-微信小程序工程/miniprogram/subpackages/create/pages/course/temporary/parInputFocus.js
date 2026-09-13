/**
 * Temporary Course PAR 输入跳格（纯 UI）。
 * 不改 holePars 模型 / VALID_PARS；不写 storage。
 */

const temporaryCourse = require('../../../../../utils/temporaryCourse.js');

function lastDigitRaw(raw) {
  const s = raw == null ? '' : String(raw);
  if (!s) return '';
  return s.length > 1 ? s.charAt(s.length - 1) : s;
}

/** 合法 PAR → 下一洞 index；第18洞 → null；非法 → 停在当前洞 */
function nextFocusedHoleIndex(index, parsed) {
  if (!Number.isInteger(index) || index < 0 || index > 17) return null;
  if (!temporaryCourse.isValidPar(parsed)) return index;
  if (index >= 17) return null;
  return index + 1;
}

/**
 * @param {{ holePars: Array, index: number, raw: * }} state
 * @returns {{ holePars: Array, parsed: number|null, focusedHoleIndex: number|null }}
 */
function applyParInput(state) {
  const src = state && typeof state === 'object' ? state : {};
  const index = src.index;
  const holePars = Array.isArray(src.holePars) ? src.holePars.slice() : [];
  const parsed = temporaryCourse.parseParInput(lastDigitRaw(src.raw));
  if (Number.isInteger(index) && index >= 0 && index <= 17) {
    holePars[index] = parsed;
  }
  return {
    holePars: holePars,
    parsed: parsed,
    focusedHoleIndex: nextFocusedHoleIndex(index, parsed)
  };
}

module.exports = {
  lastDigitRaw: lastDigitRaw,
  nextFocusedHoleIndex: nextFocusedHoleIndex,
  applyParInput: applyParInput
};
