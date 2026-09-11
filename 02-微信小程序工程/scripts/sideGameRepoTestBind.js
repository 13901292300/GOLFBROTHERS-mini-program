/**
 * Selftest helper：把记录灌进 LocalSideGameRepository 并 bind port/facade。
 */
var localMod = require('../miniprogram/subpackages/game/utils/localSideGameRepository.js');
var facade = require('../miniprogram/subpackages/game/utils/sideGameRepository.js');
var port = require('../miniprogram/utils/sideGameRepositoryPort.js');

function memStorage(bag) {
  return {
    getItem: function (key) {
      return bag[key];
    },
    setItem: function (key, value) {
      bag[key] = JSON.parse(JSON.stringify(value));
      return true;
    },
    removeItem: function (key) {
      delete bag[key];
      return true;
    },
    listKeys: function () {
      return Object.keys(bag);
    }
  };
}

function seed(records) {
  var list = JSON.parse(JSON.stringify(records || []));
  var i;
  for (i = 0; i < list.length; i++) {
    if (!list[i].sideGameId) list[i].sideGameId = 'sg_seed_' + (i + 1);
  }
  var bag = { gb_side_games_v1: list };
  var n = 0;
  var repo = localMod.createLocalSideGameRepository({
    storage: memStorage(bag),
    clock: function () {
      return 1000;
    },
    idGen: function () {
      n += 1;
      return 'sg_t' + n;
    }
  });
  facade.setImplementation(repo);
  port.bind(facade);
  global.__gb_side_games_repo = repo;
  global.__gb_side_games_bag = bag;
  global.__gb_side_games = refresh('');
  return { repo: repo, bag: bag };
}

function refresh(matchId) {
  var repo = global.__gb_side_games_repo;
  if (!repo) {
    global.__gb_side_games = [];
    return [];
  }
  var listed = repo.listByMatchId({
    matchId: matchId || '',
    includeDeleted: true
  });
  var items = listed && listed.ok && listed.data && listed.data.items ? listed.data.items : [];
  global.__gb_side_games = items;
  return items;
}

function row0(matchId) {
  var items = refresh(matchId);
  return items[0] || null;
}

module.exports = {
  seed: seed,
  refresh: refresh,
  row0: row0
};
