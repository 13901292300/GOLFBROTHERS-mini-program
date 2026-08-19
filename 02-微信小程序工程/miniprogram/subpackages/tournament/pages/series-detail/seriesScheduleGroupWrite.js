/**
 * Series 赛程 TAB：分站分组保存 / 开赛写路径
 * - 单次 saveMatch；失败不污染调用方（本模块内 clone 后写）
 * - 不开赛跳转；不写 series.roster
 */

var teamMatchStore = require('../../../../utils/teamMatchStore.js');
var seriesStationMatch = require('../../../../utils/seriesStationMatch.js');
var tournamentGroupDraft = require('../../utils/tournamentGroupDraft.js');
var seriesNoRepeatLineup = require('../../utils/seriesNoRepeatLineup.js');
var teamMatchFinish = require('../../../../utils/teamMatchFinish.js');
var seriesFinishLock = require('../../../../utils/seriesFinishLock.js');
var teeSheetManage = require('../../../../utils/teeSheetManage.js');
var { normalizeFormalGroupSeats } = require('../../../../utils/strokeGroupSeatNormalizer.js');
var {
  validateStrokeEntities,
  isG2G3FamilyMode,
  isG4FamilyMode,
  isG5MatchPlayMode,
  isG6G7MatchPlayMode
} = require('../../../../utils/strokeEntityValidator.js');
var { syncStrokeEntities } = require('../../../../utils/strokeEntityBuilder.js');
var seriesScheduleCandidates = require('./seriesScheduleCandidates.js');
var seriesRoundPhaseAggregate = require('../../../../utils/seriesRoundPhaseAggregate.js');

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function deepClone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function resolveAffiliationFromPlayer(player) {
  if (!player || typeof player !== 'object') return '';
  return (
    asString(player.affiliationId) ||
    asString(player.matchTeamId) ||
    asString(player.groupId) ||
    asString(player.seriesParticipantId)
  );
}

function resolveParticipantName(series, affiliationId) {
  var id = asString(affiliationId);
  if (!id) return '';
  var opts = seriesScheduleCandidates.listAffiliationOptions(series);
  for (var i = 0; i < opts.length; i++) {
    if (asString(opts[i].id) === id || asString(opts[i].seriesParticipantId) === id) {
      return asString(opts[i].name) || asString(opts[i].shortName) || id;
    }
  }
  return id;
}

/**
 * 由草稿座位合成 registerInfo.users，供 teamMap / stroke 校验
 */
function buildSyntheticRegisterInfoFromDraft(draft, series) {
  var users = [];
  var seen = Object.create(null);
  var groups = Array.isArray(draft) ? draft : [];
  for (var i = 0; i < groups.length; i++) {
    var players = (groups[i] && groups[i].players) || [];
    for (var j = 0; j < players.length; j++) {
      var p = players[j];
      if (!p) continue;
      var userId = asString(p.userId);
      if (!userId || seen[userId]) continue;
      seen[userId] = true;
      var affiliationId = resolveAffiliationFromPlayer(p);
      var name =
        asString(p.displayName) ||
        asString(p.competitionName) ||
        asString(p.nickname) ||
        asString(p.name) ||
        userId;
      var teamName = asString(p.matchTeamName) || asString(p.groupName) ||
        resolveParticipantName(series, affiliationId);
      users.push({
        userId: userId,
        competitionName: name,
        nickname: name,
        displayName: name,
        avatar: asString(p.avatar),
        gender: asString(p.gender),
        matchTeamId: affiliationId,
        groupId: affiliationId,
        matchTeamName: teamName,
        groupName: teamName
      });
    }
  }
  return {
    totalCount: users.length,
    users: users
  };
}

/**
 * 队际：须有参赛球队归属；队内：须有分队归属
 * @returns {{ ok: boolean, reason?: string, message?: string }}
 */
function validateSeriesSeatAffiliation(draft, series) {
  var hostMode = asString(series && series.hostMode);
  var needKind = hostMode === 'team' ? 'division' : 'team';
  var message = needKind === 'division' ? '请选择所属分队' : '请选择所属球队';
  // 产品文案兼容：统一提示亦可
  var unifiedMessage = '请选择所属球队/分队';

  var options = seriesScheduleCandidates.listAffiliationOptions(series);
  var validIds = Object.create(null);
  for (var o = 0; o < options.length; o++) {
    var opt = options[o] || {};
    var oid = asString(opt.id);
    var sid = asString(opt.seriesParticipantId);
    var sourceId =
      needKind === 'team' ? asString(opt.sourceTeamId) : asString(opt.divisionId);
    if (oid) validIds[oid] = true;
    if (sid) validIds[sid] = true;
    if (sourceId) validIds[sourceId] = true;
  }

  var groups = Array.isArray(draft) ? draft : [];
  for (var i = 0; i < groups.length; i++) {
    var players = (groups[i] && groups[i].players) || [];
    for (var j = 0; j < players.length; j++) {
      var p = players[j];
      if (!p || !asString(p.userId)) continue;
      var affiliationId = resolveAffiliationFromPlayer(p);
      if (!affiliationId || !validIds[affiliationId]) {
        return {
          ok: false,
          reason: 'affiliation_required',
          message: unifiedMessage || message
        };
      }
      var asserted = seriesScheduleCandidates.assertAffiliationChoice(series, affiliationId);
      if (!asserted || !asserted.ok) {
        return {
          ok: false,
          reason: (asserted && asserted.reason) || 'affiliation_required',
          message: unifiedMessage || message
        };
      }
    }
  }
  return { ok: true };
}

var STATION_DATA_INVALID_MSG = '本轮比赛数据异常';

function verifySeriesContext(match, series, options) {
  var opts = options && typeof options === 'object' ? options : {};
  if (!match) {
    return { ok: false, reason: 'match_missing', message: STATION_DATA_INVALID_MSG };
  }
  if (!seriesStationMatch.isSeriesManagedMatch(match)) {
    return { ok: false, reason: 'not_series_managed', message: STATION_DATA_INVALID_MSG };
  }
  var ctx = match.seriesContext || {};
  if (ctx.managed !== true) {
    return { ok: false, reason: 'not_managed', message: STATION_DATA_INVALID_MSG };
  }
  var seriesId = asString(series && series.seriesId);
  var roundId = asString(opts.roundId);
  var matchId = asString(match.matchId);
  if (!seriesId || asString(ctx.seriesId) !== seriesId) {
    return { ok: false, reason: 'context_series_id_conflict', message: STATION_DATA_INVALID_MSG };
  }
  if (roundId && asString(ctx.roundId) !== roundId) {
    return { ok: false, reason: 'context_round_id_conflict', message: STATION_DATA_INVALID_MSG };
  }
  if (
    asString(series.publishToken) &&
    asString(ctx.publishToken) !== asString(series.publishToken)
  ) {
    return { ok: false, reason: 'context_token_conflict', message: STATION_DATA_INVALID_MSG };
  }
  if (!roundId) {
    var rounds = Array.isArray(series.rounds) ? series.rounds : [];
    var found = false;
    for (var i = 0; i < rounds.length; i++) {
      if (asString(rounds[i] && rounds[i].matchId) === matchId) {
        found = true;
        roundId = asString(rounds[i].roundId);
        break;
      }
    }
    if (!found) {
      return { ok: false, reason: 'round_match_mismatch', message: STATION_DATA_INVALID_MSG };
    }
  } else {
    var rounds2 = Array.isArray(series.rounds) ? series.rounds : [];
    var roundOk = false;
    for (var j = 0; j < rounds2.length; j++) {
      if (
        asString(rounds2[j] && rounds2[j].roundId) === roundId &&
        asString(rounds2[j] && rounds2[j].matchId) === matchId
      ) {
        roundOk = true;
        break;
      }
    }
    if (!roundOk) {
      return { ok: false, reason: 'round_match_mismatch', message: STATION_DATA_INVALID_MSG };
    }
  }
  if (typeof opts.getIndexByMatchId === 'function') {
    var index = opts.getIndexByMatchId(matchId);
    if (
      !index ||
      asString(index.seriesId) !== seriesId ||
      asString(index.roundId) !== roundId ||
      asString(index.matchId) !== matchId
    ) {
      return { ok: false, reason: 'station_index_invalid', message: STATION_DATA_INVALID_MSG };
    }
  }
  return { ok: true };
}

function mergeRegisterInfoUsers(existing, synthetic) {
  var byId = Object.create(null);
  var list = [];
  var oldUsers =
    existing && Array.isArray(existing.users) ? existing.users : [];
  var synUsers =
    synthetic && Array.isArray(synthetic.users) ? synthetic.users : [];
  for (var i = 0; i < oldUsers.length; i++) {
    var u = oldUsers[i];
    var id = asString(u && u.userId);
    if (!id || byId[id]) continue;
    byId[id] = true;
    list.push(deepClone(u));
  }
  for (var j = 0; j < synUsers.length; j++) {
    var s = synUsers[j];
    var sid = asString(s && s.userId);
    if (!sid) continue;
    if (byId[sid]) {
      for (var k = 0; k < list.length; k++) {
        if (asString(list[k].userId) === sid) {
          list[k] = Object.assign({}, list[k], {
            matchTeamId: asString(s.matchTeamId) || asString(list[k].matchTeamId),
            groupId: asString(s.groupId) || asString(list[k].groupId),
            matchTeamName: asString(s.matchTeamName) || asString(list[k].matchTeamName),
            groupName: asString(s.groupName) || asString(list[k].groupName),
            competitionName:
              asString(s.competitionName) ||
              asString(list[k].competitionName) ||
              asString(list[k].displayName),
            displayName:
              asString(s.displayName) ||
              asString(list[k].displayName) ||
              asString(list[k].competitionName),
            avatar: asString(s.avatar) || asString(list[k].avatar),
            gender: asString(s.gender) || asString(list[k].gender)
          });
          break;
        }
      }
    } else {
      byId[sid] = true;
      list.push(deepClone(s));
    }
  }
  return { totalCount: list.length, users: list };
}

/**
 * 保存分站分组（registering）
 * @param {object} input
 * @param {string} input.matchId
 * @param {object} input.series
 * @param {Array} input.groupDraft
 * @param {object} [input.pairingDraft]
 * @param {string} [input.strokeCompositionMode]
 * @param {string} [input.expectedStatus='registering']
 * @param {Function} [input.getMatchById]
 * @param {Function} [input.saveMatch]
 */
function saveStationGroups(input) {
  var src = input && typeof input === 'object' ? input : {};
  var matchId = asString(src.matchId);
  var series = src.series;
  var expectedStatus = asString(src.expectedStatus) || 'registering';
  var getMatchById =
    typeof src.getMatchById === 'function'
      ? src.getMatchById
      : function (id) {
          return teamMatchStore.getMatchById(id);
        };
  var saveMatch =
    typeof src.saveMatch === 'function'
      ? src.saveMatch
      : function (m) {
          return teamMatchStore.saveMatch(m);
        };

  if (!matchId) {
    return { ok: false, reason: 'match_id_required', message: '分站缺失' };
  }
  if (!series || typeof series !== 'object') {
    return { ok: false, reason: 'series_required', message: '系列赛缺失' };
  }

  var match = getMatchById(matchId);
  var ctxCheck = verifySeriesContext(match, series, {
    roundId: asString(src.roundId),
    getIndexByMatchId: src.getIndexByMatchId
  });
  if (!ctxCheck.ok) return ctxCheck;

  var seriesLock = seriesFinishLock.assertSeriesWritable(series);
  if (!seriesLock.ok) {
    return {
      ok: false,
      reason: 'series_completed',
      message: seriesLock.message
    };
  }

  var finishedGuard = teamMatchFinish.assertMatchNotCompleted(match);
  if (!finishedGuard.ok) {
    return {
      ok: false,
      reason: 'match_finished',
      message: finishedGuard.message
    };
  }

  var status = asString(match.status).toLowerCase();
  if (status !== expectedStatus) {
    return {
      ok: false,
      reason: 'status_not_registering',
      message: '仅报名中的分站可调整分组'
    };
  }

  var affiliation = validateSeriesSeatAffiliation(src.groupDraft, series);
  if (!affiliation.ok) return affiliation;

  var currentRoundId =
    asString(src.roundId) ||
    asString(match.seriesContext && match.seriesContext.roundId);
  var noRepeatCheck = seriesNoRepeatLineup.assertPlayersNotOccupied(
    seriesNoRepeatLineup.collectDraftMemberIds(src.groupDraft, src.pairingDraft),
    {
      fromSeries: true,
      series: series,
      seriesId: asString(series.seriesId),
      currentRoundId: currentRoundId,
      getMatchById: getMatchById,
      getIndexByMatchId: src.getIndexByMatchId
    }
  );
  if (!noRepeatCheck.ok) return noRepeatCheck;

  var gameMode = asString(match.gameMode || match.selectedGameMode);
  var isG2G3 = isG2G3FamilyMode(gameMode);
  var isG6G7 = isG6G7MatchPlayMode(gameMode);
  var isG4 = isG4FamilyMode(gameMode);
  var isG5 = isG5MatchPlayMode(gameMode);
  var showCompositionMode = isG2G3 && !isG6G7;
  var showPairingSection = isG4;

  var synthetic = buildSyntheticRegisterInfoFromDraft(src.groupDraft, series);
  var sideUnit = tournamentGroupDraft.resolveSideUnitLabel(match);
  var strokeCompositionMode = showCompositionMode
    ? asString(src.strokeCompositionMode) === '4+0'
      ? '4+0'
      : '2+2'
    : isG6G7
      ? '2+2'
      : asString(match.strokeCompositionMode) === '4+0'
        ? '4+0'
        : '2+2';

  var validateErr = tournamentGroupDraft.validateGroupDraft(
    src.groupDraft,
    src.pairingDraft || {},
    {
      gameMode: gameMode,
      strokeCompositionMode: strokeCompositionMode,
      showCompositionMode: showCompositionMode,
      showPairingSection: showPairingSection,
      registerInfo: synthetic,
      matchLike: Object.assign({}, match, { registerInfo: synthetic }),
      sideUnit: sideUnit
    }
  );
  if (validateErr) {
    return { ok: false, reason: 'group_draft_invalid', message: validateErr };
  }

  var sanitized = tournamentGroupDraft.sanitizeGroupDraft(src.groupDraft);
  var isClear = sanitized.length === 0;
  var formal = isClear ? [] : tournamentGroupDraft.toFormalGroups(sanitized);
  if (!isClear) {
    formal = teeSheetManage.mergeTeeFieldsByGroupId(match.groups, formal);
  }
  if (!isClear && (isG4 || isG2G3 || isG5)) {
    formal = normalizeFormalGroupSeats(formal, match);
  }

  var shouldPersistPairings = showPairingSection || isG4;
  var formalPairings = {};
  if (!isClear && shouldPersistPairings) {
    if (isG4) {
      var matchPairings =
        match.pairings && typeof match.pairings === 'object' && !Array.isArray(match.pairings)
          ? match.pairings
          : {};
      var pairingDraft = src.pairingDraft || {};
      var rebuilt = {};
      formal.forEach(function (group) {
        var gid = group && group.groupId != null ? String(group.groupId) : '';
        if (!gid) return;
        var fromDraft = Object.prototype.hasOwnProperty.call(pairingDraft, gid)
          ? pairingDraft[gid]
          : null;
        var existingList = Array.isArray(fromDraft)
          ? fromDraft
          : Array.isArray(matchPairings[gid])
            ? matchPairings[gid]
            : [];
        rebuilt[gid] = tournamentGroupDraft.buildAutoPairingsForGroup(
          group,
          matchId,
          existingList
        );
      });
      formalPairings = teamMatchStore.sanitizePairings(rebuilt);
    } else {
      formalPairings = teamMatchStore.sanitizePairings(
        teamMatchStore.clonePairings(src.pairingDraft || match.pairings || {})
      );
    }
  }

  var next = deepClone(match);
  next.groups = formal;
  next.pairings = isClear ? {} : shouldPersistPairings ? formalPairings : {};
  next.registerInfo = mergeRegisterInfoUsers(match.registerInfo, synthetic);
  next.updatedAt = Date.now();
  if (showCompositionMode) {
    next.strokeCompositionMode = strokeCompositionMode;
  } else if (isG6G7 && !isClear) {
    next.strokeCompositionMode = '2+2';
  }
  if (!isClear && !shouldPersistPairings) {
    next.pairings = {};
  }

  if (!isClear) {
    var check = validateStrokeEntities(next);
    if (!check || check.valid !== true) {
      return {
        ok: false,
        reason: 'stroke_entity_invalid',
        message: tournamentGroupDraft.STROKE_ENTITY_INVALID_TIP,
        detail: check && check.reason ? check.reason : 'invalid'
      };
    }
    next.scoreEntities = syncStrokeEntities(next);
  }

  try {
    saveMatch(next);
  } catch (e) {
    return {
      ok: false,
      reason: 'save_failed',
      message: '保存失败，请重试'
    };
  }

  var saved = getMatchById(matchId) || next;
  return { ok: true, match: saved };
}

/**
 * 开始本轮：status → ongoing；不跳转
 * @param {object} input
 * @param {string} input.matchId
 * @param {object} input.series
 * @param {Function} [input.getMatchById]
 * @param {Function} [input.saveMatch]
 */
function startStationRound(input) {
  var src = input && typeof input === 'object' ? input : {};
  var matchId = asString(src.matchId);
  var series = src.series;
  var getMatchById =
    typeof src.getMatchById === 'function'
      ? src.getMatchById
      : function (id) {
          return teamMatchStore.getMatchById(id);
        };
  var saveMatch =
    typeof src.saveMatch === 'function'
      ? src.saveMatch
      : function (m) {
          return teamMatchStore.saveMatch(m);
        };

  if (!matchId) {
    return { ok: false, reason: 'match_id_required', message: '分站缺失' };
  }
  if (!series || typeof series !== 'object') {
    return { ok: false, reason: 'series_required', message: '系列赛缺失' };
  }

  var match = getMatchById(matchId);
  var ctxCheck = verifySeriesContext(match, series, {
    roundId: asString(src.roundId),
    getIndexByMatchId: src.getIndexByMatchId
  });
  if (!ctxCheck.ok) return ctxCheck;

  var seriesLock = seriesFinishLock.assertSeriesWritable(series);
  if (!seriesLock.ok) {
    return {
      ok: false,
      reason: 'series_completed',
      message: seriesLock.message
    };
  }

  var finishedGuard = teamMatchFinish.assertMatchNotCompleted(match);
  if (!finishedGuard.ok) {
    return { ok: false, reason: 'already_finished', message: finishedGuard.message };
  }
  var status = asString(match.status).toLowerCase();
  if (status === 'ongoing' || status === 'live') {
    return {
      ok: false,
      reason: 'already_live',
      startedLive: false,
      message: '当前分站不可开赛'
    };
  }
  if (status !== 'registering') {
    return {
      ok: false,
      reason: 'status_not_registering',
      startedLive: false,
      message: '当前分站不可开赛'
    };
  }
  if (!matchHasFilledSeat(match)) {
    return {
      ok: false,
      reason: 'groups_empty',
      message: '请先完成本轮分组'
    };
  }

  var next = deepClone(match);
  next.status = 'ongoing';
  next.statusLabel = '比赛进行中';
  next.updatedAt = Date.now();

  try {
    saveMatch(next);
  } catch (e) {
    return {
      ok: false,
      reason: 'save_failed',
      message: '开赛失败，请重试'
    };
  }

  var saved = getMatchById(matchId) || next;
  var savedStatus = asString(saved && saved.status).toLowerCase();
  if (savedStatus !== 'ongoing' && savedStatus !== 'live') {
    return {
      ok: false,
      reason: 'start_not_live',
      startedLive: false,
      message: '开赛失败，请重试'
    };
  }
  var roundId =
    asString(src.roundId) ||
    asString(saved.seriesContext && saved.seriesContext.roundId) ||
    asString(match.seriesContext && match.seriesContext.roundId);
  return {
    ok: true,
    match: saved,
    startedLive: true,
    roundId: roundId,
    liveNotice: seriesRoundPhaseAggregate.formatSeriesRoundEnteredLiveNotice(
      series,
      roundId
    )
  };
}

function matchHasFilledSeat(match) {
  var groups = match && Array.isArray(match.groups) ? match.groups : [];
  for (var i = 0; i < groups.length; i++) {
    var players = (groups[i] && groups[i].players) || [];
    for (var j = 0; j < players.length; j++) {
      if (players[j] && asString(players[j].userId)) return true;
    }
  }
  return false;
}

module.exports = {
  STATION_DATA_INVALID_MSG: STATION_DATA_INVALID_MSG,
  verifySeriesContext: verifySeriesContext,
  buildSyntheticRegisterInfoFromDraft: buildSyntheticRegisterInfoFromDraft,
  validateSeriesSeatAffiliation: validateSeriesSeatAffiliation,
  saveStationGroups: saveStationGroups,
  startStationRound: startStationRound
};
