/**
 * 首页演示赛事「交杯鲜啤挑战赛」— 仅此一场，不写入 teamMatchStore
 * 赛事信息：在已有项上 merge 创建队内赛默认配置，不另写一套文案。
 */

const bannerConfig = require('./bannerConfig.js');
const eventSponsorConfig = require('./eventSponsorConfig.js');
const {
  createDefaultEventInfoList,
  mergeDefaultEventInfo
} = require('./eventInfoDefaults.js');

/** 与首页演示卡片绑定的固定 matchId */
const DEMO_JIAOBEI_MATCH_ID = 'demo-jiaobei-beer';

const DEMO_JIAOBEI_TITLE = '交杯鲜啤挑战赛&江湖业余球员巡回赛第三站';

/**
 * 演示赛事「已有」赛事信息（个性化保留位）。
 * 当前无独立文案库存，仅留空数组；若后续补入有效 content，merge 会保留。
 */
const DEMO_JIAOBEI_EVENT_INFO_SEED = [];

function isJiaobeiDemoMatchId(matchId) {
  return String(matchId || '') === DEMO_JIAOBEI_MATCH_ID;
}

function buildJiaobeiDemoEventInfoList() {
  return mergeDefaultEventInfo(
    DEMO_JIAOBEI_EVENT_INFO_SEED,
    createDefaultEventInfoList()
  );
}

/**
 * 领先榜逐洞面板下方广告位：复用「广告图片1」COS BRIGHT / DARK（含版本号）
 */
function getJiaobeiScorecardAd() {
  const slot = eventSponsorConfig.getDefaultEventSponsorSlot(0);
  return {
    bright: slot.bright || '',
    dark: slot.dark || ''
  };
}

/** 按主题取逐洞面板广告 URL */
function resolveJiaobeiScorecardAdImage(theme) {
  return eventSponsorConfig.resolveScorecardAdImageByTheme(theme);
}

/** 构建演示用 match 对象（进行中），供详情页 loadMatch 使用 */
function getJiaobeiDemoMatch() {
  const scorecardAd = getJiaobeiScorecardAd();
  return {
    matchId: DEMO_JIAOBEI_MATCH_ID,
    teamId: '',
    teamName: '江湖业余球员巡回赛',
    teamLogo: 'https://cdn.screenshottocode.com/4xhZC0kyGivdD4E_wX-1F.png',
    matchLogo: 'https://cdn.screenshottocode.com/4xhZC0kyGivdD4E_wX-1F.png',
    logoConfig: { type: 'custom', url: 'https://cdn.screenshottocode.com/4xhZC0kyGivdD4E_wX-1F.png', source: 'custom' },
    roundName: DEMO_JIAOBEI_TITLE,
    gameMode: '个人比杆赛',
    matchType: 'team-internal',
    organizationName: '',
    feeList: [],
    eventInfoList: buildJiaobeiDemoEventInfoList(),
    teamGroups: [],
    registerInfo: { totalCount: 0, users: [] },
    groups: [],
    pairings: {},
    feeSet: false,
    isDiamondMode: false,
    bannerImage: bannerConfig.getMatchDetailBanner() || '',
    /** 领先榜逐洞下方广告：广告图片1 */
    scorecardAdBright: scorecardAd.bright,
    scorecardAdDark: scorecardAd.dark,
    courseId: 'c-qhw',
    courseName: '北京清河湾高尔夫乡村俱乐部',
    courseLocation: '北京 · 昌平',
    courseHalfText: 'A&B',
    front9Course: 'A',
    back9Course: 'B',
    teeTime: '2026-05-25 08:00',
    teeTimeText: '2026/05/25 星期一 08:00',
    deadlineTime: '',
    deadlineTimeText: '',
    visibility: 'public',
    accessCode: '',
    groupPermission: 'admin',
    registerStatus: 'closed',
    status: 'ongoing',
    statusLabel: '进行中',
    createdBy: '',
    creatorId: '',
    createdAt: 0
  };
}

module.exports = {
  DEMO_JIAOBEI_MATCH_ID,
  DEMO_JIAOBEI_TITLE,
  isJiaobeiDemoMatchId,
  buildJiaobeiDemoEventInfoList,
  getJiaobeiScorecardAd,
  resolveJiaobeiScorecardAdImage,
  getJiaobeiDemoMatch
};
