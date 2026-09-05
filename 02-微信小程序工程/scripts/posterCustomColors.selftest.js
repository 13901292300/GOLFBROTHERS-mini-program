/**
 * 海报自定义配色：逐元素独立，禁止模板联动覆盖。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/posterCustomColors.selftest.js
 */

var path = require("path");
var posterColors = require("../miniprogram/subpackages/poster/utils/poster-colors.js");
var posterData = require("../miniprogram/subpackages/poster/utils/poster-data.js");
var posterDraft = require("../miniprogram/subpackages/poster/utils/poster-draft.js");
var sandboxRoot = path.join(__dirname, "..", "..", "03-海报沙盒", "miniprogram", "subpackages", "poster", "utils");
var sandboxColors = require(path.join(sandboxRoot, "poster-colors.js"));
var sandboxData = require(path.join(sandboxRoot, "poster-data.js"));

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

function lower(value) {
  return String(value || "").toLowerCase();
}

function uniqueColor(index) {
  var n = ((index + 1) * 17) % 255;
  var hex = (n * 65536 + ((index * 41) % 255) * 256 + ((index * 73) % 255)).toString(16);
  return "#" + ("000000" + hex).slice(-6);
}

function snapshotColors(src) {
  var out = {};
  posterColors.COLOR_ELEMENT_KEYS.forEach(function (key) {
    out[key] = src && src[key] ? String(src[key]) : "";
  });
  return out;
}

function colorsEqual(a, b) {
  return JSON.stringify(snapshotColors(a)) === JSON.stringify(snapshotColors(b));
}

function createLinkedModel() {
  return posterData.createPosterModel("template1", false, "GOLFBROTHERS");
}

function restoreAfterDestroy(model, factory, colorsApi) {
  var serialized = posterDraft.clonePlain(model);
  var merged = Object.assign(factory(), serialized);
  (colorsApi || posterColors).restorePosterColorState(merged);
  return merged;
}

function runIndependenceSuite(label, factory, colorsApi, dataApi) {
  var model = factory();
  dataApi.applyPalette(model, "custom");
  posterColors.COLOR_ELEMENT_KEYS.forEach(function (key, index) {
    var before = snapshotColors(model.customColors);
    var color = uniqueColor(index);
    colorsApi.setCustomElementColor(model, key, color);
    posterColors.COLOR_ELEMENT_KEYS.forEach(function (other) {
      if (other === key) {
        assert(label + " 改 " + key + " 只写自身", lower(model.customColors[other]) === lower(color));
        assert(label + " resolved " + key + " 同步", lower(model.resolvedColors[other]) === lower(color));
      } else {
        assert(label + " 改 " + key + " 不改 " + other, model.customColors[other] === before[other]);
      }
    });
  });
}

var model = createLinkedModel();
assert("新建默认为模板模式", model.colorMode === "template" && model.paletteId !== "custom");

posterData.applyPalette(model, "custom");
assert("点选自定义进入 custom", posterColors.isCustomColorMode(model) && model.paletteId === "custom");
assert("首次自定义会快照当前色", !!(model.customColors && model.customColors.total && model.customColors.course));
assert("自定义初始化后 customColorStateReady", model.customColorStateReady === true);
assert("字段总数为 17", posterColors.COLOR_ELEMENT_KEYS.length === 17);
assert("迁移版本为 2", posterColors.COLOR_SCHEMA_VERSION === 2 && model.colorSchemaVersion === 2);

posterColors.COLOR_ELEMENT_KEYS.forEach(function (key) {
  assert("初始化后 customColors 含 " + key, !!model.customColors[key]);
  assert("初始化后 resolvedColors 含 " + key, !!model.resolvedColors[key]);
});

runIndependenceSuite("02", createLinkedModel, posterColors, posterData);

var pga = createLinkedModel();
posterData.applyPalette(pga, "custom");
var eagle = "#111111";
var birdie = "#222222";
var bogey = "#333333";
var doubleBogey = "#444444";
posterColors.setCustomElementColor(pga, "eagleMarker", eagle);
posterColors.setCustomElementColor(pga, "underMarker", birdie);
posterColors.setCustomElementColor(pga, "overMarker", bogey);
posterColors.setCustomElementColor(pga, "doubleBogeyMarker", doubleBogey);
assert("PGA 老鹰独立", lower(pga.customColors.eagleMarker) === eagle);
assert("PGA 小鸟独立", lower(pga.customColors.underMarker) === birdie);
assert("PGA 柏忌独立", lower(pga.customColors.overMarker) === bogey);
assert("PGA 双柏忌独立", lower(pga.customColors.doubleBogeyMarker) === doubleBogey);
assert("改双柏忌不回写老鹰", lower(pga.customColors.eagleMarker) === eagle);
assert("改双柏忌不回写小鸟", lower(pga.customColors.underMarker) === birdie);

posterData.applyMarkerPreset(pga, "pga");
assert("自定义下 applyMarkerPreset 不绑回 PGA 组色", lower(pga.customColors.eagleMarker) === eagle && lower(pga.customColors.overMarker) === bogey);
posterData.ensureTotalDisplayModel(pga);
assert("自定义下 ensureTotalDisplayModel 不覆盖 PGA 标记", lower(pga.style.eagleMarker) === eagle && lower(pga.style.doubleBogeyMarker) === doubleBogey);

posterColors.setCustomElementColor(pga, "divider", "#555555");
posterColors.setCustomElementColor(pga, "extremeScore", "#666666");
posterColors.setCustomElementColor(pga, "line", "#777777");
posterColors.setCustomElementColor(pga, "scoreText", "#888888");
posterColors.setCustomElementColor(pga, "total", "#999999");
assert("中缝不跟随分隔线", lower(pga.customColors.divider) === "#555555" && lower(pga.customColors.line) === "#777777");
assert("极端分不跟随成绩文字", lower(pga.customColors.extremeScore) === "#666666" && lower(pga.customColors.scoreText) === "#888888");
assert("极端分不跟随总杆", lower(pga.customColors.extremeScore) === "#666666" && lower(pga.customColors.total) === "#999999");
assert("极端分不跟随标记", lower(pga.customColors.extremeScore) === "#666666" && lower(pga.customColors.eagleMarker) === eagle);

var persistSource = createLinkedModel();
posterData.applyPalette(persistSource, "custom");
posterColors.setCustomElementColor(persistSource, "eagleMarker", "#a1a1a1");
posterColors.setCustomElementColor(persistSource, "underMarker", "#b2b2b2");
posterColors.setCustomElementColor(persistSource, "summaryLabel", "#c3c3c3");
posterColors.setCustomElementColor(persistSource, "line", "#d4d4d4");
posterColors.setCustomElementColor(persistSource, "divider", "#e5e5e5");
posterColors.setCustomElementColor(persistSource, "extremeScore", "#f6f6f6");
var saved = posterDraft.clonePlain({
  roundId: "persist-round",
  step: 2,
  templateId: persistSource.templateId,
  posterState: persistSource
});
assert("clonePlain 保留 colorMode", saved.posterState.colorMode === "custom");
assert("clonePlain 保留 customColors", lower(saved.posterState.customColors.eagleMarker) === "#a1a1a1");
assert("clonePlain 保留 colorSchemaVersion", saved.posterState.colorSchemaVersion === 2);
assert("clonePlain 不持久化 resolvedColors", saved.posterState.resolvedColors == null);

var afterDestroy = restoreAfterDestroy(persistSource, createLinkedModel);
assert("销毁重建后仍为自定义", afterDestroy.colorMode === "custom");
assert("销毁重建后老鹰色持久化", lower(afterDestroy.customColors.eagleMarker) === "#a1a1a1");
assert("销毁重建后小鸟色持久化", lower(afterDestroy.customColors.underMarker) === "#b2b2b2");
assert("销毁重建后分区标题持久化", lower(afterDestroy.customColors.summaryLabel) === "#c3c3c3");
assert("销毁重建后线色持久化", lower(afterDestroy.customColors.line) === "#d4d4d4");
assert("销毁重建后中缝持久化", lower(afterDestroy.customColors.divider) === "#e5e5e5");
assert("销毁重建后极端分数字持久化", lower(afterDestroy.customColors.extremeScore) === "#f6f6f6");
assert("销毁重建后 resolved 与 custom 一致", colorsEqual(afterDestroy.resolvedColors, afterDestroy.customColors));

var conflict = createLinkedModel();
posterData.applyPalette(conflict, "custom");
posterColors.setCustomElementColor(conflict, "total", "#112233");
posterColors.setCustomElementColor(conflict, "divider", "#445566");
posterColors.setCustomElementColor(conflict, "extremeScore", "#778899");
var staleDraft = JSON.parse(JSON.stringify(conflict));
staleDraft.resolvedColors = Object.assign({}, conflict.resolvedColors, {
  total: "#999999",
  divider: "#888888",
  extremeScore: "#777777"
});
staleDraft.colorSchemaVersion = 1;
staleDraft.customColorStateReady = true;
var reentered = Object.assign(createLinkedModel(), staleDraft);
posterColors.restorePosterColorState(reentered);
assert("冲突草稿以 customColors 总杆为准", lower(reentered.resolvedColors.total) === "#112233");
assert("冲突草稿以 customColors 中缝为准", lower(reentered.resolvedColors.divider) === "#445566");
assert("冲突草稿以 customColors 极端分为准", lower(reentered.resolvedColors.extremeScore) === "#778899");
assert("重新进入后版本升到当前", reentered.colorSchemaVersion === posterColors.COLOR_SCHEMA_VERSION);

var partial = posterData.createPosterModel("template1", false, "GOLFBROTHERS");
partial.colorMode = "custom";
partial.paletteId = "custom";
partial.colorSchemaVersion = 1;
partial.customColorStateReady = true;
partial.customColors = { total: "#abcabc", line: "#defdef" };
posterColors.ensurePosterColorState(partial);
assert("旧版本补齐中缝且保留总杆", lower(partial.customColors.total) === "#abcabc" && !!partial.customColors.divider);
assert("旧版本补齐极端分且保留线色", lower(partial.customColors.line) === "#defdef" && !!partial.customColors.extremeScore);
var afterPartial = snapshotColors(partial.customColors);
posterColors.resolveAndApplyPosterColors(partial);
assert("版本补齐后再次渲染不覆盖用户色", colorsEqual(partial.customColors, afterPartial));

var migrate = posterData.createPosterModel("template3", false, "GOLFBROTHERS");
migrate.paletteId = "custom";
migrate.colorMode = undefined;
migrate.customColors = undefined;
migrate.customColorStateReady = false;
migrate.colorSchemaVersion = 0;
migrate.style.card = "#abcdef";
migrate.identity.course.color = "#123456";
posterColors.ensurePosterColorState(migrate);
var migrated = snapshotColors(migrate.customColors);
migrate.style.card = "#ffffff";
migrate.identity.course.color = "#000000";
posterColors.resolveAndApplyPosterColors(migrate);
posterColors.resolveAndApplyPosterColors(migrate);
assert("旧版 paletteId=custom 迁移为 colorMode", migrate.colorMode === "custom");
assert("旧版明确颜色优先保留底板", lower(migrate.customColors.card) === "#abcdef");
assert("旧版明确颜色优先保留球场", lower(migrate.customColors.course) === "#123456");
assert("迁移只执行一次，后续渲染不覆盖", colorsEqual(migrate.customColors, migrated));
assert("二次 resolve 不丢 schema 版本", migrate.colorSchemaVersion === posterColors.COLOR_SCHEMA_VERSION);

var liveAfterReady = createLinkedModel();
posterData.applyPalette(liveAfterReady, "custom");
var readySnap = snapshotColors(liveAfterReady.customColors);
liveAfterReady.style.total = "#010101";
posterColors.resolvePosterColors(liveAfterReady);
assert("ready 后改 live style 不回写 customColors", colorsEqual(liveAfterReady.customColors, readySnap));

var preview = posterColors.resolvePosterColors(pga);
var exported = posterColors.resolvePosterColors(pga);
assert("预览与导出 resolvedColors 相同", JSON.stringify(preview) === JSON.stringify(exported));
posterColors.resolveAndApplyPosterColors(pga);
assert("apply 后 resolvedColors 与 resolve 相同", JSON.stringify(pga.resolvedColors) === JSON.stringify(preview));

var templateModel = createLinkedModel();
var firstPalette = templateModel.paletteId;
posterData.applyPalette(templateModel, posterData.TEMPLATES.template1.paletteIds[1] || firstPalette);
assert("模板配色仍可切换 palette", templateModel.colorMode === "template" && templateModel.paletteId !== "custom");

var linked = createLinkedModel();
posterData.applyPalette(linked, posterData.TEMPLATES.template1.paletteIds[0]);
assert("模板 palette 仍可同时写入 PGA 标记", !!linked.style.eagleMarker && !!linked.style.underMarker);

var templateLink = posterData.createPosterModel("template1", false, "GOLFBROTHERS");
posterData.applyPalette(templateLink, "navySilver");
assert("模板切换后仍为 template 模式", templateLink.colorMode === "template" && templateLink.paletteId === "navySilver");
assert("template1 palette 仍联动标记色", lower(templateLink.style.eagleMarker) === "#ffffff" && lower(templateLink.style.underMarker) === "#ffffff");
posterData.applyLinkedColor(templateLink, "total", "#abcdef");
assert("模板 total 联动仍写入 extremeScore", lower(templateLink.style.extremeScoreColor) === "#abcdef");
assert("模板联动不进入 custom", templateLink.colorMode === "template");

var template3 = posterData.createPosterModel("template3", false, "GOLFBROTHERS");
var t3Palette = posterData.TEMPLATES.template3.paletteIds[0];
posterData.applyPalette(template3, t3Palette);
assert("template3 底板仍跟随总杆", lower(template3.style.card) === lower(template3.style.total));
assert("template3 仍为模板模式", template3.colorMode === "template");

assert("expandUiColorKey 不再绑定 PGA 组", posterColors.expandUiColorKey("eagleMarker")[0] === "eagleMarker" && posterColors.expandUiColorKey("pgaUnder")[0] === "pgaUnder");

var missing = posterColors.resolvePosterColors({
  colorMode: "custom",
  customColors: { total: "#010101" },
  style: {},
  identity: {}
});
assert("缺失字段才用默认值", lower(missing.total) === "#010101");
assert("默认值不来自其他元素", missing.course === posterColors.DEFAULT_CUSTOM_COLORS.course);
posterColors.COLOR_ELEMENT_KEYS.forEach(function (key) {
  assert("fallback 后 resolved 仍含 " + key, !!missing[key]);
});

assert("沙盒 poster-colors 键集合一致", sandboxColors.COLOR_ELEMENT_KEYS.join(",") === posterColors.COLOR_ELEMENT_KEYS.join(","));
assert("沙盒 schema 常量一致", sandboxColors.COLOR_SCHEMA_VERSION === posterColors.COLOR_SCHEMA_VERSION);

var sandboxModel = sandboxData.createPosterModel("academy", false, "GOLFBROTHERS");
assert("沙盒新建为模板模式", sandboxModel.colorMode === "template");
sandboxData.applyPalette(sandboxModel, "custom");
assert("沙盒可进入自定义", sandboxColors.isCustomColorMode(sandboxModel));
sandboxColors.setCustomElementColor(sandboxModel, "eagleMarker", "#aaaaaa");
sandboxColors.setCustomElementColor(sandboxModel, "underMarker", "#bbbbbb");
sandboxColors.setCustomElementColor(sandboxModel, "divider", "#cccccc");
sandboxColors.setCustomElementColor(sandboxModel, "extremeScore", "#dddddd");
assert("沙盒 PGA 标记独立", lower(sandboxModel.customColors.eagleMarker) === "#aaaaaa" && lower(sandboxModel.customColors.underMarker) === "#bbbbbb");
assert("沙盒中缝独立", lower(sandboxModel.customColors.divider) === "#cccccc" && lower(sandboxModel.customColors.line) !== "#cccccc");
assert("沙盒极端分独立", lower(sandboxModel.customColors.extremeScore) === "#dddddd" && lower(sandboxModel.customColors.scoreText) !== "#dddddd");
assert("沙盒 schema 版本写入模型", sandboxModel.colorSchemaVersion === 2);
sandboxData.applyMarkerPreset(sandboxModel, "pga");
assert("沙盒自定义下标记预设不覆盖", lower(sandboxModel.customColors.eagleMarker) === "#aaaaaa");

var sandboxRestored = restoreAfterDestroy(sandboxModel, function () {
  return sandboxData.createPosterModel("academy", false, "GOLFBROTHERS");
}, sandboxColors);
assert("沙盒销毁重建后持久化老鹰色", lower(sandboxRestored.customColors.eagleMarker) === "#aaaaaa");
assert("沙盒销毁重建后小鸟仍独立", lower(sandboxRestored.customColors.underMarker) === "#bbbbbb");
assert("沙盒销毁重建后中缝持久化", lower(sandboxRestored.customColors.divider) === "#cccccc");
assert("沙盒销毁重建后极端分持久化", lower(sandboxRestored.customColors.extremeScore) === "#dddddd");

runIndependenceSuite("sandbox", function () {
  return sandboxData.createPosterModel("academy", false, "GOLFBROTHERS");
}, sandboxColors, sandboxData);

console.log("");
console.log(failed ? "FAILED " + failed + " / " + (passed + failed) : "OK  " + passed + " passed");
process.exit(failed ? 1 : 0);
