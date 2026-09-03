/**
 * 游戏 TAB 表头头像/昵称：只放大格内，不改列宽与表头高度。
 * 运行：node scripts/gameTabBoardPlayerHead.selftest.js
 */
var fs = require('fs');
var path = require('path');

var mini = path.join(__dirname, '..', 'miniprogram');
var gameRoot = path.join(mini, 'subpackages', 'game');
var tabWxml = fs.readFileSync(path.join(gameRoot, 'components/game-tab/index.wxml'), 'utf8');
var tabWxss = fs.readFileSync(path.join(gameRoot, 'components/game-tab/index.wxss'), 'utf8');
var faceWxss = fs.readFileSync(path.join(gameRoot, 'components/party-face/index.wxss'), 'utf8');
var faceWxml = fs.readFileSync(path.join(gameRoot, 'components/party-face/index.wxml'), 'utf8');
var layoutJs = fs.readFileSync(path.join(gameRoot, 'utils/boardLayout.js'), 'utf8');
var settleJs = fs.readFileSync(path.join(gameRoot, 'utils/settle.js'), 'utf8');
var scoreWxss = fs.readFileSync(path.join(mini, 'subpackages/scoring/pages/score/index.wxss'), 'utf8');
var hubWxss = fs.readFileSync(path.join(mini, 'subpackages/scoring/pages/hub/index.wxss'), 'utf8');

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

function boardAvBlock() {
  var i = faceWxss.indexOf('.party-face--board .party-face__av');
  return i >= 0 ? faceWxss.slice(i, i + 220) : '';
}

function boardNameBlock() {
  var token = '.party-face--board .party-face__name {';
  var i = faceWxss.indexOf(token);
  return i >= 0 ? faceWxss.slice(i, i + 280) : '';
}

function cellBlock() {
  var token = '/* 球员表头';
  var i = tabWxss.indexOf(token);
  return i >= 0 ? tabWxss.slice(i, i + 520) : '';
}

var av = boardAvBlock();
var nm = boardNameBlock();
var cell = cellBlock();

assert('表头格高度仍 120rpx', /height:\s*120rpx/.test(cell) && /min-height:\s*120rpx/.test(cell));
assert(
  '洞列表头高度仍 120rpx',
  /\.board-cell--head \{[\s\S]{0,160}height:\s*120rpx/.test(tabWxss) &&
    /\.board-left__head \{[\s\S]{0,180}height:\s*120rpx/.test(tabWxss)
);
assert('列宽公式未改 HOLE_RPX=168 VISIBLE_COLS=4', /HOLE_RPX = 168/.test(layoutJs) && /VISIBLE_COLS = 4/.test(layoutJs));

assert('头像由 36rpx 放大到 44rpx（约 +22%）', /width:\s*44rpx/.test(av) && /height:\s*44rpx/.test(av) && !/width:\s*36rpx/.test(av));
assert('头像正方形且 flex-shrink:0', /flex-shrink:\s*0/.test(av) && /object-fit:\s*cover/.test(av));
assert('配置页 slot 头像仍 56rpx', /party-face--slot\.party-face--single[\s\S]{0,80}width:\s*56rpx/.test(faceWxss));

assert('昵称由 18rpx 放大到 22rpx', /font-size:\s*22rpx/.test(nm) && !/font-size:\s*18rpx/.test(nm));
assert(
  '昵称单行省略',
  /min-width:\s*0/.test(nm) &&
    /overflow:\s*hidden/.test(nm) &&
    /white-space:\s*nowrap/.test(nm) &&
    /text-overflow:\s*ellipsis/.test(nm)
);
assert(
  '昵称容器可收缩',
  /\.party-face--board \.party-face__names \{[\s\S]{0,120}flex:\s*1/.test(faceWxss) &&
    /\.party-face--board \.party-face__names \{[\s\S]{0,120}min-width:\s*0/.test(faceWxss)
);

assert('仍为头像在上昵称在下', /party-face--board \{[\s\S]{0,80}flex-direction:\s*column/.test(faceWxss) || /party-face--slot,[\s\S]{0,80}party-face--board \{[\s\S]{0,80}flex-direction:\s*column/.test(faceWxss));
assert('WXML 结构仍为 avatar 后 names', /party-face__avatar[\s\S]+party-face__names/.test(faceWxml));

var faceCount = (tabWxml.match(/layout="board"/g) || []).length;
var hostCount = (tabWxml.match(/class="board-player-face"/g) || []).length;
assert('三处表头 party-face 均加 host 宽约束', faceCount === 3 && hostCount === 3);
assert(
  'host 不撑列',
  /\.board-player-face \{[\s\S]{0,120}width:\s*100%/.test(tabWxss) &&
    /\.board-player-face \{[\s\S]{0,160}min-width:\s*0/.test(tabWxss)
);

assert('表头格 overflow hidden 防止长昵称撑列', /overflow:\s*hidden/.test(cell));
assert('结算逻辑文件未改（本测试只读对照存在 settle）', /function settleGame|settleGame:/.test(settleJs) || /settleGame/.test(settleJs));

assert('记分页 WXSS 无 board-player-face', scoreWxss.indexOf('board-player-face') < 0);
assert('Hub WXSS 无 board 表头放大规则', hubWxss.indexOf('party-face--board') < 0);

assert(
  '超长中文/英文省略选择器存在',
  /text-overflow:\s*ellipsis/.test(nm) && /white-space:\s*nowrap/.test(nm)
);

console.log('\ngameTabBoardPlayerHead.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
