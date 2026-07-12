const { createHeaderStyle } = require('../../../utils/headerEngine.js');
const teamMatchStore = require('../../../utils/teamMatchStore.js');
const playerManage = require('../../../utils/playerManage.js');

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
    return {
      tee: TEE_RED,
      teeLabel: '红T',
      teeText: '红T',
      teeMarkerClass: 'tee-marker-dot--female'
    };
  }
  if (value === TEE_BLUE) {
    return {
      tee: TEE_BLUE,
      teeLabel: '蓝T',
      teeText: '蓝T',
      teeMarkerClass: 'tee-marker-dot--male'
    };
  }
  return {
    tee: value,
    teeLabel: value ? String(value) : '',
    teeText: value ? String(value) : '',
    teeMarkerClass: ''
  };
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
  const genderDisplay = playerManage.getGenderDisplay(user);
  return {
    userId: user && user.userId ? String(user.userId) : '',
    avatar: user && user.avatar ? String(user.avatar) : '',
    displayName: resolveRegisterDisplayName(user),
    gender: user && user.gender ? String(user.gender) : '',
    sex: user && user.sex ? String(user.sex) : '',
    genderIcon: genderDisplay.icon,
    genderClass: genderDisplay.className,
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

/** 从 slots 得到临时选中 id 列表（等价 editingGroupSelectedIds） */
function slotsToSelectedIds(slots) {
  return (slots || [])
    .map((s) => String((s && s.userId) || '').trim())
    .filter(Boolean);
}

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    groupId: '',
    groupName: '',
    editingGroupIndex: -1,
    slots: createSlots(),
    registerSubTabs: [],
    activeSubTabId: '',
    displayUsers: []
  },

  onLoad(options) {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    const groupId = options && options.groupId ? decodeURIComponent(options.groupId) : '';
    const groupName = options && options.groupName ? decodeURIComponent(options.groupName) : '';
    const matchId = options && options.matchId ? decodeURIComponent(options.matchId) : '';
    const payload = this._resolvePayload(matchId);
    this._registerInfo = payload.registerInfo || { totalCount: 0, users: [] };
    this._allGroups = payload.groups || [];
    this._leavingConfirmed = false;

    const editingGroupIndex = (this._allGroups || []).findIndex(
      (g) => String((g && g.groupId) || '') === String(groupId)
    );

    const tabs = this._resolveTabs(payload.match, payload.registerSubTabs, payload.registerInfo);
    const activeSubTabId = tabs.length ? tabs[0].id : '';
    const slots = hydrateSlotsFromPlayers(payload.players);
    this._initialSlotsSnapshot = snapshotSlots(slots);
    this.setData({
      groupId: groupId,
      groupName: groupName || '分组',
      editingGroupIndex: editingGroupIndex,
      slots: slots,
      registerSubTabs: tabs,
      activeSubTabId: activeSubTabId,
      displayUsers: this._buildDisplayUsers(this._registerInfo, activeSubTabId, slots, groupId, editingGroupIndex)
    });
  },

  onShow() {
    this.applyTheme(getApp().getTheme());
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

  /**
   * 其它出发组占用表：必须排除当前正在编辑的出发组
   * 排除条件：group.groupId === editingGroupId 或 index === editingGroupIndex
   */
  _buildOccupiedMap(editingGroupId, editingGroupIndex) {
    const map = {};
    const groups = this._allGroups || [];
    const editId = String(editingGroupId || '');
    const editIdx = editingGroupIndex != null ? Number(editingGroupIndex) : -1;

    groups.forEach((group, index) => {
      const gid = String((group && group.groupId) || '');
      const isEditingGroup =
        (!!editId && gid === editId) ||
        (editIdx >= 0 && Number(index) === editIdx);
      if (isEditingGroup) return;

      const groupName = String((group && group.groupName) || '') || ('第' + (index + 1) + '组');
      const players = Array.isArray(group && group.players) ? group.players : [];
      players.forEach((player) => {
        const uid = player && (player.userId != null ? player.userId : player.id);
        const id = String(uid || '').trim();
        if (!id || map[id]) return;
        map[id] = groupName;
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

  /**
   * 弹窗列表状态：
   * checked  = 是否在当前 slots（临时选中）
   * disabled = 是否在其它出发组（与 checked / 当前组原始名单无关）
   */
  _buildDisplayUsers(registerInfo, registerSubTabId, slots, editingGroupId, editingGroupIndex) {
    const users = registerInfo && Array.isArray(registerInfo.users) ? registerInfo.users : [];
    const editId = editingGroupId != null ? editingGroupId : this.data.groupId;
    const editIdx = editingGroupIndex != null ? editingGroupIndex : this.data.editingGroupIndex;
    const selectedMap = this._buildSelectedMap(slots || []);
    const occupiedMap = this._buildOccupiedMap(editId, editIdx);
    const selectedCount = Object.keys(selectedMap).length;
    const groupFull = selectedCount >= 4;
    const selectedIds = slotsToSelectedIds(slots);

    return users
      .map(normalizeUser)
      .filter((u) => String(u.groupId) === String(registerSubTabId || ''))
      .map((u) => {
        const uid = String(u.userId || '');
        const checked = !!selectedMap[uid];
        const occupiedGroupName = occupiedMap[uid] || '';
        const isOccupied = !!occupiedGroupName;
        // disabled 只看其它出发组占用；满员时仅未选中者不可再选
        let isDisabled = false;
        if (isOccupied) {
          isDisabled = true;
        } else if (!checked && groupFull) {
          isDisabled = true;
        } else {
          isDisabled = false;
        }
        return Object.assign({}, u, {
          isSelected: checked,
          checked: checked,
          selectedSlot: selectedMap[uid] || 0,
          isOccupied: isOccupied,
          occupiedGroupName: occupiedGroupName,
          isDisabled: isDisabled
        });
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'en', { sensitivity: 'base' }));
  },

  _countFilledSlots(slots) {
    return (slots || []).filter((s) => !!String((s && s.userId) || '')).length;
  },

  _refreshDisplayUsers(registerSubTabId, slots) {
    this.setData({
      displayUsers: this._buildDisplayUsers(
        this._registerInfo,
        registerSubTabId,
        slots,
        this.data.groupId,
        this.data.editingGroupIndex
      )
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

  /**
   * 勾选/取消：只改 slots（临时选中），再重建列表。
   * 不信任 data-user 上的旧 isOccupied/isDisabled，按实时 occupiedMap 判断。
   */
  onTogglePlayer(e) {
    const user = e.currentTarget.dataset.user || null;
    if (!user) return;
    const pickedUserId = String(user.userId || '');
    if (!pickedUserId) return;

    const slots = (this.data.slots || []).slice();
    const editingGroupId = this.data.groupId;
    const editingGroupIndex = this.data.editingGroupIndex;
    const occupiedMap = this._buildOccupiedMap(editingGroupId, editingGroupIndex);

    // 其它出发组占用：不可选
    if (occupiedMap[pickedUserId]) return;

    const selectedIndex = slots.findIndex((s) => String((s && s.userId) || '') === pickedUserId);

    // 取消勾选：清空该位置
    if (selectedIndex >= 0) {
      slots[selectedIndex] = createEmptySlot(slots[selectedIndex].position || (selectedIndex + 1));
      const displayUsers = this._buildDisplayUsers(
        this._registerInfo,
        this.data.activeSubTabId,
        slots,
        editingGroupId,
        editingGroupIndex
      );
      this.setData({ slots: slots, displayUsers: displayUsers });
      return;
    }

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
    const teeFields = teeDisplayFields(defaultTeeFromRegisterGender(gender));
    slots[emptyIndex] = Object.assign({}, slots[emptyIndex], {
      userId: pickedUserId,
      avatar: user.avatar || '',
      displayName: user.displayName || '',
      gender: gender,
      handicap: user.handicap || '-'
    }, teeFields);

    const displayUsers = this._buildDisplayUsers(
      this._registerInfo,
      this.data.activeSubTabId,
      slots,
      editingGroupId,
      editingGroupIndex
    );
    this.setData({ slots: slots, displayUsers: displayUsers });
  }
});
