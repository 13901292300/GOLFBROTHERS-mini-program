/**
 * Series 底部固定控件可见性（纯函数）
 * C3-D：显隐几何完全镜像 detail._calcHideRegisterCTA，禁止以 isStickyTab 单独门闩。
 *
 * 权威公式（detail/index.js）：
 *   tabBottom = isStickyTab
 *     ? headerH + tabBarH
 *     : headerH + tabOffsetTop - scrollTop + tabBarH
 *   hide = tabOffsetTop > 0 && (screenH - tabBottom) <= 100
 *
 * 不写 storage；不改 CTA 权限/文案/业务写入（仅滚动几何门闩）。
 * Discussion 输入栏：生命周期资格 × 本公式 × 非 overlay；禁止 scrollTop>=100。
 */

/**
 * 兼容导出：普通 detail 讨论仍用页面 `scrollYState >= 100`。
 * Series 讨论固定输入栏不走该滚动阈值。
 */
var DISCUSSION_INPUT_SCROLL_THRESHOLD = 100;

/** 与 detail._calcHideRegisterCTA 容差同值（px） */
var CTA_HIDE_GAP_PX = 100;

/**
 * 源码对照签名：与 detail._calcHideRegisterCTA 主体同构（自测用）
 * 变更公式时必须同步 detail 与本模块。
 */
var DETAIL_HIDE_CTA_FORMULA_SIGNATURE =
  'tabBottom=isSticky?(headerH+tabBarH):(headerH+tabOffsetTop-scrollTop+tabBarH);hide=(screenH-tabBottom)<=100';

function asNum(v, fallback) {
  var n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 镜像 detail._calcHideRegisterCTA
 * @returns {boolean} true = 应隐藏底部 CTA
 */
function calcHideBottomCta(input) {
  var src = input && typeof input === 'object' ? input : {};
  var tabOffsetTop = asNum(src.tabOffsetTop, 0);
  if (!(tabOffsetTop > 0)) return false;

  var screenH = asNum(src.screenHeight, 667);
  if (!(screenH > 0)) screenH = 667;
  var tabBarH = asNum(src.tabBarHeight, 50);
  if (!(tabBarH > 0)) tabBarH = 50;
  var headerH = asNum(src.headerTotalHeight, 92);
  if (!(headerH > 0)) headerH = 92;
  var scrollTop = asNum(src.scrollTop, 0);
  if (scrollTop < 0) scrollTop = 0;
  var isStickyTab = !!src.isStickyTab;

  var tabBottom;
  if (isStickyTab) {
    tabBottom = headerH + tabBarH;
  } else {
    tabBottom = headerH + tabOffsetTop - scrollTop + tabBarH;
  }
  return screenH - tabBottom <= CTA_HIDE_GAP_PX;
}

function calcShowDiscussionInput(scrollTop) {
  void scrollTop;
  return true;
}

/**
 * @param {object} input
 * @param {string} input.activeTab
 * @param {number} input.scrollTop
 * @param {boolean} input.isStickyTab  仅用于推导 tabBottom（与 detail 相同），不可单独决定显隐
 * @param {number} input.tabOffsetTop
 * @param {number} input.tabBarHeight
 * @param {number} input.headerTotalHeight
 * @param {number} input.screenHeight
 * @param {object} [input.register]
 * @param {object} [input.schedule]
 * @param {object} [input.discussion]
 * @param {boolean} [input.discussion.showInputBar] 生命周期资格（非几何）
 * @param {boolean} [input.isManageOverlayActive] C3-Z：M 一级/二级打开时强制隐藏 TAB 底栏
 * @returns {{
 *   hideBottomCta: boolean,
 *   showRegisterBottomAction: boolean,
 *   showScheduleBottomAction: boolean,
 *   showDiscussionInput: boolean
 * }}
 */
function resolveSeriesBottomDockVisibility(input) {
  var src = input && typeof input === 'object' ? input : {};
  var activeTab = src.activeTab != null ? String(src.activeTab).trim() : '';
  var hideBottomCta = calcHideBottomCta(src);
  var manageOverlay = !!src.isManageOverlayActive;

  var register = src.register && typeof src.register === 'object' ? src.register : {};
  var schedule = src.schedule && typeof src.schedule === 'object' ? src.schedule : {};
  var discussion =
    src.discussion && typeof src.discussion === 'object' ? src.discussion : {};
  var registerCta = register.cta && typeof register.cta === 'object' ? register.cta : null;
  var hasRegisterCta = !!(registerCta && registerCta.label);
  var scheduleShowEdit = !!(schedule.cta && schedule.cta.showEditGroups);
  var discussionShowInputBar = discussion.showInputBar === true;

  // 最终可见 = TAB + 业务可展示 + 几何门闩 + 非 M 弹层（C3-Z）
  var showRegisterBottomAction =
    !manageOverlay &&
    activeTab === 'register' &&
    hasRegisterCta &&
    !hideBottomCta;
  var showScheduleBottomAction =
    !manageOverlay &&
    activeTab === 'schedule' &&
    scheduleShowEdit &&
    !hideBottomCta;
  var showDiscussionInput =
    !manageOverlay &&
    activeTab === 'discussion' &&
    discussionShowInputBar &&
    !hideBottomCta;

  return {
    hideBottomCta: hideBottomCta,
    showRegisterBottomAction: showRegisterBottomAction,
    showScheduleBottomAction: showScheduleBottomAction,
    showDiscussionInput: showDiscussionInput
  };
}

module.exports = {
  DISCUSSION_INPUT_SCROLL_THRESHOLD: DISCUSSION_INPUT_SCROLL_THRESHOLD,
  CTA_HIDE_GAP_PX: CTA_HIDE_GAP_PX,
  DETAIL_HIDE_CTA_FORMULA_SIGNATURE: DETAIL_HIDE_CTA_FORMULA_SIGNATURE,
  calcHideBottomCta: calcHideBottomCta,
  calcShowDiscussionInput: calcShowDiscussionInput,
  resolveSeriesBottomDockVisibility: resolveSeriesBottomDockVisibility
};
