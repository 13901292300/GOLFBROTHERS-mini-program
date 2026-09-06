const routes = require('../../utils/teamClub/routes.js');
const shareInvite = require('../../utils/teamClub/shareInvite.js');

function pickQuery(options) {
  const src = options || {};
  const query = {};
  ['token', 'inviteToken', 'teamId'].forEach((key) => {
    if (src[key] == null) return;
    const v = String(src[key]).trim();
    if (v) query[key] = v;
  });
  return query;
}

function openRuntime(url, attempt) {
  wx.redirectTo({
    url: url,
    fail: function () {
      if (attempt >= 8) return;
      setTimeout(function () {
        openRuntime(url, attempt + 1);
      }, 240);
    }
  });
}

Page({
  onLoad(options) {
    const query = pickQuery(options);
    const token = query.token || query.inviteToken || '';
    if (token) shareInvite.savePendingToken(token);
    openRuntime(routes.buildInviteRuntimeUrl(query), 0);
  }
});
