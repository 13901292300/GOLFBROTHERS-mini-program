/**
 * 球队比赛标题规范（主包纯函数）
 * Series 标题唯一入口：sanitizeTitleText / normalizeSeriesNameInput / normalizeSeriesSubtitleInput。
 * Series 名称最多 18 个用户字符、副标题最多 12 个；普通比赛 roundName 最多 14 个。
 * 系统「 · Rx」不计入副标题额度、不写入字段。
 * 读路径不截断历史超长数据；写路径在用户实际修改后强制新上限。
 */

var teamDirectory = require('./teamDirectory.js');

var MATCH_TITLE_MAX = 14;
var SERIES_NAME_MAX = 18;
var SERIES_SUBTITLE_MAX = 12;
var INTERNAL_AUTO_SUFFIX = '月例赛';
var INTER_AUTO_SUFFIX = '联谊赛';
var TRAILING_SYSTEM_RX = /(?:[（(]R\d+[）)]| · R\d+)\s*$/;

function asString(v) {
  return v == null ? '' : String(v);
}

function stripTitleNewlines(raw) {
  return asString(raw).replace(/[\r\n\u2028\u2029]+/g, '');
}

function sanitizeTitleText(raw) {
  return stripTitleNewlines(raw).trim();
}

function countTypingChars(raw) {
  return teamDirectory.charLength(stripTitleNewlines(raw));
}

function countTitleChars(raw) {
  return teamDirectory.charLength(sanitizeTitleText(raw));
}

function titlesEqual(a, b) {
  return sanitizeTitleText(a) === sanitizeTitleText(b);
}

function clipTitleChars(raw, max) {
  var limit = Number(max);
  if (!Number.isFinite(limit) || limit < 0) limit = MATCH_TITLE_MAX;
  var text = sanitizeTitleText(raw);
  if (teamDirectory.charLength(text) <= limit) return text;
  return teamDirectory.sliceChars(text, limit);
}

function stripTrailingSystemRoundSuffix(raw) {
  var s = sanitizeTitleText(raw);
  var next;
  while (TRAILING_SYSTEM_RX.test(s)) {
    next = sanitizeTitleText(s.replace(TRAILING_SYSTEM_RX, ''));
    if (next === s) break;
    s = next;
  }
  return s;
}

function resolveInputMaxlength(currentValue, max) {
  var limit = Number(max);
  if (!Number.isFinite(limit) || limit < 1) limit = MATCH_TITLE_MAX;
  var n = countTypingChars(currentValue);
  return n > limit ? n : limit;
}

/**
 * 输入过程：清换行；未改历史值时不截断；一旦改动则夹到 max。
 */
function constrainTyping(raw, options) {
  var opts = options || {};
  var max = opts.max != null ? Number(opts.max) : MATCH_TITLE_MAX;
  var text = stripTitleNewlines(raw);
  if (opts.previous != null && titlesEqual(text, opts.previous)) return text;
  if (Number.isFinite(max) && teamDirectory.charLength(text) > max) {
    return teamDirectory.sliceChars(text, max);
  }
  return text;
}

/**
 * @param {string} raw
 * @param {{ required?: boolean, max?: number, previous?: string }} [options]
 */
function normalizeTitleInput(raw, options) {
  var opts = options || {};
  var max = opts.max != null ? Number(opts.max) : MATCH_TITLE_MAX;
  var text = sanitizeTitleText(raw);
  if (text === '') {
    if (opts.required) return { ok: false, reason: 'empty', value: '' };
    return { ok: true, value: '' };
  }
  if (opts.previous != null && titlesEqual(text, opts.previous)) {
    return { ok: true, value: text, unchanged: true };
  }
  if (!Number.isFinite(max) || text === '') {
    return { ok: true, value: text };
  }
  if (teamDirectory.charLength(text) > max) {
    return { ok: false, reason: 'length', value: text };
  }
  return { ok: true, value: text };
}

/**
 * 副标题选填。系统 · Rx 不计入 10 字额度，也不写入用户字段。
 * 历史超长且未改动时放行。
 */
function normalizeSubtitleInput(raw, options) {
  var opts = options || {};
  var max = opts.max != null ? Number(opts.max) : SERIES_SUBTITLE_MAX;
  var text = sanitizeTitleText(raw);
  if (opts.previous != null && titlesEqual(text, opts.previous)) {
    return { ok: true, value: text, unchanged: true };
  }
  text = stripTrailingSystemRoundSuffix(text);
  if (teamDirectory.charLength(text) > max) {
    return { ok: false, reason: 'length', value: text };
  }
  return { ok: true, value: text };
}

function normalizeSeriesNameInput(raw, options) {
  return normalizeTitleInput(
    raw,
    Object.assign({ required: true, max: SERIES_NAME_MAX }, options || {})
  );
}

function normalizeSeriesSubtitleInput(raw, options) {
  return normalizeSubtitleInput(
    raw,
    Object.assign({ max: SERIES_SUBTITLE_MAX }, options || {})
  );
}

function buildAutoInternalRoundName(teamName) {
  var name = sanitizeTitleText(teamName);
  if (!name) return '';
  var suffix = INTERNAL_AUTO_SUFFIX;
  var budget = MATCH_TITLE_MAX - countTitleChars(suffix);
  if (budget < 1) return clipTitleChars(suffix, MATCH_TITLE_MAX);
  return clipTitleChars(name, budget) + suffix;
}

function buildAutoInterRoundName(teamGroups) {
  var groups = Array.isArray(teamGroups) ? teamGroups : [];
  var count = groups.length;
  var suffix = INTER_AUTO_SUFFIX;
  if (count < 2 || count > 4) {
    return clipTitleChars(suffix, MATCH_TITLE_MAX);
  }
  var names = [];
  for (var i = 0; i < groups.length; i++) {
    var n = sanitizeTitleText(groups[i] && groups[i].name);
    if (n) names.push(n);
  }
  if (names.length < 2) {
    return clipTitleChars(suffix, MATCH_TITLE_MAX);
  }
  var budget = MATCH_TITLE_MAX - countTitleChars(suffix);
  if (budget < 1) return clipTitleChars(suffix, MATCH_TITLE_MAX);
  return clipTitleChars(names.join('&'), budget) + suffix;
}

module.exports = {
  MATCH_TITLE_MAX: MATCH_TITLE_MAX,
  SERIES_NAME_MAX: SERIES_NAME_MAX,
  SERIES_SUBTITLE_MAX: SERIES_SUBTITLE_MAX,
  INTERNAL_AUTO_SUFFIX: INTERNAL_AUTO_SUFFIX,
  INTER_AUTO_SUFFIX: INTER_AUTO_SUFFIX,
  stripTitleNewlines: stripTitleNewlines,
  sanitizeTitleText: sanitizeTitleText,
  countTypingChars: countTypingChars,
  countTitleChars: countTitleChars,
  titlesEqual: titlesEqual,
  clipTitleChars: clipTitleChars,
  stripTrailingSystemRoundSuffix: stripTrailingSystemRoundSuffix,
  resolveInputMaxlength: resolveInputMaxlength,
  constrainTyping: constrainTyping,
  normalizeTitleInput: normalizeTitleInput,
  normalizeSubtitleInput: normalizeSubtitleInput,
  normalizeSeriesNameInput: normalizeSeriesNameInput,
  normalizeSeriesSubtitleInput: normalizeSeriesSubtitleInput,
  buildAutoInternalRoundName: buildAutoInternalRoundName,
  buildAutoInterRoundName: buildAutoInterRoundName
};
