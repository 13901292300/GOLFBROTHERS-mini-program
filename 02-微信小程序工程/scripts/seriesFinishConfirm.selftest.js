/**
 * 轮次结束确认 + 系列赛双确认
 * 运行：node scripts/seriesFinishConfirm.selftest.js
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

var root = path.join(__dirname, '..');
var utilsDir = path.join(root, 'miniprogram', 'utils');
var seriesDir = path.join(
  root,
  'miniprogram',
  'subpackages',
  'tournament',
  'pages',
  'series-detail'
);

var finalize = require(path.join(utilsDir, 'seriesFinalize.js'));
var teamMatchFinish = require(path.join(utilsDir, 'teamMatchFinish.js'));

var pageJs = fs.readFileSync(path.join(seriesDir, 'index.js'), 'utf8');
var detailJs = fs.readFileSync(
  path.join(root, 'miniprogram', 'subpackages', 'tournament', 'pages', 'detail', 'index.js'),
  'utf8'
);
var finalizeJs = fs.readFileSync(path.join(utilsDir, 'seriesFinalize.js'), 'utf8');

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

function freeze(v) {
  return JSON.parse(JSON.stringify(v));
}

function matchOf(over) {
  return Object.assign(
    {
      matchId: 'm1',
      status: 'ongoing',
      groups: [{ groupId: 'g1', status: 'ongoing', players: [{ userId: 'u1' }] }],
      seriesContext: { managed: true, seriesId: 's1', roundId: 'r1', publishToken: 'tok' }
    },
    over || {}
  );
}

function seriesOf(over) {
  return Object.assign(
    {
      seriesId: 's1',
      lifecycleStatus: 'published',
      competitionPhaseCache: 'live',
      registrationState: 'open',
      registrationRevision: 2,
      createdBy: 'admin',
      hostMode: 'organization',
      scoringRule: { mode: 'global_m', topM: 3 },
      rounds: [
        { roundId: 'r1', index: 1, matchId: 'm1', dateTime: '2026-08-12 08:00', courseId: 'a' },
        { roundId: 'r2', index: 2, matchId: 'm2', dateTime: '2026-08-13 08:00', courseId: 'a' },
        { roundId: 'r3', index: 3, matchId: 'm3', dateTime: '2026-08-14 08:00', courseId: 'a' }
      ]
    },
    over || {}
  );
}

function getMatchFn(map) {
  return function (id) {
    return map[id] || null;
  };
}

(function r1Warning() {
  var series = seriesOf();
  var modal = finalize.getStationFinishModalContent(series, 'r1');
  assert(
    '结束 R1 时显示正确警告',
    modal.title === '结束本轮比赛' &&
      modal.confirmText === '确定结束' &&
      modal.cancelText === '取消' &&
      modal.roundLabel === 'R1' &&
      modal.content ===
        '您正在操作 R1 轮次的结束比赛，一旦结束，所有成绩将不可修改，是否确定？'
  );
})();

(function courseC1() {
  var series = seriesOf({
    rounds: [
      {
        roundId: 'east',
        index: 1,
        matchId: 'm1',
        dateTime: '2026-08-11 08:00',
        courseId: 'east',
        courseName: '东场',
        front9Course: 'A',
        back9Course: 'B'
      },
      {
        roundId: 'west',
        index: 2,
        matchId: 'm2',
        dateTime: '2026-08-11 13:00',
        courseId: 'west',
        courseName: '西场',
        front9Course: 'C',
        back9Course: 'D'
      }
    ]
  });
  var modal = finalize.getStationFinishModalContent(series, 'east');
  assert(
    'COURSE 场景显示 C1，不误显示 R1',
    modal.roundLabel === 'C1' &&
      modal.content.indexOf('C1') >= 0 &&
      modal.content.indexOf('R1') < 0
  );
})();

assert(
  '取消轮次结束时页面先弹窗且确认前不调用 confirmFinish',
  /permission === 'finish_match'[\s\S]{0,900}getStationFinishModalContent[\s\S]{0,400}wx\.showModal[\s\S]{0,500}if \(!res \|\| !res\.confirm\)/.test(
    pageJs
  ) &&
    pageJs.indexOf('_stationFinishBusy') >= 0
);

assert(
  '确认后才调用轮次结束公共服务',
  /getStationFinishModalContent[\s\S]{0,2500}confirmFinishWholeTeamMatch/.test(pageJs)
);

assert(
  '已完成轮不重复弹窗',
  /finish_match[\s\S]{0,900}isMatchCompleted[\s\S]{0,200}MATCH_FINISHED_TOAST/.test(pageJs)
);

(function allDoneTwoStep() {
  var series = seriesOf();
  var map = {
    m1: matchOf({ matchId: 'm1', status: 'finished', seriesContext: { managed: true, seriesId: 's1', roundId: 'r1' } }),
    m2: matchOf({ matchId: 'm2', status: 'finished', seriesContext: { managed: true, seriesId: 's1', roundId: 'r2' } }),
    m3: matchOf({ matchId: 'm3', status: 'finished', seriesContext: { managed: true, seriesId: 's1', roundId: 'r3' } })
  };
  var first = finalize.getManualFinishFirstConfirm(series, getMatchFn(map));
  var second = finalize.getManualFinishSecondConfirm(series, getMatchFn(map));
  assert(
    '全部轮完成时使用普通确认＋最终红色确认',
    first.title === '结束系列赛' &&
      first.content ===
        '系列赛结束后，所有轮次、成绩及赛事设置将被锁定且不可修改，是否继续？' &&
      first.confirmText === '继续' &&
      !first.hasUnfinishedRounds &&
      second.title === '最终确认' &&
      second.confirmText === '确认结束' &&
      second.confirmColor === '#dc2626' &&
      second.content.indexOf('⚠') === 0 &&
      second.content.indexOf('此操作不可撤销') >= 0
  );
})();

(function unfinishedTwoWindows() {
  var series = seriesOf();
  var map = {
    m1: matchOf({ matchId: 'm1', status: 'finished', seriesContext: { managed: true, seriesId: 's1', roundId: 'r1' } }),
    m2: matchOf({ matchId: 'm2', status: 'ongoing', seriesContext: { managed: true, seriesId: 's1', roundId: 'r2' } }),
    m3: matchOf({ matchId: 'm3', status: 'ongoing', seriesContext: { managed: true, seriesId: 's1', roundId: 'r3' } })
  };
  var first = finalize.getManualFinishFirstConfirm(series, getMatchFn(map));
  var second = finalize.getManualFinishSecondConfirm(series, getMatchFn(map));
  assert(
    '有未完成轮时两个窗口都明确列出轮次',
    first.title === '系列赛尚未全部完成' &&
      first.content.indexOf('当前仍有 R2、R3 未完成') === 0 &&
      second.title === '警告：仍有轮次未完成' &&
      second.content.indexOf('仍有 R2、R3 未完成') >= 0 &&
      second.confirmText === '强制结束' &&
      second.confirmColor === '#dc2626' &&
      second.content.indexOf('⚠') === 0 &&
      second.content.indexOf('不会自动生成缺失成绩') >= 0
  );
})();

assert(
  '系列赛结束必须经过两次确认',
  pageJs.indexOf('getManualFinishFirstConfirm') >= 0 &&
    pageJs.indexOf('_promptFinishSeriesDanger') >= 0 &&
    pageJs.indexOf('getManualFinishSecondConfirm') >= 0 &&
    /_confirmFinishSeries:[\s\S]*?getManualFinishFirstConfirm[\s\S]*?showModal[\s\S]*?_promptFinishSeriesDanger/.test(
      pageJs
    ) &&
    /_promptFinishSeriesDanger:[\s\S]*?getManualFinishSecondConfirm[\s\S]*?showModal[\s\S]*?_runManualFinishSeries/.test(
      pageJs
    )
);

assert(
  '第一步取消、第二步取消均零写入',
  /getManualFinishFirstConfirm[\s\S]{0,800}if \(!res \|\| !res\.confirm\)[\s\S]{0,80}release\(/.test(
    pageJs
  ) &&
    /getManualFinishSecondConfirm[\s\S]{0,900}if \(!res \|\| !res\.confirm\)[\s\S]{0,80}release\(/.test(
      pageJs
    ) &&
    /_runManualFinishSeries:[\s\S]{0,200}finalizeSeries/.test(pageJs)
);

assert(
  '第二次确认前重新读取最新轮次状态',
  /_promptFinishSeriesDanger:[\s\S]{0,800}getSeriesById[\s\S]{0,800}getManualFinishSecondConfirm/.test(
    pageJs
  )
);

(function staleUnfinishedRejected() {
  var series = seriesOf();
  var store = {
    getSeriesById: function () {
      return freeze(series);
    },
    upsertSeriesChecked: function () {
      return { ok: true, series: freeze(series) };
    }
  };
  var map = {
    m1: matchOf({ matchId: 'm1', status: 'finished' }),
    m2: matchOf({ matchId: 'm2', status: 'ongoing' }),
    m3: matchOf({ matchId: 'm3', status: 'ongoing' })
  };
  var result = finalize.finalizeSeries({
    seriesId: 's1',
    source: 'manual',
    actor: { userId: 'admin' },
    seriesStore: store,
    getMatchById: getMatchFn(map),
    expectedUnfinishedRoundIds: ['r2']
  });
  assert(
    '第二次确认后校验最新未完成轮次',
    !result.ok && result.reason === 'unfinished_rounds_changed'
  );
})();

(function forceDoesNotForge() {
  var series = seriesOf();
  var map = {
    m1: matchOf({ matchId: 'm1', status: 'finished' }),
    m2: matchOf({ matchId: 'm2', status: 'registering' }),
    m3: matchOf({ matchId: 'm3', status: 'ongoing' })
  };
  var before2 = freeze(map.m2);
  var before3 = freeze(map.m3);
  var store = {
    bag: freeze(series),
    getSeriesById: function () {
      return freeze(this.bag);
    },
    upsertSeriesChecked: function (next) {
      this.bag = freeze(next);
      return { ok: true, series: freeze(next) };
    }
  };
  var result = finalize.finalizeSeries({
    seriesId: 's1',
    source: 'manual',
    actor: { userId: 'admin' },
    seriesStore: store,
    getMatchById: getMatchFn(map)
  });
  assert(
    '强制结束不生成缺失成绩、不篡改轮次历史状态',
    result.ok &&
      map.m2.status === before2.status &&
      map.m3.status === before3.status &&
      !map.m2.scoreData &&
      store.bag.competitionPhaseCache === 'completed'
  );
})();

assert(
  '双击不会产生多个流程',
  pageJs.indexOf('if (this._seriesFinishBusy) return') >= 0 &&
    pageJs.indexOf('if (selfFinish._stationFinishBusy) return') >= 0
);

assert(
  '确认链期间结束按钮进入处理中',
  fs
    .readFileSync(path.join(seriesDir, 'seriesManageSheetViewModel.js'), 'utf8')
    .indexOf("src.seriesFinishBusy ? '处理中'") >= 0 &&
    pageJs.indexOf('seriesFinishBusy: !!this._seriesFinishBusy') >= 0
);

assert(
  '自动完成不弹人工双确认',
  (function () {
    var idx = finalizeJs.indexOf('function maybeFinalizeAfterStationPersisted');
    var end = finalizeJs.indexOf('\nmodule.exports', idx);
    var slice =
      idx >= 0 ? finalizeJs.slice(idx, end > idx ? end : idx + 1200) : '';
    return (
      slice.indexOf("source: 'auto'") >= 0 &&
      slice.indexOf('getManualFinishFirstConfirm') < 0 &&
      slice.indexOf('getManualFinishSecondConfirm') < 0 &&
      slice.indexOf('showModal') < 0
    );
  })()
);

(function writeFailNoSuccess() {
  var series = seriesOf();
  var store = {
    getSeriesById: function () {
      return freeze(series);
    },
    upsertSeriesChecked: function () {
      return { ok: false, reason: 'storage_write_failed' };
    }
  };
  var map = {
    m1: matchOf({ matchId: 'm1', status: 'finished' }),
    m2: matchOf({ matchId: 'm2', status: 'finished' }),
    m3: matchOf({ matchId: 'm3', status: 'finished' })
  };
  var result = finalize.finalizeSeries({
    seriesId: 's1',
    source: 'manual',
    actor: { userId: 'admin' },
    seriesStore: store,
    getMatchById: getMatchFn(map)
  });
  assert(
    '写入失败不显示成功、不形成部分结束',
    !result.ok &&
      series.competitionPhaseCache === 'live' &&
      series.registrationState === 'open' &&
      /_runManualFinishSeries:[\s\S]*?if \(!result \|\| !result\.ok\)[\s\S]*?showToast[\s\S]*?return;[\s\S]*?系列赛已结束/.test(
        pageJs
      )
  );
})();

assert(
  '普通单场结束流程回归不受影响',
  detailJs.indexOf('getFinishMatchModalContent') >= 0 &&
    pageJs.indexOf('getStationFinishModalContent') >= 0 &&
    teamMatchFinish.getFinishMatchModalContent({ status: 'ongoing', gameMode: 'stroke' })
      .title === '结束比赛'
);

assert(
  '危险确认复用项目红且带警告图标',
  finalize.DANGER_CONFIRM_COLOR === '#dc2626' &&
    finalize.DANGER_WARNING_ICON === '⚠' &&
    pageJs.indexOf('confirmColor: second.confirmColor') >= 0
);

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  failures.forEach(function (f) {
    console.log('  - ' + f);
  });
  process.exit(1);
}
