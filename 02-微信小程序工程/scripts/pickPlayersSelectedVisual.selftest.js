/**
 * 选择参加人员：selected 不置灰，仅边框；disabled 独立。
 * 运行：node scripts/pickPlayersSelectedVisual.selftest.js
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

var wxml = fs.readFileSync(path.join(gameRoot, 'pages/pick-players/index.wxml'), 'utf8');
var wxss = fs.readFileSync(path.join(gameRoot, 'pages/pick-players/index.wxss'), 'utf8');
var js = fs.readFileSync(path.join(gameRoot, 'pages/pick-players/index.js'), 'utf8');
var gameUi = fs.readFileSync(path.join(gameRoot, 'styles/game-ui.wxss'), 'utf8');
var configPick = fs.readFileSync(path.join(gameRoot, 'pages/config/player-pick-block.wxml'), 'utf8');
var faceWxss = fs.readFileSync(path.join(gameRoot, 'components/party-face/index.wxss'), 'utf8');

assert('原全局 off 置灰仍存在于 game-ui（其他页）', /\.player-slot\.off\s*\{[^}]*opacity:\s*0\.4/.test(gameUi));
assert('本页不再挂 off 类', !/\boff\b/.test(wxml.match(/class="player-slot[^"]*"/)[0]));
assert('selected 类', /player-slot--selected/.test(wxml));
assert('idle 类', /player-slot--idle/.test(wxml));
assert('disabled 仅未选时', /disabled && !person\.selected/.test(wxml));
assert('selected 不透明度 1', /\.player-slot--selected\s*\{[\s\S]*?opacity:\s*1/.test(wxss));
assert('idle 不透明度 1', /\.player-slot--idle\s*\{[\s\S]*?opacity:\s*1/.test(wxss));
assert('disabled 才置灰', /\.player-slot--disabled\s*\{[\s\S]*?opacity:\s*0\.4/.test(wxss));
assert('头像昵称强制清晰', /\.player-slot--selected \.pick-face[\s\S]*opacity:\s*1/.test(wxss));
assert('无 grayscale', !/grayscale/.test(wxss));
assert('仍四列布局', /repeat\(4, minmax\(0, 1fr\)\)/.test(wxss));
assert('昵称省略号保留', /text-overflow:\s*ellipsis/.test(faceWxss));
assert('勾选框仍在（未新增另一套）', /check-box/.test(wxml));
assert('达上限已选可取消', /if \(hit\.selected\)/.test(js) && /businessDisabled/.test(js));
assert('capacityBlocked 拆分', /capacityBlocked/.test(js));
assert('配置页选人仍用 off（未改共享逻辑）', /item\.selected \? '' : 'off'/.test(configPick));
assert('未改保存结果字段', /selectedIds/.test(js) && /emit\("done"/.test(js));
assert('仍校验人数', /至少选/.test(js) && /最多选/.test(js));

console.log('\npickPlayersSelectedVisual.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
