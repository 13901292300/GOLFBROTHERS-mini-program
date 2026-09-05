/**
 * 普通创建四人组个人比杆：新建即补齐半场/Host 洞上下文，不必再走空修改确认。
 * 运行：node scripts/normalCreateSideGameHostInit.selftest.js
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
  },
  showToast: function () {}
};

var gameStore = require('../miniprogram/utils/gameStore.js');
var gameEdit = require('../miniprogram/subpackages/create/utils/gameEdit.js');
var halfCourseEdit = require('../miniprogram/utils/halfCourseEdit.js');
var matchStateUtil = require('../miniprogram/utils/matchState.js');
var scoringSnap = require('../miniprogram/subpackages/scoring/utils/sideGameHostSnapshot.js');
var hostMod = require('../miniprogram/subpackages/game/utils/gameHostContext.js');
var rec = require('../miniprogram/subpackages/game/utils/sideGameRecord.js');
var localMod = require('../miniprogram/subpackages/game/utils/localSideGameRepository.js');
var resultFormat = require('../miniprogram/subpackages/game/utils/resultFormat.js');

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

function scores18(firstHole) {
  var a = [];
  var i;
  for (i = 0; i < 18; i++) a.push(i === 0 ? firstHole : null);
  return a;
}

function makeCreateShapedGame(gameId, halves) {
  var h = halves || {};
  return {
    gameId: gameId,
    courseId: 'c-qhw',
    courseName: '北京清河湾高尔夫乡村俱乐部 A&B',
    courseLocation: '北京 · 昌平',
    front9Course: h.front9Course != null ? h.front9Course : null,
    back9Course: h.back9Course != null ? h.back9Course : null,
    courseHalfText: h.courseHalfText || '',
    teeTime: '2026年05月04日 09:40',
    roundName: 'Ken,A,B,C',
    gameMode: '个人比杆赛',
    groupCompositionMap: {},
    composition: null,
    scoringTemplate: '',
    visibility: 'public',
    accessCode: null,
    playersSlots: [
      { playerId: 'me', name: 'Ken' },
      { playerId: 'p2', name: 'A' },
      { playerId: 'p3', name: 'B' },
      { playerId: 'p4', name: 'C' }
    ],
    groups: [
      {
        groupId: 'grp-1',
        name: '第1组',
        status: 'not_started',
        playersSlots: [
          { playerId: 'me', name: 'Ken' },
          { playerId: 'p2', name: 'A' },
          { playerId: 'p3', name: 'B' },
          { playerId: 'p4', name: 'C' }
        ],
        scoresByPlayer: {
          me: { scores: scores18(4), putts: [] },
          p2: { scores: scores18(5), putts: [] },
          p3: { scores: scores18(null), putts: [] },
          p4: { scores: scores18(null), putts: [] }
        }
      }
    ],
    status: 'active',
    currentRound: 1,
    createdBy: 'me',
    creatorId: 'me',
    creatorGroupIndex: 0,
    creatorInGame: true,
    createdAt: 1
  };
}

function runCreateFinalize(game) {
  var beforeCourse = {
    courseId: game.courseId,
    courseName: game.courseName,
    front9Course: game.front9Course,
    back9Course: game.back9Course,
    courseHalfText: game.courseHalfText
  };
  var halfResolved = gameEdit.resolveHalfCourses(
    game.courseId,
    game.courseName,
    game.front9Course,
    game.back9Course,
    game.courseHalfText
  );
  game.front9Course = halfResolved.front9Course;
  game.back9Course = halfResolved.back9Course;
  game.updatedAt = halfCourseEdit.nextSaveToken(game.updatedAt);
  gameStore.saveGame(game);
  var halfResult = halfCourseEdit.apply(
    {
      gameId: game.gameId,
      mode: 'game',
      courseId: game.courseId,
      courseName: game.courseName,
      front9Course: game.front9Course,
      back9Course: game.back9Course,
      beforeCourse: beforeCourse,
      gameRollback: {
        policy: 'delete',
        gameId: game.gameId,
        expectedUpdatedAt: game.updatedAt
      }
    },
    game.front9Course,
    game.back9Course
  );
  var persisted = gameStore.getGame(game.gameId) || game;
  matchStateUtil.setMatchState(
    Object.assign({}, matchStateUtil.buildFromGame(persisted, 0), {
      fromFlow: 'normalCreate',
      fromPage: 'home'
    })
  );
  return { halfResult: halfResult, game: persisted };
}

function runEmptyConfirm(existing) {
  var form = gameEdit.hydrateCreateFormFromGame(existing);
  var merged = gameEdit.mergeFormWithExistingGame(existing, form);
  var updated = gameEdit.buildUpdatedGame(existing, merged, {});
  var beforeGame = JSON.parse(JSON.stringify(existing));
  updated.updatedAt = halfCourseEdit.nextSaveToken(existing.updatedAt);
  gameStore.saveGame(updated);
  var halfResult = halfCourseEdit.apply(
    {
      gameId: updated.gameId,
      mode: 'game',
      courseId: updated.courseId,
      courseName: updated.courseName,
      front9Course: updated.front9Course,
      back9Course: updated.back9Course,
      beforeCourse: {
        courseId: existing.courseId,
        courseName: existing.courseName,
        front9Course: existing.front9Course,
        back9Course: existing.back9Course,
        courseHalfText: existing.courseHalfText
      },
      gameRollback: {
        policy: 'restore',
        gameId: updated.gameId,
        beforeGame: beforeGame,
        expectedUpdatedAt: updated.updatedAt
      }
    },
    updated.front9Course,
    updated.back9Course
  );
  var persisted = gameStore.getGame(updated.gameId);
  matchStateUtil.setMatchState(matchStateUtil.buildFromGame(persisted, 0));
  return { halfResult: halfResult, game: persisted };
}

function hostOf(game) {
  var snap = scoringSnap.fromGame(game, {
    scope: 'group',
    groupId: game.groups[0].groupId,
    allowBigPot: true,
    matchId: game.gameId
  });
  return hostMod.buildFromHostSnapshot(snap);
}

function pipelineFields(game) {
  var host = hostOf(game);
  var ms = matchStateUtil.getMatchState() || {};
  return {
    matchId: host.matchId,
    groupId: host.groupId,
    scope: host.scope,
    front9Course: game.front9Course || null,
    back9Course: game.back9Course || null,
    courseHalfText: game.courseHalfText || '',
    holeContextReady: !!host.holeContextReady,
    holeOrder: (host.holeOrder || []).join(','),
    playerIds: (host.players || [])
      .map(function (p) {
        return p.playerId;
      })
      .join(','),
    partyIds: (host.scoreParties || [])
      .map(function (p) {
        return p.partyId;
      })
      .join(','),
    matchStateFront9: (ms.course && ms.course.front9Course) || null,
    matchStateBack9: (ms.course && ms.course.back9Course) || null
  };
}

function firstDiff(a, b) {
  var keys = [
    'front9Course',
    'back9Course',
    'courseHalfText',
    'holeContextReady',
    'holeOrder',
    'matchStateFront9',
    'matchStateBack9',
    'matchId',
    'groupId',
    'scope',
    'playerIds',
    'partyIds'
  ];
  var i;
  for (i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (String(a[k]) !== String(b[k])) return { key: k, a: a[k], b: b[k] };
  }
  return null;
}

var createSrc = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/create/pages/normal/index.js'),
  'utf8'
);

assert(
  '_doStart 复用 resolveHalfCourses',
  /_doStart[\s\S]*gameEdit\.resolveHalfCourses/.test(createSrc)
);
assert(
  '_doStart 复用 halfCourseEdit.apply',
  /_doStart[\s\S]*halfCourseEdit\.apply/.test(createSrc)
);
assert(
  '_doStart 复用 buildFromGame',
  /_doStart[\s\S]*matchStateUtil\.buildFromGame/.test(createSrc)
);
assert(
  '_doUpdate 仍走 halfCourseEdit.apply',
  /_doUpdate[\s\S]*halfCourseEdit\.apply/.test(createSrc)
);

bag = {};
var legacy = makeCreateShapedGame('g-legacy');
gameStore.saveGame(legacy);
matchStateUtil.setMatchState(matchStateUtil.buildFromGame(legacy, 0));
var fieldsA = pipelineFields(legacy);
var emptyB = runEmptyConfirm(gameStore.getGame('g-legacy'));
var fieldsB = pipelineFields(emptyB.game);
var ab = firstDiff(fieldsA, fieldsB);

assert('A 新建未补半场时 holeContextReady=false', fieldsA.holeContextReady === false);
assert('A 缺 front9Course', fieldsA.front9Course == null);
assert('B 空修改确认后 holeContextReady=true', fieldsB.holeContextReady === true);
assert(
  'A/B 第一个关键字段是 front9Course',
  ab && ab.key === 'front9Course',
  ab ? JSON.stringify(ab) : 'no-diff'
);
assert('空修改确认补写半场来自 resolveHalfCourses+apply', emptyB.halfResult && emptyB.halfResult.ok !== false);
assert('B 的 front9Course 已写入', fieldsB.front9Course === 'A');
assert('B 的 back9Course 已写入', fieldsB.back9Course === 'B');

bag = {};
var created = makeCreateShapedGame('g-fixed');
var fin = runCreateFinalize(created);
var fieldsCreate = pipelineFields(fin.game);
assert('新建完成 holeContextReady=true', fieldsCreate.holeContextReady === true);
assert('新建完成写入 front9Course', fin.game.front9Course === 'A');
assert('新建完成写入 back9Course', fin.game.back9Course === 'B');
assert('apply 成功', fin.halfResult && fin.halfResult.ok !== false);

var afterEmpty = runEmptyConfirm(gameStore.getGame('g-fixed'));
var fieldsAfterEmpty = pipelineFields(afterEmpty.game);
assert(
  '空修改确认前后半场一致',
  fieldsCreate.front9Course === fieldsAfterEmpty.front9Course &&
    fieldsCreate.back9Course === fieldsAfterEmpty.back9Course &&
    fieldsCreate.holeOrder === fieldsAfterEmpty.holeOrder &&
    fieldsCreate.holeContextReady === fieldsAfterEmpty.holeContextReady
);

var hostReady = hostOf(fin.game);
assert('Host 洞序 18', hostReady.holeOrder && hostReady.holeOrder.length === 18);
var meHoles = hostReady.officialScoresByPartyId.me && hostReady.officialScoresByPartyId.me.holes;
assert('已记分洞有成绩', meHoles && meHoles[hostReady.holeOrder[0]] && meHoles[hostReady.holeOrder[0]].score === 4);
assert(
  '未记分洞为 null 不伪造 0',
  meHoles && meHoles[hostReady.holeOrder[1]] && meHoles[hostReady.holeOrder[1]].score == null
);
var pendingCell = resultFormat.formatBoardCell({
  inGame: true,
  played: false,
  raw: null
});
var zeroCell = resultFormat.formatBoardCell({
  inGame: true,
  played: true,
  raw: 0
});
assert('未记分展示为空', pendingCell.text === '' && pendingCell.status === 'pending');
assert('已结算 0 才显示 0', zeroCell.text === '0' && zeroCell.status === 'settled');

var repo = localMod.createLocalSideGameRepository({
  storage: {
    getItem: function (key) {
      return bag[key];
    },
    setItem: function (key, value) {
      bag[key] = JSON.parse(JSON.stringify(value));
      return true;
    }
  },
  idGen: function () {
    return 'sg_stroke_1';
  },
  clock: function () {
    return 2;
  }
});
var createdRow = repo.create({
  matchId: 'g-fixed',
  groupId: 'grp-1',
  scope: 'group',
  ruleId: 'stroke-2',
  ruleSnapshot: rec.mergeRuleSnapshot(rec.buildRuleSnapshot('stroke-2'), { reward: 'none' }),
  title: '个人比杆小游戏',
  participantParties: [
    { partyId: 'me', partyType: 'player', memberPlayerIds: ['me'] },
    { partyId: 'p2', partyType: 'player', memberPlayerIds: ['p2'] }
  ],
  config: rec.emptyConfig(),
  visibility: 'public',
  hostContext: hostReady,
  idempotencyKey: 'create_stroke'
});
assert('可直接创建游戏实例', createdRow.ok, createdRow.reason);
var settled = repo.refreshResult('sg_stroke_1', hostReady);
assert(
  '新建后直接记分即可结算',
  settled.ok && settled.data && settled.data.resultSnapshot,
  settled.reason
);
var reenter = hostOf(gameStore.getGame('g-fixed'));
assert('重读 store 后 holeContextReady 仍为 true', reenter.holeContextReady === true);

console.log('\nnormalCreateSideGameHostInit.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
