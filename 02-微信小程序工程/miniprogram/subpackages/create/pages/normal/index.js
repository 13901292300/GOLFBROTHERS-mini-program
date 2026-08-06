const { createHeaderStyle } = require('../../../../utils/headerEngine.js');
const { FRIEND_ID_SET } = require('../../../../utils/playerDirectory.js');
const gameStore = require('../../../../utils/gameStore.js');
const matchStateUtil = require('../../../../utils/matchState.js');
const gameEdit = require('../../utils/gameEdit.js');
const halfCourseEdit = require('../../../../utils/halfCourseEdit.js');

const WEEK_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const MINUTE_VALUES = [0, 10, 20, 30, 40, 50];

const GAME_MODES = [
  { name: '个人比杆赛', desc: '每位球员独立记分，按总杆排名', icon: '🏌' },
  { name: '最好成绩赛', desc: '每洞取队内最好成绩', icon: '★' },
  { name: '最佳球位赛', desc: '选择最佳落点继续击球', icon: '📍' },
  { name: '四人两球赛', desc: '两人一队，每队使用一颗球', icon: '👥' }
];

/** 空位补位：人员来源选择（player-source-sheet 选项） */
const PLAYER_SOURCE_OPTIONS = [
  { key: 'friends', glyph: '👥', label: '好友列表', desc: '从我的好友中选择球员' },
  { key: 'combo', glyph: '★', label: '老牌组合', desc: '常用四人组 / 上次比赛组合' },
  { key: 'manual', glyph: '✎', label: '手工添加', desc: '手动输入姓名加入该位置' }
];

// 需要二次「组合类型」确认的赛制（团队类）
const COMPOSITION_MODES = { '最好成绩赛': true, '最佳球位赛': true };

// 4+0 / 3+0：全组单队 → 统一记分模板「四人最佳球位挑战-18」
const UNIFIED_TEMPLATE = 'fourball_best';

// 拆分组合：用户需在分配界面选中的球员数量（其余自动归入其它队）
const SPLIT_SELECT_COUNT = {
  '3+1': 3,
  '2+2': 2,
  '2+1+1': 2,
  '2+1': 2
};

// 依据当前组人数生成可选组合类型（parts=各队人数；single=是否全员一队不拆分）
function buildCompositionOptions(count) {
  if (count >= 4) {
    return [
      { id: '4+0', label: '4+0', desc: '全员一队 · 不拆分 · 统一计分', parts: [4], single: true, icon: '🏌' },
      { id: '3+1', label: '3+1', desc: '一队 3 人 + 1 人', parts: [3, 1], single: false, icon: '👥' },
      { id: '2+2', label: '2+2', desc: '两队各 2 人', parts: [2, 2], single: false, icon: '👥' },
      { id: '2+1+1', label: '2+1+1', desc: '一队 2 人 + 两个单人', parts: [2, 1, 1], single: false, icon: '👥' }
    ];
  }
  if (count === 3) {
    return [
      { id: '3+0', label: '3+0', desc: '全员一队 · 不拆分 · 统一计分', parts: [3], single: true, icon: '🏌' },
      { id: '2+1', label: '2+1', desc: '一队 2 人 + 1 人', parts: [2, 1], single: false, icon: '👥' }
    ];
  }
  // count === 2：2+0（创建流自动生成，不弹选择）
  if (count === 2) {
    return [
      { id: '2+0', label: '2+0', desc: '全员一队 · 不拆分 · 统一计分', parts: [2], single: true, icon: '🏌' }
    ];
  }
  return [];
}

const mockAvatars = require('../../../../utils/mockAvatars.js');

// 组人数 → 组类型（用于 groups[].type：1=single / 2=pair / 3=triple / 4=quad）
function partType(size) {
  return size >= 4 ? 'quad' : size === 3 ? 'triple' : size === 2 ? 'pair' : 'single';
}

/** fourball_best Seat Model：固定 4 座；按 teams 顺序展开 members，不足补空座 */
const FOURBALL_SEAT_COUNT = 4;

/**
 * 由已生成的 teams 派生 composition.seats（双写，不改 teams.members）。
 * seatIndex 1..4；队内顺序 = members 顺序；空座 teamId/playerId 为 null。
 *
 * 映射：2+2 / 3+1 / 2+1+1 / 2+1 / 4+0 / 3+0 均适用。
 */
function buildFourballSeatsFromTeams(teams) {
  const seats = [];
  (Array.isArray(teams) ? teams : []).forEach((t) => {
    if (!t || seats.length >= FOURBALL_SEAT_COUNT) return;
    const teamId = t.teamId != null && String(t.teamId).trim() ? String(t.teamId).trim() : null;
    const raw = Array.isArray(t.members)
      ? t.members
      : Array.isArray(t.players)
        ? t.players
        : [];
    raw.forEach((m) => {
      if (seats.length >= FOURBALL_SEAT_COUNT) return;
      const playerId =
        m && (m.playerId != null || m.userId != null || m.id != null)
          ? String(m.playerId || m.userId || m.id).trim()
          : '';
      seats.push({
        seatIndex: seats.length + 1,
        teamId: teamId,
        playerId: playerId || null,
        name: (m && m.name) || '',
        avatar: (m && m.avatar) || ''
      });
    });
  });
  while (seats.length < FOURBALL_SEAT_COUNT) {
    seats.push({
      seatIndex: seats.length + 1,
      teamId: null,
      playerId: null,
      name: '',
      avatar: ''
    });
  }
  return seats;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function makeEmptyGroup(seq) {
  return {
    id: 'grp-' + seq,
    players: [1, 2, 3, 4].map((i) => ({ key: 'grp-' + seq + '-p' + i, filled: false, name: '玩家' + i }))
  };
}

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    headerTotalHeight: 92,

    isEditMode: false,
    editGameId: '',
    pageEyebrow: 'CREATE',
    pageTitle: '普通创建',
    submitButtonText: '开始记分',

    roundName: '',
    courseName: '',
    courseId: '',
    courseLocation: '',
    front9Course: null,
    back9Course: null,
    courseHalfText: '',
    teeTimeText: '',
    gameMode: '个人比杆赛',
    gameModes: GAME_MODES,

    // 隐私设置：默认公开；私密时自动生成 6 位数字访问密码
    visibility: 'public',
    accessCode: '',

    groups: [],
    groupCountText: '第1组 1/4人',

    showGameMode: false,
    showTeeTime: false,

    // ===== 二次组合类型（composition selection layer）=====
    // 团队类赛制 + 每组人数 >= 3 → 点击「开始记分」后逐组弹出确认
    showComposition: false,
    compositionOptions: [],
    compositionGroupIndex: 0,       // 当前正在配置的组下标
    compositionGroupTitle: '',    // 如「第1组组合类型」
    compositionPendingSelected: '', // 当前弹窗内高亮项
    groupCompositionMap: {},      // groupId → { groupId, playerCount, compositionType, teamMode?, teams? }
    compositionSummaryText: '',   // 赛制行副标题：各组已选组合摘要

    // ===== 球员分配弹窗（拆分组合 — 旧版队伍桶 + 待分配池 UI）=====
    showGrouping: false,
    groupingGroupIndex: 0,
    groupingTitle: '',
    groupingLabel: '',
    groupingSelectRequired: 0,
    groupingSelectCount: 0,
    groupingHint: '',
    groupingTeams: [],         // [{ teamId, name, sizeLabel, type, size, auto, members:[] }]
    groupingPlayers: [],       // [{ playerId, name, avatar, teamIndex(-1=待分配) }]
    groupingActive: 0,
    groupingPoolCount: 0,
    groupingComplete: false,

    // 空位补位：仅一级 Action Sheet（入口）；好友/组合/手工均跳转独立页面
    showAddPlayer: false,
    playerSourceOptions: PLAYER_SOURCE_OPTIONS,

    // 开球时间滚轮
    teeYear: 2026,
    months: [],
    days: [],
    hours: [],
    minutes: [],
    teeIndex: [0, 0, 0, 0]
  },

  onLoad(options) {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    this._editReturnTo = (options && options.returnTo) || 'hub';

    if (options && options.mode === 'edit' && options.gameId) {
      this._compositionQueue = [];
      this._initEditMode(options.gameId);
      return;
    }

    // 初始组别：第1组首位为发起人，其余空位
    const firstGroup = {
      id: 'grp-1',
      players: [
        { key: 'grp-1-p1', filled: true, playerId: 'me', name: 'TIGERHOODS', avatar: mockAvatars.pickMockAvatar('me') },
        { key: 'grp-1-p2', filled: false, name: '玩家2' },
        { key: 'grp-1-p3', filled: false, name: '玩家3' },
        { key: 'grp-1-p4', filled: false, name: '玩家4' }
      ]
    };
    this._groupSeq = 1;
    this._compositionQueue = [];
    this.setData({ groups: [firstGroup] }, () => this._refreshGroupMeta());

    // 开球时间默认值：2026年05月04日 09:40
    this._tee = { year: 2026, month: 5, day: 4, hour: 9, minute: 40 };
    this._buildWheels();
    this._applyTeeText();
  },

  _initEditMode(gameId) {
    const game = gameStore.getGame(gameId);
    if (!game) {
      wx.showToast({ title: '比赛不存在', icon: 'none' });
      setTimeout(() => this.onBack(), 600);
      return;
    }
    const form = gameEdit.hydrateCreateFormFromGame(game);
    if (!form) {
      wx.showToast({ title: '无法加载比赛', icon: 'none' });
      setTimeout(() => this.onBack(), 600);
      return;
    }
    this._editGameId = gameId;
    this._groupSeq = (form.groups && form.groups.length) || 1;
    const teeParsed = gameEdit.parseTeeTimeText(form.teeTimeText);
    this._tee = teeParsed || { year: 2026, month: 5, day: 4, hour: 9, minute: 40 };
    this._buildWheels();
    const compositionSummaryText = this._buildCompositionSummary(form.groupCompositionMap || {});
    this.setData(
      {
        isEditMode: true,
        editGameId: gameId,
        pageEyebrow: 'EDIT',
        pageTitle: '修改比赛',
        submitButtonText: '确认修改',
        roundName: form.roundName,
        courseId: form.courseId,
        courseName: form.courseName,
        courseLocation: form.courseLocation,
        front9Course: form.front9Course,
        back9Course: form.back9Course,
        courseHalfText: form.courseHalfText,
        teeTimeText: form.teeTimeText,
        gameMode: form.gameMode,
        visibility: form.visibility,
        accessCode: form.accessCode || '',
        groups: form.groups,
        groupCompositionMap: form.groupCompositionMap || {},
        compositionSummaryText: compositionSummaryText
      },
      () => this._refreshGroupMeta()
    );
    if (!form.teeTimeText) this._applyTeeText();
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
      headerBarStyle: header.headerBarStyle,
      headerTotalHeight: header.metrics.headerTotalHeight
    });
  },

  onBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack({ delta: 1 });
    } else {
      wx.redirectTo({ url: '/pages/home/index' });
    }
  },

  noop() {},

  /* ===== 表单字段 ===== */
  onRoundNameInput(e) {
    this.setData({ roundName: e.detail.value });
  },

  onSelectCourse() {
    // 打开独立「选择球场」页面（非弹窗），通过事件通道回填 courseName/courseId/courseLocation
    wx.navigateTo({
      url: '/pages/course/select/index?selectedId=' + (this.data.courseId || ''),
      events: {
        courseSelected: (payload) => {
          if (!payload) return;
          this.setData({
            courseId: payload.courseId || '',
            courseName: payload.courseName || '',
            courseLocation: payload.courseLocation || '',
            front9Course: payload.front9Course || null,
            back9Course: payload.back9Course || null,
            courseHalfText: payload.halfText ? '（' + payload.halfText + '）' : ''
          });
        }
      },
      fail: () => wx.showToast({ title: '页面尚未注册', icon: 'none' })
    });
  },

  // 点击 slot：空位 → 打开添加方式 Action Sheet；已占用 → 统一弹出移除确认
  onPlayerSlotTap(e) {
    const gIdx = Number(e.currentTarget.dataset.group);
    const pIdx = Number(e.currentTarget.dataset.player);
    const group = this.data.groups[gIdx];
    if (!group || !group.players[pIdx]) return;
    const player = group.players[pIdx];
    this._addTarget = { gIdx, pIdx };
    if (player.filled) {
      this._openRemovePlayerConfirm(gIdx, pIdx);
      return;
    }
    this.setData({ showAddPlayer: true });
  },

  _openRemovePlayerConfirm(gIdx, pIdx) {
    wx.showModal({
      title: '移除该球员',
      content: '确认将该球员从本组移除吗？',
      cancelText: '取消',
      confirmText: '确认移除',
      confirmColor: '#dc2626',
      success: (res) => {
        if (res.confirm) this._clearSlot(gIdx, pIdx);
      }
    });
  },

  closeAddPlayer() {
    this.setData({ showAddPlayer: false });
  },

  onPlayerSourceSelect(e) {
    const key = e.detail && e.detail.key;
    if (key === 'friends') this.addFromFriends();
    else if (key === 'combo') this.addFromCombo();
    else if (key === 'manual') this.addManual();
  },

  // 本 Game 已占用 playerId（全局唯一去重）；excludeGIdx 不为 null 时排除该组（用于好友页本组成员→可取消）
  _gameUsedIds(excludeGIdx) {
    const used = [];
    (this.data.groups || []).forEach((g, gi) => {
      if (excludeGIdx != null && gi === excludeGIdx) return;
      (g.players || []).forEach((p) => {
        if (p && p.filled && p.playerId) used.push(p.playerId);
      });
    });
    return used;
  },

  // 【1】好友列表：Bottom Sheet 仅作入口 → 跳转「好友选择页」（多选/取消/确认才回写）
  addFromFriends() {
    this.setData({ showAddPlayer: false });
    const t = this._addTarget;
    if (!t) return;
    const players = (this.data.groups[t.gIdx] && this.data.groups[t.gIdx].players) || [];
    const groupPlayerIds = [];
    let emptyCount = 0;
    players.forEach((p) => {
      if (p.filled && p.playerId) groupPlayerIds.push(p.playerId);
      else if (!p.filled) emptyCount += 1;
    });
    // 其它组已用 → 灰态不可选；本组成员 → 默认选中、可取消
    const usedIds = this._gameUsedIds(t.gIdx);
    wx.navigateTo({
      url:
        '/subpackages/player/pages/friends/index?matchId=&slotId=' +
        (t.pIdx + 1) +
        '&emptyCount=' +
        emptyCount +
        '&groupPlayers=' +
        encodeURIComponent(groupPlayerIds.join(',')) +
        '&used=' +
        encodeURIComponent(usedIds.join(',')),
      events: {
        friendsSelected: (payload) => this._onFriendsSelected(payload && payload.friends)
      },
      fail: (err) => wx.showToast({ title: '跳转失败：' + (err && err.errMsg ? err.errMsg : ''), icon: 'none' })
    });
  },

  // 好友页确认返回：取消选中→移出；新增→从前往后补本组空位（全局去重：跳过其它组已用）
  _onFriendsSelected(friends) {
    if (!Array.isArray(friends)) return;
    const t = this._addTarget;
    if (!t) return;
    const otherUsed = {};
    this._gameUsedIds(t.gIdx).forEach((id) => { otherUsed[id] = true; });
    const groups = this.data.groups.slice();
    const group = Object.assign({}, groups[t.gIdx]);
    const players = group.players.slice();
    const selectedSet = {};
    friends.forEach((f) => { selectedSet[f.playerId] = f; });
    // 取消选中的本组球员 → 移出（保留 key/顺序；含「我」与普通好友）
    players.forEach((p, i) => {
      if (p.filled && p.playerId && !selectedSet[p.playerId]) {
        players[i] = { key: p.key, filled: false, name: '玩家' + (i + 1) };
      }
    });
    const inGroup = {};
    players.forEach((p) => { if (p.filled && p.playerId) inGroup[p.playerId] = true; });
    // 新增 → 从前往后补空位；全局去重：本组已有 / 其它组已用 一律跳过
    friends
      .filter((f) => !inGroup[f.playerId] && !otherUsed[f.playerId])
      .forEach((f) => {
        const idx = players.findIndex((p) => !p.filled);
        if (idx < 0) return;
        players[idx] = { key: players[idx].key, filled: true, playerId: f.playerId, name: f.name, avatar: f.avatar };
        inGroup[f.playerId] = true;
      });
    group.players = players;
    groups[t.gIdx] = group;
    this.setData({ groups }, () => this._refreshGroupMeta());
  },

  // 【2】老牌组合：Bottom Sheet 仅作入口 → 跳转「组合选择页」
  addFromCombo() {
    this.setData({ showAddPlayer: false });
    const t = this._addTarget;
    if (!t) return;
    const usedIds = this._gameUsedIds(null); // 组合：全 Game 已用都不可重复
    wx.navigateTo({
      url:
        '/subpackages/player/pages/combos/index?matchId=&slotId=' +
        (t.pIdx + 1) +
        '&used=' +
        encodeURIComponent(usedIds.join(',')),
      events: {
        comboSelected: (payload) => this._onComboSelected(payload && payload.combo)
      },
      fail: (err) => wx.showToast({ title: '跳转失败：' + (err && err.errMsg ? err.errMsg : ''), icon: 'none' })
    });
  },

  // 组合页确认返回：按 slot 顺序批量补本组空位（不动已占用、不改顺序；全局去重跳过已用）
  _onComboSelected(combo) {
    if (!combo || !Array.isArray(combo.players)) return;
    const t = this._addTarget;
    if (!t) return;
    const used = {};
    this._gameUsedIds(null).forEach((id) => { used[id] = true; });
    const groups = this.data.groups.slice();
    const group = Object.assign({}, groups[t.gIdx]);
    const players = group.players.slice();
    let i = 0;
    combo.players.forEach((src) => {
      if (!src.playerId || used[src.playerId]) return; // 跳过本场已用
      while (i < players.length && players[i].filled) i++;
      if (i >= players.length) return;
      players[i] = { key: players[i].key, filled: true, playerId: src.playerId, name: src.name, avatar: src.avatar };
      used[src.playerId] = true;
      i++;
    });
    group.players = players;
    groups[t.gIdx] = group;
    this.setData({ groups }, () => this._refreshGroupMeta());
  },

  // 【3】手工添加：Bottom Sheet 仅作入口 → 跳转「手工添加页」
  addManual() {
    this.setData({ showAddPlayer: false });
    const t = this._addTarget;
    if (!t) return;
    const usedIds = this._gameUsedIds(null);
    wx.navigateTo({
      url:
        '/subpackages/player/pages/manual/index?matchId=&slotId=' +
        (t.pIdx + 1) +
        '&used=' +
        encodeURIComponent(usedIds.join(',')),
      events: {
        playerPicked: (payload) => this._onPlayerPicked(payload && payload.player)
      },
      fail: (err) => wx.showToast({ title: '跳转失败：' + (err && err.errMsg ? err.errMsg : ''), icon: 'none' })
    });
  },

  // 手工页确认返回：单人填回目标 slot（被占用则退到本组第一个空位；全局去重拦截）
  _onPlayerPicked(player) {
    if (!player) return;
    const t = this._addTarget;
    if (!t) return;
    const used = {};
    this._gameUsedIds(null).forEach((id) => { used[id] = true; });
    if (player.playerId && used[player.playerId]) return; // 已在本场使用：拦截
    const players = (this.data.groups[t.gIdx] && this.data.groups[t.gIdx].players) || [];
    let pIdx = t.pIdx;
    if (players[pIdx] && players[pIdx].filled) pIdx = players.findIndex((p) => !p.filled);
    if (pIdx < 0) {
      wx.showToast({ title: '本组已满（4 人）', icon: 'none' });
      return;
    }
    this._fillSlot(t.gIdx, pIdx, { playerId: player.playerId, name: player.name, avatar: player.avatar });
  },

  // 统一回填：只改目标 slot，保留 slot key 与顺序，UI 立即同步
  _fillSlot(gIdx, pIdx, payload) {
    const groups = this.data.groups.slice();
    const group = Object.assign({}, groups[gIdx]);
    const players = group.players.slice();
    const old = players[pIdx];
    players[pIdx] = {
      key: old.key,
      filled: true,
      playerId: payload.playerId || ('p-' + Date.now() + '-' + pIdx),
      name: payload.name,
      avatar: payload.avatar || mockAvatars.pickMockAvatar(payload.playerId || payload.name)
    };
    group.players = players;
    groups[gIdx] = group;
    this.setData({ groups }, () => this._refreshGroupMeta());
  },

  // 移出：槽位置空、key/顺序不变
  _clearSlot(gIdx, pIdx) {
    const groups = this.data.groups.slice();
    const group = Object.assign({}, groups[gIdx]);
    const players = group.players.slice();
    const old = players[pIdx];
    players[pIdx] = { key: old.key, filled: false, name: '玩家' + (pIdx + 1) };
    group.players = players;
    groups[gIdx] = group;
    this.setData({ groups }, () => this._refreshGroupMeta());
  },

  /* ===== 参赛组别 ===== */
  _groupFilledCount(gIdx) {
    const g = this.data.groups[gIdx];
    return ((g && g.players) || []).filter((p) => p && p.filled).length;
  },

  // 需要确认组合类型的组（团队赛制 + 该组已填 >= 2 人；2 人自动 2+0）
  _groupsNeedingComposition() {
    if (!COMPOSITION_MODES[this.data.gameMode]) return [];
    return (this.data.groups || [])
      .map((g, i) => ({ group: g, index: i, count: this._groupFilledCount(i) }))
      .filter((x) => x.count >= 2);
  },

  _compositionRecordValid(rec, count) {
    return gameEdit.compositionRecordValid(rec, count);
  },

  _buildCompositionSummary(map) {
    const groups = this.data.groups || [];
    const parts = groups
      .map((g, i) => {
        const rec = map[g.id];
        if (!rec || !rec.compositionType) return '';
        return '第' + (i + 1) + '组 ' + rec.compositionType;
      })
      .filter(Boolean);
    return parts.length ? parts.join(' · ') : '';
  },

  _playersToMembers(players) {
    return (players || []).map((p, i) => ({
      playerId: p.playerId || ('host-' + (p.key || i)),
      name: p.name,
      avatar: p.avatar || ''
    }));
  },

  /** 普通局面四人两球赛：是否当前赛制（不进组合弹窗，提交时自动写 composition） */
  _isFourball2BallMode() {
    return this.data.gameMode === '四人两球赛';
  },

  /**
   * 四人两球 teams：形状对齐 _buildSplitTeams（type:'pair' + players/members）。
   * 2 人 → 1 队；4 人 → 报名序 slot1+2 / slot3+4。
   */
  _buildFourball2BallTeams(filledPlayers) {
    const filled = (filledPlayers || []).filter((p) => p && p.filled);
    const makeTeam = (teamIndex, list) => {
      const members = this._playersToMembers(list);
      return {
        teamIndex: teamIndex,
        teamId: 'team-' + teamIndex,
        name: '队伍 ' + teamIndex,
        type: 'pair',
        players: members,
        members: members
      };
    };
    if (filled.length === 2) {
      return [makeTeam(1, filled)];
    }
    if (filled.length === 4) {
      return [makeTeam(1, filled.slice(0, 2)), makeTeam(2, filled.slice(2, 4))];
    }
    return [];
  },

  /**
   * 四人两球 composition 记录（与 G2/G3 2+2 confirmGrouping 同构字段）。
   * 2 人：single_team + compositionType 2+0；4 人：split_team + 2+2。
   */
  _buildFourball2BallCompositionRecord(groupIndex) {
    const g = this.data.groups[groupIndex];
    if (!g) return null;
    const filled = ((g.players || []).filter((p) => p && p.filled));
    const count = filled.length;
    if (count !== 2 && count !== 4) return null;
    const teams = this._buildFourball2BallTeams(filled);
    if (!teams.length) return null;
    if (count === 2) {
      return {
        groupId: g.id,
        groupIndex: groupIndex,
        playerCount: 2,
        compositionType: '2+0',
        teamMode: 'single_team',
        teams: teams,
        seats: buildFourballSeatsFromTeams(teams),
        scoringTemplate: 'team_best'
      };
    }
    return {
      groupId: g.id,
      groupIndex: groupIndex,
      playerCount: 4,
      compositionType: '2+2',
      teamMode: 'split_team',
      teams: teams,
      seats: buildFourballSeatsFromTeams(teams),
      scoringTemplate: 'team_best'
    };
  },

  /** 为所有有效组生成四人两球 groupCompositionMap */
  _buildFourball2BallCompositionMap() {
    const map = {};
    (this.data.groups || []).forEach((g, i) => {
      const rec = this._buildFourball2BallCompositionRecord(i);
      if (rec) map[g.id] = rec;
    });
    return map;
  },

  /**
   * 表单用 composition：四人两球始终自动生成；其它赛制读 data.groupCompositionMap。
   */
  _getEffectiveCompositionMap() {
    if (this._isFourball2BallMode()) {
      return this._buildFourball2BallCompositionMap();
    }
    return this.data.groupCompositionMap || {};
  },

  _buildCompositionRecord(groupIndex, opt) {
    const g = this.data.groups[groupIndex];
    const filled = ((g && g.players) || []).filter((p) => p && p.filled);
    const members = this._playersToMembers(filled);
    const record = {
      groupId: g.id,
      groupIndex: groupIndex,
      playerCount: filled.length,
      compositionType: opt.id
    };
    if (opt.single) {
      record.teamMode = 'single_team';
      record.teams = [{
        teamIndex: 1,
        teamId: 'team-1',
        name: '队伍 1',
        type: partType(filled.length),
        players: members,
        members: members
      }];
      record.scoringTemplate = UNIFIED_TEMPLATE;
      // Seat Model 双写：保留 teams.members，额外落盘固定 seats
      record.seats = buildFourballSeatsFromTeams(record.teams);
    }
    return record;
  },

  _splitSelectCount(compositionType) {
    return SPLIT_SELECT_COUNT[compositionType] || 0;
  },

  _filledPlayersInGroup(gIdx) {
    return ((this.data.groups[gIdx] && this.data.groups[gIdx].players) || []).filter((p) => p && p.filled);
  },

  _buildSplitTeams(opt, filledPlayers, selectedPlayerIds) {
    const selectedSet = {};
    (selectedPlayerIds || []).forEach((id) => { selectedSet[id] = true; });
    const pidOf = (p, i) => p.playerId || ('host-' + (p.key || i));
    const selected = [];
    const unselected = [];
    filledPlayers.forEach((p, i) => {
      if (selectedSet[pidOf(p, i)]) selected.push(p);
      else unselected.push(p);
    });
    const toMembers = (list) =>
      list.map((p, i) => ({
        playerId: p.playerId || ('host-' + (p.key || i)),
        name: p.name,
        avatar: p.avatar || ''
      }));

    const teams = [];
    teams.push({
      teamIndex: 1,
      teamId: 'team-1',
      name: '队伍 1',
      type: partType(selected.length),
      players: toMembers(selected),
      members: toMembers(selected)
    });

    if (opt.id === '2+1+1') {
      unselected.forEach((p, i) => {
        const m = toMembers([p]);
        teams.push({
          teamIndex: i + 2,
          teamId: 'team-' + (i + 2),
          name: '队伍 ' + (i + 2),
          type: 'single',
          players: m,
          members: m
        });
      });
    } else {
      const m = toMembers(unselected);
      teams.push({
        teamIndex: 2,
        teamId: 'team-2',
        name: '队伍 2',
        type: partType(unselected.length),
        players: m,
        members: m
      });
    }
    return teams;
  },

  _syncCompositionMapAfterGroupsChange() {
    const map = Object.assign({}, this.data.groupCompositionMap || {});
    let changed = false;
    (this.data.groups || []).forEach((g, i) => {
      const rec = map[g.id];
      const count = this._groupFilledCount(i);
      if (rec && !this._compositionRecordValid(rec, count)) {
        delete map[g.id];
        changed = true;
      }
    });
    Object.keys(map).forEach((gid) => {
      if (!(this.data.groups || []).some((g) => g.id === gid)) {
        delete map[gid];
        changed = true;
      }
    });
    if (changed) {
      this.setData({
        groupCompositionMap: map,
        compositionSummaryText: this._buildCompositionSummary(map)
      });
    }
  },

  _refreshGroupMeta() {
    const groups = this.data.groups;
    let text;
    if (groups.length === 1) {
      const filled = (groups[0].players || []).filter((p) => p.filled).length;
      text = '第1组 ' + filled + '/4人';
    } else {
      text = '共' + groups.length + '组';
    }
    this.setData({ groupCountText: text });
    this._syncCompositionMapAfterGroupsChange();
  },

  addGroup() {
    this._groupSeq += 1;
    const groups = this.data.groups.concat(makeEmptyGroup(this._groupSeq));
    this.setData({ groups }, () => this._refreshGroupMeta());
  },

  deleteGroup(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (this.data.groups.length <= 1) return;
    const groups = this.data.groups.slice();
    groups.splice(index, 1);
    this.setData({ groups }, () => this._refreshGroupMeta());
  },

  /* ===== 选择赛制 ===== */
  openGameModeSheet() {
    this.setData({ showGameMode: true });
  },
  closeGameModeSheet() {
    this.setData({ showGameMode: false });
  },
  selectGameMode(e) {
    const name = e.currentTarget.dataset.name;
    // 切换赛制即清空旧组合（避免概念混淆 / 残留脏数据）
    this._resetComposition();
    this.setData({ gameMode: name, showGameMode: false });
  },

  /* ===== 二次组合类型（逐组确认）===== */
  _openNextCompositionSheet() {
    const queue = this._compositionQueue || [];
    if (!queue.length) {
      this._finishSubmitFlow();
      return;
    }
    const item = queue[0];
    const g = item.group;

    // 2 人：自动生成 2+0（single_team + seats），不弹组合选择
    if (item.count === 2) {
      const opt = { id: '2+0', label: '2+0', parts: [2], single: true };
      const record = this._buildCompositionRecord(item.index, opt);
      const map = Object.assign({}, this.data.groupCompositionMap || {});
      map[g.id] = record;
      this._compositionQueue = queue.slice(1);
      this.setData({
        groupCompositionMap: map,
        compositionSummaryText: this._buildCompositionSummary(map),
        showComposition: false
      }, () => this._openNextCompositionSheet());
      return;
    }

    const existing = (this.data.groupCompositionMap || {})[g.id];
    this.setData({
      compositionGroupIndex: item.index,
      compositionGroupTitle: '第' + (item.index + 1) + '组组合类型',
      compositionOptions: buildCompositionOptions(item.count),
      compositionPendingSelected: existing && existing.compositionType ? existing.compositionType : '',
      showComposition: true
    });
  },

  _beginCompositionFlow() {
    const needing = this._groupsNeedingComposition();
    if (!needing.length) return false;
    const map = this.data.groupCompositionMap || {};
    const pending = needing.filter((x) => !this._compositionRecordValid(map[x.group.id], x.count));
    if (!pending.length) return false;
    this._compositionQueue = pending;
    this._openNextCompositionSheet();
    return true;
  },

  closeCompositionSheet() {
    this._compositionQueue = [];
    this._pendingSplitOpt = null;
    this.setData({ showComposition: false, showGrouping: false });
  },

  // 选择组合：4+0 / 3+0 → 直接完成本组；其它类型 → 进入球员分配界面
  selectComposition(e) {
    const id = e.currentTarget.dataset.id;
    const opt = (this.data.compositionOptions || []).find((o) => o.id === id);
    if (!opt) return;

    const gIdx = this.data.compositionGroupIndex;
    if (opt.single) {
      const record = this._buildCompositionRecord(gIdx, opt);
      const g = this.data.groups[gIdx];
      const map = Object.assign({}, this.data.groupCompositionMap || {});
      map[g.id] = record;
      this._compositionQueue = (this._compositionQueue || []).slice(1);
      this.setData({
        groupCompositionMap: map,
        compositionSummaryText: this._buildCompositionSummary(map),
        compositionPendingSelected: opt.id,
        showComposition: false
      }, () => this._openNextCompositionSheet());
      return;
    }

    this._pendingSplitOpt = opt;
    this._openSplitAssignment(gIdx, opt);
  },

  _buildGroupingForSplit(gIdx, opt) {
    const filled = this._filledPlayersInGroup(gIdx);
    const players = filled.map((p, i) => ({
      playerId: p.playerId || ('host-' + (p.key || i)),
      name: p.name,
      avatar: p.avatar || '',
      teamIndex: -1
    }));
    const teams = (opt.parts || []).map((size, ti) => ({
      teamId: 'team-' + (ti + 1),
      name: '队伍 ' + (ti + 1),
      sizeLabel: size === 1 ? '单人' : (size + '人'),
      type: partType(size),
      size: size,
      auto: ti > 0,
      members: []
    }));
    return { players, teams };
  },

  _syncGroupingSplit(players) {
    const teams = (this.data.groupingTeams || []).map((t) => Object.assign({}, t, { members: [] }));
    players.forEach((p) => {
      if (p.teamIndex === 0 && teams[0]) {
        teams[0].members.push({ playerId: p.playerId, name: p.name, avatar: p.avatar });
      }
    });

    const required = teams[0] ? teams[0].size : 0;
    const unassigned = players.filter((p) => p.teamIndex < 0);
    const poolCount = unassigned.length;

    if (teams[0] && teams[0].members.length === required && unassigned.length > 0) {
      let idx = 0;
      for (let ti = 1; ti < teams.length; ti++) {
        const size = teams[ti].size;
        const batch = unassigned.slice(idx, idx + size);
        teams[ti].members = batch.map((p) => ({
          playerId: p.playerId,
          name: p.name,
          avatar: p.avatar
        }));
        idx += size;
      }
    }

    const complete = !!(teams[0] && teams[0].members.length === required);
    this.setData({
      groupingPlayers: players,
      groupingTeams: teams,
      groupingPoolCount: poolCount,
      groupingSelectCount: teams[0] ? teams[0].members.length : 0,
      groupingComplete: complete
    });
  },

  _openSplitAssignment(gIdx, opt) {
    const g = this._buildGroupingForSplit(gIdx, opt);
    const required = this._splitSelectCount(opt.id);
    this.setData({
      showComposition: false,
      showGrouping: true,
      groupingGroupIndex: gIdx,
      groupingTitle: '第' + (gIdx + 1) + '组：选择 ' + opt.label + ' 分配',
      groupingLabel: opt.label,
      groupingSelectRequired: required,
      groupingSelectCount: 0,
      groupingHint: '请选择' + required + '名球员加入队伍 1',
      groupingTeams: g.teams,
      groupingPlayers: g.players,
      groupingActive: 0,
      groupingPoolCount: g.players.length,
      groupingComplete: false
    });
  },

  selectGroupingTeam(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const team = (this.data.groupingTeams || [])[idx];
    if (!team || team.auto) return;
    this.setData({ groupingActive: idx });
  },

  assignPlayer(e) {
    const pid = e.currentTarget.dataset.playerId;
    const teams = this.data.groupingTeams || [];
    if (!teams[0] || teams[0].members.length >= teams[0].size) return;
    const players = this.data.groupingPlayers.map((p) =>
      p.playerId === pid ? Object.assign({}, p, { teamIndex: 0 }) : p
    );
    this._syncGroupingSplit(players);
  },

  unassignPlayer(e) {
    const pid = e.currentTarget.dataset.playerId;
    const players = this.data.groupingPlayers.map((p) =>
      p.playerId === pid ? Object.assign({}, p, { teamIndex: -1 }) : p
    );
    this._syncGroupingSplit(players);
  },

  confirmGrouping() {
    if (!this.data.groupingComplete) {
      wx.showToast({
        title: this.data.groupingHint || ('请选择' + this.data.groupingSelectRequired + '名球员'),
        icon: 'none'
      });
      return;
    }
    const opt = this._pendingSplitOpt;
    const gIdx = this.data.groupingGroupIndex;
    if (!opt || gIdx == null) return;

    const team0 = (this.data.groupingTeams || [])[0];
    const selectedIds = (team0 && team0.members ? team0.members : []).map((m) => m.playerId);
    const filled = this._filledPlayersInGroup(gIdx);
    const g = this.data.groups[gIdx];
    const teams = this._buildSplitTeams(opt, filled, selectedIds);
    const record = {
      groupId: g.id,
      groupIndex: gIdx,
      playerCount: filled.length,
      compositionType: opt.id,
      teamMode: 'split_team',
      teams: teams,
      // Seat Model 双写：保留 teams.members，额外落盘固定 seats
      seats: buildFourballSeatsFromTeams(teams),
      scoringTemplate: 'team_best'
    };

    const map = Object.assign({}, this.data.groupCompositionMap || {});
    map[g.id] = record;
    this._compositionQueue = (this._compositionQueue || []).slice(1);
    this._pendingSplitOpt = null;

    this.setData({
      groupCompositionMap: map,
      compositionSummaryText: this._buildCompositionSummary(map),
      showGrouping: false,
      groupingTeams: [],
      groupingPlayers: [],
      groupingPoolCount: 0,
      groupingSelectCount: 0,
      groupingComplete: false
    }, () => this._openNextCompositionSheet());
  },

  closeGroupingSheet() {
    this._pendingSplitOpt = null;
    this.setData({ showGrouping: false, showComposition: true });
  },

  // 统一记分引擎的分组结构（scoreEngine.groups）：取指定组的 composition
  _getGroupComposition(gIdx) {
    const g = this.data.groups[gIdx];
    if (!g) return null;
    // 四人两球：读自动生成 map，避免 setData 未落盘时 _resolveGroups 拿到空 composition
    return (this._getEffectiveCompositionMap() || {})[g.id] || null;
  },

  _resolveGroups(gIdx) {
    const gi = gIdx == null ? 0 : gIdx;
    const comp = this._getGroupComposition(gi);
    if (comp && Array.isArray(comp.teams) && comp.teams.length) {
      return comp.teams.map((t) => ({
        teamId: t.teamId,
        name: t.name,
        type: t.type,
        members: (t.members || t.players || []).map((m) => ({
          playerId: m.playerId,
          name: m.name,
          avatar: m.avatar || ''
        }))
      }));
    }
    const filled = ((this.data.groups[gi] && this.data.groups[gi].players) || []).filter((p) => p && p.filled);
    return filled.map((p, i) => ({
      teamId: 'team-' + (i + 1),
      name: '队伍 ' + (i + 1),
      members: [{ playerId: p.playerId || ('host-' + (p.key || i)), name: p.name, avatar: p.avatar || '' }]
    }));
  },

  _resetComposition() {
    this._pendingSplitOpt = null;
    this._compositionQueue = [];
    this.setData({
      groupCompositionMap: {},
      compositionSummaryText: '',
      compositionGroupIndex: 0,
      compositionGroupTitle: '',
      compositionPendingSelected: '',
      compositionOptions: [],
      showComposition: false,
      showGrouping: false,
      groupingGroupIndex: 0,
      groupingTitle: '',
      groupingLabel: '',
      groupingSelectRequired: 0,
      groupingSelectCount: 0,
      groupingHint: '',
      groupingTeams: [],
      groupingPlayers: [],
      groupingActive: 0,
      groupingPoolCount: 0,
      groupingComplete: false
    });
  },

  /* ===== 开球时间滚轮 ===== */
  _buildWheels() {
    const t = this._tee;
    const months = Array.from({ length: 12 }, (_, i) => pad2(i + 1));
    const dayCount = daysInMonth(t.year, t.month);
    if (t.day > dayCount) t.day = dayCount;
    const days = Array.from({ length: dayCount }, (_, i) => pad2(i + 1));
    const hours = Array.from({ length: 24 }, (_, i) => pad2(i));
    const minutes = MINUTE_VALUES.map((m) => pad2(m));

    const minuteIdx = Math.max(0, MINUTE_VALUES.indexOf(t.minute));
    this.setData({
      teeYear: t.year,
      months,
      days,
      hours,
      minutes,
      teeIndex: [t.month - 1, t.day - 1, t.hour, minuteIdx]
    });
  },

  onTeeChange(e) {
    const [mIdx, dIdx, hIdx, minIdx] = e.detail.value;
    const t = this._tee;
    t.month = mIdx + 1;
    t.hour = hIdx;
    t.minute = MINUTE_VALUES[minIdx];

    // 月份变化可能导致天数变化：重建并钳制
    const dayCount = daysInMonth(t.year, t.month);
    let dayIdx = dIdx;
    if (dayIdx > dayCount - 1) dayIdx = dayCount - 1;
    t.day = dayIdx + 1;

    const days = Array.from({ length: dayCount }, (_, i) => pad2(i + 1));
    this.setData({ days, teeIndex: [mIdx, dayIdx, hIdx, minIdx] });
  },

  onTimePickerChange(e) {
    this.onTeeChange({ detail: { value: e.detail.value } });
  },

  changeYear(e) {
    const delta = Number(e.currentTarget.dataset.delta);
    this._tee.year += delta;
    this._buildWheels();
  },

  onTimePickerYearChange(e) {
    const delta = Number(e.detail.delta);
    this._tee.year += delta;
    this._buildWheels();
  },

  openTeeTimeSheet() {
    this._buildWheels();
    this.setData({ showTeeTime: true });
  },
  closeTeeTimeSheet() {
    this.setData({ showTeeTime: false });
  },
  confirmTeeTime() {
    this._applyTeeText();
    this.setData({ showTeeTime: false });
  },
  _applyTeeText() {
    const t = this._tee;
    const weekday = WEEK_NAMES[new Date(t.year, t.month - 1, t.day).getDay()];
    const text = t.year + '年' + pad2(t.month) + '月' + pad2(t.day) + '日 ' + weekday + ' ' + pad2(t.hour) + ':' + pad2(t.minute);
    this.setData({ teeTimeText: text });
  },

  /* ===== 隐私设置 ===== */
  // 生成 6 位纯数字访问密码（000000-999999），与赛事绑定
  _genAccessCode() {
    return String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
  },

  // 开关拨动：公开 ⇄ 私密
  toggleVisibility() {
    if (this.data.visibility === 'public') {
      // 公开 → 私密：自动生成 6 位密码并显示密码区
      this.setData({ visibility: 'private', accessCode: this._genAccessCode() });
    } else {
      // 私密 → 公开：清空 accessCode、隐藏密码区
      this.setData({ visibility: 'public', accessCode: '' });
    }
  },

  copyAccessCode() {
    if (!this.data.accessCode) return;
    wx.setClipboardData({
      data: this.data.accessCode,
      success: () => wx.showToast({ title: '密码已复制', icon: 'success' })
    });
  },

  /* ===== 底部：开始记分 ===== */
  // 比赛题目：用户输入优先；未输入则按组内已选球员昵称英文逗号拼接
  _resolveRoundName() {
    const input = (this.data.roundName || '').trim();
    if (input) return input;
    const players = (this.data.groups[0] && this.data.groups[0].players) || [];
    return players
      .filter((p) => p && p.filled)
      .map((p) => (p.name || '').trim())
      .filter(Boolean)
      .join(',');
  },

  // 赛制 → formatType（创建者所在组 composition 决定 best_ball / best_ball_4_0）
  _resolveFormatType(gIdx) {
    const gi = gIdx == null ? 0 : gIdx;
    const mode = this.data.gameMode;
    const comp = this._getGroupComposition(gi);
    const single = !!(comp && comp.teamMode === 'single_team');
    if (mode === '最好成绩赛') return 'best_score';
    if (mode === '最佳球位赛') return single ? 'best_ball_4_0' : 'best_ball';
    if (mode === '个人比杆赛') return 'individual_stroke';
    if (mode === '四人两球赛') return 'fourball_2ball';
    return '';
  },

  _buildFormSnapshot() {
    const compositionMap = this._getEffectiveCompositionMap();
    return {
      courseId: this.data.courseId,
      courseName: (this.data.courseName || '').trim(),
      courseLocation: this.data.courseLocation || '',
      front9Course: this.data.front9Course || null,
      back9Course: this.data.back9Course || null,
      courseHalfText: this.data.courseHalfText || '',
      teeTimeText: this.data.teeTimeText || '',
      roundName: this.data.roundName,
      gameMode: this.data.gameMode || '',
      visibility: this.data.visibility,
      accessCode: this.data.accessCode,
      groups: this.data.groups || [],
      groupCompositionMap: compositionMap
    };
  },

  /** 编辑模式：合并原 GAME + 当前表单，保证未改字段（如半场）仍参与校验 */
  _buildMergedFormSnapshot() {
    const form = this._buildFormSnapshot();
    if (!this.data.isEditMode) return form;
    const gameId = this.data.editGameId || this._editGameId;
    const existing = gameStore.getGame(gameId);
    return gameEdit.mergeFormWithExistingGame(existing, form);
  },

  _validationHelpers(extra) {
    return Object.assign(
      {
        filledInGroup: (g) => this._filledCountForGroup(g)
      },
      extra || {}
    );
  },

  _filledCountForGroup(g) {
    const idx = (this.data.groups || []).findIndex((x) => x && g && x.id === g.id);
    return idx >= 0 ? this._groupFilledCount(idx) : 0;
  },

  _validateBasicForm() {
    const snapshot = this.data.isEditMode ? this._buildMergedFormSnapshot() : this._buildFormSnapshot();
    return gameEdit.validateSubmitForm(snapshot, this._validationHelpers({ skipComposition: true }));
  },

  _validateBeforeSubmit() {
    const snapshot = this.data.isEditMode ? this._buildMergedFormSnapshot() : this._buildFormSnapshot();
    return gameEdit.validateSubmitForm(snapshot, this._validationHelpers());
  },

  _finishSubmitFlow() {
    const err = this._validateBeforeSubmit();
    if (err) {
      wx.showToast({ title: err, icon: 'none' });
      return;
    }
    if (this.data.isEditMode) {
      this._doUpdate();
    } else {
      this._doStart();
    }
  },

  onStart() {
    const snapshot = this.data.isEditMode ? this._buildMergedFormSnapshot() : this._buildFormSnapshot();

    // 先走「门禁校验」：跳过半场与组合完整性，以便赛制变更时优先进入组合分配
    const gateErr = gameEdit.validateSubmitForm(
      snapshot,
      this._validationHelpers({ skipComposition: true, skipHalfCourse: true })
    );
    if (gateErr) {
      wx.showToast({ title: gateErr, icon: 'none' });
      return;
    }

    if (this._beginCompositionFlow()) {
      return;
    }

    const err = this._validateBasicForm();
    if (err) {
      wx.showToast({ title: err, icon: 'none' });
      return;
    }

    this._finishSubmitFlow();
  },

  _doUpdate() {
    const err = this._validateBeforeSubmit();
    if (err) {
      wx.showToast({ title: err, icon: 'none' });
      return;
    }
    const gameId = this.data.editGameId || this._editGameId;
    const existing = gameStore.getGame(gameId);
    if (!existing) {
      wx.showToast({ title: '比赛不存在', icon: 'none' });
      return;
    }
    const form = this._buildMergedFormSnapshot();
    const updated = gameEdit.buildUpdatedGame(existing, form, {
      resolveRoundName: () => this._resolveRoundName()
    });
    gameStore.saveGame(updated);

    const savedGame = gameStore.getGameById(gameId);
    console.log('[EDIT_SAVE_RESULT]', {
      gameId,
      groupsLength: savedGame ? gameStore.listGroups(savedGame).length : 0,
      groups: savedGame ? gameStore.listGroups(savedGame) : []
    });

    halfCourseEdit.apply(
      {
        gameId: gameId,
        mode: 'game',
        courseId: updated.courseId,
        courseName: updated.courseName,
        front9Course: updated.front9Course,
        back9Course: updated.back9Course
      },
      updated.front9Course,
      updated.back9Course
    );

    const ms = matchStateUtil.getMatchState();
    const gi = ms && ms.groupIndex != null ? Number(ms.groupIndex) || 0 : 0;
    matchStateUtil.setMatchState(matchStateUtil.buildFromGame(updated, gi));

    wx.showToast({ title: '已保存', icon: 'success' });
    setTimeout(() => {
      if (getCurrentPages().length > 1) {
        wx.navigateBack({ delta: 1 });
      } else if (this._editReturnTo === 'score') {
        matchStateUtil.enterScorePage();
      } else if (gameStore.isMultiGroup(updated)) {
        wx.redirectTo({
          url: '/pages/game/hub/index?gameId=' + encodeURIComponent(gameId)
        });
      } else {
        wx.redirectTo({ url: '/pages/home/index?tab=my' });
      }
    }, 400);
  },

  _doStart() {
    const err = this._validateBeforeSubmit();
    if (err) {
      wx.showToast({ title: err, icon: 'none' });
      return;
    }
    const courseId = this.data.courseId;
    const courseName = (this.data.courseName || '').trim();
    // 四人两球：提交时自动写入与 G2/G3 2+2 同构的 composition（本阶段不改记分路由）
    const compositionMap = this._getEffectiveCompositionMap();
    if (this._isFourball2BallMode()) {
      this.setData({
        groupCompositionMap: compositionMap,
        compositionSummaryText: this._buildCompositionSummary(compositionMap)
      });
    }
    const buildSlots = (players) =>
      (players || []).map((p, i) => {
        if (!p || !p.filled) return null;
        return {
          playerId: p.playerId || 'host-' + (p.key || i),
          name: p.name,
          avatar: p.avatar || ''
        };
      });
    const groups = (this.data.groups || []).map((g, gi) => {
      const comp = compositionMap[g.id] || null;
      return {
        groupId: g.id || 'g-' + (gi + 1),
        name: '第' + (gi + 1) + '组',
        status: 'not_started',
        playersSlots: buildSlots(g.players),
        scoresByPlayer: {},
        composition: comp
      };
    });
    if (!groups.length) {
      groups.push({ groupId: 'g-1', name: '第1组', status: 'not_started', playersSlots: [], scoresByPlayer: {} });
    }

    const creatorId = gameStore.getCurrentUser().userId;
    const creatorGroupIndex = gameStore.findCreatorGroupIndex({ groups: groups, creatorId: creatorId, createdBy: creatorId });
    const creatorInGame = creatorGroupIndex >= 0;
    const isMulti = groups.length > 1;

    const finalRoundName = this._resolveRoundName();
    const gameId = 'g-' + Date.now();
    const firstComp = compositionMap[(this.data.groups[0] && this.data.groups[0].id)] || null;
    const game = {
      gameId: gameId,
      courseId: courseId,
      courseName: courseName,
      courseLocation: this.data.courseLocation || '',
      front9Course: this.data.front9Course || null,
      back9Course: this.data.back9Course || null,
      courseHalfText: this.data.courseHalfText || '',
      teeTime: this.data.teeTimeText || '',
      roundName: finalRoundName,
      gameMode: this.data.gameMode || '',
      groupCompositionMap: compositionMap,
      // 兼容旧逻辑：第1组 composition 同步到顶层
      composition: firstComp
        ? {
            type: firstComp.compositionType,
            single: firstComp.teamMode === 'single_team',
            teams: firstComp.teams || [],
            seats: Array.isArray(firstComp.seats)
              ? firstComp.seats
              : buildFourballSeatsFromTeams(firstComp.teams || []),
            scoringTemplate: firstComp.scoringTemplate || ''
          }
        : null,
      scoringTemplate: (firstComp && firstComp.scoringTemplate) || '',
      visibility: this.data.visibility,
      accessCode: this.data.visibility === 'private' ? this.data.accessCode : null,
      playersSlots: groups[0].playersSlots, // 首页卡片头像用（= 创建者所在组）
      groups: groups,
      status: 'active',
      currentRound: 1,
      createdBy: creatorId,
      creatorId: creatorId,
      creatorGroupIndex: creatorInGame ? creatorGroupIndex : -1,
      creatorInGame: creatorInGame,
      createdAt: Date.now()
    };
    gameStore.saveGame(game);

    // 多组且创建者未参赛 → Game Hub 分组表 TAB（不进入记分页、不回到创建页）
    if (isMulti && !creatorInGame) {
      wx.redirectTo({
        url: '/pages/game/hub/index?gameId=' + encodeURIComponent(gameId) + '&activeTab=group'
      });
      return;
    }

    // 单组：始终 group 0；多组且创建者在赛中：定位到创建者所在组
    const startGroupIndex = isMulti && creatorInGame ? creatorGroupIndex : 0;

    // 模板映射：最好成绩 / 最佳球位 / 四人两球 → 统一记分引擎 fourball_best；
    // formatType 四人两球仍为 fourball_2ball；groups 来自 groupCompositionMap（2+2 / 单 pair）。
    // 个人比杆 → game 模式。
    const unified =
      !!COMPOSITION_MODES[this.data.gameMode] || this._isFourball2BallMode();

    // 统一比赛状态对象（页面间唯一数据通道）：球员/球场/赛制/成绩/组数全部由创建页一次性写入。
    // mode/gameId/groupIndex 一并写入 matchState，记分页只认 matchState，不再依赖 URL 参数。
    const matchState = {
      mode: unified ? 'fourball_best' : 'game',
      gameId: gameId,
      groupIndex: startGroupIndex,
      groupId: gameId + ':' + startGroupIndex,
      // 球员：创建者所在组（或单组第 1 组）已选球员，记分页 HOLE 上方名册直接继承
      players: (groups[startGroupIndex].playersSlots || []).filter(Boolean).map((p) => ({
        playerId: p.playerId,
        name: p.name,
        avatar: p.avatar || ''
      })),
      // 球场信息：球场名称 / 开球时间等，记分页只读继承
      course: {
        courseId: courseId,
        courseName: courseName,
        courseLocation: this.data.courseLocation || '',
        halfText: this.data.courseHalfText || '',
        teeTime: this.data.teeTimeText || '',
        roundName: finalRoundName,
        front9Course: this.data.front9Course || null,
        back9Course: this.data.back9Course || null
      },
      // 赛制：驱动记分表第一列标题（四人两球 = fourball_2ball）
      formatType: this._resolveFormatType(startGroupIndex),
      // 统一记分引擎分组：composition.teams → pair shell
      groups: unified ? this._resolveGroups(startGroupIndex) : undefined,
      // 成绩：18 洞默认空（null），UI 不显示 0 / 假数据
      scores: matchStateUtil.emptyScores(),
      // 组数：记分页返回逻辑依赖（1=单组→重启回首页；>1→返回上一页）
      groupCount: groups.length,
      fromFlow: isMulti ? 'multiGroupGame' : '',
      fromPage: isMulti ? 'gameHub' : ''
    };
    matchStateUtil.setMatchState(matchState);

    // 多组且创建者在赛中：先压入 Game Hub，再进入记分页，保证栈 Create → Hub → Score
    if (isMulti && creatorInGame) {
      wx.navigateTo({
        url:
          '/pages/game/hub/index?gameId=' + encodeURIComponent(gameId) +
          '&activeTab=group&currentGroup=' + startGroupIndex,
        success: () => matchStateUtil.enterScorePage(),
        fail: () => matchStateUtil.enterScorePage()
      });
      return;
    }

    // 单组：直接进入记分页
    matchStateUtil.enterScorePage();
  }
});
