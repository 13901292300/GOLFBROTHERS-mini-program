/**
 * 选手管理：仅编辑本场 registerInfo.users 快照，不写回用户资料。
 * 删除复用 teamMatchStore.removeRegisteredUserAndCleanupGroups。
 */

const teamMatchStore = require('./teamMatchStore.js');
const mockAvatars = require('./mockAvatars.js');
const chinesePinyinLite = require('./chinesePinyinLite.js');

const GENDER_OPTIONS = [
  { key: 'male', label: '男' },
  { key: 'female', label: '女' }
];

const SOURCE_LABELS = {
  self: '本人报名',
  proxy: '代报名',
  admin: '管理员添加'
};

function _cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value == null ? null : value));
  } catch (e) {
    return value;
  }
}

function resolveUserId(raw) {
  if (!raw || typeof raw !== 'object') return '';
  const id = raw.userId || raw.playerId || raw.id || raw.uid || raw.openid;
  return id != null ? String(id).trim() : '';
}

/**
 * 本场性别仅允许 male / female；unknown / 空值 / 异常值一律兜底为 male
 */
function normalizeGender(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'male' || v === 'm' || v === '男') return 'male';
  if (v === 'female' || v === 'f' || v === '女') return 'female';
  return 'male';
}

function genderLabel(gender) {
  return normalizeGender(gender) === 'female' ? '女' : '男';
}

function resolveOptionalGender(raw) {
  if (!raw || typeof raw !== 'object') return '';
  if (raw.isFemale === true) return 'female';
  const candidates = [raw.gender, raw.sex, raw.matchGender];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (c === null || c === undefined || c === '') continue;
    const v = String(c).trim().toLowerCase();
    if (v === 'male' || v === 'm' || String(c).trim() === '男') return 'male';
    if (v === 'female' || v === 'f' || String(c).trim() === '女') return 'female';
  }
  return '';
}

function getGenderDisplay(raw) {
  const gender = resolveOptionalGender(raw);
  if (gender === 'male') {
    return { icon: '♂', className: 'gender-male', legacyClassName: 'gender-m', gender: gender };
  }
  if (gender === 'female') {
    return { icon: '♀', className: 'gender-female', legacyClassName: 'gender-f', gender: gender };
  }
  return { icon: '', className: '', legacyClassName: '', gender: '' };
}

/** 本场比赛名：matchNickname 优先，再 competitionName / displayName / nickname */
function resolveMatchNickname(raw) {
  if (!raw || typeof raw !== 'object') return '';
  return String(
    raw.matchNickname ||
      raw.competitionName ||
      raw.displayName ||
      raw.nickname ||
      raw.name ||
      raw.realName ||
      raw.remarkName ||
      ''
  ).trim();
}

/** 本场性别：matchGender → gender → 默认 male（永不返回 unknown） */
function resolveMatchGender(raw) {
  if (!raw || typeof raw !== 'object') return 'male';
  const candidates = [raw.matchGender, raw.gender];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const v = String(c || '').trim().toLowerCase();
    if (v === 'female' || v === 'f' || String(c).trim() === '女') return 'female';
    if (v === 'male' || v === 'm' || String(c).trim() === '男') return 'male';
  }
  return 'male';
}

function resolveMatchTeamId(raw) {
  if (!raw || typeof raw !== 'object') return '';
  const id =
    raw.matchTeamId != null && String(raw.matchTeamId).trim() !== ''
      ? raw.matchTeamId
      : raw.groupId != null && String(raw.groupId).trim() !== ''
        ? raw.groupId
        : raw.teamId;
  return id != null ? String(id).trim() : '';
}

function resolveMatchTeamName(raw) {
  if (!raw || typeof raw !== 'object') return '';
  return String(
    raw.matchTeamName || raw.groupName || raw.teamName || raw.teamLabel || ''
  ).trim();
}

function sourceLabel(raw) {
  const src = String((raw && raw.source) || 'self').trim().toLowerCase();
  return SOURCE_LABELS[src] || '报名';
}

/**
 * 占位文案（仅用于过滤脏数据，不向 UI 暴露）
 */
function isPlaceholderTeamLabel(name) {
  const n = String(name || '').trim();
  return (
    !n ||
    n === '未分队' ||
    n === '未设置' ||
    n === '未设置分队' ||
    n === '清空分队'
  );
}

function getFirstRealTeam(teamOptions) {
  const opts = Array.isArray(teamOptions) ? teamOptions : [];
  for (let i = 0; i < opts.length; i++) {
    const t = opts[i];
    if (!t) continue;
    const id = String(t.id != null ? t.id : '').trim();
    const name = String(t.name || '').trim();
    if (id && !isPlaceholderTeamLabel(name)) return { id: id, name: name };
  }
  return null;
}

/**
 * 解析选手分队：已有字段优先；脏数据兜底到比赛第一个真实分队。
 * 永不返回「未分队 / 未设置」展示文案。
 */
function resolveRequiredTeam(raw, teamOptions) {
  const opts = Array.isArray(teamOptions) ? teamOptions : [];
  let tid = resolveMatchTeamId(raw);
  let tname = resolveMatchTeamName(raw);
  if (isPlaceholderTeamLabel(tname)) tname = '';

  if (tid) {
    const hit = opts.find((t) => t && String(t.id) === String(tid));
    if (hit) {
      return {
        id: String(hit.id),
        name: String(hit.name || tid).trim() || tid
      };
    }
    if (tname) return { id: tid, name: tname };
    return { id: tid, name: tid };
  }

  if (tname) {
    const hit = opts.find((t) => t && String(t.name) === tname);
    if (hit) {
      return {
        id: String(hit.id),
        name: String(hit.name || tname).trim() || tname
      };
    }
    return { id: 'name:' + tname, name: tname };
  }

  const first = getFirstRealTeam(opts);
  if (first) return { id: first.id, name: first.name };
  return { id: '', name: '' };
}

function buildMetaLine(genderText, teamName, sourceText) {
  const parts = [genderText || '男'];
  if (teamName) parts.push(teamName);
  if (sourceText) parts.push(sourceText);
  return parts.join(' · ');
}

/** 从报名快照读取手机号（不读用户资料） */
function resolvePhone(raw) {
  if (!raw || typeof raw !== 'object') return '';
  const candidates = [
    raw.phone,
    raw.mobile,
    raw.phoneNumber,
    raw.contactPhone,
    raw.registeredPhone
  ];
  for (let i = 0; i < candidates.length; i++) {
    const v = String(candidates[i] != null ? candidates[i] : '').trim();
    if (v) return v;
  }
  return '';
}

/** 脱敏：138****5678；无号返回空串 */
function maskPhone(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw;
  if (digits.length >= 11) {
    return digits.slice(0, 3) + '****' + digits.slice(-4);
  }
  if (digits.length >= 7) {
    return digits.slice(0, 3) + '****' + digits.slice(-2);
  }
  return digits;
}

function buildListSubLine(phoneText, genderText, teamName, groupStatusLabel) {
  const parts = [];
  parts.push(phoneText || '暂无手机号');
  if (genderText) parts.push(genderText);
  if (teamName) parts.push(teamName);
  if (groupStatusLabel) parts.push(groupStatusLabel);
  return parts.join(' · ');
}

/**
 * 分队选项：仅比赛实际存在的真实分队（不含未分队占位）
 * 优先比赛级配置，再汇总报名用户已有分队；删除选手不会改比赛级分队配置。
 */
function collectTeamOptions(matchOrGame, users) {
  const out = [];
  const seen = {};
  const push = (id, name) => {
    const tid = id != null ? String(id).trim() : '';
    let tname = String(name || '').trim();
    if (isPlaceholderTeamLabel(tname)) {
      if (!tid) return;
      tname = tid;
    }
    if (!tid && !tname) return;
    const key = tid || ('name:' + tname);
    if (seen[key]) return;
    seen[key] = true;
    out.push({
      id: tid || key,
      name: tname || tid || '未命名分队'
    });
  };

  const m = matchOrGame || {};
  const teamGroups = Array.isArray(m.teamGroups) ? m.teamGroups : [];
  teamGroups.forEach((g, index) => {
    if (!g) return;
    const id = g.id != null ? String(g.id) : 'team-group-' + (index + 1);
    push(id, g.name || ('分队' + (index + 1)));
  });

  const settingsTeams =
    (m.settings && Array.isArray(m.settings.teams) && m.settings.teams) ||
    (Array.isArray(m.teamSettings) && m.teamSettings) ||
    (Array.isArray(m.teams) && m.teams) ||
    (Array.isArray(m.groupTeams) && m.groupTeams) ||
    [];
  settingsTeams.forEach((t, index) => {
    if (!t) return;
    if (typeof t === 'string') {
      if (isPlaceholderTeamLabel(t)) return;
      push('team-' + index, t);
      return;
    }
    push(t.id != null ? t.id : 'team-' + index, t.name || t.label || '');
  });

  (Array.isArray(users) ? users : []).forEach((u) => {
    const tid = resolveMatchTeamId(u);
    const tname = resolveMatchTeamName(u);
    if (!tid && isPlaceholderTeamLabel(tname)) return;
    push(tid, tname);
  });

  return out.filter((t) => {
    if (!t) return false;
    const id = String(t.id != null ? t.id : '').trim();
    const name = String(t.name || '').trim();
    return !!(id && !isPlaceholderTeamLabel(name));
  });
}

function applyTeamToRow(row, team) {
  const tid = team && team.id ? String(team.id) : '';
  const tname = team && team.name ? String(team.name) : '';
  const next = Object.assign({}, row, {
    matchTeamId: tid,
    matchTeamName: tname,
    groupId: tid,
    groupName: tname
  });
  next.metaLine = buildMetaLine(
    next.matchGenderLabel || genderLabel(next.matchGender),
    tname,
    next.sourceLabel || '报名'
  );
  next.listSubLine = buildListSubLine(
    next.phone || '暂无手机号',
    next.matchGenderLabel || genderLabel(next.matchGender),
    tname,
    next.formalGroupStatusLabel || ''
  );
  return next;
}

/**
 * 保证选手列表每人都有真实分队（脏数据自动归入第一个分队）
 */
function ensurePlayersHaveTeams(players, teamOptions) {
  const opts = Array.isArray(teamOptions) ? teamOptions : [];
  const first = getFirstRealTeam(opts);
  return (Array.isArray(players) ? players : []).map((p) => {
    if (!p) return p;
    const resolved = resolveRequiredTeam(p, opts);
    if (resolved.id && resolved.name) {
      if (
        String(p.matchTeamId || '') === resolved.id &&
        String(p.matchTeamName || '') === resolved.name
      ) {
        return p;
      }
      return applyTeamToRow(p, resolved);
    }
    if (first) return applyTeamToRow(p, first);
    return p;
  });
}

function buildPlayerManageRow(raw, teamOptions) {
  const userId = resolveUserId(raw);
  if (!userId) return null;
  const matchNickname = resolveMatchNickname(raw);
  const matchGender = resolveMatchGender(raw);
  const team = resolveRequiredTeam(raw, teamOptions);
  const srcLabel = sourceLabel(raw);
  const phone = resolvePhone(raw);
  const phoneMasked = maskPhone(phone);
  const genderText = genderLabel(matchGender);
  const genderDisplay = getGenderDisplay(raw);
  return {
    userId: userId,
    nickname: String((raw && raw.nickname) || '').trim(),
    displayName: String((raw && raw.displayName) || '').trim(),
    name: String((raw && (raw.name || raw.realName)) || '').trim(),
    avatar: mockAvatars.resolveAvatar(
      (raw && (raw.avatar || raw.avatarUrl)) || '',
      userId
    ),
    phone: phone,
    phoneMasked: phoneMasked,
    hasPhone: !!phone,
    phoneDisplay: phone || '暂无手机号',
    source: String((raw && raw.source) || 'self'),
    sourceLabel: srcLabel,
    registeredBy: String((raw && raw.registeredBy) || '').trim(),
    registeredByName: String((raw && raw.registeredByName) || '').trim(),
    subjectType: String((raw && raw.subjectType) || 'self'),
    pickChannel: String((raw && raw.pickChannel) || ''),
    canSelfCancel: raw && raw.canSelfCancel !== false,
    locked: !!(raw && raw.locked),
    userType: String((raw && raw.userType) || ''),
    realName: String((raw && raw.realName) || ''),
    remarkName: String((raw && raw.remarkName) || ''),
    handicap: raw && raw.handicap != null ? raw.handicap : '',
    registeredAt: raw && raw.registeredAt != null ? raw.registeredAt : '',
    // 本场快照
    matchNickname: matchNickname,
    matchGender: matchGender,
    matchGenderLabel: genderText,
    genderIcon: genderDisplay.icon,
    genderClass: genderDisplay.className,
    matchTeamId: team.id,
    matchTeamName: team.name,
    // 兼容旧字段（与快照同步）
    competitionName: matchNickname,
    gender: matchGender,
    groupId: team.id,
    groupName: team.name,
    genderOptions: GENDER_OPTIONS.map((g) =>
      Object.assign({}, g, { selected: g.key === matchGender })
    ),
    metaLine: buildMetaLine(genderText, team.name, srcLabel),
    listSubLine: buildListSubLine(phone || '暂无手机号', genderText, team.name, ''),
    expanded: false,
    // 保留其余原始字段，保存时合并
    _raw: _cloneJson(raw)
  };
}

function buildPlayerManageDraft(matchOrGame) {
  const m = matchOrGame || {};
  const users =
    m.registerInfo && Array.isArray(m.registerInfo.users)
      ? m.registerInfo.users
      : [];
  const teamOptions = collectTeamOptions(m, users);
  const list = [];
  const seen = {};
  users.forEach((u) => {
    const row = buildPlayerManageRow(u, teamOptions);
    if (!row || seen[row.userId]) return;
    seen[row.userId] = true;
    list.push(row);
  });
  return {
    players: list,
    teamOptions: teamOptions,
    groupsDraft: _cloneJson(Array.isArray(m.groups) ? m.groups : []),
    pairingsDraft: _cloneJson(m.pairings && typeof m.pairings === 'object' ? m.pairings : {}),
    removedUserIds: []
  };
}

function applyExpandState(players, expandedUserId) {
  const eid = String(expandedUserId || '');
  return (Array.isArray(players) ? players : []).map((p) =>
    Object.assign({}, p, { expanded: !!(p && String(p.userId) === eid) })
  );
}

/** 分队筛选：全部分队 */
const TEAM_FILTER_ALL = '__ALL__';

/** 排序名：本场比赛名 > 展示名 > 昵称 > 原姓名 */
function resolveSortName(raw) {
  if (!raw || typeof raw !== 'object') return '';
  return String(
    raw.matchNickname ||
      raw.competitionName ||
      raw.displayName ||
      raw.nickname ||
      raw.name ||
      raw.realName ||
      ''
  ).trim();
}

/**
 * 统一首字母排序 key：
 * - 英文：小写全名
 * - 中文：拼音全拼（轻量字典），与英文同属 A-Z
 * - 数字/符号：排在 A-Z 之后
 * - 空名：最后
 * 不按中英文分组。
 */
function getNameSortKey(displayName, player) {
  const name = String(displayName == null ? '' : displayName).trim();
  if (!name) return '9_';

  // 已有拼音字段优先（仍只用于排序，不写回资料）
  const existingPy = player
    ? String(player.pinyin || player.namePinyin || player.initial || '').trim()
    : '';
  if (existingPy && /^[A-Za-z]/.test(existingPy)) {
    return '0_' + existingPy.toLowerCase().replace(/\s+/g, '');
  }

  const first = name.charAt(0);
  if (/[A-Za-z]/.test(first)) {
    return '0_' + name.toLowerCase();
  }

  if (chinesePinyinLite.isCjkChar(first)) {
    const py = chinesePinyinLite.chineseToPinyin(name);
    if (py) return '0_' + py;
    // 极端兜底：首字母 + 原名，仍落在 A-Z 桶
    const initial = chinesePinyinLite.getPinyinInitial(first) || 'z';
    return '0_' + initial + '_' + name;
  }

  // 数字 / 符号开头 → A-Z 之后
  return '1_' + name.toLowerCase();
}

function getPlayerSortKey(player) {
  return getNameSortKey(resolveSortName(player), player);
}

/**
 * 统一比较 sortKey（中英文同一套 A-Z，不分组）
 */
function comparePlayerDisplayName(nameA, nameB, playerA, playerB) {
  const keyA = getNameSortKey(nameA, playerA);
  const keyB = getNameSortKey(nameB, playerB);
  if (keyA < keyB) return -1;
  if (keyA > keyB) return 1;
  // 同 key 时用原名 localeCompare 兜底
  try {
    return String(nameA || '').localeCompare(String(nameB || ''), 'zh-Hans-CN', {
      sensitivity: 'base',
      numeric: true
    });
  } catch (e) {
    const a = String(nameA || '').toLowerCase();
    const b = String(nameB || '').toLowerCase();
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }
}

function comparePlayersByName(a, b) {
  const cmp = comparePlayerDisplayName(
    resolveSortName(a),
    resolveSortName(b),
    a,
    b
  );
  if (cmp !== 0) return cmp;
  return String((a && a.userId) || '').localeCompare(
    String((b && b.userId) || ''),
    'en',
    { sensitivity: 'base' }
  );
}

function matchesTeamFilter(player, teamFilter) {
  const filter = teamFilter != null ? String(teamFilter) : TEAM_FILTER_ALL;
  // 全部分队：显示全部报名用户（报名必有分队）
  if (!filter || filter === TEAM_FILTER_ALL) return true;
  const tid = String(resolveMatchTeamId(player) || '');
  if (tid && tid === filter) return true;
  if (filter.indexOf('name:') === 0) {
    const want = filter.slice(5);
    const tname = resolveMatchTeamName(player);
    return !!(want && tname === want);
  }
  const tname = resolveMatchTeamName(player);
  return !!(tname && tname === filter);
}

function matchesSearchKeyword(player, keyword) {
  const kw = String(keyword || '').trim().toLowerCase();
  if (!kw) return true;
  if (!player || typeof player !== 'object') return false;
  const fields = [
    player.matchNickname,
    player.competitionName,
    player.displayName,
    player.nickname,
    player.name,
    player.realName,
    player.remarkName,
    player.userId
  ];
  for (let i = 0; i < fields.length; i++) {
    const v = String(fields[i] != null ? fields[i] : '')
      .trim()
      .toLowerCase();
    if (v && v.indexOf(kw) >= 0) return true;
  }
  // 手机号：用原始字段搜索（完整号 / 后四位），不受脱敏影响
  const phone = resolvePhone(player) || String(player.phone || '').trim();
  if (phone) {
    const phoneLower = phone.toLowerCase();
    if (phoneLower.indexOf(kw) >= 0) return true;
    const phoneDigits = phone.replace(/\D/g, '');
    const kwDigits = String(keyword || '').replace(/\D/g, '');
    if (kwDigits && phoneDigits && phoneDigits.indexOf(kwDigits) >= 0) return true;
  }
  return false;
}

/**
 * 分队筛选选项：全部分队 + 真实分队
 */
function buildTeamFilterOptions(teamOptions, currentFilter) {
  const cur =
    currentFilter != null && String(currentFilter) !== ''
      ? String(currentFilter)
      : TEAM_FILTER_ALL;
  const out = [
    {
      id: TEAM_FILTER_ALL,
      optionKey: TEAM_FILTER_ALL,
      name: '全部分队',
      selected: cur === TEAM_FILTER_ALL
    }
  ];
  const seen = {};
  seen[TEAM_FILTER_ALL] = true;
  (Array.isArray(teamOptions) ? teamOptions : []).forEach((t) => {
    if (!t) return;
    const id = t.id != null ? String(t.id).trim() : '';
    const name = String(t.name || '').trim();
    if (!id || isPlaceholderTeamLabel(name)) return;
    if (seen[id]) return;
    seen[id] = true;
    out.push({
      id: id,
      optionKey: id,
      name: name || '未命名分队',
      selected: cur === id
    });
  });
  return out;
}

function resolveTeamFilterLabel(teamOptions, teamFilter) {
  const filter =
    teamFilter != null && String(teamFilter) !== ''
      ? String(teamFilter)
      : TEAM_FILTER_ALL;
  if (filter === TEAM_FILTER_ALL) return '全部分队';
  const hit = (Array.isArray(teamOptions) ? teamOptions : []).find(
    (t) => t && String(t.id) === filter
  );
  return hit && hit.name ? hit.name : '全部分队';
}

/**
 * 从正式 groups 收集已入组 userId（兼容 players / playersSlots / 字符串位）
 */
function resolveFormalSlotUserId(player) {
  if (player == null) return '';
  if (typeof player === 'string' || typeof player === 'number') {
    return String(player).trim();
  }
  if (typeof player !== 'object') return '';
  const id = player.userId || player.playerId || player.id;
  return id != null ? String(id).trim() : '';
}

function collectFormalGroupedUserIds(groups) {
  const set = {};
  (Array.isArray(groups) ? groups : []).forEach((g) => {
    if (!g) return;
    const lists = [];
    if (Array.isArray(g.players)) lists.push(g.players);
    if (Array.isArray(g.playersSlots)) lists.push(g.playersSlots);
    lists.forEach((list) => {
      list.forEach((p) => {
        const id = resolveFormalSlotUserId(p);
        if (id) set[id] = true;
      });
    });
  });
  return set;
}

function isPlayerFormalGrouped(player, groupedUserIds) {
  const uid = resolveUserId(player);
  if (!uid) return false;
  return !!(groupedUserIds && groupedUserIds[uid]);
}

/** 分组状态筛选：all | grouped | ungrouped */
const GROUP_STATUS_ALL = 'all';
const GROUP_STATUS_GROUPED = 'grouped';
const GROUP_STATUS_UNGROUPED = 'ungrouped';

function matchesGroupStatusFilter(player, status, groupedUserIds) {
  const s = String(status || GROUP_STATUS_ALL);
  if (!s || s === GROUP_STATUS_ALL) return true;
  const grouped = isPlayerFormalGrouped(player, groupedUserIds);
  if (s === GROUP_STATUS_GROUPED) return grouped;
  if (s === GROUP_STATUS_UNGROUPED) return !grouped;
  return true;
}

/**
 * 仅用于弹屏展示：分队筛选 → 分组状态 → 搜索 → 统一首字母排序。
 * 不修改传入的 players 原数组顺序。
 */
function buildPlayerManageDisplay(players, options) {
  const opts = options || {};
  const keyword = String(opts.keyword || '').trim();
  const teamFilter =
    opts.teamFilter != null ? opts.teamFilter : TEAM_FILTER_ALL;
  const groupStatusFilter = opts.groupStatusFilter || GROUP_STATUS_ALL;
  const expandedUserId = String(opts.expandedUserId || '');
  const groupedUserIds = collectFormalGroupedUserIds(opts.groups);
  const source = Array.isArray(players) ? players : [];
  let filtered = source.filter((p) => matchesTeamFilter(p, teamFilter));
  filtered = filtered.filter((p) =>
    matchesGroupStatusFilter(p, groupStatusFilter, groupedUserIds)
  );
  if (keyword) {
    filtered = filtered.filter((p) => matchesSearchKeyword(p, keyword));
  }
  const sorted = filtered.slice().sort(comparePlayersByName);
  const list = applyExpandState(sorted, expandedUserId).map((p) => {
    if (!p) return p;
    const formalGrouped = isPlayerFormalGrouped(p, groupedUserIds);
    const statusLabel = formalGrouped ? '已分组' : '未分组';
    const phone = resolvePhone(p) || String(p.phone || '').trim();
    const phoneMasked = p.phoneMasked || maskPhone(phone);
    return Object.assign({}, p, {
      phone: phone,
      phoneMasked: phoneMasked,
      hasPhone: !!phone,
      phoneDisplay: phone || '暂无手机号',
      formalGrouped: formalGrouped,
      formalGroupStatusLabel: statusLabel,
      listSubLine: buildListSubLine(
        phone || '暂无手机号',
        p.matchGenderLabel || genderLabel(p.matchGender),
        p.matchTeamName,
        ''
      )
    });
  });
  const totalCount = source.length;
  const displayCount = list.length;
  const filterVal =
    teamFilter != null && String(teamFilter) !== ''
      ? String(teamFilter)
      : TEAM_FILTER_ALL;
  const hasActiveFilter =
    !!keyword ||
    filterVal !== TEAM_FILTER_ALL ||
    String(groupStatusFilter || GROUP_STATUS_ALL) !== GROUP_STATUS_ALL;
  const countTip = hasActiveFilter
    ? '共 ' + totalCount + ' 人，当前显示 ' + displayCount + ' 人'
    : '共 ' + totalCount + ' 人';
  return {
    list: list,
    totalCount: totalCount,
    displayCount: displayCount,
    countTip: countTip,
    hasActiveFilter: hasActiveFilter,
    emptyText: totalCount === 0 ? '暂无报名选手' : '未找到匹配选手'
  };
}

function updatePlayerField(players, userId, patch, teamOptions) {
  const uid = String(userId || '').trim();
  const list = Array.isArray(players) ? players : [];
  return list.map((p) => {
    if (!p || String(p.userId) !== uid) return p;
    const next = Object.assign({}, p, patch || {});
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'matchNickname')) {
      const name = String(patch.matchNickname || '').trim();
      next.matchNickname = name;
      next.competitionName = name;
    }
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'matchGender')) {
      const g = normalizeGender(patch.matchGender);
      next.matchGender = g;
      next.gender = g;
      next.matchGenderLabel = genderLabel(g);
      next.genderOptions = GENDER_OPTIONS.map((opt) =>
        Object.assign({}, opt, { selected: opt.key === g })
      );
    }
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'matchTeamId')) {
      const tid = String(patch.matchTeamId || '').trim();
      const opts = Array.isArray(teamOptions) ? teamOptions : [];
      // 不允许清空分队
      if (!tid) {
        next.matchTeamId = p.matchTeamId;
        next.matchTeamName = p.matchTeamName;
        next.groupId = p.groupId;
        next.groupName = p.groupName;
      } else {
        const hit = opts.find((t) => String(t.id) === tid);
        const resolved = hit
          ? { id: String(hit.id), name: String(hit.name || tid) }
          : resolveRequiredTeam(
              Object.assign({}, p, {
                matchTeamId: tid,
                matchTeamName: patch.matchTeamName || p.matchTeamName
              }),
              opts
            );
        next.matchTeamId = resolved.id;
        next.matchTeamName = resolved.name;
        next.groupId = resolved.id;
        next.groupName = resolved.name;
      }
    }
    next.metaLine = buildMetaLine(
      next.matchGenderLabel || genderLabel(next.matchGender),
      next.matchTeamName,
      next.sourceLabel || '报名'
    );
    next.listSubLine = buildListSubLine(
      next.phone || '暂无手机号',
      next.matchGenderLabel || genderLabel(next.matchGender),
      next.matchTeamName,
      next.formalGroupStatusLabel || ''
    );
    return next;
  });
}

/**
 * 从 draft 删除选手，同步清理 groupsDraft / pairingsDraft（不写正式 match）
 */
function removePlayerFromDraft(draft, userId) {
  const uid = String(userId || '').trim();
  if (!draft || !uid) {
    return { ok: false, reason: 'no_user', draft: draft };
  }
  const stub = {
    registerInfo: {
      users: (draft.players || []).map((p) => ({ userId: p.userId })),
      totalCount: (draft.players || []).length
    },
    groups: _cloneJson(draft.groupsDraft || []),
    pairings: _cloneJson(draft.pairingsDraft || {})
  };
  const result = teamMatchStore.removeRegisteredUserAndCleanupGroups(stub, uid);
  if (!result || !result.ok) {
    return { ok: false, reason: (result && result.reason) || 'fail', draft: draft };
  }
  const removedUserIds = Array.isArray(draft.removedUserIds)
    ? draft.removedUserIds.slice()
    : [];
  if (removedUserIds.indexOf(uid) < 0) removedUserIds.push(uid);
  return {
    ok: true,
    wasGrouped: !!result.wasGrouped,
    draft: {
      players: (draft.players || []).filter((p) => p && String(p.userId) !== uid),
      teamOptions: draft.teamOptions || [],
      groupsDraft: stub.groups || [],
      pairingsDraft: stub.pairings || {},
      removedUserIds: removedUserIds
    }
  };
}

function _rowToRegisterUser(row, teamOptions) {
  const base =
    row && row._raw && typeof row._raw === 'object' ? Object.assign({}, row._raw) : {};
  const matchNickname = String((row && row.matchNickname) || '').trim();
  const fallbackName = resolveMatchNickname(row) || resolveMatchNickname(base) || '选手';
  const name = matchNickname || fallbackName;
  const gender = normalizeGender((row && row.matchGender) || (row && row.gender) || '');
  const team = resolveRequiredTeam(row, teamOptions);
  const next = Object.assign({}, base, {
    userId: resolveUserId(row) || resolveUserId(base),
    nickname: String((row && row.nickname) || base.nickname || '').trim(),
    avatar: (row && row.avatar) || base.avatar || '',
    phone: resolvePhone(row) || (row && row.phone) || base.phone || '',
    // 本场快照字段
    matchNickname: name,
    competitionName: name,
    matchGender: gender,
    gender: gender,
    matchTeamId: team.id,
    matchTeamName: team.name,
    groupId: team.id,
    groupName: team.name
  });
  return teamMatchStore.normalizeRegisterUser
    ? teamMatchStore.normalizeRegisterUser(next)
    : next;
}

/**
 * 将 draft 写回 match（仅 register 快照 + groups/pairings 清理结果）
 * 按 userId 合并，保留 registerInfo.users 原始顺序；不写用户资料。
 * 保存前自动补齐缺失分队（归入第一个真实分队）。
 */
function commitPlayerManageDraft(matchOrGame, draft) {
  if (!matchOrGame || typeof matchOrGame !== 'object') {
    return { ok: false, reason: 'no_match' };
  }
  const d = draft || {};
  const teamOptions =
    (Array.isArray(d.teamOptions) && d.teamOptions.length
      ? d.teamOptions
      : null) ||
    collectTeamOptions(
      matchOrGame,
      matchOrGame.registerInfo && matchOrGame.registerInfo.users
    );
  const ensuredPlayers = ensurePlayersHaveTeams(d.players, teamOptions);
  d.players = ensuredPlayers;

  const draftMap = {};
  ensuredPlayers.forEach((row) => {
    const id = resolveUserId(row);
    if (!id) return;
    draftMap[id] = row;
  });

  const originalUsers =
    matchOrGame.registerInfo && Array.isArray(matchOrGame.registerInfo.users)
      ? matchOrGame.registerInfo.users
      : [];
  const users = [];
  const seen = {};
  originalUsers.forEach((orig) => {
    const id = resolveUserId(orig);
    if (!id || seen[id]) return;
    const row = draftMap[id];
    if (!row) return; // 已从 draft 删除
    seen[id] = true;
    users.push(_rowToRegisterUser(row, teamOptions));
  });
  // 兜底：draft 中存在但不在原列表的（如从 groups 派生）
  ensuredPlayers.forEach((row) => {
    const id = resolveUserId(row);
    if (!id || seen[id]) return;
    seen[id] = true;
    users.push(_rowToRegisterUser(row, teamOptions));
  });

  if (!matchOrGame.registerInfo || typeof matchOrGame.registerInfo !== 'object') {
    matchOrGame.registerInfo = { totalCount: 0, users: [] };
  }
  matchOrGame.registerInfo.users = users;
  matchOrGame.registerInfo.totalCount = users.length;

  if (Array.isArray(d.groupsDraft)) {
    matchOrGame.groups = _cloneJson(d.groupsDraft);
  }
  if (d.pairingsDraft && typeof d.pairingsDraft === 'object') {
    matchOrGame.pairings = _cloneJson(d.pairingsDraft);
    if (Object.prototype.hasOwnProperty.call(matchOrGame, 'pairingMap')) {
      matchOrGame.pairingMap = _cloneJson(d.pairingsDraft);
    }
  }

  // 同步正式分组 / slots 中的展示名与性别（仍只改本场数据）
  _syncGroupPlayerSnapshots(matchOrGame, users);
  return { ok: true, match: matchOrGame };
}

function _syncGroupPlayerSnapshots(matchOrGame, users) {
  const map = {};
  (Array.isArray(users) ? users : []).forEach((u) => {
    const id = resolveUserId(u);
    if (!id) return;
    map[id] = {
      name: resolveMatchNickname(u),
      gender: resolveMatchGender(u),
      avatar: u.avatar || ''
    };
  });
  const patchPlayers = (list) => {
    if (!Array.isArray(list)) return list;
    return list.map((p) => {
      if (p == null) return p;
      const id =
        typeof p === 'string' || typeof p === 'number'
          ? String(p).trim()
          : resolveUserId(p);
      if (!id || !map[id]) return p;
      if (typeof p === 'string' || typeof p === 'number') return p;
      const next = Object.assign({}, p);
      if (map[id].name) {
        next.name = map[id].name;
        next.nickname = map[id].name;
        next.displayName = map[id].name;
      }
      if (map[id].gender) next.gender = map[id].gender;
      if (map[id].avatar) next.avatar = map[id].avatar;
      return next;
    });
  };
  if (Array.isArray(matchOrGame.groups)) {
    matchOrGame.groups = matchOrGame.groups.map((g) => {
      if (!g) return g;
      const next = Object.assign({}, g);
      if (Array.isArray(g.players)) next.players = patchPlayers(g.players);
      if (Array.isArray(g.playersSlots)) next.playersSlots = patchPlayers(g.playersSlots);
      return next;
    });
  }
  if (Array.isArray(matchOrGame.playersSlots)) {
    matchOrGame.playersSlots = patchPlayers(matchOrGame.playersSlots);
  }
}

/**
 * Hub / 无报名名单时：从 groups 槽位派生临时 register users（仍属本场数据）
 */
function ensureRegisterUsersFromGroups(matchOrGame) {
  if (!matchOrGame || typeof matchOrGame !== 'object') return matchOrGame;
  const existing =
    matchOrGame.registerInfo && Array.isArray(matchOrGame.registerInfo.users)
      ? matchOrGame.registerInfo.users
      : [];
  if (existing.length) return matchOrGame;
  const users = [];
  const seen = {};
  const pushPlayer = (p) => {
    if (p == null) return;
    const id =
      typeof p === 'string' || typeof p === 'number'
        ? String(p).trim()
        : resolveUserId(p);
    if (!id || seen[id]) return;
    seen[id] = true;
    const name =
      typeof p === 'object'
        ? String(p.name || p.nickname || p.displayName || '').trim()
        : '';
    users.push({
      userId: id,
      competitionName: name || id,
      matchNickname: name || id,
      gender: typeof p === 'object' ? p.gender || '' : '',
      matchGender: typeof p === 'object' ? p.gender || '' : '',
      avatar: typeof p === 'object' ? p.avatar || '' : '',
      source: 'self'
    });
  };
  (Array.isArray(matchOrGame.groups) ? matchOrGame.groups : []).forEach((g) => {
    if (!g) return;
    (g.playersSlots || []).forEach(pushPlayer);
    (g.players || []).forEach(pushPlayer);
  });
  (matchOrGame.playersSlots || []).forEach(pushPlayer);
  matchOrGame.registerInfo = {
    totalCount: users.length,
    users: users
  };
  return matchOrGame;
}

function canManagePlayers(matchOrGame, userId, isPrivileged) {
  if (isPrivileged) return true;
  const uid = String(userId || '').trim();
  if (!uid || !matchOrGame) return false;
  const creatorId = String(
    matchOrGame.createdBy || matchOrGame.creatorId || ''
  ).trim();
  if (creatorId && creatorId === uid) return true;
  const tempAdminPermission = require('./tempAdminPermission.js');
  return tempAdminPermission.hasTempAdminPermission(
    matchOrGame,
    uid,
    'manage_players'
  );
}

module.exports = {
  GENDER_OPTIONS,
  TEAM_FILTER_ALL,
  GROUP_STATUS_ALL,
  GROUP_STATUS_GROUPED,
  GROUP_STATUS_UNGROUPED,
  resolveUserId,
  normalizeGender,
  genderLabel,
  getGenderDisplay,
  resolveMatchNickname,
  resolveMatchGender,
  resolveMatchTeamId,
  resolveMatchTeamName,
  resolveSortName,
  getNameSortKey,
  getPlayerSortKey,
  isPlaceholderTeamLabel,
  getFirstRealTeam,
  resolveRequiredTeam,
  collectTeamOptions,
  ensurePlayersHaveTeams,
  resolvePhone,
  maskPhone,
  collectFormalGroupedUserIds,
  isPlayerFormalGrouped,
  matchesGroupStatusFilter,
  buildPlayerManageDraft,
  buildPlayerManageRow,
  applyExpandState,
  updatePlayerField,
  removePlayerFromDraft,
  commitPlayerManageDraft,
  ensureRegisterUsersFromGroups,
  canManagePlayers,
  comparePlayerDisplayName,
  comparePlayersByName,
  matchesTeamFilter,
  matchesSearchKeyword,
  buildTeamFilterOptions,
  resolveTeamFilterLabel,
  buildPlayerManageDisplay
};
