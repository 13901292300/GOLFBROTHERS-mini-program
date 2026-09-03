/**
 * 正式 HostContext 内存桥：跨页人员上下文。
 * 运行：node scripts/sideGameHostSession.selftest.js
 */
var hostSession = require('../miniprogram/subpackages/game/utils/sideGameHostSession.js');
var bind = require('../miniprogram/subpackages/game/utils/sideGameBind.js');
var fs = require('fs');
var path = require('path');

if (typeof global.wx !== 'object') {
  global.wx = {
    showToast: function () {},
    navigateBack: function () {},
    getStorageSync: function () {
      return null;
    },
    setStorageSync: function () {}
  };
}
if (typeof global.getCurrentPages !== 'function') {
  global.getCurrentPages = function () {
    return [{ route: 'a' }, { route: 'b' }];
  };
}

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

hostSession.clearHostContext();

var ctxG1 = {
  matchId: 'm1',
  groupId: 'g1',
  scope: 'group',
  scoreParties: [
    { partyId: 'A', displayName: '张三', partyType: 'player', groupId: 'g1', memberPlayerIds: ['A'] },
    { partyId: 'B', displayName: '李四', partyType: 'player', groupId: 'g1', memberPlayerIds: ['B'] }
  ]
};
var ctxG1Four = {
  matchId: 'm1',
  groupId: 'g1',
  scope: 'group',
  scoreParties: [
    { partyId: 'A', displayName: '甲', partyType: 'player', groupId: 'g1', memberPlayerIds: ['A'] },
    { partyId: 'B', displayName: '乙', partyType: 'player', groupId: 'g1', memberPlayerIds: ['B'] },
    { partyId: 'C', displayName: '丙', partyType: 'player', groupId: 'g1', memberPlayerIds: ['C'] },
    { partyId: 'D', displayName: '丁', partyType: 'player', groupId: 'g1', memberPlayerIds: ['D'] },
    { partyId: 'X', displayName: '他组', partyType: 'player', groupId: 'g2', memberPlayerIds: ['X'] }
  ]
};
var ctxMatch = {
  matchId: 'm1',
  groupId: '',
  scope: 'match',
  scoreParties: [
    { partyId: 'A', displayName: '张三', partyType: 'player', groupId: 'g1', memberPlayerIds: ['A'] },
    { partyId: 'X', displayName: '他组', partyType: 'player', groupId: 'g2', memberPlayerIds: ['X'] },
    { partyId: 'side-red', displayName: '红队', partyType: 'side', groupId: 'g2', memberPlayerIds: ['X'] }
  ]
};
var ctxM2 = {
  matchId: 'm2',
  groupId: 'g1',
  scope: 'group',
  scoreParties: [{ partyId: 'Z', displayName: '下一场', partyType: 'player', groupId: 'g1', memberPlayerIds: ['Z'] }]
};

assert('写入需 matchId', hostSession.setHostContext({ groupId: 'g1', scoreParties: [] }) === false);
hostSession.setHostContext(ctxG1);
bind.attachHost({ matchId: 'm1', groupId: 'g1', scope: 'group' });
var two = bind.listPlayers('score');
assert(
  '记分页两名同组真人',
  two.length === 2 && two[0].name === '张三' && two[1].name === '李四',
  JSON.stringify(two.map(function (p) { return p.name; }))
);
assert('记分页不含他组', two.every(function (p) { return p.id !== 'X'; }));

hostSession.setHostContext(ctxG1Four);
bind.attachHost({ matchId: 'm1', groupId: 'g1', scope: 'group' });
var four = bind.listPlayers('score');
assert('四人组四人且无他组', four.length === 4 && four.every(function (p) { return p.id !== 'X'; }));

hostSession.setHostContext(ctxMatch);
bind.attachHost({ matchId: 'm1', groupId: '', scope: 'match' });
var all = bind.listPlayers('match');
assert(
  'Hub/详情全场',
  all.length === 3 && all.some(function (p) { return p.name === '他组'; }) && all.some(function (p) { return p.partyType === 'side'; })
);

bind.attachHost({ matchId: 'm1', groupId: 'g1', scope: 'group' });
hostSession.setHostContext(ctxG1);
var hop1 = bind.listPlayers('score');
bind.attachHost({ matchId: 'm1', groupId: 'g1', scope: 'group' });
var hop2 = bind.listPlayers('score');
assert('多次 attach 人员仍在', hop1.length === 2 && hop2.length === 2 && hop2[0].name === '张三');

hostSession.setHostContext(ctxM2);
bind.attachHost({ matchId: 'm2', groupId: 'g1', scope: 'group' });
var next = bind.listPlayers('score');
assert('换 matchId 不串场', next.length === 1 && next[0].name === '下一场');

hostSession.clearHostContext();
bind.attachHost({ matchId: 'm1', groupId: 'g1', scope: 'group' });
var afterClear = bind.listPlayers('score');
assert('清空后无旧名单', afterClear.length === 0);
assert('无假人员兜底', afterClear.every(function (p) { return String(p.name).indexOf('阿凯') < 0 && String(p.id).indexOf('slot-') < 0; }));

hostSession.setHostContext({
  matchId: 'm1',
  groupId: 'g1',
  scope: 'group',
  scoreParties: [
    {
      partyId: 'combo-1',
      displayName: '红队组合',
      partyType: 'combination',
      groupId: 'g1',
      memberPlayerIds: ['A', 'B']
    }
  ]
});
bind.attachHost({ matchId: 'm1', groupId: 'g1', scope: 'group' });
var comboCards = bind.listPlayers('score');
assert(
  '组合一张卡真实成员',
  comboCards.length === 1 &&
    comboCards[0].name === '红队组合' &&
    comboCards[0].partyType === 'combination' &&
    comboCards[0].memberPlayerIds.join(',') === 'A,B'
);

var missing = bind.ensureHost({ matchId: 'ghost', groupId: 'g1', scope: 'group' });
assert('深链无上下文返回空', missing == null);

var src = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game', 'utils', 'sideGameHostSession.js'),
  'utf8'
);
assert('桥不读 storage', src.indexOf('Storage') < 0 && src.indexOf('session.js') < 0);
assert('桥无假人员', src.indexOf('阿凯') < 0 && src.indexOf('PLAYERS_SCORE') < 0);

console.log('sideGameHostSession.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
