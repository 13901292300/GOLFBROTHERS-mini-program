/**
 * 互动反应音效（独立于动画 / 记分逻辑）
 * 资源目录：miniprogram/subpackages/scoring/assets/sounds/
 *
 * 注意：微信端在「动画 setData 同帧」同步 createInnerAudioContext / seek / play
 * 容易触发原生层与页面合成抢占，表现为全屏闪白。因此：
 * - 实例按 key 复用（不每次新建）
 * - 页面 onReady 预热 create（命中路径不再首次建实例）
 * - play 推迟到下一拍（错开当前 setData 同步栈）
 */

const SOUND_SRC = {
  /** Demo bucket：水桶.mov 有效倒水段（1170–1920ms），翻转倒水主音 */
  bucket_water: '/subpackages/scoring/assets/sounds/bucket_water.wav',
  /** Demo bucket：到达提示（1175–1310ms） */
  bucket_start: '/subpackages/scoring/assets/sounds/bucket_start.wav',
  /** Demo bucket：与 bucket_water 同段，timeline 别名 */
  bucket_pour: '/subpackages/scoring/assets/sounds/bucket_pour.wav',
  /** Demo bucket：尾部短促（1720–1920ms），资源保留 */
  bucket_end: '/subpackages/scoring/assets/sounds/bucket_end.wav',
  egg_hit: '/subpackages/scoring/assets/sounds/egg_hit.wav',
  egg_hit_finale: '/subpackages/scoring/assets/sounds/egg_hit_finale.wav',
  /** Demo boxing：由 音频文件/拳击.mov 转码；连击整段节奏 */
  boxing: '/subpackages/scoring/assets/sounds/boxing.wav',
  /** Demo boxing 终结拳：从 boxing.wav 截取第一拳片段（430–640ms） */
  boxing_hit_first: '/subpackages/scoring/assets/sounds/boxing_hit_first.wav',
  /** Demo kiss：亲吻.mov 有效接触段（540–900ms） */
  kiss: '/subpackages/scoring/assets/sounds/kiss.wav',
  /** Demo flower：送花.mov 有效段（220–900ms），到达目标瞬间播放 */
  flower_send: '/subpackages/scoring/assets/sounds/flower_send.wav'
};

/** @type {Object.<string, any>} */
const _players = {};

function _getOrCreatePlayer(key) {
  const src = SOUND_SRC[key];
  if (!src) return null;
  let audio = _players[key];
  if (audio) return audio;
  audio = wx.createInnerAudioContext();
  audio.src = src;
  audio.obeyMuteSwitch = true;
  audio.onError(function (err) {
    console.log('[reaction-sound] error', key, err);
  });
  _players[key] = audio;
  return audio;
}

/**
 * 预创建 InnerAudioContext（不播放）。
 * 应在页面 onReady / 首帧空闲时调用，避免命中动画 setData 同帧首次 create。
 * @param {string[]=} keys 不传则预热全部
 */
function warmReactionSounds(keys) {
  const list = keys && keys.length ? keys : Object.keys(SOUND_SRC);
  for (let i = 0; i < list.length; i++) {
    const k = list[i];
    if (SOUND_SRC[k]) _getOrCreatePlayer(k);
  }
}

/**
 * @param {string} soundKey
 * @param {{ volume?: number, seekMs?: number }=} opts
 */
function _playNow(soundKey, opts) {
  const audio = _getOrCreatePlayer(soundKey);
  if (!audio) return;
  const o = opts && typeof opts === 'object' ? opts : {};
  let volume = o.volume != null ? Number(o.volume) : 1;
  if (!Number.isFinite(volume)) volume = 1;
  if (volume < 0) volume = 0;
  if (volume > 1) volume = 1;
  try {
    audio.stop();
  } catch (e) {
    /* ignore */
  }
  try {
    audio.volume = volume;
  } catch (e) {
    /* ignore */
  }
  const seekMs = o.seekMs != null ? Number(o.seekMs) : 0;
  const seekSec = Number.isFinite(seekMs) && seekMs > 0 ? seekMs / 1000 : 0;
  try {
    audio.seek(seekSec);
  } catch (e) {
    /* ignore */
  }
  audio.play();
}

/**
 * 播放反应音效（可重复触发；同 key 会停掉再播）。
 * 播放动作 defer 到下一拍，避免与页面 setData 同帧抢合成。
 * @param {string} key 音效键，如 'bucket_water' | 'boxing'
 * @param {{ volume?: number, seekMs?: number }=} opts
 */
function playReactionSound(key, opts) {
  const soundKey = key != null ? String(key).trim() : '';
  if (!soundKey || !SOUND_SRC[soundKey]) {
    console.log('[reaction-sound] unknown key', soundKey);
    return;
  }
  const playOpts = opts && typeof opts === 'object' ? opts : {};
  try {
    const run = function () {
      try {
        _playNow(soundKey, playOpts);
      } catch (err) {
        console.log('[reaction-sound] play failed', soundKey, err);
      }
    };
    if (typeof wx !== 'undefined' && typeof wx.nextTick === 'function') {
      wx.nextTick(run);
    } else {
      setTimeout(run, 0);
    }
  } catch (err) {
    console.log('[reaction-sound] play failed', soundKey, err);
  }
}

/** 停止指定 key（若正在播放） */
function stopReactionSound(key) {
  const soundKey = key != null ? String(key).trim() : '';
  const audio = _players[soundKey];
  if (!audio) return;
  try {
    audio.stop();
  } catch (e) {
    /* ignore */
  }
}

/**
 * 页面卸载时释放（可选）。
 */
function destroyReactionSounds() {
  const keys = Object.keys(_players);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const audio = _players[k];
    if (audio) {
      try {
        audio.stop();
        audio.destroy();
      } catch (e) {
        /* ignore */
      }
      delete _players[k];
    }
  }
}

module.exports = {
  SOUND_SRC: SOUND_SRC,
  warmReactionSounds: warmReactionSounds,
  playReactionSound: playReactionSound,
  stopReactionSound: stopReactionSound,
  destroyReactionSounds: destroyReactionSounds
};
