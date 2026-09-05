App({
  globalData: {
    env: "cloud1-d5gluh1ode0ef8738",
    currentGameId: "sandbox-round-1",
    cloudReady: false
  },

  onLaunch() {
    this.ensureCloud();
  },

  ensureCloud() {
    if (this.globalData.cloudReady) return true;
    if (!wx.cloud) {
      console.warn("[sandbox] 当前基础库不支持云开发");
      return false;
    }
    const envId = String(this.globalData.env || "").trim();
    if (!envId) return false;
    try {
      wx.cloud.init({
        env: envId,
        traceUser: true
      });
      this.globalData.cloudReady = true;
      return true;
    } catch (error) {
      console.warn("[sandbox] cloud init failed", error);
      return false;
    }
  }
});
