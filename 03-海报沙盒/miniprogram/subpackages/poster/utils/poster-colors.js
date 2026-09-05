/**
 * 海报配色：模板联动 vs 自定义逐元素，两条路径。
 * customColors + colorMode + colorSchemaVersion 是持久化事实源。
 * resolvedColors 仅运行态派生，预览/导出前重算。
 */

const COLOR_SCHEMA_VERSION = 2;

const COLOR_ELEMENT_KEYS = [
  "card",
  "line",
  "scoreText",
  "eagleMarker",
  "underMarker",
  "overMarker",
  "doubleBogeyMarker",
  "total",
  "relativeTotal",
  "nickname",
  "course",
  "date",
  "extra",
  "summaryLabel",
  "summaryNumber",
  "extremeScore",
  "divider"
];

const DEFAULT_CUSTOM_COLORS = {
  card: "#101820",
  line: "#CE9224",
  scoreText: "#ffffff",
  eagleMarker: "#dc3f4d",
  underMarker: "#dc3f4d",
  overMarker: "#6B7280",
  doubleBogeyMarker: "#6B7280",
  total: "#CE9224",
  relativeTotal: "#dc3f4d",
  nickname: "#ffffff",
  course: "#ffffff",
  date: "#ffffff",
  extra: "#ffffff",
  summaryLabel: "#ffffff",
  summaryNumber: "#ffffff",
  extremeScore: "#CE9224",
  divider: "#CE9224"
};

function cloneColors(src) {
  const out = {};
  const from = src && typeof src === "object" ? src : {};
  COLOR_ELEMENT_KEYS.forEach((key) => {
    if (from[key]) out[key] = String(from[key]);
  });
  return out;
}

function pickColor() {
  for (let i = 0; i < arguments.length; i++) {
    const s = arguments[i] == null ? "" : String(arguments[i]).trim();
    if (s) return s;
  }
  return "";
}

function isDevEnv() {
  try {
    if (typeof wx !== "undefined" && typeof wx.getAccountInfoSync === "function") {
      const env = wx.getAccountInfoSync().miniProgram.envVersion;
      return env === "develop" || env === "trial";
    }
  } catch (e) {
    /* ignore */
  }
  if (typeof process !== "undefined" && process.env && process.env.NODE_ENV === "production") {
    return false;
  }
  return true;
}

function warnMissingColorKeys(where, missing, extra) {
  if (!missing || !missing.length || !isDevEnv()) return;
  console.warn("[poster-colors] " + where + " missing keys", missing, extra || {});
}

function fillColorDefaults(colors) {
  const next = cloneColors(colors);
  COLOR_ELEMENT_KEYS.forEach((key) => {
    if (!next[key]) next[key] = DEFAULT_CUSTOM_COLORS[key];
  });
  return next;
}

function colorSchemaVersionOf(model) {
  const n = Number(model && model.colorSchemaVersion);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function isCustomColorMode(model) {
  if (!model) return false;
  if (model.colorMode === "custom") return true;
  if (model.colorMode === "template") return false;
  return model.paletteId === "custom";
}

function expandUiColorKey(uiKey) {
  if (uiKey === "relativeTotalColor") return ["relativeTotal"];
  return [uiKey];
}

function snapshotLiveColors(model) {
  const style = (model && model.style) || {};
  const identity = (model && model.identity) || {};
  const total = pickColor(model && model.total && model.total.color, style.total, DEFAULT_CUSTOM_COLORS.total);
  const relativeTotal = pickColor(
    model && model.relativeTotal && model.relativeTotal.color,
    style.relativeTotalColor,
    DEFAULT_CUSTOM_COLORS.relativeTotal
  );
  const line = pickColor(style.line, DEFAULT_CUSTOM_COLORS.line);
  const scoreText = pickColor(style.scoreText, DEFAULT_CUSTOM_COLORS.scoreText);
  const templateId = model && model.templateId;
  let summaryLabel = pickColor(style.summaryLabelColor);
  if (!summaryLabel) {
    summaryLabel = templateId === "template4"
      ? pickColor(line, total)
      : pickColor(relativeTotal, line, total);
  }
  let summaryNumber = pickColor(style.summaryNumberColor);
  if (!summaryNumber) {
    summaryNumber = (templateId === "template1" || templateId === "template4")
      ? summaryLabel
      : scoreText;
  }
  return fillColorDefaults({
    card: pickColor(style.card, DEFAULT_CUSTOM_COLORS.card),
    line: line,
    scoreText: scoreText,
    eagleMarker: pickColor(style.eagleMarker, DEFAULT_CUSTOM_COLORS.eagleMarker),
    underMarker: pickColor(style.underMarker, DEFAULT_CUSTOM_COLORS.underMarker),
    overMarker: pickColor(style.overMarker, DEFAULT_CUSTOM_COLORS.overMarker),
    doubleBogeyMarker: pickColor(style.doubleBogeyMarker, DEFAULT_CUSTOM_COLORS.doubleBogeyMarker),
    total: total,
    relativeTotal: relativeTotal,
    nickname: pickColor(identity.nickname && identity.nickname.color, style.text, DEFAULT_CUSTOM_COLORS.nickname),
    course: pickColor(identity.course && identity.course.color, style.text, DEFAULT_CUSTOM_COLORS.course),
    date: pickColor(identity.date && identity.date.color, style.text, DEFAULT_CUSTOM_COLORS.date),
    extra: pickColor(identity.extra && identity.extra.color, style.text, DEFAULT_CUSTOM_COLORS.extra),
    summaryLabel: pickColor(summaryLabel, DEFAULT_CUSTOM_COLORS.summaryLabel),
    summaryNumber: pickColor(summaryNumber, DEFAULT_CUSTOM_COLORS.summaryNumber),
    extremeScore: pickColor(style.extremeScoreColor, total, DEFAULT_CUSTOM_COLORS.extremeScore),
    divider: pickColor(style.dividerColor, line, DEFAULT_CUSTOM_COLORS.divider)
  });
}

function mergeCustomColors(existing, snapshot) {
  const next = cloneColors(snapshot);
  const prev = existing && typeof existing === "object" ? existing : {};
  COLOR_ELEMENT_KEYS.forEach((key) => {
    if (prev[key]) next[key] = String(prev[key]);
  });
  return fillColorDefaults(next);
}

function hasStoredCustomColors(customColors) {
  const src = customColors && typeof customColors === "object" ? customColors : {};
  return COLOR_ELEMENT_KEYS.some((key) => !!src[key]);
}

function markColorSchemaCurrent(model) {
  model.colorSchemaVersion = COLOR_SCHEMA_VERSION;
  model.customColorStateReady = true;
  return model;
}

function migratePosterColorSchema(model) {
  if (!model) return model;
  if (!model.customColors || typeof model.customColors !== "object") model.customColors = {};
  const fromVersion = colorSchemaVersionOf(model);
  if (fromVersion >= COLOR_SCHEMA_VERSION) {
    model.customColorStateReady = true;
    return model;
  }
  if (hasStoredCustomColors(model.customColors) || isCustomColorMode(model)) {
    const previous = cloneColors(model.customColors);
    model.customColors = hasStoredCustomColors(previous)
      ? mergeCustomColors(previous, snapshotLiveColors(model))
      : snapshotLiveColors(model);
  }
  return markColorSchemaCurrent(model);
}

function discardDerivedPosterColors(model) {
  if (!model) return model;
  model.resolvedColors = null;
  return model;
}

function ensurePosterColorState(model) {
  if (!model) return model;
  if (!model.customColors || typeof model.customColors !== "object") model.customColors = {};
  if (model.colorMode !== "custom" && model.colorMode !== "template") {
    model.colorMode = model.paletteId === "custom" ? "custom" : "template";
  }
  if (model.colorMode === "custom") model.paletteId = "custom";
  migratePosterColorSchema(model);
  return model;
}

function resolvePosterColors(model) {
  ensurePosterColorState(model);
  if (isCustomColorMode(model)) {
    const resolved = {};
    const missing = [];
    COLOR_ELEMENT_KEYS.forEach((key) => {
      const value = pickColor(model.customColors && model.customColors[key], DEFAULT_CUSTOM_COLORS[key]);
      resolved[key] = value;
      if (!(model.customColors && model.customColors[key])) missing.push(key);
    });
    warnMissingColorKeys("customColors after init", missing, {
      gameId: model.gameId || "",
      templateId: model.templateId
    });
    return resolved;
  }
  return snapshotLiveColors(model);
}

function paintLiveColor(model, key, color) {
  if (!model || !color) return;
  if (!model.style) model.style = {};
  if (key === "total") {
    if (model.total) model.total.color = color;
    model.style.total = color;
    return;
  }
  if (key === "relativeTotal") {
    if (model.relativeTotal) model.relativeTotal.color = color;
    model.style.relativeTotalColor = color;
    return;
  }
  if (key === "nickname" || key === "course" || key === "date" || key === "extra") {
    if (model.identity && model.identity[key]) model.identity[key].color = color;
    return;
  }
  if (key === "summaryLabel") {
    model.style.summaryLabelColor = color;
    return;
  }
  if (key === "summaryNumber") {
    model.style.summaryNumberColor = color;
    return;
  }
  if (key === "extremeScore") {
    model.style.extremeScoreColor = color;
    return;
  }
  if (key === "divider") {
    model.style.dividerColor = color;
    return;
  }
  model.style[key] = color;
}

function applyResolvedColorsToModel(model, colors) {
  if (!model || !colors) return model;
  COLOR_ELEMENT_KEYS.forEach((key) => {
    if (colors[key]) paintLiveColor(model, key, colors[key]);
  });
  model.resolvedColors = Object.assign({}, colors);
  return model;
}

function resolveAndApplyPosterColors(model) {
  if (!model) return model;
  const colors = resolvePosterColors(model);
  return applyResolvedColorsToModel(model, colors);
}

function restorePosterColorState(model) {
  if (!model) return model;
  discardDerivedPosterColors(model);
  ensurePosterColorState(model);
  return resolveAndApplyPosterColors(model);
}

function enterCustomColorMode(model) {
  if (!model) return model;
  model.colorMode = "custom";
  model.paletteId = "custom";
  if (!hasStoredCustomColors(model.customColors)) {
    model.customColors = snapshotLiveColors(model);
    markColorSchemaCurrent(model);
  } else {
    migratePosterColorSchema(model);
  }
  return resolveAndApplyPosterColors(model);
}

function enterTemplateColorMode(model) {
  if (!model) return model;
  model.colorMode = "template";
  return model;
}

function setCustomElementColor(model, uiKey, color) {
  if (!model || !color) return model;
  if (!isCustomColorMode(model)) enterCustomColorMode(model);
  if (!model.customColors) model.customColors = {};
  expandUiColorKey(uiKey).forEach((key) => {
    if (COLOR_ELEMENT_KEYS.indexOf(key) < 0) return;
    model.customColors[key] = color;
    paintLiveColor(model, key, color);
  });
  markColorSchemaCurrent(model);
  return resolveAndApplyPosterColors(model);
}

module.exports = {
  COLOR_SCHEMA_VERSION,
  COLOR_ELEMENT_KEYS,
  DEFAULT_CUSTOM_COLORS,
  isCustomColorMode,
  ensurePosterColorState,
  restorePosterColorState,
  discardDerivedPosterColors,
  migratePosterColorSchema,
  snapshotLiveColors,
  resolvePosterColors,
  applyResolvedColorsToModel,
  resolveAndApplyPosterColors,
  enterCustomColorMode,
  enterTemplateColorMode,
  setCustomElementColor,
  expandUiColorKey
};
