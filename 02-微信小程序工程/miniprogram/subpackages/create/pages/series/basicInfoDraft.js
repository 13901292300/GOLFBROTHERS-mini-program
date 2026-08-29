/**
 * 系列赛 Step5 基础信息纯函数（名称 / 可见性 / accessCode / eventInfo / partner / Step6 门闩）
 * 不依赖 Page / wx / storage。
 */

var seriesModel = require('../../../../utils/seriesModel.js');
var seriesValidators = require('../../../../utils/seriesValidators.js');
var seriesIds = require('../../../../utils/seriesIds.js');
var partnerConfigUtil = require('../../../../utils/partnerConfig.js');
var eventInfoDefaults = require('../../../../utils/eventInfoDefaults.js');
var bannerConfig = require('../../../../utils/bannerConfig.js');
var participantDraft = require('./participantDraft.js');
var seriesRyderCup = require('../../../../utils/seriesRyderCup.js');
var seriesSameDayMultiCourse = require('../../../../utils/seriesSameDayMultiCourse.js');
var matchTitlePolicy = require('../../../../utils/matchTitlePolicy.js');

var SERIES_NAME_MAX = matchTitlePolicy.SERIES_NAME_MAX;
var SERIES_SUBTITLE_MAX = matchTitlePolicy.SERIES_SUBTITLE_MAX;
var LOCAL_DT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/;
var ACCESS_CODE_PATTERN = /^\d{6}$/;

var RECOMMENDED_EVENT_INFO = [
  { title: '赛事介绍', type: 'text' },
  { title: '赛事规则', type: 'text' },
  { title: '奖项设置', type: 'text' },
  { title: '赞助商广告', type: 'image' },
  { title: '照片直播', type: 'text' },
  { title: '晚宴安排', type: 'text' }
];

var PHOTO_LIVE_TITLE = '照片直播';
var PHOTO_LIVE_LEGACY_TITLE = '交通说明';

function deepClone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function asString(v) {
  return v == null ? '' : String(v);
}

function isPhotoLiveEventTitle(title) {
  var t = String(title || '').trim();
  return t === PHOTO_LIVE_TITLE || t === PHOTO_LIVE_LEGACY_TITLE;
}

function isValidPhotoLiveHttpsUrl(url) {
  var s = String(url || '').trim();
  if (!s) return false;
  if (/^http:\/\//i.test(s)) return false;
  return /^https:\/\/.+/i.test(s);
}

function isStableMediaUrl(url) {
  var s = String(url || '').trim();
  if (!s) return true;
  if (/^wxfile:\/\//i.test(s) || /^http:\/\/tmp\//i.test(s)) return false;
  if (/^https:\/\//i.test(s)) return true;
  if (s.indexOf('/assets/') === 0 || s.indexOf('assets/') === 0) return true;
  return false;
}

function assertNoTempMediaInBasicInfo(draft) {
  var d = draft || {};
  var list = Array.isArray(d.eventInfoList) ? d.eventInfoList : [];
  var i;
  for (i = 0; i < list.length; i++) {
    var item = list[i] || {};
    if (!isStableMediaUrl(item.brightImage) || !isStableMediaUrl(item.darkImage)) {
      return { ok: false, reason: 'temp_media_event_info' };
    }
    if (item.content && /^wxfile:\/\//i.test(String(item.content))) {
      return { ok: false, reason: 'temp_media_event_content' };
    }
  }
  if (!isStableMediaUrl(d.bannerImageSnapshot)) {
    return { ok: false, reason: 'temp_media_banner' };
  }
  var pc = d.partnerConfig;
  if (pc && Array.isArray(pc.partnerLogos)) {
    for (i = 0; i < pc.partnerLogos.length; i++) {
      var logo = pc.partnerLogos[i] || {};
      if (!isStableMediaUrl(logo.bright) || !isStableMediaUrl(logo.dark)) {
        return { ok: false, reason: 'temp_media_partner' };
      }
    }
  }
  return { ok: true };
}

/** 与队内/队际详情同源的系统 Hero 图（创建时快照） */
function createDefaultBannerImageSnapshot() {
  return asString(bannerConfig.getMatchDetailBanner());
}

function buildSeriesNamePlaceholder(ctx) {
  var c = ctx || {};
  if (c.hostMode === 'organization') {
    var orgName = asString(c.organization && c.organization.organizationName).trim();
    return orgName ? orgName + ' 队际系列赛' : '请输入系列赛名称';
  }
  if (c.hostMode === 'team') {
    var teamName = asString(c.hostTeam && c.hostTeam.teamName).trim();
    return teamName ? teamName + ' 分队系列赛' : '请输入系列赛名称';
  }
  return '请输入系列赛名称';
}

/**
 * @returns {{ ok: boolean, value?: string, reason?: string }}
 */
function normalizeSeriesNameInput(raw, options) {
  return matchTitlePolicy.normalizeSeriesNameInput(raw, options);
}

/**
 * 副标题选填：清除换行后 trim；空串合法；不从主标题拆分；不写入系统 · Rx
 * @returns {{ ok: boolean, value: string, reason?: string }}
 */
function normalizeSeriesSubtitleInput(raw, options) {
  return matchTitlePolicy.normalizeSeriesSubtitleInput(raw, options);
}

function countInputChars(raw) {
  return matchTitlePolicy.countTypingChars(raw);
}

function parseLocalDateTime(raw) {
  var text = asString(raw).trim();
  var m = text.match(LOCAL_DT_PATTERN);
  if (!m) return null;
  var y = Number(m[1]);
  var mo = Number(m[2]);
  var d = Number(m[3]);
  var h = Number(m[4]);
  var mi = Number(m[5]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return null;
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
  return dt;
}

function isValidAccessCode(code) {
  return ACCESS_CODE_PATTERN.test(asString(code));
}

/** 与队际赛 _genAccessCode 一致：6 位数字，左侧补 0 */
function generateAccessCode() {
  return String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
}

/**
 * 切换可见性时的字段补丁（一次 saveDraft 使用）
 * public→private：不自动生成 accessCode
 * private→public：清空 accessCode
 */
function applyVisibilityChange(draft, nextVisibility) {
  var d = deepClone(draft || {});
  var vis = nextVisibility === 'private' ? 'private' : 'public';
  d.visibility = vis;
  if (vis === 'public') {
    d.accessCode = '';
  } else if (d.accessCode == null) {
    d.accessCode = '';
  }
  return d;
}

function createEventInfoId() {
  return seriesIds.generateScopedId('evt');
}

function eventInfoItemKey(item) {
  return eventInfoDefaults.eventInfoItemKey(item);
}

function cloneEventInfoItem(item) {
  return eventInfoDefaults.cloneEventInfoItem(item);
}

function hasValidEventInfoContent(item) {
  return eventInfoDefaults.hasValidEventInfoContent(item);
}

function statusForEventInfoItem(item) {
  return hasValidEventInfoContent(item) ? '已设置' : '未设置';
}

/** 与队内/队际 buildEventTitleMapForList 一致：照片直播 ↔ 交通说明 双写 disabled */
function buildEventInfoTitleMap(list) {
  var map = Object.create(null);
  var arr = Array.isArray(list) ? list : [];
  for (var i = 0; i < arr.length; i++) {
    var title = arr[i] && arr[i].title ? String(arr[i].title).trim() : '';
    if (title) map[title] = true;
  }
  if (map[PHOTO_LIVE_TITLE] || map[PHOTO_LIVE_LEGACY_TITLE]) {
    map[PHOTO_LIVE_TITLE] = true;
    map[PHOTO_LIVE_LEGACY_TITLE] = true;
  }
  return map;
}

/**
 * @returns {{ ok: boolean, list?: object[], reason?: string }}
 */
function addEventInfoItem(list, partial) {
  var cur = Array.isArray(list) ? list.map(cloneEventInfoItem) : [];
  var title = asString(partial && partial.title).trim();
  if (isPhotoLiveEventTitle(title)) title = PHOTO_LIVE_TITLE;
  if (!title) return { ok: false, reason: 'title_required' };
  var type = partial && partial.type === 'image' ? 'image' : 'text';
  var key = eventInfoItemKey({ title: title });
  if (buildEventInfoTitleMap(cur)[key]) {
    return { ok: false, reason: 'title_duplicate' };
  }
  var item = cloneEventInfoItem({
    id: createEventInfoId(),
    title: title,
    type: type,
    content: asString(partial && partial.content),
    brightImage: asString(partial && partial.brightImage),
    darkImage: asString(partial && partial.darkImage),
    status: '未设置'
  });
  if (!isStableMediaUrl(item.brightImage) || !isStableMediaUrl(item.darkImage)) {
    return { ok: false, reason: 'temp_media' };
  }
  item.status = statusForEventInfoItem(item);
  cur.push(item);
  return { ok: true, list: cur };
}

function updateEventInfoItem(list, itemId, patch) {
  var id = asString(itemId);
  if (!id) return { ok: false, reason: 'id_required' };
  var cur = Array.isArray(list) ? list.map(cloneEventInfoItem) : [];
  var idx = -1;
  var i;
  for (i = 0; i < cur.length; i++) {
    if (cur[i].id === id) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return { ok: false, reason: 'not_found' };
  var next = Object.assign({}, cur[idx], patch || {});
  next.id = cur[idx].id;
  if (patch && patch.title != null) {
    var title = asString(patch.title).trim();
    if (isPhotoLiveEventTitle(title)) title = PHOTO_LIVE_TITLE;
    if (!title) return { ok: false, reason: 'title_required' };
    var key = eventInfoItemKey({ title: title });
    for (i = 0; i < cur.length; i++) {
      if (i !== idx && eventInfoItemKey(cur[i]) === key) {
        return { ok: false, reason: 'title_duplicate' };
      }
    }
    next.title = title;
  }
  if (isPhotoLiveEventTitle(next.title)) {
    var link = asString(next.content).trim();
    if (!link) return { ok: false, reason: 'photo_live_required' };
    if (!isValidPhotoLiveHttpsUrl(link)) {
      return { ok: false, reason: 'photo_live_https' };
    }
    next.title = PHOTO_LIVE_TITLE;
    next.content = link;
  }
  if (!isStableMediaUrl(next.brightImage) || !isStableMediaUrl(next.darkImage)) {
    return { ok: false, reason: 'temp_media' };
  }
  next.status = statusForEventInfoItem(next);
  cur[idx] = cloneEventInfoItem(next);
  return { ok: true, list: cur };
}

function removeEventInfoItem(list, itemId) {
  var id = asString(itemId);
  var cur = Array.isArray(list) ? list.map(cloneEventInfoItem) : [];
  return {
    ok: true,
    list: cur.filter(function (item) {
      return item && item.id !== id;
    })
  };
}

function reorderEventInfoList(list, fromIndex, toIndex) {
  var cur = Array.isArray(list) ? list.map(cloneEventInfoItem) : [];
  var from = Math.floor(Number(fromIndex));
  var to = Math.floor(Number(toIndex));
  if (
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    from < 0 ||
    to < 0 ||
    from >= cur.length ||
    to >= cur.length
  ) {
    return { ok: false, reason: 'index' };
  }
  var moved = cur.splice(from, 1)[0];
  cur.splice(to, 0, moved);
  return { ok: true, list: cur };
}

/** 默认 4 项赛事信息（与队内/队际 createDefaultEventInfoList 同源） */
function createDefaultEventInfoListForSeries() {
  return eventInfoDefaults.createDefaultEventInfoList().map(cloneEventInfoItem);
}

/**
 * 首次进入 Step5 的默认 PARTNER（稳定 COS Logo；允许之后删空）
 * 不写全局缓存。
 */
function createDefaultPartnerConfigForSeries(hostDisplayName) {
  return {
    partnerTitle: partnerConfigUtil.buildPartnerTitle(hostDisplayName),
    partnerLogos: partnerConfigUtil.DEFAULT_PARTNER_LOGOS.slice().map(function (logo) {
      return {
        bright: asString(logo.bright),
        dark: asString(logo.dark)
      };
    })
  };
}

/** @deprecated 使用 createDefaultPartnerConfigForSeries */
function createPartnerEditDraft(hostDisplayName) {
  return createDefaultPartnerConfigForSeries(hostDisplayName);
}

/**
 * Series 专用：允许 partnerLogos=[]；保留空槽 {bright:'',dark:''}；空不恢复默认。
 * 拒绝临时路径。
 */
function normalizePartnerConfigForSeries(config) {
  if (config == null) return null;
  if (typeof config !== 'object' || Array.isArray(config)) return null;
  var title = asString(config.partnerTitle).trim();
  var rawLogos = Array.isArray(config.partnerLogos) ? config.partnerLogos : [];
  var logos = [];
  for (var i = 0; i < rawLogos.length && logos.length < partnerConfigUtil.MAX_PARTNER_LOGOS; i++) {
    var item = rawLogos[i];
    if (typeof item === 'string') {
      var url = asString(item).trim();
      if (!url) {
        logos.push({ bright: '', dark: '' });
        continue;
      }
      if (!isStableMediaUrl(url)) return null;
      logos.push({ bright: url, dark: url });
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    var bright = asString(item.bright).trim();
    var dark = asString(item.dark).trim();
    var legacy = asString(item.logo != null ? item.logo : item.image).trim();
    bright = bright || legacy;
    dark = dark || legacy;
    if (!isStableMediaUrl(bright) || !isStableMediaUrl(dark)) return null;
    logos.push({ bright: bright, dark: dark });
  }
  return {
    partnerTitle: title || partnerConfigUtil.buildPartnerTitle(''),
    partnerLogos: logos
  };
}

/**
 * 首次进入 Step5：Hero / 赛事信息 / PARTNER 原子灌入计划（不改 draft）
 * @returns {{ changed: boolean, seedBanner: boolean, seedEventInfo: boolean, seedPartner: boolean, bannerImageSnapshot?: string, eventInfoList?: object[], partnerConfig?: object }}
 */
function planStep5FirstEnter(draft) {
  var d = draft || {};
  // Hero：非空快照保留；空快照才灌入系统图（当前无清空入口，不做 initialized 语义）
  var seedBanner = !asString(d.bannerImageSnapshot).trim();
  var seedEventInfo = d.eventInfoInitialized !== true;
  var seedPartner = d.partnerConfig == null;
  var plan = {
    changed: !!(seedBanner || seedEventInfo || seedPartner),
    seedBanner: seedBanner,
    seedEventInfo: seedEventInfo,
    seedPartner: seedPartner
  };
  if (seedBanner) {
    plan.bannerImageSnapshot = createDefaultBannerImageSnapshot();
  }
  if (seedEventInfo) {
    plan.eventInfoList = createDefaultEventInfoListForSeries();
  }
  if (seedPartner) {
    plan.partnerConfig = createDefaultPartnerConfigForSeries(hostDisplayName(d));
  }
  return plan;
}

/** 将 planStep5FirstEnter 结果应用到 draft（调用方负责一次 saveDraft） */
function applyStep5FirstEnter(draft, plan) {
  if (!draft || !plan || !plan.changed) return draft;
  if (plan.seedBanner) {
    draft.bannerImageSnapshot = asString(plan.bannerImageSnapshot);
  }
  if (plan.seedEventInfo) {
    draft.eventInfoList = (plan.eventInfoList || []).map(cloneEventInfoItem);
    draft.eventInfoInitialized = true;
  }
  if (plan.seedPartner) {
    draft.partnerConfig = normalizePartnerConfigForSeries(plan.partnerConfig);
  }
  return draft;
}

/**
 * 主办显示名变更时联动默认 PARTNER 标题（用户手改过则不覆盖）
 */
function syncPartnerTitleOnHostRename(partnerConfig, prevHostName, nextHostName) {
  if (!partnerConfig || typeof partnerConfig !== 'object') return partnerConfig;
  var currentTitle = asString(partnerConfig.partnerTitle).trim();
  if (!partnerConfigUtil.isDefaultPartnerTitle(currentTitle, prevHostName)) {
    return partnerConfig;
  }
  return {
    partnerTitle: partnerConfigUtil.buildPartnerTitle(nextHostName),
    partnerLogos: Array.isArray(partnerConfig.partnerLogos)
      ? partnerConfig.partnerLogos.slice()
      : []
  };
}

/**
 * 拖拽落位（与队内/队际：y/stepPx round，需 moved）
 * @returns {{ shouldReorder: boolean, toIndex: number }}
 */
function resolveEventInfoDragReorder(opts) {
  var o = opts || {};
  var listLen = Math.floor(Number(o.listLength)) || 0;
  var fromIndex = Math.floor(Number(o.fromIndex));
  var y = Number(o.y) || 0;
  var stepPx = Number(o.stepPx) || 0;
  var moved = !!o.moved;
  if (!moved || listLen <= 0 || !Number.isFinite(fromIndex) || fromIndex < 0 || fromIndex >= listLen) {
    return { shouldReorder: false, toIndex: fromIndex };
  }
  if (!(stepPx > 0)) return { shouldReorder: false, toIndex: fromIndex };
  var toIndex = Math.max(0, Math.min(listLen - 1, Math.round(y / stepPx)));
  if (toIndex === fromIndex) return { shouldReorder: false, toIndex: toIndex };
  return { shouldReorder: true, toIndex: toIndex };
}

/** 删除二次确认：首次 arm，再次 confirm；3s 窗口由页面定时器负责 */
function nextDeleteConfirmState(armed, clickId, targetId) {
  if (!targetId) return { action: 'noop', armedId: armed || '' };
  if (armed !== targetId) {
    return { action: 'arm', armedId: targetId, deleteBtnText: '再次点击确认删除' };
  }
  return { action: 'confirm', armedId: '', deleteBtnText: '删除本项' };
}

function roundsStructureOk(draft) {
  var rounds = Array.isArray(draft && draft.rounds) ? draft.rounds : [];
  if (rounds.length < 2) return false;
  var seen = Object.create(null);
  for (var i = 0; i < rounds.length; i++) {
    var rid = rounds[i] && rounds[i].roundId != null ? String(rounds[i].roundId).trim() : '';
    if (!rid || seen[rid]) return false;
    seen[rid] = 1;
  }
  return true;
}

function scoringStructureOk(draft) {
  if (seriesRyderCup.isRyderCupSeries(draft)) {
    return seriesRyderCup.assertRyderCupTypeAndScoringMode(draft).ok;
  }
  var rule = (draft && draft.scoringRule) || {};
  if (!seriesModel.SCORING_MODE[rule.mode]) return false;
  if (!seriesModel.SCORE_BASIS[rule.scoreBasis]) return false;
  if (rule.mode === 'global_m') {
    var gm = Number(rule.globalM);
    if (!Number.isFinite(gm) || Math.floor(gm) < 1) return false;
  }
  return true;
}

function readTitleBaselinePrevious(options, field) {
  var baseline = options && options.titleBaseline;
  if (!baseline || typeof baseline !== 'object') return undefined;
  if (field === 'seriesName') return baseline.seriesName;
  if (field === 'seriesSubtitle') return baseline.seriesSubtitle;
  return undefined;
}

/**
 * Step6 完整门闩
 * @param {object} draft
 * @param {{ titleBaseline?: { seriesName?: string, seriesSubtitle?: string } }} [options]
 * @returns {{ ok: boolean, message?: string, code?: string }}
 */
function canEnterStep6(draft, options) {
  var d = draft || {};
  if (!participantDraft.isFirstWaveTemplate(d.hostMode, d.templateId)) {
    return { ok: false, code: 'template', message: '该类型将在后续阶段开放' };
  }
  if (d.hostMode === 'organization') {
    if (!asString(d.organization && d.organization.organizationId).trim()) {
      return { ok: false, code: 'organization', message: '请选择组织机构' };
    }
    if (participantDraft.countTeamParticipants(d.participants) < 2) {
      return { ok: false, code: 'participants', message: '至少需要两支参赛球队' };
    }
    if (seriesRyderCup.shouldSkipScoringStep(d)) {
      var sides = seriesRyderCup.assertExactlyTwoSides(d);
      if (!sides.ok) return { ok: false, code: 'participants', message: sides.message };
    }
  } else if (d.hostMode === 'team') {
    if (!asString(d.hostTeam && d.hostTeam.teamId).trim()) {
      return { ok: false, code: 'host_team', message: '请选择主办球队' };
    }
    if (participantDraft.countDivisionParticipants(d.participants) < 2) {
      return { ok: false, code: 'participants', message: '至少需要两个分队' };
    }
    if (seriesRyderCup.shouldSkipScoringStep(d)) {
      var divSides = seriesRyderCup.assertExactlyTwoSides(d);
      if (!divSides.ok) return { ok: false, code: 'participants', message: divSides.message };
    }
  } else {
    return { ok: false, code: 'host_mode', message: '请选择主办场景' };
  }

  var nameCheck = normalizeSeriesNameInput(d.seriesName, {
    previous: readTitleBaselinePrevious(options, 'seriesName')
  });
  if (!nameCheck.ok) {
    return { ok: false, code: 'series_name', message: '请填写 1～18 字系列赛名称' };
  }
  var subCheck = normalizeSeriesSubtitleInput(d.seriesSubtitle, {
    previous: readTitleBaselinePrevious(options, 'seriesSubtitle')
  });
  if (!subCheck.ok) {
    return { ok: false, code: 'series_subtitle', message: '副标题最多 12 个字符' };
  }

  var vis = d.visibility === 'private' ? 'private' : d.visibility === 'public' ? 'public' : '';
  if (vis !== 'public' && vis !== 'private') {
    return { ok: false, code: 'visibility', message: '可见范围无效' };
  }
  if (vis === 'private' && !isValidAccessCode(d.accessCode)) {
    return { ok: false, code: 'access_code', message: '私密赛事须设置 6 位数字访问码' };
  }

  if (!roundsStructureOk(d)) {
    return { ok: false, code: 'rounds', message: '轮次数至少为 2 且轮次 ID 唯一' };
  }

  var structure = seriesValidators.validateDraftStructure(d);
  if (!structure.ok) {
    return {
      ok: false,
      code: 'structure',
      message: (structure.errors[0] && structure.errors[0].message) || '草稿结构不完整'
    };
  }

  var media = assertNoTempMediaInBasicInfo(d);
  if (!media.ok) {
    return { ok: false, code: 'temp_media', message: '存在临时图片路径，请移除后重试' };
  }

  return { ok: true };
}

/**
 * 冷启动步骤推导（不持久化 currentStep）
 */
function deriveWizardStep(draft, options) {
  var opts = options || {};
  var isTemplateCompatible = opts.isTemplateCompatible;
  var d = draft || {};
  if (!d.hostMode) return 1;
  if (
    !d.templateId ||
    (typeof isTemplateCompatible === 'function' && !isTemplateCompatible(d.hostMode, d.templateId))
  ) {
    return 2;
  }
  if (!participantDraft.isFirstWaveTemplate(d.hostMode, d.templateId)) return 2;
  if (!seriesRyderCup.shouldSkipScoringStep(d) && !scoringStructureOk(d)) return 3;
  if (!roundsStructureOk(d)) return 4;
  if (!canEnterStep6(d).ok) return 5;
  return 6;
}

function hostDisplayName(draft) {
  var d = draft || {};
  if (d.hostMode === 'organization') {
    return asString(d.organization && d.organization.organizationName).trim();
  }
  if (d.hostMode === 'team') {
    return asString(d.hostTeam && d.hostTeam.teamName).trim();
  }
  return '';
}

function displayConfirmRoundName(rawName, index, isSameDayMultiCourse) {
  var idx = index != null && String(index) !== '' ? String(index) : '';
  var name = rawName != null && String(rawName) !== '' ? String(rawName) : 'ROUND ' + idx;
  if (!isSameDayMultiCourse) return name;
  return name.replace(/\bROUND\b/g, 'COURSE');
}

function summarizeRoundForConfirm(round, scoringMode, opts) {
  var r = round || {};
  var flags = opts && typeof opts === 'object' ? opts : {};
  var hasCourse = !!(asString(r.courseId).trim() && asString(r.courseName).trim());
  var hasTime = !!asString(r.dateTime).trim();
  var hasMode = !!seriesModel.GAME_MODE[r.gameMode];
  var hasFee = asString(r.fee).trim() !== '';
  var topNSet =
    scoringMode !== 'per_round_n' ||
    (r.topN != null && Number.isFinite(Number(r.topN)) && Math.floor(Number(r.topN)) >= 1);
  var storedName = r.name != null && String(r.name) !== '' ? String(r.name) : '';
  return {
    roundId: r.roundId || '',
    index: r.index || 0,
    name: displayConfirmRoundName(
      storedName || 'ROUND ' + (r.index || ''),
      r.index,
      !!flags.sameDayMultiCourse
    ),
    courseDisplay: hasCourse ? String(r.courseName) + (r.courseHalfText || '') : '未设置球场',
    dateTimeText: hasTime ? String(r.dateTime) : '未设置开球时间',
    gameModeText: hasMode ? String(r.gameMode) : '未设置赛制',
    feeText: hasFee ? String(r.fee) : '未设置费用',
    topNText:
      scoringMode === 'per_round_n'
        ? topNSet
          ? 'Top ' + Math.floor(Number(r.topN))
          : '未设置 Top N'
        : '',
    courseSet: hasCourse,
    dateTimeSet: hasTime,
    gameModeSet: hasMode,
    feeSet: hasFee,
    topNSet: topNSet
  };
}

function summarizeRoundsForConfirm(roundsInput, scoringMode) {
  var rounds = Array.isArray(roundsInput) ? roundsInput : [];
  var multi = seriesSameDayMultiCourse.collectSameDayMultiCourseRoundIds(rounds);
  return rounds.map(function (r) {
    var id = asString(r && r.roundId).trim();
    return summarizeRoundForConfirm(r, scoringMode, {
      sameDayMultiCourse: !!(id && multi[id])
    });
  });
}

module.exports = {
  SERIES_NAME_MAX: SERIES_NAME_MAX,
  SERIES_SUBTITLE_MAX: SERIES_SUBTITLE_MAX,
  RECOMMENDED_EVENT_INFO: RECOMMENDED_EVENT_INFO,
  PHOTO_LIVE_TITLE: PHOTO_LIVE_TITLE,
  deepClone: deepClone,
  buildSeriesNamePlaceholder: buildSeriesNamePlaceholder,
  normalizeSeriesNameInput: normalizeSeriesNameInput,
  normalizeSeriesSubtitleInput: normalizeSeriesSubtitleInput,
  countInputChars: countInputChars,
  parseLocalDateTime: parseLocalDateTime,
  isValidAccessCode: isValidAccessCode,
  generateAccessCode: generateAccessCode,
  applyVisibilityChange: applyVisibilityChange,
  createEventInfoId: createEventInfoId,
  isPhotoLiveEventTitle: isPhotoLiveEventTitle,
  isValidPhotoLiveHttpsUrl: isValidPhotoLiveHttpsUrl,
  isStableMediaUrl: isStableMediaUrl,
  assertNoTempMediaInBasicInfo: assertNoTempMediaInBasicInfo,
  cloneEventInfoItem: cloneEventInfoItem,
  hasValidEventInfoContent: hasValidEventInfoContent,
  statusForEventInfoItem: statusForEventInfoItem,
  buildEventInfoTitleMap: buildEventInfoTitleMap,
  addEventInfoItem: addEventInfoItem,
  updateEventInfoItem: updateEventInfoItem,
  removeEventInfoItem: removeEventInfoItem,
  reorderEventInfoList: reorderEventInfoList,
  createDefaultBannerImageSnapshot: createDefaultBannerImageSnapshot,
  createDefaultEventInfoListForSeries: createDefaultEventInfoListForSeries,
  createDefaultPartnerConfigForSeries: createDefaultPartnerConfigForSeries,
  createPartnerEditDraft: createPartnerEditDraft,
  normalizePartnerConfigForSeries: normalizePartnerConfigForSeries,
  planStep5FirstEnter: planStep5FirstEnter,
  applyStep5FirstEnter: applyStep5FirstEnter,
  syncPartnerTitleOnHostRename: syncPartnerTitleOnHostRename,
  resolveEventInfoDragReorder: resolveEventInfoDragReorder,
  nextDeleteConfirmState: nextDeleteConfirmState,
  scoringStructureOk: scoringStructureOk,
  roundsStructureOk: roundsStructureOk,
  canEnterStep6: canEnterStep6,
  deriveWizardStep: deriveWizardStep,
  hostDisplayName: hostDisplayName,
  displayConfirmRoundName: displayConfirmRoundName,
  summarizeRoundForConfirm: summarizeRoundForConfirm,
  summarizeRoundsForConfirm: summarizeRoundsForConfirm
};
