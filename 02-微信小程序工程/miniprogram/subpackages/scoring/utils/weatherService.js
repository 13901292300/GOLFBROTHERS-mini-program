/**
 * weatherService —— 实时天气服务（第三方数据源：Open-Meteo，免费、无需 API Key）
 *
 * 说明：
 * - 正式发布需在小程序后台「开发设置 → request 合法域名」加入 https://api.open-meteo.com
 * - 开发者工具可勾选「不校验合法域名」进行调试
 * - 严禁返回静态假数据：网络失败时返回 { ok:false }，由调用方决定占位文案（不伪造天气）
 */

// WMO weather_code → 中文天气状态
function weatherText(code) {
  if (code === 0) return '晴';
  if (code === 1 || code === 2) return '多云';
  if (code === 3) return '阴';
  if (code >= 45 && code <= 48) return '雾';
  if (code >= 51 && code <= 67) return '小雨';
  if (code >= 71 && code <= 77) return '雪';
  if (code >= 80 && code <= 82) return '阵雨';
  if (code >= 85 && code <= 86) return '阵雪';
  if (code >= 95) return '雷阵雨';
  return '多云';
}

/**
 * 获取某经纬度的当前天气
 * @param {{lat:number, lon:number}} coord
 * @returns {Promise<{ok:boolean, text?:string, temp?:number, wind?:number, humidity?:number}>}
 */
function getCurrent(coord) {
  const lat = coord && coord.lat != null ? coord.lat : 39.9042; // 兜底：北京
  const lon = coord && coord.lon != null ? coord.lon : 116.4074;
  const url =
    'https://api.open-meteo.com/v1/forecast?latitude=' + lat +
    '&longitude=' + lon +
    '&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code';

  return new Promise((resolve) => {
    wx.request({
      url: url,
      method: 'GET',
      timeout: 8000,
      success: (res) => {
        const cur = res && res.data && res.data.current;
        if (!cur) {
          resolve({ ok: false });
          return;
        }
        resolve({
          ok: true,
          text: weatherText(cur.weather_code),
          temp: Math.round(cur.temperature_2m),
          wind: Math.round(cur.wind_speed_10m),
          humidity: cur.relative_humidity_2m != null ? Math.round(cur.relative_humidity_2m) : null
        });
      },
      fail: () => resolve({ ok: false })
    });
  });
}

/** 取定位失败时兜底：直接用默认坐标查询当前天气 */
function getCurrentByLocation() {
  return new Promise((resolve) => {
    wx.getLocation({
      type: 'wgs84',
      success: (loc) => resolve(getCurrent({ lat: loc.latitude, lon: loc.longitude })),
      fail: () => resolve(getCurrent(null))
    });
  });
}

module.exports = {
  getCurrent,
  getCurrentByLocation,
  weatherText
};
