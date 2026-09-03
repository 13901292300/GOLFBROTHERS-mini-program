/**
 * Phase D.2 SideGameRepository 本机实现与可替换接口。
 * 运行：node scripts/sideGameRepository.selftest.js
 */
var fs = require('fs');
var path = require('path');

if (typeof global.wx !== 'object') {
  global.wx = {
    getStorageSync: function () {
      return null;
    },
    setStorageSync: function () {}
  };
}

var rec = require('../miniprogram/subpackages/game/utils/sideGameRecord.js');
var identity = require('../miniprogram/subpackages/game/utils/sideGameIdentityProvider.js');
var entitlement = require('../miniprogram/subpackages/game/utils/sideGameEntitlementProvider.js');
var localMod = require('../miniprogram/subpackages/game/utils/localSideGameRepository.js');
var facade = require('../miniprogram/subpackages/game/utils/sideGameRepository.js');
var hostMod = require('../miniprogram/subpackages/game/utils/gameHostContext.js');
var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');

var passed = 0;
var failed = 0;
var gameRoot = path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game');

function assert(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    console.log('FAIL  ' + name + (detail ? ' :: ' + detail : ''));
  }
}

function memStorage(failWrite, failRead) {
  var bag = {};
  return {
    getItem: function (key) {
      if (failRead) return { __fail: true };
      return bag[key];
    },
    setItem: function (key, value) {
      if (failWrite) return false;
      bag[key] = JSON.parse(JSON.stringify(value));
      return true;
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

function makeHost(extra) {
  var holeOrder = ['A1', 'A2'];
  var parties = [
    { partyId: 'A', partyType: 'player', displayName: '甲', memberPlayerIds: ['A'], groupId: 'g1' },
    { partyId: 'B', partyType: 'player', displayName: '乙', memberPlayerIds: ['B'], groupId: 'g1' },
    { partyId: 'combo-1', partyType: 'combination', displayName: '组合', memberPlayerIds: ['A', 'B'], groupId: 'g1' },
    { partyId: 'side-red', partyType: 'side', displayName: '红队', memberPlayerIds: ['A'], groupId: 'g1' },
    { partyId: 'C', partyType: 'player', displayName: '丙', memberPlayerIds: ['C'], groupId: 'g2' },
    { partyId: 'D', partyType: 'player', displayName: '丁', memberPlayerIds: ['D'], groupId: 'g1' },
    { partyId: 'E', partyType: 'player', displayName: '戊', memberPlayerIds: ['E'], groupId: 'g1' },
    { partyId: 'F', partyType: 'player', displayName: '己', memberPlayerIds: ['F'], groupId: 'g1' },
    { partyId: 'G', partyType: 'player', displayName: '庚', memberPlayerIds: ['G'], groupId: 'g1' }
  ];
  var ids = parties.map(function (p) {
    return p.partyId;
  });
  var host = hostMod.emptyContext({
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
      { playerId: 'B', groupId: 'g1' },
      { playerId: 'C', groupId: 'g2' }
    ],
    scoreParties: parties,
    officialScoresByPartyId: holesFor(ids, holeOrder, 4)
  });
  extra = extra || {};
  Object.keys(extra).forEach(function (k) {
    host[k] = extra[k];
  });
  return host;
}

function partiesOf() {
  var ids = [].slice.call(arguments);
  return ids.map(function (id) {
    return { partyId: id, partyType: 'player', displayName: id, memberPlayerIds: [id] };
  });
}

function createInput(repoHost, patch) {
  var host = repoHost || makeHost();
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

var savedIdentity = identity.getImplementation();
var savedEnt = entitlement.getImplementation();
var savedRepo = facade.getImplementation();

identity.setImplementation({
  implementation: 'test',
  getCurrentUserId: function () {
    return 'tester';
  }
});

var repo = localMod.createLocalSideGameRepository({
  storage: memStorage(),
  idGen: (function () {
    var n = 0;
    return function () {
      n += 1;
      return 'sg_' + n;
    };
  })(),
  clock: function () {
    return 1000;
  }
});
facade.setImplementation(repo);

assert('门面 listVisible 存在', typeof facade.listVisible === 'function');
assert('门面 create 存在', typeof facade.create === 'function');
assert('资格 implementation=local-preview', entitlement.IMPLEMENTATION === 'local-preview');

var created = facade.create(createInput(makeHost(), { idempotencyKey: 'create_once', title: '比杆' }));
assert('create ok', created.ok && created.data && created.data.sideGameId === 'sg_1', JSON.stringify(created));
assert('revision 从 1 开始', created.revision === 1 && created.data.revision === 1);
assert(
  '记录字段齐全',
  !!(
    created.data.sideGameId &&
    created.data.matchId &&
    created.data.ruleSnapshot &&
    created.data.participantParties &&
    created.data.visibility &&
    created.data.createdBy === 'tester'
  )
);

var dup = facade.create(createInput(makeHost(), { idempotencyKey: 'create_once', title: '重复' }));
assert('create idempotency 返回原记录', dup.ok && dup.data.sideGameId === 'sg_1' && dup.data.title !== '重复');

var listed = facade.listVisible({
  matchId: 'm1',
  groupId: 'g1',
  scope: 'group',
  hostContext: makeHost(),
  viewerUserId: 'tester'
});
assert('listVisible 含新建', listed.ok && listed.data.items.length === 1);

var got = facade.getById('sg_1');
assert('getById', got.ok && got.data.title === '比杆');

var upd = facade.update('sg_1', 1, { title: '比杆改', idempotencyKey: 'upd1' });
assert('update 递增 revision', upd.ok && upd.revision === 2 && upd.data.title === '比杆改');
var conflict = facade.update('sg_1', 1, { title: '冲突' });
assert('revision conflict', !conflict.ok && conflict.reason === 'revision_conflict' && conflict.revision === 2);

var again = facade.update('sg_1', 2, { title: '不应覆盖', idempotencyKey: 'upd1' });
assert('update idempotency', again.ok && again.revision === 2 && again.data.title === '比杆改');

var failStore = localMod.createLocalSideGameRepository({
  storage: memStorage(true, false),
  idGen: function () {
    return 'sg_fail';
  }
});
var failCreate = failStore.create(createInput());
assert('storage 写入失败', !failCreate.ok && failCreate.reason === 'storage_write_failed');

var failRead = localMod.createLocalSideGameRepository({ storage: memStorage(false, true) });
assert('storage 读取失败', failRead.listVisible({ matchId: 'm1' }).reason === 'storage_read_failed');

var removed = facade.remove('sg_1', 2);
assert('remove 软删除', removed.ok);
assert('getById 软删除不可见', !facade.getById('sg_1').ok);
assert(
  '普通列表不显示删除',
  facade.listVisible({ matchId: 'm1', groupId: 'g1', scope: 'group', viewerUserId: 'tester', hostContext: makeHost() }).data.items.length === 0
);

var visHost = makeHost();
function seed(vis, scope, extra) {
  return repo.create(
    createInput(visHost, Object.assign({ visibility: vis, scope: scope, groupId: scope === 'group' ? 'g1' : '' }, extra || {}))
  );
}
var pub = seed('public', 'group', { idempotencyKey: 'vpub', title: '公开组' });
var evt = seed('event', 'match', {
  idempotencyKey: 'vevt',
  title: '赛事',
  groupId: '',
  participantParties: partiesOf('A', 'B')
});
var grp = seed('group', 'group', { idempotencyKey: 'vgrp', title: '本组' });
var pot = seed('group', 'group', {
  idempotencyKey: 'vpot',
  title: '大锅饭',
  config: rec.emptyConfig({ allowBigPot: true })
});
assert('可见性种子', pub.ok && evt.ok && grp.ok && pot.ok, JSON.stringify({ pub: pub.reason, evt: evt.reason, grp: grp.reason, pot: pot.reason }));

var strangerGroup = repo.listVisible({
  matchId: 'm1',
  groupId: 'g1',
  scope: 'group',
  hostContext: visHost,
  viewerUserId: 'stranger'
});
var titles = (strangerGroup.data.items || []).map(function (x) {
  return x.title;
});
assert('陌生人对 group 列表仅 public', titles.indexOf('公开组') >= 0 && titles.indexOf('本组') < 0 && titles.indexOf('赛事') < 0);

var memberA = repo.listVisible({
  matchId: 'm1',
  groupId: 'g1',
  scope: 'group',
  hostContext: visHost,
  viewerUserId: 'A'
});
var titlesA = (memberA.data.items || []).map(function (x) {
  return x.title;
});
assert('组员可见 group+public+大锅饭', titlesA.indexOf('本组') >= 0 && titlesA.indexOf('大锅饭') >= 0 && titlesA.indexOf('赛事') < 0);

var hub = repo.listVisible({
  matchId: 'm1',
  groupId: '',
  scope: 'match',
  hostContext: visHost,
  hideBigPot: true,
  viewerUserId: 'A'
});
var hubTitles = (hub.data.items || []).map(function (x) {
  return x.title;
});
assert(
  'Hub 只显示 match scope',
  hubTitles.indexOf('赛事') >= 0 && hubTitles.indexOf('本组') < 0 && hubTitles.indexOf('公开组') < 0 && hubTitles.indexOf('大锅饭') < 0
);

assert(
  'Hub 不读空 groupId 的分组实例',
  repo.listVisible({
    matchId: 'm1',
    groupId: '',
    scope: 'group',
    hostContext: visHost,
    viewerUserId: 'A'
  }).data.items.length === 0
);

var scoreTab = repo.listVisible({
  matchId: 'm1',
  groupId: 'g1',
  scope: 'group',
  hostContext: visHost,
  viewerUserId: 'A'
});
assert(
  '记分页可显示大锅饭',
  (scoreTab.data.items || []).some(function (x) {
    return x.title === '大锅饭';
  })
);

var potMatch = repo.create(
  createInput(visHost, {
    idempotencyKey: 'badpot',
    scope: 'match',
    groupId: '',
    visibility: 'event',
    config: rec.emptyConfig({ allowBigPot: true })
  })
);
assert('match 不允许大锅饭', !potMatch.ok && potMatch.reason === 'big_pot_not_allowed');

var noPotHost = makeHost({ allowBigPot: false });
var potDenied = repo.create(
  createInput(noPotHost, {
    idempotencyKey: 'nopot',
    config: rec.emptyConfig({ allowBigPot: true })
  })
);
assert('记分页 allowBigPot=false 不可开大锅饭', !potDenied.ok && potDenied.reason === 'big_pot_not_allowed');

['stroke-2', 'landlord-big', 'lasuo-4', 'horn', 'lasuo-n'].forEach(function (ruleId) {
  var n = rec.capOf(ruleId).requiredPartyCount;
  var ids = ['A', 'B', 'D', 'E', 'F', 'G'].slice(0, n);
  var out = repo.create(
    createInput(makeHost(), {
      idempotencyKey: 'n_' + ruleId,
      ruleId: ruleId,
      ruleSnapshot: rec.buildRuleSnapshot(ruleId),
      title: ruleId,
      participantParties: partiesOf.apply(null, ids)
    })
  );
  assert(n + '方规则 ' + ruleId, out.ok, out.reason);
  var wrong = repo.create(
    createInput(makeHost(), {
      idempotencyKey: 'badn_' + ruleId,
      ruleId: ruleId,
      ruleSnapshot: rec.buildRuleSnapshot(ruleId),
      participantParties: partiesOf.apply(null, ids.slice(0, n - 1))
    })
  );
  assert(ruleId + ' 方数不足拒绝', !wrong.ok && wrong.reason === 'party_count');
});

var comboCreate = repo.create(
  createInput(makeHost(), {
    idempotencyKey: 'combo',
    participantParties: [
      { partyId: 'combo-1', partyType: 'combination', displayName: '组合', memberPlayerIds: ['A', 'B'] },
      { partyId: 'side-red', partyType: 'side', displayName: '红队', memberPlayerIds: ['A'] }
    ]
  })
);
assert('combination/side 各算一方', comboCreate.ok && comboCreate.data.participantParties.length === 2, comboCreate.reason);
assert(
  '方数不是成员人数',
  comboCreate.ok &&
    comboCreate.data.participantParties[0].memberPlayerIds.length === 2 &&
    rec.capOf('stroke-2').requiredPartyCount === 2
);

var live = repo.create(createInput(makeHost(), { idempotencyKey: 'live', title: '结算' }));
var refreshed = repo.refreshResult(live.data.sideGameId, makeHost());
assert('refreshResult 保存 resultSnapshot', refreshed.ok && !!refreshed.data.resultSnapshot, refreshed.reason);
assert('hostRevisionAtSettle', refreshed.data.hostRevisionAtSettle === 'r1');
var stale = rec.isResultStale(refreshed.data, makeHost({ revision: 'r2' }));
assert('Host revision 变化标记过期', stale === true);
assert('未点刷新不改结果', facade.getById(live.data.sideGameId).data.hostRevisionAtSettle === 'r1');

var mapped = repo.create(
  createInput(makeHost(), {
    idempotencyKey: 'map',
    participantParties: [
      { partyId: 'A', partyType: 'player', displayName: '甲', memberPlayerIds: ['A'] },
      { partyId: 'combo-1', partyType: 'combination', displayName: '组合', memberPlayerIds: ['A', 'B'] }
    ]
  })
);
repo.refreshResult(mapped.data.sideGameId, makeHost());
var remap = repo.remapPlayerId('m1', 'A', 'C');
assert('remap 更新相关记录', remap.ok && (remap.data.updatedSideGameIds || []).indexOf(mapped.data.sideGameId) >= 0);
var afterMap = repo.getById(mapped.data.sideGameId).data;
assert('player partyId A→C', afterMap.participantParties[0].partyId === 'C');
assert('combination partyId 保持', afterMap.participantParties[1].partyId === 'combo-1');
assert('memberPlayerIds A→C', afterMap.participantParties[1].memberPlayerIds.indexOf('C') >= 0 && afterMap.participantParties[1].memberPlayerIds.indexOf('A') < 0);
assert('remap 后结果过期', afterMap.hostRevisionAtSettle === '');

var idSwap = {
  implementation: 'mock-id',
  getCurrentUserId: function () {
    return 'viewer-x';
  }
};
identity.setImplementation(idSwap);
assert('替换 IdentityProvider 无需改页面 API', identity.getCurrentUserId() === 'viewer-x');
identity.setImplementation({
  implementation: 'test',
  getCurrentUserId: function () {
    return 'tester';
  }
});

var deny = {
  implementation: 'deny-all',
  canCreate: function () {
    return { ok: false, reason: 'no_entitlement', implementation: 'deny-all' };
  },
  canUpdate: function () {
    return { ok: false, reason: 'no_entitlement', implementation: 'deny-all' };
  },
  canRemove: function () {
    return { ok: false, reason: 'no_entitlement', implementation: 'deny-all' };
  }
};
entitlement.setImplementation(deny);
var blocked = repo.create(createInput(makeHost(), { idempotencyKey: 'ent' }));
assert('替换 Entitlement 后拒绝创建', !blocked.ok && blocked.reason === 'no_entitlement');
entitlement.setImplementation(savedEnt);
assert('预览资格仍放行', entitlement.canCreate({}).ok && entitlement.canCreate({}).implementation === 'local-preview');
assert('预览不伪造参赛身份', entitlement.canUpdate({ userId: 'me', record: mapped.data }).relaxed === true);

var cloudish = {
  listVisible: function () {
    return { ok: true, reason: '', data: { items: [] }, revision: 0 };
  },
  getById: function () {
    return { ok: false, reason: 'not_found', data: null, revision: 0 };
  },
  create: function () {
    return { ok: true, reason: '', data: { sideGameId: 'cloud' }, revision: 1 };
  },
  update: function () {
    return { ok: true, reason: '', data: {}, revision: 2 };
  },
  remove: function () {
    return { ok: true, reason: '', data: { deleted: true }, revision: 3 };
  },
  refreshResult: function () {
    return { ok: true, reason: '', data: {}, revision: 2 };
  },
  remapPlayerId: function () {
    return { ok: true, reason: '', data: { updatedSideGameIds: [] }, revision: 0 };
  },
  subscribe: function () {
    return {};
  },
  unsubscribe: function () {}
};
facade.setImplementation(cloudish);
assert('替换 Repository 后门面 create 不改签名', facade.create({}).data.sideGameId === 'cloud');
facade.setImplementation(repo);

var events = [];
var handle = facade.subscribe({ matchId: 'm1' }, function (ev) {
  events.push(ev.type);
});
repo.create(createInput(makeHost(), { idempotencyKey: 'sub' }));
facade.unsubscribe(handle);
assert('subscribe 本机回调', events.indexOf('create') >= 0);

var caps = hostMod.listRuleCapabilities();
assert('仍为 17 条规则', caps.length === 17);
var catalogN = 0;
(catalog.CATALOG || []).forEach(function (g) {
  (g.items || []).forEach(function () {
    catalogN += 1;
  });
});
assert('catalog 17', catalogN === 17);
var closedIds = ['skins'];
closedIds.forEach(function (id) {
  var blocked = repo.create(
    createInput(makeHost(), {
      idempotencyKey: 'unav_' + id,
      ruleId: id,
      ruleSnapshot: rec.buildRuleSnapshot(id)
    })
  );
  assert('不可创建 ' + id, !blocked.ok && blocked.reason === 'rule_unavailable', blocked.reason);
});
var smallOk = repo.create(
  createInput(makeHost(), {
    idempotencyKey: 'ok_landlord_small',
    ruleId: 'landlord-small',
    ruleSnapshot: rec.buildRuleSnapshot('landlord-small'),
    participantParties: [
      { partyId: 'A', partyType: 'player', memberPlayerIds: ['A'] },
      { partyId: 'B', partyType: 'player', memberPlayerIds: ['B'] },
      { partyId: 'D', partyType: 'player', memberPlayerIds: ['D'] }
    ]
  })
);
assert('可创建斗小地主', !!(smallOk && smallOk.ok), smallOk && smallOk.reason);
var threeOk = repo.create(
  createInput(makeHost(), {
    idempotencyKey: 'ok_three_set',
    ruleId: 'three-set',
    ruleSnapshot: rec.buildRuleSnapshot('three-set'),
    participantParties: [
      { partyId: 'A', partyType: 'player', memberPlayerIds: ['A'] },
      { partyId: 'B', partyType: 'player', memberPlayerIds: ['B'] }
    ]
  })
);
assert('可创建三局', !!(threeOk && threeOk.ok), threeOk && threeOk.reason);
var youcaiOk = repo.create(
  createInput(makeHost(), {
    idempotencyKey: 'ok_youcai',
    ruleId: 'youcai',
    ruleSnapshot: rec.buildRuleSnapshot('youcai'),
    participantParties: [
      { partyId: 'A', partyType: 'player', memberPlayerIds: ['A'] },
      { partyId: 'B', partyType: 'player', memberPlayerIds: ['B'] }
    ]
  })
);
assert('可创建油菜', !!(youcaiOk && youcaiOk.ok), youcaiOk && youcaiOk.reason);
var leftoverStore = memStorage();
leftoverStore.setItem('gb_side_games_v1', [
  rec.normalizeRecord({
    sideGameId: 'sg_skins',
    matchId: 'm1',
    groupId: 'g1',
    scope: 'group',
    ruleId: 'skins',
    ruleSnapshot: rec.buildRuleSnapshot('skins'),
    title: '旧狼和羊',
    participantParties: partiesOf('A', 'B', 'C', 'D'),
    visibility: 'group',
    createdBy: 'tester',
    revision: 1,
    status: 'active'
  })
]);
var leftoverRepo = localMod.createLocalSideGameRepository({
  storage: leftoverStore,
  clock: function () {
    return 2000;
  }
});
var leftover = leftoverRepo.getById('sg_skins');
assert('未完成实例仍可读', leftover.ok && leftover.data.ruleId === 'skins');
var leftoverUpd = leftoverRepo.update('sg_skins', leftover.data.revision, { title: '改名' });
assert('未完成实例禁止修改', !leftoverUpd.ok && leftoverUpd.reason === 'rule_unavailable');
var leftoverRef = leftoverRepo.refreshResult('sg_skins', makeHost());
assert('未完成实例禁止重算', !leftoverRef.ok && leftoverRef.reason === 'rule_unavailable');
var leftoverDel = leftoverRepo.remove('sg_skins', leftover.data.revision);
assert('未完成实例允许删除', leftoverDel.ok);

function walk(dir, acc) {
  acc = acc || [];
  fs.readdirSync(dir).forEach(function (name) {
    var abs = path.join(dir, name);
    if (fs.statSync(abs).isDirectory()) walk(abs, acc);
    else acc.push(abs);
  });
  return acc;
}
var pageStore = [];
var sessionHits = [];
var fake = [];
walk(gameRoot).forEach(function (abs) {
  if (!/\.(js|wxml)$/.test(abs)) return;
  var rel = path.relative(gameRoot, abs).replace(/\\/g, '/');
  var text = fs.readFileSync(abs, 'utf8');
  if (
    rel.indexOf('utils/localSideGameRepository.js') === 0 ||
    rel.indexOf('utils/localSideGameRuleLibrary.js') === 0 ||
    rel.indexOf('utils/localSideGameSettings.js') === 0 ||
    rel.indexOf('utils/rankMarkProjection.js') === 0
  ) {
    return;
  }
  if (/\bwx\.(get|set)StorageSync\b/.test(text)) pageStore.push(rel);
  if (/session\.js|gb-game-/.test(text)) sessionHits.push(rel);
  if (/阿凯|李雷|韩梅梅/.test(text) && rel.indexOf('utils/letter.js') !== 0) fake.push(rel);
});
assert('页面无直接 storage', pageStore.length === 0, pageStore.join(','));
assert('无 session/假数据', sessionHits.length === 0 && fake.length === 0, sessionHits.concat(fake).join(','));
assert(
  '无 cloudfunctions 目录依赖',
  !fs.existsSync(path.join(gameRoot, 'cloudfunctions')) &&
    fs.readFileSync(path.join(gameRoot, 'utils', 'sideGameRepository.js'), 'utf8').indexOf('cloudfunctions') < 0
);

assert(
  'pick-players 选择人员',
  /选择人员/.test(fs.readFileSync(path.join(gameRoot, 'pages', 'pick-players', 'index.wxml'), 'utf8'))
);
assert(
  'game-tab 添加游戏入口',
  fs.readFileSync(path.join(gameRoot, 'components', 'game-tab', 'index.wxml'), 'utf8').indexOf('添加游戏') >= 0
);
assert('门面 commitSetupDraft', typeof facade.commitSetupDraft === 'function');
assert('本机 commitSetupDraft', typeof repo.commitSetupDraft === 'function');

var hostBatch = makeHost();
var counted = memStorage();
var batchRepo = localMod.createLocalSideGameRepository({
  storage: counted,
  idGen: function () {
    return 'sg_batch_new';
  },
  clock: function () {
    return 2000;
  },
  settingsApi: {
    replace: function () {
      return true;
    }
  }
});
var committed = batchRepo.commitSetupDraft({
  matchId: 'm1',
  groupId: 'g1',
  scope: 'group',
  entry: 'score',
  expectedRevisions: {},
  settings: { privacy: 'public' },
  hostContext: hostBatch,
  creates: [
    createInput(hostBatch, {
      idempotencyKey: 'batch_new',
      title: '新游戏',
      sideGameId: 'sg_batch_new'
    })
  ],
  updates: [],
  removes: [],
  settleIds: ['sg_batch_new']
});
assert('批量提交成功', committed.ok, JSON.stringify(committed));
assert('批量后能读到新游戏', batchRepo.getById('sg_batch_new').ok);

var failSettingsRepo = localMod.createLocalSideGameRepository({
  storage: memStorage(),
  idGen: (function () {
    var n = 0;
    return function () {
      n += 1;
      return 'sg_failset_' + n;
    };
  })(),
  clock: function () {
    return 2100;
  },
  settingsApi: {
    replace: function () {
      return false;
    }
  }
});
var pre = failSettingsRepo.create(createInput(hostBatch, { idempotencyKey: 'pre_keep', title: '已有' }));
var failCommit = failSettingsRepo.commitSetupDraft({
  matchId: 'm1',
  groupId: 'g1',
  scope: 'group',
  entry: 'score',
  expectedRevisions: {},
  settings: { privacy: 'event' },
  hostContext: hostBatch,
  creates: [createInput(hostBatch, { idempotencyKey: 'should_not', title: '不应出现', sideGameId: 'sg_should_not' })],
  updates: [],
  removes: [],
  settleIds: []
});
assert('设置失败则整批失败', !failCommit.ok && failCommit.reason === 'settings_write_failed');
assert('设置失败不留下新游戏', !failSettingsRepo.getById('sg_should_not').ok);
assert('设置失败原游戏仍在', failSettingsRepo.getById(pre.data.sideGameId).ok);

identity.setImplementation(savedIdentity);
entitlement.setImplementation(savedEnt);
facade.setImplementation(savedRepo);

console.log('\nsideGameRepository.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
