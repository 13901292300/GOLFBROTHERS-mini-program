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
    setRegistrationState: setRegistrationState
  };
}

module.exports = {
  createSeriesRegistrationService: createSeriesRegistrationService,
  resolveActorPlayerId: resolveActorPlayerId,
  resolveDomainPlayerId: resolveDomainPlayerId
};
