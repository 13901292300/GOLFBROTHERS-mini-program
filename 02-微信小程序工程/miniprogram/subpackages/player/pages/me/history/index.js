/**
 * 历史成绩 — 我的个人球局历史列表（UI + mock）
 * 统一展示：普通球局 / 队内赛 / 队际赛 / 系列赛，按时间倒序
 */
const { createHeaderStyle } = require('../../../../../utils/headerEngine.js');
const { BLUE_T, RED_T } = require('../../../../../utils/tPosition.js');

/** mock：个人参加过的球局（非赛事中心） */
const MOCK_ROUNDS = [
  {
    id: 'r-20260801',
    totalScore: 82,
    toPar: '+10',
    tPosition: BLUE_T,
    courseName: '松林高尔夫球场',
    datetime: '2026.08.01 07:30',
    tags: ['队内赛', '四人四球'],
    playedAt: '2026-08-01T07:30:00'
  },
  {
    id: 'r-20260728',
    totalScore: 72,
    toPar: 'E',
    tPosition: BLUE_T,
    courseName: '观澜湖高尔夫球会 · 海口',
    datetime: '2026.07.28 08:00',
    tags: ['普通球局', '个人比杆'],
    playedAt: '2026-07-28T08:00:00'
  },
  {
    id: 'r-20260720',
    totalScore: 78,
    toPar: '+6',
    tPosition: RED_T,
    courseName: '深圳正中高尔夫俱乐部',
    datetime: '2026.07.20 13:20',
    tags: ['队际赛', '比洞赛'],
    playedAt: '2026-07-20T13:20:00'
  },
  {
    id: 'r-20260712',
    totalScore: 70,
    toPar: '-2',
    tPosition: BLUE_T,
    courseName: '昆明春城湖畔度假村',
    datetime: '2026.07.12 06:50',
    tags: ['系列赛', '个人比杆'],
    playedAt: '2026-07-12T06:50:00'
  },
  {
    id: 'r-20260630',
    totalScore: 85,
    toPar: '+13',
    tPosition: RED_T,
    courseName: '上海佘山国际高尔夫俱乐部',
    datetime: '2026.06.30 09:10',
    tags: ['普通球局', '四人两球'],
    playedAt: '2026-06-30T09:10:00'
  },
  {
    id: 'r-20260615',
    totalScore: 76,
    toPar: '+4',
    tPosition: BLUE_T,
    courseName: '广州仙村国际高尔夫球会',
    datetime: '2026.06.15 07:00',
    tags: ['队内赛', '个人比杆'],
    playedAt: '2026-06-15T07:00:00'
  },
  {
    id: 'r-20260522',
    totalScore: 79,
    toPar: '+7',
    tPosition: BLUE_T,
    courseName: '北京华彬庄园高尔夫',
    datetime: '2026.05.22 14:00',
    tags: ['系列赛', '稳定杆差'],
    playedAt: '2026-05-22T14:00:00'
  },
  {
    id: 'r-20260508',
    totalScore: 74,
    toPar: '+2',
    tPosition: RED_T,
    courseName: '海南美兰高尔夫球会',
    datetime: '2026.05.08 08:30',
    tags: ['队际赛', '四人四球'],
    playedAt: '2026-05-08T08:30:00'
  }
];

function toListItem(round) {
  const teeClass = round.tPosition === RED_T ? 'hist-score--red' : 'hist-score--blue';
  return {
    id: round.id,
    totalScore: round.totalScore,
    toPar: round.toPar,
    teeClass: teeClass,
    courseName: round.courseName,
    datetime: round.datetime,
    tags: round.tags || []
  };
}

function buildSortedList() {
  return MOCK_ROUNDS.slice()
    .sort((a, b) => String(b.playedAt).localeCompare(String(a.playedAt)))
    .map(toListItem);
}

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    rounds: []
  },

  onLoad() {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    this.setData({ rounds: buildSortedList() });
  },

  onShow() {
    this.applyTheme(getApp().getTheme());
  },

  initHeaderNav() {
    const styles = createHeaderStyle();
    this.setData({
      headerRootStyle: styles.headerRootStyle,
      headerBarStyle: styles.headerBarStyle
    });
  },

  applyTheme(theme) {
    this.setData({ themeClass: theme === 'dark' ? 'dark-mode' : 'bright-mode' });
  },

  onBack() {
    wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/home/index' }) });
  }
});
