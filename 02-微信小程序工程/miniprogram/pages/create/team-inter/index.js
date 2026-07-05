const { createHeaderStyle } = require('../../../utils/headerEngine.js');
const timeWheel = require('../../../utils/timeWheelBridge.js');

const DEFAULT_TEE = '2026-06-03 17:10';
const DEFAULT_DEADLINE = '2026-06-02 18:00';

Page({
  data: Object.assign(
    {
      themeClass: 'bright-mode',
      headerRootStyle: '',
      headerBarStyle: '',
      pageEyebrow: 'CREATE',
      pageTitle: '队际赛创建'
    },
    timeWheel.dualFieldPageData({
      teeTime: DEFAULT_TEE,
      deadlineTime: DEFAULT_DEADLINE,
      teeTimeText: DEFAULT_TEE,
      deadlineTimeText: DEFAULT_DEADLINE
    })
  ),

  onLoad() {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    timeWheel.initDualFieldPage(this, {
      teeTime: DEFAULT_TEE,
      deadlineTime: DEFAULT_DEADLINE
    });
  },

  onShow() {
    this.applyTheme(getApp().getTheme());
  },

  initHeaderNav() {
    const header = createHeaderStyle();
    this.setData({
      headerRootStyle: header.headerRootStyle,
      headerBarStyle: header.headerBarStyle
    });
  },

  applyTheme(theme) {
    this.setData({ themeClass: theme === 'dark' ? 'dark-mode' : 'bright-mode' });
  },

  onBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack({ delta: 1 });
    } else {
      wx.redirectTo({ url: '/pages/home/index' });
    }
  },

  onSubmit() {
    wx.showToast({ title: '创建功能开发中', icon: 'none' });
  },

  ...timeWheel.createDualFieldMethods()
});
