'use strict';

var COPY = {
  need_login: { title: '需要登录', desc: '请先完成登录后再使用球队功能。' },
  profile_required: {
    title: '需要完善资料',
    desc: '完善昵称和头像后，即可创建或加入球队。'
  },
  forbidden: { title: '没有权限', desc: '你无权执行该操作。' },
  conflict: { title: '资料已更新', desc: '其他人已修改，请刷新后重试。' },
  team_dissolved: { title: '球队已解散', desc: '该球队已解散，无法继续管理或新建比赛。' },
  invite_expired: { title: '邀请已过期', desc: '请向分享者重新索取邀请。' },
  invite_revoked: { title: '邀请已撤销', desc: '该邀请已失效。' },
  invite_used: { title: '邀请已失效', desc: '该邀请已被使用，无法再次加入。' },
  service_unavailable: { title: '云服务不可用', desc: '无法连接球队云服务，请稍后重试。不会改用本地数据。' },
  not_open: { title: '服务暂未开放', desc: '球队云服务尚未在正式版开放，不会改用本地数据。' },
  env_unknown: { title: '环境未确认', desc: '无法确认小程序版本环境，已拒绝调用。不会改用本地数据。' },
  network_error: { title: '网络异常', desc: '请检查网络后重试。不会改用本地数据。' },
  not_found: { title: '未找到', desc: '目标不存在或已失效。' },
  already_processed: { title: '已处理', desc: '该申请已被其他管理员处理。' },
  paused: { title: '暂停招新', desc: '该球队暂时不接受新成员申请。' }
};

function fromCode(code, fallbackTitle, fallbackDesc) {
  var c = String(code || '').trim();
  var copy = COPY[c];
  var action = actionFor(c);
  if (copy) {
    return {
      pageState: c,
      errorTitle: copy.title,
      errorDesc: copy.desc,
      code: c,
      actionKind: action.kind,
      actionLabel: action.label
    };
  }
  return {
    pageState: 'error',
    errorTitle: fallbackTitle || '加载失败',
    errorDesc: fallbackDesc || '请稍后重试。',
    code: c || 'error',
    actionKind: 'retry',
    actionLabel: '重试'
  };
}

function actionFor(code) {
  var c = String(code || '').trim();
  if (c === 'profile_required') {
    return { kind: 'completeProfile', label: '完善资料' };
  }
  if (
    c === 'network_error' ||
    c === 'service_unavailable' ||
    c === 'env_unknown' ||
    c === 'error' ||
    c === 'conflict'
  ) {
    return { kind: 'retry', label: '重试' };
  }
  return { kind: '', label: '' };
}

function canRetry(code) {
  return actionFor(code).kind === 'retry';
}

function fromResult(res, fallbackTitle) {
  var code = (res && (res.code || res.reason)) || 'error';
  return fromCode(code, fallbackTitle, res && res.message);
}

module.exports = {
  COPY: COPY,
  fromCode: fromCode,
  fromResult: fromResult,
  actionFor: actionFor,
  canRetry: canRetry
};
