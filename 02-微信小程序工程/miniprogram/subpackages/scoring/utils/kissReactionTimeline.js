/**
 * Demo：kiss reaction timeline（仅 demo-weekend-amateur）
 *
 * reaction-view-model-v2：仅目标头像中央舞台（Self）。
 * 害羞脸：独立资源 kiss_shy_face.png
 * 嘴唇：kiss_lips.png + 开合状态（idle / close / open），不换资源
 * 源：音频文件/亲吻.mov → kiss.wav（540–900ms）
 * 音效：kiss_sound 与首次 kiss_close 同步；飞行无声。
 */

const KISS_AUDIO_CLIP = {
  source: '亲吻.mov',
  startMs: 540,
  endMs: 900,
  file: 'kiss.wav'
};

/**
 * Self：命中 → 嘴唇开合亲吻 → 害羞脸 → 红心 → hold → 回座 → 恢复
 */
const SELF_KISS_TIMING = {
  centerScale: 4,
  toCenterMs: 420,
  toCenterAt: 40,
  flyAt: 480,
  flyMs: 980,
  hitPulseMs: 280,
  shyDelayMs: 80,
  /** 嘴唇停留约 1.5–2s（含开合循环） */
  lipHoldMs: 1800,
  lipsLeaveMs: 420,
  heartsLeadMs: 160,
  shySeatClearMs: 900,
  holdAfterHeartsMs: 200,
  returnMs: 720,
  seatFloatMs: 1400,
  heartsFadeMs: 900,
  restoreGapMs: 80,
  hitVolume: 1,
  holdMs: 1800,
  shyLeadMs: 0,
  fadeMs: 420,
  cleanupAfterFadeMs: 1100,
  /** kiss-lips-animation-sync-v2：单次开合周期 500ms，循环约 2 次 */
  kissCycleMs: 500,
  kissCycles: 2,
  kissOpenAtMs: 200,
  kissCloseAgainAtMs: 350
};

function buildKissSelfReactionTimeline() {
  const t = SELF_KISS_TIMING;
  const hitAt = t.flyAt + t.flyMs;
  const cycleMs = t.kissCycleMs != null ? t.kissCycleMs : 500;
  const cycles = t.kissCycles != null ? t.kissCycles : 2;
  const openAt = t.kissOpenAtMs != null ? t.kissOpenAtMs : 200;
  const closeAgainAt =
    t.kissCloseAgainAtMs != null ? t.kissCloseAgainAtMs : 350;
  const kissAnimEnd = hitAt + cycleMs * cycles;
  const holdAt = kissAnimEnd;
  const heartsAt = hitAt + t.heartsLeadMs;
  const lipsLeaveAt = hitAt + t.lipHoldMs;
  const returnAt = lipsLeaveAt + t.lipsLeaveMs + t.holdAfterHeartsMs;
  const seatFloatAt = returnAt + t.returnMs;
  const heartsFadeAt = seatFloatAt + t.seatFloatMs;
  const restoreAt = heartsFadeAt + t.heartsFadeMs + t.restoreGapMs;

  const events = [
    {
      time: t.toCenterAt,
      action: 'self_avatar_center',
      duration: t.toCenterMs
    },
    {
      time: t.flyAt,
      action: 'kiss_fly',
      duration: t.flyMs
    },
    {
      time: hitAt,
      action: 'kiss_hit',
      scale: 'large'
    },
    {
      time: hitAt + (t.shyDelayMs != null ? t.shyDelayMs : 80),
      action: 'shy_face_show'
    },
    {
      time: heartsAt,
      action: 'heart_spawn'
    }
  ];

  for (let c = 0; c < cycles; c++) {
    const base = hitAt + c * cycleMs;
    events.push({
      time: base,
      action: 'kiss_close',
      press: true,
      cycle: c
    });
    if (c === 0) {
      events.push({
        time: base,
        action: 'kiss_sound',
        sound: 'kiss',
        volume: t.hitVolume,
        seekMs: 0
      });
    }
    events.push({
      time: base + openAt,
      action: 'kiss_open',
      cycle: c
    });
    events.push({
      time: base + closeAgainAt,
      action: 'kiss_close',
      press: false,
      cycle: c
    });
  }

  events.push({
    time: holdAt,
    action: 'kiss_hold',
    duration: Math.max(0, lipsLeaveAt - holdAt)
  });
  events.push({
    time: lipsLeaveAt,
    action: 'lips_leave',
    duration: t.lipsLeaveMs
  });
  events.push({
    time: returnAt,
    action: 'avatar_return_with_hearts',
    duration: t.returnMs
  });
  events.push({
    time: seatFloatAt,
    action: 'seat_hearts_float',
    duration: t.seatFloatMs
  });
  events.push({
    time: heartsFadeAt,
    action: 'heart_fade',
    duration: t.heartsFadeMs
  });
  events.push({
    time: restoreAt,
    action: 'restore'
  });

  return events.sort(function (a, b) {
    return a.time - b.time;
  });
}

/** @deprecated 兼容旧调用 → Self */
function buildKissReactionTimeline() {
  return buildKissSelfReactionTimeline();
}

module.exports = {
  KISS_AUDIO_CLIP: KISS_AUDIO_CLIP,
  SELF_KISS_TIMING: SELF_KISS_TIMING,
  buildKissSelfReactionTimeline: buildKissSelfReactionTimeline,
  buildKissReactionTimeline: buildKissReactionTimeline
};
