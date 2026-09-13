/**
 * PAR5 HIO special-result Phase 0 adapter。
 * 运行：node scripts/specialResultAdapter.selftest.js
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
var specialResult = require('../miniprogram/subpackages/game/utils/specialResult.js');
var resultFormat = require('../miniprogram/subpackages/game/utils/resultFormat.js');
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

function read(rel) {
  return fs.readFileSync(path.join(mini, rel), 'utf8');
}

function sampleEvent(extra) {
  return Object.assign(
    {
      kind: 'par5_hio',
      hole: '5',
      plusIds: ['A'],
      minusIds: ['B'],
      matchup: {
        type: 'pair',
        sideAIds: ['A'],
        sideBIds: ['B']
      },
      meatAllEaten: true
    },
    extra || {}
  );
}

var bindJs = read('subpackages/game/utils/sideGameBind.js');
assert(
  'persistLiveResult 比较 specialByHole',
  /function persistLiveResult/.test(bindJs) &&
    /specialResult\.liveSnapshotEqual\(prevSnap, result\)/.test(bindJs) &&
    !/JSON\.stringify\(prevSnap\.byHole \|\| \{\}\) === JSON\.stringify\(result\.byHole \|\| \{\}\)/.test(bindJs)
);
assert('listBoard 先读 infSignForPlayer', /specialResult\.infSignForPlayer/.test(bindJs));
assert('未 bump settleVersion', !/SETTLE_VERSION/.test(read('subpackages/game/utils/specialResult.js')));
assert(
  '未改具体 settle 引擎',
  !/specialResult/.test(read('subpackages/game/utils/settleStroke2.js')) &&
    !/specialResult/.test(read('subpackages/game/utils/settleMatch2.js')) &&
    !/specialResult/.test(read('subpackages/game/utils/settleYoucai.js')) &&
    !/specialResult/.test(read('subpackages/game/utils/settle8421.js'))
);

var pending = resultFormat.formatBoardCell({ inGame: true, played: false, raw: null });
var zero = resultFormat.formatBoardCell({ inGame: true, played: true, raw: 0 });
var plus = resultFormat.formatBoardCell({ inGame: true, played: true, raw: 1 });
assert(
  'CASE1 无 special 与旧行为一致',
  pending.text === '' &&
    pending.status === 'pending' &&
    pending.played === false &&
    zero.text === '0' &&
    zero.status === 'settled' &&
    zero.raw === 0 &&
    plus.text === '+1' &&
    resultTone.resultToneClass(1) === 'result-positive' &&
    resultTone.resultToneClass(-1) === 'result-negative' &&
    resultTone.resultToneClass(0) === '' &&
    specialResult.infSignForPlayer(undefined, '5', 'A') === 0 &&
    specialResult.infSignForPlayer({}, '5', 'A') === 0
);

var specialByHole = { '5': [sampleEvent()] };
var cellA = resultFormat.formatBoardCell({
  inGame: true,
  played: false,
  raw: null,
  infSign: specialResult.infSignForPlayer(specialByHole, '5', 'A')
});
var cellB = resultFormat.formatBoardCell({
  inGame: true,
  played: false,
  raw: null,
  infSign: specialResult.infSignForPlayer(specialByHole, '5', 'B')
});
assert(
  'CASE2 A +∞ played 红色',
  specialResult.infSignForPlayer(specialByHole, '5', 'A') === 1 &&
    cellA.played === true &&
    cellA.status === 'settled' &&
    cellA.text === '∞' &&
    cellA.raw === null &&
    cellA.infSign === 1 &&
    cellA.cls === 'result-positive' &&
    resultTone.resultToneClass(null, 1) === 'result-positive'
);
assert(
  'CASE2 B -∞ played 绿色',
  specialResult.infSignForPlayer(specialByHole, '5', 'B') === -1 &&
    cellB.played === true &&
    cellB.text === '-∞' &&
    cellB.raw === null &&
    cellB.infSign === -1 &&
    cellB.cls === 'result-negative' &&
    resultTone.resultToneClass(0, -1) === 'result-negative'
);

assert(
  'CASE3 无关球员 C 不受影响',
  specialResult.infSignForPlayer(specialByHole, '5', 'C') === 0 &&
    resultFormat.formatBoardCell({ inGame: true, played: false, raw: null }).status === 'pending'
);

var prevSnap = {
  scoreConfigFp: 'fp',
  hostStructureFp: 'host',
  byHole: { '4': { A: 2, B: -2 } },
  specialByHole: {}
};
var nextSameByHole = {
  scoreConfigFp: 'fp',
  hostStructureFp: 'host',
  byHole: { '4': { A: 2, B: -2 } },
  specialByHole: { '5': [sampleEvent()] }
};
var nextUnchanged = {
  scoreConfigFp: 'fp',
  hostStructureFp: 'host',
  byHole: { '4': { A: 2, B: -2 } },
  specialByHole: {}
};
var nextByHoleOnly = {
  scoreConfigFp: 'fp',
  hostStructureFp: 'host',
  byHole: { '4': { A: 3, B: -3 } },
  specialByHole: {}
};
assert(
  'CASE4 special 变、byHole 不变 → 不得视为相等',
  specialResult.liveSnapshotEqual(prevSnap, nextSameByHole) === false
);
assert(
  'CASE4 两者都不变 → 可跳过',
  specialResult.liveSnapshotEqual(prevSnap, nextUnchanged) === true
);
assert(
  'CASE4 仅 byHole 变 → 不相等',
  specialResult.liveSnapshotEqual(prevSnap, nextByHoleOnly) === false
);
assert(
  'CASE4 缺省 specialByHole 等同空对象',
  specialResult.liveSnapshotEqual({ byHole: { '1': { A: 0 } } }, { byHole: { '1': { A: 0 } }, specialByHole: {} }) ===
    true
);

var snapshot = {
  byHole: { '4': { A: 1, B: -1 } },
  specialByHole: { '5': [sampleEvent()] },
  catalogId: 'stroke-2'
};
var cloned = rec.jsonClone(snapshot);
var json = JSON.stringify(cloned);
var parsed = JSON.parse(json);
assert(
  'CASE5 JSON roundtrip 字段完整',
  parsed.specialByHole['5'][0].kind === 'par5_hio' &&
    parsed.specialByHole['5'][0].hole === '5' &&
    parsed.specialByHole['5'][0].plusIds[0] === 'A' &&
    parsed.specialByHole['5'][0].minusIds[0] === 'B' &&
    parsed.specialByHole['5'][0].matchup.type === 'pair' &&
    parsed.specialByHole['5'][0].matchup.sideAIds[0] === 'A' &&
    parsed.specialByHole['5'][0].matchup.sideBIds[0] === 'B' &&
    parsed.specialByHole['5'][0].meatAllEaten === true &&
    parsed.byHole['4'].A === 1
);
assert(
  'CASE5 序列化不含 Infinity/NaN 业务值',
  json.indexOf('Infinity') < 0 &&
    json.indexOf('NaN') < 0 &&
    json.indexOf('"∞"') < 0 &&
    typeof cloned.specialByHole['5'][0].plusIds[0] === 'string'
);

var row = rec.normalizeRecord({
  sideGameId: 'sg_hio_adp',
  matchId: 'm1',
  groupId: 'g1',
  scope: 'group',
  ruleId: 'stroke-2',
  ruleSnapshot: rec.buildRuleSnapshot('stroke-2'),
  title: '比杆',
  participantParties: [
    { partyId: 'oldA', partyType: 'player', memberPlayerIds: ['oldA'] },
    { partyId: 'pB', partyType: 'player', memberPlayerIds: ['pB'] }
  ],
  visibility: 'group',
  status: 'active',
  createdBy: 'u1',
  resultSnapshot: {
    byHole: {},
    specialByHole: {
      '5': [
        sampleEvent({
          plusIds: ['oldA'],
          minusIds: ['pB'],
          matchup: { type: 'pair', sideAIds: ['oldA'], sideBIds: ['pB'] }
        })
      ]
    }
  }
});
var remapped = rec.remapRecordPlayerIds(row, { oldA: 'newA' });
var ev = remapped.resultSnapshot && remapped.resultSnapshot.specialByHole && remapped.resultSnapshot.specialByHole['5'][0];
assert(
  'CASE6 identity remap 替换独立 id 字段',
  !!(
    ev &&
    ev.plusIds[0] === 'newA' &&
    ev.minusIds[0] === 'pB' &&
    ev.matchup.sideAIds[0] === 'newA' &&
    ev.matchup.sideBIds[0] === 'pB'
  ),
  ev ? JSON.stringify(ev) : 'missing event'
);

assert(
  'format 不把 ∞ 当 Number',
  resultFormat.formatGameResultCell({ status: 'settled', infSign: 1, value: null }) === '∞' &&
    resultFormat.formatGameResultCell({ status: 'settled', infSign: -1 }) === '-∞' &&
    resultFormat.formatGameResultCell({ status: 'settled', value: 0 }) === '0'
);

if (failed) {
  console.log('FAIL ' + failed + ' / ' + (passed + failed));
  process.exit(1);
}
console.log('OK ' + passed + ' passed');
