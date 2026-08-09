/**
 * Demo：egg combo reaction timeline（仅 demo-weekend-amateur）
 *
 * reaction-view-model-v2：仅目标头像中央舞台（Self）。
 * 音源：西红柿.mov → egg_hit_1..6 + egg_hit_final
 */

const EGG_COMBO_HIT_ONSETS_MS = [0, 328, 727, 1091, 1530, 1934];

const EGG_AUDIO = {
  source: '音频文件/西红柿.mov',
  combo: 'egg_combo.wav',
  final: 'egg_hit_final.wav',
  hits: [
    'egg_hit_1.wav',
    'egg_hit_2.wav',
    'egg_hit_3.wav',
    'egg_hit_4.wav',
    'egg_hit_5.wav',
    'egg_hit_6.wav'
  ],
  comboDurationMs: 2138,
  finalDurationMs: 776
};

const EGG_SELF_TIMING = {
  centerScale: 4,
  toCenterMs: 420,
  toCenterAt: 40,
  direction: 'right',
  flyMarkerAt: 480,
  sequenceAt: 500,
  normalCount: 6,
  hitIntervalMs: 340,
  normalFlyMs: 320,
  finalePauseMs: 420,
  finaleFlyMs: 520,
  overlayLeadMs: 80,
  dripFlowMs: 1200,
  dripHoldMs: 1500,
  returnMs: 720,
  restoreGapMs: 80,
  hitVolume: 0.92,
  finalVolume: 1
};

const EGG_TIMING = {
  startAt: 40,
  normalFlyMs: 360,
  finalePauseMs: 520,
  selfFinaleFlyMs: 560,
  normalCount: 6,
  hitVolume: 0.92,
  finalVolume: 1
};

function buildEggSelfReactionTimeline() {
  const t = EGG_SELF_TIMING;
  const events = [];
  const n = t.normalCount;
  const flyMs = t.normalFlyMs;
  const interval = t.hitIntervalMs;

  events.push({
    time: t.toCenterAt,
    action: 'self_avatar_center',
    duration: t.toCenterMs
  });

  events.push({
    time: t.flyMarkerAt,
    action: 'egg_self_fly',
    direction: t.direction
  });

  events.push({
    time: t.sequenceAt,
    action: 'egg_hit_sequence',
    count: n,
    direction: t.direction
  });

  let lastHitAt = t.sequenceAt;
  for (let i = 0; i < n; i++) {
    const launchAt = t.sequenceAt + i * interval;
    const hitAt = launchAt + flyMs;
    lastHitAt = hitAt;
    events.push({
      time: launchAt,
      action: 'egg_launch',
      index: i,
      direction: t.direction,
      finale: false
    });
    events.push({
      time: hitAt,
      action: 'egg_hit_' + (i + 1),
      index: i,
      sound: 'egg_hit_' + (i + 1),
      volume: t.hitVolume,
      seekMs: 0,
      finale: false
    });
  }

  const finaleLaunchAt = lastHitAt + t.finalePauseMs;
  const finaleHitAt = finaleLaunchAt + t.finaleFlyMs;

  events.push({
    time: finaleLaunchAt,
    action: 'egg_final_launch',
    index: n,
    direction: t.direction,
    finale: true
  });
  events.push({
    time: finaleHitAt,
    action: 'egg_final_hit',
    index: n,
    sound: 'egg_hit_final',
    volume: t.finalVolume,
    seekMs: 0,
    finale: true
  });

  const overlayAt = finaleHitAt + t.overlayLeadMs;
  events.push({
    time: overlayAt,
    action: 'egg_overlay_show'
  });

  const dripHoldAt = overlayAt + t.dripFlowMs;
  events.push({
    time: dripHoldAt,
    action: 'egg_drip_hold',
    duration: t.dripHoldMs
  });

  const returnAt = dripHoldAt + t.dripHoldMs;
  events.push({
    time: returnAt,
    action: 'avatar_return',
    duration: t.returnMs
  });

  events.push({
    time: returnAt + t.returnMs + t.restoreGapMs,
    action: 'restore'
  });

  events.sort(function (a, b) {
    return a.time - b.time;
  });
  return events;
}

/** @deprecated 兼容旧调用 → Self */
function buildEggReactionTimeline() {
  return buildEggSelfReactionTimeline();
}

module.exports = {
  EGG_COMBO_HIT_ONSETS_MS: EGG_COMBO_HIT_ONSETS_MS,
  EGG_AUDIO: EGG_AUDIO,
  EGG_TIMING: EGG_TIMING,
  EGG_SELF_TIMING: EGG_SELF_TIMING,
  buildEggSelfReactionTimeline: buildEggSelfReactionTimeline,
  buildEggReactionTimeline: buildEggReactionTimeline
};
