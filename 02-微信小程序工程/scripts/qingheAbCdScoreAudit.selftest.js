/**
 * 清河湾 A&B vs C&D：catalog PAR 记分 vs host settle PAR。
 * 运行：node scripts/qingheAbCdScoreAudit.selftest.js
 */
if (!global.wx) {
  var memStore = Object.create(null);
  global.wx = {
    getStorageSync: function (key) {
      return memStore[key];
    },
    setStorageSync: function (key, value) {
      memStore[key] = value;
    },
    removeStorageSync: function (key) {
      delete memStore[key];
    }
  };
}

var path = require('path');
var db = require('../miniprogram/utils/courseDatabase.js');
var halfCourse = require('../miniprogram/utils/halfCourse.js');
var holeLayout = require('../miniprogram/utils/holeLayout.js');
var utilsDir = path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'utils');
var hostMod = require(path.join(utilsDir, 'gameHostContext.js'));
var settleCore = require(path.join(utilsDir, 'settleCore.js'));
var s8421 = require(path.join(utilsDir, 'settle8421.js'));
var settle4 = require(path.join(utilsDir, 'settle8421Four.js'));

var passed = 0;
var failed = 0;

function assert(label, ok, detail) {
  if (ok) {
    passed += 1;
    console.log('PASS  ' + label);
    return;
  }
  failed += 1;
  console.log('FAIL  ' + label + (detail ? ' :: ' + detail : ''));
}

function sameArr(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function courseCtx(front, back, revision) {
  var ctx = {
    courseId: 'c-qhw',
    courseName: '北京清河湾乡村高尔夫俱乐部',
    front9Course: front,
    back9Course: back
  };
  if (revision != null) ctx.courseLayoutRevision = revision;
  return ctx;
}

function dumpHost(tag, hole, layout) {
  console.log('\n==== ' + tag + ' ====');
  console.log(
    JSON.stringify(
      {
        courseName: '北京清河湾乡村高尔夫俱乐部',
        front9Course: layout.front9Key,
        back9Course: layout.back9Key,
        fullHoleOrder: hole.holeOrder,
        holeOrder: hole.holeOrder,
        pars: hole.pars,
        holePars: layout.holePars,
        holeLabels: layout.columnLabels.filter(function (x) {
          return x !== 'OUT' && x !== 'IN' && x !== 'TOT';
        }),
        holeOrderRevision: db.COURSE_LAYOUT_REVISION
      },
      null,
      2
    )
  );
}

var course = halfCourse.findCourseById('c-qhw');
assert('清河湾主记录', !!course && course.courseId === 'c-qhw');

var halves = (course && course.halfCourses) || [];
halves.forEach(function (h) {
  console.log(
    JSON.stringify({
      courseCode: h.code,
      name: h.name,
      holes: h.holes,
      par: h.par
    })
  );
});
assert('A/B/C/D 字段同构（code/name/holes/par）', halves.length === 4 && halves.every(function (h) {
  return h.code && Array.isArray(h.par) && h.par.length === 9 && h.holes === 9;
}));

var catalogAB = holeLayout.buildHoleLayout(course, 'A', 'B', { courseLayoutRevision: 2 });
var catalogCD = holeLayout.buildHoleLayout(course, 'C', 'D', { courseLayoutRevision: 2 });
var legacyAB = holeLayout.buildHoleLayout(course, 'A', 'B');
var hostABBrokenShape = hostMod.resolveOfficialHoleContext(courseCtx('A', 'B'));
var hostABFixed = hostMod.resolveOfficialHoleContext(courseCtx('A', 'B', 2));
var hostCD = hostMod.resolveOfficialHoleContext(courseCtx('C', 'D', 2));
var hostCDNoRev = hostMod.resolveOfficialHoleContext(courseCtx('C', 'D'));

dumpHost('A&B catalog+host(rev=2)', hostABFixed, catalogAB);
dumpHost('C&D catalog+host', hostCD, catalogCD);

assert(
  'A&B holeOrder = A1..A9,B1..B9',
  hostABFixed.holeOrder.join(',') ===
    'A1,A2,A3,A4,A5,A6,A7,A8,A9,B1,B2,B3,B4,B5,B6,B7,B8,B9'
);
assert(
  'C&D holeOrder = C1..C9,D1..D9',
  hostCD.holeOrder.join(',') ===
    'C1,C2,C3,C4,C5,C6,C7,C8,C9,D1,D2,D3,D4,D5,D6,D7,D8,D9'
);
assert('A&B 无重复 holeId', hostABFixed.holeOrder.length === 18 && new Set(hostABFixed.holeOrder).size === 18);
assert('C&D 无重复 holeId', hostCD.holeOrder.length === 18 && new Set(hostCD.holeOrder).size === 18);
assert('无 revision 的 A/B host 仍走 legacy', sameArr(legacyAB.holePars, hostABBrokenShape.holeOrder.map(function (id) {
  return hostABBrokenShape.pars[id];
})));
assert('无 revision 的 C/D 仍是目录 PAR', sameArr(catalogCD.holePars, hostCDNoRev.holeOrder.map(function (id) {
  return hostCDNoRev.pars[id];
})));
assert(
  '有 revision 的 A/B host == 记分页 catalog',
  sameArr(catalogAB.holePars, hostABFixed.holeOrder.map(function (id) {
    return hostABFixed.pars[id];
  }))
);

var firstDiff = null;
catalogAB.holePars.forEach(function (p, i) {
  if (firstDiff) return;
  if (Number(p) !== Number(legacyAB.holePars[i])) {
    firstDiff = {
      holeId: hostABFixed.holeOrder[i],
      catalogPar: p,
      legacyPar: legacyAB.holePars[i],
      relIfGrossIsCatalogPar: Number(p) - Number(legacyAB.holePars[i])
    };
  }
});
console.log('\nfirst A&B catalog vs legacy par diff', JSON.stringify(firstDiff));
assert('A&B catalog 与 legacy 至少一洞不同', !!firstDiff);
assert('第一处分歧是 A2：catalog 3 vs legacy 4 → 录入PAR会被算成 rel=-1', firstDiff && firstDiff.holeId === 'A2' && firstDiff.relIfGrossIsCatalogPar === -1);

var plusOneHoles = [];
catalogAB.holePars.forEach(function (p, i) {
  var rel = Number(p) - Number(legacyAB.holePars[i]);
  if (rel === 1) plusOneHoles.push(hostABFixed.holeOrder[i]);
});
console.log('PAR录入在错误host下会变成 rel=+1 的洞', plusOneHoles.join(','));
assert('存在 PAR→+1 洞（A4/A7/A8/A9/B4/B9）', plusOneHoles.join(',') === 'A4,A7,A8,A9,B4,B9');

assert('8421 vs 8431/8432 共同变化是 p1: 2→3', (function () {
  var a = s8421.expandScoreCode('8421');
  var b = s8421.expandScoreCode('8431');
  var c = s8421.expandScoreCode('8432');
  return a.p1 === 2 && b.p1 === 3 && c.p1 === 3 && a.par === 4 && b.par === 4 && c.par === 4;
})());

function parGrossOfficial(hole, partyIds, parSource) {
  var official = {};
  partyIds.forEach(function (pid) {
    var holes = {};
    hole.holeOrder.forEach(function (label, i) {
      var par = parSource === 'host' ? hole.pars[label] : Number(parSource[i]);
      holes[label] = { score: par };
    });
    official[pid] = { holes: holes };
  });
  return official;
}

function relativeFromHost(hole, official) {
  var engine = hostMod.scoresToEngineFormat(official, hole.holeOrder);
  return settleCore.scoresToRelative(engine, hole.pars, hole.holeOrder);
}

function fourGame(scoreCodeA, halfTag) {
  return {
    catalogId: '8421-4',
    auditCourseHalf: halfTag,
    players: [
      { id: 'A', scoreCode: scoreCodeA },
      { id: 'B', scoreCode: '8421' },
      { id: 'C', scoreCode: '8421' },
      { id: 'D', scoreCode: '8421' }
    ],
    playerOrder: ['A', 'B', 'C', 'D'],
    groupMode: 'fixed',
    multiplier: 1,
    holes: [],
    ruleSnapshot: {
      catalogId: '8421-4',
      reward: 'none',
      pushRule: 'tie',
      meatEatMode: 'piece',
      meatValueType: 'fixed',
      meatValueN: 1,
      meatRows: ['le-2', 'm1', 'par', 'p1', 'ge-2'].map(function (id) {
        return { id: id, value: '1' };
      }),
      baoNeg: 'none',
      deductMode: 'on',
      deductWay: 'plus-n',
      deductPlusN: 4,
      deductCap: 'none'
    }
  };
}

function attachHoles(game, holeOrder) {
  game.holes = holeOrder.map(function (label) {
    return { label: label, on: true };
  });
  return game;
}

function runQH(name, front, back, scoreCodeA, parSourceMode) {
  var ctx = courseCtx(front, back, 2);
  var scorecard = holeLayout.resolveLayoutFromContext(ctx);
  var hole = hostMod.resolveOfficialHoleContext(ctx);
  var ids = ['A', 'B', 'C', 'D'];
  var official =
    parSourceMode === 'scorecard-vs-legacy-host'
      ? parGrossOfficial(hostMod.resolveOfficialHoleContext(courseCtx(front, back)), ids, scorecard.holePars)
      : parGrossOfficial(hole, ids, 'host');
  var settleHost = parSourceMode === 'scorecard-vs-legacy-host' ? hostMod.resolveOfficialHoleContext(courseCtx(front, back)) : hole;
  var rel = relativeFromHost(settleHost, official);
  var game = attachHoles(fourGame(scoreCodeA, front + '&' + back), settleHost.holeOrder);
  var out = settle4.settle(game, {
    scores: rel,
    holeOrder: settleHost.holeOrder,
    pars: settleHost.pars,
    windOn: false
  });
  var relBad = [];
  var mappedDiffHoles = [];
  settleHost.holeOrder.forEach(function (label, i) {
    var hostPar = settleHost.pars[label];
    var grossA = official.A.holes[label].score;
    var relA = rel[label] && rel[label].A;
    var mappedA = s8421.personalScore(relA, s8421.expandScoreCode(scoreCodeA), { deductMode: 'on', deductWay: 'plus-n', deductPlusN: 4 }, hostPar);
    var mappedC = s8421.personalScore(rel[label].C, s8421.expandScoreCode('8421'), { deductMode: 'on', deductWay: 'plus-n', deductPlusN: 4 }, hostPar);
    if (grossA === scorecard.holePars[i] && relA !== 0) {
      relBad.push({ label: label, gross: grossA, hostPar: hostPar, scorecardPar: scorecard.holePars[i], rel: relA });
    }
    if (mappedA !== mappedC) mappedDiffHoles.push({ label: label, relA: relA, mappedA: mappedA, mappedC: mappedC });
    var ledger = out.byHole[label] || {};
    var holePts = Math.abs(Number(ledger.A) || 0);
    if (parSourceMode !== 'scorecard-vs-legacy-host') {
      assert(name + ' ' + label + ' gross==hostPar → rel=0', relA === 0, JSON.stringify({ grossA: grossA, hostPar: hostPar, relA: relA }));
      assert(name + ' ' + label + ' baseDiff=0', holePts === 0, JSON.stringify(ledger));
    }
  });
  return { relBad: relBad, mappedDiffHoles: mappedDiffHoles, first: relBad[0] || mappedDiffHoles[0] || null };
}

console.log('\n--- 记分页 catalog PAR + 旧 host(无 revision) 会复现 ---');
var repro = runQH('BUG-AB-8431', 'A', 'B', '8431', 'scorecard-vs-legacy-host');
assert('旧链路 A&B 全PAR 仍有 rel!=0', repro.relBad.length > 0);
assert('旧链路 8431 会在 +1 洞放大 mapped 差', repro.mappedDiffHoles.some(function (h) {
  return h.relA === 1 && h.mappedA === 3 && h.mappedC === 2;
}));

var repro8421 = runQH('BUG-AB-8421', 'A', 'B', '8421', 'scorecard-vs-legacy-host');
assert('旧链路 8421 同样 rel 错，但 mapped 仍可能双方一样', repro8421.relBad.length > 0 && repro8421.mappedDiffHoles.length === 0);

console.log('\n--- QH1–QH6 生产链（gross=host.par，含 revision） ---');
runQH('QH1', 'A', 'B', '8421', 'host');
runQH('QH2', 'A', 'B', '8431', 'host');
runQH('QH3', 'A', 'B', '8432', 'host');
runQH('QH4', 'C', 'D', '8421', 'host');
runQH('QH5', 'C', 'D', '8431', 'host');
runQH('QH6', 'C', 'D', '8432', 'host');

var pos1AB = hostABFixed.holeOrder[0];
var pos1CD = hostCD.holeOrder[0];
assert('同位置第1洞 PAR 都是 4，rel 口径可比较', hostABFixed.pars[pos1AB] === 4 && hostCD.pars[pos1CD] === 4);

var letterCollision = relativeFromHost(
  hostABFixed,
  parGrossOfficial(hostABFixed, ['A', 'B', 'C', 'D'], 'host')
);
assert(
  'A1 与球员 A 分层存储，A1 上四人 rel 均为 0',
  letterCollision.A1.A === 0 && letterCollision.A1.B === 0 && !letterCollision.A && letterCollision.A1
);

var packed = hostMod.buildFromGameSnapshot({
  gameId: 'g-qhw-ab',
  courseId: 'c-qhw',
  courseName: '北京清河湾乡村高尔夫俱乐部',
  front9Course: 'A',
  back9Course: 'B',
  courseLayoutRevision: 2
});
assert('生产 snapshot 带 revision 后 host A2 par=3（catalog）', packed.pars && packed.pars.A2 === 3);
assert('生产 snapshot 带 revision 后 host A4 par=4（catalog）', packed.pars && packed.pars.A4 === 4);

var packedLegacy = hostMod.buildFromGameSnapshot({
  gameId: 'g-qhw-ab-old',
  courseId: 'c-qhw',
  courseName: '北京清河湾乡村高尔夫俱乐部',
  front9Course: 'A',
  back9Course: 'B'
});
assert('无 revision 旧局仍用 legacy：A2=4', packedLegacy.pars && packedLegacy.pars.A2 === 4);

var scoringSnap = require('../miniprogram/subpackages/scoring/utils/sideGameHostSnapshot.js');
var fromScorePage = scoringSnap.fromGame({
  gameId: 'g-qhw-ab',
  courseId: 'c-qhw',
  courseName: '北京清河湾乡村高尔夫俱乐部',
  front9Course: 'A',
  back9Course: 'B',
  courseLayoutRevision: 2
});
assert(
  '记分页 snapshot 带上 courseLayoutRevision',
  fromScorePage.courseContext && fromScorePage.courseContext.courseLayoutRevision === 2
);

console.log('\npassed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
process.exit(0);
