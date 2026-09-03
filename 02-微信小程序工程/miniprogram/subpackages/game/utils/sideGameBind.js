/**
 * 沙盒 UI 绑定层：把页面里的 session 形态 API 接到正式 Host / Repository / 规则库。
 * 不是旧版 session 模块，不含假球员假成绩。页面不要直接读写 storage。
 */
var holeOrderUtil = require("./holeOrder.js");
var settle = require("./settle.js");
var catalog = require("./catalog.js");
var rec = require("./sideGameRecord.js");
var hostSession = require("./sideGameHostSession.js");
var draftMod = require("./sideGameDraft.js");
var repository = require("./sideGameRepository.js");
var ruleLibrary = require("./sideGameRuleLibrary.js");
var settingsMod = require("./localSideGameSettings.js");
var hostMod = require("./gameHostContext.js");
var identity = require("./sideGameIdentityProvider.js");
var nav = require("./nav.js");
var resultTone = require("./resultTone.js");
var resultFormat = require("./resultFormat.js");
var partyFormation = require("./partyFormation.js");
var entitlement = require("./sideGameEntitlementProvider.js");
var scoreMapUtil = require("./sideGameScoreMap.js");
var settleThreeSet = require("./settleThreeSet.js");

var settingsStore = settingsMod.getDefault();
var activeHostQuery = { matchId: "", groupId: "", scope: "group" };

function showToast(title) {
  try {
    var api = typeof wx !== "undefined" ? wx : typeof global !== "undefined" ? global.wx : null;
    if (api && typeof api.showToast === "function") {
      api.showToast({ title: title, icon: "none" });
    }
  } catch (e) {}
}

function attachHost(query) {
  activeHostQuery = hostSession.queryOf(query);
  try {
    entitlement.bindHostContext(currentHost());
  } catch (e) {}
  return activeHostQuery;
}

function denyWrite() {
  return { ok: false, __fail: true, reason: "no_entitlement", message: "仅可查看，无法修改" };
}

function assertWritable() {
  var gate = entitlement.canEdit({
    userId: identity.getCurrentUserId(),
    hostContext: currentHost()
  });
  return gate && gate.ok ? null : denyWrite();
}

function ensureHost(query) {
  attachHost(query);
  var host = hostSession.getHostContext(activeHostQuery);
  if (host && rec.asString(host.matchId)) return host;
  try {
    showToast("请从比赛页面进入");
  } catch (e) {}
  try {
    nav.navigateBackSafe(1);
  } catch (e2) {}
  return null;
}

function currentHost() {
  var fromBridge = hostSession.getHostContext(activeHostQuery);
  if (fromBridge && rec.asString(fromBridge.matchId)) {
    return hostMod.buildPresentation(fromBridge);
  }
  return hostMod.emptyContext();
}

var state = {
  chatLogs: { score: [], hub: [], match: [] },
  draft: null,
  pendingUse: null,
  boardView: { score: null, hub: null, match: null },
  scorecard: {}
};

function matchIdOf() {
  return rec.asString(currentHost().matchId);
}

function hostScope() {
  return currentHost().scope === "match" ? "match" : "group";
}

function entryScopeOf(entry) {
  var e = String(entry || "");
  if (e === "hub" || e === "match") return "match";
  if (e === "score") return "group";
  return hostScope();
}

function hideBigPotFor(entry) {
  return String(entry || "") !== "score";
}

function presentPlayer(playerId) {
  var id = rec.asString(playerId);
  var maps = currentHost().playerPresentationById || {};
  if (id && maps[id]) {
    var hit = rec.jsonClone(maps[id]);
    var liveName = rec.asString(hit.displayName || hit.name);
    if (!liveName || liveName === id || liveName === "球员") {
      var resolved = nicknameFromCurrentGame(id);
      if (resolved) hit.displayName = resolved;
      else if (liveName === "球员") hit.displayName = "";
    }
    return hit;
  }
  var fromGame = nicknameFromCurrentGame(id);
  return {
    playerId: id,
    displayName: fromGame || "",
    avatar: hostMod.officialDefaultAvatar()
  };
}

function nicknameFromCurrentGame(playerId) {
  var id = rec.asString(playerId);
  if (!id) return "";
  var comboName = require("../../../utils/comboDisplayName.js");
  var host = currentHost();
  var i;
  var list = host.players || [];
  for (i = 0; i < list.length; i++) {
    var p = list[i] || {};
    if (rec.asString(p.playerId) !== id) continue;
    var n = comboName.pickPublicName([p.displayName, p.name, p.matchNickname, p.nickname]);
    if (n && n !== id) return n;
  }
  var users =
    (host.registerInfo && Array.isArray(host.registerInfo.users) && host.registerInfo.users) || [];
  for (i = 0; i < users.length; i++) {
    var u = users[i] || {};
    var uid = rec.asString(u.userId || u.playerId || u.id);
    if (uid !== id) continue;
    var un = comboName.pickPublicName([
      u.matchNickname,
      u.nickname,
      u.displayName,
      u.name
    ]);
    if (un && un !== id) return un;
  }
  return "";
}

function presentParty(partyId) {
  var id = rec.asString(partyId);
  var maps = currentHost().partyPresentationById || {};
  if (id && maps[id]) return rec.jsonClone(maps[id]);
  var player = presentPlayer(id);
  return {
    partyId: id,
    partyType: "player",
    displayName: player.displayName,
    memberPlayerIds: id ? [id] : [],
    members: id ? [player] : [],
    avatar: player.avatar
  };
}

function partyFaceKind(party) {
  var type = rec.asString(party && party.partyType) || "player";
  var members = (party && party.members) || [];
  if (type === "player" || members.length <= 1) return "single";
  if (members.length === 2) return "pair";
  return "stack";
}

function presentFormationParty(raw) {
  var participantSubject = require("./participantSubject.js");
  return participantSubject.buildParticipantSubject(raw || {}, {
    presentPlayer: presentPlayer,
    presentPerson: presentPerson,
    selected: !!(raw && raw.selected),
    required: !!(raw && raw.required)
  });
}

function buildParticipantSubject(party, opts) {
  var participantSubject = require("./participantSubject.js");
  return participantSubject.buildParticipantSubject(
    party || {},
    Object.assign({}, opts || {}, {
      presentPlayer: presentPlayer,
      presentPerson: presentPerson
    })
  );
}

function presentPerson(id) {
  var key = rec.asString(id);
  var parties = currentHost().partyPresentationById || {};
  var party = parties[key] ? presentParty(key) : null;
  if (!party) {
    var player = presentPlayer(key);
    party = {
      partyId: key,
      partyType: "player",
      displayName: player.displayName,
      memberPlayerIds: key ? [key] : [],
      members: key ? [player] : [],
      avatar: player.avatar
    };
  }
  // 直接投影，勿再经 presentPerson 回查 hostFace（避免递归）
  var participantSubject = require("./participantSubject.js");
  return participantSubject.buildParticipantSubject(party, {
    presentPlayer: presentPlayer,
    selected: false,
    required: false
  });
}

function memberIdsOf(members) {
  return (Array.isArray(members) ? members : [])
    .map(function (m) {
      return rec.asString(m && (m.playerId || m.id));
    })
    .filter(Boolean);
}

function hydratePersonFromHost(person, partyHint) {
  var participantSubject = require("./participantSubject.js");
  var raw = person || {};
  var hint = partyHint || {};
  var playerIds =
    (hint.playerIds && hint.playerIds.length
      ? hint.playerIds
      : hint.memberPlayerIds && hint.memberPlayerIds.length
        ? hint.memberPlayerIds
        : raw.memberPlayerIds && raw.memberPlayerIds.length
          ? raw.memberPlayerIds
          : raw.playerIds && raw.playerIds.length
            ? raw.playerIds
            : memberIdsOf(raw.members).length
              ? memberIdsOf(raw.members)
              : memberIdsOf(hint.members).length
                ? memberIdsOf(hint.members)
                : raw.playerId
                  ? [raw.playerId]
                  : null) || null;
  var partyId = rec.asString(
    hint.partyId ||
      raw.partyId ||
      raw.subjectId ||
      raw.playerId ||
      raw.id
  );
  if (!playerIds || !playerIds.length) {
    var presented0 = presentPerson(partyId);
    playerIds =
      presented0.memberPlayerIds && presented0.memberPlayerIds.length
        ? presented0.memberPlayerIds
        : partyId
          ? [partyId]
          : [];
  }
  var subject = participantSubject.buildParticipantSubject(
    {
      partyId: partyId,
      playerIds: playerIds,
      displayName: hint.displayName || raw.displayName || raw.name,
      name: hint.name || raw.name,
      partyType: hint.partyType || raw.partyType
    },
    {
      presentPlayer: presentPlayer,
      presentPerson: presentPerson,
      selected: !!raw.selected,
      required: !!raw.required
    }
  );
  var next = Object.assign({}, raw, subject, {
    id: subject.subjectId,
    name: subject.displayName,
    hcp: raw.hcp != null ? raw.hcp : subject.hcp
  });
  delete next.initial;
  delete next.leftInitial;
  delete next.rightInitial;
  return next;
}

function partyHintMapFromGame(game) {
  var map = {};
  (game && game.parties ? game.parties : []).forEach(function (p) {
    if (!p) return;
    var id = rec.asString(p.partyId || p.id);
    if (id) map[id] = p;
  });
  return map;
}

function hydrateGamePlayers(game) {
  var hints = partyHintMapFromGame(game);
  return ((game && game.players) || []).map(function (person) {
    var id = rec.asString(person && (person.id || person.partyId || person.subjectId));
    return hydratePersonFromHost(person, hints[id] || null);
  });
}

function hydratePairings(pairings, game) {
  var hints = partyHintMapFromGame(game);
  return (pairings || []).map(function (pair) {
    if (!pair) return pair;
    var leftId = pair.leftPartyId || pair.leftId;
    var rightId = pair.rightPartyId || pair.rightId;
    var left = hydratePersonFromHost(
      { id: leftId },
      hints[rec.asString(leftId)] || null
    );
    var right = hydratePersonFromHost(
      { id: rightId },
      hints[rec.asString(rightId)] || null
    );
    return Object.assign({}, pair, {
      leftName: left.name,
      leftAvatar: left.avatar,
      leftFace: left,
      rightName: right.name,
      rightAvatar: right.avatar,
      rightFace: right
    });
  });
}

function stripDisplayFields(instance) {
  var copy = rec.jsonClone(instance || {});
  if (Array.isArray(copy.players)) {
    copy.players = copy.players.map(function (p) {
      var next = Object.assign({}, p);
      delete next.name;
      delete next.avatar;
      delete next.initial;
      delete next.memberAvatars;
      delete next.members;
      delete next.memberNames;
      delete next.faceKind;
      if (next.displayName === '球员') delete next.displayName;
      delete next.leftName;
      delete next.rightName;
      delete next.leftFace;
      delete next.rightFace;
      return next;
    });
  }
  if (Array.isArray(copy.pairings)) {
    copy.pairings = copy.pairings.map(function (pair) {
      var next = Object.assign({}, pair);
      delete next.leftName;
      delete next.rightName;
      delete next.leftInitial;
      delete next.rightInitial;
      delete next.leftAvatar;
      delete next.rightAvatar;
      delete next.leftFace;
      delete next.rightFace;
      return next;
    });
  }
  if (Array.isArray(copy.orderedPlayers)) {
    copy.orderedPlayers = copy.orderedPlayers.map(function (p) {
      var next = Object.assign({}, p);
      delete next.name;
      delete next.avatar;
      delete next.initial;
      delete next.faceKind;
      delete next.members;
      delete next.memberAvatars;
      delete next.memberNames;
      return next;
    });
  }
  return copy;
}

function partyToPerson(p) {
  var presented = presentPerson(p && p.partyId);
  return Object.assign(presented, {
    groupId: rec.asString(p && p.groupId),
    hcp: p && p.hcp != null ? String(p.hcp) : ""
  });
}

function listQuery(entry) {
  var host = currentHost();
  var q = activeHostQuery || {};
  var scope = entryScopeOf(entry);
  var groupId = "";
  if (scope === "group") {
    groupId = rec.asString(q.groupId) || rec.asString(host.groupId);
  }
  return {
    matchId: rec.asString(q.matchId) || rec.asString(host.matchId),
    groupId: groupId,
    scope: scope,
    hostContext: host,
    hideBigPot: hideBigPotFor(entry),
    viewerUserId: rec.asString(host.currentUserId) || identity.getCurrentUserId()
  };
}

function recordToGame(row) {
  var inst = (row.config && row.config.instance) || {};
  var players = inst.players;
  if (!players || !players.length) {
    players = (row.participantParties || []).map(partyToPerson);
  }
  var game = Object.assign({}, inst, {
    id: row.sideGameId,
    name: row.title || inst.name || row.ruleId,
    catalogId: row.ruleId || inst.catalogId,
    ruleLibId: inst.ruleLibId || "",
    ruleLibRevision: inst.ruleLibRevision,
    ruleSnapshot: rec.mergeRuleSnapshot(
      rec.buildRuleSnapshot(row.ruleId || inst.catalogId || inst.ruleId),
      rec.pickFirstUsableGameplay([
        inst.ruleSnapshot,
        row.ruleSnapshot,
        row.resultSnapshot && row.resultSnapshot.ruleSnapshot,
        inst
      ])
    ),
    players: players || [],
    parties: inst.parties || row.participantParties || [],
    status: row.status === "deleted" ? "deleted" : inst.status || row.status || "active",
    holeResults: row.resultSnapshot || inst.holeResults || null,
    revision: row.revision,
    kicks: inst.kicks || [],
    pairings: inst.pairings || [],
    holes: inst.holes,
    holeOrder: inst.holeOrder,
    fullHoleOrder: inst.fullHoleOrder,
    createdHoleOrder: inst.createdHoleOrder,
    playerCount: (players || []).length,
    wayLabel: inst.wayLabel || inst.groupModeLabel || "",
    multiplier: inst.multiplier != null && inst.multiplier !== "" ? inst.multiplier : 1,
    scoreRows: inst.scoreRows || null,
    defaultScoreCode: inst.defaultScoreCode || ""
  });
  game.players = hydrateGamePlayers(game);
  game.pairings = hydratePairings(game.pairings || [], game);
  game.playerCount = game.players.length;
  return game;
}

function personsToParties(players) {
  return (players || []).map(function (p) {
    var ids =
      (p && p.memberPlayerIds && p.memberPlayerIds.length
        ? p.memberPlayerIds
        : p && p.playerIds && p.playerIds.length
          ? p.playerIds
          : null) || null;
    if (ids && ids.length) {
      return rec.normalizeParty({
        partyId: rec.asString(p.id || p.partyId || p.subjectId),
        partyType:
          ids.length > 1
            ? "combination"
            : p.partyType || p.subjectType === "combo"
              ? "combination"
              : "player",
        displayName: "",
        memberPlayerIds: ids
      });
    }
    var presented = presentPerson(p && p.id);
    return rec.normalizeParty({
      partyId: presented.id,
      partyType: presented.partyType || "player",
      displayName: "",
      memberPlayerIds:
        presented.memberPlayerIds && presented.memberPlayerIds.length
          ? presented.memberPlayerIds
          : presented.id
            ? [presented.id]
            : []
    });
  });
}

function partiesFromGameInstance(game) {
  if (Array.isArray(game && game.parties) && game.parties.length) {
    return game.parties.map(function (p) {
      return rec.normalizeParty({
        partyId: p.partyId || p.id,
        partyType:
          (p.playerIds || p.memberPlayerIds || []).length > 1
            ? "combination"
            : p.partyType || "player",
        displayName: "",
        memberPlayerIds: p.playerIds || p.memberPlayerIds || []
      });
    });
  }
  return personsToParties(game && game.players);
}

function ctxQuery() {
  var host = currentHost();
  var q = activeHostQuery || {};
  return {
    matchId: rec.asString(q.matchId) || rec.asString(host.matchId),
    groupId: rec.asString(q.groupId) || rec.asString(host.groupId),
    scope: q.scope || hostScope(),
    entry: hostScope() === "match" ? "match" : "score"
  };
}

function setupKeys(entry) {
  var host = currentHost();
  var q = activeHostQuery || {};
  var scope = entryScopeOf(entry);
  return {
    matchId: rec.asString(q.matchId) || rec.asString(host.matchId),
    groupId: scope === "group" ? rec.asString(q.groupId) || rec.asString(host.groupId) : "",
    scope: scope,
    entry: String(entry || "score")
  };
}

var publishedGuard = 0;

function runPublished(fn) {
  publishedGuard += 1;
  try {
    return fn();
  } finally {
    publishedGuard -= 1;
  }
}

function inSetup(entry) {
  if (publishedGuard > 0) return false;
  return draftMod.matchesSetup(setupKeys(entry));
}

function hydrateUiGame(game) {
  if (!game) return game;
  var next = Object.assign({}, game);
  next.players = hydrateGamePlayers(next);
  next.pairings = hydratePairings(next.pairings || [], next);
  if (String(next.catalogId || "") === "three-set") {
    next.coeffText = settleThreeSet.segmentCoeffText(next);
  } else {
    delete next.coeffText;
  }
  return next;
}

function listRepoGames(entry) {
  var listed = repository.listVisible(listQuery(entry));
  var items = listed.ok && listed.data ? listed.data.items || [] : [];
  return items.map(recordToGame);
}

function snapshotExpectedRevisions(games) {
  var map = {};
  (games || []).forEach(function (game) {
    var id = rec.asString(game && game.id);
    if (!id) return;
    var got = repository.getById(id);
    map[id] = got.ok && got.data ? Number(got.data.revision) || 0 : 0;
  });
  return map;
}

function ensureSetupDraft(entry) {
  var key = String(entry || "score");
  var keys = setupKeys(key);
  if (draftMod.matchesSetup(keys)) return draftMod.getSetupDraft();
  var host = currentHost();
  if (!rec.asString(host.matchId)) return null;
  var games = listRepoGames(key);
  var setup = draftMod.emptySetup(
    Object.assign({}, keys, { baseRevision: rec.asString(host.revision) })
  );
  setup.globalSettings = rec.jsonClone(settingsStore.get(keys.matchId, key));
  setup.games = games.map(function (g) {
    return rec.jsonClone(g);
  });
  setup.expectedRevisions = snapshotExpectedRevisions(games);
  draftMod.setSetupDraft(setup);
  // 预热洞序字段，避免首次 addGame 才写入导致「加完又删」假 dirty
  try {
    ensureMatchHoleOrder(key);
  } catch (eHole) {}
  return draftMod.getSetupDraft();
}

function requireSetupDraft(entry) {
  if (inSetup(entry)) return draftMod.getSetupDraft();
  try {
    showToast("请从游戏设置进入");
  } catch (e) {}
  try {
    nav.navigateBackSafe(1);
  } catch (e2) {}
  return null;
}

function discardSetupDraft() {
  draftMod.clearSetupDraft();
}

function findDraftGame(entry, gameId) {
  var setup = draftMod.getSetupDraftRaw();
  if (!setup || !inSetup(entry)) return null;
  var id = rec.asString(gameId);
  var i;
  for (i = 0; i < (setup.games || []).length; i++) {
    if (rec.asString(setup.games[i].id) === id) return setup.games[i];
  }
  return null;
}

function markDraftUpdated(setup, gameId) {
  var id = rec.asString(gameId);
  if (!id) return;
  if ((setup.added || []).indexOf(id) >= 0) return;
  if ((setup.updated || []).indexOf(id) < 0) setup.updated.push(id);
}

function persistToSetup(entry, game, existingId) {
  var blocked = assertWritable();
  if (blocked) return blocked;
  var setup = draftMod.getSetupDraftRaw();
  if (!setup) return { __fail: true, reason: "no_setup_draft" };
  var next = hydrateUiGame(
    rec.jsonClone(
      Object.assign({}, game, {
        id: rec.asString(existingId) || rec.asString(game && game.id) || "sg_draft_" + Date.now()
      })
    )
  );
  if (existingId) {
    var hit = findDraftGame(entry, existingId);
    if (!hit) return null;
    Object.assign(hit, next, { id: rec.asString(existingId) });
    markDraftUpdated(setup, existingId);
    return hydrateUiGame(hit);
  }
  setup.games.push(next);
  setup.added.push(next.id);
  return hydrateUiGame(next);
}

function failMessage(reason, meta) {
  var r = rec.asString(reason);
  var title = rec.asString(meta && (meta.title || meta.name || meta.catalogId));
  var prefix = title ? title + "：" : "";
  var map = {
    revision_conflict: "数据已变更，请返回后重试",
    storage_write_failed: "保存失败",
    settings_write_failed: "保存失败",
    no_setup_draft: "请从游戏设置进入",
    party_not_in_host: "参赛组合不在当前记分页中",
    party_not_in_group: "参赛方不在当前小组",
    party_members_invalid: "组合成员不完整或不在本场球员中",
    party_member_overlap: "组合成员有重叠",
    party_count: "参赛方数不符合玩法要求",
    invalid_party: "参赛方数据无效",
    unknown_rule: "未知玩法",
    rule_unavailable: "玩法尚未开放",
    invalid_visibility: "可见范围无效",
    score_context_unavailable: "成绩上下文暂不可用",
    no_entitlement: "无权限保存",
    big_pot_not_allowed: "当前不允许大锅模式"
  };
  var body = map[r] || (r ? "保存失败（" + r + "）" : "保存失败");
  return prefix + body;
}

function commitSetupDraft(entry) {
  var blocked = assertWritable();
  if (blocked) return { ok: false, reason: blocked.reason, message: blocked.message };
  var key = String(entry || "score");
  if (!inSetup(key)) {
    return { ok: false, reason: "no_setup_draft", message: "请从游戏设置进入" };
  }
  var setup = draftMod.getSetupDraftRaw();
  var host = currentHost();
  var vis = setup.globalSettings && setup.globalSettings.privacy;
  if (vis !== "event" && vis !== "group" && vis !== "public") vis = "public";
  if (setup.globalSettings) setup.globalSettings.privacy = vis;
  if (host.scope === "match" && vis === "group") {
    return { ok: false, reason: "invalid_visibility", message: failMessage("invalid_visibility") };
  }

  var creates = [];
  var updates = [];
  var settleIds = [];
  var i;

  for (i = 0; i < (setup.games || []).length; i++) {
    var game = setup.games[i];
    var id = rec.asString(game && game.id);
    if (!id) continue;
    // 各游戏深拷贝，避免共享 matchups/parties 引用互相污染
    game = rec.jsonClone(game);
    setup.games[i] = game;
    var payload = buildInstancePayload(key, game, (setup.added || []).indexOf(id) >= 0 ? "" : id);
    var mutating = (setup.added || []).indexOf(id) >= 0 || (setup.updated || []).indexOf(id) >= 0;
    if (mutating) {
      var checked = rec.validateCreateInput(
        Object.assign({}, payload, { sideGameId: id, status: "active", revision: 1 }),
        host
      );
      if (!checked.ok) {
        return {
          ok: false,
          reason: checked.reason,
          fieldPath: checked.fieldPath || "",
          gameId: id,
          catalogId: game.catalogId || "",
          message: failMessage(checked.reason, {
            title: game.name || game.catalogId,
            catalogId: game.catalogId
          })
        };
      }
      // 校验可能对齐了成绩实体 partyId，写回 payload
      if (checked.record) {
        payload.participantParties = checked.record.participantParties;
        if (checked.record.config) payload.config = checked.record.config;
      }
    }
    if ((setup.added || []).indexOf(id) >= 0) {
      payload.sideGameId = id;
      payload.idempotencyKey = id;
      creates.push(payload);
      settleIds.push(id);
    } else if ((setup.updated || []).indexOf(id) >= 0) {
      updates.push({
        sideGameId: id,
        revision: setup.expectedRevisions[id],
        patch: {
          title: payload.title,
          visibility: payload.visibility,
          participantParties: payload.participantParties,
          config: payload.config,
          ruleSnapshot: payload.ruleSnapshot
        }
      });
      settleIds.push(id);
    } else {
      settleIds.push(id);
    }
  }

  var out = repository.commitSetupDraft({
    matchId: setup.matchId,
    groupId: setup.groupId,
    scope: setup.scope,
    entry: key,
    expectedRevisions: setup.expectedRevisions,
    settings: setup.globalSettings,
    hostContext: host,
    creates: creates,
    updates: updates,
    removes: (setup.removed || []).map(function (item) {
      var rid = typeof item === "string" ? item : item && item.id;
      return {
        sideGameId: rid,
        revision: (item && item.revision) != null ? item.revision : setup.expectedRevisions[rid]
      };
    }),
    settleIds: settleIds
  });
  if (!out || !out.ok) {
    return {
      ok: false,
      reason: (out && out.reason) || "commit_failed",
      message: failMessage(out && out.reason)
    };
  }
  draftMod.clearSetupDraft();
  return { ok: true, reason: "", data: out.data };
}

function withHost(url) {
  var extra = encodeBag({
    matchId: activeHostQuery.matchId,
    groupId: activeHostQuery.groupId,
    scope: activeHostQuery.scope
  });
  if (!extra) return url;
  return String(url || "") + (String(url || "").indexOf("?") >= 0 ? "&" : "?") + extra;
}

function encodeBag(bag) {
  return Object.keys(bag)
    .filter(function (key) {
      return bag[key] !== "" && bag[key] != null;
    })
    .map(function (key) {
      return encodeURIComponent(key) + "=" + encodeURIComponent(String(bag[key]));
    })
    .join("&");
}

function isPresetCatalogId() {
  return false;
}

function markPresetRemoved() {}

function clearPresetRemoved() {}

function persistMyRules() {}

function hydrateMyRules() {}

function listPlayers(entry) {
  var host = currentHost();
  var gid = rec.asString(host.groupId);
  var scope = String(entry) === "score" ? "group" : "match";
  return (host.scoreParties || [])
    .filter(function (p) {
      if (scope === "group" && gid) {
        return rec.asString(p.groupId) === gid;
      }
      return true;
    })
    .map(partyToPerson);
}

function listFieldGroups(entry) {
  var people = listPlayers(entry);
  var host = currentHost();
  var ctx = getScoreFormationContext(entry);
  if (ctx && ctx.teamed && ctx.availablePartyCount > 0) {
    return [
      {
        format: ctx.formation,
        players: ctx.availablePartyCount,
        slots: ctx.availablePartyCount,
        parties: ctx.parties
      }
    ];
  }
  return [{ format: "individual", players: people.length, slots: people.length }];
}

function groupSlotCount(group) {
  if (!group) return 0;
  if (group.slots != null && group.slots !== "") {
    const n = Number(group.slots);
    if (n >= 0) return n;
  }
  const fmt = String(group.format || "individual");
  if (fmt === "4+0" || fmt === "fourball40") return 1;
  if (fmt === "2+2" || fmt === "3+1") return 2;
  if (fmt === "2+1+1") return 3;
  if (fmt === "2+2-best" || fmt === "bestball") return 2;
  if (fmt === "2+2-game") return 4;
  const p = Number(group.players);
  return p > 0 ? p : 0;
}

function readCompositionFromHost(host) {
  if (!host) return null;
  var gid = rec.asString(host.groupId);
  var map = host.groupCompositionMap || {};
  return (gid && map[gid]) || host.composition || null;
}

function readCompositionTypeFromHost(host) {
  var comp = readCompositionFromHost(host);
  return rec.asString(
    (comp && (comp.compositionType || comp.type)) || ""
  );
}

function partiesFromComposition(host) {
  var comp = readCompositionFromHost(host);
  var teams = (comp && Array.isArray(comp.teams) ? comp.teams : []) || [];
  var gid = rec.asString(host && host.groupId);
  var out = [];
  teams.forEach(function (t, i) {
    if (!t) return;
    var partyId = rec.asString(t.teamId || t.partyId || t.id);
    if (!partyId) partyId = gid ? gid + "__team__" + (i + 1) : "team-" + (i + 1);
    var members = (t.members || t.players || [])
      .map(function (m) {
        return rec.asString(m && (m.playerId || m.userId || m.id));
      })
      .filter(Boolean);
    if (!members.length) return;
    out.push({
      partyId: partyId,
      playerIds: members,
      displayName: rec.asString(t.name || t.displayName || t.teamName),
      partyType: members.length > 1 ? "combination" : "player",
      groupId: gid,
      order: i
    });
  });
  return out;
}

function partiesFromScoreParties(entry) {
  return listPlayers(entry).map(function (p, i) {
    var presented = presentPerson(p && p.id);
    return {
      partyId: presented.id || (p && p.id),
      playerIds:
        presented.memberPlayerIds && presented.memberPlayerIds.length
          ? presented.memberPlayerIds
          : presented.id
            ? [presented.id]
            : [],
      displayName: presented.name,
      partyType: presented.partyType,
      groupId: p && p.groupId,
      order: i
    };
  });
}

function getScoreFormationContext(entry) {
  var host = currentHost();
  var fromComp = partiesFromComposition(host);
  var fromScore = partiesFromScoreParties(entry);
  // 优先 composition 方（避免 teamScores 缺成员导致方数=0 误报）
  var parties = fromComp.length ? fromComp : fromScore;
  if (fromComp.length && fromScore.length) {
    var scoreById = {};
    fromScore.forEach(function (p) {
      if (p && p.partyId) scoreById[String(p.partyId)] = p;
    });
    parties = fromComp.map(function (p) {
      var hit = scoreById[String(p.partyId)];
      if (!hit) return p;
      var participantSubject = require("./participantSubject.js");
      var mergedName = participantSubject.pickPublicName([
        hit.displayName,
        p.displayName
      ]);
      return Object.assign({}, p, {
        displayName: mergedName || p.displayName || hit.displayName || "",
        playerIds:
          p.playerIds && p.playerIds.length
            ? p.playerIds
            : hit.playerIds && hit.playerIds.length
              ? hit.playerIds
              : p.playerIds
      });
    });
  }
  return partyFormation.buildFormationContext(parties, {
    compositionType: readCompositionTypeFromHost(host),
    scoreKind: rec.asString(host.scoreKind)
  });
}

function resolveInstanceCatalog(entry) {
  var ctx = getScoreFormationContext(entry);
  if (!ctx.teamed) {
    return {
      formation: ctx.formation,
      parties: ctx.parties,
      availablePartyCount: ctx.availablePartyCount,
      teamed: false,
      visible: catalog.listCatalogForDesign()
    };
  }
  return partyFormation.resolveAvailableGameCatalog({
    formation: ctx.formation,
    parties: ctx.parties,
    compositionType: ctx.formation,
    scoreKind: ctx.scoreKind
  });
}

function getGroupCount(entry) {
  return listFieldGroups(entry).length;
}

function getRuleCap(entry) {
  let n = 0;
  listFieldGroups(entry).forEach(function (group) {
    n += groupSlotCount(group);
  });
  return n;
}

function addCandidateId(seen, nRef, id) {
  var s = rec.asString(id);
  if (!s || seen[s]) return;
  seen[s] = true;
  nRef.n += 1;
}

function collectCandidateIds(entry) {
  var seen = {};
  var nRef = { n: 0 };
  function add(id) {
    addCandidateId(seen, nRef, id);
  }
  listPlayers(entry).forEach(function (p) {
    add(p && p.id);
  });
  var host = currentHost();
  (host.players || []).forEach(function (p) {
    add(p && (p.playerId || p.id || p.userId));
  });
  (host.scoreParties || []).forEach(function (p) {
    add(p && p.partyId);
    ((p && p.memberPlayerIds) || []).forEach(add);
  });
  (host.groups || []).forEach(function (g) {
    (g.playersSlots || []).forEach(function (slot) {
      add(slot && (slot.playerId || slot.userId || slot.id));
    });
    (g.players || []).forEach(function (slot) {
      add(slot && (slot.playerId || slot.userId || slot.id));
    });
  });
  var users =
    host.registerInfo && Array.isArray(host.registerInfo.users) ? host.registerInfo.users : [];
  users.forEach(function (u) {
    add(u && (u.userId || u.playerId || u.id));
  });
  var ids = Object.keys(seen);
  return { ids: ids, count: nRef.n };
}

function uniqueCandidateCount(entry) {
  return collectCandidateIds(entry).count;
}

function listCandidatePlayerIds(entry) {
  return collectCandidateIds(entry).ids;
}

function inspectRuleDesignGate(entry) {
  var host = currentHost();
  var key = String(entry || "score");
  var access = entitlement.canEdit({
    userId: identity.getCurrentUserId(),
    hostContext: host
  });
  var designIds = [];
  var disabledIds = [];
  catalog.listCatalogForDesign().forEach(function (group) {
    (group.items || []).forEach(function (item) {
      if (!item) return;
      if (catalog.isUnavailableRule(item)) disabledIds.push(item.id);
      else designIds.push(item.id);
    });
  });
  var canEdit = !!(access && access.ok);
  var pageMode = canEdit ? "edit" : "readonly";
  var canAddRule = canEdit;
  var disabledReason = "";
  if (!rec.asString(host.matchId)) disabledReason = "missing_host_context";
  else if (!canEdit) disabledReason = (access && access.reason) || "no_entitlement";
  return {
    matchId: rec.asString(host.matchId),
    source: key,
    multiGroup: (host.groups && host.groups.length > 1) || false,
    groups: (host.groups || []).length,
    candidatePlayerIds: listCandidatePlayerIds(key),
    currentUserRole: rec.asString(host.currentUserId),
    canEditSideGames: host.canEditSideGames,
    canManageRules: canEdit,
    pageMode: pageMode,
    canAddRule: canAddRule,
    disabledReason: disabledReason,
    catalogIdsVisible: designIds,
    catalogIdsDisabled: disabledIds
  };
}

/** 规则库/目录可选上限：多组赛事按全场去重人数，不按单组成绩槽 */
function getRuleLibraryCap(entry) {
  const key = String(entry || "score");
  if (key === "hub" || key === "match") {
    var n = uniqueCandidateCount(key);
    return n > 0 ? n : catalog.catalogDesignCap();
  }
  return getRuleCap(key);
}

/** 添加/编辑规则模板：不按当前组或已选人数过滤玩法 */
function getRuleDesignCap(entry) {
  const key = String(entry || "score");
  if (key === "hub" || key === "match") return catalog.catalogDesignCap();
  var cap = getRuleLibraryCap(key);
  return cap > 0 ? cap : catalog.catalogDesignCap();
}

function listScoreSlots(entry) {
  const people = listPlayers(entry);
  const slots = [];
  let cursor = 0;
  listFieldGroups(entry).forEach(function (group, gi) {
    const n = groupSlotCount(group);
    for (let i = 0; i < n; i++) {
      const person = people[cursor];
      if (!person || !person.id) continue;
      slots.push({
        id: person.id,
        name: person.name,
        avatar: person.avatar || hostMod.officialDefaultAvatar(),
        selected: true
      });
      cursor += 1;
    }
  });
  return slots;
}

function pad2(n) {
  return (n < 10 ? "0" : "") + n;
}

function timeText(ts) {
  const d = new Date(ts || Date.now());
  return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
}

function orderNames(game) {
  return ((game && game.players) || [])
    .map(function (item) {
      return item.name || "";
    })
    .filter(Boolean)
    .join(" → ");
}

function orderLogText(game, kind) {
  const name = (game && game.name) || "游戏";
  const names = orderNames(game) || "未指定";
  const bits = [];
  if (game && game.groupModeLabel) bits.push(game.groupModeLabel);
  const sort = game && game.sortMode;
  if (sort === "hcp") bits.push("差点排序");
  else if (sort === "manual") bits.push("手工指定");
  else if (sort === "random") bits.push("随机排序");
  const extra = bits.length ? "（" + bits.join(" · ") + "）" : "";
  if (kind === "update") return name + " 排序调整为：" + names + extra;
  return name + " 起始排序：" + names + extra;
}

function orderKey(game) {
  return [
    ((game && game.playerOrder) || []).join(","),
    (game && game.sortMode) || "",
    (game && game.groupMode) || "",
    orderNames(game)
  ].join("|");
}

function listChatLogs(entry) {
  return (state.chatLogs[entry] || []).slice();
}

function addChatLog(entry, log) {
  if (!state.chatLogs[entry]) state.chatLogs[entry] = [];
  const ts = (log && log.time) || Date.now();
  const item = Object.assign(
    {
      id: "log-" + ts + "-" + Math.floor(Math.random() * 1000),
      type: "sys",
      time: ts,
      timeText: timeText(ts)
    },
    log || {}
  );
  if (!item.timeText) item.timeText = timeText(item.time);
  state.chatLogs[entry].push(item);
  return item;
}

function addOrderLog(entry, game, kind) {
  if (!game) return null;
  const log = addChatLog(entry, {
    type: "order",
    kind: kind || "start",
    gameId: game.id,
    text: orderLogText(game, kind)
  });
  if (!game.orderLogs) game.orderLogs = [];
  game.orderLogs.push(log);
  return log;
}

function listGames(entry) {
  if (inSetup(entry)) {
    var setup = draftMod.getSetupDraftRaw();
    if (setup) {
      return (setup.games || []).map(function (g) {
        return hydrateUiGame(g);
      });
    }
  }
  return listRepoGames(entry);
}

function getPublishedGlobal(entry) {
  return settingsStore.get(matchIdOf(), String(entry || "score"));
}

function listPublishedBoard(entry, gameId, pairId) {
  return runPublished(function () {
    return listBoard(entry, gameId, pairId);
  });
}

function getGame(entry, gameId) {
  if (inSetup(entry)) {
    var setup = draftMod.getSetupDraftRaw();
    if (!setup) return null;
    var hit = findDraftGame(entry, gameId);
    return hit ? hydrateUiGame(hit) : null;
  }
  var got = repository.getById(gameId);
  if (!got.ok) return null;
  return recordToGame(got.data);
}

function buildInstancePayload(entry, game, existingId) {
  var host = currentHost();
  var snapshot = rec.unwrapGameplaySnapshot(
    cloneRule(
      game.ruleSnapshot ||
        getMyRuleById(game.ruleLibId || game.libId) ||
        findMyRuleByName(game.name) ||
        {}
    )
  );
  var lib = getMyRuleById(game.ruleLibId || game.libId);
  // 深拷贝实例，避免多游戏共享 parties/matchups 引用
  var instance = stripDisplayFields(
    rec.jsonClone(
      Object.assign({}, game, {
        ruleSnapshot: snapshot,
        ruleLibRevision: lib && lib.revision != null ? lib.revision : game.ruleLibRevision
      })
    )
  );
  var participantParties = partiesFromGameInstance(instance);
  var vis = getGlobal(entry).privacy;
  var scope = entryScopeOf(entry);
  var groupId = scope === "group" ? rec.asString(host.groupId) || rec.asString(activeHostQuery.groupId) : "";
  return {
    matchId: matchIdOf(),
    groupId: groupId,
    scope: scope,
    seriesId: rec.asString(host.seriesId),
    roundId: rec.asString(host.roundId),
    ruleId: rec.asString(game.catalogId || (snapshot && snapshot.catalogId) || (snapshot && snapshot.ruleId)),
    ruleSnapshot: rec.mergeRuleSnapshot(
      rec.buildRuleSnapshot(game.catalogId || (snapshot && snapshot.catalogId)),
      snapshot
    ),
    title: rec.asString(game.name),
    participantParties: participantParties,
    config: rec.emptyConfig({
      allowBigPot: getGlobal(entry).potMode === "big-pot" && String(entry) === "score" && !!host.allowBigPot,
      windOn: windOnFor(entry, game),
      instance: instance
    }),
    visibility: vis === "event" || vis === "group" || vis === "public" ? vis : "public",
    hostContext: host,
    idempotencyKey: existingId ? "" : rec.asString(game.id)
  };
}

function stampCreatedHoleOrder(game, host) {
  if (!game || holeOrderUtil.uniqueLabels(game.createdHoleOrder).length) return;
  var fromHost = holeOrderUtil.uniqueLabels(host && host.holeOrder);
  var fromHoles = holeOrderUtil.labelsFromHoles(game.holes);
  var fromOrder = holeOrderUtil.uniqueLabels(game.holeOrder);
  if (fromHost.length) {
    game.createdHoleOrder = fromHost;
    return;
  }
  game.createdHoleOrder = fromHoles.length ? fromHoles : fromOrder;
}

function persistInstance(entry, game, existingId) {
  var blocked = assertWritable();
  if (blocked) return blocked;
  stampCreatedHoleOrder(game, currentHost());
  if (inSetup(entry)) {
    return persistToSetup(entry, game, existingId);
  }
  var host = currentHost();
  var payload = buildInstancePayload(entry, game, existingId);
  if (existingId) {
    var cur = repository.getById(existingId);
    if (!cur.ok) return null;
    var out = repository.update(existingId, cur.data.revision, {
      title: payload.title,
      visibility: payload.visibility,
      participantParties: payload.participantParties,
      config: payload.config,
      ruleSnapshot: rec.mergeRuleSnapshot(
        rec.buildRuleSnapshot(payload.ruleId || game.catalogId),
        rec.unwrapGameplaySnapshot(game.ruleSnapshot || cur.data.ruleSnapshot)
      ),
      idempotencyKey: "upd_" + existingId + "_" + Date.now()
    });
    if (!out.ok) return null;
    repository.refreshResult(existingId, host);
    return getGame(entry, existingId);
  }
  var created = repository.create(payload);
  if (!created.ok) {
    return { __fail: true, reason: created.reason };
  }
  repository.refreshResult(created.data.sideGameId, host);
  return getGame(entry, created.data.sideGameId);
}

function addGame(entry, game) {
  var st = ensureMatchHoleOrder(entry);
  if (game) {
    game.fullHoleOrder = st.full.slice();
    game.holeOrder = st.full.slice();
    if (!holeOrderUtil.uniqueLabels(game.createdHoleOrder).length) {
      game.createdHoleOrder = st.created.slice();
    }
    game.holes = holeOrderUtil.alignHolesToFullOrder(game.holes, st.full);
  }
  var saved = persistInstance(entry, game, "");
  if (saved && saved.__fail) return saved;
  syncPotGameIds(entry);
  syncWindGameIds(entry);
  return saved;
}

function updateGame(entry, gameId, patch) {
  var game = getGame(entry, gameId);
  if (!game) return null;
  Object.assign(game, patch || {});
  var saved = persistInstance(entry, game, gameId);
  return saved && saved.__fail ? null : saved;
}

function getBoardView(entry) {
  const key = String(entry || "score");
  if (!state.boardView) state.boardView = {};
  return state.boardView[key] || null;
}

function setBoardView(entry, gameId, pairId) {
  const key = String(entry || "score");
  if (!state.boardView) state.boardView = {};
  if (!gameId) {
    state.boardView[key] = null;
    return;
  }
  state.boardView[key] = { gameId: String(gameId), pairId: pairId ? String(pairId) : "" };
}

function removeGame(entry, gameId) {
  var blocked = assertWritable();
  if (blocked) return blocked;
  if (inSetup(entry)) {
    var setup = draftMod.getSetupDraftRaw();
    if (!setup) return;
    var id = rec.asString(gameId);
    var nextGames = [];
    (setup.games || []).forEach(function (g) {
      if (rec.asString(g.id) !== id) nextGames.push(g);
    });
    setup.games = nextGames;
    var ai = (setup.added || []).indexOf(id);
    if (ai >= 0) {
      setup.added.splice(ai, 1);
    } else {
      var already = (setup.removed || []).some(function (item) {
        return rec.asString(typeof item === "string" ? item : item && item.id) === id;
      });
      if (!already) {
        setup.removed.push({
          id: id,
          revision: setup.expectedRevisions[id]
        });
      }
      var ui = (setup.updated || []).indexOf(id);
      if (ui >= 0) setup.updated.splice(ui, 1);
    }
    // 与仓库路径一致：删后同步 pot/wind 选中项，避免终态空列表仍残留脏 ids
    syncPotGameIds(entry);
    syncWindGameIds(entry);
    var setupBoard = getBoardView(entry);
    if (setupBoard && String(setupBoard.gameId) === String(gameId)) {
      setBoardView(entry, null);
    }
    if (!listGames(entry).length) setBoardView(entry, null);
    return;
  }
  var got = repository.getById(gameId);
  if (got.ok) {
    repository.remove(gameId, got.data.revision);
  }
  syncPotGameIds(entry);
  syncWindGameIds(entry);
  var saved = getBoardView(entry);
  if (saved && String(saved.gameId) === String(gameId)) {
    setBoardView(entry, null);
  }
  if (!listGames(entry).length) setBoardView(entry, null);
}

function endGame(entry, gameId) {
  if (assertWritable()) return getGame(entry, gameId);
  const game = getGame(entry, gameId);
  if (!game || game.status === "ended") return game;
  refreshGameResults(entry, game);
  game.status = "ended";
  game.endedAt = Date.now();
  return game;
}

function isEndedGame(game) {
  return !!(game && game.status === "ended");
}

function applyRuleToActiveGames() {}

function getGlobal(entry) {
  if (inSetup(entry)) {
    var setup = draftMod.getSetupDraftRaw();
    if (setup) return rec.jsonClone(setup.globalSettings || {});
  }
  return getPublishedGlobal(entry);
}

function setGlobal(entry, patch) {
  var blocked = assertWritable();
  if (blocked) return getPublishedGlobal(entry);
  if (inSetup(entry)) {
    var setup = draftMod.getSetupDraftRaw();
    if (!setup) return getPublishedGlobal(entry);
    setup.globalSettings = Object.assign({}, setup.globalSettings || {}, patch || {});
    var vis = rec.asString(setup.globalSettings.privacy);
    if (vis !== "public" && vis !== "event" && vis !== "group") setup.globalSettings.privacy = "public";
    return rec.jsonClone(setup.globalSettings);
  }
  return settingsStore.set(matchIdOf(), String(entry || "score"), patch || {});
}

function syncPotGameIds(entry) {
  const games = listGames(entry);
  const ids = games.map(function (item) {
    return String(item.id);
  });
  const global = getGlobal(entry);
  const prev = (global.potGameIds || []).map(String);
  let selected = prev.filter(function (id) {
    return ids.indexOf(id) >= 0;
  });
  const lostAllPot = prev.length > 0 && selected.length === 0;
  if (ids.length === 1 && !lostAllPot) selected = [ids[0]];
  if (ids.length === 0) selected = [];
  const same =
    prev.length === selected.length &&
    prev.every(function (id, i) {
      return id === selected[i];
    });
  const patch = {};
  if (!same) patch.potGameIds = selected;
  if (selected.length === 0 && global.potMode && global.potMode !== "none") {
    patch.potMode = "none";
  }
  if (Object.keys(patch).length) setGlobal(entry, patch);
  return selected;
}

function listWindEligibleGames(entry) {
  return listGames(entry).filter(function (game) {
    return catalog.supportsWindBlow(settle.catalogIdOf(game));
  });
}

function syncWindGameIds(entry) {
  const eligible = listWindEligibleGames(entry).map(function (item) {
    return String(item.id);
  });
  const global = getGlobal(entry);
  const prev = (global.windGameIds || []).map(String);
  let selected = prev.filter(function (id) {
    return eligible.indexOf(id) >= 0;
  });
  if (!eligible.length) selected = [];
  const same =
    prev.length === selected.length &&
    prev.every(function (id, i) {
      return id === selected[i];
    });
  if (!same) setGlobal(entry, { windGameIds: selected });
  return selected;
}

function windRuleText(entry) {
  const ids = (getGlobal(entry).windGameIds || []).map(String);
  if (!ids.length) return "未开启";
  if (ids.length === 1) {
    const game = getGame(entry, ids[0]);
    return (game && game.name) || "1个游戏";
  }
  return ids.length + "个游戏";
}

function windOnFor(entry, game) {
  const ids = (getGlobal(entry).windGameIds || []).map(String);
  return ids.indexOf(String(game && game.id)) >= 0;
}

function potRuleText(entry) {
  const g = getGlobal(entry);
  const mode = g.potMode || "none";
  if (mode === "none") return "不捐锅";
  const n = (g.potGameIds || []).length;
  const gameBit = n ? n + "个游戏" : "未选游戏";
  if (mode === "winner-n") return "每洞捐" + (g.potN || "1") + " · 满" + (g.potM || "—") + " · " + gameBit;
  if (mode === "all") return "全捐满" + (g.potAllM || "—") + " · " + gameBit;
  if (mode === "big-pot") return "大锅饭" + (g.potS ? " · " + g.potS : "") + " · " + gameBit;
  return "不捐锅";
}

function createdVocab(entry) {
  var frozen = holeOrderUtil.uniqueLabels(getGlobal(entry).createdHoleOrder);
  if (frozen.length) return frozen;
  var host = currentHost();
  if (host.holeContextReady && host.holeOrder && host.holeOrder.length) {
    return holeOrderUtil.uniqueLabels(host.holeOrder);
  }
  var games = listGames(entry);
  var i;
  for (i = 0; i < games.length; i++) {
    var g = games[i];
    var created = holeOrderUtil.uniqueLabels(g && g.createdHoleOrder);
    if (created.length && !holeOrderUtil.isAbDefaultLabels(created)) return created;
    var holes = holeOrderUtil.labelsFromHoles(g && g.holes);
    if (holes.length && !holeOrderUtil.isAbDefaultLabels(holes)) return holes;
  }
  for (i = 0; i < games.length; i++) {
    created = holeOrderUtil.uniqueLabels(games[i] && games[i].createdHoleOrder);
    if (created.length) return created;
  }
  return [];
}

function mirrorFullHoleOrderToGames(entry, fullIds, createdIds) {
  listGames(entry).forEach(function (game) {
    if (!game) return;
    game.fullHoleOrder = fullIds.slice();
    game.holeOrder = fullIds.slice();
    game.fullHoleOrderRevision = Number(getGlobal(entry).fullHoleOrderRevision) || 0;
    if (!holeOrderUtil.uniqueLabels(game.createdHoleOrder).length && createdIds.length) {
      game.createdHoleOrder = createdIds.slice();
    }
    game.holes = holeOrderUtil.alignHolesToFullOrder(game.holes, fullIds);
    if (inSetup(entry)) {
      var hit = findDraftGame(entry, game.id);
      if (hit) {
        hit.fullHoleOrder = fullIds.slice();
        hit.holeOrder = fullIds.slice();
        if (!holeOrderUtil.uniqueLabels(hit.createdHoleOrder).length && createdIds.length) {
          hit.createdHoleOrder = createdIds.slice();
        }
        hit.holes = holeOrderUtil.alignHolesToFullOrder(hit.holes, fullIds);
        markDraftUpdated(draftMod.getSetupDraftRaw(), hit.id);
      }
    }
  });
}

function ensureMatchHoleOrder(entry) {
  var g = getGlobal(entry);
  var created = holeOrderUtil.uniqueLabels(g.createdHoleOrder);
  if (!created.length) created = createdVocab(entry);
  var full = holeOrderUtil.uniqueLabels(g.fullHoleOrder);
  if (!full.length) full = holeOrderUtil.uniqueLabels(g.holeOrder);
  var migrated = false;
  if (holeOrderUtil.shouldMigrateAbPollution(full, created)) {
    full = holeOrderUtil.migrateAbOrderToCreated(full, created);
    migrated = true;
  }
  if (!full.length) full = created.length ? created.slice() : holeOrderUtil.defaultHoleOrder();
  if (!created.length) created = full.slice();
  var hadFull = holeOrderUtil.uniqueLabels(g.fullHoleOrder).length > 0;
  var hadCreated = holeOrderUtil.uniqueLabels(g.createdHoleOrder).length > 0;
  var rev = Number(g.fullHoleOrderRevision) || 0;
  if (!hadFull || !hadCreated || migrated) {
    if (!rev) rev = 1;
    else if (migrated) rev += 1;
    setGlobal(entry, {
      createdHoleOrder: created,
      fullHoleOrder: full,
      fullHoleOrderRevision: rev,
      holeOrder: full,
      fullHoleOrderMigrated: migrated || !!g.fullHoleOrderMigrated
    });
    mirrorFullHoleOrderToGames(entry, full, created);
  }
  return {
    created: created,
    full: full,
    revision: rev || 1
  };
}

function getFullHoleOrder(entry) {
  var st = ensureMatchHoleOrder(entry);
  var host = currentHost();
  var pars = (host && host.pars) || {};
  return {
    matchId: matchIdOf(),
    revision: st.revision,
    createdHoleOrder: st.created.slice(),
    holes: st.full.map(function (id, i) {
      var orig = st.created.indexOf(id);
      var parN = Number(pars[id]);
      return {
        holeId: id,
        label: id,
        par: parN === 3 || parN === 4 || parN === 5 ? parN : 4,
        courseSection: holeOrderUtil.inferSection(id),
        originalIndex: orig < 0 ? i : orig,
        currentIndex: i
      };
    })
  };
}

function getHoleOrder(entry) {
  return getFullHoleOrder(entry).holes.map(function (h) {
    return h.holeId;
  });
}

function setHoleOrder(entry, order) {
  if (assertWritable()) return getHoleOrder(entry);
  var st = ensureMatchHoleOrder(entry);
  var holeOrder = holeOrderUtil.normalizeHoleOrder(order, st.created.length ? st.created : st.full);
  var rev = (Number(getGlobal(entry).fullHoleOrderRevision) || 1) + 1;
  setGlobal(entry, {
    fullHoleOrder: holeOrder,
    fullHoleOrderRevision: rev,
    holeOrder: holeOrder
  });
  mirrorFullHoleOrderToGames(entry, holeOrder, st.created);
  if (!inSetup(entry)) {
    listGames(entry).forEach(function (game) {
      if (game && game.id) persistInstance(entry, game, game.id);
    });
    refreshActiveGames(entry);
  }
  return holeOrder;
}

function holeLabelsOf(entry, game) {
  return getHoleOrder(entry);
}

function hostKeyForLabel(label, entry, game) {
  var host = currentHost();
  var hostOrder = holeOrderUtil.uniqueLabels(host.holeOrder);
  var s = String(label || "");
  if (hostOrder.indexOf(s) >= 0) return s;
  if (host.pars && Object.prototype.hasOwnProperty.call(host.pars, s)) return s;
  var created = holeOrderUtil.uniqueLabels(
    getGlobal(entry).createdHoleOrder || (game && game.createdHoleOrder)
  );
  var idx = created.indexOf(s);
  if (idx >= 0 && hostOrder[idx]) return hostOrder[idx];
  return s;
}

function listMyRules(maxPlayers) {
  var listed = ruleLibrary.list(maxPlayers);
  return listed.ok && listed.data ? listed.data.items || [] : [];
}

function cloneRule(rule) {
  if (!rule) return null;
  try {
    return JSON.parse(JSON.stringify(rule));
  } catch (e) {
    return Object.assign({}, rule);
  }
}

function getMyRuleById(id) {
  var got = ruleLibrary.getById(id);
  return got.ok ? got.data : null;
}

function findMyRuleByName(name) {
  var got = ruleLibrary.findByName(name);
  return got.ok ? got.data : null;
}

function upsertMyRule(rule) {
  var blocked = assertWritable();
  if (blocked) return null;
  var out = ruleLibrary.upsert(rule || {});
  return out.ok ? out.data : null;
}

function addMyRule(rule) {
  return upsertMyRule(rule);
}

function removeMyRule(id) {
  if (assertWritable()) return;
  ruleLibrary.remove(id);
}

function setDraft(next) {
  state.draft = next;
}

function getDraft() {
  return state.draft;
}

function setPendingUse(rule) {
  state.pendingUse = rule || null;
}

function consumePendingUse() {
  var pending = state.pendingUse;
  state.pendingUse = null;
  return pending;
}

function editRuleUrl(entry, maxPlayers, rule) {
  var bag = Object.assign({}, ctxQuery(), {
    entry: entry,
    maxPlayers: maxPlayers,
    libId: rule.id || "",
    ruleId: rule.catalogId || rule.ruleId || "",
    ruleName: rule.name || "",
    players: rule.players || 4,
    matchPlay: rule.matchPlay ? "1" : "0"
  });
  return "/subpackages/game/pages/edit-rule/index?" + encodeBag(bag);
}

function configUrl(entry, maxPlayers, rule, gameId) {
  var bag = Object.assign({}, ctxQuery(), {
    entry: entry,
    maxPlayers: maxPlayers,
    ruleId: rule.catalogId || rule.ruleId || "",
    libId: rule.id || "",
    ruleName: rule.name || "",
    players: rule.players || 4
  });
  if (gameId) bag.gameId = gameId;
  return "/subpackages/game/pages/config/index?" + encodeBag(bag);
}

function signedText(n) {
  return settle.formatPoints(n);
}

function cellCls(n) {
  return resultTone.resultToneClass(n);
}

function remapEngineByHoleIndex(engine, fromOrder, toOrder) {
  var from = fromOrder || [];
  var to = toOrder || [];
  if (!from.length || !to.length) return engine;
  if (from.join(",") === to.join(",")) return engine;
  var out = {};
  to.forEach(function (glabel, i) {
    out[glabel] = engine[from[i]] || {};
  });
  return out;
}

function remapParsByHoleIndex(pars, fromOrder, toOrder) {
  var from = fromOrder || [];
  var to = toOrder || [];
  var src = pars || {};
  if (!from.length || !to.length || from.join(",") === to.join(",")) return src;
  var fallback = catalog.defaultHolePars();
  var out = {};
  to.forEach(function (glabel, i) {
    var n = Number(src[from[i]]);
    out[glabel] = n === 3 || n === 4 || n === 5 ? n : fallback[glabel] || 4;
  });
  return out;
}

function getScorecard(entry, game) {
  var host = currentHost();
  var labels = getHoleOrder(entry);
  var engine = hostMod.scoresToEngineFormat(host.officialScoresByPartyId, labels);
  if (!engine || !Object.keys(engine).length) {
    engine = hostMod.scoresToEngineFormat(
      host.officialScoresByPartyId,
      holeOrderUtil.uniqueLabels(host.holeOrder)
    );
  }
  var pars = host.pars || {};
  var fallbackPars = catalog.defaultHolePars();
  var absByHole = {};
  var parMap = {};
  labels.forEach(function (glabel) {
    var hostKey = hostKeyForLabel(glabel, entry, game);
    var src = engine[glabel] || engine[hostKey] || {};
    var par = Number(pars[glabel] != null ? pars[glabel] : pars[hostKey]);
    if (!(par === 3 || par === 4 || par === 5)) par = Number(fallbackPars[glabel]) || 4;
    parMap[glabel] = par;
    absByHole[glabel] = src;
  });
  return settle.scoresToRelative(absByHole, parMap, labels);
}

function parsForGame(entry, game) {
  var host = currentHost();
  var hostPars = host.pars && Object.keys(host.pars).length ? host.pars : catalog.defaultHolePars();
  var labels = holeLabelsOf(entry, game);
  var out = {};
  var fallback = catalog.defaultHolePars();
  labels.forEach(function (label) {
    var hostKey = hostKeyForLabel(label, entry, game);
    var n = Number(hostPars[label] != null ? hostPars[label] : hostPars[hostKey]);
    out[label] = n === 3 || n === 4 || n === 5 ? n : fallback[label] || 4;
  });
  return out;
}

function libraryRuleForGame(game) {
  if (!game) return null;
  var id = game.ruleLibId || game.libId;
  if (!id) return null;
  var lib = getMyRuleById(id);
  if (!lib) return null;
  if (game.ruleLibRevision == null || lib.revision == null) return null;
  if (Number(game.ruleLibRevision) !== Number(lib.revision)) return null;
  return rec.unwrapGameplaySnapshot(lib);
}

function persistRowFor(game) {
  if (!game || !game.id) return null;
  try {
    var got = repository.getById(game.id);
    if (got && got.ok) return got.data;
  } catch (e) {}
  return null;
}

function prepareMatch2Game(game) {
  if (!game || settle.catalogIdOf(game) !== "match-2") return game;
  var row = persistRowFor(game);
  var play = rec.pickFirstUsableGameplay(rec.collectMatch2GameplayCandidates(game, row));
  game.ruleSnapshot = rec.mergeRuleSnapshot(
    rec.buildRuleSnapshot(game.catalogId || "match-2"),
    play
  );
  if (settleMatch2MulState(game.ruleSnapshot) === "missing") {
    var lib = libraryRuleForGame(game);
    if (lib) game.ruleSnapshot = rec.mergeRuleSnapshot(game.ruleSnapshot, lib);
  }
  game._match2MulState = settleMatch2MulState(game.ruleSnapshot);
  return game;
}

function settleMatch2MulState(snap) {
  var mode = snap && snap.reward;
  if (mode === "mul") return "mul";
  if (mode === "none") return "none";
  return "missing";
}

function prepareStroke2Game(game) {
  if (!game || settle.catalogIdOf(game) !== "stroke-2") return game;
  var row = persistRowFor(game);
  var play = rec.pickFirstUsableGameplay(rec.collectMatch2GameplayCandidates(game, row));
  game.ruleSnapshot = rec.mergeRuleSnapshot(
    rec.buildRuleSnapshot(game.catalogId || "stroke-2"),
    play
  );
  if (settleStroke2RewardState(game.ruleSnapshot) === "missing") {
    var lib = libraryRuleForGame(game);
    if (lib) game.ruleSnapshot = rec.mergeRuleSnapshot(game.ruleSnapshot, lib);
  }
  var strokeState = settleStroke2RewardState(game.ruleSnapshot);
  if (strokeState === "missing") {
    var intended = intendedStrokeReward(game);
    if (intended === "add" || intended === "mul" || game.ruleLibId) {
      game._stroke2RewardState = "missing";
      return game;
    }
    game.ruleSnapshot = Object.assign({}, game.ruleSnapshot || {}, { reward: "none" });
    strokeState = "none";
  }
  game._stroke2RewardState = strokeState;
  return game;
}

function settleStroke2RewardState(snap) {
  var mode = rec.unwrapGameplaySnapshot(snap || {}).reward;
  if (mode === "mul") return "mul";
  if (mode === "add") return "add";
  if (mode === "none") return "none";
  return "missing";
}

function intendedStrokeReward(game) {
  var list = rec.collectMatch2GameplayCandidates(game, persistRowFor(game));
  var i;
  for (i = 0; i < list.length; i++) {
    var play = rec.unwrapGameplaySnapshot(list[i]);
    if (play.reward === "add" || play.reward === "mul" || play.reward === "none") return play.reward;
  }
  return "";
}

function is8421Catalog(game) {
  var id = settle.catalogIdOf(game);
  return id === "8421-2" || id === "8421-3" || id === "8421-4";
}

function prepare8421Game(game) {
  if (!game || !is8421Catalog(game)) return game;
  var row = persistRowFor(game);
  var play = rec.pickFirstUsableGameplay(rec.collectMatch2GameplayCandidates(game, row));
  game.ruleSnapshot = rec.mergeRuleSnapshot(
    rec.buildRuleSnapshot(game.catalogId || "8421-2"),
    play
  );
  var migrateKept = false;
  game.players = (game.players || []).map(function (p) {
    var hyd = scoreMapUtil.hydratePlayerScore(p);
    var next = Object.assign({}, p, { scoreCode: hyd.scoreCode || p.scoreCode });
    if (!hyd.lossless) migrateKept = true;
    return next;
  });
  if (migrateKept) game._8421MigrateNote = true;
  game._8421MapState = "player-code";
  return game;
}

function stroke2MissingToast(game, writeFail) {
  if (writeFail) return "奖励配置未写入";
  var intended = intendedStrokeReward(game);
  if (intended === "add") return "历史加法奖励配置缺失";
  return "历史乘法奖励配置缺失";
}

function computeResults(entry, game, notify) {
  try {
    prepareMatch2Game(game);
    prepareStroke2Game(game);
    prepare8421Game(game);
    if (game && game._match2MulState === "missing") {
      var writeFail = !isEndedGame(game);
      var missTitle = writeFail
        ? "倍率配置未写入"
        : "该历史比赛未保存倍率配置，无法自动重算";
      try {
        if (typeof console !== "undefined" && console.error) {
          console.error("[match-2] " + (writeFail ? "mul_write_error" : "mul_history_unrecoverable"), {
            gameId: game.id,
            ruleLibId: game.ruleLibId || "",
            sources: rec.describeMatch2MulSources({ game: game, record: persistRowFor(game) })
          });
        }
      } catch (e0) {}
      if (notify !== false) showToast(missTitle);
      var blank = settle.emptyResults(game, holeLabelsOf(entry, game));
      blank.settleVersion = settle.MATCH2_SETTLE_VERSION;
      blank.mulMissing = true;
      blank.mulState = "missing";
      blank.resultSource = writeFail ? "mul_write_error" : "mul_history_unrecoverable";
      return blank;
    }
    if (game && game._stroke2RewardState === "missing") {
      var strokeWriteFail = !isEndedGame(game);
      var strokeTitle = stroke2MissingToast(game, strokeWriteFail);
      try {
        if (typeof console !== "undefined" && console.error) {
          console.error("[stroke-2] " + (strokeWriteFail ? "reward_write_error" : "reward_history_unrecoverable"), {
            gameId: game.id,
            ruleLibId: game.ruleLibId || "",
            sources: rec.describeStroke2RewardSources({ game: game, record: persistRowFor(game) })
          });
        }
      } catch (e1) {}
      if (notify !== false) showToast(strokeTitle);
      var strokeBlank = settle.emptyResults(game, holeLabelsOf(entry, game));
      strokeBlank.settleVersion = settle.STROKE2_SETTLE_VERSION;
      strokeBlank.rewardMissing = true;
      strokeBlank.rewardState = "missing";
      strokeBlank.resultSource = strokeWriteFail ? "reward_write_error" : "reward_history_unrecoverable";
      return strokeBlank;
    }
    return settle.settleGame(game, {
      scores: getScorecard(entry, game),
      holeOrder: holeLabelsOf(entry, game),
      pars: parsForGame(entry, game),
      windOn: windOnFor(entry, game),
      libraryRuleSnapshot: libraryRuleForGame(game)
    });
  } catch (e) {
    return null;
  }
}

function persistLiveResult(game, result) {
  if (!game || !game.id || !result) return;
  if (result.mulMissing || result.rewardMissing) return;
  if (draftMod.getSetupDraftRaw()) return;
  try {
    var got = repository.getById(game.id);
    if (!got.ok || !got.data) return;
    repository.update(game.id, got.data.revision, {
      resultSnapshot: rec.jsonClone(result),
      resultRevision: (got.data.resultRevision || 0) + 1,
      hostRevisionAtSettle: rec.asString(currentHost().revision),
      status: "settled"
    });
  } catch (e) {}
}

function refreshGameResults(entry, game, notify) {
  if (!game) return null;
  if (catalog.isUnavailableRule(game.catalogId || game.ruleId)) return game;
  var match2 = settle.catalogIdOf(game) === "match-2";
  var stroke2 = settle.catalogIdOf(game) === "stroke-2";
  var is8421 = is8421Catalog(game);
  var lasuo4 = settle.catalogIdOf(game) === "lasuo-4";
  var stale =
    (match2 &&
      (!game.holeResults || game.holeResults.settleVersion !== settle.MATCH2_SETTLE_VERSION)) ||
    (stroke2 &&
      (!game.holeResults || game.holeResults.settleVersion !== settle.STROKE2_SETTLE_VERSION)) ||
    (is8421 &&
      (!game.holeResults || game.holeResults.settleVersion !== settle.SETTLE_8421_VERSION)) ||
    (lasuo4 &&
      (!game.holeResults || game.holeResults.settleVersion !== settle.SETTLE_LASUO4_VERSION));
  if (isEndedGame(game) && !stale) return game;
  var prev = game.holeResults;
  var next = computeResults(entry, game, notify);
  if (next && next.byHole) {
    game.holeResults = next;
    persistLiveResult(game, next);
  } else {
    game.holeResults = prev || game.holeResults;
    if (notify !== false) showToast("结算失败，仍显示上次结果");
  }
  return game;
}

function refreshActiveGames(entry) {
  listGames(entry).forEach(function (game) {
    refreshGameResults(entry, game);
  });
}

function holeOn(game, label) {
  const holes = (game && game.holes) || [];
  if (!holes.length) return true;
  return holes.some(function (item) {
    const key = item && item.label != null ? item.label : item;
    return String(key) === String(label) && item && item.on !== false;
  });
}

function addKick(entry, gameId, kick) {
  var blocked = assertWritable();
  if (blocked) return null;
  const game = getGame(entry, gameId);
  if (!game) return null;
  if (!game.kicks) game.kicks = [];
  const labels = holeLabelsOf(entry, game);
  const fromHole = kick && kick.fromHole;
  const fromIndex = labels.indexOf(fromHole);
  const multiplier = Number(kick && kick.multiplier) || 1;
  if (!(multiplier > 1) || fromIndex < 0) return game;
  game.kicks.push({
    id: "k-" + Date.now(),
    fromHole: fromHole,
    fromIndex: fromIndex,
    toIndex: labels.length,
    multiplier: multiplier
  });
  persistInstance(entry, game, gameId);
  return getGame(entry, gameId);
}

function restoreKick(entry, gameId, fromHole) {
  const game = getGame(entry, gameId);
  if (!game) return null;
  const labels = holeLabelsOf(entry, game);
  const start = labels.indexOf(fromHole);
  const H = start < 0 ? 0 : start;
  game.kicks = (game.kicks || [])
    .map(function (kick) {
      const from =
        kick && kick.fromHole != null
          ? labels.indexOf(String(kick.fromHole))
          : Number(kick.fromIndex);
      const to = kick.toIndex == null ? labels.length : Number(kick.toIndex);
      if (!(from >= 0)) return kick;
      if (to <= H) return kick;
      if (from >= H) return null;
      return Object.assign({}, kick, { toIndex: H });
    })
    .filter(Boolean);
  persistInstance(entry, game, gameId);
  return getGame(entry, gameId);
}

function listKickFactors(game, entry) {
  const labels = holeLabelsOf(entry, game);
  return labels.map(function (_label, i) {
    let factor = 1;
    ((game && game.kicks) || []).forEach(function (kick) {
      const start =
        kick && kick.fromHole != null
          ? labels.indexOf(String(kick.fromHole))
          : Number(kick.fromIndex);
      if (!(start >= 0)) return;
      const end = kick.toIndex == null ? labels.length : Number(kick.toIndex);
      if (i < start || i >= end) return;
      factor *= Number(kick.multiplier) || 1;
    });
    return factor;
  });
}

function listScorePlayers(entry) {
  const people = listPlayers(entry);
  const cap = Number(getRuleCap(entry)) || people.length;
  return people.slice(0, Math.max(0, cap)).map(function (person) {
    return {
      id: person.id,
      name: person.name || "",
      avatar: person.avatar || hostMod.officialDefaultAvatar(),
      hcp: person.hcp != null ? String(person.hcp) : ""
    };
  });
}

function ensureScorecard(entry) {
  const key = String(entry || "score");
  if (!state.scorecard) state.scorecard = {};
  if (!state.scorecard[key] || typeof state.scorecard[key] !== "object") {
    state.scorecard[key] = {};
  }
  return state.scorecard[key];
}

function getStroke(entry, holeLabel, playerId) {
  const card = ensureScorecard(entry);
  const hole = card[String(holeLabel)];
  if (!hole) return null;
  const v = hole[String(playerId)];
  if (v == null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function setStroke(entry, holeLabel, playerId, strokes) {
  const card = ensureScorecard(entry);
  const hole = String(holeLabel);
  const pid = String(playerId);
  if (!card[hole]) card[hole] = {};
  if (strokes == null || strokes === "") {
    delete card[hole][pid];
    if (!Object.keys(card[hole]).length) delete card[hole];
    refreshActiveGames(entry);
    return null;
  }
  let n = Number(strokes);
  if (isNaN(n)) {
    delete card[hole][pid];
    if (!Object.keys(card[hole]).length) delete card[hole];
    refreshActiveGames(entry);
    return null;
  }
  n = Math.round(n);
  if (n < -2) n = -2;
  if (n > 7) n = 7;
  card[hole][pid] = n;
  refreshActiveGames(entry);
  return n;
}

function scoreDiffText(n) {
  if (n == null || isNaN(Number(n))) return "";
  const v = Number(n);
  if (v > 0) return "+" + v;
  return String(v);
}

function gameStartHole(game, entry) {
  const labels =
    entry != null
      ? getHoleOrder(entry)
      : holeOrderUtil.uniqueLabels(game && (game.fullHoleOrder || game.holeOrder));
  for (let i = 0; i < labels.length; i++) {
    if (holeOn(game, labels[i])) return String(labels[i]);
  }
  return "";
}

function gameOrderForHole(game, label, entry) {
  const frozen =
    game &&
    game.holeResults &&
    game.holeResults.orderByHole &&
    game.holeResults.orderByHole[label];
  if (frozen && frozen.length) return frozen.map(String);
  if (String(label) === gameStartHole(game, entry)) {
    const order = ((game && game.playerOrder) || []).map(String).filter(Boolean);
    if (order.length) return order;
    return ((game && game.players) || [])
      .map(function (item) {
        return item && item.id != null ? String(item.id) : "";
      })
      .filter(Boolean);
  }
  return null;
}

function rankTriColorForCell(entry, label, playerId) {
  const games = listGames(entry);
  const pid = String(playerId);
  for (let g = 0; g < games.length; g++) {
    const game = games[g];
    const id = settle.catalogIdOf(game);
    if (!catalog.usesRankMark(id)) continue;
    const inGame = ((game && game.players) || []).some(function (item) {
      return String(item.id) === pid;
    });
    if (!inGame) continue;
    if (!holeOn(game, label)) continue;
    const order = gameOrderForHole(game, label, entry);
    if (!order || !order.length) continue;
    const idx = order.indexOf(pid);
    if (idx < 0) continue;
    if (catalog.isLasuoN(id)) {
      return settle.lasuoNTriColor(game, order, pid);
    }
    if (catalog.isHorn(id)) {
      return settle.hornTriColor(game, order, pid);
    }
    return catalog.rankTriColor(
      id,
      order.length,
      game.groupMode,
      idx,
      game.dizhuboMode
    );
  }
  return "";
}

/** 记分页盘面：相对标准杆（-2…+7）；洞序与当前 GAME 全程洞序一致 */
function listScorePad(entry) {
  refreshActiveGames(entry);
  const players = listScorePlayers(entry);
  const labels = getHoleOrder(entry);
  const host = currentHost();
  const holes = labels.map(function (label) {
    const cells = players.map(function (player) {
      const raw = getStroke(entry, label, player.id);
      return {
        playerId: player.id,
        raw: raw,
        text: scoreDiffText(raw),
        cls: raw == null ? "" : raw > 0 ? "over" : raw < 0 ? "under" : "par",
        triColor: rankTriColorForCell(entry, label, player.id)
      };
    });
    const hostKey = hostKeyForLabel(label, entry, null);
    const parN = Number(
      host.pars && (host.pars[label] != null ? host.pars[label] : host.pars[hostKey])
    );
    return {
      label: label,
      par: parN === 3 || parN === 4 || parN === 5 ? parN : catalog.holePar(label),
      cells: cells
    };
  });
  const totals = players.map(function (player, pi) {
    let raw = 0;
    let counted = 0;
    holes.forEach(function (hole) {
      const v = hole.cells[pi].raw;
      if (v != null) {
        raw += v;
        counted += 1;
      }
    });
    return {
      raw: raw,
      counted: counted,
      text: counted ? scoreDiffText(raw) : "",
      cls: !counted ? "" : raw > 0 ? "over" : raw < 0 ? "under" : "par"
    };
  });
  return {
    players: players,
    holes: holes,
    totals: totals
  };
}


function boardViewOf(entry, game, pairId) {
  if (!game || !pairId) return game;
  const pair = ((game.pairings || []).filter(function (item) {
    return item && item.on !== false && item.leftId && item.rightId;
  }).find(function (item) {
    return String(item.id) === String(pairId);
  }));
  if (!pair) return game;
  const players = (game.players || []).filter(function (item) {
    return item.id === pair.leftId || item.id === pair.rightId;
  });
  const view = Object.assign({}, game, {
    pairings: [pair],
    players: players
  });
  prepareMatch2Game(view);
  prepareStroke2Game(view);
  prepare8421Game(view);
  view.holeResults = settle.settleGame(view, {
    scores: getScorecard(entry, view),
    holeOrder: holeLabelsOf(entry, game),
    pars: parsForGame(entry, game),
    windOn: windOnFor(entry, game),
    libraryRuleSnapshot: libraryRuleForGame(view)
  });
  return view;
}

function defaultPairId(game) {
  const hit = catalog.findRule(game && game.catalogId);
  if (!(hit && Number(hit.players) === 2)) return "";
  const pairs = ((game && game.pairings) || []).filter(function (item) {
    return item && item.on !== false && item.leftId && item.rightId;
  });
  if (pairs.length < 2) return "";
  const n = ((game && game.players) || []).length || Number(game && game.playerCount) || 0;
  if (!(n > 0 && n <= 4)) return "";
  return String(pairs[0].id);
}

function listBoard(entry, gameId, pairId) {
  const allGames = listGames(entry);
  const gid = String(gameId || "");
  allGames.forEach(function (game) {
    var focused =
      !gid ||
      gid === "__all__" ||
      gid === "__all_nopot__" ||
      gid === "__pot__" ||
      String(game && game.id) === gid;
    refreshGameResults(entry, game, focused);
  });
  const global = getGlobal(entry);
  const potGameSet = {};
  (global.potGameIds || []).forEach(function (id) {
    potGameSet[String(id)] = true;
  });
  let games;
  if (!gid || gid === "__all__") {
    games = allGames;
  } else if (gid === "__all_nopot__") {
    games = allGames.filter(function (game) {
      return game && !potGameSet[String(game.id)];
    });
  } else if (gid === "__pot__") {
    games = allGames.filter(function (game) {
      return game && potGameSet[String(game.id)];
    });
  } else {
    games = allGames.filter(function (game) {
      return game && game.id === gameId;
    });
  }
  let focusGames = games;
  if (gid && gid !== "__all__" && gid !== "__all_nopot__" && gid !== "__pot__" && pairId && focusGames.length === 1) {
    focusGames = [boardViewOf(entry, focusGames[0], pairId)];
  }
  const isConcreteGameView =
    !!gid &&
    gid !== "__all__" &&
    gid !== "__all_nopot__" &&
    gid !== "__pot__" &&
    focusGames.length === 1;
  const selectedGame = isConcreteGameView ? focusGames[0] : null;
  const selectedTopHoleStates =
    selectedGame
      ? (selectedGame.holeResults && selectedGame.holeResults.topHoleStates) || {}
      : {};
  const players = [];
  const seen = {};
  focusGames.forEach(function (game) {
    var hydrated = hydrateGamePlayers(game);
    hydrated.forEach(function (face) {
      if (seen[face.id]) return;
      seen[face.id] = true;
      players.push({
        id: face.id,
        subjectId: face.subjectId,
        subjectType: face.subjectType,
        name: face.name,
        displayName: face.displayName,
        avatar: face.avatar,
        partyType: face.partyType,
        faceKind: face.faceKind,
        members: face.members,
        memberAvatars: face.memberAvatars,
        memberNames: face.memberNames,
        useSubjectName: !!face.useSubjectName,
        avatarModel: face.avatarModel
      });
    });
  });
const labels = getHoleOrder(entry);
  const potMode = global.potMode || "none";
  const isBigPot = potMode === "big-pot";
  const viewHasPot = focusGames.some(function (game) {
    return potGameSet[String(game.id)];
  });
  const showPot =
    viewHasPot && (potMode === "winner-n" || potMode === "all" || isBigPot);
  const potN = Number(global.potN);
  const potCapRaw = potMode === "all" ? Number(global.potAllM) : Number(global.potM);
  let potRemain = isBigPot
    ? Infinity
    : isFinite(potCapRaw) && potCapRaw > 0
      ? potCapRaw
      : Infinity;
  const potSum = players.map(function () {
    return 0;
  });

  function holePtsOf(game, label, playerId) {
    const frozen =
      game.holeResults &&
      game.holeResults.byHole &&
      game.holeResults.byHole[label];
    if (!frozen || !Object.prototype.hasOwnProperty.call(frozen, String(playerId))) {
      return null;
    }
    const raw = frozen[playerId];
    if (raw == null || raw === "") return null;
    let v = Number(raw);
    if (!isFinite(v)) return null;
    if (holeOn(game, label)) {
      const order = holeLabelsOf(entry, game);
      const factors = listKickFactors(game, entry);
      const ki = order.indexOf(label);
      v *= Number(ki >= 0 ? factors[ki] : 1) || 1;
    }
    return settle.round1(v);
  }

  const holes = labels.map(function (label) {
    const acc = players.map(function () {
      return { raw: 0, inGame: false, played: false };
    });
    const topHoleState = selectedTopHoleStates[label] || "";
    focusGames.forEach(function (game) {
      const ids = [];
      const ledger = {};
      let anyPlayed = false;
      (game.players || []).forEach(function (item) {
        if (!item || item.id == null) return;
        const id = String(item.id);
        const v = holePtsOf(game, label, id);
        if (v == null) return;
        ids.push(id);
        ledger[id] = v;
        anyPlayed = true;
      });
      players.forEach(function (player, pi) {
        const joined = (game.players || []).some(function (item) {
          return String(item.id) === String(player.id);
        });
        if (joined) acc[pi].inGame = true;
      });
      if (!anyPlayed) return;
      let shown = ledger;
      if (showPot && potGameSet[String(game.id)]) {
        const applied = settle.applyHolePot(potMode, potN, potRemain, ledger, ids);
        shown = applied.display;
        if (!isBigPot) potRemain = applied.remaining;
        players.forEach(function (player, pi) {
          const d = Number(applied.donated[String(player.id)]) || 0;
          if (d) potSum[pi] = settle.round1(potSum[pi] + d);
        });
      }
      players.forEach(function (player, pi) {
        const id = String(player.id);
        if (!Object.prototype.hasOwnProperty.call(ledger, id)) return;
        acc[pi].played = true;
        acc[pi].raw = settle.round1(acc[pi].raw + (Number(shown[id]) || 0));
      });
    });
    const cells = acc.map(function (item) {
      const cell = resultFormat.formatBoardCell({
        inGame: item.inGame,
        played: item.played,
        raw: item.raw,
        cls: item.played ? cellCls(item.raw) : ""
      });
      return cell;
    });
    return { label: label, cells: cells, topHoleState: topHoleState };
  });
  const totals = players.map(function (player, pi) {
    let raw = 0;
    let settledCount = 0;
    holes.forEach(function (hole) {
      const cell = hole.cells[pi];
      if (cell && cell.played && cell.status === resultFormat.STATUS_SETTLED) {
        raw = settle.round1(raw + Number(cell.raw));
        settledCount += 1;
      }
    });
    if (!isBigPot) {
      focusGames.forEach(function (game) {
        const joined = (game.players || []).some(function (item) {
          return item.id === player.id;
        });
        if (!joined) return;
        const initial = game.holeResults && game.holeResults.initial;
        if (!initial || !Object.prototype.hasOwnProperty.call(initial, String(player.id))) return;
        const iv = Number(initial[player.id]);
        // 仅非 0 初始分计入（比杆让杆）；全 0 占位不算已结算
        if (!isFinite(iv) || iv === 0) return;
        raw = settle.round1(raw + iv);
        settledCount += 1;
      });
    }
    return resultFormat.formatBoardTotal({
      settledCount: settledCount,
      value: raw,
      cls: settledCount ? cellCls(raw) : ""
    });
  });
  const inPot = players.map(function (player) {
    return focusGames.some(function (game) {
      if (!potGameSet[String(game.id)]) return false;
      return (game.players || []).some(function (item) {
        return String(item.id) === String(player.id);
      });
    });
  });
  let pots;
  if (isBigPot) {
    const money = settle.bigPotMoney(
      totals.map(function (item) {
        return item.raw;
      }),
      inPot,
      global.potS
    );
    pots = money.map(function (raw) {
      if (raw == null) {
        return resultFormat.formatBoardCell({ inGame: false, played: false });
      }
      return {
        text: settle.formatMoney(raw),
        raw: raw,
        cls: cellCls(raw),
        status: resultFormat.STATUS_SETTLED,
        played: true
      };
    });
  } else {
    pots = players.map(function (_player, pi) {
      const raw = potSum[pi] || 0;
      if (!raw) {
        return resultFormat.formatBoardTotal({ settledCount: 0, value: 0 });
      }
      return resultFormat.formatBoardTotal({
        settledCount: 1,
        value: raw,
        cls: cellCls(raw)
      });
    });
  }
  const board = {
    hasGames: allGames.length > 0,
    gameCount: allGames.length,
    players: players,
    holes: holes,
    totals: totals,
    showPot: showPot,
    potRowLabel: isBigPot ? "金额" : "捐锅",
    pots: pots
  };
  return board;
}

module.exports = {
  presentPlayer,
  presentParty,
  presentPerson,
  presentFormationParty,
  buildParticipantSubject,
  hydrateGamePlayers,
  partyFaceKind,
  attachHost,
  ensureHost,
  withHost,
  listPlayers,
  getGroupCount,
  getRuleCap,
  getRuleLibraryCap,
  getRuleDesignCap,
  getScoreFormationContext,
  resolveInstanceCatalog,
  partyFormation,
  listCandidatePlayerIds,
  inspectRuleDesignGate,
  listScoreSlots,
  listGames,
  getGame,
  addGame,
  updateGame,
  removeGame,
  remapPlayerId: function (fromId, toId, profile) {
    return repository.remapPlayerId(matchIdOf(), fromId, toId, profile);
  },
  removeGamesTouchingPlayer: function (playerId) {
    return repository.removeGamesTouchingPlayer(matchIdOf(), playerId);
  },
  applyIdentityDiff: function (diff, extra) {
    var sync = require('./sideGameIdentitySync.js');
    return sync.applyGroupManageDiff(matchIdOf(), diff, extra || {});
  },
  canEditHost: function () {
    return !assertWritable();
  },
  endGame,
  listChatLogs,
  addChatLog,
  addOrderLog,
  orderKey,
  getGlobal,
  setGlobal,
  syncPotGameIds,
  potRuleText,
  syncWindGameIds,
  windRuleText,
  listWindEligibleGames,
  getFullHoleOrder,
  getHoleOrder,
  setHoleOrder,
  syncHoleOrderAfterCourseChange: function (opts) {
    var rebuild = require('./matchHoleOrderRebuild.js');
    return rebuild.syncAfterCourseHalfChange(opts || {});
  },
  listScorePlayers,
  getStroke,
  setStroke,
  listScorePad,
  getScorecard,
  listMyRules,
  addMyRule,
  findMyRuleByName,
  getMyRuleById,
  cloneRule,
  unwrapGameplaySnapshot: rec.unwrapGameplaySnapshot,
  normalizeRewardMode: rec.normalizeRewardMode,
  draftFromLibraryRow: rec.draftFromLibraryRow,
  describeMatch2MulSources: rec.describeMatch2MulSources,
  pickFirstUsableGameplay: rec.pickFirstUsableGameplay,
  upsertMyRule,
  removeMyRule,
  setDraft,
  getDraft,
  ensureSetupDraft,
  requireSetupDraft,
  discardSetupDraft,
  commitSetupDraft,
  inSetup,
  runPublished,
  listRepoGames,
  getPublishedGlobal,
  listPublishedBoard,
  setPendingUse,
  consumePendingUse,
  configUrl,
  editRuleUrl,
  listBoard,
  resultToneClass: resultTone.resultToneClass,
  defaultPairId,
  getBoardView,
  setBoardView,
  addKick,
  restoreKick,
  listKickFactors
};
