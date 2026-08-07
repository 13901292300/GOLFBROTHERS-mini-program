/**
 * Demo：rocket reaction timeline（仅 demo-weekend-amateur）
 *
 * reaction-view-model-v2：仅目标头像中央舞台（Self）。
 * 中央(拳击×4) → 火箭 → 爆炸+火光+浓烟 → 烟散 → 漫画脸 → 炸毛 → 轻抖 → 停留 → 旋转回座位
 *
 * 音频：rocket.mp3；peakMs≈660 → explosion seek 起播。
 */

const ROCKET_AUDIO = {
  source: '音频文件/火箭.mp3',
  file: 'rocket.mp3',
  soundKey: 'rocket',
  path: '/subpackages/scoring/assets/sounds/rocket.mp3',
  durationMs: 1833,
  peakMs: 660,
  loudOnsetMs: 660
};

const ROCKET_SELF_TIMING = {
  toCenterAt: 0,
  toCenterMs: 420,
  flyLeadMs: 80,
  flyMs: 900,
  hitVolume: 1,
  smokeCoverMs: 380,
  smokeClearMs: 720,
  shakeMs: 420,
  holdMinMs: 1000,
  holdMaxMs: 2000,
  holdMs: 1500,
  returnMs: 720,
  restoreMs: 280,
  cleanupAfterRestoreMs: 160,
  centerScale: 4
};

/**
 * Self 中央舞台 timeline
 * @param {object=} opts
 * @param {number=} opts.holdMs
 */
function buildRocketSelfTimeline(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const t = ROCKET_SELF_TIMING;
  const audio = ROCKET_AUDIO;

  const toCenterAt = t.toCenterAt;
  const flyAt = toCenterAt + t.toCenterMs + t.flyLeadMs;
  const explosionAt = flyAt + t.flyMs;
  const smokeCoverAt = explosionAt;
  const smokeClearAt = smokeCoverAt + t.smokeCoverMs;
  const faceAt = smokeClearAt + Math.floor(t.smokeClearMs * 0.45);
  const hairAt = faceAt + 40;
  const shakeAt = faceAt + 80;

  let holdMs =
    o.holdMs != null
      ? Number(o.holdMs)
      : t.holdMinMs +
        Math.floor(Math.random() * (t.holdMaxMs - t.holdMinMs + 1));
  if (!Number.isFinite(holdMs)) holdMs = t.holdMs;
  holdMs = Math.max(t.holdMinMs, Math.min(t.holdMaxMs, holdMs));

  const holdAt = shakeAt + t.shakeMs;
  const returnAt = holdAt + holdMs;
  const restoreAt = returnAt + t.returnMs;
  const cleanupAt = restoreAt + t.restoreMs + t.cleanupAfterRestoreMs;

  const events = [
    { time: toCenterAt, action: 'avatar_to_center', duration: t.toCenterMs },
    { time: flyAt, action: 'rocket_fly' },
    {
      time: explosionAt,
      action: 'rocket_explosion',
      sound: 'rocket',
      volume: t.hitVolume,
      seekMs: audio.peakMs
    },
    { time: smokeCoverAt, action: 'smoke_cover' },
    {
      time: smokeClearAt,
      action: 'smoke_clear',
      duration: t.smokeClearMs
    },
    { time: faceAt, action: 'blast_face_reveal' },
    { time: hairAt, action: 'blast_hair_pop' },
    { time: shakeAt, action: 'avatar_shake', duration: t.shakeMs },
    { time: holdAt, action: 'avatar_hold', duration: holdMs },
    { time: returnAt, action: 'avatar_return', duration: t.returnMs },
    { time: restoreAt, action: 'avatar_restore' },
    { time: cleanupAt, action: 'cleanup' }
  ];

  events.sort(function (a, b) {
    return a.time - b.time;
  });
  return events;
}

/** @deprecated 兼容旧调用 → Self */
function buildRocketReactionTimeline(mode, opts) {
  return buildRocketSelfTimeline(opts);
}

module.exports = {
  ROCKET_AUDIO: ROCKET_AUDIO,
  ROCKET_SELF_TIMING: ROCKET_SELF_TIMING,
  buildRocketSelfTimeline: buildRocketSelfTimeline,
  buildRocketReactionTimeline: buildRocketReactionTimeline
};
