/**
 * 系列赛创建页「队内多分队」名称前颜色标识：方形 → 圆形
 * 不改数据结构 / 选色 / 分队名称逻辑。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesCreateDivisionSwatchCircle.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var createDir = path.join(mini, 'subpackages', 'create', 'pages', 'series');
var teamInternalDir = path.join(mini, 'subpackages', 'create', 'pages', 'team-internal');
var commonWxssPath = path.join(mini, 'subpackages', 'create', 'styles', 'create-team-common.wxss');

var participantDraft = require(path.join(createDir, 'participantDraft.js'));

var pageWxml = fs.readFileSync(path.join(createDir, 'index.wxml'), 'utf8');
var pageWxss = fs.readFileSync(path.join(createDir, 'index.wxss'), 'utf8');
var pageJs = fs.readFileSync(path.join(createDir, 'index.js'), 'utf8');
var draftSrc = fs.readFileSync(path.join(createDir, 'participantDraft.js'), 'utf8');
var commonWxss = fs.readFileSync(commonWxssPath, 'utf8');
var teamInternalWxml = fs.readFileSync(path.join(teamInternalDir, 'index.wxml'), 'utf8');
var teamInternalWxss = fs.readFileSync(path.join(teamInternalDir, 'index.wxss'), 'utf8');

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

function extractRule(wxss, selector) {
  var re = new RegExp(
    selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}'
  );
  var m = wxss.match(re);
  return m ? m[1] : '';
}

var swatchRule = extractRule(pageWxss, '.series-wizard .series-division-swatch');
var colorItemRule = extractRule(pageWxss, '.series-wizard .series-color-item');
var nameRule = extractRule(pageWxss, '.series-wizard .series-division-name');
var cardRule = extractRule(pageWxss, '.series-wizard .series-division-card');

assert(
  '颜色标识使用圆形样式',
  /border-radius:\s*50%/.test(swatchRule) &&
    !/border-radius:\s*16rpx/.test(swatchRule)
);

assert(
  '尺寸、间距、对齐与防压缩不变',
  /width:\s*72rpx/.test(swatchRule) &&
    /height:\s*72rpx/.test(swatchRule) &&
    /flex-shrink:\s*0/.test(swatchRule) &&
    /display:\s*flex/.test(swatchRule) &&
    /align-items:\s*center/.test(swatchRule) &&
    /justify-content:\s*center/.test(swatchRule) &&
    /gap:\s*16rpx/.test(cardRule) &&
    /flex:\s*1/.test(nameRule) &&
    /min-width:\s*0/.test(nameRule)
);

assert(
  '沿用现有 swatch 结构与点击选色',
  pageWxml.indexOf('class="series-division-swatch"') >= 0 &&
    pageWxml.indexOf('bindtap="onOpenDivisionColorSheet"') >= 0 &&
    pageWxml.indexOf('class="series-division-name"') >= 0 &&
    pageWxml.indexOf('bindinput="onDivisionNameInput"') >= 0 &&
    pageJs.indexOf('onOpenDivisionColorSheet') >= 0 &&
    pageJs.indexOf('onPickDivisionColor') >= 0 &&
    pageWxml.indexOf('series-division-swatch-circle') < 0
);

assert(
  '选色盘仍为圆角方形，未改成独立规范',
  /border-radius:\s*16rpx/.test(colorItemRule) &&
    !/border-radius:\s*50%/.test(colorItemRule) &&
    pageWxml.indexOf('class="series-color-item"') >= 0
);

assert(
  '未改公共 create-team-common / 队内单场创建页',
  commonWxss.indexOf('series-division-swatch') < 0 &&
    teamInternalWxml.indexOf('series-division-swatch') < 0 &&
    teamInternalWxml.indexOf('class="team-group-row"') >= 0 &&
    teamInternalWxss.indexOf('border-radius: 50%') < 0
);

var host = { teamId: 'ht1', teamName: '主办队', teamLogo: '' };
var defaults = participantDraft.createDefaultDivisions(host);
var defaultSnap = JSON.parse(JSON.stringify(defaults));
var defaultCards = participantDraft.buildDivisionCards(defaults);

assert(
  '默认两个分队回显颜色与首字',
  defaultCards.length === 2 &&
    defaultCards[0].color === participantDraft.DIVISION_COLOR_PALETTE[0] &&
    defaultCards[1].color === participantDraft.DIVISION_COLOR_PALETTE[1] &&
    defaultCards[0].initial === '分' &&
    defaultCards[0].divisionId === defaults[0].divisionId
);

var many = defaults.slice();
var add1 = participantDraft.addDivision(many, host);
assert('添加分队成功', add1.ok);
many = add1.participants;
var add2 = participantDraft.addDivision(many, host);
assert('继续添加分队成功', add2.ok);
many = add2.participants;
var manyCards = participantDraft.buildDivisionCards(many);
assert(
  '多分队数量下每张卡仍有独立颜色块数据',
  many.length === 4 &&
    manyCards.length === 4 &&
    manyCards.every(function (c) {
      return !!c.color && !!c.divisionId && c.color.charAt(0) === '#';
    })
);

var emptyPatch = participantDraft.updateDivision(defaults, defaults[0].divisionId, {
  nameSnapshot: '   '
});
var emptyCards = participantDraft.buildDivisionCards(emptyPatch.participants);
assert(
  '空名称仍保存且回显颜色不丢',
  emptyPatch.ok &&
    emptyPatch.participants[0].nameSnapshot === '' &&
    emptyCards[0].name === '未命名分队' &&
    emptyCards[0].color === defaults[0].colorSnapshot &&
    emptyCards[0].divisionId === defaults[0].divisionId
);

var longName = '这是一个非常非常长的分队名称二十';
var longPatch = participantDraft.updateDivision(defaults, defaults[1].divisionId, {
  nameSnapshot: longName
});
var longCards = participantDraft.buildDivisionCards(longPatch.participants);
assert(
  '长名称回显颜色与身份不变',
  longPatch.ok &&
    longPatch.participants[1].nameSnapshot === longName &&
    longCards[1].nameInput === longName &&
    longCards[1].color === defaults[1].colorSnapshot &&
    longCards[1].initial === '这' &&
    longCards[1].divisionId === defaults[1].divisionId
);

var colorPatch = participantDraft.updateDivision(defaults, defaults[0].divisionId, {
  colorSnapshot: participantDraft.DIVISION_COLOR_PALETTE[3]
});
var echoCards = participantDraft.buildDivisionCards(colorPatch.participants);
assert(
  '改色后回显新颜色，divisionId 不变',
  colorPatch.ok &&
    echoCards[0].color === participantDraft.DIVISION_COLOR_PALETTE[3] &&
    echoCards[0].divisionId === defaults[0].divisionId &&
    echoCards[0].seriesParticipantId === defaults[0].seriesParticipantId
);

assert(
  '默认分队源数据未被卡片投影改写',
  JSON.stringify(defaults) === JSON.stringify(defaultSnap)
);

assert(
  '页面仍走 buildDivisionCards / updateDivision，未复制结构',
  pageJs.indexOf('buildDivisionCards') >= 0 &&
    pageJs.indexOf('updateDivision') >= 0 &&
    draftSrc.indexOf('function buildDivisionCards') >= 0 &&
    pageWxml.split('class="series-division-swatch"').length === 2
);

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log(failures.join('\n'));
  process.exit(1);
}
process.exit(0);
