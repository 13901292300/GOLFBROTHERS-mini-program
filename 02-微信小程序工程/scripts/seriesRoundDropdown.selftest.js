/**
 * 比洞赛轮次下拉：displayText + selectorMode 兼容 chip
 * 运行：node scripts/seriesRoundDropdown.selftest.js
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
var dockDir = path.join(mini, 'subpackages', 'tournament', 'components', 'series-round-selector-dock');

var standingsVm = require(path.join(pageDir, 'seriesStandingsViewModel.js'));
var scheduleVm = require(path.join(pageDir, 'seriesScheduleViewModel.js'));

var dockWxml = fs.readFileSync(path.join(dockDir, 'index.wxml'), 'utf8');
var dockJs = fs.readFileSync(path.join(dockDir, 'index.js'), 'utf8');
var dockWxss = fs.readFileSync(path.join(dockDir, 'index.wxss'), 'utf8');
var pageWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
var pageWxss = fs.readFileSync(path.join(pageDir, 'index.wxss'), 'utf8');

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

var dropdownSlice = '';
var elseStart = dockWxml.indexOf('wx:else');
if (elseStart >= 0) dropdownSlice = dockWxml.slice(elseStart);
assert(
  '1 chip 与 dropdown 双模模板',
  dockWxml.indexOf("selectorMode !== 'dropdown'") >= 0 &&
    dockWxml.indexOf('series-standings-round-chip') >= 0 &&
    dockWxml.indexOf('round-dropdown-trigger') >= 0 &&
    dockWxml.indexOf('dropdown-item-check') >= 0
);
assert(
  '2 下拉无 LIVE / 无 round-meta',
  dropdownSlice.indexOf('showLiveBadge') < 0 &&
    dropdownSlice.indexOf('series-standings-round-meta') < 0 &&
    dropdownSlice.indexOf('round-dropdown-menu') >= 0
);

assert(
  '3 组件属性与事件',
  dockJs.indexOf("selectorMode: { type: String, value: 'chip' }") >= 0 &&
    dockJs.indexOf('onDropdownToggle') >= 0 &&
    dockJs.indexOf('onItemTap') >= 0 &&
    dockJs.indexOf("triggerEvent('roundtap'") >= 0
);

assert(
  '4 页面四次引用传入 selector-mode',
  (pageWxml.match(/selector-mode="/g) || []).length === 4 &&
    pageWxml.indexOf("standings.useRyderCupScoreboard ? 'dropdown' : 'chip'") >=
      0 &&
    pageWxml.indexOf('schedule.roundSelectorMode') >= 0
);

assert(
  '5 吸顶 dock 下拉不裁切',
  pageWxss.indexOf('series-round-dock--dropdown') >= 0 &&
    /series-round-dock--dropdown[\s\S]{0,180}overflow:\s*visible/.test(pageWxss)
);

assert(
  '6 下拉样式无状态色底',
  dockWxss.indexOf('.round-dropdown-item') >= 0 &&
    !/\.round-dropdown-item[^{]*\{[^}]*champion-gold/.test(dockWxss) &&
    !/\.round-dropdown-item[^{]*\{[^}]*data-blue/.test(dockWxss)
);

var parts = standingsVm.buildRoundSelectorParts(
  [
    {
      roundId: 'r1',
      index: 1,
      label: 'R1',
      state: 'live',
      stateClass: 'round-selector-state--live',
      statusLabel: 'LIVE'
    }
  ],
  'r1',
  {
    includeTot: false,
    series: {
      rounds: [
        {
          roundId: 'r1',
          index: 1,
          name: 'ROUND 1',
          gameMode: '四人四球比洞赛',
          dateTime: '2026-09-08 12:30'
        }
      ]
    }
  }
);

assert(
  '7 displayText 格式',
  parts.roundSelectorItems[0] &&
    parts.roundSelectorItems[0].displayText ===
      'R1 · SEP 08 · 四人四球比洞赛',
  parts.roundSelectorItems[0] && parts.roundSelectorItems[0].displayText
);

assert(
  '8 formatRoundDate 仅月日、不含时分与年份',
  standingsVm.formatRoundDate('2026-09-08 12:30') === 'SEP 08' &&
    standingsVm.formatRoundDate('') === ''
);

var sched = scheduleVm.buildScheduleRoundSelector(
  {
    scoringMode: 'ryder_cup',
    templateId: 'ryder_cup',
    rounds: [
      {
        roundId: 'r1',
        index: 1,
        gameMode: '个人比洞赛',
        dateTime: '2026-08-20 08:00',
        matchId: ''
      }
    ]
  },
  [{ roundId: 'r1', index: 1, state: 'unassigned' }],
  function () {
    return null;
  }
);

assert(
  '9 赛程 selector 含 displayText',
  sched.roundSelectorItems[0] &&
    sched.roundSelectorItems[0].displayText === 'R1 · AUG 20 · 个人比洞赛',
  sched.roundSelectorItems[0] && sched.roundSelectorItems[0].displayText
);

assert(
  '10 缺日期不出现连续分隔符',
  standingsVm.buildRoundSelectorDisplayText(
    { roundId: 'r1', index: 2, gameMode: '个人比洞赛' },
    { roundId: 'r1', index: 2 },
    2
  ) === 'R2 · 个人比洞赛'
);

assert(
  '11 缺赛制降级为赛制待定',
  standingsVm.buildRoundSelectorDisplayText(
    { roundId: 'r1', index: 1, dateTime: '2026-08-20 08:00' },
    { roundId: 'r1', index: 1 },
    1
  ) === 'R1 · AUG 20 · 赛制待定'
);

console.log('');
console.log(failed ? 'FAIL ' + failed : 'OK ' + passed);
process.exit(failed ? 1 : 0);
