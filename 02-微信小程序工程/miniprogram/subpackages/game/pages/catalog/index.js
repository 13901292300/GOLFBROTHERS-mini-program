const pageBoot = require('../../utils/pageBoot.js');
const nav = require('../../utils/nav.js');
const engine = require('../../utils/sideGameEngine.js');

function groupRules(rules) {
  var buckets = {};
  var order = [];
  (rules || []).forEach(function (item) {
    if (!item || item.hidden) return;
    var key = String(item.players || 'multi');
    if (!buckets[key]) {
      buckets[key] = {
        groupId: key,
        group: item.players > 4 ? '多人' : item.players + '人',
        items: []
      };
      order.push(key);
    }
    buckets[key].items.push(item);
  });
  return order.map(function (key) {
    return buckets[key];
  });
}

Page({
  data: {
    headerRootStyle: '',
    headerBarStyle: '',
    catalogGroups: [],
    hasMatchContext: false,
    emptyHint: ''
  },

  onLoad(query) {
    var ctx = pageBoot.bootPage(this, query);
    var groups = [];
    if (pageBoot.hasMatchContext(ctx)) {
      groups = groupRules(engine.listRules());
    }
    this.setData({ catalogGroups: groups });
  },

  onBack() {
    nav.navigateBackSafe(1);
  },

  onCatalogTap(e) {
    if (!this.data.hasMatchContext || !pageBoot.hasRepository()) {
      wx.showToast({ title: pageBoot.EMPTY_HINT, icon: 'none' });
      return;
    }
    var id = String((e.currentTarget.dataset || {}).ruleId || '').trim();
    var rule = engine.findRule(id);
    if (!rule) {
      wx.showToast({ title: '未找到该玩法', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: pageBoot.pageUrl('pages/config/index', this._hostQuery, { ruleId: rule.id })
    });
  }
});
