/**
 * Demo：kiss reaction timeline（仅 demo-weekend-amateur）
 *
 * reaction-view-model-v2：仅目标头像中央舞台（Self）。
 * 害羞脸：独立资源 kiss_shy_face.png
 * 源：音频文件/亲吻.mov → kiss.wav（540–900ms）
 * 音效仅 kiss_hit；飞行无声。
 */

const KISS_AUDIO_CLIP = {
  source: '亲吻.mov',
  startMs: 540,
  endMs: 900,
  file: 'kiss.wav'
};

/**
 * Self：命中 → 隐藏原头像内容 → 独立卡通害羞脸 → 嘴唇 hold → 带卡通脸回座 → 恢复
 */
const SELF_KISS_TIMING = {
  centerScale: 4,
  toCenterMs: 420,
  toCenterAt: 40,
  flyAt: 480,
  flyMs: 980,
  hitPulseMs: 280,
  shyDelayMs: 80,
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
  cleanupAfterFadeMs: 1100
};

function buildKissSelfReactionTimeline() {
  const t = SELF_KISS_TIMING;
  const hitAt = t.flyAt + t.flyMs;
  const holdAt = hitAt + t.hitPulseMs;
  const heartsAt = hitAt + t.heartsLeadMs;
  const lipsLeaveAt = hitAt + t.lipHoldMs;
  const returnAt = lipsLeaveAt + t.lipsLeaveMs + t.holdAfterHeartsMs;
  const seatFloatAt = returnAt + t.returnMs;
  const heartsFadeAt = seatFloatAt + t.seatFloatMs;
  const restoreAt = heartsFadeAt + t.heartsFadeMs + t.restoreGapMs;

  return [
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
      sound: 'kiss',
      volume: t.hitVolume,
      seekMs: 0,
      scale: 'large'
    },
    {
      time: hitAt + (t.shyDelayMs != null ? t.shyDelayMs : 80),
      action: 'shy_face_show'
    },
    {
      time: holdAt,
      action: 'kiss_hold',
      duration: t.lipHoldMs - t.hitPulseMs
    },
    {
      time: heartsAt,
      action: 'heart_spawn'
    },
    {
      time: lipsLeaveAt,
      action: 'lips_leave',
      duration: t.lipsLeaveMs
    },
    {
      time: returnAt,
      action: 'avatar_return_with_hearts',
      duration: t.returnMs
    },
    {
      time: seatFloatAt,
      action: 'seat_hearts_float',
      duration: t.seatFloatMs
    },
    {
      time: heartsFadeAt,
      action: 'heart_fade',
      duration: t.heartsFadeMs
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
function buildKissReactionTimeline() {
  return buildKissSelfReactionTimeline();
}

module.exports = {
  KISS_AUDIO_CLIP: KISS_AUDIO_CLIP,
  SELF_KISS_TIMING: SELF_KISS_TIMING,
  buildKissSelfReactionTimeline: buildKissSelfReactionTimeline,
  buildKissReactionTimeline: buildKissReactionTimeline
};
