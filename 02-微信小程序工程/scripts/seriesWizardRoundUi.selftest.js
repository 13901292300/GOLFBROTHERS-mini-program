/**
 * Series 向导轮次页纯 UI 窄修自测（静态）
 * 运行：node scripts/seriesWizardRoundUi.selftest.js
 */

var path = require('path');
var fs = require('fs');

var pageDir = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'create',
  'pages',
  'series'
);

var wxml = fs.readFileSync(path.join(pageDir, 'index.wxml'), 'utf8');
var wxss = fs.readFileSync(path.join(pageDir, 'index.wxss'), 'utf8');
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

(function testRoundCardUi() {
  var step4 = wxml.slice(wxml.indexOf('<!-- Step 4 -->'), wxml.indexOf('<!-- Step 5 -->'));
  var roundIndexHits = (step4.match(/ROUND \{\{item\.index\}\}/g) || []).length;
  var headClassHits = (step4.match(/series-round-head/g) || []).length;
  var titleRowHits = (step4.match(/series-round-title-row/g) || []).length;
  var nameInputHits = (step4.match(/onRoundNameInput/g) || []).length;
  var titleBeforeName =
    step4.indexOf('series-round-title-row') >= 0 &&
    step4.indexOf('series-round-title-row') < step4.indexOf('series-round-name-card');

  assert('每张卡片仅一处 ROUND {{index}} 标题', roundIndexHits === 1);
  assert('已移除旧 series-round-head 说明节点', headClassHits === 0);
  assert('ROUND 标题在 title-row 内', titleRowHits === 1 && step4.indexOf('series-round-index') >= 0);
  assert('ROUND 标题行在名称字段之前', titleBeforeName);
  assert('轮次名称等字段仍在', nameInputHits === 1 && step4.indexOf('onSelectRoundCourse') >= 0);
  assert(
    'edit_round 页面级上下文仍在（banner / 非卡片内重复说明）',
    wxml.indexOf('edit-round-banner') >= 0 &&
      wxml.indexOf('editRoundBannerText') >= 0 &&
      pageJs.indexOf("pageTitle: '编辑本轮'") >= 0
  );
  assert(
    'ROUND 与下方字段共用内容区左边缘',
    wxss.indexOf('--series-round-content-x') >= 0 &&
      wxss.indexOf('.series-round-title-row') >= 0 &&
      wxss.indexOf('padding: 0 var(--series-round-content-x)') >= 0 &&
      wxss.indexOf('padding-left: var(--series-round-content-x)') >= 0 &&
      wxss.indexOf('series-round-name-card') >= 0
  );
  assert(
    '右侧状态不破坏标题左起点',
    wxss.indexOf('.series-round-status') >= 0 &&
      wxss.indexOf('.series-round-index') >= 0 &&
      wxss.indexOf('text-align: left') >= 0 &&
      /series-round-status[\s\S]{0,80}flex-shrink:\s*0/.test(wxss)
  );
})();

console.log('');
console.log('---- seriesWizardRoundUi.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
