/**
 * Demo：tomato reaction timeline（仅 demo-weekend-amateur）
 *
 * reaction-view-model-v2：仅目标头像中央舞台（Self）。
 * 源：音频文件/西红柿.mov → tomato_hit.wav
 */

const TOMATO_AUDIO_CLIP = {
  source: '音频文件/西红柿.mov',
  startMs: 620,
  endMs: 1500,
  file: 'tomato_hit.wav',
  soundKey: 'tomato_hit',
  path: '/subpackages/scoring/assets/sounds/tomato_hit.wav'
};

const TOMATO_SELF_TIMING = {
  centerScale: 4,
  toCenterMs: 420,
  toCenterAt: 40,
  flyAt: 480,
  flyMs: 900,
  splashLeadMs: 40,
  faceLeadMs: 120,
  dripHoldAt: 1680,
  dripHoldMs: 1500,
  returnMs: 720,
  restoreGapMs: 80,
  hitVolume: 0.95,
  shakeMs: 420
};

const TOMATO_TIMING = {
  self: {
    flyAt: TOMATO_SELF_TIMING.flyAt,
    flyMs: TOMATO_SELF_TIMING.flyMs,
    splashLeadMs: TOMATO_SELF_TIMING.splashLeadMs,
    dripLeadMs: TOMATO_SELF_TIMING.faceLeadMs,
    hitVolume: TOMATO_SELF_TIMING.hitVolume,
    centerScale: TOMATO_SELF_TIMING.centerScale,
    toCenterMs: TOMATO_SELF_TIMING.toCenterMs,
    dripHoldMs: TOMATO_SELF_TIMING.dripHoldMs,
    returnMs: TOMATO_SELF_TIMING.returnMs
  }
};

function buildTomatoSelfReactionTimeline() {
  const t = TOMATO_SELF_TIMING;
  const flyStart = t.flyAt;
  const hit = flyStart + t.flyMs;
  const splashAt = hit + t.splashLeadMs;
  const faceAt = hit + t.faceLeadMs;
  const dripHoldAt = t.dripHoldAt > faceAt ? t.dripHoldAt : faceAt + 280;
  const returnAt = dripHoldAt + t.dripHoldMs;
  const restoreAt = returnAt + t.returnMs + t.restoreGapMs;

  return [
    {
      time: t.toCenterAt,
      action: 'self_avatar_center',
      duration: t.toCenterMs
    },
    {
      time: flyStart,
      action: 'tomato_self_fly',
      duration: t.flyMs
    },
    {
      time: hit,
      action: 'tomato_self_hit',
      sound: 'tomato_hit',
      volume: t.hitVolume,
      seekMs: 0
    },
    {
      time: splashAt,
      action: 'tomato_splash'
    },
    {
      time: faceAt,
      action: 'tomato_face_overlay'
    },
    {
      time: dripHoldAt,
      action: 'tomato_drip_hold',
      duration: t.dripHoldMs
    },
    {
      time: returnAt,
      action: 'avatar_return',
      duration: t.returnMs
    },
    {
      time: restoreAt,
      action: 'restore'
    }
  ].sort(function (a, b) {
    return a.time - b.time;
  });
}

/** @deprecated 兼容旧调用 → Self */
function buildTomatoReactionTimeline() {
  return buildTomatoSelfReactionTimeline();
}

module.exports = {
  TOMATO_AUDIO_CLIP: TOMATO_AUDIO_CLIP,
  TOMATO_TIMING: TOMATO_TIMING,
  TOMATO_SELF_TIMING: TOMATO_SELF_TIMING,
  buildTomatoSelfReactionTimeline: buildTomatoSelfReactionTimeline,
  buildTomatoReactionTimeline: buildTomatoReactionTimeline
};
