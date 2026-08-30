const pageBoot = require('../../utils/pageBoot.js');
const nav = require('../../utils/nav.js');

Page({
  data: {
    headerRootStyle: '',
    headerBarStyle: '',
    matchId: '',
    groupId: '',
    sideGameId: '',
    scope: 'group',
    hasMatchContext: false,
    emptyHint: ''
  },

  onLoad(query) {
    pageBoot.bootPage(this, query);
  },

  onBack() {
    nav.navigateBackSafe(1);
  }
});
