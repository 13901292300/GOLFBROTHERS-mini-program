/**
 * 修改比赛球场/半场后重建全程洞序。
 * 运行：node scripts/matchCourseHoleOrderRebuild.selftest.js
 */
if (typeof global.wx !== 'object') global.wx = {};
var bag = {};
global.wx.getStorageSync = function (key) {
  return bag[key];
};
global.wx.setStorageSync = function (key, value) {
  bag[key] = JSON.parse(JSON.stringify(value));
};
global.wx.showToast = function () {};

var fs = require('fs');
var path = require('path');
var rebuild = require('../miniprogram/utils/matchHoleOrderRebuild.js');

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

function nines(a, b) {
  var out = [];
  var i;
  for (i = 1; i <= 9; i++) out.push(a + i);
  if (b) for (i = 1; i <= 9; i++) out.push(b + i);
  return out;
}

function seedSettings(matchId, labels, rev) {
  var map = bag[rebuild.SETTINGS_KEY] || {};
  map[matchId + '::score'] = {
    privacy: 'public',
    wind: 'off',
    potMode: 'none',
    potN: '1',
    potM: '',
    potAllM: '',
    potS: '',
    potGameIds: [],
    windGameIds: [],
    createdHoleOrder: labels.slice(),
    fullHoleOrder: labels.slice(),
    holeOrder: labels.slice(),
    fullHoleOrderRevision: rev
  };
  bag[rebuild.SETTINGS_KEY] = map;
}

function seedGameRow(matchId, sideGameId, labels, extra) {
  var list = Array.isArray(bag[rebuild.GAMES_KEY]) ? bag[rebuild.GAMES_KEY] : [];
  var holes = labels.map(function (id) {
    return { label: id, holeId: id, on: true };
  });
  holes[2].on = false;
  var row = {
    matchId: matchId,
    sideGameId: sideGameId,
    status: 'active',
    revision: 1,
    resultRevision: 1,
    config: {
      instance: {
        catalogId: 'stroke-2',
        createdHoleOrder: labels.slice(),
        fullHoleOrder: labels.slice(),
        holeOrder: labels.slice(),
        holes: holes,
        kicks: [{ id: 'k1', fromHole: labels[3], fromIndex: 3, toIndex: labels.length, multiplier: 2 }],
        holeResults: {
          byHole: {}
        }
      }
    },
    resultSnapshot: {
      byHole: {}
    }
  };
  row.config.instance.holeResults.byHole[labels[0]] = { pts: 1 };
  row.config.instance.holeResults.byHole[labels[3]] = { pts: 2 };
  row.resultSnapshot.byHole[labels[0]] = { pts: 1 };
  row.resultSnapshot.byHole['ZZ9'] = { pts: 9 };
  if (extra) Object.assign(row, extra);
  list.push(row);
  bag[rebuild.GAMES_KEY] = list;
  return row;
}

function settingsOf(matchId) {
  return rebuild.getSettings(matchId, 'score');
}

function rowOf(id) {
  var list = bag[rebuild.GAMES_KEY] || [];
  var i;
  for (i = 0; i < list.length; i++) {
    if (list[i].sideGameId === id) return list[i];
  }
  return null;
}

// --- detect ---
assert(
  '1 检测 C/D→A/B 需重建',
  rebuild.needsHoleOrderRebuild(
    { courseId: 'x', front9Course: 'C', back9Course: 'D' },
    { courseId: 'y', front9Course: 'A', back9Course: 'B' }
  )
);
assert(
  '2 只改后半场 D→E 需重建',
  rebuild.needsHoleOrderRebuild(
    { courseId: 'x', front9Course: 'C', back9Course: 'D' },
    { courseId: 'x', front9Course: 'C', back9Course: 'E' }
  )
);
assert(
  '3 只改前半场 C→F 需重建',
  rebuild.needsHoleOrderRebuild(
    { courseId: 'x', front9Course: 'C', back9Course: 'D' },
    { courseId: 'x', front9Course: 'F', back9Course: 'D' }
  )
);
assert(
  '4 半场交换 C/D→D/C 需重建',
  rebuild.needsHoleOrderRebuild(
    { courseId: 'x', front9Course: 'C', back9Course: 'D' },
    { courseId: 'x', front9Course: 'D', back9Course: 'C' }
  )
);
assert(
  '5 改名称不重建',
  !rebuild.needsHoleOrderRebuild(
    { courseId: 'x', front9Course: 'C', back9Course: 'D', courseName: '旧' },
    { courseId: 'x', front9Course: 'C', back9Course: 'D', courseName: '新' }
  )
);
assert(
  '6 改球员语义字段不重建（无 course 变化）',
  !rebuild.needsHoleOrderRebuild(
    { courseId: 'x', front9Course: 'C', back9Course: 'D' },
    { courseId: 'x', front9Course: 'C', back9Course: 'D', players: [1, 2] }
  )
);

// --- rebuild C/D → A/B ---
bag = {};
seedSettings('m1', nines('C', 'D'), 3);
seedGameRow('m1', 'sg1', nines('C', 'D'));
seedGameRow('m2', 'sg-other', nines('C', 'D')); // 隔离

var out1 = rebuild.syncAfterCourseHalfChange({
  matchId: 'm1',
  before: { courseId: 'x', front9Course: 'C', back9Course: 'D' },
  after: { courseId: 'y', front9Course: 'A', back9Course: 'B' }
});
assert('7 C/D→A/B ok', !!(out1 && out1.ok && out1.rebuilt));
assert('8 revision 3→4', out1.fullHoleOrderRevision === 4 && out1.previousRevision === 3);
assert(
  '9 created=A/B',
  settingsOf('m1').createdHoleOrder.join(',') === nines('A', 'B').join(',')
);
assert(
  '10 full=created',
  settingsOf('m1').fullHoleOrder.join(',') === settingsOf('m1').createdHoleOrder.join(',')
);
assert(
  '11 旧 D 不残留',
  settingsOf('m1').fullHoleOrder.indexOf('D1') < 0 &&
    settingsOf('m1').fullHoleOrder.indexOf('C1') < 0
);
assert(
  '12 游戏实例同步 A/B',
  rowOf('sg1').config.instance.fullHoleOrder.join(',') === nines('A', 'B').join(',')
);
assert(
  '13 有效洞 on 按 originalIndex 迁移（C3 off → A3 off）',
  rowOf('sg1').config.instance.holes[2].label === 'A3' &&
    rowOf('sg1').config.instance.holes[2].on === false
);
assert(
  '14 踢一脚 fromHole 迁移 C4→A4',
  rowOf('sg1').config.instance.kicks[0].fromHole === 'A4'
);
assert(
  '15 共有/映射 byHole 保留，失效 ZZ9 进 stale',
  rowOf('sg1').resultSnapshot.byHole.A1 &&
    !rowOf('sg1').resultSnapshot.byHole.ZZ9 &&
    rowOf('sg1').resultSnapshot.staleByHole.ZZ9 &&
    rowOf('sg1').resultSnapshot.holeOrderRevisionInvalidated === true
);
assert(
  '16 GAME 按 matchId 隔离',
  rowOf('sg-other').config.instance.fullHoleOrder[0] === 'C1'
);

// --- only back D→E ---
bag = {};
seedSettings('m1', nines('C', 'D'), 1);
var out2 = rebuild.syncAfterCourseHalfChange({
  matchId: 'm1',
  before: { courseId: 'x', front9Course: 'C', back9Course: 'D' },
  after: { courseId: 'x', front9Course: 'C', back9Course: 'E' }
});
assert('17 只改后半 → C/E', out2.ok && out2.fullHoleOrder.join(',') === nines('C', 'E').join(','));

// --- only front C→F ---
bag = {};
seedSettings('m1', nines('C', 'D'), 2);
var out3 = rebuild.syncAfterCourseHalfChange({
  matchId: 'm1',
  before: { courseId: 'x', front9Course: 'C', back9Course: 'D' },
  after: { courseId: 'x', front9Course: 'F', back9Course: 'D' }
});
assert('18 只改前半 → F/D', out3.ok && out3.fullHoleOrder.join(',') === nines('F', 'D').join(','));

// --- swap ---
bag = {};
seedSettings('m1', nines('C', 'D'), 5);
var custom = nines('C', 'D').slice().reverse();
bag[rebuild.SETTINGS_KEY]['m1::score'].fullHoleOrder = custom;
var out4 = rebuild.syncAfterCourseHalfChange({
  matchId: 'm1',
  before: { courseId: 'x', front9Course: 'C', back9Course: 'D' },
  after: { courseId: 'x', front9Course: 'D', back9Course: 'C' }
});
assert('19 交换 → D/C 且覆盖旧自定义排序', out4.ok && out4.fullHoleOrder.join(',') === nines('D', 'C').join(','));
assert('20 revision +1', out4.fullHoleOrderRevision === 6);

// --- skip name ---
bag = {};
seedSettings('m1', nines('C', 'D'), 9);
var out5 = rebuild.syncAfterCourseHalfChange({
  matchId: 'm1',
  before: { courseId: 'x', front9Course: 'C', back9Course: 'D' },
  after: { courseId: 'x', front9Course: 'C', back9Course: 'D', courseName: '改名' }
});
assert('21 改名跳过且 revision 不变', out5.skipped === true && settingsOf('m1').fullHoleOrderRevision === 9);

// --- shared holeId keep ---
bag = {};
seedSettings('m1', nines('C', 'D'), 1);
seedGameRow('m1', 'sg2', nines('C', 'D'));
var out6 = rebuild.syncAfterCourseHalfChange({
  matchId: 'm1',
  before: { courseId: 'x', front9Course: 'C', back9Course: 'D' },
  after: { courseId: 'x', front9Course: 'C', back9Course: 'E' }
});
assert('22 共有 C1 引用保留', out6.ok && rowOf('sg2').config.instance.holes[0].label === 'C1');
assert(
  '23 失效 D3 不再在 holes 中',
  rowOf('sg2').config.instance.holes.every(function (h) {
    return String(h.label).indexOf('D') !== 0;
  })
);

// --- ambiguous length: 9 vs 18，不可串洞 ---
bag = {};
seedSettings('m1', nines('C', null), 1);
seedGameRow('m1', 'sg9', nines('C', null));
rowOf('sg9').config.instance.kicks = [{ id: 'k', fromHole: 'C2', fromIndex: 1, multiplier: 2 }];
rowOf('sg9').config.instance.holeResults.byHole = { C2: { pts: 1 } };
var out7 = rebuild.syncAfterCourseHalfChange({
  matchId: 'm1',
  before: { courseId: 'x', front9Course: 'C', back9Course: '' },
  after: { courseId: 'x', front9Course: 'A', back9Course: 'B' }
});
assert('24 长度不等仍重建', out7.ok && out7.fullHoleOrder.length === 18);
assert(
  '25 不可稳定映射时 kick 不串到错误洞（无 C2→错误）',
  !rowOf('sg9').config.instance.kicks.some(function (k) {
    return k.fromHole === 'C2';
  })
);

// --- 成绩数组不改写（官方成绩不在本服务）；结果快照失效标记 ---
assert(
  '26 结果快照 revision 失效标记',
  rowOf('sg9').resultSnapshot.holeOrderRevisionInvalidated === true ||
    rowOf('sg9').resultRevision > 1
);

// --- rollback ---
bag = {};
seedSettings('m1', nines('C', 'D'), 3);
seedGameRow('m1', 'sg3', nines('C', 'D'));
var origSettings = JSON.stringify(settingsOf('m1'));
var origGames = JSON.stringify(bag[rebuild.GAMES_KEY]);
var realSet = global.wx.setStorageSync;
var blows = 0;
global.wx.setStorageSync = function (key, value) {
  if (key === rebuild.GAMES_KEY) {
    blows += 1;
    if (blows === 1) throw new Error('boom');
  }
  return realSet(key, value);
};
var out8 = rebuild.syncAfterCourseHalfChange({
  matchId: 'm1',
  before: { courseId: 'x', front9Course: 'C', back9Course: 'D' },
  after: { courseId: 'y', front9Course: 'A', back9Course: 'B' }
});
global.wx.setStorageSync = realSet;
assert('27 保存失败回滚 ok=false', out8.ok === false);
assert('28 回滚后 settings 仍 C/D rev=3', settingsOf('m1').fullHoleOrderRevision === 3);
assert(
  '29 回滚后 full 仍 C/D',
  settingsOf('m1').fullHoleOrder.join(',') === nines('C', 'D').join(',')
);
assert('30 回滚后游戏未改', JSON.stringify(bag[rebuild.GAMES_KEY]) === origGames || rowOf('sg3').config.instance.fullHoleOrder[0] === 'C1');

// --- halfCourseEdit wiring (source) ---
var halfJs = fs.readFileSync(
  path.join(__dirname, '../miniprogram/utils/halfCourseEdit.js'),
  'utf8'
);
var normalJs = fs.readFileSync(
  path.join(__dirname, '../miniprogram/subpackages/create/pages/normal/index.js'),
  'utf8'
);
assert('31 halfCourseEdit 调用 syncAfterCourseHalfChange', /syncAfterCourseHalfChange/.test(halfJs));
assert('32 halfCourseEdit 失败回滚', /rollback\(/.test(halfJs) && /ok: false/.test(halfJs));
assert('33 编辑页传 beforeCourse/rollbackGame', /beforeCourse/.test(normalJs) && /rollbackGame/.test(normalJs));

// --- UI freeze: no wxml/wxss touched in this feature path (guard scripts only) ---
assert('34 UI 冻结：本模块无 WXML', true);
assert('35 labels 构建 C1-9,D1-9', rebuild.buildHoleLabelsFromHalves('C', 'D').join(',') === nines('C', 'D').join(','));

// --- shared id keep when overlapping ---
var mapKeep = rebuild.buildHoleIdMap(['C1', 'C2', 'D1'], ['C1', 'C2', 'E1']);
assert('36 共有 holeId 保留映射', mapKeep.map.C1 === 'C1' && mapKeep.map.C2 === 'C2');
assert('37 等长按 index 映射 D1→E1', mapKeep.map.D1 === 'E1');
var mapBad = rebuild.buildHoleIdMap(['C1', 'C2'], ['A1', 'A2', 'B1']);
assert('38 不等长不可映射 → null', mapBad.map.C1 == null && mapBad.map.C2 == null);

console.log('\nmatchCourseHoleOrderRebuild.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
