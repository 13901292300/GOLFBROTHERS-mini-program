/**
 * 旧启动路径兼容页：体验版/旧二维码若仍指向 pages/index/index，
 * 立即跳转到真实首页，不展示云开发 QuickStart 内容。
 */
Page({
  onLoad() {
    wx.reLaunch({
      url: '/pages/home/index'
    });
  }
});
