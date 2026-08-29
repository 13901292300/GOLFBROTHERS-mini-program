const STORAGE_KEY = "posterDraft";

function clonePlain(value) {
  try {
    return JSON.parse(JSON.stringify(value, (key, item) => {
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

function savePosterDraft(draftData) {
  if (!draftData || !draftData.roundId) return false;
  const payload = {
    roundId: String(draftData.roundId),
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
  try {
    wx.setStorageSync(STORAGE_KEY, payload);
    return true;
  } catch (error) {
    console.warn("[poster-draft] save failed", error);
    return false;
  }
}

function loadPosterDraft() {
  try {
    const draft = wx.getStorageSync(STORAGE_KEY);
    return draft && typeof draft === "object" ? draft : null;
  } catch (error) {
    console.warn("[poster-draft] load failed", error);
    return null;
  }
}

function clearPosterDraft() {
  try {
    wx.removeStorageSync(STORAGE_KEY);
  } catch (error) {
    console.warn("[poster-draft] clear failed", error);
  }
}

module.exports = {
  STORAGE_KEY,
  savePosterDraft,
  loadPosterDraft,
  clearPosterDraft,
  clonePlain
};
