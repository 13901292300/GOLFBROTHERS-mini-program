/**
 * 组成绩由不完整→完整后的一次确认弹窗（按 matchId|groupId 去重）。
 * 弹窗不等于结束；仅用户确认后才走公共结束本组流程。
 */

var scoreCompleteness = require('./scoreCompleteness.js');

var TITLE = '成绩录入完成';
var CONTENT = '本组所有成绩均已录入完成，是否立即结束本组比赛？';
var CANCEL_TEXT = '暂不结束';
var CONFIRM_TEXT = '结束比赛';

var cycles = {};
var globalShowing = false;

function hostKey(input) {
  var matchId = input && (input.matchId != null ? input.matchId : input.match && input.match.matchId);
  if (matchId == null && input && input.game) matchId = input.game.gameId;
  var groupId = input && (input.groupId != null ? input.groupId : input.group && input.group.groupId);
  return scoreCompleteness.buildHostKey(matchId, groupId);
}

function getState(key) {
  if (!cycles[key]) {
    cycles[key] = {
      lastComplete: null,
      dismissedComplete: false,
      showing: false
    };
  }
  return cycles[key];
}

function snapshotCompleteness(input, complete) {
  var key = hostKey(input);
  if (!key || key === '|') return key;
  var st = getState(key);
  if (st.showing) return key;
  var now = !!complete;
  st.lastComplete = now;
  if (!now) st.dismissedComplete = false;
  return key;
}

function canPrompt(input) {
  if (!input) return false;
  if (input.editable === false) return false;
  if (input.readOnly === true) return false;
  if (input.groupFinished === true) return false;
  if (input.matchFinished === true) return false;
  if (input.roundFinished === true) return false;
  if (input.seriesFinished === true) return false;
  if (input.exempt === true) return false;
  return true;
}

function noteAfterPersist(input) {
  var src = input && typeof input === 'object' ? input : {};
  var key = hostKey(src);
  if (!key || key === '|') {
    return { prompted: false, reason: 'missing_key' };
  }
  if (src.persistedOk === false) {
    return { prompted: false, reason: 'not_persisted' };
  }

  var projection =
    src.projection ||
    scoreCompleteness.projectGroupCompleteness(src);
  var now = !!projection.complete;
  var st = getState(key);

  if (!now) {
    st.lastComplete = false;
    st.dismissedComplete = false;
    return { prompted: false, reason: 'incomplete' };
  }

  if (!canPrompt(src) || projection.exempt) {
    st.lastComplete = true;
    return { prompted: false, reason: 'blocked' };
  }

  if (globalShowing || st.showing) {
    st.lastComplete = true;
    return { prompted: false, reason: 'showing' };
  }

  if (st.dismissedComplete) {
    st.lastComplete = true;
    return { prompted: false, reason: 'dismissed' };
  }

  if (st.lastComplete === true) {
    return { prompted: false, reason: 'already_complete' };
  }

  var showModal = src.showModal;
  if (typeof showModal !== 'function' && typeof wx !== 'undefined' && typeof wx.showModal === 'function') {
    showModal = wx.showModal.bind(wx);
  }
  if (typeof showModal !== 'function') {
    return { prompted: false, reason: 'no_modal' };
  }

  st.lastComplete = true;
  st.showing = true;
  globalShowing = true;

  var finishOnce = false;
  showModal({
    title: TITLE,
    content: CONTENT,
    cancelText: CANCEL_TEXT,
    confirmText: CONFIRM_TEXT,
    confirmColor: '#ce9224',
    success: function (res) {
      st.showing = false;
      globalShowing = false;
      if (res && res.confirm) {
        if (finishOnce) return;
        finishOnce = true;
        if (typeof src.onConfirm === 'function') src.onConfirm();
      } else {
        st.dismissedComplete = true;
        if (typeof src.onCancel === 'function') src.onCancel();
      }
    },
    fail: function () {
      st.showing = false;
      globalShowing = false;
    }
  });

  return { prompted: true, reason: 'shown', key: key };
}

function resetForTests() {
  cycles = {};
  globalShowing = false;
}

function peekState(matchId, groupId) {
  return cycles[scoreCompleteness.buildHostKey(matchId, groupId)] || null;
}

module.exports = {
  TITLE: TITLE,
  CONTENT: CONTENT,
  CANCEL_TEXT: CANCEL_TEXT,
  CONFIRM_TEXT: CONFIRM_TEXT,
  hostKey: hostKey,
  snapshotCompleteness: snapshotCompleteness,
  canPrompt: canPrompt,
  noteAfterPersist: noteAfterPersist,
  resetForTests: resetForTests,
  peekState: peekState
};
