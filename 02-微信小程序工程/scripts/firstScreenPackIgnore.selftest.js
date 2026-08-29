/**
 * 第一批首屏/包体优化：packOptions.ignore 与首页日程 Sheet wx:if。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/firstScreenPackIgnore.selftest.js
 */

var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var configPath = path.join(root, 'project.config.json');
var homeWxmlPath = path.join(mini, 'pages', 'home', 'index.wxml');
var passed = 0;
var failed = 0;

function assert(label, ok) {
  if (ok) {
    passed += 1;
    console.log('PASS  ' + label);
    return;
  }
  failed += 1;
  console.log('FAIL  ' + label);
}

function walkTextFiles(dir, acc) {
  acc = acc || [];
  if (!fs.existsSync(dir)) return acc;
  fs.readdirSync(dir).forEach(function (name) {
    var abs = path.join(dir, name);
    var st = fs.statSync(abs);
    if (st.isDirectory()) {
      walkTextFiles(abs, acc);
      return;
    }
    if (/\.(js|json|wxml|wxss)$/i.test(name)) acc.push(abs);
  });
  return acc;
}

function productionHits(needles) {
  var files = walkTextFiles(mini);
  var hits = [];
  files.forEach(function (abs) {
    var rel = path.relative(mini, abs).replace(/\\/g, '/');
    var text = fs.readFileSync(abs, 'utf8');
    needles.forEach(function (needle) {
      if (text.indexOf(needle) >= 0) {
        hits.push(rel + ' :: ' + needle);
      }
    });
  });
  return hits;
}

function extractOpenTag(wxml, tag) {
  var re = new RegExp('<' + tag + '\\b[\\s\\S]*?/?>');
  var m = wxml.match(re);
  return m ? m[0] : '';
}

var parseOk = false;
var config = {};
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  parseOk = true;
} catch (e) {
  config = {};
}
assert('project.config.json 可解析', parseOk);

var ignore = (config.packOptions && config.packOptions.ignore) || [];
function hasIgnore(type, value) {
  return ignore.some(function (item) {
    return item && item.type === type && item.value === value;
  });
}

assert('保留 ignore scripts 目录', hasIgnore('folder', 'scripts'));
assert('保留 ignore poster fonts 目录', hasIgnore('folder', 'subpackages/poster/fonts'));
assert('新增 ignore assets/footprints', hasIgnore('folder', 'assets/footprints'));
assert(
  '新增 ignore bucket_start.wav',
  hasIgnore('file', 'subpackages/reaction/assets/sounds/bucket_start.wav')
);
assert(
  '新增 ignore bucket_end.wav',
  hasIgnore('file', 'subpackages/reaction/assets/sounds/bucket_end.wav')
);
assert(
  '未忽略 bucket_water_new.wav',
  !ignore.some(function (item) {
    return item && String(item.value || '').indexOf('bucket_water_new.wav') >= 0;
  })
);

var wxml = fs.readFileSync(homeWxmlPath, 'utf8');
var dayTag = extractOpenTag(wxml, 'schedule-day-sheet');
var editorTag = extractOpenTag(wxml, 'schedule-editor-sheet');
assert('首页含 schedule-day-sheet 开标签', !!dayTag);
assert('首页含 schedule-editor-sheet 开标签', !!editorTag);

assert(
  'day-sheet wx:if 与 visible 使用同一状态',
  dayTag.indexOf('wx:if="{{scheduleDaySheetVisible}}"') >= 0 &&
    dayTag.indexOf('visible="{{scheduleDaySheetVisible}}"') >= 0
);
assert(
  'editor-sheet wx:if 与 visible 使用同一状态',
  editorTag.indexOf('wx:if="{{scheduleEditorVisible}}"') >= 0 &&
    editorTag.indexOf('visible="{{scheduleEditorVisible}}"') >= 0
);

assert('day-sheet 保留 id', dayTag.indexOf('id="schedule-day-sheet"') >= 0);
assert(
  'day-sheet 保留 props',
  dayTag.indexOf('date="{{scheduleDaySheetDate}}"') >= 0 &&
    dayTag.indexOf('events="{{scheduleDaySheetEvents}}"') >= 0 &&
    dayTag.indexOf('themeClass="{{themeClass}}"') >= 0
);
assert(
  'day-sheet 保留事件',
  dayTag.indexOf('bind:close="onScheduleDaySheetClose"') >= 0 &&
    dayTag.indexOf('bind:add="onScheduleDaySheetAdd"') >= 0 &&
    dayTag.indexOf('bind:edit="onScheduleDaySheetEdit"') >= 0 &&
    dayTag.indexOf('bind:viewMatch="onScheduleViewMatch"') >= 0 &&
    dayTag.indexOf('bind:editNote="onScheduleEditNote"') >= 0
);

assert('editor-sheet 保留 id', editorTag.indexOf('id="schedule-editor-sheet"') >= 0);
assert(
  'editor-sheet 保留 props',
  editorTag.indexOf('date="{{scheduleEditorDate}}"') >= 0 &&
    editorTag.indexOf('schedule="{{scheduleEditorSchedule}}"') >= 0 &&
    editorTag.indexOf('mode="{{scheduleEditorMode}}"') >= 0 &&
    editorTag.indexOf('themeClass="{{themeClass}}"') >= 0
);
assert(
  'editor-sheet 保留事件',
  editorTag.indexOf('bind:close="onScheduleEditorClose"') >= 0 &&
    editorTag.indexOf('bind:save="saveScheduleFromEditor"') >= 0 &&
    editorTag.indexOf('bind:saveNote="saveScheduleNoteFromEditor"') >= 0 &&
    editorTag.indexOf('bind:delete="deleteScheduleFromEditor"') >= 0 &&
    editorTag.indexOf('bind:openMemberPicker="onScheduleEditorOpenMemberPicker"') >= 0
);

var unusedHits = productionHits([
  'footprint-map-bright.svg',
  'footprint-map-dark.svg',
  'world-map.svg',
  'assets/footprints',
  'bucket_start.wav',
  'bucket_end.wav'
]);
assert(
  '足迹 SVG、bucket_start、bucket_end 无生产引用',
  unusedHits.length === 0
);
if (unusedHits.length) {
  unusedHits.forEach(function (hit) {
    console.log('  HIT  ' + hit);
  });
}

var waterHits = productionHits(['bucket_water_new.wav']);
assert('bucket_water_new.wav 仍被生产引用', waterHits.length > 0);

console.log('\npassed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
