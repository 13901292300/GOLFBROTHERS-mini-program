const POSTER_WIDTH = 1000;
const POSTER_HEIGHT = 1265;
const BRAND_HEIGHT = 70;
const DEFAULT_BRAND_TEXT = "GOLF BROTHERS";
const DEFAULT_BRAND_ALIGN = "left";
/** 自定义 LOGO 未上传时，顶栏绘制默认旗标，不再强制赛事图 */
const EVENT_BRAND_LOGO_PATH = "/subpackages/poster/images/mingxiaobei-logo.jpg";
const EVENT_BRAND_TITLE = DEFAULT_BRAND_TEXT;
const MAX_STICKERS = 5;

function createBrandHeader() {
  return {
    text: DEFAULT_BRAND_TEXT,
    align: DEFAULT_BRAND_ALIGN,
    logoPath: "",
    logoFileID: "",
    useCustomLogo: false
  };
}

function normalizeBrandAlign(value) {
  if (value === "center" || value === "right") return value;
  return DEFAULT_BRAND_ALIGN;
}

function ensureBrandHeader(model) {
  if (!model) return model;
  const current = model.brandHeader && typeof model.brandHeader === "object" ? model.brandHeader : {};
  const text = String(current.text == null ? DEFAULT_BRAND_TEXT : current.text);
  model.brandHeader = {
    text: text,
    align: normalizeBrandAlign(current.align),
    logoPath: String(current.logoPath || ""),
    logoFileID: String(current.logoFileID || ""),
    useCustomLogo: Boolean(current.useCustomLogo)
  };
  if (model.identity) model.identity.brand = text || DEFAULT_BRAND_TEXT;
  return model;
}
const posterColors = require("./poster-colors");

const PGA_MARKER_DEFAULTS = {
  eagleMarker: "#dc3f4d",
  underMarker: "#dc3f4d",
  overMarker: "#6B7280",
  doubleBogeyMarker: "#6B7280"
};

const DP_MARKER_DEFAULTS = {
  eagleMarker: "#f2b321",
  underMarker: "#dc3f4d",
  overMarker: "#101820",
  doubleBogeyMarker: "#1c75bc"
};
const MARKER_STYLE_KEYS = ["eagleMarker", "underMarker", "overMarker", "doubleBogeyMarker"];

function initColorPresets() {
  return {
    pga: Object.assign({}, PGA_MARKER_DEFAULTS),
    dp: Object.assign({}, DP_MARKER_DEFAULTS)
  };
}

function ensureColorPresets(model) {
  if (!model) return model;
  const defaults = initColorPresets();
  if (!model.colorPresets || typeof model.colorPresets !== "object") {
    model.colorPresets = defaults;
    const live = {};
    MARKER_STYLE_KEYS.forEach((key) => {
      if (model.style && model.style[key]) live[key] = model.style[key];
    });
    const mode = model.scoringStyle === "dp" ? "dp" : "pga";
    if (Object.keys(live).length) Object.assign(model.colorPresets[mode], live);
  }
  if (!model.colorPresets.pga) model.colorPresets.pga = Object.assign({}, PGA_MARKER_DEFAULTS);
  if (!model.colorPresets.dp) model.colorPresets.dp = Object.assign({}, DP_MARKER_DEFAULTS);
  MARKER_STYLE_KEYS.forEach((key) => {
    if (!model.colorPresets.pga[key]) model.colorPresets.pga[key] = PGA_MARKER_DEFAULTS[key];
    if (!model.colorPresets.dp[key]) model.colorPresets.dp[key] = DP_MARKER_DEFAULTS[key];
  });
  return model;
}

function applyMarkerPreset(model, styleId) {
  ensureColorPresets(model);
  if (posterColors.isCustomColorMode(model)) return model;
  const mode = styleId === "dp" ? "dp" : "pga";
  if (mode === "dp" && markersFollowTotal(model)) {
    model.colorPresets.dp = Object.assign({}, DP_MARKER_DEFAULTS);
  }
  if (model.style) Object.assign(model.style, model.colorPresets[mode]);
  applyTemplate2CardBoard(model);
  applyTemplate3ColorLinks(model);
  applyTemplate4ColorLinks(model);
  return model;
}

function applyTemplate2CardBoard(model) {
  if (!model || model.templateId !== "template2" || !model.style) return model;
  if (posterColors.isCustomColorMode(model)) return model;
  if (model.scoringStyle === "dp") {
    model.style.card = "#ffffff";
    model.style.cardOpacity = 15;
    return model;
  }
  const template = TEMPLATES.template2;
  const palette = resolvePalette(template, model.paletteId);
  model.style.card = (palette && palette.card) || "#101820";
  if (!Number.isFinite(Number(model.style.cardOpacity))) model.style.cardOpacity = 15;
  return model;
}

function applyTemplate3ColorLinks(model) {
  if (!model || model.templateId !== "template3" || !model.style) return model;
  if (!paletteLinksActive(model)) return model;
  const totalColor = (model.total && model.total.color) || model.style.total || "#dc3f4d";
  const scoreColor = (model.relativeTotal && model.relativeTotal.color)
    || model.style.relativeTotalColor
    || model.style.scoreText
    || "#ffffff";
  const markerColor = markersFollowTotal(model) ? totalColor : scoreColor;
  if (model.total) model.total.color = totalColor;
  model.style.total = totalColor;
  model.style.card = totalColor;
  model.style.extremeScoreColor = totalColor;
  if (model.relativeTotal) model.relativeTotal.color = scoreColor;
  model.style.relativeTotalColor = scoreColor;
  model.style.scoreText = scoreColor;
  model.style.line = scoreColor;
  if (model.scoringStyle !== "dp") {
    MARKER_STYLE_KEYS.forEach((key) => {
      model.style[key] = markerColor;
      if (model.colorPresets && model.colorPresets.pga) model.colorPresets.pga[key] = markerColor;
    });
  }
  return model;
}

function applyTemplate4ColorLinks(model) {
  if (!model || model.templateId !== "template4" || !model.style) return model;
  if (!paletteLinksActive(model)) return model;
  const look = (TEMPLATES.template4 && TEMPLATES.template4.look) || {};
  const elementColor = (model.total && model.total.color) || model.style.total || "#15533a";
  const textColor = "#ffffff";
  if (model.total) model.total.color = elementColor;
  model.style.total = elementColor;
  model.style.line = elementColor;
  model.style.scoreText = look.scoreTextLinksToTotal ? elementColor : (look.scoreTextColor || textColor);
  model.style.extremeScoreColor = elementColor;
  model.style.summaryLabelColor = elementColor;
  if (model.relativeTotal) model.relativeTotal.color = elementColor;
  model.style.relativeTotalColor = elementColor;
  if (model.scoringStyle !== "dp") {
    MARKER_STYLE_KEYS.forEach((key) => {
      model.style[key] = elementColor;
      if (model.colorPresets && model.colorPresets.pga) model.colorPresets.pga[key] = elementColor;
    });
  }
  ["nickname", "course", "date", "extra"].forEach((key) => {
    if (model.identity && model.identity[key]) model.identity[key].color = textColor;
  });
  return model;
}

function isTemplate3ScoreGroupSource(source) {
  return source === "relativeTotalColor"
    || source === "scoreText"
    || source === "line"
    || source === "pgaUnder"
    || source === "pgaOver"
    || MARKER_STYLE_KEYS.indexOf(source) >= 0;
}

function templatePaletteOverride(model) {
  const template = TEMPLATES[model && model.templateId];
  if (!template || !template.paletteOverrides) return null;
  return template.paletteOverrides[model && model.paletteId] || null;
}

function templatePaletteFlag(model, key, templateValue) {
  const override = templatePaletteOverride(model);
  if (override && override[key] === true) return true;
  if (override && override[key] === false) return false;
  return Boolean(templateValue);
}

function markersFollowTotal(model) {
  const template = TEMPLATES[model && model.templateId];
  if (!template || !model || model.scoringStyle === "dp") return false;
  return templatePaletteFlag(model, "markerLinksToTotal", template.markerLinksToTotal);
}

function extremeScoresFollowTotal(model) {
  const template = TEMPLATES[model && model.templateId];
  return templatePaletteFlag(model, "extremeScoreFollowsTotal", !template || template.extremeScoreFollowsTotal !== false);
}

function applyPaletteBackdrop(model) {
  const template = TEMPLATES[model && model.templateId];
  if (!template || !template.paletteOverrides || !model) return model;
  if (model.paletteId === "custom") return model;
  const hasPaletteBackdrop = Object.keys(template.paletteOverrides).some((id) => {
    const item = template.paletteOverrides[id];
    return item && item.backdropId;
  });
  if (!hasPaletteBackdrop) return model;
  const override = template.paletteOverrides[model.paletteId] || {};
  const look = template.look || {};
  const backdropId = override.backdropId || look.backdropId;
  if (!backdropId) return model;
  model.backdropMode = "system";
  if (model.backdropId !== backdropId) model.backdrop = null;
  model.backdropId = backdropId;
  return model;
}

function applyPaletteCardOpacity(model) {
  const template = TEMPLATES[model && model.templateId];
  if (!template || !template.paletteOverrides || !model || !model.style) return model;
  if (posterColors.isCustomColorMode(model)) return model;
  const hasPaletteOpacity = Object.keys(template.paletteOverrides).some((id) => {
    const item = template.paletteOverrides[id];
    return item && item.cardOpacity != null && Number.isFinite(Number(item.cardOpacity));
  });
  if (!hasPaletteOpacity) return model;
  const override = template.paletteOverrides[model.paletteId] || {};
  const opacity = override.cardOpacity != null
    ? Number(override.cardOpacity)
    : Number(template.defaults && template.defaults.cardOpacity);
  if (!Number.isFinite(opacity)) return model;
  model.style.cardOpacity = Math.max(0, Math.min(100, opacity));
  return model;
}

function applyPaletteTypography(model) {
  const template = TEMPLATES[model && model.templateId];
  if (!template || !template.paletteOverrides || !model) return model;
  const hasType = Object.keys(template.paletteOverrides).some((id) => {
    const item = template.paletteOverrides[id];
    return item && (item.scoreFont || item.totalFont || item.relativeFont);
  });
  if (!hasType) return model;
  if (!model.fonts) model.fonts = {};
  const override = template.paletteOverrides[model.paletteId] || {};
  const look = template.look || {};
  model.fonts.score = override.scoreFont || look.scoreFont || model.fonts.score || "paytone";
  const totalFont = override.totalFont || look.totalFont || "bodoni";
  model.fonts.total = totalFont;
  if (model.total) model.total.font = totalFont;
  if (model.relativeTotal) {
    model.relativeTotal.font = override.relativeFont || look.relativeFont || "bodoni";
  }
  return model;
}

const PALETTES = {
  forestGold: {
    zh: "冠军金",
    en: "Champion Gold",
    total: "#ce9224",
    card: "#15533a",
    line: "#ce9224",
    scoreText: "#ffffff",
    text: "#ffffff",
    accent: "#ffffff",
    eagleMarker: PGA_MARKER_DEFAULTS.eagleMarker,
    underMarker: PGA_MARKER_DEFAULTS.underMarker,
    overMarker: PGA_MARKER_DEFAULTS.overMarker,
    doubleBogeyMarker: PGA_MARKER_DEFAULTS.doubleBogeyMarker
  },
  roseMist: {
    zh: "粉红淡灰",
    en: "Rose Mist",
    total: "#f28aa5",
    card: "#77777d",
    line: "#f7bccb",
    scoreText: "#ffffff",
    text: "#fff7f8",
    eagleMarker: PGA_MARKER_DEFAULTS.eagleMarker,
    underMarker: PGA_MARKER_DEFAULTS.underMarker,
    overMarker: PGA_MARKER_DEFAULTS.overMarker,
    doubleBogeyMarker: PGA_MARKER_DEFAULTS.doubleBogeyMarker
  },
  sapphireTan: {
    zh: "宝石蓝浅棕",
    en: "Sapphire Tan",
    total: "#1c5fa8",
    card: "#b89568",
    line: "#ead9bf",
    scoreText: "#ffffff",
    text: "#f8f2e9",
    eagleMarker: PGA_MARKER_DEFAULTS.eagleMarker,
    underMarker: PGA_MARKER_DEFAULTS.underMarker,
    overMarker: PGA_MARKER_DEFAULTS.overMarker,
    doubleBogeyMarker: PGA_MARKER_DEFAULTS.doubleBogeyMarker
  },
  crimsonInk: {
    zh: "赤红墨黑",
    en: "Crimson Ink",
    total: "#dc3f4d",
    card: "#a92331",
    line: "#f4dadd",
    scoreText: "#ffffff",
    text: "#ffffff",
    eagleMarker: PGA_MARKER_DEFAULTS.eagleMarker,
    underMarker: PGA_MARKER_DEFAULTS.underMarker,
    overMarker: PGA_MARKER_DEFAULTS.overMarker,
    doubleBogeyMarker: PGA_MARKER_DEFAULTS.doubleBogeyMarker
  },
  mastersYellow: {
    zh: "大师黄绿",
    en: "Masters Yellow",
    total: "#f4df3b",
    card: "#24733f",
    line: "#f4df3b",
    scoreText: "#ffffff",
    text: "#ffffff",
    eagleMarker: PGA_MARKER_DEFAULTS.eagleMarker,
    underMarker: PGA_MARKER_DEFAULTS.underMarker,
    overMarker: PGA_MARKER_DEFAULTS.overMarker,
    doubleBogeyMarker: PGA_MARKER_DEFAULTS.doubleBogeyMarker
  },
  pineCoral: {
    zh: "松绿珊瑚",
    en: "Pine Coral",
    total: "#f0eee8",
    card: "#183a28",
    line: "#ef5e68",
    scoreText: "#f7f3ed",
    text: "#ffffff",
    eagleMarker: PGA_MARKER_DEFAULTS.eagleMarker,
    underMarker: PGA_MARKER_DEFAULTS.underMarker,
    overMarker: PGA_MARKER_DEFAULTS.overMarker,
    doubleBogeyMarker: PGA_MARKER_DEFAULTS.doubleBogeyMarker
  },
  navySilver: {
    zh: "海军蓝银",
    en: "Navy Silver",
    total: "#1c75bc",
    card: "#173b59",
    line: "#b9c8d2",
    scoreText: "#ffffff",
    text: "#ffffff",
    eagleMarker: PGA_MARKER_DEFAULTS.eagleMarker,
    underMarker: PGA_MARKER_DEFAULTS.underMarker,
    overMarker: PGA_MARKER_DEFAULTS.overMarker,
    doubleBogeyMarker: PGA_MARKER_DEFAULTS.doubleBogeyMarker
  },
  wineBlush: {
    zh: "酒红浅粉",
    en: "Wine Blush",
    total: "#f3b5bd",
    card: "#772d3b",
    line: "#f1c9ce",
    scoreText: "#ffffff",
    text: "#fff7f7",
    eagleMarker: PGA_MARKER_DEFAULTS.eagleMarker,
    underMarker: PGA_MARKER_DEFAULTS.underMarker,
    overMarker: PGA_MARKER_DEFAULTS.overMarker,
    doubleBogeyMarker: PGA_MARKER_DEFAULTS.doubleBogeyMarker
  },
  woodlandDigest: {
    zh: "林地杂志",
    en: "Woodland Digest",
    total: "#15533a",
    card: "#101820",
    line: "#15533a",
    scoreText: "#ffffff",
    text: "#ffffff",
    accent: "#f4df3b",
    eagleMarker: "#ffffff",
    underMarker: "#ffffff",
    overMarker: "#ffffff",
    doubleBogeyMarker: "#ffffff"
  },
  columnRed: {
    zh: "纵章红",
    en: "Column Red",
    total: "#dc3f4d",
    card: "#101820",
    line: "#dc3f4d",
    scoreText: "#ffffff",
    text: "#ffffff",
    accent: "#ffffff",
    eagleMarker: "#dc3f4d",
    underMarker: "#dc3f4d",
    overMarker: "#dc3f4d",
    doubleBogeyMarker: "#dc3f4d"
  },
  championRed: {
    zh: "冠军红",
    en: "Champion Red",
    total: "#dc3f4d",
    card: "#dc3f4d",
    line: "#ffffff",
    scoreText: "#ffffff",
    text: "#ffffff",
    accent: "#ffffff",
    eagleMarker: "#ffffff",
    underMarker: "#ffffff",
    overMarker: "#ffffff",
    doubleBogeyMarker: "#ffffff"
  }
};

const COLOR_OPTIONS = [
  { value: "#ffffff", zh: "白色", en: "White" },
  { value: "#101820", zh: "墨黑", en: "Black" },
  { value: "#dc3f4d", zh: "巡回红", en: "Tour Red" },
  { value: "#f28aa5", zh: "玫瑰粉", en: "Rose" },
  { value: "#f2b321", zh: "老鹰金", en: "Eagle Gold" },
  { value: "#ce9224", zh: "冠军金", en: "Champion Gold" },
  { value: "#f4df3b", zh: "大师黄", en: "Yellow" },
  { value: "#15533a", zh: "松柏绿", en: "Green" },
  { value: "#1c75bc", zh: "巡回蓝", en: "Tour Blue" },
  { value: "#6b7280", zh: "灰色", en: "Gray" },
  { value: "#9ca3af", zh: "浅灰", en: "Light Gray" },
  { value: "#4b5563", zh: "深灰", en: "Dark Gray" },
  { value: "#1f2937", zh: "石墨", en: "Graphite" }
];

const FONT_OPTIONS = [
  { id: "playfair", label: "Playfair Display", family: "GOLF_Playfair", weight: 700 },
  { id: "bodoni", label: "Bodoni Moda Bold", family: "GOLF_Bodoni", weight: 700 },
  { id: "bodoniRegular", label: "Bodoni Moda Regular", family: "GOLF_BodoniRegular", weight: 400 },
  { id: "cormorant", label: "Cormorant Garamond", family: "GOLF_Cormorant", weight: 700 },
  { id: "anton", label: "Anton", family: "Anton", weight: 400 },
  { id: "oswald", label: "Oswald", family: "GOLF_Oswald", weight: 700 },
  { id: "paytone", label: "Paytone One", family: "GOLF_Paytone", weight: 400 },
  { id: "outfit", label: "Outfit Black", family: "GOLF_Outfit", weight: 900 },
  { id: "montserrat", label: "Montserrat Black", family: "GOLF_Montserrat", weight: 900 },
  { id: "inter", label: "Inter", family: "Inter", weight: 700 },
  { id: "pingfang", label: "PingFang SC", family: "PingFang SC", weight: 700 }
];

const FONT_FALLBACK_MAP = {
  georgia: "cormorant",
  arial: "pingfang",
  impact: "pingfang",
  didot: "playfair",
  times: "cormorant",
  arialBlack: "pingfang",
  trebuchet: "pingfang",
  verdana: "pingfang",
  courier: "pingfang",
  baskerville: "cormorant"
};

const KNOWN_FONT_IDS = FONT_OPTIONS.reduce((map, item) => {
  map[item.id] = true;
  return map;
}, {});

function normalizeFontId(fontId) {
  const id = String(fontId || "").trim();
  if (!id) return "pingfang";
  if (KNOWN_FONT_IDS[id]) return id;
  if (FONT_FALLBACK_MAP[id]) return FONT_FALLBACK_MAP[id];
  const lower = id.toLowerCase();
  if (FONT_FALLBACK_MAP[lower]) return FONT_FALLBACK_MAP[lower];
  return "pingfang";
}

function resolveItalic(value, fallback) {
  if (value === true || value === false) return value;
  return Boolean(fallback);
}

function ensureTextItalic(model) {
  if (!model || typeof model !== "object") return model;
  if (model.total && typeof model.total === "object") {
    model.total.italic = resolveItalic(model.total.italic, false);
  }
  if (model.relativeTotal && typeof model.relativeTotal === "object") {
    model.relativeTotal.italic = resolveItalic(model.relativeTotal.italic, false);
  }
  if (model.fonts && typeof model.fonts === "object") {
    model.fonts.scoreItalic = resolveItalic(model.fonts.scoreItalic, false);
  }
  if (model.identity && typeof model.identity === "object") {
    ["nickname", "course", "date", "extra"].forEach((key) => {
      const item = model.identity[key];
      if (item && typeof item === "object") {
        item.italic = resolveItalic(item.italic, key === "nickname");
      }
    });
  }
  return model;
}

function remapPosterFonts(model) {
  if (!model || typeof model !== "object") return model;
  if (model.total && typeof model.total === "object") {
    model.total.font = normalizeFontId(model.total.font || (model.fonts && model.fonts.total) || "playfair");
  }
  if (model.fonts && typeof model.fonts === "object") {
    if (model.fonts.score) model.fonts.score = normalizeFontId(model.fonts.score);
    if (model.total && model.total.font) model.fonts.total = model.total.font;
    else if (model.fonts.total) model.fonts.total = normalizeFontId(model.fonts.total);
  }
  if (model.relativeTotal && typeof model.relativeTotal === "object") {
    model.relativeTotal.font = normalizeFontId(model.relativeTotal.font || "bodoni");
  }
  if (model.identity && typeof model.identity === "object") {
    ["nickname", "course", "date", "extra"].forEach((key) => {
      const item = model.identity[key];
      if (item && typeof item === "object") item.font = normalizeFontId(item.font || "pingfang");
    });
  }
  return model;
}

const GOOGLE_FONT_FACES = [
  {
    family: "GOLF_Playfair",
    url: 'url("https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/fonts/PlayfairDisplay-Bold.ttf")'
  },
  {
    family: "GOLF_Bodoni",
    url: 'url("https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/fonts/BodoniModa-Bold.ttf")'
  },
  {
    family: "GOLF_BodoniRegular",
    url: 'url("https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/fonts/BodoniModa-Regular.ttf")'
  },
  {
    family: "GOLF_Cormorant",
    url: 'url("https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/fonts/CormorantGaramond-Bold.ttf")'
  },
  {
    family: "Anton",
    url: 'url("https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/fonts/Anton-Regular.ttf")'
  },
  {
    family: "GOLF_Oswald",
    url: 'url("https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/fonts/Oswald-Bold.ttf")'
  },
  {
    family: "GOLF_Paytone",
    url: 'url("https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/fonts/PaytoneOne-Regular.ttf")'
  },
  {
    family: "GOLF_Outfit",
    url: 'url("https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/fonts/Outfit-Black.ttf")'
  },
  {
    family: "GOLF_Montserrat",
    url: 'url("https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/fonts/Montserrat-Black.ttf")'
  },
  {
    family: "Inter",
    url: 'url("https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/fonts/Inter-Bold.ttf")'
  }
];

const SHARED_BRAND = { x: 0, y: 0, w: 1000, h: 70 };

const SYSTEM_BACKDROPS = [
  {
    id: "forest-dark",
    zh: "暗绿",
    en: "Dark green",
    path: "https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/poster-bj/poster-bg-forest-dark.jpg"
  },
  {
    id: "woodland",
    zh: "林地",
    en: "Woodland",
    path: "https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/poster-bj/poster-bg-woodland.jpg"
  },
  {
    id: "fairway-soft",
    zh: "浅绿",
    en: "Soft",
    path: "https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/poster-bj/poster-bg-fairway-soft.jpg"
  },
  {
    id: "studio-light",
    zh: "浅素",
    en: "Light studio",
    path: "https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/poster-bj/poster-bg-studio-light.jpg"
  },
  {
    id: "studio-dark",
    zh: "深素",
    en: "Dark studio",
    path: "https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/poster-bj/poster-bg-studio-dark.jpg"
  },
  {
    id: "course-flag",
    zh: "球场中暗",
    en: "Course mid-dark",
    path: "https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/poster-bj/poster-bg-course-flag.jpg"
  },
  {
    id: "tee-bright",
    zh: "发球台高亮",
    en: "Tee bright",
    path: "https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/poster-bj/poster-bg-tee-bright.jpg"
  },
  {
    id: "tee-day",
    zh: "发球台常亮",
    en: "Tee daylight",
    path: "https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/poster-bj/poster-bg-tee-day.jpg"
  },
  {
    id: "tee-dim",
    zh: "发球台偏暗",
    en: "Tee dim",
    path: "https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/poster-bj/poster-bg-tee-dim.jpg"
  }
];

const DEFAULT_TEMPLATE_ID = "template1";

const TEMPLATES = {
  template1: {
    zh: "学院经典",
    en: "Academy Classic",
    descriptionZh: "林地背景、透明成绩表与杂志式排版",
    descriptionEn: "Woodland backdrop, clear scorecard, magazine layout",
    tone: "editorial",
    scoreStyle: "grid",
    highlightShape: "mixed",
    paletteIds: ["forestGold", "woodlandDigest", "navySilver"],
    applyLookOnSelect: true,
    colorLinks: true,
    markerLinksToTotal: false,
    extremeScoreFollowsTotal: true,
    summaryFollowsRelative: true,
    paletteOverrides: {
      forestGold: {
        total: "#ce9224",
        line: "#ce9224",
        accent: "#ffffff",
        scoreText: "#ffffff",
        eagleMarker: "#ffffff",
        underMarker: "#ffffff",
        overMarker: "#ffffff",
        doubleBogeyMarker: "#ffffff",
        barColors: ["#ce9224", "#ffffff", "#15533a"]
      },
      woodlandDigest: {
        eagleMarker: "#ffffff",
        underMarker: "#ffffff",
        overMarker: "#ffffff",
        doubleBogeyMarker: "#ffffff",
        barColors: ["#15533a", "#ffffff", "#101820"]
      },
      navySilver: {
        total: "#1c75bc",
        line: "#1c75bc",
        accent: "#ffffff",
        scoreText: "#ffffff",
        eagleMarker: "#ffffff",
        underMarker: "#ffffff",
        overMarker: "#ffffff",
        doubleBogeyMarker: "#ffffff",
        barColors: ["#1c75bc", "#b9c8d2", "#15533a"]
      }
    },
    defaults: {
      totalSize: 275,
      totalOpacity: 88,
      nicknameSize: 48,
      courseSize: 20,
      dateSize: 20,
      cardOpacity: 0
    },
    look: {
      backdropMode: "system",
      backdropId: "woodland",
      scoreFont: "montserrat",
      totalFont: "montserrat",
      totalColor: "#ce9224",
      totalAboveSubject: true,
      relativeFont: "montserrat",
      relativeColor: "#ffffff",
      relativeSize: 80,
      relativeOffsetX: 148,
      relativeOffsetY: -96,
      nicknameFont: "playfair",
      nicknameColor: "#ffffff",
      nicknameItalic: false,
      courseFont: "montserrat",
      courseColor: "#ffffff",
      courseItalic: false,
      extraHidden: true,
      courseRotation: 0,
      scoreTextColor: "#ffffff",
      scoreMarkerColor: "#ffffff"
    },
    layout: {
      brand: SHARED_BRAND,
      total: { x: 500, y: 748, w: 470, h: 300 },
      score: { x: 71, y: 1005, w: 858, h: 209, direction: "horizontal", padX: 24 },
      nickname: { x: 71, y: 868, w: 520, h: 72, align: "left" },
      course: {
        x: 71,
        y: 948,
        w: 620,
        h: 38,
        align: "left",
        combinesDate: true,
        dateJoiner: " | "
      },
      extra: { x: 71, y: 1188, w: 400, h: 28, align: "left" },
      subject: { x: 180, y: 200, w: 640, h: 980 }
    }
  },
  template2: {
    zh: "杂志侧栏",
    en: "Editorial Sidebar",
    descriptionZh: "左侧纵表、透明底板与红色成绩标记",
    descriptionEn: "Left column scorecard, clear board, red markers",
    tone: "editorial",
    scoreStyle: "sidebar",
    highlightShape: "circle",
    paletteIds: ["columnRed", "navySilver", "wineBlush"],
    applyLookOnSelect: true,
    colorLinks: true,
    markerLinksToTotal: true,
    extremeScoreFollowsTotal: false,
    paletteOverrides: {
      columnRed: {
        barColors: ["#dc3f4d", "#ffffff", "#15533a"]
      },
      navySilver: {
        barColors: ["#1c75bc", "#ffffff", "#b9c8d2"]
      },
      wineBlush: {
        barColors: ["#f3b5bd", "#ffffff", "#772d3b"]
      }
    },
    defaults: {
      totalSize: 180,
      totalOpacity: 88,
      nicknameSize: 40,
      courseSize: 27,
      dateSize: 27,
      cardOpacity: 15
    },
    look: {
      backdropMode: "system",
      backdropId: "forest-dark",
      scoreFont: "bodoni",
      totalFont: "bodoni",
      totalColor: "#dc3f4d",
      totalSize: 180,
      totalAboveSubject: false,
      relativeFont: "bodoni",
      relativeColor: "#ffffff",
      relativeSize: 64,
      relativeOffsetX: 100,
      relativeOffsetY: -62,
      nicknameFont: "bodoni",
      nicknameColor: "#ffffff",
      nicknameItalic: false,
      courseFont: "bodoni",
      courseColor: "#ffffff",
      courseItalic: false,
      courseSize: 27,
      courseRotation: 270,
      extraFont: "bodoni",
      extraColor: "#ffffff",
      dividerColor: "#ffffff",
      scorecardAboveSubject: false
    },
    layout: {
      brand: SHARED_BRAND,
      nickname: { x: 50, y: 150, w: 360, h: 60, align: "center" },
      total: { x: 50, y: 228, w: 360, h: 240 },
      score: {
        x: 85,
        y: 443,
        w: 290,
        h: 760,
        direction: "vertical",
        dividerWidth: 5,
        dividerInset: 32,
        padX: 18,
        summaryLayout: "stack",
        summaryGap: 10,
        columns: [
          { x: 138, y: 478, w: 72, h: 675 },
          { x: 250, y: 478, w: 72, h: 675 }
        ]
      },
      course: {
        x: 42,
        y: 443,
        w: 44,
        h: 750,
        align: "center",
        vertical: true,
        combinesDate: true,
        rotation: 270
      },
      extra: { x: 390, y: 1180, w: 560, h: 34, align: "right" },
      subject: { x: 360, y: 280, w: 600, h: 910 }
    }
  },
  template3: {
    zh: "冠军红场",
    en: "Victory Red",
    descriptionZh: "冠军红底板、居中成绩卡与 Bodoni Bold",
    descriptionEn: "Champion red board, centered scorecard, Bodoni Bold",
    tone: "dark",
    scoreStyle: "solid",
    highlightShape: "circle",
    paletteIds: ["championRed", "roseMist", "sapphireTan"],
    applyLookOnSelect: true,
    colorLinks: true,
    markerLinksToTotal: false,
    extremeScoreFollowsTotal: true,
    boardLinksToTotal: true,
    scoreTextLinksToRelative: true,
    hideNineHoleSummaries: true,
    paletteOverrides: {
      championRed: {
        zh: "巡回红",
        en: "Tour Red",
        barColors: ["#dc3f4d", "#ffffff", "#dc3f4d"]
      },
      roseMist: {
        zh: "粉色蔷薇",
        en: "Pink Rose",
        cardOpacity: 0,
        scoreFont: "playfair",
        totalFont: "playfair",
        relativeFont: "playfair",
        barColors: ["#f28aa5", "#ffffff", "#f28aa5"]
      },
      sapphireTan: {
        zh: "正蓝旗",
        en: "True Blue",
        scoreText: "#ffffff",
        cardOpacity: 0,
        markerLinksToTotal: true,
        extremeScoreFollowsTotal: false,
        barColors: ["#1c5fa8", "#ffffff", "#1c5fa8"]
      }
    },
    defaults: {
      totalSize: 600,
      totalOpacity: 92,
      nicknameSize: 38,
      courseSize: 18,
      dateSize: 18,
      cardOpacity: 88
    },
    look: {
      backdropMode: "system",
      backdropId: "forest-dark",
      scoreFont: "paytone",
      scoreItalic: false,
      totalFont: "bodoni",
      totalColor: "#dc3f4d",
      totalSize: 600,
      totalAlignCenter: true,
      totalY: 490,
      totalAboveSubject: false,
      relativeFont: "bodoni",
      relativeColor: "#ffffff",
      relativeSize: 156,
      relativeItalic: false,
      relativeHidden: true,
      relativeOffsetX: 210,
      relativeOffsetY: -118,
      nicknameFont: "bodoni",
      nicknameColor: "#ffffff",
      nicknameItalic: false,
      courseFont: "bodoni",
      courseColor: "#ffffff",
      courseItalic: false,
      extraFont: "bodoni",
      extraColor: "#ffffff",
      extraItalic: false,
      extraHidden: false,
      courseRotation: 0,
      dividerColor: "#ffffff",
      scorecardAboveSubject: true
    },
    layout: {
      brand: SHARED_BRAND,
      total: { x: 0, y: 230, w: 1000, h: 520 },
      nickname: { x: 170, y: 865, w: 660, h: 62, align: "center" },
      score: { x: 130, y: 945, w: 740, h: 190, direction: "horizontal", padX: 28 },
      course: {
        x: 80,
        y: 1172,
        w: 840,
        h: 40,
        align: "center",
        metaLine: true,
        metaKeys: ["extra", "course", "date"],
        dateJoiner: " | "
      },
      subject: { x: 90, y: 370, w: 820, h: 850 }
    }
  },
  template4: {
    zh: "光辉巡回",
    en: "Radiant Tour",
    descriptionZh: "深素背景、居中总分与学院式网格",
    descriptionEn: "Dark studio, centered total, academy grid",
    tone: "dark",
    scoreStyle: "grid",
    highlightShape: "mixed",
    paletteIds: ["sapphireTan", "forestGold", "roseMist"],
    applyLookOnSelect: true,
    colorLinks: true,
    markerLinksToTotal: true,
    boardLinksToTotal: false,
    scoreTextLinksToTotal: false,
    extremeScoreFollowsTotal: false,
    summaryFollowsTotal: true,
    summaryFollowsLine: true,
    doubleExtremeMarkers: true,
    paletteOverrides: {
      forestGold: {
        zh: "冠军金",
        en: "Champion Gold",
        total: "#ce9224",
        card: "#000000",
        line: "#ce9224",
        scoreText: "#ffffff",
        accent: "#ffffff",
        eagleMarker: "#ce9224",
        underMarker: "#ce9224",
        overMarker: "#ce9224",
        doubleBogeyMarker: "#ce9224",
        markerLinksToTotal: true,
        scoringStyle: "pga",
        scoreFont: "paytone",
        totalFont: "bodoni",
        relativeFont: "bodoni",
        backdropId: "studio-dark",
        barColors: ["#ce9224", "#ffffff", "#ce9224"]
      },
      roseMist: {
        zh: "粉色阳光",
        en: "Pink Sunshine",
        card: "#000000",
        scoreFont: "playfair",
        totalFont: "playfair",
        relativeFont: "playfair",
        scoringStyle: "pga",
        backdropId: "course-flag",
        barColors: ["#f28aa5", "#ffffff", "#f7bccb"]
      },
      sapphireTan: {
        zh: "DP白",
        en: "DP White",
        total: "#ffffff",
        card: "#ffffff",
        cardOpacity: 15,
        line: "#ffffff",
        scoreText: "#ffffff",
        accent: "#ffffff",
        scoreFont: "paytone",
        totalFont: "bodoni",
        relativeFont: "bodoni",
        scoringStyle: "dp",
        backdropId: "course-flag",
        barColors: ["#ffffff", "#ffffff", "#1c5fa8"]
      }
    },
    defaults: {
      totalSize: 470,
      totalOpacity: 88,
      nicknameSize: 40,
      courseSize: 25,
      dateSize: 25,
      cardOpacity: 15
    },
    look: {
      backdropMode: "system",
      backdropId: "course-flag",
      scoreFont: "paytone",
      scoreItalic: false,
      totalFont: "bodoni",
      totalColor: "#ffffff",
      totalSize: 470,
      totalAlignCenter: true,
      totalAboveSubject: false,
      relativeFont: "bodoni",
      relativeColor: "#ffffff",
      relativeHidden: true,
      nicknameFont: "playfair",
      nicknameColor: "#ffffff",
      nicknameItalic: false,
      nicknameSize: 40,
      courseFont: "playfair",
      courseColor: "#ffffff",
      courseItalic: false,
      courseSize: 25,
      extraFont: "playfair",
      extraColor: "#ffffff",
      extraItalic: false,
      extraSize: 25,
      extraHidden: false,
      courseRotation: 0,
      cardColor: "#ffffff",
      scoreTextColor: "#ffffff",
      scoreMarkerColor: "#ce9224",
      scoringStyle: "dp",
      scorecardAboveSubject: true
    },
    layout: {
      brand: SHARED_BRAND,
      total: { x: 0, y: 145, w: 1000, h: 500 },
      score: { x: 110, y: 962, w: 780, h: 190, direction: "horizontal", padX: 28 },
      nickname: { x: 110, y: 901, w: 350, h: 48, align: "left" },
      extra: { x: 530, y: 850, w: 360, h: 30, align: "right" },
      course: { x: 530, y: 884, w: 360, h: 30, align: "right" },
      date: { x: 530, y: 918, w: 360, h: 30, align: "right" },
      subject: { x: 285, y: 345, w: 430, h: 810 }
    }
  }
};

function centerOf(region) {
  return { x: region.x + region.w / 2, y: region.y + region.h / 2 };
}

function normalizeIdentityRotation(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const degrees = ((n % 360) + 360) % 360;
  if (degrees === 0 || degrees === 90 || degrees === 180 || degrees === 270) return degrees;
  return null;
}

function identityRotation(item, region) {
  const stored = normalizeIdentityRotation(item && item.rotation);
  if (stored !== null) return stored;
  if (item && item.rotated === true) return 90;
  if (item && item.rotated === false) return 0;
  return defaultRegionRotation(region);
}

function defaultRegionRotation(region) {
  const stored = normalizeIdentityRotation(region && region.rotation);
  if (stored !== null) return stored;
  return region && region.vertical ? 90 : 0;
}

function nextIdentityRotation(current) {
  const degrees = normalizeIdentityRotation(current);
  return ((degrees === null ? 0 : degrees) + 90) % 360;
}

function applyIdentityRotation(item, degrees) {
  if (!item) return item;
  const rotation = normalizeIdentityRotation(degrees);
  item.rotation = rotation === null ? 0 : rotation;
  item.rotated = item.rotation !== 0;
  return item;
}

function flipCenterX(item) {
  if (!item || !Number.isFinite(Number(item.x))) return;
  item.x = POSTER_WIDTH - Number(item.x);
}

function toggleSidewaysRotation(item) {
  if (!item) return;
  const rotation = identityRotation(item);
  if (rotation === 270) applyIdentityRotation(item, 90);
  else if (rotation === 90) applyIdentityRotation(item, 270);
}

function pinRelativeToTotalTopRight(model) {
  const total = model && model.total;
  const relative = model && model.relativeTotal;
  if (!total || !relative) return;
  const template = TEMPLATES[model.templateId];
  const look = template && template.look;
  let offsetX = Number(look && look.relativeOffsetX);
  let offsetY = Number(look && look.relativeOffsetY);
  if (!Number.isFinite(offsetX)) {
    const dx = Number(relative.x) - Number(total.x);
    offsetX = Number.isFinite(dx) ? Math.abs(dx) : 112;
  }
  if (!Number.isFinite(offsetY)) {
    const dy = Number(relative.y) - Number(total.y);
    offsetY = Number.isFinite(dy) ? dy : -70;
  }
  relative.x = Number(total.x) + Math.abs(offsetX);
  relative.y = Number(total.y) + offsetY;
}

function mirrorPosterLayout(model) {
  if (!model) return model;
  model.layoutMirrored = !model.layoutMirrored;
  flipCenterX(model.scorecard);
  flipCenterX(model.total);
  pinRelativeToTotalTopRight(model);
  ["nickname", "course", "date", "extra"].forEach((key) => {
    flipCenterX(model.identity && model.identity[key]);
  });
  (model.stickers || []).forEach(flipCenterX);
  toggleSidewaysRotation(model.identity && model.identity.course);
  toggleSidewaysRotation(model.identity && model.identity.date);
  if (model.image) {
    model.image.x = -Number(model.image.x || 0);
  }
  return model;
}

function applyTemplateLook(model) {
  const template = TEMPLATES[model && model.templateId];
  if (!template || !template.applyLookOnSelect || !template.look) return model;
  const look = template.look;
  const totalCenter = template.layout && template.layout.total ? centerOf(template.layout.total) : null;
  if (look.backdropMode) model.backdropMode = look.backdropMode;
  if (look.backdropId) {
    if (model.backdropId !== look.backdropId || look.backdropMode === "system") {
      model.backdrop = null;
    }
    model.backdropId = look.backdropId;
  }
  if (!model.fonts) model.fonts = {};
  if (look.scoreFont) model.fonts.score = look.scoreFont;
  if (look.scoreItalic === true || look.scoreItalic === false) {
    model.fonts.scoreItalic = look.scoreItalic;
  }
  if (look.totalFont) {
    model.fonts.total = look.totalFont;
    if (model.total) model.total.font = look.totalFont;
  }
  if (model.total) {
    if (look.totalColor) {
      model.total.color = look.totalColor;
      if (model.style) {
        model.style.total = look.totalColor;
        if (template.colorLinks && !template.boardLinksToTotal) model.style.line = look.totalColor;
        if (template.boardLinksToTotal) model.style.card = look.totalColor;
      }
    }
    if (look.cardColor && model.style && !template.boardLinksToTotal) {
      model.style.card = look.cardColor;
    }
    if (Number.isFinite(Number(look.totalSize))) {
      model.total.size = Number(look.totalSize);
    }
    if (look.totalAlignCenter) {
      model.total.x = POSTER_WIDTH / 2;
    }
    if (Number.isFinite(Number(look.totalY))) {
      model.total.y = Number(look.totalY);
    }
    if (look.totalAboveSubject === true || look.totalAboveSubject === false) {
      model.total.aboveSubject = look.totalAboveSubject;
    }
    if (look.scorecardAboveSubject === true || look.scorecardAboveSubject === false) {
      if (!model.scorecard) model.scorecard = {};
      model.scorecard.aboveSubject = look.scorecardAboveSubject;
    }
    if (look.totalAlignCourseBottom && template.layout && template.layout.course) {
      const courseBox = template.layout.course;
      const courseSize = (model.identity && model.identity.course && model.identity.course.size)
        || (template.defaults && template.defaults.courseSize)
        || 20;
      const courseBottom = courseBox.y + courseBox.h / 2 + courseSize * 0.45;
      const totalSize = Number(model.total.size) || (template.defaults && template.defaults.totalSize) || 275;
      model.total.y = courseBottom - totalSize * 0.45;
    }
  }
  if (model.relativeTotal) {
    if (look.relativeFont) model.relativeTotal.font = look.relativeFont;
    applyPaletteTypography(model);
    if (look.relativeColor) {
      model.relativeTotal.color = look.relativeColor;
      if (model.style) model.style.relativeTotalColor = look.relativeColor;
    }
    if (Number.isFinite(Number(look.relativeSize))) {
      model.relativeTotal.size = Number(look.relativeSize);
    }
    if (look.relativeItalic === true || look.relativeItalic === false) {
      model.relativeTotal.italic = look.relativeItalic;
    }
    if (look.relativeHidden === true || look.relativeHidden === false) {
      model.relativeTotal.hidden = look.relativeHidden;
      model.relativeTotalCleared = look.relativeHidden;
    }
    const totalX = model.total && Number.isFinite(Number(model.total.x))
      ? Number(model.total.x)
      : (totalCenter && totalCenter.x);
    const totalY = model.total && Number.isFinite(Number(model.total.y))
      ? Number(model.total.y)
      : (totalCenter && totalCenter.y);
    const offsetX = Number(look.relativeOffsetX);
    const offsetY = Number(look.relativeOffsetY);
    if (Number.isFinite(offsetX) && Number.isFinite(Number(totalX))) {
      model.relativeTotal.x = Number(totalX) + offsetX;
    }
    if (Number.isFinite(offsetY) && Number.isFinite(Number(totalY))) {
      model.relativeTotal.y = Number(totalY) + offsetY;
    }
  }
  if (model.identity && model.identity.nickname) {
    if (look.nicknameFont) model.identity.nickname.font = look.nicknameFont;
    if (look.nicknameColor) model.identity.nickname.color = look.nicknameColor;
    if (look.nicknameItalic === true || look.nicknameItalic === false) {
      model.identity.nickname.italic = look.nicknameItalic;
    }
    if (Number.isFinite(Number(look.nicknameSize))) {
      model.identity.nickname.size = Number(look.nicknameSize);
    } else if (template.defaults && template.defaults.nicknameSize) {
      model.identity.nickname.size = template.defaults.nicknameSize;
    }
  }
  if (model.identity && model.identity.course) {
    if (look.courseFont) model.identity.course.font = look.courseFont;
    if (look.courseColor) model.identity.course.color = look.courseColor;
    if (look.courseItalic === true || look.courseItalic === false) {
      model.identity.course.italic = look.courseItalic;
    }
    if (Number.isFinite(Number(look.courseSize))) {
      model.identity.course.size = Number(look.courseSize);
    } else if (template.defaults && template.defaults.courseSize) {
      model.identity.course.size = template.defaults.courseSize;
    }
  }
  if (model.identity && model.identity.date) {
    if (look.courseFont) model.identity.date.font = look.courseFont;
    if (look.courseColor) model.identity.date.color = look.courseColor;
    if (look.courseItalic === true || look.courseItalic === false) {
      model.identity.date.italic = look.courseItalic;
    }
    if (template.defaults && template.defaults.dateSize) {
      model.identity.date.size = template.defaults.dateSize;
    } else if (Number.isFinite(Number(look.courseSize))) {
      model.identity.date.size = Number(look.courseSize);
    }
  }
  if (look.courseRotation === 0 || Number.isFinite(Number(look.courseRotation))) {
    const rotation = Number(look.courseRotation);
    if (model.identity && model.identity.course) applyIdentityRotation(model.identity.course, rotation);
    if (model.identity && model.identity.date) applyIdentityRotation(model.identity.date, rotation);
  }
  if (model.identity && model.identity.extra) {
    if (look.extraFont) model.identity.extra.font = look.extraFont;
    if (look.extraColor) model.identity.extra.color = look.extraColor;
    if (look.extraItalic === true || look.extraItalic === false) {
      model.identity.extra.italic = look.extraItalic;
    }
    if (Number.isFinite(Number(look.extraSize))) {
      model.identity.extra.size = Number(look.extraSize);
    } else if (template.defaults && template.defaults.dateSize) {
      model.identity.extra.size = template.defaults.dateSize;
    }
  }
  if (look.dividerColor && model.style) model.style.dividerColor = look.dividerColor;
  if (look.extraHidden === true || look.extraHidden === false) {
    if (model.identity && model.identity.extra) model.identity.extra.hidden = look.extraHidden;
  }
  if (template.defaults && template.defaults.cardOpacity != null && model.style) {
    model.style.cardOpacity = Math.max(0, Math.min(100, Number(template.defaults.cardOpacity)));
  }
  applyPaletteCardOpacity(model);
  applyPaletteBackdrop(model);
  const palette = resolvePalette(template, model.paletteId || (template.paletteIds && template.paletteIds[0]));
  if (palette && model.style) {
    ["eagleMarker", "underMarker", "overMarker", "doubleBogeyMarker"].forEach((key) => {
      if (!palette[key]) return;
      model.style[key] = palette[key];
      if (model.colorPresets && model.colorPresets.pga) model.colorPresets.pga[key] = palette[key];
    });
    if (palette.line && !template.colorLinks) model.style.line = palette.line;
    if (palette.scoreText) model.style.scoreText = palette.scoreText;
    if (palette.card && !template.boardLinksToTotal) model.style.card = palette.card;
  }
  if (look.scoringStyle) model.scoringStyle = look.scoringStyle;
  if (palette && (palette.scoringStyle === "pga" || palette.scoringStyle === "dp")) {
    model.scoringStyle = palette.scoringStyle;
  }
  applyPaletteTypography(model);
  if (look.scoreTextColor && model.style) model.style.scoreText = look.scoreTextColor;
  if (look.scoreMarkerColor && model.style && model.scoringStyle !== "dp") {
    MARKER_STYLE_KEYS.forEach((key) => {
      model.style[key] = look.scoreMarkerColor;
      if (model.colorPresets && model.colorPresets.pga) model.colorPresets.pga[key] = look.scoreMarkerColor;
    });
  }
  applyMarkerPreset(model, model.scoringStyle);
  syncLinkedPaletteGroups(model);
  applyTemplate2CardBoard(model);
  applyTemplate3ColorLinks(model);
  applyTemplate4ColorLinks(model);
  if (posterColors.isCustomColorMode(model)) {
    posterColors.resolveAndApplyPosterColors(model);
  }
  return model;
}

function createPosterModel(templateId, sample, brand) {
  const id = TEMPLATES[templateId] ? templateId : DEFAULT_TEMPLATE_ID;
  const template = TEMPLATES[id];
  const paletteId = template.paletteIds[0];
  const palette = PALETTES[paletteId];
  const nickname = centerOf(template.layout.nickname);
  const course = centerOf(template.layout.course);
  const date = template.layout.date ? centerOf(template.layout.date) : centerOf(template.layout.course);
  const extra = template.layout.extra ? centerOf(template.layout.extra) : centerOf(template.layout.course);
  const total = centerOf(template.layout.total);
  const scorecard = centerOf(template.layout.score);

  const model = {
    templateId: id,
    photo: null,
    photoPath: "",
    photoFileID: "",
    subject: null,
    subjectPath: "",
    subjectFileID: "",
    segmentationStatus: "idle",
    segmentationSource: "none",
    backdropMode: "photo",
    backdropId: SYSTEM_BACKDROPS[0].id,
    backdrop: null,
    subjectContact: null,
    image: { scale: 1, x: 0, y: 0, blur: 0 },
    scoreMode: "relative",
    scoreSets: {
      strokes: sample
        ? ["4", "4", "5", "3", "4", "3", "4", "4", "5", "4", "3", "4", "4", "4", "3", "4", "3", "5"]
        : Array(18).fill(""),
      relative: sample
        ? ["-1", "0", "0", "+1", "-1", "-2", "0", "+1", "0", "0", "-1", "+1", "0", "0", "-1", "0", "+1", "0"]
        : Array(18).fill("")
    },
    scoringStyle: "pga",
    highlights: sample ? [3, 6, 14] : [],
    badge: "",
    autoTotal: true,
    roundPar: 72,
    toPar: null,
    relativeTotalCleared: false,
    total: {
      value: sample ? "70" : "",
      x: total.x,
      y: total.y,
      size: template.defaults.totalSize,
      opacity: template.defaults.totalOpacity,
      aboveSubject: false,
      font: "playfair",
      italic: false,
      hidden: false,
      color: palette.total
    },
    relativeTotal: {
      value: sample ? "-2" : "",
      x: total.x,
      y: total.y + Math.round(template.defaults.totalSize * 0.42),
      size: Math.max(80, Math.round(template.defaults.totalSize * 0.42)),
      opacity: template.defaults.totalOpacity,
      font: "bodoni",
      italic: false,
      hidden: false,
      color: "#dc3f4d"
    },
    scorecard: { x: scorecard.x, y: scorecard.y, scale: 1, aboveSubject: true },
    identity: {
      nickname: {
        value: sample ? (id === "duo" || id === "template3" ? "PLAYER ONE & PLAYER TWO" : "PLAYER NAME") : "",
        x: nickname.x,
        y: nickname.y,
        size: template.defaults.nicknameSize,
        color: palette.text,
        font: "pingfang",
        italic: false,
        rotated: Boolean(template.layout.nickname && template.layout.nickname.vertical),
        rotation: defaultRegionRotation(template.layout.nickname),
        hidden: false
      },
      course: {
        value: sample ? "GOLF CLUB / CHAMPIONSHIP" : "",
        x: course.x,
        y: course.y,
        size: template.defaults.courseSize,
        color: palette.text,
        font: "pingfang",
        italic: false,
        rotated: Boolean(template.layout.course && template.layout.course.vertical),
        rotation: defaultRegionRotation(template.layout.course),
        hidden: false
      },
      date: {
        value: sample ? "2026.07.31" : "",
        x: date.x,
        y: date.y,
        size: template.defaults.dateSize,
        color: palette.text,
        font: "pingfang",
        italic: false,
        rotated: Boolean(template.layout.date && template.layout.date.vertical),
        rotation: defaultRegionRotation(template.layout.date),
        hidden: false
      },
      extra: {
        value: sample ? "ROUND ONE" : "",
        x: extra.x,
        y: extra.y,
        size: template.defaults.dateSize,
        color: palette.text,
        font: "pingfang",
        italic: false,
        rotated: Boolean(template.layout.extra && template.layout.extra.vertical),
        rotation: defaultRegionRotation(template.layout.extra),
        hidden: false
      },
      brand: brand || DEFAULT_BRAND_TEXT
    },
    brandHeader: createBrandHeader(),
    brandLogo: null,
    layoutMirrored: false,
    paletteId,
    colorMode: "template",
    customColors: {},
    colorSchemaVersion: posterColors.COLOR_SCHEMA_VERSION,
    customColorStateReady: false,
    resolvedColors: null,
    style: {
      total: palette.total,
      relativeTotalColor: "#dc3f4d",
      card: palette.card,
      cardOpacity: defaultCardOpacityPercent(template),
      line: palette.line,
      scoreText: palette.scoreText,
      markerColor: palette.total,
      text: palette.text,
      underMarker: palette.underMarker || PGA_MARKER_DEFAULTS.underMarker,
      eagleMarker: palette.eagleMarker || PGA_MARKER_DEFAULTS.eagleMarker,
      overMarker: palette.overMarker || PGA_MARKER_DEFAULTS.overMarker,
      doubleBogeyMarker: palette.doubleBogeyMarker || PGA_MARKER_DEFAULTS.doubleBogeyMarker
    },
    fonts: {
      score: id === "client1" ? "playfair" : "pingfang",
      scoreItalic: false,
      total: "playfair"
    },
    stickers: [],
    selectedStickerId: "",
    previewSubject: Boolean(sample),
    colorPresets: initColorPresets()
  };
  remapPosterFonts(model);
  applyTemplateLook(model);
  posterColors.resolveAndApplyPosterColors(model);
  return model;
}

function defaultCardOpacityPercent(template) {
  if (template && template.defaults && Number.isFinite(Number(template.defaults.cardOpacity))) {
    return Math.max(0, Math.min(100, Number(template.defaults.cardOpacity)));
  }
  if (!template) return 88;
  if (template.scoreStyle === "grid") return 16;
  if (template.scoreStyle === "sidebar") return 68;
  return 88;
}

function ensureCardOpacity(model) {
  if (!model || !model.style) return model;
  const n = Number(model.style.cardOpacity);
  if (!Number.isFinite(n)) {
    const template = TEMPLATES[model.templateId];
    model.style.cardOpacity = defaultCardOpacityPercent(template);
  } else {
    model.style.cardOpacity = Math.max(0, Math.min(100, Math.round(n)));
  }
  return model;
}

function ensureVisibility(model) {
  if (!model || typeof model !== "object") return model;
  if (model.total && typeof model.total === "object") {
    if (model.total.hidden !== true && model.total.hidden !== false) model.total.hidden = false;
  }
  if (model.relativeTotal && typeof model.relativeTotal === "object") {
    if (model.relativeTotal.hidden !== true && model.relativeTotal.hidden !== false) {
      model.relativeTotal.hidden = Boolean(model.relativeTotalCleared);
    }
  }
  if (model.identity && typeof model.identity === "object") {
    ["nickname", "course", "date", "extra"].forEach((key) => {
      const item = model.identity[key];
      if (item && typeof item === "object" && item.hidden !== true && item.hidden !== false) {
        item.hidden = false;
      }
    });
  }
  return model;
}

function ensureTotalDisplayModel(model) {
  if (!model || !model.total) return model;
  remapPosterFonts(model);
  ensureTextItalic(model);
  ensureCardOpacity(model);
  ensureVisibility(model);
  if (!model.total.font) {
    model.total.font = (model.fonts && model.fonts.total) || "playfair";
  }
  if (!model.total.color) {
    model.total.color = (model.style && model.style.total) || "#CE9224";
  }
  if (model.fonts) model.fonts.total = model.total.font;
  if (model.style) model.style.total = model.total.color;
  if (!model.relativeTotal || typeof model.relativeTotal !== "object") {
    model.relativeTotal = {
      value: "",
      x: model.total.x || 500,
      y: (model.total.y || 400) + Math.round((model.total.size || 470) * 0.42),
      size: Math.max(80, Math.round((model.total.size || 470) * 0.42)),
      opacity: model.total.opacity != null ? model.total.opacity : 88,
      font: "bodoni",
      color: (model.style && model.style.relativeTotalColor) || "#dc3f4d"
    };
  } else {
    if (!model.relativeTotal.font) model.relativeTotal.font = "bodoni";
    if (!model.relativeTotal.color) {
      model.relativeTotal.color = (model.style && model.style.relativeTotalColor) || "#dc3f4d";
    }
    if (!Number.isFinite(Number(model.relativeTotal.size))) {
      model.relativeTotal.size = Math.max(80, Math.round((model.total.size || 470) * 0.42));
    }
    if (!Number.isFinite(Number(model.relativeTotal.x))) model.relativeTotal.x = model.total.x;
    if (!Number.isFinite(Number(model.relativeTotal.y))) {
      model.relativeTotal.y = (model.total.y || 0) + Math.round((model.total.size || 470) * 0.42);
    }
    if (model.relativeTotal.opacity == null) {
      model.relativeTotal.opacity = model.total.opacity != null ? model.total.opacity : 88;
    }
  }
  if (model.style && !model.style.markerColor) {
    model.style.markerColor = model.style.total || "#CE9224";
  }
  if (model.style) model.style.relativeTotalColor = model.relativeTotal.color;
  ensureColorPresets(model);
  if (!posterColors.isCustomColorMode(model)) {
    applyMarkerPreset(model, model.scoringStyle);
  }
  return model;
}

function paletteLinksActive(model) {
  const template = TEMPLATES[model && model.templateId];
  return Boolean(template && template.colorLinks && model && model.paletteId && model.paletteId !== "custom");
}

function syncLinkedPaletteGroups(model) {
  if (!paletteLinksActive(model) || !model.style) return model;
  if (model.templateId === "template4") {
    applyTemplate4ColorLinks(model);
    return model;
  }
  const template = TEMPLATES[model && model.templateId];
  const totalColor = (model.total && model.total.color) || model.style.total;
  if (totalColor) applyTotalGroupColor(model, totalColor);
  if (template && template.scoreTextLinksToRelative) {
    applyTemplate3ColorLinks(model);
    return model;
  }
  const accent = (model.relativeTotal && model.relativeTotal.color)
    || (model.identity && model.identity.course && model.identity.course.color)
    || model.style.relativeTotalColor
    || model.style.summaryLabelColor;
  if (accent) {
    if (model.relativeTotal) model.relativeTotal.color = accent;
    model.style.relativeTotalColor = accent;
    model.style.summaryLabelColor = accent;
    if (model.identity && model.identity.course) model.identity.course.color = accent;
    if (model.identity && model.identity.date) model.identity.date.color = accent;
  }
  return model;
}

function applySingleColor(model, source, color) {
  if (!model || !color) return model;
  if (!model.style) model.style = {};
  if (source === "total") {
    if (model.total) model.total.color = color;
    model.style.total = color;
    return model;
  }
  if (source === "line") {
    model.style.line = color;
    return model;
  }
  if (source === "relativeTotalColor") {
    if (model.relativeTotal) model.relativeTotal.color = color;
    model.style.relativeTotalColor = color;
    return model;
  }
  if (source === "course" || source === "date" || source === "nickname" || source === "extra") {
    if (model.identity && model.identity[source]) model.identity[source].color = color;
    return model;
  }
  model.style[source] = color;
  return model;
}

function applyTotalGroupColor(model, color) {
  applySingleColor(model, "total", color);
  const template = TEMPLATES[model && model.templateId];
  if (template && template.boardLinksToTotal) {
    if (model.style) model.style.card = color;
  } else {
    applySingleColor(model, "line", color);
  }
  if (!model.style) return model;
  model.style.extremeScoreColor = color;
  if (markersFollowTotal(model)) {
    MARKER_STYLE_KEYS.forEach((key) => {
      model.style[key] = color;
      if (model.colorPresets && model.colorPresets.pga) model.colorPresets.pga[key] = color;
    });
  }
  applyTemplate3ColorLinks(model);
  applyTemplate4ColorLinks(model);
  return model;
}

function resolvePalette(template, paletteId) {
  const palette = PALETTES[paletteId];
  if (!palette) return null;
  const override = template && template.paletteOverrides && template.paletteOverrides[paletteId];
  return override ? Object.assign({}, palette, override) : palette;
}

function applyLinkedColor(model, source, color) {
  if (!model || !color) return model;
  if (!paletteLinksActive(model)) {
    applySingleColor(model, source, color);
    return model;
  }
  const template = TEMPLATES[model && model.templateId];
  if (source === "total" || (source === "card" && template && template.boardLinksToTotal)) {
    applyTotalGroupColor(model, color);
    return model;
  }
  if (source === "scoreText" && template && template.scoreTextLinksToTotal) {
    applyTotalGroupColor(model, color);
    return model;
  }
  if (source === "line" && !(template && template.scoreTextLinksToRelative)) {
    applyTotalGroupColor(model, color);
    return model;
  }
  if (markersFollowTotal(model) && (
    source === "pgaUnder"
    || source === "pgaOver"
    || MARKER_STYLE_KEYS.indexOf(source) >= 0
  )) {
    applyTotalGroupColor(model, color);
    return model;
  }
  if (template && template.scoreTextLinksToRelative && isTemplate3ScoreGroupSource(source)) {
    applySingleColor(model, "relativeTotalColor", color);
    applySingleColor(model, "scoreText", color);
    applyTemplate3ColorLinks(model);
    return model;
  }
  if (source === "relativeTotalColor" || source === "course" || source === "date") {
    if (model.templateId === "template4") {
      applySingleColor(model, source, color);
      return model;
    }
    applySingleColor(model, "relativeTotalColor", color);
    applySingleColor(model, "course", color);
    applySingleColor(model, "date", color);
    if (model.style) model.style.summaryLabelColor = color;
    applyTemplate3ColorLinks(model);
    return model;
  }
  applySingleColor(model, source, color);
  return model;
}

function applyPalette(model, paletteId) {
  if (paletteId === "custom") {
    return posterColors.enterCustomColorMode(model);
  }
  posterColors.enterTemplateColorMode(model);
  const template = TEMPLATES[model.templateId];
  const palette = resolvePalette(template, paletteId);
  if (!palette) return model;
  model.paletteId = paletteId;
  model.style.total = palette.total;
  if (model.total) model.total.color = palette.total;
  if (model.templateId !== "template4") model.style.card = palette.card;
  else if (palette.card) model.style.card = palette.card;
  model.style.line = palette.line;
  model.style.scoreText = palette.scoreText;
  model.style.text = palette.text;
  ["nickname", "course", "date", "extra"].forEach((key) => {
    model.identity[key].color = palette.text;
  });
  if (palette.scoringStyle === "pga" || palette.scoringStyle === "dp") {
    model.scoringStyle = palette.scoringStyle;
  }
  applyMarkerPreset(model, model.scoringStyle);
  MARKER_STYLE_KEYS.forEach((key) => {
    if (!palette[key]) return;
    if (model.colorPresets && model.colorPresets.pga) {
      model.colorPresets.pga[key] = palette[key];
    }
    if (model.scoringStyle !== "dp") model.style[key] = palette[key];
  });
  if (palette.scoreText) model.style.scoreText = palette.scoreText;
  if (template && template.colorLinks) {
    const accent = template.scoreTextLinksToRelative
      ? (palette.scoreText || palette.accent || "#ffffff")
      : (palette.accent || palette.line);
    if (model.relativeTotal) model.relativeTotal.color = accent;
    model.style.relativeTotalColor = accent;
    model.style.summaryLabelColor = accent;
    syncLinkedPaletteGroups(model);
    applyTemplate3ColorLinks(model);
    applyTemplate4ColorLinks(model);
  }
  applyPaletteCardOpacity(model);
  applyPaletteTypography(model);
  applyPaletteBackdrop(model);
  posterColors.resolveAndApplyPosterColors(model);
  return model;
}

function switchTemplate(previous, templateId, brand) {
  const next = createPosterModel(templateId, false, brand || previous.identity.brand);
  next.photo = previous.photo;
  next.photoPath = previous.photoPath;
  next.photoFileID = previous.photoFileID || "";
  next.subject = previous.subject;
  next.subjectPath = previous.subjectPath || "";
  next.subjectFileID = previous.subjectFileID || "";
  next.segmentationStatus = previous.segmentationStatus;
  next.segmentationSource = previous.segmentationSource;
  next.backdropMode = previous.backdropMode === "system" ? "system" : "photo";
  next.backdropId = previous.backdropId || SYSTEM_BACKDROPS[0].id;
  next.backdrop = previous.backdrop;
  next.subjectContact = previous.subjectContact || null;
  next.subjectShadow = previous.subjectShadow || null;
  next.image = Object.assign({}, previous.image);
  next.scoreMode = previous.scoreMode;
  next.scoreSets = {
    strokes: previous.scoreSets.strokes.slice(),
    relative: previous.scoreSets.relative.slice()
  };
  next.holePars = Array.isArray(previous.holePars) ? previous.holePars.slice() : [];
  next.scoringStyle = previous.scoringStyle;
  next.highlights = previous.highlights.slice();
  next.badge = previous.badge;
  next.autoTotal = true;
  next.roundPar = previous.roundPar;
  next.toPar = previous.toPar;
  next.total.hidden = Boolean(previous.total && previous.total.hidden);
  next.relativeTotal.hidden = previous.relativeTotal && (previous.relativeTotal.hidden === true || previous.relativeTotal.hidden === false)
    ? previous.relativeTotal.hidden
    : Boolean(previous.relativeTotalCleared);
  next.relativeTotalCleared = next.relativeTotal.hidden;
  next.style.relativeTotalColor = previous.style.relativeTotalColor || previous.style.total;
  next.style.cardOpacity = previous.style && Number.isFinite(Number(previous.style.cardOpacity))
    ? previous.style.cardOpacity
    : next.style.cardOpacity;
  next.total.value = previous.total.value;
  next.total.aboveSubject = previous.total.aboveSubject;
  next.total.font = previous.total.font || next.total.font;
  next.total.italic = resolveItalic(previous.total && previous.total.italic, next.total.italic);
  next.total.color = previous.total.color || next.total.color;
  next.fonts.total = next.total.font;
  next.fonts.scoreItalic = resolveItalic(previous.fonts && previous.fonts.scoreItalic, next.fonts.scoreItalic);
  next.relativeTotal = Object.assign({}, next.relativeTotal, previous.relativeTotal || {});
  next.relativeTotal.italic = resolveItalic(previous.relativeTotal && previous.relativeTotal.italic, next.relativeTotal.italic);
  if (previous.templateId === "template3" && templateId !== "template3") {
    next.relativeTotal.hidden = false;
    next.relativeTotalCleared = false;
  }
  if (previous.templateId === "template4" && templateId !== "template4") {
    next.relativeTotal.hidden = false;
    next.relativeTotalCleared = false;
    next.scoringStyle = "pga";
    applyMarkerPreset(next, "pga");
  }
  next.colorPresets = previous.colorPresets
    ? {
      pga: Object.assign({}, previous.colorPresets.pga),
      dp: Object.assign({}, previous.colorPresets.dp)
    }
    : initColorPresets();
  next.customColors = previous.customColors && typeof previous.customColors === "object"
    ? Object.assign({}, previous.customColors)
    : {};
  next.colorMode = previous.colorMode === "custom" || previous.paletteId === "custom" ? "custom" : "template";
  next.colorSchemaVersion = Number(previous.colorSchemaVersion) || 0;
  next.customColorStateReady = false;
  next.resolvedColors = null;
  if (next.colorMode === "custom") next.paletteId = "custom";
  ensureTotalDisplayModel(next);
  next.identity.nickname.value = previous.identity.nickname.value;
  next.identity.course.value = previous.identity.course.value;
  next.identity.date.value = previous.identity.date.value;
  next.identity.extra.value = previous.identity.extra.value;
  next.identity.brand = previous.identity.brand;
  ensureBrandHeader(previous);
  next.brandHeader = Object.assign(createBrandHeader(), previous.brandHeader || {});
  next.brandLogo = previous.brandLogo || null;
  ["nickname", "course", "date", "extra"].forEach((key) => {
    next.identity[key].italic = resolveItalic(previous.identity[key] && previous.identity[key].italic, next.identity[key].italic);
    if (previous.identity[key] && Number.isFinite(Number(previous.identity[key].rotation))) {
      applyIdentityRotation(next.identity[key], Number(previous.identity[key].rotation));
    } else if (previous.identity[key] && (previous.identity[key].rotated === true || previous.identity[key].rotated === false)) {
      applyIdentityRotation(next.identity[key], previous.identity[key].rotated ? 90 : 0);
    }
    if (previous.identity[key] && previous.identity[key].font) {
      next.identity[key].font = previous.identity[key].font;
    }
    next.identity[key].hidden = Boolean(previous.identity[key] && previous.identity[key].hidden);
  });
  next.stickers = previous.stickers;
  next.selectedStickerId = previous.selectedStickerId;
  applyTemplateLook(next);
  if (next.colorMode === "custom") {
    next.paletteId = "custom";
    posterColors.resolveAndApplyPosterColors(next);
  }
  return next;
}

function templateCards(language) {
  const thumbBase = "https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/poster-bj/";
  return Object.keys(TEMPLATES).map((id) => {
    const template = TEMPLATES[id];
    const palette = resolvePalette(template, template.paletteIds[0]) || PALETTES[template.paletteIds[0]];
    const numbered = id === "template1" || id === "template2" || id === "template3" || id === "template4";
    return {
      id,
      name: language === "en" ? template.en : template.zh,
      description: language === "en" ? template.descriptionEn : template.descriptionZh,
      tone: template.tone,
      direction: template.layout.score.direction,
      total: palette.total,
      card: palette.card,
      line: palette.line,
      thumb: numbered ? thumbBase + "poster-thumb-" + id + ".jpg" : ""
    };
  });
}

module.exports = {
  POSTER_WIDTH,
  POSTER_HEIGHT,
  BRAND_HEIGHT,
  EVENT_BRAND_LOGO_PATH,
  EVENT_BRAND_TITLE,
  DEFAULT_BRAND_TEXT,
  DEFAULT_BRAND_ALIGN,
  createBrandHeader,
  ensureBrandHeader,
  normalizeBrandAlign,
  MAX_STICKERS,
  PALETTES,
  COLOR_OPTIONS,
  PGA_MARKER_DEFAULTS,
  DP_MARKER_DEFAULTS,
  MARKER_STYLE_KEYS,
  FONT_OPTIONS,
  FONT_FALLBACK_MAP,
  GOOGLE_FONT_FACES,
  TEMPLATES,
  DEFAULT_TEMPLATE_ID,
  SYSTEM_BACKDROPS,
  centerOf,
  identityRotation,
  nextIdentityRotation,
  applyIdentityRotation,
  mirrorPosterLayout,
  createPosterModel,
  initColorPresets,
  ensureColorPresets,
  applyMarkerPreset,
  ensureTotalDisplayModel,
  applyPalette,
  applyLinkedColor,
  resolvePalette,
  paletteLinksActive,
  markersFollowTotal,
  extremeScoresFollowTotal,
  syncLinkedPaletteGroups,
  switchTemplate,
  templateCards,
  normalizeFontId,
  remapPosterFonts
};
