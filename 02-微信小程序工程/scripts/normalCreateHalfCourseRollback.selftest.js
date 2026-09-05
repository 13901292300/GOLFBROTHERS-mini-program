/**
 * 普通创建/编辑：半场与洞序同步失败回滚（页面级）。
 * 运行：node scripts/normalCreateHalfCourseRollback.selftest.js
 */
var fs = require('fs');
var path = require('path');

var bag = {};
var toasts = [];
var navs = [];
var timers = [];
var now = 1700000000000;
var origDateNow = Date.now;

global.Date.now = function () {
  now += 1;
  return now;
};

global.getApp = function () {
  return {
    getTheme: function () {
      return 'bright';
    }
  };
};
global.getCurrentPages = function () {
  return [{ route: 'home' }, { route: 'create' }];
};

var capturedPage = null;
global.Page = function (def) {
  capturedPage = def;
  return def;
};

global.wx = {
  getStorageSync: function (key) {
    return bag[key];
  },
  setStorageSync: function (key, value) {
    bag[key] = JSON.parse(JSON.stringify(value));
  },
  removeStorageSync: function (key) {
    delete bag[key];
  },
  showToast: function (opt) {
    toasts.push(opt && opt.title);
  },
  showModal: function () {},
  navigateBack: function () {
    navs.push('back');
  },
  redirectTo: function (opt) {
    navs.push(opt && opt.url);
    if (opt && opt.success) opt.success();
  },
  navigateTo: function (opt) {
    navs.push(opt && opt.url);
    if (opt && opt.success) opt.success();
  },
  getWindowInfo: function () {
    return { windowWidth: 375, windowHeight: 667, statusBarHeight: 24 };
  },
  getSystemInfoSync: function () {
    return { windowWidth: 375, windowHeight: 667, statusBarHeight: 24 };
  },
  getMenuButtonBoundingClientRect: function () {
    return { top: 24, height: 32, bottom: 56, left: 280 };
  }
};

global.setTimeout = function (fn) {
  timers.push(fn);
  return timers.length;
};

var root = path.join(__dirname, '..');
var pagePath = path.join(
  root,
  'miniprogram',
  'subpackages',
  'create',
  'pages',
  'normal',
  'index.js'
);
require(pagePath);

var gameStore = require('../miniprogram/utils/gameStore.js');
var halfCourseEdit = require('../miniprogram/utils/halfCourseEdit.js');
var matchStateUtil = require('../miniprogram/utils/matchState.js');
var holeLayout = require('../miniprogram/utils/holeLayout.js');
var rebuild = require('../miniprogram/utils/matchHoleOrderRebuild.js');
var origApplyLayout = holeLayout.applyLayout;
var origSaveGame = gameStore.saveGame;

var passed = 0;
var failed = 0;
var origSync = rebuild.syncAfterCourseHalfChange;

function assert(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    console.log('FAIL  ' + name + (detail ? ' :: ' + detail : ''));
  }
}

function flushTimers() {
  var list = timers.slice();
  timers = [];
  list.forEach(function (fn) {
    fn();
  });
}

function resetUi() {
  toasts = [];
  navs = [];
  timers = [];
}

function bindPage() {
  var inst = Object.create(capturedPage);
  inst.data = JSON.parse(JSON.stringify(capturedPage.data));
  inst.setData = function (patch, cb) {
    var k;
    for (k in patch || {}) {
      if (Object.prototype.hasOwnProperty.call(patch, k)) inst.data[k] = patch[k];
    }
    if (typeof cb === 'function') cb.call(inst);
  };
  return inst;
}

function scores18(first) {
  var a = [];
  var i;
  for (i = 0; i < 18; i++) a.push(i === 0 ? first : null);
  return a;
}

function seedEditGame() {
  var game = {
    gameId: 'g-edit-1',
    courseId: 'c-honghua',
    courseName: '北京清河湾乡村高尔夫俱乐部C&D',
    courseLocation: '北京 · 昌平',
    front9Course: 'C',
    back9Course: 'D',
    courseHalfText: '（C/D）',
    teeTime: '2026年05月04日 09:40',
    roundName: '旧题目',
    gameMode: '个人比杆赛',
    groupCompositionMap: {},
    composition: null,
    scoringTemplate: '',
    visibility: 'public',
    accessCode: null,
    playersSlots: [
      { playerId: 'me', name: 'Ken' },
      { playerId: 'p2', name: 'A' }
    ],
    groups: [
      {
        groupId: 'grp-1',
        name: '第1组',
        status: 'not_started',
        playersSlots: [
          { playerId: 'me', name: 'Ken' },
          { playerId: 'p2', name: 'A' }
        ],
        scoresByPlayer: {
          me: { scores: scores18(4), putts: [] },
          p2: { scores: scores18(5), putts: [] }
        }
      }
    ],
    status: 'active',
    currentRound: 1,
    createdBy: 'me',
    creatorId: 'me',
    creatorGroupIndex: 0,
    creatorInGame: true,
    createdAt: 1,
    updatedAt: 10
  };
  gameStore.saveGame(game);
  return game;
}

function applyCdLayout() {
  holeLayout.applyLayout({
    holePars: [4, 4, 4, 3, 4, 5, 4, 3, 4, 4, 4, 4, 3, 4, 5, 4, 3, 4],
    columnLabels: [],
    columnPars: [],
    front9Key: 'C',
    back9Key: 'D',
    specialIdx: [9, 19, 20]
  });
}

function failHoleSync() {
  rebuild.syncAfterCourseHalfChange = function () {
    return { ok: false, message: '洞序同步失败' };
  };
}

function restoreHoleSync() {
  rebuild.syncAfterCourseHalfChange = origSync;
}

function restoreLayout() {
  global.__throwOnLayout = false;
  holeLayout.applyLayout = origApplyLayout;
}

function restoreSaveGame() {
  global.__blockOldRestore = false;
  gameStore.saveGame = origSaveGame;
}

holeLayout.applyLayout = function (layout) {
  if (global.__throwOnLayout) throw new Error('layout boom');
  return origApplyLayout(layout);
};

function nines(a, b) {
  var out = [];
  var i;
  for (i = 1; i <= 9; i++) out.push(a + i);
  if (b) for (i = 1; i <= 9; i++) out.push(b + i);
  return out;
}

function settingsOf(matchId) {
  var map = bag[rebuild.SETTINGS_KEY] || {};
  return map[matchId + '::score'] || {};
}

function makeCreateForm(page) {
  page.setData({
    isEditMode: false,
    courseId: 'c-qhw',
    courseName: '北京清河湾高尔夫乡村俱乐部 A&B',
    courseLocation: '北京 · 昌平',
    front9Course: null,
    back9Course: null,
    courseHalfText: '',
    teeTimeText: '2026年05月04日 09:40',
    roundName: '新建标题',
    gameMode: '个人比杆赛',
    visibility: 'public',
    accessCode: '',
    groups: [
      {
        id: 'grp-1',
        players: [
          {
            key: 'grp-1-p1',
            filled: true,
            playerId: 'me',
            name: 'Ken Duan',
            avatar: ''
          },
          { key: 'grp-1-p2', filled: false, name: '玩家2' },
          { key: 'grp-1-p3', filled: false, name: '玩家3' },
          { key: 'grp-1-p4', filled: false, name: '玩家4' }
        ]
      }
    ]
  });
}

var pageSrc = fs.readFileSync(pagePath, 'utf8');
assert(
  '页面失败路径不二次 saveGame(existing)',
  !/_doUpdate[\s\S]*ok === false[\s\S]{0,180}saveGame\(existing\)/.test(pageSrc)
);
assert('编辑走 gameRollback restore', /policy: 'restore'/.test(pageSrc));
assert('新建走 gameRollback delete', /policy: 'delete'/.test(pageSrc));
assert('页面不按标题删除比赛', pageSrc.indexOf('removeGame') < 0);

bag = {};
resetUi();
seedEditGame();
applyCdLayout();
matchStateUtil.setMatchState({
  gameId: 'g-edit-1',
  fromFlow: 'pre-edit',
  course: { front9Course: 'C', back9Course: 'D', halfText: 'old' }
});
var page = bindPage();
page._initEditMode('g-edit-1');
page.setData({
  roundName: '新题目',
  courseId: 'c-qhw',
  courseName: '北京清河湾高尔夫乡村俱乐部 A&B',
  front9Course: 'A',
  back9Course: 'B',
  courseHalfText: ''
});
failHoleSync();
page._doUpdate();
var afterFail = gameStore.getGame('g-edit-1');
assert('_doUpdate 失败 toast 为洞序原因', toasts.indexOf('洞序同步失败') >= 0);
assert('_doUpdate 失败无已保存', toasts.indexOf('已保存') < 0);
assert('_doUpdate 失败不导航', navs.length === 0);
assert(
  '_doUpdate 存储恢复旧比赛',
  afterFail &&
    afterFail.roundName === '旧题目' &&
    afterFail.courseId === 'c-honghua' &&
    afterFail.front9Course === 'C' &&
    afterFail.back9Course === 'D'
);
assert(
  '_doUpdate 成绩与球员未丢',
  afterFail.groups[0].scoresByPlayer.me.scores[0] === 4 &&
    afterFail.groups[0].scoresByPlayer.p2.scores[0] === 5 &&
    afterFail.groups[0].playersSlots[1].name === 'A'
);
assert('_doUpdate 页面保留新表单', page.data.roundName === '新题目' && page.data.courseId === 'c-qhw');
assert(
  '_doUpdate matchState 恢复',
  (matchStateUtil.getMatchState() || {}).fromFlow === 'pre-edit'
);
assert('_doUpdate holeLayout 恢复', holeLayout.getLayout().front9Key === 'C' && holeLayout.getLayout().back9Key === 'D');
assert('rolledBack 不锁提交', !page._submitBlockedReason);

var tokenA = halfCourseEdit.nextSaveToken(10);
assert('令牌比旧值递增', tokenA > 10);
var frozen = Date.now;
Date.now = function () {
  return 10;
};
assert('同毫秒仍递增', halfCourseEdit.nextSaveToken(10) === 11);
Date.now = frozen;

var failJob = {
  policy: 'restore',
  gameId: 'g-edit-1',
  beforeGame: JSON.parse(JSON.stringify(afterFail)),
  expectedUpdatedAt: 999999,
  matchStateSnap: { gameId: 'g-edit-1', fromFlow: 'stale-proj', groupIndex: 0 },
  layoutSnap: {
    holePars: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
    columnLabels: [],
    columnPars: [],
    front9Key: 'X',
    back9Key: 'Y',
    specialIdx: [9, 19, 20]
  }
};
gameStore.saveGame(
  Object.assign({}, afterFail, {
    roundName: '并发写入',
    updatedAt: 888,
    courseId: 'c-honghua',
    front9Course: 'C',
    back9Course: 'D'
  })
);
var conflictOut = halfCourseEdit.runGameSaveRollback(failJob);
var conflictOut2 = halfCourseEdit.runGameSaveRollback(failJob);
assert(
  '编辑冲突不写回旧比赛',
  gameStore.getGame('g-edit-1').roundName === '并发写入' &&
    gameStore.getGame('g-edit-1').updatedAt === 888
);
assert('编辑冲突 outcome=conflict', conflictOut.outcome === 'conflict' && conflictOut2.outcome === 'conflict');
assert(
  '编辑冲突不恢复旧 projection',
  (matchStateUtil.getMatchState() || {}).fromFlow !== 'stale-proj' &&
    holeLayout.getLayout().front9Key !== 'X'
);
assert(
  '编辑冲突投影对齐最新比赛',
  (matchStateUtil.getMatchState() || {}).course.roundName === '并发写入' &&
    holeLayout.getLayout().front9Key === 'C' &&
    holeLayout.getLayout().back9Key === 'D'
);

bag = {};
resetUi();
seedEditGame();
applyCdLayout();
matchStateUtil.setMatchState({
  gameId: 'g-edit-1',
  fromFlow: 'pre-edit',
  course: { front9Course: 'C', back9Course: 'D' }
});
page = bindPage();
page._initEditMode('g-edit-1');
page.setData({
  roundName: '新题目',
  courseId: 'c-qhw',
  courseName: '北京清河湾高尔夫乡村俱乐部 A&B',
  front9Course: 'A',
  back9Course: 'B'
});
failHoleSync();
page._doUpdate();
restoreHoleSync();
resetUi();
page._doUpdate();
flushTimers();
var afterOk = gameStore.getGame('g-edit-1');
assert('_doUpdate 重试成功已保存', toasts.indexOf('已保存') >= 0);
assert('_doUpdate 重试成功导航', navs.indexOf('back') >= 0);
assert(
  '_doUpdate 成功写入新球场且保留成绩',
  afterOk.roundName === '新题目' &&
    afterOk.courseId === 'c-qhw' &&
    afterOk.front9Course === 'A' &&
    afterOk.groups[0].scoresByPlayer.me.scores[0] === 4 &&
    afterOk.groups[0].playersSlots[1].name === 'A'
);
assert(
  '_doUpdate 成功才刷新 matchState',
  (matchStateUtil.getMatchState() || {}).fromFlow !== 'pre-edit'
);

bag = {};
resetUi();
applyCdLayout();
matchStateUtil.setMatchState({
  gameId: 'g-other',
  fromFlow: 'other-match',
  course: { front9Course: 'C', back9Course: 'D' }
});
page = bindPage();
makeCreateForm(page);
failHoleSync();
page._doStart();
assert('_doStart 失败 toast 创建/洞序', toasts.indexOf('洞序同步失败') >= 0 || toasts.indexOf('创建失败') >= 0);
assert('_doStart 失败不导航', navs.length === 0);
assert('_doStart 解锁可重试', page._startNavLock === false);
assert('_doStart 删除本次 gameId', gameStore.listGames().length === 0);
assert('_doStart 页面保留表单', page.data.roundName === '新建标题');
assert(
  '_doStart 恢复他人 matchState',
  (matchStateUtil.getMatchState() || {}).gameId === 'g-other'
);
assert('_doStart 恢复 holeLayout', holeLayout.getLayout().front9Key === 'C');

halfCourseEdit.runGameSaveRollback({
  policy: 'delete',
  gameId: 'g-missing',
  matchStateSnap: matchStateUtil.getMatchState(),
  layoutSnap: {
    holePars: holeLayout.getLayout().holePars.slice(),
    columnLabels: [],
    columnPars: [],
    front9Key: 'C',
    back9Key: 'D',
    specialIdx: [9, 19, 20]
  }
});
assert('删除回滚幂等不造第二场', gameStore.listGames().length === 0);

restoreHoleSync();
resetUi();
page._doStart();
var created = gameStore.listGames().slice();
var createdId = created[0] && created[0].gameId;
var createdToken = created[0] && created[0].updatedAt;
assert('_doStart 重试成功仅一场', created.length === 1 && created[0].roundName === '新建标题');
assert('_doStart 成功有半场', created[0].front9Course === 'A' && created[0].back9Course === 'B');
assert('_doStart 成功导航', navs.length > 0);
assert('_doStart 成功无创建失败 toast', toasts.indexOf('创建失败') < 0 && toasts.indexOf('洞序同步失败') < 0);

var other = {
  gameId: 'g-keep',
  courseId: 'c-qhw',
  courseName: '北京清河湾高尔夫乡村俱乐部 A&B',
  roundName: '保留场',
  gameMode: '个人比杆赛',
  groups: [{ groupId: 'g1', playersSlots: [{ playerId: 'me', name: 'Ken' }], scoresByPlayer: {} }],
  createdAt: 2
};
gameStore.saveGame(other);
halfCourseEdit.runGameSaveRollback({
  policy: 'delete',
  gameId: createdId,
  expectedUpdatedAt: createdToken,
  matchStateSnap: matchStateUtil.getMatchState(),
  layoutSnap: {
    holePars: (holeLayout.getLayout().holePars || []).slice(),
    columnLabels: [],
    columnPars: [],
    front9Key: holeLayout.getLayout().front9Key,
    back9Key: holeLayout.getLayout().back9Key,
    specialIdx: [9, 19, 20]
  }
});
assert(
  '删除只针对本次 gameId',
  !!createdId && !gameStore.getGame(createdId) && !!gameStore.getGame('g-keep')
);

// --- 故障注入：洞序重建成功后后续 layout 抛错 ---
bag = {};
resetUi();
restoreHoleSync();
seedEditGame();
applyCdLayout();
matchStateUtil.setMatchState({
  gameId: 'g-edit-1',
  fromFlow: 'pre-edit',
  groupIndex: 0,
  course: { front9Course: 'C', back9Course: 'D' }
});
bag[rebuild.SETTINGS_KEY] = {};
bag[rebuild.SETTINGS_KEY]['g-edit-1::score'] = {
  createdHoleOrder: nines('C', 'D'),
  fullHoleOrder: nines('C', 'D'),
  holeOrder: nines('C', 'D'),
  fullHoleOrderRevision: 3
};
page = bindPage();
page._initEditMode('g-edit-1');
page.setData({
  roundName: '新题目',
  courseId: 'c-qhw',
  courseName: '北京清河湾高尔夫乡村俱乐部 A&B',
  front9Course: 'A',
  back9Course: 'B'
});
global.__throwOnLayout = true;
page._doUpdate();
global.__throwOnLayout = false;
var afterThrow = gameStore.getGame('g-edit-1');
assert('后续步骤抛错回滚旧比赛', afterThrow && afterThrow.roundName === '旧题目' && afterThrow.front9Course === 'C');
assert('后续步骤抛错恢复旧洞序设置', (settingsOf('g-edit-1').fullHoleOrder || []).join(',') === nines('C', 'D').join(','));
assert('后续步骤抛错恢复 layout', holeLayout.getLayout().front9Key === 'C');
assert('后续步骤抛错无已保存', toasts.indexOf('已保存') < 0 && navs.length === 0);

// --- 洞序设置已更新后抛错（同上路径，断言 settings 曾被改过再恢复）---
assert('side-game 设置已更新后仍回滚', settingsOf('g-edit-1').fullHoleOrderRevision === 3);

// --- 页面级：编辑回滚前并发更新 ---
bag = {};
resetUi();
seedEditGame();
applyCdLayout();
matchStateUtil.setMatchState({
  gameId: 'g-edit-1',
  fromFlow: 'pre-edit',
  groupIndex: 0,
  course: { front9Course: 'C', back9Course: 'D', roundName: '旧题目' }
});
page = bindPage();
page._initEditMode('g-edit-1');
page.setData({
  roundName: '新题目',
  courseId: 'c-qhw',
  courseName: '北京清河湾高尔夫乡村俱乐部 A&B',
  front9Course: 'A',
  back9Course: 'B'
});
rebuild.syncAfterCourseHalfChange = function () {
  var cur = gameStore.getGame('g-edit-1');
  gameStore.saveGame(
    Object.assign({}, cur, {
      roundName: '并发页面',
      updatedAt: Number(cur.updatedAt) + 50,
      courseId: 'c-honghua',
      courseName: '北京清河湾乡村高尔夫俱乐部C&D',
      front9Course: 'C',
      back9Course: 'D'
    })
  );
  return { ok: false, message: '洞序同步失败' };
};
page._doUpdate();
restoreHoleSync();
assert('并发冲突提示不是洞序失败', toasts.indexOf('比赛数据已更新，请重新进入后再试') >= 0);
assert('并发冲突不提示洞序同步失败', toasts.indexOf('洞序同步失败') < 0);
assert('并发冲突不写回旧比赛', gameStore.getGame('g-edit-1').roundName === '并发页面');
assert(
  '并发后 matchState/layout 对齐最新',
  (matchStateUtil.getMatchState() || {}).course.roundName === '并发页面' &&
    holeLayout.getLayout().front9Key === 'C'
);
assert('并发冲突不导航', navs.length === 0 && toasts.indexOf('已保存') < 0);
assert('conflict 后锁提交', page._submitBlockedReason === 'conflict');
resetUi();
page.onStart();
page._doUpdate();
assert(
  'conflict 后再次保存被拦截',
  toasts.indexOf('比赛数据已更新，请重新进入后再试') >= 0 &&
    toasts.indexOf('已保存') < 0 &&
    navs.length === 0 &&
    gameStore.getGame('g-edit-1').roundName === '并发页面'
);

// --- 新建失败删除前记录被更新 ---
bag = {};
resetUi();
applyCdLayout();
matchStateUtil.setMatchState({
  gameId: 'g-other',
  fromFlow: 'other-match',
  course: { front9Course: 'C', back9Course: 'D' }
});
page = bindPage();
makeCreateForm(page);
rebuild.syncAfterCourseHalfChange = function () {
  var list = gameStore.listGames();
  var g = list[0];
  gameStore.saveGame(
    Object.assign({}, g, { roundName: '已被认领', updatedAt: Number(g.updatedAt) + 7 })
  );
  return { ok: false, message: '洞序同步失败' };
};
page._doStart();
restoreHoleSync();
assert('新建冲突不误删', gameStore.listGames().length === 1 && gameStore.listGames()[0].roundName === '已被认领');
assert('新建冲突提示重新进入', toasts.indexOf('比赛数据已更新，请重新进入后再试') >= 0);
assert('新建冲突不导航', navs.length === 0);

// --- 回滚自身失败 ---
bag = {};
resetUi();
seedEditGame();
applyCdLayout();
matchStateUtil.setMatchState({
  gameId: 'g-edit-1',
  fromFlow: 'pre-edit',
  course: { front9Course: 'C', back9Course: 'D' }
});
page = bindPage();
page._initEditMode('g-edit-1');
page.setData({
  roundName: '新题目',
  courseId: 'c-qhw',
  courseName: '北京清河湾高尔夫乡村俱乐部 A&B',
  front9Course: 'A',
  back9Course: 'B'
});
failHoleSync();
global.__blockOldRestore = true;
gameStore.saveGame = function (g) {
  if (global.__blockOldRestore && g && g.roundName === '旧题目') throw new Error('restore boom');
  return origSaveGame(g);
};
page._doUpdate();
restoreSaveGame();
restoreHoleSync();
assert('回滚失败提示未能完成', toasts.indexOf('保存未能完成，请重新进入页面后再试') >= 0);
assert('回滚失败不显示成功', toasts.indexOf('已保存') < 0);
assert('回滚失败不导航', navs.length === 0);
assert('rollbackFailed 后锁提交', page._submitBlockedReason === 'rollbackFailed');
resetUi();
page.onStart();
page._doUpdate();
assert(
  'rollbackFailed 后再次保存被拦截',
  toasts.indexOf('保存未能完成，请重新进入页面后再试') >= 0 &&
    toasts.indexOf('已保存') < 0 &&
    navs.length === 0
);
var lockedPage = page;
var freshPage = bindPage();
assert('新页面实例默认无提交锁', !freshPage._submitBlockedReason);
lockedPage.onLoad({ mode: 'edit', gameId: 'g-edit-1' });
assert('重新进入 onLoad 清除提交锁', !lockedPage._submitBlockedReason);

// --- 重复回滚幂等（已恢复）---
bag = {};
var owned = seedEditGame();
owned.updatedAt = 20;
origSaveGame(Object.assign({}, owned, { roundName: '新题目', updatedAt: 20, front9Course: 'A' }));
var rbJob = {
  policy: 'restore',
  gameId: 'g-edit-1',
  beforeGame: Object.assign({}, owned, { roundName: '旧题目', updatedAt: 10, front9Course: 'C', back9Course: 'D' }),
  expectedUpdatedAt: 20,
  matchStateSnap: { gameId: 'g-edit-1', fromFlow: 'pre' },
  layoutSnap: {
    holePars: holeLayout.getLayout().holePars.slice(),
    columnLabels: [],
    columnPars: [],
    front9Key: 'C',
    back9Key: 'D',
    specialIdx: [9, 19, 20]
  }
};
var rb1 = halfCourseEdit.runGameSaveRollback(rbJob);
var rb2 = halfCourseEdit.runGameSaveRollback(rbJob);
assert('首次回滚 rolledBack', rb1.outcome === 'rolledBack' && gameStore.getGame('g-edit-1').roundName === '旧题目');
assert('重复回滚仍幂等', rb2.outcome === 'rolledBack' && gameStore.getGame('g-edit-1').roundName === '旧题目');

Date.now = origDateNow;
restoreHoleSync();
restoreLayout();
restoreSaveGame();

console.log('\nnormalCreateHalfCourseRollback.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
