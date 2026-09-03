/**
 * 实例配置页：投影回填不得误判 dirty。
 * 运行：node scripts/gameConfigLeaveFalseDirty.selftest.js
 */
var snap = require('../miniprogram/subpackages/game/utils/sideGameConfigSnapshot.js');
var guard = require('../miniprogram/subpackages/game/utils/sideGameConfigGuard.js');
var hostMod = require('../miniprogram/subpackages/game/utils/gameHostContext.js');
var hostSession = require('../miniprogram/subpackages/game/utils/sideGameHostSession.js');
var bind = require('../miniprogram/subpackages/game/utils/sideGameBind.js');
var catalog = require('../miniprogram/subpackages/game/utils/catalog.js');
var identity = require('../miniprogram/subpackages/game/utils/sideGameIdentityProvider.js');
var localMod = require('../miniprogram/subpackages/game/utils/localSideGameRepository.js');
var facade = require('../miniprogram/subpackages/game/utils/sideGameRepository.js');
var settingsMod = require('../miniprogram/subpackages/game/utils/localSideGameSettings.js');

if (typeof global.wx !== 'object') {
  global.wx = {
    getStorageSync: function () { return null; },
    setStorageSync: function () {},
    showToast: function () {},
    showModal: function (opt) {
      global.__lastModal = opt;
      if (opt && opt.success) opt.success({ confirm: !!global.__modalConfirm });
    },
    enableAlertBeforeUnload: function (opt) {
      global.__unloadAlert = opt && opt.message;
    },
    disableAlertBeforeUnload: function () {
      global.__unloadAlert = null;
    },
    navigateBack: function () {
      global.__navBack = (global.__navBack || 0) + 1;
    }
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

identity.setImplementation({
  implementation: 'test',
  getCurrentUserId: function () {
    return 'tester';
  }
});

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

facade.setImplementation(
  localMod.createLocalSideGameRepository({
    storage: memStorage(),
    settingsApi: settingsMod.createLocalSideGameSettings({ storage: memStorage() }),
    idGen: (function () {
      var n = 0;
      return function () {
        n += 1;
        return 'fd_' + n;
      };
    })()
  })
);

function makeHost() {
  return hostMod.buildPresentation(
    hostMod.emptyContext({
      matchId: 'm-fd',
      groupId: 'g1',
      scope: 'group',
      revision: 'r1',
      holeContextReady: true,
      holeOrder: catalog.HOLES.slice(),
      pars: catalog.defaultHolePars(),
      allowBigPot: true,
      canEditSideGames: true,
      currentUserId: 'tester',
      players: [
        { playerId: 'A', displayName: '张三', groupId: 'g1' },
        { playerId: 'B', displayName: '李四', groupId: 'g1' }
      ],
      scoreParties: [
        {
          partyId: 'entity-1',
          partyType: 'combination',
          displayName: 'Team 1',
          memberPlayerIds: ['A', 'B'],
          groupId: 'g1'
        },
        {
          partyId: 'entity-2',
          partyType: 'combination',
          displayName: 'Team 2',
          memberPlayerIds: ['A', 'B'],
          groupId: 'g1'
        }
      ]
    })
  );
}

hostSession.clearHostContext();
hostSession.setHostContext(makeHost());
bind.attachHost(makeHost());

var before = {
  ruleId: 'three-set',
  showThreeSet: true,
  segmentValues: { front: '1', back: '1', overall: '1' },
  multiplier: 1,
  players: [
    {
      id: 'entity-1',
      partyId: 'entity-1',
      name: 'Team 1',
      displayName: 'Team 1',
      partyType: 'combination',
      memberPlayerIds: ['A', 'B'],
      selected: true
    }
  ],
  pairs: [
    {
      id: 'entity-1|entity-2',
      leftId: 'entity-1',
      rightId: 'entity-2',
      on: true,
      strokes: '0'
    }
  ]
};

var afterFace = {
  ruleId: 'three-set',
  showThreeSet: true,
  segmentValues: { front: '1', back: '1', overall: '1' },
  multiplier: 1,
  players: [
    {
      id: 'entity-1',
      partyId: 'entity-1',
      subjectId: 'entity-1',
      subjectType: 'combo',
      useSubjectName: true,
      name: '张三/李四',
      displayName: '张三/李四',
      partyType: 'combination',
      faceKind: 'pair',
      avatarModel: { kind: 'pair' },
      members: [
        { playerId: 'A', displayName: '张三' },
        { playerId: 'B', displayName: '李四' }
      ],
      memberPlayerIds: ['A', 'B'],
      memberNames: ['张三', '李四'],
      memberAvatars: ['a', 'b'],
      selected: true
    }
  ],
  pairs: [
    {
      id: 'entity-1|entity-2',
      leftId: 'entity-1',
      rightId: 'entity-2',
      leftName: '张三/李四',
      rightName: '张三/李四',
      leftFace: { id: 'entity-1', name: '张三/李四' },
      rightFace: { id: 'entity-2', name: '张三/李四' },
      on: true,
      strokes: '0'
    }
  ]
};

assert(
  '投影前后业务快照相等',
  snap.deepEqual(
    snap.buildInstanceConfigSnapshot(before),
    snap.buildInstanceConfigSnapshot(afterFace)
  )
);
assert(
  'showThreeSet 不进入业务快照',
  !Object.prototype.hasOwnProperty.call(snap.buildInstanceConfigSnapshot(before), 'showThreeSet')
);

var page = {
  data: JSON.parse(JSON.stringify(before)),
  setData: function (patch, cb) {
    Object.assign(this.data, patch || {});
    if (cb) cb.call(this);
  }
};

guard.attach(page, {
  getBusiness: function (p) {
    return snap.buildInstanceConfigSnapshot(p.data || {});
  }
});
page._captureInitialSnapshot();
assert('进入后不 dirty', page._isDirty() === false);

page._guardHydrating = true;
page.setData(
  {
    players: afterFace.players,
    pairs: afterFace.pairs
  },
  function () {
    try {
      page._rebuildInitialIfPristine();
    } finally {
      page._guardHydrating = false;
    }
  }
);
assert('onShow 投影回填后仍不 dirty', page._isDirty() === false);
assert('系统回填后未启用 unload 拦截', global.__unloadAlert == null);

page.setData({ segmentValues: { front: '2', back: '1', overall: '1' } });
assert('修改三局前九后 dirty', page._isDirty() === true);
assert('真实修改后启用 unload 拦截', !!global.__unloadAlert);

page.setData({ segmentValues: { front: '1', back: '1', overall: '1' } });
assert('改回原值不 dirty', page._isDirty() === false);

page.setData({ pairFold: true });
assert('折叠不 dirty', page._isDirty() === false);

global.__lastModal = null;
global.__navBack = 0;
global.__modalConfirm = false;
page._leaveIfClean(function () {
  global.__navBack += 1;
});
assert('无修改返回不弹窗', !global.__lastModal && global.__navBack === 1);

page.setData({ multiplier: '9' });
global.__lastModal = null;
global.__navBack = 0;
page._leaveIfClean(function () {
  global.__navBack += 1;
});
assert('修改后返回弹一次', !!(global.__lastModal && /放弃修改/.test(global.__lastModal.title || '')) && global.__navBack === 0);

console.log('\ngameConfigLeaveFalseDirty.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
