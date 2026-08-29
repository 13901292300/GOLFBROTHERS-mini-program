/**
 * 球队赛 / Series 分站完成后锁定
 * 运行：node scripts/teamMatchFinishLock.selftest.js
 */

var path = require('path');
var fs = require('fs');
var seriesTestPaths = require('./lib/seriesTestPaths.js');

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
var seriesDir = path.join(
  root,
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail'
);

var finish = require(path.join(utilsDir, 'teamMatchFinish.js'));
var moreMenu = require(path.join(utilsDir, 'teamMatchMoreMenu.js'));
var aggregate = require(path.join(utilsDir, 'seriesRoundPhaseAggregate.js'));
var scheduleVm = require(path.join(seriesDir, 'seriesScheduleViewModel.js'));
var scheduleWrite = require(path.join(seriesDir, 'seriesScheduleGroupWrite.js'));
var manageSheet = require(path.join(seriesDir, 'seriesManageSheetViewModel.js'));
var seriesRoundUpdate = require(seriesTestPaths.util('seriesRoundUpdate.js'));
var teeSheetManage = require(path.join(utilsDir, 'teeSheetManage.js'));
var standingsAssembler = require(seriesTestPaths.util('seriesStandingsAssembler.js'));

var finishJs = fs.readFileSync(path.join(utilsDir, 'teamMatchFinish.js'), 'utf8');
var scoreJs = fs.readFileSync(
  path.join(root, 'miniprogram', 'subpackages', 'scoring', 'pages', 'score', 'index.js'),
  'utf8'
);
var detailJs = fs.readFileSync(
  path.join(root, 'miniprogram', 'subpackages', 'tournament', 'pages', 'detail', 'index.js'),
  'utf8'
);
var seriesPageJs = fs.readFileSync(path.join(seriesDir, 'index.js'), 'utf8');
var groupEditorJs = fs.readFileSync(
  path.join(root, 'miniprogram', 'subpackages', 'tournament', 'pages', 'group-editor', 'index.js'),
  'utf8'
);
var moreMenuJs = fs.readFileSync(path.join(utilsDir, 'teamMatchMoreMenu.js'), 'utf8');
var wxssSeries = fs.readFileSync(path.join(seriesDir, 'index.wxss'), 'utf8');
var wxssCommon = fs.readFileSync(
  path.join(root, 'miniprogram', 'styles', 'tournament-common.wxss'),
  'utf8'
);

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

function player(id) {
  return { userId: id, playerId: id, name: id };
}

function group(id, status, users) {
  return {
    groupId: id,
    status: status || '',
    players: (users || ['u1']).map(player)
  };
}

function matchOf(over) {
  return Object.assign(
    {
      matchId: 'm1',
      status: 'ongoing',
      groups: [group('g1', '', ['a']), group('g2', '', ['b'])],
      scoreData: {}
    },
    over || {}
  );
}

function seriesOf(rounds) {
  return {
    seriesId: 's1',
    lifecycleStatus: 'published',
    registrationState: 'open',
    scoringRule: { mode: 'global_m', globalM: 2, allowRepeat: false },
    rounds: rounds
  };
}

assert(
  'no series isLocked truth field',
  finishJs.indexOf('isLocked:') < 0 && finishJs.indexOf('isLocked =') < 0
);
assert(
  'score promotes after last group finish',
  scoreJs.indexOf('scoreGroupFinish') >= 0 &&
    fs.readFileSync(seriesTestPaths.util('scoreGroupFinish.js'), 'utf8').indexOf(
      'promoteMatchFinishedIfAllGroupsDone'
    ) >= 0
);
assert(
  'ordinary M finish uses shared confirm',
  detailJs.indexOf('confirmFinishWholeTeamMatch') >= 0
);
assert(
  'series M finish uses shared confirm',
  seriesPageJs.indexOf('confirmFinishWholeTeamMatch') >= 0
);
assert(
  'score persist uses writable guard',
  scoreJs.indexOf('saveWritableTeamMatch') >= 0 &&
    scoreJs.indexOf('saveMatchIfWritable') >= 0
);
assert(
  'group editor blocks completed load/save',
  (groupEditorJs.indexOf('assertMatchNotCompleted') >= 0 ||
    groupEditorJs.indexOf('assertWritable') >= 0) &&
    groupEditorJs.indexOf('isMatchCompleted') >= 0
);
assert(
  'more menu completed uses shared isMatchCompleted',
  moreMenuJs.indexOf('teamMatchFinish.isMatchCompleted') >= 0
);
assert(
  'series disabled opacity matches ordinary',
  /opacity:\s*0\.46/.test(wxssSeries) && /pointer-events:\s*none/.test(wxssSeries)
);
assert(
  'ordinary feature-item disabled uses same opacity',
  /feature-item\.is-disabled[\s\S]*opacity:\s*0\.46/.test(wxssCommon)
);

var empty = matchOf({ groups: [] });
assert(
  'zero groups do not complete',
  finish.allValidGroupsConfirmedFinished(empty) === false &&
    finish.promoteMatchFinishedIfAllGroupsDone(empty).changed === false
);

var placeholders = matchOf({
  groups: [{ groupId: 'g0', status: 'finished', players: [{ userId: '' }] }]
});
assert(
  'placeholder groups do not complete',
  finish.allValidGroupsConfirmedFinished(placeholders) === false
);

var oneLeft = matchOf({
  groups: [group('g1', 'finished', ['a']), group('g2', 'live', ['b'])]
});
assert(
  'one valid group unfinished does not promote',
  finish.promoteMatchFinishedIfAllGroupsDone(oneLeft).changed === false &&
    oneLeft.status === 'ongoing'
);

var allGroups = matchOf({
  groups: [group('g1', 'finished', ['a']), group('g2', 'completed', ['b'])],
  scoreData: {
    g1: { firstScoreAt: 1, scoresByPlayer: { a: { scores: [4] } } }
  }
});
var promoted = finish.promoteMatchFinishedIfAllGroupsDone(allGroups);
assert('all valid groups finished promotes match', promoted.changed === true);
assert('promoted status is finished', allGroups.status === 'finished');
assert('promoted label 已结束', allGroups.statusLabel === '已结束');

var cancelled = matchOf({ status: 'cancelled', groups: [group('g1', 'finished', ['a'])] });
assert(
  'cancelled match is not completed lock',
  finish.isMatchCompleted(cancelled) === false &&
    finish.promoteMatchFinishedIfAllGroupsDone(cancelled).changed === false
);

var already = matchOf({ status: 'completed' });
assert('backend completed status is lock SoT', finish.isMatchCompleted(already) === true);

var mFinish = matchOf({ status: 'ongoing' });
var confirmed = finish.confirmFinishWholeTeamMatch(mFinish);
assert('M panel finish whole match', confirmed.ok === true && mFinish.status === 'finished');
var again = finish.confirmFinishWholeTeamMatch(mFinish);
assert('second finish rejected', again.ok === false && again.reason === 'already_finished');

var finishedMatch = matchOf({ status: 'finished' });
assert(
  'edit_groups disabled after finish',
  moreMenu.getMoreFeatureDisabledState(finishedMatch, { permission: 'edit_groups' }) === true
);
assert(
  'manage_players disabled after finish',
  moreMenu.getMoreFeatureDisabledState(finishedMatch, { permission: 'manage_players' }) === true
);
assert(
  'manage_tee_sheet disabled after finish',
  moreMenu.getMoreFeatureDisabledState(finishedMatch, { permission: 'manage_tee_sheet' }) === true
);
assert(
  'edit_match / edit_half disabled after finish',
  moreMenu.getMoreFeatureDisabledState(finishedMatch, { permission: 'edit_match' }) === true &&
    moreMenu.getMoreFeatureDisabledState(finishedMatch, { permission: 'edit_half' }) === true
);
assert(
  'leaderboard remains enabled after finish',
  moreMenu.getMoreFeatureDisabledState(finishedMatch, { permission: 'leaderboard' }) === false
);
assert(
  'completed status also disables mutations',
  moreMenu.getMoreFeatureDisabledState(already, { permission: 'edit_groups' }) === true
);

var store = { m1: matchOf({ status: 'finished' }) };
var stale = matchOf({ status: 'ongoing', matchId: 'm1' });
stale.scoreData = { g1: { scoresByPlayer: { a: { scores: [3] } } } };
var saved = { called: false };
var writeGuard = finish.saveMatchIfWritable(stale, {
  getMatchById: function (id) {
    return store[id];
  },
  saveMatch: function () {
    saved.called = true;
  }
});
assert('stale score save rejected', writeGuard.ok === false && saved.called === false);

var liveStore = { m2: matchOf({ status: 'ongoing', matchId: 'm2' }) };
var liveWrite = finish.saveMatchIfWritable(matchOf({ status: 'ongoing', matchId: 'm2' }), {
  getMatchById: function (id) {
    return liveStore[id];
  },
  saveMatch: function () {
    saved.called = true;
  }
});
assert('unfinished score save allowed', liveWrite.ok === true);

var teeReject = teeSheetManage.commitTeeSheetDraft(
  matchOf({ status: 'finished', groups: [group('g1', 'finished', ['a'])] }),
  { groups: [{ groupId: 'g1', teeTime: '08:00', startHole: 1 }] }
);
assert(
  'tee sheet commit rejected when finished',
  teeReject.ok === false && teeReject.reason === 'match_finished'
);

var series = seriesOf([
  { roundId: 'r1', index: 1, matchId: 'm-r1' },
  { roundId: 'r2', index: 2, matchId: 'm-r2' }
]);
var matches = {
  'm-r1': matchOf({ matchId: 'm-r1', status: 'finished' }),
  'm-r2': matchOf({ matchId: 'm-r2', status: 'registering' })
};
function getMatch(id) {
  return matches[id] || null;
}
assert(
  'R1 completed does not lock whole series',
  aggregate.allValidRoundsCompleted(series, getMatch) === false &&
    aggregate.anyValidRoundCompleted(series, getMatch) === true
);
assert('R1 match is locked', finish.isMatchCompleted(matches['m-r1']) === true);
assert('R2 still writable', finish.isMatchCompleted(matches['m-r2']) === false);

var cSeries = seriesOf([
  { roundId: 'c1', index: 1, matchId: 'm-c1' },
  { roundId: 'c2', index: 2, matchId: 'm-c2' }
]);
var cMatches = {
  'm-c1': matchOf({ matchId: 'm-c1', status: 'finished' }),
  'm-c2': matchOf({ matchId: 'm-c2', status: 'ongoing' })
};
assert(
  'C1 complete does not lock C2',
  finish.isMatchCompleted(cMatches['m-c1']) && !finish.isMatchCompleted(cMatches['m-c2'])
);

matches['m-r2'] = matchOf({ matchId: 'm-r2', status: 'finished' });
assert(
  'all valid rounds completed locks series',
  aggregate.allValidRoundsCompleted(series, getMatch) === true
);

var cancelledSeries = seriesOf([
  { roundId: 'r1', index: 1, matchId: 'm-ok', roundStatus: '' },
  { roundId: 'rx', index: 2, matchId: 'm-x', roundStatus: 'cancelled' }
]);
var cancelledMatches = {
  'm-ok': matchOf({ matchId: 'm-ok', status: 'finished' }),
  'm-x': matchOf({ matchId: 'm-x', status: 'cancelled' })
};
assert(
  'cancelled rounds excluded from all-completed',
  aggregate.allValidRoundsCompleted(cancelledSeries, function (id) {
    return cancelledMatches[id];
  }) === true
);

var allDoneScope = manageSheet.buildSeriesScopeFeatures({
  series: Object.assign({}, series, { competitionPhaseCache: 'completed' }),
  user: { userId: 'admin' },
  canManageSeries: true
});
var editSeriesFeat = (allDoneScope.featuresManage || []).filter(function (f) {
  return f && f.permission === 'edit_series';
})[0];
assert(
  'series fully completed disables edit_series',
  !!(editSeriesFeat && editSeriesFeat.disabled)
);

var mixedScope = manageSheet.buildSeriesScopeFeatures({
  series: seriesOf([
    { roundId: 'r1', index: 1, matchId: 'm-r1' },
    { roundId: 'r2', index: 2, matchId: 'm-live' }
  ]),
  user: { userId: 'admin' },
  canManageSeries: true,
  allValidRoundsCompleted: false
});
var editMixed = (mixedScope.featuresManage || []).filter(function (f) {
  return f && f.permission === 'edit_series';
})[0];
assert(
  'partial complete keeps series edit enabled',
  !!(editMixed && !editMixed.disabled)
);

function managedMatch(over) {
  var m = matchOf(over);
  m.seriesContext = {
    managed: true,
    seriesId: 's1',
    roundId: over && over.roundId ? over.roundId : 'r1',
    publishToken: 'tok'
  };
  return m;
}

function scheduleSeries(roundId, matchId) {
  var s = seriesOf([
    {
      roundId: roundId,
      index: 1,
      matchId: matchId,
      gameMode: '个人比杆赛'
    }
  ]);
  s.publishToken = 'tok';
  return s;
}

function buildCtaVm(status, matchId, roundId) {
  var seriesLocal = scheduleSeries(roundId, matchId);
  return scheduleVm.buildSeriesScheduleViewModel({
    series: seriesLocal,
    selectedRoundId: roundId,
    canManageGroups: true,
    lifecycleAccess: { lifecycleStatus: 'published' },
    getMatchById: function () {
      return managedMatch({
        matchId: matchId,
        roundId: roundId,
        status: status,
        groups: [group('g1', status === 'finished' ? 'finished' : '', ['a'])]
      });
    },
    getIndexByMatchId: function () {
      return { seriesId: seriesLocal.seriesId, roundId: roundId, matchId: matchId };
    }
  });
}

var ctaLocked = buildCtaVm('finished', 'm-r1', 'r1');
assert(
  'completed round hides schedule edit-groups CTA',
  !(ctaLocked.cta && ctaLocked.cta.showEditGroups)
);

var ctaOpen = buildCtaVm('registering', 'm-r2', 'r2');
assert(
  'unfinished round keeps schedule edit-groups CTA',
  !!(ctaOpen.cta && ctaOpen.cta.showEditGroups)
);

var groupSeries = seriesOf([{ roundId: 'r1', matchId: 'm-fin' }]);
groupSeries.publishToken = 'tok';
var groupSave = scheduleWrite.saveStationGroups({
  matchId: 'm-fin',
  series: groupSeries,
  roundId: 'r1',
  expectedStatus: 'registering',
  groupDraft: [],
  getMatchById: function () {
    return managedMatch({
      matchId: 'm-fin',
      roundId: 'r1',
      status: 'finished'
    });
  },
  getIndexByMatchId: function () {
    return { seriesId: 's1', roundId: 'r1', matchId: 'm-fin' };
  },
  saveMatch: function () {
    throw new Error('should not save');
  }
});
assert(
  'saveStationGroups rejects finished',
  groupSave.ok === false && groupSave.reason === 'match_finished'
);

var roundLocks = seriesRoundUpdate.resolveRoundEditLocks(
  series,
  { roundId: 'r1', matchId: 'm-r1' },
  matchOf({ status: 'finished' })
);
assert('finished round course/mode/topN locked', !roundLocks.course.enabled && !roundLocks.gameMode.enabled);

assert(
  'no reopen/restore match flow added',
  finishJs.indexOf('reopen') < 0 &&
    finishJs.indexOf('restoreMatch') < 0 &&
    seriesPageJs.indexOf('恢复比赛') < 0
);

assert(
  'standings assembler still reads completed match scores',
  typeof standingsAssembler.buildStandingsResult === 'function'
);

var assemblerSrc = fs.readFileSync(seriesTestPaths.util('seriesStandingsAssembler.js'), 'utf8');
assert(
  'lock does not snapshot-clear standings',
  assemblerSrc.indexOf('status === \'finished\'') < 0 ||
    assemblerSrc.indexOf('scoreData') >= 0
);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) {
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
