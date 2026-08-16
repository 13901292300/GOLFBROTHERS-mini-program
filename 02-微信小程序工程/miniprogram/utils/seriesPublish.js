/**
 * Series 发布编排（4C-1 窄修）
 * - 首次 planPublish 冻结完整计划；已有 planFingerprint 的 journal 禁止再冻
 * - journal 写入为阶段闸门；resume 只用冻结载荷
 * - now 可注入；未来开球仅首次 plan 检查
 * - 自测必须注入内存 adapter
 */

var seriesIds = require('./seriesIds.js');
var seriesModel = require('./seriesModel.js');
var seriesValidators = require('./seriesValidators.js');
var seriesStationMatch = require('./seriesStationMatch.js');
var seriesStoreMod = require('./seriesStore.js');
var seriesStationIndexMod = require('./seriesStationIndex.js');
var seriesPublishJournalMod = require('./seriesPublishJournal.js');
var teamMatchStore = require('./teamMatchStore.js');
var seriesFinishLock = require('./seriesFinishLock.js');

var LOCAL_DT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/;

function deepClone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function asString(v) {
  return v == null ? '' : String(v);
}

function parseLocalDateTimeToMs(text) {
  var m = LOCAL_DT_PATTERN.exec(String(text || '').trim());
  if (!m) return null;
  var y = Number(m[1]);
  var mo = Number(m[2]);
  var d = Number(m[3]);
  var h = Number(m[4]);
  var mi = Number(m[5]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  var dt = new Date(y, mo - 1, d, h, mi, 0, 0);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== mo - 1 ||
    dt.getDate() !== d ||
    dt.getHours() !== h ||
    dt.getMinutes() !== mi
  ) {
    return null;
  }
  return dt.getTime();
}

function validateFutureRoundDateTimes(series, nowMs) {
  var errors = [];
  var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
  var now = Number(nowMs);
  if (!Number.isFinite(now)) {
    return { ok: false, errors: [{ code: 'now_invalid', message: 'now 无效', path: 'now' }] };
  }
  for (var i = 0; i < rounds.length; i++) {
    var r = rounds[i] || {};
    var path = 'rounds[' + i + '].dateTime';
    var ms = parseLocalDateTimeToMs(r.dateTime);
    if (ms == null) {
      errors.push({ code: 'datetime_invalid', message: '开球时间无法解析', path: path });
      continue;
    }
    if (!(ms > now)) {
      errors.push({
        code: 'datetime_not_future',
        message: '发布时每轮开球时间须晚于当前时间',
        path: path
      });
    }
  }
  return { ok: errors.length === 0, errors: errors };
}

function createMemoryMatchRepo(options) {
  var map = Object.create(null);
  var normalizeOnGet = !!(options && options.normalizeOnGet);

  function getMatchById(matchId) {
    var mid = asString(matchId).trim();
    if (!mid || !map[mid]) return null;
    var next = deepClone(map[mid]);
    if (normalizeOnGet && Array.isArray(next.teamGroups)) {
      next.teamGroups = teamMatchStore.cloneTeamGroups(next.teamGroups);
    }
    return next;
  }

  function existsMatchId(matchId) {
    return !!getMatchById(matchId);
  }

  function saveMatchChecked(match) {
    return teamMatchStore.saveMatchChecked(match, {
      getMatchById: getMatchById,
      writeMatch: function (m) {
        if (!m || !m.matchId) return { ok: false, reason: 'match_id_required' };
        map[String(m.matchId)] = deepClone(m);
        return { ok: true };
      }
    });
  }

  return {
    getMatchById: getMatchById,
    existsMatchId: existsMatchId,
    saveMatchChecked: saveMatchChecked,
    _dump: function () {
      return deepClone(map);
    },
    _count: function () {
      return Object.keys(map).length;
    },
    _remove: function (matchId) {
      var mid = asString(matchId).trim();
      if (mid && map[mid]) delete map[mid];
    },
    /** 自测专用：绕过 checked 直接注入（用于制造 payload 冲突） */
    _inject: function (match) {
      if (!match || !match.matchId) return;
      map[String(match.matchId)] = deepClone(match);
    }
  };
}

function createSeriesPublisher(deps) {
  var d = deps || {};
  var seriesStore = d.seriesStore || seriesStoreMod;
  var stationIndex = d.stationIndex || seriesStationIndexMod;
  var journalStore = d.journal || seriesPublishJournalMod;
  var matchRepo = d.matchRepo || {
    getMatchById: function (id) {
      return teamMatchStore.getMatchById(id);
    },
    existsMatchId: function (id) {
      return teamMatchStore.existsMatchId(id);
    },
    saveMatchChecked: function (match) {
      return teamMatchStore.saveMatchChecked(match);
    },
  };
  var nowFn =
    typeof d.now === 'function'
      ? d.now
      : function () {
          return Date.now();
        };

  function resolveNow(options) {
    var opts = options || {};
    if (opts.now != null) {
      var n = Number(opts.now);
      if (Number.isFinite(n)) return n;
    }
    return Number(nowFn());
  }

  function loadSeries(seriesId) {
    var sid = asString(seriesId).trim();
    if (!sid) return null;
    return seriesStore.getSeriesById(sid);
  }

  function persistJournal(journal) {
    var saved = journalStore.saveJournal(journal);
    if (!saved || !saved.ok) {
      return {
        ok: false,
        reason: 'journal_write_failed',
        detail: saved && saved.reason
      };
    }
    return { ok: true, journal: saved.journal };
  }

  function applyMatchIdsToSeries(series, journal) {
    var next = deepClone(series);
    var byRound = Object.create(null);
    (Array.isArray(journal.rounds) ? journal.rounds : []).forEach(function (rp) {
      byRound[asString(rp.roundId).trim()] = asString(rp.matchId).trim();
    });
    next.rounds = (Array.isArray(next.rounds) ? next.rounds : []).map(function (r) {
      var nr = deepClone(r);
      var mid = byRound[asString(r.roundId).trim()];
      if (mid) nr.matchId = mid;
      return nr;
    });
    return next;
  }

  /**
   * 首次发布报名默认值受控落盘（严格条件）：
   * 仅当 published + registrationState===closed + registrationRevision===0
   * → 写为 open / revision=1。
   * open、closed+rev>0、draft、cancelled、archived 一律不写。
   * @returns {{ ok: boolean, changed: boolean, series?: object, reason?: string }}
   */
  function persistFirstPublishRegistrationDefaults(seriesInput) {
    var series = seriesInput && typeof seriesInput === 'object' ? seriesInput : null;
    if (!series) {
      return { ok: false, changed: false, reason: 'series_required' };
    }
    var life = asString(series.lifecycleStatus).trim();
    if (life !== 'published') {
      return { ok: true, changed: false, series: series, reason: 'not_published' };
    }
    if (seriesFinishLock.isSeriesCompleted(series)) {
      return { ok: true, changed: false, series: series, reason: 'series_completed' };
    }
    var state = asString(series.registrationState).trim();
    if (state !== 'closed') {
      return { ok: true, changed: false, series: series, reason: 'registration_not_closed' };
    }
    var rev = seriesModel.normalizeRegistrationRevision(series.registrationRevision);
    if (rev !== 0) {
      return {
        ok: true,
        changed: false,
        series: series,
        reason: 'registration_explicitly_closed'
      };
    }
    var regFix = seriesModel.applyFirstPublishRegistrationDefaults(series);
    if (!regFix.changed) {
      return {
        ok: true,
        changed: false,
        series: regFix.series,
        reason: 'registration_defaults_noop'
      };
    }
    regFix.series.lifecycleStatus = 'published';
    regFix.series.registrationState = 'open';
    regFix.series.registrationRevision = 1;
    var up = seriesStore.upsertSeries(regFix.series);
    if (!up.ok) {
      return {
        ok: false,
        changed: false,
        series: series,
        reason: up.reason || 'series_registration_default_failed'
      };
    }
    return {
      ok: true,
      changed: true,
      series: up.series,
      reason: 'registration_defaults_applied'
    };
  }

  /**
   * 显式按 seriesId 修复旧发布结果（幂等）。
   * 供创建/发布恢复链路调用；禁止首页列表隐式调用。
   */
  function repairFirstPublishRegistrationDefaultsById(seriesId) {
    var sid = asString(seriesId).trim();
    if (!sid) {
      return { ok: false, changed: false, reason: 'series_id_required' };
    }
    var series = null;
    try {
      series = loadSeries(sid);
    } catch (e) {
      return { ok: false, changed: false, reason: 'series_read_failed' };
    }
    if (!series) {
      return { ok: false, changed: false, reason: 'series_not_found' };
    }
    return persistFirstPublishRegistrationDefaults(series);
  }

  function persistSeriesDraftRuntime(series, patch) {
    var next = deepClone(series);
    Object.keys(patch || {}).forEach(function (k) {
      next[k] = patch[k];
    });
    next.lifecycleStatus = 'draft';
    var saved = seriesStore.saveDraft(next);
    if (!saved || !saved.ok) {
      return {
        ok: false,
        reason: saved && saved.reason ? saved.reason : 'series_draft_write_failed',
        series: series
      };
    }
    return { ok: true, series: saved.series };
  }

  function markSeriesPublishing(series, journal) {
    var withIds = applyMatchIdsToSeries(series, journal);
    return persistSeriesDraftRuntime(withIds, {
      publishState: 'publishing',
      publishToken: asString(journal.publishToken).trim()
    });
  }

  function markSeriesFailed(series, journal) {
    var withIds = applyMatchIdsToSeries(series, journal);
    return persistSeriesDraftRuntime(withIds, {
      publishState: 'failed',
      publishToken: asString(journal.publishToken).trim()
    });
  }

  function failWithJournal(journal, series, businessReason, extra) {
    var j = deepClone(journal);
    j.phase = 'failed';
    j.lastError = businessReason;
    var jSave = persistJournal(j);
    var sRes = series ? markSeriesFailed(series, j) : { ok: true, series: series };
    var out = Object.assign(
      {
        ok: false,
        reason: businessReason,
        journal: jSave.ok ? jSave.journal : j,
        series: sRes.ok ? sRes.series : series
      },
      extra || {}
    );
    if (!jSave.ok) {
      out.journal_write_failed = true;
      out.journalPersistFailed = true;
      out.journalWriteReason = jSave.detail || 'journal_write_failed';
      out.message =
        '业务失败=' +
        businessReason +
        '；且 journal 未能持久化为 failed（journal_write_failed），内存态未保证已落盘';
    }
    return out;
  }

  /**
   * 首次冻结完整 publish plan（含每轮 matchPayload）
   * 已有结构合法且带 planFingerprint 的 journal → 一律 plan_already_frozen
   */
  function planPublish(seriesInput, options) {
    var opts = options || {};
    var series = seriesModel.normalizeSeries(seriesInput || {});
    var sid = asString(series.seriesId).trim();
    if (!sid) {
      return { ok: false, reason: 'series_id_required' };
    }
    var completedGate = seriesFinishLock.assertSeriesWritable(series);
    if (!completedGate.ok) {
      return { ok: false, reason: 'series_completed', message: completedGate.message };
    }

    var existingJ = journalStore.getJournal(sid);
    if (!existingJ.ok) {
      return { ok: false, reason: existingJ.reason || 'journal_read_failed' };
    }
    if (existingJ.journal) {
      var existingValid = seriesStationMatch.validateFrozenJournal(existingJ.journal);
      if (existingValid.ok) {
        return {
          ok: false,
          reason: 'plan_already_frozen',
          journal: existingJ.journal
        };
      }
      return {
        ok: false,
        reason: 'journal_corrupt',
        detail: existingValid.detail,
        journal: existingJ.journal,
        message: '已存在非法/损坏 journal，本批不提供放弃/重建'
      };
    }

    var pubCheck = seriesValidators.validateForPublish(series);
    if (!pubCheck.ok) {
      return { ok: false, reason: 'publish_invalid', errors: pubCheck.errors };
    }

    var feeCheck = seriesStationMatch.validateRoundsFees(series);
    if (!feeCheck.ok) {
      return { ok: false, reason: 'fee_invalid', errors: feeCheck.errors };
    }

    var nowMs = resolveNow(opts);
    var futureCheck = validateFutureRoundDateTimes(series, nowMs);
    if (!futureCheck.ok) {
      return { ok: false, reason: 'datetime_not_future', errors: futureCheck.errors };
    }

    if (!asString(series.publishToken).trim()) {
      series.publishToken = seriesIds.generatePublishToken();
      var tokenPersist = persistSeriesDraftRuntime(series, {
        publishToken: series.publishToken,
        publishState: asString(series.publishState).trim() || 'idle'
      });
      if (!tokenPersist.ok) {
        return {
          ok: false,
          reason: 'publish_token_persist_failed',
          detail: tokenPersist.reason
        };
      }
      series = tokenPersist.series;
    }

    // 创建者只认落盘 Series.createdBy；禁止用当前操作者 opts.creatorId 冒充/覆盖
    var seriesCreator = asString(series.createdBy).trim();
    if (!seriesCreator) {
      return {
        ok: false,
        reason: 'creator_required',
        message: '无法确认创建者身份，请重新创建系列赛'
      };
    }

    var rounds = Array.isArray(series.rounds) ? series.rounds : [];
    var matchIds = seriesIds.allocateUniqueMatchIds(rounds.length, {
      existsFn: function (id) {
        return matchRepo.existsMatchId(id);
      }
    });

    var roundPlans = [];
    for (var i = 0; i < rounds.length; i++) {
      var frozen = seriesStationMatch.freezeRoundPlan(series, rounds[i], matchIds[i], {
        publishToken: series.publishToken,
        createdAt: nowMs,
        creatorId: seriesCreator
      });
      if (!frozen.ok) {
        return { ok: false, reason: frozen.reason || 'freeze_failed', roundIndex: i };
      }
      roundPlans.push({
        roundId: frozen.roundId,
        matchId: frozen.matchId,
        payloadFingerprint: frozen.payloadFingerprint,
        matchPayload: frozen.matchPayload,
        status: 'pending',
        lastError: ''
      });
    }

    var planFingerprint = seriesStationMatch.computePlanFingerprint(roundPlans);
    var sourceFingerprint = seriesStationMatch.computeSeriesPlanSourceFingerprint(series);
    var journal = {
      seriesId: sid,
      publishToken: asString(series.publishToken).trim(),
      planVersion: seriesStationMatch.PLAN_VERSION,
      fingerprintVersion: seriesStationMatch.FINGERPRINT_VERSION,
      planFingerprint: planFingerprint,
      sourceFingerprint: sourceFingerprint,
      phase: 'planned',
      nowAtPlan: nowMs,
      rounds: roundPlans,
      lastError: '',
      audit: {
        plannedAt: new Date(nowMs).toISOString(),
        roundCount: roundPlans.length
      }
    };
    var saved = persistJournal(journal);
    if (!saved.ok) {
      return { ok: false, reason: 'journal_write_failed', detail: saved.detail };
    }
    return { ok: true, journal: saved.journal, series: series };
  }

  function precheckConflicts(journal) {
    var rounds = Array.isArray(journal.rounds) ? journal.rounds : [];
    for (var i = 0; i < rounds.length; i++) {
      var rp = rounds[i];
      var mid = asString(rp.matchId).trim();
      var existing = matchRepo.getMatchById(mid);
      if (existing) {
        var ctx = existing.seriesContext || {};
        var sameIdentity =
          ctx.managed === true &&
          asString(ctx.seriesId).trim() === asString(journal.seriesId).trim() &&
          asString(ctx.roundId).trim() === asString(rp.roundId).trim() &&
          asString(ctx.publishToken).trim() === asString(journal.publishToken).trim();
        if (!sameIdentity) {
          return {
            ok: false,
            reason: 'match_id_conflict',
            matchId: mid,
            roundId: rp.roundId
          };
        }
        var eq = seriesStationMatch.stationPayloadsEqual(existing, rp.matchPayload);
        if (!eq.equal) {
          return {
            ok: false,
            reason: 'payload_conflict',
            matchId: mid,
            roundId: rp.roundId,
            detail: eq.reason
          };
        }
      }
      var link = stationIndex.getByMatchId(mid);
      if (link) {
        if (
          asString(link.seriesId).trim() !== asString(journal.seriesId).trim() ||
          asString(link.roundId).trim() !== asString(rp.roundId).trim()
        ) {
          return {
            ok: false,
            reason: 'index_conflict',
            matchId: mid,
            link: link
          };
        }
      }
    }
    return { ok: true };
  }

  function assertSourceNotDrifted(series, journal) {
    var currentFp = seriesStationMatch.computeSeriesPlanSourceFingerprint(series);
    if (currentFp !== journal.sourceFingerprint) {
      return {
        ok: false,
        reason: 'plan_source_conflict',
        message: '当前草稿与冻结发布计划不一致，禁止用新草稿重建分站'
      };
    }
    return { ok: true };
  }

  function countRoundStatus(journal, status) {
    var rounds = Array.isArray(journal && journal.rounds) ? journal.rounds : [];
    var n = 0;
    for (var i = 0; i < rounds.length; i++) {
      if (rounds[i] && rounds[i].status === status) n += 1;
    }
    return n;
  }

  function countMatchesPresent(journal) {
    var rounds = Array.isArray(journal && journal.rounds) ? journal.rounds : [];
    var n = 0;
    for (var i = 0; i < rounds.length; i++) {
      var mid = asString(rounds[i] && rounds[i].matchId).trim();
      if (mid && matchRepo.getMatchById(mid)) n += 1;
    }
    return n;
  }

  function countIndexPresent(journal) {
    var rounds = Array.isArray(journal && journal.rounds) ? journal.rounds : [];
    var n = 0;
    for (var i = 0; i < rounds.length; i++) {
      var rp = rounds[i];
      var mid = asString(rp && rp.matchId).trim();
      var link = mid ? stationIndex.getByMatchId(mid) : null;
      if (
        link &&
        asString(link.seriesId).trim() === asString(journal.seriesId).trim() &&
        asString(link.roundId).trim() === asString(rp.roundId).trim()
      ) {
        n += 1;
      }
    }
    return n;
  }

  /**
   * 核验 published Series + 冻结 Journal 下的实体完整性（只读）。
   */
  function inspectPublishedEntities(series, journal) {
    var report = {
      ok: true,
      tokenMismatch: false,
      roundCountMismatch: false,
      missingMatches: [],
      payloadConflicts: [],
      identityConflicts: [],
      missingIndexes: [],
      indexConflicts: [],
      seriesMatchIdMismatches: []
    };
    if (!series || !journal) {
      report.ok = false;
      return report;
    }
    if (asString(series.publishToken).trim() !== asString(journal.publishToken).trim()) {
      report.tokenMismatch = true;
      report.ok = false;
    }
    var jRounds = Array.isArray(journal.rounds) ? journal.rounds : [];
    var sRounds = Array.isArray(series.rounds) ? series.rounds : [];
    if (sRounds.length !== jRounds.length) {
      report.roundCountMismatch = true;
      report.ok = false;
    }
    var seriesMatchByRound = Object.create(null);
    sRounds.forEach(function (r) {
      seriesMatchByRound[asString(r && r.roundId).trim()] = asString(r && r.matchId).trim();
    });

    for (var i = 0; i < jRounds.length; i++) {
      var rp = jRounds[i];
      var rid = asString(rp.roundId).trim();
      var mid = asString(rp.matchId).trim();
      var seriesMid = seriesMatchByRound[rid];
      if (!seriesMid || seriesMid !== mid) {
        report.seriesMatchIdMismatches.push({
          roundId: rid,
          expectedMatchId: mid,
          actualMatchId: seriesMid || ''
        });
        report.ok = false;
      }
      var existing = matchRepo.getMatchById(mid);
      if (!existing) {
        report.missingMatches.push({ roundId: rid, matchId: mid });
        report.ok = false;
      } else {
        var ect = existing.seriesContext || {};
        var sameIdentity =
          ect.managed === true &&
          asString(ect.seriesId).trim() === asString(journal.seriesId).trim() &&
          asString(ect.roundId).trim() === rid &&
          asString(ect.publishToken).trim() === asString(journal.publishToken).trim() &&
          asString(ect.registrationAuthority).trim() === 'series';
        if (!sameIdentity) {
          report.identityConflicts.push({ roundId: rid, matchId: mid });
          report.ok = false;
        } else {
          var eq = seriesStationMatch.stationPayloadsEqual(existing, rp.matchPayload);
          if (!eq.equal) {
            report.payloadConflicts.push({
              roundId: rid,
              matchId: mid,
              detail: eq.reason
            });
            report.ok = false;
          }
        }
      }
      var link = stationIndex.getByMatchId(mid);
      if (!link) {
        report.missingIndexes.push({ roundId: rid, matchId: mid });
        report.ok = false;
      } else if (
        asString(link.seriesId).trim() !== asString(journal.seriesId).trim() ||
        asString(link.roundId).trim() !== rid
      ) {
        report.indexConflicts.push({
          roundId: rid,
          matchId: mid,
          link: deepClone(link)
        });
        report.ok = false;
      }
    }
    return report;
  }

  function markJournalDone(journal, series, auditExtra) {
    var j = deepClone(journal);
    j.phase = 'done';
    j.lastError = '';
    j.doneAt = j.doneAt || new Date().toISOString();
    j.audit = Object.assign({}, j.audit || {}, {
      completedAt: j.doneAt,
      matchIds: (j.rounds || []).map(function (r) {
        return r.matchId;
      })
    }, auditExtra || {});
    var saved = persistJournal(j);
    if (!saved.ok) {
      return {
        ok: false,
        reason: 'journal_finalize_failed',
        seriesPublished: true,
        series: series,
        journal: j,
        journal_write_failed: true,
        message: 'Series 可能已 published，可安全重试以补齐 journal done'
      };
    }
    return {
      ok: true,
      reason: 'repaired_journal_done',
      journal: saved.journal,
      series: series
    };
  }

  /**
   * published + journal 未 done：核验实体；可补写缺失 match/index；冲突则停止；全过才标 done。
   * 不得降级 Series，不得重规划，不得覆盖冲突分站。
   */
  function repairPublishedJournal(series, journal) {
    var v = seriesStationMatch.validateFrozenJournal(journal);
    if (!v.ok) {
      return {
        ok: false,
        reason: 'journal_corrupt',
        detail: v.detail,
        series: series,
        journal: journal
      };
    }

    var report = inspectPublishedEntities(series, journal);
    if (report.tokenMismatch) {
      return {
        ok: false,
        reason: 'publish_token_conflict',
        entities: report,
        series: series,
        journal: journal
      };
    }
    if (report.identityConflicts.length || report.payloadConflicts.length || report.indexConflicts.length) {
      return {
        ok: false,
        reason: 'published_entity_conflict',
        entities: report,
        series: series,
        journal: journal
      };
    }

    // 补写缺失分站（frozen payload；不相等已在上面拦掉）
    var rounds = Array.isArray(journal.rounds) ? journal.rounds : [];
    for (var i = 0; i < rounds.length; i++) {
      var rp = rounds[i];
      var mid = asString(rp.matchId).trim();
      if (!matchRepo.getMatchById(mid)) {
        var wr = matchRepo.saveMatchChecked(deepClone(rp.matchPayload));
        if (!wr.ok) {
          return {
            ok: false,
            reason: wr.reason || 'match_write_failed',
            entities: report,
            failedRoundId: rp.roundId,
            series: series,
            journal: journal
          };
        }
      }
    }

    // 补写缺失索引
    for (var j = 0; j < rounds.length; j++) {
      var r2 = rounds[j];
      var mid2 = asString(r2.matchId).trim();
      var link = stationIndex.getByMatchId(mid2);
      if (!link) {
        var lr = stationIndex.setLink(mid2, journal.seriesId, r2.roundId);
        if (!lr.ok) {
          return {
            ok: false,
            reason: lr.reason || 'index_failed',
            entities: report,
            failedRoundId: r2.roundId,
            series: series,
            journal: journal
          };
        }
      } else if (
        asString(link.seriesId).trim() !== asString(journal.seriesId).trim() ||
        asString(link.roundId).trim() !== asString(r2.roundId).trim()
      ) {
        return {
          ok: false,
          reason: 'index_conflict',
          entities: report,
          series: series,
          journal: journal
        };
      }
    }

    // Series 轮次 matchId 与计划不一致：在保持 published 下对齐（不降级）
    var needSeriesFix = report.seriesMatchIdMismatches.length > 0 || report.roundCountMismatch;
    if (needSeriesFix) {
      var aligned = applyMatchIdsToSeries(series, journal);
      aligned.lifecycleStatus = 'published';
      aligned.publishState = 'published';
      aligned.publishToken = asString(journal.publishToken).trim();
      aligned = seriesModel.applyFirstPublishRegistrationDefaults(aligned).series;
      var up = seriesStore.upsertSeries(aligned);
      if (!up.ok) {
        return {
          ok: false,
          reason: up.reason || 'series_align_failed',
          entities: report,
          series: series,
          journal: journal
        };
      }
      series = up.series;
    } else {
      // repair：缺省 closed/rev0 → open/rev1；已 open 或明确关闭(rev>0)不改
      var regPersist = persistFirstPublishRegistrationDefaults(series);
      if (!regPersist.ok) {
        return {
          ok: false,
          reason: regPersist.reason || 'series_registration_default_failed',
          entities: report,
          series: series,
          journal: journal
        };
      }
      series = regPersist.series || series;
    }

    var finalReport = inspectPublishedEntities(series, journal);
    if (!finalReport.ok) {
      return {
        ok: false,
        reason: 'published_entity_incomplete',
        entities: finalReport,
        series: series,
        journal: journal
      };
    }
    return markJournalDone(journal, series, { repairedDoneFromPublished: true });
  }

  /**
   * 执行 / 恢复发布。resume 使用冻结 plan，不做未来开球重检。
   */
  function publishSeries(seriesId, options) {
    var opts = options || {};
    var sid = asString(seriesId).trim();
    if (!sid) return { ok: false, reason: 'series_id_required' };

    var series = loadSeries(sid);
    if (!series) return { ok: false, reason: 'series_not_found' };
    var completedGate = seriesFinishLock.assertSeriesWritable(series);
    if (!completedGate.ok) {
      return { ok: false, reason: 'series_completed', message: completedGate.message };
    }

    var jRes = journalStore.getJournal(sid);
    if (!jRes.ok) return { ok: false, reason: jRes.reason || 'journal_read_failed' };
    var journal = jRes.journal;

    if (series.lifecycleStatus === 'published') {
      if (!journal) {
        return {
          ok: false,
          reason: 'published_without_frozen_journal',
          series: series
        };
      }
      var pubJv = seriesStationMatch.validateFrozenJournal(journal);
      if (!pubJv.ok) {
        return {
          ok: false,
          reason: 'journal_corrupt',
          detail: pubJv.detail,
          series: series,
          journal: journal
        };
      }
      if (journal.phase === 'done') {
        var doneEntities = inspectPublishedEntities(series, journal);
        if (!doneEntities.ok) {
          return {
            ok: false,
            reason: 'published_entity_conflict',
            entities: doneEntities,
            series: series,
            journal: journal
          };
        }
        // 历史缺陷：published+done 曾跳过报名默认落盘；此处幂等补 open/rev1（rev>0 不重开）
        var doneReg = persistFirstPublishRegistrationDefaults(series);
        if (!doneReg.ok) {
          return {
            ok: false,
            reason: doneReg.reason || 'series_registration_default_failed',
            series: series,
            journal: journal
          };
        }
        return {
          ok: true,
          reason: 'already_published',
          journal: journal,
          series: doneReg.series || series
        };
      }
      return repairPublishedJournal(series, journal);
    }

    if (!journal) {
      var planned = planPublish(series, opts);
      if (!planned.ok) return planned;
      journal = planned.journal;
      series = planned.series || series;
    } else {
      var jv = seriesStationMatch.validateFrozenJournal(journal);
      if (!jv.ok) {
        return {
          ok: false,
          reason: 'journal_corrupt',
          detail: jv.detail,
          journal: journal,
          series: series
        };
      }
      var drift = assertSourceNotDrifted(series, journal);
      if (!drift.ok) return drift;
    }

    if (journal.phase === 'done') {
      return { ok: true, reason: 'journal_done', journal: journal, series: series };
    }

    // 开始执行：同步 draft 运行态
    var pubSync = markSeriesPublishing(series, journal);
    if (!pubSync.ok) {
      return {
        ok: false,
        reason: 'series_publishing_state_failed',
        detail: pubSync.reason,
        journal: journal
      };
    }
    series = pubSync.series;

    journal.phase = 'precheck';
    journal.lastError = '';
    var preSaved = persistJournal(journal);
    if (!preSaved.ok) {
      return {
        ok: false,
        reason: 'journal_write_failed',
        stage: 'precheck',
        journal: journal
      };
    }
    journal = preSaved.journal;

    var pre = precheckConflicts(journal);
    if (!pre.ok) {
      return failWithJournal(journal, series, pre.reason, { detail: pre });
    }

    journal.phase = 'writing_matches';
    var wmGate = persistJournal(journal);
    if (!wmGate.ok) {
      return {
        ok: false,
        reason: 'journal_write_failed',
        stage: 'writing_matches',
        matchesWritten: 0,
        journal: journal
      };
    }
    journal = wmGate.journal;

    var rounds = Array.isArray(journal.rounds) ? journal.rounds : [];
    for (var i = 0; i < rounds.length; i++) {
      var rp = rounds[i];
      if (rp.status === 'written' || rp.status === 'indexed') continue;
      var payload = deepClone(rp.matchPayload);
      var writeRes = matchRepo.saveMatchChecked(payload);
      if (!writeRes.ok) {
        rp.status = 'failed';
        rp.lastError = writeRes.reason || 'match_write_failed';
        journal.rounds = rounds;
        return failWithJournal(journal, series, rp.lastError, {
          failedRoundId: rp.roundId
        });
      }
      rp.status = 'written';
      rp.lastError = '';
      journal.rounds = rounds;
      var writtenLog = persistJournal(journal);
      if (!writtenLog.ok) {
        return {
          ok: false,
          reason: 'journal_write_failed',
          stage: 'writing_matches',
          businessReason: 'match_written_unlogged',
          journal_write_failed: true,
          failedRoundId: rp.roundId,
          matchesPresent: countMatchesPresent(journal),
          journal: journal,
          message: '分站已写入但 written 日志未落盘，已停止后续轮次；可安全重试'
        };
      }
      journal = writtenLog.journal;
      rounds = Array.isArray(journal.rounds) ? journal.rounds : rounds;
    }

    journal.phase = 'writing_index';
    var idxGate = persistJournal(journal);
    if (!idxGate.ok) {
      return {
        ok: false,
        reason: 'journal_write_failed',
        stage: 'writing_index',
        indexesWritten: 0,
        journal: journal
      };
    }
    journal = idxGate.journal;
    rounds = Array.isArray(journal.rounds) ? journal.rounds : rounds;

    for (var j = 0; j < rounds.length; j++) {
      var r2 = rounds[j];
      if (r2.status === 'indexed') continue;
      var linkRes = stationIndex.setLink(r2.matchId, journal.seriesId, r2.roundId);
      if (!linkRes.ok) {
        r2.lastError = linkRes.reason || 'index_failed';
        journal.rounds = rounds;
        return failWithJournal(journal, series, r2.lastError, {
          failedRoundId: r2.roundId
        });
      }
      r2.status = 'indexed';
      r2.lastError = '';
      journal.rounds = rounds;
      var indexedLog = persistJournal(journal);
      if (!indexedLog.ok) {
        return {
          ok: false,
          reason: 'journal_write_failed',
          stage: 'writing_index',
          businessReason: 'index_written_unlogged',
          journal_write_failed: true,
          failedRoundId: r2.roundId,
          indexesPresent: countIndexPresent(journal),
          journal: journal,
          message: 'index 已写入但 indexed 日志未落盘，已停止后续；可安全重试'
        };
      }
      journal = indexedLog.journal;
      rounds = Array.isArray(journal.rounds) ? journal.rounds : rounds;
    }

    journal.phase = 'finalizing';
    var finGate = persistJournal(journal);
    if (!finGate.ok) {
      return {
        ok: false,
        reason: 'journal_write_failed',
        stage: 'finalizing',
        seriesMigrated: false,
        journal: journal
      };
    }
    journal = finGate.journal;

    var nextSeries = deepClone(series);
    nextSeries.lifecycleStatus = 'published';
    nextSeries.publishState = 'published';
    nextSeries.publishToken = journal.publishToken;
    nextSeries = applyMatchIdsToSeries(nextSeries, journal);
    // 首次成功发布：closed/rev0 → open/rev1；已 open / 明确关闭不重复加 revision
    nextSeries = seriesModel.applyFirstPublishRegistrationDefaults(nextSeries).series;
    nextSeries.lifecycleStatus = 'published';
    nextSeries.publishState = 'published';

    var up = seriesStore.upsertSeries(nextSeries);
    if (!up.ok) {
      return failWithJournal(journal, series, up.reason || 'series_finalize_failed', {
        upsert: up
      });
    }
    series = up.series;
    // 回读加固：若仍 closed/rev0（历史半落盘），再受控写一次
    var finalizeReg = persistFirstPublishRegistrationDefaults(series);
    if (finalizeReg.ok && finalizeReg.series) {
      series = finalizeReg.series;
    }

    journal.phase = 'done';
    journal.lastError = '';
    journal.doneAt = new Date().toISOString();
    journal.audit = Object.assign({}, journal.audit || {}, {
      completedAt: journal.doneAt,
      matchIds: rounds.map(function (r) {
        return r.matchId;
      })
    });
    var doneSave = persistJournal(journal);
    if (!doneSave.ok) {
      return {
        ok: false,
        reason: 'journal_finalize_failed',
        seriesPublished: true,
        series: series,
        journal: journal,
        journal_write_failed: true,
        message: 'Series 可能已 published，可安全重试以补齐 journal done'
      };
    }
    return {
      ok: true,
      reason: 'published',
      journal: doneSave.journal,
      series: series
    };
  }

  function resumePublish(seriesId, options) {
    var sid = asString(seriesId).trim();
    if (!sid) return { ok: false, reason: 'series_id_required' };
    var jRes = journalStore.getJournal(sid);
    if (!jRes.ok) return { ok: false, reason: jRes.reason || 'journal_read_failed' };
    if (!jRes.journal) {
      return { ok: false, reason: 'no_frozen_plan' };
    }
    var v = seriesStationMatch.validateFrozenJournal(jRes.journal);
    if (!v.ok) {
      return {
        ok: false,
        reason: 'journal_corrupt',
        detail: v.detail,
        journal: jRes.journal
      };
    }
    var result = publishSeries(sid, options);
    if (result.ok) {
      if (result.reason === 'repaired_journal_done') {
        return Object.assign({}, result, { reason: 'resume_repaired_done' });
      }
      if (result.reason === 'already_published' || result.reason === 'journal_done') {
        return Object.assign({}, result, { reason: 'resume_already_complete' });
      }
      return Object.assign({}, result, { reason: 'resume_published' });
    }
    return Object.assign({}, result, {
      resumeAttempted: true
    });
  }

  function inspectPublishState(seriesId) {
    var sid = asString(seriesId).trim();
    if (!sid) return { ok: false, reason: 'series_id_required' };
    var series = loadSeries(sid);
    var jRes = journalStore.getJournal(sid);
    if (!jRes.ok) return { ok: false, reason: jRes.reason || 'journal_read_failed' };
    var journal = jRes.journal;
    var journalValidation = journal
      ? seriesStationMatch.validateFrozenJournal(journal)
      : { ok: false, reason: 'journal_corrupt', detail: 'absent' };
    var hasFrozenPlan = journalValidation.ok === true;
    var sourceDrift = false;
    if (series && hasFrozenPlan && journal.sourceFingerprint) {
      // published 后 sourceFingerprint 含草稿语义字段；仅 draft 执行路径强制 drift
      if (series.lifecycleStatus !== 'published') {
        sourceDrift =
          seriesStationMatch.computeSeriesPlanSourceFingerprint(series) !== journal.sourceFingerprint;
      }
    }
    var roundCount = journal && Array.isArray(journal.rounds) ? journal.rounds.length : 0;
    var matchComplete = hasFrozenPlan ? countMatchesPresent(journal) : 0;
    var indexComplete = hasFrozenPlan ? countIndexPresent(journal) : 0;
    var journalPhase = journal ? asString(journal.phase) : '';
    var published = !!(series && series.lifecycleStatus === 'published');
    var publishedWithoutJournalDone = published && (!journal || journalPhase !== 'done');
    var entities = null;
    if (published && hasFrozenPlan) {
      entities = inspectPublishedEntities(series, journal);
    }
    var hasEntityIssues =
      !!(entities &&
        (!entities.ok ||
          entities.missingMatches.length ||
          entities.missingIndexes.length ||
          entities.payloadConflicts.length ||
          entities.indexConflicts.length ||
          entities.identityConflicts.length ||
          entities.seriesMatchIdMismatches.length ||
          entities.tokenMismatch ||
          entities.roundCountMismatch));
    var canRetry =
      hasFrozenPlan &&
      !sourceDrift &&
      (journalPhase !== 'done' || publishedWithoutJournalDone || hasEntityIssues);

    return {
      ok: true,
      seriesId: sid,
      series: series
        ? {
            lifecycleStatus: series.lifecycleStatus,
            publishState: series.publishState,
            publishToken: series.publishToken
          }
        : null,
      journalPhase: journalPhase || null,
      planFingerprint: journal ? journal.planFingerprint : null,
      roundCount: roundCount,
      matchCompleteCount: matchComplete,
      indexCompleteCount: indexComplete,
      writtenStatusCount: hasFrozenPlan ? countRoundStatus(journal, 'written') : 0,
      indexedStatusCount: hasFrozenPlan ? countRoundStatus(journal, 'indexed') : 0,
      sourceDrift: sourceDrift,
      canRetry: canRetry,
      publishedWithoutJournalDone: publishedWithoutJournalDone,
      hasFrozenPlan: hasFrozenPlan,
      journalCorrupt: !!(journal && !hasFrozenPlan),
      journalCorruptDetail: journal && !hasFrozenPlan ? journalValidation.detail : null,
      entities: entities,
      missingMatches: entities ? entities.missingMatches : [],
      missingIndexes: entities ? entities.missingIndexes : [],
      payloadConflicts: entities ? entities.payloadConflicts : [],
      indexConflicts: entities ? entities.indexConflicts : [],
      identityConflicts: entities ? entities.identityConflicts : [],
      seriesMatchIdMismatches: entities ? entities.seriesMatchIdMismatches : [],
      tokenMismatch: entities ? entities.tokenMismatch : false
    };
  }

  /**
   * 仅补偿同一冻结计划：不得删分站、不得重新规划。
   */
  function repairHalfPublished(seriesId, options) {
    var seriesForLock = loadSeries(seriesId);
    if (seriesFinishLock.isSeriesCompleted(seriesForLock)) {
      return { ok: false, reason: 'series_completed' };
    }
    var insp = inspectPublishState(seriesId);
    if (!insp.ok) return insp;
    if (insp.journalCorrupt) {
      return {
        ok: false,
        reason: 'journal_corrupt',
        detail: insp.journalCorruptDetail,
        inspect: insp
      };
    }
    if (!insp.hasFrozenPlan) {
      return { ok: false, reason: 'no_frozen_plan', inspect: insp };
    }
    if (insp.sourceDrift) {
      return { ok: false, reason: 'plan_source_conflict', inspect: insp };
    }
    if (
      insp.journalPhase === 'done' &&
      !insp.publishedWithoutJournalDone &&
      !(insp.entities && !insp.entities.ok)
    ) {
      // journal 已完整时仍须补齐首次发布报名默认（closed/rev0 → open/rev1）
      var seriesForReg = loadSeries(seriesId);
      var regOnly = persistFirstPublishRegistrationDefaults(seriesForReg);
      if (!regOnly.ok) {
        return {
          ok: false,
          reason: regOnly.reason || 'series_registration_default_failed',
          inspect: insp,
          repairAttempted: true
        };
      }
      return {
        ok: true,
        reason: regOnly.changed
          ? 'repair_registration_defaults'
          : 'repair_noop_complete',
        inspect: insp,
        series: regOnly.series || seriesForReg
      };
    }
    var result = publishSeries(seriesId, options);
    if (result.ok) {
      var reason =
        result.reason === 'repaired_journal_done' ? 'repair_journal_done' : 'repair_published';
      return Object.assign({}, result, { reason: reason, inspect: insp });
    }
    if (result.reason === 'journal_finalize_failed') {
      return Object.assign({}, result, { reason: 'journal_finalize_failed', repairAttempted: true });
    }
    return Object.assign({}, result, { repairAttempted: true, inspect: insp });
  }

  return {
    planPublish: planPublish,
    publishSeries: publishSeries,
    resumePublish: resumePublish,
    inspectPublishState: inspectPublishState,
    repairHalfPublished: repairHalfPublished,
    persistFirstPublishRegistrationDefaults: persistFirstPublishRegistrationDefaults,
    repairFirstPublishRegistrationDefaultsById: repairFirstPublishRegistrationDefaultsById,
    validateFrozenJournal: seriesStationMatch.validateFrozenJournal,
    validateFutureRoundDateTimes: validateFutureRoundDateTimes,
    precheckConflicts: precheckConflicts,
    parseLocalDateTimeToMs: parseLocalDateTimeToMs,
    inspectPublishedEntities: inspectPublishedEntities
  };
}

var defaultPublisher = null;

function getDefaultPublisher() {
  if (!defaultPublisher) {
    defaultPublisher = createSeriesPublisher({});
  }
  return defaultPublisher;
}

module.exports = {
  createSeriesPublisher: createSeriesPublisher,
  createMemoryMatchRepo: createMemoryMatchRepo,
  validateFrozenJournal: function (journal) {
    return seriesStationMatch.validateFrozenJournal(journal);
  },
  validateFutureRoundDateTimes: validateFutureRoundDateTimes,
  parseLocalDateTimeToMs: parseLocalDateTimeToMs,
  planPublish: function (series, options) {
    return getDefaultPublisher().planPublish(series, options);
  },
  publishSeries: function (seriesId, options) {
    return getDefaultPublisher().publishSeries(seriesId, options);
  },
  resumePublish: function (seriesId, options) {
    return getDefaultPublisher().resumePublish(seriesId, options);
  },
  inspectPublishState: function (seriesId) {
    return getDefaultPublisher().inspectPublishState(seriesId);
  },
  repairHalfPublished: function (seriesId, options) {
    return getDefaultPublisher().repairHalfPublished(seriesId, options);
  },
  persistFirstPublishRegistrationDefaults: function (series) {
    return getDefaultPublisher().persistFirstPublishRegistrationDefaults(series);
  },
  repairFirstPublishRegistrationDefaultsById: function (seriesId) {
    return getDefaultPublisher().repairFirstPublishRegistrationDefaultsById(seriesId);
  }
};
