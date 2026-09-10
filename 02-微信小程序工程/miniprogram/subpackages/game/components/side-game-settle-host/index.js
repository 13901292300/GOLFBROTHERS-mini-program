var coord = require('../../utils/sideGameSettleCoordinator.js');

Component({
  methods: {
    settleForOfficial: function (official) {
      return coord.settleSideGamesForScoreMutation(official || {});
    }
  }
});
