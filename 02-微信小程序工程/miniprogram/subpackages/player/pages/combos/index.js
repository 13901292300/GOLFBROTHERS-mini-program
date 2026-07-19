/**
 * 组合选择页（记分页面「空位 → 添加方式」第二层入口之一）
 * - 展示使用频率最高的 6 个组合
 * - 点击某个组合 → 通过 openerEventChannel 回传，由记分页面按 slot 顺序一键批量填充
 */
const { createHeaderStyle } = require('../../../../utils/headerEngine.js');
const { PRESET_COMBOS } = require('../../../../utils/playerDirectory.js');

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    matchId: '',
    slotId: '',
    combos: []
  },

  onLoad(options) {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    const opt = options || {};
    // 本 Game 已占用 playerId（全局唯一）：组合内这些球员灰态，且填充时跳过
    const usedIds = opt.used ? decodeURIComponent(opt.used).split(',').filter(Boolean) : [];
    const usedSet = {};
    usedIds.forEach((id) => { usedSet[id] = true; });
    // 使用频率最高的 6 个组合
    const combos = PRESET_COMBOS.slice()
      .sort((a, b) => (b.useCount || 0) - (a.useCount || 0))
      .slice(0, 6)
      .map((c) => {
        const players = c.players.map((p) => ({ ...p, disabled: !!usedSet[p.playerId] }));
        const addable = players.filter((p) => !p.disabled).length;
        return { ...c, players, addable, allUsed: addable === 0 };
      });
    this.setData({
      matchId: opt.matchId || '',
      slotId: opt.slotId || '',
      combos
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

  selectCombo(e) {
    const combo = e.currentTarget.dataset.combo;
    if (!combo) return;
    if (combo.allUsed) return; // 组合内球员已全部在本场使用：仅视觉禁用
    const ch = this.getOpenerEventChannel && this.getOpenerEventChannel();
    if (ch && ch.emit) ch.emit('comboSelected', { combo });
    this.onBack();
  }
});
