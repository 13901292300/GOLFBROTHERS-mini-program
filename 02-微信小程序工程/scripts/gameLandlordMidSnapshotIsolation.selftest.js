/**
 * 斗二地主：已有实例 ruleSnapshot 不被规则库静默覆盖。
 * 运行：node scripts/gameLandlordMidSnapshotIsolation.selftest.js
 */
var fs = require('fs');
var path = require('path');

if (typeof global.wx !== 'object') {
  global.wx = {
    getStorageSync: function () {
      return null;
    },
    setStorageSync: function () {}
  };
}

var rec = require('../miniprogram/subpackages/game/utils/sideGameRecord.js');
var own = require('../miniprogram/subpackages/game/utils/instanceRuleSnapshot.js');
var settleMid = require('../miniprogram/subpackages/game/utils/settleLandlordMid.js');

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

function deep(a) {
  return JSON.parse(JSON.stringify(a));
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function libTemplate(reward, extra) {
  return rec.jsonClone(
    Object.assign(
      {
        catalogId: 'landlord-mid',
        name: '库模板斗二',
        reward: reward,
        mulRows: [
          { id: 'hio', value: '10' },
          { id: 'm2', value: '5' },
          { id: 'm1', value: '2' },
          { id: 'par', value: '1' },
          { id: 'p1', value: '1' },
          { id: 'ge2', value: '1' }
        ],
        pushRule: 'push',
        meatInclude: 'no',
        meatValueType: 'fixed',
        meatEatMode: 'by-score',
        meatRows: [
          { id: 'le-2', value: '3' },
          { id: 'm1', value: '2' },
          { id: 'par', value: '1' },
          { id: 'ge-1', value: '0' }
        ],
        baoMode: 'none',
        baoPlusN: '4',
        baoDoubleN: '0',
        baoDiffN: '3',
        baoPre: 'ignore',
        revision: 3
      },
      extra || {}
    )
  );
}

function instanceSnap(reward, extra) {
  var base = {
    catalogId: 'landlord-mid',
    pushRule: 'push',
    meatInclude: 'no',
    meatValueType: 'fixed',
    meatEatMode: 'by-score',
    meatRows: [
      { id: 'le-2', value: '0' },
      { id: 'm1', value: '0' },
      { id: 'par', value: '0' },
      { id: 'ge-1', value: '0' }
    ],
    baoMode: 'none',
    baoPlusN: '4',
    baoDoubleN: '0',
    baoDiffN: '3',
    baoPre: 'ignore',
    mulRows: [
      { id: 'hio', value: '7' },
      { id: 'm2', value: '4' },
      { id: 'm1', value: '3' },
      { id: 'par', value: '1' },
      { id: 'p1', value: '1' },
      { id: 'ge2', value: '1' }
    ]
  };
  if (reward !== undefined) base.reward = reward;
  return Object.assign(base, extra || {});
}

function gameOf(snap, name) {
  return {
    catalogId: 'landlord-mid',
    name: name || '局内斗二',
    players: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
    playerOrder: ['A', 'B', 'C'],
    groupMode: 'random',
    rankId: 'gross-origin',
    multiplier: 1,
    holes: [
      { label: 'C1', on: true },
      { label: 'C2', on: true }
    ],
    ruleSnapshot: rec.jsonClone(snap)
  };
}

function ctxBirdie() {
  return {
    holeOrder: ['C1', 'C2'],
    pars: { C1: 4, C2: 4 },
    scores: {
      C1: { A: -1, B: 1, C: 1 },
      C2: { A: 0, B: 0, C: 2 }
    }
  };
}

function settlePack(out) {
  return {
    byHole: out.byHole,
    orderByHole: out.orderByHole,
    assignmentsByHole: out.assignmentsByHole,
    topHoleStates: out.topHoleStates
  };
}

function reopenExisting(instance, library) {
  return own.snapshotForConfigLoad({
    existingGame: instance,
    libraryRule: library
  });
}

function unrelatedShowSave(currentSnap, library, name) {
  var shown = own.nextEditorSnapshotOnShow({
    pageDirty: false,
    hasExistingInstance: true,
    libraryRule: library,
    currentSnapshot: currentSnap,
    libraryRevisionChanged: false
  });
  return {
    name: name,
    ruleSnapshot: shown
  };
}

var libMul = libTemplate('mul');
var instNone = gameOf(instanceSnap('none'), '旧局 none');
var opened1 = reopenExisting(instNone, libMul);
assert('CASE1 已有 none 不被库 mul 覆盖', opened1.reward === 'none');

var saved1 = unrelatedShowSave(opened1, libMul, '只改名字');
assert('CASE2 无关保存 reward 仍 none', saved1.ruleSnapshot.reward === 'none');
var before2 = settlePack(settleMid.settle(instNone, ctxBirdie()));
var after2 = settlePack(
  settleMid.settle(gameOf(saved1.ruleSnapshot, saved1.name), ctxBirdie())
);
assert('CASE2 无关保存 settle 不变', sameJson(before2, after2));

var instMul = gameOf(instanceSnap('mul'), '旧局 mul');
var libNone = libTemplate('none', { revision: 9 });
var opened3 = reopenExisting(instMul, libNone);
var saved3 = unrelatedShowSave(opened3, libNone, '改名2');
assert('CASE3 已有 mul 不被库 none 覆盖', saved3.ruleSnapshot.reward === 'mul');
var before3 = settlePack(settleMid.settle(instMul, ctxBirdie()));
var after3 = settlePack(
  settleMid.settle(gameOf(saved3.ruleSnapshot, saved3.name), ctxBirdie())
);
assert('CASE3 无关保存 settle 仍 mul 语义', sameJson(before3, after3));

var missing = instanceSnap(undefined);
delete missing.reward;
var instMissing = gameOf(missing, '缺 reward');
var opened4 = reopenExisting(instMissing, libMul);
assert('CASE4 缺 reward 打开不填 mul', opened4.reward !== 'mul');
var saved4 = unrelatedShowSave(opened4, libMul, '缺字段改名');
assert('CASE4 保存不静默变 mul', saved4.ruleSnapshot.reward !== 'mul');
var missSettle = settleMid.settle(gameOf(saved4.ruleSnapshot), ctxBirdie());
var noneSettle = settleMid.settle(gameOf(instanceSnap('none')), ctxBirdie());
assert(
  'CASE4 结算按无奖励',
  sameJson(settlePack(missSettle), settlePack(noneSettle))
);
var historic4 = rec.resolveHistoricRuleSnapshot(instMissing, {
  ruleId: 'landlord-mid',
  ruleSnapshot: libMul,
  config: { instance: instMissing }
});
assert('CASE4 historic hydrate 不以库 mul 补 reward', historic4.reward !== 'mul');

var customBao = instanceSnap('none', {
  baoMode: 'plus-n',
  baoPlusN: '5',
  meatRows: [
    { id: 'le-2', value: '1' },
    { id: 'm1', value: '1' },
    { id: 'par', value: '0' },
    { id: 'ge-1', value: '0' }
  ],
  mulRows: [
    { id: 'hio', value: '8' },
    { id: 'm2', value: '3' },
    { id: 'm1', value: '2' },
    { id: 'par', value: '1' },
    { id: 'p1', value: '1' },
    { id: 'ge2', value: '1' }
  ]
});
var instCustom = gameOf(customBao, '自定义表');
var libOther = libTemplate('mul', {
  baoMode: 'partner-diff',
  baoDiffN: '9',
  meatRows: [
    { id: 'le-2', value: '3' },
    { id: 'm1', value: '2' },
    { id: 'par', value: '1' },
    { id: 'ge-1', value: '0' }
  ]
});
var saved5 = unrelatedShowSave(reopenExisting(instCustom, libOther), libOther, '自定义改名');
assert(
  'CASE5 mulRows/meatRows/bao 保持',
  saved5.ruleSnapshot.baoMode === 'plus-n' &&
    saved5.ruleSnapshot.baoPlusN === '5' &&
    saved5.ruleSnapshot.meatRows[0].value === '1' &&
    saved5.ruleSnapshot.mulRows[0].value === '8'
);

var created = own.snapshotForConfigLoad({
  existingGame: null,
  libraryRule: libMul
});
assert('CASE6 新建仍用规则库模板', created.reward === 'mul' && created.baoMode === 'none');

var userEdit = own.nextEditorSnapshotOnShow({
  pageDirty: false,
  hasExistingInstance: true,
  libraryRule: libMul,
  currentSnapshot: instanceSnap('none'),
  libraryRevisionChanged: true
});
assert('CASE7 明确保存规则编辑后采用用户新 reward', userEdit.reward === 'mul');
assert(
  'CASE7 未保存规则编辑不覆盖',
  own.shouldApplyLibrarySnapshotOnShow({
    pageDirty: false,
    hasExistingInstance: true,
    libraryRule: libMul,
    libraryRevisionChanged: false
  }) === false
);

var stable = gameOf(instanceSnap('none'), '稳定局');
var sA = settleMid.settle(stable, ctxBirdie());
var persisted = unrelatedShowSave(reopenExisting(stable, libMul), libMul, '稳定改名');
var sB = settleMid.settle(gameOf(persisted.ruleSnapshot, persisted.name), ctxBirdie());
var sC = settleMid.settle(gameOf(persisted.ruleSnapshot, persisted.name), ctxBirdie());
assert('CASE8 无关保存前后 byHole 深等', sameJson(sA.byHole, sB.byHole));
assert('CASE8 orderByHole 深等', sameJson(sA.orderByHole, sB.orderByHole));
assert('CASE8 assignmentsByHole 深等', sameJson(sA.assignmentsByHole, sB.assignmentsByHole));
assert('CASE8 meat/topHole 深等', sameJson(sA.topHoleStates, sB.topHoleStates));
assert('CASE8 连续 settle 深等', sameJson(settlePack(sB), settlePack(sC)));

var cfgJs = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram/subpackages/game/pages/config/index.js'),
  'utf8'
);
assert(
  'config onShow 走 instanceRuleSnapshot',
  cfgJs.indexOf('instanceRuleSnapshot.shouldApplyLibrarySnapshotOnShow') >= 0 &&
    cfgJs.indexOf('snapshotForConfigLoad') >= 0
);
assert(
  '未改 settleLandlordMid',
  fs
    .readFileSync(
      path.join(__dirname, '..', 'miniprogram/subpackages/game/utils/settleLandlordMid.js'),
      'utf8'
    )
    .indexOf('pushPolicy: "rerank"') >= 0
);

console.log('\ngameLandlordMidSnapshotIsolation.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
