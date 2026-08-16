/**
 * 选手管理弹窗（本场报名快照 / Series 本轮正式分组席位）
 * - 普通 detail：registerInfo 主数据源（与 detail 内联行为一致）
 * - Series：groups 席位主数据源；rosterSnapshot 只读富化；禁止写 registerInfo / Series.roster
 */

var teamMatchStore = require('../../utils/teamMatchStore.js');
var teamMatchFinish = require('../../utils/teamMatchFinish.js');
var gameStore = require('../../utils/gameStore.js');
var matchManageAccess = require('../../utils/matchManageAccess.js');
var playerManage = require('../../utils/playerManage.js');
var playerDisplayName = require('../../utils/playerDisplayName.js');
var socialRelationStore = require('../../utils/socialRelationStore.js');
var demoJiaobeiMatch = require('../../utils/demoJiaobeiMatch.js');
var {
  isTeamMatchFamily,
  isInterTeamMatch,
  DEFAULT_ORG_LOGO
} = require('../../utils/teamMatchCapabilities.js');
var { resolveCompositionMode } = require('../../utils/strokeCompositionResolver.js');

var SERIES_EMPTY_TEXT = '本轮尚未分组，暂无可管理选手';
var ORDINARY_EMPTY_TEXT = '暂无报名选手';

Component({
  properties: {
    visible: { type: Boolean, value: false },
    matchId: { type: String, value: '' },
    /** Series 轮次副标题；空则不渲染 */
    roundSubtitle: { type: String, value: '' },
    themeClass: { type: String, value: '' },
    seriesMode: { type: Boolean, value: false },
    /** Series 只读富化；永不写入 */
    rosterSnapshot: { type: Array, value: [] },
    /** 父页面 Series 删除提交中 */
    seriesRemoving: { type: Boolean, value: false }
  },

  data: {
    sheetReady: false,
    saving: false,
    sideLabel: '分队',
    displayUsers: [],
    teamOptions: [],
    searchKeyword: '',
    teamFilter: playerManage.TEAM_FILTER_ALL,
    teamFilterLabel: '全部分队',
    countTip: '',
    emptyText: ORDINARY_EMPTY_TEXT,
    expandedUserId: '',
    filterPickVisible: false,
    filterPickOptions: [],
    teamPickVisible: false,
    teamPickUserId: '',
    teamPickOptions: []
  },

  lifetimes: {
    attached: function () {
      this._alive = true;
      this._targetMatchId = '';
      this._draft = null;
      this._seriesMode = false;
      this._rosterSnapshot = [];
      this._saving = false;
      this._openSeq = 0;
      this._searchTimer = null;
      this._viewerRemarkCtx = null;
    },
    detached: function () {
      this._alive = false;
      this._targetMatchId = '';
      this._draft = null;
      this._seriesMode = false;
      this._rosterSnapshot = [];
      this._saving = false;
      if (this._searchTimer) {
        clearTimeout(this._searchTimer);
        this._searchTimer = null;
      }
    }
  },

  observers: {
    visible: function (v) {
      if (v) {
        this._openSheet();
      } else {
        this._resetLocalState(false);
      }
    },
    rosterSnapshot: function (list) {
      if (!this.properties.visible || !this._seriesMode) return;
      this._rosterSnapshot = Array.isArray(list) ? list.slice() : [];
      if (this._draft) this._syncDisplay();
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

    _canManagePlayers: function (match) {
      var user = gameStore.getCurrentUser() || {};
      var access = matchManageAccess.resolveMatchManageAccess(match, user);
      return playerManage.canManagePlayers(
        match,
        user.userId,
        !!(access && access.isPrivilegedUser)
      );
    },

    _resolveSideLabel: function (match) {
      return isInterTeamMatch(match) ? '球队' : '分队';
    },

    _getViewerRemarkNameMap: function () {
      var viewer = '';
      try {
        viewer =
          this._asId((gameStore.getCurrentUser() || {}).userId) ||
          socialRelationStore.resolveCurrentUserId();
      } catch (e) {
        viewer = '';
      }
      var rev = playerDisplayName.getRemarkRevision();
      if (
        this._viewerRemarkCtx &&
        this._viewerRemarkCtx.rev === rev &&
        this._viewerRemarkCtx.viewer === viewer
      ) {
        return this._viewerRemarkCtx.map || {};
      }
      var map = playerDisplayName.buildRemarkNameMap(viewer);
      this._viewerRemarkCtx = { rev: rev, viewer: viewer, map: map };
      return map;
    },

    _resetLocalState: function (keepReady) {
      if (this._searchTimer) {
        clearTimeout(this._searchTimer);
        this._searchTimer = null;
      }
      this._draft = null;
      this._saving = false;
      this._safeSetData({
        sheetReady: !!keepReady,
        saving: false,
        sideLabel: '分队',
        displayUsers: [],
        teamOptions: [],
        searchKeyword: '',
        teamFilter: playerManage.TEAM_FILTER_ALL,
        teamFilterLabel: '全部分队',
        countTip: '',
        emptyText: this._seriesMode ? SERIES_EMPTY_TEXT : ORDINARY_EMPTY_TEXT,
        expandedUserId: '',
        filterPickVisible: false,
        filterPickOptions: [],
        teamPickVisible: false,
        teamPickUserId: '',
        teamPickOptions: []
      });
    },

    _openSheet: function () {
      var seq = (this._openSeq = (this._openSeq || 0) + 1);
      var matchId = this._asId(this.properties.matchId);
      this._targetMatchId = matchId;
      this._seriesMode = !!this.properties.seriesMode;
      this._rosterSnapshot = Array.isArray(this.properties.rosterSnapshot)
        ? this.properties.rosterSnapshot.slice()
        : [];
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
      if (!this._canManagePlayers(match)) {
        wx.showToast({ title: '暂无选手管理权限', icon: 'none' });
        this.triggerEvent('close');
        return;
      }
      if (!this._alive || seq !== this._openSeq) return;

      if (this._searchTimer) {
        clearTimeout(this._searchTimer);
        this._searchTimer = null;
      }

      // Series：优先 playerManage.buildSeriesPlayerManageDraft（已落地）；
      // 若旧包缺失则组件内不应静默写 registerInfo。
      var draft;
      if (this._seriesMode) {
        if (typeof playerManage.buildSeriesPlayerManageDraft === 'function') {
          draft = playerManage.buildSeriesPlayerManageDraft(
            match,
            this._rosterSnapshot
          );
        } else {
          // fallback note: buildSeriesPlayerManageDraft missing — do not invent registerInfo list
          draft = {
            players: [],
            teamOptions: playerManage.collectTeamOptions(match, []),
            groupsDraft: JSON.parse(
              JSON.stringify(Array.isArray(match.groups) ? match.groups : [])
            ),
            pairingsDraft: JSON.parse(
              JSON.stringify(
                match.pairings && typeof match.pairings === 'object'
                  ? match.pairings
                  : {}
              )
            ),
            scoreData: JSON.parse(
              JSON.stringify(
                match.scoreData && typeof match.scoreData === 'object'
                  ? match.scoreData
                  : {}
              )
            ),
            removedUserIds: [],
            seriesMode: true
          };
        }
      } else {
        draft = playerManage.buildPlayerManageDraft(match);
      }
      this._draft = draft;

      var sideLabel = this._resolveSideLabel(match);
      var teamOptions = (draft && draft.teamOptions) || [];
      this._safeSetData({
        sheetReady: true,
        saving: false,
        sideLabel: sideLabel,
        teamOptions: teamOptions,
        searchKeyword: '',
        teamFilter: playerManage.TEAM_FILTER_ALL,
        teamFilterLabel: '全部' + sideLabel,
        expandedUserId: '',
        filterPickVisible: false,
        filterPickOptions: [],
        teamPickVisible: false,
        teamPickUserId: '',
        teamPickOptions: [],
        emptyText: this._seriesMode ? SERIES_EMPTY_TEXT : ORDINARY_EMPTY_TEXT
      });
      this._syncDisplay();
    },

    _syncDisplay: function (extra) {
      var draft = this._draft;
      var remarkMap = this._getViewerRemarkNameMap();
      var viewer =
        (this._viewerRemarkCtx && this._viewerRemarkCtx.viewer) || '';
      var playersForDisplay = (
        draft && Array.isArray(draft.players) ? draft.players : []
      ).map(function (item) {
        var userId = String((item && item.userId) || '').trim();
        var snapshotName =
          String(
            (item && (item.matchNickname || item.competitionName)) || ''
          ).trim() ||
          playerManage.resolveMatchNickname(item || {}) ||
          '';
        var publicName = String(
          (item && (item.nickname || item.displayName)) || ''
        ).trim();
        var named = playerDisplayName.resolvePlayerDisplayNameForViewer({
          viewerUserId: viewer,
          targetUserId: userId,
          publicName: publicName,
          snapshotName: snapshotName,
          identityMasked: !!(item && item.identityMasked),
          remarkNameMap: remarkMap,
          defaultName: '未命名选手'
        });
        return Object.assign({}, item, {
          matchNickname: named.displayName,
          competitionName: named.displayName,
          contactRemark: ''
        });
      });
      var view = playerManage.buildPlayerManageDisplay(playersForDisplay, {
        keyword: this.data.searchKeyword,
        teamFilter: this.data.teamFilter,
        groups: draft ? draft.groupsDraft : [],
        expandedUserId: this.data.expandedUserId
      });
      var displayUsers = (view.list || []).map(function (item) {
        return Object.assign({}, item, { contactRemark: '' });
      });
      if (this._seriesMode) {
        displayUsers = this._attachSeriesRemovalLocks(displayUsers);
      }
      var emptyText = view.emptyText;
      if (this._seriesMode && (view.totalCount || 0) === 0) {
        emptyText = SERIES_EMPTY_TEXT;
      } else if (!this._seriesMode && (view.totalCount || 0) === 0) {
        emptyText = ORDINARY_EMPTY_TEXT;
      }
      var patch = Object.assign(
        {
          displayUsers: displayUsers,
          countTip: view.countTip,
          emptyText: emptyText
        },
        extra || {}
      );
      this._safeSetData(patch);
    },

    _patchDraft: function (userId, patch) {
      if (!this._draft || !userId) return;
      this._draft.players = playerManage.updatePlayerField(
        this._draft.players,
        userId,
        patch,
        this.data.teamOptions
      );
      this._syncDisplay();
    },

    onCancel: function () {
      if (this._saving) return;
      this._resetLocalState(false);
      this.triggerEvent('close');
    },

    onSearchInput: function (e) {
      var value = e && e.detail ? String(e.detail.value || '') : '';
      this._safeSetData({ searchKeyword: value });
      var self = this;
      if (this._searchTimer) clearTimeout(this._searchTimer);
      this._searchTimer = setTimeout(function () {
        self._searchTimer = null;
        if (!self._alive) return;
        self._syncDisplay();
      }, 150);
    },

    clearSearch: function () {
      if (this._searchTimer) {
        clearTimeout(this._searchTimer);
        this._searchTimer = null;
      }
      this._safeSetData({ searchKeyword: '' });
      this._syncDisplay();
    },

    openFilterPicker: function () {
      var sideLabel = this.data.sideLabel || '分队';
      var options = playerManage
        .buildTeamFilterOptions(this.data.teamOptions, this.data.teamFilter)
        .map(function (item) {
          if (!item) return item;
          if (String(item.id) === playerManage.TEAM_FILTER_ALL) {
            return Object.assign({}, item, { name: '全部' + sideLabel });
          }
          return item;
        });
      this._safeSetData({
        filterPickVisible: true,
        filterPickOptions: options,
        teamPickVisible: false
      });
    },

    closeFilterPicker: function () {
      this._safeSetData({
        filterPickVisible: false,
        filterPickOptions: []
      });
    },

    onFilterPick: function (e) {
      var key = String(
        (e.currentTarget.dataset && e.currentTarget.dataset.filter) || ''
      );
      var filter = playerManage.TEAM_FILTER_ALL;
      if (key && key !== playerManage.TEAM_FILTER_ALL) filter = key;
      var label = playerManage.resolveTeamFilterLabel(
        this.data.teamOptions,
        filter
      );
      if (filter === playerManage.TEAM_FILTER_ALL || label === '全部分队') {
        label = '全部' + (this.data.sideLabel || '分队');
      }
      this._safeSetData({
        teamFilter: filter,
        teamFilterLabel: label,
        filterPickVisible: false,
        filterPickOptions: []
      });
      this._syncDisplay();
    },

    toggleExpand: function (e) {
      var userId = this._asId(
        e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.userid
      );
      if (!userId) return;
      var next = this._asId(this.data.expandedUserId) === userId ? '' : userId;
      this._safeSetData({
        expandedUserId: next,
        teamPickVisible: false,
        filterPickVisible: false
      });
      this._syncDisplay();
    },

    onNicknameInput: function (e) {
      var userId = this._asId(
        e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.userid
      );
      var value = e && e.detail ? String(e.detail.value || '') : '';
      if (!userId) return;
      this._patchDraft(userId, { matchNickname: value });
    },

    onGenderTap: function (e) {
      var ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
      var userId = this._asId(ds.userid);
      var gender = this._asId(ds.gender);
      if (!userId || !gender) return;
      this._patchDraft(userId, { matchGender: gender });
    },

    _resolvePhone: function (e) {
      var ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
      var phone = String(ds.phone || '').trim();
      if (!phone && this._draft) {
        var userId = this._asId(ds.userid);
        var player = (this._draft.players || []).find(function (p) {
          return p && String(p.userId) === userId;
        });
        phone = playerManage.resolvePhone(player) || (player && player.phone) || '';
      }
      return String(phone || '').trim();
    },

    onCallPhone: function (e) {
      var raw = this._resolvePhone(e);
      if (!raw) {
        wx.showToast({ title: '暂无手机号', icon: 'none' });
        return;
      }
      var phoneNumber = raw.replace(/[^\d+]/g, '');
      if (!phoneNumber) {
        wx.showToast({ title: '暂无手机号', icon: 'none' });
        return;
      }
      wx.makePhoneCall({
        phoneNumber: phoneNumber,
        fail: function (err) {
          var msg = err && err.errMsg ? String(err.errMsg) : '';
          if (msg.indexOf('cancel') >= 0 || msg.indexOf('取消') >= 0) return;
          wx.showToast({ title: '无法拨打电话', icon: 'none' });
        }
      });
    },

    openTeamPicker: function (e) {
      var userId = this._asId(
        e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.userid
      );
      if (!userId || !this._draft) return;
      var player = (this._draft.players || []).find(function (p) {
        return p && String(p.userId) === userId;
      });
      var currentId = player ? String(player.matchTeamId || '') : '';
      var sideLabel = this.data.sideLabel || '分队';
      var match = this._loadTargetMatch();
      var logoById = {};
      if (isInterTeamMatch(match) && match && Array.isArray(match.teamGroups)) {
        match.teamGroups.forEach(function (g) {
          var gid = g && g.id != null ? String(g.id) : '';
          if (!gid) return;
          logoById[gid] =
            String((g && g.sourceTeamLogo) || '').trim() || DEFAULT_ORG_LOGO;
        });
      }
      var options = (this.data.teamOptions || [])
        .filter(function (t) {
          return (
            t &&
            String(t.id != null ? t.id : '').trim() &&
            !playerManage.isPlaceholderTeamLabel(t.name)
          );
        })
        .map(function (t) {
          var id = String(t.id != null ? t.id : '');
          return {
            id: id,
            name: t.name || '未命名' + sideLabel,
            logo: logoById[id] || '',
            selected: id === currentId
          };
        });
      if (!options.length) {
        wx.showToast({ title: '暂无可选' + sideLabel, icon: 'none' });
        return;
      }
      this._safeSetData({
        teamPickVisible: true,
        teamPickUserId: userId,
        teamPickOptions: options,
        filterPickVisible: false
      });
    },

    closeTeamPicker: function () {
      this._safeSetData({
        teamPickVisible: false,
        teamPickUserId: '',
        teamPickOptions: []
      });
    },

    onTeamPick: function (e) {
      var teamId = this._asId(
        e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.teamid
      );
      var userId = this._asId(this.data.teamPickUserId);
      if (!userId || !teamId) {
        this.closeTeamPicker();
        return;
      }
      this._safeSetData({
        teamPickVisible: false,
        teamPickUserId: '',
        teamPickOptions: []
      });
      this._patchDraft(userId, { matchTeamId: teamId });
    },

    _indexSeriesRosterSnapshot: function () {
      var map = Object.create(null);
      var list = Array.isArray(this._rosterSnapshot) ? this._rosterSnapshot : [];
      var i;
      for (i = 0; i < list.length; i++) {
        var entry = list[i];
        if (!entry || typeof entry !== 'object') continue;
        var keys = [entry.playerId, entry.userId, entry.rosterEntryId];
        var k;
        for (k = 0; k < keys.length; k++) {
          var id = this._asId(keys[k]);
          if (id && !map[id]) map[id] = entry;
        }
      }
      return map;
    },

    _attachSeriesRemovalLocks: function (users) {
      var map = this._indexSeriesRosterSnapshot();
      var self = this;
      return (Array.isArray(users) ? users : []).map(function (item) {
        var uid = self._asId(item && (item.userId || item.playerId));
        var snap = uid ? map[uid] : null;
        var status = snap ? String(snap.registrationStatus || '').trim() : '';
        var rosterEntryId = snap ? self._asId(snap.rosterEntryId) : '';
        if (!snap || status !== 'registered' || !rosterEntryId) {
          return Object.assign({}, item, {
            seriesRemovalLocked: true,
            seriesRemovalReason: 'not_registered',
            seriesRemovalMessage: '报名状态已变化，请重新操作',
            rosterEntryId: rosterEntryId
          });
        }
        return Object.assign({}, item, {
          seriesRemovalLocked: !!snap.seriesRemovalLocked,
          seriesRemovalReason: snap.seriesRemovalReason || '',
          seriesRemovalMessage: snap.seriesRemovalMessage || '',
          rosterEntryId: rosterEntryId
        });
      });
    },

    _findSeriesDisplayRow: function (userId) {
      var uid = this._asId(userId);
      var list = Array.isArray(this.data.displayUsers) ? this.data.displayUsers : [];
      var i;
      for (i = 0; i < list.length; i++) {
        if (this._asId(list[i] && list[i].userId) === uid) return list[i];
      }
      return null;
    },

    _onSeriesRemovePlayer: function (userId) {
      if (!userId) return;
      if (this._saving || this.data.saving || this.properties.seriesRemoving) return;
      var row = this._findSeriesDisplayRow(userId);
      if (!row) {
        wx.showToast({ title: '选手不存在', icon: 'none' });
        return;
      }
      if (row.seriesRemovalLocked) {
        var msg = String(row.seriesRemovalMessage || '').trim() || '不可删除';
        wx.showToast({ title: msg, icon: 'none' });
        return;
      }
      var rosterEntryId = this._asId(row.rosterEntryId);
      var playerId = this._asId(row.playerId || row.userId);
      if (!rosterEntryId || !playerId) {
        wx.showToast({ title: '报名状态已变化，请重新操作', icon: 'none' });
        return;
      }
      var name = playerManage.resolveMatchNickname(row) || '该球员';
      var seq = this._openSeq;
      var self = this;
      wx.showModal({
        title: '删除系列赛报名',
        content:
          '确定将【' +
          name +
          '】从整个系列赛报名中删除吗？相关分站的分组与进行中成绩会一并清理。',
        cancelText: '取消',
        confirmText: '确认删除',
        confirmColor: '#dc2626',
        success: function (res) {
          if (!res.confirm || !self._alive) return;
          if (seq !== self._openSeq) return;
          if (!self._seriesMode) return;
          self.triggerEvent('series-remove-player', {
            playerId: playerId,
            rosterEntryId: rosterEntryId
          });
        }
      });
    },

    onRemovePlayer: function (e) {
      var userId = this._asId(
        e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.userid
      );
      if (this._seriesMode) {
        this._onSeriesRemovePlayer(userId);
        return;
      }
      if (!userId || !this._draft) return;
      var row = (this._draft.players || []).find(function (item) {
        return String((item && item.userId) || '') === userId;
      });
      if (!row) {
        wx.showToast({ title: '选手不存在', icon: 'none' });
        return;
      }
      var grouped = playerManage.isPlayerFormalGrouped(
        row,
        playerManage.collectFormalGroupedUserIds(this._draft.groupsDraft)
      );
      var name = playerManage.resolveMatchNickname(row) || '该球员';
      var series = !!this._seriesMode;
      var title = series ? '移除本轮选手' : '移除报名';
      var content;
      if (series) {
        content = grouped
          ? '该球员当前已有出发安排。\n\n移除后，该球员将从本轮正式分组中释放，不会影响系列赛报名名单。\n\n如需调整出发安排，请前往“修改分组”或记分页“添加/删除”。'
          : '确定要将【' + name + '】从本轮正式分组中移除吗？';
      } else {
        content = grouped
          ? '该球员当前已有出发安排。\n\n移除报名后，该球员将不再属于本场报名名单。\n\n如需调整出发安排，请前往“修改分组”或记分页“添加/删除”。'
          : '确定要将【' + name + '】从本场比赛报名列表中移除吗？';
      }
      var self = this;
      wx.showModal({
        title: title,
        content: content,
        cancelText: '取消',
        confirmText: '确认移除',
        confirmColor: '#dc2626',
        success: function (res) {
          if (!res.confirm || !self._alive || !self._draft) return;
          if (series) {
            // Series：席位释放 + 从可管理列表移除（不写 registerInfo / roster）
            var released = playerManage.removePlayerFromDraft(self._draft, userId);
            if (released && released.ok && released.draft) {
              self._draft = released.draft;
            }
            self._draft.players = (self._draft.players || []).filter(function (item) {
              return String((item && item.userId) || '') !== userId;
            });
          } else {
            // 普通模式：与 detail 一致 — 仅从 draft.players 剔除（不用 removePlayerFromDraft）
            self._draft = Object.assign({}, self._draft, {
              players: (self._draft.players || []).filter(function (item) {
                return String((item && item.userId) || '') !== userId;
              })
            });
          }
          var nextExpanded =
            self._asId(self.data.expandedUserId) === userId
              ? ''
              : self._asId(self.data.expandedUserId);
          self._safeSetData({ expandedUserId: nextExpanded });
          self._syncDisplay();
          wx.showToast({
            title: series ? '已移除本轮选手，保存后生效' : '已移除报名，保存后生效',
            icon: 'none'
          });
        }
      });
    },

    /**
     * G2/G3 出发组合法性（只读检测）。
     * usersOverride：Series 无 registerInfo 时用 draft 球员建 teamMap。
     */
    _checkGroupImpactAfterPlayerManageChange: function (match, usersOverride) {
      var empty = { affectedGroups: [] };
      if (!match || typeof match !== 'object') return empty;
      if (!isTeamMatchFamily(match)) return empty;

      var gameMode = String(match.gameMode || match.selectedGameMode || '').trim();
      if (gameMode !== '最佳球位比杆赛' && gameMode !== '四人四球比杆赛') {
        return empty;
      }

      var groups = Array.isArray(match.groups) ? match.groups : [];
      if (!groups.length) return empty;

      var teamMap = {};
      var users = Array.isArray(usersOverride)
        ? usersOverride
        : match.registerInfo && Array.isArray(match.registerInfo.users)
          ? match.registerInfo.users
          : [];
      users.forEach(function (user) {
        var uid =
          user && user.userId != null
            ? String(user.userId).trim()
            : user && user.id != null
              ? String(user.id).trim()
              : '';
        if (!uid) return;
        var teamId = playerManage.resolveMatchTeamId
          ? String(playerManage.resolveMatchTeamId(user) || '').trim()
          : '';
        if (teamId) teamMap[uid] = teamId;
      });

      var mode = resolveCompositionMode(match);
      var affectedGroups = [];

      groups.forEach(function (group) {
        var groupId = group && group.groupId != null ? String(group.groupId) : '';
        if (!groupId) return;

        var players = Array.isArray(group.players) ? group.players : [];
        var filled = players
          .map(function (p) {
            var userId =
              p && p.userId != null
                ? String(p.userId).trim()
                : p && p.playerId != null
                  ? String(p.playerId).trim()
                  : '';
            return userId;
          })
          .filter(Boolean);

        if (!filled.length) return;

        var buckets = {};
        var missingTeam = false;
        for (var i = 0; i < filled.length; i++) {
          var teamId = teamMap[filled[i]] || '';
          if (!teamId) {
            missingTeam = true;
            break;
          }
          if (!buckets[teamId]) buckets[teamId] = 0;
          buckets[teamId] += 1;
        }

        var invalid = false;
        if (missingTeam) {
          invalid = true;
        } else {
          var teamIds = Object.keys(buckets);
          var teamCount = teamIds.length;
          if (mode === '4+0') {
            invalid = teamCount !== 1;
          } else if (teamCount === 1) {
            invalid = false;
          } else if (teamCount === 2) {
            invalid = teamIds.some(function (id) {
              return buckets[id] >= 3;
            });
          } else {
            invalid = true;
          }
        }

        if (invalid) {
          affectedGroups.push({
            groupId: groupId,
            groupName:
              group.groupName != null && String(group.groupName).trim()
                ? String(group.groupName).trim()
                : groupId
          });
        }
      });

      return { affectedGroups: affectedGroups };
    },

    _clearAffectedGroupPlayers: function (match, affectedGroups) {
      if (!match || !Array.isArray(match.groups) || !match.groups.length) return;
      var idSet = {};
      (Array.isArray(affectedGroups) ? affectedGroups : []).forEach(function (item) {
        var id = item && item.groupId != null ? String(item.groupId).trim() : '';
        if (id) idSet[id] = true;
      });
      if (!Object.keys(idSet).length) return;

      match.groups = match.groups.map(function (group) {
        var groupId = group && group.groupId != null ? String(group.groupId) : '';
        if (!groupId || !idSet[groupId]) return group;
        var players = Array.isArray(group.players) ? group.players : [];
        var clearedPlayers = players.length
          ? players.map(function (p, index) {
              var position =
                p && p.position != null && Number(p.position) > 0
                  ? Math.floor(Number(p.position))
                  : index + 1;
              return { position: position, userId: '' };
            })
          : [];
        return Object.assign({}, group, { players: clearedPlayers });
      });
    },

    _finalizeSave: function (matchId, match) {
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
      this.triggerEvent('saved', { matchId: matchId });
      wx.showToast({ title: '选手信息已保存', icon: 'success' });
    },

    onSave: function () {
      if (!this._alive || this._saving || this.properties.seriesRemoving) return;
      var matchId = this._asId(this._targetMatchId);
      if (!matchId || !this._draft || demoJiaobeiMatch.isJiaobeiDemoMatchId(matchId)) {
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
      if (!this._canManagePlayers(match)) {
        this._saving = false;
        this._safeSetData({ saving: false });
        wx.showToast({ title: '暂无选手管理权限', icon: 'none' });
        return;
      }
      var playerFinishGuard = teamMatchFinish.assertWritable(match);
      if (!playerFinishGuard.ok) {
        this._saving = false;
        this._safeSetData({ saving: false });
        wx.showToast({ title: playerFinishGuard.message, icon: 'none' });
        return;
      }

      var series = !!this._seriesMode;
      var result;
      var usersForImpact = null;
      try {
        if (series) {
          if (typeof playerManage.commitSeriesPlayerManageDraft === 'function') {
            result = playerManage.commitSeriesPlayerManageDraft(match, this._draft);
          } else {
            // fallback note: commitSeriesPlayerManageDraft missing — refuse write to registerInfo
            result = { ok: false, reason: 'no_series_commit' };
          }
          usersForImpact =
            (result && result.users) ||
            (this._draft && this._draft.players) ||
            [];
        } else {
          result = playerManage.commitPlayerManageDraft(match, this._draft);
        }
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

      var impact = this._checkGroupImpactAfterPlayerManageChange(
        match,
        series ? usersForImpact : null
      );
      var affected =
        impact && Array.isArray(impact.affectedGroups) ? impact.affectedGroups : [];

      if (!affected.length) {
        this._finalizeSave(matchId, match);
        return;
      }

      var sideLabel = this.data.sideLabel || '分队';
      var self = this;
      // 影响确认前先解锁，允许取消后继续编辑；确认后再锁（与 detail 一致：取消不落盘、不关 sheet）
      this._saving = false;
      this._safeSetData({ saving: false });
      wx.showModal({
        title: '提示',
        content:
          '修改球员所属' +
          sideLabel +
          '后，将导致部分已有分组不符合比赛规则。确认后，受影响分组将被清空，需要重新分组。',
        confirmText: '确认',
        cancelText: '取消',
        success: function (res) {
          if (!res.confirm || !self._alive) {
            return;
          }
          self._saving = true;
          self._safeSetData({ saving: true });
          self._clearAffectedGroupPlayers(match, affected);
          self._finalizeSave(matchId, match);
        }
      });
    }
  }
});
