/**
 * Series 创建者继承 + 自定义球队持久化
 * 运行：node scripts/seriesCreatorPersist.selftest.js
 */

var path = require('path');
var fs = require('fs');

var ROOT = path.join(__dirname, '..');
var mini = path.join(ROOT, 'miniprogram');

var memory = Object.create(null);
global.wx = {
  getStorageSync: function (key) {
    return memory[key];
  },
  setStorageSync: function (key, value) {
    memory[key] = value;
  },
  removeStorageSync: function (key) {
    delete memory[key];
  }
};

function clearModule(id) {
  try {
    delete require.cache[require.resolve(id)];
  } catch (e) {
    /* ignore */
  }
}

function loadFresh() {
  [
    path.join(mini, 'utils/teamDirectory.js'),
    path.join(mini, 'utils/seriesModel.js'),
    path.join(mini, 'utils/seriesStore.js'),
    path.join(mini, 'utils/seriesStationMatch.js'),
    path.join(mini, 'utils/seriesPublish.js'),
    path.join(mini, 'utils/seriesPublishJournal.js'),
    path.join(mini, 'utils/seriesStationIndex.js'),
    path.join(mini, 'utils/seriesManageAccess.js'),
    path.join(mini, 'utils/matchManageAccess.js'),
    path.join(mini, 'subpackages/tournament/pages/series-detail/seriesRegisterEligibility.js')
  ].forEach(clearModule);

  return {
    teamDirectory: require(path.join(mini, 'utils/teamDirectory.js')),
    seriesModel: require(path.join(mini, 'utils/seriesModel.js')),
    seriesStoreMod: require(path.join(mini, 'utils/seriesStore.js')),
    seriesStationMatch: require(path.join(mini, 'utils/seriesStationMatch.js')),
    seriesPublish: require(path.join(mini, 'utils/seriesPublish.js')),
    seriesPublishJournalMod: require(path.join(mini, 'utils/seriesPublishJournal.js')),
    seriesStationIndexMod: require(path.join(mini, 'utils/seriesStationIndex.js')),
    seriesManageAccess: require(path.join(mini, 'utils/seriesManageAccess.js')),
    matchManageAccess: require(path.join(mini, 'utils/matchManageAccess.js')),
    eligibility: require(path.join(
      mini,
      'subpackages/tournament/pages/series-detail/seriesRegisterEligibility.js'
    ))
  };
}

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

function createMemoryAdapter() {
  var bag = Object.create(null);
  return {
    getItem: function (key) {
      return { ok: true, value: bag[key] != null ? JSON.parse(JSON.stringify(bag[key])) : null };
    },
    setItem: function (key, value) {
      bag[key] = JSON.parse(JSON.stringify(value));
      return { ok: true };
    },
    _bag: bag
  };
}

function buildPublishableSeries(seriesModel, overrides) {
  var s = seriesModel.createEmptySeriesDraft({
    hostMode: 'organization',
    templateId: 'inter_team_series',
    seriesName: '创建者继承验收系列',
    createdBy: 'creator-user-a',
    organization: {
      organizationId: 'org-persist-1',
      organizationName: '持久化机构',
      organizationLogo: '/x.png'
    }
  });
  s.participants = [
    seriesModel.createParticipant({
      kind: 'team',
      sourceTeamId: 'club-mine',
      seriesParticipantId: 'team:club-mine',
      nameSnapshot: '我的队'
    }),
    seriesModel.createParticipant({
      kind: 'team',
      sourceTeamId: 'club-other',
      seriesParticipantId: 'team:club-other',
      nameSnapshot: '他队'
    })
  ];
  s.visibility = 'public';
  s.scoringRule = seriesModel.createDefaultScoringRule({
    mode: 'per_round_n',
    scoreBasis: 'gross',
    allowRepeat: false
  });
  s.rounds = s.rounds.map(function (r, idx) {
    var next = Object.assign({}, r);
    next.dateTime = '2030-07-0' + (idx + 1) + ' 08:00';
    next.gameMode = '个人比杆赛';
    next.courseId = 'c' + (idx + 1);
    next.courseName = '球场' + (idx + 1);
    next.fee = idx === 0 ? '100' : '';
    next.topN = 3;
    return next;
  });
  if (overrides) Object.assign(s, overrides);
  return s;
}

// ---------- 新草稿写创建者 / normalize 保留且不覆盖 / 旧无 createdBy 不伪造 ----------
(function testSeriesCreatedByModel() {
  var m = loadFresh().seriesModel;
  var blank = m.createEmptySeriesDraft({});
  assert('空草稿 createdBy 为空串', blank.createdBy === '');

  var withCreator = m.createEmptySeriesDraft({ createdBy: 'u-100' });
  assert('新草稿写入创建者', withCreator.createdBy === 'u-100');

  var normKeep = m.normalizeSeries({
    seriesId: 's1',
    createdBy: 'u-100',
    seriesName: 'x'
  });
  assert('normalize 保留 createdBy', normKeep.createdBy === 'u-100');

  var normEmpty = m.normalizeSeries({ seriesId: 's2', seriesName: 'old' });
  assert('旧无 createdBy 不伪造', normEmpty.createdBy === '');

  var alias = m.normalizeSeries({
    seriesId: 's3',
    creatorId: 'alias-9',
    seriesName: 'y'
  });
  assert('读取兼容 creatorId → createdBy', alias.createdBy === 'alias-9');
  assert('normalize 不写出 creatorId 字段', alias.creatorId === undefined);

  var storeMod = loadFresh().seriesStoreMod;
  var adapter = createMemoryAdapter();
  var store = storeMod.createSeriesStore(adapter);
  var saved = store.saveDraft(
    m.createEmptySeriesDraft({ seriesName: 'lock', createdBy: 'owner-1' })
  );
  assert('saveDraft 写入创建者', saved.ok && saved.series.createdBy === 'owner-1');
  var overwrite = Object.assign({}, saved.series, { createdBy: 'attacker', seriesName: 'lock2' });
  var saved2 = store.saveDraft(overwrite);
  assert(
    '已有非空 createdBy 不可被覆盖',
    saved2.ok && saved2.series.createdBy === 'owner-1'
  );
})();

// ---------- 自定义球队冷启动仍存在；owner/admin/member；participant ID 一致 ----------
(function testCreatedTeamsPersist() {
  memory = Object.create(null);
  global.wx.getStorageSync = function (key) {
    return memory[key];
  };
  global.wx.setStorageSync = function (key, value) {
    memory[key] = value;
  };
  var mods = loadFresh();
  var td = mods.teamDirectory;

  var mine = td.addCreatedTeam({
    id: 'club-mine',
    name: '我的持久球队',
    shortName: '我队',
    organizationType: 'team',
    createdBy: 'creator-user-a',
    adminUserIds: ['creator-user-a', 'admin-b'],
    members: [
      {
        userId: 'creator-user-a',
        playerId: 'creator-user-a',
        role: 'owner',
        memberStatus: 'active',
        name: '创建者甲'
      },
      {
        userId: 'admin-b',
        playerId: 'admin-b',
        role: 'admin',
        memberStatus: 'active',
        name: '管理乙'
      },
      {
        userId: 'member-c',
        playerId: 'member-c',
        role: 'member',
        memberStatus: 'active',
        name: '队员丙'
      }
    ]
  });
  assert('自定义球队创建成功', !!(mine && mine.id === 'club-mine'));

  var other = td.addCreatedTeam({
    id: 'club-other',
    name: '他队',
    shortName: '他队',
    organizationType: 'team',
    createdBy: 'other-owner',
    adminUserIds: ['other-owner'],
    members: [
      {
        userId: 'other-owner',
        role: 'owner',
        memberStatus: 'active',
        name: '他主'
      }
    ]
  });
  assert('第二支自定义球队创建成功', !!(other && other.id === 'club-other'));

  var org = td.addCreatedTeam({
    id: 'org-persist-1',
    name: '持久化机构',
    organizationType: 'event_org',
    createdBy: 'creator-user-a',
    adminUserIds: ['creator-user-a']
  });
  assert('自定义机构持久创建', !!(org && org.id === 'org-persist-1'));

  // 模拟冷启动：清模块缓存后重载
  var mods2 = loadFresh();
  var td2 = mods2.teamDirectory;
  td2.reloadCreatedTeamsFromStorage();
  assert('冷启动后球队仍在目录', !!td2.getTeamById('club-mine'));
  assert('冷启动后机构仍在目录', !!td2.getTeamById('org-persist-1'));

  var ownerTeams = td2.listActiveClubTeamsForUser('creator-user-a');
  var adminTeams = td2.listActiveClubTeamsForUser('admin-b');
  var memberTeams = td2.listActiveClubTeamsForUser('member-c');
  var strangerTeams = td2.listActiveClubTeamsForUser('stranger-z');
  assert(
    'owner 归属 club-mine',
    ownerTeams.some(function (t) {
      return t.teamId === 'club-mine';
    })
  );
  assert(
    'admin 归属 club-mine',
    adminTeams.some(function (t) {
      return t.teamId === 'club-mine';
    })
  );
  assert(
    'member 归属 club-mine',
    memberTeams.some(function (t) {
      return t.teamId === 'club-mine';
    })
  );
  assert('无关用户无自定义队', strangerTeams.length === 0 || !strangerTeams.some(function (t) {
    return t.teamId === 'club-mine' || t.teamId === 'club-other';
  }));

  var series = buildPublishableSeries(mods2.seriesModel);
  assert(
    'participant sourceTeamId 与目录 ID 一致',
    series.participants[0].sourceTeamId === 'club-mine' && !!td2.getTeamById('club-mine')
  );
})();

// ---------- 分站继承 / resume·repair 稳定 / 空身份不产生分站 / 旧 journal 不漂移 ----------
(function testPublishCreatorInheritance() {
  memory = Object.create(null);
  var mods = loadFresh();
  var seriesModel = mods.seriesModel;
  var seriesStationMatch = mods.seriesStationMatch;
  var seriesPublish = mods.seriesPublish;
  var seriesStoreMod = mods.seriesStoreMod;
  var journalMod = mods.seriesPublishJournalMod;
  var indexMod = mods.seriesStationIndexMod;

  var seriesAdapter = createMemoryAdapter();
  var journalAdapter = createMemoryAdapter();
  var indexAdapter = createMemoryAdapter();
  var seriesStore = seriesStoreMod.createSeriesStore(seriesAdapter);
  var journal = journalMod.createSeriesPublishJournal(journalAdapter);
  var stationIndex = indexMod.createSeriesStationIndex(indexAdapter);
  var matchRepo = seriesPublish.createMemoryMatchRepo();
  var fixedNow = new Date(2026, 5, 1, 12, 0, 0, 0).getTime();
  var publisher = seriesPublish.createSeriesPublisher({
    seriesStore: seriesStore,
    stationIndex: stationIndex,
    journal: journal,
    matchRepo: matchRepo,
    now: function () {
      return fixedNow;
    }
  });

  var emptyCreator = buildPublishableSeries(seriesModel, { createdBy: '' });
  var savedEmpty = seriesStore.saveDraft(emptyCreator);
  var planEmpty = publisher.planPublish(savedEmpty.series, { now: fixedNow });
  assert(
    '空身份首次发布停止',
    planEmpty.ok === false && planEmpty.reason === 'creator_required'
  );
  assert('空身份不产生 journal', !journalAdapter._bag[Object.keys(journalAdapter._bag)[0]]);

  var series = buildPublishableSeries(seriesModel);
  seriesStore.saveDraft(series);
  var planned = publisher.planPublish(seriesStore.getSeriesById(series.seriesId), {
    now: fixedNow
  });
  assert('首次发布计划成功', planned.ok === true, planned.reason);
  var rounds = planned.journal.rounds || [];
  assert('轮次>=2', rounds.length >= 2);
  var creators = rounds.map(function (rp) {
    return rp.matchPayload && rp.matchPayload.createdBy;
  });
  assert(
    '全轮继承相同创建者',
    creators.every(function (c) {
      return c === 'creator-user-a';
    }) &&
      creators.every(function (c, _, arr) {
        return c === arr[0];
      })
  );
  assert(
    'match creatorId 同步',
    rounds.every(function (rp) {
      return rp.matchPayload.creatorId === 'creator-user-a';
    })
  );

  var frozenCreator = rounds[0].matchPayload.createdBy;
  // resume：journal 已冻结创建者；换操作者 opts 不得改变
  var resumed = publisher.publishSeries(series.seriesId, {
    now: fixedNow,
    creatorId: 'other-operator'
  });
  assert('resume/publish 可继续', resumed.ok === true || resumed.reason === 'already_published' || resumed.ok, resumed.reason);
  var j2 = journal.getJournal(series.seriesId);
  var still = (j2.journal.rounds || []).map(function (rp) {
    return rp.matchPayload.createdBy;
  });
  assert(
    'resume 创建者不漂移',
    still.every(function (c) {
      return c === frozenCreator;
    })
  );

  // 旧 journal fingerprint：用 legacy 省略 createdBy 的指纹仍可通过校验
  var legacyPayload = JSON.parse(JSON.stringify(rounds[0].matchPayload));
  var legacyFp = seriesStationMatch.fingerprintOf(
    seriesStationMatch.extractStationPayloadForFingerprint(legacyPayload, {
      legacyOmitCreator: true
    })
  );
  var fakeJournal = {
    seriesId: series.seriesId,
    publishToken: planned.journal.publishToken,
    planVersion: planned.journal.planVersion,
    planFingerprint: '',
    sourceFingerprint: planned.journal.sourceFingerprint,
    phase: 'done',
    rounds: [
      {
        roundId: rounds[0].roundId,
        matchId: rounds[0].matchId,
        payloadFingerprint: legacyFp,
        matchPayload: legacyPayload,
        status: 'indexed',
        lastError: ''
      }
    ].concat(
      rounds.slice(1).map(function (rp) {
        return {
          roundId: rp.roundId,
          matchId: rp.matchId,
          payloadFingerprint: seriesStationMatch.fingerprintOf(
            seriesStationMatch.extractStationPayloadForFingerprint(rp.matchPayload, {
              legacyOmitCreator: true
            })
          ),
          matchPayload: rp.matchPayload,
          status: 'indexed',
          lastError: ''
        };
      })
    ),
    lastError: '',
    audit: {}
  };
  fakeJournal.planFingerprint = seriesStationMatch.computePlanFingerprint(fakeJournal.rounds);
  var vLegacy = seriesStationMatch.validateFrozenJournal(fakeJournal);
  assert('旧 journal fingerprint 不漂移（legacy 回退）', vLegacy.ok === true, vLegacy.detail);

  // 新指纹含 createdBy：篡改创建者应失败
  var tampered = JSON.parse(JSON.stringify(planned.journal));
  tampered.rounds[0].matchPayload.createdBy = 'hijacker';
  tampered.rounds[0].matchPayload.creatorId = 'hijacker';
  // 保持旧 fingerprint → 应 corrupt
  var vTamper = seriesStationMatch.validateFrozenJournal(tampered);
  assert(
    '篡改创建者导致 journal 校验失败',
    vTamper.ok === false && vTamper.detail === 'payload_fingerprint_mismatch'
  );
})();

// ---------- M / 报名分离；非创建者成员可报名；普通用户无 M ----------
(function testManageAndEligibilitySeparation() {
  memory = Object.create(null);
  var mods = loadFresh();
  var td = mods.teamDirectory;
  td.addCreatedTeam({
    id: 'club-mine',
    name: '我的持久球队',
    organizationType: 'team',
    createdBy: 'creator-user-a',
    adminUserIds: ['creator-user-a'],
    members: [
      {
        userId: 'creator-user-a',
        role: 'owner',
        memberStatus: 'active',
        name: '甲'
      },
      {
        userId: 'member-only',
        role: 'member',
        memberStatus: 'active',
        name: '仅队员'
      }
    ]
  });
  td.addCreatedTeam({
    id: 'club-other',
    name: '他队',
    organizationType: 'team',
    createdBy: 'other-owner',
    adminUserIds: ['other-owner'],
    members: [{ userId: 'other-owner', role: 'owner', memberStatus: 'active', name: '他' }]
  });

  var series = buildPublishableSeries(mods.seriesModel);
  // 创建者且属参赛球队 → 可报名 + 有 M
  var eligCreator = mods.eligibility.resolveSeriesRegistrationEligibility({
    series: series,
    playerId: 'creator-user-a'
  });
  assert(
    '创建者属参赛队可报名',
    eligCreator.eligibleParticipantIds.indexOf('team:club-mine') >= 0
  );
  var fabCreator = mods.seriesManageAccess.resolveSeriesManageFabVisible({
    series: series,
    user: { userId: 'creator-user-a' },
    accessContentReady: true,
    lifecycleAccess: { lifecycleStatus: 'published' },
    getMatchById: function () {
      return null;
    },
    getIndexByMatchId: function () {
      return null;
    }
  });
  assert('创建者可见 M', fabCreator.visible === true, fabCreator.reason);

  // 仅管理员但非参赛：造一条无交集的创建者
  var adminOnlySeries = buildPublishableSeries(mods.seriesModel, {
    createdBy: 'admin-not-player',
    participants: [
      mods.seriesModel.createParticipant({
        kind: 'team',
        sourceTeamId: 'club-other',
        seriesParticipantId: 'team:club-other',
        nameSnapshot: '他队'
      }),
      mods.seriesModel.createParticipant({
        kind: 'team',
        sourceTeamId: 'club-mine',
        seriesParticipantId: 'team:club-mine',
        nameSnapshot: '我队'
      })
    ]
  });
  var eligAdminOnly = mods.eligibility.resolveSeriesRegistrationEligibility({
    series: adminOnlySeries,
    playerId: 'admin-not-player'
  });
  assert(
    '创建者不自动获得报名资格',
    eligAdminOnly.eligibleParticipantIds.length === 0 &&
      eligAdminOnly.ineligibleMessage === mods.eligibility.MSG_NOT_PARTICIPANT_TEAM
  );
  var fabAdminOnly = mods.seriesManageAccess.resolveSeriesManageFabVisible({
    series: adminOnlySeries,
    user: { userId: 'admin-not-player' },
    accessContentReady: true,
    lifecycleAccess: { lifecycleStatus: 'published' },
    getMatchById: function () {
      return null;
    },
    getIndexByMatchId: function () {
      return null;
    }
  });
  assert('非参赛创建者仍可见 M', fabAdminOnly.visible === true);

  var eligMember = mods.eligibility.resolveSeriesRegistrationEligibility({
    series: series,
    playerId: 'member-only'
  });
  assert(
    '非创建者但球队成员可报名',
    eligMember.eligibleParticipantIds.indexOf('team:club-mine') >= 0
  );
  var fabMember = mods.seriesManageAccess.resolveSeriesManageFabVisible({
    series: series,
    user: { userId: 'member-only' },
    accessContentReady: true,
    lifecycleAccess: { lifecycleStatus: 'published' },
    getMatchById: function () {
      return null;
    },
    getIndexByMatchId: function () {
      return null;
    }
  });
  assert('普通成员无 M', fabMember.visible === false, fabMember.reason);

  var match = {
    matchId: 'm1',
    matchType: 'inter-team',
    organizationId: 'org-persist-1',
    createdBy: 'creator-user-a',
    creatorId: 'creator-user-a',
    tempAdmins: []
  };
  var acc = mods.matchManageAccess.resolveMatchManageAccess(match, {
    userId: 'creator-user-a'
  });
  assert('分站继承创建者后 matchManageAccess 识别', acc.isCreator === true && acc.isPrivilegedUser);
})();

// ---------- 静态：不碰历史两条 Series；页面写创建者；sourceFingerprint 不含 createdBy ----------
(function testStaticGuards() {
  var mods = loadFresh();
  var srcFp = mods.seriesStationMatch.computeSeriesPlanSourceFingerprint.toString();
  assert(
    'sourceFingerprint 函数未纳入 createdBy',
    srcFp.indexOf('createdBy') < 0
  );

  var createPage = fs.readFileSync(
    path.join(mini, 'subpackages/create/pages/series/index.js'),
    'utf8'
  );
  assert(
    '创建页草稿写入 createdBy',
    createPage.indexOf('createdBy: creatorId') >= 0 ||
      createPage.indexOf('createdBy: creatorId') >= 0 ||
      /createEmptySeriesDraft\([\s\S]*createdBy/.test(createPage)
  );
  assert('创建页不写死 me', !/createdBy:\s*['"]me['"]/.test(createPage));

  var publishSrc = fs.readFileSync(path.join(mini, 'utils/seriesPublish.js'), 'utf8');
  assert(
    'planPublish 使用 series.createdBy 而非操作者覆盖',
    publishSrc.indexOf('creator_required') >= 0 &&
      publishSrc.indexOf('seriesCreator') >= 0
  );

  // 历史两条 ID 不得出现在本批业务写入路径（自测允许提及）
  var teamDir = fs.readFileSync(path.join(mini, 'utils/teamDirectory.js'), 'utf8');
  assert(
    'teamDirectory 未硬编码历史 seriesId',
    teamDir.indexOf('series-msoc2pqb') < 0 && teamDir.indexOf('series-msplezqq') < 0
  );
  assert(
    '使用 gb_created_teams_v1 持久化',
    teamDir.indexOf('gb_created_teams_v1') >= 0
  );
})();

console.log('');
console.log('---- seriesCreatorPersist.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('Failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
