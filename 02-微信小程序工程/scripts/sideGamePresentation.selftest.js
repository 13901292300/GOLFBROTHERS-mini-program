/**
 * 游戏模块人员昵称/头像展示一致性。
 * 运行：node scripts/sideGamePresentation.selftest.js
 */
var fs = require('fs');
var path = require('path');

if (typeof global.wx !== 'object') {
  global.wx = {
    getStorageSync: function () {
      return null;
    },
    setStorageSync: function () {},
    showToast: function () {}
  };
}

var rec = require('../miniprogram/subpackages/game/utils/sideGameRecord.js');
var identity = require('../miniprogram/subpackages/game/utils/sideGameIdentityProvider.js');
var localMod = require('../miniprogram/subpackages/game/utils/localSideGameRepository.js');
var facade = require('../miniprogram/subpackages/game/utils/sideGameRepository.js');
var hostMod = require('../miniprogram/subpackages/game/utils/gameHostContext.js');
var hostSession = require('../miniprogram/subpackages/game/utils/sideGameHostSession.js');
var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');
var bind = require('../miniprogram/subpackages/game/utils/sideGameBind.js');
var mockAvatars = require('../miniprogram/utils/mockAvatars.js');

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

function memStorage() {
  var bag = {};
  return {
    getItem: function (key) {
      return bag[key];
    },
    setItem: function (key, value) {
      bag[key] = JSON.parse(JSON.stringify(value));
      return true;
    }
  };
}

function filled18(n) {
  var a = [];
  var i;
  for (i = 0; i < 18; i++) a.push(n);
  return a;
}

function hostHoleOrder() {
  var out = [];
  var i;
  for (i = 1; i <= 9; i++) out.push('C' + i);
  for (i = 1; i <= 9; i++) out.push('D' + i);
  return out;
}

function makeHost(opts) {
  var holeOrder = hostHoleOrder();
  var pars = {};
  holeOrder.forEach(function (h) {
    pars[h] = 4;
  });
  var players = opts.players || [];
  var parties = opts.parties || players.map(function (p) {
    return {
      partyId: p.playerId,
      partyType: 'player',
      displayName: p.displayName,
      memberPlayerIds: [p.playerId],
      groupId: 'g1',
      avatar: p.avatar
    };
  });
  var official = {};
  players.forEach(function (p) {
    var holes = {};
    holeOrder.forEach(function (label) {
      holes[label] = { score: 4 };
    });
    official[p.playerId] = { holes: holes };
  });
  var ctx = hostMod.emptyContext({
    matchId: opts.matchId || 'm-pres',
    groupId: 'g1',
    scope: 'group',
    revision: 'r1',
    holeContextReady: true,
    holeOrder: holeOrder,
    pars: pars,
    players: players,
    scoreParties: parties,
    officialScoresByPartyId: official
  });
  return hostMod.buildPresentation(ctx);
}

function installRepo() {
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
        return 'pres_' + n;
      };
    })(),
    clock: function () {
      return 3000;
    }
  });
  facade.setImplementation(repo);
  return repo;
}

function attach(host) {
  hostSession.clearHostContext();
  hostSession.setHostContext(host);
  bind.attachHost(host);
}

function stroke2(players, pairings) {
  return {
    catalogId: 'stroke-2',
    name: '比杆',
    players: players,
    pairings: pairings,
    holes: catalog.HOLES.map(function (label) {
      return { label: label, on: true };
    }),
    holeOrder: catalog.HOLES.slice(),
    multiplier: 1,
    ruleSnapshot: rec.buildRuleSnapshot('stroke-2')
  };
}

function walk(dir, acc) {
  acc = acc || [];
  fs.readdirSync(dir).forEach(function (name) {
    var abs = path.join(dir, name);
    if (fs.statSync(abs).isDirectory()) walk(abs, acc);
    else acc.push(abs);
  });
  return acc;
}

var AV_A = 'https://cdn.example.com/a.jpg';
var AV_B = 'https://cdn.example.com/b.jpg';
var AV_C = 'https://cdn.example.com/c.jpg';
var AV_KA = 'https://cdn.example.com/ka.jpg';
var AV_KB = 'https://cdn.example.com/kb.jpg';

installRepo();

var host1 = makeHost({
  players: [
    { playerId: 'pA', displayName: '甲', avatar: AV_A, groupId: 'g1' },
    { playerId: 'pB', displayName: '乙', avatar: AV_B, groupId: 'g1' }
  ]
});
attach(host1);

var created = bind.addGame(
  'score',
  stroke2(
    [
      { id: 'pA', name: '旧名', avatar: 'https://stale/old.jpg' },
      { id: 'pB', name: '旧乙' }
    ],
    [{ id: 'pair-ab', leftId: 'pA', rightId: 'pB', on: true, strokes: 0 }]
  )
);
assert('创建实例', !!(created && created.id));

var roster = bind.listPlayers('score');
var board = bind.listBoard('score', created.id);
var game = bind.getGame('score', created.id);
var pair = (game.pairings || [])[0] || {};
var names = {
  pick: roster.find(function (p) { return p.id === 'pA'; }).name,
  board: (board.players || []).find(function (p) { return p.id === 'pA'; }).name,
  pair: pair.leftName,
  list: bind.presentPerson('pA').name
};
assert(
  '1 同一球员昵称一致',
  names.pick === '甲' && names.board === '甲' && names.pair === '甲' && names.list === '甲',
  JSON.stringify(names)
);

var avatars = {
  pick: roster.find(function (p) { return p.id === 'pA'; }).avatar,
  board: (board.players || []).find(function (p) { return p.id === 'pA'; }).avatar,
  pair: pair.leftAvatar,
  list: bind.presentPerson('pA').avatar
};
assert(
  '2 同一球员头像一致',
  avatars.pick === AV_A && avatars.board === AV_A && avatars.pair === AV_A && avatars.list === AV_A,
  JSON.stringify(avatars)
);

var sameNameHost = makeHost({
  matchId: 'm-same',
  players: [
    { playerId: 'id1', displayName: '同名', avatar: AV_A, groupId: 'g1' },
    { playerId: 'id2', displayName: '同名', avatar: AV_B, groupId: 'g1' }
  ]
});
attach(sameNameHost);
assert(
  '3 同名不同 ID 不串头像',
  bind.presentPerson('id1').avatar === AV_A && bind.presentPerson('id2').avatar === AV_B
);

assert(
  '4 avatar 字段解析',
  hostMod.resolveOfficialAvatar({ avatar: AV_A }) === AV_A
);
assert(
  '4 avatarUrl 字段解析',
  hostMod.resolveOfficialAvatar({ avatarUrl: AV_B }) === AV_B
);
assert(
  '4 profile.avatar 解析',
  hostMod.resolveOfficialAvatar({ profile: { avatar: AV_C } }) === AV_C
);
assert(
  '4 空值走正式默认头像',
  hostMod.resolveOfficialAvatar({}) === mockAvatars.DEFAULT_AVATAR &&
    hostMod.officialDefaultAvatar() === mockAvatars.DEFAULT_AVATAR
);

var comboHost = makeHost({
  matchId: 'm-combo',
  players: [
    { playerId: 'u1', displayName: '凯', avatar: AV_KA, groupId: 'g1' },
    { playerId: 'u2', displayName: '雷', avatar: AV_KB, groupId: 'g1' }
  ]
});
comboHost.scoreParties = [
  {
    partyId: 'combo-1',
    partyType: 'combination',
    displayName: '红队组合',
    memberPlayerIds: ['u1', 'u2'],
    groupId: 'g1'
  }
];
comboHost = hostMod.buildPresentation(comboHost);
assert(
  '5 combination 真实成员头像',
  comboHost.partyPresentationById['combo-1'].members[0].avatar === AV_KA &&
    comboHost.partyPresentationById['combo-1'].members[1].avatar === AV_KB &&
    comboHost.partyPresentationById['combo-1'].displayName === '红队组合'
);
comboHost.partyPresentationById['combo-1'].displayName = '被污染';
assert(
  '5 映射 JSON 深拷贝不污染 Host',
  hostMod.buildPresentation(JSON.parse(JSON.stringify(comboHost))).partyPresentationById['combo-1'] &&
    comboHost.scoreParties[0].displayName === '红队组合'
);

var sideHost = makeHost({
  matchId: 'm-side',
  players: [
    { playerId: 's1', displayName: '侧甲', avatar: AV_A, groupId: 'g1' },
    { playerId: 's2', displayName: '侧乙', avatar: AV_B, groupId: 'g1' }
  ]
});
sideHost.scoreParties = [
  {
    partyId: 'side-1',
    partyType: 'side',
    displayName: '蓝方',
    memberPlayerIds: ['s1', 's2'],
    groupId: 'g1'
  }
];
sideHost = hostMod.buildPresentation(sideHost);
attach(sideHost);
var sideFace = bind.presentPerson('side-1');
assert(
  '6 side 显示真实成员昵称',
  sideFace.name === '蓝方' &&
    sideFace.members[0].displayName === '侧甲' &&
    sideFace.members[1].displayName === '侧乙'
);

attach(host1);
var persisted = facade.getById(created.id);
var inst = persisted.ok && persisted.data.config && persisted.data.config.instance;
assert('7 持久化含 instance', !!(inst && inst.players && inst.players.length));
assert(
  '7 config 玩家不把昵称当权威',
  inst.players.every(function (p) {
    return p.id && p.name == null && p.avatar == null && p.initial == null;
  }),
  JSON.stringify(inst.players)
);
assert(
  '7 pairings 不保存展示字段',
  (inst.pairings || []).every(function (p) {
    return p.leftId && p.rightId && p.leftName == null && p.leftAvatar == null && p.leftInitial == null;
  })
);

var hostRemap = makeHost({
  matchId: 'm-pres',
  players: [
    { playerId: 'pC', displayName: '丙', avatar: AV_C, groupId: 'g1' },
    { playerId: 'pB', displayName: '乙', avatar: AV_B, groupId: 'g1' }
  ]
});
attach(hostRemap);
var afterFix = bind.updateGame('score', created.id, {
  players: [{ id: 'pC' }, { id: 'pB' }],
  pairings: [{ id: 'pair-cb', leftId: 'pC', rightId: 'pB', on: true, strokes: 0 }]
});
var boardFix = bind.listBoard('score', created.id);
var faceC = bind.presentPerson('pC');
assert(
  '8 ID 纠正后全界面展示 C',
  faceC.name === '丙' &&
    faceC.avatar === AV_C &&
    (boardFix.players || []).some(function (p) {
      return p.id === 'pC' && p.name === '丙' && p.avatar === AV_C;
    }) &&
    !(boardFix.players || []).some(function (p) {
      return p.id === 'pA';
    }) &&
    afterFix &&
    afterFix.players.some(function (p) {
      return p.id === 'pC' && p.name === '丙';
    })
);

hostSession.clearHostContext();
var hostOther = makeHost({
  matchId: 'm-other',
  players: [{ playerId: 'pZ', displayName: '另一场', avatar: AV_B, groupId: 'g1' }]
});
attach(hostOther);
var leaked = bind.presentPerson('pA');
assert(
  '9 换 matchId 不串上一场人员',
  leaked.name !== '甲' && leaked.name !== '甲' && leaked.avatar !== AV_A,
  leaked.name + ' ' + leaked.avatar
);
assert(
  '9 缺 ID 用正式默认头像',
  leaked.avatar === mockAvatars.DEFAULT_AVATAR
);

var gameRoot = path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game');
var uiHits = [];
var fakeHits = [];
walk(gameRoot).forEach(function (abs) {
  if (!/\.(js|wxml)$/.test(abs)) return;
  var rel = path.relative(gameRoot, abs).replace(/\\/g, '/');
  if (/^utils\/settle/.test(rel) || rel === 'utils/letter.js') return;
  var text = fs.readFileSync(abs, 'utf8');
  if (/\.(wxml)$/.test(abs) && /\{\{[^}]*[Ii]nitial\}\}/.test(text)) {
    uiHits.push(rel);
  }
  if (/\.(js)$/.test(abs) && /pages\/|components\//.test(rel) && /scorePlayerInitial|hcapLeftInitial|leftInitial\s*:/.test(text)) {
    uiHits.push(rel);
  }
  if (/阿凯|李雷|韩梅梅|槽位\s*\d|PLAYERS_SCORE/.test(text)) fakeHits.push(rel);
});
assert('10 UI 无 initial 占位', uiHits.length === 0, uiHits.join(','));
assert('10 无沙盒假姓名', fakeHits.length === 0, fakeHits.join(','));

assert(
  'presentPerson 不按昵称反查',
  bind.presentPerson('甲').id === '甲' && bind.presentPerson('甲').id !== 'pA'
);

function comboParties() {
  return [
    {
      partyId: 'combo-1',
      partyType: 'combination',
      displayName: '红队组合',
      memberPlayerIds: ['u1', 'u2'],
      groupId: 'g1'
    },
    {
      partyId: 'combo-2',
      partyType: 'combination',
      displayName: '蓝队组合',
      memberPlayerIds: ['u3', 'u4'],
      groupId: 'g1'
    }
  ];
}

var comboCreateHost = makeHost({
  matchId: 'm-combo-create',
  players: [
    { playerId: 'u1', displayName: '凯', avatar: AV_KA, groupId: 'g1' },
    { playerId: 'u2', displayName: '雷', avatar: AV_KB, groupId: 'g1' },
    { playerId: 'u3', displayName: '同名', avatar: AV_A, groupId: 'g1' },
    { playerId: 'u4', displayName: '同名', avatar: AV_B, groupId: 'g1' }
  ]
});
comboCreateHost.scoreParties = comboParties();
comboCreateHost = hostMod.buildPresentation(comboCreateHost);
attach(comboCreateHost);

var comboCards = bind.listPlayers('score');
var card1 = comboCards.find(function (p) { return p.id === 'combo-1'; });
var card2 = comboCards.find(function (p) { return p.id === 'combo-2'; });
assert('C1 两人 combination 候选仍一张卡', comboCards.length === 2 && !!card1 && !!card2);
assert(
  'C1 两个真实头像',
  card1.faceKind === 'pair' &&
    card1.members.length === 2 &&
    card1.members[0].avatar === AV_KA &&
    card1.members[1].avatar === AV_KB,
  JSON.stringify(card1.members)
);
assert(
  'C2 两个真实昵称',
  card1.members[0].displayName === '凯' &&
    card1.members[1].displayName === '雷' &&
    card1.members[0].displayName !== card1.name
);
assert('C3 点击区域仍是 partyId', card1.id === 'combo-1' && card1.partyType === 'combination');
assert(
  'C4 requiredPartyCount 仍按方',
  rec.capOf('stroke-2').requiredPartyCount === 2 && comboCards.length === 2
);

var comboGame = bind.addGame(
  'score',
  stroke2(
    [{ id: 'combo-1' }, { id: 'combo-2' }],
    [{ id: 'pair-c', leftId: 'combo-1', rightId: 'combo-2', on: true, strokes: 0 }]
  )
);
assert('C3 保存两方 combination', !!(comboGame && comboGame.players && comboGame.players.length === 2));
assert(
  'C5 配置已选仍双人',
  comboGame.players[0].faceKind === 'pair' &&
    comboGame.players[0].members[0].avatar === AV_KA &&
    comboGame.players[0].members[1].displayName === '雷'
);
var comboPair = (comboGame.pairings || [])[0] || {};
assert(
  'C6 对决不退回第一成员',
  comboPair.leftFace &&
    comboPair.leftFace.faceKind === 'pair' &&
    comboPair.leftFace.members[1].avatar === AV_KB &&
    comboPair.rightFace.members[0].avatar === AV_A &&
    comboPair.rightFace.members[1].avatar === AV_B
);

var sameNameFaces = bind.presentPerson('combo-2');
assert(
  'C8 同名不同 ID 头像不串',
  sameNameFaces.members[0].displayName === '同名' &&
    sameNameFaces.members[1].displayName === '同名' &&
    sameNameFaces.members[0].avatar === AV_A &&
    sameNameFaces.members[1].avatar === AV_B &&
    sameNameFaces.members[0].playerId === 'u3'
);

var comboReload = bind.getGame('score', comboGame.id);
assert(
  'C7 修改游戏回显完整组合',
  comboReload.players[0].members.length === 2 &&
    comboReload.players[0].members[0].displayName === '凯' &&
    comboReload.pairings[0].leftFace.members[1].displayName === '雷'
);

var comboFixHost = makeHost({
  matchId: 'm-combo-create',
  players: [
    { playerId: 'u1', displayName: '凯改', avatar: AV_C, groupId: 'g1' },
    { playerId: 'u2', displayName: '雷改', avatar: AV_B, groupId: 'g1' },
    { playerId: 'u3', displayName: '同名', avatar: AV_A, groupId: 'g1' },
    { playerId: 'u4', displayName: '同名', avatar: AV_KB, groupId: 'g1' }
  ]
});
comboFixHost.scoreParties = comboParties();
comboFixHost = hostMod.buildPresentation(comboFixHost);
attach(comboFixHost);
var afterComboFix = bind.getGame('score', comboGame.id);
assert(
  'C9 ID 纠正后成员展示更新',
  afterComboFix.players[0].members[0].displayName === '凯改' &&
    afterComboFix.players[0].members[0].avatar === AV_C &&
    afterComboFix.players[0].members[1].displayName === '雷改'
);

attach(host1);
var playerFace = bind.presentPerson('pA');
assert(
  'C10 player party 仍单头像单昵称',
  playerFace.faceKind === 'single' &&
    playerFace.members.length === 1 &&
    playerFace.name === '甲' &&
    playerFace.avatar === AV_A
);

var sideManyHost = makeHost({
  matchId: 'm-side-many',
  players: [
    { playerId: 's1', displayName: '侧甲', avatar: AV_A, groupId: 'g1' },
    { playerId: 's2', displayName: '侧乙', avatar: AV_B, groupId: 'g1' },
    { playerId: 's3', displayName: '侧丙', avatar: AV_C, groupId: 'g1' }
  ]
});
sideManyHost.scoreParties = [
  {
    partyId: 'side-3',
    partyType: 'side',
    displayName: '蓝方',
    memberPlayerIds: ['s1', 's2', 's3'],
    groupId: 'g1'
  }
];
sideManyHost = hostMod.buildPresentation(sideManyHost);
attach(sideManyHost);
var sideMany = bind.listPlayers('score');
assert(
  'C11 side 多人仍一张卡',
  sideMany.length === 1 &&
    sideMany[0].id === 'side-3' &&
    sideMany[0].faceKind === 'stack' &&
    sideMany[0].members.length === 3
);

var persistedCombo = facade.getById(comboGame.id);
var comboInst = persistedCombo.ok && persistedCombo.data.config && persistedCombo.data.config.instance;
assert(
  'config 不把组合头像当权威',
  comboInst &&
    comboInst.players.every(function (p) {
      return p.id && p.avatar == null && p.members == null && p.faceKind == null;
    })
);

if (typeof global.Component !== 'function') {
  global.Component = function (opt) {
    global.__PartyFaceDef = opt;
  };
} else {
  var prevComponent = global.Component;
  global.Component = function (opt) {
    global.__PartyFaceDef = opt;
    if (typeof prevComponent === 'function') prevComponent(opt);
  };
}
require('../miniprogram/subpackages/game/components/party-face/index.js');
var faceDef = global.__PartyFaceDef;
assert('party-face properties.layout 保留', !!(faceDef && faceDef.properties && faceDef.properties.layout));
assert('party-face data 无同名 layout', faceDef && faceDef.data && !Object.prototype.hasOwnProperty.call(faceDef.data, 'layout'));
assert('party-face data.resolvedLayout', faceDef.data.resolvedLayout === 'slot');

function applyFace(party, layout) {
  var inst = {
    properties: { party: party || {}, layout: layout || 'slot' },
    data: Object.assign({}, faceDef.data),
    setData: function (patch) {
      Object.assign(this.data, patch);
    }
  };
  faceDef.observers['party, layout'].call(inst);
  return inst.data;
}

var singleView = applyFace(
  { partyType: 'player', faceKind: 'single', name: '甲', avatar: AV_A },
  'slot'
);
assert('player 单头像布局', singleView.kind === 'single' && singleView.resolvedLayout === 'slot' && !Object.prototype.hasOwnProperty.call(singleView, 'layout'));

var pairView = applyFace(
  {
    partyType: 'combination',
    faceKind: 'pair',
    members: [
      { playerId: 'pA', displayName: '甲', avatar: AV_A },
      { playerId: 'pB', displayName: '乙', avatar: AV_B }
    ]
  },
  'pair'
);
assert('combination 双头像布局', pairView.kind === 'pair' && pairView.members.length === 2 && pairView.resolvedLayout === 'pair');

var stackView = applyFace(
  {
    partyType: 'side',
    faceKind: 'stack',
    members: [
      { playerId: 's1', displayName: '侧甲', avatar: AV_A },
      { playerId: 's2', displayName: '侧乙', avatar: AV_B },
      { playerId: 's3', displayName: '侧丙', avatar: AV_C }
    ]
  },
  'board'
);
assert('side 叠放布局', stackView.kind === 'stack' && stackView.stackCount === 3 && stackView.resolvedLayout === 'board' && stackView.faceMode === 'spread');

var compactView = applyFace({ faceKind: 'single', name: '甲' }, 'compact');
var switched = applyFace({ faceKind: 'single', name: '甲' }, 'sheet');
assert('动态切换 layout', compactView.resolvedLayout === 'compact' && compactView.showNames === true && switched.resolvedLayout === 'sheet' && switched.showNames === true);

var faceJs = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/subpackages/game/components/party-face/index.js'), 'utf8');
var faceWxml = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/subpackages/game/components/party-face/index.wxml'), 'utf8');
assert('observer 读 properties.layout', /this\.properties\.layout/.test(faceJs) && /resolvedLayout/.test(faceJs));
assert('WXML 使用 resolvedLayout', /party-face--\{\{resolvedLayout\}\}/.test(faceWxml));
assert('不再写回同名 layout', !/setData\(\s*\{\s*layout/.test(faceJs));

console.log('\nsideGamePresentation.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
