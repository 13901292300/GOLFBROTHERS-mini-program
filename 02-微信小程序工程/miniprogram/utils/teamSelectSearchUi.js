'use strict';

/**
 * 创建选球队：搜索空态解释。
 * implemented:false 不能当成「全局确认不存在」。
 */
function resolveTeamSelectEmptyUi(opts) {
  var o = opts || {};
  var keyword = String(o.searchKeyword || '').trim();
  var teamCount = Number(o.teamCount || 0);
  if (!isFinite(teamCount) || teamCount < 0) teamCount = 0;
  var stillLoading = !!o.stillLoadingDefault;
  var isEventOrg = !!o.isEventOrg;
  var implemented = o.searchImplemented === true;
  var searchOk = o.searchOk === true;

  var showSearchCreateEmpty = false;
  var showSearchUnavailable = false;

  if (stillLoading || !keyword) {
    return {
      showSearchCreateEmpty: false,
      showSearchUnavailable: false
    };
  }

  if (isEventOrg) {
    showSearchCreateEmpty = teamCount === 0;
    return {
      showSearchCreateEmpty: showSearchCreateEmpty,
      showSearchUnavailable: false
    };
  }

  if (implemented && searchOk && teamCount === 0) {
    showSearchCreateEmpty = true;
  } else if (!implemented && teamCount === 0) {
    showSearchUnavailable = true;
  }

  return {
    showSearchCreateEmpty: showSearchCreateEmpty,
    showSearchUnavailable: showSearchUnavailable
  };
}

module.exports = {
  resolveTeamSelectEmptyUi: resolveTeamSelectEmptyUi
};
