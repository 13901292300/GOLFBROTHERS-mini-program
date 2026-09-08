/**
 * 8421 个人分值/扣分：规则默认 + 字段组显式覆盖。
 * 历史 players[].deduct* 视为创建时复制的默认，不算 override。
 */

function unwrapRule(rule) {
  let snap = rule && typeof rule === "object" ? rule : {};
  let hops = 0;
  while (hops < 4 && snap && typeof snap === "object" && snap.ruleSnapshot && typeof snap.ruleSnapshot === "object") {
    const nested = snap.ruleSnapshot;
    const outer = Object.assign({}, snap);
    delete outer.ruleSnapshot;
    snap = Object.assign({}, outer, nested);
    hops += 1;
  }
  return snap || {};
}

const SCORE_OVERRIDE_GROUPS = {
  deductMode: ["deductMode"],
  deductWay: ["deductWay", "deductPlusN", "deductDoubleN"],
  deductCap: ["deductCap", "deductCapN"]
};

function hasOwn(obj, key) {
  return !!(obj && Object.prototype.hasOwnProperty.call(obj, key));
}

function scoreOverridesOf(player) {
  const o = player && player.scoreOverrides;
  return o && typeof o === "object" && !Array.isArray(o) ? o : {};
}

function groupHasOverride(overrides, groupKey) {
  const keys = SCORE_OVERRIDE_GROUPS[groupKey] || [];
  for (let i = 0; i < keys.length; i += 1) {
    if (hasOwn(overrides, keys[i])) return true;
  }
  return false;
}

function ruleScoreDefaults(rule) {
  const s = unwrapRule(rule);
  return {
    deductMode: s.deductMode === "none" ? "none" : "on",
    deductWay: s.deductWay === "doublepar-n" ? "doublepar-n" : "plus-n",
    deductPlusN: s.deductPlusN != null && s.deductPlusN !== "" ? String(s.deductPlusN) : "4",
    deductDoubleN: s.deductDoubleN != null && s.deductDoubleN !== "" ? String(s.deductDoubleN) : "0",
    deductCap: s.deductCap === "cap" ? "cap" : "none",
    deductCapN: s.deductCapN != null && s.deductCapN !== "" ? String(s.deductCapN) : "3"
  };
}

function resolve8421PlayerScoreConfig(rule, player) {
  const base = ruleScoreDefaults(rule);
  const o = scoreOverridesOf(player);
  const out = Object.assign({}, base);
  Object.keys(SCORE_OVERRIDE_GROUPS).forEach(function (g) {
    if (!groupHasOverride(o, g)) return;
    SCORE_OVERRIDE_GROUPS[g].forEach(function (k) {
      if (hasOwn(o, k) && o[k] != null && o[k] !== "") {
        out[k] = o[k];
      }
    });
  });
  return {
    deductMode: out.deductMode === "none" ? "none" : "on",
    deductWay: out.deductWay === "doublepar-n" ? "doublepar-n" : "plus-n",
    deductPlusN: String(out.deductPlusN),
    deductDoubleN: String(out.deductDoubleN),
    deductCap: out.deductCap === "cap" ? "cap" : "none",
    deductCapN: String(out.deductCapN)
  };
}

function toDeductCfg(resolved) {
  const plus = Number(resolved && resolved.deductPlusN);
  const dbl = Number(resolved && resolved.deductDoubleN);
  const capN = Number(resolved && resolved.deductCapN);
  return {
    deductMode: resolved && resolved.deductMode === "none" ? "none" : "on",
    deductWay: resolved && resolved.deductWay === "doublepar-n" ? "doublepar-n" : "plus-n",
    deductPlusN: isFinite(plus) ? plus : 4,
    deductDoubleN: isFinite(dbl) ? dbl : 0,
    deductCap: resolved && resolved.deductCap === "cap" ? "cap" : "none",
    deductCapN: isFinite(capN) ? capN : 3
  };
}

function deductFormFromUi(data) {
  const d = data || {};
  return {
    deductMode: d.deductMode === "none" ? "none" : "on",
    deductWay: d.deductWay === "doublepar-n" ? "doublepar-n" : "plus-n",
    deductPlusN: d.deductPlusN != null && d.deductPlusN !== "" ? String(d.deductPlusN) : "4",
    deductDoubleN: d.deductDoubleN != null && d.deductDoubleN !== "" ? String(d.deductDoubleN) : "0",
    deductCap: d.deductCap === "cap" ? "cap" : "none",
    deductCapN: d.deductCapN != null && d.deductCapN !== "" ? String(d.deductCapN) : "3"
  };
}

function formEqualsGroup(a, b, groupKey) {
  const keys = SCORE_OVERRIDE_GROUPS[groupKey] || [];
  return keys.every(function (k) {
    return String(a && a[k] != null ? a[k] : "") === String(b && b[k] != null ? b[k] : "");
  });
}

function stripRootDeduct(player) {
  if (!player) return player;
  delete player.deductMode;
  delete player.deductWay;
  delete player.deductPlusN;
  delete player.deductDoubleN;
  delete player.deductCap;
  delete player.deductCapN;
  return player;
}

function applyScoreOverridesFromForm(player, nextForm, startForm) {
  if (!player) return player;
  const o = Object.assign({}, scoreOverridesOf(player));
  Object.keys(SCORE_OVERRIDE_GROUPS).forEach(function (g) {
    if (formEqualsGroup(nextForm, startForm, g)) return;
    SCORE_OVERRIDE_GROUPS[g].forEach(function (k) {
      o[k] = nextForm[k];
    });
  });
  if (Object.keys(o).length) player.scoreOverrides = o;
  stripRootDeduct(player);
  return player;
}

module.exports = {
  SCORE_OVERRIDE_GROUPS,
  unwrapRule,
  ruleScoreDefaults,
  resolve8421PlayerScoreConfig,
  toDeductCfg,
  deductFormFromUi,
  applyScoreOverridesFromForm,
  stripRootDeduct,
  scoreOverridesOf
};
