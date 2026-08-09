/**
 * 球队/机构选择页模式（集中枚举，禁止用标题文案判断）
 * 用于 pages/team/select
 */
const TEAM_SELECT_MODES = {
  /** 单选球队（队内赛发起主体等，默认） */
  TEAM: 'team',
  /** 单选赛事机构（队际赛组织机构） */
  EVENT_ORG: 'event_org',
  /** 队际赛参赛球队多选 */
  INTER_TEAM_PARTICIPANTS: 'inter_team_participants'
};

function normalizeTeamSelectMode(value) {
  const v = String(value || '').trim();
  if (
    v === TEAM_SELECT_MODES.EVENT_ORG ||
    v === TEAM_SELECT_MODES.INTER_TEAM_PARTICIPANTS ||
    v === TEAM_SELECT_MODES.TEAM
  ) {
    return v;
  }
  return TEAM_SELECT_MODES.TEAM;
}

function isMultiParticipantSelectMode(mode) {
  return normalizeTeamSelectMode(mode) === TEAM_SELECT_MODES.INTER_TEAM_PARTICIPANTS;
}

function isEventOrgSelectMode(mode) {
  return normalizeTeamSelectMode(mode) === TEAM_SELECT_MODES.EVENT_ORG;
}

module.exports = {
  TEAM_SELECT_MODES,
  normalizeTeamSelectMode,
  isMultiParticipantSelectMode,
  isEventOrgSelectMode
};
