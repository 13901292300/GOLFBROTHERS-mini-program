/**
 * PATCH 2C：canonical assignment role 语义。
 * 运行：node scripts/assignmentRole.selftest.js
 */
var fs = require('fs');
var path = require('path');
var assign = require('../miniprogram/subpackages/game/utils/assignmentNormalize.js');
var settleLasuo4 = require('../miniprogram/subpackages/game/utils/settleLasuo4.js');
var settle8421Four = require('../miniprogram/subpackages/game/utils/settle8421Four.js');
var mark = require('../miniprogram/utils/sideGameRankMark.js');

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

function roleOf(list, pid) {
  var i;
  for (i = 0; i < (list || []).length; i++) {
    if (String(list[i].playerId) === String(pid)) return list[i].role;
  }
  return '';
}

function fourSettleGame(groupMode, extra) {
  return Object.assign(
    {
      catalogId: 'lasuo-4',
      groupMode: groupMode,
      rankId: 'gross-origin',
      playerOrder: ['A', 'B', 'C', 'D'],
      players: ['A', 'B', 'C', 'D'].map(function (id) {
        return { id: id };
      }),
      multiplier: 1,
      holes: [
        { label: 'A1', on: true },
        { label: 'A2', on: true }
      ],
      ruleSnapshot: {
        pkBetter: true,
        pkWorse: true,
        pkTotal: true,
        pkBetterW: '1',
        pkWorseW: '1',
        pkTotalW: '1',
        pkTotalMode: 'sum',
        reward: 'none',
        pushRule: 'push'
      }
    },
    extra || {}
  );
}

var fourFixed = settle8421Four.settle(
  {
    catalogId: '8421-4',
    groupMode: 'fixed',
    playerOrder: ['A', 'B', 'C', 'D'],
    players: ['A', 'B', 'C', 'D'].map(function (id) {
      return { id: id };
    }),
    multiplier: 1,
    holes: [
      { label: '1', on: true },
      { label: '2', on: true }
    ],
    ruleSnapshot: { pushRule: 'zero' }
  },
  {
    scores: { '1': { A: 4, B: 5, C: 6, D: 7 } },
    holeOrder: ['1', '2'],
    pars: { '1': 4, '2': 4 }
  }
);
var a1Fixed = fourFixed.assignmentsByHole['1'];
assert(
  'CASE1 固定分边两名同侧都 primary',
  roleOf(a1Fixed, 'A') === 'primary' &&
    roleOf(a1Fixed, 'B') === 'primary' &&
    roleOf(a1Fixed, 'C') === 'primary' &&
    roleOf(a1Fixed, 'D') === 'primary',
  JSON.stringify(a1Fixed)
);

var fixedView = {
  catalogId: '8421-4',
  groupMode: 'fixed',
  players: ['A', 'B', 'C', 'D'].map(function (id) {
    return { id: id };
  }),
  holeResults: fourFixed
};
mark.resetLegacyMarkCalls();
var tA = mark.markForGameCell(fixedView, '1', 'A');
var tB = mark.markForGameCell(fixedView, '1', 'B');
var tC = mark.markForGameCell(fixedView, '1', 'C');
var tD = mark.markForGameCell(fixedView, '1', 'D');
assert(
  'CASE2 固定分边 triangle 全实心',
  tA.hasWaist === false &&
    tB.hasWaist === false &&
    tC.hasWaist === false &&
    tD.hasWaist === false &&
    tA.triangleClass === 'triangle-blue' &&
    tB.triangleClass === 'triangle-blue' &&
    tC.triangleClass === 'triangle-red' &&
    tD.triangleClass === 'triangle-red'
);

var splitGame = fourSettleGame('split-high', {
  groupMembership: { A: 'expert', B: 'expert', C: 'low', D: 'low' }
});
var splitRes = settleLasuo4.settle(splitGame, {
  scores: { A1: { A: 5, B: 6, C: 3, D: 4 } },
  holeOrder: ['A1', 'A2'],
  pars: { A1: 4, A2: 4 }
});
function allHolesPrimary(pid) {
  return (
    roleOf(splitRes.assignmentsByHole.A1, pid) === 'primary' &&
    roleOf(splitRes.assignmentsByHole.A2, pid) === 'primary'
  );
}
function allHolesSecondary(pid) {
  return (
    roleOf(splitRes.assignmentsByHole.A1, pid) === 'secondary' &&
    roleOf(splitRes.assignmentsByHole.A2, pid) === 'secondary'
  );
}
assert(
  'CASE3 split-high 高手组始终 primary',
  allHolesPrimary('A') && allHolesPrimary('B'),
  JSON.stringify(splitRes.assignmentsByHole)
);
assert(
  'CASE4 split-high 低组始终 secondary',
  allHolesSecondary('C') && allHolesSecondary('D'),
  JSON.stringify(splitRes.assignmentsByHole)
);
assert(
  'CASE5 即使低组本洞成绩更好，role 也不交换',
  allHolesPrimary('A') &&
    allHolesPrimary('B') &&
    allHolesSecondary('C') &&
    allHolesSecondary('D')
);

mark.resetLegacyMarkCalls();
mark.markForGameCell(Object.assign({}, splitGame, { holeResults: splitRes }), 'A2', 'A');
mark.markForGameCell(fixedView, '1', 'A');
assert('CASE6 assignment 存在时 triangle 不走 legacy', mark.getLegacyMarkCalls() === 0, String(mark.getLegacyMarkCalls()));

var visualSrc = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'utils', 'rankMarkVisual.js'),
  'utf8'
);
var fnBody = visualSrc.split('function markFromAssignment')[1].split('function resultSnapshotOf')[0];
assert(
  'triangle markFromAssignment 仍无 fixed / split-high 特判',
  fnBody.indexOf('fixed') < 0 && fnBody.indexOf('split-high') < 0 && fnBody.indexOf('expert') < 0
);

console.log('RESULT passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
