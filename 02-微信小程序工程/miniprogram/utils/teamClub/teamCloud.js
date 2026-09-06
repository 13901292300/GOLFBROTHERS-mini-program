'use strict';

/**
 * 球队域独立云实例。不改全局 wx.cloud.init。
 * 仅在独立 Cloud 能力缺失且尚未发起上传时，才改用 config.env。
 * 权限/超时/网络/配额/存储等错误不得改通道重传。
 */

var cloudEnv = require('./cloudEnv.js');

var _cache = {
  envId: '',
  client: null,
  via: '',
  useConfigEnv: false,
  reason: ''
};
var _testHooks = null;
var _uploadStarted = false;
var _fileIdHost = '';

function hooks() {
  return _testHooks || {};
}

function setTestHooks(h) {
  _testHooks = h && typeof h === 'object' ? h : null;
}

function resetCache() {
  _cache = { envId: '', client: null, via: '', useConfigEnv: false, reason: '' };
  _uploadStarted = false;
  _fileIdHost = '';
}

function maskFileID(fileID) {
  var s = String(fileID || '');
  if (!s) return '';
  if (s.indexOf('cloud://') === 0) {
    var env = envIdFromFileID(s);
    var leaf = s.split('/').slice(-1)[0] || '';
    return env ? 'cloud://' + env.slice(0, 12) + '****/' + leaf : 'cloud://****';
  }
  return '[redacted]';
}

function rememberFileIdHost(fileID) {
  var m = String(fileID || '').match(/^cloud:\/\/([^/]+)\//);
  if (!m) return;
  var host = m[1];
  if (envIdFromFileID('cloud://' + host + '/x')) _fileIdHost = host;
}

function buildExpectedFileID(route, cloudPath) {
  var envId = route && route.envId ? String(route.envId) : '';
  var pathPart = String(cloudPath || '').replace(/^\//, '');
  if (!envId || !pathPart) return '';
  if (_fileIdHost && envIdFromFileID('cloud://' + _fileIdHost + '/x') === envId) {
    return 'cloud://' + _fileIdHost + '/' + pathPart;
  }
  return 'cloud://' + envId + '/' + pathPart;
}

function logStage(stage, info) {
  info = info || {};
  var route = info.route || {};
  var row = {
    stage: String(stage || ''),
    envVersion: route.envVersion || '',
    envName: route.envName || '',
    env: route.maskedEnvId || '',
    via: info.via || '',
    errCode: info.errCode == null ? '' : info.errCode,
    errMsg: String(info.errMsg || '').slice(0, 180),
    fileID: maskFileID(info.fileID),
    cloudPath: info.cloudPath ? String(info.cloudPath).split('/').slice(-1)[0] : '',
    exists: info.exists,
    uncertain: info.uncertain,
    uploadId: info.uploadId ? String(info.uploadId).slice(-6) : ''
  };
  try {
    console.log('[teamClub:upload:' + row.stage + ']', row);
  } catch (e) {
    /* ignore */
  }
  return row;
}

function getRoute() {
  var route = cloudEnv.resolveTeamClubCloud();
  cloudEnv.logRoute('storage', route);
  return route;
}

function envIdFromFileID(fileID) {
  var m = String(fileID || '').match(/^cloud:\/\/([a-zA-Z0-9-]+)/);
  return m ? m[1] : '';
}

function fileIdMatchesEnv(fileID, envId) {
  var got = envIdFromFileID(fileID);
  if (!got || !envId) return false;
  return got === String(envId);
}

function textOf(err) {
  if (!err) return '';
  return [err.errMsg, err.message, err.stack, err.errCode, err.code, err]
    .filter(function (x) {
      return x != null && x !== '';
    })
    .join(' ')
    .toLowerCase();
}

function isCapabilityError(err) {
  var t = textOf(err);
  return (
    /not a constructor/.test(t) ||
    /is not a function/.test(t) ||
    /cannot find/.test(t) ||
    /not support/.test(t) ||
    /unsupported/.test(t) ||
    /不支持/.test(t) ||
    /undefined/.test(t) && /cloud/.test(t)
  );
}

function classifyUploadError(err) {
  var code = err && (err.errCode != null ? String(err.errCode) : String(err.code || ''));
  var t = textOf(err) + ' ' + code;
  if (/permission|denied|exceed_authority|forbidden|auth|无权限|非法|403|-404011|-403/.test(t)) {
    return 'permission';
  }
  if (/timeout|timed out|time out|超时/.test(t)) return 'timeout';
  if (/econnreset|econnrefused|econn|network|offline|socket|enotfound|read error|网络中断|网络/.test(t)) {
    return 'network';
  }
  if (/quota|exceed|容量|配额/.test(t) && !/authority/.test(t)) return 'quota';
  if (/too large|filesize|413|过大/.test(t)) return 'too_large';
  if (/storage|605000|-501/.test(t)) return 'storage';
  if (!err || t.indexOf('uncertain') >= 0 || /empty|lost|incomplete|unknown/.test(t)) {
    return 'uncertain';
  }
  return 'uncertain';
}

function canFallbackToConfigEnv(kind, uploadStarted) {
  if (uploadStarted) return false;
  return kind === 'no_api' || kind === 'capability';
}

function probeTransport(route) {
  var h = hooks();
  if (typeof h.probeTransport === 'function') {
    return Promise.resolve(h.probeTransport(route));
  }
  if (typeof wx === 'undefined' || !wx.cloud) {
    return Promise.resolve({
      ok: false,
      code: 'service_unavailable',
      message: '云服务不可用',
      route: route
    });
  }
  if (typeof wx.cloud.Cloud !== 'function') {
    return Promise.resolve({
      ok: true,
      cloud: wx.cloud,
      route: route,
      via: 'config.env',
      useConfigEnv: true,
      reason: 'no_api'
    });
  }
  var inst = null;
  try {
    inst = new wx.cloud.Cloud({ resourceEnv: route.envId });
  } catch (e) {
    if (isCapabilityError(e)) {
      return Promise.resolve({
        ok: true,
        cloud: wx.cloud,
        route: route,
        via: 'config.env',
        useConfigEnv: true,
        reason: 'capability'
      });
    }
    return Promise.resolve({
      ok: false,
      code: 'cloud_init_failed',
      message: '云实例初始化失败',
      err: e,
      route: route
    });
  }
  if (!inst || typeof inst.init !== 'function' || typeof inst.uploadFile !== 'function') {
    return Promise.resolve({
      ok: true,
      cloud: wx.cloud,
      route: route,
      via: 'config.env',
      useConfigEnv: true,
      reason: 'capability'
    });
  }
  return Promise.resolve(inst.init()).then(
    function () {
      logStage('cloud_init', { route: route, via: 'Cloud', errMsg: 'ok' });
      return {
        ok: true,
        cloud: inst,
        route: route,
        via: 'Cloud',
        useConfigEnv: false,
        reason: 'cloud'
      };
    },
    function (err) {
      if (isCapabilityError(err) && !_uploadStarted) {
        logStage('cloud_init', { route: route, via: 'config.env', errMsg: 'capability fallback before upload' });
        return {
          ok: true,
          cloud: wx.cloud,
          route: route,
          via: 'config.env',
          useConfigEnv: true,
          reason: 'capability'
        };
      }
      logStage('cloud_init', {
        route: route,
        errCode: err && err.errCode,
        errMsg: (err && (err.errMsg || err.message)) || 'cloud init failed'
      });
      return {
        ok: false,
        code: 'cloud_init_failed',
        message: '云实例初始化失败，未改用其它通道',
        err: err,
        route: route,
        stage: 'cloud_init'
      };
    }
  );
}

function getClient() {
  var route = getRoute();
  if (!route || !route.ok) {
    return Promise.resolve(
      route || { ok: false, code: 'env_unknown', message: '无法确认小程序版本环境，已拒绝调用' }
    );
  }
  if (_cache.envId === route.envId && _cache.client) {
    return Promise.resolve({
      ok: true,
      cloud: _cache.client,
      route: route,
      via: _cache.via,
      useConfigEnv: _cache.useConfigEnv,
      reason: _cache.reason
    });
  }
  return probeTransport(route).then(function (cli) {
    if (cli && cli.ok && cli.cloud) {
      _cache = {
        envId: route.envId,
        client: cli.cloud,
        via: cli.via,
        useConfigEnv: !!cli.useConfigEnv,
        reason: cli.reason || ''
      };
    }
    return cli;
  });
}

function withEnv(opts, cli) {
  var next = Object.assign({}, opts || {});
  if (cli.useConfigEnv && cli.route && cli.route.envId) {
    next.config = Object.assign({}, next.config || {}, { env: cli.route.envId });
  }
  return next;
}

function confirmFile(cli, fileID, cloudPath) {
  var h = hooks();
  var route = cli && cli.route;
  var expected = buildExpectedFileID(route, cloudPath);
  var asked = [];
  if (fileID) asked.push(String(fileID));
  if (expected && asked.indexOf(expected) < 0) asked.push(expected);
  asked = asked.filter(function (id) {
    return id && id.indexOf('cloud://') === 0 && (!route || !route.envId || fileIdMatchesEnv(id, route.envId));
  });
  logStage('confirm', {
    route: route,
    via: cli && cli.via,
    fileID: asked[0] || fileID || expected,
    cloudPath: cloudPath
  });
  if (typeof h.confirmFile === 'function') {
    return Promise.resolve(
      h.confirmFile({ fileID: asked[0] || fileID, cloudPath: cloudPath, route: route, fileList: asked })
    );
  }
  if (!cli || !cli.cloud || typeof cli.cloud.getTempFileURL !== 'function' || !asked.length) {
    return Promise.resolve({ exists: false, uncertain: true, fileID: asked[0] || expected });
  }
  return Promise.resolve(cli.cloud.getTempFileURL(withEnv({ fileList: asked }, cli))).then(
    function (res) {
      var list = (res && res.fileList) || [];
      var sawMissing = false;
      var i;
      for (i = 0; i < list.length; i++) {
        var row = list[i];
        var gotId = row && (row.fileID || asked[i] || asked[0]);
        if (gotId && route && route.envId && !fileIdMatchesEnv(gotId, route.envId)) {
          logStage('confirm', {
            route: route,
            errMsg: 'ignored cross-env fileID',
            fileID: gotId,
            exists: false,
            uncertain: true
          });
          continue;
        }
        if (row && Number(row.status) === 0 && (row.tempFileURL || row.fileID)) {
          rememberFileIdHost(gotId);
          logStage('confirm', {
            route: route,
            via: cli.via,
            fileID: gotId,
            cloudPath: cloudPath,
            exists: true,
            uncertain: false
          });
          return { exists: true, uncertain: false, fileID: gotId, via: cli.via, envId: route && route.envId };
        }
        if (row && Number(row.status) === STORAGE_NOT_FOUND()) sawMissing = true;
      }
      if (sawMissing) {
        logStage('confirm', {
          route: route,
          fileID: asked[0],
          cloudPath: cloudPath,
          exists: false,
          uncertain: false
        });
        return { exists: false, uncertain: false, fileID: asked[0] || expected };
      }
      logStage('confirm', {
        route: route,
        fileID: asked[0],
        cloudPath: cloudPath,
        exists: false,
        uncertain: true,
        errMsg: 'getTempFileURL inconclusive'
      });
      return { exists: false, uncertain: true, fileID: asked[0] || expected };
    },
    function (err) {
      logStage('confirm', {
        route: route,
        fileID: asked[0] || expected,
        cloudPath: cloudPath,
        exists: false,
        uncertain: true,
        errCode: err && err.errCode,
        errMsg: (err && (err.errMsg || err.message)) || 'getTempFileURL failed'
      });
      return { exists: false, uncertain: true, fileID: asked[0] || expected };
    }
  );
}

function STORAGE_NOT_FOUND() {
  return 605002;
}

function uploadOnce(cli, filePath, cloudPath) {
  _uploadStarted = true;
  logStage('uploadFile', { route: cli && cli.route, via: cli && cli.via, cloudPath: cloudPath });
  if (typeof hooks().uploadOnce === 'function') {
    return Promise.resolve(hooks().uploadOnce(cli, filePath, cloudPath));
  }
  return Promise.resolve(
    cli.cloud.uploadFile(
      withEnv(
        {
          cloudPath: cloudPath,
          filePath: filePath
        },
        cli
      )
    )
  );
}

function finishFound(cli, found, extra) {
  extra = extra || {};
  if (found && found.exists && found.fileID) {
    if (cli.route && cli.route.envId && !fileIdMatchesEnv(found.fileID, cli.route.envId)) {
      return {
        ok: false,
        code: 'env_mismatch',
        message: '文件不属于当前球队云环境',
        route: cli.route,
        via: cli.via,
        stage: extra.stage || 'confirm'
      };
    }
    rememberFileIdHost(found.fileID);
    return {
      ok: true,
      fileID: found.fileID,
      route: cli.route,
      via: cli.via,
      confirmed: true,
      stage: extra.stage || 'confirm'
    };
  }
  var kind = extra.kind || 'uncertain';
  var missing = found && found.uncertain === false && !found.exists;
  var uncertain = !found || found.uncertain !== false || (!found.exists && !missing);
  if (missing) {
    return {
      ok: false,
      code: 'upload_missing',
      err: extra.err,
      route: cli.route,
      via: cli.via,
      errorKind: kind,
      fallbackBlocked: extra.blockFallback !== false,
      confirmedMissing: true,
      expectedFileID: found && found.fileID,
      cloudPath: extra.cloudPath,
      stage: extra.stage || 'confirm'
    };
  }
  return {
    ok: false,
    code: 'upload_uncertain',
    err: extra.err,
    route: cli.route,
    via: cli.via,
    errorKind: kind,
    fallbackBlocked: extra.blockFallback !== false,
    confirmedMissing: false,
    expectedFileID: found && found.fileID,
    cloudPath: extra.cloudPath,
    stage: extra.stage || 'confirm'
  };
}

function uploadFile(filePath, cloudPath) {
  return getClient().then(function (cli) {
    if (!cli.ok) {
      cli.stage = cli.stage || 'cloud_init';
      return cli;
    }
    if (!cli.cloud || typeof cli.cloud.uploadFile !== 'function') {
      return {
        ok: false,
        code: 'service_unavailable',
        message: '无法上传文件',
        route: cli.route,
        stage: 'cloud_init'
      };
    }
    var startedBefore = _uploadStarted;
    return uploadOnce(cli, filePath, cloudPath).then(
      function (up) {
        var fileID = up && up.fileID ? String(up.fileID) : '';
        if (!fileID) {
          return confirmFile(cli, buildExpectedFileID(cli.route, cloudPath), cloudPath).then(function (found) {
            return finishFound(cli, found, { kind: 'uncertain', cloudPath: cloudPath, err: { errMsg: 'upload result missing' } });
          });
        }
        if (cli.route && cli.route.envId && !fileIdMatchesEnv(fileID, cli.route.envId)) {
          return {
            ok: false,
            code: 'env_mismatch',
            message: '文件不属于当前球队云环境',
            route: cli.route,
            via: cli.via,
            fileID: fileID,
            stage: 'uploadFile'
          };
        }
        rememberFileIdHost(fileID);
        logStage('uploadFile', {
          route: cli.route,
          via: cli.via,
          fileID: fileID,
          cloudPath: cloudPath,
          errMsg: 'ok'
        });
        return {
          ok: true,
          fileID: fileID,
          route: cli.route,
          via: cli.via,
          stage: 'uploadFile'
        };
      },
      function (err) {
        var kind = classifyUploadError(err);
        logStage('uploadFile', {
          route: cli.route,
          via: cli.via,
          cloudPath: cloudPath,
          errCode: err && err.errCode,
          errMsg: (err && (err.errMsg || err.message)) || 'uploadFile fail'
        });
        var blockFallback = !canFallbackToConfigEnv(kind, true) || startedBefore || _uploadStarted;
        var maybeConfirm = kind === 'timeout' || kind === 'network' || kind === 'uncertain';
        if (maybeConfirm) {
          return confirmFile(cli, (err && err.fileID) || buildExpectedFileID(cli.route, cloudPath), cloudPath).then(
            function (found) {
              return finishFound(cli, found, {
                kind: kind,
                cloudPath: cloudPath,
                err: err,
                blockFallback: blockFallback
              });
            }
          );
        }
        return {
          ok: false,
          code: 'upload_failed',
          err: err,
          route: cli.route,
          via: cli.via,
          errorKind: kind,
          fallbackBlocked: blockFallback,
          confirmedMissing: false,
          cloudPath: cloudPath,
          stage: 'uploadFile'
        };
      }
    );
  });
}

function getTempFileURL(fileID) {
  var id = String(fileID || '').trim();
  var h = hooks();
  if (typeof h.getTempFileURL === 'function') {
    return Promise.resolve(h.getTempFileURL(id));
  }
  if (!id) return Promise.resolve({ ok: false, src: '' });
  return getClient().then(function (cli) {
    if (cli && cli.route && cli.route.envId && id.indexOf('cloud://') === 0 && !fileIdMatchesEnv(id, cli.route.envId)) {
      logStage('confirm', { route: cli.route, fileID: id, errMsg: 'refused cross-env getTempFileURL' });
      return { ok: false, src: '', fileID: id, code: 'env_mismatch' };
    }
    if (!cli.ok || !cli.cloud || typeof cli.cloud.getTempFileURL !== 'function') {
      return { ok: false, src: id, fileID: id, stage: 'confirm' };
    }
    logStage('confirm', { route: cli.route, via: cli.via, fileID: id });
    return Promise.resolve(cli.cloud.getTempFileURL(withEnv({ fileList: [id] }, cli))).then(
      function (res) {
        var row = res && res.fileList && res.fileList[0];
        if (row && Number(row.status) === 0 && row.tempFileURL) {
          return { ok: true, src: String(row.tempFileURL), fileID: id, via: cli.via, envId: cli.route && cli.route.envId };
        }
        return { ok: false, src: id, fileID: id, via: cli.via };
      },
      function () {
        return { ok: false, src: id, fileID: id, via: cli.via };
      }
    );
  });
}

module.exports = {
  getRoute: getRoute,
  getClient: getClient,
  uploadFile: uploadFile,
  getTempFileURL: getTempFileURL,
  confirmFile: confirmFile,
  resetCache: resetCache,
  setTestHooks: setTestHooks,
  classifyUploadError: classifyUploadError,
  isCapabilityError: isCapabilityError,
  canFallbackToConfigEnv: canFallbackToConfigEnv,
  envIdFromFileID: envIdFromFileID,
  fileIdMatchesEnv: fileIdMatchesEnv,
  buildExpectedFileID: buildExpectedFileID,
  logStage: logStage,
  maskFileID: maskFileID
};
