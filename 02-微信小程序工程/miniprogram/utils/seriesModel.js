/**
 * 系列赛领域模型：枚举、工厂、normalize、rankingValue 辅助
 * - normalize 不静默生成稳定身份 ID
 * - 仅新建工厂可创建 seriesId / roundId / seriesParticipantId / entryId
 */

var seriesIds = require('./seriesIds.js');

var SCHEMA_VERSION = 1;
var CALCULATION_VERSION = 1;

var LIFECYCLE_STATUS = {
  draft: true,
  published: true,
  cancelled: true,
  archived: true
};

var COMPETITION_PHASE = {
  registration: true,
  scheduled: true,
  live: true,
  settlement_pending: true,
  completed: true
};

var ROUND_STATUS = {
  scheduled: true,
  registration_open: true,
  ready: true,
  live: true,
  settlement_pending: true,
  completed: true,
  postponed: true,
  cancelled: true
};

var HOST_MODE = {
  organization: true,
  team: true
};

var TEMPLATE_ID = {
  inter_team_series: true,
  division_series: true,
  ryder: true,
  individual_tour: true,
  custom: true
};

var SCORING_MODE = {
  per_round_n: true,
  global_m: true,
  ryder_match_play: true
};

var SCORE_BASIS = {
  gross: true,
  net: true,
  to_par: true
};

var RESULT_UNIT_TYPE = {
  player: true,
  pair: true,
  entity: true
};

var RESULT_STATUS = {
  OK: true,
  DNS: true,
  WD: true,
  DNF: true,
  DQ: true,
  MISSING: true,
  CANCELLED_ROUND: true
};

var GAME_MODE = {
  个人比杆赛: true,
  四人四球比杆赛: true,
  最佳球位比杆赛: true,
  四人两球比杆赛: true,
  个人比洞赛: true,
  最好成绩比洞赛: true,
  四人四球比洞赛: true,
  最佳球位比洞赛: true,
  四人两球比洞赛: true
};

var PARTICIPANT_KIND = {
  team: true,
  division: true
};

var PUBLISH_STATE = {
  idle: true,
  publishing: true,
  published: true,
  failed: true
};

var REGISTRATION_STATE = {
  open: true,
  closed: true
};

var COMPLETION_SOURCE = {
  auto: true,
  manual: true,
  backend: true
};

var ROSTER_REGISTRATION_STATUS = {
  registered: true,
  cancelled: true
};

function nowIso() {
  return new Date().toISOString();
}

function deepClone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asString(value, fallback) {
  if (value == null) return fallback != null ? fallback : '';
  return String(value);
}

function asBool(value, fallback) {
  if (typeof value === 'boolean') return value;
  return fallback === true;
}

function asFiniteNumberOrNull(value) {
  if (value == null || value === '') return null;
  var n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * 副标题：trim + 清除换行；不从 seriesName 拆分；默认空串。
 * 展示：正式名称第二行（与主标题同字号/字重/颜色/行高）；Hero 居中；
 * 4C-3 LIVE / 4C-4 报名卡左对齐（本批不改那些页面）。
 */
function sanitizeSeriesSubtitle(raw) {
  return asString(raw, '')
    .replace(/[\r\n\u2028\u2029]+/g, '')
    .trim();
}

/**
 * rankingValue 取值规则（模型层辅助，不算分入口）：
 * - gross → entry.gross
 * - net → entry.net
 * - to_par → entry.toPar
 * - 缺少对应有限数值 → { ok:false, rankingValue:null, reason }
 * - 禁止回退到其他成绩字段
 *
 * @param {object} entry
 * @param {string} scoreBasis
 * @returns {{ ok: boolean, rankingValue: number|null, reason: string }}
 */
function resolveRankingValue(entry, scoreBasis) {
  var basis = scoreBasis != null ? String(scoreBasis).trim() : '';
  if (!SCORE_BASIS[basis]) {
    return { ok: false, rankingValue: null, reason: 'invalid_score_basis' };
  }
  if (!isPlainObject(entry)) {
    return { ok: false, rankingValue: null, reason: 'invalid_entry' };
  }
  var raw;
  if (basis === 'gross') raw = entry.gross;
  else if (basis === 'net') raw = entry.net;
  else raw = entry.toPar;
  var n = asFiniteNumberOrNull(raw);
  if (n == null) {
    return { ok: false, rankingValue: null, reason: 'missing_' + basis };
  }
  return { ok: true, rankingValue: n, reason: '' };
}

function createDefaultScoringRule(partial) {
  var src = isPlainObject(partial) ? partial : {};
  if (src.mode === 'ryder_match_play') {
    return {
      mode: 'ryder_match_play',
      allowRepeat: asBool(src.allowRepeat, true),
      scoreBasis:
        src.scoreBasis === 'net' || src.scoreBasis === 'to_par' ? src.scoreBasis : 'gross',
      ruleVersion:
        asFiniteNumberOrNull(src.ruleVersion) != null ? Math.floor(Number(src.ruleVersion)) : 1
    };
  }
  return {
    mode: src.mode === 'global_m' ? 'global_m' : 'per_round_n',
    globalM: asFiniteNumberOrNull(src.globalM) != null ? Math.floor(Number(src.globalM)) : 10,
    allowRepeat: asBool(src.allowRepeat, false),
    scoreBasis:
      src.scoreBasis === 'net' || src.scoreBasis === 'to_par' ? src.scoreBasis : 'gross',
    ruleVersion:
      asFiniteNumberOrNull(src.ruleVersion) != null ? Math.floor(Number(src.ruleVersion)) : 1,
    defaultTopN:
      asFiniteNumberOrNull(src.defaultTopN) != null ? Math.floor(Number(src.defaultTopN)) : 3
  };
}

/**
 * 持久化 normalize 用：缺失补默认；已存在的非法枚举原样保留（不静默纠正）
 */
function normalizeScoringRule(raw) {
  if (!isPlainObject(raw)) {
    return createDefaultScoringRule(null);
  }
  var mode =
    raw.mode === undefined || raw.mode === null || raw.mode === ''
      ? 'per_round_n'
      : String(raw.mode);
  var scoreBasis =
    raw.scoreBasis === undefined || raw.scoreBasis === null || raw.scoreBasis === ''
      ? 'gross'
      : String(raw.scoreBasis);
  var globalM =
    raw.globalM === undefined || raw.globalM === null || raw.globalM === ''
      ? 10
      : asFiniteNumberOrNull(raw.globalM) != null
        ? Math.floor(Number(raw.globalM))
        : raw.globalM;
  var ruleVersion =
    raw.ruleVersion === undefined || raw.ruleVersion === null || raw.ruleVersion === ''
      ? 1
      : asFiniteNumberOrNull(raw.ruleVersion) != null
        ? Math.floor(Number(raw.ruleVersion))
        : raw.ruleVersion;
  var defaultTopN =
    raw.defaultTopN === undefined || raw.defaultTopN === null || raw.defaultTopN === ''
      ? 3
      : asFiniteNumberOrNull(raw.defaultTopN) != null
        ? Math.floor(Number(raw.defaultTopN))
        : raw.defaultTopN;
  return {
    mode: mode,
    globalM: globalM,
    allowRepeat: asBool(raw.allowRepeat, mode === 'ryder_match_play'),
    scoreBasis: scoreBasis,
    ruleVersion: ruleVersion,
    defaultTopN: defaultTopN
  };
}

/** 字段缺失→默认；字段存在（含非法）→保留字符串 */
function normalizeEnumField(value, defaultWhenAbsent) {
  if (value === undefined || value === null || value === '') {
    return defaultWhenAbsent;
  }
  return String(value);
}

function createBlankRound(index, partial) {
  var src = isPlainObject(partial) ? partial : {};
  var idx = Math.max(1, Math.floor(Number(index) || 1));
  var ts = nowIso();
  return {
    roundId: src.roundId != null && String(src.roundId).trim() !== ''
      ? String(src.roundId).trim()
      : seriesIds.generateRoundId(),
    index: idx,
    name: src.name != null && String(src.name).trim() !== '' ? String(src.name).trim() : 'ROUND ' + idx,
    roundStatus: ROUND_STATUS[src.roundStatus] ? src.roundStatus : 'scheduled',
    dateTime: asString(src.dateTime, ''),
    dateTimeUserEdited: asBool(src.dateTimeUserEdited, false),
    fee: asString(src.fee, ''),
    gameMode: asString(src.gameMode, ''),
    topN: asFiniteNumberOrNull(src.topN) != null ? Math.floor(Number(src.topN)) : 3,
    topNUserEdited: asBool(src.topNUserEdited, false),
    courseId: asString(src.courseId, ''),
    courseName: asString(src.courseName, ''),
    courseLocation: asString(src.courseLocation, ''),
    front9Course: src.front9Course != null ? deepClone(src.front9Course) : null,
    back9Course: src.back9Course != null ? deepClone(src.back9Course) : null,
    courseHalfText: asString(src.courseHalfText, ''),
    matchId: src.matchId != null && String(src.matchId).trim() !== '' ? String(src.matchId).trim() : null,
    createdAt: asString(src.createdAt, ts),
    updatedAt: asString(src.updatedAt, ts)
  };
}

/**
 * 批量生成空白轮次（新建工厂，会生成新 roundId）
 * @param {number} count 至少 2
 * @returns {object[]}
 */
function createBlankRounds(count) {
  var n = Math.max(2, Math.floor(Number(count) || 2));
  var rounds = [];
  for (var i = 1; i <= n; i++) {
    rounds.push(createBlankRound(i, null));
  }
  return rounds;
}

/**
 * 新建系列草稿工厂（可生成 seriesId / roundId / publishToken）
 * @param {object} [partial]
 * @returns {object}
 */
/**
 * Series 权威创建者字段：仅 `createdBy`。
 * 读取时可一次性兼容 creatorId/ownerUserId；写出只保留 createdBy，不伪造当前用户。
 */
function resolveCreatedByField(src) {
  var primary = asString(src && src.createdBy, '');
  if (primary) return primary;
  var alt = asString(src && (src.creatorId || src.ownerUserId), '');
  return alt;
}

function coerceCompletionFields(src) {
  var lifeRaw = asString(src && src.lifecycleStatus, '');
  var phaseRaw = asString(src && src.competitionPhaseCache, '');
  if (phaseRaw === 'finished') phaseRaw = 'completed';
  if (lifeRaw === 'finished' || lifeRaw === 'completed') {
    phaseRaw = 'completed';
    lifeRaw = 'published';
  }
  return { lifecycleStatus: lifeRaw, competitionPhaseCache: phaseRaw };
}

function createEmptySeriesDraft(partial) {
  var src = isPlainObject(partial) ? partial : {};
  var ts = nowIso();
  var roundCount =
    asFiniteNumberOrNull(src.roundCount) != null ? Math.floor(Number(src.roundCount)) : 2;
  if (roundCount < 2) roundCount = 2;
  var rounds =
    Array.isArray(src.rounds) && src.rounds.length >= 2
      ? src.rounds.map(function (r, i) {
          return createBlankRound(i + 1, r);
        })
      : createBlankRounds(roundCount);
  var seriesId =
    src.seriesId != null && String(src.seriesId).trim() !== ''
      ? String(src.seriesId).trim()
      : seriesIds.generateSeriesId();
  var coerced = coerceCompletionFields(src);
  var life =
    LIFECYCLE_STATUS[coerced.lifecycleStatus]
      ? coerced.lifecycleStatus
      : src.lifecycleStatus
        ? coerced.lifecycleStatus
        : 'draft';
  var phase = COMPETITION_PHASE[coerced.competitionPhaseCache]
    ? coerced.competitionPhaseCache
    : COMPETITION_PHASE[src.competitionPhaseCache]
      ? src.competitionPhaseCache
      : 'scheduled';

  return {
    schemaVersion: SCHEMA_VERSION,
    seriesId: seriesId,
    // 归属/审计；公开展示勿用；空串表示未知（不伪造）
    createdBy: resolveCreatedByField(src),
    lifecycleStatus: LIFECYCLE_STATUS[life] ? life : 'draft',
    // 缓存相位，非分站状态权威；由轮次/分站聚合推导后可写入（报名状态机留 4C-4）
    competitionPhaseCache: phase,
    hostMode: HOST_MODE[src.hostMode] ? src.hostMode : '',
    templateId: TEMPLATE_ID[src.templateId] ? src.templateId : '',
    seriesCompetitionType: asString(src.seriesCompetitionType, ''),
    seriesName: asString(src.seriesName, ''),
    // 副标题独立字段；默认空；不从 seriesName 拆分。
    // 消费边界：Detail Hero / 未来 4C-3 LIVE 卡 / 4C-4 报名卡双行展示；本批不改广场/Home/报名页。
    seriesSubtitle: sanitizeSeriesSubtitle(src.seriesSubtitle),
    organization: isPlainObject(src.organization)
      ? {
          organizationId: asString(src.organization.organizationId, ''),
          organizationName: asString(src.organization.organizationName, ''),
          organizationLogo: asString(src.organization.organizationLogo, '')
        }
      : { organizationId: '', organizationName: '', organizationLogo: '' },
    hostTeam: isPlainObject(src.hostTeam)
      ? {
          teamId: asString(src.hostTeam.teamId, ''),
          teamName: asString(src.hostTeam.teamName, ''),
          teamLogo: asString(src.hostTeam.teamLogo, '')
        }
      : { teamId: '', teamName: '', teamLogo: '' },
    participants: Array.isArray(src.participants) ? deepClone(src.participants) : [],
    scoringRule: createDefaultScoringRule(src.scoringRule),
    rounds: rounds,
    // 人工报名：draft 默认 closed / revision 0；禁止报名时间窗
    registrationState: src.registrationState === 'open' ? 'open' : 'closed',
    registrationRevision: normalizeRegistrationRevision(src.registrationRevision),
    roster: normalizeRosterList(src.roster, seriesId),
    eventInfoList: Array.isArray(src.eventInfoList) ? deepClone(src.eventInfoList) : [],
    // 首次进入 Step5 灌入默认赛事信息后为 true；缺失按 false
    eventInfoInitialized: src.eventInfoInitialized === true,
    // Hero 快照；空值时 Step5 首次初始化写入系统图，详情页只读 fallback 不写 storage
    bannerImageSnapshot: asString(src.bannerImageSnapshot, ''),
    partnerConfig: isPlainObject(src.partnerConfig) ? deepClone(src.partnerConfig) : null,
    visibility: src.visibility === 'private' ? 'private' : 'public',
    // public → 空串；private 保留已有合法串，不静默生成
    accessCode:
      src.visibility === 'private' ? asString(src.accessCode, '') : '',
    // registrationWindow 已删除；残留字段 normalize 忽略，不报错、不写回
    publishToken:
      src.publishToken != null && String(src.publishToken).trim() !== ''
        ? String(src.publishToken).trim()
        : seriesIds.generatePublishToken(),
    publishState: PUBLISH_STATE[src.publishState] ? src.publishState : 'idle',
    ruleVersion:
      asFiniteNumberOrNull(src.ruleVersion) != null
        ? Math.floor(Number(src.ruleVersion))
        : createDefaultScoringRule(src.scoringRule).ruleVersion,
    createdAt: asString(src.createdAt, ts),
    updatedAt: asString(src.updatedAt, ts),
    completedAt: asString(src.completedAt, ''),
    completedBy: asString(src.completedBy, ''),
    completionSource: COMPLETION_SOURCE[src.completionSource] ? src.completionSource : ''
  };
}

function normalizeRegistrationRevision(raw) {
  var n = asFiniteNumberOrNull(raw);
  if (n == null || n < 0) return 0;
  return Math.floor(n);
}

function normalizeRegistrationState(raw) {
  var s = asString(raw, '');
  if (s === 'open') return 'open';
  if (s === 'closed') return 'closed';
  // 非法字面保留给 validator；空缺省 closed
  if (s) return s;
  return 'closed';
}

/**
 * roster 条目 normalize：
 * - seriesId 缺失时可补父 Series ID；显式不一致保留非法值（不静默改写）
 * - 不静默修复冲突归属；不写入 participant 名称/Logo/kind
 * - playerId 为领域身份键（可由调用方从 userId 映射，但不假定全局恒等）
 */
function normalizeRosterEntry(raw, parentSeriesId) {
  var src = isPlainObject(raw) ? raw : {};
  var parentId = asString(parentSeriesId, '');
  var explicitSeriesId =
    src.seriesId != null && String(src.seriesId).trim() !== ''
      ? String(src.seriesId).trim()
      : '';
  var seriesId = explicitSeriesId || parentId;
  var statusRaw = src.registrationStatus != null ? String(src.registrationStatus).trim() : '';
  return {
    rosterEntryId: asString(src.rosterEntryId, ''),
    seriesId: seriesId,
    seriesParticipantId: asString(src.seriesParticipantId, ''),
    playerId: asString(src.playerId, ''),
    playerNameSnapshot: asString(src.playerNameSnapshot, ''),
    playerAvatarSnapshot: asString(src.playerAvatarSnapshot, ''),
    genderSnapshot: asString(src.genderSnapshot, ''),
    handicapSnapshot:
      src.handicapSnapshot != null && src.handicapSnapshot !== ''
        ? src.handicapSnapshot
        : '',
    floatCoefSnapshot:
      src.floatCoefSnapshot != null && src.floatCoefSnapshot !== ''
        ? src.floatCoefSnapshot
        : '',
    // 选手手机号快照（代报名手工/好友可选）；缺省空串，normalize 保留
    phoneSnapshot: asString(src.phoneSnapshot, ''),
    registrationStatus: statusRaw || 'registered',
    registrationSource: asString(src.registrationSource, '') || 'self',
    registeredByUserId: asString(src.registeredByUserId, ''),
    registeredByNameSnapshot: asString(src.registeredByNameSnapshot, ''),
    createdAt: asString(src.createdAt, ''),
    updatedAt: asString(src.updatedAt, ''),
    cancelledAt: asString(src.cancelledAt, '')
  };
}

function normalizeRosterList(rawList, parentSeriesId) {
  if (!Array.isArray(rawList)) return [];
  var parentId = asString(parentSeriesId, '');
  return rawList.map(function (item) {
    return normalizeRosterEntry(item, parentId);
  });
}

/**
 * 首次发布编排：draft closed/rev0 → open/rev1。
 * - 已 open：不改 revision
 * - closed 且 revision>0：视为明确关闭，不重开
 * - closed 且 revision===0：打开并 revision=1
 */
function applyFirstPublishRegistrationDefaults(series) {
  var s = isPlainObject(series) ? deepClone(series) : {};
  var state = normalizeRegistrationState(s.registrationState);
  var rev = normalizeRegistrationRevision(s.registrationRevision);
  s.registrationState = state === 'open' || state === 'closed' ? state : 'closed';
  s.registrationRevision = rev;
  if (s.registrationState === 'open') {
    return { series: s, changed: false };
  }
  if (rev > 0) {
    return { series: s, changed: false };
  }
  s.registrationState = 'open';
  s.registrationRevision = 1;
  return { series: s, changed: true };
}

/**
 * 新建参赛主体（工厂；可生成 seriesParticipantId）
 * - team：有 sourceTeamId → team:{id}；否则临时唯一 ID
 * - division：有 divisionId → division:{id}；否则临时唯一 ID（不得回退 sourceTeamId）
 * - 已有 seriesParticipantId 不得在后续获得正式 divisionId 时被本工厂悄悄替换（须显式传入）
 */
function createParticipant(partial) {
  var src = isPlainObject(partial) ? partial : {};
  var kind = src.kind === 'division' ? 'division' : 'team';
  var sourceTeamId = asString(src.sourceTeamId, '');
  var divisionId = asString(src.divisionId, '');
  var seriesParticipantId = '';
  if (src.seriesParticipantId != null && String(src.seriesParticipantId).trim() !== '') {
    seriesParticipantId = String(src.seriesParticipantId).trim();
  } else if (kind === 'team') {
    seriesParticipantId = sourceTeamId
      ? 'team:' + sourceTeamId
      : seriesIds.generateScopedId('team');
  } else {
    seriesParticipantId = divisionId
      ? 'division:' + divisionId
      : seriesIds.generateScopedId('division');
  }
  return {
    seriesParticipantId: seriesParticipantId,
    kind: kind,
    sourceTeamId: sourceTeamId,
    divisionId: divisionId,
    // 兼容旧字段；球队新建时调用方应同时写 full/short
    nameSnapshot: asString(src.nameSnapshot, ''),
    fullNameSnapshot: asString(src.fullNameSnapshot, ''),
    shortNameSnapshot: asString(src.shortNameSnapshot, ''),
    logoSnapshot: asString(src.logoSnapshot, ''),
    colorSnapshot: asString(src.colorSnapshot, '')
  };
}

/**
 * 新建标准化计分结果（工厂；可生成 entryId）
 * @param {object} partial
 * @returns {object}
 */
function createResultEntry(partial) {
  var src = isPlainObject(partial) ? partial : {};
  var entry = {
    entryId:
      src.entryId != null && String(src.entryId).trim() !== ''
        ? String(src.entryId).trim()
        : seriesIds.generateEntryId(),
    seriesId: asString(src.seriesId, ''),
    roundId: asString(src.roundId, ''),
    matchId: asString(src.matchId, ''),
    seriesParticipantId: asString(src.seriesParticipantId, ''),
    resultUnitType: RESULT_UNIT_TYPE[src.resultUnitType] ? src.resultUnitType : 'player',
    sourceEntityKey: asString(src.sourceEntityKey, ''),
    memberUserIds: Array.isArray(src.memberUserIds)
      ? src.memberUserIds.map(function (id) {
          return String(id || '').trim();
        }).filter(Boolean)
      : [],
    memberSnapshots: Array.isArray(src.memberSnapshots) ? deepClone(src.memberSnapshots) : [],
    gross: asFiniteNumberOrNull(src.gross),
    toPar: asFiniteNumberOrNull(src.toPar),
    net: asFiniteNumberOrNull(src.net),
    rankingValue: asFiniteNumberOrNull(src.rankingValue),
    resultStatus: RESULT_STATUS[src.resultStatus] ? src.resultStatus : 'MISSING',
    sourceRevision: asString(src.sourceRevision, ''),
    extractedAt: asString(src.extractedAt, nowIso())
  };
  if (entry.rankingValue == null && src.scoreBasis) {
    var resolved = resolveRankingValue(entry, src.scoreBasis);
    if (resolved.ok) entry.rankingValue = resolved.rankingValue;
  }
  return entry;
}

/**
 * normalizeRound：补非身份缺省；保留已有 roundId；缺失 roundId 不生成
 * @param {object} raw
 * @param {number} fallbackIndex
 * @returns {object}
 */
function normalizeRound(raw, fallbackIndex) {
  var src = isPlainObject(raw) ? raw : {};
  var idx =
    asFiniteNumberOrNull(src.index) != null
      ? Math.floor(Number(src.index))
      : Math.max(1, Math.floor(Number(fallbackIndex) || 1));
  var ts = nowIso();
  return {
    roundId: src.roundId != null ? String(src.roundId).trim() : '',
    index: idx,
    name:
      src.name != null && String(src.name).trim() !== ''
        ? String(src.name).trim()
        : 'ROUND ' + idx,
    roundStatus: normalizeEnumField(src.roundStatus, 'scheduled'),
    dateTime: asString(src.dateTime, ''),
    dateTimeUserEdited: asBool(src.dateTimeUserEdited, false),
    fee: asString(src.fee, ''),
    gameMode: asString(src.gameMode, ''),
    topN: asFiniteNumberOrNull(src.topN) != null ? Math.floor(Number(src.topN)) : 3,
    topNUserEdited: asBool(src.topNUserEdited, false),
    courseId: asString(src.courseId, ''),
    courseName: asString(src.courseName, ''),
    courseLocation: asString(src.courseLocation, ''),
    front9Course: src.front9Course != null ? deepClone(src.front9Course) : null,
    back9Course: src.back9Course != null ? deepClone(src.back9Course) : null,
    courseHalfText: asString(src.courseHalfText, ''),
    matchId:
      src.matchId != null && String(src.matchId).trim() !== ''
        ? String(src.matchId).trim()
        : null,
    createdAt: asString(src.createdAt, ts),
    updatedAt: asString(src.updatedAt, ts)
  };
}

function normalizeParticipant(raw) {
  var src = isPlainObject(raw) ? raw : {};
  var kind;
  if (src.kind === undefined || src.kind === null || src.kind === '') {
    kind = '';
  } else {
    kind = String(src.kind);
  }
  return {
    seriesParticipantId:
      src.seriesParticipantId != null ? String(src.seriesParticipantId).trim() : '',
    kind: kind,
    sourceTeamId: asString(src.sourceTeamId, ''),
    divisionId: asString(src.divisionId, ''),
    nameSnapshot: asString(src.nameSnapshot, ''),
    // 缺省保持空串；不从简称猜测全称、不回填球队库
    fullNameSnapshot: asString(src.fullNameSnapshot, ''),
    shortNameSnapshot: asString(src.shortNameSnapshot, ''),
    logoSnapshot: asString(src.logoSnapshot, ''),
    colorSnapshot: asString(src.colorSnapshot, '')
  };
}

/**
 * normalizeResultEntry：不生成 entryId
 * @param {object} raw
 * @returns {object}
 */
function normalizeResultEntry(raw) {
  var src = isPlainObject(raw) ? raw : {};
  return {
    entryId: src.entryId != null ? String(src.entryId).trim() : '',
    seriesId: asString(src.seriesId, ''),
    roundId: asString(src.roundId, ''),
    matchId: asString(src.matchId, ''),
    seriesParticipantId: asString(src.seriesParticipantId, ''),
    resultUnitType: normalizeEnumField(src.resultUnitType, ''),
    sourceEntityKey: asString(src.sourceEntityKey, ''),
    memberUserIds: Array.isArray(src.memberUserIds)
      ? src.memberUserIds.map(function (id) {
          return String(id || '').trim();
        }).filter(Boolean)
      : [],
    memberSnapshots: Array.isArray(src.memberSnapshots) ? deepClone(src.memberSnapshots) : [],
    gross: asFiniteNumberOrNull(src.gross),
    toPar: asFiniteNumberOrNull(src.toPar),
    net: asFiniteNumberOrNull(src.net),
    rankingValue: asFiniteNumberOrNull(src.rankingValue),
    resultStatus: normalizeEnumField(src.resultStatus, ''),
    sourceRevision: asString(src.sourceRevision, ''),
    extractedAt: asString(src.extractedAt, '')
  };
}

/**
 * normalizeSeries：补非身份缺省；不静默生成 seriesId / roundId / seriesParticipantId
 * @param {object} raw
 * @returns {object}
 */
function normalizeSeries(raw) {
  var src = isPlainObject(raw) ? raw : {};
  var ts = nowIso();
  var scoringRule = normalizeScoringRule(src.scoringRule);
  var rounds = Array.isArray(src.rounds)
    ? src.rounds.map(function (r, i) {
        return normalizeRound(r, i + 1);
      })
    : [];
  var participants = Array.isArray(src.participants)
    ? src.participants.map(normalizeParticipant)
    : [];

  var ruleVersionDefault =
    asFiniteNumberOrNull(scoringRule.ruleVersion) != null
      ? Math.floor(Number(scoringRule.ruleVersion))
      : 1;

  var coerced = coerceCompletionFields(src);

  return {
    schemaVersion:
      asFiniteNumberOrNull(src.schemaVersion) != null
        ? Math.floor(Number(src.schemaVersion))
        : SCHEMA_VERSION,
    seriesId: src.seriesId != null ? String(src.seriesId).trim() : '',
    // 保留已有非空 createdBy；缺失/空不伪造当前用户；不写出 creatorId/ownerUserId
    createdBy: resolveCreatedByField(src),
    lifecycleStatus: normalizeEnumField(
      coerced.lifecycleStatus || src.lifecycleStatus,
      'draft'
    ),
    competitionPhaseCache: normalizeEnumField(
      coerced.competitionPhaseCache || src.competitionPhaseCache,
      'scheduled'
    ),
    hostMode: asString(src.hostMode, ''),
    templateId: asString(src.templateId, ''),
    seriesCompetitionType: asString(src.seriesCompetitionType, ''),
    seriesName: asString(src.seriesName, ''),
    seriesSubtitle: sanitizeSeriesSubtitle(src.seriesSubtitle),
    organization: isPlainObject(src.organization)
      ? {
          organizationId: asString(src.organization.organizationId, ''),
          organizationName: asString(src.organization.organizationName, ''),
          organizationLogo: asString(src.organization.organizationLogo, '')
        }
      : { organizationId: '', organizationName: '', organizationLogo: '' },
    hostTeam: isPlainObject(src.hostTeam)
      ? {
          teamId: asString(src.hostTeam.teamId, ''),
          teamName: asString(src.hostTeam.teamName, ''),
          teamLogo: asString(src.hostTeam.teamLogo, '')
        }
      : { teamId: '', teamName: '', teamLogo: '' },
    participants: participants,
    scoringRule: scoringRule,
    rounds: rounds,
    registrationState: normalizeRegistrationState(src.registrationState),
    registrationRevision: normalizeRegistrationRevision(src.registrationRevision),
    roster: normalizeRosterList(src.roster, src.seriesId),
    eventInfoList: Array.isArray(src.eventInfoList) ? deepClone(src.eventInfoList) : [],
    eventInfoInitialized: src.eventInfoInitialized === true,
    bannerImageSnapshot: asString(src.bannerImageSnapshot, ''),
    partnerConfig: isPlainObject(src.partnerConfig) ? deepClone(src.partnerConfig) : null,
    visibility: normalizeEnumField(src.visibility, 'public'),
    // 保留已有 accessCode 字面值；visibility 规范化为 public 时清空
    accessCode: (function () {
      var vis = normalizeEnumField(src.visibility, 'public');
      if (vis !== 'private') return '';
      return src.accessCode != null ? String(src.accessCode) : '';
    })(),
    // registrationWindow 已删除；残留字段忽略，不报错、不写回
    publishToken: src.publishToken != null ? String(src.publishToken).trim() : '',
    publishState: normalizeEnumField(src.publishState, 'idle'),
    ruleVersion:
      asFiniteNumberOrNull(src.ruleVersion) != null
        ? Math.floor(Number(src.ruleVersion))
        : ruleVersionDefault,
    createdAt: asString(src.createdAt, ts),
    updatedAt: asString(src.updatedAt, ts),
    completedAt: asString(src.completedAt, ''),
    completedBy: asString(src.completedBy, ''),
    completionSource: COMPLETION_SOURCE[src.completionSource] ? src.completionSource : ''
  };
}

/**
 * 重排轮次 index，保留原 roundId
 * @param {object[]} rounds
 * @returns {object[]}
 */
function reindexRounds(rounds) {
  var list = Array.isArray(rounds) ? rounds : [];
  return list.map(function (r, i) {
    var next = normalizeRound(r, i + 1);
    next.index = i + 1;
    if (!next.name || /^ROUND\s+\d+$/i.test(next.name)) {
      next.name = 'ROUND ' + next.index;
    }
    next.updatedAt = nowIso();
    return next;
  });
}

module.exports = {
  SCHEMA_VERSION: SCHEMA_VERSION,
  CALCULATION_VERSION: CALCULATION_VERSION,
  LIFECYCLE_STATUS: LIFECYCLE_STATUS,
  COMPETITION_PHASE: COMPETITION_PHASE,
  ROUND_STATUS: ROUND_STATUS,
  HOST_MODE: HOST_MODE,
  TEMPLATE_ID: TEMPLATE_ID,
  SCORING_MODE: SCORING_MODE,
  SCORE_BASIS: SCORE_BASIS,
  RESULT_UNIT_TYPE: RESULT_UNIT_TYPE,
  RESULT_STATUS: RESULT_STATUS,
  GAME_MODE: GAME_MODE,
  PARTICIPANT_KIND: PARTICIPANT_KIND,
  PUBLISH_STATE: PUBLISH_STATE,
  REGISTRATION_STATE: REGISTRATION_STATE,
  COMPLETION_SOURCE: COMPLETION_SOURCE,
  ROSTER_REGISTRATION_STATUS: ROSTER_REGISTRATION_STATUS,
  nowIso: nowIso,
  deepClone: deepClone,
  resolveRankingValue: resolveRankingValue,
  createDefaultScoringRule: createDefaultScoringRule,
  normalizeScoringRule: normalizeScoringRule,
  normalizeEnumField: normalizeEnumField,
  createBlankRound: createBlankRound,
  createBlankRounds: createBlankRounds,
  resolveCreatedByField: resolveCreatedByField,
  createEmptySeriesDraft: createEmptySeriesDraft,
  sanitizeSeriesSubtitle: sanitizeSeriesSubtitle,
  createParticipant: createParticipant,
  createResultEntry: createResultEntry,
  normalizeRound: normalizeRound,
  normalizeParticipant: normalizeParticipant,
  normalizeResultEntry: normalizeResultEntry,
  normalizeSeries: normalizeSeries,
  normalizeRosterEntry: normalizeRosterEntry,
  normalizeRosterList: normalizeRosterList,
  normalizeRegistrationRevision: normalizeRegistrationRevision,
  normalizeRegistrationState: normalizeRegistrationState,
  applyFirstPublishRegistrationDefaults: applyFirstPublishRegistrationDefaults,
  reindexRounds: reindexRounds
};
