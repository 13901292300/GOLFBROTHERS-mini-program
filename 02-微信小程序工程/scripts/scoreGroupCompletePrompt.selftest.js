/**
 * 组成绩全部录入完成自动确认
 * 运行：node scripts/scoreGroupCompletePrompt.selftest.js
 */

var path = require('path');
var assert = require('assert');

if (typeof global.wx === 'undefined') {
  global.wx = {
    getStorageSync: function () {
      return null;
    },
    setStorageSync: function () {},
    removeStorageSync: function () {}
  };
}

var root = path.join(__dirname, '..');
var utilsDir = path.join(root, 'miniprogram', 'utils');
var completeness = require(path.join(utilsDir, 'scoreCompleteness.js'));
var prompt = require(path.join(utilsDir, 'scoreGroupCompletePrompt.js'));
var finish = require(path.join(utilsDir, 'scoreGroupFinish.js'));
var gameProgress = require(path.join(utilsDir, 'gameProgress.js'));

var failed = 0;
var passed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failed += 1;
    console.error('FAIL', name, e && e.message ? e.message : e);
  }
}

function fillHoles(count, value) {
  var scores = [];
  var i;
  for (i = 0; i < 18; i++) scores.push(i < count ? value : null);
  return scores;
}

function fillRange(start, end, value) {
  var scores = [];
  var i;
  for (i = 0; i < 18; i++) {
    scores.push(i >= start && i <= end ? value : null);
  }
  return scores;
}

function player(id, extra) {
  return Object.assign({ userId: id, playerId: id, name: id }, extra || {});
}

function g1Match(opts) {
  var o = opts || {};
  var aScores = o.aScores || fillHoles(18, 4);
  var bScores = o.bScores || fillHoles(18, 4);
  return {
    matchId: o.matchId || 'm-g1',
    gameMode: '个人比杆赛',
    status: o.status || 'live',
    roundStatus: o.roundStatus || 'live',
    seriesContext: o.seriesContext || null,
    groups: [
      {
        groupId: o.groupId || 'g1',
        status: o.groupStatus || 'in_progress',
        players: [player('a'), player('b', o.bExtra)]
      }
    ].concat(o.extraGroups || []),
    scoreData: o.scoreData || {
      g1: {
        scoresByPlayer: {
          a: { scores: aScores },
          b: { scores: bScores }
        }
      }
    }
  };
}

function entityMatch(mode, entities, extra) {
  var o = extra || {};
  return {
    matchId: o.matchId || 'm-ent',
    gameMode: mode,
    status: 'live',
    groups: [
      {
        groupId: 'g1',
        status: 'in_progress',
        players: [player('a'), player('b'), player('c'), player('d')]
      }
    ],
    scoreData: {
      g1: {
        scoresByPlayer: {
          a: { scores: fillHoles(0, 4) },
          b: { scores: fillHoles(0, 4) }
        },
        teamScoresByEntity: entities
      }
    }
  };
}

function basePromptInput(match, extra) {
  var group = match.groups[0];
  return Object.assign(
    {
      kind: 'teamMatch',
      match: match,
      group: group,
      matchId: match.matchId,
      groupId: group.groupId,
      persistedOk: true,
      editable: true,
      groupFinished: false,
      matchFinished: false,
      roundFinished: false,
      seriesFinished: false
    },
    extra || {}
  );
}

function captureModal() {
  var calls = [];
  return {
    calls: calls,
    showModal: function (opts) {
      calls.push(opts);
    }
  };
}

prompt.resetForTests();

check('last required cell persist prompts', function () {
  prompt.resetForTests();
  var match = g1Match({ aScores: fillHoles(18, 4), bScores: fillHoles(17, 4) });
  var r1 = prompt.noteAfterPersist(
    Object.assign(basePromptInput(match), { showModal: captureModal().showModal })
  );
  assert.strictEqual(r1.reason, 'incomplete');
  match.scoreData.g1.scoresByPlayer.b.scores[17] = 4;
  var cap = captureModal();
  var r2 = prompt.noteAfterPersist(Object.assign(basePromptInput(match), { showModal: cap.showModal }));
  assert.strictEqual(r2.prompted, true);
  assert.strictEqual(cap.calls[0].title, '成绩录入完成');
  assert.strictEqual(
    cap.calls[0].content,
    '本组所有成绩均已录入完成，是否立即结束本组比赛？'
  );
  assert.strictEqual(cap.calls[0].cancelText, '暂不结束');
  assert.strictEqual(cap.calls[0].confirmText, '结束比赛');
});

check('save failure does not prompt', function () {
  prompt.resetForTests();
  var match = g1Match();
  var r = prompt.noteAfterPersist(
    Object.assign(basePromptInput(match), {
      persistedOk: false,
      showModal: captureModal().showModal
    })
  );
  assert.strictEqual(r.prompted, false);
  assert.strictEqual(r.reason, 'not_persisted');
});

check('missing one cell does not prompt', function () {
  prompt.resetForTests();
  var match = g1Match({ bScores: fillHoles(17, 4) });
  var r = prompt.noteAfterPersist(
    Object.assign(basePromptInput(match), { showModal: captureModal().showModal })
  );
  assert.strictEqual(r.prompted, false);
  assert.strictEqual(completeness.isComplete(basePromptInput(match)), false);
});

check('G1 personal completeness', function () {
  var match = g1Match();
  assert.strictEqual(completeness.isComplete(basePromptInput(match)), true);
  match.scoreData.g1.scoresByPlayer.a.scores[3] = '';
  assert.strictEqual(completeness.isComplete(basePromptInput(match)), false);
});

check('G2/G3/G4 entity completeness ignores hidden member scores', function () {
  var ents = [
    { teamId: 'e1', scores: fillHoles(18, 5) },
    { teamId: 'e2', scores: fillHoles(18, 4) }
  ];
  var g2 = entityMatch('四人四球比杆赛', ents);
  var g3 = entityMatch('最佳球位比杆赛', ents, { matchId: 'm-g3' });
  var g4 = entityMatch('四人两球比杆赛', ents, { matchId: 'm-g4' });
  assert.strictEqual(completeness.isComplete(basePromptInput(g2)), true);
  assert.strictEqual(completeness.isComplete(basePromptInput(g3)), true);
  assert.strictEqual(completeness.isComplete(basePromptInput(g4)), true);
  g2.scoreData.g1.teamScoresByEntity[1].scores[10] = null;
  assert.strictEqual(completeness.isComplete(basePromptInput(g2)), false);
  var units = completeness.listScoringUnits(basePromptInput(g4));
  assert.strictEqual(units.length, 2);
  assert.strictEqual(units[0].kind, 'entity');
});

check('9 holes vs 18 holes', function () {
  var nine = g1Match({
    aScores: fillRange(0, 8, 4),
    bScores: fillRange(0, 8, 3)
  });
  nine.requiredHoleCount = 9;
  nine.nineSide = 'front';
  assert.strictEqual(completeness.isComplete(basePromptInput(nine)), true);
  nine.requiredHoleCount = 18;
  nine.nineSide = '';
  assert.strictEqual(completeness.isComplete(basePromptInput(nine)), false);
  var back = g1Match({
    aScores: fillRange(9, 17, 4),
    bScores: fillRange(9, 17, 5)
  });
  back.nineSide = 'back';
  assert.strictEqual(completeness.isComplete(basePromptInput(back)), true);
});

check('empty / 0 / placeholder / special status', function () {
  assert.strictEqual(completeness.isFilledRequiredScore(0), true);
  assert.strictEqual(completeness.isFilledRequiredScore('0'), true);
  assert.strictEqual(completeness.isFilledRequiredScore(''), false);
  assert.strictEqual(completeness.isFilledRequiredScore(null), false);
  assert.strictEqual(completeness.isFilledRequiredScore('-'), false);
  assert.strictEqual(completeness.isFilledRequiredScore('--'), false);
  var withZero = g1Match({ aScores: fillHoles(18, 0), bScores: fillHoles(18, 0) });
  assert.strictEqual(completeness.isComplete(basePromptInput(withZero)), true);
  var placeholder = g1Match({ bScores: fillHoles(17, 4).concat(['-']) });
  assert.strictEqual(completeness.isComplete(basePromptInput(placeholder)), false);
  var wd = g1Match({
    bExtra: { status: 'WD' },
    aScores: fillHoles(18, 4),
    bScores: fillHoles(0, 4)
  });
  assert.strictEqual(completeness.isComplete(basePromptInput(wd)), true);
  var bye = g1Match();
  bye.groups[0].status = '轮空';
  var p = completeness.projectGroupCompleteness(basePromptInput(bye));
  assert.strictEqual(p.exempt, true);
});

check('dismiss then no repeat until incomplete again', function () {
  prompt.resetForTests();
  var match = g1Match();
  var cap = captureModal();
  var input = Object.assign(basePromptInput(match), { showModal: cap.showModal });
  var r1 = prompt.noteAfterPersist(input);
  assert.strictEqual(r1.prompted, true);
  cap.calls[0].success({ confirm: false });
  var r2 = prompt.noteAfterPersist(Object.assign(basePromptInput(match), { showModal: captureModal().showModal }));
  assert.strictEqual(r2.reason, 'dismissed');
  match.scoreData.g1.scoresByPlayer.a.scores[2] = '';
  var r3 = prompt.noteAfterPersist(
    Object.assign(basePromptInput(match), { showModal: captureModal().showModal })
  );
  assert.strictEqual(r3.reason, 'incomplete');
  match.scoreData.g1.scoresByPlayer.a.scores[2] = 4;
  var cap2 = captureModal();
  var r4 = prompt.noteAfterPersist(Object.assign(basePromptInput(match), { showModal: cap2.showModal }));
  assert.strictEqual(r4.prompted, true);
});

check('open already complete page does not prompt', function () {
  prompt.resetForTests();
  var match = g1Match();
  prompt.snapshotCompleteness(basePromptInput(match), true);
  var r = prompt.noteAfterPersist(
    Object.assign(basePromptInput(match), { showModal: captureModal().showModal })
  );
  assert.strictEqual(r.prompted, false);
  assert.strictEqual(r.reason, 'already_complete');
});

check('finished group / round / series do not prompt', function () {
  prompt.resetForTests();
  var match = g1Match({ groupStatus: 'finished' });
  var r1 = prompt.noteAfterPersist(
    Object.assign(basePromptInput(match), {
      groupFinished: true,
      showModal: captureModal().showModal
    })
  );
  assert.strictEqual(r1.reason, 'blocked');
  prompt.resetForTests();
  var r2 = prompt.noteAfterPersist(
    Object.assign(basePromptInput(g1Match()), {
      roundFinished: true,
      showModal: captureModal().showModal
    })
  );
  assert.strictEqual(r2.reason, 'blocked');
  prompt.resetForTests();
  var r3 = prompt.noteAfterPersist(
    Object.assign(basePromptInput(g1Match()), {
      seriesFinished: true,
      showModal: captureModal().showModal
    })
  );
  assert.strictEqual(r3.reason, 'blocked');
  prompt.resetForTests();
  var r4 = prompt.noteAfterPersist(
    Object.assign(basePromptInput(g1Match()), {
      editable: false,
      showModal: captureModal().showModal
    })
  );
  assert.strictEqual(r4.reason, 'blocked');
});

check('duplicate listeners and in-flight modal', function () {
  prompt.resetForTests();
  var match = g1Match();
  var cap = captureModal();
  var a = prompt.noteAfterPersist(Object.assign(basePromptInput(match), { showModal: cap.showModal }));
  var b = prompt.noteAfterPersist(Object.assign(basePromptInput(match), { showModal: cap.showModal }));
  assert.strictEqual(a.prompted, true);
  assert.strictEqual(b.reason, 'showing');
  assert.strictEqual(cap.calls.length, 1);
});

check('confirm calls shared finish group and promotes round', function () {
  var g1 = {
    groupId: 'g1',
    status: 'in_progress',
    players: [player('a')]
  };
  var g2 = {
    groupId: 'g2',
    status: 'in_progress',
    players: [player('c')]
  };
  var match = {
    matchId: 'm-round',
    gameMode: '个人比杆赛',
    status: 'live',
    groups: [g1, g2],
    scoreData: {
      g1: { scoresByPlayer: { a: { scores: fillHoles(18, 4) } } },
      g2: { scoresByPlayer: { c: { scores: fillHoles(18, 4) } } }
    }
  };
  var saved = [];
  var r1 = finish.finishTeamMatchGroup(match, 'g1', {
    saveMatchIfWritable: function (m) {
      saved.push(m.groups[0].status);
      return { ok: true };
    },
    maybeFinalizeAfterStationPersisted: function () {
      return { ok: true, skipped: true };
    }
  });
  assert.strictEqual(r1.ok, true);
  assert.strictEqual(r1.matchPromoted, false);
  assert.strictEqual(match.status, 'live');
  var r2 = finish.finishTeamMatchGroup(match, 'g2', {
    saveMatchIfWritable: function () {
      return { ok: true };
    },
    maybeFinalizeAfterStationPersisted: function () {
      return { ok: true, skipped: true };
    }
  });
  assert.strictEqual(r2.ok, true);
  assert.strictEqual(r2.matchPromoted, true);
  assert.strictEqual(match.status, 'finished');
});

check('last series round finalize continues after group finish', function () {
  var match = g1Match({ matchId: 'm-series' });
  match.seriesContext = { managed: true, seriesId: 's1' };
  var finalized = 0;
  var r = finish.finishTeamMatchGroup(match, 'g1', {
    saveMatchIfWritable: function () {
      return { ok: true };
    },
    maybeFinalizeAfterStationPersisted: function (m) {
      finalized += 1;
      assert.strictEqual(m.matchId, 'm-series');
      return { ok: true, reason: 'auto_completed' };
    }
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.matchPromoted, true);
  assert.strictEqual(finalized, 1);
});

check('ordinary game / team match share completeness projection', function () {
  var game = {
    gameId: 'game-1',
    gameMode: '个人比杆赛',
    groups: [
      {
        groupId: 'game-1-g1',
        status: 'in_progress',
        playersSlots: [player('a'), player('b')],
        scoresByPlayer: {
          a: { scores: fillHoles(18, 4) },
          b: { scores: fillHoles(18, 5) }
        }
      }
    ]
  };
  assert.strictEqual(completeness.isGameGroupComplete(game, 0), true);
  assert.strictEqual(gameProgress.isScoringCompleted(game, 0), true);
  var tm = g1Match();
  assert.strictEqual(completeness.isComplete(basePromptInput(tm)), true);
  var fourball = {
    gameId: 'fb',
    gameMode: '四人两球赛',
    groups: [
      {
        groupId: 'fb-g1',
        playersSlots: [player('a'), player('b')],
        scoresByPlayer: { a: { scores: fillHoles(0, 4) } },
        teamScoresByEntity: [{ teamId: 'pair', scores: fillHoles(18, 4) }]
      }
    ]
  };
  assert.strictEqual(completeness.isGameGroupComplete(fourball, 0), true);
});

check('confirm during modal does not re-prompt; cancel does not finish', function () {
  prompt.resetForTests();
  var match = g1Match();
  var confirmed = 0;
  var cap = captureModal();
  prompt.noteAfterPersist(
    Object.assign(basePromptInput(match), {
      showModal: cap.showModal,
      onConfirm: function () {
        confirmed += 1;
      }
    })
  );
  var mid = prompt.noteAfterPersist(
    Object.assign(basePromptInput(match), { showModal: captureModal().showModal })
  );
  assert.strictEqual(mid.reason, 'showing');
  cap.calls[0].success({ confirm: true });
  assert.strictEqual(confirmed, 1);
  var after = prompt.noteAfterPersist(
    Object.assign(basePromptInput(match), { showModal: captureModal().showModal })
  );
  assert.strictEqual(after.reason, 'already_complete');
});

check('finish fails when incomplete or already finished; no fake complete', function () {
  var incomplete = g1Match({ bScores: fillHoles(10, 4) });
  var r1 = finish.finishTeamMatchGroup(incomplete, 'g1', {
    saveMatchIfWritable: function () {
      return { ok: true };
    }
  });
  assert.strictEqual(r1.ok, false);
  assert.strictEqual(r1.reason, 'incomplete');
  var done = g1Match({ groupStatus: 'finished' });
  var r2 = finish.assertCanFinishGroup(basePromptInput(done));
  assert.strictEqual(r2.ok, false);
  var locked = g1Match({ status: 'finished' });
  var r3 = finish.finishTeamMatchGroup(locked, 'g1', {
    saveMatchIfWritable: function () {
      return { ok: false, reason: 'match_finished', message: '比赛已经结束。' };
    }
  });
  assert.strictEqual(r3.ok, false);
});

check('host key uses matchId+groupId not list index', function () {
  assert.strictEqual(completeness.buildHostKey('m1', 'grp-9'), 'm1|grp-9');
  assert.notStrictEqual(completeness.buildHostKey('m1', 'grp-9'), 'm1|0');
});

check('gameProgress filled-score 0 is not empty', function () {
  assert.strictEqual(gameProgress.isFilledScore(0), true);
  assert.strictEqual(gameProgress.isFilledScore(''), false);
});

console.log('scoreGroupCompletePrompt.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
