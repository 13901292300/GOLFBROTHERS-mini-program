/**
 * 球队 LOGO / 表单：测试环境上传路由、类型校验、临时路径、提交锁、表单 token。
 */
var path = require('path');
var fs = require('fs');
var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var cloudLib = path.join(root, 'cloudfunctions', 'teamClub', 'lib');

var passed = 0;
var failed = 0;
function assert(label, ok) {
  if (ok) {
    passed += 1;
    console.log('PASS  ' + label);
  } else {
    failed += 1;
    console.log('FAIL  ' + label);
  }
}

var capturedUploads = [];
var capturedCalls = [];
var orphans = [];
var cloudInits = [];

global.wx = {
  getAccountInfoSync: function () {
    return { miniProgram: { envVersion: 'develop' } };
  },
  getStorageSync: function () {
    return orphans;
  },
  setStorageSync: function (key, value) {
    orphans = value;
  },
  cloud: {
    init: function (opts) {
      cloudInits.push(opts);
    },
    callFunction: function (opts) {
      capturedCalls.push(opts);
      var action = opts && opts.data && opts.data.action;
      if (action === 'prepareTeamAssetUpload') {
        return Promise.resolve({
          result: {
            ok: true,
            data: { cloudPath: 'team-club/testhash/tmp/logo-unit.jpg' }
          }
        });
      }
      if (action === 'purgeTeamAssetOrphans') {
        return Promise.resolve({ result: { ok: true, data: { deleted: 1, skipped: 0 } } });
      }
      if (action === 'createTeam') {
        var logo = opts.data.payload && opts.data.payload.logo;
        if (logo && String(logo).indexOf('wxfile:') === 0) {
          return Promise.resolve({
            result: { ok: false, code: 'invalid_logo', message: 'LOGO 未上传成功，不能使用临时路径' }
          });
        }
        return Promise.resolve({ result: { ok: true, data: { teamId: 't1', logo: logo } } });
      }
      return Promise.resolve({ result: { ok: true, data: {} } });
    },
    Cloud: function (opts) {
      return {
        init: function () {
          return Promise.resolve();
        },
        uploadFile: function (o) {
          capturedUploads.push({
            cloudPath: o.cloudPath,
            filePath: o.filePath,
            resourceEnv: opts.resourceEnv,
            config: o.config
          });
          return Promise.resolve({
            fileID: 'cloud://golfbrothers-test-d1db3k1e6dcc39.bucket/' + o.cloudPath
          });
        },
        getTempFileURL: function (o) {
          var id = o && o.fileList && o.fileList[0];
          return Promise.resolve({
            fileList: [
              {
                status: 0,
                fileID: id,
                tempFileURL: 'https://example.tcb.qcloud.la/logo.jpg?sign=unit'
              }
            ]
          });
        }
      };
    },
    uploadFile: function (o) {
      capturedUploads.push({
        cloudPath: o.cloudPath,
        filePath: o.filePath,
        config: o.config,
        via: 'default'
      });
      return Promise.resolve({ fileID: 'cloud://cloud1-d5gluh1ode0ef8738.bucket/wrong.jpg' });
    }
  }
};

var cloudEnv = require(path.join(mini, 'utils', 'teamClub', 'cloudEnv.js'));
var teamCloud = require(path.join(mini, 'utils', 'teamClub', 'teamCloud.js'));
var teamAssetUpload = require(path.join(mini, 'utils', 'teamClub', 'teamAssetUpload.js'));
var engine = require(path.join(cloudLib, 'engine.js'));
var memoryStore = require(path.join(cloudLib, 'memoryStore.js'));
var cryptoUtil = require(path.join(cloudLib, 'cryptoUtil.js'));
var teamAssets = require(path.join(cloudLib, 'teamAssets.js'));

function call(store, openid, action, payload) {
  return engine.dispatch(store, { OPENID: openid }, { action: action, payload: payload || {} });
}

async function main() {
  cloudEnv.resetTestHooks();
  teamCloud.resetCache();
  teamAssetUpload.resetTestHooks();

  var formWxss = fs.readFileSync(path.join(mini, 'subpackages', 'player', 'styles', 'team-form.wxss'), 'utf8');
  assert('表单高度 token 76rpx', formWxss.indexOf('--tf-input-height: 76rpx') >= 0);
  assert('表单字号 token 28rpx', formWxss.indexOf('--tf-input-font: 28rpx') >= 0);
  assert('输入框 box-sizing', formWxss.indexOf('box-sizing: border-box') >= 0);
  assert('占位符弱于正文', formWxss.indexOf('--tf-ph:') >= 0 && formWxss.indexOf('placeholder-class') < 0);
  assert('计数与字段间距', formWxss.indexOf('--tf-count-gap:') >= 0 && formWxss.indexOf('--tf-field-gap:') >= 0);
  assert('安全区页脚', formWxss.indexOf('safe-area-inset-bottom') >= 0);
  assert('开关行基线对齐', formWxss.indexOf('.field--row') >= 0 && formWxss.indexOf('align-items: center') >= 0);

  var createWxss = fs.readFileSync(path.join(mini, 'subpackages', 'player', 'pages', 'me', 'teams', 'create', 'index.wxss'), 'utf8');
  var editWxss = fs.readFileSync(path.join(mini, 'subpackages', 'player', 'pages', 'me', 'team-edit', 'index.wxss'), 'utf8');
  assert(
    '创建/编辑复用同一 form token',
    createWxss.indexOf("styles/team-form.wxss") >= 0 && editWxss.indexOf("styles/team-form.wxss") >= 0
  );
  var createWxml = fs.readFileSync(path.join(mini, 'subpackages', 'player', 'pages', 'me', 'teams', 'create', 'index.wxml'), 'utf8');
  var editWxml = fs.readFileSync(path.join(mini, 'subpackages', 'player', 'pages', 'me', 'team-edit', 'index.wxml'), 'utf8');
  assert('创建页 placeholder-class', createWxml.indexOf('placeholder-class="field__ph"') >= 0);
  assert('编辑页共用控件 class', editWxml.indexOf('team-form') >= 0 && editWxml.indexOf('field__input') >= 0);
  assert('键盘/安全区留白', createWxml.indexOf('form-end-space') >= 0 && createWxss.indexOf('disableScroll') < 0);
  var createJson = fs.readFileSync(path.join(mini, 'subpackages', 'player', 'pages', 'me', 'teams', 'create', 'index.json'), 'utf8');
  assert('创建页 disableScroll 避免整页被按钮顶乱', createJson.indexOf('"disableScroll": true') >= 0);

  var createJs = fs.readFileSync(path.join(mini, 'subpackages', 'player', 'pages', 'me', 'teams', 'create', 'index.js'), 'utf8');
  var appSrc = fs.readFileSync(path.join(mini, 'app.js'), 'utf8');
  var posterSrc = fs.readFileSync(path.join(mini, 'subpackages', 'poster', 'components', 'golf-poster', 'index.js'), 'utf8');
  assert('创建页不再直连 wx.cloud.uploadFile', createJs.indexOf('wx.cloud.uploadFile') < 0);
  assert(
    '不改变 segmentPortrait 全局 init',
    appSrc.indexOf('cloud1-d5gluh1ode0ef8738') >= 0 &&
      appSrc.indexOf('golfbrothers-test-d1db3k1e6dcc39') < 0 &&
      posterSrc.indexOf('golfbrothers-test') < 0
  );

  cloudEnv.setTestAccountReader(function () {
    return 'develop';
  });
  capturedUploads = [];
  teamCloud.resetCache();
  var upDev = await teamCloud.uploadFile('wxfile://tmp_a.jpg', 'team-club/testhash/tmp/logo-unit.jpg');
  assert(
    'develop LOGO 只上传测试环境',
    upDev.ok &&
      capturedUploads.length === 1 &&
      capturedUploads[0].resourceEnv === cloudEnv.TEST.envId &&
      capturedUploads[0].resourceEnv !== cloudEnv.RELEASE.envId &&
      (!capturedUploads[0].via || capturedUploads[0].via !== 'default')
  );

  cloudEnv.setTestAccountReader(function () {
    return 'trial';
  });
  capturedUploads = [];
  teamCloud.resetCache();
  var upTrial = await teamCloud.uploadFile('wxfile://tmp_a.jpg', 'team-club/testhash/tmp/logo-unit.jpg');
  assert('trial LOGO 只上传测试环境', upTrial.ok && capturedUploads[0].resourceEnv === cloudEnv.TEST.envId);

  cloudEnv.setTestAccountReader(function () {
    return 'release';
  });
  cloudEnv.setTestReleaseDeployed(false);
  capturedUploads = [];
  teamCloud.resetCache();
  var upRel = await teamCloud.uploadFile('wxfile://tmp_a.jpg', 'x.jpg');
  assert(
    'release 未开放不会误传测试环境',
    upRel.ok === false &&
      upRel.code === 'not_open' &&
      capturedUploads.length === 0
  );

  cloudEnv.setTestAccountReader(function () {
    return '';
  });
  capturedUploads = [];
  teamCloud.resetCache();
  var upUnknown = await teamCloud.uploadFile('wxfile://tmp_a.jpg', 'x.jpg');
  assert('环境未知拒绝上传且不默认 cloud1', upUnknown.ok === false && upUnknown.code === 'env_unknown' && capturedUploads.length === 0);

  var gif = await teamAssetUpload.inspectLocalFile('photo.gif', { size: 1200, fileType: 'image/gif' });
  assert('拒绝 gif', gif.ok === false && gif.code === 'invalid_file');
  var huge = await teamAssetUpload.inspectLocalFile('photo.jpg', { size: 6 * 1024 * 1024, fileType: 'image/jpeg' });
  assert('拒绝超大文件', huge.ok === false && huge.code === 'file_too_large');
  var okType = await teamAssetUpload.inspectLocalFile('photo.webp', { size: 2048, fileType: 'image/webp' });
  assert('允许 webp', okType.ok && okType.ext === 'webp');

  cloudEnv.setTestAccountReader(function () {
    return 'develop';
  });
  teamCloud.resetCache();
  teamAssetUpload.setTestHooks({
    prepare: function () {
      return { ok: true, data: { cloudPath: 'team-club/testhash/tmp/logo-ok.jpg' } };
    },
    uploadFile: function (filePath, cloudPath) {
      capturedUploads.push({ filePath: filePath, cloudPath: cloudPath });
      return {
        ok: true,
        fileID: 'cloud://golfbrothers-test-d1db3k1e6dcc39.bucket/' + cloudPath,
        via: 'Cloud',
        route: cloudEnv.resolveTeamClubCloud()
      };
    }
  });
  capturedUploads = [];
  var localOk = await teamAssetUpload.uploadLocalFile({
    kind: 'logo',
    filePath: 'wxfile://tmp_logo.jpg',
    size: 1200,
    fileType: 'image/jpeg'
  });
  assert(
    '上传成功返回长期 fileID',
    localOk.ok &&
      String(localOk.fileID).indexOf('cloud://') === 0 &&
      String(localOk.fileID).indexOf('wxfile:') < 0
  );

  teamAssetUpload.setTestHooks({
    prepare: function () {
      return { ok: true, data: { cloudPath: 'team-club/testhash/tmp/logo-fail.jpg' } };
    },
    uploadFile: function () {
      return {
        ok: false,
        err: { errCode: -1, errMsg: 'uploadFile:fail STORAGE wxfile://secret' },
        route: cloudEnv.resolveTeamClubCloud()
      };
    }
  });
  var failedUp = await teamAssetUpload.uploadLocalFile({
    kind: 'logo',
    filePath: 'wxfile://tmp_logo.jpg',
    size: 800,
    fileType: 'jpg'
  });
  assert('失败保留脱敏错误码', failedUp.ok === false && failedUp.errCode === -1 && String(failedUp.errMsg).indexOf('wxfile:') < 0);
  assert('失败文案含环境名', failedUp.envName === 'golfbrothers-test');

  teamAssetUpload.setTestHooks({
    prepare: function () {
      return { ok: true, data: { cloudPath: 'team-club/testhash/tmp/logo-retry.jpg' } };
    },
    uploadFile: function (filePath, cloudPath) {
      return {
        ok: true,
        fileID: 'cloud://golfbrothers-test-d1db3k1e6dcc39.bucket/' + cloudPath,
        route: cloudEnv.resolveTeamClubCloud()
      };
    }
  });
  var retried = await teamAssetUpload.uploadLocalFile({
    kind: 'logo',
    filePath: 'wxfile://tmp_logo.jpg',
    size: 800,
    fileType: 'jpg'
  });
  assert('失败后可重试成功', retried.ok && String(retried.fileID).indexOf('cloud://') === 0);

  teamAssetUpload.setTestHooks({
    chooseImage: function () {
      return new Promise(function () {
        /* hold lock */
      });
    }
  });
  teamAssetUpload.pickAndUpload({ kind: 'logo' });
  var secondPick = await teamAssetUpload.pickAndUpload({ kind: 'logo' });
  assert('重复点击只上传一次', secondPick.ok === false && secondPick.code === 'busy');
  teamAssetUpload.resetTestHooks();

  var store = memoryStore.createMemoryStore();
  var p = await call(store, 'oid_logo_1', 'createMyProfile', { displayName: '队长' });
  var badLogo = await call(store, 'oid_logo_1', 'createTeam', {
    name: '临时路径队',
    logo: 'wxfile://tmp_logo.jpg'
  });
  assert('创建失败不把临时路径写入球队', badLogo.ok === false && badLogo.code === 'invalid_logo' && p.ok);

  var prep = await call(store, 'oid_logo_1', 'prepareTeamAssetUpload', {
    ext: 'png',
    kind: 'logo',
    uploadId: 'uploadid01',
    ownerUserId: 'forged-owner'
  });
  var hash = cryptoUtil.hashOpenid('oid_logo_1');
  assert(
    '签发路径含不可伪造归属且忽略客户端 ownerUserId',
    prep.ok &&
      String(prep.data.cloudPath) === 'team-club/' + hash + '/tmp/logo-uploadid01.png' &&
      String(prep.data.cloudPath).indexOf('forged-owner') < 0
  );
  var prepAgain = await call(store, 'oid_logo_1', 'prepareTeamAssetUpload', {
    ext: 'png',
    kind: 'logo',
    uploadId: 'uploadid01'
  });
  assert('同一 uploadId 重试复用路径', prepAgain.ok && prepAgain.data.cloudPath === prep.data.cloudPath);

  var otherHash = cryptoUtil.hashOpenid('oid_other');
  store.deletedFiles = [];
  var purged = await call(store, 'oid_logo_1', 'purgeTeamAssetOrphans', {
    fileIDs: [
      'cloud://env/' + teamAssets.tmpPrefix(hash) + 'logo-a.jpg',
      'cloud://env/' + teamAssets.tmpPrefix(otherHash) + 'logo-b.jpg',
      'cloud://env/team-club/' + hash + '/logo/used.jpg'
    ]
  });
  assert(
    '清理只删自己的 tmp 且不误删已用 LOGO',
    purged.ok &&
      purged.data.deleted === 1 &&
      store.deletedFiles.length === 1 &&
      String(store.deletedFiles[0]).indexOf('/logo/used.jpg') < 0
  );

  var created = await call(store, 'oid_logo_1', 'createTeam', {
    name: '正式队',
    logo: 'cloud://golfbrothers-test-d1db3k1e6dcc39.bucket/team-club/' + hash + '/tmp/logo-ok.jpg'
  });
  assert('长期 fileID 可入库', created.ok && String(created.data.logo).indexOf('cloud://') === 0);

  var fmt = teamAssetUpload.displayUploadError({
    message: '网络连接中断，正在保留本次上传记录；重试时会先确认，不会重复上传。',
    diagId: 'LTEST01',
    errCode: -1,
    errMsg: 'uploadFile:fail Error: read ECONNRESET',
    envVersion: 'develop',
    envName: 'golfbrothers-test',
    env: cloudEnv.maskEnvId(cloudEnv.TEST.envId),
    fileType: 'jpg',
    fileSize: 1140000
  });
  assert(
    '弹窗只有用户文案和诊断编号',
    fmt.indexOf(cloudEnv.TEST.envId) < 0 &&
      fmt.indexOf('errCode') < 0 &&
      fmt.indexOf('ECONNRESET') < 0 &&
      fmt.indexOf('诊断编号 LTEST01') >= 0
  );

  assert(
    '权限失败不得 fallback',
    teamCloud.canFallbackToConfigEnv('permission', true) === false &&
      teamCloud.canFallbackToConfigEnv('permission', false) === false
  );
  assert(
    '超时/网络/配额/存储不得 fallback',
    teamCloud.canFallbackToConfigEnv('timeout', true) === false &&
      teamCloud.canFallbackToConfigEnv('network', false) === false &&
      teamCloud.canFallbackToConfigEnv('quota', false) === false &&
      teamCloud.canFallbackToConfigEnv('storage', false) === false &&
      teamCloud.canFallbackToConfigEnv('uncertain', true) === false
  );
  assert(
    '仅 API 缺失且未上传才允许 fallback',
    teamCloud.canFallbackToConfigEnv('no_api', false) === true &&
      teamCloud.canFallbackToConfigEnv('capability', false) === true &&
      teamCloud.canFallbackToConfigEnv('no_api', true) === false
  );

  var defaultUploads = 0;
  var cloudUploads = 0;
  var origUpload = global.wx.cloud.uploadFile;
  var origCloud = global.wx.cloud.Cloud;
  global.wx.cloud.uploadFile = function (o) {
    defaultUploads += 1;
    capturedUploads.push({ via: 'default', cloudPath: o.cloudPath, config: o.config });
    var env = (o.config && o.config.env) || 'missing-env';
    return Promise.resolve({ fileID: 'cloud://' + env + '.bucket/' + (o.cloudPath || 'x.jpg') });
  };
  global.wx.cloud.Cloud = function (opts) {
    return {
      init: function () {
        return Promise.resolve();
      },
      uploadFile: function (o) {
        cloudUploads += 1;
        capturedUploads.push({ via: 'Cloud', cloudPath: o.cloudPath, resourceEnv: opts.resourceEnv });
        return Promise.reject({ errCode: -404011, errMsg: 'permission denied' });
      },
      getTempFileURL: function () {
        return Promise.resolve({ fileList: [{ status: 1 }] });
      }
    };
  };
  cloudEnv.setTestAccountReader(function () {
    return 'develop';
  });
  teamCloud.resetCache();
  capturedUploads = [];
  defaultUploads = 0;
  cloudUploads = 0;
  var perm = await teamCloud.uploadFile('wxfile://tmp_a.jpg', 'team-club/testhash/tmp/logo-perm.jpg');
  assert(
    '权限失败不改通道重传',
    perm.ok === false &&
      perm.errorKind === 'permission' &&
      perm.fallbackBlocked === true &&
      cloudUploads === 1 &&
      defaultUploads === 0
  );

  global.wx.cloud.Cloud = function (opts) {
    return {
      init: function () {
        return Promise.resolve();
      },
      uploadFile: function () {
        cloudUploads += 1;
        return Promise.reject({ errCode: -1, errMsg: 'uploadFile:fail timeout' });
      },
      getTempFileURL: function () {
        return Promise.resolve({ fileList: [{ status: 1, errMsg: 'timeout' }] });
      }
    };
  };
  teamCloud.setTestHooks({
    confirmFile: function () {
      return {
        exists: true,
        uncertain: false,
        fileID: 'cloud://golfbrothers-test-d1db3k1e6dcc39.bucket/team-club/testhash/tmp/logo-time.jpg'
      };
    }
  });
  teamCloud.resetCache();
  cloudUploads = 0;
  defaultUploads = 0;
  var timedFound = await teamCloud.uploadFile('wxfile://tmp_a.jpg', 'team-club/testhash/tmp/logo-time.jpg');
  assert(
    '不确定结果先确认已存在则不重传',
    timedFound.ok === true &&
      timedFound.confirmed === true &&
      cloudUploads === 1 &&
      defaultUploads === 0
  );

  teamCloud.setTestHooks({
    confirmFile: function () {
      return { exists: false, uncertain: true };
    }
  });
  teamCloud.resetCache();
  cloudUploads = 0;
  defaultUploads = 0;
  var timed = await teamCloud.uploadFile('wxfile://tmp_a.jpg', 'team-club/testhash/tmp/logo-time.jpg');
  assert(
    '网络超时先确认且不盲目重传',
    timed.ok === false &&
      timed.code === 'upload_uncertain' &&
      cloudUploads === 1 &&
      defaultUploads === 0
  );
  teamCloud.setTestHooks(null);

  delete global.wx.cloud.Cloud;
  teamCloud.resetCache();
  cloudUploads = 0;
  defaultUploads = 0;
  capturedUploads = [];
  var cap = await teamCloud.uploadFile('wxfile://tmp_a.jpg', 'team-club/testhash/tmp/logo-cap.jpg');
  assert(
    'API 缺失且尚未上传时才 fallback',
    cap.ok === true &&
      defaultUploads === 1 &&
      capturedUploads[0].via === 'default' &&
      capturedUploads[0].config &&
      capturedUploads[0].config.env === cloudEnv.TEST.envId
  );
  global.wx.cloud.Cloud = origCloud;
  global.wx.cloud.uploadFile = origUpload;
  teamCloud.resetCache();

  var paths = [];
  teamAssetUpload.setTestHooks({
    prepare: function (p) {
      return call(store, 'oid_logo_1', 'prepareTeamAssetUpload', p);
    },
    uploadFile: function (filePath, cloudPath) {
      paths.push(cloudPath);
      return {
        ok: true,
        fileID: 'cloud://golfbrothers-test-d1db3k1e6dcc39.bucket/' + cloudPath,
        route: cloudEnv.resolveTeamClubCloud()
      };
    }
  });
  var sameA = await teamAssetUpload.uploadLocalFile({
    kind: 'logo',
    filePath: 'wxfile://tmp_logo.jpg',
    size: 100,
    fileType: 'jpg',
    uploadId: 'sameid001'
  });
  var sameB = await teamAssetUpload.uploadLocalFile({
    kind: 'logo',
    filePath: 'wxfile://tmp_logo.jpg',
    size: 100,
    fileType: 'jpg',
    uploadId: 'sameid001'
  });
  assert(
    '同一 uploadId 两次上传同一路径只指向一个文件',
    sameA.ok &&
      sameB.ok &&
      sameA.cloudPath === sameB.cloudPath &&
      paths.length === 2 &&
      paths[0] === paths[1]
  );

  teamAssetUpload.setTestHooks({
    prepare: function () {
      return { ok: true, data: { cloudPath: 'team-club/testhash/tmp/logo-prod.jpg' } };
    },
    uploadFile: function () {
      return {
        ok: true,
        fileID: 'cloud://cloud1-d5gluh1ode0ef8738.bucket/team-logos/1.jpg',
        route: cloudEnv.resolveTeamClubCloud()
      };
    }
  });
  var mismatch = await teamAssetUpload.uploadLocalFile({
    kind: 'logo',
    filePath: 'wxfile://tmp_logo.jpg',
    size: 100,
    fileType: 'jpg',
    uploadId: 'mismatch01'
  });
  assert('测试环境不接受正式环境 fileID', mismatch.ok === false && mismatch.code === 'env_mismatch');

  assert(
    'ECONNRESET 归为 network',
    teamCloud.classifyUploadError({
      errCode: -1,
      errMsg: 'cloud.uploadFile:fail undefined',
      message: 'uploadFile:fail Error: read ECONNRESET'
    }) === 'network'
  );

  var econnUploads = 0;
  var econnConfirms = 0;
  var econnDefault = 0;
  var econnEnvs = [];
  var econnIds = [];
  var origCloud2 = global.wx.cloud.Cloud;
  var origDefault2 = global.wx.cloud.uploadFile;
  global.wx.cloud.uploadFile = function () {
    econnDefault += 1;
    return Promise.resolve({ fileID: 'cloud://cloud1-d5gluh1ode0ef8738.bucket/wrong.jpg' });
  };
  global.wx.cloud.Cloud = function (opts) {
    econnEnvs.push(opts && opts.resourceEnv);
    return {
      init: function () {
        return Promise.resolve();
      },
      uploadFile: function (o) {
        econnUploads += 1;
        return Promise.reject({
          errCode: -1,
          errMsg: 'cloud.uploadFile:fail undefined',
          message: 'uploadFile:fail Error: read ECONNRESET'
        });
      },
      getTempFileURL: function (o) {
        econnConfirms += 1;
        var id = o && o.fileList && o.fileList[0];
        econnIds.push(id);
        return Promise.resolve({
          fileList: [
            {
              status: 0,
              fileID: id,
              tempFileURL: 'https://example.tcb.qcloud.la/ok.jpg?sign=1'
            }
          ]
        });
      }
    };
  };
  cloudEnv.setTestAccountReader(function () {
    return 'develop';
  });
  teamCloud.resetCache();
  teamCloud.setTestHooks(null);
  var econnFound = await teamCloud.uploadFile(
    'wxfile://tmp_logo.jpg',
    'team-club/testhash/tmp/logo-econn.jpg'
  );
  assert(
    'ECONNRESET 但对象存在则视为成功',
    econnFound.ok &&
      econnFound.confirmed &&
      econnUploads === 1 &&
      econnConfirms === 1 &&
      econnDefault === 0 &&
      econnEnvs[0] === cloudEnv.TEST.envId &&
      String(econnFound.fileID).indexOf(cloudEnv.TEST.envId) >= 0
  );
  assert(
    '确认使用测试环境完整 fileID',
    econnIds[0] &&
      String(econnIds[0]).indexOf('cloud://' + cloudEnv.TEST.envId) === 0 &&
      String(econnIds[0]).indexOf(cloudEnv.RELEASE.envId) < 0
  );

  global.wx.cloud.Cloud = function (opts) {
    econnEnvs.push(opts && opts.resourceEnv);
    return {
      init: function () {
        return Promise.resolve();
      },
      uploadFile: function () {
        econnUploads += 1;
        return Promise.reject({
          errCode: -1,
          errMsg: 'cloud.uploadFile:fail undefined',
          message: 'read ECONNRESET'
        });
      },
      getTempFileURL: function () {
        econnConfirms += 1;
        return Promise.reject({ errCode: -1, errMsg: 'getTempFileURL:fail Error: read ECONNRESET' });
      }
    };
  };
  teamCloud.resetCache();
  econnUploads = 0;
  econnConfirms = 0;
  econnDefault = 0;
  var econnBoth = await teamCloud.uploadFile(
    'wxfile://tmp_logo.jpg',
    'team-club/testhash/tmp/logo-econn2.jpg'
  );
  assert(
    '上传和确认同时断网不重传',
    econnBoth.ok === false &&
      econnBoth.code === 'upload_uncertain' &&
      econnUploads === 1 &&
      econnConfirms === 1 &&
      econnDefault === 0
  );
  var shownUncertain = teamAssetUpload.displayUploadError(
    teamAssetUpload.formatUploadError(econnBoth.err, {
      code: 'upload_uncertain',
      route: econnBoth.route,
      uploadId: 'retryid01',
      stage: 'confirm'
    })
  );
  assert(
    '无法确认时弹窗可理解',
    shownUncertain.indexOf('正在保留本次上传记录') >= 0 &&
      shownUncertain.indexOf('ECONNRESET') < 0 &&
      shownUncertain.indexOf('诊断编号') >= 0
  );

  var retryUploads = [];
  var retryConfirms = 0;
  teamCloud.setTestHooks({
    confirmFile: function (info) {
      retryConfirms += 1;
      if (retryConfirms === 1) return { exists: false, uncertain: true, fileID: info.fileID };
      return {
        exists: true,
        uncertain: false,
        fileID: 'cloud://golfbrothers-test-d1db3k1e6dcc39.bucket/' + info.cloudPath
      };
    }
  });
  teamAssetUpload.resetTestHooks();
  teamAssetUpload.setTestHooks({
    prepare: function (p) {
      return { ok: true, data: { cloudPath: 'team-club/testhash/tmp/logo-' + p.uploadId + '.jpg' } };
    },
    uploadFile: function (filePath, cloudPath) {
      retryUploads.push(cloudPath);
      return {
        ok: false,
        err: {
          errCode: -1,
          errMsg: 'cloud.uploadFile:fail undefined',
          message: 'read ECONNRESET'
        },
        errorKind: 'network',
        route: cloudEnv.resolveTeamClubCloud()
      };
    }
  });
  var pendingFirst = await teamAssetUpload.uploadLocalFile({
    kind: 'logo',
    filePath: 'wxfile://tmp_logo.jpg',
    size: 1140000,
    fileType: 'jpg',
    uploadId: 'retryid01'
  });
  assert(
    '首次不确定会保留记录',
    pendingFirst.ok === false &&
      pendingFirst.code === 'upload_uncertain' &&
      teamAssetUpload.hasPendingUpload() &&
      retryUploads.length === 1
  );
  var pendingRetry = await teamAssetUpload.retryPendingUpload();
  assert(
    '重试确认已存在不发生第二次 uploadFile',
    pendingRetry.ok &&
      pendingRetry.confirmed &&
      retryUploads.length === 1 &&
      retryConfirms === 2
  );

  retryUploads = [];
  retryConfirms = 0;
  var objectExists = false;
  teamCloud.setTestHooks({
    confirmFile: function (info) {
      retryConfirms += 1;
      if (objectExists) {
        return {
          exists: true,
          uncertain: false,
          fileID: 'cloud://golfbrothers-test-d1db3k1e6dcc39.bucket/' + info.cloudPath
        };
      }
      return { exists: false, uncertain: false, fileID: info.fileID };
    }
  });
  teamAssetUpload.setTestHooks({
    prepare: function (p) {
      return { ok: true, data: { cloudPath: 'team-club/testhash/tmp/logo-' + p.uploadId + '.jpg' } };
    },
    uploadFile: function (filePath, cloudPath) {
      retryUploads.push(cloudPath);
      if (retryUploads.length > 1) {
        objectExists = true;
        return {
          ok: true,
          fileID: 'cloud://golfbrothers-test-d1db3k1e6dcc39.bucket/' + cloudPath,
          route: cloudEnv.resolveTeamClubCloud()
        };
      }
      return {
        ok: false,
        err: { errCode: -1, message: 'read ECONNRESET' },
        errorKind: 'network',
        route: cloudEnv.resolveTeamClubCloud()
      };
    }
  });
  var missingFirst = await teamAssetUpload.uploadLocalFile({
    kind: 'logo',
    filePath: 'wxfile://tmp_logo.jpg',
    size: 400000,
    fileType: 'jpg',
    uploadId: 'retryid02'
  });
  assert(
    '明确不存在不在同一次自动重传',
    missingFirst.ok === false &&
      missingFirst.code === 'upload_missing' &&
      retryUploads.length === 1
  );
  var shownMissing = teamAssetUpload.displayUploadError(missingFirst);
  assert(
    '明确不存在时弹窗可理解',
    shownMissing.indexOf('LOGO尚未上传') >= 0 && shownMissing.indexOf('ECONNRESET') < 0
  );
  var missingRetry = await teamAssetUpload.retryPendingUpload();
  assert(
    '明确不存在后才重传且复用路径',
    missingRetry.ok &&
      retryUploads.length === 2 &&
      retryUploads[0] === retryUploads[1] &&
      retryUploads[0].indexOf('retryid02') >= 0
  );

  var compressCalls = 0;
  var seenSizes = [];
  teamAssetUpload.setTestHooks({
    compressImage: function (opts) {
      compressCalls += 1;
      opts.success({ tempFilePath: 'wxfile://tmp_compressed.jpg' });
    },
    getFileInfo: function (opts) {
      var size = String(opts.filePath).indexOf('compressed') >= 0 ? 280000 : 1140000;
      seenSizes.push(size);
      opts.success({ size: size });
    },
    prepare: function () {
      return { ok: true, data: { cloudPath: 'team-club/testhash/tmp/logo-compress.jpg' } };
    },
    uploadFile: function (filePath, cloudPath) {
      return {
        ok: true,
        fileID: 'cloud://golfbrothers-test-d1db3k1e6dcc39.bucket/' + cloudPath,
        route: cloudEnv.resolveTeamClubCloud()
      };
    }
  });
  var compressed = await teamAssetUpload.uploadLocalFile({
    kind: 'logo',
    filePath: 'wxfile://tmp_album.jpg',
    size: 1140000,
    fileType: 'jpg',
    uploadId: 'compress01'
  });
  assert(
    '压缩后再校验大小且不误判过大',
    compressed.ok &&
      compressCalls === 1 &&
      compressed.compressed === true &&
      compressed.fileSize === 280000 &&
      compressed.code !== 'file_too_large'
  );

  compressCalls = 0;
  var avatarSmall = await teamAssetUpload.uploadLocalFile({
    kind: 'avatar',
    filePath: 'wxfile://tmp_album.jpg',
    size: 400000,
    fileType: 'jpg',
    uploadId: 'avatar-skip-compress'
  });
  assert(
    '头像小于 1MB 不再二次 compressImage',
    avatarSmall.ok && compressCalls === 0 && avatarSmall.compressed === false
  );

  teamAssetUpload.resetTestHooks();
  teamAssetUpload.setTestHooks({
    chooseImage: function () {
      return new Promise(function () {
        /* hold lock */
      });
    }
  });
  teamAssetUpload.pickAndUpload({ kind: 'logo' });
  var busyAgain = await teamAssetUpload.pickAndUpload({ kind: 'logo' });
  var busyRetry = await teamAssetUpload.retryPendingUpload();
  assert(
    '快速连点仍只有一个上传任务',
    busyAgain.code === 'busy' && busyRetry.code === 'busy'
  );
  teamAssetUpload.resetTestHooks();
  teamCloud.setTestHooks(null);
  global.wx.cloud.Cloud = origCloud2;
  global.wx.cloud.uploadFile = origDefault2;
  teamCloud.resetCache();

  process.env.TCB_ENV = cloudEnv.RELEASE.envId;
  var leak = await call(store, 'oid_logo_1', 'createTeam', {
    name: '串环境',
    logo: 'cloud://golfbrothers-test-d1db3k1e6dcc39.bucket/team-club/x/tmp/logo.jpg'
  });
  delete process.env.TCB_ENV;
  assert('测试环境 fileID 不能被正式环境误用', leak.ok === false && leak.code === 'env_mismatch');
  teamAssetUpload.resetTestHooks();

  cloudEnv.resetTestHooks();
  console.log('\n---- teamClub.assets.selftest ----');
  console.log('passed=' + passed + ' failed=' + failed);
  process.exit(failed ? 1 : 0);
}

main().catch(function (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
