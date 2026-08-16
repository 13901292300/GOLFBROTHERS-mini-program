/**
 * 普通单场球队赛底部操作区投影（分组 TAB / 出发表 TAB）。
 * Series 分站只传入该轮 match + 身份，不得覆盖文案/样式/行为。
 */

var teamMatchFinish = require('./teamMatchFinish.js');
var seriesFinishLock = require('./seriesFinishLock.js');
var teamMatchMoreMenu = require('./teamMatchMoreMenu.js');
var viewerGroup = require('./teamMatchViewerGroup.js');

var START_GROUPS_LABEL = '开始分组';
var EDIT_GROUPS_LABEL = '修改分组';
var ENTER_MY_GROUP_LABEL = '快速进入自己的小组 ›';
var ENTER_MY_GROUP_CLASS = 'tee-quick-entry-float';
var GROUPS_CTA_CLASS = 'register-cta-btn';

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function emptyCta() {
  return {
    mode: 'none',
    action: '',
    visible: false,
    label: '',
    buttonClass: '',
    showEditGroups: false,
    editGroupsLabel: START_GROUPS_LABEL,
    showEnterMyGroupEligible: false,
    enterMyGroupLabel: ENTER_MY_GROUP_LABEL,
    enterMyGroupClass: ENTER_MY_GROUP_CLASS,
    matchId: '',
    groupId: '',
    viewerGroupId: '',
    hasFormalGroups: false
  };
}

/**
 * @param {object} input
 * @param {object} [input.match]
 * @param {object} [input.series]
 * @param {'groups'|'tee'} input.surface  普通单场：groups TAB / tee-sheet TAB；Series：panelMode
 * @param {boolean} [input.canManageGroups]
 * @param {string|object} [input.viewerUserId]
 * @param {boolean} [input.firstGroupFullyVisible] 仅影响 enter 按钮最终 visible
 */
function project(input) {
  var src = input && typeof input === 'object' ? input : {};
  var match = src.match || null;
  var series = src.series || null;
  var surface = src.surface === 'tee' ? 'tee' : 'groups';
  var out = emptyCta();
  out.matchId = asString(match && match.matchId);
  out.hasFormalGroups = viewerGroup.hasFormalGroups(match);
  out.editGroupsLabel = out.hasFormalGroups ? EDIT_GROUPS_LABEL : START_GROUPS_LABEL;
  out.viewerGroupId = viewerGroup.resolveViewerGroupId(match, src.viewerUserId);
  out.groupId = out.viewerGroupId;

  if (seriesFinishLock.isSeriesCompleted(series)) return out;
  if (!match) return out;
  if (teamMatchFinish.isCancelledMatch(match)) return out;
  if (teamMatchFinish.isMatchCompleted(match)) return out;

  var life = teamMatchMoreMenu.resolveMatchLifecycle(match);

  if (surface === 'tee' && life.isOngoing) {
    out.mode = 'enter_my_group';
    out.action = 'enter_my_group';
    out.label = ENTER_MY_GROUP_LABEL;
    out.buttonClass = ENTER_MY_GROUP_CLASS;
    out.showEnterMyGroupEligible = true;
    out.visible = src.firstGroupFullyVisible === true;
    return out;
  }

  if (surface === 'groups' && src.canManageGroups && !life.isCompleted) {
    out.mode = 'edit_groups';
    out.action = 'edit_groups';
    out.label = out.editGroupsLabel;
    out.buttonClass = GROUPS_CTA_CLASS;
    out.showEditGroups = true;
    out.visible = true;
    return out;
  }

  return out;
}

module.exports = {
  START_GROUPS_LABEL: START_GROUPS_LABEL,
  EDIT_GROUPS_LABEL: EDIT_GROUPS_LABEL,
  ENTER_MY_GROUP_LABEL: ENTER_MY_GROUP_LABEL,
  ENTER_MY_GROUP_CLASS: ENTER_MY_GROUP_CLASS,
  GROUPS_CTA_CLASS: GROUPS_CTA_CLASS,
  emptyCta: emptyCta,
  project: project
};
