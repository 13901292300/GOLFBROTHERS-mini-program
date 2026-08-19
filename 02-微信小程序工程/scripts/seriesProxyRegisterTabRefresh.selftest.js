/**
 * Series 替他人报名成功后，报名 Tab 立即按最新 roster 重建。
 * 不写生产 storage；不改好友页 / WXML。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesProxyRegisterTabRefresh.selftest.js
 */

var path = require('path');
var fs = require('fs');

var pageDir = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail'
);
var registerVm = require(path.join(pageDir, 'seriesRegisterViewModel.js'));
var proxyVm = require(path.join(pageDir, 'seriesProxyRegisterViewModel.js'));
var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');

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

function entry(over) {
  return Object.assign(
    {
      rosterEntryId: 're-1',
      playerId: 'u-1',
      userId: 'u-1',
      playerNameSnapshot: '甲',
      seriesParticipantId: 'team:1',
      registrationStatus: 'registered',
      registrationSource: 'proxy'
    },
    over || {}
  );
}

function seriesOf(roster, rev) {
  return {
    seriesId: 'series-proxy-tab',
    lifecycleStatus: 'published',
    hostMode: 'organization',
    registrationState: 'open',
    registrationRevision: rev == null ? 1 : rev,
    competitionPhaseCache: 'registration',
    participants: [
      {
        seriesParticipantId: 'team:1',
        kind: 'team',
        sourceTeamId: '1',
        nameSnapshot: '甲队'
      },
      {
        seriesParticipantId: 'team:2',
        kind: 'team',
        sourceTeamId: '2',
        nameSnapshot: '乙队'
      }
    ],
    roster: roster
  };
}

function displayIds(vm) {
  return (vm.registerDisplayUsers || []).map(function (u) {
    return u.playerId;
  });
}

function project(series, activeId) {
  return registerVm.buildSeriesRegisterViewModel({
    series: series,
    lifecycleAccess: { ok: true, lifecycleStatus: 'published', isDraftPreview: false },
    activeParticipantId: activeId || 'team:1',
    registrationContext: {
      resolved: true,
      identityOk: true,
      playerId: 'actor-1',
      eligibleParticipantIds: ['team:1', 'team:2'],
      ineligibleMessage: ''
    }
  });
}

assert(
  '权威 Series 优先 storage，而不是提交前快照',
  registerVm.pickAuthoritativeSeriesForRegisterRefresh({
    storeSeries: { seriesId: 's', registrationRevision: 4, roster: [entry()] },
    resultSeries: null,
    fallbackSeries: { seriesId: 's', registrationRevision: 3, roster: [] }
  }).registrationRevision === 4
);

assert(
  '无 storage 时才用 result.series',
  registerVm.pickAuthoritativeSeriesForRegisterRefresh({
    storeSeries: null,
    resultSeries: { seriesId: 's', registrationRevision: 5 },
    fallbackSeries: { seriesId: 's', registrationRevision: 3 }
  }).registrationRevision === 5
);

(function testAddShowsImmediately() {
  var before = seriesOf([], 1);
  var after = seriesOf(
    [entry({ rosterEntryId: 're-new', playerId: 'u-new', playerNameSnapshot: '新选手' })],
    2
  );
  var stale = project(before, 'team:1');
  var fresh = project(
    registerVm.pickAuthoritativeSeriesForRegisterRefresh({
      storeSeries: after,
      fallbackSeries: before
    }),
    'team:1'
  );
  assert('失败前列表为空', displayIds(stale).length === 0);
  assert(
    '替他人报名成功后报名 Tab 立即出现新选手',
    displayIds(fresh).indexOf('u-new') >= 0 && fresh.registerTotalCount === 1,
    JSON.stringify(displayIds(fresh))
  );
  assert('revision 随最新 roster', fresh.registrationRevision === 2);
})();

(function testMixedMatchesLatestRoster() {
  var before = seriesOf(
    [
      entry({ rosterEntryId: 're-keep', playerId: 'u-keep', playerNameSnapshot: '留' }),
      entry({ rosterEntryId: 're-drop', playerId: 'u-drop', playerNameSnapshot: '删' })
    ],
    2
  );
  var after = seriesOf(
    [
      entry({ rosterEntryId: 're-keep', playerId: 'u-keep', playerNameSnapshot: '留' }),
      Object.assign(
        entry({ rosterEntryId: 're-drop', playerId: 'u-drop', playerNameSnapshot: '删' }),
        { registrationStatus: 'cancelled' }
      ),
      entry({ rosterEntryId: 're-add', playerId: 'u-add', playerNameSnapshot: '增' })
    ],
    3
  );
  var vm = project(after, 'team:1');
  var ids = displayIds(vm);
  assert(
    'mixed 增删后列表与最新 roster 一致',
    ids.indexOf('u-keep') >= 0 &&
      ids.indexOf('u-add') >= 0 &&
      ids.indexOf('u-drop') < 0 &&
      vm.registerTotalCount === 2,
    JSON.stringify(ids)
  );
  assert('已取消项不显示为 active', ids.indexOf('u-drop') < 0);
  var keys = (vm.registerDisplayUsers || []).map(function (u) {
    return u.listKey;
  });
  assert(
    '新增选手显示一次且 listKey 不重复',
    keys.length === 2 && keys.indexOf('re-add') >= 0 && keys[0] !== keys[1]
  );
})();

(function testFailureKeepsOldProjection() {
  var before = seriesOf([entry()], 1);
  var vm = project(before, 'team:1');
  assert('失败时列表不变化', displayIds(vm).join(',') === 'u-1' && vm.registrationRevision === 1);
})();

(function testEpoch() {
  var epoch = 0;
  epoch = registerVm.bumpRegisterRenderEpoch(epoch);
  var started = epoch;
  epoch = registerVm.bumpRegisterRenderEpoch(epoch);
  assert('更新的 render epoch 拒绝旧回调', registerVm.canApplyRegisterRender(epoch, started) === false);
  assert('当前 epoch 可落地', registerVm.canApplyRegisterRender(epoch, epoch) === true);
})();

(function testPickerReopen() {
  var after = seriesOf(
    [
      entry({
        rosterEntryId: 're-new',
        playerId: 'u-new',
        playerNameSnapshot: '新选手',
        registeredByUserId: 'actor-1'
      }),
      Object.assign(entry({ rosterEntryId: 're-old', playerId: 'u-old' }), {
        registrationStatus: 'cancelled'
      })
    ],
    2
  );
  var users = proxyVm.buildProxyRegisterUsersFromRoster(after, 'actor-1');
  var ids = users.map(function (u) {
    return u.playerId;
  });
  assert(
    '关闭并重新打开 picker 选中态来自最新 active roster',
    ids.indexOf('u-new') >= 0 && ids.indexOf('u-old') < 0 && users.length === 1,
    JSON.stringify(ids)
  );
})();

assert(
  '成功路径从 storage 取最新 Series，不使用提交前快照优先',
  /_applySeriesProxyCommitPlan:[\s\S]{0,9000}var lastSeries = seriesStore\.getSeriesById\(this\._seriesId\) \|\| result\.series \|\| series;/.test(
    pageJs
  )
);

assert(
  '成功后从最新 Series 重建报名列表',
  /_applySeriesProxyCommitPlan:[\s\S]{0,9000}_applyRegisterWriteSuccess\(/.test(pageJs) &&
    /_applyRegisterWriteSuccess:[\s\S]{0,3500}pickAuthoritativeSeriesForRegisterRefresh\(/.test(
      pageJs
    ) &&
    /_applyRegisterWriteSuccess:[\s\S]{0,2500}seriesStore\.getSeriesById\(this\._seriesId\)/.test(
      pageJs
    )
);

assert(
  'reloadViewModel 带 register render epoch，旧异步不能覆盖',
  /reloadViewModel:[\s\S]{0,400}bumpRegisterRenderEpoch/.test(pageJs) &&
    /reloadViewModel:[\s\S]{0,12000}canApplyRegisterRender\(this\._registerRenderEpoch, renderEpoch\)/.test(
      pageJs
    ) &&
    /_applyRegisterWriteSuccess:[\s\S]{0,1200}bumpRegisterRenderEpoch/.test(pageJs)
);

assert(
  '提交失败不走报名成功刷新',
  /_applySeriesProxyCommitPlan:[\s\S]{0,7500}_toastRegisterFailure\(\(result && result\.reason\) \|\| 'storage_write_failed'\)/.test(
    pageJs
  ) &&
    /_applySeriesProxyCommitPlan:[\s\S]{0,7500}if \(!result \|\| !result\.ok\) \{[\s\S]{0,1600}_toastRegisterFailure/.test(
      pageJs
    )
);

assert(
  '本人报名仍走 _applyRegisterWriteSuccess',
  /this\._registerSheetMode = 'self';\s*this\._applyRegisterWriteSuccess\(/.test(pageJs)
);

assert(
  '代取消仍 reloadViewModel，不在页面 append',
  /wx\.showToast\(\{ title: '已取消报名'[\s\S]{0,180}reloadViewModel\(\{ resetScroll: false \}\)/.test(
    pageJs
  )
);

assert(
  '管理员删除仍 reloadViewModel',
  /title: '已删除选手'[\s\S]{0,500}reloadViewModel\(\{ resetScroll: false \}\)/.test(pageJs)
);

assert(
  '每次打开 picker 仍从最新 Series roster 重建',
  /_openRegisterForOtherFriendsPicker:[\s\S]{0,800}seriesStore\.getSeriesById/.test(pageJs) &&
    /_openRegisterForOtherFriendsPicker:[\s\S]{0,900}_buildSeriesProxyRegisterUsers/.test(pageJs)
);

console.log('');
console.log('seriesProxyRegisterTabRefresh.selftest: ' + passed + ' passed, ' + failed + ' failed');
if (failed) {
  console.log('Failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
