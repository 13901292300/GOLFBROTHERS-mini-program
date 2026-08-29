/**
 * 通讯录 — 关系分类：好友 / 推荐 / 我关注的 / 我的粉丝
 * 推荐 Tab：APP 历史关注迁移（非算法），排除已好友/已关注
 * 搜索：仅当前 Tab 内模糊匹配备注名 / 昵称
 */
const { createHeaderStyle } = require('../../../../../utils/headerEngine.js');
const mockAvatars = require('../../../../../utils/mockAvatars.js');
const contactNotifyStore = require('../../../../../utils/contactNotifyStore.js');
const contactFollowAction = require('../../../../../utils/contactFollowAction.js');
const playerDisplayName = require('../../../../../utils/playerDisplayName.js');
const socialRelationStore = require('../../../../../utils/socialRelationStore.js');
const openPlayerProfileUtil = require('../../../../../utils/openPlayerProfile.js');

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const RELATION_TABS = [
  { key: 'friends', label: '好友' },
  { key: 'recommend', label: '推荐' },
  { key: 'following', label: '我关注的' },
  { key: 'followers', label: '我的粉丝' }
];

/**
 * 好友 mock（互相关注）。c-x01 为单向，不进入好友列表。
 * nicknamePinyin / remarkPinyin 用于字母分组与组内排序。
 */
const MOCK_FRIENDS = [
  {
    id: 'c-1001',
    nickname: '张伟',
    remark: '老张',
    nicknamePinyin: 'zhangwei',
    remarkPinyin: 'laozhang',
    gender: 'male',
    handicap: 5.2,
    floatCoef: 0.8,
    signature: '周末固定局，欢迎约球',
    mutual: true,
    avatarIndex: 4
  },
  {
    id: 'c-1013',
    nickname: 'Tiger Zhang',
    remark: '老虎哥',
    nicknamePinyin: 'tigerzhang',
    remarkPinyin: 'laohuge',
    gender: 'male',
    handicap: 3.6,
    floatCoef: 1.0,
    signature: 'Chase the dream',
    mutual: true,
    avatarIndex: 5
  },
  {
    id: 'c-1002',
    nickname: '王磊',
    remark: '',
    nicknamePinyin: 'wanglei',
    remarkPinyin: '',
    gender: 'male',
    handicap: 12.4,
    floatCoef: 1.3,
    signature: '差点在路上',
    mutual: true,
    avatarIndex: 9
  },
  {
    id: 'c-1004',
    nickname: 'Alex',
    remark: '',
    nicknamePinyin: 'alex',
    remarkPinyin: '',
    gender: 'male',
    handicap: 8.0,
    floatCoef: 0.6,
    signature: 'Always chasing birdies',
    mutual: true,
    avatarIndex: 2
  },
  {
    id: 'c-1005',
    nickname: 'Bob',
    remark: '',
    nicknamePinyin: 'bob',
    remarkPinyin: '',
    gender: 'male',
    handicap: 15.6,
    floatCoef: 2.0,
    signature: 'Enjoy the round',
    mutual: true,
    avatarIndex: 5
  },
  {
    id: 'c-1006',
    nickname: '赵敏',
    remark: '',
    nicknamePinyin: 'zhaomin',
    remarkPinyin: '',
    gender: 'female',
    handicap: 18.3,
    floatCoef: 0.5,
    signature: '慢打快走，开心第一',
    mutual: true,
    avatarIndex: 1
  },
  {
    id: 'c-1007',
    nickname: '陈浩',
    remark: '浩哥',
    nicknamePinyin: 'chenhao',
    remarkPinyin: 'haoge',
    gender: 'male',
    handicap: 9.7,
    floatCoef: 0.9,
    signature: '队内赛常客',
    mutual: true,
    avatarIndex: 7
  },
  {
    id: 'c-1008',
    nickname: 'Mia',
    remark: '米娅',
    nicknamePinyin: 'mia',
    remarkPinyin: 'miya',
    gender: 'female',
    handicap: 6.8,
    floatCoef: 0.2,
    signature: 'Sunshine & swing',
    mutual: true,
    avatarIndex: 3
  },
  {
    id: 'c-1009',
    nickname: '林雅',
    remark: '',
    nicknamePinyin: 'linya',
    remarkPinyin: '',
    gender: 'female',
    handicap: 22.0,
    floatCoef: 1.5,
    signature: '刚入坑，多指教',
    mutual: true,
    avatarIndex: 6
  },
  {
    id: 'c-1010',
    nickname: 'David',
    remark: '',
    nicknamePinyin: 'david',
    remarkPinyin: '',
    gender: 'male',
    handicap: 4.0,
    floatCoef: 1.1,
    signature: 'Practice makes progress',
    mutual: true,
    avatarIndex: 8
  },
  {
    id: 'c-1011',
    nickname: '周杰',
    remark: '',
    nicknamePinyin: 'zhoujie',
    remarkPinyin: '',
    gender: 'male',
    handicap: 11.1,
    floatCoef: 0.4,
    signature: '下班就上场',
    mutual: true,
    avatarIndex: 0
  },
  {
    id: 'c-1012',
    nickname: 'Emily',
    remark: '小艾',
    nicknamePinyin: 'emily',
    remarkPinyin: 'xiaoai',
    gender: 'female',
    handicap: 14.2,
    floatCoef: 0.7,
    signature: '高尔夫治愈一切',
    mutual: true,
    avatarIndex: 1
  },
  /* 单向：不进入好友列表 */
  {
    id: 'c-x01',
    nickname: '单向粉',
    remark: '',
    nicknamePinyin: 'danxiangfen',
    remarkPinyin: '',
    gender: 'male',
    handicap: 10.0,
    floatCoef: 0.0,
    signature: '',
    mutual: false,
    avatarIndex: 2
  }
];

/**
 * APP 历史关注迁移 → 推荐（mock，非算法推荐）
 * 链路：APP 我关注的 → 手机号 → 小程序可识别用户（已注册 / 手机半注册）
 */
const MOCK_RECOMMEND = [
  {
    id: 'r-2001',
    nickname: '阳光球友',
    remark: '',
    nicknamePinyin: 'yangguangqiuyou',
    remarkPinyin: '',
    gender: 'male',
    handicap: 16.8,
    floatCoef: 0.9,
    signature: '附近常打，欢迎组局',
    phone: '13800002001',
    mpUserType: 'registered',
    source: 'app_follow',
    sourceHint: '来自APP关注',
    avatarIndex: 3
  },
  {
    id: 'r-2002',
    nickname: 'Sophie',
    remark: '',
    nicknamePinyin: 'sophie',
    remarkPinyin: '',
    gender: 'female',
    handicap: 10.2,
    floatCoef: 0.4,
    signature: 'Looking for weekend partners',
    phone: '13800002002',
    mpUserType: 'registered',
    source: 'app_follow',
    sourceHint: '来自APP关注',
    avatarIndex: 6
  },
  {
    id: 'r-2003',
    nickname: '韩磊',
    remark: '',
    nicknamePinyin: 'hanlei',
    remarkPinyin: '',
    gender: 'male',
    handicap: 7.5,
    floatCoef: 1.1,
    signature: '差点稳定，节奏友好',
    phone: '13800002003',
    mpUserType: 'half_registered',
    source: 'app_follow',
    sourceHint: '来自APP关注',
    avatarIndex: 8
  },
  {
    id: 'r-2004',
    nickname: 'Chris',
    remark: '',
    nicknamePinyin: 'chris',
    remarkPinyin: '',
    gender: 'male',
    handicap: 13.0,
    floatCoef: 0.7,
    signature: 'New in town',
    phone: '13800002004',
    mpUserType: 'registered',
    source: 'app_follow',
    sourceHint: '来自APP关注',
    avatarIndex: 0
  },
  {
    id: 'r-2005',
    nickname: '何雨',
    remark: '',
    nicknamePinyin: 'heyu',
    remarkPinyin: '',
    gender: 'female',
    handicap: 19.4,
    floatCoef: 1.6,
    signature: '新手求带飞',
    phone: '13800002005',
    mpUserType: 'half_registered',
    source: 'app_follow',
    sourceHint: '来自APP关注',
    avatarIndex: 1
  }
];

/** 我关注的：互关好友 + 单向关注 */
const MOCK_FOLLOWING_EXTRA = [
  {
    id: 'fo-3001',
    nickname: '钱进',
    remark: '教练钱',
    nicknamePinyin: 'qianjin',
    remarkPinyin: 'jiaolianqian',
    gender: 'male',
    handicap: 1.8,
    floatCoef: 0.3,
    signature: '挥杆课预约中',
    mutual: false,
    avatarIndex: 2
  },
  {
    id: 'fo-3002',
    nickname: 'Nina',
    remark: '',
    nicknamePinyin: 'nina',
    remarkPinyin: '',
    gender: 'female',
    handicap: 9.1,
    floatCoef: 0.8,
    signature: 'Travel & golf',
    mutual: false,
    avatarIndex: 3
  }
];

/** 普通粉丝补充（非新粉丝；初始可为空，互关好友已在 followers 池） */
const MOCK_FOLLOWERS_EXTRA = [];

/**
 * 新粉丝 mock：刚关注我、待处理
 * relation: follower；isNew: true
 */
const MOCK_NEW_FOLLOWERS = [
  {
    id: 'nf-5001',
    nickname: '孙涛',
    remark: '',
    nicknamePinyin: 'suntao',
    remarkPinyin: '',
    gender: 'male',
    handicap: 20.5,
    floatCoef: 1.4,
    signature: '刚关注，多交流',
    mutual: false,
    isNew: true,
    relation: 'follower',
    avatarIndex: 7
  },
  {
    id: 'nf-5002',
    nickname: 'Olivia',
    remark: 'Liv',
    nicknamePinyin: 'olivia',
    remarkPinyin: 'liv',
    gender: 'female',
    handicap: 11.6,
    floatCoef: 0.5,
    signature: 'Fan from last tournament',
    mutual: false,
    isNew: true,
    relation: 'follower',
    avatarIndex: 6
  }
];

/** 浮动系数：独立非负指标，原样展示，不加正负号 */
function formatFloat(n) {
  const v = Number(n);
  if (isNaN(v)) return '0.0';
  return Math.abs(v).toFixed(1);
}

function formatHandicap(n) {
  const v = Number(n);
  if (isNaN(v)) return '—';
  return v.toFixed(1);
}

/** 统一 Resolver：私人备注名 → 公开昵称；排序拼音随展示名 */
function resolveDisplay(friend, remarkNameMap, viewerUserId) {
  const nickname = String(friend.nickname || '').trim();
  const targetId = String((friend && (friend.id || friend.userId || friend.playerId)) || '').trim();
  const named = playerDisplayName.resolvePlayerDisplayNameForViewer({
    viewerUserId: viewerUserId,
    targetUserId: targetId,
    publicName: nickname,
    snapshotName: '',
    remarkNameMap: remarkNameMap || {},
    defaultName: nickname || targetId || '未知'
  });
  // 兼容 mock 行内 remark 字段（尚未写入 contactStore 时）
  const legacyRemark = String(friend.remark || friend.remarkName || '').trim();
  const displayName =
    named.hasRemark || !legacyRemark
      ? named.displayName
      : playerDisplayName.resolvePlayerDisplayNameForViewer({
          viewerUserId: viewerUserId,
          targetUserId: targetId,
          publicName: nickname,
          snapshotName: '',
          remarkNameMap: targetId ? { [targetId]: legacyRemark } : {},
          defaultName: nickname || targetId || '未知'
        }).displayName;
  const hasRemark = named.hasRemark || (!!legacyRemark && displayName === legacyRemark);
  return {
    displayName: displayName,
    sortPinyin: String(
      hasRemark
        ? friend.remarkPinyin || displayName
        : friend.nicknamePinyin || nickname || displayName
    )
      .trim()
      .toLowerCase(),
    remark: hasRemark ? displayName : ''
  };
}

function letterFromPinyin(pinyin) {
  const ch = String(pinyin || '').charAt(0).toUpperCase();
  if (ch >= 'A' && ch <= 'Z') return ch;
  return '#';
}

function mapContactRow(f, remarkNameMap, viewerUserId) {
  const resolved = resolveDisplay(f, remarkNameMap, viewerUserId);
  const letter = letterFromPinyin(resolved.sortPinyin);
  // 主页主键：稳定 userId / playerId；兼容 mock 行 id（与关注边同源）
  const userId = openPlayerProfileUtil.resolveOpenableUserId({
    userId: f.userId || f.playerId || f.id,
    playerId: f.playerId || f.userId || f.id,
    userType: f.userType || f.mpUserType || ''
  });
  return {
    id: f.id,
    userId: userId,
    canOpenProfile: !!userId,
    nickname: String(f.nickname || '').trim(),
    remark: resolved.remark || String(f.remark || '').trim(),
    displayName: resolved.displayName,
    sortPinyin: resolved.sortPinyin,
    letter: letter,
    genderSymbol: f.gender === 'female' ? '♀' : '♂',
    genderClass: f.gender === 'female' ? 'is-female' : 'is-male',
    handicapText: formatHandicap(f.handicap),
    floatText: formatFloat(f.floatCoef),
    signature: String(f.signature || '').trim(),
    avatar: mockAvatars.avatarByIndex(f.avatarIndex),
    userType: f.userType || f.mpUserType || '',
    gender: f.gender || '',
    handicap: f.handicap,
    floatCoef: f.floatCoef
  };
}

function _contactsRemarkContext() {
  const viewerUserId = socialRelationStore.resolveCurrentUserId();
  return {
    viewerUserId: viewerUserId,
    remarkNameMap: playerDisplayName.buildRemarkNameMap(viewerUserId)
  };
}

function sortByLetter(rows) {
  return rows.slice().sort((a, b) => {
    if (a.letter !== b.letter) return a.letter.localeCompare(b.letter);
    return a.sortPinyin.localeCompare(b.sortPinyin);
  });
}

/** 好友：仅互相关注 + 字母排序（既有逻辑） */
function buildContactRows(rawList) {
  const ctx = _contactsRemarkContext();
  return sortByLetter(
    (rawList || [])
      .filter((f) => f && f.mutual === true)
      .map((f) => mapContactRow(f, ctx.remarkNameMap, ctx.viewerUserId))
  );
}

/** 粉丝等：全量映射 + 备注优先字母排序 */
function buildLetterSortedRows(rawList) {
  const ctx = _contactsRemarkContext();
  return sortByLetter(
    (rawList || []).map((f) => mapContactRow(f, ctx.remarkNameMap, ctx.viewerUserId))
  );
}

/**
 * 我关注的：字母排序 + 关系状态
 * following ∩ followers → 好友；仅 following → 已关注
 */
function buildFollowingRows(followingList, followersList) {
  const ctx = _contactsRemarkContext();
  const followerIds = idSet(followersList);
  return sortByLetter(
    (followingList || []).map((f) => {
      const row = mapContactRow(f, ctx.remarkNameMap, ctx.viewerUserId);
      const isFriend = !!(f && f.id && followerIds[f.id]);
      return Object.assign({}, row, {
        relationStatus: isFriend ? 'friend' : 'following',
        relationStatusLabel: isFriend ? '好友' : '已关注'
      });
    })
  );
}

/**
 * 我的粉丝（普通）：字母排序 + 关系状态
 * following ∩ followers → 好友；仅 followers → 加关注
 */
function buildFollowerRows(followersList, followingList) {
  const ctx = _contactsRemarkContext();
  const followingIds = idSet(followingList);
  return sortByLetter(
    (followersList || []).map((f) => {
      const row = mapContactRow(f, ctx.remarkNameMap, ctx.viewerUserId);
      const isFriend = !!(f && f.id && followingIds[f.id]);
      if (isFriend) {
        return Object.assign({}, row, {
          relationStatus: 'friend',
          relationStatusLabel: '好友',
          showFollowFromFanBtn: false,
          isNew: false
        });
      }
      return Object.assign({}, row, {
        relationStatus: 'fan',
        relationStatusLabel: '',
        showFollowFromFanBtn: true,
        isNew: false
      });
    })
  );
}

/** 新粉丝区域：一律「加关注」 */
function buildNewFollowerRows(rawList) {
  const ctx = _contactsRemarkContext();
  return (rawList || []).map((f) =>
    Object.assign({}, mapContactRow(f, ctx.remarkNameMap, ctx.viewerUserId), {
      showFollowFromFanBtn: true,
      isNew: true,
      relationStatus: 'new_fan',
      relationStatusLabel: ''
    })
  );
}

/** 推荐：APP 关注迁移列表；列表仅「加关注」；弱来源提示 */
function buildRecommendRows(rawList) {
  const ctx = _contactsRemarkContext();
  return (rawList || []).map((f) =>
    Object.assign({}, mapContactRow(f, ctx.remarkNameMap, ctx.viewerUserId), {
      showFollowBtn: true,
      sourceHint: String(f.sourceHint || '来自APP关注').trim(),
      mpUserType: f.mpUserType || 'registered',
      source: f.source || 'app_follow'
    })
  );
}

function cloneRaw(user) {
  return Object.assign({}, user || {});
}

function idSet(list) {
  const map = {};
  (list || []).forEach((item) => {
    const id = item && item.id;
    if (id) map[id] = true;
  });
  return map;
}

/**
 * 推荐过滤：去掉已在 following 中的用户
 * @param {Array} recommendations
 * @param {Array} following
 * @returns {Array} recommendations 中 id/userId 不在 following 的项
 */
function filterRecommendationsNotFollowing(recommendations, following) {
  const followingIds = {};
  (following || []).forEach((f) => {
    if (!f) return;
    const fid = f.id || f.userId;
    if (fid) followingIds[fid] = true;
  });
  return (recommendations || []).filter((r) => {
    if (!r) return false;
    const rid = r.id || r.userId;
    return !!rid && !followingIds[rid];
  });
}

/**
 * 推荐过滤：排除已好友、已在我关注的（基于 NotFollowing）
 */
function filterRecommendationsExcludeRelated(recommendations, following, friends) {
  return filterRecommendationsNotFollowing(
    filterRecommendationsNotFollowing(recommendations, following),
    friends
  );
}

/** friends = following ∩ followers（互相关注；不含仅存于 newFollowers 的用户） */
function syncMutualFriends(store) {
  if (!store) return;
  const followingIds = idSet(store.following);
  const next = [];
  const seen = {};
  (store.followers || []).forEach((f) => {
    const id = f && f.id;
    if (!id || !followingIds[id] || seen[id]) return;
    seen[id] = true;
    next.push(Object.assign({}, f, { mutual: true, isNew: false }));
  });
  store.friends = next;
}

/** 仅模糊匹配备注名 / 公开昵称 / 当前展示名 */
function filterByKeyword(rows, keyword) {
  const q = String(keyword || '').trim().toLowerCase();
  if (!q) return rows.slice();
  return (rows || []).filter((row) => {
    const nickname = String(row.nickname || '').toLowerCase();
    const remark = String(row.remark || '').toLowerCase();
    const displayName = String(row.displayName || '').toLowerCase();
    return (
      nickname.indexOf(q) !== -1 ||
      remark.indexOf(q) !== -1 ||
      displayName.indexOf(q) !== -1
    );
  });
}

function buildSections(rows) {
  const map = {};
  rows.forEach((row) => {
    const key = row.letter || '#';
    if (!map[key]) map[key] = [];
    map[key].push(row);
  });
  return Object.keys(map)
    .sort((a, b) => {
      if (a === '#') return 1;
      if (b === '#') return -1;
      return a.localeCompare(b);
    })
    .map((letter) => ({
      letter: letter,
      anchorId: 'sec-' + letter,
      items: map[letter]
    }));
}

function buildIndexLetters(sections) {
  const active = {};
  (sections || []).forEach((s) => {
    if (s.letter) active[s.letter] = true;
  });
  return LETTERS.map((letter) => ({
    letter: letter,
    active: !!active[letter]
  }));
}

function mutualFriendsRaw() {
  return MOCK_FRIENDS.filter((f) => f && f.mutual === true);
}

function metaLabelForTab(tab, searchMode) {
  if (searchMode) return '搜索结果';
  if (tab === 'recommend') return '推荐';
  if (tab === 'following') return '关注';
  if (tab === 'followers') return '粉丝';
  return '球友';
}

function emptyTextForTab(tab, searchMode) {
  if (searchMode) return '未找到相关用户';
  if (tab === 'recommend') return '暂无来自APP的关注迁移';
  if (tab === 'following') return '暂无关注';
  if (tab === 'followers') return '暂无粉丝';
  return '暂无双向关注球友';
}

/**
 * 归一化选人模式：只认明确 query / 页面状态，不猜 TAB / 复选框 / 上一页。
 * 创建/邀请等现网选人页在 friends；通讯录若带下列参数则视为选人。
 */
function resolveIsSelectionMode(options) {
  const o = options && typeof options === 'object' ? options : {};
  const truthy = function (v) {
    if (v === true || v === 1) return true;
    const s = String(v == null ? '' : v)
      .trim()
      .toLowerCase();
    return s === '1' || s === 'true' || s === 'yes';
  };
  if (truthy(o.selectMode) || truthy(o.isSelectionMode) || truthy(o.selection)) return true;
  if (truthy(o.select) || truthy(o.pick)) return true;
  if (o.selectionContext != null && String(o.selectionContext).trim() !== '') return true;

  const mode = String(o.mode || '')
    .trim()
    .toLowerCase();
  if (
    mode === 'select' ||
    mode === 'picker' ||
    mode === 'pick' ||
    mode === 'invite' ||
    mode === 'add_member' ||
    mode === 'add-member' ||
    mode === 'proxy_register' ||
    mode === 'proxy_register_team' ||
    mode === 'select_temp_admin'
  ) {
    return true;
  }

  const pickerMode = String(o.pickerMode || '')
    .trim()
    .toLowerCase();
  if (
    truthy(o.pickerMode) ||
    pickerMode === 'select' ||
    pickerMode === 'pick' ||
    pickerMode === 'invite' ||
    pickerMode === 'add'
  ) {
    return true;
  }

  const scene = String(o.scene || '')
    .trim()
    .toLowerCase();
  if (
    scene === 'select' ||
    scene === 'picker' ||
    scene === 'invite' ||
    scene === 'add_member' ||
    scene === 'pick' ||
    scene === 'create'
  ) {
    return true;
  }

  const source = String(o.source || '')
    .trim()
    .toLowerCase();
  if (
    source === 'select' ||
    source === 'picker' ||
    source === 'invite' ||
    source === 'add_member' ||
    source === 'pick' ||
    source === 'create'
  ) {
    return true;
  }

  return false;
}

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    relationTabs: RELATION_TABS,
    activeTab: 'friends',
    keyword: '',
    searchMode: false,
    useLetterIndex: true,
    sections: [],
    flatRows: [],
    searchResults: [],
    indexLetters: [],
    listCount: 0,
    metaLabel: '球友',
    emptyText: '暂无双向关注球友',
    scrollIntoView: '',
    newFollowerRows: [],
    followersTabBadge: false,
    /** 明确选人模式（由 query 归一化，不猜 UI） */
    isSelectionMode: false,
    selectedMap: {}
  },

  onLoad(options) {
    this._searchTimer = null;
    this._keywordDraft = '';
    this._profileNavLock = false;
    this._selectionTapLock = false;
    const opt = options || {};
    // 唯一模式真相：显式参数 → isSelectionMode（首页入口无参 = 浏览）
    const isSelectionMode = resolveIsSelectionMode(opt);
    this._isSelectionMode = isSelectionMode;
    this._selectMode = isSelectionMode; // 兼容旧字段名
    this._selectedMap = {};
    this.setData({
      isSelectionMode: isSelectionMode,
      selectedMap: {}
    });
    /**
     * mock 关系库（运行时可变）：
     * friends / following / followers / newFollowers / recommendations
     */
    const followingRaw = mutualFriendsRaw()
      .map(cloneRaw)
      .concat(MOCK_FOLLOWING_EXTRA.map(cloneRaw));
    const friendsRaw = mutualFriendsRaw().map(cloneRaw);
    const recommendationsRaw = filterRecommendationsExcludeRelated(
      MOCK_RECOMMEND.map(cloneRaw),
      followingRaw,
      friendsRaw
    );
    // 按未读 newFollower 事件注入对应新粉丝（事件已读则不再恢复）
    const unreadNewIds = contactNotifyStore.getUnreadUserIdsByType(
      contactNotifyStore.TYPE.NEW_FOLLOWER
    );
    const unreadSet = {};
    unreadNewIds.forEach((id) => {
      unreadSet[id] = true;
    });
    const seedNewFollowers = MOCK_NEW_FOLLOWERS.filter((u) => u && unreadSet[u.id]).map((u) =>
      Object.assign({}, cloneRaw(u), { isNew: true, relation: 'follower' })
    );
    // 卡片资料仍用 mock 目录；关系边以 socialRelationStore 为唯一真相
    this._relationStore = {
      friends: friendsRaw,
      following: followingRaw,
      followers: mutualFriendsRaw()
        .map(cloneRaw)
        .concat(MOCK_FOLLOWERS_EXTRA.map(cloneRaw))
        .concat([{ id: 'c-x01', nickname: '单向粉', nicknamePinyin: 'danxiangfen', gender: 'male', handicap: 10, floatCoef: 0, signature: '', avatarIndex: 2 }]),
      newFollowers: seedNewFollowers,
      recommendations: recommendationsRaw
    };
    contactFollowAction.bindStore(this._relationStore);
    contactFollowAction.hydrateBoundStoreFromPersistence(this._relationStore);
    this.rebuildRowsFromStore();
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    this.applyListState({ keyword: '', tab: 'friends' });
  },

  /** 由关系库重建各 Tab 展示行；好友仍用互相关注 + 字母排序逻辑 */
  rebuildRowsFromStore() {
    const store = this._relationStore || {
      friends: [],
      following: [],
      followers: [],
      newFollowers: [],
      recommendations: []
    };
    syncMutualFriends(store);
    // 推荐排除：已好友 ∪ 已关注
    store.recommendations = filterRecommendationsExcludeRelated(
      store.recommendations,
      store.following,
      store.friends
    );
    this._rowsByTab = {
      friends: buildContactRows(store.friends),
      recommend: buildRecommendRows(store.recommendations),
      following: buildFollowingRows(store.following, store.followers),
      followers: buildFollowerRows(store.followers, store.following),
      newFollowers: buildNewFollowerRows(store.newFollowers)
    };
  },

  /**
   * 查看「我的粉丝」完成：仅标记 newFollower 事件已读（不影响其他通知类型）
   * 新粉丝转入普通粉丝列表
   */
  markNewFollowersSeen() {
    const store = this._relationStore;
    if (store && (store.newFollowers || []).length) {
      const seenIds = idSet(store.followers);
      (store.newFollowers || []).forEach((u) => {
        const id = u && u.id;
        if (!id || seenIds[id]) return;
        store.followers.push(
          Object.assign({}, cloneRaw(u), {
            isNew: false,
            mutual: false,
            relation: 'follower'
          })
        );
        seenIds[id] = true;
      });
      store.newFollowers = [];
    }
    contactNotifyStore.markReadByType(contactNotifyStore.TYPE.NEW_FOLLOWER);
    this.rebuildRowsFromStore();
  },

  onShow() {
    this.applyTheme(getApp().getTheme());
    if (this._relationStore) {
      contactFollowAction.bindStore(this._relationStore);
      contactFollowAction.hydrateBoundStoreFromPersistence(this._relationStore);
      this.rebuildRowsFromStore();
      this.applyListState({
        tab: this.data.activeTab || 'friends',
        keyword: this.data.keyword || ''
      });
    }
  },

  initHeaderNav() {
    const styles = createHeaderStyle();
    this.setData({
      headerRootStyle: styles.headerRootStyle,
      headerBarStyle: styles.headerBarStyle
    });
  },

  applyTheme(theme) {
    this.setData({ themeClass: theme === 'dark' ? 'dark-mode' : 'bright-mode' });
  },

  /**
   * 刷新列表展示。
   * 注意：不写入 scrollIntoView（仅 onTapIndex 可改）。
   * 搜索模式下不重建 / 不写入 indexLetters。
   */
  applyListState(opts) {
    const options = opts || {};
    const tab = options.tab != null ? options.tab : this.data.activeTab;
    const keyword = options.keyword != null ? options.keyword : this.data.keyword;
    const q = String(keyword || '').trim();
    const sourceRows = (this._rowsByTab && this._rowsByTab[tab]) || [];
    const newFollowerRows =
      tab === 'followers' ? (this._rowsByTab && this._rowsByTab.newFollowers) || [] : [];
    const followersTabBadge = contactNotifyStore.hasUnreadForPath(
      contactNotifyStore.TARGET.FOLLOWERS
    );
    const useLetterIndex = tab !== 'recommend';
    const searchMode = !!q;

    if (searchMode) {
      this.applySearchResults(tab, keyword, q, sourceRows, newFollowerRows, followersTabBadge);
      return;
    }

    if (useLetterIndex) {
      const sections = buildSections(sourceRows);
      const totalCount = sourceRows.length + (tab === 'followers' ? newFollowerRows.length : 0);
      this.setData({
        activeTab: tab,
        keyword: keyword || '',
        searchMode: false,
        useLetterIndex: true,
        sections: sections,
        flatRows: [],
        searchResults: [],
        newFollowerRows: tab === 'followers' ? newFollowerRows : [],
        indexLetters: buildIndexLetters(sections),
        listCount: totalCount,
        metaLabel: metaLabelForTab(tab, false),
        emptyText: emptyTextForTab(tab, false),
        followersTabBadge: followersTabBadge
      });
      return;
    }

    // 推荐：扁平列表，无 A–Z
    this.setData({
      activeTab: tab,
      keyword: keyword || '',
      searchMode: false,
      useLetterIndex: false,
      sections: [],
      flatRows: sourceRows.slice(),
      searchResults: [],
      newFollowerRows: [],
      listCount: sourceRows.length,
      metaLabel: metaLabelForTab(tab, false),
      emptyText: emptyTextForTab(tab, false),
      followersTabBadge: false
    });
  },

  /** 搜索结果轻量 setData：不碰 indexLetters / scrollIntoView */
  applySearchResults(tab, keyword, q, sourceRows, newFollowerRows, followersTabBadge) {
    const searchSource =
      tab === 'followers' ? sourceRows.concat(newFollowerRows || []) : sourceRows;
    const results = filterByKeyword(searchSource, q);
    this.setData({
      activeTab: tab,
      searchMode: true,
      useLetterIndex: false,
      sections: [],
      flatRows: [],
      searchResults: results,
      newFollowerRows: [],
      listCount: results.length,
      metaLabel: metaLabelForTab(tab, true),
      emptyText: emptyTextForTab(tab, true),
      followersTabBadge:
        followersTabBadge != null
          ? followersTabBadge
          : contactNotifyStore.hasUnreadForPath(contactNotifyStore.TARGET.FOLLOWERS)
    });
  },

  switchRelationTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.activeTab) return;
    const prev = this.data.activeTab;
    // 离开「我的粉丝」且未处理加关注 → 视为已查看
    if (prev === 'followers' && tab !== 'followers') {
      this.markNewFollowersSeen();
    }
    this.clearSearchTimer();
    this._keywordDraft = '';
    this.applyListState({ tab: tab, keyword: '' });
  },

  clearSearchTimer() {
    if (this._searchTimer) {
      clearTimeout(this._searchTimer);
      this._searchTimer = null;
    }
  },

  /** 输入中只写 keyword；停输 200ms 后再过滤列表 */
  onSearchInput(e) {
    const keyword = (e.detail && e.detail.value) || '';
    this._keywordDraft = keyword;
    this.setData({ keyword: keyword });
    this.clearSearchTimer();
    this._searchTimer = setTimeout(() => {
      this._searchTimer = null;
      const draft = this._keywordDraft;
      const q = String(draft || '').trim();
      const tab = this.data.activeTab;
      if (!q) {
        this.applyListState({ tab: tab, keyword: '' });
        return;
      }
      const sourceRows = (this._rowsByTab && this._rowsByTab[tab]) || [];
      const newFollowerRows =
        tab === 'followers' ? (this._rowsByTab && this._rowsByTab.newFollowers) || [] : [];
      this.applySearchResults(tab, draft, q, sourceRows, newFollowerRows);
    }, 200);
  },

  clearSearch() {
    this.clearSearchTimer();
    this._keywordDraft = '';
    this.setData({ keyword: '' });
    this.applyListState({ tab: this.data.activeTab, keyword: '' });
  },

  onUnload() {
    this.clearSearchTimer();
  },

  onTapIndex(e) {
    if (this.data.searchMode || !this.data.useLetterIndex) return;
    const letter = e.currentTarget.dataset.letter;
    if (!letter) return;
    const hit = (this.data.sections || []).some((s) => s.letter === letter);
    if (!hit) {
      wx.showToast({ title: '无 ' + letter + ' 分组', icon: 'none', duration: 800 });
      return;
    }
    // 唯一允许写入 scrollIntoView 的路径
    this.setData({ scrollIntoView: 'sec-' + letter });
  },

  /** 推荐 / 粉丝：统一加关注入口（组件 catchtap → bind:follow，不冒泡进主页） */
  onFollowAction(e) {
    const id = String(
      (e.detail && (e.detail.userId || e.detail.playerId)) ||
        (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) ||
        ''
    );
    if (!id) return;
    const tab = this.data.activeTab;
    if (tab !== 'recommend' && tab !== 'followers') return;

    const store = this._relationStore;
    if (!store) return;

    let user = null;
    if (tab === 'recommend') {
      user = (store.recommendations || []).find((r) => String(r.id) === id);
    } else {
      user =
        (store.newFollowers || []).find((f) => String(f.id) === id) ||
        (store.followers || []).find((f) => String(f.id) === id);
    }
    if (!user) return;

    const status = contactFollowAction.applyFollow(store, user);
    this.rebuildRowsFromStore();
    this.applyListState({ tab: tab, keyword: this.data.keyword || '' });
    wx.showToast({
      title: status === 'friend' ? '已成为好友' : '已关注',
      icon: 'none',
      duration: 900
    });
  },

  /**
   * 球员整行唯一入口（头像 / 姓名 / 空白 / 勾选区共用）。
   * 选人 → 仅 toggle；浏览 → 仅 openPlayerProfile。二者互斥。
   */
  onTapPlayer(e) {
    if (this._isSelectionMode || this.data.isSelectionMode) {
      this.togglePlayerSelection(e);
      return;
    }
    this.openContactPlayerProfile(e);
  },

  /** @deprecated 兼容旧 bind；请用 onTapPlayer */
  onTapContactRow(e) {
    this.onTapPlayer(e);
  },

  /**
   * 选人模式：按 selection key（行 id）切换选中；不要求 userId；不进主页。
   * 确认/取消/全选等若由上层流程提供，保持其既有逻辑。
   */
  togglePlayerSelection(e) {
    if (!(this._isSelectionMode || this.data.isSelectionMode)) return;
    if (this._selectionTapLock) return;
    const ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
    // 选择键 ≠ 主页 targetUserId；临时球员可无 userId 仍可选
    const selectionKey = String(
      ds.selectionKey || ds.id || ds.playerId || ''
    ).trim();
    if (!selectionKey) return;

    this._selectionTapLock = true;
    const self = this;
    setTimeout(function () {
      self._selectionTapLock = false;
    }, 280);

    const prev = this._selectedMap || this.data.selectedMap || {};
    const next = Object.assign({}, prev);
    if (next[selectionKey]) delete next[selectionKey];
    else next[selectionKey] = true;
    this._selectedMap = next;
    this.setData({ selectedMap: next });
  },

  /**
   * 浏览模式：整行进入球员主页。
   * 主页用 targetUserId；与选人 selection key 分离。
   */
  openContactPlayerProfile(e) {
    if (this._isSelectionMode || this.data.isSelectionMode) return;
    if (this._profileNavLock) return;

    const ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
    const rowUserId = String(ds.userId || '').trim();
    const nickname = String(ds.nickname || '').trim();
    const avatar = String(ds.avatar || '').trim();
    const userType = String(ds.userType || '').trim();

    // 主页身份：只用稳定 userId；不把 selection id / 姓名当身份
    const targetUserId = openPlayerProfileUtil.resolveOpenableUserId({
      userId: rowUserId,
      playerId: rowUserId,
      userType: userType
    });
    if (!targetUserId) {
      wx.showToast({ title: '该球员暂无主页', icon: 'none', duration: 1200 });
      return;
    }

    this._profileNavLock = true;
    const self = this;
    const opened = openPlayerProfileUtil.openPlayerProfile({
      userId: targetUserId,
      playerId: targetUserId,
      publicName: nickname,
      nickname: nickname,
      avatar: avatar,
      gender: ds.gender,
      handicap: ds.handicap,
      floatCoef: ds.floatCoef,
      userType: userType,
      identitySource: 'contacts'
    });
    if (!opened) {
      this._profileNavLock = false;
      wx.showToast({ title: '该球员暂无主页', icon: 'none', duration: 1200 });
      return;
    }
    setTimeout(function () {
      self._profileNavLock = false;
    }, 800);
  },

  onBack() {
    if (this.data.activeTab === 'followers') {
      this.markNewFollowersSeen();
    }
    wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/home/index' }) });
  }
});
