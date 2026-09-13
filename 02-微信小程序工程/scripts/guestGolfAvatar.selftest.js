/**
 * 非注册球员 COS 卡通头像：性别池、首次保存、历史补分配、稳定性。
 * 运行：node scripts/guestGolfAvatar.selftest.js
 */
var guest = require('../miniprogram/utils/guestGolfAvatar.js');
var mockAvatars = require('../miniprogram/utils/mockAvatars.js');

var passed = 0;
var failed = 0;

function assert(label, ok, extra) {
  if (ok) {
    passed += 1;
    console.log('PASS  ' + label);
    return;
  }
  failed += 1;
  console.log('FAIL  ' + label + (extra ? ' :: ' + extra : ''));
}

assert('男池 8 张', guest.MALE_CODES.join(',') === '01,03,05,06,07,08,09,10');
assert('女池 4 张', guest.FEMALE_CODES.join(',') === '02,04,11,12');
assert('全部 12 张', guest.ALL_CODES.length === 12);

var maleUrl = guest.urlForCode('01');
assert('男 URL 含 golf-swing-01.jpg', /golf-swing-01\.jpg$/.test(maleUrl));
assert('resolveAvatar 不替换 COS 挥杆图', mockAvatars.resolveAvatar(maleUrl, 'seed') === maleUrl);

var seq = 0;
function rngCycle(values) {
  return function () {
    var v = values[seq % values.length];
    seq += 1;
    return v;
  };
}

seq = 0;
var pMale = guest.stampNewManualPlayer(
  { playerId: 'm_a', userType: 'guest', identitySource: 'manual_add', source: 'manual', gender: 'male', avatar: '' },
  [],
  rngCycle([0])
);
assert('默认/男分配在男池', guest.MALE_CODES.indexOf(pMale.guestAvatarCode) >= 0);
assert('男不落到女图', guest.FEMALE_CODES.indexOf(pMale.guestAvatarCode) < 0);

seq = 0;
var pFemale = guest.stampNewManualPlayer(
  { playerId: 'm_b', userType: 'guest', identitySource: 'manual_add', source: 'manual', gender: 'female', avatar: '' },
  [],
  rngCycle([0])
);
assert('女分配在女池', guest.FEMALE_CODES.indexOf(pFemale.guestAvatarCode) >= 0);

var missing = { playerId: 'm_hist', userType: 'guest', identitySource: 'manual_add', source: 'manual', avatar: '' };
var hist = guest.assignIfNeeded(missing, { persistGender: false, rng: function () { return 0; } });
assert('历史缺性别按男池', guest.MALE_CODES.indexOf(hist.code) >= 0);
assert('历史缺性别不写 gender', missing.gender == null || missing.gender === '');

var femaleKeep = { playerId: 'm_f', userType: 'guest', gender: 'female', avatar: '' };
guest.assignIfNeeded(femaleKeep, { persistGender: false, rng: function () { return 0; } });
assert('已有女性不改成男', femaleKeep.gender === 'female');
assert('已有女性用女池', guest.FEMALE_CODES.indexOf(femaleKeep.guestAvatarCode) >= 0);

var first = guest.stampNewManualPlayer(
  { playerId: 'm_1', userType: 'guest', source: 'manual', gender: 'male', avatar: '' },
  [],
  function () { return 0; }
);
var code1 = first.guestAvatarCode;
guest.assignIfNeeded(first, { persistGender: true, rng: function () { return 0.99; } });
assert('已分配不重抽', first.guestAvatarCode === code1);

first.gender = 'female';
guest.assignIfNeeded(first, { persistGender: true, rng: function () { return 0; } });
assert('改性别不重抽头像', first.guestAvatarCode === code1);

var custom = {
  playerId: 'm_c',
  userType: 'guest',
  source: 'manual',
  gender: 'male',
  avatar: 'https://example.com/custom.jpg'
};
guest.assignIfNeeded(custom, { persistGender: true, rng: function () { return 0; } });
assert('自定义 HTTPS 不覆盖', custom.avatar === 'https://example.com/custom.jpg');

var registered = {
  userId: 'u-123',
  userType: 'registered',
  avatar: '',
  gender: 'male'
};
assert('注册用户不走客池', guest.isEligibleManualGuest(registered) === false);

var mockKeep = {
  playerId: 'm_m',
  userType: 'guest',
  source: 'manual',
  avatar: mockAvatars.MOCK_AVATAR_PATHS[0]
};
guest.assignIfNeeded(mockKeep, { rng: function () { return 0; } });
assert('旧 mock 头像视为已有不替换', mockKeep.avatar === mockAvatars.MOCK_AVATAR_PATHS[0]);

seq = 0;
var used = [];
var n = 0;
while (n < 8) {
  var row = guest.stampNewManualPlayer(
    { playerId: 'm_g' + n, userType: 'guest', source: 'manual', gender: 'male', avatar: '' },
    used,
    rngCycle([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7])
  );
  used.push(row);
  n += 1;
}
var unique = {};
used.forEach(function (u) { unique[u.guestAvatarCode] = true; });
assert('同组 8 男尽量不重复', Object.keys(unique).length === 8);

var ninth = guest.stampNewManualPlayer(
  { playerId: 'm_g8', userType: 'guest', source: 'manual', gender: 'male', avatar: '' },
  used,
  function () { return 0; }
);
assert('男池用尽允许重复', guest.MALE_CODES.indexOf(ninth.guestAvatarCode) >= 0);

var def = {
  playerId: 'm_d',
  userType: 'guest',
  source: 'manual',
  avatar: mockAvatars.DEFAULT_AVATAR
};
var back = guest.assignIfNeeded(def, { persistGender: false, rng: function () { return 0; } });
assert('系统默认头像可补分配', back.assigned === true && guest.isGuestGolfAvatarUrl(def.avatar));

assert('陌生 URL 不当局默认', guest.isConfirmedSystemDefaultAvatar('https://cdn.other.com/x.jpg') === false);

var fs = require('fs');
var path = require('path');
var utilSrc = fs.readFileSync(
  path.join(__dirname, '../miniprogram/utils/guestGolfAvatar.js'),
  'utf8'
);
assert('相同 code 解析到同一 URL', guest.urlForCode('01') === guest.urlForCode('01') && !!guest.urlForCode('01'));
assert('URL 可解析回 code', guest.parseCodeFromAvatar(guest.urlForCode('03')) === '03');
assert('util 不引用记分页', utilSrc.indexOf('scoring/pages/score') < 0);
assert('util 不引用 cloud://', utilSrc.indexOf('cloud://') < 0);

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) process.exit(1);
process.exit(0);
