/**
 * 手工添加页（记分页面「空位 → 添加方式」第二层入口之一）
 * - 搜索用户（球员目录，名称/拼音模糊匹配）
 * - 新建球员（输入姓名直接创建）
 * - 单人添加 → 通过 openerEventChannel 回传，由记分页面绑定到当前 slot 或第一个空位
 */
const { createHeaderStyle } = require('../../../../utils/headerEngine.js');
const { FRIEND_LIST } = require('../../../../utils/playerDirectory.js');
const mockAvatars = require('../../../../utils/mockAvatars.js');
const userIdentityAlias = require('../../../../utils/userIdentityAlias.js');

function randomSuffix() {
  return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function createGuestUserId() {
  return 'guest_' + randomSuffix();
}

function createManualPlayerId() {
  return 'm_' + randomSuffix();
}

function resolveCanonicalUserId(userId) {
  const id = String(userId || '').trim();
  if (!id) return '';
  try {
    return String(userIdentityAlias.resolveCanonicalUserId(id) || id).trim() || id;
  } catch (e) {
    return id;
  }
}

function collectIdentityKeys(userId) {
  const id = String(userId || '').trim();
  if (!id) return [];
  const keys = {};
  keys[id] = true;
  const canonicalId = resolveCanonicalUserId(id);
  if (canonicalId) keys[canonicalId] = true;
  try {
    (userIdentityAlias.getAliases(id) || []).forEach((alias) => {
      if (alias && alias.fromUserId) keys[String(alias.fromUserId).trim()] = true;
      if (alias && alias.toUserId) keys[String(alias.toUserId).trim()] = true;
    });
    if (canonicalId && canonicalId !== id) {
      (userIdentityAlias.getAliases(canonicalId) || []).forEach((alias) => {
        if (alias && alias.fromUserId) keys[String(alias.fromUserId).trim()] = true;
        if (alias && alias.toUserId) keys[String(alias.toUserId).trim()] = true;
      });
    }
  } catch (e) {}
  return Object.keys(keys).filter(Boolean);
}

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    matchId: '',
    slotId: '',
    query: '',
    results: [],
    disabledMap: {},
    showCreate: false
  },

  onLoad(options) {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    const opt = options || {};
    const usedIds = opt.used ? decodeURIComponent(opt.used).split(',').filter(Boolean) : [];
    const disabledMap = {};
    usedIds.forEach((id) => {
      collectIdentityKeys(id).forEach((key) => { disabledMap[key] = true; });
    });
    this.setData({
      matchId: opt.matchId || '',
      slotId: opt.slotId || '',
      disabledMap,
      results: this._withDisabledState(FRIEND_LIST.slice(0, 8), disabledMap)
    });
  },

  onShow() {
    this.applyTheme(getApp().getTheme());
  },

  applyTheme(theme) {
    this.setData({ themeClass: theme === 'dark' ? 'dark-mode' : 'bright-mode' });
  },

  initHeaderNav() {
    const header = createHeaderStyle();
    this.setData({ headerRootStyle: header.headerRootStyle, headerBarStyle: header.headerBarStyle });
  },

  onBack() {
    if (getCurrentPages().length > 1) wx.navigateBack({ delta: 1 });
    else wx.redirectTo({ url: '/pages/home/index' });
  },

  onSearchInput(e) {
    const q = (e.detail.value || '').trim();
    const lower = q.toLowerCase();
    let results;
    let showCreate = false;
    if (!q) {
      results = FRIEND_LIST.slice(0, 8);
    } else {
      results = FRIEND_LIST.filter(
        (f) => f.name.toLowerCase().includes(lower) || (f.pinyin || '').includes(lower)
      );
      const exact = results.some((f) => f.name.toLowerCase() === lower);
      showCreate = !exact;
    }
    this.setData({ query: q, results: this._withDisabledState(results, this.data.disabledMap), showCreate });
  },

  clearSearch() {
    this.setData({
      query: '',
      results: this._withDisabledState(FRIEND_LIST.slice(0, 8), this.data.disabledMap),
      showCreate: false
    });
  },

  _isPlayerDisabled(playerId) {
    const map = this.data.disabledMap || {};
    return collectIdentityKeys(playerId).some((key) => !!map[key]);
  },

  _withDisabledState(list, disabledMap) {
    const map = disabledMap || this.data.disabledMap || {};
    return (Array.isArray(list) ? list : []).map((item) => {
      const playerId = item && (item.playerId || item.userId || item.id);
      const disabled = collectIdentityKeys(playerId).some((key) => !!map[key]);
      return Object.assign({}, item, { disabled: disabled });
    });
  },

  pickExisting(e) {
    const f = e.currentTarget.dataset.friend;
    if (!f) return;
    if (f.disabled || this._isPlayerDisabled(f.playerId || f.userId || f.id)) return;
    this._return({ playerId: f.playerId, name: f.name, avatar: f.avatar, source: 'friend' });
  },

  createNew() {
    const name = (this.data.query || '').trim();
    if (!name) {
      wx.showToast({ title: '请输入姓名', icon: 'none' });
      return;
    }
    this._return({
      userId: createGuestUserId(),
      playerId: createManualPlayerId(),
      userType: 'guest',
      identitySource: 'manual_add',
      name,
      avatar: mockAvatars.pickMockAvatar(name),
      source: 'manual'
    });
  },

  _return(player) {
    const ch = this.getOpenerEventChannel && this.getOpenerEventChannel();
    if (ch && ch.emit) ch.emit('playerPicked', { player });
    this.onBack();
  }
});
