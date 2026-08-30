const pageBoot = require('../../utils/pageBoot.js');
const gameHostContext = require('../../utils/gameHostContext.js');

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function summarize(host, invalid) {
  var lines = [];
  if (invalid) {
    lines.push('比赛上下文无法解析');
    return lines;
  }
  var ctx = host && typeof host === 'object' ? host : {};
  if (asString(ctx.matchId)) lines.push('比赛 ' + ctx.matchId);
  if (ctx.scope === 'group' && asString(ctx.groupId)) lines.push('本组 ' + ctx.groupId);
  if (ctx.scope === 'match' && asString(ctx.matchId)) lines.push('全场可选方');
  if (ctx.holeContextReady) {
    lines.push('洞序 ' + ((ctx.holeOrder && ctx.holeOrder.length) || 0) + ' 洞');
  } else if (asString(ctx.matchId)) {
    lines.push('成绩上下文暂不可用');
  }
  var n = Array.isArray(ctx.scoreParties) ? ctx.scoreParties.length : 0;
  if (n) lines.push('可结算 ' + n + ' 方');
  return lines;
}

function normalizeSnapshot(snap) {
  if (snap == null || typeof snap !== 'object' || Array.isArray(snap)) {
    return { ok: false, ctx: gameHostContext.emptyContext() };
  }
  try {
    var ctx = gameHostContext.buildFromHostSnapshot(snap);
    if (!ctx || typeof ctx !== 'object') {
      return { ok: false, ctx: gameHostContext.emptyContext() };
    }
    return { ok: true, ctx: ctx };
  } catch (e) {
    return { ok: false, ctx: gameHostContext.emptyContext() };
  }
}

Component({
  properties: {
    matchId: { type: String, value: '' },
    groupId: { type: String, value: '' },
    sideGameId: { type: String, value: '' },
    scope: { type: String, value: 'group' },
    hostSnapshot: { type: Object, value: {} }
  },

  data: {
    hasGames: false,
    emptyHint: pageBoot.EMPTY_HINT,
    summaryLines: [],
    hostContext: {}
  },

  observers: {
    hostSnapshot: function (snap) {
      this._applySnapshot(snap);
    }
  },

  lifetimes: {
    attached() {
      this._applySnapshot(this.properties.hostSnapshot);
    }
  },

  methods: {
    _applySnapshot(snap) {
      var result = normalizeSnapshot(snap);
      var ctx = result.ctx;
      this.setData({
        hasGames: false,
        emptyHint: pageBoot.EMPTY_HINT,
        hostContext: result.ok ? ctx : {},
        summaryLines: summarize(ctx, !result.ok)
      });
    },

    onAddGame() {
      wx.showToast({ title: pageBoot.EMPTY_HINT, icon: 'none' });
    },

    onManage() {
      var host = this.data.hostContext || {};
      var ctx = pageBoot.parseQuery({
        matchId: asString(host.matchId) || this.properties.matchId,
        groupId: asString(host.groupId) || this.properties.groupId,
        sideGameId: this.properties.sideGameId,
        scope: asString(host.scope) || this.properties.scope
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
