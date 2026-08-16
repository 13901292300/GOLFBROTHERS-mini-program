/**
 * 出发管理弹窗（组级 teeTime / startHole，draft 机制）
 * - 普通 tournament detail「出发管理」sheet 抽离
 * - 空分组仍打开空态；无分组保存时直接关闭、不成功 toast
 */

var teamMatchStore = require('../../utils/teamMatchStore.js');
var teamMatchFinish = require('../../utils/teamMatchFinish.js');
var gameStore = require('../../utils/gameStore.js');
var matchManageAccess = require('../../utils/matchManageAccess.js');
var teeSheetManage = require('../../utils/teeSheetManage.js');
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
    hasGroups: false,
    timeMode: 'uniform',
    intervalMinutes: 10,
    intervalInput: '10',
    unifiedTime: '08:00',
    unifiedTimeIndex: 0,
    holeMode: 'manual',
    groups: [],
    timeOptions: [],
    holeLabels: []
  },

  lifetimes: {
    attached: function () {
      this._alive = true;
      this._targetMatchId = '';
      this._teeSheetDraft = null;
      this._saving = false;
      this._openSeq = 0;
    },
    detached: function () {
      this._alive = false;
      this._targetMatchId = '';
      this._teeSheetDraft = null;
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

    _canManageTeeSheet: function (match) {
      var user = gameStore.getCurrentUser() || {};
      var access = matchManageAccess.resolveMatchManageAccess(match, user);
      return teeSheetManage.canManageTeeSheet(
        match,
        user.userId,
        !!(access && access.isPrivilegedUser)
      );
    },

    _putLookupUser: function (map, raw) {
      if (!raw || typeof raw !== 'object' || !map) return;
      var uid = this._asId(
        raw.userId || raw.playerId || raw.id || raw.uid || raw.openid
      );
      if (!uid) return;
      if (!map[uid]) map[uid] = raw;
      var aliases = [raw.userId, raw.playerId, raw.id, raw.uid, raw.openid];
      for (var i = 0; i < aliases.length; i++) {
        var aid = this._asId(aliases[i]);
        if (aid && !map[aid]) map[aid] = map[uid];
      }
    },

    _buildPlayerLookup: function (match) {
      var map = {};
      var users =
        match && match.registerInfo && Array.isArray(match.registerInfo.users)
          ? match.registerInfo.users
          : [];
      for (var i = 0; i < users.length; i++) {
        this._putLookupUser(map, users[i]);
      }
      // Series / 席位：groups.players 也纳入展示名解析（不改写席位）
      var groups = match && Array.isArray(match.groups) ? match.groups : [];
      for (var gi = 0; gi < groups.length; gi++) {
        var g = groups[gi];
        var players = g && Array.isArray(g.players) ? g.players : [];
        for (var pi = 0; pi < players.length; pi++) {
          this._putLookupUser(map, players[pi]);
        }
      }
      return map;
    },

    _resetLocalState: function (keepReady) {
      this._teeSheetDraft = null;
      this._saving = false;
      this._safeSetData({
        sheetReady: !!keepReady,
        saving: false,
        hasGroups: false,
        timeMode: 'uniform',
        intervalMinutes: 10,
        intervalInput: '10',
        unifiedTime: '08:00',
        unifiedTimeIndex: 0,
        holeMode: 'manual',
        groups: [],
        timeOptions: [],
        holeLabels: []
      });
    },

    _syncDisplay: function (extra) {
      var draft = this._teeSheetDraft;
      if (!draft) return;
      var timeOptions = this.data.timeOptions || teeSheetManage.buildTimeOptions();
      var unifiedIdx = timeOptions.indexOf(draft.unifiedTime);
      if (unifiedIdx < 0) unifiedIdx = timeOptions.indexOf('08:00');
      if (unifiedIdx < 0) unifiedIdx = 0;
      var groups = (draft.groups || []).map(function (g, index) {
        var timeIdx = timeOptions.indexOf(g.teeTime);
        if (timeIdx < 0) timeIdx = 0;
        var holeIdx =
          g.startHole != null && g.startHole >= 1 && g.startHole <= 18
            ? g.startHole - 1
            : 0;
        return Object.assign({}, g, {
          index: index,
          timeIndex: timeIdx,
          holeIndex: holeIdx
        });
      });
      this._safeSetData(
        Object.assign(
          {
            hasGroups: !!draft.hasGroups,
            timeMode: draft.timeMode,
            intervalMinutes: draft.intervalMinutes,
            intervalInput: String(draft.intervalMinutes),
            unifiedTime: draft.unifiedTime,
            unifiedTimeIndex: unifiedIdx,
            holeMode: draft.holeMode,
            groups: groups
          },
          extra || {}
        )
      );
    },

    _openSheet: function () {
      var seq = (this._openSeq = (this._openSeq || 0) + 1);
      var matchId = this._asId(this.properties.matchId);
      this._targetMatchId = matchId;
      this._teeSheetDraft = null;
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
      if (!this._canManageTeeSheet(match)) {
        wx.showToast({ title: '暂无出发管理权限', icon: 'none' });
        this.triggerEvent('close');
        return;
      }
      if (!this._alive || seq !== this._openSeq) return;

      var timeOptions = teeSheetManage.buildTimeOptions();
      var holeOpts = teeSheetManage.buildHoleOptions();
      var draft = teeSheetManage.buildTeeSheetDraft(
        match,
        this._buildPlayerLookup(match)
      );
      this._teeSheetDraft = draft;
      this._safeSetData({
        sheetReady: true,
        saving: false,
        timeOptions: timeOptions,
        holeLabels: (holeOpts || []).map(function (h) {
          return h.label;
        })
      });
      this._syncDisplay();
    },

    onCancel: function () {
      if (this._saving) return;
      this._resetLocalState(false);
      this.triggerEvent('close');
    },

    onTimeModeTap: function (e) {
      var mode = String(
        (e.currentTarget.dataset && e.currentTarget.dataset.mode) || ''
      );
      if (!this._teeSheetDraft || !mode) return;
      this._teeSheetDraft = teeSheetManage.setTimeMode(this._teeSheetDraft, mode);
      this._syncDisplay();
    },

    onUnifiedTimeChange: function (e) {
      var idx = Number(e.detail && e.detail.value);
      var timeOptions = this.data.timeOptions || [];
      var t = timeOptions[idx];
      if (!t || !this._teeSheetDraft) return;
      this._teeSheetDraft = teeSheetManage.setUnifiedTime(this._teeSheetDraft, t);
      this._syncDisplay();
    },

    onIntervalInput: function (e) {
      var raw = e && e.detail ? String(e.detail.value || '') : '';
      this._safeSetData({ intervalInput: raw });
    },

    onIntervalBlur: function () {
      if (!this._teeSheetDraft) return;
      var n = teeSheetManage.normalizeIntervalMinutes(this.data.intervalInput);
      this._teeSheetDraft = teeSheetManage.setIntervalMinutes(
        this._teeSheetDraft,
        n
      );
      this._syncDisplay();
    },

    onHoleModeTap: function (e) {
      var mode = String(
        (e.currentTarget.dataset && e.currentTarget.dataset.mode) || ''
      );
      if (!this._teeSheetDraft || !mode) return;
      this._teeSheetDraft = teeSheetManage.setHoleMode(this._teeSheetDraft, mode);
      this._syncDisplay();
    },

    onGroupTimeChange: function (e) {
      var idx = Number(e.currentTarget.dataset && e.currentTarget.dataset.index);
      var timeIdx = Number(e.detail && e.detail.value);
      var timeOptions = this.data.timeOptions || [];
      var t = timeOptions[timeIdx];
      if (!this._teeSheetDraft || !t || !Number.isFinite(idx)) return;
      this._teeSheetDraft = teeSheetManage.setGroupTeeTime(
        this._teeSheetDraft,
        idx,
        t
      );
      this._syncDisplay();
    },

    onGroupHoleChange: function (e) {
      var idx = Number(e.currentTarget.dataset && e.currentTarget.dataset.index);
      var holeIdx = Number(e.detail && e.detail.value);
      var hole = holeIdx + 1;
      if (!this._teeSheetDraft || !Number.isFinite(idx)) return;
      this._teeSheetDraft = teeSheetManage.setGroupStartHole(
        this._teeSheetDraft,
        idx,
        hole
      );
      this._syncDisplay();
    },

    onSave: function () {
      if (!this._alive || this._saving) return;
      var matchId = this._asId(this._targetMatchId);
      if (
        !matchId ||
        !this._teeSheetDraft ||
        demoJiaobeiMatch.isJiaobeiDemoMatchId(matchId)
      ) {
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
      if (!this._canManageTeeSheet(match)) {
        this._saving = false;
        this._safeSetData({ saving: false });
        wx.showToast({ title: '暂无出发管理权限', icon: 'none' });
        return;
      }
      var teeFinishGuard = teamMatchFinish.assertWritable(match);
      if (!teeFinishGuard.ok) {
        this._saving = false;
        this._safeSetData({ saving: false });
        wx.showToast({ title: teeFinishGuard.message, icon: 'none' });
        return;
      }

      // 无分组：关闭且不成功 toast（与 match detail 一致）
      if (!this._teeSheetDraft.hasGroups) {
        this._resetLocalState(false);
        this.triggerEvent('close');
        return;
      }

      var result = null;
      try {
        result = teeSheetManage.commitTeeSheetDraft(match, this._teeSheetDraft);
      } catch (eCommit) {
        this._saving = false;
        this._safeSetData({ saving: false });
        wx.showToast({ title: '保存失败', icon: 'none' });
        return;
      }
      if (!result || !result.ok) {
        this._saving = false;
        this._safeSetData({ saving: false });
        wx.showToast({ title: '保存失败', icon: 'none' });
        return;
      }

      var savedMatch = null;
      try {
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
      wx.showToast({ title: '出发安排已保存', icon: 'success' });
      this.triggerEvent('saved', { matchId: matchId });
    }
  }
});
