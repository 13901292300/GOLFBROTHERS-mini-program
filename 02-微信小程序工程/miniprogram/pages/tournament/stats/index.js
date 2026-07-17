/**
 * 赛事统计数据页（UI 骨架）
 * - 仅 mock 展示，不接 scoreData / 不计算真实统计
 * - sortField/sortOrder 保持 total/asc；mock 按 TOTAL 升序预制，不另写排序逻辑
 */
const mockAvatars = require('../../../utils/mockAvatars.js');

const TEE_COLOR_TO_MARKER = {
  '#dc2626': 'border-red',
  '#ce9224': 'border-gold',
  '#ffffff': 'border-white',
  '#111827': 'border-white',
  '#00aeef': 'border-light'
};

/**
 * Mock 统计球员（仅 UI 验证）
 * 数组顺序已按 total 升序，对齐默认 sortField=total / sortOrder=asc
 */
const mockStatisticsPlayers = [
  {
    playerId: 'mock-p1',
    avatar: '',
    name: '张三',
    gender: 'male',
    genderIcon: '♂',
    teeColor: '#dc2626',
    eagle: 0,
    birdie: 4,
    par: 10,
    bogey: 3,
    doublePlus: 1,
    girPercent: '72%',
    putts: 28,
    fairwayPercent: '80%',
    sand: 1,
    penalty: 0,
    stat8421: 12,
    total: 68
  },
  {
    playerId: 'mock-p2',
    avatar: '',
    name: 'Alexander Thompson',
    gender: 'male',
    genderIcon: '♂',
    teeColor: '#00aeef',
    eagle: 1,
    birdie: 5,
    par: 8,
    bogey: 3,
    doublePlus: 1,
    girPercent: '100%',
    putts: 26,
    fairwayPercent: '100%',
    sand: 0,
    penalty: 0,
    stat8421: 128,
    total: 69
  },
  {
    playerId: 'mock-p3',
    avatar: '',
    name: '王小明',
    gender: 'female',
    genderIcon: '♀',
    teeColor: '#ffffff',
    eagle: 0,
    birdie: 3,
    par: 11,
    bogey: 3,
    doublePlus: 1,
    girPercent: '55%',
    putts: 30,
    fairwayPercent: '40%',
    sand: 2,
    penalty: 1,
    stat8421: 8,
    total: 71
  },
  {
    playerId: 'mock-p4',
    avatar: '',
    name: '李四',
    gender: 'male',
    genderIcon: '♂',
    teeColor: '#dc2626',
    eagle: 0,
    birdie: 2,
    par: 12,
    bogey: 3,
    doublePlus: 1,
    girPercent: '61%',
    putts: 20,
    fairwayPercent: '57%',
    sand: '-',
    penalty: 0,
    stat8421: 6,
    total: 72
  },
  {
    playerId: 'mock-p5',
    avatar: '',
    name: 'Emily Watson',
    gender: 'female',
    genderIcon: '♀',
    teeColor: '#00aeef',
    eagle: 0,
    birdie: 1,
    par: 10,
    bogey: 5,
    doublePlus: 2,
    girPercent: '44%',
    putts: 34,
    fairwayPercent: '50%',
    sand: 3,
    penalty: 2,
    stat8421: 18,
    total: 74
  },
  {
    playerId: 'mock-p6',
    avatar: '',
    name: '陈美丽',
    gender: 'female',
    genderIcon: '♀',
    teeColor: '#ffffff',
    eagle: 0,
    birdie: 2,
    par: 9,
    bogey: 5,
    doublePlus: 2,
    girPercent: '50%',
    putts: 31,
    fairwayPercent: '64%',
    sand: 1,
    penalty: 1,
    stat8421: 9,
    total: 75
  },
  {
    playerId: 'mock-p7',
    avatar: '',
    name: '赵六',
    gender: 'male',
    genderIcon: '♂',
    teeColor: '#dc2626',
    eagle: 0,
    birdie: 1,
    par: 8,
    bogey: 6,
    doublePlus: 3,
    girPercent: '38%',
    putts: 36,
    fairwayPercent: '42%',
    sand: 2,
    penalty: 2,
    stat8421: 5,
    total: 78
  },
  {
    playerId: 'mock-p8',
    avatar: '',
    name: 'Christopher Johnson',
    gender: 'male',
    genderIcon: '♂',
    teeColor: '#00aeef',
    eagle: 0,
    birdie: 0,
    par: 7,
    bogey: 7,
    doublePlus: 4,
    girPercent: '33%',
    putts: 38,
    fairwayPercent: '36%',
    sand: 4,
    penalty: 3,
    stat8421: 3,
    total: 80
  },
  {
    playerId: 'mock-p9',
    avatar: '',
    name: '北京之巅',
    gender: 'male',
    genderIcon: '♂',
    teeColor: '#ffffff',
    eagle: 0,
    birdie: 0,
    par: 6,
    bogey: 8,
    doublePlus: 4,
    girPercent: '28%',
    putts: 39,
    fairwayPercent: '40%',
    sand: 5,
    penalty: 2,
    stat8421: 2,
    total: 82
  },
  {
    playerId: 'mock-p10',
    avatar: '',
    name: 'TigerHoods Jr',
    gender: 'male',
    genderIcon: '♂',
    teeColor: '#dc2626',
    eagle: 0,
    birdie: 0,
    par: 5,
    bogey: 8,
    doublePlus: 5,
    girPercent: '22%',
    putts: 40,
    fairwayPercent: '29%',
    sand: 6,
    penalty: 4,
    stat8421: 1,
    total: 85
  }
];

function resolveTeeMarkerClass(teeColor) {
  const key = String(teeColor || '').trim().toLowerCase();
  if (TEE_COLOR_TO_MARKER[key]) return TEE_COLOR_TO_MARKER[key];
  if (key === '#fff' || key === 'white') return 'border-white';
  return 'border-white';
}

function isZeroLike(value) {
  return value === 0 || value === '0' || value === '-' || value === '';
}

/**
 * 将 mock 映射为表格行（兼容现有 WXML）
 * 不在此处排序——顺序依赖 mockStatisticsPlayers 预制顺序与默认 sort 状态
 */
function mapMockPlayersToRows(players) {
  const list = Array.isArray(players) ? players : [];
  return list.map((p, index) => {
    const gender = p.gender === 'female' ? 'female' : 'male';
    const genderIcon = p.genderIcon || (gender === 'female' ? '♀' : '♂');
    const name = String(p.name || '').trim() || '未知球员';
    return {
      id: p.playerId || ('mock-' + index),
      playerId: p.playerId || ('mock-' + index),
      avatar: p.avatar || mockAvatars.pickMockAvatar(name),
      name: name,
      gender: gender,
      genderIcon: genderIcon,
      genderClass: gender === 'female' ? 'gender-female' : 'gender-male',
      teeColor: p.teeColor || '#ffffff',
      teeMarkerClass: resolveTeeMarkerClass(p.teeColor),
      eagle: p.eagle,
      birdie: p.birdie,
      par: p.par,
      bogey: p.bogey,
      doublePlus: p.doublePlus,
      girPercent: p.girPercent,
      putts: p.putts,
      fairwayPercent: p.fairwayPercent,
      sand: p.sand,
      penalty: p.penalty,
      stat8421: p.stat8421,
      total: p.total,
      eag: p.eagle,
      bir: p.birdie,
      bog: p.bogey,
      dbl: p.doublePlus,
      gir: p.girPercent,
      fwy: p.fairwayPercent,
      pen: p.penalty,
      score8421: p.stat8421,
      eagMuted: isZeroLike(p.eagle),
      birMuted: isZeroLike(p.birdie),
      sandMuted: isZeroLike(p.sand)
    };
  });
}

Page({
  data: {
    statusBarHeight: 20,
    matchId: '',
    themeClass: 'bright-mode',
    title: 'Player Statistics',
    subtitle: '赛事统计 · Mock 预览',
    defaultSortNote: 'TOTAL asc',
    sortField: 'total',
    sortOrder: 'asc',
    mockStatisticsPlayers: mockStatisticsPlayers,
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
      sortField: 'total',
      sortOrder: 'asc',
      rows: this._loadMockStatisticsRows()
    });
    this._applyPageBackground();
    this._lockLandscape();
  },

  /**
   * 经默认排序状态入口加载 mock（不另写排序算法）
   * 依赖：sortField=total + sortOrder=asc + mock 预制升序
   */
  _loadMockStatisticsRows() {
    return mapMockPlayersToRows(mockStatisticsPlayers);
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

  onHide() {},

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
  },

  /**
   * 表头排序指示（仅 UI）：同一时间只高亮一个字段，暂不重排 mock 数据
   */
  onSortHeaderTap(e) {
    const field = e && e.currentTarget && e.currentTarget.dataset
      ? String(e.currentTarget.dataset.field || '').trim()
      : '';
    if (!field) return;
    if (field === this.data.sortField) return;
    this.setData({
      sortField: field,
      sortOrder: 'asc'
    });
  }
});
