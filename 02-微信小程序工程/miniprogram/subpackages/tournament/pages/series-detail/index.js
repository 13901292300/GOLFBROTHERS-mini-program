/**
 * 系列赛只读详情页（4C-2）
 * - 不创建/修改/发布 Series
 * - activeTab / scrollTop 仅页面实例，不持久化
 * - onShow 可刷新数据，不重置 TAB/滚动
 * - TAB：流内占位 + 页外固定克隆吸顶（对齐 detail）
 */

var { createHeaderStyle } = require('../../../../utils/headerEngine.js');
var seriesStore = require('../../../../utils/seriesStore.js');
var seriesStationIndex = require('../../../../utils/seriesStationIndex.js');
var seriesAccessGate = require('../../utils/seriesAccessGate.js');
var teamMatchStore = require('../../../../utils/teamMatchStore.js');
var partnerConfigUtil = require('../../../../utils/partnerConfig.js');
var eventSponsorConfig = require('../../../../utils/eventSponsorConfig.js');
var gameStore = require('../../../../utils/gameStore.js');
var userProfileStore = require('../../../../utils/userProfileStore.js');
var seriesRegistration = require('../../../../utils/seriesRegistration.js');
var seriesSelfCancellationOrchestrator = require('../../utils/seriesSelfCancellationOrchestrator.js');
var seriesIds = require('../../../../utils/seriesIds.js');
var viewModel = require('./seriesDetailViewModel.js');
var standingsViewModel = require('./seriesStandingsViewModel.js');
var seriesStandingsAssembler = require('../../utils/seriesStandingsAssembler.js');
var teamMatchScorecard = require('../../../../utils/teamMatchScorecard.js');
var seriesStandingsExpandIdentity = require('../../utils/seriesStandingsExpandIdentity.js');
var openPlayerProfileUtil = require('../../../../utils/openPlayerProfile.js');
var contactFollowAction = require('../../../../utils/contactFollowAction.js');
var registerViewModel = require('./seriesRegisterViewModel.js');
var registrationInteractionModel = require('../../utils/registrationInteractionModel.js');
var seriesRegisterEligibility = require('./seriesRegisterEligibility.js');

var REG_SELF_CANCEL_UNGROUPED = registrationInteractionModel.buildSelfCancelDialogModel({
  grouped: false
});
var REG_SELF_CANCEL_GROUPED = registrationInteractionModel.buildSelfCancelDialogModel({
  grouped: true
});
var scheduleViewModel = require('./seriesScheduleViewModel.js');
var seriesLiveSession = require('./seriesLiveSessionProjection.js');
var seriesScheduleGroupWrite = require('../../../../utils/tournament/seriesScheduleGroupWrite.js');
var discussionViewModel = require('./seriesDiscussionViewModel.js');
var matchManageAccess = require('../../../../utils/matchManageAccess.js');
var playerManage = require('../../../../utils/playerManage.js');
var teeSheetManage = require('../../../../utils/teeSheetManage.js');
var paymentManage = require('../../../../utils/paymentManage.js');
var seriesGroupedPaymentManage = require('../../../../utils/seriesGroupedPaymentManage.js');
var teamMatchMoreMenu = require('../../../../utils/teamMatchMoreMenu.js');
var teamMatchFinish = require('../../../../utils/teamMatchFinish.js');
var seriesFinalize = require('../../../../utils/seriesFinalize.js');
var seriesFinishLock = require('../../../../utils/seriesFinishLock.js');
var seriesStationManageGate = require('../../../../utils/seriesStationManageGate.js');
var seriesManageAccess = require('../../../../utils/seriesManageAccess.js');
var seriesManageRoundPicker = require('./seriesManageRoundPicker.js');
var seriesManageSheetViewModel = require('./seriesManageSheetViewModel.js');
var seriesProxyRegisterViewModel = require('./seriesProxyRegisterViewModel.js');
var seriesStandingsViewOptions = require('./seriesStandingsViewOptions.js');
var seriesStandingsRoundBoard = require('./seriesStandingsRoundBoard.js');
var seriesPersonalLeaderboardAdapter = require('./seriesPersonalLeaderboardAdapter.js');
var seriesTeamLeaderboardAdapter = require('./seriesTeamLeaderboardAdapter.js');
var seriesLiveLeaderboardAdapter = require('./seriesLiveLeaderboardAdapter.js');
var liveLeaderboardScorecard = require('../../../../utils/liveLeaderboardScorecard.js');
var seriesBottomDockVisibility = require('./seriesBottomDockVisibility.js');
var seriesLayerStack = require('./seriesLayerStack.js');
var teamMatchEnterGroupScore = require('../../utils/teamMatchEnterGroupScore.js');
var manageRoundOverflowArrows = require('../../components/series-round-selector-dock/overflowArrows.js');
var teamDirectory = require('../../../../utils/teamDirectory.js');
var mockAvatars = require('../../../../utils/mockAvatars.js');
var { DEFAULT_ORG_LOGO } = require('../../../../utils/teamMatchCapabilities.js');

/** 与 detail 领先榜逐洞广告默认图一致（eventInfoList 无图时） */
var DEFAULT_SCORECARD_AD_IMAGE =
  'https://images.unsplash.com/photo-1535131749006-b7f58c99034b?auto=format&fit=crop&w=900&q=85';
var FAB_HIDE_MARGIN_RPX = 16;
var FAB_SIZE_RPX = 60;
var FAB_EDGE_GAP_RPX = 10;

function isPositiveFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function pickSeriesDetailWindowFields(info, current) {
  var next = current || {};
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
  var bottom = info.safeArea && info.safeArea.bottom;
  if (!isFiniteNumber(next.safeAreaBottom) && isFiniteNumber(bottom)) {
    next.safeAreaBottom = bottom;
    next.safeArea = info.safeArea;
  }
  return next;
}

function isSeriesDetailWindowReady(cur, needSafeArea) {
  var hasWh =
    isPositiveFiniteNumber(cur.windowWidth) && isPositiveFiniteNumber(cur.windowHeight);
  if (!needSafeArea) return hasWh;
  return (
    hasWh &&
    isPositiveFiniteNumber(cur.screenHeight) &&
    isFiniteNumber(cur.safeAreaBottom)
  );
}

/** 系列详情窗口/safeArea：优先 getWindowInfo，按字段回退 getSystemInfoSync；缺失为 null */
function readSeriesDetailWindowLayout(opts) {
  var needSafeArea = !!(opts && opts.needSafeArea);
  var cur = {};
  var threw = false;
  try {
    if (typeof wx !== 'undefined' && typeof wx.getWindowInfo === 'function') {
      try {
        cur = pickSeriesDetailWindowFields(wx.getWindowInfo(), cur);
      } catch (err) {
        threw = true;
      }
    }
  } catch (errOuter) {
    threw = true;
  }
  if (!isSeriesDetailWindowReady(cur, needSafeArea)) {
    try {
      if (typeof wx !== 'undefined' && typeof wx.getSystemInfoSync === 'function') {
        try {
          cur = pickSeriesDetailWindowFields(wx.getSystemInfoSync(), cur);
        } catch (err2) {
          threw = true;
        }
      }
    } catch (errLegacy) {
      threw = true;
    }
  }
  var windowWidth = isPositiveFiniteNumber(cur.windowWidth) ? cur.windowWidth : null;
  var windowHeight = isPositiveFiniteNumber(cur.windowHeight) ? cur.windowHeight : null;
  var safeBottom = 0;
  if (isPositiveFiniteNumber(cur.screenHeight) && isFiniteNumber(cur.safeAreaBottom)) {
    safeBottom = Math.max(0, cur.screenHeight - cur.safeAreaBottom);
  }
  return {
    windowWidth: windowWidth,
    windowHeight: windowHeight,
    screenHeight: isPositiveFiniteNumber(cur.screenHeight) ? cur.screenHeight : null,
    safeArea: cur.safeArea || null,
    safeBottom: safeBottom,
    threwWithoutValue: threw && windowHeight == null
  };
}
var socialRelationStore = require('../../../../utils/socialRelationStore.js');
var playerDirectory = require('../../../../utils/playerDirectory.js');

var DEFAULT_TAB = 'info';
var ALLOWED_TABS = {
  info: true,
  standings: true,
  register: true,
  schedule: true,
  discussion: true
};
var HERO_LOGO_SIZE_RPX = 56;
var HERO_LOGO_GAP_RPX = 12;
// 吸顶临界余量：抵消取整/边框，使 maxScrollTop 稳定跨过阈值（非大段空白）
var SCROLL_FILLER_TOLERANCE_PX = 4;

/**
 * fixed 克隆相对 scroll-view 内容坐标系的目标 top
 * stickyTopInsideScroll = max(0, stickyRoundSelectorTop - scrollRectTop)
 */
function computeStickyTopInsideScroll(stickyRoundSelectorTop, scrollRectTop) {
  var st = Number(stickyRoundSelectorTop);
  var srt = Number(scrollRectTop);
  if (!Number.isFinite(st) || st < 0) st = 0;
  if (!Number.isFinite(srt) || srt < 0) srt = 0;
  return Math.max(0, st - srt);
}

/**
 * 二级吸顶阈值（内容坐标）：
 * secondaryThreshold = max(0, roundSelectorOffsetTop - stickyTopInsideScroll)
 * 禁止用页面坐标 stickyRoundSelectorTop 直接减内容坐标 roundSelectorOffsetTop
 */
function computeSecondaryStickyThreshold(
  roundSelectorOffsetTop,
  stickyRoundSelectorTop,
  scrollRectTop
) {
  var off = Number(roundSelectorOffsetTop);
  if (!Number.isFinite(off) || off <= 0) return 0;
  var inside = computeStickyTopInsideScroll(stickyRoundSelectorTop, scrollRectTop);
  return Math.max(0, off - inside);
}

/**
 * 短内容补偿目标阈值：
 * - 总榜可用：二级阈值（可先为 0，由 switchTab 用一级兜底）
 * - 赛程有轮次：同总榜二级阈值
 * - 报名：已测二级则用二级，否则回退一级 tabOffsetTop
 * - 其余：一级 tabOffsetTop
 */
function resolveFillerTargetStickyOffset(
  activeTab,
  standingsAvailable,
  tabOffsetTop,
  secondaryThreshold,
  scheduleAvailable
) {
  if (activeTab === 'standings' && standingsAvailable) {
    var sec = Number(secondaryThreshold);
    return Number.isFinite(sec) && sec >= 0 ? sec : 0;
  }
  if (activeTab === 'schedule' && scheduleAvailable) {
    var secS = Number(secondaryThreshold);
    return Number.isFinite(secS) && secS >= 0 ? secS : 0;
  }
  if (activeTab === 'register') {
    var secR = Number(secondaryThreshold);
    if (Number.isFinite(secR) && secR > 0) return secR;
  }
  var th = Number(tabOffsetTop);
  return Number.isFinite(th) && th >= 0 ? th : 0;
}

/**
 * 从当前真实 scrollHeight 扣除已写入的 filler，得到无补偿基础高度。
 * 可见布局禁止先把 filler 置 0 再测；改用本式推导。
 */
function computeScrollHeightWithoutFiller(actualScrollHeight, currentFillerHeight) {
  var a = Number(actualScrollHeight);
  var f = Number(currentFillerHeight);
  if (!Number.isFinite(a) || a < 0) a = 0;
  if (!Number.isFinite(f) || f < 0) f = 0;
  return Math.max(0, a - f);
}

/** 每 TAB filler 缓存骨架（register 对应页面「报名」；null=未缓存） */
function createEmptyFillerByTab() {
  return {
    info: null,
    standings: null,
    register: null,
    schedule: null,
    discussion: null
  };
}

/**
 * TAB 切换同帧预补偿：
 * - 有缓存：直接用缓存
 * - 无缓存：用 vh/target/tolerance 算安全上界（内容高度按 0），保证
 *   newMaxScrollTop >= min(currentScrollTop, targetStickyOffset)
 *   且具备滚到吸顶目标的能力；nextTick 后缩回精确值
 */
function computeProvisionalTabFiller(input) {
  var src = input && typeof input === 'object' ? input : {};
  if (src.cachedFiller != null && Number.isFinite(Number(src.cachedFiller))) {
    var cached = Number(src.cachedFiller);
    return cached < 0 ? 0 : Math.ceil(cached);
  }
  var vh = Number(src.viewportHeight);
  var scrollTop = Number(src.currentScrollTop);
  var required = Number(src.targetStickyOffset);
  var tol =
    src.tolerance == null ? SCROLL_FILLER_TOLERANCE_PX : Number(src.tolerance);
  if (!Number.isFinite(vh) || vh < 0) vh = 0;
  if (!Number.isFinite(scrollTop) || scrollTop < 0) scrollTop = 0;
  if (!Number.isFinite(required) || required < 0) required = 0;
  if (!Number.isFinite(tol) || tol < 0) tol = SCROLL_FILLER_TOLERANCE_PX;
  var needRetain = Math.min(scrollTop, required);
  var target = Math.max(required, needRetain);
  return computeStickyFiller({
    viewportHeight: vh,
    scrollHeightWithoutFiller: 0,
    targetStickyOffset: target,
    tolerance: tol
  });
}

/**
 * 阶段一：基于「无 filler 时的真实 scrollHeight」估算补偿
 * filler = max(0, ceil(viewport + target + tolerance - scrollHeightWithoutFiller))
 */
function computeStickyFiller(input) {
  var src = input && typeof input === 'object' ? input : {};
  var vh = Number(src.viewportHeight);
  var sh = Number(src.scrollHeightWithoutFiller);
  var target = Number(src.targetStickyOffset);
  var tol =
    src.tolerance == null ? SCROLL_FILLER_TOLERANCE_PX : Number(src.tolerance);
  if (!Number.isFinite(vh) || vh < 0) vh = 0;
  if (!Number.isFinite(sh) || sh < 0) sh = 0;
  if (!Number.isFinite(target) || target < 0) target = 0;
  if (!Number.isFinite(tol) || tol < 0) tol = SCROLL_FILLER_TOLERANCE_PX;
  return Math.max(0, Math.ceil(vh + target + tol - sh));
}

/**
 * 阶段二：写入 filler 后按真实 scrollHeight 复核缺口，最多一次纠正
 */
function computeFillerCorrection(input) {
  var src = input && typeof input === 'object' ? input : {};
  var vh = Number(src.viewportHeight);
  var actualSh = Number(src.actualScrollHeight);
  var target = Number(src.targetStickyOffset);
  var current = Number(src.currentFillerHeight);
  var tol =
    src.tolerance == null ? SCROLL_FILLER_TOLERANCE_PX : Number(src.tolerance);
  if (!Number.isFinite(vh) || vh < 0) vh = 0;
  if (!Number.isFinite(actualSh) || actualSh < 0) actualSh = 0;
  if (!Number.isFinite(target) || target < 0) target = 0;
  if (!Number.isFinite(current) || current < 0) current = 0;
  if (!Number.isFinite(tol) || tol < 0) tol = SCROLL_FILLER_TOLERANCE_PX;
  var actualMaxScrollTop = Math.max(0, actualSh - vh);
  var shortfall = target + tol - actualMaxScrollTop;
  if (!(shortfall > 0)) {
    return {
      actualMaxScrollTop: actualMaxScrollTop,
      shortfall: 0,
      correctedFillerHeight: current,
      satisfies: actualMaxScrollTop + 1e-6 >= target + tol
    };
  }
  return {
    actualMaxScrollTop: actualMaxScrollTop,
    shortfall: shortfall,
    correctedFillerHeight: current + Math.ceil(shortfall),
    satisfies: false
  };
}

/**
 * ST-JUMP-4：吸顶切轮保护高度只升不降。
 * 未吸顶不启用（调用方不传入）；释放走 _releaseStandingsContentHostHold。
 */
function computeStickyContentHostHoldMinHeight(currentMin, measuredHeight) {
  var cur = Number(currentMin);
  var measured = Number(measuredHeight);
  if (!Number.isFinite(cur) || cur < 0) cur = 0;
  if (!Number.isFinite(measured) || measured < 0) measured = 0;
  return Math.max(cur, measured);
}

/** @deprecated 兼容旧名：scrollHeightWithoutFiller 作为第三参 */
function computeSeriesScrollFillerHeight(
  viewportHeight,
  targetStickyOffset,
  scrollHeightWithoutFiller,
  tolerancePx
) {
  return computeStickyFiller({
    viewportHeight: viewportHeight,
    targetStickyOffset: targetStickyOffset,
    scrollHeightWithoutFiller: scrollHeightWithoutFiller,
    tolerance: tolerancePx
  });
}

function calcIsStickyRoundSelector(opts) {
  var o = opts || {};
  var isStandings = o.activeTab === 'standings';
  var isSchedule = o.activeTab === 'schedule';
  if (!isStandings && !isSchedule) return false;
  if (isStandings && !o.standingsAvailable) return false;
  if (isSchedule && !o.scheduleAvailable) return false;
  if (!o.isStickyTab) return false;
  var off = Number(o.roundSelectorOffsetTop);
  if (!Number.isFinite(off) || off <= 0) return false;
  var threshold =
    o.secondaryThreshold != null
      ? Number(o.secondaryThreshold)
      : computeSecondaryStickyThreshold(
          off,
          o.stickyRoundSelectorTop,
          o.scrollRectTop
        );
  if (!Number.isFinite(threshold) || threshold < 0) threshold = 0;
  var scrollTop = Number(o.scrollTop);
  if (!Number.isFinite(scrollTop)) scrollTop = 0;
  return scrollTop >= threshold;
}

function scheduleHasRounds(schedule) {
  var items =
    schedule && Array.isArray(schedule.roundSelector)
      ? schedule.roundSelector
      : schedule && Array.isArray(schedule.roundSelectorItems)
        ? schedule.roundSelectorItems
        : [];
  return items.length > 0;
}

function readRoundDockEventKey(e) {
  var detail = e && e.detail ? e.detail : {};
  var key = detail.key != null ? String(detail.key).trim() : '';
  if (key) return key;
  var ds =
    e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset : {};
  return ds.key != null ? String(ds.key).trim() : '';
}

function deepCloneJson(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

/** 报名扩展区二级吸顶：与总榜 dock 同一公式族，offset 用 registerExtOffsetTop */
function calcIsStickyRegisterExt(opts) {
  var o = opts || {};
  if (o.activeTab !== 'register') return false;
  if (!o.isStickyTab) return false;
  var off = Number(o.registerExtOffsetTop);
  if (!Number.isFinite(off) || off <= 0) return false;
  var threshold =
    o.secondaryThreshold != null
      ? Number(o.secondaryThreshold)
      : computeSecondaryStickyThreshold(
          off,
          o.stickyRoundSelectorTop,
          o.scrollRectTop
        );
  if (!Number.isFinite(threshold) || threshold < 0) threshold = 0;
  var scrollTop = Number(o.scrollTop);
  if (!Number.isFinite(scrollTop)) scrollTop = 0;
  return scrollTop >= threshold;
}

var SELF_CANCEL_CTA_FINALIZED = '已有完赛成绩，不可取消报名';
var SERIES_ADMIN_REMOVE_FINALIZED = '已有完赛成绩，不可删除';

function bumpAdminPlayerRemoveToken(current) {
  var n = Number(current);
  if (!Number.isFinite(n) || n < 0) n = 0;
  return n + 1;
}

function canApplyAdminPlayerRemoveResult(currentToken, applyToken) {
  return Number(currentToken) === Number(applyToken);
}

function projectSeriesAdminRemovalInspect(inspect) {
  var blocked = inspect && inspect.blockedReason != null
    ? String(inspect.blockedReason)
    : '';
  if (inspect && inspect.ok && !blocked) {
    return {
      seriesRemovalLocked: false,
      seriesRemovalReason: '',
      seriesRemovalMessage: ''
    };
  }
  if (blocked === 'finalized_score') {
    return {
      seriesRemovalLocked: true,
      seriesRemovalReason: 'finalized_score',
      seriesRemovalMessage: SERIES_ADMIN_REMOVE_FINALIZED
    };
  }
  if (blocked === 'managed_station_invalid') {
    return {
      seriesRemovalLocked: true,
      seriesRemovalReason: 'managed_station_invalid',
      seriesRemovalMessage: seriesStationManageGate.GATE_FAIL_MESSAGE
    };
  }
  return {
    seriesRemovalLocked: true,
    seriesRemovalReason: blocked || 'inspect_failed',
    seriesRemovalMessage:
      blocked === 'permission_denied'
        ? '暂无管理权限'
        : '报名状态已变化，请重新操作'
  };
}

function buildSeriesPlayerManageRosterSnapshot(roster, seriesId, actorUserId, inspectFn) {
  var list = Array.isArray(roster) ? roster : [];
  var out = [];
  var i;
  for (i = 0; i < list.length; i++) {
    var entry = list[i];
    if (!entry || typeof entry !== 'object') continue;
    var playerId = String(entry.playerId || entry.userId || '').trim();
    var rosterEntryId = String(entry.rosterEntryId || '').trim();
    var status = String(entry.registrationStatus || '').trim();
    if (status !== 'registered' || !playerId || !rosterEntryId) {
      out.push(
        Object.assign({}, entry, {
          seriesRemovalLocked: true,
          seriesRemovalReason: 'not_registered',
          seriesRemovalMessage: '报名状态已变化，请重新操作'
        })
      );
      continue;
    }
    var inspect =
      typeof inspectFn === 'function'
        ? inspectFn({
            seriesId: String(seriesId || ''),
            playerId: playerId,
            rosterEntryId: rosterEntryId,
            actorUserId: String(actorUserId || '')
          })
        : { ok: false, blockedReason: 'inspect_failed' };
    out.push(Object.assign({}, entry, projectSeriesAdminRemovalInspect(inspect)));
  }
  return out;
}

function hasActiveSelfRegistration(register) {
  var cur = register && register.currentUserRegistration;
  if (!cur || typeof cur !== 'object') return false;
  var pid = cur.playerId != null ? String(cur.playerId).trim() : '';
  return !!(cur.isRegistered && pid);
}

function bumpSelfCancelInspectToken(current) {
  var n = Number(current);
  if (!Number.isFinite(n) || n < 0) n = 0;
  return n + 1;
}

function canApplySelfCancelInspect(currentToken, applyToken) {
  return Number(currentToken) === Number(applyToken);
}

function isActiveProxyRegistrationByActor(user, actorUserId) {
  if (!user || typeof user !== 'object') return false;
  if (String(user.registrationStatus || '').trim() !== 'registered') return false;
  var source = String(user.registrationSource || user.source || '').trim();
  if (source !== 'proxy') return false;
  var by = String(user.registeredBy || user.registeredByUserId || '').trim();
  if (!by || by !== String(actorUserId || '').trim()) return false;
  if (String(user.registrationState || '').trim() === 'registered_locked') return false;
  return true;
}

function projectProxyCancelLockUser(user, inspect) {
  var blocked = inspect && inspect.blockedReason != null
    ? String(inspect.blockedReason)
    : '';
  if (blocked !== 'finalized_score' && blocked !== 'managed_station_invalid') {
    return user;
  }
  var message =
    blocked === 'finalized_score'
      ? SELF_CANCEL_CTA_FINALIZED
      : seriesStationManageGate.GATE_FAIL_MESSAGE;
  return Object.assign({}, user, {
    selected: true,
    locked: true,
    disabled: true,
    canSelfCancel: false,
    registrationState: 'registered_locked',
    source: 'self',
    registrationSource: 'self',
    lockReason: blocked,
    lockMessage: message
  });
}

function projectProxyRegisterUsersWithCancelLocks(users, actorUserId, seriesId, inspectFn) {
  var list = Array.isArray(users) ? users : [];
  if (typeof inspectFn !== 'function') return list;
  var out = [];
  var i;
  for (i = 0; i < list.length; i++) {
    var user = list[i];
    if (!isActiveProxyRegistrationByActor(user, actorUserId)) {
      out.push(user);
      continue;
    }
    var inspect = inspectFn({
      seriesId: String(seriesId || ''),
      playerId: String((user && (user.playerId || user.userId)) || ''),
      rosterEntryId: String((user && user.rosterEntryId) || ''),
      actorUserId: String(actorUserId || '')
    });
    out.push(projectProxyCancelLockUser(user, inspect));
  }
  return out;
}

function resolveSelfCancelLockCta(currentCta, inspect) {
  var cta = currentCta && typeof currentCta === 'object' ? currentCta : {};
  var blocked = inspect && inspect.blockedReason != null
    ? String(inspect.blockedReason)
    : '';
  if (blocked === 'finalized_score') {
    return {
      label: SELF_CANCEL_CTA_FINALIZED,
      disabled: true,
      action: 'none'
    };
  }
  if (blocked === 'managed_station_invalid') {
    return {
      label: registrationInteractionModel.resolveRegistrationCtaCopy('cancel'),
      disabled: true,
      action: 'none',
      reason: 'managed_station_invalid',
      message: seriesStationManageGate.GATE_FAIL_MESSAGE
    };
  }
  return {
    label: cta.label,
    disabled: !!cta.disabled,
    action: cta.action || ''
  };
}

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    headerTotalHeight: 92,
    tabOffsetTop: 0,
    primaryTabHeight: 0,
    isStickyTab: false,
    // 底部固定控件：复刻 detail._calcHideRegisterCTA + wx:if（C3-D）
    showRegisterBottomAction: false,
    showScheduleBottomAction: false,
    scheduleQuickEntryVisible: false,
    showDiscussionInput: false,
    discussionShowInputBar: false,
    hideBottomCta: false,
    tabShowLeftIndicator: false,
    tabShowRightIndicator: false,
    tabHScrollLeft: 0,
    roundSelectorOffsetTop: 0,
    stickyRoundSelectorTop: 0,
    scrollRectTop: 0,
    isStickyRoundSelector: false,
    roundSelectorScrollLeft: 0,
    registerExtOffsetTop: 0,
    isStickyRegisterExt: false,
    registerSubTabScrollLeft: 0,
    rosterMinHeight: 0,
    expandedStandingsTeamId: '',
    /** 总榜正文壳保护高度（仅页面态；吸顶切轮同帧持有，解吸顶后释放） */
    contentHostMinHeight: 0,
    // 总榜 R 轮球员行内展开（对齐 detail.toggleScorecard；轻量态，不重建 standings）
    openStandingsScorecardKey: '',
    openStandingsScorecard: null,
    standingsScorecardEmptyLabel: '',
    standingsScorecardCourseTitle: '',
    standingsScorecardAdImage: '',
    standingsScorecardPlayer: null,
    standingsScoreDisplayMode: 'gross',
    standingsScorecardAvatarBadge: 'none',
    standingsScorecardMetaMode: 'handicapFloat',
    standingsScorecardShowNameGender: true,
    standingsScorecardFollowed: false,
    standingsScorecardRelationStatus: 'none',
    standingsScorecardRelationLabel: '',
    standingsScorecardCanFollow: false,
    standingsScorecardFollowLoading: false,
    standingsScorecardIsSelf: false,
    standingsScorePanel: '',
    standingsTeamGroupLogoById: {},
    scrollFillerHeight: 0,
    scrollYState: 0,
    loadError: '',
    seriesId: '',
    preview: false,
    // pending|locked|open|unlocked；仅 open/unlocked 渲染业务内容
    accessGate: 'pending',
    accessContentReady: false,
    seriesManageFabVisible: false,
    moreFabExpanded: false,
    moreFabDragging: false,
    moreFabHitTarget: false,
    fabTopPx: 0,
    fabStyle: '',
    showMoreSheet: false,
    /** C3-Z：M 一级/二级任一打开时为 true；强制关闭 TAB 底栏交互 */
    isManageOverlayActive: false,
    // 权限管理共享组件（冻结 matchId / 轮次副标题）
    tempAdminSheetVisible: false,
    tempAdminSheetMatchId: '',
    tempAdminSheetRoundSubtitle: '',
    // 选手管理共享组件（冻结 matchId / 轮次副标题；名单来自正式分组）
    playerManageSheetVisible: false,
    playerManageSheetMatchId: '',
    playerManageSheetRoundSubtitle: '',
    playerManageRosterSnapshot: [],
    playerManageRemoving: false,
    // 出发管理共享组件（冻结 matchId / 轮次副标题）
    teeSheetManageSheetVisible: false,
    teeSheetManageSheetMatchId: '',
    teeSheetManageSheetRoundSubtitle: '',
    // 收费管理共享组件（grouped_players → paymentByUserId）
    paymentManageSheetVisible: false,
    paymentManageSheetMatchId: '',
    paymentManageSheetRoundSubtitle: '',
    paymentManageSheetSeriesId: '',
    paymentManageSheetRoundId: '',
    paymentManageRosterSnapshot: [],
    // 修改半场：共享 half-course-sheet（冻结 matchId / 轮次副标题；不跳转 detail）
    halfSheetVisible: false,
    halfSheetMatchId: '',
    halfSheetRoundSubtitle: '',
    manageRoundPicker: { items: [], suggestedRoundId: '', emptyText: '' },
    manageRoundPickerScrollLeft: 0,
    manageRoundShowLeftIndicator: false,
    manageRoundShowRightIndicator: false,
    seriesManageCanManage: false,
    seriesManageShowRound: false,
    seriesManageFeaturesCommon: [],
    seriesManageFeaturesManage: [],
    seriesManageFeaturesDanger: [],
    roundViewSection: {
      hasSelection: false,
      gateOk: false,
      gateMessage: '',
      headline: '',
      summaryLine: '',
      features: []
    },
    roundManageSection: {
      hasSelection: false,
      gateOk: false,
      gateMessage: '',
      placeholder: '请选择需要管理的轮次',
      headline: '',
      summaryLine: '',
      featuresCommon: [],
      featuresPermission: [],
      featuresPermissionFooterPad: [],
      featuresPermissionFooter: [],
      lifecycleActions: [],
      featuresSectionCommonMain: '',
      featuresSectionCommonSub: '',
      featuresSectionPermissionMain: '',
      featuresSectionPermissionSub: ''
    },
    // 领先榜视图选择（页面实例态；不写 storage）
    showLeaderboardSettingSheet: false,
    leaderboardSettingSubtitle: '',
    leaderboardSettingSections: [],
    leaderboardSettingDraftValues: {},
    leaderboardNetScoreAvailable: false,
    _leaderboardSettingRoundId: '',
    registerSheetMode: 'self',
    registerSheetTitle: registerViewModel.SERIES_SELF_REGISTER_SHEET_TITLE,
    registerSheetSub: registerViewModel.SERIES_SELF_REGISTER_SHEET_SUB,
    activeTab: DEFAULT_TAB,
    scrollTop: 0,
    tabs: viewModel.SERIES_TABS.slice(),
    standingsDockIntoView: '',
    scheduleDockIntoView: '',
    seriesName: '',
    lifecycleLabel: '',
    isDraftPreview: false,
    isHistorical: false,
    competitionPhaseLabel: '',
    templateLabel: '',
    host: {},
    hero: {
      bannerImage: '',
      logo: '',
      chipText: '',
      chipTone: 'default',
      dateText: '',
      dateTone: 'default',
      dateRangeSizeClass: '',
      entryContext: '',
      isLive: false,
      titleMain: '',
      titleSub: '',
      metaChips: [],
      infoRows: [],
      participantDisplay: {
        mode: 'team_logos',
        label: '球队',
        teamItems: [],
        divisionItems: [],
        emptyText: ''
      },
      courseLines: [],
      coursePending: true,
      dividerText: '',
      hasParticipantList: false,
      participantSummaryOnly: ''
    },
    heroTeamLogoStack: {
      visible: false,
      stackWidthPx: 0,
      logoSizePx: 0,
      items: []
    },
    participants: { kindLabel: '参赛主体', summaryText: '', items: [] },
    scoring: {},
    visibility: {},
    eventInfoList: [],
    partner: { configured: false, hasLogos: false, partnerTitle: '', partnerLogoRows: [] },
    roundCards: [],
    standings: {
      available: false,
      totalSelector: {
        key: 'cumulative',
        label: 'TOT',
        statusToken: 'none',
        isLive: false,
        isSelected: true,
        showLiveBadge: false
      },
      roundSelectorItems: [],
      roundSelector: [],
      roundSelectorMode: 'dropdown',
      teamRows: [],
      unavailableTitle: '',
      unavailableMessage: ''
    },
    standingsEmpty: {},
    register: registerViewModel.emptyRegisterViewModel(),
    // 讨论区：页面会话（seriesId 房间），不持久化、不写 store
    discussionChat: [],
    discussionWatchers: [],
    discussionCanSpeak: false,
    discussionInputDisabled: true,
    discussionInputPlaceholder: '发布后开放讨论',
    discussionSelfAvatar: '',
    discussionPanelMinHeight: 0,
    fontScale: 'normal',
    registerSheetVisible: false,
    registerSheetParticipantId: '',
    registerSheetOptions: [],
    registerSheetGroupLabel: '选择球队',
    registerCompetitionNameDraft: '',
    registerGenderDraft: '',
    registerPhone: '',
    registerSubmitting: false,
    registerCancelModalVisible: false,
    registerCancelModalTitle: REG_SELF_CANCEL_UNGROUPED.title,
    registerCancelModalDesc: REG_SELF_CANCEL_UNGROUPED.desc,
    registerCancelModalCancelText: REG_SELF_CANCEL_UNGROUPED.cancelText,
    registerCancelModalConfirmText: REG_SELF_CANCEL_UNGROUPED.confirmText,
    registerCancelSubmitting: false,
    // 替他人报名（复刻队际赛多步 sheet；只写 Series.roster）
    registerForOtherSheetVisible: false,
    registerForOtherSourceOptions: seriesProxyRegisterViewModel.SERIES_REGISTER_FOR_OTHER_SOURCE_OPTIONS.slice(),
    registerForOtherManualVisible: false,
    registerForOtherManualName: '',
    registerForOtherManualPhone: '',
    registerForOtherManualGender: 'male',
    proxyGroupSheetVisible: false,
    proxyGroupOptions: [],
    proxyGroupId: '',
    proxyGroupSheetTitle: '选择报名球队',
    proxyGroupSheetSub: '本次选择的选手将统一报名到同一个球队',
    proxyRegistrationFieldLabel: '报名球队',
    proxyMemberSourceDisplayName: '',
    proxyMemberSourceSheetVisible: false,
    proxyMemberSourceOptions: [],
    proxyMemberSourceGroupId: '',
    pendingProxyPlayers: [],
    schedule: scheduleViewModel.emptyScheduleViewModel(),
    scheduleRoundSelectorScrollLeft: 0
  },

  _seriesId: '',
  _preview: false,
  _scrollTop: 0,
  _activeTab: DEFAULT_TAB,
  _roundNavById: null,
  _skipScrollReset: false,
  _onWindowResize: null,
  _heroLogoLayoutTimer: null,
  _heroLogoFitKey: '',
  _heroLogoLayoutRevision: 0,
  _heroLogoContainerWidth: 0,
  _heroTeamLogosRaw: null,
  _fillerMeasureTimer: null,
  _fillerMeasureToken: 0,
  _pageAlive: true,
  _skipRoundHScrollSync: false,
  _lastRoundSelectorScrollLeft: 0,
  _skipRegisterSubTabHScrollSync: false,
  _lastRegisterSubTabScrollLeft: 0,
  _skipScheduleSubTabHScrollSync: false,
  _lastScheduleScrollLeft: 0,
  _lastTabScrollLeft: 0,
  _lastTabScrollWidth: 0,
  _tabContainerWidth: 0,
  _rosterMeasureToken: 0,
  _standingsSelectedKey: standingsViewModel.CUMULATIVE_KEY,
  /** @type {Object.<string, string>} 兼容旧字符串 view（仅页面生命周期） */
  _standingsViewByRoundId: null,
  /** @type {Object.<string, {view:string,scoreType:string}>} 每轮会话选择 */
  _standingsSelectionByRoundId: null,
  _leaderboardSettingRoundId: '',
  _scheduleSelectedKey: '',
  _scheduleWriteLock: false,
  _scheduleGroupEditorNavLock: false,
  _lastSeriesForStandings: null,
  _lastStandingsBaseVm: null,
  _standingsPersonalOpenIndex: -1,
  _frozenPersonalBoardMatch: null,
  _cachedStandingsResult: null,
  _lastStandingsRoundStates: null,
  _lastSeriesForRegister: null,
  _lastSeriesForSchedule: null,
  _lastRegisterAccess: null,
  _registerActiveParticipantId: '',
  _discussionRoomSeriesId: '',
  _discussionChat: null,
  _scrollLayoutAnchor: null,
  _standingsExpandTapLocked: false,
  _standingsExpandMeasureToken: 0,
  _standingsCollapseScrollGuard: null,
  _fillerByTab: null,
  _lastViewportHeight: 0,
  _registerWriteLock: false,
  _registerRenderEpoch: 0,
  _registrationService: null,
  _selfCancelOrchestrator: null,
  _lastEligibility: null,
  _resolvedPlayerId: '',
  _proxyPickChannel: '',
  _proxyMemberSourceGroupId: '',
  _proxyMemberSourceTeamId: '',
  _proxyMemberSourceTeamName: '',
  _pendingProxyPlayers: null,
  _seriesProxyCommitPlan: null,

  onLoad: function (query) {
    var q = query || {};
    this._pageAlive = true;
    this._heroLogoLayoutRevision = 0;
    this._heroLogoContainerWidth = 0;
    this._heroLogoFitKey = '';
    this._heroTeamLogosRaw = [];
    this._fillerMeasureToken = 0;
    this._standingsHostHoldToken = 0;
    this._lastStandingsContentHostHeight = 0;
    this._lastRoundDockHeight = 0;
    this._standingsExpandTapLocked = false;
    this._standingsExpandMeasureToken = 0;
    this._standingsCollapseScrollGuard = null;
    this._fillerByTab = createEmptyFillerByTab();
    this._lastViewportHeight = 0;
    this._skipRegisterSubTabHScrollSync = false;
    this._lastRegisterSubTabScrollLeft = 0;
    this._skipScheduleSubTabHScrollSync = false;
    this._lastScheduleScrollLeft = 0;
    this._lastTabScrollLeft = 0;
    this._lastTabScrollWidth = 0;
    this._tabContainerWidth = 0;
    this._rosterMeasureToken = 0;
    this._registerWriteLock = false;
    this._scheduleWriteLock = false;
    this._scheduleSelectedKey = '';
    this._scheduleVisited = false;
    this._scheduleUserPicked = false;
    this._standingsVisited = false;
    this._standingsUserPicked = false;
    this._lastEligibility = null;
    this._resolvedPlayerId = '';
    this._seriesId = q.seriesId != null ? String(q.seriesId).trim() : '';
    this._preview = q.preview === '1' || q.preview === 1 || q.preview === true;
    var tabQ = q.tab != null ? String(q.tab).trim() : '';
    var fromQ = q.from != null ? String(q.from).trim() : '';
    this._activeTab = ALLOWED_TABS[tabQ] ? tabQ : DEFAULT_TAB;
    this._heroEntryContext =
      fromQ === 'registration' || tabQ === 'register' ? 'registration' : 'plaza';
    if (this._activeTab === 'standings') this._standingsVisited = true;
    if (this._activeTab === 'schedule') this._scheduleVisited = true;
    this._accessUnlocked = false;
    this._expectedAccessCode = null;
    this._accessPromptOpen = false;
    this._scrollTop = 0;
    this._scrollLayoutAnchor = null;
    this._roundNavById = Object.create(null);
    this._standingsSelectedKey = '';
    this._standingsViewByRoundId = Object.create(null);
    this._standingsSelectionByRoundId = Object.create(null);
    this._leaderboardSettingRoundId = '';
    this._lastSeriesForStandings = null;
    this._lastStandingsBaseVm = null;
    this._standingsPersonalOpenIndex = -1;
    this._frozenPersonalBoardMatch = null;
    this._cachedStandingsResult = standingsViewModel.emptyStandingsResult();
    this._lastStandingsRoundStates = null;
    this._lastSeriesForRegister = null;
    this._lastSeriesForSchedule = null;
    this._lastRegisterAccess = null;
    this._registerActiveParticipantId = '';
    this._discussionRoomSeriesId = '';
    this._discussionChat = [];
    this._manageSelectedRoundId = '';
    this._manageSelectedMatchId = '';
    this._tempAdminFrozen = null;
    this._tempAdminSheetOpening = false;
    this._playerManageFrozen = null;
    this._playerManageSheetOpening = false;
    this._adminPlayerRemoveLock = false;
    this._adminPlayerRemoveToken = 0;
    this._teeSheetManageFrozen = null;
    this._teeSheetManageSheetOpening = false;
    this._paymentManageFrozen = null;
    this._paymentManageSheetOpening = false;
    this._halfFrozen = null;
    this._halfSheetOpening = false;
    this._fabDrag = null;
    this._fabMovedAt = 0;
    this._fabHitZones = [];
    // B1 service：onLoad 装配一次；onShow 只刷新数据，不重建
    this._registrationService = seriesRegistration.createSeriesRegistrationService({
      seriesStore: seriesStore,
      resolveEligibleParticipantIds: function (ctx) {
        return seriesRegisterEligibility.resolveEligibleParticipantIdsForService(ctx);
      },
      canManageRegistration: function (ctx) {
        var series = ctx && ctx.series ? ctx.series : null;
        var actor = (ctx && ctx.actor) || gameStore.getCurrentUser() || {};
        return {
          allowed: !!(
            series && seriesManageAccess.isSeriesHostPrivileged(series, actor)
          )
        };
      },
      // 普通 common 代报名：与报名开关管理权限分离
      canRegisterForOther: function (ctx) {
        var actor = (ctx && ctx.actor) || gameStore.getCurrentUser() || {};
        var uid = matchManageAccess.resolveUserId(actor);
        return {
          allowed: !!(
            uid && matchManageAccess.isCommonViewPermission('register_for_other')
          )
        };
      }
    });
    this._selfCancelOrchestrator =
      seriesSelfCancellationOrchestrator.createSeriesSelfCancellationOrchestrator({
        seriesStore: seriesStore,
        teamMatchStore: teamMatchStore,
        getIndexByMatchId: function (id) {
          return seriesStationIndex.getByMatchId(id);
        },
        registrationService: this._registrationService
      });
    this._selfCancelInspectToken = 0;
    this._registerRenderEpoch = 0;
    this._recoverInterruptedSelfCancellationOnce();
    this._pendingShareInvite = false;
    this._registerSheetMode = 'self';
    this.initHeaderNav();
    this.applyTheme();
    this._bindWindowResize();
    // 默认锁：验证前禁止业务区渲染（防 Hero/TAB 闪现）
    this.setData({
      seriesId: this._seriesId,
      preview: this._preview,
      activeTab: this._activeTab,
      accessGate: 'pending',
      accessContentReady: false,
      expandedStandingsTeamId: '',
      scrollTop: 0,
      isStickyTab: false,
      loadError: ''
    });
    this._beginAccessGateFlow();
  },

  onUnload: function () {
    this._pageAlive = false;
    this._heroLogoLayoutRevision = (this._heroLogoLayoutRevision || 0) + 1;
    this._manageSelectedRoundId = '';
    this._manageSelectedMatchId = '';
    this._tempAdminFrozen = null;
    this._tempAdminSheetOpening = false;
    this._playerManageFrozen = null;
    this._playerManageSheetOpening = false;
    this._adminPlayerRemoveLock = false;
    this._adminPlayerRemoveToken = bumpAdminPlayerRemoveToken(
      this._adminPlayerRemoveToken
    );
    this._teeSheetManageFrozen = null;
    this._teeSheetManageSheetOpening = false;
    this._paymentManageFrozen = null;
    this._paymentManageSheetOpening = false;
    this._halfFrozen = null;
    this._halfSheetOpening = false;
    this._pendingShareInvite = false;
    this._registerSheetMode = 'self';
    this._fillerMeasureToken = (this._fillerMeasureToken || 0) + 1;
    this._standingsExpandMeasureToken = (this._standingsExpandMeasureToken || 0) + 1;
    this._rosterMeasureToken = (this._rosterMeasureToken || 0) + 1;
    this._standingsExpandTapLocked = false;
    this._standingsCollapseScrollGuard = null;
    this._fillerByTab = createEmptyFillerByTab();
    this._registerWriteLock = false;
    this._selfCancelInspectToken = bumpSelfCancelInspectToken(this._selfCancelInspectToken);
    this._seriesProxyCommitPlan = null;
    this._scheduleWriteLock = false;
    this._unbindWindowResize();
    if (this._heroLogoLayoutTimer) {
      clearTimeout(this._heroLogoLayoutTimer);
      this._heroLogoLayoutTimer = null;
    }
    if (this._fillerMeasureTimer) {
      clearTimeout(this._fillerMeasureTimer);
      this._fillerMeasureTimer = null;
    }
  },

  onShow: function () {
    this.applyTheme();
    if (typeof wx !== 'undefined' && typeof wx.setPageOrientation === 'function') {
      try {
        wx.setPageOrientation({ orientation: 'portrait' });
      } catch (e) {
        /* ignore */
      }
    }
    // 未通过门闩前禁止刷新业务 VM（避免闪现）
    if (!this.data.isStickyRoundSelector) {
      this._releaseStandingsContentHostHold();
    }
    if (this._seriesId && this._canLoadBusinessContent()) {
      this.reloadViewModel({ resetScroll: false });
      this._consumeEditRoundReturnContext();
      this._consumeEditSeriesReturnContext();
      this._consumeGroupEditorReturnContext();
    }
  },

  /** 通用：从编辑页返回后恢复 TAB / 滚动 / 赛程或总榜选轮 */
  _applySeriesEditReturnContext: function (ctx, options) {
    if (!this._pageAlive || !ctx || typeof ctx !== 'object') return;
    var opts = options || {};
    var tab = String(ctx.activeTab || '').trim();
    if (tab && ALLOWED_TABS[tab] && tab !== this._activeTab) {
      this._performSwitchTab(tab);
    }
    if (opts.restoreManageRound) {
      var manageRoundId = String(ctx.manageSelectedRoundId || ctx.roundId || '').trim();
      if (manageRoundId) {
        this._manageSelectedRoundId = manageRoundId;
        if (typeof this._refreshSeriesManageSheet === 'function') {
          this._refreshSeriesManageSheet();
        }
      }
    }
    var scheduleKey = String(ctx.scheduleSelectedKey || '').trim();
    if (scheduleKey) {
      this._scheduleSelectedKey = scheduleKey;
      this._scheduleVisited = true;
      this._scheduleUserPicked = true;
    }
    var standingsKey = String(ctx.standingsSelectedKey || '').trim();
    if (standingsKey) {
      this._standingsSelectedKey = standingsKey;
      this._standingsVisited = true;
      this._standingsUserPicked = true;
    }
    var scrollTop = Number(ctx.scrollTop);
    if (Number.isFinite(scrollTop) && scrollTop >= 0) {
      this._scrollTop = scrollTop;
      this._safeSetData({ scrollTop: scrollTop, scrollYState: scrollTop });
    }
  },

  /** 编辑本轮返回：恢复 TAB / 管理选轮 / 滚动，不闪动整页 */
  _consumeEditRoundReturnContext: function () {
    if (!this._pageAlive) return;
    var ctx = null;
    try {
      if (typeof wx !== 'undefined' && typeof wx.getStorageSync === 'function') {
        ctx = wx.getStorageSync('gb_series_edit_round_return_v1');
      }
    } catch (eGet) {
      ctx = null;
    }
    if (!ctx || typeof ctx !== 'object') return;
    var sid = String(ctx.seriesId || '').trim();
    if (sid && sid !== String(this._seriesId || '').trim()) return;
    try {
      if (typeof wx !== 'undefined' && typeof wx.removeStorageSync === 'function') {
        wx.removeStorageSync('gb_series_edit_round_return_v1');
      }
    } catch (eRm) {
      /* ignore */
    }
    this._applySeriesEditReturnContext(ctx, { restoreManageRound: true });
  },

  /** 修改系列赛返回：恢复 TAB / 滚动 / 赛程与总榜选轮 */
  _consumeEditSeriesReturnContext: function () {
    if (!this._pageAlive) return;
    var ctx = null;
    try {
      if (typeof wx !== 'undefined' && typeof wx.getStorageSync === 'function') {
        ctx = wx.getStorageSync('gb_series_edit_series_return_v1');
      }
    } catch (eGet) {
      ctx = null;
    }
    if (!ctx || typeof ctx !== 'object') return;
    var sid = String(ctx.seriesId || '').trim();
    if (sid && sid !== String(this._seriesId || '').trim()) return;
    try {
      if (typeof wx !== 'undefined' && typeof wx.removeStorageSync === 'function') {
        wx.removeStorageSync('gb_series_edit_series_return_v1');
      }
    } catch (eRm) {
      /* ignore */
    }
    this._applySeriesEditReturnContext(ctx, { restoreManageRound: false });
  },

  /** group-editor 返回：停留赛程 TAB / 原轮次，刷新该轮分组并尽量保持滚动 */
  _consumeGroupEditorReturnContext: function () {
    if (!this._pageAlive) return;
    var ctx = null;
    try {
      if (typeof wx !== 'undefined' && typeof wx.getStorageSync === 'function') {
        ctx = wx.getStorageSync('gb_series_group_editor_return_v1');
      }
    } catch (eGet) {
      ctx = null;
    }
    if (!ctx || typeof ctx !== 'object') return;
    var sid = String(ctx.seriesId || '').trim();
    if (sid && sid !== String(this._seriesId || '').trim()) return;
    try {
      if (typeof wx !== 'undefined' && typeof wx.removeStorageSync === 'function') {
        wx.removeStorageSync('gb_series_group_editor_return_v1');
      }
    } catch (eRm) {
      /* ignore */
    }
    if (this._seriesId && typeof seriesStore.getSeriesById === 'function') {
      this._lastSeriesForSchedule =
        seriesStore.getSeriesById(this._seriesId) || this._lastSeriesForSchedule;
    }
    this._applySeriesEditReturnContext(ctx, { restoreManageRound: false });
    this._rebuildScheduleProjection();
  },

  _canLoadBusinessContent: function () {
    return (
      this._accessUnlocked === true ||
      seriesAccessGate.canRenderBusinessContent(this.data.accessGate)
    );
  },

  /**
   * 访问码门闩：对比只用实例内存中的原始码，永不 setData accessCode
   */
  _beginAccessGateFlow: function () {
    if (!this._pageAlive) return;
    if (!this._seriesId) {
      this._safeSetData({
        loadError: '缺少系列赛参数',
        accessGate: 'locked',
        accessContentReady: false
      });
      return;
    }
    var series = null;
    try {
      series = seriesStore.getSeriesById(this._seriesId);
    } catch (e) {
      series = null;
    }
    if (!series) {
      this._safeSetData({
        loadError: '无法加载系列赛',
        accessGate: 'locked',
        accessContentReady: false
      });
      return;
    }

    var decision = seriesAccessGate.decideAccessGate(series, { preview: this._preview });
    if (!decision.needVerify) {
      this._accessUnlocked = true;
      this._expectedAccessCode = null;
      this._safeSetData(
        {
          accessGate: 'open',
          accessContentReady: true,
          loadError: ''
        },
        function () {
          /* open 后由回调加载，避免竞态闪现 */
        }
      );
      this.reloadViewModel({ resetScroll: false });
      return;
    }

    // private：仅实例持有期望码
    this._accessUnlocked = false;
    this._expectedAccessCode =
      series.accessCode != null ? String(series.accessCode) : '';
    this._safeSetData({
      accessGate: 'locked',
      accessContentReady: false,
      loadError: ''
    });
    this._promptAccessCode();
  },

  _promptAccessCode: function () {
    if (!this._pageAlive) return;
    if (this._accessPromptOpen) return;
    if (typeof wx === 'undefined' || typeof wx.showModal !== 'function') {
      this._leaveAfterAccessCancel();
      return;
    }
    var self = this;
    this._accessPromptOpen = true;
    wx.showModal({
      title: '访问码验证',
      editable: true,
      placeholderText: '请输入访问码',
      confirmText: '确定',
      cancelText: '取消',
      success: function (res) {
        self._accessPromptOpen = false;
        if (!self._pageAlive) return;
        if (!res || res.cancel || res.confirm === false) {
          self._leaveAfterAccessCancel();
          return;
        }
        var input =
          res.content != null
            ? res.content
            : res.inputValue != null
              ? res.inputValue
              : '';
        var verified = seriesAccessGate.verifyAccessCode(
          self._expectedAccessCode,
          input
        );
        if (!verified.ok) {
          if (typeof wx.showToast === 'function') {
            wx.showToast({
              title: seriesAccessGate.wrongCodeMessage(),
              icon: 'none'
            });
          }
          setTimeout(function () {
            if (self._pageAlive && !self._accessUnlocked) {
              self._promptAccessCode();
            }
          }, 320);
          return;
        }
        self._accessUnlocked = true;
        self._expectedAccessCode = null;
        self._safeSetData(
          {
            accessGate: 'unlocked',
            accessContentReady: true,
            loadError: ''
          },
          function () {
            if (self._pageAlive) {
              self.reloadViewModel({ resetScroll: false });
            }
          }
        );
      },
      fail: function () {
        self._accessPromptOpen = false;
        if (self._pageAlive) self._leaveAfterAccessCancel();
      }
    });
  },

  _leaveAfterAccessCancel: function () {
    this._expectedAccessCode = null;
    var pages =
      typeof getCurrentPages === 'function' ? getCurrentPages() : null;
    var stackLen = pages && pages.length ? pages.length : 0;
    var nav = seriesAccessGate.resolveCancelNavigation({
      pageStackLength: stackLen
    });
    if (typeof wx === 'undefined') return;
    if (nav.action === 'navigateBack' && typeof wx.navigateBack === 'function') {
      wx.navigateBack({
        delta: 1,
        fail: function () {
          if (typeof wx.switchTab === 'function') {
            wx.switchTab({ url: '/pages/home/index' });
          }
        }
      });
      return;
    }
    if (typeof wx.switchTab === 'function') {
      wx.switchTab({ url: '/pages/home/index' });
    }
  },

  _bindWindowResize: function () {
    if (typeof wx === 'undefined' || typeof wx.onWindowResize !== 'function') return;
    var self = this;
    this._onWindowResize = function () {
      self._releaseStandingsContentHostHold();
      self._scheduleHeroTeamLogoLayout();
      self.scheduleScrollFillerMeasure();
      // resize 重测名单高度：不先归零，由 computeRosterMinHeight 的 token 防过期覆盖
      if (self._activeTab === 'register') {
        self.computeRosterMinHeight();
      }
      // 宽度变化后重测一级 TAB 横向溢出指示器（对齐 detail）
      if (typeof wx !== 'undefined' && typeof wx.nextTick === 'function') {
        wx.nextTick(function () {
          if (self._pageAlive) self.measureTabOverflow();
        });
      } else {
        setTimeout(function () {
          if (self._pageAlive) self.measureTabOverflow();
        }, 0);
      }
      if (self.data.showMoreSheet) {
        self._scheduleManageRoundOverflowMeasure();
      }
    };
    try {
      wx.onWindowResize(this._onWindowResize);
    } catch (e) {
      this._onWindowResize = null;
    }
  },

  _unbindWindowResize: function () {
    if (!this._onWindowResize) return;
    if (typeof wx !== 'undefined' && typeof wx.offWindowResize === 'function') {
      try {
        wx.offWindowResize(this._onWindowResize);
      } catch (e) {
        /* ignore */
      }
    }
    this._onWindowResize = null;
  },

  _rpxToPx: function (rpx) {
    var n = Number(rpx) || 0;
    var ww = 375;
    if (typeof wx !== 'undefined' && typeof wx.getWindowInfo === 'function') {
      try {
        var info = wx.getWindowInfo();
        if (info && Number.isFinite(info.windowWidth) && info.windowWidth > 0) {
          ww = info.windowWidth;
        }
      } catch (e) {
        /* ignore */
      }
    }
    return (n * ww) / 750;
  },

  _scheduleHeroTeamLogoLayout: function () {
    var self = this;
    if (this._heroLogoLayoutTimer) {
      clearTimeout(this._heroLogoLayoutTimer);
      this._heroLogoLayoutTimer = null;
    }
    var token = this._heroLogoLayoutRevision;
    var run = function () {
      self._heroLogoLayoutTimer = null;
      self._layoutHeroTeamLogoStack({ token: token });
    };
    if (typeof wx !== 'undefined' && typeof wx.nextTick === 'function') {
      wx.nextTick(run);
    } else {
      this._heroLogoLayoutTimer = setTimeout(run, 0);
    }
  },

  _resolveHeroTeamLogosRaw: function () {
    var hero = this.data.hero || {};
    var display = hero.participantDisplay || {};
    if (Array.isArray(display.teamItems) && display.teamItems.length) {
      return display.teamItems;
    }
    return Array.isArray(this._heroTeamLogosRaw) ? this._heroTeamLogosRaw : [];
  },

  /** 测量球队值区真实宽度后只更新布局字段（不改 Series/participants） */
  _layoutHeroTeamLogoStack: function (options) {
    var opts = options || {};
    var token = opts.token != null ? opts.token : this._heroLogoLayoutRevision;
    var retryUsed = !!opts.retryUsed;
    var hero = this.data.hero || {};
    var display = hero.participantDisplay || {};
    var teamItems = this._resolveHeroTeamLogosRaw();
    var seriesId = String(this._seriesId || '');
    var self = this;
    var logoSizePx = this._rpxToPx(HERO_LOGO_SIZE_RPX);
    var normalGapPx = this._rpxToPx(HERO_LOGO_GAP_RPX);

    var applyDecision = function (measuredWidth) {
      var decision = viewModel.resolveHeroTeamLogoReturnRestore({
        pageAlive: self._pageAlive,
        token: token,
        currentToken: self._heroLogoLayoutRevision,
        seriesId: seriesId,
        currentSeriesId: self._seriesId,
        mode: display.mode,
        emptyText: display.emptyText,
        teamItems: teamItems,
        measuredWidth: measuredWidth,
        retryUsed: retryUsed,
        logoDiameter: logoSizePx,
        normalGap: normalGapPx,
        cacheKey: self._heroLogoFitKey,
        currentStack: self.data.heroTeamLogoStack
      });
      if (decision.retry) {
        if (typeof wx !== 'undefined' && typeof wx.nextTick === 'function') {
          wx.nextTick(function () {
            if (!self._pageAlive) return;
            self._layoutHeroTeamLogoStack({ token: token, retryUsed: true });
          });
        } else {
          self._layoutHeroTeamLogoStack({ token: token, retryUsed: true });
        }
        return;
      }
      if (!decision.apply) return;
      if (decision.clearLogos) {
        self._heroLogoFitKey = 'hidden';
        self._heroTeamLogosRaw = [];
        self._safeSetData({
          heroTeamLogoStack: viewModel.emptyHeroTeamLogoStack()
        });
        return;
      }
      if (Number(measuredWidth) > 0) {
        self._heroLogoContainerWidth = measuredWidth;
      }
      self._heroLogoFitKey = decision.cacheKey || '';
      self._safeSetData({ heroTeamLogoStack: decision.stack }, function () {
        if (self._pageAlive) self.scheduleScrollFillerMeasure();
      });
    };

    if (display.mode !== 'team_logos' || !teamItems.length || display.emptyText) {
      applyDecision(0);
      return;
    }
    if (typeof wx === 'undefined' || typeof wx.createSelectorQuery !== 'function') {
      applyDecision(this._heroLogoContainerWidth || 0);
      return;
    }
    wx.createSelectorQuery()
      .in(this)
      .select('#hero-team-logo-value')
      .boundingClientRect(function (rect) {
        var availableWidth = rect && Number.isFinite(rect.width) ? rect.width : 0;
        applyDecision(availableWidth);
      })
      .exec();
  },

  initHeaderNav: function () {
    var header = createHeaderStyle();
    var headerTotalHeight =
      header && header.metrics && header.metrics.headerTotalHeight != null
        ? header.metrics.headerTotalHeight
        : 92;
    var primaryH = this.data.primaryTabHeight || 0;
    this.setData({
      headerRootStyle: header.headerRootStyle,
      headerBarStyle: header.headerBarStyle,
      headerTotalHeight: headerTotalHeight,
      stickyRoundSelectorTop: headerTotalHeight + primaryH
    });
  },

  _resolveThemeKey: function () {
    var app = typeof getApp === 'function' ? getApp() : null;
    var theme = 'bright';
    if (app && typeof app.getTheme === 'function') {
      theme = app.getTheme() || 'bright';
    }
    return theme === 'dark' ? 'dark' : 'bright';
  },

  applyTheme: function () {
    var theme = this._resolveThemeKey();
    this.setData({
      themeClass: theme === 'dark' ? 'dark-mode' : 'bright-mode'
    });
  },

  /**
   * 测量流内一级 TAB 偏移 + 真实高度；并刷新二级 top / 轮次阈值 / filler
   */
  measureTabTop: function () {
    var self = this;
    if (typeof this.createSelectorQuery !== 'function') return;
    var token = this._fillerMeasureToken || 0;
    this.createSelectorQuery()
      .select('.tab-scroll-wrap--inflow')
      .boundingClientRect()
      .select('.series-detail-scroll')
      .boundingClientRect()
      .select('.series-detail-scroll')
      .scrollOffset()
      .exec(function (res) {
        if (!self._pageAlive || token !== self._fillerMeasureToken) return;
        var tabRect = res && res[0];
        var scrollRect = res && res[1];
        var scrollOff = res && res[2];
        if (!tabRect || !scrollRect || !scrollOff) return;
        var top = tabRect.top - scrollRect.top + scrollOff.scrollTop;
        var primaryH = tabRect.height > 0 ? tabRect.height : self.data.primaryTabHeight || 0;
        var headerH = self.data.headerTotalHeight || 0;
        var stickyRoundTop = headerH + primaryH;
        var scrollRectTop =
          scrollRect.top != null && Number.isFinite(Number(scrollRect.top))
            ? Number(scrollRect.top)
            : 0;
        var patch = {
          primaryTabHeight: primaryH,
          stickyRoundSelectorTop: stickyRoundTop,
          scrollRectTop: scrollRectTop
        };
        if (top > 0) patch.tabOffsetTop = top;
        self.setData(patch, function () {
          if (!self._pageAlive || token !== self._fillerMeasureToken) return;
          self._syncStickyByScroll(scrollOff.scrollTop || 0);
          self.measureTabOverflow();
          if (self._activeTab === 'register') {
            if (self.data.isStickyRoundSelector) {
              self.setData({ isStickyRoundSelector: false });
            }
            self.measureRegisterExtTop();
          } else {
            self.measureRoundSelectorTop();
          }
        });
      });
  },

  /** 一级 TAB 横向溢出：复刻 detail measureTabOverflow */
  measureTabOverflow: function () {
    var self = this;
    if (!this._pageAlive || typeof this.createSelectorQuery !== 'function') return;
    this.createSelectorQuery()
      .select('.tab-scroll-wrap--inflow .gb-tabs')
      .boundingClientRect()
      .selectAll('.tab-scroll-wrap--inflow .tab-btn')
      .boundingClientRect()
      .exec(function (res) {
        if (!self._pageAlive) return;
        var container = res && res[0];
        var tabs = (res && res[1]) || [];
        if (!container) return;
        self._tabContainerWidth = container.width || 0;
        var scrollWidth = 0;
        for (var i = 0; i < tabs.length; i++) {
          scrollWidth += (tabs[i] && tabs[i].width) || 0;
        }
        if (scrollWidth > 0) self._lastTabScrollWidth = scrollWidth;
        var scrollLeft = self._lastTabScrollLeft || 0;
        var width = self._lastTabScrollWidth || scrollWidth;
        self._updateTabOverflowIndicators(scrollLeft, width);
      });
  },

  onTabHScroll: function (e) {
    var d = (e && e.detail) || {};
    var scrollLeft = d.scrollLeft || 0;
    var scrollWidth = d.scrollWidth || this._lastTabScrollWidth || 0;
    this._lastTabScrollLeft = scrollLeft;
    if (d.scrollWidth > 0) this._lastTabScrollWidth = d.scrollWidth;
    if (!this._tabContainerWidth) {
      this.measureTabOverflow();
      return;
    }
    this._updateTabOverflowIndicators(scrollLeft, scrollWidth);
  },

  _updateTabOverflowIndicators: function (scrollLeft, scrollWidth) {
    if (!this._pageAlive) return;
    var containerW = this._tabContainerWidth || 0;
    var left = Number(scrollLeft) || 0;
    var width = Number(scrollWidth) || 0;
    var showLeft = left > 0;
    var showRight =
      containerW > 0 && width > 0 && left + containerW < width - 2;
    if (
      showLeft !== this.data.tabShowLeftIndicator ||
      showRight !== this.data.tabShowRightIndicator
    ) {
      this.setData({
        tabShowLeftIndicator: showLeft,
        tabShowRightIndicator: showRight
      });
    }
  },

  /**
   * 测量完整流内二级 dock（含总榜轮信息行）相对滚动内容顶的偏移
   * stickyRoundSelectorTop 仍仅为 Header + 一级 TAB，不把信息行高度计入 fixed top
   * @param {function} [done]
   */
  measureRoundSelectorTop: function (done) {
    var self = this;
    var finish = function () {
      if (typeof done === 'function') done();
    };
    if (typeof this.createSelectorQuery !== 'function') {
      finish();
      return;
    }
    var token = this._fillerMeasureToken || 0;
    var standings = this.data.standings || {};
    var scheduleAvailable = scheduleHasRounds(this.data.schedule);
    var needMeasure =
      (this._activeTab === 'standings' && !!standings.available) ||
      (this._activeTab === 'schedule' && scheduleAvailable);
    if (!needMeasure) {
      if (
        this.data.roundSelectorOffsetTop !== 0 ||
        this.data.isStickyRoundSelector
      ) {
        this.setData(
          {
            roundSelectorOffsetTop: 0,
            isStickyRoundSelector: false
          },
          function () {
            if (!self._pageAlive || token !== self._fillerMeasureToken) {
              finish();
              return;
            }
            self.updateScrollFillerHeight();
            finish();
          }
        );
      } else {
        this.updateScrollFillerHeight();
        finish();
      }
      return;
    }
    this.createSelectorQuery()
      .select('.series-round-dock--inflow')
      .boundingClientRect()
      .select('.series-detail-scroll')
      .boundingClientRect()
      .select('.series-detail-scroll')
      .scrollOffset()
      .exec(function (res) {
        if (!self._pageAlive || token !== self._fillerMeasureToken) return;
        var rRect = res && res[0];
        var scrollRect = res && res[1];
        var scrollOff = res && res[2];
        if (!rRect || !scrollRect || !scrollOff || !(rRect.height > 0)) {
          self.updateScrollFillerHeight();
          finish();
          return;
        }
        self._lastRoundDockHeight = rRect.height;
        var top = rRect.top - scrollRect.top + scrollOff.scrollTop;
        if (!(top > 0)) {
          self.updateScrollFillerHeight();
          finish();
          return;
        }
        var scrollRectTop =
          scrollRect.top != null && Number.isFinite(Number(scrollRect.top))
            ? Number(scrollRect.top)
            : self.data.scrollRectTop || 0;
        self.setData(
          {
            roundSelectorOffsetTop: top,
            scrollRectTop: scrollRectTop
          },
          function () {
            if (!self._pageAlive || token !== self._fillerMeasureToken) return;
            self._syncStickyByScroll(scrollOff.scrollTop || 0);
            // 无损 filler：不先清零；基于更新后的真实 scrollHeight
            self.updateScrollFillerHeight();
            finish();
          }
        );
      });
  },

  /** 显隐与 filler 共用的二级阈值（内容坐标）；报名/总榜互斥取各自 offset */
  _getSecondaryStickyThreshold: function () {
    var offset =
      this._activeTab === 'register'
        ? this.data.registerExtOffsetTop
        : this.data.roundSelectorOffsetTop;
    return computeSecondaryStickyThreshold(
      offset,
      this.data.stickyRoundSelectorTop,
      this.data.scrollRectTop
    );
  },

  /**
   * rosterMinHeight = 窗口高 - HEADER - 主TAB - 报名扩展区 - CTA(或 safe) - gap
   * 仅页面态；重测不先归零；token 防过期回调覆盖
   */
  computeRosterMinHeight: function () {
    var self = this;
    if (this._activeTab !== 'register') return;
    if (typeof this.createSelectorQuery !== 'function') return;
    var token = (this._rosterMeasureToken || 0) + 1;
    this._rosterMeasureToken = token;
    var sys = { windowWidth: 375, windowHeight: 667 };
    var safeBottom = 0;
    try {
      var info = readSeriesDetailWindowLayout({ needSafeArea: true });
      if (info) {
        if (info.windowWidth != null) sys.windowWidth = info.windowWidth;
        if (info.windowHeight != null) sys.windowHeight = info.windowHeight;
        if (info.safeBottom != null) safeBottom = info.safeBottom;
      }
    } catch (e) {
      /* ignore */
    }
    var winH = sys.windowHeight || 667;
    var rpx2px = (sys.windowWidth || 375) / 750;
    this.createSelectorQuery()
      .in(this)
      .select('.gb-header')
      .boundingClientRect()
      .select('.tab-scroll-wrap--inflow')
      .boundingClientRect()
      .select('.register-ext-wrap--inflow')
      .boundingClientRect()
      .select('.register-cta-bar')
      .boundingClientRect()
      .exec(function (res) {
        if (
          !self._pageAlive ||
          token !== self._rosterMeasureToken ||
          self._activeTab !== 'register'
        ) {
          return;
        }
        res = res || [];
        var headerH =
          res[0] && res[0].height
            ? res[0].height
            : self.data.headerTotalHeight || 92;
        var mainTabH =
          res[1] && res[1].height
            ? res[1].height
            : self.data.primaryTabHeight || 50;
        var extH = res[2] && res[2].height ? res[2].height : 116 * rpx2px;
        var ctaH = res[3] && res[3].height ? res[3].height : 0;
        var bottomReserve = ctaH > 0 ? ctaH : safeBottom;
        var gap = 40 * rpx2px;
        var h = winH - headerH - mainTabH - extH - bottomReserve - gap;
        if (!(h > 0)) h = 0;
        h = Math.round(h);
        // 禁止先写 0 再写真值；仅在变化时更新
        if (h !== self.data.rosterMinHeight) {
          self.setData({ rosterMinHeight: h });
        }
      });
  },

  /**
   * 测量流内报名扩展区相对滚动内容顶部的偏移（二级吸顶用）
   * 同时触发 rosterMinHeight 重测（不归零）
   */
  measureRegisterExtTop: function () {
    var self = this;
    if (typeof this.createSelectorQuery !== 'function') return;
    var token = this._fillerMeasureToken || 0;
    if (this._activeTab !== 'register') {
      if (this.data.isStickyRegisterExt) {
        this.setData({ isStickyRegisterExt: false }, function () {
          if (!self._pageAlive || token !== self._fillerMeasureToken) return;
          self.updateScrollFillerHeight();
        });
      } else {
        this.updateScrollFillerHeight();
      }
      return;
    }
    this.computeRosterMinHeight();
    this.createSelectorQuery()
      .select('.register-ext-wrap--inflow')
      .boundingClientRect()
      .select('.series-detail-scroll')
      .boundingClientRect()
      .select('.series-detail-scroll')
      .scrollOffset()
      .exec(function (res) {
        if (!self._pageAlive || token !== self._fillerMeasureToken) return;
        var eRect = res && res[0];
        var scrollRect = res && res[1];
        var scrollOff = res && res[2];
        if (!eRect || !scrollRect || !scrollOff || !(eRect.height > 0)) {
          self.updateScrollFillerHeight();
          return;
        }
        var top = eRect.top - scrollRect.top + scrollOff.scrollTop;
        if (!(top > 0)) {
          self.updateScrollFillerHeight();
          return;
        }
        var scrollRectTop =
          scrollRect.top != null && Number.isFinite(Number(scrollRect.top))
            ? Number(scrollRect.top)
            : self.data.scrollRectTop || 0;
        self.setData(
          {
            registerExtOffsetTop: top,
            scrollRectTop: scrollRectTop
          },
          function () {
            if (!self._pageAlive || token !== self._fillerMeasureToken) return;
            self._syncStickyByScroll(scrollOff.scrollTop || 0);
            self.updateScrollFillerHeight();
          }
        );
      });
  },

  _resolveFillerTargetStickyOffset: function () {
    var standings = this.data.standings || {};
    return resolveFillerTargetStickyOffset(
      this._activeTab,
      !!standings.available,
      this.data.tabOffsetTop || 0,
      this._getSecondaryStickyThreshold(),
      scheduleHasRounds(this.data.schedule)
    );
  },

  /**
   * 两阶段短内容补偿（以 scroll-view 真实 scrollHeight 为准，不用 natural 预估冒充）
   * 阶段一：baseScrollHeight = actualScrollHeight - currentFiller → 一次写入 nextFiller
   * 阶段二：写入后复测 → shortfall>1 补缺口，或过高时按 base 重算一次（禁止可见归零）
   */
  updateScrollFillerHeight: function () {
    var self = this;
    if (!this._pageAlive) return;
    if (typeof this.createSelectorQuery !== 'function') return;
    var token = (this._fillerMeasureToken || 0) + 1;
    this._fillerMeasureToken = token;
    var measureTab = this._activeTab;

    function isStale() {
      return (
        !self._pageAlive ||
        token !== self._fillerMeasureToken ||
        self._activeTab !== measureTab
      );
    }

    function measureScrollMetrics(cb) {
      self
        .createSelectorQuery()
        .select('.series-detail-scroll')
        .boundingClientRect()
        .select('.series-detail-scroll')
        .scrollOffset()
        .exec(function (res) {
          if (isStale()) return;
          var view = res && res[0];
          var off = res && res[1];
          if (!view || !off) return;
          var vh = view.height || 0;
          if (vh > 0) self._lastViewportHeight = vh;
          cb({
            viewportHeight: vh,
            scrollHeight: off.scrollHeight != null ? Number(off.scrollHeight) : 0,
            scrollRectTop:
              view.top != null && Number.isFinite(Number(view.top))
                ? Number(view.top)
                : 0
          });
        });
    }

    function finishLayoutPass() {
      if (isStale()) return;
      self._cacheFillerForActiveTab(self.data.scrollFillerHeight || 0);
      self._restoreScrollLayoutAnchorIfNeeded();
    }

    function runPhaseTwo(viewportHeight, nextFiller, target) {
      if (isStale()) return;
      var applyInitial = nextFiller !== self.data.scrollFillerHeight;
      var afterApply = function () {
        if (isStale()) return;
        // 无吸顶目标时不必复核；长内容可直接降为 0（已在阶段一写入）
        if (!(target > 0)) {
          finishLayoutPass();
          return;
        }
        var tick = function () {
          if (isStale()) return;
          measureScrollMetrics(function (m2) {
            if (isStale()) return;
            var currentFiller = self.data.scrollFillerHeight || 0;
            var correction = computeFillerCorrection({
              viewportHeight: m2.viewportHeight || viewportHeight,
              actualScrollHeight: m2.scrollHeight,
              targetStickyOffset: target,
              currentFillerHeight: currentFiller,
              tolerance: SCROLL_FILLER_TOLERANCE_PX
            });
            // 最多一次纠正；shortfall>1 才补缺口；禁止再触发测量链
            if (
              correction.shortfall > 1 &&
              correction.correctedFillerHeight !== currentFiller
            ) {
              self.setData(
                { scrollFillerHeight: correction.correctedFillerHeight },
                finishLayoutPass
              );
              return;
            }
            // 过高：用 actual-current 重算基础高度，最多一次下调（含平滑降到 0）
            var baseSh = computeScrollHeightWithoutFiller(
              m2.scrollHeight,
              currentFiller
            );
            var recomputed = computeStickyFiller({
              viewportHeight: m2.viewportHeight || viewportHeight,
              scrollHeightWithoutFiller: baseSh,
              targetStickyOffset: target,
              tolerance: SCROLL_FILLER_TOLERANCE_PX
            });
            var vh = m2.viewportHeight || viewportHeight;
            var actualMax = Math.max(0, m2.scrollHeight - vh);
            var needMax = target + SCROLL_FILLER_TOLERANCE_PX;
            if (
              actualMax > needMax + 1 &&
              recomputed < currentFiller &&
              recomputed !== currentFiller
            ) {
              self.setData({ scrollFillerHeight: recomputed }, finishLayoutPass);
              return;
            }
            finishLayoutPass();
          });
        };
        if (typeof wx !== 'undefined' && typeof wx.nextTick === 'function') {
          wx.nextTick(tick);
        } else {
          setTimeout(tick, 0);
        }
      };
      if (applyInitial) {
        self.setData({ scrollFillerHeight: nextFiller }, afterApply);
      } else {
        afterApply();
      }
    }

    // 阶段一：不归零；从真实 scrollHeight 扣除当前 filler 得到基础高度
    measureScrollMetrics(function (m1) {
      if (isStale()) return;
      var continueWithTarget = function () {
        if (isStale()) return;
        var currentFiller = self.data.scrollFillerHeight || 0;
        var baseScrollHeight = computeScrollHeightWithoutFiller(
          m1.scrollHeight,
          currentFiller
        );
        var target = self._resolveFillerTargetStickyOffset();
        var nextFiller = computeStickyFiller({
          viewportHeight: m1.viewportHeight,
          scrollHeightWithoutFiller: baseScrollHeight,
          targetStickyOffset: target,
          tolerance: SCROLL_FILLER_TOLERANCE_PX
        });
        runPhaseTwo(m1.viewportHeight, nextFiller, target);
      };
      if (m1.scrollRectTop !== self.data.scrollRectTop) {
        self.setData({ scrollRectTop: m1.scrollRectTop }, continueWithTarget);
      } else {
        continueWithTarget();
      }
    });
  },

  /** 结构测量：Hero/TAB/图片等可能改变 offset 时全量重测 */
  scheduleScrollFillerMeasure: function () {
    var self = this;
    // 使旧 nextTick / query 回调失效，同一帧多次请求合并为一次
    this._fillerMeasureToken = (this._fillerMeasureToken || 0) + 1;
    if (this._fillerMeasureTimer) {
      clearTimeout(this._fillerMeasureTimer);
      this._fillerMeasureTimer = null;
    }
    this._fillerMeasureTimer = setTimeout(function () {
      self._fillerMeasureTimer = null;
      self.measureTabTop();
    }, 48);
  },

  /**
   * 内容高度测量：球队展开/收起等不改变 Hero/TAB/轮次 dock offset
   * 仅无损重算 filler，不跑 measureTabTop / measureRoundSelectorTop
   */
  scheduleStandingsContentFillerMeasure: function () {
    var self = this;
    this._fillerMeasureToken = (this._fillerMeasureToken || 0) + 1;
    if (this._fillerMeasureTimer) {
      clearTimeout(this._fillerMeasureTimer);
      this._fillerMeasureTimer = null;
    }
    this._fillerMeasureTimer = setTimeout(function () {
      self._fillerMeasureTimer = null;
      self.updateScrollFillerHeight();
    }, 48);
  },

  /**
   * 赛程 TAB 内容高度变化（切 LIVE Rx / 短出发表）：仅无损重算 filler。
   * 不重测 Hero/TAB/dock offset，不写 scrollTop，不清零当前 filler。
   */
  scheduleScheduleContentFillerMeasure: function () {
    if (!this._pageAlive) return;
    if (this._activeTab !== 'schedule') return;
    var self = this;
    this._fillerMeasureToken = (this._fillerMeasureToken || 0) + 1;
    var token = this._fillerMeasureToken;
    if (this._fillerMeasureTimer) {
      clearTimeout(this._fillerMeasureTimer);
      this._fillerMeasureTimer = null;
    }
    this._fillerMeasureTimer = setTimeout(function () {
      self._fillerMeasureTimer = null;
      if (!self._pageAlive || self._activeTab !== 'schedule') return;
      if (token !== self._fillerMeasureToken) return;
      self.updateScrollFillerHeight();
    }, 48);
  },

  /** 展开/收起前记录滚动锚点（不自动滚到被点球队） */
  _captureScrollLayoutAnchor: function () {
    var scrollTop = Number(this._scrollTop);
    if (!Number.isFinite(scrollTop) || scrollTop < 0) scrollTop = 0;
    var secondaryThreshold = this._getSecondaryStickyThreshold();
    var tabThreshold = this.data.tabOffsetTop || 0;
    var filler = this.data.scrollFillerHeight || 0;
    // 无实时 max 时：二级已吸顶且靠近阈值上方视作 near-bottom 短内容场景
    var wasNearBottom =
      !!this.data.isStickyRoundSelector &&
      secondaryThreshold > 0 &&
      scrollTop + 48 >= secondaryThreshold;
    this._scrollLayoutAnchor = {
      beforeScrollTop: scrollTop,
      beforeFillerHeight: filler,
      wasNearBottom: wasNearBottom,
      wasPrimarySticky: !!this.data.isStickyTab,
      wasSecondarySticky: !!this.data.isStickyRoundSelector,
      secondaryThreshold: secondaryThreshold,
      tabThreshold: tabThreshold,
      restored: false
    };
  },

  /**
   * 检测非预期 clamp / 二级吸顶丢失时恢复一次 scrollTop；禁止循环回写
   */
  _restoreScrollLayoutAnchorIfNeeded: function () {
    var a = this._scrollLayoutAnchor;
    if (!a || a.restored) return;
    var current = Number(this._scrollTop);
    if (!Number.isFinite(current) || current < 0) current = 0;
    var want = a.beforeScrollTop;
    if (a.wasSecondarySticky) {
      var th = this._getSecondaryStickyThreshold();
      if (!(th > 0)) th = a.secondaryThreshold || 0;
      if (th > 0) want = Math.max(want, th);
    } else if (a.wasPrimarySticky) {
      var tth = this.data.tabOffsetTop || a.tabThreshold || 0;
      if (tth > 0) want = Math.max(want, tth);
    }
    // 接近底部：保持吸顶位，不强制跳到新底部
    if (a.wasNearBottom && a.wasSecondarySticky) {
      var th2 = this._getSecondaryStickyThreshold();
      if (!(th2 > 0)) th2 = a.secondaryThreshold || 0;
      if (th2 > 0) want = Math.max(a.beforeScrollTop, th2);
    }
    var stickyLost =
      a.wasSecondarySticky && !this.data.isStickyRoundSelector;
    var clampedDown = current + 0.5 < a.beforeScrollTop;
    if (!stickyLost && !clampedDown) {
      this._syncStickyByScroll(current);
      return;
    }
    a.restored = true;
    this._scrollLayoutAnchor = a;
    if (Math.abs(current - want) < 0.5) {
      this._syncStickyByScroll(current);
      return;
    }
    var self = this;
    this._skipScrollReset = true;
    this._scrollTop = want;
    this.setData({ scrollTop: want }, function () {
      self._skipScrollReset = false;
      self._syncStickyByScroll(want);
    });
  },

  onScrollContentHeightChange: function () {
    this.scheduleScrollFillerMeasure();
  },

  /**
   * 统一底部 dock 可见性（报名 / 赛程 / 讨论）
   * 几何门闩镜像 detail._calcHideRegisterCTA；业务可展示仍由 register/schedule VM 决定。
   */
  _resolveBottomDockVisibilityPatch: function (scrollTop, isStickyTab, overrides) {
    var top = Number(scrollTop);
    if (!Number.isFinite(top) || top < 0) top = 0;
    var o = overrides && typeof overrides === 'object' ? overrides : {};
    var manageOverlay =
      o.isManageOverlayActive != null
        ? !!o.isManageOverlayActive
        : !!this.data.isManageOverlayActive;
    var dock = seriesBottomDockVisibility.resolveSeriesBottomDockVisibility({
      activeTab: this._activeTab || this.data.activeTab || '',
      scrollTop: top,
      isStickyTab: !!isStickyTab,
      tabOffsetTop: this.data.tabOffsetTop || 0,
      tabBarHeight: this.data.primaryTabHeight || 50,
      headerTotalHeight: this.data.headerTotalHeight || 92,
      screenHeight: this._fabWindowH || 667,
      isManageOverlayActive: manageOverlay,
      register: o.register != null ? o.register : this.data.register || {},
      schedule: o.schedule != null ? o.schedule : this.data.schedule || {},
      discussion:
        o.discussion != null
          ? o.discussion
          : { showInputBar: !!this.data.discussionShowInputBar }
    });
    return {
      hideBottomCta: dock.hideBottomCta,
      showRegisterBottomAction: dock.showRegisterBottomAction,
      showScheduleBottomAction: dock.showScheduleBottomAction,
      showDiscussionInput: dock.showDiscussionInput
    };
  },

  /** C3-Z：关 M 一级面板的数据补丁（不含 setData；供同帧开二级合并） */
  _buildCloseMoreSheetPatch: function () {
    this._clearManageRoundOverflowRuntime();
    return {
      showMoreSheet: false,
      moreFabExpanded: false,
      seriesManageCanManage: false,
      seriesManageShowRound: false,
      seriesManageFeaturesCommon: [],
      seriesManageFeaturesManage: [],
      seriesManageFeaturesDanger: [],
      manageRoundPicker: { items: [], suggestedRoundId: '', emptyText: '' },
      manageRoundPickerScrollLeft: 0,
      manageRoundShowLeftIndicator: false,
      manageRoundShowRightIndicator: false,
      roundViewSection: seriesManageSheetViewModel.emptyRoundViewSection(),
      roundManageSection: seriesManageSheetViewModel.emptyRoundSection()
    };
  },

  /**
   * C3-Z：写入弹层相关 patch，并同帧刷新 isManageOverlayActive + TAB 底栏显隐
   * 顺序保证：先算 overlay=true（或最终态）再落盘，避免关一级瞬间底栏闪现
   */
  _commitManageOverlayPatch: function (patchIn, cb) {
    var patch = patchIn && typeof patchIn === 'object' ? Object.assign({}, patchIn) : {};
    var active = seriesLayerStack.resolveIsManageOverlayActiveFromData(this.data, patch);
    patch.isManageOverlayActive = active;
    var dock = this._resolveBottomDockVisibilityPatch(
      this._scrollTop != null ? this._scrollTop : this.data.scrollYState || 0,
      !!this.data.isStickyTab,
      { isManageOverlayActive: active }
    );
    Object.assign(patch, dock);
    this._safeSetData(patch, cb);
  },

  /**
   * C3-Z：从 M 一级切到二级——同帧 isManageOverlayActive=true + 关一级 + 开二级
   */
  _openFromManageSheet: function (openPatch, cb) {
    this._manageSelectedRoundId = '';
    this._manageSelectedMatchId = '';
    var patch = Object.assign({}, this._buildCloseMoreSheetPatch(), openPatch || {});
    // 强制先占住 overlay（即使 openPatch 漏字段）
    patch.isManageOverlayActive = true;
    this._commitManageOverlayPatch(patch, cb);
  },

  /** C3-Z：关闭某一二级层；若无其它 M 弹层则恢复底栏滚动阈值 */
  _closeManageSecondaryPatch: function (closePatch, cb) {
    var self = this;
    this._commitManageOverlayPatch(closePatch || {}, function () {
      if (!self._pageAlive) return;
      if (!self.data.isManageOverlayActive) {
        self._syncStickyByScroll(
          self._scrollTop != null ? self._scrollTop : self.data.scrollYState || 0
        );
      }
      if (typeof cb === 'function') cb();
    });
  },

  _syncStickyByScroll: function (scrollTop) {
    var top = Number(scrollTop);
    if (!Number.isFinite(top)) top = 0;
    var tabThreshold = this.data.tabOffsetTop || 0;
    // 一级：目标为 scroll-view 顶部（内部坐标 0），公式保持 scrollTop >= tabOffsetTop
    var stickyTab = top >= tabThreshold && tabThreshold > 0;
    var standings = this.data.standings || {};
    var scheduleAvailable = scheduleHasRounds(this.data.schedule);
    var secondaryThreshold = this._getSecondaryStickyThreshold();
    var stickyRound = calcIsStickyRoundSelector({
      activeTab: this._activeTab,
      standingsAvailable: !!standings.available,
      scheduleAvailable: scheduleAvailable,
      isStickyTab: stickyTab,
      roundSelectorOffsetTop: this.data.roundSelectorOffsetTop,
      stickyRoundSelectorTop: this.data.stickyRoundSelectorTop,
      scrollRectTop: this.data.scrollRectTop,
      secondaryThreshold:
        this._activeTab === 'standings' || this._activeTab === 'schedule'
          ? secondaryThreshold
          : undefined,
      scrollTop: top
    });
    var stickyRegister = calcIsStickyRegisterExt({
      activeTab: this._activeTab,
      isStickyTab: stickyTab,
      registerExtOffsetTop: this.data.registerExtOffsetTop,
      stickyRoundSelectorTop: this.data.stickyRoundSelectorTop,
      scrollRectTop: this.data.scrollRectTop,
      secondaryThreshold:
        this._activeTab === 'register' ? secondaryThreshold : undefined,
      scrollTop: top
    });
    var patch = {};
    if (stickyTab !== this.data.isStickyTab || top !== this.data.scrollYState) {
      patch.isStickyTab = stickyTab;
      patch.scrollYState = top;
    }
    var justStuckRound =
      stickyRound === true && !this.data.isStickyRoundSelector;
    var justUnstuckRound =
      stickyRound === false && !!this.data.isStickyRoundSelector;
    if (stickyRound !== this.data.isStickyRoundSelector) {
      patch.isStickyRoundSelector = stickyRound;
    }
    if (justUnstuckRound) {
      this._lastStandingsContentHostHeight = 0;
      patch.contentHostMinHeight = 0;
    }
    if (stickyRegister !== this.data.isStickyRegisterExt) {
      patch.isStickyRegisterExt = stickyRegister;
    }
    // 底部 dock：与 sticky 同帧更新（几何公式同 detail；非仅 isStickyTab）
    var dockPatch = this._resolveBottomDockVisibilityPatch(top, stickyTab);
    if (dockPatch.hideBottomCta !== this.data.hideBottomCta) {
      patch.hideBottomCta = dockPatch.hideBottomCta;
    }
    if (dockPatch.showRegisterBottomAction !== this.data.showRegisterBottomAction) {
      patch.showRegisterBottomAction = dockPatch.showRegisterBottomAction;
    }
    if (dockPatch.showDiscussionInput !== this.data.showDiscussionInput) {
      patch.showDiscussionInput = dockPatch.showDiscussionInput;
    }
    if (dockPatch.showScheduleBottomAction !== this.data.showScheduleBottomAction) {
      patch.showScheduleBottomAction = dockPatch.showScheduleBottomAction;
    }
    // 刚吸顶：把流内横向位置交给 fixed 克隆（对齐 detail，避免跳动）
    var justStuck = patch.isStickyTab === true && !this.data.isStickyTab;
    if (justStuck) {
      patch.tabHScrollLeft = this._lastTabScrollLeft || 0;
    }
    var ctaVisibilityChanged =
      Object.prototype.hasOwnProperty.call(patch, 'hideBottomCta') ||
      Object.prototype.hasOwnProperty.call(patch, 'showRegisterBottomAction');
    if (Object.keys(patch).length) this.setData(patch);
    if (justStuckRound && this._activeTab === 'standings') {
      this._cacheStandingsContentHostHeight();
    }
    // 对齐 detail：CTA 显隐变化后重测名单可用高度（CTA 占位影响 bottomReserve）
    if (this._activeTab === 'register' && (justStuck || ctaVisibilityChanged)) {
      this.computeRosterMinHeight();
    }
  },

  onRoundSelectorHScroll: function (e) {
    if (this._skipRoundHScrollSync) return;
    var left =
      e && e.detail && e.detail.scrollLeft != null ? Number(e.detail.scrollLeft) : 0;
    if (!Number.isFinite(left)) return;
    this._lastRoundSelectorScrollLeft = left;
    if (Math.abs(left - (this.data.roundSelectorScrollLeft || 0)) < 0.5) return;
    var self = this;
    this._skipRoundHScrollSync = true;
    this.setData({ roundSelectorScrollLeft: left }, function () {
      setTimeout(function () {
        self._skipRoundHScrollSync = false;
      }, 32);
    });
  },

  /** 报名子 TAB 横向同步：inflow/fixed 共用 scroll-left；防回写锁约 32ms */
  onRegisterSubTabHScroll: function (e) {
    if (this._skipRegisterSubTabHScrollSync) return;
    var left =
      e && e.detail && e.detail.scrollLeft != null ? Number(e.detail.scrollLeft) : 0;
    if (!Number.isFinite(left)) return;
    this._lastRegisterSubTabScrollLeft = left;
    if (Math.abs(left - (this.data.registerSubTabScrollLeft || 0)) < 0.5) return;
    var self = this;
    this._skipRegisterSubTabHScrollSync = true;
    this.setData({ registerSubTabScrollLeft: left }, function () {
      setTimeout(function () {
        self._skipRegisterSubTabHScrollSync = false;
      }, 32);
    });
  },

  _safeSetData: function (patch, cb) {
    if (!this._pageAlive) return;
    if (typeof cb === 'function') {
      this.setData(patch, cb);
    } else {
      this.setData(patch);
    }
  },

  /** 解析当前登录身份；actor / player / eligibility 共用同一 playerId */
  _resolveRegisterIdentity: function () {
    var profile = userProfileStore.loadProfile();
    var currentUser = gameStore.getCurrentUser() || {};
    var identity = seriesRegisterEligibility.resolvePagePlayerIdentity(
      profile,
      currentUser
    );
    this._resolvedPlayerId = identity.ok ? identity.playerId : '';
    return {
      identity: identity,
      profile: profile,
      currentUser: currentUser
    };
  },

  _buildRegistrationContext: function (series) {
    var resolved = this._resolveRegisterIdentity();
    var identity = resolved.identity;
    if (!identity.ok) {
      this._lastEligibility = null;
      return {
        resolved: true,
        identityOk: false,
        playerId: '',
        eligibleParticipantIds: [],
        ineligibleMessage: seriesRegisterEligibility.MSG_IDENTITY
      };
    }
    var eligibility = seriesRegisterEligibility.resolveSeriesRegistrationEligibility({
      series: series,
      playerId: identity.playerId
    });
    this._lastEligibility = eligibility;
    return {
      resolved: true,
      identityOk: true,
      playerId: identity.playerId,
      eligibleParticipantIds: eligibility.eligibleParticipantIds || [],
      ineligibleMessage: eligibility.ineligibleMessage || ''
    };
  },

  _buildEnrichedRegisterViewModel: function (series, activeParticipantId) {
    var access = this._lastRegisterAccess || {};
    return registerViewModel.buildSeriesRegisterViewModel({
      series: series,
      lifecycleAccess: access,
      activeParticipantId: activeParticipantId || this._registerActiveParticipantId || '',
      registrationContext: this._buildRegistrationContext(series)
    });
  },

  _toastRegisterFailure: function (reason) {
    var eligibilityMsg =
      (this._lastEligibility && this._lastEligibility.ineligibleMessage) || '';
    var map = {
      registration_closed: registrationInteractionModel.resolveRegistrationCtaCopy('closed'),
      series_completed: '赛事已完赛',
      series_not_published: '赛事未发布',
      lifecycle_readonly: '赛事不可报名',
      affiliation_denied:
        eligibilityMsg || seriesRegisterEligibility.MSG_NOT_PARTICIPANT_TEAM,
      affiliation_unresolved:
        eligibilityMsg || seriesRegisterEligibility.MSG_NOT_PARTICIPANT_TEAM,
      not_host_member: seriesRegisterEligibility.MSG_NOT_HOST_MEMBER,
      no_eligible_team: seriesRegisterEligibility.MSG_NO_TEAM_PARTICIPANTS,
      no_participants: seriesRegisterEligibility.MSG_NO_TEAM_PARTICIPANTS,
      no_division_participants: seriesRegisterEligibility.MSG_NO_DIVISION_PARTICIPANTS,
      participant_id_required: '请选择报名球队',
      participant_not_found: '报名主体不存在',
      already_registered_elsewhere: '您已在其他主体报名',
      self_identity_unresolved: seriesRegisterEligibility.MSG_IDENTITY,
      self_identity_mismatch: seriesRegisterEligibility.MSG_IDENTITY,
      player_id_required: seriesRegisterEligibility.MSG_IDENTITY,
      identity_unresolved: seriesRegisterEligibility.MSG_IDENTITY,
      storage_write_failed: '保存失败，请重试',
      storage_failed: '保存失败，请重试',
      recovery_required: '保存失败，请重试',
      player_has_real_score: '该球员已有比赛成绩，暂不可取消报名',
      finalized_score: SELF_CANCEL_CTA_FINALIZED,
      managed_station_invalid: seriesStationManageGate.GATE_FAIL_MESSAGE,
      not_self_registered: '报名状态已变化，请重新操作',
      series_not_found: '系列赛不存在',
      expected_revision_invalid: '报名状态已变化，请重新操作',
      permission_denied: '暂无管理权限',
      proxy_target_is_self: '代报名请填写他人信息',
      not_proxy: '无法取消该报名',
      not_registered_by_me: '无法取消该报名',
      not_registered: '报名状态已变化，请重新操作',
      roster_entry_not_found: '报名状态已变化，请重新操作',
      player_id_mismatch: '报名状态已变化，请重新操作'
    };
    var title = map[reason] || '操作失败，请重试';
    if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
      wx.showToast({ title: title, icon: 'none' });
    }
  },

  _readFontScale: function () {
    try {
      if (typeof wx !== 'undefined' && typeof wx.getStorageSync === 'function') {
        return wx.getStorageSync('fontScale_global') === 'large' ? 'large' : 'normal';
      }
    } catch (e) { /* ignore */ }
    return 'normal';
  },

  _computeDiscussionPanelMinHeight: function () {
    try {
      var layout = readSeriesDetailWindowLayout();
      if (layout && layout.threwWithoutValue) return 0;
      var wh =
        layout && layout.windowHeight != null ? Number(layout.windowHeight) : 0;
      if (!Number.isFinite(wh) || wh <= 0) wh = this._lastViewportHeight || 0;
      var header = Number(this.data.headerTotalHeight) || 0;
      var tab = Number(this.data.primaryTabHeight) || 44;
      var minH = Math.max(280, Math.ceil(wh - header - tab));
      return Number.isFinite(minH) ? minH : 0;
    } catch (e) {
      return 0;
    }
  },

  /**
   * 讨论区页面会话投影：房间 = seriesId；不写 store / 分站。
   * 同 seriesId 保留内存消息；换房清空。
   */
  _buildDiscussionDataPatch: function (series, lifecycleAccess) {
    var sid =
      series && series.seriesId != null
        ? String(series.seriesId).trim()
        : this._seriesId || '';
    if (!Array.isArray(this._discussionChat)) this._discussionChat = [];
    if (this._discussionRoomSeriesId !== sid) {
      this._discussionRoomSeriesId = sid;
      this._discussionChat = [];
    }
    var currentUser = null;
    try {
      currentUser = gameStore.getCurrentUser ? gameStore.getCurrentUser() : null;
    } catch (e) {
      currentUser = null;
    }
    var disc = discussionViewModel.buildSeriesDiscussionViewModel({
      seriesId: sid,
      lifecycleAccess: lifecycleAccess || this._lastRegisterAccess || {},
      currentUser: currentUser
    });
    return {
      discussionChat: this._discussionChat.slice(),
      discussionWatchers: disc.watchers,
      discussionCanSpeak: !!disc.canSpeak,
      discussionShowInputBar: !!disc.showInputBar,
      discussionInputDisabled: !!disc.inputDisabled,
      discussionInputPlaceholder: disc.inputPlaceholder || '说点什么…',
      discussionSelfAvatar: disc.selfAvatar
    };
  },

  /**
   * 页面会话镜像：组件已本地追加；宿主保留以便切 TAB 重挂载后回灌。
   * 不宣称持久化 / 跨设备同步。
   */
  onDiscussionSend: function (e) {
    var detail = (e && e.detail) || {};
    if (!this.data.discussionCanSpeak) return;
    var message = detail.message;
    if (!message || typeof message !== 'object') {
      var text = detail.text != null ? String(detail.text).trim() : '';
      if (!text) return;
      var createdAt =
        detail.createdAt != null && Number.isFinite(Number(detail.createdAt))
          ? Number(detail.createdAt)
          : Date.now();
      message = {
        self: true,
        userId: 'me',
        name: '我',
        avatar: this.data.discussionSelfAvatar,
        text: text,
        mention: '',
        mentions: Array.isArray(detail.mentions) ? detail.mentions.slice() : [],
        createdAt: createdAt
      };
    } else if (message.createdAt == null) {
      message = Object.assign({}, message, {
        createdAt:
          detail.createdAt != null && Number.isFinite(Number(detail.createdAt))
            ? Number(detail.createdAt)
            : Date.now()
      });
    }
    if (!Array.isArray(this._discussionChat)) this._discussionChat = [];
    this._discussionChat = this._discussionChat.concat([message]);
    this.setData({ discussionChat: this._discussionChat.slice() });
  },

  reloadViewModel: function (options) {
    var opts = options || {};
    this._registerRenderEpoch = registerViewModel.bumpRegisterRenderEpoch(
      this._registerRenderEpoch
    );
    var renderEpoch = this._registerRenderEpoch;
    this._selfCancelInspectToken = bumpSelfCancelInspectToken(this._selfCancelInspectToken);
    var inspectToken = this._selfCancelInspectToken;
    if (!this._pageAlive) return;
    // 门闩未放行：禁止任何业务 VM setData（含短暂闪现）
    if (!this._canLoadBusinessContent()) {
      return;
    }
    if (!this._seriesId) {
      this._safeSetData({ loadError: '缺少系列赛参数' });
      return;
    }
    var series = seriesStore.getSeriesById(this._seriesId);
    if (!series) {
      this._safeSetData({ loadError: '无法加载系列赛' });
      return;
    }

    var self = this;
    // global_m / per_round_n：只读装配真实分站成绩；其它 mode → 空结构。不写 storage。
    var assembled = seriesStandingsAssembler.buildStandingsResult({
      series: series,
      getMatchById: function (id) {
        return teamMatchStore.getMatchById(id);
      },
      getIndexByMatchId: function (id) {
        return seriesStationIndex.getByMatchId(id);
      },
      resolveStationStatusLabel: function (match) {
        return viewModel.resolveStationStatusLabel(match);
      }
    });
    var standingsResult =
      assembled && assembled.standingsResult
        ? assembled.standingsResult
        : standingsViewModel.emptyStandingsResult();
    this._cachedStandingsResult = standingsResult;

    var vm = viewModel.buildSeriesDetailViewModel(series, {
      preview: this._preview,
      theme: this._resolveThemeKey(),
      getMatchById: function (id) {
        return teamMatchStore.getMatchById(id);
      },
      getIndexByMatchId: function (id) {
        return seriesStationIndex.getByMatchId(id);
      },
      standingsSelectedKey: this._standingsSelectedKey,
      standingsUserPicked: this._standingsUserPicked,
      standingsVisited: this._standingsVisited,
      standingsResult: standingsResult,
      registerActiveParticipantId: this._registerActiveParticipantId,
      heroEntryContext: this._heroEntryContext || 'plaza'
    });

    if (!vm.ok) {
      this._cachedStandingsResult = standingsViewModel.emptyStandingsResult();
      this._safeSetData({
        loadError: vm.message || '无法加载系列赛',
        seriesName: '',
        roundCards: [],
        standings: {
          available: false,
          roundSelector: [],
          teamRows: [],
          unavailableTitle: '',
          unavailableMessage: ''
        },
        register: registerViewModel.emptyRegisterViewModel(),
        schedule: scheduleViewModel.emptyScheduleViewModel()
      });
      return;
    }

    // 赛程 TAB 不再用 roundCards 进入旧 detail；保留 map 仅作兼容空壳
    this._roundNavById = Object.create(null);
    this._lastSeriesForStandings = series;
    this._lastStandingsRoundStates = vm.standingsRoundStates || [];
    this._lastSeriesForRegister = series;
    this._lastSeriesForSchedule = series;
    this._lastRegisterAccess = {
      ok: true,
      lifecycleStatus: vm.lifecycleStatus,
      isDraftPreview: !!vm.isDraftPreview,
      isHistorical: !!vm.isHistorical,
      competitionPhaseCache: vm.competitionPhaseCache || ''
    };
    if (vm.standings && vm.standings.selectedKey) {
      this._standingsSelectedKey = vm.standings.selectedKey;
    }
    if (vm.standings) {
      this._lastStandingsBaseVm = vm.standings;
      vm.standings = this._applyStandingsBoardViewOverlay(vm.standings);
    }

    var latestForRegister =
      registerViewModel.pickAuthoritativeSeriesForRegisterRefresh({
        storeSeries: seriesStore.getSeriesById(this._seriesId),
        resultSeries: series,
        fallbackSeries: this._lastSeriesForRegister
      }) || series;
    this._lastSeriesForRegister = latestForRegister;
    this._lastSeriesForSchedule = latestForRegister;
    var register = this._buildEnrichedRegisterViewModel(
      latestForRegister,
      this._registerActiveParticipantId
    );
    if (register && register.activeParticipantId) {
      this._registerActiveParticipantId = register.activeParticipantId;
    }

    var schedule = this._buildScheduleViewModel(series);
    var discussionPatch = this._buildDiscussionDataPatch(series, this._lastRegisterAccess);

    this._heroLogoLayoutRevision = (this._heroLogoLayoutRevision || 0) + 1;
    var heroDisplay = (vm.hero && vm.hero.participantDisplay) || {};
    this._heroTeamLogosRaw = Array.isArray(heroDisplay.teamItems)
      ? heroDisplay.teamItems.slice()
      : [];
    this._heroLogoFitKey = '';
    var heroTeamLogoStack = viewModel.buildHeroTeamLogoStackState({
      mode: heroDisplay.mode,
      emptyText: heroDisplay.emptyText,
      teamItems: this._heroTeamLogosRaw,
      containerWidth: this._heroLogoContainerWidth || 0,
      logoDiameter: this._rpxToPx(HERO_LOGO_SIZE_RPX),
      normalGap: this._rpxToPx(HERO_LOGO_GAP_RPX)
    });

    var patch = {
      loadError: '',
      seriesName: vm.seriesName,
      lifecycleLabel: vm.lifecycleLabel,
      isDraftPreview: !!vm.isDraftPreview,
      isHistorical: !!vm.isHistorical,
      competitionPhaseLabel: vm.competitionPhaseLabel || '',
      templateLabel: vm.templateLabel,
      host: vm.host,
      hero: vm.hero || {},
      heroTeamLogoStack: heroTeamLogoStack,
      participants: vm.participants,
      scoring: vm.scoring,
      visibility: vm.visibility,
      eventInfoList: vm.eventInfoList,
      partner: vm.partner,
      roundCards: vm.roundCards,
      standings: vm.standings || {},
      standingsEmpty: vm.standingsEmpty,
      register: register,
      schedule: schedule,
      tabs: vm.tabs,
      activeTab: this._activeTab,
      fontScale: this._readFontScale()
    };
    Object.keys(discussionPatch).forEach(function (k) {
      patch[k] = discussionPatch[k];
    });
    Object.assign(patch, this._syncPersonalExpandPagePatch(vm.standings || {}, {}));

    if (opts.resetScroll) {
      this._scrollTop = 0;
      patch.scrollTop = 0;
      patch.isStickyTab = false;
    } else {
      this._skipScrollReset = true;
      patch.scrollTop = this._scrollTop;
    }

    var dockScroll = Number(this._scrollTop);
    if (!Number.isFinite(dockScroll) || dockScroll < 0) dockScroll = 0;
    var dockSticky =
      !opts.resetScroll &&
      dockScroll >= (this.data.tabOffsetTop || 0) &&
      (this.data.tabOffsetTop || 0) > 0;
    Object.assign(
      patch,
      this._resolveBottomDockVisibilityPatch(dockScroll, dockSticky, {
        register: register,
        schedule: schedule,
        discussion: { showInputBar: !!discussionPatch.discussionShowInputBar }
      })
    );

    if (!registerViewModel.canApplyRegisterRender(this._registerRenderEpoch, renderEpoch)) {
      return;
    }

    this._safeSetData(patch, function () {
      if (!self._pageAlive) return;
      if (!registerViewModel.canApplyRegisterRender(self._registerRenderEpoch, renderEpoch)) {
        return;
      }
      self._skipScrollReset = false;
      self._refreshSeriesManageFab();
      self._applySelfCancelCtaInspectAfterReload(inspectToken, register);
      if (typeof wx !== 'undefined' && typeof wx.nextTick === 'function') {
        wx.nextTick(function () {
          if (!self._pageAlive) return;
          self.measureTabTop();
          self.measureTabOverflow();
          self._scheduleHeroTeamLogoLayout();
        });
      } else {
        setTimeout(function () {
          if (!self._pageAlive) return;
          self.measureTabTop();
          self.measureTabOverflow();
          self._scheduleHeroTeamLogoLayout();
        }, 0);
      }
    });
  },

  _cacheFillerForActiveTab: function (height) {
    if (!this._pageAlive) return;
    if (!this._fillerByTab) this._fillerByTab = createEmptyFillerByTab();
    var tab = this._activeTab;
    if (!tab) return;
    var h = Number(height);
    if (!Number.isFinite(h) || h < 0) h = 0;
    this._fillerByTab[tab] = h;
  },

  _guessViewportHeight: function () {
    if (this._lastViewportHeight > 0) return this._lastViewportHeight;
    try {
      if (typeof wx !== 'undefined' && typeof wx.getWindowInfo === 'function') {
        var info = wx.getWindowInfo();
        if (info && Number.isFinite(info.windowHeight) && info.windowHeight > 0) {
          var header = this.data.headerTotalHeight || 0;
          return Math.max(0, info.windowHeight - header);
        }
      }
    } catch (e) {
      /* ignore */
    }
    return 0;
  },

  /**
   * 轻量 TAB 切换：同帧 activeTab + provisional/cached filler + sticky 派生
   * 禁止 filler=0 裸渲染；不重建 ViewModel / 不改 scrollTop / 不重置横向 scrollLeft
   */
  switchTab: function (e) {
    var tab = e && e.currentTarget && e.currentTarget.dataset
      ? e.currentTarget.dataset.tab
      : '';
    tab = tab != null ? String(tab) : '';
    if (!tab || tab === this._activeTab) return;
    var allowed = (this.data.tabs || []).some(function (t) {
      return t && t.id === tab;
    });
    if (!allowed) return;

    this._performSwitchTab(tab);
  },

  _performSwitchTab: function (tab) {
    var self = this;
    if (!tab || tab === this._activeTab) return;

    // 离开前缓存当前 TAB 的精确/当前 filler
    this._cacheFillerForActiveTab(this.data.scrollFillerHeight || 0);

    var prevTab = this._activeTab;
    if (prevTab === 'standings' && tab !== 'standings') {
      this._lastStandingsContentHostHeight = 0;
    }

    // 作废进行中的旧测量，防止写回（含名单高度）
    this._fillerMeasureToken = (this._fillerMeasureToken || 0) + 1;
    this._rosterMeasureToken = (this._rosterMeasureToken || 0) + 1;

    var firstStandingsOpen = tab === 'standings' && !this._standingsVisited;
    var firstScheduleOpen = tab === 'schedule' && !this._scheduleVisited;
    if (firstStandingsOpen) this._standingsVisited = true;
    if (firstScheduleOpen) this._scheduleVisited = true;

    this._activeTab = tab;

    var standings = this.data.standings || {};
    var scheduleAvailable = scheduleHasRounds(this.data.schedule);
    var tabOffsetTop = this.data.tabOffsetTop || 0;
    var secondaryThreshold = this._getSecondaryStickyThreshold();
    var requiredOffset = resolveFillerTargetStickyOffset(
      tab,
      !!standings.available,
      tabOffsetTop,
      secondaryThreshold,
      scheduleAvailable
    );
    // 总榜/赛程/报名尚未测过二级 offset 时，至少按一级阈值预补偿，避免裸 0
    if (tab === 'standings' && standings.available && !(requiredOffset > 0)) {
      requiredOffset = tabOffsetTop;
    }
    if (tab === 'schedule' && scheduleAvailable && !(requiredOffset > 0)) {
      requiredOffset = tabOffsetTop;
    }
    if (tab === 'register' && !(requiredOffset > 0)) {
      requiredOffset = tabOffsetTop;
    }

    var cachedRaw =
      this._fillerByTab && this._fillerByTab[tab] != null
        ? this._fillerByTab[tab]
        : null;
    var provisional = computeProvisionalTabFiller({
      cachedFiller: cachedRaw,
      viewportHeight: this._guessViewportHeight(),
      currentScrollTop: this._scrollTop || 0,
      targetStickyOffset: requiredOffset,
      tolerance: SCROLL_FILLER_TOLERANCE_PX
    });

    var scrollTop = Number(this._scrollTop);
    if (!Number.isFinite(scrollTop) || scrollTop < 0) scrollTop = 0;
    var stickyTab = scrollTop >= tabOffsetTop && tabOffsetTop > 0;
    var stickyRound = calcIsStickyRoundSelector({
      activeTab: tab,
      standingsAvailable: !!standings.available,
      scheduleAvailable: scheduleAvailable,
      isStickyTab: stickyTab,
      roundSelectorOffsetTop: this.data.roundSelectorOffsetTop,
      stickyRoundSelectorTop: this.data.stickyRoundSelectorTop,
      scrollRectTop: this.data.scrollRectTop,
      secondaryThreshold:
        tab === 'standings' || tab === 'schedule' ? secondaryThreshold : undefined,
      scrollTop: scrollTop
    });
    var stickyRegister = calcIsStickyRegisterExt({
      activeTab: tab,
      isStickyTab: stickyTab,
      registerExtOffsetTop: this.data.registerExtOffsetTop,
      stickyRoundSelectorTop: this.data.stickyRoundSelectorTop,
      scrollRectTop: this.data.scrollRectTop,
      secondaryThreshold: tab === 'register' ? secondaryThreshold : undefined,
      scrollTop: scrollTop
    });

    var dockPatch = this._resolveBottomDockVisibilityPatch(scrollTop, stickyTab);
    var patch = Object.assign(
      {
        activeTab: tab,
        scrollFillerHeight: provisional,
        isStickyTab: stickyTab,
        scrollYState: scrollTop,
        isStickyRoundSelector: stickyRound,
        isStickyRegisterExt: stickyRegister
      },
      dockPatch
    );
    if (prevTab === 'standings' && tab !== 'standings') {
      patch.contentHostMinHeight = 0;
    }
    if (firstStandingsOpen) {
      patch.standingsDockIntoView = this._dockIntoViewId(this._standingsSelectedKey);
    }
    if (firstScheduleOpen) {
      patch.scheduleDockIntoView = this._dockIntoViewId(this._scheduleSelectedKey);
    }
    if (tab === 'discussion') {
      var minH = this._computeDiscussionPanelMinHeight();
      if (minH > 0) patch.discussionPanelMinHeight = minH;
    }

    this.setData(patch, function () {
      if (!self._pageAlive) return;
      if (firstStandingsOpen || firstScheduleOpen) {
        setTimeout(function () {
          if (!self._pageAlive) return;
          var clearPatch = {};
          if (firstStandingsOpen) clearPatch.standingsDockIntoView = '';
          if (firstScheduleOpen) clearPatch.scheduleDockIntoView = '';
          self.setData(clearPatch);
        }, 400);
      }
      var run = function () {
        if (!self._pageAlive || self._activeTab !== tab) return;
        if (
          ((tab === 'standings' && standings.available) ||
            (tab === 'schedule' && scheduleAvailable)) &&
          !(self.data.roundSelectorOffsetTop > 0)
        ) {
          self.measureRoundSelectorTop();
        } else if (tab === 'register') {
          self.measureRegisterExtTop();
        } else {
          self.updateScrollFillerHeight();
        }
      };
      if (typeof wx !== 'undefined' && typeof wx.nextTick === 'function') {
        wx.nextTick(run);
      } else {
        setTimeout(run, 0);
      }
      self._syncScheduleTeeObserver();
    });
  },

  _dockIntoViewId: function (roundId) {
    var key = roundId != null ? String(roundId).trim() : '';
    if (!key || standingsViewModel.isCumulativeStandingsKey(key)) return '';
    return 'srd-' + key.replace(/[^A-Za-z0-9_-]/g, '');
  },

  _resolveMatchForStandingsRound: function (roundId) {
    var key = roundId != null ? String(roundId).trim() : '';
    if (!key) return null;
    try {
      var series = this._lastSeriesForStandings;
      var rounds = series && Array.isArray(series.rounds) ? series.rounds : [];
      for (var i = 0; i < rounds.length; i++) {
        if (rounds[i] && String(rounds[i].roundId) === key) {
          var matchId = String(rounds[i].matchId || '').trim();
          return matchId ? teamMatchStore.getMatchById(matchId) : null;
        }
      }
    } catch (e0) {
      return null;
    }
    return null;
  },

  /** 每轮会话选择；兼容旧 _standingsViewByRoundId 字符串。TOT 始终球队，不读单轮记忆。 */
  _resolveStandingsSelectionForKey: function (selectedKey) {
    var key = selectedKey != null ? String(selectedKey).trim() : '';
    var scoringMode = '';
    try {
      var series = this._lastSeriesForStandings;
      scoringMode =
        series && series.scoringRule && series.scoringRule.mode
          ? String(series.scoringRule.mode).trim()
          : '';
    } catch (eMode) {
      scoringMode = '';
    }
    var rememberedByRoundId = Object.create(null);
    var selMap = this._standingsSelectionByRoundId || Object.create(null);
    var legacy = this._standingsViewByRoundId || Object.create(null);
    Object.keys(selMap).forEach(function (rid) {
      rememberedByRoundId[rid] = selMap[rid];
    });
    Object.keys(legacy).forEach(function (rid) {
      if (rememberedByRoundId[rid] == null) rememberedByRoundId[rid] = legacy[rid];
    });
    var match =
      key && !standingsViewModel.isCumulativeStandingsKey(key)
        ? this._resolveMatchForStandingsRound(key)
        : null;
    return seriesStandingsViewOptions.resolveStandingsSessionSelection({
      selectedKey: key,
      scoringMode: scoringMode,
      match: match,
      rememberedByRoundId: rememberedByRoundId
    });
  },

  _resolveStandingsBoardViewForKey: function (selectedKey) {
    return this._resolveStandingsSelectionForKey(selectedKey).view;
  },

  _rememberStandingsSelection: function (roundId, selection) {
    var rid = roundId != null ? String(roundId).trim() : '';
    if (!rid || standingsViewModel.isCumulativeStandingsKey(rid)) return;
    var match = this._resolveMatchForStandingsRound(rid);
    var sel = seriesStandingsViewOptions.normalizeSeriesStandingsSelection(
      match,
      selection
    );
    if (!this._standingsSelectionByRoundId) {
      this._standingsSelectionByRoundId = Object.create(null);
    }
    if (!this._standingsViewByRoundId) {
      this._standingsViewByRoundId = Object.create(null);
    }
    this._standingsSelectionByRoundId[rid] = sel;
    this._standingsViewByRoundId[rid] = sel.view;
    return sel;
  },

  _resolveStandingsRoundContext: function (selectedKey) {
    var key = selectedKey != null ? String(selectedKey).trim() : '';
    var series = this._lastSeriesForStandings;
    var rounds = series && Array.isArray(series.rounds) ? series.rounds : [];
    var round = null;
    var match = null;
    var roundHeadline = '';
    try {
      for (var i = 0; i < rounds.length; i++) {
        var r = rounds[i];
        if (!r || String(r.roundId) !== key) continue;
        round = r;
        var matchId = String(r.matchId || '').trim();
        if (matchId) match = teamMatchStore.getMatchById(matchId);
        var displayLabel = standingsViewModel.resolveStandingsRoundDisplayLabel(
          series,
          this._lastStandingsRoundStates || [],
          key
        );
        var label = displayLabel || 'R' + (i + 1);
        var name = String(r.roundName || r.name || '').trim();
        roundHeadline = label + (name ? ' · ' + name : '');
        break;
      }
    } catch (eCtx) {
      match = null;
    }
    var indexLink = null;
    var mid = match && match.matchId != null ? String(match.matchId).trim() : '';
    if (mid) {
      try {
        indexLink = seriesStationIndex.getByMatchId(mid);
      } catch (eIdx) {
        indexLink = null;
      }
    }
    return {
      series: series,
      round: round,
      match: match,
      indexLink: indexLink,
      roundHeadline: roundHeadline
    };
  },

  _applyStandingsBoardViewOverlay: function (standings) {
    var vm = standings && typeof standings === 'object' ? standings : {};
    if (vm.useRyderCupScoreboard) return vm;
    var selectedKey =
      vm.selectedKey != null && String(vm.selectedKey).trim()
        ? String(vm.selectedKey).trim()
        : standingsViewModel.CUMULATIVE_KEY;
    var selection = this._resolveStandingsSelectionForKey(selectedKey);
    var sharedEmpty = seriesPersonalLeaderboardAdapter.emptySharedPersonalBoardFields();
    if (standingsViewModel.isCumulativeStandingsKey(selectedKey)) {
      this._frozenPersonalBoardMatch = null;
      if (
        standingsViewModel.isStrokePlaySeries(this._lastSeriesForStandings) ||
        vm.mode === 'per_round_n'
      ) {
        return Object.assign({}, vm, sharedEmpty, { useLiveLeaderboard: false });
      }
      var totLabel = standingsViewModel.buildTotTopMDescription(
        this._lastSeriesForStandings
      );
      var totProjected = seriesTeamLeaderboardAdapter.projectSeriesStandingsTeamBoard({
        selectedKey: selectedKey,
        series: this._lastSeriesForStandings,
        getMatchById: function (id) {
          return teamMatchStore.getMatchById(id);
        },
        getIndexByMatchId: function (id) {
          return seriesStationIndex.getByMatchId(id);
        },
        viewerRemarkCtx: this._viewerRemarkCtx
      });
      var totOverlay = seriesTeamLeaderboardAdapter.applySeriesTotTeamBoardOverlay(
        vm,
        totProjected,
        totLabel
      );
      return Object.assign(
        {},
        seriesTeamLeaderboardAdapter.guardTotOverlayAgainstStaleEmpty(
          this.data && this.data.standings,
          totOverlay,
          totProjected
        ),
        { useLiveLeaderboard: false }
      );
    }
    if (vm.mode === 'per_round_n') {
      var perRoundCtx = this._resolveStandingsRoundContext(selectedKey);
      var perRoundView = selection && selection.view ? String(selection.view) : 'team';
      var perRoundLiveSel =
        perRoundView === 'team'
          ? { view: 'team', scoreType: 'gross' }
          : selection;
      var perRoundLive = seriesLiveLeaderboardAdapter.projectSeriesRnLiveLeaderboard({
        selectedKey: selectedKey,
        selection: perRoundLiveSel,
        series: perRoundCtx.series || this._lastSeriesForStandings,
        round: perRoundCtx.round,
        match: perRoundCtx.match,
        indexLink: perRoundCtx.indexLink,
        openIndex:
          perRoundView === 'team'
            ? this.data.openStandingsScorecardKey
            : this._standingsPersonalOpenIndex,
        viewerRemarkCtx: this._viewerRemarkCtx
      });
      if (perRoundView !== 'team') {
        this._frozenPersonalBoardMatch =
          perRoundLive && perRoundLive.verifiedOk ? perRoundCtx.match : null;
      }
      return seriesLiveLeaderboardAdapter.applyPerRoundNStandingsOverlay(
        vm,
        selection,
        perRoundLive,
        {
          series: perRoundCtx.series || this._lastSeriesForStandings,
          roundId: selectedKey,
          matchId: perRoundCtx.match && perRoundCtx.match.matchId,
          match: perRoundCtx.match,
          roundHeadline: perRoundCtx.roundHeadline
        }
      );
    }
    var ctx = this._resolveStandingsRoundContext(selectedKey);
    var liveProjected = seriesLiveLeaderboardAdapter.projectSeriesRnLiveLeaderboard({
      selectedKey: selectedKey,
      selection: selection,
      series: ctx.series,
      round: ctx.round,
      match: ctx.match,
      indexLink: ctx.indexLink,
      openIndex:
        selection.view === 'team'
          ? this.data.openStandingsScorecardKey
          : this._standingsPersonalOpenIndex,
      viewerRemarkCtx: this._viewerRemarkCtx
    });
    this._frozenPersonalBoardMatch =
      liveProjected && liveProjected.verifiedOk ? ctx.match : null;
    return seriesLiveLeaderboardAdapter.applyGlobalMRnStandingsOverlay(
      vm,
      selection,
      liveProjected,
      {
        series: ctx.series || this._lastSeriesForStandings,
        selectedKey: selectedKey,
        roundHeadline: ctx.roundHeadline,
        teamViewLabel: standingsViewModel.resolveRoundGameModeLabel(
          ctx.series || this._lastSeriesForStandings,
          selectedKey
        )
      }
    );
  },

  _releaseStandingsContentHostHold: function (patch) {
    this._lastStandingsContentHostHeight = 0;
    if (patch && typeof patch === 'object') {
      patch.contentHostMinHeight = 0;
      return;
    }
    if (!this._pageAlive) return;
    if ((this.data.contentHostMinHeight || 0) > 0) {
      this.setData({ contentHostMinHeight: 0 });
    }
  },

  _measureStandingsContentHostHeight: function (cb) {
    var done = typeof cb === 'function' ? cb : function () {};
    if (typeof this.createSelectorQuery !== 'function') {
      done(this._lastStandingsContentHostHeight || 0);
      return;
    }
    var self = this;
    this.createSelectorQuery()
      .select('#series-standings-content-host')
      .boundingClientRect()
      .exec(function (res) {
        var rect = res && res[0];
        var h = rect && rect.height > 0 ? Number(rect.height) : 0;
        if (!Number.isFinite(h) || h < 0) h = 0;
        if (h > 0) {
          self._lastStandingsContentHostHeight = Math.max(
            Number(self._lastStandingsContentHostHeight) || 0,
            h
          );
        } else if (self._lastStandingsContentHostHeight > 0) {
          h = self._lastStandingsContentHostHeight;
        }
        done(h);
      });
  },

  /** 只更新缓存，不写 min-height / filler / sticky（切轮后 nextTick 禁止释放） */
  _cacheStandingsContentHostHeight: function () {
    var self = this;
    this._measureStandingsContentHostHeight(function (h) {
      if (!self._pageAlive) return;
      if (h > 0) {
        self._lastStandingsContentHostHeight = Math.max(
          Number(self._lastStandingsContentHostHeight) || 0,
          h
        );
      }
    });
  },

  _getStandingsStationDeps: function () {
    return {
      getMatchById: function (id) {
        return teamMatchStore.getMatchById(id);
      },
      getIndexByMatchId: function (id) {
        return seriesStationIndex.getByMatchId(id);
      }
    };
  },

  /**
   * 轮次切换等：轻量重建 standings 投影（不用于球队展开/收起）
   * ST-JUMP-4：切轮不重测 TAB/dock、不写 filler/scrollTop/sticky；吸顶时同帧持有 contentHostMinHeight
   */
  _rebuildStandingsProjection: function (extraPatch) {
    if (!this._lastSeriesForStandings) return;
    var series = this._lastSeriesForStandings;
    var stationDeps = this._getStandingsStationDeps();
    // 切 TOT/R：与完整构建同一赛制分流；global_m 复用缓存成绩
    var standings = viewModel.buildSeriesStandingsProjection({
      series: series,
      selectedKey: this._standingsSelectedKey,
      roundStates: this._lastStandingsRoundStates || [],
      userPicked: !!this._standingsUserPicked,
      visited: !!this._standingsVisited,
      standingsResult:
        this._cachedStandingsResult || standingsViewModel.emptyStandingsResult(),
      getMatchById: stationDeps.getMatchById,
      getIndexByMatchId: stationDeps.getIndexByMatchId,
      evaluateRoundStationGate: function (s, r) {
        return viewModel.evaluateRoundStationGate(s, r, stationDeps);
      }
    });
    if (standings && standings.selectedKey) {
      this._standingsSelectedKey = standings.selectedKey;
    }
    this._lastStandingsBaseVm = standings;
    standings = this._applyStandingsBoardViewOverlay(standings);
    var self = this;
    var patch = Object.assign(
      { standings: standings },
      this._syncPersonalExpandPagePatch(standings, extraPatch)
    );
    delete patch.scrollTop;
    delete patch.roundSelectorScrollLeft;
    delete patch.scrollFillerHeight;
    delete patch.scrollRectTop;
    delete patch.isStickyTab;
    delete patch.isStickyRoundSelector;
    delete patch.stickyRoundSelectorTop;
    delete patch.roundSelectorOffsetTop;
    if (Object.prototype.hasOwnProperty.call(patch, 'contentHostMinHeight')) {
      patch.contentHostMinHeight = computeStickyContentHostHoldMinHeight(
        this.data.contentHostMinHeight,
        patch.contentHostMinHeight
      );
    }
    // 同帧：selectedKey + roundInfoText + 选中态 + 榜数据；不改 scrollTop / filler / sticky
    this.setData(patch, function () {
      if (!self._pageAlive) return;
      if (self.data.isStickyRoundSelector) {
        self._cacheStandingsContentHostHeight();
      }
    });
  },

  /**
   * 个人榜展开页级字段：prestart 不带逐洞；开赛后补齐普通记分卡。
   * 不写 scrollTop / roundSelectorScrollLeft，不清零 filler。
   */
  _syncPersonalExpandPagePatch: function (standings, extraPatch) {
    // 不清零 filler；不写 scrollTop / roundSelectorScrollLeft
    var patch = extraPatch && typeof extraPatch === 'object' ? Object.assign({}, extraPatch) : {};
    var st = standings && typeof standings === 'object' ? standings : {};
    var livePersonal = !!(st.useLiveLeaderboard && st.selection && st.selection.view !== 'team');
    if (!st.showSharedPersonalBoard && !livePersonal) return patch;
    var idx = this._standingsPersonalOpenIndex;
    var match = this._frozenPersonalBoardMatch;
    if (st.prestartExpandMode === 'teeing_off_soon') {
      if (patch.openStandingsScorecard === undefined) {
        patch.openStandingsScorecard = null;
        patch.standingsScorecardCourseTitle = '';
      }
      if (idx >= 0 && !patch.standingsScorecardAdImage && match) {
        patch.standingsScorecardAdImage = this._resolveStandingsScorecardAdImage(match);
      }
      return patch;
    }
    if (idx >= 0 && patch.openStandingsScorecard === undefined && match) {
      var rows = Array.isArray(st.liveLeaderboard)
        ? st.liveLeaderboard
        : Array.isArray(st.personalLeaderboard)
          ? st.personalLeaderboard
          : [];
      var row = rows[idx];
      if (row) {
        var built = teamMatchScorecard.buildTeamMatchScorecardView(
          match,
          row,
          this.data.standingsScoreDisplayMode || 'gross'
        );
        patch.openStandingsScorecard = built && built.ok ? built.scorecard : null;
        if (!patch.standingsScorecardCourseTitle) {
          patch.standingsScorecardCourseTitle = teamMatchScorecard.buildScorecardCourseTitle(
            match
          );
        }
        if (!patch.standingsScorecardAdImage) {
          patch.standingsScorecardAdImage = this._resolveStandingsScorecardAdImage(match);
        }
      }
    }
    return patch;
  },

  /**
   * L2 筛选切换：只重投影当前轮 overlay，不 rebuild TOT，不回写滚动/吸顶
   */
  _reprojectStandingsBoardOverlay: function (extraPatch) {
    if (!this._lastStandingsBaseVm) {
      this._rebuildStandingsProjection(extraPatch);
      return;
    }
    var standings = this._applyStandingsBoardViewOverlay(this._lastStandingsBaseVm);
    var self = this;
    var patch = Object.assign(
      { standings: standings },
      this._syncPersonalExpandPagePatch(standings, extraPatch)
    );
    delete patch.scrollTop;
    delete patch.roundSelectorScrollLeft;
    delete patch.isStickyRoundSelector;
    delete patch.stickyRoundSelectorTop;
    this.setData(patch, function () {
      if (!self._pageAlive) return;
      self.scheduleStandingsContentFillerMeasure();
    });
  },

  onRyderCupScoreboardToggleCard: function (e) {
    var id =
      (e && e.detail && e.detail.id) ||
      (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) ||
      '';
    if (!id) return;
    var board = this.data.standings && this.data.standings.matchPlayScoreboard;
    if (!board || !Array.isArray(board.matches)) return;
    var matches = board.matches.map(function (m) {
      if (!m || String(m.id) !== String(id)) return m;
      return Object.assign({}, m, { expanded: !m.expanded });
    });
    this.setData({ 'standings.matchPlayScoreboard.matches': matches });
  },

  onStandingsRoundTap: function (e) {
    var key = readRoundDockEventKey(e);
    if (!key) return;
    if (!(this.data.standings && this.data.standings.available)) return;
    if (key === this._standingsSelectedKey) return;
    // 切换轮次轻量重投影；不改写 roundSelectorScrollLeft；不 capture/restore scrollTop
    var nextView = this._resolveStandingsBoardViewForKey(key);
    var perRoundN = !!(this.data.standings && this.data.standings.mode === 'per_round_n');
    var clearExpand =
      !perRoundN && (standingsViewModel.isCumulativeStandingsKey(key) || nextView !== 'team')
        ? { expandedStandingsTeamId: '' }
        : {};
    var extraBase = Object.assign({}, this._emptyStandingsScorecardPatch(), clearExpand);
    var self = this;
    var applyRebuild = function (extra) {
      self._standingsSelectedKey = key;
      self._standingsVisited = true;
      self._standingsUserPicked = true;
      self._frozenStandingsScorecard = null;
      self._standingsPersonalOpenIndex = -1;
      self._frozenPersonalBoardMatch = null;
      self._rebuildStandingsProjection(extra || extraBase);
    };
    if (!this.data.isStickyRoundSelector) {
      applyRebuild(extraBase);
      return;
    }
    var token = (this._standingsHostHoldToken || 0) + 1;
    this._standingsHostHoldToken = token;
    this._measureStandingsContentHostHeight(function (h) {
      if (!self._pageAlive || token !== self._standingsHostHoldToken) return;
      extraBase.contentHostMinHeight = computeStickyContentHostHoldMinHeight(
        self.data.contentHostMinHeight,
        h
      );
      applyRebuild(extraBase);
    });
  },

  /** 报名子 TAB：只改 activeParticipantId，整包重建 register 投影（不写 storage） */
  _rebuildRegisterProjection: function () {
    if (!this._pageAlive) return;
    var series = registerViewModel.pickAuthoritativeSeriesForRegisterRefresh({
      storeSeries: this._seriesId ? seriesStore.getSeriesById(this._seriesId) : null,
      fallbackSeries: this._lastSeriesForRegister
    });
    if (!series) return;
    this._lastSeriesForRegister = series;
    var register = this._buildEnrichedRegisterViewModel(
      series,
      this._registerActiveParticipantId
    );
    if (register && register.activeParticipantId) {
      this._registerActiveParticipantId = register.activeParticipantId;
    }
    var self = this;
    var stickyTab = !!(this.data.isStickyTab);
    var dockPatch = this._resolveBottomDockVisibilityPatch(
      this._scrollTop || 0,
      stickyTab,
      { register: register }
    );
    // 不重置 registerSubTabScrollLeft / rosterMinHeight（重测不先归零）
    this._safeSetData(Object.assign({ register: register }, dockPatch), function () {
      if (!self._pageAlive || self._activeTab !== 'register') return;
      self.computeRosterMinHeight();
    });
  },

  /**
   * 写成功后：从最新 Series roster 同帧重建 register。
   * 不重置 registerSubTabScrollLeft；不清零 rosterMinHeight/filler
   */
  _applyRegisterWriteSuccess: function (series, preferredParticipantId, extraPatch) {
    if (!this._pageAlive) return;
    this._registerRenderEpoch = registerViewModel.bumpRegisterRenderEpoch(this._registerRenderEpoch);
    var renderEpoch = this._registerRenderEpoch;
    var nextSeries = registerViewModel.pickAuthoritativeSeriesForRegisterRefresh({
      storeSeries: this._seriesId ? seriesStore.getSeriesById(this._seriesId) : null,
      resultSeries: series && typeof series === 'object' ? series : null,
      fallbackSeries: this._lastSeriesForRegister
    });
    if (!nextSeries) {
      this.reloadViewModel({ resetScroll: false });
      return;
    }
    this._lastSeriesForRegister = nextSeries;
    if (preferredParticipantId) this._registerActiveParticipantId = String(preferredParticipantId).trim();
    var register = this._buildEnrichedRegisterViewModel(nextSeries, this._registerActiveParticipantId);
    if (register && register.activeParticipantId) {
      this._registerActiveParticipantId = register.activeParticipantId;
    }
    var self = this;
    var stickyTab = !!(this.data.isStickyTab);
    var patch = Object.assign(
      {
        register: register,
        registerSheetVisible: false,
        registerSheetParticipantId: '',
        registerSubmitting: false,
        registerCancelModalVisible: false,
        registerCancelSubmitting: false
      },
      extraPatch && typeof extraPatch === 'object' ? extraPatch : {}
    );
    var overlayActive = seriesLayerStack.resolveIsManageOverlayActiveFromData(
      this.data,
      patch
    );
    patch.isManageOverlayActive = overlayActive;
    Object.assign(
      patch,
      this._resolveBottomDockVisibilityPatch(this._scrollTop || 0, stickyTab, {
        register: register,
        isManageOverlayActive: overlayActive
      })
    );
    if (!registerViewModel.canApplyRegisterRender(this._registerRenderEpoch, renderEpoch)) {
      return;
    }
    this._safeSetData(patch, function () {
      if (!self._pageAlive) return;
      if (!registerViewModel.canApplyRegisterRender(self._registerRenderEpoch, renderEpoch)) {
        return;
      }
      if (!self.data.isManageOverlayActive) {
        self._syncStickyByScroll(
          self._scrollTop != null ? self._scrollTop : self.data.scrollYState || 0
        );
      }
      if (self._activeTab !== 'register') return;
      var run = function () {
        if (!self._pageAlive || self._activeTab !== 'register') return;
        if (!registerViewModel.canApplyRegisterRender(self._registerRenderEpoch, renderEpoch)) {
          return;
        }
        self.measureRegisterExtTop();
      };
      if (typeof wx !== 'undefined' && typeof wx.nextTick === 'function') {
        wx.nextTick(run);
      } else {
        setTimeout(run, 0);
      }
    });
  },

  _handleRegistrationConflict: function () {
    if (!this._pageAlive) return;
    this._clearProxyRegistrationTempState(true);
    var self = this;
    this._closeManageSecondaryPatch(
      {
        registerSheetVisible: false,
        registerSheetParticipantId: '',
        registerSheetOptions: [],
        registerSubmitting: false,
        registerCancelModalVisible: false,
        registerCancelSubmitting: false,
        registerForOtherSheetVisible: false,
        proxyGroupSheetVisible: false,
        proxyMemberSourceSheetVisible: false,
        registerForOtherManualVisible: false,
        pendingProxyPlayers: [],
        proxyGroupOptions: [],
        proxyGroupId: ''
      },
      function () {
        if (!self._pageAlive) return;
        self.reloadViewModel({ resetScroll: false });
      }
    );
    if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
      wx.showToast({ title: '报名状态已变化，请重新操作', icon: 'none' });
    }
  },

  switchRegisterSubTab: function (e) {
    var id =
      e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.id : '';
    id = id != null ? String(id).trim() : '';
    if (!id) return;
    if (id === this._registerActiveParticipantId) return;
    this._registerActiveParticipantId = id;
    this._rebuildRegisterProjection();
  },

  onRegisterCtaTap: function () {
    if (!this._pageAlive) return;
    // C3-Z / C3-D：M 弹层或滚动隐藏时均拦截
    if (this.data.isManageOverlayActive) return;
    if (!this.data.showRegisterBottomAction) return;
    var cta = (this.data.register && this.data.register.cta) || {};
    if (cta.disabled) return;
    if (cta.action === 'register') {
      this.openRegisterSheet();
      return;
    }
    if (cta.action === 'cancel') {
      this.openCancelRegisterModal();
    }
  },

  /**
   * 报名名单 → 球员主页（对齐 detail.onRegisterPlayerProfileTap）
   * 头像 catchtap / 行 bindtap（昵称随行，权威同队际赛整行可进）
   * 禁止 seriesParticipantId / rosterEntryId / entityId / unitId 冒充 userId
   */
  onRegisterAvatarTap: function (e) {
    this._openRegisterRosterProfile(e);
  },

  onRegisterRosterProfileTap: function (e) {
    this._openRegisterRosterProfile(e);
  },

  _openRegisterRosterProfile: function (e) {
    if (!this._pageAlive) return;
    var ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
    var userId =
      ds.profileuserid ||
      ds.profileUserId ||
      ds.userid ||
      ds.userId ||
      '';
    var playerId = ds.playerid || ds.playerId || userId;
    var targetUserId = openPlayerProfileUtil.resolveOpenableUserId({
      userId: userId,
      playerId: playerId,
      userType: ds.usertype || ds.userType
    });
    if (!targetUserId) {
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '该球员暂无主页', icon: 'none', duration: 1200 });
      }
      return;
    }
    if (this._registerProfileNavLock) return;
    this._registerProfileNavLock = true;
    var self = this;
    openPlayerProfileUtil.openPlayerProfile({
      userId: targetUserId,
      playerId: targetUserId,
      publicName: ds.name,
      name: ds.name,
      avatar: ds.avatar,
      userType: ds.usertype || ds.userType,
      identitySource: ds.identitysource || ds.identitySource || 'seriesRoster'
    });
    setTimeout(function () {
      self._registerProfileNavLock = false;
    }, 600);
  },

  openRegisterSheet: function () {
    if (!this._pageAlive) return;
    if (this._registerWriteLock || this.data.registerSubmitting) return;
    var cta = (this.data.register && this.data.register.cta) || {};
    if (cta.action !== 'register' || cta.disabled) return;

    var series = seriesStore.getSeriesById(this._seriesId);
    if (!series) {
      this._toastRegisterFailure('series_not_found');
      return;
    }
    this._lastSeriesForRegister = series;
    var resolved = this._resolveRegisterIdentity();
    if (!resolved.identity.ok) {
      this._toastRegisterFailure('identity_unresolved');
      return;
    }
    var eligibility = seriesRegisterEligibility.resolveSeriesRegistrationEligibility({
      series: series,
      playerId: resolved.identity.playerId
    });
    this._lastEligibility = eligibility;
    if (!eligibility.eligibleParticipantIds || !eligibility.eligibleParticipantIds.length) {
      this._toastRegisterFailure(eligibility.reason || 'affiliation_unresolved');
      this._rebuildRegisterProjection();
      return;
    }

    var profile = resolved.profile;
    var defaultId = eligibility.defaultSheetParticipantId || '';
    var groupLabel =
      eligibility.hostMode === 'team' ? '选择分队' : '选择球队';

    this._registerSheetMode = 'self';
    this._safeSetData({
      registerSheetVisible: true,
      registerSheetMode: 'self',
      registerSheetTitle: registerViewModel.SERIES_SELF_REGISTER_SHEET_TITLE,
      registerSheetSub: registerViewModel.SERIES_SELF_REGISTER_SHEET_SUB,
      registerSheetParticipantId: defaultId,
      registerSheetOptions: eligibility.options || [],
      registerSheetGroupLabel: groupLabel,
      registerCompetitionNameDraft:
        userProfileStore.getRegisterCompetitionNameDefault(profile),
      registerGenderDraft: profile.gender || '',
      registerPhone: registerViewModel.resolveSelfRegisterPhone(
        resolved.currentUser,
        profile
      ),
      registerSubmitting: false
    });
  },

  closeRegisterSheet: function () {
    if (!this._pageAlive) return;
    if (this._registerWriteLock || this.data.registerSubmitting) return;
    this._registerSheetMode = 'self';
    this._safeSetData({
      registerSheetVisible: false,
      registerSheetParticipantId: '',
      registerSheetMode: 'self',
      registerSheetTitle: registerViewModel.SERIES_SELF_REGISTER_SHEET_TITLE,
      registerSheetSub: registerViewModel.SERIES_SELF_REGISTER_SHEET_SUB
    });
  },

  selectRegisterSheetParticipant: function (e) {
    if (!this._pageAlive) return;
    if (this._registerWriteLock || this.data.registerSubmitting) return;
    var id =
      e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.id : '';
    id = id != null ? String(id).trim() : '';
    if (!id) return;
    var options = this.data.registerSheetOptions || [];
    var allowed = options.some(function (opt) {
      return opt && String(opt.id) === id;
    });
    if (!allowed) return;
    this._safeSetData({ registerSheetParticipantId: id });
  },

  onRegisterCompetitionNameInput: function (e) {
    if (!this._pageAlive) return;
    var value = e && e.detail && e.detail.value != null ? e.detail.value : '';
    this._safeSetData({ registerCompetitionNameDraft: value });
  },

  stopPropagation: function () {},

  confirmRegister: function () {
    if (!this._pageAlive) return;
    if (this._registerWriteLock || this.data.registerSubmitting) return;
    if (!this._registrationService) return;

    var seriesParticipantId = String(this.data.registerSheetParticipantId || '').trim();
    if (!seriesParticipantId) {
      var pickToast =
        this._lastEligibility && this._lastEligibility.hostMode === 'team'
          ? '请选择报名分队'
          : '请选择报名球队';
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: pickToast, icon: 'none' });
      }
      return;
    }

    var competitionName = userProfileStore.resolveRegisterCompetitionName(
      this.data.registerCompetitionNameDraft
    );
    if (!competitionName) {
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '请输入比赛名', icon: 'none' });
      }
      return;
    }

    var resolved = this._resolveRegisterIdentity();
    if (!resolved.identity.ok) {
      this._toastRegisterFailure('identity_unresolved');
      return;
    }
    var actorPlayerId = resolved.identity.playerId;
    var profile = resolved.profile;
    var series = seriesStore.getSeriesById(this._seriesId);
    if (!series) {
      this._toastRegisterFailure('series_not_found');
      return;
    }
    var expectedRevision = Number(series.registrationRevision);
    if (!Number.isFinite(expectedRevision) || expectedRevision < 0) expectedRevision = 0;

    this._registerWriteLock = true;
    this._safeSetData({ registerSubmitting: true });
    var result = null;
    try {
      try {
        userProfileStore.persistRegisterCompetitionDraft(competitionName);
      } catch (ePersist) {
        /* 资料回写失败不阻断报名写 */
      }
      result = this._registrationService.registerSelf({
        seriesId: this._seriesId,
        seriesParticipantId: seriesParticipantId,
        expectedRegistrationRevision: expectedRevision,
        actor: {
          playerId: actorPlayerId,
          userId: actorPlayerId,
          name: competitionName
        },
        player: {
          playerId: actorPlayerId,
          userId: actorPlayerId,
          competitionName: competitionName,
          playerNameSnapshot: competitionName,
          avatar: profile.avatar,
          playerAvatarSnapshot: profile.avatar,
          gender: profile.gender,
          genderSnapshot: profile.gender,
          handicap: profile.handicap,
          handicapSnapshot: profile.handicap,
          floatCoef: profile.floatCoef,
          floatCoefSnapshot: profile.floatCoef,
          phone: registerViewModel.resolveSelfRegisterPhone(
            resolved.currentUser,
            profile
          ),
          phoneSnapshot: registerViewModel.resolveSelfRegisterPhone(
            resolved.currentUser,
            profile
          )
        }
      });
    } catch (eWrite) {
      result = { ok: false, reason: 'storage_write_failed' };
    } finally {
      this._registerWriteLock = false;
      if (this._pageAlive && !(result && result.ok)) {
        this._safeSetData({ registerSubmitting: false });
      }
    }

    if (!this._pageAlive) return;

    if (result && result.reason === 'registration_conflict') {
      this._handleRegistrationConflict();
      return;
    }
    if (!result || !result.ok) {
      this._toastRegisterFailure((result && result.reason) || 'storage_write_failed');
      return;
    }

    this._registerSheetMode = 'self';
    this._applyRegisterWriteSuccess(
      result.series,
      seriesParticipantId
    );
    if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
      wx.showToast({ title: '报名成功', icon: 'success' });
    }
  },

  _recoverInterruptedSelfCancellationOnce: function () {
    if (!this._selfCancelOrchestrator) return;
    try {
      this._selfCancelOrchestrator.recoverInterruptedSelfCancellation();
    } catch (eRecover) {
      /* 恢复失败不阻断首次加载 */
    }
  },

  _applySelfCancelCtaInspectAfterReload: function (inspectToken, register) {
    if (!this._pageAlive) return;
    if (!canApplySelfCancelInspect(this._selfCancelInspectToken, inspectToken)) return;
    if (!hasActiveSelfRegistration(register)) return;
    var playerId = String(register.currentUserRegistration.playerId).trim();
    var inspect = this._inspectSelfCancelImpact(playerId);
    this._commitSelfCancelCtaLock(inspectToken, inspect);
  },

  _commitSelfCancelCtaLock: function (inspectToken, inspect) {
    if (!this._pageAlive) return;
    if (!canApplySelfCancelInspect(this._selfCancelInspectToken, inspectToken)) return;
    var register = this.data.register;
    if (!hasActiveSelfRegistration(register)) return;
    var nextCta = resolveSelfCancelLockCta(register.cta, inspect);
    this._safeSetData({ 'register.cta': nextCta });
  },

  _inspectSelfCancelImpact: function (playerId) {
    if (!this._selfCancelOrchestrator) {
      return { ok: false, grouped: false, blockedReason: 'storage_failed' };
    }
    try {
      return this._selfCancelOrchestrator.inspectSelfCancellationImpact({
        seriesId: this._seriesId,
        playerId: playerId,
        actorUserId: playerId
      });
    } catch (eInspect) {
      return { ok: false, grouped: false, blockedReason: 'storage_failed' };
    }
  },

  openCancelRegisterModal: function () {
    if (!this._pageAlive) return;
    if (this._registerWriteLock || this.data.registerSubmitting) return;
    var cta = (this.data.register && this.data.register.cta) || {};
    if (cta.action !== 'cancel' || cta.disabled) return;
    var resolved = this._resolveRegisterIdentity();
    if (!resolved.identity.ok) {
      this._toastRegisterFailure('identity_unresolved');
      return;
    }
    var inspect = this._inspectSelfCancelImpact(resolved.identity.playerId);
    var blocked = inspect && inspect.blockedReason ? String(inspect.blockedReason) : '';
    if (blocked === 'player_has_real_score' || blocked === 'managed_station_invalid') {
      this._toastRegisterFailure(blocked);
      return;
    }
    if (inspect && inspect.ok === false && blocked) {
      this._toastRegisterFailure(blocked);
      return;
    }
    var copy = inspect && inspect.grouped ? REG_SELF_CANCEL_GROUPED : REG_SELF_CANCEL_UNGROUPED;
    this._safeSetData({
      registerCancelModalVisible: true,
      registerCancelModalTitle: copy.title,
      registerCancelModalDesc: copy.desc,
      registerCancelModalCancelText: copy.cancelText,
      registerCancelModalConfirmText: copy.confirmText,
      registerCancelSubmitting: false
    });
  },

  closeCancelRegisterModal: function () {
    if (!this._pageAlive) return;
    this._safeSetData({
      registerCancelModalVisible: false,
      registerCancelSubmitting: false
    });
  },

  confirmCancelRegistration: function () {
    if (!this._pageAlive) return;
    if (this._registerWriteLock || this.data.registerSubmitting) return;
    if (this.data.registerCancelSubmitting) return;
    if (!this._selfCancelOrchestrator) return;
    var cta = (this.data.register && this.data.register.cta) || {};
    if (cta.action !== 'cancel' || cta.disabled) {
      this.closeCancelRegisterModal();
      return;
    }
    this._safeSetData({
      registerCancelModalVisible: false,
      registerCancelSubmitting: true
    });

    var resolved = this._resolveRegisterIdentity();
    if (!resolved.identity.ok) {
      this._safeSetData({ registerCancelSubmitting: false });
      this._toastRegisterFailure('identity_unresolved');
      return;
    }
    var playerId = resolved.identity.playerId;
    var series = seriesStore.getSeriesById(this._seriesId);
    if (!series) {
      this._safeSetData({ registerCancelSubmitting: false });
      this._toastRegisterFailure('series_not_found');
      return;
    }
    var expectedRevision = Number(series.registrationRevision);
    if (!Number.isFinite(expectedRevision) || expectedRevision < 0) expectedRevision = 0;

    this._registerWriteLock = true;
    this._safeSetData({ registerSubmitting: true });
    var result = null;
    try {
      result = this._selfCancelOrchestrator.cancelSelfRegistrationWithStationCleanup({
        seriesId: this._seriesId,
        playerId: playerId,
        actorUserId: playerId,
        expectedRegistrationRevision: expectedRevision
      });
    } catch (eCancel) {
      result = { ok: false, reason: 'storage_write_failed' };
    } finally {
      this._registerWriteLock = false;
      if (this._pageAlive) {
        this._safeSetData({
          registerSubmitting: false,
          registerCancelSubmitting: false
        });
      }
    }

    if (!this._pageAlive) return;

    if (result && result.reason === 'registration_conflict') {
      this._handleRegistrationConflict();
      return;
    }
    if (!result || !result.ok) {
      this._toastRegisterFailure((result && result.reason) || 'storage_write_failed');
      return;
    }

    if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
      wx.showToast({ title: '已取消报名', icon: 'success' });
    }
    this.reloadViewModel({ resetScroll: false });
  },

  _measureStandingsExpandedPanelHeight: function (teamId, cb) {
    var done = typeof cb === 'function' ? cb : function () {};
    var tid = teamId != null ? String(teamId).trim() : '';
    if (!tid || typeof this.createSelectorQuery !== 'function') {
      done(0);
      return;
    }
    // 手风琴同时仅一块面板；class + data-team-id 稳定标识
    this.createSelectorQuery()
      .select('.series-standings-expanded-panel')
      .boundingClientRect()
      .exec(function (res) {
        var rect = res && res[0];
        var h = rect && rect.height > 0 ? Number(rect.height) : 0;
        if (!Number.isFinite(h) || h < 0) h = 0;
        done(h);
      });
  },

  /**
   * 收起/切换后若仍被 clamp（差值>2px）仅恢复一次 scrollTop
   */
  _restoreStandingsCollapseScrollIfNeeded: function () {
    var g = this._standingsCollapseScrollGuard;
    if (!g || g.restored) return;
    if (!this._pageAlive) {
      this._standingsCollapseScrollGuard = null;
      return;
    }
    var before = Number(g.beforeScrollTop);
    if (!Number.isFinite(before) || before < 0) before = 0;
    var current = Number(this._scrollTop);
    if (!Number.isFinite(current) || current < 0) current = 0;
    if (Math.abs(current - before) <= 2) {
      this._standingsCollapseScrollGuard = null;
      return;
    }
    if (!(current + 2 < before)) {
      this._standingsCollapseScrollGuard = null;
      return;
    }
    g.restored = true;
    this._standingsCollapseScrollGuard = null;
    var self = this;
    this._skipScrollReset = true;
    this._scrollTop = before;
    this.setData({ scrollTop: before }, function () {
      self._skipScrollReset = false;
      self._syncStickyByScroll(before);
    });
  },

  /**
   * 应用展开态；closingPanelHeight>0 时同帧预增 filler，避免收起高度瞬降
   */
  _emptyStandingsScorecardPatch: function () {
    return {
      openStandingsScorecardKey: '',
      openStandingsScorecard: null,
      standingsScorecardEmptyLabel: '',
      standingsScorecardCourseTitle: '',
      standingsScorecardAdImage: '',
      standingsScorecardPlayer: null,
      standingsScorecardAvatarBadge: 'none',
      standingsTeamGroupLogoById: {},
      standingsScorecardShowNameGender: true,
      standingsScorecardFollowed: false,
      standingsScorecardRelationStatus: 'none',
      standingsScorecardRelationLabel: '',
      standingsScorecardCanFollow: false,
      standingsScorecardFollowLoading: false,
      standingsScorecardIsSelf: false
    };
  },

  _applyStandingsExpandChange: function (nextId, closingPanelHeight, beforeScrollTop) {
    var self = this;
    this._scrollLayoutAnchor = null;
    var nid = nextId != null ? String(nextId) : '';
    var panelH = Number(closingPanelHeight);
    if (!Number.isFinite(panelH) || panelH < 0) panelH = 0;
    var currentFiller = Number(this.data.scrollFillerHeight) || 0;
    if (!Number.isFinite(currentFiller) || currentFiller < 0) currentFiller = 0;
    var patch = Object.assign({ expandedStandingsTeamId: nid }, this._emptyStandingsScorecardPatch());
    this._frozenStandingsScorecard = null;
    if (panelH > 0) {
      // 删除面板高度 ≈ 同时增加 filler，总 scrollHeight 近似不变
      patch.scrollFillerHeight = currentFiller + panelH;
      this._standingsCollapseScrollGuard = {
        beforeScrollTop: beforeScrollTop,
        restored: false
      };
    } else {
      this._standingsCollapseScrollGuard = null;
    }
    this.setData(patch, function () {
      self._standingsExpandTapLocked = false;
      if (!self._pageAlive) return;
      var run = function () {
        if (!self._pageAlive) return;
        self.scheduleStandingsContentFillerMeasure();
        self._restoreStandingsCollapseScrollIfNeeded();
      };
      if (typeof wx !== 'undefined' && typeof wx.nextTick === 'function') {
        wx.nextTick(run);
      } else {
        setTimeout(run, 0);
      }
    });
  },

  onLiveLeaderboardTeamTap: function (e) {
    var teamId = e && e.detail && e.detail.teamId != null ? String(e.detail.teamId).trim() : '';
    this.onStandingsTeamTap({
      currentTarget: { dataset: { participantId: teamId } }
    });
  },

  onLiveLeaderboardScorecardTap: function (e) {
    var standings = this.data.standings || {};
    if (!standings.useLiveLeaderboard) return;
    var selectedKey =
      this._standingsSelectedKey != null ? String(this._standingsSelectedKey).trim() : '';
    if (!selectedKey || standingsViewModel.isCumulativeStandingsKey(selectedKey)) return;
    var ctx = this._resolveStandingsRoundContext(selectedKey);
    var match = this._frozenPersonalBoardMatch || ctx.match;
    var result = liveLeaderboardScorecard.applyLiveScorecardTap(
      {
        view: 'team',
        openIndex: this.data.openStandingsScorecardKey,
        teamLeaderboard: standings.liveTeamLeaderboard,
        leaderboard: standings.liveLeaderboard,
        match: match,
        scoreDisplayMode: this.data.standingsScoreDisplayMode
      },
      (e && e.detail) || {}
    );
    var self = this;
    this.setData(
      {
        openStandingsScorecardKey: result.openIndex,
        openStandingsScorecard: result.openScorecard,
        standingsScorecardCourseTitle: result.scorecardCourseTitle || '',
        standingsScorecardEmptyLabel: '',
        standingsScorePanel: result.scorePanel || 'technical',
        standingsScorecardAdImage: match ? this._resolveStandingsScorecardAdImage(match) : ''
      },
      function () {
        if (!self._pageAlive) return;
        self.scheduleStandingsContentFillerMeasure();
      }
    );
  },

  /**
   * 轻量展开/收起（不重建 standings）
   * - 无展开→开 A：仅改 id
   * - 开 A→收起 / 开 A→开 B：先测 A 面板，同帧预补偿 filler
   */
  onStandingsTeamTap: function (e) {
    var pid =
      e && e.currentTarget && e.currentTarget.dataset
        ? e.currentTarget.dataset.participantId
        : '';
    pid = pid != null ? String(pid).trim() : '';
    if (!pid) return;
    if (!(this.data.standings && this.data.standings.available)) return;
    var currentId =
      this.data.expandedStandingsTeamId != null
        ? String(this.data.expandedStandingsTeamId).trim()
        : '';
    var nextId = currentId === pid ? '' : pid;
    // 测量期间忽略重复点击；锁仅覆盖单次测量+setData
    if (this._standingsExpandTapLocked) return;

    // 空 → 展开：内容增高不会压缩滚动范围，无需预补偿
    if (!currentId) {
      this._applyStandingsExpandChange(nextId, 0, this._scrollTop || 0);
      return;
    }

    // 收起 A 或 A→B：先测 A 高度，同帧 filler+=A 并切换
    var beforeScrollTop = Number(this._scrollTop);
    if (!Number.isFinite(beforeScrollTop) || beforeScrollTop < 0) beforeScrollTop = 0;
    this._standingsExpandTapLocked = true;
    var token = (this._standingsExpandMeasureToken || 0) + 1;
    this._standingsExpandMeasureToken = token;
    var closingId = currentId;
    var self = this;
    this._measureStandingsExpandedPanelHeight(closingId, function (panelHeight) {
      if (!self._pageAlive || token !== self._standingsExpandMeasureToken) {
        self._standingsExpandTapLocked = false;
        return;
      }
      var h = Number(panelHeight);
      if (!Number.isFinite(h) || h < 0) h = 0;
      self._applyStandingsExpandChange(nextId, h, beforeScrollTop);
    });
  },

  /**
   * 总榜球员行：行内展开/收起（对齐 detail.toggleScorecard mode=team）
   * - 已分组即可点（含未开赛 / 无杆数空态）
   * - TOT 按该行 roundId 打开真实单轮详情，不制作累计逐洞卡
   * - 仅轻量 setData；不重建 standings、不改 selectedKey / 球队展开 / scroll / 吸顶
   */
  onStandingsPlayerTap: function (e) {
    var ds =
      e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset : {};
    var player = ds.player && typeof ds.player === 'object' ? ds.player : null;
    if (!player) return;
    if (!player.canOpenScorecard) return;

    var selectedKey =
      this._standingsSelectedKey != null
        ? String(this._standingsSelectedKey).trim()
        : '';
    var scorecardKey =
      player.scorecardKey != null && String(player.scorecardKey).trim()
        ? String(player.scorecardKey).trim()
        : player.occurrenceKey != null && String(player.occurrenceKey).trim()
          ? String(player.occurrenceKey).trim()
          : ds.index != null
            ? String(ds.index).trim()
            : '';
    if (!scorecardKey) return;

    var currentKey =
      this.data.openStandingsScorecardKey != null
        ? String(this.data.openStandingsScorecardKey).trim()
        : '';
    var nextKey = standingsViewModel.nextStandingsOpenKey(currentKey, scorecardKey);
    if (!nextKey) {
      this._frozenStandingsScorecard = null;
      var selfClose = this;
      this.setData(this._emptyStandingsScorecardPatch(), function () {
        if (!selfClose._pageAlive) return;
        selfClose.scheduleStandingsContentFillerMeasure();
      });
      return;
    }

    var opened = this._openStandingsPlayerScorecard(player, nextKey, selectedKey);
    if (!opened.ok) {
      if (opened.toast) {
        wx.showToast({ title: opened.toast, icon: 'none' });
      }
      return;
    }
  },

  /**
   * 已开赛共享个人榜行点击：冻结当前轮 match 打开/关闭行内记分卡
   * 不 reload Series，不回写 scrollTop / roundSelectorScrollLeft
   */
  onStandingsPersonalLeaderboardRowTap: function (e) {
    var idx = Number(e && e.detail ? e.detail.index : NaN);
    if (!Number.isFinite(idx)) return;
    var selectedKey =
      this._standingsSelectedKey != null
        ? String(this._standingsSelectedKey).trim()
        : '';
    if (!selectedKey || standingsViewModel.isCumulativeStandingsKey(selectedKey)) return;
    var standings = this.data.standings || {};
    if (!standings.useLiveLeaderboard && !standings.showSharedPersonalBoard) return;
    var selection = standings.selection || {};
    if (selection.view === 'team') return;

    if (standings.useLiveLeaderboard) {
      var liveCtx = this._resolveStandingsRoundContext(selectedKey);
      var liveMatch = this._frozenPersonalBoardMatch || liveCtx.match;
      var liveResult = liveLeaderboardScorecard.applyLiveScorecardTap(
        {
          view: 'all',
          openIndex: this._standingsPersonalOpenIndex,
          teamLeaderboard: standings.liveTeamLeaderboard,
          leaderboard: standings.liveLeaderboard,
          match: liveMatch,
          scoreDisplayMode: this.data.standingsScoreDisplayMode
        },
        (e && e.detail) || {}
      );
      this._standingsPersonalOpenIndex = liveResult.openIndex;
      this._reprojectStandingsBoardOverlay({
        openStandingsScorecard: liveResult.openScorecard,
        standingsScorecardCourseTitle: liveResult.scorecardCourseTitle || '',
        standingsScorecardEmptyLabel: '',
        standingsScorePanel: liveResult.scorePanel || 'technical',
        standingsScorecardAdImage: liveMatch
          ? this._resolveStandingsScorecardAdImage(liveMatch)
          : ''
      });
      return;
    }

    var current = this._standingsPersonalOpenIndex;
    if (current === idx) {
      this._standingsPersonalOpenIndex = -1;
      this._frozenStandingsScorecard = null;
      this._reprojectStandingsBoardOverlay(this._emptyStandingsScorecardPatch());
      return;
    }

    var rows = Array.isArray(standings.liveLeaderboard)
      ? standings.liveLeaderboard
      : Array.isArray(standings.personalLeaderboard)
        ? standings.personalLeaderboard
        : [];
    var row = rows[idx];
    if (!row) return;

    var match = this._frozenPersonalBoardMatch;
    var ctx = this._resolveStandingsRoundContext(selectedKey);
    if (!match) match = ctx.match;
    var verified = seriesStandingsAssembler.verifyManagedStation(
      ctx.series,
      ctx.round,
      match,
      ctx.indexLink
    );
    if (!match || !verified || !verified.ok) {
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '本轮比赛数据异常', icon: 'none' });
      }
      return;
    }

    this._standingsPersonalOpenIndex = idx;
    var playerId =
      row.playerId != null
        ? String(row.playerId).trim()
        : row.userId != null
          ? String(row.userId).trim()
          : '';
    this._frozenStandingsScorecard = {
      seriesId: this._seriesId != null ? String(this._seriesId).trim() : '',
      roundId: selectedKey,
      matchId: match.matchId != null ? String(match.matchId).trim() : '',
      playerId: playerId,
      entityId: row.entityId != null ? String(row.entityId).trim() : '',
      groupId: row.groupId != null ? String(row.groupId).trim() : '',
      isEntity: !!row.isEntity
    };
    var adImage = this._resolveStandingsScorecardAdImage(match);
    if (standings.prestartExpandMode === 'teeing_off_soon' || row.pendingPrestart) {
      this._reprojectStandingsBoardOverlay({
        openStandingsScorecard: null,
        standingsScorecardCourseTitle: '',
        standingsScorecardAdImage: adImage
      });
      return;
    }
    var built = teamMatchScorecard.buildTeamMatchScorecardView(
      match,
      row,
      this.data.standingsScoreDisplayMode || 'gross'
    );
    this._reprojectStandingsBoardOverlay({
      openStandingsScorecard: built && built.ok ? built.scorecard : null,
      standingsScorecardCourseTitle: teamMatchScorecard.buildScorecardCourseTitle(match),
      standingsScorecardAdImage: adImage
    });
  },

  /** 平面榜（个人/组合/配对）行点击 → 复用记分卡展开 */
  onStandingsListRowTap: function (e) {
    var ds =
      e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset : {};
    var row = ds.row && typeof ds.row === 'object' ? ds.row : null;
    if (!row || !row.canOpenScorecard) return;
    // 合成 player 形状供记分卡打开
    var player = Object.assign({}, row, {
      scorecardKey: row.scorecardKey,
      canOpenScorecard: true,
      playerId: row.playerId || (row.members && row.members[0] && row.members[0].playerId) || '',
      entityId: row.entityId || '',
      isEntity: !!row.isEntity,
      resultUnitType: row.resultUnitType || 'player'
    });
    this.onStandingsPlayerTap({
      currentTarget: {
        dataset: {
          player: player,
          index: row.scorecardKey
        }
      }
    });
  },

  _resolveStandingsRoundById: function (series, roundId) {
    var rid = roundId != null ? String(roundId).trim() : '';
    var rounds = series && Array.isArray(series.rounds) ? series.rounds : [];
    for (var i = 0; i < rounds.length; i++) {
      if (rounds[i] && String(rounds[i].roundId || '').trim() === rid) return rounds[i];
    }
    return null;
  },

  /**
   * 领先榜逐洞下方广告：对齐 detail._resolveScorecardAdImage
   * 当前轮 managed match.eventInfoList 首张 image → DEFAULT_SCORECARD_AD_IMAGE
   */
  _resolveStandingsScorecardAdImage: function (match) {
    var theme = 'bright';
    try {
      if (typeof getApp === 'function') {
        var app = getApp();
        if (app && typeof app.getTheme === 'function') theme = app.getTheme() || 'bright';
      }
    } catch (eTheme) {
      theme = 'bright';
    }
    if (this.data.themeClass === 'dark-mode') theme = 'dark';
    var list = match && Array.isArray(match.eventInfoList) ? match.eventInfoList : [];
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!item || String(item.type) !== 'image') continue;
      var bright = String(
        item.brightImage != null ? item.brightImage : item.imageData || ''
      ).trim();
      var dark = String(
        item.darkImage != null ? item.darkImage : item.imageData || ''
      ).trim();
      var image = theme === 'dark' ? dark || bright : bright || dark;
      if (image) return image;
    }
    return DEFAULT_SCORECARD_AD_IMAGE;
  },

  /**
   * 对齐 R1 个人榜 identity 契约：复用 projectStandingsScorecardIdentity。
   * 角标只读该轮正式席位，不默认第一队，不用 entityId / occurrenceKey 冒充。
   */
  _buildStandingsScorecardIdentityPlayer: function (player, match, series) {
    try {
      return (
        seriesStandingsExpandIdentity.projectStandingsScorecardIdentity(match, series, player) || {
          player: null,
          avatarBadge: 'none',
          metaMode: 'countryAge',
          showNameGender: false,
          profileUserId: ''
        }
      );
    } catch (eProj) {
      return {
        player: null,
        avatarBadge: 'none',
        metaMode: 'countryAge',
        showNameGender: false,
        profileUserId: ''
      };
    }
  },

  _buildStandingsTeamGroupLogoById: function (match, series) {
    return seriesStandingsExpandIdentity.buildStandingsTeamGroupLogoById(match, series) || {};
  },

  _findStandingsGroupIdForPlayer: function (match, playerId) {
    var pid = playerId != null ? String(playerId).trim() : '';
    if (!pid || !match) return '';
    var groups = Array.isArray(match.groups) ? match.groups : [];
    for (var g = 0; g < groups.length; g++) {
      var group = groups[g];
      var gid = group && group.groupId != null ? String(group.groupId).trim() : '';
      if (!gid) continue;
      var lists = [];
      if (Array.isArray(group.players)) lists.push(group.players);
      if (Array.isArray(group.playersSlots)) lists.push(group.playersSlots);
      for (var li = 0; li < lists.length; li++) {
        var list = lists[li];
        for (var i = 0; i < list.length; i++) {
          var seat = list[i];
          if (!seat || typeof seat !== 'object') continue;
          var sid =
            seat.playerId != null
              ? String(seat.playerId).trim()
              : seat.userId != null
                ? String(seat.userId).trim()
                : seat.id != null
                  ? String(seat.id).trim()
                  : '';
          if (sid && sid === pid) return gid;
        }
      }
    }
    return '';
  },

  _resolveStandingsProfilePlayerId: function (player) {
    var p = player && typeof player === 'object' ? player : {};
    var entityId = p.entityId != null ? String(p.entityId).trim() : '';
    var occ = p.occurrenceKey != null ? String(p.occurrenceKey).trim() : '';
    var teamPid = p.seriesParticipantId != null ? String(p.seriesParticipantId).trim() : '';
    var rosterPid = p.rosterEntryId != null ? String(p.rosterEntryId).trim() : '';
    function rejectImpersonator(id) {
      var v = id != null ? String(id).trim() : '';
      if (!v) return '';
      if (entityId && v === entityId) return '';
      if (occ && v === occ) return '';
      if (teamPid && v === teamPid) return '';
      if (rosterPid && v === rosterPid) return '';
      if (v.indexOf(':') >= 0 && v === occ) return '';
      return v;
    }
    var pid = rejectImpersonator(p.playerId) || rejectImpersonator(p.userId);
    if (pid) return pid;
    var members = Array.isArray(p.memberUserIds) ? p.memberUserIds : [];
    for (var i = 0; i < members.length; i++) {
      pid = rejectImpersonator(members[i]);
      if (pid) return pid;
    }
    return '';
  },

  _resolveStandingsCurrentUserId: function () {
    var currentUserId = '';
    try {
      currentUserId = String((gameStore.getCurrentUser() || {}).userId || '').trim();
    } catch (eCur) {
      currentUserId = '';
    }
    if (!currentUserId) {
      try {
        currentUserId = String((userProfileStore.loadProfile() || {}).userId || '').trim();
      } catch (eProf) {
        currentUserId = '';
      }
    }
    return currentUserId;
  },

  _buildStandingsScorecardFollowPatch: function (profileUserId) {
    var empty = {
      standingsScorecardFollowed: false,
      standingsScorecardRelationStatus: 'none',
      standingsScorecardRelationLabel: '',
      standingsScorecardCanFollow: false,
      standingsScorecardFollowLoading: false,
      standingsScorecardIsSelf: false
    };
    var uid = profileUserId != null ? String(profileUserId).trim() : '';
    if (!uid) return empty;
    var relationStatus = 'none';
    try {
      contactFollowAction.ensureStore();
      relationStatus = contactFollowAction.getRelationStatus(uid) || 'none';
    } catch (eRel) {
      relationStatus = 'none';
    }
    var display = seriesStandingsExpandIdentity.resolveStandingsFollowDisplay({
      profileUserId: uid,
      currentUserId: this._resolveStandingsCurrentUserId(),
      relationStatus: relationStatus
    });
    return {
      standingsScorecardFollowed: !!(display && display.followed),
      standingsScorecardRelationStatus: (display && display.relationStatus) || 'none',
      standingsScorecardRelationLabel: (display && display.relationLabel) || '',
      standingsScorecardCanFollow: !!(display && display.canFollow),
      standingsScorecardFollowLoading: false,
      standingsScorecardIsSelf: !!(display && display.isSelf)
    };
  },

  /**
   * 核验身份并打开展开面板；成绩只读该行 roundId 对应 managed match
   * TOT 不制作累计逐洞卡。核验失败不展开。
   * @returns {{ ok: boolean, toast?: string }}
   */
  _openStandingsPlayerScorecard: function (player, scorecardKey, selectedRoundId) {
    var fail = { ok: false, toast: '本轮比赛数据异常' };
    var seriesId = this._seriesId != null ? String(this._seriesId).trim() : '';
    var series = this._lastSeriesForStandings || (seriesId ? seriesStore.getSeriesById(seriesId) : null);
    if (!series || !seriesId) return fail;

    var roundId = standingsViewModel.resolveStandingsScorecardRoundId(player, selectedRoundId);
    if (!roundId) return fail;
    var round = this._resolveStandingsRoundById(series, roundId);
    if (!round) return fail;

    var matchId =
      (player && player.matchId != null ? String(player.matchId).trim() : '') ||
      (round.matchId != null ? String(round.matchId).trim() : '');
    if (!matchId) return fail;

    var match = null;
    var indexLink = null;
    try {
      match = teamMatchStore.getMatchById(matchId);
      indexLink = seriesStationIndex.getByMatchId(matchId);
    } catch (eRead) {
      return fail;
    }

    var verified = seriesStandingsAssembler.verifyManagedStation(
      series,
      round,
      match,
      indexLink
    );
    if (!verified || !verified.ok) return fail;

    var entityId = player && player.entityId != null ? String(player.entityId).trim() : '';
    var isEntity =
      !!(player && (player.isEntity || player.resultUnitType === 'entity' || player.resultUnitType === 'pair'));
    var playerId = this._resolveStandingsProfilePlayerId(player);
    var groupId = player && player.groupId != null ? String(player.groupId).trim() : '';
    if (!groupId && playerId) groupId = this._findStandingsGroupIdForPlayer(match, playerId);
    if (!groupId) return fail;

    if (isEntity && entityId) {
      if (playerId && !teamMatchScorecard.isPlayerInFormalGroups(match, playerId)) {
        return fail;
      }
      if (!teamMatchScorecard.isEntityInMatch(match, groupId, entityId, playerId)) {
        return fail;
      }
    } else {
      if (!playerId || !teamMatchScorecard.isPlayerInFormalGroups(match, playerId)) {
        return fail;
      }
    }

    var panel = teamMatchScorecard.resolveStandingsExpandPanel(
      match,
      {
        groupId: groupId,
        playerId: playerId,
        userId: playerId,
        entityId: entityId,
        isEntity: isEntity,
        resultUnitType: (player && player.resultUnitType) || '',
        scorePlayerId: (player && player.scorePlayerId) || ''
      },
      this.data.standingsScoreDisplayMode || 'gross'
    );
    if (!panel || !panel.state) return fail;

    var scoringRow = panel.row || {};
    var identitySource = Object.assign({}, player || {}, {
      playerId: playerId,
      userId: playerId
    });
    var identityPack = this._buildStandingsScorecardIdentityPlayer(identitySource, match, series);
    var identityPlayer = identityPack && identityPack.player ? identityPack.player : null;
    var avatarBadgeMode =
      identityPack && identityPack.avatarBadge ? String(identityPack.avatarBadge) : 'none';
    if (seriesStandingsExpandIdentity.isDivisionSeriesStandings(series)) {
      avatarBadgeMode = 'team';
    }
    var profileUserId =
      (identityPack && identityPack.profileUserId) ||
      (identityPlayer && identityPlayer.profileUserId) ||
      '';
    this._frozenStandingsScorecard = {
      seriesId: seriesId,
      roundId: roundId,
      matchId: matchId,
      publishToken: String(series.publishToken || '').trim(),
      playerId: playerId,
      profileUserId: profileUserId,
      entityId: scoringRow.entityId || entityId || '',
      groupId: groupId,
      scorecardKey: scorecardKey,
      occurrenceKey:
        (player && player.occurrenceKey != null ? String(player.occurrenceKey).trim() : '') ||
        scorecardKey,
      isEntity: !!scoringRow.isEntity || isEntity,
      panelState: panel.state
    };

    var logoMap = this._buildStandingsTeamGroupLogoById(match, series);
    var adImage = this._resolveStandingsScorecardAdImage(match);
    var followPatch = this._buildStandingsScorecardFollowPatch(profileUserId);
    var courseTitle = '';
    if (panel.state === 'scorecard') {
      courseTitle = teamMatchScorecard.buildScorecardCourseTitle(match);
      var selectorKey = selectedRoundId != null ? String(selectedRoundId).trim() : '';
      if (standingsViewModel.isCumulativeStandingsKey(selectorKey)) {
        courseTitle = standingsViewModel.buildTotOccurrenceScorecardTitle({
          series: series,
          roundId: roundId,
          round: round,
          match: match,
          courseTitle: courseTitle
        });
      }
    }
    var self = this;
    this.setData(
      Object.assign(
        {
          openStandingsScorecardKey: scorecardKey,
          openStandingsScorecard: panel.state === 'scorecard' ? panel.scorecard : null,
          standingsScorecardEmptyLabel: panel.emptyLabel || '',
          standingsScorecardCourseTitle: courseTitle,
          standingsScorecardAdImage: adImage,
          standingsScorecardPlayer: identityPlayer,
          standingsScorecardAvatarBadge: avatarBadgeMode,
          standingsScorecardMetaMode:
            identityPack && identityPack.metaMode ? identityPack.metaMode : 'countryAge',
          standingsScorecardShowNameGender: !!(identityPack && identityPack.showNameGender),
          standingsTeamGroupLogoById: logoMap
        },
        followPatch
      ),
      function () {
        if (!self._pageAlive) return;
        self.scheduleStandingsContentFillerMeasure();
      }
    );
    return { ok: true };
  },

  /** 记分卡广告加载失败：仅替换展示 URL（本地 fallback），不写 Series/match/storage */
  onStandingsScorecardAdError: function () {
    var current =
      this.data.standingsScorecardAdImage != null
        ? String(this.data.standingsScorecardAdImage).trim()
        : '';
    if (!current) return;
    var local = '';
    try {
      local = eventSponsorConfig.getEventSponsorLocalFallback(current) || '';
    } catch (eFb) {
      local = '';
    }
    if (!local || local === current) return;
    var self = this;
    this.setData({ standingsScorecardAdImage: local }, function () {
      if (!self._pageAlive) return;
      self.scheduleStandingsContentFillerMeasure();
    });
  },

  /**
   * 展开面板身份卡 › / 头像 / 昵称 → 球员主页（对齐 R1 resolveOpenableUserId → openPlayerProfile）
   * catchtap 不冒泡，不收起记分卡，不切换另一轮 occurrenceKey。
   */
  onStandingsScorecardProfileTap: function (e) {
    var detail = (e && e.detail) || {};
    var ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
    var frozen = this._frozenStandingsScorecard || {};
    var identity = this.data.standingsScorecardPlayer || {};
    function asId(v) {
      return v != null ? String(v).trim() : '';
    }
    var userId =
      asId(detail.userId) ||
      asId(detail.playerId) ||
      asId(identity.profileUserId) ||
      asId(ds.userid) ||
      asId(ds.userId) ||
      asId(frozen.profileUserId) ||
      asId(frozen.playerId);
    // 禁止把 entityId/pairId 当主页用户
    if (frozen.entityId && String(userId).trim() === String(frozen.entityId).trim()) {
      userId = frozen.profileUserId || frozen.playerId || '';
    }
    function isImpersonator(id) {
      var v = asId(id);
      if (!v) return true;
      var bad = [
        frozen.occurrenceKey,
        frozen.scorecardKey,
        identity.entityId,
        identity.occurrenceKey,
        identity.scorecardKey,
        identity.seriesParticipantId,
        identity.rosterEntryId,
        ds.occurrencekey,
        ds.entityid,
        ds.seriesparticipantid,
        ds.rosterentryid
      ];
      for (var i = 0; i < bad.length; i++) {
        var b = asId(bad[i]);
        if (b && v === b) return true;
      }
      if (frozen.entityId && v === asId(frozen.entityId)) return true;
      return false;
    }
    if (isImpersonator(userId)) {
      userId = asId(identity.profileUserId) || asId(frozen.profileUserId) || asId(frozen.playerId);
      if (isImpersonator(userId)) userId = '';
    }
    if (detail.unavailable) {
      wx.showToast({ title: '该球员暂无主页', icon: 'none', duration: 1200 });
      return;
    }
    var targetUserId = openPlayerProfileUtil.resolveOpenableUserId({
      userId: userId,
      playerId: userId,
      userType: detail.userType || ds.usertype || ds.userType || identity.userType
    });
    if (!targetUserId || isImpersonator(targetUserId)) {
      wx.showToast({ title: '该球员暂无主页', icon: 'none', duration: 1200 });
      return;
    }
    if (this._standingsProfileNavLock) return;
    this._standingsProfileNavLock = true;
    var self = this;
    var opened = openPlayerProfileUtil.openPlayerProfile({
      userId: targetUserId,
      playerId: targetUserId,
      publicName: detail.publicName || detail.name || ds.name || identity.name,
      name: detail.publicName || detail.name || ds.name || identity.name,
      avatar: detail.avatar || ds.avatar || identity.avatar,
      gender: detail.gender != null ? detail.gender : identity.gender,
      handicap: detail.handicap != null ? detail.handicap : identity.handicap,
      floatCoef: detail.floatCoef != null ? detail.floatCoef : identity.floatCoef,
      userType: detail.userType,
      identitySource: detail.identitySource
    });
    setTimeout(function () {
      self._standingsProfileNavLock = false;
    }, 600);
    if (!opened) {
      /* openPlayerProfile 内部已提示 */
    }
  },

  /**
   * TOT / R 共享「加关注」：复用通讯录 contactFollowAction.followUser。
   * 成功只刷新现有关注状态字段/map；失败保留按钮，不得伪造成功。
   * 不 reload ViewModel / 排行榜 / Series，不改 openKey / 记分卡 / 总榜。
   */
  onStandingsScorecardFollow: function (e) {
    var detail = (e && e.detail) || {};
    var frozen = this._frozenStandingsScorecard || {};
    var identity = this.data.standingsScorecardPlayer || {};
    var pid = String(detail.playerId || detail.userId || '').trim();
    if (!pid) {
      pid = String(identity.profileUserId || identity.playerId || frozen.profileUserId || '').trim();
    }
    if (!pid) return;

    var currentUserId = this._resolveStandingsCurrentUserId();
    var existed = 'none';
    try {
      contactFollowAction.ensureStore();
      existed = contactFollowAction.getRelationStatus(pid) || 'none';
    } catch (eRel) {
      existed = 'none';
    }
    var gate = seriesStandingsExpandIdentity.resolveStandingsFollowDisplay({
      profileUserId: pid,
      currentUserId: currentUserId,
      relationStatus: existed
    });
    if (!gate || gate.isSelf || !gate.canFollow) return;
    if (gate.relationStatus === 'friend' || gate.relationStatus === 'following') return;
    if (this._standingsFollowInFlight) return;
    this._standingsFollowInFlight = true;

    var openPid = String(
      (identity && (identity.profileUserId || identity.playerId)) || frozen.profileUserId || frozen.playerId || ''
    ).trim();
    var patchOpen = openPid && openPid === pid;
    var standings = this.data.standings && typeof this.data.standings === 'object' ? this.data.standings : {};
    var loadingMap = Object.assign({}, standings.personalFollowLoadingMap || {});
    loadingMap[pid] = true;
    var loadingPatch = { 'standings.personalFollowLoadingMap': loadingMap };
    if (patchOpen) loadingPatch.standingsScorecardFollowLoading = true;
    this.setData(loadingPatch);

    var self = this;
    var clearLoading = function () {
      self._standingsFollowInFlight = false;
      var nextStandings = self.data.standings && typeof self.data.standings === 'object' ? self.data.standings : {};
      var nextLoading = Object.assign({}, nextStandings.personalFollowLoadingMap || {});
      delete nextLoading[pid];
      var clearPatch = { 'standings.personalFollowLoadingMap': nextLoading };
      if (patchOpen) clearPatch.standingsScorecardFollowLoading = false;
      self.setData(clearPatch);
    };

    try {
      var player = detail.player || identity || {};
      var status = contactFollowAction.followUser({
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
      var nextStatus = status === 'friend' ? 'friend' : 'following';
      var display = seriesStandingsExpandIdentity.resolveStandingsFollowDisplay({
        profileUserId: pid,
        currentUserId: currentUserId,
        relationStatus: nextStatus
      });
      this._standingsFollowInFlight = false;
      var nextStandings = this.data.standings && typeof this.data.standings === 'object' ? this.data.standings : {};
      var nextLoading = Object.assign({}, nextStandings.personalFollowLoadingMap || {});
      delete nextLoading[pid];
      var followMap = Object.assign({}, nextStandings.personalFollowMap || {});
      var relationMap = Object.assign({}, nextStandings.personalRelationMap || {});
      var relationLabelMap = Object.assign({}, nextStandings.personalRelationLabelMap || {});
      followMap[pid] = true;
      relationMap[pid] = nextStatus;
      relationLabelMap[pid] =
        (display && display.relationLabel) || (nextStatus === 'friend' ? '好友' : '已关注');
      var successPatch = {
        'standings.personalFollowMap': followMap,
        'standings.personalRelationMap': relationMap,
        'standings.personalRelationLabelMap': relationLabelMap,
        'standings.personalFollowLoadingMap': nextLoading
      };
      if (patchOpen) {
        successPatch.standingsScorecardFollowed = !!(display && display.followed);
        successPatch.standingsScorecardRelationStatus = (display && display.relationStatus) || nextStatus;
        successPatch.standingsScorecardRelationLabel = (display && display.relationLabel) || '';
        successPatch.standingsScorecardCanFollow = !!(display && display.canFollow);
        successPatch.standingsScorecardFollowLoading = false;
        successPatch.standingsScorecardIsSelf = !!(display && display.isSelf);
      }
      this.setData(successPatch);
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

  onScroll: function (e) {
    if (this._skipScrollReset) return;
    var top = e && e.detail && e.detail.scrollTop != null ? Number(e.detail.scrollTop) : 0;
    if (!Number.isFinite(top)) return;
    this._scrollTop = top;
    this._syncStickyByScroll(top);
  },

  /** 图文直播：对齐 detail.onCopyPhotoLiveLink；不写 Series/storage */
  onCopyPhotoLiveLink: function (e) {
    var ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
    var url = ds.url != null ? String(ds.url).trim() : '';
    if (!url || !/^https:\/\//i.test(url) || /^http:\/\//i.test(url)) return;
    if (typeof wx === 'undefined' || typeof wx.setClipboardData !== 'function') return;
    wx.setClipboardData({
      data: url,
      success: function () {
        wx.showToast({
          title: '照片直播链接已复制，请在微信中打开查看',
          icon: 'none',
          duration: 2500
        });
      }
    });
  },

  /** COS 广告图加载失败 → 回退本地；只改页面展示，不写 Series/storage */
  onEventSponsorImageError: function (e) {
    var dataset = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset : {};
    var result = viewModel.applyEventSponsorImageError(
      this.data.eventInfoList,
      dataset.id,
      function (url) {
        return eventSponsorConfig.getEventSponsorLocalFallback(url);
      }
    );
    if (!result.changed) return;
    var self = this;
    this.setData({ eventInfoList: result.list }, function () {
      self.scheduleScrollFillerMeasure();
    });
  },

  /** COS 默认图加载失败 → 回退本地 assets/partners；只改页面展示，不写 Series/storage */
  onPartnerLogoError: function (e) {
    var dataset = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset : {};
    var row = dataset.row;
    var side = dataset.side;
    var partner = this.data.partner || {};
    var result = viewModel.applyPartnerLogoError(
      partner.partnerLogoRows,
      row,
      side,
      function (url) {
        return partnerConfigUtil.getPartnerLogoLocalFallback(url);
      }
    );
    if (!result.changed) return;
    var self = this;
    this.setData(
      {
        partner: Object.assign({}, partner, { partnerLogoRows: result.rows })
      },
      function () {
        self.scheduleScrollFillerMeasure();
      }
    );
  },

  /** 赛程 TAB 不再进入旧 detail / group-editor */
  onEnterRound: function () {
    return;
  },

  _resolveScheduleCurrentUser: function () {
    var profile = userProfileStore.loadProfile
      ? userProfileStore.loadProfile()
      : null;
    var currentUser = gameStore.getCurrentUser ? gameStore.getCurrentUser() : null;
    return currentUser || profile || {};
  },

  _peekScheduleStationMatch: function (series, selectedRoundId) {
    var selector = scheduleViewModel.buildScheduleRoundSelector(
      series,
      this._lastStandingsRoundStates || []
    );
    var key = selectedRoundId != null ? String(selectedRoundId).trim() : '';
    var valid = Object.create(null);
    var items = selector.roundSelectorItems || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i] && items[i].key) valid[items[i].key] = true;
    }
    if (!key || !valid[key]) key = selector.selectedKey || '';
    var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
    var round = null;
    for (var j = 0; j < rounds.length; j++) {
      if (String((rounds[j] && rounds[j].roundId) || '').trim() === key) {
        round = rounds[j];
        break;
      }
    }
    var matchId = round && round.matchId != null ? String(round.matchId).trim() : '';
    var match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    return { selectedKey: key, round: round, match: match, matchId: matchId };
  },

  _buildScheduleViewModel: function (series) {
    var access = this._lastRegisterAccess || {};
    var peek = this._peekScheduleStationMatch(series, this._scheduleSelectedKey);
    var sessionKey = seriesLiveSession.resolveSessionSelectedRoundId({
      currentKey: this._scheduleSelectedKey || peek.selectedKey,
      userPicked: this._scheduleUserPicked,
      visited: this._scheduleVisited,
      roundStates: this._lastStandingsRoundStates || []
    });
    var user = this._resolveScheduleCurrentUser();
    var canManageGroups = false;
    var canStartMatch = false;
    if (peek.match) {
      canManageGroups = !!matchManageAccess.hasMatchManagePermission(
        peek.match,
        user,
        'edit_groups'
      );
      canStartMatch = !!matchManageAccess.hasMatchManagePermission(
        peek.match,
        user,
        'start_match'
      );
    }
    var schedule = scheduleViewModel.buildSeriesScheduleViewModel({
      series: series,
      selectedRoundId: sessionKey || this._scheduleSelectedKey || peek.selectedKey,
      roundStates: this._lastStandingsRoundStates || [],
      getMatchById: function (id) {
        return teamMatchStore.getMatchById(id);
      },
      getIndexByMatchId: function (id) {
        return seriesStationIndex.getByMatchId(id);
      },
      canManageGroups: canManageGroups,
      canStartMatch: canStartMatch,
      viewerUserId: user,
      lifecycleAccess: {
        lifecycleStatus: access.lifecycleStatus || series.lifecycleStatus || '',
        isDraftPreview: !!access.isDraftPreview,
        isHistorical: !!access.isHistorical
      }
    });
    if (schedule && schedule.selectedKey) {
      this._scheduleSelectedKey = schedule.selectedKey;
    }
    return schedule || scheduleViewModel.emptyScheduleViewModel();
  },

  _rebuildScheduleProjection: function () {
    if (!this._pageAlive) return;
    var series =
      this._lastSeriesForSchedule ||
      (this._seriesId ? seriesStore.getSeriesById(this._seriesId) : null);
    if (!series) return;
    this._lastSeriesForSchedule = series;
    var schedule = this._buildScheduleViewModel(series);
    var patch = { schedule: schedule, scheduleQuickEntryVisible: false };
    delete patch.scrollTop;
    delete patch.scheduleRoundSelectorScrollLeft;
    delete patch.scrollFillerHeight;
    delete patch.scrollRectTop;
    delete patch.isStickyTab;
    delete patch.isStickyRoundSelector;
    delete patch.stickyRoundSelectorTop;
    delete patch.roundSelectorOffsetTop;
    // ROUND-DOCK-B1：切轮只更新赛程内容；不写 scrollTop / filler / sticky；不重测 dock
    // 短内容 LIVE Rx：setData 后无损重算 filler，使 maxScrollTop 能越过二级吸顶阈值
    var self = this;
    var shouldCapture =
      this._activeTab === 'schedule' &&
      (!!this.data.isStickyTab || !!this.data.isStickyRoundSelector);
    if (shouldCapture) this._captureScrollLayoutAnchor();
    this._safeSetData(patch, function () {
      if (!self._pageAlive) return;
      self._syncScheduleTeeObserver();
      if (self._activeTab !== 'schedule') return;
      var run = function () {
        if (!self._pageAlive || self._activeTab !== 'schedule') return;
        self.scheduleScheduleContentFillerMeasure();
      };
      if (typeof wx !== 'undefined' && typeof wx.nextTick === 'function') {
        wx.nextTick(run);
      } else {
        setTimeout(run, 0);
      }
    });
  },

  onScheduleRoundTap: function (e) {
    var key = readRoundDockEventKey(e);
    if (!key) return;
    if (key === this._scheduleSelectedKey) return;
    this._scheduleSelectedKey = key;
    this._scheduleVisited = true;
    this._scheduleUserPicked = true;
    this._rebuildScheduleProjection();
  },

  onScheduleRoundHScroll: function (e) {
    if (this._skipScheduleSubTabHScrollSync) return;
    var left =
      e && e.detail && e.detail.scrollLeft != null ? Number(e.detail.scrollLeft) : 0;
    if (!Number.isFinite(left)) return;
    this._lastScheduleScrollLeft = left;
    if (Math.abs(left - (this.data.scheduleRoundSelectorScrollLeft || 0)) < 0.5) {
      return;
    }
    var self = this;
    this._skipScheduleSubTabHScrollSync = true;
    this.setData({ scheduleRoundSelectorScrollLeft: left }, function () {
      setTimeout(function () {
        self._skipScheduleSubTabHScrollSync = false;
      }, 32);
    });
  },

  /** 核验当前轮 managed match，供跳转 group-editor */
  _verifyScheduleStationForGroupEditor: function (series, roundId, matchId) {
    var sid = series && series.seriesId != null ? String(series.seriesId).trim() : '';
    var rid = roundId != null ? String(roundId).trim() : '';
    var mid = matchId != null ? String(matchId).trim() : '';
    if (!sid || !rid || !mid) {
      return { ok: false, reason: 'args_required', message: '本轮比赛数据异常' };
    }
    return seriesScheduleGroupWrite.verifySeriesContext(
      teamMatchStore.getMatchById(mid),
      series,
      {
        roundId: rid,
        getIndexByMatchId: function (id) {
          return seriesStationIndex.getByMatchId(id);
        }
      }
    );
  },

  _resolveScheduleGroupEditorMode: function (match, hasGroups) {
    var life = viewModel.normalizeMatchLifecycle
      ? viewModel.normalizeMatchLifecycle(match)
      : { isOngoing: false };
    if (life && life.isOngoing) return 'live';
    return hasGroups ? 'edit' : 'create';
  },

  _disconnectScheduleTeeObserver: function () {
    if (this._scheduleTeeObserver) {
      this._scheduleTeeObserver.disconnect();
      this._scheduleTeeObserver = null;
    }
  },

  _setupScheduleTeeObserver: function () {
    this._disconnectScheduleTeeObserver();
    if ((this._activeTab || this.data.activeTab) !== 'schedule') return;
    var schedule = this.data.schedule || {};
    if (!(schedule.cta && schedule.cta.showEnterMyGroupEligible)) return;
    if (typeof this.createIntersectionObserver !== 'function') return;
    var self = this;
    var observer = this.createIntersectionObserver({ thresholds: [0, 0.5, 0.99, 1] });
    observer.relativeToViewport().observe('.js-first-tee-group', function (res) {
      var fullyVisible = res && res.intersectionRatio >= 0.99;
      if (fullyVisible !== self.data.scheduleQuickEntryVisible) {
        self.setData({ scheduleQuickEntryVisible: fullyVisible });
      }
    });
    this._scheduleTeeObserver = observer;
  },

  _syncScheduleTeeObserver: function () {
    var schedule = this.data.schedule || {};
    var eligible =
      (this._activeTab || this.data.activeTab) === 'schedule' &&
      !!(schedule.cta && schedule.cta.showEnterMyGroupEligible);
    if (!eligible) {
      this._disconnectScheduleTeeObserver();
      if (this.data.scheduleQuickEntryVisible) {
        this.setData({ scheduleQuickEntryVisible: false });
      }
      return;
    }
    var self = this;
    var run = function () {
      if (!self._pageAlive) return;
      self._setupScheduleTeeObserver();
    };
    if (typeof wx !== 'undefined' && typeof wx.nextTick === 'function') {
      wx.nextTick(run);
    } else {
      setTimeout(run, 0);
    }
  },

  onEnterMyGroup: function () {
    var schedule = this.data.schedule || {};
    var matchId = schedule.matchId ? String(schedule.matchId) : '';
    var match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    var user = this._resolveScheduleCurrentUser();
    teamMatchEnterGroupScore.enterViewerGroupScore(match, user);
  },

  /**
   * Series 赛程：跳转独立 group-editor（G2-R）
   * 前序轮未分组时先确认；确认后仍进用户点击的当前轮。
   * LIVE 轮次赛程 CTA 为「进入自己小组」，不走本入口。
   */
  openScheduleGroupEditor: function () {
    if (this._scheduleGroupEditorNavLock) return;
    // C3-Z / C3-D：M 弹层或滚动隐藏时均拦截
    if (this.data.isManageOverlayActive) return;
    if (!this.data.showScheduleBottomAction) return;
    var schedule = this.data.schedule || {};
    if (!schedule.cta || !schedule.cta.showEditGroups) return;
    var series = this._lastSeriesForSchedule;
    var roundId = String(schedule.selectedKey || this._scheduleSelectedKey || '').trim();
    var matchId = schedule.matchId ? String(schedule.matchId).trim() : '';
    this._openSeriesGroupEditorForRound(series, roundId, matchId);
  },

  /**
   * 管理核验通过后的分组编辑跳转（M 面板「修改分组」与赛程 CTA 共用）。
   * 使用调用方给出的 roundId/matchId，不依赖赛程 CTA 是否展示。
   */
  _openSeriesGroupEditorForRound: function (series, roundId, matchId) {
    if (this._scheduleGroupEditorNavLock) return;
    roundId = roundId != null ? String(roundId).trim() : '';
    matchId = matchId != null ? String(matchId).trim() : '';
    if (!series || !roundId || !matchId) {
      if (typeof wx !== 'undefined' && wx.showToast) {
        wx.showToast({ title: '本轮比赛数据异常', icon: 'none' });
      }
      return;
    }
    var liveMatch = teamMatchStore.getMatchById(matchId);
    if (teamMatchFinish.isMatchCompleted(liveMatch)) {
      if (typeof wx !== 'undefined' && wx.showToast) {
        wx.showToast({ title: teamMatchFinish.MATCH_FINISHED_TOAST, icon: 'none' });
      }
      return;
    }

    var self = this;
    var prior = scheduleViewModel.findEarliestPriorUngroupedRound({
      series: series,
      selectedRoundId: roundId,
      roundStates: this._lastStandingsRoundStates || [],
      getMatchById: function (id) {
        return teamMatchStore.getMatchById(id);
      }
    });

    this._scheduleGroupEditorNavLock = true;
    if (prior && prior.roundId) {
      if (typeof wx === 'undefined' || typeof wx.showModal !== 'function') {
        this._proceedOpenScheduleGroupEditor(series, roundId, matchId);
        return;
      }
      wx.showModal({
        title: prior.confirmTitle || '分组顺序提醒',
        content:
          prior.confirmContent ||
          '前序轮次尚未分组，是否仍要先设置当前轮次的分组？',
        confirmText: '继续分组',
        cancelText: '取消',
        success: function (res) {
          if (res && res.confirm) {
            self._proceedOpenScheduleGroupEditor(series, roundId, matchId);
            return;
          }
          self._scheduleGroupEditorNavLock = false;
        },
        fail: function () {
          self._scheduleGroupEditorNavLock = false;
        }
      });
      return;
    }

    this._proceedOpenScheduleGroupEditor(series, roundId, matchId);
  },

  /** 核验当前轮并 navigateTo group-editor（确认后/无前序缺口时） */
  _proceedOpenScheduleGroupEditor: function (series, roundId, matchId) {
    this._scheduleGroupEditorNavLock = true;
    var self = this;
    var unlock = function () {
      self._scheduleGroupEditorNavLock = false;
    };

    if (!series || !roundId || !matchId) {
      unlock();
      if (typeof wx !== 'undefined' && wx.showToast) {
        wx.showToast({ title: '本轮比赛数据异常', icon: 'none' });
      }
      return;
    }

    var check = this._verifyScheduleStationForGroupEditor(series, roundId, matchId);
    if (!check || !check.ok) {
      unlock();
      if (typeof wx !== 'undefined' && wx.showToast) {
        wx.showToast({ title: '本轮比赛数据异常', icon: 'none' });
      }
      return;
    }

    var schedule = this.data.schedule || {};
    var match = teamMatchStore.getMatchById(matchId);
    var hasGroups = !!(
      schedule.hasGroups || scheduleViewModel.hasNonEmptyGroup(match && match.groups)
    );
    var mode = this._resolveScheduleGroupEditorMode(match, hasGroups);
    var returnCtx = {
      seriesId: String(series.seriesId || '').trim(),
      roundId: roundId,
      activeTab: 'schedule',
      scheduleSelectedKey: roundId,
      scrollTop: Number(this._scrollTop) || 0
    };
    try {
      if (typeof wx !== 'undefined' && typeof wx.setStorageSync === 'function') {
        wx.setStorageSync('gb_series_group_editor_return_v1', returnCtx);
      }
    } catch (eSet) {
      /* ignore */
    }

    var url =
      '/subpackages/tournament-manage/pages/group-editor/index?matchId=' +
      encodeURIComponent(matchId) +
      '&mode=' +
      encodeURIComponent(mode) +
      '&fromSeries=1' +
      '&seriesId=' +
      encodeURIComponent(String(series.seriesId || '').trim()) +
      '&roundId=' +
      encodeURIComponent(roundId);

    if (typeof wx === 'undefined' || typeof wx.navigateTo !== 'function') {
      unlock();
      if (typeof wx !== 'undefined' && wx.showToast) {
        wx.showToast({ title: '无法打开分组编辑', icon: 'none' });
      }
      return;
    }
    wx.navigateTo({
      url: url,
      complete: function () {
        unlock();
      },
      fail: function (err) {
        var detail =
          err && err.errMsg != null ? String(err.errMsg).trim() : '';
        if (typeof wx !== 'undefined' && wx.showToast) {
          wx.showToast({
            title: detail || '无法打开分组编辑',
            icon: 'none'
          });
        }
      }
    });
  },

  onScheduleViewLeaderboard: function () {
    var schedule = this.data.schedule || {};
    var rid = String(
      this._scheduleSelectedKey || schedule.selectedKey || ''
    ).trim();
    if (!rid) return;
    this._standingsSelectedKey = rid;
    this._standingsVisited = true;
    this._standingsUserPicked = true;
    this._rebuildStandingsProjection({
      standingsDockIntoView: this._dockIntoViewId(rid)
    });
    this._performSwitchTab('standings');
  },

  onScheduleTeeGroupTap: function (e) {
    var groupId =
      e && e.currentTarget && e.currentTarget.dataset
        ? String(e.currentTarget.dataset.groupId || '').trim()
        : '';
    if (!groupId) return;
    var schedule = this.data.schedule || {};
    var matchId = schedule.matchId ? String(schedule.matchId) : '';
    var match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    if (!match) {
      if (typeof wx !== 'undefined' && wx.showToast) {
        wx.showToast({ title: '分站数据缺失', icon: 'none' });
      }
      return;
    }
    teamMatchEnterGroupScore.enterTeamMatchGroupScore(match, groupId);
  },

  onBack: function () {
    if (typeof wx === 'undefined' || !wx.navigateBack) return;
    wx.navigateBack({
      delta: 1,
      fail: function () {
        wx.switchTab && wx.switchTab({ url: '/pages/home/index' });
      }
    });
  },

  /* ===== Series M：轮次选择 → 同构菜单 ===== */
  _onSeriesStationRoundStartSuccess: function (result, roundId) {
    if (!result || !result.ok || result.startedLive !== true) return;
    this._scheduleSelectedKey = roundId || result.roundId || this._scheduleSelectedKey;
    this._rebuildScheduleProjection();
    this._refreshSeriesManageFab();
    this._showSeriesRoundEnteredLiveNotice(result.liveNotice);
  },

  _showSeriesRoundEnteredLiveNotice: function (message) {
    var content = message != null ? String(message).trim() : '';
    if (!content) return;
    if (typeof wx === 'undefined' || typeof wx.showModal !== 'function') return;
    wx.showModal({
      content: content,
      showCancel: false,
      confirmText: '我知道了'
    });
  },

  _refreshSeriesManageFab: function () {
    if (!this._pageAlive) return;
    var series =
      this._lastSeriesForSchedule ||
      (this._seriesId ? seriesStore.getSeriesById(this._seriesId) : null);
    var decision = seriesManageAccess.resolveSeriesManageFabVisible({
      series: series,
      user: gameStore.getCurrentUser() || {},
      accessContentReady: !!this.data.accessContentReady,
      lifecycleAccess: this._lastRegisterAccess || {},
      getMatchById: function (id) {
        return teamMatchStore.getMatchById(id);
      },
      getIndexByMatchId: function (id) {
        return seriesStationIndex.getByMatchId(id);
      }
    });
    var visible = !!(decision && decision.visible);
    var patch = { seriesManageFabVisible: visible };
    if (!visible) {
      patch.showMoreSheet = false;
      patch.moreFabExpanded = false;
    }
    this._safeSetData(patch);
    if (visible) {
      this._initMoreFab();
    }
  },

  _initMoreFab: function () {
    var sys = { windowWidth: 375, windowHeight: 667 };
    try {
      var info = readSeriesDetailWindowLayout();
      if (info) {
        if (info.windowWidth != null) sys.windowWidth = info.windowWidth;
        if (info.windowHeight != null) sys.windowHeight = info.windowHeight;
      }
    } catch (e) {
      /* ignore */
    }
    this._fabWindowH = sys.windowHeight || 667;
    this._rpx2px = (sys.windowWidth || 375) / 750;
    this._fabSizePx = FAB_SIZE_RPX * this._rpx2px;
    this._fabRightPx = FAB_HIDE_MARGIN_RPX * this._rpx2px;
    this._fabMinTopPx = FAB_EDGE_GAP_RPX * this._rpx2px;
    this._fabMaxTopPx = Math.max(
      this._fabMinTopPx,
      this._fabWindowH - this._fabSizePx - FAB_EDGE_GAP_RPX * this._rpx2px
    );
    var centerTop = (this._fabWindowH - this._fabSizePx) / 2;
    this._setFabTop(centerTop);
    this._refreshFabHitZones();
  },

  _setFabTop: function (topPx) {
    var t = Math.max(
      this._fabMinTopPx || 0,
      Math.min(this._fabMaxTopPx || 0, Number(topPx) || 0)
    );
    this._safeSetData({
      fabTopPx: t,
      fabStyle: 'top:' + t.toFixed(1) + 'px;right:' + (this._fabRightPx || 0).toFixed(1) + 'px;'
    });
    this._updateFabHitState(t);
  },

  _refreshFabHitZones: function () {
    var self = this;
    if (typeof wx === 'undefined' || typeof wx.createSelectorQuery !== 'function') return;
    wx.createSelectorQuery()
      .in(this)
      .selectAll('.gb-header,.tab-scroll-wrap')
      .boundingClientRect(function (rects) {
        self._fabHitZones = (rects || []).filter(function (r) {
          return r && r.height > 0;
        });
        self._updateFabHitState(self.data.fabTopPx || 0);
      })
      .exec();
  },

  _updateFabHitState: function (topPx) {
    var centerY = Number(topPx || 0) + (this._fabSizePx || 0) / 2;
    var hit = (this._fabHitZones || []).some(function (z) {
      return centerY >= z.top && centerY <= z.bottom;
    });
    if (hit !== this.data.moreFabHitTarget) {
      this._safeSetData({ moreFabHitTarget: hit });
    }
  },

  onMoreFabTouchStart: function (e) {
    var t = e && e.touches && e.touches[0];
    if (!t) return;
    this._fabDrag = {
      startY: t.clientY,
      startTop: this.data.fabTopPx || 0,
      moved: false
    };
    this._refreshFabHitZones();
  },

  onMoreFabTouchMove: function (e) {
    var t = e && e.touches && e.touches[0];
    var drag = this._fabDrag;
    if (!t || !drag) return;
    var dy = t.clientY - drag.startY;
    if (Math.abs(dy) > 2 && !drag.moved) drag.moved = true;
    if (drag.moved && !this.data.moreFabDragging) {
      this._safeSetData({ moreFabDragging: true });
    }
    this._setFabTop(drag.startTop + dy);
  },

  onMoreFabTouchEnd: function () {
    var drag = this._fabDrag;
    if (drag && drag.moved) this._fabMovedAt = Date.now();
    this._fabDrag = null;
    if (this.data.moreFabDragging) this._safeSetData({ moreFabDragging: false });
  },

  onMoreFabTap: function () {
    if (this._fabMovedAt && Date.now() - this._fabMovedAt < 180) return;
    this.openSeriesManageSheet();
  },

  onPageTap: function () {
    if (this.data.moreFabExpanded && !this.data.showMoreSheet) {
      this._safeSetData({ moreFabExpanded: false });
    }
  },

  _resolveManageSuggestedRoundId: function () {
    if (this._activeTab === 'schedule' && this._scheduleSelectedKey) {
      return String(this._scheduleSelectedKey);
    }
    if (
      this._activeTab === 'standings' &&
      this._standingsSelectedKey &&
      !standingsViewModel.isCumulativeStandingsKey(this._standingsSelectedKey)
    ) {
      return String(this._standingsSelectedKey);
    }
    if (this._manageSelectedRoundId) {
      return String(this._manageSelectedRoundId);
    }
    return '';
  },

  _isSeriesManageActor: function () {
    var series =
      this._lastSeriesForSchedule ||
      (this._seriesId ? seriesStore.getSeriesById(this._seriesId) : null);
    var user = gameStore.getCurrentUser() || {};
    return !!(series && seriesManageAccess.isSeriesHostPrivileged(series, user));
  },

  _buildSeriesManageSheetPatch: function (selectedRoundId) {
    var series =
      this._lastSeriesForSchedule ||
      (this._seriesId ? seriesStore.getSeriesById(this._seriesId) : null);
    if (!series) return null;
    var user = gameStore.getCurrentUser() || {};
    var canManage = seriesManageAccess.isSeriesHostPrivileged(series, user);
    var canProxy = !!(
      matchManageAccess.resolveUserId(user) &&
      matchManageAccess.isCommonViewPermission('register_for_other')
    );
    // 普通用户与管理员均可选轮；选中后核验 managed station
    var selected = selectedRoundId != null ? String(selectedRoundId).trim() : '';
    var gate = null;
    if (selected) {
      gate = seriesStationManageGate.verifyManagedStationForManage({
        series: series,
        roundId: selected,
        getMatchById: function (id) {
          return teamMatchStore.getMatchById(id);
        },
        getIndexByMatchId: function (id) {
          return seriesStationIndex.getByMatchId(id);
        }
      });
    }
    var sheet = seriesManageSheetViewModel.buildSeriesManageSheetViewModel({
      series: series,
      user: user,
      canManageSeries: canManage,
      canRegisterForOther: canProxy,
      suggestedRoundId: this._resolveManageSuggestedRoundId(),
      selectedRoundId: selected,
      gate: gate,
      seriesFinishBusy: !!this._seriesFinishBusy,
      stationFinishBusy: !!this._stationFinishBusy,
      getMatchById: function (id) {
        return teamMatchStore.getMatchById(id);
      }
    });
    var round = sheet.roundSection || seriesManageSheetViewModel.emptyRoundSection();
    var roundView =
      sheet.roundViewSection || seriesManageSheetViewModel.emptyRoundViewSection();
    var scope = sheet.seriesScope || {};
    return {
      showMoreSheet: true,
      moreFabExpanded: true,
      seriesManageCanManage: !!canManage,
      seriesManageShowRound: !!sheet.showRoundPicker,
      manageRoundPicker: sheet.roundPicker,
      seriesManageFeaturesCommon: scope.featuresCommon || [],
      seriesManageFeaturesManage: scope.featuresManage || [],
      seriesManageFeaturesDanger: scope.featuresDanger || [],
      roundViewSection: roundView,
      roundManageSection: round,
      _gateOk: !!(gate && gate.ok),
      _matchId: gate && gate.ok ? gate.matchId : '',
      _roundId: gate && gate.ok ? gate.roundId : selected
    };
  },

  _refreshSeriesManageSheet: function () {
    if (!this._pageAlive || !this.data.showMoreSheet) return;
    var patch = this._buildSeriesManageSheetPatch(this._manageSelectedRoundId || '');
    if (!patch) return;
    this._manageSelectedMatchId = patch._matchId || '';
    this._manageSelectedRoundId = patch._roundId || this._manageSelectedRoundId || '';
    delete patch._gateOk;
    delete patch._matchId;
    delete patch._roundId;
    delete patch.manageRoundPickerScrollLeft;
    var self = this;
    this._safeSetData(patch, function () {
      if (!self._pageAlive || !self.data.showMoreSheet) return;
      self._scheduleManageRoundOverflowMeasure();
    });
  },

  openSeriesManageSheet: function () {
    if (!this._pageAlive || !this.data.seriesManageFabVisible) return;
    if (!this.data.moreFabExpanded) {
      this._safeSetData({ moreFabExpanded: true });
      return;
    }
    // 打开统一面板：建议轮高亮，不自动确认本轮
    var patch = this._buildSeriesManageSheetPatch('');
    if (!patch) return;
    this._manageSelectedRoundId = '';
    this._manageSelectedMatchId = '';
    this._clearManageRoundOverflowRuntime();
    delete patch._gateOk;
    delete patch._matchId;
    delete patch._roundId;
    patch.manageRoundPickerScrollLeft = 0;
    patch.manageRoundShowLeftIndicator = false;
    patch.manageRoundShowRightIndicator = false;
    var self = this;
    // C3-Z：打开一级 M 同帧激活 overlay，隐藏 TAB 底栏
    this._commitManageOverlayPatch(patch, function () {
      if (!self._pageAlive || !self.data.showMoreSheet) return;
      self._scheduleManageRoundOverflowMeasure();
    });
  },

  /** @deprecated 名称保留给自测/兼容；实际打开统一 M 面板 */
  openSeriesManageRoundPicker: function () {
    this.openSeriesManageSheet();
  },

  _clearManageRoundOverflowRuntime: function () {
    this._lastManageRoundScrollLeft = 0;
    this._manageRoundViewportWidth = 0;
    this._manageRoundContentWidth = 0;
    this._manageRoundOverflowToken = (this._manageRoundOverflowToken || 0) + 1;
    this._skipManageRoundHScrollSync = false;
  },

  _scheduleManageRoundOverflowMeasure: function () {
    var self = this;
    var run = function () {
      if (self._pageAlive) self._measureManageRoundOverflow();
    };
    if (typeof wx !== 'undefined' && typeof wx.nextTick === 'function') {
      wx.nextTick(run);
    } else {
      setTimeout(run, 0);
    }
  },

  _setManageRoundOverflowArrows: function (next, extraPatch) {
    var showLeft = !!(next && next.showLeft);
    var showRight = !!(next && next.showRight);
    var patch = extraPatch && typeof extraPatch === 'object' ? Object.assign({}, extraPatch) : {};
    if (showLeft !== this.data.manageRoundShowLeftIndicator) {
      patch.manageRoundShowLeftIndicator = showLeft;
    }
    if (showRight !== this.data.manageRoundShowRightIndicator) {
      patch.manageRoundShowRightIndicator = showRight;
    }
    if (!Object.keys(patch).length) return;
    this._safeSetData(patch);
  },

  _measureManageRoundOverflow: function () {
    var self = this;
    if (!this._pageAlive || !this.data.showMoreSheet) return;
    if (typeof this.createSelectorQuery !== 'function') return;
    var token = (this._manageRoundOverflowToken || 0) + 1;
    this._manageRoundOverflowToken = token;
    this.createSelectorQuery()
      .select('.series-manage-round-scroll')
      .boundingClientRect()
      .select('.series-manage-round-row')
      .boundingClientRect()
      .exec(function (res) {
        if (!self._pageAlive || token !== self._manageRoundOverflowToken) return;
        if (!self.data.showMoreSheet) return;
        var view = res && res[0];
        var row = res && res[1];
        var viewW = view && view.width ? Number(view.width) : 0;
        var contentW = row && row.width ? Number(row.width) : 0;
        if (viewW > 0) self._manageRoundViewportWidth = viewW;
        if (contentW > 0) self._manageRoundContentWidth = contentW;
        var left =
          self._lastManageRoundScrollLeft != null
            ? self._lastManageRoundScrollLeft
            : Number(self.data.manageRoundPickerScrollLeft) || 0;
        self._setManageRoundOverflowArrows(
          manageRoundOverflowArrows.resolveOverflowArrows(left, viewW, contentW)
        );
      });
  },

  onManageRoundPickerHScroll: function (e) {
    if (this._skipManageRoundHScrollSync) return;
    var detail = e && e.detail ? e.detail : {};
    var left = Number(detail.scrollLeft);
    if (!Number.isFinite(left)) left = 0;
    this._lastManageRoundScrollLeft = left;
    var contentW = Number(detail.scrollWidth);
    if (Number.isFinite(contentW) && contentW > 0) {
      this._manageRoundContentWidth = contentW;
    } else {
      contentW = this._manageRoundContentWidth || 0;
    }
    var viewW = this._manageRoundViewportWidth || 0;
    var arrows = manageRoundOverflowArrows.resolveOverflowArrows(
      left,
      viewW,
      contentW
    );
    if (!(viewW > 0) || !(contentW > 0)) {
      this._measureManageRoundOverflow();
    }
    var extra = {};
    if (Math.abs(left - (this.data.manageRoundPickerScrollLeft || 0)) >= 0.5) {
      extra.manageRoundPickerScrollLeft = left;
    }
    if (viewW > 0 && contentW > 0) {
      var showLeft = !!arrows.showLeft;
      var showRight = !!arrows.showRight;
      if (showLeft !== this.data.manageRoundShowLeftIndicator) {
        extra.manageRoundShowLeftIndicator = showLeft;
      }
      if (showRight !== this.data.manageRoundShowRightIndicator) {
        extra.manageRoundShowRightIndicator = showRight;
      }
    }
    if (!Object.keys(extra).length) return;
    var self = this;
    if (Object.prototype.hasOwnProperty.call(extra, 'manageRoundPickerScrollLeft')) {
      this._skipManageRoundHScrollSync = true;
      this.setData(extra, function () {
        setTimeout(function () {
          self._skipManageRoundHScrollSync = false;
        }, 32);
      });
      return;
    }
    this._safeSetData(extra);
  },

  onManageRoundPick: function (e) {
    if (!this._pageAlive || !this.data.showMoreSheet) return;
    // 选轮为普通查看能力：不要求 Series 管理员
    var roundId =
      e && e.currentTarget && e.currentTarget.dataset
        ? e.currentTarget.dataset.roundId
        : '';
    roundId = roundId != null ? String(roundId).trim() : '';
    if (!roundId) return;
    var patch = this._buildSeriesManageSheetPatch(roundId);
    if (!patch) return;
    this._manageSelectedRoundId = patch._roundId || roundId;
    this._manageSelectedMatchId = patch._matchId || '';
    if (!patch._gateOk && typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
      wx.showToast({
        title: seriesStationManageGate.GATE_FAIL_MESSAGE,
        icon: 'none'
      });
    }
    delete patch._gateOk;
    delete patch._matchId;
    delete patch._roundId;
    delete patch.manageRoundPickerScrollLeft;
    delete patch.manageRoundShowLeftIndicator;
    delete patch.manageRoundShowRightIndicator;
    var self = this;
    this._safeSetData(patch, function () {
      if (!self._pageAlive || !self.data.showMoreSheet) return;
      self._scheduleManageRoundOverflowMeasure();
    });
  },

  closeMoreSheet: function () {
    if (!this._pageAlive) return;
    this._manageSelectedRoundId = '';
    this._manageSelectedMatchId = '';
    var self = this;
    this._closeManageSecondaryPatch(this._buildCloseMoreSheetPatch(), function () {
      if (!self._pageAlive) return;
    });
  },

  closeMoreSheetFully: function () {
    this.closeMoreSheet();
  },

  _verifyCurrentManageStation: function () {
    var series =
      this._lastSeriesForSchedule ||
      (this._seriesId ? seriesStore.getSeriesById(this._seriesId) : null);
    var roundId = this._manageSelectedRoundId || '';
    return seriesStationManageGate.verifyManagedStationForManage({
      series: series,
      roundId: roundId,
      getMatchById: function (id) {
        return teamMatchStore.getMatchById(id);
      },
      getIndexByMatchId: function (id) {
        return seriesStationIndex.getByMatchId(id);
      }
    });
  },

  _resolveCanUseSeriesTeamMembersChannel: function (series) {
    var s = series && typeof series === 'object' ? series : null;
    if (!s) return false;
    var user = gameStore.getCurrentUser() || {};
    if (seriesManageAccess.isSeriesHostPrivileged(s, user)) return true;
    var hostMode = String(s.hostMode || '').trim();
    if (hostMode === 'team') {
      var hostId = seriesProxyRegisterViewModel.resolveSeriesHostTeamId(s);
      if (!hostId) return false;
      try {
        var hostTeam = teamDirectory.getTeamById(hostId);
        return !!(hostTeam && hostTeam.isMine);
      } catch (eHost) {
        return false;
      }
    }
    var parts = Array.isArray(s.participants) ? s.participants : [];
    for (var i = 0; i < parts.length; i++) {
      var sid = String((parts[i] && parts[i].sourceTeamId) || '').trim();
      if (!sid) continue;
      try {
        var team = teamDirectory.getTeamById(sid);
        if (team && team.isMine) return true;
      } catch (ePart) {
        /* continue */
      }
    }
    return false;
  },

  _buildSeriesProxyRegisterUsers: function (series) {
    var operator = gameStore.getCurrentUser() || {};
    var operatorUserId = String(operator.userId || operator.playerId || '');
    var users = seriesProxyRegisterViewModel.buildProxyRegisterUsersFromRoster(
      series,
      operatorUserId
    );
    var orch = this._selfCancelOrchestrator;
    var inspectFn =
      orch && typeof orch.inspectProxyCancellationImpact === 'function'
        ? function (args) {
            return orch.inspectProxyCancellationImpact(args);
          }
        : null;
    return projectProxyRegisterUsersWithCancelLocks(
      users,
      operatorUserId,
      (series && (series.seriesId || series.id)) || this._seriesId || '',
      inspectFn
    );
  },

  _isSeriesOverallCompleted: function (series) {
    return seriesFinishLock.isSeriesCompleted(series);
  },

  _showRegistrationClosedModal: function () {
    var closed = registrationInteractionModel.buildRegistrationClosedModal();
    if (typeof wx === 'undefined' || typeof wx.showModal !== 'function') return;
    wx.showModal({
      title: closed.title,
      content: closed.content,
      showCancel: closed.showCancel,
      confirmText: closed.confirmText
    });
  },

  _showOrdinaryFinishedUnavailable: function () {
    if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
      wx.showToast({ title: '功能开发中', icon: 'none' });
    }
  },

  /** M 入口：打开与队际赛一致的人员来源 sheet（不默认参赛主体） */
  openProxyRegisterSheet: function () {
    if (!this._pageAlive) return;
    if (this._registerWriteLock || this.data.registerSubmitting) return;
    var series =
      this._lastSeriesForRegister ||
      this._lastSeriesForSchedule ||
      (this._seriesId ? seriesStore.getSeriesById(this._seriesId) : null);
    if (!series) {
      this._toastRegisterFailure('series_not_found');
      return;
    }
    if (this._isSeriesOverallCompleted(series)) {
      this._showOrdinaryFinishedUnavailable();
      return;
    }
    // 对齐队际赛：菜单不置灰；closed 走共享 Modal，不进选人 sheet
    if (String(series.registrationState || '').trim() !== 'open') {
      this._showRegistrationClosedModal();
      return;
    }
    var aff = seriesProxyRegisterViewModel.buildProxyAffiliationOptions(
      series,
      DEFAULT_ORG_LOGO
    );
    if (!aff.options.length) {
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '暂无参赛主体', icon: 'none' });
      }
      return;
    }
    this._lastSeriesForRegister = series;
    this._clearProxyRegistrationTempState(true);
    // C3-Z：同帧关 M 一级 + 开代报名二级（先占 isManageOverlayActive）
    this._openFromManageSheet({
      registerForOtherSourceOptions:
        seriesProxyRegisterViewModel.buildRegisterForOtherSourceOptions(
          this._resolveCanUseSeriesTeamMembersChannel(series)
        ),
      registerForOtherSheetVisible: true,
      proxyGroupSheetTitle: aff.sheetTitle,
      proxyGroupSheetSub: aff.sheetSub,
      proxyRegistrationFieldLabel: aff.fieldLabel,
      registerSubmitting: false
    });
  },

  closeRegisterForOtherSheet: function () {
    if (!this._pageAlive) return;
    this._closeManageSecondaryPatch({ registerForOtherSheetVisible: false });
  },

  onRegisterForOtherSourceSelect: function (e) {
    if (!this._pageAlive) return;
    var key = e && e.detail ? e.detail.key : '';
    var self = this;
    if (key === 'manual') {
      // 同帧关来源 sheet + 开手工层，保持 isManageOverlayActive
      this._commitManageOverlayPatch({
        registerForOtherSheetVisible: false,
        registerForOtherManualVisible: true,
        registerForOtherManualName: '',
        registerForOtherManualPhone: '',
        registerForOtherManualGender: 'male'
      });
      return;
    }
    if (key === 'friends') {
      this._closeManageSecondaryPatch(
        { registerForOtherSheetVisible: false },
        function () {
          if (!self._pageAlive) return;
          self._openRegisterForOtherFriendsPicker();
        }
      );
      return;
    }
    if (key === 'team_members') {
      var series = seriesStore.getSeriesById(this._seriesId);
      if (!this._resolveCanUseSeriesTeamMembersChannel(series)) {
        if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
          wx.showToast({
            title:
              seriesProxyRegisterViewModel.SERIES_REGISTER_FOR_OTHER_TEAM_MEMBERS_DENIED_TOAST,
            icon: 'none'
          });
        }
        return;
      }
      this._commitManageOverlayPatch({ registerForOtherSheetVisible: false }, function () {
        if (!self._pageAlive) return;
        self._openRegisterForOtherTeamMembersPicker();
      });
    }
  },

  onRegisterForOtherSourceDenied: function (e) {
    var key = e && e.detail ? e.detail.key : '';
    if (key === 'team_members') {
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({
          title:
            seriesProxyRegisterViewModel.SERIES_REGISTER_FOR_OTHER_TEAM_MEMBERS_DENIED_TOAST,
          icon: 'none'
        });
      }
    }
  },

  _openRegisterForOtherFriendsPicker: function () {
    var self = this;
    var series = seriesStore.getSeriesById(this._seriesId);
    if (!series) {
      this._toastRegisterFailure('series_not_found');
      return;
    }
    if (this._isSeriesOverallCompleted(series)) {
      this._showOrdinaryFinishedUnavailable();
      return;
    }
    if (String(series.registrationState || '').trim() !== 'open') {
      this._showRegistrationClosedModal();
      return;
    }
    var operator = gameStore.getCurrentUser() || {};
    var operatorUserId = String(operator.userId || operator.playerId || '');
    var registerUsers = this._buildSeriesProxyRegisterUsers(series);
    var url =
      '/subpackages/player/pages/friends/index?mode=' +
      encodeURIComponent('proxy_register') +
      '&matchId=' +
      encodeURIComponent('') +
      '&operatorUserId=' +
      encodeURIComponent(operatorUserId) +
      '&slotId=' +
      encodeURIComponent('series-register-for-other');
    if (typeof wx === 'undefined' || typeof wx.navigateTo !== 'function') return;
    wx.navigateTo({
      url: url,
      success: function (res) {
        try {
          if (res && res.eventChannel && res.eventChannel.emit) {
            res.eventChannel.emit('proxyRegisterContext', {
              registerUsers: registerUsers,
              operatorUserId: operatorUserId,
              matchId: '',
              seriesId: self._seriesId
            });
          }
        } catch (eCtx) {
          /* ignore */
        }
      },
      events: {
        friendsSelected: function (payload) {
          self._onSeriesProxyFriendsSelected(payload || {});
        }
      },
      fail: function (err) {
        if (typeof wx.showToast === 'function') {
          wx.showToast({
            title: '跳转失败：' + (err && err.errMsg ? err.errMsg : ''),
            icon: 'none'
          });
        }
      }
    });
  },

  _clearProxyMemberSourceState: function () {
    this._proxyMemberSourceGroupId = '';
    this._proxyMemberSourceTeamId = '';
    this._proxyMemberSourceTeamName = '';
    if (!this._pageAlive) return;
    this._closeManageSecondaryPatch({
      proxyMemberSourceDisplayName: '',
      proxyMemberSourceSheetVisible: false,
      proxyMemberSourceOptions: [],
      proxyMemberSourceGroupId: ''
    });
  },

  _clearProxyRegistrationTempState: function (skipSetData) {
    this._proxyPickChannel = '';
    this._proxyMemberSourceGroupId = '';
    this._proxyMemberSourceTeamId = '';
    this._proxyMemberSourceTeamName = '';
    this._pendingProxyPlayers = null;
    this._seriesProxyCommitPlan = null;
    if (skipSetData || !this._pageAlive) return;
    this._closeManageSecondaryPatch({
      proxyGroupSheetVisible: false,
      pendingProxyPlayers: [],
      proxyGroupOptions: [],
      proxyGroupId: '',
      proxyMemberSourceDisplayName: '',
      proxyMemberSourceSheetVisible: false,
      proxyMemberSourceOptions: [],
      proxyMemberSourceGroupId: '',
      registerForOtherManualVisible: false,
      registerForOtherSheetVisible: false,
      registerSubmitting: false
    });
  },

  _openProxyMemberSourceSheet: function () {
    var series = seriesStore.getSeriesById(this._seriesId);
    var options = seriesProxyRegisterViewModel.buildProxyMemberSourceOptions(
      series,
      DEFAULT_ORG_LOGO
    );
    if (!options.length) {
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '暂无参赛球队成员可选', icon: 'none' });
      }
      return;
    }
    if (options.length === 1) {
      this._confirmProxyMemberSourceAndOpenPicker(options[0]);
      return;
    }
    this._commitManageOverlayPatch({
      proxyMemberSourceSheetVisible: true,
      proxyMemberSourceOptions: options,
      proxyMemberSourceGroupId: ''
    });
  },

  selectProxyMemberSource: function (e) {
    if (!this._pageAlive) return;
    var id =
      e && e.currentTarget && e.currentTarget.dataset
        ? String(e.currentTarget.dataset.id || '')
        : '';
    if (!id) return;
    this._safeSetData({ proxyMemberSourceGroupId: id });
  },

  cancelProxyMemberSourceSheet: function () {
    this._clearProxyMemberSourceState();
  },

  confirmProxyMemberSourceSheet: function () {
    if (!this._pageAlive) return;
    var groupId = String(this.data.proxyMemberSourceGroupId || '');
    var options = this.data.proxyMemberSourceOptions || [];
    var opt = null;
    for (var i = 0; i < options.length; i++) {
      if (options[i] && String(options[i].id) === groupId) {
        opt = options[i];
        break;
      }
    }
    if (!opt || !opt.sourceTeamId) {
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '请选择成员来源球队', icon: 'none' });
      }
      return;
    }
    var self = this;
    this._commitManageOverlayPatch(
      { proxyMemberSourceSheetVisible: false },
      function () {
        if (!self._pageAlive) return;
        self._confirmProxyMemberSourceAndOpenPicker(opt);
      }
    );
  },

  _confirmProxyMemberSourceAndOpenPicker: function (opt) {
    var source = opt || {};
    var sourceTeamId = String(source.sourceTeamId || '').trim();
    var groupId = source.id != null ? String(source.id).trim() : '';
    var name = String(source.name || '').trim();
    if (!sourceTeamId) {
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '本赛事未关联球队', icon: 'none' });
      }
      return;
    }
    this._proxyMemberSourceGroupId = groupId;
    this._proxyMemberSourceTeamId = sourceTeamId;
    this._proxyMemberSourceTeamName = name;
    this._safeSetData({
      proxyMemberSourceDisplayName: name,
      proxyMemberSourceGroupId: groupId
    });
    this._navigateProxyTeamMembersPicker(sourceTeamId, name);
  },

  _openRegisterForOtherTeamMembersPicker: function () {
    var series = seriesStore.getSeriesById(this._seriesId);
    if (!series) {
      this._toastRegisterFailure('series_not_found');
      return;
    }
    var hostMode = String(series.hostMode || '').trim();
    if (hostMode !== 'team') {
      this._openProxyMemberSourceSheet();
      return;
    }
    var teamId = seriesProxyRegisterViewModel.resolveSeriesHostTeamId(series);
    if (!teamId) {
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '本赛事未关联球队', icon: 'none' });
      }
      return;
    }
    this._clearProxyMemberSourceState();
    this._navigateProxyTeamMembersPicker(teamId, '');
  },

  _navigateProxyTeamMembersPicker: function (teamId, sourceTeamName) {
    var self = this;
    var tid = String(teamId || '').trim();
    if (!tid) {
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '本赛事未关联球队', icon: 'none' });
      }
      return;
    }
    var series = seriesStore.getSeriesById(this._seriesId);
    var operator = gameStore.getCurrentUser() || {};
    var operatorUserId = String(operator.userId || operator.playerId || '');
    var registerUsers = this._buildSeriesProxyRegisterUsers(series);
    var sourceName = String(sourceTeamName || '').trim();
    var url =
      '/subpackages/player/pages/friends/index?mode=' +
      encodeURIComponent('proxy_register_team') +
      '&matchId=' +
      encodeURIComponent('') +
      '&operatorUserId=' +
      encodeURIComponent(operatorUserId) +
      '&teamId=' +
      encodeURIComponent(tid) +
      (sourceName
        ? '&sourceTeamName=' + encodeURIComponent(sourceName)
        : '') +
      '&slotId=' +
      encodeURIComponent('series-register-for-other-team');
    if (typeof wx === 'undefined' || typeof wx.navigateTo !== 'function') return;
    wx.navigateTo({
      url: url,
      success: function (res) {
        try {
          if (res && res.eventChannel && res.eventChannel.emit) {
            res.eventChannel.emit('proxyRegisterContext', {
              registerUsers: registerUsers,
              operatorUserId: operatorUserId,
              matchId: '',
              seriesId: self._seriesId,
              teamId: tid,
              sourceTeamName: sourceName
            });
          }
        } catch (eCtx) {
          /* ignore */
        }
      },
      events: {
        friendsSelected: function (payload) {
          self._onSeriesProxyFriendsSelected(payload || {});
        }
      },
      fail: function (err) {
        if (typeof wx.showToast === 'function') {
          wx.showToast({
            title: '跳转失败：' + (err && err.errMsg ? err.errMsg : ''),
            icon: 'none'
          });
        }
      }
    });
  },

  _onSeriesProxyFriendsSelected: function (payload) {
    if (!this._pageAlive) return;
    var data = payload || {};
    var addedPlayers = Array.isArray(data.addedPlayers) ? data.addedPlayers : [];
    var removedPlayers = Array.isArray(data.removedPlayers) ? data.removedPlayers : [];
    var mode =
      data.mode === 'proxy_register_team' ? 'proxy_register_team' : 'proxy_register';
    var pickChannel = mode === 'proxy_register_team' ? 'team_members' : 'friends';
    var removePlan = this._buildSeriesProxyRemovePlan(removedPlayers);
    this._seriesProxyCommitPlan = {
      removals: removePlan.removable.slice(),
      additions: [],
      pickChannel: pickChannel,
      seriesParticipantId: ''
    };
    if (addedPlayers.length > 0) {
      this._openProxyGroupSheet(addedPlayers, pickChannel);
      return;
    }
    this._applySeriesProxyCommitPlan();
  },

  _buildSeriesProxyRemovePlan: function (removedPlayers) {
    var series = seriesStore.getSeriesById(this._seriesId);
    var roster = Array.isArray(series && series.roster) ? series.roster : [];
    var operator = gameStore.getCurrentUser() || {};
    var operatorUserId = String(operator.userId || operator.playerId || '');
    var byPlayer = Object.create(null);
    var byEntry = Object.create(null);
    var i;
    for (i = 0; i < roster.length; i++) {
      var e = roster[i];
      if (!e) continue;
      var pid = String(e.playerId || '').trim();
      if (pid) byPlayer[pid] = e;
      var eid = String(e.rosterEntryId || '').trim();
      if (eid) byEntry[eid] = e;
    }
    var list = Array.isArray(removedPlayers) ? removedPlayers : [];
    var removable = [];
    var skipped = [];
    for (i = 0; i < list.length; i++) {
      var player = list[i];
      var userId = String((player && (player.userId || player.playerId)) || '').trim();
      var rosterEntryId = String((player && player.rosterEntryId) || '').trim();
      var registration = (rosterEntryId && byEntry[rosterEntryId]) || (userId && byPlayer[userId]);
      if (
        !seriesProxyRegisterViewModel.isProxyRemovableByActor(registration, operatorUserId)
      ) {
        skipped.push({
          player: player,
          reason: 'not_registered_by_me'
        });
        continue;
      }
      removable.push({
        rosterEntryId: String(registration.rosterEntryId || ''),
        playerId: String(registration.playerId || userId),
        userId: String(registration.playerId || userId)
      });
    }
    return { removable: removable, skipped: skipped };
  },

  openRegisterForOtherManualSheet: function () {
    if (!this._pageAlive) return;
    this._commitManageOverlayPatch({
      registerForOtherManualVisible: true,
      registerForOtherManualName: '',
      registerForOtherManualPhone: '',
      registerForOtherManualGender: 'male'
    });
  },

  closeRegisterForOtherManualSheet: function () {
    if (!this._pageAlive) return;
    this._closeManageSecondaryPatch({
      registerForOtherManualVisible: false,
      registerForOtherManualName: '',
      registerForOtherManualPhone: '',
      registerForOtherManualGender: 'male'
    });
  },

  onRegisterForOtherManualNameInput: function (e) {
    if (!this._pageAlive) return;
    this._safeSetData({
      registerForOtherManualName: (e.detail && e.detail.value) || ''
    });
  },

  onRegisterForOtherManualPhoneInput: function (e) {
    if (!this._pageAlive) return;
    this._safeSetData({
      registerForOtherManualPhone: (e.detail && e.detail.value) || ''
    });
  },

  onRegisterForOtherManualGenderSelect: function (e) {
    if (!this._pageAlive) return;
    var gender =
      e && e.currentTarget && e.currentTarget.dataset
        ? e.currentTarget.dataset.gender
        : '';
    if (gender !== 'male' && gender !== 'female') return;
    this._safeSetData({ registerForOtherManualGender: gender });
  },

  confirmRegisterForOtherManualSheet: function () {
    if (!this._pageAlive) return;
    if (this._registerWriteLock || this.data.registerSubmitting) return;
    var name = String(this.data.registerForOtherManualName || '').trim();
    var phone = String(this.data.registerForOtherManualPhone || '').trim();
    var gender =
      this.data.registerForOtherManualGender === 'female' ? 'female' : 'male';
    if (!name) {
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '请输入选手姓名', icon: 'none' });
      }
      return;
    }
    if (phone && !/^1\d{10}$/.test(phone)) {
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '手机号格式不正确', icon: 'none' });
      }
      return;
    }
    if (phone) {
      var series = seriesStore.getSeriesById(this._seriesId);
      var roster = Array.isArray(series && series.roster) ? series.roster : [];
      var phoneExists = roster.some(function (u) {
        return (
          u &&
          String(u.registrationStatus || '') === 'registered' &&
          String(u.phoneSnapshot || '').trim() === phone
        );
      });
      if (phoneExists) {
        if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
          wx.showToast({ title: '已报名', icon: 'none' });
        }
        return;
      }
    }
    var ts = Date.now();
    var userId = phone ? 'phone_pending_' + ts : 'nonreg_' + ts;
    var player = {
      playerId: userId,
      userId: userId,
      name: name,
      competitionName: name,
      realName: name,
      phone: phone || '',
      gender: gender,
      avatar: mockAvatars.pickMockAvatar(userId || name),
      pickChannel: 'manual',
      source: 'proxy'
    };
    this._seriesProxyCommitPlan = {
      removals: [],
      additions: [],
      pickChannel: 'manual',
      seriesParticipantId: ''
    };
    this.closeRegisterForOtherManualSheet();
    this._openProxyGroupSheet([player], 'manual');
  },

  _openProxyGroupSheet: function (players, pickChannel) {
    if (!this._pageAlive) return;
    var list = Array.isArray(players) ? players.slice() : [];
    if (!list.length) {
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '未选择人员', icon: 'none' });
      }
      return;
    }
    var series = seriesStore.getSeriesById(this._seriesId);
    var aff = seriesProxyRegisterViewModel.buildProxyAffiliationOptions(
      series,
      DEFAULT_ORG_LOGO
    );
    if (!aff.options.length) {
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({
          title: '暂无' + (aff.fieldLabel || '球队') + '可选',
          icon: 'none'
        });
      }
      return;
    }
    // 成员来源侧可作为默认归属；好友/手工不默认第一主体
    var defaultRegId = String(this._proxyMemberSourceGroupId || '').trim();
    var hasDefault = !!(
      defaultRegId &&
      aff.options.some(function (g) {
        return String(g.id) === defaultRegId;
      })
    );
    var sourceName = String(this._proxyMemberSourceTeamName || '').trim();
    var channel = pickChannel || '';
    this._pendingProxyPlayers = list;
    this._proxyPickChannel = channel;
    this._commitManageOverlayPatch({
      pendingProxyPlayers: list,
      proxyGroupOptions: aff.options,
      proxyGroupId: hasDefault ? defaultRegId : '',
      proxyMemberSourceDisplayName:
        channel === 'team_members' && sourceName ? sourceName : '',
      proxyGroupSheetVisible: true,
      proxyGroupSheetTitle: aff.sheetTitle,
      proxyGroupSheetSub: aff.sheetSub,
      proxyRegistrationFieldLabel: aff.fieldLabel,
      registerSubmitting: false
    });
  },

  selectProxyGroup: function (e) {
    if (!this._pageAlive) return;
    var id =
      e && e.currentTarget && e.currentTarget.dataset
        ? e.currentTarget.dataset.id
        : '';
    if (!id) return;
    this._safeSetData({ proxyGroupId: String(id) });
  },

  cancelProxyGroupSheet: function () {
    if (!this._pageAlive) return;
    if (this._registerWriteLock || this.data.registerSubmitting) return;
    this._clearProxyRegistrationTempState();
  },

  confirmProxyGroupSheet: function () {
    if (!this._pageAlive) return;
    if (this._registerWriteLock || this.data.registerSubmitting) return;
    if (!this._registrationService) return;
    var groupId = String(this.data.proxyGroupId || '').trim();
    var options = this.data.proxyGroupOptions || [];
    var group = null;
    for (var i = 0; i < options.length; i++) {
      if (options[i] && String(options[i].id) === groupId) {
        group = options[i];
        break;
      }
    }
    if (!group) {
      var side = this.data.proxyRegistrationFieldLabel || '球队';
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '请选择' + side, icon: 'none' });
      }
      return;
    }
    var series = seriesStore.getSeriesById(this._seriesId);
    if (!series) {
      this._toastRegisterFailure('series_not_found');
      return;
    }
    if (this._isSeriesOverallCompleted(series)) {
      this._clearProxyRegistrationTempState();
      this._showOrdinaryFinishedUnavailable();
      return;
    }
    if (String(series.registrationState || '').trim() !== 'open') {
      this._clearProxyRegistrationTempState();
      this._showRegistrationClosedModal();
      return;
    }
    var players =
      this._pendingProxyPlayers ||
      (Array.isArray(this.data.pendingProxyPlayers)
        ? this.data.pendingProxyPlayers
        : []);
    var plan = this._seriesProxyCommitPlan || {
      removals: [],
      additions: [],
      pickChannel: this._proxyPickChannel || 'friends',
      seriesParticipantId: ''
    };
    plan.seriesParticipantId = groupId;
    plan.additions = players.slice();
    plan.pickChannel = this._proxyPickChannel || plan.pickChannel || 'friends';
    this._seriesProxyCommitPlan = plan;
    this._applySeriesProxyCommitPlan();
  },

  /**
   * 单次 applyProxyCommitPlan：removals 经编排器闸门，与 additions 同一事务。
   */
  _applySeriesProxyCommitPlan: function () {
    if (!this._pageAlive || !this._registrationService || !this._selfCancelOrchestrator) return;
    if (this._registerWriteLock || this.data.registerSubmitting) return;
    var plan = this._seriesProxyCommitPlan;
    if (!plan) {
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '没有可更新的报名', icon: 'none' });
      }
      return;
    }
    var series = seriesStore.getSeriesById(this._seriesId);
    if (!series) {
      this._toastRegisterFailure('series_not_found');
      return;
    }
    if (this._isSeriesOverallCompleted(series)) {
      this._clearProxyRegistrationTempState();
      this._showOrdinaryFinishedUnavailable();
      return;
    }
    if (String(series.registrationState || '').trim() !== 'open') {
      this._clearProxyRegistrationTempState();
      this._showRegistrationClosedModal();
      return;
    }
    var resolved = this._resolveRegisterIdentity();
    if (!resolved.identity.ok) {
      this._toastRegisterFailure('identity_unresolved');
      return;
    }
    var actorPlayerId = resolved.identity.playerId;
    var profile = resolved.profile || {};
    var actorUser = gameStore.getCurrentUser() || {};
    var actorName =
      String(actorUser.name || '').trim() ||
      String(profile.competitionName || profile.nickName || '').trim() ||
      actorPlayerId;
    var expectedRevision = Number(series.registrationRevision);
    if (!Number.isFinite(expectedRevision) || expectedRevision < 0) expectedRevision = 0;
    var channel = plan.pickChannel || this._proxyPickChannel || 'friends';
    var targetPid = String(plan.seriesParticipantId || '').trim();
    var additions = [];
    var rawAdds = Array.isArray(plan.additions) ? plan.additions : [];
    var i;
    for (i = 0; i < rawAdds.length; i++) {
      var payload = seriesProxyRegisterViewModel.mapPickerPlayerToProxyPayload(
        rawAdds[i],
        channel
      );
      if (!payload.playerId) continue;
      additions.push(
        Object.assign({}, payload, {
          seriesParticipantId: targetPid || payload.seriesParticipantId || ''
        })
      );
    }
    var removals = Array.isArray(plan.removals) ? plan.removals : [];
    if (!removals.length && !additions.length) {
      this._clearProxyRegistrationTempState();
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '没有可更新的报名', icon: 'none' });
      }
      return;
    }

    this._registerWriteLock = true;
    this._safeSetData({ registerSubmitting: true });
    var result = null;
    try {
      result = this._selfCancelOrchestrator.applyProxyCommitPlanWithStationCleanup({
        seriesId: this._seriesId,
        expectedRegistrationRevision: expectedRevision,
        actor: {
          playerId: actorPlayerId,
          userId: actorPlayerId,
          name: actorName
        },
        actorUserId: actorPlayerId,
        seriesParticipantId: targetPid,
        removals: removals,
        additions: additions
      });
    } catch (eWrite) {
      result = { ok: false, reason: 'storage_write_failed' };
    } finally {
      this._registerWriteLock = false;
      if (this._pageAlive && !(result && result.ok && !result.idempotent)) {
        this._safeSetData({ registerSubmitting: false });
      }
    }

    if (!this._pageAlive) return;

    if (result && result.reason === 'registration_conflict') {
      this._clearProxyRegistrationTempState();
      this._handleRegistrationConflict();
      return;
    }
    if (!result || !result.ok) {
      if (result && result.reason === 'series_completed') {
        this._clearProxyRegistrationTempState();
        this._showOrdinaryFinishedUnavailable();
        return;
      }
      if (result && result.reason === 'registration_closed') {
        this._clearProxyRegistrationTempState();
        this._showRegistrationClosedModal();
        return;
      }
      if (
        result &&
        (result.reason === 'already_registered' ||
          result.reason === 'already_registered_elsewhere')
      ) {
        if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
          wx.showToast({ title: '已报名', icon: 'none' });
        }
        return;
      }
      this._toastRegisterFailure((result && result.reason) || 'storage_write_failed');
      return;
    }

    var changed =
      Number(result.addedCount) > 0 || Number(result.removedCount) > 0;
    var lastSeries = seriesStore.getSeriesById(this._seriesId) || result.series || series;
    this._clearProxyRegistrationTempState(true);
    this._applyRegisterWriteSuccess(lastSeries, targetPid || this._registerActiveParticipantId);
    this._closeManageSecondaryPatch({
      proxyGroupSheetVisible: false,
      pendingProxyPlayers: [],
      proxyGroupOptions: [],
      proxyGroupId: '',
      proxyMemberSourceDisplayName: '',
      registerForOtherSheetVisible: false,
      registerSubmitting: false
    });
    if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
      wx.showToast({
        title: changed ? '代报名已更新' : '没有可更新的报名',
        icon: changed ? 'success' : 'none'
      });
    }
  },

  shareSeriesInvite: function () {
    if (!this._pageAlive) return;
    this._pendingShareInvite = true;
    this.closeMoreSheetFully();
    try {
      if (typeof wx !== 'undefined' && typeof wx.showShareMenu === 'function') {
        wx.showShareMenu({
          withShareTicket: true,
          menus: ['shareAppMessage', 'shareTimeline']
        });
      }
    } catch (eShare) {
      /* ignore */
    }
    if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
      wx.showToast({ title: '请点击右上角分享给好友', icon: 'none' });
    }
  },

  onShareAppMessage: function () {
    var series =
      this._lastSeriesForSchedule ||
      (this._seriesId ? seriesStore.getSeriesById(this._seriesId) : null);
    var title =
      (series && (series.seriesName || series.name)) ||
      this.data.seriesName ||
      '系列赛';
    var subtitle =
      (this.data.hero && this.data.hero.chipText) ||
      (series && (series.subtitle || series.templateLabel)) ||
      this.data.templateLabel ||
      '';
    var path = seriesManageSheetViewModel.buildSeriesInviteSharePath(
      this._seriesId || (series && series.seriesId) || ''
    );
    if (!path) {
      path =
        '/subpackages/tournament/pages/series-detail/index?seriesId=' +
        encodeURIComponent(this._seriesId || '');
    }
    this._pendingShareInvite = false;
    var shareTitle = '邀请你报名：' + title;
    if (subtitle) shareTitle = shareTitle + ' · ' + subtitle;
    var share = {
      title: shareTitle,
      path: path
    };
    var hero = this.data.hero || {};
    var imageUrl =
      String(hero.logo || '').trim() ||
      String(hero.bannerImage || '').trim() ||
      String((series && series.logo) || '').trim() ||
      String((series && series.bannerImage) || '').trim();
    if (imageUrl) share.imageUrl = imageUrl;
    return share;
  },

  toggleSeriesRegistrationState: function () {
    if (!this._pageAlive || !this._registrationService) return;
    var series = seriesStore.getSeriesById(this._seriesId);
    if (!series) {
      this._toastRegisterFailure('series_not_found');
      return;
    }
    var actor = gameStore.getCurrentUser() || {};
    // 事件层再验：普通用户不得触发报名开关
    if (!seriesManageAccess.isSeriesHostPrivileged(series, actor)) {
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '暂无管理权限', icon: 'none' });
      }
      return;
    }
    if (seriesFinishLock.isSeriesCompleted(series)) {
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({
          title: seriesFinishLock.SERIES_COMPLETED_TOAST,
          icon: 'none'
        });
      }
      return;
    }
    var current = String(series.registrationState || '').trim() === 'open' ? 'open' : 'closed';
    var next = current === 'open' ? 'closed' : 'open';
    var expectedRevision = Number(series.registrationRevision);
    if (!Number.isFinite(expectedRevision) || expectedRevision < 0) expectedRevision = 0;
    var result = this._registrationService.setRegistrationState({
      seriesId: this._seriesId,
      state: next,
      actor: actor,
      expectedRegistrationRevision: expectedRevision
    });
    if (!result || !result.ok) {
      if (result && result.reason === 'registration_conflict') {
        this._handleRegistrationConflict();
        return;
      }
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({
          title:
            result && result.reason === 'permission_denied'
              ? '暂无管理权限'
              : '操作失败',
          icon: 'none'
        });
      }
      return;
    }
    this._lastSeriesForSchedule = result.series || seriesStore.getSeriesById(this._seriesId);
    this._rebuildRegisterProjection();
    this._refreshSeriesManageSheet();
    this.reloadViewModel({ resetScroll: false });
    if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
      wx.showToast({
        title: next === 'open' ? '已打开报名' : '已关闭报名',
        icon: 'success'
      });
    }
  },

  _confirmFinishSeries: function () {
    if (!this._pageAlive) return;
    if (this._seriesFinishBusy) return;
    var series = seriesStore.getSeriesById(this._seriesId);
    if (!series) {
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '系列赛数据异常', icon: 'none' });
      }
      return;
    }
    var actor = gameStore.getCurrentUser() || {};
    if (!seriesManageAccess.isSeriesHostPrivileged(series, actor)) {
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '暂无管理权限', icon: 'none' });
      }
      return;
    }
    if (seriesFinishLock.isSeriesCompleted(series)) {
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({
          title: seriesFinishLock.SERIES_COMPLETED_TOAST,
          icon: 'none'
        });
      }
      return;
    }
    this._seriesFinishBusy = true;
    this._refreshSeriesManageSheet();
    var self = this;
    var getter = function (id) {
      return teamMatchStore.getMatchById(id);
    };
    var first = seriesFinalize.getManualFinishFirstConfirm(series, getter);
    var release = function () {
      self._seriesFinishBusy = false;
      if (self._pageAlive) self._refreshSeriesManageSheet();
    };
    var showModal =
      typeof wx !== 'undefined' && typeof wx.showModal === 'function' ? wx.showModal : null;
    if (!showModal) {
      release();
      return;
    }
    showModal({
      title: first.title,
      content: first.content,
      cancelText: first.cancelText,
      confirmText: first.confirmText,
      success: function (res) {
        if (!self._pageAlive) return;
        if (!res || !res.confirm) {
          release();
          return;
        }
        self._promptFinishSeriesDanger(actor, getter);
      },
      fail: function () {
        release();
      }
    });
  },

  _promptFinishSeriesDanger: function (actor, getter) {
    var self = this;
    var release = function () {
      self._seriesFinishBusy = false;
      if (self._pageAlive) self._refreshSeriesManageSheet();
    };
    var latest = seriesStore.getSeriesById(this._seriesId);
    if (!latest) {
      release();
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '系列赛数据异常', icon: 'none' });
      }
      return;
    }
    if (seriesFinishLock.isSeriesCompleted(latest)) {
      release();
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({
          title: seriesFinishLock.SERIES_COMPLETED_TOAST,
          icon: 'none'
        });
      }
      return;
    }
    var second = seriesFinalize.getManualFinishSecondConfirm(latest, getter);
    var showModal =
      typeof wx !== 'undefined' && typeof wx.showModal === 'function' ? wx.showModal : null;
    if (!showModal) {
      release();
      return;
    }
    showModal({
      title: second.title,
      content: second.content,
      cancelText: second.cancelText,
      confirmText: second.confirmText,
      confirmColor: second.confirmColor || seriesFinalize.DANGER_CONFIRM_COLOR,
      success: function (res) {
        if (!self._pageAlive) return;
        if (!res || !res.confirm) {
          release();
          return;
        }
        self._runManualFinishSeries(actor, getter, second.unfinishedRoundIds);
      },
      fail: function () {
        release();
      }
    });
  },

  _runManualFinishSeries: function (actor, getter, expectedUnfinishedRoundIds) {
    var self = this;
    var result = seriesFinalize.finalizeSeries({
      seriesId: self._seriesId,
      source: 'manual',
      actor: actor,
      getMatchById: getter,
      expectedUnfinishedRoundIds: expectedUnfinishedRoundIds
    });
    self._seriesFinishBusy = false;
    if (!result || !result.ok) {
      if (self._pageAlive) self._refreshSeriesManageSheet();
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({
          title:
            (result && result.message) ||
            (result && result.reason === 'permission_denied'
              ? '暂无管理权限'
              : '操作失败'),
          icon: 'none'
        });
      }
      return;
    }
    self._lastSeriesForSchedule = result.series || seriesStore.getSeriesById(self._seriesId);
    self._rebuildRegisterProjection();
    self._rebuildScheduleProjection();
    self._refreshSeriesManageSheet();
    self.reloadViewModel({ resetScroll: false });
    if (result.idempotent) {
      return;
    }
    if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
      wx.showToast({ title: '系列赛已结束', icon: 'success' });
    }
  },

  onSeriesScopeFeatureTap: function (e) {
    if (!this._pageAlive) return;
    var permission =
      e && e.currentTarget && e.currentTarget.dataset
        ? e.currentTarget.dataset.permission
        : '';
    permission = permission != null ? String(permission).trim() : '';
    if (!permission) return;
    var disabledAttr =
      e && e.currentTarget && e.currentTarget.dataset
        ? e.currentTarget.dataset.disabled
        : false;
    var disabledFromUi =
      disabledAttr === true ||
      disabledAttr === 'true' ||
      disabledAttr === 1 ||
      disabledAttr === '1';
    var series =
      this._lastSeriesForSchedule ||
      (this._seriesId ? seriesStore.getSeriesById(this._seriesId) : null);
    var user = gameStore.getCurrentUser() || {};
    var isManage = !!(
      series && seriesManageAccess.isSeriesHostPrivileged(series, user)
    );

    if (permission === 'edit_series') {
      if (!isManage) {
        if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
          wx.showToast({ title: '暂无管理权限', icon: 'none' });
        }
        return;
      }
      if (seriesFinishLock.isSeriesCompleted(series)) {
        if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
          wx.showToast({
            title: seriesFinishLock.SERIES_COMPLETED_TOAST,
            icon: 'none'
          });
        }
        return;
      }
      if (disabledFromUi) return;
      this.closeMoreSheetFully();
      var seriesIdForEdit = String(this._seriesId || '').trim();
      if (!seriesIdForEdit) {
        wx.showToast({ title: '系列赛数据异常', icon: 'none' });
        return;
      }
      try {
        if (typeof wx !== 'undefined' && typeof wx.setStorageSync === 'function') {
          wx.setStorageSync('gb_series_edit_series_return_v1', {
            seriesId: seriesIdForEdit,
            activeTab: this._activeTab || this.data.activeTab || '',
            scheduleSelectedKey: this._scheduleSelectedKey || '',
            standingsSelectedKey: this._standingsSelectedKey || '',
            scrollTop: Number(this._scrollTop || this.data.scrollTop || 0) || 0
          });
        }
      } catch (eRet) {
        /* ignore */
      }
      wx.navigateTo({
        url:
          '/subpackages/create/pages/series/index?mode=edit_series&seriesId=' +
          encodeURIComponent(seriesIdForEdit),
        fail: function () {
          wx.showToast({ title: '页面尚未注册', icon: 'none' });
        }
      });
      return;
    }
    if (permission === 'cancel_series') {
      if (!isManage) {
        if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
          wx.showToast({ title: '暂无管理权限', icon: 'none' });
        }
        return;
      }
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '功能即将开放', icon: 'none' });
      }
      return;
    }
    if (permission === 'toggle_registration') {
      if (!isManage) {
        if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
          wx.showToast({ title: '暂无管理权限', icon: 'none' });
        }
        return;
      }
      if (seriesFinishLock.isSeriesCompleted(series)) {
        if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
          wx.showToast({
            title: seriesFinishLock.SERIES_COMPLETED_TOAST,
            icon: 'none'
          });
        }
        return;
      }
      if (disabledFromUi) return;
      this.toggleSeriesRegistrationState();
      return;
    }
    if (permission === 'finish_series') {
      if (!isManage) {
        if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
          wx.showToast({ title: '暂无管理权限', icon: 'none' });
        }
        return;
      }
      if (this._seriesFinishBusy) return;
      if (disabledFromUi) return;
      this._confirmFinishSeries();
      return;
    }
    if (disabledFromUi) return;
    if (permission === 'register_for_other') {
      this.openProxyRegisterSheet();
      return;
    }
    if (permission === 'invite_friends_register') {
      this.shareSeriesInvite();
      return;
    }
  },

  _toastGateFail: function (gate) {
    if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
      wx.showToast({
        title:
          (gate && gate.message) || seriesStationManageGate.GATE_FAIL_MESSAGE,
        icon: 'none'
      });
    }
  },

  _requestSwitchTab: function (tab) {
    if (!tab || tab === this._activeTab) {
      return;
    }
    this._performSwitchTab(tab);
  },

  _goSeriesManageScheduleRound: function (roundId) {
    var rid = roundId != null ? String(roundId).trim() : '';
    if (!rid) return;
    this._scheduleSelectedKey = rid;
    this.closeMoreSheetFully();
    var self = this;
    var after = function () {
      self._rebuildScheduleProjection();
    };
    if (this._activeTab === 'schedule') {
      after();
      return;
    }
    this._requestSwitchTab('schedule');
    if (typeof wx !== 'undefined' && typeof wx.nextTick === 'function') {
      wx.nextTick(after);
    } else {
      setTimeout(after, 0);
    }
  },

  /**
   * @param {string} roundId
   * @param {object|string} selectionOrView {view,scoreType} 或旧 view 字符串
   */
  _goSeriesManageStandingsRound: function (roundId, selectionOrView) {
    var rid = roundId != null ? String(roundId).trim() : '';
    if (!rid) return;
    if (selectionOrView != null && selectionOrView !== '') {
      this._rememberStandingsSelection(rid, selectionOrView);
    }
    this._standingsSelectedKey = rid;
    this._standingsPersonalOpenIndex = -1;
    this._frozenStandingsScorecard = null;
    var self = this;
    var after = function () {
      self._reprojectStandingsBoardOverlay(
        Object.assign({}, self._emptyStandingsScorecardPatch(), {
          expandedStandingsTeamId: ''
        })
      );
    };
    if (this._activeTab === 'standings') {
      after();
      return;
    }
    this._requestSwitchTab('standings');
    if (typeof wx !== 'undefined' && typeof wx.nextTick === 'function') {
      wx.nextTick(after);
    } else {
      setTimeout(after, 0);
    }
  },

  /**
   * 本轮「领先榜」：完整复用普通赛事 setting 投影（scoreType + view）
   * 普通用户可用；不写 Series/match/storage
   */
  _openSeriesRoundLeaderboardSettingSheet: function (gate) {
    var g = gate && typeof gate === 'object' ? gate : null;
    if (!g || !g.ok || !g.match || !g.roundId) {
      this._toastGateFail(g);
      return;
    }
    var roundId = String(g.roundId).trim();
    var draftSelection = this._resolveStandingsSelectionForKey(roundId);
    var packed = seriesStandingsViewOptions.buildSeriesLeaderboardSettingSections(
      g.match,
      draftSelection,
      { sideLabel: '球队' }
    );
    var subtitle = '';
    try {
      var viewSec = this.data.roundViewSection || {};
      subtitle = viewSec.headline != null ? String(viewSec.headline).trim() : '';
    } catch (e0) {
      subtitle = '';
    }
    if (!subtitle) {
      var picker =
        this.data.manageRoundPicker && Array.isArray(this.data.manageRoundPicker.items)
          ? this.data.manageRoundPicker.items
          : [];
      for (var i = 0; i < picker.length; i++) {
        if (picker[i] && String(picker[i].roundId) === roundId) {
          var lab = String(picker[i].label || '').trim();
          var nm = String(picker[i].name || '').trim();
          subtitle = lab + (nm ? ' · ' + nm : '');
          break;
        }
      }
    }
    this._leaderboardSettingRoundId = roundId;
    this._openFromManageSheet({
      showLeaderboardSettingSheet: true,
      leaderboardSettingSubtitle: subtitle,
      leaderboardSettingSections: packed.sections,
      leaderboardSettingDraftValues: packed.draftValues,
      leaderboardNetScoreAvailable: !!packed.netAvailable,
      _leaderboardSettingRoundId: roundId
    });
  },

  closeLeaderboardSettingSheet: function () {
    this._leaderboardSettingRoundId = '';
    this._closeManageSecondaryPatch({
      showLeaderboardSettingSheet: false,
      _leaderboardSettingRoundId: ''
    });
  },

  onLeaderboardSettingChange: function (e) {
    var detail = (e && e.detail) || {};
    var section = detail.section != null ? String(detail.section).trim() : '';
    var key = detail.key != null ? String(detail.key).trim() : '';
    if (!section || !key) return;
    var draft = Object.assign({}, this.data.leaderboardSettingDraftValues || {});
    if (section === 'view') {
      draft.view = key;
      this._safeSetData({ leaderboardSettingDraftValues: draft });
      return;
    }
    if (section === 'scoreType') {
      if (key !== 'gross' && key !== 'net') return;
      if (key === 'net' && !this.data.leaderboardNetScoreAvailable) return;
      draft.scoreType = key;
      this._safeSetData({ leaderboardSettingDraftValues: draft });
    }
  },

  confirmLeaderboardSettingSheet: function (e) {
    var values =
      (e && e.detail && e.detail.values) ||
      this.data.leaderboardSettingDraftValues ||
      {};
    var roundId =
      String(this._leaderboardSettingRoundId || this.data._leaderboardSettingRoundId || '').trim();
    if (!roundId) {
      this.closeLeaderboardSettingSheet();
      return;
    }
    var match = this._resolveMatchForStandingsRound(roundId);
    if (!match) {
      try {
        var series =
          this._lastSeriesForStandings || seriesStore.getSeriesById(this._seriesId);
        var rounds = series && Array.isArray(series.rounds) ? series.rounds : [];
        for (var i = 0; i < rounds.length; i++) {
          if (rounds[i] && String(rounds[i].roundId) === roundId) {
            var mid = String(rounds[i].matchId || '').trim();
            if (mid) match = teamMatchStore.getMatchById(mid);
            break;
          }
        }
      } catch (e1) {
        match = null;
      }
    }
    var selection = seriesStandingsViewOptions.normalizeSeriesStandingsSelection(
      match,
      values
    );
    this._leaderboardSettingRoundId = '';
    var self = this;
    this._closeManageSecondaryPatch(
      {
        showLeaderboardSettingSheet: false,
        _leaderboardSettingRoundId: ''
      },
      function () {
        if (!self._pageAlive) return;
        self._goSeriesManageStandingsRound(roundId, selection);
      }
    );
  },

  /** 本轮普通功能：领先榜 / 统计数据（查看权限） */
  onSeriesRoundViewFeatureTap: function (e) {
    if (!this._pageAlive) return;
    var ds =
      e && e.currentTarget && e.currentTarget.dataset
        ? e.currentTarget.dataset
        : {};
    var placeholderAttr = ds.placeholder;
    if (
      placeholderAttr === true ||
      placeholderAttr === 'true' ||
      placeholderAttr === 1 ||
      placeholderAttr === '1'
    ) {
      return;
    }
    var permission = ds.permission != null ? String(ds.permission).trim() : '';
    if (!permission || permission.indexOf('__pad_') === 0) return;
    if (!seriesManageSheetViewModel.ROUND_VIEW_PERMISSION_SET[permission]) {
      return;
    }
    var disabledAttr = ds.disabled;
    var disabledFromUi =
      disabledAttr === true ||
      disabledAttr === 'true' ||
      disabledAttr === 1 ||
      disabledAttr === '1';
    if (disabledFromUi) return;

    var gate = this._verifyCurrentManageStation();
    if (!gate || !gate.ok) {
      this._toastGateFail(gate);
      return;
    }
    var matchId = gate.matchId != null ? String(gate.matchId).trim() : '';
    var roundId = gate.roundId != null ? String(gate.roundId).trim() : '';
    if (!matchId || !roundId) {
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '本轮比赛数据异常', icon: 'none' });
      }
      return;
    }

    if (permission === 'leaderboard') {
      this._openSeriesRoundLeaderboardSettingSheet(gate);
      return;
    }
    if (permission === 'stats') {
      this._openSeriesRoundStatsPage(gate);
      return;
    }
  },

  /**
   * 复用普通赛事权威统计页（matchId → statisticsAdapter），不经隐藏 detail
   */
  _openSeriesRoundStatsPage: function (gate) {
    var g = gate && typeof gate === 'object' ? gate : null;
    if (!g || !g.ok) {
      this._toastGateFail(g);
      return;
    }
    var matchId = g.matchId != null ? String(g.matchId).trim() : '';
    if (!matchId) {
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '本轮比赛数据异常', icon: 'none' });
      }
      return;
    }
    var view = this.data.roundViewSection || {};
    var subtitle = view.headline != null ? String(view.headline).trim() : '';
    if (!subtitle) {
      var metaLabel = '';
      try {
        var pickerItems =
          this.data.manageRoundPicker && Array.isArray(this.data.manageRoundPicker.items)
            ? this.data.manageRoundPicker.items
            : [];
        for (var i = 0; i < pickerItems.length; i++) {
          if (pickerItems[i] && String(pickerItems[i].roundId) === String(g.roundId)) {
            metaLabel =
              String(pickerItems[i].label || '').trim() +
              (pickerItems[i].name ? ' · ' + String(pickerItems[i].name).trim() : '');
            break;
          }
        }
      } catch (eMeta) {
        metaLabel = '';
      }
      subtitle = metaLabel;
    }
    this.closeMoreSheetFully();
    var url =
      '/subpackages/tournament-tools/pages/stats/index?matchId=' +
      encodeURIComponent(matchId);
    if (subtitle) {
      url += '&roundSubtitle=' + encodeURIComponent(subtitle);
    }
    if (typeof wx !== 'undefined' && typeof wx.navigateTo === 'function') {
      wx.navigateTo({
        url: url,
        fail: function () {
          wx.showToast({ title: '统计页面尚未注册', icon: 'none' });
        }
      });
    }
  },

  /**
   * 兼容保留：旧 deep-link（fromSeries+openSheet）入口。
   * C6-A 起 edit_half 已改原页 half-course-sheet；其余 sheet 亦已原页接入，业务路径勿再调用。
   */
  _openSeriesDetailSheetDeepLink: function (openSheet) {
    var gate = this._verifyCurrentManageStation();
    if (!gate.ok) {
      this._toastGateFail(gate);
      return;
    }
    var matchId = gate.matchId;
    var url =
      '/subpackages/tournament/pages/detail/index?matchId=' +
      encodeURIComponent(matchId) +
      '&fromSeries=1&openSheet=' +
      encodeURIComponent(openSheet);
    this.closeMoreSheetFully();
    if (typeof wx !== 'undefined' && typeof wx.navigateTo === 'function') {
      wx.navigateTo({
        url: url,
        fail: function () {
          wx.showToast({ title: '页面尚未注册', icon: 'none' });
        }
      });
    }
  },

  /**
   * Series M「修改半场」：原页打开普通 half-course-sheet（不 navigateTo detail）
   * 冻结 matchId；写入走组件内 halfCourseEdit.apply
   */
  _openSeriesHalfCourseSheet: function (gateIn) {
    if (!this._pageAlive) return;
    if (
      this.data.halfSheetVisible ||
      this._halfSheetOpening ||
      this.data.tempAdminSheetVisible ||
      this.data.playerManageSheetVisible ||
      this.data.teeSheetManageSheetVisible ||
      this.data.paymentManageSheetVisible
    ) {
      return;
    }

    var series =
      this._lastSeriesForSchedule ||
      (this._seriesId ? seriesStore.getSeriesById(this._seriesId) : null);
    var roundId =
      (gateIn && gateIn.roundId) || this._manageSelectedRoundId || '';
    roundId = roundId != null ? String(roundId).trim() : '';
    var gate = seriesStationManageGate.verifyManagedStationForManage({
      series: series,
      roundId: roundId,
      getMatchById: function (id) {
        return teamMatchStore.getMatchById(id);
      },
      getIndexByMatchId: function (id) {
        return seriesStationIndex.getByMatchId(id);
      }
    });
    if (!gate || !gate.ok) {
      this._toastGateFail(gate);
      return;
    }
    var user = gameStore.getCurrentUser() || {};
    if (!matchManageAccess.hasMatchManagePermission(gate.match, user, 'edit_half')) {
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '暂无该管理权限', icon: 'none' });
      }
      return;
    }

    var publishToken =
      series && series.publishToken != null
        ? String(series.publishToken).trim()
        : '';
    this._halfFrozen = {
      seriesId: String(gate.seriesId || '').trim(),
      roundId: String(gate.roundId || '').trim(),
      matchId: String(gate.matchId || '').trim(),
      publishToken: publishToken
    };
    var frozenMatchId = this._halfFrozen.matchId;
    if (!frozenMatchId) {
      this._halfFrozen = null;
      this._toastGateFail({ message: seriesStationManageGate.GATE_FAIL_MESSAGE });
      return;
    }
    var subtitle = this._buildTempAdminRoundSubtitle(
      series,
      gate.round,
      gate.roundId
    );

    this._halfSheetOpening = true;
    var self = this;
    this._openFromManageSheet(
      {
        halfSheetVisible: true,
        halfSheetMatchId: frozenMatchId,
        halfSheetRoundSubtitle: subtitle
      },
      function () {
        self._halfSheetOpening = false;
      }
    );
  },

  onHalfCourseSheetClose: function () {
    if (!this._pageAlive) return;
    this._halfFrozen = null;
    this._halfSheetOpening = false;
    this._closeManageSecondaryPatch({
      halfSheetVisible: false,
      halfSheetMatchId: '',
      halfSheetRoundSubtitle: ''
    });
  },

  onHalfCourseSheetConfirm: function () {
    if (!this._pageAlive) return;
    // toast 由 half-course-sheet 标准链路展示，此处不重复
    this._halfFrozen = null;
    this._halfSheetOpening = false;
    var self = this;
    this._closeManageSecondaryPatch(
      {
        halfSheetVisible: false,
        halfSheetMatchId: '',
        halfSheetRoundSubtitle: ''
      },
      function () {
        if (!self._pageAlive) return;
        if (self._canLoadBusinessContent()) {
          self.reloadViewModel({ resetScroll: false });
        }
      }
    );
  },

  /**
   * 权限管理轮次副标题：R{正式序号} · {roundName}
   * 序号取 Series.rounds 当前正式顺序；名称取 round.roundName / round.name
   */
  _buildTempAdminRoundSubtitle: function (series, round, roundId) {
    var rid = roundId != null ? String(roundId).trim() : '';
    var rounds = series && Array.isArray(series.rounds) ? series.rounds : [];
    var index = 0;
    var found = round && typeof round === 'object' ? round : null;
    for (var i = 0; i < rounds.length; i++) {
      var r = rounds[i] || {};
      if (String(r.roundId || '').trim() !== rid) continue;
      found = r;
      index =
        r.index != null && Number.isFinite(Number(r.index))
          ? Number(r.index)
          : i + 1;
      break;
    }
    if (!index) index = 1;
    var name = '';
    if (found) {
      name = String(found.roundName || found.name || '').trim();
    }
    if (!name) name = '第' + index + '轮';
    return 'R' + index + ' · ' + name;
  },

  /** Series M「权限管理」：原地打开共享组件，不跳转普通 detail */
  _openSeriesTempAdminPermissionSheet: function (gateIn) {
    if (!this._pageAlive) return;
    if (this.data.tempAdminSheetVisible || this._tempAdminSheetOpening) return;

    var series =
      this._lastSeriesForSchedule ||
      (this._seriesId ? seriesStore.getSeriesById(this._seriesId) : null);
    var roundId =
      (gateIn && gateIn.roundId) || this._manageSelectedRoundId || '';
    roundId = roundId != null ? String(roundId).trim() : '';
    var gate = seriesStationManageGate.verifyManagedStationForManage({
      series: series,
      roundId: roundId,
      getMatchById: function (id) {
        return teamMatchStore.getMatchById(id);
      },
      getIndexByMatchId: function (id) {
        return seriesStationIndex.getByMatchId(id);
      }
    });
    if (!gate || !gate.ok) {
      this._toastGateFail(gate);
      return;
    }
    var user = gameStore.getCurrentUser() || {};
    if (!matchManageAccess.canManageTempAdmins(gate.match, user)) {
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '暂无权限管理权限', icon: 'none' });
      }
      return;
    }

    var publishToken =
      series && series.publishToken != null
        ? String(series.publishToken).trim()
        : '';
    this._tempAdminFrozen = {
      seriesId: String(gate.seriesId || '').trim(),
      roundId: String(gate.roundId || '').trim(),
      matchId: String(gate.matchId || '').trim(),
      publishToken: publishToken
    };
    var subtitle = this._buildTempAdminRoundSubtitle(
      series,
      gate.round,
      gate.roundId
    );
    var frozenMatchId = this._tempAdminFrozen.matchId;
    if (!frozenMatchId) {
      this._tempAdminFrozen = null;
      this._toastGateFail({ message: seriesStationManageGate.GATE_FAIL_MESSAGE });
      return;
    }

    this._tempAdminSheetOpening = true;
    var self = this;
    this._openFromManageSheet(
      {
        tempAdminSheetVisible: true,
        tempAdminSheetMatchId: frozenMatchId,
        tempAdminSheetRoundSubtitle: subtitle
      },
      function () {
        self._tempAdminSheetOpening = false;
      }
    );
  },

  onTempAdminPermissionSheetClose: function () {
    if (!this._pageAlive) return;
    this._tempAdminFrozen = null;
    this._tempAdminSheetOpening = false;
    this._closeManageSecondaryPatch({
      tempAdminSheetVisible: false,
      tempAdminSheetMatchId: '',
      tempAdminSheetRoundSubtitle: ''
    });
  },

  onTempAdminPermissionSheetSaved: function () {
    if (!this._pageAlive) return;
    this._tempAdminFrozen = null;
    this._tempAdminSheetOpening = false;
    // toast 由共享组件标准链路展示，此处不重复
    var self = this;
    this._closeManageSecondaryPatch(
      {
        tempAdminSheetVisible: false,
        tempAdminSheetMatchId: '',
        tempAdminSheetRoundSubtitle: ''
      },
      function () {
        if (!self._pageAlive) return;
        // 无损刷新管理投影：不重置 TAB / 轮次选择 / 纵向滚动
        if (self._canLoadBusinessContent()) {
          self.reloadViewModel({ resetScroll: false });
        }
      }
    );
  },

  /** Series M「选手管理」：原地打开共享组件，不跳转普通 detail */
  _openSeriesPlayerManageSheet: function (gateIn) {
    if (!this._pageAlive) return;
    if (
      this.data.playerManageSheetVisible ||
      this._playerManageSheetOpening ||
      this.data.tempAdminSheetVisible
    ) {
      return;
    }

    var series =
      this._lastSeriesForSchedule ||
      (this._seriesId ? seriesStore.getSeriesById(this._seriesId) : null);
    var roundId =
      (gateIn && gateIn.roundId) || this._manageSelectedRoundId || '';
    roundId = roundId != null ? String(roundId).trim() : '';
    var gate = seriesStationManageGate.verifyManagedStationForManage({
      series: series,
      roundId: roundId,
      getMatchById: function (id) {
        return teamMatchStore.getMatchById(id);
      },
      getIndexByMatchId: function (id) {
        return seriesStationIndex.getByMatchId(id);
      }
    });
    if (!gate || !gate.ok) {
      this._toastGateFail(gate);
      return;
    }
    var user = gameStore.getCurrentUser() || {};
    var access = matchManageAccess.resolveMatchManageAccess(gate.match, user);
    if (
      !playerManage.canManagePlayers(
        gate.match,
        user.userId,
        !!(access && access.isPrivilegedUser)
      )
    ) {
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '暂无选手管理权限', icon: 'none' });
      }
      return;
    }

    var publishToken =
      series && series.publishToken != null
        ? String(series.publishToken).trim()
        : '';
    this._playerManageFrozen = {
      seriesId: String(gate.seriesId || '').trim(),
      roundId: String(gate.roundId || '').trim(),
      matchId: String(gate.matchId || '').trim(),
      publishToken: publishToken
    };
    var subtitle = this._buildTempAdminRoundSubtitle(
      series,
      gate.round,
      gate.roundId
    );
    var frozenMatchId = this._playerManageFrozen.matchId;
    if (!frozenMatchId) {
      this._playerManageFrozen = null;
      this._toastGateFail({ message: seriesStationManageGate.GATE_FAIL_MESSAGE });
      return;
    }

    this._adminPlayerRemoveLock = false;
    this._adminPlayerRemoveToken = bumpAdminPlayerRemoveToken(
      this._adminPlayerRemoveToken
    );
    var rosterSnapshot = this._buildSeriesPlayerManageRosterSnapshot(series);

    this._playerManageSheetOpening = true;
    var self = this;
    this._openFromManageSheet(
      {
        playerManageSheetVisible: true,
        playerManageSheetMatchId: frozenMatchId,
        playerManageSheetRoundSubtitle: subtitle,
        playerManageRosterSnapshot: rosterSnapshot,
        playerManageRemoving: false
      },
      function () {
        self._playerManageSheetOpening = false;
      }
    );
  },

  _buildSeriesPlayerManageRosterSnapshot: function (series) {
    var latest =
      (this._seriesId ? seriesStore.getSeriesById(this._seriesId) : null) ||
      series ||
      this._lastSeriesForSchedule;
    var operator = gameStore.getCurrentUser() || {};
    var actorUserId = String(operator.userId || operator.playerId || '');
    var orch = this._selfCancelOrchestrator;
    var inspectFn =
      orch && typeof orch.inspectAdminPlayerRemovalImpact === 'function'
        ? function (args) {
            return orch.inspectAdminPlayerRemovalImpact(args);
          }
        : null;
    return buildSeriesPlayerManageRosterSnapshot(
      latest && latest.roster,
      (latest && (latest.seriesId || latest.id)) || this._seriesId || '',
      actorUserId,
      inspectFn
    );
  },

  _refreshPlayerManageRemovalLocks: function () {
    if (!this._pageAlive || !this.data.playerManageSheetVisible) return;
    var series =
      (this._seriesId ? seriesStore.getSeriesById(this._seriesId) : null) ||
      this._lastSeriesForSchedule;
    this._safeSetData({
      playerManageRosterSnapshot: this._buildSeriesPlayerManageRosterSnapshot(series)
    });
  },

  _clearAdminPlayerRemoveSession: function () {
    this._adminPlayerRemoveLock = false;
    this._adminPlayerRemoveToken = bumpAdminPlayerRemoveToken(
      this._adminPlayerRemoveToken
    );
    this._playerManageFrozen = null;
    this._playerManageSheetOpening = false;
  },

  _toastAdminPlayerRemoveFailure: function (reason) {
    if (String(reason || '') === 'finalized_score') {
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: SERIES_ADMIN_REMOVE_FINALIZED, icon: 'none' });
      }
      return;
    }
    this._toastRegisterFailure(reason);
  },

  onSeriesRemovePlayer: function (e) {
    if (!this._pageAlive) return;
    if (this._adminPlayerRemoveLock || this.data.playerManageRemoving) return;
    if (!this._selfCancelOrchestrator) return;
    var detail = (e && e.detail) || {};
    var playerId = String(detail.playerId || '').trim();
    var rosterEntryId = String(detail.rosterEntryId || '').trim();
    if (!playerId || !rosterEntryId) return;

    var series =
      (this._seriesId ? seriesStore.getSeriesById(this._seriesId) : null) ||
      this._lastSeriesForSchedule;
    if (!series) {
      this._toastAdminPlayerRemoveFailure('series_not_found');
      return;
    }
    var operator = gameStore.getCurrentUser() || {};
    var actorUserId = String(operator.userId || operator.playerId || '');
    var actorName = String(operator.name || '').trim() || actorUserId;
    var expectedRevision = Number(series.registrationRevision);
    if (!Number.isFinite(expectedRevision) || expectedRevision < 0) expectedRevision = 0;

    var token = this._adminPlayerRemoveToken;
    this._adminPlayerRemoveLock = true;
    this._safeSetData({ playerManageRemoving: true });
    var result = null;
    try {
      result = this._selfCancelOrchestrator.removePlayerByAdminWithStationCleanup({
        seriesId: this._seriesId || String(series.seriesId || ''),
        playerId: playerId,
        rosterEntryId: rosterEntryId,
        actor: {
          playerId: actorUserId,
          userId: actorUserId,
          name: actorName
        },
        actorUserId: actorUserId,
        expectedRegistrationRevision: expectedRevision
      });
    } catch (eWrite) {
      result = { ok: false, reason: 'storage_failed' };
    } finally {
      this._adminPlayerRemoveLock = false;
      if (
        this._pageAlive &&
        canApplyAdminPlayerRemoveResult(this._adminPlayerRemoveToken, token)
      ) {
        this._safeSetData({ playerManageRemoving: false });
      }
    }

    if (!this._pageAlive) return;
    if (!canApplyAdminPlayerRemoveResult(this._adminPlayerRemoveToken, token)) return;

    if (!result || !result.ok) {
      this._toastAdminPlayerRemoveFailure((result && result.reason) || 'storage_failed');
      this._refreshPlayerManageRemovalLocks();
      return;
    }

    if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
      wx.showToast({ title: '已删除选手', icon: 'success' });
    }
    this._clearAdminPlayerRemoveSession();
    var self = this;
    this._closeManageSecondaryPatch(
      {
        playerManageSheetVisible: false,
        playerManageSheetMatchId: '',
        playerManageSheetRoundSubtitle: '',
        playerManageRosterSnapshot: [],
        playerManageRemoving: false
      },
      function () {
        if (!self._pageAlive) return;
        if (self._canLoadBusinessContent()) {
          self.reloadViewModel({ resetScroll: false });
        }
      }
    );
  },

  onPlayerManageSheetClose: function () {
    if (!this._pageAlive) return;
    this._adminPlayerRemoveLock = false;
    this._adminPlayerRemoveToken = bumpAdminPlayerRemoveToken(
      this._adminPlayerRemoveToken
    );
    this._playerManageFrozen = null;
    this._playerManageSheetOpening = false;
    this._closeManageSecondaryPatch({
      playerManageSheetVisible: false,
      playerManageSheetMatchId: '',
      playerManageSheetRoundSubtitle: '',
      playerManageRosterSnapshot: [],
      playerManageRemoving: false
    });
  },

  onPlayerManageSheetSaved: function () {
    if (!this._pageAlive) return;
    this._adminPlayerRemoveLock = false;
    this._adminPlayerRemoveToken = bumpAdminPlayerRemoveToken(
      this._adminPlayerRemoveToken
    );
    this._playerManageFrozen = null;
    this._playerManageSheetOpening = false;
    // toast 由共享组件标准链路展示，此处不重复
    var self = this;
    this._closeManageSecondaryPatch(
      {
        playerManageSheetVisible: false,
        playerManageSheetMatchId: '',
        playerManageSheetRoundSubtitle: '',
        playerManageRosterSnapshot: [],
        playerManageRemoving: false
      },
      function () {
        if (!self._pageAlive) return;
        // 无损刷新赛程/管理投影：不重置 TAB / 轮次选择 / 纵向滚动
        if (self._canLoadBusinessContent()) {
          self.reloadViewModel({ resetScroll: false });
        }
      }
    );
  },

  _openSeriesTeeSheetManageSheet: function (gateIn) {
    if (!this._pageAlive) return;
    if (
      this.data.teeSheetManageSheetVisible ||
      this._teeSheetManageSheetOpening ||
      this.data.tempAdminSheetVisible ||
      this.data.playerManageSheetVisible
    ) {
      return;
    }

    var series =
      this._lastSeriesForSchedule ||
      (this._seriesId ? seriesStore.getSeriesById(this._seriesId) : null);
    var roundId =
      (gateIn && gateIn.roundId) || this._manageSelectedRoundId || '';
    roundId = roundId != null ? String(roundId).trim() : '';
    var gate = seriesStationManageGate.verifyManagedStationForManage({
      series: series,
      roundId: roundId,
      getMatchById: function (id) {
        return teamMatchStore.getMatchById(id);
      },
      getIndexByMatchId: function (id) {
        return seriesStationIndex.getByMatchId(id);
      }
    });
    if (!gate || !gate.ok) {
      this._toastGateFail(gate);
      return;
    }
    var user = gameStore.getCurrentUser() || {};
    var access = matchManageAccess.resolveMatchManageAccess(gate.match, user);
    if (
      !teeSheetManage.canManageTeeSheet(
        gate.match,
        user.userId,
        !!(access && access.isPrivilegedUser)
      )
    ) {
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '暂无出发管理权限', icon: 'none' });
      }
      return;
    }

    // Series：无分组不打开空白配置表（与队际赛「仍打开空态」产品差异）
    var groups =
      gate.match && Array.isArray(gate.match.groups) ? gate.match.groups : [];
    if (!groups.length) {
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({
          title: '请先完成分组后再设置出发表',
          icon: 'none'
        });
      }
      return;
    }

    var publishToken =
      series && series.publishToken != null
        ? String(series.publishToken).trim()
        : '';
    this._teeSheetManageFrozen = {
      seriesId: String(gate.seriesId || '').trim(),
      roundId: String(gate.roundId || '').trim(),
      matchId: String(gate.matchId || '').trim(),
      publishToken: publishToken
    };
    var subtitle = this._buildTempAdminRoundSubtitle(
      series,
      gate.round,
      gate.roundId
    );
    var frozenMatchId = this._teeSheetManageFrozen.matchId;
    if (!frozenMatchId) {
      this._teeSheetManageFrozen = null;
      this._toastGateFail({ message: seriesStationManageGate.GATE_FAIL_MESSAGE });
      return;
    }

    this._teeSheetManageSheetOpening = true;
    var self = this;
    this._openFromManageSheet(
      {
        teeSheetManageSheetVisible: true,
        teeSheetManageSheetMatchId: frozenMatchId,
        teeSheetManageSheetRoundSubtitle: subtitle
      },
      function () {
        self._teeSheetManageSheetOpening = false;
      }
    );
  },

  onTeeSheetManageSheetClose: function () {
    if (!this._pageAlive) return;
    this._teeSheetManageFrozen = null;
    this._teeSheetManageSheetOpening = false;
    this._closeManageSecondaryPatch({
      teeSheetManageSheetVisible: false,
      teeSheetManageSheetMatchId: '',
      teeSheetManageSheetRoundSubtitle: ''
    });
  },

  onTeeSheetManageSheetSaved: function () {
    if (!this._pageAlive) return;
    this._teeSheetManageFrozen = null;
    this._teeSheetManageSheetOpening = false;
    // toast 由共享组件标准链路展示，此处不重复；不重开 M
    var self = this;
    this._closeManageSecondaryPatch(
      {
        teeSheetManageSheetVisible: false,
        teeSheetManageSheetMatchId: '',
        teeSheetManageSheetRoundSubtitle: ''
      },
      function () {
        if (!self._pageAlive) return;
        if (self._canLoadBusinessContent()) {
          self.reloadViewModel({ resetScroll: false });
        }
      }
    );
  },

  _openSeriesPaymentManageSheet: function (gateIn) {
    if (!this._pageAlive) return;
    if (
      this.data.paymentManageSheetVisible ||
      this._paymentManageSheetOpening ||
      this.data.tempAdminSheetVisible ||
      this.data.playerManageSheetVisible ||
      this.data.teeSheetManageSheetVisible
    ) {
      return;
    }

    var series =
      this._lastSeriesForSchedule ||
      (this._seriesId ? seriesStore.getSeriesById(this._seriesId) : null);
    var roundId =
      (gateIn && gateIn.roundId) || this._manageSelectedRoundId || '';
    roundId = roundId != null ? String(roundId).trim() : '';
    var gate = seriesStationManageGate.verifyManagedStationForManage({
      series: series,
      roundId: roundId,
      getMatchById: function (id) {
        return teamMatchStore.getMatchById(id);
      },
      getIndexByMatchId: function (id) {
        return seriesStationIndex.getByMatchId(id);
      }
    });
    if (!gate || !gate.ok) {
      this._toastGateFail(gate);
      return;
    }
    var user = gameStore.getCurrentUser() || {};
    var access = matchManageAccess.resolveMatchManageAccess(gate.match, user);
    if (
      !paymentManage.canManagePayment(
        gate.match,
        user.userId,
        !!(access && access.isPrivilegedUser)
      )
    ) {
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '暂无收费管理权限', icon: 'none' });
      }
      return;
    }

    var publishToken =
      series && series.publishToken != null
        ? String(series.publishToken).trim()
        : '';
    this._paymentManageFrozen = {
      seriesId: String(gate.seriesId || '').trim(),
      roundId: String(gate.roundId || '').trim(),
      matchId: String(gate.matchId || '').trim(),
      publishToken: publishToken
    };
    var ident = seriesGroupedPaymentManage.verifyManagedIdentity(
      gate.match,
      this._paymentManageFrozen
    );
    if (!ident.ok) {
      this._paymentManageFrozen = null;
      this._toastGateFail({ message: seriesStationManageGate.GATE_FAIL_MESSAGE });
      return;
    }
    var subtitle = this._buildTempAdminRoundSubtitle(
      series,
      gate.round,
      gate.roundId
    );
    var frozenMatchId = this._paymentManageFrozen.matchId;
    if (!frozenMatchId) {
      this._paymentManageFrozen = null;
      this._toastGateFail({ message: seriesStationManageGate.GATE_FAIL_MESSAGE });
      return;
    }

    var rosterSnapshot = Array.isArray(series && series.roster)
      ? series.roster.slice()
      : [];

    this._paymentManageSheetOpening = true;
    var self = this;
    this._openFromManageSheet(
      {
        paymentManageSheetVisible: true,
        paymentManageSheetMatchId: frozenMatchId,
        paymentManageSheetRoundSubtitle: subtitle,
        paymentManageSheetSeriesId: this._paymentManageFrozen.seriesId,
        paymentManageSheetRoundId: this._paymentManageFrozen.roundId,
        paymentManageRosterSnapshot: rosterSnapshot
      },
      function () {
        self._paymentManageSheetOpening = false;
      }
    );
  },

  onPaymentManageSheetClose: function () {
    if (!this._pageAlive) return;
    this._paymentManageFrozen = null;
    this._paymentManageSheetOpening = false;
    this._closeManageSecondaryPatch({
      paymentManageSheetVisible: false,
      paymentManageSheetMatchId: '',
      paymentManageSheetRoundSubtitle: '',
      paymentManageSheetSeriesId: '',
      paymentManageSheetRoundId: '',
      paymentManageRosterSnapshot: []
    });
  },

  onPaymentManageSheetChanged: function () {
    if (!this._pageAlive) return;
    // 即时保存：不关 sheet、不重复 toast；无损刷新投影
    if (this._canLoadBusinessContent()) {
      this.reloadViewModel({ resetScroll: false });
    }
  },

  onSeriesManageFeatureTap: function (e) {
    if (!this._pageAlive) return;
    // 本轮管理仅 Series 管理员
    if (!this._isSeriesManageActor()) {
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '暂无管理权限', icon: 'none' });
      }
      return;
    }
    var ds =
      e && e.currentTarget && e.currentTarget.dataset
        ? e.currentTarget.dataset
        : {};
    var placeholderAttr = ds.placeholder;
    if (
      placeholderAttr === true ||
      placeholderAttr === 'true' ||
      placeholderAttr === 1 ||
      placeholderAttr === '1'
    ) {
      return;
    }
    var permission = ds.permission != null ? String(ds.permission).trim() : '';
    if (!permission || permission.indexOf('__pad_') === 0) return;
    // Series 级能力不得绑回本轮菜单事件
    if (
      teamMatchMoreMenu.SERIES_SCOPE_PERMISSIONS[permission] ||
      teamMatchMoreMenu.SERIES_MANAGED_HIDDEN_PERMISSIONS[permission] ||
      seriesManageSheetViewModel.SERIES_SCOPE_PERMISSIONS[permission]
    ) {
      return;
    }
    var disabledAttr =
      e && e.currentTarget && e.currentTarget.dataset
        ? e.currentTarget.dataset.disabled
        : false;
    var disabledFromUi =
      disabledAttr === true ||
      disabledAttr === 'true' ||
      disabledAttr === 1 ||
      disabledAttr === '1';
    var gate = this._verifyCurrentManageStation();
    if (!gate.ok) {
      this._toastGateFail(gate);
      return;
    }
    var match = gate.match;
    var matchId = gate.matchId;
    var user = gameStore.getCurrentUser() || {};
    if (
      disabledFromUi ||
      teamMatchMoreMenu.getMoreFeatureDisabledState(
        match,
        { permission: permission },
        seriesFinishLock.isSeriesCompleted(
          this._lastSeriesForSchedule ||
            (this._seriesId ? seriesStore.getSeriesById(this._seriesId) : null)
        )
      )
    ) {
      return;
    }
    if (
      !matchManageAccess.isCommonViewPermission(permission) &&
      !matchManageAccess.hasMatchManagePermission(match, user, permission)
    ) {
      if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '暂无该管理权限', icon: 'none' });
      }
      return;
    }

    if (permission === 'manage_tee_sheet') {
      this._openSeriesTeeSheetManageSheet(gate);
      return;
    }
    if (permission === 'edit_groups') {
      this.closeMoreSheetFully();
      var seriesForGroups =
        this._lastSeriesForSchedule ||
        (this._seriesId ? seriesStore.getSeriesById(this._seriesId) : null);
      this._openSeriesGroupEditorForRound(seriesForGroups, gate.roundId, gate.matchId);
      return;
    }
    if (permission === 'leaderboard' || permission === 'stats') {
      // 已迁至本轮普通功能区；管理区不应再出现，兜底走查看入口
      if (permission === 'leaderboard') {
        this._openSeriesRoundLeaderboardSettingSheet(gate);
      } else {
        this._openSeriesRoundStatsPage(gate);
      }
      return;
    }
    if (permission === 'edit_half') {
      this._openSeriesHalfCourseSheet(gate);
      return;
    }
    if (permission === 'permission_management') {
      this._openSeriesTempAdminPermissionSheet(gate);
      return;
    }
    if (permission === 'manage_players') {
      this._openSeriesPlayerManageSheet(gate);
      return;
    }
    if (permission === 'manage_payment') {
      this._openSeriesPaymentManageSheet(gate);
      return;
    }
    if (permission === 'edit_match') {
      this.closeMoreSheetFully();
      var seriesIdForEdit = String(this._seriesId || '').trim();
      var roundIdForEdit = String(
        (gate && gate.roundId) || this._manageSelectedRoundId || ''
      ).trim();
      if (!seriesIdForEdit || !roundIdForEdit) {
        wx.showToast({ title: '本轮比赛数据异常', icon: 'none' });
        return;
      }
      // 保留详情页上下文：TAB / 管理选轮 / 滚动
      try {
        if (typeof wx !== 'undefined' && typeof wx.setStorageSync === 'function') {
          wx.setStorageSync('gb_series_edit_round_return_v1', {
            seriesId: seriesIdForEdit,
            roundId: roundIdForEdit,
            activeTab: this._activeTab || this.data.activeTab || '',
            manageSelectedRoundId: this._manageSelectedRoundId || '',
            scheduleSelectedKey: this._scheduleSelectedKey || '',
            standingsSelectedKey: this._standingsSelectedKey || '',
            scrollTop: Number(this._scrollTop || this.data.scrollTop || 0) || 0
          });
        }
      } catch (eRet) {
        /* ignore */
      }
      wx.navigateTo({
        url:
          '/subpackages/create/pages/series/index?mode=edit_round&seriesId=' +
          encodeURIComponent(seriesIdForEdit) +
          '&roundId=' +
          encodeURIComponent(roundIdForEdit),
        fail: function () {
          wx.showToast({ title: '页面尚未注册', icon: 'none' });
        }
      });
      return;
    }
    if (permission === 'feedback') {
      this.closeMoreSheetFully();
      wx.navigateTo({
        url:
          '/pages/feedback/index?source=tournament&matchId=' +
          encodeURIComponent(matchId),
        fail: function () {
          wx.showToast({ title: '反馈页面尚未注册', icon: 'none' });
        }
      });
      return;
    }
    if (permission === 'net_score') {
      this.closeMoreSheetFully();
      if (match && match.peoriaResult && match.peoriaResult.status === 'generated') {
        wx.showToast({
          title: '净杆已生成，请点击“领先榜”按钮查看。',
          icon: 'none',
          duration: 2500
        });
        return;
      }
      wx.navigateTo({
        url:
          '/subpackages/tournament-tools/pages/peoria/index?matchId=' +
          encodeURIComponent(matchId),
        fail: function () {
          wx.showToast({ title: '净杆配置页尚未注册', icon: 'none' });
        }
      });
      return;
    }
    if (permission === 'theme') {
      this.closeMoreSheetFully();
      wx.showToast({ title: '请在「我的」中调整显示设置', icon: 'none' });
      return;
    }
    if (permission === 'start_match') {
      this.closeMoreSheetFully();
      var self = this;
      var series = this._lastSeriesForSchedule;
      var runStart = function () {
        var result = seriesScheduleGroupWrite.startStationRound({
          matchId: matchId,
          series: series,
          roundId: gate.roundId
        });
        if (!result || !result.ok) {
          wx.showToast({
            title: (result && result.message) || '开赛失败',
            icon: 'none'
          });
          return;
        }
        self._onSeriesStationRoundStartSuccess(result, gate.roundId);
      };
      if (typeof wx.showModal === 'function') {
        wx.showModal({
          title: '开始本轮比赛',
          content: '确认开始本轮？开始后将进入出发表。',
          success: function (res) {
            if (res && res.confirm) runStart();
          }
        });
      } else {
        runStart();
      }
      return;
    }
    if (permission === 'finish_match') {
      var selfFinish = this;
      if (selfFinish._stationFinishBusy) return;
      var gPrompt = selfFinish._verifyCurrentManageStation();
      if (!gPrompt.ok) {
        selfFinish._toastGateFail(gPrompt);
        return;
      }
      if (teamMatchFinish.isMatchCompleted(gPrompt.match)) {
        wx.showToast({ title: teamMatchFinish.MATCH_FINISHED_TOAST, icon: 'none' });
        return;
      }
      var seriesForLabel =
        selfFinish._lastSeriesForSchedule ||
        (selfFinish._seriesId ? seriesStore.getSeriesById(selfFinish._seriesId) : null);
      var finishModal = seriesFinalize.getStationFinishModalContent(
        seriesForLabel,
        gPrompt.roundId
      );
      selfFinish._stationFinishBusy = true;
      selfFinish._refreshSeriesManageSheet();
      var releaseStation = function () {
        selfFinish._stationFinishBusy = false;
        if (selfFinish._pageAlive) selfFinish._refreshSeriesManageSheet();
      };
      if (typeof wx.showModal !== 'function') {
        releaseStation();
        return;
      }
      wx.showModal({
        title: finishModal.title,
        content: finishModal.content,
        cancelText: finishModal.cancelText || '取消',
        confirmText: finishModal.confirmText || '确定结束',
        success: function (res) {
          if (!res || !res.confirm) {
            releaseStation();
            return;
          }
          var g2 = selfFinish._verifyCurrentManageStation();
          if (!g2.ok) {
            releaseStation();
            selfFinish._toastGateFail(g2);
            return;
          }
          if (teamMatchFinish.isMatchCompleted(g2.match)) {
            releaseStation();
            wx.showToast({ title: teamMatchFinish.MATCH_FINISHED_TOAST, icon: 'none' });
            return;
          }
          if (
            !matchManageAccess.hasMatchManagePermission(
              g2.match,
              gameStore.getCurrentUser(),
              'finish_match'
            )
          ) {
            releaseStation();
            wx.showToast({ title: '暂无该管理权限', icon: 'none' });
            return;
          }
          var m = teamMatchStore.getMatchById(g2.matchId);
          if (!m) {
            releaseStation();
            wx.showToast({ title: '未找到比赛信息', icon: 'none' });
            return;
          }
          var confirmed = teamMatchFinish.confirmFinishWholeTeamMatch(m);
          if (!confirmed.ok) {
            releaseStation();
            wx.showToast({
              title: confirmed.message || teamMatchFinish.MATCH_FINISHED_TOAST,
              icon: 'none'
            });
            return;
          }
          var saved = teamMatchFinish.saveMatchIfWritable(m);
          if (!saved.ok) {
            releaseStation();
            wx.showToast({
              title: saved.message || '操作失败',
              icon: 'none'
            });
            return;
          }
          seriesFinalize.maybeFinalizeAfterStationPersisted(m, {
            actor: gameStore.getCurrentUser() || {}
          });
          selfFinish._stationFinishBusy = false;
          selfFinish._rebuildScheduleProjection();
          selfFinish._refreshSeriesManageFab();
          selfFinish._refreshSeriesManageSheet();
          wx.showToast({ title: '比赛已结束', icon: 'success' });
        },
        fail: function () {
          releaseStation();
        }
      });
      return;
    }
    wx.showToast({ title: '功能开发中', icon: 'none' });
  }
});

module.exports = {
  hasActiveSelfRegistration: hasActiveSelfRegistration,
  bumpSelfCancelInspectToken: bumpSelfCancelInspectToken,
  canApplySelfCancelInspect: canApplySelfCancelInspect,
  resolveSelfCancelLockCta: resolveSelfCancelLockCta,
  SELF_CANCEL_CTA_FINALIZED: SELF_CANCEL_CTA_FINALIZED,
  isActiveProxyRegistrationByActor: isActiveProxyRegistrationByActor,
  projectProxyCancelLockUser: projectProxyCancelLockUser,
  projectProxyRegisterUsersWithCancelLocks: projectProxyRegisterUsersWithCancelLocks,
  projectSeriesAdminRemovalInspect: projectSeriesAdminRemovalInspect,
  buildSeriesPlayerManageRosterSnapshot: buildSeriesPlayerManageRosterSnapshot,
  bumpAdminPlayerRemoveToken: bumpAdminPlayerRemoveToken,
  canApplyAdminPlayerRemoveResult: canApplyAdminPlayerRemoveResult,
  SERIES_ADMIN_REMOVE_FINALIZED: SERIES_ADMIN_REMOVE_FINALIZED,
  computeStickyFiller: computeStickyFiller,
  computeFillerCorrection: computeFillerCorrection,
  computeScrollHeightWithoutFiller: computeScrollHeightWithoutFiller,
  computeProvisionalTabFiller: computeProvisionalTabFiller,
  createEmptyFillerByTab: createEmptyFillerByTab,
  computeSeriesScrollFillerHeight: computeSeriesScrollFillerHeight,
  computeStickyTopInsideScroll: computeStickyTopInsideScroll,
  computeSecondaryStickyThreshold: computeSecondaryStickyThreshold,
  resolveFillerTargetStickyOffset: resolveFillerTargetStickyOffset,
  calcIsStickyRoundSelector: calcIsStickyRoundSelector,
  calcIsStickyRegisterExt: calcIsStickyRegisterExt,
  SCROLL_FILLER_TOLERANCE_PX: SCROLL_FILLER_TOLERANCE_PX,
  computeStickyContentHostHoldMinHeight: computeStickyContentHostHoldMinHeight
};
