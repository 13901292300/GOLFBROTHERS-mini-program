/**
 * Demo：rocket reaction timeline（仅 demo-weekend-amateur）
 *
 * rocket-final-return-smoke-v5（Self）：
 *   rocket_hit → explosion_first → black_face → launch_up → fall_down
 *   → explosion_second_ultimate → final_black_face
 *   → black_face_return → rocket_land → smoke_after_land
 *   → smoke_fade → restore_avatar → cleanup
 *
 * 黑脸+爆炸头贯穿返回/落座；坐稳后头顶青烟约1s，再恢复。
 *
 * 资源：rocket_black_face.png / rocket_eyes_only_face.png
 * 音频：rocket.mp3（不改音效系统结构）。
 */

const ROCKET_AUDIO = {
  source: '音频文件/火箭.mp3',
  file: 'rocket.mp3',
  soundKey: 'rocket',
  path: '/subpackages/reaction/assets/sounds/rocket.mp3',
  durationMs: 1833,
  peakMs: 660,
  loudOnsetMs: 660
};

const ROCKET_SELF_TIMING = {
  toCenterAt: 0,
  toCenterMs: 380,
  flyLeadMs: 40,
  flyMs: 620,
  hitVolume: 1,
  /** 第一次爆炸：火光 + 烟雾 */
  explosion1Ms: 800,
  blackFaceDelayMs: 120,
  /** 炸飞 */
  launchLeadMs: 280,
  launchMs: 1700,
  launchScaleEnd: 0.3,
  launchSpinMin: 360,
  launchSpinMax: 720,
  fallMs: 950,
  /** 超级二次爆炸 */
  explosion2LeadMs: 80,
  explosion2Ms: 900,
  explosion2Volume: 1,
  /** final 黑脸（双眼+爆炸头）出现后再滚回 */
  finalBlackFaceDelayMs: 160,
  finalBlackFaceHoldMs: 280,
  /** 黑脸滚回座位：±180~360° */
  returnMs: 860,
  returnSpinMin: 180,
  returnSpinMax: 360,
  /** 落座停稳 */
  landSettleMs: 80,
  /** 头顶青烟约 1s，再消散后恢复 */
  smokeAfterLandMs: 1000,
  smokeFadeMs: 420,
  restoreMs: 220,
  cleanupAfterRestoreMs: 160,
  centerScale: 4,
  impactOffsetYRatio: 0.12,
  launchUpRatio: 0.22
};

/**
 * Self 火箭 timeline（v5 收尾：黑脸返回 + 落座青烟）
 * @param {object=} opts
 */
function buildRocketSelfTimeline(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const t = ROCKET_SELF_TIMING;
  const audio = ROCKET_AUDIO;

  const toCenterAt = t.toCenterAt;
  const flyAt = toCenterAt + t.toCenterMs + t.flyLeadMs;
  const hitAt = flyAt + t.flyMs;
  const explosion1At = hitAt;
  const blackFaceAt = hitAt + (t.blackFaceDelayMs != null ? t.blackFaceDelayMs : 120);
  const launchAt = hitAt + (t.launchLeadMs != null ? t.launchLeadMs : 280);
  const fallAt = launchAt + t.launchMs;
  const explosion2At =
    fallAt + t.fallMs + (t.explosion2LeadMs != null ? t.explosion2LeadMs : 80);
  const finalBlackFaceAt =
    explosion2At +
    (t.finalBlackFaceDelayMs != null ? t.finalBlackFaceDelayMs : 160);
  const returnAt =
    finalBlackFaceAt +
    (t.finalBlackFaceHoldMs != null ? t.finalBlackFaceHoldMs : 280);
  const landAt = returnAt + t.returnMs;
  const smokeAt = landAt + (t.landSettleMs != null ? t.landSettleMs : 80);
  const smokeFadeAt = smokeAt + t.smokeAfterLandMs;
  const restoreAt = smokeFadeAt + t.smokeFadeMs;
  const cleanupAt =
    restoreAt +
    (t.restoreMs != null ? t.restoreMs : 220) +
    (t.cleanupAfterRestoreMs != null ? t.cleanupAfterRestoreMs : 160);

  const launchSpin =
    o.launchSpin != null
      ? Number(o.launchSpin)
      : t.launchSpinMin +
        Math.floor(Math.random() * (t.launchSpinMax - t.launchSpinMin + 1));
  const launchSpinSign = Math.random() > 0.5 ? 1 : -1;

  const returnSpinAbs =
    o.returnSpin != null
      ? Math.abs(Number(o.returnSpin))
      : t.returnSpinMin +
        Math.floor(Math.random() * (t.returnSpinMax - t.returnSpinMin + 1));
  const returnSpinSign = Math.random() > 0.5 ? 1 : -1;

  const events = [
    { time: toCenterAt, action: 'avatar_to_center', duration: t.toCenterMs },
    { time: flyAt, action: 'rocket_enter', duration: t.flyMs },
    {
      time: hitAt,
      action: 'rocket_hit',
      sound: 'rocket',
      volume: t.hitVolume,
      seekMs: audio.peakMs
    },
    {
      time: explosion1At,
      action: 'explosion_first',
      intensity: 'large',
      duration: t.explosion1Ms
    },
    { time: blackFaceAt, action: 'black_face' },
    {
      time: launchAt,
      action: 'launch_up',
      duration: t.launchMs,
      scaleEnd: t.launchScaleEnd,
      spin: launchSpinSign * launchSpin
    },
    {
      time: fallAt,
      action: 'fall_down',
      duration: t.fallMs
    },
    {
      time: explosion2At,
      action: 'explosion_second_ultimate',
      intensity: 'super',
      duration: t.explosion2Ms,
      sound: 'rocket',
      volume: t.explosion2Volume != null ? t.explosion2Volume : 1,
      seekMs: audio.peakMs
    },
    {
      time: finalBlackFaceAt,
      action: 'final_black_face'
    },
    {
      time: returnAt,
      action: 'black_face_return',
      duration: t.returnMs,
      spin: returnSpinSign * returnSpinAbs
    },
    {
      time: landAt,
      action: 'rocket_land'
    },
    {
      time: smokeAt,
      action: 'smoke_after_land',
      duration: t.smokeAfterLandMs
    },
    {
      time: smokeFadeAt,
      action: 'smoke_fade',
      duration: t.smokeFadeMs
    },
    {
      time: restoreAt,
      action: 'restore_avatar'
    },
    { time: cleanupAt, action: 'cleanup' }
  ];

  events.sort(function (a, b) {
    return a.time - b.time;
  });
  return events;
}

/** @deprecated 兼容旧调用 → Self */
function buildRocketReactionTimeline(mode, opts) {
  return buildRocketSelfTimeline(opts);
}

module.exports = {
  ROCKET_AUDIO: ROCKET_AUDIO,
  ROCKET_SELF_TIMING: ROCKET_SELF_TIMING,
  buildRocketSelfTimeline: buildRocketSelfTimeline,
  buildRocketReactionTimeline: buildRocketReactionTimeline
};
