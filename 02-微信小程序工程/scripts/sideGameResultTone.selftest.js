/**
 * 游戏结果表格正负色：统一 resultToneClass(raw)。
 * 运行：node scripts/sideGameResultTone.selftest.js
 */
var fs = require('fs');
var path = require('path');

if (typeof global.wx !== 'object') {
  global.wx = {
    getStorageSync: function () {
      return null;
    },
    setStorageSync: function () {},
    showToast: function () {}
  };
}

var rec = require('../miniprogram/subpackages/game/utils/sideGameRecord.js');
var identity = require('../miniprogram/subpackages/game/utils/sideGameIdentityProvider.js');
var localMod = require('../miniprogram/subpackages/game/utils/localSideGameRepository.js');
var facade = require('../miniprogram/subpackages/game/utils/sideGameRepository.js');
var hostMod = require('../miniprogram/subpackages/game/utils/gameHostContext.js');
var hostSession = require('../miniprogram/subpackages/game/utils/sideGameHostSession.js');
var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');
var bind = require('../miniprogram/subpackages/game/utils/sideGameBind.js');
var resultTone = require('../miniprogram/subpackages/game/utils/resultTone.js');

var mini = path.join(__dirname, '..', 'miniprogram');
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

function memStorage() {
  var bag = {};
  return {
    getItem: function (key) {
      return bag[key];
    },
    setItem: function (key, value) {
      bag[key] = JSON.parse(JSON.stringify(value));
      return true;
    }
  };
}

function filled18(n) {
  var a = [];
  var i;
  for (i = 0; i < 18; i++) a.push(n);
  return a;
}

function hostHoleOrder() {
  var out = [];
  var i;
  for (i = 1; i <= 9; i++) out.push('C' + i);
  for (i = 1; i <= 9; i++) out.push('D' + i);
  return out;
}

function gameHoles() {
  return catalog.HOLES.map(function (label) {
    return { label: label, on: true };
  });
}

function makeHost(parties, scoreMap) {
  var holeOrder = hostHoleOrder();
  var pars = {};
  holeOrder.forEach(function (h) {
    pars[h] = 4;
  });
  var official = {};
  Object.keys(scoreMap).forEach(function (id) {
    var arr = scoreMap[id];
    var holes = {};
    holeOrder.forEach(function (label, i) {
      holes[label] = { score: arr[i] };
    });
    official[id] = { holes: holes };
  });
  return hostMod.emptyContext({
    matchId: 'm-tone',
    groupId: 'g1',
    scope: 'group',
    revision: 'r-tone',
    holeContextReady: true,
    holeOrder: holeOrder,
    pars: pars,
    allowBigPot: true,
    scoreParties: parties,
    officialScoresByPartyId: official,
    players: parties
      .filter(function (p) {
        return p.partyType === 'player';
      })
      .map(function (p) {
        return { playerId: p.partyId, displayName: p.displayName, groupId: 'g1' };
      })
  });
}

function installRepo() {
  identity.setImplementation({
    implementation: 'test',
    getCurrentUserId: function () {
      return 'tester';
    }
  });
  var repo = localMod.createLocalSideGameRepository({
    storage: memStorage(),
    idGen: (function () {
      var n = 0;
      return function () {
        n += 1;
        return 'tone_' + n;
      };
    })(),
    clock: function () {
      return 3000;
    }
  });
  facade.setImplementation(repo);
  return repo;
}

function attach(host) {
  hostSession.clearHostContext();
  hostSession.setHostContext(host);
  bind.attachHost(host);
}

function stroke2Instance(players, pairings) {
  return {
    catalogId: 'stroke-2',
    name: '比杆',
    players: players,
    pairings: pairings,
    holes: gameHoles(),
    holeOrder: catalog.HOLES.slice(),
    multiplier: 1,
    ruleSnapshot: rec.buildRuleSnapshot('stroke-2')
  };
}

function findCellByRaw(board, raw) {
  var i;
  var j;
  var holes = (board && board.holes) || [];
  for (i = 0; i < holes.length; i++) {
    var cells = holes[i].cells || [];
    for (j = 0; j < cells.length; j++) {
      if (cells[j] && cells[j].raw === raw && cells[j].text !== '-' && cells[j].text !== '—') {
        return cells[j];
      }
    }
  }
  return null;
}

function read(rel) {
  return fs.readFileSync(path.join(mini, rel), 'utf8');
}

var tone = resultTone.resultToneClass;
assert('模块与 bind 导出同一函数', bind.resultToneClass === resultTone.resultToneClass);

assert('1. 逐洞 +1 红色', tone(1) === 'result-positive');
assert('2. 逐洞 -1 绿色', tone(-1) === 'result-negative');
assert('3. 逐洞 0 保持原色', tone(0) === '');
assert('4. +0/-0 按数值 0', tone(+0) === '' && tone(-0) === '' && tone('+0') === '' && tone('-0') === '');
assert(
  '5. 空值和 - 保持原色',
  tone(null) === '' &&
    tone(undefined) === '' &&
    tone('') === '' &&
    tone('-') === '' &&
    tone(NaN) === '' &&
    tone('—') === ''
);

assert('不按展示字符串首字符判断', tone('+K') === '' && tone('-洞') === '' && tone('锅') === '');
assert('带单位文字不误判', tone('+1元') === '' && tone('1e') === '');

var bindJs = read('subpackages/game/utils/sideGameBind.js');
assert('listBoard 使用 cellCls/resultToneClass', /cellCls\(/.test(bindJs) && /resultFormat\.formatBoardCell/.test(bindJs) && /resultFormat\.formatBoardTotal/.test(bindJs));
assert('listScorePad 仍用 over/under/par', /raw > 0 \? "over"/.test(bindJs) && /"under"/.test(bindJs) && /"par"/.test(bindJs));
assert('cellCls 不自行比较正负', /function cellCls\(n\) \{\s*return resultTone\.resultToneClass\(n\);/.test(bindJs));

var uiWxss = read('subpackages/game/styles/game-ui.wxss');
assert(
  '正数红使用 --error/#DC2626',
  /\.board-cell\.result-positive[^}]*var\(--error,\s*#DC2626\)/.test(uiWxss) &&
    /\.cell\.result-positive[^}]*var\(--error,\s*#DC2626\)/.test(uiWxss)
);
assert(
  '负数绿使用 --success/#16A34A',
  /\.board-cell\.result-negative[^}]*var\(--success,\s*#16A34A\)/.test(uiWxss) &&
    /\.cell\.result-negative[^}]*var\(--success,\s*#16A34A\)/.test(uiWxss)
);
assert('旧 win/lose 结果色已替换', !/\.board-cell\.win/.test(uiWxss) && !/\.cell\.win/.test(uiWxss));

var tabWxml = read('subpackages/game/components/game-tab/index.wxml');
assert('WXML 不计算颜色只读 cls', /{{cell\.cls}}/.test(tabWxml) && /{{item\.cls}}/.test(tabWxml) && !/resultToneClass/.test(tabWxml));
assert(
  '7. 固定底部汇总与普通汇总同一 totals.cls',
  /js-native-foot[\s\S]*board\.totals[\s\S]*item\.cls/.test(tabWxml) &&
    /board-dock[\s\S]*board\.totals[\s\S]*item\.cls/.test(tabWxml)
);
assert(
  '12. 横滑单元格仍带 cls',
  /onBoardHScroll[\s\S]*item\.cls/.test(tabWxml) || /board-h-track--foot[\s\S]*item\.cls/.test(tabWxml)
);

var tabJs = read('subpackages/game/components/game-tab/index.js');
assert('game-tab 不本地判断正负色', !/result-positive/.test(tabJs) && !/resultToneClass/.test(tabJs));
assert('withNumFit 保留 cls', /function withNumFit/.test(tabJs) && /Object\.assign\(\{\}, cell, \{ fitStyle:/.test(tabJs));

var scoreJs = read('subpackages/scoring/pages/score/index.js');
var hubJs = read('subpackages/scoring/pages/hub/index.js');
var detailJs = read('subpackages/tournament/pages/detail/index.js');
assert(
  '8. 记分页/Hub/赛事详情不各自判断结果色',
  !/result-positive|result-negative/.test(scoreJs) &&
    !/result-positive|result-negative/.test(hubJs) &&
    !/result-positive|result-negative/.test(detailJs)
);
assert(
  '8. 三处均挂载 game-tab',
  /"game-tab"/.test(read('subpackages/scoring/pages/score/index.json')) &&
    /"game-tab"/.test(read('subpackages/scoring/pages/hub/index.json')) &&
    /"game-tab"/.test(read('subpackages/tournament/pages/detail/index.json'))
);

assert('11. resultTone 不含三角逻辑', !/triColor/.test(read('subpackages/game/utils/resultTone.js')));
assert('11. 记分盘仍写 triColor', /triColor: rankTriColorForCell/.test(bindJs));
assert(
  '11. 三角文件不含结果 class',
  !/result-positive|result-negative/.test(read('subpackages/game/utils/rankMarkProjection.js')) &&
    !/result-positive|result-negative/.test(read('subpackages/scoring/utils/scoreRankMark.js'))
);
var scoreWxss = read('subpackages/scoring/pages/score/index.wxss');
assert('12. 正式记分格 wxss 未引入结果色', !/result-positive/.test(scoreWxss) && !/result-negative/.test(scoreWxss));

installRepo();
var parties2 = [
  { partyId: 'pA', partyType: 'player', displayName: '甲', memberPlayerIds: ['pA'], groupId: 'g1' },
  { partyId: 'pB', partyType: 'player', displayName: '乙', memberPlayerIds: ['pB'], groupId: 'g1' }
];
var host2 = makeHost(parties2, { pA: filled18(5), pB: filled18(4) });
attach(host2);
var created2 = bind.addGame(
  'score',
  stroke2Instance(
    [
      { id: 'pA', name: '甲' },
      { id: 'pB', name: '乙' }
    ],
    [{ id: 'pair-ab', leftId: 'pA', rightId: 'pB', on: true, strokes: 0 }]
  )
);
var board2 = bind.listBoard('score', created2.id);
var plusCell = findCellByRaw(board2, 1);
var minusCell = findCellByRaw(board2, -1);
assert('逐洞存在 +1 格', !!(plusCell && plusCell.cls === 'result-positive'), plusCell && plusCell.cls);
assert('逐洞存在 -1 格', !!(minusCell && minusCell.cls === 'result-negative'), minusCell && minusCell.cls);

var toneMismatch = [];
var dashKept = true;
(board2.holes || []).forEach(function (hole) {
  (hole.cells || []).forEach(function (cell) {
    if (!cell) return;
    if (cell.text === '-' || cell.text === '—' || cell.text === '') {
      if (cell.cls !== '') dashKept = false;
      return;
    }
    if (cell.cls !== tone(cell.raw)) {
      toneMismatch.push(String(cell.raw) + '/' + cell.text + '/' + cell.cls);
    }
  });
});
assert('已结算格 cls 与 raw 一致', toneMismatch.length === 0, toneMismatch.slice(0, 4).join(','));
assert('未结算格 cls 为空', dashKept);

assert(
  '6. 汇总正数红、负数绿',
  board2.totals.length === 2 &&
    board2.totals.every(function (item) {
      return item.cls === tone(item.raw);
    }) &&
    board2.totals.some(function (item) {
      return item.raw > 0 && item.cls === 'result-positive';
    }) &&
    board2.totals.some(function (item) {
      return item.raw < 0 && item.cls === 'result-negative';
    })
);

var nativeFoot = tabWxml.indexOf('js-native-foot');
var dockIdx = tabWxml.indexOf('board-dock');
assert('7. dock 与 native 都绑定 totals', nativeFoot >= 0 && dockIdx >= 0);

installRepo();
var parties3 = [
  { partyId: 'pA', partyType: 'player', displayName: '甲', memberPlayerIds: ['pA'], groupId: 'g1' },
  { partyId: 'pB', partyType: 'player', displayName: '乙', memberPlayerIds: ['pB'], groupId: 'g1' },
  { partyId: 'pC', partyType: 'player', displayName: '丙', memberPlayerIds: ['pC'], groupId: 'g1' }
];
var host3 = makeHost(parties3, { pA: filled18(4), pB: filled18(5), pC: filled18(6) });
attach(host3);
var multiDraft = stroke2Instance(
  [
    { id: 'pA', name: '甲' },
    { id: 'pB', name: '乙' },
    { id: 'pC', name: '丙' }
  ],
  [
    { id: 'pair-ab', leftId: 'pA', rightId: 'pB', on: true, strokes: 0 },
    { id: 'pair-ac', leftId: 'pA', rightId: 'pC', on: true, strokes: 0 },
    { id: 'pair-bc', leftId: 'pB', rightId: 'pC', on: true, strokes: 0 }
  ]
);
assert('9. 三方草稿 defaultPairId 指向第一对', bind.defaultPairId(multiDraft) === 'pair-ab');
var multi = bind.addGame('score', multiDraft);
assert('9. 三方比杆落库受 party_count 约束', !!(multi && multi.__fail && multi.reason === 'party_count'));

installRepo();
var comboParties = [
  {
    partyId: 'combo-1',
    partyType: 'combination',
    displayName: '组合1',
    memberPlayerIds: ['m1', 'm2'],
    groupId: 'g1'
  },
  {
    partyId: 'combo-2',
    partyType: 'combination',
    displayName: '组合2',
    memberPlayerIds: ['m3', 'm4'],
    groupId: 'g1'
  }
];
var hostCombo = makeHost(comboParties, { 'combo-1': filled18(5), 'combo-2': filled18(3) });
attach(hostCombo);
var comboGame = bind.addGame(
  'score',
  stroke2Instance(
    [
      { id: 'combo-1', name: '组合1', partyType: 'combination' },
      { id: 'combo-2', name: '组合2', partyType: 'combination' }
    ],
    [{ id: 'pair-c', leftId: 'combo-1', rightId: 'combo-2', on: true, strokes: 0 }]
  )
);
var boardCombo = bind.listBoard('score', comboGame.id);
assert(
  '10. combination 结果同样适用',
  (boardCombo.holes[0].cells || []).every(function (c) {
    return c.cls === tone(c.raw) || c.text === '-' || c.text === '—' || c.text === '';
  }) &&
    boardCombo.totals.every(function (t) {
      return t.cls === tone(t.raw);
    })
);

installRepo();
var sideParties = [
  { partyId: 'side-A', partyType: 'side', displayName: '红', memberPlayerIds: ['m1'], groupId: 'g1' },
  { partyId: 'side-B', partyType: 'side', displayName: '蓝', memberPlayerIds: ['m2'], groupId: 'g1' }
];
var hostSide = makeHost(sideParties, { 'side-A': filled18(5), 'side-B': filled18(3) });
attach(hostSide);
var sideGame = bind.addGame(
  'score',
  stroke2Instance(
    [
      { id: 'side-A', name: '红', partyType: 'side' },
      { id: 'side-B', name: '蓝', partyType: 'side' }
    ],
    [{ id: 'pair-s', leftId: 'side-A', rightId: 'side-B', on: true, strokes: 0 }]
  )
);
var boardSide = bind.listBoard('score', sideGame.id);
assert(
  '10. side 结果同样适用',
  boardSide.totals.every(function (t) {
    return t.cls === tone(t.raw);
  })
);

var firstBoard = bind.listBoard('score', sideGame.id);
var snap = facade.getById(sideGame.id);
assert('resultSnapshot 存 raw 不存 class', !!(snap.ok && snap.data.resultSnapshot && snap.data.resultSnapshot.byHole) && JSON.stringify(snap.data.resultSnapshot).indexOf('result-positive') < 0);
var reopened = bind.listBoard('score', sideGame.id);
assert(
  '13. snapshot 重开由 raw 恢复颜色',
  firstBoard.holes[0].cells.map(function (c) { return c.cls; }).join('|') ===
    reopened.holes[0].cells.map(function (c) { return c.cls; }).join('|') &&
    firstBoard.totals.map(function (t) { return t.cls; }).join('|') ===
      reopened.totals.map(function (t) { return t.cls; }).join('|')
);

var pad = bind.listScorePad('score');
assert(
  '12. 正式杆数 pad 仍 over/under/par',
  (pad.holes[0].cells || []).every(function (c) {
    return c.cls === '' || c.cls === 'over' || c.cls === 'under' || c.cls === 'par';
  })
);

var officialUi = read('subpackages/game/styles/game-ui.wxss');
assert(
  '主体看板使用结果 class',
  /\.board-cell\.result-positive/.test(officialUi) && /\.board-cell\.result-negative/.test(officialUi)
);
assert('listBoard 走 resultToneClass', /resultTone\.resultToneClass/.test(bindJs));

var detailWxml = read('subpackages/game/pages/detail/index.wxml');
assert('pages/detail 无独立结果表色', !/result-positive/.test(detailWxml));

console.log('\nsideGameResultTone.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
