/**
 * 权限管理弹窗（临时管理员二维码 + 球童记分员）
 * - 普通 detail / Series detail 共用
 * - 写入权威字段：tempAdmins / tempAdminAccess / caddieScoringAccess
 */

var teamMatchStore = require('../../utils/teamMatchStore.js');
var gameStore = require('../../utils/gameStore.js');
var matchManageAccess = require('../../utils/matchManageAccess.js');
var tempAdminPermission = require('../../utils/tempAdminPermission.js');
var tempAdminAccess = require('../../utils/tempAdminAccess.js');
var caddieScoringAccess = require('../../utils/caddieScoringAccess.js');
var teamMatchMoreMenu = require('../../utils/teamMatchMoreMenu.js');
var demoJiaobeiMatch = require('../../utils/demoJiaobeiMatch.js');

Component({
  properties: {
    visible: { type: Boolean, value: false },
    matchId: { type: String, value: '' },
    /** Series 轮次副标题；空则不渲染 */
    roundSubtitle: { type: String, value: '' },
    themeClass: { type: String, value: '' }
  },

  data: {
    sheetReady: false,
    saving: false,
    adminQrHasQr: false,
    adminQrUrl: '',
    adminQrGenerating: false,
    adminQrExpanded: true,
    adminQrAdminList: [],
    expandedAdminUserId: '',
    caddieScoringHasQr: false,
    caddieScoringQrUrl: '',
    caddieScoringGenerating: false,
    caddieQrExpanded: true,
    caddieScorerList: [],
    caddieManageSheetVisible: false,
    caddieManageTarget: null
  },

  lifetimes: {
    attached: function () {
      this._alive = true;
      this._targetMatchId = '';
      this._grantableFeatures = null;
      this._adminDraftDemotions = [];
      this._saving = false;
      this._openSeq = 0;
    },
    detached: function () {
      this._alive = false;
      this._targetMatchId = '';
      this._grantableFeatures = null;
      this._adminDraftDemotions = [];
      this._saving = false;
    }
  },

  observers: {
    visible: function (v) {
      if (v) {
        this._openSheet();
      } else {
        this._resetLocalState(false);
      }
    }
  },

  methods: {
    stopPropagation: function () {},

    _safeSetData: function (patch) {
      if (!this._alive) return;
      this.setData(patch);
    },

    _asId: function (v) {
      return v == null ? '' : String(v).trim();
    },

    _loadTargetMatch: function () {
      var id = this._asId(this._targetMatchId);
      if (!id || demoJiaobeiMatch.isJiaobeiDemoMatchId(id)) return null;
      var match = teamMatchStore.getMatchById(id);
      if (!match) return null;
      if (this._asId(match.matchId) !== id) return null;
      return match;
    },

    _resolveGrantableFeatures: function (match) {
      var status = this._asId(match && match.status).toLowerCase();
      var isRegistering = status === 'registering';
      var source = isRegistering
        ? teamMatchMoreMenu.REGISTERING_FEATURES_PERMISSION
        : teamMatchMoreMenu.FEATURES_PERMISSION;
      if (!isRegistering && teamMatchMoreMenu.canToggleRegistrationStatus(match)) {
        var list = source.slice();
        var hasClose = list.some(function (f) {
          return f && f.permission === 'close_registration';
        });
        if (!hasClose) {
          var insertAt = list.findIndex(function (f) {
            return f && f.permission === 'manage_payment';
          });
          var feature = {
            permission: 'close_registration',
            glyph: '🔒',
            label: '关闭报名',
            tone: ''
          };
          if (insertAt >= 0) list.splice(insertAt + 1, 0, feature);
          else list.push(feature);
        }
        source = list;
      }
      return tempAdminPermission.buildGrantableFeatures(source);
    },

    _withAdminExpandState: function (list) {
      var expandedId = this._asId(this.data.expandedAdminUserId);
      return (Array.isArray(list) ? list : []).map(function (item) {
        return Object.assign({}, item, {
          expanded: !!(item && String(item.userId) === expandedId)
        });
      });
    },

    _resetLocalState: function (keepReady) {
      this._grantableFeatures = null;
      this._adminDraftDemotions = [];
      this._saving = false;
      this._safeSetData({
        sheetReady: !!keepReady,
        saving: false,
        adminQrHasQr: false,
        adminQrUrl: '',
        adminQrGenerating: false,
        adminQrExpanded: true,
        adminQrAdminList: [],
        expandedAdminUserId: '',
        caddieScoringHasQr: false,
        caddieScoringQrUrl: '',
        caddieScoringGenerating: false,
        caddieQrExpanded: true,
        caddieScorerList: [],
        caddieManageSheetVisible: false,
        caddieManageTarget: null
      });
    },

    _openSheet: function () {
      var seq = (this._openSeq = (this._openSeq || 0) + 1);
      var matchId = this._asId(this.properties.matchId);
      this._targetMatchId = matchId;
      this._adminDraftDemotions = [];
      this._saving = false;

      if (!matchId || demoJiaobeiMatch.isJiaobeiDemoMatchId(matchId)) {
        wx.showToast({ title: '当前为演示模式', icon: 'none' });
        this.triggerEvent('close');
        return;
      }
      var match = teamMatchStore.getMatchById(matchId);
      if (!match || this._asId(match.matchId) !== matchId) {
        wx.showToast({ title: '赛事数据缺失', icon: 'none' });
        this.triggerEvent('close');
        return;
      }
      if (!matchManageAccess.canManageTempAdmins(match, gameStore.getCurrentUser())) {
        wx.showToast({ title: '暂无权限管理权限', icon: 'none' });
        this.triggerEvent('close');
        return;
      }
      if (!this._alive || seq !== this._openSeq) return;

      var grantable = this._resolveGrantableFeatures(match);
      this._grantableFeatures = grantable;
      var adminAccess = tempAdminAccess.normalizeTempAdminAccess(match.tempAdminAccess);
      var caddieAccess = caddieScoringAccess.normalizeCaddieScoringAccess(
        match.caddieScoringAccess
      );
      this._safeSetData({
        sheetReady: true,
        saving: false,
        adminQrHasQr: !!(adminAccess && adminAccess.qrCodeUrl && adminAccess.enabled),
        adminQrUrl: adminAccess && adminAccess.qrCodeUrl ? adminAccess.qrCodeUrl : '',
        adminQrGenerating: false,
        adminQrExpanded: !adminAccess,
        expandedAdminUserId: '',
        adminQrAdminList: (
          tempAdminAccess.listAdminQrAdmins(match.tempAdmins, grantable) || []
        ).map(function (item) {
          return Object.assign({}, item, { expanded: false });
        }),
        caddieScoringHasQr: !!(caddieAccess && caddieAccess.qrCodeUrl && caddieAccess.enabled),
        caddieScoringQrUrl:
          caddieAccess && caddieAccess.qrCodeUrl ? caddieAccess.qrCodeUrl : '',
        caddieScoringGenerating: false,
        caddieQrExpanded: !caddieAccess,
        caddieScorerList: caddieScoringAccess.listCaddieScorers(match.tempAdmins),
        caddieManageSheetVisible: false,
        caddieManageTarget: null
      });
    },

    /** 父页扫码领取成功后刷新草稿列表（不改变冻结 matchId） */
    refreshAfterAuthClaim: function (payload) {
      if (!this._alive || !this.properties.visible) return;
      var match = this._loadTargetMatch();
      if (!match) return;
      var grantable =
        this._grantableFeatures || this._resolveGrantableFeatures(match);
      this._grantableFeatures = grantable;
      var kind = payload && payload.kind;
      if (kind === 'admin' && payload.admin && payload.admin.userId) {
        var draft = Array.isArray(this.data.adminQrAdminList)
          ? this.data.adminQrAdminList.slice()
          : [];
        var uid = String(payload.admin.userId);
        if (!draft.some(function (a) {
          return a && String(a.userId) === uid;
        })) {
          var rows = tempAdminAccess.listAdminQrAdmins([payload.admin], grantable);
          if (rows[0]) draft.push(rows[0]);
        }
        this._safeSetData({
          adminQrAdminList: this._withAdminExpandState(draft),
          caddieScorerList: caddieScoringAccess.listCaddieScorers(match.tempAdmins || [])
        });
        return;
      }
      this._safeSetData({
        caddieScorerList: caddieScoringAccess.listCaddieScorers(match.tempAdmins || [])
      });
    },

    onCancel: function () {
      if (this._saving) return;
      this._resetLocalState(false);
      this.triggerEvent('close');
    },

    onSave: function () {
      if (!this._alive || this._saving) return;
      var matchId = this._asId(this._targetMatchId);
      if (!matchId || demoJiaobeiMatch.isJiaobeiDemoMatchId(matchId)) {
        this.onCancel();
        return;
      }
      this._saving = true;
      this._safeSetData({ saving: true });
      var match = this._loadTargetMatch();
      if (!match) {
        this._saving = false;
        this._safeSetData({ saving: false });
        wx.showToast({ title: '赛事数据缺失', icon: 'none' });
        return;
      }
      if (!matchManageAccess.canManageTempAdmins(match, gameStore.getCurrentUser())) {
        this._saving = false;
        this._safeSetData({ saving: false });
        wx.showToast({ title: '暂无权限管理权限', icon: 'none' });
        return;
      }
      var grantable =
        this._grantableFeatures || this._resolveGrantableFeatures(match);
      var savedMatch = null;
      try {
        tempAdminAccess.commitAdminQrDraft(
          match,
          this.data.adminQrAdminList,
          this._adminDraftDemotions || [],
          grantable
        );
        savedMatch = teamMatchStore.saveMatch(match);
      } catch (eSave) {
        this._saving = false;
        this._safeSetData({ saving: false });
        wx.showToast({ title: '保存失败', icon: 'none' });
        return;
      }
      if (!savedMatch || this._asId(savedMatch.matchId) !== matchId) {
        this._saving = false;
        this._safeSetData({ saving: false });
        wx.showToast({ title: '保存失败', icon: 'none' });
        return;
      }
      if (!this._alive) return;
      this._resetLocalState(false);
      // 成功后保持锁，直到下次打开；避免连点重复写入
      this._saving = true;
      this.triggerEvent('saved', { matchId: matchId });
      wx.showToast({ title: '权限已保存', icon: 'success' });
    },

    toggleAdminQrExpanded: function () {
      this._safeSetData({ adminQrExpanded: !this.data.adminQrExpanded });
    },

    toggleAdminCandidateExpand: function (e) {
      var userId = this._asId(
        e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.userid
      );
      if (!userId) return;
      var next =
        this._asId(this.data.expandedAdminUserId) === userId ? '' : userId;
      this._safeSetData({
        expandedAdminUserId: next,
        adminQrAdminList: (this.data.adminQrAdminList || []).map(function (item) {
          return Object.assign({}, item, {
            expanded: !!(item && String(item.userId) === next)
          });
        })
      });
    },

    toggleAdminCandidatePermission: function (e) {
      var ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
      var userId = this._asId(ds.userid);
      var perm = this._asId(ds.perm);
      if (!userId || !perm) return;
      var list = (this.data.adminQrAdminList || []).map(function (item) {
        if (!item || String(item.userId) !== userId) return item;
        var options = (item.permissionOptions || []).map(function (opt) {
          if (!opt || opt.key !== perm) return opt;
          return Object.assign({}, opt, { selected: !opt.selected });
        });
        var permissions = tempAdminAccess.selectedKeysFromOptions(options);
        var status = permissions.length > 0 ? 'approved' : 'pending';
        return Object.assign({}, item, {
          permissionOptions: options,
          permissions: permissions,
          status: status,
          statusLabel: status === 'approved' ? '已授权' : '待授权'
        });
      });
      this._safeSetData({ adminQrAdminList: list });
    },

    generateTempAdminQr: function () {
      this._createOrRefreshTempAdminQr(false);
    },

    regenerateTempAdminQr: function () {
      var self = this;
      wx.showModal({
        title: '重新生成',
        content: '重新生成后，旧二维码将失效。已扫码管理员申请与权限不变。是否继续？',
        cancelText: '取消',
        confirmText: '重新生成',
        success: function (res) {
          if (res.confirm) self._createOrRefreshTempAdminQr(true);
        }
      });
    },

    _createOrRefreshTempAdminQr: function () {
      var match = this._loadTargetMatch();
      if (!match) {
        wx.showToast({
          title: demoJiaobeiMatch.isJiaobeiDemoMatchId(this._targetMatchId)
            ? '当前为演示模式'
            : '赛事数据缺失',
          icon: 'none'
        });
        return;
      }
      if (!matchManageAccess.canManageTempAdmins(match, gameStore.getCurrentUser())) {
        wx.showToast({ title: '暂无权限管理权限', icon: 'none' });
        return;
      }
      var user = gameStore.getCurrentUser() || {};
      var prev = tempAdminAccess.normalizeTempAdminAccess(match.tempAdminAccess);
      this._safeSetData({ adminQrGenerating: true });
      var access = tempAdminAccess.createTempAdminAccess({
        source: 'team_match',
        matchId: this._targetMatchId,
        createdBy: String(user.userId || '')
      });
      if (prev && Array.isArray(prev.claimedBy)) {
        access.claimedBy = prev.claimedBy.slice();
      }
      match.tempAdminAccess = access;
      try {
        teamMatchStore.saveMatch(match);
      } catch (eQr) {
        this._safeSetData({ adminQrGenerating: false });
        wx.showToast({ title: '保存失败', icon: 'none' });
        return;
      }
      this._safeSetData({
        adminQrHasQr: true,
        adminQrUrl: access.qrCodeUrl,
        adminQrGenerating: false,
        adminQrExpanded: true
      });
      wx.showToast({ title: '二维码已生成', icon: 'success' });
    },

    saveTempAdminQrImage: function () {
      this._saveQrImageToAlbum(this.data.adminQrUrl);
    },

    toggleCaddieQrExpanded: function () {
      this._safeSetData({ caddieQrExpanded: !this.data.caddieQrExpanded });
    },

    _syncCaddieScoringQrView: function (access) {
      var normalized = caddieScoringAccess.normalizeCaddieScoringAccess(access);
      this._safeSetData({
        caddieScoringHasQr: !!(normalized && normalized.qrCodeUrl && normalized.enabled),
        caddieScoringQrUrl:
          normalized && normalized.qrCodeUrl ? normalized.qrCodeUrl : '',
        caddieScoringGenerating: false,
        caddieQrExpanded: true
      });
    },

    generateCaddieScoringQr: function () {
      this._createOrRefreshCaddieScoringQr(false);
    },

    regenerateCaddieScoringQr: function () {
      var self = this;
      wx.showModal({
        title: '重新生成',
        content: '重新生成后，旧二维码将失效。是否继续？',
        cancelText: '取消',
        confirmText: '重新生成',
        success: function (res) {
          if (res.confirm) self._createOrRefreshCaddieScoringQr(true);
        }
      });
    },

    _createOrRefreshCaddieScoringQr: function () {
      var match = this._loadTargetMatch();
      if (!match) {
        wx.showToast({
          title: demoJiaobeiMatch.isJiaobeiDemoMatchId(this._targetMatchId)
            ? '当前为演示模式'
            : '赛事数据缺失',
          icon: 'none'
        });
        return;
      }
      if (!matchManageAccess.canManageTempAdmins(match, gameStore.getCurrentUser())) {
        wx.showToast({ title: '暂无权限管理权限', icon: 'none' });
        return;
      }
      var user = gameStore.getCurrentUser() || {};
      this._safeSetData({ caddieScoringGenerating: true });
      var access = caddieScoringAccess.createCaddieScoringAccess({
        source: 'team_match',
        matchId: this._targetMatchId,
        createdBy: String(user.userId || '')
      });
      match.caddieScoringAccess = access;
      try {
        teamMatchStore.saveMatch(match);
      } catch (eC) {
        this._safeSetData({ caddieScoringGenerating: false });
        wx.showToast({ title: '保存失败', icon: 'none' });
        return;
      }
      this._syncCaddieScoringQrView(access);
      wx.showToast({ title: '二维码已生成', icon: 'success' });
    },

    saveCaddieScoringQrImage: function () {
      this._saveQrImageToAlbum(this.data.caddieScoringQrUrl);
    },

    _saveQrImageToAlbum: function (rawUrl) {
      var url = String(rawUrl || '').trim();
      if (!url) {
        wx.showToast({ title: '请先生成二维码', icon: 'none' });
        return;
      }
      var self = this;
      wx.showLoading({ title: '保存中', mask: true });
      wx.downloadFile({
        url: url,
        success: function (res) {
          if (!self._alive) {
            wx.hideLoading();
            return;
          }
          if (!res || res.statusCode !== 200 || !res.tempFilePath) {
            wx.hideLoading();
            wx.showToast({ title: '下载失败', icon: 'none' });
            return;
          }
          wx.saveImageToPhotosAlbum({
            filePath: res.tempFilePath,
            success: function () {
              wx.hideLoading();
              if (!self._alive) return;
              wx.showToast({ title: '已保存到相册', icon: 'success' });
            },
            fail: function (err) {
              wx.hideLoading();
              if (!self._alive) return;
              var msg = err && err.errMsg ? String(err.errMsg) : '';
              if (msg.indexOf('auth deny') >= 0 || msg.indexOf('authorize') >= 0) {
                wx.showModal({
                  title: '需要相册权限',
                  content: '请在设置中允许保存到相册后重试',
                  confirmText: '去设置',
                  success: function (r) {
                    if (r.confirm) wx.openSetting({});
                  }
                });
                return;
              }
              wx.showToast({ title: '保存失败', icon: 'none' });
            }
          });
        },
        fail: function () {
          wx.hideLoading();
          if (!self._alive) return;
          wx.showToast({ title: '下载失败', icon: 'none' });
        }
      });
    },

    onRemoveAdminQrTempAdmin: function (e) {
      var userId = this._asId(
        e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.userid
      );
      if (!userId) userId = this._asId(this.data.expandedAdminUserId);
      if (!userId) return;
      var self = this;
      wx.showModal({
        title: '移除临时管理员',
        content: '确定移除该用户的本场临时管理员申请吗？',
        cancelText: '取消',
        confirmText: '确认移除',
        confirmColor: '#dc2626',
        success: function (res) {
          if (!res.confirm || !self._alive) return;
          var match = self._loadTargetMatch();
          var result = tempAdminAccess.removeAdminQrFromDraftList(
            self.data.adminQrAdminList,
            userId,
            match
          );
          if (!result || !result.ok) {
            wx.showToast({ title: '移除失败', icon: 'none' });
            return;
          }
          if (result.demoted) {
            var demotions = Array.isArray(self._adminDraftDemotions)
              ? self._adminDraftDemotions.slice()
              : [];
            var di = demotions.findIndex(function (d) {
              return d && String(d.userId) === String(result.demoted.userId);
            });
            if (di >= 0) demotions[di] = result.demoted;
            else demotions.push(result.demoted);
            self._adminDraftDemotions = demotions;
          }
          var nextExpanded =
            self._asId(self.data.expandedAdminUserId) === userId
              ? ''
              : self._asId(self.data.expandedAdminUserId);
          self._safeSetData({
            expandedAdminUserId: nextExpanded,
            adminQrAdminList: (result.list || []).map(function (item) {
              return Object.assign({}, item, {
                expanded: !!(item && String(item.userId) === nextExpanded)
              });
            })
          });
          wx.showToast({ title: '已从列表移除，保存后生效', icon: 'none' });
        }
      });
    },

    openCaddieScorerManage: function (e) {
      var userId = this._asId(
        e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.userid
      );
      if (!userId) return;
      var list = this.data.caddieScorerList || [];
      var target = null;
      for (var i = 0; i < list.length; i++) {
        if (list[i] && String(list[i].userId) === userId) {
          target = list[i];
          break;
        }
      }
      if (!target) return;
      this._safeSetData({
        caddieManageSheetVisible: true,
        caddieManageTarget: target
      });
    },

    closeCaddieScorerManage: function () {
      this._safeSetData({
        caddieManageSheetVisible: false,
        caddieManageTarget: null
      });
    },

    onRemoveCaddieScoringPermission: function () {
      var target = this.data.caddieManageTarget;
      if (!target || !target.userId) return;
      var userId = String(target.userId);
      var self = this;
      wx.showModal({
        title: '移除球童记分员',
        content: '确定移除该球童的本场记分权限吗？',
        cancelText: '取消',
        confirmText: '确认移除',
        confirmColor: '#dc2626',
        success: function (res) {
          if (!res.confirm || !self._alive) return;
          var match = self._loadTargetMatch();
          if (!match) {
            wx.showToast({ title: '赛事数据缺失', icon: 'none' });
            return;
          }
          var result = caddieScoringAccess.removeCaddieScoringPermission(match, userId);
          if (!result || !result.ok) {
            wx.showToast({ title: '移除失败', icon: 'none' });
            return;
          }
          try {
            teamMatchStore.saveMatch(match);
          } catch (eRm) {
            wx.showToast({ title: '保存失败', icon: 'none' });
            return;
          }
          self._safeSetData({
            caddieManageSheetVisible: false,
            caddieManageTarget: null,
            caddieScorerList: caddieScoringAccess.listCaddieScorers(match.tempAdmins)
          });
          wx.showToast({ title: '已移除记分权限', icon: 'success' });
        }
      });
    },

    onMockScanAdmin: function () {
      this.triggerEvent('mockscanadmin', {
        matchId: this._asId(this._targetMatchId)
      });
    },

    onMockScanCaddie: function () {
      this.triggerEvent('mockscancaddie', {
        matchId: this._asId(this._targetMatchId)
      });
    },

    onToggleMockPhone: function () {
      this.triggerEvent('togglemockphone', {});
    }
  }
});
