/**
 * Series 创建 Step5：下一步前提交副标题编辑缓冲
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/seriesStep5SubtitleCommit.selftest.js
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
  'Step5 先提交名称再提交副标题再门闩',
  (function () {
    var nameIdx = step5Slice.indexOf('_commitSeriesNameInput()');
    var subIdx = step5Slice.indexOf('_commitSeriesSubtitleInput()');
    var gateIdx = step5Slice.indexOf('canEnterStep6(draft)');
    return nameIdx >= 0 && subIdx > nameIdx && gateIdx > subIdx;
  })()
);
assert(
  '名称失败立即 return，副标题失败立即 return',
  step5Slice.indexOf('if (!this._commitSeriesNameInput()) return;') >= 0 &&
    step5Slice.indexOf('if (!this._commitSeriesSubtitleInput()) return;') >= 0
);

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
  page._isSaving = false;
  page._isRoundCountConfirming = false;
  page._editRoundMode = false;
  page._editSeriesMode = false;
  page.lastSavedDraft = draft;
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
  page._safeSetData = function (payload) {
    this.data = Object.assign({}, this.data, payload || {});
  };
  page._clearNumberEditBuffers = function () {};
  page._syncCreatePublishButtonMode = function () {};
  if (typeof o.wrapName === 'function') {
    page._commitSeriesNameInput = o.wrapName(page._commitSeriesNameInput.bind(page));
  }
  if (typeof o.wrapSubtitle === 'function') {
    page._commitSeriesSubtitleInput = o.wrapSubtitle(
      page._commitSeriesSubtitleInput.bind(page)
    );
  }
  return page;
}

function lastStep6(page) {
  var list = page._projected || [];
  for (var i = list.length - 1; i >= 0; i--) {
    if (list[i].step === 6) return list[i];
  }
  return null;
}

(function () {
  var nameCalls = 0;
  var subCalls = 0;
  var page = makePage({
    editingSubtitle: true,
    subtitleBuffer: '春季对决',
    wrapName: function (orig) {
      return function () {
        nameCalls += 1;
        return orig.apply(this, arguments);
      };
    },
    wrapSubtitle: function (orig) {
      return function () {
        subCalls += 1;
        return orig.apply(this, arguments);
      };
    }
  });
  page.onPrimaryAction();
  var step6 = lastStep6(page);
  assert('未 blur 点下一步会执行 _commitSeriesSubtitleInput', subCalls === 1);
  assert('未编辑名称时不提交名称', nameCalls === 0);
  assert(
    '保存后的新副标题进入 Step6',
    !!step6 &&
      step6.seriesSubtitle === '春季对决' &&
      page.lastSavedDraft.seriesSubtitle === '春季对决' &&
      page.data.currentStep === 6
  );
  assert(
    '门闩读到提交后的 draft',
    page._persistCalls.length === 1 &&
      page._persistCalls[0].seriesSubtitle === '春季对决'
  );
})();

(function () {
  var subCalls = 0;
  var page = makePage({
    editingSubtitle: true,
    subtitleBuffer: Array(13).fill('副').join(''),
    wrapSubtitle: function (orig) {
      return function () {
        subCalls += 1;
        return orig.apply(this, arguments);
      };
    }
  });
  page.onPrimaryAction();
  assert('副标题提交失败仍会执行 _commitSeriesSubtitleInput', subCalls === 1);
  assert(
    '副标题提交失败不进入 Step6',
    !lastStep6(page) &&
      page.data.currentStep === 5 &&
      page.lastSavedDraft.seriesSubtitle === '' &&
      page._persistCalls.length === 0
  );
})();

(function () {
  var subCalls = 0;
  var page = makePage({
    editingName: true,
    nameBuffer: Array(19).fill('名').join(''),
    editingSubtitle: true,
    subtitleBuffer: '春季对决',
    wrapSubtitle: function (orig) {
      return function () {
        subCalls += 1;
        return orig.apply(this, arguments);
      };
    }
  });
  page.onPrimaryAction();
  assert('名称提交失败不继续提交副标题', subCalls === 0);
  assert(
    '名称提交失败不进入 Step6',
    !lastStep6(page) && page.data.currentStep === 5 && page._persistCalls.length === 0
  );
})();

(function () {
  var nameCalls = 0;
  var page = makePage({
    editingName: true,
    nameBuffer: '  新系列名称  ',
    wrapName: function (orig) {
      return function () {
        nameCalls += 1;
        return orig.apply(this, arguments);
      };
    }
  });
  page.onPrimaryAction();
  var step6 = lastStep6(page);
  assert('未编辑副标题时仍提交名称', nameCalls === 1);
  assert(
    '名称提交后进入 Step6 且门闩不回归',
    !!step6 &&
      step6.seriesName === '新系列名称' &&
      page.lastSavedDraft.seriesName === '新系列名称' &&
      page.data.currentStep === 6
  );
})();

(function () {
  var nameCalls = 0;
  var subCalls = 0;
  var page = makePage({
    wrapName: function (orig) {
      return function () {
        nameCalls += 1;
        return orig.apply(this, arguments);
      };
    },
    wrapSubtitle: function (orig) {
      return function () {
        subCalls += 1;
        return orig.apply(this, arguments);
      };
    }
  });
  page.onPrimaryAction();
  assert('无编辑缓冲不调用名称/副标题提交', nameCalls === 0 && subCalls === 0);
  assert('无缓冲时 Step6 门闩仍可通过', !!lastStep6(page) && page.data.currentStep === 6);
})();

console.log('');
console.log('seriesStep5SubtitleCommit.selftest: ' + passed + ' passed, ' + failed + ' failed');
if (failed) {
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
