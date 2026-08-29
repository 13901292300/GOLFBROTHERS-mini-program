/**
 * Series 创建向导：标题会话快照接到 Step5→Step6
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesCreateTitleBaseline.selftest.js
 */

var path = require('path');
var fs = require('fs');

var pageDir = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'create',
  'pages',
  'series'
);
var utilsDir = path.join(__dirname, '..', 'miniprogram', 'utils');
var seriesModel = require(path.join(utilsDir, 'seriesModel.js'));
var roundDraft = require(path.join(pageDir, 'roundDraft.js'));

if (typeof global.getApp !== 'function') {
  global.getApp = function () {
    return {
      getTheme: function () {
        return 'bright';
      }
    };
  };
}

var capturedPage = null;
global.Page = function (def) {
  capturedPage = def;
  return def;
};

var toasts = [];
global.wx = {
  getStorageSync: function () {
    return null;
  },
  setStorageSync: function () {},
  showToast: function (opt) {
    toasts.push(opt && opt.title);
  },
  showModal: function () {},
  getWindowInfo: function () {
    return { windowWidth: 375, windowHeight: 667 };
  },
  getSystemInfoSync: function () {
    return { windowWidth: 375, windowHeight: 667 };
  }
};

require(path.join(pageDir, 'index.js'));

var pageJs = fs.readFileSync(path.join(pageDir, 'index.js'), 'utf8');

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

var NAME19 = Array(19).fill('名').join('');
var NAME19B = Array(19).fill('改').join('');
var NAME18 = Array(18).fill('新').join('');
var SUB13 = Array(13).fill('副').join('');
var SUB13B = Array(13).fill('换').join('');
var SUB12 = Array(12).fill('标').join('');

function makeReadyDraft(over) {
  var d = seriesModel.createEmptySeriesDraft({});
  d.hostMode = 'organization';
  d.templateId = 'inter_team_series';
  d.organization = {
    organizationId: 'org1',
    organizationName: '机构',
    organizationLogo: ''
  };
  d.participants = [
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
  d.seriesName = '测试系列赛';
  d.seriesSubtitle = '';
  d.visibility = 'public';
  d.accessCode = '';
  d.rounds = roundDraft.resizeRounds([], 2).rounds;
  return Object.assign(d, over || {});
}

function sliceStep5Primary() {
  var actionStart = pageJs.indexOf('onPrimaryAction()');
  var start = pageJs.indexOf('if (step === 5) {', actionStart);
  var end = pageJs.indexOf('if (step === 6) {', start);
  return actionStart >= 0 && start > actionStart && end > start
    ? pageJs.slice(start, end)
    : '';
}

var step5Slice = sliceStep5Primary();
assert('Page() 已捕获', !!capturedPage && typeof capturedPage.onPrimaryAction === 'function');
assert(
  'Step5 仍先名称后副标题再门闩',
  (function () {
    var nameIdx = step5Slice.indexOf('_commitSeriesNameInput()');
    var subIdx = step5Slice.indexOf('_commitSeriesSubtitleInput()');
    var gateIdx = step5Slice.indexOf('canEnterStep6(draft, {');
    return nameIdx >= 0 && subIdx > nameIdx && gateIdx > subIdx;
  })()
);
assert(
  '门闩传入 titleBaseline 会话快照',
  step5Slice.indexOf('titleBaseline: this._seriesTitleBaseline') >= 0
);
assert(
  'onShow 不重置 _seriesTitleBaseline',
  (function () {
    var showStart = pageJs.indexOf('onShow()');
    var showEnd = pageJs.indexOf('onUnload()', showStart);
    var showSlice =
      showStart >= 0 && showEnd > showStart ? pageJs.slice(showStart, showEnd) : '';
    return showSlice.indexOf('_seriesTitleBaseline') < 0;
  })()
);

function lastStep6(page) {
  var list = page._projected || [];
  for (var i = list.length - 1; i >= 0; i--) {
    if (list[i].step === 6) return list[i];
  }
  return null;
}

function makePage(opts) {
  var o = opts || {};
  toasts = [];
  var page = Object.assign({}, capturedPage);
  var draft = o.draft ? clone(o.draft) : makeReadyDraft();
  page.data = {
    currentStep: 5,
    draftInitError: false,
    seriesNameInput: draft.seriesName,
    seriesSubtitleInput: draft.seriesSubtitle
  };
  page._pageAlive = true;
  page._isSaving = false;
  page._isRoundCountConfirming = false;
  page._editRoundMode = false;
  page._editSeriesMode = false;
  page._ensuringStep5Defaults = true;
  page.lastSavedDraft = draft;
  page._seriesTitleBaseline = o.baseline
    ? {
        seriesName: o.baseline.seriesName,
        seriesSubtitle: o.baseline.seriesSubtitle
      }
    : null;
  page._focusedSeriesName = !!o.editingName;
  page._dirtySeriesName = !!o.editingName;
  page._editingSeriesNameInput =
    o.nameBuffer != null ? o.nameBuffer : draft.seriesName;
  page._focusedSeriesSubtitle = !!o.editingSubtitle;
  page._dirtySeriesSubtitle = !!o.editingSubtitle;
  page._editingSeriesSubtitleInput =
    o.subtitleBuffer != null ? o.subtitleBuffer : draft.seriesSubtitle;
  page._focusedGlobalM = false;
  page._dirtyGlobalM = false;
  page._editingGlobalMInput = null;
  page._projected = [];
  page._persistCalls = [];
  page._persistNextDraft = function (mutator) {
    var next = clone(this.lastSavedDraft);
    mutator(next);
    this.lastSavedDraft = next;
    this._persistCalls.push({
      seriesName: next.seriesName,
      seriesSubtitle: next.seriesSubtitle
    });
    return true;
  };
  page._projectUiFromDraft = function (d, step) {
    var payload = {
      currentStep: step,
      seriesNameInput: d && d.seriesName,
      seriesSubtitleInput: d && d.seriesSubtitle
    };
    this._projected.push({
      step: step,
      seriesName: d && d.seriesName,
      seriesSubtitle: d && d.seriesSubtitle
    });
    return payload;
  };
  page._uiPayloadFromDraft = page._projectUiFromDraft;
  page._safeSetData = function (payload) {
    this.data = Object.assign({}, this.data, payload || {});
  };
  page._clearNumberEditBuffers = function () {};
  page._syncCreatePublishButtonMode = function () {};
  return page;
}

function historicDraft() {
  return makeReadyDraft({ seriesName: NAME19, seriesSubtitle: SUB13 });
}

function historicBaseline() {
  return { seriesName: NAME19, seriesSubtitle: SUB13 };
}

(function () {
  var page = makePage({
    draft: historicDraft(),
    baseline: historicBaseline()
  });
  page.onPrimaryAction();
  assert(
    '历史 19+13 未改可从 Step5 进 Step6',
    !!lastStep6(page) && page.data.currentStep === 6
  );
})();

(function () {
  var page = makePage({
    draft: historicDraft(),
    baseline: historicBaseline(),
    editingName: true,
    nameBuffer: NAME18
  });
  page.onPrimaryAction();
  var step6 = lastStep6(page);
  assert(
    '只改名称为合法值，旧副标题 13 仍可进',
    !!step6 &&
      step6.seriesName === NAME18 &&
      step6.seriesSubtitle === SUB13 &&
      page.lastSavedDraft.seriesSubtitle === SUB13
  );
})();

(function () {
  var page = makePage({
    draft: historicDraft(),
    baseline: historicBaseline(),
    editingSubtitle: true,
    subtitleBuffer: SUB12
  });
  page.onPrimaryAction();
  var step6 = lastStep6(page);
  assert(
    '只改副标题为合法值，旧名称 19 仍可进',
    !!step6 &&
      step6.seriesSubtitle === SUB12 &&
      step6.seriesName === NAME19 &&
      page.lastSavedDraft.seriesName === NAME19
  );
})();

(function () {
  var page = makePage({
    draft: historicDraft(),
    baseline: historicBaseline(),
    editingName: true,
    nameBuffer: NAME19B
  });
  page.onPrimaryAction();
  assert(
    '改成新的超长名称仍拒绝',
    !lastStep6(page) && page.data.currentStep === 5
  );
})();

(function () {
  var page = makePage({
    draft: historicDraft(),
    baseline: historicBaseline(),
    editingSubtitle: true,
    subtitleBuffer: SUB13B
  });
  page.onPrimaryAction();
  assert(
    '改成新的超长副标题仍拒绝',
    !lastStep6(page) && page.data.currentStep === 5
  );
})();

(function () {
  var page = makePage({
    draft: historicDraft(),
    baseline: { seriesName: SUB13, seriesSubtitle: NAME19 }
  });
  page.onPrimaryAction();
  assert('名称与副标题 baseline 不串用', !lastStep6(page) && page.data.currentStep === 5);
})();

(function () {
  var page = makePage({
    draft: historicDraft(),
    baseline: null
  });
  page._captureSeriesTitleBaselineOnce(page.lastSavedDraft);
  var first = clone(page._seriesTitleBaseline);
  page.lastSavedDraft.seriesName = NAME18;
  page.lastSavedDraft.seriesSubtitle = SUB12;
  page._commitSavedDraft(
    Object.assign(clone(page.lastSavedDraft), {
      seriesName: NAME18,
      seriesSubtitle: SUB12
    }),
    5
  );
  assert(
    '成功 saveDraft/_commitSavedDraft 后 baseline 不变',
    page._seriesTitleBaseline.seriesName === first.seriesName &&
      page._seriesTitleBaseline.seriesSubtitle === first.seriesSubtitle &&
      first.seriesName === NAME19 &&
      first.seriesSubtitle === SUB13
  );
  assert(
    'baseline 不进入 data',
    page.data._seriesTitleBaseline == null && page.data.titleBaseline == null
  );
  assert(
    'baseline 不写入 Series',
    page.lastSavedDraft.titleBaseline == null &&
      page.lastSavedDraft._seriesTitleBaseline == null
  );
})();

(function () {
  var page = makePage({
    draft: historicDraft(),
    baseline: historicBaseline()
  });
  var before = clone(page._seriesTitleBaseline);
  page.onShow();
  assert(
    'onShow 后 baseline 不变',
    page._seriesTitleBaseline.seriesName === before.seriesName &&
      page._seriesTitleBaseline.seriesSubtitle === before.seriesSubtitle
  );
})();

(function () {
  var page = makePage({
    draft: makeReadyDraft({ seriesName: '', seriesSubtitle: '' }),
    baseline: { seriesName: '', seriesSubtitle: '' }
  });
  page.onPrimaryAction();
  assert('新草稿空名称仍拒', !lastStep6(page) && page.data.currentStep === 5);
})();

(function () {
  var page = makePage({
    draft: makeReadyDraft({ seriesName: NAME19, seriesSubtitle: '' }),
    baseline: { seriesName: '', seriesSubtitle: '' }
  });
  page.onPrimaryAction();
  assert(
    '新草稿会话内新超长仍拒，不拿当前 draft 当 baseline',
    !lastStep6(page) && page.data.currentStep === 5
  );
})();

(function () {
  var page = makePage({
    draft: historicDraft(),
    baseline: null
  });
  page._captureSeriesTitleBaselineOnce(page.lastSavedDraft);
  var session = clone(page._seriesTitleBaseline);
  page.onUnload();
  page._pageAlive = true;
  page._seriesTitleBaseline = null;
  page.lastSavedDraft = makeReadyDraft({
    seriesName: NAME18,
    seriesSubtitle: SUB12
  });
  page._captureSeriesTitleBaselineOnce(page.lastSavedDraft);
  assert(
    'onUnload 后重新进入可按当时稿建立新会话 baseline',
    session.seriesName === NAME19 &&
      page._seriesTitleBaseline.seriesName === NAME18 &&
      page._seriesTitleBaseline.seriesSubtitle === SUB12
  );
})();

assert(
  'onLoad 将会话 baseline 置空',
  pageJs.indexOf('this._seriesTitleBaseline = null;') >= 0
);
assert(
  '捕获只读 name/subtitle 两字段',
  pageJs.indexOf('_captureSeriesTitleBaselineOnce') >= 0 &&
    /_seriesTitleBaseline = \{[\s\S]*seriesName:[\s\S]*seriesSubtitle:/.test(pageJs)
);

console.log('');
console.log('seriesCreateTitleBaseline.selftest: ' + passed + ' passed, ' + failed + ' failed');
if (failed) {
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
