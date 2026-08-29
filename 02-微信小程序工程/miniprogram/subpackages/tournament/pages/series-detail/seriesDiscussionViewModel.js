/**
 * Series 讨论区会话投影（页面会话内，不持久化）
 * - 房间语义：seriesId（整 Series 共用，不按 R/分站拆分）
 * - 不读写 seriesStore / teamMatchStore / 分站 match
 * - 讨论 TAB 生命周期：输入栏资格由本模块给出；几何显隐由 bottom dock 门闩决定
 */

var mockAvatars = require('../../../../utils/mockAvatars.js');

var PLACEHOLDER_DRAFT = '发布后开放讨论';
var PLACEHOLDER_HISTORICAL = '赛事已结束，讨论区只读';
var PLACEHOLDER_PUBLISHED = '说点什么…';

/**
 * @param {object|null|undefined} lifecycleAccess resolveLifecycleAccess 结果
 * @returns {boolean}
 */
function resolveDiscussionCanSpeak(lifecycleAccess) {
  var access = lifecycleAccess || {};
  if (access.isDraftPreview) return false;
  if (access.isHistorical) return false;
  var life = access.lifecycleStatus != null ? String(access.lifecycleStatus).trim() : '';
  return life === 'published';
}

/**
 * 输入栏业务状态：资格始终为可展示；按生命周期决定禁用与占位文案。
 * 页面几何显隐不在本函数内计算。
 * @param {object|null|undefined} lifecycleAccess
 * @returns {{
 *   canSpeak: boolean,
 *   showInputBar: boolean,
 *   inputDisabled: boolean,
 *   inputPlaceholder: string
 * }}
 */
function resolveDiscussionInputState(lifecycleAccess) {
  var access = lifecycleAccess || {};
  var life = access.lifecycleStatus != null ? String(access.lifecycleStatus).trim() : '';
  if (access.isDraftPreview || life === 'draft') {
    return {
      canSpeak: false,
      showInputBar: true,
      inputDisabled: true,
      inputPlaceholder: PLACEHOLDER_DRAFT
    };
  }
  if (access.isHistorical || life === 'cancelled' || life === 'archived') {
    return {
      canSpeak: false,
      showInputBar: true,
      inputDisabled: true,
      inputPlaceholder: PLACEHOLDER_HISTORICAL
    };
  }
  if (life === 'published') {
    return {
      canSpeak: true,
      showInputBar: true,
      inputDisabled: false,
      inputPlaceholder: PLACEHOLDER_PUBLISHED
    };
  }
  return {
    canSpeak: false,
    showInputBar: true,
    inputDisabled: true,
    inputPlaceholder: PLACEHOLDER_DRAFT
  };
}

/**
 * 视觉围观行（与队际详情种子同形态；非在线同步声明）
 * @returns {Array<{ name:string, avatar:string, userId?:string }>}
 */
function buildDefaultDiscussionWatchers() {
  return [
    {
      name: 'Alex',
      userId: 'chat-alex',
      avatar: mockAvatars.pickMockAvatar('Alex')
    },
    {
      name: 'TigerHoods',
      userId: 'chat-tiger',
      avatar: mockAvatars.pickMockAvatar('TigerHoods')
    },
    {
      name: 'yan72',
      userId: 'chat-yan72',
      avatar: mockAvatars.pickMockAvatar('yan72')
    },
    {
      name: '大雷',
      userId: 'chat-dalei',
      avatar: mockAvatars.pickMockAvatar('大雷')
    },
    {
      name: '邵亮',
      userId: 'chat-shaoliang',
      avatar: mockAvatars.pickMockAvatar('邵亮')
    }
  ];
}

/**
 * @param {object|null|undefined} currentUser
 * @returns {string}
 */
function resolveSelfAvatar(currentUser) {
  var u = currentUser || {};
  var avatar = u.avatar != null ? String(u.avatar).trim() : '';
  if (avatar) return avatar;
  var name = String(u.nickname || u.name || u.displayName || '我').trim() || '我';
  return mockAvatars.pickMockAvatar(name);
}

/**
 * @param {{
 *   seriesId?: string,
 *   lifecycleAccess?: object,
 *   currentUser?: object,
 *   watchers?: Array
 * }} input
 */
function buildSeriesDiscussionViewModel(input) {
  var o = input || {};
  var seriesId = o.seriesId != null ? String(o.seriesId).trim() : '';
  var inputState = resolveDiscussionInputState(o.lifecycleAccess);
  return {
    seriesId: seriesId,
    roomKey: seriesId,
    canSpeak: !!inputState.canSpeak,
    showInputBar: true,
    inputDisabled: !!inputState.inputDisabled,
    inputPlaceholder: inputState.inputPlaceholder,
    enableTimeNodes: true,
    watchers: Array.isArray(o.watchers) ? o.watchers : buildDefaultDiscussionWatchers(),
    selfAvatar: resolveSelfAvatar(o.currentUser)
  };
}

module.exports = {
  PLACEHOLDER_DRAFT: PLACEHOLDER_DRAFT,
  PLACEHOLDER_HISTORICAL: PLACEHOLDER_HISTORICAL,
  PLACEHOLDER_PUBLISHED: PLACEHOLDER_PUBLISHED,
  resolveDiscussionCanSpeak: resolveDiscussionCanSpeak,
  resolveDiscussionInputState: resolveDiscussionInputState,
  buildDefaultDiscussionWatchers: buildDefaultDiscussionWatchers,
  resolveSelfAvatar: resolveSelfAvatar,
  buildSeriesDiscussionViewModel: buildSeriesDiscussionViewModel
};
