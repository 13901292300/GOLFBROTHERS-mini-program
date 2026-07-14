/**
 * 好友选择页
 * - 普通模式（创建/记分）：多选回填 slot，emit friendsSelected { friends }
 * - proxy_register（替他人报名·好友）：按报名状态回显，emit { addedPlayers, removedPlayers }
 * - proxy_register_team（替他人报名·球队成员）：数据源 teamDirectory.getTeamMembers，三态同好友
 * - select_temp_admin（本场临时管理员）：多选，已存在管理员禁用，emit { mode, friends }
 */
const { createHeaderStyle } = require('../../../utils/headerEngine.js');
const { FRIEND_LIST } = require('../../../utils/playerDirectory.js');
const mockAvatars = require('../../../utils/mockAvatars.js');
const gameStore = require('../../../utils/gameStore.js');
const teamMatchStore = require('../../../utils/teamMatchStore.js');
const teamDirectory = require('../../../utils/teamDirectory.js');
const contactStore = require('../../../utils/contactStore.js');

const MAX_GROUP_SIZE = 4;
const PROXY_MODE = 'proxy_register';
const PROXY_TEAM_MODE = 'proxy_register_team';
const TEMP_ADMIN_MODE = 'select_temp_admin';

function isProxyRegisterModeValue(mode) {
  return mode === PROXY_MODE || mode === PROXY_TEAM_MODE;
}

function isTempAdminModeValue(mode) {
  return mode === TEMP_ADMIN_MODE;
}

function buildCurrentUser() {
  const u = gameStore.getCurrentUser() || {};
  return {
    playerId: u.userId || 'me',
    name: u.name || '我',
    phone: u.phone || '',
    avatar: mockAvatars.resolveAvatar(u.avatar, u.userId || 'me')
  };
}

function mapFriendRow(f) {
  return Object.assign({}, f, {
    userId: f.userId || f.playerId,
    playerId: f.playerId || f.userId,
    nickname: f.nickname || f.name || '',
    remarkName: f.remarkName || f.remark || '',
    userType: f.userType || '',
    identitySource: f.identitySource || '',
    avatar: mockAvatars.resolveAvatar(f.avatar, f.playerId || f.userId)
  });
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '').trim();
}

function resolveContactDisplayName(contact, fallback) {
  const source = contact || {};
  const fb = fallback || {};
  return String(
    source.remarkName ||
      fb.nickname ||
      fb.displayName ||
      fb.name ||
      fb.competitionName ||
      source.targetUserId ||
      ''
  ).trim();
}

function contactToFriendRow(contact, fallback) {
  const source = contact || {};
  const fb = fallback || {};
  const playerId = String(source.targetUserId || fb.playerId || fb.userId || '').trim();
  if (!playerId) return null;
  const phone = normalizePhone(source.phone || fb.phone);
  const name = resolveContactDisplayName(source, fb);
  return mapFriendRow({
    userId: playerId,
    playerId: playerId,
    name: name || playerId,
    displayName: name || playerId,
    nickname: fb.nickname || fb.name || '',
    remark: source.remarkName || fb.remark || '',
    remarkName: source.remarkName || fb.remarkName || '',
    phone: phone,
    avatar: fb.avatar || '',
    pinyin: fb.pinyin || name || playerId,
    userType: fb.userType || '',
    identitySource: fb.identitySource || '',
    source: source.source || 'contact'
  });
}

function mergeContactFriends(ownerUserId, fallbackList) {
  const fallback = Array.isArray(fallbackList) ? fallbackList : [];
  const fallbackById = {};
  const fallbackByPhone = {};
  fallback.forEach((item) => {
    const row = mapFriendRow(item || {});
    const id = String(row.playerId || row.userId || '').trim();
    const phone = normalizePhone(row.phone);
    if (id && !fallbackById[id]) fallbackById[id] = row;
    if (phone && !fallbackByPhone[phone]) fallbackByPhone[phone] = row;
  });

  const merged = [];
  const seenIds = {};
  const seenPhones = {};
  const contacts = contactStore.getContacts(ownerUserId);
  contacts.forEach((contact) => {
    const id = String(contact && contact.targetUserId || '').trim();
    const phone = normalizePhone(contact && contact.phone);
    const fallbackRow = (id && fallbackById[id]) || (phone && fallbackByPhone[phone]) || null;
    const row = contactToFriendRow(contact, fallbackRow);
    if (!row) return;
    const rowId = String(row.playerId || row.userId || '').trim();
    const rowPhone = normalizePhone(row.phone);
    merged.push(row);
    if (rowId) seenIds[rowId] = true;
    if (rowPhone) seenPhones[rowPhone] = true;
  });

  fallback.forEach((item) => {
    const row = mapFriendRow(item || {});
    const id = String(row.playerId || row.userId || '').trim();
    const phone = normalizePhone(row.phone);
    if ((id && seenIds[id]) || (phone && seenPhones[phone])) return;
    merged.push(row);
    if (id) seenIds[id] = true;
    if (phone) seenPhones[phone] = true;
  });

  console.log('[contact-friends-source]', {
    source: contacts.length ? 'contactStore' : 'mock',
    contactCount: contacts.length,
    mockCount: fallback.length,
    count: merged.length
  });
  return merged;
}

function parseIdList(raw) {
  return raw ? decodeURIComponent(raw).split(',').filter(Boolean) : [];
}

function filterFriends(list, keyword) {
  const q = (keyword || '').trim();
  if (!q) return list;
  const lower = q.toLowerCase();
  return list.filter((f) => {
    const fields = [f.name, f.pinyin, f.phone, f.remark, f.displayName];
    return fields.some((v) => v && String(v).toLowerCase().includes(lower));
  });
}

function buildSections(list) {
  const sorted = list.slice().sort((a, b) => (a.pinyin || a.name).localeCompare(b.pinyin || b.name));
  const map = {};
  sorted.forEach((f) => {
    const letter = ((f.pinyin || f.name)[0] || '#').toUpperCase();
    if (!map[letter]) map[letter] = [];
    map[letter].push(f);
  });
  return Object.keys(map)
    .sort()
    .map((letter) => ({ letter, items: map[letter] }));
}

/** 代报名：按 registration 判定好友状态 */
function resolveProxyRegistrationState(friendId, registrationMap, operatorId) {
  const reg = registrationMap[friendId];
  if (!reg) return 'unregistered';
  const source = String(reg.source || 'self');
  const registeredBy = String(reg.registeredBy || '');
  if (source === 'proxy' && registeredBy && registeredBy === String(operatorId || '')) {
    return 'registered_by_me';
  }
  return 'registered_locked';
}

function attachProxyStateToFriends(list, registrationMap, operatorId) {
  return (list || []).map((f) => {
    const id = String(f.playerId || f.userId || '');
    const registrationState = resolveProxyRegistrationState(id, registrationMap, operatorId);
    return Object.assign({}, f, {
      userId: id,
      registrationState: registrationState,
      registrationHint:
        registrationState === 'registered_locked'
          ? '已报名'
          : registrationState === 'registered_by_me'
            ? '我代报名'
            : ''
    });
  });
}

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    matchId: '',
    slotId: '',
    keyword: '',
    currentUser: null,
    sections: [],
    searchEmpty: false,
    selectedMap: {},
    currentGroupPlayerIds: [],
    preselectedMap: {},
    occupiedMap: {},
    disabledMap: {},
    maxAdd: 4,
    selectedCount: 0,
    defaultAvatar: mockAvatars.DEFAULT_AVATAR,
    // proxy_register / proxy_register_team / select_temp_admin
    mode: '',
    isProxyRegisterMode: false,
    isProxyTeamMode: false,
    isTempAdminSelectMode: false,
    registrationStateMap: {},
    operatorUserId: '',
    teamId: ''
  },

  onLoad(options) {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());

    const opt = options || {};
    const mode = opt.mode ? decodeURIComponent(String(opt.mode)) : '';

    if (isProxyRegisterModeValue(mode)) {
      this._initProxyRegisterMode(opt, mode);
      return;
    }
    if (isTempAdminModeValue(mode)) {
      this._initTempAdminSelectMode(opt);
      return;
    }
    this._initNormalMode(opt);
  },

  /**
   * 本场临时管理员多选：
   * - 已是管理员的好友禁用（不可重复添加）
   * - 无每组 4 人上限
   * - emit friendsSelected { mode, friends }
   */
  _initTempAdminSelectMode(opt) {
    const currentUser = buildCurrentUser();
    const existingIds = parseIdList(opt.existing || opt.used || opt.preselected);
    const disabledMap = {};
    existingIds.forEach((id) => {
      disabledMap[id] = true;
    });

    this._allFriends = mergeContactFriends(currentUser.playerId, FRIEND_LIST || []);
    this._mode = TEMP_ADMIN_MODE;
    this._currentGroupPlayerIds = [];

    this.setData({
      mode: TEMP_ADMIN_MODE,
      isProxyRegisterMode: false,
      isProxyTeamMode: false,
      isTempAdminSelectMode: true,
      matchId: opt.matchId || '',
      slotId: opt.slotId || '',
      keyword: '',
      currentUser: currentUser,
      sections: buildSections(this._allFriends),
      searchEmpty: false,
      currentGroupPlayerIds: [],
      preselectedMap: {},
      occupiedMap: {},
      selectedMap: {},
      disabledMap: disabledMap,
      maxAdd: 99,
      selectedCount: 0,
      registrationStateMap: {},
      operatorUserId: currentUser.playerId || ''
    });
  },

  _initNormalMode(opt) {
    const groupPlayerIds = parseIdList(opt.groupPlayers || opt.preselected);
    const usedIds = parseIdList(opt.used);
    const emptyCount = opt.emptyCount != null ? Number(opt.emptyCount) : 4;
    const currentUser = buildCurrentUser();

    const preselectedMap = {};
    const selectedMap = {};
    groupPlayerIds.forEach((id) => {
      preselectedMap[id] = true;
      selectedMap[id] = true;
    });

    const disabledMap = {};
    const occupiedMap = {};
    usedIds.forEach((id) => {
      if (!preselectedMap[id]) {
        disabledMap[id] = true;
        occupiedMap[id] = true;
      }
    });

    this._allFriends = mergeContactFriends(currentUser.playerId, FRIEND_LIST || []);
    this._currentGroupPlayerIds = groupPlayerIds.slice();
    this._mode = '';

    this.setData({
      mode: '',
      isProxyRegisterMode: false,
      isTempAdminSelectMode: false,
      matchId: opt.matchId || '',
      slotId: opt.slotId || '',
      keyword: '',
      currentUser,
      sections: buildSections(this._allFriends),
      searchEmpty: false,
      currentGroupPlayerIds: groupPlayerIds,
      preselectedMap,
      occupiedMap,
      selectedMap,
      disabledMap,
      maxAdd: isNaN(emptyCount) ? 4 : emptyCount,
      selectedCount: groupPlayerIds.length,
      registrationStateMap: {},
      operatorUserId: ''
    });
  },

  /** 代报名列表数据源：好友 FRIEND_LIST / 球队成员 getTeamMembers */
  _resolveProxyCandidateList(mode, teamId, matchId) {
    if (mode === PROXY_TEAM_MODE) {
      let resolvedTeamId = String(teamId || '').trim();
      if (!resolvedTeamId && matchId) {
        try {
          const match = teamMatchStore.getMatchById(matchId);
          resolvedTeamId = match && match.teamId ? String(match.teamId).trim() : '';
        } catch (e) {
          resolvedTeamId = '';
        }
      }
      return (teamDirectory.getTeamMembers(resolvedTeamId) || []).map(mapFriendRow);
    }
    return mergeContactFriends((buildCurrentUser() || {}).playerId, FRIEND_LIST || []);
  },

  /**
   * proxy_register / proxy_register_team：
   * - 权威数据源：teamMatchStore.match.registerInfo.users（URL matchId）
   * - 列表：好友 FRIEND_LIST 或球队成员 getTeamMembers
   * - EventChannel 仅补充；禁止空名单兜底锁死
   */
  _initProxyRegisterMode(opt, modeFromUrl) {
    const currentUser = buildCurrentUser();
    const mode = isProxyRegisterModeValue(modeFromUrl) ? modeFromUrl : PROXY_MODE;
    const matchId = opt.matchId ? decodeURIComponent(String(opt.matchId)) : '';
    const teamId = opt.teamId ? decodeURIComponent(String(opt.teamId)) : '';
    const operatorFromUrl = opt.operatorUserId ? decodeURIComponent(String(opt.operatorUserId)) : '';
    const operatorFallback = operatorFromUrl || currentUser.playerId || '';

    this._mode = mode;
    this._proxyOpt = opt;
    this._proxyCurrentUser = currentUser;
    this._proxyOperatorFromUrl = operatorFromUrl;
    this._proxyTeamId = teamId;
    this._allFriends = this._resolveProxyCandidateList(mode, teamId, matchId);
    this._registrationMap = {};
    this._initialSelectedMap = {};
    this._initialStateMap = {};
    this._proxyContextApplied = false;
    this._proxyContextFromStore = false;

    this.setData({
      mode: mode,
      isProxyRegisterMode: true,
      isProxyTeamMode: mode === PROXY_TEAM_MODE,
      matchId: matchId,
      teamId: teamId,
      slotId: opt.slotId || '',
      keyword: '',
      currentUser: currentUser,
      sections: buildSections(this._allFriends),
      searchEmpty: false,
      currentGroupPlayerIds: [],
      preselectedMap: {},
      occupiedMap: {},
      selectedMap: {},
      disabledMap: {},
      maxAdd: 99,
      selectedCount: 0,
      registrationStateMap: {},
      operatorUserId: operatorFallback
    });

    if (matchId) {
      this._initProxyRegisterContextFromStore(matchId, operatorFallback);
    }

    try {
      const ch = this.getOpenerEventChannel && this.getOpenerEventChannel();
      if (ch && ch.on) {
        ch.on('proxyRegisterContext', (payload) => {
          this._onProxyRegisterContextFromChannel(payload || {});
        });
      }
    } catch (e) {
      /* ignore */
    }
  },

  /**
   * 从 teamMatchStore 读取报名名单并应用三态回显（权威数据源）
   * @returns {boolean} 是否成功应用
   */
  _initProxyRegisterContextFromStore(matchId, operatorUserId) {
    const id = String(matchId || '').trim();
    if (!id) return false;
    let match = null;
    try {
      match = teamMatchStore.getMatchById(id);
    } catch (e) {
      match = null;
    }
    if (!match) return false;

    const normalized = teamMatchStore.normalizeRegisterInfo(match.registerInfo);
    const registerUsers = (normalized && Array.isArray(normalized.users) ? normalized.users : []).slice();
    const operatorId = String(
      operatorUserId || this._proxyOperatorFromUrl || (this._proxyCurrentUser && this._proxyCurrentUser.playerId) || ''
    );

    this._applyProxyRegisterContext({
      registerUsers: registerUsers,
      operatorUserId: operatorId,
      matchId: id,
      source: 'store'
    });
    this._proxyContextFromStore = true;
    this._proxyContextApplied = true;
    return true;
  },

  /**
   * EventChannel 补充策略：
   * - store 已成功 → 忽略（含空 payload）
   * - 尚未应用真实上下文 → 应用 payload（允许空名单，仅当无 store）
   * - 已应用但来源非 store：空 payload 不可覆盖；非空 payload 可刷新
   */
  _onProxyRegisterContextFromChannel(payload) {
    const context = payload || {};
    const users = Array.isArray(context.registerUsers) ? context.registerUsers : [];
    const hasUsers = users.length > 0;

    // store 权威：忽略后续 EventChannel（含空名单）
    if (this._proxyContextFromStore) return;

    if (this._proxyContextApplied) {
      // 禁止空 payload 覆盖已有报名表；非空 payload 可刷新
      if (!hasUsers) return;
    }

    const operatorId = String(
      context.operatorUserId ||
        this._proxyOperatorFromUrl ||
        (this._proxyCurrentUser && this._proxyCurrentUser.playerId) ||
        ''
    );
    this._applyProxyRegisterContext({
      registerUsers: users,
      operatorUserId: operatorId,
      matchId: context.matchId || this.data.matchId || '',
      source: 'event_channel'
    });
    this._proxyContextApplied = true;
  },

  /**
   * 应用 proxy 报名上下文：构建 registrationMap + 三态回显
   * registration key: userId || playerId
   * friend/member key: playerId || userId
   */
  _applyProxyRegisterContext(ctx) {
    const context = ctx || {};
    const opt = this._proxyOpt || {};
    const currentUser = this._proxyCurrentUser || buildCurrentUser();
    const operatorId = String(context.operatorUserId || '');
    const users = Array.isArray(context.registerUsers) ? context.registerUsers : [];
    const mode = isProxyRegisterModeValue(this._mode) ? this._mode : PROXY_MODE;
    const matchId = context.matchId || opt.matchId || this.data.matchId || '';
    const teamId =
      (context.teamId != null ? String(context.teamId) : '') ||
      this._proxyTeamId ||
      this.data.teamId ||
      '';

    const registrationMap = {};
    users.forEach((u) => {
      const id = u && (u.userId || u.playerId) != null ? String(u.userId || u.playerId) : '';
      if (!id) return;
      registrationMap[id] = u;
    });

    const selectedMap = {};
    const disabledMap = {};
    const registrationStateMap = {};
    const initialSelectedMap = {};

    // 列表保持当前 mode 数据源（好友 / 球队成员），不要回退成 FRIEND_LIST
    const baseList =
      this._allFriends && this._allFriends.length
        ? this._allFriends.map((f) => Object.assign({}, f))
        : this._resolveProxyCandidateList(mode, teamId, matchId);

    this._allFriends = attachProxyStateToFriends(baseList, registrationMap, operatorId);

    this._allFriends.forEach((f) => {
      const id = String(f.playerId || f.userId || '');
      const state = f.registrationState || 'unregistered';
      registrationStateMap[id] = state;
      if (state === 'registered_by_me' || state === 'registered_locked') {
        selectedMap[id] = true;
        initialSelectedMap[id] = true;
      }
      if (state === 'registered_locked') {
        disabledMap[id] = true;
      }
    });

    this._registrationMap = registrationMap;
    this._initialSelectedMap = Object.assign({}, initialSelectedMap);
    this._initialStateMap = Object.assign({}, registrationStateMap);
    this._operatorUserId = operatorId;
    if (teamId) this._proxyTeamId = teamId;

    this.setData({
      mode: mode,
      isProxyRegisterMode: true,
      isProxyTeamMode: mode === PROXY_TEAM_MODE,
      matchId: matchId,
      teamId: teamId || this.data.teamId || '',
      slotId: opt.slotId || this.data.slotId || '',
      keyword: this.data.keyword || '',
      currentUser: currentUser,
      sections: buildSections(this._allFriends),
      searchEmpty: false,
      currentGroupPlayerIds: [],
      preselectedMap: {},
      occupiedMap: {},
      selectedMap: selectedMap,
      disabledMap: disabledMap,
      maxAdd: 99,
      selectedCount: Object.keys(selectedMap).length,
      registrationStateMap: registrationStateMap,
      operatorUserId: operatorId
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
    this.setData({ headerRootStyle: header.headerRootStyle, headerBarStyle: header.headerBarStyle });
  },

  _applyFriendFilter(keyword) {
    let filtered = filterFriends(this._allFriends || [], keyword).map(mapFriendRow);
    if (isProxyRegisterModeValue(this._mode)) {
      filtered = attachProxyStateToFriends(
        filtered,
        this._registrationMap || {},
        this._operatorUserId || this.data.operatorUserId
      );
    }
    const trimmed = (keyword || '').trim();
    this.setData({
      keyword: keyword || '',
      sections: buildSections(filtered),
      searchEmpty: !!trimmed && filtered.length === 0
    });
  },

  onSearchInput(e) {
    this._applyFriendFilter(e.detail.value || '');
  },

  clearSearch() {
    this._applyFriendFilter('');
  },

  toggleFriend(e) {
    this._togglePlayer(e.currentTarget.dataset.id);
  },

  toggleMe() {
    if (this.data.isProxyRegisterMode) return; // 代报名不操作「我」
    const cu = this.data.currentUser;
    if (!cu || !cu.playerId) return;
    this._togglePlayer(cu.playerId);
  },

  _togglePlayer(id) {
    if (!id) return;
    if (this.data.disabledMap[id]) {
      if (this.data.isProxyRegisterMode) {
        wx.showToast({ title: '该选手已报名，不可取消', icon: 'none' });
      } else if (this.data.isTempAdminSelectMode || this._mode === TEMP_ADMIN_MODE) {
        wx.showToast({ title: '该用户已是本场临时管理员', icon: 'none' });
      }
      return;
    }

    const selectedMap = Object.assign({}, this.data.selectedMap);
    const isOn = !!selectedMap[id];
    const unlimited =
      this.data.isProxyRegisterMode ||
      this.data.isTempAdminSelectMode ||
      this._mode === TEMP_ADMIN_MODE;
    if (isOn) {
      delete selectedMap[id];
    } else if (!unlimited && Object.keys(selectedMap).length >= MAX_GROUP_SIZE) {
      wx.showToast({ title: '每组最多 ' + MAX_GROUP_SIZE + ' 人', icon: 'none' });
      return;
    } else {
      selectedMap[id] = true;
    }
    this.setData({ selectedMap, selectedCount: Object.keys(selectedMap).length });
  },

  onBack() {
    if (getCurrentPages().length > 1) wx.navigateBack({ delta: 1 });
    else wx.redirectTo({ url: '/pages/home/index' });
  },

  _findFriendById(id) {
    const pid = String(id || '');
    if (!pid) return null;
    const cu = this.data.currentUser;
    if (cu && String(cu.playerId) === pid) {
      return {
        playerId: cu.playerId,
        userId: cu.playerId,
        name: cu.name,
        avatar: cu.avatar || '',
        phone: cu.phone || ''
      };
    }
    const hit = (this._allFriends || FRIEND_LIST || []).find(
      (f) => String(f.playerId || f.userId) === pid
    );
    if (!hit) return null;
    return Object.assign({}, hit, {
      userId: hit.userId || hit.playerId,
      playerId: hit.playerId || hit.userId
    });
  },

  /** proxy_register / proxy_register_team：对比初始勾选与当前勾选，产出 added / removed */
  _buildProxyDiffPayload() {
    const initial = this._initialSelectedMap || {};
    const initialState = this._initialStateMap || {};
    const current = this.data.selectedMap || {};
    const addedPlayers = [];
    const removedPlayers = [];
    const pickChannel = this._mode === PROXY_TEAM_MODE ? 'team_members' : 'friends';

    Object.keys(current).forEach((id) => {
      if (initialState[id] === 'registered_locked') return;
      if (!initial[id] && current[id]) {
        const friend = this._findFriendById(id);
        if (friend) {
          addedPlayers.push(
            Object.assign({}, friend, {
              pickChannel: pickChannel,
              userId: friend.userId || friend.playerId,
              playerId: friend.playerId || friend.userId
            })
          );
        }
      }
    });

    Object.keys(initial).forEach((id) => {
      if (initialState[id] !== 'registered_by_me') return;
      if (initial[id] && !current[id]) {
        const friend = this._findFriendById(id);
        if (friend) removedPlayers.push(friend);
      }
    });

    return { addedPlayers, removedPlayers };
  },

  confirm() {
    const ch = this.getOpenerEventChannel && this.getOpenerEventChannel();

    if (this.data.isProxyRegisterMode || isProxyRegisterModeValue(this._mode)) {
      const diff = this._buildProxyDiffPayload();
      const mode = isProxyRegisterModeValue(this._mode) ? this._mode : PROXY_MODE;
      if (ch && ch.emit) {
        ch.emit('friendsSelected', {
          mode: mode,
          addedPlayers: diff.addedPlayers,
          removedPlayers: diff.removedPlayers
        });
      }
      this.onBack();
      return;
    }

    const selectedMap = this.data.selectedMap;
    const selected = [];
    const cu = this.data.currentUser;
    if (cu && cu.playerId && selectedMap[cu.playerId]) {
      selected.push({
        playerId: cu.playerId,
        userId: cu.playerId,
        name: cu.name,
        avatar: cu.avatar || ''
      });
    }
    (this._allFriends || FRIEND_LIST).forEach((f) => {
      if (selectedMap[f.playerId]) {
        selected.push(
          Object.assign({}, f, {
            userId: f.userId || f.playerId,
            playerId: f.playerId || f.userId
          })
        );
      }
    });

    if (this.data.isTempAdminSelectMode || this._mode === TEMP_ADMIN_MODE) {
      if (ch && ch.emit) {
        ch.emit('friendsSelected', {
          mode: TEMP_ADMIN_MODE,
          friends: selected
        });
      }
      this.onBack();
      return;
    }

    if (ch && ch.emit) ch.emit('friendsSelected', { friends: selected });
    this.onBack();
  },

  onAvatarError(e) {
    const ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
    const fallback = mockAvatars.DEFAULT_AVATAR;
    if (ds.type === 'me' && this.data.currentUser) {
      this.setData({ 'currentUser.avatar': fallback });
      return;
    }
    const id = ds.id;
    if (!id) return;
    const sections = (this.data.sections || []).map((sec) => ({
      letter: sec.letter,
      items: (sec.items || []).map((f) =>
        f.playerId === id ? Object.assign({}, f, { avatar: fallback }) : f
      )
    }));
    this.setData({ sections: sections });
    if (this._allFriends) {
      this._allFriends = this._allFriends.map((f) =>
        f.playerId === id ? Object.assign({}, f, { avatar: fallback }) : f
      );
    }
  }
});
