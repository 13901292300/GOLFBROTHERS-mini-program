/**
 * 架构守卫：禁止重新引入用 ` + ` 拼接组合成员昵称。
 * 扫描展示链路与公共生成入口。
 */
var fs = require('fs');
var path = require('path');

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

var root = path.join(__dirname, '..', 'miniprogram');
var allowFiles = {
  'utils/comboDisplayName.js': true // 仅允许在检测列表中出现 join(' + ')
};

var banned = [];
// 仅禁止昵称拼接形态：join(' + ') / join(" + ")
// join('+') 用于编队形状键（如 2+2）不在此列
var plusJoinRe = /\.join\(\s*['"] \+ ['"]\s*\)/;

function walk(dir, rel) {
  var entries = fs.readdirSync(dir);
  entries.forEach(function (name) {
    if (name === 'node_modules' || name === 'miniprogram_npm') return;
    var full = path.join(dir, name);
    var nextRel = rel ? rel + '/' + name : name;
    var st = fs.statSync(full);
    if (st.isDirectory()) {
      walk(full, nextRel);
      return;
    }
    if (!/\.(js|ts|wxs)$/.test(name)) return;
    if (allowFiles[nextRel.replace(/\\/g, '/')]) return;
    var text = fs.readFileSync(full, 'utf8');
    var lines = text.split(/\r?\n/);
    lines.forEach(function (line, idx) {
      if (plusJoinRe.test(line)) {
        banned.push(nextRel + ':' + (idx + 1) + ' ' + line.trim());
      }
    });
  });
}

walk(root, '');

assert(
  '无 join(+ ) 拼接成员昵称',
  banned.length === 0,
  banned.slice(0, 8).join(' | ')
);

var entry = path.join(root, 'utils', 'comboDisplayName.js');
var entrySrc = fs.readFileSync(entry, 'utf8');
assert('唯一入口存在', fs.existsSync(entry));
assert('入口导出 formatComboDisplayName', /formatComboDisplayName/.test(entrySrc));
assert('入口强制 / 分隔', /COMBO_MEMBER_SEP\s*=\s*['"]\/['"]/.test(entrySrc));
assert(
  '入口禁止默认 +',
  !/join\(sep \|\| ['"] \+ ['"]\)/.test(entrySrc) &&
    !/COMBO_MEMBER_SEP\s*=\s*['"] \+ ['"]/.test(entrySrc)
);

var subjectSrc = fs.readFileSync(
  path.join(root, 'subpackages', 'game', 'utils', 'participantSubject.js'),
  'utf8'
);
assert(
  'participantSubject 引用 comboDisplayName',
  /comboDisplayName/.test(subjectSrc) && /formatComboDisplayName/.test(subjectSrc)
);
assert(
  'participantSubject 不再硬编码 + 拼接',
  !/memberJoinedName\([^,]+,\s*['"] \+ ['"]\)/.test(subjectSrc)
);

console.log('\ncomboNameArchGuard.selftest passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
