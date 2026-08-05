/**
 * 互动反应音效（独立于动画 / 记分逻辑）
 * 资源目录：miniprogram/assets/sounds/
 *
 * 注意：微信端在「动画 setData 同帧」同步 createInnerAudioContext / seek / play
 * 容易触发原生层与页面合成抢占，表现为全屏闪白。因此：
 * - 实例按 key 复用（不每次新建）
 * - 页面 onReady 预热 create（命中路径不再首次建实例）
 * - play 推迟到下一拍（错开当前 setData 同步栈）
 */

const SOUND_SRC = {
  bucket_water: '/assets/sounds/bucket_water.wav',
  egg_hit: '/assets/sounds/egg_hit.wav',
  egg_hit_finale: '/assets/sounds/egg_hit_finale.wav'
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

function _playNow(soundKey) {
  const audio = _getOrCreatePlayer(soundKey);
  if (!audio) return;
  try {
    audio.stop();
  } catch (e) {
    /* ignore */
  }
  try {
    // 部分机型在未 canplay 时 seek 会卡住原生层；失败则直接 play
    audio.seek(0);
  } catch (e) {
    /* ignore */
  }
  audio.play();
}

/**
 * 播放反应音效（可重复触发；同 key 会停掉再播）。
 * 播放动作 defer 到下一拍，避免与页面 setData 同帧抢合成。
 * @param {string} key 音效键，如 'bucket_water'
 */
function playReactionSound(key) {
  const soundKey = key != null ? String(key).trim() : '';
  if (!soundKey || !SOUND_SRC[soundKey]) {
    console.log('[reaction-sound] unknown key', soundKey);
    return;
  }
  try {
    const run = function () {
      try {
        _playNow(soundKey);
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
  destroyReactionSounds: destroyReactionSounds
};
