/**
 * 单场 G5–G8 红蓝得分：每组按当前比洞局面计 1 / 0.5 / 0。
 * 无双方有效洞成绩的组不计分。单场与 Series 共用，禁止另写一套。
 */

var teamMatchStore = require('./teamMatchStore.js');
var strokeEntityValidator = require('./strokeEntityValidator.js');

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function resolveAnyPlayerId(raw) {
  if (!raw || typeof raw !== 'object') return '';
  var id = raw.userId || raw.playerId || raw.id || raw.uid || raw.openid;
  return id != null ? String(id).trim() : '';
}

function isMatchPlayFilledScore(raw) {
  return raw !== null && raw !== undefined && raw !== '';
}

function normalizeMatchPlayStartHole(startHole) {
  var n = Number(startHole);
  if (!Number.isFinite(n)) return 1;
  var h = Math.floor(n);
  return h >= 1 && h <= 18 ? h : 1;
}

function buildMatchPlayHoleOrder(startHole) {
  var startIdx = normalizeMatchPlayStartHole(startHole) - 1;
  var order = [];
  for (var i = 0; i < 18; i++) order.push((startIdx + i) % 18);
  return order;
}

function formatMatchPlayTeamScore(score) {
  var n = Number(score);
  if (!Number.isFinite(n)) return '0';
  var halfSteps = Math.round(n * 2);
  var rounded = halfSteps / 2;
  if (halfSteps % 2 === 0) return String(Math.round(rounded));
  return String(rounded);
}

function resolveMatchPlaySideTeamIds(match) {
  var teamGroups = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
  var teamAId =
    teamGroups[0] && teamGroups[0].id != null ? String(teamGroups[0].id).trim() : '';
  var teamBId =
    teamGroups[1] && teamGroups[1].id != null ? String(teamGroups[1].id).trim() : '';
  return { teamAId: teamAId, teamBId: teamBId };
}

function readMatchPlayGroupScoreBucket(match, groupId) {
  var gid = groupId != null ? String(groupId).trim() : '';
  var scoreData =
    match && match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
      ? match.scoreData
      : null;
  var raw =
    gid && scoreData && scoreData[gid] && typeof scoreData[gid] === 'object' ? scoreData[gid] : null;
  if (typeof teamMatchStore.normalizeGroupScoreBucket === 'function') {
    return teamMatchStore.normalizeGroupScoreBucket(raw);
  }
  return {
    scoresByPlayer: {},
    scoresBySide: {},
    matchPlayMeta: null
  };
}

function resolveSlotScorePlayerId(slotPlayer, currentPlayerId) {
  var current = currentPlayerId != null ? String(currentPlayerId).trim() : '';
  if (current) return current;
  var p = slotPlayer || {};
  var scorePlayerId = p.scorePlayerId || p.slotScorePlayerId || p.scoreOwnerId;
  return scorePlayerId != null ? String(scorePlayerId).trim() : '';
}

function resolveScoresByPlayerRecord(scoresByPlayer, slotPlayer, currentPlayerId) {
  if (!scoresByPlayer || typeof scoresByPlayer !== 'object') return null;
  var scorePlayerId = resolveSlotScorePlayerId(slotPlayer, currentPlayerId);
  if (scorePlayerId && scoresByPlayer[scorePlayerId]) return scoresByPlayer[scorePlayerId];
  var playerId = currentPlayerId != null ? String(currentPlayerId).trim() : '';
  if (playerId && scoresByPlayer[playerId]) return scoresByPlayer[playerId];
  return null;
}

function resolvePlayerIdFn(opts) {
  return opts && typeof opts.resolveAnyPlayerId === 'function'
    ? opts.resolveAnyPlayerId
    : resolveAnyPlayerId;
}

function resolveMatchPlayGroupSideScores(match, group, teamIds, isG5, opts) {
  var resolveId = resolvePlayerIdFn(opts);
  var groupId = group && group.groupId != null ? String(group.groupId).trim() : '';
  var bucket = readMatchPlayGroupScoreBucket(match, groupId);
  var teamAId = teamIds && teamIds.teamAId ? String(teamIds.teamAId) : '';
  var teamBId = teamIds && teamIds.teamBId ? String(teamIds.teamBId) : '';

  var users =
    match && match.registerInfo && Array.isArray(match.registerInfo.users)
      ? match.registerInfo.users
      : [];
  var teamIdByUser = {};
  users.forEach(function (user) {
    var uid = resolveId(user);
    if (!uid) return;
    var teamId =
      user.matchTeamId != null && String(user.matchTeamId).trim() !== ''
        ? String(user.matchTeamId).trim()
        : user.groupId != null && String(user.groupId).trim() !== ''
          ? String(user.groupId).trim()
          : '';
    if (teamId) teamIdByUser[uid] = teamId;
  });

  var filled = (Array.isArray(group && group.players) ? group.players : [])
    .map(function (p) {
      return {
        userId: resolveId(p),
        position: Number(p && (p.position != null ? p.position : p.slotIndex)) || 0,
        raw: p
      };
    })
    .filter(function (p) {
      return p.userId;
    })
    .sort(function (a, b) {
      return a.position - b.position || String(a.userId).localeCompare(String(b.userId));
    });

  var playersA = [];
  var playersB = [];
  filled.forEach(function (p) {
    var tid = teamIdByUser[p.userId] || '';
    if (teamAId && tid === teamAId) playersA.push(p);
    else if (teamBId && tid === teamBId) playersB.push(p);
  });
  if (!playersA.length && !playersB.length && filled.length >= 2) {
    playersA.push(filled[0]);
    playersB.push(filled[1]);
  }

  var scoresA = [];
  var scoresB = [];
  if (isG5) {
    var scoresByPlayer =
      bucket.scoresByPlayer && typeof bucket.scoresByPlayer === 'object' ? bucket.scoresByPlayer : {};
    var recA = playersA[0]
      ? resolveScoresByPlayerRecord(scoresByPlayer, playersA[0].raw, playersA[0].userId)
      : null;
    var recB = playersB[0]
      ? resolveScoresByPlayerRecord(scoresByPlayer, playersB[0].raw, playersB[0].userId)
      : null;
    scoresA = recA && Array.isArray(recA.scores) ? recA.scores.slice() : [];
    scoresB = recB && Array.isArray(recB.scores) ? recB.scores.slice() : [];
  } else {
    var scoresBySide =
      bucket.scoresBySide && typeof bucket.scoresBySide === 'object' ? bucket.scoresBySide : {};
    var rawA = (teamAId && scoresBySide[teamAId]) || scoresBySide.A || scoresBySide.a || null;
    var rawB = (teamBId && scoresBySide[teamBId]) || scoresBySide.B || scoresBySide.b || null;
    var normA =
      typeof teamMatchStore.normalizeSideScoreRecord === 'function'
        ? teamMatchStore.normalizeSideScoreRecord(teamAId || 'A', 'A', rawA)
        : rawA;
    var normB =
      typeof teamMatchStore.normalizeSideScoreRecord === 'function'
        ? teamMatchStore.normalizeSideScoreRecord(teamBId || 'B', 'B', rawB)
        : rawB;
    scoresA = normA && Array.isArray(normA.scores) ? normA.scores.slice() : [];
    scoresB = normB && Array.isArray(normB.scores) ? normB.scores.slice() : [];
  }

  var startHole = 1;
  var meta =
    typeof teamMatchStore.normalizeMatchPlayMeta === 'function'
      ? teamMatchStore.normalizeMatchPlayMeta(bucket.matchPlayMeta)
      : null;
  if (meta && meta.startHole) {
    startHole = meta.startHole;
  } else {
    for (var hi = 0; hi < 18; hi++) {
      if (!isMatchPlayFilledScore(scoresA[hi]) || !isMatchPlayFilledScore(scoresB[hi])) continue;
      var sa = Number(scoresA[hi]);
      var sb = Number(scoresB[hi]);
      if (!Number.isFinite(sa) || !Number.isFinite(sb)) continue;
      startHole = hi + 1;
      break;
    }
  }

  return { scoresA: scoresA, scoresB: scoresB, startHole: startHole };
}

/**
 * @returns {'A'|'B'|'AS'|null} null = 尚无已决洞，不计分
 */
function resolveMatchPlayGroupFinalLeader(match, group, teamIds, isG5, opts) {
  var sideScores = resolveMatchPlayGroupSideScores(match, group, teamIds, isG5, opts);
  var scoresA = sideScores.scoresA;
  var scoresB = sideScores.scoresB;
  var holeOrder = buildMatchPlayHoleOrder(sideScores.startHole);
  var aWins = 0;
  var bWins = 0;
  var decided = 0;

  for (var oi = 0; oi < holeOrder.length; oi++) {
    var hi = holeOrder[oi];
    var rawA = scoresA[hi];
    var rawB = scoresB[hi];
    if (!isMatchPlayFilledScore(rawA) || !isMatchPlayFilledScore(rawB)) continue;
    var sa = Number(rawA);
    var sb = Number(rawB);
    if (!Number.isFinite(sa) || !Number.isFinite(sb)) continue;
    decided += 1;
    if (sa < sb) aWins += 1;
    else if (sb < sa) bWins += 1;
  }

  if (!decided) return null;
  var diff = aWins - bWins;
  if (diff > 0) return 'A';
  if (diff < 0) return 'B';
  return 'AS';
}

function groupPointsFromLeader(leader) {
  if (leader === 'A') return { red: 1, blue: 0 };
  if (leader === 'B') return { red: 0, blue: 1 };
  if (leader === 'AS') return { red: 0.5, blue: 0.5 };
  return { red: 0, blue: 0 };
}

function buildMatchPlayTeamScoreSummary(match, opts) {
  var redScore = 0;
  var blueScore = 0;
  if (!match || typeof match !== 'object') {
    return { redScore: 0, blueScore: 0 };
  }
  var groups = Array.isArray(match.groups) ? match.groups : [];
  if (!groups.length) {
    return { redScore: 0, blueScore: 0 };
  }
  var gameMode = strokeEntityValidator.resolveGameMode(match);
  var isG5 = strokeEntityValidator.isG5MatchPlayMode(gameMode);
  var teamIds = resolveMatchPlaySideTeamIds(match);

  groups.forEach(function (group) {
    var leader = resolveMatchPlayGroupFinalLeader(match, group, teamIds, isG5, opts);
    var pts = groupPointsFromLeader(leader);
    redScore += pts.red;
    blueScore += pts.blue;
  });

  return { redScore: redScore, blueScore: blueScore };
}

module.exports = {
  resolveAnyPlayerId: resolveAnyPlayerId,
  isMatchPlayFilledScore: isMatchPlayFilledScore,
  normalizeMatchPlayStartHole: normalizeMatchPlayStartHole,
  buildMatchPlayHoleOrder: buildMatchPlayHoleOrder,
  formatMatchPlayTeamScore: formatMatchPlayTeamScore,
  resolveMatchPlaySideTeamIds: resolveMatchPlaySideTeamIds,
  readMatchPlayGroupScoreBucket: readMatchPlayGroupScoreBucket,
  resolveScoresByPlayerRecord: resolveScoresByPlayerRecord,
  resolveMatchPlayGroupSideScores: resolveMatchPlayGroupSideScores,
  resolveMatchPlayGroupFinalLeader: resolveMatchPlayGroupFinalLeader,
  groupPointsFromLeader: groupPointsFromLeader,
  buildMatchPlayTeamScoreSummary: buildMatchPlayTeamScoreSummary
};
