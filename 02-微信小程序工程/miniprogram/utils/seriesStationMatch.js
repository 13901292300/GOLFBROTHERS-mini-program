/**
 * Series 分站 match 构造与 fingerprint（纯函数，不读写 storage）
 * - 供 4C 发布编排使用
 * - 不修改 teamMatchStore.buildMatchFromCreatePage
 *
 * 标题消费边界（本文件只快照字段，不改广场/Home/报名页）：
 * - Series.seriesName / seriesSubtitle 进入指纹与 seriesContext 快照
 * - 4C-3 LIVE 卡 / 4C-4 报名卡：主副标题左对齐双行、单行省略、空副标题不占位
 * - roundName 仅拼 seriesName · 轮名，不拼副标题
 */

var PLAN_VERSION = 1;
/** 当前 station payload / plan 指纹算法版本。缺省该字段的旧 journal 才允许旧算法复核。 */
var FINGERPRINT_VERSION = 2;

/** 严格费用：空 / 0或正数最多两位小数；禁止宽松 Number 吞格式 */
var STRICT_FEE_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

function deepClone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function asString(v, fallback) {
  if (v == null) return fallback != null ? fallback : '';
  return String(v);
}

/** 稳定序列化（键排序）供 fingerprint / 精确相等 */
function stableStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  if (typeof value === 'object') {
    var keys = Object.keys(value).sort();
    var parts = [];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      parts.push(JSON.stringify(k) + ':' + stableStringify(value[k]));
    }
    return '{' + parts.join(',') + '}';
  }
  return JSON.stringify(String(value));
}

function fingerprintOf(value) {
  var s = stableStringify(value);
  var h = 5381;
  for (var i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return 'fp' + (h >>> 0).toString(36) + 'x' + s.length.toString(36);
}

/** 经 exports 调用，便于自测注入碰撞 hash 且与安全比较路径一致 */
function fingerprintOfExported(value) {
  return module.exports.fingerprintOf(value);
}

function isSeriesManagedMatch(match) {
  if (!match || typeof match !== 'object') return false;
  var ctx = match.seriesContext;
  if (!ctx || typeof ctx !== 'object') return false;
  if (ctx.managed !== true) return false;
  var sid = asString(ctx.seriesId).trim();
  var rid = asString(ctx.roundId).trim();
  return !!(sid && rid);
}

function resolveSeriesParticipantMode(series) {
  var hostMode = asString(series && series.hostMode).trim();
  if (hostMode === 'organization') return 'team';
  if (hostMode === 'team') return 'division';
  return 'team';
}

function buildSeriesContext(series, round, options) {
  var opts = options || {};
  var mode = resolveSeriesParticipantMode(series);
  return {
    managed: true,
    seriesId: asString(series && series.seriesId).trim(),
    roundId: asString(round && round.roundId).trim(),
    publishToken: asString(
      opts.publishToken != null ? opts.publishToken : series && series.publishToken
    ).trim(),
    seriesParticipantMode: mode,
    registrationAuthority: 'series',
    seriesNameSnapshot: asString(series && series.seriesName).trim(),
    seriesSubtitleSnapshot: asString(series && series.seriesSubtitle)
      .replace(/[\r\n\u2028\u2029]+/g, '')
      .trim()
  };
}

function buildTeamGroupsFromSeries(series) {
  var mode = resolveSeriesParticipantMode(series);
  var parts = Array.isArray(series && series.participants) ? series.participants : [];
  var out = [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i] || {};
    if (mode === 'team') {
      if (p.kind && p.kind !== 'team') continue;
      var sourceTeamId = asString(p.sourceTeamId).trim();
      var name = asString(p.nameSnapshot).trim() || sourceTeamId || '球队' + (i + 1);
      var gid = sourceTeamId || asString(p.seriesParticipantId).trim() || 'tg-' + (i + 1);
      out.push({
        id: gid,
        renderKey: 'team-group-' + gid,
        name: name,
        sourceTeamId: sourceTeamId,
        sourceTeamName: name,
        sourceTeamShortName: name,
        sourceTeamLogo: asString(p.logoSnapshot).trim()
      });
    } else {
      if (p.kind && p.kind !== 'division') continue;
      var divisionId = asString(p.divisionId).trim();
      var dName = asString(p.nameSnapshot).trim() || divisionId || '分队' + (i + 1);
      var did = divisionId || asString(p.seriesParticipantId).replace(/^division:/, '') || 'div-' + (i + 1);
      out.push({
        id: did,
        renderKey: 'team-group-' + did,
        name: dName,
        sourceTeamId: '',
        sourceTeamName: '',
        sourceTeamShortName: '',
        sourceTeamLogo: '',
        colorSnapshot: asString(p.colorSnapshot).trim()
      });
    }
  }
  return out;
}

/**
 * 费用 → 可判定结果（禁止静默丢失）
 * - 空 → ok, feeList=[]
 * - 合法 0/正数、最多两位小数 → ok + 稳定 feeId
 * - 非法非空 → fee_invalid（不得转成 []）
 */
function mapRoundFeeToFeeList(fee, roundId) {
  var raw = fee == null ? '' : String(fee).trim();
  if (!raw) {
    return { ok: true, feeList: [], reason: 'empty' };
  }
  if (!STRICT_FEE_PATTERN.test(raw)) {
    return { ok: false, reason: 'fee_invalid', feeList: null };
  }
  var rid = asString(roundId).trim() || 'round';
  return {
    ok: true,
    feeList: [{ id: 'fee:' + rid, name: '报名费', amount: raw }],
    reason: 'mapped'
  };
}

/** @deprecated 兼容旧调用名：仅合法时返回数组；非法返回 null（调用方应改用 mapRoundFeeToFeeList） */
function normalizeFeeToFeeList(fee, roundId) {
  var mapped = mapRoundFeeToFeeList(fee, roundId);
  if (!mapped.ok) return null;
  return mapped.feeList;
}

function validateRoundsFees(series) {
  var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
  var errors = [];
  for (var i = 0; i < rounds.length; i++) {
    var r = rounds[i] || {};
    var mapped = mapRoundFeeToFeeList(r.fee, r.roundId);
    if (!mapped.ok) {
      errors.push({
        code: 'fee_invalid',
        message: '轮次费用非法，禁止静默丢弃',
        path: 'rounds[' + i + '].fee',
        roundId: asString(r.roundId).trim()
      });
    }
  }
  return { ok: errors.length === 0, errors: errors };
}

/**
 * 分站 teamCompetition 快照
 * - per_round_n：enabled=true，topN=round.topN（单场团队取最好 N 名/组）
 * - global_m：enabled=false（分站默认个人/组合榜；不写入 globalM/allowRepeat）
 */
function buildTeamCompetitionForStation(series, round) {
  var mode = asString(series && series.scoringRule && series.scoringRule.mode).trim();
  if (mode === 'per_round_n') {
    var tn = Number(round && round.topN);
    if (!Number.isFinite(tn) || Math.floor(tn) < 1) {
      return { ok: false, reason: 'top_n_invalid' };
    }
    return {
      ok: true,
      teamCompetition: { enabled: true, topN: Math.floor(tn) }
    };
  }
  return {
    ok: true,
    teamCompetition: { enabled: false, topN: 3 }
  };
}

function cloneEventInfoList(list) {
  if (!Array.isArray(list)) return [];
  return list.map(function (item) {
    return {
      id: item && item.id != null ? item.id : '',
      title: item && item.title ? String(item.title) : '',
      type: item && item.type ? String(item.type) : '',
      content: item && item.content != null ? String(item.content) : '',
      brightImage:
        item && (item.brightImage != null || item.imageData != null)
          ? String(item.brightImage != null ? item.brightImage : item.imageData)
          : '',
      darkImage:
        item && (item.darkImage != null || item.imageData != null)
          ? String(item.darkImage != null ? item.darkImage : item.imageData)
          : '',
      status: item && item.status ? String(item.status) : ''
    };
  });
}

/** 分站标题仅主名 · 轮名；不拼 seriesSubtitle */
function buildStationRoundName(seriesName, roundName) {
  var sn = asString(seriesName).trim() || '系列赛';
  var rn = asString(roundName).trim() || '轮次';
  return sn + ' · ' + rn;
}

/**
 * 与 teamMatchStore.cloneTeamGroups 身份字段对齐。
 * getMatchById → normalizeStoredMatch 会丢掉 colorSnapshot 等展示字段；
 * 发布写后核验 / resume 指纹必须忽略这些字段，否则分队系列赛会误报
 * readback_payload_mismatch → payload_conflict。
 */
function canonicalizeTeamGroupsForFingerprint(list) {
  if (!Array.isArray(list)) return [];
  return list.map(function (item, index) {
    var src = item && typeof item === 'object' ? item : {};
    var id = src.id != null ? src.id : index + 1;
    var sourceTeamShortName =
      src.sourceTeamShortName != null && String(src.sourceTeamShortName).trim() !== ''
        ? String(src.sourceTeamShortName).trim()
        : '';
    return {
      id: id,
      renderKey: src.renderKey ? String(src.renderKey) : 'team-group-' + id,
      name: src.name ? String(src.name).trim() : '',
      sourceTeamId:
        src.sourceTeamId != null && String(src.sourceTeamId).trim() !== ''
          ? String(src.sourceTeamId).trim()
          : '',
      sourceTeamName:
        src.sourceTeamName != null && String(src.sourceTeamName).trim() !== ''
          ? String(src.sourceTeamName).trim()
          : '',
      sourceTeamShortName: sourceTeamShortName,
      sourceTeamLogo:
        src.sourceTeamLogo != null && String(src.sourceTeamLogo).trim() !== ''
          ? String(src.sourceTeamLogo).trim()
          : ''
    };
  });
}

/**
 * 参与 fingerprint / 精确相等的规范化载荷（排除 createdAt 等易变运行时字段）
 * @param {object} match
 * @param {{ legacyOmitCreator?: boolean, legacyRawTeamGroups?: boolean }} [options]
 *   legacyOmitCreator：旧 journal 冻结时未纳入创建者字段；校验时允许回退，避免旧 fingerprint 漂移。
 *   legacyRawTeamGroups：修复前 teamGroups 原样进指纹（含 colorSnapshot）；仅无 fingerprintVersion 的旧 journal 复核。
 */
function extractStationPayloadForFingerprint(match, options) {
  var m = match || {};
  var ctx = m.seriesContext && typeof m.seriesContext === 'object' ? m.seriesContext : {};
  var teamGroups =
    options && options.legacyRawTeamGroups
      ? Array.isArray(m.teamGroups)
        ? m.teamGroups
        : []
      : canonicalizeTeamGroupsForFingerprint(m.teamGroups);
  var out = {
    matchId: asString(m.matchId).trim(),
    matchType: asString(m.matchType).trim(),
    roundName: asString(m.roundName).trim(),
    gameMode: asString(m.gameMode).trim(),
    organizationId: asString(m.organizationId).trim(),
    organizationName: asString(m.organizationName).trim(),
    organizationLogo: asString(m.organizationLogo).trim(),
    teamId: asString(m.teamId).trim(),
    teamName: asString(m.teamName).trim(),
    teamLogo: asString(m.teamLogo).trim(),
    feeList: Array.isArray(m.feeList) ? m.feeList : [],
    eventInfoList: Array.isArray(m.eventInfoList) ? m.eventInfoList : [],
    teamGroups: teamGroups,
    courseId: asString(m.courseId).trim(),
    courseName: asString(m.courseName).trim(),
    courseLocation: asString(m.courseLocation).trim(),
    courseHalfText: asString(m.courseHalfText).trim(),
    front9Course: m.front9Course != null ? m.front9Course : null,
    back9Course: m.back9Course != null ? m.back9Course : null,
    teeTime: asString(m.teeTime).trim(),
    teeTimeText: asString(m.teeTimeText).trim(),
    deadlineTime: asString(m.deadlineTime).trim(),
    deadlineTimeText: asString(m.deadlineTimeText).trim(),
    visibility: m.visibility === 'private' ? 'private' : 'public',
    accessCode: asString(m.accessCode).trim(),
    registrationStatus: asString(m.registrationStatus).trim() || 'closed',
    status: asString(m.status).trim(),
    seriesContext: {
      managed: ctx.managed === true,
      seriesId: asString(ctx.seriesId).trim(),
      roundId: asString(ctx.roundId).trim(),
      publishToken: asString(ctx.publishToken).trim(),
      seriesParticipantMode: asString(ctx.seriesParticipantMode).trim(),
      registrationAuthority: asString(ctx.registrationAuthority).trim(),
      seriesNameSnapshot: asString(ctx.seriesNameSnapshot).trim(),
      seriesSubtitleSnapshot: asString(ctx.seriesSubtitleSnapshot).trim()
    },
    scoringRules: {
      teamCompetition: {
        enabled: !!(m.scoringRules && m.scoringRules.teamCompetition && m.scoringRules.teamCompetition.enabled),
        topN:
          m.scoringRules &&
          m.scoringRules.teamCompetition &&
          Number.isFinite(Number(m.scoringRules.teamCompetition.topN))
            ? Math.floor(Number(m.scoringRules.teamCompetition.topN))
            : 3
      }
    }
  };
  if (!(options && options.legacyOmitCreator)) {
    // 新冻结：创建者进入 canonical，防止 resume/repair 身份漂移
    out.createdBy = asString(m.createdBy || m.creatorId).trim();
  }
  return out;
}

function computeStationPayloadFingerprint(match) {
  return fingerprintOfExported(extractStationPayloadForFingerprint(match));
}

/**
 * 安全相等：规范化 → stableStringify 完全相等；fingerprint 不同直接冲突，
 * fingerprint 相同但 canonical 不同仍冲突。
 */
function stationPayloadsEqual(a, b) {
  var ca = extractStationPayloadForFingerprint(a);
  var cb = extractStationPayloadForFingerprint(b);
  var sa = stableStringify(ca);
  var sb = stableStringify(cb);
  var fa = fingerprintOfExported(ca);
  var fb = fingerprintOfExported(cb);
  if (fa !== fb) {
    return { equal: false, reason: 'fingerprint_mismatch', fingerprintA: fa, fingerprintB: fb };
  }
  if (sa !== sb) {
    return { equal: false, reason: 'canonical_mismatch', fingerprint: fa };
  }
  return { equal: true, fingerprint: fa, canonical: ca };
}

/**
 * 影响分站物化的 Series 草稿指纹。
 * 不得包含 publishState / lifecycleStatus / round.matchId 等发布运行字段。
 */
function computeSeriesPlanSourceFingerprint(series) {
  var s = series || {};
  var rounds = Array.isArray(s.rounds) ? s.rounds : [];
  return fingerprintOf({
    seriesId: asString(s.seriesId).trim(),
    publishToken: asString(s.publishToken).trim(),
    hostMode: asString(s.hostMode).trim(),
    templateId: asString(s.templateId).trim(),
    seriesName: asString(s.seriesName).trim(),
    seriesSubtitle: asString(s.seriesSubtitle)
      .replace(/[\r\n\u2028\u2029]+/g, '')
      .trim(),
    organization: s.organization || {},
    hostTeam: s.hostTeam || {},
    participants: Array.isArray(s.participants) ? s.participants : [],
    visibility: s.visibility === 'private' ? 'private' : 'public',
    accessCode: asString(s.accessCode).trim(),
    eventInfoList: Array.isArray(s.eventInfoList) ? s.eventInfoList : [],
    scoringRuleMode: asString(s.scoringRule && s.scoringRule.mode).trim(),
    rounds: rounds.map(function (r) {
      return {
        roundId: asString(r && r.roundId).trim(),
        index: r && r.index,
        name: asString(r && r.name).trim(),
        dateTime: asString(r && r.dateTime).trim(),
        fee: asString(r && r.fee).trim(),
        gameMode: asString(r && r.gameMode).trim(),
        courseId: asString(r && r.courseId).trim(),
        courseName: asString(r && r.courseName).trim(),
        courseLocation: asString(r && r.courseLocation).trim(),
        courseHalfText: asString(r && r.courseHalfText).trim(),
        front9Course: r && r.front9Course != null ? r.front9Course : null,
        back9Course: r && r.back9Course != null ? r.back9Course : null,
        topN: r && r.topN
      };
    })
  });
}

function journalHasFingerprintVersion(journal) {
  var v = journal && journal.fingerprintVersion;
  return v != null && String(v).trim() !== '';
}

/**
 * 当前算法优先；仅缺少 fingerprintVersion 的旧 journal 才用旧算法复核。
 * 不改写 stored fingerprint，不把任意 journal 重算成合法。
 */
function storedPayloadFingerprintAgrees(payload, storedFp, journal) {
  var expected = asString(storedFp).trim();
  if (!expected) return false;
  if (computeStationPayloadFingerprint(payload) === expected) return true;
  if (journalHasFingerprintVersion(journal)) return false;
  var legacyOpts = [
    { legacyOmitCreator: true },
    { legacyRawTeamGroups: true },
    { legacyRawTeamGroups: true, legacyOmitCreator: true }
  ];
  var i;
  for (i = 0; i < legacyOpts.length; i++) {
    if (
      fingerprintOfExported(extractStationPayloadForFingerprint(payload, legacyOpts[i])) ===
      expected
    ) {
      return true;
    }
  }
  return false;
}

function computePlanFingerprint(roundPlans) {
  var list = Array.isArray(roundPlans) ? roundPlans : [];
  return fingerprintOf(
    list.map(function (rp) {
      return {
        roundId: asString(rp && rp.roundId).trim(),
        matchId: asString(rp && rp.matchId).trim(),
        payloadFingerprint: asString(rp && rp.payloadFingerprint).trim()
      };
    })
  );
}

var LEGAL_JOURNAL_PHASES = {
  planned: true,
  precheck: true,
  writing_matches: true,
  writing_index: true,
  finalizing: true,
  failed: true,
  discarding: true,
  done: true
};

var LEGAL_ROUND_STATUSES = {
  pending: true,
  written: true,
  indexed: true,
  failed: true
};

/**
 * 严格校验冻结 Journal。任何异常 → journal_corrupt。
 * 不得仅凭 planFingerprint + rounds 非空判定有效。
 */
function validateFrozenJournal(journal) {
  if (!journal || typeof journal !== 'object' || Array.isArray(journal)) {
    return { ok: false, reason: 'journal_corrupt', detail: 'absent_or_invalid' };
  }
  var seriesId = asString(journal.seriesId).trim();
  var publishToken = asString(journal.publishToken).trim();
  var planVersion = journal.planVersion;
  var sourceFingerprint = asString(journal.sourceFingerprint).trim();
  var planFingerprint = asString(journal.planFingerprint).trim();
  if (
    !seriesId ||
    !publishToken ||
    planVersion == null ||
    planVersion === '' ||
    !sourceFingerprint ||
    !planFingerprint
  ) {
    return { ok: false, reason: 'journal_corrupt', detail: 'header_incomplete' };
  }
  var phase = asString(journal.phase).trim();
  if (!LEGAL_JOURNAL_PHASES[phase]) {
    return { ok: false, reason: 'journal_corrupt', detail: 'phase_invalid', phase: phase };
  }
  var rounds = journal.rounds;
  if (!Array.isArray(rounds) || rounds.length < 1) {
    return { ok: false, reason: 'journal_corrupt', detail: 'rounds_empty' };
  }

  var seenRound = Object.create(null);
  var seenMatch = Object.create(null);
  for (var i = 0; i < rounds.length; i++) {
    var rp = rounds[i];
    if (!rp || typeof rp !== 'object') {
      return { ok: false, reason: 'journal_corrupt', detail: 'round_invalid', index: i };
    }
    var rid = asString(rp.roundId).trim();
    var mid = asString(rp.matchId).trim();
    var pfp = asString(rp.payloadFingerprint).trim();
    var payload = rp.matchPayload;
    if (!rid || !mid || !pfp || !payload || typeof payload !== 'object') {
      return {
        ok: false,
        reason: 'journal_corrupt',
        detail: 'round_fields_incomplete',
        index: i
      };
    }
    var st = asString(rp.status).trim() || 'pending';
    if (!LEGAL_ROUND_STATUSES[st]) {
      return {
        ok: false,
        reason: 'journal_corrupt',
        detail: 'round_status_invalid',
        index: i,
        status: st
      };
    }
    if (seenRound[rid]) {
      return { ok: false, reason: 'journal_corrupt', detail: 'duplicate_roundId', roundId: rid };
    }
    if (seenMatch[mid]) {
      return { ok: false, reason: 'journal_corrupt', detail: 'duplicate_matchId', matchId: mid };
    }
    seenRound[rid] = true;
    seenMatch[mid] = true;

    var ctx = payload.seriesContext;
    if (!ctx || typeof ctx !== 'object') {
      return { ok: false, reason: 'journal_corrupt', detail: 'series_context_missing', index: i };
    }
    if (ctx.managed !== true) {
      return { ok: false, reason: 'journal_corrupt', detail: 'series_context_not_managed', index: i };
    }
    if (asString(ctx.seriesId).trim() !== seriesId) {
      return { ok: false, reason: 'journal_corrupt', detail: 'series_context_seriesId', index: i };
    }
    if (asString(ctx.roundId).trim() !== rid) {
      return { ok: false, reason: 'journal_corrupt', detail: 'series_context_roundId', index: i };
    }
    if (asString(ctx.publishToken).trim() !== publishToken) {
      return { ok: false, reason: 'journal_corrupt', detail: 'series_context_publishToken', index: i };
    }
    if (asString(ctx.registrationAuthority).trim() !== 'series') {
      return {
        ok: false,
        reason: 'journal_corrupt',
        detail: 'series_context_registrationAuthority',
        index: i
      };
    }
    if (asString(payload.matchId).trim() !== mid) {
      return { ok: false, reason: 'journal_corrupt', detail: 'payload_matchId_mismatch', index: i };
    }
    if (!storedPayloadFingerprintAgrees(payload, pfp, journal)) {
      return {
        ok: false,
        reason: 'journal_corrupt',
        detail: 'payload_fingerprint_mismatch',
        index: i
      };
    }
  }

  var recomputedPlanFp = computePlanFingerprint(rounds);
  if (recomputedPlanFp !== planFingerprint) {
    return { ok: false, reason: 'journal_corrupt', detail: 'plan_fingerprint_mismatch' };
  }
  return { ok: true, reason: 'valid', journal: journal };
}

/** @deprecated 弱结构探测；执行路径请用 validateFrozenJournal */
function isStructurallyFrozenJournal(journal) {
  return validateFrozenJournal(journal).ok === true;
}

/**
 * @param {object} series
 * @param {object} round
 * @param {{ matchId: string, publishToken?: string, createdAt?: number, creatorId?: string }} options
 *   creatorId 须来自 Series.createdBy；禁止用当前操作者覆盖。
 */
function buildMatchFromSeriesRound(series, round, options) {
  var opts = options || {};
  var matchId = asString(opts.matchId).trim();
  if (!matchId) {
    return { ok: false, reason: 'match_id_required' };
  }
  if (!series || !round) {
    return { ok: false, reason: 'invalid_args' };
  }
  // Series.createdBy 权威；opts.creatorId 仅作显式透传（须与 Series 一致）
  var seriesCreator = asString(series.createdBy).trim();
  var optCreator = asString(opts.creatorId).trim();
  var creatorId = seriesCreator || optCreator;
  if (!creatorId) {
    return { ok: false, reason: 'creator_required' };
  }
  if (seriesCreator && optCreator && seriesCreator !== optCreator) {
    return { ok: false, reason: 'creator_mismatch' };
  }
  var hostMode = asString(series.hostMode).trim();
  var matchType = hostMode === 'team' ? 'team-internal' : 'inter-team';
  var ctx = buildSeriesContext(series, round, opts);
  if (!ctx.seriesId || !ctx.roundId || !ctx.publishToken) {
    return { ok: false, reason: 'series_context_incomplete' };
  }
  var teamGroups = buildTeamGroupsFromSeries(series);
  if (teamGroups.length < 2) {
    return { ok: false, reason: 'participants_min' };
  }
  var feeMapped = mapRoundFeeToFeeList(round.fee, round.roundId);
  if (!feeMapped.ok) {
    return { ok: false, reason: 'fee_invalid' };
  }
  var competition = buildTeamCompetitionForStation(series, round);
  if (!competition.ok) {
    return { ok: false, reason: competition.reason || 'team_competition_invalid' };
  }
  var org = series.organization || {};
  var host = series.hostTeam || {};
  var organizationId = '';
  var organizationName = '';
  var organizationLogo = '';
  var teamId = '';
  var teamName = '';
  var teamLogo = '';
  if (matchType === 'inter-team') {
    organizationId = asString(org.organizationId).trim();
    organizationName = asString(org.organizationName).trim();
    organizationLogo = asString(org.organizationLogo).trim();
    teamId = organizationId;
    teamName = organizationName;
    teamLogo = organizationLogo;
  } else {
    teamId = asString(host.teamId).trim();
    teamName = asString(host.teamName).trim();
    teamLogo = asString(host.teamLogo).trim();
  }
  var tee = asString(round.dateTime).trim();
  // Series 不再配置报名窗；分站截止留空（报名状态机 4C-4）
  var deadline = '';
  var feeList = feeMapped.feeList;
  var match = {
    matchId: matchId,
    matchType: matchType,
    teamId: teamId,
    teamName: teamName,
    teamLogo: teamLogo,
    organizationId: organizationId,
    organizationName: organizationName,
    organizationLogo: organizationLogo,
    matchLogo: matchType === 'inter-team' ? organizationLogo : teamLogo,
    logoConfig: { type: 'default', url: '', source: matchType === 'inter-team' ? 'org' : 'team' },
    roundName: buildStationRoundName(series.seriesName, round.name),
    gameMode: asString(round.gameMode).trim(),
    feeList: feeList,
    feeSet: feeList.length > 0,
    isDiamondMode: false,
    eventInfoList: cloneEventInfoList(series.eventInfoList),
    teamGroups: teamGroups,
    scoringRules: { teamCompetition: competition.teamCompetition },
    registerInfo: { totalCount: 0, users: [] },
    groups: [],
    pairings: {},
    scoreData: {},
    bannerImage: '',
    courseId: asString(round.courseId).trim(),
    courseName: asString(round.courseName).trim(),
    courseLocation: asString(round.courseLocation).trim(),
    courseHalfText: asString(round.courseHalfText).trim(),
    front9Course: round.front9Course != null ? deepClone(round.front9Course) : null,
    back9Course: round.back9Course != null ? deepClone(round.back9Course) : null,
    teeTime: tee,
    teeTimeText: tee,
    deadlineTime: deadline,
    deadlineTimeText: deadline,
    visibility: series.visibility === 'private' ? 'private' : 'public',
    accessCode: series.visibility === 'private' ? asString(series.accessCode).trim() : '',
    groupPermission: 'admin',
    registrationStatus: 'closed',
    registrationLogs: [],
    status: 'registering',
    statusLabel: '报名中',
    tempAdmins: [],
    caddieScoringAccess: null,
    tempAdminAccess: null,
    createdBy: creatorId,
    creatorId: creatorId,
    createdAt: opts.createdAt != null ? Number(opts.createdAt) : Date.now(),
    seriesContext: ctx
  };
  var payloadCanonical = extractStationPayloadForFingerprint(match);
  var payloadFingerprint = fingerprintOf(payloadCanonical);
  return {
    ok: true,
    match: match,
    payloadFingerprint: payloadFingerprint,
    payloadCanonical: payloadCanonical
  };
}

/**
 * 冻结单轮计划（含完整 match 载荷）
 */
function freezeRoundPlan(series, round, matchId, options) {
  var built = buildMatchFromSeriesRound(series, round, Object.assign({}, options || {}, { matchId: matchId }));
  if (!built.ok) return built;
  return {
    ok: true,
    roundId: asString(round.roundId).trim(),
    matchId: asString(matchId).trim(),
    payloadFingerprint: built.payloadFingerprint,
    matchPayload: deepClone(built.match)
  };
}

module.exports = {
  PLAN_VERSION: PLAN_VERSION,
  FINGERPRINT_VERSION: FINGERPRINT_VERSION,
  STRICT_FEE_PATTERN: STRICT_FEE_PATTERN,
  stableStringify: stableStringify,
  fingerprintOf: fingerprintOf,
  isSeriesManagedMatch: isSeriesManagedMatch,
  resolveSeriesParticipantMode: resolveSeriesParticipantMode,
  buildSeriesContext: buildSeriesContext,
  buildTeamGroupsFromSeries: buildTeamGroupsFromSeries,
  mapRoundFeeToFeeList: mapRoundFeeToFeeList,
  normalizeFeeToFeeList: normalizeFeeToFeeList,
  validateRoundsFees: validateRoundsFees,
  buildTeamCompetitionForStation: buildTeamCompetitionForStation,
  buildStationRoundName: buildStationRoundName,
  canonicalizeTeamGroupsForFingerprint: canonicalizeTeamGroupsForFingerprint,
  extractStationPayloadForFingerprint: extractStationPayloadForFingerprint,
  computeStationPayloadFingerprint: computeStationPayloadFingerprint,
  stationPayloadsEqual: stationPayloadsEqual,
  computeSeriesPlanSourceFingerprint: computeSeriesPlanSourceFingerprint,
  computePlanFingerprint: computePlanFingerprint,
  journalHasFingerprintVersion: journalHasFingerprintVersion,
  storedPayloadFingerprintAgrees: storedPayloadFingerprintAgrees,
  LEGAL_JOURNAL_PHASES: LEGAL_JOURNAL_PHASES,
  LEGAL_ROUND_STATUSES: LEGAL_ROUND_STATUSES,
  validateFrozenJournal: validateFrozenJournal,
  isStructurallyFrozenJournal: isStructurallyFrozenJournal,
  buildMatchFromSeriesRound: buildMatchFromSeriesRound,
  freezeRoundPlan: freezeRoundPlan
};
