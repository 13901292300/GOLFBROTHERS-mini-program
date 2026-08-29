/**
 * 首次发布报名默认落盘回归（无批量扫描入口）
 *
 * 运行（需批准时）：node scripts/seriesPublishRegistrationFix.selftest.js
 */

var path = require('path');
var fs = require('fs');
var seriesTestPaths = require('./lib/seriesTestPaths.js');

var utilsDir = path.join(__dirname, '..', 'miniprogram', 'utils');
var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));
var seriesStoreMod = require(path.join(utilsDir, 'seriesStore.js'));
var seriesPublish = require(seriesTestPaths.util('seriesPublish.js'));
var seriesPublishJournal = require(seriesTestPaths.util('seriesPublishJournal.js'));
var seriesStationIndex = require(path.join(utilsDir, 'seriesStationIndex.js'));
var seriesListCardAdapter = require(path.join(utilsDir, 'seriesListCardAdapter.js'));

var adapterPath = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'create',
  'pages',
  'series',
  'seriesPublishAdapter.js'
);
var seriesPublishAdapter = require(adapterPath);

var publishSrc = fs.readFileSync(seriesTestPaths.util('seriesPublish.js'), 'utf8');
var homeSrc = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'pages', 'home', 'index.js'),
  'utf8'
);
var adapterSrc = fs.readFileSync(adapterPath, 'utf8');
var createIndexSrc = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'miniprogram',
    'subpackages',
    'create',
    'pages',
    'series',
    'index.js'
  ),
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

function freeze(o) {
  return JSON.parse(JSON.stringify(o));
}

function memAdapter() {
  var bag = Object.create(null);
  return {
    getItem: function (key) {
      return { ok: true, value: bag[key] != null ? freeze(bag[key]) : null };
    },
    setItem: function (key, value) {
      bag[key] = freeze(value);
      return { ok: true };
    }
  };
}

function makePublisher() {
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
      return Date.parse('2099-06-01T00:00:00.000Z');
    }
  });
  return {
    store: store,
    journal: journal,
    stationIndex: stationIndex,
    matchRepo: matchRepo,
    publisher: publisher
  };
}

function makeDraft(store, roundCount) {
  var n = roundCount || 2;
  var rounds = [];
  for (var i = 1; i <= n; i++) {
    var day = i < 10 ? '0' + i : String(i);
    rounds.push(
      seriesModel.createBlankRound(i, {
        name: 'R' + i,
        dateTime: '2099-07-' + day + ' 08:00',
        dateTimeUserEdited: true,
        fee: '100',
        gameMode: '个人比杆赛',
        courseId: 'c' + i,
        courseName: '球场' + i
      })
    );
  }
  var draft = seriesModel.createEmptySeriesDraft({
    hostMode: 'organization',
    templateId: 'inter_team_series',
    seriesName: '报名落盘测试',
    createdBy: 'publisher-user-1',
    organization: {
      organizationId: 'org-1',
      organizationName: '测试机构',
      organizationLogo: ''
    },
    scoringRule: { mode: 'global_m', topM: 2, scoreBasis: 'gross', allowRepeat: false },
    participants: [
      seriesModel.createParticipant({
        kind: 'team',
        sourceTeamId: 't-a',
        nameSnapshot: 'A',
        shortNameSnapshot: 'A'
      }),
      seriesModel.createParticipant({
        kind: 'team',
        sourceTeamId: 't-b',
        nameSnapshot: 'B',
        shortNameSnapshot: 'B'
      })
    ],
    rounds: rounds,
    registrationState: 'closed',
    registrationRevision: 0
  });
  var saved = store.saveDraft(draft);
  assert('save draft', saved.ok === true, saved.reason);
  return store.getSeriesById(draft.seriesId);
}

// ----- 已移除批量入口 -----
assert(
  '无 repairStale / repairAllLegacy 公开 API',
  publishSrc.indexOf('repairStaleFirstPublishRegistrationDefaults') < 0 &&
    adapterSrc.indexOf('repairAllLegacyFirstPublishRegistration') < 0 &&
    createIndexSrc.indexOf('repairAllLegacyFirstPublishRegistration') < 0
);

assert(
  '创建 onShow 无批量修复',
  !/onShow\s*\(\)\s*\{[\s\S]*?repairAllLegacy|onShow\s*\(\)\s*\{[\s\S]*?repairStale/.test(
    createIndexSrc
  )
);

// ----- 首页只读 -----
assert(
  'home 无 seriesPublish / repair / upsertSeries',
  homeSrc.indexOf('seriesPublish') < 0 &&
    homeSrc.indexOf('repairStale') < 0 &&
    homeSrc.indexOf('upsertSeries') < 0 &&
    homeSrc.indexOf('repairFirstPublish') < 0
);

assert(
  'home 三 builder 只走 adapter',
  homeSrc.indexOf('buildRegistrationAllCards') >= 0 &&
    homeSrc.indexOf('buildRegistrationMineCards') >= 0 &&
    homeSrc.indexOf('buildPlazaTournamentCards') >= 0
);

// ----- 永久路径：按 ID + 正式发布加固 -----
assert(
  '保留 byId repair 与 ensureLegacy',
  publishSrc.indexOf('repairFirstPublishRegistrationDefaultsById') >= 0 &&
    adapterSrc.indexOf('ensureLegacyFirstPublishRegistration') >= 0 &&
    /action === 'navigate'[\s\S]*?ensureLegacyFirstPublishRegistration/.test(adapterSrc)
);

assert(
  '正式路径保留 persistFirstPublish',
  publishSrc.indexOf('persistFirstPublishRegistrationDefaults') >= 0 &&
    publishSrc.indexOf('already_published') >= 0 &&
    publishSrc.indexOf('repair_registration_defaults') >= 0
);

// ----- 首次发布 open/rev1 -----
(function () {
  var ctx = makePublisher();
  var draft = makeDraft(ctx.store, 2);
  assert('发布前 closed/0', draft.registrationState === 'closed' && draft.registrationRevision === 0);
  var pub = ctx.publisher.publishSeries(draft.seriesId, {});
  assert('首次发布 ok', pub.ok === true, pub.reason);
  var after = ctx.store.getSeriesById(draft.seriesId);
  assert(
    '首次发布 → published+open+rev1',
    after &&
      after.lifecycleStatus === 'published' &&
      after.registrationState === 'open' &&
      after.registrationRevision === 1,
    after
      ? after.lifecycleStatus + '/' + after.registrationState + '/' + after.registrationRevision
      : 'missing'
  );
})();

// ----- byId：closed/rev0 → open/rev1；重复不增 rev -----
(function () {
  var ctx = makePublisher();
  var draft = makeDraft(ctx.store, 2);
  assert('prep publish', ctx.publisher.publishSeries(draft.seriesId, {}).ok);
  var broken = freeze(ctx.store.getSeriesById(draft.seriesId));
  broken.registrationState = 'closed';
  broken.registrationRevision = 0;
  assert('写入 closed/rev0', ctx.store.upsertSeries(broken).ok);

  var repaired = ctx.publisher.repairFirstPublishRegistrationDefaultsById(draft.seriesId);
  assert('byId repair changed', repaired.ok && repaired.changed === true, repaired.reason);
  var after = ctx.store.getSeriesById(draft.seriesId);
  assert(
    'closed/rev0 → open/rev1',
    after.registrationState === 'open' && after.registrationRevision === 1
  );

  var cards = seriesListCardAdapter.buildRegistrationAllCards({
    listMatches: function () {
      return [];
    },
    listSeries: function () {
      return [ctx.store.getSeriesById(draft.seriesId)];
    },
    getMatchById: function () {
      return null;
    },
    toOrdinaryCard: function () {
      return null;
    },
    decorateOrdinaryCard: function (_m, c) {
      return c;
    }
  });
  assert(
    'byId repair 后报名列表有 Series 卡',
    cards.some(function (c) {
      return c && c.seriesId === draft.seriesId;
    })
  );

  var again = ctx.publisher.repairFirstPublishRegistrationDefaultsById(draft.seriesId);
  assert(
    '重复 repair 不增加 revision',
    again.ok && again.changed === false && after.registrationRevision === 1
  );
})();

// ----- closed/rev>0 不重开 -----
(function () {
  var ctx = makePublisher();
  var draft = makeDraft(ctx.store, 2);
  assert('prep', ctx.publisher.publishSeries(draft.seriesId, {}).ok);
  var admin = freeze(ctx.store.getSeriesById(draft.seriesId));
  admin.registrationState = 'closed';
  admin.registrationRevision = 3;
  assert('管理员关闭', ctx.store.upsertSeries(admin).ok);
  var res = ctx.publisher.repairFirstPublishRegistrationDefaultsById(draft.seriesId);
  assert('rev>0 不重开', res.ok && res.changed === false);
  var after = ctx.store.getSeriesById(draft.seriesId);
  assert(
    '保持 closed/rev3',
    after.registrationState === 'closed' && after.registrationRevision === 3
  );
})();

// ----- adapter ensureLegacy byId -----
(function () {
  var ctx = makePublisher();
  var draft = makeDraft(ctx.store, 2);
  assert('prep', ctx.publisher.publishSeries(draft.seriesId, {}).ok);
  var broken = freeze(ctx.store.getSeriesById(draft.seriesId));
  broken.registrationState = 'closed';
  broken.registrationRevision = 0;
  ctx.store.upsertSeries(broken);
  var ensured = seriesPublishAdapter.ensureLegacyFirstPublishRegistration(
    draft.seriesId,
    function (id) {
      return ctx.publisher.repairFirstPublishRegistrationDefaultsById(id);
    }
  );
  assert('ensureLegacy byId changed', ensured.ok && ensured.changed === true);
  var after = ctx.store.getSeriesById(draft.seriesId);
  assert('ensureLegacy → open/rev1', after.registrationState === 'open' && after.registrationRevision === 1);
})();

// ----- Series 读失败不影响普通列表 -----
(function () {
  var ordinary = {
    matchId: 'ord-1',
    status: 'registering',
    createdAt: 1,
    roundName: '普通赛',
    registerInfo: { users: [] }
  };
  var cards = seriesListCardAdapter.buildRegistrationAllCards({
    listMatches: function () {
      return [ordinary];
    },
    listSeries: function () {
      throw new Error('series boom');
    },
    getMatchById: function () {
      return null;
    },
    toOrdinaryCard: function (m) {
      return { id: m.matchId, title: m.roundName, _cardKind: 'match' };
    },
    decorateOrdinaryCard: function (_m, c) {
      return c;
    }
  });
  assert(
    'Series 读失败时普通卡仍在',
    cards.some(function (c) {
      return c && c.id === 'ord-1';
    }) &&
      !cards.some(function (c) {
        return c && c._cardKind === 'series';
      })
  );
})();

// ----- 8 轮：1 Series / 0 分站 -----
(function () {
  var ctx = makePublisher();
  var draft = makeDraft(ctx.store, 8);
  assert('8 轮发布', ctx.publisher.publishSeries(draft.seriesId, {}).ok);
  var series = ctx.store.getSeriesById(draft.seriesId);
  assert(
    '新发布直接 open/rev1',
    series.registrationState === 'open' && series.registrationRevision === 1
  );
  var matches = [];
  (series.rounds || []).forEach(function (r) {
    if (r && r.matchId) {
      var m = ctx.matchRepo.getMatchById(r.matchId);
      if (m) matches.push(m);
    }
  });
  assert('8 托管分站仍在 storage', matches.length === 8);
  var cards = seriesListCardAdapter.buildRegistrationAllCards({
    listMatches: function () {
      return matches;
    },
    listSeries: function () {
      return [ctx.store.getSeriesById(draft.seriesId)];
    },
    getMatchById: function (id) {
      return ctx.matchRepo.getMatchById(id);
    },
    toOrdinaryCard: function (m) {
      return { id: m.matchId, title: 'station' };
    },
    decorateOrdinaryCard: function (_m, c) {
      return c;
    }
  });
  assert(
    '8 轮报名 1 Series / 0 分站',
    cards.filter(function (c) {
      return c && c._cardKind === 'series';
    }).length === 1 &&
      cards.filter(function (c) {
        return c && c._cardKind === 'match';
      }).length === 0
  );
})();

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('FAILURES:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
