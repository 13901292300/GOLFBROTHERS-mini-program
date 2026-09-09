'use strict';

/**
 * 球队/资料图片：校验、压缩、按 cloudEnv 上传到 teamClub 同环境，禁止临时路径入库。
 */

var fields = require('./profileFields.js');
var teamCloud = require('./teamCloud.js');
var factory = require('./repoFactory.js');

var MAX_BYTES = 5 * 1024 * 1024;
var ORPHAN_KEY = 'gb_team_asset_orphans_v1';
var MSG_MISSING = '网络连接中断，LOGO尚未上传，请稍后重试。';
var MSG_UNCERTAIN = '网络连接中断，正在保留本次上传记录；重试时会先确认，不会重复上传。';
var ALLOWED_EXT = { jpg: 'jpg', jpeg: 'jpg', png: 'png', webp: 'webp' };
var ALLOWED_MIME = {
  image: 'jpg',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

var _uploading = false;
var _testHooks = null;
var _activeUploadId = '';
var _pending = null;

function hooks() {
  return _testHooks || {};
}

function setTestHooks(h) {
  _testHooks = h && typeof h === 'object' ? h : null;
}

function resetTestHooks() {
  _testHooks = null;
  _uploading = false;
  _activeUploadId = '';
  _pending = null;
}

function isUploading() {
  return _uploading === true;
}

function newUploadId() {
  return ('u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
}

function normalizeExt(name, mime) {
  var fromMime = ALLOWED_MIME[String(mime || '').toLowerCase()];
  if (fromMime) return fromMime;
  var m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/);
  var ext = m ? m[1] : '';
  return ALLOWED_EXT[ext] || '';
}

function redactMsg(raw) {
  return String(raw || '')
    .replace(/wxfile:\/\/\S+/gi, '[file]')
    .replace(/http:\/\/tmp\/\S+/gi, '[file]')
    .replace(/cloud:\/\/\S+/gi, '[cloud]')
    .replace(/https?:\/\/\S+/gi, '[url]')
    .slice(0, 180);
}

function makeDiagId(uploadId) {
  var s = String(uploadId || Date.now().toString(36))
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(-6)
    .toUpperCase();
  return 'L' + (s || 'XXXXXX');
}

function userMessageFor(code, fallback) {
  if (code === 'upload_missing') return MSG_MISSING;
  if (code === 'upload_uncertain') return MSG_UNCERTAIN;
  return fallback || '图片上传失败';
}

function formatUploadError(err, extra) {
  extra = extra || {};
  var route = extra.route || {};
  var errCode = err && (err.errCode != null ? err.errCode : err.code);
  var errMsg = redactMsg((err && (err.errMsg || err.message)) || extra.message || '');
  var code = extra.code || 'upload_failed';
  var diagId = extra.diagId || makeDiagId(extra.uploadId || _activeUploadId);
  var out = {
    ok: false,
    code: code,
    message: extra.userMessage || userMessageFor(code, '图片上传失败'),
    diagId: diagId,
    stage: extra.stage || '',
    errCode: errCode == null ? '' : errCode,
    errMsg: errMsg,
    envVersion: route.envVersion || '',
    envName: route.envName || '',
    env: route.maskedEnvId || '',
    fileType: extra.fileType || '',
    fileSize: extra.fileSize != null ? extra.fileSize : '',
    confirmedMissing: !!extra.confirmedMissing,
    uploadId: extra.uploadId || _activeUploadId,
    cloudPath: extra.cloudPath || ''
  };
  try {
    console.log('[teamClub:upload:' + (out.stage || 'error') + ']', {
      diagId: out.diagId,
      code: out.code,
      stage: out.stage,
      errCode: out.errCode,
      errMsg: out.errMsg,
      envVersion: out.envVersion,
      envName: out.envName,
      env: out.env,
      fileType: out.fileType,
      fileSize: out.fileSize,
      uploadId: String(out.uploadId || '').slice(-6)
    });
  } catch (e) {
    /* ignore */
  }
  return out;
}

function displayUploadError(err) {
  if (!err) return '图片上传失败';
  var msg = err.message || '图片上传失败';
  if (err.diagId) return msg + '\n诊断编号 ' + err.diagId;
  return msg;
}

function readOrphans() {
  var wxapi = typeof wx !== 'undefined' ? wx : null;
  if (hooks().getOrphans) return hooks().getOrphans() || [];
  if (!wxapi || typeof wxapi.getStorageSync !== 'function') return [];
  try {
    var raw = wxapi.getStorageSync(ORPHAN_KEY);
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    return [];
  }
}

function writeOrphans(list) {
  if (hooks().setOrphans) {
    hooks().setOrphans(list);
    return;
  }
  if (typeof wx === 'undefined' || typeof wx.setStorageSync !== 'function') return;
  try {
    wx.setStorageSync(ORPHAN_KEY, list.slice(-40));
  } catch (e) {
    /* ignore */
  }
}

function enqueueOrphan(fileID, route) {
  var id = String(fileID || '').trim();
  if (!id || !fields.isDurableAvatar(id) || fields.isTempPath(id)) return;
  if (id.indexOf('/logo/') >= 0) return;
  var list = readOrphans().filter(function (row) {
    return row && row.fileID !== id;
  });
  list.push({
    fileID: id,
    at: Date.now(),
    envName: (route && route.envName) || ''
  });
  writeOrphans(list);
}

function markCommitted(fileID) {
  var id = String(fileID || '').trim();
  writeOrphans(
    readOrphans().filter(function (row) {
      return row && row.fileID !== id;
    })
  );
}

function inspectLocalFile(filePath, meta) {
  meta = meta || {};
  var h = hooks();
  var getInfo = h.getFileInfo || (typeof wx !== 'undefined' && wx.getFileInfo);
  var run = function (size) {
    var ext = normalizeExt(filePath, meta.fileType || meta.mime);
    if (!ext) {
      return {
        ok: false,
        code: 'invalid_file',
        message: '仅支持 jpg/png/webp 图片'
      };
    }
    if (size > MAX_BYTES) {
      return {
        ok: false,
        code: 'file_too_large',
        message: '图片不能超过 5MB',
        fileType: ext,
        fileSize: size
      };
    }
    return { ok: true, filePath: filePath, ext: ext, fileSize: size, fileType: ext };
  };
  if (typeof meta.size === 'number') return Promise.resolve(run(meta.size));
  if (typeof getInfo !== 'function') return Promise.resolve(run(0));
  return new Promise(function (resolve) {
    getInfo({
      filePath: filePath,
      success: function (res) {
        resolve(run(Number(res && res.size) || 0));
      },
      fail: function () {
        resolve(run(0));
      }
    });
  });
}

var AVATAR_MAX_EDGE = 1024;
var AVATAR_JPEG_QUALITY = 85;
var AVATAR_SKIP_COMPRESS_UNDER = 1024 * 1024;

function maybeCompress(filePath, ins, kind) {
  var h = hooks();
  var compress = h.compressImage || (typeof wx !== 'undefined' && wx.compressImage);
  var ext = ins && ins.ext;
  var isAvatar = kind === 'avatar';
  var skipPngAvatar =
    isAvatar && (ext === 'png' || ext === 'webp') && Number(ins && ins.fileSize) <= 2 * 1024 * 1024;
  if (
    typeof compress !== 'function' ||
    (ext !== 'jpg' && ext !== 'png') ||
    skipPngAvatar ||
    (isAvatar && Number(ins && ins.fileSize) <= AVATAR_SKIP_COMPRESS_UNDER)
  ) {
    return Promise.resolve({
      filePath: filePath,
      fileSize: ins && ins.fileSize,
      ext: ext,
      compressed: false,
      compressQuality: 0
    });
  }
  var quality = isAvatar
    ? AVATAR_JPEG_QUALITY
    : Number(ins && ins.fileSize) > 1024 * 1024
      ? 70
      : 80;
  return new Promise(function (resolve) {
    var opts = {
      src: filePath,
      quality: quality,
      success: function (res) {
        var next = (res && res.tempFilePath) || filePath;
        inspectLocalFile(next, { fileType: ext }).then(function (again) {
          if (!again.ok) {
            resolve({
              filePath: filePath,
              fileSize: ins.fileSize,
              ext: ext,
              compressed: false,
              compressQuality: quality
            });
            return;
          }
          resolve({
            filePath: again.filePath,
            fileSize: again.fileSize,
            ext: again.ext,
            compressed: true,
            compressQuality: quality
          });
        });
      },
      fail: function () {
        teamCloud.logStage('compress', {
          route: teamCloud.getRoute(),
          errMsg: 'compress failed, keep original'
        });
        resolve({
          filePath: filePath,
          fileSize: ins && ins.fileSize,
          ext: ext,
          compressed: false,
          compressQuality: quality
        });
      }
    };
    if (isAvatar) {
      opts.compressedWidth = AVATAR_MAX_EDGE;
      opts.compressedHeight = AVATAR_MAX_EDGE;
    }
    compress(opts);
  });
}

function maybeSquare(filePath, kind) {
  if (kind === 'avatar') return Promise.resolve(filePath);
  var h = hooks();
  var crop = h.cropImage || (typeof wx !== 'undefined' && wx.cropImage);
  if (typeof crop !== 'function') return Promise.resolve(filePath);
  return new Promise(function (resolve) {
    crop({
      src: filePath,
      cropScale: '1:1',
      success: function (res) {
        resolve((res && res.tempFilePath) || filePath);
      },
      fail: function () {
        resolve(filePath);
      }
    });
  });
}

function chooseLocalImage() {
  var h = hooks();
  if (typeof h.chooseImage === 'function') return h.chooseImage();
  return new Promise(function (resolve, reject) {
    var fail = function () {
      reject({ ok: false, code: 'cancelled', message: '未选择图片' });
    };
    if (typeof wx !== 'undefined' && typeof wx.chooseMedia === 'function') {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sizeType: ['original'],
        sourceType: ['album', 'camera'],
        success: function (res) {
          var f = res.tempFiles && res.tempFiles[0];
          if (!f || !f.tempFilePath) {
            fail();
            return;
          }
          resolve({
            filePath: f.tempFilePath,
            size: f.size,
            fileType: f.fileType || f.type
          });
        },
        fail: fail
      });
      return;
    }
    if (typeof wx === 'undefined' || typeof wx.chooseImage !== 'function') {
      fail();
      return;
    }
    wx.chooseImage({
      count: 1,
      sizeType: ['original'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        var p = res.tempFilePaths && res.tempFilePaths[0];
        if (!p) {
          fail();
          return;
        }
        resolve({ filePath: p, size: null, fileType: '' });
      },
      fail: fail
    });
  });
}

function hasPendingUpload() {
  return !!( _pending && _pending.cloudPath && _pending.filePath );
}

function rememberPending(row) {
  _pending = row;
}

function clearPending() {
  _pending = null;
}

function asUploadResult(value) {
  if (value && typeof value.then === 'function') return value;
  return Promise.resolve(value);
}

function successPayload(fileID, file, route, uploadId, cloudPath, extra) {
  extra = extra || {};
  clearPending();
  return Object.assign(
    {
      ok: true,
      fileID: fileID,
      via: extra.via || '',
      route: extra.route || route,
      fileType: file.ext,
      fileSize: file.fileSize,
      uploadId: uploadId,
      cloudPath: cloudPath,
      confirmed: !!extra.confirmed,
      compressed: !!file.compressed
    },
    extra
  );
}

function failFromUpload(up, file, route, uploadId, cloudPath) {
  var code = (up && up.code) || 'upload_failed';
  if (code === 'upload_uncertain' || code === 'upload_missing') {
    rememberPending({
      uploadId: uploadId,
      cloudPath: cloudPath,
      filePath: file.filePath,
      kind: file.kind || 'logo',
      ext: file.ext,
      fileSize: file.fileSize,
      previewPath: file.previewPath || file.filePath,
      route: (up && up.route) || route
    });
  }
  return formatUploadError(up && up.err, {
    route: (up && up.route) || route,
    fileType: file.ext,
    fileSize: file.fileSize,
    userMessage: userMessageFor(code, (up && up.message) || '图片上传失败'),
    code: code,
    stage: (up && up.stage) || 'uploadFile',
    uploadId: uploadId,
    cloudPath: cloudPath,
    confirmedMissing: !!(up && up.confirmedMissing),
    diagId: makeDiagId(uploadId)
  });
}

function confirmThen(file, route, uploadId, cloudPath, up) {
  return teamCloud.getClient().then(function (cli) {
    if (!cli.ok) {
      rememberPending({
        uploadId: uploadId,
        cloudPath: cloudPath,
        filePath: file.filePath,
        kind: file.kind || 'logo',
        ext: file.ext,
        fileSize: file.fileSize,
        previewPath: file.previewPath || file.filePath,
        route: route
      });
      return formatUploadError(cli.err, {
        route: cli.route || route,
        code: 'upload_uncertain',
        stage: 'cloud_init',
        userMessage: MSG_UNCERTAIN,
        fileType: file.ext,
        fileSize: file.fileSize,
        uploadId: uploadId,
        cloudPath: cloudPath
      });
    }
    var expected = teamCloud.buildExpectedFileID(cli.route || route, cloudPath);
    return teamCloud.confirmFile(cli, expected, cloudPath).then(function (found) {
      if (found && found.exists && found.fileID) {
        return successPayload(found.fileID, file, route, uploadId, cloudPath, {
          confirmed: true,
          via: cli.via,
          route: cli.route || route
        });
      }
      var code = found && found.uncertain === false && !found.exists ? 'upload_missing' : 'upload_uncertain';
      return failFromUpload(
        {
          ok: false,
          code: code,
          err: up && up.err,
          route: cli.route || route,
          stage: 'confirm',
          confirmedMissing: code === 'upload_missing'
        },
        file,
        route,
        uploadId,
        cloudPath
      );
    });
  });
}

function uploadProcessed(file, kind) {
  file.kind = kind;
  var route = teamCloud.getRoute();
  if (!route || !route.ok) {
    return Promise.resolve(
      formatUploadError(null, {
        code: (route && route.code) || 'env_unknown',
        userMessage: (route && route.message) || '无法确认上传环境，已拒绝',
        route: route || {},
        fileType: file.ext,
        fileSize: file.fileSize,
        stage: 'prepare'
      })
    );
  }
  var uploadId = String(file.uploadId || _activeUploadId || newUploadId()).replace(/[^a-zA-Z0-9]/g, '');
  if (uploadId.length < 8) uploadId = newUploadId();
  _activeUploadId = uploadId;
  var repo = factory.get();
  var prepareFn =
    hooks().prepare ||
    (repo && typeof repo.prepareTeamAssetUpload === 'function'
      ? function (p) {
          return repo.prepareTeamAssetUpload(p);
        }
      : null);
  if (!prepareFn) {
    return Promise.resolve(
      formatUploadError(null, {
        code: 'service_unavailable',
        userMessage: '无法申请上传路径',
        route: route,
        fileType: file.ext,
        fileSize: file.fileSize,
        stage: 'prepare'
      })
    );
  }
  teamCloud.logStage('prepare', { route: route, uploadId: uploadId });
  return Promise.resolve(prepareFn({ ext: file.ext, kind: kind, uploadId: uploadId })).then(function (prep) {
    if (!prep || !prep.ok) {
      return formatUploadError(null, {
        code: (prep && prep.code) || 'upload_failed',
        userMessage: (prep && prep.message) || '无法申请上传路径',
        route: route,
        fileType: file.ext,
        fileSize: file.fileSize,
        stage: 'prepare',
        uploadId: uploadId
      });
    }
    var cloudPath = String((prep.data && prep.data.cloudPath) || prep.cloudPath || '').trim();
    if (!cloudPath) {
      return formatUploadError(null, {
        code: 'upload_failed',
        userMessage: '上传路径无效',
        route: route,
        fileType: file.ext,
        fileSize: file.fileSize,
        stage: 'prepare',
        uploadId: uploadId
      });
    }
    rememberPending({
      uploadId: uploadId,
      cloudPath: cloudPath,
      filePath: file.filePath,
      kind: kind,
      ext: file.ext,
      fileSize: file.fileSize,
      previewPath: file.previewPath || file.filePath,
      route: route
    });
    var doUpload = hooks().uploadFile || teamCloud.uploadFile;
    return asUploadResult(doUpload(file.filePath, cloudPath)).then(
      function (up) {
        if (!up || !up.ok) {
          if (up && (up.code === 'upload_uncertain' || up.code === 'upload_missing' || up.confirmed)) {
            if (up.ok) {
              return successPayload(up.fileID, file, route, uploadId, cloudPath, up);
            }
            return failFromUpload(up, file, route, uploadId, cloudPath);
          }
          var kindErr = (up && up.errorKind) || teamCloud.classifyUploadError(up && up.err);
          if (kindErr === 'timeout' || kindErr === 'network' || kindErr === 'uncertain' || !up) {
            return confirmThen(file, route, uploadId, cloudPath, up);
          }
          return failFromUpload(up || { code: 'upload_failed' }, file, route, uploadId, cloudPath);
        }
        var fileID = String(up.fileID || '').trim();
        if (!fields.isDurableAvatar(fileID) || fields.isTempPath(fileID) || fileID.indexOf('cloud://') !== 0) {
          return formatUploadError(null, {
            code: 'invalid_logo',
            userMessage: '未获得长期文件地址，未保存临时路径',
            route: (up && up.route) || route,
            fileType: file.ext,
            fileSize: file.fileSize,
            stage: 'uploadFile',
            uploadId: uploadId
          });
        }
        if (route.envId && !teamCloud.fileIdMatchesEnv(fileID, route.envId)) {
          return formatUploadError(null, {
            code: 'env_mismatch',
            userMessage: '测试环境文件不能用于当前环境',
            route: (up && up.route) || route,
            fileType: file.ext,
            fileSize: file.fileSize,
            stage: 'uploadFile',
            uploadId: uploadId
          });
        }
        return successPayload(fileID, file, route, uploadId, cloudPath, up);
      },
      function (err) {
        return confirmThen(file, route, uploadId, cloudPath, { err: err });
      }
    );
  });
}

function uploadLocalFile(input) {
  var kind = input && input.kind === 'avatar' ? 'avatar' : 'logo';
  var filePath = String((input && input.filePath) || '').trim();
  var previewPath = filePath;
  if (!filePath) {
    return Promise.resolve({ ok: false, code: 'invalid_file', message: '请选择图片', previewPath: '' });
  }
  if (fields.isDurableAvatar(filePath) && !fields.isTempPath(filePath)) {
    return Promise.resolve({ ok: true, fileID: filePath, previewPath: filePath });
  }
  return inspectLocalFile(filePath, { size: input && input.size, fileType: input && input.fileType })
    .then(function (ins) {
      if (!ins.ok) {
        ins.previewPath = previewPath;
        return ins;
      }
      return maybeSquare(ins.filePath, kind).then(function (squared) {
        return maybeCompress(squared, ins, kind).then(function (compressed) {
          ins.filePath = compressed.filePath;
          ins.fileSize = compressed.fileSize;
          ins.compressed = !!compressed.compressed;
          ins.uploadId = input && input.uploadId;
          return uploadProcessed(ins, kind).then(function (res) {
            res.previewPath = previewPath;
            res.fileSize = ins.fileSize;
            res.compressed = ins.compressed;
            return res;
          });
        });
      });
    });
}

function pickAndUpload(options) {
  options = options || {};
  if (_uploading) {
    return Promise.resolve({ ok: false, code: 'busy', message: '正在上传，请稍候' });
  }
  _uploading = true;
  _activeUploadId = String(options.uploadId || newUploadId());
  return chooseLocalImage()
    .then(function (picked) {
      if (typeof options.onPreview === 'function') {
        options.onPreview({
          previewPath: picked.filePath,
          fileType: picked.fileType,
          fileSize: picked.size
        });
      }
      return uploadLocalFile({
        kind: options.kind,
        filePath: picked.filePath,
        size: picked.size,
        fileType: picked.fileType,
        uploadId: options.uploadId || _activeUploadId || newUploadId()
      });
    })
    .then(
      function (res) {
        _uploading = false;
        return res;
      },
      function (err) {
        _uploading = false;
        if (err && err.code === 'cancelled') {
          return { ok: false, code: 'cancelled', message: '未选择图片' };
        }
        return formatUploadError(err, { userMessage: '图片上传失败' });
      }
    );
}

function retryPendingUpload() {
  if (_uploading) {
    return Promise.resolve({ ok: false, code: 'busy', message: '正在上传，请稍候' });
  }
  if (!hasPendingUpload()) {
    return Promise.resolve({ ok: false, code: 'no_pending', message: '没有待确认的上传' });
  }
  _uploading = true;
  var p = _pending;
  var file = {
    filePath: p.filePath,
    ext: p.ext,
    fileSize: p.fileSize,
    kind: p.kind,
    previewPath: p.previewPath,
    uploadId: p.uploadId
  };
  var route = teamCloud.getRoute() || p.route || {};
  return confirmThen(file, route, p.uploadId, p.cloudPath, null).then(function (first) {
    if (first && first.ok) {
      _uploading = false;
      first.previewPath = p.previewPath;
      return first;
    }
    if (!first || first.code !== 'upload_missing') {
      _uploading = false;
      if (first) first.previewPath = p.previewPath;
      return first || { ok: false, code: 'upload_uncertain', message: MSG_UNCERTAIN };
    }
    var doUpload = hooks().uploadFile || teamCloud.uploadFile;
    return asUploadResult(doUpload(p.filePath, p.cloudPath)).then(
      function (up) {
        _uploading = false;
        if (up && up.ok && up.fileID) {
          var done = successPayload(up.fileID, file, route, p.uploadId, p.cloudPath, up);
          done.previewPath = p.previewPath;
          return done;
        }
        var kindErr = (up && up.errorKind) || teamCloud.classifyUploadError(up && up.err);
        if (up && (up.code === 'upload_uncertain' || up.code === 'upload_missing')) {
          var failed = failFromUpload(up, file, route, p.uploadId, p.cloudPath);
          failed.previewPath = p.previewPath;
          return failed;
        }
        if (kindErr === 'timeout' || kindErr === 'network' || kindErr === 'uncertain' || !up) {
          return confirmThen(file, route, p.uploadId, p.cloudPath, up).then(function (res) {
            res.previewPath = p.previewPath;
            return res;
          });
        }
        var other = failFromUpload(up || { code: 'upload_failed' }, file, route, p.uploadId, p.cloudPath);
        other.previewPath = p.previewPath;
        return other;
      },
      function (err) {
        return confirmThen(file, route, p.uploadId, p.cloudPath, { err: err }).then(function (res) {
          _uploading = false;
          res.previewPath = p.previewPath;
          return res;
        });
      }
    );
  });
}

function flushOrphans() {
  var list = readOrphans();
  if (!list.length) return Promise.resolve({ ok: true, deleted: 0 });
  var repo = factory.get();
  if (!repo || typeof repo.purgeTeamAssetOrphans !== 'function') {
    return Promise.resolve({ ok: false, code: 'service_unavailable' });
  }
  var ids = list.map(function (row) {
    return row.fileID;
  });
  return Promise.resolve(repo.purgeTeamAssetOrphans({ fileIDs: ids })).then(function (res) {
    if (res && res.ok) writeOrphans([]);
    return res;
  });
}

module.exports = {
  MAX_BYTES: MAX_BYTES,
  normalizeExt: normalizeExt,
  inspectLocalFile: inspectLocalFile,
  uploadLocalFile: uploadLocalFile,
  pickAndUpload: pickAndUpload,
  formatUploadError: formatUploadError,
  displayUploadError: displayUploadError,
  enqueueOrphan: enqueueOrphan,
  markCommitted: markCommitted,
  flushOrphans: flushOrphans,
  isUploading: isUploading,
  newUploadId: newUploadId,
  hasPendingUpload: hasPendingUpload,
  retryPendingUpload: retryPendingUpload,
  setTestHooks: setTestHooks,
  resetTestHooks: resetTestHooks,
  ORPHAN_KEY: ORPHAN_KEY
};
