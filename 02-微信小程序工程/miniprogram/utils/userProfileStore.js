/**
 * 用户长期资料（本地持久化）
 * competitionName：竞技场景公开名称（报名/出发表/成绩榜等唯一来源）
 * nickname：社区昵称，不作为赛事显示名称
 */

const gameStore = require('./gameStore.js');

const STORAGE_KEY = 'gb_user_profile_v1';

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

function _baseFromCurrentUser() {
  const user = gameStore.getCurrentUser() || {};
  return {
    userId: user.userId || 'me',
    nickname: user.name || '',
    gender: user.gender || '',
    competitionName: ''
  };
}

function normalizeProfile(raw) {
  const base = _baseFromCurrentUser();
  const data = raw && typeof raw === 'object' ? raw : {};
  return {
    userId: data.userId || base.userId,
    nickname: data.nickname != null ? String(data.nickname) : base.nickname,
    // 性别唯一来源：用户个人资料；未设置时回退当前用户默认
    gender: data.gender != null && data.gender !== '' ? String(data.gender) : base.gender,
    competitionName: data.competitionName != null ? String(data.competitionName).trim() : ''
  };
}

/** 读取用户资料（storage + gameStore 默认昵称） */
function loadProfile() {
  return normalizeProfile(_readRaw());
}

/** 保存完整用户资料 */
function saveProfile(profile) {
  const next = normalizeProfile(profile);
  _writeRaw(next);
  return next;
}

/** 局部更新用户资料 */
function updateProfile(patch) {
  const current = loadProfile();
  return saveProfile(Object.assign({}, current, patch || {}));
}

/** 单独更新比赛名（唯一竞技名称来源） */
function setCompetitionName(competitionName) {
  return updateProfile({
    competitionName: competitionName != null ? String(competitionName).trim() : ''
  });
}

/**
 * 报名弹窗默认比赛名：优先 competitionName，回退 nickname
 */
function getRegisterCompetitionNameDefault(profile) {
  const p = profile || loadProfile();
  const competitionName = String(p.competitionName || '').trim();
  if (competitionName) return competitionName;
  return String(p.nickname || '').trim();
}

/**
 * 报名流程预留：读取当前弹窗可提交的比赛名（以用户最后一次编辑为准）
 * @param {string} draft 弹窗内可编辑值
 */
function resolveRegisterCompetitionName(draft) {
  const value = draft != null ? String(draft).trim() : '';
  if (value) return value;
  return getRegisterCompetitionNameDefault();
}

/**
 * 报名流程预留：将弹窗最终比赛名写回用户资料（非 registerInfo 写入）
 */
function persistRegisterCompetitionDraft(draft) {
  const value = resolveRegisterCompetitionName(draft);
  if (!value) return loadProfile();
  return setCompetitionName(value);
}

module.exports = {
  STORAGE_KEY,
  loadProfile,
  saveProfile,
  updateProfile,
  setCompetitionName,
  getRegisterCompetitionNameDefault,
  resolveRegisterCompetitionName,
  persistRegisterCompetitionDraft
};
