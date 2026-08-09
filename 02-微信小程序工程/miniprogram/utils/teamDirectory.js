const mockAvatars = require('./mockAvatars.js');

const SHORT_NAME_MAX = 4;
/** 历史键（无用户隔离）；读写时迁移到按用户隔离键 */
const RECENT_EVENT_ORG_STORAGE_KEY = 'gb_recent_event_orgs_v1';
const RECENT_EVENT_ORG_STORAGE_PREFIX = 'gb_recent_event_orgs_v1:';

/** 组织管理员角色（展示用中文；判断时亦兼容英文） */
const ORG_ADMIN_ROLES = {
  超级管理员: true,
  管理员: true,
  super_admin: true,
  admin: true
};

/** 按字符计数（适合中文；非 UTF-8 字节） */
function charLength(str) {
  return Array.from(String(str || '')).length;
}

function sliceChars(str, max) {
  const n = Number(max);
  if (!isFinite(n) || n < 0) return '';
  return Array.from(String(str || '')).slice(0, Math.floor(n)).join('');
}

function normalizeShortName(value) {
  const raw = String(value != null ? value : '').trim();
  if (!raw) return '';
  return sliceChars(raw, SHORT_NAME_MAX);
}

/** 组织类型：球队 / 赛事机构（稳定英文码） */
const ORGANIZATION_TYPES = {
  TEAM: 'team',
  EVENT_ORG: 'event_org'
};

const ORGANIZATION_TYPE_LABELS = {
  team: '球队',
  event_org: '赛事机构'
};

/** 队际赛默认公共赛事机构（稳定 ID，勿与数字球队 id 冲突） */
const DEFAULT_INTER_TEAM_ORG_ID = 'gb-event-org-lianyisai';
const DEFAULT_INTER_TEAM_ORG_LOGO = '/assets/orgs/lianyisai-trophy.png';
/**
 * 公共赛事机构的平台运营管理员 mock ID。
 * 不得使用普通当前用户 `me`：创建者权限走 createdBy，运营权限走 adminUserIds。
 */
const PLATFORM_OPERATOR_USER_ID = 'platform-operator-001';

function normalizeOrganizationType(value) {
  const v = String(value || '').trim().toLowerCase();
  if (
    v === ORGANIZATION_TYPES.EVENT_ORG ||
    v === 'event_organization' ||
    v === 'organization' ||
    v === '赛事机构'
  ) {
    return ORGANIZATION_TYPES.EVENT_ORG;
  }
  return ORGANIZATION_TYPES.TEAM;
}

// TODO：搜索球队接口 — 当前为本地 mock 列表
// adminUserIds：明确管理员用户 ID；公共机构仅认此列表，不用 role/isMine 误授
const TEAMS = [
  {
    id: '1',
    name: '北京湘鹰高尔夫俱乐部',
    shortName: '湘鹰',
    role: '超级管理员',
    region: '北京',
    memberCount: 128,
    isMine: true,
    organizationType: ORGANIZATION_TYPES.TEAM,
    adminUserIds: ['me']
  },
  {
    id: '2',
    name: '星途高尔夫俱乐部',
    shortName: '星途',
    role: '管理员',
    region: '上海',
    memberCount: 86,
    isMine: true,
    organizationType: ORGANIZATION_TYPES.TEAM,
    adminUserIds: ['me']
  },
  {
    id: '3',
    name: '江湖俱乐部',
    shortName: '江湖',
    role: '成员',
    region: '深圳',
    memberCount: 64,
    isMine: true,
    organizationType: ORGANIZATION_TYPES.TEAM,
    adminUserIds: []
  },
  { id: '4', name: '银河队', shortName: '银河', role: '成员', region: '广州', memberCount: 42, isMine: false, organizationType: ORGANIZATION_TYPES.TEAM, adminUserIds: [] },
  { id: '5', name: '六字头俱乐部', shortName: '六字头', role: '成员', region: '杭州', memberCount: 37, isMine: false, organizationType: ORGANIZATION_TYPES.TEAM, adminUserIds: [] },
  { id: '6', name: '火星队', shortName: '火星', role: '成员', region: '成都', memberCount: 29, isMine: false, organizationType: ORGANIZATION_TYPES.TEAM, adminUserIds: [] },
  { id: '7', name: '太阳花', shortName: '太阳花', role: '成员', region: '南京', memberCount: 21, isMine: false, organizationType: ORGANIZATION_TYPES.TEAM, adminUserIds: [] },
  {
    id: DEFAULT_INTER_TEAM_ORG_ID,
    name: '联谊赛组委会',
    shortName: '',
    // role/isMine 仅影响「可选/展示」；公共机构管理权只认 adminUserIds
    role: '成员',
    region: '全国',
    memberCount: 0,
    isMine: true,
    organizationType: ORGANIZATION_TYPES.EVENT_ORG,
    logo: DEFAULT_INTER_TEAM_ORG_LOGO,
    /** 公共默认可选机构 */
    isPublicDefault: true,
    /** 队际赛默认赛事机构（勿用名称字符串判断） */
    isDefaultInterTeamOrganizer: true,
    /** 仅明确平台运营账号；普通当前用户 me 不在此列 */
    adminUserIds: [PLATFORM_OPERATOR_USER_ID]
  }
];

/** 用户在前端 mock 创建的组织（插入列表顶部） */
let createdTeams = [];

/**
 * Patch 7：球队成员 mock 花名册（按 teamId）
 * 稳定 userId/playerId；与 teamGroups / create.normal teams[].members 无关
 */
const TEAM_MEMBERS_BY_TEAM_ID = {
  '1': [
    { playerId: 'tm-1001', name: '周启明', phone: '13800001001', gender: 'male', pinyin: 'zhouqiming' },
    { playerId: 'tm-1002', name: '林晓雯', phone: '13800001002', gender: 'female', pinyin: 'linxiaowen' },
    { playerId: 'tm-1003', name: '韩磊', phone: '13800001003', gender: 'male', pinyin: 'hanlei' },
    { playerId: 'tm-1004', name: '苏晴', phone: '13800001004', gender: 'female', pinyin: 'suqing' },
    { playerId: 'tm-1005', name: '马俊杰', phone: '13800001005', gender: 'male', pinyin: 'majunjie' },
    { playerId: 'tm-1006', name: '何雨桐', phone: '13800001006', gender: 'female', pinyin: 'heyutong' },
    { playerId: 'tm-1007', name: '邓凯', phone: '13800001007', gender: 'male', pinyin: 'dengkai' },
    { playerId: 'tm-1008', name: '曹一凡', phone: '13800001008', gender: 'male', pinyin: 'caoyifan' }
  ],
  '2': [
    { playerId: 'tm-2001', name: '沈浩', phone: '13800002001', gender: 'male', pinyin: 'shenhao' },
    { playerId: 'tm-2002', name: '顾婉清', phone: '13800002002', gender: 'female', pinyin: 'guwanqing' },
    { playerId: 'tm-2003', name: '陆明远', phone: '13800002003', gender: 'male', pinyin: 'lumingyuan' },
    { playerId: 'tm-2004', name: '叶知秋', phone: '13800002004', gender: 'female', pinyin: 'yezhiqiu' },
    { playerId: 'tm-2005', name: '方正', phone: '13800002005', gender: 'male', pinyin: 'fangzheng' },
    { playerId: 'tm-2006', name: '蒋南', phone: '13800002006', gender: 'male', pinyin: 'jiangnan' }
  ],
  '3': [
    { playerId: 'tm-3001', name: '唐伟', phone: '13800003001', gender: 'male', pinyin: 'tangwei' },
    { playerId: 'tm-3002', name: '许佳', phone: '13800003002', gender: 'female', pinyin: 'xujia' },
    { playerId: 'tm-3003', name: '冯博', phone: '13800003003', gender: 'male', pinyin: 'fengbo' },
    { playerId: 'tm-3004', name: '程思远', phone: '13800003004', gender: 'male', pinyin: 'chengsiyuan' },
    { playerId: 'tm-3005', name: '潘悦', phone: '13800003005', gender: 'female', pinyin: 'panyue' }
  ]
};

function buildListMeta(team) {
  const parts = [];
  const orgType = normalizeOrganizationType(team && team.organizationType);
  if (orgType === ORGANIZATION_TYPES.EVENT_ORG) {
    parts.push('赛事机构');
  } else if (team.isMine) {
    parts.push('我的球队');
  }
  if (team.region) parts.push(team.region);
  if (team.memberCount) parts.push(team.memberCount + '人');
  return parts.join(' · ');
}

function allTeams() {
  return createdTeams.concat(TEAMS);
}

function resolveLogo(team) {
  if (team && team.logo) return team.logo;
  return mockAvatars.pickMockAvatar(team && team.name);
}

function normalizeAdminUserIds(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = {};
  for (let i = 0; i < list.length; i++) {
    const id = list[i] != null ? String(list[i]).trim() : '';
    if (!id || seen[id]) continue;
    seen[id] = true;
    out.push(id);
  }
  return out;
}

function isAdminRoleLabel(role) {
  const r = String(role || '').trim();
  if (!r) return false;
  if (ORG_ADMIN_ROLES[r]) return true;
  const lower = r.toLowerCase();
  return !!ORG_ADMIN_ROLES[lower];
}

function isPublicSelectableEventOrg(org) {
  return !!(org && (org.isPublicDefault || org.isDefaultInterTeamOrganizer));
}

/**
 * 组织管理员判断（统一组织模型，无平行权限库）。
 * - 优先 adminUserIds
 * - 公共赛事机构：只认 adminUserIds，禁止 role/isMine 误授全体用户
 * - 非公共组织：adminUserIds 命中，或（isMine 且 role 为管理员/超级管理员）
 * - 缺字段安全降级：不报错、不授权
 */
function isOrganizationAdmin(orgId, userId) {
  const oid = String(orgId || '').trim();
  const uid = String(userId || '').trim();
  if (!oid || !uid) return false;
  const org = getTeamById(oid);
  if (!org) return false;

  const adminIds = normalizeAdminUserIds(org.adminUserIds);
  if (adminIds.indexOf(uid) >= 0) return true;

  // 公共机构：不得因 isMine / 展示 role 授权
  if (isPublicSelectableEventOrg(org)) return false;

  // 非公共：兼容旧 mock（role + isMine），且须已加入
  if (!org.isMine) return false;
  return isAdminRoleLabel(org.role);
}

function enrichOrganization(team) {
  if (!team) return null;
  const organizationType = normalizeOrganizationType(team.organizationType);
  return Object.assign({}, team, {
    logo: resolveLogo(team),
    organizationType: organizationType,
    organizationTypeLabel: ORGANIZATION_TYPE_LABELS[organizationType] || ORGANIZATION_TYPE_LABELS.team,
    shortName: normalizeShortName(team.shortName),
    isPublicDefault: !!team.isPublicDefault,
    isDefaultInterTeamOrganizer: !!team.isDefaultInterTeamOrganizer,
    adminUserIds: normalizeAdminUserIds(team.adminUserIds)
  });
}

function _resolveCurrentUserId() {
  try {
    const gameStore = require('./gameStore.js');
    const user = gameStore.getCurrentUser && gameStore.getCurrentUser();
    return user && user.userId != null ? String(user.userId).trim() : '';
  } catch (e) {
    return '';
  }
}

function _recentStorageKeyForUser(userId) {
  const uid = String(userId || '').trim() || '_anon';
  return RECENT_EVENT_ORG_STORAGE_PREFIX + uid;
}

function _readRecentEventOrgIds(userId) {
  const uid = userId != null ? String(userId).trim() : _resolveCurrentUserId();
  const key = _recentStorageKeyForUser(uid);
  try {
    const list = wx.getStorageSync(key);
    if (Array.isArray(list) && list.length) {
      return list.map((id) => String(id)).filter(Boolean);
    }
    // 一次性迁移旧全局键到当前用户（避免历史数据丢失；他用户不会读到此键）
    if (uid && uid !== '_anon') {
      const legacy = wx.getStorageSync(RECENT_EVENT_ORG_STORAGE_KEY);
      if (Array.isArray(legacy) && legacy.length) {
        const migrated = legacy.map((id) => String(id)).filter(Boolean);
        _writeRecentEventOrgIds(migrated, uid);
        try {
          wx.removeStorageSync(RECENT_EVENT_ORG_STORAGE_KEY);
        } catch (e2) {
          /* ignore */
        }
        return migrated;
      }
    }
    return [];
  } catch (e) {
    return [];
  }
}

function _writeRecentEventOrgIds(ids, userId) {
  const uid = userId != null ? String(userId).trim() : _resolveCurrentUserId();
  const key = _recentStorageKeyForUser(uid);
  try {
    wx.setStorageSync(key, Array.isArray(ids) ? ids : []);
  } catch (e) {
    /* ignore */
  }
}

/** 记录队际赛选用过的赛事机构（按当前用户隔离） */
function rememberRecentEventOrg(orgId, userId) {
  const id = String(orgId || '').trim();
  if (!id) return;
  const org = getTeamById(id);
  if (!org || !isEventOrganization(org)) return;
  const uid = userId != null ? String(userId).trim() : _resolveCurrentUserId();
  const next = [id].concat(_readRecentEventOrgIds(uid).filter((x) => x !== id)).slice(0, 20);
  _writeRecentEventOrgIds(next, uid);
}

/**
 * 赛事机构选择列表：创建者加入过的（isMine）+ 历史用过的；不含平台全部机构。
 */
function listSelectableEventOrganizations(searchTerm, userId) {
  const term = String(searchTerm || '').trim().toLowerCase();
  const uid = userId != null ? String(userId).trim() : _resolveCurrentUserId();
  const recentIds = _readRecentEventOrgIds(uid);
  const recentSet = {};
  recentIds.forEach((id) => {
    recentSet[id] = true;
  });
  const seen = {};
  const out = [];
  allTeams().forEach((team) => {
    if (normalizeOrganizationType(team.organizationType) !== ORGANIZATION_TYPES.EVENT_ORG) return;
    const id = String(team.id);
    if (seen[id]) return;
    const mine = !!team.isMine;
    const recent = !!recentSet[id];
    const publicDefault = !!team.isPublicDefault || !!team.isDefaultInterTeamOrganizer;
    // 仅：我加入的 / 当前用户历史用过的 / 公共默认；不展示平台全部机构
    if (!mine && !recent && !publicDefault) return;
    if (term && String(team.name || '').toLowerCase().indexOf(term) < 0) return;
    seen[id] = true;
    const enriched = enrichOrganization(team);
    out.push(
      Object.assign({}, enriched, {
        metaText: buildListMeta(enriched),
        recentlyUsed: recent,
        selected: false
      })
    );
  });
  // 默认机构与最近使用优先
  out.sort((a, b) => {
    if (a.isDefaultInterTeamOrganizer && !b.isDefaultInterTeamOrganizer) return -1;
    if (!a.isDefaultInterTeamOrganizer && b.isDefaultInterTeamOrganizer) return 1;
    const ai = recentIds.indexOf(String(a.id));
    const bi = recentIds.indexOf(String(b.id));
    if (ai >= 0 && bi < 0) return -1;
    if (ai < 0 && bi >= 0) return 1;
    if (ai >= 0 && bi >= 0) return ai - bi;
    return 0;
  });
  return out;
}

function getTeamById(id) {
  const team = allTeams().find((t) => t.id === String(id));
  if (!team) return null;
  return enrichOrganization(team);
}

/** 队际赛默认公共赛事机构（稳定记录） */
function getDefaultInterTeamOrganizer() {
  return getTeamById(DEFAULT_INTER_TEAM_ORG_ID);
}

/**
 * 选择列表专用：仅组织信息，不含用户身份 role
 * @param {string} [searchTerm]
 * @param {{ organizationType?: string, includeAllTypes?: boolean }} [options]
 *   默认仅返回「球队」，避免队内赛选队混入赛事机构；
 *   organizationType 指定类型；includeAllTypes / organizationType==='all' 返回全部。
 */
function listTeamsForSelect(searchTerm, options) {
  const term = String(searchTerm || '').trim().toLowerCase();
  const opts = options && typeof options === 'object' ? options : null;
  let typeFilter = ORGANIZATION_TYPES.TEAM;
  if (opts) {
    if (opts.includeAllTypes === true || opts.organizationType === 'all') {
      typeFilter = '';
    } else if (opts.organizationType != null && String(opts.organizationType).trim() !== '') {
      typeFilter = normalizeOrganizationType(opts.organizationType);
    }
  }
  return allTeams()
    .filter((team) => {
      if (typeFilter && normalizeOrganizationType(team.organizationType) !== typeFilter) {
        return false;
      }
      return !term || team.name.toLowerCase().includes(term);
    })
    .map((team) => {
      const enriched = enrichOrganization(team);
      return {
        id: enriched.id,
        name: enriched.name,
        logo: enriched.logo,
        metaText: buildListMeta(enriched),
        organizationType: enriched.organizationType,
        organizationTypeLabel: enriched.organizationTypeLabel,
        shortName: enriched.shortName,
        isPublicDefault: enriched.isPublicDefault,
        isDefaultInterTeamOrganizer: enriched.isDefaultInterTeamOrganizer,
        selected: false
      };
    });
}

/** 仅赛事机构（event_org） */
function listEventOrganizationsForSelect(searchTerm) {
  return listTeamsForSelect(searchTerm, {
    organizationType: ORGANIZATION_TYPES.EVENT_ORG
  });
}

/** 仅球队（team） */
function listClubTeamsForSelect(searchTerm) {
  return listTeamsForSelect(searchTerm, {
    organizationType: ORGANIZATION_TYPES.TEAM
  });
}

/**
 * TODO：创建球队/机构接口 — 当前为前端 mock，创建成功后插入列表顶部
 * @param {object} payload organizationType 缺省为 team，保证旧调用兼容
 */
function addCreatedTeam(payload) {
  const name = String((payload && payload.name) || '').trim();
  if (!name) return null;

  const organizationType = normalizeOrganizationType(
    payload && payload.organizationType != null
      ? payload.organizationType
      : ORGANIZATION_TYPES.TEAM
  );

  const creatorId = String(
    (payload && (payload.createdBy || payload.creatorId || payload.ownerUserId)) ||
      _resolveCurrentUserId() ||
      ''
  ).trim();
  const adminUserIds = normalizeAdminUserIds(
    payload && payload.adminUserIds != null
      ? payload.adminUserIds
      : creatorId
        ? [creatorId]
        : []
  );

  const team = {
    id: String((payload && payload.id) || Date.now()),
    name,
    shortName: normalizeShortName(payload && payload.shortName),
    role: (payload && payload.role) || '超级管理员',
    region: (payload && payload.region) || '',
    memberCount: (payload && payload.memberCount) != null ? payload.memberCount : 1,
    isMine: true,
    logo: (payload && payload.logo) || '',
    slogan: (payload && payload.slogan) || '',
    desc: (payload && payload.desc) || '',
    organizationType: organizationType,
    isPublicDefault: !!(payload && payload.isPublicDefault),
    isDefaultInterTeamOrganizer: !!(payload && payload.isDefaultInterTeamOrganizer),
    adminUserIds: adminUserIds
  };

  createdTeams.unshift(team);
  return enrichOrganization(team);
}

/**
 * Patch 7：按 teamId 返回 mock 球队成员（稳定 id）
 * @param {string} teamId
 * @returns {Array<{playerId,userId,name,competitionName,avatar,phone,gender,teamId,source,pinyin}>}
 */
function getTeamMembers(teamId) {
  const id = String(teamId || '').trim();
  if (!id) return [];
  const raw = TEAM_MEMBERS_BY_TEAM_ID[id];
  if (!Array.isArray(raw) || !raw.length) return [];
  return raw.map((m, index) => {
    const playerId = String(m.playerId || '').trim();
    const name = String(m.name || '').trim();
    return {
      playerId: playerId,
      userId: playerId,
      name: name,
      competitionName: name,
      avatar: mockAvatars.pickMockAvatar(playerId || name || index),
      phone: m.phone != null ? String(m.phone) : '',
      gender: m.gender != null ? String(m.gender) : '',
      pinyin: m.pinyin != null ? String(m.pinyin) : name,
      teamId: id,
      source: 'team_member',
      pickChannel: 'team_members'
    };
  });
}

function isEventOrganization(orgOrType) {
  if (orgOrType == null) return false;
  if (typeof orgOrType === 'string') {
    return normalizeOrganizationType(orgOrType) === ORGANIZATION_TYPES.EVENT_ORG;
  }
  return normalizeOrganizationType(orgOrType.organizationType) === ORGANIZATION_TYPES.EVENT_ORG;
}

function isClubTeam(orgOrType) {
  if (orgOrType == null) return false;
  if (typeof orgOrType === 'string') {
    return normalizeOrganizationType(orgOrType) === ORGANIZATION_TYPES.TEAM;
  }
  return normalizeOrganizationType(orgOrType.organizationType) === ORGANIZATION_TYPES.TEAM;
}

module.exports = {
  TEAMS,
  ORGANIZATION_TYPES,
  ORGANIZATION_TYPE_LABELS,
  DEFAULT_INTER_TEAM_ORG_ID,
  DEFAULT_INTER_TEAM_ORG_LOGO,
  PLATFORM_OPERATOR_USER_ID,
  SHORT_NAME_MAX,
  RECENT_EVENT_ORG_STORAGE_KEY,
  RECENT_EVENT_ORG_STORAGE_PREFIX,
  ORG_ADMIN_ROLES,
  charLength,
  sliceChars,
  normalizeShortName,
  normalizeOrganizationType,
  normalizeAdminUserIds,
  isAdminRoleLabel,
  isOrganizationAdmin,
  isEventOrganization,
  isClubTeam,
  getTeamById,
  getDefaultInterTeamOrganizer,
  listTeamsForSelect,
  listEventOrganizationsForSelect,
  listSelectableEventOrganizations,
  listClubTeamsForSelect,
  rememberRecentEventOrg,
  addCreatedTeam,
  getTeamMembers
};
