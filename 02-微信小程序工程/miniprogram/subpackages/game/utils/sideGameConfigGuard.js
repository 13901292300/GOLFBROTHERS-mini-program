/**
 * 配置页离开确认 + 只读拦截。页面用 attach(this, opts)。
 */
var snap = require('./sideGameConfigSnapshot.js');
var pageAccess = require('../../../utils/sideGameEditAccess.js');
var entitlement = require('./sideGameEntitlementProvider.js');
var identity = require('./sideGameIdentityProvider.js');
var hostSession = require('./sideGameHostSession.js');

var LEAVE_TITLE = '放弃修改';
var LEAVE_CONTENT = '是否放弃修改？未保存的内容将不会保留。';

function hostOf(page) {
  try {
    if (page && page._hostQuery) return hostSession.getHostContext(page._hostQuery) || {};
  } catch (e) {}
  try {
    return hostSession.getHostContext() || {};
  } catch (e2) {
    return {};
  }
}

function resolveAccess(page, host) {
  var h = host || hostOf(page) || {};
  var fromHost = pageAccess.resolvePageAccess(h, identity.getCurrentUserId());
  var gate = entitlement.canEdit({
    userId: identity.getCurrentUserId(),
    hostContext: h
  });
  var canEdit = !!(fromHost.canEdit && gate && gate.ok);
  if (h.canEditSideGames === true && gate && gate.ok) canEdit = true;
  if (h.canEditSideGames === false) canEdit = false;
  if (gate && gate.ok === false && gate.reason === 'readonly') canEdit = false;
  return {
    canView: true,
    canEdit: canEdit,
    pageMode: canEdit ? 'edit' : 'readonly'
  };
}

function showToast(title) {
  try {
    var api = typeof wx !== 'undefined' ? wx : typeof global !== 'undefined' ? global.wx : null;
    if (api && api.showToast) api.showToast({ title: title, icon: 'none' });
  } catch (e) {}
}

function enableUnloadAlert(on, message) {
  try {
    if (on) {
      if (typeof wx !== 'undefined' && wx.enableAlertBeforeUnload) {
        wx.enableAlertBeforeUnload({ message: message || LEAVE_CONTENT });
      }
    } else if (typeof wx !== 'undefined' && wx.disableAlertBeforeUnload) {
      wx.disableAlertBeforeUnload();
    }
  } catch (e) {}
}

function attach(page, opts) {
  opts = opts || {};
  var getBusiness =
    opts.getBusiness ||
    function (p) {
      return p.data;
    };
  page._configGuard = {
    initial: null,
    ready: false,
    dirty: false,
    userTouched: false,
    access: { canView: true, canEdit: true, pageMode: 'edit' }
  };

  function applyAccess(access) {
    page._configGuard.access = access;
    page._guardBypass = true;
    try {
      page.setData({
        canView: access.canView,
        canEdit: access.canEdit,
        pageMode: access.pageMode,
        readonlyHint: access.canEdit ? '' : '仅可查看'
      });
    } finally {
      page._guardBypass = false;
    }
  }

  page._canEdit = function () {
    return !!(page._configGuard && page._configGuard.access && page._configGuard.access.canEdit);
  };

  page._assertCanEdit = function () {
    if (page._canEdit()) return true;
    showToast('仅可查看，无法修改');
    return false;
  };

  page._captureInitialSnapshot = function () {
    page._configGuard.initial = snap.capture(getBusiness(page));
    page._configGuard.ready = true;
    page._configGuard.dirty = false;
    page._configGuard.userTouched = false;
    enableUnloadAlert(false);
  };

  page._rebuildInitialIfPristine = function () {
    if (!page._configGuard.ready) {
      page._captureInitialSnapshot();
      return;
    }
    var dirtyNow = page._isDirty();
    if (dirtyNow) {
      // 系统回填窗口内、且用户未操作：吸收为新基准（避免投影字段误 dirty）
      if (page._guardHydrating && !page._configGuard.userTouched) {
        page._captureInitialSnapshot();
        return;
      }
      page._configGuard.dirty = true;
      enableUnloadAlert(true, opts.leaveMessage || LEAVE_CONTENT);
      return;
    }
    // 仍干净：用当前最终状态重建基准
    page._captureInitialSnapshot();
  };

  page._refreshDirty = function () {
    if (!page._canEdit()) {
      page._configGuard.dirty = false;
      enableUnloadAlert(false);
      return false;
    }
    if (!page._configGuard.ready) return false;
    var current = snap.capture(getBusiness(page));
    var dirty = !snap.deepEqual(page._configGuard.initial, current);
    page._configGuard.dirty = dirty;
    enableUnloadAlert(dirty, opts.leaveMessage || LEAVE_CONTENT);
    return dirty;
  };

  page._isDirty = function () {
    if (!page._canEdit()) return false;
    if (!page._configGuard.ready) return false;
    var current = snap.capture(getBusiness(page));
    return !snap.deepEqual(page._configGuard.initial, current);
  };

  page._markSaved = function () {
    page._captureInitialSnapshot();
  };

  page._leaveIfClean = function (leaveFn) {
    if (!page._isDirty()) {
      enableUnloadAlert(false);
      leaveFn();
      return;
    }
    try {
      wx.showModal({
        title: opts.leaveTitle || LEAVE_TITLE,
        content: opts.leaveMessage || LEAVE_CONTENT,
        confirmText: '确认返回',
        cancelText: '继续编辑',
        success: function (res) {
          if (!res.confirm) return;
          enableUnloadAlert(false);
          if (typeof opts.onDiscard === 'function') opts.onDiscard(page);
          leaveFn();
        }
      });
    } catch (e) {
      leaveFn();
    }
  };

  var origSetData = page.setData.bind(page);
  page.setData = function (patch, cb) {
    var next = patch;
    if (!page._guardBypass && page._configGuard && page._configGuard.access && !page._configGuard.access.canEdit) {
      next = snap.readonlyAllowedPatch(patch);
      if (!next || !Object.keys(next).length) {
        if (typeof cb === 'function') cb.call(page);
        return;
      }
    }
    var uiOnly = snap.isUiOnlyPatch(next);
    var hydrating = !!page._guardHydrating;
    if (
      !uiOnly &&
      !page._guardBypass &&
      !hydrating &&
      page._configGuard &&
      page._configGuard.ready &&
      page._canEdit()
    ) {
      page._configGuard.userTouched = true;
    }
    return origSetData.call(page, next, function () {
      if (typeof cb === 'function') cb.call(page);
      if (!uiOnly && !hydrating && page._configGuard && page._configGuard.ready && page._canEdit()) {
        page._refreshDirty();
      }
    });
  };

  var access = resolveAccess(page, opts.host);
  applyAccess(access);

  var origShow = page.onShow;
  page.onShow = function () {
    applyAccess(resolveAccess(page, hostOf(page)));
    if (typeof origShow === 'function') return origShow.apply(this, arguments);
  };

  return access;
}

function bindHostAccess(host) {
  entitlement.bindHostContext(host || null);
}

module.exports = {
  LEAVE_TITLE: LEAVE_TITLE,
  LEAVE_CONTENT: LEAVE_CONTENT,
  resolveAccess: resolveAccess,
  attach: attach,
  bindHostAccess: bindHostAccess,
  enableUnloadAlert: enableUnloadAlert
};
