var coord = require('../../utils/sideGameSettleCoordinator.js');
require('../../utils/sideGameRepository.js');

Component({
  methods: {
    settleForOfficial: function (official) {
      return coord.settleSideGamesForScoreMutation(official || {});
    }
  }
});
