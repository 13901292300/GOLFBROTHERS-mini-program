/**
 * tournament-manage 分包：group-editor / group-pick 业务页 + tournament 旧路由兼容壳。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/tournamentManageSubpackage.selftest.js
 */

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var manageRoot = path.join(mini, 'subpackages', 'tournament-manage');
var tourRoot = path.join(mini, 'subpackages', 'tournament');
var editorTarget = '/subpackages/tournament-manage/pages/group-editor/index';
var pickTarget = '/subpackages/tournament-manage/pages/group-pick/index';
var passed = 0;
var failed = 0;
var failures = [];

function assert(label, condition) {
  if (condition) {
    passed += 1;
    console.log('PASS  ' + label);
    return;
  }
  failed += 1;
  failures.push(label);
  console.log('FAIL  ' + label);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function walkFiles(dir, acc) {
  acc = acc || [];
  if (!fs.existsSync(dir)) return acc;
  fs.readdirSync(dir).forEach(function (name) {
    var abs = path.join(dir, name);
    if (fs.statSync(abs).isDirectory()) walkFiles(abs, acc);
    else acc.push(abs);
  });
  return acc;
}

var extensions = ['js', 'wxml', 'wxss', 'json'];
['group-editor', 'group-pick'].forEach(function (name) {
  assert(
    'manage ' + name + ' 四件套存在',
    extensions.every(function (ext) {
      return fs.existsSync(path.join(manageRoot, 'pages', name, 'index.' + ext));
    })
  );
  assert(
    'tournament ' + name + ' 壳四件套存在',
    extensions.every(function (ext) {
      return fs.existsSync(path.join(tourRoot, 'pages', name, 'index.' + ext));
    })
  );
});

assert(
  'identityCorrection 只在 manage 一份',
  fs.existsSync(path.join(manageRoot, 'utils', 'seriesLiveIdentityCorrection.js')) &&
    !fs.existsSync(path.join(tourRoot, 'utils', 'seriesLiveIdentityCorrection.js'))
);
assert(
  'seriesGroupPickRoster 只在 manage 一份',
  fs.existsSync(path.join(manageRoot, 'utils', 'seriesGroupPickRoster.js')) &&
    !fs.existsSync(path.join(tourRoot, 'pages', 'series-detail', 'seriesGroupPickRoster.js'))
);

var appJson = JSON.parse(read(path.join(mini, 'app.json')));
var tourPkg = (appJson.subPackages || []).find(function (item) {
  return item && item.root === 'subpackages/tournament';
});
var managePkg = (appJson.subPackages || []).find(function (item) {
  return item && item.root === 'subpackages/tournament-manage';
});
assert(
  'app.json 注册 tournament-manage 两页',
  !!managePkg &&
    managePkg.name === 'tournament-manage' &&
    managePkg.pages.indexOf('pages/group-editor/index') >= 0 &&
    managePkg.pages.indexOf('pages/group-pick/index') >= 0 &&
    managePkg.pages.length === 2
);
assert(
  'tournament 旧两页仍注册',
  !!tourPkg &&
    tourPkg.pages.indexOf('pages/group-editor/index') >= 0 &&
    tourPkg.pages.indexOf('pages/group-pick/index') >= 0 &&
    tourPkg.pages.indexOf('pages/detail/index') >= 0 &&
    tourPkg.pages.indexOf('pages/series-detail/index') >= 0
);

function assertShell(pageName, targetUrl) {
  var dir = path.join(tourRoot, 'pages', pageName);
  var shellJs = read(path.join(dir, 'index.js'));
  assert(
    pageName + ' 为纯 redirect 壳',
    shellJs.indexOf('wx.redirectTo') >= 0 &&
      shellJs.indexOf('wx.navigateTo') < 0 &&
      shellJs.indexOf('require(') < 0 &&
      shellJs.indexOf(targetUrl) >= 0 &&
      shellJs.indexOf('executeSeriesLiveIdentityCorrection') < 0 &&
      shellJs.indexOf('seriesLiveIdentityCorrection') < 0 &&
      shellJs.indexOf('seriesGroupPickRoster') < 0 &&
      shellJs.indexOf('teamMatchStore') < 0
  );
  assert(
    pageName + ' 壳 WXML/WXSS 为空且 JSON 最小合法',
    read(path.join(dir, 'index.wxml')).length === 0 &&
      read(path.join(dir, 'index.wxss')).length === 0 &&
      Object.keys(JSON.parse(read(path.join(dir, 'index.json')))).length === 0
  );
  var pageDefinition = null;
  var redirects = [];
  vm.runInNewContext(shellJs, {
    Page: function (definition) {
      pageDefinition = definition;
    },
    wx: {
      redirectTo: function (options) {
        redirects.push(options);
      }
    },
    encodeURIComponent: encodeURIComponent,
    String: String,
    Object: Object
  });
  pageDefinition.onLoad({
    matchId: 'm + %',
    mode: 'live',
    fromSeries: '1',
    seriesId: 's&1',
    roundId: 'r/2',
    groupId: 'g1',
    groupName: '第1组',
    futureKey: '中文'
  });
  assert(
    pageName + ' 壳完整编码透传 query',
    redirects[0].url ===
      targetUrl +
        '?matchId=m%20%2B%20%25&mode=live&fromSeries=1&seriesId=s%261&roundId=r%2F2&groupId=g1&groupName=%E7%AC%AC1%E7%BB%84&futureKey=%E4%B8%AD%E6%96%87'
  );
  assert(
    pageName + ' 壳只跳 manage 且失败回首页一次',
    redirects[0].url.indexOf(targetUrl) === 0 &&
      redirects[0].url.indexOf('/subpackages/tournament/pages/' + pageName) < 0 &&
      !!redirects[0].fail &&
      (redirects[0].fail(), redirects.length === 2) &&
      redirects[1].url === '/pages/home/index' &&
      !redirects[1].fail
  );
}

assertShell('group-editor', editorTarget);
assertShell('group-pick', pickTarget);

var manageEditorJs = read(path.join(manageRoot, 'pages', 'group-editor', 'index.js'));
var managePickJs = read(path.join(manageRoot, 'pages', 'group-pick', 'index.js'));
var detailJs = read(path.join(tourRoot, 'pages', 'detail', 'index.js'));
var seriesJs = read(path.join(tourRoot, 'pages', 'series-detail', 'index.js'));
assert(
  '正式入口全部直达 manage editor',
  detailJs.indexOf(editorTarget) >= 0 &&
    seriesJs.indexOf(editorTarget) >= 0 &&
    detailJs.indexOf('/subpackages/tournament/pages/group-editor/index?') < 0 &&
    seriesJs.indexOf('/subpackages/tournament/pages/group-editor/index?') < 0
);
assert(
  'manage editor 直达 manage pick',
  manageEditorJs.indexOf(pickTarget) >= 0 &&
    manageEditorJs.indexOf('/subpackages/tournament/pages/group-pick/') < 0 &&
    managePickJs.indexOf('/subpackages/tournament/pages/group-editor/') < 0 &&
    manageEditorJs.indexOf(editorTarget) < 0
);
assert(
  'group-editor 正式保存只走 identity correction',
  manageEditorJs.indexOf('executeSeriesLiveIdentityCorrection') >= 0 &&
    manageEditorJs.indexOf('_runSeriesLiveIdentityCorrection') >= 0 &&
    manageEditorJs.indexOf('seriesLiveSingleReplaceFlow') < 0 &&
    manageEditorJs.indexOf('seriesLiveMutationJournal') < 0 &&
    manageEditorJs.indexOf('gb_series_live_mutation_journal') < 0
);

function posixRel(abs) {
  return path.relative(mini, abs).replace(/\\/g, '/');
}

function resolveImport(fromFile, spec) {
  if (!spec) return '';
  if (spec.charAt(0) === '/') return path.join(mini, spec.replace(/^\//, ''));
  return path.resolve(path.dirname(fromFile), spec);
}

var manageHitsTour = [];
var tourHitsManageUtil = [];
walkFiles(manageRoot).forEach(function (abs) {
  var ext = path.extname(abs).toLowerCase();
  if (ext !== '.js' && ext !== '.wxss') return;
  var text = read(abs);
  var re =
    ext === '.wxss'
      ? /@import\s+['"]([^'"]+)['"]/g
      : /require\(['"]([^'"]+)['"]\)/g;
  var m;
  while ((m = re.exec(text))) {
    var spec = m[1];
    if (spec.indexOf('subpackages/tournament/') >= 0 && spec.indexOf('tournament-manage') < 0) {
      manageHitsTour.push(posixRel(abs) + ' -> ' + spec);
    }
    var resolved = resolveImport(abs, spec);
    var rel = posixRel(resolved);
    if (rel.indexOf('subpackages/tournament/') === 0 && rel.indexOf('tournament-manage') < 0) {
      manageHitsTour.push(posixRel(abs) + ' -> ' + rel);
    }
  }
});
walkFiles(tourRoot).forEach(function (abs) {
  if (path.extname(abs).toLowerCase() !== '.js') return;
  var text = read(abs);
  var re = /require\(['"]([^'"]+)['"]\)/g;
  var m;
  while ((m = re.exec(text))) {
    var spec = m[1];
    if (spec.indexOf('tournament-manage') >= 0) {
      tourHitsManageUtil.push(posixRel(abs) + ' -> ' + spec);
    }
  }
});
assert('manage 无 require/import tournament', manageHitsTour.length === 0);
assert('tournament 无 require manage util', tourHitsManageUtil.length === 0);

var unresolved = [];
walkFiles(path.join(manageRoot, 'pages')).concat(walkFiles(path.join(manageRoot, 'utils'))).forEach(
  function (abs) {
    if (path.extname(abs).toLowerCase() !== '.js') return;
    var text = read(abs);
    var re = /require\(['"]([^'"]+)['"]\)/g;
    var m;
    while ((m = re.exec(text))) {
      var spec = m[1];
      var resolved = resolveImport(abs, spec);
      var asJs = resolved;
      if (!/\.js$/i.test(asJs)) asJs += '.js';
      if (!fs.existsSync(asJs) && !fs.existsSync(resolved)) {
        unresolved.push(posixRel(abs) + ' -> ' + spec);
      }
    }
  }
);
assert('manage require 均可解析', unresolved.length === 0);

var editorJson = JSON.parse(read(path.join(manageRoot, 'pages', 'group-editor', 'index.json')));
var viewPath = editorJson.usingComponents && editorJson.usingComponents['tournament-group-editor-view'];
assert(
  'editor 使用主包绝对组件路径',
  viewPath === '/components/tournament-group-editor-view/index' &&
    fs.existsSync(path.join(mini, 'components', 'tournament-group-editor-view', 'index.js'))
);

function fourPieceOk(pagePath) {
  return extensions.every(function (ext) {
    return fs.existsSync(path.join(mini, pagePath + '.' + ext));
  });
}
var missingPages = [];
(appJson.pages || []).forEach(function (p) {
  if (!fourPieceOk(p)) missingPages.push(p);
});
(appJson.subPackages || []).forEach(function (pkg) {
  (pkg.pages || []).forEach(function (p) {
    var rel = pkg.root.replace(/\/$/, '') + '/' + p;
    if (!fourPieceOk(rel)) missingPages.push(rel);
  });
});
assert('app.json 所有页面四件套完整', missingPages.length === 0);

console.log('\npassed=' + passed + ' failed=' + failed);
if (failures.length) {
  console.log(failures.join('\n'));
  if (manageHitsTour.length) console.log('manageHitsTour\n' + manageHitsTour.join('\n'));
  if (tourHitsManageUtil.length) console.log('tourHitsManageUtil\n' + tourHitsManageUtil.join('\n'));
  if (unresolved.length) console.log('unresolved\n' + unresolved.join('\n'));
  if (missingPages.length) console.log('missingPages\n' + missingPages.join('\n'));
  process.exit(1);
}
