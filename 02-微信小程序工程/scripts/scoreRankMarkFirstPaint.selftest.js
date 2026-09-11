/**
 * 记分页首屏三角：主包同步投影，不先清空、不依赖游戏分包 engine。
 * 运行：node scripts/scoreRankMarkFirstPaint.selftest.js
 */
if (typeof global.wx !== 'object') {
  global.wx = {
    getStorageSync: function () {
      return global.__gb_side_games || [];
    },
    setStorageSync: function (_k, v) {
      global.__gb_side_games = v;
    }
  };
}

var fs = require('fs');
var path = require('path');
var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');
var bind = require('./sideGameRepoTestBind.js');
var mark = require('../miniprogram/utils/sideGameRankMark.js');
var scoreRank = require('../miniprogram/subpackages/scoring/utils/scoreRankMark.js');

var passed = 0;
var failed = 0;

function assert(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    console.log('FAIL  ' + name + (detail ? ' :: ' + detail : ''));
  }
}

function holesOn() {
  return catalog.HOLES.map(function (label) {
    return { label: label, on: true };
  });
}

function fourPlayers() {
  return [{ id: 'pA' }, { id: 'pB' }, { id: 'pC' }, { id: 'pD' }];
}

function filledScores(n) {
  var a = [];
  var i;
  for (i = 0; i < 18; i++) a.push(i < n ? 4 : '');
  return a;
}

bind.seed([
  {
    matchId: 'm-home',
    groupId: 'grp-1',
    status: 'active',
    ruleId: 'lasuo-4',
    revision: 1,
    resultRevision: 1,
    participantParties: fourPlayers().map(function (p) {
      return { partyId: p.id, partyType: 'player', memberPlayerIds: [p.id] };
    }),
    config: {
      instance: {
        catalogId: 'lasuo-4',
        players: fourPlayers(),
        playerOrder: ['pA', 'pB', 'pC', 'pD'],
        groupMode: 'random',
        splitHighExpertIds: ['pA'],
        holes: holesOn(),
        holeOrder: catalog.HOLES.slice()
      }
    }
  }
]);

var official = {
  matchId: 'm-home',
  groupId: 'grp-1',
  pars: catalog.HOLES.map(function () {
    return 4;
  }),
  players: fourPlayers().map(function (p) {
    return { playerId: p.id, scores: filledScores(3) };
  })
};

var sync = scoreRank.projectFromStorage(official);
assert('同步投影含 4 名球员', ['pA', 'pB', 'pC', 'pD'].every(function (id) {
  return sync[id] && Object.keys(sync[id]).length === 18;
}));
assert(
  '高手第一蓝三角（pA 洞1）',
  scoreRank.markFromProjection(sync, 'pA', 0).triangleClass === 'triangle-blue' &&
    !!scoreRank.colorFromProjection(sync, 'pA', 0)
);
assert(
  '高手第二红三角（pB 洞1）',
  scoreRank.markFromProjection(sync, 'pB', 0).triangleClass === 'triangle-red'
);
assert('组外无三角', scoreRank.colorFromProjection(sync, 'pZ', 0) === '');

var sameStamp = scoreRank.authoritySignature({ matchId: 'm-home', groupId: 'grp-1' }, official);
var sameStamp2 = scoreRank.authoritySignature({ matchId: 'm-home', groupId: 'grp-1' }, official);
assert('权威签名稳定', sameStamp === sameStamp2 && sameStamp.indexOf('m-home') >= 0);

official.players[0].scores[0] = 5;
var scoreStamp = scoreRank.authoritySignature({ matchId: 'm-home', groupId: 'grp-1' }, official);
assert('改成绩后面签名变化', scoreStamp !== sameStamp);

var flippedRec = JSON.parse(JSON.stringify(bind.row0('m-home')));
flippedRec.config.instance.playerOrder = ['pB', 'pA', 'pC', 'pD'];
bind.seed([flippedRec]);
var orderStamp = scoreRank.authoritySignature({ matchId: 'm-home', groupId: 'grp-1' }, official);
assert('改人员顺序后面签名变化', orderStamp !== scoreStamp);

var flipped = scoreRank.projectFromStorage(official);
assert(
  '改顺序后洞1 三角随权威 playerOrder 更新',
  scoreRank.markFromProjection(flipped, 'pB', 0).triangleClass === 'triangle-blue' &&
    scoreRank.markFromProjection(flipped, 'pA', 0).triangleClass === 'triangle-red'
);

bind.seed([]);
var empty = scoreRank.projectFromStorage(official);
assert(
  '删除游戏后同步投影全空',
  !scoreRank.colorFromProjection(empty, 'pA', 0) &&
    !scoreRank.colorFromProjection(empty, 'pB', 0)
);

var scoreJs = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/scoring/pages/score/index.js'),
  'utf8'
);
assert('记分页首屏调用 projectFromStorage', /projectFromStorage\(official\)/.test(scoreJs));
assert(
  '进入时不按 scope 先 replace 空投影',
  !/_rankMarkScopeKey !== scopeKey[\s\S]{0,180}replaceRankMarkProjection\(page, \{\}/.test(scoreJs)
);
assert('不 require 游戏分包投影模块', scoreJs.indexOf("game/utils/rankMarkProjection") < 0);
assert(
  '成绩 mutation 后显式 settle',
  /_settleSideGamesAfterScoreMutation/.test(scoreJs) && /sideGameSettleHost/.test(scoreJs)
);

console.log('\nscoreRankMarkFirstPaint.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
