/**
 * Series 页面业务弹层层级（C3-Z）
 * 仅约束 Series detail；不改 tournament-common 一级 TAB(130) 与普通 detail 共享组件默认值。
 *
 * 相对顺序（数值可调，顺序锁定）：
 *   TAB fixed CTA 140 < M FAB 150 < M L1 overlay/sheet 300/301 < M L2 host/overlay/sheet 320/321
 */

var Z_TAB_FIXED_CTA = 140;
var Z_M_FAB = 150;
var Z_M_L1_OVERLAY = 300;
var Z_M_L1_SHEET = 301;
var Z_M_L2_HOST = 320;
var Z_M_L2_OVERLAY = 320;
var Z_M_L2_SHEET = 321;

/** 参与 isManageOverlayActive 的页面态字段（M 一级 + M 派生二级） */
var MANAGE_OVERLAY_FLAG_KEYS = [
  'showMoreSheet',
  'registerForOtherSheetVisible',
  'registerForOtherManualVisible',
  'proxyMemberSourceSheetVisible',
  'proxyGroupSheetVisible',
  'tempAdminSheetVisible',
  'playerManageSheetVisible',
  'teeSheetManageSheetVisible',
  'paymentManageSheetVisible',
  'halfSheetVisible',
  'showLeaderboardSettingSheet'
];

function resolveIsManageOverlayActive(flags) {
  var src = flags && typeof flags === 'object' ? flags : {};
  for (var i = 0; i < MANAGE_OVERLAY_FLAG_KEYS.length; i++) {
    var k = MANAGE_OVERLAY_FLAG_KEYS[i];
    if (src[k]) return true;
  }
  return false;
}

/**
 * 从当前 data + patch 合并后计算 overlay 活跃态
 * @param {object} data
 * @param {object} [patch]
 */
function resolveIsManageOverlayActiveFromData(data, patch) {
  var d = data && typeof data === 'object' ? data : {};
  var p = patch && typeof patch === 'object' ? patch : {};
  var merged = {};
  for (var i = 0; i < MANAGE_OVERLAY_FLAG_KEYS.length; i++) {
    var k = MANAGE_OVERLAY_FLAG_KEYS[i];
    merged[k] = Object.prototype.hasOwnProperty.call(p, k) ? !!p[k] : !!d[k];
  }
  return resolveIsManageOverlayActive(merged);
}

module.exports = {
  Z_TAB_FIXED_CTA: Z_TAB_FIXED_CTA,
  Z_M_FAB: Z_M_FAB,
  Z_M_L1_OVERLAY: Z_M_L1_OVERLAY,
  Z_M_L1_SHEET: Z_M_L1_SHEET,
  Z_M_L2_HOST: Z_M_L2_HOST,
  Z_M_L2_OVERLAY: Z_M_L2_OVERLAY,
  Z_M_L2_SHEET: Z_M_L2_SHEET,
  MANAGE_OVERLAY_FLAG_KEYS: MANAGE_OVERLAY_FLAG_KEYS,
  resolveIsManageOverlayActive: resolveIsManageOverlayActive,
  resolveIsManageOverlayActiveFromData: resolveIsManageOverlayActiveFromData
};
