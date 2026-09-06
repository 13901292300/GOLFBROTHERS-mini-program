'use strict';

var factory = require('./repoFactory.js');
var identity = require('./identity.js');
var fields = require('./profileFields.js');
var userProfileStore = require('../userProfileStore.js');
var teamAssetUpload = require('./teamAssetUpload.js');

var EDIT_PATH = '/subpackages/player/pages/me/edit/index';
var TEAMS_PATH = '/subpackages/player/pages/me/teams/index';

var _busy = false;

function beginLock() {
  if (_busy) return false;
  _busy = true;
  return true;
}

function endLock() {
  _busy = false;
}

function isBusy() {
  return _busy;
}

function editProfileUrl() {
  return EDIT_PATH + '?from=teamClub';
}

function readLocalDraft() {
  var p = {};
  try {
    p = userProfileStore.loadProfile() || {};
  } catch (e) {
    p = {};
  }
  return {
    displayName: String(p.nickname || p.displayName || '').trim(),
    avatar: String(p.avatar || '').trim()
  };
}

function hasCompleteLocalProfile() {
  var d = readLocalDraft();
  var nick = fields.validateNickname(d.displayName);
  var av = fields.validateAvatar(d.avatar, true);
  return !!(nick.ok && av.ok);
}

function uploadTempAvatar(filePath) {
  var path = String(filePath || '').trim();
  if (!path) {
    return Promise.resolve({ ok: false, code: 'invalid_avatar', message: '请设置头像' });
  }
  if (fields.isDurableAvatar(path)) {
    return Promise.resolve({ ok: true, avatar: path });
  }
  return teamAssetUpload.uploadLocalFile({ kind: 'avatar', filePath: path }).then(function (res) {
    if (res && res.ok && res.fileID) {
      return { ok: true, avatar: res.fileID };
    }
    return {
      ok: false,
      code: (res && res.code) || 'invalid_avatar',
      message: (res && res.message) || '头像上传失败，请检查网络后重试',
      errCode: res && res.errCode,
      errMsg: res && res.errMsg,
      envName: res && res.envName
    };
  });
}

function submitCloudProfile(input) {
  var checked = fields.validateProfileInput(input, { requireAvatar: true });
  if (!checked.ok) return Promise.resolve(checked);
  var repo = factory.get();
  if (!repo || typeof repo.createMyProfile !== 'function') {
    return Promise.resolve({ ok: false, code: 'service_unavailable', message: '云服务不可用' });
  }
  return Promise.resolve(
    repo.createMyProfile({
      displayName: checked.displayName,
      avatar: checked.avatar
    })
  ).then(function (res) {
    if (res && res.ok && res.data) {
      identity.writeSession(res.data);
    }
    return res;
  });
}

function submitFromLocal(options) {
  var opts = options || {};
  if (_busy && !opts.alreadyLocked) {
    return Promise.resolve({ ok: false, code: 'busy', message: '正在提交，请稍候' });
  }
  var draft = readLocalDraft();
  var nick = fields.validateNickname(draft.displayName);
  if (!nick.ok) return Promise.resolve(nick);
  if (!opts.alreadyLocked) _busy = true;
  return uploadTempAvatar(draft.avatar)
    .then(function (up) {
      if (!up.ok) return up;
      try {
        userProfileStore.updateProfile({ avatar: up.avatar, nickname: draft.displayName });
      } catch (e) {
        /* ignore local persist */
      }
      return submitCloudProfile({ displayName: draft.displayName, avatar: up.avatar });
    })
    .then(function (res) {
      if (!res || !res.ok || !opts.keepLockOnSuccess) _busy = false;
      return res;
    }, function () {
      _busy = false;
      return { ok: false, code: 'network_error', message: '建档失败，请稍后重试' };
    });
}

function returnToMyTeams() {
  if (typeof wx === 'undefined') return;
  var shareInvite = require('./shareInvite.js');
  var token = shareInvite.readPendingToken();
  var inviteUrl = shareInvite.inviteLandingPath(token);
  if (inviteUrl) {
    wx.redirectTo({
      url: inviteUrl,
      fail: function () {
        wx.redirectTo({ url: inviteUrl });
      }
    });
    return;
  }
  var pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
  if (pages && pages.length > 1) {
    wx.navigateBack({
      fail: function () {
        wx.redirectTo({ url: TEAMS_PATH });
      }
    });
    return;
  }
  wx.redirectTo({ url: TEAMS_PATH });
}

module.exports = {
  EDIT_PATH: EDIT_PATH,
  TEAMS_PATH: TEAMS_PATH,
  editProfileUrl: editProfileUrl,
  readLocalDraft: readLocalDraft,
  hasCompleteLocalProfile: hasCompleteLocalProfile,
  uploadTempAvatar: uploadTempAvatar,
  submitCloudProfile: submitCloudProfile,
  submitFromLocal: submitFromLocal,
  returnToMyTeams: returnToMyTeams,
  beginLock: beginLock,
  endLock: endLock,
  isBusy: isBusy,
  _resetBusyForTest: function () {
    _busy = false;
  }
};
