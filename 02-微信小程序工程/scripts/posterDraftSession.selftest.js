/**
 * 海报草稿分比赛存储、完成态清理、结束流程源码约束。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/posterDraftSession.selftest.js
 */

var fs = require("fs");
var path = require("path");
var posterDraft = require("../miniprogram/subpackages/poster/utils/poster-draft.js");

var passed = 0;
var failed = 0;

function assert(label, ok) {
  if (ok) {
    passed += 1;
    console.log("PASS  " + label);
    return;
  }
  failed += 1;
  console.log("FAIL  " + label);
}

function mockWx() {
  var store = {};
  global.wx = {
    _store: store,
    setStorageSync: function (key, value) {
      store[key] = JSON.parse(JSON.stringify(value));
    },
    getStorageSync: function (key) {
      if (!Object.prototype.hasOwnProperty.call(store, key)) return "";
      return JSON.parse(JSON.stringify(store[key]));
    },
    removeStorageSync: function (key) {
      delete store[key];
    }
  };
  return store;
}

var store = mockWx();

assert("无 roundId 不写入", posterDraft.savePosterDraft({ step: 2, posterState: {} }) === false);

posterDraft.savePosterDraft({
  roundId: "match-a",
  step: 3,
  templateId: "template1",
  photoPath: "wxfile://usr/poster_photo_match-a.jpg",
  posterState: { templateId: "template1", identity: { nickname: { value: "A" } } }
});
posterDraft.savePosterDraft({
  roundId: "match-b",
  step: 2,
  templateId: "template2",
  posterState: { templateId: "template2" }
});

var loadedA = posterDraft.loadPosterDraft("match-a");
var loadedB = posterDraft.loadPosterDraft("match-b");
assert("按 roundId 读取 A", loadedA && loadedA.step === 3 && loadedA.photoPath.indexOf("poster_photo_match-a") !== -1);
assert("按 roundId 读取 B", loadedB && loadedB.templateId === "template2");
assert("无 roundId 不误读", posterDraft.loadPosterDraft() == null);
assert("分槽存储", store[posterDraft.STORAGE_KEY] && store[posterDraft.STORAGE_KEY]["match-a"] && store[posterDraft.STORAGE_KEY]["match-b"]);

posterDraft.clearPosterDraft("match-a");
assert("只清本场 A", posterDraft.loadPosterDraft("match-a") == null);
assert("不影响 B", posterDraft.loadPosterDraft("match-b") && posterDraft.loadPosterDraft("match-b").step === 2);
assert("无 roundId 不清全部", posterDraft.clearPosterDraft() === false && posterDraft.loadPosterDraft("match-b"));

store[posterDraft.LEGACY_STORAGE_KEY] = {
  roundId: "legacy-1",
  step: 4,
  templateId: "template1",
  posterState: {},
  updatedAt: 99
};
assert("兼容旧单对象", posterDraft.loadPosterDraft("legacy-1") && posterDraft.loadPosterDraft("legacy-1").step === 4);
assert("迁移后移除旧 key", store[posterDraft.LEGACY_STORAGE_KEY] == null);

var root = path.join(__dirname, "..");
var golfPosterSrc = fs.readFileSync(path.join(root, "miniprogram/subpackages/poster/components/golf-poster/index.js"), "utf8");
var createPageSrc = fs.readFileSync(path.join(root, "miniprogram/subpackages/poster/pages/create/index.js"), "utf8");
var createWxml = fs.readFileSync(path.join(root, "miniprogram/subpackages/poster/pages/create/index.wxml"), "utf8");

assert("导出等待相册保存", golfPosterSrc.indexOf("await this._saveToAlbum(tempFilePath)") !== -1);
assert("保存成功才标记完成", golfPosterSrc.indexOf("this._markPosterSaved()") !== -1 && golfPosterSrc.indexOf("_sessionPhase = \"done_share\"") !== -1);
assert("失败回编辑态", golfPosterSrc.indexOf("this._sessionPhase = \"editing\"") !== -1);
assert("分享关闭走同一结束", golfPosterSrc.indexOf("finishCompletedSession") !== -1 && golfPosterSrc.indexOf("closeSharePanel()") !== -1);
assert("微信分享等 complete", golfPosterSrc.indexOf("complete: () => {") !== -1 && golfPosterSrc.indexOf("wx.showShareImageMenu({ path: tempFilePath });") === -1);
assert("不提前 _backToScorePage 于 showShareImageMenu", /showShareImageMenu\(\{[\s\S]*?\}\);\s*this\._backToScorePage\(\)/.test(golfPosterSrc) === false);
assert("返回兜底不用首页", golfPosterSrc.indexOf('url: "/pages/home/index"') === -1);
assert("页面返回不用首页", createPageSrc.indexOf("/pages/home/index") === -1);
assert("三按钮离开", createWxml.indexOf("保存并退出") !== -1 && createWxml.indexOf("不保存退出") !== -1 && createWxml.indexOf("继续编辑") !== -1);
assert("保存并退出检查写入结果", createPageSrc.indexOf("await poster.saveDraft") !== -1 && createPageSrc.indexOf("草稿保存失败") !== -1);
assert("不保存不 clearDraft", createPageSrc.indexOf("clearDraft") === -1 && createPageSrc.indexOf("skipDraftWrite") !== -1);
assert("完成态不弹草稿", createPageSrc.indexOf("phase === 'done_share'") !== -1);
assert("hide 不再自动写草稿", /onHide\(\)\s*\{\s*this\._savePosterDraft/.test(createPageSrc) === false);

if (failed) {
  console.log("FAILED " + failed + " / " + (passed + failed));
  process.exit(1);
}
console.log("OK " + passed + " checks");
