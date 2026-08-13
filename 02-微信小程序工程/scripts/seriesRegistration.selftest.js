/**
 * Series 报名 B1 自测：模型 / 领域写 / revision / 发布默认 open
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesRegistration.selftest.js
 */

var path = require('path');
var fs = require('fs');

var utilsDir = path.join(__dirname, '..', 'miniprogram', 'utils');
var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));
var seriesValidators = require(path.join(utilsDir, 'seriesValidators.js'));
var seriesIds = require(path.join(utilsDir, 'seriesIds.js'));
var seriesStoreMod = require(path.join(utilsDir, 'seriesStore.js'));
var seriesRegistration = require(path.join(utilsDir, 'seriesRegistration.js'));
var seriesStationMatch = require(path.join(utilsDir, 'seriesStationMatch.js'));
var seriesPublish = require(path.join(utilsDir, 'seriesPublish.js'));
var seriesPublishJournal = require(path.join(utilsDir, 'seriesPublishJournal.js'));
var seriesStationIndex = require(path.join(utilsDir, 'seriesStationIndex.js'));

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

function freeze(o) {
  return JSON.parse(JSON.stringify(o));
}

function createMemorySeriesStore() {
  var map = Object.create(null);
  return seriesStoreMod.createSeriesStore({
    getItem: function () {
      var list = Object.keys(map).map(function (k) {
        return freeze(map[k]);
      });
      return { ok: true, value: list };
    },
    setItem: function (_key, value) {
      var list = Array.isArray(value) ? value : [];
      map = Object.create(null);
      for (var i = 0; i < list.length; i++) {
        var s = list[i];
        if (s && s.seriesId) map[String(s.seriesId)] = freeze(s);
      }
      return { ok: true };
    }
  });
}

function baseParticipants() {
  return [
    seriesModel.createParticipant({
      kind: 'team',
      sourceTeamId: 't-a',
      nameSnapshot: '阿尔法',
      shortNameSnapshot: '阿尔法'
    }),
    seriesModel.createParticipant({
      kind: 'team',
      sourceTeamId: 't-b',
      nameSnapshot: '贝塔',
      shortNameSnapshot: '贝塔'
    })
  ];
}

function makeDraftSeries(store, overrides) {
  var parts = baseParticipants();
  var draft = seriesModel.createEmptySeriesDraft(
    Object.assign(
      {
        seriesName: '报名B1杯',
        hostMode: 'organization',
        templateId: 'inter_team_series',
        // 发布链路要求创建者；fixture 显式给出，避免 creator_required
        createdBy: 'admin-fixture',
        creatorId: 'admin-fixture',
        participants: parts,
        organization: {
          organizationId: 'org-1',
          organizationName: '机构',
          organizationLogo: ''
        },
        scoringRule: { mode: 'global_m', topM: 2, scoreBasis: 'gross', allowRepeat: false },
        rounds: [
          seriesModel.createBlankRound(1, {
            name: 'R1',
            dateTime: '2099-06-01 08:00',
            gameMode: '个人比杆赛',
            fee: '100',
            courseId: 'c1',
            courseName: '球场A'
          }),
          seriesModel.createBlankRound(2, {
            name: 'R2',
            dateTime: '2099-06-02 08:00',
            gameMode: '个人比杆赛',
            fee: '100',
            courseId: 'c1',
            courseName: '球场A'
          })
        ]
      },
      overrides || {}
    )
  );
  var saved = store.saveDraft(draft);
  assert('fixture saveDraft ok', saved.ok === true, saved.reason);
  return saved.series;
}

function createService(store, opts) {
  var o = opts || {};
  return seriesRegistration.createSeriesRegistrationService({
    seriesStore: store,
    resolveEligibleParticipantIds:
      o.resolveEligibleParticipantIds ||
      function (ctx) {
        var parts = (ctx.series && ctx.series.participants) || [];
        return parts.map(function (p) {
          return p.seriesParticipantId;
        });
      },
    canManageRegistration:
      o.canManageRegistration ||
      function () {
        return true;
      },
    canRegisterForOther:
      o.canRegisterForOther ||
      function () {
        return true;
      },
    now: o.now || function () {
      return '2099-01-01T00:00:00.000Z';
    }
  });
}

function player(id) {
  return {
    playerId: id,
    competitionName: '球员' + id,
    avatar: 'https://example.com/' + id + '.png',
    gender: '男',
    handicap: 5
  };
}

(function testDraftDefaults() {
  var draft = seriesModel.createEmptySeriesDraft({ seriesName: 'x' });
  assert('draft registrationState=closed', draft.registrationState === 'closed');
  assert('draft registrationRevision=0', draft.registrationRevision === 0);
  var n = seriesModel.normalizeSeries({ seriesId: 's1', lifecycleStatus: 'draft' });
  assert('normalize 缺省 closed/0', n.registrationState === 'closed' && n.registrationRevision === 0);
})();

(function testRosterSeriesIdNormalize() {
  var parent = 'series-parent';
  var filled = seriesModel.normalizeRosterEntry(
    {
      rosterEntryId: 'e1',
      playerId: 'p1',
      seriesParticipantId: 't1',
      registrationStatus: 'registered'
    },
    parent
  );
  assert('缺失 seriesId 补父 ID', filled.seriesId === parent);
  var kept = seriesModel.normalizeRosterEntry(
    {
      rosterEntryId: 'e2',
      seriesId: 'other-series',
      playerId: 'p1',
      seriesParticipantId: 't1',
      registrationStatus: 'registered'
    },
    parent
  );
  assert('显式不一致 seriesId 保留', kept.seriesId === 'other-series');
  var series = seriesModel.normalizeSeries({
    seriesId: parent,
    participants: [{ seriesParticipantId: 't1', kind: 'team' }],
    roster: [kept]
  });
  var v = seriesValidators.validateDraftStructure(series);
  assert(
    'validator 报 seriesId mismatch',
    !v.ok &&
      v.errors.some(function (e) {
        return e.code === 'roster_series_id_mismatch';
      })
  );
})();

(function testUniqueValidators() {
  var p1 = 'part-a';
  var p2 = 'part-b';
  var series = seriesModel.normalizeSeries({
    seriesId: 's-uni',
    participants: [
      { seriesParticipantId: p1, kind: 'team' },
      { seriesParticipantId: p2, kind: 'team' }
    ],
    registrationState: 'open',
    registrationRevision: 1,
    roster: [
      {
        rosterEntryId: 'e1',
        seriesId: 's-uni',
        seriesParticipantId: p1,
        playerId: 'u1',
        registrationStatus: 'registered'
      },
      {
        rosterEntryId: 'e2',
        seriesId: 's-uni',
        seriesParticipantId: p2,
        playerId: 'u1',
        registrationStatus: 'registered'
      }
    ]
  });
  var v = seriesValidators.validateDraftStructure(series);
  assert(
    '同 player 多 active 校验失败',
    !v.ok &&
      v.errors.some(function (e) {
        return e.code === 'roster_player_multi_active';
      })
  );
  var dupPair = seriesModel.normalizeSeries({
    seriesId: 's-uni2',
    participants: [{ seriesParticipantId: p1, kind: 'team' }],
    registrationState: 'open',
    registrationRevision: 1,
    roster: [
      {
        rosterEntryId: 'e1',
        seriesId: 's-uni2',
        seriesParticipantId: p1,
        playerId: 'u1',
        registrationStatus: 'cancelled'
      },
      {
        rosterEntryId: 'e2',
        seriesId: 's-uni2',
        seriesParticipantId: p1,
        playerId: 'u1',
        registrationStatus: 'registered'
      }
    ]
  });
  var v2 = seriesValidators.validateDraftStructure(dupPair);
  assert(
    '同 player+participant 重复条目校验失败',
    !v2.ok &&
      v2.errors.some(function (e) {
        return e.code === 'roster_player_participant_duplicate';
      })
  );
})();

(function testRegisterCancelRestoreSwitch() {
  var store = createMemorySeriesStore();
  var series = makeDraftSeries(store);
  // 打开发布态报名：模拟 published + open
  series.lifecycleStatus = 'published';
  series.publishState = 'published';
  series.registrationState = 'open';
  series.registrationRevision = 1;
  assert('fixture upsert published', store.upsertSeries(series).ok);

  var svc = createService(store);
  var pidA = series.participants[0].seriesParticipantId;
  var pidB = series.participants[1].seriesParticipantId;
  var actor = { userId: 'u1', name: '甲' };

  var r1 = svc.registerSelf({
    seriesId: series.seriesId,
    player: player('u1'),
    seriesParticipantId: pidA,
    actor: actor
  });
  assert('本人报名成功', r1.ok && r1.reason === 'registered' && !r1.idempotent);
  assert('报名后 revision=2', r1.series.registrationRevision === 2);
  var entryId = r1.series.roster[0].rosterEntryId;
  var createdAt = r1.series.roster[0].createdAt;

  var r2 = svc.registerSelf({
    seriesId: series.seriesId,
    player: player('u1'),
    seriesParticipantId: pidA,
    actor: actor
  });
  assert('同主体重复报名幂等', r2.ok && r2.idempotent === true);
  assert('幂等不增加 revision', r2.series.registrationRevision === 2);

  var elsewhere = svc.registerSelf({
    seriesId: series.seriesId,
    player: player('u1'),
    seriesParticipantId: pidB,
    actor: actor
  });
  assert(
    '已在其他主体 → already_registered_elsewhere',
    elsewhere.ok === false && elsewhere.reason === 'already_registered_elsewhere'
  );

  var c1 = svc.cancelSelfRegistration({
    seriesId: series.seriesId,
    playerId: 'u1',
    actor: actor
  });
  assert('取消成功', c1.ok && c1.reason === 'cancelled');
  assert('取消后 revision=3', c1.series.registrationRevision === 3);
  assert(
    '软取消保留条目',
    c1.series.roster.length === 1 && c1.series.roster[0].registrationStatus === 'cancelled'
  );

  var c2 = svc.cancelSelfRegistration({
    seriesId: series.seriesId,
    playerId: 'u1',
    actor: actor
  });
  assert('取消幂等', c2.ok && c2.idempotent === true);
  assert('取消幂等 revision 不变', c2.series.registrationRevision === 3);

  var restore = svc.registerSelf({
    seriesId: series.seriesId,
    player: player('u1'),
    seriesParticipantId: pidA,
    actor: actor
  });
  assert('同主体恢复', restore.ok && restore.reason === 'restored');
  assert(
    '恢复保留 rosterEntryId/createdAt',
    restore.series.roster[0].rosterEntryId === entryId &&
      restore.series.roster[0].createdAt === createdAt
  );
  assert('恢复后 revision=4', restore.series.registrationRevision === 4);

  // 换主体：必须 cancel → register，不得自动覆盖
  var cancelForSwitch = svc.cancelSelfRegistration({
    seriesId: series.seriesId,
    playerId: 'u1',
    actor: actor
  });
  assert('换主体前取消', cancelForSwitch.ok && !cancelForSwitch.idempotent);
  var switchToB = svc.registerSelf({
    seriesId: series.seriesId,
    player: player('u1'),
    seriesParticipantId: pidB,
    actor: actor
  });
  assert('换主体报名 B', switchToB.ok && switchToB.reason === 'registered');
  var roster = switchToB.series.roster;
  var aEntry = roster.filter(function (e) {
    return e.seriesParticipantId === pidA;
  })[0];
  var bEntry = roster.filter(function (e) {
    return e.seriesParticipantId === pidB;
  })[0];
  assert(
    '换主体留史：A cancelled + B registered',
    aEntry &&
      aEntry.registrationStatus === 'cancelled' &&
      aEntry.rosterEntryId === entryId &&
      bEntry &&
      bEntry.registrationStatus === 'registered' &&
      bEntry.rosterEntryId !== entryId
  );
})();

(function testAffiliationAndPermission() {
  var store = createMemorySeriesStore();
  var series = makeDraftSeries(store);
  series.lifecycleStatus = 'published';
  series.publishState = 'published';
  series.registrationState = 'open';
  series.registrationRevision = 1;
  store.upsertSeries(series);
  var pidA = series.participants[0].seriesParticipantId;
  var pidB = series.participants[1].seriesParticipantId;

  var denied = createService(store, {
    resolveEligibleParticipantIds: function () {
      return [pidA];
    }
  });
  var rDenied = denied.registerSelf({
    seriesId: series.seriesId,
    player: player('u2'),
    seriesParticipantId: pidB,
    actor: { userId: 'u2' }
  });
  assert('resolver 拒绝 → affiliation_denied', rDenied.reason === 'affiliation_denied');

  var unresolved = createService(store, {
    resolveEligibleParticipantIds: function () {
      return { ok: false, reason: 'affiliation_unresolved' };
    }
  });
  var rUn = unresolved.registerSelf({
    seriesId: series.seriesId,
    player: player('u3'),
    seriesParticipantId: pidA,
    actor: { userId: 'u3' }
  });
  assert('resolver 无结果 → affiliation_unresolved', rUn.reason === 'affiliation_unresolved');

  var missing = createService(store);
  var rMiss = missing.registerSelf({
    seriesId: series.seriesId,
    player: player('u4'),
    seriesParticipantId: 'no-such',
    actor: { userId: 'u4' }
  });
  assert('participant 不存在', rMiss.reason === 'participant_not_found');

  var permDenied = createService(store, {
    canManageRegistration: function () {
      return false;
    }
  });
  assert(
    'permission_denied',
    permDenied.setRegistrationState({
      seriesId: series.seriesId,
      state: 'closed',
      actor: { userId: 'x' }
    }).reason === 'permission_denied'
  );

  var permUnresolved = createService(store, {
    canManageRegistration: function () {
      return null;
    }
  });
  assert(
    'permission_unresolved',
    permUnresolved.setRegistrationState({
      seriesId: series.seriesId,
      state: 'closed',
      actor: { userId: 'x' }
    }).reason === 'permission_unresolved'
  );

  var permOk = createService(store, {
    canManageRegistration: function () {
      return true;
    }
  });
  var closed = permOk.setRegistrationState({
    seriesId: series.seriesId,
    state: 'closed',
    actor: { userId: 'admin' }
  });
  assert('管理员关闭报名', closed.ok && closed.series.registrationState === 'closed');
  assert('关闭增加 revision', closed.series.registrationRevision === 2);
  var closedIdem = permOk.setRegistrationState({
    seriesId: series.seriesId,
    state: 'closed',
    actor: { userId: 'admin' }
  });
  assert('关闭幂等不加 revision', closedIdem.idempotent && closedIdem.series.registrationRevision === 2);
})();

(function testRevisionConflictAndWriteFail() {
  var store = createMemorySeriesStore();
  var series = makeDraftSeries(store);
  series.lifecycleStatus = 'published';
  series.publishState = 'published';
  series.registrationState = 'open';
  series.registrationRevision = 1;
  store.upsertSeries(series);
  var pidA = series.participants[0].seriesParticipantId;

  var conflict = store.upsertSeriesChecked(
    Object.assign({}, series, {
      registrationRevision: 99,
      roster: []
    }),
    0
  );
  assert(
    'revision 冲突',
    conflict.ok === false && conflict.reason === 'registration_conflict'
  );

  var failStore = seriesStoreMod.createSeriesStore({
    getItem: function () {
      return {
        ok: true,
        value: [freeze(store.getSeriesById(series.seriesId))]
      };
    },
    setItem: function () {
      return { ok: false, reason: 'storage_write_failed' };
    }
  });
  // seed
  failStore.upsertSeries = function () {
    return { ok: false, reason: 'storage_write_failed' };
  };
  failStore.upsertSeriesChecked = function () {
    return { ok: false, reason: 'storage_write_failed' };
  };
  failStore.getSeriesById = function () {
    return store.getSeriesById(series.seriesId);
  };
  var svc = seriesRegistration.createSeriesRegistrationService({
    seriesStore: failStore,
    resolveEligibleParticipantIds: function (ctx) {
      return ctx.series.participants.map(function (p) {
        return p.seriesParticipantId;
      });
    },
    canManageRegistration: function () {
      return true;
    }
  });
  var failReg = svc.registerSelf({
    seriesId: series.seriesId,
    player: player('u9'),
    seriesParticipantId: pidA,
    actor: { userId: 'u9' }
  });
  assert('写失败不产生假成功', failReg.ok === false && failReg.reason === 'storage_write_failed');
  assert(
    '写失败后原 store 无新报名',
    (store.getSeriesById(series.seriesId).roster || []).length === 0
  );
})();

(function testFingerprintIgnoresRegistration() {
  var s1 = seriesModel.createEmptySeriesDraft({
    seriesId: 'fp-s1',
    seriesName: '指纹',
    hostMode: 'organization',
    templateId: 'inter_team_series',
    participants: baseParticipants(),
    organization: { organizationId: 'o', organizationName: 'o', organizationLogo: '' },
    rounds: [
      seriesModel.createBlankRound(1, { name: 'R1', dateTime: '2099-01-01 08:00', gameMode: '个人比杆赛' }),
      seriesModel.createBlankRound(2, { name: 'R2', dateTime: '2099-01-02 08:00', gameMode: '个人比杆赛' })
    ]
  });
  var fp1 = seriesStationMatch.computeSeriesPlanSourceFingerprint(s1);
  var s2 = freeze(s1);
  s2.registrationState = 'open';
  s2.registrationRevision = 9;
  s2.roster = [
    {
      rosterEntryId: 'e',
      seriesId: s2.seriesId,
      seriesParticipantId: s2.participants[0].seriesParticipantId,
      playerId: 'u',
      registrationStatus: 'registered'
    }
  ];
  var fp2 = seriesStationMatch.computeSeriesPlanSourceFingerprint(s2);
  assert('roster/registration 不进 fingerprint', fp1 === fp2);

  var src = fs.readFileSync(path.join(utilsDir, 'seriesStationMatch.js'), 'utf8');
  var fnStart = src.indexOf('function computeSeriesPlanSourceFingerprint');
  var fnBody = src.slice(fnStart, fnStart + 1200);
  assert(
    'fingerprint 源码不含报名字段',
    fnBody.indexOf('roster') < 0 &&
      fnBody.indexOf('registrationState') < 0 &&
      fnBody.indexOf('registrationRevision') < 0
  );
})();

(function testPublishOpenAndRetry() {
  function memAdapter() {
    var bag = Object.create(null);
    return {
      getItem: function (key) {
        return {
          ok: true,
          value: bag[key] != null ? freeze(bag[key]) : null
        };
      },
      setItem: function (key, value) {
        bag[key] = freeze(value);
        return { ok: true };
      }
    };
  }
  var store = seriesStoreMod.createSeriesStore(memAdapter());
  var journal = seriesPublishJournal.createSeriesPublishJournal(memAdapter());
  var stationIndex = seriesStationIndex.createSeriesStationIndex(memAdapter());
  var matchRepo = seriesPublish.createMemoryMatchRepo();
  var publisher = seriesPublish.createSeriesPublisher({
    seriesStore: store,
    journal: journal,
    stationIndex: stationIndex,
    matchRepo: matchRepo,
    now: function () {
      return Date.parse('2099-01-01T00:00:00.000Z');
    }
  });

  var draft = makeDraftSeries(store);
  assert('发布前 closed/0', draft.registrationState === 'closed' && draft.registrationRevision === 0);
  var before = freeze(draft);
  var pub = publisher.publishSeries(draft.seriesId, {});
  assert('首次发布成功', pub.ok === true, pub.reason);
  assert(
    '首次发布 open/revision1',
    pub.series.registrationState === 'open' && pub.series.registrationRevision === 1
  );
  assert('发布不改输入对象', draft.registrationState === before.registrationState);

  var again = publisher.publishSeries(draft.seriesId, {});
  assert('已发布重试 ok', again.ok === true, again.reason);
  assert(
    '已 open 重试不增加 revision',
    again.series.registrationState === 'open' && again.series.registrationRevision === 1
  );

  // 明确关闭后 repair/重试不得重开
  var closed = freeze(again.series);
  closed.registrationState = 'closed';
  closed.registrationRevision = 2;
  assert('写入明确关闭', store.upsertSeries(closed).ok);
  var retryClosed = publisher.publishSeries(draft.seriesId, {});
  assert('明确关闭后重试仍成功或已发布', retryClosed.ok === true, retryClosed.reason);
  assert(
    'repair 不得重新打开',
    retryClosed.series.registrationState === 'closed' &&
      retryClosed.series.registrationRevision === 2
  );

  var stationSrc = fs.readFileSync(path.join(utilsDir, 'seriesStationMatch.js'), 'utf8');
  assert(
    '分站 builder 空 registerInfo 且不读 series.roster',
    stationSrc.indexOf('registerInfo: { totalCount: 0, users: [] }') >= 0 &&
      stationSrc.indexOf('series.roster') < 0
  );
  assert('matchRepo 有写入分站', matchRepo._count() >= 2);
  var dumped = matchRepo._dump();
  var mids = Object.keys(dumped);
  var noRosterBleed = mids.every(function (id) {
    var m = dumped[id];
    return (
      m.registerInfo &&
      Array.isArray(m.registerInfo.users) &&
      m.registerInfo.users.length === 0
    );
  });
  assert('分站 registerInfo 不被 Series roster 污染', noRosterBleed);
})();

(function testInputNotMutatedByRegister() {
  var store = createMemorySeriesStore();
  var series = makeDraftSeries(store);
  series.lifecycleStatus = 'published';
  series.publishState = 'published';
  series.registrationState = 'open';
  series.registrationRevision = 1;
  store.upsertSeries(series);
  var svc = createService(store);
  var playerObj = player('imm');
  var before = freeze(playerObj);
  svc.registerSelf({
    seriesId: series.seriesId,
    player: playerObj,
    seriesParticipantId: series.participants[0].seriesParticipantId,
    actor: { userId: 'imm' }
  });
  assert('player 输入不被原地修改', JSON.stringify(playerObj) === JSON.stringify(before));
})();

(function testClosedAndLifecycleGates() {
  var store = createMemorySeriesStore();
  var series = makeDraftSeries(store);
  var svc = createService(store);
  var pid = series.participants[0].seriesParticipantId;

  assert(
    'draft → set open 被拒绝',
    svc.setRegistrationState({
      seriesId: series.seriesId,
      state: 'open',
      actor: { userId: 'admin' }
    }).reason === 'series_not_published'
  );

  // draft 即使人为带 open，register/cancel 仍拒绝
  series.registrationState = 'open';
  series.registrationRevision = 0;
  store.upsertSeries(series);
  assert(
    'draft+open → register 仍 series_not_published',
    svc.registerSelf({
      seriesId: series.seriesId,
      player: player('z'),
      seriesParticipantId: pid,
      actor: { userId: 'z' }
    }).reason === 'series_not_published'
  );
  assert(
    'draft+open → cancel 仍 series_not_published',
    svc.cancelSelfRegistration({
      seriesId: series.seriesId,
      playerId: 'z',
      actor: { userId: 'z' }
    }).reason === 'series_not_published'
  );

  series.lifecycleStatus = 'published';
  series.publishState = 'published';
  series.registrationState = 'closed';
  series.registrationRevision = 1;
  store.upsertSeries(series);
  assert(
    'published+closed 禁止报名',
    svc.registerSelf({
      seriesId: series.seriesId,
      player: player('z'),
      seriesParticipantId: pid,
      actor: { userId: 'z' }
    }).reason === 'registration_closed'
  );

  ['cancelled', 'archived'].forEach(function (life) {
    series.lifecycleStatus = life;
    series.registrationState = 'open';
    series.registrationRevision = 1;
    store.upsertSeries(series);
    assert(
      life + ' → register 拒绝',
      svc.registerSelf({
        seriesId: series.seriesId,
        player: player('z'),
        seriesParticipantId: pid,
        actor: { userId: 'z' }
      }).reason === 'lifecycle_readonly'
    );
    assert(
      life + ' → cancel 拒绝',
      svc.cancelSelfRegistration({
        seriesId: series.seriesId,
        playerId: 'z',
        actor: { userId: 'z' }
      }).reason === 'lifecycle_readonly'
    );
    assert(
      life + ' → setState 拒绝',
      svc.setRegistrationState({
        seriesId: series.seriesId,
        state: 'closed',
        actor: { userId: 'admin' }
      }).reason === 'lifecycle_readonly'
    );
  });
})();

(function testSelfIdentity() {
  var store = createMemorySeriesStore();
  var series = makeDraftSeries(store);
  series.lifecycleStatus = 'published';
  series.publishState = 'published';
  series.registrationState = 'open';
  series.registrationRevision = 1;
  store.upsertSeries(series);
  var svc = createService(store);
  var pid = series.participants[0].seriesParticipantId;

  assert(
    'actor 缺失 → self_identity_unresolved',
    svc.registerSelf({
      seriesId: series.seriesId,
      player: player('a1'),
      seriesParticipantId: pid
    }).reason === 'self_identity_unresolved'
  );
  assert(
    'register actor≠player → self_identity_mismatch',
    svc.registerSelf({
      seriesId: series.seriesId,
      player: player('a1'),
      seriesParticipantId: pid,
      actor: { userId: 'other' }
    }).reason === 'self_identity_mismatch'
  );
  assert(
    'cancel actor≠playerId → self_identity_mismatch',
    svc.cancelSelfRegistration({
      seriesId: series.seriesId,
      playerId: 'a1',
      actor: { userId: 'other' }
    }).reason === 'self_identity_mismatch'
  );
  assert(
    'register playerId 与 actor.userId 对齐可通过',
    svc.registerSelf({
      seriesId: series.seriesId,
      player: { userId: 'same', competitionName: '同' },
      seriesParticipantId: pid,
      actor: { userId: 'same' }
    }).ok === true
  );
})();

(function testExpectedRevisionNoSideEffects() {
  var store = createMemorySeriesStore();
  var series = makeDraftSeries(store);
  series.lifecycleStatus = 'published';
  series.publishState = 'published';
  series.registrationState = 'open';
  series.registrationRevision = 3;
  store.upsertSeries(series);
  var resolverCalls = 0;
  var manageCalls = 0;
  var svc = createService(store, {
    resolveEligibleParticipantIds: function (ctx) {
      resolverCalls += 1;
      return ctx.series.participants.map(function (p) {
        return p.seriesParticipantId;
      });
    },
    canManageRegistration: function () {
      manageCalls += 1;
      return true;
    }
  });
  var pid = series.participants[0].seriesParticipantId;
  var before = freeze(store.getSeriesById(series.seriesId));

  var rReg = svc.registerSelf({
    seriesId: series.seriesId,
    player: player('stale'),
    seriesParticipantId: pid,
    actor: { userId: 'stale' },
    expectedRegistrationRevision: 1
  });
  assert(
    'register stale → registration_conflict',
    rReg.ok === false &&
      rReg.reason === 'registration_conflict' &&
      rReg.currentRevision === 3
  );
  assert('register stale 不调 resolver', resolverCalls === 0);
  assert(
    'register stale 无写入',
    JSON.stringify(store.getSeriesById(series.seriesId)) === JSON.stringify(before)
  );

  var rCancel = svc.cancelSelfRegistration({
    seriesId: series.seriesId,
    playerId: 'stale',
    actor: { userId: 'stale' },
    expectedRegistrationRevision: 0
  });
  assert(
    'cancel stale → registration_conflict',
    rCancel.reason === 'registration_conflict' && rCancel.currentRevision === 3
  );
  assert(
    'cancel stale 无写入',
    JSON.stringify(store.getSeriesById(series.seriesId)) === JSON.stringify(before)
  );

  var rSet = svc.setRegistrationState({
    seriesId: series.seriesId,
    state: 'closed',
    actor: { userId: 'admin' },
    expectedRegistrationRevision: 2
  });
  assert(
    'setState stale → registration_conflict',
    rSet.reason === 'registration_conflict' && rSet.currentRevision === 3
  );
  assert('setState stale 不调 permission resolver', manageCalls === 0);
  assert(
    'setState stale 无写入',
    JSON.stringify(store.getSeriesById(series.seriesId)) === JSON.stringify(before)
  );

  // 匹配 expected 后可写
  var okSet = svc.setRegistrationState({
    seriesId: series.seriesId,
    state: 'closed',
    actor: { userId: 'admin' },
    expectedRegistrationRevision: 3
  });
  assert('匹配 expected 可关闭', okSet.ok && okSet.series.registrationRevision === 4);
})();

(function testCheckedStoreRequired() {
  var threw = false;
  try {
    seriesRegistration.createSeriesRegistrationService({
      seriesStore: { getSeriesById: function () { return null; } },
      resolveEligibleParticipantIds: function () { return []; },
      canManageRegistration: function () { return true; }
    });
  } catch (e) {
    threw = e && String(e.message) === 'series_registration_checked_store_required';
  }
  assert('缺少 upsertSeriesChecked 抛错', threw === true);

  var regSrc = fs.readFileSync(path.join(utilsDir, 'seriesRegistration.js'), 'utf8');
  assert(
    '无 upsertSeries 降级路径',
    regSrc.indexOf('store.upsertSeries(') < 0 &&
      regSrc.indexOf('upsertSeriesChecked') >= 0
  );
})();

(function testSourceGuards() {
  var regSrc = fs.readFileSync(path.join(utilsDir, 'seriesRegistration.js'), 'utf8');
  assert(
    'registration 不硬编码 teamDirectory',
    regSrc.indexOf('teamDirectory') < 0
  );
  assert(
    'registration 使用依赖注入',
    regSrc.indexOf('resolveEligibleParticipantIds') >= 0 &&
      regSrc.indexOf('canManageRegistration') >= 0
  );
  assert(
    '换主体不自动覆盖',
    regSrc.indexOf('already_registered_elsewhere') >= 0
  );
  var proxyStart = regSrc.indexOf('function registerForOther');
  var proxyEnd = regSrc.indexOf('function cancelSelfRegistration');
  var proxyBody =
    proxyStart >= 0 && proxyEnd > proxyStart
      ? regSrc.slice(proxyStart, proxyEnd)
      : '';
  var selfStart = regSrc.indexOf('function registerSelf');
  var selfBody =
    selfStart >= 0 && proxyStart > selfStart
      ? regSrc.slice(selfStart, proxyStart)
      : '';
  assert(
    'registerForOther 与 registerSelf 均要求 assertRegistrationOpen',
    proxyBody.indexOf('assertRegistrationOpen') >= 0 &&
      selfBody.indexOf('assertRegistrationOpen') >= 0
  );
  assert(
    '源码无 closed 允许 registerForOther 写入的分支',
    !/registerForOther[\s\S]{0,800}registrationState[\s\S]{0,120}closed[\s\S]{0,200}(open\|\|closed|均可写入)/.test(
      regSrc
    ) &&
      proxyBody.indexOf('均可写入') < 0
  );
})();

(function testRegisterForOther() {
  var store = createMemorySeriesStore();
  var series = makeDraftSeries(store);
  series.lifecycleStatus = 'published';
  series.publishState = 'published';
  series.registrationState = 'open';
  series.registrationRevision = 1;
  assert('proxy fixture upsert', store.upsertSeries(series).ok);
  var pidA = series.participants[0].seriesParticipantId;
  var pidB = series.participants[1].seriesParticipantId;
  var actor = { userId: 'admin', name: '管理员' };
  var target = player('guest-1');
  var matchSnap = {
    matchId: 'm-proxy-1',
    registrationStatus: 'closed',
    registerInfo: { locked: true },
    rounds: [{ roundId: 'r1' }]
  };
  var journalSnap = freeze({ token: 'j1' });
  var indexSnap = freeze({ matchId: 'm-proxy-1', seriesId: series.seriesId });

  // published→draft 被 store 拒绝；用独立未发布 draft fixture 测 lifecycle 门闩
  var draftStore = createMemorySeriesStore();
  var draftSeries = makeDraftSeries(draftStore);
  draftSeries.registrationState = 'open';
  draftSeries.registrationRevision = 1;
  assert('draft open fixture', draftStore.upsertSeries(draftSeries).ok);
  var draftSvc = createService(draftStore);
  assert(
    '代报名 draft → series_not_published',
    draftSvc.registerForOther({
      seriesId: draftSeries.seriesId,
      actor: actor,
      player: target,
      seriesParticipantId: draftSeries.participants[0].seriesParticipantId,
      expectedRegistrationRevision: 1
    }).reason === 'series_not_published'
  );

  ['cancelled', 'archived'].forEach(function (life) {
    var lifeStore = createMemorySeriesStore();
    var lifeSeries = makeDraftSeries(lifeStore);
    // store 只允许 published→cancelled/archived，不可 draft 直达
    lifeSeries.lifecycleStatus = 'published';
    lifeSeries.publishState = 'published';
    lifeSeries.registrationState = 'open';
    lifeSeries.registrationRevision = 1;
    assert('proxy ' + life + ' publish fixture', lifeStore.upsertSeries(lifeSeries).ok);
    lifeSeries = lifeStore.getSeriesById(lifeSeries.seriesId);
    lifeSeries.lifecycleStatus = life;
    assert('proxy ' + life + ' fixture', lifeStore.upsertSeries(lifeSeries).ok);
    var lifeSvc = createService(lifeStore);
    assert(
      '代报名 ' + life + ' → lifecycle_readonly',
      lifeSvc.registerForOther({
        seriesId: lifeSeries.seriesId,
        actor: actor,
        player: target,
        seriesParticipantId: lifeSeries.participants[0].seriesParticipantId,
        expectedRegistrationRevision: 1
      }).reason === 'lifecycle_readonly'
    );
  });

  series.registrationState = 'closed';
  store.upsertSeries(series);
  var closedBefore = freeze(store.getSeriesById(series.seriesId));
  var closedSvc = createService(store, {
    canManageRegistration: function () {
      return false;
    },
    canRegisterForOther: function () {
      return true;
    }
  });
  var closedDenied = closedSvc.registerForOther({
    seriesId: series.seriesId,
    actor: actor,
    player: target,
    seriesParticipantId: pidA,
    expectedRegistrationRevision: 1
  });
  assert(
    '代报名 closed → registration_closed',
    closedDenied.ok === false && closedDenied.reason === 'registration_closed'
  );
  var closedAfter = store.getSeriesById(series.seriesId);
  assert(
    'closed 不写 roster 且 revision 不变',
    closedAfter.registrationRevision === closedBefore.registrationRevision &&
      JSON.stringify(closedAfter.roster || []) ===
        JSON.stringify(closedBefore.roster || []) &&
      closedAfter.registrationState === 'closed'
  );
  assert(
    'closed 时本人报名仍 registration_closed',
    closedSvc.registerSelf({
      seriesId: series.seriesId,
      player: player('self-closed'),
      seriesParticipantId: pidA,
      actor: { userId: 'self-closed' }
    }).reason === 'registration_closed'
  );
  var listAdapter = require(path.join(utilsDir, 'seriesListCardAdapter.js'));
  var homeCards = listAdapter.buildRegistrationAllCards({
    listSeries: function () {
      return [closedAfter];
    },
    listMatches: function () {
      return [];
    },
    getMatchById: function () {
      return null;
    }
  });
  assert(
    '首页 closed Series 卡仍显示「报名已关闭」',
    homeCards.length === 1 &&
      homeCards[0].statusLabel === '报名已关闭' &&
      homeCards[0]._cardKind === 'series'
  );

  series.registrationState = 'open';
  store.upsertSeries(series);
  var denied = createService(store, {
    canManageRegistration: function () {
      return true;
    },
    canRegisterForOther: function () {
      return false;
    }
  });
  assert(
    '代报名 canRegisterForOther=false → permission_denied',
    denied.registerForOther({
      seriesId: series.seriesId,
      actor: actor,
      player: target,
      seriesParticipantId: pidA,
      expectedRegistrationRevision: 1
    }).reason === 'permission_denied'
  );

  var svc = createService(store, {
    canManageRegistration: function () {
      return false;
    },
    canRegisterForOther: function () {
      return true;
    }
  });
  var selfAsTarget = svc.registerForOther({
    seriesId: series.seriesId,
    actor: { userId: 'guest-1', name: '本人' },
    player: target,
    seriesParticipantId: pidA,
    expectedRegistrationRevision: 1
  });
  assert(
    '代报名目标不能等于 actor',
    selfAsTarget.ok === false && selfAsTarget.reason === 'proxy_target_is_self'
  );

  var missPid = svc.registerForOther({
    seriesId: series.seriesId,
    actor: actor,
    player: target,
    expectedRegistrationRevision: 1
  });
  assert(
    '代报名不默认参赛主体',
    missPid.ok === false && missPid.reason === 'participant_id_required'
  );

  var badPid = svc.registerForOther({
    seriesId: series.seriesId,
    actor: actor,
    player: target,
    seriesParticipantId: 'no-such-participant',
    expectedRegistrationRevision: 1
  });
  assert(
    '代报名 participant 必须存在',
    badPid.ok === false && badPid.reason === 'participant_not_found'
  );

  var inputObj = {
    seriesId: series.seriesId,
    actor: actor,
    player: Object.assign({}, target, { phone: '13800138000' }),
    seriesParticipantId: pidA,
    expectedRegistrationRevision: 1
  };
  var inputBefore = freeze(inputObj);
  var ok1 = svc.registerForOther(inputObj);
  assert(
    '代报名成功且 source=proxy',
    ok1.ok &&
      !ok1.idempotent &&
      ok1.reason === 'registered_proxy' &&
      ok1.series.registrationRevision === 2 &&
      ok1.series.roster.length === 1 &&
      ok1.series.roster[0].registrationSource === 'proxy' &&
      ok1.series.roster[0].playerId === 'guest-1' &&
      ok1.series.roster[0].registeredByUserId === 'admin' &&
      ok1.series.roster[0].phoneSnapshot === '13800138000'
  );
  assert(
    'phoneSnapshot normalize 保留',
    seriesModel.normalizeRosterEntry(
      { playerId: 'p', phoneSnapshot: '13900001111' },
      's'
    ).phoneSnapshot === '13900001111'
  );
  assert(
    '代报名输入对象不被原地修改',
    JSON.stringify(inputObj) === JSON.stringify(inputBefore)
  );
  assert(
    '代报名不碰 match/round/journal/index',
    matchSnap.registrationStatus === 'closed' &&
      matchSnap.registerInfo.locked === true &&
      JSON.stringify(journalSnap) === JSON.stringify({ token: 'j1' }) &&
      JSON.stringify(indexSnap) ===
        JSON.stringify({ matchId: 'm-proxy-1', seriesId: series.seriesId })
  );

  var okIdem = svc.registerForOther({
    seriesId: series.seriesId,
    actor: actor,
    player: target,
    seriesParticipantId: pidA,
    expectedRegistrationRevision: 2
  });
  assert(
    '同主体重复代报名幂等且不 bump revision',
    okIdem.ok &&
      okIdem.idempotent === true &&
      okIdem.series.registrationRevision === 2
  );

  var elsewhere = svc.registerForOther({
    seriesId: series.seriesId,
    actor: actor,
    player: target,
    seriesParticipantId: pidB,
    expectedRegistrationRevision: 2
  });
  assert(
    '已在其他主体 active → already_registered_elsewhere',
    elsewhere.ok === false && elsewhere.reason === 'already_registered_elsewhere'
  );

  // 取消后同主体恢复
  var roster = ok1.series.roster.slice();
  roster[0] = Object.assign({}, roster[0], {
    registrationStatus: 'cancelled',
    cancelledAt: '2099-01-02T00:00:00.000Z'
  });
  var cancelledSeries = Object.assign({}, ok1.series, {
    roster: roster,
    registrationRevision: 3
  });
  assert('fixture cancel roster', store.upsertSeries(cancelledSeries).ok);
  var restored = svc.registerForOther({
    seriesId: series.seriesId,
    actor: actor,
    player: target,
    seriesParticipantId: pidA,
    expectedRegistrationRevision: 3
  });
  assert(
    '已取消同主体可恢复且 revision+1',
    restored.ok &&
      restored.reason === 'restored' &&
      restored.series.registrationRevision === 4 &&
      restored.series.roster[0].registrationStatus === 'registered' &&
      restored.series.roster[0].registrationSource === 'proxy'
  );

  var stale = svc.registerForOther({
    seriesId: series.seriesId,
    actor: actor,
    player: player('guest-2'),
    seriesParticipantId: pidB,
    expectedRegistrationRevision: 1
  });
  assert(
    '代报名 checked revision 冲突',
    stale.ok === false && stale.reason === 'registration_conflict'
  );

  var live = store.getSeriesById(series.seriesId);
  var failSvc = seriesRegistration.createSeriesRegistrationService({
    seriesStore: {
      getSeriesById: function () {
        return freeze(live);
      },
      upsertSeriesChecked: function () {
        return { ok: false, reason: 'storage_write_failed' };
      }
    },
    resolveEligibleParticipantIds: function () {
      return [];
    },
    canManageRegistration: function () {
      return true;
    },
    canRegisterForOther: function () {
      return true;
    },
    now: function () {
      return '2099-01-01T00:00:00.000Z';
    }
  });
  var writeFail = failSvc.registerForOther({
    seriesId: series.seriesId,
    actor: actor,
    player: player('guest-3'),
    seriesParticipantId: pidB,
    expectedRegistrationRevision: live.registrationRevision
  });
  assert(
    '代报名写失败不伪造成功',
    writeFail.ok === false && writeFail.reason === 'storage_write_failed'
  );

  // 不得放宽 registerSelf 本人身份
  var selfMismatch = svc.registerSelf({
    seriesId: series.seriesId,
    actor: { userId: 'admin' },
    player: player('guest-9'),
    seriesParticipantId: pidB,
    expectedRegistrationRevision: live.registrationRevision
  });
  assert(
    'registerSelf 仍校验本人身份 mismatch',
    selfMismatch.ok === false && selfMismatch.reason === 'self_identity_mismatch'
  );

  // 独立 fixture：代报名权限与报名开关管理权限必须分离
  var sepStore = createMemorySeriesStore();
  var sepSeries = makeDraftSeries(sepStore);
  sepSeries.lifecycleStatus = 'published';
  sepSeries.publishState = 'published';
  sepSeries.registrationState = 'open';
  sepSeries.registrationRevision = 1;
  assert('sep fixture', sepStore.upsertSeries(sepSeries).ok);
  var sepPid = sepSeries.participants[0].seriesParticipantId;
  var proxyOkManageNo = createService(sepStore, {
    canManageRegistration: function () {
      return false;
    },
    canRegisterForOther: function () {
      return true;
    }
  });
  var sepProxy = proxyOkManageNo.registerForOther({
    seriesId: sepSeries.seriesId,
    actor: { userId: 'normal-1', name: '普通用户' },
    player: player('guest-normal'),
    seriesParticipantId: sepPid,
    expectedRegistrationRevision: 1
  });
  assert(
    '代报名与管理权限分离：无管理权仍可代报名',
    sepProxy.ok === true && sepProxy.series.roster[0].registrationSource === 'proxy'
  );
  var toggleDenied = proxyOkManageNo.setRegistrationState({
    seriesId: sepSeries.seriesId,
    state: 'closed',
    actor: { userId: 'normal-1' },
    expectedRegistrationRevision: sepProxy.series.registrationRevision
  });
  assert(
    '普通用户直接开关报名被拒绝',
    toggleDenied.ok === false && toggleDenied.reason === 'permission_denied'
  );
  var missingProxyResolver = seriesRegistration.createSeriesRegistrationService({
    seriesStore: sepStore,
    resolveEligibleParticipantIds: function () {
      return [];
    },
    canManageRegistration: function () {
      return true;
    }
    // 故意不注入 canRegisterForOther
  });
  assert(
    '缺少 canRegisterForOther resolver → permission_unresolved',
    missingProxyResolver.registerForOther({
      seriesId: sepSeries.seriesId,
      actor: { userId: 'admin' },
      player: player('guest-x'),
      seriesParticipantId: sepSeries.participants[1].seriesParticipantId,
      expectedRegistrationRevision: sepProxy.series.registrationRevision
    }).reason === 'permission_unresolved'
  );
})();

(function testSetRegistrationStateBoundaries() {
  var store = createMemorySeriesStore();
  var series = makeDraftSeries(store);
  series.lifecycleStatus = 'published';
  series.publishState = 'published';
  series.registrationState = 'open';
  series.registrationRevision = 5;
  store.upsertSeries(series);
  var svc = createService(store, {
    canManageRegistration: function () {
      return true;
    }
  });
  var closed = svc.setRegistrationState({
    seriesId: series.seriesId,
    state: 'closed',
    actor: { userId: 'admin' },
    expectedRegistrationRevision: 5
  });
  assert(
    '开关 open→closed 只写 registrationState',
    closed.ok &&
      closed.series.registrationState === 'closed' &&
      closed.series.registrationRevision === 6
  );
  var closedIdem = svc.setRegistrationState({
    seriesId: series.seriesId,
    state: 'closed',
    actor: { userId: 'admin' },
    expectedRegistrationRevision: 6
  });
  assert(
    '开关幂等不 bump revision',
    closedIdem.ok &&
      closedIdem.idempotent &&
      closedIdem.series.registrationRevision === 6
  );
  var opened = svc.setRegistrationState({
    seriesId: series.seriesId,
    state: 'open',
    actor: { userId: 'admin' },
    expectedRegistrationRevision: 6
  });
  assert(
    '开关 closed→open',
    opened.ok &&
      opened.series.registrationState === 'open' &&
      opened.series.registrationRevision === 7
  );
  var conflict = svc.setRegistrationState({
    seriesId: series.seriesId,
    state: 'closed',
    actor: { userId: 'admin' },
    expectedRegistrationRevision: 1
  });
  assert(
    '开关 checked revision 冲突',
    conflict.ok === false && conflict.reason === 'registration_conflict'
  );
})();

console.log('');
console.log('---- seriesRegistration.selftest (报名 B1) ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
