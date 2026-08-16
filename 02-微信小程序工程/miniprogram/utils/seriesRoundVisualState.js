/**
 * Series 轮次选择器视觉状态 — 唯一权威纯投影（R-STATE）
 * M 面板 / 总榜 TAB / 赛程 TAB / 广场列表必须消费同一 state / stateClass。
 * 禁止用 TAB、选中态、建议轮改写状态 class。
 */

var STATE = {
  unassigned: 'unassigned',
  grouped: 'grouped',
  live: 'live',
  completed: 'completed',
  cancelled: 'cancelled'
};

var STATUS_LABEL = {
  unassigned: '未开始',
  grouped: '已分组',
  live: 'LIVE',
  completed: '已结束',
  cancelled: '已取消'
};

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function asLower(v) {
  return asString(v).toLowerCase();
}

/** 正式非空分组：与赛程 CTA / findEarliestPriorUngroupedRound 同源 */
function hasFormalNonEmptyGroups(match) {
  var groups = match && Array.isArray(match.groups) ? match.groups : [];
  for (var i = 0; i < groups.length; i++) {
    var players = (groups[i] && groups[i].players) || [];
    for (var j = 0; j < players.length; j++) {
      if (players[j] && asString(players[j].userId)) return true;
    }
  }
  return false;
}

function isCancelledRound(round, match) {
  var rs = asLower(round && round.roundStatus);
  if (rs === 'cancelled' || rs === 'canceled') return true;
  var ms = asLower(match && match.status);
  if (ms === 'cancelled' || ms === 'canceled') return true;
  var mrs = asLower(match && match.roundStatus);
  if (mrs === 'cancelled' || mrs === 'canceled') return true;
  return false;
}

function isCompletedMatch(match, round) {
  var ms = asLower(match && match.status);
  if (ms === 'finished' || ms === 'completed') return true;
  var rs = asLower(round && round.roundStatus);
  if (rs === 'completed' || rs === 'finished' || rs === 'settlement_pending') {
    return true;
  }
  return false;
}

function isLiveMatch(match, round) {
  var ms = asLower(match && match.status);
  if (ms === 'ongoing' || ms === 'live') return true;
  var rs = asLower(round && round.roundStatus);
  if (rs === 'live' || rs === 'ongoing') return true;
  return false;
}

/**
 * @param {object|null} round series.rounds[i]
 * @param {object|null} match 本轮 station match（可空）
 * @returns {{ state: string, stateClass: string, statusLabel: string }}
 */
function resolveSeriesRoundVisualState(round, match) {
  var r = round && typeof round === 'object' ? round : null;
  var m = match && typeof match === 'object' ? match : null;
  var state = STATE.unassigned;

  if (isCancelledRound(r, m)) {
    state = STATE.cancelled;
  } else if (isCompletedMatch(m, r)) {
    state = STATE.completed;
  } else if (isLiveMatch(m, r)) {
    state = STATE.live;
  } else if (hasFormalNonEmptyGroups(m)) {
    state = STATE.grouped;
  } else {
    state = STATE.unassigned;
  }

  return {
    state: state,
    stateClass: 'round-selector-state--' + state,
    statusLabel: STATUS_LABEL[state] || STATUS_LABEL.unassigned
  };
}

/**
 * 兼容旧 roundStates.statusToken → 新 state（仅投影，不含分组推断）
 */
function mapLegacyStatusToken(token) {
  var t = asLower(token);
  if (t === 'cancelled' || t === 'canceled') return STATE.cancelled;
  if (t === 'finished' || t === 'completed') return STATE.completed;
  if (t === 'live' || t === 'ongoing') return STATE.live;
  if (t === 'grouped') return STATE.grouped;
  if (t === 'unassigned') return STATE.unassigned;
  if (t === 'scheduled' || t === 'none' || !t) return STATE.unassigned;
  return STATE.unassigned;
}

function stateClassFor(state) {
  var s = asString(state) || STATE.unassigned;
  if (!STATUS_LABEL[s]) s = STATE.unassigned;
  return 'round-selector-state--' + s;
}

/**
 * 从已有 roundState 行规范出视觉三元组（优先 state，其次 statusToken）
 */
function normalizeRoundVisualFromStateRow(row) {
  var r = row && typeof row === 'object' ? row : {};
  var state = asString(r.state);
  if (!STATUS_LABEL[state]) {
    state = mapLegacyStatusToken(r.statusToken);
  }
  return {
    state: state,
    stateClass: asString(r.stateClass) || stateClassFor(state),
    statusLabel: asString(r.statusLabel) || STATUS_LABEL[state] || STATUS_LABEL.unassigned
  };
}

module.exports = {
  STATE: STATE,
  STATUS_LABEL: STATUS_LABEL,
  resolveSeriesRoundVisualState: resolveSeriesRoundVisualState,
  hasFormalNonEmptyGroups: hasFormalNonEmptyGroups,
  mapLegacyStatusToken: mapLegacyStatusToken,
  stateClassFor: stateClassFor,
  normalizeRoundVisualFromStateRow: normalizeRoundVisualFromStateRow
};
