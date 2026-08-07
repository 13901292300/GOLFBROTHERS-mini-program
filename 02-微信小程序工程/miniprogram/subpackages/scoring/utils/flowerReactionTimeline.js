/**
 * Demo：flower reaction timeline v3 / fly-entry-fix-v2（仅 demo-weekend-amateur）
 *
 * 流程：flower_enter → flower_hit_avatar → flower_bloom → flower_ring
 * 源：音频文件/送花.mov → flower_send.wav（有效段约 220–900ms）
 * 声音：flower_bloom / 到达瞬间（飞行无声；enter 无声）
 *
 * 颜色：weighted random（红色系为主），非 uniform。
 */

const FLOWER_AUDIO_CLIP = {
  source: '送花.mov',
  startMs: 220,
  endMs: 900,
  file: 'flower_send.wav'
};

/** 至少 6–8 种花朵类型（emoji，无新图） */
const FLOWER_TYPES = [
  { type: 'rose', emoji: '🌹', label: 'rose', family: 'red' },
  { type: 'tulip', emoji: '🌷', label: 'tulip', family: 'pink' },
  { type: 'sunflower', emoji: '🌻', label: 'sunflower', family: 'yellow' },
  { type: 'cherry', emoji: '🌸', label: 'cherry blossom', family: 'pink' },
  { type: 'hibiscus', emoji: '🌺', label: 'hibiscus', family: 'red' },
  { type: 'bouquet', emoji: '💐', label: 'bouquet', family: 'red' },
  { type: 'daisy', emoji: '🌼', label: 'daisy', family: 'yellow' },
  { type: 'leaf', emoji: '🌿', label: 'small leaf flower', family: 'green' }
];

/**
 * 颜色权重配置（v3）
 * 红色系 60% / 粉色系 20% / 白 10% / 黄 5% / 紫蓝 5%
 */
const FLOWER_COLOR_WEIGHTS = [
  // 红色系 60%
  { key: 'red', family: 'red', weight: 28, filter: 'hue-rotate(0deg) saturate(1.22)' },
  { key: 'deep_red', family: 'red', weight: 14, filter: 'hue-rotate(350deg) saturate(1.35) brightness(0.92)' },
  { key: 'rose', family: 'red', weight: 10, filter: 'hue-rotate(330deg) saturate(1.28)' },
  { key: 'red_pink', family: 'red', weight: 8, filter: 'hue-rotate(340deg) saturate(1.2) brightness(1.05)' },
  // 粉色系 20%
  { key: 'pink', family: 'pink', weight: 12, filter: 'hue-rotate(310deg) saturate(1.18)' },
  { key: 'light_pink', family: 'pink', weight: 8, filter: 'hue-rotate(320deg) saturate(0.95) brightness(1.18)' },
  // 白 10%
  { key: 'white', family: 'white', weight: 10, filter: 'grayscale(0.4) brightness(1.38) saturate(0.35)' },
  // 黄 5%
  { key: 'yellow', family: 'yellow', weight: 5, filter: 'hue-rotate(48deg) saturate(1.28)' },
  // 紫/蓝 5%
  { key: 'purple', family: 'cool', weight: 3, filter: 'hue-rotate(268deg) saturate(1.25)' },
  { key: 'blue', family: 'cool', weight: 2, filter: 'hue-rotate(198deg) saturate(1.18)' }
];

/** 兼容旧导出名：颜色列表（无权重语义） */
const FLOWER_COLORS = FLOWER_COLOR_WEIGHTS.map(function (c) {
  return { key: c.key, filter: c.filter, family: c.family };
});

/** 花束组合权重 */
const BOUQUET_MODE_WEIGHTS = [
  { mode: 'red_main', weight: 70 }, // 红玫瑰主体 + 少量点缀
  { mode: 'red_pink_mix', weight: 20 }, // 红粉混合
  { mode: 'special', weight: 10 } // 特殊色花束
];

/** CSS 花瓣色（结束飘落） */
const PETAL_COLORS = {
  red: '#e11d48',
  deep_red: '#9f1239',
  rose: '#e11d68',
  red_pink: '#f43f5e',
  pink: '#f472b6',
  light_pink: '#fbcfe8',
  white: '#f8fafc',
  yellow: '#fbbf24',
  purple: '#c084fc',
  blue: '#60a5fa'
};

const FLOWER_TIMING = {
  self: {
    flyAt: 30,
    flyMs: 1200,
    bloomLeadMs: 0,
    ringExpandMs: 520,
    petalsAtMs: 2200,
    fadeAtMs: 3400,
    cleanupAfterFadeMs: 700
  },
  observer: {
    flyAt: 40,
    /** flower-observer-effect-balance-v2：飞入 500–800ms */
    flyMs: 680,
    bloomLeadMs: 0,
    ringExpandMs: 360,
    petalsAtMs: 900,
    /** 环绕停留约 1.5–2s 后淡出 */
    fadeAtMs: 1800,
    cleanupAfterFadeMs: 420,
    /** 花环主花 6–10；花瓣 3–8（仅 Observer） */
    wreathCountMin: 6,
    wreathCountMax: 10,
    petalCountMin: 3,
    petalCountMax: 8,
    /** flower-observer-flower-size-adjust-v3：主花放大，贴近头像边缘 */
    flowerScaleMin: 1.05,
    flowerScaleMax: 1.45,
    /** 相对头像半径外扩（px），形成贴边一圈 */
    wreathEdgePad: 14,
    flowerFontBase: 30
  }
};

function _rand(min, max) {
  return min + Math.random() * (max - min);
}

function _randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function _pick(arr) {
  if (!arr || !arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 权重随机 */
function _pickWeighted(items) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return null;
  let total = 0;
  for (let i = 0; i < list.length; i++) {
    total += Math.max(0, Number(list[i].weight) || 0);
  }
  if (total <= 0) return list[0];
  let r = Math.random() * total;
  for (let j = 0; j < list.length; j++) {
    r -= Math.max(0, Number(list[j].weight) || 0);
    if (r <= 0) return list[j];
  }
  return list[list.length - 1];
}

function _colorByKey(key) {
  for (let i = 0; i < FLOWER_COLOR_WEIGHTS.length; i++) {
    if (FLOWER_COLOR_WEIGHTS[i].key === key) return FLOWER_COLOR_WEIGHTS[i];
  }
  return FLOWER_COLOR_WEIGHTS[0];
}

function _colorsByFamily(family) {
  const out = [];
  for (let i = 0; i < FLOWER_COLOR_WEIGHTS.length; i++) {
    if (FLOWER_COLOR_WEIGHTS[i].family === family) out.push(FLOWER_COLOR_WEIGHTS[i]);
  }
  return out;
}

/**
 * 花束组合模式
 * @returns {'red_main'|'red_pink_mix'|'special'}
 */
function pickBouquetMode() {
  const hit = _pickWeighted(BOUQUET_MODE_WEIGHTS);
  return hit && hit.mode ? hit.mode : 'red_main';
}

/**
 * 按花束模式取色（权重随机，非 uniform）
 * @param {object=} opts
 * @param {string=} opts.mode
 * @param {boolean=} opts.forceRed
 * @param {boolean=} opts.accent 点缀色（允许非红）
 */
function pickWeightedFlowerColor(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const mode = o.mode || 'red_main';

  if (o.forceRed) {
    return _pickWeighted(_colorsByFamily('red')) || _colorByKey('red');
  }

  if (mode === 'red_main') {
    // 主体红：约 82% 红 / 10% 粉 / 5% 白 / 3% 其它点缀
    if (o.accent) {
      const accentPool = [
        { key: 'pink', weight: 35 },
        { key: 'light_pink', weight: 20 },
        { key: 'white', weight: 25 },
        { key: 'yellow', weight: 10 },
        { key: 'purple', weight: 6 },
        { key: 'blue', weight: 4 }
      ];
      const a = _pickWeighted(accentPool);
      return _colorByKey(a && a.key ? a.key : 'pink');
    }
    const mainPool = [
      { key: 'red', weight: 40 },
      { key: 'deep_red', weight: 22 },
      { key: 'rose', weight: 16 },
      { key: 'red_pink', weight: 12 },
      { key: 'pink', weight: 6 },
      { key: 'white', weight: 4 }
    ];
    const m = _pickWeighted(mainPool);
    return _colorByKey(m && m.key ? m.key : 'red');
  }

  if (mode === 'red_pink_mix') {
    const mixPool = [
      { key: 'red', weight: 28 },
      { key: 'deep_red', weight: 12 },
      { key: 'rose', weight: 14 },
      { key: 'red_pink', weight: 14 },
      { key: 'pink', weight: 18 },
      { key: 'light_pink', weight: 10 },
      { key: 'white', weight: 4 }
    ];
    const m = _pickWeighted(mixPool);
    return _colorByKey(m && m.key ? m.key : 'red');
  }

  // special：允许特殊色，但仍保留少量红色以免完全丢掉主视觉
  const specialPool = [
    { key: 'white', weight: 26 },
    { key: 'yellow', weight: 18 },
    { key: 'purple', weight: 16 },
    { key: 'blue', weight: 12 },
    { key: 'pink', weight: 12 },
    { key: 'red', weight: 10 },
    { key: 'light_pink', weight: 6 }
  ];
  const s = _pickWeighted(specialPool);
  return _colorByKey(s && s.key ? s.key : 'white');
}

/**
 * 按模式挑花种：红色主体优先玫瑰类
 */
function pickFlowerTypeForMode(mode, isLead) {
  if (mode === 'red_main' || (mode === 'red_pink_mix' && isLead)) {
    const redTypes = FLOWER_TYPES.filter(function (t) {
      return t.family === 'red';
    });
    // 红玫瑰权重更高
    const weighted = redTypes.map(function (t) {
      return {
        type: t.type,
        emoji: t.emoji,
        label: t.label,
        family: t.family,
        weight: t.type === 'rose' ? 55 : t.type === 'bouquet' ? 25 : 20
      };
    });
    const hit = _pickWeighted(weighted);
    if (hit) {
      return {
        type: hit.type,
        emoji: hit.emoji,
        label: hit.label,
        family: hit.family
      };
    }
  }
  if (mode === 'red_pink_mix') {
    const pinkish = FLOWER_TYPES.filter(function (t) {
      return t.family === 'red' || t.family === 'pink';
    });
    return _pick(pinkish) || FLOWER_TYPES[0];
  }
  return _pick(FLOWER_TYPES) || FLOWER_TYPES[0];
}

/**
 * 随机一朵花参数（颜色走权重；可传入花束模式）
 * @param {object=} opts
 * @param {string=} opts.mode bouquet mode
 * @param {boolean=} opts.forceRed
 * @param {boolean=} opts.accent
 * @param {boolean=} opts.isLead
 * @param {number=} opts.scaleMin
 * @param {number=} opts.scaleMax
 * @param {number=} opts.delayMs
 */
function pickRandomFlower(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const mode = o.mode || pickBouquetMode();
  const typeInfo =
    o.typeInfo ||
    pickFlowerTypeForMode(mode, !!o.isLead) ||
    FLOWER_TYPES[0];
  const colorInfo =
    pickWeightedFlowerColor({
      mode: mode,
      forceRed: !!o.forceRed || !!o.isLead,
      accent: !!o.accent
    }) || _colorByKey('red');
  const scaleMin = o.scaleMin != null ? Number(o.scaleMin) : 0.6;
  const scaleMax = o.scaleMax != null ? Number(o.scaleMax) : 1.4;
  const scale = Number(_rand(scaleMin, scaleMax).toFixed(2));
  const rotate = Math.round(_rand(-40, 40));
  const delay = o.delayMs != null ? Number(o.delayMs) : _randInt(0, 420);
  return {
    type: typeInfo.type,
    emoji: typeInfo.emoji,
    color: colorInfo.key,
    family: colorInfo.family || 'red',
    scale: scale,
    rotate: rotate,
    delay: delay,
    filter: colorInfo.filter,
    petalColor: PETAL_COLORS[colorInfo.key] || '#e11d48',
    bouquetMode: mode
  };
}

/**
 * 是否点缀色（非主体）
 * red_main：约 18% 点缀；red_pink_mix：较少特殊点缀；special：不强制
 */
function _shouldAccent(mode, index, total) {
  if (mode === 'special') return false;
  if (mode === 'red_pink_mix') return index > 0 && Math.random() < 0.08;
  // red_main：前 70% 强制偏红，后段少量点缀
  if (index === 0) return false;
  if (index < Math.ceil(total * 0.7)) return Math.random() < 0.08;
  return Math.random() < 0.45;
}

/**
 * 生成一批花束（先定组合模式，再按权重上色）
 */
function buildRandomFlowerBundle(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const minCount = o.minCount != null ? Number(o.minCount) : 20;
  const maxCount = o.maxCount != null ? Number(o.maxCount) : 40;
  const count = _randInt(
    Math.max(6, minCount),
    Math.max(Math.max(6, minCount), maxCount)
  );
  const mode = o.mode || pickBouquetMode();
  const list = [];
  for (let i = 0; i < count; i++) {
    const accent = _shouldAccent(mode, i, count);
    const f = pickRandomFlower({
      mode: mode,
      isLead: i === 0,
      forceRed: mode === 'red_main' && !accent,
      accent: accent,
      delayMs: Math.round(i * _rand(12, 28) + _rand(0, 40))
    });
    list.push(
      Object.assign({ id: 'fl-' + i + '-' + Date.now().toString(36) }, f)
    );
  }
  return list;
}

/**
 * Observer 自然花环：仍以红色为主视觉中心。
 * balance-v2：6–10 朵；size-adjust-v3：主花放大约 1.5–2×，贴边环绕。
 */
function buildNaturalWreathItems(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const baseR = Number(o.baseR) || 36;
  const countMin =
    o.countMin != null ? Number(o.countMin) : FLOWER_TIMING.observer.wreathCountMin;
  const countMax =
    o.countMax != null ? Number(o.countMax) : FLOWER_TIMING.observer.wreathCountMax;
  const count =
    o.count != null ? Number(o.count) : _randInt(countMin, countMax);
  const n = Math.max(6, Math.min(12, count));
  const mode = o.mode || pickBouquetMode();
  const scaleMin =
    o.scaleMin != null
      ? Number(o.scaleMin)
      : FLOWER_TIMING.observer.flowerScaleMin != null
        ? FLOWER_TIMING.observer.flowerScaleMin
        : 1.05;
  const scaleMax =
    o.scaleMax != null
      ? Number(o.scaleMax)
      : FLOWER_TIMING.observer.flowerScaleMax != null
        ? FLOWER_TIMING.observer.flowerScaleMax
        : 1.45;
  const radiusJitterMin = o.radiusJitterMin != null ? Number(o.radiusJitterMin) : 0.96;
  const radiusJitterMax = o.radiusJitterMax != null ? Number(o.radiusJitterMax) : 1.06;
  // 特殊模式也保证至少约一半偏红，维持红色中心感（权重规则不变）
  const items = [];
  for (let i = 0; i < n; i++) {
    const accent = _shouldAccent(mode, i, n);
    const forceRed =
      mode === 'special'
        ? i < Math.ceil(n * 0.5)
        : mode === 'red_main' && !accent;
    const f = pickRandomFlower({
      mode: mode === 'special' && forceRed ? 'red_main' : mode,
      isLead: i === 0,
      forceRed: forceRed,
      accent: accent && !forceRed,
      scaleMin: scaleMin,
      scaleMax: scaleMax,
      delayMs: Math.round(i * 22 + _rand(0, 40))
    });
    const deg = (360 / n) * i + _rand(-8, 8);
    // 半径更均匀外圈，减少堆叠遮挡头像
    const r = baseR * _rand(radiusJitterMin, radiusJitterMax);
    items.push({
      id: 'wreath-' + i + '-' + Date.now().toString(36),
      type: f.type,
      emoji: f.emoji,
      color: f.color,
      family: f.family,
      scale: f.scale,
      rotate: f.rotate,
      delay: (f.delay / 1000).toFixed(3) + 's',
      delayMs: f.delay,
      filter: f.filter,
      petalColor: f.petalColor,
      bouquetMode: mode,
      deg: Number(deg.toFixed(1)),
      radius: Number(r.toFixed(1)),
      batch: i < Math.ceil(n * 0.55) ? 1 : i < Math.ceil(n * 0.85) ? 2 : 3
    });
  }
  return items;
}

/**
 * 花瓣飘落：同样偏红权重。
 * count 可低至 3（Observer balance）；未传时默认 10–18（Self 兼容）。
 */
function buildFallingPetals(count, opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const mode = o.mode || 'red_main';
  const n =
    count != null
      ? Math.max(3, Math.min(24, Number(count)))
      : _randInt(10, 18);
  const list = [];
  const slow = !!o.slow;
  for (let i = 0; i < n; i++) {
    const colorInfo =
      pickWeightedFlowerColor({
        mode: mode,
        forceRed: mode !== 'special' && Math.random() < 0.55,
        accent: mode === 'red_main' && Math.random() < 0.25
      }) || _colorByKey('red');
    const dx = _rand(slow ? -28 : -42, slow ? 28 : 42);
    const dy = _rand(slow ? 42 : 36, slow ? 96 : 110);
    const rot = _rand(slow ? -70 : -120, slow ? 70 : 160);
    const fallMs = slow ? _randInt(1400, 2200) : _randInt(900, 1800);
    const delay = _randInt(0, slow ? 200 : 280);
    const w = _rand(slow ? 4 : 5, slow ? 7 : 9);
    const h = _rand(slow ? 6 : 7, slow ? 10 : 12);
    list.push({
      id: 'petal-' + i + '-' + Date.now().toString(36),
      color: colorInfo.key,
      petalColor: PETAL_COLORS[colorInfo.key] || '#e11d48',
      dx: Number(dx.toFixed(1)),
      dy: Number(dy.toFixed(1)),
      rot: Math.round(rot),
      fallMs: fallMs,
      delay: delay,
      w: Number(w.toFixed(1)),
      h: Number(h.toFixed(1))
    });
  }
  return list;
}

/**
 * @param {'self'|'observer'} mode
 */
function buildFlowerReactionTimeline(mode) {
  const m = mode === 'observer' ? 'observer' : 'self';
  const t = FLOWER_TIMING[m];
  const flyAt = t.flyAt;
  const hitAt = flyAt + t.flyMs;
  const bloomAt = hitAt + t.bloomLeadMs;
  const ringAt = bloomAt + t.ringExpandMs;
  const petalsAt = bloomAt + t.petalsAtMs;
  const fadeAt = bloomAt + t.fadeAtMs;
  const cleanupAt = fadeAt + t.cleanupAfterFadeMs;

  return [
    /** 边缘飞入（不可跳过） */
    { time: flyAt, action: 'flower_enter', duration: t.flyMs },
    /** 兼容旧节点名 */
    { time: flyAt, action: 'flower_fly', duration: t.flyMs },
    { time: hitAt, action: 'flower_hit_avatar' },
    {
      time: bloomAt,
      action: 'flower_bloom',
      sound: 'flower_send',
      volume: 0.92,
      seekMs: 0
    },
    { time: ringAt, action: 'flower_ring' },
    { time: ringAt, action: 'flower_ring_expand' },
    { time: petalsAt, action: 'flower_petals_fall' },
    { time: fadeAt, action: 'flower_fade' },
    { time: cleanupAt, action: 'cleanup' }
  ];
}

module.exports = {
  FLOWER_AUDIO_CLIP: FLOWER_AUDIO_CLIP,
  FLOWER_TYPES: FLOWER_TYPES,
  FLOWER_COLORS: FLOWER_COLORS,
  FLOWER_COLOR_WEIGHTS: FLOWER_COLOR_WEIGHTS,
  BOUQUET_MODE_WEIGHTS: BOUQUET_MODE_WEIGHTS,
  PETAL_COLORS: PETAL_COLORS,
  FLOWER_TIMING: FLOWER_TIMING,
  pickBouquetMode: pickBouquetMode,
  pickWeightedFlowerColor: pickWeightedFlowerColor,
  pickRandomFlower: pickRandomFlower,
  buildRandomFlowerBundle: buildRandomFlowerBundle,
  buildNaturalWreathItems: buildNaturalWreathItems,
  buildFallingPetals: buildFallingPetals,
  buildFlowerReactionTimeline: buildFlowerReactionTimeline
};
