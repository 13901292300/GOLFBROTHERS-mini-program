/**
 * 记分页「结束本组比赛」公共写入（普通单场 / 队际 / Series 分站共用）。
 * 不另写 Series 终态；整轮/系列自动完成仍走 promote + maybeFinalize。
 */

var matchStatus = require('../../../utils/matchStatus.js');
var teamMatchStore = require('../../../utils/teamMatchStore.js');
var teamMatchFinish = require('../../../utils/teamMatchFinish.js');
var seriesFinalize = require('../../../utils/seriesFinalize.js');
var seriesFinishLock = require('../../../utils/seriesFinishLock.js');
var gameProgress = require('../../../utils/gameProgress.js');
var scoreCompleteness = require('../../../utils/scoreCompleteness.js');

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function isRoundFinished(match) {
  var rs = asString(match && match.roundStatus).toLowerCase();
  return rs === 'completed' || rs === 'finished';
}

function assertCanFinishGroup(ctx) {
  var input = ctx && typeof ctx === 'object' ? ctx : {};
  var host = input.match || input.game || null;
  var group = input.group || null;
  if (!host || !group) {
    return { ok: false, reason: 'missing_host', message: '未找到比赛信息' };
  }
  if (input.editable === false || input.readOnly === true) {
    return { ok: false, reason: 'readonly', message: '当前记分页不可编辑' };
  }
  if (matchStatus.isGroupConfirmedFinished(group.status)) {
    return { ok: false, reason: 'group_finished', message: '本组比赛已结束' };
  }
  if (input.kind === 'game' || input.game) {
    if (gameProgress.isGameEnded(input.game || host)) {
      return { ok: false, reason: 'match_finished', message: '比赛已经结束。' };
    }
  } else {
    var writable = teamMatchFinish.assertWritable(host, input);
    if (!writable.ok) return writable;
    if (isRoundFinished(host)) {
      return { ok: false, reason: 'round_finished', message: '本轮比赛已结束' };
    }
  }
  var projection = scoreCompleteness.projectGroupCompleteness(input);
  if (projection.exempt) {
    return { ok: false, reason: 'exempt', message: '当前组无需结束确认' };
  }
  if (!projection.complete) {
    return { ok: false, reason: 'incomplete', message: '本组仍有成绩未录入完成' };
  }
  return { ok: true };
}

function finishTeamMatchGroup(match, groupId, options) {
  var opts = options && typeof options === 'object' ? options : {};
  if (!match || !Array.isArray(match.groups)) {
    return { ok: false, reason: 'match_missing', message: '未找到比赛信息' };
  }
  var gid = asString(groupId);
  var group = null;
  for (var i = 0; i < match.groups.length; i++) {
    if (asString(match.groups[i] && match.groups[i].groupId) === gid) {
      group = match.groups[i];
      break;
    }
  }
  if (!group) {
    return { ok: false, reason: 'group_missing', message: '未找到当前分组' };
  }
  var ctx = {
    kind: 'teamMatch',
    match: match,
    group: group,
    matchId: match.matchId,
    groupId: gid,
    editable: opts.editable !== false,
    getSeriesById: opts.getSeriesById
  };
  var gate = assertCanFinishGroup(ctx);
  if (!gate.ok) return gate;

  var oldStatus = group.status || '';
  var newStatus = matchStatus.FINISHED_STORAGE_STATUS;
  if (gid) {
    match.scoreData =
      match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
        ? match.scoreData
        : {};
    var bucket =
      match.scoreData[gid] && typeof match.scoreData[gid] === 'object' ? match.scoreData[gid] : null;
    if (bucket) {
      teamMatchStore.forceGroupScoreBucketFinishedScoreAt(bucket);
      match.scoreData[gid] = bucket;
    }
  }
  match.groups = match.groups.map(function (item) {
    return asString(item && item.groupId) === gid
      ? Object.assign({}, item, {
          status: newStatus,
          statusLabel: '已结束',
          updatedAt: Date.now()
        })
      : item;
  });
  match.updatedAt = Date.now();
  teamMatchFinish.promoteMatchFinishedIfAllGroupsDone(match);

  var save =
    typeof opts.saveMatchIfWritable === 'function'
      ? opts.saveMatchIfWritable
      : function (m) {
          return teamMatchFinish.saveMatchIfWritable(m, opts);
        };
  var saved = save(match);
  if (!saved || saved.ok === false) {
    return {
      ok: false,
      reason: (saved && saved.reason) || 'save_failed',
      message: (saved && saved.message) || '保存失败，请重试'
    };
  }

  var promoted = teamMatchFinish.isMatchCompleted(match);
  var seriesFinalized = false;
  try {
    var fin =
      typeof opts.maybeFinalizeAfterStationPersisted === 'function'
        ? opts.maybeFinalizeAfterStationPersisted(match, opts)
        : seriesFinalize.maybeFinalizeAfterStationPersisted(match, opts);
    seriesFinalized = !!(fin && fin.ok);
  } catch (eFin) {
    seriesFinalized = false;
  }

  return {
    ok: true,
    match: match,
    oldStatus: oldStatus,
    newStatus: newStatus,
    matchPromoted: promoted,
    seriesFinalized: seriesFinalized
  };
}

function finishGameGroup(gameId, groupIndex, options) {
  var opts = options && typeof options === 'object' ? options : {};
  var gameStore = opts.gameStore;
  if (!gameStore) {
    try {
      gameStore = require('../../../utils/gameStore.js');
    } catch (e) {
      gameStore = null;
    }
  }
  var game = gameStore && typeof gameStore.getGame === 'function' ? gameStore.getGame(gameId) : opts.game;
  var gi = groupIndex || 0;
  var group =
    game && Array.isArray(game.groups) && game.groups[gi]
      ? game.groups[gi]
      : game
        ? {
            groupId: (game.gameId || '') + '-g1',
            playersSlots: game.playersSlots || [],
            scoresByPlayer: game.scoresByPlayer || {},
            teamScoresByEntity: game.teamScoresByEntity || [],
            status: game.status
          }
        : null;
  var gate = assertCanFinishGroup({
    kind: 'game',
    game: game,
    group: group,
    matchId: gameId,
    groupId: group && group.groupId,
    editable: opts.editable !== false
  });
  if (!gate.ok) return gate;
  var confirm =
    typeof opts.confirmFinishGame === 'function' ? opts.confirmFinishGame : gameProgress.confirmFinishGame;
  confirm(gameId, gi);
  return { ok: true, gameId: gameId, groupIndex: gi };
}

module.exports = {
  assertCanFinishGroup: assertCanFinishGroup,
  finishTeamMatchGroup: finishTeamMatchGroup,
  finishGameGroup: finishGameGroup,
  isRoundFinished: isRoundFinished,
  isSeriesCompleted: seriesFinishLock.isSeriesCompleted
};
