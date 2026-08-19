/**
 * 系列赛创建向导 · 正式发布页面适配器
 * - 只编排分支；不改 seriesPublish / journal / station 层
 * - 唯一顺序：inspect 后再决定是否 saveDraft
 * - published / frozen 路径禁止 saveDraft、禁止重冻
 */

var seriesPublishMod = require('../../utils/seriesPublish.js');

var SERIES_DETAIL_PATH = '/subpackages/tournament/pages/series-detail/index';

var PLACEHOLDER = {
  CREATE: '创建系列赛',
  PUBLISHING: '正在创建…',
  RESUME: '继续创建',
  VIEW_DETAIL: '查看详情'
};

var TOAST = {
  SOURCE_DRIFT: '草稿与已冻结的创建计划不一致，无法覆盖；请返回处理或联系支持',
  JOURNAL_CORRUPT: '创建记录已损坏，无法自动覆盖或重建',
  ENTITY_CONFLICT: '已发布数据存在冲突，无法自动覆盖',
  DISCARD_CONFLICT: '存在冲突分站，无法自动取消',
  DISCARD_PUBLISHED: '系列赛已创建，不能从创建页取消',
  DISCARD_DENIED: '只能取消自己未完成的创建',
  DISCARD_FAILED: '取消失败，请重试',
  DISCARD_CONFIRM:
    '将放弃本次创建并清理已生成的分站比赛，此操作不可恢复。是否继续？',
  SERIES_MISSING: '找不到系列赛草稿',
  SERIES_ID_REQUIRED: '缺少系列赛编号',
  DRAFT_SAVE_FAILED: '草稿保存失败',
  PUBLISH_INVALID: '请补齐球场、开球时间、赛制或费用后再创建',
  DATETIME_NOT_FUTURE: '每轮开球时间须晚于当前时间',
  ACCESS_CODE: '私密赛事须设置 6 位数字访问码',
  CREATOR_REQUIRED: '无法确认创建者身份，请重新创建系列赛',
  GENERIC_FAIL: '创建失败，请稍后重试',
  RESUME_UNSAVED: '将继续上次创建，本次未保存修改不会生效。',
  NAV_FAIL: '已创建成功，请点击「查看详情」进入',
  SUCCESS_NAV: '创建成功'
};

/**
 * @param {string} seriesId
 * @returns {string} 不含 preview=1
 */
function buildSeriesDetailUrl(seriesId) {
  var sid = seriesId != null ? String(seriesId).trim() : '';
  if (!sid) return '';
  return SERIES_DETAIL_PATH + '?seriesId=' + encodeURIComponent(sid);
}

/**
 * 显式修复旧发布结果（幂等）：published+closed+rev0 → open/rev1。
 * 仅创建/发布适配器与发布领域调用；首页列表禁止调用。
 */
function ensureLegacyFirstPublishRegistration(seriesId, repairByIdFn) {
  var sid = seriesId != null ? String(seriesId).trim() : '';
  if (!sid) {
    return { ok: false, changed: false, reason: 'series_id_required' };
  }
  var fn =
    typeof repairByIdFn === 'function'
      ? repairByIdFn
      : function (id) {
          return seriesPublishMod.repairFirstPublishRegistrationDefaultsById(id);
        };
  try {
    return fn(sid) || { ok: false, changed: false, reason: 'repair_failed' };
  } catch (e) {
    return { ok: false, changed: false, reason: 'repair_threw' };
  }
}

function asString(v) {
  return v == null ? '' : String(v);
}

function hasEntityBlockingIssues(insp) {
  if (!insp || !insp.entities) return false;
  var e = insp.entities;
  if (e.ok === false) return true;
  return !!(
    (e.payloadConflicts && e.payloadConflicts.length) ||
    (e.indexConflicts && e.indexConflicts.length) ||
    (e.identityConflicts && e.identityConflicts.length) ||
    (e.seriesMatchIdMismatches && e.seriesMatchIdMismatches.length) ||
    e.tokenMismatch ||
    e.roundCountMismatch
  );
}

/**
 * 纯决策：只依赖 inspectPublishState 结果（禁止在此 saveDraft）
 * @param {object} insp
 * @returns {{
 *   action: 'navigate'|'repair'|'resume'|'first_publish'|'blocked',
 *   code: string,
 *   message: string,
 *   allowSaveDraft: boolean,
 *   warnUnsavedDiscard: boolean,
 *   buttonMode: string
 * }}
 */
function decidePublishAction(insp) {
  if (!insp || insp.ok === false) {
    return {
      action: 'blocked',
      code: (insp && insp.reason) || 'inspect_failed',
      message: TOAST.GENERIC_FAIL,
      allowSaveDraft: false,
      warnUnsavedDiscard: false,
      buttonMode: 'create'
    };
  }

  var life = insp.series && insp.series.lifecycleStatus
    ? asString(insp.series.lifecycleStatus).trim()
    : '';
  var published = life === 'published';

  if (insp.journalCorrupt) {
    return {
      action: 'blocked',
      code: 'journal_corrupt',
      message: TOAST.JOURNAL_CORRUPT,
      allowSaveDraft: false,
      warnUnsavedDiscard: false,
      buttonMode: 'create'
    };
  }

  if (insp.sourceDrift) {
    return {
      action: 'blocked',
      code: 'plan_source_conflict',
      message: TOAST.SOURCE_DRIFT,
      allowSaveDraft: false,
      warnUnsavedDiscard: false,
      buttonMode: 'create'
    };
  }

  if (published) {
    var done = insp.journalPhase === 'done';
    var blocking = hasEntityBlockingIssues(insp);
    if (done && !insp.publishedWithoutJournalDone && !blocking) {
      return {
        action: 'navigate',
        code: 'already_published',
        message: '',
        allowSaveDraft: false,
        warnUnsavedDiscard: false,
        buttonMode: 'view_detail'
      };
    }
    if (blocking && done && !insp.canRetry) {
      return {
        action: 'blocked',
        code: 'published_entity_conflict',
        message: TOAST.ENTITY_CONFLICT,
        allowSaveDraft: false,
        warnUnsavedDiscard: false,
        buttonMode: 'create'
      };
    }
    return {
      action: 'repair',
      code: 'repair_published',
      message: '',
      allowSaveDraft: false,
      warnUnsavedDiscard: false,
      buttonMode: 'resume'
    };
  }

  if (insp.hasFrozenPlan) {
    return {
      action: 'resume',
      code: 'resume_frozen',
      message: '',
      allowSaveDraft: false,
      warnUnsavedDiscard: true,
      buttonMode: 'resume'
    };
  }

  if (life === 'draft' || life === '') {
    return {
      action: 'first_publish',
      code: 'first_publish',
      message: '',
      allowSaveDraft: true,
      warnUnsavedDiscard: false,
      buttonMode: 'create'
    };
  }

  return {
    action: 'blocked',
    code: 'lifecycle_not_allowed',
    message: TOAST.GENERIC_FAIL,
    allowSaveDraft: false,
    warnUnsavedDiscard: false,
    buttonMode: 'create'
  };
}

/**
 * @param {object} result publish/resume/repair 返回值
 * @returns {{ title: string, buttonMode: string }}
 */
function mapPublishFailure(result) {
  var r = result || {};
  var reason = asString(r.reason).trim();
  if (reason === 'plan_source_conflict' || reason === 'source_drift') {
    return { title: TOAST.SOURCE_DRIFT, buttonMode: 'create' };
  }
  if (reason === 'journal_corrupt') {
    return { title: TOAST.JOURNAL_CORRUPT, buttonMode: 'create' };
  }
  if (reason === 'published_entity_conflict') {
    return { title: TOAST.ENTITY_CONFLICT, buttonMode: 'create' };
  }
  if (reason === 'publish_invalid' || reason === 'fee_invalid') {
    return { title: TOAST.PUBLISH_INVALID, buttonMode: 'create' };
  }
  if (reason === 'datetime_not_future') {
    return { title: TOAST.DATETIME_NOT_FUTURE, buttonMode: 'create' };
  }
  if (reason === 'creator_required' || reason === 'creator_mismatch') {
    return { title: TOAST.CREATOR_REQUIRED, buttonMode: 'create' };
  }
  if (
    reason === 'access_code_required' ||
    (r.errors &&
      r.errors.some(function (e) {
        return e && e.code === 'access_code_required';
      }))
  ) {
    return { title: TOAST.ACCESS_CODE, buttonMode: 'create' };
  }
  if (
    reason === 'journal_write_failed' ||
    reason === 'match_write_failed' ||
    reason === 'index_failed' ||
    reason === 'series_finalize_failed' ||
    reason === 'series_publishing_state_failed' ||
    r.resumeAttempted ||
    r.repairAttempted
  ) {
    return { title: r.message || '创建中断，可继续创建', buttonMode: 'resume' };
  }
  if (reason === 'existing_not_draft' || reason === 'not_draft_input') {
    return { title: '当前系列赛已不可再存草稿', buttonMode: 'view_detail' };
  }
  return { title: r.message || TOAST.GENERIC_FAIL, buttonMode: 'create' };
}

function isPublishBusinessSuccess(result) {
  if (!result) return false;
  if (result.ok === true) return true;
  // Series 已 published 但 journal done 落盘失败：业务成功
  if (result.reason === 'journal_finalize_failed' && result.seriesPublished) return true;
  return false;
}

/**
 * 执行发布分支（页面注入 store / 草稿保存钩子）
 * @param {{
 *   seriesId: string,
 *   hasUnsavedPageBuffers?: boolean,
 *   getSeriesById: Function,
 *   inspectPublishState?: Function,
 *   publishSeries?: Function,
 *   resumePublish?: Function,
 *   repairHalfPublished?: Function,
 *   saveDraftForFirstPublishOnly?: Function,
 *   validateBeforeFirstPublish?: Function
 * }} input
 */
function runCreatePublish(input) {
  var o = input || {};
  var seriesId = asString(o.seriesId).trim();
  if (!seriesId) {
    return {
      ok: false,
      phase: 'precheck',
      reason: 'series_id_required',
      decision: decidePublishAction({ ok: false, reason: 'series_id_required' }),
      saveDraftCalled: false
    };
  }

  var getSeriesById =
    typeof o.getSeriesById === 'function' ? o.getSeriesById : function () { return null; };
  var inspectFn =
    typeof o.inspectPublishState === 'function'
      ? o.inspectPublishState
      : function (id) {
          return seriesPublishMod.inspectPublishState(id);
        };
  var publishFn =
    typeof o.publishSeries === 'function'
      ? o.publishSeries
      : function (id, opts) {
          return seriesPublishMod.publishSeries(id, opts);
        };
  var resumeFn =
    typeof o.resumePublish === 'function'
      ? o.resumePublish
      : function (id, opts) {
          return seriesPublishMod.resumePublish(id, opts);
        };
  var repairFn =
    typeof o.repairHalfPublished === 'function'
      ? o.repairHalfPublished
      : function (id, opts) {
          return seriesPublishMod.repairHalfPublished(id, opts);
        };

  var series = getSeriesById(seriesId);
  if (!series) {
    return {
      ok: false,
      phase: 'precheck',
      reason: 'series_not_found',
      decision: {
        action: 'blocked',
        code: 'series_not_found',
        message: TOAST.SERIES_MISSING,
        allowSaveDraft: false,
        warnUnsavedDiscard: false,
        buttonMode: 'create'
      },
      saveDraftCalled: false
    };
  }

  var insp = inspectFn(seriesId);
  var decision = decidePublishAction(insp);
  var saveDraftCalled = false;
  var warnToast = '';

  if (decision.action === 'blocked') {
    return {
      ok: false,
      phase: 'inspect',
      reason: decision.code,
      decision: decision,
      inspect: insp,
      saveDraftCalled: false,
      message: decision.message
    };
  }

  if (decision.action === 'navigate') {
    // 查看详情前：显式补齐历史 closed/rev0（失败不阻断导航）
    var navReg = ensureLegacyFirstPublishRegistration(
      seriesId,
      o.repairFirstPublishRegistrationDefaultsById
    );
    var afterNav = getSeriesById(seriesId) || (navReg && navReg.series) || series;
    return {
      ok: true,
      phase: 'navigate',
      reason: 'already_published',
      decision: decision,
      inspect: insp,
      series: afterNav,
      registrationRepair: navReg,
      saveDraftCalled: false,
      detailUrl: buildSeriesDetailUrl(seriesId)
    };
  }

  if (decision.action === 'repair') {
    // published：禁止 saveDraft
    var repaired = repairFn(seriesId, {});
    if (isPublishBusinessSuccess(repaired)) {
      ensureLegacyFirstPublishRegistration(
        seriesId,
        o.repairFirstPublishRegistrationDefaultsById
      );
      var afterR = getSeriesById(seriesId) || repaired.series || series;
      return {
        ok: true,
        phase: 'repair',
        reason: repaired.reason || 'repair_published',
        decision: decision,
        inspect: insp,
        result: repaired,
        series: afterR,
        saveDraftCalled: false,
        detailUrl: buildSeriesDetailUrl(seriesId)
      };
    }
    var failR = mapPublishFailure(repaired);
    return {
      ok: false,
      phase: 'repair',
      reason: repaired.reason || 'repair_failed',
      decision: Object.assign({}, decision, { buttonMode: failR.buttonMode }),
      inspect: insp,
      result: repaired,
      saveDraftCalled: false,
      message: failR.title
    };
  }

  if (decision.action === 'resume') {
    // frozen：禁止 saveDraft；可提示未保存修改丢弃
    if (o.hasUnsavedPageBuffers) {
      warnToast = TOAST.RESUME_UNSAVED;
    }
    var resumed = resumeFn(seriesId, {});
    if (isPublishBusinessSuccess(resumed)) {
      ensureLegacyFirstPublishRegistration(
        seriesId,
        o.repairFirstPublishRegistrationDefaultsById
      );
      var afterResume = getSeriesById(seriesId) || resumed.series || series;
      return {
        ok: true,
        phase: 'resume',
        reason: resumed.reason || 'resume_published',
        decision: decision,
        inspect: insp,
        result: resumed,
        series: afterResume,
        saveDraftCalled: false,
        warnToast: warnToast,
        detailUrl: buildSeriesDetailUrl(seriesId)
      };
    }
    var failResume = mapPublishFailure(resumed);
    return {
      ok: false,
      phase: 'resume',
      reason: resumed.reason || 'resume_failed',
      decision: Object.assign({}, decision, { buttonMode: failResume.buttonMode }),
      inspect: insp,
      result: resumed,
      saveDraftCalled: false,
      warnToast: warnToast,
      message: failResume.title
    };
  }

  // first_publish：唯一允许 saveDraft 的路径
  if (typeof o.validateBeforeFirstPublish === 'function') {
    var gate = o.validateBeforeFirstPublish(series);
    if (!gate || gate.ok === false) {
      return {
        ok: false,
        phase: 'validate',
        reason: (gate && gate.code) || 'publish_invalid',
        decision: decision,
        inspect: insp,
        saveDraftCalled: false,
        message: (gate && gate.message) || TOAST.PUBLISH_INVALID
      };
    }
  }

  if (typeof o.saveDraftForFirstPublishOnly !== 'function') {
    return {
      ok: false,
      phase: 'save_draft',
      reason: 'save_draft_hook_missing',
      decision: decision,
      inspect: insp,
      saveDraftCalled: false,
      message: TOAST.DRAFT_SAVE_FAILED
    };
  }

  var saved = o.saveDraftForFirstPublishOnly();
  saveDraftCalled = true;
  if (!saved || saved.ok === false) {
    return {
      ok: false,
      phase: 'save_draft',
      reason: (saved && saved.reason) || 'draft_save_failed',
      decision: decision,
      inspect: insp,
      saveDraftCalled: true,
      message: (saved && saved.message) || TOAST.DRAFT_SAVE_FAILED
    };
  }

  var latest = getSeriesById(seriesId);
  if (!latest) {
    return {
      ok: false,
      phase: 'save_draft',
      reason: 'series_not_found_after_save',
      decision: decision,
      inspect: insp,
      saveDraftCalled: true,
      message: TOAST.SERIES_MISSING
    };
  }

  // 存稿后再 inspect：若期间出现冻结/发布，禁止继续当首次
  var insp2 = inspectFn(seriesId);
  var decision2 = decidePublishAction(insp2);
  if (decision2.action !== 'first_publish') {
    // 不在此自动转 resume/repair，避免与「仅 first 才 save」混淆；交给下一次点击
    return {
      ok: false,
      phase: 'reinspect',
      reason: 'state_changed_after_save',
      decision: decision2,
      inspect: insp2,
      saveDraftCalled: true,
      message: '状态已变化，请再次点击按最新状态继续'
    };
  }

  if (typeof o.validateBeforeFirstPublish === 'function') {
    var gate2 = o.validateBeforeFirstPublish(latest);
    if (!gate2 || gate2.ok === false) {
      return {
        ok: false,
        phase: 'validate',
        reason: (gate2 && gate2.code) || 'publish_invalid',
        decision: decision2,
        inspect: insp2,
        saveDraftCalled: true,
        message: (gate2 && gate2.message) || TOAST.PUBLISH_INVALID
      };
    }
  }

  var publishedRes = publishFn(seriesId, {});
  if (isPublishBusinessSuccess(publishedRes)) {
    ensureLegacyFirstPublishRegistration(
      seriesId,
      o.repairFirstPublishRegistrationDefaultsById
    );
    var afterPub = getSeriesById(seriesId) || publishedRes.series || latest;
    return {
      ok: true,
      phase: 'publish',
      reason: publishedRes.reason || 'published',
      decision: decision2,
      inspect: insp2,
      result: publishedRes,
      series: afterPub,
      saveDraftCalled: true,
      detailUrl: buildSeriesDetailUrl(seriesId)
    };
  }

  var failPub = mapPublishFailure(publishedRes);
  return {
    ok: false,
    phase: 'publish',
    reason: publishedRes.reason || 'publish_failed',
    decision: Object.assign({}, decision2, { buttonMode: failPub.buttonMode }),
    inspect: insp2,
    result: publishedRes,
    saveDraftCalled: true,
    message: failPub.title
  };
}

function resolvePrimaryButtonText(mode, publishing) {
  if (publishing) return PLACEHOLDER.PUBLISHING;
  var m = mode != null ? String(mode) : 'create';
  if (m === 'resume') return PLACEHOLDER.RESUME;
  if (m === 'view_detail') return PLACEHOLDER.VIEW_DETAIL;
  return PLACEHOLDER.CREATE;
}

function shouldConfirmInterruptedDiscard(insp) {
  if (!insp || insp.ok === false) return false;
  if (!insp.hasFrozenPlan) return false;
  var life =
    insp.series && insp.series.lifecycleStatus
      ? asString(insp.series.lifecycleStatus).trim()
      : '';
  if (life === 'published') return false;
  return true;
}

function mapDiscardFailure(result) {
  var reason = asString(result && result.reason).trim();
  if (reason === 'station_conflict') return TOAST.DISCARD_CONFLICT;
  if (reason === 'published_not_allowed') return TOAST.DISCARD_PUBLISHED;
  if (reason === 'permission_denied') return TOAST.DISCARD_DENIED;
  if (reason === 'no_frozen_plan' || reason === 'actor_required') {
    return TOAST.DISCARD_FAILED;
  }
  return (result && result.message) || TOAST.DISCARD_FAILED;
}

module.exports = {
  SERIES_DETAIL_PATH: SERIES_DETAIL_PATH,
  HOME_URL: '/pages/home/index',
  PLACEHOLDER: PLACEHOLDER,
  TOAST: TOAST,
  buildSeriesDetailUrl: buildSeriesDetailUrl,
  ensureLegacyFirstPublishRegistration: ensureLegacyFirstPublishRegistration,
  decidePublishAction: decidePublishAction,
  mapPublishFailure: mapPublishFailure,
  isPublishBusinessSuccess: isPublishBusinessSuccess,
  runCreatePublish: runCreatePublish,
  resolvePrimaryButtonText: resolvePrimaryButtonText,
  shouldConfirmInterruptedDiscard: shouldConfirmInterruptedDiscard,
  mapDiscardFailure: mapDiscardFailure,
  hasEntityBlockingIssues: hasEntityBlockingIssues
};
