/**
 * 队内赛分组编辑页
 * 仅编辑 groupDraft；点击「确定」校验通过后才写入 match.groups
 */
const { createHeaderStyle } = require('../../../utils/headerEngine.js');
const teamMatchStore = require('../../../utils/teamMatchStore.js');
const mockAvatars = require('../../../utils/mockAvatars.js');

const PLAYER_SLOTS = 4;
const DEFAULT_REGISTER_GROUPS = [
  { id: 'team-group-1', name: '正式队员' },
  { id: 'team-group-2', name: '嘉宾' }
];

function createEmptyGroupPlayer(position) {
  return { position: position, userId: '', avatar: '', displayName: '', gender: '', tee: '' };
}

function createEmptyGroup(groupIndex) {
  const n = groupIndex + 1;
  return {
    groupId: 'group-tab-' + Date.now() + '-' + n,
    groupName: '第' + n + '组',
    players: Array.from({ length: PLAYER_SLOTS }, (_, i) => createEmptyGroupPlayer(i + 1))
  };
}

function cloneTournamentGroups(list) {
  if (!Array.isArray(list)) return [];
  return list.map((g, index) => ({
    groupId: g && g.groupId != null ? String(g.groupId) : ('group-tab-' + Date.now() + '-' + (index + 1)),
    groupName: g && g.groupName ? String(g.groupName) : ('第' + (index + 1) + '组'),
    players: Array.from({ length: PLAYER_SLOTS }, (_, i) => {
      const position = i + 1;
      const found = Array.isArray(g && g.players)
        ? g.players.find((p) => Number(p && p.position) === position)
        : null;
      if (!found || !found.userId) return createEmptyGroupPlayer(position);
      return {
        position: position,
        userId: found.userId ? String(found.userId) : '',
        avatar: found.avatar ? String(found.avatar) : '',
        displayName: found.displayName
          ? String(found.displayName)
          : (found.competitionName ? String(found.competitionName) : ''),
        gender: found.gender ? String(found.gender) : '',
        tee: found.tee ? String(found.tee) : ''
      };
    })
  }));
}

function hasFormalGroups(match) {
  return !!(match && Array.isArray(match.groups) && match.groups.length > 0);
}

/** 无正式分组时：生成初始草稿（一组空组，报名名单供选人） */
function buildInitialGroupDraft(match) {
  if (hasFormalGroups(match)) {
    return cloneTournamentGroups(match.groups);
  }
  return [createEmptyGroup(0)];
}

function mapDraftToCards(groups) {
  return (groups || []).map((g) => ({
    groupId: g.groupId,
    badge: g.groupName,
    players: (g.players || []).map((p) => {
      const displayName = p.displayName
        ? String(p.displayName)
        : (p.competitionName ? String(p.competitionName) : '');
      return {
        position: p.position,
        name: displayName,
        avatar: p.avatar ? mockAvatars.resolveAvatar(p.avatar) : '',
        teeLabel: p.tee ? 'T' : '',
        teeMarkerClass: p.tee === 'RED_T'
          ? 'tee-marker-dot--female'
          : (p.tee === 'BLUE_T' ? 'tee-marker-dot--male' : '')
      };
    })
  }));
}

function resolveRegisterInfo(match) {
  if (!match || !match.registerInfo) return { totalCount: 0, users: [] };
  return teamMatchStore.normalizeRegisterInfo
    ? teamMatchStore.normalizeRegisterInfo(match.registerInfo)
    : match.registerInfo;
}

function resolveRegisterSubTabs(match, registerInfo) {
  const source = match && Array.isArray(match.teamGroups) && match.teamGroups.length
    ? match.teamGroups
    : DEFAULT_REGISTER_GROUPS;
  const users = registerInfo && Array.isArray(registerInfo.users) ? registerInfo.users : [];
  return source.map((g, idx) => {
    const id = g && g.id != null ? String(g.id) : ('group-' + (idx + 1));
    const name = String((g && g.name) || '').trim() || ('分组' + (idx + 1));
    const count = users.filter((u) => String(u && u.groupId) === id).length;
    return { id: id, name: name, count: count };
  });
}

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    matchId: '',
    mode: 'create',
    headerTitle: '开始分组',
    groupDraft: [],
    draftCards: [],
    groupDeleteModalVisible: false,
    groupDeleteTargetId: '',
    groupDeleteTargetName: '',
    saving: false
  },

  onLoad(options) {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    const matchId = options && options.matchId ? decodeURIComponent(options.matchId) : '';
    const modeOpt = options && options.mode ? String(options.mode) : '';
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    const formalExists = hasFormalGroups(match);
    const mode = modeOpt === 'edit' || modeOpt === 'create'
      ? modeOpt
      : (formalExists ? 'edit' : 'create');
    const draft = buildInitialGroupDraft(match);
    this._registerInfo = resolveRegisterInfo(match);
    this._registerSubTabs = resolveRegisterSubTabs(match, this._registerInfo);
    this._leavingConfirmed = false;
    this.setData({
      matchId: matchId,
      mode: mode,
      headerTitle: mode === 'edit' ? '修改分组' : '开始分组',
      groupDraft: draft,
      draftCards: mapDraftToCards(draft)
    });
  },

  onShow() {
    this.applyTheme(getApp().getTheme());
    this._applyGroupPickResultIfAny();
  },

  applyTheme(theme) {
    this.setData({ themeClass: theme === 'dark' ? 'dark-mode' : 'bright-mode' });
  },

  initHeaderNav() {
    const header = createHeaderStyle();
    this.setData({
      headerRootStyle: header.headerRootStyle,
      headerBarStyle: header.headerBarStyle
    });
  },

  _setGroupDraft(draft) {
    const next = cloneTournamentGroups(draft);
    this.setData({
      groupDraft: next,
      draftCards: mapDraftToCards(next)
    });
  },

  onAddGroup() {
    const draft = (this.data.groupDraft || []).slice();
    draft.push(createEmptyGroup(draft.length));
    this._setGroupDraft(draft);
  },

  onDeleteGroupTap(e) {
    const groupId = String((e.currentTarget.dataset.groupId != null ? e.currentTarget.dataset.groupId : ''));
    const groupName = String((e.currentTarget.dataset.groupName != null ? e.currentTarget.dataset.groupName : ''));
    if (!groupId) return;
    this.setData({
      groupDeleteModalVisible: true,
      groupDeleteTargetId: groupId,
      groupDeleteTargetName: groupName || '该组'
    });
  },

  closeGroupDeleteModal() {
    this.setData({
      groupDeleteModalVisible: false,
      groupDeleteTargetId: '',
      groupDeleteTargetName: ''
    });
  },

  confirmDeleteGroup() {
    const targetId = String(this.data.groupDeleteTargetId || '');
    if (!targetId) {
      this.closeGroupDeleteModal();
      return;
    }
    const next = (this.data.groupDraft || [])
      .filter((g) => String(g && g.groupId) !== targetId)
      .map((g, index) => Object.assign({}, g, {
        groupName: '第' + (index + 1) + '组'
      }));
    this._setGroupDraft(next);
    this.setData({
      groupDeleteModalVisible: false,
      groupDeleteTargetId: '',
      groupDeleteTargetName: ''
    });
  },

  onGroupCardTap(e) {
    const groupId = String((e.currentTarget.dataset.groupId != null ? e.currentTarget.dataset.groupId : ''));
    const groupName = String((e.currentTarget.dataset.groupName != null ? e.currentTarget.dataset.groupName : ''));
    if (!groupId) return;
    const draft = this.data.groupDraft || [];
    const currentGroup = draft.find((g) => String(g.groupId) === groupId) || null;
    const app = getApp();
    app.globalData = app.globalData || {};
    app.globalData.tournamentGroupPickResult = null;
    app.globalData.tournamentGroupPickPayload = {
      matchId: this.data.matchId || '',
      groupId: groupId,
      groupName: groupName,
      players: currentGroup && Array.isArray(currentGroup.players) ? currentGroup.players : [],
      groups: draft.map((g) => ({
        groupId: g && g.groupId ? String(g.groupId) : '',
        groupName: g && g.groupName ? String(g.groupName) : '',
        players: Array.isArray(g && g.players)
          ? g.players.map((p) => ({
            userId: p && p.userId ? String(p.userId) : '',
            position: Number(p && p.position) || 0
          }))
          : []
      })),
      registerInfo: this._registerInfo || { totalCount: 0, users: [] },
      registerSubTabs: this._registerSubTabs || []
    };
    wx.navigateTo({
      url: '/pages/tournament/group-pick/index?matchId=' + encodeURIComponent(this.data.matchId || '') +
        '&groupId=' + encodeURIComponent(groupId) +
        '&groupName=' + encodeURIComponent(groupName)
    });
  },

  _applyGroupPickResultIfAny() {
    const app = getApp();
    const result = app && app.globalData ? app.globalData.tournamentGroupPickResult : null;
    if (!result || !result.groupId) return;
    if (app && app.globalData) app.globalData.tournamentGroupPickResult = null;

    const draft = (this.data.groupDraft || []).slice();
    const idx = draft.findIndex((g) => String(g.groupId) === String(result.groupId));
    if (idx < 0) return;

    const players = Array.from({ length: PLAYER_SLOTS }, (_, i) => {
      const position = i + 1;
      const found = Array.isArray(result.players)
        ? result.players.find((p) => Number(p && p.position) === position)
        : null;
      if (!found || !found.userId) {
        return createEmptyGroupPlayer(position);
      }
      return {
        position: position,
        userId: found.userId ? String(found.userId) : '',
        avatar: found.avatar ? String(found.avatar) : '',
        displayName: found.displayName
          ? String(found.displayName)
          : (found.competitionName ? String(found.competitionName) : ''),
        gender: found.gender ? String(found.gender) : '',
        tee: found.tee ? String(found.tee) : ''
      };
    });

    draft[idx] = Object.assign({}, draft[idx], {
      groupName: result.groupName || draft[idx].groupName,
      players: players
    });
    this._setGroupDraft(draft);
  },

  /**
   * 预留：组合赛制下的组合关系校验入口（本次不实现）
   * @returns {string} 错误文案，空字符串表示通过
   */
  _validateComboRelations(/* draft */) {
    return '';
  },

  _validateGroupDraft(draft) {
    const groups = Array.isArray(draft) ? draft : [];
    // 空草稿 = 用户主动清空正式分组，跳过空组/人数/重复/未分配/组合校验
    if (!groups.length) return '';

    const seen = {};
    let filledGroupCount = 0;
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i] || {};
      const players = (g.players || []).filter((p) => p && String(p.userId || '').trim());
      if (players.length > PLAYER_SLOTS) {
        return (g.groupName || ('第' + (i + 1) + '组')) + '人数超过 ' + PLAYER_SLOTS + ' 人';
      }
      if (players.length === 0) {
        return '存在空分组，请删除或加入球员';
      }
      filledGroupCount += 1;
      for (let j = 0; j < players.length; j++) {
        const id = String(players[j].userId || '').trim();
        if (!id) continue;
        if (seen[id]) return '存在重复球员，请检查分组';
        seen[id] = true;
      }
    }
    if (!filledGroupCount) return '请先完成分组';

    const registerUsers = (this._registerInfo && Array.isArray(this._registerInfo.users))
      ? this._registerInfo.users
      : [];
    const unassigned = registerUsers.filter((u) => {
      const id = u && u.userId != null ? String(u.userId).trim() : '';
      return id && !seen[id];
    });
    if (unassigned.length) {
      return '还有 ' + unassigned.length + ' 名球员未分配分组';
    }

    const comboErr = this._validateComboRelations(groups);
    if (comboErr) return comboErr;

    return '';
  },

  /** 清空正式分组时，顺带清理与 groups 强绑定的派生字段（若存在）；不碰报名/赛事基础信息 */
  _clearGroupDerivedFields(matchPatch) {
    const next = matchPatch || {};
    if (Object.prototype.hasOwnProperty.call(next, 'groupCount')) next.groupCount = 0;
    if (Object.prototype.hasOwnProperty.call(next, 'teeGroups')) next.teeGroups = [];
    if (Object.prototype.hasOwnProperty.call(next, 'groupSummary')) next.groupSummary = null;
    if (Object.prototype.hasOwnProperty.call(next, 'pairings')) next.pairings = [];
    if (Object.prototype.hasOwnProperty.call(next, 'pairingMap')) next.pairingMap = {};
    return next;
  },

  onCancel() {
    this._leavingConfirmed = true;
    wx.navigateBack({ delta: 1 });
  },

  onBack() {
    this.onCancel();
  },

  onConfirm() {
    if (this.data.saving) return;
    const draft = Array.isArray(this.data.groupDraft) ? this.data.groupDraft : [];
    const err = this._validateGroupDraft(draft);
    if (err) {
      wx.showToast({ title: err, icon: 'none' });
      return;
    }
    const matchId = this.data.matchId || '';
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    if (!match) {
      wx.showToast({ title: '未找到比赛信息', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    const isClear = draft.length === 0;
    const formal = isClear ? [] : cloneTournamentGroups(draft);
    // 仅写入 groups / updatedAt（清空时顺带清理派生字段）；不覆盖报名、记分等
    let next = Object.assign({}, match, {
      groups: formal,
      updatedAt: Date.now()
    });
    if (isClear) {
      next = this._clearGroupDerivedFields(next);
    }
    teamMatchStore.saveMatch(next);
    this._leavingConfirmed = true;
    wx.showToast({
      title: isClear ? '分组已清空' : '分组已保存',
      icon: 'success'
    });
    setTimeout(() => {
      wx.navigateBack({ delta: 1 });
    }, 400);
  },

  stopPropagation() {}
});
