/**
 * Demo：bucket reaction timeline（仅 demo-weekend-amateur）
 *
 * reaction-view-model-v2：仅目标头像中央舞台（Self）。
 * 源：音频文件/水桶.mov → bucket_water_new.wav
 */

const BUCKET_AUDIO_CLIP = {
  source: '水桶.mov',
  startMs: 500,
  endMs: 1350,
  file: 'bucket_water_new.wav',
  soundKey: 'bucket_water_new'
};

/** Self：与拳击 Self 一致 centerScale=4 */
const SELF_TIMING = {
  centerScale: 4,
  bucketScale: 1.75,
  toCenterMs: 420,
  toCenterAt: 40,
  bucketEnterAt: 480,
  bucketEnterMs: 380,
  tiltAt: 900,
  tiltMs: 280,
  pourAt: 980,
  pourMs: 720,
  wetAt: 1180,
  dripHoldAt: 1750,
  dripHoldMs: 1500,
  returnAt: 3250,
  returnMs: 720,
  restoreGapMs: 80,
  flyAt: 40,
  approachMs: 620,
  pauseMs: 180,
  coverMs: 2800,
  fadeMs: 600
};

function getBucketTiming() {
  const t = SELF_TIMING;
  return Object.assign({}, t, {
    flyAt: t.toCenterAt,
    arriveAt: t.bucketEnterAt,
    pourAt: t.tiltAt,
    approachMs: t.bucketEnterMs,
    pauseMs: Math.max(0, t.tiltAt - t.bucketEnterAt - t.bucketEnterMs),
    pourMs: t.pourMs,
    coverMs: t.dripHoldMs,
    fadeMs: t.returnMs
  });
}

/**
 * Self 中央舞台 timeline
 * 音效仅在 bucket_tilt / water_pour_start，桶进入无声。
 */
function buildBucketSelfReactionTimeline() {
  const t = SELF_TIMING;
  const returnDone = t.returnAt + t.returnMs;
  const events = [
    {
      time: t.toCenterAt,
      action: 'self_avatar_center',
      duration: t.toCenterMs
    },
    {
      time: t.bucketEnterAt,
      action: 'bucket_self_enter',
      duration: t.bucketEnterMs
    },
    {
      time: t.tiltAt,
      action: 'bucket_tilt',
      duration: t.tiltMs,
      sound: 'bucket_water_new',
      volume: 0.95,
      seekMs: 0
    },
    {
      time: t.pourAt,
      action: 'water_pour_start',
      duration: t.pourMs
    },
    {
      time: t.wetAt,
      action: 'wet_avatar_show'
    },
    {
      time: t.dripHoldAt,
      action: 'water_drip_hold',
      duration: t.dripHoldMs
    },
    {
      time: t.returnAt,
      action: 'avatar_return',
      duration: t.returnMs
    },
    {
      time: returnDone + t.restoreGapMs,
      action: 'restore'
    }
  ];
  events.sort(function (a, b) {
    return a.time - b.time;
  });
  return events;
}

/** @deprecated 兼容旧调用 → Self */
function buildBucketReactionTimeline() {
  return buildBucketSelfReactionTimeline();
}

module.exports = {
  BUCKET_AUDIO_CLIP: BUCKET_AUDIO_CLIP,
  SELF_TIMING: SELF_TIMING,
  getBucketTiming: getBucketTiming,
  buildBucketSelfReactionTimeline: buildBucketSelfReactionTimeline,
  buildBucketReactionTimeline: buildBucketReactionTimeline
};
