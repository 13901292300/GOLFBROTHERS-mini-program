const pageBoot = require('../../utils/pageBoot.js');
const nav = require('../../utils/nav.js');

Page({
  data: {
    headerRootStyle: '',
    headerBarStyle: '',
    hasMatchContext: false,
    emptyHint: '',
    players: []
  },

  onLoad(query) {
    pageBoot.bootPage(this, query, { players: [] });
  },

  onBack() {
    nav.navigateBackSafe(1);
  }
});
