/**
 * LIVE 座位成绩绑定 / 分组身份纠正
 * 运行：node scripts/seriesLiveSeatScoreBinding.selftest.js
 */
var path = require('path');
var seriesTestPaths = require('./lib/seriesTestPaths.js');
var draft = require(seriesTestPaths.util('tournamentGroupDraft.js'));
var identity = require(seriesTestPaths.util('seriesLiveIdentityCorrection.js'));
var cls = require(seriesTestPaths.util('seriesLiveSingleReplaceClassifier.js'));
var flow = require(seriesTestPaths.util('seriesLiveSingleReplaceFlow.js'));
var batch = require(seriesTestPaths.util('seriesLiveBatchReplace.js'));
var journalMod = require(seriesTestPaths.util('seriesLiveMutationJournal.js'));
var validator = require(path.join(__dirname, '..', 'miniprogram', 'utils', 'strokeEntityValidator.js'));

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

function holesOf(seed) {
  var out = [];
  for (var i = 1; i <= 18; i++) out.push({ hole: i, score: seed + i });
  return out;
}

function seat(id, pos, team, extra) {
  return Object.assign(
    {
      position: pos,
      userId: id,
      playerId: id,
      id: id,
      displayName: id,
      seriesParticipantId: team,
      matchTeamId: team,
      teamId: team,
      scorePlayerId: id,
      holes: holesOf(id.charCodeAt(0))
    },
    extra || {}
  );
}

function group(id, players) {
  return { groupId: id, groupName: id, players: players };
}

function usersFrom(players) {
  return players.map(function (p) {
    return {
      userId: p.userId,
      matchTeamId: p.matchTeamId,
      groupId: p.matchTeamId,
      seriesParticipantId: p.seriesParticipantId,
      displayName: p.userId
    };
  });
}

function abcWorld() {
  var g1 = [
    seat('A', 1, 'red'),
    seat('P', 2, 'red'),
    seat('Q', 3, 'blue'),
    seat('R', 4, 'blue')
  ];
  var g2 = [
    seat('B', 1, 'red'),
    seat('S', 2, 'red'),
    seat('T', 3, 'green'),
    seat('U', 4, 'green')
  ];
  var beforeGroups = [group('g1', g1), group('g2', g2)];
  var afterDraft = [
    group('g1', [seat('C', 1, 'red'), g1[1], g1[2], g1[3]]),
    group('g2', [seat('A', 1, 'red'), g2[1], g2[2], g2[3]])
  ];
  var afterGroups = draft.rematerializeLivePlayersAfterNormalize(
    draft.applyLiveGroupsFromDraft(beforeGroups, afterDraft),
    beforeGroups
  );
  var scoreData = {
    g1: { scoresByPlayer: { A: { scores: holesOf(65) }, P: { scores: holesOf(80) } } },
    g2: { scoresByPlayer: { B: { scores: holesOf(66) }, S: { scores: holesOf(83) } } }
  };
  var registerUsers = usersFrom(g1.concat(g2)).concat([
    { userId: 'C', matchTeamId: 'red', groupId: 'red', seriesParticipantId: 'red', displayName: 'C' }
  ]);
  var beforeMatch = {
    matchId: 'm1',
    status: 'ongoing',
    gameMode: '四人四球比杆赛',
    strokeCompositionMode: '2+2',
    scoreData: clone(scoreData),
    teamScores: {},
    teamScoresByEntity: {},
    seriesContext: {
      managed: true,
      seriesId: 'ser-1',
      roundId: 'r1',
      matchId: 'm1',
      publishToken: 'tok'
    },
    groups: beforeGroups,
    pairings: {},
    registerInfo: { users: registerUsers, totalCount: registerUsers.length }
  };
  var afterMatch = Object.assign({}, clone(beforeMatch), {
    groups: afterGroups,
    strokeCompositionMode: '2+2',
    scoreData: clone(scoreData)
  });
  var series = {
    seriesId: 'ser-1',
    publishToken: 'tok',
    lifecycleStatus: 'published',
    roster: ['A', 'B', 'C', 'P', 'Q', 'R', 'S', 'T', 'U'].map(function (id) {
      var team = id === 'Q' || id === 'R' ? 'blue' : id === 'T' || id === 'U' ? 'green' : 'red';
      return {
        userId: id,
        registrationStatus: 'registered',
        seriesParticipantId: team,
        rosterEntryId: 'r-' + id
      };
    })
  };
  return { beforeMatch: beforeMatch, afterMatch: afterMatch, series: series, beforeGroups: beforeGroups };
}

function memJournal() {
  var mem = { data: null };
  return journalMod.createSeriesLiveMutationJournal({
    getItem: function () {
      return { ok: true, value: mem.data };
    },
    setItem: function (_key, value) {
      mem.data = value;
      return { ok: true };
    }
  });
}

(function abc_scores_stay_on_seats() {
  var w = abcWorld();
  var g1 = w.afterMatch.groups[0].players;
  var g2 = w.afterMatch.groups[1].players;
  assert(
    'A/B 洞成绩不随人走：C 得 A 原位，A 得 B 原位',
    g1[0].userId === 'C' &&
      JSON.stringify(g1[0].holes) === JSON.stringify(w.beforeGroups[0].players[0].holes) &&
      g1[0].scorePlayerId === 'C' &&
      g2[0].userId === 'A' &&
      JSON.stringify(g2[0].holes) === JSON.stringify(w.beforeGroups[1].players[0].holes) &&
      g2[0].scorePlayerId === 'A'
  );
  var onField = {};
  w.afterMatch.groups.forEach(function (g) {
    g.players.forEach(function (p) {
      if (p.userId) onField[p.userId] = true;
    });
  });
  assert('B 不在场上', !onField.B && onField.A && onField.C);
})();

(function same_group_swap_scores() {
  var before = [
    group('g1', [seat('A', 1, 'red'), seat('C', 2, 'blue'), seat('P', 3, 'red'), seat('Q', 4, 'blue')])
  ];
  var afterDraft = [
    group('g1', [seat('C', 1, 'blue'), seat('A', 2, 'red'), before[0].players[2], before[0].players[3]])
  ];
  var next = draft.remapLiveScoreIdentityByPlayerId(
    before,
    draft.applyLiveGroupsFromDraft(before, afterDraft)
  );
  assert(
    '同组换位成绩原地',
    next[0].players[0].userId === 'C' &&
      JSON.stringify(next[0].players[0].holes) === JSON.stringify(before[0].players[0].holes) &&
      next[0].players[1].userId === 'A' &&
      JSON.stringify(next[0].players[1].holes) === JSON.stringify(before[0].players[1].holes)
  );
})();

(function cross_group_swap_scores() {
  var before = [group('g1', [seat('A', 1, 'red')]), group('g2', [seat('X', 1, 'blue')])];
  var afterDraft = [group('g1', [seat('X', 1, 'blue')]), group('g2', [seat('A', 1, 'red')])];
  var next = draft.remapLiveScoreIdentityByPlayerId(
    before,
    draft.applyLiveGroupsFromDraft(before, afterDraft)
  );
  assert(
    '跨组换位成绩原地',
    next[0].players[0].userId === 'X' &&
      JSON.stringify(next[0].players[0].holes) === JSON.stringify(before[0].players[0].holes) &&
      next[1].players[0].userId === 'A' &&
      JSON.stringify(next[1].players[0].holes) === JSON.stringify(before[1].players[0].holes)
  );
})();

(function delete_then_add() {
  var before = [group('g1', [seat('A', 1, 'red'), seat('P', 2, 'red')])];
  var emptied = draft.applyLiveGroupsFromDraft(before, [group('g1', [{ position: 1, userId: '' }, seat('P', 2, 'red')])]);
  var filled = draft.remapLiveScoreIdentityByPlayerId(
    emptied,
    draft.applyLiveGroupsFromDraft(emptied, [group('g1', [seat('C', 1, 'red'), seat('P', 2, 'red')])])
  );
  assert(
    '删除后添加：新 ID 获得该位置已有成绩',
    filled[0].players[0].userId === 'C' &&
      JSON.stringify(filled[0].players[0].holes) === JSON.stringify(before[0].players[0].holes) &&
      filled[0].players[0].scorePlayerId === 'C'
  );
})();

(function vacuum_bind() {
  var before = [group('g1', [{ position: 1, userId: '', playerId: '', id: '' }, seat('P', 2, 'red')])];
  var next = draft.buildLivePlayerEntry(before[0].players[0], seat('C', 1, 'red'), 1);
  assert('真空位无历史成绩时绑定新 ID', next.userId === 'C' && next.scorePlayerId === 'C' && !next.holes);
})();

(function composition_not_lost() {
  var w = abcWorld();
  var latest = clone(w.beforeMatch);
  delete latest.strokeCompositionMode;
  var lost = validator.validateStrokeEntities(
    Object.assign({}, latest, { groups: w.afterMatch.groups, pairings: w.afterMatch.pairings })
  );
  var kept = validator.validateStrokeEntities(w.afterMatch);
  assert('缺 2+2 的 latest 浅拷贝会误判', lost.valid === false && String(lost.reason) === '4_0_multi_team');
  assert('完整 candidate 保留 2+2 通过', kept.valid === true);
})();

(function preview_uses_candidate_mode() {
  var w = abcWorld();
  var latest = clone(w.beforeMatch);
  delete latest.strokeCompositionMode;
  var preview = flow.previewSeriesLiveSingleReplace({
    beforeMatch: latest,
    candidateMatch: w.afterMatch,
    series: w.series,
    stationIndex: { seriesId: 'ser-1', roundId: 'r1', matchId: 'm1', publishToken: 'tok' },
    editedGroupId: 'g1',
    validateCandidate: function (payload) {
      var trial = Object.assign({}, latest, payload.candidateMatch || payload);
      if (payload.groups) trial.groups = payload.groups;
      return validator.validateStrokeEntities(trial).valid
        ? { ok: true }
        : { ok: false, reason: validator.validateStrokeEntities(trial).reason };
    }
  });
  assert(
    'preview/preflight 使用 candidate 的 2+2',
    preview.ok === true && preview.status === 'batch_ready' && preview.replacementCount === 1
  );
})();

(function abc_save_success() {
  var w = abcWorld();
  var box = { m1: clone(w.beforeMatch), m2: { matchId: 'm2', groups: [group('g9', [seat('Z', 1, 'gold')])], scoreData: { keep: true } } };
  var api = memJournal();
  var classified = cls.classifySeriesLiveSingleReplace({
    beforeMatch: w.beforeMatch,
    candidateMatch: w.afterMatch,
    editedGroupId: 'g1'
  });
  var out = batch.executeBatchReplace({
    classification: classified,
    beforeMatch: w.beforeMatch,
    candidateMatch: w.afterMatch,
    series: w.series,
    stationIndex: { seriesId: 'ser-1', roundId: 'r1', matchId: 'm1', publishToken: 'tok' },
    persistMatch: function (next) {
      box.m1 = clone(next);
      return { ok: true, match: clone(next) };
    },
    persistSeries: function (next) {
      return { ok: true, series: next };
    },
    getMatchById: function (id) {
      return box[id];
    },
    journalApi: api,
    validateCandidate: function (payload) {
      var trial = payload.candidateMatch || payload;
      var check = validator.validateStrokeEntities(trialFrom(trial, w.afterMatch));
      return check.valid ? { ok: true } : { ok: false, reason: check.reason };
    }
  });
  function trialFrom(trial, fallback) {
    return Object.assign({}, fallback, trial, {
      strokeCompositionMode: (trial && trial.strokeCompositionMode) || w.afterMatch.strokeCompositionMode
    });
  }
  assert('四人四球 2+2 LIVE A/B/C 保存成功', out.ok === true && out.status === 'completed');
  assert(
    'scoreData 未按 playerId 搬移',
    JSON.stringify(box.m1.scoreData) === JSON.stringify(w.beforeMatch.scoreData)
  );
  assert(
    '其它轮次不变',
    box.m2.scoreData.keep === true && box.m2.groups[0].players[0].userId === 'Z'
  );
})();

(function save_fail_rollback_restores_scores() {
  var w = abcWorld();
  var box = { m1: clone(w.beforeMatch) };
  var api = memJournal();
  var classified = cls.classifySeriesLiveSingleReplace({
    beforeMatch: w.beforeMatch,
    candidateMatch: w.afterMatch
  });
  var out = batch.executeBatchReplace({
    classification: classified,
    beforeMatch: w.beforeMatch,
    candidateMatch: w.afterMatch,
    series: w.series,
    stationIndex: { seriesId: 'ser-1', roundId: 'r1', matchId: 'm1', publishToken: 'tok' },
    persistMatch: function () {
      return { ok: false, reason: 'save_failed' };
    },
    persistSeries: function () {
      return { ok: true };
    },
    getMatchById: function () {
      return box.m1;
    },
    journalApi: api
  });
  assert(
    '保存失败回滚：身份与座位成绩恢复',
    out.ok === false &&
      out.status === 'failed_rolled_back' &&
      box.m1.groups[0].players[0].userId === 'A' &&
      JSON.stringify(box.m1.groups[0].players[0].holes) === JSON.stringify(w.beforeGroups[0].players[0].holes) &&
      JSON.stringify(box.m1.scoreData) === JSON.stringify(w.beforeMatch.scoreData)
  );
})();

(function recovery_restores_snapshot_not_player_scores() {
  var w = abcWorld();
  var live = clone(w.afterMatch);
  var api = memJournal();
  var prepared = api.writePreparedBatchJournal({
    planKey: 'live-batch-ser-1-r1-m1-x',
    batchId: 'live-batch-ser-1-r1-m1-x',
    mutationKind: 'batch',
    identity: { seriesId: 'ser-1', roundId: 'r1', matchId: 'm1', publishToken: 'tok' },
    seriesId: 'ser-1',
    roundId: 'r1',
    matchId: 'm1',
    before: { matchSnapshot: clone(w.beforeMatch), seriesSnapshot: clone(w.series) },
    expectedAfter: { matchSnapshot: clone(w.afterMatch) }
  });
  var rec = batch.recoverIncompleteLiveBatchMutations({
    matchId: 'm1',
    seriesId: 'ser-1',
    roundId: 'r1',
    persistMatch: function (next) {
      live = clone(next);
      return { ok: true, match: clone(next) };
    },
    persistSeries: function (next) {
      return { ok: true, series: next };
    },
    getMatchById: function () {
      return live;
    },
    getSeriesById: function () {
      return w.series;
    },
    journalApi: api,
    listUnfinishedJournals: function () {
      return { journals: [prepared.journal] };
    }
  });
  assert(
    'recovery 按快照恢复，不按 playerId 搬成绩',
    rec.ok === true &&
      live.groups[0].players[0].userId === 'A' &&
      JSON.stringify(live.groups[0].players[0].holes) === JSON.stringify(w.beforeGroups[0].players[0].holes) &&
      JSON.stringify(live.scoreData) === JSON.stringify(w.beforeMatch.scoreData)
  );
})();

function strokeValidate(candidate) {
  var check = validator.validateStrokeEntities(candidate);
  return check.valid ? { ok: true } : { ok: false, reason: check.reason };
}

function runOfficialFlow(beforeMatch, afterMatch, series, extras) {
  var o = extras || {};
  var box = o.box || {
    m1: clone(beforeMatch),
    m2: { matchId: 'm2', groups: [group('g9', [seat('Z', 1, 'gold')])], scoreData: { keep: true } },
    series: clone(series)
  };
  var api = memJournal();
  var persistFail = !!o.persistFail;
  var out = identity.executeSeriesLiveIdentityCorrection({
    currentDraft: afterMatch.groups,
    editedGroupId: o.editedGroupId != null ? o.editedGroupId : 'g1',
    journalApi: api,
    reloadContext: function () {
      return {
        series: box.series || series,
        match: box.m1,
        latestMatch: box.m1,
        stationIndex: { seriesId: 'ser-1', roundId: 'r1', matchId: 'm1', publishToken: 'tok' },
        currentUser: { userId: 'host' },
        incomingPlayer: o.incomingPlayer || null,
        getMatchById: function (id) {
          return box[id];
        }
      };
    },
    buildCandidateFromLatestMatch: function () {
      return afterMatch;
    },
    validateCandidate: o.validateCandidate || function (payload) {
      return strokeValidate(payload.candidateMatch || afterMatch);
    },
    hasManagePermission: o.hasManagePermission || function () {
      return true;
    },
    persistMatch: o.persistMatch || function (next) {
      if (persistFail) {
        var first = next && next.groups && next.groups[0] && next.groups[0].players && next.groups[0].players[0];
        if (first && String(first.userId) !== String(beforeMatch.groups[0].players[0].userId)) {
          return { ok: false, reason: 'save_failed' };
        }
      }
      box[next.matchId] = clone(next);
      return { ok: true, match: clone(box[next.matchId]) };
    },
    persistSeries: function (next) {
      box.series = clone(next);
      return { ok: true, series: clone(next) };
    },
    getMatchById: function (id) {
      return box[id];
    },
    getSeriesById: function () {
      return box.series || series;
    },
    prepareJournal: function (input) {
      return api.prepareJournal(input);
    },
    getJournal: function (planKey) {
      return api.getJournal(planKey);
    },
    executeForward: function () {
      if (persistFail) {
        return { ok: false, requiresRollback: true, code: 'save_failed' };
      }
      box.m1 = clone(afterMatch);
      return { ok: true, journalPhase: journalMod.PHASE.committed };
    },
    executeRollback: function () {
      box.m1 = clone(beforeMatch);
      return { ok: true, journalPhase: journalMod.PHASE.rolled_back };
    }
  });
  return { out: out, box: box, api: api };
}

(function official_abc_flow() {
  var w = abcWorld();
  var r = runOfficialFlow(w.beforeMatch, w.afterMatch, w.series);
  var g1 = r.box.m1.groups[0].players[0];
  var g2 = r.box.m1.groups[1].players[0];
  assert(
    '正式路径：A 占 B 位、B 回报名区、C 占 A 原位保存成功',
    r.out.ok === true &&
      r.out.status === 'completed' &&
      g1.userId === 'C' &&
      g1.playerId === 'C' &&
      g1.scorePlayerId === 'C' &&
      JSON.stringify(g1.holes) === JSON.stringify(w.beforeGroups[0].players[0].holes) &&
      g2.userId === 'A' &&
      g2.scorePlayerId === 'A' &&
      JSON.stringify(g2.holes) === JSON.stringify(w.beforeGroups[1].players[0].holes)
  );
  assert(
    '正式路径：其它轮次不变',
    r.box.m2.groups[0].players[0].userId === 'Z' && r.box.m2.scoreData.keep === true
  );
})();

(function fill_empty_c() {
  var w = abcWorld();
  var before = clone(w.beforeMatch);
  before.groups[0].players[0] = Object.assign({}, before.groups[0].players[0], {
    userId: '',
    playerId: '',
    id: '',
    scorePlayerId: ''
  });
  var after = clone(before);
  after.groups = draft.rematerializeLivePlayersAfterNormalize(
    draft.applyLiveGroupsFromDraft(before.groups, [
      group('g1', [seat('C', 1, 'red'), before.groups[0].players[1], before.groups[0].players[2], before.groups[0].players[3]]),
      before.groups[1]
    ]),
    before.groups
  );
  var r = runOfficialFlow(before, after, w.series);
  assert(
    'before 已是空位只补 C 保存成功',
    r.out.ok === true && r.out.status === 'completed' && r.box.m1.groups[0].players[0].userId === 'C'
  );
})();

(function roster_c_keeps_seat_score_and_group_meta() {
  var w = abcWorld();
  var before = clone(w.beforeMatch);
  before.groups[0].order = 3;
  before.groups[0].teeTime = '06:10';
  before.groups[0].status = 'LIVE';
  var dirty = [
    Object.assign({}, group('g1', [seat('C', 1, 'red', { tee: '蓝T' }), before.groups[0].players[1], before.groups[0].players[2], before.groups[0].players[3]]), {
      groupName: '错名',
      order: 1,
      teeTime: '11:11',
      status: 'x'
    }),
    before.groups[1]
  ];
  var afterGroups = draft.rematerializeLivePlayersAfterNormalize(
    draft.applyLiveGroupsFromDraft(before.groups, dirty),
    before.groups
  );
  assert(
    'C替换A 组元数据沿用且洞成绩留在座位',
    afterGroups[0].groupName === before.groups[0].groupName &&
      afterGroups[0].order === 3 &&
      afterGroups[0].teeTime === '06:10' &&
      afterGroups[0].status === 'LIVE' &&
      afterGroups[0].players[0].userId === 'C' &&
      afterGroups[0].players[0].scorePlayerId === 'C' &&
      JSON.stringify(afterGroups[0].players[0].holes) === JSON.stringify(before.groups[0].players[0].holes)
  );
})();

(function two_fills() {
  var w = abcWorld();
  var before = clone(w.beforeMatch);
  before.groups[0].players[0] = Object.assign({}, before.groups[0].players[0], { userId: '', playerId: '', id: '' });
  before.groups[0].players[1] = Object.assign({}, before.groups[0].players[1], { userId: '', playerId: '', id: '' });
  var after = clone(before);
  after.groups = draft.rematerializeLivePlayersAfterNormalize(
    draft.applyLiveGroupsFromDraft(before.groups, [
      group('g1', [seat('C', 1, 'red'), seat('P', 2, 'red'), before.groups[0].players[2], before.groups[0].players[3]]),
      before.groups[1]
    ]),
    before.groups
  );
  var r = runOfficialFlow(before, after, w.series);
  assert(
    '一次补两个空位成功',
    r.out.ok === true &&
      r.out.status === 'completed' &&
      r.box.m1.groups[0].players[0].userId === 'C' &&
      r.box.m1.groups[0].players[1].userId === 'P'
  );
})();

(function clear_wrong_ids() {
  var w = abcWorld();
  var after = clone(w.beforeMatch);
  after.groups = draft.rematerializeLivePlayersAfterNormalize(
    draft.applyLiveGroupsFromDraft(w.beforeMatch.groups, [
      group('g1', [{ position: 1, userId: '' }, w.beforeMatch.groups[0].players[1], w.beforeMatch.groups[0].players[2], w.beforeMatch.groups[0].players[3]]),
      w.beforeMatch.groups[1]
    ]),
    w.beforeMatch.groups
  );
  var r = runOfficialFlow(w.beforeMatch, after, w.series, {
    validateCandidate: function () {
      return { ok: true };
    }
  });
  assert(
    '清除错误 ID 结构仍合法时成功',
    r.out.ok === true && r.out.status === 'completed' && !r.box.m1.groups[0].players[0].userId
  );
})();

(function swap_same_and_cross() {
  var w = abcWorld();
  var afterSame = clone(w.beforeMatch);
  afterSame.groups = draft.rematerializeLivePlayersAfterNormalize(
    draft.applyLiveGroupsFromDraft(w.beforeMatch.groups, [
      group('g1', [
        Object.assign({}, w.beforeMatch.groups[0].players[1], { position: 1 }),
        Object.assign({}, w.beforeMatch.groups[0].players[0], { position: 2 }),
        w.beforeMatch.groups[0].players[2],
        w.beforeMatch.groups[0].players[3]
      ]),
      w.beforeMatch.groups[1]
    ]),
    w.beforeMatch.groups
  );
  var r1 = runOfficialFlow(w.beforeMatch, afterSame, w.series);
  var afterCross = clone(w.beforeMatch);
  afterCross.groups = draft.rematerializeLivePlayersAfterNormalize(
    draft.applyLiveGroupsFromDraft(w.beforeMatch.groups, [
      group('g1', [
        Object.assign({}, w.beforeMatch.groups[1].players[0], { position: 1 }),
        w.beforeMatch.groups[0].players[1],
        w.beforeMatch.groups[0].players[2],
        w.beforeMatch.groups[0].players[3]
      ]),
      group('g2', [
        Object.assign({}, w.beforeMatch.groups[0].players[0], { position: 1 }),
        w.beforeMatch.groups[1].players[1],
        w.beforeMatch.groups[1].players[2],
        w.beforeMatch.groups[1].players[3]
      ])
    ]),
    w.beforeMatch.groups
  );
  var r2 = runOfficialFlow(w.beforeMatch, afterCross, w.series, { editedGroupId: '' });
  assert(
    '同组换位成功',
    r1.out.ok === true && r1.out.status === 'completed' && r1.box.m1.groups[0].players[0].userId === 'P'
  );
  assert(
    '跨组换位成功',
    r2.out.ok === true && r2.out.status === 'completed' && r2.box.m1.groups[0].players[0].userId === 'B'
  );
})();

(function mixed_fill_clear_swap() {
  var w = abcWorld();
  var r = runOfficialFlow(w.beforeMatch, w.afterMatch, w.series);
  assert('补人清除换位混合成功', r.out.ok === true && r.out.status === 'completed');
})();

(function reject_duplicate() {
  var w = abcWorld();
  var after = clone(w.afterMatch);
  after.groups[0].players[1] = Object.assign({}, after.groups[0].players[1], {
    userId: 'A',
    playerId: 'A',
    id: 'A'
  });
  var r = runOfficialFlow(w.beforeMatch, after, w.series);
  assert(
    '最终重复球员仍拒绝',
    r.out.ok === false && (r.out.code === 'incoming_already_in_round' || r.out.code === 'duplicate')
  );
})();

(function reject_unregistered() {
  var w = abcWorld();
  var after = clone(w.afterMatch);
  after.groups[0].players[0] = Object.assign({}, after.groups[0].players[0], {
    userId: 'GHOST',
    playerId: 'GHOST',
    id: 'GHOST',
    scorePlayerId: 'GHOST'
  });
  var r = runOfficialFlow(w.beforeMatch, after, w.series);
  assert('未报名球员仍拒绝', r.out.ok === false && r.out.code === 'player_not_on_roster');
})();

(function reject_stroke() {
  var w = abcWorld();
  var r = runOfficialFlow(w.beforeMatch, w.afterMatch, w.series, {
    validateCandidate: function () {
      return { ok: false, reason: '4_0_multi_team' };
    }
  });
  assert('最终不符合 2+2 仍拒绝', r.out.ok === false && String(r.out.code).indexOf('4_0') >= 0);
})();

(function reject_permission_ended() {
  var w = abcWorld();
  var noPerm = runOfficialFlow(w.beforeMatch, w.afterMatch, w.series, {
    hasManagePermission: function () {
      return false;
    }
  });
  var ended = clone(w.beforeMatch);
  ended.status = 'finished';
  var box = {
    m1: ended,
    m2: { matchId: 'm2', groups: [group('g9', [seat('Z', 1, 'gold')])], scoreData: { keep: true } },
    series: clone(w.series)
  };
  var afterEnded = clone(w.afterMatch);
  afterEnded.status = 'finished';
  var endedRes = runOfficialFlow(ended, afterEnded, w.series, { box: box });
  assert('无权限仍拒绝', noPerm.out.ok === false && noPerm.out.code === 'permission_denied');
  assert(
    '场次结束仍拒绝',
    endedRes.out.ok === false &&
      (endedRes.out.code === 'match_completed' || endedRes.out.code === 'station_not_live')
  );
})();

(function persist_fail_and_replay() {
  var w = abcWorld();
  var fail = runOfficialFlow(w.beforeMatch, w.afterMatch, w.series, { persistFail: true });
  assert(
    '写入失败整批回滚',
    fail.out.ok === false && fail.out.status === 'failed_rolled_back' && fail.box.m1.groups[0].players[0].userId === 'A'
  );
  var ok = runOfficialFlow(w.beforeMatch, w.afterMatch, w.series);
  assert(
    '原换人 journal 不再作为保存门槛',
    ok.out.ok === true && !ok.out.planKey
  );
})();

(function p1_p2_identity_correction_not_drift() {
  var w = abcWorld();
  var sa = JSON.stringify(w.beforeGroups[0].players[0].holes);
  var sb = JSON.stringify(w.beforeGroups[1].players[0].holes);
  var classified = cls.classifySeriesLiveSingleReplace({
    beforeMatch: w.beforeMatch,
    candidateMatch: w.afterMatch,
    editedGroupId: 'g1'
  });
  assert(
    '模拟器场景不触发 cross_group_payload_drift',
    classified.ok === true && classified.code !== 'cross_group_payload_drift'
  );
  var r = runOfficialFlow(w.beforeMatch, w.afterMatch, w.series, { editedGroupId: 'g1' });
  var p1 = r.box.m1.groups[0].players[0];
  var p2 = r.box.m1.groups[1].players[0];
  assert(
    'P1 数值仍为 SA、身份为 C；P2 数值仍为 SB、身份为 A',
    r.out.ok === true &&
      r.out.status === 'completed' &&
      p1.userId === 'C' &&
      p1.playerId === 'C' &&
      p1.scorePlayerId === 'C' &&
      JSON.stringify(p1.holes) === sa &&
      p2.userId === 'A' &&
      p2.scorePlayerId === 'A' &&
      JSON.stringify(p2.holes) === sb
  );
})();

(function holes_moved_still_drift() {
  var w = abcWorld();
  var after = clone(w.afterMatch);
  after.groups[1].players[0].holes = clone(w.beforeGroups[0].players[0].holes);
  after.groups[0].players[0].holes = [{ hole: 1, score: 99 }];
  var classified = cls.classifySeriesLiveSingleReplace({
    beforeMatch: w.beforeMatch,
    candidateMatch: after,
    editedGroupId: 'g1'
  });
  assert(
    '成绩数值从 P1 跑到 P2 仍 drift',
    classified.ok === false && classified.code === 'cross_group_payload_drift'
  );
})();

(function scoredata_lost_rejected() {
  var w = abcWorld();
  var after = clone(w.afterMatch);
  after.scoreData = {};
  var classified = cls.classifySeriesLiveSingleReplace({
    beforeMatch: w.beforeMatch,
    candidateMatch: after,
    editedGroupId: 'g1'
  });
  assert(
    'holes/scoreData 丢失仍拒绝',
    classified.ok === false && classified.code === 'cross_group_payload_drift'
  );
})();

function incomingC() {
  return { userId: 'C', playerId: 'C', id: 'C', displayName: 'C' };
}

function rosterCReplaceOnFieldA(pairings) {
  var w = abcWorld();
  var before = clone(w.beforeMatch);
  before.pairings = pairings != null ? pairings : {};
  var afterDraft = [
    group('g1', [
      seat('C', 1, 'red'),
      before.groups[0].players[1],
      before.groups[0].players[2],
      before.groups[0].players[3]
    ]),
    before.groups[1]
  ];
  var afterGroups = draft.rematerializeLivePlayersAfterNormalize(
    draft.applyLiveGroupsFromDraft(before.groups, afterDraft),
    before.groups
  );
  afterGroups[0].players = afterGroups[0].players.map(function (p, idx) {
    if (idx === 0) return p;
    return clone(before.groups[0].players[idx]);
  });
  afterGroups[1].players = before.groups[1].players.map(function (p) {
    return clone(p);
  });
  var afterMatch = Object.assign({}, clone(before), {
    groups: afterGroups,
    pairings: clone(before.pairings)
  });
  afterGroups[0].players = afterGroups[0].players.map(function (p, idx) {
    if (idx === 0) return p;
    return clone(before.groups[0].players[idx]);
  });
  afterGroups[1].players = before.groups[1].players.map(function (p) {
    return clone(p);
  });
  var afterMatch = Object.assign({}, clone(before), {
    groups: afterGroups,
    pairings: clone(before.pairings)
  });
  if (afterMatch.pairings && afterMatch.pairings.g1 && Array.isArray(afterMatch.pairings.g1)) {
    afterMatch.pairings.g1 = afterMatch.pairings.g1.map(function (row) {
      if (!row || typeof row !== 'object') return row;
      var next = Object.assign({}, row);
      if (Array.isArray(next.playerIds)) {
        next.playerIds = next.playerIds.map(function (id) {
          return id === 'A' ? 'C' : id;
        });
      }
      return next;
    });
  }
  return {
    beforeMatch: before,
    afterMatch: afterMatch,
    series: Object.assign({}, clone(w.series), {
      hostMode: 'organization',
      rounds: [{ roundId: 'r1', matchId: 'm1', roundStatus: 'live' }],
      participants: [
        {
          seriesParticipantId: 'red',
          kind: 'team',
          sourceTeamId: 'red',
          shortNameSnapshot: '红',
          nameSnapshot: '红'
        },
        {
          seriesParticipantId: 'blue',
          kind: 'team',
          sourceTeamId: 'blue',
          shortNameSnapshot: '蓝',
          nameSnapshot: '蓝'
        },
        {
          seriesParticipantId: 'green',
          kind: 'team',
          sourceTeamId: 'green',
          shortNameSnapshot: '绿',
          nameSnapshot: '绿'
        }
      ]
    }),
    beforeGroups: before.groups,
    aHoles: clone(before.groups[0].players[0].holes)
  };
}

(function roster_c_replace_on_field_a_no_incoming_pairing() {
  var w = rosterCReplaceOnFieldA({});
  var classified = cls.classifySeriesLiveSingleReplace({
    beforeMatch: w.beforeMatch,
    candidateMatch: w.afterMatch,
    editedGroupId: 'g1'
  });
  assert(
    '报名区 C 替换场上 A 分类为 single_replacement',
    classified.ok === true && classified.kind === 'single_replacement'
  );
  var r = runOfficialFlow(w.beforeMatch, w.afterMatch, w.series, { incomingPlayer: incomingC() });
  var seat0 = r.box.m1.groups[0].players[0];
  var onField = {};
  r.box.m1.groups.forEach(function (g) {
    g.players.forEach(function (p) {
      if (p.userId) onField[p.userId] = true;
    });
  });
  assert(
    '报名区 C 替换场上 A：保存成功',
    r.out.ok === true && r.out.status === 'completed'
  );
  assert(
    'C 调整前没有 pairing snapshot 仍成功',
    r.out.ok === true && JSON.stringify(w.beforeMatch.pairings) === '{}'
  );
  assert(
    'A 原位置 18 洞成绩不变，身份全部变为 C',
    seat0.userId === 'C' &&
      seat0.playerId === 'C' &&
      seat0.scorePlayerId === 'C' &&
      (seat0.scoreOwnerId == null || seat0.scoreOwnerId === 'C') &&
      JSON.stringify(seat0.holes) === JSON.stringify(w.aHoles)
  );
  assert(
    'C 不携带其它位置或其它轮次成绩',
    !onField.A &&
      onField.C &&
      onField.B &&
      r.box.m1.groups[1].players[0].userId === 'B' &&
      JSON.stringify(r.box.m1.groups[1].players[0].holes) ===
        JSON.stringify(w.beforeGroups[1].players[0].holes) &&
      r.box.m2.groups[0].players[0].userId === 'Z' &&
      r.box.m2.scoreData.keep === true
  );
})();

(function roster_c_replace_target_pairing_missing() {
  var w = rosterCReplaceOnFieldA({ g1: null });
  var r = runOfficialFlow(w.beforeMatch, w.afterMatch, w.series, { incomingPlayer: incomingC() });
  assert(
    '目标组 pairing 为空对象时仍按位置纠正保存',
    r.out.ok === true && r.out.status === 'completed' && r.box.m1.groups[0].players[0].userId === 'C'
  );
})();

(function roster_c_replace_rollback_restores_a() {
  var w = rosterCReplaceOnFieldA({});
  var r = runOfficialFlow(w.beforeMatch, w.afterMatch, w.series, {
    incomingPlayer: incomingC(),
    persistFail: true
  });
  assert(
    'rollback 恢复 A 与该位置原成绩',
    r.out.ok === false &&
      r.out.status === 'failed_rolled_back' &&
      r.box.m1.groups[0].players[0].userId === 'A' &&
      JSON.stringify(r.box.m1.groups[0].players[0].holes) === JSON.stringify(w.aHoles)
  );
})();

if (failed.length) {
  console.error('FAIL ' + failed.length + ' / ' + (passed + failed.length));
  failed.forEach(function (n) {
    console.error(' - ' + n);
  });
  process.exit(1);
}
console.log('ok ' + passed + ' assertions seriesLiveSeatScoreBinding.selftest');
