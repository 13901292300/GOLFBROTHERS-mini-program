/**
 * 球友圈本地图片持久化（MVP）。
 * 使用 USER_DATA_PATH，禁止 base64 写入 Storage；预留 storageMode 云迁移。
 */

const MOMENT_MEDIA_DIR = 'gb_moments';
const MEDIA_DEBUG = false;

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

    // 1) 同步二进制写入（最稳）
    if (_writeBinaryToDest(fsm, tempPath, dest)) {
      finishOk(dest);
      return;
    }
    // 2) 同步 copy
    if (_copyToDest(fsm, tempPath, dest)) {
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
 * 仅删除本动态拥有的本地持久文件（local_user_data）。
 * 清理失败不抛错，debug 门控记录。
 */
function cleanupMomentLocalFiles(images) {
  const list = Array.isArray(images) ? images : [];
  const fsm = _getFsm();
  if (!fsm) return Promise.resolve({ cleaned: 0 });
  let cleaned = 0;
  list.forEach(function (img) {
    if (!img || img.storageMode !== 'local_user_data') return;
    const path = img.path != null ? String(img.path).trim() : '';
    if (!_isLocalPersistPath(path)) return;
    const candidates = _pathCandidates(path);
    for (let i = 0; i < candidates.length; i++) {
      try {
        fsm.unlinkSync(candidates[i]);
        cleaned += 1;
        break;
      } catch (e2) {
        /* try next */
      }
    }
  });
  return Promise.resolve({ cleaned: cleaned });
}

/**
 * 投影用：解析可渲染路径；文件丢失时 unavailable=true，不删 Storage 记录。
 */
function resolveMomentImageForView(raw) {
  const src =
    raw && typeof raw === 'object'
      ? raw
      : typeof raw === 'string'
        ? { path: raw }
        : {};
  const mediaId =
    src.mediaId != null && String(src.mediaId).trim()
      ? String(src.mediaId).trim()
      : 'mimg_' + Math.random().toString(36).slice(2, 10);
  const storedPath = String(
    src.path || src.url || src.src || src.filePath || src.localPath || src.tempFilePath || ''
  ).trim();
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

/** 预览用：仅可渲染路径，跳过失效图 */
function collectPreviewUrls(images) {
  const list = Array.isArray(images) ? images : [];
  const urls = [];
  list.forEach(function (img) {
    if (!img || img.unavailable) return;
    const u = String(img.renderPath || img.path || '').trim();
    if (u) urls.push(u);
  });
  return urls;
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

module.exports = {
  MOMENT_MEDIA_DIR: MOMENT_MEDIA_DIR,
  persistMomentImage: persistMomentImage,
  persistMomentImages: persistMomentImages,
  cleanupMomentLocalFiles: cleanupMomentLocalFiles,
  isLocalPersistPath: _isLocalPersistPath,
  classifyPathType: classifyPathType,
  inspectLocalFile: inspectLocalFile,
  resolveMomentImageForView: resolveMomentImageForView,
  hydrateMomentImagesForView: hydrateMomentImagesForView,
  collectPreviewUrls: collectPreviewUrls,
  summarizeMomentImages: summarizeMomentImages
};
