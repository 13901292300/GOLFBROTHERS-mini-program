/**
 * 用户长期资料（本地持久化）
 * nickname：社区昵称
 * displayName：比赛/领先榜/记分卡显示名（同步 competitionName 兼容旧读取）
 * identityType：PLAYER | CADDIE
 * signature / caddieCourse / phoneBound / phoneMasked
 * handicap / floatCoef：竞技展示字段（非编辑页写入）
 * nationality* / region*：公开地理字段（均可空；不复用球队 region）
 * updatedAt：成功保存时更新
 */

const gameStore = require('./gameStore.js');
const geoCatalog = require('./geoCatalog.js');

const STORAGE_KEY = 'gb_user_profile_v1';

const IDENTITY_PLAYER = 'PLAYER';
const IDENTITY_CADDIE = 'CADDIE';

/** 与「我的」页当前展示头像一致的默认值（后台未接入前） */
const DEFAULT_AVATAR =
  'https://cdn.screenshottocode.com/H0XDATQ7nxMnJo8KZn-wV.jpg';

/** 与「我的」页当前展示竞技指标一致的默认值（后台未接入前） */
const DEFAULT_HANDICAP = 11.6;
const DEFAULT_FLOAT_COEF = 4.2;

function _readRaw() {
  try {
    const data = wx.getStorageSync(STORAGE_KEY);
    return data && typeof data === 'object' ? data : null;
  } catch (e) {
    return null;
  }
}

function _writeRaw(profile) {
  try {
    wx.setStorageSync(STORAGE_KEY, profile || {});
  } catch (e) {
    /* ignore */
  }
}

function _normalizeIdentityType(value) {
  const v = String(value || '').trim().toUpperCase();
  if (v === IDENTITY_CADDIE || v === '球童') return IDENTITY_CADDIE;
  return IDENTITY_PLAYER;
}

function _normalizeGender(value, fallback) {
  const g = String(value != null ? value : '').trim();
  if (g === '男' || g === 'female' || g === '女') {
    if (g === 'female' || g === '女') return '女';
    return '男';
  }
  if (g === 'male') return '男';
  const fb = String(fallback || '').trim();
  if (fb === '女' || fb === 'female') return '女';
  if (fb === '男' || fb === 'male') return '男';
  return fb || '';
}

function _strOrEmpty(value) {
  if (value == null) return '';
  return String(value).trim();
}

function _baseFromCurrentUser() {
  const user = gameStore.getCurrentUser() || {};
  return {
    userId: user.userId || 'me',
    nickname: user.name || '',
    gender: _normalizeGender(user.gender, '男'),
    competitionName: '',
    displayName: '',
    signature: '',
    identityType: IDENTITY_PLAYER,
    caddieCourse: '',
    phoneBound: false,
    phoneMasked: '未绑定',
    avatar: DEFAULT_AVATAR,
    handicap: DEFAULT_HANDICAP,
    floatCoef: DEFAULT_FLOAT_COEF,
    nationalityCode: '',
    nationalityName: '',
    regionCountryCode: '',
    regionCountryName: '',
    regionProvinceCode: '',
    regionProvinceName: '',
    regionCityCode: '',
    regionCityName: '',
    updatedAt: ''
  };
}

function _toNumberOr(value, fallback) {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeProfile(raw) {
  const base = _baseFromCurrentUser();
  const src = raw && typeof raw === 'object' ? raw : {};
  const avatarRaw =
    src.avatar != null && String(src.avatar).trim() !== ''
      ? String(src.avatar).trim()
      : base.avatar;

  // displayName 优先；兼容旧 competitionName
  const displayName =
    src.displayName != null && String(src.displayName).trim() !== ''
      ? String(src.displayName).trim()
      : src.competitionName != null
        ? String(src.competitionName).trim()
        : base.displayName;

  const nationalityCode = _strOrEmpty(src.nationalityCode);
  let nationalityName = _strOrEmpty(src.nationalityName);
  if (nationalityCode && !nationalityName) {
    const hit = geoCatalog.findNationalityByCode(nationalityCode);
    if (hit) nationalityName = hit.name;
  }

  const regionCountryCode = _strOrEmpty(src.regionCountryCode);
  let regionCountryName = _strOrEmpty(src.regionCountryName);
  if (regionCountryCode && !regionCountryName) {
    const hit = geoCatalog.findNationalityByCode(regionCountryCode);
    if (hit) regionCountryName = hit.name;
  }

  return {
    userId: src.userId || base.userId,
    nickname: src.nickname != null ? String(src.nickname) : base.nickname,
    gender: _normalizeGender(
      src.gender != null && src.gender !== '' ? src.gender : base.gender,
      base.gender
    ),
    signature: src.signature != null ? String(src.signature) : base.signature,
    identityType: _normalizeIdentityType(
      src.identityType != null ? src.identityType : base.identityType
    ),
    caddieCourse: src.caddieCourse != null ? String(src.caddieCourse).trim() : base.caddieCourse,
    displayName: displayName,
    // 兼容旧报名/出发表读取
    competitionName: displayName,
    phoneBound: src.phoneBound === true,
    phoneMasked:
      src.phoneMasked != null && String(src.phoneMasked).trim() !== ''
        ? String(src.phoneMasked).trim()
        : base.phoneMasked,
    avatar: avatarRaw || DEFAULT_AVATAR,
    handicap: _toNumberOr(src.handicap != null ? src.handicap : base.handicap, DEFAULT_HANDICAP),
    floatCoef: _toNumberOr(
      src.floatCoef != null ? src.floatCoef : base.floatCoef,
      DEFAULT_FLOAT_COEF
    ),
    nationalityCode: nationalityCode,
    nationalityName: nationalityName,
    regionCountryCode: regionCountryCode,
    regionCountryName: regionCountryName,
    regionProvinceCode: _strOrEmpty(src.regionProvinceCode),
    regionProvinceName: _strOrEmpty(src.regionProvinceName),
    regionCityCode: _strOrEmpty(src.regionCityCode),
    regionCityName: _strOrEmpty(src.regionCityName),
    updatedAt: _strOrEmpty(src.updatedAt)
  };
}

/** 读取用户资料（storage + gameStore 默认）；旧数据缺字段自动补空 */
function loadProfile() {
  return normalizeProfile(_readRaw());
}

/** 保存完整用户资料（更新 updatedAt） */
function saveProfile(profile) {
  const next = normalizeProfile(profile);
  next.updatedAt = new Date().toISOString();
  _writeRaw(next);
  return next;
}

/** 局部更新用户资料 */
function updateProfile(patch) {
  const current = loadProfile();
  const merged = Object.assign({}, current, patch || {});
  if (patch && Object.prototype.hasOwnProperty.call(patch, 'displayName')) {
    merged.displayName = patch.displayName != null ? String(patch.displayName).trim() : '';
    merged.competitionName = merged.displayName;
  }
  if (
    patch &&
    Object.prototype.hasOwnProperty.call(patch, 'competitionName') &&
    !Object.prototype.hasOwnProperty.call(patch, 'displayName')
  ) {
    merged.displayName = patch.competitionName != null ? String(patch.competitionName).trim() : '';
    merged.competitionName = merged.displayName;
  }
  return saveProfile(merged);
}

/** 单独更新比赛显示名 */
function setDisplayName(displayName) {
  return updateProfile({
    displayName: displayName != null ? String(displayName).trim() : ''
  });
}

/** 单独更新比赛名（兼容旧 API → displayName） */
function setCompetitionName(competitionName) {
  return setDisplayName(competitionName);
}

/**
 * 报名弹窗默认比赛名：优先 displayName/competitionName，回退 nickname
 */
function getRegisterCompetitionNameDefault(profile) {
  const p = profile || loadProfile();
  const displayName = String(p.displayName || p.competitionName || '').trim();
  if (displayName) return displayName;
  return String(p.nickname || '').trim();
}

function resolveRegisterCompetitionName(draft) {
  const value = draft != null ? String(draft).trim() : '';
  if (value) return value;
  return getRegisterCompetitionNameDefault();
}

function persistRegisterCompetitionDraft(draft) {
  const value = resolveRegisterCompetitionName(draft);
  if (!value) return loadProfile();
  return setDisplayName(value);
}

module.exports = {
  STORAGE_KEY,
  DEFAULT_AVATAR,
  DEFAULT_HANDICAP,
  DEFAULT_FLOAT_COEF,
  IDENTITY_PLAYER,
  IDENTITY_CADDIE,
  loadProfile,
  saveProfile,
  updateProfile,
  setDisplayName,
  setCompetitionName,
  getRegisterCompetitionNameDefault,
  resolveRegisterCompetitionName,
  persistRegisterCompetitionDraft
};
