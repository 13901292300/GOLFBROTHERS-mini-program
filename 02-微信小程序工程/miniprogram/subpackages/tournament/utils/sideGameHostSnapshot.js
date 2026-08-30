/**
 * 赛事详情 side-game 宿主 snapshot。
 * 只提取当前 match，不读其它系列轮次，不做 party / 洞序 / 成绩归一化。
 */
var seriesStationIndex = require('../../../utils/seriesStationIndex.js');
var gameStore = require('../../../utils/gameStore.js');

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
    source: 'teamMatch',
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
    registerInfo: { users: [] }
  };
  if (patch && typeof patch === 'object') {
    Object.keys(patch).forEach(function (key) {
      out[key] = patch[key];
    });
  }
  return jsonClone(out);
}

function seriesIdsOf(match) {
  var seriesId = asString(match && match.seriesContext && match.seriesContext.seriesId);
  var roundId = asString(match && match.seriesContext && match.seriesContext.roundId);
  if (seriesId && roundId) return { seriesId: seriesId, roundId: roundId };
  try {
    var link = seriesStationIndex.getByMatchId(asString(match && match.matchId));
    if (link) {
      return {
        seriesId: asString(link.seriesId),
        roundId: asString(link.roundId)
      };
    }
  } catch (eIndex) {
    /* node / 无 storage */
  }
  return { seriesId: seriesId, roundId: roundId };
}

function buildFromMatch(match, options) {
  var opts = options || {};
  var m = match && typeof match === 'object' ? match : null;
  if (!m || !asString(m.matchId)) {
    return emptySnapshot({
      scope: opts.scope === 'group' ? 'group' : 'match',
      groupId: asString(opts.groupId),
      allowBigPot: !!opts.allowBigPot
    });
  }
  var ids = seriesIdsOf(m);
  var cloned = safeClone({
    source: 'teamMatch',
    matchId: asString(m.matchId),
    groupId: asString(opts.groupId),
    scope: opts.scope === 'group' ? 'group' : 'match',
    seriesId: ids.seriesId,
    roundId: ids.roundId,
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
  return cloned || emptySnapshot({ allowBigPot: !!opts.allowBigPot });
}

module.exports = {
  jsonClone: jsonClone,
  emptySnapshot: emptySnapshot,
  buildFromMatch: buildFromMatch
};
