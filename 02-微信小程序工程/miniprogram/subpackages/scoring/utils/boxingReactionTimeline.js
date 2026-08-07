/**
 * Demo：boxing reaction timeline（仅 demo-weekend-amateur）
 *
 * 连击：整段 boxing.mp3 节奏（峰值对齐 hit）
 * 终结：独立片段 boxing_hit_first.wav（从原音频截取第一拳，不重播完整轨）
 */

/** boxing.mp3 内明显拳击峰值（ms，相对音频 t=0）— 7 击 */
const BOXING_AUDIO_HIT_MS = [514, 664, 814, 965, 1162, 1312, 1462];

/**
 * boxing_hit_first.wav 截取区间（相对原 boxing 轨）
 * start 430ms → end 640ms（第一拳体，止于第二拳前）
 */
const BOXING_HIT_FIRST_CLIP = {
  source: 'boxing.mp3',
  startMs: 430,
  endMs: 640,
  file: 'boxing_hit_first.wav'
};

/** 拳套冲入提前量：CSS punch ~280ms，命中约在 48% ≈ 134ms */
const GLOVE_LEAD_MS = 134;

const FLY_IN_AT = 30;
const FLY_IN_MS = 420;
/** 头像到位后稍停再启音频/连击 */
const COMBO_AUDIO_DELAY_AFTER_FLY = 80;

/**
 * @param {object=} opts
 * @returns {Array<{time:number, action:string, side?:string, punchIndex?:number, sound?:string, volume?:number, seekMs?:number}>}
 */
function buildBoxingReactionTimeline(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const dizzyMs = o.dizzyMs != null ? o.dizzyMs : 1000;
  const chargeMs = o.chargeMs != null ? o.chargeMs : 500;
  const flyBackMs = o.flyBackMs != null ? o.flyBackMs : 620;
  const hits = BOXING_AUDIO_HIT_MS.slice();
  const comboAudioAt = FLY_IN_AT + FLY_IN_MS + COMBO_AUDIO_DELAY_AFTER_FLY;

  const events = [];
  events.push({ time: FLY_IN_AT, action: 'fly_in' });
  // 连击：整段 boxing 节奏轨（只播一次）
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
    events.push({
      time: Math.max(comboAudioAt, hitAt - GLOVE_LEAD_MS),
      action: 'glove_enter',
      side: side,
      punchIndex: i
    });
    events.push({
      time: hitAt,
      action: 'hit',
      side: side,
      punchIndex: i
    });
  }

  const lastHitAt = comboAudioAt + hits[hits.length - 1];
  const dizzyAt = lastHitAt + 280;
  events.push({ time: dizzyAt, action: 'dizzy_start' });

  const chargeAt = dizzyAt + dizzyMs;
  events.push({ time: chargeAt, action: 'finale_charge' });

  // 终结：蓄力后延迟命中；只播第一拳独立片段，不重播完整 boxing
  const finaleHitAt = chargeAt + chargeMs;
  events.push({
    time: Math.max(chargeAt + 40, finaleHitAt - GLOVE_LEAD_MS),
    action: 'finale_glove',
    side: 'right'
  });
  events.push({
    time: finaleHitAt,
    action: 'finale_hit',
    side: 'right',
    sound: 'boxing_hit_first',
    volume: 1,
    seekMs: 0
  });

  const flyBackAt = finaleHitAt + 180;
  events.push({ time: flyBackAt, action: 'fly_back_start' });
  events.push({ time: flyBackAt + 140, action: 'fly_back_seat' });
  events.push({ time: flyBackAt + flyBackMs, action: 'restore_circle' });
  events.push({ time: flyBackAt + flyBackMs + 280, action: 'fade_out' });
  events.push({ time: flyBackAt + flyBackMs + 280 + 520, action: 'cleanup' });

  events.sort(function (a, b) {
    return a.time - b.time;
  });
  return events;
}

module.exports = {
  BOXING_AUDIO_HIT_MS: BOXING_AUDIO_HIT_MS,
  BOXING_HIT_FIRST_CLIP: BOXING_HIT_FIRST_CLIP,
  GLOVE_LEAD_MS: GLOVE_LEAD_MS,
  FLY_IN_MS: FLY_IN_MS,
  buildBoxingReactionTimeline: buildBoxingReactionTimeline
};
