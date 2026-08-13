/**
 * 系列赛总榜纯计算（仅消费已标准化 SeriesResultEntry[]）
 *
 * - Top N / Top M = 取 N/M 份有效计分结果
 * - global_m + allowRepeat=false：按稳定序贪心选取，memberUserIds 与已入选有交集则跳过
 * - allowRepeat=true：同一真人跨轮可重复贡献（不按球员去重）
 * - 只比较 entry.rankingValue（越小越好）
 * - 不完整结果不得因项少而领先完整结果；不完整 rank=null
 * - 同分：provisionalRank 可相同，正式 rank 不得暗中拆开；tieUnresolved + rankDecision unset
 * - 不原地修改输入
 */

var VALID_FOR_POOL = {
  OK: true
};

function deepClone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function asFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  var n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildRoundIndexMap(rounds) {
  var map = {};
  var list = Array.isArray(rounds) ? rounds : [];
  for (var i = 0; i < list.length; i++) {
    var r = list[i];
    if (!r || r.roundId == null) continue;
    var rid = String(r.roundId).trim();
    if (!rid) continue;
    var idx = asFiniteNumber(r.index);
    map[rid] = idx != null ? idx : i + 1;
  }
  return map;
}

function isEligibleEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (!VALID_FOR_POOL[entry.resultStatus]) return false;
  return asFiniteNumber(entry.rankingValue) != null;
}

function compareEntriesStable(a, b, roundIndexMap) {
  var ra = asFiniteNumber(a.rankingValue);
  var rb = asFiniteNumber(b.rankingValue);
  if (ra != null && rb != null && ra !== rb) return ra - rb;
  if (ra == null && rb != null) return 1;
  if (ra != null && rb == null) return -1;

  var ia =
    a.roundIndex != null
      ? asFiniteNumber(a.roundIndex)
      : roundIndexMap[String(a.roundId || '').trim()];
  var ib =
    b.roundIndex != null
      ? asFiniteNumber(b.roundIndex)
      : roundIndexMap[String(b.roundId || '').trim()];
  if (ia == null) ia = Number.MAX_SAFE_INTEGER;
  if (ib == null) ib = Number.MAX_SAFE_INTEGER;
  if (ia !== ib) return ia - ib;

  var ea = String(a.entryId || '');
  var eb = String(b.entryId || '');
  if (ea < eb) return -1;
  if (ea > eb) return 1;
  return 0;
}

function resolveTieRankDecision(/* entriesInTie, context */) {
  return null;
}

function filterByCutoff(entries, cutoffRoundIndex, roundIndexMap) {
  var list = Array.isArray(entries) ? entries : [];
  if (cutoffRoundIndex == null || !Number.isFinite(Number(cutoffRoundIndex))) {
    return list.slice();
  }
  var cutoff = Math.floor(Number(cutoffRoundIndex));
  return list.filter(function (e) {
    var idx =
      e.roundIndex != null
        ? asFiniteNumber(e.roundIndex)
        : roundIndexMap[String(e.roundId || '').trim()];
    if (idx == null) return false;
    return idx <= cutoff;
  });
}

function groupByParticipant(entries) {
  var map = {};
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    var pid = String((e && e.seriesParticipantId) || '').trim();
    if (!pid) continue;
    if (!map[pid]) map[pid] = [];
    map[pid].push(e);
  }
  return map;
}

function sumRankingValues(selected) {
  var sum = 0;
  for (var i = 0; i < selected.length; i++) {
    sum += Number(selected[i].rankingValue);
  }
  return sum;
}

function collectEntryMemberIds(entry) {
  var list = Array.isArray(entry && entry.memberUserIds) ? entry.memberUserIds : [];
  var out = [];
  var seen = Object.create(null);
  for (var i = 0; i < list.length; i++) {
    var id = String(list[i] || '').trim();
    if (!id || seen[id]) continue;
    seen[id] = true;
    out.push(id);
  }
  return out;
}

function entryMembersOverlapSelected(selected, candidate) {
  var cand = collectEntryMemberIds(candidate);
  if (!cand.length || !selected.length) return false;
  var used = Object.create(null);
  for (var s = 0; s < selected.length; s++) {
    var members = collectEntryMemberIds(selected[s]);
    for (var m = 0; m < members.length; m++) {
      used[members[m]] = true;
    }
  }
  for (var c = 0; c < cand.length; c++) {
    if (used[cand[c]]) return true;
  }
  return false;
}

/**
 * 从已按稳定序排好的池中取前 M
 * - allowRepeat=true：直接 slice
 * - allowRepeat=false：贪心跳过与已选 memberUserIds 相交的 entry（player/entity/pair 统一）
 */
function selectGlobalTopMEntries(sortedPool, m, allowRepeat) {
  var pool = Array.isArray(sortedPool) ? sortedPool : [];
  var limit = Math.floor(Number(m));
  if (!Number.isFinite(limit) || limit < 1) return [];
  if (allowRepeat) return pool.slice(0, limit);
  var selected = [];
  for (var i = 0; i < pool.length && selected.length < limit; i++) {
    var e = pool[i];
    if (!e) continue;
    if (entryMembersOverlapSelected(selected, e)) continue;
    selected.push(e);
  }
  return selected;
}

function resolveTopN(roundId, roundObj, topNByRoundId) {
  // 轮次自身带了 topN（含非法值）时优先采用，避免映射把非法轮次“修好”
  if (roundObj && roundObj.topN != null && roundObj.topN !== '') {
    return Math.floor(Number(roundObj.topN));
  }
  if (typeof topNByRoundId === 'number') {
    return Math.floor(topNByRoundId);
  }
  if (topNByRoundId && topNByRoundId[roundId] != null) {
    return Math.floor(Number(topNByRoundId[roundId]));
  }
  return NaN;
}

/**
 * 计入轮次：排除 cancelled；应用 cutoff；需要有效 topN
 * - 仅当 rounds 不是非空数组时，才允许按 topNByRoundId 退化建轮
 * - 只要提供了非空 rounds，就必须尊重 cancelled / index / cutoff，禁止把已排除轮次回填
 */
function getCountableRounds(rounds, cutoffRoundIndex, topNByRoundId) {
  var hasRoundsMeta = Array.isArray(rounds) && rounds.length > 0;
  var list = hasRoundsMeta ? rounds : [];
  var out = [];
  var cutoff =
    cutoffRoundIndex == null || !Number.isFinite(Number(cutoffRoundIndex))
      ? null
      : Math.floor(Number(cutoffRoundIndex));

  for (var i = 0; i < list.length; i++) {
    var r = list[i];
    if (!r || r.roundId == null) continue;
    if (String(r.roundStatus || '') === 'cancelled') continue;
    var rid = String(r.roundId).trim();
    if (!rid) continue;
    var idx = asFiniteNumber(r.index);
    if (idx == null) idx = i + 1;
    if (cutoff != null && idx > cutoff) continue;
    var n = resolveTopN(rid, r, topNByRoundId);
    if (!Number.isFinite(n) || n < 1) continue;
    out.push({
      roundId: rid,
      index: idx,
      requiredCount: n
    });
  }

  // 退化：仅在完全没有非空 rounds 元数据时，才用 topNByRoundId 的 key
  if (
    !hasRoundsMeta &&
    !out.length &&
    topNByRoundId &&
    typeof topNByRoundId === 'object' &&
    !Array.isArray(topNByRoundId)
  ) {
    Object.keys(topNByRoundId).forEach(function (rid) {
      var n = Math.floor(Number(topNByRoundId[rid]));
      if (!Number.isFinite(n) || n < 1) return;
      out.push({ roundId: String(rid), index: Number.MAX_SAFE_INTEGER, requiredCount: n });
    });
  }
  out.sort(function (a, b) {
    if (a.index !== b.index) return a.index - b.index;
    return a.roundId < b.roundId ? -1 : a.roundId > b.roundId ? 1 : 0;
  });
  return out;
}

function collectParticipantIds(explicitIds, byParticipant) {
  var set = {};
  var list = Array.isArray(explicitIds) ? explicitIds : [];
  for (var i = 0; i < list.length; i++) {
    var id = String(list[i] || '').trim();
    if (id) set[id] = true;
  }
  Object.keys(byParticipant).forEach(function (pid) {
    set[pid] = true;
  });
  return Object.keys(set).sort();
}

function compareParticipantRows(a, b) {
  if (a.isComplete !== b.isComplete) return a.isComplete ? -1 : 1;
  if (a.isComplete && b.isComplete) {
    if (a.totalRankingValue !== b.totalRankingValue) {
      return a.totalRankingValue - b.totalRankingValue;
    }
    if (a.seriesParticipantId < b.seriesParticipantId) return -1;
    if (a.seriesParticipantId > b.seriesParticipantId) return 1;
    return 0;
  }
  // 不完整：展示顺序（非正式排名）
  if (a.selectedCount !== b.selectedCount) return b.selectedCount - a.selectedCount;
  if (a.totalRankingValue !== b.totalRankingValue) {
    return a.totalRankingValue - b.totalRankingValue;
  }
  if (a.seriesParticipantId < b.seriesParticipantId) return -1;
  if (a.seriesParticipantId > b.seriesParticipantId) return 1;
  return 0;
}

/**
 * 完整结果可给正式 rank（无并列时）；并列则 rank=null + tieUnresolved
 * 不完整：rank=null
 */
function attachSortAndRank(sortedRows) {
  var out = [];
  var i = 0;
  var nextProvisional = 1;
  while (i < sortedRows.length) {
    var row = sortedRows[i];
    if (!row.isComplete) {
      out.push(
        Object.assign({}, row, {
          sortOrder: out.length + 1,
          rank: null,
          provisionalRank: null,
          tieUnresolved: false,
          rankDecision: 'unset'
        })
      );
      i += 1;
      continue;
    }
    var j = i + 1;
    while (
      j < sortedRows.length &&
      sortedRows[j].isComplete &&
      sortedRows[j].totalRankingValue === row.totalRankingValue
    ) {
      j += 1;
    }
    var tied = j - i > 1;
    var provisional = nextProvisional;
    for (var k = i; k < j; k++) {
      out.push(
        Object.assign({}, sortedRows[k], {
          sortOrder: out.length + 1,
          provisionalRank: provisional,
          rank: tied ? null : provisional,
          tieUnresolved: tied,
          rankDecision: 'unset'
        })
      );
    }
    nextProvisional += j - i;
    i = j;
  }
  // 修正 sortOrder 为 1..n（上面已按 push 顺序）
  for (var s = 0; s < out.length; s++) {
    out[s].sortOrder = s + 1;
  }
  return out;
}

function computePerRoundTopN(input) {
  var src = input && typeof input === 'object' ? input : {};
  var entries = deepClone(Array.isArray(src.entries) ? src.entries : []);
  var rounds = Array.isArray(src.rounds) ? src.rounds : [];
  var roundIndexMap = buildRoundIndexMap(rounds);
  var countable = getCountableRounds(rounds, src.cutoffRoundIndex, src.topNByRoundId);
  var cutoffEntries = filterByCutoff(entries, src.cutoffRoundIndex, roundIndexMap);
  var eligible = cutoffEntries.filter(isEligibleEntry);
  var byParticipant = groupByParticipant(eligible);
  var participantIds = collectParticipantIds(src.participantIds, byParticipant);

  var results = [];
  for (var p = 0; p < participantIds.length; p++) {
    var pid = participantIds[p];
    var all = byParticipant[pid] || [];
    var byRound = {};
    for (var i = 0; i < all.length; i++) {
      var e = all[i];
      var rid = String(e.roundId || '').trim();
      if (!rid) continue;
      if (!byRound[rid]) byRound[rid] = [];
      byRound[rid].push(e);
    }

    var selected = [];
    var roundBreakdown = [];
    var incompleteRoundIds = [];
    // 零个可计入轮次：一律不完整，不得获得正式排名
    var complete = false;

    for (var r = 0; r < countable.length; r++) {
      var cr = countable[r];
      var pool = (byRound[cr.roundId] || []).slice().sort(function (a, b) {
        return compareEntriesStable(a, b, roundIndexMap);
      });
      var picked = pool.slice(0, cr.requiredCount);
      var selectedCount = picked.length;
      var isRoundComplete = selectedCount >= cr.requiredCount;
      if (!isRoundComplete) {
        incompleteRoundIds.push(cr.roundId);
      }
      var subtotal = sumRankingValues(picked);
      roundBreakdown.push({
        roundId: cr.roundId,
        requiredCount: cr.requiredCount,
        selectedCount: selectedCount,
        isComplete: isRoundComplete,
        subtotal: subtotal,
        selectedEntries: picked
      });
      selected = selected.concat(picked);
    }

    if (countable.length > 0) {
      complete = incompleteRoundIds.length === 0;
    }

    selected.sort(function (a, b) {
      return compareEntriesStable(a, b, roundIndexMap);
    });

    results.push({
      seriesParticipantId: pid,
      // 无可计入轮次时保留 0 仅供展示，不得解释为有效总成绩
      totalRankingValue: sumRankingValues(selected),
      selectedCount: selected.length,
      selectedEntries: selected,
      isComplete: complete,
      incompleteRoundIds: incompleteRoundIds,
      roundBreakdown: roundBreakdown
    });
  }

  results.sort(compareParticipantRows);
  var ranked = attachSortAndRank(results);
  var hasCountableRounds = countable.length > 0;

  return {
    mode: 'per_round_n',
    participants: ranked,
    sortOrderStable: true,
    rankDecision: 'unset',
    resolveTieRankDecision: resolveTieRankDecision,
    meta: {
      eligibleCount: eligible.length,
      participantCount: ranked.length,
      countableRoundCount: countable.length,
      hasCountableRounds: hasCountableRounds,
      reason: hasCountableRounds ? undefined : 'no_countable_rounds',
      cutoffRoundIndex: src.cutoffRoundIndex != null ? src.cutoffRoundIndex : null
    }
  };
}

function computeGlobalTopM(input) {
  var src = input && typeof input === 'object' ? input : {};
  var entries = deepClone(Array.isArray(src.entries) ? src.entries : []);
  var rounds = Array.isArray(src.rounds) ? src.rounds : [];
  var roundIndexMap = buildRoundIndexMap(rounds);
  var m = Math.floor(Number(src.globalM));
  if (!Number.isFinite(m) || m < 1) {
    return {
      mode: 'global_m',
      participants: [],
      sortOrderStable: true,
      rankDecision: 'unset',
      resolveTieRankDecision: resolveTieRankDecision,
      meta: { error: 'global_m_invalid', eligibleCount: 0, participantCount: 0 }
    };
  }

  // 全局模式仍按截止轮过滤 entry；取消轮成绩不计入（通过 rounds 标记排除其 roundId）
  var cancelled = {};
  for (var i = 0; i < rounds.length; i++) {
    var rr = rounds[i];
    if (rr && String(rr.roundStatus || '') === 'cancelled' && rr.roundId != null) {
      cancelled[String(rr.roundId).trim()] = true;
    }
  }

  var cutoffEntries = filterByCutoff(entries, src.cutoffRoundIndex, roundIndexMap).filter(
    function (e) {
      return !cancelled[String((e && e.roundId) || '').trim()];
    }
  );
  var eligible = cutoffEntries.filter(isEligibleEntry);
  var byParticipant = groupByParticipant(eligible);
  var participantIds = collectParticipantIds(src.participantIds, byParticipant);
  var allowRepeat = src.allowRepeat === true;
  var results = [];

  for (var p = 0; p < participantIds.length; p++) {
    var pid = participantIds[p];
    var pool = (byParticipant[pid] || []).slice().sort(function (a, b) {
      return compareEntriesStable(a, b, roundIndexMap);
    });
    var selected = selectGlobalTopMEntries(pool, m, allowRepeat);
    var selectedCount = selected.length;
    results.push({
      seriesParticipantId: pid,
      totalRankingValue: sumRankingValues(selected),
      selectedCount: selectedCount,
      selectedEntries: selected,
      requiredCount: m,
      isComplete: selectedCount >= m
    });
  }

  results.sort(compareParticipantRows);
  var ranked = attachSortAndRank(results);

  return {
    mode: 'global_m',
    participants: ranked,
    sortOrderStable: true,
    rankDecision: 'unset',
    resolveTieRankDecision: resolveTieRankDecision,
    meta: {
      globalM: m,
      allowRepeat: allowRepeat,
      eligibleCount: eligible.length,
      participantCount: ranked.length,
      cutoffRoundIndex: src.cutoffRoundIndex != null ? src.cutoffRoundIndex : null
    }
  };
}

module.exports = {
  isEligibleEntry: isEligibleEntry,
  compareEntriesStable: compareEntriesStable,
  resolveTieRankDecision: resolveTieRankDecision,
  getCountableRounds: getCountableRounds,
  selectGlobalTopMEntries: selectGlobalTopMEntries,
  computePerRoundTopN: computePerRoundTopN,
  computeGlobalTopM: computeGlobalTopM
};
