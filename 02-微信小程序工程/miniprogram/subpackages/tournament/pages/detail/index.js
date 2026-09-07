const mockAvatars = require('../../../../utils/mockAvatars.js');
const comboDisplayName = require('../../../../utils/comboDisplayName.js');
const comboEntityProjection = require('../../../../utils/comboEntityProjection.js');
/**
 * 赛事详情页（球队赛 / 队内赛正在进行中）
 * 1:1 复刻 01-HTML原型/记分页面/队内赛正在进行中.html
 * 含 5 个 tab：赛事详情 / 领先榜 / 出发表 / 讨论区 / 游戏
 */

const { createHeaderStyle } = require('../../../../utils/headerEngine.js');
const groupsStore = require('../../../../utils/groupsStore.js');
const matchStateUtil = require('../../../../utils/matchState.js');
const holeLayout = require('../../../../utils/holeLayout.js');
const halfCourse = require('../../../../utils/halfCourse.js');
const partnerConfigUtil = require('../../../../utils/partnerConfig.js');
const eventSponsorConfig = require('../../../../utils/eventSponsorConfig.js');
const bannerConfig = require('../../../../utils/bannerConfig.js');
const teamMatchStore = require('../../../../utils/teamMatchStore.js');
const {
  isTeamMatchFamily,
  isTeamInternalMatch,
  isInterTeamMatch,
  resolveOrganizerDisplay,
  resolveParticipatingTeamViews,
  resolveHeroOrganizerSectionLabel,
  DEFAULT_ORG_LOGO
} = require('../../../../utils/teamMatchCapabilities.js');
const matchManageAccess = require('../../../../utils/matchManageAccess.js');
const teamMatchMoreMenu = require('../../../../utils/teamMatchMoreMenu.js');
const teamMatchFinish = require('../../../../utils/teamMatchFinish.js');
const teamMatchBottomCta = require('../../utils/teamMatchBottomCta.js');
const teamMatchEnterGroupScore = require('../../utils/teamMatchEnterGroupScore.js');
const teamMatchViewerGroup = require('../../utils/teamMatchViewerGroup.js');
const seriesFinalize = require('../../../../utils/seriesFinalize.js');
const demoJiaobeiMatch = require('../../../../utils/demoJiaobeiMatch.js');
const gameLifecycle = require('../../../../utils/gameLifecycle.js');
const gameStore = require('../../../../utils/gameStore.js');
const userProfileStore = require('../../../../utils/userProfileStore.js');
const teamDirectory = require('../../../../utils/teamDirectory.js');
const playerDirectory = require('../../../../utils/playerDirectory.js');
const tPosition = require('../../../../utils/tPosition.js');
const tempAdminPermission = require('../../../../utils/tempAdminPermission.js');
const caddieScoringAccess = require('../../../../utils/caddieScoringAccess.js');
const tempAdminAccess = require('../../../../utils/tempAdminAccess.js');
const qrAccessAuth = require('../../../../utils/qrAccessAuth.js');
const playerManage = require('../../../../utils/playerManage.js');
const sideGameHostSnapshot = require('../../utils/sideGameHostSnapshot.js');
const teeSheetManage = require('../../../../utils/teeSheetManage.js');
const paymentManage = require('../../../../utils/paymentManage.js');
const registrationInteractionModel = require('../../utils/registrationInteractionModel.js');
const REG_CTA_COPY = {
  register: registrationInteractionModel.resolveRegistrationCtaCopy('register'),
  cancel: registrationInteractionModel.resolveRegistrationCtaCopy('cancel'),
  closed: registrationInteractionModel.resolveRegistrationCtaCopy('closed')
};
const REG_SELF_CANCEL_UNGROUPED = registrationInteractionModel.buildSelfCancelDialogModel({
  grouped: false
});
const {
  resolveStrokeCompositions,
  resolveCompositionMode
} = require('../../../../utils/strokeCompositionResolver.js');
const {
  resolveStrokeKind,
  resolveGameMode,
  isG5MatchPlayMode,
  isG6G7MatchPlayMode,
  isG8MatchPlayMode,
  isMatchPlayBoardMode
} = require('../../../../utils/strokeEntityValidator.js');
const matchStatus = require('../../../../utils/matchStatus.js');
const gameProgress = require('../../../../utils/gameProgress.js');
const contactStore = require('../../../../utils/contactStore.js');
const contactFollowAction = require('../../../../utils/contactFollowAction.js');
const playerDisplayName = require('../../../../utils/playerDisplayName.js');
const socialRelationStore = require('../../../../utils/socialRelationStore.js');
const scheduleStore = require('../../../../utils/scheduleStore.js');
const scheduleAdapter = require('../../../../utils/scheduleAdapter.js');
const { buildMatchPlayResultSummary } = require('../../../../utils/matchPlayResult.js');
const matchPlayTeamScore = require('../../../../utils/matchPlayTeamScore.js');
const matchPlayScoreboardView = require('../../utils/matchPlayScoreboardView.js');
const playerActionModal = require('../../../../utils/playerActionModal.js');
const openPlayerProfileUtil = require('../../../../utils/openPlayerProfile.js');
const playerIdentityGuard = require('../../../../utils/playerIdentityGuard.js');
const reactionPanelConfig = require('../../../../utils/reactionPanelConfig.js');
const scoreReactionAccess = require('../../../../utils/scoreReactionAccess.js');
const leaderboardSettingViewModel = require('../../../../utils/leaderboardSettingViewModel.js');
const personalLeaderboardBoard = require('../../../../utils/personalLeaderboardBoard.js');
const teamLeaderboardView = require('../../utils/teamLeaderboardView.js');
const liveLeaderboardScorecard = require('../../../../utils/liveLeaderboardScorecard.js');

/**
 * reaction 重逻辑分包：仅在用户选择具体动画后 require.async。
 * 必须用相对路径（微信默认不支持绝对 path）。
 */
const REACTION_HOST_BRIDGE =
  '../../../reaction/utils/reactionHostBridge.js';
let _reactionHostBridge = null;
let _reactionHostBridgePromise = null;

function loadReactionHostBridge() {
  if (_reactionHostBridge) {
    return Promise.resolve(_reactionHostBridge);
  }
  if (_reactionHostBridgePromise) return _reactionHostBridgePromise;
  _reactionHostBridgePromise = require
    .async(REACTION_HOST_BRIDGE)
    .then(function (mod) {
      _reactionHostBridge = mod || null;
      return _reactionHostBridge;
    })
    .catch(function (err) {
      _reactionHostBridgePromise = null;
      console.warn('[reaction] host bridge load failed', err);
      return null;
    });
  return _reactionHostBridgePromise;
}

/** 其它赛事领先榜逐洞广告默认图（交杯鲜啤演示单独走广告图片1） */
const DEFAULT_SCORECARD_AD_IMAGE =
  'https://images.unsplash.com/photo-1535131749006-b7f58c99034b?auto=format&fit=crop&w=900&q=85';

/* ===== 赛事详情页 match 视图对象（顶部信息区数据框架） ===== */
const MATCH_TYPE_LABELS = {
  'team-internal': '队内赛',
  'inter-team': '队际赛',
  series: '系列赛'
};

/** 报名内容高度与可视区比较时的容差（px），避免四舍五入误判溢出 */
const REGISTER_CONTENT_LOCK_EPS = 4;

/** 队际赛「参赛球队」卡片默认最多展示支数（仅 UI，不改 teamGroups） */
const PARTICIPATING_TEAMS_PREVIEW_LIMIT = 4;

/** 开发者工具会长期保留 console 参数对象；热路径默认关闭 */
const DETAIL_DEBUG_LOG = false;
function detailDebugLog() {
  if (!DETAIL_DEBUG_LOG) return;
  try {
    // 使用 bracket 形式，避免被批量替换成 detailDebugLog
    console['log'].apply(console, arguments);
  } catch (e) { /* ignore */ }
}

const WEEK_NAMES = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

const EMPTY_MATCH_VIEW = {
  matchId: '',
  status: '',
  statusLabel: '',
  cardStatusText: '',
  cardStatusTone: 'default',
  logo: '',
  bannerImage: '',
  dateText: '',
  titleMain: '',
  titleSub: '',
  formatLabel: '',
  typeLabel: '',
  organizer: '',
  // 英雄区底部主体类型标签（team-internal → CLUB；inter-team → ORG.；其余 → 赛事组织）
  organizerSectionLabel: '赛事组织',
  venue: '',
  timeText: '',
  priceTags: [],
  priceText: ''
};

/* ===== 赛事生命周期状态（teamMatchStore.match.status） ===== */
const MATCH_LIFECYCLE = {
  REGISTERING: 'registering',
  ONGOING: 'ongoing',
  COMPLETED: 'completed'
};

const EMPTY_MATCH_LIFECYCLE = {
  status: '',
  isRegistering: false,
  isOngoing: false,
  isCompleted: false
};

/* ===== TAB 配置（按生命周期，流内 TAB 与吸顶 TAB 共用唯一数据源） ===== */
const TOURNAMENT_TABS = {
  registering: [
    { id: 'details', label: '赛事信息' },
    { id: 'register', label: '报名' },
    { id: 'groups', label: '分组' },
    { id: 'discussion', label: '讨论区' }
  ],
  ongoing: [
    { id: 'details', label: '赛事信息' },
    { id: 'leaderboard', label: '领先榜' },
    { id: 'tee-sheet', label: '出发表' },
    { id: 'discussion', label: '讨论区' },
    { id: 'game', label: '大游戏' }
  ],
  completed: [
    { id: 'details', label: '赛事信息' },
    { id: 'leaderboard', label: '成绩表' },
    { id: 'tee-sheet', label: '出发表' },
    { id: 'discussion', label: '讨论区' },
    { id: 'game', label: '大游戏' }
  ]
};

/**
 * 球队赛家族 LIVE：在讨论区之后插入「报名」Tab（去重；不改其他 Tab 相对顺序）。
 * @param {Array<{id:string,label:string}>} tabs
 * @returns {Array<{id:string,label:string}>}
 */
function insertRegisterTabAfterDiscussion(tabs) {
  const list = (Array.isArray(tabs) ? tabs : []).filter(
    (t) => t && t.id !== 'register'
  );
  const registerTab = { id: 'register', label: '报名' };
  const discussionIdx = list.findIndex((t) => t && t.id === 'discussion');
  if (discussionIdx >= 0) {
    list.splice(discussionIdx + 1, 0, registerTab);
  } else {
    list.push(registerTab);
  }
  return list;
}

// 无 matchId / 未知状态时，沿用进行中 TAB 集，保持既有演示页视觉不变
// G5–G8 比洞：leaderboard TAB 文案统一为「得分榜」（ongoing「领先榜」/ completed「成绩表」均改；id/排序/点击不变）
// 球队赛家族（team-internal / inter-team）ongoing：保留报名 Tab，置于讨论区之后
// （registering 原顺序不变；series / 普通球局 / completed 不进入此逻辑）
function resolveTournamentTabs(status, match) {
  const base = TOURNAMENT_TABS[status] || TOURNAMENT_TABS.ongoing;
  let tabs = base.map((tab) => Object.assign({}, tab));
  if (isMatchPlayBoardMode(resolveGameMode(match))) {
    tabs.forEach((tab) => {
      if (
        tab &&
        tab.id === 'leaderboard' &&
        (tab.label === '领先榜' || tab.label === '成绩表')
      ) {
        tab.label = '得分榜';
      }
    });
  }
  if (status === MATCH_LIFECYCLE.ONGOING && isTeamMatchFamily(match)) {
    tabs = insertRegisterTabAfterDiscussion(tabs);
  }
  return tabs;
}

/**
 * UI 层：比洞 18 洞展示顺序（从 startHole 起环绕）。
 * 只生成洞号序列，不改 scores / scoreData / matchPlayMeta / 胜负计算。
 * @param {number} startHole 1–18，无效则按 1
 * @returns {number[]} 例 startHole=10 → [10..18,1..9]
 */
function buildMatchPlayHoleTimeline(startHole) {
  const n = Number(startHole);
  let start = 1;
  if (Number.isFinite(n)) {
    const h = Math.floor(n);
    if (h >= 1 && h <= 18) start = h;
  }
  const timeline = [];
  for (let i = 0; i < 18; i++) {
    timeline.push(((start - 1 + i) % 18) + 1);
  }
  return timeline;
}

/** actualHole 1–9 → A1–A9；10–18 → B1–B9（仅 HOLE 行文案） */
function formatMatchPlayDisplayHole(actualHole) {
  const h = Number(actualHole);
  if (!Number.isFinite(h) || h < 1 || h > 18) return '';
  if (h <= 9) return 'A' + h;
  return 'B' + (h - 9);
}

/**
 * UI 层列定义：displayHole（HOLE 行）+ actualHole（读成绩/PAR/胜负）
 * @returns {Array<{ displayHole: string, actualHole: number }>}
 */
function buildMatchPlayHoleTimelineColumns(startHole) {
  return buildMatchPlayHoleTimeline(startHole).map((actualHole) => ({
    displayHole: formatMatchPlayDisplayHole(actualHole),
    actualHole: actualHole
  }));
}

/**
 * G5–G8 得分榜 UI 演示数据（仅展示，禁止读 scoreData / leaderboard）
 * 结构对齐原型「比洞赛得分榜展示界面.html」TAB 以下区域
 */
function buildMockMatchPlayScoreboard() {
  const holeNums = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
  const holeLabelsDefault = holeNums.map((n) => formatMatchPlayDisplayHole(n));
  const pars = [4, 5, 4, 3, 4, 4, 4, 3, 4, 5, 4, 3, 4, 4, 4, 3, 4, 5];
  const mkDot = (n, result) => ({
    n: n,
    result: result || '',
    cls:
      result === 'A'
        ? 'mp-sb-dot--a'
        : result === 'B'
          ? 'mp-sb-dot--b'
          : result === 'AS'
            ? 'mp-sb-dot--as'
            : 'empty'
  });
  const mkStatus = (text, lead) => ({
    text: text === 'A/S' ? 'TIED' : text,
    cls:
      lead === 'A' ? 'mp-sb-st--up' : lead === 'B' ? 'mp-sb-st--dn' : lead === 'AS' ? 'mp-sb-st--as' : ''
  });
  const mkScore = (a, b, result) => {
    const pending = a == null && b == null;
    return {
      a: pending ? '-' : String(a),
      b: pending ? '-' : String(b),
      result: result || '',
      splitCls: pending
        ? 'mp-sb-split--pending'
        : result === 'A'
          ? 'mp-sb-split--a'
          : result === 'B'
            ? 'mp-sb-split--b'
            : result === 'AS'
              ? 'mp-sb-split--tie'
              : '',
      empty: false,
      pending: pending
    };
  };

  return {
    teamA: {
      name: '红队',
      score: 13,
      flagUrl: 'https://flagcdn.com/w40/cn.png'
    },
    teamB: {
      name: '蓝队',
      score: 15,
      flagUrl: 'https://flagcdn.com/w40/us.png'
    },
    progressAPercent: 46,
    finishedMatches: 2,
    totalMatches: 3,
    matchesCompleteText: '2/3 MATCHES COMPLETE',
    matches: [
      {
        id: 'mock-mp-1',
        expanded: false,
        winner: 'A',
        phaseLabel: 'FINAL',
        statusMain: '1',
        statusSub: 'UP',
        statusLeadClass: 'mp-sb-lead--a',
        statusLayerClass: 'winner-a',
        sideA: {
          kind: 'single',
          members: [
            {
              userId: 'mock-a1',
              displayName: 'Cameron Young',
              nickname: 'Cameron Young',
              name: 'Cameron Young',
              avatar: mockAvatars.avatarByIndex(0)
            }
          ]
        },
        sideB: {
          kind: 'single',
          members: [
            {
              userId: 'mock-b1',
              displayName: 'Justin Rose',
              nickname: 'Justin Rose',
              name: 'Justin Rose',
              avatar: mockAvatars.avatarByIndex(1)
            }
          ]
        },
        holeDots: [
          mkDot(1, 'A'), mkDot(2, 'AS'), mkDot(3, 'B'), mkDot(4, 'AS'),
          mkDot(5, 'B'), mkDot(6, 'A'), mkDot(7, 'A'), mkDot(8, 'AS'),
          mkDot(9, 'AS'), mkDot(10, 'A'), mkDot(11, 'AS'), mkDot(12, 'A'),
          mkDot(13, 'B'), mkDot(14, 'B'), mkDot(15, 'AS'), mkDot(16, 'B'),
          mkDot(17, 'AS'), mkDot(18, 'A')
        ],
        holeLabels: holeLabelsDefault.slice(),
        pars: pars.slice(),
        statusCells: [
          mkStatus('1UP', 'A'), mkStatus('1UP', 'A'), mkStatus('A/S', 'AS'),
          mkStatus('1UP', 'A'), mkStatus('1UP', 'A'), mkStatus('2UP', 'A'),
          mkStatus('3UP', 'A'), mkStatus('2UP', 'A'), mkStatus('A/S', 'AS'),
          mkStatus('1DN', 'B'), mkStatus('2DN', 'B'), mkStatus('A/S', 'AS'),
          mkStatus('1UP', 'A'), mkStatus('1UP', 'A'), mkStatus('1UP', 'A'),
          mkStatus('2UP', 'A'), mkStatus('1UP', 'A'), mkStatus('1UP', 'A')
        ],
        scoreCells: [
          mkScore(4, 5, 'A'), mkScore(5, 5, 'AS'), mkScore(5, 4, 'B'),
          mkScore(3, 4, 'A'), mkScore(4, 4, 'AS'), mkScore(4, 5, 'A'),
          mkScore(3, 4, 'A'), mkScore(4, 3, 'B'), mkScore(4, 4, 'AS'),
          mkScore(5, 4, 'B'), mkScore(5, 4, 'B'), mkScore(3, 4, 'A'),
          mkScore(4, 5, 'A'), mkScore(4, 3, 'B'), mkScore(4, 4, 'AS'),
          mkScore(3, 4, 'A'), mkScore(4, 4, 'AS'), mkScore(5, 4, 'A')
        ]
      },
      {
        id: 'mock-mp-2',
        expanded: false,
        winner: 'B',
        phaseLabel: 'FINAL',
        statusMain: '3',
        statusSub: '&2',
        statusLeadClass: 'mp-sb-lead--b',
        statusLayerClass: 'winner-b',
        sideA: {
          kind: 'pair',
          members: [
            {
              userId: 'mock-a2',
              displayName: '大雷',
              nickname: '大雷',
              name: '大雷',
              avatar: mockAvatars.avatarByIndex(2)
            },
            {
              userId: 'mock-a3',
              displayName: 'Alex',
              nickname: 'Alex',
              name: 'Alex',
              avatar: mockAvatars.avatarByIndex(3)
            }
          ]
        },
        sideB: {
          kind: 'pair',
          members: [
            {
              userId: 'mock-b2',
              displayName: 'Rahm',
              nickname: 'Rahm',
              name: 'Rahm',
              avatar: mockAvatars.avatarByIndex(4)
            },
            {
              userId: 'mock-b3',
              displayName: 'Scheffler',
              nickname: 'Scheffler',
              name: 'Scheffler',
              avatar: mockAvatars.avatarByIndex(5)
            }
          ]
        },
        holeDots: [
          mkDot(1, 'B'), mkDot(2, 'B'), mkDot(3, 'AS'), mkDot(4, 'B'),
          mkDot(5, 'A'), mkDot(6, 'B'), mkDot(7, 'B'), mkDot(8, 'AS'),
          mkDot(9, 'AS'), mkDot(10, 'B'), mkDot(11, 'B'), mkDot(12, 'B'),
          mkDot(13, 'A'), mkDot(14, 'B'), mkDot(15, 'B'), mkDot(16, 'B'),
          mkDot(17, ''), mkDot(18, '')
        ],
        holeLabels: holeLabelsDefault.slice(),
        pars: pars.slice(),
        statusCells: [
          mkStatus('1DN', 'B'), mkStatus('2DN', 'B'), mkStatus('2DN', 'B'),
          mkStatus('3DN', 'B'), mkStatus('2DN', 'B'), mkStatus('3DN', 'B'),
          mkStatus('4DN', 'B'), mkStatus('4DN', 'B'), mkStatus('4DN', 'B'),
          mkStatus('5DN', 'B'), mkStatus('6DN', 'B'), mkStatus('7DN', 'B'),
          mkStatus('6DN', 'B'), mkStatus('5DN', 'B'), mkStatus('4DN', 'B'),
          mkStatus('3DN', 'B'), mkStatus('-', ''), mkStatus('-', '')
        ],
        scoreCells: [
          mkScore(5, 4, 'B'), mkScore(6, 5, 'B'), mkScore(4, 4, 'AS'),
          mkScore(4, 3, 'B'), mkScore(4, 5, 'A'), mkScore(5, 4, 'B'),
          mkScore(5, 4, 'B'), mkScore(3, 3, 'AS'), mkScore(4, 4, 'AS'),
          mkScore(6, 5, 'B'), mkScore(5, 4, 'B'), mkScore(4, 3, 'B'),
          mkScore(3, 4, 'A'), mkScore(5, 4, 'B'), mkScore(5, 4, 'B'),
          mkScore(4, 3, 'B'), mkScore(null, null, ''), mkScore(null, null, '')
        ]
      },
      {
        id: 'mock-mp-3',
        expanded: false,
        winner: 'AS',
        phaseLabel: 'THRU 12',
        statusMain: 'TIED',
        statusSub: '',
        statusLeadClass: 'mp-sb-lead--as',
        statusLayerClass: 'all-square',
        sideA: {
          kind: 'single',
          members: [
            {
              userId: 'mock-a4',
              displayName: 'Brooks Koepka',
              nickname: 'Brooks Koepka',
              name: 'Brooks Koepka',
              avatar: mockAvatars.avatarByIndex(6)
            }
          ]
        },
        sideB: {
          kind: 'single',
          members: [
            {
              userId: 'mock-b4',
              displayName: 'Ludvig Aberg',
              nickname: 'Ludvig Aberg',
              name: 'Ludvig Aberg',
              avatar: mockAvatars.avatarByIndex(7)
            }
          ]
        },
        holeDots: holeNums.map((n) =>
          n <= 12 ? mkDot(n, n % 3 === 0 ? 'AS' : n % 2 === 0 ? 'B' : 'A') : mkDot(n, '')
        ),
        holeLabels: holeLabelsDefault.slice(),
        pars: pars.slice(),
        statusCells: holeNums.map((n) =>
          n <= 12 ? mkStatus(n % 4 === 0 ? 'A/S' : '1UP', n % 4 === 0 ? 'AS' : 'A') : mkStatus('-', '')
        ),
        scoreCells: holeNums.map((n) =>
          n <= 12
            ? mkScore(4, n % 2 === 0 ? 5 : 4, n % 3 === 0 ? 'AS' : n % 2 === 0 ? 'A' : 'B')
            : mkScore(null, null, '')
        )
      }
    ]
  };
}

/* ===== 讨论区 ===== */
const WATCHERS = [
  { name: 'Alex', avatar: mockAvatars.pickMockAvatar('Alex') },
  { name: 'TigerHoods', avatar: mockAvatars.pickMockAvatar('TigerHoods') },
  { name: 'yan72', avatar: mockAvatars.pickMockAvatar('yan72') },
  { name: '大雷', avatar: mockAvatars.pickMockAvatar('大雷') },
  { name: '邵亮', avatar: mockAvatars.pickMockAvatar('邵亮') },
  { name: '郝军峰', avatar: mockAvatars.pickMockAvatar('郝军峰') },
  { name: '大吉', avatar: mockAvatars.pickMockAvatar('大吉') },
  { name: 'Alexander', avatar: mockAvatars.pickMockAvatar('Alexander') }
];
const CHAT = [
  {
    self: false,
    userId: 'chat-alex',
    name: 'Alex',
    avatar: mockAvatars.pickMockAvatar('Alex'),
    text: '今天风不小，后九洞可能要多看一杆。',
    mention: ''
  },
  {
    self: true,
    userId: 'me',
    name: '我',
    avatar: mockAvatars.pickMockAvatar('我'),
    text: '收到，我在出发表看一下同组开球时间。',
    mention: '@Alex'
  },
  {
    self: false,
    userId: 'chat-yan72',
    name: 'yan72',
    avatar: mockAvatars.pickMockAvatar('yan72'),
    text: '领先榜刚刷新，TigerHoods 已经到 -7 了。',
    mention: ''
  }
];

/* ===== 更多功能面板（共享生成器 teamMatchMoreMenu；默认单场行为不变） ===== */
const FEATURES_COMMON = teamMatchMoreMenu.FEATURES_COMMON;
const FEATURES_VIEW_PERMISSION_SET = teamMatchMoreMenu.FEATURES_VIEW_PERMISSION_SET;
const FEATURES_PERMISSION = teamMatchMoreMenu.FEATURES_PERMISSION;
const REGISTERING_FEATURES_COMMON = teamMatchMoreMenu.REGISTERING_FEATURES_COMMON;
const REGISTERING_FEATURES_PERMISSION = teamMatchMoreMenu.REGISTERING_FEATURES_PERMISSION;
const FEATURES_PERMISSION_FOOTER_KEYS = teamMatchMoreMenu.FEATURES_PERMISSION_FOOTER_KEYS;
const FEATURE_SECTION_DEFAULT = teamMatchMoreMenu.FEATURE_SECTION_DEFAULT;
const FEATURE_SECTION_REGISTERING = teamMatchMoreMenu.FEATURE_SECTION_REGISTERING;
const resolveOngoingCommonFeatures = teamMatchMoreMenu.resolveOngoingCommonFeatures;
const splitPermissionFeatures = teamMatchMoreMenu.splitPermissionFeatures;

/** 替他人报名：人员来源（player-source-sheet；无老牌组合） */
const REGISTER_FOR_OTHER_SOURCE_OPTIONS = [
  { key: 'friends', glyph: '👥', label: '从好友列表选择', desc: '选择微信好友或历史联系人' },
  {
    key: 'team_members',
    glyph: '🏌️',
    label: '从球队成员列表选择',
    desc: '选择本赛事参赛球队成员',
    disabled: true,
    locked: true
  },
  { key: 'manual', glyph: '✏️', label: '手工添加', desc: '输入姓名和手机号添加人员' }
];
const REGISTER_FOR_OTHER_TEAM_MEMBERS_DENIED_TOAST = '仅赛事管理员或参赛球队成员可使用';

/** 队际赛：当前用户所属参赛球队的 sourceTeamId 列表（teamDirectory.isMine） */
function resolveMineParticipatingSourceTeamIds(match) {
  const groups = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
  const ids = [];
  const seen = {};
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const sourceTeamId =
      g && g.sourceTeamId != null ? String(g.sourceTeamId).trim() : '';
    if (!sourceTeamId || seen[sourceTeamId]) continue;
    const team = teamDirectory.getTeamById(sourceTeamId);
    if (team && team.isMine) {
      seen[sourceTeamId] = true;
      ids.push(sourceTeamId);
    }
  }
  return ids;
}

/**
 * 当前用户是否属于本赛事参赛球队（teamDirectory mock：isMine 表示我的球队）
 * - 队际赛：任一参赛 club（teamGroups.sourceTeamId）isMine
 * - 队内赛：match.teamId isMine
 */
function resolveIsEventTeamMember(match) {
  if (!match) return false;
  if (isInterTeamMatch(match)) {
    return resolveMineParticipatingSourceTeamIds(match).length > 0;
  }
  const teamId = match.teamId ? String(match.teamId).trim() : '';
  if (!teamId) return false;
  const team = teamDirectory.getTeamById(teamId);
  return !!(team && team.isMine);
}

/**
 * 报名弹窗默认分组：
 * - 队际赛：恰好一个 teamGroups 项的 sourceTeamId 属于我的球队时默认选中，否则空
 * - 队内赛：首个 subTab（与旧行为一致）
 */
function resolveDefaultRegisterGroupId(match, registerSubTabs) {
  const tabs = Array.isArray(registerSubTabs) ? registerSubTabs : [];
  if (isInterTeamMatch(match)) {
    const groups = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
    const mineGroups = [];
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const sourceTeamId =
        g && g.sourceTeamId != null ? String(g.sourceTeamId).trim() : '';
      if (!sourceTeamId) continue;
      const team = teamDirectory.getTeamById(sourceTeamId);
      if (team && team.isMine) mineGroups.push(g);
    }
    if (mineGroups.length !== 1) return '';
    const gid =
      mineGroups[0] && mineGroups[0].id != null
        ? String(mineGroups[0].id)
        : '';
    if (!gid) return '';
    if (tabs.length && !tabs.some((t) => String(t.id) === gid)) return '';
    return gid;
  }
  return tabs.length ? tabs[0].id : '';
}

/** 队际赛展示用「球队」，队内赛保持「分队」 */
function sideUnitLabel(match) {
  return isInterTeamMatch(match) ? '球队' : '分队';
}

function unnamedSideLabel(match) {
  return '未命名' + sideUnitLabel(match);
}

/** 兼容旧引用：真实权限由 matchManageAccess.resolveMatchManageAccess 按赛事动态计算 */
const MORE_ACCESS = {
  isPrivilegedUser: false,
  permissions: matchManageAccess.PRIVILEGED_BASE_PERMISSIONS.slice()
};

function resolveMoreAccessForMatch(match) {
  const user = gameStore.getCurrentUser() || {};
  return matchManageAccess.resolveMatchManageAccess(match, user);
}

/** Patch 7：是否可使用「球队成员列表」代报名渠道 */
function resolveCanUseTeamMembersChannel(match) {
  if (resolveIsEventTeamMember(match)) return true;
  const access = resolveMoreAccessForMatch(match);
  if (access && access.isPrivilegedUser) return true;
  return false;
}
const GROUPS_TAB_PLAYER_SLOTS = 4;

function createEmptyGroupPlayer(position) {
  return { position: position, userId: '' };
}

/**
 * Patch-02C3A / G5 Phase1-C / G6–G8 Phase1-A：进记分页 mode 分流
 * 1) gameMode=个人比杆赛 / 个人比洞赛 / G6/G7/G8 比洞 → individual_stroke（同级优先，避免残留 scoreEntities）
 * 2) scoreEntities[groupId] 非空 → stroke_entity
 * 3) gameMode 为 G2/G3/G4 比杆 → stroke_entity
 * 4) 否则 individual_stroke
 */
function resolveTournamentScorePageMode(match, groupId) {
  return teamMatchEnterGroupScore.resolveTeamMatchScorePageMode(match, groupId);
}

/** 只读展示用：从正式 groups 规范化克隆（详情页不持有 groupDraft；正式位只保留 userId/position） */
function cloneTournamentGroups(list) {
  if (!Array.isArray(list)) return [];
  return list.map((g, index) => {
    const out = {
      groupId: g && g.groupId != null ? String(g.groupId) : ('group-tab-' + Date.now() + '-' + (index + 1)),
      groupName: g && g.groupName ? String(g.groupName) : ('第' + (index + 1) + '组'),
      players: Array.from({ length: GROUPS_TAB_PLAYER_SLOTS }, (_, i) => {
        const position = i + 1;
        const found = Array.isArray(g && g.players)
          ? g.players.find((p) => {
            if (!p) return false;
            const pos = Number(p.position != null ? p.position : p.slotIndex);
            return pos === position;
          })
          : null;
        const userId = found
          ? String(found.userId || found.playerId || found.id || '').trim()
          : '';
        if (!userId) return createEmptyGroupPlayer(position);
        return {
          position: position,
          userId: userId
        };
      })
    };
    // 保留组级出发信息，供分组 TAB / 出发表回显
    const teeTime = teeSheetManage.resolveGroupTeeTime(g);
    const startHole = teeSheetManage.resolveGroupStartHole(g);
    if (teeTime) out.teeTime = teeTime;
    if (startHole != null) out.startHole = startHole;
    return out;
  });
}
const FAB_HIDE_MARGIN_RPX = 16;
const FAB_SIZE_RPX = 60;
const FAB_EDGE_GAP_RPX = 10;

function isPositiveFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** 赛事详情窗口宽高：优先 getWindowInfo，按字段回退 getSystemInfoSync；缺失为 null */
function readTournamentDetailWindowSize() {
  let width;
  let height;
  let modernComplete = false;
  try {
    if (typeof wx !== 'undefined' && typeof wx.getWindowInfo === 'function') {
      const info = wx.getWindowInfo();
      if (info) {
        if (isPositiveFiniteNumber(info.windowWidth)) width = info.windowWidth;
        if (isPositiveFiniteNumber(info.windowHeight)) height = info.windowHeight;
      }
      modernComplete = isPositiveFiniteNumber(width) && isPositiveFiniteNumber(height);
    }
  } catch (err) {
    modernComplete = false;
  }
  if (!modernComplete) {
    try {
      if (typeof wx !== 'undefined' && typeof wx.getSystemInfoSync === 'function') {
        const sys = wx.getSystemInfoSync();
        if (sys) {
          if (!isPositiveFiniteNumber(width) && isPositiveFiniteNumber(sys.windowWidth)) {
            width = sys.windowWidth;
          }
          if (!isPositiveFiniteNumber(height) && isPositiveFiniteNumber(sys.windowHeight)) {
            height = sys.windowHeight;
          }
        }
      }
    } catch (err2) {
      /* 保持已有有效字段 */
    }
  }
  return {
    windowWidth: isPositiveFiniteNumber(width) ? width : null,
    windowHeight: isPositiveFiniteNumber(height) ? height : null
  };
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function pickTournamentDetailLayoutFields(info, current) {
  const next = current || {};
  if (!info) return next;
  if (!isPositiveFiniteNumber(next.windowWidth) && isPositiveFiniteNumber(info.windowWidth)) {
    next.windowWidth = info.windowWidth;
  }
  if (!isPositiveFiniteNumber(next.windowHeight) && isPositiveFiniteNumber(info.windowHeight)) {
    next.windowHeight = info.windowHeight;
  }
  if (!isPositiveFiniteNumber(next.screenHeight) && isPositiveFiniteNumber(info.screenHeight)) {
    next.screenHeight = info.screenHeight;
  }
  const bottom = info.safeArea && info.safeArea.bottom;
  if (!isFiniteNumber(next.safeAreaBottom) && isFiniteNumber(bottom)) {
    next.safeAreaBottom = bottom;
    next.safeArea = info.safeArea;
  }
  return next;
}

function isTournamentDetailLayoutComplete(cur) {
  return (
    isPositiveFiniteNumber(cur.windowWidth) &&
    isPositiveFiniteNumber(cur.windowHeight) &&
    isPositiveFiniteNumber(cur.screenHeight) &&
    isFiniteNumber(cur.safeAreaBottom)
  );
}

/** 报名/分组高度：窗口 + safeArea，优先 getWindowInfo，按字段回退 getSystemInfoSync */
function readTournamentDetailSafeAreaLayout() {
  let cur = {};
  try {
    if (typeof wx !== 'undefined' && typeof wx.getWindowInfo === 'function') {
      cur = pickTournamentDetailLayoutFields(wx.getWindowInfo(), cur);
    }
  } catch (err) {
    /* 回退 getSystemInfoSync */
  }
  if (!isTournamentDetailLayoutComplete(cur)) {
    try {
      if (typeof wx !== 'undefined' && typeof wx.getSystemInfoSync === 'function') {
        cur = pickTournamentDetailLayoutFields(wx.getSystemInfoSync(), cur);
      }
    } catch (err2) {
      /* 保持已有有效字段 / 默认值 */
    }
  }
  const windowWidth = isPositiveFiniteNumber(cur.windowWidth) ? cur.windowWidth : 375;
  const windowHeight = isPositiveFiniteNumber(cur.windowHeight) ? cur.windowHeight : 667;
  let safeBottom = 0;
  if (isPositiveFiniteNumber(cur.screenHeight) && isFiniteNumber(cur.safeAreaBottom)) {
    safeBottom = Math.max(0, cur.screenHeight - cur.safeAreaBottom);
  }
  return {
    windowWidth: windowWidth,
    windowHeight: windowHeight,
    screenHeight: isPositiveFiniteNumber(cur.screenHeight) ? cur.screenHeight : null,
    safeArea: cur.safeArea || null,
    safeBottom: safeBottom
  };
}

const DEFAULT_REGISTER_GROUPS = [
  { id: 'team-group-1', name: '正式队员' },
  { id: 'team-group-2', name: '嘉宾' }
];

const EMPTY_REGISTER_INFO = {
  totalCount: 0,
  users: []
};

const EMPTY_CURRENT_USER_REGISTER_STATUS = {
  isRegistered: false,
  groupId: '',
  groupName: ''
};

const EMPTY_REGISTER_PERMISSION = {
  registrationStatus: 'closed',
  isOpen: false,
  reason: ''
};

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: 'min-height:92px;height:92px;background-color:#002D62;border-bottom:2px solid var(--champion-gold);box-sizing:border-box;flex-shrink:0;',
    headerBarStyle: 'padding-top:52px;padding-right:96px;padding-bottom:16px;padding-left:16px;min-height:92px;box-sizing:border-box;display:flex;align-items:center;',
    headerTotalHeight: 92,
    // scroll-aware sticky state（位置仅由滚动驱动）
    scrollYState: 0,
    isStickyTab: false,
    tabOffsetTop: 0,
    tabBarHeight: 50,
    isStickyWatchers: false,
    watchersOffsetTop: 0,
    stickyWatchersTop: 142,
    isStickyRegisterExt: false,
    registerExtOffsetTop: 0,
    stickyRegisterExtTop: 142,
    // G5–G8 得分榜摘要：二级 sticky（紧贴 TAB 下方）
    isStickyMpSbSummary: false,
    mpSbSummaryOffsetTop: 0,
    stickyMpSbSummaryTop: 142,
    tabShowLeftIndicator: false,
    tabShowRightIndicator: false,
    tabHScrollLeft: 0,
    /** 横向 Tab 滚入可视：流内 / 吸顶各用独立 id，避免页面重复 id */
    tabScrollIntoViewInflow: '',
    tabScrollIntoViewFixed: '',
    contentSpacerHeight: 0,
    detailMainMinHeight: 0,
    scrollToTopView: '',
    // 报名 TAB：吸顶后按「内容高度是否超出可视区」锁定，不按人数
    registrationContentLocked: false,
    registrationStickySpacerHeight: 0,
    registerContentHeight: 0,
    availableRegisterViewportHeight: 0,
    detailScrollTop: 0,

    activeTab: 'details',
    // TAB 列表（流内 + 吸顶共用；默认进行中集合，loadMatch 后按状态重建）
    tabs: TOURNAMENT_TABS.ongoing,

    // 顶部赛事信息（来自 teamMatchStore，非硬编码）
    matchId: '',
    hostSnapshot: {},
    match: EMPTY_MATCH_VIEW,
    matchStatus: EMPTY_MATCH_LIFECYCLE,
    eventInfoList: [],
    isInterTeamMatch: false,
    /**
     * 领先榜展开头像角标：none=队内赛不显示国旗；team=队际赛本场球队 LOGO；auto=兼容其他
     */
    leaderboardAvatarBadge: 'auto',
    /**
     * 领先榜展开辅助信息：handicapFloat=江湖差点/浮动系数；countryAge=COUNTRY/AGE
     * 球队赛家族（team-internal / inter-team）→ handicapFloat
     */
    leaderboardMetaMode: 'countryAge',
    /** 球队赛家族展开昵称行显示性别符号；普通球局/系列赛 false */
    leaderboardShowExpandGender: false,
    /** 领先榜关注：球队赛家族启用；复用通讯录 contactFollowAction */
    leaderboardFollowEnabled: false,
    currentUserId: '',
    followMap: {},
    /** none | following | friend */
    relationMap: {},
    /** playerId → 好友 | 已关注 */
    relationLabelMap: {},
    /** playerId → 是否本人（隐藏加关注） */
    leaderboardSelfMap: {},
    /** playerId → 可关注（稳定 id 且非本人） */
    leaderboardFollowableMap: {},
    /** playerId → 关注请求中 */
    followLoadingMap: {},
    /** playerId → 可进入资料页（稳定 userId，含本人） */
    leaderboardProfileEntryMap: {},
    visibleParticipatingTeams: [],
    showParticipatingTeamsMore: false,
    participatingTeamsExpanded: false,
    /** 队际赛角标 LOGO 页级 map（避免复制到每个榜单行） */
    teamGroupLogoById: {},
    registerSideLabel: '分队',
    registerSheetGroupLabel: '报名分组',
    proxyGroupSheetTitle: '选择报名分队',
    proxyGroupSheetSub: '本次选择的选手将统一报名到同一个分队',
    proxyRegistrationFieldLabel: '报名分队',

    // 报名 TAB（结构占位，暂无报名业务）
    registerInfo: EMPTY_REGISTER_INFO,
    registerTotalCount: 0,
    registerSubTabs: [],
    activeRegisterSubTab: '',
    registerDisplayUsers: [],
    currentUserRegisterStatus: EMPTY_CURRENT_USER_REGISTER_STATUS,
    registerPermission: Object.assign({}, EMPTY_REGISTER_PERMISSION),
    /** 报名 Tab 底部 CTA：报名中；队际赛 LIVE 亦显示（复用原报名流程） */
    showRegisterTabCTA: false,
    // 底部 CTA 显隐（报名「立即报名」与分组「开始/修改分组」共用）：
    // 主 TAB 距屏幕底部 <=100px 时隐藏
    hideRegisterCTA: false,
    // 报名名单卡片动态高度（px，随设备/尺寸计算；0 表示尚未计算，样式回退）
    rosterMinHeight: 0,
    // 分组 TAB 内容区动态高度（px，随设备/尺寸计算）
    groupsPanelMinHeight: 0,
    // 分组 TAB：仅展示正式 groups（编辑在 group-editor 独立页完成）
    groups: [],
    groupsTabCards: [],
    hasFormalGroups: false,
    groupsBottomCtaLabel: teamMatchBottomCta.START_GROUPS_LABEL,
    canManageGroups: false,
    teeSheetBottomCta: teamMatchBottomCta.emptyCta(),
    // 报名但未进入正式分组：未安排出场（展示用，不阻止操作）
    unscheduledPlayerCount: 0,
    showGroupPairings: false,
    // 报名弹窗（立即报名流程：分组选择 + 比赛名 + 手机号）
    registerSheetVisible: false,
    registerCompetitionNameDraft: '',
    registerGenderDraft: '',
    registerSheetGroupId: '',
    registerPhone: '',
    registerSubmitting: false,
    registerCtaCopy: REG_CTA_COPY,
    registerCancelModalVisible: false,
    registerCancelSubmitting: false,
    registerCancelModalTitle: REG_SELF_CANCEL_UNGROUPED.title,
    registerCancelModalDesc: REG_SELF_CANCEL_UNGROUPED.desc,
    registerCancelModalCancelText: REG_SELF_CANCEL_UNGROUPED.cancelText,
    registerCancelModalConfirmText: REG_SELF_CANCEL_UNGROUPED.confirmText,
    // 权限管理（共享组件 temp-admin-permission-sheet）
    tempAdminSheetVisible: false,
    // 二维码入口：手机号绑定闸门
    phoneBindSheetVisible: false,
    phoneBindEntryType: 'admin_qr',
    phoneBindHint: '',
    // 选手管理（共享组件 match-player-management-sheet）
    playerManageSheetVisible: false,
    // 收费管理（共享组件 match-payment-management-sheet）
    showPaymentSheet: false,
    // 出发管理（共享组件 match-tee-management-sheet）
    teeSheetManageSheetVisible: false,

    // 领先榜
    scoringDisplay: 'strokeDiff', // gross | strokeDiff
    scorePanel: 'technical', // technical | quick
    fontScale: 'normal', // normal | large（显示设置：字体大小）
    fontScaleClass: 'font-normal',
    /** G5–G8：得分榜 UI 开关（仅展示 mock，不读真实成绩） */
    isMatchPlayScoreboard: false,
    matchPlayScoreboard: null,
    leaderboard: [],
    leaderboardDefaultMode: 'player', // player | team，仅表示默认展示倾向
    leaderboardMode: 'player', // player | team，当前页面展示模式
    leaderboardDefaultView: 'all', // all | team，可扩展查看方式的默认值
    leaderboardView: 'all', // all | team，当前查看方式
    leaderboardViewOptions: ['all'],
    leaderboardTeamViewAvailable: false,
    leaderboardTeamCompetitionEnabled: false,
    showLeaderboardTeamColumn: false,
    leaderboardScoreType: 'gross', // gross | net（净杆读 peoriaResult）
    leaderboardViewLabel: '总杆 · 全部',
    leaderboardNetScoreAvailable: false,
    showLeaderboardSettingSheet: false,
    leaderboardSettingSections: [],
    leaderboardSettingDraftValues: {},
    draftLeaderboardView: 'all',
    draftLeaderboardScoreType: 'gross',
    teamLeaderboard: [],
    expandedTeamId: '',
    openIndex: -1,
    // 逐洞详情：跟随记分页记忆的显示偏好（gross | diff），不自维护模式
    scoreDisplayMode: 'gross',
    openScorecard: null,
    courseName: 'COURSE', // 逐洞详情标题：当前球场名称（来自 groupsStore，单一数据源）
    scorecardCourseTitle: '',
    // 领先榜逐洞面板下方广告（交杯鲜啤演示按主题切广告图片1）
    scorecardAdImage: DEFAULT_SCORECARD_AD_IMAGE,

    teeGroups: [],
    // 快捷入口按钮显隐：仅当"第一组卡片完全进入视口"时为 true（基于 IntersectionObserver，非 TAB 状态/非固定常驻）
    quickEntryVisible: false,
    watchers: WATCHERS.slice(0, 5),
    allWatchers: WATCHERS,
    // 讨论区聊天数据：传入统一 discussion 组件（聊天/输入/表情逻辑全部由组件承载）
    chat: CHAT,

    // 讨论区头像互动中央弹窗（主包轻量；打开不下载 reaction）
    playerActionSheetVisible: false,
    playerActionTarget: null,
    playerActionReactions: reactionPanelConfig.PLAYER_ACTION_REACTIONS,
    reactionOverlayMounted: false,
    reactionPackLoading: false,
    /** 讨论区 reaction self：按消息 index 隐藏被作用头像（占位） */
    discussionReactionDetachedIndex: -1,
    discussionReactionDetachedUserId: '',

    partnerConfig: partnerConfigUtil.createDefaultPartnerConfig('GOLF BROTHERS'),
    partnerLogoRows: [],

    // 弹层
    showMoreSheet: false,
    moreFabExpanded: false,
    moreFabDragging: false,
    moreFabHitTarget: false,
    fabStyle: '',
    fabTopPx: 0,
    showStyleSheet: false,
    halfSheetVisible: false,
    showWatchers: false,
    featuresCommon: [],
    featuresPermission: [],
    featuresPermissionFooterPad: [],
    featuresPermissionFooter: [],
    lifecycleActions: [],
    featuresSectionCommonMain: FEATURE_SECTION_DEFAULT.commonMain,
    featuresSectionCommonSub: FEATURE_SECTION_DEFAULT.commonSub,
    featuresSectionPermissionMain: FEATURE_SECTION_DEFAULT.permissionMain,
    featuresSectionPermissionSub: FEATURE_SECTION_DEFAULT.permissionSub,
    registerForOtherSheetVisible: false,
    registerForOtherSourceOptions: REGISTER_FOR_OTHER_SOURCE_OPTIONS.slice(),
    // 替他人报名 · 手工添加弹窗（仅 UI / console，不写 registerInfo）
    registerForOtherManualVisible: false,
    registerForOtherManualName: '',
    registerForOtherManualPhone: '',
    registerForOtherManualGender: 'male',
    // Patch 3：代报名待确认人员 + 报名球队/分队选择弹窗（不写盘）
    pendingProxyPlayers: [],
    proxyGroupSheetVisible: false,
    proxyGroupOptions: [],
    proxyGroupId: '',
    /** 队际赛·球队成员渠道：成员来源（筛选用，非报名归属） */
    proxyMemberSourceDisplayName: '',
    proxyMemberSourceSheetVisible: false,
    proxyMemberSourceOptions: [],
    proxyMemberSourceGroupId: ''
  },

  onLoad(options) {
    const matchId = options && options.matchId ? decodeURIComponent(options.matchId) : '';
    const caddieToken =
      options && options.caddieToken ? decodeURIComponent(String(options.caddieToken)) : '';
    const adminToken =
      options && options.adminToken ? decodeURIComponent(String(options.adminToken)) : '';
    // Series 适配深链：仅 fromSeries=1 时打开指定 sheet；默认单场行为不变
    const fromSeries =
      options &&
      (options.fromSeries === '1' || options.fromSeries === 1 || options.fromSeries === true);
    const openSheetRaw =
      fromSeries && options && options.openSheet != null
        ? String(options.openSheet).trim()
        : '';
    this._seriesOpenSheet =
      openSheetRaw === 'payment' ||
      openSheetRaw === 'players' ||
      openSheetRaw === 'temp_admin' ||
      openSheetRaw === 'half'
        ? openSheetRaw
        : '';
    // 安全展示 TAB：仅白名单 id，且须落在本场 resolveTournamentTabs 内；不授予权限
    const rawTab = options && (options.activeTab || options.tab)
      ? String(options.activeTab || options.tab).trim()
      : '';
    this._preferredActiveTab =
      rawTab === 'leaderboard' || rawTab === '得分榜' ? 'leaderboard' : '';
    this._pendingReactionPlay = null;
    this._activeReactionTarget = null;
    this._activeReactionKey = '';
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    this._syncFontScale();
    groupsStore.ensureInitialized();
    this._syncTournamentHoleLayout();
    this.setData({ courseName: groupsStore.getCourseName() });
    this.loadScoreDisplayMode();
    this.refreshGroupsDerived();
    this.applyMoreAccess();
    this.refreshPartnerSection();
    this.loadMatch(matchId);
    if (caddieToken && matchId) {
      wx.nextTick(() => this._tryClaimCaddieScoringAccess(caddieToken));
    }
    if (adminToken && matchId) {
      wx.nextTick(() => this._tryClaimTempAdminAccess(adminToken));
    }
    if (this._seriesOpenSheet && matchId) {
      const sheet = this._seriesOpenSheet;
      this._seriesOpenSheet = '';
      wx.nextTick(() => this._openSeriesDeepLinkSheet(sheet));
    }
  },

  /** Series 受控深链：打开单场 sheet，不打开 M 面板 */
  _openSeriesDeepLinkSheet(sheet) {
    if (sheet === 'payment') {
      this.openPaymentSheet();
      return;
    }
    if (sheet === 'players') {
      this.openPlayerManageSheet();
      return;
    }
    if (sheet === 'temp_admin') {
      this.openTempAdminSheet();
      return;
    }
    if (sheet === 'half') {
      this.setData({ halfSheetVisible: true });
    }
  },

  /** 临时管理员扫码进入：先过注册/手机号闸门，再写入 pending */
  _tryClaimTempAdminAccess(token) {
    this._beginQrAccessClaim('admin_qr', token);
  },

  /** 球童扫码进入：先过注册/手机号闸门，再写入 manage_scoring */
  _tryClaimCaddieScoringAccess(token) {
    this._beginQrAccessClaim('caddie_qr', token);
  },

  _beginQrAccessClaim(entryType, token) {
    const type = entryType === 'caddie_qr' ? 'caddie_qr' : 'admin_qr';
    const tok = String(token || '').trim();
    if (!tok) return;
    this._pendingQrClaim = { entryType: type, token: tok };
    const gate = qrAccessAuth.ensureRegisteredAndPhoneBound(type);
    if (gate.ok) {
      this._executePendingQrClaim(gate.user);
      return;
    }
    const copy = gate.copy || qrAccessAuth.getCopy(type);
    if (gate.reason === 'need_login') {
      wx.showModal({
        title: copy.needLoginTitle,
        content: copy.needLoginContent,
        cancelText: '取消',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) this._openPhoneBindForQrClaim(type);
          else this._cancelPendingQrClaim(type);
        }
      });
      return;
    }
    wx.showModal({
      title: copy.needPhoneTitle,
      content: copy.needPhoneContent,
      cancelText: '取消',
      confirmText: '去绑定',
      success: (res) => {
        if (res.confirm) this._openPhoneBindForQrClaim(type);
        else this._cancelPendingQrClaim(type);
      }
    });
  },

  _openPhoneBindForQrClaim(entryType) {
    const type = entryType === 'caddie_qr' ? 'caddie_qr' : 'admin_qr';
    const copy = qrAccessAuth.getCopy(type);
    this.setData({
      phoneBindSheetVisible: true,
      phoneBindEntryType: type,
      phoneBindHint: copy.needPhoneContent
    });
  },

  _cancelPendingQrClaim(entryType) {
    const type =
      entryType ||
      (this._pendingQrClaim && this._pendingQrClaim.entryType) ||
      'admin_qr';
    this._pendingQrClaim = null;
    this.setData({ phoneBindSheetVisible: false });
    const copy = qrAccessAuth.getCopy(type);
    wx.showToast({ title: copy.cancelToast, icon: 'none', duration: 2500 });
  },

  onPhoneBindSheetCancel() {
    this._cancelPendingQrClaim(this.data.phoneBindEntryType);
  },

  onPhoneBindSheetSuccess() {
    this.setData({ phoneBindSheetVisible: false });
    const pending = this._pendingQrClaim;
    if (!pending || !pending.token) return;
    const gate = qrAccessAuth.ensureRegisteredAndPhoneBound(pending.entryType);
    if (!gate.ok) {
      this._cancelPendingQrClaim(pending.entryType);
      return;
    }
    this._executePendingQrClaim(gate.user);
  },

  _executePendingQrClaim(profile) {
    const pending = this._pendingQrClaim;
    this._pendingQrClaim = null;
    if (!pending || !pending.token) return;
    if (pending.entryType === 'caddie_qr') {
      this._claimCaddieAfterAuth(pending.token, profile);
    } else {
      this._claimAdminAfterAuth(pending.token, profile);
    }
  },

  /** 权限弹窗打开时优先用组件冻结的 matchId，避免页面 matchId 漂移写错场 */
  _resolveTempAdminClaimMatchId(preferDetailMatchId) {
    const fromDetail =
      preferDetailMatchId != null ? String(preferDetailMatchId || '').trim() : '';
    if (this.data.tempAdminSheetVisible) {
      const sheet = this.selectComponent('#tempAdminPermissionSheet');
      const frozen =
        sheet && sheet._targetMatchId != null
          ? String(sheet._targetMatchId || '').trim()
          : '';
      if (frozen) return frozen;
    }
    return fromDetail || String(this.data.matchId || '').trim();
  },

  _refreshTempAdminSheetAfterClaim(payload) {
    if (!this.data.tempAdminSheetVisible) return;
    const sheet = this.selectComponent('#tempAdminPermissionSheet');
    if (sheet && typeof sheet.refreshAfterAuthClaim === 'function') {
      sheet.refreshAfterAuthClaim(payload || {});
    }
  },

  _claimAdminAfterAuth(token, profile) {
    const matchId = this._resolveTempAdminClaimMatchId();
    if (!matchId || demoJiaobeiMatch.isJiaobeiDemoMatchId(matchId)) return;
    const match = teamMatchStore.getMatchById(matchId);
    if (!match) return;
    const user = profile || qrAccessAuth.buildClaimProfile('admin_qr');
    if (!user.userId || !user.phone) return;
    const result = tempAdminAccess.claimTempAdminAccess(match, token, user.userId, user);
    if (!result || !result.ok) {
      if (result && result.reason === 'invalid_token') {
        wx.showToast({ title: '二维码无效或已失效', icon: 'none' });
      } else if (result && result.reason === 'no_phone') {
        wx.showToast({ title: '未绑定手机号，无法申请临时管理员权限', icon: 'none' });
      }
      return;
    }
    teamMatchStore.saveMatch(match);
    this._refreshTempAdminSheetAfterClaim({ kind: 'admin', admin: result.admin });
    wx.showToast({
      title: '已提交管理员申请，请等待管理员授权',
      icon: 'none',
      duration: 2500
    });
  },

  _claimCaddieAfterAuth(token, profile) {
    const matchId = this._resolveTempAdminClaimMatchId();
    if (!matchId || demoJiaobeiMatch.isJiaobeiDemoMatchId(matchId)) return;
    const match = teamMatchStore.getMatchById(matchId);
    if (!match) return;
    const user = profile || qrAccessAuth.buildClaimProfile('caddie_qr');
    if (!user.userId || !user.phone) return;
    const result = caddieScoringAccess.claimCaddieScoringAccess(
      match,
      token,
      user.userId,
      user
    );
    if (!result || !result.ok) {
      if (result && result.reason === 'invalid_token') {
        wx.showToast({ title: '二维码无效或已失效', icon: 'none' });
      } else if (result && result.reason === 'no_phone') {
        wx.showToast({ title: '未绑定手机号，无法获得记分权限', icon: 'none' });
      }
      return;
    }
    teamMatchStore.saveMatch(match);
    this._refreshTempAdminSheetAfterClaim({ kind: 'caddie' });
    wx.showToast({
      title: result.already ? '已拥有本场记分权限' : '已获得本场记分权限',
      icon: 'success'
    });
  },

  /** 开发态：模拟扫码申请（同样走手机号闸门） */
  mockScanAdminQr(e) {
    const matchId = this._resolveTempAdminClaimMatchId(
      e && e.detail ? e.detail.matchId : ''
    );
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    const access = tempAdminAccess.normalizeTempAdminAccess(
      match && match.tempAdminAccess
    );
    if (!access || !access.token) {
      wx.showToast({ title: '请先生成临时管理员二维码', icon: 'none' });
      return;
    }
    this._tryClaimTempAdminAccess(access.token);
  },

  mockScanCaddieQr(e) {
    const matchId = this._resolveTempAdminClaimMatchId(
      e && e.detail ? e.detail.matchId : ''
    );
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    const access = caddieScoringAccess.normalizeCaddieScoringAccess(
      match && match.caddieScoringAccess
    );
    if (!access || !access.token) {
      wx.showToast({ title: '请先生成球童记分二维码', icon: 'none' });
      return;
    }
    this._tryClaimCaddieScoringAccess(access.token);
  },

  /** 开发态：切换当前用户是否视为已绑手机号 */
  toggleMockPhoneBound() {
    const state = qrAccessAuth.getAuthDebugState();
    const bound = !!(state.phone && state.mockPhoneBound !== false);
    if (bound) {
      qrAccessAuth.setMockPhoneBound(false);
      gameStore.setCurrentUserPhone('');
      wx.showToast({ title: '已模拟未绑定手机号', icon: 'none' });
    } else {
      qrAccessAuth.bindPhone('13800000000');
      wx.showToast({ title: '已模拟绑定手机号', icon: 'none' });
    }
  },

  /**
   * 领先榜展开头像角标能力（与 leaderboard-player-identity.avatarBadge 对齐）。
   * team-internal → none（不显示国旗）；inter-team → team（本场球队 LOGO）；其他 → auto。
   */
  _resolveLeaderboardAvatarBadge(match) {
    if (isTeamInternalMatch(match)) return 'none';
    if (isInterTeamMatch(match)) return 'team';
    return 'auto';
  },

  /**
   * 领先榜展开辅助信息模式（与 leaderboard-player-identity.metaMode 对齐）。
   * 球队赛家族 → handicapFloat；普通球局/系列赛保持 countryAge。
   */
  _resolveLeaderboardMetaMode(match) {
    return isTeamMatchFamily(match) ? 'handicapFloat' : 'countryAge';
  },

  _resolveLeaderboardShowExpandGender(match) {
    return isTeamMatchFamily(match);
  },

  /** 竞技指标：null/'' → 缺省；0 为有效值 */
  _pickLeaderboardMetricValue(raw) {
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
    return raw;
  },

  /**
   * 批量解析 userId → handicap / floatCoef（球队赛家族展开面板）。
   * 优先报名快照；其次当前用户资料；再尝试联系人关系库中的真实字段。
   * 不使用演示常量；不以昵称匹配。
   */
  _buildLeaderboardMetricMap(match) {
    const map = {};
    const merge = (userId, handicap, floatCoef) => {
      const id = String(userId || '').trim();
      if (!id) return;
      if (!map[id]) map[id] = { handicap: null, floatCoef: null };
      const cur = map[id];
      if (cur.handicap == null) {
        const h = this._pickLeaderboardMetricValue(handicap);
        if (h != null) cur.handicap = h;
      }
      if (cur.floatCoef == null) {
        const f = this._pickLeaderboardMetricValue(floatCoef);
        if (f != null) cur.floatCoef = f;
      }
    };

    const users =
      match && match.registerInfo && Array.isArray(match.registerInfo.users)
        ? match.registerInfo.users
        : [];
    users.forEach((u) => {
      if (!u) return;
      const handicap = u.handicap;
      const floatCoef = u.floatCoef;
      [u.userId, u.playerId, u.id, u.uid, u.openid].forEach((id) => {
        merge(id, handicap, floatCoef);
      });
    });

    try {
      const profile = userProfileStore.loadProfile() || {};
      merge(profile.userId, profile.handicap, profile.floatCoef);
      merge('me', profile.handicap, profile.floatCoef);
      const current = gameStore.getCurrentUser() || {};
      if (current.userId) {
        merge(current.userId, profile.handicap, profile.floatCoef);
      }
    } catch (e) { /* ignore */ }

    try {
      // 联系人关系库：仅补 handicap（floatCoef 在 normalize 时缺省为 0，易误显，不从该库读取）
      const store = contactFollowAction.getStore && contactFollowAction.getStore();
      if (store) {
        ['friends', 'following', 'followers', 'recommendations', 'newFollowers'].forEach(
          (key) => {
            (store[key] || []).forEach((c) => {
              if (!c || !c.id) return;
              merge(
                c.id,
                c.handicap != null && c.handicap !== '' ? c.handicap : null,
                null
              );
            });
          }
        );
      }
    } catch (e) { /* ignore */ }

    return map;
  },

  _resolveLeaderboardMetricsForPlayer(playerId, metricMap) {
    const id = String(playerId || '').trim();
    const raw = (metricMap && id && metricMap[id]) || null;
    const handicap = raw && raw.handicap != null ? raw.handicap : null;
    const floatCoef = raw && raw.floatCoef != null ? raw.floatCoef : null;
    return {
      handicap: handicap,
      floatCoef: floatCoef,
      handicapText: playerActionModal.formatPlayerActionMetric(handicap),
      floatCoefText: playerActionModal.formatPlayerActionMetric(floatCoef)
    };
  },

  _attachLeaderboardPlayerMetrics(player, metricMap) {
    if (!player || typeof player !== 'object') return player;
    const id = String(player.playerId || player.userId || '').trim();
    if (!id) {
      return Object.assign({}, player, {
        handicapText: '--',
        floatCoefText: '--'
      });
    }
    return Object.assign({}, player, this._resolveLeaderboardMetricsForPlayer(id, metricMap));
  },

  /**
   * 报名快照 userId → 用户（供展开性别/指标复用）。
   */
  _buildRegisterUserByIdMap(match) {
    const map = {};
    const users =
      match && match.registerInfo && Array.isArray(match.registerInfo.users)
        ? match.registerInfo.users
        : [];
    users.forEach((u) => {
      if (!u) return;
      [u.userId, u.playerId, u.id, u.uid, u.openid].forEach((rawId) => {
        const id = String(rawId || '').trim();
        if (id && !map[id]) map[id] = u;
      });
    });
    return map;
  },

  /**
   * 展开面板性别：matchGender → gender（快照）→ 本人资料 gender。
   * 统一走 playerManage.getGenderDisplay；未知不显示符号。
   */
  _resolveLeaderboardExpandGenderDisplay(player, registerById) {
    const id = String(
      (player && (player.playerId || player.userId)) || ''
    ).trim();
    const reg = (id && registerById && registerById[id]) || null;
    const matchGender =
      (player && player.matchGender != null && String(player.matchGender).trim()) ||
      (reg && reg.matchGender != null && String(reg.matchGender).trim()) ||
      '';
    const gender =
      (player && player.gender != null && String(player.gender).trim()) ||
      (reg && reg.gender != null && String(reg.gender).trim()) ||
      '';
    let profileGender = '';
    if (!matchGender && !gender && id && this._isLeaderboardFollowSelf(id)) {
      try {
        const profile = userProfileStore.loadProfile() || {};
        if (profile.gender != null && String(profile.gender).trim() !== '') {
          profileGender = String(profile.gender).trim();
        }
      } catch (e) { /* ignore */ }
    }
    const preferred = matchGender || gender || profileGender;
    return playerManage.getGenderDisplay({
      matchGender: matchGender,
      gender: preferred
    });
  },

  _attachLeaderboardExpandGender(player, registerById) {
    if (!player || typeof player !== 'object') return player;
    const d = this._resolveLeaderboardExpandGenderDisplay(player, registerById);
    return Object.assign({}, player, {
      gender: d.gender || '',
      genderIcon: d.icon || '',
      genderSymbol: d.icon || '',
      genderClass: d.className || ''
    });
  },

  /** 个人榜行：附着江湖差点/浮动系数 + 展开性别（球队赛家族；其它类型无副作用） */
  _enrichLeaderboardRowsWithMetrics(rows, match) {
    if (!isTeamMatchFamily(match)) return rows || [];
    const metricMap = this._buildLeaderboardMetricMap(match);
    const registerById = this._buildRegisterUserByIdMap(match);
    return (Array.isArray(rows) ? rows : []).map((row) => {
      if (!row) return row;
      let next = this._attachLeaderboardPlayerMetrics(row, metricMap);
      next = this._attachLeaderboardExpandGender(next, registerById);
      if (Array.isArray(row.members) && row.members.length) {
        next.members = row.members.map((m) =>
          this._attachLeaderboardExpandGender(
            this._attachLeaderboardPlayerMetrics(m, metricMap),
            registerById
          )
        );
      }
      return next;
    });
  },

  /** 分队榜展开球员/Side 成员：附着竞技指标 + 展开性别（球队赛家族） */
  _enrichTeamLeaderboardWithMetrics(teams, match) {
    if (!isTeamMatchFamily(match)) return teams || [];
    const metricMap = this._buildLeaderboardMetricMap(match);
    const registerById = this._buildRegisterUserByIdMap(match);
    return (Array.isArray(teams) ? teams : []).map((team) => {
      if (!team) return team;
      const players = (team.players || []).map((p) => {
        if (!p) return p;
        let next = this._attachLeaderboardPlayerMetrics(p, metricMap);
        next = this._attachLeaderboardExpandGender(next, registerById);
        if (Array.isArray(p.members) && p.members.length) {
          next.members = p.members.map((m) =>
            this._attachLeaderboardExpandGender(
              this._attachLeaderboardPlayerMetrics(m, metricMap),
              registerById
            )
          );
        }
        return next;
      });
      return Object.assign({}, team, { players: players });
    });
  },

  /**
   * 领先榜关注用稳定 userId：仅 playerId/userId，禁止 scorecardKey / guest_。
   */
  _resolveLeaderboardFollowUserId(player) {
    if (!player || typeof player !== 'object') return '';
    const id = playerIdentityGuard.normalizePlayerUserId(
      player.playerId || player.userId
    );
    if (!playerIdentityGuard.isStablePublicUserId(id, { userType: player.userType })) {
      return '';
    }
    return id;
  },

  _isLeaderboardFollowSelf(userId) {
    const id = String(userId || '').trim();
    if (!id) return false;
    const aliases = ['me'];
    try {
      const current = gameStore.getCurrentUser() || {};
      if (current.userId) aliases.push(String(current.userId).trim());
    } catch (e) { /* ignore */ }
    try {
      const profile = userProfileStore.loadProfile() || {};
      if (profile.userId) aliases.push(String(profile.userId).trim());
    } catch (e) { /* ignore */ }
    return aliases.indexOf(id) >= 0;
  },

  _collectLeaderboardFollowIds(leaderboard, teamLeaderboard) {
    const ids = [];
    const seen = {};
    const push = (player) => {
      const id = this._resolveLeaderboardFollowUserId(player);
      if (!id || seen[id]) return;
      seen[id] = true;
      ids.push(id);
    };
    (Array.isArray(leaderboard) ? leaderboard : []).forEach((row) => {
      push(row);
      (row && Array.isArray(row.members) ? row.members : []).forEach(push);
    });
    (Array.isArray(teamLeaderboard) ? teamLeaderboard : []).forEach((team) => {
      (team && Array.isArray(team.players) ? team.players : []).forEach((p) => {
        push(p);
        (p && Array.isArray(p.members) ? p.members : []).forEach(push);
      });
    });
    return ids;
  },

  _relationLabelFromStatus(status) {
    if (status === 'friend') return '好友';
    if (status === 'following') return '已关注';
    return '';
  },

  /**
   * 领先榜资料入口：有稳定 userId 的球员（含本人）可点 ›。
   * 与关注能力解耦；队内/队际共用。
   */
  _buildLeaderboardProfileEntryPatch(leaderboard, teamLeaderboard) {
    const ids = this._collectLeaderboardFollowIds(leaderboard, teamLeaderboard);
    const leaderboardProfileEntryMap = {};
    ids.forEach((id) => {
      leaderboardProfileEntryMap[id] = true;
    });
    return { leaderboardProfileEntryMap: leaderboardProfileEntryMap };
  },

  /**
   * 批量投影通讯录关系 → 页级 map（与 Game Hub / contactFollowAction 一致）。
   * 球队赛家族启用；不按昵称匹配；无稳定 id 不进入 map；不写回报名/成绩。
   */
  _buildLeaderboardRelationPatch(leaderboard, teamLeaderboard, match) {
    if (!isTeamMatchFamily(match)) {
      return {
        leaderboardFollowEnabled: false,
        currentUserId: '',
        followMap: {},
        relationMap: {},
        relationLabelMap: {},
        leaderboardSelfMap: {},
        leaderboardFollowableMap: {},
        followLoadingMap: this.data.followLoadingMap || {}
      };
    }
    try {
      contactFollowAction.ensureStore();
    } catch (e) { /* ignore */ }
    const ids = this._collectLeaderboardFollowIds(leaderboard, teamLeaderboard);
    const relationMap = contactFollowAction.buildRelationMap(ids);
    const followMap = {};
    const relationLabelMap = {};
    const leaderboardSelfMap = {};
    const leaderboardFollowableMap = {};
    ids.forEach((id) => {
      const self = this._isLeaderboardFollowSelf(id);
      leaderboardSelfMap[id] = self;
      leaderboardFollowableMap[id] = !self;
      const st = relationMap[id] || 'none';
      if (!self && (st === 'friend' || st === 'following')) {
        followMap[id] = true;
        relationLabelMap[id] = this._relationLabelFromStatus(st);
      }
    });
    let currentUserId = '';
    try {
      currentUserId = String((gameStore.getCurrentUser() || {}).userId || '').trim();
    } catch (e) { /* ignore */ }
    if (!currentUserId) {
      try {
        currentUserId = String((userProfileStore.loadProfile() || {}).userId || '').trim();
      } catch (e) { /* ignore */ }
    }
    return {
      leaderboardFollowEnabled: true,
      currentUserId: currentUserId,
      followMap: followMap,
      relationMap: relationMap,
      relationLabelMap: relationLabelMap,
      leaderboardSelfMap: leaderboardSelfMap,
      leaderboardFollowableMap: leaderboardFollowableMap,
      followLoadingMap: this.data.followLoadingMap || {}
    };
  },

  _findLeaderboardPlayerByFollowId(userId) {
    const id = String(userId || '').trim();
    if (!id) return null;
    const matchId = (p) =>
      p && (String(p.playerId || '').trim() === id || String(p.userId || '').trim() === id);
    const rows = Array.isArray(this.data.leaderboard) ? this.data.leaderboard : [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (matchId(row)) return row;
      const members = row && Array.isArray(row.members) ? row.members : [];
      for (let j = 0; j < members.length; j++) {
        if (matchId(members[j])) return members[j];
      }
    }
    const teams = Array.isArray(this.data.teamLeaderboard) ? this.data.teamLeaderboard : [];
    for (let t = 0; t < teams.length; t++) {
      const players = teams[t] && Array.isArray(teams[t].players) ? teams[t].players : [];
      for (let p = 0; p < players.length; p++) {
        const player = players[p];
        if (matchId(player)) return player;
        const members = player && Array.isArray(player.members) ? player.members : [];
        for (let m = 0; m < members.length; m++) {
          if (matchId(members[m])) return members[m];
        }
      }
    }
    return null;
  },

  /**
   * 队际赛「参赛球队」卡片 UI：顺序沿用 teamGroups；展开态仅页面状态。
   * @param {object|null} match
   * @param {boolean} [expanded]
   */
  _buildParticipatingTeamsUiPatch(match, expanded) {
    const inter = isInterTeamMatch(match);
    const teams = inter ? resolveParticipatingTeamViews(match) : [];
    // 完整列表只挂实例，避免 page data 同时存 participatingTeams + visibleParticipatingTeams 双份
    this._participatingTeamsAll = teams;
    const showMore = teams.length > PARTICIPATING_TEAMS_PREVIEW_LIMIT;
    const isExpanded = !!(expanded && showMore);
    return {
      isInterTeamMatch: inter,
      visibleParticipatingTeams: isExpanded
        ? teams
        : teams.slice(0, PARTICIPATING_TEAMS_PREVIEW_LIMIT),
      showParticipatingTeamsMore: showMore,
      participatingTeamsExpanded: isExpanded
    };
  },

  toggleParticipatingTeamsExpand() {
    if (!this.data.showParticipatingTeamsMore) return;
    const next = !this.data.participatingTeamsExpanded;
    const teams = Array.isArray(this._participatingTeamsAll) ? this._participatingTeamsAll : [];
    this.setData({
      participatingTeamsExpanded: next,
      visibleParticipatingTeams: next
        ? teams
        : teams.slice(0, PARTICIPATING_TEAMS_PREVIEW_LIMIT)
    });
  },

  /* ===== 顶部赛事信息数据接入（teamMatchStore） ===== */
  _resolveMatchData(matchId) {
    if (!matchId) return null;
    const realMatch = teamMatchStore.getMatchById(matchId);
    if (realMatch) return realMatch;
    if (demoJiaobeiMatch.isJiaobeiDemoMatchId(matchId)) {
      return demoJiaobeiMatch.getJiaobeiDemoMatch();
    }
    return null;
  },

  _pullCloudMatch(matchId, onDone) {
    const cb = typeof onDone === 'function' ? onDone : function () {};
    let factory;
    try {
      factory = require('../../../../utils/teamClub/repoFactory.js');
    } catch (e) {
      cb(null);
      return;
    }
    if (factory.getMode() !== 'cloud') {
      cb(null);
      return;
    }
    const teamClub = require('../../../../utils/teamClub/service.js');
    teamClub.getMatch(matchId).then((res) => {
      if (res && res.ok && res.match) {
        cb(res.match);
        return;
      }
      cb(null, res);
    }).catch(() => cb(null, { code: 'network_error' }));
  },

  loadMatch(matchId) {
    const match = this._resolveMatchData(matchId);
    if (!match) {
      this._pullCloudMatch(matchId, (cloud, err) => {
        if (this._resolveMatchData(matchId)) {
          this.loadMatch(matchId);
          return;
        }
        wx.showToast({
          title: (err && err.message) || '无法打开比赛',
          icon: 'none'
        });
      });
      return;
    }
    if (!this._skipCloudPull) {
      this._pullCloudMatch(matchId, (cloud) => {
        if (cloud && this.data.matchId === matchId) this.refreshMatchData(matchId);
      });
    }
    this._syncTournamentHoleLayout(match);
    const lifecycle = this._getMatchLifecycle(match);
    const tabs = resolveTournamentTabs(lifecycle.status, match);
    const isMatchPlayScoreboard = isMatchPlayBoardMode(resolveGameMode(match));
    const leaderboardViewOptions = this._resolveLeaderboardViewOptions(match);
    const leaderboardDefaultView = this._resolveLeaderboardDefaultView(match);
    const leaderboardMode = this._leaderboardViewToMode(leaderboardDefaultView);
    const leaderboardTeamCompetitionEnabled = this._isTeamCompetitionEnabled(match);
    const showLeaderboardTeamColumn = this._shouldShowTeeSheetTeamLabel(match);
    const scorecardCourseTitle = this._buildScorecardCourseTitle(match);
    const leaderboardRows = this._enrichLeaderboardRowsWithMetrics(
      this._buildLeaderboardViewForView(match, leaderboardDefaultView),
      match
    );
    const teamLeaderboardRows = this._enrichTeamLeaderboardWithMetrics(
      this._buildTeamLeaderboardView(match),
      match
    );
    // 首次进入：优先安全 preferred TAB（如球友圈 → 领先榜/得分榜）；否则 tabs[0]
    let initialTab = tabs[0] && tabs[0].id ? tabs[0].id : 'details';
    const preferred = this._preferredActiveTab || '';
    if (preferred && tabs.some((t) => t && t.id === preferred)) {
      initialTab = preferred;
    }
    this._preferredActiveTab = '';
    this.setData(Object.assign({
      matchId: matchId,
      hostSnapshot: this._matchHostSnapshot(matchId),
      match: this._mapMatchToView(match),
      courseName: (match && match.courseName) || '',
      scorecardCourseTitle: scorecardCourseTitle,
      matchStatus: lifecycle,
      tabs: tabs,
      isMatchPlayScoreboard: isMatchPlayScoreboard,
      matchPlayScoreboard: isMatchPlayScoreboard
        ? this._buildMatchPlayScoreboard(match, { resetExpanded: true })
        : null,
      activeTab: initialTab,
      leaderboardDefaultMode: leaderboardMode,
      leaderboardMode: leaderboardMode,
      leaderboardDefaultView: leaderboardDefaultView,
      leaderboardView: leaderboardDefaultView,
      leaderboardViewOptions: leaderboardViewOptions,
      leaderboardTeamViewAvailable: leaderboardViewOptions.indexOf('team') >= 0,
      leaderboardTeamCompetitionEnabled: leaderboardTeamCompetitionEnabled,
      showLeaderboardTeamColumn: showLeaderboardTeamColumn,
      leaderboardScoreType: 'gross',
      leaderboardViewLabel: this._buildLeaderboardViewLabel('gross', leaderboardDefaultView),
      leaderboardNetScoreAvailable: this._hasLeaderboardNetScore(match),
      leaderboard: leaderboardRows,
      teamLeaderboard: teamLeaderboardRows,
      teamGroupLogoById: this._buildTeamGroupLogoMap(match),
      leaderboardAvatarBadge: this._resolveLeaderboardAvatarBadge(match),
      leaderboardMetaMode: this._resolveLeaderboardMetaMode(match),
      leaderboardShowExpandGender: this._resolveLeaderboardShowExpandGender(match),
      eventInfoList: this._resolveEventInfoList(match),
      registerSideLabel: isInterTeamMatch(match) ? '球队' : '分队',
      registerSheetGroupLabel: isInterTeamMatch(match) ? '选择球队' : '报名分组',
      proxyGroupSheetTitle: isInterTeamMatch(match) ? '选择报名球队' : '选择报名分队',
      proxyGroupSheetSub: isInterTeamMatch(match)
        ? '本次选择的选手将统一报名到同一支球队；可与成员来源不同'
        : '本次选择的选手将统一报名到同一个分队',
      proxyRegistrationFieldLabel: isInterTeamMatch(match) ? '报名球队' : '报名分队',
      scorecardAdImage: this._resolveScorecardAdImage(getApp().getTheme(), matchId)
    }, this._buildLeaderboardProfileEntryPatch(leaderboardRows, teamLeaderboardRows), this._buildLeaderboardRelationPatch(leaderboardRows, teamLeaderboardRows, match), this._buildParticipatingTeamsUiPatch(match, false), this._buildRegisterStatePatch(match), this._buildGroupsTabStatePatch(match)), () => {
      this.applyMoreAccess();
    });
  },

  refreshMatchData(matchId) {
    if (!this._skipCloudPull) {
      this._pullCloudMatch(matchId, (cloud, err) => {
        this._skipCloudPull = true;
        if (cloud) this.refreshMatchData(matchId);
        else if (!this._resolveMatchData(matchId)) {
          wx.showToast({ title: (err && err.message) || '无法打开比赛', icon: 'none' });
        }
        this._skipCloudPull = false;
      });
    }
    const match = this._resolveMatchData(matchId);
    if (!match) return;
    this._syncTournamentHoleLayout(match);
    const lifecycle = this._getMatchLifecycle(match);
    const tabs = resolveTournamentTabs(lifecycle.status, match);
    const isMatchPlayScoreboard = isMatchPlayBoardMode(resolveGameMode(match));
    let activeTab = this.data.activeTab;
    if (!tabs.some((t) => t.id === activeTab)) {
      activeTab = tabs[0].id;
    }
    const leaderboardViewOptions = this._resolveLeaderboardViewOptions(match);
    const leaderboardDefaultView = this._resolveLeaderboardDefaultView(match);
    const currentView = this.data.leaderboardView || this._leaderboardModeToView(this.data.leaderboardMode);
    const leaderboardView = leaderboardSettingViewModel.normalizeLeaderboardSelection(match, {
      view: currentView,
      scoreType: this.data.leaderboardScoreType
    }).view;
    const leaderboardMode = this._leaderboardViewToMode(leaderboardView);
    const leaderboardTeamCompetitionEnabled = this._isTeamCompetitionEnabled(match);
    const showLeaderboardTeamColumn = this._shouldShowTeeSheetTeamLabel(match);
    const scorecardCourseTitle = this._buildScorecardCourseTitle(match);
    const netAvailable = this._hasLeaderboardNetScore(match);
    const leaderboardScoreType =
      this.data.leaderboardScoreType === 'net' && netAvailable ? 'net' : 'gross';
    // 从记分页返回：折叠得分榜 Details（onHide 标 + 栈内 score 页双保险）
    const resetMatchPlayExpanded =
      !!this._resetMatchPlayExpandedOnReturn || this._isReturningFromScorePage();
    this._resetMatchPlayExpandedOnReturn = false;
    const leaderboardRows = this._enrichLeaderboardRowsWithMetrics(
      this._buildLeaderboardViewForView(match, leaderboardView),
      match
    );
    const teamLeaderboardRows = this._enrichTeamLeaderboardWithMetrics(
      this._buildTeamLeaderboardView(match),
      match
    );
    this.setData(Object.assign({
      match: this._mapMatchToView(match),
      hostSnapshot: this._matchHostSnapshot(matchId),
      courseName: match.courseName || '',
      scorecardCourseTitle: scorecardCourseTitle,
      matchStatus: lifecycle,
      tabs: tabs,
      isMatchPlayScoreboard: isMatchPlayScoreboard,
      matchPlayScoreboard: isMatchPlayScoreboard
        ? this._buildMatchPlayScoreboard(match, { resetExpanded: resetMatchPlayExpanded })
        : null,
      activeTab: activeTab,
      leaderboardDefaultMode: this._leaderboardViewToMode(leaderboardDefaultView),
      leaderboardMode: leaderboardMode,
      leaderboardDefaultView: leaderboardDefaultView,
      leaderboardView: leaderboardView,
      leaderboardViewOptions: leaderboardViewOptions,
      leaderboardTeamViewAvailable: leaderboardViewOptions.indexOf('team') >= 0,
      leaderboardTeamCompetitionEnabled: leaderboardTeamCompetitionEnabled,
      showLeaderboardTeamColumn: showLeaderboardTeamColumn,
      leaderboardScoreType: leaderboardScoreType,
      leaderboardViewLabel: this._buildLeaderboardViewLabel(leaderboardScoreType, leaderboardView),
      leaderboardNetScoreAvailable: netAvailable,
      leaderboard: leaderboardRows,
      teamLeaderboard: teamLeaderboardRows,
      teamGroupLogoById: this._buildTeamGroupLogoMap(match),
      leaderboardAvatarBadge: this._resolveLeaderboardAvatarBadge(match),
      leaderboardMetaMode: this._resolveLeaderboardMetaMode(match),
      leaderboardShowExpandGender: this._resolveLeaderboardShowExpandGender(match),
      eventInfoList: this._resolveEventInfoList(match),
      registerSideLabel: isInterTeamMatch(match) ? '球队' : '分队',
      registerSheetGroupLabel: isInterTeamMatch(match) ? '选择球队' : '报名分组',
      proxyGroupSheetTitle: isInterTeamMatch(match) ? '选择报名球队' : '选择报名分队',
      proxyGroupSheetSub: isInterTeamMatch(match)
        ? '本次选择的选手将统一报名到同一支球队；可与成员来源不同'
        : '本次选择的选手将统一报名到同一个分队',
      proxyRegistrationFieldLabel: isInterTeamMatch(match) ? '报名球队' : '报名分队',
      scorecardAdImage: this._resolveScorecardAdImage(getApp().getTheme(), matchId)
    }, this._buildLeaderboardProfileEntryPatch(leaderboardRows, teamLeaderboardRows), this._buildLeaderboardRelationPatch(leaderboardRows, teamLeaderboardRows, match), this._buildParticipatingTeamsUiPatch(
      match,
      // 同页刷新保留展开；切换赛事（matchId 变化）恢复收起
      String(matchId || '') === String(this.data.matchId || '')
        ? !!this.data.participatingTeamsExpanded
        : false
    ), this._buildRegisterStatePatch(match), this._buildGroupsTabStatePatch(match)), () => {
      this.applyMoreAccess();
      this.refreshPartnerSection();
      // 开赛重排后若仍停在报名，滚入可视（窄屏横向 Tab）
      if (activeTab === 'register') {
        this._ensureTabBarShowsTab('register');
      }
      if (activeTab === 'leaderboard' && isMatchPlayScoreboard) {
        wx.nextTick(() => this.measureMpSbSummaryTop());
      } else if (this.data.isStickyMpSbSummary) {
        this.setData({ isStickyMpSbSummary: false });
      }
    });
  },

  /**
   * 动态重排后把指定 Tab 滚入横向可视区（流内 + 吸顶共用数据源，按稳定 id）。
   * @param {string} tabId
   */
  _ensureTabBarShowsTab(tabId) {
    const id = tabId != null ? String(tabId).trim() : '';
    if (!id) return;
    const inflowId = 'inflow-tab-' + id;
    const fixedId = 'fixed-tab-' + id;
    this.setData({
      tabScrollIntoViewInflow: '',
      tabScrollIntoViewFixed: ''
    }, () => {
      this.setData({
        tabScrollIntoViewInflow: inflowId,
        tabScrollIntoViewFixed: fixedId
      });
      wx.nextTick(() => this.measureTabOverflow());
    });
  },

  _buildGroupsTabStatePatch(match) {
    const formal = cloneTournamentGroups(match && Array.isArray(match.groups) ? match.groups : []);
    const unscheduled = this._resolveUnscheduledPlayers(match, formal);
    const gameMode = match && match.gameMode ? String(match.gameMode) : '';
    const isG4Stroke = gameMode === '四人两球比杆赛';
    const isG5MatchPlay = isG5MatchPlayMode(gameMode);
    // G2/G3 组合比杆 + G4 四人两球：分组 TAB 展示组合描述（不含 G5）
    const showPairings = teamMatchStore.isPairingStrokeFormat(gameMode) || isG4Stroke;
    const matchType = match && match.matchType ? String(match.matchType) : 'team-internal';
    const strokeModeRaw =
      match && match.strokeCompositionMode != null
        ? String(match.strokeCompositionMode).trim()
        : '';
    // 球队赛家族 G2/G3：报名与 LIVE 均用 composition 展示（不因 ongoing 切到 pairing 头像卡）
    const useCompositionDisplay =
      showPairings
      && !isG4Stroke
      && isTeamMatchFamily(matchType)
      && (strokeModeRaw === '4+0' || strokeModeRaw === '2+2');
    // G4：用 pairings 映射为「分队：球员」文字行（与 G2/G3 composition 行同款 UI）
    const useG4PairingTextDisplay = isG4Stroke && isTeamMatchFamily(matchType);
    // G5：独立 1v1 分队行（不进 pairing / composition / Entity）
    const useG5MatchPlayDisplay = isG5MatchPlay && isTeamMatchFamily(matchType);
    const pairings =
      showPairings && (useG4PairingTextDisplay || !useCompositionDisplay)
        ? teamMatchStore.clonePairings(match && match.pairings)
        : {};
    const playerLookup = this._buildGroupPlayerLookup(match);
    const groupsTabCards = this._mapGroupsToTabCards(formal, {
      showPairings: showPairings,
      useCompositionDisplay: useCompositionDisplay,
      useG4PairingTextDisplay: useG4PairingTextDisplay,
      useG5MatchPlayDisplay: useG5MatchPlayDisplay,
      match: match,
      pairings: pairings,
      pairingTitle: teamMatchStore.getPairingStrokeLabel(gameMode),
      playerLookup: playerLookup,
      matchTeeTime: teeSheetManage.resolveMatchTeeTime(match)
    });
    const canManageGroups =
      this._resolveCanManageGroups(match) && !teamMatchFinish.isMatchCompleted(match);
    const groupsCta = teamMatchBottomCta.project({
      match: match,
      surface: 'groups',
      canManageGroups: canManageGroups
    });
    return {
      groups: formal,
      groupsTabCards: groupsTabCards,
      hasFormalGroups: formal.length > 0,
      groupsBottomCtaLabel: groupsCta.editGroupsLabel,
      canManageGroups: canManageGroups,
      unscheduledPlayerCount: unscheduled.length,
      showGroupPairings: showPairings,
      showGroupMatchPlayTeams: useG5MatchPlayDisplay,
      teeSheetBottomCta: this._projectTeeSheetBottomCta(match)
    };
  },

  /** 报名/参赛记录上的球员 id（多字段兼容） */
  _resolveAnyPlayerId(raw) {
    if (!raw || typeof raw !== 'object') return '';
    const id = raw.userId || raw.playerId || raw.id || raw.uid || raw.openid;
    return id != null ? String(id).trim() : '';
  },

  /** 报名记录展示名（本场快照优先） */
  _resolveAnyPlayerNickname(raw) {
    if (!raw || typeof raw !== 'object') return '';
    return playerManage.resolveMatchNickname(raw);
  },

  /**
   * 查看者私人备注 map（一次读取，按 revision 缓存）。
   * 仅用于页面 View Model，禁止写回赛事 Store。
   */
  _getViewerRemarkNameMap() {
    let viewer = '';
    try {
      viewer =
        String((gameStore.getCurrentUser() || {}).userId || '').trim() ||
        socialRelationStore.resolveCurrentUserId();
    } catch (e) {
      viewer = '';
    }
    const rev = playerDisplayName.getRemarkRevision();
    if (
      this._viewerRemarkCtx &&
      this._viewerRemarkCtx.rev === rev &&
      this._viewerRemarkCtx.viewer === viewer
    ) {
      return this._viewerRemarkCtx.map || {};
    }
    const map = playerDisplayName.buildRemarkNameMap(viewer);
    this._viewerRemarkCtx = { rev: rev, viewer: viewer, map: map };
    return map;
  },

  /**
   * 查看者视角展示名：匿名预留 → 备注 → 公开/快照。
   * @param {string} targetUserId
   * @param {string} [publicOrSnapshotName]
   * @param {{ publicName?: string, snapshotName?: string, identityMasked?: boolean }} [opts]
   */
  _resolveViewerDisplayName(targetUserId, publicOrSnapshotName, opts) {
    const o = opts || {};
    const fallback = publicOrSnapshotName != null ? String(publicOrSnapshotName).trim() : '';
    const named = playerDisplayName.resolvePlayerDisplayNameForViewer({
      viewerUserId: (this._viewerRemarkCtx && this._viewerRemarkCtx.viewer) || '',
      targetUserId: targetUserId,
      publicName: o.publicName != null ? o.publicName : fallback,
      snapshotName: o.snapshotName != null ? o.snapshotName : fallback,
      identityMasked: o.identityMasked === true,
      remarkNameMap: this._getViewerRemarkNameMap(),
      defaultName: '未知球员'
    });
    return named.displayName;
  },

  _applyViewerNamesToChat(messages) {
    const viewer =
      (this._viewerRemarkCtx && this._viewerRemarkCtx.viewer) ||
      String((gameStore.getCurrentUser() || {}).userId || '').trim();
    return playerDisplayName.mapMessageAuthorsForViewer(messages, {
      viewerUserId: viewer,
      remarkNameMap: this._getViewerRemarkNameMap()
    });
  },

  /**
   * 收集报名/参赛名单原始列表（兼容 users / players / participants）
   */
  _collectRegisterPlayerSources(match) {
    const lists = [];
    const pushList = (arr) => {
      if (Array.isArray(arr) && arr.length) lists.push(arr);
    };
    const registerInfo = this._resolveRegisterInfo(match);
    pushList(registerInfo && registerInfo.users);
    const rawInfo = match && match.registerInfo;
    if (rawInfo && typeof rawInfo === 'object') {
      pushList(rawInfo.users);
      pushList(rawInfo.players);
    }
    pushList(match && match.participants);
    pushList(match && match.players);
    return lists;
  },

  /**
   * 分组展示用球员字典：正式 groups 存 userId/position/tPosition；
   * lookup 补昵称/头像/性别；T 台缺省按性别，不覆盖 groups 已存值（见 hydrate）。
   */
  _buildGroupPlayerLookup(match) {
    const map = {};
    const lists = this._collectRegisterPlayerSources(match);
    lists.forEach((users) => {
      users.forEach((u) => {
        if (!u || typeof u !== 'object') return;
        const primaryId = this._resolveAnyPlayerId(u);
        if (!primaryId) return;
        const gender = playerManage.resolveMatchGender(u);
        const teeCode = tPosition.resolve({
          tPosition: u.tPosition,
          tee: u.tee,
          gender: gender
        });
        const teeText = teeCode === tPosition.RED_T ? '红T' : '蓝T';
        const entry = {
          userId: primaryId,
          nickname: this._resolveAnyPlayerNickname(u) || '未知球员',
          avatar: u.avatar || u.avatarUrl || '',
          gender: gender,
          handicap: u.handicap != null ? u.handicap : '',
          tee: teeCode,
          tPosition: teeCode,
          teeText: teeText
        };
        // 同一人多 id 字段都挂到 lookup，避免 groups.userId 与报名 id 字段不一致
        const aliasIds = [u.userId, u.playerId, u.id, u.uid, u.openid]
          .map((v) => (v != null ? String(v).trim() : ''))
          .filter(Boolean);
        if (aliasIds.indexOf(primaryId) < 0) aliasIds.push(primaryId);
        aliasIds.forEach((id) => {
          if (!map[id]) map[id] = entry;
        });
      });
    });
    return map;
  },

  /**
   * 展示层 hydrate：不改写正式 groups，仅生成 displayPlayers。
   * T 台：groups.players.tPosition/tee 优先，禁止 gender 默认覆盖已有事实。
   * @param {object} group
   * @param {object} playerLookup
   * @param {{ match?: object, showTeamLabel?: boolean, teamNameMap?: object, playerTeamLookup?: object }=} options
   */
  hydrateGroupDisplayPlayers(group, playerLookup, options) {
    const lookup = playerLookup || {};
    const opts = options && typeof options === 'object' ? options : {};
    const match = opts.match || null;
    const showTeamLabel =
      opts.showTeamLabel != null
        ? !!opts.showTeamLabel
        : this._shouldShowAvatarTeamLabel(match);
    const teamNameMap =
      opts.teamNameMap ||
      (showTeamLabel ? this._buildLeaderboardTeamNameMap(match) : {});
    const playerTeamLookup =
      opts.playerTeamLookup ||
      (showTeamLabel ? this._buildLeaderboardPlayerTeamLookup(match) : {});
    const teamGroups = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
    const list = (group && Array.isArray(group.players) ? group.players : [])
      .map((p) => {
        const userId = this._resolveAnyPlayerId(p);
        if (!userId) return null;
        const src = lookup[userId] || {};
        const gender = p.gender || src.gender || playerDirectory.getGenderById(userId, '');
        const teeCode = tPosition.resolve({
          tPosition: p.tPosition,
          tee: p.tee,
          gender: gender
        });
        const teeText = teeCode === tPosition.RED_T ? '红T' : '蓝T';
        const snapshotName =
          this._resolveAnyPlayerNickname(p) ||
          String(src.nickname || src.displayName || src.name || '').trim() ||
          '';
        const publicName = String(src.nickname || src.displayName || '').trim();
        const nickname = this._resolveViewerDisplayName(userId, publicName || snapshotName || '未知球员', {
          publicName: publicName,
          snapshotName: snapshotName,
          identityMasked: !!(src.identityMasked || p.identityMasked)
        });
        const avatarSrc = src.avatar
          || (p.avatar ? String(p.avatar) : '')
          || (p.avatarUrl ? String(p.avatarUrl) : '')
          || '';
        const slotIndex = Number(p.position != null ? p.position : p.slotIndex) || 0;
        let teamLabel = '';
        if (showTeamLabel) {
          const registerRef = playerTeamLookup[userId] || null;
          const rawForLabel = Object.assign({}, src, p, registerRef || {});
          teamLabel =
            playerManage.resolveAvatarTeamLabel(rawForLabel, teamGroups) ||
            this._resolveTeeSheetPlayerTeamLabel(
              rawForLabel,
              userId,
              teamNameMap,
              playerTeamLookup
            ) ||
            '';
        }
        return {
          playerId: userId,
          userId: userId,
          slotIndex: slotIndex,
          position: slotIndex,
          nickname: nickname,
          name: nickname,
          displayName: nickname,
          avatar: mockAvatars.resolveAvatar(avatarSrc, userId),
          tee: teeText,
          teeText: teeText,
          teeLabel: teeText,
          teeCode: teeCode,
          tPosition: teeCode,
          teeMarkerClass: teeCode === tPosition.RED_T
            ? 'tee-marker-dot--female'
            : 'tee-marker-dot--male',
          handicap: src.handicap != null && src.handicap !== '' ? src.handicap : (p.handicap != null ? p.handicap : ''),
          teamLabel: teamLabel
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a.slotIndex || 0) - (b.slotIndex || 0));
    return list;
  },

  /**
   * 未安排出场 = 报名名单 − 已进入正式 groups 的球员（仅展示，不视为错误）
   */
  _resolveUnscheduledPlayers(match, groups) {
    const registerInfo = this._resolveRegisterInfo(match);
    const users = registerInfo && Array.isArray(registerInfo.users) ? registerInfo.users : [];
    const assigned = {};
    (groups || []).forEach((g) => {
      (g.players || []).forEach((p) => {
        const id = this._resolveAnyPlayerId(p);
        if (id) assigned[id] = true;
      });
    });
    return users.filter((u) => {
      const id = this._resolveAnyPlayerId(u);
      return id && !assigned[id];
    });
  },

  /** 进入分组 TAB / 从编辑页返回：刷新正式分组展示 */
  _refreshFormalGroupsDisplay() {
    const match = this.data.matchId ? teamMatchStore.getMatchById(this.data.matchId) : null;
    this.setData(this._buildGroupsTabStatePatch(match));
  },

  _resolveCanManageGroups(match) {
    const user = gameStore.getCurrentUser() || {};
    const userId = String(user.userId || '');
    if (matchManageAccess.hasMatchManagePermission(match, user, 'edit_groups')) return true;
    if (matchManageAccess.hasMatchManagePermission(match, user, 'manage_groups')) return true;
    // 兼容：全权管理者（创建者 / 发起主体管理员）
    const access = resolveMoreAccessForMatch(match);
    if (access && access.isPrivilegedUser) return true;
    return tempAdminPermission.hasTempAdminPermission(match, userId, 'start_grouping');
  },

  _mapGroupsToTabCards(groups, options) {
    const opts = options || {};
    const showPairings = !!opts.showPairings;
    const useCompositionDisplay = !!opts.useCompositionDisplay;
    const useG4PairingTextDisplay = !!opts.useG4PairingTextDisplay;
    const useG5MatchPlayDisplay = !!opts.useG5MatchPlayDisplay;
    const pairings = opts.pairings || {};
    const pairingTitle = opts.pairingTitle || '组合';
    const playerLookup = opts.playerLookup || {};
    const matchTeeTime = opts.matchTeeTime || '';
    const match = opts.match || null;
    const showTeamLabel = this._shouldShowAvatarTeamLabel(match);
    const teamNameMap = showTeamLabel ? this._buildLeaderboardTeamNameMap(match) : {};
    const playerTeamLookup = showTeamLabel
      ? this._buildLeaderboardPlayerTeamLookup(match)
      : {};
    return (groups || []).map((g) => {
      // 正式位号保留在 g.players；展示层 hydrate 生成 displayPlayers（过滤空位，按 slotIndex 升序）
      const displayPlayers = this.hydrateGroupDisplayPlayers(g, playerLookup, {
        match: match,
        showTeamLabel: showTeamLabel,
        teamNameMap: teamNameMap,
        playerTeamLookup: playerTeamLookup
      });
      const teeTime = teeSheetManage.resolveGroupTeeTime(g) || matchTeeTime;
      const startHole = teeSheetManage.resolveGroupStartHole(g);
      const card = {
        groupId: g.groupId,
        badge: g.groupName,
        displayPlayers: displayPlayers,
        hasDisplayPlayers: displayPlayers.length > 0,
        teeTime: teeTime,
        startHole: startHole,
        teeMetaLine: teeSheetManage.formatTeeMetaLine(teeTime, startHole),
        hasTeeInfo: !!(teeTime || startHole != null)
      };
      if (useG5MatchPlayDisplay) {
        // G5：players→分队行；不调 composition / pairings
        card.matchPlayTeamBlock = this._buildMatchPlayTeamBlock(match, g, playerLookup);
      } else if (showPairings) {
        if (useCompositionDisplay) {
          // 队内赛 G2/G3：composition 文字行（报名 / LIVE 同路径）
          card.pairingBlock = this._mapGroupCompositionBlock(match, g, playerLookup);
        } else if (useG4PairingTextDisplay) {
          // G4：pairings → 分队文字行（复用 composition 行 UI，不用「组合N」）
          card.pairingBlock = this._mapGroupG4PairingTextBlock(match, g, pairings, playerLookup);
        } else {
          // 其余：pairing 头像卡
          card.pairingBlock = this._mapGroupPairingBlock(g, pairings, pairingTitle, playerLookup);
        }
      }
      return card;
    });
  },

  /**
   * G5–G8 得分榜：顶部总分真实计算；身份区用 match.groups + 分队归属；
   * 卡片洞走势等仍用 mock。不读 leaderboard / stats / mockScore。
   * @param {object} [opts]
   * @param {boolean} [opts.resetExpanded] true=全部折叠（从记分页返回）；默认保留已有 expanded
   */
  _buildMatchPlayScoreboard(match, opts) {
    const resetExpanded = !!(opts && opts.resetExpanded);
    const prevExpandedById = {};
    const prevBoard = this.data && this.data.matchPlayScoreboard;
    if (!resetExpanded && prevBoard && Array.isArray(prevBoard.matches)) {
      prevBoard.matches.forEach((m) => {
        if (!m || m.id == null) return;
        prevExpandedById[String(m.id)] = !!m.expanded;
      });
    }
    return matchPlayScoreboardView.buildMatchPlayScoreboard(match, {
      resetExpanded: resetExpanded,
      prevExpandedById: prevExpandedById,
      resolveAnyPlayerId: (raw) => this._resolveAnyPlayerId(raw),
      resolveAnyPlayerNickname: (raw) => this._resolveAnyPlayerNickname(raw),
      resolveViewerDisplayName: (id, fallback, nameOpts) =>
        this._resolveViewerDisplayName(id, fallback, nameOpts),
      resolveGroupedPlayerAvatar: (id, slotPlayer, lookup) =>
        this._resolveGroupedPlayerAvatar(id, slotPlayer, lookup),
      getHolePars: (m) => this._getMatchHolePars(m),
      buildGroupPlayerLookup: (m) => this._buildGroupPlayerLookup(m)
    });
  },
  _buildMatchPlayPkProgressSummary(match, groups, teamIds, isG5) {
    const list = Array.isArray(groups) ? groups : [];
    const totalMatches = list.length;
    let finishedMatches = 0;
    if (match && totalMatches > 0) {
      for (let i = 0; i < list.length; i++) {
        const group = list[i];
        const sideScores = this._resolveMatchPlayGroupSideScores(match, group, teamIds, isG5);
        const startHole = this._resolveMatchPlayCardStartHole(match, group);
        const summary = this._buildMatchPlayResultSummary(
          sideScores.scoresA,
          sideScores.scoresB,
          startHole
        );
        if (summary && summary.status === 'finished') finishedMatches += 1;
      }
    }
    return {
      finishedMatches: finishedMatches,
      totalMatches: totalMatches,
      matchesCompleteText: finishedMatches + '/' + totalMatches + ' MATCHES COMPLETE'
    };
  },

  /** 该组是否已有任一有效双方洞成绩（未开始 → Details comingSoon） */
  _hasMatchPlayGroupAnyHoleScore(match, group, teamIds, isG5) {
    const sideScores = this._resolveMatchPlayGroupSideScores(match, group, teamIds, isG5);
    const scoresA = sideScores.scoresA || [];
    const scoresB = sideScores.scoresB || [];
    const len = Math.max(scoresA.length, scoresB.length, 18);
    for (let hi = 0; hi < len; hi++) {
      if (
        this._isMatchPlayFilledScore(scoresA[hi]) &&
        this._isMatchPlayFilledScore(scoresB[hi])
      ) {
        const sa = Number(scoresA[hi]);
        const sb = Number(scoresB[hi]);
        if (Number.isFinite(sa) && Number.isFinite(sb)) return true;
      }
    }
    return false;
  },

  /**
   * 对阵卡中间文案 + 状态层 class。
   * 未开始：VS；进行中：THRU + UP/DN/TIED；
   * FINAL / 数学提前结束：与记分页 TOTAL 共用 buildMatchPlayResultSummary（n + &m）。
   */
  _buildMatchPlayCardCenterStatus(match, group, teamIds, isG5) {
    const sideScores = this._resolveMatchPlayGroupSideScores(match, group, teamIds, isG5);
    const scoresA = sideScores.scoresA;
    const scoresB = sideScores.scoresB;
    const startHole = this._resolveMatchPlayCardStartHole(match, group);
    const summary = this._buildMatchPlayResultSummary(scoresA, scoresB, startHole);
    const thru = summary.thru;

    const completed = !!(
      matchStatus.isGroupConfirmedFinished(group && group.status) ||
      matchStatus.getMatchStatus(group, { source: 'groups' }).isCompleted
    );
    const notStarted = !completed && thru === 0;

    if (notStarted) {
      return {
        phaseLabel: '',
        statusMain: 'VS',
        statusSub: '',
        statusLeadClass: 'mp-sb-lead--vs',
        statusLayerClass: 'not-started'
      };
    }

    // 数学结束（领先>剩余）或组已确认结束：顶部显示 FINAL（Details 仍按真实录入洞展示）
    const matchPlayOver = completed || !!summary.clinched;
    const phaseLabel = matchPlayOver ? 'FINAL' : 'THRU ' + thru;
    // FINAL / 已 clinch：用统一摘要 n + &m；进行中未结束仍用 UP/DN
    const useResultSummary = matchPlayOver;
    let statusMain = summary.statusMain;
    let statusSub = summary.statusSub;
    if (!useResultSummary) {
      if (summary.leader === 'A') {
        statusMain = String(summary.up);
        statusSub = 'UP';
      } else if (summary.leader === 'B') {
        statusMain = String(summary.up);
        statusSub = 'DN';
      } else {
        statusMain = 'TIED';
        statusSub = '';
      }
    }

    let statusLeadClass = 'mp-sb-lead--as';
    let statusLayerClass = 'all-square';
    if (summary.leader === 'A') {
      statusLeadClass = 'mp-sb-lead--a';
      statusLayerClass = 'winner-a';
    } else if (summary.leader === 'B') {
      statusLeadClass = 'mp-sb-lead--b';
      statusLayerClass = 'winner-b';
    }

    return {
      phaseLabel: phaseLabel,
      statusMain: statusMain,
      statusSub: statusSub,
      statusLeadClass: statusLeadClass,
      statusLayerClass: statusLayerClass
    };
  },

  /**
   * 与记分页 TOTAL 共用：Match Play Result 摘要（展示层）。
   * 附加 status：finished = 数学结束（clinch）或比赛序已打满 18 洞（FINAL）。
   * 不改动 util 内胜负/杆数计算。
   */
  _buildMatchPlayResultSummary(scoresA, scoresB, startHole) {
    const summary = buildMatchPlayResultSummary(scoresA, scoresB, startHole) || {};
    const thru = Number(summary.thru) || 0;
    const status = summary.clinched || thru >= 18 ? 'finished' : 'open';
    return Object.assign({}, summary, { status: status });
  },

  /** 读取组 startHole：仅 matchPlayMeta，未设默认 1（不写盘、不推断覆盖） */
  _resolveMatchPlayCardStartHole(match, group) {
    const groupId = group && group.groupId != null ? String(group.groupId).trim() : '';
    const bucket = this._readMatchPlayGroupScoreBucket(match, groupId);
    const meta =
      typeof teamMatchStore.normalizeMatchPlayMeta === 'function'
        ? teamMatchStore.normalizeMatchPlayMeta(bucket.matchPlayMeta)
        : null;
    return meta && meta.startHole ? meta.startHole : 1;
  },

  /**
   * Details 表展示层：列序 = startHole 环绕；
   * HOLE=displayHole（A5/B1…）；PAR/STATUS/SCORE 按 actualHole 读数据；
   * 顶部圆点文案 = Match Hole 1–18（不受真实洞号影响），颜色仍按比赛序洞结果。
   */
  _buildMatchPlayCardDetailTable(match, group, teamIds, isG5) {
    const sideScores = this._resolveMatchPlayGroupSideScores(match, group, teamIds, isG5);
    const scoresA = sideScores.scoresA;
    const scoresB = sideScores.scoresB;
    const startHole = this._resolveMatchPlayCardStartHole(match, group);
    const holeColumns = buildMatchPlayHoleTimelineColumns(startHole);
    const pars18 = this._getMatchHolePars(match);
    const holeLabels = [];
    const pars = [];
    const statusCells = [];
    const scoreCells = [];
    const holeDots = [];
    let aWins = 0;
    let bWins = 0;

    for (let ci = 0; ci < holeColumns.length; ci++) {
      const col = holeColumns[ci];
      const actualHole = col.actualHole;
      const hi = actualHole - 1;
      holeLabels.push(col.displayHole);
      const parVal = pars18[hi];
      pars.push(parVal != null && parVal !== '' ? parVal : '-');

      let holeResult = '';
      let dotCls = 'empty';
      const rawA = scoresA[hi];
      const rawB = scoresB[hi];
      const bothFilled =
        this._isMatchPlayFilledScore(rawA) && this._isMatchPlayFilledScore(rawB);
      let sa = NaN;
      let sb = NaN;
      if (bothFilled) {
        sa = Number(rawA);
        sb = Number(rawB);
        if (Number.isFinite(sa) && Number.isFinite(sb)) {
          if (sa < sb) {
            holeResult = 'A';
            dotCls = 'mp-sb-dot--a';
            aWins += 1;
          } else if (sb < sa) {
            holeResult = 'B';
            dotCls = 'mp-sb-dot--b';
            bWins += 1;
          } else {
            holeResult = 'AS';
            dotCls = 'mp-sb-dot--as';
          }
        }
      }

      if (bothFilled && Number.isFinite(sa) && Number.isFinite(sb)) {
        const diff = aWins - bWins;
        let leader = 'AS';
        let up = 0;
        if (diff > 0) {
          leader = 'A';
          up = diff;
        } else if (diff < 0) {
          leader = 'B';
          up = -diff;
        }
        const text =
          leader === 'AS' ? 'TIED' : leader === 'B' ? up + 'DN' : up + 'UP';
        const cls =
          leader === 'A' ? 'mp-sb-st--up' : leader === 'B' ? 'mp-sb-st--dn' : 'mp-sb-st--as';
        statusCells.push({ text: text, cls: cls });
        scoreCells.push({
          a: String(sa),
          b: String(sb),
          result: holeResult,
          splitCls:
            holeResult === 'A'
              ? 'mp-sb-split--a'
              : holeResult === 'B'
                ? 'mp-sb-split--b'
                : 'mp-sb-split--tie',
          empty: false
        });
      } else {
        statusCells.push({ text: '-', cls: '' });
        scoreCells.push({
          a: '-',
          b: '-',
          result: '',
          splitCls: 'mp-sb-split--pending',
          empty: false,
          pending: true
        });
      }

      // 圆点数字 = 比赛序号（1–18），颜色 = 本 Match Hole 对应 actualHole 胜负
      holeDots.push({
        n: ci + 1,
        displayHole: col.displayHole,
        actualHole: actualHole,
        result: holeResult,
        cls: dotCls
      });
    }

    return {
      holeColumns: holeColumns,
      holeLabels: holeLabels,
      pars: pars,
      statusCells: statusCells,
      scoreCells: scoreCells,
      holeDots: holeDots
    };
  },

  /**
   * 顶部红蓝总分：每组 1 分；复用记分页比洞胜负累计规则（Side 洞胜差）。
   * 红胜 +1 / 蓝胜 +1 / 平局各 +0.5；无已决洞的组不计分。
   * @returns {{ redScore: number, blueScore: number }}
   */
  _buildMatchPlayTeamScoreSummary(match) {
    return matchPlayTeamScore.buildMatchPlayTeamScoreSummary(match, {
      resolveAnyPlayerId: (raw) => this._resolveAnyPlayerId(raw)
    });
  },

  /** 整数 → "3"；半分 → "3.5" */
  _formatMatchPlayTeamScore(score) {
    const n = Number(score);
    if (!Number.isFinite(n)) return '0';
    const halfSteps = Math.round(n * 2);
    const rounded = halfSteps / 2;
    if (halfSteps % 2 === 0) return String(Math.round(rounded));
    return String(rounded);
  },

  _isMatchPlayFilledScore(raw) {
    return raw !== null && raw !== undefined && raw !== '';
  },

  _normalizeMatchPlayStartHole(startHole) {
    const n = Number(startHole);
    if (!Number.isFinite(n)) return 1;
    const h = Math.floor(n);
    return h >= 1 && h <= 18 ? h : 1;
  },

  _buildMatchPlayHoleOrder(startHole) {
    const startIdx = this._normalizeMatchPlayStartHole(startHole) - 1;
    const order = [];
    for (let i = 0; i < 18; i++) order.push((startIdx + i) % 18);
    return order;
  },

  _readMatchPlayGroupScoreBucket(match, groupId) {
    const gid = groupId != null ? String(groupId).trim() : '';
    const scoreData =
      match && match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
        ? match.scoreData
        : null;
    const raw = gid && scoreData && scoreData[gid] && typeof scoreData[gid] === 'object'
      ? scoreData[gid]
      : null;
    if (typeof teamMatchStore.normalizeGroupScoreBucket === 'function') {
      return teamMatchStore.normalizeGroupScoreBucket(raw);
    }
    return {
      scoresByPlayer: {},
      scoresBySide: {},
      matchPlayMeta: null
    };
  },

  /**
   * 解析一组双方 Side.scores（对齐记分页：G5 member / G6–G8 combo scoresBySide）
   */
  _resolveMatchPlayGroupSideScores(match, group, teamIds, isG5) {
    const groupId = group && group.groupId != null ? String(group.groupId).trim() : '';
    const bucket = this._readMatchPlayGroupScoreBucket(match, groupId);
    const teamAId = teamIds && teamIds.teamAId ? String(teamIds.teamAId) : '';
    const teamBId = teamIds && teamIds.teamBId ? String(teamIds.teamBId) : '';

    const users =
      match && match.registerInfo && Array.isArray(match.registerInfo.users)
        ? match.registerInfo.users
        : [];
    const teamIdByUser = {};
    users.forEach((user) => {
      const uid = this._resolveAnyPlayerId(user);
      if (!uid) return;
      const teamId =
        user.matchTeamId != null && String(user.matchTeamId).trim() !== ''
          ? String(user.matchTeamId).trim()
          : user.groupId != null && String(user.groupId).trim() !== ''
            ? String(user.groupId).trim()
            : '';
      if (teamId) teamIdByUser[uid] = teamId;
    });

    const filled = (Array.isArray(group && group.players) ? group.players : [])
      .map((p) => ({
        userId: this._resolveAnyPlayerId(p),
        position: Number(p && (p.position != null ? p.position : p.slotIndex)) || 0,
        raw: p
      }))
      .filter((p) => p.userId)
      .sort((a, b) => a.position - b.position || String(a.userId).localeCompare(String(b.userId)));

    const playersA = [];
    const playersB = [];
    filled.forEach((p) => {
      const tid = teamIdByUser[p.userId] || '';
      if (teamAId && tid === teamAId) playersA.push(p);
      else if (teamBId && tid === teamBId) playersB.push(p);
    });
    if (!playersA.length && !playersB.length && filled.length >= 2) {
      playersA.push(filled[0]);
      playersB.push(filled[1]);
    }

    let scoresA = [];
    let scoresB = [];
    if (isG5) {
      const scoresByPlayer =
        bucket.scoresByPlayer && typeof bucket.scoresByPlayer === 'object'
          ? bucket.scoresByPlayer
          : {};
      const recA = playersA[0]
        ? this._resolveScoresByPlayerRecord(scoresByPlayer, playersA[0].raw, playersA[0].userId)
        : null;
      const recB = playersB[0]
        ? this._resolveScoresByPlayerRecord(scoresByPlayer, playersB[0].raw, playersB[0].userId)
        : null;
      scoresA = recA && Array.isArray(recA.scores) ? recA.scores.slice() : [];
      scoresB = recB && Array.isArray(recB.scores) ? recB.scores.slice() : [];
    } else {
      const scoresBySide =
        bucket.scoresBySide && typeof bucket.scoresBySide === 'object' ? bucket.scoresBySide : {};
      const rawA =
        (teamAId && scoresBySide[teamAId]) || scoresBySide.A || scoresBySide.a || null;
      const rawB =
        (teamBId && scoresBySide[teamBId]) || scoresBySide.B || scoresBySide.b || null;
      const normA =
        typeof teamMatchStore.normalizeSideScoreRecord === 'function'
          ? teamMatchStore.normalizeSideScoreRecord(teamAId || 'A', 'A', rawA)
          : rawA;
      const normB =
        typeof teamMatchStore.normalizeSideScoreRecord === 'function'
          ? teamMatchStore.normalizeSideScoreRecord(teamBId || 'B', 'B', rawB)
          : rawB;
      scoresA = normA && Array.isArray(normA.scores) ? normA.scores.slice() : [];
      scoresB = normB && Array.isArray(normB.scores) ? normB.scores.slice() : [];
    }

    let startHole = 1;
    const meta =
      typeof teamMatchStore.normalizeMatchPlayMeta === 'function'
        ? teamMatchStore.normalizeMatchPlayMeta(bucket.matchPlayMeta)
        : null;
    if (meta && meta.startHole) {
      startHole = meta.startHole;
    } else {
      for (let hi = 0; hi < 18; hi++) {
        if (!this._isMatchPlayFilledScore(scoresA[hi]) || !this._isMatchPlayFilledScore(scoresB[hi])) {
          continue;
        }
        const sa = Number(scoresA[hi]);
        const sb = Number(scoresB[hi]);
        if (!Number.isFinite(sa) || !Number.isFinite(sb)) continue;
        startHole = hi + 1;
        break;
      }
    }

    return { scoresA: scoresA, scoresB: scoresB, startHole: startHole };
  },

  /**
   * 一组最终领先方：对齐 score/buildMatchStatusView 的洞胜累计。
   * @returns {'A'|'B'|'AS'|null} null = 尚无已决洞，不计分
   */
  _resolveMatchPlayGroupFinalLeader(match, group, teamIds, isG5) {
    const sideScores = this._resolveMatchPlayGroupSideScores(match, group, teamIds, isG5);
    const scoresA = sideScores.scoresA;
    const scoresB = sideScores.scoresB;
    const holeOrder = this._buildMatchPlayHoleOrder(sideScores.startHole);
    let aWins = 0;
    let bWins = 0;
    let decided = 0;

    for (let oi = 0; oi < holeOrder.length; oi++) {
      const hi = holeOrder[oi];
      const rawA = scoresA[hi];
      const rawB = scoresB[hi];
      if (!this._isMatchPlayFilledScore(rawA) || !this._isMatchPlayFilledScore(rawB)) continue;
      const sa = Number(rawA);
      const sb = Number(rawB);
      if (!Number.isFinite(sa) || !Number.isFinite(sb)) continue;
      decided += 1;
      if (sa < sb) aWins += 1;
      else if (sb < sa) bWins += 1;
    }

    if (!decided) return null;
    const diff = aWins - bWins;
    if (diff > 0) return 'A';
    if (diff < 0) return 'B';
    return 'AS';
  },

  /** teamGroups[0]=红/A，teamGroups[1]=蓝/B */
  _resolveMatchPlaySideTeamIds(match) {
    const teamGroups = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
    const teamAId =
      teamGroups[0] && teamGroups[0].id != null ? String(teamGroups[0].id).trim() : '';
    const teamBId =
      teamGroups[1] && teamGroups[1].id != null ? String(teamGroups[1].id).trim() : '';
    return { teamAId: teamAId, teamBId: teamBId };
  },

  _resolveMatchPlayMemberDisplayName(userId, slotPlayer, playerLookup) {
    const id = userId != null ? String(userId).trim() : '';
    const src = (playerLookup && id && playerLookup[id]) || null;
    const fromSrc = src
      ? String(src.displayName || src.nickname || src.name || '').trim()
      : '';
    const fromSlot = this._resolveAnyPlayerNickname(slotPlayer);
    return this._resolveViewerDisplayName(id, fromSrc || fromSlot || '未知球员', {
      publicName: fromSrc,
      snapshotName: fromSlot || fromSrc,
      identityMasked: !!(src && src.identityMasked) || !!(slotPlayer && slotPlayer.identityMasked)
    });
  },

  _buildMatchPlaySideMember(userId, slotPlayer, playerLookup) {
    const id = userId != null ? String(userId).trim() : '';
    const src = (playerLookup && id && playerLookup[id]) || null;
    const displayName = this._resolveMatchPlayMemberDisplayName(id, slotPlayer, playerLookup);
    return {
      userId: id,
      displayName: displayName,
      nickname: (src && src.nickname) || displayName,
      name: (src && src.name) || displayName,
      avatar: this._resolveGroupedPlayerAvatar(id, slotPlayer, playerLookup)
    };
  },

  _buildMatchPlaySideView(members) {
    const list = Array.isArray(members) ? members.filter((m) => m && m.userId) : [];
    return {
      kind: list.length >= 2 ? 'pair' : 'single',
      members: list
    };
  },

  /**
   * 从 group.players + registerInfo 分队归属拆 A/B side（红/蓝）
   */
  _buildMatchPlayCardSides(match, group, playerLookup, teamIds) {
    const emptySide = { kind: 'single', members: [] };
    const players = Array.isArray(group && group.players) ? group.players : [];
    const filled = players
      .map((p) => ({
        userId: this._resolveAnyPlayerId(p),
        position: Number(p && (p.position != null ? p.position : p.slotIndex)) || 0,
        raw: p
      }))
      .filter((p) => p.userId)
      .sort((a, b) => a.position - b.position || String(a.userId).localeCompare(String(b.userId)));

    if (!filled.length) {
      return { sideA: emptySide, sideB: emptySide };
    }

    const teamAId = teamIds && teamIds.teamAId ? String(teamIds.teamAId) : '';
    const teamBId = teamIds && teamIds.teamBId ? String(teamIds.teamBId) : '';
    const teamIdByUser = {};
    const users =
      match && match.registerInfo && Array.isArray(match.registerInfo.users)
        ? match.registerInfo.users
        : [];
    users.forEach((user) => {
      const uid = this._resolveAnyPlayerId(user);
      if (!uid) return;
      const teamId =
        user.matchTeamId != null && String(user.matchTeamId).trim() !== ''
          ? String(user.matchTeamId).trim()
          : user.groupId != null && String(user.groupId).trim() !== ''
            ? String(user.groupId).trim()
            : '';
      if (teamId) teamIdByUser[uid] = teamId;
    });

    const membersA = [];
    const membersB = [];
    filled.forEach((p) => {
      const member = this._buildMatchPlaySideMember(p.userId, p.raw, playerLookup);
      const teamId = teamIdByUser[p.userId] || '';
      if (teamAId && teamId === teamAId) membersA.push(member);
      else if (teamBId && teamId === teamBId) membersB.push(member);
    });

    // 无分队归属时按座位顺序拆边（G5: 1v1；四人: 前二红后二蓝）
    if (!membersA.length && !membersB.length) {
      if (filled.length <= 2) {
        filled.forEach((p, idx) => {
          const member = this._buildMatchPlaySideMember(p.userId, p.raw, playerLookup);
          if (idx === 0) membersA.push(member);
          else membersB.push(member);
        });
      } else {
        const mid = Math.ceil(filled.length / 2);
        filled.forEach((p, idx) => {
          const member = this._buildMatchPlaySideMember(p.userId, p.raw, playerLookup);
          if (idx < mid) membersA.push(member);
          else membersB.push(member);
        });
      }
    }

    return {
      sideA: this._buildMatchPlaySideView(membersA),
      sideB: this._buildMatchPlaySideView(membersB)
    };
  },

  /**
   * G5 个人比洞：分队 1v1 文字行（group.players + registerInfo + teamGroups）
   * 不读 pairings，不进 _mapGroupCompositionBlock。
   */
  _buildMatchPlayTeamBlock(match, group, playerLookup) {
    const empty = { visible: false, lines: [] };
    const players = Array.isArray(group && group.players) ? group.players : [];
    const filled = players
      .map((p) => ({
        userId: p && p.userId != null ? String(p.userId).trim() : '',
        position: Number(p && (p.position != null ? p.position : p.slotIndex)) || 0
      }))
      .filter((p) => p.userId)
      .sort((a, b) => a.position - b.position || String(a.userId).localeCompare(String(b.userId)));
    if (!filled.length) return empty;

    const users =
      match && match.registerInfo && Array.isArray(match.registerInfo.users)
        ? match.registerInfo.users
        : [];
    const teamIdByUser = {};
    const nameByUser = {};
    users.forEach((user) => {
      const uid = this._resolveAnyPlayerId(user);
      if (!uid) return;
      const teamId =
        user.matchTeamId != null && String(user.matchTeamId).trim() !== ''
          ? String(user.matchTeamId).trim()
          : user.groupId != null && String(user.groupId).trim() !== ''
            ? String(user.groupId).trim()
            : '';
      if (teamId) teamIdByUser[uid] = teamId;
      const nick = this._resolveAnyPlayerNickname(user) || uid;
      nameByUser[uid] = nick;
    });

    const teamNameById = {};
    const teamOrder = [];
    const teamGroups = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
    const sideUnit = isInterTeamMatch(match) ? '球队' : '分队';
    teamGroups.forEach((tg, index) => {
      const id = tg && tg.id != null ? String(tg.id).trim() : '';
      if (!id) return;
      teamOrder.push(id);
      teamNameById[id] = String((tg && tg.name) || '').trim() || (sideUnit + (index + 1));
    });

    const buckets = {};
    filled.forEach((p) => {
      const teamId = teamIdByUser[p.userId] || '__unknown__';
      if (!buckets[teamId]) buckets[teamId] = [];
      buckets[teamId].push(p);
    });

    const orderedTeamIds = [];
    const used = {};
    teamOrder.forEach((id) => {
      if (buckets[id] && buckets[id].length && !used[id]) {
        orderedTeamIds.push(id);
        used[id] = true;
      }
    });
    Object.keys(buckets).forEach((id) => {
      if (!used[id] && buckets[id] && buckets[id].length) {
        orderedTeamIds.push(id);
        used[id] = true;
      }
    });

    const lookup = playerLookup || {};
    const lines = [];
    orderedTeamIds.forEach((teamId) => {
      const members = buckets[teamId] || [];
      const names = members
        .map((m) => {
          const fromLookup = lookup[m.userId] || null;
          return (
            (fromLookup && (fromLookup.nickname || fromLookup.displayName || fromLookup.name))
            || nameByUser[m.userId]
            || m.userId
          );
        })
        .filter(Boolean);
      if (!names.length) return;
      lines.push({
        teamName:
          teamId === '__unknown__'
            ? sideUnit
            : teamNameById[teamId] || teamId || sideUnit,
        namesText: comboDisplayName.joinMemberDisplayNames(names)
      });
    });

    if (!lines.length) return empty;
    return { visible: true, lines: lines };
  },

  /**
   * G4 分组 TAB：pairings → 与 G2/G3 同款文字行
   * 展示：{分队/球队名称}：{球员}（无「组合1/2」标题）
   */
  _mapGroupG4PairingTextBlock(match, group, pairings, playerLookup) {
    const emptyBlock = {
      title: '',
      isCompositionText: true,
      pairings: [],
      hasPairings: false,
      incompletePlayers: [],
      incompleteNamesText: '',
      hasIncomplete: false
    };
    const groupId = group && group.groupId != null ? String(group.groupId) : '';
    if (!groupId) return emptyBlock;
    const list = pairings && Array.isArray(pairings[groupId]) ? pairings[groupId] : [];
    if (!list.length) return emptyBlock;

    const lookup = playerLookup || {};
    const playerTeamLookup = this._buildLeaderboardPlayerTeamLookup(match);
    const teamNameMap = this._buildLeaderboardTeamNameMap(match);

    const comboViews = [];
    list.forEach((pr, idx) => {
      const ids = Array.isArray(pr && pr.playerIds)
        ? pr.playerIds.map((id) => String(id || '').trim()).filter(Boolean)
        : [];
      if (!ids.length) return;

      const names = ids.map((id) => {
        const fromLookup = lookup[id] || null;
        return (fromLookup && fromLookup.nickname) || id || '';
      }).filter(Boolean);
      if (!names.length) return;

      let teamLabel = '';
      for (let i = 0; i < ids.length; i++) {
        const name = this._resolveLeaderboardPlayerTeamName(
          ids[i],
          playerTeamLookup,
          teamNameMap
        );
        if (name) {
          teamLabel = name;
          break;
        }
      }
      if (!teamLabel) teamLabel = isInterTeamMatch(match) ? '球队' : '分队';

      comboViews.push({
        id: (pr && pr.id != null && String(pr.id).trim()) || ('g4_pair_' + (idx + 1)),
        label: teamLabel,
        namesText: comboDisplayName.joinMemberDisplayNames(names),
        members: []
      });
    });

    return {
      title: '',
      isCompositionText: true,
      pairings: comboViews,
      hasPairings: comboViews.length > 0,
      incompletePlayers: [],
      incompleteNamesText: '',
      hasIncomplete: false
    };
  },

  /**
   * 球队赛家族 G2/G3：委托 strokeCompositionResolver，转成文字组合说明
   * 展示：{分队/球队名称}：{球员}（无标题、无序号）；报名 / LIVE 共用
   */
  _mapGroupCompositionBlock(match, group, playerLookup) {
    const emptyBlock = {
      title: '',
      isCompositionText: true,
      pairings: [],
      hasPairings: false,
      incompletePlayers: [],
      incompleteNamesText: '',
      hasIncomplete: false
    };
    const list = resolveStrokeCompositions(match, group);
    if (!Array.isArray(list) || !list.length) return emptyBlock;

    const lookup = playerLookup || {};
    const comboViews = list.map((combo, index) => {
      const membersRaw = Array.isArray(combo && combo.members) ? combo.members : [];
      const names = membersRaw
        .map((m) => {
          const id = m && m.userId != null ? String(m.userId).trim() : '';
          if (!id) return '';
          const fromLookup = lookup[id] || null;
          return (
            (fromLookup && fromLookup.nickname) ||
            (m && m.nickname) ||
            id ||
            ''
          );
        })
        .filter(Boolean);
      const namesText = comboDisplayName.joinMemberDisplayNames(names);
      const teamName =
        combo && combo.teamName != null && String(combo.teamName).trim()
          ? String(combo.teamName).trim()
          : combo && combo.teamId != null && String(combo.teamId).trim()
            ? String(combo.teamId).trim()
            : (isInterTeamMatch(match) ? '球队' : '分队');
      return {
        id: 'composition_' + (index + 1),
        label: teamName,
        namesText: namesText,
        members: []
      };
    }).filter((pr) => pr.namesText);

    return {
      title: '',
      isCompositionText: true,
      pairings: comboViews,
      hasPairings: comboViews.length > 0,
      incompletePlayers: [],
      incompleteNamesText: '',
      hasIncomplete: false
    };
  },

  _resolveGroupedPlayerName(userId, slotPlayer, playerLookup) {
    const id = userId != null ? String(userId).trim() : '';
    const src = (playerLookup && id && playerLookup[id]) || null;
    const publicName = src && src.nickname ? String(src.nickname).trim() : '';
    const fromSlot = this._resolveAnyPlayerNickname(slotPlayer);
    const snapshotName = fromSlot || '';
    return this._resolveViewerDisplayName(id, publicName || snapshotName || '未知球员', {
      publicName: publicName,
      snapshotName: snapshotName,
      identityMasked: !!(src && src.identityMasked) || !!(slotPlayer && slotPlayer.identityMasked)
    });
  },

  _resolveGroupedPlayerAvatar(userId, slotPlayer, playerLookup) {
    const id = userId != null ? String(userId).trim() : '';
    const src = (playerLookup && id && playerLookup[id]) || null;
    const avatarSrc = (src && src.avatar)
      || (slotPlayer && slotPlayer.avatar ? String(slotPlayer.avatar) : '')
      || (slotPlayer && slotPlayer.avatarUrl ? String(slotPlayer.avatarUrl) : '')
      || '';
    return mockAvatars.resolveAvatar(avatarSrc, id);
  },

  _mapGroupPairingBlock(group, pairings, pairingTitle, playerLookup) {
    const groupId = String(group.groupId || '');
    const lookup = playerLookup || {};
    const playerMap = {};
    ((group.players || [])).forEach((p) => {
      const id = this._resolveAnyPlayerId(p);
      if (!id) return;
      playerMap[id] = p;
    });
    const list = Array.isArray(pairings[groupId]) ? pairings[groupId] : [];
    const pairingViews = list.map((pr, idx) => {
      const ids = Array.isArray(pr.playerIds) ? pr.playerIds.map(String) : [];
      const members = ids.map((id) => {
        const p = playerMap[id];
        return {
          userId: id,
          name: this._resolveGroupedPlayerName(id, p, lookup),
          displayName: this._resolveGroupedPlayerName(id, p, lookup),
          avatar: this._resolveGroupedPlayerAvatar(id, p, lookup)
        };
      }).filter((m) => m.userId);
      return {
        id: pr.id || ('pairing_' + (idx + 1)),
        label: '组合' + (idx + 1),
        members: members,
        namesText: comboDisplayName.joinMemberDisplayNames(members)
      };
    }).filter((pr) => pr.members && pr.members.length);

    const paired = {};
    pairingViews.forEach((pr) => {
      (pr.members || []).forEach((m) => { paired[m.userId] = true; });
    });
    const incomplete = ((group.players || [])
      .filter((p) => p && this._resolveAnyPlayerId(p) && !paired[this._resolveAnyPlayerId(p)])
      .map((p) => {
        const id = this._resolveAnyPlayerId(p);
        const name = this._resolveGroupedPlayerName(id, p, lookup);
        return {
          userId: id,
          name: name,
          displayName: name,
          avatar: this._resolveGroupedPlayerAvatar(id, p, lookup)
        };
      }));

    return {
      title: pairingTitle,
      pairings: pairingViews,
      hasPairings: pairingViews.length > 0,
      incompletePlayers: incomplete,
      incompleteNamesText: incomplete.map((p) => p.name).filter(Boolean).join('、'),
      hasIncomplete: incomplete.length > 0
    };
  },

  /** 跳转独立分组编辑页（开始分组 / 修改分组） */
  onOpenGroupEditor() {
    if (!this.data.canManageGroups) return;
    const matchId = this.data.matchId || '';
    if (!matchId) {
      wx.showToast({ title: '未找到比赛信息', icon: 'none' });
      return;
    }
    const liveMatch = teamMatchStore.getMatchById(matchId);
    if (teamMatchFinish.isMatchCompleted(liveMatch)) {
      wx.showToast({ title: teamMatchFinish.MATCH_FINISHED_TOAST, icon: 'none' });
      return;
    }
    const mode = this.data.matchStatus && this.data.matchStatus.isOngoing
      ? 'live'
      : (this.data.hasFormalGroups ? 'edit' : 'create');
    wx.navigateTo({
      url: '/subpackages/tournament-manage/pages/group-editor/index?matchId=' + encodeURIComponent(matchId) +
        '&mode=' + encodeURIComponent(mode)
    });
  },

  // 赛事生命周期：读取 teamMatchStore.match.status，归一化为 registering | ongoing | completed
  // 持久化 status="finished" 视为已结束（completed）
  _getMatchLifecycle(match) {
    if (!match) return Object.assign({}, EMPTY_MATCH_LIFECYCLE);
    const raw = String(match.status || '').trim().toLowerCase();
    let status = '';
    if (raw === 'finished' || raw === MATCH_LIFECYCLE.COMPLETED) {
      status = MATCH_LIFECYCLE.COMPLETED;
    } else if (raw === MATCH_LIFECYCLE.REGISTERING || raw === MATCH_LIFECYCLE.ONGOING) {
      status = raw;
    }
    return {
      status: status,
      isRegistering: status === MATCH_LIFECYCLE.REGISTERING,
      isOngoing: status === MATCH_LIFECYCLE.ONGOING,
      isCompleted: status === MATCH_LIFECYCLE.COMPLETED
    };
  },

  /** 英雄区状态芯片：finished → 已结束；其余未结束（进行中）→ LIVE */
  _resolveCardStatusDisplay(match) {
    const status = String((match && match.status) || '').trim().toLowerCase();
    if (teamMatchFinish.isMatchCompleted(match)) {
      return { cardStatusText: '已结束', cardStatusTone: 'finished' };
    }
    if (status === 'registering') {
      return {
        cardStatusText: (match && match.statusLabel) || '报名中',
        cardStatusTone: 'default'
      };
    }
    return { cardStatusText: 'LIVE', cardStatusTone: 'live' };
  },

  // 将 teamMatchStore 记录映射为顶部信息区视图字段
  _mapMatchToView(match) {
    if (!match) return Object.assign({}, EMPTY_MATCH_VIEW);
    const venue = [match.courseName, match.courseHalfText].filter(Boolean).join('');
    const priceTags = this._mapPriceTags(match);
    const cardStatus = this._resolveCardStatusDisplay(match);
    return {
      matchId: match.matchId || '',
      status: String(match.status || '').trim(),
      statusLabel: match.statusLabel || '',
      cardStatusText: cardStatus.cardStatusText,
      cardStatusTone: cardStatus.cardStatusTone,
      logo: this._resolveMatchLogo(match),
      bannerImage: bannerConfig.resolveMatchDetailBanner(match.bannerImage),
      dateText: teamMatchStore.formatClubDate(match.teeTime) || '',
      titleMain: match.roundName || resolveOrganizerDisplay(match).name || match.teamName || '',
      titleSub: resolveOrganizerDisplay(match).name || match.teamName || '',
      formatLabel: match.gameMode || '',
      typeLabel: this._resolveTypeLabel(match),
      organizer: this._resolveOrganizer(match),
      organizerSectionLabel: resolveHeroOrganizerSectionLabel(match),
      venue: venue,
      timeText: this._resolveTimeText(match),
      priceTags: priceTags,
      priceText: priceTags.join('  ')
    };
  },

  _resolveMatchLogo(match) {
    if (!match) return '';
    // 赛事自带 matchLogo 优先（品牌）；否则用发起主体 logo（队际含组织 logo）
    return match.matchLogo || resolveOrganizerDisplay(match).logo || '';
  },

  _resolveOrganizer(match) {
    if (!match) return '';
    return resolveOrganizerDisplay(match).name || '';
  },

  _resolveTimeText(match) {
    if (!match) return '';
    const text = String(match.teeTimeText || '').trim();
    if (text) return text;
    const m = String(match.teeTime || '').match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
    if (!m) return '';
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const day = parseInt(m[3], 10);
    const weekday = WEEK_NAMES[new Date(year, month - 1, day).getDay()];
    return year + '/' + m[2] + '/' + m[3] + ' ' + weekday + ' ' + m[4] + ':' + m[5];
  },

  _resolveTypeLabel(match) {
    if (!match) return '';
    const matchType = match.matchType || 'team-internal';
    return MATCH_TYPE_LABELS[matchType] || '';
  },

  _mapPriceTags(match) {
    if (!match || !match.feeSet || !Array.isArray(match.feeList) || !match.feeList.length) {
      return ['暂无'];
    }
    const isDiamond = !!match.isDiamondMode;
    return match.feeList.map((fee) => {
      const name = String((fee && fee.name) || '').trim();
      const amount = fee && fee.amount != null ? String(fee.amount) : '0';
      const price = isDiamond ? amount + '💎' : '￥' + amount;
      return name ? name + ' ' + price : price;
    });
  },

  _resolveEventInfoImage(item, theme) {
    if (!item || String(item.type) !== 'image') return '';
    const bright = String(item.brightImage != null ? item.brightImage : (item.imageData || '')).trim();
    const dark = String(item.darkImage != null ? item.darkImage : (item.imageData || '')).trim();
    return theme === 'dark' ? (dark || bright) : (bright || dark);
  },

  _resolveEventInfoList(match, theme) {
    const resolvedTheme = theme || getApp().getTheme();
    if (!match || !Array.isArray(match.eventInfoList)) return [];
    return match.eventInfoList
      .map((item) => {
        const title = item && item.title ? String(item.title) : '';
        const content = item && item.content != null ? String(item.content) : '';
        const type = item && item.type ? String(item.type) : '';
        const isPhotoLive = title === '照片直播' || title === '交通说明';
        const photoLiveValid = isPhotoLive && /^https:\/\/.+/i.test(String(content || '').trim())
          && !/^http:\/\//i.test(String(content || '').trim());
        return {
          id: item && item.id != null ? item.id : '',
          title: isPhotoLive ? '照片直播' : title,
          type: type,
          content: content,
          imageData: this._resolveEventInfoImage(item, resolvedTheme),
          status: item && item.status ? String(item.status) : '',
          isPhotoLive: isPhotoLive,
          photoLiveValid: !!photoLiveValid
        };
      })
      .filter((item) => {
        if (item.isPhotoLive) return item.photoLiveValid;
        return true;
      });
  },

  onCopyPhotoLiveLink(e) {
    const url = String((e.currentTarget.dataset && e.currentTarget.dataset.url) || '').trim();
    if (!url) return;
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showToast({
          title: '照片直播链接已复制，请在微信中打开查看',
          icon: 'none',
          duration: 2500
        });
      }
    });
  },

  /** COS 默认广告图加载失败 → 回退本地 assets/partners */
  onEventSponsorImageError(e) {
    const id = e.currentTarget.dataset.id;
    const list = (this.data.eventInfoList || []).slice();
    const idx = list.findIndex((item) => item && String(item.id) === String(id));
    if (idx < 0) return;
    const current = String((list[idx] && list[idx].imageData) || '').trim();
    const fallback = eventSponsorConfig.getEventSponsorLocalFallback(current);
    if (!fallback || fallback === current) return;
    list[idx] = Object.assign({}, list[idx], { imageData: fallback });
    this.setData({ eventInfoList: list });
  },

  /** 默认赛事 BANNER 加载失败：无远程 fallback 时清空，避免反复 error */
  onMatchBannerError() {
    const match = this.data.match || {};
    const current = String(match.bannerImage || '').trim();
    const fallback = bannerConfig.getBannerLocalFallback(current, 'matchDetail');
    if (!fallback || fallback === current) {
      // 默认 COS 图失败且无 fallback：保持现状即可
      return;
    }
    this.setData({ 'match.bannerImage': fallback });
  },

  _resolveRegisterSubTabs(match, registerInfo) {
    const source = match && Array.isArray(match.teamGroups) && match.teamGroups.length
      ? match.teamGroups
      : DEFAULT_REGISTER_GROUPS;
    const users = registerInfo && Array.isArray(registerInfo.users) ? registerInfo.users : [];
    const interTeam = isInterTeamMatch(match);
    return source.map((group, index) => {
      const name = String((group && group.name) || '').trim() || ('分组' + (index + 1));
      const id = group && group.id != null ? String(group.id) : ('register-group-' + (index + 1));
      const count = users.filter((user) => String(user.groupId) === id).length;
      const logo = interTeam
        ? String((group && group.sourceTeamLogo) || '').trim() || DEFAULT_ORG_LOGO
        : '';
      return {
        id: id,
        name: name,
        logo: logo,
        count: count,
        label: name + '(' + count + ')'
      };
    });
  },

  _resolveRegisterInfo(match) {
    if (!match || !match.registerInfo) return Object.assign({}, EMPTY_REGISTER_INFO);
    // 旧报名记录缺省字段在 store.normalize 中按「本人报名」补齐
    const normalized = teamMatchStore.normalizeRegisterInfo(match.registerInfo);
    const users = (normalized.users || []).map((user) => {
      const genderDisplay = playerManage.getGenderDisplay(user);
      const userType = user.userType || '';
      const identitySource = user.identitySource || '';
      return {
        userId: user.userId || user.playerId || user.id || user.uid || user.openid || '',
        // 本场比赛名：matchNickname 优先
        competitionName: playerManage.resolveMatchNickname(user),
        matchNickname: user.matchNickname || '',
        nickname: user.nickname || '',
        gender: playerManage.resolveMatchGender(user),
        sex: user.sex || '',
        genderIcon: genderDisplay.icon,
        genderClass: genderDisplay.className,
        matchGender: user.matchGender || '',
        handicap: user.handicap != null ? user.handicap : '',
        paymentConfirmed: user.paymentConfirmed === true,
        avatar: user.avatar || user.avatarUrl || '',
        phone: user.phone || '',
        groupId: playerManage.resolveMatchTeamId(user),
        groupName: playerManage.resolveMatchTeamName(user),
        matchTeamId: user.matchTeamId || '',
        matchTeamName: user.matchTeamName || '',
        registeredAt: user.registeredAt != null ? user.registeredAt : '',
        source: user.source || 'self',
        registeredBy: user.registeredBy || '',
        registeredByName: user.registeredByName || '',
        subjectType: user.subjectType || 'self',
        pickChannel: user.pickChannel || '',
        canSelfCancel: user.canSelfCancel !== false,
        locked: !!user.locked,
        // Patch 8：手工代报名预留字段，与 store.normalize 对齐
        userType: userType,
        identitySource: identitySource,
        identityLabel: user.identityLabel || '',
        identitySourceLabel: user.identitySourceLabel || '',
        realName: user.realName || '',
        remarkName: user.remarkName || ''
      };
    });
    return {
      totalCount: normalized.totalCount,
      users: users
    };
  },

  _filterRegisterUsers(registerInfo, activeRegisterSubTab) {
    const users = registerInfo && Array.isArray(registerInfo.users) ? registerInfo.users : [];
    const groupId = String(activeRegisterSubTab || '');
    if (!groupId) return [];
    this._getViewerRemarkNameMap();
    return users
      .filter((user) => String(user.groupId) === groupId)
      .map((user, index) => {
        const genderDisplay = playerManage.getGenderDisplay(user);
        const userId = user.userId || '';
        const snapshotName = playerManage.resolveMatchNickname(user) || '';
        const publicName = String(user.nickname || user.displayName || '').trim();
        const named = playerDisplayName.resolvePlayerDisplayNameForViewer({
          viewerUserId: (this._viewerRemarkCtx && this._viewerRemarkCtx.viewer) || '',
          targetUserId: userId,
          publicName: publicName,
          snapshotName: snapshotName,
          identityMasked: !!user.identityMasked,
          remarkNameMap: this._getViewerRemarkNameMap(),
          defaultName: '未知球员'
        });
        return {
          listKey: user.userId || ('register-user-' + groupId + '-' + index),
          userId: userId,
          playerId: userId,
          // 仅 View Model：备注优先；底层 registerInfo 未被修改
          competitionName: named.displayName,
          gender: user.gender || '',
          sex: user.sex || '',
          genderIcon: user.genderIcon || genderDisplay.icon,
          genderClass: user.genderClass || genderDisplay.className,
          // 江湖差点空值统一显示 "-"（0 为有效差点，需保留）
          handicap: (user.handicap != null && user.handicap !== '') ? String(user.handicap) : '-',
          paymentConfirmed: user.paymentConfirmed === true,
          avatar: user.avatar || '',
          phone: user.phone || '',
          groupId: user.groupId || '',
          groupName: user.groupName || '',
          registeredAt: user.registeredAt != null ? user.registeredAt : '',
          source: user.source || 'self',
          registeredBy: user.registeredBy || '',
          registeredByName: user.registeredByName || '',
          subjectType: user.subjectType || 'self',
          pickChannel: user.pickChannel || '',
          canSelfCancel: user.canSelfCancel !== false,
          locked: !!user.locked,
          userType: user.userType || '',
          identitySource: user.identitySource || '',
          identityLabel: user.identityLabel || '',
          identitySourceLabel: user.identitySourceLabel || '',
          contactRemark: '',
          realName: user.realName || '',
          remarkName: user.remarkName || ''
        };
      });
  },

  _resolveCurrentUserRegisterStatus(registerInfo) {
    const currentUserId = String((gameStore.getCurrentUser() || {}).userId || '');
    if (!currentUserId) return Object.assign({}, EMPTY_CURRENT_USER_REGISTER_STATUS);
    const users = registerInfo && Array.isArray(registerInfo.users) ? registerInfo.users : [];
    const matched = users.find((user) => String(user.userId) === currentUserId);
    if (!matched) return Object.assign({}, EMPTY_CURRENT_USER_REGISTER_STATUS);
    return {
      isRegistered: true,
      groupId: matched.groupId != null ? String(matched.groupId) : '',
      groupName: matched.groupName ? String(matched.groupName) : ''
    };
  },

  switchRegisterSubTab(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || id === this.data.activeRegisterSubTab) return;
    const registerDisplayUsers = this._filterRegisterUsers(this.data.registerInfo, id);
    this.setData({
      activeRegisterSubTab: id,
      registerDisplayUsers: registerDisplayUsers,
      // 列表变化后高度需重测；吸顶前保持未锁定
      registrationContentLocked: this._resolveRegistrationContentLocked({
        isStickyTab: this.data.isStickyTab,
        activeTab: 'register'
      })
    }, () => {
      this.updateRegisterStickySpacer();
      this.updateRegisterContentLockMetrics();
    });
  },

  /**
   * 报名 Tab 底部 CTA 是否允许展示（不含 activeTab / hideRegisterCTA）。
   * - registering：原逻辑
   * - 球队赛家族（team-internal / inter-team）ongoing：保留报名 CTA，流程与报名期共用
   * - completed / series / 普通球局：不显示
   */
  _shouldShowRegisterTabCTA(match) {
    const lifecycle = this._getMatchLifecycle(match);
    if (!lifecycle || lifecycle.isCompleted) return false;
    if (lifecycle.isRegistering) return true;
    return !!(lifecycle.isOngoing && isTeamMatchFamily(match));
  },

  /**
   * 依据 match 重建报名相关的页面数据（loadMatch 与报名成功后共用）
   * @param {object} match teamMatchStore 中的赛事对象
   * @param {string} preferredSubTab 期望保持选中的分组 id（可选）
   */
  _buildRegisterStatePatch(match, preferredSubTab) {
    const registerInfo = this._resolveRegisterInfo(match);
    const registerSubTabs = this._resolveRegisterSubTabs(match, registerInfo);
    let activeRegisterSubTab = '';
    if (preferredSubTab && registerSubTabs.some((tab) => tab.id === preferredSubTab)) {
      activeRegisterSubTab = preferredSubTab;
    } else if (registerSubTabs.length) {
      activeRegisterSubTab = registerSubTabs[0].id;
    }
    const registerDisplayUsers = this._filterRegisterUsers(registerInfo, activeRegisterSubTab);
    return {
      registerInfo: registerInfo,
      registerTotalCount: registerInfo.totalCount,
      registerSubTabs: registerSubTabs,
      activeRegisterSubTab: activeRegisterSubTab,
      registerDisplayUsers: registerDisplayUsers,
      registrationContentLocked: this._resolveRegistrationContentLocked({
        isStickyTab: this.data.isStickyTab,
        activeTab: this.data.activeTab
      }),
      currentUserRegisterStatus: this._resolveCurrentUserRegisterStatus(registerInfo),
      registerPermission: this._resolveRegisterPermission(match),
      showRegisterTabCTA: this._shouldShowRegisterTabCTA(match)
    };
  },

  /**
   * 报名内容锁定：activeTab===register && isStickyTab && 内容高度未超出吸顶后可视区。
   * 吸顶前恒为 false；高度未测出前不锁，避免提前禁滚。
   */
  _resolveRegistrationContentLocked(opts) {
    const o = opts || {};
    const activeTab = o.activeTab != null ? o.activeTab : this.data.activeTab;
    if (activeTab !== 'register') return false;
    const isStickyTab = o.isStickyTab != null ? !!o.isStickyTab : !!this.data.isStickyTab;
    if (!isStickyTab) return false;
    const contentH = o.contentH != null
      ? Number(o.contentH)
      : Number(this._registerContentHeight != null
        ? this._registerContentHeight
        : this.data.registerContentHeight);
    const availableH = o.availableH != null
      ? Number(o.availableH)
      : Number(this._availableRegisterViewportHeight != null
        ? this._availableRegisterViewportHeight
        : this.data.availableRegisterViewportHeight);
    if (!(availableH > 0) || !(contentH > 0)) return false;
    return contentH <= availableH + REGISTER_CONTENT_LOCK_EPS;
  },

  /**
   * 吸顶后允许的最大 scrollTop（主 TAB 吸顶阈值）。
   * 仅用于「已吸顶且内容未溢出」时阻止继续上推，绝不把 scrollTop 拉回阈值以下。
   */
  _getRegisterScrollLockMax() {
    const tabThreshold = this.data.tabOffsetTop || 0;
    const extThreshold = this.data.registerExtOffsetTop || 0;
    const stickyTop = this.data.stickyRegisterExtTop || 0;
    const forTab = tabThreshold > 0 ? tabThreshold : 0;
    const forExt = extThreshold > 0 ? Math.max(0, extThreshold - stickyTop) : forTab;
    return Math.max(forTab, forExt);
  },

  /**
   * 吸顶后内容未溢出：仅当 scrollTop 越过锁点时回写到锁点（不低于吸顶阈值）。
   * 不改内容高度，避免「吸顶又弹回」。
   */
  _clampRegisterScrollAfterSticky(scrollTop, forcedLocked) {
    const locked = forcedLocked != null ? !!forcedLocked : !!this.data.registrationContentLocked;
    if (!locked) return scrollTop;
    const max = this._getRegisterScrollLockMax();
    if (!(max > 0) || scrollTop <= max + 2) return scrollTop;
    if (this._registerScrollClamping) return max;
    this._registerScrollClamping = true;
    // scroll-top 需值变化才生效
    const tick = (this._detailScrollTick = (this._detailScrollTick || 0) + 1);
    const next = max + (tick % 2) * 0.01;
    this.setData({ detailScrollTop: next }, () => {
      this._registerScrollClamping = false;
    });
    return max;
  },

  /**
   * 测量报名内容高度与吸顶后可用可视高度，并据此更新 registrationContentLocked。
   * registerContentHeight：.register-roster-card 实际渲染高度（含空态/min-height 撑高后的视觉高度）。
   * availableRegisterViewportHeight：窗口 - HEADER - 主TAB - 报名扩展区 - CTA/安全区 - 间距。
   * @param {{ forceSticky?: boolean }} [opts] forceSticky：刚吸顶时 setData 尚未落地，显式按已吸顶计算
   */
  updateRegisterContentLockMetrics(opts) {
    if (this.data.activeTab !== 'register') return;
    const forceSticky = !!(opts && opts.forceSticky);
    let sys = { windowWidth: 375, windowHeight: 667, safeBottom: 0 };
    try {
      sys = readTournamentDetailSafeAreaLayout() || sys;
    } catch (e) {}
    const winH = sys.windowHeight || 667;
    const rpx2px = (sys.windowWidth || 375) / 750;
    const safeBottom = sys.safeBottom || 0;
    this.createSelectorQuery()
      .in(this)
      .select('.gb-header').boundingClientRect()
      .select('.tab-scroll-wrap--inflow').boundingClientRect()
      .select('.register-ext-wrap--inflow').boundingClientRect()
      .select('.register-cta-bar').boundingClientRect()
      .select('.register-roster-card').boundingClientRect()
      .exec((res) => {
        res = res || [];
        const headerH = res[0] && res[0].height ? res[0].height : (this.data.headerTotalHeight || 92);
        const mainTabH = res[1] && res[1].height ? res[1].height : (this.data.tabBarHeight || 50);
        const extH = res[2] && res[2].height ? res[2].height : 116 * rpx2px;
        const ctaH = res[3] && res[3].height ? res[3].height : 0;
        const cardRect = res[4];
        const bottomReserve = ctaH > 0 ? ctaH : safeBottom;
        const gap = 40 * rpx2px;
        let availableH = winH - headerH - mainTabH - extH - bottomReserve - gap;
        if (!(availableH > 0)) availableH = 0;
        availableH = Math.round(availableH);
        const contentH = cardRect && cardRect.height ? Math.round(cardRect.height) : 0;
        this._availableRegisterViewportHeight = availableH;
        this._registerContentHeight = contentH;
        const stickyNow = forceSticky || !!this.data.isStickyTab;
        const locked = this._resolveRegistrationContentLocked({
          activeTab: 'register',
          isStickyTab: stickyNow,
          contentH: contentH,
          availableH: availableH
        });
        const patch = {};
        if (availableH !== this.data.availableRegisterViewportHeight) {
          patch.availableRegisterViewportHeight = availableH;
        }
        if (contentH !== this.data.registerContentHeight) {
          patch.registerContentHeight = contentH;
        }
        if (locked !== this.data.registrationContentLocked) {
          patch.registrationContentLocked = locked;
        }
        const applyClamp = () => {
          if (locked) {
            this._clampRegisterScrollAfterSticky(this.data.scrollYState || 0, true);
          }
        };
        if (Object.keys(patch).length) {
          this.setData(patch, applyClamp);
        } else {
          applyClamp();
        }
      });
  },

  /**
   * 内容不足以滚到 TAB 吸顶时补齐 spacer（与人数无关）。
   * 只服务吸顶可达；吸顶后短内容由 scrollTop 钳制，不靠 spacer 制造空滑。
   */
  updateRegisterStickySpacer() {
    if (this.data.activeTab !== 'register') {
      if (this.data.registrationStickySpacerHeight) {
        this.setData({ registrationStickySpacerHeight: 0 });
      }
      return;
    }
    const tabOffsetTop = this.data.tabOffsetTop || 0;
    if (!(tabOffsetTop > 0)) return;
    wx.createSelectorQuery()
      .in(this)
      .select('.detail-scroll')
      .boundingClientRect()
      .select('.detail-scroll')
      .scrollOffset()
      .exec((res) => {
        const view = res && res[0];
        const off = res && res[1];
        if (!view || !off) return;
        const viewportH = view.height || 0;
        const scrollH = off.scrollHeight || 0;
        const spacerNow = this.data.registrationStickySpacerHeight || 0;
        const contentWithoutSpacer = Math.max(0, scrollH - spacerNow);
        // 需要能滚到 TAB 吸顶阈值，再留一点 buffer
        const needMaxScroll = tabOffsetTop + 16;
        const needContentH = viewportH + needMaxScroll;
        const spacer = Math.max(0, Math.ceil(needContentH - contentWithoutSpacer));
        if (spacer !== spacerNow) {
          this.setData({ registrationStickySpacerHeight: spacer });
        }
      });
  },

  /**
   * 报名开关判断（registrationStatus 优先于用户报名状态；deadlineTime 不参与权限）
   */
  _normalizeRegistrationStatus(match) {
    const raw = String(
      (match && (match.registrationStatus || match.registerStatus)) || 'open'
    ).trim().toLowerCase();
    return raw === 'closed' ? 'closed' : 'open';
  },

  _resolveRegisterPermission(match) {
    if (!match) {
      return {
        registrationStatus: 'closed',
        isOpen: false,
        reason: registrationInteractionModel.resolveRegistrationCtaCopy('closed')
      };
    }
    const registrationStatus = this._normalizeRegistrationStatus(match);
    if (registrationStatus === 'closed') {
      return {
        registrationStatus: 'closed',
        isOpen: false,
        reason: registrationInteractionModel.resolveRegistrationCtaCopy('closed')
      };
    }
    return { registrationStatus: 'open', isOpen: true, reason: '' };
  },

  _showRegistrationClosedModal() {
    const closed = registrationInteractionModel.buildRegistrationClosedModal();
    wx.showModal({
      title: closed.title,
      content: closed.content,
      showCancel: closed.showCancel,
      confirmText: closed.confirmText
    });
  },

  _buildSelfCancelDialogPatch(grouped) {
    const model = registrationInteractionModel.buildSelfCancelDialogModel({
      grouped: !!grouped
    });
    return {
      registerCancelModalVisible: true,
      registerCancelModalTitle: model.title,
      registerCancelModalDesc: model.desc,
      registerCancelModalCancelText: model.cancelText,
      registerCancelModalConfirmText: model.confirmText,
      registerCancelSubmitting: false
    };
  },

  _buildRegistrationLog(options) {
    const opts = options || {};
    const user = gameStore.getCurrentUser() || {};
    const operatorId = String(user.userId || user.id || '').trim();
    return {
      action: 'registration_status_changed',
      before: opts.before,
      after: opts.after,
      operatorId: operatorId,
      operatorName: String(user.nickname || user.displayName || user.name || operatorId || '管理员'),
      createdAt: Date.now()
    };
  },

  /**
   * 报名开关菜单项（报名中 / 队际赛 LIVE 共用文案与图标）。
   * @param {object|null} match
   * @returns {{permission:string,glyph:string,label:string,tone:string}}
   */
  _buildCloseRegistrationFeature(match) {
    return teamMatchMoreMenu.buildCloseRegistrationFeature(match);
  },

  /**
   * 当前是否允许操作报名开关（显隐与动作共用）。
   * 报名中任意球队赛；球队赛家族（team-internal / inter-team）ongoing；
   * completed/finished / series / 普通球局：否。
   */
  _canToggleRegistrationStatus(match) {
    return teamMatchMoreMenu.canToggleRegistrationStatus(match);
  },

  toggleRegistrationStatus() {
    const matchId = this.data.matchId || '';
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    if (!match) {
      wx.showToast({ title: '赛事数据缺失', icon: 'none' });
      return;
    }
    if (!this._canToggleRegistrationStatus(match)) {
      wx.showToast({ title: '当前状态不可操作报名开关', icon: 'none' });
      return;
    }
    if (
      !matchManageAccess.hasMatchManagePermission(
        match,
        gameStore.getCurrentUser(),
        'close_registration'
      )
    ) {
      wx.showToast({ title: '暂无该管理权限', icon: 'none' });
      return;
    }
    const before = this._normalizeRegistrationStatus(match);
    const after = before === 'closed' ? 'open' : 'closed';
    match.registrationStatus = after;
    match.registrationLogs = Array.isArray(match.registrationLogs) ? match.registrationLogs : [];
    match.registrationLogs = match.registrationLogs.concat(this._buildRegistrationLog({
      before: before,
      after: after
    }));
    teamMatchStore.saveMatch(match);
    const patch = this._buildRegisterStatePatch(match, this.data.activeRegisterSubTab);
    this.setData(patch, () => {
      this.applyMoreAccess();
      if (this.data.activeTab === 'register') this.measureRegisterExtTop();
    });
    wx.showToast({
      title: after === 'closed' ? '报名已关闭' : '报名已打开',
      icon: 'success'
    });
  },

  startTournamentMatch() {
    const matchId = this.data.matchId || '';
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    if (!match) {
      wx.showToast({ title: '赛事数据缺失', icon: 'none' });
      return;
    }
    // 动作层：已完赛不得开始；创建者/发起主体管理员全权，联合管理员须显式拥有 start_match
    if (String(match.status || '').trim().toLowerCase() === 'finished') {
      wx.showToast({ title: '比赛已经结束。', icon: 'none' });
      return;
    }
    if (
      !matchManageAccess.hasMatchManagePermission(
        match,
        gameStore.getCurrentUser(),
        'start_match'
      )
    ) {
      wx.showToast({ title: '暂无该管理权限', icon: 'none' });
      return;
    }
    detailDebugLog('[start-match-before]', {
      matchId: matchId,
      status: match.status || '',
      statusLabel: match.statusLabel || '',
      registrationStatus: match.registrationStatus || match.registerStatus || ''
    });
    match.status = MATCH_LIFECYCLE.ONGOING;
    match.statusLabel = '比赛进行中';
    match.updatedAt = Date.now();
    teamMatchStore.saveMatch(match);
    const savedMatch = teamMatchStore.getMatchById(matchId) || match;
    detailDebugLog('[start-match-after]', {
      matchId: matchId,
      status: savedMatch.status || '',
      statusLabel: savedMatch.statusLabel || '',
      registrationStatus: savedMatch.registrationStatus || savedMatch.registerStatus || ''
    });
    // 同页刷新：重建 Tab 顺序并保留 activeTab（开赛前停在报名则仍停在报名）
    this.refreshMatchData(matchId);
    this.applyMoreAccess();
    wx.showModal({
      title: '提示',
      content: '比赛已进入LIVE状态，请到“广场-球队比赛”页面查看',
      showCancel: false,
      confirmText: '确认',
      success: (res) => {
        if (!res.confirm) return;
        detailDebugLog('[start-match-navigate]');
        // 广场 → 球队比赛 TAB（勿回赛事/详情）
        const plazaTeamUrl = '/pages/home/index?section=plaza&tab=tournament';
        wx.redirectTo({
          url: plazaTeamUrl,
          fail: () => {
            wx.reLaunch({ url: plazaTeamUrl });
          }
        });
      }
    });
  },

  /* ===== 立即报名流程：分组选择 + 比赛名 + 手机号 ===== */
  openRegisterSheet() {
    // 已完赛：不打开；报名中 / 球队赛家族 LIVE 与底部 CTA 门控一致
    const match = this.data.matchId
      ? teamMatchStore.getMatchById(this.data.matchId)
      : null;
    if (!this._shouldShowRegisterTabCTA(match)) return;
    if (!this.data.registerPermission.isOpen) return;
    if (this.data.currentUserRegisterStatus.isRegistered) return;
    const profile = userProfileStore.loadProfile();
    const user = gameStore.getCurrentUser() || {};
    const subTabs = this.data.registerSubTabs || [];
    const defaultGroupId = isInterTeamMatch(match)
      ? resolveDefaultRegisterGroupId(match, subTabs)
      : subTabs.length
        ? subTabs[0].id
        : '';
    this.setData({
      registerSheetVisible: true,
      registerSheetGroupId: defaultGroupId,
      registerCompetitionNameDraft: userProfileStore.getRegisterCompetitionNameDefault(profile),
      // 性别唯一来源：个人资料 gender（弹窗内只读展示，不可编辑）
      registerGenderDraft: profile.gender || '',
      registerPhone: user.phone ? String(user.phone) : ''
    });
  },

  closeRegisterSheet() {
    this.setData({ registerSheetVisible: false });
  },

  selectRegisterSheetGroup(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.setData({ registerSheetGroupId: id });
  },

  onRegisterCompetitionNameInput(e) {
    this.setData({ registerCompetitionNameDraft: e.detail.value || '' });
  },

  confirmRegister() {
    if (this.data.registerSubmitting) return;
    if (!(this.data.registerPermission && this.data.registerPermission.isOpen)) {
      this.setData({ registerSheetVisible: false });
      return;
    }
    if (this.data.currentUserRegisterStatus.isRegistered) {
      this.setData({ registerSheetVisible: false });
      return;
    }

    // 1. 分组 / 球队必选
    const groupId = String(this.data.registerSheetGroupId || '');
    const selectedGroup = (this.data.registerSubTabs || []).find((tab) => tab.id === groupId);
    if (!selectedGroup) {
      const pickToast = this.data.isInterTeamMatch
        ? '请选择报名球队'
        : '请选择报名分组';
      wx.showToast({ title: pickToast, icon: 'none' });
      return;
    }

    // 2. 最终比赛名（以用户最终输入为准），有变化则写回 competitionName
    const competitionName = userProfileStore.resolveRegisterCompetitionName(this.data.registerCompetitionNameDraft);
    if (!competitionName) {
      wx.showToast({ title: '请输入比赛名', icon: 'none' });
      return;
    }
    const profile = userProfileStore.loadProfile();
    if (competitionName !== (profile.competitionName || '')) {
      userProfileStore.setCompetitionName(competitionName);
    }

    // 3. 读取最新赛事对象，写入 registerInfo.users
    const match = teamMatchStore.getMatchById(this.data.matchId);
    if (!match) {
      wx.showToast({ title: '赛事数据缺失', icon: 'none' });
      return;
    }
    if (this._normalizeRegistrationStatus(match) === 'closed') {
      this.setData({ registerSheetVisible: false, registerSubmitting: false });
      return;
    }
    const user = gameStore.getCurrentUser() || {};
    const userId = String(user.userId || '');
    if (!userId) {
      wx.showToast({ title: '用户信息缺失', icon: 'none' });
      return;
    }

    this.setData({ registerSubmitting: true });

    if (!match.registerInfo || typeof match.registerInfo !== 'object') {
      match.registerInfo = { totalCount: 0, users: [] };
    }
    if (!Array.isArray(match.registerInfo.users)) {
      match.registerInfo.users = [];
    }
    // 防重：同一 userId 不重复写入
    const already = match.registerInfo.users.some((item) => String(item && item.userId) === userId);
    if (!already) {
      const registeredByName =
        (user.name && String(user.name).trim()) || competitionName || '';
      match.registerInfo.users.push({
        userId: userId,
        userType: 'registered',
        identitySource: 'mini_program',
        nickname: user.name ? String(user.name) : '',
        competitionName: competitionName,
        matchNickname: competitionName,
        gender: this.data.registerGenderDraft ? String(this.data.registerGenderDraft) : '',
        avatar: user.avatar ? String(user.avatar) : '',
        phone: this.data.registerPhone ? String(this.data.registerPhone) : (user.phone ? String(user.phone) : ''),
        // 竞技展示快照：来自用户资料真实字段（0 有效；缺省不写假值）
        handicap: profile.handicap != null && profile.handicap !== '' ? profile.handicap : '',
        floatCoef: profile.floatCoef != null && profile.floatCoef !== '' ? profile.floatCoef : '',
        groupId: groupId,
        groupName: selectedGroup.name || '',
        // 参赛侧快照：与 groupId/groupName 同值（队际=球队分组 id/短名，非 sourceTeamId）
        matchTeamId: groupId,
        matchTeamName: selectedGroup.name || '',
        registeredAt: Date.now(),
        // Patch 1：本人立即报名元数据（替他人报名流程后续再写 proxy/admin）
        source: 'self',
        registeredBy: userId,
        registeredByName: registeredByName,
        subjectType: 'self',
        pickChannel: '',
        canSelfCancel: true,
        locked: false
      });
    }
    // 4. 更新总人数
    match.registerInfo.totalCount = match.registerInfo.users.length;

    // 5. 持久化
    teamMatchStore.saveMatch(match);

    // 5b. 报名名单 → 每人一条赛事日程（幂等；不改 match / toast）
    this.syncTeamMatchSchedules(match);

    // 6. 刷新页面数据（保持当前用户所在分组选中）
    const patch = this._buildRegisterStatePatch(match, groupId);
    patch.registerSheetVisible = false;
    patch.registerSubmitting = false;
    this.setData(patch, () => {
      if (this.data.activeTab === 'register') this.measureRegisterExtTop();
    });
    wx.showToast({ title: '报名成功', icon: 'success' });
  },

  /**
   * 将当前报名名单同步为 team_match 日程：
   * 无则 create；有则只更新 date / content（不改 ownerId / sourceType / sourceId）
   * @param {object} match
   */
  syncTeamMatchSchedules(match) {
    if (!match || !match.matchId) return;
    const matchId = String(match.matchId);
    const users =
      match.registerInfo && Array.isArray(match.registerInfo.users)
        ? match.registerInfo.users
        : [];
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      if (!user) continue;
      const ownerId = String(
        user.userId != null
          ? user.userId
          : user.playerId != null
            ? user.playerId
            : user.id != null
              ? user.id
              : ''
      ).trim();
      if (!ownerId) continue;
      const payload = scheduleAdapter.createTeamMatchSchedule(match, user);
      const existing = scheduleStore.findSchedulesBySource(
        'team_match',
        matchId,
        ownerId
      );
      if (existing && existing.length) {
        for (let j = 0; j < existing.length; j++) {
          const sch = existing[j];
          if (!sch || !sch.id) continue;
          scheduleStore.updateSchedule(sch.id, {
            date: payload.date,
            content: payload.content
          });
        }
        continue;
      }
      scheduleStore.createSchedule(payload);
    }
  },

  /**
   * 取消报名后：只删目标用户的 team_match 日程（userId = 被取消者，非操作人）
   * @param {string} matchId
   * @param {string} userId
   */
  deleteTeamMatchSchedule(matchId, userId) {
    const mid = String(matchId != null ? matchId : '').trim();
    const uid = String(userId != null ? userId : '').trim();
    if (!mid || !uid) return;
    scheduleStore.deleteSchedulesBySource('team_match', mid, uid);
  },

  /**
   * 取消整场赛事：删除该 match 下全部 team_match 日程（不传 ownerId）
   * @param {string} matchId
   */
  deleteTeamMatchSchedules(matchId) {
    const mid = String(matchId != null ? matchId : '').trim();
    if (!mid) return;
    try {
      scheduleStore.deleteSchedulesBySource('team_match', mid);
    } catch (e) {
      console.warn('[deleteTeamMatchSchedules] failed', mid, e);
    }
  },

  /* ===== 取消报名流程 ===== */
  openCancelRegisterModal() {
    if (!this.data.registerPermission.isOpen) return;
    if (!this.data.currentUserRegisterStatus.isRegistered) return;
    const match = teamMatchStore.getMatchById(this.data.matchId);
    const user = gameStore.getCurrentUser() || {};
    const userId = String(user.userId || '');
    const grouped = !!(match && userId && teamMatchStore.isUserInFormalGroups(match, userId));
    this.setData(this._buildSelfCancelDialogPatch(grouped));
  },

  closeCancelRegisterModal() {
    // 代报名取消：用户点「取消」时丢弃待提交 plan，不改数据
    if (this._pendingProxyCommitAfterConfirm) {
      this._pendingProxyCommitAfterConfirm = false;
      this._proxyCommitPlan = null;
      this._clearProxyRegistrationTempState();
    }
    this.setData({
      registerCancelModalVisible: false,
      registerCancelSubmitting: false
    });
  },

  confirmCancelRegister() {
    if (this.data.registerCancelSubmitting) return;

    // 代报名取消：确认后走统一 commit（已在 plan 中按权限筛过 targetUserId）
    if (this._pendingProxyCommitAfterConfirm) {
      this._pendingProxyCommitAfterConfirm = false;
      this.setData({
        registerCancelModalVisible: false,
        registerCancelSubmitting: true
      });
      this._applyProxyCommitPlan();
      this.setData({ registerCancelSubmitting: false });
      return;
    }

    if (!this.data.currentUserRegisterStatus.isRegistered) {
      this.setData({ registerCancelModalVisible: false });
      return;
    }

    const matchId = this.data.matchId;
    const user = gameStore.getCurrentUser() || {};
    const userId = String(user.userId || '');
    if (!userId) {
      wx.showToast({ title: '用户信息缺失', icon: 'none' });
      return;
    }

    const match = teamMatchStore.getMatchById(matchId);
    const registerUsers =
      match && match.registerInfo && Array.isArray(match.registerInfo.users)
        ? match.registerInfo.users
        : [];
    const registerUser = registerUsers.find(
      (item) => String((item && item.userId) || '') === userId
    );
    if (paymentManage.isUserPaymentConfirmed(registerUser)) {
      this.setData({
        registerCancelModalVisible: false,
        registerCancelSubmitting: false
      });
      const paid = registrationInteractionModel.buildPaidCancellationWarningModel();
      wx.showModal({
        title: paid.title,
        content: paid.content,
        cancelText: paid.cancelText,
        confirmText: paid.confirmText,
        success: (res) => {
          if (!res.confirm) {
            const log = paymentManage.createPaymentLog({
              action: 'paid_user_cancel_aborted',
              operator: this._buildPaymentLogOperator(match),
              targetUser: registerUser,
              diffText: playerManage.resolveMatchNickname(registerUser) + '尝试取消报名，系统提示已收款需协商退款，用户放弃取消。'
            });
            paymentManage.appendPaymentLogs(match, [log]);
            teamMatchStore.saveMatch(match);
            return;
          }
          const log = paymentManage.createPaymentLog({
            action: 'paid_user_cancel_confirmed',
            operator: this._buildPaymentLogOperator(match),
            targetUser: registerUser,
            diffText: playerManage.resolveMatchNickname(registerUser) + '在已收款状态下继续取消报名，系统已提醒其联系赛事组织方协商退款。'
          });
          paymentManage.appendPaymentLogs(match, [log]);
          teamMatchStore.saveMatch(match);
          this._performCancelRegistration(matchId, userId);
        }
      });
      return;
    }

    this._performCancelRegistration(matchId, userId);
  },

  _performCancelRegistration(matchId, userId) {
    this.setData({ registerCancelSubmitting: true });
    const result = teamMatchStore.cancelRegistration(matchId, userId);
    if (!result || !result.ok) {
      this.setData({ registerCancelSubmitting: false });
      wx.showToast({
        title: result && result.reason === 'not_found' ? '赛事数据缺失' : '取消失败',
        icon: 'none'
      });
      return;
    }

    // 取消成功后：只删目标用户赛事日程（管理员代取消时亦用被取消者 userId）
    this.deleteTeamMatchSchedule(matchId, userId);

    const match = result.match;
    const patch = Object.assign(
      {},
      this._buildRegisterStatePatch(match, this.data.activeRegisterSubTab),
      this._buildGroupsTabStatePatch(match),
      {
        registerCancelModalVisible: false,
        registerCancelSubmitting: false
      }
    );
    this.setData(patch, () => {
      if (this.data.activeTab === 'register') this.measureRegisterExtTop();
      if (this.data.activeTab === 'groups') this.computeGroupsPanelMinHeight();
    });
    wx.showToast({ title: '已取消报名', icon: 'success' });
  },

  refreshPartnerSection() {
    const cfg = partnerConfigUtil.loadPartnerConfig('GOLF BROTHERS');
    this.setData({
      partnerConfig: cfg,
      partnerLogoRows: partnerConfigUtil.buildPartnerLogoRows(cfg.partnerLogos)
    });
  },

  /** COS 默认图加载失败 → 回退本地 assets/partners */
  onPartnerLogoError(e) {
    const row = Number(e.currentTarget.dataset.row);
    const side = e.currentTarget.dataset.side;
    if (side !== 'left' && side !== 'right') return;
    const rows = (this.data.partnerLogoRows || []).slice();
    const rowData = rows[row];
    if (!rowData || !rowData[side] || !rowData[side].url) return;
    const current = String(rowData[side].url || '').trim();
    const fallback = partnerConfigUtil.getPartnerLogoLocalFallback(current);
    if (!fallback || fallback === current) return;
    const nextRow = Object.assign({}, rowData);
    nextRow[side] = { url: fallback };
    rows[row] = nextRow;
    this.setData({ partnerLogoRows: rows });
  },

  // 读取记分页记忆的显示偏好（与记分页同一缓存键，逐洞详情据此显示总杆/杆差）
  loadScoreDisplayMode() {
    const saved = wx.getStorageSync('scoreDisplayMode_global');
    const mode = saved === 'diff' || saved === 'gross' ? saved : (this.data.scoreDisplayMode || 'gross');
    // 统一：缓存的显示模式同时决定 逐洞详情、领先榜TOTAL、风格选择高亮态
    this.setData({ scoreDisplayMode: mode, scoringDisplay: mode === 'diff' ? 'strokeDiff' : 'gross' });
  },

  onReady() {
    this.initHeaderNav();
    this.measureTabTop();
    wx.nextTick(() => {
      this._initMoreFab();
      this.measureTabOverflow();
      if (this.data.activeTab === 'game') this._syncGameDock();
    });
  },

  /**
   * 是否从记分页返回 / 栈内仍有 score 页。
   * navigateBack 时 onShow 可能早于 score.onUnload，栈顶或次顶仍可能是 pages/score/index。
   */
  _isReturningFromScorePage() {
    try {
      const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
      if (!pages || !pages.length) return false;
      for (let i = pages.length - 1; i >= 0; i--) {
        const route = pages[i] && pages[i].route != null ? String(pages[i].route) : '';
        if (route === 'pages/score/index' || route.indexOf('pages/score/index') >= 0) {
          return true;
        }
      }
    } catch (e) { /* ignore */ }
    return false;
  },

  onShow() {
    // 从 stats 横屏返回时夺回竖屏（不改赛事数据）
    if (typeof wx.setPageOrientation === 'function') {
      wx.setPageOrientation({ orientation: 'portrait' });
    }
    this.applyTheme(getApp().getTheme());
    this._syncFontScale();
    // 不单靠 onHide：onShow 再认一次栈内 score，供 refresh 折叠 Details
    if (this._isReturningFromScorePage()) {
      this._resetMatchPlayExpandedOnReturn = true;
    }
    // 私人备注变更：失效缓存，随后 refresh 重建展示名
    const remarkRev = playerDisplayName.getRemarkRevision();
    if (this._remarkDisplayRev != null && this._remarkDisplayRev !== remarkRev) {
      this._viewerRemarkCtx = null;
    }
    this._remarkDisplayRev = remarkRev;
    // 显示偏好可能在记分页被切换 → 先同步，再 refresh，避免领先榜用旧 scoreDisplayMode 构建
    this.loadScoreDisplayMode();
    // 从「修改比赛」/记分页返回时刷新赛事基础信息，不强制重置 TAB
    if (this.data.matchId && this._detailReady) {
      this.refreshMatchData(this.data.matchId);
    }
    this._detailReady = true;
    // 出发表 groups 可能在记分页被更新 → 只重算出发表（领先榜已由上方 refreshMatchData 覆盖）
    this.refreshGroupsDerived();
    this.refreshPartnerSection();
    // 讨论区作者名：仅投影 View Model，不写回消息存储
    try {
      this.setData({ chat: this._applyViewerNamesToChat(this.data.chat || []) });
    } catch (e) { /* ignore */ }
    // 仅在已展开逐洞详情时同步刷新，避免每次 onShow 无意义分配 openScorecard
    if (this.data.openIndex != null && this.data.openIndex !== -1 && this.data.openIndex !== '') {
      this.updateOpenScorecard();
    }
    // 若返回时仍停留在出发表，重建视口观察器（onHide 会解绑）
    if (this.data.activeTab === 'tee-sheet') {
      wx.nextTick(() => this.setupTeeObserver());
    }
    // 布局可能变化（主题/数据），重新测量吸顶阈值，避免阈值过期导致吸顶遮挡信息区域
    wx.nextTick(() => this.measureTabTop());
    wx.nextTick(() => this.updateTabContentSpacer());
    wx.nextTick(() => this.measureTabOverflow());
    if (this.data.activeTab === 'discussion') wx.nextTick(() => this.measureWatchersTop());
    if (this.data.activeTab === 'register') wx.nextTick(() => this.measureRegisterExtTop());
    if (this.data.activeTab === 'leaderboard' && this.data.isMatchPlayScoreboard) {
      wx.nextTick(() => this.measureMpSbSummaryTop());
    }
    if (this.data.activeTab === 'groups') wx.nextTick(() => this.computeGroupsPanelMinHeight());
    if (this.data.activeTab === 'game') wx.nextTick(() => this._syncGameDock());
    wx.nextTick(() => this._refreshFabHitZones());
  },

  onHide() {
    this.disconnectTeeObserver();
    if (this.data.moreFabDragging) this.setData({ moreFabDragging: false });
    this._clearReactionOverlay();
    this._clearActiveReactionTarget();
    // 前往记分页时打标：返回 onShow/refresh 时折叠得分榜 Details
    try {
      const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
      const top = pages.length ? pages[pages.length - 1] : null;
      const route = top && top.route ? String(top.route) : '';
      if (route === 'pages/score/index' || route.indexOf('pages/score/index') >= 0) {
        this._resetMatchPlayExpandedOnReturn = true;
      }
    } catch (e) { /* ignore */ }
  },

  onUnload() {
    this._pendingReactionPlay = null;
    this._activeReactionTarget = null;
    this._activeReactionKey = '';
    this._reactionBridge = null;
    if (typeof this._stopReactionOverlayWait === 'function') {
      this._stopReactionOverlayWait();
    }
    if (this.data.reactionPackLoading) {
      this.setData({ reactionPackLoading: false });
    }
    this.disconnectTeeObserver();
    this._clearReactionOverlay();
  },

  onResize() {
    this.measureTabTop();
    try {
      const info = readTournamentDetailWindowSize();
      if (info && isPositiveFiniteNumber(info.windowHeight)) {
        this._fabWindowH = info.windowHeight;
      }
    } catch (e) { /* ignore */ }
    if (this.data.activeTab === 'register') {
      wx.nextTick(() => {
        this.computeRosterMinHeight();
        this._syncStickyByScroll(this.data.scrollYState || 0);
      });
    }
    if (this.data.activeTab === 'groups') {
      wx.nextTick(() => {
        this.computeGroupsPanelMinHeight();
        this._syncStickyByScroll(this.data.scrollYState || 0);
      });
    }
    wx.nextTick(() => this.updateTabContentSpacer());
    if (this.data.activeTab === 'game') wx.nextTick(() => this._syncGameDock());
  },

  _initMoreFab() {
    let sys = { windowWidth: 375, windowHeight: 667 };
    try {
      const info = readTournamentDetailWindowSize();
      if (info) {
        if (info.windowWidth != null) sys.windowWidth = info.windowWidth;
        if (info.windowHeight != null) sys.windowHeight = info.windowHeight;
      }
    } catch (e) {}
    this._fabWindowH = sys.windowHeight || 667;
    this._rpx2px = (sys.windowWidth || 375) / 750;
    this._fabSizePx = FAB_SIZE_RPX * this._rpx2px;
    this._fabRightPx = FAB_HIDE_MARGIN_RPX * this._rpx2px;
    this._fabMinTopPx = FAB_EDGE_GAP_RPX * this._rpx2px;
    this._fabMaxTopPx = Math.max(this._fabMinTopPx, this._fabWindowH - this._fabSizePx - FAB_EDGE_GAP_RPX * this._rpx2px);
    const centerTop = (this._fabWindowH - this._fabSizePx) / 2;
    this._setFabTop(centerTop);
    this._refreshFabHitZones();
  },

  _setFabTop(topPx) {
    const t = Math.max(this._fabMinTopPx || 0, Math.min(this._fabMaxTopPx || 0, Number(topPx) || 0));
    this.setData({
      fabTopPx: t,
      fabStyle: 'top:' + t.toFixed(1) + 'px;right:' + (this._fabRightPx || 0).toFixed(1) + 'px;'
    });
    this._updateFabHitState(t);
  },

  _refreshFabHitZones() {
    wx.createSelectorQuery()
      .in(this)
      .selectAll('.gb-header,.tab-scroll-wrap')
      .boundingClientRect((rects) => {
        this._fabHitZones = (rects || []).filter((r) => r && r.height > 0);
        this._updateFabHitState(this.data.fabTopPx || 0);
      })
      .exec();
  },

  _updateFabHitState(topPx) {
    const centerY = Number(topPx || 0) + (this._fabSizePx || 0) / 2;
    const hit = (this._fabHitZones || []).some((z) => centerY >= z.top && centerY <= z.bottom);
    if (hit !== this.data.moreFabHitTarget) this.setData({ moreFabHitTarget: hit });
  },

  onMoreFabTouchStart(e) {
    const t = e && e.touches && e.touches[0];
    if (!t) return;
    this._fabDrag = {
      startY: t.clientY,
      startTop: this.data.fabTopPx || 0,
      moved: false
    };
    this._refreshFabHitZones();
  },

  onMoreFabTouchMove(e) {
    const t = e && e.touches && e.touches[0];
    const drag = this._fabDrag;
    if (!t || !drag) return;
    const dy = t.clientY - drag.startY;
    if (Math.abs(dy) > 2 && !drag.moved) drag.moved = true;
    if (drag.moved && !this.data.moreFabDragging) this.setData({ moreFabDragging: true });
    this._setFabTop(drag.startTop + dy);
  },

  onMoreFabTouchEnd() {
    const drag = this._fabDrag;
    if (drag && drag.moved) this._fabMovedAt = Date.now();
    this._fabDrag = null;
    if (this.data.moreFabDragging) this.setData({ moreFabDragging: false });
  },

  onMoreFabTap() {
    if (this._fabMovedAt && Date.now() - this._fabMovedAt < 180) return;
    this.openMoreSheet();
  },

  onPageTap() {
    if (this.data.moreFabExpanded && !this.data.showMoreSheet) {
      this.setData({ moreFabExpanded: false });
    }
  },

  /** 领先榜逐洞下方广告：demo 走专用图，真实赛事走赛事信息第一个广告图 */
  _resolveScorecardAdImage(theme, matchId) {
    const id = matchId != null ? matchId : this.data.matchId;
    if (demoJiaobeiMatch.isJiaobeiDemoMatchId(id)) {
      detailDebugLog('[scorecard-ad-source]', {
        source: 'demoJiaobei',
        matchId: id
      });
      return demoJiaobeiMatch.resolveJiaobeiScorecardAdImage(theme || getApp().getTheme())
        || DEFAULT_SCORECARD_AD_IMAGE;
    }
    const match = this._resolveMatchData(id);
    const firstImage = match && Array.isArray(match.eventInfoList)
      ? match.eventInfoList.find((item) => item && String(item.type) === 'image')
      : null;
    const image = this._resolveEventInfoImage(firstImage, theme || getApp().getTheme());
    if (image) {
      detailDebugLog('[scorecard-ad-source]', {
        source: 'match.eventInfoList',
        matchId: id,
        imageId: firstImage && firstImage.id
      });
      return image;
    }
    detailDebugLog('[scorecard-ad-source]', {
      source: 'default',
      matchId: id
    });
    return DEFAULT_SCORECARD_AD_IMAGE;
  },

  applyTheme(theme) {
    const dark = theme === 'dark';
    const patch = {
      themeClass: dark ? 'dark-mode' : 'bright-mode',
      scorecardAdImage: this._resolveScorecardAdImage(theme, this.data.matchId)
    };
    const match = this._resolveMatchData(this.data.matchId) || this.data.match;
    if (match) {
      patch.eventInfoList = this._resolveEventInfoList(match, theme);
    }
    this.setData(patch);
  },

  initHeaderNav() {
    const header = createHeaderStyle();
    const headerTotalHeight = header.metrics.headerTotalHeight;
    const tabBarHeight = this.data.tabBarHeight || 50;
    this.setData({
      headerRootStyle: header.headerRootStyle,
      headerBarStyle: header.headerBarStyle,
      headerTotalHeight,
      stickyWatchersTop: headerTotalHeight + tabBarHeight,
      stickyRegisterExtTop: headerTotalHeight + tabBarHeight,
      stickyMpSbSummaryTop: headerTotalHeight + tabBarHeight
    });
  },

  // 测量 TAB 相对滚动内容顶部的偏移 = 信息区域（hero+intro+divider）的高度。
  // 这是吸顶阈值：scrollTop 跨过它之后 TAB 才吸顶，从而不会遮挡信息区域。
  measureTabTop() {
    this.createSelectorQuery()
      .select('.tab-scroll-wrap')
      .boundingClientRect()
      .select('.detail-scroll')
      .boundingClientRect()
      .select('.detail-scroll')
      .scrollOffset()
      .exec((res) => {
        const tabRect = res && res[0];
        const scrollRect = res && res[1];
        const scrollOff = res && res[2];
        if (tabRect && scrollRect && scrollOff) {
          const top = tabRect.top - scrollRect.top + scrollOff.scrollTop;
          // 信息区域始终存在，阈值必为正值；测得 0/负值视为测量过早，保留旧值兜底。
          if (top > 0) {
            const patch = { tabOffsetTop: top };
            if (tabRect.height > 0) {
              const stickySecondaryTop = (this.data.headerTotalHeight || 0) + tabRect.height;
              patch.tabBarHeight = tabRect.height;
              patch.stickyWatchersTop = stickySecondaryTop;
              patch.stickyRegisterExtTop = stickySecondaryTop;
              patch.stickyMpSbSummaryTop = stickySecondaryTop;
            }
            this.setData(patch);
            this._syncStickyByScroll(scrollOff.scrollTop || 0);
            this.updateTabContentSpacer();
            if (this.data.activeTab === 'discussion') this.measureWatchersTop();
            if (this.data.activeTab === 'register') this.measureRegisterExtTop();
            if (this.data.activeTab === 'leaderboard' && this.data.isMatchPlayScoreboard) {
              this.measureMpSbSummaryTop();
            }
            if (this.data.activeTab === 'groups') this.computeGroupsPanelMinHeight();
            if (this.data.activeTab === 'game') this._syncGameDock();
            wx.nextTick(() => this.measureTabOverflow());
          }
        }
      });
  },

  // 测量 TAB 横向滚动容器宽度，用于溢出提示符
  measureTabOverflow() {
    this.createSelectorQuery()
      .select('.tab-scroll-wrap--inflow .gb-tabs')
      .boundingClientRect()
      .selectAll('.tab-scroll-wrap--inflow .tab-btn')
      .boundingClientRect()
      .exec((res) => {
        const container = res && res[0];
        const tabs = (res && res[1]) || [];
        if (!container) return;
        this._tabContainerWidth = container.width || 0;
        let scrollWidth = 0;
        tabs.forEach((t) => { scrollWidth += (t && t.width) || 0; });
        if (scrollWidth > 0) this._lastTabScrollWidth = scrollWidth;
        const scrollLeft = this._lastTabScrollLeft || 0;
        const width = this._lastTabScrollWidth || scrollWidth;
        this._updateTabOverflowIndicators(scrollLeft, width);
      });
  },

  onTabHScroll(e) {
    const d = (e && e.detail) || {};
    const scrollLeft = d.scrollLeft || 0;
    let scrollWidth = d.scrollWidth || this._lastTabScrollWidth || 0;
    this._lastTabScrollLeft = scrollLeft;
    if (d.scrollWidth > 0) this._lastTabScrollWidth = d.scrollWidth;
    if (!this._tabContainerWidth) {
      this.measureTabOverflow();
      return;
    }
    this._updateTabOverflowIndicators(scrollLeft, scrollWidth);
  },

  _updateTabOverflowIndicators(scrollLeft, scrollWidth) {
    const containerW = this._tabContainerWidth || 0;
    const showLeft = scrollLeft > 0;
    const showRight = containerW > 0 && scrollWidth > 0 && scrollLeft + containerW < scrollWidth - 2;
    if (showLeft !== this.data.tabShowLeftIndicator || showRight !== this.data.tabShowRightIndicator) {
      this.setData({ tabShowLeftIndicator: showLeft, tabShowRightIndicator: showRight });
    }
  },

  // 测量围观行相对滚动内容顶部的偏移，用于二级吸顶（紧贴 TAB 下方）
  measureWatchersTop() {
    if (this.data.activeTab !== 'discussion') return;
    wx.nextTick(() => {
      this.createSelectorQuery()
        .select('.ds-watchers-wrap--inflow')
        .boundingClientRect()
        .select('.detail-scroll')
        .boundingClientRect()
        .select('.detail-scroll')
        .scrollOffset()
        .exec((res) => {
          const wRect = res && res[0];
          const scrollRect = res && res[1];
          const scrollOff = res && res[2];
          if (wRect && scrollRect && scrollOff && wRect.height > 0) {
            const top = wRect.top - scrollRect.top + scrollOff.scrollTop;
            if (top > 0) {
              this.setData({ watchersOffsetTop: top });
              this._syncStickyWatchersByScroll(scrollOff.scrollTop || 0);
            }
          }
        });
    });
  },

  // 测量 G5–G8 得分榜摘要相对滚动内容顶部的偏移（二级吸顶，紧贴 TAB 下方）
  measureMpSbSummaryTop() {
    if (this.data.activeTab !== 'leaderboard' || !this.data.isMatchPlayScoreboard) return;
    wx.nextTick(() => {
      this.createSelectorQuery()
        .select('.mp-sb-summary-wrap--inflow')
        .boundingClientRect()
        .select('.detail-scroll')
        .boundingClientRect()
        .select('.detail-scroll')
        .scrollOffset()
        .exec((res) => {
          const sRect = res && res[0];
          const scrollRect = res && res[1];
          const scrollOff = res && res[2];
          if (sRect && scrollRect && scrollOff && sRect.height > 0) {
            const top = sRect.top - scrollRect.top + scrollOff.scrollTop;
            if (top > 0) {
              this.setData({ mpSbSummaryOffsetTop: top });
              this._syncStickyMpSbSummaryByScroll(scrollOff.scrollTop || 0);
            }
          }
        });
    });
  },

  // 测量报名扩展区相对滚动内容顶部的偏移，用于二级吸顶（紧贴 TAB 下方）
  /**
   * 计算报名名单卡片的动态最小高度：
   * rosterMinHeight = 窗口高 - HEADER - 主TAB - 报名二级TAB - 底部CTA(含safe-area) - 必要间距
   * 无 CTA 时以底部 safe-area 兜底；使名单卡片底部刚好落在 CTA 上方，并保证内容足以触发主 TAB 吸顶。
   */
  computeRosterMinHeight() {
    if (this.data.activeTab !== 'register') return;
    let sys = { windowWidth: 375, windowHeight: 667, safeBottom: 0 };
    try {
      sys = readTournamentDetailSafeAreaLayout() || sys;
    } catch (e) {}
    const winH = sys.windowHeight || 667;
    const rpx2px = (sys.windowWidth || 375) / 750;
    const safeBottom = sys.safeBottom || 0;
    this.createSelectorQuery()
      .in(this)
      .select('.gb-header').boundingClientRect()
      .select('.tab-scroll-wrap--inflow').boundingClientRect()
      .select('.register-ext-wrap--inflow').boundingClientRect()
      .select('.register-cta-bar').boundingClientRect()
      .exec((res) => {
        res = res || [];
        const headerH = res[0] && res[0].height ? res[0].height : (this.data.headerTotalHeight || 92);
        const mainTabH = res[1] && res[1].height ? res[1].height : (this.data.tabBarHeight || 50);
        const extH = res[2] && res[2].height ? res[2].height : 116 * rpx2px;
        const ctaH = res[3] && res[3].height ? res[3].height : 0;
        // CTA 的高度已包含其自身 safe-area 内边距；无 CTA 时用 safeBottom 兜底避让底部
        const bottomReserve = ctaH > 0 ? ctaH : safeBottom;
        const gap = 40 * rpx2px; // 必要上下间距（对齐 detail-main 顶部内边距）
        let h = winH - headerH - mainTabH - extH - bottomReserve - gap;
        if (!(h > 0)) h = 0;
        h = Math.round(h);
        this._availableRegisterViewportHeight = h;
        const patch = {};
        if (h !== this.data.rosterMinHeight) patch.rosterMinHeight = h;
        if (h !== this.data.availableRegisterViewportHeight) {
          patch.availableRegisterViewportHeight = h;
        }
        if (Object.keys(patch).length) this.setData(patch);
      });
  },

  /**
   * 分组 TAB 内容区动态最小高度：
   * groupsPanelMinHeight = 窗口高 - HEADER - 主TAB - 必要间距 - safe-area
   * 无二级扩展区/底部 CTA；撑满主 TAB 以下剩余空间以触发吸顶。
   */
  computeGroupsPanelMinHeight() {
    if (this.data.activeTab !== 'groups') return;
    let sys = { windowWidth: 375, windowHeight: 667, safeBottom: 0 };
    try {
      sys = readTournamentDetailSafeAreaLayout() || sys;
    } catch (e) {}
    const winH = sys.windowHeight || 667;
    const rpx2px = (sys.windowWidth || 375) / 750;
    const safeBottom = sys.safeBottom || 0;
    this.createSelectorQuery()
      .in(this)
      .select('.gb-header').boundingClientRect()
      .select('.tab-scroll-wrap--inflow').boundingClientRect()
      .exec((res) => {
        res = res || [];
        const headerH = res[0] && res[0].height ? res[0].height : (this.data.headerTotalHeight || 92);
        const mainTabH = res[1] && res[1].height ? res[1].height : (this.data.tabBarHeight || 50);
        const gap = 40 * rpx2px;
        let h = winH - headerH - mainTabH - gap - safeBottom;
        if (!(h > 0)) h = 0;
        h = Math.round(h);
        if (h !== this.data.groupsPanelMinHeight) this.setData({ groupsPanelMinHeight: h });
      });
  },

  measureRegisterExtTop() {
    if (this.data.activeTab !== 'register') return;
    this.computeRosterMinHeight();
    wx.nextTick(() => {
      this.createSelectorQuery()
        .select('.register-ext-wrap--inflow')
        .boundingClientRect()
        .select('.detail-scroll')
        .boundingClientRect()
        .select('.detail-scroll')
        .scrollOffset()
        .exec((res) => {
          const extRect = res && res[0];
          const scrollRect = res && res[1];
          const scrollOff = res && res[2];
          if (extRect && scrollRect && scrollOff && extRect.height > 0) {
            const top = extRect.top - scrollRect.top + scrollOff.scrollTop;
            if (top > 0) {
              this.setData({ registerExtOffsetTop: top });
              this._syncStickyByScroll(scrollOff.scrollTop || 0);
            }
          }
          // rosterMinHeight / 布局稳定后：补齐吸顶可达距离，并按内容高度刷新锁定
          this.updateRegisterStickySpacer();
          this.updateRegisterContentLockMetrics();
        });
    });
  },

  // 内容不足时注入底部 spacer，保证外层 scroll 仍可继续上滑到 sticky 触发点
  updateTabContentSpacer() {
    const tab = this.data.activeTab;
    wx.createSelectorQuery()
      .in(this)
      .select('.detail-scroll')
      .boundingClientRect()
      .select('.detail-main')
      .boundingClientRect()
      .select('.tab-scroll-wrap')
      .boundingClientRect()
      .select('.ds-watchers-wrap--inflow')
      .boundingClientRect()
      .select('.register-ext-wrap--inflow')
      .boundingClientRect()
      .select('.mp-sb-summary-wrap--inflow')
      .boundingClientRect()
      .exec((res) => {
        const view = res && res[0];
        const main = res && res[1];
        const tabBar = res && res[2];
        const watchersBar = res && res[3];
        const registerExt = res && res[4];
        const mpSbSummary = res && res[5];
        if (!view || !main || !tabBar) return;
        const viewportH = view.height || 0;
        const spacerNow = this.data.contentSpacerHeight || 0;
        let contentH = Math.max(0, (main.height || 0) - spacerNow);
        if (tab === 'discussion' && watchersBar && watchersBar.height > 0) {
          contentH += watchersBar.height;
        }
        const tabH = tabBar.height || 0;
        let secondaryH = 0;
        if (tab === 'discussion' && watchersBar && watchersBar.height > 0) {
          secondaryH = watchersBar.height;
        } else if (tab === 'register' && registerExt && registerExt.height > 0) {
          secondaryH = registerExt.height;
        } else if (
          tab === 'leaderboard' &&
          this.data.isMatchPlayScoreboard &&
          mpSbSummary &&
          mpSbSummary.height > 0
        ) {
          secondaryH = mpSbSummary.height;
        }
        const minH = Math.max(0, Math.ceil(viewportH - tabH - secondaryH));
        const stickyThresholdOffset = 8; // 轻微 buffer，确保可稳定触发吸顶
        const spacer = (tab === 'discussion' || tab === 'game')
          ? Math.max(0, Math.ceil((viewportH - tabH + stickyThresholdOffset) - contentH))
          : 0;
        const patch = {};
        if (minH !== this.data.detailMainMinHeight) patch.detailMainMinHeight = minH;
        if (spacer !== this.data.contentSpacerHeight) patch.contentSpacerHeight = spacer;
        if (Object.keys(patch).length) {
          this.setData(patch, () => {
            if (tab === 'discussion') this.measureWatchersTop();
            if (tab === 'leaderboard' && this.data.isMatchPlayScoreboard) {
              this.measureMpSbSummaryTop();
            }
          });
        }
      });
  },

  _syncStickyByScroll(scrollTop) {
    const threshold = this.data.tabOffsetTop || 0;
    const sticky = scrollTop >= threshold && threshold > 0;
    const patch = {};
    if (sticky !== this.data.isStickyTab || scrollTop !== this.data.scrollYState) {
      patch.isStickyTab = sticky;
      patch.scrollYState = scrollTop;
    }
    const watchersSticky = this._calcStickyWatchers(scrollTop, sticky);
    if (watchersSticky !== this.data.isStickyWatchers) {
      patch.isStickyWatchers = watchersSticky;
    }
    const registerExtSticky = this._calcStickyRegisterExt(scrollTop, sticky);
    if (registerExtSticky !== this.data.isStickyRegisterExt) {
      patch.isStickyRegisterExt = registerExtSticky;
    }
    const mpSbSummarySticky = this._calcStickyMpSbSummary(scrollTop, sticky);
    if (mpSbSummarySticky !== this.data.isStickyMpSbSummary) {
      patch.isStickyMpSbSummary = mpSbSummarySticky;
    }
    if (this.data.activeTab === 'register' || this.data.activeTab === 'groups' || this.data.activeTab === 'game') {
      const hideCTA = this._calcHideRegisterCTA(scrollTop, sticky);
      if (hideCTA !== this.data.hideRegisterCTA) {
        patch.hideRegisterCTA = hideCTA;
      }
    }
    // 报名列表锁定：仅 isStickyTab 后 + 内容未超出可视区；吸顶前恒 false
    const contentLocked = this._resolveRegistrationContentLocked({
      isStickyTab: sticky,
      activeTab: this.data.activeTab
    });
    if (contentLocked !== this.data.registrationContentLocked) {
      patch.registrationContentLocked = contentLocked;
    }
    const justStuck = patch.isStickyTab === true && !this.data.isStickyTab;
    const ctaVisibilityChanged = Object.prototype.hasOwnProperty.call(patch, 'hideRegisterCTA');
    if (justStuck) {
      patch.tabHScrollLeft = this._lastTabScrollLeft || 0;
    }
    if (Object.keys(patch).length) this.setData(patch);
    // 刚吸顶或底部 CTA 显隐变化：重测可用高度（CTA 占位影响 availableH）
    if (this.data.activeTab === 'register' && (justStuck || ctaVisibilityChanged)) {
      this.updateRegisterContentLockMetrics({ forceSticky: sticky });
    }
    // 吸顶后才钳制「继续上滑」；不改内容高度、不把 scrollTop 拉回阈值以下
    if (contentLocked) {
      this._clampRegisterScrollAfterSticky(scrollTop, true);
    }
  },

  _calcStickyWatchers(scrollTop, isStickyTab) {
    if (this.data.activeTab !== 'discussion') return false;
    if (!isStickyTab) return false;
    const watchersThreshold = this.data.watchersOffsetTop || 0;
    const stickyTop = this.data.stickyWatchersTop || 0;
    return watchersThreshold > 0 && scrollTop >= watchersThreshold - stickyTop;
  },

  _syncStickyWatchersByScroll(scrollTop) {
    const sticky = this._calcStickyWatchers(scrollTop, this.data.isStickyTab);
    if (sticky !== this.data.isStickyWatchers) {
      this.setData({ isStickyWatchers: sticky });
    }
  },

  _calcStickyRegisterExt(scrollTop, isStickyTab) {
    if (this.data.activeTab !== 'register') return false;
    if (!isStickyTab) return false;
    const extThreshold = this.data.registerExtOffsetTop || 0;
    const stickyTop = this.data.stickyRegisterExtTop || 0;
    return extThreshold > 0 && scrollTop >= extThreshold - stickyTop;
  },

  /**
   * 底部 CTA 显隐（报名 / 分组共用）：screenHeight - tabBottom <= 100px 时隐藏
   * tabBottom 由 tabOffsetTop / scrollTop / tabBarHeight / headerTotalHeight 推导（与吸顶同一套测量）
   */
  _calcHideRegisterCTA(scrollTop, isStickyTab) {
    const tabOffsetTop = this.data.tabOffsetTop || 0;
    if (tabOffsetTop <= 0) return false;

    const screenH = this._fabWindowH || 667;
    const tabBarH = this.data.tabBarHeight || 50;
    const headerH = this.data.headerTotalHeight || 92;
    let tabBottom;
    if (isStickyTab) {
      tabBottom = headerH + tabBarH;
    } else {
      tabBottom = headerH + tabOffsetTop - scrollTop + tabBarH;
    }
    return (screenH - tabBottom) <= 100;
  },

  _syncStickyRegisterExtByScroll(scrollTop) {
    const sticky = this._calcStickyRegisterExt(scrollTop, this.data.isStickyTab);
    if (sticky !== this.data.isStickyRegisterExt) {
      this.setData({ isStickyRegisterExt: sticky });
    }
  },

  _calcStickyMpSbSummary(scrollTop, isStickyTab) {
    if (this.data.activeTab !== 'leaderboard' || !this.data.isMatchPlayScoreboard) return false;
    if (!isStickyTab) return false;
    const summaryThreshold = this.data.mpSbSummaryOffsetTop || 0;
    const stickyTop = this.data.stickyMpSbSummaryTop || 0;
    return summaryThreshold > 0 && scrollTop >= summaryThreshold - stickyTop;
  },

  _syncStickyMpSbSummaryByScroll(scrollTop) {
    const sticky = this._calcStickyMpSbSummary(scrollTop, this.data.isStickyTab);
    if (sticky !== this.data.isStickyMpSbSummary) {
      this.setData({ isStickyMpSbSummary: sticky });
    }
  },

  onScroll(e) {
    const scrollTop = e.detail.scrollTop || 0;
    // 先同步吸顶状态；吸顶后再由 _syncStickyByScroll 按内容是否溢出钳制列表
    this._syncStickyByScroll(scrollTop);
    if (this.data.activeTab === 'game') this._syncGameDock();
    // 注意：scroll 不再控制输入栏显隐（避免错误卸载/消失）；输入栏仅由 activeTab 决定 show/hide
  },

  _syncGameDock() {
    if (this.data.activeTab !== 'game') return;
    try {
      const tab = this.selectComponent('#detail-game-tab');
      if (!tab) return;
      const tabBottom = this.data.isStickyTab
        ? (this.data.headerTotalHeight || 0) + (this.data.tabBarHeight || 0)
        : 0;
      if (typeof tab.setFlowTabBottom === 'function') {
        tab.setFlowTabBottom(tabBottom);
      } else if (typeof tab.syncDockFromLayout === 'function') {
        tab.syncDockFromLayout();
      }
    } catch (e) { /* ignore */ }
  },

  onBack() {
    wx.navigateBack({ delta: 1, fail: () => wx.switchTab && wx.navigateBack() });
  },

  /* ===== Tabs ===== */
  _matchHostSnapshot(matchId) {
    const id = matchId || this.data.matchId;
    return sideGameHostSnapshot.buildFromMatch(teamMatchStore.getMatchById(id), {
      scope: 'match',
      allowBigPot: false
    });
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.activeTab) return;
    if (this.data.activeTab === 'discussion' && tab !== 'discussion') {
      this._clearReactionOverlay();
      this.closePlayerActionSheet();
      this._clearDiscussionReactionDetach();
    }
    // 切 TAB 只更新 activeTab，严格不触发布局/滚动重置。
    const patch = { activeTab: tab };
    if (tab !== 'discussion' && this.data.isStickyWatchers) {
      patch.isStickyWatchers = false;
    }
    if (tab !== 'register' && this.data.isStickyRegisterExt) {
      patch.isStickyRegisterExt = false;
    }
    if (!(tab === 'leaderboard' && this.data.isMatchPlayScoreboard) && this.data.isStickyMpSbSummary) {
      patch.isStickyMpSbSummary = false;
    }
    if (tab !== 'register') {
      patch.registrationContentLocked = false;
      patch.registrationStickySpacerHeight = 0;
    }
    if (tab !== 'register' && tab !== 'groups' && tab !== 'game') {
      patch.hideRegisterCTA = false;
    }
    this.setData(patch);
    if (tab === 'game') {
      this.setData({
        hostSnapshot: this._matchHostSnapshot()
      });
    }
    wx.nextTick(() => {
      this.updateTabContentSpacer();
      if (tab === 'discussion') this.measureWatchersTop();
      if (tab === 'register') {
        this.measureRegisterExtTop();
        this._syncStickyByScroll(this.data.scrollYState || 0);
      }
      if (tab === 'leaderboard' && this.data.isMatchPlayScoreboard) {
        this.measureMpSbSummaryTop();
        this._syncStickyByScroll(this.data.scrollYState || 0);
      }
      if (tab === 'groups') {
        this._refreshFormalGroupsDisplay();
        this.computeGroupsPanelMinHeight();
        this._syncStickyByScroll(this.data.scrollYState || 0);
      }
      if (tab === 'game') {
        this._syncStickyByScroll(this.data.scrollYState || 0);
        this._syncGameDock();
      }
    });
    if (tab === 'tee-sheet') {
      // 进入出发表：DOM 渲染后绑定"第一组卡片"视口观察器（按钮初始隐藏，由可见性触发）
      wx.nextTick(() => this.setupTeeObserver());
    } else {
      // 离开出发表：解绑观察器并强制隐藏按钮
      this.disconnectTeeObserver();
      if (this.data.quickEntryVisible) this.setData({ quickEntryVisible: false });
    }
  },

  // 观察"第一组卡片"是否完全进入视口，据此驱动快捷入口按钮显隐
  setupTeeObserver() {
    this.disconnectTeeObserver();
    if (this.data.activeTab !== 'tee-sheet') return;
    const observer = this.createIntersectionObserver({ thresholds: [0, 0.5, 0.99, 1] });
    observer.relativeToViewport().observe('.js-first-tee-group', (res) => {
      // 完全可见：交叉比例≈1（top edge >= viewport top 且 bottom edge <= viewport bottom）
      const fullyVisible = res && res.intersectionRatio >= 0.99;
      if (fullyVisible !== this.data.quickEntryVisible) {
        this.setData({ quickEntryVisible: fullyVisible });
      }
    });
    this._teeObserver = observer;
  },

  disconnectTeeObserver() {
    if (this._teeObserver) {
      this._teeObserver.disconnect();
      this._teeObserver = null;
    }
  },

  _projectTeeSheetBottomCta(match) {
    const user = gameStore.getCurrentUser() || {};
    return teamMatchBottomCta.project({
      match: match,
      surface: 'tee',
      canManageGroups: !!(this.data && this.data.canManageGroups),
      viewerUserId: user,
      firstGroupFullyVisible: !!(this.data && this.data.quickEntryVisible)
    });
  },

  _resolveCurrentUserTournamentGroupId(match) {
    const currentUser = gameStore.getCurrentUser() || {};
    return teamMatchViewerGroup.resolveViewerGroupId(match, currentUser);
  },

  onEnterMyGroup() {
    const matchId = this.data.matchId || '';
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    const user = gameStore.getCurrentUser() || {};
    teamMatchEnterGroupScore.enterViewerGroupScore(match, user, {
      mapPlayers: (group) => {
        const lookup = this._buildGroupPlayerLookup(match);
        return this.hydrateGroupDisplayPlayers(group, lookup).map((p) => ({
          playerId: p.userId || p.playerId,
          name: p.displayName || p.name,
          avatar: p.avatar || ''
        }));
      }
    });
  },

  // 出发表：点击任意组 → 个人比杆赛记分页。先写好该组 matchState，再统一 enterScorePage。
  onEnterGroup(e) {
    const groupId = e.currentTarget.dataset.groupId || '';
    this._enterTournamentGroupScore(groupId);
  },

  _enterTournamentGroupScore(groupId) {
    const matchId = this.data.matchId || '';
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    const lookup = this._buildGroupPlayerLookup(match);
    teamMatchEnterGroupScore.enterTeamMatchGroupScore(match, groupId, {
      mapPlayers: (group) =>
        this.hydrateGroupDisplayPlayers(group, lookup).map((p) => ({
          playerId: p.userId || p.playerId,
          name: p.displayName || p.name,
          avatar: p.avatar || ''
        }))
    });
  },

  /* ===== 出发表 + 领先榜 ===== */
  _syncTournamentHoleLayout(matchOrNull) {
    const match = matchOrNull || null;
    const meta = match
      ? {
          courseId: match.courseId || '',
          courseName: match.courseName || '',
          front9Course: match.front9Course || null,
          back9Course: match.back9Course || null
        }
      : groupsStore.getTournamentCourseMeta();
    const layout = holeLayout.resolveLayoutFromContext({
      courseId: meta.courseId,
      courseName: meta.courseName,
      front9Course: meta.front9Course,
      back9Course: meta.back9Course
    });
    holeLayout.applyLayout(layout);
  },

  _buildScorecardCourseTitle(match) {
    const courseName = String((match && match.courseName) || '').trim();
    const front9Course = String((match && match.front9Course) || '').trim();
    const back9Course = String((match && match.back9Course) || '').trim();
    if (!courseName) return '';
    if (!front9Course || !back9Course) return courseName;
    return courseName + '（' + front9Course + '/' + back9Course + '）';
  },

  _getMatchHolePars(match) {
    if (!match) return holeLayout.getLayout().holePars.slice();
    const parsed = (!match.front9Course && !match.back9Course)
      ? halfCourse.parseCourseHalfText(match.courseHalfText || match.courseHalf || match.halfText)
      : {};
    const layout = holeLayout.resolveLayoutFromContext({
      courseId: match.courseId || '',
      courseName: match.courseName || '',
      front9Course: match.front9Course || parsed.front9Course || null,
      back9Course: match.back9Course || parsed.back9Course || null
    });
    return layout.holePars.slice();
  },

  _isFilledLeaderboardScore(score) {
    return score !== null && score !== undefined && score !== '' && !Number.isNaN(Number(score));
  },

  _formatLeaderboardDiff(diff) {
    if (diff > 0) return '+' + diff;
    if (diff === 0) return '0';
    return String(diff);
  },

  _resolveLeaderboardTotalClass(diff) {
    if (diff < 0) return 'score-under';
    if (diff === 0) return 'score-even';
    return 'score-over';
  },

  _resolveLeaderboardThruLabel(thru) {
    if (!thru) return '-';
    return thru >= 18 ? 'F' : String(thru);
  },

  _resolveScorecardMarker(status) {
    switch (status) {
      case 'eagle':
      case 'birdie':
        return { m: 'circle', c: status === 'eagle' ? 'score-eagle' : 'score-birdie' };
      case 'bogey':
        return { m: 'square', c: 'score-bogey' };
      case 'double-bogey':
        return { m: 'square', c: 'score-double-bogey' };
      default:
        return { m: '', c: '' };
    }
  },

  _buildScorecardHoleCell(score, par, mode) {
    if (!this._isFilledLeaderboardScore(score)) return { t: '-', m: '', c: '' };
    const diff = Number(score) - Number(par || 0);
    const marker = this._resolveScorecardMarker(groupsStore.getScoreStatus(diff));
    return {
      t: mode === 'diff' ? this._formatLeaderboardDiff(diff) : String(score),
      m: marker.m,
      c: marker.c
    };
  },

  _buildScorecardSumCell(scores, pars, from, to, mode) {
    let gross = 0;
    let diff = 0;
    let filled = 0;
    for (let i = from; i < to; i++) {
      const score = scores[i];
      if (!this._isFilledLeaderboardScore(score)) continue;
      gross += Number(score);
      diff += Number(score) - Number(pars[i] || 0);
      filled += 1;
    }
    if (!filled) return { t: '', m: '', c: '' };
    return { t: mode === 'diff' ? this._formatLeaderboardDiff(diff) : String(gross), m: '', c: '' };
  },

  _sumScorecardPars(pars, from, to) {
    let total = 0;
    for (let i = from; i < to; i++) total += Number(pars[i] || 0);
    return total;
  },

  _buildScorecardFromScoreRecord(record, mode, scorecardStatus, match) {
    if (!record || !Array.isArray(record.scores)) return null;
    const scores = record.scores || [];
    const pars = this._getMatchHolePars(match);
    const parCell = (value) => ({ t: String(value), m: '', c: '' });
    const blank = { t: '', m: '', c: '' };

    const frontHead = ['Hole', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'Out', ''];
    const backHead = ['Hole', '10', '11', '12', '13', '14', '15', '16', '17', '18', 'In', 'Tot'];
    const frontPar = [{ t: 'Par', m: '', c: '' }];
    const backPar = [{ t: 'Par', m: '', c: '' }];
    for (let i = 0; i < 9; i++) frontPar.push(parCell(pars[i]));
    frontPar.push(parCell(this._sumScorecardPars(pars, 0, 9)));
    frontPar.push(blank);
    for (let i = 9; i < 18; i++) backPar.push(parCell(pars[i]));
    backPar.push(parCell(this._sumScorecardPars(pars, 9, 18)));
    backPar.push(parCell(this._sumScorecardPars(pars, 0, 18)));

    const frontScore = [blank];
    const backScore = [blank];
    for (let i = 0; i < 9; i++) {
      frontScore.push(this._buildScorecardHoleCell(scores[i], pars[i], mode));
    }
    frontScore.push(this._buildScorecardSumCell(scores, pars, 0, 9, mode));
    frontScore.push(blank);
    for (let i = 9; i < 18; i++) {
      backScore.push(this._buildScorecardHoleCell(scores[i], pars[i], mode));
    }
    backScore.push(this._buildScorecardSumCell(scores, pars, 9, 18, mode));
    backScore.push(this._buildScorecardSumCell(scores, pars, 0, 18, mode));

    const scorecard = { frontHead, frontPar, frontScore, backHead, backPar, backScore };
    if (scorecardStatus) scorecard.scorecardStatus = scorecardStatus;
    return scorecard;
  },

  _resolveSlotScorePlayerId(slotPlayer, currentPlayerId) {
    const current = currentPlayerId != null ? String(currentPlayerId).trim() : '';
    if (current) return current;
    const p = slotPlayer || {};
    const scorePlayerId = p.scorePlayerId || p.slotScorePlayerId || p.scoreOwnerId;
    return scorePlayerId != null ? String(scorePlayerId).trim() : '';
  },

  _resolveScoresByPlayerRecord(scoresByPlayer, slotPlayer, currentPlayerId) {
    if (!scoresByPlayer || typeof scoresByPlayer !== 'object') return null;
    const scorePlayerId = this._resolveSlotScorePlayerId(slotPlayer, currentPlayerId);
    if (scorePlayerId && scoresByPlayer[scorePlayerId]) return scoresByPlayer[scorePlayerId];
    const playerId = currentPlayerId != null ? String(currentPlayerId).trim() : '';
    if (playerId && scoresByPlayer[playerId]) return scoresByPlayer[playerId];
    return null;
  },

  _resolveTeamMatchScorecard(match, row) {
    const groupId = row && row.groupId ? String(row.groupId) : '';
    const entityId =
      row && row.entityId != null && String(row.entityId).trim() !== ''
        ? String(row.entityId).trim()
        : '';
    const isEntityRow = !!(row && (row.isEntity === true || entityId));

    // Patch-02C3E：Entity 成绩卡 — 主体 = entityId / teamScoresByEntity，不走 playerId
    if (isEntityRow) {
      if (!match || !groupId || !entityId) return null;
      const scoreData =
        match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
          ? match.scoreData
          : null;
      const groupScoreData =
        scoreData && scoreData[groupId] && typeof scoreData[groupId] === 'object'
          ? scoreData[groupId]
          : null;
      const teamScoresByEntity = Array.isArray(groupScoreData && groupScoreData.teamScoresByEntity)
        ? groupScoreData.teamScoresByEntity
        : [];
      let entityRec = null;
      for (let i = 0; i < teamScoresByEntity.length; i++) {
        const rec = teamScoresByEntity[i];
        if (!rec || typeof rec !== 'object') continue;
        const teamId = rec.teamId != null ? String(rec.teamId).trim() : '';
        if (teamId && teamId === entityId) {
          entityRec = rec;
          break;
        }
      }
      const record = {
        scores: Array.isArray(entityRec && entityRec.scores) ? entityRec.scores : [],
        putts: Array.isArray(entityRec && entityRec.putts) ? entityRec.putts : undefined,
        fairways: Array.isArray(entityRec && entityRec.fairways) ? entityRec.fairways : undefined,
        penalties: Array.isArray(entityRec && entityRec.penalties) ? entityRec.penalties : undefined,
        sands: Array.isArray(entityRec && entityRec.sands) ? entityRec.sands : undefined
      };
      const scores = record.scores;
      const started = scores.some((score) => this._isFilledLeaderboardScore(score));
      if (!started) {
        return this._buildScorecardFromScoreRecord(
          { scores: [] },
          this.data.scoreDisplayMode,
          'not_started',
          match
        );
      }
      return this._buildScorecardFromScoreRecord(record, this.data.scoreDisplayMode, null, match);
    }

    const playerId = row && row.playerId ? String(row.playerId) : '';
    if (!match || !groupId || !playerId) return null;
    const scoreData = match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
      ? match.scoreData
      : null;
    const groupScoreData = scoreData && scoreData[groupId] && typeof scoreData[groupId] === 'object'
      ? scoreData[groupId]
      : null;
    const scoresByPlayer = groupScoreData &&
      groupScoreData.scoresByPlayer &&
      typeof groupScoreData.scoresByPlayer === 'object'
      ? groupScoreData.scoresByPlayer
      : null;
    const record = this._resolveScoresByPlayerRecord(scoresByPlayer, row, playerId);
    const scores = record && Array.isArray(record.scores) ? record.scores : [];
    const started = scores.some((score) => this._isFilledLeaderboardScore(score));
    if (!started) {
      return this._buildScorecardFromScoreRecord({ scores: [] }, this.data.scoreDisplayMode, 'not_started', match);
    }
    return this._buildScorecardFromScoreRecord(record, this.data.scoreDisplayMode, null, match);
  },

  _resolveMatchPlayerHoles(match, group, player, playerId) {
    const groupId = group && group.groupId ? String(group.groupId) : '';
    const scoreData = match && match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
      ? match.scoreData
      : null;
    const groupScoreData = scoreData && groupId && scoreData[groupId] && typeof scoreData[groupId] === 'object'
      ? scoreData[groupId]
      : null;
    const scoreRecord = groupScoreData &&
      groupScoreData.scoresByPlayer &&
      typeof groupScoreData.scoresByPlayer === 'object' &&
      playerId
      ? this._resolveScoresByPlayerRecord(groupScoreData.scoresByPlayer, player, playerId)
      : null;
    if (scoreRecord && Array.isArray(scoreRecord.scores)) {
      return {
        source: 'teamMatch.scoreData',
        holes: scoreRecord.scores.map((score, index) => ({ holeNo: index + 1, score: score }))
      };
    }
    if (Array.isArray(player && player.holes)) {
      return { source: 'match.groups', holes: player.holes };
    }
    if (Array.isArray(player && player.scores)) {
      return {
        source: 'match.groups',
        holes: player.scores.map((score, index) => ({ holeNo: index + 1, score: score }))
      };
    }
    const groupScoreRecord = group && group.scoresByPlayer && playerId
      ? this._resolveScoresByPlayerRecord(group.scoresByPlayer, player, playerId)
      : null;
    if (groupScoreRecord && Array.isArray(groupScoreRecord.scores)) {
      return {
        source: 'match.groups',
        holes: groupScoreRecord.scores.map((score, index) => ({ holeNo: index + 1, score: score }))
      };
    }
    return { source: '', holes: [] };
  },

  /**
   * 统一领先榜成绩字段语义：
   * - grossTotal: 实际总杆
   * - toPar: 相对标准杆杆差
   * 兼容入参可含 total/diff（旧字段）或 grossTotal/toPar（新字段）。
   */
  _getLeaderboardScoreFields(stats) {
    const source = stats || {};
    const grossRaw = source.grossTotal != null ? source.grossTotal : source.total;
    const toParRaw = source.toPar != null ? source.toPar : source.diff;
    const grossTotal = Number(grossRaw);
    const toPar = Number(toParRaw);
    return {
      grossTotal: Number.isFinite(grossTotal) ? grossTotal : 0,
      toPar: Number.isFinite(toPar) ? toPar : 0
    };
  },

  _computeMatchLeaderboardStats(match, group, player, playerId) {
    const resolved = this._resolveMatchPlayerHoles(match, group, player, playerId);
    const holes = resolved.holes || [];
    const pars = this._getMatchHolePars(match);
    let total = 0;
    let parThru = 0;
    let thru = 0;
    holes.forEach((hole, index) => {
      const score = hole && hole.score;
      if (!this._isFilledLeaderboardScore(score)) return;
      total += Number(score);
      parThru += Number(pars[index] || 0);
      thru += 1;
    });
    const fields = this._getLeaderboardScoreFields({
      total: total,
      diff: total - parThru
    });
    return {
      grossTotal: fields.grossTotal,
      toPar: fields.toPar,
      // 兼容：total=总杆，diff=杆差
      total: fields.grossTotal,
      diff: fields.toPar,
      thru: thru,
      hasScore: thru > 0,
      source: resolved.source || ''
    };
  },

  _buildLeaderboardFromMatchGroups(match, openIndex) {
    const groups = match && Array.isArray(match.groups) ? match.groups : [];
    if (!groups.length) return null;
    const playerLookup = this._buildGroupPlayerLookup(match);
    const teamNameMap = this._buildLeaderboardTeamNameMap(match);
    const playerTeamLookup = this._buildLeaderboardPlayerTeamLookup(match);
    const teamLogoMap = this._buildTeamGroupLogoMap(match);
    const flat = [];
    groups.forEach((group) => {
      const displayPlayers = this.hydrateGroupDisplayPlayers(group, playerLookup);
      const displayMap = {};
      displayPlayers.forEach((player) => {
        if (player && player.userId) displayMap[String(player.userId)] = player;
      });
      (Array.isArray(group && group.players) ? group.players : []).forEach((player) => {
        const playerId = this._resolveAnyPlayerId(player);
        if (!playerId) return;
        const scorePlayerId = this._resolveSlotScorePlayerId(player, playerId);
        const slotIndex = Number(player && (player.position != null ? player.position : player.slotIndex)) || 0;
        const display = displayMap[playerId] || {};
        const lookup = playerLookup[playerId] || {};
        const genderDisplay = playerManage.getGenderDisplay(
          Object.assign({}, lookup, player, { gender: lookup.gender || display.gender || player.gender })
        );
        const stat = this._computeMatchLeaderboardStats(match, group, player, playerId);
        const scoreFields = this._getLeaderboardScoreFields(stat);
        const teamName = this._resolveLeaderboardPlayerTeamName(playerId, playerTeamLookup, teamNameMap);
        const teamTag = this._formatLeaderboardTeamTagName(teamName);
        const badgeTeamId = this._resolveInterTeamBadgeLogoForPlayer(
          match,
          playerId,
          playerTeamLookup,
          teamLogoMap
        );
        flat.push({
          playerId: playerId,
          scorePlayerId: scorePlayerId,
          slotIndex: slotIndex,
          position: slotIndex,
          name: this._resolveViewerDisplayName(
            playerId,
            display.displayName ||
              display.name ||
              lookup.nickname ||
              this._resolveAnyPlayerNickname(player) ||
              '未知球员',
            {
              publicName: String(lookup.nickname || display.nickname || '').trim(),
              snapshotName: this._resolveAnyPlayerNickname(player) ||
                String(display.displayName || display.name || '').trim(),
              identityMasked: !!(lookup.identityMasked || player.identityMasked || display.identityMasked)
            }
          ),
          group: group.groupName || '',
          groupId: group.groupId || '',
          avatar: display.avatar || mockAvatars.resolveAvatar(player.avatar || player.avatarUrl || '', playerId),
          gender: genderDisplay.gender || '',
          isFemale: genderDisplay.gender === 'female',
          genderIcon: genderDisplay.icon,
          genderClass: genderDisplay.className,
          flag: player.flag || '',
          badgeTeamId: badgeTeamId,
          country: player.country || '',
          age: player.age || '',
          grossTotal: scoreFields.grossTotal,
          toPar: scoreFields.toPar,
          total: scoreFields.grossTotal,
          diff: scoreFields.toPar,
          thru: stat.thru,
          hasScore: stat.hasScore,
          teamName: teamName,
          teamTag: teamTag,
          scoreSource: stat.source || ''
        });
      });
    });
    if (!flat.length) return null;
    flat.sort((a, b) => {
      if (a.thru === 0 && b.thru === 0) return 0;
      if (a.thru === 0) return 1;
      if (b.thru === 0) return -1;
      if (a.toPar !== b.toPar) return a.toPar - b.toPar;
      return b.thru - a.thru;
    });
    return flat.map((player, index) => {
      const started = player.thru > 0;
      const firstIndex = flat.findIndex((item) => item.thru > 0 && item.toPar === player.toPar);
      const tied = flat.filter((item) => item.thru > 0 && item.toPar === player.toPar).length > 1;
      const pos = !started ? '-' : tied ? 'T' + (firstIndex + 1) : String(index + 1);
      return {
        pos: pos,
        name: player.name,
        group: player.group,
        groupId: player.groupId,
        playerId: player.playerId,
        scorePlayerId: player.scorePlayerId || player.playerId,
        slotIndex: player.slotIndex || player.position || 0,
        position: player.position || player.slotIndex || 0,
        gender: player.gender || '',
        isFemale: player.isFemale,
        genderIcon: player.genderIcon,
        genderClass: player.genderClass,
        thru: this._resolveLeaderboardThruLabel(player.thru),
        grossTotal: player.grossTotal,
        toPar: player.toPar,
        total: player.grossTotal,
        diff: player.toPar,
        hasScore: player.hasScore === true,
        scoreStr: started ? this._formatLeaderboardDiff(player.toPar) : '-',
        scoreClass: started ? this._resolveLeaderboardTotalClass(player.toPar) : 'score-even',
        avatar: player.avatar,
        country: player.country,
        age: player.age,
        flag: player.flag,
        badgeTeamId: player.badgeTeamId || '',
        teamName: player.teamName || '',
        teamTag: player.teamTag || '',
        scoreSource: player.scoreSource || '',
        expanded: index === openIndex
      };
    });
  },

  _buildLeaderboardTeamNameMap(match) {
    const map = {};
    const teamGroups = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
    teamGroups.forEach((team) => {
      const teamId = team && team.id != null ? String(team.id).trim() : '';
      if (!teamId) return;
      map[teamId] = String((team && team.name) || '').trim();
    });
    return map;
  },

  /**
   * 队际赛：teamGroups.id → sourceTeamLogo 快照（缺省默认图；非队际返回空 map）
   */
  _buildTeamGroupLogoMap(match) {
    const map = {};
    if (!isInterTeamMatch(match)) return map;
    const teamGroups = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
    teamGroups.forEach((team) => {
      const teamId = team && team.id != null ? String(team.id).trim() : '';
      if (!teamId) return;
      const logo = String((team && team.sourceTeamLogo) || '').trim();
      map[teamId] = logo || DEFAULT_ORG_LOGO;
    });
    return map;
  },

  /**
   * 队际赛头像角标：返回可匹配 teamGroups[].id 的 badgeTeamId。
   * LOGO 本体放在页级 teamGroupLogoById，避免复制到每个榜单行。
   * 无匹配 id 时返回空串（不串队）；队内赛返回空（角标由 leaderboardAvatarBadge=none 关闭）。
   */
  _resolveInterTeamBadgeLogo(match, teamGroupId, logoMap) {
    if (!isInterTeamMatch(match)) return '';
    const id = teamGroupId != null ? String(teamGroupId).trim() : '';
    if (!id) return '';
    const map = logoMap || this._buildTeamGroupLogoMap(match);
    if (!Object.prototype.hasOwnProperty.call(map, id)) return '';
    return id;
  },

  _resolveInterTeamBadgeLogoForPlayer(match, playerId, playerTeamLookup, logoMap, fallbackTeamGroupId) {
    if (!isInterTeamMatch(match)) return '';
    const entry =
      playerTeamLookup && playerId ? playerTeamLookup[String(playerId)] : null;
    const fromPlayer = entry
      ? String(entry.matchTeamId || entry.teamId || entry.groupId || '').trim()
      : '';
    const teamGroupId =
      fromPlayer ||
      (fallbackTeamGroupId != null ? String(fallbackTeamGroupId).trim() : '');
    return this._resolveInterTeamBadgeLogo(match, teamGroupId, logoMap);
  },

  _resolveLeaderboardPlayerTeamTag(playerId, playerTeamLookup, teamNameMap) {
    return this._formatLeaderboardTeamTagName(
      this._resolveLeaderboardPlayerTeamName(playerId, playerTeamLookup, teamNameMap)
    );
  },

  _resolveLeaderboardPlayerTeamName(playerId, playerTeamLookup, teamNameMap) {
    const id = playerId != null ? String(playerId).trim() : '';
    if (!id) return '';
    const ref = playerTeamLookup && playerTeamLookup[id];
    const teamId = ref && ref.teamId ? String(ref.teamId).trim() : '';
    if (!teamId) return '';
    return String((teamNameMap && teamNameMap[teamId]) || (ref && ref.teamName) || '').trim();
  },

  _formatLeaderboardTeamTagName(name) {
    const text = String(name || '').trim();
    if (!text) return '';
    const chars = Array.from(text);
    const hasChinese = /[\u4e00-\u9fff]/.test(text);
    const limit = hasChinese ? 4 : 8;
    return chars.slice(0, limit).join('');
  },

  _buildLeaderboardView(match) {
    // Patch-02C3B：Stroke Entity 领先榜（最前置分支，G1 路径不变）
    if (this._shouldBuildEntityLeaderboard(match)) {
      const entityRows = this._buildEntityLeaderboardRows(match, this.data.openIndex) || [];
      detailDebugLog('[leaderboard-score-source]', {
        matchId: this.data.matchId || '',
        source: 'teamMatch.scoreData.teamScoresByEntity',
        entityCount: entityRows.length
      });
      return entityRows.map((row, index) => {
        const attached = this._attachPersonalLeaderboardScoreFields(row);
        return Object.assign({}, attached, {
          displayName: attached.displayName || attached.name || '',
          rowId: attached.entityId || ('entity-' + index)
        });
      });
    }

    const matchRows = this._buildLeaderboardFromMatchGroups(match, this.data.openIndex);
    let source = 'groupsStore';
    if (matchRows) {
      source = matchRows.some((row) => row && row.scoreSource === 'teamMatch.scoreData')
        ? 'teamMatch.scoreData'
        : 'match.groups';
    }
    const rows = matchRows || groupsStore.buildLeaderboard(this.data.scoringDisplay, this.data.openIndex);
    const matchGroups = match && Array.isArray(match.groups) ? match.groups : [];
    const storeGroups = source === 'groupsStore' ? (groupsStore.getGroups() || []) : [];
    const sourceGroups = source === 'match.groups' ? matchGroups : storeGroups;
    const playerCount = sourceGroups.reduce((count, group) => {
      const players = Array.isArray(group && group.players) ? group.players : [];
      return count + players.filter((player) => player && this._resolveAnyPlayerId(player)).length;
    }, 0);
    detailDebugLog('[leaderboard-score-source]', {
      matchId: this.data.matchId || '',
      source: source,
      groupCount: sourceGroups.length,
      playerCount: playerCount
    });
    return (rows || []).map((row, index) => {
      const attached = this._attachPersonalLeaderboardScoreFields(row);
      return Object.assign({}, attached, {
        displayName: attached.displayName || attached.name || '',
        rowId: attached.playerId || attached.entityId || ('player-' + index)
      });
    });
  },

  /** 是否走 Entity 领先榜：G1/G5 强制个人榜；其余看 matchState.mode 或 scoreEntities */
  _shouldBuildEntityLeaderboard(match) {
    const gameMode = String(
      (match && (match.gameMode || match.selectedGameMode)) || ''
    ).trim();
    // G1 / G5：个人路径；不因残留 scoreEntities / 旧 session mode 走 Entity 榜
    if (gameMode === '个人比杆赛' || isG5MatchPlayMode(gameMode)) return false;
    try {
      const ms = matchStateUtil.getMatchState && matchStateUtil.getMatchState();
      if (ms && ms.mode === 'stroke_entity') return true;
    } catch (e) {}
    const scoreEntities =
      match && match.scoreEntities && typeof match.scoreEntities === 'object' && !Array.isArray(match.scoreEntities)
        ? match.scoreEntities
        : null;
    if (!scoreEntities) return false;
    const keys = Object.keys(scoreEntities);
    for (let i = 0; i < keys.length; i++) {
      const list = scoreEntities[keys[i]];
      if (Array.isArray(list) && list.length > 0) return true;
    }
    return false;
  },

  /**
   * Patch-02C3B：Entity 领先榜行
   * 主体 = scoreEntities + teamScoresByEntity（teamId === entityId），不生成个人成绩主体
   */
  _buildEntityLeaderboardRows(match, openIndex) {
    const scoreEntities =
      match && match.scoreEntities && typeof match.scoreEntities === 'object' && !Array.isArray(match.scoreEntities)
        ? match.scoreEntities
        : {};
    const scoreData =
      match && match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
        ? match.scoreData
        : {};
    const nameLookup = this._buildGroupPlayerLookup(match) || {};
    const groupNameMap = {};
    const groupPlayerMapByGroupId = {};
    (Array.isArray(match && match.groups) ? match.groups : []).forEach((g) => {
      if (!g || g.groupId == null) return;
      const gid = String(g.groupId);
      groupNameMap[gid] = g.groupName || '';
      const playerMap = {};
      (Array.isArray(g.players) ? g.players : []).forEach((p) => {
        const id = this._resolveAnyPlayerId(p);
        if (!id) return;
        playerMap[id] = p;
      });
      groupPlayerMapByGroupId[gid] = playerMap;
    });
    const pars = this._getMatchHolePars(match);
    const playerTeamLookup = this._buildLeaderboardPlayerTeamLookup(match);
    const teamLogoMap = this._buildTeamGroupLogoMap(match);
    const flat = [];

    Object.keys(scoreEntities).forEach((groupId) => {
      const entities = Array.isArray(scoreEntities[groupId]) ? scoreEntities[groupId] : [];
      if (!entities.length) return;
      const groupScoreData =
        scoreData[groupId] && typeof scoreData[groupId] === 'object' ? scoreData[groupId] : {};
      const teamScoresByEntity = Array.isArray(groupScoreData.teamScoresByEntity)
        ? groupScoreData.teamScoresByEntity
        : [];
      const scoreByEntityId = {};
      teamScoresByEntity.forEach((rec) => {
        if (!rec || typeof rec !== 'object') return;
        const key =
          rec.teamId != null && String(rec.teamId).trim() !== ''
            ? String(rec.teamId).trim()
            : rec.entityId != null && String(rec.entityId).trim() !== ''
              ? String(rec.entityId).trim()
              : '';
        if (!key) return;
        scoreByEntityId[key] = rec;
      });
      const slotPlayerMap = groupPlayerMapByGroupId[String(groupId)] || {};

      entities.forEach((entity, entityIndex) => {
        if (!entity) return;
        const entityId = entity.entityId != null ? String(entity.entityId).trim() : '';
        if (!entityId) return;
        const rawMembers = Array.isArray(entity.members) ? entity.members : [];
        const memberIds = rawMembers
          .map((m) => {
            if (m == null) return '';
            if (typeof m === 'string' || typeof m === 'number') return String(m).trim();
            if (typeof m === 'object') {
              const id = m.userId != null ? m.userId : (m.playerId != null ? m.playerId : m.id);
              return id != null ? String(id).trim() : '';
            }
            return '';
          })
          .filter(Boolean);

        const memberViews = memberIds
          .map((uid) => {
            const slotPlayer = slotPlayerMap[uid] || null;
            const displayName = this._resolveGroupedPlayerName(uid, slotPlayer, nameLookup);
            const lookup = nameLookup[uid] || {};
            const prof = playerDirectory.getProfileById
              ? playerDirectory.getProfileById(uid, Object.assign({}, lookup, slotPlayer || {}))
              : {};
            const genderDisplay = playerManage.getGenderDisplay(
              Object.assign({}, lookup, slotPlayer || {}, prof)
            );
            return {
              playerId: uid,
              userId: uid,
              name: displayName,
              displayName: displayName,
              avatar: this._resolveGroupedPlayerAvatar(uid, slotPlayer, nameLookup),
              flag: (prof && prof.flag) || '',
              badgeTeamId: this._resolveInterTeamBadgeLogoForPlayer(
                match,
                uid,
                playerTeamLookup,
                teamLogoMap
              ),
              country: (prof && prof.country) || '',
              age: (prof && prof.age) || '',
              isFemale: genderDisplay.gender === 'female',
              genderIcon: genderDisplay.icon,
              genderClass: genderDisplay.className
            };
          })
          .filter(Boolean);
        const rec = scoreByEntityId[entityId] || {};
        if (!comboEntityProjection.shouldKeepEntityComboRow(entityId, memberIds, rec)) {
          return;
        }
        const publicMembers = memberIds.map((uid) => {
          const slotPlayer = slotPlayerMap[uid] || null;
          const lookup = nameLookup[uid] || {};
          return {
            displayName: comboEntityProjection.memberPublicName(
              Object.assign({}, lookup, slotPlayer || {})
            )
          };
        });
        const entityType = entity.entityType ? String(entity.entityType) : '';
        const compositionMode =
          entity.compositionMode === '2+2' ? '2+2' : entity.compositionMode === '4+0' ? '4+0' : '';
        const kind =
          entityType === 'pair' || compositionMode === '2+2'
            ? 'pair'
            : 'team';
        const name = comboEntityProjection.formatEntityComboDisplayName(entity, publicMembers);
        const avatar = (memberViews[0] && memberViews[0].avatar) || '';
        const scores = Array.isArray(rec.scores) ? rec.scores.slice() : [];
        let grossTotal = 0;
        let parThru = 0;
        let thru = 0;
        for (let h = 0; h < 18; h++) {
          const s = scores[h];
          if (!this._isFilledLeaderboardScore(s)) continue;
          grossTotal += Number(s);
          parThru += Number(pars[h] || 0);
          thru += 1;
        }
        let toPar = grossTotal - parThru;
        let hasScore = thru > 0;
        if (!hasScore && comboEntityProjection.entityScoreRecordHasValue(rec)) {
          hasScore = true;
          if (rec.grossTotal != null && rec.grossTotal !== '' && Number.isFinite(Number(rec.grossTotal))) {
            grossTotal = Number(rec.grossTotal);
          } else if (rec.gross != null && rec.gross !== '' && Number.isFinite(Number(rec.gross))) {
            grossTotal = Number(rec.gross);
          }
          if (rec.toPar != null && rec.toPar !== '' && Number.isFinite(Number(rec.toPar))) {
            toPar = Number(rec.toPar);
          } else if (rec.diff != null && rec.diff !== '' && Number.isFinite(Number(rec.diff))) {
            toPar = Number(rec.diff);
          }
        }
        const teamGroupId =
          entity.teamGroupId != null && String(entity.teamGroupId).trim() !== ''
            ? String(entity.teamGroupId).trim()
            : '';
        flat.push({
          entityId: entityId,
          teamGroupId: teamGroupId,
          name: name,
          displayName: name,
          group: groupNameMap[String(groupId)] || '',
          groupId: String(groupId),
          scores: scores,
          members: memberViews,
          pairMembers: memberViews,
          kind: kind,
          compositionMode: compositionMode,
          isTeam: memberViews.length > 1,
          avatar: avatar,
          grossTotal: hasScore ? grossTotal : 0,
          toPar: hasScore ? toPar : 0,
          total: hasScore ? grossTotal : 0,
          diff: hasScore ? toPar : 0,
          thru: thru,
          hasScore: hasScore,
          scoreSource: 'teamMatch.scoreData.teamScoresByEntity',
          isEntity: true
        });
      });
    });

    if (!flat.length) return [];

    // 无 teamGroupId 时用成员报名分队回填（供分队榜聚合）
    const teamNameMap = this._buildLeaderboardTeamNameMap(match);
    flat.forEach((entity) => {
      if (entity.teamGroupId) return;
      const members = Array.isArray(entity.members) ? entity.members : [];
      for (let i = 0; i < members.length; i++) {
        const uid = members[i] && members[i].userId != null ? String(members[i].userId).trim() : '';
        const ref = uid && playerTeamLookup[uid] ? playerTeamLookup[uid] : null;
        if (ref && ref.teamId) {
          entity.teamGroupId = String(ref.teamId).trim();
          break;
        }
      }
    });

    flat.sort((a, b) => {
      if (a.thru === 0 && b.thru === 0) return 0;
      if (a.thru === 0) return 1;
      if (b.thru === 0) return -1;
      if (a.toPar !== b.toPar) return a.toPar - b.toPar;
      return b.thru - a.thru;
    });

    return flat.map((entity, index) => {
      const started = entity.thru > 0;
      const firstIndex = flat.findIndex((item) => item.thru > 0 && item.toPar === entity.toPar);
      const tied = flat.filter((item) => item.thru > 0 && item.toPar === entity.toPar).length > 1;
      const pos = !started ? '-' : tied ? 'T' + (firstIndex + 1) : String(index + 1);
      // 展示字段：teamGroupId → teamGroups.name；缺省时回退成员报名分队名
      let teamName = '';
      const teamGroupId = entity.teamGroupId != null ? String(entity.teamGroupId).trim() : '';
      if (teamGroupId && teamNameMap[teamGroupId]) {
        teamName = String(teamNameMap[teamGroupId]).trim();
      }
      if (!teamName) {
        const members = Array.isArray(entity.members) ? entity.members : [];
        for (let i = 0; i < members.length; i++) {
          const uid = members[i] && members[i].userId != null ? String(members[i].userId).trim() : '';
          const fromMember = this._resolveLeaderboardPlayerTeamName(uid, playerTeamLookup, teamNameMap);
          if (fromMember) {
            teamName = fromMember;
            break;
          }
        }
      }
      return {
        pos: pos,
        entityId: entity.entityId,
        teamGroupId: teamGroupId,
        teamName: teamName,
        teamTag: this._formatLeaderboardTeamTagName(teamName),
        name: entity.name,
        displayName: entity.displayName || entity.name,
        group: entity.group,
        groupId: entity.groupId,
        scores: entity.scores,
        members: Array.isArray(entity.members) ? entity.members : [],
        pairMembers: Array.isArray(entity.pairMembers) ? entity.pairMembers : (Array.isArray(entity.members) ? entity.members : []),
        kind: entity.kind || 'team',
        compositionMode: entity.compositionMode || '',
        isTeam: entity.isTeam === true,
        avatar: entity.avatar || '',
        thru: this._resolveLeaderboardThruLabel(entity.thru),
        _thruValue: entity.thru,
        grossTotal: entity.grossTotal,
        toPar: entity.toPar,
        total: entity.grossTotal,
        diff: entity.toPar,
        hasScore: entity.hasScore === true,
        scoreStr: started ? this._formatLeaderboardDiff(entity.toPar) : '-',
        scoreClass: started ? this._resolveLeaderboardTotalClass(entity.toPar) : 'score-even',
        scoreSource: entity.scoreSource || '',
        isEntity: true,
        expanded: index === openIndex
      };
    });
  },

  /** 个人榜行：补齐 grossTotal/toPar，并保留 total/diff 兼容别名 */
  _attachPersonalLeaderboardScoreFields(row) {
    if (!row) return row;
    const fields = this._getLeaderboardScoreFields(row);
    return Object.assign({}, row, {
      grossTotal: fields.grossTotal,
      toPar: fields.toPar,
      total: fields.grossTotal,
      diff: fields.toPar
    });
  },

  /**
   * 净杆榜 rows：只读 match.peoriaResult.results，不重算 HDCP。
   * 完整 18 洞按 net 升序；未完成追加末尾，POS / NET SCORE 显示 "-"。
   */
  _buildNetLeaderboardRows(match) {
    const results =
      match && match.peoriaResult && Array.isArray(match.peoriaResult.results)
        ? match.peoriaResult.results
        : [];
    const netByPlayerId = {};
    results.forEach((item) => {
      if (!item || item.playerId == null) return;
      const id = String(item.playerId).trim();
      if (!id) return;
      netByPlayerId[id] = item;
    });

    const groups = match && Array.isArray(match.groups) ? match.groups : [];
    if (!groups.length) return [];

    const playerLookup = this._buildGroupPlayerLookup(match);
    const teamNameMap = this._buildLeaderboardTeamNameMap(match);
    const playerTeamLookup = this._buildLeaderboardPlayerTeamLookup(match);
    const teamLogoMap = this._buildTeamGroupLogoMap(match);
    const flat = [];
    const seen = {};

    groups.forEach((group) => {
      const displayPlayers = this.hydrateGroupDisplayPlayers(group, playerLookup);
      const displayMap = {};
      displayPlayers.forEach((player) => {
        if (player && player.userId) displayMap[String(player.userId)] = player;
      });
      (Array.isArray(group && group.players) ? group.players : []).forEach((player) => {
        const playerId = this._resolveAnyPlayerId(player);
        if (!playerId || seen[playerId]) return;
        seen[playerId] = true;
        const scorePlayerId = this._resolveSlotScorePlayerId(player, playerId);
        const slotIndex = Number(player && (player.position != null ? player.position : player.slotIndex)) || 0;
        const display = displayMap[playerId] || {};
        const lookup = playerLookup[playerId] || {};
        const genderDisplay = playerManage.getGenderDisplay(
          Object.assign({}, lookup, player, { gender: lookup.gender || display.gender || player.gender })
        );
        const stat = this._computeMatchLeaderboardStats(match, group, player, playerId);
        const filledHoles = Number(stat && stat.thru) || 0;
        const peoria =
          netByPlayerId[playerId] ||
          (scorePlayerId ? netByPlayerId[scorePlayerId] : null) ||
          null;
        const netRaw = peoria && peoria.net != null ? Number(peoria.net) : NaN;
        const hasNetScore = filledHoles === 18 && Number.isFinite(netRaw);
        const teamName = this._resolveLeaderboardPlayerTeamName(playerId, playerTeamLookup, teamNameMap);
        flat.push({
          playerId: playerId,
          scorePlayerId: scorePlayerId || playerId,
          slotIndex: slotIndex,
          position: slotIndex,
          name: this._resolveViewerDisplayName(
            playerId,
            display.displayName ||
              display.name ||
              lookup.nickname ||
              this._resolveAnyPlayerNickname(player) ||
              '未知球员',
            {
              publicName: String(lookup.nickname || display.nickname || '').trim(),
              snapshotName: this._resolveAnyPlayerNickname(player) ||
                String(display.displayName || display.name || '').trim(),
              identityMasked: !!(lookup.identityMasked || player.identityMasked || display.identityMasked)
            }
          ),
          group: group.groupName || '',
          groupId: group.groupId || '',
          avatar: display.avatar || mockAvatars.resolveAvatar(player.avatar || player.avatarUrl || '', playerId),
          gender: genderDisplay.gender || '',
          isFemale: genderDisplay.gender === 'female',
          genderIcon: genderDisplay.icon,
          genderClass: genderDisplay.className,
          flag: player.flag || '',
          badgeTeamId: this._resolveInterTeamBadgeLogoForPlayer(
            match,
            playerId,
            playerTeamLookup,
            teamLogoMap
          ),
          country: player.country || '',
          age: player.age || '',
          filledHoles: filledHoles,
          thru: this._resolveLeaderboardThruLabel(filledHoles),
          teamName: teamName,
          teamTag: this._formatLeaderboardTeamTagName(teamName),
          net: hasNetScore ? netRaw : null,
          hasNetScore: hasNetScore,
          hasScore: hasNetScore,
          scoreSource: 'match.peoriaResult'
        });
      });
    });

    const complete = [];
    const incomplete = [];
    flat.forEach((row) => {
      if (row.hasNetScore) complete.push(row);
      else incomplete.push(row);
    });
    complete.sort((a, b) => Number(a.net) - Number(b.net));
    const rankedComplete = this._buildCompetitionRanking(complete, (row) => row.net);

    const formatNet = (value) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return '-';
      return Math.round(n * 100) % 100 === 0 ? String(Math.round(n)) : String(Math.round(n * 100) / 100);
    };

    // NET SCORE 固定为 peoriaResult.net 数字，不走 toPar / scoreDisplayMode
    const mapRow = (row) => {
      const netDisplay = row.hasNetScore ? formatNet(row.net) : '-';
      return {
        pos: row.hasNetScore ? row.pos : '-',
        name: row.name,
        group: row.group,
        groupId: row.groupId,
        playerId: row.playerId,
        scorePlayerId: row.scorePlayerId || row.playerId,
        slotIndex: row.slotIndex || row.position || 0,
        position: row.position || row.slotIndex || 0,
        gender: row.gender || '',
        isFemale: row.isFemale,
        genderIcon: row.genderIcon,
        genderClass: row.genderClass,
        thru: row.thru,
        filledHoles: row.filledHoles,
        net: row.hasNetScore ? row.net : null,
        netScoreDisplay: netDisplay,
        hasNetScore: row.hasNetScore === true,
        hasScore: row.hasNetScore === true,
        grossTotal: 0,
        toPar: 0,
        total: row.hasNetScore ? row.net : 0,
        diff: 0,
        scoreStr: netDisplay,
        scoreClass: 'score-even',
        avatar: row.avatar,
        country: row.country,
        age: row.age,
        flag: row.flag,
        badgeTeamId: row.badgeTeamId || '',
        teamName: row.teamName || '',
        teamTag: row.teamTag || '',
        scoreSource: row.scoreSource || 'match.peoriaResult',
        expanded: false
      };
    };

    return rankedComplete
      .map((row) => mapRow(row))
      .concat(incomplete.map((row) => mapRow(Object.assign({}, row, { pos: '-' }))));
  },

  _buildLeaderboardViewForView(match, view) {
    const scoreType = this.data.leaderboardScoreType === 'net' ? 'net' : 'gross';
    const board = personalLeaderboardBoard.buildPersonalLeaderboardBoard(match, {
      view: view,
      scoreType: scoreType,
      openIndex: this.data.openIndex
    });
    return (board && board.leaderboard) || [];
  },

  _buildCompetitionRanking(rows, scoreGetter) {
    const source = Array.isArray(rows) ? rows : [];
    const getter = typeof scoreGetter === 'function' ? scoreGetter : ((row) => row && row.total);
    const ranked = source.map((row) => Object.assign({}, row));
    const scores = ranked.map((row) => {
      const value = getter(row);
      const score = Number(value);
      return value === null || value === undefined || value === '' || Number.isNaN(score) ? null : score;
    });
    let index = 0;
    let rankedCount = 0;
    while (index < ranked.length) {
      const score = scores[index];
      if (score === null) {
        ranked[index].pos = '-';
        index += 1;
        continue;
      }
      const rank = rankedCount + 1;
      let end = index + 1;
      while (end < ranked.length && scores[end] === score) {
        end += 1;
      }
      const groupSize = end - index;
      const pos = groupSize > 1 ? ('T' + rank) : String(rank);
      for (let i = index; i < end; i++) {
        ranked[i].pos = pos;
      }
      rankedCount += groupSize;
      index = end;
    }
    return ranked;
  },

  _buildTeamLeaderboardView(match) {
    if (this.data.leaderboardScoreType === 'net') {
      return this._buildNetTeamLeaderboardView(match);
    }
    return teamLeaderboardView.buildGrossTeamLeaderboardView(match, this);
  },

  /**
   * 净杆分队榜：成员 net 来自 match.peoriaResult.results；
   * 按球队规则取前 N 名 net 累加为 teamNetScore，升序排名。
   */
  _buildNetTeamLeaderboardView(match) {
    const teamGroups = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
    if (teamGroups.length < 2) return [];

    const formatNet = (value) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return '-';
      return Math.round(n * 100) % 100 === 0
        ? String(Math.round(n))
        : String(Math.round(n * 100) / 100);
    };

    const results =
      match && match.peoriaResult && Array.isArray(match.peoriaResult.results)
        ? match.peoriaResult.results
        : [];
    const netByPlayerId = {};
    results.forEach((item) => {
      if (!item || item.playerId == null) return;
      const id = String(item.playerId).trim();
      if (!id) return;
      const net = Number(item.net);
      if (!Number.isFinite(net)) return;
      netByPlayerId[id] = net;
    });

    const rules = match && match.scoringRules;
    const competition = rules && rules.teamCompetition;
    const isTeamCompetitionEnabled = !!(competition && competition.enabled === true);
    const configuredTopN = isTeamCompetitionEnabled
      ? Math.max(1, parseInt(competition.topN, 10) || 1)
      : 0;

    const teamMap = this._buildTeamLeaderboardTeamMap(match);
    const playerLookup = this._buildGroupPlayerLookup(match);
    const playerTeamLookup = this._buildLeaderboardPlayerTeamLookup(match);
    const teamLogoMap = this._buildTeamGroupLogoMap(match);
    const groups = match && Array.isArray(match.groups) ? match.groups : [];

    groups.forEach((group) => {
      const displayPlayers = this.hydrateGroupDisplayPlayers(group, playerLookup);
      const displayMap = {};
      displayPlayers.forEach((displayPlayer) => {
        if (displayPlayer && displayPlayer.userId) displayMap[String(displayPlayer.userId)] = displayPlayer;
      });
      (Array.isArray(group && group.players) ? group.players : []).forEach((player) => {
        const playerId = this._resolveAnyPlayerId(player);
        if (!playerId) return;
        const teamRef = this._resolveLeaderboardPlayerTeam(player, playerId, playerLookup, playerTeamLookup);
        if (!teamRef.teamId) return;
        if (!teamMap[teamRef.teamId]) {
          teamMap[teamRef.teamId] = {
            teamId: teamRef.teamId,
            teamName: teamRef.teamName || unnamedSideLabel(match),
            grossTotal: 0,
            toPar: 0,
            total: 0,
            scoringPlayersCount: 0,
            players: []
          };
        } else if (!teamMap[teamRef.teamId].teamName && teamRef.teamName) {
          teamMap[teamRef.teamId].teamName = teamRef.teamName;
        }

        const lookup = playerLookup[playerId] || {};
        const display = displayMap[playerId] || {};
        const genderDisplay = playerManage.getGenderDisplay(
          Object.assign({}, lookup, player, { gender: lookup.gender || display.gender || player.gender })
        );
        const scorePlayerId = this._resolveSlotScorePlayerId(player, playerId);
        const name =
          display.displayName ||
          display.name ||
          lookup.nickname ||
          this._resolveAnyPlayerNickname(player) ||
          '未知球员';
        const avatar =
          display.avatar ||
          mockAvatars.resolveAvatar(lookup.avatar || player.avatar || player.avatarUrl || '', playerId);

        // THRU：仅用于展示；净杆成绩本身只读 peoriaResult
        const stat = this._computeMatchLeaderboardStats(match, group, player, playerId);
        const filledHoles = Number(stat && stat.thru) || 0;
        const netRaw =
          netByPlayerId[playerId] != null
            ? netByPlayerId[playerId]
            : (scorePlayerId && netByPlayerId[scorePlayerId] != null ? netByPlayerId[scorePlayerId] : NaN);
        const hasNetScore = filledHoles === 18 && Number.isFinite(netRaw);
        const netDisplay = hasNetScore ? formatNet(netRaw) : '-';
        const badgeTeamId = this._resolveInterTeamBadgeLogo(
          match,
          teamRef.teamId,
          teamLogoMap
        );

        teamMap[teamRef.teamId].players.push({
          playerId: playerId,
          userId: playerId,
          scorePlayerId: scorePlayerId,
          groupId: group && group.groupId ? String(group.groupId) : '',
          matchTeamId: teamRef.teamId,
          scorecardKey: teamRef.teamId + ':' + playerId,
          name: name,
          nickname: name,
          avatar: avatar,
          gender: genderDisplay.gender || '',
          genderIcon: genderDisplay.icon,
          genderClass: genderDisplay.className,
          country: player.country || '',
          age: player.age || '',
          flag: player.flag || '',
          badgeTeamId: badgeTeamId,
          filledHoles: filledHoles,
          net: hasNetScore ? netRaw : null,
          hasNetScore: hasNetScore,
          hasScore: hasNetScore,
          netScoreDisplay: netDisplay,
          scoreStr: netDisplay,
          scoreClass: 'score-even',
          thru: filledHoles > 0 ? this._resolveLeaderboardThruLabel(filledHoles) : '-',
          isCounting: false,
          grossTotal: 0,
          toPar: 0,
          total: hasNetScore ? netRaw : 0,
          diff: 0
        });
      });
    });

    const teamOrder = teamGroups
      .map((team) => (team && team.id != null ? String(team.id).trim() : ''))
      .filter(Boolean);
    const orderedTeams = teamOrder.map((teamId) => teamMap[teamId]).filter(Boolean);
    const extraTeams = Object.keys(teamMap)
      .filter((teamId) => teamOrder.indexOf(teamId) < 0)
      .map((teamId) => teamMap[teamId]);
    const teams = orderedTeams.concat(extraTeams)
      .filter((team) => (isTeamCompetitionEnabled ? team.players.length > 0 : true));
    if (!teams.length) return [];

    if (!isTeamCompetitionEnabled) {
      return teams.map((team, teamIndex) => {
        const sortedPlayers = team.players.slice().sort((a, b) => {
          if (a.hasNetScore !== b.hasNetScore) return a.hasNetScore ? -1 : 1;
          if (a.hasNetScore && b.hasNetScore && a.net !== b.net) return Number(a.net) - Number(b.net);
          return String(a.name || '').localeCompare(String(b.name || ''));
        });
        const rankedPlayers = this._buildCompetitionRanking(sortedPlayers, (player) => (
          player && player.hasNetScore === true ? player.net : null
        ));
        return {
          pos: String(teamIndex + 1),
          teamId: team.teamId,
          teamName: team.teamName || unnamedSideLabel(match),
          teamNetScore: null,
          playerCountLabel: String(rankedPlayers.length),
          thru: '-',
          grossTotal: 0,
          toPar: 0,
          total: 0,
          hasScore: false,
          scoreStr: '-',
          netScoreDisplay: '-',
          scoreClass: 'score-even',
          scoringPlayersCount: 0,
          players: rankedPlayers.map((player) => Object.assign({}, player, { isCounting: false }))
        };
      });
    }

    const sortedTeams = teams.map((team, teamIndex) => {
      const sortedPlayers = team.players.slice().sort((a, b) => {
        if (a.hasNetScore !== b.hasNetScore) return a.hasNetScore ? -1 : 1;
        if (a.hasNetScore && b.hasNetScore && a.net !== b.net) return Number(a.net) - Number(b.net);
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
      const scoringPlayersCount = Math.min(
        configuredTopN,
        sortedPlayers.filter((player) => player && player.hasNetScore === true).length
      );
      let teamNetScore = 0;
      let countingAssigned = 0;
      const players = sortedPlayers.map((player) => {
        const isCounting = player.hasNetScore === true && countingAssigned < scoringPlayersCount;
        if (isCounting) {
          teamNetScore += Number(player.net);
          countingAssigned += 1;
        }
        return Object.assign({}, player, { isCounting: isCounting });
      });
      const rankedPlayers = this._buildCompetitionRanking(players, (player) => (
        player && player.hasNetScore === true ? player.net : null
      ));
      const netDisplay = scoringPlayersCount > 0 ? formatNet(teamNetScore) : '-';
      return {
        teamId: team.teamId,
        teamName: team.teamName || unnamedSideLabel(match),
        teamNetScore: scoringPlayersCount > 0 ? teamNetScore : null,
        playerCountLabel: String(scoringPlayersCount),
        thru: '-',
        grossTotal: 0,
        toPar: 0,
        total: scoringPlayersCount > 0 ? teamNetScore : 0,
        hasScore: scoringPlayersCount > 0,
        scoreStr: netDisplay,
        netScoreDisplay: netDisplay,
        scoreClass: 'score-even',
        scoringPlayersCount: scoringPlayersCount,
        players: rankedPlayers,
        _sortIndex: teamIndex
      };
    }).sort((a, b) => {
      if (a.hasScore !== b.hasScore) return a.hasScore ? -1 : 1;
      if (a.hasScore && b.hasScore && a.teamNetScore !== b.teamNetScore) {
        return Number(a.teamNetScore) - Number(b.teamNetScore);
      }
      return a._sortIndex - b._sortIndex;
    });

    const rankedTeams = this._buildCompetitionRanking(sortedTeams, (team) => (
      team && team.hasScore === true ? team.teamNetScore : null
    ));
    return rankedTeams.map((team) => {
      const out = Object.assign({}, team);
      delete out._sortIndex;
      return out;
    });
  },

  _buildTeamLeaderboardTeamMap(match) {
    const map = {};
    const teamGroups = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
    const sideUnit = isInterTeamMatch(match) ? '球队' : '分队';
    teamGroups.forEach((team, index) => {
      const teamId = team && team.id != null ? String(team.id).trim() : '';
      if (!teamId) return;
      map[teamId] = {
        teamId: teamId,
        teamName: String((team && team.name) || '').trim() || (sideUnit + (index + 1)),
        grossTotal: 0,
        toPar: 0,
        total: 0,
        scoringPlayersCount: 0,
        players: []
      };
    });
    return map;
  },

  _buildLeaderboardPlayerTeamLookup(match) {
    const map = {};
    this._collectRegisterPlayerSources(match).forEach((users) => {
      users.forEach((user) => {
        const playerId = this._resolveAnyPlayerId(user);
        if (!playerId) return;
        const teamId = playerManage.resolveMatchTeamId(user);
        if (!teamId) return;
        const entry = {
          teamId: teamId,
          teamName: playerManage.resolveMatchTeamName(user),
          matchTeamId: user.matchTeamId != null ? String(user.matchTeamId).trim() : '',
          matchTeamName: user.matchTeamName != null ? String(user.matchTeamName).trim() : '',
          groupId: user.groupId != null ? String(user.groupId).trim() : '',
          groupName: user.groupName != null ? String(user.groupName).trim() : ''
        };
        [user.userId, user.playerId, user.id, user.uid, user.openid, playerId]
          .map((value) => (value != null ? String(value).trim() : ''))
          .filter(Boolean)
          .forEach((id) => { if (!map[id]) map[id] = entry; });
      });
    });
    return map;
  },

  _resolveLeaderboardPlayerTeam(player, playerId, playerLookup, playerTeamLookup) {
    const registerTeam = playerTeamLookup && playerId ? playerTeamLookup[playerId] : null;
    if (registerTeam && registerTeam.teamId) return registerTeam;

    const lookup = playerLookup && playerId ? playerLookup[playerId] : null;
    const lookupTeamId = playerManage.resolveMatchTeamId(lookup);
    if (lookupTeamId) {
      return {
        teamId: lookupTeamId,
        teamName: playerManage.resolveMatchTeamName(lookup)
      };
    }

    const directTeamId = playerManage.resolveMatchTeamId(player);
    if (directTeamId) {
      return {
        teamId: directTeamId,
        teamName: playerManage.resolveMatchTeamName(player)
      };
    }
    return { teamId: '', teamName: '' };
  },

  _resolveLeaderboardDefaultMode(match) {
    return this._leaderboardViewToMode(this._resolveLeaderboardDefaultView(match));
  },

  _isTeamCompetitionEnabled(match) {
    const rules = match && match.scoringRules;
    const competition = rules && rules.teamCompetition;
    return !!(competition && competition.enabled === true);
  },

  /**
   * 头像下方球队/分队标签是否展示：
   * - 队内赛 / 队际赛：有 teamGroups 即展示（不硬门控仅 team-internal）
   * - 普通球局及其他：沿用出发表原规则
   */
  _shouldShowAvatarTeamLabel(match) {
    const teamGroups = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
    if (isTeamMatchFamily(match)) {
      return teamGroups.length >= 1;
    }
    return this._shouldShowTeeSheetTeamLabel(match);
  },

  /**
   * LIVE 出发表：是否显示球员分队标签（仅展示，不改分组/成绩数据）
   * - 队内/队际：委托 _shouldShowAvatarTeamLabel
   * - G5–G8 比洞：永远两队天然 PK → teamCount === 2 即显示
   * - 其他赛制：teamCount >= 3 || (teamCount === 2 && hasTeamPK)
   */
  _shouldShowTeeSheetTeamLabel(match) {
    if (isTeamMatchFamily(match)) {
      return this._shouldShowAvatarTeamLabel(match);
    }
    const teamGroups = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
    const teamCount = teamGroups.length;
    const gameMode = String(
      (match && (match.gameMode || match.selectedGameMode)) || ''
    );
    const isG578MatchPlay =
      isG5MatchPlayMode(gameMode) ||
      isG6G7MatchPlayMode(gameMode) ||
      isG8MatchPlayMode(gameMode);
    if (isG578MatchPlay) {
      return teamCount === 2;
    }
    const hasTeamPK = this._isTeamCompetitionEnabled(match);
    return teamCount >= 3 || (teamCount === 2 && hasTeamPK);
  },

  _resolveLeaderboardViewOptions(match) {
    return leaderboardSettingViewModel.resolveLeaderboardViewOptions(match);
  },

  _resolveLeaderboardDefaultView(match) {
    return leaderboardSettingViewModel.resolveLeaderboardDefaultView(match);
  },

  _leaderboardViewToMode(view) {
    return leaderboardSettingViewModel.leaderboardViewToMode(view);
  },

  _leaderboardModeToView(mode) {
    return mode === 'team' ? 'team' : 'all';
  },

  _buildLeaderboardViewLabel(scoreType, view) {
    const sideLabel = this.data.isInterTeamMatch ? '球队' : '分队';
    return leaderboardSettingViewModel.buildLeaderboardViewLabel(
      scoreType,
      view,
      sideLabel
    );
  },

  /** 领先榜「净杆」入口：仅当 peoriaResult 已生成时可点（共享权威） */
  _hasLeaderboardNetScore(match) {
    return leaderboardSettingViewModel.hasLeaderboardNetScore(match);
  },

  /**
   * G5–G8 出发表出发洞优先级（仅展示）：
   * 1) scoreData[groupId].matchPlayMeta.startHole（normalize）
   * 2) scoreData[groupId].matchPlayMeta.startHole（原始有效 1–18）
   * 3) 创建阶段 group.startHole
   */
  _resolveTeeSheetMatchPlayStartHole(match, groupId, group) {
    const gid = groupId != null ? String(groupId).trim() : '';
    const bucket = this._readMatchPlayGroupScoreBucket(match, gid);
    const normalized =
      typeof teamMatchStore.normalizeMatchPlayMeta === 'function'
        ? teamMatchStore.normalizeMatchPlayMeta(bucket.matchPlayMeta)
        : null;
    if (normalized && normalized.startHole) return normalized.startHole;
    const rawMeta = bucket && bucket.matchPlayMeta;
    if (rawMeta && rawMeta.startHole != null && rawMeta.startHole !== '') {
      const n = Number(rawMeta.startHole);
      if (Number.isFinite(n)) {
        const h = Math.floor(n);
        if (h >= 1 && h <= 18) return h;
      }
    }
    return teeSheetManage.resolveGroupStartHole(group);
  },

  /** G5–G8：出发表 meta 行洞号用 A1–B9（与 Details HOLE 一致） */
  _formatMatchPlayTeeMetaLine(teeTime, startHole) {
    const t =
      typeof teeSheetManage.normalizeTeeTime === 'function'
        ? teeSheetManage.normalizeTeeTime(teeTime)
        : String(teeTime || '').trim();
    const label = formatMatchPlayDisplayHole(startHole);
    if (t && label) return t + ' · ' + label + '出发';
    if (t) return t + ' · 待分配';
    if (label) return label + '出发';
    return '待分配';
  },

  /** G5–G8：用实际 matchPlayMeta 起始洞覆盖出发表卡片展示（不写盘） */
  _applyMatchPlayStartHoleToTeeGroups(match, teeGroups) {
    if (!match || !isMatchPlayBoardMode(resolveGameMode(match))) {
      return teeGroups || [];
    }
    const list = Array.isArray(teeGroups) ? teeGroups : [];
    const groups = Array.isArray(match.groups) ? match.groups : [];
    const groupById = {};
    groups.forEach((g, index) => {
      const id = g && g.groupId != null ? String(g.groupId) : '';
      if (id) groupById[id] = g;
      else groupById['group-' + (index + 1)] = g;
    });
    return list.map((tg, index) => {
      if (!tg) return tg;
      const gid = tg.groupId != null ? String(tg.groupId) : tg.id != null ? String(tg.id) : '';
      const group = groupById[gid] || groups[index] || null;
      const startHole = this._resolveTeeSheetMatchPlayStartHole(match, gid, group);
      const holeLabel = formatMatchPlayDisplayHole(startHole);
      return Object.assign({}, tg, {
        startHole: startHole,
        hole: holeLabel ? holeLabel + '出发' : '待分配',
        teeMetaLine: this._formatMatchPlayTeeMetaLine(tg.teeTime, startHole),
        hasTeeInfo: !!(tg.teeTime || startHole != null)
      });
    });
  },

  /**
   * 出发表 LIVE 角标洞数：
   * - G6/G7/G8：双方 Side 共同完成洞数（scoresBySide / _resolveMatchPlayGroupSideScores）
   * - G5 及比杆：组内个人最大 thru（scoresByPlayer）
   */
  _resolveTeeSheetLiveHoleCount(match, group) {
    if (!match || !group) return 0;
    const gameMode = resolveGameMode(match);
    if (isG6G7MatchPlayMode(gameMode) || isG8MatchPlayMode(gameMode)) {
      const teamIds = this._resolveMatchPlaySideTeamIds(match);
      const sideScores = this._resolveMatchPlayGroupSideScores(match, group, teamIds, false);
      const summary = this._buildMatchPlayResultSummary(
        sideScores.scoresA,
        sideScores.scoresB,
        sideScores.startHole
      );
      return Number(summary && summary.thru) || 0;
    }
    const players = Array.isArray(group.players) ? group.players.filter(Boolean) : [];
    let maxThru = 0;
    players.forEach((p) => {
      const pid = this._resolveAnyPlayerId(p);
      const thru = (this._computeMatchLeaderboardStats(match, group, p, pid) || {}).thru || 0;
      if (thru > maxThru) maxThru = thru;
    });
    return maxThru;
  },

  /**
   * LIVE 出发表角标：洞数 + 可选用时（如 3H 45'）。
   * 用时来自 scoreData[groupId].firstScoreAt；不改 statusKey / matchStatus。
   */
  _applyLiveHoleStatusBadgeToTeeGroups(match, teeGroups) {
    const list = Array.isArray(teeGroups) ? teeGroups : [];
    if (!list.length) return list;
    const groups = match && Array.isArray(match.groups) ? match.groups : [];
    const groupById = {};
    groups.forEach((g) => {
      if (!g || g.groupId == null) return;
      groupById[String(g.groupId)] = g;
    });
    const scoreData =
      match && match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
        ? match.scoreData
        : null;
    return list.map((card) => {
      if (!card || card.statusKey !== 'live') return card;
      const groupId =
        card.groupId != null || card.id != null ? String(card.groupId || card.id) : '';
      let holeCount = 0;
      if (match) {
        holeCount = this._resolveTeeSheetLiveHoleCount(match, groupById[groupId] || null);
      } else if (groupId) {
        const g = groupsStore.getGroup(groupId);
        const players = g && Array.isArray(g.players) ? g.players.filter(Boolean) : [];
        players.forEach((p) => {
          const thru = (groupsStore.computePlayerStats(p) || {}).thru || 0;
          if (thru > holeCount) holeCount = thru;
        });
      }
      let statusBadge = String(holeCount) + 'H';
      const bucket =
        scoreData && groupId && scoreData[groupId] && typeof scoreData[groupId] === 'object'
          ? scoreData[groupId]
          : null;
      const firstScoreAt = bucket ? Number(bucket.firstScoreAt) : NaN;
      if (Number.isFinite(firstScoreAt) && firstScoreAt > 0) {
        const finishedScoreAt = bucket ? Number(bucket.finishedScoreAt) : NaN;
        const endMs =
          Number.isFinite(finishedScoreAt) && finishedScoreAt > 0
            ? finishedScoreAt
            : Date.now();
        statusBadge =
          statusBadge + gameProgress.formatLiveDurationBadgeSuffix(firstScoreAt, endMs);
      }
      return Object.assign({}, card, { statusBadge: statusBadge });
    });
  },

  refreshGroupsDerived() {
    // 仅刷新出发表派生；领先榜由 loadMatch / refreshMatchData 写入，避免 onShow 双倍 setData 大投影
    this._syncTournamentHoleLayout();
    groupsStore.ensureInitialized();
    const matchId = this.data.matchId || '';
    let teeGroups = [];
    let match = null;
    if (demoJiaobeiMatch.isJiaobeiDemoMatchId(matchId)) {
      teeGroups = this._applyLiveHoleStatusBadgeToTeeGroups(null, groupsStore.getTeeGroupsView());
    } else {
      match = matchId ? teamMatchStore.getMatchById(matchId) : null;
      if (match && Array.isArray(match.groups) && match.groups.length) {
        const playerLookup = this._buildGroupPlayerLookup(match);
        teeGroups = teeSheetManage.buildTeeSheetTabView(match, {
          playerLookup: playerLookup,
          source: 'match'
        });
        teeGroups = this._mergeTeeSheetPlayerTeeInfo(match, teeGroups, playerLookup);
        teeGroups = this._applyMatchPlayStartHoleToTeeGroups(match, teeGroups);
        teeGroups = this._applyLiveHoleStatusBadgeToTeeGroups(match, teeGroups);
      } else {
        teeGroups = [];
      }
    }
    this.setData({
      teeGroups: teeGroups,
      showLeaderboardTeamColumn: this._shouldShowTeeSheetTeamLabel(match),
      teeSheetBottomCta: this._projectTeeSheetBottomCta(match)
    });
  },

  _mergeTeeSheetPlayerTeeInfo(match, teeGroups, playerLookup) {
    const groups = match && Array.isArray(match.groups) ? match.groups : [];
    const lookup = playerLookup || {};
    const showTeamLabel = this._shouldShowAvatarTeamLabel(match);
    const teamNameMap = showTeamLabel ? this._buildLeaderboardTeamNameMap(match) : {};
    const playerTeamLookup = showTeamLabel ? this._buildLeaderboardPlayerTeamLookup(match) : {};
    const displayByGroup = {};
    const rawByGroup = {};
    groups.forEach((group, index) => {
      const groupId = group && group.groupId != null ? String(group.groupId) : ('group-' + (index + 1));
      const playerMap = {};
      const rawMap = {};
      this.hydrateGroupDisplayPlayers(group, lookup, {
        match: match,
        showTeamLabel: showTeamLabel,
        teamNameMap: teamNameMap,
        playerTeamLookup: playerTeamLookup
      }).forEach((player) => {
        if (!player || !player.userId) return;
        playerMap[String(player.userId)] = player;
      });
      (Array.isArray(group && group.players) ? group.players : []).forEach((raw) => {
        const uid = this._resolveAnyPlayerId(raw);
        if (!uid) return;
        rawMap[String(uid)] = raw;
      });
      displayByGroup[groupId] = playerMap;
      rawByGroup[groupId] = rawMap;
    });
    return (Array.isArray(teeGroups) ? teeGroups : []).map((card) => {
      const groupId = card && (card.groupId || card.id) != null ? String(card.groupId || card.id) : '';
      const playerMap = displayByGroup[groupId] || {};
      const rawMap = rawByGroup[groupId] || {};
      const players = (Array.isArray(card && card.players) ? card.players : []).map((player) => {
        const playerId = player && (player.userId || player.playerId) != null
          ? String(player.userId || player.playerId)
          : '';
        const display = playerMap[playerId] || {};
        const raw = rawMap[playerId] || {};
        // 出发表 T 台：已由 hydrate（groups.players 优先）算出；勿再用 gender lookup 覆盖
        const teeCode =
          display.teeCode ||
          display.tPosition ||
          (raw.tPosition === tPosition.RED_T || raw.tPosition === tPosition.BLUE_T
            ? raw.tPosition
            : '') ||
          (raw.tee === tPosition.RED_T || raw.tee === tPosition.BLUE_T ? raw.tee : '') ||
          player.teeCode ||
          '';
        const teeText =
          display.teeText ||
          display.teeLabel ||
          (teeCode === tPosition.RED_T ? '红T' : teeCode === tPosition.BLUE_T ? '蓝T' : '') ||
          player.teeText ||
          player.tee ||
          '';
        return Object.assign({}, player, {
          tee: teeText || player.tee || '',
          teeText: teeText,
          teeLabel: display.teeLabel || teeText || player.teeLabel || '',
          teeCode: teeCode || player.teeCode || '',
          tPosition: teeCode || player.tPosition || '',
          teeMarkerClass:
            display.teeMarkerClass ||
            (teeCode === tPosition.RED_T
              ? 'tee-marker-dot--female'
              : teeCode === tPosition.BLUE_T
                ? 'tee-marker-dot--male'
                : player.teeMarkerClass || ''),
          teamLabel: showTeamLabel
            ? (display.teamLabel
              || this._resolveTeeSheetPlayerTeamLabel(raw, playerId, teamNameMap, playerTeamLookup)
              || '')
            : ''
        });
      });
      return Object.assign({}, card, { players: players });
    });
  },

  /**
   * 出发表分队标签：优先 groups.players 上的分队字段，再回退报名分队名；不读 scoreEntities。
   */
  _resolveTeeSheetPlayerTeamLabel(rawPlayer, userId, teamNameMap, playerTeamLookup) {
    const raw = rawPlayer && typeof rawPlayer === 'object' ? rawPlayer : {};
    const directName =
      (raw.teamGroupName != null && String(raw.teamGroupName).trim()) ||
      (raw.teamName != null && String(raw.teamName).trim()) ||
      (raw.matchTeamName != null && String(raw.matchTeamName).trim()) ||
      '';
    if (directName) {
      return this._formatLeaderboardTeamTagName(directName);
    }
    const teamId =
      (raw.teamGroupId != null && String(raw.teamGroupId).trim()) ||
      (raw.teamId != null && String(raw.teamId).trim()) ||
      (raw.matchTeamId != null && String(raw.matchTeamId).trim()) ||
      '';
    if (teamId && teamNameMap && teamNameMap[teamId]) {
      return this._formatLeaderboardTeamTagName(teamNameMap[teamId]);
    }
    const uid = userId != null ? String(userId).trim() : '';
    const ref = uid && playerTeamLookup ? playerTeamLookup[uid] : null;
    if (ref) {
      const fromMap =
        (ref.teamId && teamNameMap && teamNameMap[ref.teamId]) ||
        ref.teamName ||
        ref.matchTeamName ||
        '';
      return this._formatLeaderboardTeamTagName(fromMap);
    }
    return '';
  },

  refreshLeaderboard() {
    const matchId = this.data.matchId || '';
    const match = matchId && !demoJiaobeiMatch.isJiaobeiDemoMatchId(matchId)
      ? teamMatchStore.getMatchById(matchId)
      : null;
    const leaderboardRows = this._enrichLeaderboardRowsWithMetrics(
      this._buildLeaderboardViewForView(match, this.data.leaderboardView || 'all'),
      match
    );
    const teamLeaderboardRows = this._enrichTeamLeaderboardWithMetrics(
      this._buildTeamLeaderboardView(match),
      match
    );
    this.setData(Object.assign({
      showLeaderboardTeamColumn: this._shouldShowTeeSheetTeamLabel(match),
      leaderboard: leaderboardRows,
      teamLeaderboard: teamLeaderboardRows,
      teamGroupLogoById: this._buildTeamGroupLogoMap(match),
      leaderboardAvatarBadge: this._resolveLeaderboardAvatarBadge(match),
      leaderboardMetaMode: this._resolveLeaderboardMetaMode(match),
      leaderboardShowExpandGender: this._resolveLeaderboardShowExpandGender(match),
      leaderboardViewLabel: this._buildLeaderboardViewLabel(
        this.data.leaderboardScoreType || 'gross',
        this.data.leaderboardView || 'all'
      )
    }, this._buildLeaderboardProfileEntryPatch(leaderboardRows, teamLeaderboardRows), this._buildLeaderboardRelationPatch(leaderboardRows, teamLeaderboardRows, match)));
  },

  _buildLeaderboardSettingSheetModel(match, draftView, draftScoreType) {
    const sideLabel =
      this.data.registerSideLabel || (this.data.isInterTeamMatch ? '球队' : '分队');
    const packed = leaderboardSettingViewModel.buildLeaderboardSettingViewModel(
      match,
      { view: draftView, scoreType: draftScoreType },
      { sideLabel: sideLabel }
    );
    return {
      leaderboardNetScoreAvailable: packed.netAvailable,
      draftLeaderboardView: packed.selection.view,
      draftLeaderboardScoreType: packed.selection.scoreType,
      leaderboardSettingSections: packed.sections,
      leaderboardSettingDraftValues: packed.draftValues
    };
  },

  openLeaderboardSettingSheet() {
    const matchId = this.data.matchId || '';
    const match = matchId ? this._resolveMatchData(matchId) : null;
    const netAvailable = this._hasLeaderboardNetScore(match);
    const currentScoreType =
      this.data.leaderboardScoreType === 'net' && netAvailable ? 'net' : 'gross';
    const model = this._buildLeaderboardSettingSheetModel(
      match,
      this.data.leaderboardView || 'all',
      currentScoreType
    );
    this.setData(
      Object.assign(
        {
          showMoreSheet: false,
          moreFabExpanded: false,
          showLeaderboardSettingSheet: true
        },
        model
      )
    );
  },

  /** peoria 页「查看领先榜」：直接进入净杆 Tab */
  openNetLeaderboardFromPeoria() {
    const matchId = this.data.matchId || '';
    const match = matchId ? this._resolveMatchData(matchId) : null;
    const netAvailable = this._hasLeaderboardNetScore(match);
    if (!netAvailable) {
      wx.showToast({ title: '净杆尚未生成', icon: 'none' });
      return;
    }
    const view = this.data.leaderboardView || 'all';
    this.setData({
      showMoreSheet: false,
      moreFabExpanded: false,
      showLeaderboardSettingSheet: false,
      activeTab: 'leaderboard',
      leaderboardScoreType: 'net',
      leaderboardNetScoreAvailable: true,
      leaderboardViewLabel: this._buildLeaderboardViewLabel('net', view),
      expandedTeamId: '',
      openIndex: -1,
      openScorecard: null
    }, () => {
      this.refreshLeaderboard();
    });
  },

  closeLeaderboardSettingSheet() {
    this.setData({ showLeaderboardSettingSheet: false });
  },

  onLeaderboardSettingChange(e) {
    const detail = (e && e.detail) || {};
    const section = detail.section != null ? String(detail.section) : '';
    const key = detail.key != null ? String(detail.key) : '';
    if (!section || !key) return;
    const draft = Object.assign({}, this.data.leaderboardSettingDraftValues || {});
    if (section === 'view') {
      if (this.data.leaderboardViewOptions.indexOf(key) < 0) return;
      draft.view = key;
      this.setData({
        draftLeaderboardView: key,
        leaderboardSettingDraftValues: draft
      });
      return;
    }
    if (section === 'scoreType') {
      if (key !== 'gross' && key !== 'net') return;
      if (key === 'net' && !this.data.leaderboardNetScoreAvailable) return;
      draft.scoreType = key;
      this.setData({
        draftLeaderboardScoreType: key,
        leaderboardSettingDraftValues: draft
      });
    }
  },

  /** @deprecated 兼容旧绑定名：改走共享组件 change */
  onDraftLeaderboardViewSelect(e) {
    const view = e && e.currentTarget && e.currentTarget.dataset
      ? String(e.currentTarget.dataset.view || '')
      : '';
    this.onLeaderboardSettingChange({ detail: { section: 'view', key: view } });
  },

  /** @deprecated 兼容旧绑定名 */
  onDraftLeaderboardScoreTypeSelect(e) {
    const type = e && e.currentTarget && e.currentTarget.dataset
      ? String(e.currentTarget.dataset.type || '')
      : '';
    this.onLeaderboardSettingChange({ detail: { section: 'scoreType', key: type } });
  },

  confirmLeaderboardSettingSheet(e) {
    const values =
      (e && e.detail && e.detail.values) || this.data.leaderboardSettingDraftValues || {};
    const draftView = values.view || this.data.draftLeaderboardView;
    const draftScore = values.scoreType || this.data.draftLeaderboardScoreType;
    const match =
      (this.data.matchId && teamMatchStore.getMatchById(this.data.matchId)) ||
      this.data.match ||
      null;
    const normalized = leaderboardSettingViewModel.normalizeLeaderboardSelection(match, {
      view: draftView,
      scoreType: draftScore
    });
    const view = normalized.view;
    const scoreType = normalized.scoreType;
    this.setData({
      showLeaderboardSettingSheet: false,
      activeTab: 'leaderboard',
      leaderboardView: view,
      leaderboardMode: this._leaderboardViewToMode(view),
      leaderboardScoreType: scoreType,
      leaderboardViewLabel: this._buildLeaderboardViewLabel(scoreType, view),
      expandedTeamId: '',
      openIndex: -1,
      openScorecard: null
    }, () => {
      this.refreshLeaderboard();
    });
  },

  toggleTeamLeaderboardRow(e) {
    const teamId = e.currentTarget.dataset.teamId != null
      ? String(e.currentTarget.dataset.teamId)
      : '';
    const next = this.data.expandedTeamId === teamId ? '' : teamId;
    this._activeTeamLeaderboardPlayer = null;
    this.setData({
      expandedTeamId: next,
      openIndex: -1,
      openScorecard: null
    });
  },

  onLiveLeaderboardTeamTap(e) {
    const teamId =
      e && e.detail && e.detail.teamId != null ? String(e.detail.teamId) : '';
    this.toggleTeamLeaderboardRow({
      currentTarget: { dataset: { teamId: teamId } }
    });
  },

  onLiveLeaderboardScorecardTap(e) {
    const d = (e && e.detail) || {};
    const matchId = this.data.matchId || '';
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    const result = liveLeaderboardScorecard.applyLiveScorecardTap(
      {
        view: 'team',
        openIndex: this.data.openIndex,
        teamLeaderboard: this.data.teamLeaderboard,
        leaderboard: this.data.leaderboard,
        match: match,
        scoreDisplayMode: this.data.scoreDisplayMode
      },
      d
    );
    this._activeTeamLeaderboardPlayer = result.activeRow || null;
    this.setData({
      openIndex: result.openIndex,
      openScorecard: result.openScorecard,
      scorecardCourseTitle: result.scorecardCourseTitle || this.data.scorecardCourseTitle,
      scorePanel: result.scorePanel || this.data.scorePanel || 'technical'
    });
  },

  // 点击领先榜球员行：在该行下方展开/收起逐洞详情（一次仅一个）
  /** G5–G8 得分榜：展开/收起 Details（手风琴：同时仅一张展开） */
  toggleMatchPlayScoreboardCard(e) {
    const id = String(
      (e && e.detail && e.detail.id) ||
        (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) ||
        ''
    );
    const board = this.data.matchPlayScoreboard;
    if (!id || !board || !Array.isArray(board.matches)) return;
    const target = board.matches.find((m) => m && String(m.id) === id);
    const willExpand = !(target && target.expanded);

    // 折叠：只改 expanded
    if (!willExpand) {
      const matches = board.matches.map((m) => {
        if (!m) return m;
        return Object.assign({}, m, { expanded: false });
      });
      this.setData({
        matchPlayScoreboard: Object.assign({}, board, { matches: matches })
      });
      return;
    }

    // 未开始：不重拉 scoreData，直接展开 comingSoon 提示
    if (target && target.detailsMode === 'comingSoon') {
      const matchesSoon = board.matches.map((m) => {
        if (!m) return m;
        return Object.assign({}, m, {
          expanded: String(m.id) === id
        });
      });
      this.setData({
        matchPlayScoreboard: Object.assign({}, board, { matches: matchesSoon })
      });
      return;
    }

    // 展开 scorecard：从 store 重拉当前组 detailTable
    let detailPatch = null;
    const matchId = this.data.matchId || '';
    const match = matchId ? this._resolveMatchData(matchId) : null;
    if (match && Array.isArray(match.groups)) {
      const group =
        match.groups.find((g) => g && String(g.groupId) === id) || null;
      if (group) {
        const teamIds = this._resolveMatchPlaySideTeamIds(match);
        const isG5 = isG5MatchPlayMode(resolveGameMode(match));
        const detailTable = this._buildMatchPlayCardDetailTable(
          match,
          group,
          teamIds,
          isG5
        );
        detailPatch = {
          holeColumns: detailTable.holeColumns,
          holeLabels: detailTable.holeLabels,
          pars: detailTable.pars,
          statusCells: detailTable.statusCells,
          scoreCells: detailTable.scoreCells,
          holeDots: detailTable.holeDots,
          detailsMode: 'scorecard'
        };
      }
    }

    const matches = board.matches.map((m) => {
      if (!m) return m;
      if (String(m.id) !== id) {
        return Object.assign({}, m, { expanded: false });
      }
      return Object.assign({}, m, detailPatch || {}, { expanded: true });
    });
    this.setData({
      matchPlayScoreboard: Object.assign({}, board, { matches: matches })
    });
  },

  toggleScorecard(e) {
    if (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.mode === 'team') {
      const key = e.currentTarget.dataset.index != null ? String(e.currentTarget.dataset.index) : '';
      const next = this.data.openIndex === key ? -1 : key;
      this._activeTeamLeaderboardPlayer =
        next === -1 ? null : (e.currentTarget.dataset.player || null);
      this.setData({ openIndex: next });
      this.updateOpenScorecard();
      return;
    }
    const idx = Number(e.currentTarget.dataset.index);
    const next = this.data.openIndex === idx ? -1 : idx;
    this.setData({ openIndex: next });
    this.refreshLeaderboard();
    this.updateOpenScorecard();
  },

  onPersonalLeaderboardRowTap(e) {
    const index = e && e.detail ? e.detail.index : undefined;
    this.toggleScorecard({
      currentTarget: { dataset: { index: index } }
    });
  },

  onPersonalLeaderboardAdError() {
    this.setData({
      scorecardAdImage: this._resolveScorecardAdImage(getApp().getTheme(), this.data.matchId)
    });
  },

  // 逐洞详情数据：真实球队赛优先读取 match.scoreData，演示/旧数据继续回退 groupsStore
  updateOpenScorecard() {
    const idx = this.data.openIndex;
    const row = this.data.leaderboardMode === 'team'
      ? this._resolveTeamLeaderboardPlayerRow(idx)
      : (idx >= 0 ? this.data.leaderboard[idx] : null);
    if (!row) {
      this.setData({ openScorecard: null });
      return;
    }
    const matchId = this.data.matchId;
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    const scorecard = this._resolveTeamMatchScorecard(match, row);
    if (scorecard) {
      detailDebugLog('[scorecard-source]', {
        source: scorecard.scorecardStatus === 'not_started' ? 'teamMatch.not_started' : 'teamMatch.scoreData',
        matchId,
        groupId: row.groupId,
        playerId: row.playerId || '',
        entityId: row.entityId || '',
        isEntity: !!(row.isEntity || row.entityId)
      });
      this.setData({ openScorecard: scorecard });
      return;
    }
    detailDebugLog('[scorecard-source]', {
      source: 'groupsStore',
      playerId: row.playerId
    });
    this.setData({
      openScorecard: groupsStore.buildPlayerScorecard(row.playerId, this.data.scoreDisplayMode)
    });
  },

  _resolveTeamLeaderboardPlayerRow(scorecardKey) {
    if (!scorecardKey || scorecardKey === -1) return null;
    const key = String(scorecardKey);
    if (
      this._activeTeamLeaderboardPlayer &&
      this._activeTeamLeaderboardPlayer.scorecardKey === key
    ) {
      return this._activeTeamLeaderboardPlayer;
    }
    const teams = Array.isArray(this.data.teamLeaderboard) ? this.data.teamLeaderboard : [];
    for (let i = 0; i < teams.length; i++) {
      const players = Array.isArray(teams[i] && teams[i].players) ? teams[i].players : [];
      const player = players.find((item) => item && item.scorecardKey === key);
      if (player) return player;
    }
    return null;
  },

  noop() {},

  /**
   * 球员主页统一入口（主包 openPlayerProfile；不复制身份判断）。
   * @param {{ userId?: string, playerId?: string, name?: string, avatar?: string, userType?: string, identitySource?: string, unavailable?: boolean }} raw
   */
  _openReservedPlayerProfile(raw) {
    if (this._profileNavLock) return null;
    const payload = raw && typeof raw === 'object' ? raw : {};
    if (payload.unavailable) {
      wx.showToast({ title: '该球员暂无主页', icon: 'none', duration: 1200 });
      return null;
    }
    const targetUserId = openPlayerProfileUtil.resolveOpenableUserId({
      userId: payload.userId || payload.playerId,
      playerId: payload.playerId || payload.userId,
      userType: payload.userType
    });
    if (!targetUserId) {
      wx.showToast({ title: '该球员暂无主页', icon: 'none', duration: 1200 });
      return null;
    }
    this._profileNavLock = true;
    const self = this;
    const opened = openPlayerProfileUtil.openPlayerProfile({
      userId: targetUserId,
      playerId: targetUserId,
      // 公开/赛事快照昵称；禁止备注展示名进入导航 context
      publicName:
        payload.publicName ||
        payload.nickname ||
        payload.matchNickname ||
        payload.competitionName ||
        '',
      name:
        payload.publicName ||
        payload.nickname ||
        payload.matchNickname ||
        payload.competitionName ||
        payload.name,
      nickname: payload.nickname || payload.matchNickname || '',
      avatar: payload.avatar,
      gender: payload.gender,
      handicap: payload.handicap,
      floatCoef: payload.floatCoef,
      userType: payload.userType,
      identitySource: payload.identitySource || 'tournamentLeaderboard'
    });
    if (!opened) {
      this._profileNavLock = false;
      wx.showToast({ title: '该球员暂无主页', icon: 'none', duration: 1200 });
      return null;
    }
    setTimeout(function () {
      self._profileNavLock = false;
    }, 800);
    return targetUserId;
  },

  /**
   * 领先榜展开：昵称后 › → 球员主页（组件 profiletap / 行内 catchtap）。
   */
  onLeaderboardPlayerProfileTap(e) {
    const detail = (e && e.detail) || {};
    const ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
    this._openReservedPlayerProfile({
      userId: detail.userId || detail.playerId || ds.userid || ds.userId,
      playerId: detail.playerId || detail.userId || ds.playerid || ds.playerId,
      publicName: detail.publicName || detail.name || ds.name,
      name: detail.publicName || detail.name || ds.name,
      avatar: detail.avatar || ds.avatar,
      gender: detail.gender,
      handicap: detail.handicap,
      floatCoef: detail.floatCoef,
      userType: detail.userType || ds.usertype || ds.userType,
      identitySource: detail.identitySource || ds.identitysource || ds.identitySource,
      unavailable: !!detail.unavailable
    });
  },

  /**
   * 报名 Tab 用户行 → 球员资料页预留入口（队内赛 / 队际赛）。
   * 行内独立操作须用 catchtap，避免与本事件同时触发。
   */
  onRegisterPlayerProfileTap(e) {
    const matchId = this.data.matchId || '';
    const match = matchId ? this._resolveMatchData(matchId) : null;
    if (!isTeamMatchFamily(match || this.data.match)) return;
    const ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
    this._openReservedPlayerProfile({
      userId: ds.userid || ds.userId,
      playerId: ds.playerid || ds.playerId || ds.userid || ds.userId,
      name: ds.name,
      avatar: ds.avatar,
      userType: ds.usertype || ds.userType,
      identitySource: ds.identitysource || ds.identitySource
    });
  },

  /**
   * 领先榜展开「加关注」：复用通讯录 contactFollowAction.followUser。
   * loading 防重复；失败保留按钮；成功后页级 map 同步所有可见位置。
   */
  onLeaderboardFollow(e) {
    if (!this.data.leaderboardFollowEnabled) return;
    const detail = (e && e.detail) || {};
    const pid = this._resolveLeaderboardFollowUserId({
      playerId: detail.playerId || detail.userId,
      userId: detail.userId || detail.playerId
    });
    if (!pid || this._isLeaderboardFollowSelf(pid)) return;
    if (!this.data.leaderboardFollowableMap || !this.data.leaderboardFollowableMap[pid]) return;
    const existed = (this.data.relationMap && this.data.relationMap[pid]) || 'none';
    if (existed === 'friend' || existed === 'following') return;
    if (!this._followInFlightMap) this._followInFlightMap = {};
    if (this._followInFlightMap[pid]) return;
    this._followInFlightMap[pid] = true;

    const followLoadingMap = Object.assign({}, this.data.followLoadingMap || {});
    followLoadingMap[pid] = true;
    this.setData({ followLoadingMap: followLoadingMap });

    const clearLoading = () => {
      this._followInFlightMap[pid] = false;
      const nextLoading = Object.assign({}, this.data.followLoadingMap || {});
      delete nextLoading[pid];
      this.setData({ followLoadingMap: nextLoading });
    };

    try {
      const player = detail.player || this._findLeaderboardPlayerByFollowId(pid) || {};
      const status = contactFollowAction.followUser({
        id: pid,
        playerId: pid,
        name: player.name,
        nickname: player.name || player.nickname,
        avatar: player.avatar,
        gender: player.gender,
        handicap: player.handicap,
        floatCoef: player.floatCoef
      });
      if (!status) {
        clearLoading();
        wx.showToast({ title: '关注失败', icon: 'none', duration: 900 });
        return;
      }
      const nextStatus = status === 'friend' ? 'friend' : 'following';
      const followMap = Object.assign({}, this.data.followMap || {});
      const relationMap = Object.assign({}, this.data.relationMap || {});
      const relationLabelMap = Object.assign({}, this.data.relationLabelMap || {});
      followMap[pid] = true;
      relationMap[pid] = nextStatus;
      relationLabelMap[pid] = this._relationLabelFromStatus(nextStatus);
      const nextLoading = Object.assign({}, this.data.followLoadingMap || {});
      delete nextLoading[pid];
      this._followInFlightMap[pid] = false;
      this.setData({
        followMap: followMap,
        relationMap: relationMap,
        relationLabelMap: relationLabelMap,
        followLoadingMap: nextLoading
      });
      wx.showToast({
        title: nextStatus === 'friend' ? '已成为好友' : '已关注',
        icon: 'none',
        duration: 900
      });
    } catch (err) {
      clearLoading();
      wx.showToast({ title: '关注失败', icon: 'none', duration: 900 });
    }
  },

  /**
   * 讨论区发言头像短按：discussion 上抛 playerAvatarTap → 同一中央弹窗。
   */
  onDiscussionAvatarTap(e) {
    const detail = (e && e.detail) || {};
    this.openPlayerActionModal({
      userId: detail.userId,
      avatar: detail.avatar,
      name: detail.name,
      index: detail.index,
      avatarRect: detail.avatarRect
    });
  },

  /**
   * 统一头像互动入口（主包轻量面板；打开不下载 reaction）。
   */
  openPlayerActionModal(targetUser) {
    const target = playerActionModal.buildPlayerActionTarget(targetUser, {
      resolveById: (userId) => this._resolvePlayerActionTarget(userId),
      resolveByName: (name) => this._resolvePlayerActionTargetByName(name)
    });
    if (!target) return;
    this.setData({
      playerActionSheetVisible: true,
      playerActionTarget: target
    });
  },

  _resolvePlayerActionTargetByName(name) {
    const key = String(name || '').trim();
    if (!key) return null;
    const chat = this.data.chat || [];
    for (let i = 0; i < chat.length; i++) {
      const m = chat[i];
      if (!m || m.type === 'system') continue;
      const n = String(m.name || '').trim();
      if (n && n === key) {
        const id = String(m.userId || m.playerId || '').trim();
        if (id) return this._resolvePlayerActionTarget(id);
      }
    }
    try {
      const friends = playerDirectory.FRIEND_LIST || [];
      for (let i = 0; i < friends.length; i++) {
        const f = friends[i];
        if (!f) continue;
        const n = String(f.name || f.remark || '').trim();
        if (n && n === key) {
          const id = String(f.playerId || f.userId || '').trim();
          if (id) return this._resolvePlayerActionTarget(id);
        }
      }
    } catch (e) {}
    return null;
  },

  _resolvePlayerActionTarget(playerId) {
    const key = playerId != null ? String(playerId).trim() : '';
    if (!key) return null;
    return playerActionModal.resolvePlayerActionTarget(key, {
      findMemberById: (id) => this._findDetailPlayerActionMember(id),
      findSourceById: (id) => this._findDetailPlayerActionSource(id)
    });
  },

  _findDetailPlayerActionMember(playerId) {
    const key = String(playerId || '').trim();
    if (!key) return null;
    if (playerActionModal.isSameUserIdentity(key, 'me')) {
      try {
        const profile = userProfileStore.loadProfile() || {};
        return {
          userId: 'me',
          playerId: 'me',
          name: profile.nickname || profile.displayName || '我',
          avatar: profile.avatar || '',
          gender: profile.gender,
          handicap: profile.handicap,
          floatCoef: profile.floatCoef
        };
      } catch (e) {
        return { userId: 'me', playerId: 'me', name: '我', avatar: '' };
      }
    }
    const chat = this.data.chat || [];
    for (let i = 0; i < chat.length; i++) {
      const m = chat[i];
      if (!m || m.type === 'system') continue;
      const mid = String(m.userId || m.playerId || '').trim();
      if (mid && playerActionModal.isSameUserIdentity(mid, key)) {
        return {
          userId: mid,
          playerId: mid,
          name: m.name,
          avatar: m.avatar,
          gender: m.gender,
          handicap: m.handicap,
          floatCoef: m.floatCoef
        };
      }
    }
    return null;
  },

  _findDetailPlayerActionSource(playerId) {
    const key = String(playerId || '').trim();
    if (!key) return null;
    try {
      const profile = playerDirectory.PROFILE_BY_ID
        ? playerDirectory.PROFILE_BY_ID[key]
        : null;
      if (profile) {
        return Object.assign({ playerId: key, userId: key }, profile);
      }
    } catch (e) {}
    try {
      const friends = playerDirectory.FRIEND_LIST || [];
      for (let i = 0; i < friends.length; i++) {
        const f = friends[i];
        if (!f) continue;
        const id = String(f.playerId || f.userId || '').trim();
        if (id && playerActionModal.isSameUserIdentity(id, key)) return f;
      }
    } catch (e) {}
    return null;
  },

  closePlayerActionSheet() {
    if (!this.data.playerActionSheetVisible && !this.data.playerActionTarget) {
      return;
    }
    this.setData({
      playerActionSheetVisible: false,
      playerActionTarget: null
    });
  },

  /** 关闭面板但不依赖异步；播放目标必须事先写入 pending 快照 */
  _dismissPlayerActionSheetAfterPending() {
    this.setData({
      playerActionSheetVisible: false,
      playerActionTarget: null
    });
  },

  onReactionOverlayCloseModal() {
    this.closePlayerActionSheet();
  },

  onPlayerActionProfileTap() {
    const target = this.data.playerActionTarget;
    const payload = {
      userId: target && (target.userId || target.playerId),
      playerId: target && (target.playerId || target.userId),
      publicName: target && (target.publicName || target.nickname || target.matchNickname),
      name: target && (target.publicName || target.nickname || target.name),
      nickname: target && (target.nickname || target.publicName),
      avatar: target && target.avatar,
      gender: target && target.gender,
      handicap: target && target.handicap,
      floatCoef: target && target.floatCoef,
      userType: target && target.userType,
      identitySource: target && target.identitySource
    };
    this.closePlayerActionSheet();
    this._openReservedPlayerProfile(payload);
  },

  _getReactionOverlay() {
    return this.selectComponent('#player-reaction-overlay');
  },

  _clearReactionOverlay() {
    try {
      const ov = this._getReactionOverlay();
      if (ov && typeof ov.clearAllReactions === 'function') ov.clearAllReactions();
    } catch (e) { /* ignore */ }
    this._clearDiscussionReactionDetach();
  },

  _getDetailReactionCtx() {
    return { matchId: this.data.matchId || '' };
  },

  _getReactionController() {
    const bridge = this._reactionBridge || _reactionHostBridge;
    return bridge && bridge.scoreReactionController
      ? bridge.scoreReactionController
      : null;
  },

  _warmReactionSoundsIfReady() {
    const bridge = this._reactionBridge || _reactionHostBridge;
    try {
      if (bridge && bridge.reactionSounds) {
        bridge.reactionSounds.warmReactionSounds();
      }
    } catch (e) {
      /* ignore */
    }
  },

  /** 播放链路只读 pending/active 快照；面板 target 关闭后已清空 */
  _getDiscussionReactionTarget() {
    if (this._pendingReactionPlay && this._pendingReactionPlay.target) {
      return this._pendingReactionPlay.target;
    }
    if (this._activeReactionTarget) return this._activeReactionTarget;
    if (this.data.playerActionTarget) return this.data.playerActionTarget;
    return null;
  },

  _clearActiveReactionTarget() {
    this._activeReactionTarget = null;
    this._activeReactionKey = '';
    this._activeReactionEventId = '';
  },

  /** 解析讨论区当前 reactionKey（事件优先，其次播放中/pending） */
  _resolveDiscussionReactionKey(reactionKeyHint) {
    const fromHint =
      reactionKeyHint != null ? String(reactionKeyHint).trim() : '';
    if (fromHint) return fromHint;
    const active =
      this._activeReactionKey != null
        ? String(this._activeReactionKey).trim()
        : '';
    if (active) return active;
    const pending =
      this._pendingReactionPlay && this._pendingReactionPlay.key != null
        ? String(this._pendingReactionPlay.key).trim()
        : '';
    return pending || '';
  },

  /**
   * 讨论区：按 reactionKey 能力决定是否隐藏被点击消息头像。
   * flower/beer 不隐藏并清残留；其余六种按 message index 隐藏。
   */
  _applyDiscussionDetachByTarget(target, messageIndexHint, reactionKeyHint) {
    const reactionKey = this._resolveDiscussionReactionKey(reactionKeyHint);
    if (!reactionPanelConfig.shouldDetachDiscussionReaction(reactionKey)) {
      // flower/beer 或未知 key：不写 detach，并清掉上一动画残留
      this._clearDiscussionReactionDetach();
      return;
    }
    const t = target || this._getDiscussionReactionTarget();
    let idx = messageIndexHint;
    if (idx == null || idx === '') {
      idx = t && t.index;
    }
    const n = Number(idx);
    if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
      console.warn('[reaction] discussion detach skipped: invalid messageIndex', idx);
      this._clearDiscussionReactionDetach();
      return;
    }
    const chat = this.data.chat || [];
    const msg = chat[n];
    const userId = String(
      (t && (t.userId || t.playerId)) ||
        (msg && (msg.userId || msg.playerId || (msg.self ? 'me' : ''))) ||
        ''
    ).trim();
    if (
      this.data.discussionReactionDetachedIndex === n &&
      this.data.discussionReactionDetachedUserId === userId
    ) {
      return;
    }
    console.log('[reaction] discussion detach →', reactionKey, 'index', n, userId);
    this.setData({
      discussionReactionDetachedIndex: n,
      discussionReactionDetachedUserId: userId
    });
  },

  _clearDiscussionReactionDetach() {
    if (
      this.data.discussionReactionDetachedIndex < 0 &&
      !this.data.discussionReactionDetachedUserId
    ) {
      return;
    }
    this.setData({
      discussionReactionDetachedIndex: -1,
      discussionReactionDetachedUserId: ''
    });
  },

  /** bind:seatdetach — overlay triggerEvent；是否隐藏由 shouldDetachDiscussionReaction 决定 */
  onReactionOverlaySeatDetach(e) {
    const detail = (e && e.detail) || {};
    const target = detail.target || this._getDiscussionReactionTarget();
    this._applyDiscussionDetachByTarget(
      target,
      detail.messageIndex,
      detail.reactionKey
    );
  },

  /** bind:seatrestore */
  onReactionOverlaySeatRestore() {
    this._clearDiscussionReactionDetach();
    this._clearActiveReactionTarget();
  },

  /**
   * bind:seatvisualstate — 仅在明确 restore 时清讨论区。
   * 若带 reactionAvatarDetached=true，走同一 key 能力判断（防 flower/beer 被旁路隐藏）。
   */
  onReactionOverlaySeatVisualState(e) {
    const partial = (e && e.detail) || {};
    if (!('reactionAvatarDetached' in partial)) return;
    if (!partial.reactionAvatarDetached) {
      this._clearDiscussionReactionDetach();
      return;
    }
    // 另一条事件路径写入 detach 时，仍按当前 reactionKey 能力判断
    this._applyDiscussionDetachByTarget(
      this._getDiscussionReactionTarget(),
      null,
      this._resolveDiscussionReactionKey('')
    );
  },

  _ensureReactionHost() {
    const ov = this._getReactionOverlay();
    if (!ov || typeof ov.setReactionHost !== 'function') return ov;
    const self = this;
    ov.setReactionHost({
      gameId: '',
      matchId: self.data.matchId || '',
      getReactionCtx() {
        return self._getDetailReactionCtx();
      },
      canOpenReaction() {
        return scoreReactionAccess.isScoreReactionEnabled(
          '',
          self._getDetailReactionCtx()
        );
      },
      queryAvatarRect(playerId, done) {
        self._queryDiscussionAvatarRect(playerId, done);
      },
      getCurrentUserId() {
        try {
          const user = gameStore.getCurrentUser() || {};
          const id = String(user.userId || user.id || '').trim();
          if (id) return id;
        } catch (e) { /* ignore */ }
        return 'me';
      },
      // 讨论区隐藏以 reactionKey 能力为准；host 回调仅作兼容兜底
      onSeatDetach(playerId, reactionKey) {
        self._applyDiscussionDetachByTarget(
          self._getDiscussionReactionTarget(),
          null,
          reactionKey
        );
      },
      onSeatRestore() {
        self._clearDiscussionReactionDetach();
      },
      onSeatVisualState(partial) {
        if (!partial || !('reactionAvatarDetached' in partial)) return;
        if (!partial.reactionAvatarDetached) {
          self._clearDiscussionReactionDetach();
          return;
        }
        self._applyDiscussionDetachByTarget(
          self._getDiscussionReactionTarget(),
          null,
          self._resolveDiscussionReactionKey('')
        );
      },
      appendFlowerSystemMessage(target) {
        self._appendDiscussionFlowerSystemMessage(target);
      },
      resolveActorName() {
        try {
          const user = gameStore.getCurrentUser() || {};
          const name = String(
            user.nickname || user.name || user.displayName || ''
          ).trim();
          return name || '我';
        } catch (e) {
          return '我';
        }
      }
    });
    return ov;
  },

  _queryDiscussionAvatarRect(playerId, done) {
    const cb = typeof done === 'function' ? done : function () {};
    const id = playerId != null ? String(playerId).trim() : '';
    const target = this._getDiscussionReactionTarget();
    const cached = playerActionModal.normalizePlayerActionAvatarRect(
      target && target.avatarRect
    );
    const finish = function (rect) {
      const norm = playerActionModal.normalizePlayerActionAvatarRect(rect);
      if (norm) {
        cb(norm);
        return;
      }
      let winW = 375;
      let winH = 667;
      try {
        const info = (wx.getWindowInfo && wx.getWindowInfo()) || wx.getSystemInfoSync();
        winW = (info && (info.windowWidth || info.screenWidth)) || 375;
        winH = (info && (info.windowHeight || info.screenHeight)) || 667;
      } catch (e) { /* ignore */ }
      const size = 40;
      cb({
        left: (winW - size) / 2,
        top: winH * 0.36,
        width: size,
        height: size
      });
    };
    if (cached) {
      finish(cached);
      return;
    }
    let disc = null;
    try {
      disc = this.selectComponent('#detail-discussion');
    } catch (e) {
      disc = null;
    }
    if (!disc) {
      finish(null);
      return;
    }
    // 优先按消息 index 取本次点击的头像实例，避免同用户多条消息串位
    const msgIndex =
      target && target.index != null && target.index !== ''
        ? Number(target.index)
        : NaN;
    if (Number.isFinite(msgIndex) && msgIndex >= 0) {
      wx.createSelectorQuery()
        .in(disc)
        .select('#ds-msg-avatar-' + msgIndex)
        .boundingClientRect(function (rect) {
          if (playerActionModal.normalizePlayerActionAvatarRect(rect)) {
            finish(rect);
            return;
          }
          finish(null);
        })
        .exec();
      return;
    }
    if (!id) {
      finish(null);
      return;
    }
    wx.createSelectorQuery()
      .in(disc)
      .selectAll('.ds-player-avatar')
      .fields(
        {
          dataset: true,
          rect: true,
          size: true
        },
        function (list) {
          const arr = list || [];
          let hit = null;
          for (let i = 0; i < arr.length; i++) {
            const item = arr[i];
            if (!item) continue;
            const ds = item.dataset || {};
            const uid = ds.userid != null ? String(ds.userid).trim() : '';
            if (
              uid &&
              (uid === id || playerActionModal.isSameUserIdentity(uid, id))
            ) {
              hit = item;
              break;
            }
          }
          finish(hit || null);
        }
      )
      .exec();
  },

  _appendDiscussionFlowerSystemMessage(target) {
    if (
      !scoreReactionAccess.isScoreReactionEnabled('', this._getDetailReactionCtx())
    ) {
      return;
    }
    const toName =
      (target && (target.name || target.displayName || target.nickname)) ||
      '球员';
    let fromName = '我';
    try {
      const user = gameStore.getCurrentUser() || {};
      fromName = String(
        user.nickname || user.name || user.displayName || ''
      ).trim() || '我';
    } catch (e) { /* ignore */ }
    const msg = {
      type: 'system',
      action: 'flower',
      text: fromName + ' 给 ' + String(toName).trim() + ' 送了一朵🌹',
      timestamp: Date.now()
    };
    const chat = (this.data.chat || []).concat(msg);
    this.setData({ chat: chat });
    try {
      const disc = this.selectComponent('#detail-discussion');
      if (disc && typeof disc.appendSystemMessage === 'function') {
        disc.appendSystemMessage(msg);
      }
    } catch (e) { /* ignore */ }
  },

  _isReactionOverlayReady(ov) {
    return !!(ov && typeof ov.playReaction === 'function');
  },

  _playPendingReaction() {
    const pending = this._pendingReactionPlay;
    if (!pending || !pending.key || !pending.target) return false;
    const ctrl = this._getReactionController();
    if (
      ctrl &&
      !ctrl.canPlayReaction('', pending.key, this._getDetailReactionCtx())
    ) {
      this._pendingReactionPlay = null;
      this.setData({ reactionPackLoading: false });
      this._clearDiscussionReactionDetach();
      return false;
    }
    const ov = this._ensureReactionHost();
    if (!this._isReactionOverlayReady(ov)) return false;
    const key = pending.key;
    const target = pending.target;
    this._activeReactionTarget = target;
    this._activeReactionKey = key;
    this._activeReactionEventId = pending.eventId || '';
    this._pendingReactionPlay = null;
    this._stopReactionOverlayWait();
    this.setData({ reactionPackLoading: false });
    const targetUserId = this._resolveReactionTargetUserId(target);
    ov.playReaction(key, target, null, {
      eventId: pending.eventId || '',
      targetUserId: targetUserId,
      sourceType: 'player_action',
      sourceId: this.data.matchId || this.data.gameId || ''
    });
    return true;
  },

  /** 从 active/pending target 快照取正式 userId（不用昵称/index） */
  _resolveReactionTargetUserId(target) {
    const t =
      target ||
      this._activeReactionTarget ||
      (this._pendingReactionPlay && this._pendingReactionPlay.target) ||
      null;
    if (!t || typeof t !== 'object') return '';
    const uid = t.userId != null ? String(t.userId).trim() : '';
    if (uid) return uid;
    const pid = t.playerId != null ? String(t.playerId).trim() : '';
    return pid || '';
  },

  _stopReactionOverlayWait() {
    if (this._reactionOverlayWaitTimer) {
      clearTimeout(this._reactionOverlayWaitTimer);
      this._reactionOverlayWaitTimer = null;
    }
  },

  /** 跨分包 placeholder 被真实组件替换后触发 */
  onReactionOverlayReady() {
    if (!this._pendingReactionPlay) return;
    if (!(this._reactionBridge || _reactionHostBridge)) return;
    this._warmReactionSoundsIfReady();
    this._playPendingReaction();
  },

  /**
   * overlay 确认动画真正开始后记账（主包 ledger）。
   * eventId/targetUserId 以宿主一次动作快照为准；coinValue 只认主包配置。
   */
  onReactionStart(e) {
    try {
      const d = (e && e.detail) || {};
      const pendingEventId =
        this._activeReactionEventId ||
        (d.eventId != null ? String(d.eventId).trim() : '');
      const targetUserId =
        this._resolveReactionTargetUserId(this._activeReactionTarget) ||
        (d.targetUserId != null ? String(d.targetUserId).trim() : '');
      const ledger = require('../../../../utils/reactionPopularityLedger.js');
      ledger.recordReactionPopularity({
        eventId: pendingEventId,
        reactionKey: d.reactionKey,
        targetUserId: targetUserId,
        sourceType: d.sourceType || 'player_action',
        sourceId: d.sourceId || this.data.matchId || this.data.gameId || '',
        senderUserId: socialRelationStore.resolveCurrentUserId()
      });
    } catch (err) {
      console.warn('[popularity] record failed', err && err.message);
    }
  },

  _tryFinishPendingReactionPlay(reason) {
    if (!this._pendingReactionPlay) return true;
    if (!(this._reactionBridge || _reactionHostBridge)) return false;
    const ov = this._getReactionOverlay();
    if (!this._isReactionOverlayReady(ov)) {
      if (reason) {
        console.warn(
          '[reaction] overlay not ready yet',
          reason,
          ov ? 'placeholder-or-partial' : 'null'
        );
      }
      return false;
    }
    this._warmReactionSoundsIfReady();
    return this._playPendingReaction();
  },

  _waitReactionOverlayAndPlay(maxMs) {
    const self = this;
    const deadline = Date.now() + (maxMs > 0 ? maxMs : 15000);
    this._stopReactionOverlayWait();

    const tick = function () {
      if (!self._pendingReactionPlay) {
        self._stopReactionOverlayWait();
        self.setData({ reactionPackLoading: false });
        return;
      }
      if (self._tryFinishPendingReactionPlay()) {
        return;
      }
      if (Date.now() >= deadline) {
        self._stopReactionOverlayWait();
        self.setData({ reactionPackLoading: false });
        self._pendingReactionPlay = null;
        self._clearActiveReactionTarget();
        self._clearDiscussionReactionDetach();
        console.warn('[reaction] overlay wait timeout (placeholder not replaced)');
        wx.showToast({ title: '动画加载失败', icon: 'none' });
        return;
      }
      self._reactionOverlayWaitTimer = setTimeout(tick, 80);
    };

    this._reactionOverlayWaitTimer = setTimeout(tick, 0);
  },

  _ensureReactionPackageAndPlay(key, targetSnapshot) {
    const self = this;
    const k = key != null ? String(key).trim() : '';
    const t = playerActionModal.snapshotPlayerActionTarget(targetSnapshot);
    if (!k || !t) {
      console.warn('[reaction] tap ignored: empty key/target snapshot');
      return;
    }

    const eventId =
      'rx_' +
      Date.now().toString(36) +
      '_' +
      Math.random().toString(36).slice(2, 10);
    this._pendingReactionPlay = { key: k, target: t, eventId: eventId };
    console.log(
      '[reaction] pending snapshot',
      k,
      t.userId || t.playerId,
      'index=',
      t.index
    );

    // 已就绪：直接播（面板已在入口关闭）
    if (_reactionHostBridge && this.data.reactionOverlayMounted) {
      this._reactionBridge = _reactionHostBridge;
      if (this._tryFinishPendingReactionPlay('cached')) return;
    }

    // 内部 loading 防重入（无用户可见提示）；仅更新 pending，复用同一 Promise
    if (this.data.reactionPackLoading) {
      return;
    }

    this.setData({ reactionPackLoading: true });

    // 并行：挂载跨分包组件（触发分包注入）+ require.async 桥
    if (!this.data.reactionOverlayMounted) {
      this.setData({ reactionOverlayMounted: true });
    }

    loadReactionHostBridge().then(function (bridge) {
      self._reactionBridge = bridge || null;
      if (!bridge) {
        self._stopReactionOverlayWait();
        self.setData({ reactionPackLoading: false });
        self._pendingReactionPlay = null;
        self._clearActiveReactionTarget();
        self._clearDiscussionReactionDetach();
        console.warn('[reaction] require.async rejected or empty export');
        wx.showToast({ title: '动画加载失败', icon: 'none' });
        return;
      }
      console.log('[reaction] host bridge ready');
      if (self._tryFinishPendingReactionPlay('bridge')) return;
      self._waitReactionOverlayAndPlay(15000);
    });
  },

  /**
   * 讨论区 reaction：
   * 校验 → pending 快照 → 立即关面板 → 再异步加载/播放（不关面板等分包）。
   */
  onPlayerActionReactionItemTap(e) {
    const fromDetail =
      e && e.detail && e.detail.key != null ? String(e.detail.key).trim() : '';
    const fromDataset =
      e &&
      e.currentTarget &&
      e.currentTarget.dataset &&
      e.currentTarget.dataset.key != null
        ? String(e.currentTarget.dataset.key).trim()
        : '';
    const key = fromDetail || fromDataset;
    if (!key) return;
    if (!reactionPanelConfig.getReactionMode(key)) {
      return;
    }
    if (
      !scoreReactionAccess.isScoreReactionEnabled('', this._getDetailReactionCtx())
    ) {
      console.warn('[reaction] gated by scoreReactionAccess', this._getDetailReactionCtx());
      return;
    }
    const snapshot = playerActionModal.snapshotPlayerActionTarget(
      this.data.playerActionTarget
    );
    if (!snapshot) {
      wx.showToast({ title: '无法识别目标', icon: 'none' });
      return;
    }
    // 校验通过：立刻关面板（不等 require.async / overlay / 开播）
    this._dismissPlayerActionSheetAfterPending();
    this._ensureReactionPackageAndPlay(key, snapshot);
  },

  /* ===== 更多功能面板 ===== */
  _getMoreFeatureDisabledState(match, feature) {
    return teamMatchMoreMenu.getMoreFeatureDisabledState(match, feature);
  },

  _withMoreFeatureDisabledState(list, match) {
    return teamMatchMoreMenu.withMoreFeatureDisabledState(list, match);
  },

  applyMoreAccess() {
    const match = this.data.matchId ? teamMatchStore.getMatchById(this.data.matchId) : null;
    const user = gameStore.getCurrentUser() || {};
    const menu = teamMatchMoreMenu.buildMoreMenuViewModel({
      match: match,
      user: user,
      options: { managedSeriesMode: false }
    });
    this.setData({
      featuresCommon: menu.featuresCommon,
      featuresPermission: menu.featuresPermission,
      featuresPermissionFooterPad: menu.featuresPermissionFooterPad,
      featuresPermissionFooter: menu.featuresPermissionFooter,
      lifecycleActions: menu.lifecycleActions,
      featuresSectionCommonMain: menu.featuresSectionCommonMain,
      featuresSectionCommonSub: menu.featuresSectionCommonSub,
      featuresSectionPermissionMain: menu.featuresSectionPermissionMain,
      featuresSectionPermissionSub: menu.featuresSectionPermissionSub
    });
  },

  openMoreSheet() {
    if (!this.data.moreFabExpanded) {
      this.setData({ moreFabExpanded: true });
      return;
    }
    this.applyMoreAccess();
    this.setData({ showMoreSheet: true });
  },
  closeMoreSheet() {
    this.setData({ showMoreSheet: false, moreFabExpanded: false });
  },

  onFeatureTap(e) {
    const permission = e.currentTarget.dataset.permission;
    const disabledAttr = e.currentTarget.dataset.disabled;
    const disabledFromUi =
      disabledAttr === true || disabledAttr === 'true' || disabledAttr === 1 || disabledAttr === '1';
    const matchId = this.data.matchId || '';
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    const user = gameStore.getCurrentUser() || {};
    if (
      disabledFromUi ||
      this._getMoreFeatureDisabledState(match, { permission: permission })
    ) {
      return;
    }
    // 动作层校验：不依赖仅隐藏按钮
    if (
      permission &&
      !matchManageAccess.isCommonViewPermission(permission) &&
      !matchManageAccess.hasMatchManagePermission(match, user, permission)
    ) {
      wx.showToast({ title: '暂无该管理权限', icon: 'none' });
      return;
    }
    if (permission === 'export_groups') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      wx.showToast({ title: '分组表导出功能开发中', icon: 'none' });
      return;
    }
    if (permission === 'cancel_match') {
      // 与普通球局 / game hub 一致：先关 M 面板，再确认取消
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      this._promptCancelMatch();
      return;
    }
    if (permission === 'edit_match') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      const matchId = this.data.matchId || '';
      if (!matchId) {
        wx.showToast({ title: '未找到比赛信息', icon: 'none' });
        return;
      }
      const stored = teamMatchStore.getMatchById(matchId);
      const matchType = String(
        (stored && stored.matchType) ||
          (this.data.match && this.data.match.matchType) ||
          this.data.matchType ||
          ''
      ).trim();
      const editPage =
        matchType === 'inter-team'
          ? '/subpackages/create/pages/team-inter/index'
          : '/subpackages/create/pages/team-internal/index';
      wx.navigateTo({
        url: editPage + '?mode=edit&matchId=' + encodeURIComponent(matchId),
        fail: () => wx.showToast({ title: '页面尚未注册', icon: 'none' })
      });
      return;
    }
    if (permission === 'edit_half') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false, halfSheetVisible: true });
      return;
    }
    if (permission === 'permission_management') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      this.openTempAdminSheet();
      return;
    }
    if (permission === 'manage_players' || permission === 'players') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      this.openPlayerManageSheet();
      return;
    }
    if (permission === 'manage_tee_sheet' || permission === 'tee_management') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      this.openTeeSheetManageSheet();
      return;
    }
    if (permission === 'edit_groups') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      this.onOpenGroupEditor();
      return;
    }
    if (permission === 'manage_payment' || permission === 'fees') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      this.openPaymentSheet();
      return;
    }
    if (permission === 'close_registration') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      this.toggleRegistrationStatus();
      return;
    }
    if (permission === 'start_match') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      this.startTournamentMatch();
      return;
    }
    if (permission === 'finish_match') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      this._promptFinishMatch();
      return;
    }
    // 替他人报名：报名中；球队赛家族 LIVE（与报名中同一套弹窗/写入；权限键仍为 register_for_other）
    if (permission === 'register_for_other') {
      const lifecycle = this._getMatchLifecycle(match);
      const allowProxyRegister =
        !!(lifecycle && lifecycle.isRegistering) ||
        !!(lifecycle && lifecycle.isOngoing && isTeamMatchFamily(match));
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      if (!allowProxyRegister) {
        wx.showToast({ title: '功能开发中', icon: 'none' });
        return;
      }
      const registerClosed =
        !(this.data.registerPermission && this.data.registerPermission.isOpen);
      if (registerClosed) {
        this._showRegistrationClosedModal();
        return;
      }
      this.openRegisterForOtherSheet();
      return;
    }
    if (this.data.matchStatus && this.data.matchStatus.isRegistering) {
      if (permission === 'invite_friends_register') {
        this.setData({ showMoreSheet: false, moreFabExpanded: false });
        this.shareTournamentInvite();
        return;
      }
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      const all = REGISTERING_FEATURES_COMMON.concat(REGISTERING_FEATURES_PERMISSION);
      const item = all.find((f) => f.permission === permission);
      wx.showToast({ title: item ? item.label : '功能开发中', icon: 'none' });
      return;
    }
    if (permission === 'theme') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      this.openStyleSheet();
      return;
    }
    if (permission === 'leaderboard') {
      this.openLeaderboardSettingSheet();
      return;
    }
    if (permission === 'stats') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      const matchId = this.data.matchId || '';
      wx.navigateTo({
        url:
          '/subpackages/tournament-tools/pages/stats/index' +
          (matchId ? '?matchId=' + encodeURIComponent(matchId) : ''),
        fail: () => wx.showToast({ title: '统计页面尚未注册', icon: 'none' })
      });
      return;
    }
    if (permission === 'feedback') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      const matchId = this.data.matchId || '';
      wx.navigateTo({
        url:
          '/pages/feedback/index?source=tournament' +
          (matchId ? '&matchId=' + encodeURIComponent(matchId) : ''),
        fail: () => wx.showToast({ title: '反馈页面尚未注册', icon: 'none' })
      });
      return;
    }
    if (permission === 'net_score') {
      this.setData({ showMoreSheet: false, moreFabExpanded: false });
      const matchId = this.data.matchId || '';
      if (!matchId) {
        wx.showToast({ title: '未找到比赛信息', icon: 'none' });
        return;
      }
      const match = this._resolveMatchData(matchId);
      if (match && match.peoriaResult && match.peoriaResult.status === 'generated') {
        wx.showToast({
          title: '净杆已生成，请点击“领先榜”按钮查看。',
          icon: 'none',
          duration: 2500
        });
        return;
      }
      wx.navigateTo({
        url: '/subpackages/tournament-tools/pages/peoria/index?matchId=' + encodeURIComponent(matchId),
        fail: () => wx.showToast({ title: '净杆配置页尚未注册', icon: 'none' })
      });
      return;
    }
    wx.showToast({ title: '功能开发中', icon: 'none' });
  },

  /**
   * 结束比赛（M 面板 finish_match）
   * 写入 match.status="finished" + finishedAt，不改 score/peoria 等。
   */
  _promptFinishMatch() {
    const matchId = this.data.matchId || '';
    if (
      !matchId ||
      demoJiaobeiMatch.isJiaobeiDemoMatchId(matchId) ||
      !teamMatchStore.getMatchById(matchId)
    ) {
      wx.showToast({ title: '当前为演示模式', icon: 'none' });
      return;
    }
    const match = teamMatchStore.getMatchById(matchId);
    if (!match) {
      wx.showToast({ title: '未找到比赛信息', icon: 'none' });
      return;
    }
    if (teamMatchFinish.isMatchCompleted(match)) {
      wx.showToast({ title: teamMatchFinish.MATCH_FINISHED_TOAST, icon: 'none' });
      return;
    }
    // 动作层：弹窗前校验，避免无权限仍出现确认框（真正写入仍由 _confirmFinishMatch 再检）
    if (
      !matchManageAccess.hasMatchManagePermission(
        match,
        gameStore.getCurrentUser(),
        'finish_match'
      )
    ) {
      wx.showToast({ title: '暂无该管理权限', icon: 'none' });
      return;
    }
    const finishModal = teamMatchFinish.getFinishMatchModalContent(match);
    wx.showModal({
      title: finishModal.title,
      content: finishModal.content,
      cancelText: '取消',
      confirmText: '确认',
      confirmColor: '#ce9224',
      success: (res) => {
        if (res.confirm) this._confirmFinishMatch();
      }
    });
  },

  _confirmFinishMatch() {
    const matchId = this.data.matchId || '';
    if (!matchId) return;
    const match = teamMatchStore.getMatchById(matchId);
    if (!match) {
      wx.showToast({ title: '未找到比赛信息', icon: 'none' });
      return;
    }
    if (
      !matchManageAccess.hasMatchManagePermission(
        match,
        gameStore.getCurrentUser(),
        'finish_match'
      )
    ) {
      wx.showToast({ title: '暂无该管理权限', icon: 'none' });
      return;
    }
    const confirmed = teamMatchFinish.confirmFinishWholeTeamMatch(match);
    if (!confirmed.ok) {
      wx.showToast({
        title: confirmed.message || teamMatchFinish.MATCH_FINISHED_TOAST,
        icon: 'none'
      });
      return;
    }
    const saved = teamMatchFinish.saveMatchIfWritable(match);
    if (!saved.ok) {
      wx.showToast({
        title: saved.message || teamMatchFinish.MATCH_FINISHED_TOAST,
        icon: 'none'
      });
      return;
    }
    try {
      seriesFinalize.maybeFinalizeAfterStationPersisted(match, {
        actor: gameStore.getCurrentUser() || {}
      });
    } catch (eFin) {
      /* ignore */
    }
    this.refreshMatchData(matchId);
    this.applyMoreAccess();
    wx.showToast({ title: '比赛已结束', icon: 'success' });
  },

  /**
   * 取消比赛确认框（文案 / 按钮与普通球局 score、game/hub 一致）
   */
  _promptCancelMatch() {
    const matchId = this.data.matchId || '';
    if (
      !matchId ||
      demoJiaobeiMatch.isJiaobeiDemoMatchId(matchId) ||
      !teamMatchStore.getMatchById(matchId)
    ) {
      wx.showToast({ title: '当前为演示模式', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '取消比赛',
      content: '取消比赛将删除本场GAME所有数据，是否确认？',
      cancelText: '取消',
      confirmText: '确认',
      confirmColor: '#dc2626',
      success: (res) => {
        if (res.confirm) this._confirmCancelMatch();
      }
    });
  },

  /**
   * 确认取消：硬删除球队赛（对齐普通球局 purgeGameCompletely），toast 后回首页「我的」
   */
  _confirmCancelMatch() {
    const matchId = this.data.matchId;
    if (!matchId) return;
    // 先清该赛事全部报名日程，再硬删比赛实体（顺序不可颠倒）
    this.deleteTeamMatchSchedules(matchId);
    const removed = gameLifecycle.purgeTeamMatchCompletely(matchId);
    if (!removed) {
      wx.showToast({ title: '比赛不存在或已删除', icon: 'none' });
      return;
    }
    this.setData({
      matchId: '',
      showMoreSheet: false,
      moreFabExpanded: false
    });
    wx.showToast({ title: '比赛已取消', icon: 'success', duration: 1500 });
    setTimeout(() => {
      wx.reLaunch({ url: '/pages/home/index?tab=my' });
    }, 300);
  },

  /* ===== 本场临时管理员（权限管理 · 共享组件） ===== */
  openTempAdminSheet() {
    const matchId = this.data.matchId || '';
    if (!matchId || demoJiaobeiMatch.isJiaobeiDemoMatchId(matchId)) {
      wx.showToast({ title: '当前为演示模式', icon: 'none' });
      return;
    }
    const match = teamMatchStore.getMatchById(matchId);
    if (!match) {
      wx.showToast({ title: '赛事数据缺失', icon: 'none' });
      return;
    }
    // 入口仍用 canManageTempAdmins；组件打开时会再次核验
    if (!matchManageAccess.canManageTempAdmins(match, gameStore.getCurrentUser())) {
      wx.showToast({ title: '暂无权限管理权限', icon: 'none' });
      return;
    }
    this.setData({ tempAdminSheetVisible: true });
  },

  onTempAdminPermissionSheetClose() {
    this.setData({ tempAdminSheetVisible: false });
  },

  onTempAdminPermissionSheetSaved() {
    this.setData({ tempAdminSheetVisible: false });
  },

  /* ===== 选手管理（共享组件 match-player-management-sheet） ===== */
  _canOpenPlayerManage(match) {
    const user = gameStore.getCurrentUser() || {};
    const access = resolveMoreAccessForMatch(match);
    return playerManage.canManagePlayers(
      match,
      user.userId,
      !!(access && access.isPrivilegedUser)
    );
  },

  openPlayerManageSheet() {
    const matchId = this.data.matchId || '';
    if (!matchId || demoJiaobeiMatch.isJiaobeiDemoMatchId(matchId)) {
      wx.showToast({ title: '当前为演示模式', icon: 'none' });
      return;
    }
    const match = teamMatchStore.getMatchById(matchId);
    if (!match) {
      wx.showToast({ title: '赛事数据缺失', icon: 'none' });
      return;
    }
    if (!this._canOpenPlayerManage(match)) {
      wx.showToast({ title: '暂无选手管理权限', icon: 'none' });
      return;
    }
    this.setData({ playerManageSheetVisible: true });
  },

  onPlayerManageSheetClose() {
    this.setData({ playerManageSheetVisible: false });
  },

  onPlayerManageSheetSaved(e) {
    const matchId =
      (e && e.detail && e.detail.matchId) || this.data.matchId || '';
    this.setData({ playerManageSheetVisible: false });
    if (matchId) {
      this.loadMatch(matchId);
      this._refreshFormalGroupsDisplay();
    }
  },

  /* ===== 收费管理（极简实收登记） ===== */
  /* ===== 收费管理（共享组件 match-payment-management-sheet） ===== */
  _canOpenPaymentSheet(match) {
    const user = gameStore.getCurrentUser() || {};
    const access = resolveMoreAccessForMatch(match);
    return paymentManage.canManagePayment(
      match,
      user.userId,
      !!(access && access.isPrivilegedUser)
    );
  },

  openPaymentSheet() {
    const matchId = this.data.matchId || '';
    if (!matchId || demoJiaobeiMatch.isJiaobeiDemoMatchId(matchId)) {
      wx.showToast({ title: '当前为演示模式', icon: 'none' });
      return;
    }
    const match = teamMatchStore.getMatchById(matchId);
    if (!match) {
      wx.showToast({ title: '赛事数据缺失', icon: 'none' });
      return;
    }
    if (!this._canOpenPaymentSheet(match)) {
      wx.showToast({ title: '暂无收费管理权限', icon: 'none' });
      return;
    }
    this.setData({ showPaymentSheet: true });
  },

  onPaymentSheetClose() {
    this.setData({ showPaymentSheet: false });
  },

  /** 即时保存后同步报名展示上的 paymentConfirmed（不回滚） */
  onPaymentSheetChanged(e) {
    const matchId =
      (e && e.detail && e.detail.matchId) || this.data.matchId || '';
    const userId = e && e.detail ? String(e.detail.userId || '') : '';
    const paymentConfirmed = !!(e && e.detail && e.detail.paymentConfirmed);
    if (!matchId || !userId) return;
    const match = teamMatchStore.getMatchById(matchId);
    if (!match) return;

    const findIdx = (users) => {
      const targetId = String(userId || '');
      return (Array.isArray(users) ? users : []).findIndex((user, index) => {
        const stableId = paymentManage.resolveStableUserId(
          user,
          'payment-user-' + (index + 1)
        );
        return (
          String(stableId || '') === targetId ||
          String((user && user.stableUserId) || '') === targetId ||
          String((user && user.userId) || '') === targetId ||
          String((user && user.id) || '') === targetId
        );
      });
    };

    const registerInfo =
      this.data.registerInfo && typeof this.data.registerInfo === 'object'
        ? this.data.registerInfo
        : null;
    const registerUsersForDisplay =
      registerInfo && Array.isArray(registerInfo.users) ? registerInfo.users : [];
    const registerInfoIndex = findIdx(registerUsersForDisplay);
    const nextRegisterInfo =
      registerInfo && registerInfoIndex >= 0
        ? Object.assign({}, registerInfo, {
            users: registerUsersForDisplay.map((user, index) =>
              index === registerInfoIndex
                ? Object.assign({}, user, { paymentConfirmed: paymentConfirmed })
                : user
            )
          })
        : registerInfo;

    const displayRegisterUsers = Array.isArray(this.data.registerDisplayUsers)
      ? this.data.registerDisplayUsers
      : [];
    const registerDisplayIndex = findIdx(displayRegisterUsers);
    const nextRegisterDisplayUsers =
      registerDisplayIndex >= 0
        ? displayRegisterUsers.map((user, index) =>
            index === registerDisplayIndex
              ? Object.assign({}, user, { paymentConfirmed: paymentConfirmed })
              : user
          )
        : displayRegisterUsers;

    this.setData({
      registerInfo: nextRegisterInfo,
      registerDisplayUsers: nextRegisterDisplayUsers
    });
  },

  /* ===== 出发管理（共享组件 match-tee-management-sheet） ===== */
  _canOpenTeeSheetManage(match) {
    const user = gameStore.getCurrentUser() || {};
    const access = resolveMoreAccessForMatch(match);
    return teeSheetManage.canManageTeeSheet(
      match,
      user.userId,
      !!(access && access.isPrivilegedUser)
    );
  },

  openTeeSheetManageSheet() {
    const matchId = this.data.matchId || '';
    if (!matchId || demoJiaobeiMatch.isJiaobeiDemoMatchId(matchId)) {
      wx.showToast({ title: '当前为演示模式', icon: 'none' });
      return;
    }
    const match = teamMatchStore.getMatchById(matchId);
    if (!match) {
      wx.showToast({ title: '赛事数据缺失', icon: 'none' });
      return;
    }
    if (!this._canOpenTeeSheetManage(match)) {
      wx.showToast({ title: '暂无出发管理权限', icon: 'none' });
      return;
    }
    this.setData({ teeSheetManageSheetVisible: true });
  },

  onTeeSheetManageSheetClose() {
    this.setData({ teeSheetManageSheetVisible: false });
  },

  onTeeSheetManageSheetSaved(e) {
    const matchId =
      (e && e.detail && e.detail.matchId) || this.data.matchId || '';
    this.setData({ teeSheetManageSheetVisible: false });
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    this._refreshTeeSheetDisplayFromMatch(match);
  },

  /** 出发管理保存后：同步 groupsTabCards / teeGroups */
  _refreshTeeSheetDisplayFromMatch(match) {
    if (!match) {
      this.refreshMatchData(this.data.matchId);
      this.refreshGroupsDerived();
      return;
    }
    const playerLookup = this._buildGroupPlayerLookup(match);
    let teeGroups = Array.isArray(match.groups) && match.groups.length
      ? this._mergeTeeSheetPlayerTeeInfo(
          match,
          teeSheetManage.buildTeeSheetTabView(match, {
            playerLookup: playerLookup,
            source: 'match'
          }),
          playerLookup
        )
      : [];
    teeGroups = this._applyMatchPlayStartHoleToTeeGroups(match, teeGroups);
    teeGroups = this._applyLiveHoleStatusBadgeToTeeGroups(match, teeGroups);
    this.setData(
      Object.assign(this._buildGroupsTabStatePatch(match), {
        teeGroups: teeGroups
      })
    );
  },

  openRegisterForOtherSheet() {
    if (!(this.data.registerPermission && this.data.registerPermission.isOpen)) {
      this._showRegistrationClosedModal();
      return;
    }
    this.setData({
      registerForOtherSourceOptions: this._buildRegisterForOtherSourceOptions(),
      registerForOtherSheetVisible: true
    });
  },

  closeRegisterForOtherSheet() {
    this.setData({ registerForOtherSheetVisible: false });
  },

  /** Patch 7：球队成员渠道按管理员 / 参赛球队成员解禁 */
  _buildRegisterForOtherSourceOptions() {
    const match = this.data.matchId ? teamMatchStore.getMatchById(this.data.matchId) : null;
    const canTeamMembers = resolveCanUseTeamMembersChannel(match);
    return REGISTER_FOR_OTHER_SOURCE_OPTIONS.map((opt) => {
      if (opt.key === 'team_members') {
        return Object.assign({}, opt, {
          disabled: !canTeamMembers,
          locked: !canTeamMembers
        });
      }
      return Object.assign({}, opt, { disabled: false, locked: false });
    });
  },

  onRegisterForOtherSourceSelect(e) {
    const key = e.detail && e.detail.key;
    this.setData({ registerForOtherSheetVisible: false });
    if (key === 'friends') {
      this._openRegisterForOtherFriendsPicker();
      return;
    }
    if (key === 'manual') {
      this.openRegisterForOtherManualSheet();
      return;
    }
    if (key === 'team_members') {
      const match = this.data.matchId ? teamMatchStore.getMatchById(this.data.matchId) : null;
      if (!resolveCanUseTeamMembersChannel(match)) {
        wx.showToast({ title: REGISTER_FOR_OTHER_TEAM_MEMBERS_DENIED_TOAST, icon: 'none' });
        return;
      }
      this._openRegisterForOtherTeamMembersPicker();
    }
  },

  onRegisterForOtherSourceDenied(e) {
    const key = e.detail && e.detail.key;
    if (key === 'team_members') {
      wx.showToast({ title: REGISTER_FOR_OTHER_TEAM_MEMBERS_DENIED_TOAST, icon: 'none' });
    }
  },

  /**
   * 好友选择（proxy_register）：
   * - URL 传 mode + matchId + operatorUserId
   * - EventChannel 传 registerUsers（当前赛事报名名单）
   * - 返回 addedPlayers / removedPlayers
   * - Patch 5A/5B/5C：生成 commit plan → 分队确认后统一写盘
   */
  _openRegisterForOtherFriendsPicker() {
    const matchId = this.data.matchId || '';
    const operator = gameStore.getCurrentUser() || {};
    const operatorUserId = String(operator.userId || '');
    const registerUsers = ((this.data.registerInfo && this.data.registerInfo.users) || []).slice();
    const url =
      '/subpackages/player/pages/friends/index?mode=' +
      encodeURIComponent('proxy_register') +
      '&matchId=' +
      encodeURIComponent(matchId) +
      '&operatorUserId=' +
      encodeURIComponent(operatorUserId) +
      '&slotId=' +
      encodeURIComponent('register-for-other');
    wx.navigateTo({
      url: url,
      success: (res) => {
        try {
          if (res && res.eventChannel && res.eventChannel.emit) {
            res.eventChannel.emit('proxyRegisterContext', {
              registerUsers: registerUsers,
              operatorUserId: operatorUserId,
              matchId: matchId
            });
          }
        } catch (e) {
          /* ignore */
        }
      },
      events: {
        friendsSelected: (payload) => {
          this._onProxyFriendsSelected(payload || {});
        }
      },
      fail: (err) =>
        wx.showToast({
          title: '跳转失败：' + (err && err.errMsg ? err.errMsg : ''),
          icon: 'none'
        })
    });
  },

  /**
   * 队际赛参赛侧 → 成员来源选项（sourceTeamId=俱乐部通讯录；id=报名侧 groupId）。
   * 二者不得混用：来源只筛成员，报名归属另选。
   */
  _resolveProxyMemberSourceOptions() {
    const match = this.data.matchId ? teamMatchStore.getMatchById(this.data.matchId) : null;
    const groups = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
    const out = [];
    const seen = {};
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      if (!g) continue;
      const groupId = g.id != null ? String(g.id).trim() : '';
      const sourceTeamId =
        g.sourceTeamId != null ? String(g.sourceTeamId).trim() : '';
      if (!groupId || !sourceTeamId || seen[sourceTeamId]) continue;
      seen[sourceTeamId] = true;
      const name =
        String(g.name || g.sourceTeamName || g.sourceTeamShortName || '').trim() ||
        '未命名球队';
      out.push({
        id: groupId,
        name: name,
        logo: String(g.sourceTeamLogo || '').trim() || DEFAULT_ORG_LOGO,
        sourceTeamId: sourceTeamId
      });
    }
    return out;
  },

  _clearProxyMemberSourceState() {
    this._proxyMemberSourceGroupId = '';
    this._proxyMemberSourceTeamId = '';
    this._proxyMemberSourceTeamName = '';
    this.setData({
      proxyMemberSourceDisplayName: '',
      proxyMemberSourceSheetVisible: false,
      proxyMemberSourceOptions: [],
      proxyMemberSourceGroupId: ''
    });
  },

  /** 队际赛：先选成员来源球队，再进成员列表 */
  _openProxyMemberSourceSheet() {
    const options = this._resolveProxyMemberSourceOptions();
    if (!options.length) {
      wx.showToast({ title: '暂无参赛球队成员可选', icon: 'none' });
      return;
    }
    if (options.length === 1) {
      this._confirmProxyMemberSourceAndOpenPicker(options[0]);
      return;
    }
    this.setData({
      proxyMemberSourceSheetVisible: true,
      proxyMemberSourceOptions: options,
      proxyMemberSourceGroupId: ''
    });
  },

  selectProxyMemberSource(e) {
    const id =
      e && e.currentTarget && e.currentTarget.dataset
        ? String(e.currentTarget.dataset.id || '')
        : '';
    if (!id) return;
    this.setData({ proxyMemberSourceGroupId: id });
  },

  cancelProxyMemberSourceSheet() {
    this._clearProxyMemberSourceState();
  },

  confirmProxyMemberSourceSheet() {
    const groupId = String(this.data.proxyMemberSourceGroupId || '');
    const options = this.data.proxyMemberSourceOptions || [];
    const opt = options.find((g) => String(g.id) === groupId);
    if (!opt || !opt.sourceTeamId) {
      wx.showToast({ title: '请选择成员来源球队', icon: 'none' });
      return;
    }
    this.setData({ proxyMemberSourceSheetVisible: false });
    this._confirmProxyMemberSourceAndOpenPicker(opt);
  },

  _confirmProxyMemberSourceAndOpenPicker(opt) {
    const source = opt || {};
    const sourceTeamId = String(source.sourceTeamId || '').trim();
    const groupId = source.id != null ? String(source.id).trim() : '';
    const name = String(source.name || '').trim();
    if (!sourceTeamId || !groupId) {
      wx.showToast({ title: '成员来源球队无效', icon: 'none' });
      return;
    }
    // 切换来源：清旧选择（新开选人页）；报名默认重置为该来源侧
    this._proxyMemberSourceGroupId = groupId;
    this._proxyMemberSourceTeamId = sourceTeamId;
    this._proxyMemberSourceTeamName = name;
    this.setData({
      proxyMemberSourceDisplayName: name,
      proxyMemberSourceGroupId: groupId
    });
    this._navigateProxyTeamMembersPicker(sourceTeamId, name);
  },

  /**
   * 球队成员选择（proxy_register_team）
   * - 队际赛：teamId = 所选参赛球队 sourceTeamId（成员来源，非报名归属）
   * - 队内赛：teamId = match.teamId
   */
  _openRegisterForOtherTeamMembersPicker() {
    const matchId = this.data.matchId || '';
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    if (!match) {
      wx.showToast({ title: '赛事数据缺失', icon: 'none' });
      return;
    }
    if (isInterTeamMatch(match)) {
      this._openProxyMemberSourceSheet();
      return;
    }
    const teamId = match.teamId ? String(match.teamId).trim() : '';
    if (!teamId) {
      wx.showToast({ title: '本赛事未关联球队', icon: 'none' });
      return;
    }
    this._clearProxyMemberSourceState();
    this._navigateProxyTeamMembersPicker(teamId, '');
  },

  _navigateProxyTeamMembersPicker(teamId, sourceTeamName) {
    const matchId = this.data.matchId || '';
    const tid = String(teamId || '').trim();
    if (!tid) {
      wx.showToast({ title: '本赛事未关联球队', icon: 'none' });
      return;
    }
    const operator = gameStore.getCurrentUser() || {};
    const operatorUserId = String(operator.userId || '');
    const registerUsers = ((this.data.registerInfo && this.data.registerInfo.users) || []).slice();
    const sourceName = String(sourceTeamName || '').trim();
    const url =
      '/subpackages/player/pages/friends/index?mode=' +
      encodeURIComponent('proxy_register_team') +
      '&matchId=' +
      encodeURIComponent(matchId) +
      '&operatorUserId=' +
      encodeURIComponent(operatorUserId) +
      '&teamId=' +
      encodeURIComponent(tid) +
      (sourceName
        ? '&sourceTeamName=' + encodeURIComponent(sourceName)
        : '') +
      '&slotId=' +
      encodeURIComponent('register-for-other-team');
    wx.navigateTo({
      url: url,
      success: (res) => {
        try {
          if (res && res.eventChannel && res.eventChannel.emit) {
            res.eventChannel.emit('proxyRegisterContext', {
              registerUsers: registerUsers,
              operatorUserId: operatorUserId,
              matchId: matchId,
              teamId: tid,
              sourceTeamName: sourceName
            });
          }
        } catch (e) {
          /* ignore */
        }
      },
      events: {
        friendsSelected: (payload) => {
          this._onProxyFriendsSelected(payload || {});
        }
      },
      fail: (err) =>
        wx.showToast({
          title: '跳转失败：' + (err && err.errMsg ? err.errMsg : ''),
          icon: 'none'
        })
    });
  },

  /**
   * Patch 5A/5B/5C/7：处理好友/球队成员页差异返回。
   * - removedPlayers → remove plan
   * - addedPlayers → 打开「选择代表分队」；确定后生成 add plan 并统一写盘
   * - 仅取消（无新增）→ _promptOrApplyProxyCommitPlan（已有出发安排则先确认）
   */
  _onProxyFriendsSelected(payload) {
    const data = payload || {};
    const matchId = this.data.matchId || '';
    const addedPlayers = Array.isArray(data.addedPlayers) ? data.addedPlayers : [];
    const removedPlayers = Array.isArray(data.removedPlayers) ? data.removedPlayers : [];
    const mode = data.mode === 'proxy_register_team' ? 'proxy_register_team' : 'proxy_register';
    const pickChannel = mode === 'proxy_register_team' ? 'team_members' : 'friends';

    detailDebugLog('[register-for-other] friends diff', {
      matchId: matchId,
      mode: mode,
      addedPlayers: addedPlayers,
      removedPlayers: removedPlayers
    });

    const removePlan = this._buildProxyRemovePlan(removedPlayers);
    detailDebugLog('[register-for-other] remove plan', removePlan);

    this._proxyCommitPlan = {
      matchId: matchId,
      mode: mode,
      pickChannel: pickChannel,
      removes: removePlan.removable,
      skippedRemoves: removePlan.skipped,
      pendingAdds: addedPlayers.slice(),
      adds: [],
      skippedAdds: [],
      group: null,
      applied: false,
      saved: false
    };
    detailDebugLog('[register-for-other] unified commit plan (pending)', this._proxyCommitPlan);

    // 有新增：先进分队弹窗，确定后再补全 adds 并写盘
    if (addedPlayers.length > 0) {
      this._openProxyGroupSheet(addedPlayers, pickChannel);
      return;
    }

    // 仅取消 / 无变更：若取消对象已有出发安排则先确认，再统一提交
    this._promptOrApplyProxyCommitPlan();
  },

  /**
   * 代报名写盘前：若待取消的 targetUserId 已在正式 groups 中，先弹二次确认。
   * 判断对象是被取消的好友/队员，不是当前登录用户。
   */
  _promptOrApplyProxyCommitPlan() {
    const plan = this._proxyCommitPlan;
    if (!plan) {
      this._clearProxyRegistrationTempState();
      wx.showToast({ title: '没有可更新的报名', icon: 'none' });
      return;
    }
    const removes = Array.isArray(plan.removes) ? plan.removes : [];
    if (!removes.length) {
      this._applyProxyCommitPlan();
      return;
    }
    const match = teamMatchStore.getMatchById(plan.matchId || this.data.matchId || '');
    const hasGroupedTarget = removes.some((item) => {
      const uid = String((item && item.userId) || '').trim();
      return !!(uid && match && teamMatchStore.isUserInFormalGroups(match, uid));
    });
    if (!hasGroupedTarget) {
      this._applyProxyCommitPlan();
      return;
    }
    this._pendingProxyCommitAfterConfirm = true;
    this.setData(this._buildSelfCancelDialogPatch(true));
  },

  /**
   * 仅允许取消「当前用户代报名」记录：
   * source === 'proxy' && registeredBy === operatorUserId && userId 匹配
   * 禁止：self / 他人代报 / admin / 旧数据 self
   * @returns {{ removable: Array, skipped: Array }}
   */
  _buildProxyRemovePlan(removedPlayers) {
    const operator = gameStore.getCurrentUser() || {};
    const operatorUserId = String(operator.userId || '');
    const users = ((this.data.registerInfo && this.data.registerInfo.users) || []).slice();
    const byId = {};
    users.forEach((u) => {
      const id = u && u.userId != null ? String(u.userId) : '';
      if (id) byId[id] = u;
    });

    const list = Array.isArray(removedPlayers) ? removedPlayers : [];
    const removable = [];
    const skipped = [];

    list.forEach((player) => {
      const userId = String((player && (player.userId || player.playerId)) || '').trim();
      if (!userId) {
        skipped.push({
          player: player,
          reason: 'missing_userId'
        });
        return;
      }
      const registration = byId[userId];
      if (!registration) {
        skipped.push({
          userId: userId,
          player: player,
          reason: 'not_registered'
        });
        return;
      }
      const source = String(registration.source || 'self');
      const registeredBy = String(registration.registeredBy || '');
      const canRemove =
        source === 'proxy' &&
        !!operatorUserId &&
        registeredBy === operatorUserId &&
        String(registration.userId) === userId;

      if (!canRemove) {
        skipped.push({
          userId: userId,
          player: player,
          registration: {
            source: source,
            registeredBy: registeredBy,
            subjectType: registration.subjectType || ''
          },
          reason:
            source !== 'proxy'
              ? 'not_proxy'
              : registeredBy !== operatorUserId
                ? 'not_registered_by_me'
                : 'forbidden'
        });
        return;
      }

      removable.push({
        action: 'remove',
        userId: userId,
        competitionName: registration.competitionName || '',
        groupId: registration.groupId != null ? String(registration.groupId) : '',
        groupName: registration.groupName || '',
        source: 'proxy',
        registeredBy: registeredBy,
        registeredByName: registration.registeredByName || '',
        subjectType: registration.subjectType || 'other',
        pickChannel: registration.pickChannel || 'friends',
        player: player
      });
    });

    return {
      matchId: this.data.matchId || '',
      operatorUserId: operatorUserId,
      removable: removable,
      skipped: skipped,
      removableCount: removable.length,
      skippedCount: skipped.length
    };
  },

  /**
   * Patch 5B/6：根据 pendingProxyPlayers + 代表分队生成 add plan（不写盘）
   * 去重：
   * - 缺 userId → skippedAdds reason=missing_userId
   * - userId 已报名 → already_registered
   * - manual 且手机号非空且 phone 已存在 → already_registered_phone
   * @returns {{ adds: Array, skippedAdds: Array, group: {id,name} }}
   */
  _buildProxyAddPlan(players, group) {
    const operator = gameStore.getCurrentUser() || {};
    const registeredBy = String(operator.userId || '');
    let registeredByName = (operator.name && String(operator.name).trim()) || '';
    if (!registeredByName) {
      try {
        const profile = userProfileStore.loadProfile() || {};
        registeredByName =
          (profile.competitionName && String(profile.competitionName).trim()) ||
          (profile.nickname && String(profile.nickname).trim()) ||
          '';
      } catch (e) {
        registeredByName = '';
      }
    }

    const users = ((this.data.registerInfo && this.data.registerInfo.users) || []).slice();
    const existingIds = {};
    const existingPhones = {};
    users.forEach((u) => {
      const id = u && u.userId != null ? String(u.userId) : '';
      if (id) existingIds[id] = true;
      const phone = u && u.phone != null ? String(u.phone).trim() : '';
      if (phone) existingPhones[phone] = true;
    });

    const groupId = group && group.id != null ? String(group.id) : '';
    const groupName = group && group.name ? String(group.name) : '';
    const list = Array.isArray(players) ? players : [];
    const adds = [];
    const skippedAdds = [];
    const registeredAt = Date.now();
    const channelHint = String(this._proxyPickChannel || '').trim();

    list.forEach((player) => {
      const p = player || {};
      const pickChannelRaw = String(p.pickChannel || channelHint || 'friends').trim();
      const pickChannel =
        pickChannelRaw === 'manual'
          ? 'manual'
          : pickChannelRaw === 'team_members'
            ? 'team_members'
            : 'friends';
      const userId = String(p.userId || p.playerId || '').trim();
      if (!userId) {
        skippedAdds.push({
          player: player,
          reason: 'missing_userId'
        });
        return;
      }
      if (existingIds[userId]) {
        skippedAdds.push({
          userId: userId,
          player: player,
          reason: 'already_registered'
        });
        return;
      }
      const phone = p.phone != null ? String(p.phone).trim() : '';
      // Patch 6：手工添加按 phone 去重（仅 manual + 非空手机号）
      if (pickChannel === 'manual' && phone && existingPhones[phone]) {
        skippedAdds.push({
          userId: userId,
          phone: phone,
          player: player,
          reason: 'already_registered_phone'
        });
        return;
      }
      const competitionName = String(
        p.competitionName || p.name || p.realName || ''
      ).trim();
      // Patch 6：手工字段；好友路径保持空串，不改写好友语义
      let userType =
        p.userType != null && String(p.userType).trim() !== ''
          ? String(p.userType).trim()
          : 'registered';
      let realName = '';
      let remarkName = '';
      if (pickChannel === 'manual') {
        userType =
          p.userType != null && String(p.userType).trim() !== ''
            ? String(p.userType).trim()
            : phone
              ? 'phone'
              : 'guest';
        realName = String(
          p.realName != null && String(p.realName).trim() !== ''
            ? p.realName
            : competitionName
        ).trim();
        remarkName = p.remarkName != null ? String(p.remarkName) : '';
      }
      adds.push({
        action: 'add',
        userId: userId,
        userType: userType,
        identitySource:
          p.identitySource != null && String(p.identitySource).trim() !== ''
            ? String(p.identitySource).trim()
            : pickChannel === 'manual'
              ? phone
                ? 'manual_add'
                : 'derived'
              : 'proxy_add',
        nickname: p.nickname != null ? String(p.nickname) : '',
        competitionName: competitionName,
        matchNickname: p.matchNickname != null ? String(p.matchNickname) : competitionName,
        gender: p.gender != null ? String(p.gender) : '',
        avatar: p.avatar != null ? String(p.avatar) : '',
        phone: phone,
        groupId: groupId,
        groupName: groupName,
        matchTeamId: groupId,
        matchTeamName: groupName,
        registeredAt: registeredAt,
        source: 'proxy',
        registeredBy: registeredBy,
        registeredByName: registeredByName,
        subjectType: 'other',
        pickChannel: pickChannel,
        canSelfCancel: true,
        locked: false,
        realName: realName,
        remarkName: remarkName,
        player: player
      });
      // 同批内去重
      existingIds[userId] = true;
      if (pickChannel === 'manual' && phone) existingPhones[phone] = true;
    });

    return {
      adds: adds,
      skippedAdds: skippedAdds,
      group: { id: groupId, name: groupName },
      addCount: adds.length,
      skippedCount: skippedAdds.length
    };
  },

  openRegisterForOtherManualSheet() {
    this.setData({
      registerForOtherManualVisible: true,
      registerForOtherManualName: '',
      registerForOtherManualPhone: '',
      registerForOtherManualGender: 'male'
    });
  },

  closeRegisterForOtherManualSheet() {
    this.setData({
      registerForOtherManualVisible: false,
      registerForOtherManualName: '',
      registerForOtherManualPhone: '',
      registerForOtherManualGender: 'male'
    });
  },

  onRegisterForOtherManualNameInput(e) {
    this.setData({ registerForOtherManualName: (e.detail && e.detail.value) || '' });
  },

  onRegisterForOtherManualPhoneInput(e) {
    this.setData({ registerForOtherManualPhone: (e.detail && e.detail.value) || '' });
  },

  onRegisterForOtherManualGenderSelect(e) {
    const gender = e.currentTarget.dataset.gender;
    if (gender !== 'male' && gender !== 'female') return;
    this.setData({ registerForOtherManualGender: gender });
  },

  /**
   * Patch 6：手工添加确定 → 构建 pending 选手 → 打开「选择代表分队」
   * 手机号非空时提前按 phone 去重；写盘在分队确认后走 _applyProxyCommitPlan
   */
  confirmRegisterForOtherManualSheet() {
    const name = (this.data.registerForOtherManualName || '').trim();
    const phone = (this.data.registerForOtherManualPhone || '').trim();
    const gender = this.data.registerForOtherManualGender === 'female' ? 'female' : 'male';
    if (!name) {
      wx.showToast({ title: '请输入选手姓名', icon: 'none' });
      return;
    }
    if (phone && !/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: '手机号格式不正确', icon: 'none' });
      return;
    }

    // 手机号非空：按 phone 去重（当前阶段不做后台校验）
    if (phone) {
      const users = ((this.data.registerInfo && this.data.registerInfo.users) || []).slice();
      const phoneExists = users.some((u) => String((u && u.phone) || '').trim() === phone);
      if (phoneExists) {
        wx.showToast({ title: '已报名', icon: 'none' });
        return;
      }
    }

    const ts = Date.now();
    const userType = phone ? 'phone' : 'guest';
    const identitySource = phone ? 'manual_add' : 'derived';
    const userId = phone ? 'phone_pending_' + ts : 'nonreg_' + ts;
    const player = {
      playerId: userId,
      userId: userId,
      name: name,
      competitionName: name,
      realName: name,
      remarkName: '',
      phone: phone || '',
      gender: gender,
      avatar: mockAvatars.pickMockAvatar(userId || name),
      pickChannel: 'manual',
      source: 'proxy',
      userType: userType,
      identitySource: identitySource
    };
    detailDebugLog('[register-for-other] manual player', {
      matchId: this.data.matchId || '',
      pickChannel: 'manual',
      userType: userType,
      player: player
    });
    this.closeRegisterForOtherManualSheet();
    this._openProxyGroupSheet([player], 'manual');
  },

  /** 从 match.teamGroups 解析代表分队/球队选项（展示 name + 可选 logo） */
  _resolveProxyGroupOptions() {
    const match = this.data.matchId ? teamMatchStore.getMatchById(this.data.matchId) : null;
    const groups =
      match && Array.isArray(match.teamGroups) && match.teamGroups.length
        ? match.teamGroups
        : DEFAULT_REGISTER_GROUPS;
    const interTeam = isInterTeamMatch(match);
    return (groups || [])
      .map((g, index) => ({
        id: g && g.id != null ? String(g.id) : String(index + 1),
        name: g && g.name ? String(g.name) : '',
        logo: interTeam
          ? String((g && g.sourceTeamLogo) || '').trim() || DEFAULT_ORG_LOGO
          : ''
      }))
      .filter((g) => g.name);
  },

  /**
   * Patch 3：选人完成后打开「选择代表分队/球队」弹窗
   * @param {Array} players pendingProxyPlayers
   * @param {string} pickChannel friends | team_members | manual
   */
  _openProxyGroupSheet(players, pickChannel) {
    const list = Array.isArray(players) ? players.slice() : [];
    if (!list.length) {
      wx.showToast({ title: '未选择人员', icon: 'none' });
      return;
    }
    const options = this._resolveProxyGroupOptions();
    if (!options.length) {
      const side = this.data.registerSideLabel || '分队';
      wx.showToast({ title: '暂无' + side + '可选', icon: 'none' });
      return;
    }
    // 报名球队（proxyGroupId / groupId）：默认=成员来源侧；允许改成其他参赛侧
    const defaultRegId = String(this._proxyMemberSourceGroupId || '').trim();
    const hasDefault = !!(
      defaultRegId && options.some((g) => String(g.id) === defaultRegId)
    );
    const sourceName = String(this._proxyMemberSourceTeamName || '').trim();
    const channel = pickChannel || '';
    this.setData({
      pendingProxyPlayers: list,
      proxyGroupOptions: options,
      proxyGroupId: hasDefault ? defaultRegId : '',
      proxyMemberSourceDisplayName:
        channel === 'team_members' && sourceName ? sourceName : '',
      proxyGroupSheetVisible: true
    });
    this._proxyPickChannel = channel;
  },

  selectProxyGroup(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.setData({ proxyGroupId: String(id) });
  },

  /** 取消报名球队选择：关弹窗 + 清空 pending / commit plan，不写盘 */
  cancelProxyGroupSheet() {
    this.setData({
      proxyGroupSheetVisible: false,
      pendingProxyPlayers: [],
      proxyGroupOptions: [],
      proxyGroupId: '',
      proxyMemberSourceDisplayName: ''
    });
    this._proxyPickChannel = '';
    this._proxyCommitPlan = null;
    this._proxyMemberSourceGroupId = '';
    this._proxyMemberSourceTeamId = '';
    this._proxyMemberSourceTeamName = '';
  },

  _clearProxyRegistrationTempState() {
    this.setData({
      proxyGroupSheetVisible: false,
      pendingProxyPlayers: [],
      proxyGroupOptions: [],
      proxyGroupId: '',
      proxyMemberSourceDisplayName: '',
      proxyMemberSourceSheetVisible: false,
      proxyMemberSourceOptions: [],
      proxyMemberSourceGroupId: ''
    });
    this._proxyPickChannel = '';
    this._proxyMemberSourceGroupId = '';
    this._proxyMemberSourceTeamId = '';
    this._proxyMemberSourceTeamName = '';
  },

  /** 代报名人员 → registerInfo.users 记录（Patch 4） */
  _buildProxyRegisterUserRecord(player, group, operator) {
    const p = player || {};
    const userId = String(p.userId || p.playerId || '').trim();
    const competitionName = String(
      p.competitionName || p.name || p.realName || ''
    ).trim();
    const pickChannelRaw = String(
      p.pickChannel || this._proxyPickChannel || ''
    ).trim();
    const pickChannel =
      pickChannelRaw === 'friends' ||
      pickChannelRaw === 'manual' ||
      pickChannelRaw === 'team_members'
        ? pickChannelRaw
        : '';
    const registeredBy = String((operator && operator.userId) || '');
    const registeredByName = String(
      (operator && (operator.name || operator.competitionName || operator.nickname)) || ''
    ).trim();
    return {
      userId: userId,
      userType: p.userType != null && String(p.userType).trim() !== ''
        ? String(p.userType).trim()
        : pickChannel === 'manual'
          ? p.phone
            ? 'phone'
            : 'guest'
          : 'registered',
      identitySource: p.identitySource != null && String(p.identitySource).trim() !== ''
        ? String(p.identitySource).trim()
        : pickChannel === 'manual'
          ? p.phone
            ? 'manual_add'
            : 'derived'
          : 'proxy_add',
      nickname: p.nickname != null ? String(p.nickname) : '',
      competitionName: competitionName,
      matchNickname: p.matchNickname != null ? String(p.matchNickname) : competitionName,
      gender: p.gender != null ? String(p.gender) : '',
      avatar: p.avatar != null ? String(p.avatar) : '',
      phone: p.phone != null ? String(p.phone) : '',
      handicap: p.handicap != null && p.handicap !== '' ? p.handicap : '',
      floatCoef: p.floatCoef != null && p.floatCoef !== '' ? p.floatCoef : '',
      groupId: group && group.id != null ? String(group.id) : '',
      groupName: group && group.name ? String(group.name) : '',
      // 参赛侧快照：与 groupId/groupName 同值（队际短名，非 sourceTeamId）
      matchTeamId: group && group.id != null ? String(group.id) : '',
      matchTeamName: group && group.name ? String(group.name) : '',
      registeredAt: Date.now(),
      source: 'proxy',
      registeredBy: registeredBy,
      registeredByName: registeredByName,
      subjectType: 'other',
      pickChannel: pickChannel,
      canSelfCancel: true,
      locked: false
    };
  },

  /**
   * Patch 4：将 pendingProxyPlayers 写入 match.registerInfo.users（按 userId 去重）
   * @returns {{ ok: boolean, addedCount: number, skippedCount: number, groupId: string }}
   */
  _commitProxyRegistrations(players, group) {
    const match = teamMatchStore.getMatchById(this.data.matchId);
    if (!match) {
      wx.showToast({ title: '赛事数据缺失', icon: 'none' });
      return { ok: false, addedCount: 0, skippedCount: 0, groupId: '' };
    }
    const operator = gameStore.getCurrentUser() || {};
    const operatorId = String(operator.userId || '');
    if (!operatorId) {
      wx.showToast({ title: '用户信息缺失', icon: 'none' });
      return { ok: false, addedCount: 0, skippedCount: 0, groupId: '' };
    }
    // registeredByName：优先当前用户 name，其次资料 competitionName / nickname
    let registeredByName = (operator.name && String(operator.name).trim()) || '';
    if (!registeredByName) {
      try {
        const profile = userProfileStore.loadProfile() || {};
        registeredByName =
          (profile.competitionName && String(profile.competitionName).trim()) ||
          (profile.nickname && String(profile.nickname).trim()) ||
          '';
      } catch (e) {
        registeredByName = '';
      }
    }
    const operatorMeta = {
      userId: operatorId,
      name: registeredByName,
      competitionName: registeredByName,
      nickname: registeredByName
    };

    if (!match.registerInfo || typeof match.registerInfo !== 'object') {
      match.registerInfo = { totalCount: 0, users: [] };
    }
    if (!Array.isArray(match.registerInfo.users)) {
      match.registerInfo.users = [];
    }

    const existingIds = {};
    match.registerInfo.users.forEach((u) => {
      const id = u && u.userId != null ? String(u.userId) : '';
      if (id) existingIds[id] = true;
    });

    let addedCount = 0;
    let skippedCount = 0;
    const list = Array.isArray(players) ? players : [];
    list.forEach((player) => {
      const record = this._buildProxyRegisterUserRecord(player, group, operatorMeta);
      if (!record.userId) {
        skippedCount += 1;
        return;
      }
      if (existingIds[record.userId]) {
        skippedCount += 1;
        return;
      }
      match.registerInfo.users.push(record);
      existingIds[record.userId] = true;
      addedCount += 1;
    });

    match.registerInfo.totalCount = match.registerInfo.users.length;
    teamMatchStore.saveMatch(match);

    const groupId = group && group.id != null ? String(group.id) : '';
    const patch = this._buildRegisterStatePatch(match, groupId);
    Object.assign(patch, {
      proxyGroupSheetVisible: false,
      pendingProxyPlayers: [],
      proxyGroupOptions: [],
      proxyGroupId: ''
    });
    this._proxyPickChannel = '';
    this.setData(patch, () => {
      if (this.data.activeTab === 'register') this.measureRegisterExtTop();
    });

    return { ok: true, addedCount: addedCount, skippedCount: skippedCount, groupId: groupId };
  },

  /**
   * Patch 5C：将 this._proxyCommitPlan 正式写入 match.registerInfo.users
   * - removes：再次校验 source===proxy && registeredBy===当前用户
   * - adds：按 userId 去重后写入（不含 player 原始对象）
   * - saveMatch + 刷新报名 TAB + 清理 pending
   * @returns {{ ok: boolean, removedCount: number, addedCount: number }}
   */
  _applyProxyCommitPlan() {
    const plan = this._proxyCommitPlan;
    if (!plan) {
      this._clearProxyRegistrationTempState();
      this._proxyCommitPlan = null;
      wx.showToast({ title: '没有可更新的报名', icon: 'none' });
      return { ok: false, removedCount: 0, addedCount: 0 };
    }

    const matchId = plan.matchId || this.data.matchId || '';
    const match = teamMatchStore.getMatchById(matchId);
    if (!match) {
      wx.showToast({ title: '赛事数据缺失', icon: 'none' });
      return { ok: false, removedCount: 0, addedCount: 0 };
    }

    // 提交时再校验报名状态（不以入口按钮/弹窗状态代替）
    if (this._normalizeRegistrationStatus(match) === 'closed') {
      this._clearProxyRegistrationTempState();
      this._proxyCommitPlan = null;
      this._showRegistrationClosedModal();
      return { ok: false, removedCount: 0, addedCount: 0 };
    }

    const operator = gameStore.getCurrentUser() || {};
    const operatorUserId = String(operator.userId || '');
    if (!operatorUserId) {
      wx.showToast({ title: '用户信息缺失', icon: 'none' });
      return { ok: false, removedCount: 0, addedCount: 0 };
    }

    // 有新增时：目标 groupId 必须仍属本场参赛侧（切换报名球队后的最终校验）
    const addsPreview = Array.isArray(plan.adds) ? plan.adds : [];
    if (addsPreview.length) {
      const targetGroupId = String(
        (plan.group && plan.group.id) ||
          (addsPreview[0] && addsPreview[0].groupId) ||
          ''
      ).trim();
      const liveGroups = Array.isArray(match.teamGroups) ? match.teamGroups : [];
      const liveGroup = liveGroups.find((g) => g && String(g.id) === targetGroupId);
      if (!targetGroupId || !liveGroup) {
        this._clearProxyRegistrationTempState();
        this._proxyCommitPlan = null;
        const side = this.data.registerSideLabel || '分队';
        wx.showToast({ title: '报名' + side + '不属于本场比赛', icon: 'none' });
        return { ok: false, removedCount: 0, addedCount: 0 };
      }
      // 以赛事侧最新名称为准，保证 groupId/matchTeamId 同源
      plan.group = {
        id: String(liveGroup.id),
        name: String(liveGroup.name || '').trim()
      };
      addsPreview.forEach((item) => {
        if (!item) return;
        item.groupId = plan.group.id;
        item.groupName = plan.group.name;
        item.matchTeamId = plan.group.id;
        item.matchTeamName = plan.group.name;
      });
    }

    if (!match.registerInfo || typeof match.registerInfo !== 'object') {
      match.registerInfo = { totalCount: 0, users: [] };
    }
    if (!Array.isArray(match.registerInfo.users)) {
      match.registerInfo.users = [];
    }

    let users = match.registerInfo.users.slice();
    let removedCount = 0;
    let addedCount = 0;

    // 1) 应用 removes（再次校验：仅本人代报名可删；按 targetUserId 清理 groups/pairings）
    const removeIds = {};
    const removes = Array.isArray(plan.removes) ? plan.removes : [];
    removes.forEach((item) => {
      const userId = String((item && item.userId) || '').trim();
      if (!userId) return;
      const registration = users.find((u) => String(u && u.userId) === userId);
      if (!registration) return;
      const source = String(registration.source || 'self');
      const registeredBy = String(registration.registeredBy || '');
      const canRemove =
        source === 'proxy' &&
        registeredBy === operatorUserId &&
        String(registration.userId) === userId;
      if (canRemove) removeIds[userId] = true;
    });
    if (Object.keys(removeIds).length) {
      const before = users.length;
      users = users.filter((u) => !removeIds[String((u && u.userId) || '')]);
      removedCount = before - users.length;
      // 与自己取消报名共用清理：按 targetUserId 清空 groups 位 + pairings
      Object.keys(removeIds).forEach((uid) => {
        teamMatchStore.clearUserFromFormalGroups(match, uid);
        teamMatchStore.clearUserFromPairings(match, uid);
      });
    }

    // 2) 应用 adds（按 userId 去重；manual 另按 phone 去重；不写 player 原始对象）
    const existingIds = {};
    const existingPhones = {};
    users.forEach((u) => {
      const id = u && u.userId != null ? String(u.userId) : '';
      if (id) existingIds[id] = true;
      const phone = u && u.phone != null ? String(u.phone).trim() : '';
      if (phone) existingPhones[phone] = true;
    });
    const adds = Array.isArray(plan.adds) ? plan.adds : [];
    adds.forEach((item) => {
      const userId = String((item && item.userId) || '').trim();
      if (!userId || existingIds[userId]) return;
      const pickChannel =
        String((item && item.pickChannel) || '').trim() === 'manual'
          ? 'manual'
          : String((item && item.pickChannel) || '').trim() === 'team_members'
            ? 'team_members'
            : 'friends';
      const phone = item.phone != null ? String(item.phone).trim() : '';
      // Patch 6：手工添加写盘前再次按 phone 去重
      if (pickChannel === 'manual' && phone && existingPhones[phone]) return;
      const sideId =
        item.groupId != null && String(item.groupId).trim() !== ''
          ? String(item.groupId).trim()
          : item.matchTeamId != null
            ? String(item.matchTeamId).trim()
            : '';
      const sideName =
        item.groupName != null && String(item.groupName).trim() !== ''
          ? String(item.groupName).trim()
          : item.matchTeamName != null
            ? String(item.matchTeamName).trim()
            : '';
      const record = {
        userId: userId,
        userType: item.userType != null && String(item.userType).trim() !== ''
          ? String(item.userType).trim()
          : 'registered',
        identitySource: item.identitySource != null ? String(item.identitySource) : 'proxy_add',
        nickname: item.nickname != null ? String(item.nickname) : '',
        competitionName: item.competitionName != null ? String(item.competitionName) : '',
        matchNickname: item.matchNickname != null ? String(item.matchNickname) : (item.competitionName != null ? String(item.competitionName) : ''),
        gender: item.gender != null ? String(item.gender) : '',
        avatar: item.avatar != null ? String(item.avatar) : '',
        phone: phone,
        groupId: sideId,
        groupName: sideName,
        // 参赛侧快照：与 groupId 同值（赛事侧 id，非 sourceTeamId / 通讯录 teamId）
        matchTeamId: sideId,
        matchTeamName: sideName,
        registeredAt: item.registeredAt != null ? item.registeredAt : Date.now(),
        source: item.source || 'proxy',
        registeredBy: item.registeredBy != null ? String(item.registeredBy) : '',
        registeredByName: item.registeredByName != null ? String(item.registeredByName) : '',
        subjectType: item.subjectType || 'other',
        pickChannel: pickChannel,
        canSelfCancel: item.canSelfCancel !== false,
        locked: !!item.locked
      };
      // Patch 6：手工添加写入 userType / realName / remarkName
      if (pickChannel === 'manual') {
        record.userType = item.userType != null ? String(item.userType) : '';
        record.identitySource = item.identitySource != null ? String(item.identitySource) : 'manual_add';
        record.realName = item.realName != null ? String(item.realName) : '';
        record.remarkName = item.remarkName != null ? String(item.remarkName) : '';
      }
      users.push(record);
      existingIds[userId] = true;
      if (pickChannel === 'manual' && phone) existingPhones[phone] = true;
      addedCount += 1;
    });

    // 3) totalCount + saveMatch
    match.registerInfo.users = users;
    match.registerInfo.totalCount = users.length;
    teamMatchStore.saveMatch(match);

    detailDebugLog('[register-for-other] apply commit plan', {
      matchId: matchId,
      removedCount: removedCount,
      addedCount: addedCount,
      totalCount: match.registerInfo.totalCount
    });

    // 4) 刷新报名 TAB + 分组 TAB + 清理 pending / plan
    const preferredGroup =
      (plan.group && plan.group.id) || this.data.activeRegisterSubTab || '';
    const patch = Object.assign(
      {},
      this._buildRegisterStatePatch(match, preferredGroup),
      this._buildGroupsTabStatePatch(match),
      {
        proxyGroupSheetVisible: false,
        pendingProxyPlayers: [],
        proxyGroupOptions: [],
        proxyGroupId: '',
        proxyMemberSourceDisplayName: '',
        proxyMemberSourceSheetVisible: false,
        proxyMemberSourceOptions: [],
        proxyMemberSourceGroupId: '',
        registerCancelModalVisible: false,
        registerCancelSubmitting: false
      }
    );
    this._proxyPickChannel = '';
    this._proxyCommitPlan = null;
    this._pendingProxyCommitAfterConfirm = false;
    this._proxyMemberSourceGroupId = '';
    this._proxyMemberSourceTeamId = '';
    this._proxyMemberSourceTeamName = '';
    this.setData(patch, () => {
      if (this.data.activeTab === 'register') this.measureRegisterExtTop();
      if (this.data.activeTab === 'groups') this.computeGroupsPanelMinHeight();
    });

    // 5) toast
    if (removedCount > 0 || addedCount > 0) {
      wx.showToast({ title: '代报名已更新', icon: 'success' });
    } else {
      wx.showToast({ title: '没有可更新的报名', icon: 'none' });
    }

    return { ok: true, removedCount: removedCount, addedCount: addedCount };
  },

  /**
   * 确定报名球队/分队（registrationTeamId = proxyGroupId = teamGroups.id）：
   * - 写入 groupId / matchTeamId，不按成员来源 sourceTeamId 覆盖
   * - 不校验「球员必须属于目标球队通讯录」
   */
  confirmProxyGroupSheet() {
    const groupId = String(this.data.proxyGroupId || '');
    const options = this.data.proxyGroupOptions || [];
    const group = options.find((g) => String(g.id) === groupId);
    if (!group) {
      const side = this.data.registerSideLabel || '分队';
      wx.showToast({ title: '请选择报名' + side, icon: 'none' });
      return;
    }
    // 提交前：以 store 最新赛事再校验（不以弹窗 options / 按钮态代替）
    const match = this.data.matchId ? teamMatchStore.getMatchById(this.data.matchId) : null;
    if (!match) {
      wx.showToast({ title: '赛事数据缺失', icon: 'none' });
      return;
    }
    if (this._normalizeRegistrationStatus(match) === 'closed') {
      this._clearProxyRegistrationTempState();
      this._proxyCommitPlan = null;
      this._showRegistrationClosedModal();
      return;
    }
    const groups = Array.isArray(match.teamGroups) ? match.teamGroups : [];
    const liveGroup = groups.find((g) => g && String(g.id) === groupId);
    if (!liveGroup) {
      const side = this.data.registerSideLabel || '分队';
      wx.showToast({ title: '报名' + side + '不属于本场比赛', icon: 'none' });
      return;
    }
    // 用赛事侧最新名称，避免 UI 缓存名与归属 id 不一致
    const resolvedGroup = {
      id: String(liveGroup.id),
      name: String(liveGroup.name || group.name || '').trim()
    };
    const players = this.data.pendingProxyPlayers || [];
    if (!players.length) {
      wx.showToast({ title: '未选择人员', icon: 'none' });
      this._clearProxyRegistrationTempState();
      return;
    }

    const channelRaw = String(this._proxyPickChannel || '').trim();
    const pickChannel =
      channelRaw === 'manual'
        ? 'manual'
        : channelRaw === 'team_members'
          ? 'team_members'
          : 'friends';

    // 生成 add plan → 统一写盘（group 必须是赛事侧 groupId）
    const addPlan = this._buildProxyAddPlan(players, resolvedGroup);
    detailDebugLog('[register-for-other] add plan', addPlan);

    // 手工添加：手机号已报名时优先提示「已报名」
    if (
      pickChannel === 'manual' &&
      !addPlan.addCount &&
      (addPlan.skippedAdds || []).some((s) => s && s.reason === 'already_registered_phone')
    ) {
      this._clearProxyRegistrationTempState();
      this._proxyCommitPlan = null;
      wx.showToast({ title: '已报名', icon: 'none' });
      return;
    }

    const prev = this._proxyCommitPlan || {};
    this._proxyCommitPlan = {
      matchId: prev.matchId || this.data.matchId || '',
      mode: prev.mode || (pickChannel === 'team_members' ? 'proxy_register_team' : 'proxy_register'),
      pickChannel: pickChannel,
      removes: Array.isArray(prev.removes) ? prev.removes : [],
      skippedRemoves: Array.isArray(prev.skippedRemoves) ? prev.skippedRemoves : [],
      pendingAdds: Array.isArray(prev.pendingAdds) ? prev.pendingAdds : players.slice(),
      adds: addPlan.adds,
      skippedAdds: addPlan.skippedAdds,
      group: addPlan.group,
      applied: false,
      saved: false
    };
    detailDebugLog('[register-for-other] unified commit plan (before apply)', this._proxyCommitPlan);
    this._promptOrApplyProxyCommitPlan();
  },

  /**
   * 邀请好友报名：微信分享入口（阶段占位）
   * 已登录用户可用；与 registrationStatus 无关（关闭报名后仍可邀请）
   */
  shareTournamentInvite() {
    const matchId = this.data.matchId || '';
    const match = this.data.match || {};
    const title = match.titleMain || match.roundName || '球队赛';
    detailDebugLog('[invite-friends-register] share tournament invite', {
      matchId: matchId,
      title: title,
      registrationStatus: (this.data.registerPermission && this.data.registerPermission.registrationStatus) || ''
    });
    this._inviteShareFromPanel = true;
    try {
      wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
    } catch (e) { /* ignore */ }
    wx.showToast({ title: '请点击右上角分享给好友', icon: 'none' });
  },

  onShareAppMessage() {
    const matchId = this.data.matchId || '';
    const matchView = this.data.match || {};
    const rawMatch = matchId ? teamMatchStore.getMatchById(matchId) : null;
    const org = resolveOrganizerDisplay(rawMatch || matchView);
    const titleBase =
      matchView.titleMain ||
      (rawMatch && rawMatch.roundName) ||
      org.name ||
      '球队赛';
    const title = org.name && titleBase !== org.name
      ? titleBase + ' · ' + org.name
      : titleBase;
    const imageUrl =
      (matchView.logo && String(matchView.logo).trim()) ||
      (rawMatch && rawMatch.matchLogo && String(rawMatch.matchLogo).trim()) ||
      (org.logo && String(org.logo).trim()) ||
      '';
    if (this._inviteShareFromPanel) {
      this._inviteShareFromPanel = false;
    }
    const share = {
      title: '邀请你报名：' + title,
      path: '/subpackages/tournament/pages/detail/index?matchId=' + encodeURIComponent(matchId)
    };
    if (imageUrl) share.imageUrl = imageUrl;
    return share;
  },

  closeHalfSheet() {
    this.setData({ halfSheetVisible: false });
  },

  onHalfCourseConfirmed() {
    const matchId = this.data.matchId || '';
    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    this.setData({
      halfSheetVisible: false,
      courseName: (match && match.courseName) || groupsStore.getCourseName()
    });
    if (matchId) {
      this.refreshMatchData(matchId);
      this.refreshGroupsDerived();
      wx.nextTick(() => this.updateOpenScorecard());
    }
  },

  /* ===== 显示设置（字体大小） ===== */
  _getFontScale() {
    try {
      return wx.getStorageSync('fontScale_global') === 'large' ? 'large' : 'normal';
    } catch (e) {
      return 'normal';
    }
  },

  _syncFontScale() {
    const fontScale = this._getFontScale();
    this.setData({
      fontScale: fontScale,
      fontScaleClass: fontScale === 'large' ? 'font-large' : 'font-normal'
    });
  },

  _setFontScale(value) {
    const next = value === 'large' ? 'large' : 'normal';
    try {
      wx.setStorageSync('fontScale_global', next);
    } catch (e) {}
    this.setData({
      fontScale: next,
      fontScaleClass: next === 'large' ? 'font-large' : 'font-normal'
    });
  },

  openStyleSheet() {
    this.setData({
      showStyleSheet: true,
      fontScale: this._getFontScale()
    });
  },
  closeStyleSheet() {
    this.setData({ showStyleSheet: false });
  },
  onFontScaleChange(e) {
    const value =
      e && e.currentTarget && e.currentTarget.dataset
        ? e.currentTarget.dataset.value
        : '';
    this._setFontScale(value);
  },
  // 总杆/杆差切换：统一驱动 领先榜TOTAL + 逐洞详情面板，并写入全局缓存（与记分页同键）
  setScoringDisplay(e) {
    const value = e.currentTarget.dataset.value; // 'gross' | 'strokeDiff'
    const mode = value === 'gross' ? 'gross' : 'diff';
    this.setData({ scoringDisplay: value, scoreDisplayMode: mode, showStyleSheet: false });
    try {
      wx.setStorageSync('scoreDisplayMode_global', mode);
    } catch (err) {}
    // 1) 领先榜主列表 TOTAL  2) 已展开的逐洞详情面板（依据新模式重算每洞 SCORE）
    this.refreshLeaderboard();
    this.updateOpenScorecard();
  },
  setScorePanel(e) {
    const value = e.currentTarget.dataset.value;
    this.setData({ scorePanel: value });
  },

  /* ===== 围观行（页面级二级 sticky）===== */
  onWatcherAvatarTouchStart(e) {
    const ds = e.currentTarget.dataset || {};
    this._watcherLpPressed = false;
    if (this._watcherLpTimer) clearTimeout(this._watcherLpTimer);
    this._watcherLpTimer = setTimeout(() => {
      this._watcherLpTimer = null;
      this._watcherLpPressed = true;
      const disc = this.selectComponent('.discussion-inline');
      if (disc && disc.insertMention) disc.insertMention(ds.userid, ds.name);
    }, 500);
  },
  onWatcherAvatarTouchMove() {
    if (this._watcherLpTimer) {
      clearTimeout(this._watcherLpTimer);
      this._watcherLpTimer = null;
    }
  },
  onWatcherAvatarTouchEnd() {
    if (this._watcherLpTimer) {
      clearTimeout(this._watcherLpTimer);
      this._watcherLpTimer = null;
    }
  },

  /* ===== 围观弹层 ===== */
  openWatchers() {
    this.setData({ showWatchers: true });
  },
  closeWatchers() {
    this.setData({ showWatchers: false });
  },

  stopPropagation() {}
});
