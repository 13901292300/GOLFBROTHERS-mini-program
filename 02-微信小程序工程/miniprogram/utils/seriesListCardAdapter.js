/**
 * 首页 / 广场 Series 列表投影（主包最小依赖）
 * - 过滤 Series-managed 分站（managed + seriesId/roundId/publishToken）
 * - 聚合为单张 Series 卡；不删 storage；不 require 分包 VM / publish
 */

var clubDateFormat = require('./clubDateFormat.js');
var seriesGameModeLabel = require('./seriesGameModeLabel.js');
var seriesPlazaLiveSubtitle = require('./seriesPlazaLiveSubtitle.js');
var seriesRoundPhaseAggregate = require('./seriesRoundPhaseAggregate.js');
var seriesFinishLock = require('./seriesFinishLock.js');
var seriesRyderCupAccumulate = require('./seriesRyderCupAccumulate.js');
var seriesRyderCup = require('./seriesRyderCup.js');
var seriesCourseIdentity = require('./seriesCourseIdentity.js');
var seriesRoundVisualState = require('./seriesRoundVisualState.js');

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function safeNum(v, fallback) {
  var n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** 稳定排序时间：优先 createdAt，其次可解析的 ISO 时间戳 */
function stableTimeMs(entity) {
  if (!entity || typeof entity !== 'object') return 0;
  var c = entity.createdAt;
  if (typeof c === 'number' && Number.isFinite(c)) return c;
  if (c != null && String(c).trim() !== '') {
    var parsed = Date.parse(String(c));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

/**
 * 公共列表是否应隐藏该 match（托管分站）
 * 必须 managed===true 且三元组齐全；否则不隐藏（防误删普通赛）
 */
function shouldHideManagedStationFromPublicLists(match) {
  if (!match || typeof match !== 'object') return false;
  var ctx = match.seriesContext;
  if (!ctx || typeof ctx !== 'object') return false;
  if (ctx.managed !== true) return false;
  var sid = asString(ctx.seriesId);
  var rid = asString(ctx.roundId);
  var tok = asString(ctx.publishToken);
  return !!(sid && rid && tok);
}

function findRegisteredRosterEntry(roster, playerId) {
  var pid = asString(playerId);
  if (!pid) return null;
  var list = Array.isArray(roster) ? roster : [];
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    if (!e) continue;
    if (asString(e.playerId) !== pid) continue;
    if (asString(e.registrationStatus) === 'registered') return e;
  }
  return null;
}

function parseLocalDateTimeParts(raw) {
  var s = asString(raw);
  if (!s) return null;
  var m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2})(?::(\d{2})(?::(\d{2}))?)?)?/
  );
  if (!m) return null;
  var year = parseInt(m[1], 10);
  var month = parseInt(m[2], 10);
  var day = parseInt(m[3], 10);
  var hour = m[4] != null ? parseInt(m[4], 10) : 0;
  var minute = m[5] != null ? parseInt(m[5], 10) : 0;
  var second = m[6] != null ? parseInt(m[6], 10) : 0;
  if (
    !year ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null;
  }
  return {
    year: year,
    month: month,
    day: day,
    hour: hour,
    minute: minute,
    second: second,
    sortKey:
      year * 10000000000 +
      month * 100000000 +
      day * 1000000 +
      hour * 10000 +
      minute * 100 +
      second
  };
}

/** 对齐 series detail Hero 日期范围口径（月份走 clubDateFormat） */
function formatSeriesDateRange(roundsInput) {
  var rounds = Array.isArray(roundsInput) ? roundsInput : [];
  var minP = null;
  var maxP = null;
  for (var i = 0; i < rounds.length; i++) {
    var p = parseLocalDateTimeParts(rounds[i] && rounds[i].dateTime);
    if (!p) continue;
    if (!minP || p.sortKey < minP.sortKey) minP = p;
    if (!maxP || p.sortKey > maxP.sortKey) maxP = p;
  }
  return clubDateFormat.formatDateRangeFromParts(minP, maxP, '比赛时间待定');
}

function resolveSeriesGameModeLabel(rawMode) {
  return seriesGameModeLabel.resolveSeriesGameModeLabel(rawMode);
}

/** 赛制去重（不含「系列赛」标记） */
function buildSeriesGameModeList(roundsInput) {
  var rounds = Array.isArray(roundsInput) ? roundsInput : [];
  var seen = Object.create(null);
  var parts = [];
  for (var i = 0; i < rounds.length; i++) {
    var label = resolveSeriesGameModeLabel(rounds[i] && rounds[i].gameMode);
    if (!label || seen[label]) continue;
    seen[label] = 1;
    parts.push(label);
  }
  return parts;
}

/** 「系列赛」永远第一位，其后按轮次顺序追加去重赛制 */
function buildSeriesFormatText(roundsInput) {
  return ['系列赛'].concat(buildSeriesGameModeList(roundsInput)).join(' · ');
}

/** 兼容旧字段：与 format 文案同源 */
function buildSeriesTagLine(roundsInput) {
  return buildSeriesFormatText(roundsInput);
}

/** 各轮球场去重：含半场；同一球场不同半场视为不同行 */
function buildSeriesCourseList(roundsInput) {
  var packed = seriesCourseIdentity.buildSeriesCourseLines(roundsInput);
  return packed && Array.isArray(packed.lines) ? packed.lines.slice() : [];
}

function extractAllCourses(series) {
  return buildSeriesCourseList(
    Array.isArray(series && series.rounds) ? series.rounds : []
  );
}

/** LIVE 轮次球场（去重，含半场）；无 LIVE 时返回空数组 */
function getLiveCourseList(series, options) {
  var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
  var states = seriesPlazaLiveSubtitle.buildPlazaRoundStates(series, options);
  var liveIds = Object.create(null);
  var hasLiveId = false;
  var i;
  for (i = 0; i < states.length; i++) {
    if (states[i] && states[i].state === 'live') {
      var sid = asString(states[i].roundId);
      if (sid) {
        liveIds[sid] = 1;
        hasLiveId = true;
      }
    }
  }
  var liveRounds = [];
  for (i = 0; i < rounds.length; i++) {
    var round = rounds[i] || {};
    var rid = asString(round.roundId);
    var isLiveRound = hasLiveId
      ? !!(rid && liveIds[rid])
      : asString(round.state) === 'live';
    if (isLiveRound) liveRounds.push(round);
  }
  return buildSeriesCourseList(liveRounds);
}

function resolveCardCourseList(series, isLive, options) {
  var all = extractAllCourses(series);
  var ctx = asString(options && options.context);
  if (ctx === 'standings' && isLive) {
    var liveCourses = getLiveCourseList(series, options);
    if (liveCourses.length) return liveCourses;
  }
  return all;
}

function resolveSeriesHost(series) {
  var hostMode = asString(series && series.hostMode);
  var org = (series && series.organization) || {};
  var host = (series && series.hostTeam) || {};
  if (hostMode === 'organization') {
    return {
      name: asString(org.organizationName),
      logo: asString(org.organizationLogo),
      organizerKindLabel: 'ORG.'
    };
  }
  return {
    name: asString(host.teamName),
    logo: asString(host.teamLogo),
    organizerKindLabel: 'CLUB'
  };
}

/**
 * 收集有效托管分站 status（用于 LIVE / 已结束）
 * @param {object} series
 * @param {{ getMatchById?: Function }} deps
 */
function listValidStationStatuses(series, deps) {
  var d = deps || {};
  var getter = typeof d.getMatchById === 'function' ? d.getMatchById : null;
  var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
  var seriesId = asString(series && series.seriesId);
  var publishToken = asString(series && series.publishToken);
  var out = [];
  if (!getter || !seriesId) return out;

  for (var i = 0; i < rounds.length; i++) {
    var round = rounds[i];
    var mid = asString(round && round.matchId);
    if (!mid) continue;
    var match = null;
    try {
      match = getter(mid);
    } catch (e) {
      match = null;
    }
    if (!match) continue;
    var ctx = match.seriesContext || {};
    if (ctx.managed !== true) continue;
    if (asString(ctx.seriesId) !== seriesId) continue;
    if (asString(ctx.roundId) !== asString(round && round.roundId)) continue;
    if (asString(ctx.publishToken) !== publishToken) continue;
    out.push(asString(match.status).toLowerCase());
  }
  return out;
}

/**
 * @returns {'registration'|'live'|'finished'|'none'}
 */
function deriveSeriesListPhase(series, stationStatuses) {
  var life = asString(series && series.lifecycleStatus);
  if (life !== 'published') return 'none';
  if (seriesFinishLock.isSeriesCompleted(series)) return 'finished';

  var statuses = Array.isArray(stationStatuses) ? stationStatuses : [];
  var hasOngoing = false;
  var hasValid = statuses.length > 0;
  var allFinished = hasValid;
  for (var i = 0; i < statuses.length; i++) {
    var st = statuses[i];
    if (st === 'ongoing') {
      hasOngoing = true;
      allFinished = false;
    } else if (st !== 'finished' && st !== 'completed') {
      allFinished = false;
    }
  }

  if (hasOngoing) return 'live';
  if (allFinished && hasValid) return 'finished';
  if (asString(series && series.registrationState) === 'open') {
    return 'registration';
  }
  return 'none';
}

function parseDeadlineMs(raw) {
  if (raw == null || raw === '') return NaN;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw < 1e12 ? raw * 1000 : raw;
  }
  var p = parseLocalDateTimeParts(raw);
  if (p) {
    return new Date(
      p.year,
      p.month - 1,
      p.day,
      p.hour,
      p.minute,
      p.second || 0
    ).getTime();
  }
  var parsed = Date.parse(asString(raw));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function hasSeriesStarted(series, listPhase, options) {
  if (listPhase === 'live' || listPhase === 'finished') return true;
  var statuses = listValidStationStatuses(series, options || {});
  for (var i = 0; i < statuses.length; i++) {
    var st = statuses[i];
    if (st === 'ongoing' || st === 'finished' || st === 'completed') return true;
  }
  return false;
}

/** 当前时间 < 报名截止；报名 TAB 即使已 LIVE 仍可保持报名金色 */
function resolveIsRegistrationOpen(series, listPhase, options) {
  if (!series || typeof series !== 'object') return false;
  if (listPhase === 'live' || listPhase === 'finished') return false;
  if (asString(series.registrationState) === 'closed') return false;
  var nowMs =
    options && Number.isFinite(Number(options.nowMs))
      ? Number(options.nowMs)
      : Date.now();
  var deadlineMs = parseDeadlineMs(
    series.registrationDeadline || series.registrationCloseAt
  );
  if (Number.isFinite(deadlineMs)) return nowMs < deadlineMs;
  return asString(series.registrationState) === 'open';
}

function isUpcomingRoundState(state) {
  var st = asString(state).toLowerCase();
  return (
    st === 'upcoming' ||
    st === 'unassigned' ||
    st === 'grouped' ||
    st === 'scheduled' ||
    st === 'none'
  );
}

function listRoundStateRows(series, options) {
  var states = seriesPlazaLiveSubtitle.buildPlazaRoundStates(series, options);
  if (states.length) return states;
  var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
  var list = [];
  for (var i = 0; i < rounds.length; i++) {
    var round = rounds[i] || {};
    var visual = seriesRoundVisualState.resolveSeriesRoundVisualState(round, null);
    var state =
      asString(round.state) === 'live'
        ? 'live'
        : asString(round.state) === 'upcoming'
          ? 'upcoming'
          : visual.state;
    list.push({
      roundId: asString(round.roundId),
      state: state,
      dateTime: round.dateTime,
      date: round.date,
      startTime: round.startTime
    });
  }
  return list;
}

/** 仍有未开始轮次（state === upcoming；视觉层 unassigned/grouped 同义） */
function hasUpcomingRound(series, options) {
  if (!series || typeof series !== 'object') return false;
  var states = listRoundStateRows(series, options);
  for (var i = 0; i < states.length; i++) {
    var row = states[i] || {};
    var st = asString(row.state);
    if (st === 'cancelled') continue;
    if (isUpcomingRoundState(st) || asString(row.statusToken) === 'upcoming') {
      return true;
    }
  }
  return false;
}

function showInRegistration(series, options) {
  return hasUpcomingRound(series, options);
}

function inspectSeriesRoundFlags(series, options) {
  var list = listRoundStateRows(series, options);
  var hasLive = false;
  var hasUnstarted = false;
  for (var i = 0; i < list.length; i++) {
    var st = asString(list[i] && list[i].state);
    if (st === 'cancelled') continue;
    if (st === 'live') hasLive = true;
    else if (isUpcomingRoundState(st)) hasUnstarted = true;
  }
  return { hasLive: hasLive, hasUnstarted: hasUnstarted };
}

function resolveRegistrationStatus(flags, series) {
  if (flags && flags.hasLive) return 'LIVE';
  var st = asString(series && series.registrationState).toLowerCase();
  if (st === 'closed') return '报名已关闭';
  return '报名中';
}

/** 最近一轮未开始轮次的开始时间（最早 / 最小） */
function resolveUpcomingSortTime(series, options) {
  var list = listRoundStateRows(series, options);
  var minMs = NaN;
  for (var i = 0; i < list.length; i++) {
    var row = list[i] || {};
    if (asString(row.state) === 'cancelled') continue;
    if (!isUpcomingRoundState(row.state) && asString(row.statusToken) !== 'upcoming') {
      continue;
    }
    var ms = parseDeadlineMs(row.dateTime || row.date || row.startTime);
    if (!Number.isFinite(ms)) continue;
    if (!Number.isFinite(minMs) || ms < minMs) minMs = ms;
  }
  return Number.isFinite(minMs) ? minMs : null;
}

function findFirstLiveRound(series, options) {
  var states = seriesPlazaLiveSubtitle.buildPlazaRoundStates(series, options);
  var i;
  for (i = 0; i < states.length; i++) {
    if (states[i] && states[i].state === 'live') return states[i];
  }
  var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
  for (i = 0; i < rounds.length; i++) {
    var round = rounds[i] || {};
    if (asString(round.state) === 'live') return round;
    var visual = seriesRoundVisualState.resolveSeriesRoundVisualState(round, null);
    if (visual.state === 'live') return round;
  }
  return null;
}

function formatLiveRoundDate(liveRound, rounds) {
  var src = (liveRound && (liveRound.dateTime || liveRound.date)) || '';
  var single = clubDateFormat.formatClubDate(src);
  if (single) return single;
  return formatSeriesDateRange(rounds);
}

/** 当前 LIVE 轮次开始时间（ms）；无 LIVE 轮次或无法解析则为 null */
function resolveLiveStartTime(series, liveRound) {
  if (!liveRound) return null;
  var raw = liveRound.dateTime || liveRound.date || liveRound.startTime || '';
  if (!raw) {
    var rid = asString(liveRound.roundId);
    var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
    for (var i = 0; i < rounds.length; i++) {
      var round = rounds[i] || {};
      if (rid && asString(round.roundId) === rid) {
        raw = round.dateTime || round.date || round.startTime || '';
        break;
      }
    }
  }
  var ms = parseDeadlineMs(raw);
  return Number.isFinite(ms) ? ms : null;
}

function resolveCardStatus(isLive, isRegistrationOpen, listPhase) {
  if (listPhase === 'live' && isLive) return 'live';
  if (isRegistrationOpen) return 'registration';
  return 'default';
}

function sanitizeCardSubtitle(raw) {
  return asString(raw).replace(/[\r\n\u2028\u2029]+/g, '');
}

function formatStandingsLiveTitleSub(series, options) {
  var liveRound = findFirstLiveRound(series, options);
  if (!liveRound) return '';
  var rid = asString(liveRound.roundId);
  var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
  var idx = 0;
  var mode = '';
  var i;
  for (i = 0; i < rounds.length; i++) {
    var round = rounds[i] || {};
    if (rid && asString(round.roundId) === rid) {
      idx =
        round.index != null && Number.isFinite(Number(round.index))
          ? Math.floor(Number(round.index))
          : i + 1;
      mode = seriesGameModeLabel.resolveRoundSelectorModeLabel
        ? seriesGameModeLabel.resolveRoundSelectorModeLabel(
            round.gameMode || round.selectedGameMode
          )
        : seriesGameModeLabel.resolveSeriesGameModeLabel(
            round.gameMode || round.selectedGameMode
          );
      break;
    }
  }
  if (!idx && liveRound.index != null && Number.isFinite(Number(liveRound.index))) {
    idx = Math.floor(Number(liveRound.index));
  }
  if (!mode) {
    mode = seriesGameModeLabel.resolveRoundSelectorModeLabel
      ? seriesGameModeLabel.resolveRoundSelectorModeLabel(
          liveRound.gameMode || liveRound.selectedGameMode
        )
      : seriesGameModeLabel.resolveSeriesGameModeLabel(
          liveRound.gameMode || liveRound.selectedGameMode
        );
  }
  var roundPart = idx > 0 ? '第' + idx + '轮' : '';
  if (roundPart && mode) return roundPart + '-' + mode;
  return roundPart || mode || '';
}

function readCanonicalCardSubtitle(series) {
  return sanitizeCardSubtitle(
    series &&
      (series.subtitle != null && String(series.subtitle).trim() !== ''
        ? series.subtitle
        : series.seriesSubtitle)
  );
}

/**
 * 卡片副标题。报名只出 canonical；广场 LIVE / standings 由 buildPlazaSeriesSubtitle 追加【Rx】。
 * @param {'standings'|'plaza'|'registration'|string} context
 */
function buildTitleSub(series, options) {
  var ctx = asString(options && options.context);
  if (ctx === 'registration') {
    return readCanonicalCardSubtitle(series);
  }
  if (ctx === 'standings' || ctx === 'plaza') {
    return seriesPlazaLiveSubtitle.buildPlazaSeriesSubtitle(series, options);
  }
  if (seriesRyderCup.isRyderCupSeries(series)) {
    return asString(
      seriesRyderCupAccumulate.buildRyderCupDisplaySubtitle(series, options).text
    );
  }
  return readCanonicalCardSubtitle(series);
}

/**
 * @param {'registration'|'live'|'finished'} listPhase
 * @param {{ getMatchById?: Function }} [options]
 */
function toSeriesClubCard(series, listPhase, options) {
  if (!series || typeof series !== 'object') return null;
  var sid = asString(series.seriesId);
  if (!sid) return null;
  var host = resolveSeriesHost(series);
  var rounds = Array.isArray(series.rounds) ? series.rounds : [];
  var roundFlags = inspectSeriesRoundFlags(series, options);
  var liveRound = findFirstLiveRound(series, options);
  var isLive = roundFlags.hasLive || listPhase === 'live';
  var isRegistrationOpen = resolveIsRegistrationOpen(series, listPhase, options);
  var cardStatus = resolveCardStatus(isLive, isRegistrationOpen, listPhase);
  var registrationStatus = resolveRegistrationStatus(roundFlags, series);
  var titleOpts = options && typeof options === 'object' ? options : {};
  if (!asString(titleOpts.context) && listPhase === 'registration') {
    titleOpts = Object.assign({}, titleOpts, { context: 'registration' });
  }
  var titleSub = buildTitleSub(series, titleOpts);
  var statusLabel = '报名中';
  var statusTone = 'default';
  var tab = '';
  if (listPhase === 'live' && isLive) {
    statusLabel = 'LIVE';
    statusTone = 'live';
  } else if (listPhase === 'finished') {
    statusLabel = '已结束';
    statusTone = 'finished';
  } else {
    tab = 'register';
    statusLabel = registrationStatus;
    if (registrationStatus === 'LIVE') statusTone = 'live';
    else if (registrationStatus === '报名中') statusTone = 'default';
    else statusTone = 'finished';
  }

  var navUrl =
    '/subpackages/tournament/pages/series-detail/index?seriesId=' +
    encodeURIComponent(sid);
  if (tab) navUrl += '&tab=' + encodeURIComponent(tab);
  navUrl +=
    '&from=' + encodeURIComponent(tab === 'register' ? 'registration' : 'plaza');

  var privacyLabel =
    series.visibility === 'private' ? '访问码保护' : '';

  var gameModeList = buildSeriesGameModeList(rounds);
  var courseList = resolveCardCourseList(series, isLive, options);
  var clubDate =
    listPhase === 'live' && isLive
      ? formatLiveRoundDate(liveRound, rounds)
      : formatSeriesDateRange(rounds);

  var card = {
    id: 'series:' + sid,
    seriesId: sid,
    matchId: '',
    matchType: 'series',
    typeLabel: '系列赛',
    organizerKindLabel: host.organizerKindLabel || 'CLUB',
    type: 'club',
    favorited: false,
    clubLogo: host.logo || '',
    clubDate: clubDate,
    title: asString(series.seriesName) || '系列赛',
    titleSub: titleSub,
    teamName: host.name || '',
    venue: '',
    tagLine: buildSeriesTagLine(rounds),
    gameModeList: gameModeList,
    gameModeText: buildSeriesFormatText(rounds),
    courseList: courseList,
    courseLayout: courseList.length > 1 ? 'stack' : 'row',
    courseFirstName: courseList[0] || '',
    privacyLabel: privacyLabel,
    views: '0',
    statusLabel: statusLabel,
    statusTone: statusTone,
    isLive: isLive,
    liveStartTime: resolveLiveStartTime(series, liveRound),
    isRegistrationOpen: isRegistrationOpen,
    registrationStatus: registrationStatus,
    cardStatus: cardStatus,
    showInRegistration: showInRegistration(series, options),
    upcomingSortTime: resolveUpcomingSortTime(series, options),
    navUrl: navUrl,
    _sortAt: stableTimeMs(series),
    _cardKind: 'series'
  };
  return seriesRyderCupAccumulate.decoratePlazaSeriesCard(card, series, listPhase, options);
}

function filterOrdinaryMatchesForPublicLists(matches) {
  var list = Array.isArray(matches) ? matches : [];
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var m = list[i];
    try {
      if (shouldHideManagedStationFromPublicLists(m)) continue;
      out.push(m);
    } catch (e) {
      /* 单条异常：保守保留非托管形态；若无法判断则跳过该条而非炸列表 */
      if (m && m.seriesContext && m.seriesContext.managed === true) continue;
      out.push(m);
    }
  }
  return out;
}

function sortCardsByStableTime(cards) {
  var list = (Array.isArray(cards) ? cards : []).slice();
  list.sort(function (a, b) {
    var tb = safeNum(b && b._sortAt, 0);
    var ta = safeNum(a && a._sortAt, 0);
    if (tb !== ta) return tb - ta;
    var ida = asString(a && a.id);
    var idb = asString(b && b.id);
    if (ida === idb) return 0;
    return ida < idb ? -1 : 1;
  });
  return list;
}

function sortCardsByUpcomingSortTime(cards) {
  var list = (Array.isArray(cards) ? cards : []).slice();
  list.sort(function (a, b) {
    var ta = Number(a && a.upcomingSortTime);
    var tb = Number(b && b.upcomingSortTime);
    var aOk = Number.isFinite(ta);
    var bOk = Number.isFinite(tb);
    if (aOk && bOk && ta !== tb) return ta - tb;
    if (aOk && !bOk) return -1;
    if (!aOk && bOk) return 1;
    var ida = asString(a && a.id);
    var idb = asString(b && b.id);
    if (ida === idb) return 0;
    return ida < idb ? -1 : 1;
  });
  return list;
}

function filterRegistrationCards(cards) {
  var list = Array.isArray(cards) ? cards : [];
  var out = [];
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].showInRegistration === true) out.push(list[i]);
  }
  return sortCardsByUpcomingSortTime(out);
}

/**
 * @param {{
 *   listSeries?: Function,
 *   getMatchById?: Function,
 *   currentUserId?: string,
 *   currentPlayerId?: string,
 *   decorateOrdinaryCard?: Function,
 *   toOrdinaryCard?: Function,
 *   listMatches?: Function
 * }} deps
 */
function buildRegistrationAllCards(deps) {
  return _buildList(deps, 'registration_all');
}

function buildRegistrationMineCards(deps) {
  return _buildList(deps, 'registration_mine');
}

function buildPlazaTournamentCards(deps) {
  return _buildList(deps, 'plaza');
}

function _buildList(deps, mode) {
  var d = deps || {};
  var ordinaryCards = [];
  var seriesCards = [];

  try {
    var matches =
      typeof d.listMatches === 'function' ? d.listMatches() || [] : [];
    var filtered = filterOrdinaryMatchesForPublicLists(matches);
    for (var i = 0; i < filtered.length; i++) {
      var m = filtered[i];
      try {
        var st = asString(m && m.status).toLowerCase();
        if (mode === 'plaza') {
          if (st !== 'ongoing' && st !== 'finished') continue;
        } else {
          if (st !== 'registering') continue;
          if (mode === 'registration_mine') {
            // 普通赛：沿用 registerInfo.users.userId（currentUserId）
            var uid = asString(d.currentUserId);
            if (!uid) continue;
            var users =
              m && m.registerInfo && Array.isArray(m.registerInfo.users)
                ? m.registerInfo.users
                : [];
            var hit = users.some(function (item) {
              return item && asString(item.userId) === uid;
            });
            if (!hit) continue;
          }
        }
        var rawCard =
          typeof d.toOrdinaryCard === 'function' ? d.toOrdinaryCard(m) : null;
        var card =
          typeof d.decorateOrdinaryCard === 'function'
            ? d.decorateOrdinaryCard(m, rawCard)
            : rawCard;
        if (!card) continue;
        card._sortAt = stableTimeMs(m);
        card._cardKind = 'match';
        card.showInRegistration = true;
        var ordinaryStart = parseDeadlineMs(
          (m && (m.teeTime || m.startTime || m.dateTime)) || card.clubDate
        );
        card.upcomingSortTime = Number.isFinite(ordinaryStart)
          ? ordinaryStart
          : card._sortAt || null;
        ordinaryCards.push(card);
      } catch (eMatch) {
        /* skip broken match */
      }
    }
  } catch (eList) {
    ordinaryCards = [];
  }

  try {
    var allSeries =
      typeof d.listSeries === 'function' ? d.listSeries() || [] : [];
    var seen = Object.create(null);
    // Series roster：必须可解析的领域 playerId；不可解析则不猜、不展示
    var playerId = asString(d.currentPlayerId);

    for (var s = 0; s < allSeries.length; s++) {
      var series = allSeries[s];
      try {
        if (!series || typeof series !== 'object') continue;
        var sid = asString(series.seriesId);
        if (!sid || seen[sid]) continue;
        if (asString(series.lifecycleStatus) !== 'published') continue;

        var statuses = listValidStationStatuses(series, {
          getMatchById: d.getMatchById
        });
        var phase = deriveSeriesListPhase(series, statuses);

        var listContext =
          asString(d.context) || (mode === 'plaza' ? 'standings' : 'registration');
        if (mode === 'plaza') {
          if (phase !== 'live' && phase !== 'finished') continue;
          var plazaCard = toSeriesClubCard(
            series,
            phase === 'live' ? 'live' : 'finished',
            {
              getMatchById: d.getMatchById,
              getIndexByMatchId: d.getIndexByMatchId,
              context: listContext
            }
          );
          if (!plazaCard) continue;
          seen[sid] = 1;
          seriesCards.push(plazaCard);
          continue;
        }

        // 报名列表：published 且尚未整体进入 LIVE/已结束；registrationState 只投影文案
        // lifecycleStatus 已互斥排除 cancelled/archived/draft
        if (mode === 'registration_mine') {
          if (!playerId) continue;
          var entry = findRegisteredRosterEntry(series.roster, playerId);
          if (!entry) continue;
        }
        if (
          !showInRegistration(series, { getMatchById: d.getMatchById })
        ) {
          continue;
        }
        var regCard = toSeriesClubCard(series, 'registration', {
          getMatchById: d.getMatchById,
          context: listContext || 'registration'
        });
        if (!regCard) continue;
        seen[sid] = 1;
        seriesCards.push(regCard);
      } catch (eSeries) {
        /* skip broken series；普通列表已在上面保留 */
      }
    }
  } catch (eSeriesList) {
    /* Series store 失败：仅跳过 Series，普通卡保留 */
  }

  var merged = ordinaryCards.concat(seriesCards);
  if (mode === 'plaza') return sortCardsByStableTime(merged);
  return filterRegistrationCards(merged);
}

module.exports = {
  shouldHideManagedStationFromPublicLists: shouldHideManagedStationFromPublicLists,
  findRegisteredRosterEntry: findRegisteredRosterEntry,
  formatSeriesDateRange: formatSeriesDateRange,
  buildSeriesTagLine: buildSeriesTagLine,
  buildSeriesGameModeList: buildSeriesGameModeList,
  buildSeriesFormatText: buildSeriesFormatText,
  buildSeriesCourseList: buildSeriesCourseList,
  extractAllCourses: extractAllCourses,
  getLiveCourseList: getLiveCourseList,
  hasUpcomingRound: hasUpcomingRound,
  showInRegistration: showInRegistration,
  listValidStationStatuses: listValidStationStatuses,
  deriveSeriesListPhase: deriveSeriesListPhase,
  resolveIsRegistrationOpen: resolveIsRegistrationOpen,
  toSeriesClubCard: toSeriesClubCard,
  filterOrdinaryMatchesForPublicLists: filterOrdinaryMatchesForPublicLists,
  stableTimeMs: stableTimeMs,
  sortCardsByStableTime: sortCardsByStableTime,
  sortCardsByUpcomingSortTime: sortCardsByUpcomingSortTime,
  filterRegistrationCards: filterRegistrationCards,
  resolveUpcomingSortTime: resolveUpcomingSortTime,
  buildTitleSub: buildTitleSub,
  buildRegistrationAllCards: buildRegistrationAllCards,
  buildRegistrationMineCards: buildRegistrationMineCards,
  buildPlazaTournamentCards: buildPlazaTournamentCards,
  shouldHideSeriesFromPlazaRegistration:
    seriesRoundPhaseAggregate.shouldHideSeriesFromPlazaRegistration,
  hasValidRounds: seriesRoundPhaseAggregate.hasValidRounds,
  allValidRoundsStartedOrCompleted:
    seriesRoundPhaseAggregate.allValidRoundsStartedOrCompleted
};
