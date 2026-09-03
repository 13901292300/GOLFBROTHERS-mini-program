const pageBoot = require('../../utils/pageBoot.js');
const nav = require('../../utils/nav.js');
const repository = require('../../utils/sideGameRepository.js');
const hostSession = require('../../utils/sideGameHostSession.js');
const rec = require('../../utils/sideGameRecord.js');
const session = require('../../utils/sideGameBind.js');

Page({
  data: {
    headerRootStyle: '',
    headerBarStyle: '',
    hasMatchContext: false,
    hostReady: false,
    emptyHint: '',
    gameName: '游戏详情',
    record: null,
    partyLines: [],
    stale: false,
    resultText: '',
    canEdit: true
  },

  onLoad(query) {
    pageBoot.bootPage(this, query);
    this.reload();
  },

  onShow() {
    if (this._hostQuery) this.reload();
  },

  reload() {
    var id = this._hostQuery && this._hostQuery.sideGameId;
    var got = repository.getById(id);
    if (!got.ok) {
      this.setData({
        emptyHint: got.reason === 'not_found' ? '游戏不存在或已删除' : '无法读取游戏',
        record: null
      });
      return;
    }
    var row = got.data;
    session.attachHost(this._hostQuery);
    var host = hostSession.getHostContext(this._hostQuery) || {};
    var stale = rec.isResultStale(row, host);
    this.setData({
      gameName: row.title || row.ruleId,
      record: row,
      partyLines: (row.participantParties || []).map(function (p) {
        var face = session.presentPerson(p && p.partyId);
        if (face.partyType === 'combination' || face.partyType === 'side') {
          var memberNames = require('../../../../utils/comboDisplayName.js').joinMemberDisplayNames(
            face.members || []
          );
          return face.name + (memberNames ? '（' + memberNames + '）' : '');
        }
        return face.name;
      }),
      stale: stale,
      resultText: row.resultSnapshot ? '已有结算结果 rev ' + row.resultRevision : '尚未结算',
      emptyHint: ''
    });
  },

  onBack() {
    nav.navigateBackSafe(1);
  },

  onRefresh() {
    var row = this.data.record;
    if (!row) return;
    var host = hostSession.getHostContext(this._hostQuery) || {};
    var out = repository.refreshResult(row.sideGameId, host);
    if (!out.ok) {
      wx.showToast({ title: out.reason || '无法重算', icon: 'none' });
      return;
    }
    this.reload();
  },

  onEdit() {
    var row = this.data.record;
    if (!row) return;
    wx.navigateTo({
      url: pageBoot.pageUrl('pages/edit-rule/index', this._hostQuery, { ruleId: row.ruleId })
    });
  },

  onDelete() {
    var row = this.data.record;
    if (!row) return;
    var out = repository.remove(row.sideGameId, row.revision);
    if (!out.ok) {
      wx.showToast({ title: out.reason || '删除失败', icon: 'none' });
      return;
    }
    wx.showToast({ title: '已删除', icon: 'none' });
    nav.navigateBackSafe(1);
  }
});
