/**
 * 三人地主：existing player hcapList 配置页 hydrate / dirty / 二次保存。
 * 运行：node scripts/gameLandlordPlayerHcapHydrate.selftest.js
 */
var fs = require('fs');
var path = require('path');
var snap = require('../miniprogram/subpackages/game/utils/sideGameConfigSnapshot.js');
var shared = require('../miniprogram/subpackages/game/utils/settleLandlordShared.js');
var settleMid = require('../miniprogram/subpackages/game/utils/settleLandlordMid.js');
var core = require('../miniprogram/subpackages/game/utils/settleCore.js');

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

var configJs = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/game/pages/config/index.js'),
  'utf8'
);

var SAMPLE_LIST = [
  {
    par3: '0',
    par4: '1',
    par5: '-0.5',
    hcapHoles: [
      { label: 'H1', on: true },
      { label: 'H2', on: true }
    ],
    holeCount: 2,
    hcapText: 'PAR3 0 · PAR4 1 · PAR5 -0.5 · 2/2洞'
  }
];

function deductRowLike(item) {
  return Object.assign({}, item, {
    selected: true,
    hcapPar3: '0',
    hcapPar4: '0',
    hcapPar5: '0'
  });
}

function hydrateScoreEntry(rosterFace, existingHit) {
  var item = deductRowLike(rosterFace);
  return Object.assign({}, item, snap.existingPlayerHcapPatch(existingHit, item));
}

function hydrateUsePagePick(existingPlayer) {
  var item = deductRowLike(existingPlayer);
  var hit = existingPlayer || item;
  return Object.assign({}, item, snap.existingPlayerHcapPatch(hit, item));
}

function playerHcapSrc(item) {
  if (item && item.hcapList && item.hcapList.length) return item;
  var par3 = item && item.hcapPar3;
  var par4 = item && item.hcapPar4;
  var par5 = item && item.hcapPar5;
  if (Number(par3) || Number(par4) || Number(par5)) {
    return { hcapList: [{ par3: par3, par4: par4, par5: par5 }] };
  }
  return item;
}

function lasuoHcapText(players) {
  var n = 0;
  (players || []).forEach(function (item) {
    if (!item || item.selected === false) return;
    n += (item.hcapList || []).length;
  });
  return n ? n + '项让杆' : '无让杆';
}

function confirmSavePlayers(pagePlayers) {
  return JSON.parse(
    JSON.stringify(
      (pagePlayers || []).map(function (item) {
        var src = playerHcapSrc(item);
        return Object.assign({}, item, {
          hcapList: src.hcapList || item.hcapList
        });
      })
    )
  );
}

function existingB(extra) {
  return Object.assign(
    {
      id: 'B',
      hcapPar3: '0',
      hcapPar4: '0',
      hcapPar5: '0',
      hcapList: JSON.parse(JSON.stringify(SAMPLE_LIST))
    },
    extra || {}
  );
}

function settleMidDebug(game, ctx) {
  return shared.settleThree(game, ctx, {
    catalogId: 'landlord-mid',
    soloIndex: 1,
    pushPolicy: 'rerank',
    collectDebug: true,
    teamNet: function (rec, solo, mates) {
      return core.round1((rec[mates[0]].net + rec[mates[1]].net) / 2);
    },
    winRel: function (rec, soloWins, solo, mates) {
      if (soloWins) return rec[solo].rel;
      return rec[shared.pickTeamBest(mates, rec)].rel;
    },
    applyBao: shared.applyBao
  });
}

function gameOf(catalogId, players) {
  return {
    catalogId: catalogId,
    name: catalogId,
    players: players,
    playerOrder: ['A', 'B', 'C'],
    groupMode: 'fixed',
    multiplier: 1,
    ruleSnapshot: {
      reward: 'none',
      pushRule: 'push',
      meatInclude: 'no',
      baoMode: 'none'
    }
  };
}

var patchCalls = configJs.split('snapUtil.existingPlayerHcapPatch(hit, item)').length - 1;
assert('config 两处 existing hydrate 恢复 hcapList', patchCalls === 2);
assert(
  'playerHcapSrc 仍 hcapList 优先',
  /function playerHcapSrc\(item, gameHoles\) \{[\s\S]*?if \(item && item\.hcapList && item\.hcapList\.length\) return item;/.test(
    configJs
  )
);
assert('未改 deductRow 扁平底稿', /hcapPar3: "0"/.test(configJs) && /function \(item, selected\) \{/.test(configJs));
assert(
  'confirm 未把 list[0] 同步到扁平',
  !/hcapPar4:\s*hcapList/.test(configJs) && !/list\[0\].*hcapPar4/.test(configJs)
);

var catalogs = ['landlord-mid', 'landlord-big', 'landlord-small'];

catalogs.forEach(function (cid, idx) {
  var tag = cid.replace('landlord-', '');
  var roster = { id: 'B', name: '玫瑰' };
  var hit = existingB();
  var page = hydrateScoreEntry(roster, hit);
  var list = page.hcapList || [];
  assert(
    'CASE 1/' + (idx === 0 ? '10 ' : '') + tag + ' score 重开保留 hcapList',
    list.length === 1 && String(list[0].par3) === '0' && String(list[0].par4) === '1' && String(list[0].par5) === '-0.5'
  );
  assert(
    'CASE 1 ' + tag + ' UI 不是无让杆',
    lasuoHcapText([page]) !== '无让杆' && lasuoHcapText([page]).indexOf('让杆') >= 0
  );

  var saved = confirmSavePlayers([page]);
  assert(
    'CASE 2 ' + tag + ' 二次保存仍有 hcapList PAR4=1',
    saved[0] && saved[0].hcapList && String(saved[0].hcapList[0].par4) === '1'
  );

  var pickPage = hydrateUsePagePick(hit);
  assert(
    'CASE 7 ' + tag + ' usePagePick 保留 hcapList',
    pickPage.hcapList && String(pickPage.hcapList[0].par4) === '1'
  );
});

var midPage = hydrateScoreEntry({ id: 'B' }, existingB());
var players = [
  { id: 'A', hcapPar3: '0', hcapPar4: '0', hcapPar5: '0' },
  midPage,
  { id: 'C', hcapPar3: '0', hcapPar4: '0', hcapPar5: '0' }
];
var ctx4 = { holeOrder: ['H1'], scores: { H1: { A: 0, B: 1, C: 0 } }, pars: { H1: 4 } };
var r4 = settleMidDebug(gameOf('landlord-mid', players), ctx4);
assert('CASE 3 PAR4 playerHcapN=1', r4.holeDebug.H1.handicaps.B === 1);
assert('CASE 3 PAR4 net = rel - 1', r4.holeDebug.H1.adjustedScores.B === 0);

var ctx5 = { holeOrder: ['H2'], scores: { H2: { A: 0, B: 0, C: 0 } }, pars: { H2: 5 } };
var r5 = settleMidDebug(gameOf('landlord-mid', players), ctx5);
assert('CASE 4 PAR5 N=-0.5', r5.holeDebug.H2 && r5.holeDebug.H2.handicaps.B === -0.5);

var publicSettle = settleMid.settle(gameOf('landlord-mid', players), ctx4);
assert('CASE 3 公开 settle 仍可运行', !!(publicSettle && publicSettle.byHole && publicSettle.byHole.H1));

var legacyHit = { id: 'B', hcapPar3: '0', hcapPar4: '1', hcapPar5: '0' };
var legacyPage = hydrateScoreEntry({ id: 'B' }, legacyHit);
var legacySrc = playerHcapSrc(legacyPage);
assert(
  'CASE 5 legacy flat 可合成 hcapList',
  !(legacyPage.hcapList && legacyPage.hcapList.length) &&
    legacySrc.hcapList &&
    String(legacySrc.hcapList[0].par4) === '1'
);

var dual = hydrateScoreEntry(
  { id: 'B' },
  existingB({ hcapPar3: '0', hcapPar4: '0', hcapPar5: '0' })
);
var dualSrc = playerHcapSrc(dual);
assert(
  'CASE 6 hcapList 优先不被 flat 0 覆盖',
  dual.hcapList &&
    String(dual.hcapList[0].par4) === '1' &&
    String(dual.hcapPar4) === '0' &&
    String(dualSrc.hcapList[0].par4) === '1'
);

var dirtyA = snap.buildInstanceConfigSnapshot({
  catalogId: 'landlord-mid',
  players: [{ id: 'B', hcapList: JSON.parse(JSON.stringify(SAMPLE_LIST)) }]
});
var dirtyB = snap.buildInstanceConfigSnapshot({
  catalogId: 'landlord-mid',
  players: [
    {
      id: 'B',
      hcapList: [
        {
          par3: '0',
          par4: '1.5',
          par5: '-0.5',
          hcapHoles: SAMPLE_LIST[0].hcapHoles.slice()
        }
      ]
    }
  ]
});
var dirtySame = snap.buildInstanceConfigSnapshot({
  catalogId: 'landlord-mid',
  players: [{ id: 'B', hcapList: JSON.parse(JSON.stringify(SAMPLE_LIST)) }]
});
assert('CASE 8 只改 hcapList 会 dirty', !snap.deepEqual(dirtyA, dirtyB));
assert('CASE 9 未改 hcap dirty 相同', snap.deepEqual(dirtyA, dirtySame));

var np = snap.normalizePlayer({
  id: 'B',
  hcapList: SAMPLE_LIST,
  hcapPar3: '0',
  hcapPar4: '1',
  hcapPar5: '-0.5'
});
assert(
  'normalizePlayer 纳入 hcap',
  np && Array.isArray(np.hcapList) && np.hcapList.length === 1 && np.hcapPar4 != null
);

if (failed) {
  console.log('\nFAILED ' + failed + ' / ' + (passed + failed));
  process.exit(1);
}
console.log('\nOK ' + passed + ' / ' + (passed + failed));
