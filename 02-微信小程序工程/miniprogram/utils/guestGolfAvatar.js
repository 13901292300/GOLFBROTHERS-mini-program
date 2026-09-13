/**
 * 手工添加的非注册球员：COS 卡通挥杆头像池。
 * 首次保存随机一次并随成员持久化；渲染层不得重抽。
 */

const mockAvatars = require('./mockAvatars.js');
const playerIdentityGuard = require('./playerIdentityGuard.js');

const COS_BASE = String(
  (require('../config.js').cdnBaseUrl ||
    'https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com')
).replace(/\/$/, '');

const GUEST_AVATAR_DIR = COS_BASE + '/assets/avatars/guest/golf-swing';
const CODE_PREFIX = 'golf-swing-';

const MALE_CODES = ['01', '03', '05', '06', '07', '08', '09', '10'];
const FEMALE_CODES = ['02', '04', '11', '12'];
const ALL_CODES = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

const CODE_RE = /golf-swing-(\d{2})(?:\.jpg)?(?:[?#].*)?$/i;

function padCode(raw) {
  const n = String(raw == null ? '' : raw).replace(/\D/g, '');
  if (!n) return '';
  return n.length >= 2 ? n.slice(-2) : '0' + n;
}

function urlForCode(code) {
  const c = padCode(code);
  if (ALL_CODES.indexOf(c) < 0) return '';
  return GUEST_AVATAR_DIR + '/' + CODE_PREFIX + c + '.jpg';
}

function parseCodeFromAvatar(src) {
  const s = String(src || '').trim();
  if (!s) return '';
  const m = s.match(CODE_RE);
  if (!m) return '';
  const c = padCode(m[1]);
  return ALL_CODES.indexOf(c) >= 0 ? c : '';
}

function isGuestGolfAvatarUrl(src) {
  return !!parseCodeFromAvatar(src);
}

function isConfirmedSystemDefaultAvatar(src) {
  const s = String(src || '').trim();
  if (!s) return true;
  if (s === mockAvatars.DEFAULT_AVATAR) return true;
  if (/\/default-avatar\.(jpg|png)$/i.test(s)) return true;
  if (/^\/assets\/.*default-avatar/i.test(s)) return true;
  return false;
}

function storedGender(member) {
  const m = member && typeof member === 'object' ? member : {};
  const candidates = [m.matchGender, m.gender, m.sex];
  for (let i = 0; i < candidates.length; i++) {
    const v = String(candidates[i] || '')
      .trim()
      .toLowerCase();
    if (v === 'female' || v === 'f' || String(candidates[i]).trim() === '女') return 'female';
    if (v === 'male' || v === 'm' || String(candidates[i]).trim() === '男') return 'male';
  }
  return '';
}

/** 分配用性别：有女用女，其余（含历史缺失）按男。不写回成员。 */
function genderForAssign(member) {
  return storedGender(member) === 'female' ? 'female' : 'male';
}

function codesForGender(gender) {
  return gender === 'female' ? FEMALE_CODES.slice() : MALE_CODES.slice();
}

function isProtectedAvatar(src) {
  const s = String(src || '').trim();
  if (!s) return false;
  if (isConfirmedSystemDefaultAvatar(s)) return false;
  if (isGuestGolfAvatarUrl(s)) return true;
  if (mockAvatars.isDurableAvatarSrc(s)) return true;
  return false;
}

function needsAssignment(member) {
  const m = member && typeof member === 'object' ? member : {};
  const src = m.avatar || m.avatarUrl || '';
  if (m.guestAvatarCode && urlForCode(m.guestAvatarCode)) {
    if (isGuestGolfAvatarUrl(src) || isConfirmedSystemDefaultAvatar(src)) return false;
    if (isProtectedAvatar(src)) return false;
  }
  return !isProtectedAvatar(src);
}

function isEligibleManualGuest(member) {
  const m = member && typeof member === 'object' ? member : {};
  if (!m || m.filled === false) return false;
  if (m.demo === true || m.isDemo === true) return false;
  const source = String(m.source || '').trim();
  if (source === 'friend' || source === 'team' || source === 'register') return false;
  const sourceKind = String(m.sourceKind || '').trim();
  if (sourceKind && sourceKind.indexOf('series') >= 0) return false;
  const userType = String(m.userType || '').trim().toLowerCase();
  if (userType === 'mini_program' || userType === 'registered' || userType === 'app') return false;
  const uid = playerIdentityGuard.normalizePlayerUserId(m.userId || m.playerUserId || '');
  const pid = playerIdentityGuard.normalizePlayerUserId(m.playerId || m.id || '');
  if (playerIdentityGuard.isStablePublicUserId(uid, { userType: userType }) && userType !== 'guest' && userType !== 'phone') {
    return false;
  }
  if (userType === 'guest') return true;
  if (playerIdentityGuard.isGuestPlayerId(uid) || playerIdentityGuard.isGuestPlayerId(pid)) return true;
  if (/^nonreg_/i.test(uid) || /^nonreg_/i.test(pid)) return true;
  if (/^phone_pending_/i.test(uid) || /^phone_pending_/i.test(pid)) return true;
  if (/^m_/i.test(pid)) return true;
  const identitySource = String(m.identitySource || '').trim();
  if (identitySource === 'manual_add' || identitySource === 'derived') return true;
  if (source === 'manual') return true;
  if (source === 'proxy' && String(m.pickChannel || '').toLowerCase() === 'manual') return true;
  return false;
}

function codeOfMember(member) {
  const m = member && typeof member === 'object' ? member : {};
  const fromField = padCode(m.guestAvatarCode);
  if (ALL_CODES.indexOf(fromField) >= 0) return fromField;
  return parseCodeFromAvatar(m.avatar || m.avatarUrl);
}

function collectUsedCodes(peers) {
  const used = {};
  (Array.isArray(peers) ? peers : []).forEach((p) => {
    const c = codeOfMember(p);
    if (c) used[c] = true;
  });
  return used;
}

function pickCode(gender, usedMap, rng) {
  const poolGender = codesForGender(gender);
  const used = usedMap && typeof usedMap === 'object' ? usedMap : {};
  const free = poolGender.filter((c) => !used[c]);
  const pool = free.length ? free : poolGender;
  const rand = typeof rng === 'function' ? rng : Math.random;
  const n = rand();
  const idx = Math.floor((n >= 0 && n < 1 ? n : 0) * pool.length);
  return pool[Math.max(0, Math.min(pool.length - 1, idx))];
}

function applyCode(member, code) {
  const out = member && typeof member === 'object' ? member : {};
  const c = padCode(code);
  const url = urlForCode(c);
  if (!url) return out;
  out.avatar = url;
  out.guestAvatarCode = c;
  return out;
}

/**
 * @param {object} member
 * @param {{ peers?: array, persistGender?: boolean, rng?: function }} [opts]
 * @returns {{ member: object, assigned: boolean, code: string }}
 */
function assignIfNeeded(member, opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const out = member && typeof member === 'object' ? member : {};
  if (!isEligibleManualGuest(out)) {
    return { member: out, assigned: false, code: codeOfMember(out) };
  }
  const storedCode = padCode(out.guestAvatarCode);
  if (storedCode && urlForCode(storedCode) && !isProtectedAvatar(out.avatar || out.avatarUrl)) {
    applyCode(out, storedCode);
    return { member: out, assigned: false, code: storedCode };
  }
  if (!needsAssignment(out)) {
    return { member: out, assigned: false, code: codeOfMember(out) };
  }
  const gender = genderForAssign(out);
  if (o.persistGender === true && !storedGender(out)) {
    out.gender = 'male';
    if (out.matchGender == null || String(out.matchGender).trim() === '') out.matchGender = 'male';
  }
  const used = collectUsedCodes(o.peers);
  const code = pickCode(gender, used, o.rng);
  applyCode(out, code);
  return { member: out, assigned: true, code: code };
}

function stampNewManualPlayer(member, peers, rng) {
  return assignIfNeeded(member, { peers: peers, persistGender: true, rng: rng }).member;
}

function ensureOnCollection(members, opts) {
  const list = Array.isArray(members) ? members : [];
  const o = opts && typeof opts === 'object' ? opts : {};
  let changed = false;
  const assigned = [];
  list.forEach((item, i) => {
    if (!item || typeof item !== 'object') return;
    const peers = list.slice(0, i).concat(assigned).concat(o.extraPeers || []);
    const result = assignIfNeeded(item, {
      peers: peers,
      persistGender: o.persistGender === true,
      rng: o.rng
    });
    if (result.assigned) {
      changed = true;
      assigned.push(result.member);
    }
  });
  return { members: list, changed: changed };
}

function _walkSlots(slots, acc) {
  (Array.isArray(slots) ? slots : []).forEach((p) => {
    if (p && typeof p === 'object') acc.push(p);
  });
}

function collectGameMembers(game) {
  const acc = [];
  if (!game || typeof game !== 'object') return acc;
  _walkSlots(game.playersSlots, acc);
  (Array.isArray(game.groups) ? game.groups : []).forEach((g) => {
    if (!g) return;
    _walkSlots(g.playersSlots, acc);
    _walkSlots(g.players, acc);
  });
  return acc;
}

function collectMatchMembers(match) {
  const acc = [];
  if (!match || typeof match !== 'object') return acc;
  const users =
    match.registerInfo && Array.isArray(match.registerInfo.users) ? match.registerInfo.users : [];
  users.forEach((u) => {
    if (u && typeof u === 'object') acc.push(u);
  });
  (Array.isArray(match.groups) ? match.groups : []).forEach((g) => {
    if (!g) return;
    _walkSlots(g.playersSlots, acc);
    _walkSlots(g.players, acc);
  });
  return acc;
}

function ensureOnGame(game, opts) {
  const members = collectGameMembers(game);
  return ensureOnCollection(members, opts);
}

function ensureOnMatch(match, opts) {
  const members = collectMatchMembers(match);
  return ensureOnCollection(members, opts);
}

function backfillStoredHosts() {
  let games = 0;
  let matches = 0;
  try {
    const gameStore = require('./gameStore.js');
    (gameStore.listGames() || []).forEach((g) => {
      if (!g) return;
      const r = ensureOnGame(g, { persistGender: false });
      if (r.changed) {
        gameStore.saveGame(g);
        games += 1;
      }
    });
  } catch (e) {
    /* ignore */
  }
  try {
    const teamMatchStore = require('./teamMatchStore.js');
    (teamMatchStore.listMatches() || []).forEach((m) => {
      if (!m) return;
      const r = ensureOnMatch(m, { persistGender: false });
      if (r.changed) {
        teamMatchStore.saveMatch(m);
        matches += 1;
      }
    });
  } catch (e2) {
    /* ignore */
  }
  return { games: games, matches: matches };
}

module.exports = {
  GUEST_AVATAR_DIR,
  MALE_CODES,
  FEMALE_CODES,
  ALL_CODES,
  urlForCode,
  parseCodeFromAvatar,
  isGuestGolfAvatarUrl,
  isConfirmedSystemDefaultAvatar,
  isProtectedAvatar,
  isEligibleManualGuest,
  genderForAssign,
  storedGender,
  codesForGender,
  collectUsedCodes,
  pickCode,
  assignIfNeeded,
  stampNewManualPlayer,
  ensureOnCollection,
  ensureOnGame,
  ensureOnMatch,
  collectGameMembers,
  collectMatchMembers,
  backfillStoredHosts
};
