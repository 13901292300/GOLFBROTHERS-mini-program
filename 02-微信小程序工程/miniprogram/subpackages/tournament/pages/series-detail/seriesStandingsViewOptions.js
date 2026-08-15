/**
 * Series 本轮领先榜选项 / 会话选择
 * L2：设置弹窗完整复用 utils/leaderboardSettingViewModel（与普通 detail 同一契约）
 * - sections: scoreType + view(team|all|male|female)
 * - 非球队列表的主体单位（player/entity/pair）由 gameMode 决定，不进设置选项
 */

var strokeEntityValidator = require('../../../../utils/strokeEntityValidator.js');
var leaderboardSettingViewModel = require('../../../../utils/leaderboardSettingViewModel.js');

var VIEW = {
  team: 'team',
  all: 'all',
  male: 'male',
  female: 'female',
  // 兼容旧会话/旧板投影（不再作为设置选项）
  player: 'player',
  entity: 'entity',
  pair: 'pair'
};

var UNIT = {
  team: 'team',
  player: 'player',
  entity: 'entity',
  pair: 'pair'
};

var BOARD_LABEL = {
  team: 'TEAM STANDINGS',
  entity: 'COMBO STANDINGS',
  pair: 'PAIR STANDINGS'
};

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function resolveGameMode(match) {
  if (typeof strokeEntityValidator.resolveGameMode === 'function') {
    try {
      return asString(strokeEntityValidator.resolveGameMode(match));
    } catch (e) {
      /* fallthrough */
    }
  }
  return asString(match && (match.gameMode || match.selectedGameMode));
}

function resolveKind(gameMode) {
  var mode = asString(gameMode);
  if (typeof strokeEntityValidator.resolveStrokeKind === 'function') {
    try {
      return asString(strokeEntityValidator.resolveStrokeKind(mode)) || 'other';
    } catch (e1) {
      /* fallthrough */
    }
  }
  if (mode === '个人比杆赛') return 'g1';
  if (
    mode === '最好成绩比杆赛' ||
    mode === '四人四球比杆赛' ||
    mode === '最佳球位比杆赛'
  ) {
    return 'g2g3';
  }
  if (mode === '四人两球比杆赛') return 'g4';
  return 'other';
}

/**
 * 非球队「全部/男子/女子」下列表主体单位（对齐 detail：gross+entity 模式走 entity；net 走个人）
 */
function resolveListUnit(match, scoreType) {
  if (asString(scoreType) === 'net') return UNIT.player;
  var kind = resolveKind(resolveGameMode(match));
  if (kind === 'g2g3') return UNIT.entity;
  if (kind === 'g4') return UNIT.pair;
  return UNIT.player;
}

function shouldBuildEntityList(match) {
  var kind = resolveKind(resolveGameMode(match));
  if (kind !== 'g2g3' && kind !== 'g4') return false;
  var scoreEntities =
    match && match.scoreEntities && typeof match.scoreEntities === 'object'
      ? match.scoreEntities
      : null;
  if (!scoreEntities) return kind === 'g2g3' || kind === 'g4';
  var keys = Object.keys(scoreEntities);
  for (var i = 0; i < keys.length; i++) {
    if (Array.isArray(scoreEntities[keys[i]]) && scoreEntities[keys[i]].length) {
      return true;
    }
  }
  return kind === 'g2g3' || kind === 'g4';
}

function hasExplicitView(selection) {
  if (selection == null) return false;
  if (typeof selection === 'string') return !!asString(selection);
  if (typeof selection === 'object' && !Array.isArray(selection)) {
    return !!asString(selection.view);
  }
  return false;
}

/**
 * Series 轮次榜：队际分站默认球队榜。
 * 分站 global_m 会关掉 teamCompetition，不能因此把 Rn 默认成全部/个人榜。
 */
function resolveSeriesStandingsDefaultView(match) {
  var options = leaderboardSettingViewModel.resolveLeaderboardViewOptions(match);
  if (options.indexOf(VIEW.team) >= 0) return VIEW.team;
  return leaderboardSettingViewModel.resolveLeaderboardDefaultView(match);
}

function normalizeSeriesStandingsSelection(match, selection) {
  if (!hasExplicitView(selection)) {
    var scoreType =
      selection && typeof selection === 'object' && !Array.isArray(selection)
        ? selection.scoreType
        : '';
    return leaderboardSettingViewModel.normalizeLeaderboardSelection(match, {
      view: resolveSeriesStandingsDefaultView(match),
      scoreType: scoreType
    });
  }
  return leaderboardSettingViewModel.normalizeLeaderboardSelection(match, selection);
}

/** @deprecated 兼容：仅返回 view 字符串 */
function normalizeSeriesStandingsView(view, match) {
  return normalizeSeriesStandingsSelection(match, view).view;
}

/**
 * Series 打开弹窗：完整复用普通赛事设置投影
 */
function buildSeriesLeaderboardSettingSections(match, draftSelection, opts) {
  var o = opts && typeof opts === 'object' ? opts : {};
  var packed = leaderboardSettingViewModel.buildLeaderboardSettingViewModel(
    match,
    normalizeSeriesStandingsSelection(match, draftSelection),
    { sideLabel: asString(o.sideLabel) || '球队' }
  );
  return {
    sections: packed.sections,
    draftValues: packed.draftValues,
    selection: packed.selection,
    view: packed.selection.view,
    scoreType: packed.selection.scoreType,
    netAvailable: packed.netAvailable,
    viewOptions: packed.viewOptions,
    viewLabel: packed.viewLabel
  };
}

function boardViewLabel(view, scoreType, match) {
  var sel = normalizeSeriesStandingsSelection(match, {
    view: view,
    scoreType: scoreType
  });
  if (sel.view === 'team') return BOARD_LABEL.team;
  var unit = resolveListUnit(match, sel.scoreType);
  if (unit === UNIT.entity) return BOARD_LABEL.entity;
  if (unit === UNIT.pair) return BOARD_LABEL.pair;
  return leaderboardSettingViewModel.buildLeaderboardViewLabel(
    sel.scoreType,
    sel.view,
    '球队'
  );
}

function viewDisplayName(view) {
  var map = {
    team: '球队',
    all: '全部',
    male: '男子',
    female: '女子',
    player: '全部',
    entity: '全部',
    pair: '全部'
  };
  return map[asString(view)] || map.all;
}

/** 旧 API：不再作为设置选项来源；保留给自测迁移期 */
function resolveSeriesStandingsViewOptions(match) {
  return leaderboardSettingViewModel
    .resolveLeaderboardViewOptions(match)
    .map(function (key) {
      var nameMap = {
        team: '球队',
        all: '全部',
        male: '男子',
        female: '女子'
      };
      return { key: key, name: nameMap[key] || key };
    });
}

module.exports = {
  VIEW: VIEW,
  UNIT: UNIT,
  BOARD_LABEL: BOARD_LABEL,
  resolveGameMode: resolveGameMode,
  resolveKind: resolveKind,
  resolveListUnit: resolveListUnit,
  shouldBuildEntityList: shouldBuildEntityList,
  resolveSeriesStandingsDefaultView: resolveSeriesStandingsDefaultView,
  normalizeSeriesStandingsSelection: normalizeSeriesStandingsSelection,
  normalizeSeriesStandingsView: normalizeSeriesStandingsView,
  buildSeriesLeaderboardSettingSections: buildSeriesLeaderboardSettingSections,
  boardViewLabel: boardViewLabel,
  viewDisplayName: viewDisplayName,
  resolveSeriesStandingsViewOptions: resolveSeriesStandingsViewOptions,
  hasLeaderboardNetScore: leaderboardSettingViewModel.hasLeaderboardNetScore,
  buildLeaderboardViewLabel: leaderboardSettingViewModel.buildLeaderboardViewLabel
};
