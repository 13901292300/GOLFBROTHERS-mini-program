/**
 * 赛事统计数据页（UI 骨架）
 * - 仅占位展示，不接 scoreData / 不计算真实统计
 * - 未来真实数据接入后：默认按 TOTAL 升序排序
 */
const mockAvatars = require('../../../utils/mockAvatars.js');

/** Placeholder rows only — no scoring logic */
const TEE_MARKER_CLASSES = ['border-red', 'border-gold', 'border-white', 'border-light'];

function buildPlaceholderRows() {
  const names = [
    { name: '达尔文', genderIcon: '♂', genderClass: 'gender-male' },
    { name: '荣刚', genderIcon: '♂', genderClass: 'gender-male' },
    { name: '李四', genderIcon: '♀', genderClass: 'gender-female' },
    { name: '北京之巅', genderIcon: '♂', genderClass: 'gender-male' }
  ];
  return names.map((item, index) => ({
    id: 'placeholder-' + index,
    avatar: mockAvatars.pickMockAvatar(item.name),
    name: item.name,
    genderIcon: item.genderIcon,
    genderClass: item.genderClass,
    teeMarkerClass: TEE_MARKER_CLASSES[index % TEE_MARKER_CLASSES.length],
    eag: '-',
    bir: '-',
    par: '-',
    bog: '-',
    dbl: '-',
    gir: '-',
    putts: '-',
    fwy: '-',
    sand: '-',
    pen: '-',
    score8421: '-',
    total: '-'
  }));
}

Page({
  data: {
    statusBarHeight: 20,
    matchId: '',
    themeClass: 'bright-mode',
    title: 'Player Statistics',
    subtitle: '赛事统计 · 骨架预览',
    // Future: sort by TOTAL ascending when real data is wired
    defaultSortNote: 'TOTAL asc',
    rows: []
  },

  onLoad(options) {
    const matchId = options && options.matchId ? String(options.matchId) : '';
    let statusBarHeight = 20;
    try {
      const sys = wx.getSystemInfoSync();
      statusBarHeight = sys.statusBarHeight || 20;
    } catch (e) {
      statusBarHeight = 20;
    }
    this.setData({
      matchId: matchId,
      statusBarHeight: statusBarHeight,
      themeClass: this._resolveThemeClass(),
      rows: buildPlaceholderRows()
    });
    this._applyPageBackground();
    this._lockLandscape();
  },

  onShow() {
    const themeClass = this._resolveThemeClass();
    if (themeClass !== this.data.themeClass) {
      this.setData({ themeClass: themeClass });
    }
    this._applyPageBackground();
    this._lockLandscape();
  },

  _resolveThemeClass() {
    try {
      const app = getApp();
      const theme = app && typeof app.getTheme === 'function' ? app.getTheme() : 'light';
      return theme === 'dark' ? 'dark-mode' : 'bright-mode';
    } catch (e) {
      return 'bright-mode';
    }
  },

  _applyPageBackground() {
    const dark = this._resolveThemeClass() === 'dark-mode';
    if (typeof wx.setBackgroundColor === 'function') {
      wx.setBackgroundColor({
        backgroundColor: dark ? '#000000' : '#f0f2f5',
        backgroundColorTop: dark ? '#000000' : '#f0f2f5',
        backgroundColorBottom: dark ? '#000000' : '#f0f2f5'
      });
    }
  },

  onUnload() {
    this._restorePortrait();
  },

  onHide() {
    // Leaving via navigateBack usually unloads; restore here as a safety net
  },

  _lockLandscape() {
    if (typeof wx.setPageOrientation === 'function') {
      wx.setPageOrientation({ orientation: 'landscape' });
    }
  },

  _restorePortrait() {
    if (typeof wx.setPageOrientation === 'function') {
      wx.setPageOrientation({ orientation: 'portrait' });
    }
  },

  onBack() {
    this._restorePortrait();
    wx.navigateBack({
      fail: () => {
        wx.reLaunch({ url: '/pages/home/index' });
      }
    });
  }
});
