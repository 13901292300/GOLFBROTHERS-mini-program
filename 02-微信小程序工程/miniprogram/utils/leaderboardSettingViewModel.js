/**
 * 领先榜设置弹窗 — 普通 detail / Series 共享纯投影（Patch L2）
 * 权威契约（来自 tournament/pages/detail）：
 *   sections: scoreType(gross|net) + view(team|all|male|female)
 *   净杆：match.peoriaResult.status === 'generated'
 *   未知性别：不出现在 male/female 过滤结果中（严格 ===）
 *   G2/G3/G4：不提供 male/female，运行时归一为 all
 */

var strokeEntityValidator = require('./strokeEntityValidator.js');

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function hasLeaderboardNetScore(match) {
  if (!match || !match.peoriaResult) return false;
  return match.peoriaResult.status === 'generated';
}

function resolveGameMode(match) {
  if (typeof strokeEntityValidator.resolveGameMode === 'function') {
    try {
      return asString(strokeEntityValidator.resolveGameMode(match));
    } catch (e0) {
      /* fallthrough */
    }
  }
  return asString(match && (match.gameMode || match.selectedGameMode));
}

/** G2/G3/G4（含同 family 比洞）组合/Pair 榜：不提供男女过滤 */
function hidesLeaderboardGenderViews(match) {
  var kind = '';
  if (typeof strokeEntityValidator.resolveStrokeKind === 'function') {
    try {
      kind = asString(strokeEntityValidator.resolveStrokeKind(resolveGameMode(match)));
    } catch (e1) {
      kind = '';
    }
  }
  return kind === 'g2g3' || kind === 'g4';
}

function resolveLeaderboardViewOptions(match) {
  var teamGroups = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
  var hasTeam = teamGroups.length >= 2;
  if (hidesLeaderboardGenderViews(match)) {
    return hasTeam ? ['team', 'all'] : ['all'];
  }
  return hasTeam ? ['team', 'all', 'male', 'female'] : ['all', 'male', 'female'];
}

function isTeamCompetitionEnabled(match) {
  var rules = match && match.scoringRules;
  var competition = rules && rules.teamCompetition;
  return !!(competition && competition.enabled === true);
}

function resolveLeaderboardDefaultView(match) {
  var options = resolveLeaderboardViewOptions(match);
  if (options.indexOf('team') >= 0 && isTeamCompetitionEnabled(match)) return 'team';
  return 'all';
}

function leaderboardViewToMode(view) {
  return asString(view) === 'team' ? 'team' : 'player';
}

/**
 * @param {object|null} match
 * @param {object|string|null} selection { view, scoreType } 或旧字符串 view
 * @returns {{ view: string, scoreType: string }}
 */
function normalizeLeaderboardSelection(match, selection) {
  var raw =
    selection && typeof selection === 'object' && !Array.isArray(selection)
      ? selection
      : { view: selection };
  // 兼容 Series 旧会话：player/entity/pair → all
  var rawView = asString(raw.view);
  if (
    rawView === 'player' ||
    rawView === 'entity' ||
    rawView === 'pair'
  ) {
    rawView = 'all';
  }
  var options = resolveLeaderboardViewOptions(match);
  if (
    (rawView === 'male' || rawView === 'female') &&
    options.indexOf(rawView) < 0
  ) {
    rawView = 'all';
  }
  var view =
    options.indexOf(rawView) >= 0 ? rawView : resolveLeaderboardDefaultView(match);
  var netAvailable = hasLeaderboardNetScore(match);
  var scoreType =
    asString(raw.scoreType) === 'net' && netAvailable ? 'net' : 'gross';
  return { view: view, scoreType: scoreType };
}

function buildLeaderboardViewLabel(scoreType, view, sideLabel) {
  var scoreText = asString(scoreType) === 'net' ? '净杆' : '总杆';
  var side = asString(sideLabel) || '球队';
  var viewMap = {
    team: side,
    all: '全部',
    male: '男子',
    female: '女子'
  };
  var v = asString(view);
  return scoreText + ' · ' + (viewMap[v] || viewMap.all);
}

/**
 * @param {object|null} match
 * @param {object|string|null} currentSelection
 * @param {object} [opts]
 * @param {string} [opts.sideLabel] 球队/分队按钮文案
 * @returns {{
 *   sections: Array,
 *   draftValues: { scoreType: string, view: string },
 *   selection: { view: string, scoreType: string },
 *   netAvailable: boolean,
 *   viewOptions: string[],
 *   viewLabel: string,
 *   leaderboardMode: string
 * }}
 */
function buildLeaderboardSettingViewModel(match, currentSelection, opts) {
  var o = opts && typeof opts === 'object' ? opts : {};
  var selection = normalizeLeaderboardSelection(match, currentSelection);
  var netAvailable = hasLeaderboardNetScore(match);
  var viewOptions = resolveLeaderboardViewOptions(match);
  var sideLabel = asString(o.sideLabel) || '球队';
  var viewNameMap = {
    team: sideLabel,
    all: '全部',
    male: '男子',
    female: '女子'
  };
  var viewOpts = viewOptions.map(function (key) {
    return {
      key: key,
      name: viewNameMap[key] || key,
      sub: '',
      disabled: false
    };
  });
  var sections = [
    {
      key: 'scoreType',
      label: '成绩类型',
      options: [
        { key: 'gross', name: '总杆', sub: '', disabled: false },
        {
          key: 'net',
          name: '净杆',
          sub: netAvailable ? '' : '（未生成）',
          disabled: !netAvailable
        }
      ]
    },
    {
      key: 'view',
      label: '查看方式',
      options: viewOpts
    }
  ];
  return {
    sections: sections,
    draftValues: {
      scoreType: selection.scoreType,
      view: selection.view
    },
    selection: selection,
    netAvailable: netAvailable,
    viewOptions: viewOptions,
    viewLabel: buildLeaderboardViewLabel(
      selection.scoreType,
      selection.view,
      sideLabel
    ),
    leaderboardMode: leaderboardViewToMode(selection.view)
  };
}

module.exports = {
  hasLeaderboardNetScore: hasLeaderboardNetScore,
  hidesLeaderboardGenderViews: hidesLeaderboardGenderViews,
  resolveLeaderboardViewOptions: resolveLeaderboardViewOptions,
  resolveLeaderboardDefaultView: resolveLeaderboardDefaultView,
  normalizeLeaderboardSelection: normalizeLeaderboardSelection,
  buildLeaderboardSettingViewModel: buildLeaderboardSettingViewModel,
  buildLeaderboardViewLabel: buildLeaderboardViewLabel,
  leaderboardViewToMode: leaderboardViewToMode
};
