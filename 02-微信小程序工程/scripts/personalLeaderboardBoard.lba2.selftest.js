/**
 * LB-A2：普通队际个人榜 UI 组件抽取
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/personalLeaderboardBoard.lba2.selftest.js
 */

var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var compDir = path.join(mini, 'components', 'personal-leaderboard-board');
var detailDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'detail');
var seriesDir = path.join(mini, 'subpackages', 'tournament', 'pages', 'series-detail');

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

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

function exists(p) {
  return fs.existsSync(p);
}

var compJs = read(path.join(compDir, 'index.js'));
var compJson = read(path.join(compDir, 'index.json'));
var compWxml = read(path.join(compDir, 'index.wxml'));
var compWxss = read(path.join(compDir, 'index.wxss'));
var detailJs = read(path.join(detailDir, 'index.js'));
var detailJson = read(path.join(detailDir, 'index.json'));
var detailWxml = read(path.join(detailDir, 'index.wxml'));
var detailWxss = read(path.join(detailDir, 'index.wxss'));
var liveWxml = read(path.join(mini, 'components', 'live-leaderboard-board', 'index.wxml'));
var seriesWxml = exists(path.join(seriesDir, 'index.wxml'))
  ? read(path.join(seriesDir, 'index.wxml'))
  : '';
var seriesJson = exists(path.join(seriesDir, 'index.json'))
  ? read(path.join(seriesDir, 'index.json'))
  : '';
var sharedSrc = read(path.join(mini, 'utils', 'personalLeaderboardBoard.js'));

assert(
  '1 组件四文件存在',
  exists(path.join(compDir, 'index.js')) &&
    exists(path.join(compDir, 'index.json')) &&
    exists(path.join(compDir, 'index.wxml')) &&
    exists(path.join(compDir, 'index.wxss'))
);

assert(
  '2 组件声明 component + apply-shared',
  /"component"\s*:\s*true/.test(compJson) &&
    /apply-shared/.test(compJson) &&
    /styleIsolation:\s*'apply-shared'/.test(compJs)
);

assert(
  '3 复用共享资料区面板',
  /leaderboard-player-profile-panel/.test(compJson) &&
    /<leaderboard-player-profile-panel/.test(compWxml)
);

assert(
  '4 表头文案：POS PLAYER TEAM THRU TO PAR / NET SCORE',
  /lh-pos">POS</.test(compWxml) &&
    /lh-player">PLAYER</.test(compWxml) &&
    /lh-team">TEAM</.test(compWxml) &&
    /lh-thru">THRU</.test(compWxml) &&
    /NET SCORE/.test(compWxml) &&
    /TO PAR/.test(compWxml)
);

assert(
  '5 行字段绑定保持页面契约',
  /item\.pos/.test(compWxml) &&
    /item\.name/.test(compWxml) &&
    /item\.genderIcon/.test(compWxml) &&
    /item\.teamName/.test(compWxml) &&
    /item\.thru/.test(compWxml) &&
    /item\.scoreStr/.test(compWxml) &&
    /item\.netScoreDisplay/.test(compWxml) &&
    /item\.scoreClass/.test(compWxml) &&
    /item\.expanded/.test(compWxml) &&
    /item\.isEntity/.test(compWxml) &&
    /item\.members/.test(compWxml) &&
    /wx:key="rowId"/.test(compWxml)
);

assert(
  '6 展开区含资料 / 逐洞 / 广告 / 图例',
  /leaderboard-player-profile-panel/.test(compWxml) &&
    /sc-team-stack-wrap/.test(compWxml) &&
    /tour-scorecard/.test(compWxml) &&
    /openScorecard\.frontScore/.test(compWxml) &&
    /openScorecard\.backScore/.test(compWxml) &&
    /class="sc-ad"/.test(compWxml) &&
    /EAGLE OR BETTER/.test(compWxml)
);

assert(
  '7 默认空态不新增文案；prestart 默认 none',
  /emptyText:\s*\{\s*type:\s*String,\s*value:\s*''/.test(compJs) &&
    /emptyText &&/.test(compWxml) &&
    /prestartExpandMode:\s*\{\s*type:\s*String,\s*value:\s*'none'/.test(compJs) &&
    /prestartExpandMode === 'teeing_off_soon'/.test(compWxml) &&
    detailWxml.indexOf('teeing_off_soon') < 0
);

assert(
  '8 组件上抛 rowtap / profiletap / aderror / follow',
  /triggerEvent\(\s*'rowtap'/.test(compJs) &&
    /triggerEvent\(\s*'profiletap'/.test(compJs) &&
    /triggerEvent\(\s*'aderror'/.test(compJs) &&
    /triggerEvent\(\s*'follow'/.test(compJs) &&
    /bindtap="onRowTap"/.test(compWxml) &&
    /bind:profiletap="onProfileTap"/.test(compWxml) &&
    /binderror="onAdError"/.test(compWxml)
);

assert(
  '9 组件不读 match/storage、不排序、不导航',
  !/require\(/.test(compJs) &&
    !/setStorageSync|getStorageSync/.test(compJs) &&
    !/wx\./.test(compJs) &&
    !/navigateTo/.test(compJs) &&
    !/buildPersonalLeaderboardBoard/.test(compJs) &&
    !/sort\(/.test(compJs) &&
    !/seriesContext|seriesId/.test(compJs + compWxml)
);

assert(
  '10 权威样式显式引入 tournament-common',
  /@import\s+"\/styles\/tournament-common\.wxss"/.test(compWxss)
);

assert(
  '11 detail 注册并挂载 live-leaderboard-board',
  /live-leaderboard-board/.test(detailJson) &&
    /<live-leaderboard-board/.test(detailWxml) &&
    liveWxml.indexOf('<personal-leaderboard-board') >= 0 &&
    liveWxml.indexOf("view === 'team'") >= 0
);

assert(
  '12 detail 个人榜内联 DOM 已迁出',
  !/leaderboard-head--personal/.test(detailWxml) &&
    !/leaderboard-row--personal/.test(detailWxml) &&
    detailWxml.indexOf('<personal-leaderboard-board') < 0 &&
    liveWxml.indexOf('<personal-leaderboard-board') >= 0
);

assert(
  '13 球队榜 DOM/事件在共享 LIVE 组件',
  /onLiveLeaderboardTeamTap/.test(detailWxml) &&
    /team-leaderboard-row/.test(liveWxml) &&
    /teamLeaderboard/.test(detailWxml) &&
    /onTeamPlayerTap/.test(liveWxml) &&
    /data-mode="team"/.test(liveWxml)
);

assert(
  '14 原 handler 保留 + 薄适配',
  /toggleScorecard\(e\)/.test(detailJs) &&
    /onLeaderboardPlayerProfileTap\(e\)/.test(detailJs) &&
    /onLeaderboardFollow\(e\)/.test(detailJs) &&
    /onPersonalLeaderboardRowTap/.test(detailJs) &&
    /onPersonalLeaderboardAdError/.test(detailJs) &&
    /bind:rowtap="onPersonalLeaderboardRowTap"/.test(detailWxml) &&
    /bind:profiletap="onLeaderboardPlayerProfileTap"/.test(detailWxml) &&
    /bind:follow="onLeaderboardFollow"/.test(detailWxml) &&
    /bind:aderror="onPersonalLeaderboardAdError"/.test(detailWxml)
);

assert(
  '15 行点击仍走 toggleScorecard（同行再点收起 / 换行展开）',
  /onPersonalLeaderboardRowTap[\s\S]{0,200}toggleScorecard/.test(detailJs) &&
    /openIndex === idx \? -1 : idx/.test(detailJs)
);

assert(
  '16 投影模块未被本组件改动入口',
  /buildPersonalLeaderboardBoard/.test(sharedSrc) &&
    !/personal-leaderboard-board/.test(sharedSrc) &&
    /buildPersonalLeaderboardBoard/.test(detailJs)
);

assert(
  '17 Series Rn 与 detail 共用 live-leaderboard-board',
  seriesJson.indexOf('live-leaderboard-board') >= 0 &&
    seriesWxml.indexOf('<live-leaderboard-board') >= 0 &&
    seriesWxml.indexOf('standings.useLiveLeaderboard') >= 0 &&
    seriesWxml.indexOf('standings.showEntityAllBoard') < 0
);

assert(
  '18 G1–G4 / gross-net / all-male-female 仍由页面 data 驱动',
  /score-type="\{\{leaderboardScoreType\}\}"/.test(detailWxml) &&
    /leaderboard="\{\{leaderboard\}\}"/.test(detailWxml) &&
    /item\.expanded/.test(compWxml)
);

assert(
  '19 头像与球队角标绑定完整',
  /player="\{\{item\}\}"/.test(compWxml) &&
    /team-group-logo-by-id="\{\{teamGroupLogoById\}\}"/.test(compWxml) &&
    /avatar-badge="\{\{leaderboardAvatarBadge\}\}"/.test(compWxml)
);

assert('20 组件是 Component 构造', /Component\s*\(/.test(compJs));

if (failures.length) {
  console.log('');
  failures.forEach(function (f) {
    console.log('  - ' + f);
  });
}
console.log('');
console.log('LBA2 selftest: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
