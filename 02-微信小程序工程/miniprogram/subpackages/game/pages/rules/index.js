const pageBoot = require('../../utils/pageBoot.js');
const nav = require('../../utils/nav.js');

Page({
  data: {
    headerRootStyle: '',
    headerBarStyle: '',
    myRules: [],
    hasMatchContext: false,
    emptyHint: ''
  },

  onLoad(query) {
    pageBoot.bootPage(this, query, { myRules: [] });
  },

  onBack() {
    nav.navigateBackSafe(1);
  },

  onAdd() {
    if (!this.data.hasMatchContext) {
      wx.showToast({ title: pageBoot.EMPTY_HINT, icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: pageBoot.pageUrl('pages/catalog/index', this._hostQuery)
    });
  }
});
