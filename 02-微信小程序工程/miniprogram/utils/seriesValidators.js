/**
 * 系列赛校验
 * - validateDraftStructure：草稿可保存的最小结构
 * - validateForPublish：完整发布校验（本批仅提供，不接发布流程）
 * - 非法数据不静默纠正为另一种业务含义
 */

var model = require('./seriesModel.js');

function pushError(errors, code, message, path) {
  errors.push({
    code: code,
    message: message || code,
    path: path || ''
  });
}

function isNonEmptyString(value) {
  return value != null && String(value).trim() !== '';
}

/**
 * 草稿结构校验：允许向导未填完，但身份与类型必须基本合法
 * @param {object} series
 * @returns {{ ok: boolean, errors: Array }}
 */
function validateDraftStructure(series) {
  var errors = [];
  var s = series && typeof series === 'object' ? series : null;
  if (!s) {
    pushError(errors, 'series_required', 'series 必须为对象', '');
    return { ok: false, errors: errors };
  }

  if (!isNonEmptyString(s.seriesId)) {
    pushError(errors, 'series_id_required', 'seriesId 缺失', 'seriesId');
  }
  if (s.schemaVersion != null && !Number.isFinite(Number(s.schemaVersion))) {
    pushError(errors, 'schema_version_invalid', 'schemaVersion 非法', 'schemaVersion');
  }
  if (!model.LIFECYCLE_STATUS[s.lifecycleStatus]) {
    pushError(errors, 'lifecycle_invalid', 'lifecycleStatus 非法', 'lifecycleStatus');
  }
  if (
    s.competitionPhaseCache != null &&
    s.competitionPhaseCache !== '' &&
    !model.COMPETITION_PHASE[s.competitionPhaseCache]
  ) {
    pushError(errors, 'phase_cache_invalid', 'competitionPhaseCache 非法', 'competitionPhaseCache');
  }
  if (s.hostMode != null && s.hostMode !== '' && !model.HOST_MODE[s.hostMode]) {
    pushError(errors, 'host_mode_invalid', 'hostMode 非法', 'hostMode');
  }
  if (s.templateId != null && s.templateId !== '' && !model.TEMPLATE_ID[s.templateId]) {
    pushError(errors, 'template_invalid', 'templateId 非法', 'templateId');
  }
  if (s.publishState != null && s.publishState !== '' && !model.PUBLISH_STATE[s.publishState]) {
    pushError(errors, 'publish_state_invalid', 'publishState 非法', 'publishState');
  }
  if (s.visibility != null && s.visibility !== '' && s.visibility !== 'public' && s.visibility !== 'private') {
    pushError(errors, 'visibility_invalid', 'visibility 非法', 'visibility');
  }
  // 草稿：允许 private 且 accessCode 未完成；若提供了非空码则必须为 6 位数字
  if (s.accessCode != null && String(s.accessCode) !== '') {
    if (!/^\d{6}$/.test(String(s.accessCode))) {
      pushError(errors, 'access_code_invalid', 'accessCode 须为 6 位数字', 'accessCode');
    }
  }
  if (s.eventInfoInitialized != null && typeof s.eventInfoInitialized !== 'boolean') {
    pushError(
      errors,
      'event_info_initialized_type',
      'eventInfoInitialized 必须为布尔值',
      'eventInfoInitialized'
    );
  }
  if (s.eventInfoList != null && !Array.isArray(s.eventInfoList)) {
    pushError(errors, 'event_info_list_type', 'eventInfoList 必须为数组', 'eventInfoList');
  }
  if (
    s.partnerConfig != null &&
    (typeof s.partnerConfig !== 'object' || Array.isArray(s.partnerConfig))
  ) {
    pushError(errors, 'partner_config_type', 'partnerConfig 必须为对象或 null', 'partnerConfig');
  }

  var rule = s.scoringRule;
  if (rule != null) {
    if (typeof rule !== 'object' || Array.isArray(rule)) {
      pushError(errors, 'scoring_rule_invalid', 'scoringRule 必须为对象', 'scoringRule');
    } else {
      if (rule.mode != null && rule.mode !== '' && !model.SCORING_MODE[rule.mode]) {
        pushError(errors, 'scoring_mode_invalid', 'scoringRule.mode 非法', 'scoringRule.mode');
      }
      if (rule.scoreBasis != null && rule.scoreBasis !== '' && !model.SCORE_BASIS[rule.scoreBasis]) {
        pushError(errors, 'score_basis_invalid', 'scoringRule.scoreBasis 非法', 'scoringRule.scoreBasis');
      }
      if (rule.globalM != null && rule.globalM !== '') {
        var gm = Number(rule.globalM);
        if (!Number.isFinite(gm) || Math.floor(gm) !== gm) {
          pushError(errors, 'global_m_type', 'globalM 必须为整数', 'scoringRule.globalM');
        }
      }
    }
  }

  if (s.rounds != null && !Array.isArray(s.rounds)) {
    pushError(errors, 'rounds_type', 'rounds 必须为数组', 'rounds');
  } else {
    var rounds = Array.isArray(s.rounds) ? s.rounds : [];
    var seenRoundIds = {};
    for (var i = 0; i < rounds.length; i++) {
      var r = rounds[i];
      var path = 'rounds[' + i + ']';
      if (!r || typeof r !== 'object') {
        pushError(errors, 'round_invalid', '轮次必须为对象', path);
        continue;
      }
      if (!isNonEmptyString(r.roundId)) {
        pushError(errors, 'round_id_required', 'roundId 缺失', path + '.roundId');
      } else {
        var rid = String(r.roundId).trim();
        if (seenRoundIds[rid]) {
          pushError(errors, 'round_id_duplicate', 'roundId 重复', path + '.roundId');
        }
        seenRoundIds[rid] = true;
      }
      if (r.roundStatus != null && r.roundStatus !== '' && !model.ROUND_STATUS[r.roundStatus]) {
        pushError(errors, 'round_status_invalid', 'roundStatus 非法', path + '.roundStatus');
      }
      if (r.gameMode != null && r.gameMode !== '' && !model.GAME_MODE[r.gameMode]) {
        pushError(errors, 'game_mode_invalid', 'gameMode 非法', path + '.gameMode');
      }
      if (r.topN != null && r.topN !== '') {
        var tn = Number(r.topN);
        if (!Number.isFinite(tn) || Math.floor(tn) !== tn) {
          pushError(errors, 'top_n_type', 'topN 必须为整数', path + '.topN');
        }
      }
    }
  }

  if (s.participants != null && !Array.isArray(s.participants)) {
    pushError(errors, 'participants_type', 'participants 必须为数组', 'participants');
  } else if (Array.isArray(s.participants)) {
    for (var p = 0; p < s.participants.length; p++) {
      var part = s.participants[p];
      var ppath = 'participants[' + p + ']';
      if (!part || typeof part !== 'object') {
        pushError(errors, 'participant_invalid', '参赛主体必须为对象', ppath);
        continue;
      }
      if (!isNonEmptyString(part.seriesParticipantId)) {
        pushError(errors, 'participant_id_required', 'seriesParticipantId 缺失', ppath + '.seriesParticipantId');
      }
      if (part.kind != null && part.kind !== '' && !model.PARTICIPANT_KIND[part.kind]) {
        pushError(errors, 'participant_kind_invalid', 'participant.kind 非法', ppath + '.kind');
      }
    }
  }

  validateRegistrationFields(s, errors);

  return { ok: errors.length === 0, errors: errors };
}

/**
 * registrationState / registrationRevision / roster 契约
 * - 不静默修复；冲突明确报错
 */
function validateRegistrationFields(series, errors) {
  var s = series && typeof series === 'object' ? series : null;
  if (!s) return;
  var state = s.registrationState;
  if (state != null && state !== '' && !model.REGISTRATION_STATE[state]) {
    pushError(errors, 'registration_state_invalid', 'registrationState 非法', 'registrationState');
  }
  if (s.registrationRevision != null && s.registrationRevision !== '') {
    var rev = Number(s.registrationRevision);
    if (!Number.isFinite(rev) || Math.floor(rev) !== rev || rev < 0) {
      pushError(
        errors,
        'registration_revision_invalid',
        'registrationRevision 须为非负整数',
        'registrationRevision'
      );
    }
  }
  if (s.roster != null && !Array.isArray(s.roster)) {
    pushError(errors, 'roster_type', 'roster 必须为数组', 'roster');
    return;
  }
  var roster = Array.isArray(s.roster) ? s.roster : [];
  var parentId = isNonEmptyString(s.seriesId) ? String(s.seriesId).trim() : '';
  var participantIds = Object.create(null);
  var parts = Array.isArray(s.participants) ? s.participants : [];
  for (var pi = 0; pi < parts.length; pi++) {
    var pid = parts[pi] && parts[pi].seriesParticipantId != null
      ? String(parts[pi].seriesParticipantId).trim()
      : '';
    if (pid) participantIds[pid] = true;
  }
  var registeredByPlayer = Object.create(null);
  var pairKeys = Object.create(null);
  for (var i = 0; i < roster.length; i++) {
    var e = roster[i];
    var path = 'roster[' + i + ']';
    if (!e || typeof e !== 'object') {
      pushError(errors, 'roster_entry_invalid', 'roster 条目必须为对象', path);
      continue;
    }
    if (!isNonEmptyString(e.rosterEntryId)) {
      pushError(errors, 'roster_entry_id_required', 'rosterEntryId 缺失', path + '.rosterEntryId');
    }
    if (!isNonEmptyString(e.playerId)) {
      pushError(errors, 'roster_player_id_required', 'playerId 缺失', path + '.playerId');
    }
    if (!isNonEmptyString(e.seriesParticipantId)) {
      pushError(
        errors,
        'roster_participant_id_required',
        'seriesParticipantId 缺失',
        path + '.seriesParticipantId'
      );
    } else if (!participantIds[String(e.seriesParticipantId).trim()]) {
      pushError(
        errors,
        'roster_participant_not_found',
        'seriesParticipantId 不在 participants 中',
        path + '.seriesParticipantId'
      );
    }
    if (isNonEmptyString(e.seriesId) && parentId && String(e.seriesId).trim() !== parentId) {
      pushError(
        errors,
        'roster_series_id_mismatch',
        'roster.seriesId 与父 Series 不一致',
        path + '.seriesId'
      );
    }
    var st = e.registrationStatus != null ? String(e.registrationStatus).trim() : '';
    if (!model.ROSTER_REGISTRATION_STATUS[st]) {
      pushError(
        errors,
        'roster_status_invalid',
        'registrationStatus 非法',
        path + '.registrationStatus'
      );
    }
    var playerId = isNonEmptyString(e.playerId) ? String(e.playerId).trim() : '';
    var spid = isNonEmptyString(e.seriesParticipantId)
      ? String(e.seriesParticipantId).trim()
      : '';
    if (playerId && spid) {
      var pair = playerId + '\0' + spid;
      if (pairKeys[pair]) {
        pushError(
          errors,
          'roster_player_participant_duplicate',
          '同一 playerId+seriesParticipantId 不得有多条',
          path
        );
      }
      pairKeys[pair] = true;
    }
    if (st === 'registered' && playerId) {
      if (registeredByPlayer[playerId]) {
        pushError(
          errors,
          'roster_player_multi_active',
          '同一 playerId 最多一个 registered 条目',
          path
        );
      }
      registeredByPlayer[playerId] = true;
    }
  }
}

/**
 * 发布完整校验（本批不接发布；供后续批次使用）
 * @param {object} series
 * @returns {{ ok: boolean, errors: Array }}
 */
function validateForPublish(series) {
  var base = validateDraftStructure(series);
  var errors = base.errors.slice();
  var s = series && typeof series === 'object' ? series : null;
  if (!s) {
    return { ok: false, errors: errors };
  }

  if (!model.HOST_MODE[s.hostMode]) {
    pushError(errors, 'host_mode_required', 'hostMode 必填且合法', 'hostMode');
  }
  if (!model.TEMPLATE_ID[s.templateId]) {
    pushError(errors, 'template_required', 'templateId 必填且合法', 'templateId');
  }
  if (!isNonEmptyString(s.seriesName)) {
    pushError(errors, 'series_name_required', 'seriesName 必填', 'seriesName');
  }
  // 发布：私密必须具备恰好 6 位数字访问码（与队际赛 _genAccessCode 形态一致）
  if (s.visibility === 'private') {
    if (!/^\d{6}$/.test(String(s.accessCode != null ? s.accessCode : ''))) {
      pushError(errors, 'access_code_required', '私密系列赛须设置 6 位数字访问码', 'accessCode');
    }
  }

  if (s.hostMode === 'organization') {
    var org = s.organization || {};
    if (!isNonEmptyString(org.organizationId)) {
      pushError(errors, 'organization_required', '组织机构必填', 'organization.organizationId');
    }
  }
  if (s.hostMode === 'team') {
    var host = s.hostTeam || {};
    if (!isNonEmptyString(host.teamId)) {
      pushError(errors, 'host_team_required', '主办球队必填', 'hostTeam.teamId');
    }
  }

  var participants = Array.isArray(s.participants) ? s.participants : [];
  if (participants.length < 2) {
    pushError(errors, 'participants_min', '至少两个参赛主体', 'participants');
  }

  var rule = s.scoringRule || {};
  if (!model.SCORING_MODE[rule.mode]) {
    pushError(errors, 'scoring_mode_required', 'scoringRule.mode 必填', 'scoringRule.mode');
  }
  if (!model.SCORE_BASIS[rule.scoreBasis]) {
    pushError(errors, 'score_basis_required', 'scoringRule.scoreBasis 必填', 'scoringRule.scoreBasis');
  }
  if (rule.mode === 'global_m') {
    var gm = Number(rule.globalM);
    if (!Number.isFinite(gm) || Math.floor(gm) < 1) {
      pushError(errors, 'global_m_min', 'globalM 必须 >= 1', 'scoringRule.globalM');
    }
  }

  var rounds = Array.isArray(s.rounds) ? s.rounds : [];
  if (rounds.length < 2) {
    pushError(errors, 'rounds_min', '轮次数至少为 2', 'rounds');
  }
  for (var i = 0; i < rounds.length; i++) {
    var r = rounds[i] || {};
    var path = 'rounds[' + i + ']';
    if (!model.GAME_MODE[r.gameMode]) {
      pushError(errors, 'game_mode_required', '每轮 gameMode 必填且合法', path + '.gameMode');
    }
    if (!isNonEmptyString(r.dateTime)) {
      pushError(errors, 'datetime_required', '每轮 dateTime 必填', path + '.dateTime');
    }
    if (!isNonEmptyString(r.courseId) || !isNonEmptyString(r.courseName)) {
      pushError(errors, 'course_required', '每轮球场必填', path + '.courseId');
    }
    if (rule.mode === 'per_round_n') {
      var tn = Number(r.topN);
      if (!Number.isFinite(tn) || Math.floor(tn) < 1) {
        pushError(errors, 'top_n_min', 'per_round_n 下每轮 topN 必须 >= 1', path + '.topN');
      }
    }
  }

  // 去重：同一 code+path 可能因 base 已报；保持全部明细即可
  return { ok: errors.length === 0, errors: errors };
}

/**
 * 标准化结果条目结构校验（不提取真实成绩）
 * @param {object} entry
 * @returns {{ ok: boolean, errors: Array }}
 */
function validateResultEntry(entry) {
  var errors = [];
  var e = entry && typeof entry === 'object' ? entry : null;
  if (!e) {
    pushError(errors, 'entry_required', 'entry 必须为对象', '');
    return { ok: false, errors: errors };
  }
  if (!isNonEmptyString(e.entryId)) {
    pushError(errors, 'entry_id_required', 'entryId 缺失', 'entryId');
  }
  if (!isNonEmptyString(e.seriesId)) {
    pushError(errors, 'entry_series_id_required', 'seriesId 缺失', 'seriesId');
  }
  if (!isNonEmptyString(e.roundId)) {
    pushError(errors, 'entry_round_id_required', 'roundId 缺失', 'roundId');
  }
  if (!isNonEmptyString(e.matchId)) {
    pushError(errors, 'entry_match_id_required', 'matchId 缺失', 'matchId');
  }
  if (!isNonEmptyString(e.seriesParticipantId)) {
    pushError(errors, 'entry_participant_required', 'seriesParticipantId 缺失', 'seriesParticipantId');
  }
  if (!isNonEmptyString(e.sourceEntityKey)) {
    pushError(errors, 'source_entity_key_required', 'sourceEntityKey 缺失', 'sourceEntityKey');
  }
  if (!model.RESULT_UNIT_TYPE[e.resultUnitType]) {
    pushError(errors, 'result_unit_invalid', 'resultUnitType 非法', 'resultUnitType');
  }
  if (!isNonEmptyString(e.resultStatus) || !model.RESULT_STATUS[e.resultStatus]) {
    pushError(errors, 'result_status_invalid', 'resultStatus 必填且合法', 'resultStatus');
  }
  if (e.resultStatus === 'OK') {
    if (e.rankingValue === null || e.rankingValue === undefined || e.rankingValue === '') {
      pushError(errors, 'ranking_value_required', 'OK 状态 rankingValue 必须为有限数值', 'rankingValue');
    } else {
      var rv = Number(e.rankingValue);
      if (!Number.isFinite(rv)) {
        pushError(errors, 'ranking_value_required', 'OK 状态 rankingValue 必须为有限数值', 'rankingValue');
      }
    }
  }
  var members = Array.isArray(e.memberUserIds)
    ? e.memberUserIds.map(function (id) {
        return String(id || '').trim();
      }).filter(Boolean)
    : [];
  var seenMember = {};
  var hasDup = false;
  for (var m = 0; m < members.length; m++) {
    if (seenMember[members[m]]) {
      hasDup = true;
      break;
    }
    seenMember[members[m]] = true;
  }
  if (hasDup) {
    pushError(errors, 'member_ids_duplicate', 'memberUserIds 不得包含重复 ID', 'memberUserIds');
  }
  if (e.resultUnitType === 'player' && members.length < 1) {
    pushError(errors, 'player_members_min', 'player 至少需要 1 个 memberUserId', 'memberUserIds');
  }
  if (e.resultUnitType === 'pair' && members.length < 2) {
    pushError(errors, 'pair_members_min', 'pair 至少需要 2 个 memberUserId', 'memberUserIds');
  }
  return { ok: errors.length === 0, errors: errors };
}

module.exports = {
  validateDraftStructure: validateDraftStructure,
  validateForPublish: validateForPublish,
  validateResultEntry: validateResultEntry,
  validateRegistrationFields: validateRegistrationFields
};
