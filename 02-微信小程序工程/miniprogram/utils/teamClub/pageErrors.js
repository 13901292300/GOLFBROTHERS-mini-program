'use strict';

var COPY = {
  need_login: { title: '需要登录', desc: '请先完成登录后再使用球队功能。' },
  profile_required: { title: '需要完善资料', desc: '请先完成用户建档后再继续。' },
  forbidden: { title: '没有权限', desc: '你无权执行该操作。' },
  conflict: { title: '资料已更新', desc: '其他人已修改，请刷新后重试。' },
  team_dissolved: { title: '球队已解散', desc: '该球队已解散，无法继续管理或新建比赛。' },
  invite_expired: { title: '邀请已过期', desc: '请向分享者重新索取邀请。' },
  invite_revoked: { title: '邀请已撤销', desc: '该邀请已失效。' },
  service_unavailable: { title: '云服务不可用', desc: '无法连接球队云服务，请稍后重试。不会改用本地数据。' },
  network_error: { title: '网络异常', desc: '请检查网络后重试。不会改用本地数据。' },
  not_found: { title: '未找到', desc: '目标不存在或已失效。' },
  already_processed: { title: '已处理', desc: '该申请已被其他管理员处理。' },
  paused: { title: '暂停招新', desc: '该球队暂时不接受新成员申请。' }
};

function fromCode(code, fallbackTitle, fallbackDesc) {
  var c = String(code || '').trim();
  if (COPY[c]) return { pageState: c, errorTitle: COPY[c].title, errorDesc: COPY[c].desc, code: c };
  return {
    pageState: 'error',
    errorTitle: fallbackTitle || '加载失败',
    errorDesc: fallbackDesc || '请稍后重试。',
    code: c || 'error'
  };
}

function fromResult(res, fallbackTitle) {
  var code = (res && (res.code || res.reason)) || 'error';
  return fromCode(code, fallbackTitle, res && res.message);
}

module.exports = {
  COPY: COPY,
  fromCode: fromCode,
  fromResult: fromResult
};
