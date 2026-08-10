/**
 * 用户资料国籍 / 地域 MVP 目录（轻量，可替换为完整数据源）。
 * 不用于球队 region；不根据定位推断。
 */

const NATIONALITIES = [
  { code: 'CN', name: '中国' },
  { code: 'US', name: '美国' },
  { code: 'JP', name: '日本' },
  { code: 'KR', name: '韩国' },
  { code: 'AU', name: '澳大利亚' },
  { code: 'CA', name: '加拿大' },
  { code: 'GB', name: '英国' },
  { code: 'DE', name: '德国' },
  { code: 'ES', name: '西班牙' },
  { code: 'SG', name: '新加坡' }
];

/** 演示目录 country 缩写 → 正式 nationality */
const DIRECTORY_COUNTRY_ALIAS = {
  CHN: 'CN',
  USA: 'US',
  ENG: 'GB',
  AUS: 'AU',
  CAN: 'CA',
  GER: 'DE',
  ESP: 'ES',
  JPN: 'JP',
  KOR: 'KR'
};

const CHINA_REGION = {
  countryCode: 'CN',
  countryName: '中国',
  provinces: [
    {
      code: 'BJ',
      name: '北京',
      cities: [{ code: 'BJ-DC', name: '东城区' }, { code: 'BJ-CY', name: '朝阳区' }, { code: 'BJ-HD', name: '海淀区' }]
    },
    {
      code: 'SH',
      name: '上海',
      cities: [{ code: 'SH-PD', name: '浦东新区' }, { code: 'SH-XH', name: '徐汇区' }, { code: 'SH-JA', name: '静安区' }]
    },
    {
      code: 'GD',
      name: '广东',
      cities: [
        { code: 'GD-GZ', name: '广州' },
        { code: 'GD-SZ', name: '深圳' },
        { code: 'GD-ZH', name: '珠海' },
        { code: 'GD-DG', name: '东莞' },
        { code: 'GD-FS', name: '佛山' }
      ]
    },
    {
      code: 'ZJ',
      name: '浙江',
      cities: [{ code: 'ZJ-HZ', name: '杭州' }, { code: 'ZJ-NB', name: '宁波' }, { code: 'ZJ-WZ', name: '温州' }]
    },
    {
      code: 'JS',
      name: '江苏',
      cities: [{ code: 'JS-NJ', name: '南京' }, { code: 'JS-SZ', name: '苏州' }, { code: 'JS-WX', name: '无锡' }]
    },
    {
      code: 'SC',
      name: '四川',
      cities: [{ code: 'SC-CD', name: '成都' }, { code: 'SC-MY', name: '绵阳' }]
    }
  ]
};

function listNationalities() {
  return NATIONALITIES.slice();
}

function findNationalityByCode(code) {
  const key = String(code || '').trim().toUpperCase();
  if (!key) return null;
  const alias = DIRECTORY_COUNTRY_ALIAS[key] || key;
  return NATIONALITIES.find((n) => n.code === alias) || null;
}

function resolveNationalityFromDirectoryCountry(country) {
  const raw = String(country || '').trim();
  if (!raw) return { code: '', name: '' };
  const byCode = findNationalityByCode(raw);
  if (byCode) return { code: byCode.code, name: byCode.name };
  const byName = NATIONALITIES.find((n) => n.name === raw);
  if (byName) return { code: byName.code, name: byName.name };
  return { code: '', name: '' };
}

function listChinaProvinces() {
  return CHINA_REGION.provinces.map((p) => ({ code: p.code, name: p.name }));
}

function listChinaCities(provinceCode) {
  const code = String(provinceCode || '').trim();
  const prov = CHINA_REGION.provinces.find((p) => p.code === code);
  if (!prov) return [];
  return (prov.cities || []).map((c) => ({ code: c.code, name: c.name }));
}

function findChinaProvince(codeOrName) {
  const key = String(codeOrName || '').trim();
  if (!key) return null;
  return (
    CHINA_REGION.provinces.find((p) => p.code === key || p.name === key) || null
  );
}

function findChinaCity(provinceCode, codeOrName) {
  const cities = listChinaCities(provinceCode);
  const key = String(codeOrName || '').trim();
  if (!key) return null;
  return cities.find((c) => c.code === key || c.name === key) || null;
}

/**
 * 展示用地域文案：省 / 市；海外仅国家名。
 */
function formatRegionDisplayName(fields) {
  const f = fields || {};
  const city = String(f.regionCityName || '').trim();
  const province = String(f.regionProvinceName || '').trim();
  const country = String(f.regionCountryName || '').trim();
  const countryCode = String(f.regionCountryCode || '').trim().toUpperCase();
  if (city && province) return province + ' · ' + city;
  if (province) return province;
  if (city) return city;
  if (country && countryCode && countryCode !== 'CN') return country;
  if (country) return country;
  return '';
}

module.exports = {
  NATIONALITIES: NATIONALITIES,
  CHINA_REGION: CHINA_REGION,
  listNationalities: listNationalities,
  findNationalityByCode: findNationalityByCode,
  resolveNationalityFromDirectoryCountry: resolveNationalityFromDirectoryCountry,
  listChinaProvinces: listChinaProvinces,
  listChinaCities: listChinaCities,
  findChinaProvince: findChinaProvince,
  findChinaCity: findChinaCity,
  formatRegionDisplayName: formatRegionDisplayName
};
