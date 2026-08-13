/**
 * F1：match-payment-management-sheet 抽取回归
 * 运行：node scripts/matchPaymentManagementSheet.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var utilsDir = path.join(mini, 'utils');
var compDir = path.join(mini, 'components', 'match-payment-management-sheet');
var detailDir = path.join(
  mini,
  'subpackages',
  'tournament',
  'pages',
  'detail'
);
var seriesDir = path.join(
  mini,
  'subpackages',
  'tournament',
  'pages',
  'series-detail'
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

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

var compJs = read(path.join(compDir, 'index.js'));
var compWxml = read(path.join(compDir, 'index.wxml'));
var detailJs = read(path.join(detailDir, 'index.js'));
var detailWxml = read(path.join(detailDir, 'index.wxml'));
var detailJson = read(path.join(detailDir, 'index.json'));
var seriesJson = read(path.join(seriesDir, 'index.json'));
var seriesWxml = read(path.join(seriesDir, 'index.wxml'));
var seriesJs = read(path.join(seriesDir, 'index.js'));

assert('1 component exists', !!(compJs && compWxml));
assert('2 title 收费管理', compWxml.indexOf('收费管理') >= 0 && compWxml.indexOf('SHARED') < 0);
assert(
  '3 instant-save copy',
  compWxml.indexOf('修改后即时保存，关闭面板不会撤销已保存内容。') >= 0
);
assert('4 roundSubtitle optional', compWxml.indexOf('wx:if="{{roundSubtitle}}"') >= 0);
assert('5 no cancel/save footer', compWxml.indexOf('register-sheet__cancel') < 0);
assert('6 freeze targetMatchId', compJs.indexOf('this._targetMatchId = matchId') >= 0);
assert('7 uses buildPaymentDraftUsers', /buildPaymentDraftUsers/.test(compJs));
assert('8 writes paymentLogs', /appendPaymentLogs/.test(compJs));
assert(
  '9 detail registers component',
  detailJson.indexOf('match-payment-management-sheet') >= 0
);
assert(
  '10 detail uses shared sheet once',
  (detailWxml.match(/<match-payment-management-sheet/g) || []).length === 1
);
assert(
  '11 detail no inline payment DOM',
  detailWxml.indexOf('class="bottom-sheet register-sheet payment-sheet"') < 0 &&
    detailWxml.indexOf('bindtap="closePaymentSheet"') < 0 &&
    detailWxml.indexOf('bindtap="onPaymentConfirmedTap"') < 0 &&
    detailWxml.indexOf('LEGACY') < 0
);
assert(
  '12 detail thin open',
  /openPaymentSheet\(\)\s*\{[\s\S]*?showPaymentSheet:\s*true/.test(detailJs) &&
    detailJs.indexOf('buildPaymentDraftUsers') < 0
);
assert(
  '13 detail keeps fromSeries payment deep-link',
  detailJs.indexOf("openSheetRaw === 'payment'") >= 0 &&
    detailJs.indexOf("sheet === 'payment'") >= 0
);
assert(
  '14 Series uses shared sheet in-place',
  seriesJson.indexOf('match-payment-management-sheet') >= 0 &&
    seriesWxml.indexOf('data-mode="grouped_players"') >= 0 &&
    /_openSeriesPaymentManageSheet/.test(seriesJs) &&
    !/permission === 'manage_payment'[\s\S]{0,200}_openSeriesDetailSheetDeepLink\('payment'\)/.test(
      seriesJs
    )
);
assert(
  '14b ordinary default registration mode',
  /dataMode:\s*\{\s*type:\s*String,\s*value:\s*DATA_MODE_REGISTRATION/.test(
    compJs
  ) ||
    compJs.indexOf("value: DATA_MODE_REGISTRATION") >= 0 ||
    compJs.indexOf("value: seriesGroupedPaymentManage.DATA_MODE_REGISTRATION") >= 0
);

var memory = {};
global.__toasts = [];
global.wx = {
  showToast: function (opt) {
    global.__toasts = (global.__toasts || []).concat([opt || {}]);
  },
  showModal: function (opt) {
    if (opt && typeof opt.success === 'function') {
      opt.success({ confirm: true });
    }
  },
  getStorageSync: function (k) {
    return memory['s:' + k] || null;
  },
  setStorageSync: function (k, v) {
    memory['s:' + k] = v;
  },
  removeStorageSync: function (k) {
    delete memory['s:' + k];
  }
};

var componentDef = null;
global.Component = function (def) {
  componentDef = def;
};
delete require.cache[path.join(compDir, 'index.js')];
require(path.join(compDir, 'index.js'));
assert('15 Component captured', !!(componentDef && componentDef.methods));

var teamMatchStore = require(path.join(utilsDir, 'teamMatchStore.js'));
var paymentManage = require(path.join(utilsDir, 'paymentManage.js'));
var gameStore = require(path.join(utilsDir, 'gameStore.js'));

var storeBag = {};
var origGet = teamMatchStore.getMatchById;
var origSave = teamMatchStore.saveMatch;
var origUser = gameStore.getCurrentUser;
teamMatchStore.getMatchById = function (id) {
  return storeBag[String(id)] || null;
};
teamMatchStore.saveMatch = function (match) {
  if (!match || !match.matchId) return null;
  storeBag[String(match.matchId)] = match;
  return match;
};
gameStore.getCurrentUser = function () {
  return { userId: 'creator-1', nickname: '创建者' };
};

function makeMatch(overrides) {
  return Object.assign(
    {
      matchId: 'm1',
      matchType: 'inter-team',
      status: 'registering',
      registrationStatus: 'open',
      createdBy: 'creator-1',
      organizationId: 'org-1',
      gameMode: '个人比杆赛',
      feeList: [{ id: 'f1', name: '报名费', amount: '100' }],
      feeSet: true,
      teamGroups: [
        { id: 't1', name: '红队' },
        { id: 't2', name: '蓝队' }
      ],
      registerInfo: {
        totalCount: 2,
        users: [
          {
            userId: 'u1',
            matchNickname: '甲',
            matchGender: 'male',
            matchTeamId: 't1',
            paymentConfirmed: false,
            paidAmount: '',
            cashPaidAmount: '',
            paymentRemark: ''
          },
          {
            userId: 'u2',
            matchNickname: '乙',
            matchGender: 'female',
            matchTeamId: 't2',
            paymentConfirmed: true,
            paidAmount: 50,
            cashPaidAmount: 50,
            paymentRemark: '微信'
          }
        ]
      },
      paymentLogs: [],
      groups: [],
      pairings: {}
    },
    overrides || {}
  );
}

function makeHost() {
  var host = {
    _alive: true,
    _targetMatchId: '',
    _openSeq: 0,
    _patching: false,
    properties: {
      visible: false,
      matchId: 'm1',
      roundSubtitle: '',
      themeClass: ''
    },
    data: Object.assign({}, componentDef.data),
    setData: function (patch, cb) {
      Object.assign(this.data, patch || {});
      if (typeof cb === 'function') cb();
    },
    triggerEvent: function (name, detail) {
      this.__events = (this.__events || []).concat([
        { name: name, detail: detail || {} }
      ]);
    }
  };
  Object.keys(componentDef.methods).forEach(function (k) {
    host[k] = componentDef.methods[k];
  });
  return host;
}

// 打开
storeBag = { m1: makeMatch() };
var host = makeHost();
host.properties.matchId = 'm1';
host._openSheet();
assert('16 open freezes m1', host._targetMatchId === 'm1');
assert('17 open ready', !!host.data.sheetReady);
assert('18 draft users=2', (host.data.paymentUsers || []).length === 2);
assert(
  '19 summary paid/unpaid',
  host.data.paymentSummary.paidCount === 1 &&
    host.data.paymentSummary.unpaidCount === 1
);

// 筛选
host.showPaidPaymentUsers();
assert(
  '20 filter paid',
  host.data.paymentFilter === 'paid' &&
    host.data.paymentFilteredUsers.length === 1 &&
    host.data.paymentFilteredUsers[0].userId === 'u2'
);
host.showUnpaidPaymentUsers();
assert(
  '21 filter unpaid',
  host.data.paymentFilter === 'unpaid' &&
    host.data.paymentFilteredUsers.length === 1
);
host.showAllPaymentUsers();
assert('22 filter all', host.data.paymentFilteredUsers.length === 2);

// 即时保存：确认 + 金额 + 备注
host.properties.matchId = 'm-other';
host.__events = [];
host.patchPaymentUser('u1', {
  paymentConfirmed: true,
  cashPaidAmount: 88,
  paidAmount: 88,
  paymentRemark: '现金'
});
assert(
  '23 writes registerInfo.users',
  storeBag.m1.registerInfo.users[0].paymentConfirmed === true &&
    Number(storeBag.m1.registerInfo.users[0].paidAmount) === 88 &&
    storeBag.m1.registerInfo.users[0].paymentRemark === '现金'
);
assert(
  '24 writes paymentLogs',
  Array.isArray(storeBag.m1.paymentLogs) && storeBag.m1.paymentLogs.length >= 1
);
assert(
  '25 changed event frozen matchId',
  (host.__events || []).some(function (e) {
    return e.name === 'changed' && e.detail.matchId === 'm1';
  })
);
assert(
  '26 feeList untouched',
  JSON.stringify(storeBag.m1.feeList) ===
    JSON.stringify([{ id: 'f1', name: '报名费', amount: '100' }])
);

// 关闭不撤销
var afterSave = JSON.stringify(storeBag.m1.registerInfo.users[0]);
host.__events = [];
host.onClose();
assert(
  '27 close event',
  (host.__events || []).some(function (e) {
    return e.name === 'close';
  })
);
assert(
  '28 close does not rollback',
  JSON.stringify(storeBag.m1.registerInfo.users[0]) === afterSave
);

// 写失败
storeBag = { m1: makeMatch() };
host = makeHost();
host.properties.matchId = 'm1';
host._openSheet();
host.__events = [];
global.__toasts = [];
teamMatchStore.saveMatch = function () {
  throw new Error('fail');
};
host.patchPaymentUser('u1', { paymentConfirmed: true, cashPaidAmount: 10 });
assert(
  '29 save fail no changed',
  !(host.__events || []).some(function (e) {
    return e.name === 'changed';
  })
);
assert(
  '30 save fail toast',
  (global.__toasts || []).some(function (t) {
    return t && t.title === '保存失败';
  })
);
assert(
  '31 save fail rollback user',
  storeBag.m1.registerInfo.users[0].paymentConfirmed !== true
);
teamMatchStore.saveMatch = function (match) {
  if (!match || !match.matchId) return null;
  storeBag[String(match.matchId)] = match;
  return match;
};

// 权限不足
storeBag = {
  m1: makeMatch({ createdBy: 'x', organizationId: 'y' })
};
gameStore.getCurrentUser = function () {
  return { userId: 'stranger' };
};
host = makeHost();
host.properties.matchId = 'm1';
host.__events = [];
host._openSheet();
assert(
  '32 denied close',
  (host.__events || []).some(function (e) {
    return e.name === 'close';
  })
);
assert('33 denied not ready', !host.data.sheetReady);
gameStore.getCurrentUser = function () {
  return { userId: 'creator-1', nickname: '创建者' };
};

// 报名关闭 / LIVE / finished 仍可打开（与菜单不禁用一致）
['closed', 'open'].forEach(function (reg, i) {
  storeBag = {
    m1: makeMatch({
      registrationStatus: reg,
      status: i === 0 ? 'ongoing' : 'finished'
    })
  };
  host = makeHost();
  host.properties.matchId = 'm1';
  host._openSheet();
  assert(
    '34 lifecycle open ' + reg + '/' + storeBag.m1.status,
    !!host.data.sheetReady && host._targetMatchId === 'm1'
  );
});

teamMatchStore.getMatchById = origGet;
teamMatchStore.saveMatch = origSave;
gameStore.getCurrentUser = origUser;

// ----- UI 对齐：同一组件模板 / 无 dataMode DOM 分支 / 宿主尺寸 -----
var compWxss = read(path.join(compDir, 'index.wxss'));
var commonWxss = read(
  path.join(root, 'miniprogram', 'styles', 'tournament-common.wxss')
);
var detailWxss = read(path.join(detailDir, 'index.wxss'));
var seriesWxss = read(path.join(seriesDir, 'index.wxss'));

function extractPaymentClassSignature(wxml) {
  var body = String(wxml || '')
    .replace(/<text[^>]*wx:if="\{\{roundSubtitle\}\}"[\s\S]*?<\/text>/g, '')
    .replace(/\{\{emptyText\}\}/g, '');
  var classes = [];
  var re = /class="([^"]+)"/g;
  var m;
  while ((m = re.exec(body))) classes.push(m[1]);
  return classes.join('|');
}

var CORE_CLASSES = [
  'bottom-sheet register-sheet payment-sheet',
  'payment-summary',
  'payment-filter-tabs',
  'payment-user-card',
  'payment-user-card__body',
  'payment-sheet__empty'
];
CORE_CLASSES.forEach(function (cls, i) {
  assert('35 core class ' + (i + 1) + ' ' + cls, compWxml.indexOf(cls) >= 0);
});
assert(
  '36 no dataMode DOM branch in wxml',
  !/dataMode|grouped_players|registration/.test(compWxml)
);
assert(
  '37 shared template used by detail+series',
  detailWxml.indexOf('match-payment-management-sheet') >= 0 &&
    seriesWxml.indexOf('match-payment-management-sheet') >= 0
);
assert(
  '38 payment styles live in tournament-common',
  commonWxss.indexOf('.payment-sheet {') >= 0 &&
    commonWxss.indexOf('.payment-summary {') >= 0 &&
    commonWxss.indexOf('.payment-user-card {') >= 0
);
assert(
  '39 component wxss carries authoritative payment sizes (HEAD parity)',
  compWxss.indexOf('.payment-summary {') >= 0 &&
    compWxss.indexOf('.payment-user-card {') >= 0 &&
    compWxss.indexOf('max-height: 82vh') >= 0
);
assert(
  '40 detail page no leftover payment core CSS',
  detailWxss.indexOf('/* ===== 收费管理（极简实收登记） ===== */') < 0 &&
    detailWxss.indexOf('.payment-summary {') < 0
);
assert(
  '41 Series host no payment size override',
  seriesWxss.indexOf('.payment-sheet') < 0 &&
    seriesWxss.indexOf('.payment-summary') < 0 &&
    seriesWxss.indexOf('.payment-user-card') < 0
);
assert(
  '42 Series mount has no wrapper padding attrs',
  /<match-payment-management-sheet[\s\S]*?\/>/.test(seriesWxml) &&
    !/class="[^"]*payment[^"]*"[^>]*>\s*<match-payment-management-sheet/.test(
      seriesWxml
    )
);
assert(
  '43 Series only adds roundSubtitle binding',
  seriesWxml.indexOf('round-subtitle="{{paymentManageSheetRoundSubtitle}}"') >=
    0 &&
    detailWxml.indexOf('round-subtitle=""') >= 0
);
assert(
  '44 UI class signature stable (roundSubtitle stripped)',
  extractPaymentClassSignature(compWxml).indexOf('payment-summary') >= 0 &&
    extractPaymentClassSignature(compWxml).indexOf(
      'match-payment-management-host__round'
    ) < 0
);

// 同一 fixture → registration / grouped 投影字段签名一致（不含来源差异字段）
delete require.cache[path.join(utilsDir, 'paymentManage.js')];
delete require.cache[path.join(utilsDir, 'seriesGroupedPaymentManage.js')];
paymentManage = require(path.join(utilsDir, 'paymentManage.js'));
var seriesGroupedPaymentManage = require(path.join(
  utilsDir,
  'seriesGroupedPaymentManage.js'
));

function paymentUiFieldSig(u) {
  var keys = [
    'userId',
    'playerId',
    'name',
    'avatar',
    'displayName',
    'displayAvatar',
    'paymentConfirmed',
    'paidAmount',
    'cashPaidAmount',
    'paymentRemark',
    'paidAmountInput',
    'paymentStatusLine',
    'stableUserId'
  ];
  return keys
    .map(function (k) {
      return k + '=' + String(u && u[k]);
    })
    .join('|');
}

var regMatch = {
  registerInfo: {
    users: [
      {
        userId: 'u1',
        matchNickname: '甲',
        matchGender: 'male',
        avatar: '/a.png',
        paymentConfirmed: true,
        paidAmount: 88,
        cashPaidAmount: 88,
        paymentRemark: '现金'
      }
    ]
  }
};
var groupedMatch = {
  groups: [{ id: 'g1', players: [{ userId: 'u1', name: '甲', gender: 'male' }] }],
  paymentByUserId: {
    u1: {
      playerId: 'u1',
      paymentConfirmed: true,
      paidAmount: 88,
      cashPaidAmount: 88,
      paymentRemark: '现金'
    }
  },
  registerInfo: { users: [] }
};
var regUsers = paymentManage.buildPaymentDraftUsers(regMatch);
var grpUsers = seriesGroupedPaymentManage.buildGroupedPaymentDraftUsers(
  groupedMatch,
  [{ playerId: 'u1', playerNameSnapshot: '甲', playerAvatarSnapshot: '/a.png', genderSnapshot: 'male' }]
);
assert('45 registration ViewModel keys', !!regUsers[0] && !!regUsers[0].name && !!regUsers[0].displayName);
assert('46 grouped ViewModel keys', !!grpUsers[0] && !!grpUsers[0].name && !!grpUsers[0].displayName);
assert(
  '47 same fixture UI signature',
  paymentUiFieldSig(regUsers[0]) === paymentUiFieldSig(grpUsers[0])
);
assert(
  '48 registration still writes registerInfo path in component',
  /_patchRegistrationPaymentUser/.test(compJs) &&
    /registerInfo\.users/.test(compJs)
);
assert(
  '49 Series writes paymentByUserId path in component',
  /_patchGroupedPaymentUser/.test(compJs) &&
    /applyGroupedPaymentPatch/.test(compJs)
);

console.log('\n--- matchPaymentManagementSheet.selftest ---');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
