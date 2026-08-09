/**
 * Demo：flower reaction timeline（仅 demo-weekend-amateur）
 *
 * Observer bloom-flower-ring-final-v7：
 *   flower_enter → flower_hit_avatar → flower_bloom
 *   → 盛开完整花朵花环（flowerRingConfig 圆周排布）
 *   → flower_ring / expand → flower_petals_fall（辅助）→ fade
 * Self：仍为屏中花雨（本文件 Self timing 不变）。
 *
 * 源：音频文件/送花.mov → flower_send.wav（有效段约 220–900ms）
 * 声音：flower_bloom / 到达瞬间（飞行无声；enter 无声）
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
    ringExpandMs: 340,
    petalsAtMs: 900,
    /** 环绕停留约 1.5–2s 后淡出 */
    fadeAtMs: 1800,
    cleanupAfterFadeMs: 420,
    /** 结束飘落花瓣 3–8（辅助；主体是开放花朵花环） */
    petalCountMin: 3,
    petalCountMax: 8,
    /**
     * flower-observer-bloom-flower-ring-final-v7：
     * 盛开完整花朵花环 8–12；尺寸≈头像宽 20–30%；圆周紧凑小间隙
     */
    wreathCountMin: 8,
    wreathCountMax: 12,
    /** flower_ring_expand 轻微外扩（保持连续） */
    flowerSpread: 1.05,
    /** 兼容旧字段 */
    wreathEdgePad: 2,
    flowerGapFill: 0.9,
    flowerSizeMin: 0,
    flowerSizeMax: 0
  }
};

/**
 * Observer 花环主配置（v7）
 * 用圆周算法排布盛开完整花朵；禁止手工散点。
 */
const FLOWER_RING_DEFAULTS = {
  countMin: 8,
  countMax: 12,
  /** 单朵花相对头像宽度 */
  flowerSizeRatioMin: 0.2,
  flowerSizeRatioMax: 0.3,
  /** 弧长占用：花径/槽位；越大越密（小间隙、不重叠） */
  gapFill: 0.9,
  /** 头像外缘到花体内缘的最小净空（px） */
  edgeClearance: 2,
  /** 相邻花最小间隙（px） */
  gapMin: 1.2,
  /** 相邻花最大间隙相对花径（过大则加朵数收紧） */
  gapMaxRatio: 0.28,
  expandSpread: 1.05,
  /** 目标色比：红≥60% / 粉≈20% / 其它少量 */
  colorRatio: { red: 0.62, pink: 0.2, other: 0.18 }
};

/** 花环用完整盛开花朵（可见花瓣/花心；排除花束/叶子碎点缀） */
const OPEN_BLOOM_FLOWER_TYPES = FLOWER_TYPES.filter(function (t) {
  return (
    t.type === 'rose' ||
    t.type === 'hibiscus' ||
    t.type === 'cherry' ||
    t.type === 'daisy' ||
    t.type === 'sunflower' ||
    t.type === 'tulip'
  );
});

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
 * 由 flowerRingConfig 推导 slot / gap（圆周等分）。
 */
function computeOpenFlowerRingSize(radius, count, flowerSize) {
  const n = Math.max(8, Math.min(12, Number(count) || 10));
  const R = Math.max(20, Number(radius) || 36);
  const size = Math.max(8, Number(flowerSize) || 16);
  const slot = (2 * Math.PI * R) / n;
  return {
    count: n,
    radius: Number(R.toFixed(1)),
    size: Number(size.toFixed(1)),
    flowerSize: Number(size.toFixed(1)),
    slot: Number(slot.toFixed(2)),
    gap: Number(Math.max(0, slot - size).toFixed(2))
  };
}

/**
 * 建立 Observer 花环配置（v7）。
 * @returns {{
 *   count:number, radius:number, flowerSize:number,
 *   colors:object, gap:number, gapFill:number, avatarR:number, avatarW:number
 * }}
 */
function buildFlowerRingConfig(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const d = FLOWER_RING_DEFAULTS;
  const avatarW = Math.max(
    28,
    Number(o.avatarSize != null ? o.avatarSize : o.avatarW) || 40
  );
  const avatarR =
    o.avatarR != null ? Math.max(14, Number(o.avatarR)) : avatarW / 2;
  const countMin =
    o.countMin != null ? Number(o.countMin) : d.countMin;
  const countMax =
    o.countMax != null ? Number(o.countMax) : d.countMax;
  let count =
    o.count != null
      ? Number(o.count)
      : _randInt(countMin, countMax);
  count = Math.max(8, Math.min(12, count));

  const ratioMin =
    o.flowerSizeRatioMin != null
      ? Number(o.flowerSizeRatioMin)
      : d.flowerSizeRatioMin;
  const ratioMax =
    o.flowerSizeRatioMax != null
      ? Number(o.flowerSizeRatioMax)
      : d.flowerSizeRatioMax;
  let flowerSize =
    o.flowerSize != null
      ? Number(o.flowerSize)
      : avatarW * _rand(ratioMin, ratioMax);
  flowerSize = Math.max(
    avatarW * ratioMin,
    Math.min(avatarW * ratioMax, flowerSize)
  );

  const gapFill =
    o.gapFill != null
      ? Number(o.gapFill)
      : o.flowerGapFill != null
        ? Number(o.flowerGapFill)
        : d.gapFill;
  const edgeClearance =
    o.edgeClearance != null ? Number(o.edgeClearance) : d.edgeClearance;
  const gapMin = o.gapMin != null ? Number(o.gapMin) : d.gapMin;
  const gapMaxRatio =
    o.gapMaxRatio != null ? Number(o.gapMaxRatio) : d.gapMaxRatio;

  // 圆周半径：优先紧贴头像外围，同时保证相邻不重叠、无明显空白
  let radius = (count * flowerSize) / (gapFill * 2 * Math.PI);
  let minR = avatarR + flowerSize / 2 + edgeClearance;
  if (radius < minR) radius = minR;

  // 间隙过大 → 先加朵数（≤12），再在 20–30% 内略增大花径填满
  let slot = (2 * Math.PI * radius) / count;
  let gap = slot - flowerSize;
  let guard = 0;
  while (gap > flowerSize * gapMaxRatio && count < 12 && guard < 6) {
    count += 1;
    radius = Math.max(
      minR,
      (count * flowerSize) / (gapFill * 2 * Math.PI)
    );
    slot = (2 * Math.PI * radius) / count;
    gap = slot - flowerSize;
    guard += 1;
  }
  guard = 0;
  while (
    gap > flowerSize * gapMaxRatio &&
    flowerSize < avatarW * ratioMax - 0.15 &&
    guard < 8
  ) {
    flowerSize = Math.min(avatarW * ratioMax, flowerSize + avatarW * 0.012);
    minR = avatarR + flowerSize / 2 + edgeClearance;
    radius = Math.max(minR, radius);
    slot = (2 * Math.PI * radius) / count;
    // 目标：花径 ≈ slot * gapFill
    const target = slot * gapFill;
    if (flowerSize < target) {
      flowerSize = Math.min(avatarW * ratioMax, target);
    }
    gap = slot - flowerSize;
    guard += 1;
  }

  // 重叠或间隙过小 → 略扩半径
  if (gap < gapMin) {
    radius = (count * (flowerSize + gapMin)) / (2 * Math.PI);
    if (radius < minR) radius = minR;
    slot = (2 * Math.PI * radius) / count;
    gap = slot - flowerSize;
  }

  // 最终再钳一次花径，禁止重叠
  const maxBySlot = slot * 0.96;
  if (flowerSize > maxBySlot) {
    flowerSize = Math.max(avatarW * ratioMin, maxBySlot);
    gap = slot - flowerSize;
  }

  const colors = Object.assign({}, d.colorRatio, o.colors || {});

  return {
    count: count,
    radius: Number(radius.toFixed(1)),
    flowerSize: Number(flowerSize.toFixed(1)),
    colors: colors,
    gap: Number(Math.max(0, gap).toFixed(2)),
    gapFill: gapFill,
    edgeClearance: edgeClearance,
    avatarR: Number(avatarR.toFixed(1)),
    avatarW: Number(avatarW.toFixed(1)),
    slot: Number(slot.toFixed(2))
  };
}

/**
 * Observer 盛开完整花朵花环（bloom-flower-ring-final-v7）。
 * 主体：开放花朵（花瓣+花心）；圆周均匀；红色为主。
 */
function buildOpenFlowerRing(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const mode = o.mode || pickBouquetMode();
  const spread = o.spread != null ? Number(o.spread) : 1;

  const avatarSize =
    o.avatarSize != null
      ? Number(o.avatarSize)
      : o.avatarR != null
        ? Number(o.avatarR) * 2
        : o.baseR != null
          ? Math.max(28, Number(o.baseR) * 2 - 4)
          : 40;

  const flowerRingConfig = buildFlowerRingConfig({
    avatarSize: avatarSize,
    avatarR: o.avatarR,
    count: o.count,
    countMin: o.countMin,
    countMax: o.countMax,
    flowerSize: o.flowerSize,
    flowerSizeRatioMin: o.flowerSizeRatioMin,
    flowerSizeRatioMax: o.flowerSizeRatioMax,
    gapFill: o.gapFill != null ? o.gapFill : o.flowerGapFill,
    edgeClearance:
      o.edgeClearance != null
        ? o.edgeClearance
        : o.wreathEdgePad != null
          ? o.wreathEdgePad
          : undefined,
    colors: o.colors
  });

  const n = flowerRingConfig.count;
  const layout = computeOpenFlowerRingSize(
    flowerRingConfig.radius,
    n,
    flowerRingConfig.flowerSize
  );

  const step = 360 / n;
  const bloomPool =
    OPEN_BLOOM_FLOWER_TYPES.length > 0 ? OPEN_BLOOM_FLOWER_TYPES : FLOWER_TYPES;
  const items = [];
  for (let i = 0; i < n; i++) {
    const accent = _shouldAccent(mode, i, n);
    // 强制红占比：前 round(n*0.62) 朵偏红
    const forceRedByQuota = i < Math.ceil(n * (flowerRingConfig.colors.red || 0.62));
    const forcePinkByQuota =
      !forceRedByQuota &&
      i <
        Math.ceil(
          n *
            ((flowerRingConfig.colors.red || 0.62) +
              (flowerRingConfig.colors.pink || 0.2))
        );
    const forceRed =
      mode === 'special'
        ? forceRedByQuota
        : (mode === 'red_main' && !accent) || forceRedByQuota;
    let colorInfo;
    if (forceRed) {
      colorInfo =
        pickWeightedFlowerColor({
          mode: 'red_main',
          forceRed: true
        }) || _colorByKey('red');
    } else if (forcePinkByQuota || (accent && mode === 'red_pink_mix')) {
      colorInfo = _pickWeighted(_colorsByFamily('pink')) || _colorByKey('pink');
    } else {
      colorInfo =
        pickWeightedFlowerColor({
          mode: mode,
          forceRed: false,
          accent: true
        }) || _colorByKey('pink');
    }

    let typeInfo = _pick(bloomPool);
    if (forceRed) {
      const redBloom = bloomPool.filter(function (t) {
        return t.family === 'red';
      });
      if (redBloom.length) typeInfo = _pick(redBloom);
    } else if (forcePinkByQuota) {
      const pinkBloom = bloomPool.filter(function (t) {
        return t.family === 'pink';
      });
      if (pinkBloom.length) typeInfo = _pick(pinkBloom);
    }

    // 严格圆周：角度等分，半径几乎固定（极小抖动避免机械感）
    const deg = step * i + _rand(-0.8, 0.8);
    const r = layout.radius * spread * _rand(0.995, 1.008);
    const rot = Math.round(_rand(-14, 14));
    const delayMs = Math.round(i * 16 + _rand(0, 28));
    const sizeJitter = layout.flowerSize * _rand(0.97, 1.03);
    const petalColor = PETAL_COLORS[colorInfo.key] || '#e11d48';
    const petalCount =
      typeInfo.type === 'daisy' || typeInfo.type === 'sunflower' ? 6 : 5;

    items.push({
      id: 'open-flower-' + i + '-' + Date.now().toString(36),
      isPetal: false,
      isOpenFlower: true,
      type: typeInfo.type,
      emoji: typeInfo.emoji,
      color: colorInfo.key,
      family: colorInfo.family || typeInfo.family || 'red',
      filter: colorInfo.filter || 'none',
      petalColor: petalColor,
      centerColor:
        typeInfo.type === 'sunflower' || typeInfo.type === 'daisy'
          ? '#f59e0b'
          : '#fff7ed',
      petalCount: petalCount,
      deg: Number(deg.toFixed(2)),
      radius: Number(r.toFixed(1)),
      size: Number(sizeJitter.toFixed(1)),
      rotate: rot,
      delay: (delayMs / 1000).toFixed(3) + 's',
      delayMs: delayMs,
      bouquetMode: mode,
      batch: i < Math.ceil(n * 0.4) ? 1 : i < Math.ceil(n * 0.75) ? 2 : 3
    });
  }

  return {
    items: items,
    layout: layout,
    flowerRingConfig: flowerRingConfig
  };
}

/** @deprecated 兼容旧名 → buildOpenFlowerRing.items */
function buildBloomPetalRing(opts) {
  const ring = buildOpenFlowerRing(opts);
  return ring && ring.items ? ring.items : [];
}

/**
 * @deprecated 请用 buildOpenFlowerRing；保留供兼容。
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
        : 0.65;
  const scaleMax =
    o.scaleMax != null
      ? Number(o.scaleMax)
      : FLOWER_TIMING.observer.flowerScaleMax != null
        ? FLOWER_TIMING.observer.flowerScaleMax
        : 0.95;
  const radiusJitterMin = o.radiusJitterMin != null ? Number(o.radiusJitterMin) : 0.94;
  const radiusJitterMax = o.radiusJitterMax != null ? Number(o.radiusJitterMax) : 1.1;
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
  FLOWER_RING_DEFAULTS: FLOWER_RING_DEFAULTS,
  pickBouquetMode: pickBouquetMode,
  pickWeightedFlowerColor: pickWeightedFlowerColor,
  pickRandomFlower: pickRandomFlower,
  buildRandomFlowerBundle: buildRandomFlowerBundle,
  buildFlowerRingConfig: buildFlowerRingConfig,
  computeOpenFlowerRingSize: computeOpenFlowerRingSize,
  buildOpenFlowerRing: buildOpenFlowerRing,
  buildBloomPetalRing: buildBloomPetalRing,
  buildNaturalWreathItems: buildNaturalWreathItems,
  buildFallingPetals: buildFallingPetals,
  buildFlowerReactionTimeline: buildFlowerReactionTimeline
};
