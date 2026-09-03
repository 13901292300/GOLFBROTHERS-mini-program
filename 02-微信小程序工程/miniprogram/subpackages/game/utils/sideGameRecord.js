/**
 * SideGame 记录规范化与校验。与未来云端字段对齐。
 */
var catalog = require('./catalog.js');
var hostMod = require('./gameHostContext.js');
var comboDisplayName = require('../../../utils/comboDisplayName.js');

var VISIBILITY = { public: true, event: true, group: true };
var STATUS = { active: true, settled: true, deleted: true };

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function jsonClone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function nowMs() {
  return Date.now();
}

function capOf(ruleId) {
  return hostMod.capOf(ruleId);
}

function buildRuleSnapshot(ruleId) {
  var rule = catalog.findRule(ruleId);
  var cap = capOf(ruleId);
  if (!rule || !cap) return null;
  return jsonClone({
    catalogId: rule.id,
    ruleId: rule.id,
    name: rule.name,
    requiredPartyCount: cap.requiredPartyCount,
    requiresIndividualScores: !!cap.requiresIndividualScores,
    scoreFields: cap.scoreFields ? cap.scoreFields.slice() : ['holes.score']
  });
}

function normalizeRewardMode(raw) {
  var s = String(raw == null ? '' : raw).trim().toLowerCase();
  if (s === 'add' || s === 'additive') return 'add';
  if (s === 'mul' || s === 'multiply' || s === 'multi' || s === 'multiplication') return 'mul';
  if (s === 'none' || s === 'off' || s === 'false') return 'none';
  return '';
}

function hasGameplaySignal(snap) {
  var s = snap && typeof snap === 'object' ? snap : {};
  if (normalizeRewardMode(s.reward)) return true;
  if (Array.isArray(s.addRows) && s.addRows.length) return true;
  if (Array.isArray(s.mulRows) && s.mulRows.length) return true;
  if (Array.isArray(s.comboMulRows) && s.comboMulRows.length) return true;
  if (s.pkBetter != null || s.pkWorse != null || s.pkTotal != null) return true;
  if (s.addPre != null) return true;
  return false;
}

function unwrapGameplaySnapshot(raw) {
  if (raw == null || typeof raw !== 'object') return raw == null ? {} : raw;
  var cur = jsonClone(raw);
  var hops = 0;
  while (hops < 4 && cur && typeof cur === 'object' && cur.ruleSnapshot && typeof cur.ruleSnapshot === 'object') {
    var nested = jsonClone(cur.ruleSnapshot);
    var outer = jsonClone(cur);
    delete outer.ruleSnapshot;
    var nestedMode = normalizeRewardMode(nested.reward);
    var outerMode = normalizeRewardMode(outer.reward);
    if (nestedMode || hasGameplaySignal(nested)) {
      var merged = Object.assign({}, outer, nested);
      if (nestedMode) merged.reward = nestedMode;
      else if (outerMode) merged.reward = outerMode;
      return merged;
    }
    if (outerMode || hasGameplaySignal(outer)) {
      if (outerMode) outer.reward = outerMode;
      return outer;
    }
    cur = nested;
    hops += 1;
  }
  if (cur && typeof cur === 'object') {
    var mode = normalizeRewardMode(cur.reward);
    if (mode) cur.reward = mode;
  }
  return cur && typeof cur === 'object' ? cur : {};
}

function stripLibraryMeta(play) {
  var out = jsonClone(play || {});
  delete out.id;
  delete out.revision;
  delete out.updatedAt;
  delete out.ruleSnapshot;
  return out;
}

function draftFromLibraryRow(row, fallbackCatalogId) {
  var play = unwrapGameplaySnapshot(row || {});
  var mode = normalizeRewardMode(play.reward);
  return Object.assign({}, play, {
    id: row && row.id ? row.id : play.id,
    name: row && row.name != null && row.name !== '' ? row.name : play.name,
    players: row && row.players ? row.players : play.players,
    catalogId:
      (row && (row.catalogId || row.ruleId)) || play.catalogId || play.ruleId || fallbackCatalogId || '',
    revision: row && row.revision,
    reward: mode || 'none'
  });
}

function hasExplicitMatch2Reward(snap) {
  var mode = normalizeRewardMode(snap && snap.reward);
  return mode === 'mul' || mode === 'none';
}

function hasExplicitGameplayReward(snap) {
  var mode = normalizeRewardMode(snap && snap.reward);
  return mode === 'mul' || mode === 'none' || mode === 'add';
}

function mergeRuleSnapshot(capability, gameplay) {
  var cap = capability && typeof capability === 'object' ? jsonClone(capability) : {};
  var capPlay = unwrapGameplaySnapshot(cap);
  var play = unwrapGameplaySnapshot(gameplay);
  var out = Object.assign({}, cap, play);
  if (!hasExplicitGameplayReward(out) && hasExplicitGameplayReward(capPlay)) {
    out = Object.assign({}, out, capPlay);
  }
  if (cap.requiredPartyCount != null) out.requiredPartyCount = cap.requiredPartyCount;
  if (cap.requiresIndividualScores != null) {
    out.requiresIndividualScores = cap.requiresIndividualScores;
  }
  if (Array.isArray(cap.scoreFields)) out.scoreFields = cap.scoreFields.slice();
  if (!out.catalogId) out.catalogId = cap.catalogId || play.catalogId || capPlay.catalogId || '';
  if (!out.ruleId) out.ruleId = cap.ruleId || out.catalogId;
  return out;
}

function pickFirstUsableGameplay(list) {
  var i;
  for (i = 0; i < (list || []).length; i++) {
    var play = unwrapGameplaySnapshot(list[i]);
    if (hasExplicitGameplayReward(play)) return play;
  }
  return {};
}

function collectMatch2GameplayCandidates(game, row) {
  game = game || {};
  row = row || {};
  var inst = (row.config && row.config.instance) || (game.config && game.config.instance) || {};
  var payload = row.payload || game.payload || {};
  var rs = row.resultSnapshot || game.holeResults || {};
  var cfg = row.config || {};
  return [
    game.ruleSnapshot,
    inst.ruleSnapshot,
    inst.reward || inst.mulRows || inst.addRows ? inst : null,
    row.ruleSnapshot,
    cfg.ruleSnapshot,
    payload.ruleSnapshot,
    payload.config && payload.config.instance && payload.config.instance.ruleSnapshot,
    rs.ruleSnapshot,
    rs.rule,
    game.sessionRuleSnapshot,
    game.hostRuleSnapshot
  ];
}

function pickMulRow(snap, id) {
  var rows = (snap && snap.mulRows) || [];
  var i;
  for (i = 0; i < rows.length; i++) {
    if (rows[i] && String(rows[i].id) === String(id)) return rows[i].value;
  }
  return null;
}

function pickAddRow(snap, id) {
  var rows = (snap && snap.addRows) || [];
  var i;
  for (i = 0; i < rows.length; i++) {
    if (rows[i] && String(rows[i].id) === String(id)) return rows[i].value;
  }
  return null;
}

function describeMatch2MulSources(input) {
  input = input || {};
  var game = input.game || {};
  var row = input.record || {};
  var inst = (row.config && row.config.instance) || (game.config && game.config.instance) || {};
  var lib = input.libraryRecord || null;
  function pack(name, raw) {
    var unwrapped = unwrapGameplaySnapshot(raw);
    return {
      name: name,
      present: !!(raw && typeof raw === 'object' && Object.keys(raw).length),
      nestedEnvelope: !!(raw && raw.ruleSnapshot && raw.reward == null),
      reward: unwrapped && unwrapped.reward,
      m2: pickMulRow(unwrapped, 'm2'),
      m1: pickMulRow(unwrapped, 'm1'),
      hio: pickMulRow(unwrapped, 'hio'),
      par: pickMulRow(unwrapped, 'par'),
      p1: pickMulRow(unwrapped, 'p1'),
      ge2: pickMulRow(unwrapped, 'ge2'),
      usable: hasExplicitMatch2Reward(unwrapped)
    };
  }
  var payload = row.payload || {};
  var sources = [
    pack('instance.ruleSnapshot', game.ruleSnapshot || inst.ruleSnapshot),
    pack('record.ruleSnapshot', row.ruleSnapshot),
    pack('record.config.instance.ruleSnapshot', inst.ruleSnapshot),
    pack('record.config', row.config),
    pack('record.payload', payload.ruleSnapshot || payload),
    pack('rankMark.instance.ruleSnapshot', inst.ruleSnapshot),
    pack('resultSnapshot.ruleSnapshot', row.resultSnapshot && row.resultSnapshot.ruleSnapshot),
    pack('session.gameConfig', input.sessionConfig || game.sessionRuleSnapshot),
    pack('library.ruleSnapshot', lib && (lib.ruleSnapshot || lib))
  ];
  var chosen = null;
  var i;
  for (i = 0; i < sources.length; i++) {
    if (sources[i].usable) {
      chosen = sources[i];
      break;
    }
  }
  var lostAt = 'none';
  if (sources[0].nestedEnvelope && sources[0].usable) lostAt = 'library_envelope_used_as_instance_snapshot';
  else if (!sources[0].usable && sources[1].usable) lostAt = 'recordToGame_or_top_level_snapshot';
  else if (!chosen) lostAt = 'never_persisted';
  return {
    gameId: asString(game.id || row.sideGameId),
    catalogId: (game.catalogId || row.ruleId || ''),
    ruleLibId: game.ruleLibId || inst.ruleLibId || '',
    ruleLibRevision: game.ruleLibRevision != null ? game.ruleLibRevision : inst.ruleLibRevision,
    libraryRevision: lib && lib.revision,
    sources: sources,
    chosen: chosen,
    lostAt: lostAt
  };
}

function describeStroke2RewardSources(input) {
  var base = describeMatch2MulSources(input);
  var game = (input && input.game) || {};
  var row = (input && input.record) || {};
  var inst = (row.config && row.config.instance) || (game.config && game.config.instance) || {};
  var lib = input && input.libraryRecord;
  function pack(name, raw) {
    var unwrapped = unwrapGameplaySnapshot(raw);
    return {
      name: name,
      present: !!(raw && typeof raw === 'object' && Object.keys(raw).length),
      nestedEnvelope: !!(raw && raw.ruleSnapshot && raw.reward == null),
      reward: unwrapped && unwrapped.reward,
      m2: pickMulRow(unwrapped, 'm2'),
      m1: pickMulRow(unwrapped, 'm1'),
      addM1: pickAddRow(unwrapped, 'm1'),
      addM2: pickAddRow(unwrapped, 'm2'),
      usable: hasExplicitGameplayReward(unwrapped)
    };
  }
  var payload = row.payload || {};
  var sources = [
    pack('instance.ruleSnapshot', game.ruleSnapshot || inst.ruleSnapshot),
    pack('record.ruleSnapshot', row.ruleSnapshot),
    pack('record.config.instance.ruleSnapshot', inst.ruleSnapshot),
    pack('record.config', row.config),
    pack('record.payload', payload.ruleSnapshot || payload),
    pack('resultSnapshot.ruleSnapshot', row.resultSnapshot && row.resultSnapshot.ruleSnapshot),
    pack('library.ruleSnapshot', lib && (lib.ruleSnapshot || lib))
  ];
  var chosen = null;
  var i;
  for (i = 0; i < sources.length; i++) {
    if (sources[i].usable) {
      chosen = sources[i];
      break;
    }
  }
  var lostAt = 'none';
  if (sources[0].nestedEnvelope && sources[0].usable) lostAt = 'library_envelope_used_as_instance_snapshot';
  else if (!sources[0].usable && sources[1].usable) lostAt = 'recordToGame_or_top_level_snapshot';
  else if (!chosen) lostAt = 'never_persisted';
  return Object.assign({}, base, {
    catalogId: game.catalogId || row.ruleId || 'stroke-2',
    sources: sources,
    chosen: chosen,
    lostAt: lostAt
  });
}

function normalizeParty(raw) {
  var p = raw && typeof raw === 'object' ? raw : {};
  var members = (p.memberPlayerIds || p.playerIds || []).map(asString).filter(Boolean);
  var partyId = asString(p.partyId);
  if (!members.length && partyId) members = [partyId];
  var type = asString(p.partyType);
  if (type !== 'player' && type !== 'combination' && type !== 'side') {
    type = members.length > 1 ? 'combination' : 'player';
  } else if (type === 'player' && members.length > 1) {
    type = 'combination';
  }
  return {
    partyId: partyId,
    partyType: type,
    displayName: asString(p.displayName) || partyId,
    memberPlayerIds: members
  };
}

function memberSetKey(ids) {
  return (ids || [])
    .map(asString)
    .filter(Boolean)
    .sort()
    .join('\u0001');
}

function listCompositionTeams(host) {
  var out = [];
  var map = (host && host.groupCompositionMap) || {};
  Object.keys(map).forEach(function (gid) {
    var comp = map[gid];
    var teams = (comp && Array.isArray(comp.teams) ? comp.teams : []) || [];
    teams.forEach(function (t, i) {
      if (!t) return;
      var partyId = asString(t.teamId || t.partyId || t.id);
      if (!partyId) partyId = asString(gid) + '__team__' + (i + 1);
      var members = (t.members || t.players || [])
        .map(function (m) {
          return asString(m && (m.playerId || m.userId || m.id));
        })
        .filter(Boolean);
      if (!members.length) return;
      out.push({
        partyId: partyId,
        partyType: members.length > 1 ? 'combination' : 'player',
        displayName: asString(t.name || t.displayName),
        memberPlayerIds: members,
        groupId: asString(gid)
      });
    });
  });
  if ((!out.length) && host && host.composition && Array.isArray(host.composition.teams)) {
    (host.composition.teams || []).forEach(function (t, i) {
      if (!t) return;
      var partyId = asString(t.teamId || t.partyId || t.id) || 'team-' + (i + 1);
      var members = (t.members || t.players || [])
        .map(function (m) {
          return asString(m && (m.playerId || m.userId || m.id));
        })
        .filter(Boolean);
      if (!members.length) return;
      out.push({
        partyId: partyId,
        partyType: members.length > 1 ? 'combination' : 'player',
        displayName: asString(t.name || t.displayName),
        memberPlayerIds: members,
        groupId: asString(host.groupId)
      });
    });
  }
  return out;
}

function hostPlayerIdSet(host) {
  var set = {};
  (host && host.players ? host.players : []).forEach(function (p) {
    var id = asString(p && (p.playerId || p.id || p.userId));
    if (id) set[id] = true;
  });
  (host && host.scoreParties ? host.scoreParties : []).forEach(function (p) {
    ((p && p.memberPlayerIds) || []).forEach(function (mid) {
      var id = asString(mid);
      if (id) set[id] = true;
    });
  });
  return set;
}

/**
 * 解析参赛主体：接受 person / combo party，不要求 leftId 存在于 playersById。
 * 若成员集合与记分页 scoreParty 一致，优先对齐到成绩实体 partyId（便于结算取分）。
 */
function resolveSubjectParty(host, raw) {
  var draft = normalizeParty(raw);
  if (!draft.partyId && !(draft.memberPlayerIds && draft.memberPlayerIds.length)) {
    return { ok: false, reason: 'invalid_party', party: null, remappedFrom: '' };
  }
  var scoreById = {};
  var scoreByMembers = {};
  (host && host.scoreParties ? host.scoreParties : []).forEach(function (p) {
    if (!p || !p.partyId) return;
    var np = normalizeParty(p);
    scoreById[np.partyId] = Object.assign({}, np, { groupId: asString(p.groupId) });
    var mk = memberSetKey(np.memberPlayerIds);
    if (mk) scoreByMembers[mk] = scoreById[np.partyId];
  });
  var remappedFrom = '';
  if (scoreById[draft.partyId]) {
    return { ok: true, reason: '', party: scoreById[draft.partyId], remappedFrom: '' };
  }
  var mkDraft = memberSetKey(draft.memberPlayerIds);
  if (mkDraft && scoreByMembers[mkDraft]) {
    remappedFrom = draft.partyId;
    return {
      ok: true,
      reason: '',
      party: scoreByMembers[mkDraft],
      remappedFrom: remappedFrom
    };
  }
  var compTeams = listCompositionTeams(host);
  var compHit = null;
  var i;
  for (i = 0; i < compTeams.length; i++) {
    if (compTeams[i].partyId === draft.partyId) {
      compHit = compTeams[i];
      break;
    }
  }
  if (!compHit && mkDraft) {
    for (i = 0; i < compTeams.length; i++) {
      if (memberSetKey(compTeams[i].memberPlayerIds) === mkDraft) {
        compHit = compTeams[i];
        break;
      }
    }
  }
  if (compHit) {
    var aligned = scoreByMembers[memberSetKey(compHit.memberPlayerIds)];
    if (aligned) {
      return {
        ok: true,
        reason: '',
        party: aligned,
        remappedFrom: draft.partyId !== aligned.partyId ? draft.partyId : ''
      };
    }
    return {
      ok: true,
      reason: '',
      party: normalizeParty({
        partyId: compHit.partyId,
        partyType: compHit.partyType,
        memberPlayerIds: compHit.memberPlayerIds,
        displayName: compHit.displayName
      }),
      remappedFrom: draft.partyId !== compHit.partyId ? draft.partyId : ''
    };
  }
  var players = hostPlayerIdSet(host);
  if (draft.memberPlayerIds.length) {
    var allMembersOk = draft.memberPlayerIds.every(function (id) {
      return !!players[id];
    });
    if (allMembersOk) {
      return {
        ok: true,
        reason: '',
        party: normalizeParty({
          partyId: draft.partyId || draft.memberPlayerIds[0],
          partyType: draft.memberPlayerIds.length > 1 ? 'combination' : 'player',
          memberPlayerIds: draft.memberPlayerIds
        }),
        remappedFrom: ''
      };
    }
    return { ok: false, reason: 'party_members_invalid', party: null, remappedFrom: '' };
  }
  if (players[draft.partyId]) {
    return {
      ok: true,
      reason: '',
      party: normalizeParty({
        partyId: draft.partyId,
        partyType: 'player',
        memberPlayerIds: [draft.partyId]
      }),
      remappedFrom: ''
    };
  }
  return { ok: false, reason: 'party_not_in_host', party: null, remappedFrom: '' };
}

function emptyConfig(patch) {
  var out = {
    allowBigPot: false,
    windOn: false
  };
  if (patch && typeof patch === 'object') {
    Object.keys(patch).forEach(function (k) {
      out[k] = patch[k];
    });
  }
  return out;
}

function normalizeRecord(raw) {
  var r = raw && typeof raw === 'object' ? raw : {};
  var vis = asString(r.visibility);
  if (!VISIBILITY[vis]) vis = 'group';
  var status = asString(r.status);
  if (!STATUS[status]) status = 'active';
  var scope = asString(r.scope) === 'match' ? 'match' : 'group';
  var parties = Array.isArray(r.participantParties) ? r.participantParties.map(normalizeParty) : [];
  var config = emptyConfig(r.config && typeof r.config === 'object' ? r.config : {});
  if (scope !== 'group') config.allowBigPot = false;
  if (scope === 'match' && vis === 'group') vis = 'event';
  var rev = Number(r.revision);
  if (!isFinite(rev) || rev < 1) rev = 1;
  var resultRev = Number(r.resultRevision);
  if (!isFinite(resultRev) || resultRev < 0) resultRev = 0;
  return {
    sideGameId: asString(r.sideGameId),
    matchId: asString(r.matchId),
    groupId: scope === 'group' ? asString(r.groupId) : '',
    scope: scope,
    seriesId: asString(r.seriesId),
    roundId: asString(r.roundId),
    ruleId: asString(r.ruleId),
    ruleSnapshot: r.ruleSnapshot && typeof r.ruleSnapshot === 'object' ? jsonClone(r.ruleSnapshot) : null,
    title: asString(r.title),
    participantParties: parties,
    config: config,
    visibility: vis,
    status: status,
    createdBy: asString(r.createdBy),
    createdAt: r.createdAt != null ? Number(r.createdAt) || 0 : 0,
    updatedBy: asString(r.updatedBy),
    updatedAt: r.updatedAt != null ? Number(r.updatedAt) || 0 : 0,
    revision: rev,
    hostRevisionAtSettle: asString(r.hostRevisionAtSettle),
    resultSnapshot: r.resultSnapshot && typeof r.resultSnapshot === 'object' ? jsonClone(r.resultSnapshot) : null,
    resultRevision: resultRev,
    idempotencyKey: asString(r.idempotencyKey),
    deletedAt: r.deletedAt != null ? Number(r.deletedAt) || 0 : 0
  };
}

function validateCreateInput(input, host) {
  var rec = normalizeRecord(input || {});
  if (!rec.matchId) return { ok: false, reason: 'no_match_context' };
  if (!rec.ruleId || !rec.ruleSnapshot) return { ok: false, reason: 'unknown_rule' };
  if (catalog.isUnavailableRule(rec.ruleId) || catalog.isUnavailableRule(rec.ruleSnapshot && rec.ruleSnapshot.catalogId)) {
    return { ok: false, reason: 'rule_unavailable' };
  }
  if (!VISIBILITY[rec.visibility]) return { ok: false, reason: 'invalid_visibility' };
  if (rec.scope === 'group' && !rec.groupId) return { ok: false, reason: 'missing_group' };
  if (rec.scope === 'match' && rec.visibility === 'group') {
    return { ok: false, reason: 'invalid_visibility' };
  }
  var wantPot = !!(input && input.config && input.config.allowBigPot);
  if (wantPot && (rec.scope !== 'group' || !(host && host.allowBigPot))) {
    return { ok: false, reason: 'big_pot_not_allowed' };
  }
  var cap = capOf(rec.ruleId);
  if (!cap) return { ok: false, reason: 'unknown_rule' };
  var n = rec.participantParties.length;
  var minN = cap.requiredPartyCount;
  if (minN >= 5) {
    if (n < minN) return { ok: false, reason: 'party_count', fieldPath: 'participantParties.length' };
  } else if (minN === 3) {
    if (n !== 3) return { ok: false, reason: 'party_count', fieldPath: 'participantParties.length' };
  } else if (minN === 4) {
    if (n !== 4) return { ok: false, reason: 'party_count', fieldPath: 'participantParties.length' };
  } else if (n < 2) {
    return { ok: false, reason: 'party_count', fieldPath: 'participantParties.length' };
  }

  var resolved = [];
  var idMap = {};
  var i;
  for (i = 0; i < rec.participantParties.length; i++) {
    var party = rec.participantParties[i];
    if (!party.partyId && !(party.memberPlayerIds && party.memberPlayerIds.length)) {
      return {
        ok: false,
        reason: 'invalid_party',
        fieldPath: 'participantParties[' + i + '].partyId'
      };
    }
    if (host) {
      var hit = resolveSubjectParty(host, party);
      if (!hit.ok) {
        return {
          ok: false,
          reason: hit.reason || 'party_not_in_host',
          fieldPath: 'participantParties[' + i + ']',
          partyId: party.partyId
        };
      }
      var live = hit.party;
      if (
        rec.scope === 'group' &&
        asString(live.groupId) &&
        asString(rec.groupId) &&
        asString(live.groupId) !== asString(rec.groupId)
      ) {
        return {
          ok: false,
          reason: 'party_not_in_group',
          fieldPath: 'participantParties[' + i + '].groupId',
          partyId: live.partyId
        };
      }
      if (!live.memberPlayerIds || !live.memberPlayerIds.length) {
        return {
          ok: false,
          reason: 'party_members_invalid',
          fieldPath: 'participantParties[' + i + '].memberPlayerIds',
          partyId: live.partyId
        };
      }
      if (hit.remappedFrom) idMap[hit.remappedFrom] = live.partyId;
      if (party.partyId && party.partyId !== live.partyId) idMap[party.partyId] = live.partyId;
      resolved.push(live);
    } else {
      resolved.push(party);
    }
  }
  rec.participantParties = resolved;

  // 实例内 parties/matchups/pairings：若 partyId 已对齐成绩实体，同步改写
  if (host && Object.keys(idMap).length && rec.config && rec.config.instance) {
    rec.config.instance = remapIdentityMapInValue(rec.config.instance, idMap);
  }

  return { ok: true, record: rec, idMap: idMap };
}

function remapIdentityMapInValue(value, idMap) {
  if (!idMap || !Object.keys(idMap).length) return value;
  if (value == null) return value;
  if (typeof value === 'string') {
    return idMap[value] || value;
  }
  if (Array.isArray(value)) {
    return value.map(function (item) {
      return remapIdentityMapInValue(item, idMap);
    });
  }
  if (typeof value === 'object') {
    var out = {};
    Object.keys(value).forEach(function (key) {
      var nextKey = idMap[key] || key;
      out[nextKey] = remapIdentityMapInValue(value[key], idMap);
    });
    return out;
  }
  return value;
}

function remapIdentityInValue(value, fromId, toId) {
  if (value == null) return value;
  if (typeof value === 'string') {
    return value === fromId ? toId : value;
  }
  if (Array.isArray(value)) {
    return value.map(function (item) {
      return remapIdentityInValue(item, fromId, toId);
    });
  }
  if (typeof value === 'object') {
    var out = {};
    Object.keys(value).forEach(function (key) {
      var nextKey = key === fromId ? toId : key;
      out[nextKey] = remapIdentityInValue(value[key], fromId, toId);
    });
    return out;
  }
  return value;
}

function recordTouchesPlayerId(record, fromId) {
  var rec = normalizeRecord(record);
  var from = asString(fromId);
  if (!from) return false;
  var i;
  for (i = 0; i < rec.participantParties.length; i++) {
    var p = rec.participantParties[i];
    if (p.partyType === 'player' && p.partyId === from) return true;
    if ((p.memberPlayerIds || []).indexOf(from) >= 0) return true;
  }
  var blob = JSON.stringify({ config: rec.config, result: rec.resultSnapshot }) || '';
  return blob.indexOf('"' + from + '"') >= 0;
}

function isResultStale(record, host) {
  var rec = record;
  if (!rec || !rec.resultSnapshot) return false;
  var hostRev = asString(host && host.revision);
  if (!hostRev) return false;
  return hostRev !== asString(rec.hostRevisionAtSettle);
}

function stampPersonProfile(person, toId, profile) {
  if (!person || typeof person !== 'object') return person;
  var id = asString(person.playerId || person.id);
  var next = person;
  if (id === toId && profile) {
    next = Object.assign({}, person);
    if (profile.displayName || profile.name) {
      next.displayName = profile.displayName || profile.name;
      next.name = profile.displayName || profile.name;
    }
    if (profile.avatar != null) next.avatar = profile.avatar;
  }
  if (Array.isArray(next.members)) {
    next = Object.assign({}, next, {
      members: next.members.map(function (m) {
        return stampPersonProfile(m, toId, profile);
      })
    });
    if (
      next.useSubjectName ||
      next.subjectType === 'combo' ||
      next.partyType === 'combination' ||
      next.members.length > 1
    ) {
      comboDisplayName.applyComboDisplayNameToPerson(next);
    }
  }
  return next;
}

function stampPlayerProfile(record, toId, profile) {
  var rec = record;
  var to = asString(toId);
  if (!rec || !to || !profile) return rec;
  rec.participantParties = (rec.participantParties || []).map(function (p) {
    var next = Object.assign({}, p);
    if (next.partyType === 'player' && asString(next.partyId) === to) {
      next.displayName = profile.displayName || profile.name || next.displayName;
    } else if (
      next.partyType === 'combination' &&
      (next.memberPlayerIds || []).indexOf(to) >= 0
    ) {
      next.displayName = '';
    }
    return next;
  });
  if (rec.config && rec.config.instance) {
    var inst = rec.config.instance;
    if (Array.isArray(inst.players)) {
      inst.players = inst.players.map(function (p) {
        return stampPersonProfile(p, to, profile);
      });
    }
    if (Array.isArray(inst.parties)) {
      inst.parties = inst.parties.map(function (p) {
        return stampPersonProfile(p, to, profile);
      });
    }
  }
  return rec;
}

function remapRecordPlayerIds(record, idMap, profiles) {
  var rec = normalizeRecord(record);
  var map = {};
  Object.keys(idMap || {}).forEach(function (key) {
    var from = asString(key);
    var to = asString(idMap[key]);
    if (from && to && from !== to) map[from] = to;
  });
  if (!Object.keys(map).length) return rec;
  rec.participantParties = rec.participantParties.map(function (p) {
    var partyId = p.partyId;
    if (p.partyType === 'player' && map[partyId]) partyId = map[partyId];
    return {
      partyId: partyId,
      partyType: p.partyType,
      displayName: p.displayName,
      memberPlayerIds: (p.memberPlayerIds || []).map(function (id) {
        return map[id] || id;
      })
    };
  });
  rec.config = remapIdentityMapInValue(rec.config, map);
  rec.resultSnapshot = remapIdentityMapInValue(rec.resultSnapshot, map);
  rec.scope = record.scope;
  rec.groupId = record.groupId;
  rec.hostRevisionAtSettle = '';
  Object.keys(map).forEach(function (from) {
    var to = map[from];
    rec = stampPlayerProfile(rec, to, (profiles && profiles[to]) || null);
  });
  refreshComboNamesDeep(rec.resultSnapshot);
  refreshComboNamesDeep(rec.config);
  return rec;
}

function remapRecordPlayerId(record, fromId, toId, profile) {
  var map = {};
  map[asString(fromId)] = asString(toId);
  var profiles = {};
  var to = asString(toId);
  if (to) profiles[to] = profile || null;
  return remapRecordPlayerIds(record, map, profiles);
}

function refreshComboNamesDeep(value) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach(refreshComboNamesDeep);
    return;
  }
  if (Array.isArray(value.members) && value.members.length > 1) {
    var looksLikePeople = value.members.some(function (m) {
      return m && typeof m === 'object' && (m.displayName || m.name || m.playerId);
    });
    if (looksLikePeople) comboDisplayName.applyComboDisplayNameToPerson(value);
  }
  Object.keys(value).forEach(function (key) {
    if (key === 'members') return;
    refreshComboNamesDeep(value[key]);
  });
}

function recordHasDuplicatePlayerIds(record) {
  var recn = normalizeRecord(record);
  var seen = {};
  var i;
  var j;
  for (i = 0; i < recn.participantParties.length; i++) {
    var p = recn.participantParties[i] || {};
    var ids = [];
    if (p.partyType === 'player') {
      ids.push(asString(p.partyId));
    } else {
      (p.memberPlayerIds || []).forEach(function (id) {
        ids.push(asString(id));
      });
    }
    for (j = 0; j < ids.length; j++) {
      var pid = ids[j];
      if (!pid) continue;
      if (seen[pid]) return true;
      seen[pid] = true;
    }
  }
  return false;
}

function isMatchParticipant(host, userId) {
  var uid = asString(userId);
  if (!uid || !host) return false;
  var list = host.players || [];
  var i;
  for (i = 0; i < list.length; i++) {
    if (asString(list[i] && list[i].playerId) === uid) return true;
  }
  return false;
}

function isGroupMember(host, groupId, userId) {
  var uid = asString(userId);
  var gid = asString(groupId);
  if (!uid || !gid || !host) return false;
  var list = host.players || [];
  var i;
  for (i = 0; i < list.length; i++) {
    var p = list[i];
    if (asString(p && p.playerId) === uid && asString(p.groupId) === gid) return true;
  }
  return false;
}

function viewerCanSee(record, query, host, viewerId) {
  var rec = record;
  if (!rec || rec.status === 'deleted') return false;
  if (asString(rec.matchId) !== asString(query && query.matchId)) return false;
  if (query && query.hideBigPot && rec.config && rec.config.allowBigPot) return false;
  var listScope = query && query.scope === 'match' ? 'match' : 'group';
  if (listScope === 'match') {
    // 中间页只读 match scope，禁止汇总或回退分组实例
    if (rec.scope !== 'match') return false;
  } else {
    var qid = asString(query && query.groupId);
    if (!qid || rec.scope !== 'group' || asString(rec.groupId) !== qid) return false;
  }
  var vis = rec.visibility;
  if (asString(rec.createdBy) && asString(rec.createdBy) === asString(viewerId)) return true;
  if (vis === 'public') return true;
  if (vis === 'event') return isMatchParticipant(host, viewerId);
  if (vis === 'group') return isGroupMember(host, rec.groupId, viewerId);
  return false;
}

module.exports = {
  VISIBILITY: VISIBILITY,
  STATUS: STATUS,
  asString: asString,
  jsonClone: jsonClone,
  nowMs: nowMs,
  capOf: capOf,
  buildRuleSnapshot: buildRuleSnapshot,
  unwrapGameplaySnapshot: unwrapGameplaySnapshot,
  normalizeRewardMode: normalizeRewardMode,
  draftFromLibraryRow: draftFromLibraryRow,
  stripLibraryMeta: stripLibraryMeta,
  hasExplicitMatch2Reward: hasExplicitMatch2Reward,
  hasExplicitGameplayReward: hasExplicitGameplayReward,
  pickFirstUsableGameplay: pickFirstUsableGameplay,
  collectMatch2GameplayCandidates: collectMatch2GameplayCandidates,
  collectGameplayCandidates: collectMatch2GameplayCandidates,
  mergeRuleSnapshot: mergeRuleSnapshot,
  describeMatch2MulSources: describeMatch2MulSources,
  describeStroke2RewardSources: describeStroke2RewardSources,
  normalizeParty: normalizeParty,
  resolveSubjectParty: resolveSubjectParty,
  memberSetKey: memberSetKey,
  emptyConfig: emptyConfig,
  normalizeRecord: normalizeRecord,
  validateCreateInput: validateCreateInput,
  remapRecordPlayerId: remapRecordPlayerId,
  remapRecordPlayerIds: remapRecordPlayerIds,
  stampPlayerProfile: stampPlayerProfile,
  recordTouchesPlayerId: recordTouchesPlayerId,
  recordHasDuplicatePlayerIds: recordHasDuplicatePlayerIds,
  isResultStale: isResultStale,
  isMatchParticipant: isMatchParticipant,
  isGroupMember: isGroupMember,
  viewerCanSee: viewerCanSee
};
