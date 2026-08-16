/**
 * 普通单场球队赛：进入指定小组记分页（matchId + groupId）。
 * Series / 详情出发表共用，禁止页面复制 navigateTo 路径。
 */

var matchStateUtil = require('./matchState.js');
var groupsStore = require('./groupsStore.js');
var playerManage = require('./playerManage.js');
var strokeEntityValidator = require('./strokeEntityValidator.js');
var viewerGroup = require('./teamMatchViewerGroup.js');

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function resolveTeamMatchScorePageMode(match, groupId) {
  var gameMode = asString(match && (match.gameMode || match.selectedGameMode));
  if (gameMode === '个人比杆赛' || strokeEntityValidator.isG5MatchPlayMode(gameMode)) {
    return 'individual_stroke';
  }
  if (
    strokeEntityValidator.isG6G7MatchPlayMode(gameMode) ||
    strokeEntityValidator.isG8MatchPlayMode(gameMode)
  ) {
    return 'individual_stroke';
  }
  var gid = asString(groupId);
  var scoreEntities = match && match.scoreEntities;
  if (scoreEntities && typeof scoreEntities === 'object' && !Array.isArray(scoreEntities)) {
    var list = Array.isArray(scoreEntities[gid]) ? scoreEntities[gid] : [];
    if (list.length > 0) return 'stroke_entity';
  }
  if (
    gameMode === '最好成绩比杆赛' ||
    gameMode === '四人四球比杆赛' ||
    gameMode === '最佳球位比杆赛' ||
    gameMode === '四人两球比杆赛'
  ) {
    return 'stroke_entity';
  }
  return 'individual_stroke';
}

function mapGroupPlayers(group) {
  var players = group && Array.isArray(group.players) ? group.players : [];
  var out = [];
  for (var i = 0; i < players.length; i++) {
    var p = players[i];
    if (!p) continue;
    var pid = playerManage.resolveUserId(p);
    if (!pid) continue;
    out.push({
      playerId: pid,
      name: playerManage.resolveMatchNickname(p),
      avatar: p.avatar || ''
    });
  }
  return out;
}

function enterTeamMatchGroupScore(match, groupId, options) {
  var opts = options && typeof options === 'object' ? options : {};
  var gid = asString(groupId);
  if (!match || !asString(match.matchId) || !gid) {
    return { ok: false, reason: 'missing' };
  }
  var store = opts.groupsStore || groupsStore;
  if (store && typeof store.ensureInitialized === 'function') store.ensureInitialized();
  var group = null;
  var groups = Array.isArray(match.groups) ? match.groups : [];
  for (var i = 0; i < groups.length; i++) {
    if (asString(groups[i] && groups[i].groupId) === gid) {
      group = groups[i];
      break;
    }
  }
  var players = [];
  if (typeof opts.mapPlayers === 'function') {
    players = group ? opts.mapPlayers(group) : [];
  } else {
    players = mapGroupPlayers(group);
  }
  if (!Array.isArray(players)) players = [];
  if (!players.length && store && typeof store.loadGroupForScoring === 'function') {
    players = (store.loadGroupForScoring(gid) || []).map(function (p) {
      return {
        playerId: p.playerId,
        name: p.name,
        avatar: p.avatar || ''
      };
    });
  }
  var groupCount = groups.length || (store && store.getGroups ? (store.getGroups() || []).length : 0) || 1;
  var mode =
    typeof opts.resolveMode === 'function'
      ? opts.resolveMode(match, gid)
      : resolveTeamMatchScorePageMode(match, gid);
  var setMatchState = opts.setMatchState || matchStateUtil.setMatchState;
  var enterScorePage = opts.enterScorePage || matchStateUtil.enterScorePage;
  var emptyScores = opts.emptyScores || matchStateUtil.emptyScores;
  setMatchState({
    mode: mode,
    formatType: 'individual_stroke',
    gameId: '',
    matchId: asString(match.matchId),
    groupIndex: 0,
    groupId: gid,
    players: players,
    course: {
      courseId: match.courseId || '',
      courseName: match.courseName || match.venueName || '',
      courseLocation: match.courseLocation || '',
      halfText: match.courseHalfText || '',
      roundName:
        match.roundName ||
        match.name ||
        match.eventName ||
        match.tournamentName ||
        match.teamName ||
        '',
      gameMode: match.gameMode || match.selectedGameMode || '个人比杆赛',
      teeTime: match.teeTime || match.date || '',
      teeTimeText: match.teeTimeText || '',
      visibility: match.visibility || '',
      accessCode: match.accessCode || '',
      front9Course: match.front9Course || null,
      back9Course: match.back9Course || null
    },
    scores: emptyScores(),
    groupCount: groupCount
  });
  enterScorePage();
  return { ok: true, matchId: asString(match.matchId), groupId: gid, mode: mode };
}

function enterViewerGroupScore(match, viewerUserId, options) {
  var wxLike = options && options.wx ? options.wx : typeof wx !== 'undefined' ? wx : null;
  var groupId = viewerGroup.resolveViewerGroupId(match, viewerUserId);
  if (!groupId) {
    if (wxLike && typeof wxLike.showToast === 'function') {
      wxLike.showToast({ title: viewerGroup.MISSING_GROUP_TOAST, icon: 'none' });
    }
    return { ok: false, reason: 'not_in_group', groupId: '' };
  }
  return enterTeamMatchGroupScore(match, groupId, options);
}

module.exports = {
  resolveTeamMatchScorePageMode: resolveTeamMatchScorePageMode,
  enterTeamMatchGroupScore: enterTeamMatchGroupScore,
  enterViewerGroupScore: enterViewerGroupScore
};
