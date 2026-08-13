/**
 * Series 只读详情 ViewModel（纯函数）
 * - 不读 storage、不修改输入对象
 * - 分站状态口径对齐 detail._getMatchLifecycle + teamMatchStore.resolveTournamentCardStatusLabel
 */

var seriesStationMatch = require('../../../../utils/seriesStationMatch.js');
var bannerConfig = require('../../../../utils/bannerConfig.js');
var seriesStandingsViewModel = require('./seriesStandingsViewModel.js');
var seriesRegisterViewModel = require('./seriesRegisterViewModel.js');
var seriesRoundVisualState = require('./seriesRoundVisualState.js');

var SERIES_TABS = [
  { id: 'info', label: '赛事信息' },
  { id: 'standings', label: '总榜' },
  { id: 'register', label: '报名' },
  { id: 'schedule', label: '赛程' },
  { id: 'discussion', label: '讨论区' }
];

var TEMPLATE_LABELS = {
  inter_team_series: '队际系列赛',
  division_series: '分队系列赛',
  ryder: '莱德杯',
  individual_tour: '多轮个人比杆',
  custom: '自定义系列赛'
};

var HOST_MODE_LABELS = {
  team: '球队内部',
  organization: '组织型'
};

var SCORE_BASIS_LABELS = {
  gross: '总杆',
  net: '净杆',
  to_par: '相对标准杆'
};

var LIFECYCLE_LABELS = {
  draft: '草稿',
  published: '已发布',
  cancelled: '已取消',
  archived: '已归档'
};

var PHASE_CACHE_LABELS = {
  registration: '报名阶段（缓存）',
  scheduled: '赛程待开（缓存）',
  live: '进行中（缓存）',
  settlement_pending: '待结算（缓存）',
  completed: '已完赛（缓存）'
};

var ROUND_STATUS_LABELS = {
  scheduled: '已排期',
  registration_open: '报名中',
  ready: '待开球',
  live: '进行中',
  settlement_pending: '待结算',
  completed: '已完成',
  postponed: '已延期',
  cancelled: '已取消'
};

function asString(v) {
  return v == null ? '' : String(v);
}

function deepClone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

/**
 * 与 detail/index.js _getMatchLifecycle 同口径
 * 权威字段：match.status；finished|completed → completed
 */
function normalizeMatchLifecycle(match) {
  if (!match) {
    return {
      status: '',
      isRegistering: false,
      isOngoing: false,
      isCompleted: false
    };
  }
  var raw = asString(match.status).trim().toLowerCase();
  var status = '';
  if (raw === 'finished' || raw === 'completed') {
    status = 'completed';
  } else if (raw === 'registering' || raw === 'ongoing') {
    status = raw;
  }
  return {
    status: status,
    isRegistering: status === 'registering',
    isOngoing: status === 'ongoing',
    isCompleted: status === 'completed'
  };
}

/**
 * 与 teamMatchStore.resolveTournamentCardStatusLabel 同口径（该函数未导出）
 * ongoing → LIVE；registering → 报名中；其余 → statusLabel || 报名中
 * 赛程卡在 isCompleted 时补强为「已结束」，且不以 registrationStatus 参与判定
 */
function resolveStationStatusLabel(match) {
  var life = normalizeMatchLifecycle(match);
  if (life.isCompleted) {
    return '已结束';
  }
  var status = asString(match && match.status)
    .trim()
    .toLowerCase();
  if (status === 'ongoing') return 'LIVE';
  if (status === 'registering') return '报名中';
  return (match && match.statusLabel) || '报名中';
}

function resolveLifecycleAccess(series, options) {
  var opts = options || {};
  var preview = opts.preview === true || opts.preview === 1 || opts.preview === '1';
  var life = asString(series && series.lifecycleStatus).trim();
  if (life === 'published') {
    return {
      ok: true,
      mode: 'readonly',
      lifecycleStatus: life,
      lifecycleLabel: LIFECYCLE_LABELS.published,
      isDraftPreview: false,
      isHistorical: false
    };
  }
  if (life === 'cancelled' || life === 'archived') {
    return {
      ok: true,
      mode: 'historical_readonly',
      lifecycleStatus: life,
      lifecycleLabel: LIFECYCLE_LABELS[life] || life,
      isDraftPreview: false,
      isHistorical: true
    };
  }
  if (life === 'draft') {
    if (preview) {
      return {
        ok: true,
        mode: 'draft_preview',
        lifecycleStatus: life,
        lifecycleLabel: LIFECYCLE_LABELS.draft,
        isDraftPreview: true,
        isHistorical: false
      };
    }
    return {
      ok: false,
      reason: 'draft_requires_preview',
      message: '草稿仅可通过预览入口查看',
      lifecycleStatus: life
    };
  }
  return {
    ok: false,
    reason: 'lifecycle_not_allowed',
    message: '该系列赛当前状态不可查看',
    lifecycleStatus: life || 'unknown'
  };
}

function buildScoringRuleView(series) {
  var rule = (series && series.scoringRule) || {};
  var mode = asString(rule.mode).trim() || 'per_round_n';
  var basis = SCORE_BASIS_LABELS[rule.scoreBasis] || SCORE_BASIS_LABELS.gross;
  var allowRepeat = !!rule.allowRepeat;
  var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
  var perRoundTopN = [];
  if (mode === 'per_round_n') {
    perRoundTopN = rounds.map(function (r, idx) {
      return {
        roundId: asString(r && r.roundId).trim(),
        index: r && r.index != null ? Number(r.index) : idx + 1,
        name: asString(r && r.name).trim() || '第' + (idx + 1) + '轮',
        topN: r && r.topN != null ? r.topN : null
      };
    });
  }
  return {
    mode: mode,
    modeLabel: mode === 'global_m' ? '全局最好 M 名' : '每轮最好 N 名',
    globalM: mode === 'global_m' ? rule.globalM : null,
    perRoundTopN: perRoundTopN,
    allowRepeat: allowRepeat,
    allowRepeatLabel: allowRepeat ? '允许重复上场' : '不允许重复上场',
    scoreBasis: asString(rule.scoreBasis).trim() || 'gross',
    scoreBasisLabel: basis,
    summaryText:
      (mode === 'global_m'
        ? '全局最好 M=' + (rule.globalM != null ? rule.globalM : '—')
        : '每轮最好 N 名') +
      ' · ' +
      basis +
      ' · ' +
      (allowRepeat ? '允许重复上场' : '不允许重复上场')
  };
}

function buildVisibilityView(series) {
  var vis = series && series.visibility === 'private' ? 'private' : 'public';
  return {
    visibility: vis,
    visibilityLabel: vis === 'private' ? '私密' : '公开',
    accessProtected: vis === 'private',
    accessProtectLabel: vis === 'private' ? '访问码保护' : '',
    // 禁止泄露明文
    accessCode: ''
  };
}

function buildHostView(series) {
  var hostMode = asString(series && series.hostMode).trim();
  var org = (series && series.organization) || {};
  var host = (series && series.hostTeam) || {};
  return {
    hostMode: hostMode,
    hostModeLabel: HOST_MODE_LABELS[hostMode] || hostMode || '—',
    organizerName:
      hostMode === 'organization'
        ? asString(org.organizationName).trim() || '—'
        : asString(host.teamName).trim() || '—',
    organizerLogo:
      hostMode === 'organization'
        ? asString(org.organizationLogo).trim()
        : asString(host.teamLogo).trim()
  };
}

/**
 * 详情卡球队名：全称优先；旧草稿无全称时回退 nameSnapshot / 简称
 * 分队：继续只用 nameSnapshot
 */
function resolveParticipantDetailDisplayName(participant) {
  var p = participant || {};
  var kind = asString(p.kind).trim();
  if (kind === 'division') {
    return asString(p.nameSnapshot).trim() || '未命名分队';
  }
  return (
    asString(p.fullNameSnapshot).trim() ||
    asString(p.nameSnapshot).trim() ||
    asString(p.shortNameSnapshot).trim() ||
    '未命名球队'
  );
}

function buildParticipantsView(series) {
  var parts = Array.isArray(series && series.participants) ? series.participants : [];
  var hostMode = asString(series && series.hostMode).trim();
  var kindLabel = hostMode === 'team' ? '参赛分队' : '参赛球队';
  var unit = hostMode === 'team' ? '个' : '支';
  var count = parts.length;
  return {
    kindLabel: kindLabel,
    count: count,
    summaryText: count + ' ' + unit,
    items: parts.map(function (p) {
      return {
        seriesParticipantId: asString(p && p.seriesParticipantId).trim(),
        name: resolveParticipantDetailDisplayName(p),
        fullNameSnapshot: asString(p && p.fullNameSnapshot).trim(),
        shortNameSnapshot: asString(p && p.shortNameSnapshot).trim(),
        nameSnapshot: asString(p && p.nameSnapshot).trim(),
        logo: asString(p && p.logoSnapshot).trim(),
        kind: asString(p && p.kind).trim()
      };
    })
  };
}

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  if (month >= 1 && month <= 12) return 31;
  return 0;
}

/**
 * 本地时间字符串手工解析（真实日历校验；禁止 new Date(字符串)）
 * 支持：YYYY-MM-DD、YYYY-MM-DD HH:mm、YYYY-MM-DD HH:mm:ss（空格或 T）
 */
function parseLocalDateTimeParts(input) {
  var s = asString(input).trim();
  if (!s) return null;
  var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (!m) return null;
  var year = Number(m[1]);
  var month = Number(m[2]);
  var day = Number(m[3]);
  var hour = m[4] != null ? Number(m[4]) : 0;
  var minute = m[5] != null ? Number(m[5]) : 0;
  var second = m[6] != null ? Number(m[6]) : 0;
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || !Number.isFinite(second)) return null;
  if (month < 1 || month > 12) return null;
  var dim = daysInMonth(year, month);
  if (day < 1 || day > dim) return null;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;
  if (second < 0 || second > 59) return null;
  return {
    year: year,
    month: month,
    day: day,
    hour: hour,
    minute: minute,
    second: second,
    sortKey:
      year * 10000000000 +
      month * 100000000 +
      day * 1000000 +
      hour * 10000 +
      minute * 100 +
      second
  };
}

/** 对齐 teamMatchStore.formatClubDate / detail match.dateText：英文月缩写 + Mon/DD */
var CLUB_MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
];

function formatClubMonthDay(parts) {
  return CLUB_MONTH_LABELS[parts.month - 1] + '/' + pad2(parts.day);
}

/** 单日：与 formatClubDate 同款 Mon/DD/YYYY */
function formatClubDateFromParts(parts) {
  return formatClubMonthDay(parts) + '/' + parts.year;
}

/**
 * 系列赛 Hero 日期范围（仅日期，不展示开球时刻）
 * - 同日：队内赛 formatClubDate 口径 Mon/DD/YYYY
 * - 同年跨日/跨月：Mon/DD-Mon/DD  (YYYY)（年份前双空格）
 * - 跨年：详情页无现成范围口径 → Mon/DD (YYYY)-Mon/DD (YYYY)
 */
function formatSeriesDateRange(roundsInput) {
  var rounds = Array.isArray(roundsInput) ? roundsInput : [];
  var minP = null;
  var maxP = null;
  for (var i = 0; i < rounds.length; i++) {
    var p = parseLocalDateTimeParts(rounds[i] && rounds[i].dateTime);
    if (!p) continue;
    if (!minP || p.sortKey < minP.sortKey) minP = p;
    if (!maxP || p.sortKey > maxP.sortKey) maxP = p;
  }
  if (!minP || !maxP) return '比赛时间待定';
  var sameDay =
    minP.year === maxP.year && minP.month === maxP.month && minP.day === maxP.day;
  if (sameDay) return formatClubDateFromParts(minP);
  if (minP.year === maxP.year) {
    return (
      formatClubMonthDay(minP) +
      '-' +
      formatClubMonthDay(maxP) +
      '  (' +
      minP.year +
      ')'
    );
  }
  return (
    formatClubMonthDay(minP) +
    ' (' +
    minP.year +
    ')-' +
    formatClubMonthDay(maxP) +
    ' (' +
    maxP.year +
    ')'
  );
}

/**
 * Hero 周期字号档位：按最终 dateText 长度，不改格式化逻辑。
 * 短（默认 60rpx）：同日 Aug/11/2026、同年 Aug/11-Aug/13  (2026)、待定
 * 中（略缩小）：介于同年与跨年之间的长度
 * 长（再缩小）：跨年 Dec/31 (2026)-Jan/02 (2027)
 */
var HERO_DATE_RANGE_MD_MIN = 23;
var HERO_DATE_RANGE_LG_MIN = 27;

function resolveHeroDateRangeSizeClass(dateText) {
  var s = asString(dateText).trim();
  if (!s) return '';
  var n = s.length;
  if (n >= HERO_DATE_RANGE_LG_MIN) return 'event-date--lg';
  if (n >= HERO_DATE_RANGE_MD_MIN) return 'event-date--md';
  return '';
}

function normalizeCourseNameKey(name) {
  return asString(name)
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * 系列赛球场去重（混合规则；不修改 rounds）
 * - 双方都有 courseId：同 ID 合并，异 ID 保留（即使同名）
 * - 至少一方缺 courseId：规范化名称相同则合并
 * - 同 ID 名称快照差异：保留首次非空名称
 */
function buildSeriesCourseLines(roundsInput) {
  var rounds = Array.isArray(roundsInput) ? roundsInput : [];
  var lines = [];
  for (var i = 0; i < rounds.length; i++) {
    var r = rounds[i] || {};
    var name = asString(r.courseName).trim();
    if (!name) continue;
    var courseId = asString(r.courseId).trim();
    var normName = normalizeCourseNameKey(name);
    var mergeIdx = -1;
    for (var j = 0; j < lines.length; j++) {
      var e = lines[j];
      var bothHaveId = !!(courseId && e.courseId);
      if (bothHaveId) {
        if (courseId === e.courseId) {
          mergeIdx = j;
          break;
        }
        continue;
      }
      if (normName && e.normName && normName === e.normName) {
        mergeIdx = j;
        break;
      }
    }
    if (mergeIdx >= 0) {
      if (!lines[mergeIdx].courseId && courseId) {
        lines[mergeIdx].courseId = courseId;
      }
      // 名称保留首次非空，不再覆盖
      continue;
    }
    lines.push({
      courseId: courseId,
      name: name,
      normName: normName
    });
  }
  return {
    pending: lines.length === 0,
    lines: lines.map(function (x) {
      return x.name;
    })
  };
}

/**
 * 队内/队际创建页中文赛制口径 + 常见内部枚举映射。
 * 未知/非法值返回 ''（由调用方跳过，不伪造默认赛制）。
 */
var GAME_MODE_DISPLAY_LABELS = {
  个人比杆赛: '个人比杆赛',
  四人四球比杆赛: '四人四球比杆赛',
  最佳球位比杆赛: '最佳球位比杆赛',
  四人两球比杆赛: '四人两球比杆赛',
  最好成绩比杆赛: '四人四球比杆赛',
  个人比洞赛: '个人比洞赛',
  四人四球比洞赛: '四人四球比洞赛',
  最佳球位比洞赛: '最佳球位比洞赛',
  四人两球比洞赛: '四人两球比洞赛',
  最好成绩比洞赛: '四人四球比洞赛',
  individual_stroke: '个人比杆赛',
  fourball: '四人四球比杆赛',
  best_ball: '最佳球位比杆赛',
  'best-ball': '最佳球位比杆赛',
  foursomes: '四人两球比杆赛',
  foursome: '四人两球比杆赛',
  fourball_2ball: '四人两球比杆赛',
  'match-play': '个人比洞赛',
  match_play: '个人比洞赛'
};

function resolveSeriesGameModeLabel(rawMode) {
  var mode = asString(rawMode).trim();
  if (!mode) return '';
  if (GAME_MODE_DISPLAY_LABELS[mode]) return GAME_MODE_DISPLAY_LABELS[mode];
  return '';
}

/**
 * Hero meta chips：轮次赛制去重（首次出现序）+ 末尾固定「系列赛」
 */
function buildSeriesGameModeMetaChips(roundsInput) {
  var rounds = Array.isArray(roundsInput) ? roundsInput : [];
  var seen = Object.create(null);
  var chips = [];
  for (var i = 0; i < rounds.length; i++) {
    var label = resolveSeriesGameModeLabel(rounds[i] && rounds[i].gameMode);
    if (!label || seen[label]) continue;
    seen[label] = 1;
    chips.push({ text: label });
  }
  chips.push({ text: '系列赛' });
  return chips;
}

function firstCharFallback(name) {
  var s = asString(name).trim();
  return s ? s.charAt(0) : '';
}

/**
 * Hero 参赛主体展示：organization→全部球队 Logo；team→全部分队标签
 * 不截断、无 +N；布局步进由页面测量后 calculateLogoStackLayout 计算
 */
function buildHeroParticipantDisplay(series) {
  var hostMode = asString(series && series.hostMode).trim();
  var parts = Array.isArray(series && series.participants) ? series.participants : [];
  if (hostMode === 'team') {
    var divisionItems = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!p || asString(p.kind).trim() !== 'division') continue;
      divisionItems.push({
        participantId: asString(p.seriesParticipantId).trim(),
        name: asString(p.nameSnapshot).trim() || '未命名分队',
        color: asString(p.colorSnapshot).trim()
      });
    }
    return {
      mode: 'division_tags',
      label: '分队',
      teamItems: [],
      divisionItems: divisionItems,
      emptyText: divisionItems.length ? '' : '待创建分队'
    };
  }
  var teamItems = [];
  for (var j = 0; j < parts.length; j++) {
    var t = parts[j];
    if (!t || asString(t.kind).trim() !== 'team') continue;
    var displayName =
      asString(t.fullNameSnapshot).trim() ||
      asString(t.shortNameSnapshot).trim() ||
      asString(t.nameSnapshot).trim();
    teamItems.push({
      participantId: asString(t.seriesParticipantId).trim(),
      logo: asString(t.logoSnapshot).trim(),
      fallbackText: firstCharFallback(displayName) || '队'
    });
  }
  return {
    mode: 'team_logos',
    label: '球队',
    teamItems: teamItems,
    divisionItems: [],
    emptyText: teamItems.length ? '' : '待选择球队'
  };
}

/**
 * 左侧最高、向右递减；不反转 data 顺序，不用负 z-index。
 */
function resolveLogoStackZIndexes(count) {
  var n = Math.max(0, Math.floor(Number(count) || 0));
  var zIndexes = [];
  for (var i = 0; i < n; i++) {
    zIndexes.push(n - i);
  }
  return zIndexes;
}

/**
 * 球队 Logo 布局：装得下固定间距靠左；装不下才折叠铺满。
 * @param {{ containerWidth: number, logoDiameter: number, normalGap: number, count: number }} opts
 * @returns {{ mode: string, step: number, groupWidth: number, items: Array<{ left: number, zIndex: number }> }}
 */
function resolveTeamLogoLayout(opts) {
  var o = opts || {};
  var count = Math.max(0, Math.floor(Number(o.count) || 0));
  var containerWidth = Number(o.containerWidth);
  var logoDiameter = Number(o.logoDiameter);
  var normalGap = Number(o.normalGap);
  if (!Number.isFinite(containerWidth) || containerWidth < 0) containerWidth = 0;
  if (!Number.isFinite(logoDiameter) || logoDiameter <= 0) logoDiameter = 1;
  if (!Number.isFinite(normalGap) || normalGap < 0) normalGap = 0;

  var zIndexes = resolveLogoStackZIndexes(count);
  if (count === 0) {
    return { mode: 'normal', step: 0, groupWidth: 0, items: [] };
  }
  if (count === 1) {
    return {
      mode: 'normal',
      step: 0,
      groupWidth: logoDiameter,
      items: [{ left: 0, zIndex: zIndexes[0] }]
    };
  }

  var normalWidth = count * logoDiameter + (count - 1) * normalGap;
  var step;
  var mode;
  var groupWidth;
  if (!(containerWidth > 0) || normalWidth <= containerWidth) {
    step = logoDiameter + normalGap;
    mode = 'normal';
    groupWidth = normalWidth;
  } else {
    step = (containerWidth - logoDiameter) / (count - 1);
    if (!Number.isFinite(step) || step < 0) step = 0;
    mode = 'collapsed';
    groupWidth = containerWidth;
  }

  var items = [];
  for (var i = 0; i < count; i++) {
    items.push({ left: i * step, zIndex: zIndexes[i] });
  }
  return {
    mode: mode,
    step: step,
    groupWidth: groupWidth,
    items: items
  };
}

/**
 * 兼容页/旧自测：映射 availableWidth/logoSize → resolveTeamLogoLayout
 */
function calculateLogoStackLayout(opts) {
  var o = opts || {};
  var count = Math.max(0, Math.floor(Number(o.count) || 0));
  var resolved = resolveTeamLogoLayout({
    containerWidth: o.availableWidth,
    logoDiameter: o.logoSize,
    normalGap: o.normalGap,
    count: count
  });
  var positions = [];
  var zIndexes = [];
  for (var i = 0; i < resolved.items.length; i++) {
    positions.push(resolved.items[i].left);
    zIndexes.push(resolved.items[i].zIndex);
  }
  var mode = resolved.mode;
  if (count === 0) mode = 'empty';
  else if (count === 1) mode = 'single';
  return {
    count: count,
    step: resolved.step,
    positions: positions,
    stackWidth: resolved.groupWidth,
    mode: mode,
    zIndexes: zIndexes
  };
}

/**
 * 英雄区投影（对齐 detail hero 槽位；不展开参赛主体列表）
 */
function buildHeroView(series, access) {
  var host = buildHostView(series);
  var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
  var courses = buildSeriesCourseLines(rounds);
  var phase = asString(series && series.competitionPhaseCache).trim();
  var phaseLabel = PHASE_CACHE_LABELS[phase] || '';
  var participantDisplay = buildHeroParticipantDisplay(series);

  var chipText = access.lifecycleLabel || '已发布';
  var chipTone = 'default';
  if (access.isDraftPreview) {
    chipText = '草稿预览';
    chipTone = 'default';
  } else if (access.lifecycleStatus === 'cancelled' || access.lifecycleStatus === 'archived') {
    chipText = access.lifecycleLabel;
    chipTone = 'finished';
  } else if (phase === 'live') {
    chipText = 'LIVE';
    chipTone = 'live';
  } else if (phase === 'completed') {
    chipText = '已完赛';
    chipTone = 'finished';
  } else if (phaseLabel) {
    chipText =
      phase === 'registration'
        ? '报名中'
        : phase === 'scheduled'
          ? '赛程待开'
          : phase === 'settlement_pending'
            ? '待结算'
            : access.lifecycleLabel;
    chipTone = 'default';
  }

  var dateText = formatSeriesDateRange(rounds);

  // 信息卡：主办 → 球队/分队 → 球场（无报名、无阶段；状态在顶部 chip）
  var infoRows = [
    { label: '主办', value: host.organizerName, kind: 'text' },
    {
      label: participantDisplay.label,
      value: '',
      kind: participantDisplay.mode
    },
    {
      label: '球场',
      value: courses.pending ? '球场待定' : '',
      kind: 'courses',
      courseLines: courses.lines.slice()
    }
  ];

  return {
    hostMode: host.hostMode,
    bannerImage: resolveSeriesHeroBannerDisplay(series),
    logo: host.organizerLogo || '',
    chipText: chipText,
    chipTone: chipTone,
    dateText: dateText,
    dateRangeSizeClass: resolveHeroDateRangeSizeClass(dateText),
    titleMain: asString(series && series.seriesName).trim() || '系列赛',
    // 正式名称第二行（与 titleMain 同级样式）；空则不渲染、不占空高
    titleSub: asString(series && series.seriesSubtitle)
      .replace(/[\r\n\u2028\u2029]+/g, '')
      .trim(),
    metaChips: buildSeriesGameModeMetaChips(rounds),
    infoRows: infoRows,
    participantDisplay: participantDisplay,
    courseLines: courses.lines.slice(),
    coursePending: courses.pending,
    dividerText: host.hostMode === 'organization' ? 'ORG.' : '赛事组织',
    hasParticipantList: false,
    // Hero 不再展示参赛数量摘要
    participantSummaryOnly: ''
  };
}

/**
 * Hero 展示图：非空快照优先；空快照只读 fallback 系统图（不写 storage）
 * 当前无 Hero 清空入口，不做「用户主动清空」语义
 */
function resolveSeriesHeroBannerDisplay(series) {
  var snap = asString(series && series.bannerImageSnapshot).trim();
  if (snap) return snap;
  return bannerConfig.resolveMatchDetailBanner('');
}

function resolveThemeImageUrl(bright, dark, theme) {
  var b = asString(bright).trim();
  var d = asString(dark).trim();
  return theme === 'dark' ? d || b : b || d;
}

function buildEventInfoView(series, theme) {
  var list = Array.isArray(series && series.eventInfoList) ? series.eventInfoList : [];
  var t = theme === 'dark' ? 'dark' : 'bright';
  return list.map(function (item) {
    var title = asString(item && item.title).trim();
    var type = asString(item && item.type).trim();
    var content = asString(item && item.content);
    var bright = asString(item && item.brightImage);
    var dark = asString(item && item.darkImage);
    var legacy = asString(item && item.imageData);
    var isPhotoLive = title === '照片直播' || title === '交通说明';
    var trimmedContent = content.trim();
    var photoLiveValid =
      isPhotoLive &&
      /^https:\/\/.+/i.test(trimmedContent) &&
      !/^http:\/\//i.test(trimmedContent);
    var imageData =
      type === 'image' ? resolveThemeImageUrl(bright || legacy, dark || legacy, t) : '';
    return {
      id: item && item.id != null ? item.id : '',
      title: isPhotoLive ? '照片直播' : title,
      type: type,
      content: content,
      brightImage: bright,
      darkImage: dark,
      imageData: imageData,
      isPhotoLive: isPhotoLive,
      photoLiveValid: !!photoLiveValid,
      isImage: type === 'image' && !!imageData
    };
  }).filter(function (row) {
    // 对齐 detail：无效图文直播不展示，避免空串可点/复制
    if (row.isPhotoLive) return !!row.photoLiveValid;
    return true;
  });
}

/**
 * 单槽 PARTNER Logo → 主题 URL（兼容旧字符串 / logo|image 字段；绝不 String(object)）
 */
function resolvePartnerLogoDisplayUrl(item, theme) {
  if (typeof item === 'string') return asString(item).trim();
  if (!item || typeof item !== 'object') return '';
  // 仅接受字符串字段，避免 String(object) → "[object Object]"
  var bright = typeof item.bright === 'string' ? item.bright.trim() : '';
  var dark = typeof item.dark === 'string' ? item.dark.trim() : '';
  var legacyRaw = item.logo != null ? item.logo : item.image;
  var legacy = typeof legacyRaw === 'string' ? legacyRaw.trim() : '';
  var url = resolveThemeImageUrl(bright || legacy, dark || legacy, theme);
  if (!url || url === '[object Object]') return '';
  return url;
}

/**
 * 两列组行：镜像 partnerConfig.buildPartnerLogoRows（奇数右侧留空，不单列居中）
 * 入参须已是字符串 URL（主题已在 resolvePartnerLogoDisplayUrl 处理）
 */
function buildPartnerLogoRowsFromUrls(urls) {
  var list = [];
  var src = Array.isArray(urls) ? urls : [];
  for (var i = 0; i < src.length; i++) {
    var u = asString(src[i]).trim();
    if (u && u !== '[object Object]') list.push(u);
  }
  var rows = [];
  for (var j = 0; j < list.length; j += 2) {
    rows.push({
      left: { url: list[j] },
      right: { url: list[j + 1] || '' }
    });
  }
  return rows;
}

/**
 * PARTNER：有配置对象则展示区块；partnerLogoRows 两列组行；空数组不回填默认图
 */
function buildPartnerView(series, theme) {
  var empty = {
    configured: false,
    hasLogos: false,
    partnerTitle: '',
    partnerLogoRows: []
  };
  var cfg = series && series.partnerConfig;
  if (!cfg || typeof cfg !== 'object') return empty;
  var t = theme === 'dark' ? 'dark' : 'bright';
  var raw = Array.isArray(cfg.partnerLogos) ? cfg.partnerLogos : [];
  var urls = [];
  for (var i = 0; i < raw.length; i++) {
    var url = resolvePartnerLogoDisplayUrl(raw[i], t);
    if (url) urls.push(url);
  }
  var partnerLogoRows = buildPartnerLogoRowsFromUrls(urls);
  return {
    configured: true,
    hasLogos: partnerLogoRows.length > 0,
    partnerTitle: asString(cfg.partnerTitle).trim() || 'PARTNER',
    partnerLogoRows: partnerLogoRows
  };
}

/**
 * 广告图加载失败：仅替换对应 eventInfo 展示项 imageData；无 fallback / 已同址则不变
 * 不修改输入 list / Series
 * @returns {{ changed: boolean, list: object[] }}
 */
function applyEventSponsorImageError(list, itemId, getFallback) {
  var src = Array.isArray(list) ? list : [];
  var id = itemId != null ? String(itemId) : '';
  if (!id) return { changed: false, list: src.slice() };
  var idx = -1;
  for (var i = 0; i < src.length; i++) {
    if (src[i] && String(src[i].id) === id) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return { changed: false, list: src.slice() };
  var current = asString(src[idx].imageData).trim();
  var fallback =
    typeof getFallback === 'function' ? asString(getFallback(current)).trim() : '';
  if (!fallback || fallback === current) {
    return { changed: false, list: src.slice() };
  }
  var next = src.slice();
  next[idx] = Object.assign({}, src[idx], { imageData: fallback });
  return { changed: true, list: next };
}

/**
 * 图片加载失败：仅替换指定 row/side；无可用 fallback 或已是同址则不变（防循环）
 * 不修改输入 rows / Series
 * @returns {{ changed: boolean, rows: object[] }}
 */
function applyPartnerLogoError(rows, rowIndex, side, getFallback) {
  var srcRows = Array.isArray(rows) ? rows : [];
  if (side !== 'left' && side !== 'right') {
    return { changed: false, rows: srcRows.slice() };
  }
  var row = Number(rowIndex);
  if (!Number.isFinite(row) || row < 0 || row >= srcRows.length) {
    return { changed: false, rows: srcRows.slice() };
  }
  var rowData = srcRows[row];
  if (!rowData || !rowData[side] || !rowData[side].url) {
    return { changed: false, rows: srcRows.slice() };
  }
  var current = asString(rowData[side].url).trim();
  var fallback =
    typeof getFallback === 'function' ? asString(getFallback(current)).trim() : '';
  if (!fallback || fallback === current) {
    return { changed: false, rows: srcRows.slice() };
  }
  var nextRows = srcRows.slice();
  var nextRow = Object.assign({}, rowData);
  nextRow[side] = { url: fallback };
  nextRows[row] = nextRow;
  return { changed: true, rows: nextRows };
}

function formatFeeDisplay(fee) {
  var raw = fee == null ? '' : String(fee).trim();
  if (!raw) return '免费';
  return '¥' + raw;
}

/**
 * 严格分站准入：全部满足才可进入
 * deps: { getMatchById, getIndexByMatchId }
 */
function evaluateRoundStationGate(series, round, deps) {
  var d = deps || {};
  var getMatchById = typeof d.getMatchById === 'function' ? d.getMatchById : function () {
    return null;
  };
  var getIndexByMatchId =
    typeof d.getIndexByMatchId === 'function' ? d.getIndexByMatchId : function () {
      return null;
    };

  var seriesId = asString(series && series.seriesId).trim();
  var publishToken = asString(series && series.publishToken).trim();
  var roundId = asString(round && round.roundId).trim();
  var matchId = asString(round && round.matchId).trim();

  if (!matchId) {
    return {
      canEnterRound: false,
      blockReason: 'missing_match_id',
      blockMessage: '分站尚未生成',
      matchId: '',
      match: null,
      stationStatusLabel: '',
      navUrl: ''
    };
  }

  var match = getMatchById(matchId);
  if (!match) {
    return {
      canEnterRound: false,
      blockReason: 'match_missing',
      blockMessage: '分站数据缺失',
      matchId: matchId,
      match: null,
      stationStatusLabel: '',
      navUrl: ''
    };
  }

  if (!seriesStationMatch.isSeriesManagedMatch(match)) {
    return {
      canEnterRound: false,
      blockReason: 'not_series_managed',
      blockMessage: '非系列赛托管分站',
      matchId: matchId,
      match: match,
      stationStatusLabel: resolveStationStatusLabel(match),
      navUrl: ''
    };
  }

  var ctx = match.seriesContext || {};
  if (asString(ctx.seriesId).trim() !== seriesId) {
    return {
      canEnterRound: false,
      blockReason: 'context_series_id_conflict',
      blockMessage: '分站 seriesId 不一致',
      matchId: matchId,
      match: match,
      stationStatusLabel: resolveStationStatusLabel(match),
      navUrl: ''
    };
  }
  if (asString(ctx.roundId).trim() !== roundId) {
    return {
      canEnterRound: false,
      blockReason: 'context_round_id_conflict',
      blockMessage: '分站 roundId 不一致',
      matchId: matchId,
      match: match,
      stationStatusLabel: resolveStationStatusLabel(match),
      navUrl: ''
    };
  }
  if (asString(ctx.publishToken).trim() !== publishToken) {
    return {
      canEnterRound: false,
      blockReason: 'context_publish_token_conflict',
      blockMessage: '分站 publishToken 不一致',
      matchId: matchId,
      match: match,
      stationStatusLabel: resolveStationStatusLabel(match),
      navUrl: ''
    };
  }

  var link = getIndexByMatchId(matchId);
  if (!link) {
    return {
      canEnterRound: false,
      blockReason: 'index_missing',
      blockMessage: '分站索引缺失',
      matchId: matchId,
      match: match,
      stationStatusLabel: resolveStationStatusLabel(match),
      navUrl: ''
    };
  }
  if (
    asString(link.seriesId).trim() !== seriesId ||
    asString(link.roundId).trim() !== roundId
  ) {
    return {
      canEnterRound: false,
      blockReason: 'index_conflict',
      blockMessage: '分站索引冲突',
      matchId: matchId,
      match: match,
      stationStatusLabel: resolveStationStatusLabel(match),
      navUrl: ''
    };
  }

  return {
    canEnterRound: true,
    blockReason: '',
    blockMessage: '',
    matchId: matchId,
    match: match,
    stationStatusLabel: resolveStationStatusLabel(match),
    matchLifecycle: normalizeMatchLifecycle(match),
    navUrl:
      '/subpackages/tournament/pages/detail/index?matchId=' + encodeURIComponent(matchId)
  };
}

function buildRoundCard(series, round, deps, indexHint) {
  var r = round || {};
  var idx = r.index != null ? Number(r.index) : indexHint != null ? indexHint + 1 : 1;
  var scoringMode = asString(series && series.scoringRule && series.scoringRule.mode).trim();
  var gate = evaluateRoundStationGate(series, r, deps);
  var venue = [asString(r.courseName).trim(), asString(r.courseHalfText).trim()]
    .filter(Boolean)
    .join(' · ');
  return {
    roundId: asString(r.roundId).trim(),
    index: idx,
    roundLabel: 'ROUND ' + idx,
    name: asString(r.name).trim() || '第' + idx + '轮',
    dateTime: asString(r.dateTime).trim(),
    courseName: asString(r.courseName).trim(),
    courseHalfText: asString(r.courseHalfText).trim(),
    venueText: venue || '球场待定',
    gameMode: asString(r.gameMode).trim() || '—',
    feeText: formatFeeDisplay(r.fee),
    topN: scoringMode === 'per_round_n' ? r.topN : null,
    showTopN: scoringMode === 'per_round_n',
    roundStatus: asString(r.roundStatus).trim() || 'scheduled',
    roundStatusLabel: ROUND_STATUS_LABELS[asString(r.roundStatus).trim()] || '已排期',
    hasMatchId: !!asString(r.matchId).trim(),
    canEnterRound: gate.canEnterRound,
    blockReason: gate.blockReason,
    blockMessage: gate.blockMessage,
    stationStatusLabel: gate.stationStatusLabel,
    matchId: gate.matchId,
    matchStatus: asString(gate.match && gate.match.status).trim(),
    hasFormalGroups: seriesRoundVisualState.hasFormalNonEmptyGroups(gate.match),
    navUrl: gate.navUrl,
    enterButtonText: gate.canEnterRound ? '进入本轮' : ''
  };
}

function buildStandingsEmptyState(series) {
  // global_m 总榜由 standings VM + assembler 接管；此处仅保留非 global_m 提示
  var mode = asString(series && series.scoringRule && series.scoringRule.mode).trim();
  if (mode === 'global_m') {
    return {
      title: '',
      message: '',
      filterPlaceholder: false
    };
  }
  return {
    title: '每轮前 N 名总榜将在后续开放',
    message: '当前系列赛为每轮前 N 名模式，总榜将在对应批次接入',
    filterPlaceholder: false
  };
}

/**
 * 组装完整只读页面 VM
 * options: {
 *   preview, theme, getMatchById, getIndexByMatchId,
 *   standingsSelectedKey, standingsResult（展开态由页面 expandedStandingsTeamId 控制）
 *   registerActiveParticipantId（报名子 TAB；空则默认第一个主体）
 * }
 */
function buildSeriesDetailViewModel(seriesInput, options) {
  var opts = options || {};
  if (!seriesInput || typeof seriesInput !== 'object') {
    return {
      ok: false,
      reason: 'series_required',
      message: '无法加载系列赛'
    };
  }
  // 不修改输入：全程基于 clone
  var series = deepClone(seriesInput);
  var access = resolveLifecycleAccess(series, { preview: opts.preview });
  if (!access.ok) {
    return {
      ok: false,
      reason: access.reason,
      message: access.message,
      lifecycleStatus: access.lifecycleStatus
    };
  }

  var theme = opts.theme === 'dark' ? 'dark' : 'bright';
  var rounds = Array.isArray(series.rounds) ? series.rounds : [];
  var roundCards = rounds.map(function (r, i) {
    return buildRoundCard(series, r, opts, i);
  });
  var scoring = buildScoringRuleView(series);
  var visibility = buildVisibilityView(series);
  var host = buildHostView(series);
  var participants = buildParticipantsView(series);
  var hero = buildHeroView(series, access);
  var roundStates = seriesStandingsViewModel.projectRoundStatesFromRoundCards(roundCards);
  var standings = seriesStandingsViewModel.buildSeriesStandingsViewModel({
    series: series,
    selectedKey: opts.standingsSelectedKey || seriesStandingsViewModel.CUMULATIVE_KEY,
    roundStates: roundStates,
    // 生产默认空结果；页面不得注入演示成绩。自测可经 options 传入 fixture。
    // 展开态由页面 expandedStandingsTeamId 控制，不在此投影 isExpanded。
    standingsResult:
      opts.standingsResult != null
        ? opts.standingsResult
        : seriesStandingsViewModel.emptyStandingsResult()
  });

  return {
    ok: true,
    access: access,
    tabs: SERIES_TABS.slice(),
    seriesId: asString(series.seriesId).trim(),
    seriesName: asString(series.seriesName).trim() || '系列赛',
    templateId: asString(series.templateId).trim(),
    templateLabel: TEMPLATE_LABELS[asString(series.templateId).trim()] || asString(series.templateId).trim() || '—',
    lifecycleStatus: access.lifecycleStatus,
    lifecycleLabel: access.lifecycleLabel,
    isDraftPreview: access.isDraftPreview,
    isHistorical: access.isHistorical,
    competitionPhaseCache: asString(series.competitionPhaseCache).trim(),
    competitionPhaseLabel:
      PHASE_CACHE_LABELS[asString(series.competitionPhaseCache).trim()] || '',
    host: host,
    hero: hero,
    participants: participants,
    scoring: scoring,
    visibility: visibility,
    eventInfoList: buildEventInfoView(series, theme),
    partner: buildPartnerView(series, theme),
    roundCards: roundCards,
    standingsRoundStates: roundStates,
    standings: standings,
    standingsEmpty: buildStandingsEmptyState(series),
    register: seriesRegisterViewModel.buildSeriesRegisterViewModel({
      series: series,
      lifecycleAccess: access,
      activeParticipantId: opts.registerActiveParticipantId || ''
    })
  };
}

module.exports = {
  SERIES_TABS: SERIES_TABS,
  TEMPLATE_LABELS: TEMPLATE_LABELS,
  normalizeMatchLifecycle: normalizeMatchLifecycle,
  resolveStationStatusLabel: resolveStationStatusLabel,
  resolveLifecycleAccess: resolveLifecycleAccess,
  buildScoringRuleView: buildScoringRuleView,
  buildVisibilityView: buildVisibilityView,
  buildParticipantsView: buildParticipantsView,
  resolveParticipantDetailDisplayName: resolveParticipantDetailDisplayName,
  resolveSeriesGameModeLabel: resolveSeriesGameModeLabel,
  buildSeriesGameModeMetaChips: buildSeriesGameModeMetaChips,
  parseLocalDateTimeParts: parseLocalDateTimeParts,
  formatSeriesDateRange: formatSeriesDateRange,
  resolveHeroDateRangeSizeClass: resolveHeroDateRangeSizeClass,
  buildHeroParticipantDisplay: buildHeroParticipantDisplay,
  calculateLogoStackLayout: calculateLogoStackLayout,
  resolveTeamLogoLayout: resolveTeamLogoLayout,
  resolveLogoStackZIndexes: resolveLogoStackZIndexes,
  buildSeriesCourseLines: buildSeriesCourseLines,
  resolveSeriesHeroBannerDisplay: resolveSeriesHeroBannerDisplay,
  buildEventInfoView: buildEventInfoView,
  resolvePartnerLogoDisplayUrl: resolvePartnerLogoDisplayUrl,
  buildPartnerLogoRowsFromUrls: buildPartnerLogoRowsFromUrls,
  buildPartnerView: buildPartnerView,
  applyEventSponsorImageError: applyEventSponsorImageError,
  applyPartnerLogoError: applyPartnerLogoError,
  buildHeroView: buildHeroView,
  evaluateRoundStationGate: evaluateRoundStationGate,
  buildRoundCard: buildRoundCard,
  buildStandingsEmptyState: buildStandingsEmptyState,
  buildSeriesDetailViewModel: buildSeriesDetailViewModel,
  seriesStandingsViewModel: seriesStandingsViewModel,
  seriesRegisterViewModel: seriesRegisterViewModel
};
