/**
 * 本人头像 canonical / avatarLocalPath 分离。
 * 运行：node scripts/avatarCanonicalLocalDisplay.selftest.js
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
var unlinked = [];
var unlinkShouldFail = false;

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
      },
      unlinkSync: function (p) {
        if (unlinkShouldFail) throw new Error('busy');
        unlinked.push(p);
        delete existingFiles[p];
      }
    };
  }
};

var userProfileStore = require('../miniprogram/utils/userProfileStore.js');
var live = require('../miniprogram/utils/playerLiveDisplay.js');
var currentUserIdentity = require('../miniprogram/utils/currentUserIdentity.js');
var quickCreate = require('../miniprogram/utils/quickCreate.js');

var CLOUD_A = 'cloud://env.bucket/a.jpg';
var CLOUD_B = 'cloud://env.bucket/b.jpg';
var LOCAL_OK = 'wxfile://usr/gb_avatar_111.jpg';
var LOCAL_NEW = 'wxfile://usr/gb_avatar_222.jpg';
var LOCAL_MISSING = 'wxfile://usr/gb_avatar_missing.jpg';

function seedProfile(patch) {
  store['gb_user_profile_v1'] = Object.assign(
    {
      userId: 'acct-self',
      nickname: 'SelfNick',
      gender: '男',
      avatar: CLOUD_A,
      updatedAt: '2026-01-01T00:00:00.000Z'
    },
    patch || {}
  );
  return userProfileStore.loadProfile();
}

existingFiles[LOCAL_OK] = true;
existingFiles[LOCAL_NEW] = true;

seedProfile({ avatar: CLOUD_A, avatarLocalPath: LOCAL_OK });
assert(
  '有效 usr 缓存时 resolver 返回 local',
  userProfileStore.resolveCurrentUserAvatarDisplay(userProfileStore.loadProfile()) === LOCAL_OK
);

assert(
  'resolver 不改 canonical avatar',
  userProfileStore.loadProfile().avatar === CLOUD_A
);

delete existingFiles[LOCAL_MISSING];
seedProfile({ avatar: CLOUD_A, avatarLocalPath: LOCAL_MISSING });
assert(
  '本地文件不存在时 fallback cloud',
  userProfileStore.resolveCurrentUserAvatarDisplay(userProfileStore.loadProfile()) === CLOUD_A
);

seedProfile({ avatar: CLOUD_A, avatarLocalPath: '' });
assert(
  'avatarLocalPath 空时 fallback cloud',
  userProfileStore.resolveCurrentUserAvatarDisplay(userProfileStore.loadProfile()) === CLOUD_A
);

store['gb_user_profile_v1'] = {
  userId: 'acct-self',
  nickname: 'OldUser',
  avatar: CLOUD_A
};
var loadedOld = userProfileStore.loadProfile();
assert(
  '旧 profile 无 avatarLocalPath 仍可 load',
  loadedOld.avatar === CLOUD_A && loadedOld.avatarLocalPath === ''
);
assert(
  '旧 profile resolver 走 canonical',
  userProfileStore.resolveCurrentUserAvatarDisplay(loadedOld) === CLOUD_A
);

seedProfile({ avatar: CLOUD_A, avatarLocalPath: LOCAL_OK });
userProfileStore.updateProfile({ avatar: CLOUD_B });
var afterCloudOnly = userProfileStore.loadProfile();
assert(
  '只更新 avatar 不清空 avatarLocalPath',
  afterCloudOnly.avatar === CLOUD_B && afterCloudOnly.avatarLocalPath === LOCAL_OK
);

seedProfile({
  userId: 'acct-self',
  nickname: 'SelfNick',
  avatar: CLOUD_A,
  avatarLocalPath: LOCAL_OK
});
var identity = currentUserIdentity.getDisplayIdentity();
assert(
  'getDisplayIdentity.avatar 仍是 canonical',
  identity.avatar === CLOUD_A && identity.avatar !== LOCAL_OK
);

var created = quickCreate.buildQuickCreateGame(
  { courseId: 'c1', courseName: 'C', courseLocation: '', halfText: '' },
  identity
);
var slotAvatar = created.game.groups[0].playersSlots[0].avatar;
assert(
  'game snapshot creator.avatar 不是 wxfile://usr',
  slotAvatar === CLOUD_A && String(slotAvatar).indexOf('wxfile://usr') < 0
);

var identitySrc = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'utils', 'currentUserIdentity.js'),
  'utf8'
);
assert(
  'identity 源码不读取 avatarLocalPath',
  identitySrc.indexOf('avatarLocalPath') < 0 &&
    identitySrc.indexOf('avatar: String(p.avatar') >= 0
);

unlinked.length = 0;
unlinkShouldFail = false;
existingFiles[LOCAL_OK] = true;
existingFiles[LOCAL_NEW] = true;
seedProfile({ avatar: CLOUD_A, avatarLocalPath: LOCAL_OK });
userProfileStore.commitAvatarLocalPath(LOCAL_NEW);
assert(
  '新 local 入档后才删旧 gb_avatar',
  userProfileStore.loadProfile().avatarLocalPath === LOCAL_NEW &&
    unlinked.length === 1 &&
    unlinked[0] === LOCAL_OK
);

unlinked.length = 0;
unlinkShouldFail = true;
existingFiles[LOCAL_OK] = true;
existingFiles[LOCAL_NEW] = true;
seedProfile({ avatar: CLOUD_A, avatarLocalPath: LOCAL_OK });
userProfileStore.commitAvatarLocalPath(LOCAL_NEW);
assert(
  '删旧文件失败仍保留新 local 与 canonical',
  userProfileStore.loadProfile().avatarLocalPath === LOCAL_NEW &&
    userProfileStore.loadProfile().avatar === CLOUD_A &&
    unlinked.length === 0
);
unlinkShouldFail = false;

seedProfile({
  userId: 'acct-self',
  nickname: 'SelfNick',
  avatar: CLOUD_A,
  avatarLocalPath: LOCAL_OK
});
existingFiles[LOCAL_OK] = true;
var guest = live.overlayScorePlayerDisplay({
  playerId: 'host-grp-1-p1',
  name: '临时',
  avatar: 'https://cdn.example.com/guest.jpg'
});
assert(
  '手工用户 overlay 仍用 snapshot',
  guest.applied === false && guest.name === '临时' && guest.avatar === 'https://cdn.example.com/guest.jpg'
);

var selfView = live.overlayScorePlayerDisplay({
  userId: 'acct-self',
  playerId: 'seat-keep',
  name: 'OldName',
  avatar: CLOUD_A
});
assert(
  '本人 overlay 优先有效 local display',
  selfView.applied === true && selfView.avatar === LOCAL_OK
);

seedProfile({ avatar: CLOUD_A, avatarLocalPath: CLOUD_A });
assert(
  'cloud:// 不能写入 avatarLocalPath',
  userProfileStore.loadProfile().avatarLocalPath === ''
);
seedProfile({ avatar: CLOUD_A, avatarLocalPath: 'https://cdn.example.com/x.jpg' });
assert(
  'https 不能写入 avatarLocalPath',
  userProfileStore.loadProfile().avatarLocalPath === ''
);
seedProfile({ avatar: CLOUD_A, avatarLocalPath: 'wxfile://tmp/a.jpg' });
assert(
  'tmp 不能写入 avatarLocalPath',
  userProfileStore.loadProfile().avatarLocalPath === ''
);
unlinked.length = 0;
unlinkShouldFail = false;
existingFiles[LOCAL_OK] = true;
existingFiles[LOCAL_NEW] = true;
seedProfile({ avatar: CLOUD_A, avatarLocalPath: LOCAL_OK });
userProfileStore.discardUnusedAvatarLocalFile(LOCAL_NEW, LOCAL_OK);
assert(
  '非 onboard 云失败：profile 保持旧 canonical 与旧 local',
  userProfileStore.loadProfile().avatar === CLOUD_A &&
    userProfileStore.loadProfile().avatarLocalPath === LOCAL_OK
);
assert(
  '非 onboard 云失败：尝试删除未入档 new usr',
  unlinked.indexOf(LOCAL_NEW) >= 0 && unlinked.indexOf(LOCAL_OK) < 0
);

unlinked.length = 0;
existingFiles[LOCAL_OK] = true;
existingFiles[LOCAL_NEW] = true;
seedProfile({ avatar: CLOUD_A, avatarLocalPath: LOCAL_OK });
userProfileStore.commitAvatarCanonicalAndLocal({
  avatar: CLOUD_B,
  avatarLocalPath: LOCAL_NEW
});
var committed = userProfileStore.loadProfile();
assert(
  '云成功一次提交 canonical + local',
  committed.avatar === CLOUD_B && committed.avatarLocalPath === LOCAL_NEW
);
assert(
  '成功保存 new profile 后才删除 old usr',
  unlinked.length === 1 && unlinked[0] === LOCAL_OK && existingFiles[LOCAL_NEW]
);

unlinked.length = 0;
existingFiles[LOCAL_OK] = true;
existingFiles[LOCAL_NEW] = true;
seedProfile({ avatar: CLOUD_A, avatarLocalPath: LOCAL_OK });
var origSet = wx.setStorageSync;
wx.setStorageSync = function (key, val) {
  if (key === 'gb_user_profile_v1' && val && val.avatar === CLOUD_B) {
    throw new Error('save_fail');
  }
  return origSet(key, val);
};
var saveThrew = false;
try {
  userProfileStore.commitAvatarCanonicalAndLocal({
    avatar: CLOUD_B,
    avatarLocalPath: LOCAL_NEW
  });
} catch (eSave) {
  saveThrew = true;
}
wx.setStorageSync = origSet;
var afterFailSave = userProfileStore.loadProfile();
assert(
  'profile save 失败：旧 usr 不删且清理 new',
  saveThrew &&
    afterFailSave.avatar === CLOUD_A &&
    afterFailSave.avatarLocalPath === LOCAL_OK &&
    unlinked.indexOf(LOCAL_OK) < 0 &&
    unlinked.indexOf(LOCAL_NEW) >= 0
);

unlinked.length = 0;
existingFiles[LOCAL_OK] = true;
existingFiles[LOCAL_NEW] = true;
seedProfile({ avatar: CLOUD_A, avatarLocalPath: LOCAL_OK });
userProfileStore.discardUnusedAvatarLocalFile(LOCAL_NEW, LOCAL_OK);
assert(
  'onboard 云失败：删除 orphan new usr，不删 prev',
  unlinked.indexOf(LOCAL_NEW) >= 0 &&
    unlinked.indexOf(LOCAL_OK) < 0 &&
    userProfileStore.loadProfile().avatarLocalPath === LOCAL_OK
);

unlinked.length = 0;
existingFiles[LOCAL_OK] = true;
existingFiles[LOCAL_NEW] = true;
seedProfile({
  avatar: CLOUD_B,
  avatarLocalPath: LOCAL_NEW
});
userProfileStore.updateProfile({ avatar: CLOUD_A, avatarLocalPath: LOCAL_OK });
userProfileStore.discardUnusedAvatarLocalFile(LOCAL_NEW, LOCAL_OK);
assert(
  'onboard restorePrev 后未引用的 new usr 被删除',
  userProfileStore.loadProfile().avatarLocalPath === LOCAL_OK &&
    unlinked.indexOf(LOCAL_NEW) >= 0 &&
    unlinked.indexOf(LOCAL_OK) < 0
);

var editSrc = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'subpackages', 'player', 'pages', 'me', 'edit', 'index.js'),
  'utf8'
);
assert(
  'edit 非 onboard 在 upload 成功前不 finishOk',
  /persistThenUploadCanonical[\s\S]*uploadTempAvatar[\s\S]*finishOk/.test(editSrc) &&
    editSrc.indexOf('commitAvatarCanonicalAndLocal') >= 0
);
assert(
  'cloud.uploadFile 使用 persist 后的 newLocalPath',
  editSrc.indexOf('uploadTempAvatar(newLocal)') >= 0 &&
    editSrc.indexOf('uploadTempAvatar(uploadSrc)') >= 0 &&
    editSrc.indexOf('uploadTempAvatar(path)') < 0
);
assert(
  'edit 以 durable local 文件作为 avatarLocalPath，而不是 !isDurableAvatar',
  editSrc.indexOf('isDurableLocalUserFile(saved)') >= 0 &&
    editSrc.indexOf('!profileFields.isDurableAvatar(saved)') < 0
);

existingFiles[LOCAL_OK] = true;
seedProfile({ avatar: CLOUD_A, avatarLocalPath: LOCAL_OK });
userProfileStore.commitAvatarCanonicalAndLocal({
  avatar: CLOUD_B,
  avatarLocalPath: ''
});
assert(
  'commit 空 localPath 不清掉已有 usr 缓存',
  userProfileStore.loadProfile().avatar === CLOUD_B &&
    userProfileStore.loadProfile().avatarLocalPath === LOCAL_OK
);

existingFiles[LOCAL_OK] = true;
seedProfile({ avatar: CLOUD_A, avatarLocalPath: LOCAL_OK });
var ensureSkipped = null;
userProfileStore.ensureAvatarLocalCopy(function (res) {
  ensureSkipped = res;
});
assert(
  'CASE1/CASE4 有效 local 时 ensure 跳过下载',
  ensureSkipped && ensureSkipped.ok && ensureSkipped.skipped && ensureSkipped.path === LOCAL_OK
);
assert(
  'CASE1 首次展示 src = wxfile://usr',
  userProfileStore.resolveCurrentUserAvatarDisplay(userProfileStore.loadProfile()) === LOCAL_OK
);

delete existingFiles[LOCAL_MISSING];
seedProfile({ avatar: CLOUD_A, avatarLocalPath: LOCAL_MISSING });
assert(
  'CASE2 无效 local 时展示 fallback cloud://',
  userProfileStore.resolveCurrentUserAvatarDisplay(userProfileStore.loadProfile()) === CLOUD_A
);

wx.cloud = {
  downloadFile: function (opts) {
    opts.success({ tempFilePath: 'wxfile://tmp/dl.jpg' });
  }
};
wx.env = { USER_DATA_PATH: 'wxfile://usr' };
existingFiles[LOCAL_NEW] = true;
wx.getFileSystemManager = function () {
  return {
    accessSync: function (p) {
      if (!existingFiles[p]) throw new Error('noent');
    },
    unlinkSync: function (p) {
      unlinked.push(p);
      delete existingFiles[p];
    },
    saveFile: function (opts) {
      existingFiles[opts.filePath] = true;
      opts.success({ savedFilePath: opts.filePath });
    }
  };
};
seedProfile({ avatar: CLOUD_A, avatarLocalPath: '' });
var ensured = null;
userProfileStore.ensureAvatarLocalCopy(function (res) {
  ensured = res;
});
assert(
  'cloud:// 无 local 时后台补 usr 且不改 canonical',
  ensured &&
    ensured.ok &&
    /^wxfile:\/\/usr\/gb_avatar_/.test(String(ensured.path || '')) &&
    userProfileStore.loadProfile().avatar === CLOUD_A &&
    userProfileStore.loadProfile().avatarLocalPath === ensured.path
);

seedProfile({ avatar: 'https://cdn.example.com/x.jpg', avatarLocalPath: '' });
var ensureHttps = null;
userProfileStore.ensureAvatarLocalCopy(function (res) {
  ensureHttps = res;
});
assert(
  '非 cloud canonical 不后台下载',
  ensureHttps && ensureHttps.ok && ensureHttps.skipped && ensureHttps.reason === 'not_cloud'
);

console.log('\npassed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
