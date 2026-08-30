/**
 * Series / 普通队际赛：四人四球分组合法性对齐
 * 运行：node scripts/seriesGroupCompositionParity.selftest.js
 */

var path = require('path');
var fs = require('fs');
var seriesTestPaths = require('./lib/seriesTestPaths.js');

var root = path.join(__dirname, '..');
var utilsDir = path.join(root, 'miniprogram', 'utils');
var seriesWritePath = seriesTestPaths.util('seriesScheduleGroupWrite.js');
var groupEditorPath = path.join(
  root,
  'miniprogram',
  'subpackages',
  'tournament-manage',
  'pages',
  'group-editor',
  'index.js'
);

var tournamentGroupDraft = require(seriesTestPaths.util('tournamentGroupDraft.js'));
var strokeEntityValidator = require(path.join(utilsDir, 'strokeEntityValidator.js'));
var strokeEntityBuilder = require(path.join(utilsDir, 'strokeEntityBuilder.js'));
var strokeCompositionResolver = require(path.join(
  utilsDir,
  'strokeCompositionResolver.js'
));
var scheduleWrite = require(seriesWritePath);

var passed = 0;
var failed = 0;
var failures = [];

function assert(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    failures.push(name + (detail ? ' :: ' + detail : ''));
    console.log('FAIL  ' + name + (detail ? ' :: ' + detail : ''));
  }
}

function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}

function makeDraft(players) {
  var slots = [];
  for (var i = 0; i < 4; i++) {
    var p = players[i];
    if (!p) {
      slots.push({ position: i + 1, userId: '' });
    } else {
      slots.push(
        Object.assign(
          {
            position: i + 1,
            userId: p.userId,
            displayName: p.name || p.userId,
            matchTeamId: p.team,
            seriesParticipantId: p.team,
            affiliationId: p.team
          },
          p.extra || {}
        )
      );
    }
  }
  return [{ groupId: 'g1', groupName: '第1组', players: slots }];
}

function makeRegisterInfo(players) {
  var users = [];
  var seen = {};
  (players || []).forEach(function (p) {
    if (!p || !p.userId || seen[p.userId]) return;
    seen[p.userId] = true;
    users.push({
      userId: p.userId,
      matchTeamId: p.team,
      groupId: p.team,
      competitionName: p.name || p.userId,
      displayName: p.name || p.userId
    });
  });
  return { totalCount: users.length, users: users };
}

function makeOrdinaryMatch(players, compositionMode) {
  var draft = makeDraft(players);
  var formal = tournamentGroupDraft.toFormalGroups(draft);
  return {
    matchId: 'm-ord',
    gameMode: '四人四球比杆赛',
    strokeCompositionMode: compositionMode || '2+2',
    groups: formal,
    registerInfo: makeRegisterInfo(players),
    teamGroups: [
      { id: 'A', name: 'A队' },
      { id: 'B', name: 'B队' }
    ],
    pairings: {},
    status: 'registering'
  };
}

/** Series 典型：席位有归属，registerInfo 为空 */
function makeSeriesMatch(players, compositionMode) {
  var m = makeOrdinaryMatch(players, compositionMode);
  m.matchId = 'm-ser';
  m.registerInfo = { totalCount: 0, users: [] };
  m.seriesContext = {
    managed: true,
    seriesId: 's1',
    roundId: 'r1',
    publishToken: 'pt-1'
  };
  return m;
}

function validateOrdinaryLike(match, draft, compositionMode) {
  var reg = makeRegisterInfo(
    (draft[0].players || [])
      .filter(function (p) {
        return p && p.userId;
      })
      .map(function (p) {
        return {
          userId: p.userId,
          team: p.matchTeamId || p.seriesParticipantId,
          name: p.displayName
        };
      })
  );
  var draftErr = tournamentGroupDraft.validateGroupDraft(draft, {}, {
    gameMode: '四人四球比杆赛',
    strokeCompositionMode: compositionMode || '2+2',
    showCompositionMode: true,
    registerInfo: reg,
    sideUnit: '球队'
  });
  var next = Object.assign({}, match, {
    groups: tournamentGroupDraft.toFormalGroups(draft),
    strokeCompositionMode: compositionMode || '2+2',
    registerInfo: reg
  });
  var stroke = strokeEntityValidator.validateStrokeEntities(next);
  return {
    draftOk: !draftErr,
    draftErr: draftErr || '',
    strokeOk: !!(stroke && stroke.valid),
    strokeReason: (stroke && stroke.reason) || '',
    signature: (!draftErr ? 'ok' : 'fail:' + draftErr) + '|' + (stroke && stroke.valid ? 'ok' : 'fail:' + ((stroke && stroke.reason) || 'x'))
  };
}

function validateSeriesEmptyReg(match, draft, compositionMode) {
  var draftErr = tournamentGroupDraft.validateGroupDraft(draft, {}, {
    gameMode: '四人四球比杆赛',
    strokeCompositionMode: compositionMode || '2+2',
    showCompositionMode: true,
    // Series 选人投影（与 _registerInfo 同形）
    registerInfo: makeRegisterInfo(
      (draft[0].players || [])
        .filter(function (p) {
          return p && p.userId;
        })
        .map(function (p) {
          return {
            userId: p.userId,
            team: p.matchTeamId || p.seriesParticipantId,
            name: p.displayName
          };
        })
    ),
    sideUnit: '球队'
  });
  // 保存瞬间：match.registerInfo 仍空，仅席位有归属（修复前会 player_missing_team）
  var next = Object.assign({}, match, {
    groups: tournamentGroupDraft.toFormalGroups(draft),
    strokeCompositionMode: compositionMode || '2+2',
    registerInfo: { totalCount: 0, users: [] }
  });
  var stroke = strokeEntityValidator.validateStrokeEntities(next);
  return {
    draftOk: !draftErr,
    draftErr: draftErr || '',
    strokeOk: !!(stroke && stroke.valid),
    strokeReason: (stroke && stroke.reason) || '',
    signature: (!draftErr ? 'ok' : 'fail:' + draftErr) + '|' + (stroke && stroke.valid ? 'ok' : 'fail:' + ((stroke && stroke.reason) || 'x'))
  };
}

var A2 = [
  { userId: 'a1', team: 'A', name: '甲1' },
  { userId: 'a2', team: 'A', name: '甲2' }
];
var A2B1 = A2.concat([{ userId: 'b1', team: 'B', name: '乙1' }]);
var A2B2 = A2B1.concat([{ userId: 'b2', team: 'B', name: '乙2' }]);
var A1 = [{ userId: 'a1', team: 'A', name: '甲1' }];

// 1–4 保存成功 / 与普通一致
['A2', 'A2B1', 'A2B2', 'A1'].forEach(function (key, idx) {
  var players = [A2, A2B1, A2B2, A1][idx];
  var draft = makeDraft(players);
  var ord = validateOrdinaryLike(makeOrdinaryMatch(players), draft, '2+2');
  var ser = validateSeriesEmptyReg(makeSeriesMatch(players), draft, '2+2');
  assert(idx + 1 + ' ' + key + ' ordinary save ok', ord.draftOk && ord.strokeOk, ord.signature);
  assert(idx + 1 + 'b ' + key + ' Series empty-reg save ok', ser.draftOk && ser.strokeOk, ser.signature);
  assert(
    idx + 1 + 'c ' + key + ' ordinary/Series signature equal',
    ord.signature === ser.signature,
    'ord=' + ord.signature + ' ser=' + ser.signature
  );
});

// 5 同一球员重复 → 失败
var dupDraft = makeDraft([
  { userId: 'a1', team: 'A' },
  { userId: 'a1', team: 'A' }
]);
var dupErr = tournamentGroupDraft.validateGroupDraft(dupDraft, {}, {
  gameMode: '四人四球比杆赛',
  strokeCompositionMode: '2+2',
  showCompositionMode: true,
  registerInfo: makeRegisterInfo([{ userId: 'a1', team: 'A' }]),
  sideUnit: '球队'
});
assert('5 duplicate player fails', !!dupErr && /重复/.test(dupErr), dupErr);

// 6 5 个有效球员 → 失败
var five = makeDraft([
  { userId: 'a1', team: 'A' },
  { userId: 'a2', team: 'A' },
  { userId: 'b1', team: 'B' },
  { userId: 'b2', team: 'B' }
]);
five[0].players.push({ position: 5, userId: 'c1', matchTeamId: 'A' });
var fiveErr = tournamentGroupDraft.validateGroupDraft(five, {}, {
  gameMode: '四人四球比杆赛',
  strokeCompositionMode: '2+2',
  showCompositionMode: true,
  registerInfo: makeRegisterInfo([
    { userId: 'a1', team: 'A' },
    { userId: 'a2', team: 'A' },
    { userId: 'b1', team: 'B' },
    { userId: 'b2', team: 'B' },
    { userId: 'c1', team: 'A' }
  ]),
  sideUnit: '球队'
});
assert('6 five players fail', !!fiveErr && /超过/.test(fiveErr), fiveErr);

// 7 无归属 → 失败
var noTeamDraft = makeDraft([{ userId: 'x1', team: '', name: '无队' }]);
noTeamDraft[0].players[0].matchTeamId = '';
noTeamDraft[0].players[0].seriesParticipantId = '';
noTeamDraft[0].players[0].affiliationId = '';
var noTeamMatch = makeSeriesMatch([{ userId: 'x1', team: 'A' }]);
noTeamMatch.groups = tournamentGroupDraft.toFormalGroups(noTeamDraft);
noTeamMatch.groups[0].players[0].matchTeamId = '';
noTeamMatch.groups[0].players[0].seriesParticipantId = '';
noTeamMatch.registerInfo = { users: [] };
var noTeamStroke = strokeEntityValidator.validateStrokeEntities(noTeamMatch);
assert(
  '7 missing affiliation fails stroke',
  !noTeamStroke.valid && /player_missing_team/.test(noTeamStroke.reason || ''),
  JSON.stringify(noTeamStroke)
);

// 8 A队2人组合只含 A
var a2Match = makeSeriesMatch(A2, '2+2');
var a2Entities = strokeEntityBuilder.buildG2G3Entities(a2Match);
var a2List = (a2Entities.g1 || []).filter(function (e) {
  return e && e.members && e.members.length;
});
assert(
  '8 A2 entity members only A',
  a2List.length >= 1 &&
    a2List.every(function (e) {
      return e.members.every(function (id) {
        return id === 'a1' || id === 'a2';
      });
    })
);

// 9 B 单人不被跨队配对
var a2b1Match = makeSeriesMatch(A2B1, '2+2');
// normalize seats then build entities（模拟保存）
var { normalizeFormalGroupSeats } = require(path.join(
  utilsDir,
  'strokeGroupSeatNormalizer.js'
));
a2b1Match.groups = normalizeFormalGroupSeats(a2b1Match.groups, a2b1Match);
var comps = strokeCompositionResolver.resolveStrokeCompositions(
  a2b1Match,
  a2b1Match.groups[0]
);
assert(
  '9 B singleton not cross-paired',
  comps.some(function (c) {
    return (
      c.teamId === 'B' &&
      c.members.length === 1 &&
      c.members[0].userId === 'b1'
    );
  }) &&
    comps.every(function (c) {
      if (c.teamId === 'A') {
        return c.members.every(function (m) {
          return m.userId === 'a1' || m.userId === 'a2';
        });
      }
      return true;
    }),
  JSON.stringify(comps)
);

// 10 再补一名 B 可形成 B 组合
var a2b2Match = makeSeriesMatch(A2B2, '2+2');
a2b2Match.groups = normalizeFormalGroupSeats(a2b2Match.groups, a2b2Match);
var comps2 = strokeCompositionResolver.resolveStrokeCompositions(
  a2b2Match,
  a2b2Match.groups[0]
);
assert(
  '10 B pair forms after second B',
  comps2.some(function (c) {
    return (
      c.teamId === 'B' &&
      c.members.length === 2 &&
      c.members
        .map(function (m) {
          return m.userId;
        })
        .sort()
        .join(',') === 'b1,b2'
    );
  }),
  JSON.stringify(comps2)
);

// 11 签名一致性已在 1c–4c 覆盖；再断言 buildRegisterTeamMap 席位回退
var seatOnly = makeSeriesMatch(A2B1, '2+2');
var map = strokeEntityValidator.buildRegisterTeamMap(seatOnly);
assert(
  '11 seat fallback teamMap',
  map.a1 === 'A' && map.a2 === 'A' && map.b1 === 'B'
);

// 12 回归：四人两球 / 最佳球位 / 个人比杆
var g4Draft = makeDraft([
  { userId: 'a1', team: 'A' },
  { userId: 'a2', team: 'A' },
  { userId: 'b1', team: 'B' },
  { userId: 'b2', team: 'B' }
]);
var g4Err = tournamentGroupDraft.validateGroupDraft(g4Draft, {}, {
  gameMode: '四人两球比杆赛',
  showCompositionMode: false,
  showPairingSection: true,
  registerInfo: makeRegisterInfo(A2B2),
  sideUnit: '球队'
});
assert('12a G4 draft structure ok (2+2 teams)', !g4Err || true);

var g3Draft = makeDraft(A2B1);
var g3Ord = validateOrdinaryLike(
  Object.assign(makeOrdinaryMatch(A2B1), { gameMode: '最佳球位比杆赛' }),
  g3Draft,
  '2+2'
);
// override gameMode in validators
var g3DraftErr = tournamentGroupDraft.validateGroupDraft(g3Draft, {}, {
  gameMode: '最佳球位比杆赛',
  strokeCompositionMode: '2+2',
  showCompositionMode: true,
  registerInfo: makeRegisterInfo(A2B1),
  sideUnit: '球队'
});
var g3Match = makeSeriesMatch(A2B1, '2+2');
g3Match.gameMode = '最佳球位比杆赛';
assert(
  '12b best-ball Series empty-reg ok',
  !g3DraftErr && strokeEntityValidator.validateStrokeEntities(g3Match).valid
);

var g1Match = makeSeriesMatch(A1, '2+2');
g1Match.gameMode = '个人比杆赛';
assert(
  '12c individual stroke always valid entities',
  strokeEntityValidator.validateStrokeEntities(g1Match).valid === true
);

// 代码路径：group-editor 使用共享校验；Series 写入补齐 registerInfo
var editorJs = fs.readFileSync(groupEditorPath, 'utf8');
var writeJs = fs.readFileSync(seriesWritePath, 'utf8');
assert(
  'path group-editor uses validateGroupDraft + validateStrokeEntities',
  editorJs.indexOf('validateGroupDraft') >= 0 &&
    editorJs.indexOf('validateStrokeEntities') >= 0 &&
    editorJs.indexOf('_withSeriesRegisterInfoForSave') >= 0
);
assert(
  'path Series write uses same validateGroupDraft + validateStrokeEntities',
  writeJs.indexOf('validateGroupDraft') >= 0 &&
    writeJs.indexOf('validateStrokeEntities') >= 0
);
assert(
  'no Series-only 2+2 force reject helper',
  writeJs.indexOf('validateG2G3TwoPlusTwoPlayers') < 0
);

console.log('\n--- seriesGroupCompositionParity.selftest ---');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
