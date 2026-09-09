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
  ) === '请完成18洞标准杆（每洞3/4/5）'
);

var withPar2 = CUSTOM_PARS.slice();
withPar2[0] = 2;
var withPar6 = CUSTOM_PARS.slice();
withPar6[17] = 6;
assert(
  'CASE6 temporary 含 par2/par6 创建失败',
  gameEdit.validateSubmitForm(validForm({ courseSource: 'temporary', holePars: withPar2 })) ===
    '请完成18洞标准杆（每洞3/4/5）' &&
    gameEdit.validateSubmitForm(validForm({ courseSource: 'temporary', holePars: withPar6 })) ===
      '请完成18洞标准杆（每洞3/4/5）'
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

console.log('\n---- temporaryCourse.normalCreate.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
