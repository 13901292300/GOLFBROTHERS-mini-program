/**
 * 球友圈图片宫格 View Model（朋友圈式 1～9）。
 * 只计算布局，不改原图文件、不写 base64。
 */

const CELL_RPX = 210;
const GAP_RPX = 8;
const SINGLE_MAX_W = 420;
const SINGLE_MAX_H_LAND = 360;
const SINGLE_MAX_H_PORT = 560;
const SINGLE_SQUARE = 360;
const EXTREME_LAND_H = 220;
const EXTREME_PORT_W = 280;
const EXTREME_PORT_H = 560;

/** mediaId|path → { width, height }，避免重复 getImageInfo */
const _dimCache = Object.create(null);
/** 正在请求中的 key，防并发重复 */
const _dimPending = Object.create(null);

function _num(v) {
  const n = Number(v);
  return n > 0 && Number.isFinite(n) ? n : 0;
}

function _trim(v) {
  return v == null ? '' : String(v).trim();
}

function _cacheKey(img) {
  const id = _trim(img && img.mediaId);
  if (id) return 'id:' + id;
  const p = _trim(img && (img.path || img.renderPath || img.tempFilePath));
  return p ? 'p:' + p : '';
}

function classifySingleRatio(width, height) {
  const w = _num(width);
  const h = _num(height);
  if (!(w > 0 && h > 0)) return 'square';
  const r = w / h;
  if (r >= 2.2) return 'extreme-landscape';
  if (r <= 0.45) return 'extreme-portrait';
  if (r >= 1.05) return 'landscape';
  if (r <= 0.95) return 'portrait';
  return 'square';
}

function computeSingleBox(width, height) {
  const kind = classifySingleRatio(width, height);
  const w = _num(width);
  const h = _num(height);
  const ratio = w > 0 && h > 0 ? w / h : 1;

  if (kind === 'square') {
    return {
      kind: kind,
      widthRpx: SINGLE_SQUARE,
      heightRpx: SINGLE_SQUARE,
      mode: 'aspectFill'
    };
  }
  if (kind === 'landscape') {
    let boxW = SINGLE_MAX_W;
    let boxH = Math.round(boxW / ratio);
    if (boxH > SINGLE_MAX_H_LAND) {
      boxH = SINGLE_MAX_H_LAND;
      boxW = Math.round(boxH * ratio);
    }
    if (boxW < 200) boxW = 200;
    return { kind: kind, widthRpx: boxW, heightRpx: boxH, mode: 'aspectFit' };
  }
  if (kind === 'extreme-landscape') {
    return {
      kind: kind,
      widthRpx: SINGLE_MAX_W,
      heightRpx: EXTREME_LAND_H,
      mode: 'aspectFill'
    };
  }
  if (kind === 'portrait') {
    let boxH = SINGLE_MAX_H_PORT;
    let boxW = Math.round(boxH * ratio);
    const maxPortW = Math.round(SINGLE_MAX_W * 0.72);
    if (boxW > maxPortW) {
      boxW = maxPortW;
      boxH = Math.round(boxW / ratio);
    }
    if (boxW < 180) boxW = 180;
    return { kind: kind, widthRpx: boxW, heightRpx: boxH, mode: 'aspectFit' };
  }
  return {
    kind: 'extreme-portrait',
    widthRpx: EXTREME_PORT_W,
    heightRpx: EXTREME_PORT_H,
    mode: 'aspectFill'
  };
}

function resolveImageLayout(count) {
  const n = Math.max(0, Math.min(9, Math.floor(Number(count) || 0)));
  if (n <= 0) return '';
  if (n === 1) return 'single';
  if (n === 2) return 'double';
  if (n === 3) return 'triple';
  if (n === 4) return 'quad';
  return 'grid';
}

/**
 * 为一条动态的图片列表生成布局 VM（不修改入参数组对象本身的语义字段以外的副本）。
 */
function buildMomentImageLayout(images) {
  const list = Array.isArray(images) ? images : [];
  const capped = list.slice(0, 9);
  const imageCount = capped.length;
  const imageLayout = resolveImageLayout(imageCount);

  let singleImageClass = '';
  let singleImageStyle = '';
  let singleMode = 'aspectFill';

  if (imageCount === 1) {
    const src = capped[0] || {};
    const box = computeSingleBox(src.width, src.height);
    singleImageClass = 'is-' + box.kind;
    singleImageStyle = 'width:' + box.widthRpx + 'rpx;height:' + box.heightRpx + 'rpx;';
    singleMode = box.mode;
  }

  const laidOut = capped.map(function (img, index) {
    const src = img && typeof img === 'object' ? img : {};
    const cellClass = imageCount === 1 ? singleImageClass : 'is-cell';
    return Object.assign({}, src, {
      previewIndex: index,
      cellClass: cellClass,
      displayMode: imageCount === 1 ? singleMode : 'aspectFill'
    });
  });

  return {
    imageCount: imageCount,
    imageLayout: imageLayout,
    singleImageClass: singleImageClass,
    singleImageStyle: singleImageStyle,
    images: laidOut,
    cellRpx: CELL_RPX,
    gapRpx: GAP_RPX
  };
}

function attachImageLayoutToMomentCard(card) {
  if (!card || typeof card !== 'object') return card;
  const layout = buildMomentImageLayout(card.images || []);
  return Object.assign({}, card, {
    images: layout.images,
    imageCount: layout.imageCount,
    imageLayout: layout.imageLayout,
    singleImageClass: layout.singleImageClass,
    singleImageStyle: layout.singleImageStyle
  });
}

function attachImageLayoutToMomentCards(cards) {
  const list = Array.isArray(cards) ? cards : [];
  return list.map(attachImageLayoutToMomentCard);
}

function getImageInfoAsync(src) {
  return new Promise(function (resolve) {
    const path = _trim(src);
    if (!path) {
      resolve({ width: 0, height: 0 });
      return;
    }
    try {
      wx.getImageInfo({
        src: path,
        success: function (res) {
          resolve({
            width: _num(res && res.width),
            height: _num(res && res.height)
          });
        },
        fail: function () {
          resolve({ width: 0, height: 0 });
        }
      });
    } catch (e) {
      resolve({ width: 0, height: 0 });
    }
  });
}

/**
 * 为缺宽高的图片补齐尺寸（内存缓存）；不在调用方 onShow 全量扫。
 * @returns {Promise<{ width, height }>}
 */
function ensureImageDimensions(img) {
  const src = img && typeof img === 'object' ? img : {};
  const w0 = _num(src.width);
  const h0 = _num(src.height);
  if (w0 > 0 && h0 > 0) {
    return Promise.resolve({ width: w0, height: h0 });
  }
  const key = _cacheKey(src);
  if (key && _dimCache[key] && _dimCache[key].width > 0 && _dimCache[key].height > 0) {
    return Promise.resolve(_dimCache[key]);
  }
  const probe = _trim(src.renderPath || src.path || src.tempFilePath);
  if (!probe || src.unavailable) {
    return Promise.resolve({ width: 0, height: 0 });
  }
  if (key && _dimPending[key]) return _dimPending[key];

  const task = getImageInfoAsync(probe).then(function (dim) {
    if (key) {
      delete _dimPending[key];
      if (dim.width > 0 && dim.height > 0) _dimCache[key] = dim;
    }
    return dim;
  });
  if (key) _dimPending[key] = task;
  return task;
}

/**
 * 发布前：为 tempFiles 补齐 chooseMedia 可能缺失的宽高。
 */
function ensureTempFilesDimensions(tempFiles) {
  const list = Array.isArray(tempFiles) ? tempFiles : [];
  return Promise.all(
    list.map(function (f) {
      const file = f && typeof f === 'object' ? f : { tempFilePath: f };
      return ensureImageDimensions(file).then(function (dim) {
        return Object.assign({}, file, {
          width: dim.width || _num(file.width) || 0,
          height: dim.height || _num(file.height) || 0
        });
      });
    })
  );
}

/**
 * 后台为旧动态缺宽高图片补齐并可选写回 Store（不触发当前页大范围 setData）。
 */
function enrichMissingDimensionsInBackground(images, onPatched) {
  const list = Array.isArray(images) ? images : [];
  const jobs = [];
  list.forEach(function (img) {
    if (!img || img.unavailable) return;
    if (_num(img.width) > 0 && _num(img.height) > 0) return;
    jobs.push(
      ensureImageDimensions(img).then(function (dim) {
        if (!(dim.width > 0 && dim.height > 0)) return null;
        if (typeof onPatched === 'function') {
          onPatched({
            mediaId: img.mediaId,
            path: img.path,
            width: dim.width,
            height: dim.height
          });
        }
        return dim;
      })
    );
  });
  if (!jobs.length) return Promise.resolve({ patched: 0 });
  return Promise.all(jobs).then(function (rows) {
    let patched = 0;
    rows.forEach(function (r) {
      if (r) patched += 1;
    });
    return { patched: patched };
  });
}

module.exports = {
  CELL_RPX: CELL_RPX,
  GAP_RPX: GAP_RPX,
  classifySingleRatio: classifySingleRatio,
  computeSingleBox: computeSingleBox,
  resolveImageLayout: resolveImageLayout,
  buildMomentImageLayout: buildMomentImageLayout,
  attachImageLayoutToMomentCard: attachImageLayoutToMomentCard,
  attachImageLayoutToMomentCards: attachImageLayoutToMomentCards,
  ensureImageDimensions: ensureImageDimensions,
  ensureTempFilesDimensions: ensureTempFilesDimensions,
  enrichMissingDimensionsInBackground: enrichMissingDimensionsInBackground,
  getImageInfoAsync: getImageInfoAsync
};
