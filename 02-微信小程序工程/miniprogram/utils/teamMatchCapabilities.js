/**
 * 球队赛（队内赛 / 队际赛）能力判断 — 集中出口，避免各页硬编码 matchType / 赛制串。
 * G1–G8 权威定义复用 strokeEntityValidator，本文件只做包装与 matchType 家族判断。
 */

const {
  G1_MODES,
  G2_G3_MODES,
  G4_MODES,
  isMatchPlayBoardMode
} = require('./strokeEntityValidator.js');

const MATCH_TYPE_TEAM_INTERNAL = 'team-internal';
const MATCH_TYPE_INTER_TEAM = 'inter-team';
const MATCH_TYPE_SERIES = 'series';

/** 赛事卡片底部发起主体类型标签（仅卡片展示，不改 matchType） */
const ORGANIZER_KIND_LABEL_CLUB = 'CLUB';
const ORGANIZER_KIND_LABEL_ORG = 'ORG.';

/** 详情英雄区底部主体类型默认文案（非队际赛保持原样） */
const HERO_ORGANIZER_SECTION_LABEL_DEFAULT = '赛事组织';

/**
 * @param {object|string|null|undefined} matchOrType match 对象或 matchType 字符串
 * @returns {string}
 */
function resolveMatchType(matchOrType) {
  if (matchOrType == null) return '';
  if (typeof matchOrType === 'string') return String(matchOrType).trim();
  if (typeof matchOrType === 'object') {
    return String(matchOrType.matchType || '').trim();
  }
  return '';
}

/**
 * 队内赛。旧数据缺省 matchType 且带 matchId 时，按队内赛兼容（与历史记分页门控一致）。
 * 裸空串 / series / 普通球局 → false。
 */
function isTeamInternalMatch(matchOrType) {
  const type = resolveMatchType(matchOrType);
  if (type === MATCH_TYPE_TEAM_INTERNAL) return true;
  if (type) return false;
  return !!(
    matchOrType &&
    typeof matchOrType === 'object' &&
    matchOrType.matchId
  );
}

function isInterTeamMatch(matchOrType) {
  return resolveMatchType(matchOrType) === MATCH_TYPE_INTER_TEAM;
}

/** 仅 team-internal + inter-team；不含 series / 普通球局 */
function isTeamMatchFamily(matchOrType) {
  return isTeamInternalMatch(matchOrType) || isInterTeamMatch(matchOrType);
}

/**
 * G1–G4 比杆（不含 G5–G8 比洞）。
 * 使用 strokeEntityValidator 的模式表，避免与 isG2G3FamilyMode（含 G6/G7）冲突。
 */
function isStrokePlayMode(gameMode) {
  const mode = String(gameMode || '').trim();
  if (!mode) return false;
  return !!(G1_MODES[mode] || G2_G3_MODES[mode] || G4_MODES[mode]);
}

/** G5–G8 比洞：包装权威 isMatchPlayBoardMode */
function isMatchPlayMode(gameMode) {
  return isMatchPlayBoardMode(gameMode);
}

/**
 * 分队 / 参赛球队数量合法性（只校验、不裁剪数据）。
 * - inter-team G1–G4：至少 2
 * - inter-team G5–G8：恰好 2
 * - team-internal G1–G4：至少 1
 * - team-internal G5–G8：恰好 2
 * @returns {{ ok: boolean, message?: string, count: number }}
 */
function validateTeamMatchSideGroups(matchOrType, gameMode, teamGroups) {
  const count = Array.isArray(teamGroups) ? teamGroups.length : 0;
  const mode = String(gameMode || '').trim();
  const matchPlay = isMatchPlayMode(mode);

  if (isInterTeamMatch(matchOrType)) {
    if (matchPlay) {
      if (count !== 2) {
        return {
          ok: false,
          count: count,
          message: '队际赛比洞赛必须恰好选择 2 支参赛球队'
        };
      }
      return { ok: true, count: count };
    }
    if (count < 2) {
      return {
        ok: false,
        count: count,
        message: '队际赛比杆赛至少选择 2 支参赛球队'
      };
    }
    return { ok: true, count: count };
  }

  // 队内赛及缺省 matchType（带 matchId）走原规则
  if (isTeamInternalMatch(matchOrType) || !resolveMatchType(matchOrType)) {
    if (matchPlay) {
      if (count !== 2) {
        return {
          ok: false,
          count: count,
          message: '比洞赛必须设置两个分队'
        };
      }
      return { ok: true, count: count };
    }
    if (count < 1) {
      return {
        ok: false,
        count: count,
        message: '至少需要一个分队'
      };
    }
    return { ok: true, count: count };
  }

  return {
    ok: false,
    count: count,
    message: '不支持的比赛类型'
  };
}

const DEFAULT_ORG_LOGO =
  'https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/miniprogram/mock-avatars/default-avatar.jpg';

/**
 * 赛事卡片底部主体类型标签：
 * - team-internal → CLUB
 * - inter-team / series → ORG.
 * - 其他保持现有 CLUB（不推断改写）
 * @param {object|string|null|undefined} matchOrType
 * @returns {string}
 */
function resolveOrganizerKindLabel(matchOrType) {
  const type = resolveMatchType(matchOrType);
  if (type === MATCH_TYPE_INTER_TEAM || type === MATCH_TYPE_SERIES) {
    return ORGANIZER_KIND_LABEL_ORG;
  }
  return ORGANIZER_KIND_LABEL_CLUB;
}

/**
 * 详情英雄区底部主体类型标签：
 * - team-internal → CLUB（无句点；复用 ORGANIZER_KIND_LABEL_CLUB）
 * - inter-team → ORG.（复用 ORGANIZER_KIND_LABEL_ORG）
 * - 其他赛事类型 → 赛事组织（默认，不改）
 * 名称 / LOGO 仍由 resolveOrganizerDisplay 读快照，本函数只出文案。
 * @param {object|string|null|undefined} matchOrType
 * @returns {string}
 */
function resolveHeroOrganizerSectionLabel(matchOrType) {
  const type = resolveMatchType(matchOrType);
  if (type === MATCH_TYPE_TEAM_INTERNAL) {
    return ORGANIZER_KIND_LABEL_CLUB;
  }
  if (type === MATCH_TYPE_INTER_TEAM) {
    return ORGANIZER_KIND_LABEL_ORG;
  }
  return HERO_ORGANIZER_SECTION_LABEL_DEFAULT;
}

/**
 * 发起主体展示快照（不读组织目录实时数据）。
 * 队内赛：teamName / teamLogo（或 matchLogo）
 * 队际赛：organizationName / organizationLogo，兼容回退 team*
 * @returns {{ name: string, logo: string, isInterTeam: boolean }}
 */
function resolveOrganizerDisplay(match) {
  if (!match || typeof match !== 'object') {
    return { name: '', logo: '', isInterTeam: false };
  }
  const inter = isInterTeamMatch(match);
  if (inter) {
    const name = String(match.organizationName || match.teamName || '').trim();
    const logo = String(
      match.organizationLogo || match.matchLogo || match.teamLogo || DEFAULT_ORG_LOGO
    ).trim();
    return { name: name, logo: logo || DEFAULT_ORG_LOGO, isInterTeam: true };
  }
  const name = String(match.teamName || '').trim();
  const logo = String(match.matchLogo || match.teamLogo || '').trim();
  return { name: name, logo: logo, isInterTeam: false };
}

/**
 * 参赛球队/分队展示列表（仅用 match.teamGroups 快照）。
 * @returns {Array<{ id: string, name: string, fullName: string, logo: string, sourceTeamId: string }>}
 */
function resolveParticipatingTeamViews(match) {
  const groups = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
  return groups.map((g, index) => {
    const id = g && g.id != null ? String(g.id) : 'team-group-' + (index + 1);
    const name = String((g && g.name) || '').trim() || ('分组' + (index + 1));
    const fullName = String((g && g.sourceTeamName) || name).trim() || name;
    const logo = String((g && g.sourceTeamLogo) || '').trim() || DEFAULT_ORG_LOGO;
    const sourceTeamId =
      g && g.sourceTeamId != null ? String(g.sourceTeamId).trim() : '';
    return {
      id: id,
      name: name,
      fullName: fullName,
      logo: logo,
      sourceTeamId: sourceTeamId
    };
  });
}

module.exports = {
  MATCH_TYPE_TEAM_INTERNAL,
  MATCH_TYPE_INTER_TEAM,
  MATCH_TYPE_SERIES,
  ORGANIZER_KIND_LABEL_CLUB,
  ORGANIZER_KIND_LABEL_ORG,
  HERO_ORGANIZER_SECTION_LABEL_DEFAULT,
  DEFAULT_ORG_LOGO,
  resolveMatchType,
  isTeamInternalMatch,
  isInterTeamMatch,
  isTeamMatchFamily,
  isStrokePlayMode,
  isMatchPlayMode,
  validateTeamMatchSideGroups,
  resolveOrganizerKindLabel,
  resolveHeroOrganizerSectionLabel,
  resolveOrganizerDisplay,
  resolveParticipatingTeamViews
};
