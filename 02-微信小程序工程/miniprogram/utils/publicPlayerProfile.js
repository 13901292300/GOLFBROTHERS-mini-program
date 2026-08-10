/**
 * 公开球员资料统一投影。
 * 当前用户读 userProfileStore；他人读目录 / 调用方快照兜底。
 * 不写回赛事快照；不用 remarkName / 球队简称作公开昵称。
 */

const userProfileStore = require('./userProfileStore.js');
const playerDirectory = require('./playerDirectory.js');
const teamDirectory = require('./teamDirectory.js');
const userIdentityAlias = require('./userIdentityAlias.js');
const genderNormalize = require('./genderNormalize.js');
const geoCatalog = require('./geoCatalog.js');
const playerIdentityGuard = require('./playerIdentityGuard.js');

function _trim(v) {
  return playerIdentityGuard.normalizePlayerUserId(v);
}

/** 稳定公开 userId：唯一规则见 playerIdentityGuard */
function isStablePublicUserId(userId, options) {
  return playerIdentityGuard.isStablePublicUserId(userId, options);
}

function _canonicalUserId(userId) {
  const id = _trim(userId);
  if (!id) return '';
  try {
    return _trim(userIdentityAlias.resolveCanonicalUserId(id)) || id;
  } catch (e) {
    return id;
  }
}

function _isSameUserIdentity(leftUserId, rightUserId) {
  const left = _trim(leftUserId);
  const right = _trim(rightUserId);
  if (!left || !right) return false;
  if (left === right) return true;
  return _canonicalUserId(left) === _canonicalUserId(right);
}

function _emptyProfile(userId) {
  return {
    userId: _trim(userId),
    avatar: '',
    nickname: '',
    displayName: '',
    gender: 'unknown',
    signature: '',
    nationalityCode: '',
    nationalityName: '',
    regionCountryCode: '',
    regionCountryName: '',
    regionProvinceCode: '',
    regionProvinceName: '',
    regionCityCode: '',
    regionCityName: '',
    regionDisplayName: '',
    handicap: null,
    floatCoef: null,
    isCurrentUser: false,
    isRegistered: false,
    identitySource: '',
    canOpenProfile: false
  };
}

function _pickMetric(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (Number.isFinite(n)) return n;
  return raw;
}

function _fromCurrentUser() {
  const p = userProfileStore.loadProfile() || {};
  const regionDisplayName = geoCatalog.formatRegionDisplayName(p);
  return {
    userId: _trim(p.userId) || 'me',
    avatar: p.avatar || userProfileStore.DEFAULT_AVATAR,
    nickname: _trim(p.nickname),
    displayName: _trim(p.displayName || p.competitionName),
    gender: genderNormalize.normalizeGenderCode(p.gender),
    signature: _trim(p.signature),
    nationalityCode: _trim(p.nationalityCode),
    nationalityName: _trim(p.nationalityName),
    regionCountryCode: _trim(p.regionCountryCode),
    regionCountryName: _trim(p.regionCountryName),
    regionProvinceCode: _trim(p.regionProvinceCode),
    regionProvinceName: _trim(p.regionProvinceName),
    regionCityCode: _trim(p.regionCityCode),
    regionCityName: _trim(p.regionCityName),
    regionDisplayName: regionDisplayName,
    handicap: _pickMetric(p.handicap),
    floatCoef: _pickMetric(p.floatCoef),
    isCurrentUser: true,
    isRegistered: true,
    identitySource: 'userProfileStore',
    canOpenProfile: true
  };
}

function _findDirectoryUser(userId) {
  const id = _trim(userId);
  if (!id) return null;
  const friends = Array.isArray(playerDirectory.FRIEND_LIST)
    ? playerDirectory.FRIEND_LIST
    : [];
  const friend = friends.find(
    (f) => f && (_trim(f.playerId) === id || _trim(f.userId) === id)
  );
  if (friend) {
    const nat = geoCatalog.resolveNationalityFromDirectoryCountry(friend.country);
    return {
      userId: id,
      avatar: friend.avatar || '',
      nickname: _trim(friend.name || friend.nickname),
      displayName: '',
      gender: genderNormalize.normalizeGenderCode(friend.gender),
      signature: '',
      nationalityCode: nat.code,
      nationalityName: nat.name,
      regionCountryCode: '',
      regionCountryName: '',
      regionProvinceCode: '',
      regionProvinceName: '',
      regionCityCode: '',
      regionCityName: '',
      handicap: _pickMetric(friend.handicap),
      floatCoef: _pickMetric(friend.floatCoef),
      isRegistered: true,
      identitySource: 'playerDirectory'
    };
  }

  const teams = Array.isArray(teamDirectory.TEAMS) ? teamDirectory.TEAMS : [];
  for (let i = 0; i < teams.length; i++) {
    const members = teamDirectory.getTeamMembers(teams[i] && teams[i].id) || [];
    const member = members.find(
      (m) => m && (_trim(m.playerId) === id || _trim(m.userId) === id)
    );
    if (member) {
      return {
        userId: id,
        avatar: member.avatar || '',
        nickname: _trim(member.name || member.nickname),
        displayName: _trim(member.competitionName),
        gender: genderNormalize.normalizeGenderCode(member.gender),
        signature: '',
        nationalityCode: '',
        nationalityName: '',
        regionCountryCode: '',
        regionCountryName: '',
        regionProvinceCode: '',
        regionProvinceName: '',
        regionCityCode: '',
        regionCityName: '',
        handicap: _pickMetric(member.handicap),
        floatCoef: _pickMetric(member.floatCoef),
        isRegistered: true,
        identitySource: 'teamDirectory'
      };
    }
  }
  return null;
}

function _fromFallbackSnapshot(userId, snapshot) {
  const s = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const nat =
    s.nationalityCode || s.nationalityName
      ? {
          code: _trim(s.nationalityCode),
          name: _trim(s.nationalityName)
        }
      : geoCatalog.resolveNationalityFromDirectoryCountry(s.country);
  return {
    userId: _trim(userId),
    avatar: _trim(s.avatar),
    nickname: _trim(s.nickname || s.name || s.matchNickname),
    displayName: _trim(s.displayName || s.competitionName),
    gender: genderNormalize.normalizeGenderCode(s.gender || s.matchGender),
    signature: _trim(s.signature),
    nationalityCode: nat.code || '',
    nationalityName: nat.name || '',
    regionCountryCode: _trim(s.regionCountryCode),
    regionCountryName: _trim(s.regionCountryName),
    regionProvinceCode: _trim(s.regionProvinceCode),
    regionProvinceName: _trim(s.regionProvinceName),
    regionCityCode: _trim(s.regionCityCode),
    regionCityName: _trim(s.regionCityName),
    handicap: _pickMetric(s.handicap),
    floatCoef: _pickMetric(s.floatCoef),
    isRegistered: false,
    identitySource: _trim(s.identitySource) || 'fallbackSnapshot'
  };
}

function _mergePrefer(base, overlay) {
  const out = Object.assign({}, base);
  const keys = [
    'avatar',
    'nickname',
    'displayName',
    'gender',
    'signature',
    'nationalityCode',
    'nationalityName',
    'regionCountryCode',
    'regionCountryName',
    'regionProvinceCode',
    'regionProvinceName',
    'regionCityCode',
    'regionCityName',
    'handicap',
    'floatCoef',
    'identitySource',
    'isRegistered'
  ];
  keys.forEach((k) => {
    const v = overlay[k];
    if (v == null || v === '') return;
    if (k === 'gender' && v === 'unknown' && out.gender && out.gender !== 'unknown') return;
    out[k] = v;
  });
  return out;
}

/**
 * @param {string} userId
 * @param {object} [fallbackSnapshot] 赛事/调用方显示兜底，不写回公开资料
 * @returns {object}
 */
function resolvePublicPlayerProfile(userId, fallbackSnapshot) {
  const id = _trim(userId);
  if (!isStablePublicUserId(id)) {
    const denied = _emptyProfile(id);
    denied.canOpenProfile = false;
    return denied;
  }

  if (_isSameUserIdentity(id, 'me')) {
    return _fromCurrentUser();
  }
  try {
    const profile = userProfileStore.loadProfile() || {};
    const meId = _trim(profile.userId);
    if (meId && _isSameUserIdentity(id, meId)) {
      return _fromCurrentUser();
    }
  } catch (e) { /* ignore */ }

  let profile = _emptyProfile(id);
  profile.canOpenProfile = true;

  const dir = _findDirectoryUser(id);
  if (dir) {
    profile = _mergePrefer(profile, dir);
    profile.isCurrentUser = false;
    profile.canOpenProfile = true;
  }

  // 赛事快照仅补缺，不造假国籍/地域/签名
  const fb = _fromFallbackSnapshot(id, fallbackSnapshot);
  const fillKeys = ['avatar', 'nickname', 'displayName', 'gender', 'handicap', 'floatCoef'];
  fillKeys.forEach((k) => {
    if ((profile[k] == null || profile[k] === '' || profile[k] === 'unknown') && fb[k] != null && fb[k] !== '' && fb[k] !== 'unknown') {
      profile[k] = fb[k];
    }
  });
  if (!profile.identitySource && fb.identitySource) {
    profile.identitySource = fb.identitySource;
  }
  if (!dir && (fb.nickname || fb.avatar)) {
    profile.isRegistered = false;
    if (!profile.identitySource) profile.identitySource = 'fallbackSnapshot';
  }

  profile.regionDisplayName = geoCatalog.formatRegionDisplayName(profile);
  profile.isCurrentUser = false;
  profile.canOpenProfile = true;
  if (!profile.avatar) {
    profile.avatar = userProfileStore.DEFAULT_AVATAR;
  }
  return profile;
}

module.exports = {
  isStablePublicUserId: isStablePublicUserId,
  resolvePublicPlayerProfile: resolvePublicPlayerProfile
};
