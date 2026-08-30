/**
 * sideGameEngine 纯结算入口专项。
 * 运行：node scripts/sideGameEngine.selftest.js
 */
var fs = require('fs');
var path = require('path');
var engine = require('../miniprogram/subpackages/game/utils/sideGameEngine.js');
var fixtures = require('./lib/sideGameFixtures.js');

var passed = 0;
var failed = 0;
var utilsDir = path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'utils');

function assert(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    console.log('FAIL  ' + name + (detail ? ' :: ' + detail : ''));
  }
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function playerIds(n) {
  return fixtures.order(n);
}

function ledgerZeroSum(ledger, ids) {
  return engine.zeroSumOk(ledger || {}, ids);
}

function holesZeroSum(result, ids) {
  var byHole = (result && result.result && result.result.byHole) || {};
  var labels = Object.keys(byHole);
  if (!labels.length) return false;
  return labels.every(function (label) {
    return ledgerZeroSum(byHole[label], ids);
  });
}

assert('缺输入', engine.settle(null).ok === false && engine.settle(null).reason === 'invalid_input');
assert(
  '缺 ruleId',
  engine.settle({ holeOrder: ['A1'], sideGame: {} }).reason === 'missing_rule_id'
);
assert(
  '未知 ruleId',
  engine.settle({ ruleId: 'nope', holeOrder: ['A1'] }).reason === 'unknown_rule'
);
assert(
  '缺 holeOrder',
  engine.settle({ ruleId: 'stroke-2', sideGame: {} }).reason === 'missing_hole_order'
);

fixtures.ALL_RULE_IDS.forEach(function (ruleId) {
  var rule = engine.findRule(ruleId);
  var n = rule.players;
  var sideGame = {
    players: fixtures.ids(n),
    playerOrder: fixtures.order(n),
    pairings: n >= 2 ? [{ leftId: 'p1', rightId: 'p2', on: true }] : [],
    groupMode: 'fixed',
    multiplier: 1
  };
  var scores = {};
  fixtures.HOLES2.forEach(function (h) {
    scores[h] = {};
    fixtures.order(n).forEach(function (id, i) {
      scores[h][id] = i - 1;
    });
  });
  var out = engine.settle({
    matchId: 'm-dispatch',
    sideGameId: 'sg-' + ruleId,
    ruleId: ruleId,
    holeOrder: fixtures.HOLES2,
    sideGame: sideGame,
    scores: scores
  });
  assert('分发 ok ' + ruleId, out.ok === true && out.ruleId === ruleId && out.matchId === 'm-dispatch');
  assert('分发可 JSON ' + ruleId, JSON.stringify(out).length > 2);
  if (fixtures.UNSUPPORTED_SETTLE_IDS.indexOf(ruleId) >= 0) {
    assert(
      '未实现玩法 emptyResults ' + ruleId,
      out.result && out.result.catalogId === ruleId && out.result.byHole && out.result.byHole.A1
    );
  } else {
    assert('已实现玩法有 byHole ' + ruleId, !!(out.result && out.result.byHole));
  }
});

Object.keys(fixtures.EXPECTED).forEach(function (name) {
  var input = fixtures.inputOf(name);
  var before = clone(input);
  var out = engine.settle(input);
  var again = engine.settle(clone(before));
  assert(name + ' ok', out.ok === true && out.ruleId === input.ruleId);
  assert(
    name + ' 冻结输出',
    JSON.stringify(out.result) === JSON.stringify(fixtures.EXPECTED[name])
  );
  assert(name + ' 重复调用一致', JSON.stringify(out) === JSON.stringify(again));
  assert(
    name + ' 不修改输入',
    JSON.stringify(input) === JSON.stringify(before)
  );
  var n = (input.sideGame.players || []).length;
  var ids = playerIds(n);
  if (name === 'horn') {
    assert('horn totals 零和（空账本）', ledgerZeroSum(out.result.totals, ids));
  } else {
    assert(name + ' 逐洞零和', holesZeroSum(out, ids));
    if (out.result.totals) {
      assert(name + ' totals 零和', ledgerZeroSum(out.result.totals, ids));
    }
    if (out.result.initial) {
      assert(name + ' initial 零和', ledgerZeroSum(out.result.initial, ids));
    }
  }
});

var front = engine.settle(fixtures.inputOf('front9-stroke'));
var back = engine.settle(fixtures.inputOf('back9-stroke'));
assert('前九 9 洞', Object.keys(front.result.byHole).join(',') === fixtures.FRONT9.join(','));
assert('后九 9 洞', Object.keys(back.result.byHole).join(',') === fixtures.BACK9.join(','));
assert(
  '前九 A1 比杆',
  front.result.byHole.A1.p1 === 1 && front.result.byHole.A1.p2 === -1
);
assert(
  '后九 B1 比杆',
  back.result.byHole.B1.p1 === 1 && back.result.byHole.B1.p2 === -1
);

var potSrc = { p1: 1, p2: -1, __pot__: 0 };
var potIn = clone(potSrc);
var pot = engine.applyHolePot('all', 0, Infinity, potSrc, ['p1', 'p2']);
assert('大锅饭/全捐不改传入 ledger', JSON.stringify(potSrc) === JSON.stringify(potIn));
assert('全捐赢家入锅', pot.display.p1 === 0 && pot.donated.p1 === 1 && pot.display.p2 === -1);
var money = engine.bigPotMoney([10, -4, 0], [true, true, false], 7);
assert('bigPotMoney 可序列化', JSON.stringify(money).indexOf('null') >= 0 || money.length === 3);

var files = fs.readdirSync(utilsDir).filter(function (name) {
  return /\.js$/.test(name);
});
var settleFiles = files.filter(function (name) {
  return /^(settle|catalog|holeOrder|sideGameEngine)/.test(name);
});
var absHit = [];
var wxHit = [];
var storeHit = [];
var fakeHit = [];
var reqHit = [];
settleFiles.forEach(function (name) {
  var rel = path.join(utilsDir, name);
  var text = fs.readFileSync(rel, 'utf8');
  if (/C:\\\\Users|04-游戏沙盒/.test(text)) absHit.push(name);
  if (/\bwx\.(get|set)StorageSync\b/.test(text) || /gb-game-/.test(text)) storeHit.push(name);
  if (/\bwx\.[A-Za-z]/.test(text)) wxHit.push(name);
  if (/阿凯|李雷|韩梅梅/.test(text)) fakeHit.push(name);
  var re = /require\((['"])([^'"]+)\1\)/g;
  var m;
  while ((m = re.exec(text))) {
    var spec = m[2];
    if (spec.charAt(0) !== '.' || spec.indexOf('../') === 0) reqHit.push(name + ':' + spec);
  }
});
assert('结算模块 require 均在 game/utils 内', reqHit.length === 0, reqHit.join(','));
assert('无绝对本机路径', absHit.length === 0, absHit.join(','));
assert('无 wx Storage / gb-game- key', storeHit.length === 0, storeHit.join(','));
assert('结算模块无 wx.* API', wxHit.length === 0, wxHit.join(','));
assert('无假球员姓名', fakeHit.length === 0, fakeHit.join(','));
assert('结算模块文件数', settleFiles.length === 20);

console.log('\nsideGameEngine.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
