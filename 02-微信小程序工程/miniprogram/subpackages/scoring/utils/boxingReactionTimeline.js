/**
 * Demo：boxing reaction timeline（仅 demo-weekend-amateur）
 *
 * Self 流程（眼冒金星版）：
 *   boxing_enter
 *   → hit_1 + show_boxing_face（立即卡通脸）
 *   → hit_2 → hit_3
 *   → show_star_ring（头顶旋转金星 ⭐⭐⭐）
 *   → hit_4 → hit_5 → hit_6（金星期间继续几拳）
 *   → final_hit → show_at_eye（@@ 彻底晕）
 *   → return_to_seat → land_dizzy_rotate（@转 2 圈）→ restore
 *
 * 连击阶段：卡通脸 + 震动；金星后仍无 @眼
 * 最后一拳后才 @@
 *
 * 连击：boxing.mp3 前 6 峰；终结：boxing_hit_first.wav
 */

/** boxing.mp3 峰值（ms） */
const BOXING_AUDIO_HIT_MS = [514, 664, 814, 965, 1162, 1312, 1462];
/** 第三拳后出金星；金星后再打若干拳 */
const BOXING_STARS_AFTER_HIT = 3;
const BOXING_COMBO_HIT_COUNT = 6;

const BOXING_HIT_FIRST_CLIP = {
  source: 'boxing.mp3',
  startMs: 430,
  endMs: 640,
  file: 'boxing_hit_first.wav'
};

const GLOVE_LEAD_MS = 134;
const SHOW_FACE_DELAY_MS = 0;
/** 第三拳后稍顿出金星 */
const STAR_RING_AFTER_HIT3_MS = 80;
const CHARGE_MS = 380;
const FLY_BACK_MS = 620;
const EYES_SPIN_2_MS = 1100;
const RESTORE_AFTER_SPIN_MS = 80;

const FLY_IN_AT = 30;
const FLY_IN_MS = 420;
const COMBO_AUDIO_DELAY_AFTER_FLY = 80;

/**
 * @param {object=} opts
 */
function buildBoxingReactionTimeline(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const chargeMs = o.chargeMs != null ? o.chargeMs : CHARGE_MS;
  const flyBackMs = o.flyBackMs != null ? o.flyBackMs : FLY_BACK_MS;
  const eyesSpinMs = o.eyesSpinMs != null ? o.eyesSpinMs : EYES_SPIN_2_MS;
  const comboCount =
    o.comboHitCount != null ? Number(o.comboHitCount) : BOXING_COMBO_HIT_COUNT;
  const starsAfterHit =
    o.starsAfterHit != null ? Number(o.starsAfterHit) : BOXING_STARS_AFTER_HIT;
  const hits = BOXING_AUDIO_HIT_MS.slice(
    0,
    Math.max(starsAfterHit, Math.min(6, comboCount))
  );
  const comboAudioAt = FLY_IN_AT + FLY_IN_MS + COMBO_AUDIO_DELAY_AFTER_FLY;

  const events = [];
  events.push({ time: FLY_IN_AT, action: 'boxing_enter' });
  events.push({
    time: comboAudioAt,
    action: 'audio_start',
    sound: 'boxing',
    volume: 0.82,
    seekMs: 0
  });

  for (let i = 0; i < hits.length; i++) {
    const peak = hits[i];
    const hitAt = comboAudioAt + peak;
    const side = i % 2 === 0 ? 'left' : 'right';
    const punchIndex = i + 1;
    events.push({
      time: Math.max(comboAudioAt, hitAt - GLOVE_LEAD_MS),
      action: 'glove_enter',
      side: side,
      punchIndex: punchIndex
    });
    events.push({
      time: hitAt,
      action: 'hit_' + punchIndex,
      side: side,
      punchIndex: punchIndex
    });
    // 第一拳：立即卡通脸
    if (i === 0) {
      events.push({
        time: hitAt + SHOW_FACE_DELAY_MS,
        action: 'show_boxing_face'
      });
    }
    // 第三拳后：头顶旋转金星（眼冒金星），之后继续几拳
    if (punchIndex === starsAfterHit) {
      events.push({
        time: hitAt + STAR_RING_AFTER_HIT3_MS,
        action: 'show_star_ring'
      });
    }
  }

  const lastComboHitAt = comboAudioAt + hits[hits.length - 1];
  // 金星阶段最后几拳打完 → 稍顿蓄力终结拳
  const chargeAt = lastComboHitAt + 200;
  events.push({ time: chargeAt, action: 'finale_charge' });

  const finaleHitAt = chargeAt + chargeMs;
  events.push({
    time: Math.max(chargeAt + 40, finaleHitAt - GLOVE_LEAD_MS),
    action: 'finale_glove',
    side: 'right'
  });
  events.push({
    time: finaleHitAt,
    action: 'final_hit',
    side: 'right',
    sound: 'boxing_hit_first',
    volume: 1,
    seekMs: 0
  });
  // 最后一拳后：@@ 彻底晕
  events.push({
    time: finaleHitAt + 40,
    action: 'show_at_eye'
  });

  const flyBackAt = finaleHitAt + 180;
  events.push({ time: flyBackAt, action: 'return_to_seat' });
  events.push({ time: flyBackAt + 140, action: 'fly_back_seat' });

  const landAt = flyBackAt + flyBackMs;
  events.push({
    time: landAt,
    action: 'land_dizzy_rotate',
    duration: eyesSpinMs
  });

  const restoreAt = landAt + 40 + eyesSpinMs + RESTORE_AFTER_SPIN_MS;
  events.push({ time: restoreAt, action: 'restore' });
  events.push({ time: restoreAt + 200, action: 'fade_out' });
  events.push({ time: restoreAt + 200 + 480, action: 'cleanup' });

  events.sort(function (a, b) {
    return a.time - b.time;
  });
  return events;
}

module.exports = {
  BOXING_AUDIO_HIT_MS: BOXING_AUDIO_HIT_MS,
  BOXING_COMBO_HIT_COUNT: BOXING_COMBO_HIT_COUNT,
  BOXING_STARS_AFTER_HIT: BOXING_STARS_AFTER_HIT,
  BOXING_HIT_FIRST_CLIP: BOXING_HIT_FIRST_CLIP,
  GLOVE_LEAD_MS: GLOVE_LEAD_MS,
  FLY_IN_MS: FLY_IN_MS,
  EYES_SPIN_2_MS: EYES_SPIN_2_MS,
  buildBoxingReactionTimeline: buildBoxingReactionTimeline
};
