/**
 * 三人 8421：顶洞是否更换组合。
 * 不使用 resolveNextHoleOrder.pushPolicyFromReorderOnPush（缺字段会被当成 rerank）。
 *
 * within-1 / within-2：仅显式 "yes" 才 rerank；"no" / 缺失 / 其它值 = 不换组合。
 * tie / none / 其它：一律 rerank，忽略 reorderOnPush。
 */
function asString(v) {
  return v == null ? "" : String(v);
}

function is8421ThreeId(id) {
  return asString(id) === "8421-3";
}

function isWithinPushRule(pushRule) {
  var p = asString(pushRule);
  return p === "within-1" || p === "within-2";
}

function showReorderOnPushUi(catalogId, pushRule) {
  return is8421ThreeId(catalogId) && isWithinPushRule(pushRule);
}

function nextHolePushPolicy(rule) {
  var p = asString(rule && rule.pushRule) || "tie";
  if (!isWithinPushRule(p)) return "rerank";
  return asString(rule && rule.reorderOnPush) === "yes" ? "rerank" : "keep-combination";
}

function persistReorderOnPush(rule, catalogId, pushRule, reorderOnPush) {
  if (!rule) return rule;
  if (!is8421ThreeId(catalogId) && !is8421ThreeId(rule.catalogId)) return rule;
  if (isWithinPushRule(pushRule)) {
    rule.reorderOnPush = asString(reorderOnPush) === "yes" ? "yes" : "no";
  } else {
    delete rule.reorderOnPush;
  }
  return rule;
}

module.exports = {
  is8421ThreeId: is8421ThreeId,
  isWithinPushRule: isWithinPushRule,
  showReorderOnPushUi: showReorderOnPushUi,
  nextHolePushPolicy: nextHolePushPolicy,
  persistReorderOnPush: persistReorderOnPush
};
