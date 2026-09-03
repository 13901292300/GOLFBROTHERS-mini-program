/**
 * 游戏设置页：用当前展示的草稿卡片派生确定/添加按钮状态。
 * 只看 setup 展示列表，不读游戏 TAB / Repository 正式条数。
 * 空数组是合法业务值：删除全部后仍可点「确定」保存。
 */
function fromDisplayedGames(games) {
  var loaded = Array.isArray(games);
  var n = loaded ? games.length : 0;
  return {
    draftGameCount: n,
    hasDraftGames: n > 0,
    canConfirmSetup: loaded
  };
}

module.exports = {
  fromDisplayedGames: fromDisplayedGames
};
