function currentPages() {
  try {
    return getCurrentPages() || [];
  } catch (e) {
    return [];
  }
}

function navigateBackSafe(delta) {
  const pages = currentPages();
  const maxDelta = Math.max(1, pages.length - 1);
  const next = Math.min(Math.max(1, Number(delta) || 1), maxDelta);
  wx.navigateBack({
    delta: next,
    fail: function () {
      wx.navigateBack({ delta: 1 });
    }
  });
}

function navigateBackTo(routePart, fallbackUrl) {
  const pages = currentPages();
  const needle = String(routePart || "");
  let idx = -1;
  for (let i = pages.length - 2; i >= 0; i--) {
    const route = pages[i].route || "";
    if (needle && route.indexOf(needle) !== -1) {
      idx = i;
      break;
    }
  }
  const goFallback = function () {
    if (fallbackUrl) {
      wx.redirectTo({ url: fallbackUrl });
      return;
    }
    navigateBackSafe(1);
  };
  if (idx < 0) {
    goFallback();
    return;
  }
  wx.navigateBack({
    delta: pages.length - 1 - idx,
    fail: goFallback
  });
}

function callOnPage(routePart, method, arg) {
  const pages = currentPages();
  const needle = String(routePart || "");
  for (let i = pages.length - 2; i >= 0; i--) {
    const page = pages[i];
    const route = (page && page.route) || "";
    if (!needle || route.indexOf(needle) === -1) continue;
    if (page && typeof page[method] === "function") {
      try {
        page[method](arg);
      } catch (e) {}
      return true;
    }
  }
  return false;
}

module.exports = {
  navigateBackSafe: navigateBackSafe,
  navigateBackTo: navigateBackTo,
  callOnPage: callOnPage
};
