/**
 * 历史 Series 标题校验上下文（纯校验层）
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesTitleBaseline.selftest.js
 */

var path = require('path');

var utilsDir = path.join(__dirname, '..', 'miniprogram', 'utils');
var pageDir = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'create',
  'pages',
  'series'
);

var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));
var seriesValidators = require(path.join(utilsDir, 'seriesValidators.js'));
var seriesStoreMod = require(path.join(utilsDir, 'seriesStore.js'));
var basicInfoDraft = require(path.join(pageDir, 'basicInfoDraft.js'));

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

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function snapshot(v) {
  return JSON.stringify(v);
}

function createMemoryAdapter() {
  var bag = Object.create(null);
  return {
    getItem: function (key) {
      return {
        ok: true,
        value: Object.prototype.hasOwnProperty.call(bag, key) ? bag[key] : null
      };
    },
    setItem: function (key, value) {
      bag[key] = value;
      return { ok: true };
    }
  };
}

var NAME19 = Array(19).fill('名').join('');
var NAME19B = Array(19).fill('改').join('');
var NAME18 = Array(18).fill('新').join('');
var SUB13 = Array(13).fill('副').join('');
var SUB13B = Array(13).fill('换').join('');
var SUB12 = Array(12).fill('标').join('');

function makeReadySeries(over) {
  var s = seriesModel.createEmptySeriesDraft({
    hostMode: 'organization',
    templateId: 'inter_team_series',
    seriesName: '测',
    organization: {
      organizationId: 'org1',
      organizationName: '机构',
      organizationLogo: ''
    }
  });
  s.participants = [
    seriesModel.createParticipant({
      kind: 'team',
      sourceTeamId: 't1',
      seriesParticipantId: 'team:t1',
      nameSnapshot: '甲'
    }),
    seriesModel.createParticipant({
      kind: 'team',
      sourceTeamId: 't2',
      seriesParticipantId: 'team:t2',
      nameSnapshot: '乙'
    })
  ];
  s.visibility = 'public';
  s.accessCode = '';
  s.scoringRule = seriesModel.createDefaultScoringRule({
    mode: 'per_round_n',
    scoreBasis: 'gross',
    allowRepeat: false
  });
  s.rounds = s.rounds.map(function (r, idx) {
    var next = Object.assign({}, r);
    next.dateTime = '2030-09-0' + (idx + 1) + ' 08:00';
    next.gameMode = '个人比杆赛';
    next.courseId = 'c' + (idx + 1);
    next.courseName = '球场' + (idx + 1);
    next.fee = '';
    next.topN = 3;
    return next;
  });
  return Object.assign(s, over || {});
}

function ctx(name, sub) {
  return {
    titleBaseline: {
      seriesName: name,
      seriesSubtitle: sub
    }
  };
}

function pubHas(pub, code) {
  return (pub.errors || []).some(function (e) {
    return e.code === code;
  });
}

function assertUnchanged(label, beforeDraft, draft, beforeCtx, options) {
  assert(label + ' 输入对象未被修改', snapshot(draft) === beforeDraft);
  assert(label + ' baseline 未被修改', snapshot(options) === beforeCtx);
}

function runPair(label, series, options, expectOk, extra) {
  var beforeDraft = snapshot(series);
  var beforeCtx = snapshot(options == null ? null : options);
  var gate = basicInfoDraft.canEnterStep6(series, options);
  var pub = seriesValidators.validateForPublish(series, options);
  assert(label + ' canEnterStep6.ok=' + expectOk, gate.ok === expectOk, gate.code);
  assert(label + ' validateForPublish.ok=' + expectOk, pub.ok === expectOk, (pub.errors || []).map(function (e) {
    return e.code;
  }).join(','));
  assert(label + ' 两入口 ok 一致', gate.ok === pub.ok);
  if (options != null) {
    assertUnchanged(label, beforeDraft, series, beforeCtx, options);
  } else {
    assert(label + ' 无 context 时输入未被修改', snapshot(series) === beforeDraft);
  }
  if (typeof extra === 'function') extra(gate, pub);
}

runPair(
  '无 context 超长仍拒',
  makeReadySeries({ seriesName: NAME19, seriesSubtitle: SUB13 }),
  undefined,
  false,
  function (gate, pub) {
    assert('无 context 门闩码 series_name', gate.code === 'series_name');
    assert(
      '无 context 发布同时报名称与副标题超长',
      pubHas(pub, 'series_name_length') && pubHas(pub, 'series_subtitle_length')
    );
  }
);

runPair(
  'baseline 未改超长放行',
  makeReadySeries({ seriesName: NAME19, seriesSubtitle: SUB13 }),
  ctx(NAME19, SUB13),
  true
);

runPair(
  '只改名称到合法，历史超长副标题不拦',
  makeReadySeries({ seriesName: NAME18, seriesSubtitle: SUB13 }),
  ctx(NAME19, SUB13),
  true
);

runPair(
  '只改副标题到合法，历史超长名称不拦',
  makeReadySeries({ seriesName: NAME19, seriesSubtitle: SUB12 }),
  ctx(NAME19, SUB13),
  true
);

runPair(
  '名称改成另一条 19 字',
  makeReadySeries({ seriesName: NAME19B, seriesSubtitle: SUB13 }),
  ctx(NAME19, SUB13),
  false,
  function (gate, pub) {
    assert('改名称门闩码 series_name', gate.code === 'series_name');
    assert('改名称发布码 series_name_length', pubHas(pub, 'series_name_length'));
    assert('改名称不误伤副标题', !pubHas(pub, 'series_subtitle_length'));
  }
);

runPair(
  '副标题改成另一条 13 字',
  makeReadySeries({ seriesName: NAME19, seriesSubtitle: SUB13B }),
  ctx(NAME19, SUB13),
  false,
  function (gate, pub) {
    assert('改副标题门闩码 series_subtitle', gate.code === 'series_subtitle');
    assert('改副标题发布码 series_subtitle_length', pubHas(pub, 'series_subtitle_length'));
    assert('改副标题不误伤名称', !pubHas(pub, 'series_name_length') && !pubHas(pub, 'series_name_required'));
  }
);

runPair(
  '两字段 baseline 不得串用',
  makeReadySeries({ seriesName: NAME19, seriesSubtitle: SUB13 }),
  ctx(SUB13, NAME19),
  false,
  function (gate, pub) {
    assert(
      '串用后名称与副标题均按新上限拒绝',
      gate.ok === false &&
        pubHas(pub, 'series_name_length') &&
        pubHas(pub, 'series_subtitle_length')
    );
  }
);

(function () {
  var series = makeReadySeries({ seriesName: '', seriesSubtitle: '' });
  var options = ctx('', '');
  var beforeDraft = snapshot(series);
  var beforeCtx = snapshot(options);
  var gate = basicInfoDraft.canEnterStep6(series, options);
  var pub = seriesValidators.validateForPublish(series, options);
  assert('空名称即使 baseline 为空也拒绝 canEnterStep6', gate.ok === false && gate.code === 'series_name');
  assert(
    '空名称即使 baseline 为空也拒绝 validateForPublish',
    pub.ok === false && pubHas(pub, 'series_name_required')
  );
  assert('空名称两入口均失败', gate.ok === false && pub.ok === false);
  assertUnchanged('空名称', beforeDraft, series, beforeCtx, options);
})();

(function () {
  var series = makeReadySeries({ seriesName: NAME19, seriesSubtitle: SUB13 });
  var gate = basicInfoDraft.canEnterStep6(series, series);
  var pub = seriesValidators.validateForPublish(series, series);
  assert(
    '整个 draft 不能当 options：无 titleBaseline 则严格拒绝',
    gate.ok === false && pub.ok === false
  );
})();

(function () {
  var historic = makeReadySeries({ seriesName: NAME19, seriesSubtitle: SUB13 });
  var structure = seriesValidators.validateDraftStructure(historic);
  assert(
    'validateDraftStructure 不因 18/12 拒绝历史超长',
    structure.ok === true,
    (structure.errors || []).map(function (e) {
      return e.code;
    }).join(',')
  );
  var store = seriesStoreMod.createSeriesStore(createMemoryAdapter());
  var saved = store.saveDraft(historic);
  assert('saveDraft 仍接受历史超长草稿', saved.ok === true, saved.reason);
  var got = store.getSeriesById(historic.seriesId);
  assert(
    'saveDraft 不截断历史标题',
    !!got && got.seriesName === NAME19 && got.seriesSubtitle === SUB13
  );
})();

console.log('');
console.log('seriesTitleBaseline.selftest: ' + passed + ' passed, ' + failed + ' failed');
if (failed) {
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
