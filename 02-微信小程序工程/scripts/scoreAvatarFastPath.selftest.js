/**
 * 记分页本人头像 Fast Path：同 id+src 复用行对象；他人 https 不受 overlay 影响。
 * 运行：node scripts/scoreAvatarFastPath.selftest.js
 */
var fs = require('fs');
var path = require('path');

var passed = 0;
var failed = 0;

function assert(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    console.log('FAIL  ' + name + (detail ? ' :: ' + detail : ''));
  }
}

var store = Object.create(null);
var existingFiles = Object.create(null);

global.wx = {
  env: { USER_DATA_PATH: 'wxfile://usr' },
  getStorageSync: function (key) {
    return store[key];
  },
  setStorageSync: function (key, val) {
    store[key] = val;
  },
  getFileSystemManager: function () {
    return {
      accessSync: function (p) {
        if (!existingFiles[p]) throw new Error('noent');
      }
    };
  }
};

var fast = require('../miniprogram/utils/scoreAvatarFastPath.js');
var userProfileStore = require('../miniprogram/utils/userProfileStore.js');
var live = require('../miniprogram/utils/playerLiveDisplay.js');

var CLOUD_A = 'cloud://env.bucket/a.jpg';
var LOCAL_OK = 'wxfile://usr/gb_avatar_111.jpg';
var OTHER_HTTPS = 'https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/miniprogram/mock-avatars/mock-avatar-03.jpg';

existingFiles[LOCAL_OK] = true;
store['gb_user_profile_v1'] = {
  userId: 'acct-self',
  nickname: 'SelfNick',
  gender: '男',
  avatar: CLOUD_A,
  avatarLocalPath: LOCAL_OK
};

var meLive = live.applyLiveDisplayToView({
  userId: 'acct-self',
  playerId: 'seat-1',
  name: 'Old',
  avatar: CLOUD_A
});
assert('CASE1 score 首次 src = wxfile://usr', meLive.avatar === LOCAL_OK);

existingFiles[LOCAL_OK] = false;
var meCloud = live.applyLiveDisplayToView({
  userId: 'acct-self',
  playerId: 'seat-1',
  name: 'Old',
  avatar: CLOUD_A
});
assert('CASE2 无效 local fallback cloud:// 不抛错', meCloud.avatar === CLOUD_A);

existingFiles[LOCAL_OK] = true;
store['gb_user_profile_v1'] = {
  userId: 'acct-self',
  nickname: 'SelfNick',
  avatar: CLOUD_A,
  avatarLocalPath: LOCAL_OK
};
var afterRestart = userProfileStore.loadProfile();
assert(
  'CASE4 重启后 storage 仍带 localPath 且 accessSync 命中',
  afterRestart.avatarLocalPath === LOCAL_OK &&
    userProfileStore.resolveCurrentUserAvatarDisplay(afterRestart) === LOCAL_OK
);

var prev = [
  { playerId: 'seat-1', avatar: LOCAL_OK, name: 'A', cells: [1] },
  { playerId: 'p2', avatar: OTHER_HTTPS, name: 'B', cells: [2] }
];
var nextSame = [
  { playerId: 'seat-1', avatar: LOCAL_OK, name: 'A', cells: [9] },
  { playerId: 'p2', avatar: OTHER_HTTPS, name: 'B', cells: [8] }
];
var reused = fast.reuseUnchangedAvatarRows(prev, nextSame);
assert('CASE5 头像未变复用同一行对象', reused[0] === prev[0] && reused[1] === prev[1]);
assert('CASE5 复用后 src 不切换', reused[0].avatar === LOCAL_OK && reused[1].avatar === OTHER_HTTPS);
assert('CASE5 成绩字段仍更新', reused[0].cells[0] === 9);

var nextChanged = [
  { playerId: 'seat-1', avatar: CLOUD_A, name: 'A' },
  { playerId: 'p2', avatar: OTHER_HTTPS, name: 'B' }
];
var notReused = fast.reuseUnchangedAvatarRows(prev, nextChanged);
assert('本人 src 变化时不复用（避免钉死旧 src）', notReused === nextChanged);

var other = live.overlayScorePlayerDisplay({
  userId: 'acct-other',
  playerId: 'p2',
  name: 'Peer',
  avatar: OTHER_HTTPS
});
assert(
  'CASE6 其他球员 https 完全不受本人 local 影响',
  other.applied === false && other.avatar === OTHER_HTTPS
);

var scoreSrc = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'subpackages', 'scoring', 'pages', 'score', 'index.js'),
  'utf8'
);
assert(
  'score 页不 getTempFileURL / downloadFile 替换 src',
  scoreSrc.indexOf('getTempFileURL') < 0 &&
    scoreSrc.indexOf('downloadFile') < 0 &&
    scoreSrc.indexOf('ensureAvatarLocalCopy') < 0 &&
    scoreSrc.indexOf('scoreAvatarFastPath') >= 0
);

var appSrc = fs.readFileSync(path.join(__dirname, '..', 'miniprogram', 'app.js'), 'utf8');
assert('app idle 后台补 local copy', appSrc.indexOf('ensureAvatarLocalCopy') >= 0);

console.log('\npassed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
