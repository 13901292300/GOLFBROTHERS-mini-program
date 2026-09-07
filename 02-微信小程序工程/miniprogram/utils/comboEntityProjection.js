/**
 * 组合 entity/pair 榜单投影薄封装。
 * 名称只走 comboDisplayName.formatComboDisplayName；不复制内部标签正则。
 * 成绩是否存在按正式数值字段判断（0 / 平杆合法，空串与 NaN 不算）。
 */
var comboDisplayName = require('./comboDisplayName.js');
var matchStatus = require('./matchStatus.js');

function isFilledNumericScore(score) {
  if (typeof matchStatus.isFilledScore === 'function') {
    if (!matchStatus.isFilledScore(score)) return false;
  } else if (score == null || score === '') {
    return false;
  }
  return Number.isFinite(Number(score));
}

function hasFiniteMetric(v) {
  return v != null && v !== '' && Number.isFinite(Number(v));
}

function entityScoreRecordHasValue(rec) {
  if (!rec || typeof rec !== 'object') return false;
  var scores = Array.isArray(rec.scores) ? rec.scores : [];
  var i;
  for (i = 0; i < scores.length; i++) {
    if (isFilledNumericScore(scores[i])) return true;
  }
  if (hasFiniteMetric(rec.grossTotal) || hasFiniteMetric(rec.gross)) return true;
  if (hasFiniteMetric(rec.toPar) || hasFiniteMetric(rec.diff)) return true;
  if (hasFiniteMetric(rec.points) || hasFiniteMetric(rec.pointsTotal)) return true;
  if (hasFiniteMetric(rec.net) || hasFiniteMetric(rec.rankingValue)) return true;
  if (rec.resultSnapshot && typeof rec.resultSnapshot === 'object') {
    if (rec.resultSnapshot !== rec && entityScoreRecordHasValue(rec.resultSnapshot)) return true;
  }
  return false;
}

function shouldKeepEntityComboRow(entityId, memberIds, scoreRec) {
  if (!entityId) return false;
  if (memberIds && memberIds.length) return true;
  return entityScoreRecordHasValue(scoreRec);
}

function memberPublicName(raw) {
  if (raw == null) return '';
  if (typeof raw === 'string' || typeof raw === 'number') {
    var s = comboDisplayName.pickPublicName([raw]);
    return s === '未知球员' ? '' : s;
  }
  var n = comboDisplayName.pickPublicName([
    raw.matchNickname,
    raw.competitionName,
    raw.displayName,
    raw.name,
    raw.realName,
    raw.nickname
  ]);
  return n === '未知球员' ? '' : n;
}

function formatEntityComboDisplayName(entity, members) {
  return comboDisplayName.formatComboDisplayName({
    savedNames: [
      entity && entity.name,
      entity && entity.displayName,
      entity && entity.teamName
    ],
    members: members || [],
    emptyFallback: '组合'
  });
}

function fallbackComboUnitName(resultUnitType, unitName) {
  var n = unitName == null ? '' : String(unitName).trim();
  if (n) return n;
  var t = resultUnitType == null ? '' : String(resultUnitType).trim();
  if (t === 'entity' || t === 'pair') return '组合';
  return '';
}

module.exports = {
  isFilledNumericScore: isFilledNumericScore,
  entityScoreRecordHasValue: entityScoreRecordHasValue,
  shouldKeepEntityComboRow: shouldKeepEntityComboRow,
  formatEntityComboDisplayName: formatEntityComboDisplayName,
  memberPublicName: memberPublicName,
  fallbackComboUnitName: fallbackComboUnitName
};
