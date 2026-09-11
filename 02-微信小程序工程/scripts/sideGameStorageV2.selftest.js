/**
 * Storage V2 Phase 2：canonical 读写 + staging/journal。
 * 运行：node scripts/sideGameStorageV2.selftest.js
 */
if (typeof global.wx !== 'object') global.wx = {};
global.wx.getStorageSync = global.wx.getStorageSync || function () {
  return null;
};
global.wx.setStorageSync = global.wx.setStorageSync || function () {};
global.wx.removeStorageSync = global.wx.removeStorageSync || function () {};
global.wx.getStorageInfoSync = global.wx.getStorageInfoSync || function () {
  return { keys: [] };
};

var rec = require('../miniprogram/subpackages/game/utils/sideGameRecord.js');
var identity = require('../miniprogram/subpackages/game/utils/sideGameIdentityProvider.js');
var localMod = require('../miniprogram/subpackages/game/utils/localSideGameRepository.js');
var v2mig = require('../miniprogram/subpackages/game/utils/sideGameStorageV2Migration.js');
var v2store = require('../miniprogram/subpackages/game/utils/sideGameStorageV2Store.js');
var hostMod = require('../miniprogram/subpackages/game/utils/gameHostContext.js');

var passed = 0;
var failed = 0;

function assert(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    console.log('FAIL  ' + name + (detail ? ' :: ' + detail : ''));
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeRecord(id, patch) {
  var row = {
    sideGameId: id,
    matchId: 'm1',
    groupId: 'g1',
    scope: 'group',
    status: 'active',
    visibility: 'group',
    ruleId: 'stroke-2',
    title: 't-' + id,
    revision: 1,
    updatedAt: 1000,
    createdBy: 'tester',
    ruleSnapshot: rec.buildRuleSnapshot('stroke-2'),
    participantParties: [{ partyId: 'A', partyType: 'player', displayName: 'A', memberPlayerIds: ['A'] }],
    config: rec.emptyConfig()
  };
  if (patch && typeof patch === 'object') {
    Object.keys(patch).forEach(function (k) {
      row[k] = patch[k];
    });
  }
  return rec.normalizeRecord(row);
}

function nRecords(n) {
  var out = [];
  var i;
  for (i = 1; i <= n; i++) {
    out.push(makeRecord('sg_' + i, { revision: 1, status: i % 7 === 0 ? 'deleted' : 'active' }));
  }
  return out;
}

function makeStorage(opts) {
  var o = opts || {};
  var bag = o.bag || {};
  var counts = { staging: 0, instance: 0 };
  return {
    getItem: function (key) {
      if (o.failRead) return { __fail: true };
      if (typeof o.failReadKey === 'function' && o.failReadKey(key)) return { __fail: true };
      return bag[key];
    },
    setItem: function (key, value) {
      if (typeof o.failWriteKey === 'function' && o.failWriteKey(key, value, counts)) return false;
      bag[key] = clone(value);
      return true;
    },
    removeItem: function (key) {
      delete bag[key];
      return true;
    },
    listKeys: function () {
      return Object.keys(bag);
    },
    _bag: bag
  };
}

function holesFor(partyIds, holeOrder, score) {
  var out = {};
  (partyIds || []).forEach(function (id) {
    var holes = {};
    (holeOrder || []).forEach(function (h) {
      holes[h] = { score: score };
    });
    out[id] = { holes: holes };
  });
  return out;
}

function makeHost() {
  var holeOrder = ['A1', 'A2'];
  var parties = [
    { partyId: 'A', partyType: 'player', displayName: '甲', memberPlayerIds: ['A'], groupId: 'g1' },
    { partyId: 'B', partyType: 'player', displayName: '乙', memberPlayerIds: ['B'], groupId: 'g1' }
  ];
  return hostMod.emptyContext({
    matchId: 'm1',
    groupId: 'g1',
    scope: 'group',
    revision: 'r1',
    holeContextReady: true,
    holeOrder: holeOrder,
    pars: { A1: 4, A2: 4 },
    allowBigPot: true,
    players: [
      { playerId: 'A', groupId: 'g1' },
      { playerId: 'B', groupId: 'g1' }
    ],
    scoreParties: parties,
    officialScoresByPartyId: holesFor(['A', 'B'], holeOrder, 4)
  });
}

function partiesOf() {
  var ids = [].slice.call(arguments);
  return ids.map(function (id) {
    return { partyId: id, partyType: 'player', displayName: id, memberPlayerIds: [id] };
  });
}

function createInput(patch) {
  var host = makeHost();
  var base = {
    matchId: 'm1',
    groupId: 'g1',
    scope: 'group',
    ruleId: 'stroke-2',
    ruleSnapshot: rec.buildRuleSnapshot('stroke-2'),
    title: '比杆',
    participantParties: partiesOf('A', 'B'),
    config: rec.emptyConfig(),
    visibility: 'group',
    hostContext: host,
    idempotencyKey: 'k_' + Math.random().toString(36).slice(2, 8)
  };
  patch = patch || {};
  Object.keys(patch).forEach(function (k) {
    base[k] = patch[k];
  });
  return base;
}

function v1Snapshot(bag) {
  return JSON.stringify(bag.gb_side_games_v1);
}

function instanceKeys(bag) {
  return Object.keys(bag).filter(function (k) {
    return k.indexOf(v2mig.INSTANCE_PREFIX) === 0;
  });
}

function initRepo(storage, idGen) {
  var n = 0;
  return localMod.createLocalSideGameRepository({
    storage: storage,
    idGen: idGen || function () {
      n += 1;
      return 'sg_new_' + n;
    },
    clock: function () {
      return 5000;
    }
  });
}

var savedIdentity = identity.getImplementation();
identity.setImplementation({
  implementation: 'test',
  getCurrentUserId: function () {
    return 'tester';
  }
});

try {
  // 1–2 list/get V2
  (function () {
    var st = makeStorage({ bag: { gb_side_games_v1: [makeRecord('sg_a')] } });
    var repo = initRepo(st);
    var listed = repo.listVisible({ matchId: 'm1', groupId: 'g1', viewerUserId: 'tester', hostContext: makeHost() });
    assert('1 listVisible V2', listed.ok && listed.data.items.length === 1 && listed.data.items[0].sideGameId === 'sg_a');
    var got = repo.getById('sg_a');
    assert('2 getById V2', got.ok && got.data.sideGameId === 'sg_a' && got.revision === 1);
  })();

  // 3 create 不写 v1
  (function () {
    var st = makeStorage({ bag: { gb_side_games_v1: [] } });
    var repo = initRepo(st);
    var before = v1Snapshot(st._bag);
    var created = repo.create(createInput({ idempotencyKey: 'c1', title: '新' }));
    assert('3 create ok', created.ok && created.data.sideGameId);
    assert('3 create 不写 v1', v1Snapshot(st._bag) === before);
    assert('3 instance exists', !!st._bag[v2mig.instanceKey(created.data.sideGameId)]);
  })();

  // 4 update 不写其它 instance
  (function () {
    var st = makeStorage({
      bag: { gb_side_games_v1: [makeRecord('sg_u1'), makeRecord('sg_u2', { title: 'keep' })] }
    });
    var repo = initRepo(st);
    var otherBefore = JSON.stringify(st._bag[v2mig.instanceKey('sg_u2')]);
    var upd = repo.update('sg_u1', 1, { title: 'changed' });
    assert('4 update ok', upd.ok && upd.data.title === 'changed');
    assert('4 other instance untouched', JSON.stringify(st._bag[v2mig.instanceKey('sg_u2')]) === otherBefore);
    assert('4 v1 frozen', Array.isArray(st._bag.gb_side_games_v1) && st._bag.gb_side_games_v1[0].title !== 'changed');
  })();

  // 5 remove 软删
  (function () {
    var st = makeStorage({ bag: { gb_side_games_v1: [makeRecord('sg_rm')] } });
    var repo = initRepo(st);
    var rm = repo.remove('sg_rm', 1);
    assert('5 remove ok', rm.ok);
    var inst = st._bag[v2mig.instanceKey('sg_rm')];
    assert('5 instance deleted status', inst && inst.status === 'deleted');
    assert('5 getById hidden', !repo.getById('sg_rm').ok);
  })();

  // 6 refreshResult 只写单 instance
  (function () {
    var st = makeStorage({
      bag: { gb_side_games_v1: [makeRecord('sg_rf1'), makeRecord('sg_rf2')] }
    });
    var repo = initRepo(st);
    var otherBefore = JSON.stringify(st._bag[v2mig.instanceKey('sg_rf2')]);
    var out = repo.refreshResult('sg_rf1', makeHost());
    assert('6 refresh ok or context', !!(out && (out.ok || out.reason)));
    assert('6 other instance untouched', JSON.stringify(st._bag[v2mig.instanceKey('sg_rf2')]) === otherBefore);
  })();

  // 7 commitSetupDraft mixed ops
  (function () {
    var st = makeStorage({
      bag: { gb_side_games_v1: [makeRecord('sg_c1', { title: 'old' }), makeRecord('sg_c2')] }
    });
    var n = 0;
    var repo = initRepo(st, function () {
      n += 1;
      return 'sg_nc_' + n;
    });
    var v1Before = v1Snapshot(st._bag);
    var out = repo.commitSetupDraft({
      matchId: 'm1',
      hostContext: makeHost(),
      creates: [
        createInput({ idempotencyKey: 'n1', title: 'c-a' }),
        createInput({ idempotencyKey: 'n2', title: 'c-b' })
      ],
      updates: [{ sideGameId: 'sg_c1', revision: 1, patch: { title: 'upd' } }],
      removes: [{ sideGameId: 'sg_c2', revision: 1 }]
    });
    assert('7 commit ok', out.ok, out.reason);
    assert('7 v1 unchanged', v1Snapshot(st._bag) === v1Before);
    assert('7 update applied', st._bag[v2mig.instanceKey('sg_c1')].title === 'upd');
    assert('7 remove soft', st._bag[v2mig.instanceKey('sg_c2')].status === 'deleted');
    assert('7 two creates', instanceKeys(st._bag).length >= 4);
  })();

  // 8 staging 第2条失败 → 正式未动
  (function () {
    var st = makeStorage({
      bag: { gb_side_games_v1: [] },
      failWriteKey: function (key, value, counts) {
        if (String(key).indexOf(v2store.STAGING_PREFIX) === 0) {
          counts.staging += 1;
          if (counts.staging >= 2) return true;
        }
        return false;
      }
    });
    var repo = initRepo(st);
    var out = repo.commitSetupDraft({
      matchId: 'm1',
      hostContext: makeHost(),
      creates: [
        createInput({ idempotencyKey: 's1', title: 'a' }),
        createInput({ idempotencyKey: 's2', title: 'b' })
      ]
    });
    assert('8 commit fail', !out.ok && out.reason === 'storage_write_failed');
    assert('8 no canonical instance', instanceKeys(st._bag).length === 0);
    assert('8 no journal', st._bag[v2store.JOURNAL_KEY] == null);
  })();

  // 9 journal pending 后第2个 instance 写失败
  (function () {
    var st = makeStorage({
      bag: { gb_side_games_v1: [] },
      failWriteKey: function (key, value, counts) {
        if (String(key).indexOf(v2mig.INSTANCE_PREFIX) === 0) {
          counts.instance += 1;
          if (counts.instance >= 2) return true;
        }
        return false;
      }
    });
    var repo = initRepo(st);
    var out = repo.commitSetupDraft({
      matchId: 'm1',
      hostContext: makeHost(),
      creates: [
        createInput({ idempotencyKey: 'p1', title: 'a' }),
        createInput({ idempotencyKey: 'p2', title: 'b' })
      ]
    });
    assert('9 commit fail pending', !out.ok);
    var j = st._bag[v2store.JOURNAL_KEY];
    assert('9 journal pending', !!(j && j.status === 'pending'));
    assert('9 one instance written', instanceKeys(st._bag).length === 1);
    global.__pendingBag = st._bag;
  })();

  // 10 重启 recover roll-forward
  (function () {
    var bag = global.__pendingBag;
    if (!bag) {
      assert('10 skip no pending', false);
      return;
    }
    var st = makeStorage({ bag: bag });
    var repo = initRepo(st);
    var listed = repo.listVisible({ matchId: 'm1', groupId: 'g1', viewerUserId: 'tester', hostContext: makeHost() });
    assert('10 recovered list 2', listed.ok && listed.data.items.length === 2);
    assert('10 journal cleared', st._bag[v2store.JOURNAL_KEY] == null);
    delete global.__pendingBag;
  })();

  // 11 instances_written → 补 index
  (function () {
    var st = makeStorage({ bag: { gb_side_games_v1: [makeRecord('sg_ix')] } });
    initRepo(st);
    var recRow = st._bag[v2mig.instanceKey('sg_ix')];
    var txId = 'tx_fix';
    var sk = v2store.stagingKey(txId, 'sg_ix');
    st._bag[sk] = recRow;
    st._bag[v2store.JOURNAL_KEY] = {
      txId: txId,
      matchId: 'm1',
      createdAt: 1,
      status: 'instances_written',
      ops: [{ type: 'update', sideGameId: 'sg_ix', beforeRevision: 1, afterRevision: 1, stagingKey: sk }]
    };
    delete st._bag[v2mig.INDEX_KEY];
    var repo = initRepo(st);
    var idx = st._bag[v2mig.INDEX_KEY];
    assert('11 index rebuilt', !!(idx && idx.items && idx.items.some(function (it) { return it.sideGameId === 'sg_ix'; })));
    repo.listVisible({ matchId: 'm1', groupId: 'g1', viewerUserId: 'tester', hostContext: makeHost() });
  })();

  // 12 index_written → 清 staging/journal
  (function () {
    var st = makeStorage({ bag: { gb_side_games_v1: [makeRecord('sg_cl')] } });
    initRepo(st);
    var txId = 'tx_cl';
    var sk = v2store.stagingKey(txId, 'sg_cl');
    st._bag[sk] = st._bag[v2mig.instanceKey('sg_cl')];
    st._bag[v2store.JOURNAL_KEY] = {
      txId: txId,
      matchId: 'm1',
      createdAt: 1,
      status: 'index_written',
      ops: [{ type: 'update', sideGameId: 'sg_cl', beforeRevision: 1, afterRevision: 1, stagingKey: sk }]
    };
    initRepo(st);
    assert('12 journal gone', st._bag[v2store.JOURNAL_KEY] == null);
    assert('12 staging gone', st._bag[sk] == null);
  })();

  // 13 orphan staging
  (function () {
    var st = makeStorage({ bag: { gb_side_games_v1: [makeRecord('sg_or')] } });
    initRepo(st);
    var instBefore = JSON.stringify(st._bag[v2mig.instanceKey('sg_or')]);
    st._bag[v2store.stagingKey('tx_orphan', 'sg_or')] = makeRecord('sg_or', { title: 'should-not-apply', revision: 9 });
    initRepo(st);
    assert('13 staging deleted', !Object.keys(st._bag).some(function (k) { return k.indexOf(v2store.STAGING_PREFIX) === 0; }));
    assert('13 instance untouched', JSON.stringify(st._bag[v2mig.instanceKey('sg_or')]) === instBefore);
  })();

  // 14 instance 成功 index 失败 → repair
  (function () {
    var bag14 = { gb_side_games_v1: [] };
    var st = makeStorage({
      bag: bag14,
      failWriteKey: function (key) {
        var mig = bag14[v2mig.MIGRATION_KEY];
        return key === v2mig.INDEX_KEY && mig && mig.status === 'migrated';
      }
    });
    var repo = initRepo(st);
    var created = repo.create(createInput({ idempotencyKey: 'ixfail', title: 'x' }));
    assert('14 create reports fail', !created.ok);
    var ids = instanceKeys(st._bag);
    assert('14 instance written', ids.length === 1);
    st.setItem = function (key, value) {
      st._bag[key] = clone(value);
      return true;
    };
    var repo2 = initRepo(st);
    var listed = repo2.listVisible({ matchId: 'm1', groupId: 'g1', viewerUserId: 'tester', hostContext: makeHost() });
    assert('14 repair lists create', listed.ok && listed.data.items.length === 1);
  })();

  // 15 index 丢失 → 从 instance keys 重建
  (function () {
    var st = makeStorage({ bag: { gb_side_games_v1: [makeRecord('sg_rb1'), makeRecord('sg_rb2')] } });
    initRepo(st);
    delete st._bag[v2mig.INDEX_KEY];
    var repo = initRepo(st);
    var listed = repo.listVisible({ matchId: 'm1', groupId: 'g1', viewerUserId: 'tester', hostContext: makeHost() });
    assert('15 rebuilt list', listed.ok && listed.data.items.length === 2);
    assert('15 index exists', !!(st._bag[v2mig.INDEX_KEY] && st._bag[v2mig.INDEX_KEY].items.length === 2));
  })();

  // 16 成功保存不写 v1
  (function () {
    var st = makeStorage({ bag: { gb_side_games_v1: [makeRecord('sg_old')] } });
    var repo = initRepo(st);
    var before = v1Snapshot(st._bag);
    repo.create(createInput({ idempotencyKey: 'nv1', title: 'n' }));
    repo.update('sg_old', 1, { title: 'u' });
    assert('16 v1 snapshot frozen', v1Snapshot(st._bag) === before);
  })();

  // 17 未 migrated 仍走 v1
  (function () {
    var st = makeStorage({
      bag: {},
      failWriteKey: function (key) {
        return key === v2mig.INDEX_KEY || String(key).indexOf(v2mig.INSTANCE_PREFIX) === 0;
      }
    });
    var repo = initRepo(st);
    var created = repo.create(createInput({ idempotencyKey: 'v1fb', title: 'v1path' }));
    assert('17 v1 create ok', created.ok, created.reason);
    assert('17 wrote v1 array', Array.isArray(st._bag.gb_side_games_v1) && st._bag.gb_side_games_v1.length === 1);
  })();

  // 18 69 条仍可 list/get
  (function () {
    var st = makeStorage({ bag: { gb_side_games_v1: nRecords(69) } });
    var repo = initRepo(st);
    var listed = repo.listVisible({ matchId: 'm1', groupId: 'g1', viewerUserId: 'tester', hostContext: makeHost() });
    var active = nRecords(69).filter(function (r) { return r.status !== 'deleted'; }).length;
    assert('18 list count', listed.ok && listed.data.items.length === active, 'got=' + (listed.data && listed.data.items.length));
    var got = repo.getById('sg_1');
    assert('18 get first', got.ok && got.data.sideGameId === 'sg_1');
    assert('18 v1 kept', st._bag.gb_side_games_v1.length === 69);
  })();
} finally {
  identity.setImplementation(savedIdentity);
}

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
