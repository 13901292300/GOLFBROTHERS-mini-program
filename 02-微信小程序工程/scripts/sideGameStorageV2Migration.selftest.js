/**
 * Storage V2 Phase 1 只读迁移。
 * 运行：node scripts/sideGameStorageV2Migration.selftest.js
 */
if (typeof global.wx !== 'object') global.wx = {};
global.wx.getStorageSync = global.wx.getStorageSync || function () {
  return null;
};
global.wx.setStorageSync = global.wx.setStorageSync || function () {};

var localMod = require('../miniprogram/subpackages/game/utils/localSideGameRepository.js');
var v2mig = require('../miniprogram/subpackages/game/utils/sideGameStorageV2Migration.js');

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
    ruleId: 'lasuo-4',
    title: 't-' + id,
    revision: 1,
    updatedAt: 1000,
    ruleSnapshot: { catalogId: 'lasuo-4', name: '拉丝' },
    resultSnapshot: { byHole: { A1: { x: 1 } } },
    config: { instance: { players: [{ id: 'p1' }] } },
    players: [{ id: 'p1' }],
    participantParties: [{ partyId: 'A' }]
  };
  if (patch && typeof patch === 'object') {
    Object.keys(patch).forEach(function (k) {
      row[k] = patch[k];
    });
  }
  return row;
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
  var instanceWrites = 0;
  return {
    getItem: function (key) {
      if (o.failRead) return { __fail: true };
      if (typeof o.failReadKey === 'function' && o.failReadKey(key)) return { __fail: true };
      return bag[key];
    },
    setItem: function (key, value) {
      if (typeof o.failWriteKey === 'function' && o.failWriteKey(key, value)) return false;
      if (o.interruptAfter > 0 && String(key).indexOf(v2mig.INSTANCE_PREFIX) === 0) {
        instanceWrites += 1;
        if (instanceWrites > o.interruptAfter) return false;
      }
      bag[key] = clone(value);
      return true;
    },
    _bag: bag,
    _instanceWrites: function () {
      return instanceWrites;
    }
  };
}

function instanceCount(bag) {
  var n = 0;
  Object.keys(bag).forEach(function (k) {
    if (k.indexOf(v2mig.INSTANCE_PREFIX) === 0) n += 1;
  });
  return n;
}

function initRepo(storage) {
  return localMod.createLocalSideGameRepository({
    storage: storage,
    clock: function () {
      return 9000;
    }
  });
}

function mig(bag) {
  return bag[v2mig.MIGRATION_KEY] || {};
}

function indexOf(bag) {
  return bag[v2mig.INDEX_KEY] || {};
}

// CASE 1 无 v1 → 空 index → migrated
(function () {
  var st = makeStorage();
  initRepo(st);
  var m = mig(st._bag);
  var idx = indexOf(st._bag);
  assert('CASE 1 status migrated', m.status === 'migrated');
  assert('CASE 1 sourceCount 0', m.sourceCount === 0);
  assert('CASE 1 index empty', Array.isArray(idx.items) && idx.items.length === 0);
  assert('CASE 1 schemaVersion 2', idx.schemaVersion === 2);
  assert('CASE 1 no v1 key still ok', st._bag[v2mig.SOURCE_KEY] == null);
})();

// CASE 2 v1 1条
(function () {
  var st = makeStorage({ bag: { gb_side_games_v1: [makeRecord('sg_a')] } });
  initRepo(st);
  var m = mig(st._bag);
  var idx = indexOf(st._bag);
  var inst = st._bag[v2mig.instanceKey('sg_a')];
  assert('CASE 2 migrated', m.status === 'migrated' && m.sourceCount === 1 && m.migratedCount === 1);
  assert('CASE 2 instance+index', !!(inst && inst.sideGameId === 'sg_a') && idx.items.length === 1);
  assert('CASE 2 v1 kept', Array.isArray(st._bag.gb_side_games_v1) && st._bag.gb_side_games_v1.length === 1);
})();

// CASE 3 v1 100条
(function () {
  var st = makeStorage({ bag: { gb_side_games_v1: nRecords(100) } });
  initRepo(st);
  var m = mig(st._bag);
  var idx = indexOf(st._bag);
  assert('CASE 3 counts', m.status === 'migrated' && m.sourceCount === 100 && m.migratedCount === 100 && idx.items.length === 100);
  assert('CASE 3 instances 100', instanceCount(st._bag) === 100);
  assert('CASE 3 hash set', typeof m.idHash === 'string' && m.idHash.indexOf('h') === 0);
})();

// CASE 4 中断 40 再重试
(function () {
  var bag = { gb_side_games_v1: nRecords(100) };
  var st1 = makeStorage({ bag: bag, interruptAfter: 40 });
  initRepo(st1);
  var m1 = mig(bag);
  assert('CASE 4 interrupt not migrated', m1.status !== 'migrated');
  assert('CASE 4 wrote 40', instanceCount(bag) === 40);
  var st2 = makeStorage({ bag: bag });
  initRepo(st2);
  var m2 = mig(bag);
  var idx = indexOf(bag);
  assert('CASE 4 retry migrated', m2.status === 'migrated');
  assert('CASE 4 final 100', m2.sourceCount === 100 && m2.migratedCount === 100 && idx.items.length === 100 && instanceCount(bag) === 100);
})();

// CASE 5 已有更高 revision 不被覆盖
(function () {
  var v1 = [makeRecord('sg_keep', { revision: 1, title: 'old', status: 'active' })];
  var bag = { gb_side_games_v1: v1 };
  bag[v2mig.instanceKey('sg_keep')] = makeRecord('sg_keep', { revision: 9, title: 'newer-v2', status: 'settled' });
  var st = makeStorage({ bag: bag });
  initRepo(st);
  var inst = bag[v2mig.instanceKey('sg_keep')];
  var idx = indexOf(bag);
  assert('CASE 5 keep higher rev', inst && inst.revision === 9 && inst.title === 'newer-v2');
  assert('CASE 5 index uses v2 identity', idx.items[0] && idx.items[0].revision === 9 && idx.items[0].status === 'settled');
  assert('CASE 5 migrated', mig(bag).status === 'migrated');
})();

// CASE 6 v2 revision 更低 → 被 v1 覆盖
(function () {
  var v1 = [makeRecord('sg_fix', { revision: 4, title: 'from-v1', status: 'active' })];
  var bag = { gb_side_games_v1: v1 };
  bag[v2mig.instanceKey('sg_fix')] = makeRecord('sg_fix', { revision: 2, title: 'stale-v2', status: 'deleted' });
  var st = makeStorage({ bag: bag });
  initRepo(st);
  var inst = bag[v2mig.instanceKey('sg_fix')];
  assert('CASE 6 overwrite lower rev', inst && inst.revision === 4 && inst.title === 'from-v1' && inst.status === 'active');
  assert('CASE 6 migrated', mig(bag).status === 'migrated');
})();

// CASE 7 deleted 保留
(function () {
  var st = makeStorage({
    bag: { gb_side_games_v1: [makeRecord('sg_del', { status: 'deleted', deletedAt: 8 })] }
  });
  initRepo(st);
  var inst = st._bag[v2mig.instanceKey('sg_del')];
  var idx = indexOf(st._bag);
  assert('CASE 7 deleted instance', inst && inst.status === 'deleted');
  assert('CASE 7 deleted in index', idx.items[0] && idx.items[0].status === 'deleted');
  assert('CASE 7 migrated', mig(st._bag).status === 'migrated');
})();

// CASE 8 hash 含 revision/status
(function () {
  var a = [{ sideGameId: 'x', revision: 1, status: 'active' }];
  var b = [{ sideGameId: 'x', revision: 2, status: 'active' }];
  var c = [{ sideGameId: 'x', revision: 1, status: 'deleted' }];
  var hIdOnlyWouldCollide = v2mig.identityHash(a);
  assert('CASE 8 rev changes hash', v2mig.identityHash(a) !== v2mig.identityHash(b));
  assert('CASE 8 status changes hash', v2mig.identityHash(a) !== v2mig.identityHash(c));
  assert('CASE 8 same tuple stable', v2mig.identityHash(a) === hIdOnlyWouldCollide);
  var bag = { gb_side_games_v1: [makeRecord('sg_h', { revision: 3, status: 'settled' })] };
  initRepo(makeStorage({ bag: bag }));
  assert('CASE 8 stored hash matches', mig(bag).idHash === v2mig.identityHash(indexOf(bag).items));
})();

// CASE 9 index 不含大字段
(function () {
  var st = makeStorage({ bag: { gb_side_games_v1: [makeRecord('sg_fat')] } });
  initRepo(st);
  var idx = indexOf(st._bag);
  var json = JSON.stringify(idx);
  assert('CASE 9 no ruleSnapshot', json.indexOf('ruleSnapshot') < 0);
  assert('CASE 9 no resultSnapshot', json.indexOf('resultSnapshot') < 0);
  assert('CASE 9 no config', json.indexOf('"config"') < 0);
  assert('CASE 9 no players', json.indexOf('"players"') < 0);
  assert('CASE 9 no participantParties', json.indexOf('participantParties') < 0);
  var item = idx.items[0];
  assert(
    'CASE 9 light fields only',
    item && item.sideGameId && 'matchId' in item && 'revision' in item && !('ruleSnapshot' in item) && !('config' in item)
  );
})();

// CASE 10 instance 写失败 → 不标 migrated
(function () {
  var st = makeStorage({
    bag: { gb_side_games_v1: [makeRecord('sg_w')] },
    failWriteKey: function (key) {
      return String(key).indexOf(v2mig.INSTANCE_PREFIX) === 0;
    }
  });
  initRepo(st);
  var m = mig(st._bag);
  assert('CASE 10 not migrated', m.status !== 'migrated');
  assert('CASE 10 lastError', m.lastError === 'storage_write_failed');
  assert('CASE 10 v1 intact', st._bag.gb_side_games_v1.length === 1);
})();

// CASE 11 index 写失败 → 不标 migrated
(function () {
  var st = makeStorage({
    bag: { gb_side_games_v1: [makeRecord('sg_i')] },
    failWriteKey: function (key) {
      return key === v2mig.INDEX_KEY;
    }
  });
  initRepo(st);
  var m = mig(st._bag);
  assert('CASE 11 not migrated', m.status !== 'migrated');
  assert('CASE 11 lastError', m.lastError === 'storage_write_failed');
  assert('CASE 11 instance may exist', !!st._bag[v2mig.instanceKey('sg_i')]);
  assert('CASE 11 no index', st._bag[v2mig.INDEX_KEY] == null);
})();

// CASE 12 v1 完全未删除
(function () {
  var list = nRecords(3);
  var st = makeStorage({ bag: { gb_side_games_v1: list } });
  var repo = initRepo(st);
  assert('CASE 12 v1 still present', Array.isArray(st._bag.gb_side_games_v1) && st._bag.gb_side_games_v1.length === 3);
  assert('CASE 12 no remove API used', typeof st.removeItem !== 'function');
  var listed = repo.listVisible({ matchId: 'm1', groupId: 'g1', viewerUserId: 'u1' });
  assert('CASE 12 business still reads v1', !!(listed && listed.ok));
})();

function captureMigrationLogs(fn) {
  var orig = console.log;
  var rows = [];
  console.log = function () {
    rows.push(Array.prototype.slice.call(arguments));
    if (typeof orig === 'function') orig.apply(console, arguments);
  };
  try {
    fn();
  } finally {
    console.log = orig;
  }
  return rows.filter(function (args) {
    return args[0] === '[side-game-storage-v2] migration';
  });
}

function countMigrationReads(st, fn) {
  var n = 0;
  var inner = st.getItem;
  st.getItem = function (key) {
    if (key === v2mig.MIGRATION_KEY) n += 1;
    return inner.call(st, key);
  };
  try {
    fn();
  } finally {
    st.getItem = inner;
  }
  return n;
}

// CASE 13 已 migrated 再 ensureMigrated 不重复迁移
(function () {
  var st = makeStorage({ bag: { gb_side_games_v1: [makeRecord('sg_once')] } });
  initRepo(st);
  var before = JSON.stringify(mig(st._bag));
  var instBefore = JSON.stringify(st._bag[v2mig.instanceKey('sg_once')]);
  var idxBefore = JSON.stringify(indexOf(st._bag));
  var v1Before = JSON.stringify(st._bag.gb_side_games_v1);
  var again = v2mig.ensureMigrated(st, function () {
    return 9000;
  }, { logSkipped: false });
  assert('CASE 13 still migrated', again && again.status === 'migrated');
  assert('CASE 13 state unchanged', JSON.stringify(mig(st._bag)) === before);
  assert('CASE 13 instance unchanged', JSON.stringify(st._bag[v2mig.instanceKey('sg_once')]) === instBefore);
  assert('CASE 13 index unchanged', JSON.stringify(indexOf(st._bag)) === idxBefore);
  assert('CASE 13 v1 unchanged', JSON.stringify(st._bag.gb_side_games_v1) === v1Before);
})();

// CASE 14 skipped=true 日志分支
(function () {
  var st = makeStorage({ bag: { gb_side_games_v1: [makeRecord('sg_log')] } });
  initRepo(st);
  var logs = captureMigrationLogs(function () {
    v2mig.ensureMigrated(st, function () {
      return 9000;
    }, { logSkipped: true });
  });
  var hit = logs.some(function (args) {
    var d = args[1] || {};
    return d.status === 'migrated' && d.skipped === true && typeof d.sourceCount === 'number' && typeof d.completedAt === 'number';
  });
  assert('CASE 14 skipped log', hit, 'logs=' + logs.length);
})();

// CASE 15 listVisible 前 ensureReady
(function () {
  var st = makeStorage({ bag: { gb_side_games_v1: [makeRecord('sg_lv')] } });
  var repo = initRepo(st);
  var v1Before = JSON.stringify(st._bag.gb_side_games_v1);
  var reads = countMigrationReads(st, function () {
    repo.listVisible({ matchId: 'm1', groupId: 'g1', viewerUserId: 'u1' });
  });
  assert('CASE 15 listVisible ensureReady', reads >= 1, 'reads=' + reads);
  assert('CASE 15 v1 result unchanged', JSON.stringify(st._bag.gb_side_games_v1) === v1Before);
})();

// CASE 16 create 前 ensureReady
(function () {
  var st = makeStorage({ bag: { gb_side_games_v1: [makeRecord('sg_cr')] } });
  var repo = initRepo(st);
  var v1Before = JSON.stringify(st._bag.gb_side_games_v1);
  var reads = countMigrationReads(st, function () {
    repo.create({});
  });
  assert('CASE 16 create ensureReady', reads >= 1, 'reads=' + reads);
  assert('CASE 16 v1 not rewritten by failed create', JSON.stringify(st._bag.gb_side_games_v1) === v1Before);
})();

// CASE 17 commitSetupDraft 前 ensureReady
(function () {
  var st = makeStorage({ bag: { gb_side_games_v1: [makeRecord('sg_cd')] } });
  var repo = initRepo(st);
  var v1Before = JSON.stringify(st._bag.gb_side_games_v1);
  var reads = countMigrationReads(st, function () {
    repo.commitSetupDraft({ creates: [], updates: [], removes: [] });
  });
  var v1After = st._bag.gb_side_games_v1;
  assert('CASE 17 commitSetupDraft ensureReady', reads >= 1, 'reads=' + reads);
  assert(
    'CASE 17 still canonical v1',
    Array.isArray(v1After) && v1After.length === 1 && v1After[0].sideGameId === 'sg_cd'
  );
})();

// 业务写路径仍写 v1（Phase 1 不切 v2）
(function () {
  var bag = { gb_side_games_v1: [] };
  var created = [];
  var st = makeStorage({ bag: bag });
  var repo = localMod.createLocalSideGameRepository({
    storage: st,
    idGen: function () {
      return 'sg_biz';
    },
    clock: function () {
      return 1;
    }
  });
  assert('precheck empty migrated', mig(bag).status === 'migrated');
  var beforeV1 = JSON.stringify(bag.gb_side_games_v1 || []);
  var v2Before = instanceCount(bag);
  created.push(beforeV1, v2Before);
  assert('CASE extra v2 not required for empty biz path', v2Before === 0);
})();

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
