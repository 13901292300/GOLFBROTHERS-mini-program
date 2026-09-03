/**
 * 选人页：确认提交后不弹「是否放弃修改」。
 * 运行：node scripts/pickPlayersConfirmLeave.selftest.js
 */
var fs = require('fs');
var path = require('path');

var gameRoot = path.join(__dirname, '..', 'miniprogram', 'subpackages', 'game');
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

var pickJs = fs.readFileSync(path.join(gameRoot, 'pages/pick-players/index.js'), 'utf8');
var pickWxml = fs.readFileSync(path.join(gameRoot, 'pages/pick-players/index.wxml'), 'utf8');
var pickWxss = fs.readFileSync(path.join(gameRoot, 'pages/pick-players/index.wxss'), 'utf8');
var scoreJs = fs.readFileSync(path.join(gameRoot, 'pages/score-config/index.js'), 'utf8');
var guardJs = fs.readFileSync(path.join(gameRoot, 'utils/sideGameConfigGuard.js'), 'utf8');

var confirmBlock = pickJs.slice(pickJs.indexOf('onConfirm()'), pickJs.indexOf('onBack()'));
var backBlock = pickJs.slice(pickJs.indexOf('onBack()'));

assert('确认先校验人数', /至少选/.test(confirmBlock) && /最多选/.test(confirmBlock));
assert('确认 emit selectedIds', /emit\("done"/.test(confirmBlock) && /selectedIds/.test(confirmBlock));
assert('确认后 _markSaved 清 dirty', /_markSaved/.test(confirmBlock));
assert('确认 _markSaved 在 navigateBack 之前', confirmBlock.indexOf('_markSaved') < confirmBlock.indexOf('navigateBackSafe'));
assert('确认不走 _leaveIfClean', !/_leaveIfClean/.test(confirmBlock));
assert('确认有提交锁防双击', /_confirmSubmitting/.test(confirmBlock));
assert('确认失败路径重置 leaveIntent', /_leaveIntent = "none"/.test(confirmBlock));
assert('返回仍走放弃确认', /_leaveIfClean/.test(backBlock));
assert('取消按钮绑 onBack', /cta-ghost" bindtap="onBack"/.test(pickWxml));
assert('确定按钮绑 onConfirm', /cta-gold" bindtap="onConfirm"/.test(pickWxml));
assert('与 score-config 同序', /_markSaved/.test(scoreJs) && scoreJs.indexOf('_markSaved') < scoreJs.indexOf('navigateBackSafe', scoreJs.indexOf('onConfirm()')));
assert('guard 仍有 enable/disable unload', /enableAlertBeforeUnload/.test(guardJs) && /disableAlertBeforeUnload/.test(guardJs));
assert('放弃文案未改', /是否放弃修改/.test(guardJs));
assert('WXML 结构未为本次改动重排标题', /选择人员/.test(pickWxml));
assert('WXSS 仍含选人布局类', /pick-group/.test(pickWxss) && /player-slot--selected/.test(pickWxss));

console.log('\npickPlayersConfirmLeave.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
