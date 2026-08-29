/**
 * SERIES-CANCEL-LOCK-B1B：series-detail 本人取消 CTA 覆盖
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesCancelLockB1B.selftest.js
 */

var path = require('path');
var fs = require('fs');
var seriesTestPaths = require('./lib/seriesTestPaths.js');

if (typeof global.Page !== 'function') {
  global.Page = function (cfg) {
    return cfg;
  };
}
if (typeof global.wx === 'undefined') {
  global.wx = {
    getStorageSync: function () {
      return null;
    },
    setStorageSync: function () {},
    removeStorageSync: function () {},
    getSystemInfoSync: function () {
      return { windowWidth: 375, windowHeight: 667 };
    }
  };
}

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var pageDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');
var detailDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'detail');
var utilsDir = path.join(mini, 'utils');

var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');
var pageWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
var pageWxss = fs.readFileSync(path.join(pageDir, 'index.wxss'), 'utf8');
var detailJs = fs.readFileSync(path.join(detailDir, 'index.js'), 'utf8');
var pageIndex = require(path.join(pageDir, 'index.js'));
var registrationInteractionModel = require(seriesTestPaths.util('registrationInteractionModel.js'));
var seriesStationManageGate = require(path.join(utilsDir, 'seriesStationManageGate.js'));

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

var cancelCta = {
  label: registrationInteractionModel.resolveRegistrationCtaCopy('cancel'),
  disabled: false,
  action: 'cancel'
};
var registerCta = {
  label: registrationInteractionModel.resolveRegistrationCtaCopy('register'),
  disabled: false,
  action: 'register'
};

assert(
  '只改 series-detail 页脚本：reload 后 inspect + token，不改 WXML/WXSS/普通 detail',
  pageJs.indexOf('_applySelfCancelCtaInspectAfterReload') >= 0 &&
    pageJs.indexOf('inspectSelfCancellationImpact') >= 0 &&
    pageJs.indexOf('_selfCancelInspectToken') >= 0 &&
    /reloadViewModel:[\s\S]{0,400}_selfCancelInspectToken/.test(pageJs) &&
    /_safeSetData\(patch,[\s\S]{0,400}_applySelfCancelCtaInspectAfterReload/.test(pageJs) &&
    /onRegisterCtaTap:[\s\S]{0,350}if \(cta\.disabled\) return;/.test(pageJs) &&
    pageJs.indexOf('seriesRegistrationCancellationGate') < 0 &&
    pageWxml.indexOf('已有完赛成绩，不可取消报名') < 0 &&
    pageWxss.indexOf('selfCancelLock') < 0 &&
    detailJs.indexOf('_applySelfCancelCtaInspectAfterReload') < 0 &&
    detailJs.indexOf('inspectSelfCancellationImpact') < 0
);

// 1. finalized
(function () {
  var next = pageIndex.resolveSelfCancelLockCta(cancelCta, {
    ok: false,
    blockedReason: 'finalized_score'
  });
  assert(
    '1 finalized 覆盖 CTA',
    next.label === '已有完赛成绩，不可取消报名' &&
      next.disabled === true &&
      next.action === 'none'
  );
})();

// 2. LIVE 有成绩 CTA 可点击
(function () {
  var next = pageIndex.resolveSelfCancelLockCta(cancelCta, {
    ok: true,
    blockedReason: ''
  });
  var staleLive = pageIndex.resolveSelfCancelLockCta(cancelCta, {
    ok: false,
    blockedReason: 'live_score'
  });
  assert(
    '2 LIVE 有成绩保持取消报名可点击',
    next.label === '取消报名' && next.disabled === false && next.action === 'cancel'
  );
  assert(
    '2 不再把 live_score 置灰',
    staleLive.label === '取消报名' &&
      staleLive.disabled === false &&
      staleLive.action === 'cancel' &&
      pageJs.indexOf('SELF_CANCEL_CTA_LIVE') < 0 &&
      pageJs.indexOf("blocked === 'live_score'") < 0
  );
})();

// 3. 可取消
(function () {
  var next = pageIndex.resolveSelfCancelLockCta(cancelCta, {
    ok: true,
    blockedReason: ''
  });
  assert(
    '3 可取消保持现有状态',
    next.label === '取消报名' && next.disabled === false && next.action === 'cancel'
  );
})();

// 4. managed 异常
(function () {
  var next = pageIndex.resolveSelfCancelLockCta(cancelCta, {
    ok: false,
    blockedReason: 'managed_station_invalid'
  });
  assert(
    '4 managed 保留取消文案并禁用',
    next.label === '取消报名' &&
      next.disabled === true &&
      next.action === 'none' &&
      next.reason === 'managed_station_invalid' &&
      next.message === seriesStationManageGate.GATE_FAIL_MESSAGE &&
      next.message === '本轮比赛数据异常'
  );
})();

// 5. 未报名不受影响
(function () {
  var unreg = {
    currentUserRegistration: {
      identityOk: true,
      playerId: 'u1',
      isRegistered: false
    },
    cta: registerCta
  };
  assert(
    '5 未报名不视为 active self registration',
    pageIndex.hasActiveSelfRegistration(unreg) === false
  );
  assert(
    '5 未报名 CTA 保持立即报名',
    unreg.cta.label === '立即报名' &&
      unreg.cta.disabled === false &&
      unreg.cta.action === 'register' &&
      pageJs.indexOf('if (!hasActiveSelfRegistration(register)) return;') >= 0
  );
})();

// 6. 旧回调不覆盖新状态
(function () {
  var token1 = pageIndex.bumpSelfCancelInspectToken(0);
  var token2 = pageIndex.bumpSelfCancelInspectToken(token1);
  assert('6 token 递增', token1 === 1 && token2 === 2);
  assert(
    '6 旧 token 不可应用',
    pageIndex.canApplySelfCancelInspect(token2, token1) === false
  );
  assert(
    '6 新 token 可应用',
    pageIndex.canApplySelfCancelInspect(token2, token2) === true
  );

  var applied = null;
  var page = {
    _pageAlive: true,
    _selfCancelInspectToken: token2,
    data: {
      register: {
        currentUserRegistration: {
          identityOk: true,
          playerId: 'u1',
          isRegistered: true
        },
        cta: {
          label: '取消报名',
          disabled: false,
          action: 'cancel'
        }
      }
    },
    _safeSetData: function (patch) {
      applied = patch;
      if (patch && patch['register.cta']) {
        this.data.register.cta = patch['register.cta'];
      }
    }
  };
  assert(
    '6 提交前校验 token',
    pageJs.indexOf('_commitSelfCancelCtaLock: function') >= 0 &&
      pageJs.indexOf('canApplySelfCancelInspect(this._selfCancelInspectToken, inspectToken)') >= 0
  );

  if (!canApplyOn(page, token1)) {
    applied = 'blocked';
  } else {
    page._safeSetData({
      'register.cta': pageIndex.resolveSelfCancelLockCta(page.data.register.cta, {
        ok: false,
        blockedReason: 'finalized_score'
      })
    });
  }
  assert(
    '6 旧回调不写新 ViewModel',
    applied === 'blocked' &&
      page.data.register.cta.label === '取消报名' &&
      page.data.register.cta.disabled === false
  );

  function canApplyOn(inst, tok) {
    return pageIndex.canApplySelfCancelInspect(inst._selfCancelInspectToken, tok);
  }
})();

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failures.length) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
