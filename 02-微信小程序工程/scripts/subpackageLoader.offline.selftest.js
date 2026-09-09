/**
 * Offline V1 Phase 4.1：player 分包 ensureLoaded + 创建/记分入口。
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/subpackageLoader.offline.selftest.js
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

function flush() {
  return new Promise(function (resolve) {
    setImmediate(resolve);
  });
}

function clearApi(a) {
  a.loadCalls.length = 0;
  a.navigates.length = 0;
  a.toasts.length = 0;
  a.pending.length = 0;
}

function methodSource(src, name) {
  var re = new RegExp('\\b' + name + '\\s*\\([^)]*\\)\\s*\\{');
  var match = re.exec(src);
  if (!match) return '';
  var start = match.index;
  var i = match.index + match[0].length - 1;
  var depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return '';
}

function installWx(opts) {
  opts = opts || {};
  var loadMode = opts.loadMode || 'success';
  var loadCalls = [];
  var navigates = [];
  var toasts = [];
  var pending = [];
  global.wx = {
    getStorageSync: function () {
      return undefined;
    },
    setStorageSync: function () {},
    showToast: function (t) {
      toasts.push(t);
    },
    navigateTo: function (n) {
      navigates.push(n);
      if (n && typeof n.success === 'function') n.success();
    },
    loadSubpackage: function (req) {
      loadCalls.push(req);
      if (loadMode === 'hold') {
        pending.push(req);
        return;
      }
      if (loadMode === 'fail') {
        if (req && typeof req.fail === 'function') req.fail({ errMsg: 'loadSubpackage:fail' });
        return;
      }
      if (req && typeof req.success === 'function') req.success({});
    }
  };
  return {
    loadCalls: loadCalls,
    navigates: navigates,
    toasts: toasts,
    pending: pending,
    setLoadMode: function (mode) {
      loadMode = mode;
    }
  };
}

function installApp(networkConnected) {
  var globalData = {
    networkConnected: networkConnected !== false,
    networkType: networkConnected === false ? 'none' : 'wifi'
  };
  global.getApp = function () {
    return {
      globalData: globalData,
      getTheme: function () {
        return 'bright';
      }
    };
  };
  return globalData;
}

var loaderPath = path.join(mini, 'utils', 'subpackageLoader.js');
delete require.cache[require.resolve(loaderPath)];
var subpackageLoader = require(loaderPath);
subpackageLoader._resetInFlightForTest();

var api = installWx({ loadMode: 'success' });
installApp(true);

subpackageLoader
  .ensureLoaded('player')
  .then(function () {
    assert('CASE1 online / 未加载 load success → Promise resolve', api.loadCalls.length === 1 && api.loadCalls[0].name === 'player');

    subpackageLoader._resetInFlightForTest();
    api = installWx({ loadMode: 'hold' });
    var p1 = subpackageLoader.ensureLoaded('player');
    var p2 = subpackageLoader.ensureLoaded('player');
    assert(
      'CASE2 同一 name 并发两次 ensure → load 一次且共享 inFlight',
      api.loadCalls.length === 1 && p1 === p2
    );
    api.pending[0].success({});
    return Promise.all([p1, p2]);
  })
  .then(function () {
    subpackageLoader._resetInFlightForTest();
    api = installWx({ loadMode: 'fail' });
    return subpackageLoader
      .ensureLoaded('player')
      .then(function () {
        assert('CASE3 load fail → Promise reject', false);
      })
      .catch(function () {
        assert(
          'CASE3 load fail → Promise reject 且 inFlight 释放',
          subpackageLoader._inFlightCountForTest() === 0
        );
      });
  })
  .then(function () {
    api.setLoadMode('success');
    return subpackageLoader.ensureLoaded('player').then(function () {
      assert('CASE4 fail 后再次 ensure 可重新 loadSubpackage', api.loadCalls.length === 2);
    });
  })
  .then(function () {
    var normalSrc = fs.readFileSync(
      path.join(mini, 'subpackages', 'create', 'pages', 'normal', 'index.js'),
      'utf8'
    );
    var scoreSrc = fs.readFileSync(
      path.join(mini, 'subpackages', 'scoring', 'pages', 'score', 'index.js'),
      'utf8'
    );
    var friendsFn = methodSource(normalSrc, 'addFromFriends');
    var comboFn = methodSource(normalSrc, 'addFromCombo');
    var manualFn = methodSource(normalSrc, 'addManual');
    var scoreFriendFn = methodSource(scoreSrc, 'addMethodFriend');
    var scoreComboFn = methodSource(scoreSrc, 'addMethodCombo');
    var scoreManualFn = methodSource(scoreSrc, 'addMethodManual');
    var onLoadFn = methodSource(normalSrc, 'onLoad');

    global.Page = function (def) {
      global.__normalPage = def;
    };
    global.Component = function () {};
    global.getCurrentPages = function () {
      return [];
    };
    installApp(true);
    api = installWx({ loadMode: 'success' });
    var normalPath = path.join(mini, 'subpackages', 'create', 'pages', 'normal', 'index.js');
    delete require.cache[require.resolve(normalPath)];
    require(normalPath);
    var page = global.__normalPage;
    var ctx = {
      data: {
        showAddPlayer: true,
        groups: [
          {
            players: [
              { key: 'g1-p1', filled: false, name: '玩家1' },
              { key: 'g1-p2', filled: false, name: '玩家2' }
            ]
          }
        ]
      },
      setData: function (patch) {
        Object.keys(patch || {}).forEach(function (k) {
          ctx.data[k] = patch[k];
        });
      },
      _addTarget: { gIdx: 0, pIdx: 0 },
      _gameUsedIds: function () {
        return [];
      },
      _onFriendsSelected: function () {},
      _onComboSelected: function () {},
      _onPlayerPicked: function () {}
    };

    page.addFromFriends.call(ctx);
    return Promise.resolve()
      .then(function () {
        return new Promise(function (resolve) {
          setImmediate(resolve);
        });
      })
      .then(function () {
        assert(
          'CASE5 normal addFromFriends → ensure player 后 navigate',
          api.loadCalls.some(function (c) {
            return c.name === 'player';
          }) &&
            api.navigates.length === 1 &&
            String(api.navigates[0].url).indexOf('/subpackages/player/pages/friends/index') === 0
        );
        clearApi(api);
        subpackageLoader._resetInFlightForTest();
        page.addFromCombo.call(ctx);
        return flush();
      })
      .then(function () {
        assert(
          'CASE6 normal addFromCombo → ensure player 后 navigate',
          api.loadCalls.some(function (c) {
            return c.name === 'player';
          }) &&
            api.navigates.length === 1 &&
            String(api.navigates[0].url).indexOf('/subpackages/player/pages/combos/index') === 0
        );
        clearApi(api);
        subpackageLoader._resetInFlightForTest();
        page.addManual.call(ctx);
        return flush();
      })
      .then(function () {
        assert(
          'CASE7 normal addManual → ensure player 后 navigate',
          api.loadCalls.some(function (c) {
            return c.name === 'player';
          }) &&
            api.navigates.length === 1 &&
            String(api.navigates[0].url).indexOf('/subpackages/player/pages/manual/index') === 0
        );

        assert(
          'CASE8 score friend → ensure player',
          scoreFriendFn.indexOf("ensureLoaded('player')") >= 0 &&
            scoreFriendFn.indexOf('/subpackages/player/pages/friends/index') >= 0
        );
        assert(
          'CASE9 score combo → ensure player',
          scoreComboFn.indexOf("ensureLoaded('player')") >= 0 &&
            scoreComboFn.indexOf('/subpackages/player/pages/combos/index') >= 0
        );
        assert(
          'CASE10 score manual → 不调用 ensure player',
          scoreManualFn.indexOf('ensureLoaded') < 0 &&
            scoreManualFn.indexOf('manualSheetVisible') >= 0
        );

        clearApi(api);
        subpackageLoader._resetInFlightForTest();
        installApp(false);
        api.setLoadMode('success');
        page.addFromFriends.call(ctx);
        return flush();
      })
      .then(function () {
        assert(
          'CASE11 离线但 load success 仍 navigate',
          api.navigates.length === 1 && api.toasts.length === 0
        );

        clearApi(api);
        subpackageLoader._resetInFlightForTest();
        installApp(false);
        api.setLoadMode('fail');
        page.addFromFriends.call(ctx);
        return flush();
      })
      .then(function () {
        assert(
          'CASE12 离线未缓存 fail → 不 navigate + 本机未加载文案',
          api.navigates.length === 0 &&
            api.toasts.length === 1 &&
            api.toasts[0].title === '当前无网络，该功能尚未加载到本机' &&
            api.toasts[0].icon === 'none'
        );

        clearApi(api);
        subpackageLoader._resetInFlightForTest();
        installApp(true);
        api.setLoadMode('fail');
        page.addFromFriends.call(ctx);
        return flush();
      })
      .then(function () {
        assert(
          'CASE13 在线 load fail → 不 navigate + 稍后重试',
          api.navigates.length === 0 &&
            api.toasts.length === 1 &&
            api.toasts[0].title === '功能加载失败，请稍后重试'
        );

        clearApi(api);
        subpackageLoader._resetInFlightForTest();
        installApp(true);
        api.setLoadMode('success');
        page.addFromFriends.call(ctx);
        return flush().then(function () {
          var ev = api.navigates[0] && api.navigates[0].events;
          assert('CASE14 friends EventChannel 仍 friendsSelected', !!(ev && ev.friendsSelected));
          clearApi(api);
          subpackageLoader._resetInFlightForTest();
          page.addFromCombo.call(ctx);
          return flush();
        }).then(function () {
          var ev = api.navigates[0] && api.navigates[0].events;
          assert('CASE15 combo EventChannel 仍 comboSelected', !!(ev && ev.comboSelected));
          clearApi(api);
          subpackageLoader._resetInFlightForTest();
          page.addManual.call(ctx);
          return flush();
        }).then(function () {
          var ev = api.navigates[0] && api.navigates[0].events;
          assert('CASE16 manual EventChannel 仍 playerPicked', !!(ev && ev.playerPicked));
        });
      })
      .then(function () {
        var appJson = JSON.parse(fs.readFileSync(path.join(mini, 'app.json'), 'utf8'));
        var rule = appJson.preloadRule && appJson.preloadRule['subpackages/create/pages/normal/index'];
        assert(
          'CASE17 普通创建 preloadRule packages 含 player',
          !!(rule && rule.network === 'all' && rule.packages && rule.packages.indexOf('player') >= 0)
        );
        var loaderSrc = fs.readFileSync(loaderPath, 'utf8');
        assert(
          'CASE18 preload fail 不影响 normal create（onLoad 不 ensureLoaded、无 toast）',
          onLoadFn.indexOf('ensureLoaded') < 0 &&
            onLoadFn.indexOf('showToast') < 0 &&
            friendsFn.indexOf("ensureLoaded('player')") >= 0 &&
            comboFn.indexOf("ensureLoaded('player')") >= 0 &&
            manualFn.indexOf("ensureLoaded('player')") >= 0 &&
            loaderSrc.indexOf('failToastTitle') < 0 &&
            loaderSrc.indexOf('当前无网络') < 0 &&
            loaderSrc.indexOf('showToast') < 0 &&
            loaderSrc.indexOf('networkConnected') < 0
        );

        console.log('\n---- subpackageLoader.offline.selftest ----');
        console.log('passed=' + passed + ' failed=' + failed);
        if (failed) process.exit(1);
      });
  })
  .catch(function (err) {
    console.log('FAIL  unexpected ' + (err && err.stack ? err.stack : err));
    process.exit(1);
  });
