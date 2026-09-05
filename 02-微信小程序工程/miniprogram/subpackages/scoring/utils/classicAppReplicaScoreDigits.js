/**
 * 正式浅色经典风格：按当前格展示值判断位数。
 * 禁止用本洞最大值、列级或组合容器状态。
 * 深色模式不走本文件色板（记分页仍用原 is-score-classic.dark-mode）。
 * 精英风格不调用本解析器的 class（WXML 仅 classic 绑定 replicaScoreSizeClass）。
 */

function displayedScoreDigitCount(mainDisplay) {
  if (mainDisplay === '' || mainDisplay == null) return 0;
  const s = String(mainDisplay).replace(/^[+-]/, '');
  if (!/^\d+$/.test(s)) return 0;
  return s.length;
}

function isTwoDigitScore(score) {
  return displayedScoreDigitCount(score) === 2;
}

function isThreeDigitScore(score) {
  return displayedScoreDigitCount(score) >= 3;
}

function resolveClassicScoreSizeClass(displayValue) {
  const n = displayedScoreDigitCount(displayValue);
  if (n >= 3) return 'is-replica-score-3digit';
  if (n === 2) return 'is-replica-score-2digit';
  return '';
}

/** 已录入洞的推杆展示：保留合法 0，空值仍默认 1（不改存储）。 */
function resolveFilledHolePutt(raw) {
  if (raw === 0 || raw === '0') return 0;
  if (raw == null || raw === '') return 1;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 1;
}

module.exports = {
  displayedScoreDigitCount,
  isTwoDigitScore,
  isThreeDigitScore,
  resolveClassicScoreSizeClass,
  resolveFilledHolePutt
};
