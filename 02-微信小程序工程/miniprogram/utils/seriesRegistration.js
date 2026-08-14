/**
 * Series 报名领域服务（B1）
 * - 不直连球队目录 mock；归属与权限均依赖注入
 * - 本地 registrationRevision 防陈旧写与重复点击；非跨设备 CAS
 * - 必须使用 upsertSeriesChecked；禁止降级 upsertSeries
 * - 不碰分站 match / fingerprint / ruleVersion / participants / rounds
 */

var seriesIds = require('./seriesIds.js');
var seriesModel = require('./seriesModel.js');

function deepClone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function safeCall(fn, args, unresolvedReason) {
  if (typeof fn !== 'function') {
    return { ok: false, reason: unresolvedReason };
  }
  try {
    return { ok: true, value: fn.apply(null, args || []) };
  } catch (e) {
    return { ok: false, reason: unresolvedReason };
  }
}

/** actor → 领域本人身份；缺失/无法解析 → unresolved */
function resolveActorPlayerId(actor) {
  if (actor == null || typeof actor !== 'object' || Array.isArray(actor)) {
    return { ok: false, reason: 'self_identity_unresolved' };
  }
  var id = asString(actor.playerId) || asString(actor.userId);
  if (!id) return { ok: false, reason: 'self_identity_unresolved' };
  return { ok: true, playerId: id };
}

/** player 载荷 → 领域 playerId（可由 userId 映射，不宣称全局恒等） */
function resolveDomainPlayerId(player) {
  var p = player && typeof player === 'object' ? player : {};
  return asString(p.playerId) || asString(p.userId);
}

function findRegisteredEntry(roster, playerId) {
  var pid = asString(playerId);
  if (!pid) return null;
  var list = Array.isArray(roster) ? roster : [];
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    if (!e) continue;
    if (asString(e.playerId) !== pid) continue;
    if (asString(e.registrationStatus) === 'registered') return e;
  }
  return null;
}

function findEntryByPlayerParticipant(roster, playerId, seriesParticipantId) {
  var pid = asString(playerId);
  var spid = asString(seriesParticipantId);
  if (!pid || !spid) return null;
  var list = Array.isArray(roster) ? roster : [];
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    if (!e) continue;
    if (asString(e.playerId) === pid && asString(e.seriesParticipantId) === spid) {
      return e;
    }
  }
  return null;
}

function participantExists(series, seriesParticipantId) {
  var spid = asString(seriesParticipantId);
  if (!spid) return false;
  var parts = Array.isArray(series && series.participants) ? series.participants : [];
  for (var i = 0; i < parts.length; i++) {
    if (asString(parts[i] && parts[i].seriesParticipantId) === spid) return true;
  }
  return false;
}

function buildPlayerSnapshots(player, actor) {
  var p = player && typeof player === 'object' ? player : {};
  var a = actor && typeof actor === 'object' ? actor : {};
  var playerId = resolveDomainPlayerId(p);
  var name =
    asString(p.playerNameSnapshot) ||
    asString(p.competitionName) ||
    asString(p.name) ||
    asString(a.name);
  var actorId = asString(a.playerId) || asString(a.userId) || playerId;
  return {
    playerId: playerId,
    playerNameSnapshot: name,
    playerAvatarSnapshot: asString(p.playerAvatarSnapshot) || asString(p.avatar),
    genderSnapshot: asString(p.genderSnapshot) || asString(p.gender),
    handicapSnapshot:
      p.handicapSnapshot != null && p.handicapSnapshot !== ''
        ? p.handicapSnapshot
        : p.handicap != null && p.handicap !== ''
          ? p.handicap
          : '',
    floatCoefSnapshot:
      p.floatCoefSnapshot != null && p.floatCoefSnapshot !== ''
        ? p.floatCoefSnapshot
        : p.floatCoef != null && p.floatCoef !== ''
          ? p.floatCoef
          : '',
    phoneSnapshot: asString(p.phoneSnapshot) || asString(p.phone),
    registeredByUserId: actorId,
    registeredByNameSnapshot: asString(a.name) || name
  };
}

/**
 * @param {object} deps
 * @param {object} deps.seriesStore - 必须提供 getSeriesById + upsertSeriesChecked
 * @param {function} deps.resolveEligibleParticipantIds
 * @param {function} deps.canManageRegistration - 报名开关等管理写
 * @param {function} [deps.canRegisterForOther] - 普通代报名能力（与管理权限分离）
 * @param {function} [deps.now]
 */
function createSeriesRegistrationService(deps) {
  var d = deps && typeof deps === 'object' ? deps : {};
  var store = d.seriesStore;
  if (
    !store ||
    typeof store.getSeriesById !== 'function' ||
    typeof store.upsertSeriesChecked !== 'function'
  ) {
    throw new Error('series_registration_checked_store_required');
  }
  var resolveEligible = d.resolveEligibleParticipantIds;
  var canManage = d.canManageRegistration;
  var canRegisterForOtherFn = d.canRegisterForOther;
  var nowFn =
    typeof d.now === 'function'
      ? d.now
      : function () {
          return seriesModel.nowIso();
        };

  function loadSeries(seriesId) {
    var sid = asString(seriesId);
    if (!sid) return { ok: false, reason: 'series_id_required' };
    var series = store.getSeriesById(sid);
    if (!series) return { ok: false, reason: 'series_not_found' };
    return { ok: true, series: seriesModel.normalizeSeries(series) };
  }

  /** 仅 published 可报名域写入；draft → series_not_published；cancelled/archived → lifecycle_readonly */
  function assertLifecycleAllowsMutation(series) {
    var life = asString(series.lifecycleStatus);
    if (life === 'published') return { ok: true };
    if (life === 'cancelled' || life === 'archived') {
      return { ok: false, reason: 'lifecycle_readonly' };
    }
    return { ok: false, reason: 'series_not_published' };
  }

  function assertRegistrationOpen(series) {
    if (asString(series.registrationState) !== 'open') {
      return { ok: false, reason: 'registration_closed' };
    }
    return { ok: true };
  }

  /** 仅 Series 整体 completed 禁止报名域写入；单轮结束不关闭 */
  function assertCompetitionPhaseAllowsSelfMutation(series) {
    if (asString(series.competitionPhaseCache) === 'completed') {
      return { ok: false, reason: 'series_completed' };
    }
    return { ok: true };
  }

  function locateActiveProxyOwnedByActor(roster, input, actorId) {
    var list = Array.isArray(roster) ? roster : [];
    var entryId = asString(input && input.rosterEntryId);
    var playerId = asString(
      input && (input.playerId || input.userId || (input.player && input.player.playerId))
    );
    var found = null;
    var i;
    if (entryId) {
      for (i = 0; i < list.length; i++) {
        if (asString(list[i] && list[i].rosterEntryId) === entryId) {
          found = list[i];
          break;
        }
      }
      if (!found) return { ok: false, reason: 'roster_entry_not_found' };
      if (playerId && asString(found.playerId) !== playerId) {
        return { ok: false, reason: 'player_id_mismatch' };
      }
    } else {
      if (!playerId) return { ok: false, reason: 'player_id_required' };
      for (i = 0; i < list.length; i++) {
        var e = list[i];
        if (!e) continue;
        if (asString(e.playerId) !== playerId) continue;
        if (asString(e.registrationStatus) !== 'registered') continue;
        if (asString(e.registrationSource) !== 'proxy') continue;
        if (asString(e.registeredByUserId) !== actorId) continue;
        found = e;
        break;
      }
      if (!found) {
        var active = findRegisteredEntry(list, playerId);
        if (!active) return { ok: false, reason: 'not_registered' };
        if (asString(active.registrationSource) !== 'proxy') {
          return { ok: false, reason: 'not_proxy' };
        }
        if (asString(active.registeredByUserId) !== actorId) {
          return { ok: false, reason: 'not_registered_by_me' };
        }
        return { ok: false, reason: 'forbidden' };
      }
    }
    if (asString(found.registrationStatus) !== 'registered') {
      return { ok: false, reason: 'not_registered' };
    }
    if (asString(found.registrationSource) !== 'proxy') {
      return { ok: false, reason: 'not_proxy' };
    }
    if (!asString(found.registeredByUserId) || asString(found.registeredByUserId) !== actorId) {
      return { ok: false, reason: 'not_registered_by_me' };
    }
    return { ok: true, entry: found };
  }

  function softCancelRosterEntry(entry, ts) {
    return Object.assign({}, entry, {
      registrationStatus: 'cancelled',
      updatedAt: ts,
      cancelledAt: ts
    });
  }

  /**
   * 调用方 expectedRegistrationRevision：
   * - 已传且与 current 不同 → registration_conflict（不调 resolver、不写）
   * - 未传 → 用刚读取的 currentRevision 继续，写前仍走 checked
   */
  function assertExpectedRevision(series, expectedFromCaller) {
    var currentRevision = seriesModel.normalizeRegistrationRevision(
      series.registrationRevision
    );
    if (expectedFromCaller == null || expectedFromCaller === '') {
      return { ok: true, currentRevision: currentRevision };
    }
    var expN = Number(expectedFromCaller);
    if (!Number.isFinite(expN) || Math.floor(expN) !== expN || expN < 0) {
      return { ok: false, reason: 'expected_revision_invalid' };
    }
    if (Math.floor(expN) !== currentRevision) {
      return {
        ok: false,
        reason: 'registration_conflict',
        currentRevision: currentRevision
      };
    }
    return { ok: true, currentRevision: currentRevision };
  }

  function resolveEligibleIds(series, playerId, actor) {
    var res = safeCall(
      resolveEligible,
      [{ series: series, playerId: playerId, actor: actor }],
      'affiliation_unresolved'
    );
    if (!res.ok) return res;
    var value = res.value;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (value.ok === false) {
        return {
          ok: false,
          reason: asString(value.reason) || 'affiliation_unresolved'
        };
      }
      if (Array.isArray(value.ids)) {
        return {
          ok: true,
          ids: value.ids.map(asString).filter(Boolean)
        };
      }
      if (value.ok === true && Array.isArray(value.value)) {
        return {
          ok: true,
          ids: value.value.map(asString).filter(Boolean)
        };
      }
      return { ok: false, reason: 'affiliation_unresolved' };
    }
    if (!Array.isArray(value)) {
      return { ok: false, reason: 'affiliation_unresolved' };
    }
    return { ok: true, ids: value.map(asString).filter(Boolean) };
  }

  function normalizePermissionResult(res) {
    if (!res.ok) return res;
    var value = res.value;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (value.ok === false) {
        return {
          ok: false,
          reason: asString(value.reason) || 'permission_unresolved'
        };
      }
      if (typeof value.allowed === 'boolean') {
        return value.allowed
          ? { ok: true }
          : { ok: false, reason: 'permission_denied' };
      }
      return { ok: false, reason: 'permission_unresolved' };
    }
    if (value === true) return { ok: true };
    if (value === false) return { ok: false, reason: 'permission_denied' };
    return { ok: false, reason: 'permission_unresolved' };
  }

  function resolveManagePermission(series, actor) {
    return normalizePermissionResult(
      safeCall(
        canManage,
        [{ series: series, actor: actor }],
        'permission_unresolved'
      )
    );
  }

  /** 普通代报名：独立 resolver，不得回落 canManageRegistration */
  function resolveRegisterForOtherPermission(series, actor) {
    if (typeof canRegisterForOtherFn !== 'function') {
      return { ok: false, reason: 'permission_unresolved' };
    }
    return normalizePermissionResult(
      safeCall(
        canRegisterForOtherFn,
        [{ series: series, actor: actor }],
        'permission_unresolved'
      )
    );
  }

  function registerSelf(input) {
    var src = input && typeof input === 'object' ? input : {};
    var loaded = loadSeries(src.seriesId);
    if (!loaded.ok) return loaded;
    var series = loaded.series;

    var lifeGate = assertLifecycleAllowsMutation(series);
    if (!lifeGate.ok) return lifeGate;
    var phaseGate = assertCompetitionPhaseAllowsSelfMutation(series);
    if (!phaseGate.ok) return phaseGate;

    var revGate = assertExpectedRevision(series, src.expectedRegistrationRevision);
    if (!revGate.ok) return revGate;
    var currentRevision = revGate.currentRevision;

    var actorId = resolveActorPlayerId(src.actor);
    if (!actorId.ok) return actorId;
    var snaps = buildPlayerSnapshots(src.player, src.actor);
    var playerId = snaps.playerId;
    if (!playerId) return { ok: false, reason: 'player_id_required' };
    if (actorId.playerId !== playerId) {
      return { ok: false, reason: 'self_identity_mismatch' };
    }

    var openGate = assertRegistrationOpen(series);
    if (!openGate.ok) return openGate;

    var targetPid = asString(src.seriesParticipantId);
    if (!targetPid) return { ok: false, reason: 'participant_id_required' };
    if (!participantExists(series, targetPid)) {
      return { ok: false, reason: 'participant_not_found' };
    }

    var eligible = resolveEligibleIds(series, playerId, src.actor);
    if (!eligible.ok) return eligible;
    var allowed = false;
    for (var ei = 0; ei < eligible.ids.length; ei++) {
      if (eligible.ids[ei] === targetPid) {
        allowed = true;
        break;
      }
    }
    if (!allowed) {
      return {
        ok: false,
        reason: eligible.ids.length ? 'affiliation_denied' : 'affiliation_unresolved'
      };
    }

    var roster = Array.isArray(series.roster) ? series.roster.slice() : [];
    var active = findRegisteredEntry(roster, playerId);
    if (active) {
      if (asString(active.seriesParticipantId) === targetPid) {
        return {
          ok: true,
          idempotent: true,
          series: series,
          reason: 'already_registered'
        };
      }
      return { ok: false, reason: 'already_registered_elsewhere' };
    }

    var ts = nowFn();
    var existingSame = findEntryByPlayerParticipant(roster, playerId, targetPid);
    var nextRoster;
    if (existingSame) {
      nextRoster = roster.map(function (e) {
        if (
          e !== existingSame &&
          asString(e.rosterEntryId) !== asString(existingSame.rosterEntryId)
        ) {
          return e;
        }
        return Object.assign({}, e, {
          playerNameSnapshot: snaps.playerNameSnapshot || e.playerNameSnapshot,
          playerAvatarSnapshot: snaps.playerAvatarSnapshot || e.playerAvatarSnapshot,
          genderSnapshot: snaps.genderSnapshot || e.genderSnapshot,
          handicapSnapshot:
            snaps.handicapSnapshot !== '' ? snaps.handicapSnapshot : e.handicapSnapshot,
          floatCoefSnapshot:
            snaps.floatCoefSnapshot !== '' ? snaps.floatCoefSnapshot : e.floatCoefSnapshot,
          phoneSnapshot: snaps.phoneSnapshot !== '' ? snaps.phoneSnapshot : e.phoneSnapshot,
          registrationStatus: 'registered',
          registrationSource: 'self',
          registeredByUserId: snaps.registeredByUserId,
          registeredByNameSnapshot: snaps.registeredByNameSnapshot,
          updatedAt: ts,
          cancelledAt: ''
        });
      });
    } else {
      var entry = seriesModel.normalizeRosterEntry(
        {
          rosterEntryId: seriesIds.generateRosterEntryId(),
          seriesId: series.seriesId,
          seriesParticipantId: targetPid,
          playerId: playerId,
          playerNameSnapshot: snaps.playerNameSnapshot,
          playerAvatarSnapshot: snaps.playerAvatarSnapshot,
          genderSnapshot: snaps.genderSnapshot,
          handicapSnapshot: snaps.handicapSnapshot,
          floatCoefSnapshot: snaps.floatCoefSnapshot,
          phoneSnapshot: snaps.phoneSnapshot,
          registrationStatus: 'registered',
          registrationSource: 'self',
          registeredByUserId: snaps.registeredByUserId,
          registeredByNameSnapshot: snaps.registeredByNameSnapshot,
          createdAt: ts,
          updatedAt: ts,
          cancelledAt: ''
        },
        series.seriesId
      );
      nextRoster = roster.concat([entry]);
    }

    var next = deepClone(series);
    next.roster = nextRoster;
    next.registrationRevision = currentRevision + 1;
    var wrote = store.upsertSeriesChecked(next, currentRevision);
    if (!wrote.ok) {
      return {
        ok: false,
        reason: wrote.reason || 'storage_write_failed',
        currentRevision: wrote.currentRevision
      };
    }
    return {
      ok: true,
      idempotent: false,
      series: wrote.series,
      reason: existingSame ? 'restored' : 'registered'
    };
  }

  /**
   * 替他人报名（普通 common 能力）：只写 Series.roster，不写任何 managed 分站。
   * 权限走 canRegisterForOther，不要求 Series 管理身份；不要求 roundId/matchId。
   * 与本人报名一致：须 registrationState==='open'；closed → registration_closed。
   */
  function registerForOther(input) {
    var src = input && typeof input === 'object' ? input : {};
    var loaded = loadSeries(src.seriesId);
    if (!loaded.ok) return loaded;
    var series = loaded.series;

    var lifeGate = assertLifecycleAllowsMutation(series);
    if (!lifeGate.ok) return lifeGate;

    var revGate = assertExpectedRevision(series, src.expectedRegistrationRevision);
    if (!revGate.ok) return revGate;
    var currentRevision = revGate.currentRevision;

    var actorId = resolveActorPlayerId(src.actor);
    if (!actorId.ok) return actorId;

    var perm = resolveRegisterForOtherPermission(series, src.actor);
    if (!perm.ok) return perm;

    var phaseGate = assertCompetitionPhaseAllowsSelfMutation(series);
    if (!phaseGate.ok) return phaseGate;

    var openGate = assertRegistrationOpen(series);
    if (!openGate.ok) return openGate;

    var snaps = buildPlayerSnapshots(src.player, src.actor);
    var playerId = snaps.playerId;
    if (!playerId) return { ok: false, reason: 'player_id_required' };
    // 代报名：目标必须与操作者不同（本人请走 registerSelf）
    if (actorId.playerId === playerId) {
      return { ok: false, reason: 'proxy_target_is_self' };
    }

    var targetPid = asString(src.seriesParticipantId);
    if (!targetPid) return { ok: false, reason: 'participant_id_required' };
    if (!participantExists(series, targetPid)) {
      return { ok: false, reason: 'participant_not_found' };
    }

    var roster = Array.isArray(series.roster) ? series.roster.slice() : [];
    var active = findRegisteredEntry(roster, playerId);
    if (active) {
      if (asString(active.seriesParticipantId) === targetPid) {
        return {
          ok: true,
          idempotent: true,
          series: series,
          reason: 'already_registered'
        };
      }
      return { ok: false, reason: 'already_registered_elsewhere' };
    }

    var ts = nowFn();
    var existingSame = findEntryByPlayerParticipant(roster, playerId, targetPid);
    var nextRoster;
    if (existingSame) {
      nextRoster = roster.map(function (e) {
        if (
          e !== existingSame &&
          asString(e.rosterEntryId) !== asString(existingSame.rosterEntryId)
        ) {
          return e;
        }
        return Object.assign({}, e, {
          playerNameSnapshot: snaps.playerNameSnapshot || e.playerNameSnapshot,
          playerAvatarSnapshot: snaps.playerAvatarSnapshot || e.playerAvatarSnapshot,
          genderSnapshot: snaps.genderSnapshot || e.genderSnapshot,
          handicapSnapshot:
            snaps.handicapSnapshot !== '' ? snaps.handicapSnapshot : e.handicapSnapshot,
          floatCoefSnapshot:
            snaps.floatCoefSnapshot !== '' ? snaps.floatCoefSnapshot : e.floatCoefSnapshot,
          phoneSnapshot: snaps.phoneSnapshot !== '' ? snaps.phoneSnapshot : e.phoneSnapshot,
          registrationStatus: 'registered',
          registrationSource: 'proxy',
          registeredByUserId: actorId.playerId,
          registeredByNameSnapshot: asString(src.actor && src.actor.name) || snaps.registeredByNameSnapshot,
          updatedAt: ts,
          cancelledAt: ''
        });
      });
    } else {
      var entry = seriesModel.normalizeRosterEntry(
        {
          rosterEntryId: seriesIds.generateRosterEntryId(),
          seriesId: series.seriesId,
          seriesParticipantId: targetPid,
          playerId: playerId,
          playerNameSnapshot: snaps.playerNameSnapshot,
          playerAvatarSnapshot: snaps.playerAvatarSnapshot,
          genderSnapshot: snaps.genderSnapshot,
          handicapSnapshot: snaps.handicapSnapshot,
          floatCoefSnapshot: snaps.floatCoefSnapshot,
          phoneSnapshot: snaps.phoneSnapshot,
          registrationStatus: 'registered',
          registrationSource: 'proxy',
          registeredByUserId: actorId.playerId,
          registeredByNameSnapshot:
            asString(src.actor && src.actor.name) || snaps.registeredByNameSnapshot,
          createdAt: ts,
          updatedAt: ts,
          cancelledAt: ''
        },
        series.seriesId
      );
      nextRoster = roster.concat([entry]);
    }

    var next = deepClone(series);
    next.roster = nextRoster;
    next.registrationRevision = currentRevision + 1;
    var wrote = store.upsertSeriesChecked(next, currentRevision);
    if (!wrote.ok) {
      return {
        ok: false,
        reason: wrote.reason || 'storage_write_failed',
        currentRevision: wrote.currentRevision
      };
    }
    return {
      ok: true,
      idempotent: false,
      series: wrote.series,
      reason: existingSame ? 'restored' : 'registered_proxy'
    };
  }

  function cancelSelfRegistration(input) {
    var src = input && typeof input === 'object' ? input : {};
    var loaded = loadSeries(src.seriesId);
    if (!loaded.ok) return loaded;
    var series = loaded.series;

    var lifeGate = assertLifecycleAllowsMutation(series);
    if (!lifeGate.ok) return lifeGate;
    var phaseGate = assertCompetitionPhaseAllowsSelfMutation(series);
    if (!phaseGate.ok) return phaseGate;

    var revGate = assertExpectedRevision(series, src.expectedRegistrationRevision);
    if (!revGate.ok) return revGate;
    var currentRevision = revGate.currentRevision;

    var actorId = resolveActorPlayerId(src.actor);
    if (!actorId.ok) return actorId;
    var playerId = asString(src.playerId);
    if (!playerId) return { ok: false, reason: 'player_id_required' };
    if (actorId.playerId !== playerId) {
      return { ok: false, reason: 'self_identity_mismatch' };
    }

    var openGate = assertRegistrationOpen(series);
    if (!openGate.ok) return openGate;

    var roster = Array.isArray(series.roster) ? series.roster : [];
    var active = findRegisteredEntry(roster, playerId);
    if (!active) {
      return {
        ok: true,
        idempotent: true,
        series: series,
        reason: 'already_cancelled'
      };
    }

    var ts = nowFn();
    var nextRoster = roster.map(function (e) {
      if (asString(e.rosterEntryId) !== asString(active.rosterEntryId)) return e;
      return Object.assign({}, e, {
        registrationStatus: 'cancelled',
        updatedAt: ts,
        cancelledAt: ts
      });
    });

    var next = deepClone(series);
    next.roster = nextRoster;
    next.registrationRevision = currentRevision + 1;
    var wrote = store.upsertSeriesChecked(next, currentRevision);
    if (!wrote.ok) {
      return {
        ok: false,
        reason: wrote.reason || 'storage_write_failed',
        currentRevision: wrote.currentRevision
      };
    }
    return {
      ok: true,
      idempotent: false,
      series: wrote.series,
      reason: 'cancelled'
    };
  }

  function cancelRegistrationForOther(input) {
    var src = input && typeof input === 'object' ? input : {};
    var loaded = loadSeries(src.seriesId);
    if (!loaded.ok) return loaded;
    var series = loaded.series;

    var lifeGate = assertLifecycleAllowsMutation(series);
    if (!lifeGate.ok) return lifeGate;
    var phaseGate = assertCompetitionPhaseAllowsSelfMutation(series);
    if (!phaseGate.ok) return phaseGate;

    var revGate = assertExpectedRevision(series, src.expectedRegistrationRevision);
    if (!revGate.ok) return revGate;
    var currentRevision = revGate.currentRevision;

    var actorId = resolveActorPlayerId(src.actor);
    if (!actorId.ok) return actorId;

    var perm = resolveRegisterForOtherPermission(series, src.actor);
    if (!perm.ok) return perm;

    var openGate = assertRegistrationOpen(series);
    if (!openGate.ok) return openGate;

    var located = locateActiveProxyOwnedByActor(
      series.roster,
      src,
      actorId.playerId
    );
    if (!located.ok) return located;

    var ts = nowFn();
    var nextRoster = (Array.isArray(series.roster) ? series.roster : []).map(function (e) {
      if (asString(e && e.rosterEntryId) !== asString(located.entry.rosterEntryId)) {
        return e;
      }
      return softCancelRosterEntry(e, ts);
    });

    var next = deepClone(series);
    next.roster = nextRoster;
    next.registrationRevision = currentRevision + 1;
    var wrote = store.upsertSeriesChecked(next, currentRevision);
    if (!wrote.ok) {
      return {
        ok: false,
        reason: wrote.reason || 'storage_write_failed',
        currentRevision: wrote.currentRevision
      };
    }
    return {
      ok: true,
      idempotent: false,
      series: wrote.series,
      reason: 'cancelled_proxy'
    };
  }

  function applyProxyAddOntoRoster(roster, series, player, actor, targetPid, ts) {
    var snaps = buildPlayerSnapshots(player, actor);
    var playerId = snaps.playerId;
    if (!playerId) return { ok: false, reason: 'player_id_required' };
    var actorPid = resolveActorPlayerId(actor);
    if (!actorPid.ok) return actorPid;
    if (actorPid.playerId === playerId) {
      return { ok: false, reason: 'proxy_target_is_self' };
    }
    if (!targetPid) return { ok: false, reason: 'participant_id_required' };
    if (!participantExists(series, targetPid)) {
      return { ok: false, reason: 'participant_not_found' };
    }

    var active = findRegisteredEntry(roster, playerId);
    if (active) {
      if (asString(active.seriesParticipantId) === targetPid) {
        return { ok: true, changed: false, reason: 'already_registered', roster: roster };
      }
      return { ok: false, reason: 'already_registered_elsewhere' };
    }

    var existingSame = findEntryByPlayerParticipant(roster, playerId, targetPid);
    var nextRoster;
    if (existingSame) {
      nextRoster = roster.map(function (e) {
        if (
          e !== existingSame &&
          asString(e.rosterEntryId) !== asString(existingSame.rosterEntryId)
        ) {
          return e;
        }
        return Object.assign({}, e, {
          playerNameSnapshot: snaps.playerNameSnapshot || e.playerNameSnapshot,
          playerAvatarSnapshot: snaps.playerAvatarSnapshot || e.playerAvatarSnapshot,
          genderSnapshot: snaps.genderSnapshot || e.genderSnapshot,
          handicapSnapshot:
            snaps.handicapSnapshot !== '' ? snaps.handicapSnapshot : e.handicapSnapshot,
          floatCoefSnapshot:
            snaps.floatCoefSnapshot !== '' ? snaps.floatCoefSnapshot : e.floatCoefSnapshot,
          phoneSnapshot: snaps.phoneSnapshot !== '' ? snaps.phoneSnapshot : e.phoneSnapshot,
          registrationStatus: 'registered',
          registrationSource: 'proxy',
          registeredByUserId: actorPid.playerId,
          registeredByNameSnapshot:
            asString(actor && actor.name) || snaps.registeredByNameSnapshot,
          updatedAt: ts,
          cancelledAt: ''
        });
      });
    } else {
      var entry = seriesModel.normalizeRosterEntry(
        {
          rosterEntryId: seriesIds.generateRosterEntryId(),
          seriesId: series.seriesId,
          seriesParticipantId: targetPid,
          playerId: playerId,
          playerNameSnapshot: snaps.playerNameSnapshot,
          playerAvatarSnapshot: snaps.playerAvatarSnapshot,
          genderSnapshot: snaps.genderSnapshot,
          handicapSnapshot: snaps.handicapSnapshot,
          floatCoefSnapshot: snaps.floatCoefSnapshot,
          phoneSnapshot: snaps.phoneSnapshot,
          registrationStatus: 'registered',
          registrationSource: 'proxy',
          registeredByUserId: actorPid.playerId,
          registeredByNameSnapshot:
            asString(actor && actor.name) || snaps.registeredByNameSnapshot,
          createdAt: ts,
          updatedAt: ts,
          cancelledAt: ''
        },
        series.seriesId
      );
      nextRoster = roster.concat([entry]);
    }
    return { ok: true, changed: true, reason: existingSame ? 'restored' : 'registered_proxy', roster: nextRoster };
  }

  /**
   * 单次 checked upsert 的代报名增删计划，避免新增成功、取消失败的半写。
   */
  function applyProxyCommitPlan(input) {
    var src = input && typeof input === 'object' ? input : {};
    var loaded = loadSeries(src.seriesId);
    if (!loaded.ok) return loaded;
    var series = loaded.series;

    var lifeGate = assertLifecycleAllowsMutation(series);
    if (!lifeGate.ok) return lifeGate;
    var phaseGate = assertCompetitionPhaseAllowsSelfMutation(series);
    if (!phaseGate.ok) return phaseGate;

    var revGate = assertExpectedRevision(series, src.expectedRegistrationRevision);
    if (!revGate.ok) return revGate;
    var currentRevision = revGate.currentRevision;

    var actorId = resolveActorPlayerId(src.actor);
    if (!actorId.ok) return actorId;

    var perm = resolveRegisterForOtherPermission(series, src.actor);
    if (!perm.ok) return perm;

    var openGate = assertRegistrationOpen(series);
    if (!openGate.ok) return openGate;

    var removals = Array.isArray(src.removals) ? src.removals : [];
    var additions = Array.isArray(src.additions) ? src.additions : [];
    var defaultPid = asString(src.seriesParticipantId);
    var roster = Array.isArray(series.roster) ? series.roster.slice() : [];
    var removeIds = Object.create(null);
    var i;

    for (i = 0; i < removals.length; i++) {
      var located = locateActiveProxyOwnedByActor(roster, removals[i], actorId.playerId);
      if (!located.ok) return located;
      var rid = asString(located.entry.rosterEntryId);
      if (removeIds[rid]) continue;
      removeIds[rid] = located.entry;
    }

    var addJobs = [];
    for (i = 0; i < additions.length; i++) {
      var rawAdd = additions[i] && typeof additions[i] === 'object' ? additions[i] : {};
      var player = rawAdd.player && typeof rawAdd.player === 'object' ? rawAdd.player : rawAdd;
      var targetPid = asString(rawAdd.seriesParticipantId) || defaultPid;
      var previewId = resolveDomainPlayerId(player);
      if (!previewId) continue;
      addJobs.push({ player: player, seriesParticipantId: targetPid });
    }

    if (!Object.keys(removeIds).length && !addJobs.length) {
      return {
        ok: true,
        idempotent: true,
        series: series,
        reason: 'no_change',
        addedCount: 0,
        removedCount: 0
      };
    }

    var ts = nowFn();
    var nextRoster = roster.map(function (e) {
      if (!e) return e;
      if (!removeIds[asString(e.rosterEntryId)]) return e;
      return softCancelRosterEntry(e, ts);
    });
    var removedCount = Object.keys(removeIds).length;
    var addedCount = 0;

    for (i = 0; i < addJobs.length; i++) {
      var job = addJobs[i];
      var applied = applyProxyAddOntoRoster(
        nextRoster,
        series,
        job.player,
        src.actor,
        job.seriesParticipantId,
        ts
      );
      if (!applied.ok) return applied;
      nextRoster = applied.roster;
      if (applied.changed) addedCount += 1;
    }

    if (!removedCount && !addedCount) {
      return {
        ok: true,
        idempotent: true,
        series: series,
        reason: 'no_change',
        addedCount: 0,
        removedCount: 0
      };
    }

    var next = deepClone(series);
    next.roster = nextRoster;
    next.registrationRevision = currentRevision + 1;
    var wrote = store.upsertSeriesChecked(next, currentRevision);
    if (!wrote.ok) {
      return {
        ok: false,
        reason: wrote.reason || 'storage_write_failed',
        currentRevision: wrote.currentRevision
      };
    }
    return {
      ok: true,
      idempotent: false,
      series: wrote.series,
      reason: 'proxy_updated',
      addedCount: addedCount,
      removedCount: removedCount
    };
  }

  /**
   * 只读预演：克隆 Series 到临时 store，复用同一权限/资格 resolver，不写外部 store。
   */
  function previewProxyCommitPlan(input) {
    var src = input && typeof input === 'object' ? input : {};
    var loaded = loadSeries(src.seriesId);
    if (!loaded.ok) return loaded;
    var sid = asString(loaded.series.seriesId);
    var bag = Object.create(null);
    bag[sid] = deepClone(loaded.series);
    var previewStore = {
      getSeriesById: function (id) {
        var key = asString(id);
        return bag[key] ? deepClone(bag[key]) : null;
      },
      upsertSeriesChecked: function (next, expected) {
        var key = asString(next && next.seriesId);
        var cur = bag[key];
        var curRev = cur ? Number(cur.registrationRevision) || 0 : 0;
        if (cur && Number(expected) !== curRev) {
          return {
            ok: false,
            reason: 'registration_conflict',
            currentRevision: curRev
          };
        }
        bag[key] = deepClone(next);
        return { ok: true, series: deepClone(next) };
      }
    };
    var previewSvc = createSeriesRegistrationService({
      seriesStore: previewStore,
      resolveEligibleParticipantIds: resolveEligible,
      canManageRegistration: canManage,
      canRegisterForOther: canRegisterForOtherFn,
      now: nowFn
    });
    return previewSvc.applyProxyCommitPlan(src);
  }

  function setRegistrationState(input) {
    var src = input && typeof input === 'object' ? input : {};
    var loaded = loadSeries(src.seriesId);
    if (!loaded.ok) return loaded;
    var series = loaded.series;

    var lifeGate = assertLifecycleAllowsMutation(series);
    if (!lifeGate.ok) return lifeGate;

    var revGate = assertExpectedRevision(series, src.expectedRegistrationRevision);
    if (!revGate.ok) return revGate;
    var currentRevision = revGate.currentRevision;

    var state = asString(src.state);
    if (state !== 'open' && state !== 'closed') {
      return { ok: false, reason: 'registration_state_invalid' };
    }

    var perm = resolveManagePermission(series, src.actor);
    if (!perm.ok) return perm;

    if (asString(series.registrationState) === state) {
      return {
        ok: true,
        idempotent: true,
        series: series,
        reason: 'state_unchanged'
      };
    }

    var next = deepClone(series);
    next.registrationState = state;
    next.registrationRevision = currentRevision + 1;
    var wrote = store.upsertSeriesChecked(next, currentRevision);
    if (!wrote.ok) {
      return {
        ok: false,
        reason: wrote.reason || 'storage_write_failed',
        currentRevision: wrote.currentRevision
      };
    }
    return {
      ok: true,
      idempotent: false,
      series: wrote.series,
      reason: state === 'open' ? 'opened' : 'closed'
    };
  }

  return {
    registerSelf: registerSelf,
    registerForOther: registerForOther,
    cancelSelfRegistration: cancelSelfRegistration,
    cancelRegistrationForOther: cancelRegistrationForOther,
    applyProxyCommitPlan: applyProxyCommitPlan,
    previewProxyCommitPlan: previewProxyCommitPlan,
    setRegistrationState: setRegistrationState
  };
}

module.exports = {
  createSeriesRegistrationService: createSeriesRegistrationService,
  resolveActorPlayerId: resolveActorPlayerId,
  resolveDomainPlayerId: resolveDomainPlayerId
};
