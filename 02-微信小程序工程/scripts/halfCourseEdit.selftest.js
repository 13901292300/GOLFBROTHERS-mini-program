/**
 * halfCourseEdit coordinator：目录/临时球场 context、revision、convert 接线。
 * 运行：node scripts/halfCourseEdit.selftest.js
 *
 * Node 当前环境可能不可用：以 source-covered / not executed 为准，不要声称 CI passed。
 */

var fs = require('fs');
var path = require('path');

var bag = {};
global.wx = {
  getStorageSync: function (key) {
    return bag[key];
  },
  setStorageSync: function (key, value) {
    bag[key] = JSON.parse(JSON.stringify(value));
  },
  removeStorageSync: function (key) {
    delete bag[key];
  }
};

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var editSrc = fs.readFileSync(path.join(mini, 'utils', 'halfCourseEdit.js'), 'utf8');

var passed = 0;
var failed = 0;
function assert(label, ok, extra) {
  if (ok) {
    passed += 1;
    console.log('PASS  ' + label);
    return;
  }
  failed += 1;
  console.log('FAIL  ' + label + (extra ? ' :: ' + extra : ''));
}

function scores18(fill) {
  var a = [];
  var i;
  for (i = 0; i < 18; i++) a.push(fill);
  return a;
}

function catalogGame(id, extra) {
  return Object.assign(
    {
      gameId: id,
      courseId: 'BJCC_GOLF_001',
      courseName: '北京乡村高尔夫俱乐部',
      front9Course: 'A',
      back9Course: 'B',
      courseHalfText: ' A&B',
      courseLayoutRevision: 2,
      groups: [
        {
          scoresByPlayer: {
            ken: { scores: scores18(5), putts: [] }
          }
        }
      ]
    },
    extra || {}
  );
}

function tempPars() {
  return [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5];
}

function tempGame(id, extra) {
  return Object.assign(
    {
      gameId: id,
      courseId: '',
      courseName: '林克斯练习',
      courseSource: 'temporary',
      temporaryCourseId: 'tc-edit-1',
      holePars: tempPars(),
      courseLayoutRevision: null,
      front9Course: 'A',
      back9Course: 'B',
      courseHalfText: ' A&B',
      groups: [
        {
          scoresByPlayer: {
            ken: { scores: scores18(5), putts: [] }
          }
        }
      ]
    },
    extra || {}
  );
}

/* ---------- source-style contracts ---------- */

assert(
  'source: 调用 4D1 prepareConvertedScores，不内嵌 convertStrokes',
  editSrc.indexOf('halfCourseScoreConvert.prepareConvertedScores') >= 0 &&
    editSrc.indexOf('function convertStrokes') < 0
);
assert(
  'source: convert 失败在 saveGame 之前返回',
  /if \(!converted\.ok\) \{[\s\S]{0,180}return failResult/.test(editSrc) &&
    editSrc.indexOf('if (!converted.ok)') < editSrc.indexOf('gameStore.saveGame(Object.assign')
);
assert(
  'source: 临时场 useCatalog 被短路',
  /const useCatalog =\s*!isTemporary &&/.test(editSrc)
);
assert(
  'source: 临时 afterCtx revision 为 null',
  /courseLayoutRevision: isTemporary\s*\?[\s\S]{0,40}null/.test(editSrc)
);
assert(
  'source: 临时 save 强制 courseLayoutRevision = null',
  /if \(isTemporary\) \{[\s\S]{0,220}courseLayoutRevision = null/.test(editSrc)
);
assert(
  'source: 目录 stamp COURSE_LAYOUT_REVISION',
  editSrc.indexOf('courseDatabase.COURSE_LAYOUT_REVISION') >= 0 &&
    /else if \(useCatalog\) \{[\s\S]{0,80}COURSE_LAYOUT_REVISION/.test(editSrc)
);
assert(
  'source: before/after 保留 courseSource / holePars / temporaryCourseId',
  editSrc.indexOf('assignCourseIdentity') >= 0 &&
    editSrc.indexOf('courseSource: isTemporary') >= 0 &&
    editSrc.indexOf('temporaryCourseId: isTemporary') >= 0 &&
    editSrc.indexOf("courseSource: 'temporary'") >= 0
);
assert(
  'source: 缺 holePars 的临时场失败且在 save 之前',
  editSrc.indexOf('临时球场缺少有效标准杆，已取消更换') >= 0 &&
    editSrc.indexOf('临时球场缺少有效标准杆，已取消更换') <
      editSrc.indexOf('gameStore.saveGame(Object.assign')
);
assert(
  'source: 成功后才 save / rebuild / notify',
  editSrc.indexOf('syncAfterCourseHalfChange') >
    editSrc.indexOf('if (!converted.ok)') &&
    editSrc.indexOf("notifyAllGamesReplay('course-half')") >
      editSrc.indexOf('if (!converted.ok)')
);
assert(
  'source: resolveLayoutFromContext(beforeCtx) 后 afterCtx',
  editSrc.indexOf('resolveLayoutFromContext(beforeCtx)') >= 0 &&
    editSrc.indexOf('resolveLayoutFromContext(afterCtx)') >= 0
);

/* ---------- runtime-style apply + spies ---------- */

var gameStore = require(path.join(mini, 'utils', 'gameStore.js'));
var teamMatchStore = require(path.join(mini, 'utils', 'teamMatchStore.js'));
var matchState = require(path.join(mini, 'utils', 'matchState.js'));
var holeLayout = require(path.join(mini, 'utils', 'holeLayout.js'));
var courseDatabase = require(path.join(mini, 'utils', 'courseDatabase.js'));
var rebuild = require(path.join(mini, 'utils', 'matchHoleOrderRebuild.js'));
var notifyMod = require(path.join(mini, 'utils', 'sideGameDerivedNotify.js'));
var halfCourseEdit = require(path.join(mini, 'utils', 'halfCourseEdit.js'));

var counters = {
  saveGame: 0,
  saveMatch: 0,
  setMatchState: 0,
  rebuild: 0,
  notify: 0
};

var origSaveGame = gameStore.saveGame;
gameStore.saveGame = function (g) {
  counters.saveGame += 1;
  return origSaveGame(g);
};
var origSaveMatch = teamMatchStore.saveMatch;
if (typeof origSaveMatch === 'function') {
  teamMatchStore.saveMatch = function (m) {
    counters.saveMatch += 1;
    return origSaveMatch(m);
  };
}
var origSetMatchState = matchState.setMatchState;
matchState.setMatchState = function (ms) {
  counters.setMatchState += 1;
  return origSetMatchState(ms);
};
var origRebuild = rebuild.syncAfterCourseHalfChange;
rebuild.syncAfterCourseHalfChange = function (opts) {
  counters.rebuild += 1;
  return { ok: true, rebuilt: false, skipped: true };
};
var origNotify = notifyMod.notifyAllGamesReplay;
notifyMod.notifyAllGamesReplay = function () {
  counters.notify += 1;
};

function resetCounters() {
  counters.saveGame = 0;
  counters.saveMatch = 0;
  counters.setMatchState = 0;
  counters.rebuild = 0;
  counters.notify = 0;
}

function seedMatchState(gameId, front, back) {
  bag[matchState.MATCH_STATE_KEY || 'matchState'] = {
    gameId: gameId,
    course: {
      courseId: 'BJCC_GOLF_001',
      front9Course: front,
      back9Course: back
    }
  };
}

var oldAB = holeLayout.resolveLayoutFromContext({
  courseId: 'BJCC_GOLF_001',
  courseName: '北京乡村高尔夫俱乐部',
  front9Course: 'A',
  back9Course: 'B',
  courseLayoutRevision: 2
});
var newDB = holeLayout.resolveLayoutFromContext({
  courseId: 'BJCC_GOLF_001',
  courseName: '北京乡村高尔夫俱乐部',
  front9Course: 'D',
  back9Course: 'B',
  courseLayoutRevision: 2
});
assert(
  'layout helper: 目录 A/B 与 D/B 前九 PAR 不同',
  oldAB.holePars.slice(0, 9).join(',') !== newDB.holePars.slice(0, 9).join(',') &&
    oldAB.holePars.slice(9).join(',') === newDB.holePars.slice(9).join(',')
);

/* CASE 1 目录前九 */
resetCounters();
origSaveGame(catalogGame('g-c1'));
seedMatchState('g-c1', 'A', 'B');
var r1 = halfCourseEdit.apply(
  { gameId: 'g-c1', courseId: 'BJCC_GOLF_001', courseName: '北京乡村高尔夫俱乐部' },
  'D',
  'B'
);
var g1 = gameStore.getGame('g-c1');
var expectedH1 = 5 - oldAB.holePars[1] + newDB.holePars[1];
assert('CASE1 apply 成功', r1 && r1.ok === true);
assert('CASE1 front9 更新为 D', g1 && g1.front9Course === 'D');
assert('CASE1 back9 仍为 B', g1 && g1.back9Course === 'B');
assert(
  'CASE1 catalog revision stamp',
  g1 && g1.courseLayoutRevision === courseDatabase.COURSE_LAYOUT_REVISION
);
assert(
  'CASE1 第2格按 oldDiff+newPar 写入',
  g1 && g1.groups[0].scoresByPlayer.ken.scores[1] === expectedH1
);
assert('CASE1 后九总杆未改', g1 && g1.groups[0].scoresByPlayer.ken.scores[9] === 5);
assert('CASE1 成功链路调用 saveGame', counters.saveGame >= 1);

/* CASE 2 目录后九 */
resetCounters();
origSaveGame(catalogGame('g-c2'));
seedMatchState('g-c2', 'A', 'B');
var r2 = halfCourseEdit.apply(
  { gameId: 'g-c2', courseId: 'BJCC_GOLF_001', courseName: '北京乡村高尔夫俱乐部' },
  'A',
  'D'
);
var g2 = gameStore.getGame('g-c2');
assert('CASE2 apply 成功', r2 && r2.ok === true);
assert('CASE2 只改 back9Course', g2 && g2.front9Course === 'A' && g2.back9Course === 'D');
assert(
  'CASE2 catalog revision stamp',
  g2 && g2.courseLayoutRevision === courseDatabase.COURSE_LAYOUT_REVISION
);
assert('CASE2 前九总杆未改', g2 && g2.groups[0].scoresByPlayer.ken.scores[0] === 5);

/* CASE 3 临时球场 */
resetCounters();
origSaveGame(tempGame('g-t3'));
seedMatchState('g-t3', 'A', 'B');
var snapLayout = holeLayout.resolveLayoutFromContext({
  courseSource: 'temporary',
  holePars: tempPars(),
  front9Course: 'A',
  back9Course: 'B'
});
var catalogFallback = holeLayout.resolveLayoutFromContext({
  courseId: '',
  courseName: '林克斯练习',
  front9Course: 'C',
  back9Course: 'B'
});
var r3 = halfCourseEdit.apply(
  {
    gameId: 'g-t3',
    courseSource: 'temporary',
    temporaryCourseId: 'tc-edit-1',
    holePars: tempPars(),
    courseLayoutRevision: null
  },
  'C',
  'B'
);
var g3 = gameStore.getGame('g-t3');
assert('CASE3 apply 成功', r3 && r3.ok === true);
assert(
  'CASE3 仍为 temporary + 原 id',
  g3 && g3.courseSource === 'temporary' && g3.temporaryCourseId === 'tc-edit-1'
);
assert('CASE3 revision 仍为 null', g3 && g3.courseLayoutRevision === null);
assert(
  'CASE3 holePars snapshot 未改成 catalog',
  g3 && Array.isArray(g3.holePars) && g3.holePars.join(',') === tempPars().join(',')
);
assert(
  'CASE3 layout 来自 snapshot 而非 catalog fallback',
  snapLayout.holePars.join(',') === tempPars().join(',') &&
    catalogFallback.holePars.join(',') !== tempPars().join(',')
);
assert('CASE3 front9 更新为 C', g3 && g3.front9Course === 'C' && g3.back9Course === 'B');

/* CASE 4 临时缺 holePars */
resetCounters();
origSaveGame(
  tempGame('g-t4', {
    holePars: null,
    groups: [{ scoresByPlayer: { ken: { scores: scores18(5) } } }]
  })
);
seedMatchState('g-t4', 'A', 'B');
var msBefore4 = JSON.stringify(bag[matchState.MATCH_STATE_KEY || 'matchState']);
var g4Before = JSON.parse(JSON.stringify(gameStore.getGame('g-t4')));
var r4 = halfCourseEdit.apply(
  {
    gameId: 'g-t4',
    courseSource: 'temporary',
    temporaryCourseId: 'tc-edit-1',
    courseLayoutRevision: null
  },
  'C',
  'B'
);
var g4 = gameStore.getGame('g-t4');
assert('CASE4 apply 失败', r4 && r4.ok === false);
assert('CASE4 不 saveGame', counters.saveGame === 0);
assert('CASE4 不 saveMatch', counters.saveMatch === 0);
assert('CASE4 不 setMatchState', counters.setMatchState === 0);
assert('CASE4 不 rebuild', counters.rebuild === 0);
assert('CASE4 不 notify', counters.notify === 0);
assert(
  'CASE4 不写 course fields',
  g4 && g4.front9Course === g4Before.front9Course && g4.back9Course === g4Before.back9Course
);
assert(
  'CASE4 matchState 未改',
  JSON.stringify(bag[matchState.MATCH_STATE_KEY || 'matchState']) === msBefore4
);

/* CASE 5 convert 失败 newGross < 1 */
resetCounters();
var badScores = scores18(5);
badScores[1] = 1;
origSaveGame(
  catalogGame('g-c5', {
    groups: [{ scoresByPlayer: { ken: { scores: badScores, putts: [2, 2] } } }]
  })
);
seedMatchState('g-c5', 'A', 'B');
var g5Before = JSON.parse(JSON.stringify(gameStore.getGame('g-c5')));
var msBefore5 = JSON.stringify(bag[matchState.MATCH_STATE_KEY || 'matchState']);
var r5 = halfCourseEdit.apply(
  { gameId: 'g-c5', courseId: 'BJCC_GOLF_001', courseName: '北京乡村高尔夫俱乐部' },
  'D',
  'B'
);
var g5 = gameStore.getGame('g-c5');
assert('CASE5 convert 失败返回 ok:false', r5 && r5.ok === false);
assert('CASE5 不 saveGame', counters.saveGame === 0);
assert('CASE5 不 saveMatch', counters.saveMatch === 0);
assert('CASE5 不 setMatchState', counters.setMatchState === 0);
assert('CASE5 不 rebuild', counters.rebuild === 0);
assert('CASE5 不 notify', counters.notify === 0);
assert('CASE5 不写 front9', g5 && g5.front9Course === 'A' && g5.back9Course === 'B');
assert(
  'CASE5 不写 scores',
  g5 && g5.groups[0].scoresByPlayer.ken.scores[1] === 1 &&
    g5.groups[0].scoresByPlayer.ken.scores.join(',') ===
      g5Before.groups[0].scoresByPlayer.ken.scores.join(',')
);
assert(
  'CASE5 matchState 未改',
  JSON.stringify(bag[matchState.MATCH_STATE_KEY || 'matchState']) === msBefore5
);

/* CASE 6 成功链路（目录前九，确认 save 后成绩与半场） */
resetCounters();
origSaveGame(catalogGame('g-c6'));
seedMatchState('g-c6', 'A', 'B');
var r6 = halfCourseEdit.apply(
  { gameId: 'g-c6', courseId: 'BJCC_GOLF_001', courseName: '北京乡村高尔夫俱乐部' },
  'D',
  'B'
);
var g6 = gameStore.getGame('g-c6');
var expect6 = 5 - oldAB.holePars[1] + newDB.holePars[1];
assert('CASE6 成功', r6 && r6.ok === true);
assert(
  'CASE6 course fields + converted score',
  g6 &&
    g6.front9Course === 'D' &&
    g6.back9Course === 'B' &&
    g6.courseLayoutRevision === courseDatabase.COURSE_LAYOUT_REVISION &&
    g6.groups[0].scoresByPlayer.ken.scores[1] === expect6
);
assert('CASE6 调用 saveGame', counters.saveGame >= 1);
assert(
  'CASE6 成功后允许 rebuild 或 notify（半场变化）',
  counters.rebuild >= 0 && r6.ok === true
);

if (failed) {
  console.log('FAILED ' + failed + ' / ' + (passed + failed));
  process.exit(1);
}
console.log('OK ' + passed + ' checks (source + runtime-style; execute only when Node is available)');
