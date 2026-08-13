/**
 * Series 本轮分组球员收费（paymentByUserId）
 * - 名单：正式 groups 非空席位按稳定 ID 去重；roster 只读富化，不得决定是否入榜
 * - 落盘：match.paymentByUserId + paymentLogs；禁止写 registerInfo / groups / roster
 * - UI：投影为与 registration 相同的 payment UI ViewModel（模板不感知 dataMode）
 */

var paymentManage = require('./paymentManage.js');

var DATA_MODE_REGISTRATION = 'registration';
var DATA_MODE_GROUPED_PLAYERS = 'grouped_players';
var EMPTY_TEXT = '本轮尚未分组，暂无收费人员';
var FALLBACK_NAME = '球员';

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value == null ? null : value));
  } catch (e) {
    return value;
  }
}

function asId(v) {
  return v == null ? '' : String(v).trim();
}

function asText(v) {
  return v == null ? '' : String(v).trim();
}

/**
 * 稳定席位 ID：playerId || userId || id；三者皆空 → 空席位
 */
function resolveSeatPlayerId(seat) {
  if (seat == null) return '';
  if (typeof seat === 'string' || typeof seat === 'number') {
    return asId(seat);
  }
  if (typeof seat !== 'object') return '';
  return asId(seat.playerId || seat.userId || seat.id);
}

function resolveSeatName(seat) {
  if (!seat || typeof seat !== 'object') return '';
  return asText(
    seat.displayName ||
      seat.name ||
      seat.nickname ||
      seat.nickName ||
      seat.matchNickname ||
      seat.competitionName ||
      seat.nameSnapshot ||
      seat.playerNameSnapshot ||
      ''
  );
}

function resolveSeatAvatar(seat) {
  if (!seat || typeof seat !== 'object') return '';
  return asText(seat.avatar || seat.avatarUrl || seat.playerAvatarSnapshot || '');
}

function ensurePaymentByUserId(match) {
  if (!match || typeof match !== 'object') return {};
  if (
    !match.paymentByUserId ||
    typeof match.paymentByUserId !== 'object' ||
    Array.isArray(match.paymentByUserId)
  ) {
    match.paymentByUserId = {};
  }
  return match.paymentByUserId;
}

function normalizePaymentByUserIdMap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  var out = {};
  Object.keys(raw).forEach(function (key) {
    var id = asId(key);
    var rec = raw[key];
    if (!id || !rec || typeof rec !== 'object') return;
    var confirmed = rec.paymentConfirmed === true;
    var amount = confirmed
      ? paymentManage.toAmount(
          rec.paidAmount != null ? rec.paidAmount : rec.cashPaidAmount
        )
      : '';
    out[id] = {
      playerId: asId(rec.playerId) || id,
      paymentConfirmed: confirmed,
      paidAmount: amount,
      cashPaidAmount: amount,
      paymentRemark: rec.paymentRemark != null ? String(rec.paymentRemark) : '',
      updatedAt: Number(rec.updatedAt) || 0,
      updatedBy: asId(rec.updatedBy)
    };
  });
  return out;
}

function snapshotRecord(rec) {
  var r = rec && typeof rec === 'object' ? rec : {};
  var confirmed = r.paymentConfirmed === true;
  var amount = confirmed
    ? paymentManage.toAmount(
        r.paidAmount != null ? r.paidAmount : r.cashPaidAmount
      )
    : '';
  return {
    paymentConfirmed: confirmed,
    paidAmount: amount,
    cashPaidAmount: amount,
    paymentRemark: r.paymentRemark != null ? String(r.paymentRemark) : ''
  };
}

function indexRosterSnapshot(rosterSnapshot) {
  var map = {};
  (Array.isArray(rosterSnapshot) ? rosterSnapshot : []).forEach(function (entry) {
    if (!entry || typeof entry !== 'object') return;
    var keys = [entry.playerId, entry.userId, entry.id, entry.rosterEntryId];
    for (var i = 0; i < keys.length; i++) {
      var key = asId(keys[i]);
      if (key && !map[key]) map[key] = entry;
    }
  });
  return map;
}

function resolveRosterName(entry) {
  if (!entry || typeof entry !== 'object') return '';
  return asText(
    entry.displayName ||
      entry.name ||
      entry.nickname ||
      entry.nickName ||
      entry.playerNameSnapshot ||
      entry.matchNickname ||
      entry.competitionName ||
      ''
  );
}

function resolveRosterAvatar(entry) {
  if (!entry || typeof entry !== 'object') return '';
  return asText(
    entry.avatar || entry.avatarUrl || entry.playerAvatarSnapshot || ''
  );
}

/**
 * 从正式 groups 收集非空席位（按稳定 ID 去重，保留首次出现顺序）
 * 兼容 players / playersSlots；空席位（无 ID）跳过；不依赖 roster
 */
function collectFormalGroupedSeats(match) {
  var order = [];
  var seatById = {};
  var groups = match && Array.isArray(match.groups) ? match.groups : [];
  groups.forEach(function (g) {
    if (!g || typeof g !== 'object') return;
    var lists = [];
    if (Array.isArray(g.players)) lists.push(g.players);
    if (Array.isArray(g.playersSlots)) lists.push(g.playersSlots);
    lists.forEach(function (list) {
      list.forEach(function (seat) {
        var pid = resolveSeatPlayerId(seat);
        if (!pid || seatById[pid]) return;
        var seatObj =
          seat && typeof seat === 'object'
            ? Object.assign({}, seat)
            : { userId: pid, playerId: pid };
        seatById[pid] = seatObj;
        order.push(pid);
      });
    });
  });
  return { order: order, seatById: seatById };
}

/**
 * 投影：与 registration 相同的 UI ViewModel；收费缺省为未收，卡片仍必须出现
 */
function buildGroupedPaymentDraftUsers(match, rosterSnapshot) {
  var seats = collectFormalGroupedSeats(match);
  var map = normalizePaymentByUserIdMap(match && match.paymentByUserId);
  var rosterById = indexRosterSnapshot(rosterSnapshot);
  var list = [];

  seats.order.forEach(function (pid, index) {
    var seat = seats.seatById[pid] || {};
    var roster = rosterById[pid] || null;
    var name = resolveSeatName(seat) || resolveRosterName(roster) || FALLBACK_NAME;
    var avatar = resolveSeatAvatar(seat) || resolveRosterAvatar(roster) || '';
    var gender =
      asText(seat.matchGender || seat.gender) ||
      (roster
        ? asText(roster.genderSnapshot || roster.gender || roster.matchGender)
        : '');
    var rec = map[pid] || {};
    var raw = {
      userId: pid,
      playerId: pid,
      name: name,
      displayName: name,
      nickname: name,
      matchNickname: name,
      competitionName: name,
      avatar: avatar,
      avatarUrl: avatar,
      matchGender: gender,
      gender: gender,
      paymentConfirmed: rec.paymentConfirmed === true,
      paidAmount: rec.paidAmount,
      cashPaidAmount:
        rec.cashPaidAmount != null && rec.cashPaidAmount !== ''
          ? rec.cashPaidAmount
          : rec.paidAmount,
      paymentRemark: rec.paymentRemark || ''
    };
    var display = paymentManage.toPaymentUiViewModel(raw, index);
    display.stableUserId = pid;
    display.userId = pid;
    display.playerId = pid;
    display.name = display.displayName || name;
    display.avatar = display.displayAvatar || avatar;
    display.avatarUrl = display.displayAvatar || avatar;
    list.push(display);
  });
  return list;
}

function hasGroupedPlayers(match) {
  return collectFormalGroupedSeats(match).order.length > 0;
}

/**
 * 即时写入单球员收费到 paymentByUserId（不触碰 registerInfo / groups）
 */
function applyGroupedPaymentPatch(match, playerId, patch, operator) {
  if (!match || typeof match !== 'object') {
    return { ok: false, reason: 'no_match' };
  }
  var pid = asId(playerId);
  if (!pid) return { ok: false, reason: 'no_player' };

  var map = ensurePaymentByUserId(match);
  map = Object.assign({}, normalizePaymentByUserIdMap(map));
  match.paymentByUserId = map;

  var beforeRec = map[pid] ? cloneJson(map[pid]) : null;
  var beforeSnap = snapshotRecord(beforeRec);

  var next = Object.assign({}, beforeRec || { playerId: pid }, patch || {});
  if (next.paymentConfirmed === false) {
    next.paidAmount = '';
    next.cashPaidAmount = '';
    next.diamondPaidAmount = '';
  }
  if (Object.prototype.hasOwnProperty.call(next, 'cashPaidAmount')) {
    next.paidAmount = next.cashPaidAmount;
  }
  var confirmed = next.paymentConfirmed === true;
  var amount = confirmed
    ? paymentManage.toAmount(
        next.paidAmount != null && next.paidAmount !== ''
          ? next.paidAmount
          : next.cashPaidAmount
      )
    : '';
  var op = operator || {};
  var afterRec = {
    playerId: pid,
    paymentConfirmed: confirmed,
    paidAmount: amount,
    cashPaidAmount: amount,
    paymentRemark: next.paymentRemark != null ? String(next.paymentRemark) : '',
    updatedAt: Date.now(),
    updatedBy: asId(op.operatorId || op.userId)
  };
  map[pid] = afterRec;
  match.paymentByUserId = map;

  var afterSnap = snapshotRecord(afterRec);
  var displayUser = paymentManage.toPaymentUiViewModel({
    userId: pid,
    playerId: pid,
    matchNickname:
      (patch && (patch.displayName || patch.matchNickname || patch.name)) || '',
    avatar: (patch && (patch.displayAvatar || patch.avatar)) || '',
    matchGender: (patch && (patch.matchGender || patch.gender)) || '',
    paymentConfirmed: afterRec.paymentConfirmed,
    paidAmount: afterRec.paidAmount,
    cashPaidAmount: afterRec.cashPaidAmount,
    paymentRemark: afterRec.paymentRemark
  });
  displayUser.stableUserId = pid;
  displayUser.userId = pid;
  displayUser.playerId = pid;

  var logs = paymentManage.buildPaymentDiffLogs({
    beforeUsers: [
      Object.assign({}, beforeSnap, {
        userId: pid,
        playerId: pid,
        stableUserId: pid,
        matchNickname: displayUser.displayName
      })
    ],
    afterUsers: [displayUser],
    operator: op
  });
  logs.forEach(function (log) {
    if (!log) return;
    log.matchId = asId(match.matchId);
    log.playerId = pid;
    log.source = 'paymentByUserId';
  });
  if (logs.length) {
    paymentManage.appendPaymentLogs(match, logs);
  }

  return {
    ok: true,
    before: beforeSnap,
    after: afterSnap,
    beforeRec: beforeRec,
    afterRec: afterRec,
    displayUser: displayUser,
    logs: logs
  };
}

function verifyManagedIdentity(match, frozen) {
  var f = frozen || {};
  var mid = asId(f.matchId);
  if (!match || asId(match.matchId) !== mid) {
    return { ok: false, reason: 'match_mismatch' };
  }
  var ctx =
    match.seriesContext && typeof match.seriesContext === 'object'
      ? match.seriesContext
      : {};
  if (!ctx.managed) return { ok: false, reason: 'not_managed' };
  if (asId(ctx.seriesId) !== asId(f.seriesId)) {
    return { ok: false, reason: 'series_mismatch' };
  }
  if (asId(ctx.roundId) !== asId(f.roundId)) {
    return { ok: false, reason: 'round_mismatch' };
  }
  if (asId(ctx.publishToken) !== asId(f.publishToken)) {
    return { ok: false, reason: 'token_mismatch' };
  }
  return { ok: true };
}

module.exports = {
  DATA_MODE_REGISTRATION: DATA_MODE_REGISTRATION,
  DATA_MODE_GROUPED_PLAYERS: DATA_MODE_GROUPED_PLAYERS,
  EMPTY_TEXT: EMPTY_TEXT,
  FALLBACK_NAME: FALLBACK_NAME,
  ensurePaymentByUserId: ensurePaymentByUserId,
  normalizePaymentByUserIdMap: normalizePaymentByUserIdMap,
  resolveSeatPlayerId: resolveSeatPlayerId,
  collectFormalGroupedSeats: collectFormalGroupedSeats,
  buildGroupedPaymentDraftUsers: buildGroupedPaymentDraftUsers,
  hasGroupedPlayers: hasGroupedPlayers,
  applyGroupedPaymentPatch: applyGroupedPaymentPatch,
  verifyManagedIdentity: verifyManagedIdentity,
  snapshotRecord: snapshotRecord
};
