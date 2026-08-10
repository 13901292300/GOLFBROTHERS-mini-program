/**
 * 球友圈视频上传服务边界。
 *
 * 当前固定本地适配器：仅持久化到 USER_DATA_PATH，storageMode='local'。
 * 不得伪造远端上传成功；UI 不得声称「已上传云端」。
 *
 * 远端协议预留：
 *   uploadVideo({ tempFilePath, thumbTempFilePath?, duration?, size?, width?, height?, mediaId? })
 *   → { ok, mediaId, path, remoteUrl, posterPath, posterRemoteUrl, storageMode, duration, size, width, height, videoFormat, error }
 */
const playerMomentMedia = require('./playerMomentMedia.js');

const STORAGE_MODE_LOCAL = 'local';

function _trim(v) {
  return v == null ? '' : String(v).trim();
}

function _localUploadVideo(input) {
  const src = input && typeof input === 'object' ? input : {};
  return playerMomentMedia.persistMomentVideoLocal(src).then(function (res) {
    if (!res || !res.ok) {
      return {
        ok: false,
        mediaId: '',
        path: '',
        remoteUrl: '',
        posterPath: '',
        posterRemoteUrl: '',
        storageMode: STORAGE_MODE_LOCAL,
        duration: 0,
        size: 0,
        width: 0,
        height: 0,
        videoFormat: '',
        error: (res && res.error) || 'upload_failed'
      };
    }
    return {
      ok: true,
      mediaId: res.mediaId || '',
      path: res.path || '',
      remoteUrl: '',
      posterPath: res.posterPath || '',
      posterRemoteUrl: '',
      storageMode: STORAGE_MODE_LOCAL,
      duration: Number(res.duration) || 0,
      size: Number(res.size) || 0,
      width: Number(res.width) || 0,
      height: Number(res.height) || 0,
      videoFormat: res.videoFormat || '',
      error: ''
    };
  });
}

let _adapter = {
  uploadVideo: _localUploadVideo
};

/**
 * 预留：切换上传适配器。当前产品路径不调用。
 */
function setAdapter(adapter) {
  if (!adapter || typeof adapter.uploadVideo !== 'function') {
    throw new Error('momentMediaUploadService.setAdapter: invalid adapter');
  }
  _adapter = adapter;
}

/**
 * @returns {Promise<object>}
 */
function uploadVideo(input) {
  const src = input && typeof input === 'object' ? input : {};
  // 剥离远端伪字段，避免页面伪造 remoteUrl
  const safe = {
    tempFilePath: src.tempFilePath || src.path || '',
    thumbTempFilePath: src.thumbTempFilePath || src.posterTempFilePath || '',
    duration: src.duration,
    size: src.size,
    width: src.width,
    height: src.height,
    mediaId: src.mediaId
  };
  return Promise.resolve()
    .then(function () {
      return (_adapter || { uploadVideo: _localUploadVideo }).uploadVideo(safe);
    })
    .then(function (result) {
      if (!result || typeof result !== 'object') {
        return {
          ok: false,
          error: 'upload_failed',
          storageMode: STORAGE_MODE_LOCAL
        };
      }
      // 本地适配器强制 local；远端适配器可返回 cloud 等，但不得由页面伪造
      return Object.assign({}, result, {
        ok: !!result.ok,
        storageMode: _trim(result.storageMode) || STORAGE_MODE_LOCAL,
        remoteUrl: result.remoteUrl || '',
        posterRemoteUrl: result.posterRemoteUrl || ''
      });
    });
}

module.exports = {
  STORAGE_MODE_LOCAL: STORAGE_MODE_LOCAL,
  setAdapter: setAdapter,
  uploadVideo: uploadVideo
};
