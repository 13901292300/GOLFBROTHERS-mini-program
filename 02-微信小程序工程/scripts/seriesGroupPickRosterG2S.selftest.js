/**
 * Patch G2-S：Series group-pick 已报名名单读 series.roster
 * 运行：node scripts/seriesGroupPickRosterG2S.selftest.js
 */

var path = require('path');
var fs = require('fs');
var seriesTestPaths = require('./lib/seriesTestPaths.js');

var root = path.join(__dirname, '..');
var utilsDir = path.join(root, 'miniprogram', 'utils');
var pageDir = path.join(
  root,
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail'
);
var groupPickDir = path.join(
  root,
  'miniprogram',
  'subpackages',
  'tournament-manage',
  'pages',
  'group-pick'
);
var groupEditorDir = path.join(
  root,
  'miniprogram',
  'subpackages',
  'tournament-manage',
  'pages',
  'group-editor'
);

var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));
var seriesStationMatch = require(path.join(utilsDir, 'seriesStationMatch.js'));
var pickRoster = require(seriesTestPaths.util('seriesGroupPickRoster.js'));

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

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}

function makeOrgSeries() {
  var s = seriesModel.createEmptySeriesDraft({
    hostMode: 'organization',
    templateId: 'inter_team_series',
    seriesName: 'G2S组织',
    createdBy: 'admin-1',
    organization: {
      organizationId: 'org-1',
      organizationName: '机构',
      organizationLogo: ''
    }
  });
  s.lifecycleStatus = 'published';
  s.publishToken = 'tok-g2s';
  s.participants = [
    seriesModel.createParticipant({
      kind: 'team',
      sourceTeamId: 't1',
      seriesParticipantId: 'team:t1',
      nameSnapshot: '甲队全称',
      shortNameSnapshot: '甲队'
    }),
    seriesModel.createParticipant({
      kind: 'team',
      sourceTeamId: 't2',
      seriesParticipantId: 'team:t2',
      nameSnapshot: '乙队全称',
      shortNameSnapshot: '乙队'
    })
  ];
  s.rounds = (s.rounds || []).slice(0, 1).map(function (r) {
    return Object.assign({}, r, {
      roundId: 'r1',
      index: 1,
      name: '第1轮',
      dateTime: '2030-06-01 08:00',
      gameMode: '个人比杆赛',
      courseId: 'c1',
      courseName: '球场1',
      fee: '0',
      matchId: 'm-g2s-1'
    });
  });
  s.roster = [];
  return s;
}

function makeTeamSeries() {
  var s = seriesModel.createEmptySeriesDraft({
    hostMode: 'team',
    templateId: 'internal_team_series',
    seriesName: 'G2S队内',
    createdBy: 'admin-1',
    team: { teamId: 'host-team', teamName: '主队', teamLogo: '' }
  });
  s.lifecycleStatus = 'published';
  s.publishToken = 'tok-g2s-team';
  s.participants = [
    seriesModel.createParticipant({
      kind: 'division',
      divisionId: 'div-a',
      seriesParticipantId: 'division:div-a',
      nameSnapshot: '红队'
    }),
    seriesModel.createParticipant({
      kind: 'division',
      divisionId: 'div-b',
      seriesParticipantId: 'division:div-b',
      nameSnapshot: '蓝队'
    })
  ];
  s.rounds = (s.rounds || []).slice(0, 1).map(function (r) {
    return Object.assign({}, r, {
      roundId: 'r1',
      index: 1,
      matchId: 'm-g2s-team',
      gameMode: '个人比杆赛',
      dateTime: '2030-06-01 08:00',
      courseId: 'c1',
      courseName: '球场1',
      fee: '0'
    });
  });
  s.roster = [];
  return s;
}

function rosterEntry(playerId, seriesParticipantId, extras) {
  return Object.assign(
    {
      rosterEntryId: 're-' + playerId,
      playerId: playerId,
      seriesParticipantId: seriesParticipantId,
      playerNameSnapshot: '球员' + playerId,
      playerAvatarSnapshot: 'https://example.com/' + playerId + '.png',
      genderSnapshot: playerId.charCodeAt(playerId.length - 1) % 2 ? '男' : '女',
      handicapSnapshot: 10 + Number(String(playerId).replace(/\D/g, '') || 0),
      registrationStatus: 'registered'
    },
    extras || {}
  );
}

function makeMatch(series) {
  var round = series.rounds[0];
  var built = seriesStationMatch.buildMatchFromSeriesRound(series, round, {
    matchId: round.matchId,
    publishToken: series.publishToken
  });
  if (!built.ok) throw new Error(built.reason);
  var m = built.match;
  m.status = 'registering';
  m.registerInfo = { totalCount: 0, users: [] };
  m.groups = [];
  return m;
}

(function testSixRegistered() {
  var series = makeOrgSeries();
  series.roster = [
    rosterEntry('p1', 'team:t1'),
    rosterEntry('p2', 'team:t1'),
    rosterEntry('p3', 'team:t1'),
    rosterEntry('p4', 'team:t2'),
    rosterEntry('p5', 'team:t2'),
    rosterEntry('p6', 'team:t2')
  ];
  var match = makeMatch(series);
  match.registerInfo = { totalCount: 99, users: [{ userId: 'ghost', groupId: 'x' }] };
  var loaded = pickRoster.loadSeriesPickRegisterSource({
    fromSeries: 1,
    seriesId: series.seriesId,
    roundId: 'r1',
    matchId: match.matchId,
    match: match,
    series: series,
    getIndexByMatchId: function () {
      return { seriesId: series.seriesId, roundId: 'r1', matchId: match.matchId };
    }
  });
  assert('核验通过并投影', loaded.ok === true);
  assert(
    'Series roster 6 人 → 显示 6 名已报名',
    loaded.registerInfo.totalCount === 6 && loaded.registerInfo.users.length === 6
  );
  assert(
    '不依赖 match.registerInfo（含幽灵用户也不混入）',
    loaded.registerInfo.users.every(function (u) {
      return u.userId !== 'ghost';
    })
  );
})();

(function testFilters() {
  var series = makeOrgSeries();
  series.roster = [
    rosterEntry('ok1', 'team:t1'),
    rosterEntry('cancelled1', 'team:t1', { registrationStatus: 'cancelled' }),
    rosterEntry('orphan1', 'team:gone'),
    rosterEntry('', 'team:t1', { playerId: '' }),
    Object.assign(rosterEntry('bad', 'team:t1'), { playerId: '', userId: '' })
  ];
  var proj = pickRoster.buildSeriesPickRegisterProjection(series);
  assert('cancelled 不显示', proj.registerInfo.users.length === 1 && proj.registerInfo.users[0].userId === 'ok1');
  assert(
    '无效 participant 不显示',
    proj.registerInfo.users.every(function (u) {
      return u.seriesParticipantId !== 'team:gone';
    })
  );
})();

(function testOrgTabs() {
  var series = makeOrgSeries();
  series.roster = [
    rosterEntry('a1', 'team:t1'),
    rosterEntry('a2', 'team:t1'),
    rosterEntry('b1', 'team:t2')
  ];
  var proj = pickRoster.buildSeriesPickRegisterProjection(series);
  assert(
    'organization 按参赛球队分子 TAB',
    proj.registerSubTabs.length === 2 &&
      proj.registerSubTabs[0].id === 'team:t1' &&
      proj.registerSubTabs[0].name === '甲队' &&
      proj.registerSubTabs[0].count === 2 &&
      proj.registerSubTabs[1].id === 'team:t2' &&
      proj.registerSubTabs[1].count === 1
  );
  assert(
    '球队子 TAB 过滤 groupId=seriesParticipantId',
    proj.registerInfo.users.filter(function (u) {
      return u.groupId === 'team:t1';
    }).length === 2
  );
})();

(function testTeamDivisionTabs() {
  var series = makeTeamSeries();
  series.roster = [
    rosterEntry('d1', 'division:div-a'),
    rosterEntry('d2', 'division:div-b'),
    rosterEntry('d3', 'division:div-b')
  ];
  var proj = pickRoster.buildSeriesPickRegisterProjection(series);
  assert(
    'team 按参赛分队分子 TAB',
    proj.registerSubTabs.length === 2 &&
      proj.registerSubTabs[0].name === '红队' &&
      proj.registerSubTabs[1].name === '蓝队' &&
      proj.registerSubTabs[1].count === 2
  );
})();

(function testAffiliationRules() {
  var series = makeOrgSeries();
  series.roster = [rosterEntry('r1', 'team:t1')];
  var proj = pickRoster.buildSeriesPickRegisterProjection(series);
  var rosterUser = proj.registerInfo.users[0];
  assert(
    'roster 球员不须再选归属',
    pickRoster.needsAffiliationSelection(rosterUser, series) === false &&
      !!rosterUser.seriesParticipantId &&
      !!rosterUser.matchTeamId
  );
  assert(
    '非 roster 球员须手选归属',
    pickRoster.needsAffiliationSelection(
      { userId: 'friend-1', displayName: '好友' },
      series
    ) === true
  );
  assert(
    '归属失效的 roster 须重选',
    pickRoster.needsAffiliationSelection(
      {
        userId: 'x',
        fromSeriesRoster: true,
        seriesParticipantId: 'team:deleted'
      },
      series
    ) === true
  );
})();

(function testOccupiedAndEmptyText() {
  var series = makeOrgSeries();
  series.roster = [rosterEntry('p1', 'team:t1'), rosterEntry('p2', 'team:t2')];
  var proj = pickRoster.buildSeriesPickRegisterProjection(series);
  assert('空名单文案', proj.emptyText === '暂无报名人员');
  // occupied 标记在 group-pick 页内；此处用同源逻辑验证 userId 可被占用表命中
  var occupied = { p1: '第2组' };
  var marked = proj.registerInfo.users.map(function (u) {
    return Object.assign({}, u, {
      isOccupied: !!occupied[u.userId],
      isDisabled: !!occupied[u.userId]
    });
  });
  assert(
    '当前轮已占席球员可标记',
    marked[0].isOccupied === true && marked[0].isDisabled === true && marked[1].isOccupied === false
  );
})();

(function testNoWriteSideEffects() {
  var series = makeOrgSeries();
  series.roster = [rosterEntry('p1', 'team:t1')];
  var rosterBefore = JSON.stringify(series.roster);
  var match = makeMatch(series);
  var regBefore = JSON.stringify(match.registerInfo);
  pickRoster.loadSeriesPickRegisterSource({
    fromSeries: 1,
    seriesId: series.seriesId,
    roundId: 'r1',
    matchId: match.matchId,
    match: match,
    series: series,
    getIndexByMatchId: function () {
      return { seriesId: series.seriesId, roundId: 'r1', matchId: match.matchId };
    }
  });
  assert('不修改 Series.roster', JSON.stringify(series.roster) === rosterBefore);
  assert('不写 match.registerInfo', JSON.stringify(match.registerInfo) === regBefore);
})();

(function testContextFail() {
  var series = makeOrgSeries();
  series.roster = [rosterEntry('p1', 'team:t1')];
  var match = makeMatch(series);
  match.seriesContext.publishToken = 'wrong';
  var bad = pickRoster.loadSeriesPickRegisterSource({
    fromSeries: 1,
    seriesId: series.seriesId,
    roundId: 'r1',
    matchId: match.matchId,
    match: match,
    series: series,
    getIndexByMatchId: function () {
      return { seriesId: series.seriesId, roundId: 'r1', matchId: match.matchId };
    }
  });
  assert(
    'context 失败提示本轮比赛数据异常',
    !bad.ok && bad.message === '本轮比赛数据异常'
  );
})();

(function testSourceWiring() {
  var pickJs = read(path.join(groupPickDir, 'index.js'));
  var pickWxml = read(path.join(groupPickDir, 'index.wxml'));
  var editorJs = read(path.join(groupEditorDir, 'index.js'));
  var seriesWxml = read(path.join(pageDir, 'index.wxml'));

  assert(
    'group-pick Series 路径加载 seriesGroupPickRoster',
    pickJs.indexOf('seriesGroupPickRoster') >= 0 &&
      pickJs.indexOf('loadSeriesPickRegisterSource') >= 0 &&
      pickJs.indexOf('fromSeries') >= 0
  );
  assert(
    '性别符号紧跟昵称，无独立性别列',
    pickWxml.indexOf('roster-gender') >= 0 &&
      pickWxml.indexOf('roster-player-line') >= 0 &&
      pickWxml.indexOf('roster-col--gender') < 0 &&
      /roster-name[\s\S]{0,120}roster-gender/.test(pickWxml)
  );
  assert(
    '空名单文案可投影为暂无报名人员',
    pickWxml.indexOf('emptyRosterText') >= 0 &&
      pickJs.indexOf('暂无报名人员') >= 0
  );
  assert(
    'group-editor fromSeries 投影 roster 并传给 group-pick',
    editorJs.indexOf('_loadSeriesPickRegisterSource') >= 0 &&
      editorJs.indexOf('fromSeries=1') >= 0 &&
      editorJs.indexOf('seriesGroupPickRoster') >= 0
  );
  assert(
    '普通路径仍可读 match.registerInfo',
    pickJs.indexOf('match.registerInfo') >= 0 &&
      /if\s*\(\s*!fromSeries\s*\)[\s\S]{0,200}match\.registerInfo/.test(pickJs)
  );
  assert(
    '不恢复 Series 页内分组 sheet',
    seriesWxml.indexOf('scheduleEditSheetVisible') < 0 &&
      seriesWxml.indexOf('<tournament-group-editor-view') < 0
  );
})();

console.log('');
console.log('---- seriesGroupPickRosterG2S.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
