const { createHeaderStyle } = require('../../../utils/headerEngine.js');
const teamMatchStore = require('../../../utils/teamMatchStore.js');
const playerManage = require('../../../utils/playerManage.js');
const {
  buildRegisterTeamMap,
  isG5MatchPlayMode,
  isG6G7MatchPlayMode,
  isG8MatchPlayMode,
  isG4FamilyMode,
  validateG5MatchPlayPlayers,
  validateG6G7MatchPlayPlayers,
  validateG8MatchPlayPlayers
} = require('../../../utils/strokeEntityValidator.js');

const TEE_BLUE = 'BLUE_T';
const TEE_RED = 'RED_T';

function listFilledPickPlayers(players) {
  return (Array.isArray(players) ? players : [])
    .map((p) => ({
      userId: p && p.userId != null ? String(p.userId).trim() : '',
      position: Number(p && p.position) || 0
    }))
    .filter((p) => p.userId)
    .sort((a, b) => a.position - b.position || String(a.userId).localeCompare(String(b.userId)));
}

function ensurePlayersHaveTeam(filled, teamMap) {
  for (let i = 0; i < filled.length; i++) {
    const uid = filled[i].userId;
    const teamId = teamMap && teamMap[uid] != null ? String(teamMap[uid]).trim() : '';
    if (!teamId) {
      return '存在未归属分队的球员，请先完成报名分队';
    }
  }
  return '';
}

function isSameTeamMembers(userIds, teamMap) {
  let first = '';
  for (let i = 0; i < userIds.length; i++) {
    const tid = teamMap && teamMap[userIds[i]] != null ? String(teamMap[userIds[i]]).trim() : '';
    if (!tid) return false;
    if (!first) first = tid;
    else if (tid !== first) return false;
  }
  return true;
}

/**
 * 按分队分桶后桶内每 2 人切成成绩组合（与 2+2 / G4 pair 生成思路一致）
 * @returns {Array<{ teamId: string, members: string[] }>}
 */
function generatePairCompositionsByTeam(filled, teamMap) {
  const buckets = {};
  const teamOrder = [];
  filled.forEach((p) => {
    const tid = teamMap && teamMap[p.userId] != null ? String(teamMap[p.userId]).trim() : '';
    const key = tid || '__unknown__';
    if (!buckets[key]) {
      buckets[key] = [];
      teamOrder.push(key);
    }
    buckets[key].push(p);
  });

  const compositions = [];
  teamOrder.forEach((teamId) => {
    const list = (buckets[teamId] || []).slice().sort(
      (a, b) => a.position - b.position || String(a.userId).localeCompare(String(b.userId))
    );
    for (let i = 0; i < list.length; i += 2) {
      const chunk = list.slice(i, i + 2);
      compositions.push({
        teamId: teamId === '__unknown__' ? '' : teamId,
        members: chunk.map((p) => p.userId)
      });
    }
  });
  return compositions;
}

/**
 * 校验每个成绩组合内部同队，且 2 人 pair 无落单
 */
function validateGeneratedPairCompositions(compositions, teamMap, expectedPairCount) {
  if (!Array.isArray(compositions) || compositions.length !== expectedPairCount) {
    return '无法形成合法的同队两人组合';
  }
  for (let i = 0; i < compositions.length; i++) {
    const members = compositions[i] && Array.isArray(compositions[i].members)
      ? compositions[i].members
      : [];
    if (members.length !== 2) {
      return '无法形成合法的同队两人组合';
    }
    if (!isSameTeamMembers(members, teamMap)) {
      return '成绩组合不能跨分队';
    }
  }
  return '';
}

/**
 * G4：先按分队生成 2 人 pair，再验每组合内部同队
 */
function validateG4GroupStructurePlayers(players, teamMap) {
  const filled = listFilledPickPlayers(players);
  if (!filled.length) return '';

  const teamErr = ensurePlayersHaveTeam(filled, teamMap);
  if (teamErr) return teamErr;

  const n = filled.length;
  if (n !== 2 && n !== 4) {
    return '四人两球每组须为 2 人或 4 人';
  }

  const compositions = generatePairCompositionsByTeam(filled, teamMap);
  return validateGeneratedPairCompositions(compositions, teamMap, n / 2);
}

/**
 * G2/G3 2+2：按分队数量与各队人数判断能否拆成两个组合（每组合最多 2 人）
 * - 1 分队：永远合法
 * - 2 分队：各队人数均 ≤2（允许 2+2 / 2+1 / 1+1；禁止 3+1）
 * - 3+ 分队：非法
 */
function validateG2G3TwoPlusTwoPlayers(filled, teamMap) {
  if (!filled.length) return '';
  if (filled.length > 4) {
    return '2+2模式下每组最多 4 人';
  }

  const buckets = {};
  filled.forEach((p) => {
    const teamId = teamMap && teamMap[p.userId] != null ? String(teamMap[p.userId]).trim() : '';
    if (!buckets[teamId]) buckets[teamId] = [];
    buckets[teamId].push(p.userId);
  });
  const teamIds = Object.keys(buckets);
  const teamCount = teamIds.length;

  if (teamCount === 1) {
    return '';
  }
  if (teamCount === 2) {
    for (let i = 0; i < teamIds.length; i++) {
      if (buckets[teamIds[i]].length > 2) {
        return '2+2模式下每个组合最多 2 人，无法按分队拆成合法组合';
      }
    }
    return '';
  }
  return '2+2模式同组最多来自两个分队';
}

/**
 * G2/G3：先按模式生成组合，再验每组合内部同队
 */
function validateStrokeCompositionPlayers(players, compositionMode, teamMap) {
  const mode = compositionMode === '2+2' ? '2+2' : '4+0';
  const filled = listFilledPickPlayers(players);
  if (!filled.length) return '';

  const teamErr = ensurePlayersHaveTeam(filled, teamMap);
  if (teamErr) return teamErr;

  if (mode === '4+0') {
    // 一个组合最多 4 人；允许 1–4；整组即一个组合，不可跨分队
    if (filled.length > 4) {
      return '4+0模式下每组最多 4 人';
    }
    const ids = filled.map((p) => p.userId);
    if (!isSameTeamMembers(ids, teamMap)) {
      return '4+0组合不能跨分队';
    }
    return '';
  }

  return validateG2G3TwoPlusTwoPlayers(filled, teamMap);
}

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
    this._match = payload.match || null;
    this._gameMode = String(
      payload.gameMode
      || (payload.match && (payload.match.gameMode || payload.match.selectedGameMode))
      || ''
    );
    this._strokeCompositionMode =
      payload.strokeCompositionMode === '2+2' ? '2+2' : '4+0';
    this._showCompositionMode = !!payload.showCompositionMode;
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
    const modeFromPayload = payload && payload.strokeCompositionMode;
    const modeFromMatch = match && match.strokeCompositionMode;
    const strokeCompositionMode =
      modeFromPayload === '2+2' || (!modeFromPayload && modeFromMatch === '2+2')
        ? '2+2'
        : '4+0';
    return {
      match: match,
      gameMode: payload && payload.gameMode != null
        ? String(payload.gameMode)
        : (match && (match.gameMode || match.selectedGameMode)) || '',
      strokeCompositionMode: strokeCompositionMode,
      showCompositionMode: !!(payload && payload.showCompositionMode),
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
   * 4+0：当前组已有球员时锁定其 teamGroupId；空组不锁定
   */
  _resolveLockedTeamIdFor40(slots, teamMap) {
    if (!teamMap) return '';
    const selected = (slots || [])
      .map((s) => String((s && s.userId) || '').trim())
      .filter(Boolean);
    if (!selected.length) return '';
    for (let i = 0; i < selected.length; i++) {
      const tid = teamMap[selected[i]] != null ? String(teamMap[selected[i]]).trim() : '';
      if (tid) return tid;
    }
    return '';
  },

  /** G6/G7/G8：当前组合内各报名分队已选人数 */
  _countSelectedByTeam(slots, teamMap) {
    const counts = {};
    if (!teamMap) return counts;
    (slots || []).forEach((slot) => {
      const uid = String((slot && slot.userId) || '').trim();
      if (!uid) return;
      const tid = teamMap[uid] != null ? String(teamMap[uid]).trim() : '';
      if (!tid) return;
      counts[tid] = (counts[tid] || 0) + 1;
    });
    return counts;
  },

  _isMatchPlayTeamCap2Mode() {
    const mode = String(this._gameMode || '');
    return isG6G7MatchPlayMode(mode) || isG8MatchPlayMode(mode);
  },

  /** G5 个人比洞：每分队最多 1 人（勿与 G6-G8 cap2 混用） */
  _isG5MatchPlayTeamCap1Mode() {
    return isG5MatchPlayMode(String(this._gameMode || ''));
  },

  /**
   * 弹窗列表状态：
   * checked  = 是否在当前 slots（临时选中）
   * disabled = 其它出发组占用 / 满员未选 / 4+0 跨分队 / G6-G8 单分队已满2人 / G5 单分队已满1人
   */
  _buildDisplayUsers(registerInfo, registerSubTabId, slots, editingGroupId, editingGroupIndex) {
    const users = registerInfo && Array.isArray(registerInfo.users) ? registerInfo.users : [];
    const editId = editingGroupId != null ? editingGroupId : this.data.groupId;
    const editIdx = editingGroupIndex != null ? editingGroupIndex : this.data.editingGroupIndex;
    const selectedMap = this._buildSelectedMap(slots || []);
    const occupiedMap = this._buildOccupiedMap(editId, editIdx);
    const selectedCount = Object.keys(selectedMap).length;
    const applyG5Cap1 = this._isG5MatchPlayTeamCap1Mode();
    const groupFull = applyG5Cap1 ? selectedCount >= 2 : selectedCount >= 4;

    const apply40TeamLock =
      !!this._showCompositionMode && this._strokeCompositionMode === '4+0';
    const applyMatchPlayTeamCap2 = this._isMatchPlayTeamCap2Mode();
    const needTeamMap = apply40TeamLock || applyMatchPlayTeamCap2 || applyG5Cap1;
    const teamMap = needTeamMap
      ? buildRegisterTeamMap({ registerInfo: registerInfo || { users: [] } })
      : null;
    const lockedTeamId = apply40TeamLock
      ? this._resolveLockedTeamIdFor40(slots, teamMap)
      : '';
    const teamSelectedCounts =
      applyMatchPlayTeamCap2 || applyG5Cap1
        ? this._countSelectedByTeam(slots, teamMap)
        : {};

    return users
      .map(normalizeUser)
      .filter((u) => String(u.groupId) === String(registerSubTabId || ''))
      .map((u) => {
        const uid = String(u.userId || '');
        const checked = !!selectedMap[uid];
        const occupiedGroupName = occupiedMap[uid] || '';
        const isOccupied = !!occupiedGroupName;
        let isDisabled = false;
        if (isOccupied) {
          isDisabled = true;
        } else if (!checked && groupFull) {
          isDisabled = true;
        } else if (!checked && lockedTeamId) {
          const candTeam =
            teamMap && teamMap[uid] != null ? String(teamMap[uid]).trim() : '';
          if (candTeam !== lockedTeamId) {
            isDisabled = true;
          }
        } else if (!checked && applyG5Cap1) {
          // G5：某分队已选 1 人后，同队其余不可再选；满 2 人由 groupFull 禁用全部
          const candTeam =
            teamMap && teamMap[uid] != null ? String(teamMap[uid]).trim() : '';
          if (candTeam && (teamSelectedCounts[candTeam] || 0) >= 1) {
            isDisabled = true;
          }
        } else if (!checked && applyMatchPlayTeamCap2) {
          // G6/G7/G8：某分队已选满 2 人后，同队其余球员不可再选（已选中的仍可取消）
          const candTeam =
            teamMap && teamMap[uid] != null ? String(teamMap[uid]).trim() : '';
          if (candTeam && (teamSelectedCounts[candTeam] || 0) >= 2) {
            isDisabled = true;
          }
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

  /**
   * 确定前校验；失败 toast 并 return false（不 navigateBack、不改用户选择）
   */
  _validateBeforeCommit() {
    const payload = this._buildConfirmPayload();
    const teamMap = buildRegisterTeamMap({
      registerInfo: this._registerInfo || { users: [] }
    });
    const gameMode = String(this._gameMode || '');

    // G5：跨分队恰好 1v1
    if (isG5MatchPlayMode(gameMode)) {
      const err = validateG5MatchPlayPlayers(payload.players, teamMap);
      if (err) {
        wx.showToast({ title: err, icon: 'none' });
        return false;
      }
      return true;
    }

    // G6/G7：双方分队各 1–2 人（不改变 G2/G3 原规则）
    if (isG6G7MatchPlayMode(gameMode)) {
      const err = validateG6G7MatchPlayPlayers(payload.players, teamMap);
      if (err) {
        wx.showToast({ title: err, icon: 'none' });
        return false;
      }
      return true;
    }

    // G8：仅红2+蓝2；G4 比杆保持原 2/4 人规则
    if (isG8MatchPlayMode(gameMode)) {
      const err = validateG8MatchPlayPlayers(payload.players, teamMap);
      if (err) {
        wx.showToast({ title: err, icon: 'none' });
        return false;
      }
      return true;
    }

    if (isG4FamilyMode(gameMode) || gameMode === '四人两球比杆赛') {
      const err = validateG4GroupStructurePlayers(payload.players, teamMap);
      if (err) {
        wx.showToast({ title: err, icon: 'none' });
        return false;
      }
      return true;
    }

    // G2/G3：先生成组合结构，再验每个成绩组合内部是否同队
    if (this._showCompositionMode) {
      const err = validateStrokeCompositionPlayers(
        payload.players,
        this._strokeCompositionMode,
        teamMap
      );
      if (err) {
        wx.showToast({ title: err, icon: 'none' });
        return false;
      }
    }
    return true;
  },

  _commitAndBack() {
    if (!this._validateBeforeCommit()) return;
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
   * 不信任 data-user 上的旧 isOccupied/isDisabled，按实时 occupiedMap / 4+0 / G6-G8 分队上限判断。
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

    // 取消勾选：清空该位置（含删光后恢复全部分队可选）
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

    // 4+0：已有球员时禁止跨分队入座
    if (this._showCompositionMode && this._strokeCompositionMode === '4+0') {
      const teamMap = buildRegisterTeamMap({
        registerInfo: this._registerInfo || { users: [] }
      });
      const lockedTeamId = this._resolveLockedTeamIdFor40(slots, teamMap);
      if (lockedTeamId) {
        const candTeam =
          teamMap[pickedUserId] != null ? String(teamMap[pickedUserId]).trim() : '';
        if (candTeam !== lockedTeamId) return;
      }
    }

    // G5：单分队已选 1 人则禁止继续选同队；全组最多 2 人
    if (this._isG5MatchPlayTeamCap1Mode()) {
      const teamMap = buildRegisterTeamMap({
        registerInfo: this._registerInfo || { users: [] }
      });
      const candTeam =
        teamMap[pickedUserId] != null ? String(teamMap[pickedUserId]).trim() : '';
      const teamCounts = this._countSelectedByTeam(slots, teamMap);
      if (candTeam && (teamCounts[candTeam] || 0) >= 1) {
        return;
      }
      if (this._countFilledSlots(slots) >= 2) {
        wx.showToast({ title: '个人比洞赛每组必须有且只有两名球员', icon: 'none' });
        return;
      }
    }

    // G6/G7/G8：单分队已选满 2 人则禁止继续选同队
    if (this._isMatchPlayTeamCap2Mode()) {
      const teamMap = buildRegisterTeamMap({
        registerInfo: this._registerInfo || { users: [] }
      });
      const candTeam =
        teamMap[pickedUserId] != null ? String(teamMap[pickedUserId]).trim() : '';
      const teamCounts = this._countSelectedByTeam(slots, teamMap);
      if (candTeam && (teamCounts[candTeam] || 0) >= 2) {
        return;
      }
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
