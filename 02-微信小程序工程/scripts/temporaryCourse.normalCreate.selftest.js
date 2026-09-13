/**
 * Temporary Course 普通创建 V1。
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/temporaryCourse.normalCreate.selftest.js
 */

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');

var passed = 0;
var failed = 0;
function assert(label, ok) {
  if (ok) {
    passed += 1;
    console.log('PASS  ' + label);
  } else {
    failed += 1;
    console.log('FAIL  ' + label);
  }
}

var storage = {};
global.wx = {
  getStorageSync: function (key) {
    return storage[key];
  },
  setStorageSync: function (key, value) {
    storage[key] = value;
  }
};

var holeLayout = require(path.join(mini, 'utils', 'holeLayout.js'));
var halfCourse = require(path.join(mini, 'utils', 'halfCourse.js'));
var temporaryCourse = require(path.join(mini, 'utils', 'temporaryCourse.js'));
var gameEdit = require(path.join(mini, 'subpackages', 'create', 'utils', 'gameEdit.js'));
var gameStore = require(path.join(mini, 'utils', 'gameStore.js'));
var groupsStore = require(path.join(mini, 'utils', 'groupsStore.js'));
var gameLeaderboard = require(path.join(mini, 'utils', 'gameLeaderboard.js'));
var gameHostContext = require(path.join(mini, 'subpackages', 'game', 'utils', 'gameHostContext.js'));
var sideGameHostSnapshot = require(path.join(mini, 'subpackages', 'scoring', 'utils', 'sideGameHostSnapshot.js'));

var CUSTOM_PARS = [3, 3, 3, 3, 3, 3, 3, 3, 3, 5, 5, 5, 5, 5, 5, 5, 5, 5];
var DEFAULT_LAYOUT = holeLayout.createDefaultLayout();

function validForm(extra) {
  return Object.assign(
    {
      teeTimeText: '2026年9月9日 08:00',
      gameMode: '个人比杆赛',
      visibility: 'public',
      groups: [{ id: 'grp-1', players: [{ filled: true, name: 'A' }] }]
    },
    extra || {}
  );
}

var layout1 = holeLayout.resolveLayoutFromContext({
  courseSource: 'temporary',
  courseName: '自定义林克斯',
  holePars: CUSTOM_PARS,
  front9Course: 'A',
  back9Course: 'B'
});
assert(
  'CASE1 temporary 使用自定义 18 洞 PAR，不用 DEFAULT_PAR9',
  layout1.holePars.join(',') === CUSTOM_PARS.join(',') &&
    layout1.holePars.join(',') !== DEFAULT_LAYOUT.holePars.join(',')
);

var qhwName = '北京清河湾乡村高尔夫俱乐部';
var layout2 = holeLayout.resolveLayoutFromContext({
  courseSource: 'temporary',
  courseId: '',
  courseName: qhwName,
  holePars: CUSTOM_PARS,
  front9Course: 'A',
  back9Course: 'B'
});
var qhwOfficial = holeLayout.resolveLayoutFromContext({
  courseId: 'c-qhw',
  courseName: qhwName,
  front9Course: 'A',
  back9Course: 'B',
  courseLayoutRevision: 'catalog'
});
assert(
  'CASE2 temporary 名称命中正式球场仍用 snapshot',
  layout2.holePars.join(',') === CUSTOM_PARS.join(',') &&
    qhwOfficial.holePars.join(',') !== CUSTOM_PARS.join(',')
);

assert(
  'CASE3 temporary 无 courseId 可通过校验',
  gameEdit.validateSubmitForm(
    validForm({
      courseSource: 'temporary',
      courseId: '',
      courseName: '',
      front9Course: 'A',
      back9Course: 'B',
      holePars: CUSTOM_PARS
    })
  ) == null
);

assert(
  'CASE4 普通非 temporary 无 courseId 仍失败',
  gameEdit.validateSubmitForm(validForm({ courseId: '', courseName: '' })) ===
    '尚未选择球场，请选择后才可确认'
);

assert(
  'CASE5 temporary 少于 18 洞创建失败',
  gameEdit.validateSubmitForm(
    validForm({
      courseSource: 'temporary',
      holePars: CUSTOM_PARS.slice(0, 17)
    })
  ) === '请完成18洞标准杆（每洞3/4/5/6）'
);

var withPar2 = CUSTOM_PARS.slice();
withPar2[0] = 2;
var withPar6 = CUSTOM_PARS.slice();
withPar6[17] = 6;
assert(
  'CASE6 temporary 含 par2 创建失败',
  gameEdit.validateSubmitForm(validForm({ courseSource: 'temporary', holePars: withPar2 })) ===
    '请完成18洞标准杆（每洞3/4/5/6）'
);

storage = {};
var saved = gameStore.saveGame({
  gameId: 'g-temp-reload',
  courseSource: 'temporary',
  temporaryCourseId: 'tc-1-1',
  courseId: '',
  courseName: '',
  front9Course: 'A',
  back9Course: 'B',
  holePars: CUSTOM_PARS.slice(),
  status: 'active',
  groups: []
});
storage = JSON.parse(JSON.stringify(storage));
var reloaded = gameStore.getGameById('g-temp-reload');
assert(
  'CASE7 saveGame reload 后 holePars 仍在',
  !!(saved && reloaded) &&
    Array.isArray(reloaded.holePars) &&
    reloaded.holePars.join(',') === CUSTOM_PARS.join(',') &&
    reloaded.courseSource === 'temporary'
);

var cellStatus = groupsStore.getScoreStatus(4 - 5);
assert(
  'CASE8 score diff 使用 temporary par（4 on par5 = birdie）',
  cellStatus === 'birdie'
);

holeLayout.applyLayout(layout1);
var agg = { total: 0, parThru: 0 };
CUSTOM_PARS.forEach(function (par, i) {
  if (i < 2) {
    agg.total += 4;
    agg.parThru += gameLeaderboard.holePars()[i];
  }
});
assert(
  'CASE9 leaderboard To Par 使用 temporary par',
  gameLeaderboard.holePars().join(',') === CUSTOM_PARS.join(',') && agg.parThru === 6 && agg.total - agg.parThru === 2
);

var hostSnap = sideGameHostSnapshot.fromGame(
  {
    gameId: 'g-temp-sg',
    courseSource: 'temporary',
    courseId: '',
    courseName: qhwName,
    front9Course: 'A',
    back9Course: 'B',
    holePars: CUSTOM_PARS.slice(),
    groups: [{ groupId: 'g1', playersSlots: [{ playerId: 'p1', name: 'A' }], scoresByPlayer: {} }]
  },
  { matchId: 'g-temp-sg' }
);
var holeCtx = gameHostContext.resolveOfficialHoleContext(hostSnap.courseContext);
var hostPars = CUSTOM_PARS.map(function (p, i) {
  var label = (i < 9 ? 'A' : 'B') + ((i % 9) + 1);
  return holeCtx.pars[label];
});
assert(
  'CASE10 side-game temporary holeContextReady 且 par 一致',
  holeCtx.holeContextReady === true && hostPars.join(',') === CUSTOM_PARS.join(',')
);

assert(
  'CASE11 正式球场仍走 COURSE_DB（清河湾 A/B）',
  qhwOfficial.holePars.slice(0, 9).join(',') === '4,3,4,4,4,3,5,4,5'
);

var selectWxml = fs.readFileSync(
  path.join(mini, 'subpackages', 'create', 'pages', 'course', 'select', 'index.wxml'),
  'utf8'
);
var selectJs = fs.readFileSync(
  path.join(mini, 'subpackages', 'create', 'pages', 'course', 'select', 'index.js'),
  'utf8'
);
assert(
  'CASE12 搜索无结果存在创建临时球场入口',
  selectWxml.indexOf('未找到匹配的球场，换个关键词试试') >= 0 &&
    selectWxml.indexOf('创建临时球场') >= 0 &&
    selectJs.indexOf('onCreateTemporaryCourse') >= 0
);

var displayEmpty = halfCourse.formatCourseDisplayName({
  courseSource: 'temporary',
  courseName: '',
  front9Course: 'A',
  back9Course: 'B'
});
assert(
  'CASE13 空 courseName display fallback 临时球场',
  displayEmpty === '临时球场' &&
    gameEdit.validateSubmitForm(
      validForm({
        courseSource: 'temporary',
        courseId: '',
        courseName: '',
        front9Course: 'A',
        back9Course: 'B',
        holePars: CUSTOM_PARS
      })
    ) == null
);

var fields = halfCourse.buildCourseSelectionFields({
  courseSource: 'temporary',
  temporaryCourseId: 'tc-9-1',
  courseId: 'c-qhw',
  courseName: '',
  holePars: CUSTOM_PARS,
  front9Course: 'A',
  back9Course: 'B'
});
assert(
  'payload adapter 保留 temporary 且不伪造正式 courseId',
  fields.courseSource === 'temporary' &&
    fields.courseId === '' &&
    fields.temporaryCourseId === 'tc-9-1' &&
    fields.holePars.join(',') === CUSTOM_PARS.join(',')
);

var officialFields = halfCourse.buildCourseSelectionFields({
  courseId: 'c-qhw',
  courseName: qhwName,
  front9Course: 'A',
  back9Course: 'B',
  courseLayoutRevision: 2
});
assert(
  '正式回填会清掉 temporary 字段',
  officialFields.courseSource === '' &&
    officialFields.courseId === 'c-qhw' &&
    officialFields.holePars == null
);

var id1 = temporaryCourse.nextTemporaryCourseId();
var id2 = temporaryCourse.nextTemporaryCourseId();
assert(
  'temporaryCourseId 使用 tc- 前缀且不重复',
  /^tc-\d+-\d+$/.test(id1) && id1 !== id2 && id1.indexOf('c-') !== 0
);

var appJson = JSON.parse(fs.readFileSync(path.join(mini, 'app.json'), 'utf8'));
var createPkg = (appJson.subPackages || []).find(function (p) {
  return p.name === 'create';
});
assert(
  'temporary 页已注册 create 分包',
  createPkg && createPkg.pages.indexOf('pages/course/temporary/index') >= 0
);

var emptyTempFields = halfCourse.buildCourseSelectionFields({
  courseSource: 'temporary',
  temporaryCourseId: 'tc-ui-1',
  courseId: '',
  courseName: '',
  holePars: CUSTOM_PARS,
  front9Course: 'A',
  back9Course: 'B'
});
var namedTempFields = halfCourse.buildCourseSelectionFields({
  courseSource: 'temporary',
  temporaryCourseId: 'tc-ui-2',
  courseName: '林克斯练习场',
  holePars: CUSTOM_PARS,
  front9Course: 'A',
  back9Course: 'B'
});
var afterOfficial = halfCourse.buildCourseSelectionFields({
  courseId: 'c-qhw',
  courseName: qhwName,
  front9Course: 'A',
  back9Course: 'B',
  courseLayoutRevision: 2
});
var restoredEmptyTemp = {
  courseSource: 'temporary',
  temporaryCourseId: 'tc-ui-1',
  courseId: '',
  courseName: '',
  holePars: CUSTOM_PARS.slice(),
  front9Course: 'A',
  back9Course: 'B'
};
var normalWxml = fs.readFileSync(
  path.join(mini, 'subpackages', 'create', 'pages', 'normal', 'index.wxml'),
  'utf8'
);
assert(
  'CASE18 temporary 空名仍显示已选择且 fallback 临时球场',
  emptyTempFields.courseName === '' &&
    emptyTempFields.hasSelectedCourse === true &&
    emptyTempFields.courseDisplayName === '临时球场' &&
    halfCourse.hasSelectedCourse(restoredEmptyTemp) === true &&
    halfCourse.formatCourseDisplayName(restoredEmptyTemp) === '临时球场' &&
    normalWxml.indexOf('wx:if="{{hasSelectedCourse}}"') >= 0 &&
    normalWxml.indexOf('wx:if="{{courseName}}"') < 0 &&
    /请选择球场/.test(normalWxml) &&
    gameEdit.validateSubmitForm(
      validForm({
        courseSource: 'temporary',
        courseId: '',
        courseName: '',
        front9Course: 'A',
        back9Course: 'B',
        holePars: CUSTOM_PARS
      })
    ) == null
);

assert(
  'CASE19 temporary 有名称时显示用户名称',
  namedTempFields.hasSelectedCourse === true &&
    namedTempFields.courseName === '林克斯练习场' &&
    namedTempFields.courseDisplayName === '林克斯练习场'
);

assert(
  'CASE20 temporary 后再选正式球场会清空 marker 并显示正式名',
  afterOfficial.courseSource === '' &&
    afterOfficial.temporaryCourseId === '' &&
    afterOfficial.holePars == null &&
    afterOfficial.hasSelectedCourse === true &&
    afterOfficial.courseId === 'c-qhw' &&
    afterOfficial.courseDisplayName.indexOf(qhwName) === 0 &&
    afterOfficial.courseDisplayName.indexOf('临时球场') < 0 &&
    halfCourse.hasSelectedCourse({
      courseSource: '',
      courseId: '',
      courseName: '',
      holePars: null
    }) === false
);

var officialPlain = halfCourse.formatCourseDisplayName({
  courseName: '北京乡村高尔夫俱乐部',
  front9Course: 'A',
  back9Course: 'B'
});
assert(
  'CASE21 temporary 空名不追加 A&B',
  halfCourse.formatCourseDisplayName({
    courseSource: 'temporary',
    courseName: '',
    front9Course: 'A',
    back9Course: 'B',
    courseHalfText: 'A&B'
  }) === '临时球场'
);

assert(
  'CASE22 temporary 有名称不追加 A&B',
  halfCourse.formatCourseDisplayName({
    courseSource: 'temporary',
    courseName: '我的临时场',
    front9Course: 'A',
    back9Course: 'B',
    courseHalfText: 'A&B'
  }) === '我的临时场'
);

assert(
  'CASE23 正式球场仍追加 A&B',
  officialPlain === '北京乡村高尔夫俱乐部 A&B'
);

var CF_PARS = [4, 4, 6, 4, 5, 3, 4, 5, 4, 3, 4, 4, 5, 6, 4, 4, 3, 5];
var cfPayload = {
  courseSource: 'temporary',
  temporaryCourseId: 'tc-cf-1',
  courseId: '',
  courseName: '',
  front9Course: 'C',
  back9Course: 'F',
  holePars: CF_PARS.slice()
};
var cfFields = halfCourse.buildCourseSelectionFields(cfPayload);
assert(
  'CASE24 front=C back=F payload 保留 C/F',
  cfFields.front9Course === 'C' &&
    cfFields.back9Course === 'F' &&
    cfFields.holePars.join(',') === CF_PARS.join(',') &&
    gameEdit.validateSubmitForm(validForm(cfPayload)) == null
);

storage = {};
var savedCf = gameStore.saveGame({
  gameId: 'g-temp-cf',
  courseSource: 'temporary',
  temporaryCourseId: 'tc-cf-1',
  courseId: '',
  courseName: '',
  front9Course: 'C',
  back9Course: 'F',
  holePars: CF_PARS.slice(),
  status: 'active',
  groups: []
});
storage = JSON.parse(JSON.stringify(storage));
var reloadedCf = gameStore.getGameById('g-temp-cf');
assert(
  'CASE25 C/F 保存 reload 后不变',
  !!(savedCf && reloadedCf) &&
    reloadedCf.front9Course === 'C' &&
    reloadedCf.back9Course === 'F' &&
    reloadedCf.holePars.join(',') === CF_PARS.join(',')
);

assert(
  'CASE26 非法 COURSE 失败',
  gameEdit.validateSubmitForm(
    validForm({
      courseSource: 'temporary',
      holePars: CUSTOM_PARS,
      front9Course: 'G',
      back9Course: 'F'
    })
  ) === '请选择前后九 COURSE' &&
    gameEdit.validateSubmitForm(
      validForm({
        courseSource: 'temporary',
        holePars: CUSTOM_PARS,
        front9Course: '',
        back9Course: 'B'
      })
    ) === '请选择前后九 COURSE'
);

assert(
  'CASE27 PAR 3/4/5/6 可确认',
  temporaryCourse.isValidHolePars(CF_PARS) === true &&
    temporaryCourse.isValidTemporaryCourse(cfPayload) === true
);

var emptyOne = CF_PARS.slice();
emptyOne[3] = null;
assert(
  'CASE28 任一洞空 invalid',
  temporaryCourse.isValidHolePars(emptyOne) === false
);

assert(
  'CASE29 PAR=2 invalid',
  temporaryCourse.parseParInput('2') == null &&
    temporaryCourse.isValidPar(2) === false
);

assert(
  'CASE30 PAR=7 invalid',
  temporaryCourse.parseParInput('7') == null &&
    temporaryCourse.isValidPar(7) === false
);

assert(
  'CASE31 PAR=6 valid',
  temporaryCourse.parseParInput('6') === 6 &&
    temporaryCourse.isValidPar(6) === true &&
    gameEdit.validateSubmitForm(
      validForm({
        courseSource: 'temporary',
        front9Course: 'A',
        back9Course: 'B',
        holePars: withPar6
      })
    ) == null
);

assert(
  'CASE32 前九 subtotal',
  temporaryCourse.front9ParTotal(CF_PARS) === 4 + 4 + 6 + 4 + 5 + 3 + 4 + 5 + 4
);

assert(
  'CASE33 后九 subtotal',
  temporaryCourse.back9ParTotal(CF_PARS) === 3 + 4 + 4 + 5 + 6 + 4 + 4 + 3 + 5
);

assert(
  'CASE34 TOTAL = front + back',
  temporaryCourse.totalPar(CF_PARS) ===
    temporaryCourse.front9ParTotal(CF_PARS) + temporaryCourse.back9ParTotal(CF_PARS)
);

var mutated = CF_PARS.slice();
mutated[2] = 3;
assert(
  'CASE35 改一洞后三个 total 更新',
  temporaryCourse.front9ParTotal(mutated) === temporaryCourse.front9ParTotal(CF_PARS) - 3 &&
    temporaryCourse.back9ParTotal(mutated) === temporaryCourse.back9ParTotal(CF_PARS) &&
    temporaryCourse.totalPar(mutated) === temporaryCourse.totalPar(CF_PARS) - 3
);

var par6Only = CUSTOM_PARS.slice();
par6Only[2] = 6;
storage = {};
gameStore.saveGame({
  gameId: 'g-par6',
  courseSource: 'temporary',
  temporaryCourseId: 'tc-p6',
  courseId: '',
  courseName: '',
  front9Course: 'C',
  back9Course: 'F',
  holePars: par6Only.slice(),
  status: 'active',
  groups: []
});
storage = JSON.parse(JSON.stringify(storage));
var reloadedP6 = gameStore.getGameById('g-par6');
assert(
  'CASE36 PAR6 payload/game/reload 保留 6',
  par6Only[2] === 6 &&
    reloadedP6.holePars[2] === 6 &&
    temporaryCourse.cloneHolePars(par6Only)[2] === 6
);

var layoutP6 = holeLayout.resolveLayoutFromContext({
  courseSource: 'temporary',
  courseName: '',
  holePars: par6Only,
  front9Course: 'C',
  back9Course: 'F'
});
assert(
  'CASE37 holeLayout 该洞仍 6',
  layoutP6.holePars[2] === 6 &&
    layoutP6.front9Key === 'C' &&
    layoutP6.back9Key === 'F'
);

assert(
  'CASE38 gross 6 on PAR6 = par',
  groupsStore.getScoreStatus(6 - 6) === 'par'
);

assert(
  'CASE39 gross 5 on PAR6 = birdie',
  groupsStore.getScoreStatus(5 - 6) === 'birdie'
);

holeLayout.applyLayout(layoutP6);
var p6Agg = { total: 0, parThru: 0 };
p6Agg.total += 6;
p6Agg.parThru += gameLeaderboard.holePars()[2];
assert(
  'CASE40 leaderboard To Par 按 PAR6',
  gameLeaderboard.holePars()[2] === 6 && p6Agg.total - p6Agg.parThru === 0
);

var hostSnapP6 = sideGameHostSnapshot.fromGame(
  {
    gameId: 'g-temp-p6',
    courseSource: 'temporary',
    courseId: '',
    courseName: '',
    front9Course: 'C',
    back9Course: 'F',
    holePars: par6Only.slice(),
    groups: [{ groupId: 'g1', playersSlots: [{ playerId: 'p1', name: 'A' }], scoresByPlayer: {} }]
  },
  { matchId: 'g-temp-p6' }
);
var holeCtxP6 = gameHostContext.resolveOfficialHoleContext(hostSnapP6.courseContext);
assert(
  'CASE41 side-game PAR6 不变 4',
  holeCtxP6.pars.C3 === 6 && holeCtxP6.pars.C3 !== 4
);

var cfOrder = [];
for (var ci = 1; ci <= 9; ci++) cfOrder.push('C' + ci);
for (var fi = 1; fi <= 9; fi++) cfOrder.push('F' + fi);
var cfParsAligned = cfOrder.map(function (lab) {
  return holeCtxP6.pars[lab];
});
assert(
  'CASE42 C1-C9 F1-F9 对应 holePars',
  holeCtxP6.holeOrder.join(',') === cfOrder.join(',') &&
    cfParsAligned.join(',') === par6Only.join(',')
);

var AA_MATCH_PARS = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
var aaCtx = gameHostContext.resolveOfficialHoleContext({
  courseSource: 'temporary',
  front9Course: 'A',
  back9Course: 'A',
  holePars: AA_MATCH_PARS.slice()
});
assert(
  'CASE43 A+A 允许且洞号 A1-A9 两遍',
  temporaryCourse.isValidTemporaryCourse({
    courseSource: 'temporary',
    front9Course: 'A',
    back9Course: 'A',
    holePars: AA_MATCH_PARS
  }) === true &&
    aaCtx.holeContextReady === true &&
    aaCtx.holeOrder.slice(0, 9).join(',') === 'A1,A2,A3,A4,A5,A6,A7,A8,A9' &&
    aaCtx.holeOrder.slice(9).join(',') === 'A1,A2,A3,A4,A5,A6,A7,A8,A9'
);

assert(
  'CASE44 空名 C/F display 仍 临时球场',
  halfCourse.formatCourseDisplayName({
    courseSource: 'temporary',
    courseName: '',
    front9Course: 'C',
    back9Course: 'F'
  }) === '临时球场' &&
    halfCourse.formatCourseDisplayName({
      courseSource: 'temporary',
      courseName: '',
      front9Course: 'C',
      back9Course: 'F'
    }).indexOf('C&F') < 0
);

assert(
  'CASE45 有名称 C/F 不拼 COURSE',
  halfCourse.formatCourseDisplayName({
    courseSource: 'temporary',
    courseName: '我的临时场',
    front9Course: 'C',
    back9Course: 'F'
  }) === '我的临时场'
);

assert(
  'CASE46 正式球场 A&B 仍旧逻辑',
  officialPlain === '北京乡村高尔夫俱乐部 A&B'
);

assert(
  'CASE47 清河湾 layout 回归',
  qhwOfficial.holePars.slice(0, 9).join(',') === '4,3,4,4,4,3,5,4,5'
);

var tempWxml = fs.readFileSync(
  path.join(mini, 'subpackages', 'create', 'pages', 'course', 'temporary', 'index.wxml'),
  'utf8'
);
var tempJs = fs.readFileSync(
  path.join(mini, 'subpackages', 'create', 'pages', 'course', 'temporary', 'index.js'),
  'utf8'
);
assert(
  'Temporary WXML 数字键盘 + COURSE A-F + 汇总',
  tempWxml.indexOf('type="number"') >= 0 &&
    tempWxml.indexOf('onParInput') >= 0 &&
    tempWxml.indexOf('onCyclePar') < 0 &&
    tempWxml.indexOf('front9ParTotal') >= 0 &&
    tempWxml.indexOf('back9ParTotal') >= 0 &&
    tempWxml.indexOf('totalPar') >= 0 &&
    tempWxml.indexOf('onSelectFrontCourse') >= 0 &&
    tempJs.indexOf('cyclePar') < 0 &&
    tempJs.indexOf("front9Course: 'A'") >= 0
);

assert(
  'Temporary WXML PAR focus 单 index + bindfocus',
  tempWxml.indexOf('maxlength="1"') >= 0 &&
    tempWxml.indexOf('bindfocus="onParFocus"') >= 0 &&
    tempWxml.indexOf('focus="{{focusedHoleIndex === item.index}}"') >= 0 &&
    tempWxml.indexOf('hole1Focused') < 0 &&
    tempJs.indexOf('setTimeout') < 0 &&
    tempJs.indexOf('onParFocus') >= 0
);

var parInputFocus = require(path.join(
  mini,
  'subpackages',
  'create',
  'pages',
  'course',
  'temporary',
  'parInputFocus.js'
));

function empty18() {
  var out = [];
  var i;
  for (i = 0; i < 18; i++) out.push(null);
  return out;
}

var r59 = parInputFocus.applyParInput({ holePars: empty18(), index: 0, raw: '4' });
assert('CASE59 第1洞输入4 → focusedHoleIndex = 1', r59.parsed === 4 && r59.focusedHoleIndex === 1 && r59.holePars[0] === 4);

var r60 = parInputFocus.applyParInput({ holePars: empty18(), index: 4, raw: '6' });
assert('CASE60 第5洞输入6 → focusedHoleIndex = 5', r60.parsed === 6 && r60.focusedHoleIndex === 5 && r60.holePars[4] === 6);

var r61 = parInputFocus.applyParInput({ holePars: empty18(), index: 8, raw: '4' });
assert('CASE61 第9洞合法 → 第10洞', r61.focusedHoleIndex === 9);

var r62 = parInputFocus.applyParInput({ holePars: empty18(), index: 16, raw: '3' });
assert('CASE62 第17洞合法 → 第18洞', r62.focusedHoleIndex === 17);

var r63 = parInputFocus.applyParInput({ holePars: empty18(), index: 17, raw: '5' });
assert(
  'CASE63 第18洞合法不越界不回第1洞',
  r63.parsed === 5 && r63.focusedHoleIndex === null && r63.holePars[0] == null
);

var stay2 = parInputFocus.applyParInput({ holePars: empty18(), index: 0, raw: '2' });
assert('CASE64 输入2 不跳', stay2.parsed == null && stay2.focusedHoleIndex === 0 && stay2.holePars[0] == null);

var stay7 = parInputFocus.applyParInput({ holePars: empty18(), index: 0, raw: '7' });
assert('CASE65 输入7 不跳', stay7.parsed == null && stay7.focusedHoleIndex === 0);

var stayEmpty = parInputFocus.applyParInput({ holePars: [4].concat(empty18().slice(1)), index: 0, raw: '' });
assert('CASE66 清空当前洞不跳', stayEmpty.parsed == null && stayEmpty.focusedHoleIndex === 0 && stayEmpty.holePars[0] == null);

assert(
  'CASE67 手动 focus 第5洞 → focusedHoleIndex=4',
  /onParFocus\(e\)[\s\S]*dataset\.index/.test(tempJs) &&
    /setData\(\{\s*focusedHoleIndex: idx\s*\}\)/.test(tempJs)
);

var seed68 = empty18();
seed68[4] = 4;
var r68 = parInputFocus.applyParInput({ holePars: seed68, index: 4, raw: '5' });
assert(
  'CASE68 重输第5洞后 focus 第6洞',
  r68.holePars[4] === 5 && r68.focusedHoleIndex === 5
);

var seed69 = empty18();
seed69[0] = 4;
seed69[1] = 5;
var r69 = parInputFocus.applyParInput({ holePars: seed69, index: 0, raw: '3' });
assert(
  'CASE69 下一洞已有值只 focus 不清空',
  r69.focusedHoleIndex === 1 && r69.holePars[1] === 5 && r69.holePars[0] === 3
);

var r70 = parInputFocus.applyParInput({ holePars: empty18(), index: 8, raw: '5' });
assert('CASE70 第9→第10跨 COURSE 区域', r70.focusedHoleIndex === 9 && r70.holePars[8] === 5);

var overwrite = parInputFocus.applyParInput({ holePars: seed68, index: 4, raw: '45' });
assert(
  '已有值追加输入取末位覆盖',
  parInputFocus.lastDigitRaw('45') === '5' && overwrite.holePars[4] === 5 && overwrite.focusedHoleIndex === 5
);

var normalJs = fs.readFileSync(
  path.join(mini, 'subpackages', 'create', 'pages', 'normal', 'index.js'),
  'utf8'
);
assert(
  'normal 不再写死 temporary A/B',
  /isTemporary[\s\S]*game\.front9Course = 'A'/.test(normalJs) === false &&
    normalJs.indexOf('temporaryCourse.normalizeCourseKey(this.data.front9Course)') >= 0
);

var aaSame = {
  courseSource: 'temporary',
  front9Course: 'A',
  back9Course: 'A',
  holePars: [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4]
};
assert(
  'CASE48 A+A 前后9洞相同 → valid',
  temporaryCourse.isValidTemporaryCourse(aaSame) === true &&
    temporaryCourse.hasConflictingDuplicateCourse(aaSame) === false
);

var aaDiffOne = aaSame.holePars.slice();
aaDiffOne[9] = 5;
var aaDiffRec = {
  courseSource: 'temporary',
  front9Course: 'A',
  back9Course: 'A',
  holePars: aaDiffOne
};
assert(
  'CASE49 A+A 仅一洞不同 → invalid',
  temporaryCourse.isValidTemporaryCourse(aaDiffRec) === false &&
    temporaryCourse.hasConflictingDuplicateCourse(aaDiffRec) === true &&
    gameEdit.validateSubmitForm(validForm(aaDiffRec)) ===
      temporaryCourse.DUPLICATE_COURSE_PAR_ERROR
);

var sameTotalDiffHoles = {
  courseSource: 'temporary',
  front9Course: 'A',
  back9Course: 'A',
  holePars: [3, 4, 5, 4, 4, 4, 4, 4, 4, 4, 3, 5, 4, 4, 4, 4, 4, 4]
};
assert(
  'CASE50 总 PAR 相同但逐洞不同 → invalid',
  temporaryCourse.front9ParTotal(sameTotalDiffHoles.holePars) ===
    temporaryCourse.back9ParTotal(sameTotalDiffHoles.holePars) &&
    temporaryCourse.isValidTemporaryCourse(sameTotalDiffHoles) === false &&
    temporaryCourse.hasConflictingDuplicateCourse(sameTotalDiffHoles) === true
);

assert(
  'CASE51 A+B 两组 PAR 不同仍 valid',
  temporaryCourse.isValidTemporaryCourse({
    courseSource: 'temporary',
    front9Course: 'A',
    back9Course: 'B',
    holePars: CUSTOM_PARS
  }) === true &&
    temporaryCourse.hasConflictingDuplicateCourse({
      courseSource: 'temporary',
      front9Course: 'A',
      back9Course: 'B',
      holePars: CUSTOM_PARS
    }) === false
);

var ccPar6 = [6, 4, 3, 5, 4, 4, 3, 5, 4, 6, 4, 3, 5, 4, 4, 3, 5, 4];
assert(
  'CASE52 C+C 相同且含 PAR6 → valid',
  temporaryCourse.isValidTemporaryCourse({
    courseSource: 'temporary',
    front9Course: 'C',
    back9Course: 'C',
    holePars: ccPar6
  }) === true
);

var ccPar6Shift = ccPar6.slice();
ccPar6Shift[0] = 4;
ccPar6Shift[9] = 6;
assert(
  'CASE53 C+C PAR6 所在洞不同 → invalid',
  temporaryCourse.isValidTemporaryCourse({
    courseSource: 'temporary',
    front9Course: 'C',
    back9Course: 'C',
    holePars: ccPar6Shift
  }) === false &&
    temporaryCourse.hasConflictingDuplicateCourse({
      courseSource: 'temporary',
      front9Course: 'C',
      back9Course: 'C',
      holePars: ccPar6Shift
    }) === true
);

assert(
  'CASE54 冲突时页面 error + confirm disabled',
  tempWxml.indexOf('duplicateCourseParError') >= 0 &&
    tempWxml.indexOf('相同 COURSE 的标准 PAR 必须一致') >= 0 &&
    tempJs.indexOf('duplicateCourseParError: temporaryCourse.hasConflictingDuplicateCourse') >= 0 &&
    tempJs.indexOf('canConfirm: temporaryCourse.isValidTemporaryCourse') >= 0
);

var recovered = {
  courseSource: 'temporary',
  front9Course: 'A',
  back9Course: 'B',
  holePars: aaDiffOne
};
assert(
  'CASE55 改为不同 COURSE 后冲突消失',
  temporaryCourse.hasConflictingDuplicateCourse(aaDiffRec) === true &&
    temporaryCourse.hasConflictingDuplicateCourse(recovered) === false &&
    temporaryCourse.isValidTemporaryCourse(recovered) === true
);

assert(
  '未填完后九不报 duplicate COURSE 冲突',
  temporaryCourse.hasConflictingDuplicateCourse({
    courseSource: 'temporary',
    front9Course: 'A',
    back9Course: 'A',
    holePars: [4, 4, 3, 5, 4, 4, 3, 5, 4, null, null, null, null, null, null, null, null, null]
  }) === false
);

console.log('\n---- temporaryCourse.normalCreate.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
