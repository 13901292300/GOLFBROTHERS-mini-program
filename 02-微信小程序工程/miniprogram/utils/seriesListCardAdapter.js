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

/** 赛制去重 + 末尾「系列赛」 */
function buildSeriesTagLine(roundsInput) {
  var rounds = Array.isArray(roundsInput) ? roundsInput : [];
  var seen = Object.create(null);
  var parts = [];
  for (var i = 0; i < rounds.length; i++) {
    var label = resolveSeriesGameModeLabel(rounds[i] && rounds[i].gameMode);
    if (!label || seen[label]) continue;
    seen[label] = 1;
    parts.push(label);
  }
  parts.push('系列赛');
  return parts.join(' · ');
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
  var titleSub = asString(series.seriesSubtitle).replace(
    /[\r\n\u2028\u2029]+/g,
    ''
  );
  if (listPhase === 'live') {
    titleSub = seriesPlazaLiveSubtitle.projectPlazaSeriesTitleSub(
      series,
      options && options.getMatchById
    );
  }
  var statusLabel = '报名中';
  var statusTone = 'default';
  var tab = '';
  if (listPhase === 'live') {
    statusLabel = 'LIVE';
    statusTone = 'live';
  } else if (listPhase === 'finished') {
    statusLabel = '已结束';
    statusTone = 'finished';
  } else {
    // registration：仅投影顶层 registrationState，不读分站 status
    tab = 'register';
    if (asString(series.registrationState) === 'open') {
      statusLabel = '报名中';
      statusTone = 'default';
    } else {
      statusLabel = '报名已关闭';
      statusTone = 'finished';
    }
  }

  var navUrl =
    '/subpackages/tournament/pages/series-detail/index?seriesId=' +
    encodeURIComponent(sid);
  if (tab) navUrl += '&tab=' + encodeURIComponent(tab);

  var privacyLabel =
    series.visibility === 'private' ? '访问码保护' : '';

  return {
    id: 'series:' + sid,
    seriesId: sid,
    matchId: '',
    matchType: 'series',
    typeLabel: '系列赛',
    organizerKindLabel: host.organizerKindLabel || 'CLUB',
    favorited: false,
    clubLogo: host.logo || '',
    clubDate: formatSeriesDateRange(rounds),
    title: asString(series.seriesName) || '系列赛',
    titleSub: titleSub,
    teamName: host.name || '',
    venue: '',
    tagLine: buildSeriesTagLine(rounds),
    privacyLabel: privacyLabel,
    views: '0',
    statusLabel: statusLabel,
    statusTone: statusTone,
    navUrl: navUrl,
    _sortAt: stableTimeMs(series),
    _cardKind: 'series'
  };
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

        if (mode === 'plaza') {
          if (phase !== 'live' && phase !== 'finished') continue;
          var plazaCard = toSeriesClubCard(
            series,
            phase === 'live' ? 'live' : 'finished',
            { getMatchById: d.getMatchById }
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
          seriesRoundPhaseAggregate.shouldHideSeriesFromPlazaRegistration(
            series,
            d.getMatchById
          )
        ) {
          continue;
        }
        var regCard = toSeriesClubCard(series, 'registration');
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

  return sortCardsByStableTime(ordinaryCards.concat(seriesCards));
}

module.exports = {
  shouldHideManagedStationFromPublicLists: shouldHideManagedStationFromPublicLists,
  findRegisteredRosterEntry: findRegisteredRosterEntry,
  formatSeriesDateRange: formatSeriesDateRange,
  buildSeriesTagLine: buildSeriesTagLine,
  listValidStationStatuses: listValidStationStatuses,
  deriveSeriesListPhase: deriveSeriesListPhase,
  toSeriesClubCard: toSeriesClubCard,
  filterOrdinaryMatchesForPublicLists: filterOrdinaryMatchesForPublicLists,
  stableTimeMs: stableTimeMs,
  sortCardsByStableTime: sortCardsByStableTime,
  buildRegistrationAllCards: buildRegistrationAllCards,
  buildRegistrationMineCards: buildRegistrationMineCards,
  buildPlazaTournamentCards: buildPlazaTournamentCards,
  shouldHideSeriesFromPlazaRegistration:
    seriesRoundPhaseAggregate.shouldHideSeriesFromPlazaRegistration,
  hasValidRounds: seriesRoundPhaseAggregate.hasValidRounds,
  allValidRoundsStartedOrCompleted:
    seriesRoundPhaseAggregate.allValidRoundsStartedOrCompleted
};
