/**
 * 球队 LOGO 权威链路 + 简称 Unicode 可见字符。
 * 不连接真实云、不部署。
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

var TEST_ENV = 'golfbrothers-test-d1db3k1e6dcc39';
var PROD_ENV = 'cloud1-d5gluh1ode0ef8738';
var FILE_ID = 'cloud://' + TEST_ENV + '.bucket/team-club/hash/tmp/logo-mark.jpg';
var PROD_ID = 'cloud://' + PROD_ENV + '.bucket/team-logos/old.jpg';
var TEMP_URL = 'https://example.tcb.qcloud.la/logo-mark.jpg?sign=abc';

var storage = {};
global.__TEAM_CLUB_REPO_MODE = 'local';
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
  }
};

var engine = require(path.join(cloudLib, 'engine.js'));
var memoryStore = require(path.join(cloudLib, 'memoryStore.js'));
var C = require(path.join(cloudLib, 'constants.js'));
var cloudFields = require(path.join(cloudLib, 'teamFields.js'));
var teamFields = require(path.join(mini, 'utils', 'teamClub', 'teamFields.js'));
var teamLogo = require(path.join(mini, 'utils', 'teamClub', 'teamLogo.js'));
var teamCloud = require(path.join(mini, 'utils', 'teamClub', 'teamCloud.js'));
var identity = require(path.join(mini, 'utils', 'teamClub', 'identity.js'));
var repo = require(path.join(mini, 'utils', 'teamClub', 'repository.js'));
var service = require(path.join(mini, 'utils', 'teamClub', 'service.js'));
var snapshot = require(path.join(mini, 'utils', 'teamClub', 'snapshot.js'));
var mockAvatars = require(path.join(mini, 'utils', 'mockAvatars.js'));

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

function call(store, openid, action, payload, extra) {
  return engine.dispatch(
    store,
    { OPENID: openid },
    Object.assign({ action: action, payload: payload || {} }, extra || {})
  );
}

async function main() {
  assert('高尔夫队计 4 个可见字符', teamFields.visibleLength('高尔夫队') === 4 && cloudFields.visibleLength('高尔夫队') === 4);
  assert('第 5 字截断为前 4 字', teamFields.sliceVisible('高尔夫队X', 4) === '高尔夫队');
  assert('英文 4 字符', teamFields.visibleLength('Golf') === 4);
  var tooLong = teamFields.sanitizeShortName('高尔夫队X', {});
  assert('客户端拒绝第 5 个汉字', tooLong.ok === false && tooLong.message === '简称最多4个字');
  assert('四汉字可通过', teamFields.sanitizeShortName('高尔夫队', {}).ok === true);
  assert('英文四字符可通过', teamFields.sanitizeShortName('Golf', {}).ok === true);

  var store = memoryStore.createMemoryStore();
  process.env.TCB_ENV = TEST_ENV;
  await call(store, 'oid_logo_owner', 'createMyProfile', { displayName: '队长甲' });
  var created = await call(store, 'oid_logo_owner', 'createTeam', {
    name: '识别队',
    shortName: '高尔夫队',
    logo: FILE_ID
  });
  assert('createTeam 接受测试环境 cloud:// fileID', created.ok && created.data.logo === FILE_ID);
  var club = await store.get(C.COLLECTIONS.CLUBS, created.data.teamId);
  assert('team_clubs.logo 与上传 fileID 一致', club && club.logo === FILE_ID);
  assert('createTeam 返回 logo 一致', created.data.logo === FILE_ID);
  var listed = await call(store, 'oid_logo_owner', 'listMyTeams', {});
  var got = await call(store, 'oid_logo_owner', 'getTeam', { teamId: created.data.teamId });
  assert(
    'listMyTeams / getTeam 保持同一 logo',
    listed.ok &&
      listed.data[0].logo === FILE_ID &&
      got.ok &&
      got.data.logo === FILE_ID
  );

  var prod = await call(store, 'oid_logo_owner', 'createTeam', {
    name: '串环境队',
    logo: PROD_ID
  });
  assert('生产 cloud1 fileID 不能进入测试球队', prod.ok === false && prod.code === 'env_mismatch');

  var forgedShort = await call(store, 'oid_logo_owner', 'createTeam', {
    name: '超长简称',
    shortName: '高尔夫队X'
  });
  assert(
    '云端拒绝超过 4 个 Unicode 字符的简称',
    forgedShort.ok === false &&
      forgedShort.code === 'invalid_short_name' &&
      forgedShort.message === '简称最多4个字'
  );
  var engOk = await call(store, 'oid_logo_owner', 'createTeam', {
    name: 'English Club',
    shortName: 'Golf'
  });
  assert('云端接受英文 4 字符简称', engOk.ok && engOk.data.shortName === 'Golf');
  delete process.env.TCB_ENV;

  var tmpReject = cloudFields.persistStoredLogo('https://example.tcb.qcloud.la/x.jpg?sign=1', TEST_ENV);
  assert('临时 HTTPS 不能入库', tmpReject.ok === false);

  teamCloud.setTestHooks({
    getTempFileURL: function (id) {
      return { ok: true, src: TEMP_URL, fileID: id };
    }
  });
  teamLogo.resetCache();
  identity.setTestSession({ userId: 'user_logo', displayName: '创建者' });
  repo.resetForTests();
  snapshot.reset();

  var svcCreate = await service.createTeam({
    name: '页面队',
    shortName: '高尔夫队',
    logo: FILE_ID
  });
  assert('service.createTeam 权威字段仍是 fileID', svcCreate.ok && svcCreate.team.logo === FILE_ID);
  assert('页面绑定 logoSrc 为派生临时 URL', svcCreate.team.logoSrc === TEMP_URL);
  assert('页面不绑定默认图作为权威展示', svcCreate.team.logoSrc !== mockAvatars.DEFAULT_AVATAR);
  var diag = teamLogo.logDiag({
    stage: 'selftest',
    upload: FILE_ID,
    saved: svcCreate.team.logo,
    boundField: 'logoSrc',
    route: { maskedEnvId: 'golfbrother****cc39', envName: 'golfbrothers-test' }
  });
  assert('脱敏诊断 upload/saved 一致且不含 OPENID', diag.match === true && JSON.stringify(diag).indexOf('OPENID') < 0);

  var listedSvc = await service.listMyTeams();
  var detailSvc = await service.getTeamDetail(svcCreate.team.id);
  assert(
    'listMyTeams 与 getTeam 页面绑定同一真实 LOGO',
    listedSvc.ok &&
      listedSvc.list[0].logo === FILE_ID &&
      listedSvc.list[0].logoSrc === TEMP_URL &&
      detailSvc.ok &&
      detailSvc.team.logo === FILE_ID &&
      detailSvc.team.logoSrc === TEMP_URL
  );

  snapshot.reset();
  var afterClear = await service.getTeamDetail(svcCreate.team.id);
  assert(
    '清除 snapshot 后仍显示真实 LOGO',
    afterClear.ok && afterClear.team.logo === FILE_ID && afterClear.team.logoSrc === TEMP_URL
  );

  var broken = teamLogo.markBroken(Object.assign({}, afterClear.team));
  assert(
    'binderror 只改展示态不改权威字段',
    broken.logoBroken === true && broken.logo === FILE_ID
  );
  assert('失败才走占位图', teamLogo.bindSrc(broken) === teamLogo.PLACEHOLDER);

  snapshot.putTeam({ teamId: svcCreate.team.id, logo: FILE_ID, name: '页面队' });
  snapshot.putTeam({
    teamId: svcCreate.team.id,
    logo: mockAvatars.DEFAULT_AVATAR,
    name: '页面队'
  });
  var peeked = snapshot.peekTeam(svcCreate.team.id);
  assert('默认 LOGO 不能覆盖 snapshot 中的 cloud fileID', peeked.logo === FILE_ID);

  var localProd = repo.createTeam({ name: '本地串环境', shortName: '串环', logo: PROD_ID });
  assert('本地仓储也拒绝 cloud1 fileID', localProd.ok === false && localProd.code === 'env_mismatch');

  var createJs = read(path.join(mini, 'subpackages', 'player', 'pages', 'me', 'teams', 'create', 'index.js'));
  var createWxml = read(path.join(mini, 'subpackages', 'player', 'pages', 'me', 'teams', 'create', 'index.wxml'));
  var editJs = read(path.join(mini, 'subpackages', 'player', 'pages', 'me', 'team-edit', 'index.js'));
  var editWxml = read(path.join(mini, 'subpackages', 'player', 'pages', 'me', 'team-edit', 'index.wxml'));
  var listWxml = read(path.join(mini, 'subpackages', 'player', 'pages', 'me', 'teams', 'index.wxml'));
  var introWxml = read(
    path.join(mini, 'subpackages', 'player', 'pages', 'me', 'team-detail', 'components', 'team-intro', 'index.wxml')
  );
  assert('创建页不再把 mock 头像写入 logo', createJs.indexOf('pickMockAvatar') < 0);
  assert('创建页简称不用 UTF-16 slice(0, 4)', createJs.indexOf("slice(0, SHORT_MAX)") < 0);
  assert('创建/编辑页都用 Unicode 截断', createJs.indexOf('sliceVisible') >= 0 && editJs.indexOf('sliceVisible') >= 0);
  assert('创建/编辑页同一错误文案', createJs.indexOf('简称最多4个字') >= 0 || createJs.indexOf('teamFields.SHORT_ERROR') >= 0 || createJs.indexOf('shortChecked.message') >= 0);
  assert('编辑页提交走同一 sanitize', editJs.indexOf('sanitizeShortName') >= 0 && createJs.indexOf('sanitizeShortName') >= 0);
  assert('创建页去掉会截汉字的 maxlength=4', createWxml.indexOf('maxlength="4"') < 0);
  assert('编辑页去掉会截汉字的 maxlength=4', editWxml.indexOf('maxlength="4"') < 0);
  assert('列表绑定 logoSrc 而非权威字段', listWxml.indexOf('item.logoSrc') >= 0 && listWxml.indexOf('src="{{item.logo}}"') < 0);
  assert('详情绑定 logoSrc', introWxml.indexOf('team.logoSrc') >= 0);
  assert('列表 binderror 不写回云端字段', listWxml.indexOf('binderror="onLogoError"') >= 0);
  assert('创建页 binderror', createWxml.indexOf('binderror="onLogoError"') >= 0);
  assert('编辑页 binderror', editWxml.indexOf('binderror="onLogoError"') >= 0);

  var svc = read(path.join(mini, 'utils', 'teamClub', 'service.js'));
  assert('decorateTeam 不再 resolveAvatar 覆盖球队 logo', /logo:\s*resolveLogo\(fullName,\s*team\.logo\)/.test(svc) === false);

  teamCloud.setTestHooks(null);
  teamLogo.resetCache();
  console.log('\n---- teamClub.logo.selftest ----');
  console.log('passed=' + passed + ' failed=' + failed);
  process.exit(failed ? 1 : 0);
}

main().catch(function (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
