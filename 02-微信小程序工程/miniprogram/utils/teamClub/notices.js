/**
 * 球队通知（消息中心预留）。
 * 本轮不实现消息中心列表页；申请提交后在此生成跳转数据。
 *
 * category: team_notice（球队通知）
 * type:
 *   join_application_received  管理人员收到的入队申请
 *   join_application_result    申请人收到的审批结果
 */

const CATEGORY = {
  TEAM_NOTICE: 'team_notice'
};

const TYPE = {
  JOIN_APPLICATION_RECEIVED: 'join_application_received',
  JOIN_APPLICATION_RESULT: 'join_application_result'
};

const APPLICATION_DETAIL_PATH = '/subpackages/player/pages/me/team-application/index';

function buildApplicationDetailUrl(applicationId, noticeId) {
  const id = String(applicationId || '').trim();
  if (!id) return '';
  let url = APPLICATION_DETAIL_PATH + '?applicationId=' + encodeURIComponent(id);
  const nid = String(noticeId || '').trim();
  if (nid) url += '&noticeId=' + encodeURIComponent(nid);
  return url;
}

function buildApplicationJump(applicationId, noticeId, type) {
  const noticeType = String(type || TYPE.JOIN_APPLICATION_RECEIVED);
  return {
    category: CATEGORY.TEAM_NOTICE,
    type: noticeType,
    applicationId: String(applicationId || '').trim(),
    noticeId: String(noticeId || '').trim(),
    url: buildApplicationDetailUrl(applicationId, noticeId)
  };
}

function noticeIdFor(applicationId, recipientUserId, type) {
  return [
    'tn',
    String(type || TYPE.JOIN_APPLICATION_RECEIVED),
    String(applicationId || ''),
    String(recipientUserId || '')
  ].join('-');
}

module.exports = {
  CATEGORY,
  TYPE,
  APPLICATION_DETAIL_PATH,
  buildApplicationDetailUrl,
  buildApplicationJump,
  noticeIdFor
};
