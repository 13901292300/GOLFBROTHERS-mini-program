const pageBoot = require('../../utils/pageBoot.js');
const nav = require('../../utils/nav.js');
const engine = require('../../utils/sideGameEngine.js');

Page({
  data: {
    headerRootStyle: '',
    headerBarStyle: '',
    hasMatchContext: false,
    hostReady: false,
    emptyHint: '',
    gameName: '游戏详情',
    players: [],
    rows: [],
    totals: []
  },

  onLoad(query) {
    var ctx = pageBoot.bootPage(this, query, {
      players: [],
      rows: [],
      totals: []
    });
    var rule = engine.findRule(ctx.ruleId);
    this.setData({
      gameName: rule ? rule.name : '游戏详情'
    });
  },

  onBack() {
    nav.navigateBackSafe(1);
  }
});
