/**
 * 用户长期资料（本地持久化）
 * nickname：社区昵称
 * displayName：比赛/领先榜/记分卡显示名（同步 competitionName 兼容旧读取）
 * identityType：PLAYER | CADDIE
 * signature / caddieCourse / phoneBound / phoneMasked
 * handicap / floatCoef：竞技展示字段（非编辑页写入）
 * nationality* / region*：公开地理字段（均可空；不复用球队 region）
 * updatedAt：成功保存时更新
 * avatar：canonical 持久头像（cloud:// 或稳定 https），用于身份 / 云同步 / 球局快照
 * avatarLocalPath：本机 USER_DATA_PATH 展示缓存（wxfile://usr），仅 UI，不得入库快照
 */

const gameStore = require('./gameStore.js');
const geoCatalog = require('./geoCatalog.js');
const mockAvatars = require('./mockAvatars.js');

const STORAGE_KEY = 'gb_user_profile_v1';

let _ensureAvatarLocalInflight = false;

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
    avatarLocalPath: '',
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

  let nickname = src.nickname != null ? String(src.nickname) : base.nickname;
  if (String(nickname).trim() === 'TIGERHOODS') nickname = base.nickname;

  return {
    userId: src.userId || base.userId,
    nickname: nickname,
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
    avatarLocalPath: _normalizeAvatarLocalPath(src.avatarLocalPath),
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
  const raw = _readRaw();
  const next = normalizeProfile(raw);
  if (raw && String(raw.nickname || '').trim() === 'TIGERHOODS' && next.nickname !== raw.nickname) {
    _writeRaw(next);
  }
  return next;
}

/** 保存完整用户资料（更新 updatedAt），并同步当前用户身份与已有 GAME */
function saveProfile(profile) {
  const next = normalizeProfile(profile);
  next.updatedAt = new Date().toISOString();
  _writeRaw(next);
  try {
    const currentUserIdentity = require('./currentUserIdentity.js');
    currentUserIdentity.applySavedProfile(next);
  } catch (e) {
    try {
      gameStore.applyCurrentUserIdentity({
        name: String(next.nickname || '').trim(),
        avatar: next.avatar,
        gender: next.gender
      });
    } catch (err) {
      /* ignore */
    }
  }
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

function _normalizeAvatarLocalPath(value) {
  const v = String(value == null ? '' : value).trim();
  if (!v) return '';
  if (/^cloud:\/\//i.test(v)) return '';
  if (mockAvatars.isTempWeChatFile(v)) return '';
  if (!mockAvatars.isDurableLocalUserFile(v)) return '';
  return v;
}

function _isManagedGbAvatarFile(filePath) {
  const v = _normalizeAvatarLocalPath(filePath);
  if (!v) return false;
  const base = v.split(/[\\/]/).pop() || '';
  const name = String(base).split('?')[0];
  return /^gb_avatar_/i.test(name);
}

function _localAvatarFileExists(filePath) {
  const v = _normalizeAvatarLocalPath(filePath);
  if (!v) return false;
  try {
    if (typeof wx === 'undefined' || typeof wx.getFileSystemManager !== 'function') return false;
    const fs = wx.getFileSystemManager();
    if (!fs || typeof fs.accessSync !== 'function') return false;
    fs.accessSync(v);
    return true;
  } catch (e) {
    return false;
  }
}

function _tryUnlinkLocalAvatarFile(filePath) {
  const v = String(filePath || '').trim();
  if (!v || !_isManagedGbAvatarFile(v)) return;
  try {
    if (typeof wx === 'undefined' || typeof wx.getFileSystemManager !== 'function') return;
    const fs = wx.getFileSystemManager();
    if (!fs) return;
    if (typeof fs.unlinkSync === 'function') {
      fs.unlinkSync(v);
      return;
    }
    if (typeof fs.unlink === 'function') {
      fs.unlink({
        filePath: v,
        fail: function () {}
      });
    }
  } catch (e) {
    try {
      console.warn('[userProfileStore] unlink local avatar failed');
    } catch (e2) {
      /* ignore */
    }
  }
}

/** 「我的」展示用：仅持久头像；临时路径不显示为已保存成功 */
function resolveDisplayAvatar(profile) {
  const raw = String((profile && profile.avatar) || '').trim();
  if (mockAvatars.isDurableAvatarSrc(raw)) return raw;
  return DEFAULT_AVATAR;
}

/**
 * 当前登录用户本人 UI src：有效本机缓存优先，否则 canonical avatar。
 * 不写回 profile，不下载 cloud 文件。
 */
function resolveCurrentUserAvatarDisplay(profile) {
  const p = profile && typeof profile === 'object' ? profile : {};
  const local = _normalizeAvatarLocalPath(p.avatarLocalPath);
  if (local && _localAvatarFileExists(local)) return local;
  return resolveDisplayAvatar(p);
}

/**
 * 删除未被 profile 引用、且不是 keepPath 的 gb_avatar_*。
 * 用于事务失败时清 orphan new，或成功后清 prev。删除失败只 warn。
 */
function discardUnusedAvatarLocalFile(candidatePath, keepPath) {
  const candidate = _normalizeAvatarLocalPath(candidatePath);
  const keep = _normalizeAvatarLocalPath(keepPath);
  if (!candidate || !_isManagedGbAvatarFile(candidate)) return;
  if (keep && candidate === keep) return;
  try {
    const referenced = _normalizeAvatarLocalPath((loadProfile() || {}).avatarLocalPath);
    if (referenced && referenced === candidate) return;
  } catch (e) {
    /* ignore */
  }
  _tryUnlinkLocalAvatarFile(candidate);
}

/**
 * 一次写入 canonical avatar + 本机缓存。默认在保存成功后再删上一份 gb_avatar_*。
 * 保存抛错时不删 prev，并尝试清未入档的 new local。
 */
function commitAvatarCanonicalAndLocal(input, opts) {
  const canonical = String((input && input.avatar) || '').trim();
  const nextPath = _normalizeAvatarLocalPath(input && input.avatarLocalPath);
  const current = loadProfile();
  const oldPath = _normalizeAvatarLocalPath(current.avatarLocalPath);
  const patch = { avatar: canonical };
  // 空 localPath 不得清掉已有 usr 缓存（onboard 上传成功但 persist 失败时仍保留旧 local）
  if (nextPath) patch.avatarLocalPath = nextPath;
  let saved;
  try {
    saved = updateProfile(patch);
  } catch (e) {
    if (nextPath) discardUnusedAvatarLocalFile(nextPath, oldPath);
    throw e;
  }
  const raw = _readRaw() || {};
  const persistedAvatar = String(raw.avatar || '').trim();
  const persistedLocal = _normalizeAvatarLocalPath(raw.avatarLocalPath);
  const localOk = nextPath ? persistedLocal === nextPath : persistedLocal === oldPath;
  if (persistedAvatar !== canonical || !localOk) {
    if (nextPath) discardUnusedAvatarLocalFile(nextPath, oldPath);
    throw new Error('avatar_commit_not_persisted');
  }
  const unlinkPrevious = !opts || opts.unlinkPreviousLocal !== false;
  if (nextPath && unlinkPrevious) {
    discardUnusedAvatarLocalFile(oldPath, saved && saved.avatarLocalPath);
  }
  return saved;
}

/**
 * 仅写本机缓存（兼容旧调用）。新选图路径请用 commitAvatarCanonicalAndLocal。
 */
function commitAvatarLocalPath(newLocalPath) {
  const nextPath = _normalizeAvatarLocalPath(newLocalPath);
  if (!nextPath) return loadProfile();
  const current = loadProfile();
  const oldPath = _normalizeAvatarLocalPath(current.avatarLocalPath);
  const saved = updateProfile({ avatarLocalPath: nextPath });
  discardUnusedAvatarLocalFile(oldPath, saved && saved.avatarLocalPath);
  return saved;
}

function _avatarExtFromPath(path) {
  const m = String(path || '').match(/(\.[a-zA-Z0-9]{1,8})(?:\?|$)/);
  return m ? m[1] : '.jpg';
}

function _wxSaveFileFallback(tempPath, done) {
  if (typeof wx.saveFile !== 'function') {
    done({ ok: false, path: '', reason: 'save_unavailable' });
    return;
  }
  wx.saveFile({
    tempFilePath: tempPath,
    success: (res) => {
      const saved = String((res && res.savedFilePath) || '').trim();
      if (mockAvatars.isDurableAvatarSrc(saved)) {
        done({ ok: true, path: saved });
        return;
      }
      done({ ok: false, path: '', reason: 'not_durable' });
    },
    fail: () => done({ ok: false, path: '', reason: 'save_failed' })
  });
}

/**
 * 把选图临时文件落到用户目录。失败不回写临时路径。
 * callback({ ok, path, reason })
 */
function persistAvatarFile(tempPath, callback) {
  const path = String(tempPath || '').trim();
  const done = typeof callback === 'function' ? callback : function () {};
  if (!path) {
    done({ ok: false, path: '', reason: 'empty' });
    return;
  }
  if (mockAvatars.isDurableAvatarSrc(path) && /^https:\/\//i.test(path)) {
    done({ ok: true, path: path });
    return;
  }
  if (mockAvatars.isDurableLocalUserFile(path)) {
    done({ ok: true, path: path });
    return;
  }
  let dest = '';
  try {
    const root = wx.env && wx.env.USER_DATA_PATH;
    if (root) {
      dest = String(root).replace(/\/$/, '') + '/gb_avatar_' + Date.now() + _avatarExtFromPath(path);
    }
  } catch (e) {
    dest = '';
  }
  const finishIfDurable = (saved) => {
    const next = String(saved || '').trim();
    if (mockAvatars.isDurableAvatarSrc(next)) {
      done({ ok: true, path: next });
      return;
    }
    done({ ok: false, path: '', reason: 'not_durable' });
  };
  const fs = typeof wx.getFileSystemManager === 'function' ? wx.getFileSystemManager() : null;
  if (fs && dest && typeof fs.saveFile === 'function') {
    fs.saveFile({
      tempFilePath: path,
      filePath: dest,
      success: (res) => finishIfDurable((res && res.savedFilePath) || dest),
      fail: () => {
        if (typeof fs.copyFile === 'function') {
          fs.copyFile({
            srcPath: path,
            destPath: dest,
            success: () => finishIfDurable(dest),
            fail: () => _wxSaveFileFallback(path, done)
          });
        } else {
          _wxSaveFileFallback(path, done);
        }
      }
    });
    return;
  }
  _wxSaveFileFallback(path, done);
}

function hasValidAvatarLocalPath(profile) {
  const p = profile && typeof profile === 'object' ? profile : {};
  const local = _normalizeAvatarLocalPath(p.avatarLocalPath);
  return !!(local && _localAvatarFileExists(local));
}

/**
 * 仅当 canonical 为 cloud:// 且本机 usr 缓存缺失时，后台下载并写入 avatarLocalPath。
 * 不改 canonical、不阻塞 UI、不给页面回调去替换 <image src>。
 * callback({ ok, skipped, path, reason })
 */
function ensureAvatarLocalCopy(callback) {
  const done = typeof callback === 'function' ? callback : function () {};
  if (_ensureAvatarLocalInflight) {
    done({ ok: false, skipped: true, reason: 'inflight' });
    return;
  }
  let profile;
  try {
    profile = loadProfile() || {};
  } catch (eLoad) {
    done({ ok: false, reason: 'load_failed' });
    return;
  }
  if (hasValidAvatarLocalPath(profile)) {
    done({ ok: true, skipped: true, path: _normalizeAvatarLocalPath(profile.avatarLocalPath) });
    return;
  }
  const canonical = String(profile.avatar || '').trim();
  if (!/^cloud:\/\//i.test(canonical)) {
    done({ ok: true, skipped: true, reason: 'not_cloud' });
    return;
  }
  if (typeof wx === 'undefined' || !wx.cloud || typeof wx.cloud.downloadFile !== 'function') {
    done({ ok: false, reason: 'download_unavailable' });
    return;
  }
  _ensureAvatarLocalInflight = true;
  wx.cloud.downloadFile({
    fileID: canonical,
    success: (res) => {
      const temp = String((res && res.tempFilePath) || '').trim();
      persistAvatarFile(temp, (saved) => {
        _ensureAvatarLocalInflight = false;
        const localPath = saved && saved.ok ? String(saved.path || '').trim() : '';
        if (!localPath || !mockAvatars.isDurableLocalUserFile(localPath)) {
          done({ ok: false, reason: 'persist_failed' });
          return;
        }
        try {
          commitAvatarLocalPath(localPath);
          done({ ok: true, path: localPath });
        } catch (eCommit) {
          done({ ok: false, reason: 'commit_failed' });
        }
      });
    },
    fail: () => {
      _ensureAvatarLocalInflight = false;
      done({ ok: false, reason: 'download_failed' });
    }
  });
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
  persistRegisterCompetitionDraft,
  persistAvatarFile,
  resolveDisplayAvatar,
  resolveCurrentUserAvatarDisplay,
  commitAvatarLocalPath,
  commitAvatarCanonicalAndLocal,
  discardUnusedAvatarLocalFile,
  hasValidAvatarLocalPath,
  ensureAvatarLocalCopy
};
