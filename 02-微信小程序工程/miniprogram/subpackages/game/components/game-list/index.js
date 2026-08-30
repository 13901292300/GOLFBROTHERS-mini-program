const pageBoot = require('../../utils/pageBoot.js');

Component({
  properties: {
    matchId: { type: String, value: '' },
    groupId: { type: String, value: '' },
    sideGameId: { type: String, value: '' },
    scope: { type: String, value: 'group' }
  },

  data: {
    games: [],
    showGlobalSettings: false,
    settingsLocked: true,
    global: { settingsOpen: true, privacy: 'group' },
    showMatchPrivacy: false,
    potRuleText: '',
    holeOrderText: '',
    windRuleText: '',
    emptyHint: pageBoot.EMPTY_HINT
  },

  lifetimes: {
    attached() {
      this.reload();
    }
  },

  methods: {
    hostQuery() {
      return pageBoot.parseQuery({
        matchId: this.properties.matchId,
        groupId: this.properties.groupId,
        sideGameId: this.properties.sideGameId,
        scope: this.properties.scope
      });
    },

    reload() {
      var ctx = this.hostQuery();
      var hasMatch = pageBoot.hasMatchContext(ctx);
      this.setData({
        games: [],
        showGlobalSettings: hasMatch,
        settingsLocked: !pageBoot.hasRepository(),
        showMatchPrivacy: ctx.scope === 'match',
        emptyHint: pageBoot.EMPTY_HINT
      });
    },

    toggleSettings() {
      this.setData({
        'global.settingsOpen': !this.data.global.settingsOpen
      });
    },

    setPrivacy(e) {
      var value = String((e.currentTarget.dataset || {}).value || '');
      if (value !== 'public' && value !== 'event' && value !== 'group') return;
      this.setData({ 'global.privacy': value });
    },

    onDonate() {
      wx.showToast({ title: pageBoot.EMPTY_HINT, icon: 'none' });
    },

    onHoleOrder() {
      wx.showToast({ title: pageBoot.EMPTY_HINT, icon: 'none' });
    },

    onWind() {
      wx.showToast({ title: pageBoot.EMPTY_HINT, icon: 'none' });
    },

    onSelectRule() {
      var ctx = this.hostQuery();
      if (!pageBoot.hasMatchContext(ctx) || !pageBoot.hasRepository()) {
        wx.showToast({ title: pageBoot.EMPTY_HINT, icon: 'none' });
        return;
      }
      wx.navigateTo({
        url: pageBoot.pageUrl('pages/catalog/index', ctx)
      });
    }
  }
});
