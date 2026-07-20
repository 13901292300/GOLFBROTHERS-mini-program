/**
 * 队内赛分组编辑页
 * 编辑 groupDraft / pairingDraft；确定后才写入正式 groups / pairings
 */
const { createHeaderStyle } = require('../../../utils/headerEngine.js');
const teamMatchStore = require('../../../utils/teamMatchStore.js');
const mockAvatars = require('../../../utils/mockAvatars.js');
const playerDirectory = require('../../../utils/playerDirectory.js');
const tPosition = require('../../../utils/tPosition.js');
const { validateStrokeEntities } = require('../../../utils/strokeEntityValidator.js');
const { buildStrokeEntities } = require('../../../utils/strokeEntityBuilder.js');

const STROKE_ENTITY_INVALID_TIP = '当前分组不符合该比赛赛制要求，请重新分组。';

const PLAYER_SLOTS = 4;
const DEFAULT_REGISTER_GROUPS = [
  { id: 'team-group-1', name: '正式队员' },
  { id: 'team-group-2', name: '嘉宾' }
];

function resolveScorePlayerId(entry) {
  if (!entry || typeof entry !== 'object') return '';
  const id = entry.scorePlayerId || entry.slotScorePlayerId || entry.scoreOwnerId || '';
  return id != null ? String(id).trim() : '';
}

function withScorePlayerFields(target, source) {
  const out = target || {};
  const scorePlayerId = resolveScorePlayerId(source);
  if (scorePlayerId) out.scorePlayerId = scorePlayerId;
  if (source && source.hasHistoryScore != null) out.hasHistoryScore = !!source.hasHistoryScore;
  return out;
}

function createEmptyGroupPlayer(position, source) {
  return withScorePlayerFields({
    position: position,
    userId: '',
    avatar: '',
    displayName: '',
    gender: '',
    tee: ''
  }, source);
}

function createEmptyGroup(groupIndex) {
  const n = groupIndex + 1;
  return {
    groupId: 'group-tab-' + Date.now() + '-' + n,
    groupName: '第' + n + '组',
    players: Array.from({ length: PLAYER_SLOTS }, (_, i) => createEmptyGroupPlayer(i + 1))
  };
}

function buildRegisterPlayerLookup(registerInfo) {
  const map = {};
  const users = registerInfo && Array.isArray(registerInfo.users) ? registerInfo.users : [];
  users.forEach((u) => {
    const id = u && u.userId != null ? String(u.userId).trim() : '';
    if (!id) return;
    const gender = playerDirectory.getGenderById(id, u.gender || '');
    map[id] = {
      displayName: u.competitionName || u.nickname || u.displayName || '',
      avatar: u.avatar || '',
      gender: gender,
      tee: tPosition.defaultFromGender(gender)
    };
  });
  return map;
}

/** 编辑草稿：从报名名单补齐展示字段（不写回正式 groups） */
function hydrateDraftPlayers(list, registerInfo) {
  const lookup = buildRegisterPlayerLookup(registerInfo);
  return (Array.isArray(list) ? list : []).map((g, index) => {
    const out = {
      groupId: g && g.groupId != null ? String(g.groupId) : ('group-tab-' + Date.now() + '-' + (index + 1)),
      groupName: g && g.groupName ? String(g.groupName) : ('第' + (index + 1) + '组'),
      players: Array.from({ length: PLAYER_SLOTS }, (_, i) => {
        const position = i + 1;
        const found = Array.isArray(g && g.players)
          ? g.players.find((p) => Number(p && p.position) === position)
          : null;
        if (!found) return createEmptyGroupPlayer(position);
        if (!found.userId) return createEmptyGroupPlayer(position, found);
        const userId = String(found.userId);
        const src = lookup[userId] || {};
        const gender = src.gender || found.gender || playerDirectory.getGenderById(userId, '');
        const teeRaw = found.tee || src.tee || tPosition.defaultFromGender(gender);
        const tee = teeRaw === tPosition.RED_T ? tPosition.RED_T : tPosition.BLUE_T;
        return withScorePlayerFields({
          position: position,
          userId: userId,
          avatar: src.avatar || (found.avatar ? String(found.avatar) : '') || '',
          displayName: src.displayName
            || (found.displayName ? String(found.displayName) : '')
            || (found.competitionName ? String(found.competitionName) : '')
            || '',
          gender: gender,
          tee: tee
        }, found);
      })
    };
    const teeTime = g && g.teeTime != null ? String(g.teeTime).trim() : '';
    if (teeTime) out.teeTime = teeTime;
    const startHole = Number(g && g.startHole);
    if (Number.isFinite(startHole) && startHole >= 1 && startHole <= 18) {
      out.startHole = Math.floor(startHole);
    }
    return out;
  });
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
      if (!found) return createEmptyGroupPlayer(position);
      if (!found.userId) return createEmptyGroupPlayer(position, found);
      return withScorePlayerFields({
        position: position,
        userId: found.userId ? String(found.userId) : '',
        avatar: found.avatar ? String(found.avatar) : '',
        displayName: found.displayName
          ? String(found.displayName)
          : (found.competitionName ? String(found.competitionName) : ''),
        gender: found.gender ? String(found.gender) : '',
        tee: found.tee ? String(found.tee) : ''
      }, found);
    })
  }));
}

/** 正式 groups：只保存 position + userId（位号保留，含空位）；保留 teeTime / startHole */
function toFormalGroups(list) {
  if (!Array.isArray(list)) return [];
  return list.map((g, index) => {
    const out = {
      groupId: g && g.groupId != null ? String(g.groupId) : ('group-tab-' + Date.now() + '-' + (index + 1)),
      groupName: g && g.groupName ? String(g.groupName) : ('第' + (index + 1) + '组'),
      players: Array.from({ length: PLAYER_SLOTS }, (_, i) => {
        const position = i + 1;
        const found = Array.isArray(g && g.players)
          ? g.players.find((p) => Number(p && p.position) === position)
          : null;
        const userId = found && found.userId ? String(found.userId).trim() : '';
        return { position: position, userId: userId };
      })
    };
    const teeTime = g && g.teeTime != null ? String(g.teeTime).trim() : '';
    if (teeTime) out.teeTime = teeTime;
    const startHole = Number(g && g.startHole);
    if (Number.isFinite(startHole) && startHole >= 1 && startHole <= 18) {
      out.startHole = Math.floor(startHole);
    }
    return out;
  });
}

function hasFormalGroups(match) {
  return !!(match && Array.isArray(match.groups) && match.groups.length > 0);
}

function buildInitialGroupDraft(match) {
  const registerInfo = resolveRegisterInfo(match);
  if (hasFormalGroups(match)) {
    return hydrateDraftPlayers(match.groups, registerInfo);
  }
  return [createEmptyGroup(0)];
}

function resolvePlayerDisplayName(p) {
  if (!p) return '';
  if (p.displayName) return String(p.displayName);
  if (p.competitionName) return String(p.competitionName);
  if (p.name) return String(p.name);
  return '';
}

function mapPlayersForCard(players) {
  return (players || []).map((p) => {
    const displayName = resolvePlayerDisplayName(p);
    const tee = p.tee === tPosition.RED_T ? tPosition.RED_T
      : (p.tee === tPosition.BLUE_T ? tPosition.BLUE_T : '');
    const teeText = tee === tPosition.RED_T ? '红T' : (tee === tPosition.BLUE_T ? '蓝T' : '');
    return withScorePlayerFields({
      position: p.position,
      userId: p.userId ? String(p.userId) : '',
      name: displayName,
      displayName: displayName,
      nickname: displayName,
      avatar: p.avatar ? mockAvatars.resolveAvatar(p.avatar, p.userId) : (p.userId ? mockAvatars.resolveAvatar('', p.userId) : ''),
      tee: teeText,
      teeText: teeText,
      teeLabel: teeText,
      teeMarkerClass: tee === tPosition.RED_T
        ? 'tee-marker-dot--female'
        : (tee === tPosition.BLUE_T ? 'tee-marker-dot--male' : '')
    }, p);
  });
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

function createEmptyPairing(index) {
  return {
    id: 'pairing_' + Date.now() + '_' + (index + 1),
    playerIds: []
  };
}

/** 按组内球员顺序：1+2 → 组合1，3+4 → 组合2；奇数末位留作未完成组合 */
function buildAutoPairingsForGroup(group) {
  const players = ((group && group.players) || []).filter((p) => p && String(p.userId || '').trim());
  const list = [];
  for (let i = 0; i + 1 < players.length; i += 2) {
    list.push({
      id: 'pairing_' + Date.now() + '_' + (list.length + 1),
      playerIds: [String(players[i].userId), String(players[i + 1].userId)]
    });
  }
  return list;
}

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    matchId: '',
    mode: 'create',
    headerTitle: '开始分组',
    gameMode: '',
    showPairingSection: false,
    pairingSectionTitle: '组合',
    groupDraft: [],
    pairingDraft: {},
    draftCards: [],
    groupDeleteModalVisible: false,
    groupDeleteTargetId: '',
    groupDeleteTargetName: '',
    pairingEditVisible: false,
    editingPairingGroupId: '',
    editingPairingId: '',
    editingPairingSelectedIds: [],
    pairingEditTitle: '修改组合',
    pairingEditOptions: [],
    saving: false
  },

  onLoad(options) {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    const matchId = options && options.matchId ? decodeURIComponent(options.matchId) : '';
    const modeOpt = options && options.mode ? String(options.mode) : '';
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    const formalExists = hasFormalGroups(match);
    const mode = modeOpt === 'edit' || modeOpt === 'create' || modeOpt === 'live'
      ? modeOpt
      : (formalExists ? 'edit' : 'create');
    const gameMode = match && match.gameMode ? String(match.gameMode) : '';
    const showPairingSection = teamMatchStore.isPairingStrokeFormat(gameMode);
    const draft = buildInitialGroupDraft(match);
    const pairingDraft = showPairingSection
      ? teamMatchStore.clonePairings(match && match.pairings)
      : {};
    this._registerInfo = resolveRegisterInfo(match);
    this._registerSubTabs = resolveRegisterSubTabs(match, this._registerInfo);
    this._leavingConfirmed = false;
    this._pairingIdSeq = 1;
    this.setData({
      matchId: matchId,
      mode: mode,
      headerTitle: mode === 'create' ? '开始分组' : '修改分组',
      gameMode: gameMode,
      showPairingSection: showPairingSection,
      pairingSectionTitle: teamMatchStore.getPairingStrokeLabel(gameMode),
      groupDraft: draft,
      pairingDraft: pairingDraft,
      draftCards: this._buildDraftCards(draft, pairingDraft, showPairingSection, gameMode)
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

  _buildDraftCards(groups, pairingDraft, showPairing, gameMode) {
    const title = teamMatchStore.getPairingStrokeLabel(gameMode || this.data.gameMode);
    return (groups || []).map((g) => {
      const players = mapPlayersForCard(g.players);
      const card = {
        groupId: g.groupId,
        badge: g.groupName,
        players: players
      };
      if (showPairing) {
        card.pairingBlock = this._buildPairingBlockView(g, pairingDraft, title);
      }
      return card;
    });
  },

  _buildPairingBlockView(group, pairingDraft, sectionTitle) {
    const groupId = String(group.groupId || '');
    const players = ((group && group.players) || []).filter((p) => p && String(p.userId || '').trim());
    const playerMap = {};
    players.forEach((p) => {
      playerMap[String(p.userId)] = p;
    });
    const rawList = (pairingDraft && pairingDraft[groupId]) ? pairingDraft[groupId] : [];
    const pairings = rawList.map((pairing, idx) => {
      const ids = Array.isArray(pairing.playerIds) ? pairing.playerIds.map(String) : [];
      const members = ids.map((id) => {
        const p = playerMap[id];
        return {
          userId: id,
          name: resolvePlayerDisplayName(p) || id,
          avatar: p && p.avatar ? mockAvatars.resolveAvatar(p.avatar) : ''
        };
      });
      return {
        id: pairing.id || ('pairing_' + (idx + 1)),
        label: '组合' + (idx + 1),
        playerIds: ids,
        members: members,
        namesText: members.map((m) => m.name).filter(Boolean).join(' / ') || '暂无球员',
        isEmpty: members.length === 0
      };
    });
    const paired = {};
    pairings.forEach((pr) => {
      (pr.playerIds || []).forEach((id) => { paired[id] = true; });
    });
    const incomplete = players
      .filter((p) => !paired[String(p.userId)])
      .map((p) => ({
        userId: String(p.userId),
        name: resolvePlayerDisplayName(p),
        avatar: p.avatar ? mockAvatars.resolveAvatar(p.avatar) : ''
      }));
    return {
      title: sectionTitle || '组合',
      pairings: pairings,
      incompletePlayers: incomplete,
      incompleteNamesText: incomplete.map((p) => p.name).filter(Boolean).join('、'),
      hasIncomplete: incomplete.length > 0
    };
  },

  _refreshCards() {
    this.setData({
      draftCards: this._buildDraftCards(
        this.data.groupDraft,
        this.data.pairingDraft,
        this.data.showPairingSection,
        this.data.gameMode
      )
    });
  },

  _setGroupDraft(draft, pairingDraft) {
    const nextGroups = cloneTournamentGroups(draft);
    let nextPairings = pairingDraft != null
      ? teamMatchStore.clonePairings(pairingDraft)
      : teamMatchStore.clonePairings(this.data.pairingDraft);
    if (this.data.showPairingSection) {
      nextPairings = this._prunePairingsToGroups(nextGroups, nextPairings);
    } else {
      nextPairings = {};
    }
    this.setData({
      groupDraft: nextGroups,
      pairingDraft: nextPairings,
      draftCards: this._buildDraftCards(
        nextGroups,
        nextPairings,
        this.data.showPairingSection,
        this.data.gameMode
      )
    });
  },

  _setPairingDraft(pairingDraft) {
    const next = teamMatchStore.clonePairings(pairingDraft);
    this.setData({
      pairingDraft: next,
      draftCards: this._buildDraftCards(
        this.data.groupDraft,
        next,
        this.data.showPairingSection,
        this.data.gameMode
      )
    });
  },

  /** 删除组或球员变更后，清理无效 pairings */
  _prunePairingsToGroups(groups, pairingDraft) {
    const next = {};
    const groupIds = {};
    (groups || []).forEach((g) => {
      const gid = String(g.groupId || '');
      groupIds[gid] = true;
      const validPlayers = {};
      ((g.players || [])).forEach((p) => {
        const id = p && p.userId ? String(p.userId).trim() : '';
        if (id) validPlayers[id] = true;
      });
      const list = (pairingDraft && pairingDraft[gid]) ? pairingDraft[gid] : [];
      next[gid] = list.map((pr) => ({
        id: pr.id,
        playerIds: (pr.playerIds || []).map(String).filter((id) => validPlayers[id])
      }));
    });
    // 丢弃已删除组的 pairings
    Object.keys(pairingDraft || {}).forEach((gid) => {
      if (!groupIds[gid]) return;
    });
    return next;
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
    const pairingDraft = teamMatchStore.clonePairings(this.data.pairingDraft);
    delete pairingDraft[targetId];
    this._setGroupDraft(next, pairingDraft);
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

    const lookup = buildRegisterPlayerLookup(this._registerInfo || { users: [] });
    const previousPlayers = Array.isArray(draft[idx] && draft[idx].players) ? draft[idx].players : [];
    const previousByPosition = {};
    previousPlayers.forEach((player) => {
      const position = Number(player && player.position) || 0;
      if (position) previousByPosition[position] = player;
    });
    const players = Array.from({ length: PLAYER_SLOTS }, (_, i) => {
      const position = i + 1;
      const previous = previousByPosition[position] || null;
      const found = Array.isArray(result.players)
        ? result.players.find((p) => Number(p && p.position) === position)
        : null;
      if (!found || !found.userId) {
        return createEmptyGroupPlayer(position, previous);
      }
      const userId = String(found.userId);
      const src = lookup[userId] || {};
      const gender = found.gender || src.gender || playerDirectory.getGenderById(userId, '');
      const teeRaw = found.tee || src.tee || tPosition.defaultFromGender(gender);
      const tee = teeRaw === tPosition.RED_T ? tPosition.RED_T : tPosition.BLUE_T;
      return withScorePlayerFields({
        position: position,
        userId: userId,
        avatar: found.avatar || src.avatar || '',
        displayName: found.displayName
          || found.competitionName
          || src.displayName
          || '',
        gender: gender,
        tee: tee
      }, previous || found);
    });

    draft[idx] = Object.assign({}, draft[idx], {
      groupName: result.groupName || draft[idx].groupName,
      players: players
    });
    this._setGroupDraft(draft);
  },

  /* ===== 组合分配 ===== */

  onAutoPairTap(e) {
    if (!this.data.showPairingSection) return;
    const groupId = String((e.currentTarget.dataset.groupId != null ? e.currentTarget.dataset.groupId : ''));
    if (!groupId) return;
    const existing = (this.data.pairingDraft && this.data.pairingDraft[groupId]) || [];
    if (existing.length > 0) {
      wx.showModal({
        title: '提示',
        content: '当前组已有组合，自动组合将覆盖当前组合，是否继续？',
        confirmText: '继续',
        cancelText: '取消',
        success: (res) => {
          if (!res.confirm) return;
          this._applyAutoPair(groupId);
        }
      });
      return;
    }
    this._applyAutoPair(groupId);
  },

  _applyAutoPair(groupId) {
    const group = (this.data.groupDraft || []).find((g) => String(g.groupId) === String(groupId));
    if (!group) return;
    const list = buildAutoPairingsForGroup(group);
    const pairingDraft = teamMatchStore.clonePairings(this.data.pairingDraft);
    pairingDraft[String(groupId)] = list;
    this._setPairingDraft(pairingDraft);
  },

  onAddPairingTap(e) {
    if (!this.data.showPairingSection) return;
    const groupId = String((e.currentTarget.dataset.groupId != null ? e.currentTarget.dataset.groupId : ''));
    if (!groupId) return;
    const pairingDraft = teamMatchStore.clonePairings(this.data.pairingDraft);
    const list = (pairingDraft[groupId] || []).slice();
    list.push(createEmptyPairing(list.length));
    pairingDraft[groupId] = list;
    this._setPairingDraft(pairingDraft);
  },

  onDeletePairingTap(e) {
    if (!this.data.showPairingSection) return;
    const groupId = String((e.currentTarget.dataset.groupId != null ? e.currentTarget.dataset.groupId : ''));
    const pairingId = String((e.currentTarget.dataset.pairingId != null ? e.currentTarget.dataset.pairingId : ''));
    if (!groupId || !pairingId) return;
    const pairingDraft = teamMatchStore.clonePairings(this.data.pairingDraft);
    pairingDraft[groupId] = (pairingDraft[groupId] || []).filter((p) => String(p.id) !== pairingId);
    this._setPairingDraft(pairingDraft);
  },

  /* ===== 组合分配：修改组合弹窗 ===== */

  /**
   * 其它组合占用表（排除当前正在编辑的组合）
   * disabled 只允许来自这里，绝不能来自当前组合原始 playerIds / selectedIds
   */
  _getOtherPairingsOccupiedMap(groupId, editingPairingId) {
    const occupied = {};
    const list = (this.data.pairingDraft && this.data.pairingDraft[groupId]) || [];
    list.forEach((pr, idx) => {
      if (!pr || String(pr.id) === String(editingPairingId)) return;
      const label = '组合' + (idx + 1);
      (pr.playerIds || []).forEach((id) => {
        const uid = String(id || '').trim();
        if (uid) occupied[uid] = label;
      });
    });
    return occupied;
  },

  /**
   * 根据弹窗临时 selectedIds + 其它组合占用，重建列表
   * checked / disabled 完全解耦
   */
  _buildPairingPlayerOptions(groupId, editingPairingId, selectedIds) {
    const group = (this.data.groupDraft || []).find((g) => String(g.groupId) === String(groupId));
    if (!group) return [];
    const selectedSet = {};
    (selectedIds || []).forEach((id) => {
      const uid = String(id || '').trim();
      if (uid) selectedSet[uid] = true;
    });
    const occupiedByOther = this._getOtherPairingsOccupiedMap(groupId, editingPairingId);

    return ((group.players || []).filter((p) => p && p.userId)).map((p, index) => {
      const uid = String(p.userId);
      const occupiedLabel = occupiedByOther[uid] || '';
      const checked = !!selectedSet[uid];
      // disabled 只看其它组合；与 checked、当前组合原始 playerIds 无关
      const disabled = !!occupiedLabel;
      return {
        index: index,
        userId: uid,
        name: resolvePlayerDisplayName(p),
        avatar: p.avatar ? mockAvatars.resolveAvatar(p.avatar) : '',
        checked: checked,
        disabled: disabled,
        occupiedTip: occupiedLabel ? ('已在' + occupiedLabel) : ''
      };
    });
  },

  onEditPairingTap(e) {
    if (!this.data.showPairingSection) return;
    const groupId = String((e.currentTarget.dataset.groupId != null ? e.currentTarget.dataset.groupId : ''));
    const pairingId = String((e.currentTarget.dataset.pairingId != null ? e.currentTarget.dataset.pairingId : ''));
    if (!groupId || !pairingId) return;
    const list = (this.data.pairingDraft && this.data.pairingDraft[groupId]) || [];
    const current = list.find((p) => String(p.id) === pairingId) || { playerIds: [] };
    // 打开时：仅用当前组合 playerIds 初始化临时选中；之后不再读 current.playerIds
    const selectedIds = (current.playerIds || []).map((id) => String(id || '').trim()).filter(Boolean);
    const options = this._buildPairingPlayerOptions(groupId, pairingId, selectedIds);
    this.setData({
      pairingEditVisible: true,
      editingPairingGroupId: groupId,
      editingPairingId: pairingId,
      editingPairingSelectedIds: selectedIds,
      pairingEditTitle: '修改组合',
      pairingEditOptions: options
    });
  },

  onTogglePairingEditPlayer(e) {
    const groupId = this.data.editingPairingGroupId;
    const pairingId = this.data.editingPairingId;
    if (!groupId || !pairingId) return;

    const index = Number(e.currentTarget.dataset.index);
    const opt = (this.data.pairingEditOptions || [])[index];
    if (!opt) return;
    // disabled 球员不可点
    if (opt.disabled) return;

    const userId = String(opt.userId || '');
    if (!userId) return;

    // 再次确认：仅其它组合占用才拦截（不看当前组合）
    const occupiedByOther = this._getOtherPairingsOccupiedMap(groupId, pairingId);
    if (occupiedByOther[userId]) return;

    const beforeSelectedIds = (this.data.editingPairingSelectedIds || []).map(String);
    const exists = beforeSelectedIds.indexOf(userId) >= 0;
    const afterSelectedIds = exists
      ? beforeSelectedIds.filter((id) => id !== userId)
      : beforeSelectedIds.concat([userId]);

    // 先更新临时选中，再整表重建 —— checked/disabled 重新计算
    const options = this._buildPairingPlayerOptions(groupId, pairingId, afterSelectedIds);
    this.setData({
      editingPairingSelectedIds: afterSelectedIds,
      pairingEditOptions: options
    });
  },

  closePairingEditSheet() {
    this.setData({
      pairingEditVisible: false,
      editingPairingGroupId: '',
      editingPairingId: '',
      editingPairingSelectedIds: [],
      pairingEditOptions: []
    });
  },

  confirmPairingEdit() {
    const groupId = this.data.editingPairingGroupId;
    const pairingId = this.data.editingPairingId;
    if (!groupId || !pairingId) {
      this.closePairingEditSheet();
      return;
    }
    // 以弹窗临时 selectedIds 为准；过滤掉仍被其它组合占用的异常项
    const occupiedByOther = this._getOtherPairingsOccupiedMap(groupId, pairingId);
    const selectedIds = (this.data.editingPairingSelectedIds || [])
      .map((id) => String(id || '').trim())
      .filter((id) => id && !occupiedByOther[id]);

    const pairingDraft = teamMatchStore.clonePairings(this.data.pairingDraft);
    const list = (pairingDraft[groupId] || []).slice();
    const idx = list.findIndex((p) => String(p.id) === String(pairingId));
    if (idx < 0) {
      this.closePairingEditSheet();
      return;
    }
    list[idx] = Object.assign({}, list[idx], { playerIds: selectedIds });
    pairingDraft[groupId] = list;
    this._setPairingDraft(pairingDraft);
    this.closePairingEditSheet();
  },

  /** 去掉空组：空分组不写入正式 groups */
  _sanitizeGroupDraft(draft) {
    return (Array.isArray(draft) ? draft : []).filter((g) => {
      const players = (g && g.players) || [];
      return players.some((p) => p && String(p.userId || '').trim());
    }).map((g, index) => Object.assign({}, g, {
      groupName: g.groupName || ('第' + (index + 1) + '组')
    }));
  },

  /**
   * 确定分组校验：
   * - 组内/跨组球员不重复
   * - 组合内球员不跨组合重复
   * - 允许未完成组合、允许 1 人组合、允许部分报名未入组
   */
  _validateGroupDraft(draft, pairingDraft) {
    const groups = this._sanitizeGroupDraft(draft);
    if (!groups.length) return '';

    const seen = {};
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i] || {};
      const players = (g.players || []).filter((p) => p && String(p.userId || '').trim());
      if (players.length > PLAYER_SLOTS) {
        return (g.groupName || ('第' + (i + 1) + '组')) + '人数超过 ' + PLAYER_SLOTS + ' 人';
      }
      const localSeen = {};
      for (let j = 0; j < players.length; j++) {
        const id = String(players[j].userId || '').trim();
        if (!id) continue;
        if (localSeen[id]) return '同一分组内存在重复球员';
        localSeen[id] = true;
        if (seen[id]) return '存在重复球员，请检查分组';
        seen[id] = true;
      }
    }

    if (this.data.showPairingSection) {
      const pairingErr = this._validatePairingDraft(groups, pairingDraft);
      if (pairingErr) return pairingErr;
    }

    return '';
  },

  _validatePairingDraft(groups, pairingDraft) {
    const groupPlayerSet = {};
    (groups || []).forEach((g) => {
      const gid = String(g.groupId || '');
      groupPlayerSet[gid] = {};
      ((g.players || [])).forEach((p) => {
        const id = p && p.userId ? String(p.userId).trim() : '';
        if (id) groupPlayerSet[gid][id] = true;
      });
    });

    const globalPairSeen = {};
    const draft = pairingDraft || {};
    const groupIds = Object.keys(draft);
    for (let gi = 0; gi < groupIds.length; gi++) {
      const gid = groupIds[gi];
      const list = draft[gid] || [];
      const localPairSeen = {};
      for (let i = 0; i < list.length; i++) {
        const ids = (list[i] && list[i].playerIds) || [];
        for (let j = 0; j < ids.length; j++) {
          const id = String(ids[j] || '').trim();
          if (!id) continue;
          if (groupPlayerSet[gid] && !groupPlayerSet[gid][id]) {
            return '组合中存在不属于当前出发组的球员';
          }
          if (localPairSeen[id]) return '同一球员不能属于多个组合';
          localPairSeen[id] = true;
          if (globalPairSeen[id]) return '同一球员不能属于多个组合';
          globalPairSeen[id] = true;
        }
      }
    }
    return '';
  },

  _clearGroupDerivedFields(matchPatch) {
    const next = matchPatch || {};
    next.pairings = {};
    next.scoreEntities = {};
    if (Object.prototype.hasOwnProperty.call(next, 'groupCount')) next.groupCount = 0;
    if (Object.prototype.hasOwnProperty.call(next, 'teeGroups')) next.teeGroups = [];
    if (Object.prototype.hasOwnProperty.call(next, 'groupSummary')) next.groupSummary = null;
    if (Object.prototype.hasOwnProperty.call(next, 'pairingMap')) next.pairingMap = {};
    return next;
  },

  _validateLiveGroupDraft(draft) {
    const groups = Array.isArray(draft) ? draft : [];
    const seen = {};
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i] || {};
      const players = Array.isArray(g.players) ? g.players : [];
      const localSeen = {};
      for (let j = 0; j < players.length; j++) {
        const id = String((players[j] && players[j].userId) || '').trim();
        if (!id) continue;
        if (localSeen[id]) return '同一分组内存在重复球员';
        localSeen[id] = true;
        if (seen[id]) return '存在重复球员，请检查分组';
        seen[id] = true;
      }
    }
    return '';
  },

  _findPlayerEntryByPosition(group, position) {
    const pos = Number(position) || 0;
    const players = Array.isArray(group && group.players) ? group.players : [];
    return players.find((player) =>
      Number(player && (player.position != null ? player.position : player.slotIndex)) === pos
    ) || null;
  },

  _buildLivePlayerEntry(oldEntry, draftEntry, position) {
    const oldUserId = oldEntry && (oldEntry.userId || oldEntry.playerId || oldEntry.id)
      ? String(oldEntry.userId || oldEntry.playerId || oldEntry.id).trim()
      : '';
    const nextUserId = draftEntry && draftEntry.userId ? String(draftEntry.userId).trim() : '';
    const scorePlayerId = resolveScorePlayerId(oldEntry) || resolveScorePlayerId(draftEntry) || oldUserId || nextUserId;
    if (!nextUserId) {
      const empty = { position: position, userId: '', playerId: '', id: '' };
      if (scorePlayerId) empty.scorePlayerId = scorePlayerId;
      return empty;
    }
    const next = Object.assign({}, oldEntry || {}, {
      position: position,
      userId: nextUserId,
      playerId: nextUserId,
      id: nextUserId
    });
    if (draftEntry && draftEntry.avatar) next.avatar = draftEntry.avatar;
    if (draftEntry && draftEntry.displayName) next.displayName = draftEntry.displayName;
    if (draftEntry && draftEntry.gender) next.gender = draftEntry.gender;
    if (draftEntry && draftEntry.tee) next.tee = draftEntry.tee;
    if (scorePlayerId) next.scorePlayerId = scorePlayerId;
    return next;
  },

  _buildLiveGroupFromDraft(oldGroup, draftGroup, index) {
    const base = oldGroup || {};
    const groupId = draftGroup && draftGroup.groupId
      ? String(draftGroup.groupId)
      : (base.groupId ? String(base.groupId) : ('group-tab-' + Date.now() + '-' + (index + 1)));
    const next = Object.assign({}, base, {
      groupId: groupId,
      groupName: draftGroup && draftGroup.groupName ? String(draftGroup.groupName) : (base.groupName || ('第' + (index + 1) + '组')),
      players: Array.from({ length: PLAYER_SLOTS }, (_, i) => {
        const position = i + 1;
        const oldEntry = this._findPlayerEntryByPosition(base, position);
        const draftEntry = this._findPlayerEntryByPosition(draftGroup, position);
        return this._buildLivePlayerEntry(oldEntry, draftEntry, position);
      })
    });
    const teeTime = draftGroup && draftGroup.teeTime != null ? String(draftGroup.teeTime).trim() : '';
    if (teeTime) next.teeTime = teeTime;
    const startHole = Number(draftGroup && draftGroup.startHole);
    if (Number.isFinite(startHole) && startHole >= 1 && startHole <= 18) {
      next.startHole = Math.floor(startHole);
    }
    return next;
  },

  _confirmLiveGroups(match, rawDraft, pairingDraft) {
    const oldGroups = Array.isArray(match && match.groups) ? match.groups : [];
    const draftGroups = Array.isArray(rawDraft) ? rawDraft : [];
    const oldById = {};
    oldGroups.forEach((group) => {
      const groupId = group && group.groupId ? String(group.groupId) : '';
      if (groupId) oldById[groupId] = group;
    });
    const draftIds = {};
    draftGroups.forEach((group) => {
      const groupId = group && group.groupId ? String(group.groupId) : '';
      if (groupId) draftIds[groupId] = true;
    });
    const deletedGroupIds = Object.keys(oldById).filter((groupId) => !draftIds[groupId]);
    const nextGroups = draftGroups.map((group, index) => {
      const groupId = group && group.groupId ? String(group.groupId) : '';
      return this._buildLiveGroupFromDraft(groupId ? oldById[groupId] : null, group, index);
    });
    const nextScoreData = match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
      ? Object.assign({}, match.scoreData)
      : {};
    deletedGroupIds.forEach((groupId) => {
      delete nextScoreData[groupId];
    });
    let nextPairings = teamMatchStore.clonePairings(match.pairings || {});
    deletedGroupIds.forEach((groupId) => {
      delete nextPairings[groupId];
    });
    if (this.data.showPairingSection) {
      nextPairings = teamMatchStore.sanitizePairings(this._prunePairingsToGroups(nextGroups, nextPairings));
    } else {
      nextPairings = {};
    }
    // LIVE：不重建 scoreEntities（Object.assign 保留原字段）；不调用 buildStrokeEntities
    const next = Object.assign({}, match, {
      groups: nextGroups,
      pairings: nextPairings,
      scoreData: nextScoreData,
      updatedAt: Date.now()
    });
    teamMatchStore.saveMatch(next);
    this._leavingConfirmed = true;
    wx.showToast({ title: '分组已保存', icon: 'success' });
    setTimeout(() => {
      wx.navigateBack({ delta: 1 });
    }, 400);
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
    const rawDraft = Array.isArray(this.data.groupDraft) ? this.data.groupDraft : [];
    const pairingDraft = this.data.pairingDraft || {};
    const isLiveMode = this.data.mode === 'live';
    const err = isLiveMode
      ? this._validateLiveGroupDraft(rawDraft)
      : this._validateGroupDraft(rawDraft, pairingDraft);
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
    if (isLiveMode) {
      this._confirmLiveGroups(match, rawDraft, pairingDraft);
      return;
    }
    const sanitized = this._sanitizeGroupDraft(rawDraft);
    const isClear = sanitized.length === 0;
    // 正式 groups 只持久化 position + userId；展示字段由详情页 hydrate
    // 按 groupId 合并保留已有出发信息（teeTime / startHole）
    const teeSheetManage = require('../../../utils/teeSheetManage.js');
    let formal = isClear ? [] : toFormalGroups(sanitized);
    if (!isClear) {
      formal = teeSheetManage.mergeTeeFieldsByGroupId(match.groups, formal);
    }

    const gameMode = String(match.gameMode || this.data.gameMode || '');
    const isG4Stroke = gameMode === '四人两球比杆赛';
    // G4 成绩主体来自 pairings；即使 UI 组合区未开，保存时仍保留/写入 pairings
    const shouldPersistPairings = this.data.showPairingSection || isG4Stroke;

    let formalPairings = {};
    if (!isClear && shouldPersistPairings) {
      const pairingSource = this.data.showPairingSection
        ? pairingDraft
        : (match.pairings || {});
      const pruned = this._prunePairingsToGroups(formal, pairingSource);
      formalPairings = teamMatchStore.sanitizePairings(pruned);
    }

    let next = Object.assign({}, match, {
      groups: formal,
      pairings: isClear ? {} : (shouldPersistPairings ? formalPairings : {}),
      updatedAt: Date.now()
    });
    if (isClear) {
      next = this._clearGroupDerivedFields(next);
    } else if (!shouldPersistPairings) {
      next.pairings = {};
    }

    // Phase1：报名期保存生成 scoreEntities；失败则阻止写盘
    if (!isClear) {
      const check = validateStrokeEntities(next);
      if (!check || check.valid !== true) {
        console.warn('[stroke-entity-validate]', check && check.reason ? check.reason : 'invalid');
        this.setData({ saving: false });
        wx.showToast({ title: STROKE_ENTITY_INVALID_TIP, icon: 'none' });
        return;
      }
      next.scoreEntities = buildStrokeEntities(next);
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
