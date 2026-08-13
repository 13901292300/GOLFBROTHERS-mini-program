/**
 * Series 分组标签 — 真实持久层 round-trip
 *
 * participant → roster → pick 返回 → editor draft
 * → toFormalGroups → normalizeFormalGroupSeats
 * → saveMatch → getMatchById → buildReadonlyGroupCards
 *
 * 运行：node scripts/seriesGroupLabelRoundTrip.selftest.js
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
var groupPickDir = path.join(
  root,
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'group-pick'
);
var groupEditorDir = path.join(
  root,
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'group-editor'
);

var memStore = Object.create(null);
global.wx = {
  getStorageSync: function (key) {
    return memStore[key];
  },
  setStorageSync: function (key, value) {
    memStore[key] = value;
  }
};

var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));
var seriesStationMatch = require(path.join(utilsDir, 'seriesStationMatch.js'));
var tournamentGroupDraft = require(path.join(utilsDir, 'tournamentGroupDraft.js'));
var tournamentGroupCardView = require(path.join(utilsDir, 'tournamentGroupCardView.js'));
var strokeGroupSeatNormalizer = require(path.join(utilsDir, 'strokeGroupSeatNormalizer.js'));
var teamMatchStore = require(path.join(utilsDir, 'teamMatchStore.js'));
var tPosition = require(path.join(utilsDir, 'tPosition.js'));
var seriesGroupPickRoster = require(path.join(pageDir, 'seriesGroupPickRoster.js'));

var passed = 0;
var failed = 0;
var failures = [];
/** 记录首次裁掉 seriesParticipantId 的函数名（自测探测） */
var firstStripFn = '';

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

function findSeat(players, uid) {
  var list = Array.isArray(players) ? players : [];
  for (var i = 0; i < list.length; i++) {
    if (list[i] && String(list[i].userId) === uid) return list[i];
  }
  return null;
}

function hasSid(seat, sid) {
  return !!(seat && String(seat.seriesParticipantId || '') === sid);
}

function markStrip(fnName, seat, sid) {
  if (!firstStripFn && !hasSid(seat, sid)) {
    firstStripFn = fnName;
  }
}

function makeOrgSeries() {
  var s = seriesModel.createEmptySeriesDraft({
    hostMode: 'organization',
    templateId: 'inter_team_series',
    seriesName: '标签往返系列',
    createdBy: 'admin-1',
    organization: {
      organizationId: 'org-1',
      organizationName: '机构',
      organizationLogo: ''
    }
  });
  s.lifecycleStatus = 'published';
  s.publishToken = 'tok-rt';
  s.participants = [
    seriesModel.createParticipant({
      kind: 'team',
      sourceTeamId: 't1',
      seriesParticipantId: 'team:t1',
      nameSnapshot: '甲队全称',
      shortNameSnapshot: '甲队',
      colorSnapshot: '#111111'
    }),
    seriesModel.createParticipant({
      kind: 'team',
      sourceTeamId: 't2',
      seriesParticipantId: 'team:t2',
      nameSnapshot: '乙队全称',
      shortNameSnapshot: '乙队',
      colorSnapshot: '#222222'
    })
  ];
  s.rounds = (s.rounds || []).slice(0, 2).map(function (r, idx) {
    return Object.assign({}, r, {
      roundId: 'r' + (idx + 1),
      index: idx + 1,
      matchId: 'm-label-rt-' + (idx + 1),
      gameMode: '个人比杆赛',
      dateTime: '2030-06-0' + (idx + 1) + ' 08:00',
      courseId: 'c1',
      courseName: '球场',
      fee: '0'
    });
  });
  s.roster = [
    {
      rosterEntryId: 're-1',
      playerId: 'roster-p1',
      seriesParticipantId: 'team:t1',
      registrationStatus: 'registered',
      nameSnapshot: '名册甲',
      genderSnapshot: '男',
      avatarSnapshot: 'https://example.com/r1.png'
    }
  ];
  return s;
}

function makeTeamSeries() {
  var s = seriesModel.createEmptySeriesDraft({
    hostMode: 'team',
    templateId: 'internal_team_series',
    seriesName: '分队标签往返',
    createdBy: 'admin-1',
    team: { teamId: 'ht', teamName: '主队', teamLogo: '' }
  });
  s.lifecycleStatus = 'published';
  s.publishToken = 'tok-div';
  s.participants = [
    seriesModel.createParticipant({
      kind: 'division',
      divisionId: 'div-a',
      seriesParticipantId: 'division:div-a',
      nameSnapshot: '红队',
      colorSnapshot: '#ff0000'
    }),
    seriesModel.createParticipant({
      kind: 'division',
      divisionId: 'div-b',
      seriesParticipantId: 'division:div-b',
      nameSnapshot: '蓝队',
      colorSnapshot: '#0000ff'
    })
  ];
  s.rounds = (s.rounds || []).slice(0, 1).map(function (r) {
    return Object.assign({}, r, {
      roundId: 'r1',
      matchId: 'm-div-rt',
      gameMode: '个人比杆赛',
      dateTime: '2030-06-01 08:00',
      courseId: 'c1',
      courseName: '球场',
      fee: '0'
    });
  });
  s.roster = [
    {
      rosterEntryId: 're-d1',
      playerId: 'div-p1',
      seriesParticipantId: 'division:div-a',
      registrationStatus: 'registered',
      nameSnapshot: '红一',
      genderSnapshot: '男'
    }
  ];
  return s;
}

function buildMatch(series, round) {
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

/** 模拟 group-pick 对非 roster 手选归属后的返回席位 */
function simulateNonRosterPickReturn(pos, userId, name, gender, participant, teamGroupId) {
  var sid = String(participant.seriesParticipantId);
  var shortSnap =
    String(participant.shortNameSnapshot || '').trim() ||
    String(participant.nameSnapshot || '').trim();
  var nameSnap = String(participant.nameSnapshot || '').trim() || shortSnap;
  return {
    position: pos,
    userId: userId,
    displayName: name,
    gender: gender,
    tee: gender === '女' || gender === 'female' ? tPosition.RED_T : tPosition.BLUE_T,
    tPosition: gender === '女' || gender === 'female' ? tPosition.RED_T : tPosition.BLUE_T,
    matchTeamId: teamGroupId,
    groupId: sid,
    matchTeamName: shortSnap,
    groupName: shortSnap,
    seriesParticipantId: sid,
    affiliationId: teamGroupId,
    participantNameSnapshot: nameSnap,
    participantShortNameSnapshot: shortSnap,
    participantColorSnapshot: String(participant.colorSnapshot || '').trim(),
    fromSeriesRoster: false
  };
}

/**
 * 对齐 group-editor onConfirm 生产路径（非 live）：
 * sanitize → toFormalGroups → normalizeFormalGroupSeats → saveMatch
 */
function productionSaveGroups(match, draft) {
  var sanitized = tournamentGroupDraft.sanitizeGroupDraft(draft);
  var formal = tournamentGroupDraft.toFormalGroups(sanitized);
  formal = strokeGroupSeatNormalizer.normalizeFormalGroupSeats(formal, match);
  var next = Object.assign({}, match, {
    groups: formal,
    updatedAt: Date.now()
  });
  teamMatchStore.saveMatch(next);
  return teamMatchStore.getMatchById(match.matchId);
}

(function testOrgPersistRoundTrip() {
  memStore = Object.create(null);
  firstStripFn = '';
  var series = makeOrgSeries();
  var rosterBefore = JSON.parse(JSON.stringify(series.roster));
  var match = buildMatch(series, series.rounds[0]);
  var other = buildMatch(series, series.rounds[1]);
  other.groups = [
    {
      groupId: 'keep',
      groupName: '第1组',
      players: [
        { position: 1, userId: 'keep-u', displayName: '保留' },
        { position: 2, userId: '' },
        { position: 3, userId: '' },
        { position: 4, userId: '' }
      ]
    }
  ];
  teamMatchStore.saveMatch(other);
  var regBefore = JSON.parse(JSON.stringify(match.registerInfo));

  // L1 pick roster
  var pickSrc = seriesGroupPickRoster.buildSeriesPickRegisterProjection(series);
  var pickUser = pickSrc.registerInfo.users.find(function (u) {
    return u.userId === 'roster-p1';
  });
  assert('L1 pick roster 有 seriesParticipantId', hasSid(pickUser, 'team:t1'));
  assert(
    'L1 pick roster 有简称/颜色快照',
    pickUser.participantShortNameSnapshot === '甲队' &&
      pickUser.participantColorSnapshot === '#111111'
  );

  var nonRoster = simulateNonRosterPickReturn(
    2,
    'friend-2',
    '好友乙',
    '女',
    series.participants[1],
    't2'
  );
  assert('L1 非 roster 手选有 seriesParticipantId', hasSid(nonRoster, 'team:t2'));

  // L2 editor draft
  var draft = [
    {
      groupId: 'g1',
      groupName: '第1组',
      players: [
        Object.assign({}, pickUser, {
          position: 1,
          tee: tPosition.BLUE_T,
          tPosition: tPosition.BLUE_T
        }),
        nonRoster,
        { position: 3, userId: '' },
        { position: 4, userId: '' }
      ]
    }
  ];
  assert(
    'L2 draft 保存前有合法 seriesParticipantId',
    hasSid(draft[0].players[0], 'team:t1') && hasSid(draft[0].players[1], 'team:t2')
  );

  // L3 toFormalGroups
  var formal = tournamentGroupDraft.toFormalGroups(draft);
  var f0 = findSeat(formal[0].players, 'roster-p1');
  var f1 = findSeat(formal[0].players, 'friend-2');
  markStrip('tournamentGroupDraft.toFormalGroups', f0, 'team:t1');
  assert(
    'L3 toFormalGroups 后仍有 seriesParticipantId + 快照',
    hasSid(f0, 'team:t1') &&
      hasSid(f1, 'team:t2') &&
      f0.participantShortNameSnapshot === '甲队' &&
      f0.participantNameSnapshot === '甲队全称' &&
      f0.participantColorSnapshot === '#111111' &&
      f1.participantShortNameSnapshot === '乙队'
  );

  // L4 normalize（个人比杆赛保存必经）
  var normalized = strokeGroupSeatNormalizer.normalizeFormalGroupSeats(formal, match);
  var n0 = findSeat(normalized[0].players, 'roster-p1');
  var n1 = findSeat(normalized[0].players, 'friend-2');
  markStrip('strokeGroupSeatNormalizer.normalizeFormalGroupSeats', n0, 'team:t1');
  assert(
    'L4 normalizeFormalGroupSeats 后仍有 seriesParticipantId + 快照',
    hasSid(n0, 'team:t1') &&
      hasSid(n1, 'team:t2') &&
      n0.participantShortNameSnapshot === '甲队' &&
      n1.participantColorSnapshot === '#222222'
  );

  // L5 saveMatch → getMatchById
  match.groups = normalized;
  match.updatedAt = Date.now();
  teamMatchStore.saveMatch(match);
  var reloaded = teamMatchStore.getMatchById(match.matchId);
  var r0 = findSeat(reloaded.groups[0].players, 'roster-p1');
  var r1 = findSeat(reloaded.groups[0].players, 'friend-2');
  markStrip('teamMatchStore.getMatchById(after saveMatch)', r0, 'team:t1');
  assert(
    'L5 saveMatch 后重新读取仍有 seriesParticipantId',
    hasSid(r0, 'team:t1') && hasSid(r1, 'team:t2')
  );
  assert(
    'L5 participant 名称/简称/颜色快照仍在',
    r0.participantNameSnapshot === '甲队全称' &&
      r0.participantShortNameSnapshot === '甲队' &&
      r0.participantColorSnapshot === '#111111' &&
      r1.participantShortNameSnapshot === '乙队'
  );

  // L6 投影
  var cards = tournamentGroupCardView.buildReadonlyGroupCards(reloaded, {
    series: series
  });
  var dp0 = cards[0].displayPlayers.find(function (p) {
    return p.userId === 'roster-p1';
  });
  var dp1 = cards[0].displayPlayers.find(function (p) {
    return p.userId === 'friend-2';
  });
  assert('L6 organization 球队简称 teamLabel', dp0 && dp0.teamLabel === '甲队');
  assert('L6 非 roster 手选 teamLabel', dp1 && dp1.teamLabel === '乙队');

  // L7 再打开编辑 hydrate → 再保存（生产常见二次保存）
  var redraft = tournamentGroupDraft.buildInitialGroupDraft(reloaded);
  var rd0 = findSeat(redraft[0].players, 'roster-p1');
  markStrip('tournamentGroupDraft.hydrateDraftPlayers/buildInitialGroupDraft', rd0, 'team:t1');
  assert(
    'L7 hydrate/buildInitialGroupDraft 保留 seriesParticipantId',
    hasSid(rd0, 'team:t1') && rd0.participantShortNameSnapshot === '甲队'
  );
  var reloaded2 = productionSaveGroups(reloaded, redraft);
  var r2 = findSeat(reloaded2.groups[0].players, 'roster-p1');
  markStrip('productionSaveGroups(after hydrate)', r2, 'team:t1');
  assert(
    'L7 二次保存后读盘仍有 seriesParticipantId',
    hasSid(r2, 'team:t1')
  );
  var cards2 = tournamentGroupCardView.buildReadonlyGroupCards(reloaded2, {
    series: series
  });
  assert(
    'L7 二次保存后 organization teamLabel 仍正确',
    cards2[0].displayPlayers.find(function (p) {
      return p.userId === 'roster-p1';
    }).teamLabel === '甲队'
  );

  assert(
    '不修改 Series.roster',
    JSON.stringify(series.roster) === JSON.stringify(rosterBefore)
  );
  assert(
    '不写 match.registerInfo',
    JSON.stringify(reloaded2.registerInfo) === JSON.stringify(regBefore)
  );
  var otherReload = teamMatchStore.getMatchById(other.matchId);
  assert(
    '不影响其他轮次',
    otherReload &&
      otherReload.groups[0].groupId === 'keep' &&
      otherReload.groups[0].players[0].userId === 'keep-u'
  );
})();

(function testTeamDivisionPersist() {
  memStore = Object.create(null);
  var series = makeTeamSeries();
  var match = buildMatch(series, series.rounds[0]);
  var pickUser = seriesGroupPickRoster.buildSeriesPickRegisterProjection(series)
    .registerInfo.users[0];
  var friend = simulateNonRosterPickReturn(
    2,
    'friend-b',
    '蓝友',
    '女',
    series.participants[1],
    'div-b'
  );
  var draft = [
    {
      groupId: 'g1',
      groupName: '第1组',
      players: [
        Object.assign({}, pickUser, {
          position: 1,
          tee: tPosition.BLUE_T,
          tPosition: tPosition.BLUE_T
        }),
        friend,
        { position: 3, userId: '' },
        { position: 4, userId: '' }
      ]
    }
  ];
  var reloaded = productionSaveGroups(match, draft);
  var cards = tournamentGroupCardView.buildReadonlyGroupCards(reloaded, {
    series: series
  });
  assert(
    'team 分队名 teamLabel 正确',
    cards[0].displayPlayers[0].teamLabel === '红队' &&
      cards[0].displayPlayers[1].teamLabel === '蓝队'
  );
  assert(
    'team 读盘仍有 seriesParticipantId',
    hasSid(findSeat(reloaded.groups[0].players, 'div-p1'), 'division:div-a') &&
      hasSid(findSeat(reloaded.groups[0].players, 'friend-b'), 'division:div-b')
  );
})();

(function testNormalMatchNoRegression() {
  memStore = Object.create(null);
  var match = {
    matchId: 'normal-inter-1',
    matchType: 'inter-team',
    gameMode: '个人比杆赛',
    status: 'registering',
    teamGroups: [
      { id: 'a', name: 'A队' },
      { id: 'b', name: 'B队' }
    ],
    registerInfo: {
      totalCount: 2,
      users: [
        { userId: 'u1', competitionName: 'U1', matchTeamId: 'a', gender: 'male' },
        { userId: 'u2', competitionName: 'U2', matchTeamId: 'b', gender: 'female' }
      ]
    },
    groups: [],
    scoreData: {}
  };
  teamMatchStore.saveMatch(match);
  var draft = [
    {
      groupId: 'g1',
      groupName: '第1组',
      players: [
        {
          position: 1,
          userId: 'u1',
          displayName: 'U1',
          gender: 'male',
          tPosition: tPosition.BLUE_T,
          matchTeamId: 'a'
        },
        {
          position: 2,
          userId: 'u2',
          displayName: 'U2',
          gender: 'female',
          tPosition: tPosition.RED_T,
          matchTeamId: 'b'
        },
        { position: 3, userId: '' },
        { position: 4, userId: '' }
      ]
    }
  ];
  var reloaded = productionSaveGroups(match, draft);
  var byId = {};
  reloaded.groups[0].players.forEach(function (p) {
    if (p.userId) byId[p.userId] = p;
  });
  assert(
    '普通队际 round-trip 保留 tPosition/matchTeamId',
    byId.u1 &&
      byId.u1.tPosition === tPosition.BLUE_T &&
      byId.u1.matchTeamId === 'a' &&
      byId.u2.tPosition === tPosition.RED_T
  );
  var redraft = tournamentGroupDraft.buildInitialGroupDraft(reloaded);
  assert(
    '普通 hydrate 保留 matchTeamId',
    findSeat(redraft[0].players, 'u1').matchTeamId === 'a'
  );
})();

(function testWxmlAndNoDiagResidue() {
  var seriesWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
  var scheduleIdx = seriesWxml.indexOf('schedule-groups-panel');
  var discussionIdx = seriesWxml.indexOf("activeTab === 'discussion'");
  var scheduleBlock =
    scheduleIdx >= 0
      ? seriesWxml.slice(scheduleIdx, discussionIdx > scheduleIdx ? discussionIdx : scheduleIdx + 8000)
      : '';
  assert(
    'WXML 标签节点消费 teamLabel',
    scheduleBlock.indexOf('pl.teamLabel') >= 0 &&
      scheduleBlock.indexOf('gb-group-player-team-label') >= 0 &&
      scheduleBlock.indexOf('wx:if="{{pl.teamLabel}}"') >= 0
  );

  var sources = [
    path.join(pageDir, 'index.js'),
    path.join(groupEditorDir, 'index.js'),
    path.join(groupPickDir, 'index.js'),
    path.join(utilsDir, 'tournamentGroupDraft.js'),
    path.join(utilsDir, 'tournamentGroupCardView.js'),
    path.join(utilsDir, 'strokeGroupSeatNormalizer.js')
  ];
  var diagHit = '';
  sources.forEach(function (p) {
    if (!fs.existsSync(p)) return;
    var src = fs.readFileSync(p, 'utf8');
    if (src.indexOf('SeriesGroupLabelDiag') >= 0 || src.indexOf('groupDiag') >= 0) {
      diagHit = p;
    }
  });
  assert(
    '源码内不存在 SeriesGroupLabelDiag 或 groupDiag',
    !diagHit &&
      !fs.existsSync(path.join(pageDir, 'seriesGroupLabelDiag.js')),
    diagHit || ''
  );
})();

console.log('');
console.log('---- seriesGroupLabelRoundTrip.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (firstStripFn) {
  console.log('FIRST_STRIP_FN=' + firstStripFn);
} else {
  console.log('FIRST_STRIP_FN=(none in this fixture; historical: normalizeFormalGroupSeats / hydrateDraftPlayers)');
}
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
