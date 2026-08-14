/**
 * 首页 openNormalCreate：导航前关闭已有「+」弹窗状态。
 * 运行：node scripts/homeOpenNormalCreateOverlay.selftest.js
 */

var fs = require('fs');
var path = require('path');

var homeJs = fs.readFileSync(
  path.join(__dirname, '..', 'miniprogram', 'pages', 'home', 'index.js'),
  'utf8'
);

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

var fnMatch = homeJs.match(/openNormalCreate\(\) \{[\s\S]*?\n  \}/);
assert('能提取 openNormalCreate', !!fnMatch);
if (!fnMatch) {
  console.log('STOP  首页找不到 openNormalCreate');
  process.exit(1);
}

var fnSrc = fnMatch[0];
var bodyMatch = fnSrc.match(/openNormalCreate\(\) \{([\s\S]*)\}$/);
var body = bodyMatch ? bodyMatch[1] : '';

assert(
  '关闭三字段后再 navigateTo 原创建页',
  body.indexOf('createOverlayVisible: false') >= 0 &&
    body.indexOf('createOverlayOpen: false') >= 0 &&
    body.indexOf('moreCreateVisible: false') >= 0 &&
    body.indexOf('createOverlayVisible: false') < body.indexOf('wx.navigateTo') &&
    /url:\s*'\/subpackages\/create\/pages\/normal\/index'/.test(body)
);

var order = [];
var nav = [];
var page = {
  data: {
    createOverlayVisible: true,
    createOverlayOpen: true,
    moreCreateVisible: true
  },
  setData: function (patch) {
    Object.assign(this.data, patch);
    order.push('setData');
  }
};
var wx = {
  navigateTo: function (opts) {
    nav.push(opts && opts.url);
    order.push('navigateTo');
  },
  showToast: function () {}
};
new Function('wx', body).call(page, wx);

assert(
  '打开弹窗后调用入口：三字段先变为 false',
  page.data.createOverlayVisible === false &&
    page.data.createOverlayOpen === false &&
    page.data.moreCreateVisible === false &&
    order[0] === 'setData'
);
assert(
  '随后只发生一次原 navigateTo',
  order[1] === 'navigateTo' &&
    nav.length === 1 &&
    nav[0] === '/subpackages/create/pages/normal/index'
);
assert(
  '创建页直接返回时旧首页弹窗已关',
  page.data.createOverlayVisible === false &&
    page.data.createOverlayOpen === false &&
    page.data.moreCreateVisible === false
);

console.log('');
console.log('---- homeOpenNormalCreateOverlay.selftest ----');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) {
  console.log('failures:');
  failures.forEach(function (f) {
    console.log(' - ' + f);
  });
  process.exit(1);
}
process.exit(0);
