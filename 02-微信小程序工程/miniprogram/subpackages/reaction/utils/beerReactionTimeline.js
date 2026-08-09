/**
 * Demo：beer toast reaction timeline（仅 demo-weekend-amateur）
 *
 * Observer：锚定 targetAvatarRect 中心（主杯 + 左右侧杯）。
 * Self：屏中第一视角双杯碰杯（beer_self_* 独立时间轴）。
 *
 * 音效：音频文件/干杯.mp3 → cheers.mp3（完整轨，不 seek）
 * - Observer：beer_main_fly 起播
 * - Self：beer_self_first_fly 起播；动画节点对齐 mid / peak
 */

const BEER_AUDIO_CLIP = {
  source: '音频文件/干杯.mp3',
  file: 'cheers.mp3',
  soundKey: 'cheers',
  path: '/subpackages/reaction/assets/sounds/cheers.mp3',
  /** 完整轨时长（ms）；勿裁剪 */
  durationMs: 2135,
  /** 相对音频 t=0 的结构点（不 seek） */
  midMs: 1000,
  peakMs: 1520
};

const BEER_TIMING = {
  /** Observer：主杯起飞即起播 */
  flyAt: 0,
  /** Observer：主杯飞到头像中心 */
  mainFlyMs: 780,
  /** Observer：侧杯飞入时长 */
  sideFlyMs: 480,
  clashHoldMs: 520,
  fadeMs: 420,
  cleanupAfterFadeMs: 280,
  playVolume: 0.95
};

/**
 * Self 第一视角双杯节奏（与 Observer 分离）。
 * 时间以 cheers.mp3 为母钟：0 起播 → mid 第二杯 → peak 碰杯。
 */
const BEER_SELF_TIMING = {
  firstFlyAt: 0,
  /** 第一杯飞到中心（早于 mid，留出等待） */
  firstFlyMs: 780,
  /** 第二杯飞入时长；secondFlyAt = peak - secondFlyMs */
  secondFlyMs: 520,
  /** 最终视觉尺寸倍率（相对旧 Self 76px 约 1.75×） */
  finalScale: 1.75,
  clashScalePeak: 1.18,
  /** 碰杯后停留 2–3s */
  holdMinMs: 2000,
  holdMaxMs: 3000,
  fadeMs: 480,
  /** 淡出后泡沫继续消失 */
  foamLingerMinMs: 500,
  foamLingerMaxMs: 1000,
  playVolume: 0.98
};

/**
 * Observer timeline（禁止改动 Self 耦合）。
 * @param {object=} opts
 * @returns {Array<{time:number, action:string, sound?:string, volume?:number, seekMs?:number}>}
 */
function buildBeerReactionTimeline(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  if (o.mode === 'self') {
    return buildBeerSelfReactionTimeline(o);
  }

  const flyAt = BEER_TIMING.flyAt;
  const mainFlyMs = BEER_TIMING.mainFlyMs;
  const sideFlyMs = BEER_TIMING.sideFlyMs;
  const audioDur = BEER_AUDIO_CLIP.durationMs;
  const peakMs = BEER_AUDIO_CLIP.peakMs;
  const midMs = BEER_AUDIO_CLIP.midMs;

  const arriveAt = flyAt + mainFlyMs;
  let sideEnterAt = flyAt + midMs;
  if (sideEnterAt <= arriveAt + 80) sideEnterAt = arriveAt + 120;
  let clashAt = flyAt + peakMs;
  if (sideEnterAt + sideFlyMs > clashAt) {
    sideEnterAt = Math.max(arriveAt + 80, clashAt - sideFlyMs);
  }
  const splashAt = clashAt + 50;
  const fadeAt = Math.max(
    clashAt + BEER_TIMING.clashHoldMs,
    flyAt + audioDur + 80
  );
  const cleanupAt = fadeAt + BEER_TIMING.fadeMs + BEER_TIMING.cleanupAfterFadeMs;

  const events = [
    {
      time: flyAt,
      action: 'beer_main_fly',
      sound: 'cheers',
      volume: BEER_TIMING.playVolume,
      seekMs: 0
    },
    { time: arriveAt, action: 'beer_main_hold' },
    { time: sideEnterAt, action: 'beer_side_enter' },
    { time: clashAt, action: 'beer_clash' },
    { time: splashAt, action: 'beer_splash' },
    { time: fadeAt, action: 'beer_fade' },
    { time: cleanupAt, action: 'cleanup' }
  ];

  events.sort(function (a, b) {
    return a.time - b.time;
  });
  return events;
}

/**
 * Self 第一视角双杯碰杯 timeline。
 * 完整 cheers 从 0ms 起播；碰杯对齐 peakMs。
 *
 * @param {object=} opts
 * @param {number=} opts.holdMs
 * @param {number=} opts.foamLingerMs
 */
function buildBeerSelfReactionTimeline(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const t = BEER_SELF_TIMING;
  const audio = BEER_AUDIO_CLIP;
  const peakMs = audio.peakMs;
  const midMs = audio.midMs;

  const firstFlyAt = t.firstFlyAt;
  const firstFlyMs = t.firstFlyMs;
  const firstArriveAt = firstFlyAt + firstFlyMs;

  const secondFlyMs = t.secondFlyMs;
  // 第二杯到达对齐音频碰杯峰值；起飞点自然落在 mid 附近
  const clashAt = peakMs;
  let secondFlyAt = clashAt - secondFlyMs;
  if (secondFlyAt < firstArriveAt + 60) {
    secondFlyAt = firstArriveAt + 60;
  }
  // 优先贴近 mid（音频中段进入）
  if (Math.abs(secondFlyAt - midMs) > 80 && midMs >= firstArriveAt + 60) {
    secondFlyAt = midMs;
  }
  // 保证第二杯仍在 peak 到达（必要时压缩/拉长飞时由 ctx.secondFlyMs 覆盖）
  const resolvedSecondFlyMs = Math.max(280, clashAt - secondFlyAt);

  const splashAt = clashAt + 50;

  let holdMs =
    o.holdMs != null
      ? Number(o.holdMs)
      : t.holdMinMs + Math.floor(Math.random() * (t.holdMaxMs - t.holdMinMs + 1));
  if (!Number.isFinite(holdMs)) holdMs = 2500;
  holdMs = Math.max(t.holdMinMs, Math.min(t.holdMaxMs, holdMs));

  const holdAt = clashAt + 120;
  const fadeAt = clashAt + holdMs;

  let foamLinger =
    o.foamLingerMs != null
      ? Number(o.foamLingerMs)
      : t.foamLingerMinMs +
        Math.floor(Math.random() * (t.foamLingerMaxMs - t.foamLingerMinMs + 1));
  if (!Number.isFinite(foamLinger)) foamLinger = 700;
  foamLinger = Math.max(
    t.foamLingerMinMs,
    Math.min(t.foamLingerMaxMs, foamLinger)
  );

  const cleanupAt = fadeAt + t.fadeMs + foamLinger;

  const events = [
    {
      time: firstFlyAt,
      action: 'beer_self_first_fly',
      sound: 'cheers',
      volume: t.playVolume,
      seekMs: 0
    },
    {
      time: firstArriveAt,
      action: 'beer_self_first_hold'
    },
    {
      time: secondFlyAt,
      action: 'beer_self_second_fly',
      secondFlyMs: resolvedSecondFlyMs
    },
    {
      time: clashAt,
      action: 'beer_self_clash'
    },
    {
      time: splashAt,
      action: 'beer_self_splash'
    },
    {
      time: holdAt,
      action: 'beer_self_hold'
    },
    {
      time: fadeAt,
      action: 'beer_self_fade'
    },
    {
      time: cleanupAt,
      action: 'cleanup'
    }
  ];

  events.sort(function (a, b) {
    return a.time - b.time;
  });
  return events;
}

module.exports = {
  BEER_AUDIO_CLIP: BEER_AUDIO_CLIP,
  BEER_TIMING: BEER_TIMING,
  BEER_SELF_TIMING: BEER_SELF_TIMING,
  buildBeerReactionTimeline: buildBeerReactionTimeline,
  buildBeerSelfReactionTimeline: buildBeerSelfReactionTimeline
};
