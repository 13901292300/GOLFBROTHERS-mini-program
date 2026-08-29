/**
 * 记分页 game-single 窗口宽读取与 T sticky 阈值契约。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/gameSingleTeeStickyWindow.selftest.js
 */

var fs = require('fs');
var path = require('path');

var scoreJsPath = path.join(
  __dirname,
  '..',
  'miniprogram',
  'subpackages',
  'scoring',
  'pages',
  'score',
  'index.js'
);
var src = fs.readFileSync(scoreJsPath, 'utf8');
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

function extractMethod(name) {
  var re = new RegExp('\\n  ' + name.replace(/\$/g, '\\$') + '\\(\\) \\{');
  var match = re.exec(src);
  if (!match) return '';
  var start = match.index + 1;
  var braceAt = src.indexOf('{', start);
  var depth = 0;
  for (var i = braceAt; i < src.length; i++) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return '';
}

function extractSyncSticky() {
  var needle = '\n  _syncGameSingleTeeSticky(scrollLeft) {';
  var start = src.indexOf(needle);
  if (start < 0) return '';
  start += 1;
  var braceAt = src.indexOf('{', start);
  var depth = 0;
  for (var i = braceAt; i < src.length; i++) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return '';
}

var widthSrc = extractMethod('_getGameSingleWindowWidth');
var thresholdSrc = extractMethod('_getGameSingleTeeStickyThresholdPx');
var shellSrc = extractMethod('_isGameSingleShell');
var stickySrc = extractSyncSticky();

assert('生产方法源码可提取', !!(widthSrc && thresholdSrc && shellSrc && stickySrc));
assert(
  '阈值公式仍为 (96 * windowWidth) / 750',
  thresholdSrc.indexOf('(96 * this._getGameSingleWindowWidth()) / 750') >= 0
);
assert(
  'sticky 边界仍为 left + 0.5 >= threshold',
  stickySrc.indexOf('left + 0.5 >= this._getGameSingleTeeStickyThresholdPx()') >= 0
);

function compileMethod(text) {
  var fnSrc = text.replace(/^\s*(_\w+)\(/, 'function $1(');
  return new Function('return (' + fnSrc + ')')();
}

function makeHost(data) {
  var setDataCalls = [];
  var host = {
    data: Object.assign(
      { useStrokeScoreShell: true, isTeeStickyVisible: false },
      data || {}
    ),
    _gameSingleWindowWidthCache: null,
    _teeStickyThresholdPxCache: null,
    setData: function (patch) {
      setDataCalls.push(patch);
      Object.keys(patch).forEach(function (key) {
        host.data[key] = patch[key];
      });
    }
  };
  host._getGameSingleWindowWidth = compileMethod(widthSrc).bind(host);
  host._getGameSingleTeeStickyThresholdPx = compileMethod(thresholdSrc).bind(host);
  host._isGameSingleShell = compileMethod(shellSrc).bind(host);
  host._syncGameSingleTeeSticky = compileMethod(stickySrc).bind(host);
  host._setDataCalls = setDataCalls;
  return host;
}

function withWx(wxApi, fn) {
  var prev = global.wx;
  global.wx = wxApi;
  try {
    return fn();
  } finally {
    global.wx = prev;
  }
}

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 375 };
    },
    getSystemInfoSync: function () {
      throw new Error('legacy should not run');
    }
  },
  function () {
    var sysCalls = 0;
    global.wx.getSystemInfoSync = function () {
      sysCalls += 1;
      return { windowWidth: 320 };
    };
    var host = makeHost();
    var ww = host._getGameSingleWindowWidth();
    assert('现代 API 375 且旧 API 0 次', ww === 375 && sysCalls === 0);
  }
);

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 390 };
    },
    getSystemInfoSync: function () {
      throw new Error('no');
    }
  },
  function () {
    var host = makeHost();
    var threshold = host._getGameSingleTeeStickyThresholdPx();
    assert(
      '有效宽度阈值严格等于 96 * width / 750',
      host._getGameSingleWindowWidth() === 390 && threshold === (96 * 390) / 750
    );
  }
);

withWx(
  {
    getSystemInfoSync: function () {
      return { windowWidth: 414 };
    }
  },
  function () {
    var sysCalls = 0;
    global.wx.getSystemInfoSync = function () {
      sysCalls += 1;
      return { windowWidth: 414 };
    };
    var host = makeHost();
    assert(
      '无 getWindowInfo 时回退旧 API',
      host._getGameSingleWindowWidth() === 414 && sysCalls === 1
    );
  }
);

withWx(
  {
    getWindowInfo: function () {
      throw new Error('boom');
    },
    getSystemInfoSync: function () {
      return { windowWidth: 360 };
    }
  },
  function () {
    var sysCalls = 0;
    global.wx.getSystemInfoSync = function () {
      sysCalls += 1;
      return { windowWidth: 360 };
    };
    var host = makeHost();
    assert(
      '现代 API 抛错后回退旧 API',
      host._getGameSingleWindowWidth() === 360 && sysCalls === 1
    );
  }
);

var invalidModern = [{}, { windowWidth: 0 }, { windowWidth: -8 }, { windowWidth: NaN }, { windowWidth: Infinity }, { windowWidth: '375' }];
var invalidOk = invalidModern.every(function (info) {
  var sysCalls = 0;
  var host = makeHost();
  global.wx = {
    getWindowInfo: function () {
      return info;
    },
    getSystemInfoSync: function () {
      sysCalls += 1;
      return { windowWidth: 400 };
    }
  };
  return host._getGameSingleWindowWidth() === 400 && sysCalls === 1;
});
assert('现代 API 无效宽度回退旧 API', invalidOk);

withWx({}, function () {
  var host = makeHost();
  global.wx = {
    getWindowInfo: function () {
      throw new Error('modern');
    },
    getSystemInfoSync: function () {
      return { windowWidth: 0 };
    }
  };
  var a = host._getGameSingleWindowWidth();
  host = makeHost();
  global.wx = {
    getWindowInfo: function () {
      throw new Error('modern');
    },
    getSystemInfoSync: function () {
      throw new Error('legacy');
    }
  };
  var b = host._getGameSingleWindowWidth();
  host = makeHost();
  global.wx = {
    getWindowInfo: function () {
      throw new Error('modern');
    }
  };
  var c = host._getGameSingleWindowWidth();
  assert('旧 API 无效或抛错或缺失时使用 375', a === 375 && b === 375 && c === 375);
});

withWx({}, function () {
  var winCalls = 0;
  var sysCalls = 0;
  var host = makeHost();
  global.wx = {
    getWindowInfo: function () {
      winCalls += 1;
      return { windowWidth: 390 };
    },
    getSystemInfoSync: function () {
      sysCalls += 1;
      return { windowWidth: 320 };
    }
  };
  var first = host._getGameSingleWindowWidth();
  var second = host._getGameSingleWindowWidth();
  assert(
    '宽度缓存命中后不再调用系统 API',
    first === 390 && second === 390 && winCalls === 1 && sysCalls === 0
  );
});

withWx({}, function () {
  var winCalls = 0;
  var host = makeHost();
  global.wx = {
    getWindowInfo: function () {
      winCalls += 1;
      return { windowWidth: 375 };
    }
  };
  var t1 = host._getGameSingleTeeStickyThresholdPx();
  var t2 = host._getGameSingleTeeStickyThresholdPx();
  assert(
    '阈值缓存不重复读取窗口宽度',
    t1 === (96 * 375) / 750 && t2 === t1 && winCalls === 1
  );
});

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 375 };
    }
  },
  function () {
    var host = makeHost();
    global.wx = {
      getWindowInfo: function () {
        return { windowWidth: 375 };
      }
    };
    var threshold = host._getGameSingleTeeStickyThresholdPx();
    host._syncGameSingleTeeSticky(threshold - 0.5 - 0.01);
    assert('低于 threshold-0.5 时隐藏', host.data.isTeeStickyVisible === false && host._setDataCalls.length === 0);
    host._syncGameSingleTeeSticky(threshold - 0.5);
    assert(
      '满足 left + 0.5 >= threshold 时显示',
      host.data.isTeeStickyVisible === true &&
        host._setDataCalls.length === 1 &&
        host._setDataCalls[0].isTeeStickyVisible === true
    );
    host._syncGameSingleTeeSticky(threshold + 10);
    assert('可见状态未变化时不 setData', host._setDataCalls.length === 1);
  }
);

withWx(
  {
    getWindowInfo: function () {
      return { windowWidth: 375 };
    }
  },
  function () {
    var host = makeHost({ useStrokeScoreShell: false, isTeeStickyVisible: true });
    global.wx = {
      getWindowInfo: function () {
        return { windowWidth: 375 };
      }
    };
    host._syncGameSingleTeeSticky(999);
    assert(
      '非 game-single 已显示时关闭且不开启',
      host.data.isTeeStickyVisible === false &&
        host._setDataCalls.length === 1 &&
        host._setDataCalls[0].isTeeStickyVisible === false
    );
    host._syncGameSingleTeeSticky(999);
    assert('非 game-single 再次同步不重复 setData', host._setDataCalls.length === 1);
  }
);

assert(
  '方法名与 sticky 字段名保持不变',
  src.indexOf('_getGameSingleWindowWidth()') >= 0 &&
    src.indexOf('_getGameSingleTeeStickyThresholdPx()') >= 0 &&
    src.indexOf('_syncGameSingleTeeSticky(scrollLeft)') >= 0 &&
    src.indexOf('isTeeStickyVisible') >= 0 &&
    src.indexOf('_teeStickyThresholdPxCache') >= 0
);

console.log('\npassed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
