/**
 * 球友圈媒体服务（图片 + 视频）。
 * 使用 USER_DATA_PATH，禁止 base64 写入 Storage；预留 storageMode 云迁移。
 *
 * 统一 media 项：{ mediaId, type:'image'|'video', path, remoteUrl, storageMode, width, height,
 *   duration, size, posterPath, posterRemoteUrl, videoFormat, moderation* }
 * 旧 images 由 Store / normalizeMomentMediaList 投影为 type=image。
 */

const MOMENT_MEDIA_DIR = 'gb_moments';
const MEDIA_DEBUG = false;

const IMAGES_MAX = 9;
const VIDEO_MAX = 1;
const VIDEO_MAX_DURATION_SEC = 60;
/** 首版视频体积上限 100MB；文案须展示实际限制 */
const VIDEO_MAX_SIZE_BYTES = 100 * 1024 * 1024;
const STORAGE_MODE_LOCAL = 'local';
const STORAGE_MODE_LOCAL_USER_DATA = 'local_user_data';

function mediaDebug() {
  if (!MEDIA_DEBUG) return;
  try {
    console['warn'].apply(console, arguments);
  } catch (e) { /* ignore */ }
}

function _userDataRoot() {
  try {
    return wx.env && wx.env.USER_DATA_PATH ? String(wx.env.USER_DATA_PATH) : '';
  } catch (e) {
    return '';
  }
}

function _getFsm() {
  try {
    return wx.getFileSystemManager();
  } catch (e) {
    return null;
  }
}

function _ensureDirSync(fsm, dirPath) {
  if (!fsm || !dirPath) return false;
  try {
    fsm.accessSync(dirPath);
    return true;
  } catch (e) {
    try {
      if (typeof fsm.mkdirSync === 'function') {
        try {
          fsm.mkdirSync(dirPath, true);
        } catch (e2) {
          fsm.mkdirSync({ dirPath: dirPath, recursive: true });
        }
        return true;
      }
    } catch (e3) {
      mediaDebug('[moment-media] mkdir failed');
    }
  }
  return false;
}

function _extFromPath(path) {
  const s = path != null ? String(path) : '';
  const m = s.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  if (!m) return 'jpg';
  const ext = m[1].toLowerCase();
  if (ext === 'jpeg' || ext === 'jpg' || ext === 'png' || ext === 'webp' || ext === 'gif') {
    return ext === 'jpeg' ? 'jpg' : ext;
  }
  return 'jpg';
}

function _videoExtFromPath(path) {
  const s = path != null ? String(path) : '';
  const m = s.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  const ext = m ? m[1].toLowerCase() : 'mp4';
  if (
    ext === 'mp4' ||
    ext === 'mov' ||
    ext === 'm4v' ||
    ext === '3gp' ||
    ext === 'avi'
  ) {
    return ext;
  }
  return 'mp4';
}

function _trim(v) {
  return v == null ? '' : String(v).trim();
}

function formatDurationLabel(seconds) {
  const n = Math.max(0, Math.floor(Number(seconds) || 0));
  const m = Math.floor(n / 60);
  const s = n % 60;
  return m + ':' + (s < 10 ? '0' + s : String(s));
}

function formatVideoSizeLimitLabel() {
  const mb = Math.round(VIDEO_MAX_SIZE_BYTES / (1024 * 1024));
  return mb + 'MB';
}

function _newMediaId(prefix) {
  return (
    (prefix || 'mmed_') +
    Date.now().toString(36) +
    '_' +
    Math.random().toString(36).slice(2, 8)
  );
}

/** 旧数据缺 mediaId 时按 basename 生成稳定 id，避免每次投影随机导致补丁宽高失效 */
function _stableMediaId(prefix, path) {
  const base = _basename(path).replace(/\.[^.]+$/, '');
  const safe = base.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
  if (!safe || safe.length < 3) return _newMediaId(prefix);
  return (prefix || 'mmed_') + safe;
}

function _looksLikeVideoPath(path) {
  const s = path != null ? String(path) : '';
  return /\.(mp4|mov|m4v|3gp|avi)(?:\?|$)/i.test(s);
}

function _isLocalStorageMode(mode) {
  const m = _trim(mode);
  return (
    !m ||
    m === STORAGE_MODE_LOCAL ||
    m === STORAGE_MODE_LOCAL_USER_DATA
  );
}

function _basename(path) {
  const s = path != null ? String(path).replace(/\\/g, '/') : '';
  if (!s) return '';
  const parts = s.split('/');
  return parts[parts.length - 1] || '';
}

function classifyPathType(path) {
  const p = path != null ? String(path).trim() : '';
  if (!p) return 'empty';
  if (/^[A-Za-z]:[\\/]/.test(p) || p.indexOf('\\\\') === 0) return 'windows_abs';
  if (p.indexOf('wxfile://tmp') === 0) return 'wxfile_tmp';
  if (p.indexOf('http://tmp') === 0) return 'http_tmp';
  if (p.indexOf('wxfile://usr/' + MOMENT_MEDIA_DIR) === 0) return 'wxfile_usr_gb_moments';
  if (p.indexOf('http://usr/' + MOMENT_MEDIA_DIR) === 0) return 'http_usr_gb_moments';
  if (p.indexOf('wxfile://usr/') === 0) return 'wxfile_usr_other';
  if (p.indexOf('http://usr/') === 0) return 'http_usr_other';
  if (p.indexOf('store_') >= 0) return 'store_saved';
  if (p.indexOf(MOMENT_MEDIA_DIR) >= 0) return 'gb_moments_other';
  if (p.indexOf('wxfile://') === 0) return 'wxfile_other';
  if (/^https?:\/\//.test(p)) return 'http_remote';
  return 'unknown';
}

function _isTempPath(path) {
  const t = classifyPathType(path);
  return t === 'wxfile_tmp' || t === 'http_tmp';
}

function _isLocalPersistPath(path) {
  const p = path != null ? String(path) : '';
  if (!p || _isTempPath(p)) return false;
  const root = _userDataRoot();
  if (root && p.indexOf(root) === 0 && p.indexOf(MOMENT_MEDIA_DIR) >= 0) return true;
  if (p.indexOf('store_') >= 0 || p.indexOf('usr/') >= 0) return true;
  return false;
}

function _toRenderablePath(path) {
  const p = path != null ? String(path).trim() : '';
  if (!p) return '';
  // DevTools 常见 http://usr；真机常见 wxfile://usr。二者都可渲染，保持原协议优先。
  if (/^[A-Za-z]:[\\/]/.test(p) || p.indexOf('\\\\') === 0) {
    const base = _basename(p);
    const root = _userDataRoot();
    if (root && base && p.indexOf(MOMENT_MEDIA_DIR) >= 0) {
      return root.replace(/\/$/, '') + '/' + MOMENT_MEDIA_DIR + '/' + base;
    }
    return '';
  }
  return p.replace(/\\/g, '/');
}

function _pathCandidates(path) {
  const primary = _toRenderablePath(path);
  const out = [];
  const push = function (v) {
    if (!v) return;
    if (out.indexOf(v) < 0) out.push(v);
  };
  push(primary);
  if (primary.indexOf('http://usr') === 0) {
    push(primary.replace(/^http:\/\/usr/, 'wxfile://usr'));
  } else if (primary.indexOf('wxfile://usr') === 0) {
    push(primary.replace(/^wxfile:\/\/usr/, 'http://usr'));
  }
  const root = _userDataRoot();
  const base = _basename(primary || path);
  if (root && base && String(path || '').indexOf(MOMENT_MEDIA_DIR) >= 0) {
    push(root.replace(/\/$/, '') + '/' + MOMENT_MEDIA_DIR + '/' + base);
  }
  return out;
}

/**
 * 安全文件存在性检查：不删记录、不打完整路径日志。
 * @returns {{ ok:boolean, exists:boolean, size:number, pathType:string }}
 */
function inspectLocalFile(path) {
  const pathType = classifyPathType(path);
  const fsm = _getFsm();
  if (!fsm) {
    return { ok: false, exists: false, size: 0, pathType: pathType };
  }
  const candidates = _pathCandidates(path);
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    try {
      if (typeof fsm.accessSync === 'function') {
        fsm.accessSync(c);
      }
      let size = 0;
      if (typeof fsm.statSync === 'function') {
        const st = fsm.statSync(c);
        const rawSize =
          st && st.size != null
            ? st.size
            : st && st.stats && st.stats.size != null
              ? st.stats.size
              : 0;
        size = Number(rawSize) || 0;
      } else {
        // 无 stat 时 access 成功即视为存在
        size = 1;
      }
      if (size > 0) {
        return { ok: true, exists: true, size: size, pathType: classifyPathType(c), resolvedPath: c };
      }
    } catch (e) {
      /* try next */
    }
  }
  return { ok: true, exists: false, size: 0, pathType: pathType };
}

function _verifySavedPath(fsm, path) {
  if (!fsm || !path) return '';
  const info = inspectLocalFile(path);
  if (info.exists && info.size > 0) {
    return info.resolvedPath || _toRenderablePath(path);
  }
  return '';
}

function _writeBinaryToDest(fsm, tempPath, dest) {
  if (!fsm || !tempPath || !dest) return false;
  try {
    if (typeof fsm.readFileSync === 'function' && typeof fsm.writeFileSync === 'function') {
      const data = fsm.readFileSync(tempPath);
      fsm.writeFileSync(dest, data);
      return !!_verifySavedPath(fsm, dest);
    }
  } catch (e) {
    mediaDebug('[moment-media] writeBinary failed');
  }
  return false;
}

function _copyToDest(fsm, tempPath, dest) {
  if (!fsm || !tempPath || !dest) return false;
  try {
    if (typeof fsm.copyFileSync === 'function') {
      fsm.copyFileSync(tempPath, dest);
      return !!_verifySavedPath(fsm, dest);
    }
  } catch (e1) { /* async below */ }
  return false;
}

/** 优先 copy，避免大视频整文件读入 JS 堆；失败再回退二进制写入 */
function _persistLocalFileSync(fsm, tempPath, dest) {
  if (_copyToDest(fsm, tempPath, dest)) return true;
  return _writeBinaryToDest(fsm, tempPath, dest);
}

/**
 * 将临时图片持久化到 USER_DATA_PATH/gb_moments。
 * 写入后强制校验存在且 size>0；失败不写入半成品路径。
 * @returns {Promise<{ ok, mediaId?, path?, width?, height?, storageMode?, error? }>}
 */
function _readTempDimensions(temp) {
  return new Promise(function (resolve) {
    const width = Number(temp && temp.width) || 0;
    const height = Number(temp && temp.height) || 0;
    if (width > 0 && height > 0) {
      resolve({ width: width, height: height });
      return;
    }
    const src =
      temp && temp.tempFilePath != null ? String(temp.tempFilePath).trim() : '';
    if (!src) {
      resolve({ width: 0, height: 0 });
      return;
    }
    try {
      wx.getImageInfo({
        src: src,
        success: function (res) {
          resolve({
            width: Number(res && res.width) || 0,
            height: Number(res && res.height) || 0
          });
        },
        fail: function () {
          resolve({ width: width, height: height });
        }
      });
    } catch (e) {
      resolve({ width: width, height: height });
    }
  });
}

function persistMomentImage(tempFile, mediaIdHint) {
  return new Promise(function (resolve) {
    const temp =
      tempFile && typeof tempFile === 'object'
        ? tempFile
        : { tempFilePath: tempFile };
    const tempPath = temp.tempFilePath != null ? String(temp.tempFilePath).trim() : '';
    if (!tempPath) {
      resolve({ ok: false, error: 'empty_temp' });
      return;
    }
    const mediaId =
      (mediaIdHint && String(mediaIdHint).trim()) ||
      'mimg_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    const root = _userDataRoot();
    if (!root) {
      resolve({ ok: false, error: 'no_user_data_path' });
      return;
    }
    const fsm = _getFsm();
    if (!fsm) {
      resolve({ ok: false, error: 'no_fsm' });
      return;
    }
    const dir = root.replace(/\/$/, '') + '/' + MOMENT_MEDIA_DIR;
    _ensureDirSync(fsm, dir);
    const dest = dir + '/' + mediaId + '.' + _extFromPath(tempPath);

    _readTempDimensions(temp).then(function (dim) {
      const width = dim.width || 0;
      const height = dim.height || 0;
      _persistMomentImageBody(fsm, tempPath, dest, mediaId, width, height, resolve);
    });
  });
}

function _persistMomentImageBody(fsm, tempPath, dest, mediaId, width, height, resolve) {
    const finishOk = function (savedPath) {
      const verified = _verifySavedPath(fsm, savedPath || dest);
      if (!verified) {
        resolve({ ok: false, error: 'persist_unverified' });
        return;
      }
      resolve({
        ok: true,
        mediaId: mediaId,
        path: verified,
        width: width,
        height: height,
        storageMode: 'local_user_data'
      });
    };

    // 1) 同步 copy 优先，失败再二进制（与视频一致，降低堆峰值）
    if (_persistLocalFileSync(fsm, tempPath, dest)) {
      finishOk(dest);
      return;
    }

    // 3) 异步 copyFile → 校验 → saveFile(filePath) → saveFile 默认路径
    const trySaveFileToDest = function () {
      try {
        fsm.saveFile({
          tempFilePath: tempPath,
          filePath: dest,
          success: function (res) {
            finishOk((res && res.savedFilePath) || dest);
          },
          fail: function () {
            try {
              fsm.saveFile({
                tempFilePath: tempPath,
                success: function (res2) {
                  finishOk((res2 && res2.savedFilePath) || '');
                },
                fail: function () {
                  resolve({ ok: false, error: 'persist_failed' });
                }
              });
            } catch (e2) {
              resolve({ ok: false, error: 'persist_failed' });
            }
          }
        });
      } catch (e3) {
        resolve({ ok: false, error: 'persist_failed' });
      }
    };

    try {
      if (typeof fsm.copyFile === 'function') {
        fsm.copyFile({
          srcPath: tempPath,
          destPath: dest,
          success: function () {
            if (_verifySavedPath(fsm, dest)) {
              finishOk(dest);
            } else {
              trySaveFileToDest();
            }
          },
          fail: function () {
            trySaveFileToDest();
          }
        });
        return;
      }
    } catch (e4) { /* fall through */ }

    trySaveFileToDest();
}

/**
 * 批量持久化；任一张失败则清理本次已写入文件并返回失败。
 */
function persistMomentImages(tempFiles) {
  const list = Array.isArray(tempFiles) ? tempFiles : [];
  const saved = [];
  let chain = Promise.resolve({ ok: true, images: [] });

  list.forEach(function (file, index) {
    chain = chain.then(function (prev) {
      if (!prev.ok) return prev;
      return persistMomentImage(file).then(function (one) {
        if (!one.ok) {
          return cleanupMomentLocalFiles(saved).then(function () {
            return { ok: false, error: one.error || 'persist_failed', failIndex: index };
          });
        }
        const img = {
          mediaId: one.mediaId,
          path: one.path,
          width: one.width || 0,
          height: one.height || 0,
          storageMode: one.storageMode || 'local_user_data'
        };
        saved.push(img);
        return { ok: true, images: saved.slice() };
      });
    });
  });

  return chain;
}

/**
 * 仅允许清理应用自有 gb_moments 本地文件。
 * remote/cloud 不在此删除（不伪造服务端删除成功）。
 */
function _isOwnedGbMomentsPath(path) {
  const p = path != null ? String(path).trim() : '';
  if (!p) return false;
  if (classifyPathType(p) === 'http_remote') return false;
  if (p.indexOf(MOMENT_MEDIA_DIR) < 0) return false;
  return _isLocalPersistPath(p);
}

function _unlinkLocalPath(fsm, path) {
  if (!fsm || !path) return 0;
  if (!_isOwnedGbMomentsPath(path)) return 0;
  const candidates = _pathCandidates(path);
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (!_isOwnedGbMomentsPath(c) && classifyPathType(c) !== 'wxfile_usr_gb_moments' && classifyPathType(c) !== 'http_usr_gb_moments' && String(c).indexOf(MOMENT_MEDIA_DIR) < 0) {
      continue;
    }
    try {
      fsm.unlinkSync(c);
      return 1;
    } catch (e2) {
      /* try next */
    }
  }
  return 0;
}

/**
 * 仅删除本动态拥有的本地持久文件（local / local_user_data + gb_moments）。
 * remote/cloud：跳过，留给远端适配器；不假装已删服务器文件。
 * 支持图片 path、视频 path 与 posterPath；清理失败不抛错。
 */
function cleanupMomentLocalFiles(mediaOrImages) {
  const list = Array.isArray(mediaOrImages) ? mediaOrImages : [];
  const fsm = _getFsm();
  if (!fsm) return Promise.resolve({ cleaned: 0, skippedRemote: 0 });
  let cleaned = 0;
  let skippedRemote = 0;
  list.forEach(function (item) {
    if (!item || typeof item !== 'object') return;
    const mode = _trim(item.storageMode);
    if (mode === 'remote' || mode === 'cloud') {
      skippedRemote += 1;
      return;
    }
    if (!_isLocalStorageMode(item.storageMode)) return;
    const path = item.path != null ? String(item.path).trim() : '';
    if (path) cleaned += _unlinkLocalPath(fsm, path);
    const poster = item.posterPath != null ? String(item.posterPath).trim() : '';
    if (poster) cleaned += _unlinkLocalPath(fsm, poster);
  });
  return Promise.resolve({ cleaned: cleaned, skippedRemote: skippedRemote });
}

/** 统一清理入口（与 cleanupMomentLocalFiles 相同） */
function cleanupMomentMedia(media) {
  return cleanupMomentLocalFiles(media);
}

function _isModerationBlocked(status) {
  const s = _trim(status);
  return s === 'rejected' || s === 'takedown' || s === 'hidden';
}

/**
 * 投影用：解析可渲染路径；文件丢失时 unavailable=true，不删 Storage 记录。
 */
function resolveMomentImageForView(raw, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const skipInspect = !!opts.skipInspect;
  const src =
    raw && typeof raw === 'object'
      ? raw
      : typeof raw === 'string'
        ? { path: raw }
        : {};
  const storedPath = String(
    src.path || src.url || src.src || src.filePath || src.localPath || src.tempFilePath || ''
  ).trim();
  const mediaId =
    src.mediaId != null && String(src.mediaId).trim()
      ? String(src.mediaId).trim()
      : _stableMediaId('mimg_', storedPath);
  const width = Number(src.width) || 0;
  const height = Number(src.height) || 0;
  const storageMode = String(src.storageMode || 'local_user_data').trim() || 'local_user_data';

  if (!storedPath) {
    return {
      mediaId: mediaId,
      path: '',
      renderPath: '',
      width: width,
      height: height,
      storageMode: storageMode,
      unavailable: true
    };
  }

  const pathType = classifyPathType(storedPath);
  // 远程 https 图直接渲染（预留云迁移）
  if (pathType === 'http_remote' && /^https:\/\//.test(storedPath)) {
    return {
      mediaId: mediaId,
      path: storedPath,
      renderPath: storedPath,
      width: width,
      height: height,
      storageMode: storageMode,
      unavailable: false
    };
  }

  // Feed 投影跳过同步 FS，信任已持久化路径；缺文件由 image error 降级
  if (skipInspect) {
    const renderPath = _toRenderablePath(storedPath) || storedPath;
    return {
      mediaId: mediaId,
      path: storedPath,
      renderPath: renderPath,
      width: width,
      height: height,
      storageMode: storageMode,
      unavailable: !renderPath
    };
  }

  const fsm = _getFsm();
  if (!fsm) {
    const fallback = _toRenderablePath(storedPath);
    return {
      mediaId: mediaId,
      path: storedPath,
      renderPath: fallback,
      width: width,
      height: height,
      storageMode: storageMode,
      unavailable: !fallback
    };
  }

  const info = inspectLocalFile(storedPath);
  if (info.exists && info.size > 0) {
    const renderPath = info.resolvedPath || _toRenderablePath(storedPath);
    return {
      mediaId: mediaId,
      path: storedPath,
      renderPath: renderPath,
      width: width,
      height: height,
      storageMode: storageMode,
      unavailable: false
    };
  }

  // 临时路径失效 / 本地持久文件丢失 → 单图占位，保留记录
  return {
    mediaId: mediaId,
    path: storedPath,
    renderPath: '',
    width: width,
    height: height,
    storageMode: storageMode,
    unavailable: true
  };
}

function hydrateMomentImagesForView(images) {
  const list = Array.isArray(images) ? images : [];
  return list.map(resolveMomentImageForView).filter(Boolean);
}

/**
 * 诊断摘要：只返回数量 / storageMode / 脱敏路径类型，不含正文与完整路径。
 */
function summarizeMomentImages(images) {
  const list = Array.isArray(images) ? images : [];
  const byMode = {};
  const byType = {};
  let withPath = 0;
  let withMediaId = 0;
  let existing = 0;
  let missing = 0;
  list.forEach(function (img) {
    if (!img || typeof img !== 'object') return;
    if (img.mediaId) withMediaId += 1;
    if (img.path) withPath += 1;
    const mode = String(img.storageMode || 'missing');
    byMode[mode] = (byMode[mode] || 0) + 1;
    const t = classifyPathType(img.path);
    byType[t] = (byType[t] || 0) + 1;
    const info = inspectLocalFile(img.path);
    if (info.exists && info.size > 0) existing += 1;
    else missing += 1;
  });
  return {
    imageCount: list.length,
    withPath: withPath,
    withMediaId: withMediaId,
    storageModes: byMode,
    pathTypes: byType,
    filesExisting: existing,
    filesMissing: missing
  };
}

/* ===== 统一 media 模型 ===== */

/**
 * 规范化单条 media（未知 type 返回 null）。
 */
function normalizeMediaItem(raw) {
  if (typeof raw === 'string') {
    const p = _trim(raw);
    if (!p) return null;
    const asVideo = _looksLikeVideoPath(p);
    return {
      mediaId: _stableMediaId(asVideo ? 'mvid_' : 'mimg_', p),
      type: asVideo ? 'video' : 'image',
      path: p,
      remoteUrl: '',
      storageMode: asVideo ? STORAGE_MODE_LOCAL : STORAGE_MODE_LOCAL_USER_DATA,
      width: 0,
      height: 0,
      duration: 0,
      size: 0,
      posterPath: '',
      posterRemoteUrl: '',
      videoFormat: asVideo ? _videoExtFromPath(p) : '',
      moderationStatus: 'local_unreviewed',
      coverModerationStatus: 'local_unreviewed',
      moderationTaskId: null
    };
  }
  if (!raw || typeof raw !== 'object') return null;
  let type = _trim(raw.type).toLowerCase();
  const pathEarly = _trim(
    raw.path ||
      raw.url ||
      raw.src ||
      raw.filePath ||
      raw.localPath ||
      raw.tempFilePath
  );
  if (!type) {
    // 旧对象无 type：时长/封面/扩展名推断为视频
    type =
      Number(raw.duration) > 0 ||
      raw.posterPath ||
      raw.videoFormat ||
      _looksLikeVideoPath(pathEarly) ||
      _looksLikeVideoPath(raw.remoteUrl)
        ? 'video'
        : 'image';
  }
  if (type !== 'image' && type !== 'video') return null;

  const path = pathEarly;
  const remoteUrl = _trim(raw.remoteUrl);
  // image：path 或 remoteUrl；video：local 用 path/temp，remote 用 remoteUrl（详见 validate）
  if (type === 'image' && !path && !remoteUrl) return null;
  if (type === 'video' && !path && !remoteUrl) return null;

  const mediaId =
    _trim(raw.mediaId) ||
    _stableMediaId(type === 'video' ? 'mvid_' : 'mimg_', path || remoteUrl);
  const storageMode =
    _trim(raw.storageMode) ||
    (type === 'video' ? STORAGE_MODE_LOCAL : STORAGE_MODE_LOCAL_USER_DATA);

  return {
    mediaId: mediaId,
    type: type,
    path: path,
    remoteUrl: remoteUrl,
    storageMode: storageMode,
    width: Number(raw.width) || 0,
    height: Number(raw.height) || 0,
    duration: type === 'video' ? Number(raw.duration) || 0 : 0,
    size: type === 'video' ? Number(raw.size) || 0 : Number(raw.size) || 0,
    posterPath: type === 'video' ? _trim(raw.posterPath) : '',
    posterRemoteUrl: type === 'video' ? _trim(raw.posterRemoteUrl) : '',
    videoFormat:
      type === 'video'
        ? _trim(raw.videoFormat) || _videoExtFromPath(path || remoteUrl)
        : '',
    // 预留审核字段；当前无真实服务，保持 local_unreviewed
    moderationStatus: _trim(raw.moderationStatus) || 'local_unreviewed',
    coverModerationStatus:
      _trim(raw.coverModerationStatus) || 'local_unreviewed',
    moderationTaskId:
      raw.moderationTaskId == null || raw.moderationTaskId === ''
        ? null
        : _trim(raw.moderationTaskId)
  };
}

/**
 * 读取兼容：优先 media；规范化后为空则回退旧 images。
 * 不做 Storage 批量重写。
 */
function normalizeMomentMediaList(rawMedia, rawImages) {
  if (Array.isArray(rawMedia) && rawMedia.length) {
    const fromMedia = rawMedia.map(normalizeMediaItem).filter(Boolean);
    if (fromMedia.length) return fromMedia;
  }
  const images = Array.isArray(rawImages) ? rawImages : [];
  return images
    .map(function (img) {
      const item = normalizeMediaItem(
        typeof img === 'string' ? img : Object.assign({}, img, { type: 'image' })
      );
      return item && item.type === 'image' ? item : null;
    })
    .filter(Boolean)
    .slice(0, IMAGES_MAX);
}

function imagesFromMedia(media) {
  const list = Array.isArray(media) ? media : [];
  return list
    .filter(function (m) {
      return m && m.type === 'image';
    })
    .map(function (m) {
      return {
        mediaId: m.mediaId,
        path: m.path,
        width: m.width || 0,
        height: m.height || 0,
        storageMode: m.storageMode || STORAGE_MODE_LOCAL_USER_DATA
      };
    });
}

function resolveMediaType(media) {
  const list = Array.isArray(media) ? media : [];
  let hasImage = false;
  let hasVideo = false;
  for (let i = 0; i < list.length; i++) {
    const t = list[i] && list[i].type;
    if (t === 'image') hasImage = true;
    if (t === 'video') hasVideo = true;
  }
  if (hasVideo && !hasImage) return 'video';
  if (hasImage && !hasVideo) return 'images';
  if (!hasImage && !hasVideo) return 'none';
  return 'mixed';
}

/**
 * 视频可播地址：
 * - local / local_user_data：允许 path 或草稿 tempFilePath
 * - remote / cloud：必须 remoteUrl
 */
function _hasPlayableVideoAddress(item) {
  if (!item) return false;
  const mode = _trim(item.storageMode) || STORAGE_MODE_LOCAL;
  const remoteUrl = _trim(item.remoteUrl);
  const path = _trim(item.path) || _trim(item.tempFilePath);
  if (mode === 'remote' || mode === 'cloud') {
    return !!remoteUrl;
  }
  return !!path;
}

function hasPlayableVideoAddress(item) {
  return _hasPlayableVideoAddress(item);
}

/**
 * 业务校验（互斥 / 数量 / 时长 / 体积 / 可播放地址）。
 * @returns {{ ok:boolean, error?:string, message?:string, mediaType?:string, media?:array }}
 */
function validateMomentMedia(media) {
  const list = Array.isArray(media) ? media.map(normalizeMediaItem).filter(Boolean) : [];
  if (!list.length) {
    return { ok: true, mediaType: 'none', media: [] };
  }
  let imageCount = 0;
  let videoCount = 0;
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item || (item.type !== 'image' && item.type !== 'video')) {
      return {
        ok: false,
        error: 'unknown_media_type',
        message: '不支持的媒体类型'
      };
    }
    if (item.type === 'image') imageCount += 1;
    if (item.type === 'video') videoCount += 1;
  }
  if (imageCount > 0 && videoCount > 0) {
    return {
      ok: false,
      error: 'mixed_image_video',
      message: '图片和视频暂不支持同时发布'
    };
  }
  if (imageCount > IMAGES_MAX) {
    return {
      ok: false,
      error: 'too_many_images',
      message: '最多选择' + IMAGES_MAX + '张图片'
    };
  }
  if (videoCount > VIDEO_MAX) {
    return {
      ok: false,
      error: 'too_many_videos',
      message: '最多选择' + VIDEO_MAX + '个视频'
    };
  }
  if (videoCount === 1) {
    const v = list.filter(function (m) {
      return m.type === 'video';
    })[0];
    // local：持久化 path（或草稿 tempFilePath）即可；remote/cloud：必须 remoteUrl
    // 不得因 local 适配器 remoteUrl 为空而误判无效
    if (!_hasPlayableVideoAddress(v)) {
      return {
        ok: false,
        error: 'video_missing_path',
        message: '视频文件无效'
      };
    }
    const duration = Number(v.duration) || 0;
    if (duration > VIDEO_MAX_DURATION_SEC) {
      return {
        ok: false,
        error: 'video_too_long',
        message: '视频不能超过' + VIDEO_MAX_DURATION_SEC + '秒'
      };
    }
    const size = Number(v.size) || 0;
    if (size > VIDEO_MAX_SIZE_BYTES) {
      return {
        ok: false,
        error: 'video_too_large',
        message: '视频不能超过' + formatVideoSizeLimitLabel()
      };
    }
  }
  return {
    ok: true,
    mediaType: resolveMediaType(list),
    media: list
  };
}

/**
 * wx.chooseMedia 封装。不写持久化；取消选择返回 cancelled。
 * @param {{ maxImageCount?:number, mediaType?:string[], existingMediaType?:string }} options
 */
function selectMomentMedia(options) {
  const opts = options && typeof options === 'object' ? options : {};
  const existing = _trim(opts.existingMediaType) || 'none';
  const maxImageCount = Math.max(
    1,
    Math.min(IMAGES_MAX, Number(opts.maxImageCount) || IMAGES_MAX)
  );
  const mediaType =
    Array.isArray(opts.mediaType) && opts.mediaType.length
      ? opts.mediaType.slice()
      : ['image', 'video'];

  return new Promise(function (resolve) {
    if (typeof wx === 'undefined' || typeof wx.chooseMedia !== 'function') {
      resolve({
        ok: false,
        cancelled: false,
        media: [],
        error: 'choose_unsupported',
        message: '当前环境不支持选择媒体'
      });
      return;
    }
    try {
      wx.chooseMedia({
        count: maxImageCount,
        mediaType: mediaType,
        sourceType: opts.sourceType || ['album', 'camera'],
        maxDuration: VIDEO_MAX_DURATION_SEC,
        sizeType: opts.sizeType || ['compressed'],
        success: function (res) {
          const files = (res && res.tempFiles) || [];
          if (!files.length) {
            resolve({
              ok: false,
              cancelled: true,
              media: [],
              error: 'cancelled',
              message: ''
            });
            return;
          }
          const picked = [];
          for (let i = 0; i < files.length; i++) {
            const f = files[i] || {};
            const fileType = _trim(f.fileType || f.type).toLowerCase();
            const isVideo =
              fileType === 'video' ||
              (mediaType.length === 1 && mediaType[0] === 'video') ||
              (fileType !== 'image' && Number(f.duration) > 0);
            const tempPath = _trim(f.tempFilePath);
            if (!tempPath) continue;
            if (isVideo) {
              const duration = Number(f.duration) || 0;
              const size = Number(f.size) || 0;
              if (duration > VIDEO_MAX_DURATION_SEC) {
                resolve({
                  ok: false,
                  cancelled: false,
                  media: [],
                  error: 'video_too_long',
                  message: '视频不能超过' + VIDEO_MAX_DURATION_SEC + '秒'
                });
                return;
              }
              if (size > VIDEO_MAX_SIZE_BYTES) {
                resolve({
                  ok: false,
                  cancelled: false,
                  media: [],
                  error: 'video_too_large',
                  message: '视频不能超过' + formatVideoSizeLimitLabel()
                });
                return;
              }
              picked.push({
                type: 'video',
                tempFilePath: tempPath,
                thumbTempFilePath: _trim(f.thumbTempFilePath),
                duration: duration,
                size: size,
                width: Number(f.width) || 0,
                height: Number(f.height) || 0
              });
            } else {
              picked.push({
                type: 'image',
                tempFilePath: tempPath,
                width: Number(f.width) || 0,
                height: Number(f.height) || 0,
                size: Number(f.size) || 0
              });
            }
          }
          if (!picked.length) {
            resolve({
              ok: false,
              cancelled: true,
              media: [],
              error: 'cancelled',
              message: ''
            });
            return;
          }
          const pickedType = resolveMediaType(
            picked.map(function (p) {
              return { type: p.type, path: p.tempFilePath, duration: p.duration };
            })
          );
          if (pickedType === 'mixed') {
            resolve({
              ok: false,
              cancelled: false,
              media: [],
              error: 'mixed_image_video',
              message: '图片和视频暂不支持同时发布'
            });
            return;
          }
          if (existing === 'images' && pickedType === 'video') {
            resolve({
              ok: false,
              cancelled: false,
              media: [],
              error: 'mixed_image_video',
              message: '图片和视频暂不支持同时发布'
            });
            return;
          }
          if (existing === 'video' && pickedType === 'images') {
            resolve({
              ok: false,
              cancelled: false,
              media: [],
              error: 'mixed_image_video',
              message: '图片和视频暂不支持同时发布'
            });
            return;
          }
          const videoPicked = picked.filter(function (p) {
            return p && p.type === 'video';
          }).length;
          if (videoPicked > VIDEO_MAX || (existing === 'video' && videoPicked >= 1)) {
            resolve({
              ok: false,
              cancelled: false,
              media: [],
              error: 'too_many_videos',
              message: '最多选择' + VIDEO_MAX + '个视频'
            });
            return;
          }
          resolve({ ok: true, cancelled: false, media: picked, error: '', message: '' });
        },
        fail: function (err) {
          const msg = (err && err.errMsg) || '';
          const cancelled = /cancel/i.test(msg);
          resolve({
            ok: false,
            cancelled: cancelled,
            media: [],
            error: cancelled ? 'cancelled' : 'choose_failed',
            message: cancelled ? '' : '选择媒体失败'
          });
        }
      });
    } catch (e) {
      resolve({
        ok: false,
        cancelled: false,
        media: [],
        error: 'choose_failed',
        message: '选择媒体失败'
      });
    }
  });
}

/**
 * 本地持久化视频 + 封面（storageMode=local）。供 uploadService 本地适配器调用。
 */
function persistMomentVideoLocal(tempVideo) {
  return new Promise(function (resolve) {
    const src = tempVideo && typeof tempVideo === 'object' ? tempVideo : {};
    const tempPath = _trim(src.tempFilePath || src.path);
    if (!tempPath) {
      resolve({ ok: false, error: 'empty_temp' });
      return;
    }
    const duration = Number(src.duration) || 0;
    const size = Number(src.size) || 0;
    if (duration > VIDEO_MAX_DURATION_SEC) {
      resolve({ ok: false, error: 'video_too_long' });
      return;
    }
    if (size > VIDEO_MAX_SIZE_BYTES) {
      resolve({ ok: false, error: 'video_too_large' });
      return;
    }
    const mediaId = _trim(src.mediaId) || _newMediaId('mvid_');
    const root = _userDataRoot();
    if (!root) {
      resolve({ ok: false, error: 'no_user_data_path' });
      return;
    }
    const fsm = _getFsm();
    if (!fsm) {
      resolve({ ok: false, error: 'no_fsm' });
      return;
    }
    const dir = root.replace(/\/$/, '') + '/' + MOMENT_MEDIA_DIR;
    _ensureDirSync(fsm, dir);
    const videoFormat = _videoExtFromPath(tempPath);
    const dest = dir + '/' + mediaId + '.' + videoFormat;
    const thumbTemp = _trim(src.thumbTempFilePath || src.posterTempFilePath);
    const posterDest = thumbTemp
      ? dir + '/' + mediaId + '_poster.' + _extFromPath(thumbTemp)
      : '';

    const finish = function (savedVideoPath, savedPosterPath) {
      const verified = _verifySavedPath(fsm, savedVideoPath || dest);
      if (!verified) {
        resolve({ ok: false, error: 'persist_unverified' });
        return;
      }
      let posterPath = '';
      if (savedPosterPath) {
        posterPath = _verifySavedPath(fsm, savedPosterPath) || '';
      }
      resolve({
        ok: true,
        mediaId: mediaId,
        path: verified,
        posterPath: posterPath,
        width: Number(src.width) || 0,
        height: Number(src.height) || 0,
        duration: duration,
        size: size,
        videoFormat: videoFormat,
        storageMode: STORAGE_MODE_LOCAL
      });
    };

    const persistPosterThenFinish = function (savedVideoPath) {
      if (!thumbTemp || !posterDest) {
        finish(savedVideoPath, '');
        return;
      }
      if (_persistLocalFileSync(fsm, thumbTemp, posterDest)) {
        finish(savedVideoPath, posterDest);
        return;
      }
      // 封面失败不影响视频正文
      finish(savedVideoPath, '');
    };

    // 大视频优先 copyFile，避免 readFileSync 整文件进堆
    if (_persistLocalFileSync(fsm, tempPath, dest)) {
      persistPosterThenFinish(dest);
      return;
    }

    try {
      if (typeof fsm.copyFile === 'function') {
        fsm.copyFile({
          srcPath: tempPath,
          destPath: dest,
          success: function () {
            if (_verifySavedPath(fsm, dest)) {
              persistPosterThenFinish(dest);
            } else {
              resolve({ ok: false, error: 'persist_unverified' });
            }
          },
          fail: function () {
            try {
              fsm.saveFile({
                tempFilePath: tempPath,
                filePath: dest,
                success: function (res) {
                  persistPosterThenFinish((res && res.savedFilePath) || dest);
                },
                fail: function () {
                  resolve({ ok: false, error: 'persist_failed' });
                }
              });
            } catch (e2) {
              resolve({ ok: false, error: 'persist_failed' });
            }
          }
        });
        return;
      }
    } catch (e3) { /* fall through */ }

    try {
      fsm.saveFile({
        tempFilePath: tempPath,
        filePath: dest,
        success: function (res) {
          persistPosterThenFinish((res && res.savedFilePath) || dest);
        },
        fail: function () {
          resolve({ ok: false, error: 'persist_failed' });
        }
      });
    } catch (e4) {
      resolve({ ok: false, error: 'persist_failed' });
    }
  });
}

/**
 * 持久化草稿媒体（图片走本地图片持久化；视频走 uploadService 本地适配器）。
 * 任一项失败则清理本次已写入文件。
 */
function persistMomentMedia(tempMedia) {
  const list = Array.isArray(tempMedia) ? tempMedia : [];
  const saved = [];
  let chain = Promise.resolve({ ok: true, media: [] });

  list.forEach(function (file, index) {
    chain = chain.then(function (prev) {
      if (!prev.ok) return prev;
      const type = _trim(file && file.type) || 'image';
      if (type === 'video') {
        // 懒加载，避免与 uploadService 循环依赖初始化问题
        const uploadService = require('./momentMediaUploadService.js');
        return uploadService.uploadVideo(file).then(function (one) {
          if (!one.ok) {
            return cleanupMomentMedia(saved).then(function () {
              return {
                ok: false,
                error: one.error || 'persist_failed',
                failIndex: index
              };
            });
          }
          const item = normalizeMediaItem({
            mediaId: one.mediaId,
            type: 'video',
            path: one.path,
            remoteUrl: one.remoteUrl || '',
            storageMode: one.storageMode || STORAGE_MODE_LOCAL,
            width: one.width || 0,
            height: one.height || 0,
            duration: one.duration || 0,
            size: one.size || 0,
            posterPath: one.posterPath || '',
            posterRemoteUrl: one.posterRemoteUrl || '',
            videoFormat: one.videoFormat || ''
          });
          if (!item) {
            return cleanupMomentMedia(saved).then(function () {
              return { ok: false, error: 'normalize_failed', failIndex: index };
            });
          }
          const check = validateMomentMedia(saved.concat([item]));
          if (!check.ok) {
            return cleanupMomentMedia(saved.concat([item])).then(function () {
              return {
                ok: false,
                error: check.error,
                message: check.message,
                failIndex: index
              };
            });
          }
          saved.push(item);
          return { ok: true, media: saved.slice() };
        });
      }
      return persistMomentImage(file).then(function (one) {
        if (!one.ok) {
          return cleanupMomentMedia(saved).then(function () {
            return {
              ok: false,
              error: one.error || 'persist_failed',
              failIndex: index
            };
          });
        }
        const item = normalizeMediaItem({
          mediaId: one.mediaId,
          type: 'image',
          path: one.path,
          storageMode: one.storageMode || STORAGE_MODE_LOCAL_USER_DATA,
          width: one.width || 0,
          height: one.height || 0
        });
        saved.push(item);
        return { ok: true, media: saved.slice() };
      });
    });
  });

  return chain.then(function (res) {
    if (!res.ok) return res;
    const check = validateMomentMedia(res.media);
    if (!check.ok) {
      return cleanupMomentMedia(res.media).then(function () {
        return {
          ok: false,
          error: check.error,
          message: check.message,
          media: []
        };
      });
    }
    return { ok: true, media: check.media, mediaType: check.mediaType };
  });
}

function resolveMomentVideoForView(raw, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const skipInspect = !!opts.skipInspect;
  const item = normalizeMediaItem(
    raw && typeof raw === 'object'
      ? Object.assign({}, raw, { type: 'video' })
      : null
  );
  if (!item || item.type !== 'video') {
    return {
      mediaId: '',
      type: 'video',
      path: '',
      playablePath: '',
      posterPath: '',
      posterRenderPath: '',
      duration: 0,
      durationLabel: '0:00',
      size: 0,
      width: 0,
      height: 0,
      storageMode: STORAGE_MODE_LOCAL,
      unavailable: true,
      unavailableReason: 'invalid'
    };
  }

  const mode = _trim(item.storageMode) || STORAGE_MODE_LOCAL;
  const isRemoteMode = mode === 'remote' || mode === 'cloud';
  const moderationStatus = _trim(item.moderationStatus) || 'local_unreviewed';
  const coverModerationStatus =
    _trim(item.coverModerationStatus) || 'local_unreviewed';
  // local_unreviewed 不伪装为审核通过；仅 rejected/takedown/hidden 禁播
  const mediaBlocked = _isModerationBlocked(moderationStatus);
  const coverBlocked = _isModerationBlocked(coverModerationStatus);

  let playablePath = '';
  let videoUnavailable = false;
  let unavailableReason = '';

  if (mediaBlocked) {
    videoUnavailable = true;
    unavailableReason = 'moderation_' + moderationStatus;
  } else if (isRemoteMode) {
    playablePath =
      item.remoteUrl && /^https:\/\//.test(item.remoteUrl) ? item.remoteUrl : '';
    if (!playablePath) {
      videoUnavailable = true;
      unavailableReason = 'file_missing';
    }
  } else {
    // local：只用持久化 path，不因 remoteUrl 为空判失败
    const pathType = classifyPathType(item.path);
    if (pathType === 'http_remote' && /^https:\/\//.test(item.path)) {
      playablePath = item.path;
    } else if (item.path) {
      if (skipInspect) {
        playablePath = _toRenderablePath(item.path) || item.path;
        if (!playablePath) {
          videoUnavailable = true;
          unavailableReason = 'file_missing';
        }
      } else {
        const info = inspectLocalFile(item.path);
        if (info.exists && info.size > 0) {
          playablePath = info.resolvedPath || _toRenderablePath(item.path);
        } else {
          // 与图片一致：本地缺失不可播，不伪装可播路径
          videoUnavailable = true;
          unavailableReason = 'file_missing';
          playablePath = '';
        }
      }
    } else {
      videoUnavailable = true;
      unavailableReason = 'file_missing';
    }
  }

  let posterRenderPath = '';
  if (coverBlocked) {
    posterRenderPath = '';
  } else if (item.posterRemoteUrl && /^https:\/\//.test(item.posterRemoteUrl)) {
    posterRenderPath = item.posterRemoteUrl;
  } else if (item.posterPath) {
    if (skipInspect) {
      posterRenderPath = _toRenderablePath(item.posterPath) || item.posterPath;
    } else {
      const pInfo = inspectLocalFile(item.posterPath);
      if (pInfo.exists && pInfo.size > 0) {
        posterRenderPath = pInfo.resolvedPath || _toRenderablePath(item.posterPath);
      }
    }
  }

  return {
    mediaId: item.mediaId,
    type: 'video',
    path: item.path,
    remoteUrl: item.remoteUrl || '',
    playablePath: mediaBlocked ? '' : playablePath,
    posterPath: item.posterPath || '',
    posterRemoteUrl: item.posterRemoteUrl || '',
    posterRenderPath: posterRenderPath,
    duration: item.duration || 0,
    durationLabel: formatDurationLabel(item.duration),
    size: item.size || 0,
    width: item.width || 0,
    height: item.height || 0,
    videoFormat: item.videoFormat || '',
    storageMode: item.storageMode || STORAGE_MODE_LOCAL,
    unavailable: videoUnavailable || (!mediaBlocked && !playablePath),
    unavailableReason:
      unavailableReason ||
      (videoUnavailable || !playablePath ? 'file_missing' : ''),
    moderationStatus: moderationStatus,
    coverModerationStatus: coverModerationStatus,
    moderationTaskId: item.moderationTaskId,
    coverUnavailable: coverBlocked || !posterRenderPath
  };
}

/**
 * 投影可展示 media（图片沿用 resolveMomentImageForView；视频含封面/可播地址）。
 * @param {array} media
 * @param {{ skipInspect?: boolean }} [options] Feed 可 skipInspect 避免同步 FS
 */
function hydrateMomentMediaForView(media, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const list = Array.isArray(media) ? media : [];
  return list
    .map(function (raw) {
      const item = normalizeMediaItem(raw);
      if (!item) return null;
      if (item.type === 'video') return resolveMomentVideoForView(item, opts);
      const img = resolveMomentImageForView(item, opts);
      return Object.assign({}, img, { type: 'image' });
    })
    .filter(Boolean);
}

/** 预览用：仅图片可渲染路径；视频不进入图片预览列表 */
function collectPreviewUrls(mediaOrImages) {
  const list = Array.isArray(mediaOrImages) ? mediaOrImages : [];
  const urls = [];
  list.forEach(function (img) {
    if (!img || img.unavailable) return;
    if (img.type === 'video') return;
    const u = String(img.renderPath || img.path || '').trim();
    if (u) urls.push(u);
  });
  return urls;
}

/**
 * 投影 Feed/详情用媒体摘要字段。
 * @param {array} media
 * @param {{ skipInspect?: boolean, includeMediaArray?: boolean }} [options]
 */
function projectMediaViewFields(media, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const hydrated = hydrateMomentMediaForView(media, opts);
  let mediaType = resolveMediaType(hydrated);
  let images = hydrated.filter(function (m) {
    return m && m.type === 'image';
  });
  let videos = hydrated.filter(function (m) {
    return m && m.type === 'video';
  });
  // 旧/脏数据 mixed：优先展示图片，避免整条媒体静默 none
  if (mediaType === 'mixed') {
    if (images.length) {
      mediaType = 'images';
      videos = [];
    } else if (videos.length) {
      mediaType = 'video';
      images = [];
    } else {
      mediaType = 'none';
    }
  }
  const video = mediaType === 'video' ? videos[0] || null : null;
  const out = {
    mediaType: mediaType,
    images: mediaType === 'images' ? images : [],
    video: video,
    videoCount: video ? 1 : 0,
    poster: video
      ? {
          path: video.posterRenderPath || '',
          unavailable: !video.posterRenderPath
        }
      : null,
    durationLabel: video ? video.durationLabel : ''
  };
  if (opts.includeMediaArray) {
    out.media = hydrated;
  }
  return out;
}

module.exports = {
  MOMENT_MEDIA_DIR: MOMENT_MEDIA_DIR,
  IMAGES_MAX: IMAGES_MAX,
  VIDEO_MAX: VIDEO_MAX,
  VIDEO_MAX_DURATION_SEC: VIDEO_MAX_DURATION_SEC,
  VIDEO_MAX_SIZE_BYTES: VIDEO_MAX_SIZE_BYTES,
  STORAGE_MODE_LOCAL: STORAGE_MODE_LOCAL,
  STORAGE_MODE_LOCAL_USER_DATA: STORAGE_MODE_LOCAL_USER_DATA,
  formatDurationLabel: formatDurationLabel,
  formatVideoSizeLimitLabel: formatVideoSizeLimitLabel,
  normalizeMediaItem: normalizeMediaItem,
  normalizeMomentMediaList: normalizeMomentMediaList,
  imagesFromMedia: imagesFromMedia,
  resolveMediaType: resolveMediaType,
  validateMomentMedia: validateMomentMedia,
  hasPlayableVideoAddress: hasPlayableVideoAddress,
  selectMomentMedia: selectMomentMedia,
  persistMomentImage: persistMomentImage,
  persistMomentImages: persistMomentImages,
  persistMomentVideoLocal: persistMomentVideoLocal,
  persistMomentMedia: persistMomentMedia,
  cleanupMomentLocalFiles: cleanupMomentLocalFiles,
  cleanupMomentMedia: cleanupMomentMedia,
  isLocalPersistPath: _isLocalPersistPath,
  classifyPathType: classifyPathType,
  inspectLocalFile: inspectLocalFile,
  resolveMomentImageForView: resolveMomentImageForView,
  resolveMomentVideoForView: resolveMomentVideoForView,
  hydrateMomentImagesForView: hydrateMomentImagesForView,
  hydrateMomentMediaForView: hydrateMomentMediaForView,
  projectMediaViewFields: projectMediaViewFields,
  collectPreviewUrls: collectPreviewUrls,
  summarizeMomentImages: summarizeMomentImages
};
