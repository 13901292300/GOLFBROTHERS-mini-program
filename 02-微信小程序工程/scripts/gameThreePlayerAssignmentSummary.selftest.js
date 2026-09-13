/**
 * 三人玩法 game-tab 逐洞单/双文案。
 * 运行：node scripts/gameThreePlayerAssignmentSummary.selftest.js
 */
var fs = require('fs');
var path = require('path');

var gameUtils = path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'utils');
var summary = require(path.join(gameUtils, 'threePlayerAssignmentSummary.js'));
var holeSides = require(path.join(__dirname, '..', 'miniprogram', 'utils', 'assignmentHoleSides.js'));
var assignNorm = require(path.join(__dirname, '..', 'miniprogram', 'utils', 'assignmentNormalize.js'));
var settleBig = require(path.join(gameUtils, 'settleLandlordBig.js'));
var settleMid = require(path.join(gameUtils, 'settleLandlordMid.js'));
var settleSmall = require(path.join(gameUtils, 'settleLandlordSmall.js'));
var settle8421 = require(path.join(gameUtils, 'settle8421Three.js'));

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

function names() {
  return {
    A: { id: 'A', displayName: '张三' },
    B: { id: 'B', displayName: '李四' },
    C: { id: 'C', displayName: '王五' }
  };
}

function assignOf(catalogId, order) {
  var sides = holeSides.holeSidesFromOrder(
    { catalogId: catalogId, groupMode: 'random' },
    order
  );
  return assignNorm.fromHoleSides(sides);
}

function idsOf(arr) {
  return (arr || []).join(',');
}

var map = names();
var orderAbc = ['A', 'B', 'C'];

var big = summary.buildThreePlayerAssignmentText(assignOf('landlord-big', orderAbc), map);
assert('CASE1 斗大 单 A 双 B/C', big.soloPlayerId === 'A' && idsOf(big.pairPlayerIds) === 'B,C', JSON.stringify(big));
assert('CASE1 斗大文案', big.text === '单 张三 · 双 李四/王五', big.text);

var mid = summary.buildThreePlayerAssignmentText(assignOf('landlord-mid', orderAbc), map);
assert('CASE2 斗二 单 B 双 A/C', mid.soloPlayerId === 'B' && idsOf(mid.pairPlayerIds) === 'A,C', JSON.stringify(mid));
assert('CASE2 斗二文案', mid.text === '单 李四 · 双 张三/王五', mid.text);

var small = summary.buildThreePlayerAssignmentText(assignOf('landlord-small', orderAbc), map);
assert('CASE3 斗小 单 C 双 A/B', small.soloPlayerId === 'C' && idsOf(small.pairPlayerIds) === 'A,B', JSON.stringify(small));
assert('CASE3 斗小文案', small.text === '单 王五 · 双 张三/李四', small.text);

var t8421 = summary.buildThreePlayerAssignmentText(assignOf('8421-3', orderAbc), map);
assert('CASE4 8421-3 单 B 双 A/C', t8421.soloPlayerId === 'B' && idsOf(t8421.pairPlayerIds) === 'A,C', JSON.stringify(t8421));
assert('CASE4 8421-3 文案', t8421.text === '单 李四 · 双 张三/王五', t8421.text);

var c1 = summary.buildThreePlayerAssignmentText(assignOf('landlord-mid', ['A', 'B', 'C']), map);
var c2 = summary.buildThreePlayerAssignmentText(assignOf('landlord-mid', ['B', 'C', 'A']), map);
assert(
  'CASE5 dynamic 两洞各自独立',
  c1.soloPlayerId === 'B' &&
    c2.soloPlayerId === 'C' &&
    c1.text !== c2.text &&
    c2.text === '单 王五 · 双 李四/张三',
  JSON.stringify({ c1: c1, c2: c2 })
);

function midGame(extra) {
  return Object.assign(
    {
      catalogId: 'landlord-mid',
      players: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
      playerOrder: ['A', 'B', 'C'],
      groupMode: 'random',
      rankId: 'gross-origin',
      multiplier: 1,
      holes: [
        { label: 'C1', on: true },
        { label: 'C2', on: true }
      ],
      ruleSnapshot: {
        catalogId: 'landlord-mid',
        reward: 'none',
        pushRule: 'push',
        baoMode: 'none'
      }
    },
    extra || {}
  );
}

var pushOut = settleMid.settle(midGame(), {
  holeOrder: ['C1', 'C2'],
  pars: { C1: 4, C2: 4 },
  scores: {
    C1: { A: 4, B: 4, C: 4 },
    C2: {}
  }
});
var pushHole1 = summary.summaryForHole(
  { catalogId: 'landlord-mid', holeResults: pushOut },
  'C1',
  map
);
var nextIds = (pushOut.orderByHole && pushOut.orderByHole.C2) || [];
assert('CASE6 PUSH 本洞仍有 assignment', !!(pushOut.assignmentsByHole && pushOut.assignmentsByHole.C1));
var nextHoleSummary = summary.buildThreePlayerAssignmentText(
  assignOf('landlord-mid', nextIds.length ? nextIds : ['B', 'C', 'A']),
  map
);
assert(
  'CASE6 PUSH 文案是本洞阵营（单 B），读取 C1 assignment 而非 nextOrder',
  pushHole1.soloPlayerId === 'B' &&
    pushHole1.text === '单 李四 · 双 张三/王五' &&
    (pushOut.orderByHole.C1 || []).join(',') === 'A,B,C',
  JSON.stringify({
    text: pushHole1.text,
    c1: pushOut.orderByHole.C1,
    c2: nextIds,
    nextGuess: nextHoleSummary.soloPlayerId
  })
);
assert(
  'CASE6 不会用 C2 order 覆盖 C1 文案',
  summary.summaryForHole({ catalogId: 'landlord-mid', holeResults: pushOut }, 'C1', map).soloPlayerId ===
    'B',
  JSON.stringify(pushOut.orderByHole)
);

assert(
  'CASE7 缺 assignments 不猜',
  summary.assignmentTextForHole({ catalogId: 'landlord-mid', holeResults: {} }, 'C1', map) === '' &&
    summary.assignmentTextForHole(
      { catalogId: 'landlord-mid', holeResults: { assignmentsByHole: {} } },
      'C1',
      map
    ) === '' &&
    summary.buildThreePlayerAssignmentText(null, map).text === '' &&
    summary.buildThreePlayerAssignmentText([], map).text === ''
);

assert(
  'CASE7 非三人玩法即使 1v2 也不走 listBoard 目录（helper 目录闸）',
  !summary.isThreePlayerAssignmentCatalog('lasuo-4') &&
    !summary.isThreePlayerAssignmentCatalog('vegas') &&
    summary.assignmentTextForHole(
      {
        catalogId: 'lasuo-4',
        holeResults: { assignmentsByHole: { C1: assignOf('landlord-mid', orderAbc) } }
      },
      'C1',
      map
    ) === ''
);

assert(
  'CASE8 昵称映射',
  summary.buildThreePlayerAssignmentText(assignOf('landlord-big', orderAbc), {
    A: { displayName: 'Alice' },
    B: { name: 'Bob' },
    C: { displayName: 'Carol' }
  }).text === '单 Alice · 双 Bob/Carol'
);
assert(
  'CASE8 空昵称走球员占位，不暴露 id',
  summary.buildThreePlayerAssignmentText(assignOf('landlord-big', orderAbc), {
    A: { displayName: '' },
    B: { displayName: '李四' },
    C: { displayName: '王五' }
  }).text === '单 球员 · 双 李四/王五' &&
    summary.buildThreePlayerAssignmentText(assignOf('landlord-big', orderAbc), {
      A: { displayName: 'A' },
      B: { displayName: '李四' },
      C: { displayName: '王五' }
    }).text === '单 球员 · 双 李四/王五'
);

function settleAssign(settleFn, catalogId) {
  var out = settleFn.settle(
    {
      catalogId: catalogId,
      players: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
      playerOrder: ['A', 'B', 'C'],
      groupMode: 'fixed',
      multiplier: 1,
      holes: [{ label: 'C1', on: true }],
      ruleSnapshot: { catalogId: catalogId, reward: 'none', pushRule: 'none', baoMode: 'none' }
    },
    { holeOrder: ['C1'], pars: { C1: 4 }, scores: { C1: { A: 5, B: 4, C: 6 } } }
  );
  return summary.buildThreePlayerAssignmentText(out.assignmentsByHole.C1, map);
}

assert('settle 斗大 stamp 与 helper 一致', settleAssign(settleBig, 'landlord-big').soloPlayerId === 'A');
assert('settle 斗二 stamp 与 helper 一致', settleAssign(settleMid, 'landlord-mid').soloPlayerId === 'B');
assert('settle 斗小 stamp 与 helper 一致', settleAssign(settleSmall, 'landlord-small').soloPlayerId === 'C');
assert('settle 8421-3 stamp 与 helper 一致', settleAssign(settle8421, '8421-3').soloPlayerId === 'B');

var helperSrc = fs.readFileSync(path.join(gameUtils, 'threePlayerAssignmentSummary.js'), 'utf8');
assert(
  '不硬编码蓝=单',
  helperSrc.indexOf('蓝=单') < 0 &&
    helperSrc.indexOf("side === 'blue' && ids.length === 1") < 0 &&
    /ids\.length === 1/.test(helperSrc) &&
    /ids\.length === 2/.test(helperSrc)
);
assert('不读 playerOrder / nextOrder 覆盖历史洞', helperSrc.indexOf('playerOrder') < 0 && helperSrc.indexOf('nextOrder') < 0);

var bindSrc = fs.readFileSync(path.join(gameUtils, 'sideGameBind.js'), 'utf8');
assert(
  'listBoard 写入 assignmentText',
  /threeAssign\.assignmentTextForHole/.test(bindSrc) && /assignmentText: assignmentText/.test(bindSrc)
);

var tabWxml = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'components', 'game-tab', 'index.wxml'),
  'utf8'
);
assert('game-tab 展示 assignmentText', /item\.assignmentText/.test(tabWxml) && /board-assign-line/.test(tabWxml));
assert('game-tab 仍读 cell.text / topHoleState', /cell\.text/.test(tabWxml) && /topHoleState/.test(tabWxml));

var settleFiles = [
  'settleLandlordShared.js',
  'settleLandlordBig.js',
  'settleLandlordMid.js',
  'settleLandlordSmall.js',
  'settle8421Three.js'
];
settleFiles.forEach(function (file) {
  var src = fs.readFileSync(path.join(gameUtils, file), 'utf8');
  assert(file + ' 不含 assignment summary', src.indexOf('threePlayerAssignmentSummary') < 0);
});

console.log('\ngameThreePlayerAssignmentSummary.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
