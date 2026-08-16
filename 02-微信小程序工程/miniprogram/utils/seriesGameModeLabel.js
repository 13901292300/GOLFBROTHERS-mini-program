/**
 * Series 赛制显示名（叶子模块：无 ViewModel / 页面依赖）
 * 未知或空值返回 ''，不伪造默认赛制。
 */

var GAME_MODE_DISPLAY_LABELS = {
  个人比杆赛: '个人比杆赛',
  四人四球比杆赛: '四人四球比杆赛',
  最佳球位比杆赛: '最佳球位比杆赛',
  四人两球比杆赛: '四人两球比杆赛',
  最好成绩比杆赛: '四人四球比杆赛',
  个人比洞赛: '个人比洞赛',
  四人四球比洞赛: '四人四球比洞赛',
  最佳球位比洞赛: '最佳球位比洞赛',
  四人两球比洞赛: '四人两球比洞赛',
  最好成绩比洞赛: '四人四球比洞赛',
  individual_stroke: '个人比杆赛',
  fourball: '四人四球比杆赛',
  best_ball: '最佳球位比杆赛',
  'best-ball': '最佳球位比杆赛',
  foursomes: '四人两球比杆赛',
  foursome: '四人两球比杆赛',
  fourball_2ball: '四人两球比杆赛',
  'match-play': '个人比洞赛',
  match_play: '个人比洞赛'
};

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function resolveSeriesGameModeLabel(rawMode) {
  var mode = asString(rawMode);
  if (!mode) return '';
  var label = GAME_MODE_DISPLAY_LABELS[mode];
  if (!label || label === 'undefined' || label === 'null') return '';
  return label;
}

module.exports = {
  GAME_MODE_DISPLAY_LABELS: GAME_MODE_DISPLAY_LABELS,
  resolveSeriesGameModeLabel: resolveSeriesGameModeLabel
};
