/**
 * 球队赛（队内/队际/Series 分站）整场完成态
 * - 唯一完成标准：match.status 为 finished/completed（与 matchStatus 确认结束语义一致）
 * - 全组「结束本组」后提升为整场 finished
 * - M 面板「结束全场」与单场详情共用同一写入
 * - 不新增 Series isLocked；无恢复比赛流程
 */

var matchStatus = require('./matchStatus.js');
var teamMatchStore = require('./teamMatchStore.js');
var strokeEntityValidator = require('./strokeEntityValidator.js');
var seriesFinishLock = require('./seriesFinishLock.js');
var seriesRyderCup = require('./seriesRyderCup.js');

var MATCH_FINISHED_TOAST = '比赛已经结束。';
var MATCH_FINISHED_EDIT_TOAST = '比赛已结束，无法修改';
var MATCH_FINISHED_SAVE_TOAST = '比赛已结束';

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function asLower(v) {
  return asString(v).toLowerCase();
}

function isCancelledMatch(match) {
  var s = asLower(match && match.status);
  if (s === 'cancelled' || s === 'canceled') return true;
  var rs = asLower(match && match.roundStatus);
  return rs === 'cancelled' || rs === 'canceled';
}

/** 整场比赛已确认结束（存储 finished / completed） */
function isMatchCompleted(match) {
  if (!match) return false;
  if (isCancelledMatch(match)) return false;
  return matchStatus.isGroupConfirmedFinished(match.status);
}

function playerHasIdentity(player) {
  if (!player || typeof player !== 'object') return false;
  return !!(
    asString(player.userId) ||
    asString(player.playerId) ||
    asString(player.id) ||
    asString(player.openId)
  );
}

function isValidTeeGroup(group) {
  if (!group || typeof group !== 'object') return false;
  var players = Array.isArray(group.players) ? group.players : [];
  for (var i = 0; i < players.length; i++) {
    if (playerHasIdentity(players[i])) return true;
  }
  return false;
}

/** 有效分组：至少一名真实球员；空组/占位组不计入完成聚合 */
function listValidTeeGroups(match) {
  var groups = match && Array.isArray(match.groups) ? match.groups : [];
  var out = [];
  for (var i = 0; i < groups.length; i++) {
    if (isValidTeeGroup(groups[i])) out.push(groups[i]);
  }
  return out;
}

function allValidGroupsConfirmedFinished(match) {
  var groups = listValidTeeGroups(match);
  if (!groups.length) return false;
  for (var i = 0; i < groups.length; i++) {
    if (!matchStatus.isGroupConfirmedFinished(groups[i] && groups[i].status)) {
      return false;
    }
  }
  return true;
}

function freezeMatchScoreBuckets(match) {
  if (!match) return match;
  match.scoreData =
    match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
      ? match.scoreData
      : {};
  var groups = Array.isArray(match.groups) ? match.groups : [];
  for (var i = 0; i < groups.length; i++) {
    var g = groups[i];
    var groupId = g && g.groupId != null ? String(g.groupId) : '';
    if (!groupId) continue;
    var bucket =
      match.scoreData[groupId] && typeof match.scoreData[groupId] === 'object'
        ? match.scoreData[groupId]
        : null;
    if (!bucket) continue;
    teamMatchStore.forceGroupScoreBucketFinishedScoreAt(bucket);
    match.scoreData[groupId] = bucket;
  }
  return match;
}

/** 与普通单场 M 面板确认结束同一写入（不改 group.status） */
function applyFinishWholeMatch(match) {
  if (!match) return match;
  freezeMatchScoreBuckets(match);
  match.status = matchStatus.FINISHED_STORAGE_STATUS;
  match.statusLabel = '已结束';
  match.finishedAt = Date.now();
  match.updatedAt = Date.now();
  return match;
}

function promoteMatchFinishedIfAllGroupsDone(match) {
  if (!match || isCancelledMatch(match) || isMatchCompleted(match)) {
    return { changed: false, match: match };
  }
  if (!allValidGroupsConfirmedFinished(match)) {
    return { changed: false, match: match };
  }
  applyFinishWholeMatch(match);
  return { changed: true, match: match };
}

function assertMatchNotCompleted(match) {
  if (isMatchCompleted(match)) {
    return {
      ok: false,
      reason: 'match_finished',
      message: MATCH_FINISHED_TOAST
    };
  }
  return { ok: true };
}

function assertWritable(match, options) {
  var seriesGuard = seriesFinishLock.assertWritableForMatch(match, options);
  if (!seriesGuard.ok) return seriesGuard;
  return assertMatchNotCompleted(match);
}

function confirmFinishWholeTeamMatch(match, options) {
  if (!match) {
    return { ok: false, reason: 'match_missing', message: '未找到比赛信息' };
  }
  if (isCancelledMatch(match)) {
    return { ok: false, reason: 'match_cancelled', message: '比赛已取消' };
  }
  var seriesGuard = seriesFinishLock.assertWritableForMatch(match, options);
  if (!seriesGuard.ok) return seriesGuard;
  if (isMatchCompleted(match)) {
    return {
      ok: false,
      reason: 'already_finished',
      message: MATCH_FINISHED_TOAST
    };
  }
  var loaded = seriesFinishLock.loadSeriesForMatch(match, options && options.getSeriesById);
  if (seriesRyderCup.isRyderCupSeries(loaded.series) && !allValidGroupsConfirmedFinished(match)) {
    return {
      ok: false,
      reason: 'groups_incomplete',
      message: '仍有分组未结束，不能结束本轮'
    };
  }
  applyFinishWholeMatch(match);
  return { ok: true, match: match };
}

function getFinishMatchModalContent(match) {
  var gameMode = strokeEntityValidator.resolveGameMode(match);
  var isMatchPlay = strokeEntityValidator.isMatchPlayBoardMode(gameMode);
  return {
    title: '结束比赛',
    content: isMatchPlay
      ? '比赛结束后，将锁定当前比赛结果。'
      : '确认结束本场比赛？\n\n结束后：\n- 比赛进入最终状态\n- 可生成净杆成绩\n- 领先榜作为最终成绩展示'
  };
}

function saveMatchIfWritable(match, options) {
  var opts = options && typeof options === 'object' ? options : {};
  var getMatchById =
    typeof opts.getMatchById === 'function'
      ? opts.getMatchById
      : function (id) {
          return teamMatchStore.getMatchById(id);
        };
  var saveMatch =
    typeof opts.saveMatch === 'function'
      ? opts.saveMatch
      : function (m) {
          return teamMatchStore.saveMatch(m);
        };
  var matchId = asString(match && match.matchId);
  var latest = matchId ? getMatchById(matchId) : match;
  var guard = assertWritable(latest, opts);
  if (!guard.ok) return guard;
  try {
    var factory = require('./teamClub/repoFactory.js');
    if (factory.getMode() === 'cloud' && isMatchCompleted(match)) {
      var scoreSync = require('./teamClub/scoreSync.js');
      if (scoreSync.hasPending(match.matchId)) {
        return { ok: false, reason: 'unsynced_scores', message: '还有未同步的成绩，暂时不能完赛' };
      }
    }
  } catch (eSync) {
    /* ignore */
  }
  try {
    saveMatch(match);
  } catch (e) {
    return { ok: false, reason: 'save_failed', message: '保存失败，请重试' };
  }
  return { ok: true, match: match };
}

module.exports = {
  MATCH_FINISHED_TOAST: MATCH_FINISHED_TOAST,
  MATCH_FINISHED_EDIT_TOAST: MATCH_FINISHED_EDIT_TOAST,
  MATCH_FINISHED_SAVE_TOAST: MATCH_FINISHED_SAVE_TOAST,
  isCancelledMatch: isCancelledMatch,
  isMatchCompleted: isMatchCompleted,
  listValidTeeGroups: listValidTeeGroups,
  allValidGroupsConfirmedFinished: allValidGroupsConfirmedFinished,
  applyFinishWholeMatch: applyFinishWholeMatch,
  promoteMatchFinishedIfAllGroupsDone: promoteMatchFinishedIfAllGroupsDone,
  assertMatchNotCompleted: assertMatchNotCompleted,
  assertWritable: assertWritable,
  confirmFinishWholeTeamMatch: confirmFinishWholeTeamMatch,
  getFinishMatchModalContent: getFinishMatchModalContent,
  saveMatchIfWritable: saveMatchIfWritable
};
