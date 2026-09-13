const STORAGE_KEY = "posterDraftsByRound";
const LEGACY_STORAGE_KEY = "posterDraft";

function clonePlain(value) {
  try {
    return JSON.parse(JSON.stringify(value, (key, item) => {
      if (key === "resolvedColors") return undefined;
      if (key === "photo" || key === "subject" || key === "brandLogo" || key === "backdrop") return null;
      // sticker.image 是 Canvas Image；posterState.image 是 {scale,x,y,blur}
      if (key === "image" && item && typeof item === "object" && !("blur" in item)) {
        return null;
      }
      return item;
    }));
  } catch (error) {
    console.warn("[poster-draft] serialize failed", error);
    return null;
  }
}

function _wx() {
  return typeof wx !== "undefined" ? wx : null;
}

function _isDraftRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && value.roundId);
}

function _normalizeMap(raw) {
  const map = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return map;
  Object.keys(raw).forEach((key) => {
    const item = raw[key];
    if (_isDraftRecord(item)) map[String(item.roundId || key)] = item;
  });
  return map;
}

function _readMap() {
  const api = _wx();
  if (!api || typeof api.getStorageSync !== "function") return {};
  let map = {};
  try {
    map = _normalizeMap(api.getStorageSync(STORAGE_KEY));
  } catch (error) {
    console.warn("[poster-draft] load map failed", error);
    map = {};
  }
  try {
    const legacy = api.getStorageSync(LEGACY_STORAGE_KEY);
    if (_isDraftRecord(legacy)) {
      const id = String(legacy.roundId);
      const existing = map[id];
      if (!existing || Number(legacy.updatedAt || 0) >= Number(existing.updatedAt || 0)) {
        map[id] = legacy;
      }
      try {
        api.removeStorageSync(LEGACY_STORAGE_KEY);
      } catch (error) {
        console.warn("[poster-draft] remove legacy failed", error);
      }
      try {
        api.setStorageSync(STORAGE_KEY, map);
      } catch (error) {
        console.warn("[poster-draft] persist migrated map failed", error);
      }
    }
  } catch (error) {
    console.warn("[poster-draft] migrate legacy failed", error);
  }
  return map;
}

function _writeMap(map) {
  const api = _wx();
  if (!api || typeof api.setStorageSync !== "function") return false;
  try {
    api.setStorageSync(STORAGE_KEY, map || {});
    return true;
  } catch (error) {
    console.warn("[poster-draft] save failed", error);
    return false;
  }
}

function savePosterDraft(draftData) {
  if (!draftData || !draftData.roundId) return false;
  const roundId = String(draftData.roundId).trim();
  if (!roundId) return false;
  const payload = {
    roundId: roundId,
    step: Number(draftData.step) || 0,
    templateId: draftData.templateId || "template1",
    photoPath: draftData.photoPath || "",
    photoFileID: draftData.photoFileID || "",
    subjectPath: draftData.subjectPath || "",
    subjectFileID: draftData.subjectFileID || "",
    largeEdit: Boolean(draftData.largeEdit),
    posterState: clonePlain(draftData.posterState) || {},
    updatedAt: draftData.updatedAt || Date.now()
  };
  const map = _readMap();
  map[roundId] = payload;
  return _writeMap(map);
}

function loadPosterDraft(roundId) {
  const id = String(roundId || "").trim();
  if (!id) return null;
  const map = _readMap();
  const draft = map[id];
  return _isDraftRecord(draft) ? draft : null;
}

function clearPosterDraft(roundId) {
  const id = String(roundId || "").trim();
  if (!id) return false;
  const map = _readMap();
  if (!map[id]) return true;
  delete map[id];
  return _writeMap(map);
}

module.exports = {
  STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  savePosterDraft,
  loadPosterDraft,
  clearPosterDraft,
  clonePlain
};
