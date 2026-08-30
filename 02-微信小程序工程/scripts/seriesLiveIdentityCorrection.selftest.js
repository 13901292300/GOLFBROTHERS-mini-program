/**
 * Series LIVE 分组身份纠正正式路径
 * 运行：node scripts/seriesLiveIdentityCorrection.selftest.js
 */
var path = require('path');
var fs = require('fs');
var seriesTestPaths = require('./lib/seriesTestPaths.js');
var draft = require(seriesTestPaths.util('tournamentGroupDraft.js'));
var identity = require(seriesTestPaths.util('seriesLiveIdentityCorrection.js'));
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

function holesOf(n) {
  return [n % 9 || 3, 4, 5];
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
      entityId: 'ent-' + pos,
      slotId: 'slot-' + pos,
      pairingId: 'pair-' + Math.ceil(pos / 2),
      holes: holesOf(id ? id.charCodeAt(0) : pos)
    },
    extra || {}
  );
}

function group(id, players) {
  return { groupId: id, groupName: id, order: id === 'g1' ? 1 : 2, teeTime: '08:00', status: 'LIVE', players: players };
}

function rosterOf(ids) {
  return ids.map(function (id) {
    return { userId: id, registrationStatus: 'registered', rosterEntryId: 'r-' + id, seriesParticipantId: 'red' };
  });
}

function world() {
  var g1 = [seat('A', 1, 'red'), seat('P', 2, 'red'), seat('Q', 3, 'blue'), seat('R', 4, 'blue')];
  var g2 = [seat('B', 1, 'red'), seat('S', 2, 'red'), seat('T', 3, 'green'), seat('U', 4, 'green')];
  var users = g1.concat(g2).concat([seat('C', 1, 'red')]).map(function (p) {
    return { userId: p.userId, matchTeamId: p.matchTeamId, seriesParticipantId: p.seriesParticipantId };
  });
  var before = {
    matchId: 'm1',
    updatedAt: 1000,
    status: 'ongoing',
    gameMode: '四人四球比杆赛',
    strokeCompositionMode: '2+2',
    seriesContext: { managed: true, seriesId: 'ser-1', roundId: 'r1', matchId: 'm1', publishToken: 'tok' },
    groups: [group('g1', g1), group('g2', g2)],
    pairings: {},
    scoreData: {
      g1: { scoresByPlayer: { A: { scores: g1[0].holes }, P: { scores: g1[1].holes } } },
      g2: { scoresByPlayer: { B: { scores: g2[0].holes }, S: { scores: g2[1].holes } } }
    },
    registerInfo: { users: users, totalCount: users.length }
  };
  var series = {
    seriesId: 'ser-1',
    lifecycleStatus: 'published',
    roster: rosterOf(['A', 'B', 'C', 'P', 'Q', 'R', 'S', 'T', 'U'])
  };
  return { before: before, series: series };
}

function overlayDraft(before, mutator) {
  var draftGroups = clone(before.groups);
  mutator(draftGroups);
  var groups = draft.rematerializeLivePlayersAfterNormalize(
    draft.applyLiveGroupsFromDraft(before.groups, draftGroups),
    before.groups
  );
  return Object.assign({}, clone(before), { groups: groups });
}

function run(before, after, series, extras) {
  var o = extras || {};
  var box = {
    m1: clone(before),
    m2: { matchId: 'm2', groups: [{ groupId: 'g9', players: [seat('Z', 1, 'gold')] }], scoreData: { keep: true } },
    series: clone(series)
  };
  var persistFail = !!o.persistFail;
  var out = identity.executeSeriesLiveIdentityCorrection({
    currentDraft: after.groups,
    expectedRevision: o.expectedRevision != null ? o.expectedRevision : String(before.updatedAt || ''),
    reloadContext: function () {
      return {
        series: box.series,
        match: box.m1,
        stationIndex: { seriesId: 'ser-1', roundId: 'r1', matchId: 'm1', publishToken: 'tok' },
        currentUser: { userId: 'host' }
      };
    },
    buildCandidateFromLatestMatch: function () {
      return clone(after);
    },
    validateCandidate: o.validateCandidate || function (payload) {
      var check = validator.validateStrokeEntities(payload.candidateMatch || after);
      return check && check.valid ? { ok: true } : { ok: false, reason: (check && check.reason) || 'invalid' };
    },
    hasManagePermission: o.hasManagePermission || function () {
      return true;
    },
    persistMatch: o.persistMatch || function (next) {
      if (persistFail && next && next.groups && next.groups[0] && next.groups[0].players[0] && next.groups[0].players[0].userId === 'C') {
        return { ok: false, reason: 'save_failed' };
      }
      box[next.matchId] = clone(next);
      return { ok: true, match: clone(box[next.matchId]) };
    },
    getMatchById: function (id) {
      return box[id];
    },
    getSeriesById: function () {
      return box.series;
    }
  });
  return { out: out, box: box };
}

(function c_replaces_a() {
  var w = world();
  var after = overlayDraft(w.before, function (gs) {
    gs[0].players[0] = Object.assign({}, gs[0].players[0], { userId: 'C', playerId: 'C', id: 'C' });
  });
  var r = run(w.before, after, w.series);
  var p1 = r.box.m1.groups[0].players[0];
  assert(
    '1 报名区 C 替换场上 A',
    r.out.ok === true &&
      r.out.status === 'completed' &&
      p1.userId === 'C' &&
      p1.scorePlayerId === 'C' &&
      JSON.stringify(p1.holes) === JSON.stringify(w.before.groups[0].players[0].holes)
  );
  assert(
    '8 P1 仍为 SA 且 B 不拥有该位成绩',
    JSON.stringify(r.box.m1.scoreData.g1.scoresByPlayer.C && r.box.m1.scoreData.g1.scoresByPlayer.C.scores) ===
      JSON.stringify(w.before.groups[0].players[0].holes) &&
      !r.box.m1.scoreData.g1.scoresByPlayer.A &&
      !r.box.m1.scoreData.g1.scoresByPlayer.B
  );
})();

(function abc_rearrange() {
  var w = world();
  var after = overlayDraft(w.before, function (gs) {
    gs[0].players[0] = Object.assign({}, gs[0].players[0], { userId: 'C', playerId: 'C', id: 'C' });
    gs[1].players[0] = Object.assign({}, gs[1].players[0], { userId: 'A', playerId: 'A', id: 'A' });
  });
  var r = run(w.before, after, w.series);
  assert(
    '2 A 占 B 位、B 回报名区、C 占 A 位',
    r.out.ok &&
      r.box.m1.groups[0].players[0].userId === 'C' &&
      r.box.m1.groups[1].players[0].userId === 'A' &&
      JSON.stringify(r.box.m1.groups[1].players[0].holes) === JSON.stringify(w.before.groups[1].players[0].holes)
  );
})();

(function same_group_swap() {
  var w = world();
  var after = overlayDraft(w.before, function (gs) {
    gs[0].players[0] = Object.assign({}, gs[0].players[0], { userId: 'P', playerId: 'P', id: 'P' });
    gs[0].players[1] = Object.assign({}, gs[0].players[1], { userId: 'A', playerId: 'A', id: 'A' });
  });
  var r = run(w.before, after, w.series);
  assert(
    '3 同组换位成绩留位',
    r.out.ok &&
      r.box.m1.groups[0].players[0].userId === 'P' &&
      JSON.stringify(r.box.m1.groups[0].players[0].holes) === JSON.stringify(w.before.groups[0].players[0].holes) &&
      r.box.m1.groups[0].players[1].userId === 'A' &&
      JSON.stringify(r.box.m1.groups[0].players[1].holes) === JSON.stringify(w.before.groups[0].players[1].holes)
  );
})();

(function cross_group_swap() {
  var w = world();
  var after = overlayDraft(w.before, function (gs) {
    gs[0].players[0] = Object.assign({}, gs[0].players[0], { userId: 'B', playerId: 'B', id: 'B' });
    gs[1].players[0] = Object.assign({}, gs[1].players[0], { userId: 'A', playerId: 'A', id: 'A' });
  });
  var r = run(w.before, after, w.series);
  assert(
    '4 跨组换位成绩留位',
    r.out.ok &&
      r.box.m1.groups[0].players[0].userId === 'B' &&
      JSON.stringify(r.box.m1.groups[0].players[0].holes) === JSON.stringify(w.before.groups[0].players[0].holes)
  );
})();

(function fill_empty() {
  var w = world();
  w.before.groups[0].players[0] = Object.assign({}, w.before.groups[0].players[0], {
    userId: '',
    playerId: '',
    id: '',
    scorePlayerId: ''
  });
  var after = overlayDraft(w.before, function (gs) {
    gs[0].players[0] = Object.assign({}, gs[0].players[0], { userId: 'C', playerId: 'C', id: 'C' });
  });
  var r = run(w.before, after, w.series, {
    validateCandidate: function () {
      return { ok: true };
    }
  });
  assert(
    '5 补空位',
    r.out.ok && r.box.m1.groups[0].players[0].userId === 'C'
  );
  var clearedBefore = clone(w.before);
  var cleared = overlayDraft(clearedBefore, function (gs) {
    gs[0].players[1] = Object.assign({}, gs[0].players[1], { userId: '', playerId: '', id: '' });
  });
  var r2 = run(clearedBefore, cleared, w.series, {
    validateCandidate: function () {
      return { ok: true };
    }
  });
  assert('6 清除错误身份', r2.out.ok && !r2.box.m1.groups[0].players[1].userId);
})();

(function reenter() {
  var w = world();
  var after = overlayDraft(w.before, function (gs) {
    gs[0].players[0] = Object.assign({}, gs[0].players[0], { userId: 'C', playerId: 'C', id: 'C' });
  });
  var r = run(w.before, after, w.series);
  var again = r.box.m1;
  assert(
    '9 保存后读回一致',
    again.groups[0].players[0].userId === 'C' &&
      again.groups[0].players[0].scorePlayerId === 'C' &&
      JSON.stringify(again.groups[0].players[0].holes) === JSON.stringify(w.before.groups[0].players[0].holes)
  );
})();

(function consumers() {
  var w = world();
  var after = overlayDraft(w.before, function (gs) {
    gs[0].players[0] = Object.assign({}, gs[0].players[0], { userId: 'C', playerId: 'C', id: 'C' });
  });
  var r = run(w.before, after, w.series);
  var p = r.box.m1.groups[0].players[0];
  var by = r.box.m1.scoreData.g1.scoresByPlayer;
  assert(
    '10 记分页/排行榜派生键为当前身份',
    p.scorePlayerId === 'C' && p.scoreOwnerId === 'C' && by.C && !by.A
  );
})();

(function rejects() {
  var w = world();
  var after = overlayDraft(w.before, function (gs) {
    gs[0].players[0] = Object.assign({}, gs[0].players[0], { userId: 'C', playerId: 'C', id: 'C' });
  });
  var noPerm = run(w.before, after, w.series, { hasManagePermission: function () { return false; } });
  assert('11 无权限拒绝', noPerm.out.ok === false && noPerm.out.code === 'permission_denied');
  var ended = clone(w.before);
  ended.status = 'finished';
  var endRun = run(ended, after, w.series);
  assert('11 结束态拒绝', endRun.out.ok === false && endRun.out.code === 'match_completed');
  var ghost = overlayDraft(w.before, function (gs) {
    gs[0].players[0] = Object.assign({}, gs[0].players[0], { userId: 'Z9', playerId: 'Z9', id: 'Z9' });
  });
  var off = run(w.before, ghost, w.series);
  assert('11 未报名拒绝', off.out.ok === false && off.out.code === 'player_not_on_roster');
  var dup = overlayDraft(w.before, function (gs) {
    gs[0].players[0] = Object.assign({}, gs[0].players[0], { userId: 'P', playerId: 'P', id: 'P' });
  });
  var d = run(w.before, dup, w.series);
  assert('11 重复占位拒绝', d.out.ok === false && d.out.code === 'duplicate');
})();

(function score_moved() {
  var w = world();
  var after = overlayDraft(w.before, function (gs) {
    gs[0].players[0] = Object.assign({}, gs[0].players[0], { userId: 'C', playerId: 'C', id: 'C' });
  });
  after.groups[0].players[0].holes = [9, 9, 9];
  var r = run(w.before, after, w.series);
  assert('12 成绩被移动或丢失拒绝', r.out.ok === false && r.out.code === 'seat_score_moved');
})();

(function persist_fail() {
  var w = world();
  var after = overlayDraft(w.before, function (gs) {
    gs[0].players[0] = Object.assign({}, gs[0].players[0], { userId: 'C', playerId: 'C', id: 'C' });
  });
  var r = run(w.before, after, w.series, { persistFail: true });
  assert(
    '13 写入失败恢复 before',
    r.out.ok === false &&
      r.out.rollbackCompleted === true &&
      r.box.m1.groups[0].players[0].userId === 'A'
  );
})();

(function revision() {
  var w = world();
  var after = overlayDraft(w.before, function (gs) {
    gs[0].players[0] = Object.assign({}, gs[0].players[0], { userId: 'C', playerId: 'C', id: 'C' });
  });
  var r = run(w.before, after, w.series, { expectedRevision: '999' });
  assert('14 新 revision 不覆盖', r.out.ok === false && r.out.code === 'revision_conflict' && r.box.m1.groups[0].players[0].userId === 'A');
})();

(function other_round() {
  var w = world();
  var after = overlayDraft(w.before, function (gs) {
    gs[0].players[0] = Object.assign({}, gs[0].players[0], { userId: 'C', playerId: 'C', id: 'C' });
  });
  var r = run(w.before, after, w.series);
  assert('15 其它轮次不变', r.box.m2.groups[0].players[0].userId === 'Z' && r.box.m2.scoreData.keep === true);
})();

(function new_and_existing() {
  var w = world();
  var after = overlayDraft(w.before, function (gs) {
    gs[0].players[0] = Object.assign({}, gs[0].players[0], { userId: 'C', playerId: 'C', id: 'C' });
  });
  var existing = run(w.before, after, w.series);
  var fresh = clone(w.before);
  delete fresh.seriesContext;
  var r2 = run(fresh, after, w.series);
  assert('16 已有系列赛', existing.out.ok === true);
  assert('16 新建系列赛', r2.out.ok === true && r2.box.m1.groups[0].players[0].userId === 'C');
})();

(function editor_wired() {
  var src = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'subpackages', 'tournament', 'pages', 'group-editor', 'index.js'),
    'utf8'
  );
  assert(
    '生产入口已切换',
    src.indexOf('executeSeriesLiveIdentityCorrection') >= 0 &&
      src.indexOf('_runSeriesLiveIdentityCorrection') >= 0 &&
      src.indexOf('seriesLiveSingleReplaceFlow') < 0 &&
      src.indexOf('seriesLiveMutationJournal') < 0 &&
      src.indexOf('seriesLiveMutationRecovery') < 0 &&
      src.indexOf('recoverSeriesLiveBatchBeforeRead') < 0 &&
      src.indexOf('gb_series_live_mutation_journal') < 0 &&
      src.indexOf('[LIVE_CORRECTION_RESULT]') < 0 &&
      src.indexOf('[LIVE_CORRECTION_THROW]') < 0 &&
      src.indexOf('_showSeriesLiveConfirmModal') < 0 &&
      src.indexOf('confirmation_required') < 0 &&
      /require\([^)]*seriesLiveSingleReplaceFlow/.test(src) === false
  );
  var miniRoot = path.join(__dirname, '..', 'miniprogram');
  function walkJs(dir, acc) {
    acc = acc || [];
    fs.readdirSync(dir).forEach(function (name) {
      if (name === 'node_modules') return;
      var abs = path.join(dir, name);
      if (fs.statSync(abs).isDirectory()) {
        walkJs(abs, acc);
        return;
      }
      if (!/\.js$/i.test(name)) return;
      acc.push(abs);
    });
    return acc;
  }
  var banned = [
    'seriesLiveSingleReplaceFlow',
    'seriesLiveSingleReplaceClassifier',
    'seriesLiveSingleSeatFillClassifier',
    'seriesLiveReplaceDecision',
    'seriesLiveReplacePlan',
    'seriesLiveReplaceExecute',
    'seriesLiveReplacePreflight',
    'seriesLiveRollbackExecute',
    'seriesLiveRollbackPreflight',
    'seriesLiveBatchReplace',
    'seriesLiveMutationJournal',
    'seriesLiveMutationRecovery',
    'seriesLiveAffiliationEvidence',
    'recoverSeriesLiveBatchBeforeRead',
    'recoverIncompleteLiveBatch',
    'gb_series_live_mutation_journal_v1',
    'executeSeriesLiveReplace',
    'executeSeriesLiveBatchReplace'
  ];
  var hits = [];
  walkJs(miniRoot).forEach(function (abs) {
    var text = fs.readFileSync(abs, 'utf8');
    banned.forEach(function (token) {
      if (text.indexOf(token) >= 0) hits.push(path.relative(miniRoot, abs) + ':' + token);
    });
  });
  assert('生产不存在旧换人/journal 入口', hits.length === 0);
  var identitySrc = fs.readFileSync(
    path.join(miniRoot, 'subpackages', 'tournament', 'utils', 'seriesLiveIdentityCorrection.js'),
    'utf8'
  );
  assert(
    '身份纠正独立于旧 journal',
    identitySrc.indexOf('saveSnapshotApi') < 0 &&
      identitySrc.indexOf('seriesLiveMutationJournal') < 0 &&
      identitySrc.indexOf('persistMatch(beforeMatch') >= 0 &&
      identitySrc.indexOf('executeSeriesLiveIdentityCorrection') >= 0
  );
})();

if (failed.length) {
  console.error('FAIL ' + failed.length + ' / ' + (passed + failed.length));
  failed.forEach(function (n) {
    console.error(' - ' + n);
  });
  process.exit(1);
}
console.log('ok ' + passed + ' assertions seriesLiveIdentityCorrection.selftest');
