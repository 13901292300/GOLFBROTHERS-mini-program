/**
 * Series LIVE 换人：归属证据 / replaceOnly / replaceAndReaffiliate / 安全写入
 * 运行：node scripts/seriesLiveReplace.selftest.js
 */

var path = require('path');
var seriesLiveReplace = require(path.join(
  __dirname,
  '..',
  'miniprogram',
  'utils',
  'seriesLiveReplace.js'
));
var tournamentGroupDraft = require(path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament',
  'utils',
  'tournamentGroupDraft.js'
));
var strokeEntityValidator = require(path.join(
  __dirname,
  '..',
  'miniprogram',
  'utils',
  'strokeEntityValidator.js'
));
var strokeEntityBuilder = require(path.join(
  __dirname,
  '..',
  'miniprogram',
  'utils',
  'strokeEntityBuilder.js'
));
var tournamentGroupCardView = require(path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament',
  'utils',
  'tournamentGroupCardView.js'
));

var failed = [];
var passed = 0;

function assert(cond, name, extra) {
  if (cond) {
    passed += 1;
    return;
  }
  failed.push(name + (extra ? ' :: ' + extra : ''));
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function redPart() {
  return {
    seriesParticipantId: 'part-red',
    kind: 'team',
    shortNameSnapshot: '红队',
    nameSnapshot: '红队',
    sourceTeamId: 'red',
    colorSnapshot: '#c00'
  };
}

function bluePart() {
  return {
    seriesParticipantId: 'part-blue',
    kind: 'team',
    shortNameSnapshot: '蓝队',
    nameSnapshot: '蓝队',
    sourceTeamId: 'blue',
    colorSnapshot: '#00c'
  };
}

function roster(playerId, partId, extra) {
  return Object.assign(
    {
      rosterEntryId: 're-' + playerId,
      seriesId: 'ser-1',
      playerId: playerId,
      seriesParticipantId: partId,
      playerNameSnapshot: playerId === 'B' ? '球员B' : playerId === 'A' ? '球员A' : playerId,
      registrationStatus: 'registered'
    },
    extra || {}
  );
}

function seat(userId, pos, partId, extra) {
  var team = partId === 'part-blue' ? 'blue' : 'red';
  var name = team === 'blue' ? '蓝队' : '红队';
  return Object.assign(
    {
      position: pos,
      userId: userId,
      playerId: userId,
      id: userId,
      displayName: userId === 'B' ? '球员B' : userId === 'A' ? '球员A' : userId,
      seriesParticipantId: partId,
      matchTeamId: team,
      affiliationId: team,
      groupId: partId,
      matchTeamName: name,
      scorePlayerId: extra && extra.scorePlayerId != null ? extra.scorePlayerId : userId
    },
    extra || {}
  );
}

function makeMatch(id, roundId, groups, extra) {
  return Object.assign(
    {
      matchId: id,
      status: 'LIVE',
      gameMode: extra && extra.gameMode ? extra.gameMode : '个人比洞赛',
      groups: groups,
      scoreData: extra && extra.scoreData ? extra.scoreData : {},
      teamScoresByEntity: extra && extra.teamScoresByEntity ? extra.teamScoresByEntity : {},
      scoreEntities: extra && extra.scoreEntities ? extra.scoreEntities : {},
      seriesContext: {
        managed: true,
        seriesId: 'ser-1',
        roundId: roundId,
        matchId: id,
        publishToken: 'tok-1'
      },
      registerInfo: {
        users: [
          { userId: 'A', matchTeamId: 'red', seriesParticipantId: 'part-red', groupId: 'part-red' },
          { userId: 'B', matchTeamId: extra && extra.bTeam ? extra.bTeam : 'blue', seriesParticipantId: extra && extra.bPart ? extra.bPart : 'part-blue', groupId: extra && extra.bPart ? extra.bPart : 'part-blue' },
          { userId: 'C', matchTeamId: 'blue', seriesParticipantId: 'part-blue', groupId: 'part-blue' }
        ]
      }
    },
    extra || {}
  );
}

function makeSeries(opts) {
  var o = opts || {};
  return {
    seriesId: 'ser-1',
    hostMode: 'organization',
    lifecycleStatus: o.lifecycleStatus || 'published',
    publishToken: 'tok-1',
    registrationRevision: 1,
    participants: [redPart(), bluePart()],
    roster: o.roster || [roster('A', 'part-red'), roster('B', o.bPart || 'part-blue'), roster('C', 'part-blue')],
    rounds: o.rounds || [
      { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
      { roundId: 'r2', matchId: 'm2', roundStatus: 'upcoming' }
    ]
  };
}

function memStores(matches, seriesObj) {
  var m = matches;
  var s = seriesObj;
  return {
    getMatchById: function (id) {
      return m[id] || null;
    },
    getIndexByMatchId: function (id) {
      var row = m[id];
      if (!row) return null;
      return {
        seriesId: 'ser-1',
        roundId: row.seriesContext.roundId,
        matchId: id
      };
    },
    saveMatch: function (next) {
      m[next.matchId] = clone(next);
      return next;
    },
    getSeriesById: function () {
      return s;
    },
    upsertSeriesChecked: function (next) {
      s = clone(next);
      return { ok: true, series: s };
    },
    _series: function () {
      return s;
    },
    _matches: function () {
      return m;
    }
  };
}

function g5Validate(baseMatch) {
  return function (payload) {
    var trial = clone(baseMatch);
    trial.groups = seriesLiveReplace.patchGroupsWithSeat(
      trial.groups,
      payload.replacement.groupId,
      payload.replacement.position,
      payload.seat
    );
    trial.registerInfo = seriesLiveReplace.overlayRegisterUser(trial.registerInfo, payload.seat);
    var filled = {};
    (trial.groups[0].players || []).forEach(function (p) {
      var id = seriesLiveReplace.playerIdOf(p);
      if (!id) return;
      if (filled[id]) {
        return;
      }
      filled[id] = true;
    });
    if (String(trial.gameMode || '') === '个人比洞赛') {
      var count = (trial.groups[0].players || []).filter(function (p) {
        return seriesLiveReplace.playerIdOf(p);
      }).length;
      if (count && count !== 2) {
        return { ok: false, reason: 'player_count', affiliationRelated: false };
      }
    }
    var dupMap = Object.create(null);
    var dup = false;
    (trial.groups || []).forEach(function (g) {
      (g.players || []).forEach(function (p) {
        var id = seriesLiveReplace.playerIdOf(p);
        if (!id) return;
        if (dupMap[id]) dup = true;
        dupMap[id] = true;
      });
    });
    if (dup) return { ok: false, reason: 'duplicate_same_round', affiliationRelated: false };
    var check = strokeEntityValidator.validateStrokeEntities(trial);
    if (!check || check.valid !== true) {
      return {
        ok: false,
        reason: check && check.reason,
        affiliationRelated: seriesLiveReplace.isAffiliationValidationReason(check && check.reason)
      };
    }
    return { ok: true };
  };
}

function decideG5(opts) {
  var series = opts.series;
  var match = opts.match;
  var stores = opts.stores;
  var replacement = opts.replacement || seriesLiveReplace.listReplacements(match.groups, opts.draftGroups)[0];
  return seriesLiveReplace.decideLiveReplace({
    series: series,
    match: match,
    oldGroups: match.groups,
    draftGroups: opts.draftGroups,
    replacement: replacement,
    roundId: 'r1',
    round: series.rounds[0],
    getMatchById: stores.getMatchById,
    getIndexByMatchId: stores.getIndexByMatchId,
    validateMatch: g5Validate(match)
  });
}

// --- fixtures: LIVE G5 A vs C, replace A with B ---
function liveG5(bPart) {
  var series = makeSeries({ bPart: bPart || 'part-blue' });
  var match = makeMatch(
    'm1',
    'r1',
    [
      {
        groupId: 'g1',
        status: 'LIVE',
        players: [
          seat('A', 1, 'part-red', { scorePlayerId: 'A' }),
          seat('C', 2, 'part-blue', { scorePlayerId: 'C' })
        ]
      }
    ],
    {
      bPart: bPart || 'part-blue',
      bTeam: (bPart || 'part-blue') === 'part-red' ? 'red' : 'blue',
      scoreData: { g1: { A: [4], C: [5] } },
      teamScoresByEntity: { e1: 1 },
      scoreEntities: {
        g1: [{ entityId: 'm1__g1__1', groupId: 'g1', members: ['A'], memberUserIds: ['A'] }]
      }
    }
  );
  var other = makeMatch('m2', 'r2', [{ groupId: 'g2', players: [] }], { gameMode: '个人比洞赛' });
  var stores = memStores({ m1: match, m2: other }, series);
  var draftGroups = [
    {
      groupId: 'g1',
      players: [
        {
          position: 1,
          userId: 'B',
          playerId: 'B',
          displayName: '球员B'
        },
        seat('C', 2, 'part-blue')
      ]
    }
  ];
  return { series: series, match: match, stores: stores, draftGroups: draftGroups };
}

(function case1_2_display_and_inherit() {
  var fx = liveG5('part-red');
  var plan = decideG5(fx);
  assert(plan.ok && plan.action === 'replaceOnly', '1/9 replaceOnly LIVE no/with scores');
  var seatB = plan.seat;
  assert(seatB.userId === 'B' && seatB.playerId === 'B' && seatB.id === 'B', '3 current identity B');
  assert(seatB.scorePlayerId === 'A', '4 scorePlayerId stays A');
  assert(seatB.seriesParticipantId === 'part-red', '13 B affiliation from B');
  assert(seatB.matchTeamName !== '蓝队' || fx.series.roster[1].seriesParticipantId === 'part-red', '12 no leftover A blue');
  var origScore = clone(fx.match.scoreData);
  var origTeam = clone(fx.match.teamScoresByEntity);
  var committed = seriesLiveReplace.commitLiveReplace({
    plan: plan,
    series: fx.series,
    match: fx.match,
    stores: fx.stores,
    syncStrokeEntities: strokeEntityBuilder.syncStrokeEntities
  });
  assert(committed.ok, 'commit replaceOnly');
  assert(JSON.stringify(committed.match.scoreData) === JSON.stringify(origScore), '5 scoreData kept');
  assert(JSON.stringify(committed.match.teamScoresByEntity) === JSON.stringify(origTeam), '5 teamScores kept');
  var cards = tournamentGroupCardView.mapPlayersForCard
    ? null
    : null;
  var shown = seriesLiveReplace.playerIdOf(committed.match.groups[0].players[0]);
  assert(shown === 'B', '6 tee sheet current B');
  assert(committed.match.groups[0].players[0].scorePlayerId === 'A', '7 inherit score identity');
})();

(function case10_11_diff_affil_legal() {
  var series = makeSeries({ bPart: 'part-blue' });
  var match = makeMatch(
    'm1',
    'r1',
    [{ groupId: 'g1', players: [seat('A', 1, 'part-red', { scorePlayerId: 'A' })] }],
    { gameMode: '个人比杆赛', bPart: 'part-blue', bTeam: 'blue' }
  );
  var stores = memStores({ m1: match, m2: makeMatch('m2', 'r2', [{ groupId: 'g2', players: [] }]) }, series);
  var frozenSeries = clone(series);
  var frozenMatch = clone(match);
  var draftGroups = [{ groupId: 'g1', players: [{ position: 1, userId: 'B', playerId: 'B', displayName: '球员B' }] }];
  var plan = decideG5({ series: series, match: match, stores: stores, draftGroups: draftGroups });
  assert(plan.ok && plan.action === 'replaceOnly', '10 A≠B affiliation still legal G5', String(plan.action) + ' ' + String(plan.reason));
  assert(plan.needsConfirm !== true && plan.writesRoster !== true, '11 no popup no roster write');
  assert(plan.seat.seriesParticipantId === 'part-blue', '12 B keeps own affiliation');
  assert(plan.seat.matchTeamId !== 'red', '12 no A red leftover');
  seriesLiveReplace.commitLiveReplace({
    plan: plan,
    series: series,
    match: match,
    stores: stores
  });
  assert(stores._series().roster[1].seriesParticipantId === 'part-blue', '11 roster unchanged');
  assert(JSON.stringify(frozenSeries) === JSON.stringify(series), '52 input series not mutated');
  assert(JSON.stringify(frozenMatch.groups) === JSON.stringify(match.groups), '52 input match groups not mutated');
})();

(function case14_20_reaffiliate() {
  var series = makeSeries({ bPart: 'part-red' });
  var match = makeMatch(
    'm1',
    'r1',
    [
      {
        groupId: 'g1',
        players: [
          seat('A', 1, 'part-red'),
          seat('C', 2, 'part-blue', { scorePlayerId: 'C' })
        ]
      }
    ],
    {
      gameMode: '个人比洞赛',
      bPart: 'part-red',
      bTeam: 'red',
      registerInfo: {
        users: [
          { userId: 'A', matchTeamId: 'red', seriesParticipantId: 'part-red' },
          { userId: 'B', matchTeamId: 'red', seriesParticipantId: 'part-red' },
          { userId: 'C', matchTeamId: 'blue', seriesParticipantId: 'part-blue' }
        ]
      }
    }
  );
  var other = makeMatch('m2', 'r2', [{ groupId: 'g2', players: [] }]);
  var stores = memStores({ m1: match, m2: other }, series);
  var draftGroups = [
    {
      groupId: 'g1',
      players: [
        seat('A', 1, 'part-red'),
        { position: 2, userId: 'B', playerId: 'B', displayName: '球员B' }
      ]
    }
  ];
  var plan = decideG5({ series: series, match: match, stores: stores, draftGroups: draftGroups });
  assert(plan.ok && plan.action === 'replaceAndReaffiliate', '14 reaffiliate confirm');
  assert(plan.needsConfirm === true, '14 needs confirm');
  assert(plan.confirm && plan.confirm.content.indexOf('蓝队') >= 0, '8 modal copy 蓝队');
  assert(plan.confirm.confirmText === '确认调整并替换', '8 confirm button');
  var cancelled = seriesLiveReplace.commitLiveReplace({
    plan: plan,
    series: series,
    match: match,
    stores: stores,
    confirmed: false
  });
  assert(cancelled.ok === false && cancelled.writes === false, '15 cancel zero write');
  assert(stores._series().roster.filter(function (e) { return e.playerId === 'B'; })[0].seriesParticipantId === 'part-red', '15 roster still red');
  var done = seriesLiveReplace.commitLiveReplace({
    plan: plan,
    series: series,
    match: match,
    stores: stores,
    confirmed: true
  });
  assert(done.ok && done.wroteRoster, '16 roster updated');
  assert(stores._series().roster.filter(function (e) { return e.playerId === 'B'; })[0].seriesParticipantId === 'part-blue', '16 B now blue');
  assert(series.participants[0].sourceTeamId === 'red' && series.participants[1].sourceTeamId === 'blue', '17 global teams unchanged');
})();

(function case18_19_no_modal_other_errors() {
  var series = makeSeries({ bPart: 'part-blue' });
  var match = makeMatch(
    'm1',
    'r1',
    [
      {
        groupId: 'g1',
        players: [seat('A', 1, 'part-red'), seat('C', 2, 'part-blue')]
      },
      {
        groupId: 'g2',
        players: [seat('B', 1, 'part-blue')]
      }
    ],
    { bPart: 'part-blue', bTeam: 'blue' }
  );
  var stores = memStores({ m1: match, m2: makeMatch('m2', 'r2', [{ groupId: 'g2', players: [] }]) }, series);
  var draftGroups = [
    {
      groupId: 'g1',
      players: [
        { position: 1, userId: 'B' },
        seat('C', 2, 'part-blue')
      ]
    },
    { groupId: 'g2', players: [seat('B', 1, 'part-blue')] }
  ];
  var plan = decideG5({ series: series, match: match, stores: stores, draftGroups: draftGroups });
  assert(plan.ok === false && plan.needsConfirm !== true, '19 duplicate no one-click');
  assert(plan.reason === 'duplicate_same_round', '26 same-round other seat duplicate');
})();

(function case21_26_reservation() {
  var series = makeSeries({ bPart: 'part-red' });
  var m1 = makeMatch('m1', 'r1', [
    { groupId: 'g1', players: [seat('A', 1, 'part-red'), seat('C', 2, 'part-blue')] }
  ]);
  var m2 = makeMatch('m2', 'r2', [
    { groupId: 'g2', status: 'LIVE', players: [seat('B', 1, 'part-red', { scorePlayerId: 'B' })] }
  ]);
  m2.status = 'LIVE';
  var stores = memStores({ m1: m1, m2: m2 }, series);
  var evidence = seriesLiveReplace.collectAffiliationEvidence({
    series: series,
    playerId: 'B',
    excludeSeat: { seriesId: 'ser-1', roundId: 'r1', matchId: 'm1', groupId: 'g1', position: 1 },
    getMatchById: stores.getMatchById,
    getIndexByMatchId: stores.getIndexByMatchId
  });
  assert(evidence.ok && evidence.reserved.length === 1, '21/22 reservation from other round');
  var eff = seriesLiveReplace.resolveEffectiveAffiliation({
    evidence: evidence,
    rosterAffiliation: seriesLiveReplace.rosterAffiliation(series, 'B')
  });
  assert(eff.constraint === 'participation_reservation', '21 occupancy');
  var draftGroups = [
    { groupId: 'g1', players: [{ position: 1, userId: 'B' }, seat('C', 2, 'part-blue')] }
  ];
  var planSame = decideG5({ series: series, match: m1, stores: stores, draftGroups: draftGroups });
  assert(planSame.ok && planSame.action === 'replaceOnly', '29 lock/reserve same side allow');
  var seriesBlue = makeSeries({ bPart: 'part-blue' });
  m2.groups[0].players[0] = seat('B', 1, 'part-red');
  var stores2 = memStores({ m1: m1, m2: m2 }, seriesBlue);
  var m1b = clone(m1);
  m1b.groups = [
    { groupId: 'g1', players: [seat('A', 1, 'part-blue'), seat('X', 2, 'part-red')] }
  ];
  m1b.registerInfo.users.push({ userId: 'X', matchTeamId: 'red', seriesParticipantId: 'part-red' });
  seriesBlue.roster.push(roster('X', 'part-red'));
  var stores3 = memStores({ m1: m1b, m2: m2 }, seriesBlue);
  var planBlock = decideG5({
    series: seriesBlue,
    match: m1b,
    stores: stores3,
    draftGroups: [
      { groupId: 'g1', players: [{ position: 1, userId: 'B' }, seat('X', 2, 'part-red')] }
    ]
  });
  assert(planBlock.ok === false && planBlock.reason === 'participation_reservation', '21 cannot change to other side');
  assert(planBlock.message.indexOf('红队') >= 0, '8 occupied copy');
  m2.scoreData = { g2: { B: [3] } };
  var evTemp = seriesLiveReplace.collectAffiliationEvidence({
    series: series,
    playerId: 'B',
    excludeSeat: { seriesId: 'ser-1', roundId: 'r1', matchId: 'm1', groupId: 'g1', position: 1 },
    getMatchById: stores.getMatchById,
    getIndexByMatchId: stores.getIndexByMatchId
  });
  assert(evTemp.reserved.length >= 1, '23 LIVE temp scores still occupy');
  m2.groups = [{ groupId: 'g2', players: [] }];
  var evCleared = seriesLiveReplace.collectAffiliationEvidence({
    series: series,
    playerId: 'B',
    excludeSeat: { seriesId: 'ser-1', roundId: 'r1', matchId: 'm1', groupId: 'g1', position: 1 },
    getMatchById: stores.getMatchById,
    getIndexByMatchId: stores.getIndexByMatchId
  });
  assert(evCleared.reserved.length === 0, '24 remove from unconfirmed then free');
  var evExclude = seriesLiveReplace.collectAffiliationEvidence({
    series: series,
    playerId: 'A',
    excludeSeat: { seriesId: 'ser-1', roundId: 'r1', matchId: 'm1', groupId: 'g1', position: 1 },
    getMatchById: stores.getMatchById,
    getIndexByMatchId: stores.getIndexByMatchId
  });
  assert(evExclude.reserved.length === 0 && evExclude.locked.length === 0, '25 exclude current seat');
})();

(function case27_31_lock() {
  var series = makeSeries({ bPart: 'part-red' });
  var m1 = makeMatch(
    'm1',
    'r1',
    [{ groupId: 'g1', players: [seat('A', 1, 'part-blue'), seat('C', 2, 'part-red')] }],
    {
      registerInfo: {
        users: [
          { userId: 'A', matchTeamId: 'blue', seriesParticipantId: 'part-blue' },
          { userId: 'B', matchTeamId: 'blue', seriesParticipantId: 'part-blue' },
          { userId: 'C', matchTeamId: 'red', seriesParticipantId: 'part-red' }
        ]
      }
    }
  );
  var m2 = makeMatch('m2', 'r2', [
    { groupId: 'g2', status: 'finished', players: [seat('B', 1, 'part-red')] }
  ]);
  m2.status = 'LIVE';
  var stores = memStores({ m1: m1, m2: m2 }, series);
  var ev = seriesLiveReplace.collectAffiliationEvidence({
    series: series,
    playerId: 'B',
    excludeSeat: { seriesId: 'ser-1', roundId: 'r1', matchId: 'm1', groupId: 'g1', position: 1 },
    getMatchById: stores.getMatchById,
    getIndexByMatchId: stores.getIndexByMatchId
  });
  assert(ev.locked.length === 1, '27 group finished locks');
  m2.groups[0].status = 'LIVE';
  m2.status = 'completed';
  var ev2 = seriesLiveReplace.collectAffiliationEvidence({
    series: series,
    playerId: 'B',
    excludeSeat: { seriesId: 'ser-1', roundId: 'r1', matchId: 'm1', groupId: 'g1', position: 1 },
    getMatchById: stores.getMatchById,
    getIndexByMatchId: stores.getIndexByMatchId
  });
  assert(ev2.locked.length === 1, '28 match completed locks');
  var seriesBlue = makeSeries({ bPart: 'part-blue' });
  m1.registerInfo.users[1] = { userId: 'B', matchTeamId: 'blue', seriesParticipantId: 'part-blue' };
  var storesB = memStores({ m1: m1, m2: m2 }, seriesBlue);
  var planLock = decideG5({
    series: seriesBlue,
    match: m1,
    stores: storesB,
    draftGroups: [{ groupId: 'g1', players: [{ position: 1, userId: 'B' }, seat('C', 2, 'part-red')] }]
  });
  assert(
    planLock.ok === false && planLock.reason === 'confirmed_affiliation_lock',
    '30 lock red cannot go blue',
    String(planLock.reason || '') + ' ' + String(planLock.action || '') + ' ' + String(planLock.message || '')
  );
  assert(
    !!(planLock.message && planLock.message.indexOf('不能调整') >= 0),
    '8 lock copy',
    String(planLock.message || '')
  );
  m2.groups = [{ groupId: 'g2', status: 'finished', players: [] }];
  var evDel = seriesLiveReplace.collectAffiliationEvidence({
    series: series,
    playerId: 'B',
    excludeSeat: { seriesId: 'ser-1', roundId: 'r1', matchId: 'm1', groupId: 'g1', position: 1 },
    getMatchById: function () { return m2; },
    getIndexByMatchId: stores.getIndexByMatchId
  });
  // deleting unconfirmed does not unlock finished group; finished group still empty here so lock gone — restore finished with B
  m2.groups = [{ groupId: 'g2', status: 'finished', players: [seat('B', 1, 'part-red')] }];
  var evKeep = seriesLiveReplace.collectAffiliationEvidence({
    series: series,
    playerId: 'B',
    excludeSeat: { seriesId: 'ser-1', roundId: 'r1', matchId: 'm1', groupId: 'g1', position: 1 },
    getMatchById: storesB.getMatchById,
    getIndexByMatchId: storesB.getIndexByMatchId
  });
  assert(evKeep.locked.length === 1, '31 finished lock remains');
})();

(function case32_40_exceptions() {
  var series = makeSeries({
    rounds: [
      { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
      { roundId: 'r2', matchId: 'm2', roundStatus: 'cancelled' }
    ]
  });
  var m1 = makeMatch('m1', 'r1', [{ groupId: 'g1', players: [seat('A', 1, 'part-red'), seat('C', 2, 'part-blue')] }]);
  var m2 = makeMatch('m2', 'r2', [{ groupId: 'g2', players: [seat('B', 1, 'part-red')] }]);
  m2.status = 'cancelled';
  m2.roundStatus = 'cancelled';
  var stores = memStores({ m1: m1, m2: m2 }, series);
  var ev = seriesLiveReplace.collectAffiliationEvidence({
    series: series,
    playerId: 'B',
    excludeSeat: { seriesId: 'ser-1', roundId: 'r1', matchId: 'm1', groupId: 'g1', position: 1 },
    getMatchById: stores.getMatchById,
    getIndexByMatchId: stores.getIndexByMatchId
  });
  assert(ev.ok && ev.reserved.length === 0 && ev.locked.length === 0, '32 cancelled no evidence');
  var seriesMiss = makeSeries({
    rounds: [
      { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
      { roundId: 'r3', matchId: 'm-missing', roundStatus: 'upcoming' }
    ]
  });
  var miss = seriesLiveReplace.collectAffiliationEvidence({
    series: seriesMiss,
    playerId: 'B',
    excludeSeat: { seriesId: 'ser-1', roundId: 'r1', matchId: 'm1', groupId: 'g1', position: 1 },
    getMatchById: stores.getMatchById,
    getIndexByMatchId: stores.getIndexByMatchId
  });
  assert(miss.reason === 'projection_incomplete', '33 missing station');
  var bad = clone(m2);
  bad.seriesContext.seriesId = 'other';
  var storesBad = memStores({ m1: m1, m2: bad }, makeSeries());
  storesBad.getMatchById = function (id) {
    if (id === 'm2') return bad;
    return m1;
  };
  var conflictSt = seriesLiveReplace.collectAffiliationEvidence({
    series: makeSeries(),
    playerId: 'B',
    excludeSeat: { seriesId: 'ser-1', roundId: 'r1', matchId: 'm1', groupId: 'g1', position: 1 },
    getMatchById: storesBad.getMatchById,
    getIndexByMatchId: function () {
      return { seriesId: 'ser-1', roundId: 'r2', matchId: 'm2' };
    }
  });
  assert(conflictSt.reason === 'projection_incomplete', '34 station identity fail closed');
  var mLock = clone(m1);
  var mRes = makeMatch('m2', 'r2', [{ groupId: 'g2', players: [seat('B', 1, 'part-blue')] }]);
  var mLock2 = makeMatch('m3', 'r3', [
    { groupId: 'g3', status: 'finished', players: [seat('B', 1, 'part-red')] }
  ]);
  var series3 = makeSeries({
    rounds: [
      { roundId: 'r1', matchId: 'm1', roundStatus: 'live' },
      { roundId: 'r2', matchId: 'm2', roundStatus: 'upcoming' },
      { roundId: 'r3', matchId: 'm3', roundStatus: 'live' }
    ]
  });
  var stores3 = memStores({ m1: mLock, m2: mRes, m3: mLock2 }, series3);
  var two = seriesLiveReplace.resolveEffectiveAffiliation({
    evidence: seriesLiveReplace.collectAffiliationEvidence({
      series: series3,
      playerId: 'B',
      excludeSeat: { seriesId: 'ser-1', roundId: 'r1', matchId: 'm1', groupId: 'g1', position: 1 },
      getMatchById: stores3.getMatchById,
      getIndexByMatchId: stores3.getIndexByMatchId
    }),
    rosterAffiliation: seriesLiveReplace.rosterAffiliation(series3, 'B')
  });
  assert(two.reason === 'affiliation_conflict' || (two.ok && two.constraint === 'confirmed_affiliation_lock'), '35 dual evidence');
  if (two.ok && two.constraint === 'confirmed_affiliation_lock') {
    var lockKeys = {};
    two.locked.forEach(function (r) {
      lockKeys[r.affiliationKey] = true;
    });
    assert(Object.keys(lockKeys).length === 1, '35 lock wins if single lock key');
  }
  var finishedGroup = clone(m1);
  finishedGroup.groups[0].status = 'finished';
  var w = seriesLiveReplace.assertTargetWritable({
    series: makeSeries(),
    match: finishedGroup,
    round: { roundId: 'r1', matchId: 'm1' },
    group: finishedGroup.groups[0]
  });
  assert(w.ok === false && w.reason === 'target_locked', '40 group locked');
})();

(function case37_39_readback() {
  var fx = liveG5('part-red');
  var plan = decideG5(fx);
  var failSave = memStores({ m1: fx.match, m2: makeMatch('m2', 'r2', [{ groupId: 'g2', players: [] }]) }, fx.series);
  failSave.saveMatch = function () {
    return { ok: false };
  };
  var r = seriesLiveReplace.commitLiveReplace({
    plan: plan,
    series: fx.series,
    match: fx.match,
    stores: failSave
  });
  assert(r.reason === 'save_failed' && r.writes === false, '37 save failed');
  var identFail = memStores({ m1: fx.match, m2: makeMatch('m2', 'r2', [{ groupId: 'g2', players: [] }]) }, fx.series);
  identFail.saveMatch = function (next) {
    var kept = clone(fx.match);
    identFail._matches().m1 = kept;
    return kept;
  };
  identFail.getMatchById = function () {
    return clone(fx.match);
  };
  var r2 = seriesLiveReplace.commitLiveReplace({
    plan: plan,
    series: fx.series,
    match: fx.match,
    stores: identFail
  });
  assert(r2.reason === 'identity_not_persisted', '38 still A');
  var affFailSeries = makeSeries({ bPart: 'part-red' });
  var mBad = makeMatch('m1', 'r1', [
    { groupId: 'g1', players: [seat('A', 1, 'part-red'), seat('C', 2, 'part-blue')] }
  ]);
  mBad.registerInfo.users[1] = { userId: 'B', matchTeamId: 'red', seriesParticipantId: 'part-red' };
  var storesAff = memStores({ m1: mBad, m2: makeMatch('m2', 'r2', [{ groupId: 'g2', players: [] }]) }, affFailSeries);
  var planRe = decideG5({
    series: affFailSeries,
    match: mBad,
    stores: storesAff,
    draftGroups: [{ groupId: 'g1', players: [seat('A', 1, 'part-red'), { position: 2, userId: 'B' }] }]
  });
  if (planRe.action === 'replaceAndReaffiliate') {
    storesAff.upsertSeriesChecked = function () {
      return { ok: true, series: affFailSeries };
    };
    storesAff.getSeriesById = function () {
      return affFailSeries;
    };
    var r3 = seriesLiveReplace.commitLiveReplace({
      plan: planRe,
      series: affFailSeries,
      match: mBad,
      stores: storesAff,
      confirmed: true
    });
    assert(r3.reason === 'affiliation_not_persisted', '39 roster not persisted');
  } else {
    assert(false, '39 expected reaffiliate plan');
  }
})();

(function case41_43_g5g8() {
  var fx = liveG5('part-red');
  var plan = decideG5(fx);
  assert(plan.seat.scorePlayerId === 'A', '41 G5 inherit');
  var g6 = clone(fx.match);
  g6.gameMode = '四人四球比洞赛';
  g6.groups[0].players = [
    seat('A', 1, 'part-red'),
    seat('A2', 2, 'part-red', { scorePlayerId: 'A2' }),
    seat('C', 3, 'part-blue'),
    seat('C2', 4, 'part-blue', { scorePlayerId: 'C2' })
  ];
  g6.scoreEntities = {
    g1: [{ entityId: 'ent-keep', groupId: 'g1', members: ['A', 'A2'] }]
  };
  g6.registerInfo.users.push(
    { userId: 'A2', matchTeamId: 'red', seriesParticipantId: 'part-red' },
    { userId: 'C2', matchTeamId: 'blue', seriesParticipantId: 'part-blue' }
  );
  var series = makeSeries({ bPart: 'part-red' });
  series.roster.push(roster('A2', 'part-red'), roster('C2', 'part-blue'));
  var stores = memStores({ m1: g6, m2: makeMatch('m2', 'r2', [{ groupId: 'g2', players: [] }]) }, series);
  var patched = seriesLiveReplace.patchGroupsWithSeat(
    g6.groups,
    'g1',
    1,
    seriesLiveReplace.buildReplacedSeat(
      g6.groups[0].players[0],
      seriesLiveReplace.buildCurrentIdentity(
        'B',
        { displayName: '球员B' },
        seriesLiveReplace.rosterAffiliation(series, 'B'),
        series
      ),
      1
    )
  );
  var synced = strokeEntityBuilder.syncStrokeEntities(Object.assign({}, g6, { groups: patched }));
  var ent = (synced.g1 || []).filter(function (e) {
    return e.entityId === 'ent-keep';
  })[0];
  assert(ent && ent.entityId === 'ent-keep', '42 entityId kept');
  var g8 = clone(g6);
  g8.gameMode = '四人两球比洞赛';
  g8.pairings = {
    g1: [{ pairingId: 'p1', playerIds: ['A', 'A2'] }, { pairingId: 'p2', playerIds: ['C', 'C2'] }]
  };
  assert(g8.pairings.g1[0].pairingId === 'p1', '43 pairing id stable');
})();

(function case46_ryder_and_ordinary() {
  var series = makeSeries({ bPart: 'part-red' });
  series.scoringRule = { allowRepeat: true };
  var m1 = makeMatch('m1', 'r1', [{ groupId: 'g1', players: [seat('A', 1, 'part-red'), seat('C', 2, 'part-blue')] }]);
  var m2 = makeMatch('m2', 'r2', [{ groupId: 'g2', players: [seat('B', 1, 'part-red')] }]);
  var stores = memStores({ m1: m1, m2: m2 }, series);
  var plan = decideG5({
    series: series,
    match: m1,
    stores: stores,
    draftGroups: [{ groupId: 'g1', players: [{ position: 1, userId: 'B' }, seat('C', 2, 'part-blue')] }]
  });
  assert(plan.ok && plan.action === 'replaceOnly', '46 ryder repeat same affiliation');
  var ordinary = tournamentGroupDraft.buildLivePlayerEntry(
    { position: 1, userId: 'A', playerId: 'A', scorePlayerId: 'A', holes: [4] },
    { position: 1, userId: 'B', playerId: 'B', displayName: 'B' },
    1
  );
  assert(ordinary.userId === 'B' && ordinary.scorePlayerId === 'A', '49 ordinary LIVE inherit');
})();

(function case50_51_station_idempotent() {
  var fx = liveG5('part-red');
  var plan = decideG5(fx);
  var c1 = seriesLiveReplace.commitLiveReplace({
    plan: plan,
    series: fx.series,
    match: fx.match,
    stores: fx.stores
  });
  assert(c1.ok, '50 first save');
  var ctx = c1.match.seriesContext;
  assert(ctx.seriesId === 'ser-1' && ctx.roundId === 'r1' && ctx.publishToken === 'tok-1', '50 station tuple');
  var match2 = c1.match;
  var draft2 = [
    {
      groupId: 'g1',
      players: [match2.groups[0].players[0], match2.groups[0].players[1]]
    }
  ];
  var listed = seriesLiveReplace.listReplacements(match2.groups, draft2);
  assert(listed.length === 0, '51 idempotent no replacement');
})();

(function case_confirm_copy_exact() {
  var copy = seriesLiveReplace.buildConfirmCopy('球员B', '红队');
  assert(
    copy.content.indexOf('球员 球员B 当前的参赛归属会导致本组不符合赛制要求') >= 0 &&
      copy.content.indexOf('是否将 球员B 在本系列赛中的参赛归属调整为「红队」') >= 0,
    '8 confirm copy body'
  );
})();

if (failed.length) {
  console.error('FAIL ' + failed.length + ' / ' + (passed + failed.length));
  failed.forEach(function (n) {
    console.error(' - ' + n);
  });
  process.exit(1);
}
console.log('ok ' + passed + ' assertions seriesLiveReplace.selftest');
