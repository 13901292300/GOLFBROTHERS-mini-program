/**
 * 同日多场地判定（叶子模块）
 * - 自然日来自本地 YYYY-MM-DD 片段，禁止 Date 字符串 / UTC 换日
 * - 场地身份复用 seriesCourseIdentity（courseId + 前九/后九）
 * - 取消轮、无效日期/场地不参与判断
 */

var seriesCourseIdentity = require('./seriesCourseIdentity.js');

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function parseLocalDateKeyParts(input) {
  var s = asString(input);
  if (!s) return null;
  var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.exec(s);
  if (!m) return null;
  var year = Number(m[1]);
  var month = Number(m[2]);
  var day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year: year, month: month, day: day };
}

function pickRoundField(round, state, key) {
  var fromRound = round && round[key];
  if (fromRound != null && asString(fromRound) !== '') return fromRound;
  return state && state[key];
}

function mergeRoundIdentitySource(round, state) {
  return {
    courseId: pickRoundField(round, state, 'courseId'),
    courseName: pickRoundField(round, state, 'courseName'),
    courseHalfText: pickRoundField(round, state, 'courseHalfText'),
    courseHalf: pickRoundField(round, state, 'courseHalf'),
    halfText: pickRoundField(round, state, 'halfText'),
    front9Course:
      round && round.front9Course != null ? round.front9Course : state && state.front9Course,
    back9Course:
      round && round.back9Course != null ? round.back9Course : state && state.back9Course
  };
}

function resolveRoundDateKey(round, state) {
  var raw = asString(pickRoundField(round, state, 'dateTime'));
  var parts = parseLocalDateKeyParts(raw);
  if (!parts) return '';
  return parts.year + '-' + parts.month + '-' + parts.day;
}

function resolveRoundCourseIdentityKey(round, state) {
  var src = mergeRoundIdentitySource(round, state);
  var key = seriesCourseIdentity.buildSeriesCourseIdentityKey(src);
  if (key) return key;
  var courseId = asString(src.courseId);
  if (!courseId) return '';
  var halves = seriesCourseIdentity.resolveSeriesRoundHalves(src);
  var halfKey = halves.front && halves.back ? halves.front + '/' + halves.back : '';
  return 'id:' + courseId + '|half:' + halfKey;
}

function isCancelledRound(round, state) {
  var rs = asString(round && round.roundStatus) || asString(state && state.roundStatus);
  if (rs === 'cancelled') return true;
  var st = asString(state && (state.state || state.statusToken));
  return st === 'cancelled';
}

function indexStatesByRoundId(roundStates) {
  var map = Object.create(null);
  var list = Array.isArray(roundStates) ? roundStates : [];
  for (var i = 0; i < list.length; i++) {
    var st = list[i] || {};
    var sid = asString(st.roundId);
    if (sid) map[sid] = st;
  }
  return map;
}

/**
 * @returns {Object<string, boolean>} roundId → 属于同日多场地
 */
function collectSameDayMultiCourseRoundIds(roundsInput, roundStates) {
  var rounds = Array.isArray(roundsInput) ? roundsInput : [];
  var stateById = indexStatesByRoundId(roundStates);
  var source = rounds.length ? rounds : Array.isArray(roundStates) ? roundStates : [];
  var eligible = [];
  var dateCourses = Object.create(null);
  var i;
  for (i = 0; i < source.length; i++) {
    var row = source[i] || {};
    var rid = asString(row.roundId);
    if (!rid) continue;
    var stRow = stateById[rid] || (rounds.length ? {} : row);
    var roundRow = rounds.length ? row : {};
    if (isCancelledRound(roundRow, stRow)) continue;
    var dateKey = resolveRoundDateKey(roundRow, stRow);
    var courseKey = resolveRoundCourseIdentityKey(roundRow, stRow);
    if (!dateKey || !courseKey) continue;
    eligible.push({ roundId: rid, dateKey: dateKey });
    if (!dateCourses[dateKey]) dateCourses[dateKey] = Object.create(null);
    dateCourses[dateKey][courseKey] = true;
  }
  var multiDay = Object.create(null);
  Object.keys(dateCourses).forEach(function (dk) {
    if (Object.keys(dateCourses[dk]).length >= 2) multiDay[dk] = true;
  });
  var out = Object.create(null);
  for (i = 0; i < eligible.length; i++) {
    if (multiDay[eligible[i].dateKey]) out[eligible[i].roundId] = true;
  }
  return out;
}

module.exports = {
  parseLocalDateKeyParts: parseLocalDateKeyParts,
  resolveRoundDateKey: resolveRoundDateKey,
  resolveRoundCourseIdentityKey: resolveRoundCourseIdentityKey,
  collectSameDayMultiCourseRoundIds: collectSameDayMultiCourseRoundIds
};
