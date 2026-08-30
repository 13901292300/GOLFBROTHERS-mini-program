/**
 * GameHostContext 归一化（仅 game 分包）。
 * 宿主传入深拷贝 POJO hostSnapshot；本模块构建 party / 洞序 / 成绩视图。
 */
var holeLayout = require('../../../utils/holeLayout.js');
var halfCourse = require('../../../utils/halfCourse.js');
var matchStatus = require('../../../utils/matchStatus.js');
var playerManage = require('../../../utils/playerManage.js');
var strokeEntityValidator = require('../../../utils/strokeEntityValidator.js');

var SCORE_FIELDS = ['holes.score'];

var RULE_CAPS = [
  { ruleId: 'stroke-2', requiredPartyCount: 2 },
  { ruleId: 'match-2', requiredPartyCount: 2 },
  { ruleId: '8421-2', requiredPartyCount: 2 },
  { ruleId: 'three-set', requiredPartyCount: 2 },
  { ruleId: 'youcai', requiredPartyCount: 2 },
  { ruleId: 'landlord-big', requiredPartyCount: 3 },
  { ruleId: 'landlord-mid', requiredPartyCount: 3 },
  { ruleId: 'landlord-small', requiredPartyCount: 3 },
  { ruleId: '8421-3', requiredPartyCount: 3 },
  { ruleId: 'lasuo-4', requiredPartyCount: 4 },
  { ruleId: '8421-4', requiredPartyCount: 4 },
  { ruleId: 'three-vs-one', requiredPartyCount: 4 },
  { ruleId: 'dizhubo-4', requiredPartyCount: 4 },
  { ruleId: 'vegas', requiredPartyCount: 4 },
  { ruleId: 'skins', requiredPartyCount: 4 },
  { ruleId: 'lasuo-n', requiredPartyCount: 6 },
  { ruleId: 'horn', requiredPartyCount: 5 }
];

function jsonClone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function isFilledScore(s) {
  return s !== null && s !== undefined && s !== '' && !isNaN(Number(s));
}

function capOf(ruleId) {
  var id = asString(ruleId);
  for (var i = 0; i < RULE_CAPS.length; i++) {
    if (RULE_CAPS[i].ruleId === id) {
      return {
        ruleId: id,
        requiredPartyCount: RULE_CAPS[i].requiredPartyCount,
        requiresIndividualScores: false,
        scoreFields: SCORE_FIELDS.slice()
      };
    }
  }
  return null;
}

function listRuleCapabilities() {
  return RULE_CAPS.map(function (row) {
    return capOf(row.ruleId);
  });
}

function emptyContext(patch) {
  var out = {
    matchId: '',
    groupId: '',
    scope: 'group',
    seriesId: '',
    roundId: '',
    currentUserId: '',
    matchStatus: 'UPCOMING',
    revision: '0',
    holeContextReady: false,
    holeOrder: [],
    pars: {},
    players: [],
    scoreParties: [],
    officialScoresByPartyId: {},
    officialScoresByPlayerId: {},
    allowBigPot: false,
    scoreKind: 'player'
  };
  if (patch && typeof patch === 'object') {
    Object.keys(patch).forEach(function (key) {
      out[key] = patch[key];
    });
  }
  return jsonClone(out);
}

function resolveOfficialHoleContext(src) {
  var rec = src || {};
  var front = asString(rec.front9Course);
  var back = asString(rec.back9Course);
  if (!front && !back) {
    var parsed = halfCourse.parseCourseHalfText(rec.courseHalfText || rec.halfText || '');
    front = asString(parsed && parsed.front9Course);
    back = asString(parsed && parsed.back9Course);
  }
  if (!front || !back) {
    return { holeContextReady: false, holeOrder: [], pars: {} };
  }
  var course = halfCourse.resolveHalfCourseRecord(rec.courseId, rec.courseName) || null;
  var layout = holeLayout.buildHoleLayout(course, front, back);
  var holePars = (layout && layout.holePars) || [];
  var holeOrder = [];
  var pars = {};
  var i;
  for (i = 0; i < 9; i++) holeOrder.push(front + (i + 1));
  for (i = 0; i < 9; i++) holeOrder.push(back + (i + 1));
  for (i = 0; i < holeOrder.length; i++) {
    var n = Number(holePars[i]);
    pars[holeOrder[i]] = n === 3 || n === 4 || n === 5 ? n : 4;
  }
  return { holeContextReady: true, holeOrder: holeOrder, pars: pars };
}

function holesFromScoreArray(scores, holeOrder) {
  var holes = {};
  var arr = Array.isArray(scores) ? scores : [];
  var filled = false;
  (holeOrder || []).forEach(function (label, i) {
    var raw = arr[i];
    var score = isFilledScore(raw) ? Number(raw) : null;
    if (score != null) filled = true;
    holes[label] = { score: score };
  });
  return { holes: holes, filled: filled };
}

function playerView(id, name, avatar, groupId, teamId) {
  return {
    playerId: asString(id),
    displayName: asString(name),
    avatar: asString(avatar),
    groupId: asString(groupId),
    teamId: asString(teamId)
  };
}

function makeParty(input) {
  return {
    partyId: asString(input.partyId),
    partyType: input.partyType,
    displayName: asString(input.displayName) || asString(input.partyId),
    memberPlayerIds: (input.memberPlayerIds || []).map(asString).filter(Boolean),
    groupId: asString(input.groupId),
    teamId: asString(input.teamId),
    scoreAvailable: !!input.scoreAvailable
  };
}

function isTeamStrokeGameMode(mode) {
  var m = asString(mode);
  return m === '最好成绩赛' || m === '最佳球位赛' || m === '四人两球赛';
}

function partyKindOfMatch(mode) {
  var m = asString(mode);
  if (strokeEntityValidator.isG6G7MatchPlayMode(mode) || strokeEntityValidator.isG8MatchPlayMode(mode)) {
    return 'side';
  }
  if (strokeEntityValidator.isG5MatchPlayMode(mode) || strokeEntityValidator.G1_MODES[m]) {
    return 'player';
  }
  if (strokeEntityValidator.G2_G3_MODES[m] || strokeEntityValidator.G4_MODES[m]) {
    return 'combination';
  }
  return 'player';
}

function membersInGroup(memberIds, occupiedSet) {
  if (!memberIds.length) return false;
  for (var i = 0; i < memberIds.length; i++) {
    if (!occupiedSet[memberIds[i]]) return false;
  }
  return true;
}

function filterScope(ctx, scope, groupId) {
  var gid = asString(groupId);
  if (scope !== 'group') {
    ctx.scope = 'match';
    ctx.groupId = '';
    return ctx;
  }
  ctx.scope = 'group';
  ctx.groupId = gid;
  var occupied = {};
  (ctx.players || []).forEach(function (p) {
    if (p && p.groupId === gid && p.playerId) occupied[p.playerId] = true;
  });
  ctx.players = (ctx.players || []).filter(function (p) {
    return p && p.groupId === gid;
  });
  ctx.scoreParties = (ctx.scoreParties || []).filter(function (party) {
    return party && party.groupId === gid && membersInGroup(party.memberPlayerIds, occupied);
  });
  var nextScores = {};
  var nextPlayerScores = {};
  ctx.scoreParties.forEach(function (party) {
    if (ctx.officialScoresByPartyId[party.partyId]) {
      nextScores[party.partyId] = ctx.officialScoresByPartyId[party.partyId];
    }
    if (party.partyType === 'player' && ctx.officialScoresByPlayerId[party.partyId]) {
      nextPlayerScores[party.partyId] = ctx.officialScoresByPlayerId[party.partyId];
    }
  });
  ctx.officialScoresByPartyId = nextScores;
  ctx.officialScoresByPlayerId = nextPlayerScores;
  return ctx;
}

function attachHoles(ctx, party, scoreArr) {
  if (!ctx.holeContextReady) {
    party.scoreAvailable = false;
    return;
  }
  var mapped = holesFromScoreArray(scoreArr, ctx.holeOrder);
  party.scoreAvailable = mapped.filled;
  if (mapped.filled) {
    ctx.officialScoresByPartyId[party.partyId] = { holes: mapped.holes };
    if (party.partyType === 'player') {
      ctx.officialScoresByPlayerId[party.partyId] = { holes: mapped.holes };
    }
  }
}

function collectCompositionMembers(snap, group, teamId) {
  var map = (snap && snap.groupCompositionMap) || {};
  var gid = asString(group && group.groupId);
  var comp = (gid && map[gid]) || (group && group.composition) || (snap && snap.composition) || null;
  var teams = (comp && Array.isArray(comp.teams) ? comp.teams : []) || [];
  var hit = null;
  teams.forEach(function (t) {
    if (asString(t && t.teamId) === asString(teamId)) hit = t;
  });
  var members = hit && (hit.members || hit.players);
  if (!Array.isArray(members)) return [];
  return members
    .map(function (m) {
      return asString(m && (m.playerId || m.userId || m.id));
    })
    .filter(Boolean);
}

function matchStatusFromGroups(groups, source, scoreData) {
  var completed = 0;
  var live = 0;
  (groups || []).forEach(function (g) {
    var st = matchStatus.getMatchStatus(g, { source: source, scoreData: scoreData });
    if (st.isCompleted) completed += 1;
    else if (st.isLive) live += 1;
  });
  if (groups && groups.length && completed === groups.length) return 'COMPLETED';
  if (live) return 'LIVE';
  return 'UPCOMING';
}

function listGameGroups(snap) {
  if (!snap) return [];
  if (Array.isArray(snap.groups) && snap.groups.length) return snap.groups;
  return [];
}

function buildFromGameHostSnapshot(snap) {
  var matchId = asString(snap.matchId);
  if (!matchId) {
    return emptyContext({ allowBigPot: !!snap.allowBigPot, scope: snap.scope || 'match' });
  }
  var hole = resolveOfficialHoleContext(snap.courseContext || {});
  var ctx = emptyContext({
    matchId: matchId,
    scope: snap.scope === 'group' ? 'group' : 'match',
    currentUserId: asString(snap.currentUserId),
    revision: asString(snap.revisionSource || '0'),
    holeContextReady: hole.holeContextReady,
    holeOrder: hole.holeOrder,
    pars: hole.pars,
    allowBigPot: !!snap.allowBigPot
  });
  var groups = listGameGroups(snap);
  ctx.matchStatus = asString(snap.matchStatus) || matchStatusFromGroups(groups, 'game');
  var useCombo = isTeamStrokeGameMode(snap.gameMode);
  ctx.scoreKind = useCombo ? 'combination' : 'player';
  groups.forEach(function (group, gi) {
    var gid = asString(group.groupId) || matchId + '-g' + (gi + 1);
    var slots = Array.isArray(group.playersSlots) ? group.playersSlots : [];
    slots.forEach(function (slot) {
      if (!slot) return;
      var pid = asString(slot.playerId || slot.userId);
      if (!pid) return;
      ctx.players.push(playerView(pid, slot.name, slot.avatar, gid, ''));
    });
    if (useCombo) {
      var entities = Array.isArray(group.teamScoresByEntity) ? group.teamScoresByEntity : [];
      entities.forEach(function (rec, idx) {
        if (!rec) return;
        var partyId = asString(rec.teamId || rec.entityId);
        if (!partyId) partyId = gid + '__entity__' + (idx + 1);
        var members = collectCompositionMembers(snap, group, partyId);
        if (!members.length) return;
        var party = makeParty({
          partyId: partyId,
          partyType: 'combination',
          displayName: rec.name || '组合' + (idx + 1),
          memberPlayerIds: members,
          groupId: gid,
          teamId: asString(rec.teamId)
        });
        attachHoles(ctx, party, rec.scores);
        ctx.scoreParties.push(party);
      });
      return;
    }
    var byPlayer = group.scoresByPlayer && typeof group.scoresByPlayer === 'object' ? group.scoresByPlayer : {};
    slots.forEach(function (slot) {
      if (!slot) return;
      var pid = asString(slot.playerId || slot.userId);
      if (!pid) return;
      var rec = byPlayer[pid] || {};
      var party = makeParty({
        partyId: pid,
        partyType: 'player',
        displayName: slot.name || pid,
        memberPlayerIds: [pid],
        groupId: gid,
        teamId: ''
      });
      attachHoles(ctx, party, rec.scores);
      ctx.scoreParties.push(party);
    });
  });
  return jsonClone(filterScope(ctx, snap.scope || 'match', snap.groupId));
}

function teamNameById(snap, teamId) {
  var tid = asString(teamId);
  if (!tid) return '';
  var list = Array.isArray(snap && snap.teamGroups) ? snap.teamGroups : [];
  for (var i = 0; i < list.length; i++) {
    var g = list[i] || {};
    if (asString(g.id) === tid || asString(g.sourceTeamId) === tid) {
      return asString(g.name || g.sourceTeamName);
    }
  }
  return tid;
}

function occupiedSetOfGroup(group) {
  var set = {};
  (Array.isArray(group && group.players) ? group.players : []).forEach(function (p) {
    var id = asString(playerManage.resolveUserId(p) || (p && (p.userId || p.playerId)));
    if (id) set[id] = p;
  });
  return set;
}

function buildFromTeamMatchHostSnapshot(snap) {
  var matchId = asString(snap.matchId);
  if (!matchId) {
    return emptyContext({ allowBigPot: !!snap.allowBigPot, scope: snap.scope || 'match' });
  }
  var hole = resolveOfficialHoleContext(snap.courseContext || {});
  var ctx = emptyContext({
    matchId: matchId,
    scope: snap.scope === 'group' ? 'group' : 'match',
    seriesId: asString(snap.seriesId),
    roundId: asString(snap.roundId),
    currentUserId: asString(snap.currentUserId),
    revision: asString(snap.revisionSource || '0'),
    holeContextReady: hole.holeContextReady,
    holeOrder: hole.holeOrder,
    pars: hole.pars,
    allowBigPot: !!snap.allowBigPot,
    scoreKind: partyKindOfMatch(snap.gameMode)
  });
  var groups = Array.isArray(snap.groups) ? snap.groups : [];
  var scoreData = snap.scoreData && typeof snap.scoreData === 'object' ? snap.scoreData : {};
  ctx.matchStatus = asString(snap.matchStatus) || matchStatusFromGroups(groups, 'match', scoreData);
  var teamMap = {};
  try {
    teamMap = strokeEntityValidator.buildRegisterTeamMap(snap) || {};
  } catch (eMap) {
    teamMap = {};
  }
  var kind = ctx.scoreKind;
  var entitiesByGroup = snap.scoreEntities && typeof snap.scoreEntities === 'object' ? snap.scoreEntities : {};

  groups.forEach(function (group) {
    var gid = asString(group && group.groupId);
    if (!gid) return;
    var occupied = occupiedSetOfGroup(group);
    Object.keys(occupied).forEach(function (pid) {
      var p = occupied[pid];
      ctx.players.push(
        playerView(
          pid,
          playerManage.resolveMatchNickname(p) || pid,
          p && p.avatar,
          gid,
          asString(teamMap[pid])
        )
      );
    });
    var bucket = scoreData[gid] && typeof scoreData[gid] === 'object' ? scoreData[gid] : {};
    if (kind === 'combination') {
      var entities = Array.isArray(entitiesByGroup[gid]) ? entitiesByGroup[gid] : [];
      var byEntity = {};
      (Array.isArray(bucket.teamScoresByEntity) ? bucket.teamScoresByEntity : []).forEach(function (rec) {
        var key = asString((rec && (rec.teamId || rec.entityId)) || '');
        if (key) byEntity[key] = rec;
      });
      entities.forEach(function (entity, idx) {
        var partyId = asString(entity && entity.entityId);
        if (!partyId) return;
        var members = (entity.members || [])
          .map(function (m) {
            if (m == null) return '';
            if (typeof m === 'string' || typeof m === 'number') return asString(m);
            return asString(m.userId || m.playerId || m.id);
          })
          .filter(Boolean);
        if (!members.length) return;
        var rec = byEntity[partyId] || {};
        var party = makeParty({
          partyId: partyId,
          partyType: 'combination',
          displayName: entity.name || teamNameById(snap, entity.teamGroupId) || '组合' + (idx + 1),
          memberPlayerIds: members,
          groupId: gid,
          teamId: asString(entity.teamGroupId)
        });
        attachHoles(ctx, party, rec.scores);
        ctx.scoreParties.push(party);
      });
      return;
    }
    if (kind === 'side') {
      var scoresBySide = bucket.scoresBySide && typeof bucket.scoresBySide === 'object' ? bucket.scoresBySide : {};
      var teamIds = [];
      Object.keys(occupied).forEach(function (pid) {
        var tid = asString(teamMap[pid]);
        if (tid && teamIds.indexOf(tid) < 0) teamIds.push(tid);
      });
      if (!teamIds.length) {
        Object.keys(scoresBySide).forEach(function (k) {
          if (k && teamIds.indexOf(k) < 0) teamIds.push(k);
        });
      }
      teamIds.forEach(function (tid, sideIndex) {
        var rec = scoresBySide[tid] || (sideIndex === 0 ? scoresBySide.A : scoresBySide.B) || {};
        var partyId = asString((rec && rec.sideId) || tid);
        var members = Object.keys(occupied).filter(function (pid) {
          return asString(teamMap[pid]) === tid;
        });
        if (!members.length && (tid === 'A' || tid === 'B' || !Object.keys(teamMap).length)) {
          var filledIds = Object.keys(occupied);
          members =
            sideIndex === 0
              ? filledIds.slice(0, Math.ceil(filledIds.length / 2))
              : filledIds.slice(Math.ceil(filledIds.length / 2));
        }
        if (!members.length) return;
        var party = makeParty({
          partyId: partyId,
          partyType: 'side',
          displayName: teamNameById(snap, tid) || '第' + (sideIndex + 1) + '方',
          memberPlayerIds: members,
          groupId: gid,
          teamId: tid
        });
        attachHoles(ctx, party, rec.scores);
        ctx.scoreParties.push(party);
      });
      return;
    }
    var scoresByPlayer = bucket.scoresByPlayer && typeof bucket.scoresByPlayer === 'object' ? bucket.scoresByPlayer : {};
    Object.keys(occupied).forEach(function (pid) {
      var p = occupied[pid];
      var rec = scoresByPlayer[pid] || {};
      var party = makeParty({
        partyId: pid,
        partyType: 'player',
        displayName: playerManage.resolveMatchNickname(p) || pid,
        memberPlayerIds: [pid],
        groupId: gid,
        teamId: asString(teamMap[pid])
      });
      attachHoles(ctx, party, rec.scores);
      ctx.scoreParties.push(party);
    });
  });
  return jsonClone(filterScope(ctx, snap.scope || 'match', snap.groupId));
}

function buildFromHostSnapshot(snapshot) {
  var snap;
  try {
    snap = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? jsonClone(snapshot) : {};
  } catch (eClone) {
    return emptyContext();
  }
  if (asString(snap.source) === 'teamMatch') {
    return buildFromTeamMatchHostSnapshot(snap);
  }
  return buildFromGameHostSnapshot(snap);
}

function hostSnapshotFromGameObject(game, options) {
  var opts = options || {};
  var g = game && typeof game === 'object' ? game : {};
  var groups =
    Array.isArray(g.groups) && g.groups.length
      ? g.groups
      : [
          {
            groupId: (g.gameId || 'legacy') + '-g1',
            name: '第1组',
            playersSlots: g.playersSlots || [],
            scoresByPlayer: g.scoresByPlayer || {},
            teamScoresByEntity: g.teamScoresByEntity || []
          }
        ];
  if (Array.isArray(g.groups) && g.groups.length) {
    groups = g.groups;
  } else if (!g.playersSlots && !g.scoresByPlayer && !g.teamScoresByEntity) {
    groups = [];
  }
  return {
    source: 'gameStore',
    matchId: asString(opts.matchId || g.gameId),
    groupId: asString(opts.groupId),
    scope: opts.scope === 'group' ? 'group' : 'match',
    seriesId: '',
    roundId: '',
    currentUserId: asString(opts.currentUserId),
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
    groups: groups,
    scoreData: {},
    scoreEntities: {},
    teamGroups: [],
    registerInfo: { users: [] },
    groupCompositionMap: g.groupCompositionMap || {},
    composition: g.composition || null
  };
}

function hostSnapshotFromTeamMatchObject(match, options) {
  var opts = options || {};
  var m = match && typeof match === 'object' ? match : {};
  return {
    source: 'teamMatch',
    matchId: asString(m.matchId),
    groupId: asString(opts.groupId),
    scope: opts.scope === 'group' ? 'group' : 'match',
    seriesId: asString(m.seriesContext && m.seriesContext.seriesId),
    roundId: asString(m.seriesContext && m.seriesContext.roundId),
    currentUserId: asString(opts.currentUserId),
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
  };
}

function buildFromGameSnapshot(game, options) {
  var opts = options || {};
  if (!game || !asString(game.gameId || opts.matchId)) {
    return emptyContext({ allowBigPot: !!opts.allowBigPot, scope: opts.scope || 'match' });
  }
  return buildFromHostSnapshot(hostSnapshotFromGameObject(game, opts));
}

function buildFromTeamMatchSnapshot(match, options) {
  var opts = options || {};
  if (!match || !asString(match.matchId)) {
    return emptyContext({ allowBigPot: !!opts.allowBigPot, scope: opts.scope || 'match' });
  }
  return buildFromHostSnapshot(hostSnapshotFromTeamMatchObject(match, opts));
}

function ordinalPartyLabel(index, party) {
  if (party && asString(party.displayName)) return party.displayName;
  return '第' + (index + 1) + '方';
}

function scoresToEngineFormat(officialScoresByPartyId, holeOrder) {
  var out = {};
  (holeOrder || []).forEach(function (label) {
    out[label] = {};
  });
  Object.keys(officialScoresByPartyId || {}).forEach(function (partyId) {
    var holes = officialScoresByPartyId[partyId] && officialScoresByPartyId[partyId].holes;
    if (!holes) return;
    Object.keys(holes).forEach(function (label) {
      if (!out[label]) out[label] = {};
      var score = holes[label] && holes[label].score;
      if (score != null) out[label][partyId] = score;
    });
  });
  return out;
}

function validatePartySelection(host, selectedPartyIds, ruleId) {
  var cap = capOf(ruleId);
  if (!cap) {
    return { ok: false, reason: 'unknown_rule', message: '未知玩法' };
  }
  var ids = Array.isArray(selectedPartyIds) ? selectedPartyIds.map(asString).filter(Boolean) : [];
  if (ids.length !== cap.requiredPartyCount) {
    return {
      ok: false,
      reason: 'party_count',
      message: '该玩法需要' + cap.requiredPartyCount + '方参与，当前仅选择' + ids.length + '方。'
    };
  }
  if (!host || !host.holeContextReady) {
    return { ok: false, reason: 'score_context_unavailable', message: '成绩上下文暂不可用' };
  }
  var byId = {};
  (host.scoreParties || []).forEach(function (p) {
    if (p && p.partyId) byId[p.partyId] = p;
  });
  var i;
  for (i = 0; i < ids.length; i++) {
    var party = byId[ids[i]];
    var label = ordinalPartyLabel(i, party);
    if (!party) {
      return {
        ok: false,
        reason: 'missing_score',
        message: label + '暂无可用成绩，暂时无法计算。'
      };
    }
    if (cap.requiresIndividualScores && party.partyType !== 'player') {
      return {
        ok: false,
        reason: 'no_individual_scores',
        message: '当前赛制没有个人成绩，无法计算该游戏'
      };
    }
    var rec = host.officialScoresByPartyId && host.officialScoresByPartyId[party.partyId];
    var filled = false;
    if (rec && rec.holes) {
      Object.keys(rec.holes).forEach(function (h) {
        if (isFilledScore(rec.holes[h] && rec.holes[h].score)) filled = true;
      });
    }
    if (!filled) {
      return {
        ok: false,
        reason: 'missing_score',
        message: label + '暂无可用成绩，暂时无法计算。'
      };
    }
  }
  return { ok: true, reason: '', message: '' };
}

module.exports = {
  RULE_CAPS: RULE_CAPS,
  jsonClone: jsonClone,
  emptyContext: emptyContext,
  capOf: capOf,
  listRuleCapabilities: listRuleCapabilities,
  resolveOfficialHoleContext: resolveOfficialHoleContext,
  buildFromHostSnapshot: buildFromHostSnapshot,
  buildFromGameSnapshot: buildFromGameSnapshot,
  buildFromTeamMatchSnapshot: buildFromTeamMatchSnapshot,
  validatePartySelection: validatePartySelection,
  scoresToEngineFormat: scoresToEngineFormat
};
