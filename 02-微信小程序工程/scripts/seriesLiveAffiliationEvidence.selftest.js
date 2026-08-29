/**
 * Series LIVE 跨轮归属证据 / 两级约束（纯函数）
 * 运行：node scripts/seriesLiveAffiliationEvidence.selftest.js
 */

var seriesTestPaths = require('./lib/seriesTestPaths.js');
var matchStatus = require(require('path').join(
  __dirname,
  '..',
  'miniprogram',
  'utils',
  'matchStatus.js'
));
var teamMatchFinish = require(require('path').join(
  __dirname,
  '..',
  'miniprogram',
  'utils',
  'teamMatchFinish.js'
));
var seriesRyderCup = require(require('path').join(
  __dirname,
  '..',
  'miniprogram',
  'utils',
  'seriesRyderCup.js'
));
var evidenceMod = require(seriesTestPaths.util('seriesLiveAffiliationEvidence.js'));

var collect = evidenceMod.collectSeriesLiveAffiliationEvidence;
var STATE = evidenceMod.STATE;

var passed = 0;
var failed = [];

function assert(name, cond) {
  if (cond) {
    passed += 1;
    return;
  }
  failed.push(name);
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function red() {
  return {
    seriesParticipantId: 'part-red',
    kind: 'team',
    sourceTeamId: 'red',
    shortNameSnapshot: '红队',
    nameSnapshot: '红队'
  };
}

function blue() {
  return {
    seriesParticipantId: 'part-blue',
    kind: 'team',
    sourceTeamId: 'blue',
    shortNameSnapshot: '蓝队',
    nameSnapshot: '蓝队'
  };
}

function seat(userId, pos, aff, extra) {
  return Object.assign(
    {
      position: pos,
      userId: userId,
      playerId: userId,
      displayName: extra && extra.displayName ? extra.displayName : '球员' + userId,
      seriesParticipantId: aff,
      matchTeamId: aff === 'part-blue' ? 'blue' : 'red',
      affiliationId: aff === 'part-blue' ? 'blue' : 'red'
    },
    extra || {}
  );
}

function makeMatch(id, roundId, groups, extra) {
  return Object.assign(
    {
      matchId: id,
      status: extra && extra.status ? extra.status : 'LIVE',
      groups: groups,
      scoreData: (extra && extra.scoreData) || {},
      seriesContext: {
        managed: true,
        seriesId: 'ser-1',
        roundId: roundId,
        matchId: id,
        publishToken: 'tok-1'
      }
    },
    extra && extra.matchPatch ? extra.matchPatch : {}
  );
}

function makeSeries(rounds, extra) {
  return Object.assign(
    {
      seriesId: 'ser-1',
      hostMode: 'organization',
      publishToken: 'tok-1',
      lifecycleStatus: 'published',
      participants: [red(), blue()],
      roster: [
        {
          playerId: 'B',
          seriesParticipantId: 'part-green-should-ignore',
          registrationStatus: 'registered'
        }
      ],
      scoringRule: { allowRepeat: false },
      rounds: rounds
    },
    extra || {}
  );
}

function stores(map) {
  return {
    getMatchById: function (id) {
      return map[id] || null;
    },
    getIndexByMatchId: function (id) {
      var m = map[id];
      if (!m) return null;
      return {
        seriesId: 'ser-1',
        roundId: m.seriesContext.roundId,
        matchId: id
      };
    }
  };
}

function run(series, playerId, target, map) {
  var io = stores(map);
  return collect({
    series: series,
    playerId: playerId,
    currentTarget: target,
    getMatchById: io.getMatchById,
    getIndexByMatchId: io.getIndexByMatchId,
    isGroupConfirmedFinished: matchStatus.isGroupConfirmedFinished,
    isMatchCompleted: teamMatchFinish.isMatchCompleted
  });
}

var TARGET = {
  seriesId: 'ser-1',
  roundId: 'r1',
  matchId: 'm1',
  groupId: 'g1',
  position: 1
};

(function unlocked_no_other() {
  var series = makeSeries([
    { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
    { roundId: 'r2', matchId: 'm2', roundStatus: 'upcoming' }
  ]);
  var m1 = makeMatch('m1', 'r1', [
    { groupId: 'g1', players: [seat('A', 1, 'part-red'), seat('C', 2, 'part-blue')] }
  ]);
  var m2 = makeMatch('m2', 'r2', [{ groupId: 'g2', players: [] }]);
  var out = run(series, 'B', TARGET, { m1: m1, m2: m2 });
  assert('无其他记录→unlocked', out.ok && out.state === STATE.unlocked && out.evidence.length === 0);
})();

(function reservation_upcoming_grouped() {
  var series = makeSeries([
    { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
    { roundId: 'r2', matchId: 'm2', roundStatus: 'upcoming' }
  ]);
  var m1 = makeMatch('m1', 'r1', [
    { groupId: 'g1', players: [seat('A', 1, 'part-red'), seat('C', 2, 'part-blue')] }
  ]);
  var m2 = makeMatch('m2', 'r2', [
    { groupId: 'g2', status: '', players: [seat('B', 1, 'part-red')] }
  ]);
  m2.status = 'UPCOMING';
  var out = run(series, 'B', TARGET, { m1: m1, m2: m2 });
  assert(
    '其他待赛轮已分组→reservation',
    out.ok &&
      out.state === STATE.participation_reservation &&
      out.affiliationId === 'part-red'
  );
})();

(function reservation_live_no_score() {
  var series = makeSeries([
    { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
    { roundId: 'r2', matchId: 'm2', roundStatus: 'live' }
  ]);
  var m1 = makeMatch('m1', 'r1', [
    { groupId: 'g1', players: [seat('A', 1, 'part-red')] }
  ]);
  var m2 = makeMatch('m2', 'r2', [
    { groupId: 'g2', status: 'LIVE', players: [seat('B', 1, 'part-blue')] }
  ]);
  var out = run(series, 'B', TARGET, { m1: m1, m2: m2 });
  assert(
    '其他LIVE无成绩→reservation',
    out.state === STATE.participation_reservation && out.affiliationId === 'part-blue'
  );
})();

(function reservation_live_temp_scores() {
  var series = makeSeries([
    { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
    { roundId: 'r2', matchId: 'm2', roundStatus: 'live' }
  ]);
  var m1 = makeMatch('m1', 'r1', [
    { groupId: 'g1', players: [seat('A', 1, 'part-red')] }
  ]);
  var m2 = makeMatch('m2', 'r2', [
    { groupId: 'g2', status: 'LIVE', players: [seat('B', 1, 'part-red')] }
  ], { scoreData: { g2: { B: [4, 5] } } });
  var out = run(series, 'B', TARGET, { m1: m1, m2: m2 });
  assert(
    '其他LIVE有临时成绩→reservation 不是终态锁',
    out.state === STATE.participation_reservation && out.state !== STATE.confirmed_affiliation_lock
  );
})();

(function lock_group_finished() {
  var series = makeSeries([
    { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
    { roundId: 'r2', matchId: 'm2', roundStatus: 'live' }
  ]);
  var m1 = makeMatch('m1', 'r1', [{ groupId: 'g1', players: [seat('A', 1, 'part-red')] }]);
  var m2 = makeMatch('m2', 'r2', [
    { groupId: 'g2', status: 'finished', players: [seat('B', 1, 'part-red')] }
  ]);
  var out = run(series, 'B', TARGET, { m1: m1, m2: m2 });
  assert(
    '其他Group结束→confirmed lock',
    out.ok && out.state === STATE.confirmed_affiliation_lock && out.affiliationId === 'part-red'
  );
})();

(function lock_match_completed() {
  var series = makeSeries([
    { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
    { roundId: 'r2', matchId: 'm2', roundStatus: 'completed' }
  ]);
  var m1 = makeMatch('m1', 'r1', [{ groupId: 'g1', players: [seat('A', 1, 'part-red')] }]);
  var m2 = makeMatch('m2', 'r2', [
    { groupId: 'g2', status: 'LIVE', players: [seat('B', 1, 'part-blue')] }
  ]);
  m2.status = 'finished';
  var out = run(series, 'B', TARGET, { m1: m1, m2: m2 });
  assert(
    '其他Match完成→confirmed lock',
    out.state === STATE.confirmed_affiliation_lock && out.affiliationId === 'part-blue'
  );
})();

(function merge_same_affiliation() {
  var series = makeSeries([
    { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
    { roundId: 'r2', matchId: 'm2', roundStatus: 'upcoming' },
    { roundId: 'r3', matchId: 'm3', roundStatus: 'live' }
  ]);
  var m1 = makeMatch('m1', 'r1', [{ groupId: 'g1', players: [seat('A', 1, 'part-red')] }]);
  var m2 = makeMatch('m2', 'r2', [
    { groupId: 'g2', players: [seat('B', 1, 'part-red')] }
  ]);
  var m3 = makeMatch('m3', 'r3', [
    { groupId: 'g3', players: [seat('B', 2, 'part-red')] }
  ]);
  var out = run(series, 'B', TARGET, { m1: m1, m2: m2, m3: m3 });
  assert(
    '多轮同归属合并',
    out.ok &&
      out.state === STATE.participation_reservation &&
      out.affiliationId === 'part-red' &&
      out.evidence.length === 2
  );
})();

(function reserve_plus_lock_same() {
  var series = makeSeries([
    { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
    { roundId: 'r2', matchId: 'm2', roundStatus: 'upcoming' },
    { roundId: 'r3', matchId: 'm3', roundStatus: 'live' }
  ]);
  var m1 = makeMatch('m1', 'r1', [{ groupId: 'g1', players: [seat('A', 1, 'part-red')] }]);
  var m2 = makeMatch('m2', 'r2', [
    { groupId: 'g2', players: [seat('B', 1, 'part-red')] }
  ]);
  var m3 = makeMatch('m3', 'r3', [
    { groupId: 'g3', status: 'finished', players: [seat('B', 1, 'part-red')] }
  ]);
  var out = run(series, 'B', TARGET, { m1: m1, m2: m2, m3: m3 });
  assert(
    '一条未确认+一条已确认同归属→confirmed lock',
    out.state === STATE.confirmed_affiliation_lock && out.affiliationId === 'part-red'
  );
})();

(function two_affiliations_conflict() {
  var series = makeSeries([
    { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
    { roundId: 'r2', matchId: 'm2', roundStatus: 'upcoming' },
    { roundId: 'r3', matchId: 'm3', roundStatus: 'live' }
  ]);
  var m1 = makeMatch('m1', 'r1', [{ groupId: 'g1', players: [seat('A', 1, 'part-red')] }]);
  var m2 = makeMatch('m2', 'r2', [
    { groupId: 'g2', players: [seat('B', 1, 'part-red')] }
  ]);
  var m3 = makeMatch('m3', 'r3', [
    { groupId: 'g3', players: [seat('B', 1, 'part-blue')] }
  ]);
  var out = run(series, 'B', TARGET, { m1: m1, m2: m2, m3: m3 });
  assert(
    '两个不同归属→conflict',
    out.ok === false && out.state === STATE.affiliation_conflict && !out.affiliationId
  );
})();

(function cancelled_ignored() {
  var series = makeSeries([
    { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
    { roundId: 'r2', matchId: 'm2', roundStatus: 'cancelled' }
  ]);
  var m1 = makeMatch('m1', 'r1', [{ groupId: 'g1', players: [seat('A', 1, 'part-red')] }]);
  var m2 = makeMatch('m2', 'r2', [
    { groupId: 'g2', players: [seat('B', 1, 'part-red')] }
  ]);
  m2.status = 'cancelled';
  var out = run(series, 'B', TARGET, { m1: m1, m2: m2 });
  assert('cancelled忽略', out.state === STATE.unlocked && out.evidence.length === 0);
})();

(function exclude_current_seat() {
  var series = makeSeries([
    { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
    { roundId: 'r2', matchId: 'm2', roundStatus: 'upcoming' }
  ]);
  var m1 = makeMatch('m1', 'r1', [
    { groupId: 'g1', players: [seat('B', 1, 'part-red'), seat('C', 2, 'part-blue')] }
  ]);
  var m2 = makeMatch('m2', 'r2', [{ groupId: 'g2', players: [] }]);
  var out = run(series, 'B', TARGET, { m1: m1, m2: m2 });
  assert('当前目标座位精确排除', out.state === STATE.unlocked && out.evidence.length === 0);
})();

(function same_round_other_seat() {
  var series = makeSeries([
    { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
    { roundId: 'r2', matchId: 'm2', roundStatus: 'upcoming' }
  ]);
  var m1 = makeMatch('m1', 'r1', [
    {
      groupId: 'g1',
      players: [seat('A', 1, 'part-red'), seat('B', 2, 'part-blue')]
    }
  ]);
  var m2 = makeMatch('m2', 'r2', [{ groupId: 'g2', players: [] }]);
  var out = run(series, 'B', TARGET, { m1: m1, m2: m2 });
  assert(
    '同轮其他座位不排除',
    out.state === STATE.participation_reservation &&
      out.evidence.length === 1 &&
      out.evidence[0].position === 2
  );
})();

(function station_missing() {
  var series = makeSeries([
    { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
    { roundId: 'r3', matchId: 'm-missing', roundStatus: 'upcoming' }
  ]);
  var m1 = makeMatch('m1', 'r1', [{ groupId: 'g1', players: [seat('A', 1, 'part-red')] }]);
  var out = run(series, 'B', TARGET, { m1: m1 });
  assert(
    'station缺失→incomplete',
    out.state === STATE.projection_incomplete &&
      out.ok === false &&
      out.invalidRounds.length >= 1
  );
})();

(function identity_conflicts() {
  var series = makeSeries([
    { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
    { roundId: 'r2', matchId: 'm2', roundStatus: 'upcoming' }
  ]);
  var m1 = makeMatch('m1', 'r1', [{ groupId: 'g1', players: [seat('A', 1, 'part-red')] }]);
  var badSeries = makeMatch('m2', 'r2', [{ groupId: 'g2', players: [] }]);
  badSeries.seriesContext.seriesId = 'other';
  var outSeries = run(series, 'B', TARGET, { m1: m1, m2: badSeries });
  assert('seriesId冲突→incomplete', outSeries.state === STATE.projection_incomplete);

  var badRound = makeMatch('m2', 'r2', [{ groupId: 'g2', players: [] }]);
  badRound.seriesContext.roundId = 'r9';
  var outRound = run(series, 'B', TARGET, { m1: m1, m2: badRound });
  assert('roundId冲突→incomplete', outRound.state === STATE.projection_incomplete);

  var badTok = makeMatch('m2', 'r2', [{ groupId: 'g2', players: [] }]);
  badTok.seriesContext.publishToken = 'tok-other';
  var outTok = run(series, 'B', TARGET, { m1: m1, m2: badTok });
  assert('publishToken冲突→incomplete', outTok.state === STATE.projection_incomplete);

  var okMatch = makeMatch('m2', 'r2', [{ groupId: 'g2', players: [] }]);
  var outIdx = collect({
    series: series,
    playerId: 'B',
    currentTarget: TARGET,
    getMatchById: function (id) {
      return id === 'm1' ? m1 : okMatch;
    },
    getIndexByMatchId: function (id) {
      if (id === 'm1') {
        return { seriesId: 'ser-1', roundId: 'r1', matchId: 'm1' };
      }
      return { seriesId: 'ser-1', roundId: 'r1', matchId: 'm2' };
    },
    isGroupConfirmedFinished: matchStatus.isGroupConfirmedFinished,
    isMatchCompleted: teamMatchFinish.isMatchCompleted
  });
  assert('index冲突→incomplete', outIdx.state === STATE.projection_incomplete);
})();

(function no_name_match() {
  var series = makeSeries([
    { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
    { roundId: 'r2', matchId: 'm2', roundStatus: 'upcoming' }
  ]);
  var m1 = makeMatch('m1', 'r1', [{ groupId: 'g1', players: [seat('A', 1, 'part-red')] }]);
  var m2 = makeMatch('m2', 'r2', [
    {
      groupId: 'g2',
      players: [seat('X', 1, 'part-red', { displayName: '球员B' })]
    }
  ]);
  var out = run(series, 'B', TARGET, { m1: m1, m2: m2 });
  assert('不按姓名匹配', out.state === STATE.unlocked && out.evidence.length === 0);
})();

(function inputs_frozen() {
  var series = makeSeries([
    { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
    { roundId: 'r2', matchId: 'm2', roundStatus: 'upcoming' }
  ]);
  var m1 = makeMatch('m1', 'r1', [
    { groupId: 'g1', players: [seat('A', 1, 'part-red'), seat('B', 2, 'part-blue')] }
  ]);
  var m2 = makeMatch('m2', 'r2', [{ groupId: 'g2', players: [seat('B', 1, 'part-blue')] }]);
  var s0 = clone(series);
  var m10 = clone(m1);
  var m20 = clone(m2);
  run(series, 'B', TARGET, { m1: m1, m2: m2 });
  assert('输入 series 不变', JSON.stringify(series) === JSON.stringify(s0));
  assert('输入 match 不变', JSON.stringify(m1) === JSON.stringify(m10) && JSON.stringify(m2) === JSON.stringify(m20));
})();

(function ryder_same_derivation() {
  var series = makeSeries(
    [
      { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
      { roundId: 'r2', matchId: 'm2', roundStatus: 'upcoming' }
    ],
    {
      seriesCompetitionType: seriesRyderCup.COMPETITION_TYPE,
      scoringRule: seriesRyderCup.createRyderCupScoringRule()
    }
  );
  var m1 = makeMatch('m1', 'r1', [{ groupId: 'g1', players: [seat('A', 1, 'part-red')] }]);
  var m2 = makeMatch('m2', 'r2', [{ groupId: 'g2', players: [seat('B', 1, 'part-red')] }]);
  var out = run(series, 'B', TARGET, { m1: m1, m2: m2 });
  assert(
    '莱德杯与普通同一归属推导（不看 allowRepeat）',
    out.state === STATE.participation_reservation &&
      out.affiliationId === 'part-red' &&
      series.scoringRule.allowRepeat === true
  );
})();

(function roster_not_evidence() {
  var series = makeSeries([
    { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
    { roundId: 'r2', matchId: 'm2', roundStatus: 'upcoming' }
  ]);
  var m1 = makeMatch('m1', 'r1', [{ groupId: 'g1', players: [seat('A', 1, 'part-red')] }]);
  var m2 = makeMatch('m2', 'r2', [{ groupId: 'g2', players: [] }]);
  var out = run(series, 'B', TARGET, { m1: m1, m2: m2 });
  assert('roster 不是正式上场证据', out.state === STATE.unlocked && out.affiliationId === '');
})();

(function normalize_matchTeamId() {
  var series = makeSeries([
    { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
    { roundId: 'r2', matchId: 'm2', roundStatus: 'upcoming' }
  ]);
  var m1 = makeMatch('m1', 'r1', [{ groupId: 'g1', players: [seat('A', 1, 'part-red')] }]);
  var m2 = makeMatch('m2', 'r2', [
    {
      groupId: 'g2',
      players: [
        {
          position: 1,
          userId: 'B',
          playerId: 'B',
          matchTeamId: 'red'
        }
      ]
    }
  ]);
  var out = run(series, 'B', TARGET, { m1: m1, m2: m2 });
  assert(
    'matchTeamId 归一到 seriesParticipantId',
    out.affiliationId === 'part-red' && out.affiliationKind === 'team'
  );
})();

function divisionParts() {
  return [
    {
      seriesParticipantId: 'division:alpha',
      kind: 'division',
      divisionId: 'alpha',
      sourceTeamId: 'host-club',
      teamId: 'host-club',
      hostTeamId: 'host-club',
      shortNameSnapshot: '甲组'
    },
    {
      seriesParticipantId: 'division:beta',
      kind: 'division',
      divisionId: 'beta',
      sourceTeamId: 'host-club',
      teamId: 'host-club',
      hostTeamId: 'host-club',
      shortNameSnapshot: '乙组'
    }
  ];
}

function divisionSeries() {
  return makeSeries(
    [
      { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
      { roundId: 'r2', matchId: 'm2', roundStatus: 'upcoming' }
    ],
    { hostMode: 'team', participants: divisionParts() }
  );
}

(function division_shared_host_not_first_wins() {
  var series = divisionSeries();
  var m1 = makeMatch('m1', 'r1', [{ groupId: 'g1', players: [seat('A', 1, 'division:alpha')] }]);
  var m2 = makeMatch('m2', 'r2', [
    {
      groupId: 'g2',
      players: [
        {
          position: 1,
          userId: 'B',
          playerId: 'B',
          teamId: 'host-club',
          sourceTeamId: 'host-club',
          matchTeamId: 'host-club'
        }
      ]
    }
  ]);
  var out = run(series, 'B', TARGET, { m1: m1, m2: m2 });
  assert(
    '两个分队共享host team ID时不得映射到第一个分队',
    out.state === STATE.projection_incomplete &&
      out.affiliationId !== 'division:alpha' &&
      out.reason === 'affiliation_unmapped'
  );
})();

(function division_only_host_team_incomplete() {
  var series = divisionSeries();
  var m1 = makeMatch('m1', 'r1', [{ groupId: 'g1', players: [seat('A', 1, 'division:alpha')] }]);
  var m2 = makeMatch('m2', 'r2', [
    { groupId: 'g2', players: [{ position: 1, userId: 'B', playerId: 'B', teamId: 'host-club' }] }
  ]);
  var out = run(series, 'B', TARGET, { m1: m1, m2: m2 });
  assert('分队座位仅有host teamId → incomplete', out.state === STATE.projection_incomplete);
})();

(function division_id_maps() {
  var series = divisionSeries();
  var m1 = makeMatch('m1', 'r1', [{ groupId: 'g1', players: [seat('A', 1, 'division:alpha')] }]);
  var m2 = makeMatch('m2', 'r2', [
    { groupId: 'g2', players: [{ position: 1, userId: 'B', playerId: 'B', divisionId: 'beta' }] }
  ]);
  var out = run(series, 'B', TARGET, { m1: m1, m2: m2 });
  assert(
    'divisionId正确 → 正确分队',
    out.ok && out.affiliationId === 'division:beta' && out.affiliationKind === 'division'
  );
})();

(function org_source_team_maps() {
  var series = makeSeries([
    { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
    { roundId: 'r2', matchId: 'm2', roundStatus: 'upcoming' }
  ]);
  var m1 = makeMatch('m1', 'r1', [{ groupId: 'g1', players: [seat('A', 1, 'part-red')] }]);
  var m2 = makeMatch('m2', 'r2', [
    { groupId: 'g2', players: [{ position: 1, userId: 'B', playerId: 'B', sourceTeamId: 'blue' }] }
  ]);
  var out = run(series, 'B', TARGET, { m1: m1, m2: m2 });
  assert('队际sourceTeamId正确映射', out.affiliationId === 'part-blue');
})();

(function org_duplicate_compat_incomplete() {
  var series = makeSeries(
    [
      { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
      { roundId: 'r2', matchId: 'm2', roundStatus: 'upcoming' }
    ],
    {
      participants: [
        { seriesParticipantId: 'part-red', kind: 'team', sourceTeamId: 'shared' },
        { seriesParticipantId: 'part-blue', kind: 'team', sourceTeamId: 'shared' }
      ]
    }
  );
  var m1 = makeMatch('m1', 'r1', [{ groupId: 'g1', players: [seat('A', 1, 'part-red')] }]);
  var m2 = makeMatch('m2', 'r2', [
    { groupId: 'g2', players: [{ position: 1, userId: 'B', playerId: 'B', matchTeamId: 'shared' }] }
  ]);
  var out = run(series, 'B', TARGET, { m1: m1, m2: m2 });
  assert('兼容key重复 → incomplete', out.state === STATE.projection_incomplete);
})();

(function unknown_explicit_sid() {
  var series = makeSeries([
    { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
    { roundId: 'r2', matchId: 'm2', roundStatus: 'upcoming' }
  ]);
  var m1 = makeMatch('m1', 'r1', [{ groupId: 'g1', players: [seat('A', 1, 'part-red')] }]);
  var m2 = makeMatch('m2', 'r2', [
    { groupId: 'g2', players: [{ position: 1, userId: 'B', playerId: 'B', seriesParticipantId: 'part-unknown' }] }
  ]);
  var out = run(series, 'B', TARGET, { m1: m1, m2: m2 });
  assert('未知显式seriesParticipantId → incomplete', out.state === STATE.projection_incomplete);
})();

(function explicit_sid_field_conflict() {
  var series = divisionSeries();
  var m1 = makeMatch('m1', 'r1', [{ groupId: 'g1', players: [seat('A', 1, 'division:alpha')] }]);
  var m2 = makeMatch('m2', 'r2', [
    {
      groupId: 'g2',
      players: [
        {
          position: 1,
          userId: 'B',
          playerId: 'B',
          seriesParticipantId: 'division:alpha',
          divisionId: 'beta'
        }
      ]
    }
  ]);
  var out = run(series, 'B', TARGET, { m1: m1, m2: m2 });
  assert(
    '显式sid与division字段冲突 → conflict',
    out.state === STATE.affiliation_conflict &&
      (out.reason === 'affiliation_identity_conflict' || out.reason === 'affiliation_conflict')
  );
})();

(function series_missing_token() {
  var series = makeSeries([
    { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
    { roundId: 'r2', matchId: 'm2', roundStatus: 'upcoming' }
  ]);
  series.publishToken = '';
  var m1 = makeMatch('m1', 'r1', [{ groupId: 'g1', players: [seat('A', 1, 'part-red')] }]);
  var m2 = makeMatch('m2', 'r2', [{ groupId: 'g2', players: [] }]);
  var out = run(series, 'B', TARGET, { m1: m1, m2: m2 });
  assert(
    'Series缺publishToken → incomplete',
    out.state === STATE.projection_incomplete && out.reason === 'publish_token_missing'
  );
})();

(function station_missing_token() {
  var series = makeSeries([
    { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
    { roundId: 'r2', matchId: 'm2', roundStatus: 'upcoming' }
  ]);
  var m1 = makeMatch('m1', 'r1', [{ groupId: 'g1', players: [seat('A', 1, 'part-red')] }]);
  var m2 = makeMatch('m2', 'r2', [{ groupId: 'g2', players: [] }]);
  m2.seriesContext.publishToken = '';
  var out = run(series, 'B', TARGET, { m1: m1, m2: m2 });
  assert(
    'station缺publishToken → incomplete',
    out.state === STATE.projection_incomplete && out.reason === 'publish_token_missing'
  );
})();

(function token_mismatch_still_incomplete() {
  var series = makeSeries([
    { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
    { roundId: 'r2', matchId: 'm2', roundStatus: 'upcoming' }
  ]);
  var m1 = makeMatch('m1', 'r1', [{ groupId: 'g1', players: [seat('A', 1, 'part-red')] }]);
  var m2 = makeMatch('m2', 'r2', [{ groupId: 'g2', players: [] }]);
  m2.seriesContext.publishToken = 'tok-other';
  var out = run(series, 'B', TARGET, { m1: m1, m2: m2 });
  assert(
    'token不一致 → incomplete',
    out.state === STATE.projection_incomplete && out.reason === 'publish_token_conflict'
  );
})();

(function current_target_series_mismatch() {
  var series = makeSeries([
    { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
    { roundId: 'r2', matchId: 'm2', roundStatus: 'upcoming' }
  ]);
  var m1 = makeMatch('m1', 'r1', [{ groupId: 'g1', players: [seat('A', 1, 'part-red')] }]);
  var m2 = makeMatch('m2', 'r2', [{ groupId: 'g2', players: [] }]);
  var out = run(
    series,
    'B',
    {
      seriesId: 'ser-other',
      roundId: 'r1',
      matchId: 'm1',
      groupId: 'g1',
      position: 1
    },
    { m1: m1, m2: m2 }
  );
  assert(
    'currentTarget.seriesId不一致 → incomplete',
    out.state === STATE.projection_incomplete && out.reason === 'series_id_conflict'
  );
})();

if (failed.length) {
  console.error('FAIL ' + failed.length + ' / ' + (passed + failed.length));
  failed.forEach(function (n) {
    console.error(' - ' + n);
  });
  process.exit(1);
}
console.log('ok ' + passed + ' assertions seriesLiveAffiliationEvidence.selftest');
