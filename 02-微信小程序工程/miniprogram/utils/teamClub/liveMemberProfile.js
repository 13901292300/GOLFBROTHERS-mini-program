'use strict';

/**
 * 当前用户在球队花名册上的展示：用「我的」最新昵称/头像覆盖成员快照。
 * 只覆盖本人行，不改角色、不写回云端。
 */

function _trim(v) {
  return v == null ? '' : String(v).trim();
}

function readLiveSelfAppearance() {
  var userId = '';
  var displayName = '';
  var avatar = '';
  try {
    var identity = require('./identity.js');
    userId = _trim(identity.currentUserIdOrEmpty());
    var session = identity.readSession();
    if (session) {
      if (!userId) userId = _trim(session.userId);
      displayName = _trim(session.displayName);
      avatar = _trim(session.avatar);
    }
  } catch (e) {
    /* ignore */
  }
  try {
    var p = require('../userProfileStore.js').loadProfile() || {};
    var nick = _trim(p.nickname || p.displayName);
    var av = _trim(p.avatar);
    if (nick) displayName = nick;
    if (av) avatar = av;
    if (!userId) userId = _trim(p.userId);
  } catch (e2) {
    /* ignore */
  }
  return { userId: userId, displayName: displayName, avatar: avatar };
}

function overlaySelfMember(member) {
  if (!member || typeof member !== 'object') return member;
  var live = readLiveSelfAppearance();
  var mid = _trim(member.userId);
  if (!live.userId || !mid || mid !== live.userId) return member;
  var next = Object.assign({}, member);
  if (live.displayName) next.displayName = live.displayName;
  if (live.avatar) next.avatar = live.avatar;
  return next;
}

function overlaySelfMembers(list) {
  if (!Array.isArray(list)) return [];
  return list.map(overlaySelfMember);
}

module.exports = {
  readLiveSelfAppearance: readLiveSelfAppearance,
  overlaySelfMember: overlaySelfMember,
  overlaySelfMembers: overlaySelfMembers
};
