/**
 * Demo：flower reaction timeline（仅 demo-weekend-amateur）
 *
 * 源：音频文件/送花.mov
 * 有效声段约 220–900ms（此前近静音）→ flower_send.wav
 *
 * 声音触发：flower_arrive —— 花真正到达目标瞬间（self=屏中 / observer=头像）
 * 飞行阶段无声；不在点击时播完整轨。
 */

const FLOWER_AUDIO_CLIP = {
  source: '送花.mov',
  startMs: 220,
  endMs: 900,
  file: 'flower_send.wav'
};

/** 与现有动画 fly 时长对齐（用于文档/调度；实际到达以弧线结束为准） */
const FLOWER_TIMING = {
  self: { flyAt: 30, flyMs: 1200 },
  observer: { flyAt: 40, flyMs: 1400 }
};

/**
 * @param {'self'|'observer'} mode
 * @returns {Array<{time:number, action:string, sound?:string, volume?:number, seekMs?:number}>}
 */
function buildFlowerReactionTimeline(mode) {
  const m = mode === 'observer' ? 'observer' : 'self';
  const t = FLOWER_TIMING[m];
  const arriveAt = t.flyAt + t.flyMs;
  return [
    { time: t.flyAt, action: 'fly_start' },
    {
      time: arriveAt,
      action: 'flower_arrive',
      sound: 'flower_send',
      volume: 0.92,
      seekMs: 0
    }
  ];
}

module.exports = {
  FLOWER_AUDIO_CLIP: FLOWER_AUDIO_CLIP,
  FLOWER_TIMING: FLOWER_TIMING,
  buildFlowerReactionTimeline: buildFlowerReactionTimeline
};
