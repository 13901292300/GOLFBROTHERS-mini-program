/**
 * Patch C6-A：Series M 修改半场 → 原页 half-course-sheet
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesHalfCourseSheetC6A.selftest.js
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
var compDir = path.join(
  __dirname,
  '..',
  'miniprogram',
  'components',
  'half-course-sheet'
);
var detailDir = path.join(pageDir, '..', 'detail');
var utilsDir = path.join(__dirname, '..', 'miniprogram', 'utils');

var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');
var pageWxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
var pageJson = fs.readFileSync(path.join(pageDir, 'index.json'), 'utf8');
var compJs = fs.readFileSync(path.join(compDir, 'index.js'), 'utf8');
var compWxml = fs.readFileSync(path.join(compDir, 'index.wxml'), 'utf8');
var detailJs = fs.readFileSync(path.join(detailDir, 'index.js'), 'utf8');
var detailWxml = fs.readFileSync(path.join(detailDir, 'index.wxml'), 'utf8');
var halfEdit = fs.readFileSync(path.join(utilsDir, 'halfCourseEdit.js'), 'utf8');

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

assert(
  'Series 注册 half-course-sheet 组件',
  pageJson.indexOf('half-course-sheet') >= 0 &&
    pageJson.indexOf('/components/half-course-sheet/index') >= 0
);

assert(
  'WXML 使用共享 half-course-sheet + 冻结 match-id',
  pageWxml.indexOf('<half-course-sheet') >= 0 &&
    pageWxml.indexOf('match-id="{{halfSheetMatchId}}"') >= 0 &&
    pageWxml.indexOf('round-subtitle="{{halfSheetRoundSubtitle}}"') >= 0 &&
    pageWxml.indexOf('source="team_match"') >= 0
);

assert(
  'edit_half 走 _openSeriesHalfCourseSheet，不走 openSheet=half 业务调用',
  /permission === 'edit_half'[\s\S]{0,120}_openSeriesHalfCourseSheet/.test(pageJs) &&
    !/permission === 'edit_half'[\s\S]{0,160}_openSeriesDetailSheetDeepLink\(\s*['"]half['"]\s*\)/.test(
      pageJs
    )
);

assert(
  '打开门闩：verifyManagedStation + edit_half 权限',
  pageJs.indexOf('_openSeriesHalfCourseSheet') >= 0 &&
    /_openSeriesHalfCourseSheet:[\s\S]{0,1200}verifyManagedStationForManage/.test(
      pageJs
    ) &&
    /_openSeriesHalfCourseSheet:[\s\S]{0,1600}hasMatchManagePermission\([\s\S]{0,80}edit_half/.test(
      pageJs
    )
);

assert(
  '冻结 matchId + 连点锁 + 卸载清理',
  pageJs.indexOf('_halfFrozen') >= 0 &&
    pageJs.indexOf('_halfSheetOpening') >= 0 &&
    /onUnload:[\s\S]{0,800}_halfFrozen\s*=\s*null/.test(pageJs) &&
    pageJs.indexOf('halfSheetMatchId') >= 0
);

assert(
  '副标题复用 _buildTempAdminRoundSubtitle',
  /_openSeriesHalfCourseSheet:[\s\S]{0,2000}_buildTempAdminRoundSubtitle/.test(
    pageJs
  )
);

assert(
  '取消/确认关闭；确认 reloadViewModel resetScroll:false；无重复 toast',
  pageJs.indexOf('onHalfCourseSheetClose') >= 0 &&
    pageJs.indexOf('onHalfCourseSheetConfirm') >= 0 &&
    /onHalfCourseSheetConfirm:[\s\S]{0,500}reloadViewModel\(\{\s*resetScroll:\s*false\s*\}/.test(
      pageJs
    ) &&
    /onHalfCourseSheetConfirm:[\s\S]{0,400}不重复/.test(pageJs)
);

assert(
  '组件仍走 halfCourseEdit.apply；写入 front9/back9/courseHalfText',
  compJs.indexOf('halfCourseEdit.apply') >= 0 &&
    halfEdit.indexOf('front9Course') >= 0 &&
    halfEdit.indexOf('back9Course') >= 0 &&
    halfEdit.indexOf('courseHalfText') >= 0 &&
    halfEdit.indexOf('teamMatchStore.saveMatch') >= 0
);

assert(
  '组件支持可选 roundSubtitle；默认 COURSE',
  compJs.indexOf('roundSubtitle') >= 0 &&
    compWxml.indexOf("roundSubtitle || 'COURSE'") >= 0
);

assert(
  '普通 detail 半场入口仍在（无回归）',
  detailWxml.indexOf('<half-course-sheet') >= 0 &&
    /permission === 'edit_half'[\s\S]{0,120}halfSheetVisible:\s*true/.test(
      detailJs
    )
);

assert(
  'Series 无第二套 half DOM/领域（无自建 half-sheet 类名实现）',
  !/<view[^>]*class="[^"]*half-course-sheet/.test(pageWxml) &&
    pageWxml.indexOf('<half-course-sheet') >= 0
);

assert(
  'deep-link 函数保留但业务 edit_half 不再调用',
  pageJs.indexOf('_openSeriesDetailSheetDeepLink') >= 0
);

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('FAILURES:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
