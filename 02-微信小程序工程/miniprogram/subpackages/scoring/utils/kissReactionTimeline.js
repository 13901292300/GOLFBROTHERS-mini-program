/**
 * Demo：kiss reaction timeline（仅 demo-weekend-amateur）
 *
 * 源：音频文件/亲吻.mov → kiss.wav（540–900ms）
 *
 * Self（第一视角 / 近镜头）：
 *   kiss_fly → kiss_hit(+sound) → heart_spawn → lips_fade → cleanup
 *
 * Observer：fly_start → kiss_hit(+sound，头像中心) → hearts_start → lips_fade
 */

const KISS_AUDIO_CLIP = {
  source: '亲吻.mov',
  startMs: 540,
  endMs: 900,
  file: 'kiss.wav'
};

/** Observer：远距离入场 → 头像中心命中 → 停留亲吻 → 红心 */
const KISS_TIMING = {
  flyAt: 30,
  flyMs: 980,
  holdMs: 1500,
  heartsLeadMs: 70,
  hitPulseMs: 320,
  fadeMs: 420,
  cleanupAfterFadeMs: 900,
  hitVolume: 0.95
};

/** Self：更长飞入 + 命中脉冲 + 爱心爆发 */
const SELF_KISS_TIMING = {
  flyAt: 30,
  flyMs: 1080,
  holdMs: 1680,
  heartsLeadMs: 90,
  hitPulseMs: 280,
  fadeMs: 480,
  cleanupAfterFadeMs: 1100,
  hitVolume: 1
};

/**
 * @param {object=} opts
 * @param {'self'|'observer'=} opts.mode
 * @param {number=} opts.flyMs
 * @param {number=} opts.holdMs
 * @returns {Array<{time:number, action:string, sound?:string, volume?:number, seekMs?:number, scale?:string}>}
 */
function buildKissReactionTimeline(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const mode = o.mode === 'observer' ? 'observer' : 'self';

  if (mode === 'self') {
    const flyAt = SELF_KISS_TIMING.flyAt;
    const flyMs = o.flyMs != null ? o.flyMs : SELF_KISS_TIMING.flyMs;
    const holdMs = o.holdMs != null ? o.holdMs : SELF_KISS_TIMING.holdMs;
    const hitAt = flyAt + flyMs;
    const heartsAt = hitAt + SELF_KISS_TIMING.heartsLeadMs;
    const fadeAt = hitAt + holdMs;
    const cleanupAt =
      fadeAt + SELF_KISS_TIMING.fadeMs + SELF_KISS_TIMING.cleanupAfterFadeMs;
    return [
      { time: flyAt, action: 'kiss_fly' },
      {
        time: hitAt,
        action: 'kiss_hit',
        sound: 'kiss',
        volume: SELF_KISS_TIMING.hitVolume,
        seekMs: 0,
        scale: 'large'
      },
      { time: heartsAt, action: 'heart_spawn' },
      { time: fadeAt, action: 'lips_fade' },
      { time: cleanupAt, action: 'cleanup' }
    ].sort(function (a, b) {
      return a.time - b.time;
    });
  }

  const flyAt = KISS_TIMING.flyAt;
  const flyMs = o.flyMs != null ? o.flyMs : KISS_TIMING.flyMs;
  const holdMs = o.holdMs != null ? o.holdMs : KISS_TIMING.holdMs;
  const hitAt = flyAt + flyMs;
  const heartsAt = hitAt + KISS_TIMING.heartsLeadMs;
  const fadeAt = hitAt + holdMs;
  const cleanupAt = fadeAt + KISS_TIMING.fadeMs + KISS_TIMING.cleanupAfterFadeMs;

  return [
    { time: flyAt, action: 'fly_start' },
    {
      time: hitAt,
      action: 'kiss_hit',
      sound: 'kiss',
      volume: 0.95,
      seekMs: 0
    },
    { time: heartsAt, action: 'hearts_start' },
    { time: fadeAt, action: 'lips_fade' },
    { time: cleanupAt, action: 'cleanup' }
  ].sort(function (a, b) {
    return a.time - b.time;
  });
}

module.exports = {
  KISS_AUDIO_CLIP: KISS_AUDIO_CLIP,
  KISS_TIMING: KISS_TIMING,
  SELF_KISS_TIMING: SELF_KISS_TIMING,
  buildKissReactionTimeline: buildKissReactionTimeline
};
