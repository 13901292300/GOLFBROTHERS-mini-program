/**
 * 更换半场：按更换前杆差换算总杆。
 * 运行：node scripts/halfCourseScoreConvert.selftest.js
 */

var convert = require('../miniprogram/utils/halfCourseScoreConvert.js');
var holeLayout = require('../miniprogram/utils/holeLayout.js');
var courseDatabase = require('../miniprogram/utils/courseDatabase.js');
var fs = require('fs');
var path = require('path');

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

var src = fs.readFileSync(
  path.join(__dirname, '../miniprogram/utils/halfCourseScoreConvert.js'),
  'utf8'
);
assert('convert 不依赖 holePuttRules', src.indexOf('holePuttRules') < 0);
assert('convert 无 require', !/\brequire\s*\(/.test(src));

var course = courseDatabase.COURSE_DB && courseDatabase.COURSE_DB[0];
if (!course) {
  course = {
    courseId: 'BJCC_GOLF_001',
    courseName: '北京乡村高尔夫俱乐部',
    halfCourses: [
      { code: 'A', par: [4, 5, 3, 4, 4, 4, 3, 5, 4] },
      { code: 'D', par: [4, 3, 4, 5, 4, 3, 4, 4, 5] },
      { code: 'B', par: [4, 4, 3, 5, 4, 4, 3, 4, 5] }
    ]
  };
}

function pars(front, back) {
  return holeLayout.buildHoleLayout(course, front, back).holePars;
}

assert('PAR 4 且 +1 → 新 PAR 5 为 6', convert.convertStrokes(5, 4, 5) === 6);
assert('PAR 5 且 -1 → 新 PAR 4 为 3', convert.convertStrokes(4, 5, 4) === 3);
assert('PAR 3 平标准杆 → 新 PAR 4 为 4', convert.convertStrokes(3, 3, 4) === 4);
assert('老鹰 PAR5/3 → PAR4 为 2', convert.convertStrokes(3, 5, 4) === 2);
assert('oldDiff 保持：5-4+5 === 6', convert.convertStrokes(5, 4, 5) === 5 - 4 + 5);

assert(
  '只换前九',
  convert.affectedHoleIndexes('A', 'B', 'D', 'B').join(',') === '0,1,2,3,4,5,6,7,8'
);
assert(
  '只换后九',
  convert.affectedHoleIndexes('A', 'B', 'A', 'D').join(',') === '9,10,11,12,13,14,15,16,17'
);
assert(
  '两边均变化',
  convert.affectedHoleIndexes('A', 'B', 'D', 'C').join(',') ===
    '0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17'
);
assert('半场未变则不换算', convert.affectedHoleIndexes('A', 'D', 'A', 'D').length === 0);
assert(
  'key 不变但 PAR 变化仍换算该九洞',
  convert.affectedHoleIndexes(
    'A',
    'B',
    'A',
    'B',
    [4, 4, 4, 3, 4, 5, 4, 3, 4, 4, 4, 4, 3, 4, 5, 4, 3, 4],
    [4, 3, 4, 4, 4, 3, 5, 4, 5, 4, 4, 4, 4, 3, 5, 4, 3, 5]
  ).join(',') === '0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17'
);

var oldPars = pars('A', 'B');
var newFront = pars('D', 'B');
var rec = {
  scores: [5, 4, 3, null, '', 8, undefined, 4, 5, 6, 4, 3, 5, 4, 4, 4, 4, 4],
  putts: [2, 1, 0, null, null, 4, null, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2],
  puttsManual: [true, true, true, false, false, true, false, false, false, false, false, false, false, false, false, false, false, false]
};
var frontOnly = convert.convertScoreRecord(
  rec,
  convert.affectedHoleIndexes('A', 'B', 'D', 'B'),
  oldPars,
  newFront,
  'Ken'
);
assert('前九换算成功', frontOnly.ok);
assert('后九未更换保持 6 杆', rec.scores[9] === 6);
assert('第1格 PAR4/+1 随 D 场 PAR4 仍为 5', rec.scores[0] === 5);
assert('第2格 PAR5/-1 → D 场 PAR3 为 2', rec.scores[1] === 2);
assert('第3格 PAR3/平 → D 场 PAR4 为 4', rec.scores[2] === 4);
assert('空成绩不生成成绩', rec.scores[3] == null && rec.scores[4] === '');
assert('已记推杆保留原洞位', rec.putts[0] === 2 && rec.putts[2] === 0);

var bothSides = {
  scores: [5, 4, 3, 4, 4, 4, 3, 5, 4, 6, 4, 4, 4, 4, 4, 4, 4, 4],
  putts: []
};
var bothOk = convert.convertScoreRecord(
  bothSides,
  convert.affectedHoleIndexes('A', 'B', 'D', 'A'),
  pars('A', 'B'),
  pars('D', 'A'),
  'both'
);
assert(
  '两边均变化时前后九都换算',
  bothOk.ok &&
    bothSides.scores[0] === convert.convertStrokes(5, pars('A', 'B')[0], pars('D', 'A')[0]) &&
    bothSides.scores[9] === convert.convertStrokes(6, pars('A', 'B')[9], pars('D', 'A')[9])
);

var parOnly = {
  scores: [5, 4, 4, 4, 4, 4, 4, 4, 4, 6, 4, 4, 4, 4, 4, 4, 4, 4]
};
var oldSameKey = [4, 4, 4, 3, 4, 5, 4, 3, 4, 4, 4, 4, 3, 4, 5, 4, 3, 4];
var newSameKey = [4, 3, 4, 4, 4, 3, 5, 4, 5, 4, 4, 4, 4, 3, 5, 4, 3, 5];
var parOnlyRes = convert.convertScoreRecord(
  parOnly,
  convert.affectedHoleIndexes('A', 'B', 'A', 'B', oldSameKey, newSameKey),
  oldSameKey,
  newSameKey,
  'parOnly'
);
assert(
  'key 不变 PAR 变时第2格按新 PAR 换算',
  parOnlyRes.ok && parOnly.scores[1] === convert.convertStrokes(4, 4, 3)
);

var roundTrip = {
  scores: [5, 4, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5],
  putts: [],
  puttsManual: []
};
var toD = convert.convertScoreRecord(
  roundTrip,
  convert.affectedHoleIndexes('A', 'B', 'D', 'B'),
  pars('A', 'B'),
  pars('D', 'B'),
  'p1'
);
var backA = convert.convertScoreRecord(
  roundTrip,
  convert.affectedHoleIndexes('D', 'B', 'A', 'B'),
  pars('D', 'B'),
  pars('A', 'B'),
  'p1'
);
assert('A→D→A 前九总杆恢复', toD.ok && backA.ok && roundTrip.scores.slice(0, 9).join(',') === '5,4,3,4,4,4,3,5,4');
assert('空 putts 不自动填', roundTrip.putts.length === 0);

var special = { scores: ['NR', 5], putts: [], puttsManual: [] };
convert.convertScoreRecord(special, [0, 1], [4, 4], [5, 5], 'x');
assert('NR / 非数字不转换', special.scores[0] === 'NR' && special.scores[1] === 6);

var tooLow = { scores: [1], putts: [], puttsManual: [] };
var bad = convert.convertScoreRecord(tooLow, [0], [5], [3], '低杆');
assert('score < 1 整次失败', bad.ok === false && /低杆/.test((bad.details || []).join('')));
assert('失败时原总杆保留', tooLow.scores[0] === 1);

var parFail = convert.validatePars([4, null], [4, 5], [0, 1]);
assert('缺少旧 PAR 阻止', parFail.ok === false && /更换前 PAR/.test((parFail.details || []).join('')));

var puttRec = {
  scores: [5],
  putts: [4],
  puttsManual: [true]
};
convert.convertScoreRecord(puttRec, [0], [4], [3], '推杆');
assert('已填 putts clamp 到 总杆-1', puttRec.scores[0] === 4 && puttRec.putts[0] === 3);
assert('原 puttsManual=true 保持 true', puttRec.puttsManual[0] === true);

var emptyPutt = { scores: [5], putts: [null, undefined, ''] };
convert.convertScoreRecord(emptyPutt, [0], [4], [5], '空推');
assert('空 putts 不自动填默认值', emptyPutt.putts[0] == null);
assert('无 puttsManual 不补字段', emptyPutt.puttsManual === undefined);

var clampMark = {
  scores: [5],
  putts: [4],
  puttsManual: [false]
};
convert.convertScoreRecord(clampMark, [0], [4], [3], '钳制标记');
assert(
  '因 clamp 改值后标记 manual',
  clampMark.scores[0] === 4 && clampMark.putts[0] === 3 && clampMark.puttsManual[0] === true
);

var keepFalse = {
  scores: [5],
  putts: [2],
  puttsManual: [false]
};
convert.convertScoreRecord(keepFalse, [0], [4], [5], '未钳制');
assert(
  '未 clamp 且原 false 不改成 true',
  keepFalse.scores[0] === 6 && keepFalse.putts[0] === 2 && keepFalse.puttsManual[0] === false
);

var noPuttArr = { scores: [5] };
convert.convertScoreRecord(noPuttArr, [0], [4], [5], '无推杆数组');
assert('无 putts 数组不补 putts', noPuttArr.putts === undefined && noPuttArr.puttsManual === undefined);

var game = {
  groups: [
    {
      scoresByPlayer: {
        a: { scores: [5, 4, 3, 4, 4, 4, 3, 5, 4, 9, 4, 4, 4, 4, 4, 4, 4, 4], putts: [], puttsManual: [] },
        b: { scores: [4, 5, 3, 4, 4, 4, 3, 4, 4, 8, 4, 4, 4, 4, 4, 4, 4, 4], putts: [], puttsManual: [] }
      },
      scoresBySlot: [
        { scores: [5, 4, 3, 4, 4, 4, 3, 5, 4, 10, 4, 4, 4, 4, 4, 4, 4, 4], putts: [2] }
      ],
      teamScoresByEntity: [
        { teamId: 't1', scores: [6, 5, 3, 4, 4, 4, 3, 5, 4, 7, 4, 4, 4, 4, 4, 4, 4, 4], putts: [] }
      ]
    }
  ]
};
var prepared = convert.prepareConvertedScores({
  beforeFront: 'A',
  beforeBack: 'B',
  afterFront: 'D',
  afterBack: 'B',
  oldPars: pars('A', 'B'),
  newPars: pars('D', 'B'),
  game: game
});
assert('多球员准备成功', prepared.ok);
assert('后九组合分不变', game.groups[0].teamScoresByEntity[0].scores[9] === 7);
assert('未更换半场球员后九不变', game.groups[0].scoresByPlayer.a.scores[9] === 9);
assert('scoresBySlot 后九不变', game.groups[0].scoresBySlot[0].scores[9] === 10);
assert(
  'entity 无 puttsManual 不补字段',
  game.groups[0].teamScoresByEntity[0].puttsManual === undefined
);

var match = {
  scoreData: {
    g1: {
      scoresBySide: {
        home: { scores: [5, 4, 3, 4, 4, 4, 3, 5, 4, 8, 4, 4, 4, 4, 4, 4, 4, 4] }
      },
      teamScoresByEntity: [
        { teamId: 'e1', scores: [6, 4, 3, 4, 4, 4, 3, 5, 4, 7, 4, 4, 4, 4, 4, 4, 4, 4] }
      ]
    }
  }
};
var matchPrep = convert.prepareConvertedScores({
  beforeFront: 'A',
  beforeBack: 'B',
  afterFront: 'D',
  afterBack: 'B',
  oldPars: pars('A', 'B'),
  newPars: pars('D', 'B'),
  match: match
});
assert('scoresBySide 前九换算成功', matchPrep.ok);
assert('scoresBySide 后九不变', match.scoreData.g1.scoresBySide.home.scores[9] === 8);
assert('match entity 后九不变', match.scoreData.g1.teamScoresByEntity[0].scores[9] === 7);

var groups = [
  {
    players: [
      {
        name: 'P1',
        holes: [
          { score: 5, putts: 2, puttManual: true },
          { score: 4, putts: null },
          { score: '', putts: null }
        ]
      }
    ]
  }
];
var groupPrep = convert.prepareConvertedScores({
  beforeFront: 'A',
  beforeBack: 'B',
  afterFront: 'D',
  afterBack: 'B',
  oldPars: pars('A', 'B'),
  newPars: pars('D', 'B'),
  groups: groups
});
assert('player.holes 换算成功', groupPrep.ok && groups[0].players[0].holes[0].score === 5);
assert('player.holes 空成绩保持空', groups[0].players[0].holes[2].score === '');
assert('player.holes 已填推杆保留', groups[0].players[0].holes[0].putts === 2);
assert('player.holes 原 puttManual=true 保持', groups[0].players[0].holes[0].puttManual === true);

var abortGame = {
  scoresByPlayer: {
    ken: { scores: [4, 1, 4, 4, 4, 4, 4, 4, 4], putts: [2, 0] }
  }
};
var aborted = convert.prepareConvertedScores({
  beforeFront: 'A',
  beforeBack: 'B',
  afterFront: 'D',
  afterBack: 'B',
  oldPars: pars('A', 'B'),
  newPars: pars('D', 'B'),
  game: abortGame
});
assert('异常总杆取消整次换算', aborted.ok === false);
assert('失败不部分写回总杆', abortGame.scoresByPlayer.ken.scores[1] === 1);
assert('失败不部分写回推杆', abortGame.scoresByPlayer.ken.putts[1] === 0);

if (failed) {
  console.log('FAILED ' + failed + ' / ' + (passed + failed));
  process.exit(1);
}
console.log('OK ' + passed + ' checks');
