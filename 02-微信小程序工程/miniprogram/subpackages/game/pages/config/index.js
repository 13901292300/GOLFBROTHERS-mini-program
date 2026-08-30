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
    ruleName: ''
  },

  onLoad(query) {
    var ctx = pageBoot.bootPage(this, query);
    var rule = engine.findRule(ctx.ruleId);
    this.setData({
      ruleName: rule ? rule.name : ''
    });
  },

  onBack() {
    nav.navigateBackSafe(1);
  }
});
