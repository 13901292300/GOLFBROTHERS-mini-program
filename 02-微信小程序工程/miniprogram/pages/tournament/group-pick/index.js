const { createHeaderStyle } = require('../../../utils/headerEngine.js');
const teamMatchStore = require('../../../utils/teamMatchStore.js');

const TEE_BLUE = 'BLUE_T';
const TEE_RED = 'RED_T';

function createEmptySlot(position) {
  return {
    position: position,
    userId: '',
    avatar: '',
    displayName: '',
    gender: '',
    handicap: '',
    tee: '',
    teeLabel: '',
    teeMarkerClass: ''
  };
}

function createSlots() {
  return [1, 2, 3, 4].map((p) => createEmptySlot(p));
}

/**
 * 加入分组时的默认 T 台：按报名记录性别写入 player.tee（赛事球员配置，非资料/报名字段）。
 * 显示侧只读 tee，不再按性别实时计算。
 */
function defaultTeeFromRegisterGender(gender) {
  const g = String(gender || '').trim().toLowerCase();
  if (g === '女' || g === 'female' || g === 'f') return TEE_RED;
  if (g === '男' || g === 'male' || g === 'm') return TEE_BLUE;
  return '';
}

/** 仅根据已存 player.tee 生成显示字段，禁止用性别回推 */
function teeDisplayFields(tee) {
  const value = String(tee || '');
  if (value === TEE_RED) {
    return { tee: TEE_RED, teeLabel: 'T', teeMarkerClass: 'tee-marker-dot--female' };
  }
  if (value === TEE_BLUE) {
    return { tee: TEE_BLUE, teeLabel: 'T', teeMarkerClass: 'tee-marker-dot--male' };
  }
  return { tee: value, teeLabel: value ? 'T' : '', teeMarkerClass: '' };
}

/** 赛事显示名：仅 competitionName / displayName，禁止 nickname */
function resolveRegisterDisplayName(user) {
  if (!user) return '';
  if (user.displayName != null && String(user.displayName).trim()) {
    return String(user.displayName).trim();
  }
  if (user.competitionName != null && String(user.competitionName).trim()) {
    return String(user.competitionName).trim();
  }
  return '';
}

function normalizeUser(user) {
  return {
    userId: user && user.userId ? String(user.userId) : '',
    avatar: user && user.avatar ? String(user.avatar) : '',
    displayName: resolveRegisterDisplayName(user),
    gender: user && user.gender ? String(user.gender) : '',
    handicap: user && user.handicap != null && user.handicap !== '' ? String(user.handicap) : '-',
    groupId: user && user.groupId != null ? String(user.groupId) : ''
  };
}

function hydrateSlotsFromPlayers(players) {
  const slots = createSlots();
  if (!Array.isArray(players)) return slots;
  players.forEach((p) => {
    const pos = Number(p && p.position);
    if (!(pos >= 1 && pos <= 4)) return;
    const idx = pos - 1;
    const teeFields = teeDisplayFields(p.tee);
    slots[idx] = Object.assign({
      position: pos,
      userId: p.userId ? String(p.userId) : '',
      avatar: p.avatar ? String(p.avatar) : '',
      displayName: resolveRegisterDisplayName(p) || (p.displayName ? String(p.displayName) : ''),
      gender: p.gender ? String(p.gender) : '',
      handicap: p.handicap != null && p.handicap !== '' ? String(p.handicap) : '-'
    }, teeFields);
  });
  return slots;
}

function snapshotSlots(slots) {
  return JSON.stringify((slots || []).map((s) => ({
    position: s.position,
    userId: String(s.userId || ''),
    displayName: String(s.displayName || ''),
    avatar: String(s.avatar || ''),
    gender: String(s.gender || ''),
    tee: String(s.tee || '')
  })));
}

Page({
  data: {
    headerRootStyle: '',
    headerBarStyle: '',
    groupId: '',
    groupName: '',
    slots: createSlots(),
    registerSubTabs: [],
    activeSubTabId: '',
    displayUsers: []
  },

  onLoad(options) {
    this.initHeaderNav();
    const groupId = options && options.groupId ? decodeURIComponent(options.groupId) : '';
    const groupName = options && options.groupName ? decodeURIComponent(options.groupName) : '';
    const matchId = options && options.matchId ? decodeURIComponent(options.matchId) : '';
    const payload = this._resolvePayload(matchId);
    this._registerInfo = payload.registerInfo || { totalCount: 0, users: [] };
    this._allGroups = payload.groups || [];
    this._leavingConfirmed = false;
    const tabs = this._resolveTabs(payload.match, payload.registerSubTabs, payload.registerInfo);
    const activeSubTabId = tabs.length ? tabs[0].id : '';
    const slots = hydrateSlotsFromPlayers(payload.players);
    this._initialSlotsSnapshot = snapshotSlots(slots);
    this.setData({
      groupId: groupId,
      groupName: groupName || '分组',
      slots: slots,
      registerSubTabs: tabs,
      activeSubTabId: activeSubTabId,
      displayUsers: this._buildDisplayUsers(this._registerInfo, activeSubTabId, slots)
    });
  },

  initHeaderNav() {
    const header = createHeaderStyle();
    this.setData({
      headerRootStyle: header.headerRootStyle,
      headerBarStyle: header.headerBarStyle
    });
  },

  _resolvePayload(matchId) {
    const app = getApp();
    const payload = (app && app.globalData && app.globalData.tournamentGroupPickPayload) || null;
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    return {
      match: match,
      registerInfo: payload && payload.registerInfo ? payload.registerInfo : (match && match.registerInfo) || { totalCount: 0, users: [] },
      registerSubTabs: payload && Array.isArray(payload.registerSubTabs) ? payload.registerSubTabs : [],
      players: payload && Array.isArray(payload.players) ? payload.players : [],
      groups: payload && Array.isArray(payload.groups) ? payload.groups : []
    };
  },

  _resolveTabs(match, cachedTabs, registerInfo) {
    if (Array.isArray(cachedTabs) && cachedTabs.length) {
      return cachedTabs.map((t) => ({
        id: String(t.id || ''),
        name: String(t.name || ''),
        count: Number(t.count || 0)
      }));
    }
    const source = match && Array.isArray(match.teamGroups) && match.teamGroups.length
      ? match.teamGroups
      : [{ id: 'team-group-1', name: '正式队员' }, { id: 'team-group-2', name: '嘉宾' }];
    const users = registerInfo && Array.isArray(registerInfo.users) ? registerInfo.users : [];
    return source.map((g, idx) => {
      const id = g && g.id != null ? String(g.id) : ('group-' + (idx + 1));
      const name = String((g && g.name) || '').trim() || ('分组' + (idx + 1));
      const count = users.filter((u) => String(u && u.groupId) === id).length;
      return { id: id, name: name, count: count };
    });
  },

  _buildDisplayUsers(registerInfo, groupId, slots) {
    const users = registerInfo && Array.isArray(registerInfo.users) ? registerInfo.users : [];
    const selectedMap = this._buildSelectedMap(slots || []);
    const occupiedMap = this._buildOccupiedMap(groupId);
    const selectedCount = Object.keys(selectedMap).length;
    const groupFull = selectedCount >= 4;
    return users
      .map(normalizeUser)
      .filter((u) => String(u.groupId) === String(groupId || ''))
      .map((u) => {
        const uid = String(u.userId || '');
        const selectedSlot = selectedMap[uid] || 0;
        const occupiedGroupName = occupiedMap[uid] || '';
        const isSelectedInCurrentGroup = !!selectedSlot;
        const isOccupied = !isSelectedInCurrentGroup && !!occupiedGroupName;
        const isSelected = isSelectedInCurrentGroup || isOccupied;
        let isDisabled = false;
        if (isSelectedInCurrentGroup) {
          isDisabled = false;
        } else if (isOccupied) {
          isDisabled = true;
        } else if (groupFull) {
          isDisabled = true;
        }
        return Object.assign({}, u, {
          isSelected: isSelected,
          selectedSlot: selectedSlot,
          isOccupied: isOccupied,
          occupiedGroupName: occupiedGroupName,
          isDisabled: isDisabled
        });
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'en', { sensitivity: 'base' }));
  },

  _buildOccupiedMap(currentGroupId) {
    const map = {};
    const groups = this._allGroups || [];
    groups.forEach((group) => {
      const gid = String((group && group.groupId) || '');
      if (!gid || gid === String(currentGroupId || '')) return;
      const groupName = String((group && group.groupName) || '');
      const players = Array.isArray(group && group.players) ? group.players : [];
      players.forEach((player) => {
        const uid = String((player && player.userId) || '');
        if (!uid || map[uid]) return;
        map[uid] = groupName || '其他分组';
      });
    });
    return map;
  },

  _buildSelectedMap(slots) {
    const map = {};
    (slots || []).forEach((slot) => {
      const uid = String((slot && slot.userId) || '');
      if (!uid) return;
      map[uid] = Number(slot.position || 0);
    });
    return map;
  },

  _countFilledSlots(slots) {
    return (slots || []).filter((s) => !!String((s && s.userId) || '')).length;
  },

  _refreshDisplayUsers(activeSubTabId, slots) {
    this.setData({
      displayUsers: this._buildDisplayUsers(this._registerInfo, activeSubTabId, slots)
    });
  },

  _isDirty() {
    return snapshotSlots(this.data.slots) !== this._initialSlotsSnapshot;
  },

  _buildConfirmPayload() {
    return {
      groupId: this.data.groupId || '',
      groupName: this.data.groupName || '',
      players: (this.data.slots || []).map((s) => ({
        position: Number(s.position) || 0,
        userId: s.userId ? String(s.userId) : '',
        displayName: s.displayName ? String(s.displayName) : '',
        avatar: s.avatar ? String(s.avatar) : '',
        gender: s.gender ? String(s.gender) : '',
        tee: s.tee ? String(s.tee) : ''
      }))
    };
  },

  _commitAndBack() {
    const app = getApp();
    app.globalData = app.globalData || {};
    app.globalData.tournamentGroupPickResult = this._buildConfirmPayload();
    this._leavingConfirmed = true;
    this._initialSlotsSnapshot = snapshotSlots(this.data.slots);
    wx.navigateBack({ delta: 1 });
  },

  _discardAndBack() {
    this._leavingConfirmed = true;
    wx.navigateBack({ delta: 1 });
  },

  onBack() {
    if (this._leavingConfirmed || !this._isDirty()) {
      this._discardAndBack();
      return;
    }
    wx.showModal({
      title: '提示',
      content: '是否保存修改？',
      confirmText: '保存',
      cancelText: '不保存',
      success: (res) => {
        if (res.confirm) {
          this._commitAndBack();
        } else if (res.cancel) {
          this._discardAndBack();
        }
      }
    });
  },

  onConfirm() {
    this._commitAndBack();
  },

  switchSubTab(e) {
    const id = String((e.currentTarget.dataset.id != null ? e.currentTarget.dataset.id : ''));
    if (!id || id === this.data.activeSubTabId) return;
    this.setData({
      activeSubTabId: id
    }, () => {
      this._refreshDisplayUsers(id, this.data.slots);
    });
  },

  /** 复选框切换：勾选填入首个空位；取消仅清空对应位，不自动补位 */
  onTogglePlayer(e) {
    const user = e.currentTarget.dataset.user || null;
    if (!user) return;
    if (user.isOccupied) return;
    const pickedUserId = String(user.userId || '');
    if (!pickedUserId) return;

    const slots = (this.data.slots || []).slice();
    const selectedIndex = slots.findIndex((s) => String((s && s.userId) || '') === pickedUserId);

    // 取消勾选：清空该位置，其余位置保持原序
    if (selectedIndex >= 0) {
      slots[selectedIndex] = createEmptySlot(slots[selectedIndex].position || (selectedIndex + 1));
      this.setData({ slots: slots }, () => {
        this._refreshDisplayUsers(this.data.activeSubTabId, slots);
      });
      return;
    }

    // 已满 4 人：其余未选不可再勾
    if (this._countFilledSlots(slots) >= 4) {
      wx.showToast({ title: '每组最多4人', icon: 'none' });
      return;
    }

    const emptyIndex = slots.findIndex((s) => !String((s && s.userId) || ''));
    if (emptyIndex < 0) {
      wx.showToast({ title: '每组最多4人', icon: 'none' });
      return;
    }

    const gender = user.gender || '';
    // 首次勾选：按报名性别写入赛事球员配置 player.tee
    const teeFields = teeDisplayFields(defaultTeeFromRegisterGender(gender));
    slots[emptyIndex] = Object.assign({}, slots[emptyIndex], {
      userId: pickedUserId,
      avatar: user.avatar || '',
      displayName: user.displayName || '',
      gender: gender,
      handicap: user.handicap || '-'
    }, teeFields);
    this.setData({ slots: slots }, () => {
      this._refreshDisplayUsers(this.data.activeSubTabId, slots);
    });
  }
});
