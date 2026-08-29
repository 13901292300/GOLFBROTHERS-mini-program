/**
 * 系列赛总榜 ViewModel（队际赛领先榜投影）
 * - 纯函数：不读 storage / wx / 页面实例
 * - 只投影 standingsResult + roundStates；不自行计算 Top M
 * - TOTAL ← grossTotalValue；TO PAR ← toParValue（禁止用 gapValue 冒充）
 * - TOT 展开段内按累计总杆；单轮展开段内按 toPar（对齐队际领先榜）
 * - TOT 球队展开：各轮上场记录（occurrenceKey = roundId:playerId）；成绩行优先，阵容只补缺轮占位
 */

var seriesRoundVisualState = require('./seriesRoundVisualState.js');
var seriesLiveSession = require('./seriesLiveSessionProjection.js');
var seriesRoundInfoText = require('./seriesRoundInfoText.js');
var playerManage = require('../../../../utils/playerManage.js');
var seriesStandingsExpandIdentity = require('../../utils/seriesStandingsExpandIdentity.js');
var seriesGameModeLabel = require('../../../../utils/seriesGameModeLabel.js');
var seriesRoundDisplayLabels = require('../../../../utils/seriesRoundDisplayLabels.js');
var seriesRyderCup = require('../../../../utils/seriesRyderCup.js');

var CUMULATIVE_KEY = 'cumulative';
var TOTAL_KEY = 'total';

function isCumulativeStandingsKey(key) {
  var k = asString(key).trim();
  return k === CUMULATIVE_KEY || k === TOTAL_KEY;
}

var COUNTING = {
  counted: true,
  excluded: true,
  pending: true,
  'n/a': true
};

function asString(v) {
  return v == null ? '' : String(v);
}

/** TOT 展开行来源副信息：有轮次+组号 → `R1 · A组`；只有轮次 → `R1`。不编造组号。 */
function formatTotRowSubLabel(roundLabel, groupLabel) {
  var round = asString(roundLabel).trim();
  var group = asString(groupLabel).trim();
  if (round && group) return round + ' · ' + group;
  return round || group;
}

/**
 * 只读 scoringRule.globalM 作文案；不计算 Top M，不改成绩。
 * 合法 M：有限整数且 >= 1。
 */
function isStrokePlaySeries(series) {
  if (seriesRyderCup.isRyderCupSeries(series)) return false;
  var fmt = asString(
    series && (series.format || series.playFormat || series.gameFormat)
  )
    .trim()
    .toLowerCase();
  if (fmt === 'match' || fmt === 'match_play' || fmt === 'matchplay') return false;
  return true;
}

function resolveBestOfRoundsM(series) {
  var cfg = series && series.scoringConfig;
  var best = cfg && Number(cfg.bestOfRounds);
  if (Number.isFinite(best) && best >= 1) return Math.floor(best);
  var g = series && series.scoringRule && Number(series.scoringRule.globalM);
  if (Number.isFinite(g) && g >= 1) return Math.floor(g);
  return null;
}

function resolveTotDisplayGlobalM(series) {
  var fromBest = resolveBestOfRoundsM(series);
  if (fromBest != null) return fromBest;
  var rule = series && series.scoringRule && typeof series.scoringRule === 'object'
    ? series.scoringRule
    : null;
  if (!rule) return null;
  if (asString(rule.mode).trim() && asString(rule.mode).trim() !== 'global_m') {
    return null;
  }
  if (rule.globalM === undefined || rule.globalM === null || rule.globalM === '') {
    return null;
  }
  var n = Number(rule.globalM);
  if (!Number.isFinite(n)) return null;
  var m = Math.floor(n);
  if (m < 1) return null;
  return m;
}

function buildTotTopMDescription(series) {
  var m = resolveTotDisplayGlobalM(series);
  if (m == null) return '本榜按全队最好成绩进行排行';
  return '本榜取全队前 ' + m + ' 名最好成绩进行排行';
}

/**
 * 当前 selectedKey 对应 round.gameMode 的标准显示名。
 * TOT / 空 key / 未知赛制 → ''。
 */
function resolveRoundGameModeLabel(series, selectedKey) {
  var key = asString(selectedKey).trim();
  if (!key || isCumulativeStandingsKey(key)) return '';
  var rounds = series && Array.isArray(series.rounds) ? series.rounds : [];
  var raw = '';
  for (var i = 0; i < rounds.length; i++) {
    var r = rounds[i];
    if (!r || asString(r.roundId).trim() !== key) continue;
    raw = r.gameMode;
    break;
  }
  return seriesGameModeLabel.resolveSeriesGameModeLabel(raw);
}

/** @deprecated 兼容旧自测名；请用 resolveRoundGameModeLabel */
function resolvePerRoundNTeamGameModeLabel(series, selectedKey) {
  return resolveRoundGameModeLabel(series, selectedKey);
}

function pad2(n) {
  var num = Number(n);
  if (!Number.isFinite(num)) return '';
  return num < 10 ? '0' + num : String(num);
}

function parseRoundInfoDateParts(input) {
  return seriesRoundInfoText.parseRoundInfoDateParts(input);
}

function formatRoundInfoMonthDay(parts) {
  return seriesRoundInfoText.formatRoundInfoMonthDay(parts);
}

function formatRoundSelectorDate(dateTime) {
  return seriesRoundInfoText.formatRoundSelectorDate(dateTime);
}

function resolveStandingsRoundFormatName(round, stateRow) {
  return seriesRoundInfoText.resolveRoundSelectorFormatName(round, stateRow);
}

function findSeriesRoundById(series, roundId) {
  var rid = asString(roundId).trim();
  if (!rid) return null;
  var rounds = series && Array.isArray(series.rounds) ? series.rounds : [];
  for (var i = 0; i < rounds.length; i++) {
    if (asString(rounds[i] && rounds[i].roundId).trim() === rid) return rounds[i];
  }
  return null;
}

/** 默认轮名 ROUND 1 / ROUND1 / R1 / C1，不能当作赛制中间段 */
function isGenericRoundTitle(name, roundNum) {
  var s = asString(name).trim();
  if (!s) return true;
  if (/^ROUND\s*\d+$/i.test(s)) return true;
  if (/^R\d+$/i.test(s) || /^C\d+$/i.test(s)) return true;
  if (roundNum > 0 && s === '第' + roundNum + '轮') return true;
  return false;
}

/**
 * Rx · AUG 20 · 赛制。TOTAL 不得调用。
 */
function buildRoundSelectorDisplayText(round, stateRow, fallbackIndex) {
  return seriesRoundInfoText.buildSeriesRoundSelectorDisplayText(
    round,
    stateRow,
    fallbackIndex
  );
}

function buildStandingsRoundInfoText(selectedKey, roundStates, series) {
  return seriesRoundInfoText.buildSeriesRoundInfoText(
    selectedKey,
    roundStates,
    series
  );
}

function emptyStandingsResult() {
  return { participantRows: [] };
}

function formatDash() {
  return '-';
}

/**
 * 对齐 detail._formatLeaderboardDiff
 */
function formatToParDiff(diff) {
  if (diff == null || diff === '') return formatDash();
  var n = Number(diff);
  if (!Number.isFinite(n)) return formatDash();
  if (n > 0) return '+' + n;
  if (n === 0) return '0';
  return String(n);
}

/**
 * 对齐 detail._resolveLeaderboardTotalClass
 */
function resolveToParScoreClass(diff) {
  if (diff == null || diff === '') return 'score-even';
  var n = Number(diff);
  if (!Number.isFinite(n)) return 'score-even';
  if (n < 0) return 'score-under';
  if (n === 0) return 'score-even';
  return 'score-over';
}

function formatGrossTotal(value) {
  if (value == null || value === '') return formatDash();
  var n = Number(value);
  if (!Number.isFinite(n)) return formatDash();
  return String(n);
}

function formatPos(rank) {
  if (rank == null || rank === '') return formatDash();
  var n = Number(rank);
  if (!Number.isFinite(n) || n <= 0) return formatDash();
  return String(Math.floor(n));
}

/**
 * 从详情页已装配的 roundCards 投影轮次态（不二次读 store）
 * R-STATE：走 resolveSeriesRoundVisualState；分组用 card.hasFormalGroups
 */
function projectRoundStatesFromRoundCards(roundCards) {
  var cards = Array.isArray(roundCards) ? roundCards : [];
  return cards.map(function (card, i) {
    var c = card || {};
    var index = c.index != null && Number.isFinite(Number(c.index)) ? Number(c.index) : i + 1;
    var roundStatus = asString(c.roundStatus).trim() || 'scheduled';
    var stationStatusLabel = asString(c.stationStatusLabel).trim();
    var identityOk = c.stationIdentityOk !== false;
    if (!identityOk) {
      stationStatusLabel = '';
      if (roundStatus === 'live' || roundStatus === 'ongoing') {
        roundStatus = 'scheduled';
      }
    }
    var matchProxy = {
      status: identityOk
        ? asString(c.matchStatus).trim() ||
          inferMatchStatusFromStationLabel(stationStatusLabel)
        : '',
      groups: identityOk && c.hasFormalGroups
        ? [{ players: [{ userId: '__formal__' }] }]
        : []
    };
    var visual = seriesRoundVisualState.resolveSeriesRoundVisualState(
      { roundStatus: roundStatus },
      matchProxy
    );
    return {
      roundId: asString(c.roundId).trim(),
      index: index,
      label: 'R' + index,
      roundStatus: roundStatus,
      stationStatusLabel: stationStatusLabel,
      hasMatchId: !!c.hasMatchId,
      hasFormalGroups: !!c.hasFormalGroups,
      dateTime: asString(c.dateTime).trim(),
      courseName: asString(c.courseName).trim(),
      courseHalfText: asString(c.courseHalfText).trim(),
      courseId: asString(c.courseId).trim(),
      front9Course: c.front9Course,
      back9Course: c.back9Course,
      state: visual.state,
      stateClass: visual.stateClass,
      statusLabel: visual.statusLabel,
      statusToken: visual.state
    };
  });
}

function inferMatchStatusFromStationLabel(label) {
  var t = asString(label).trim();
  if (t === 'LIVE') return 'ongoing';
  if (t === '已结束') return 'finished';
  if (t === '已取消') return 'cancelled';
  return 'registering';
}

/** @deprecated 兼容旧自测；新代码请用 seriesRoundVisualState */
function resolveRoundStatusToken(roundStatus, stationStatusLabel) {
  var visual = seriesRoundVisualState.resolveSeriesRoundVisualState(
    { roundStatus: roundStatus },
    { status: inferMatchStatusFromStationLabel(stationStatusLabel), groups: [] }
  );
  return visual.state;
}

function resolveParticipantName(p) {
  if (!p || typeof p !== 'object') return '未命名';
  var shortName = asString(p.shortNameSnapshot).trim();
  if (shortName) return shortName;
  var fullName = asString(p.fullNameSnapshot).trim();
  if (fullName) return fullName;
  var name = asString(p.nameSnapshot).trim();
  if (name) return name;
  var id = asString(p.seriesParticipantId).trim();
  return id || '未命名';
}

function normalizeCounting(raw) {
  var c = asString(raw).trim();
  return COUNTING[c] ? c : 'n/a';
}

function resolveBestOfDisplayCount(series) {
  var g = series && series.scoringRule && Number(series.scoringRule.globalM);
  if (Number.isFinite(g) && g >= 1) return Math.floor(g);
  var cfg = series && series.scoringConfig;
  var best = cfg && Number(cfg.bestOfRounds);
  if (Number.isFinite(best) && best >= 1) return Math.floor(best);
  var rounds = series && Array.isArray(series.rounds) ? series.rounds : [];
  return rounds.length || 0;
}

function buildTotalSelectorDisplayText(series) {
  var bestOf = resolveBestOfDisplayCount(series);
  return 'TOTAL · 取全队前' + bestOf + '名最好成绩进行排序';
}

function buildTotalSelectorChip(isSelected, series) {
  return {
    key: TOTAL_KEY,
    label: 'TOTAL',
    displayText: buildTotalSelectorDisplayText(series),
    statusToken: 'none',
    state: 'none',
    stateClass: 'round-selector-state--tot',
    isLive: false,
    isSelected: !!isSelected,
    showLiveBadge: false,
    showSelectedCheck: !!isSelected
  };
}

/**
 * 拆分固定 TOT + 可横滚轮次（纯函数；不修改输入）
 * roundSelector 保留完整列表以兼容旧读法，禁止页面直接 splice
 * R-STATE：stateClass 只来自状态投影；isSelected 不改写 stateClass
 */
/**
 * 总榜默认选中：有 LIVE → 第一个 LIVE；无 LIVE 且有 TOTAL → TOTAL；否则首个未取消轮。
 */
function resolveFirstLiveRoundId(roundStates, series) {
  var list = Array.isArray(roundStates) ? roundStates : [];
  var i;
  for (i = 0; i < list.length; i++) {
    var row = list[i] || {};
    var rid = asString(row.roundId).trim();
    if (!rid) continue;
    if (seriesRoundVisualState.normalizeRoundVisualFromStateRow(row).state === 'live') {
      return rid;
    }
  }
  var rounds = series && Array.isArray(series.rounds) ? series.rounds : [];
  for (i = 0; i < rounds.length; i++) {
    var r = rounds[i] || {};
    var id = asString(r.roundId).trim();
    if (!id) continue;
    var st = asString(r.state || r.roundStatus || r.status).trim().toLowerCase();
    if (st === 'live') return id;
  }
  return '';
}

function resolveFirstAvailableRoundId(roundStates) {
  var list = Array.isArray(roundStates) ? roundStates : [];
  for (var i = 0; i < list.length; i++) {
    var row = list[i] || {};
    var rid = asString(row.roundId).trim();
    if (!rid) continue;
    if (seriesRoundVisualState.normalizeRoundVisualFromStateRow(row).state === 'cancelled') {
      continue;
    }
    return rid;
  }
  return '';
}

function resolveDefaultStandingsSelectedKey(roundStates, options) {
  var opts = options && typeof options === 'object' ? options : {};
  var includeTot = opts.includeTot === true;
  var liveId = resolveFirstLiveRoundId(roundStates, opts.series);
  if (liveId) return liveId;
  if (includeTot) return TOTAL_KEY;
  return resolveFirstAvailableRoundId(roundStates);
}

/**
 * per_round_n 默认 Rx：LIVE → 已分组即将开始 → 最近完成 → 首个未取消。
 * 多 LIVE 时沿用 roundStates 既有顺序，不另做时间比较。取消轮永不默认。
 */
function resolveDefaultPerRoundSelectedKey(roundStates) {
  return seriesLiveSession.resolveDefaultTargetRoundId(roundStates);
}

function rxFallbackLabel(round, state, orderIndex) {
  return seriesRoundDisplayLabels.rxFallbackLabel(round, state, orderIndex);
}

/**
 * 总榜显示别名：同日多场地 → Cx（按系列原顺序连续编号）；其余 Rx。
 * 不改 roundId / selectedKey。取消轮、无效日期/场地不参与判断与 C 编号。
 */
function buildStandingsRoundDisplayLabels(series, roundStates) {
  return seriesRoundDisplayLabels.buildSeriesRoundDisplayLabels(series, roundStates);
}

function resolveStandingsRoundDisplayLabel(series, roundStates, roundId) {
  var rid = asString(roundId).trim();
  if (!rid || isCumulativeStandingsKey(rid)) {
    return isCumulativeStandingsKey(rid) ? 'TOTAL' : '';
  }
  var map = buildStandingsRoundDisplayLabels(series, roundStates);
  return map[rid] || '';
}

function applyStandingsDisplayLabelsToStates(roundStates, displayLabels) {
  return seriesRoundDisplayLabels.applySeriesRoundDisplayLabelsToStates(
    roundStates,
    displayLabels
  );
}

function scoringRuleMode(series) {
  return asString(series && series.scoringRule && series.scoringRule.mode).trim();
}

/** TOTAL 仅 global_m；莱德杯 / per_round_n 不显示 */
function shouldIncludeTotalSelector(series) {
  if (seriesRyderCup.isRyderCupSeries(series)) return false;
  return scoringRuleMode(series) === 'global_m';
}

function buildRoundSelectorParts(roundStates, selectedKey, options) {
  var opts = options && typeof options === 'object' ? options : {};
  var series = opts.series && typeof opts.series === 'object' ? opts.series : null;
  var includeTot = shouldIncludeTotalSelector(series);
  var totInDropdown = includeTot;
  var displayLabels = opts.displayLabels && typeof opts.displayLabels === 'object' ? opts.displayLabels : null;
  var key = asString(selectedKey).trim();
  if (includeTot && key === CUMULATIVE_KEY) key = TOTAL_KEY;
  var roundSelectorItems = [];
  var list = Array.isArray(roundStates) ? roundStates : [];
  var valid = Object.create(null);
  if (includeTot) {
    valid[TOTAL_KEY] = true;
    valid[CUMULATIVE_KEY] = true;
  }
  for (var i = 0; i < list.length; i++) {
    var r = list[i] || {};
    var rid = asString(r.roundId).trim();
    if (!rid) continue;
    var visual = seriesRoundVisualState.normalizeRoundVisualFromStateRow(r);
    var orderIndex = r.index != null && Number.isFinite(Number(r.index)) ? Number(r.index) : i + 1;
    var label =
      (displayLabels && displayLabels[rid]) ||
      asString(r.label).trim() ||
      'R' + orderIndex;
    var seriesRound = findSeriesRoundById(series, rid);
    valid[rid] = true;
    roundSelectorItems.push({
      key: rid,
      label: label,
      displayText: buildRoundSelectorDisplayText(seriesRound, r, orderIndex),
      state: visual.state,
      stateClass: visual.stateClass,
      statusLabel: visual.statusLabel,
      statusToken: visual.state,
      isLive: visual.state === 'live',
      isSelected: key === rid,
      showLiveBadge: visual.state === 'live',
      showSelectedCheck: false
    });
  }
  var fallbackKey =
    scoringRuleMode(series) === 'per_round_n'
      ? resolveDefaultPerRoundSelectedKey(roundStates) ||
        resolveFirstAvailableRoundId(roundStates)
      : resolveDefaultStandingsSelectedKey(roundStates, {
          includeTot: includeTot,
          series: series
        });
  if (!fallbackKey && includeTot) fallbackKey = TOTAL_KEY;
  if (!fallbackKey) fallbackKey = resolveFirstAvailableRoundId(roundStates);
  var effectiveKey = valid[key] ? key : fallbackKey;
  if (includeTot && isCumulativeStandingsKey(effectiveKey)) effectiveKey = TOTAL_KEY;
  if (!includeTot && isCumulativeStandingsKey(effectiveKey)) {
    effectiveKey = fallbackKey || resolveFirstAvailableRoundId(roundStates);
  }
  var totSelected = includeTot && isCumulativeStandingsKey(effectiveKey);
  var totalChip = includeTot ? buildTotalSelectorChip(totSelected, series) : null;
  if (totInDropdown && totalChip) {
    roundSelectorItems.unshift(totalChip);
  }
  for (var k = 0; k < roundSelectorItems.length; k++) {
    var selected = roundSelectorItems[k].key === effectiveKey;
    roundSelectorItems[k].isSelected = selected;
    roundSelectorItems[k].showSelectedCheck = selected;
  }
  var roundSelector = totInDropdown
    ? roundSelectorItems.slice()
    : includeTot
      ? [totalChip].concat(roundSelectorItems)
      : roundSelectorItems.slice();
  return {
    totalSelector: totInDropdown ? null : totalChip,
    roundSelectorItems: roundSelectorItems,
    roundSelector: roundSelector,
    selectedKey: effectiveKey,
    includeTot: includeTot
  };
}

/** @deprecated 兼容：返回含 TOT 的完整列表 */
function buildRoundSelector(roundStates, selectedKey) {
  return buildRoundSelectorParts(roundStates, selectedKey).roundSelector;
}

function indexResultRows(standingsResult) {
  var map = Object.create(null);
  var order = [];
  var rows =
    standingsResult && Array.isArray(standingsResult.participantRows)
      ? standingsResult.participantRows
      : [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (!row || typeof row !== 'object') continue;
    var pid = asString(row.seriesParticipantId).trim();
    if (!pid || map[pid]) continue;
    map[pid] = row;
    order.push(pid);
  }
  return { map: map, order: order };
}

function readGrossTotalValue(resultRow) {
  if (!resultRow) return null;
  if (resultRow.grossTotalValue != null && resultRow.grossTotalValue !== '') {
    var g = Number(resultRow.grossTotalValue);
    return Number.isFinite(g) ? g : null;
  }
  return null;
}

function readToParValue(resultRow) {
  if (!resultRow) return null;
  if (resultRow.toParValue != null && resultRow.toParValue !== '') {
    var t = Number(resultRow.toParValue);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function participantHasDisplayableScore(resultRow) {
  if (!resultRow) return false;
  if (readGrossTotalValue(resultRow) != null) return true;
  if (readToParValue(resultRow) != null) return true;
  if (resultRow.rank != null && Number.isFinite(Number(resultRow.rank)) && Number(resultRow.rank) > 0) {
    return true;
  }
  var entries = Array.isArray(resultRow.allEntries) ? resultRow.allEntries : [];
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    if (!e) continue;
    if (e.toParValue != null && Number.isFinite(Number(e.toParValue))) return true;
    if (e.grossTotalValue != null && Number.isFinite(Number(e.grossTotalValue))) return true;
    var st = asString(e.resultStatus).trim();
    if (st && st !== 'MISSING' && st !== 'CANCELLED_ROUND') return true;
  }
  return false;
}

function resolveMainBoardParticipants(series, resultIndex) {
  var parts = Array.isArray(series && series.participants) ? series.participants : [];
  var byId = Object.create(null);
  var configOrder = [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    if (!p || typeof p !== 'object') continue;
    var pid = asString(p.seriesParticipantId).trim();
    if (!pid || byId[pid]) continue;
    byId[pid] = p;
    configOrder.push(pid);
  }
  var out = [];
  var seen = Object.create(null);
  if (resultIndex.order.length) {
    for (var r = 0; r < resultIndex.order.length; r++) {
      var rid = resultIndex.order[r];
      if (!byId[rid] || seen[rid]) continue;
      seen[rid] = true;
      out.push(byId[rid]);
    }
  }
  for (var c = 0; c < configOrder.length; c++) {
    var cid = configOrder[c];
    if (seen[cid]) continue;
    seen[cid] = true;
    out.push(byId[cid]);
  }
  return out;
}

function roundLabelForEntry(entry, roundStateById) {
  var roundId = asString(entry && entry.roundId).trim();
  var st = roundStateById && roundStateById[roundId];
  if (st && st.label) return st.label;
  var idx = entry && entry.roundIndex != null ? Number(entry.roundIndex) : null;
  if (idx != null && Number.isFinite(idx) && idx > 0) return 'R' + Math.floor(idx);
  return roundId ? 'R?' : '-';
}

function isPlayerResultUnit(entry) {
  var t = asString(entry && entry.resultUnitType).trim() || 'player';
  return t !== 'entity' && t !== 'pair';
}

function entryRealPlayerId(entry) {
  if (!entry || typeof entry !== 'object') return '';
  var pid = asString(entry.playerId || entry.userId).trim();
  if (pid) return pid;
  // assembler allEntries 会去掉 playerId，球员单元仍带唯一 memberUserIds
  if (!isPlayerResultUnit(entry)) return '';
  var members = Array.isArray(entry.memberUserIds) ? entry.memberUserIds : [];
  if (members.length === 1) {
    var mid = asString(members[0]).trim();
    if (mid) return mid;
  }
  return '';
}

function resolveRowGenderDisplay(entry) {
  var raw = entry && typeof entry === 'object' ? entry : {};
  var display = playerManage.getGenderDisplay({
    matchGender: raw.matchGender,
    gender: raw.gender
  });
  return {
    gender: display.gender || '',
    genderIcon: display.icon || '',
    genderClass: display.className || ''
  };
}

function isCancelledRound(roundId, roundStateById, roundMetaById) {
  var rid = asString(roundId).trim();
  if (!rid) return false;
  var meta = roundMetaById && roundMetaById[rid] ? roundMetaById[rid] : null;
  if (meta && meta.cancelled === true) return true;
  var st = roundStateById && roundStateById[rid] ? roundStateById[rid] : null;
  if (!st) return false;
  return (
    st.state === 'cancelled' ||
    st.statusToken === 'cancelled' ||
    st.roundStatus === 'cancelled'
  );
}

function buildOccurrenceKey(roundId, playerId) {
  var rid = asString(roundId).trim();
  var pid = asString(playerId).trim();
  if (!rid || !pid) return '';
  return rid + ':' + pid;
}

function collectCoveredOccurrenceKeys(entries) {
  var keys = Object.create(null);
  var list = Array.isArray(entries) ? entries : [];
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    if (!e) continue;
    var rid = asString(e.roundId).trim();
    if (!rid) continue;
    var pid = entryRealPlayerId(e);
    var key = buildOccurrenceKey(rid, pid);
    if (key) keys[key] = true;
    var members = Array.isArray(e.memberUserIds) ? e.memberUserIds : [];
    for (var m = 0; m < members.length; m++) {
      var mk = buildOccurrenceKey(rid, asString(members[m]).trim());
      if (mk) keys[mk] = true;
    }
  }
  return keys;
}

function pickLineupSeat(seats) {
  var list = Array.isArray(seats) ? seats : [];
  var best = list[0] || null;
  var bestScore = -1;
  for (var i = 0; i < list.length; i++) {
    var s = list[i];
    if (!s) continue;
    var n = 0;
    if (asString(s.unitName).trim()) n += 1;
    if (asString(s.avatar).trim()) n += 1;
    if (asString(s.gender).trim()) n += 1;
    if (asString(s.badgeTeamId).trim()) n += 1;
    if (n > bestScore) {
      best = s;
      bestScore = n;
    }
  }
  return best;
}

function indexLineupsByOccurrence(roundLineups, roundStateById, roundMetaById) {
  var map = Object.create(null);
  var list = Array.isArray(roundLineups) ? roundLineups : [];
  for (var i = 0; i < list.length; i++) {
    var seat = list[i];
    if (!seat) continue;
    var rid = asString(seat.roundId).trim();
    if (rid && isCancelledRound(rid, roundStateById, roundMetaById)) continue;
    var pid = entryRealPlayerId(seat);
    var key = buildOccurrenceKey(rid, pid);
    if (!key) continue;
    if (!map[key]) map[key] = { seats: [], playerId: pid, roundId: rid };
    map[key].seats.push(seat);
  }
  return map;
}

function pickSeatForScoredEntry(entry, lineupMap) {
  var rid = asString(entry && entry.roundId).trim();
  var pid = entryRealPlayerId(entry);
  var key = buildOccurrenceKey(rid, pid);
  if (key && lineupMap[key]) return pickLineupSeat(lineupMap[key].seats);
  var members = Array.isArray(entry && entry.memberUserIds) ? entry.memberUserIds : [];
  for (var i = 0; i < members.length; i++) {
    var mk = buildOccurrenceKey(rid, asString(members[i]).trim());
    if (mk && lineupMap[mk]) return pickLineupSeat(lineupMap[mk].seats);
  }
  return null;
}

function fillScoredIdentityFromLineup(entry, seat) {
  if (!entry || !seat || !isPlayerResultUnit(entry)) return entry;
  var out = Object.assign({}, entry);
  var pid = entryRealPlayerId(seat);
  if (!asString(out.playerId).trim()) out.playerId = pid;
  if (!asString(out.userId).trim()) out.userId = pid;
  if (!asString(out.avatar).trim()) out.avatar = asString(seat.avatar).trim();
  if (!asString(out.gender).trim()) out.gender = asString(seat.gender).trim();
  if (!asString(out.matchGender).trim()) out.matchGender = asString(seat.matchGender).trim();
  if (!asString(out.genderIcon).trim()) out.genderIcon = asString(seat.genderIcon).trim();
  if (!asString(out.genderClass).trim()) out.genderClass = asString(seat.genderClass).trim();
  if (!asString(out.badgeTeamId).trim()) out.badgeTeamId = asString(seat.badgeTeamId).trim();
  var country = asString(out.country).trim();
  if (!country || country === '—') {
    var sc = asString(seat.country).trim();
    if (sc) out.country = sc;
  }
  var age = asString(out.age).trim();
  if (!age || age === '—') {
    var sa = asString(seat.age).trim();
    if (sa) out.age = sa;
  }
  var hd = asString(out.handicapText).trim();
  if (!hd || hd === '--') {
    var sh = asString(seat.handicapText).trim();
    if (sh) out.handicapText = sh;
  }
  var fc = asString(out.floatCoefText).trim();
  if (!fc || fc === '--') {
    var sf = asString(seat.floatCoefText).trim();
    if (sf) out.floatCoefText = sf;
  }
  var name = asString(out.unitName).trim();
  if (!name || name === '计分单元') {
    var ln = asString(seat.unitName).trim();
    if (ln) out.unitName = ln;
  }
  if (!asString(out.matchId).trim()) out.matchId = asString(seat.matchId).trim();
  if (!asString(out.groupId).trim()) out.groupId = asString(seat.groupId).trim();
  if (!asString(out.groupLabel).trim()) out.groupLabel = asString(seat.groupLabel).trim();
  if (!asString(out.entityId).trim() && asString(seat.entityId).trim()) {
    out.entityId = asString(seat.entityId).trim();
    if (seat.isEntity === true) out.isEntity = true;
  }
  return out;
}

/** R 展开：有成绩行缺性别时，按同轮 playerId/userId 从阵容席位只读补齐 */
function fillMissingGenderFromSameRoundLineup(entries) {
  var list = Array.isArray(entries) ? entries : [];
  var donors = Object.create(null);
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    var rid = asString(e && e.roundId).trim();
    var pid = entryRealPlayerId(e);
    if (!rid || !pid) continue;
    if (asString(e.gender).trim() || asString(e.matchGender).trim()) {
      donors[rid + '::' + pid] = e;
    }
  }
  var out = [];
  for (var j = 0; j < list.length; j++) {
    var row = list[j];
    if (asString(row && row.gender).trim() || asString(row && row.matchGender).trim()) {
      out.push(row);
      continue;
    }
    var key =
      asString(row && row.roundId).trim() + '::' + entryRealPlayerId(row);
    var donor = donors[key];
    out.push(donor && donor !== row ? fillScoredIdentityFromLineup(row, donor) : row);
  }
  return out;
}

function findRosterEntry(series, playerId) {
  var pid = asString(playerId).trim();
  if (!pid) return null;
  var roster = Array.isArray(series && series.roster) ? series.roster : [];
  for (var i = 0; i < roster.length; i++) {
    var e = roster[i];
    if (!e || typeof e !== 'object') continue;
    var id = asString(e.playerId || e.userId || e.id).trim();
    if (id === pid) return e;
  }
  return null;
}

/** TOT 显示投影：lineup 已补仍缺性别时，roster 只读补齐；不按姓名推断 */
function fillTotExpandGenderDisplay(entries, series) {
  var list = Array.isArray(entries) ? entries : [];
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    if (!e || typeof e !== 'object') {
      out.push(e);
      continue;
    }
    if (asString(e.gender).trim() || asString(e.matchGender).trim()) {
      out.push(e);
      continue;
    }
    var roster = findRosterEntry(series, entryRealPlayerId(e));
    if (!roster) {
      out.push(e);
      continue;
    }
    var display = playerManage.getGenderDisplay(roster);
    if (!display.gender) {
      out.push(e);
      continue;
    }
    out.push(
      Object.assign({}, e, {
        gender: display.gender,
        genderIcon: display.icon || '',
        genderClass: display.className || ''
      })
    );
  }
  return out;
}

function buildTotLineupPlaceholder(base, playerId) {
  var rid = asString(base && base.roundId).trim();
  return {
    entryId: asString(base && base.entryId).trim() || 'tot_lineup__' + rid + '__' + playerId,
    roundId: rid,
    roundIndex: base && base.roundIndex != null ? base.roundIndex : null,
    resultUnitType: 'player',
    unitId: playerId,
    playerId: playerId,
    userId: playerId,
    unitName: asString(base && base.unitName).trim() || '球员',
    avatar: asString(base && base.avatar).trim(),
    gender: asString(base && base.gender).trim(),
    matchGender: asString(base && base.matchGender).trim(),
    genderIcon: asString(base && base.genderIcon).trim(),
    genderClass: asString(base && base.genderClass).trim(),
    country: asString(base && base.country).trim(),
    age: asString(base && base.age).trim(),
    handicapText: asString(base && base.handicapText).trim(),
    floatCoefText: asString(base && base.floatCoefText).trim(),
    badgeTeamId: asString(base && base.badgeTeamId).trim(),
    seriesParticipantId: asString(base && base.seriesParticipantId).trim(),
    groupId: asString(base && base.groupId).trim(),
    groupLabel: asString(base && base.groupLabel).trim(),
    matchId: asString(base && base.matchId).trim(),
    entityId: asString(base && base.entityId).trim(),
    isEntity: base && base.isEntity === true,
    rankingValue: null,
    grossTotalValue: null,
    toParValue: null,
    resultStatus: 'MISSING',
    thruLabel: '',
    counting: 'pending',
    fromLineup: true,
    memberUserIds: [playerId]
  };
}

/**
 * TOT 球队展开 = 各轮上场记录（allEntries ∪ roundLineups）
 * - occurrenceKey = roundId + ':' + (playerId || userId)
 * - 保留不同轮次的同一球员成绩行；阵容仅在缺该 occurrence 成绩时补占位
 * - 不把 lineup-only 写入 allEntries / Top M
 */
function mergeTotTeamExpandSource(
  allEntries,
  roundLineups,
  roundStateById,
  teamParticipantId,
  roundMetaById,
  errorSink
) {
  var scored = Array.isArray(allEntries) ? allEntries.slice() : [];
  var teamPid = asString(teamParticipantId).trim();
  var errors = Array.isArray(errorSink) ? errorSink : [];
  var lineupMap = indexLineupsByOccurrence(roundLineups, roundStateById, roundMetaById);
  var covered = collectCoveredOccurrenceKeys(scored);
  var out = [];
  for (var i = 0; i < scored.length; i++) {
    var e = scored[i];
    var seat = pickSeatForScoredEntry(e, lineupMap);
    if (teamPid && seat && asString(seat.seriesParticipantId).trim() &&
        asString(seat.seriesParticipantId).trim() !== teamPid) {
      seat = null;
    }
    var filled = fillScoredIdentityFromLineup(e, seat);
    if (!isPlayerResultUnit(filled) && seat) {
      filled = Object.assign({}, filled);
      if (!asString(filled.matchId).trim()) filled.matchId = asString(seat.matchId).trim();
      if (!asString(filled.groupId).trim()) filled.groupId = asString(seat.groupId).trim();
      if (!asString(filled.groupLabel).trim()) filled.groupLabel = asString(seat.groupLabel).trim();
      if (!asString(filled.entityId).trim()) filled.entityId = asString(filled.unitId).trim();
    }
    out.push(filled);
  }
  var occKeys = Object.keys(lineupMap);
  for (var p = 0; p < occKeys.length; p++) {
    var occKey = occKeys[p];
    if (covered[occKey]) continue;
    var info = lineupMap[occKey];
    var playerId = info && info.playerId ? info.playerId : '';
    var seats = info && Array.isArray(info.seats) ? info.seats : [];
    var affiliated = [];
    var sawMissing = false;
    var sawMismatch = false;
    for (var s = 0; s < seats.length; s++) {
      var one = seats[s];
      var aff = asString(one && one.seriesParticipantId).trim();
      if (!aff) {
        sawMissing = true;
        continue;
      }
      if (teamPid && aff !== teamPid) {
        sawMismatch = true;
        continue;
      }
      affiliated.push(one);
    }
    if (!affiliated.length) {
      if (sawMissing) errors.push({ playerId: playerId, reason: 'missing_affiliation' });
      else if (sawMismatch) errors.push({ playerId: playerId, reason: 'affiliation_mismatch' });
      continue;
    }
    var base = pickLineupSeat(affiliated);
    if (!base || !playerId) continue;
    out.push(buildTotLineupPlaceholder(base, playerId));
  }
  return out;
}

function resolveStandingsScorecardRoundId(player, selectedKey) {
  var rowRound = asString(player && player.roundId).trim();
  var selected = asString(selectedKey).trim();
  if (selected && !isCumulativeStandingsKey(selected)) {
    if (rowRound && rowRound !== selected) return '';
    return rowRound || selected;
  }
  return rowRound;
}

function nextStandingsOpenKey(currentKey, tapKey) {
  var cur = asString(currentKey).trim();
  var tap = asString(tapKey).trim();
  if (!tap) return '';
  if (cur && cur === tap) return '';
  return tap;
}

function buildRoundStateById(roundStates) {
  var map = Object.create(null);
  var list = Array.isArray(roundStates) ? roundStates : [];
  for (var i = 0; i < list.length; i++) {
    var r = list[i];
    if (!r) continue;
    var id = asString(r.roundId).trim();
    if (!id) continue;
    map[id] = r;
  }
  return map;
}

function resolveExpandEmptyHint(selectedKey, roundStateById, roundMetaById) {
  if (isCumulativeStandingsKey(selectedKey)) {
    return '暂无累计成绩';
  }
  var st = roundStateById[selectedKey];
  var meta = roundMetaById && roundMetaById[selectedKey] ? roundMetaById[selectedKey] : null;
  if (!st && !meta) return '本轮暂无有效成绩';
  if (
    (st && (st.state === 'cancelled' || st.statusToken === 'cancelled')) ||
    (meta && meta.cancelled)
  ) {
    return '本轮已取消，不计入总榜';
  }
  var hasGroups =
    meta && typeof meta.hasFormalGroups === 'boolean'
      ? meta.hasFormalGroups
      : st && st.hasFormalGroups === true;
  if (!hasGroups) {
    return '本轮尚未分组';
  }
  return '本轮暂无该队球员';
}

function entryHasRealScore(entry) {
  if (!entry) return false;
  if (entry.toParValue != null && Number.isFinite(Number(entry.toParValue))) return true;
  if (entry.grossTotalValue != null && Number.isFinite(Number(entry.grossTotalValue))) {
    return true;
  }
  var st = asString(entry.resultStatus).trim();
  return st === 'OK';
}

function readEntryToPar(entry) {
  if (!entry) return null;
  if (entry.toParValue != null && entry.toParValue !== '') {
    var t = Number(entry.toParValue);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function readEntryGross(entry) {
  if (!entry) return null;
  if (entry.grossTotalValue != null && entry.grossTotalValue !== '') {
    var g = Number(entry.grossTotalValue);
    return Number.isFinite(g) ? g : null;
  }
  return null;
}

/**
 * 投影展开 players；对齐队际赛一级展开行字段
 * - TOT：allEntries ∪ roundLineups（成绩覆盖阵容占位；lineup-only 显示 —）
 * - R：roundLineups（阵容⊕成绩合并行）
 * 计入线：仅当存在真实 counted + excluded/pending 选优结果时展示
 */
function parseRoundInfoClock(input) {
  var s = asString(input).trim();
  if (!s) return '';
  var m = /(?:^|[ T])(\d{2}):(\d{2})(?::\d{2})?(?:\s|$)/.exec(' ' + s);
  if (!m) return '';
  var hh = Number(m[1]);
  var mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return '';
  }
  return pad2(hh) + ':' + pad2(mm);
}

function occurrenceRoundSeqLabel(round, series, roundId) {
  var mapped = resolveStandingsRoundDisplayLabel(series, null, roundId);
  if (mapped && mapped !== 'TOT' && mapped !== 'TOTAL') return mapped;
  var idx = round && round.index != null ? Number(round.index) : null;
  if (idx != null && Number.isFinite(idx) && idx > 0) return 'R' + Math.floor(idx);
  var rid = asString(roundId).trim();
  var rounds = series && Array.isArray(series.rounds) ? series.rounds : [];
  for (var i = 0; i < rounds.length; i++) {
    if (asString(rounds[i] && rounds[i].roundId).trim() === rid) return 'R' + (i + 1);
  }
  return '';
}

function resolveOccurrenceTeeSource(match, round) {
  var fromMatch =
    asString(match && match.teeTime).trim() || asString(match && match.teeTimeText).trim();
  if (fromMatch) return fromMatch;
  return asString(round && round.dateTime).trim();
}

/**
 * TOT 有真实逐洞卡时的标题：R1 · AUG 13 08:30 · 球场
 * 只读该 occurrence 的 round/match，不读选择器当前轮。
 */
function buildTotOccurrenceScorecardTitle(input) {
  var src = input && typeof input === 'object' ? input : {};
  var roundLabel = occurrenceRoundSeqLabel(src.round, src.series, src.roundId);
  var teeSrc = resolveOccurrenceTeeSource(src.match, src.round);
  var dateText = formatRoundInfoMonthDay(parseRoundInfoDateParts(teeSrc));
  var timeText = parseRoundInfoClock(teeSrc);
  var dateTimeText =
    dateText && timeText ? dateText + ' ' + timeText : dateText || timeText || '';
  var courseTitle = asString(src.courseTitle).trim();
  return [roundLabel, dateTimeText, courseTitle].filter(Boolean).join(' · ');
}

function projectExpandPlayers(entries, selectedKey, roundStateById, roundMetaById, allowRepeat, errorSink) {
  var source = Array.isArray(entries) ? entries : [];
  var filtered = [];
  for (var i = 0; i < source.length; i++) {
    var e = source[i];
    if (!e || typeof e !== 'object') continue;
    if (!isCumulativeStandingsKey(selectedKey)) {
      if (asString(e.roundId).trim() !== selectedKey) continue;
    }
    filtered.push(e);
  }

  var indexed = filtered.map(function (e, idx) {
    return { e: e, idx: idx };
  });
  var sortByGross = isCumulativeStandingsKey(selectedKey);
  // 展示序：counted → pending → excluded（对齐 PK 计入段在上）；
  // TOT 段内按累计总杆；单轮段内按 toPar。不改写 counting，不形成 Top M。
  function countingTier(c) {
    if (c === 'counted') return 0;
    if (c === 'pending') return 1;
    if (c === 'excluded') return 2;
    return 3;
  }
  indexed.sort(function (a, b) {
    var ca = normalizeCounting(a.e.counting);
    var cb = normalizeCounting(b.e.counting);
    var tierDiff = countingTier(ca) - countingTier(cb);
    if (tierDiff !== 0) return tierDiff;
    if (sortByGross) {
      var ga = readEntryGross(a.e);
      var gb = readEntryGross(b.e);
      if (ga != null && gb != null && ga !== gb) return ga - gb;
      if (ga != null && gb == null) return -1;
      if (ga == null && gb != null) return 1;
    } else {
      var ta = readEntryToPar(a.e);
      var tb = readEntryToPar(b.e);
      if (ta != null && tb != null && ta !== tb) return ta - tb;
      if (ta != null && tb == null) return -1;
      if (ta == null && tb != null) return 1;
    }
    return a.idx - b.idx;
  });

  var showRoundTag = isCumulativeStandingsKey(selectedKey) && allowRepeat === true;
  var roundMeta =
    !isCumulativeStandingsKey(selectedKey) && roundMetaById
      ? roundMetaById[selectedKey]
      : null;
  var roundUnstarted =
    !isCumulativeStandingsKey(selectedKey) &&
    !!roundMeta &&
    roundMeta.stationStarted !== true &&
    roundMeta.hasFormalGroups === true;

  var players = [];
  var sawCounted = false;
  var scoringPlayersCount = 0;
  var dividerSet = false;

  for (var j = 0; j < indexed.length; j++) {
    var entry = indexed[j].e;
    var counting = normalizeCounting(entry.counting);
    var hasScore = entryHasRealScore(entry);
    var isCounting = counting === 'counted' && hasScore;
    if (isCounting) {
      sawCounted = true;
      if (!dividerSet) scoringPlayersCount = j + 1;
    } else if (
      !dividerSet &&
      sawCounted &&
      (counting === 'excluded' || counting === 'pending')
    ) {
      scoringPlayersCount = j;
      dividerSet = true;
    }

    var toPar = hasScore ? readEntryToPar(entry) : null;
    var thruRaw = hasScore ? asString(entry.thruLabel).trim() : '';
    // 未开赛 / 无真实成绩：不伪造成绩与 POS 排名
    var showRankPos = hasScore && (counting === 'counted' || counting === 'excluded');
    // 未开赛提示放在面板级 expandStatusHint，避免每行重复
    var pendingLabel = '';
    if (counting === 'pending' && hasScore) {
      pendingLabel = '计入待定';
    }

    var resultUnitType = asString(entry.resultUnitType).trim() || 'player';
    var isEntity = entry.isEntity === true || resultUnitType === 'entity' || resultUnitType === 'pair';
    var members = Array.isArray(entry.memberUserIds) ? entry.memberUserIds : [];
    var realPlayerId = asString(entry.playerId || entry.userId).trim();
    if (!realPlayerId && resultUnitType !== 'entity' && resultUnitType !== 'pair') {
      if (members.length === 1) realPlayerId = asString(members[0]).trim();
    }
    if (!realPlayerId && (resultUnitType === 'entity' || resultUnitType === 'pair') && members.length) {
      realPlayerId = asString(members[0]).trim();
    }
    var entityId = asString(entry.entityId).trim();
    if (!entityId && (resultUnitType === 'entity' || resultUnitType === 'pair')) {
      entityId = asString(entry.unitId).trim();
    }
    if (realPlayerId && entityId && realPlayerId === entityId) realPlayerId = '';
    var roundId = asString(entry.roundId).trim();
    var roundLabel = roundLabelForEntry(entry, roundStateById);
    var groupId = asString(entry.groupId).trim();
    var groupLabel = asString(entry.groupLabel).trim();
    var stationMatchId = asString(entry.matchId).trim();
    var occurrenceKey = buildOccurrenceKey(roundId, realPlayerId);
    if (!occurrenceKey && entityId) occurrenceKey = buildOccurrenceKey(roundId, entityId);
    var playerId = realPlayerId;
    if (!playerId && resultUnitType !== 'entity' && resultUnitType !== 'pair') {
      playerId = asString(entry.unitId).trim();
    }
    // TOT/R：有轮次上下文且具备真实球员或组合 ID 即可打开该轮详情
    var canOpenScorecard = !!roundId && (!!playerId || !!entityId);
    var scorecardKey =
      isCumulativeStandingsKey(selectedKey)
        ? occurrenceKey || asString(entry.entryId).trim() || 'entry-' + j
        : asString(entry.entryId).trim() || occurrenceKey || 'entry-' + j;

    var genderPack = resolveRowGenderDisplay(entry);
    var isTot = isCumulativeStandingsKey(selectedKey);
    var subLabel = isTot ? formatTotRowSubLabel(roundLabel, groupLabel) : '';
    if (
      isTot &&
      hasScore &&
      isPlayerResultUnit(entry) &&
      !groupId
    ) {
      var sink = Array.isArray(errorSink) ? errorSink : [];
      sink.push({
        playerId: playerId,
        roundId: roundId,
        matchId: stationMatchId,
        reason: 'missing_group'
      });
    }
    players.push({
      entryId: asString(entry.entryId).trim() || 'entry-' + j,
      scorecardKey: scorecardKey,
      occurrenceKey: occurrenceKey,
      pos: showRankPos ? String(j + 1) : formatDash(),
      name: asString(entry.unitName).trim() || '计分单元',
      nickname: asString(entry.unitName).trim() || '计分单元',
      avatar: asString(entry.avatar).trim(),
      gender: genderPack.gender,
      genderIcon: genderPack.genderIcon,
      genderClass: genderPack.genderClass,
      country: asString(entry.country).trim() || '—',
      age: asString(entry.age).trim() || '—',
      handicapText: asString(entry.handicapText).trim() || '--',
      floatCoefText: asString(entry.floatCoefText).trim() || '--',
      badgeTeamId: asString(entry.badgeTeamId).trim(),
      resultUnitType: resultUnitType,
      unitId: asString(entry.unitId).trim(),
      playerId: playerId,
      userId: playerId,
      entityId: entityId,
      isEntity: isEntity,
      memberUserIds: members.slice(),
      groupId: groupId,
      groupLabel: groupLabel,
      matchId: stationMatchId,
      stationMatchId: stationMatchId,
      roundId: roundId,
      roundIndex: entry.roundIndex != null ? entry.roundIndex : null,
      roundLabel: roundLabel,
      subLabel: subLabel,
      showRoundTag: showRoundTag,
      fromLineup: entry.fromLineup === true,
      thru: thruRaw || formatDash(),
      // TO PAR 仅消费真实 toParValue；禁止把 0/E 塞入无成绩行
      scoreStr: toPar != null ? formatToParDiff(toPar) : formatDash(),
      scoreClass: toPar != null ? resolveToParScoreClass(toPar) : 'score-even',
      toParValue: toPar,
      resultStatus: asString(entry.resultStatus).trim() || 'MISSING',
      counting: counting,
      isCounting: isCounting,
      isNonCounting: counting === 'excluded' || counting === 'pending',
      pendingLabel: pendingLabel,
      canOpenScorecard: canOpenScorecard,
      hasScore: hasScore
    });
  }

  // 计入分隔线：必须存在真实选优 counted 段，且其后有 non-counting
  if (!sawCounted || !players.some(function (p) {
    return p.isNonCounting;
  })) {
    scoringPlayersCount = 0;
  }

  var expandStatusHint = '';
  if (roundUnstarted && players.length) {
    expandStatusHint = '已分组 · 等待开赛';
  }

  return {
    players: players,
    scoringPlayersCount: scoringPlayersCount,
    expandStatusHint: expandStatusHint,
    expandEmptyHint: players.length
      ? ''
      : resolveExpandEmptyHint(selectedKey, roundStateById, roundMetaById)
  };
}

function resolveRoundChipLabel(roundStates, roundId, displayLabels) {
  var rid = asString(roundId).trim();
  if (displayLabels && displayLabels[rid]) return displayLabels[rid];
  var list = Array.isArray(roundStates) ? roundStates : [];
  for (var i = 0; i < list.length; i++) {
    var r = list[i] || {};
    if (asString(r.roundId).trim() !== rid) continue;
    return asString(r.label).trim() || 'R' + (r.index != null ? r.index : i + 1);
  }
  return rid;
}

function sumEntryToParList(entries) {
  var list = Array.isArray(entries) ? entries : [];
  var sum = 0;
  var has = false;
  for (var i = 0; i < list.length; i++) {
    var t = readEntryToPar(list[i]);
    if (t == null) continue;
    sum += t;
    has = true;
  }
  return has ? sum : null;
}

function readSelectedRoundToPar(resultRow, roundId) {
  var rid = asString(roundId).trim();
  if (!rid || !resultRow) return null;
  var breakdown = Array.isArray(resultRow.roundBreakdown) ? resultRow.roundBreakdown : [];
  for (var i = 0; i < breakdown.length; i++) {
    var b = breakdown[i];
    if (!b || asString(b.roundId).trim() !== rid) continue;
    return readRoundBreakdownScore(b);
  }
  return null;
}

function readRoundBreakdownScore(b) {
  if (!b) return null;
  var fromEntries = sumEntryToParList(b.selectedEntries);
  if (fromEntries != null) return fromEntries;
  var sub = Number(b.subtotal);
  return Number.isFinite(sub) ? sub : null;
}

function collectRoundScoresForTotal(resultRow) {
  var scores = [];
  var breakdown = resultRow && Array.isArray(resultRow.roundBreakdown) ? resultRow.roundBreakdown : [];
  if (breakdown.length) {
    for (var i = 0; i < breakdown.length; i++) {
      var s = readRoundBreakdownScore(breakdown[i]);
      if (s != null) scores.push(s);
    }
    return scores;
  }
  var byRound = Object.create(null);
  var entries = resultRow && Array.isArray(resultRow.allEntries) ? resultRow.allEntries : [];
  for (var e = 0; e < entries.length; e++) {
    var row = entries[e];
    var rid = asString(row && row.roundId).trim();
    if (!rid) continue;
    var t = readEntryToPar(row);
    if (t == null) continue;
    if (byRound[rid] == null) byRound[rid] = 0;
    byRound[rid] += t;
  }
  var ids = Object.keys(byRound);
  for (var k = 0; k < ids.length; k++) scores.push(byRound[ids[k]]);
  return scores;
}

/** 最好 M 轮相加（低→高取前 M）；M 空则全部轮次。不足 M 轮视为不完整。 */
function computeBestOfRoundsTotal(resultRow, m) {
  var scores = collectRoundScoresForTotal(resultRow);
  if (!scores.length) {
    return { sum: null, complete: false, count: 0 };
  }
  scores.sort(function (a, b) {
    return a - b;
  });
  var take =
    m != null && Number.isFinite(Number(m)) && Number(m) >= 1
      ? Math.min(Math.floor(Number(m)), scores.length)
      : scores.length;
  var sum = 0;
  for (var i = 0; i < take; i++) sum += scores[i];
  var complete = m == null || scores.length >= Math.floor(Number(m));
  return { sum: sum, complete: complete, count: scores.length };
}

function applyBestOfRoundsRanking(teamRows) {
  var list = Array.isArray(teamRows) ? teamRows.slice() : [];
  list.sort(function (a, b) {
    var ac = a && a._totComplete === true;
    var bc = b && b._totComplete === true;
    if (ac && !bc) return -1;
    if (!ac && bc) return 1;
    var as = a && a._totSum;
    var bs = b && b._totSum;
    var aHas = as != null && Number.isFinite(Number(as));
    var bHas = bs != null && Number.isFinite(Number(bs));
    if (aHas && bHas && Number(as) !== Number(bs)) return Number(as) - Number(bs);
    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;
    return (a && a._totIdx != null ? a._totIdx : 0) - (b && b._totIdx != null ? b._totIdx : 0);
  });
  var pos = 0;
  for (var i = 0; i < list.length; i++) {
    var row = list[i];
    if (!row) continue;
    var has = row._totSum != null && Number.isFinite(Number(row._totSum));
    if (has) {
      pos += 1;
      row.pos = formatPos(pos);
      row.hasScore = true;
    } else {
      row.pos = formatDash();
      row.hasScore = false;
    }
    delete row._totSum;
    delete row._totComplete;
    delete row._totIdx;
  }
  return list;
}

function buildUnavailableStandings(mode) {
  var tot = buildTotalSelectorChip(true, null);
  return {
    ok: true,
    mode: mode || 'per_round_n',
    available: false,
    unavailableTitle: '每轮前 N 名总榜将在后续开放',
    unavailableMessage: '当前系列赛为每轮前 N 名模式，总榜将在对应批次接入',
    selectedKey: TOTAL_KEY,
    totalSelector: tot,
    roundSelectorItems: [],
    roundSelector: [tot],
    roundSelectorMode: 'dropdown',
    roundInfoText: '',
    teamRows: [],
    leaderboardViewLabel: '',
    mainBoardInvariant: true,
    scrollRoundSelector: true
  };
}

/**
 * @param {object} input
 * @param {object} input.series
 * @param {string} [input.selectedKey]
 * @param {object[]} [input.roundStates]
 * @param {{ participantRows?: object[] }|null} [input.standingsResult]
 *   participantRows[].grossTotalValue / toParValue（禁止用 gapValue 冒充 toPar）
 *   allEntries[].toParValue / thruLabel / counting / unitName
 * 展开显隐由页面 expandedStandingsTeamId 决定；本函数为每队预置 players/expandEmptyHint。
 */
function buildSeriesStandingsViewModel(input) {
  var src = input && typeof input === 'object' ? input : {};
  var series = src.series && typeof src.series === 'object' ? src.series : {};
  var scoringMode = asString(series.scoringRule && series.scoringRule.mode).trim() || 'per_round_n';
  if (scoringMode !== 'global_m' && scoringMode !== 'per_round_n') {
    return buildUnavailableStandings(scoringMode);
  }

  var isPerRoundN = scoringMode === 'per_round_n';
  var roundStates = Array.isArray(src.roundStates) ? src.roundStates.slice() : [];
  var selectedKey = asString(src.selectedKey).trim();
  var standingsResult =
    src.standingsResult && typeof src.standingsResult === 'object'
      ? src.standingsResult
      : emptyStandingsResult();

  var displayLabels = buildStandingsRoundDisplayLabels(series, roundStates);
  var labeledStates = applyStandingsDisplayLabelsToStates(roundStates, displayLabels);
  var includeTot = shouldIncludeTotalSelector(series);
  var parts = buildRoundSelectorParts(roundStates, selectedKey, {
    displayLabels: displayLabels,
    series: series
  });
  var effectiveKey = parts.selectedKey;
  var isTotView = includeTot && isCumulativeStandingsKey(effectiveKey);
  var bestOfM = resolveBestOfRoundsM(series);
  var totalSelector = parts.totalSelector;
  var roundSelectorItems = parts.roundSelectorItems;
  var roundSelector = parts.roundSelector;

  var resultIndex = indexResultRows(standingsResult);
  var mainParticipants = resolveMainBoardParticipants(series, resultIndex);
  var roundStateById = buildRoundStateById(labeledStates);
  var roundMetaById =
    standingsResult &&
    standingsResult.roundMeta &&
    typeof standingsResult.roundMeta === 'object'
      ? standingsResult.roundMeta
      : {};

  var teamRows = [];
  var totExpandErrors = [];
  for (var i = 0; i < mainParticipants.length; i++) {
    var p = mainParticipants[i];
    var pid = asString(p.seriesParticipantId).trim();
    var resultRow = resultIndex.map[pid] || null;
    var hasScore = participantHasDisplayableScore(resultRow);
    var gross = readGrossTotalValue(resultRow);
    var toPar = readToParValue(resultRow);
    var totalDisplay;
    var scoreDisplay;
    var scoreClass;
    var totPack =
      isTotView && includeTot ? computeBestOfRoundsTotal(resultRow, bestOfM) : null;
    if (totPack) {
      hasScore = totPack.sum != null;
      totalDisplay = hasScore ? formatToParDiff(totPack.sum) : formatDash();
      scoreDisplay = totalDisplay;
      scoreClass = hasScore ? resolveToParScoreClass(totPack.sum) : 'score-even';
    } else if (isPerRoundN) {
      totalDisplay = toPar != null ? formatToParDiff(toPar) : formatDash();
      var rxToPar = readSelectedRoundToPar(resultRow, effectiveKey);
      scoreDisplay = rxToPar != null ? formatToParDiff(rxToPar) : formatDash();
      scoreClass = rxToPar != null ? resolveToParScoreClass(rxToPar) : 'score-even';
    } else {
      totalDisplay = hasScore && gross != null ? formatGrossTotal(gross) : formatDash();
      scoreDisplay = hasScore && toPar != null ? formatToParDiff(toPar) : formatDash();
      scoreClass = hasScore && toPar != null ? resolveToParScoreClass(toPar) : 'score-even';
    }
    // TOT ← allEntries ∪ roundLineups；R ← roundLineups（阵容⊕成绩）
    var expandSource = isTotView
      ? fillTotExpandGenderDisplay(
            mergeTotTeamExpandSource(
              resultRow && resultRow.allEntries,
              resultRow && resultRow.roundLineups,
              roundStateById,
              pid,
              roundMetaById,
              totExpandErrors
            ),
            series
          )
        : fillMissingGenderFromSameRoundLineup(
            resultRow && Array.isArray(resultRow.roundLineups)
              ? resultRow.roundLineups
              : []
          );
    var expand = projectExpandPlayers(
      expandSource,
      effectiveKey,
      roundStateById,
      roundMetaById,
      !!(series.scoringRule && series.scoringRule.allowRepeat),
      totExpandErrors
    );
    expand.players = expand.players.map(function (pl) {
      return seriesStandingsExpandIdentity.stampPlayerDivisionAvatarMark(pl, src.match, series);
    });

    teamRows.push({
      // 对齐队际赛 teamLeaderboard 行
      teamId: pid,
      seriesParticipantId: pid,
      pos: hasScore ? formatPos(resultRow && resultRow.rank) : formatDash(),
      teamName: resolveParticipantName(p),
      grossTotal: totalDisplay,
      grossTotalDisplay: totalDisplay,
      scoreStr: scoreDisplay,
      scoreClass: scoreClass,
      roundScore: isPerRoundN ? scoreDisplay : '',
      hasScore: hasScore,
      scoringPlayersCount: expand.scoringPlayersCount,
      players: expand.players,
      expandEmptyHint: expand.expandEmptyHint,
      expandStatusHint: expand.expandStatusHint || '',
      _totSum: totPack ? totPack.sum : null,
      _totComplete: totPack ? totPack.complete : false,
      _totIdx: i
    });
  }

  if (isTotView && includeTot) {
    teamRows = applyBestOfRoundsRanking(teamRows);
  } else {
    for (var c = 0; c < teamRows.length; c++) {
      delete teamRows[c]._totSum;
      delete teamRows[c]._totComplete;
      delete teamRows[c]._totIdx;
    }
  }

  var roundScoreHeader = isPerRoundN
    ? isTotView
      ? 'TO PAR'
      : resolveRoundChipLabel(roundStates, effectiveKey, displayLabels)
    : 'TO PAR';
  var selectedRoundDisplayLabel = isTotView
    ? 'TOTAL'
    : displayLabels[effectiveKey] || resolveRoundChipLabel(roundStates, effectiveKey);

  return {
    ok: true,
    mode: scoringMode,
    available: true,
    unavailableTitle: '',
    unavailableMessage: '',
    selectedKey: effectiveKey,
    selectedRoundDisplayLabel: selectedRoundDisplayLabel,
    bestOf: resolveBestOfDisplayCount(series),
    showTot: !!totalSelector,
    headThruLabel: 'TOTAL',
    headScoreLabel: roundScoreHeader,
    roundScoreHeader: roundScoreHeader,
    totalSelector: totalSelector,
    roundSelectorItems: roundSelectorItems,
    roundSelector: roundSelector,
    roundSelectorMode: 'dropdown',
    roundInfoText: buildStandingsRoundInfoText(effectiveKey, labeledStates, series),
    leaderboardViewLabel: isTotView
      ? ''
      : resolveRoundGameModeLabel(series, effectiveKey),
    teamRows: teamRows,
    totExpandErrors: totExpandErrors,
    mainBoardInvariant: true,
    scrollRoundSelector: true
  };
}

function cumulativeBoardSignature(standingsVm) {
  var rows = (standingsVm && standingsVm.teamRows) || [];
  return rows
    .map(function (r) {
      return [r.teamId || r.seriesParticipantId, r.pos, r.grossTotal].join('|');
    })
    .join(';;');
}

/** 主榜签名：顺序 + POS + TOTAL + TO PAR（与 selectedKey 无关） */
function mainBoardSignature(standingsVm) {
  var rows = (standingsVm && standingsVm.teamRows) || [];
  return rows
    .map(function (r) {
      return [r.teamId || r.seriesParticipantId, r.pos, r.grossTotal, r.scoreStr].join('|');
    })
    .join(';;');
}

module.exports = {
  CUMULATIVE_KEY: CUMULATIVE_KEY,
  TOTAL_KEY: TOTAL_KEY,
  isCumulativeStandingsKey: isCumulativeStandingsKey,
  isStrokePlaySeries: isStrokePlaySeries,
  shouldIncludeTotalSelector: shouldIncludeTotalSelector,
  resolveBestOfRoundsM: resolveBestOfRoundsM,
  emptyStandingsResult: emptyStandingsResult,
  projectRoundStatesFromRoundCards: projectRoundStatesFromRoundCards,
  resolveRoundStatusToken: resolveRoundStatusToken,
  formatToParDiff: formatToParDiff,
  resolveToParScoreClass: resolveToParScoreClass,
  buildRoundSelectorParts: buildRoundSelectorParts,
  buildRoundSelector: buildRoundSelector,
  buildStandingsRoundInfoText: buildStandingsRoundInfoText,
  buildSeriesStandingsViewModel: buildSeriesStandingsViewModel,
  mainBoardSignature: mainBoardSignature,
  cumulativeBoardSignature: cumulativeBoardSignature,
  mergeTotTeamExpandSource: mergeTotTeamExpandSource,
  buildOccurrenceKey: buildOccurrenceKey,
  resolveStandingsScorecardRoundId: resolveStandingsScorecardRoundId,
  nextStandingsOpenKey: nextStandingsOpenKey,
  buildTotOccurrenceScorecardTitle: buildTotOccurrenceScorecardTitle,
  resolveRowGenderDisplay: resolveRowGenderDisplay,
  resolveTotDisplayGlobalM: resolveTotDisplayGlobalM,
  buildTotTopMDescription: buildTotTopMDescription,
  resolveRoundGameModeLabel: resolveRoundGameModeLabel,
  resolvePerRoundNTeamGameModeLabel: resolvePerRoundNTeamGameModeLabel,
  formatTotRowSubLabel: formatTotRowSubLabel,
  resolveDefaultPerRoundSelectedKey: resolveDefaultPerRoundSelectedKey,
  resolveDefaultStandingsSelectedKey: resolveDefaultStandingsSelectedKey,
  resolveFirstLiveRoundId: resolveFirstLiveRoundId,
  resolveDefaultTargetRoundId: seriesLiveSession.resolveDefaultTargetRoundId,
  buildStandingsRoundDisplayLabels: buildStandingsRoundDisplayLabels,
  resolveStandingsRoundDisplayLabel: resolveStandingsRoundDisplayLabel,
  resolveRoundChipLabel: resolveRoundChipLabel,
  formatRoundDate: formatRoundSelectorDate,
  buildRoundSelectorDisplayText: buildRoundSelectorDisplayText
};
