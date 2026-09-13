const mockAvatars = require('./mockAvatars.js');

const SHORT_NAME_MAX = 4;
/** 历史键（无用户隔离）；读写时迁移到按用户隔离键 */
const RECENT_EVENT_ORG_STORAGE_KEY = 'gb_recent_event_orgs_v1';
const RECENT_EVENT_ORG_STORAGE_PREFIX = 'gb_recent_event_orgs_v1:';
/**
 * 用户创建的球队/机构持久化（扩展目录，非 Series 专属第二套库）。
 * 冷启动后 listActiveClubTeamsForUser / getTeamById 可读到同一稳定 ID。
 */
const CREATED_TEAMS_STORAGE_KEY = 'gb_created_teams_v1';
const CREATED_TEAMS_STORAGE_VERSION = 1;

/** 组织管理员角色（展示用中文；判断时亦兼容英文） */
const ORG_ADMIN_ROLES = {
  超级管理员: true,
  管理员: true,
  创建者: true,
  super_admin: true,
  admin: true,
  owner: true
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
const DEFAULT_INTER_TEAM_ORG_LOGO =
  'https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/miniprogram/orgs/lianyisai-trophy.png';
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

/**
 * 用户创建的组织（内存镜像；权威在 CREATED_TEAMS_STORAGE_KEY）
 * 不得只存活于模块内存。
 */
let createdTeams = [];

function _normalizePersistedMember(raw, teamId, index) {
  const m = raw && typeof raw === 'object' ? raw : {};
  const playerId = String(m.playerId || m.userId || '').trim();
  const userId = String(m.userId || m.playerId || '').trim();
  const name = String(m.name || '').trim();
  const roleCode = normalizeTeamMemberRole(m.role, null, userId || playerId);
  const memberStatus =
    m.memberStatus != null && String(m.memberStatus).trim()
      ? String(m.memberStatus).trim()
      : 'active';
  return {
    playerId: playerId || userId,
    userId: userId || playerId,
    name: name,
    competitionName: name,
    avatar: m.avatar != null && String(m.avatar).trim()
      ? String(m.avatar).trim()
      : mockAvatars.pickMockAvatar(playerId || userId || name || index),
    phone: m.phone != null ? String(m.phone) : '',
    gender: m.gender != null ? String(m.gender) : '',
    pinyin: m.pinyin != null ? String(m.pinyin) : name,
    teamId: String(teamId || '').trim(),
    role: roleCode,
    memberStatus: memberStatus,
    joinedAt: m.joinedAt != null ? Number(m.joinedAt) || 0 : 0,
    source: 'team_member',
    pickChannel: 'team_members'
  };
}

function _serializeCreatedTeam(team) {
  if (!team || typeof team !== 'object') return null;
  const id = String(team.id || '').trim();
  if (!id) return null;
  const createdBy = String(team.createdBy || team.creatorId || '').trim();
  const members = Array.isArray(team.members)
    ? team.members
        .map(function (m, i) {
          return _normalizePersistedMember(m, id, i);
        })
        .filter(function (m) {
          return m && (m.userId || m.playerId);
        })
    : [];
  return {
    id: id,
    name: String(team.name || '').trim(),
    shortName: normalizeShortName(team.shortName),
    role: team.role != null ? String(team.role) : '超级管理员',
    region: team.region != null ? String(team.region) : '',
    memberCount:
      team.memberCount != null && Number.isFinite(Number(team.memberCount))
        ? Number(team.memberCount)
        : members.length || 1,
    isMine: team.isMine !== false,
    logo: team.logo != null ? String(team.logo) : '',
    slogan: team.slogan != null ? String(team.slogan) : '',
    desc: team.desc != null ? String(team.desc) : '',
    organizationType: normalizeOrganizationType(team.organizationType),
    isPublicDefault: !!team.isPublicDefault,
    isDefaultInterTeamOrganizer: !!team.isDefaultInterTeamOrganizer,
    adminUserIds: normalizeAdminUserIds(team.adminUserIds),
    createdBy: createdBy,
    members: members
  };
}

function _readCreatedTeamsFromStorage() {
  try {
    if (typeof wx === 'undefined' || typeof wx.getStorageSync !== 'function') {
      return [];
    }
    const raw = wx.getStorageSync(CREATED_TEAMS_STORAGE_KEY);
    let list = null;
    if (Array.isArray(raw)) {
      list = raw;
    } else if (raw && typeof raw === 'object' && Array.isArray(raw.teams)) {
      list = raw.teams;
    }
    if (!Array.isArray(list) || !list.length) return [];
    const out = [];
    const seen = {};
    for (let i = 0; i < list.length; i++) {
      const t = _serializeCreatedTeam(list[i]);
      if (!t || !t.id || seen[t.id]) continue;
      seen[t.id] = true;
      out.push(t);
    }
    return out;
  } catch (e) {
    return [];
  }
}

function _writeCreatedTeamsToStorage(list) {
  const teams = Array.isArray(list)
    ? list
        .map(_serializeCreatedTeam)
        .filter(function (t) {
          return !!t;
        })
    : [];
  try {
    if (typeof wx === 'undefined' || typeof wx.setStorageSync !== 'function') {
      return { ok: false, reason: 'storage_unavailable' };
    }
    wx.setStorageSync(CREATED_TEAMS_STORAGE_KEY, {
      version: CREATED_TEAMS_STORAGE_VERSION,
      teams: teams
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'storage_write_failed' };
  }
}

let _createdTeamsReady = false;

function _hydrateCreatedTeams() {
  createdTeams = _readCreatedTeamsFromStorage();
  _createdTeamsReady = true;
}

function _persistCreatedTeams() {
  return _writeCreatedTeamsToStorage(createdTeams);
}

function _ensureCreatedTeams() {
  if (_createdTeamsReady) return;
  _hydrateCreatedTeams();
}

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
  _ensureCreatedTeams();
  const eventCreated = createdTeams.filter(function (t) {
    return t && isEventOrganization(t);
  });
  const eventStatic = TEAMS.filter(function (t) {
    return t && isEventOrganization(t);
  });
  let clubs = [];
  try {
    const repo = require('./teamClub/access.js');
    clubs = repo.listAllDirectoryTeams() || [];
  } catch (e) {
    clubs = [];
  }
  return eventCreated.concat(eventStatic).concat(clubs);
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
function _candidateUserIds(userId) {
  const uid = String(userId || '').trim();
  const out = [];
  const seen = {};
  function add(id) {
    const s = String(id || '').trim();
    if (!s || seen[s]) return;
    seen[s] = true;
    out.push(s);
  }
  add(uid);
  if (uid.toLowerCase() === 'me') {
    add(_resolveCurrentUserId());
  }
  return out;
}

function isOrganizationAdmin(orgId, userId) {
  const oid = String(orgId || '').trim();
  const candidates = _candidateUserIds(userId);
  if (!oid || !candidates.length) return false;
  const org = getTeamById(oid);
  if (!org) return false;

  const adminIds = normalizeAdminUserIds(org.adminUserIds);
  for (let i = 0; i < candidates.length; i++) {
    if (adminIds.indexOf(candidates[i]) >= 0) return true;
  }

  // 公共机构：不得因 isMine / 展示 role 授权
  if (isPublicSelectableEventOrg(org)) return false;

  // 非公共：兼容旧 mock（role + isMine），且须已加入
  if (!org.isMine) return false;
  return isAdminRoleLabel(org.role);
}

/**
 * 俱乐部球队管理员：adminUserIds、花名册 owner/admin、或当前会话在快照中的超管/管理角色。
 * 不把参赛队管理员升权；仅判断该 teamId 本身。
 */
function isClubTeamAdminUser(teamId, userId) {
  const tid = String(teamId || '').trim();
  const candidates = _candidateUserIds(userId);
  if (!tid || !candidates.length) return false;
  const team = getTeamById(tid);
  if (!team || !isClubTeam(team)) return false;

  const admins = normalizeAdminUserIds(team.adminUserIds);
  const currentId = _resolveCurrentUserId();
  for (let c = 0; c < candidates.length; c++) {
    const uid = candidates[c];
    if (admins.indexOf(uid) >= 0) return true;

    const members = getTeamMembers(tid) || [];
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      if (!m) continue;
      const mid = String(m.userId || m.playerId || '').trim();
      if (mid !== uid) continue;
      const st = String(m.memberStatus || 'active').trim() || 'active';
      if (st !== 'active') continue;
      const role = normalizeTeamMemberRole(m.role, team, uid);
      if (role === 'owner' || role === 'admin') return true;
    }

    if (currentId && uid === currentId) {
      const snapRole = normalizeTeamMemberRole(
        team.role || team.currentUserRole,
        team,
        uid
      );
      if (snapRole === 'owner' || snapRole === 'admin') return true;
    }
  }
  return false;
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
    const identity = require('./teamClub/identity.js');
    return identity.currentUserIdOrEmpty();
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
 * 创建球队/机构并持久化到 gb_created_teams_v1（与 mock TEAMS 同一目录查询面）
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

  if (organizationType === ORGANIZATION_TYPES.TEAM) {
    try {
      const factory = require('./teamClub/repoFactory.js');
      if (factory.getMode() !== 'local') {
        return null;
      }
      const identity = require('./teamClub/identity.js');
      const auth = identity.requireUser();
      if (!auth.ok) return null;
      const repo = require('./teamClub/repository.js');
      const res = repo.createTeam({
        name: name,
        shortName: payload && payload.shortName,
        city: (payload && (payload.region || payload.city)) || '',
        logo: (payload && payload.logo) || '',
        intro: (payload && (payload.desc || payload.description)) || '',
        teamId: payload && payload.id
      });
      if (!res || !res.ok || !res.data) return null;
      const teamId = String(res.data.teamId || res.data.id);
      const extras = Array.isArray(payload && payload.members) ? payload.members : [];
      extras.forEach(function (m) {
        const uid = String((m && (m.userId || m.playerId)) || '').trim();
        if (!uid || uid === auth.user.userId) return;
        repo.addMember(teamId, uid, {
          displayName: (m && (m.name || m.displayName)) || uid
        });
      });
      const adminIds = normalizeAdminUserIds(payload && payload.adminUserIds);
      adminIds.forEach(function (uid) {
        if (!uid || uid === auth.user.userId) return;
        repo.setAdmin(teamId, uid, true);
      });
      const mapped = repo.peekTeam(teamId);
      return mapped ? enrichOrganization(mapped) : null;
    } catch (e) {
      return null;
    }
  }

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

  const teamId = String((payload && payload.id) || Date.now()).trim();
  let members = Array.isArray(payload && payload.members)
    ? payload.members.map(function (m, i) {
        return _normalizePersistedMember(m, teamId, i);
      })
    : [];
  if (creatorId) {
    const hasCreator = members.some(function (m) {
      return String(m.userId || m.playerId || '').trim() === creatorId;
    });
    if (!hasCreator) {
      members.unshift(
        _normalizePersistedMember(
          {
            userId: creatorId,
            playerId: creatorId,
            name: name,
            role: 'owner',
            memberStatus: 'active',
            joinedAt: Date.now()
          },
          teamId,
          0
        )
      );
    }
  }

  const team = {
    id: teamId,
    name,
    shortName: normalizeShortName(payload && payload.shortName),
    role: (payload && payload.role) || '超级管理员',
    region: (payload && payload.region) || '',
    memberCount:
      (payload && payload.memberCount) != null ? payload.memberCount : members.length || 1,
    isMine: true,
    logo: (payload && payload.logo) || '',
    slogan: (payload && payload.slogan) || '',
    desc: (payload && payload.desc) || '',
    organizationType: organizationType,
    isPublicDefault: !!(payload && payload.isPublicDefault),
    isDefaultInterTeamOrganizer: !!(payload && payload.isDefaultInterTeamOrganizer),
    adminUserIds: adminUserIds,
    createdBy: creatorId,
    members: members
  };

  _ensureCreatedTeams();
  // 同 ID 覆盖更新，避免重复
  createdTeams = createdTeams.filter(function (t) {
    return String((t && t.id) || '').trim() !== teamId;
  });
  createdTeams.unshift(team);
  _persistCreatedTeams();
  return enrichOrganization(team);
}

/**
 * 按 teamId 返回成员：优先持久化自定义球队花名册，否则 mock 花名册。
 * @param {string} teamId
 * @returns {Array<{playerId,userId,name,competitionName,avatar,phone,gender,teamId,source,pinyin}>}
 */
function getTeamMembers(teamId) {
  const id = String(teamId || '').trim();
  if (!id) return [];
  try {
    const repo = require('./teamClub/access.js');
    if (repo.peekTeam(id)) {
      return repo.peekMembers(id);
    }
  } catch (e) {
    /* fall through */
  }
  _ensureCreatedTeams();

  for (let i = 0; i < createdTeams.length; i++) {
    const ct = createdTeams[i];
    if (!ct || String(ct.id || '').trim() !== id) continue;
    if (!isEventOrganization(ct)) break;
    if (Array.isArray(ct.members) && ct.members.length) {
      return ct.members.map(function (m, index) {
        return _normalizePersistedMember(m, id, index);
      });
    }
    break;
  }

  return [];
}

/** 测试/诊断：重新从 storage 灌入内存镜像（模拟冷启动） */
function reloadCreatedTeamsFromStorage() {
  _createdTeamsReady = false;
  _hydrateCreatedTeams();
  try {
    require('./teamClub/access.js').reloadFromStorage();
  } catch (e) {
    /* ignore */
  }
  return createdTeams.slice();
}

/**
 * 成员角色码：owner / admin / member（不写回中文到球队对象）。
 * MVP：可从成员字段或球队展示 role / adminUserIds 推导。
 */
function normalizeTeamMemberRole(rawRole, team, userId) {
  const r = String(rawRole || '').trim();
  const lower = r.toLowerCase();
  if (
    lower === 'owner' ||
    lower === 'super_admin' ||
    r === '超级管理员' ||
    r === '创建者'
  ) {
    return 'owner';
  }
  if (lower === 'admin' || r === '管理员') return 'admin';
  if (lower === 'member' || r === '成员') return 'member';
  const uid = String(userId || '').trim();
  if (team && uid) {
    const admins = normalizeAdminUserIds(team.adminUserIds);
    if (admins.indexOf(uid) >= 0) {
      if (r.indexOf('超级') >= 0 || String(team.role || '').indexOf('超级') >= 0) {
        return 'owner';
      }
      return 'admin';
    }
    if (team.isMine && isAdminRoleLabel(team.role)) {
      return String(team.role || '').indexOf('超级') >= 0 ? 'owner' : 'admin';
    }
  }
  return 'member';
}

/** 页面展示用中文角色（勿写回球队主数据） */
function getTeamRoleLabel(roleCode) {
  if (roleCode === 'owner') return '创建者';
  if (roleCode === 'admin') return '管理员';
  return '成员';
}

/**
 * 按 userId 解析活跃俱乐部球队（统一仓储）。
 */
function listActiveClubTeamsForUser(userId) {
  const uid = String(userId || '').trim();
  if (!uid || uid.toLowerCase() === 'me') return [];
  try {
    const repo = require('./teamClub/access.js');
    return repo.listTeamsForUser(uid);
  } catch (e) {
    return [];
  }
}

function getTeamsByUserId(userId) {
  return listActiveClubTeamsForUser(userId);
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
  CREATED_TEAMS_STORAGE_KEY,
  CREATED_TEAMS_STORAGE_VERSION,
  ORG_ADMIN_ROLES,
  charLength,
  sliceChars,
  normalizeShortName,
  normalizeOrganizationType,
  normalizeAdminUserIds,
  isAdminRoleLabel,
  isOrganizationAdmin,
  isClubTeamAdminUser,
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
  getTeamMembers,
  listActiveClubTeamsForUser,
  getTeamsByUserId,
  normalizeTeamMemberRole,
  getTeamRoleLabel,
  reloadCreatedTeamsFromStorage
};
