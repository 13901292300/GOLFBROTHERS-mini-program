/**
 * 记分页 / Hub 的 side-game 宿主 snapshot。
 * 只选择当前入口数据并深拷贝为 POJO，不做 party / 洞序 / 成绩归一化。
 */
var gameStore = require('../../../utils/gameStore.js');
var teamMatchStore = require('../../../utils/teamMatchStore.js');
var editAccess = require('../../../utils/sideGameEditAccess.js');

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function jsonClone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function safeClone(value) {
  try {
    return jsonClone(value);
  } catch (e) {
    return null;
  }
}

function stampEditAccess(cloned, src) {
  if (!cloned) return cloned;
  if (src && typeof src === 'object') {
    cloned.createdBy = asString(src.createdBy || src.creatorId || cloned.createdBy);
    if (src.creatorId) cloned.creatorId = asString(src.creatorId);
    if (src.tempAdmins) cloned.tempAdmins = src.tempAdmins;
  }
  var uid = asString(cloned.currentUserId || currentUserId());
  cloned.currentUserId = uid;
  if (!uid) return cloned;
  cloned.canEditSideGames = editAccess.canEditSideGames(src || cloned, uid);
  return cloned;
}

function currentUserId() {
  try {
    var user = gameStore.getCurrentUser && gameStore.getCurrentUser();
    return asString(user && user.userId);
  } catch (e) {
    return '';
  }
}

function emptySnapshot(patch) {
  var out = {
    source: 'gameStore',
    matchId: '',
    groupId: '',
    scope: 'match',
    seriesId: '',
    roundId: '',
    currentUserId: currentUserId(),
    matchStatus: '',
    revisionSource: '0',
    allowBigPot: false,
    gameMode: '',
    courseContext: {
      courseId: '',
      courseName: '',
      front9Course: null,
      back9Course: null,
      courseHalfText: ''
    },
    groups: [],
    scoreData: {},
    scoreEntities: {},
    teamGroups: [],
    registerInfo: { users: [] },
    groupCompositionMap: {},
    composition: null
  };
  if (patch && typeof patch === 'object') {
    Object.keys(patch).forEach(function (key) {
      out[key] = patch[key];
    });
  }
  return jsonClone(out);
}

function listGameGroups(game) {
  if (!game) return [];
  if (Array.isArray(game.groups) && game.groups.length) return game.groups;
  return [
    {
      groupId: (game.gameId || 'legacy') + '-g1',
      name: '第1组',
      playersSlots: game.playersSlots || [],
      scoresByPlayer: game.scoresByPlayer || {},
      teamScoresByEntity: game.teamScoresByEntity || []
    }
  ];
}

function fromGame(game, options) {
  var opts = options || {};
  var g = game && typeof game === 'object' ? game : null;
  if (!g || !asString(opts.matchId || g.gameId)) {
    return emptySnapshot({
      scope: opts.scope === 'group' ? 'group' : 'match',
      groupId: asString(opts.groupId),
      allowBigPot: !!opts.allowBigPot,
      source: 'gameStore'
    });
  }
  var cloned = safeClone({
    source: 'gameStore',
    matchId: asString(opts.matchId || g.gameId),
    groupId: asString(opts.groupId),
    scope: opts.scope === 'group' ? 'group' : 'match',
    seriesId: '',
    roundId: '',
    currentUserId: currentUserId(),
    matchStatus: '',
    revisionSource: g.updatedAt || g.createdAt || '0',
    allowBigPot: !!opts.allowBigPot,
    gameMode: g.gameMode || '',
    courseContext: {
      courseId: g.courseId || '',
      courseName: g.courseName || '',
      front9Course: g.front9Course || null,
      back9Course: g.back9Course || null,
      courseHalfText: g.courseHalfText || g.halfText || ''
    },
    groups: listGameGroups(g),
    scoreData: {},
    scoreEntities: {},
    teamGroups: [],
    registerInfo: { users: [] },
    groupCompositionMap: g.groupCompositionMap || {},
    composition: g.composition || null
  });
  return stampEditAccess(cloned, g) || emptySnapshot({ source: 'gameStore', allowBigPot: !!opts.allowBigPot });
}

function fromTeamMatch(match, options) {
  var opts = options || {};
  var m = match && typeof match === 'object' ? match : null;
  if (!m || !asString(m.matchId)) {
    return emptySnapshot({
      source: 'teamMatch',
      scope: opts.scope === 'group' ? 'group' : 'match',
      groupId: asString(opts.groupId),
      allowBigPot: !!opts.allowBigPot
    });
  }
  var cloned = safeClone({
    source: 'teamMatch',
    matchId: asString(m.matchId),
    groupId: asString(opts.groupId),
    scope: opts.scope === 'group' ? 'group' : 'match',
    seriesId: asString(m.seriesContext && m.seriesContext.seriesId),
    roundId: asString(m.seriesContext && m.seriesContext.roundId),
    currentUserId: currentUserId(),
    matchStatus: '',
    revisionSource: m.updatedAt || m.createdAt || '0',
    allowBigPot: !!opts.allowBigPot,
    gameMode: m.gameMode || m.selectedGameMode || '',
    courseContext: {
      courseId: m.courseId || '',
      courseName: m.courseName || '',
      front9Course: m.front9Course || null,
      back9Course: m.back9Course || null,
      courseHalfText: m.courseHalfText || m.halfText || ''
    },
    groups: Array.isArray(m.groups) ? m.groups : [],
    scoreData: m.scoreData && typeof m.scoreData === 'object' ? m.scoreData : {},
    scoreEntities: m.scoreEntities && typeof m.scoreEntities === 'object' ? m.scoreEntities : {},
    teamGroups: Array.isArray(m.teamGroups) ? m.teamGroups : [],
    registerInfo: m.registerInfo || { users: [] }
  });
  return stampEditAccess(cloned, m) || emptySnapshot({ source: 'teamMatch', allowBigPot: !!opts.allowBigPot });
}

function resolveGameStoreGroupId(game, ms) {
  var groups = listGameGroups(game);
  var want = asString(ms && ms.groupId);
  for (var i = 0; i < groups.length; i++) {
    if (asString(groups[i] && groups[i].groupId) === want) return want;
  }
  var gi = ms && ms.groupIndex != null ? Number(ms.groupIndex) || 0 : 0;
  return asString(groups[gi] && groups[gi].groupId);
}

function resolveTeamMatchGroupId(match, ms) {
  var want = asString(ms && ms.groupId);
  var groups = Array.isArray(match && match.groups) ? match.groups : [];
  for (var i = 0; i < groups.length; i++) {
    if (asString(groups[i] && groups[i].groupId) === want) return want;
  }
  return asString(groups[0] && groups[0].groupId);
}

function buildForScorePage(ms) {
  var state = ms || {};
  if (asString(state.matchId)) {
    var match = teamMatchStore.getMatchById(state.matchId);
    return fromTeamMatch(match, {
      scope: 'group',
      groupId: resolveTeamMatchGroupId(match, state),
      allowBigPot: true
    });
  }
  if (asString(state.gameId)) {
    var game = gameStore.getGame(state.gameId);
    return fromGame(game, {
      scope: 'group',
      groupId: resolveGameStoreGroupId(game, state),
      allowBigPot: true,
      matchId: state.gameId
    });
  }
  return emptySnapshot({ scope: 'group', allowBigPot: true, source: 'gameStore' });
}

function buildForHub(gameId) {
  var id = asString(gameId);
  var game = id ? gameStore.getGameById(id) : null;
  return fromGame(game, { scope: 'match', allowBigPot: false, matchId: id });
}

module.exports = {
  jsonClone: jsonClone,
  emptySnapshot: emptySnapshot,
  fromGame: fromGame,
  fromTeamMatch: fromTeamMatch,
  buildForScorePage: buildForScorePage,
  buildForHub: buildForHub
};
