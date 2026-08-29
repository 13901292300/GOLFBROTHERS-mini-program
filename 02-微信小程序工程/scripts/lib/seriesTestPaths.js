/**
 * 测试专用路径：主包瘦身后迁入分包的 utils。
 * 禁止 miniprogram 生产代码 require 本文件。
 *
 * 旧测试路径 miniprogram/utils/<name>.js → 当前真实路径（若分包存在则用分包）：
 *   seriesScoring.js
 *   seriesStandingsAssembler.js
 *   seriesResultAdapter.js
 *   tournamentGroupCardView.js
 *   tournamentGroupDraft.js
 *   seriesAccessGate.js
 *   registrationInteractionModel.js
 *   seriesSelfCancellationOrchestrator.js
 *   seriesRegistrationCancellationGate.js
 *   removePlayerFromMatchCompetitionStructure.js
 *   teamMatchViewerGroup.js
 *   teamMatchEnterGroupScore.js
 *   teamLeaderboardView.js
 *   teamLeaderboardHost.js
 *   liveLeaderboardBoard.js
 *   seriesStandingsExpandIdentity.js
 *   seriesNoRepeatLineup.js
 *   seriesColorMark.js
 *   matchPlayScoreboardView.js
 *   peoriaStore.js / peoriaCalculator.js / statisticsAdapter.js（tournament-tools 分包）
 *   scoreGroupFinish.js（scoring 分包）
 *   seriesPublish.js / seriesRoundUpdate.js / seriesInfoUpdate.js /
 *   seriesParticipantsUpdate.js / seriesPublishJournal.js（create 分包）
 */

var fs = require('fs');
var path = require('path');

var MINI = path.join(__dirname, '..', '..', 'miniprogram');
var MAIN_UTILS = path.join(MINI, 'utils');
var TOUR_UTILS = path.join(MINI, 'subpackages', 'tournament', 'utils');
var TOUR_COMPONENTS = path.join(MINI, 'subpackages', 'tournament', 'components');
var TOUR_STYLES = path.join(MINI, 'subpackages', 'tournament', 'styles');
var TOUR_TOOLS_UTILS = path.join(MINI, 'subpackages', 'tournament-tools', 'utils');
var SCORING_UTILS = path.join(MINI, 'subpackages', 'scoring', 'utils');
var CREATE_UTILS = path.join(MINI, 'subpackages', 'create', 'utils');

function util(name) {
  var file = String(name || '').replace(/\.js$/i, '') + '.js';
  var candidates = [TOUR_UTILS, TOUR_TOOLS_UTILS, SCORING_UTILS, CREATE_UTILS, MAIN_UTILS];
  var i;
  for (i = 0; i < candidates.length; i++) {
    var abs = path.join(candidates[i], file);
    if (fs.existsSync(abs)) return abs;
  }
  return path.join(MAIN_UTILS, file);
}

module.exports = {
  MINI: MINI,
  MAIN_UTILS: MAIN_UTILS,
  TOUR_UTILS: TOUR_UTILS,
  TOUR_COMPONENTS: TOUR_COMPONENTS,
  TOUR_STYLES: TOUR_STYLES,
  TOUR_TOOLS_UTILS: TOUR_TOOLS_UTILS,
  SCORING_UTILS: SCORING_UTILS,
  CREATE_UTILS: CREATE_UTILS,
  util: util
};
