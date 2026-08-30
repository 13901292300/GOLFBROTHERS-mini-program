/**
 * Series LIVE 换人：跨轮归属证据 / 有效归属 / replaceOnly·replaceAndReaffiliate（纯函数）
 * - 不读写 storage
 * - 当前身份 = 成绩所属球员（纠正座位绑定，不保留错误 ID）
 * - 构建 B 时不得整座复制 A 的归属快照
 */

var seriesRoundVisualState = require('./seriesRoundVisualState.js');
var matchStatus = require('./matchStatus.js');
var teamMatchFinish = require('./teamMatchFinish.js');
var seriesFinishLock = require('./seriesFinishLock.js');

var AFFILIATION_KEYS = [
  'seriesParticipantId',
  'teamId',
  'divisionId',
  'matchTeamId',
  'affiliationId',
  'groupId',
  'matchTeamName',
  'groupName',
  'participantNameSnapshot',
  'participantShortNameSnapshot',
  'participantColorSnapshot',
  'shortNameSnapshot',
  'colorSnapshot',
  'fromSeriesRoster'
];

var SCORE_IDENTITY_KEYS = [
  'scorePlayerId',
  'slotScorePlayerId',
  'scoreOwnerId',
  'hasHistoryScore',
  'entityId'
];

var MSG = {
  reaffiliateConfirmLead:
    '当前的参赛归属会导致本组不符合赛制要求。',
  reaffiliateConfirmAskPrefix: '是否将 ',
  reaffiliateConfirmAskMid: ' 在本系列赛中的参赛归属调整为「',
  reaffiliateConfirmAskSuffix: '」，并完成替换？',
  reaffiliateConfirmTail: '调整后，将在本系列赛中统一按该归属处理。',
  occupiedOtherSide:
    '该球员已在其他轮次代表「{from}」参赛，请先从相关未确认分组中移除后，再调整其参赛归属。',
  lockOtherSide:
    '该球员已代表「{from}」完成并确认成绩，本系列赛参赛归属已锁定，不能调整为「{to}」。',
  projectionIncomplete: '本轮比赛数据异常',
  affiliationConflict: '该球员在本系列赛中存在冲突的参赛归属，无法换人',
  targetLocked: '当前分组已结束，无法修改'
};

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function deepClone(v) {
  if (v == null) return v;
  return JSON.parse(JSON.stringify(v));
}

function playerIdOf(raw) {
  if (raw == null) return '';
  if (typeof raw === 'string' || typeof raw === 'number') return String(raw).trim();
  return asString(raw.userId) || asString(raw.playerId) || asString(raw.id);
}

function samePlayerId(a, b) {
  var x = asString(a);
  var y = asString(b);
  return !!(x && y && x === y);
}

function copyScoreIdentity(from, into) {
  var out = into && typeof into === 'object' ? into : {};
  var src = from && typeof from === 'object' ? from : {};
  var uid = playerIdOf(out);
  var oldId = playerIdOf(src);
  var tech = ['entityId', 'slotId', 'pairingId'];
  for (var i = 0; i < tech.length; i++) {
    var k = tech[i];
    if (src[k] != null && src[k] !== '') out[k] = src[k];
  }
  if (src.hasHistoryScore != null) out.hasHistoryScore = !!src.hasHistoryScore;
  if (Object.prototype.hasOwnProperty.call(src, 'holes')) {
    out.holes = Array.isArray(src.holes) ? src.holes.slice() : src.holes;
  }
  if (!uid) {
    out.scorePlayerId = '';
    return out;
  }
  out.scorePlayerId = uid;
  var slotScore = asString(src.slotScorePlayerId);
  var owner = asString(src.scoreOwnerId);
  out.slotScorePlayerId = slotScore && oldId && slotScore === oldId ? uid : slotScore || uid;
  out.scoreOwnerId = owner && oldId && owner === oldId ? uid : owner || uid;
  return out;
}

function stripAffiliation(target) {
  var out = target && typeof target === 'object' ? target : {};
  for (var i = 0; i < AFFILIATION_KEYS.length; i++) {
    if (Object.prototype.hasOwnProperty.call(out, AFFILIATION_KEYS[i])) {
      delete out[AFFILIATION_KEYS[i]];
    }
  }
  return out;
}

function readAffiliation(raw) {
  var p = raw && typeof raw === 'object' ? raw : {};
  return {
    seriesParticipantId: asString(p.seriesParticipantId),
    teamId: asString(p.teamId) || asString(p.sourceTeamId),
    divisionId: asString(p.divisionId),
    matchTeamId: asString(p.matchTeamId) || asString(p.affiliationId),
    affiliationId: asString(p.affiliationId) || asString(p.matchTeamId),
    groupId: asString(p.groupId)
  };
}

function affiliationKey(aff) {
  var a = aff || {};
  return (
    asString(a.seriesParticipantId) ||
    asString(a.matchTeamId) ||
    asString(a.affiliationId) ||
    asString(a.teamId) ||
    asString(a.divisionId) ||
    asString(a.groupId)
  );
}

function affiliationsEqual(a, b) {
  var ka = affiliationKey(a);
  var kb = affiliationKey(b);
  return !!(ka && kb && ka === kb);
}

function pickParticipant(series, affiliation) {
  var key = affiliationKey(affiliation);
  var parts = Array.isArray(series && series.participants) ? series.participants : [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i] || {};
    var sid = asString(p.seriesParticipantId);
    var divisionId = asString(p.divisionId);
    var sourceTeamId = asString(p.sourceTeamId);
    if (
      (sid && sid === key) ||
      (divisionId && divisionId === key) ||
      (sourceTeamId && sourceTeamId === key)
    ) {
      return p;
    }
  }
  return null;
}

function participantDisplayName(series, affiliation) {
  var p = pickParticipant(series, affiliation);
  if (!p) {
    var a = affiliation || {};
    return (
      asString(a.matchTeamName) ||
      asString(a.groupName) ||
      affiliationKey(a) ||
      '未知'
    );
  }
  return (
    asString(p.shortNameSnapshot) ||
    asString(p.nameSnapshot) ||
    asString(p.fullNameSnapshot) ||
    asString(p.seriesParticipantId) ||
    '未知'
  );
}

function rosterEntryForPlayer(series, playerId) {
  var pid = asString(playerId);
  var list = Array.isArray(series && series.roster) ? series.roster : [];
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    if (!e) continue;
    var st = asString(e.registrationStatus).toLowerCase();
    if (st && st !== 'registered') continue;
    var id = asString(e.playerId) || asString(e.userId);
    if (id && id === pid) return e;
  }
  return null;
}

function rosterAffiliation(series, playerId) {
  var e = rosterEntryForPlayer(series, playerId);
  if (!e) return null;
  var part = pickParticipant(series, { seriesParticipantId: asString(e.seriesParticipantId) });
  var mode = asString(series && series.hostMode) === 'team' ? 'division' : 'team';
  var teamGroupId = '';
  if (part) {
    teamGroupId =
      mode === 'division'
        ? asString(part.divisionId) || asString(part.seriesParticipantId)
        : asString(part.sourceTeamId) || asString(part.seriesParticipantId);
  }
  return {
    seriesParticipantId: asString(e.seriesParticipantId),
    matchTeamId: teamGroupId || asString(e.seriesParticipantId),
    affiliationId: teamGroupId || asString(e.seriesParticipantId),
    teamId: asString(part && part.sourceTeamId),
    divisionId: asString(part && part.divisionId),
    groupId: asString(e.seriesParticipantId)
  };
}

function isCancelledRound(round, match) {
  var visual = seriesRoundVisualState.resolveSeriesRoundVisualState(round, match);
  return !!(visual && visual.state === seriesRoundVisualState.STATE.cancelled);
}

function isMatchCompleted(match) {
  return teamMatchFinish.isMatchCompleted(match);
}

function isGroupFinished(group) {
  return matchStatus.isGroupConfirmedFinished(group && group.status);
}

function seatIdentity(seriesId, roundId, matchId, groupId, position) {
  return (
    asString(seriesId) +
    '|' +
    asString(roundId) +
    '|' +
    asString(matchId) +
    '|' +
    asString(groupId) +
    '|' +
    String(Number(position) || 0)
  );
}

function verifyStation(series, round, match, indexRow) {
  if (!match || typeof match !== 'object') {
    return { ok: false, reason: 'projection_incomplete', detail: 'match_missing' };
  }
  var ctx = match.seriesContext && typeof match.seriesContext === 'object' ? match.seriesContext : {};
  if (ctx.managed !== true) {
    return { ok: false, reason: 'projection_incomplete', detail: 'not_managed' };
  }
  var seriesId = asString(series && series.seriesId);
  var roundId = asString(round && round.roundId);
  var matchId = asString(match.matchId);
  if (!seriesId || asString(ctx.seriesId) !== seriesId) {
    return { ok: false, reason: 'projection_incomplete', detail: 'series_id_conflict' };
  }
  if (!roundId || asString(ctx.roundId) !== roundId) {
    return { ok: false, reason: 'projection_incomplete', detail: 'round_id_conflict' };
  }
  var token = asString(series && series.publishToken);
  if (token && asString(ctx.publishToken) && asString(ctx.publishToken) !== token) {
    return { ok: false, reason: 'projection_incomplete', detail: 'publish_token_conflict' };
  }
  if (asString(round.matchId) && asString(round.matchId) !== matchId) {
    return { ok: false, reason: 'projection_incomplete', detail: 'round_match_mismatch' };
  }
  if (indexRow && typeof indexRow === 'object') {
    if (asString(indexRow.seriesId) && asString(indexRow.seriesId) !== seriesId) {
      return { ok: false, reason: 'projection_incomplete', detail: 'index_series_conflict' };
    }
    if (asString(indexRow.roundId) && asString(indexRow.roundId) !== roundId) {
      return { ok: false, reason: 'projection_incomplete', detail: 'index_round_conflict' };
    }
    if (asString(indexRow.matchId) && asString(indexRow.matchId) !== matchId) {
      return { ok: false, reason: 'projection_incomplete', detail: 'index_match_conflict' };
    }
  }
  if (!Array.isArray(match.groups)) {
    return { ok: false, reason: 'projection_incomplete', detail: 'groups_unreadable' };
  }
  return { ok: true };
}

/**
 * 扫描本 Series 未取消且 station 校验通过的轮次，收集 B 的归属证据。
 * excludeSeat: { seriesId, roundId, matchId, groupId, position }
 */
function collectAffiliationEvidence(input) {
  var src = input && typeof input === 'object' ? input : {};
  var series = src.series;
  var playerId = asString(src.playerId);
  var exclude = src.excludeSeat || {};
  var excludeKey = seatIdentity(
    exclude.seriesId,
    exclude.roundId,
    exclude.matchId,
    exclude.groupId,
    exclude.position
  );
  var getMatchById = typeof src.getMatchById === 'function' ? src.getMatchById : function () {
    return null;
  };
  var getIndexByMatchId =
    typeof src.getIndexByMatchId === 'function' ? src.getIndexByMatchId : function () {
      return null;
    };
  var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
  var locked = [];
  var reserved = [];
  var seriesId = asString(series && series.seriesId);

  for (var i = 0; i < rounds.length; i++) {
    var round = rounds[i] || {};
    var roundId = asString(round.roundId);
    var matchId = asString(round.matchId);
    var match = matchId ? getMatchById(matchId) : null;
    if (isCancelledRound(round, match)) continue;
    if (!matchId || !match) {
      return { ok: false, reason: 'projection_incomplete', detail: 'match_missing', roundId: roundId };
    }
    var indexRow = getIndexByMatchId(matchId);
    var st = verifyStation(series, round, match, indexRow);
    if (!st.ok) return st;

    var groups = Array.isArray(match.groups) ? match.groups : [];
    var matchDone = isMatchCompleted(match);
    for (var g = 0; g < groups.length; g++) {
      var group = groups[g] || {};
      var groupId = asString(group.groupId);
      var groupDone = isGroupFinished(group);
      var players = Array.isArray(group.players) ? group.players : [];
      for (var p = 0; p < players.length; p++) {
        var seat = players[p] || {};
        var pos = Number(seat.position != null ? seat.position : seat.slotIndex) || p + 1;
        var key = seatIdentity(seriesId, roundId, matchId, groupId, pos);
        if (key === excludeKey) continue;
        if (!samePlayerId(playerIdOf(seat), playerId)) continue;
        var row = {
          playerId: playerId,
          roundId: roundId,
          matchId: matchId,
          groupId: groupId,
          position: pos,
          affiliation: readAffiliation(seat),
          affiliationKey: affiliationKey(readAffiliation(seat)),
          groupFinished: groupDone,
          matchCompleted: matchDone
        };
        if (groupDone || matchDone) locked.push(row);
        else reserved.push(row);
      }
    }
  }

  return { ok: true, locked: locked, reserved: reserved };
}

function uniqueAffiliationKeys(rows) {
  var seen = Object.create(null);
  var keys = [];
  var list = Array.isArray(rows) ? rows : [];
  for (var i = 0; i < list.length; i++) {
    var k = asString(list[i] && list[i].affiliationKey);
    if (!k || seen[k]) continue;
    seen[k] = true;
    keys.push(k);
  }
  return keys;
}

/**
 * 有效归属：confirmed_affiliation_lock → participation_reservation → Series roster
 */
function resolveEffectiveAffiliation(input) {
  var src = input && typeof input === 'object' ? input : {};
  var evidence = src.evidence;
  if (!evidence || evidence.ok === false) {
    return {
      ok: false,
      reason: (evidence && evidence.reason) || 'projection_incomplete'
    };
  }
  var lockKeys = uniqueAffiliationKeys(evidence.locked);
  if (lockKeys.length > 1) {
    return { ok: false, reason: 'affiliation_conflict', source: 'confirmed_affiliation_lock' };
  }
  var resKeys = uniqueAffiliationKeys(evidence.reserved);
  if (resKeys.length > 1) {
    return { ok: false, reason: 'affiliation_conflict', source: 'participation_reservation' };
  }
  if (lockKeys.length === 1) {
    return {
      ok: true,
      source: 'confirmed_affiliation_lock',
      constraint: 'confirmed_affiliation_lock',
      affiliation: evidence.locked[0].affiliation,
      affiliationKey: lockKeys[0],
      locked: evidence.locked,
      reserved: evidence.reserved
    };
  }
  if (resKeys.length === 1) {
    return {
      ok: true,
      source: 'participation_reservation',
      constraint: 'participation_reservation',
      affiliation: evidence.reserved[0].affiliation,
      affiliationKey: resKeys[0],
      locked: evidence.locked,
      reserved: evidence.reserved
    };
  }
  var rosterAff = src.rosterAffiliation || null;
  if (!rosterAff || !affiliationKey(rosterAff)) {
    return {
      ok: true,
      source: 'none',
      constraint: 'unlocked',
      affiliation: rosterAff,
      affiliationKey: '',
      locked: evidence.locked,
      reserved: evidence.reserved
    };
  }
  return {
    ok: true,
    source: 'roster',
    constraint: 'unlocked',
    affiliation: rosterAff,
    affiliationKey: affiliationKey(rosterAff),
    locked: evidence.locked,
    reserved: evidence.reserved
  };
}

function isAffiliationValidationReason(reason) {
  var r = asString(reason);
  if (!r) return false;
  return (
    r.indexOf('player_missing_team') >= 0 ||
    r.indexOf('illegal_split') >= 0 ||
    r.indexOf('cross_team') >= 0 ||
    r.indexOf('4_0_multi_team') >= 0 ||
    r.indexOf('2_2_team_size') >= 0 ||
    r.indexOf('too_many_teams') >= 0 ||
    r.indexOf('g5_illegal_split') >= 0 ||
    r.indexOf('g6g7_illegal_split') >= 0 ||
    r.indexOf('g8_illegal_split') >= 0 ||
    r === 'g2g3_invalid'
  );
}

function applyAffiliationToIdentity(identity, affiliation, series) {
  var next = identity && typeof identity === 'object' ? Object.assign({}, identity) : {};
  var aff = affiliation || {};
  var part = pickParticipant(series, aff);
  var sid = asString(aff.seriesParticipantId) || asString(part && part.seriesParticipantId);
  var teamGroupId =
    asString(aff.matchTeamId) ||
    asString(aff.affiliationId) ||
    (part
      ? asString(part.sourceTeamId) || asString(part.divisionId) || sid
      : '');
  var name = participantDisplayName(series, aff);
  var shortName = asString(part && part.shortNameSnapshot) || name;
  var color = asString(part && part.colorSnapshot);
  next.seriesParticipantId = sid;
  next.matchTeamId = teamGroupId;
  next.affiliationId = teamGroupId;
  next.groupId = sid || teamGroupId;
  next.matchTeamName = shortName;
  next.groupName = shortName;
  next.participantNameSnapshot = asString(part && part.nameSnapshot) || name;
  next.participantShortNameSnapshot = shortName;
  next.participantColorSnapshot = color;
  next.fromSeriesRoster = true;
  if (aff.teamId) next.teamId = aff.teamId;
  if (aff.divisionId) next.divisionId = aff.divisionId;
  return next;
}

function buildCurrentIdentity(playerId, display, affiliation, series) {
  var uid = asString(playerId);
  var d = display && typeof display === 'object' ? display : {};
  var base = {
    userId: uid,
    playerId: uid,
    id: uid,
    displayName: asString(d.displayName) || asString(d.playerNameSnapshot) || uid,
    avatar: asString(d.avatar) || asString(d.playerAvatarSnapshot),
    gender: asString(d.gender) || asString(d.genderSnapshot),
    tPosition: d.tPosition || d.tee || ''
  };
  return applyAffiliationToIdentity(base, affiliation, series);
}

function buildReplacedSeat(oldEntry, currentIdentity, position) {
  var ident = currentIdentity && typeof currentIdentity === 'object' ? currentIdentity : {};
  var uid = asString(ident.userId);
  var next = {
    position: Number(position) || 0,
    userId: uid,
    playerId: uid,
    id: uid,
    displayName: ident.displayName,
    avatar: ident.avatar,
    gender: ident.gender,
    tPosition: ident.tPosition,
    tee: ident.tPosition || ident.tee,
    seriesParticipantId: asString(ident.seriesParticipantId),
    matchTeamId: asString(ident.matchTeamId),
    affiliationId: asString(ident.affiliationId),
    groupId: asString(ident.groupId),
    matchTeamName: asString(ident.matchTeamName),
    groupName: asString(ident.groupName),
    participantNameSnapshot: asString(ident.participantNameSnapshot),
    participantShortNameSnapshot: asString(ident.participantShortNameSnapshot),
    participantColorSnapshot: asString(ident.participantColorSnapshot),
    fromSeriesRoster: true
  };
  copyScoreIdentity(oldEntry, next);
  return next;
}

function findSeat(groups, groupId, position) {
  var gid = asString(groupId);
  var pos = Number(position) || 0;
  var list = Array.isArray(groups) ? groups : [];
  for (var i = 0; i < list.length; i++) {
    var g = list[i];
    if (!g || asString(g.groupId) !== gid) continue;
    var players = Array.isArray(g.players) ? g.players : [];
    for (var j = 0; j < players.length; j++) {
      var p = players[j];
      var pp = Number(p && (p.position != null ? p.position : p.slotIndex)) || 0;
      if (pp === pos) return { group: g, player: p };
    }
  }
  return null;
}

function listReplacements(oldGroups, draftGroups) {
  var out = [];
  var drafts = Array.isArray(draftGroups) ? draftGroups : [];
  for (var i = 0; i < drafts.length; i++) {
    var dg = drafts[i] || {};
    var gid = asString(dg.groupId);
    var dps = Array.isArray(dg.players) ? dg.players : [];
    for (var j = 0; j < dps.length; j++) {
      var d = dps[j] || {};
      var pos = Number(d.position != null ? d.position : d.slotIndex) || j + 1;
      var nextId = playerIdOf(d);
      var found = findSeat(oldGroups, gid, pos);
      var oldId = found && found.player ? playerIdOf(found.player) : '';
      if (nextId && oldId && nextId !== oldId) {
        out.push({
          groupId: gid,
          position: pos,
          fromUserId: oldId,
          toUserId: nextId,
          oldEntry: found.player,
          draftEntry: d
        });
      }
    }
  }
  return out;
}

function assertTargetWritable(input) {
  var src = input && typeof input === 'object' ? input : {};
  var series = src.series;
  var match = src.match;
  var group = src.group;
  var life = asString(series && series.lifecycleStatus).toLowerCase();
  if (life === 'cancelled' || life === 'canceled' || life === 'archived') {
    return { ok: false, reason: 'target_locked', message: MSG.targetLocked, detail: 'series_lifecycle' };
  }
  var seriesLock = seriesFinishLock.assertSeriesWritable(series);
  if (!seriesLock.ok) {
    return { ok: false, reason: 'target_locked', message: seriesLock.message, detail: 'series_completed' };
  }
  if (isMatchCompleted(match)) {
    return { ok: false, reason: 'target_locked', message: teamMatchFinish.MATCH_FINISHED_TOAST, detail: 'match_completed' };
  }
  var visual = seriesRoundVisualState.resolveSeriesRoundVisualState(src.round, match);
  if (visual && visual.state === seriesRoundVisualState.STATE.completed) {
    return { ok: false, reason: 'target_locked', message: MSG.targetLocked, detail: 'round_locked' };
  }
  if (group && isGroupFinished(group)) {
    return { ok: false, reason: 'target_locked', message: MSG.targetLocked, detail: 'group_finished' };
  }
  var st = verifyStation(series, src.round || { roundId: src.roundId, matchId: match && match.matchId }, match, src.indexRow);
  if (!st.ok) return st;
  return { ok: true };
}

function formatOccupied(fromName) {
  return MSG.occupiedOtherSide.replace('{from}', fromName || '未知');
}

function formatLock(fromName, toName) {
  return MSG.lockOtherSide.replace('{from}', fromName || '未知').replace('{to}', toName || '未知');
}

function canAdjustToward(effective, targetAff, series) {
  var constraint = effective && effective.constraint;
  var targetKey = affiliationKey(targetAff);
  var currentKey = effective && effective.affiliationKey;
  var fromName = participantDisplayName(series, effective && effective.affiliation);
  var toName = participantDisplayName(series, targetAff);
  if (!effective || !effective.ok) {
    return { ok: false, reason: (effective && effective.reason) || 'projection_incomplete', message: MSG.projectionIncomplete };
  }
  if (effective.reason === 'affiliation_conflict' || constraint === 'affiliation_conflict') {
    return { ok: false, reason: 'affiliation_conflict', message: MSG.affiliationConflict };
  }
  if (constraint === 'unlocked' || !constraint) {
    return { ok: true, kind: 'unlocked' };
  }
  if (constraint === 'participation_reservation') {
    if (currentKey && targetKey && currentKey === targetKey) {
      return { ok: true, kind: 'reservation_same' };
    }
    return {
      ok: false,
      reason: 'participation_reservation',
      message: formatOccupied(fromName)
    };
  }
  if (constraint === 'confirmed_affiliation_lock') {
    if (currentKey && targetKey && currentKey === targetKey) {
      return { ok: true, kind: 'lock_same' };
    }
    return {
      ok: false,
      reason: 'confirmed_affiliation_lock',
      message: formatLock(fromName, toName)
    };
  }
  return { ok: true, kind: 'unlocked' };
}

function buildConfirmCopy(playerName, teamName) {
  var name = asString(playerName) || '该球员';
  var team = asString(teamName) || '目标方';
  return {
    title: '调整参赛归属',
    content:
      '球员 ' +
      name +
      ' 当前的参赛归属会导致本组不符合赛制要求。\n\n是否将 ' +
      name +
      ' 在本系列赛中的参赛归属调整为「' +
      team +
      '」，并完成替换？\n\n调整后，' +
      name +
      ' 在本系列赛中将统一按' +
      team +
      '球员处理。',
    confirmText: '确认调整并替换',
    cancelText: '取消'
  };
}

/**
 * 决策：replaceOnly → 直接保存；仅当失败原因为归属且方案二合法且无锁冲突时才 confirm。
 */
function decideLiveReplace(input) {
  var src = input && typeof input === 'object' ? input : {};
  var series = src.series;
  var match = src.match;
  var oldGroups = Array.isArray(src.oldGroups) ? src.oldGroups : (match && match.groups) || [];
  var draftGroups = Array.isArray(src.draftGroups) ? src.draftGroups : [];
  var replacement = src.replacement;
  if (!replacement) {
    var listed = listReplacements(oldGroups, draftGroups);
    replacement = listed[0] || null;
  }
  if (!replacement) {
    return { ok: true, action: 'noop', replacements: [] };
  }

  var writable = assertTargetWritable({
    series: series,
    match: match,
    round: src.round,
    roundId: src.roundId,
    group: findSeat(oldGroups, replacement.groupId, replacement.position) &&
      findSeat(oldGroups, replacement.groupId, replacement.position).group,
    indexRow: src.indexRow
  });
  if (!writable.ok) return writable;

  var bId = asString(replacement.toUserId);
  var evidence = collectAffiliationEvidence({
    series: series,
    playerId: bId,
    excludeSeat: {
      seriesId: asString(series && series.seriesId),
      roundId: asString(src.roundId) || asString(match && match.seriesContext && match.seriesContext.roundId),
      matchId: asString(match && match.matchId),
      groupId: replacement.groupId,
      position: replacement.position
    },
    getMatchById: src.getMatchById,
    getIndexByMatchId: src.getIndexByMatchId
  });
  if (!evidence.ok) {
    return {
      ok: false,
      reason: evidence.reason || 'projection_incomplete',
      message: MSG.projectionIncomplete,
      writes: false
    };
  }

  var rosterAff = rosterAffiliation(series, bId);
  var effective = resolveEffectiveAffiliation({
    evidence: evidence,
    rosterAffiliation: rosterAff
  });
  if (!effective.ok) {
    return {
      ok: false,
      reason: effective.reason,
      message:
        effective.reason === 'affiliation_conflict'
          ? MSG.affiliationConflict
          : MSG.projectionIncomplete,
      writes: false
    };
  }

  var rosterEntry = rosterEntryForPlayer(series, bId);
  var display = Object.assign({}, rosterEntry || {}, replacement.draftEntry || {});
  var bAff = effective.affiliation || rosterAff;
  var identityOnly = buildCurrentIdentity(bId, display, bAff, series);
  var seatOnly = buildReplacedSeat(replacement.oldEntry, identityOnly, replacement.position);

  var validateMatch = typeof src.validateMatch === 'function' ? src.validateMatch : function () {
    return { ok: true };
  };

  var onlyResult = validateMatch({
    kind: 'replaceOnly',
    seat: seatOnly,
    replacement: replacement,
    affiliation: bAff
  });
  if (onlyResult && onlyResult.ok) {
    return {
      ok: true,
      action: 'replaceOnly',
      needsConfirm: false,
      writesRoster: false,
      seat: seatOnly,
      currentIdentity: identityOnly,
      scoreIdentity: copyScoreIdentity(replacement.oldEntry, Object.assign({}, identityOnly)),
      replacement: replacement,
      constraint: effective.constraint
    };
  }

  var onlyReason = (onlyResult && (onlyResult.reason || onlyResult.message)) || 'invalid';
  if (!isAffiliationValidationReason(onlyReason) && onlyResult && onlyResult.affiliationRelated !== true) {
    return {
      ok: false,
      action: 'reject',
      reason: onlyReason,
      message: (onlyResult && onlyResult.message) || onlyReason,
      needsConfirm: false,
      writes: false
    };
  }

  var aAff = readAffiliation(replacement.oldEntry);
  var adjust = canAdjustToward(effective, aAff, series);
  if (!adjust.ok) {
    return {
      ok: false,
      action: 'reject',
      reason: adjust.reason,
      message: adjust.message,
      needsConfirm: false,
      writes: false
    };
  }

  var identityRe = buildCurrentIdentity(bId, display, aAff, series);
  var seatRe = buildReplacedSeat(replacement.oldEntry, identityRe, replacement.position);
  var reResult = validateMatch({
    kind: 'replaceAndReaffiliate',
    seat: seatRe,
    replacement: replacement,
    affiliation: aAff
  });
  if (!reResult || !reResult.ok) {
    return {
      ok: false,
      action: 'reject',
      reason: (reResult && reResult.reason) || onlyReason,
      message: (reResult && reResult.message) || onlyReason,
      needsConfirm: false,
      writes: false
    };
  }

  var playerName =
    asString(display.displayName) ||
    asString(display.playerNameSnapshot) ||
    bId;
  var teamName = participantDisplayName(series, aAff);
  return {
    ok: true,
    action: 'replaceAndReaffiliate',
    needsConfirm: adjust.kind === 'unlocked',
    writesRoster: true,
    confirm: buildConfirmCopy(playerName, teamName),
    seat: seatRe,
    currentIdentity: identityRe,
    scoreIdentity: copyScoreIdentity(replacement.oldEntry, Object.assign({}, identityRe)),
    replacement: replacement,
    targetAffiliation: aAff,
    constraint: effective.constraint,
    adjustKind: adjust.kind
  };
}

function patchGroupsWithSeat(groups, groupId, position, seat) {
  var gid = asString(groupId);
  var pos = Number(position) || 0;
  return (Array.isArray(groups) ? groups : []).map(function (g) {
    if (!g || asString(g.groupId) !== gid) return g;
    var players = (Array.isArray(g.players) ? g.players : []).map(function (p) {
      var pp = Number(p && (p.position != null ? p.position : p.slotIndex)) || 0;
      if (pp !== pos) return p;
      return Object.assign({}, seat, { position: pos });
    });
    return Object.assign({}, g, { players: players });
  });
}

function applyRosterAffiliationPatch(series, playerId, seriesParticipantId) {
  var next = deepClone(series || {});
  var pid = asString(playerId);
  var spid = asString(seriesParticipantId);
  var list = Array.isArray(next.roster) ? next.roster : [];
  next.roster = list.map(function (e) {
    if (!e) return e;
    var id = asString(e.playerId) || asString(e.userId);
    var st = asString(e.registrationStatus).toLowerCase();
    if (st && st !== 'registered') return e;
    if (id !== pid) return e;
    return Object.assign({}, e, { seriesParticipantId: spid, updatedAt: e.updatedAt });
  });
  return next;
}

function readbackIdentity(match, groupId, position, expectedUserId, expectedScorePlayerId) {
  var found = findSeat(match && match.groups, groupId, position);
  if (!found || !found.player) {
    return { ok: false, reason: 'identity_not_persisted' };
  }
  var p = found.player;
  if (playerIdOf(p) !== asString(expectedUserId)) {
    return { ok: false, reason: 'identity_not_persisted' };
  }
  if (asString(p.playerId) && asString(p.playerId) !== asString(expectedUserId)) {
    return { ok: false, reason: 'identity_not_persisted' };
  }
  if (
    expectedScorePlayerId &&
    asString(p.scorePlayerId) &&
    asString(p.scorePlayerId) !== asString(expectedScorePlayerId)
  ) {
    return { ok: false, reason: 'identity_not_persisted', detail: 'score_identity_changed' };
  }
  return { ok: true, player: p };
}

function readbackRoster(series, playerId, seriesParticipantId) {
  var e = rosterEntryForPlayer(series, playerId);
  if (!e) return { ok: false, reason: 'affiliation_not_persisted' };
  if (asString(e.seriesParticipantId) !== asString(seriesParticipantId)) {
    return { ok: false, reason: 'affiliation_not_persisted' };
  }
  return { ok: true };
}

function readbackStation(match, expected) {
  var ctx = match && match.seriesContext ? match.seriesContext : {};
  if (asString(ctx.seriesId) !== asString(expected.seriesId)) {
    return { ok: false, reason: 'save_failed', detail: 'seriesId' };
  }
  if (asString(ctx.roundId) !== asString(expected.roundId)) {
    return { ok: false, reason: 'save_failed', detail: 'roundId' };
  }
  if (asString(match && match.matchId) !== asString(expected.matchId)) {
    return { ok: false, reason: 'save_failed', detail: 'matchId' };
  }
  if (
    asString(expected.publishToken) &&
    asString(ctx.publishToken) !== asString(expected.publishToken)
  ) {
    return { ok: false, reason: 'save_failed', detail: 'publishToken' };
  }
  return { ok: true };
}

function overlayRegisterUser(registerInfo, identity) {
  var info =
    registerInfo && typeof registerInfo === 'object'
      ? {
          totalCount: registerInfo.totalCount,
          users: Array.isArray(registerInfo.users) ? registerInfo.users.slice() : []
        }
      : { totalCount: 0, users: [] };
  var uid = asString(identity && identity.userId);
  if (!uid) return info;
  var patched = false;
  info.users = info.users.map(function (u) {
    if (asString(u && u.userId) !== uid) return u;
    patched = true;
    return Object.assign({}, u, {
      userId: uid,
      matchTeamId: asString(identity.matchTeamId) || asString(u.matchTeamId),
      groupId: asString(identity.groupId) || asString(u.groupId),
      seriesParticipantId:
        asString(identity.seriesParticipantId) || asString(u.seriesParticipantId),
      matchTeamName: asString(identity.matchTeamName) || asString(u.matchTeamName),
      displayName: asString(identity.displayName) || asString(u.displayName)
    });
  });
  if (!patched) {
    info.users.push({
      userId: uid,
      matchTeamId: asString(identity.matchTeamId),
      groupId: asString(identity.groupId),
      seriesParticipantId: asString(identity.seriesParticipantId),
      matchTeamName: asString(identity.matchTeamName),
      displayName: asString(identity.displayName)
    });
  }
  info.totalCount = info.users.length;
  return info;
}

function scoresUnchanged(beforeScoreData, afterScoreData) {
  try {
    return JSON.stringify(beforeScoreData || {}) === JSON.stringify(afterScoreData || {});
  } catch (e) {
    return false;
  }
}

function scoreRecordPayload(rec) {
  if (!rec || typeof rec !== 'object') return '';
  try {
    return JSON.stringify({
      scores: rec.scores,
      putts: rec.putts,
      fairways: rec.fairways,
      penalties: rec.penalties,
      sands: rec.sands
    });
  } catch (e) {
    return '';
  }
}

function seatScoreValuesUnchanged(beforeMatch, afterMatch) {
  var beforeGroups = Array.isArray(beforeMatch && beforeMatch.groups) ? beforeMatch.groups : [];
  var afterGroups = Array.isArray(afterMatch && afterMatch.groups) ? afterMatch.groups : [];
  var beforeData =
    beforeMatch && beforeMatch.scoreData && typeof beforeMatch.scoreData === 'object'
      ? beforeMatch.scoreData
      : {};
  var afterData =
    afterMatch && afterMatch.scoreData && typeof afterMatch.scoreData === 'object'
      ? afterMatch.scoreData
      : {};
  for (var i = 0; i < beforeGroups.length; i++) {
    var bg = beforeGroups[i];
    var gid = asString(bg && bg.groupId);
    var ag = null;
    for (var j = 0; j < afterGroups.length; j++) {
      if (asString(afterGroups[j] && afterGroups[j].groupId) === gid) {
        ag = afterGroups[j];
        break;
      }
    }
    var bPlayers = Array.isArray(bg && bg.players) ? bg.players : [];
    var aPlayers = Array.isArray(ag && ag.players) ? ag.players : [];
    var bBy = (beforeData[gid] && beforeData[gid].scoresByPlayer) || {};
    var aBy = (afterData[gid] && afterData[gid].scoresByPlayer) || {};
    for (var p = 0; p < bPlayers.length; p++) {
      var bp = bPlayers[p];
      var pos = Number(bp && (bp.position != null ? bp.position : bp.slotIndex)) || 0;
      var ap = null;
      for (var q = 0; q < aPlayers.length; q++) {
        var pp = Number(aPlayers[q] && (aPlayers[q].position != null ? aPlayers[q].position : aPlayers[q].slotIndex)) || 0;
        if (pp === pos) {
          ap = aPlayers[q];
          break;
        }
      }
      var oldKey = asString((bp && (bp.scorePlayerId || bp.userId || bp.playerId)) || '');
      var newKey = asString((ap && (ap.userId || ap.playerId || ap.scorePlayerId)) || '');
      if (!oldKey || !bBy[oldKey]) continue;
      if (!newKey) continue;
      if (scoreRecordPayload(bBy[oldKey]) !== scoreRecordPayload(aBy[newKey])) return false;
    }
  }
  return true;
}

function rollbackSeries(stores, previousSeries) {
  if (!previousSeries || !stores || typeof stores.upsertSeriesChecked !== 'function') return;
  try {
    stores.upsertSeriesChecked(previousSeries, previousSeries.registrationRevision);
  } catch (eRoll) {
    /* ignore */
  }
}

function rollbackMatch(stores, previousMatch) {
  if (!previousMatch || !stores || typeof stores.saveMatch !== 'function') return;
  try {
    stores.saveMatch(previousMatch);
  } catch (eRoll) {
    /* ignore */
  }
}

/**
 * 安全写入：先完整 plan，再写 roster（仅方案二）与当前 station。失败回滚，不提示成功。
 */
function commitLiveReplace(input) {
  var src = input && typeof input === 'object' ? input : {};
  var plan = src.plan;
  var stores = src.stores && typeof src.stores === 'object' ? src.stores : {};
  if (!plan || plan.ok !== true) {
    return {
      ok: false,
      reason: (plan && plan.reason) || 'save_failed',
      message: (plan && plan.message) || '',
      writes: false
    };
  }
  if (plan.action === 'noop') {
    return { ok: true, action: 'noop', writes: false };
  }
  if (plan.needsConfirm && src.confirmed !== true) {
    return {
      ok: false,
      reason: 'needs_confirm',
      confirm: plan.confirm,
      writes: false
    };
  }
  var match = src.match;
  var series = src.series;
  var replacement = plan.replacement;
  var prevSeries = deepClone(series);
  var prevMatch = deepClone(match);
  var wroteRoster = false;
  var wroteMatch = false;
  var expected = {
    seriesId: asString(match && match.seriesContext && match.seriesContext.seriesId),
    roundId: asString(match && match.seriesContext && match.seriesContext.roundId),
    matchId: asString(match && match.matchId),
    publishToken: asString(match && match.seriesContext && match.seriesContext.publishToken)
  };

  try {
    if (plan.writesRoster) {
      var nextSeries = applyRosterAffiliationPatch(
        series,
        replacement.toUserId,
        asString(plan.targetAffiliation && plan.targetAffiliation.seriesParticipantId)
      );
      if (typeof stores.upsertSeriesChecked !== 'function') {
        return { ok: false, reason: 'save_failed', writes: false };
      }
      var wr = stores.upsertSeriesChecked(
        nextSeries,
        nextSeries.registrationRevision
      );
      if (!wr || wr.ok !== true) {
        return { ok: false, reason: 'save_failed', writes: false };
      }
      wroteRoster = true;
    }

    var nextMatch = deepClone(match);
    nextMatch.groups = patchGroupsWithSeat(
      nextMatch.groups,
      replacement.groupId,
      replacement.position,
      plan.seat
    );
    var tournamentGroupDraft = require('./tournament/tournamentGroupDraft.js');
    nextMatch.scoreData = tournamentGroupDraft.rebindLiveScoreDataToSeatPlayers(
      match && match.groups,
      nextMatch.groups,
      nextMatch.scoreData
    );
    nextMatch.registerInfo = overlayRegisterUser(
      nextMatch.registerInfo,
      plan.currentIdentity
    );
    if (typeof src.syncStrokeEntities === 'function') {
      nextMatch.scoreEntities = src.syncStrokeEntities(nextMatch);
    }
    if (typeof stores.saveMatch !== 'function') {
      if (wroteRoster) rollbackSeries(stores, prevSeries);
      return { ok: false, reason: 'save_failed', writes: false };
    }
    var saved = stores.saveMatch(nextMatch);
    if (saved && saved.ok === false) {
      if (wroteRoster) rollbackSeries(stores, prevSeries);
      return { ok: false, reason: 'save_failed', writes: false };
    }
    wroteMatch = true;

    var readMatch =
      typeof stores.getMatchById === 'function'
        ? stores.getMatchById(expected.matchId)
        : nextMatch;
    if (!readMatch) {
      rollbackMatch(stores, prevMatch);
      if (wroteRoster) rollbackSeries(stores, prevSeries);
      return { ok: false, reason: 'save_failed', writes: false };
    }
    var ident = readbackIdentity(
      readMatch,
      replacement.groupId,
      replacement.position,
      replacement.toUserId,
      replacement.toUserId
    );
    if (!ident.ok) {
      rollbackMatch(stores, prevMatch);
      if (wroteRoster) rollbackSeries(stores, prevSeries);
      return { ok: false, reason: ident.reason || 'identity_not_persisted', writes: false };
    }
    var st = readbackStation(readMatch, expected);
    if (!st.ok) {
      rollbackMatch(stores, prevMatch);
      if (wroteRoster) rollbackSeries(stores, prevSeries);
      return { ok: false, reason: 'save_failed', writes: false };
    }
    if (!seatScoreValuesUnchanged(prevMatch, readMatch)) {
      rollbackMatch(stores, prevMatch);
      if (wroteRoster) rollbackSeries(stores, prevSeries);
      return { ok: false, reason: 'save_failed', detail: 'score_mutated', writes: false };
    }
    if (!scoresUnchanged(prevMatch.teamScoresByEntity, readMatch.teamScoresByEntity)) {
      rollbackMatch(stores, prevMatch);
      if (wroteRoster) rollbackSeries(stores, prevSeries);
      return { ok: false, reason: 'save_failed', detail: 'team_score_mutated', writes: false };
    }
    if (plan.writesRoster) {
      var readSeries =
        typeof stores.getSeriesById === 'function'
          ? stores.getSeriesById(asString(series && series.seriesId))
          : nextSeries;
      var aff = readbackRoster(
        readSeries,
        replacement.toUserId,
        asString(plan.targetAffiliation && plan.targetAffiliation.seriesParticipantId)
      );
      if (!aff.ok) {
        rollbackMatch(stores, prevMatch);
        rollbackSeries(stores, prevSeries);
        return { ok: false, reason: 'affiliation_not_persisted', writes: false };
      }
    }
    return {
      ok: true,
      action: plan.action,
      match: readMatch,
      writes: true,
      wroteRoster: wroteRoster
    };
  } catch (eCommit) {
    if (wroteMatch) rollbackMatch(stores, prevMatch);
    if (wroteRoster) rollbackSeries(stores, prevSeries);
    return { ok: false, reason: 'save_failed', writes: false };
  }
}

module.exports = {
  MSG: MSG,
  AFFILIATION_KEYS: AFFILIATION_KEYS,
  SCORE_IDENTITY_KEYS: SCORE_IDENTITY_KEYS,
  asString: asString,
  deepClone: deepClone,
  playerIdOf: playerIdOf,
  copyScoreIdentity: copyScoreIdentity,
  stripAffiliation: stripAffiliation,
  readAffiliation: readAffiliation,
  affiliationKey: affiliationKey,
  affiliationsEqual: affiliationsEqual,
  participantDisplayName: participantDisplayName,
  rosterAffiliation: rosterAffiliation,
  rosterEntryForPlayer: rosterEntryForPlayer,
  collectAffiliationEvidence: collectAffiliationEvidence,
  resolveEffectiveAffiliation: resolveEffectiveAffiliation,
  isAffiliationValidationReason: isAffiliationValidationReason,
  buildCurrentIdentity: buildCurrentIdentity,
  buildReplacedSeat: buildReplacedSeat,
  listReplacements: listReplacements,
  assertTargetWritable: assertTargetWritable,
  canAdjustToward: canAdjustToward,
  buildConfirmCopy: buildConfirmCopy,
  decideLiveReplace: decideLiveReplace,
  patchGroupsWithSeat: patchGroupsWithSeat,
  applyRosterAffiliationPatch: applyRosterAffiliationPatch,
  readbackIdentity: readbackIdentity,
  readbackRoster: readbackRoster,
  readbackStation: readbackStation,
  verifyStation: verifyStation,
  seatIdentity: seatIdentity,
  overlayRegisterUser: overlayRegisterUser,
  scoresUnchanged: scoresUnchanged,
  commitLiveReplace: commitLiveReplace
};
