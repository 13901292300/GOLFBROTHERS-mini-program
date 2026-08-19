/**
 * Series 莱德杯（业余双队、多轮 G5–G8 比洞）判别与创建约束。
 * 禁止用 global_m / per_round_n / 赛制字符串反推；历史缺失字段行为不变。
 */

var strokeEntityValidator = require('./strokeEntityValidator.js');

var COMPETITION_TYPE = 'ryder_cup';
var TEMPLATE_ID = 'ryder';
var SCORING_MODE = 'ryder_match_play';

var POINTS = {
  win: 1,
  tie: 0.5,
  loss: 0
};

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function isRyderCupTemplateId(templateId) {
  return asString(templateId) === TEMPLATE_ID;
}

/**
 * 显式类型：仅 seriesCompetitionType === 'ryder_cup'。
 * 不得把 templateId === 'ryder' 当作历史数据已是莱德杯。
 */
function isRyderCupSeries(series) {
  if (!isPlainObject(series)) return false;
  return asString(series.seriesCompetitionType) === COMPETITION_TYPE;
}

function listRyderCupGameModeNames() {
  var names = [];
  var g5 = strokeEntityValidator.G5_MATCH_PLAY_MODES || {};
  var g67 = strokeEntityValidator.G6_G7_MATCH_PLAY_MODES || {};
  var g8 = strokeEntityValidator.G8_MATCH_PLAY_MODES || {};
  var seen = Object.create(null);
  function pushKeys(map) {
    Object.keys(map).forEach(function (name) {
      if (!name || seen[name]) return;
      seen[name] = 1;
      names.push(name);
    });
  }
  pushKeys(g5);
  pushKeys(g67);
  pushKeys(g8);
  return names;
}

var RYDER_GAME_MODE_DESC = {
  个人比洞赛: '每位球员独立记分，按洞数胜负',
  最好成绩比洞赛: '四人一组，按比洞赛规则计分',
  四人四球比洞赛: '四人一组，按比洞赛规则计分',
  最佳球位比洞赛: '选择最佳落点，按比洞赛计分',
  四人两球比洞赛: '两人一队，按比洞赛规则计分'
};

function listRyderCupGameModeOptions() {
  return listRyderCupGameModeNames().map(function (name) {
    return {
      name: name,
      desc: RYDER_GAME_MODE_DESC[name] || ''
    };
  });
}

function isAllowedRyderCupGameMode(gameMode) {
  var mode = asString(gameMode);
  if (!mode) return false;
  return (
    !!strokeEntityValidator.isG5MatchPlayMode(mode) ||
    !!strokeEntityValidator.isG6G7MatchPlayMode(mode) ||
    !!strokeEntityValidator.isG8MatchPlayMode(mode)
  );
}

function assertRyderCupGameMode(gameMode) {
  if (isAllowedRyderCupGameMode(gameMode)) return { ok: true };
  return { ok: false, reason: 'ryder_game_mode_invalid', message: '莱德杯每轮只能选择 G5–G8 比洞赛' };
}

function countDistinctParticipants(series) {
  var parts = Array.isArray(series && series.participants) ? series.participants : [];
  var seen = Object.create(null);
  var n = 0;
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i] || {};
    var key =
      asString(p.seriesParticipantId) ||
      asString(p.sourceTeamId) ||
      asString(p.divisionId) ||
      '';
    if (!key || seen[key]) continue;
    seen[key] = 1;
    n += 1;
  }
  return n;
}

function assertExactlyTwoSides(series) {
  var n = countDistinctParticipants(series);
  if (n < 2) {
    return { ok: false, reason: 'ryder_sides_min', message: '莱德杯必须选择两支不同球队' };
  }
  if (n > 2) {
    return { ok: false, reason: 'ryder_sides_max', message: '莱德杯只能选择两支球队' };
  }
  return { ok: true };
}

/**
 * scoringRule.allowRepeat 的领域含义是「跨轮是否允许重复上场」。
 * 莱德杯：同轮由分组编辑器拒绝重复；跨轮允许 → 必须持久化为 allowRepeat: true。
 */
function createRyderCupScoringRule() {
  return {
    mode: SCORING_MODE,
    allowRepeat: true,
    scoreBasis: 'gross',
    ruleVersion: 1
  };
}

/**
 * 类型与计分模式双向校验。不根据 templateId / G5–G8 / scoring mode 反推莱德杯。
 */
function assertRyderCupTypeAndScoringMode(series) {
  var isRyder = isRyderCupSeries(series);
  var mode = asString(series && series.scoringRule && series.scoringRule.mode);
  if (isRyder && mode !== SCORING_MODE) {
    return {
      ok: false,
      reason: 'ryder_scoring_mode_mismatch',
      message: '莱德杯必须使用 ryder_match_play'
    };
  }
  if (!isRyder && mode === SCORING_MODE) {
    return {
      ok: false,
      reason: 'ryder_mode_requires_type',
      message: 'ryder_match_play 仅允许显式莱德杯使用'
    };
  }
  if (isRyder && !(series.scoringRule && series.scoringRule.allowRepeat === true)) {
    return {
      ok: false,
      reason: 'ryder_allow_repeat_mismatch',
      message: '莱德杯跨轮必须允许重复上场'
    };
  }
  return { ok: true };
}

function applyRyderCupDraftSelection(draft) {
  var next = isPlainObject(draft) ? draft : {};
  next.templateId = TEMPLATE_ID;
  next.seriesCompetitionType = COMPETITION_TYPE;
  next.scoringRule = createRyderCupScoringRule();
  return next;
}

function clearRyderCupDraftSelection(draft, fallbackScoringRule) {
  var next = isPlainObject(draft) ? draft : {};
  if (asString(next.seriesCompetitionType) === COMPETITION_TYPE) {
    next.seriesCompetitionType = '';
  }
  if (next.scoringRule && asString(next.scoringRule.mode) === SCORING_MODE) {
    next.scoringRule = fallbackScoringRule || {
      mode: 'per_round_n',
      globalM: 10,
      allowRepeat: false,
      scoreBasis: 'gross',
      ruleVersion: 1,
      defaultTopN: 3
    };
  }
  return next;
}

function defaultRyderCupRoundGameMode() {
  var names = listRyderCupGameModeNames();
  return names[0] || '个人比洞赛';
}

function shouldSkipScoringStep(draft) {
  return isRyderCupSeries(draft);
}

module.exports = {
  COMPETITION_TYPE: COMPETITION_TYPE,
  TEMPLATE_ID: TEMPLATE_ID,
  SCORING_MODE: SCORING_MODE,
  POINTS: POINTS,
  isRyderCupSeries: isRyderCupSeries,
  isRyderCupTemplateId: isRyderCupTemplateId,
  listRyderCupGameModeNames: listRyderCupGameModeNames,
  listRyderCupGameModeOptions: listRyderCupGameModeOptions,
  isAllowedRyderCupGameMode: isAllowedRyderCupGameMode,
  assertRyderCupGameMode: assertRyderCupGameMode,
  assertExactlyTwoSides: assertExactlyTwoSides,
  countDistinctParticipants: countDistinctParticipants,
  createRyderCupScoringRule: createRyderCupScoringRule,
  assertRyderCupTypeAndScoringMode: assertRyderCupTypeAndScoringMode,
  applyRyderCupDraftSelection: applyRyderCupDraftSelection,
  clearRyderCupDraftSelection: clearRyderCupDraftSelection,
  defaultRyderCupRoundGameMode: defaultRyderCupRoundGameMode,
  shouldSkipScoringStep: shouldSkipScoringStep
};
