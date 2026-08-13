/**
 * 收费管理弹窗（极简实收登记）
 * - registration：普通 detail，写 registerInfo.users + paymentLogs
 * - grouped_players：Series，写 paymentByUserId + paymentLogs（不写 registerInfo）
 */

var teamMatchStore = require('../../utils/teamMatchStore.js');
var gameStore = require('../../utils/gameStore.js');
var matchManageAccess = require('../../utils/matchManageAccess.js');
var paymentManage = require('../../utils/paymentManage.js');
var seriesGroupedPaymentManage = require('../../utils/seriesGroupedPaymentManage.js');
var demoJiaobeiMatch = require('../../utils/demoJiaobeiMatch.js');

var DATA_MODE_REGISTRATION = seriesGroupedPaymentManage.DATA_MODE_REGISTRATION;
var DATA_MODE_GROUPED = seriesGroupedPaymentManage.DATA_MODE_GROUPED_PLAYERS;
var ORDINARY_EMPTY = '暂无符合条件的报名用户';
var GROUPED_EMPTY = seriesGroupedPaymentManage.EMPTY_TEXT;

Component({
  properties: {
    visible: { type: Boolean, value: false },
    matchId: { type: String, value: '' },
    /** Series 轮次副标题；空则不渲染 */
    roundSubtitle: { type: String, value: '' },
    themeClass: { type: String, value: '' },
    /** registration | grouped_players */
    dataMode: { type: String, value: DATA_MODE_REGISTRATION },
    seriesId: { type: String, value: '' },
    roundId: { type: String, value: '' },
    /** Series 只读富化；永不写入 */
    rosterSnapshot: { type: Array, value: [] }
  },

  data: {
    sheetReady: false,
    emptyText: ORDINARY_EMPTY,
    paymentUsers: [],
    paymentFilteredUsers: [],
    paymentFilter: paymentManage.FILTER_ALL,
    expandedPaymentUserId: '',
    paymentSummary: paymentManage.calculatePaymentSummary([])
  },

  lifetimes: {
    attached: function () {
      this._alive = true;
      this._targetMatchId = '';
      this._dataMode = DATA_MODE_REGISTRATION;
      this._frozen = null;
      this._rosterSnapshot = [];
      this._openSeq = 0;
      this._patching = false;
    },
    detached: function () {
      this._alive = false;
      this._targetMatchId = '';
      this._dataMode = DATA_MODE_REGISTRATION;
      this._frozen = null;
      this._rosterSnapshot = [];
      this._patching = false;
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

    _safeSetData: function (patch, cb) {
      if (!this._alive) return;
      this.setData(patch, cb);
    },

    _asId: function (v) {
      return v == null ? '' : String(v).trim();
    },

    _isGroupedMode: function () {
      if (this._dataMode === DATA_MODE_GROUPED) return true;
      // 防御：Series 宿主若未传到 dataMode，但带了 seriesId / managed 上下文，仍走分组名单
      if (this._asId(this.properties.seriesId)) return true;
      var frozen = this._frozen || {};
      if (frozen.dataMode === DATA_MODE_GROUPED) return true;
      return false;
    },

    _loadTargetMatch: function () {
      var id = this._asId(this._targetMatchId);
      if (!id || demoJiaobeiMatch.isJiaobeiDemoMatchId(id)) return null;
      var match = teamMatchStore.getMatchById(id);
      if (!match) return null;
      if (this._asId(match.matchId) !== id) return null;
      return match;
    },

    _canManagePayment: function (match) {
      var user = gameStore.getCurrentUser() || {};
      var access = matchManageAccess.resolveMatchManageAccess(match, user);
      return paymentManage.canManagePayment(
        match,
        user.userId,
        !!(access && access.isPrivilegedUser)
      );
    },

    _buildPaymentLogOperator: function (match) {
      var user = gameStore.getCurrentUser() || {};
      var userId = String(user.userId || user.id || '').trim();
      var creatorId = String(
        (match && (match.createdBy || match.creatorId)) || ''
      ).trim();
      return {
        userId: userId,
        operatorId: userId,
        operatorName:
          user.nickname || user.displayName || user.name || userId || '管理员',
        operatorRole:
          userId && creatorId && userId === creatorId ? 'creator' : 'admin'
      };
    },

    _buildDraftUsers: function (match) {
      if (this._isGroupedMode()) {
        return seriesGroupedPaymentManage.buildGroupedPaymentDraftUsers(
          match,
          this._rosterSnapshot
        );
      }
      return paymentManage.buildPaymentDraftUsers(match);
    },

    _resetLocalState: function (keepReady) {
      this._safeSetData({
        sheetReady: !!keepReady,
        emptyText: this._isGroupedMode() ? GROUPED_EMPTY : ORDINARY_EMPTY,
        paymentUsers: [],
        paymentFilteredUsers: [],
        paymentFilter: paymentManage.FILTER_ALL,
        expandedPaymentUserId: '',
        paymentSummary: paymentManage.calculatePaymentSummary([])
      });
    },

    _openSheet: function () {
      var seq = (this._openSeq = (this._openSeq || 0) + 1);
      var matchId = this._asId(this.properties.matchId);
      var modeRaw = String(
        this.properties.dataMode ||
          (this.data && this.data.dataMode) ||
          DATA_MODE_REGISTRATION
      ).trim();
      var dataMode =
        modeRaw === DATA_MODE_GROUPED ? DATA_MODE_GROUPED : DATA_MODE_REGISTRATION;
      // Series 宿主固定传 seriesId：即使 dataMode 绑定失败也强制 grouped_players
      if (
        dataMode !== DATA_MODE_GROUPED &&
        this._asId(this.properties.seriesId)
      ) {
        dataMode = DATA_MODE_GROUPED;
      }
      this._targetMatchId = matchId;
      this._dataMode = dataMode;
      this._rosterSnapshot = Array.isArray(this.properties.rosterSnapshot)
        ? this.properties.rosterSnapshot.slice()
        : [];
      this._frozen = {
        matchId: matchId,
        seriesId: this._asId(this.properties.seriesId),
        roundId: this._asId(this.properties.roundId),
        publishToken: '',
        dataMode: dataMode
      };
      this._patching = false;

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
      if (!this._canManagePayment(match)) {
        wx.showToast({ title: '暂无收费管理权限', icon: 'none' });
        this.triggerEvent('close');
        return;
      }
      if (dataMode === DATA_MODE_GROUPED) {
        var ctx =
          match.seriesContext && typeof match.seriesContext === 'object'
            ? match.seriesContext
            : {};
        this._frozen.publishToken = this._asId(ctx.publishToken);
        if (!this._frozen.seriesId) {
          this._frozen.seriesId = this._asId(ctx.seriesId);
        }
        if (!this._frozen.roundId) {
          this._frozen.roundId = this._asId(ctx.roundId);
        }
        var ident = seriesGroupedPaymentManage.verifyManagedIdentity(
          match,
          this._frozen
        );
        if (!ident.ok) {
          wx.showToast({ title: '本轮比赛数据异常', icon: 'none' });
          this.triggerEvent('close');
          return;
        }
      }
      if (!this._alive || seq !== this._openSeq) return;

      var paymentUsers = this._buildDraftUsers(match);
      var emptyText =
        dataMode === DATA_MODE_GROUPED && !paymentUsers.length
          ? GROUPED_EMPTY
          : ORDINARY_EMPTY;
      this._safeSetData(
        {
          sheetReady: true,
          emptyText: emptyText,
          paymentUsers: paymentUsers,
          paymentFilter: paymentManage.FILTER_ALL,
          expandedPaymentUserId: ''
        },
        function () {
          this._refreshPaymentManageView(paymentManage.FILTER_ALL);
        }.bind(this)
      );
    },

    onClose: function () {
      this._resetLocalState(false);
      this.triggerEvent('close');
    },

    _refreshPaymentManageView: function (forceFilter, callback) {
      var source = Array.isArray(this.data.paymentUsers)
        ? this.data.paymentUsers
        : [];
      var rawFilter = forceFilter || this.data.paymentFilter || 'all';
      var filter =
        rawFilter === 'paid' || rawFilter === 'unpaid' ? rawFilter : 'all';
      var filtered = source;
      if (filter === 'paid') {
        filtered = source.filter(function (user) {
          return user && user.paymentConfirmed === true;
        });
      }
      if (filter === 'unpaid') {
        filtered = source.filter(function (user) {
          return !(user && user.paymentConfirmed === true);
        });
      }
      var expandedId = String(this.data.expandedPaymentUserId || '');
      var displayUsers = filtered.map(function (user) {
        return Object.assign({}, user, {
          expanded: String(user.stableUserId || '') === expandedId
        });
      });
      var emptyText = ORDINARY_EMPTY;
      if (this._isGroupedMode()) {
        emptyText = source.length ? ORDINARY_EMPTY : GROUPED_EMPTY;
        if (source.length && !filtered.length) {
          emptyText = ORDINARY_EMPTY;
        }
      }
      this._safeSetData(
        {
          paymentFilter: filter,
          paymentFilteredUsers: displayUsers,
          paymentSummary: paymentManage.calculatePaymentSummary(source),
          emptyText: emptyText
        },
        callback
      );
    },

    _setPaymentFilterAndRefresh: function (filter) {
      var nextFilter =
        filter === 'paid' || filter === 'unpaid' ? filter : 'all';
      this._safeSetData({
        paymentFilter: nextFilter,
        expandedPaymentUserId: ''
      });
      this._refreshPaymentManageView(nextFilter);
    },

    showAllPaymentUsers: function () {
      this._setPaymentFilterAndRefresh('all');
    },

    showPaidPaymentUsers: function () {
      this._setPaymentFilterAndRefresh('paid');
    },

    showUnpaidPaymentUsers: function () {
      this._setPaymentFilterAndRefresh('unpaid');
    },

    onPaymentUserCardTap: function (e) {
      var userId = String(
        (e.currentTarget.dataset && e.currentTarget.dataset.userid) || ''
      );
      if (!userId) return;
      var current = String(this.data.expandedPaymentUserId || '');
      var self = this;
      this._safeSetData(
        {
          expandedPaymentUserId: current === userId ? '' : userId
        },
        function () {
          self._refreshPaymentManageView();
        }
      );
    },

    _findPaymentUserIndex: function (users, userId) {
      var targetId = String(userId || '');
      return (Array.isArray(users) ? users : []).findIndex(function (
        user,
        index
      ) {
        var stableId = paymentManage.resolveStableUserId(
          user,
          'payment-user-' + (index + 1)
        );
        return (
          String(stableId || '') === targetId ||
          String((user && user.stableUserId) || '') === targetId ||
          String((user && user.playerId) || '') === targetId ||
          String((user && user.userId) || '') === targetId ||
          String((user && user.id) || '') === targetId
        );
      });
    },

    _mergeDisplayUser: function (targetId, patchedDisplay) {
      var source = Array.isArray(this.data.paymentUsers)
        ? this.data.paymentUsers
        : [];
      var idx = this._findPaymentUserIndex(source, targetId);
      if (idx < 0) return patchedDisplay;
      var prev = source[idx] || {};
      var patched = patchedDisplay || {};
      var displayName =
        prev.displayName || patched.displayName || prev.name || patched.name || '';
      var displayAvatar =
        prev.displayAvatar ||
        patched.displayAvatar ||
        prev.avatar ||
        patched.avatar ||
        '';
      return Object.assign({}, prev, patched, {
        stableUserId: targetId,
        userId: targetId,
        playerId: targetId,
        name: displayName,
        avatar: displayAvatar,
        displayName: displayName,
        displayAvatar: displayAvatar,
        genderIcon: prev.genderIcon || patched.genderIcon,
        genderClass: prev.genderClass || patched.genderClass
      });
    },

    patchPaymentUser: function (userId, patch) {
      var targetId = String(userId || '');
      if (!targetId || !this._alive) return;
      if (this._patching) return;

      var matchId = this._asId(this._targetMatchId);
      if (!matchId || demoJiaobeiMatch.isJiaobeiDemoMatchId(matchId)) {
        wx.showToast({ title: '赛事数据缺失', icon: 'none' });
        return;
      }

      var match = this._loadTargetMatch();
      if (!match) {
        wx.showToast({ title: '赛事数据缺失', icon: 'none' });
        return;
      }
      if (!this._canManagePayment(match)) {
        wx.showToast({ title: '暂无收费管理权限', icon: 'none' });
        return;
      }

      if (this._isGroupedMode()) {
        this._patchGroupedPaymentUser(match, matchId, targetId, patch);
        return;
      }
      this._patchRegistrationPaymentUser(match, matchId, targetId, patch);
    },

    _patchGroupedPaymentUser: function (match, matchId, targetId, patch) {
      var ident = seriesGroupedPaymentManage.verifyManagedIdentity(
        match,
        this._frozen
      );
      if (!ident.ok) {
        wx.showToast({ title: '本轮比赛数据异常', icon: 'none' });
        return;
      }
      var draftUsers = this._buildDraftUsers(match);
      var inList = this._findPaymentUserIndex(draftUsers, targetId) >= 0;
      if (!inList) {
        wx.showToast({ title: '用户数据缺失', icon: 'none' });
        return;
      }

      this._patching = true;
      var prevMap = JSON.parse(
        JSON.stringify(
          seriesGroupedPaymentManage.normalizePaymentByUserIdMap(
            match.paymentByUserId
          )
        )
      );
      var prevLogs = Array.isArray(match.paymentLogs)
        ? match.paymentLogs.slice()
        : [];
      var prevFeeList = JSON.stringify(match.feeList || null);
      var prevFeeSet = match.feeSet;
      var prevRegister = JSON.stringify(match.registerInfo || null);
      var prevGroups = JSON.stringify(match.groups || null);

      var result = seriesGroupedPaymentManage.applyGroupedPaymentPatch(
        match,
        targetId,
        patch,
        this._buildPaymentLogOperator(match)
      );
      if (!result || !result.ok) {
        this._patching = false;
        wx.showToast({ title: '保存失败', icon: 'none' });
        return;
      }

      var saved = null;
      try {
        saved = teamMatchStore.saveMatch(match);
      } catch (eSave) {
        match.paymentByUserId = prevMap;
        match.paymentLogs = prevLogs;
        this._patching = false;
        wx.showToast({ title: '保存失败', icon: 'none' });
        return;
      }
      if (!saved || this._asId(saved.matchId) !== matchId) {
        match.paymentByUserId = prevMap;
        match.paymentLogs = prevLogs;
        this._patching = false;
        wx.showToast({ title: '保存失败', icon: 'none' });
        return;
      }

      // 防御：费用/报名/分组不得被本路径改写
      if (
        JSON.stringify(match.feeList || null) !== prevFeeList ||
        match.feeSet !== prevFeeSet ||
        JSON.stringify(match.registerInfo || null) !== prevRegister ||
        JSON.stringify(match.groups || null) !== prevGroups
      ) {
        match.paymentByUserId = prevMap;
        match.paymentLogs = prevLogs;
        this._patching = false;
        wx.showToast({ title: '保存失败', icon: 'none' });
        return;
      }

      var displayUser = this._mergeDisplayUser(targetId, result.displayUser);
      var source = Array.isArray(this.data.paymentUsers)
        ? this.data.paymentUsers
        : [];
      var displayIndex = this._findPaymentUserIndex(source, targetId);
      var nextUsers =
        displayIndex >= 0
          ? source.map(function (user, index) {
              return index === displayIndex ? displayUser : user;
            })
          : this._buildDraftUsers(match);

      var self = this;
      this._safeSetData({ paymentUsers: nextUsers }, function () {
        self._refreshPaymentManageView(self.data.paymentFilter || 'all');
        self._patching = false;
      });

      this.triggerEvent('changed', {
        matchId: matchId,
        userId: targetId,
        paymentConfirmed: !!(result.after && result.after.paymentConfirmed),
        dataMode: DATA_MODE_GROUPED
      });
    },

    _patchRegistrationPaymentUser: function (match, matchId, targetId, patch) {
      var registerUsers =
        match.registerInfo && Array.isArray(match.registerInfo.users)
          ? match.registerInfo.users
          : [];
      var rawIndex = this._findPaymentUserIndex(registerUsers, targetId);
      if (rawIndex < 0) {
        wx.showToast({ title: '用户数据缺失', icon: 'none' });
        return;
      }

      this._patching = true;
      var beforeUser = JSON.parse(
        JSON.stringify(registerUsers[rawIndex] || {})
      );
      var nextRawUser = Object.assign({}, registerUsers[rawIndex], patch || {});
      if (nextRawUser.paymentConfirmed === false) {
        nextRawUser.paidAmount = '';
        nextRawUser.cashPaidAmount = '';
        nextRawUser.diamondPaidAmount = '';
      }
      if (
        Object.prototype.hasOwnProperty.call(nextRawUser, 'cashPaidAmount')
      ) {
        nextRawUser.paidAmount = nextRawUser.cashPaidAmount;
      }

      var prevLogs = Array.isArray(match.paymentLogs)
        ? match.paymentLogs.slice()
        : [];
      registerUsers[rawIndex] = nextRawUser;
      if (!match.registerInfo || typeof match.registerInfo !== 'object') {
        match.registerInfo = { totalCount: 0, users: registerUsers };
      } else {
        match.registerInfo.users = registerUsers;
        match.registerInfo.totalCount = registerUsers.length;
      }

      var displayUser = paymentManage.normalizePaymentUserForDisplay(nextRawUser);
      var logs = paymentManage.buildPaymentDiffLogs({
        beforeUsers: [beforeUser],
        afterUsers: [displayUser],
        operator: this._buildPaymentLogOperator(match)
      });
      if (logs.length) {
        paymentManage.appendPaymentLogs(match, logs);
      }

      var saved = null;
      try {
        saved = teamMatchStore.saveMatch(match);
      } catch (eSave) {
        registerUsers[rawIndex] = beforeUser;
        match.registerInfo.users = registerUsers;
        match.paymentLogs = prevLogs;
        this._patching = false;
        wx.showToast({ title: '保存失败', icon: 'none' });
        return;
      }
      if (!saved || this._asId(saved.matchId) !== matchId) {
        registerUsers[rawIndex] = beforeUser;
        match.registerInfo.users = registerUsers;
        match.paymentLogs = prevLogs;
        this._patching = false;
        wx.showToast({ title: '保存失败', icon: 'none' });
        return;
      }

      var source = Array.isArray(this.data.paymentUsers)
        ? this.data.paymentUsers
        : [];
      var displayIndex = this._findPaymentUserIndex(source, targetId);
      var nextUsers =
        displayIndex >= 0
          ? source.map(function (user, index) {
              return index === displayIndex ? displayUser : user;
            })
          : paymentManage.buildPaymentDraftUsers(match);

      var self = this;
      this._safeSetData({ paymentUsers: nextUsers }, function () {
        self._refreshPaymentManageView(self.data.paymentFilter || 'all');
        self._patching = false;
      });

      this.triggerEvent('changed', {
        matchId: matchId,
        userId: targetId,
        paymentConfirmed: nextRawUser.paymentConfirmed === true,
        dataMode: DATA_MODE_REGISTRATION
      });
    },

    onPaymentConfirmedTap: function (e) {
      var userId = String(
        (e.currentTarget.dataset && e.currentTarget.dataset.userid) || ''
      );
      var confirmed =
        String(
          (e.currentTarget.dataset && e.currentTarget.dataset.confirmed) || ''
        ) === 'true';
      if (!userId) return;
      var paymentUsers = Array.isArray(this.data.paymentUsers)
        ? this.data.paymentUsers
        : [];
      var target = paymentUsers.find(function (user) {
        return String(user && user.stableUserId) === userId;
      });
      if (!target || target.paymentConfirmed === confirmed) return;
      var before = target.paymentConfirmed;
      var after = confirmed;
      var self = this;

      if (before === true && after === false) {
        wx.showModal({
          title: '确认改为未收？',
          content: '改为未收将清除已登记金额，但保留备注。',
          confirmText: '继续',
          cancelText: '取消',
          success: function (res) {
            if (!res.confirm) return;
            self.patchPaymentUser(userId, {
              paymentConfirmed: false,
              paidAmount: '',
              cashPaidAmount: '',
              diamondPaidAmount: ''
            });
          },
          fail: function (err) {
            console.error('[payment-unpaid-modal-fail]', err);
          }
        });
        return;
      }

      if (confirmed) {
        this.patchPaymentUser(userId, { paymentConfirmed: true });
      }
    },

    onPaymentPaidAmountBlur: function (e) {
      var userId = String(
        (e.currentTarget.dataset && e.currentTarget.dataset.userid) || ''
      );
      var value = e && e.detail ? e.detail.value : '';
      if (!userId) return;
      var amount =
        value === '' || value === null || value === undefined
          ? ''
          : paymentManage.toAmount(value);
      var patch = { cashPaidAmount: amount };
      if (amount !== '') patch.paymentConfirmed = true;
      this.patchPaymentUser(userId, patch);
    },

    onPaymentRemarkBlur: function (e) {
      var userId = String(
        (e.currentTarget.dataset && e.currentTarget.dataset.userid) || ''
      );
      var value = e && e.detail ? e.detail.value : '';
      if (!userId) return;
      var beforeRemark = '';
      if (this._isGroupedMode()) {
        var matchG = this._loadTargetMatch();
        var map = seriesGroupedPaymentManage.normalizePaymentByUserIdMap(
          matchG && matchG.paymentByUserId
        );
        var rec = map[userId] || {};
        beforeRemark =
          rec.paymentRemark != null ? String(rec.paymentRemark) : '';
      } else {
        var match = this._loadTargetMatch();
        var registerUsers =
          match && match.registerInfo && Array.isArray(match.registerInfo.users)
            ? match.registerInfo.users
            : [];
        var rawIndex = this._findPaymentUserIndex(registerUsers, userId);
        var beforeUser = rawIndex >= 0 ? registerUsers[rawIndex] : {};
        beforeRemark =
          beforeUser && beforeUser.paymentRemark != null
            ? String(beforeUser.paymentRemark)
            : '';
      }
      var afterRemark = String(value || '');
      if (beforeRemark === afterRemark) return;
      this.patchPaymentUser(userId, { paymentRemark: afterRemark });
    }
  }
});
