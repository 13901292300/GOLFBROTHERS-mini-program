/**
 * 页面导航用内存草稿。HostContext 走 sideGameHostSession。
 * setup 草稿只在内存，不写 storage。
 */
var rec = require('./sideGameRecord.js');
var hostSession = require('./sideGameHostSession.js');

var draft = null;
var setup = null;

function setHostContext(ctx) {
  hostSession.setHostContext(ctx);
}

function getHostContext(query) {
  return hostSession.getHostContext(query);
}

function setDraft(next) {
  draft = rec.jsonClone(next && typeof next === 'object' ? next : null);
}

function getDraft() {
  return rec.jsonClone(draft);
}

function clearDraft() {
  draft = null;
}

function patchDraft(patch) {
  var base = draft && typeof draft === 'object' ? draft : {};
  var next = rec.jsonClone(base);
  patch = patch || {};
  Object.keys(patch).forEach(function (k) {
    next[k] = patch[k];
  });
  draft = next;
  return rec.jsonClone(draft);
}

function newSessionId() {
  return 'setup_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function emptySetup(keys) {
  var k = keys || {};
  return {
    sessionId: rec.asString(k.sessionId) || newSessionId(),
    matchId: rec.asString(k.matchId),
    groupId: rec.asString(k.groupId),
    scope: rec.asString(k.scope) === 'match' ? 'match' : 'group',
    entry: rec.asString(k.entry) || 'score',
    baseRevision: rec.asString(k.baseRevision),
    globalSettings: {},
    games: [],
    added: [],
    updated: [],
    removed: [],
    expectedRevisions: {}
  };
}

function matchesSetup(keys) {
  if (!setup || !keys) return false;
  if (rec.asString(setup.matchId) !== rec.asString(keys.matchId)) return false;
  if (rec.asString(setup.entry) !== rec.asString(keys.entry || 'score')) return false;
  var scope = rec.asString(keys.scope) === 'match' ? 'match' : 'group';
  if (setup.scope !== scope) return false;
  if (scope === 'group' && rec.asString(setup.groupId) !== rec.asString(keys.groupId)) return false;
  if (keys.sessionId && rec.asString(setup.sessionId) !== rec.asString(keys.sessionId)) return false;
  return true;
}

function getSetupDraft() {
  return rec.jsonClone(setup);
}

function getSetupDraftRaw() {
  return setup;
}

function setSetupDraft(next) {
  setup = next && typeof next === 'object' ? next : null;
  return setup;
}

function clearSetupDraft() {
  setup = null;
}

function replaceSetupDraft(next) {
  setup = rec.jsonClone(next && typeof next === 'object' ? next : null);
  return getSetupDraft();
}

module.exports = {
  setHostContext: setHostContext,
  getHostContext: getHostContext,
  setDraft: setDraft,
  getDraft: getDraft,
  clearDraft: clearDraft,
  patchDraft: patchDraft,
  emptySetup: emptySetup,
  matchesSetup: matchesSetup,
  getSetupDraft: getSetupDraft,
  getSetupDraftRaw: getSetupDraftRaw,
  setSetupDraft: setSetupDraft,
  clearSetupDraft: clearSetupDraft,
  replaceSetupDraft: replaceSetupDraft
};
