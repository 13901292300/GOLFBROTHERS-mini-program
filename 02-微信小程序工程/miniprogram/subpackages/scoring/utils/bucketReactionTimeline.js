/**
 * Demo：bucket reaction timeline（仅 demo-weekend-amateur）
 *
 * 源：音频文件/水桶.mov
 * 有效声段约 1175–1920ms（此前为静音），按动画节点拆为 start / pour / end。
 *
 * 阶段：
 * 1 fly_in     — 远处飞入，不播主音
 * 2 arrive     — 到达目标，播 bucket_start（轻提示）
 * 3 pour       — 翻转倒水瞬间，播 bucket_water / bucket_pour 主体
 * 4 cover      — 水流覆盖，主体水声自然延续
 * 5 end/cleanup— 水滴收尾；音频尾部自然结束，cleanup 停轨
 */

/** 相对 水桶.mov / 全长 wav 的截取区间（ms） */
const BUCKET_AUDIO_CLIPS = {
  source: '水桶.mov',
  activeStartMs: 1170,
  activeEndMs: 1920,
  start: { file: 'bucket_start.wav', startMs: 1175, endMs: 1310 },
  pour: { file: 'bucket_pour.wav', startMs: 1170, endMs: 1920 },
  water: { file: 'bucket_water.wav', startMs: 1170, endMs: 1920 },
  end: { file: 'bucket_end.wav', startMs: 1720, endMs: 1920 }
};

const SELF_TIMING = {
  flyAt: 40,
  approachMs: 620,
  pauseMs: 180,
  pourMs: 700,
  coverMs: 2800,
  fadeMs: 600
};

const OBSERVER_TIMING = {
  flyAt: 40,
  approachMs: 650,
  pauseMs: 200,
  pourMs: 620,
  floodMs: 1500,
  dripMs: 3200,
  cleanupMs: 3400
};

/**
 * @param {'self'|'observer'} mode
 * @returns {{ flyAt:number, arriveAt:number, pourAt:number, approachMs:number, pauseMs:number, pourMs:number }}
 */
function getBucketTiming(mode) {
  const t = mode === 'observer' ? OBSERVER_TIMING : SELF_TIMING;
  const arriveAt = t.flyAt + t.approachMs;
  const pourAt = arriveAt + t.pauseMs;
  return {
    flyAt: t.flyAt,
    arriveAt: arriveAt,
    pourAt: pourAt,
    approachMs: t.approachMs,
    pauseMs: t.pauseMs,
    pourMs: t.pourMs,
    coverMs: t.coverMs,
    floodMs: t.floodMs,
    dripMs: t.dripMs,
    cleanupMs: t.cleanupMs,
    fadeMs: t.fadeMs
  };
}

/**
 * @param {'self'|'observer'} mode
 * @returns {Array<{time:number, action:string, sound?:string, volume?:number, seekMs?:number}>}
 */
function buildBucketReactionTimeline(mode) {
  const m = mode === 'observer' ? 'observer' : 'self';
  const t = getBucketTiming(m);
  const events = [];

  // 阶段1：飞入，无声
  events.push({ time: t.flyAt, action: 'fly_in' });

  // 阶段2：到达 — 轻提示，非整轨
  events.push({
    time: t.arriveAt,
    action: 'arrive',
    sound: 'bucket_start',
    volume: 0.7,
    seekMs: 0
  });

  // 阶段3：翻转倒水 — 主体水声（与水流层同时）
  events.push({
    time: t.pourAt,
    action: 'pour',
    sound: 'bucket_water',
    volume: 0.95,
    seekMs: 0
  });

  // 阶段4：覆盖期间不另起整轨；主体自然播完
  events.push({ time: t.pourAt + t.pourMs, action: 'hide_bucket' });

  if (m === 'observer') {
    events.push({ time: t.pourAt + t.floodMs, action: 'hide_flood' });
    events.push({ time: t.pourAt + t.dripMs, action: 'hide_drip' });
    // 阶段5：主体水声（含尾部）自然结束；cleanup 停轨
    events.push({ time: t.pourAt + t.cleanupMs, action: 'cleanup' });
  } else {
    events.push({ time: t.pourAt + t.coverMs, action: 'fade_out' });
    events.push({ time: t.pourAt + t.coverMs + t.fadeMs, action: 'cleanup' });
  }

  events.sort(function (a, b) {
    return a.time - b.time;
  });
  return events;
}

module.exports = {
  BUCKET_AUDIO_CLIPS: BUCKET_AUDIO_CLIPS,
  SELF_TIMING: SELF_TIMING,
  OBSERVER_TIMING: OBSERVER_TIMING,
  getBucketTiming: getBucketTiming,
  buildBucketReactionTimeline: buildBucketReactionTimeline
};
