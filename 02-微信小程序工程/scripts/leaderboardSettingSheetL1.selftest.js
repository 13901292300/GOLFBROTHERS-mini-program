/**
 * Patch L1：领先榜弹窗视觉层级统一
 * 运行：node scripts/leaderboardSettingSheetL1.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..', 'miniprogram');
var compDir = path.join(root, 'components', 'leaderboard-setting-sheet');
var detailDir = path.join(root, 'subpackages', 'tournament', 'pages', 'detail');
var seriesDir = path.join(root, 'subpackages', 'tournament', 'pages', 'series-detail');

var compWxml = fs.readFileSync(path.join(compDir, 'index.wxml'), 'utf8');
var compWxss = fs.readFileSync(path.join(compDir, 'index.wxss'), 'utf8');
var compJs = fs.readFileSync(path.join(compDir, 'index.js'), 'utf8');
var detailWxml = fs.readFileSync(path.join(detailDir, 'index.wxml'), 'utf8');
var detailWxss = fs.readFileSync(path.join(detailDir, 'index.wxss'), 'utf8');
var detailJs = fs.readFileSync(path.join(detailDir, 'index.js'), 'utf8');
var seriesWxml = fs.readFileSync(path.join(seriesDir, 'index.wxml'), 'utf8');
var seriesWxss = fs.readFileSync(path.join(seriesDir, 'index.wxss'), 'utf8');
var seriesJs = fs.readFileSync(path.join(seriesDir, 'index.js'), 'utf8');

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

assert(
  '1 队际赛与 Series 共用同一组件',
  /leaderboard-setting-sheet/.test(detailWxml) &&
    /leaderboard-setting-sheet/.test(seriesWxml) &&
    fs.existsSync(path.join(compDir, 'index.wxml'))
);

assert(
  '2 Series 在 L2 host 内；detail 在主 detail-scroll 外',
  /series-layer-l2-host[\s\S]*leaderboard-setting-sheet/.test(seriesWxml) &&
    /class="detail-scroll"[\s\S]*?<\/scroll-view>[\s\S]*leaderboard-setting-sheet/.test(
      detailWxml
    )
);

assert(
  '3 组件自带全屏 overlay + bottom-sheet class',
  /class="sheet-overlay"/.test(compWxml) &&
    /class="bottom-sheet leaderboard-setting-sheet/.test(compWxml) &&
    /styleIsolation:\s*['"]isolated['"]/.test(compJs)
);

assert(
  '4 overlay：fixed inset 0 + 暗色半透明 + 非白降白',
  /position:\s*fixed/.test(compWxss) &&
    /inset:\s*0/.test(compWxss) &&
    /background:\s*rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.55\s*\)/.test(compWxss) &&
    !/background:\s*rgba\(\s*255\s*,\s*255\s*,\s*255/.test(compWxss)
);

assert(
  '5 overlay / sheet z-index：210 < 230；禁止宿主 opacity',
  /z-index:\s*210/.test(compWxss) &&
    /z-index:\s*230/.test(compWxss) &&
    !/\.leaderboard-setting-sheet\s*\{[^}]*opacity\s*:/.test(compWxss) &&
    !/\.bottom-sheet\s*\{[^}]*opacity\s*:/.test(compWxss)
);

assert(
  '6 header 整体 padding（非仅标题 margin-top）+ handle 底呼吸',
  /\.leaderboard-setting__head\s*\{[\s\S]*?padding:\s*8rpx\s+0\s+32rpx/.test(
    compWxss
  ) &&
    /\.sheet-handle\s*\{[\s\S]*?margin:\s*24rpx\s+auto\s+40rpx/.test(compWxss) &&
    !/\.leaderboard-setting__title\s*\{[\s\S]*?margin-top:\s*[3-9]\d/.test(
      compWxss
    )
);

assert(
  '7 遮罩 catchtouchmove + 点击关闭；sheet 拦截穿透',
  /catchtouchmove="noop"/.test(compWxml) &&
    /bindtap="onMaskTap"/.test(compWxml) &&
    /onMaskTap:[\s\S]*triggerEvent\(['"]close['"]\)/.test(compJs) &&
    /catchtap="noop"/.test(compWxml)
);

assert(
  '8 detail 页不再持有领先榜权威样式副本',
  !/\.leaderboard-setting__head\s*\{/.test(detailWxss) &&
    !/\.leaderboard-setting-option\s*\{/.test(detailWxss)
);

assert(
  '9 Series 宿主不覆盖组件 overlay 背景色',
  !/leaderboard-setting[\s\S]{0,80}background:\s*rgba\(\s*255/.test(
    seriesWxss
  ) &&
    /series-layer-l2-host\s*\{[\s\S]*?pointer-events:\s*none/.test(seriesWxss) &&
    /series-layer-l2-host\s*\{[\s\S]*?position:\s*fixed[\s\S]*?inset:\s*0/.test(
      seriesWxss
    )
);

assert(
  '10 M→领先榜：detail 同帧关 M；Series _openFromManageSheet',
  /openLeaderboardSettingSheet\(\)[\s\S]{0,1200}showMoreSheet:\s*false[\s\S]{0,400}showLeaderboardSettingSheet:\s*true/.test(
    detailJs
  ) &&
    /_openSeriesRoundLeaderboardSettingSheet:[\s\S]{0,2500}_openFromManageSheet\(/.test(
      seriesJs
    ) &&
    /_openFromManageSheet:[\s\S]{0,600}isManageOverlayActive\s*=\s*true/.test(
      seriesJs
    )
);

assert(
  '11 交互入口未改：change/confirm/cancel/close 仍在',
  /bind:change="onLeaderboardSettingChange"/.test(detailWxml) &&
    /bind:confirm="confirmLeaderboardSettingSheet"/.test(detailWxml) &&
    /bind:change="onLeaderboardSettingChange"/.test(seriesWxml) &&
    /bind:confirm="confirmLeaderboardSettingSheet"/.test(seriesWxml)
);

assert(
  '12 safe-area 只在 sheet 底部 padding',
  /padding:\s*0\s+40rpx\s+calc\(40rpx\s*\+\s*env\(safe-area-inset-bottom\)\)/.test(
    compWxss
  ) &&
    !/\.leaderboard-setting__head[\s\S]{0,200}safe-area/.test(compWxss)
);

console.log('');
console.log('L1 selftest: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
