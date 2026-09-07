/**
 * tournament 第一小批拆包：stats / scorecard / peoria → tournament-tools。
 * 不保留旧路由壳。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/tournamentToolsSubpackage.selftest.js
 */

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var toolsRoot = path.join(mini, 'subpackages', 'tournament-tools');
var tourRoot = path.join(mini, 'subpackages', 'tournament');
var oldPages = ['stats', 'scorecard', 'peoria'];
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

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
}

function walkFiles(dir, acc) {
  acc = acc || [];
  if (!fs.existsSync(dir)) return acc;
  var names = fs.readdirSync(dir);
  var i;
  for (i = 0; i < names.length; i++) {
    var abs = path.join(dir, names[i]);
    var st = fs.statSync(abs);
    if (st.isDirectory()) walkFiles(abs, acc);
    else acc.push(abs);
  }
  return acc;
}

var extensions = ['js', 'wxml', 'wxss', 'json'];
oldPages.forEach(function (name) {
  assert(
    name + ' 新页面四文件存在',
    extensions.every(function (ext) {
      return fs.existsSync(path.join(toolsRoot, 'pages', name, 'index.' + ext));
    })
  );
  assert(
    name + ' 旧 tournament 页面目录已移除',
    !fs.existsSync(path.join(tourRoot, 'pages', name))
  );
});

['statisticsAdapter.js', 'peoriaStore.js', 'peoriaCalculator.js', 'landscapeHeaderMetrics.js'].forEach(function (file) {
  assert(
    file + ' 已迁入 tournament-tools/utils',
    fs.existsSync(path.join(toolsRoot, 'utils', file))
  );
  assert(
    file + ' 已离开 tournament/utils',
    !fs.existsSync(path.join(tourRoot, 'utils', file))
  );
});

var appJson = JSON.parse(read(path.join(mini, 'app.json')));
var tourPkg = (appJson.subPackages || []).find(function (item) {
  return item && item.root === 'subpackages/tournament';
});
var toolsPkg = (appJson.subPackages || []).find(function (item) {
  return item && item.root === 'subpackages/tournament-tools';
});
assert(
  'tournament-tools 分包注册三页',
  !!toolsPkg &&
    toolsPkg.name === 'tournament-tools' &&
    toolsPkg.pages.indexOf('pages/stats/index') >= 0 &&
    toolsPkg.pages.indexOf('pages/scorecard/index') >= 0 &&
    toolsPkg.pages.indexOf('pages/peoria/index') >= 0 &&
    toolsPkg.pages.length === 3
);
assert(
  'tournament 已移除三页且保留编辑/详情页',
  !!tourPkg &&
    tourPkg.pages.indexOf('pages/stats/index') < 0 &&
    tourPkg.pages.indexOf('pages/scorecard/index') < 0 &&
    tourPkg.pages.indexOf('pages/peoria/index') < 0 &&
    tourPkg.pages.indexOf('pages/group-editor/index') >= 0 &&
    tourPkg.pages.indexOf('pages/group-pick/index') >= 0 &&
    tourPkg.pages.indexOf('pages/detail/index') >= 0 &&
    tourPkg.pages.indexOf('pages/series-detail/index') >= 0
);

var hashes = {
  'pages/stats/index.js': '9253304AEC72576F6F07D17C2E27A67E55A915FCF6593F3FC458D394306FB6C1',
  'pages/stats/index.wxml': 'E7E441C184BCD51A0856745CE467B390346411767E58CC70D8AB4AD993A6E840',
  'pages/stats/index.wxss': '3614B0D386C5995EE7EA081CFFFDAD623D9D4EE6F31F25834AC826DE58D4415B',
  'pages/stats/index.json': '4E27954E99A96218C3B7229A212B5C93260938DCA48C8F1651C487AE2C168E37',
  'pages/scorecard/index.js': 'BFCB345691077F6C614EC287110858E61BE24CE57FA89A02760767E6E44B7239',
  'pages/scorecard/index.wxml': '93B5A7E4B9B2AA7C2EBFA493F7E6D9CFD4CEA57095684A172F1E954F2673C688',
  'pages/scorecard/index.wxss': '203B5D22BF1D4F78638EACDC3A3F3834ED57972D0CA22660B326F5EF137D5707',
  'pages/scorecard/index.json': 'E216722DE5D6CDC5F9D1B758564FD2A97290589E0D1B3802F0D7E05D65163D8F',
  'pages/peoria/index.js': '046D8376D3800163BD0A85D34E9ECB258FBA567E64BDBB553BEA77E72025361C',
  'pages/peoria/index.wxml': 'B0D898BB51530A19B5118D633AF8E946FBABCBF5C72255815615F40258C0FA8E',
  'pages/peoria/index.wxss': '614D2990167FD757CAB402CC4C01AA96ECD05FD57D1D9193F23D1EF645540428',
  'pages/peoria/index.json': '38F20314C5CD1B7AD1A9D900520CE04EA1EE0469D66D5E84884BA11FAA3E0992',
  'utils/statisticsAdapter.js': 'A6064B9095D6E4255A483CAD4FAE224C533195DE17178E012BBAA3DB50FC11C1',
  'utils/peoriaStore.js': 'EE031FF3B79D457C35BDE6A2E08FF83600C6AFEAFD7BF16E9FF6EF10B73A9514',
  'utils/peoriaCalculator.js': '44054278DB1656831448382EA8FE1E68F090CBE48DCB53972CA5AA43DB1CFFFC'
};
Object.keys(hashes).forEach(function (rel) {
  assert(rel + ' 内容哈希与迁移前一致', hashFile(path.join(toolsRoot, rel)) === hashes[rel]);
});

var statsJs = read(path.join(toolsRoot, 'pages', 'stats', 'index.js'));
var scorecardJs = read(path.join(toolsRoot, 'pages', 'scorecard', 'index.js'));
var peoriaJs = read(path.join(toolsRoot, 'pages', 'peoria', 'index.js'));
assert(
  '三页无分享 API',
  statsJs.indexOf('onShareAppMessage') < 0 &&
    statsJs.indexOf('onShareTimeline') < 0 &&
    scorecardJs.indexOf('onShareAppMessage') < 0 &&
    peoriaJs.indexOf('onShareAppMessage') < 0
);
assert(
  '未保留旧路由壳',
  !fs.existsSync(path.join(tourRoot, 'pages', 'stats')) &&
    !fs.existsSync(path.join(tourRoot, 'pages', 'scorecard')) &&
    !fs.existsSync(path.join(tourRoot, 'pages', 'peoria'))
);

var statsJson = JSON.parse(read(path.join(toolsRoot, 'pages', 'stats', 'index.json')));
var scorecardJson = JSON.parse(read(path.join(toolsRoot, 'pages', 'scorecard', 'index.json')));
assert(
  'stats/scorecard 横屏声明保留',
  statsJson.pageOrientation === 'landscape' && scorecardJson.pageOrientation === 'landscape'
);
assert(
  'scorecard 运行时横屏仍在',
  scorecardJs.indexOf("orientation: 'landscape'") >= 0
);

function collectRequires(src, fromDir) {
  var files = [];
  src.replace(/require\(['"]([^'"]+)['"]\)/g, function (match, request) {
    files.push(path.resolve(fromDir, request));
    return match;
  });
  return files;
}
var statsReqs = collectRequires(statsJs, path.join(toolsRoot, 'pages', 'stats'));
var scorecardReqs = collectRequires(scorecardJs, path.join(toolsRoot, 'pages', 'scorecard'));
var peoriaReqs = collectRequires(peoriaJs, path.join(toolsRoot, 'pages', 'peoria'));
var adapterReqs = collectRequires(
  read(path.join(toolsRoot, 'utils', 'statisticsAdapter.js')),
  path.join(toolsRoot, 'utils')
);
var storeReqs = collectRequires(
  read(path.join(toolsRoot, 'utils', 'peoriaStore.js')),
  path.join(toolsRoot, 'utils')
);
assert('stats require 可解析', statsReqs.length > 0 && statsReqs.every(fs.existsSync));
assert('scorecard require 可解析', scorecardReqs.length > 0 && scorecardReqs.every(fs.existsSync));
assert('peoria require 可解析', peoriaReqs.length > 0 && peoriaReqs.every(fs.existsSync));
assert('statisticsAdapter require 可解析', adapterReqs.length > 0 && adapterReqs.every(fs.existsSync));
assert('peoriaStore require 可解析', storeReqs.length > 0 && storeReqs.every(fs.existsSync));
assert(
  '页面仍走相对 utils 适配器（未改 require）',
  statsJs.indexOf("require('../../utils/statisticsAdapter.js')") >= 0 &&
    scorecardJs.indexOf("require('../../utils/statisticsAdapter.js')") >= 0 &&
    peoriaJs.indexOf("require('../../utils/peoriaStore.js')") >= 0 &&
    peoriaJs.indexOf("require('../../utils/peoriaCalculator.js')") >= 0
);

var detailJs = read(path.join(tourRoot, 'pages', 'detail', 'index.js'));
var seriesJs = read(path.join(tourRoot, 'pages', 'series-detail', 'index.js'));
var scoreJs = read(path.join(mini, 'subpackages', 'scoring', 'pages', 'score', 'index.js'));
var hubJs = read(path.join(mini, 'subpackages', 'scoring', 'pages', 'hub', 'index.js'));

assert(
  'detail → stats 新路由且保留 matchId 编码',
  detailJs.indexOf("'/subpackages/tournament-tools/pages/stats/index'") >= 0 &&
    detailJs.indexOf("'?matchId=' + encodeURIComponent(matchId)") >= 0
);
assert(
  'detail → peoria 新路由且保留 matchId 编码',
  detailJs.indexOf(
    "url: '/subpackages/tournament-tools/pages/peoria/index?matchId=' + encodeURIComponent(matchId)"
  ) >= 0
);
assert(
  'series-detail → stats 保留 matchId 与 roundSubtitle 编码',
  seriesJs.indexOf("'/subpackages/tournament-tools/pages/stats/index?matchId='") >= 0 &&
    seriesJs.indexOf("'&roundSubtitle=' + encodeURIComponent(subtitle)") >= 0 &&
    seriesJs.indexOf('wx.navigateTo') >= 0
);
assert(
  'series-detail → peoria 新路由且保留 matchId 编码',
  seriesJs.indexOf("'/subpackages/tournament-tools/pages/peoria/index?matchId='") >= 0 &&
    seriesJs.indexOf('encodeURIComponent(matchId)') >= 0
);
assert(
  'scoring/score → scorecard 保留 matchId/gameId query',
  scoreJs.indexOf("url: '/subpackages/tournament-tools/pages/scorecard/index?' + qs.join('&')") >= 0 &&
    scoreJs.indexOf("qs.push('matchId=' + encodeURIComponent(matchId))") >= 0 &&
    scoreJs.indexOf("qs.push('gameId=' + encodeURIComponent(gameId))") >= 0
);
assert(
  'scoring/score → stats 保留 gameId 编码',
  scoreJs.indexOf(
    "url: '/subpackages/tournament-tools/pages/stats/index?gameId=' + encodeURIComponent(gameId)"
  ) >= 0
);
assert(
  'scoring/hub → stats 保留 gameId 编码',
  hubJs.indexOf(
    "url: '/subpackages/tournament-tools/pages/stats/index?gameId=' + encodeURIComponent(gameId)"
  ) >= 0
);
assert(
  'Peoria 返回失败仍 fallback tournament detail',
  peoriaJs.indexOf("wx.navigateBack({") >= 0 &&
    peoriaJs.indexOf("'/subpackages/tournament/pages/detail/index'") >= 0 &&
    peoriaJs.indexOf("'?matchId=' + encodeURIComponent(matchId)") >= 0
);

var oldRouteRe = /\/subpackages\/tournament\/pages\/(stats|scorecard|peoria)\//;
var productionHits = [];
walkFiles(mini).forEach(function (abs) {
  if (/\.(js|json|wxml|wxss)$/i.test(abs) === false) return;
  var text = read(abs);
  if (oldRouteRe.test(text)) productionHits.push(path.relative(mini, abs).replace(/\\/g, '/'));
});
assert(
  'miniprogram 生产源码旧路由为 0',
  productionHits.length === 0
);
if (productionHits.length) {
  console.log('OLD_ROUTE_HITS=' + productionHits.join(','));
}

var scriptHits = [];
walkFiles(path.join(root, 'scripts')).forEach(function (abs) {
  if (path.basename(abs) === 'tournamentToolsSubpackage.selftest.js') return;
  if (/\.js$/i.test(abs) === false) return;
  var text = read(abs);
  if (oldRouteRe.test(text)) scriptHits.push(path.relative(root, abs).replace(/\\/g, '/'));
});
assert('scripts 旧生产路由为 0', scriptHits.length === 0);

console.log('\npassed=' + passed + ' failed=' + failed);
if (failures.length) {
  console.log(failures.join('\n'));
  process.exit(1);
}
