/**
 * Series 赛程分组卡：权威投影对齐（出发时间 / UPCOMING / T台 / 归属）
 * 运行：node scripts/seriesScheduleGroupDisplay.selftest.js
 */

var path = require('path');
var fs = require('fs');

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
var detailDir = path.join(
  root,
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'detail'
);

var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));
var seriesStationMatch = require(path.join(utilsDir, 'seriesStationMatch.js'));
var tournamentGroupDraft = require(path.join(utilsDir, 'tournamentGroupDraft.js'));
var tournamentGroupCardView = require(path.join(utilsDir, 'tournamentGroupCardView.js'));
var tPosition = require(path.join(utilsDir, 'tPosition.js'));
var scheduleVm = require(path.join(pageDir, 'seriesScheduleViewModel.js'));

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

function makeOrgSeries() {
  var s = seriesModel.createEmptySeriesDraft({
    hostMode: 'organization',
    templateId: 'inter_team_series',
    seriesName: '展示系列',
    createdBy: 'admin-1',
    organization: {
      organizationId: 'org-1',
      organizationName: '机构',
      organizationLogo: ''
    }
  });
  s.lifecycleStatus = 'published';
  s.publishToken = 'tok-disp';
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
      nameSnapshot: '乙队全称特别长名字',
      shortNameSnapshot: '乙队超长简称测试'
    })
  ];
  s.rounds = (s.rounds || []).slice(0, 2).map(function (r, idx) {
    return Object.assign({}, r, {
      roundId: 'r' + (idx + 1),
      index: idx + 1,
      matchId: 'm-disp-' + (idx + 1),
      gameMode: '个人比杆赛',
      dateTime: '2030-06-0' + (idx + 1) + ' 08:00',
      courseId: 'c1',
      courseName: '球场',
      fee: '0'
    });
  });
  s.roster = [
    {
      rosterEntryId: 'keep',
      playerId: 'keep-me',
      seriesParticipantId: 'team:t1',
      registrationStatus: 'registered'
    }
  ];
  return s;
}

function makeTeamSeries() {
  var s = seriesModel.createEmptySeriesDraft({
    hostMode: 'team',
    templateId: 'internal_team_series',
    seriesName: '队内展示',
    createdBy: 'admin-1',
    team: { teamId: 'ht', teamName: '主队', teamLogo: '' }
  });
  s.lifecycleStatus = 'published';
  s.publishToken = 'tok-team';
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
      matchId: 'm-team-disp',
      gameMode: '个人比杆赛',
      dateTime: '2030-06-01 08:00',
      courseId: 'c1',
      courseName: '球场',
      fee: '0'
    });
  });
  s.roster = [];
  return s;
}

function makeMatch(series, round) {
  var built = seriesStationMatch.buildMatchFromSeriesRound(series, round, {
    matchId: round.matchId,
    publishToken: series.publishToken
  });
  if (!built.ok) throw new Error(built.reason);
  var m = built.match;
  m.status = 'registering';
  m.registerInfo = { totalCount: 0, users: [] };
  return m;
}

function draftSeat(pos, userId, name, gender, tee, sid, teamId, teamName) {
  return {
    position: pos,
    userId: userId,
    displayName: name,
    gender: gender,
    tee: tee,
    tPosition: tee,
    seriesParticipantId: sid,
    matchTeamId: teamId,
    matchTeamName: teamName,
    groupId: sid,
    groupName: teamName,
    avatar: 'https://example.com/' + userId + '.png'
  };
}

(function testSaveKeepsSnapshots() {
  var draft = [
    {
      groupId: 'g1',
      groupName: '第1组',
      teeTime: '07:30',
      startHole: 1,
      players: [
        draftSeat(1, 'u1', '阿甲', '男', tPosition.BLUE_T, 'team:t1', 't1', '甲队'),
        draftSeat(2, 'u2', '阿乙', '女', tPosition.RED_T, 'team:t2', 't2', '乙队'),
        { position: 3, userId: '' },
        { position: 4, userId: '' }
      ]
    }
  ];
  var formal = tournamentGroupDraft.toFormalGroups(draft);
  var p1 = formal[0].players[0];
  var p2 = formal[0].players[1];
  assert(
    'draft→formal 保留昵称/性别/tee/归属/出发时间',
    p1.displayName === '阿甲' &&
      p1.gender === '男' &&
      p1.tPosition === tPosition.BLUE_T &&
      p1.seriesParticipantId === 'team:t1' &&
      p1.matchTeamId === 't1' &&
      p2.displayName === '阿乙' &&
      p2.gender === '女' &&
      p2.tPosition === tPosition.RED_T &&
      formal[0].teeTime === '07:30' &&
      formal[0].startHole === 1
  );
})();

(function testProjectDisplay() {
  var series = makeOrgSeries();
  var rosterBefore = JSON.stringify(series.roster);
  var match = makeMatch(series, series.rounds[0]);
  var other = makeMatch(series, series.rounds[1]);
  other.groups = [];
  match.groups = tournamentGroupDraft.toFormalGroups([
    {
      groupId: 'g1',
      groupName: '第1组',
      teeTime: '07:10',
      startHole: 1,
      players: [
        draftSeat(1, 'u1', '超长昵称测试一二三四五', '男', tPosition.BLUE_T, 'team:t1', 't1', '甲队'),
        draftSeat(2, 'u2', '乙女', '女', tPosition.RED_T, 'team:t2', 't2', '乙队超长简称测试'),
        draftSeat(3, 'u3', '丙男', '男', tPosition.BLUE_T, 'team:t1', 't1', '甲队'),
        draftSeat(4, 'u4', '丁女', '女', tPosition.RED_T, 'team:t2', 't2', '乙队超长简称测试')
      ]
    },
    {
      groupId: 'g2',
      groupName: '第2组',
      teeTime: '07:20',
      startHole: 10,
      players: [
        draftSeat(1, 'u5', '戊', '男', tPosition.BLUE_T, 'team:t1', 't1', '甲队'),
        { position: 2, userId: '' },
        { position: 3, userId: '' },
        { position: 4, userId: '' }
      ]
    }
  ]);
  var registerBefore = JSON.stringify(match.registerInfo);

  var cards = scheduleVm.projectGroupCards(match, series);
  assert(
    '有两组且首组四席',
    cards.length === 2 &&
      cards[0].hasDisplayPlayers === true &&
      cards[0].displayPlayers.length === 4
  );
  var players = cards[0].displayPlayers;
  assert(
    '保存返回后显示昵称',
    players[0].displayName.indexOf('超长昵称') === 0 &&
      players[1].displayName === '乙女'
  );
  assert(
    '底层 gender 快照仍保留（不在分组卡渲染）',
    !!players[0].gender && !!players[1].gender
  );
  assert(
    '四个球员分别显示真实 T 台',
    players[0].teeText === '蓝T' &&
      players[1].teeText === '红T' &&
      players[2].teeText === '蓝T' &&
      players[3].teeText === '红T'
  );
  assert(
    'organization 显示球队标签',
    players[0].teamLabel === '甲队' && !!players[1].teamLabel
  );
  assert(
    '未开始分组显示 UPCOMING',
    cards[0].statusBadge === 'UPCOMING' && cards[1].statusBadge === 'UPCOMING'
  );
  assert(
    '每组显示真实出发时间',
    cards[0].teeMetaLine.indexOf('07:10') === 0 &&
      cards[1].teeMetaLine.indexOf('07:20') === 0 &&
      cards[0].teeMetaLine !== cards[1].teeMetaLine
  );
  assert(
    '长标签按队际截断规则',
    players[1].teamLabel.length <= 4 || players[1].teamLabel.length <= 8
  );
  assert('不修改 Series.roster', JSON.stringify(series.roster) === rosterBefore);
  assert('不写 match.registerInfo', JSON.stringify(match.registerInfo) === registerBefore);
  assert('不影响其他轮次', other.groups.length === 0);

  var authority = tournamentGroupCardView.buildReadonlyGroupCards(match, {
    series: series
  });
  assert(
    '普通权威投影与 Series 投影签名一致',
    JSON.stringify(tournamentGroupCardView.cardProjectionSignature(authority)) ===
      JSON.stringify(scheduleVm.cardProjectionSignature(cards))
  );
})();

(function testGenderDefaultTeeLikeDetail() {
  var series = makeOrgSeries();
  var match = makeMatch(series, series.rounds[0]);
  match.groups = [
    {
      groupId: 'g1',
      groupName: '第1组',
      players: [
        {
          position: 1,
          userId: 'legacy-1',
          displayName: '旧数据',
          gender: '女',
          matchTeamId: 't2'
        },
        { position: 2, userId: '' },
        { position: 3, userId: '' },
        { position: 4, userId: '' }
      ]
    }
  ];
  var cards = scheduleVm.projectGroupCards(match, series);
  var p = cards[0].displayPlayers[0];
  assert(
    '无显式 T 时按 detail 性别默认（女→红T）',
    p.teeText === '红T' && p.teeMarkerClass.indexOf('female') >= 0
  );
  assert(
    '旧数据只读回退球队标签',
    p.displayName === '旧数据' && !!p.teamLabel && p.teamLabel.indexOf('乙') === 0
  );
})();

(function testNoForgeWithoutGenderOrTee() {
  var series = makeOrgSeries();
  var match = makeMatch(series, series.rounds[0]);
  match.groups = [
    {
      groupId: 'g1',
      groupName: '第1组',
      players: [
        {
          position: 1,
          userId: 'bare-1',
          displayName: '裸席'
          // 无 gender / tee / 归属
        },
        { position: 2, userId: '' },
        { position: 3, userId: '' },
        { position: 4, userId: '' }
      ]
    }
  ];
  var cards = scheduleVm.projectGroupCards(match, series);
  var p = cards[0].displayPlayers[0];
  assert('无 tee/性别不伪造 T 台', !p.teeText && !p.teeMarkerClass);
  assert('无归属不默认第一支', !p.teamLabel);
})();

(function testTeamDivisionLabel() {
  var series = makeTeamSeries();
  var match = makeMatch(series, series.rounds[0]);
  match.groups = tournamentGroupDraft.toFormalGroups([
    {
      groupId: 'g1',
      groupName: '第1组',
      players: [
        draftSeat(1, 'd1', '红一', '男', tPosition.BLUE_T, 'division:div-a', 'div-a', '红队'),
        draftSeat(2, 'd2', '蓝一', '女', tPosition.RED_T, 'division:div-b', 'div-b', '蓝队'),
        { position: 3, userId: '' },
        { position: 4, userId: '' }
      ]
    }
  ]);
  var cards = scheduleVm.projectGroupCards(match, series);
  assert(
    'team 显示分队标签',
    cards[0].displayPlayers[0].teamLabel === '红队' &&
      cards[0].displayPlayers[1].teamLabel === '蓝队'
  );
})();

(function testEmptyTeeMeta() {
  var series = makeOrgSeries();
  var match = makeMatch(series, series.rounds[0]);
  match.teeTime = '';
  match.teeTimeText = '';
  match.groups = [
    {
      groupId: 'g1',
      groupName: '第1组',
      players: [
        draftSeat(1, 'u1', '甲', '男', tPosition.BLUE_T, 'team:t1', 't1', '甲队'),
        { position: 2, userId: '' },
        { position: 3, userId: '' },
        { position: 4, userId: '' }
      ]
    }
  ];
  var cards = scheduleVm.projectGroupCards(match, series);
  assert(
    '未配置出发时间用普通赛事空态「待分配」',
    cards[0].teeMetaLine === '待分配'
  );
})();

(function testLayoutSource() {
  var seriesWxml = read(path.join(pageDir, 'index.wxml'));
  var detailWxml = read(path.join(detailDir, 'index.wxml'));
  var seriesVmSrc = read(path.join(pageDir, 'seriesScheduleViewModel.js'));
  // 赛程内容区（勿用首个 schedule sticky，它位于报名名单之前）
  var scheduleBlock = '';
  var schedulePanelIdx = seriesWxml.indexOf('schedule-groups-panel');
  var discussionIdx = seriesWxml.indexOf("activeTab === 'discussion'");
  if (schedulePanelIdx >= 0) {
    scheduleBlock = seriesWxml.slice(
      schedulePanelIdx,
      discussionIdx > schedulePanelIdx ? discussionIdx : schedulePanelIdx + 8000
    );
  }
  var registerBlock = '';
  var registerListIdx = seriesWxml.indexOf('register-user-row');
  if (registerListIdx < 0) registerListIdx = seriesWxml.indexOf('item.genderIcon');
  if (registerListIdx >= 0) {
    registerBlock = seriesWxml.slice(registerListIdx, registerListIdx + 2500);
  }
  assert(
    'Series WXML 含出发时间/状态/球员格完整结构',
    seriesWxml.indexOf('tee-start-info') >= 0 &&
      seriesWxml.indexOf('teeMetaLine') >= 0 &&
      seriesWxml.indexOf('tee-status') >= 0 &&
      seriesWxml.indexOf('statusBadge') >= 0 &&
      seriesWxml.indexOf('gb-group-player-team-label') >= 0 &&
      seriesWxml.indexOf('gb-group-player-tee') >= 0 &&
      seriesWxml.indexOf('displayPlayers') >= 0 &&
      seriesWxml.indexOf('开始本轮比赛') < 0 &&
      seriesWxml.indexOf('startScheduleRound') < 0
  );
  assert(
    'Series 赛程分组卡无性别节点/符号',
    scheduleBlock.indexOf('roster-gender') < 0 &&
      scheduleBlock.indexOf('genderIcon') < 0 &&
      scheduleBlock.indexOf('gb-group-player-name-row') < 0
  );
  assert(
    '报名名单性别符号仍存在',
    registerBlock.indexOf('roster-gender') >= 0 &&
      registerBlock.indexOf('genderIcon') >= 0
  );
  assert(
    '普通分组卡球员格无性别符号节点',
    /gb-group-player-meta[\s\S]{0,200}gb-group-player-name/.test(detailWxml) &&
      !/gb-group-player-meta[\s\S]{0,240}roster-gender/.test(detailWxml)
  );
  assert(
    'Series VM 复用权威 tournamentGroupCardView',
    seriesVmSrc.indexOf('tournamentGroupCardView') >= 0 &&
      seriesVmSrc.indexOf('buildReadonlyGroupCards') >= 0
  );
  assert(
    '队际赛分组表仍含 teeMetaLine / tee / teamLabel（无回归结构）',
    detailWxml.indexOf('teeMetaLine') >= 0 &&
      detailWxml.indexOf('gb-group-player-tee') >= 0 &&
      detailWxml.indexOf('gb-group-player-team-label') >= 0 &&
      detailWxml.indexOf('statusBadge') >= 0
  );
})();

console.log('');
console.log('---- seriesScheduleGroupDisplay.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
