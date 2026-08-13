/**
 * ROUND-DOCK-B1：赛程接入共享 series-round-selector-dock
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesRoundDockB1.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var pageDir = path.join(
  mini,
  'subpackages',
  'tournament',
  'pages',
  'series-detail'
);
var dockDir = path.join(mini, 'components', 'series-round-selector-dock');
var detailDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'detail');

var standingsVm = require(path.join(pageDir, 'seriesStandingsViewModel.js'));
var scheduleVm = require(path.join(pageDir, 'seriesScheduleViewModel.js'));
var roundInfo = require(path.join(pageDir, 'seriesRoundInfoText.js'));
var overflowArrows = require(path.join(dockDir, 'overflowArrows.js'));

var pageWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');
var pageJson = fs.readFileSync(path.join(pageDir, 'index.json'), 'utf8');
var dockWxml = fs.readFileSync(path.join(dockDir, 'index.wxml'), 'utf8');
var dockWxss = fs.readFileSync(path.join(dockDir, 'index.wxss'), 'utf8');
var dockJs = fs.readFileSync(path.join(dockDir, 'index.js'), 'utf8');

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

function extractFn(src, name) {
  var re = new RegExp(name + ':\\s*function\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n  \\},');
  var m = src.match(re);
  return m ? m[0] : '';
}

var dockRefs = pageWxml.match(/<series-round-selector-dock[\s\S]*?\/>/g) || [];
var standingsDocks = dockRefs.filter(function (s) {
  return s.indexOf('onStandingsRoundTap') >= 0;
});
var scheduleDocks = dockRefs.filter(function (s) {
  return s.indexOf('onScheduleRoundTap') >= 0;
});
var rebuildFn = extractFn(pageJs, '_rebuildScheduleProjection');
var tapFn = extractFn(pageJs, 'onScheduleRoundTap');

assert(
  '1 页面注册共享组件',
  pageJson.indexOf('series-round-selector-dock') >= 0 &&
    pageJson.indexOf('/components/series-round-selector-dock/index') >= 0
);

assert(
  '2 总榜/赛程 inflow+fixed 共四次引用同一组件',
  dockRefs.length === 4 &&
    standingsDocks.length === 2 &&
    scheduleDocks.length === 2 &&
    pageWxml.indexOf('seriesStandingsRoundBar') < 0 &&
    pageWxml.indexOf('seriesScheduleRoundBar') < 0
);

assert(
  '3 赛程无 TOT，总榜有 TOT',
  scheduleDocks.every(function (s) {
    return /show-tot="\{\{false\}\}"/.test(s);
  }) &&
    standingsDocks.every(function (s) {
      return /show-tot="\{\{true\}\}"/.test(s);
    }) &&
    /wx:if="\{\{showTot\}\}"/.test(dockWxml)
);

assert(
  '4 赛程事件与 scrollLeft 不串总榜',
  scheduleDocks.every(function (s) {
    return (
      s.indexOf('bind:roundtap="onScheduleRoundTap"') >= 0 &&
      s.indexOf('bind:hscroll="onScheduleRoundHScroll"') >= 0 &&
      s.indexOf('scheduleRoundSelectorScrollLeft') >= 0 &&
      s.indexOf('onStandingsRoundTap') < 0 &&
      s.indexOf('onRoundSelectorHScroll') < 0 &&
      !/scroll-left="\{\{roundSelectorScrollLeft\}\}"/.test(s)
    );
  }) &&
    standingsDocks.every(function (s) {
      return (
        s.indexOf('bind:roundtap="onStandingsRoundTap"') >= 0 &&
        s.indexOf('bind:hscroll="onRoundSelectorHScroll"') >= 0 &&
        s.indexOf('roundSelectorScrollLeft') >= 0 &&
        s.indexOf('onScheduleRoundTap') < 0
      );
    })
);

assert(
  '5 赛程传入 rounds/roundInfoText/mode/sticky/top',
  scheduleDocks.every(function (s) {
    return (
      s.indexOf('rounds="{{schedule.roundSelector}}"') >= 0 &&
      s.indexOf('round-info-text="{{schedule.roundInfoText}}"') >= 0 &&
      (s.indexOf('mode="inflow"') >= 0 || s.indexOf('mode="fixed"') >= 0) &&
      s.indexOf('sticky="{{isStickyRoundSelector}}"') >= 0 &&
      s.indexOf('top="{{stickyRoundSelectorTop}}"') >= 0
    );
  })
);

assert(
  '6 组件同时含 selector 与 round-meta；meta 不在 scroll-view 内',
  dockWxml.indexOf('series-standings-round-bar') >= 0 &&
    dockWxml.indexOf('series-standings-round-meta') >= 0 &&
    dockWxml.indexOf('{{roundInfoText}}') >= 0 &&
    dockWxml.indexOf('series-standings-round-dock-body') >= 0 &&
    dockWxml.indexOf('</scroll-view>') <
      dockWxml.indexOf('series-standings-round-meta') &&
    !/wx:if="\{\{roundInfoText\}\}"/.test(dockWxml)
);

assert(
  '7 说明行高度/字号/空态签名',
  /\.series-standings-round-meta\s*\{[\s\S]{0,220}height:\s*52rpx/.test(dockWxss) &&
    /\.series-standings-round-meta\s*\{[\s\S]{0,220}min-height:\s*52rpx/.test(
      dockWxss
    ) &&
    /\.series-standings-round-meta\s*\{[\s\S]{0,220}max-height:\s*52rpx/.test(
      dockWxss
    ) &&
    /\.series-standings-round-meta\s*\{[\s\S]{0,220}padding:\s*12rpx 0/.test(
      dockWxss
    ) &&
    /\.series-standings-round-meta__text\s*\{[\s\S]{0,200}font-size:\s*22rpx/.test(
      dockWxss
    ) &&
    /\.series-standings-round-meta__text\s*\{[\s\S]{0,220}color:\s*var\(--text-secondary/.test(
      dockWxss
    ) &&
    /\.series-standings-round-meta--empty\s*\{[\s\S]{0,80}visibility:\s*hidden/.test(
      dockWxss
    )
);

assert(
  '8 选中勾为左上白底蓝勾；不覆盖状态底',
  dockWxml.indexOf('round-selector-item__selected-icon') >= 0 &&
    dockWxml.indexOf('series-standings-round-selector') >= 0 &&
    /left:\s*6rpx/.test(dockWxss) &&
    /background:\s*#fff/.test(dockWxss) &&
    /color:\s*var\(--data-blue/.test(dockWxss) &&
    /inset 0 0 0 2rpx/.test(dockWxss) &&
    !/\.series-standings-round-chip\.round-selector-item--selected\s*\{[^}]*background\s*:/.test(
      dockWxss
    )
);

assert(
  '9 轻量箭头：无蓝色提示条、不改 scrollLeft',
  dockWxml.indexOf('srd-overflow') >= 0 &&
    /\.srd-overflow\s*\{[\s\S]{0,280}pointer-events:\s*none/.test(dockWxss) &&
    !/\.srd-overflow[^{]*\{[^}]*#002d62/.test(dockWxss) &&
    !/\.srd-overflow[^{]*\{[^}]*linear-gradient/.test(dockWxss) &&
    dockJs.indexOf("triggerEvent('hscroll'") >= 0 &&
    !/setData\(\s*\{[^}]*scrollLeft/.test(dockJs)
);

var roundStates = [
  {
    roundId: 'r1',
    index: 1,
    label: 'R1',
    dateTime: '2026-08-13 08:30',
    courseName: '北京华彬高尔夫俱乐部',
    courseHalfText: '前九'
  }
];
var series = {
  rounds: [
    {
      roundId: 'r1',
      index: 1,
      name: 'R1',
      dateTime: '2026-08-13 08:30',
      courseName: '北京华彬高尔夫俱乐部',
      courseHalfText: '前九'
    }
  ]
};
var expected = 'R1 · AUG 13 · 北京华彬高尔夫俱乐部 · 前九';
var standingsText = standingsVm.buildStandingsRoundInfoText(
  'r1',
  roundStates,
  series
);
var sharedText = roundInfo.buildSeriesRoundInfoText('r1', roundStates, series);
var scheduleVmOut = scheduleVm.buildSeriesScheduleViewModel({
  series: Object.assign(
    {
      seriesId: 's1',
      lifecycleStatus: 'published',
      participants: [],
      roster: []
    },
    series
  ),
  selectedRoundId: 'r1',
  roundStates: roundStates,
  getMatchById: function () {
    return null;
  },
  getIndexByMatchId: function () {
    return null;
  }
});

assert(
  '10 同一 R 的 roundInfoText 相等且不含开球时刻',
  standingsText === expected &&
    sharedText === expected &&
    scheduleVmOut.roundInfoText === expected &&
    standingsText.indexOf('08:30') < 0 &&
    scheduleVmOut.roundInfoText.indexOf('08:30') < 0 &&
    roundInfo.buildSeriesRoundInfoText('cumulative', roundStates, series) === ''
);

assert(
  '11 赛程 VM 暴露 roundSelector 且无 TOT',
  Array.isArray(scheduleVmOut.roundSelector) &&
    scheduleVmOut.roundSelector === scheduleVmOut.roundSelectorItems &&
    scheduleVmOut.roundSelector.every(function (it) {
      return it && it.key !== 'cumulative' && String(it.label).indexOf('TOT') < 0;
    })
);

assert(
  '12 赛程切轮不重测 dock、不写 filler/sticky/scrollTop',
  rebuildFn.indexOf('measureRoundSelectorTop(') < 0 &&
    rebuildFn.indexOf('measureTabTop(') < 0 &&
    rebuildFn.indexOf('delete patch.scrollTop') >= 0 &&
    rebuildFn.indexOf('delete patch.scrollFillerHeight') >= 0 &&
    rebuildFn.indexOf('delete patch.isStickyTab') >= 0 &&
    rebuildFn.indexOf('delete patch.isStickyRoundSelector') >= 0 &&
    rebuildFn.indexOf('delete patch.roundSelectorOffsetTop') >= 0 &&
    rebuildFn.indexOf('scrollTop:') < 0 &&
    tapFn.indexOf('measureRoundSelectorTop(') < 0 &&
    tapFn.indexOf('_rebuildScheduleProjection') >= 0
);

assert(
  '13 赛程 fixed 始终挂载，sticky 不用 wx:if',
  /series-round-dock--fixed \{\{activeTab === 'schedule' && schedule\.roundSelector\.length && isStickyRoundSelector \? 'series-round-dock--show' : 'series-round-dock--hide'\}/.test(
    pageWxml
  ) &&
    pageWxml.indexOf('wx:if="{{isStickyRoundSelector}}"') < 0
);

assert(
  '14 赛程内容区无第二份 round-meta',
  (pageWxml.match(/series-standings-round-meta/g) || []).length === 0 &&
    dockWxml.indexOf('series-standings-round-meta') >= 0 &&
    pageWxml.indexOf('onScheduleTeeGroupTap') >= 0
);

var none = overflowArrows.resolveOverflowArrows(0, 200, 180);
var left = overflowArrows.resolveOverflowArrows(0, 200, 400);
var mid = overflowArrows.resolveOverflowArrows(80, 200, 400);
var right = overflowArrows.resolveOverflowArrows(200, 200, 400);
assert(
  '15 左中右/无溢出箭头显隐',
  none.showLeft === false &&
    none.showRight === false &&
    left.showLeft === false &&
    left.showRight === true &&
    mid.showLeft === true &&
    mid.showRight === true &&
    right.showLeft === true &&
    right.showRight === false
);

assert(
  '16 状态色仍只消费 resolveSeriesRoundVisualState；M 未改',
  fs
    .readFileSync(path.join(pageDir, 'seriesRoundVisualState.js'), 'utf8')
    .indexOf('resolveSeriesRoundVisualState') >= 0 &&
    pageWxml.indexOf('series-manage-round-card') >= 0 &&
    pageWxml.indexOf('round-selector-item__check') >= 0 &&
    pageJs.indexOf('onStandingsRoundTap') >= 0
);

assert(
  '17 普通 detail 未引入该组件',
  !fs.existsSync(path.join(detailDir, 'index.json')) ||
    fs
      .readFileSync(path.join(detailDir, 'index.json'), 'utf8')
      .indexOf('series-round-selector-dock') < 0
);

assert(
  '18 缺字段不产生连续分隔符',
  roundInfo.buildSeriesRoundInfoText(
    'r1',
    [{ roundId: 'r1', index: 1, label: 'R1' }],
    null
  ) === 'R1' &&
    roundInfo.buildSeriesRoundInfoText(
      'r1',
      [
        {
          roundId: 'r1',
          index: 1,
          label: 'R1',
          dateTime: '2026-08-13',
          courseName: ''
        }
      ],
      null
    ) === 'R1 · AUG 13'
);

console.log('');
console.log(
  'seriesRoundDockB1 selftest: ' + passed + ' passed, ' + failed + ' failed'
);
if (failures.length) {
  console.log('');
  failures.forEach(function (f) {
    console.log('  - ' + f);
  });
  process.exit(1);
}
process.exit(0);
