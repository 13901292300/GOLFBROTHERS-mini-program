const pageBoot = require('../../utils/pageBoot.js');

Component({
  properties: {
    matchId: { type: String, value: '' },
    groupId: { type: String, value: '' },
    sideGameId: { type: String, value: '' },
    scope: { type: String, value: 'group' }
  },

  data: {
    hasGames: false,
    emptyHint: pageBoot.EMPTY_HINT
  },

  lifetimes: {
    attached() {
      this.setData({
        hasGames: false,
        emptyHint: pageBoot.EMPTY_HINT
      });
    }
  },

  methods: {
    onAddGame() {
      wx.showToast({ title: pageBoot.EMPTY_HINT, icon: 'none' });
    },

    onManage() {
      var ctx = pageBoot.parseQuery({
        matchId: this.properties.matchId,
        groupId: this.properties.groupId,
        sideGameId: this.properties.sideGameId,
        scope: this.properties.scope
      });
      if (!pageBoot.hasMatchContext(ctx) || !pageBoot.hasRepository()) {
        wx.showToast({ title: pageBoot.EMPTY_HINT, icon: 'none' });
        return;
      }
      wx.navigateTo({
        url: pageBoot.pageUrl('pages/list/index', ctx)
      });
    }
  }
});
