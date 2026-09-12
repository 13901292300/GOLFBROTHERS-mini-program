/**
 * 记分页头像 / 昵称展示层：最新用户资料优先，赛事成员快照兜底。
 * 不写回 gameStore / teamMatchStore / 成绩。
 *
 * 身份只认稳定账号字段 userId / playerUserId。
 * playerId（含本机占位符 me）不作为展示覆盖依据。
 */

const userProfileStore = require('./userProfileStore.js');
const gameStore = require('./gameStore.js');
const userIdentityAlias = require('./userIdentityAlias.js');
const playerIdentityGuard = require('./playerIdentityGuard.js');
const mockAvatars = require('./mockAvatars.js');
const scoreSelfClaimStore = require('./scoreSelfClaimStore.js');
const playerCanonicalDisplay = require('./playerCanonicalDisplay.js');

const GENERATED_PLAYER_ID = /^(host-|p-\d|seat-|gm-|__empty_slot_|entity_)/i;

function _trim(value) {
  return playerIdentityGuard.normalizePlayerUserId(value);
}

function _canonical(userId) {
  const id = _trim(userId);
  if (!id) return '';
  try {
    return _trim(userIdentityAlias.resolveCanonicalUserId(id)) || id;
  } catch (e) {
    return id;
  }
}

function _sameIdentity(left, right) {
  const a = _trim(left);
  const b = _trim(right);
  if (!a || !b) return false;
  if (a === b) return true;
  return _canonical(a) === _canonical(b);
}

function _isGeneratedPlayerId(playerId) {
  const id = _trim(playerId);
  if (!id) return true;
  return GENERATED_PLAYER_ID.test(id);
}

function _isUsableAccountId(userId, userType) {
  const id = _trim(userId);
  if (!id) return false;
  if (!playerIdentityGuard.isStablePublicUserId(id, { userType: userType })) return false;
  return true;
}

/**
 * 把参赛成员上的账号绑定字段拷到运行时行 / 落盘槽，不改 playerId、成绩。
 */
function copyAccountBindFields(source, target) {
  const out = target && typeof target === 'object' ? target : {};
  const src = source && typeof source === 'object' ? source : {};
  const uid = _trim(src.userId);
  const puid = _trim(src.playerUserId);
  if (uid) out.userId = uid;
  if (puid) out.playerUserId = puid;
  return out;
}

/**
 * 参赛成员的账号 id。仅认 userId / playerUserId。
 * 不用 playerId（含字面量 me）：me 是本机占位符，分享/导入后不能当作稳定账号。
 */
function resolveMemberAccountUserId(player) {
  const p = player && typeof player === 'object' ? player : {};
  const userType = p.userType;
  const explicit = [_trim(p.userId), _trim(p.playerUserId)];
  for (let i = 0; i < explicit.length; i++) {
    if (_isUsableAccountId(explicit[i], userType)) return _canonical(explicit[i]) || explicit[i];
  }
  return '';
}

/**
 * 新建/落盘时：若该成员已能用稳定 id 对上当前账号，补写 userId / playerUserId。
 * 不改 playerId、成绩键、姓名头像快照。已有他人 userId 则不动。
 */
function attachCurrentAccountIds(member, currentUserId) {
  const uid = _canonical(_trim(currentUserId)) || _trim(currentUserId);
  const out = member && typeof member === 'object' ? Object.assign({}, member) : {};
  if (!uid || !_isUsableAccountId(uid, out.userType)) return out;

  const existingUid = _trim(out.userId);
  const existingPuid = _trim(out.playerUserId);
  if (existingUid && !_sameIdentity(existingUid, uid)) return out;
  if (existingPuid && !_sameIdentity(existingPuid, uid) && !existingUid) return out;

  const pid = _trim(out.playerId);
  const linked =
    (existingUid && _sameIdentity(existingUid, uid)) ||
    (existingPuid && _sameIdentity(existingPuid, uid)) ||
    (pid && !_isGeneratedPlayerId(pid) && _sameIdentity(pid, uid));
  if (!linked) return out;

  if (!existingUid) out.userId = uid;
  if (!existingPuid) out.playerUserId = uid;
  return out;
}

/**
 * 成员缺少 userId/playerUserId 时，仅从报名名单或同 playerId 的组合成员补回。
 * 不按昵称、不按 createdBy、不把孤立 playerId:me 写成 userId。
 */
function restoreAccountBindFromReliableSources(member, sources) {
  const out = member && typeof member === 'object' ? Object.assign({}, member) : {};
  if (resolveMemberAccountUserId(out)) return out;
  const pid = _trim(out.playerId);
  if (!pid || _isGeneratedPlayerId(pid)) return out;

  const buckets = [];
  const src = sources && typeof sources === 'object' ? sources : {};
  if (Array.isArray(src.registerUsers)) buckets.push(src.registerUsers);
  if (Array.isArray(src.compositionMembers)) buckets.push(src.compositionMembers);
  if (Array.isArray(src.slotMembers)) buckets.push(src.slotMembers);

  const found = [];
  for (let b = 0; b < buckets.length; b++) {
    const list = buckets[b] || [];
    for (let i = 0; i < list.length; i++) {
      const person = list[i];
      if (!person || typeof person !== 'object') continue;
      const uid = _trim(person.userId) || _trim(person.playerUserId);
      const theirPid = _trim(person.playerId);
      if (!uid || !_isUsableAccountId(uid, person.userType)) continue;
      const linked =
        _sameIdentity(uid, pid) || (theirPid && _sameIdentity(theirPid, pid));
      if (!linked) continue;
      let exists = false;
      for (let k = 0; k < found.length; k++) {
        if (_sameIdentity(found[k], uid)) {
          exists = true;
          break;
        }
      }
      if (!exists) found.push(uid);
    }
  }
  if (found.length !== 1) return out;
  if (!_trim(out.userId)) out.userId = found[0];
  if (!_trim(out.playerUserId)) out.playerUserId = found[0];
  return out;
}

function collectReliableBindSourcesFromGame(game, group) {
  const registerUsers = [];
  const compositionMembers = [];
  const slotMembers = [];
  const users =
    game && game.registerInfo && Array.isArray(game.registerInfo.users)
      ? game.registerInfo.users
      : [];
  users.forEach((u) => {
    if (u) registerUsers.push(u);
  });
  function walkTeams(teams) {
    (teams || []).forEach((t) => {
      ((t && t.members) || []).forEach((m) => {
        if (m) compositionMembers.push(m);
      });
      ((t && t.players) || []).forEach((m) => {
        if (m) compositionMembers.push(m);
      });
    });
  }
  if (game && game.composition) walkTeams(game.composition.teams);
  function walkSlots(slots) {
    (slots || []).forEach((p) => {
      if (p && (_trim(p.userId) || _trim(p.playerUserId))) slotMembers.push(p);
    });
  }
  if (game && Array.isArray(game.groups)) {
    game.groups.forEach((g) => {
      if (g && g.composition) walkTeams(g.composition.teams);
      walkSlots(g.playersSlots);
    });
  }
  if (game) walkSlots(game.playersSlots);
  if (group) {
    if (group.composition) walkTeams(group.composition.teams);
    walkSlots(group.playersSlots);
  }
  return {
    registerUsers: registerUsers,
    compositionMembers: compositionMembers,
    slotMembers: slotMembers
  };
}

function currentAccountUserId() {
  return _currentAccountUserId();
}

function _currentAccountUserId() {
  // 只认本机资料 / 记分 CURRENT_USER。不读 gb_auth_session_v1（球队 UI 会话）。
  try {
    const profile = userProfileStore.loadProfile() || {};
    const fromProfile = _trim(profile.userId);
    if (fromProfile) return _canonical(fromProfile) || fromProfile;
  } catch (e) {
    /* ignore */
  }
  try {
    const user = gameStore.getCurrentUser() || {};
    const fromUser = _trim(user.userId);
    if (fromUser) return _canonical(fromUser) || fromUser;
  } catch (e2) {
    /* ignore */
  }
  return 'me';
}

function _loadCurrentUserLiveFields() {
  try {
    const profile = userProfileStore.loadProfile() || {};
    const display =
      typeof userProfileStore.resolveCurrentUserAvatarDisplay === 'function'
        ? userProfileStore.resolveCurrentUserAvatarDisplay(profile)
        : _trim(profile.avatar);
    const avatar = _trim(display);
    return {
      nickname: _trim(profile.nickname) || _trim(profile.displayName),
      avatar: mockAvatars.isDurableAvatarSrc(avatar) ? avatar : '',
      gender: _normalizeLiveGender(profile.gender)
    };
  } catch (e) {
    return { nickname: '', avatar: '', gender: '' };
  }
}

function _normalizeLiveGender(value) {
  const g = String(value == null ? '' : value).trim();
  if (g === '女' || g === 'female') return 'female';
  if (g === '男' || g === 'male') return 'male';
  return '';
}

function _snapshotGender(player) {
  const p = player || {};
  return _normalizeLiveGender(p.gender || p.matchGender || p.sex);
}

function _liveOverlayResult(snapshotName, snapshotAvatar, snapshotGender, userId) {
  const live = _loadCurrentUserLiveFields();
  return {
    name: live.nickname || snapshotName,
    avatar: live.avatar || snapshotAvatar,
    gender: live.gender || snapshotGender || '',
    applied: !!(live.nickname || live.avatar || live.gender),
    userId: userId || ''
  };
}

function _snapshotName(player) {
  const p = player || {};
  return (
    _trim(p.nickname) ||
    _trim(p.displayName) ||
    _trim(p.matchNickname) ||
    _trim(p.competitionName) ||
    _trim(p.name)
  );
}

function _snapshotAvatar(player) {
  const p = player || {};
  return _trim(p.avatar) || _trim(p.avatarUrl);
}

let _liveDisplayGameId = '';

function setLiveDisplayGameContext(gameId) {
  _liveDisplayGameId = _trim(gameId);
}

function _contextGameId(ctx) {
  return _trim(ctx && ctx.gameId) || _liveDisplayGameId;
}

function _isClaimableRosterMember(player) {
  const p = player && typeof player === 'object' ? player : {};
  if (p.filled === false) return false;
  const pid = _trim(p.playerId || p.id);
  if (!pid) return false;
  if (/^__empty_slot_/i.test(pid)) return false;
  return !!(_snapshotName(p) || pid);
}

function evaluateSelfClaimAction(member, ctx) {
  const gameId = _contextGameId(ctx);
  const p = member && typeof member === 'object' ? member : {};
  const playerId = _trim(p.playerId || p.id);
  if (!gameId || !playerId) {
    return { canClaim: false, canUnclaim: false, code: 'invalid' };
  }
  if (!_isClaimableRosterMember(p)) {
    return { canClaim: false, canUnclaim: false, code: 'not_player' };
  }
  const uid = resolveMemberAccountUserId(p);
  const me = _currentAccountUserId();
  if (scoreSelfClaimStore.hasActiveClaim(gameId, playerId)) {
    return { canClaim: false, canUnclaim: true, code: 'claimed_here' };
  }
  if (uid && !_sameIdentity(uid, me)) {
    return { canClaim: false, canUnclaim: false, code: 'bound_other' };
  }
  if (uid && _sameIdentity(uid, me)) {
    return { canClaim: false, canUnclaim: false, code: 'bound_self' };
  }
  const other = scoreSelfClaimStore.findClaimInGame(gameId);
  if (other && other.playerId !== playerId) {
    return {
      canClaim: false,
      canUnclaim: false,
      code: 'already_claimed_other',
      claimedPlayerId: other.playerId
    };
  }
  return { canClaim: true, canUnclaim: false, code: 'ok' };
}

function claimScoreMemberAsSelf(gameId, member) {
  const ev = evaluateSelfClaimAction(member, { gameId: gameId });
  if (!ev.canClaim) return { ok: false, code: ev.code, claimedPlayerId: ev.claimedPlayerId };
  const playerId = _trim(member && (member.playerId || member.id));
  const saved = scoreSelfClaimStore.putClaim(gameId, playerId);
  return { ok: !!saved, code: saved ? 'ok' : 'persist_failed', playerId: playerId };
}

function unclaimScoreMemberSelf(gameId, member) {
  const ev = evaluateSelfClaimAction(member, { gameId: gameId });
  if (!ev.canUnclaim) return { ok: false, code: ev.code };
  const playerId = _trim(member && (member.playerId || member.id));
  const removed = scoreSelfClaimStore.removeClaim(gameId, playerId);
  return { ok: removed, code: removed ? 'ok' : 'missing' };
}

function _isPresetDemoRecord(record) {
  const p = record && typeof record === 'object' ? record : {};
  if (p.demo === true || p.isDemo === true || p.seed === true) return true;
  const src = String(p.identitySource || '').trim().toLowerCase();
  if (src === 'demo' || src === 'seed' || src === 'preset') return true;
  const uid = _trim(p.userId) || _trim(p.playerUserId);
  if (/^demo[-_]/i.test(uid) || /^chat-demo/i.test(uid)) return true;
  return false;
}

/**
 * @returns {{ name: string, avatar: string, applied: boolean, userId: string }}
 */
function overlayScorePlayerDisplay(player, ctx) {
  const p = player && typeof player === 'object' ? player : {};
  const snapshotName = _snapshotName(p);
  const snapshotAvatar = _snapshotAvatar(p);
  const snapshotGender = _snapshotGender(p);
  if (_isPresetDemoRecord(p)) {
    return {
      name: snapshotName,
      avatar: snapshotAvatar,
      gender: snapshotGender,
      applied: false,
      userId: ''
    };
  }
  const uid = resolveMemberAccountUserId(p);
  const me = _currentAccountUserId();
  if (uid) {
    if (!_sameIdentity(uid, me)) {
      return {
        name: snapshotName,
        avatar: snapshotAvatar,
        gender: snapshotGender,
        applied: false,
        userId: uid
      };
    }
    return _liveOverlayResult(snapshotName, snapshotAvatar, snapshotGender, uid);
  }
  const allowSelfClaim = !(ctx && ctx.allowSelfClaim === false);
  const gameId = allowSelfClaim ? _contextGameId(ctx) : '';
  const playerId = _trim(p.playerId || p.id);
  if (gameId && playerId && scoreSelfClaimStore.hasActiveClaim(gameId, playerId)) {
    return _liveOverlayResult(snapshotName, snapshotAvatar, snapshotGender, me);
  }
  return {
    name: snapshotName,
    avatar: snapshotAvatar,
    gender: snapshotGender,
    applied: false,
    userId: ''
  };
}

function applyLiveDisplayToView(player, ctx) {
  const p = player && typeof player === 'object' ? player : {};
  const over = overlayScorePlayerDisplay(p, ctx);
  const pres = playerCanonicalDisplay.resolvePlayerPresentation(p, ctx);
  const gender = over.gender || '';
  return {
    name: over.name || pres.displayName,
    displayAvatar: pres.displayAvatar,
    canonicalAvatar: pres.canonicalAvatar,
    avatar: pres.canonicalAvatar,
    gender: gender
  };
}

/**
 * 新发言 / 新围观 / 新报名：写入当前资料快照，并保留账号关联字段。
 * 不覆盖已有他人 userId。不把球队会话 id 写入。
 */
function stampCurrentAccountOnWrite(record) {
  const out = record && typeof record === 'object' ? Object.assign({}, record) : {};
  if (_isPresetDemoRecord(out)) return out;
  const me = _currentAccountUserId();
  const live = _loadCurrentUserLiveFields();
  const existingUid = _trim(out.userId);
  if (existingUid && !_sameIdentity(existingUid, me)) return out;
  if (me) {
    if (!existingUid) out.userId = me;
    if (!_trim(out.playerUserId)) out.playerUserId = me;
  }
  if (live.nickname) {
    out.name = live.nickname;
    out.nickname = live.nickname;
  }
  if (live.avatar) out.avatar = live.avatar;
  if (live.gender) {
    out.gender = live.gender === 'female' ? '女' : '男';
  }
  return out;
}

function overlayMentionTargets(mentions, ctx) {
  const list = Array.isArray(mentions) ? mentions : [];
  if (!list.length) return list;
  return list.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const over = overlayScorePlayerDisplay(
      {
        userId: item.userId,
        playerUserId: item.userId,
        name: item.userName || item.name || '',
        nickname: item.userName || item.name || ''
      },
      ctx
    );
    if (!over.applied || !over.name) return item;
    return Object.assign({}, item, {
      userId: item.userId,
      userName: over.name,
      displayText: '@' + over.name
    });
  });
}

function overlayChatMessages(messages, ctx) {
  const chatCtx = Object.assign({}, ctx || {}, { allowSelfClaim: false });
  return (Array.isArray(messages) ? messages : []).map((m) => {
    if (!m || m.type === 'system') return m;
    if (_isPresetDemoRecord(m)) {
      const name = String(m.name || '').trim();
      return Object.assign({}, m, {
        self: false,
        name: !name || name === '我' ? '示例球员' : name
      });
    }
    const over = overlayScorePlayerDisplay(m, chatCtx);
    const mentions = overlayMentionTargets(m.mentions, chatCtx);
    if (!over.applied) {
      if (mentions === m.mentions) return m;
      return Object.assign({}, m, { mentions: mentions });
    }
    return Object.assign({}, m, {
      name: over.name,
      avatar: over.avatar || m.avatar,
      gender: over.gender || m.gender,
      mentions: mentions
    });
  });
}

function mergeSelfWatcher(watchers, ctx) {
  const list = Array.isArray(watchers) ? watchers : [];
  return list.map((w) => {
    if (!w || _isPresetDemoRecord(w)) return w;
    const over = overlayScorePlayerDisplay(w, ctx);
    if (!over.applied) return w;
    return Object.assign({}, w, {
      name: over.name,
      avatar: over.avatar || w.avatar || '',
      gender: over.gender || w.gender
    });
  });
}

function getProfileDisplayRevision() {
  try {
    const profile = userProfileStore.loadProfile() || {};
    return _trim(profile.updatedAt) || '';
  } catch (e) {
    return '';
  }
}

module.exports = {
  resolveMemberAccountUserId,
  attachCurrentAccountIds,
  copyAccountBindFields,
  restoreAccountBindFromReliableSources,
  collectReliableBindSourcesFromGame,
  currentAccountUserId,
  setLiveDisplayGameContext,
  evaluateSelfClaimAction,
  claimScoreMemberAsSelf,
  unclaimScoreMemberSelf,
  overlayScorePlayerDisplay,
  applyLiveDisplayToView,
  resolvePlayerPresentation: playerCanonicalDisplay.resolvePlayerPresentation,
  stampCurrentAccountOnWrite,
  overlayChatMessages,
  overlayMentionTargets,
  mergeSelfWatcher,
  getProfileDisplayRevision
};
