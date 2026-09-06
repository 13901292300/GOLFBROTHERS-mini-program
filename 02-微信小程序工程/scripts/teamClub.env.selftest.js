/**
 * 球队云环境路由：develop/trial → 测试；release 未部署则暂未开放；未知版本拒绝。
 */
var path = require('path');
var fs = require('fs');
var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');

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

var captured = [];
var storage = {};
global.wx = {
  getAccountInfoSync: function () {
    return { miniProgram: { envVersion: 'develop' } };
  },
  getStorageSync: function (key) {
    return storage[key];
  },
  setStorageSync: function (key, value) {
    storage[key] = value;
  },
  removeStorageSync: function (key) {
    delete storage[key];
  },
  cloud: {
    callFunction: function (opts) {
      captured.push(opts);
      return Promise.resolve({ result: { ok: true, data: { ping: true } } });
    },
    uploadFile: function (opts) {
      captured.push({ kind: 'upload', opts: opts });
      return Promise.resolve({ fileID: 'cloud://test/x.jpg' });
    }
  }
};

var cloudEnv = require(path.join(mini, 'utils', 'teamClub', 'cloudEnv.js'));
var cloudRepository = require(path.join(mini, 'utils', 'teamClub', 'cloudRepository.js'));

async function main() {
  cloudEnv.resetTestHooks();
  cloudEnv.setTestAccountReader(function () {
    return 'develop';
  });
  captured = [];
  var d = await cloudRepository.listMyTeams();
  assert(
    'develop 只去测试环境',
    d.ok === true &&
      captured.length === 1 &&
      captured[0].config.env === cloudEnv.TEST.envId &&
      captured[0].name === 'teamClub'
  );

  cloudEnv.setTestAccountReader(function () {
    return 'trial';
  });
  captured = [];
  var t = await cloudRepository.getTeam('t1');
  assert(
    'trial 只去测试环境',
    t.ok === true && captured[0].config.env === cloudEnv.TEST.envId && captured[0].config.env !== cloudEnv.RELEASE.envId
  );

  cloudEnv.setTestAccountReader(function () {
    return 'release';
  });
  cloudEnv.setTestReleaseDeployed(false);
  captured = [];
  var rel = await cloudRepository.listMyTeams();
  assert(
    'release 绝不去测试环境',
    rel.ok === false &&
      rel.code === 'not_open' &&
      rel.message === '服务暂未开放' &&
      captured.length === 0
  );

  cloudEnv.setTestReleaseDeployed(true);
  captured = [];
  var relReady = await cloudRepository.listMyTeams();
  assert(
    'release 部署后走正式环境',
    relReady.ok === true &&
      captured[0].config.env === cloudEnv.RELEASE.envId &&
      captured[0].config.env !== cloudEnv.TEST.envId
  );
  cloudEnv.setTestReleaseDeployed(false);

  cloudEnv.setTestAccountReader(function () {
    return '';
  });
  captured = [];
  var unknown = await cloudRepository.listMyTeams();
  assert(
    '未知 envVersion 拒绝调用',
    unknown.ok === false && unknown.code === 'env_unknown' && captured.length === 0
  );

  cloudEnv.setTestAccountReader(function () {
    return 'preview';
  });
  captured = [];
  var weird = await cloudRepository.createTeam({ name: 'x' });
  assert('未识别版本拒绝调用', weird.ok === false && weird.code === 'env_unknown' && captured.length === 0);

  var appSrc = fs.readFileSync(path.join(mini, 'app.js'), 'utf8');
  var posterSrc = fs.readFileSync(
    path.join(mini, 'subpackages', 'poster', 'components', 'golf-poster', 'index.js'),
    'utf8'
  );
  assert(
    '不改变 segmentPortrait 原有环境',
    appSrc.indexOf('cloud1-d5gluh1ode0ef8738') >= 0 &&
      appSrc.indexOf('golfbrothers-test-d1db3k1e6dcc39') < 0 &&
      posterSrc.indexOf('name: "segmentPortrait"') >= 0 &&
      posterSrc.indexOf('golfbrothers-test') < 0
  );

  global.__TEAM_CLUB_REPO_MODE = 'cloud';
  var factory = require(path.join(mini, 'utils', 'teamClub', 'repoFactory.js'));
  cloudEnv.setTestAccountReader(function () {
    return 'develop';
  });
  var origCall = global.wx.cloud.callFunction;
  global.wx.cloud.callFunction = function () {
    return Promise.reject(new Error('network'));
  };
  var failCloud = await factory.get().listMyTeams();
  global.wx.cloud.callFunction = origCall;
  assert(
    '云失败不回落本地',
    factory.getMode() === 'cloud' &&
      failCloud.ok === false &&
      (failCloud.code === 'network_error' || failCloud.code === 'service_unavailable') &&
      fs.readFileSync(path.join(mini, 'utils', 'teamClub', 'cloudRepository.js'), 'utf8').indexOf("require('./repository.js')") < 0
  );

  var pagesHit = [];
  ['pages/home/index.js', 'subpackages/player/pages/me/teams/index.js', 'subpackages/player/pages/me/team-detail/index.js'].forEach(
    function (rel) {
      var src = fs.readFileSync(path.join(mini, rel), 'utf8');
      if (src.indexOf('golfbrothers-test') >= 0 || src.indexOf('cloud1-d5gluh1ode0ef8738') >= 0) pagesHit.push(rel);
    }
  );
  assert('页面不散落环境ID', pagesHit.length === 0);

  var masked = cloudEnv.maskEnvId(cloudEnv.TEST.envId);
  assert(
    '日志脱敏环境ID',
    masked.indexOf('golfbrothers-test-d1db3k1e6dcc39') < 0 && masked.indexOf('****') >= 0
  );

  cloudEnv.resetTestHooks();
  console.log('\n---- teamClub.env.selftest ----');
  console.log('passed=' + passed + ' failed=' + failed);
  process.exit(failed ? 1 : 0);
}

main().catch(function (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
