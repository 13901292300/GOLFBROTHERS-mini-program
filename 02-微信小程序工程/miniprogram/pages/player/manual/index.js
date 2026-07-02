/**
 * 手工添加页（记分页面「空位 → 添加方式」第二层入口之一）
 * - 搜索用户（球员目录，名称/拼音模糊匹配）
 * - 新建球员（输入姓名直接创建）
 * - 单人添加 → 通过 openerEventChannel 回传，由记分页面绑定到当前 slot 或第一个空位
 */
const { createHeaderStyle } = require('../../../utils/headerEngine.js');
const { FRIEND_LIST } = require('../../../utils/playerDirectory.js');
const mockAvatars = require('../../../utils/mockAvatars.js');

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
    usedIds.forEach((id) => { disabledMap[id] = true; });
    this.setData({
      matchId: opt.matchId || '',
      slotId: opt.slotId || '',
      disabledMap,
      results: FRIEND_LIST.slice(0, 8)
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
    this.setData({ query: q, results, showCreate });
  },

  clearSearch() {
    this.setData({ query: '', results: FRIEND_LIST.slice(0, 8), showCreate: false });
  },

  pickExisting(e) {
    const f = e.currentTarget.dataset.friend;
    if (!f) return;
    if (this.data.disabledMap[f.playerId]) return; // 已在本场使用：仅视觉禁用
    this._return({ playerId: f.playerId, name: f.name, avatar: f.avatar, source: 'friend' });
  },

  createNew() {
    const name = (this.data.query || '').trim();
    if (!name) {
      wx.showToast({ title: '请输入姓名', icon: 'none' });
      return;
    }
    this._return({
      playerId: 'm-' + Date.now(),
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
