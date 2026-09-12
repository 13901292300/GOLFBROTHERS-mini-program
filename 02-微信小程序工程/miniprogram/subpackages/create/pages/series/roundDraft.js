/**
 * 系列赛 Step4 轮次草稿纯函数（create 分包内）。
 * 不依赖 Page / wx / storage / 组件。
 */

var seriesModel = require('../../../../utils/seriesModel.js');
var createTeeTimeNow = require('../../../../utils/createTeeTimeNow.js');

var DEFAULT_TOP_N = 3;
var FEE_PATTERN = /^(0|[1-9]\d*)(\.\d{1,2})?$/;
var LOCAL_DT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/;

/** 出厂轮次已知字段；其它自有属性若有实质内容，一律视为已有配置 */
var KNOWN_ROUND_KEYS = {
  roundId: true,
  index: true,
  name: true,
  roundStatus: true,
  dateTime: true,
  dateTimeUserEdited: true,
  fee: true,
  gameMode: true,
  topN: true,
  topNUserEdited: true,
  courseId: true,
  courseName: true,
  courseLocation: true,
  front9Course: true,
  back9Course: true,
  courseHalfText: true,
  matchId: true,
  createdAt: true,
  updatedAt: true
};

/** 前瞻：阵容/报名/分组/成绩等引用字段，非空即视为已有配置 */
var ROUND_REF_KEYS = [
  'roster',
  'entries',
  'groups',
  'groupIds',
  'pairings',
  'results',
  'resultIds',
  'stationId',
  'stationRef',
  'registrationIds',
  'lineup',
  'participantIds',
  'matchRefs'
];

function deepClone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatLocalDateTime(date) {
  return (
    date.getFullYear() +
    '-' +
    pad2(date.getMonth() + 1) +
    '-' +
    pad2(date.getDate()) +
    ' ' +
    pad2(date.getHours()) +
    ':' +
    pad2(date.getMinutes())
  );
}

function parseLocalDateTimeParts(dateTimeStr) {
  var m = String(dateTimeStr == null ? '' : dateTimeStr).match(LOCAL_DT_PATTERN);
  if (!m) return null;
  var y = Number(m[1]);
  var mo = Number(m[2]);
  var d = Number(m[3]);
  var h = Number(m[4]);
  var mi = Number(m[5]);
  if (
    !Number.isInteger(y) ||
    !Number.isInteger(mo) ||
    !Number.isInteger(d) ||
    !Number.isInteger(h) ||
    !Number.isInteger(mi)
  ) {
    return null;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h < 0 || h > 23 || mi < 0 || mi > 59) {
    return null;
  }
  var dt = new Date(y, mo - 1, d, h, mi, 0, 0);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== mo - 1 ||
    dt.getDate() !== d ||
    dt.getHours() !== h ||
    dt.getMinutes() !== mi
  ) {
    return null;
  }
  return { year: y, month: mo, day: d, hour: h, minute: mi, date: dt };
}

function isNonEmptyString(value) {
  return value != null && String(value).trim() !== '';
}

function isDefaultRoundName(round) {
  if (!round) return true;
  var name = round.name == null ? '' : String(round.name);
  if (name.trim() === '') return true;
  var idx = Number(round.index);
  if (!Number.isFinite(idx)) return false;
  return name === 'ROUND ' + idx;
}

function hasCourseSnapshot(round) {
  if (!round) return false;
  if (isNonEmptyString(round.courseId)) return true;
  if (isNonEmptyString(round.courseName)) return true;
  if (isNonEmptyString(round.courseLocation)) return true;
  if (isNonEmptyString(round.courseHalfText)) return true;
  if (round.front9Course != null && String(round.front9Course).trim() !== '') return true;
  if (round.back9Course != null && String(round.back9Course).trim() !== '') return true;
  return false;
}

function valueLooksConfigured(val) {
  if (val == null) return false;
  if (Array.isArray(val)) return val.length > 0;
  if (typeof val === 'string') return val.trim() !== '';
  if (typeof val === 'object') return Object.keys(val).length > 0;
  if (typeof val === 'number') return Number.isFinite(val);
  if (typeof val === 'boolean') return val === true;
  return true;
}

function hasRefFields(round) {
  if (!round || typeof round !== 'object') return false;
  for (var i = 0; i < ROUND_REF_KEYS.length; i++) {
    if (valueLooksConfigured(round[ROUND_REF_KEYS[i]])) return true;
  }
  return false;
}

/** 未知业务字段（不在出厂 schema 内）有实质内容 → 已有配置 */
function hasUnknownBusinessFields(round) {
  if (!round || typeof round !== 'object') return false;
  for (var key in round) {
    if (!Object.prototype.hasOwnProperty.call(round, key)) continue;
    if (KNOWN_ROUND_KEYS[key]) continue;
    if (valueLooksConfigured(round[key])) return true;
  }
  return false;
}

/**
 * topN 缺省 / '' / 3 / '3' 视为默认；其余存在值（含非法）一律算已有配置。
 */
function isDefaultTopNValue(topN) {
  if (topN == null) return true;
  if (typeof topN === 'string' && topN.trim() === '') return true;
  var n = Number(topN);
  return Number.isFinite(n) && Number.isInteger(n) && n === DEFAULT_TOP_N;
}

/**
 * 空轮次打开时间选择器时的动态默认值。
 * - now 可注入（Date 或可被 Date 解析的值）；未传用当前本地时间
 * - 按公共 10 分钟档取整（5 分钟为界），跨日走 Date
 * @param {Date|number|string=} now
 * @returns {string} YYYY-MM-DD HH:mm
 */
function createDefaultLocalDateTime(now) {
  return createTeeTimeNow.formatIsoLocal(
    createTeeTimeNow.roundDraftToTenMinutes(createTeeTimeNow.partsFromDate(now))
  );
}

function copyCourseSnapshot(fromRound, toRound) {
  var next = deepClone(toRound);
  var src = fromRound || {};
  next.courseId = src.courseId != null ? String(src.courseId) : '';
  next.courseName = src.courseName != null ? String(src.courseName) : '';
  next.courseLocation = src.courseLocation != null ? String(src.courseLocation) : '';
  next.front9Course = src.front9Course != null ? deepClone(src.front9Course) : null;
  next.back9Course = src.back9Course != null ? deepClone(src.back9Course) : null;
  next.courseHalfText = src.courseHalfText != null ? String(src.courseHalfText) : '';
  return next;
}

/**
 * 安全重排：仅当名称为空或严格等于「ROUND {旧 index}」时才改名为 ROUND {新 index}。
 * 不使用 seriesModel.reindexRounds，避免 ROUND 99 被当成默认名改写。
 */
function reindexRoundsSafe(rounds) {
  var list = Array.isArray(rounds) ? rounds : [];
  return list.map(function (r, i) {
    var next = deepClone(r) || {};
    var oldIndex = Number(next.index);
    if (!Number.isFinite(oldIndex)) oldIndex = i + 1;
    var wasDefault = isDefaultRoundName({ name: next.name, index: oldIndex });
    next.index = i + 1;
    if (wasDefault) next.name = 'ROUND ' + next.index;
    if (typeof seriesModel.nowIso === 'function') {
      next.updatedAt = seriesModel.nowIso();
    }
    return next;
  });
}

function parseStrictRoundCount(raw) {
  var text = String(raw == null ? '' : raw).trim();
  if (text === '') return null;
  var value = Number(text);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 2) return null;
  return value;
}

function parseStrictTopN(raw) {
  var text = String(raw == null ? '' : raw).trim();
  if (text === '') return null;
  var value = Number(text);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) return null;
  return value;
}

function isTopNUserEdited(round) {
  return !!(round && round.topNUserEdited === true);
}

/**
 * 规则区默认 N：缺省视为 3；已有非法值失败（不猜测）。
 * @returns {{ ok: boolean, value: number|null, present: boolean }}
 */
function resolveDefaultTopNForRule(rule) {
  if (!rule || rule.defaultTopN == null || String(rule.defaultTopN).trim() === '') {
    return { ok: true, value: DEFAULT_TOP_N, present: false };
  }
  var n = parseStrictTopN(rule.defaultTopN);
  if (n == null) return { ok: false, value: null, present: true };
  return { ok: true, value: n, present: true };
}

/**
 * 将合法默认 N 写入未独立编辑的轮次。不改输入数组/原对象。
 * @returns {{ ok: boolean, rounds: object[]|null, changedRoundIds: string[], reason?: string }}
 */
function applyDefaultTopNToRounds(rounds, nextDefaultN, options) {
  var n = parseStrictTopN(nextDefaultN);
  if (n == null) {
    return {
      ok: false,
      reason: 'invalid_top_n',
      rounds: null,
      changedRoundIds: []
    };
  }
  var opts = options && typeof options === 'object' ? options : {};
  var list = Array.isArray(rounds) ? rounds : [];
  var changedRoundIds = [];
  var now = typeof seriesModel.nowIso === 'function' ? seriesModel.nowIso() : '';
  var nextRounds = list.map(function (r) {
    var round = deepClone(r) || {};
    if (isTopNUserEdited(round) && opts.forceAll !== true) {
      return round;
    }
    var cur = parseStrictTopN(round.topN);
    if (cur === n) {
      return round;
    }
    round.topN = n;
    round.topNUserEdited = false;
    if (now) round.updatedAt = now;
    if (round.roundId) changedRoundIds.push(String(round.roundId));
    return round;
  });
  return {
    ok: true,
    rounds: nextRounds,
    changedRoundIds: changedRoundIds
  };
}

/**
 * @returns {{ ok: boolean, value: string|null, reason?: string }}
 */
function parseFeeInput(raw) {
  var text = String(raw == null ? '' : raw).trim();
  if (text === '') return { ok: true, value: '' };
  if (!FEE_PATTERN.test(text)) {
    return { ok: false, value: null, reason: 'invalid_fee' };
  }
  return { ok: true, value: text };
}

function roundHasUserData(round) {
  if (!round || typeof round !== 'object') return false;
  if (!isDefaultRoundName(round)) return true;
  if (round.dateTimeUserEdited === true) return true;
  if (round.topNUserEdited === true) return true;
  if (isNonEmptyString(round.dateTime)) return true;
  if (hasCourseSnapshot(round)) return true;
  if (round.fee != null && String(round.fee).trim() !== '') return true;
  if (isNonEmptyString(round.gameMode)) return true;
  if (!isDefaultTopNValue(round.topN)) return true;
  if (round.roundStatus != null && String(round.roundStatus).trim() !== '' && round.roundStatus !== 'scheduled') {
    return true;
  }
  if (round.matchId != null && String(round.matchId).trim() !== '') return true;
  if (hasRefFields(round)) return true;
  if (hasUnknownBusinessFields(round)) return true;
  return false;
}

/**
 * @returns {{ ok: boolean, dateTime: string|null, reason?: string }}
 */
function addLocalHours(dateTimeStr, hours) {
  var parts = parseLocalDateTimeParts(dateTimeStr);
  if (!parts) {
    return { ok: false, dateTime: null, reason: 'invalid_datetime' };
  }
  var delta = Number(hours);
  if (!Number.isFinite(delta)) {
    return { ok: false, dateTime: null, reason: 'invalid_hours' };
  }
  var next = new Date(parts.date.getTime() + delta * 3600 * 1000);
  return { ok: true, dateTime: formatLocalDateTime(next) };
}

/**
 * @returns {{
 *   ok: boolean,
 *   rounds?: object[],
 *   needConfirm?: boolean,
 *   removed?: object[],
 *   reason?: string
 * }}
 */
function resizeRounds(rounds, targetCount, options) {
  var target = parseStrictRoundCount(targetCount);
  if (target == null) {
    return { ok: false, reason: 'invalid_count', rounds: null };
  }
  var opts = options && typeof options === 'object' ? options : {};
  var inheritTopN = parseStrictTopN(opts.defaultTopN);
  var cur = deepClone(Array.isArray(rounds) ? rounds : []);
  if (target === cur.length) {
    return {
      ok: true,
      rounds: reindexRoundsSafe(cur),
      needConfirm: false,
      removed: []
    };
  }

  if (target > cur.length) {
    var firstRound = null;
    for (var fi = 0; fi < cur.length; fi++) {
      if (cur[fi] && Number(cur[fi].index) === 1) {
        firstRound = cur[fi];
        break;
      }
    }
    if (!firstRound && cur.length) firstRound = cur[0];

    while (cur.length < target) {
      var prev = cur.length ? cur[cur.length - 1] : null;
      var blank = seriesModel.createBlankRound(cur.length + 1, null);
      blank.topNUserEdited = false;
      if (inheritTopN != null) {
        blank.topN = inheritTopN;
      }
      if (prev && hasCourseSnapshot(prev)) {
        blank = copyCourseSnapshot(prev, blank);
      }
      if (prev && isNonEmptyString(prev.dateTime)) {
        var added = addLocalHours(prev.dateTime, 24);
        if (!added.ok) {
          return {
            ok: false,
            reason: 'invalid_datetime',
            rounds: null
          };
        }
        blank.dateTime = added.dateTime;
        blank.dateTimeUserEdited = false;
      }
      // 新增轮次默认继承当前第 1 轮赛制；不改已有轮次
      if (firstRound && isNonEmptyString(firstRound.gameMode)) {
        blank.gameMode = String(firstRound.gameMode).trim();
      }
      cur.push(blank);
    }
    return {
      ok: true,
      rounds: reindexRoundsSafe(cur),
      needConfirm: false,
      removed: []
    };
  }

  var removed = cur.slice(target).map(deepClone);
  var needConfirm = removed.some(function (r) {
    return roundHasUserData(r);
  });
  var next = cur.slice(0, target);
  return {
    ok: true,
    rounds: reindexRoundsSafe(next),
    needConfirm: needConfirm,
    removed: removed
  };
}

/**
 * @param {object[]} rounds
 * @param {string} fromRoundId
 * @param {object} courseSnapshot
 * @returns {{ ok: boolean, rounds?: object[], reason?: string }}
 */
function cascadeCourseFromRound(rounds, fromRoundId, courseSnapshot) {
  var list = deepClone(Array.isArray(rounds) ? rounds : []);
  var rid = fromRoundId != null ? String(fromRoundId).trim() : '';
  if (!rid) return { ok: false, reason: 'missing_round_id', rounds: null };
  var snap = courseSnapshot || {};
  var startIndex = -1;
  var i;
  for (i = 0; i < list.length; i++) {
    if (list[i] && String(list[i].roundId) === rid) {
      startIndex = i;
      break;
    }
  }
  if (startIndex < 0) return { ok: false, reason: 'round_not_found', rounds: null };

  var template = {
    courseId: snap.courseId != null ? String(snap.courseId) : '',
    courseName: snap.courseName != null ? String(snap.courseName) : '',
    courseLocation: snap.courseLocation != null ? String(snap.courseLocation) : '',
    front9Course: snap.front9Course != null ? deepClone(snap.front9Course) : null,
    back9Course: snap.back9Course != null ? deepClone(snap.back9Course) : null,
    courseHalfText: snap.courseHalfText != null ? String(snap.courseHalfText) : ''
  };

  for (i = startIndex; i < list.length; i++) {
    list[i] = copyCourseSnapshot(template, list[i]);
    if (typeof seriesModel.nowIso === 'function') {
      list[i].updatedAt = seriesModel.nowIso();
    }
  }
  return { ok: true, rounds: list };
}

/**
 * @param {object[]} rounds
 * @param {string} fromRoundId
 * @param {string} newDateTime
 * @returns {{ ok: boolean, rounds?: object[], reason?: string }}
 */
function cascadeDateTimeFromRound(rounds, fromRoundId, newDateTime) {
  var list = deepClone(Array.isArray(rounds) ? rounds : []);
  var rid = fromRoundId != null ? String(fromRoundId).trim() : '';
  if (!rid) return { ok: false, reason: 'missing_round_id', rounds: null };

  var parsedNew = parseLocalDateTimeParts(newDateTime);
  if (!parsedNew) {
    return { ok: false, reason: 'invalid_datetime', rounds: null };
  }
  var formattedNew = formatLocalDateTime(parsedNew.date);

  var startIndex = -1;
  var i;
  for (i = 0; i < list.length; i++) {
    if (list[i] && String(list[i].roundId) === rid) {
      startIndex = i;
      break;
    }
  }
  if (startIndex < 0) return { ok: false, reason: 'round_not_found', rounds: null };

  list[startIndex] = deepClone(list[startIndex]);
  list[startIndex].dateTime = formattedNew;
  list[startIndex].dateTimeUserEdited = true;
  if (typeof seriesModel.nowIso === 'function') {
    list[startIndex].updatedAt = seriesModel.nowIso();
  }

  var anchor = formattedNew;
  for (i = startIndex + 1; i < list.length; i++) {
    var cur = deepClone(list[i]);
    if (cur.dateTimeUserEdited === true) {
      if (!isNonEmptyString(cur.dateTime)) {
        return { ok: false, reason: 'invalid_anchor_datetime', rounds: null };
      }
      var anchorParts = parseLocalDateTimeParts(cur.dateTime);
      if (!anchorParts) {
        return { ok: false, reason: 'invalid_anchor_datetime', rounds: null };
      }
      cur.dateTime = formatLocalDateTime(anchorParts.date);
      anchor = cur.dateTime;
      list[i] = cur;
      continue;
    }
    var nextDt = addLocalHours(anchor, 24);
    if (!nextDt.ok) {
      return { ok: false, reason: nextDt.reason || 'invalid_datetime', rounds: null };
    }
    cur.dateTime = nextDt.dateTime;
    cur.dateTimeUserEdited = false;
    if (typeof seriesModel.nowIso === 'function') {
      cur.updatedAt = seriesModel.nowIso();
    }
    list[i] = cur;
    anchor = cur.dateTime;
  }

  return { ok: true, rounds: list };
}

function topNLabelForGameMode(gameMode) {
  var mode = gameMode != null ? String(gameMode) : '';
  if (mode === '个人比杆赛') return '最佳 N 名';
  if (
    mode === '四人四球比杆赛' ||
    mode === '四人两球比杆赛' ||
    mode === '最佳球位比杆赛'
  ) {
    return '最佳 N 组';
  }
  return '最佳 N 份计分结果';
}

function _isFirstRoundCard(round, indexInList) {
  if (!round) return false;
  if (Number(round.index) === 1) return true;
  return indexInList === 0 && (round.index == null || round.index === '' || Number(round.index) === 1);
}

/**
 * 设置某轮赛制（纯函数，不原地改输入）。
 * - 第 1 轮：将 gameMode 同步覆盖至全部后续轮次
 * - 非第 1 轮：仅改该轮，不反向影响 R1/其他轮
 * - 同值幂等：changed=false
 * - 只写 gameMode（及 updatedAt）；不同步名称/时间/球场/费用/Top N
 *
 * @returns {{ ok: boolean, changed: boolean, batched: boolean, reason?: string, rounds: object[]|null }}
 */
function applyRoundGameMode(rounds, roundId, gameMode) {
  var list = deepClone(Array.isArray(rounds) ? rounds : []);
  var rid = roundId != null ? String(roundId).trim() : '';
  var mode = gameMode != null ? String(gameMode).trim() : '';
  if (!rid) {
    return { ok: false, reason: 'missing_round_id', changed: false, batched: false, rounds: null };
  }
  if (!mode || !seriesModel.GAME_MODE[mode]) {
    return { ok: false, reason: 'invalid_game_mode', changed: false, batched: false, rounds: null };
  }

  var targetIndex = -1;
  var i;
  for (i = 0; i < list.length; i++) {
    if (list[i] && String(list[i].roundId) === rid) {
      targetIndex = i;
      break;
    }
  }
  if (targetIndex < 0) {
    return { ok: false, reason: 'round_not_found', changed: false, batched: false, rounds: null };
  }

  var batched = _isFirstRoundCard(list[targetIndex], targetIndex);
  var changed = false;
  var now = typeof seriesModel.nowIso === 'function' ? seriesModel.nowIso() : '';

  function writeMode(idx) {
    if (!list[idx]) return;
    var cur = list[idx].gameMode != null ? String(list[idx].gameMode) : '';
    if (cur === mode) return;
    list[idx] = deepClone(list[idx]);
    list[idx].gameMode = mode;
    if (now) list[idx].updatedAt = now;
    changed = true;
  }

  if (batched) {
    for (i = 0; i < list.length; i++) writeMode(i);
  } else {
    writeMode(targetIndex);
  }

  return {
    ok: true,
    changed: changed,
    batched: batched,
    rounds: list
  };
}

function roundsHaveUserData(rounds) {
  var list = Array.isArray(rounds) ? rounds : [];
  for (var i = 0; i < list.length; i++) {
    if (roundHasUserData(list[i])) return true;
  }
  return false;
}

module.exports = {
  DEFAULT_TOP_N: DEFAULT_TOP_N,
  deepClone: deepClone,
  parseStrictRoundCount: parseStrictRoundCount,
  parseStrictTopN: parseStrictTopN,
  isTopNUserEdited: isTopNUserEdited,
  resolveDefaultTopNForRule: resolveDefaultTopNForRule,
  applyDefaultTopNToRounds: applyDefaultTopNToRounds,
  parseFeeInput: parseFeeInput,
  roundHasUserData: roundHasUserData,
  roundsHaveUserData: roundsHaveUserData,
  isDefaultRoundName: isDefaultRoundName,
  isDefaultTopNValue: isDefaultTopNValue,
  createDefaultLocalDateTime: createDefaultLocalDateTime,
  addLocalHours: addLocalHours,
  parseLocalDateTimeParts: parseLocalDateTimeParts,
  formatLocalDateTime: formatLocalDateTime,
  resizeRounds: resizeRounds,
  cascadeCourseFromRound: cascadeCourseFromRound,
  cascadeDateTimeFromRound: cascadeDateTimeFromRound,
  applyRoundGameMode: applyRoundGameMode,
  reindexRoundsSafe: reindexRoundsSafe,
  topNLabelForGameMode: topNLabelForGameMode,
  copyCourseSnapshot: copyCourseSnapshot
};
