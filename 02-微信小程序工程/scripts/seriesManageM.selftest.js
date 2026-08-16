/**
 * Series M 管理入口自测
 * 运行：node scripts/seriesManageM.selftest.js
 */

var path = require('path');
var fs = require('fs');

if (typeof global.wx === 'undefined') {
  global.wx = {
    getStorageSync: function () {
      return null;
    },
    setStorageSync: function () {},
    removeStorageSync: function () {}
  };
}

var utilsDir = path.join(__dirname, '..', 'miniprogram', 'utils');
var pageDir = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail'
);
var detailJs = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'miniprogram',
    'subpackages',
    'tournament',
    'pages',
    'detail',
    'index.js'
  ),
  'utf8'
);

var moreMenu = require(path.join(utilsDir, 'teamMatchMoreMenu.js'));
var gate = require(path.join(utilsDir, 'seriesStationManageGate.js'));
var manageAccess = require(path.join(utilsDir, 'seriesManageAccess.js'));
var picker = require(path.join(pageDir, 'seriesManageRoundPicker.js'));
var sheetVm = require(path.join(pageDir, 'seriesManageSheetViewModel.js'));

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

function privUser() {
  return { userId: 'admin-1', name: 'Admin' };
}

function makeMatch(overrides) {
  return Object.assign(
    {
      matchId: 'm1',
      matchType: 'inter-team',
      status: 'registering',
      createdBy: 'admin-1',
      organizationId: 'org-1',
      registrationStatus: 'closed',
      gameMode: '个人比杆赛',
      seriesContext: {
        managed: true,
        seriesId: 's1',
        roundId: 'r1',
        publishToken: 'tok'
      }
    },
    overrides || {}
  );
}

(function testDetailParityAndSeriesFilter() {
  var matchReg = makeMatch({ status: 'registering' });
  var user = privUser();
  var normal = moreMenu.buildMoreMenuViewModel({
    match: matchReg,
    user: user,
    options: { managedSeriesMode: false }
  });
  var series = moreMenu.buildMoreMenuViewModel({
    match: matchReg,
    user: user,
    options: { managedSeriesMode: true }
  });
  var nSig = moreMenu.menuSignature(normal);
  var sSig = moreMenu.menuSignature(series);

  assert(
    '普通 registering 含代报名/邀请/开关报名/cancel',
    nSig.common.indexOf('register_for_other@替他人报名') >= 0 &&
      nSig.common.some(function (x) {
        return x.indexOf('invite_friends_register') === 0;
      }) &&
      nSig.lifecycle.some(function (x) {
        return x.indexOf('close_registration') === 0;
      }) &&
      nSig.lifecycle.some(function (x) {
        return x.indexOf('cancel_match') === 0;
      })
  );
  assert(
    'Series registering 不含代报名/邀请/开关报名/cancel',
    !sSig.common.some(function (x) {
      return (
        x.indexOf('register_for_other') === 0 ||
        x.indexOf('invite_friends_register') === 0
      );
    }) &&
      !sSig.lifecycle.some(function (x) {
        return (
          x.indexOf('close_registration') === 0 || x.indexOf('cancel_match') === 0
        );
      }) &&
      !sSig.permission.some(function (x) {
        return x.indexOf('cancel_match') === 0;
      })
  );
  assert(
    'registering 无净杆/结束比赛 LIVE 专属',
    !nSig.permission.some(function (x) {
      return x.indexOf('net_score') === 0 || x.indexOf('finish_match') === 0;
    }) &&
      !sSig.permission.some(function (x) {
        return x.indexOf('net_score') === 0 || x.indexOf('finish_match') === 0;
      })
  );

  var live = moreMenu.buildMoreMenuViewModel({
    match: makeMatch({ status: 'ongoing' }),
    user: user,
    options: { managedSeriesMode: true }
  });
  var liveSig = moreMenu.menuSignature(live);
  assert(
    'Series LIVE 含净杆/显示设置且无 cancel/报名类',
    liveSig.footer.some(function (x) {
      return x.indexOf('finish_match') === 0;
    }) &&
      liveSig.permission.some(function (x) {
        return x.indexOf('net_score') === 0;
      }) &&
      liveSig.common.some(function (x) {
        return x.indexOf('theme') === 0;
      }) &&
      !liveSig.common.some(function (x) {
        return x.indexOf('register_for_other') === 0;
      }) &&
      !liveSig.footer.some(function (x) {
        return (
          x.indexOf('cancel_match') === 0 || x.indexOf('close_registration') === 0
        );
      })
  );

  var finished = moreMenu.buildMoreMenuViewModel({
    match: makeMatch({
      status: 'finished',
      peoriaResult: { status: 'generated' }
    }),
    user: user,
    options: { managedSeriesMode: true }
  });
  var fSig = moreMenu.menuSignature(finished);
  assert(
    'finished 沿用 disabled：净杆已生成禁用、收费可点、改比赛禁用',
    fSig.permission.some(function (x) {
      return x.indexOf('net_score:d') === 0;
    }) &&
      fSig.permission.some(function (x) {
        return x.indexOf('manage_payment@') === 0 && x.indexOf(':d') < 0;
      }) &&
      fSig.permission.some(function (x) {
        return x.indexOf('edit_match:d') === 0;
      })
  );

  assert(
    '无伪造记分按钮',
    !JSON.stringify(nSig).includes('记分') &&
      !JSON.stringify(sSig).includes("'score'") &&
      !liveSig.permission.some(function (x) {
        return x.indexOf('score@') === 0;
      })
  );

  assert(
    'detail 消费共享生成器且默认 managedSeriesMode 未写死 true',
    detailJs.indexOf('teamMatchMoreMenu') >= 0 &&
      detailJs.indexOf('buildMoreMenuViewModel') >= 0 &&
      detailJs.indexOf('managedSeriesMode: false') >= 0 &&
      detailJs.indexOf('fromSeries') >= 0
  );
})();

(function testGate() {
  var series = {
    seriesId: 's1',
    publishToken: 'tok',
    rounds: [{ roundId: 'r1', matchId: 'm1', name: 'R1' }]
  };
  var match = makeMatch();
  var ok = gate.verifyManagedStationForManage({
    series: series,
    roundId: 'r1',
    getMatchById: function () {
      return match;
    },
    getIndexByMatchId: function () {
      return { seriesId: 's1', roundId: 'r1', matchId: 'm1' };
    }
  });
  assert('核验通过', ok.ok && ok.matchId === 'm1');

  var badTok = gate.verifyManagedStationForManage({
    series: series,
    roundId: 'r1',
    getMatchById: function () {
      return makeMatch({
        seriesContext: {
          managed: true,
          seriesId: 's1',
          roundId: 'r1',
          publishToken: 'WRONG'
        }
      });
    },
    getIndexByMatchId: function () {
      return { seriesId: 's1', roundId: 'r1' };
    }
  });
  assert(
    '坏 token 不通过',
    !badTok.ok && badTok.message === gate.GATE_FAIL_MESSAGE
  );

  var badIndex = gate.verifyManagedStationForManage({
    series: series,
    roundId: 'r1',
    getMatchById: function () {
      return match;
    },
    getIndexByMatchId: function () {
      return { seriesId: 's1', roundId: 'r9' };
    }
  });
  assert('坏 index 不通过', !badIndex.ok);
})();

(function testTeamAdminNotOrgAdmin() {
  var src = fs.readFileSync(
    path.join(utilsDir, 'seriesManageAccess.js'),
    'utf8'
  );
  assert(
    'team 权限路径声明不使用 isOrganizationAdmin 冒充',
    src.indexOf('isClubTeamAdminUser') >= 0 &&
      src.indexOf('禁止用 isOrganizationAdmin') >= 0
  );
  // team 模式 host 检查走 isClubTeamAdminUser，organization 才 isOrganizationAdmin
  assert(
    'isSeriesHostPrivileged team 分支用 club admin',
    /hostMode === 'team'[\s\S]*isClubTeamAdminUser/.test(src)
  );
  assert(
    'Series 创建者可获 M 入口（isSeriesCreator）',
    src.indexOf('isSeriesCreator') >= 0 &&
      /isSeriesCreator\(series/.test(src)
  );
})();

(function testPicker() {
  var vm = picker.buildManageRoundPickerViewModel({
    series: {
      rounds: [
        {
          roundId: 'r1',
          index: 1,
          name: '首轮',
          dateTime: '2026-08-01 07:30',
          matchId: 'm1'
        },
        {
          roundId: 'r2',
          index: 2,
          name: '次轮',
          matchId: 'm2'
        }
      ]
    },
    suggestedRoundId: 'r2',
    getMatchById: function (id) {
      if (id === 'm1') return { status: 'ongoing' };
      if (id === 'm2') return { status: 'registering' };
      return null;
    }
  });
  assert(
    '轮次选择含状态且建议高亮不自动确认',
    vm.items.length === 2 &&
      vm.items[0].statusLabel === 'LIVE' &&
      vm.items[1].statusLabel === '未开始' &&
      vm.items[1].isSuggested === true &&
      vm.items[0].isSuggested === false
  );
})();

(function testPermissionMatrixAndFab() {
  var seriesOpen = {
    seriesId: 's1',
    publishToken: 'tok',
    lifecycleStatus: 'published',
    registrationState: 'open',
    createdBy: 'admin-1',
    rounds: [
      {
        roundId: 'r1',
        index: 1,
        name: '首轮',
        dateTime: '2026-08-01 07:30',
        matchId: 'm1'
      },
      {
        roundId: 'r2',
        index: 2,
        name: '次轮',
        dateTime: '2026-08-02 07:30',
        matchId: 'm2'
      }
    ]
  };
  var normal = { userId: 'user-normal', name: '普通' };
  var admin = privUser();

  var normalSheet = sheetVm.buildSeriesManageSheetViewModel({
    series: seriesOpen,
    user: normal,
    canManageSeries: false,
    canRegisterForOther: true,
    selectedRoundId: 'r1'
  });
  assert(
    '普通用户：代报名+邀请；可选轮；无 Series 管理网格',
    normalSheet.seriesScope.featuresCommon.length === 2 &&
      normalSheet.seriesScope.featuresCommon.every(function (f) {
        return (
          f.permission === 'register_for_other' ||
          f.permission === 'invite_friends_register'
        );
      }) &&
      normalSheet.seriesScope.featuresManage.length === 0 &&
      normalSheet.seriesScope.featuresDanger.length === 0 &&
      normalSheet.showRoundManage === false &&
      normalSheet.showRoundPicker === true &&
      normalSheet.roundPicker.items.length === 2 &&
      normalSheet.roundSection.hasSelection === false &&
      normalSheet.roundViewSection.hasSelection === true
  );

  var closedSeries = Object.assign({}, seriesOpen, { registrationState: 'closed' });
  var closedNormal = sheetVm.buildSeriesManageSheetViewModel({
    series: closedSeries,
    user: normal,
    canManageSeries: false,
    canRegisterForOther: true
  });
  assert(
    '报名 closed：代报名可见且不置灰（拦截在点击入口，非 ViewModel）',
    closedNormal.seriesScope.featuresCommon.some(function (f) {
      return f.permission === 'invite_friends_register' && !f.disabled;
    }) &&
      closedNormal.seriesScope.featuresCommon.some(function (f) {
        return (
          f.permission === 'register_for_other' &&
          !f.disabled &&
          f.disabledReason === '' &&
          f.disabledReason !== 'registration_closed'
        );
      })
  );
  assert(
    'published+open：代报名可用',
    normalSheet.seriesScope.featuresCommon.some(function (f) {
      return f.permission === 'register_for_other' && !f.disabled;
    })
  );

  ['draft', 'cancelled', 'archived'].forEach(function (life) {
    var lifeSheet = sheetVm.buildSeriesManageSheetViewModel({
      series: Object.assign({}, seriesOpen, { lifecycleStatus: life }),
      user: normal,
      canManageSeries: false,
      canRegisterForOther: true
    });
    assert(
      life + '：无替他人报名入口',
      !lifeSheet.seriesScope.featuresCommon.some(function (f) {
        return f.permission === 'register_for_other';
      })
    );
  });

  var closedAdmin = sheetVm.buildSeriesManageSheetViewModel({
    series: closedSeries,
    user: admin,
    canManageSeries: true,
    canRegisterForOther: true
  });
  assert(
    'closed 管理员：代报名可用且有打开报名',
    closedAdmin.seriesScope.featuresCommon.some(function (f) {
      return f.permission === 'register_for_other' && !f.disabled;
    }) &&
      closedAdmin.seriesScope.featuresManage.some(function (f) {
        return (
          f.permission === 'toggle_registration' &&
          f.label === '打开报名' &&
          !f.disabled
        );
      })
  );

  var adminSheet = sheetVm.buildSeriesManageSheetViewModel({
    series: seriesOpen,
    user: admin,
    canManageSeries: true,
    canRegisterForOther: true,
    suggestedRoundId: 'r1',
    selectedRoundId: '',
    getMatchById: function (id) {
      if (id === 'm1') return makeMatch({ matchId: 'm1', status: 'registering' });
      if (id === 'm2') return makeMatch({ matchId: 'm2', status: 'ongoing' });
      return null;
    }
  });
  assert(
    '管理员：普通区+管理区+轮次区',
    adminSheet.seriesScope.featuresCommon.length === 2 &&
      adminSheet.seriesScope.featuresManage.length === 4 &&
      adminSheet.seriesScope.featuresManage[0].permission === 'edit_series' &&
      adminSheet.seriesScope.featuresManage[1].permission === 'cancel_series' &&
      adminSheet.seriesScope.featuresManage[1].disabled === true &&
      adminSheet.seriesScope.featuresManage[2].permission ===
        'toggle_registration' &&
      !adminSheet.seriesScope.featuresManage[2].disabled &&
      adminSheet.seriesScope.featuresManage[3].permission === 'finish_series' &&
      !adminSheet.seriesScope.featuresManage[3].disabled &&
      adminSheet.seriesScope.featuresDanger.length === 1 &&
      adminSheet.seriesScope.featuresDanger[0].permission === 'cancel_series' &&
      adminSheet.showRoundManage === true &&
      adminSheet.roundPicker.items.length === 2 &&
      adminSheet.roundSection.hasSelection === false
  );
  assert(
    '管理四列网格顺序：修改系列赛第1、取消第2、报名开关第3、结束系列赛第4',
    adminSheet.seriesScope.featuresManage.length === 4 &&
      adminSheet.seriesScope.featuresManage[0].permission === 'edit_series' &&
      adminSheet.seriesScope.featuresManage[0].label === '修改系列赛' &&
      adminSheet.seriesScope.featuresManage[1].permission === 'cancel_series' &&
      adminSheet.seriesScope.featuresManage[2].permission ===
        'toggle_registration' &&
      adminSheet.seriesScope.featuresManage[3].permission === 'finish_series' &&
      !adminSheet.seriesScope.featuresManage.some(function (f) {
        return !f || !f.permission || f.permission === 'pad';
      })
  );
  assert(
    '普通用户无管理网格',
    normalSheet.seriesScope.featuresManage.length === 0 &&
      normalSheet.seriesScope.featuresDanger.length === 0
  );

  var fabCommon = manageAccess.resolveSeriesManageFabVisible({
    series: seriesOpen,
    user: normal,
    accessContentReady: true,
    getMatchById: function () {
      return null;
    },
    getIndexByMatchId: function () {
      return null;
    }
  });
  assert(
    '普通用户可见 M（common_features）',
    fabCommon.visible === true && fabCommon.reason === 'common_features'
  );
  var fabGate = manageAccess.resolveSeriesManageFabVisible({
    series: seriesOpen,
    user: normal,
    accessContentReady: false,
    getMatchById: function () {
      return null;
    },
    getIndexByMatchId: function () {
      return null;
    }
  });
  assert('private 门闩前无 M', fabGate.visible === false && fabGate.reason === 'access_gate');
})();

(function testUnifiedSheetViewModel() {
  var series = {
    seriesId: 's1',
    publishToken: 'tok',
    lifecycleStatus: 'published',
    registrationState: 'open',
    createdBy: 'admin-1',
    rounds: [
      {
        roundId: 'r1',
        index: 1,
        name: '首轮',
        dateTime: '2026-08-01 07:30',
        matchId: 'm1'
      },
      {
        roundId: 'r2',
        index: 2,
        name: '次轮',
        dateTime: '2026-08-02 07:30',
        matchId: 'm2'
      }
    ]
  };
  var user = privUser();
  var empty = sheetVm.buildSeriesManageSheetViewModel({
    series: series,
    user: user,
    canManageSeries: true,
    canRegisterForOther: true,
    suggestedRoundId: 'r1',
    selectedRoundId: '',
    getMatchById: function (id) {
      if (id === 'm1') return makeMatch({ matchId: 'm1', status: 'registering' });
      if (id === 'm2') return makeMatch({ matchId: 'm2', status: 'ongoing' });
      return null;
    }
  });
  assert(
    '未选轮：管理员按钮可见且本轮仅提示',
    empty.seriesScope.featuresCommon.length === 2 &&
      empty.seriesScope.featuresManage.length === 4 &&
      empty.roundSection.hasSelection === false &&
      !!empty.roundSection.placeholder &&
      empty.roundSection.featuresCommon.length === 0 &&
      empty.roundPicker.items.some(function (it) {
        return it.roundId === 'r1' && it.isSuggested === true && !it.isSelected;
      })
  );
  assert(
    '未选轮也可修改系列赛；取消在第2位且 disabled',
    empty.seriesScope.featuresManage[0].permission === 'edit_series' &&
      empty.seriesScope.featuresManage[0].label === '修改系列赛' &&
      !empty.seriesScope.featuresManage[0].disabled &&
      empty.seriesScope.featuresManage[1].permission === 'cancel_series' &&
      empty.seriesScope.featuresManage[1].disabled === true &&
      empty.seriesScope.featuresManage[1].tone === 'danger' &&
      empty.seriesScope.featuresManage[1].subLabel === '功能即将开放' &&
      empty.seriesScope.featuresDanger[0].permission === 'cancel_series'
  );

  function stationMatch(roundId, matchId, status) {
    return makeMatch({
      matchId: matchId,
      status: status,
      seriesContext: {
        managed: true,
        seriesId: 's1',
        roundId: roundId,
        publishToken: 'tok'
      }
    });
  }
  var r1Gate = gate.verifyManagedStationForManage({
    series: series,
    roundId: 'r1',
    getMatchById: function () {
      return stationMatch('r1', 'm1', 'registering');
    },
    getIndexByMatchId: function () {
      return { seriesId: 's1', roundId: 'r1', matchId: 'm1' };
    }
  });
  var r1Sheet = sheetVm.buildSeriesManageSheetViewModel({
    series: series,
    user: user,
    canManageSeries: true,
    canRegisterForOther: true,
    selectedRoundId: 'r1',
    gate: r1Gate,
    getMatchById: function () {
      return stationMatch('r1', 'm1', 'registering');
    }
  });
  function permIndex(list, permission) {
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].permission === permission) return i;
    }
    return -1;
  }
  function visiblePermIndex(list, permission) {
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (f && f.permission === permission && !f.placeholder && !f.empty) return i;
    }
    return -1;
  }
  function slotCol(list, permission) {
    var idx = permIndex(list, permission);
    return idx < 0 ? -1 : idx % 4;
  }
  function matrixRows(list) {
    var rows = [];
    var cur = [];
    (list || []).forEach(function (f) {
      var label = !f
        ? '[null]'
        : f.placeholder || f.empty
          ? '[空槽:' + (f.permission || '') + ']'
          : f.permission;
      cur.push(label);
      if (cur.length === 4) {
        rows.push(cur.join(' | '));
        cur = [];
      }
    });
    if (cur.length) rows.push(cur.join(' | '));
    return rows;
  }
  assert(
    '选 R1：本轮普通功能标题 + 管理区同帧（无「本轮管理」标题）',
    r1Sheet.roundViewSection.hasSelection &&
      r1Sheet.roundViewSection.gateOk &&
      r1Sheet.roundViewSection.headline.indexOf('R1') >= 0 &&
      r1Sheet.roundViewSection.headline.indexOf('首轮') >= 0 &&
      r1Sheet.roundSection.hasSelection &&
      r1Sheet.roundSection.gateOk &&
      r1Sheet.roundSection.headline === '' &&
      r1Sheet.roundSection.summaryLine === '' &&
      r1Sheet.roundSection.featuresSectionCommonMain === '' &&
      r1Sheet.roundSection.featuresSectionPermissionMain === '赛事管理' &&
      r1Sheet.roundSection.featuresPermission.length > 0 &&
      r1Sheet.roundSection.lifecycleActions.length === 0 &&
      r1Sheet.roundSection.featuresPermissionFooter.length === 0 &&
      r1Sheet.roundSection.featuresPermissionFooterPad.length === 0 &&
      visiblePermIndex(r1Sheet.roundSection.featuresPermission, 'start_match') >= 0 &&
      r1Sheet.roundPicker.items.some(function (it) {
        return it.roundId === 'r1' && it.isSelected;
      })
  );
  assert(
    '选 R1：本轮普通功能四列（领先榜+统计+双占位），管理区迁移槽为 placeholder',
    r1Sheet.roundViewSection.features.length === 4 &&
      visiblePermIndex(r1Sheet.roundViewSection.features, 'leaderboard') === 0 &&
      visiblePermIndex(r1Sheet.roundViewSection.features, 'stats') === 1 &&
      r1Sheet.roundViewSection.features[2].placeholder === true &&
      r1Sheet.roundViewSection.features[3].placeholder === true &&
      // 报名期本轮管理无 common 区（与 managed 源一致）
      r1Sheet.roundSection.featuresCommon.length === 0 &&
      visiblePermIndex(r1Sheet.roundSection.featuresPermission, 'leaderboard') < 0 &&
      visiblePermIndex(r1Sheet.roundSection.featuresPermission, 'stats') < 0
  );
  assert(
    'R1：开始比赛紧跟收费管理（同数组同网格，无取消/关闭占位、无行 pad）',
    (function () {
      var list = r1Sheet.roundSection.featuresPermission;
      var pay = visiblePermIndex(list, 'manage_payment');
      var start = visiblePermIndex(list, 'start_match');
      return (
        pay >= 0 &&
        start === pay + 1 &&
        permIndex(list, 'cancel_match') < 0 &&
        permIndex(list, 'close_registration') < 0 &&
        !list.some(function (f) {
          return f && f.placeholder && String(f.permission || '').indexOf('__pad_') === 0;
        }) &&
        r1Sheet.roundSection.lifecycleActions.length === 0
      );
    })()
  );
  assert(
    '本轮菜单不重复可点 Series 四键（隐藏项仅允许 placeholder）',
    (function () {
      var all = []
        .concat(r1Sheet.roundSection.featuresCommon || [])
        .concat(r1Sheet.roundSection.featuresPermission || []);
      var banned = {
        register_for_other: true,
        invite_friends_register: true,
        cancel_series: true
      };
      for (var i = 0; i < all.length; i++) {
        var f = all[i];
        if (!f || !f.permission) continue;
        if (banned[f.permission] && !f.placeholder) return false;
        if (
          (f.permission === 'close_registration' || f.permission === 'cancel_match') &&
          !f.placeholder
        ) {
          return false;
        }
      }
      return true;
    })()
  );

  var r2Gate = gate.verifyManagedStationForManage({
    series: series,
    roundId: 'r2',
    getMatchById: function () {
      return stationMatch('r2', 'm2', 'ongoing');
    },
    getIndexByMatchId: function () {
      return { seriesId: 's1', roundId: 'r2', matchId: 'm2' };
    }
  });
  var r2Sheet = sheetVm.buildSeriesManageSheetViewModel({
    series: series,
    user: user,
    canManageSeries: true,
    canRegisterForOther: true,
    selectedRoundId: 'r2',
    gate: r2Gate,
    getMatchById: function () {
      return stationMatch('r2', 'm2', 'ongoing');
    }
  });
  assert(
    '切 R2：普通功能标题与 LIVE 管理菜单原地替换',
    r2Sheet.roundViewSection.gateOk &&
      r2Sheet.roundViewSection.headline.indexOf('R2') >= 0 &&
      r2Sheet.roundSection.gateOk &&
      r2Sheet.roundSection.headline === '' &&
      r2Sheet.roundSection.summaryLine === '' &&
      r2Sheet.roundSection.lifecycleActions.length === 0 &&
      r2Sheet.roundSection.featuresPermissionFooter.length === 0 &&
      r2Sheet.roundSection.featuresPermissionFooterPad.length === 0 &&
      r2Sheet.roundSection.featuresCommon.length === 0 &&
      (function () {
        var list = r2Sheet.roundSection.featuresPermission;
        var finish = visiblePermIndex(list, 'finish_match');
        var pay = visiblePermIndex(list, 'manage_payment');
        var authMain = moreMenu.FEATURES_PERMISSION.filter(function (f) {
          return f && !moreMenu.FEATURES_PERMISSION_FOOTER_KEYS[f.permission];
        });
        return (
          finish >= 0 &&
          pay >= 0 &&
          finish === list.length - 1 &&
          finish > pay &&
          permIndex(list, 'cancel_match') < 0 &&
          permIndex(list, 'close_registration') < 0 &&
          slotCol(list, 'permission_management') ===
            slotCol(authMain, 'permission_management') &&
          slotCol(list, 'manage_payment') === slotCol(authMain, 'manage_payment') &&
          slotCol(list, 'manage_players') === slotCol(authMain, 'manage_players')
        );
      })() &&
      visiblePermIndex(r1Sheet.roundSection.featuresPermission, 'finish_match') < 0
  );
  assert(
    '主区相对序：权限/收费/选手/分组/出发与权威主区一致（无生命周期占位插空）',
    (function () {
      var list = r2Sheet.roundSection.featuresPermission.filter(function (f) {
        return f && !f.placeholder && f.permission !== 'finish_match';
      });
      var auth = moreMenu.FEATURES_PERMISSION.filter(function (f) {
        return f && !moreMenu.FEATURES_PERMISSION_FOOTER_KEYS[f.permission];
      });
      var keys = [
        'edit_groups',
        'manage_tee_sheet',
        'permission_management',
        'manage_payment',
        'manage_players',
        'edit_match',
        'edit_half',
        'net_score'
      ];
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var a = visiblePermIndex(list, k);
        var b = visiblePermIndex(auth, k);
        if (a < 0 || b < 0) continue;
        if (a !== b) return false;
      }
      return true;
    })()
  );
  assert(
    '槽位矩阵可打印（R2 本轮管理）',
    (function () {
      console.log('--- Series R2 featuresCommon (应为空) ---');
      matrixRows(r2Sheet.roundSection.featuresCommon).forEach(function (r) {
        console.log(r);
      });
      console.log('--- Series R2 featuresPermission ---');
      matrixRows(r2Sheet.roundSection.featuresPermission).forEach(function (r) {
        console.log(r);
      });
      return (
        r2Sheet.roundSection.featuresCommon.length === 0 &&
        r2Sheet.roundSection.featuresPermission.length >= 8 &&
        visiblePermIndex(r2Sheet.roundSection.featuresPermission, 'finish_match') >= 0
      );
    })()
  );

  var normalR1 = sheetVm.buildSeriesManageSheetViewModel({
    series: series,
    user: { userId: 'user-normal', name: '普通' },
    canManageSeries: false,
    canRegisterForOther: true,
    selectedRoundId: 'r1',
    gate: r1Gate,
    getMatchById: function () {
      return stationMatch('r1', 'm1', 'registering');
    }
  });
  assert(
    '普通用户选 R1：可见领先榜/统计，无本轮管理按钮',
    normalR1.showRoundPicker === true &&
      normalR1.showRoundManage === false &&
      normalR1.roundViewSection.gateOk &&
      normalR1.roundViewSection.features.length === 4 &&
      visiblePermIndex(normalR1.roundViewSection.features, 'leaderboard') === 0 &&
      visiblePermIndex(normalR1.roundViewSection.features, 'stats') === 1 &&
      normalR1.roundSection.hasSelection === false &&
      normalR1.roundSection.featuresPermission.length === 0
  );

  var badGate = gate.verifyManagedStationForManage({
    series: series,
    roundId: 'r1',
    getMatchById: function () {
      return makeMatch({
        matchId: 'm1',
        seriesContext: {
          managed: true,
          seriesId: 's1',
          roundId: 'r1',
          publishToken: 'WRONG'
        }
      });
    },
    getIndexByMatchId: function () {
      return { seriesId: 's1', roundId: 'r1', matchId: 'm1' };
    }
  });
  var badSheet = sheetVm.buildSeriesManageSheetViewModel({
    series: series,
    user: user,
    canManageSeries: true,
    canRegisterForOther: true,
    selectedRoundId: 'r1',
    gate: badGate
  });
  assert(
    '坏分站只影响本轮容器，Series 区仍可渲染',
    badSheet.seriesScope.featuresCommon.length === 2 &&
      badSheet.seriesScope.featuresManage.length === 4 &&
      badSheet.seriesScope.featuresManage[0].permission === 'edit_series' &&
      badSheet.roundViewSection.hasSelection &&
      !badSheet.roundViewSection.gateOk &&
      badSheet.roundViewSection.features.length === 0 &&
      badSheet.roundSection.hasSelection &&
      !badSheet.roundSection.gateOk &&
      badSheet.roundSection.featuresCommon.length === 0 &&
      !!badSheet.roundSection.gateMessage
  );

  var invitePath = sheetVm.buildSeriesInviteSharePath('series-abc');
  assert(
    '邀请 path 含 seriesId+tab=register 且无 matchId/preview',
    invitePath.indexOf('/subpackages/tournament/pages/series-detail/index') === 0 &&
      invitePath.indexOf('seriesId=series-abc') >= 0 &&
      invitePath.indexOf('tab=register') >= 0 &&
      invitePath.indexOf('matchId') < 0 &&
      invitePath.indexOf('preview') < 0 &&
      invitePath.indexOf('accessCode') < 0
  );
})();

(function testSeriesPageWiring() {
  var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');
  var pageWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
  var pageWxss = fs.readFileSync(path.join(pageDir, 'index.wxss'), 'utf8');
  var sheetVmSrc = fs.readFileSync(
    path.join(pageDir, 'seriesManageSheetViewModel.js'),
    'utf8'
  );

  var commonIdx = pageWxml.indexOf('fst-main">普通功能');
  var manageIdx = pageWxml.indexOf('fst-main">系列赛管理');
  var roundPickIdx = pageWxml.indexOf('fst-main">选择轮次');
  var roundViewIdx = pageWxml.indexOf('series-manage-round-view-section');
  var roundManageIdx = pageWxml.indexOf('series-manage-round-section');
  var unifiedCount = (pageWxml.match(/series-manage-unified-sheet/g) || []).length;
  var showMoreCount = (pageWxml.match(/wx:if="\{\{showMoreSheet\}\}"/g) || []).length;

  assert(
    '仅一个统一 M sheet，无第二层/旧轮次 sheet',
    unifiedCount === 1 &&
      showMoreCount === 2 &&
      pageWxml.indexOf('manageRoundPickerVisible') < 0 &&
      pageWxml.indexOf('series-manage-round-sheet') < 0 &&
      pageWxml.indexOf('返回轮次') < 0 &&
      pageJs.indexOf('manageRoundPickerVisible') < 0
  );
  assert(
    'DOM 顺序：普通功能 → 系列赛管理 → 选择轮次 → 本轮普通功能 → 本轮管理',
    commonIdx >= 0 &&
      manageIdx > commonIdx &&
      roundPickIdx > manageIdx &&
      roundViewIdx > roundPickIdx &&
      roundManageIdx > roundViewIdx &&
      pageWxml.indexOf('seriesManageShowRound') >= 0 &&
      pageWxml.indexOf('seriesManageFeaturesCommon') >= 0 &&
      pageWxml.indexOf('seriesManageFeaturesManage') >= 0
  );
  assert(
    '统一面板接线：选轮原地更新 + Series/本轮分流',
    pageJs.indexOf('openSeriesManageSheet') >= 0 &&
      pageJs.indexOf('onManageRoundPick') >= 0 &&
      pageJs.indexOf('_buildSeriesManageSheetPatch') >= 0 &&
      pageJs.indexOf('onSeriesScopeFeatureTap') >= 0 &&
      pageJs.indexOf('onSeriesManageFeatureTap') >= 0 &&
      pageJs.indexOf('_goSeriesManageScheduleRound') >= 0 &&
      pageJs.indexOf('_goSeriesManageStandingsRound') >= 0 &&
      pageWxml.indexOf('onSeriesScopeFeatureTap') >= 0 &&
      pageWxml.indexOf('onSeriesManageFeatureTap') >= 0 &&
      pageWxml.indexOf('记分') < 0
  );
  assert(
    '普通代报名与管理开关分离；本轮管理再验权（选轮不要求管理员）',
    pageJs.indexOf('canRegisterForOther') >= 0 &&
      pageJs.indexOf('canManageRegistration') >= 0 &&
      pageJs.indexOf('_isSeriesManageActor') >= 0 &&
      /toggleSeriesRegistrationState:[\s\S]{0,500}isSeriesHostPrivileged/.test(pageJs) &&
      /onSeriesManageFeatureTap:[\s\S]{0,400}_isSeriesManageActor/.test(pageJs) &&
      !/onManageRoundPick:[\s\S]{0,500}_isSeriesManageActor/.test(pageJs) &&
      pageJs.indexOf('openProxyRegisterSheet') >= 0 &&
      pageJs.indexOf('shareSeriesInvite') >= 0 &&
      pageJs.indexOf('registerForOther') >= 0 &&
      pageJs.indexOf('_verifyCurrentManageStation') >= 0
  );
  assert(
    '取消系列赛安全禁用，不走 purge/cancel_match',
    pageJs.indexOf('cancel_series') >= 0 &&
      pageJs.indexOf('功能即将开放') >= 0 &&
      pageJs.indexOf('purgeTeamMatchCompletely') < 0 &&
      pageWxml.indexOf('seriesManageFeaturesManage') >= 0 &&
      pageWxss.indexOf('series-manage-unified-sheet') >= 0
  );
  assert(
    '管理操作 UI：复用四列 series-manage-feature-grid，无二按钮专用布局',
    pageWxml.indexOf('series-manage-admin-actions') < 0 &&
      pageWxml.indexOf('series-manage-admin-action') < 0 &&
      pageWxss.indexOf('.series-manage-admin-actions') < 0 &&
      /wx:for="\{\{seriesManageFeaturesManage\}\}"/.test(pageWxml) &&
      pageWxml.indexOf('seriesManageFeaturesDanger') < 0 &&
      (function () {
        var m = pageWxml.indexOf('wx:for="{{seriesManageFeaturesManage}}"');
        if (m < 0) return false;
        var before = pageWxml.lastIndexOf('series-manage-feature-grid', m);
        var section = pageWxml.lastIndexOf('seriesManageCanManage', m);
        return before > section && section >= 0;
      })() &&
      pageWxml.indexOf('onSeriesScopeFeatureTap') >= 0 &&
      pageJs.indexOf('toggleSeriesRegistrationState') >= 0 &&
      pageJs.indexOf('purgeTeamMatchCompletely') < 0
  );
  assert(
    'C3-U/M-GRID：本轮与上方共用 series-manage-feature-grid；无独立 lifecycle/start；无「本轮管理」标题',
    pageWxml.indexOf('series-manage-lifecycle-actions') < 0 &&
      pageWxss.indexOf('.series-manage-lifecycle-actions') < 0 &&
      pageWxml.indexOf('series-manage-feature-grid') >= 0 &&
      pageWxss.indexOf('.series-manage-feature-grid') >= 0 &&
      pageWxml.indexOf('featuresPermissionFooterPad') < 0 &&
      pageWxml.indexOf('featuresPermissionFooter') < 0 &&
      pageWxml.indexOf('fst-main">本轮管理') < 0 &&
      pageWxml.indexOf('fst-main">普通功能') >= 0 &&
      /wx:for="\{\{roundManageSection\.featuresPermission\}\}"/.test(pageWxml) &&
      pageWxml.indexOf('wx:key="slotKey"') >= 0 &&
      sheetVmSrc.indexOf('projectRoundManageSlots') >= 0 &&
      sheetVmSrc.indexOf('SERIES_ROUND_TAIL_REGISTERING') >= 0 &&
      sheetVmSrc.indexOf("SERIES_ROUND_TAIL_REGISTERING = ['start_match']") >= 0 &&
      sheetVmSrc.indexOf('padCount') < 0 &&
      pageJs.indexOf("permission.indexOf('__pad_')") >= 0 &&
      (function () {
        var m = pageWxml.indexOf(
          'wx:for="{{roundManageSection.featuresPermission}}"'
        );
        if (m < 0) return false;
        var before = pageWxml.lastIndexOf(
          'class="series-manage-feature-grid"',
          m
        );
        var section = pageWxml.lastIndexOf('series-manage-round-section', m);
        return before > section && section >= 0;
      })()
  );
  assert(
    '无旧顶层菜单镜像 setData（roundView + roundManage 承载）',
    pageJs.indexOf('兼容旧字段') < 0 &&
      !/return \{[\s\S]*featuresCommon: round\.featuresCommon/.test(pageJs) &&
      pageJs.indexOf('roundManageSection: round') >= 0 &&
      pageJs.indexOf('roundViewSection: roundView') >= 0
  );
  assert(
    '本轮普通功能接线：选轮不要求管理员；统计复用 pages/stats',
    pageJs.indexOf('onSeriesRoundViewFeatureTap') >= 0 &&
      pageWxml.indexOf('onSeriesRoundViewFeatureTap') >= 0 &&
      pageWxml.indexOf('roundViewSection') >= 0 &&
      pageJs.indexOf('_openSeriesRoundStatsPage') >= 0 &&
      pageJs.indexOf('pages/stats/index') >= 0 &&
      pageJs.indexOf('roundSubtitle') >= 0 &&
      !/onManageRoundPick:[\s\S]{0,500}_isSeriesManageActor/.test(pageJs) &&
      pageJs.indexOf('_openSeriesRoundLeaderboardSettingSheet') >= 0 &&
      pageJs.indexOf('leaderboard-setting-sheet') < 0 &&
      pageWxml.indexOf('leaderboard-setting-sheet') >= 0
  );
  assert(
    '统计不经隐藏 ROUND detail',
    !/_openSeriesRoundStatsPage:[\s\S]{0,800}pages\/detail\/index/.test(pageJs) &&
      !/_openSeriesRoundStatsPage:[\s\S]{0,800}fromSeries=1/.test(pageJs)
  );
  assert(
    '普通 detail M 菜单源未改（仍含 leaderboard/stats common）',
    detailJs.indexOf("permission === 'stats'") >= 0 &&
      detailJs.indexOf("permission === 'leaderboard'") >= 0 &&
      moreMenu.FEATURES_COMMON.some(function (f) {
        return f.permission === 'stats';
      }) &&
      moreMenu.FEATURES_COMMON.some(function (f) {
        return f.permission === 'leaderboard';
      })
  );
  assert(
    '不整页用 detail 承载 M 面板',
    pageJs.indexOf('openMore=1') < 0 &&
      pageJs.indexOf('showMoreSheet=1') < 0
  );
  assert(
    'SERIES_SCOPE_PERMISSIONS 已导出且 detail 默认 managedSeriesMode false',
    !!moreMenu.SERIES_SCOPE_PERMISSIONS &&
      !!moreMenu.SERIES_SCOPE_PERMISSIONS.register_for_other &&
      detailJs.indexOf('managedSeriesMode: false') >= 0
  );
  assert(
    'E1：Series M 编辑本轮进向导；detail 仍用修改比赛文案源',
    pageJs.indexOf('mode=edit_round') >= 0 &&
      /permission === 'edit_match'[\s\S]{0,2500}create\/pages\/series\/index\?mode=edit_round/.test(
        pageJs
      ) &&
      sheetVmSrc.indexOf("label: '编辑本轮'") >= 0 &&
      detailJs.indexOf("permission === 'edit_match'") >= 0 &&
      detailJs.indexOf('mode=edit_round') < 0
  );
  assert(
    'E2：修改系列赛进 edit_series，不要求选轮',
    pageJs.indexOf('mode=edit_series') >= 0 &&
      /permission === 'edit_series'[\s\S]{0,2500}create\/pages\/series\/index\?mode=edit_series/.test(
        pageJs
      ) &&
      sheetVmSrc.indexOf("label: '修改系列赛'") >= 0 &&
      pageJs.indexOf('gb_series_edit_series_return_v1') >= 0
  );
})();

console.log('');
console.log('---- seriesManageM.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
