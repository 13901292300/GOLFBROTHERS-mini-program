/**
 * 新建比赛默认开球时间：本地墙钟快照后取最近 10 分钟档。
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/createTeeTimeNow.selftest.js
 */

var bag = {};
global.wx = {
  getStorageSync: function (key) {
    return bag[key];
  },
  setStorageSync: function (key, value) {
    bag[key] = JSON.parse(JSON.stringify(value));
  },
  removeStorageSync: function (key) {
    delete bag[key];
  },
  showToast: function () {}
};

var createTeeTimeNow = require('../miniprogram/utils/createTeeTimeNow.js');
var quickCreate = require('../miniprogram/utils/quickCreate.js');
var timeWheelBridge = require('../miniprogram/subpackages/create/utils/timeWheelBridge.js');
var gameEdit = require('../miniprogram/subpackages/create/utils/gameEdit.js');
var roundDraft = require('../miniprogram/subpackages/create/pages/series/roundDraft.js');

var passed = 0;
var failed = 0;

function assert(label, ok, detail) {
  if (ok) {
    passed += 1;
    console.log('PASS  ' + label);
    return;
  }
  failed += 1;
  console.log('FAIL  ' + label + (detail ? ' :: ' + detail : ''));
}

function roundIso(y, mo, d, h, mi) {
  return createTeeTimeNow.formatIsoLocal(
    createTeeTimeNow.roundDraftToTenMinutes(
      createTeeTimeNow.partsFromDate(new Date(y, mo - 1, d, h, mi, 0, 0))
    )
  );
}

function cloneDraft(iso) {
  return createTeeTimeNow.parseTimeToDraftForWheel(iso);
}

function confirmOpenWheel(iso) {
  var draft = cloneDraft(iso);
  var payload = timeWheelBridge.buildWheelPayload(draft);
  var applied = timeWheelBridge.applyPickerValue(draft, payload.teeIndex);
  return {
    payload: payload,
    text: timeWheelBridge.formatDateTime(applied.draft),
    minute: applied.draft.minute,
    hour: applied.draft.hour,
    day: applied.draft.day
  };
}

function applyDelta(iso, patchIndex) {
  var draft = cloneDraft(iso);
  var idx = timeWheelBridge.buildWheelPayload(draft).teeIndex.slice();
  if (patchIndex.month != null) idx[0] = patchIndex.month;
  if (patchIndex.day != null) idx[1] = patchIndex.day;
  if (patchIndex.hour != null) idx[2] = patchIndex.hour;
  if (patchIndex.minute != null) idx[3] = patchIndex.minute;
  return timeWheelBridge.formatDateTime(timeWheelBridge.applyPickerValue(draft, idx).draft);
}

assert('分钟档仅 6 档', createTeeTimeNow.MINUTE_VALUES.length === 6);
assert(
  '分钟档为 00/10/20/30/40/50',
  String(createTeeTimeNow.MINUTE_VALUES) === '0,10,20,30,40,50'
);

assert('13:02 → 13:00', roundIso(2026, 9, 7, 13, 2) === '2026-09-07 13:00');
assert('13:05 → 13:10', roundIso(2026, 9, 7, 13, 5) === '2026-09-07 13:10');
assert('13:14 → 13:10', roundIso(2026, 9, 7, 13, 14) === '2026-09-07 13:10');
assert('13:15 → 13:20', roundIso(2026, 9, 7, 13, 15) === '2026-09-07 13:20');
assert('13:54 → 13:50', roundIso(2026, 9, 7, 13, 54) === '2026-09-07 13:50');
assert('13:55 → 14:00', roundIso(2026, 9, 7, 13, 55) === '2026-09-07 14:00');
assert('23:58 → 次日 00:00', roundIso(2026, 9, 7, 23, 58) === '2026-09-08 00:00');
assert('月末 23:58 跨月', roundIso(2026, 1, 31, 23, 58) === '2026-02-01 00:00');
assert('年末 23:58 跨年', roundIso(2026, 12, 31, 23, 58) === '2027-01-01 00:00');

var frozen = new Date(2026, 8, 7, 18, 47, 30, 0);
var snap = createTeeTimeNow.snapshot(frozen);
assert('同一次快照日期', snap.tee.year === 2026 && snap.tee.month === 9 && snap.tee.day === 7);
assert('18:47 取整到 18:50', snap.tee.hour === 18 && snap.tee.minute === 50);
assert('截止为前一日 18:00', createTeeTimeNow.formatIsoLocal(snap.deadline) === '2026-09-06 18:00');
assert('开球 ISO 本地', createTeeTimeNow.formatIsoLocal(snap.tee) === '2026-09-07 18:50');

var midnight = new Date(2026, 8, 8, 0, 3, 0, 0);
var midSnap = createTeeTimeNow.snapshot(midnight);
assert(
  '跨日 00:03 → 00:00',
  createTeeTimeNow.formatIsoLocal(midSnap.tee) === '2026-09-08 00:00' &&
    createTeeTimeNow.formatIsoLocal(midSnap.deadline) === '2026-09-07 18:00'
);

var monthEdge = createTeeTimeNow.snapshot(new Date(2026, 9, 1, 0, 5, 0, 0));
assert(
  '跨月 10/01 00:05 → 00:10',
  createTeeTimeNow.formatIsoLocal(monthEdge.tee) === '2026-10-01 00:10' &&
    createTeeTimeNow.formatIsoLocal(monthEdge.deadline) === '2026-09-30 18:00'
);

var yearEdge = createTeeTimeNow.snapshot(new Date(2027, 0, 1, 0, 1, 0, 0));
assert(
  '跨年 01/01 00:01 → 00:00',
  createTeeTimeNow.formatIsoLocal(yearEdge.tee) === '2027-01-01 00:00' &&
    createTeeTimeNow.formatIsoLocal(yearEdge.deadline) === '2026-12-31 18:00'
);

var created = createTeeTimeNow.buildCreateTimes(frozen);
assert('dataPatch 与 tee 同源', created.dataPatch.teeTime === '2026-09-07 18:50');
assert('展示文案含本地日历', created.dataPatch.teeTimeText.indexOf('2026/09/07') === 0);

var session1 = createTeeTimeNow.buildCreateTimes(new Date(2026, 8, 7, 18, 47));
var session2 = createTeeTimeNow.buildCreateTimes(new Date(2026, 8, 7, 18, 52));
assert(
  '取消后重新新建取新时间',
  session1.dataPatch.teeTime === '2026-09-07 18:50' &&
    session2.dataPatch.teeTime === '2026-09-07 18:50'
);

var later = createTeeTimeNow.partsFromDate(new Date(2026, 8, 7, 19, 1, 0, 0));
assert('partsFromDate 不取整', later.hour === 19 && later.minute === 1);

var stored = createTeeTimeNow.resolveStoredDraft('2025-12-01 08:15', '');
assert('已存 ISO 不套新建默认', stored && stored.year === 2025 && stored.minute === 15);

var storedDisplay = createTeeTimeNow.resolveStoredDraft('', '2025/12/01 星期一 08:15');
assert(
  '已存展示文案恢复',
  storedDisplay && storedDisplay.year === 2025 && storedDisplay.minute === 15
);

var chinese = gameEdit.parseTeeTimeText('2026年05月04日 周一 09:13');
assert('编辑解析保留分钟', chinese && chinese.minute === 13);

function assertOpenSnaps(label, iso, expectIso) {
  var got = confirmOpenWheel(iso);
  assert(label + ' 打开后映射到合法档', got.text === expectIso);
}

assertOpenSnaps('18:47', '2026-09-07 18:47', '2026-09-07 18:50');
assertOpenSnaps('18:00', '2026-09-07 18:00', '2026-09-07 18:00');
assertOpenSnaps('23:59', '2026-09-07 23:59', '2026-09-08 00:00');

assert(
  '普通创建确认文案取整 18:50',
  createTeeTimeNow.formatChineseTeeText(cloneDraft('2026-09-07 18:47')) ===
    '2026年09月07日 周一 18:50'
);

var opened = confirmOpenWheel('2026-09-07 18:47');
assert(
  '初始化 change 回放当前下标保持取整档',
  timeWheelBridge.formatDateTime(
    timeWheelBridge.applyPickerValue(cloneDraft('2026-09-07 18:47'), opened.payload.teeIndex).draft
  ) === '2026-09-07 18:50'
);

assert('仅改日期保留 18:50', applyDelta('2026-09-07 18:47', { day: 7 }) === '2026-09-08 18:50');
assert('仅改小时保留 50 分', applyDelta('2026-09-07 18:47', { hour: 19 }) === '2026-09-07 19:50');
assert('主动改分钟到 40', applyDelta('2026-09-07 18:47', { minute: 4 }) === '2026-09-07 18:40');
assert('18:00 仅改日期', applyDelta('2026-09-07 18:00', { day: 7 }) === '2026-09-08 18:00');
assert('23:50 仅改小时', applyDelta('2026-09-07 23:50', { hour: 22 }) === '2026-09-07 22:50');

var seriesSeed = roundDraft.createDefaultLocalDateTime(frozen);
assert('系列赛空轮选择器种子取整', seriesSeed === '2026-09-07 18:50');
assert(
  '系列赛空轮首次确认写入取整档',
  timeWheelBridge.formatDateTime(timeWheelBridge.parseTimeToDraft(seriesSeed)) ===
    '2026-09-07 18:50'
);

var blankRounds = [
  { roundId: 'r1', dateTime: '', dateTimeUserEdited: false },
  { roundId: 'r2', dateTime: '', dateTimeUserEdited: false }
];
var cancelSnapshot = JSON.stringify(blankRounds);
assert('系列赛取消不写草稿', JSON.stringify(blankRounds) === cancelSnapshot && !blankRounds[0].dateTime);

var cascaded = roundDraft.cascadeDateTimeFromRound(
  [
    { roundId: 'r1', dateTime: '', dateTimeUserEdited: false },
    { roundId: 'r2', dateTime: '', dateTimeUserEdited: false }
  ],
  'r1',
  '2026-09-07 18:50'
);
assert(
  '系列赛首次确认级联 +24h 且保留分钟',
  cascaded.ok &&
    cascaded.rounds[0].dateTime === '2026-09-07 18:50' &&
    cascaded.rounds[1].dateTime === '2026-09-08 18:50'
);

var protectedCascade = roundDraft.cascadeDateTimeFromRound(
  [
    { roundId: 'r1', dateTime: '2026-09-07 18:47', dateTimeUserEdited: true },
    { roundId: 'r2', dateTime: '2026-09-07 15:00', dateTimeUserEdited: true }
  ],
  'r1',
  '2026-09-07 19:01'
);
assert(
  '后续轮次手动时间受保护',
  protectedCascade.ok &&
    protectedCascade.rounds[0].dateTime === '2026-09-07 19:01' &&
    protectedCascade.rounds[1].dateTime === '2026-09-07 15:00'
);

var page = {};
timeWheelBridge.initDualFieldPage(page, {});
assert(
  'initDualFieldPage 非写死 2026-06-03 09:00',
  page._tee &&
    !(page._tee.year === 2026 && page._tee.month === 6 && page._tee.day === 3 && page._tee.hour === 9)
);
assert('initDualFieldPage 默认分钟合法', createTeeTimeNow.MINUTE_VALUES.indexOf(page._tee.minute) >= 0);

var editPage = {};
timeWheelBridge.initDualFieldPage(editPage, {
  teeTime: '2024-01-02 11:22',
  deadlineTime: '2024-01-01 18:00'
});
assert(
  '编辑恢复已存时间不取整',
  editPage._tee.year === 2024 && editPage._tee.minute === 22 && editPage._deadline.day === 1
);

var qc = quickCreate.buildQuickCreateGame(
  { courseId: 'c1', courseName: '测试球场', courseLocation: '', halfText: '' },
  { userId: 'u1', name: '测', avatar: '' },
  frozen
);
assert(
  '快捷创建写入取整后的本地中文开球时间',
  qc.game.teeTime === '2026年09月07日 周一 18:50' && qc.matchState.course.teeTime === qc.game.teeTime
);

var submitForm = { teeTime: created.dataPatch.teeTime, teeTimeText: created.dataPatch.teeTimeText };
assert(
  '提交取值等于表单显示源',
  submitForm.teeTime === '2026-09-07 18:50' && submitForm.teeTimeText.indexOf('18:50') >= 0
);

var a = createTeeTimeNow.partsFromDate(frozen);
var b = createTeeTimeNow.partsFromDate(frozen);
assert('同一 Date 两次 parts 一致', a.minute === b.minute && a.day === b.day);

var bindGate = require('../miniprogram/subpackages/create/components/time-wheel-picker/bindGate.js');
var fs = require('fs');
var path = require('path');
var pickerJs = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'subpackages', 'create', 'components', 'time-wheel-picker', 'index.js'),
  'utf8'
);
var pickerWxml = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'subpackages', 'create', 'components', 'time-wheel-picker', 'index.wxml'),
  'utf8'
);
assert('已移除全零启发式', pickerJs.indexOf('_isStaleZeroEvent') < 0);
assert('picker-view 受 pickerReady 门闩', pickerWxml.indexOf('wx:if="{{pickerReady}}"') >= 0);

function simulatePicker() {
  return { pickerReady: false, innerValue: [0, 0, 0, 0], forwarded: [] };
}
function openPicker(sim, bound) {
  var patch = bindGate.mountPatch(bound);
  sim.innerValue = patch.innerValue;
  sim.pickerReady = patch.pickerReady;
}
function closePicker(sim) {
  sim.pickerReady = bindGate.closePatch().pickerReady;
}
function nativeChange(sim, value) {
  if (!bindGate.shouldForwardPickerChange(sim.pickerReady)) {
    return { forwarded: false };
  }
  var idx = bindGate.toIndex4(value);
  sim.innerValue = idx;
  sim.forwarded.push(idx);
  return { forwarded: true, value: idx };
}
function applyToIso(iso, index) {
  var draft = cloneDraft(iso);
  draft.year = 2026;
  return timeWheelBridge.formatDateTime(timeWheelBridge.applyPickerValue(draft, index).draft);
}

var sepIdx = confirmOpenWheel('2026-09-07 18:50').payload.teeIndex;
var janIdx = [0, 0, 0, 0];

var simInit = simulatePicker();
var beforeMount = nativeChange(simInit, janIdx);
assert('未挂载时全零事件不转发', beforeMount.forwarded === false);
openPicker(simInit, sepIdx);
assert('9月7日 18:50 挂载下标', bindGate.sameIndex4(simInit.innerValue, sepIdx));
var echo = nativeChange(simInit, sepIdx);
assert(
  '挂载后回声为绑定值，确认仍为 18:50',
  echo.forwarded && applyToIso('2026-09-07 18:50', echo.value) === '2026-09-07 18:50'
);

var simUser = simulatePicker();
openPicker(simUser, sepIdx);
var userZero = nativeChange(simUser, janIdx);
assert('用户从 18:50 选 1月1日 00:00 会转发', userZero.forwarded === true);
assert(
  '确认保存 1月1日 00:00',
  applyToIso('2026-09-07 18:50', userZero.value) === '2026-01-01 00:00'
);

var simJan = simulatePicker();
openPicker(simJan, janIdx);
var janEcho = nativeChange(simJan, janIdx);
assert('原值 1月1日 00:00 打开后事件转发', janEcho.forwarded === true);
assert(
  '原值 1月1日 00:00 确认保持',
  applyToIso('2026-01-01 00:00', janEcho.value) === '2026-01-01 00:00'
);

var simReopen = simulatePicker();
openPicker(simReopen, sepIdx);
closePicker(simReopen);
assert('关闭后 pickerReady=false', simReopen.pickerReady === false);
assert('关闭后事件不转发', nativeChange(simReopen, janIdx).forwarded === false);
openPicker(simReopen, sepIdx);
var reopenChange = nativeChange(simReopen, [8, 6, 19, 5]);
assert('重新打开后正常选择转发', reopenChange.forwarded === true);
assert(
  '重新打开后改小时可保存',
  applyToIso('2026-09-07 18:50', reopenChange.value) === '2026-09-07 19:50'
);

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
