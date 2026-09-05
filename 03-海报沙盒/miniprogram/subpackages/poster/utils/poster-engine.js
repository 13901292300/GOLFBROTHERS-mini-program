const {
  POSTER_WIDTH,
  POSTER_HEIGHT,
  BRAND_HEIGHT,
  TEMPLATES,
  FONT_OPTIONS,
  normalizeFontId
} = require("./poster-data");
const { isCustomColorMode, resolveAndApplyPosterColors } = require("./poster-colors");
const { DATE_MISSING_PLACEHOLDER, formatCalendarDateDotted } = require("./calendar-date");
const {
  parseRelativeScore,
  parseStrokeScore,
  formatRelativeScore
} = require("./score");

function fontFamily(id) {
  const map = {
    playfair: "GOLF_Playfair",
    bodoni: "GOLF_Bodoni",
    cormorant: "Cormorant Garamond",
    anton: "Anton",
    inter: "Inter",
    pingfang: "PingFang SC"
  };
  return map[normalizeFontId(id)] || "PingFang SC";
}

function fontWeight(id) {
  const font = FONT_OPTIONS.find((item) => item.id === normalizeFontId(id));
  return font && font.weight ? font.weight : 700;
}

function fontCss(fontId, sizePx, italic) {
  const style = italic ? "italic " : "";
  return `${style}${fontWeight(fontId)} ${sizePx}px "${fontFamily(fontId)}"`;
}

function centerOf(region) {
  return { x: region.x + region.w / 2, y: region.y + region.h / 2 };
}

function transformedRect(base, transform) {
  const scale = transform.scale || 1;
  return {
    x: transform.x - base.w * scale / 2,
    y: transform.y - base.h * scale / 2,
    w: base.w * scale,
    h: base.h * scale
  };
}

function transformSubRect(rect, base, transform) {
  const scale = transform.scale || 1;
  const baseCenter = centerOf(base);
  const rectCenter = centerOf(rect);
  return {
    x: transform.x + (rectCenter.x - baseCenter.x) * scale - rect.w * scale / 2,
    y: transform.y + (rectCenter.y - baseCenter.y) * scale - rect.h * scale / 2,
    w: rect.w * scale,
    h: rect.h * scale
  };
}

function scoreLabelOffset(label) {
  const text = String(label == null ? "" : label);
  const core = text.replace(/^[+\-\u2212]/, "");
  return {
    offsetX: core === "1" ? 2 : 0,
    offsetY: 1
  };
}

function applyCanvasFont(ctx, cssFont) {
  const value = String(cssFont || "");
  ctx.font = value;
  if (typeof ctx.setFontSize === "function") {
    const match = value.match(/(\d+(?:\.\d+)?)px/);
    if (match) ctx.setFontSize(Number(match[1]));
  }
}

function fitFont(ctx, text, maxWidth, startSize, minSize, fontId, weight, italic) {
  let size = startSize;
  const style = italic ? "italic " : "";
  const fontWeightValue = weight || fontWeight(fontId);
  while (size > minSize) {
    applyCanvasFont(ctx, `${style}${fontWeightValue} ${size}px "${fontFamily(fontId)}"`);
    if (typeof ctx.measureText === "function") {
      if (ctx.measureText(text).width <= maxWidth) break;
    } else {
      break;
    }
    size -= 2;
  }
  applyCanvasFont(ctx, `${style}${fontWeightValue} ${size}px "${fontFamily(fontId)}"`);
  return size;
}

function rgbFromHex(value) {
  const normalized = String(value || "").trim().replace("#", "");
  const hex = normalized.length === 3
    ? normalized.split("").map((character) => character + character).join("")
    : normalized;
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16)
  };
}

function colorLuminance(value) {
  const rgb = rgbFromHex(value);
  if (!rgb) return 0;
  const channels = [rgb.r, rgb.g, rgb.b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function colorContrast(first, second) {
  const light = Math.max(colorLuminance(first), colorLuminance(second));
  const dark = Math.min(colorLuminance(first), colorLuminance(second));
  return (light + 0.05) / (dark + 0.05);
}

function readableColor(background, preferred) {
  if (colorLuminance(background) < 0.28) return "#ffffff";
  if (colorContrast(background, preferred) >= 3) return preferred;
  return colorContrast(background, "#ffffff") >= colorContrast(background, "#101820")
    ? "#ffffff"
    : "#101820";
}

function isLightNeutralBoard(value) {
  const rgb = rgbFromHex(value);
  if (!rgb) return false;
  const channels = [rgb.r, rgb.g, rgb.b];
  const spread = Math.max.apply(null, channels) - Math.min.apply(null, channels);
  return colorLuminance(value) >= 0.68 && spread <= 32;
}

function resolvedColor(model, key, fallback) {
  const colors = model && model.resolvedColors;
  if (colors && colors[key]) return colors[key];
  if (isCustomColorMode(model)) {
    console.warn("[poster-engine] resolvedColors missing key", key, {
      templateId: model && model.templateId,
      colorMode: model && model.colorMode
    });
  }
  return fallback;
}

function scorecardTextColor(style, model) {
  return resolvedColor(model, "scoreText", (style && style.scoreText) || "#ffffff");
}

function imageSource(asset) {
  if (!asset) return "";
  if (typeof asset === "string") return asset;
  return asset.path || asset.src || "";
}

function coverPlacement(asset, model, offsetX, offsetY) {
  const sourceWidth = asset.width || asset.naturalWidth || 1;
  const sourceHeight = asset.height || asset.naturalHeight || 1;
  const areaHeight = POSTER_HEIGHT - BRAND_HEIGHT;
  const coverScale = Math.max(POSTER_WIDTH / sourceWidth, areaHeight / sourceHeight);
  const scale = coverScale * ((model.image && model.image.scale) || 1);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const x = (POSTER_WIDTH - width) / 2 + ((model.image && model.image.x) || 0) + (offsetX || 0);
  const y = BRAND_HEIGHT + (areaHeight - height) / 2 + ((model.image && model.image.y) || 0) + (offsetY || 0);
  return { x: x, y: y, width: width, height: height };
}

function drawCover(ctx, asset, model, offsetX, offsetY) {
  if (!asset) return;
  const drawable = typeof asset === "string" ? asset : (asset.path && typeof asset.complete !== "boolean" ? asset.path : asset);
  const place = coverPlacement(asset, model, offsetX, offsetY);
  ctx.drawImage(drawable, place.x - 1, place.y - 1, place.width + 2, place.height + 2);
}

function drawApproximateBlur(ctx, asset, model, radius) {
  const spread = Math.min(24, Math.max(1, radius));
  const diagonal = spread * 0.72;
  const offsets = [
    [0, 0],
    [spread, 0],
    [-spread, 0],
    [0, spread],
    [0, -spread],
    [diagonal, diagonal],
    [-diagonal, diagonal],
    [diagonal, -diagonal],
    [-diagonal, -diagonal],
    [spread * 0.45, 0],
    [-spread * 0.45, 0],
    [0, spread * 0.45],
    [0, -spread * 0.45]
  ];
  ctx.save();
  ctx.globalAlpha = 1 / offsets.length;
  offsets.forEach((offset) => {
    drawCover(ctx, asset, model, offset[0], offset[1]);
  });
  ctx.restore();
}

function drawPlaceholder(ctx, template, model) {
  const gradient = ctx.createLinearGradient(0, BRAND_HEIGHT, POSTER_WIDTH, POSTER_HEIGHT);
  if (template.tone === "dark") {
    gradient.addColorStop(0, "#25372b");
    gradient.addColorStop(1, "#080b09");
  } else if (template.tone === "soft") {
    gradient.addColorStop(0, "#799c83");
    gradient.addColorStop(1, "#294e37");
  } else {
    gradient.addColorStop(0, "#5f8f70");
    gradient.addColorStop(1, "#183a29");
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, BRAND_HEIGHT, POSTER_WIDTH, POSTER_HEIGHT - BRAND_HEIGHT);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.moveTo(0, 830);
  ctx.lineTo(420, 590);
  ctx.lineTo(1000, 760);
  ctx.lineTo(1000, 1265);
  ctx.lineTo(0, 1265);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = model.style.line;
  ctx.fillRect(0, 600, POSTER_WIDTH, 4);
  ctx.restore();
}

function drawFillCover(ctx, asset) {
  if (!asset) return;
  const drawable = typeof asset === "string" ? asset : (asset.path && typeof asset.complete !== "boolean" ? asset.path : asset);
  const sourceWidth = asset.width || asset.naturalWidth || 1;
  const sourceHeight = asset.height || asset.naturalHeight || 1;
  const areaHeight = POSTER_HEIGHT - BRAND_HEIGHT;
  const coverScale = Math.max(POSTER_WIDTH / sourceWidth, areaHeight / sourceHeight);
  const width = sourceWidth * coverScale;
  const height = sourceHeight * coverScale;
  const x = (POSTER_WIDTH - width) / 2;
  const y = BRAND_HEIGHT + (areaHeight - height) / 2;
  ctx.drawImage(drawable, x - 1, y - 1, width + 2, height + 2);
}

function drawBackground(ctx, template, model) {
  const useSystem = model.backdropMode === "system" && model.backdrop;
  if (useSystem) {
    ctx.save();
    drawFillCover(ctx, model.backdrop);
    ctx.restore();
    return;
  }
  if (!model.photo) {
    drawPlaceholder(ctx, template, model);
    return;
  }
  ctx.save();
  const filters = [];
  if (model.image.blur > 0) filters.push(`blur(${model.image.blur}px)`);
  if (template.tone === "dark") filters.push("brightness(0.62)", "saturate(0.82)", "contrast(1.08)");
  if (template.tone === "soft") filters.push("brightness(1.04)", "saturate(0.78)");
  if (template.tone === "editorial") filters.push("brightness(0.76)", "saturate(0.84)");
  if (template.tone === "natural") filters.push("brightness(0.9)", "saturate(0.94)");
  const supportsFilter = typeof ctx.filter === "string";
  if (filters.length && supportsFilter) ctx.filter = filters.join(" ");
  if (model.image.blur > 0 && !supportsFilter) {
    drawApproximateBlur(ctx, model.photo, model, model.image.blur);
  } else {
    drawCover(ctx, model.photo, model);
  }
  ctx.restore();
  if (template.tone === "soft") {
    ctx.fillStyle = "rgba(242,240,233,0.18)";
    ctx.fillRect(0, BRAND_HEIGHT, POSTER_WIDTH, POSTER_HEIGHT - BRAND_HEIGHT);
  }
}

function drawAtmosphere(ctx, template) {
  if (template.tone === "dark") {
    const gradient = ctx.createLinearGradient(0, 420, 0, POSTER_HEIGHT);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, "rgba(0,0,0,0.74)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 420, POSTER_WIDTH, POSTER_HEIGHT - 420);
    return;
  }
  if (template.tone === "editorial") {
    const gradient = ctx.createLinearGradient(0, 0, 480, 0);
    gradient.addColorStop(0, "rgba(0,0,0,0.48)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, BRAND_HEIGHT, 480, POSTER_HEIGHT - BRAND_HEIGHT);
    return;
  }
  const gradient = ctx.createLinearGradient(0, 520, 0, POSTER_HEIGHT);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, "rgba(0,0,0,0.36)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 520, POSTER_WIDTH, POSTER_HEIGHT - 520);
}

function drawBrand(ctx, model) {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, POSTER_WIDTH, BRAND_HEIGHT);
  ctx.save();
  ctx.translate(54, 18);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, -3, 5, 40);
  ctx.fillStyle = "#c9a13d";
  ctx.beginPath();
  ctx.moveTo(7, -1);
  ctx.lineTo(48, 11);
  ctx.lineTo(7, 23);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const brand = String(model.identity.brand || "GOLFBROTHERS").toUpperCase();
  const split = brand.indexOf("GOLF") === 0 ? 4 : Math.max(3, Math.floor(brand.length * 0.45));
  const first = brand.slice(0, split);
  const second = brand.slice(split);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  applyCanvasFont(ctx, 'italic 700 37px "PingFang SC"');
  ctx.fillStyle = "#ffffff";
  ctx.fillText(first, 120, 35);
  const firstWidth = ctx.measureText(first).width;
  ctx.fillStyle = "#c9a13d";
  ctx.fillText(second, 120 + firstWidth, 35);
  const brandEnd = 120 + firstWidth + ctx.measureText(second).width;
  const lineStart = brandEnd + 32;
  const lineEnd = POSTER_WIDTH - 48;
  if (lineEnd - lineStart >= 28) {
    ctx.beginPath();
    ctx.moveTo(lineStart, 35);
    ctx.lineTo(lineEnd, 35);
    ctx.strokeStyle = "rgba(226,232,236,0.72)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawPreviewSubject(ctx, template) {
  const region = template.layout.subject;
  if (!region) return;
  const centerX = region.x + region.w / 2;
  ctx.save();
  ctx.fillStyle = "rgba(235,239,236,0.94)";
  ctx.beginPath();
  ctx.arc(centerX, region.y + region.h * 0.12, region.w * 0.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(centerX - region.w * 0.18, region.y + region.h * 0.23);
  ctx.quadraticCurveTo(centerX, region.y + region.h * 0.15, centerX + region.w * 0.18, region.y + region.h * 0.23);
  ctx.lineTo(centerX + region.w * 0.27, region.y + region.h * 0.72);
  ctx.lineTo(centerX + region.w * 0.1, region.y + region.h);
  ctx.lineTo(centerX - region.w * 0.1, region.y + region.h);
  ctx.lineTo(centerX - region.w * 0.27, region.y + region.h * 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function createOffscreen2d(width, height) {
  if (typeof wx === "undefined" || typeof wx.createOffscreenCanvas !== "function") return null;
  try {
    const canvas = wx.createOffscreenCanvas({
      type: "2d",
      width: width,
      height: height
    });
    if (!canvas) return null;
    canvas.width = width;
    canvas.height = height;
    return canvas;
  } catch (error) {
    return null;
  }
}

function scanSubjectContact(pixels, sampleW, sampleH) {
  const alphaMin = 28;
  let maxY = -1;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] <= alphaMin) continue;
    const y = Math.floor((i / 4) / sampleW);
    if (y > maxY) maxY = y;
  }
  if (maxY < 0 || maxY / sampleH < 0.58) return null;
  const band = Math.max(1, Math.round(sampleH * 0.05));
  let sumX = 0;
  let count = 0;
  let minX = sampleW;
  let maxX = 0;
  for (let y = Math.max(0, maxY - band); y <= maxY; y += 1) {
    for (let x = 0; x < sampleW; x += 1) {
      const a = pixels[(y * sampleW + x) * 4 + 3];
      if (a <= alphaMin) continue;
      sumX += x;
      count += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }
  if (!count) return null;
  return {
    nx: sumX / count / sampleW,
    ny: maxY / sampleH,
    nw: Math.max(0.16, (maxX - minX + 1) / sampleW),
    maxY: maxY
  };
}

function prepareSubjectShadow(image) {
  const srcW = image && (image.width || image.naturalWidth);
  const srcH = image && (image.height || image.naturalHeight);
  if (!srcW || !srcH) return null;
  const sampleW = 180;
  const sampleH = Math.max(24, Math.round(srcH * sampleW / srcW));
  const silhouette = createOffscreen2d(sampleW, sampleH);
  if (!silhouette) return null;
  const ctx = silhouette.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, sampleW, sampleH);
  ctx.drawImage(image, 0, 0, sampleW, sampleH);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, sampleW, sampleH);
  ctx.globalCompositeOperation = "source-over";
  let pixels = null;
  try {
    pixels = ctx.getImageData(0, 0, sampleW, sampleH).data;
  } catch (error) {
    return null;
  }
  const contact = scanSubjectContact(pixels, sampleW, sampleH);
  if (!contact) return { canvas: silhouette, footCanvas: null, sampleW: sampleW, sampleH: sampleH, foot: null, contact: null };

  const band = Math.max(6, Math.round(sampleH * 0.16));
  const sy = Math.max(0, contact.maxY - band);
  const sh = Math.max(4, Math.min(sampleH - sy, band + 3));
  const pad = 20;
  const footCanvas = createOffscreen2d(sampleW + pad * 2, sh + pad * 2);
  if (footCanvas) {
    const footCtx = footCanvas.getContext("2d");
    if (footCtx) {
      footCtx.clearRect(0, 0, footCanvas.width, footCanvas.height);
      footCtx.drawImage(silhouette, 0, sy, sampleW, sh, pad, pad, sampleW, sh);
    }
  }
  return {
    canvas: silhouette,
    footCanvas: footCanvas,
    sampleW: sampleW,
    sampleH: sampleH,
    foot: { sy: sy, sh: sh, pad: pad },
    contact: contact
  };
}

function measureSubjectContact(image) {
  const prepared = prepareSubjectShadow(image);
  return prepared && prepared.contact ? prepared.contact : null;
}

function drawBlurredImage(ctx, drawable, x, y, width, height, blur, alpha) {
  if (!drawable || !width || !height) return;
  const radius = Math.max(1, blur);
  const supportsFilter = typeof ctx.filter === "string";
  if (supportsFilter) {
    ctx.save();
    ctx.filter = "blur(" + radius + "px)";
    ctx.globalAlpha = alpha;
    ctx.drawImage(drawable, x, y, width, height);
    ctx.restore();
    return;
  }
  const offsets = [
    [0, 0],
    [radius, 0],
    [-radius, 0],
    [0, radius],
    [0, -radius],
    [radius * 0.7, radius * 0.7],
    [-radius * 0.7, radius * 0.7],
    [radius * 0.7, -radius * 0.7],
    [-radius * 0.7, -radius * 0.7]
  ];
  ctx.save();
  ctx.globalAlpha = alpha / offsets.length * 1.35;
  offsets.forEach((offset) => {
    ctx.drawImage(drawable, x + offset[0], y + offset[1], width, height);
  });
  ctx.restore();
}

function drawSubjectShadow(ctx, model) {
  const subject = model && model.subject;
  const shadow = model && model.subjectShadow;
  const contact = (shadow && shadow.contact) || (model && model.subjectContact);
  if (!subject || !contact) return;
  const place = coverPlacement(subject, model);
  const pivotX = place.x + contact.nx * place.width;
  const pivotY = place.y + contact.ny * place.height;
  const footWidth = Math.max(24, contact.nw * place.width);
  const side = Math.max(3, footWidth * 0.06);
  const blur = Math.max(4, footWidth * 0.08);

  if (shadow && shadow.footCanvas && shadow.foot) {
    const scaleX = place.width / shadow.sampleW;
    const scaleY = place.height / shadow.sampleH;
    const pad = shadow.foot.pad;
    const drawW = shadow.footCanvas.width * scaleX;
    const drawH = shadow.footCanvas.height * scaleY;
    const footX = place.x - pad * scaleX;
    const footY = place.y + shadow.foot.sy * scaleY - pad * scaleY;
    ctx.save();
    ctx.translate(pivotX + side, pivotY);
    ctx.scale(1, 0.16);
    ctx.translate(-pivotX, -pivotY);
    drawBlurredImage(ctx, shadow.footCanvas, footX, footY, drawW, drawH, blur, 0.32);
    ctx.restore();
  }

  ctx.save();
  ctx.translate(pivotX + side, pivotY);
  ctx.scale(1, 0.12);
  const radius = Math.max(12, footWidth * 0.22);
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  core.addColorStop(0, "rgba(0,0,0,0.28)");
  core.addColorStop(0.55, "rgba(0,0,0,0.08)");
  core.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSubject(ctx, template, model) {
  if (model.previewSubject) {
    drawPreviewSubject(ctx, template);
  } else if (model.subject && model.segmentationStatus === "person") {
    drawSubjectShadow(ctx, model);
    drawCover(ctx, model.subject, model);
  }
}

function drawTotal(ctx, template, model, bounds) {
  if (!model.total.value) return;
  const fontId = model.total.font || (model.fonts && model.fonts.total);
  const color = model.total.color || model.style.total;
  ctx.save();
  ctx.globalAlpha = model.total.opacity / 100;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  applyCanvasFont(ctx, fontCss(fontId, model.total.size, model.total.italic));
  const metrics = typeof ctx.measureText === "function"
    ? ctx.measureText(model.total.value)
    : { width: 0 };
  ctx.fillText(model.total.value, model.total.x, model.total.y);
  ctx.restore();
  const base = template.layout.total;
  bounds.total = {
    x: model.total.x - Math.max(base.w, metrics.width) / 2,
    y: model.total.y - Math.max(base.h, model.total.size * 0.9) / 2,
    w: Math.max(base.w, metrics.width),
    h: Math.max(base.h, model.total.size * 0.9)
  };
}

function formatToParText(diff) {
  if (!Number.isFinite(diff)) return "";
  if (diff > 0) return "+" + diff;
  return String(diff);
}

function drawRelativeTotal(ctx, model, bounds) {
  if (model.relativeTotalCleared) return;
  const item = model.relativeTotal;
  if (!item) return;
  const text = item.value || formatToParText(Number(model.toPar));
  if (!text) return;
  ctx.save();
  ctx.globalAlpha = (item.opacity != null ? item.opacity : 88) / 100;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = item.color || model.style.relativeTotalColor || "#dc3f4d";
  applyCanvasFont(ctx, fontCss(item.font || "bodoni", item.size, item.italic));
  const metrics = ctx.measureText(text);
  ctx.fillText(text, item.x, item.y);
  ctx.restore();
  bounds.relativeTotal = {
    x: item.x - metrics.width / 2,
    y: item.y - item.size * 0.45,
    w: metrics.width,
    h: item.size * 0.9
  };
}

function scoreGeometry(template, model) {
  const base = template.layout.score;
  const board = transformedRect(base, model.scorecard);
  const columns = base.columns
    ? base.columns.map((column) => transformSubRect(column, base, model.scorecard))
    : null;
  return { base, board, columns, scale: model.scorecard.scale };
}

function drawScoreMarker(ctx, x, y, radius, difference, scoringStyle, style, scale, model) {
  const normalColor = scorecardTextColor(style, model);
  if (difference === 0) return normalColor;

  ctx.save();
  const lineWidth = Math.max(2, 2.5 * scale);

  if (scoringStyle === "dp") {
    let markerColor;
    if (difference <= -2) markerColor = resolvedColor(model, "eagleMarker", style.eagleMarker) || "#f2b321";
    else if (difference === -1) markerColor = resolvedColor(model, "underMarker", style.underMarker) || "#dc3f4d";
    else if (difference === 1) markerColor = resolvedColor(model, "overMarker", style.overMarker) || "#101820";
    else markerColor = resolvedColor(model, "doubleBogeyMarker", style.doubleBogeyMarker) || "#1c75bc";
    ctx.fillStyle = markerColor;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (difference <= -2 || difference >= 2) {
      if (isCustomColorMode(model)) {
        return resolvedColor(model, "extremeScore", style.extremeScoreColor || normalColor);
      }
    }
    return normalColor;
  }

  let markerColor;
  if (difference <= -2) markerColor = resolvedColor(model, "eagleMarker", style.eagleMarker) || "#dc3f4d";
  else if (difference === -1) markerColor = resolvedColor(model, "underMarker", style.underMarker) || "#dc3f4d";
  else if (difference === 1) markerColor = resolvedColor(model, "overMarker", style.overMarker) || "#6b7280";
  else markerColor = resolvedColor(model, "doubleBogeyMarker", style.doubleBogeyMarker) || "#6b7280";

  if (difference <= -2) {
    ctx.fillStyle = markerColor;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  } else if (difference === -1) {
    ctx.strokeStyle = markerColor;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
  } else if (difference === 1) {
    ctx.strokeStyle = markerColor;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.rect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.stroke();
  } else {
    ctx.fillStyle = markerColor;
    ctx.beginPath();
    ctx.rect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.fill();
  }

  ctx.restore();
  if (difference <= -2 || difference >= 2) {
    if (isCustomColorMode(model)) {
      return resolvedColor(model, "extremeScore", style.extremeScoreColor || normalColor);
    }
  }
  return normalColor;
}

function drawScorecard(ctx, template, model, bounds) {
  const geometry = scoreGeometry(template, model);
  const board = geometry.board;
  const columns = geometry.columns;
  const scale = geometry.scale;
  bounds.scorecard = board;
  ctx.save();
  const cardOpacity = Number(model.style && model.style.cardOpacity);
  ctx.globalAlpha = Number.isFinite(cardOpacity)
    ? Math.max(0, Math.min(100, cardOpacity)) / 100
    : (template.scoreStyle === "grid" ? 0.16 : template.scoreStyle === "sidebar" ? 0.68 : 0.88);
  ctx.fillStyle = resolvedColor(model, "card", model.style.card);
  ctx.fillRect(board.x, board.y, board.w, board.h);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = resolvedColor(model, "line", model.style.line);
  ctx.fillStyle = resolvedColor(model, "line", model.style.line);

  const vertical = geometry.base.direction === "vertical";
  const padX = (geometry.base.padX != null ? geometry.base.padX : (vertical ? 12 : 28)) * scale;
  const contentX = board.x + padX;
  const contentW = Math.max(48, board.w - padX * 2);

  if (vertical) {
    const dividerWidth = (geometry.base.dividerWidth || 4) * scale;
    ctx.fillStyle = resolvedColor(
      model,
      "divider",
      (model.style && model.style.dividerColor) || model.style.line
    );
    ctx.fillRect(board.x + board.w / 2 - dividerWidth / 2, board.y, dividerWidth, board.h);
    ctx.fillStyle = resolvedColor(model, "line", model.style.line);
  } else {
    ctx.lineWidth = Math.max(2, 3 * scale);
    ctx.beginPath();
    ctx.moveTo(board.x, board.y + board.h / 2);
    ctx.lineTo(board.x + board.w, board.y + board.h / 2);
    ctx.stroke();
    if (template.scoreStyle === "grid") {
      for (let index = 1; index < 9; index += 1) {
        const x = contentX + contentW / 9 * index;
        ctx.beginPath();
        ctx.moveTo(x, board.y);
        ctx.lineTo(x, board.y + board.h);
        ctx.stroke();
      }
    }
  }

  const cellWidth = vertical ? (columns ? columns[0].w : contentW / 2) : contentW / 9;
  const cellHeight = vertical ? (columns ? columns[0].h / 9 : board.h / 9) : board.h / 2;
  const fontSize = Math.floor(Math.min(
    vertical ? 48 * scale : 44 * scale,
    cellHeight * 0.55,
    cellWidth * 0.58
  ));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const scoreSets = model.scoreSets || {};
  const rawScores = scoreSets[model.scoreMode] || [];
  const scores = (Array.isArray(rawScores) ? rawScores : []).map((s) => {
    if (s === "" || s === null || s === undefined) return null;
    const num = Number(s);
    return Number.isNaN(num) ? null : num;
  });

  scores.forEach((score, index) => {
    const firstHalf = index < 9;
    const slot = index % 9;
    let x;
    let y;
    if (vertical) {
      const column = columns
        ? columns[firstHalf ? 0 : 1]
        : {
          x: board.x + (firstHalf ? 0 : board.w / 2),
          y: board.y,
          w: board.w / 2,
          h: board.h
        };
      x = column.x + column.w / 2;
      y = column.y + column.h / 9 * slot + column.h / 18;
    } else {
      x = contentX + contentW / 9 * slot + contentW / 18;
      y = board.y + board.h / 2 * (firstHalf ? 0 : 1) + board.h / 4;
    }

    const hole = index + 1;
    const radius = Math.min(34 * scale, cellWidth * 0.41, cellHeight * 0.4);
    let label = "";
    let markerDifference = null;
    let scoreColor = scorecardTextColor(model.style, model);
    if (model.scoreMode === "relative") {
      const difference = parseRelativeScore(score);
      if (difference === null) return;
      markerDifference = difference;
      scoreColor = drawScoreMarker(ctx, x, y, radius, difference, model.scoringStyle, model.style, scale, model);
      label = hole === 1 && model.badge ? model.badge : formatRelativeScore(difference);
    } else {
      const strokes = parseStrokeScore(score);
      if (strokes === null) return;
      const pars = Array.isArray(model.holePars) ? model.holePars : [];
      const par = Number(pars[index]);
      const holePar = Number.isFinite(par) && par > 0 ? par : 4;
      const difference = strokes - holePar;
      markerDifference = difference;
      scoreColor = drawScoreMarker(ctx, x, y, radius, difference, model.scoringStyle, model.style, scale, model);
      label = hole === 1 && model.badge ? model.badge : String(strokes);
    }

    const adjustedSize = label.length >= 3 ? fontSize * 0.72 : fontSize;
    const maxWidth = markerDifference !== null && markerDifference !== 0
      ? Math.max(20, (radius - Math.max(4, 5 * scale)) * 1.55)
      : cellWidth * 0.78;
    fitFont(ctx, label, maxWidth, Math.floor(adjustedSize), Math.max(14, Math.floor(fontSize * 0.5)), model.fonts.score, fontWeight(model.fonts.score), Boolean(model.fonts.scoreItalic));
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = scoreColor;
    const nudge = scoreLabelOffset(label);
    ctx.fillText(label, x + nudge.offsetX, y + nudge.offsetY);
  });
  ctx.restore();
}

function formattedDate(value, item) {
  const dotted = formatCalendarDateDotted(value);
  if (dotted) return dotted;
  return (item && item.missingLabel) || DATE_MISSING_PLACEHOLDER;
}

function drawIdentityItem(ctx, region, item, text, bounds, key) {
  if (!region || !text) return;
  const actualRegion = {
    x: item.x - region.w / 2,
    y: item.y - region.h / 2,
    w: region.w,
    h: region.h
  };
  bounds[key] = actualRegion;
  ctx.save();
  ctx.fillStyle = item.color;
  ctx.textBaseline = "middle";
  ctx.textAlign = region.align || "center";
  const drawX = region.align === "left"
    ? actualRegion.x
    : region.align === "right"
      ? actualRegion.x + actualRegion.w
      : item.x;
  fitFont(
    ctx,
    text,
    region.vertical ? region.h : region.w,
    Math.min(item.size, region.vertical ? region.w : region.h),
    10,
    item.font,
    fontWeight(item.font),
    Boolean(item.italic)
  );
  if (region.vertical) {
    ctx.translate(item.x, item.y);
    ctx.rotate(Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText(text, 0, 0);
  } else {
    ctx.fillText(text, drawX, item.y);
  }
  ctx.restore();
}

function drawIdentity(ctx, template, model, bounds) {
  const layout = template.layout;
  drawIdentityItem(ctx, layout.nickname, model.identity.nickname, model.identity.nickname.value, bounds, "nickname");
  const courseParts = [model.identity.course.value].filter(Boolean);
  if (layout.course && layout.course.combinesDate && model.identity.date && !model.identity.date.hidden) {
    courseParts.push(formattedDate(model.identity.date.value, model.identity.date));
  }
  drawIdentityItem(ctx, layout.course, model.identity.course, courseParts.join(" · "), bounds, "course");
  if (layout.date) {
    drawIdentityItem(ctx, layout.date, model.identity.date, formattedDate(model.identity.date.value, model.identity.date), bounds, "date");
  }
  drawIdentityItem(ctx, layout.extra, model.identity.extra, model.identity.extra.value, bounds, "extra");
}

function drawStickers(ctx, model, bounds) {
  model.stickers.forEach((sticker) => {
    if (!sticker.image) return;
    const width = sticker.baseWidth * sticker.scale;
    const height = sticker.baseHeight * sticker.scale;
    const drawable = typeof sticker.image === "string"
      ? sticker.image
      : (sticker.image.path && typeof sticker.image.complete !== "boolean" ? sticker.image.path : sticker.image);
    ctx.drawImage(drawable, sticker.x - width / 2, sticker.y - height / 2, width, height);
    bounds[`sticker:${sticker.id}`] = {
      x: sticker.x - width / 2,
      y: sticker.y - height / 2,
      w: width,
      h: height
    };
  });
}

function drawGuide(ctx, bounds, target) {
  const region = bounds[target];
  if (!region) return;
  ctx.save();
  ctx.strokeStyle = "rgba(0,31,56,0.95)";
  ctx.lineWidth = 8;
  ctx.strokeRect(region.x - 5, region.y - 5, region.w + 10, region.h + 10);
  if (typeof ctx.setLineDash === "function") ctx.setLineDash([14, 9]);
  ctx.strokeStyle = "#ffd100";
  ctx.lineWidth = 4;
  ctx.strokeRect(region.x - 5, region.y - 5, region.w + 10, region.h + 10);
  ctx.restore();
}

function renderPoster(ctx, model, options) {
  const settings = options || {};
  resolveAndApplyPosterColors(model);
  const template = TEMPLATES[model.templateId];
  const bounds = {};
  ctx.clearRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  ctx.fillStyle = "#080b09";
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  ctx.imageSmoothingEnabled = true;

  drawBackground(ctx, template, model);
  bounds.photo = { x: 0, y: BRAND_HEIGHT, w: POSTER_WIDTH, h: POSTER_HEIGHT - BRAND_HEIGHT };
  drawAtmosphere(ctx, template);
  if (model.total.aboveSubject) {
    drawSubject(ctx, template, model);
    drawTotal(ctx, template, model, bounds);
    drawRelativeTotal(ctx, model, bounds);
  } else {
    drawTotal(ctx, template, model, bounds);
    drawRelativeTotal(ctx, model, bounds);
    drawSubject(ctx, template, model);
  }
  drawIdentity(ctx, template, model, bounds);
  drawScorecard(ctx, template, model, bounds);
  drawBrand(ctx, model);
  drawStickers(ctx, model, bounds);
  if (settings.showGuide && settings.guideTarget) drawGuide(ctx, bounds, settings.guideTarget);
  return bounds;
}

function pointInRect(point, rect) {
  return Boolean(rect)
    && point.x >= rect.x
    && point.x <= rect.x + rect.w
    && point.y >= rect.y
    && point.y <= rect.y + rect.h;
}

function hitTest(bounds, point) {
  const stickerKeys = Object.keys(bounds).filter((key) => key.indexOf("sticker:") === 0).reverse();
  const order = stickerKeys.concat(["extra", "date", "course", "nickname", "scorecard", "relativeTotal", "total", "photo"]);
  return order.find((key) => pointInRect(point, bounds[key])) || "";
}

module.exports = {
  renderPoster,
  hitTest,
  prepareSubjectShadow,
  measureSubjectContact,
  isLightNeutralBoard,
  scorecardTextColor,
  transformedRect
};
