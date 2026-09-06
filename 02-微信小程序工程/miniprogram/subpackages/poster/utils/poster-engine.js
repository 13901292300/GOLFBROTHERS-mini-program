const {
  POSTER_WIDTH,
  POSTER_HEIGHT,
  BRAND_HEIGHT,
  DEFAULT_BRAND_TEXT,
  ensureBrandHeader,
  normalizeBrandAlign,
  TEMPLATES,
  FONT_OPTIONS,
  normalizeFontId,
  paletteLinksActive,
  extremeScoresFollowTotal,
  identityRotation,
  DP_MARKER_DEFAULTS
} = require("./poster-data");
const { DATE_MISSING_PLACEHOLDER, formatCalendarDateDotted } = require("./calendar-date");
const { isCustomColorMode, resolveAndApplyPosterColors } = require("./poster-colors");

function identityTextAlign(region, model) {
  const align = (region && region.align) || "center";
  if (!model || !model.layoutMirrored) return align;
  if (align === "left") return "right";
  if (align === "right") return "left";
  return align;
}
const {
  parseRelativeScore,
  parseStrokeScore,
  formatRelativeScore,
  nineHoleStrokeTotal
} = require("./score");

function fontFamily(id) {
  const map = {
    playfair: "GOLF_Playfair",
    bodoni: "GOLF_Bodoni",
    bodoniRegular: "GOLF_BodoniRegular",
    cormorant: "GOLF_Cormorant",
    anton: "Anton",
    oswald: "GOLF_Oswald",
    paytone: "GOLF_Paytone",
    outfit: "GOLF_Outfit",
    montserrat: "GOLF_Montserrat",
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

function relativeTotalInk(model) {
  return resolvedColor(
    model,
    "relativeTotal",
    (model.relativeTotal && model.relativeTotal.color)
      || (model.style && model.style.relativeTotalColor)
      || "#dc3f4d"
  );
}

function nineHoleLabelInk(model) {
  if (isCustomColorMode(model)) {
    return resolvedColor(
      model,
      "summaryLabel",
      (model.style && model.style.summaryLabelColor) || relativeTotalInk(model)
    );
  }
  const template = TEMPLATES[model && model.templateId];
  if (template && template.summaryFollowsLine) {
    return (model.style && (model.style.line || model.style.dividerColor))
      || (model.total && model.total.color)
      || "#15533a";
  }
  if (template && template.summaryFollowsTotal) {
    return (model.total && model.total.color) || (model.style && model.style.total) || "#15533a";
  }
  if (paletteLinksActive(model)) return relativeTotalInk(model);
  if (model.style && model.style.summaryLabelColor) return model.style.summaryLabelColor;
  return relativeTotalInk(model);
}

function drawTrackedCenteredText(ctx, text, x, y, tracking) {
  const chars = String(text || "").split("");
  if (!chars.length) return;
  const gap = Number(tracking) || 0;
  const widths = chars.map((char) => {
    const metrics = typeof ctx.measureText === "function" ? ctx.measureText(char) : { width: 8 };
    return Math.max(1, metrics.width || 0);
  });
  const total = widths.reduce((sum, width) => sum + width, 0) + gap * (chars.length - 1);
  let cursor = x - total / 2;
  chars.forEach((char, index) => {
    ctx.fillText(char, cursor + widths[index] / 2, y);
    cursor += widths[index] + gap;
  });
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

function scorecardTextColor(style, model) {
  if (model) return resolvedColor(model, "scoreText", (style && style.scoreText) || "#ffffff");
  return (style && style.scoreText) || "#ffffff";
}

function imageSource(asset) {
  if (!asset) return "";
  if (typeof asset === "string") return asset;
  return asset.path || asset.src || "";
}

function subjectMirrorShiftX(model) {
  if (!model || !model.layoutMirrored) return 0;
  const template = TEMPLATES[model.templateId];
  const slot = template && template.layout && template.layout.subject;
  if (!slot) return 0;
  return POSTER_WIDTH / 2 - (slot.x + slot.w / 2);
}

function coverPlacement(asset, model, offsetX, offsetY) {
  const sourceWidth = asset.width || asset.naturalWidth || 1;
  const sourceHeight = asset.height || asset.naturalHeight || 1;
  const areaHeight = POSTER_HEIGHT - BRAND_HEIGHT;
  const coverScale = Math.max(POSTER_WIDTH / sourceWidth, areaHeight / sourceHeight);
  const scale = coverScale * ((model.image && model.image.scale) || 1);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const x = (POSTER_WIDTH - width) / 2
    + ((model.image && model.image.x) || 0)
    + (offsetX || 0)
    + subjectMirrorShiftX(model);
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
  ctx.fillStyle = resolvedColor(model, "line", model.style.line);
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

const BRAND_GOLD = "#c9a13d";
const BRAND_WHITE = "#ffffff";
const BRAND_RULE = "rgba(226,232,236,0.72)";

function brandDisplayText(model) {
  ensureBrandHeader(model);
  const raw = String((model.brandHeader && model.brandHeader.text) || "").trim();
  const title = (raw || DEFAULT_BRAND_TEXT).toUpperCase();
  return title;
}

function brandTextParts(title) {
  const idx = title.indexOf(" ");
  if (idx < 0) return [{ text: title, color: BRAND_WHITE }];
  return [
    { text: title.slice(0, idx), color: BRAND_WHITE },
    { text: " " + title.slice(idx + 1), color: BRAND_GOLD }
  ];
}

function measureBrandParts(ctx, parts) {
  let width = 0;
  for (let i = 0; i < parts.length; i += 1) {
    width += ctx.measureText(parts[i].text).width;
  }
  return width;
}

function drawBrandParts(ctx, parts, x, y) {
  let cursor = x;
  for (let i = 0; i < parts.length; i += 1) {
    ctx.fillStyle = parts[i].color;
    ctx.fillText(parts[i].text, cursor, y);
    cursor += ctx.measureText(parts[i].text).width;
  }
}

function drawBrandRule(ctx, x1, x2, y) {
  if (x2 - x1 < 28) return;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.strokeStyle = BRAND_RULE;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawDefaultBrandMark(ctx, x, yCenter, height) {
  const poleW = 5;
  const poleH = height * 0.72;
  const flagW = height * 0.72;
  const poleY = yCenter - poleH / 2;
  ctx.fillStyle = BRAND_WHITE;
  ctx.fillRect(x, poleY, poleW, poleH);
  ctx.fillStyle = BRAND_GOLD;
  ctx.beginPath();
  ctx.moveTo(x + poleW + 2, poleY + 2);
  ctx.lineTo(x + poleW + 2 + flagW, poleY + poleH * 0.32);
  ctx.lineTo(x + poleW + 2, poleY + poleH * 0.52);
  ctx.closePath();
  ctx.fill();
  return poleW + 2 + flagW;
}

function drawBrand(ctx, model) {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, POSTER_WIDTH, BRAND_HEIGHT);

  ensureBrandHeader(model);
  const header = model.brandHeader;
  const align = normalizeBrandAlign(header && header.align);
  const title = brandDisplayText(model);
  const parts = brandTextParts(title);
  const logo = model && model.brandLogo && header.useCustomLogo ? model.brandLogo : null;
  const padL = 24;
  const padR = 48;
  const innerL = padL;
  const innerR = POSTER_WIDTH - padR;
  const innerW = innerR - innerL;
  const gapLogoText = 16;
  const lineGap = 24;
  const logoH = 42;
  const midY = BRAND_HEIGHT / 2;
  let logoW = 0;
  if (logo) {
    const srcW = Number(logo.width || logo.naturalWidth) || 1;
    const srcH = Number(logo.height || logo.naturalHeight) || 1;
    logoW = Math.max(1, Math.round((logoH * srcW) / srcH));
  } else {
    logoW = 5 + 2 + Math.round(logoH * 0.72);
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const maxTextW = Math.max(80, innerW - logoW - gapLogoText);
  let size = 30;
  applyCanvasFont(ctx, 'italic 700 ' + size + 'px "GOLF_Playfair", "PingFang SC"');
  while (size > 16 && measureBrandParts(ctx, parts) > maxTextW) {
    size -= 1;
    applyCanvasFont(ctx, 'italic 700 ' + size + 'px "GOLF_Playfair", "PingFang SC"');
  }
  const textW = measureBrandParts(ctx, parts);
  const contentW = logoW + gapLogoText + textW;
  let contentX = innerL;
  if (align === "right") contentX = innerR - contentW;
  else if (align === "center") contentX = innerL + (innerW - contentW) / 2;

  const logoY = midY - logoH / 2;
  if (logo) {
    ctx.drawImage(logo, contentX, logoY, logoW, logoH);
  } else {
    drawDefaultBrandMark(ctx, contentX, midY, logoH);
  }
  drawBrandParts(ctx, parts, contentX + logoW + gapLogoText, midY);
  drawBrandRule(ctx, innerL, contentX - lineGap, midY);
  drawBrandRule(ctx, contentX + contentW + lineGap, innerR, midY);
}

function drawPreviewSubject(ctx, template, model) {
  const base = template.layout.subject;
  if (!base) return;
  const region = model && model.layoutMirrored
    ? Object.assign({}, base, { x: POSTER_WIDTH - base.x - base.w })
    : base;
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
    drawPreviewSubject(ctx, template, model);
  } else if (model.subject && model.segmentationStatus === "person") {
    drawSubjectShadow(ctx, model);
    drawCover(ctx, model.subject, model);
  }
}

function drawTotal(ctx, template, model, bounds) {
  if (!model.total || model.total.hidden || !model.total.value) return;
  const fontId = model.total.font || (model.fonts && model.fonts.total);
  const color = resolvedColor(model, "total", model.total.color || model.style.total);
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

function splitToParGlyphs(text) {
  const raw = String(text || "");
  const first = raw.charAt(0);
  if (first === "+" || first === "-" || first === "−") {
    return { sign: first === "-" ? "−" : first, body: raw.slice(1) };
  }
  return { sign: "", body: raw };
}

function textWidth(ctx, text) {
  if (!text) return 0;
  return ctx.measureText(text).width;
}

function toParSignMetrics(size) {
  const bar = Math.max(3, size * 0.1);
  const arm = size * 0.2;
  return { bar: bar, arm: arm, width: arm * 2 };
}

function drawToParSign(ctx, sign, leftX, centerY, size) {
  if (!sign) return;
  const metrics = toParSignMetrics(size);
  const cx = leftX + metrics.width / 2;
  ctx.save();
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  ctx.lineWidth = metrics.bar;
  ctx.strokeStyle = ctx.fillStyle;
  ctx.beginPath();
  ctx.moveTo(cx - metrics.arm, centerY);
  ctx.lineTo(cx + metrics.arm, centerY);
  if (sign === "+") {
    ctx.moveTo(cx, centerY - metrics.arm);
    ctx.lineTo(cx, centerY + metrics.arm);
  }
  ctx.stroke();
  ctx.restore();
}

function drawRelativeTotal(ctx, model, bounds) {
  const item = model.relativeTotal;
  if (!item || item.hidden || model.relativeTotalCleared) return;
  const text = item.value || formatToParText(Number(model.toPar));
  if (!text) return;
  const parts = splitToParGlyphs(text);
  const size = item.size || 64;
  const bodyFont = fontCss(item.font || "bodoni", size, item.italic);
  ctx.save();
  ctx.globalAlpha = (item.opacity != null ? item.opacity : 88) / 100;
  ctx.fillStyle = resolvedColor(model, "relativeTotal", item.color || model.style.relativeTotalColor || "#dc3f4d");
  ctx.textAlign = "left";
  applyCanvasFont(ctx, bodyFont);
  const bodyWidth = textWidth(ctx, parts.body);
  const signMetrics = parts.sign ? toParSignMetrics(size) : { width: 0 };
  const gap = parts.sign && parts.body ? Math.max(2, size * 0.08) : 0;
  const totalWidth = signMetrics.width + gap + bodyWidth;
  const startX = item.x - totalWidth / 2;
  ctx.textBaseline = "middle";
  if (parts.sign) drawToParSign(ctx, parts.sign, startX, item.y, size);
  if (parts.body) ctx.fillText(parts.body, startX + signMetrics.width + gap, item.y);
  ctx.restore();
  bounds.relativeTotal = {
    x: startX,
    y: item.y - size * 0.45,
    w: totalWidth,
    h: size * 0.9
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
  const template = model && TEMPLATES[model.templateId];

  if (scoringStyle === "dp") {
    const systemDp = !isCustomColorMode(model) && template && template.markerLinksToTotal;
    let markerColor;
    if (difference <= -2) markerColor = (systemDp ? DP_MARKER_DEFAULTS.eagleMarker : resolvedColor(model, "eagleMarker", style.eagleMarker)) || "#f2b321";
    else if (difference === -1) markerColor = (systemDp ? DP_MARKER_DEFAULTS.underMarker : resolvedColor(model, "underMarker", style.underMarker)) || "#dc3f4d";
    else if (difference === 1) markerColor = (systemDp ? DP_MARKER_DEFAULTS.overMarker : resolvedColor(model, "overMarker", style.overMarker)) || "#101820";
    else markerColor = (systemDp ? DP_MARKER_DEFAULTS.doubleBogeyMarker : resolvedColor(model, "doubleBogeyMarker", style.doubleBogeyMarker)) || "#1c75bc";
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
    if (template && template.doubleExtremeMarkers) {
      ctx.strokeStyle = markerColor;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, Math.max(radius * 0.62, radius - lineWidth * 2.4), 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = markerColor;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
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
  } else if (template && template.doubleExtremeMarkers) {
    const inset = Math.max(lineWidth * 2.2, radius * 0.28);
    ctx.strokeStyle = markerColor;
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.strokeRect(x - radius + inset, y - radius + inset, Math.max(4, radius * 2 - inset * 2), Math.max(4, radius * 2 - inset * 2));
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
    if (!paletteLinksActive(model)) return normalColor;
    if (extremeScoresFollowTotal(model)) {
      return resolvedColor(model, "extremeScore", style.total || "#15533a");
    }
    return normalColor;
  }
  return normalColor;
}

function drawNineHoleSummaries(ctx, options) {
  const model = options.model;
  const board = options.board;
  const columns = options.columns;
  const scale = options.scale;
  const nickname = model.identity && model.identity.nickname;
  const course = model.identity && model.identity.course;
  const labelFontId = (course && course.font) || (nickname && nickname.font) || "pingfang";
  const labelItalic = course && (course.italic === true || course.italic === false)
    ? Boolean(course.italic)
    : Boolean(nickname && nickname.italic);
  const numberFontId = (model.fonts && (model.fonts.score || model.fonts.score)) || "montserrat";
  const numberItalic = Boolean(model.fonts && (model.fonts.scoreItalic || model.fonts.scoreItalic));
  const labelColor = nineHoleLabelInk(model);
  const template = TEMPLATES[model.templateId];
  let numberColor;
  if (isCustomColorMode(model)) {
    numberColor = resolvedColor(model, "summaryNumber", scorecardTextColor(model.style, model));
  } else {
    numberColor = template && template.summaryFollowsTotal
      ? labelColor
      : template && template.summaryFollowsRelative
        ? labelColor
        : scorecardTextColor(model.style, model);
  }
  const summaries = [
    { label: "FRONT", total: nineHoleStrokeTotal(model, 0), firstHalf: true },
    { label: "BACK", total: nineHoleStrokeTotal(model, 9), firstHalf: false }
  ];
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const scoreLayout = template && template.layout && template.layout.score;
  let sharedLabelY = null;
  let sharedNumberY = null;
  let sharedLabelSize = null;
  let sharedNumberSize = null;
  if (options.vertical && columns && columns[0]) {
    const rowHeight = columns[0].h / 10;
    const rowTop = columns[0].y + rowHeight * 9;
    const maxWidth = columns[0].w * 0.92;
    sharedLabelSize = Math.max(13, Math.min(20 * scale, rowHeight * 0.26, maxWidth / 4.6));
    sharedNumberSize = Math.max(22, Math.min((options.fontSize || 32) * 1.1, rowHeight * 0.46, maxWidth * 0.9));
    const gap = Number.isFinite(Number(scoreLayout && scoreLayout.summaryGap))
      ? Number(scoreLayout.summaryGap) * scale
      : Math.max(8, rowHeight * 0.12);
    sharedLabelY = rowTop + rowHeight * 0.38;
    sharedNumberY = sharedLabelY + gap + sharedNumberSize * 0.78;
  }
  summaries.forEach((item) => {
    let x;
    let labelY;
    let numberY;
    let labelSize;
    let numberSize;
    if (options.vertical) {
      const column = columns
        ? columns[item.firstHalf ? 0 : 1]
        : {
          x: board.x + (item.firstHalf ? 0 : board.w / 2),
          y: board.y,
          w: board.w / 2,
          h: board.h
        };
      x = column.x + column.w / 2;
      labelSize = sharedLabelSize;
      numberSize = sharedNumberSize;
      labelY = sharedLabelY;
      numberY = sharedNumberY;
    } else {
      x = options.contentX + options.contentW / options.totalCols * options.holeCols + options.contentW / (options.totalCols * 2);
      const centerY = board.y + board.h / 2 * (item.firstHalf ? 0 : 1) + board.h / 4;
      const maxWidth = options.cellWidth * 0.96;
      const rowHeight = options.cellHeight;
      labelSize = Math.max(13, Math.min(22 * scale, rowHeight * 0.28, maxWidth / 4.1));
      numberSize = Math.max(22, Math.min((options.fontSize || 32) * 1.15, rowHeight * 0.48, maxWidth * 0.9));
      const gap = Number.isFinite(Number(scoreLayout && scoreLayout.summaryGap))
        ? Number(scoreLayout.summaryGap) * scale
        : Math.max(8, rowHeight * 0.12);
      const stackHeight = labelSize * 0.78 + gap + numberSize * 0.72;
      labelY = centerY - stackHeight / 2 + labelSize * 0.72;
      numberY = centerY + stackHeight / 2 - numberSize * 0.12;
    }
    applyCanvasFont(ctx, fontCss(labelFontId, labelSize, labelItalic));
    ctx.fillStyle = labelColor;
    ctx.fillText(item.label, x, labelY);
    if (item.total == null) return;
    applyCanvasFont(ctx, fontCss(numberFontId, numberSize, numberItalic));
    ctx.fillStyle = numberColor;
    ctx.fillText(String(item.total), x, numberY);
  });
  ctx.restore();
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
  const hideSummaries = Boolean(template.hideNineHoleSummaries);
  const holeCols = 9;
  const totalCols = hideSummaries ? 9 : 10;

  if (vertical) {
    const dividerWidth = (geometry.base.dividerWidth || 4) * scale;
    const dividerInset = (geometry.base.dividerInset != null ? geometry.base.dividerInset : 0) * scale;
    ctx.fillStyle = resolvedColor(
      model,
      "divider",
      (model.style && model.style.dividerColor) || model.style.line
    );
    ctx.fillRect(
      board.x + board.w / 2 - dividerWidth / 2,
      board.y + dividerInset,
      dividerWidth,
      Math.max(0, board.h - dividerInset * 2)
    );
    ctx.fillStyle = resolvedColor(model, "line", model.style.line);
  } else {
    ctx.lineWidth = Math.max(2, 3 * scale);
    ctx.beginPath();
    ctx.moveTo(board.x, board.y + board.h / 2);
    ctx.lineTo(board.x + board.w, board.y + board.h / 2);
    ctx.stroke();
    if (template.scoreStyle === "grid") {
      for (let index = 1; index < totalCols; index += 1) {
        const x = contentX + contentW / totalCols * index;
        ctx.lineWidth = index === holeCols ? Math.max(2.5, 4 * scale) : Math.max(2, 3 * scale);
        ctx.beginPath();
        ctx.moveTo(x, board.y);
        ctx.lineTo(x, board.y + board.h);
        ctx.stroke();
      }
    } else if (!hideSummaries) {
      const x = contentX + contentW / totalCols * holeCols;
      ctx.lineWidth = Math.max(2.5, 4 * scale);
      ctx.beginPath();
      ctx.moveTo(x, board.y);
      ctx.lineTo(x, board.y + board.h);
      ctx.stroke();
    }
  }

  const cellWidth = vertical ? (columns ? columns[0].w : contentW / 2) : contentW / totalCols;
  const cellHeight = vertical ? (columns ? columns[0].h / 10 : board.h / 10) : board.h / 2;
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
      y = column.y + column.h / 10 * slot + column.h / 20;
    } else {
      x = contentX + contentW / totalCols * slot + contentW / (totalCols * 2);
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

  if (!hideSummaries) {
    drawNineHoleSummaries(ctx, {
      model: model,
      board: board,
      columns: columns,
      vertical: vertical,
      contentX: contentX,
      contentW: contentW,
      totalCols: totalCols,
      holeCols: holeCols,
      scale: scale,
      fontSize: fontSize,
      cellWidth: cellWidth,
      cellHeight: cellHeight
    });
  }
  ctx.restore();
}

function formattedDate(value, item) {
  const dotted = formatCalendarDateDotted(value);
  if (dotted) return dotted;
  return (item && item.missingLabel) || DATE_MISSING_PLACEHOLDER;
}

function identityMetaLineSpec(template) {
  const region = template && template.layout && template.layout.course;
  if (!region || !region.metaLine) return null;
  return {
    keys: region.metaKeys && region.metaKeys.length ? region.metaKeys.slice() : ["extra", "course", "date"],
    joiner: region.dateJoiner || " | ",
    region: region
  };
}

function identityMetaText(model, key) {
  const item = model && model.identity && model.identity[key];
  if (!item || item.hidden) return "";
  const raw = key === "date" ? formattedDate(item.value, item) : String(item.value || "").trim();
  return raw;
}

function measureIdentityText(ctx, text, item, size) {
  const fontSize = Number.isFinite(size) ? size : (item && item.size) || 18;
  applyCanvasFont(ctx, fontCss((item && item.font) || "pingfang", fontSize, Boolean(item && item.italic)));
  const metrics = typeof ctx.measureText === "function" ? ctx.measureText(text) : null;
  return Math.max(8, metrics && Number.isFinite(metrics.width) ? metrics.width : String(text).length * fontSize * 0.55);
}

function drawIdentityMetaLine(ctx, template, model, bounds) {
  const spec = identityMetaLineSpec(template);
  if (!spec) return false;
  const parts = spec.keys.map((key) => ({
    key: key,
    item: model.identity[key],
    text: identityMetaText(model, key)
  })).filter((part) => part.item && part.text);
  if (!parts.length) return true;

  const board = scoreGeometry(template, model).board;
  const layoutScore = template.layout.score;
  const layoutCenterY = spec.region.y + spec.region.h / 2;
  const lineY = board.y + board.h + (layoutCenterY - (layoutScore.y + layoutScore.h));
  const lineCenterX = board.x + board.w / 2;
  const joinerStyle = model.identity.course || parts[0].item;
  const sizes = parts.map((part) => Math.max(10, Number(part.item.size) || 18));
  let joinerSize = Math.max(10, Number(joinerStyle.size) || sizes[0]);
  const lineWidth = function () {
    let width = 0;
    parts.forEach((part, index) => {
      if (index) width += measureIdentityText(ctx, spec.joiner, joinerStyle, joinerSize);
      width += measureIdentityText(ctx, part.text, part.item, sizes[index]);
    });
    return width;
  };

  const totalWidth = lineWidth();
  let cursor = lineCenterX - totalWidth / 2;
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  parts.forEach((part, index) => {
    if (index) {
      const joinerWidth = measureIdentityText(ctx, spec.joiner, joinerStyle, joinerSize);
      ctx.fillStyle = joinerStyle.color || part.item.color;
      applyCanvasFont(ctx, fontCss(joinerStyle.font || part.item.font, joinerSize, Boolean(joinerStyle.italic)));
      ctx.fillText(spec.joiner, cursor, lineY);
      cursor += joinerWidth;
    }
    const textWidth = measureIdentityText(ctx, part.text, part.item, sizes[index]);
    const textHeight = Math.max(12, sizes[index] * 0.92);
    ctx.fillStyle = part.item.color;
    applyCanvasFont(ctx, fontCss(part.item.font, sizes[index], Boolean(part.item.italic)));
    ctx.fillText(part.text, cursor, lineY);
    bounds[part.key] = {
      x: cursor,
      y: lineY - textHeight / 2,
      w: textWidth,
      h: textHeight
    };
    cursor += textWidth;
  });
  ctx.restore();
  return true;
}

function drawIdentityItem(ctx, region, item, text, bounds, key, model) {
  if (!region || !text || (item && item.hidden)) return;
  const rotation = identityRotation(item, region);
  const sideways = rotation === 90 || rotation === 270;
  const align = identityTextAlign(region, model);
  const fontSize = Math.max(1, Number(item.size) || 18);
  ctx.save();
  ctx.fillStyle = resolvedColor(model, key, item && item.color);
  ctx.textBaseline = "middle";
  ctx.textAlign = sideways ? "center" : align;
  applyCanvasFont(ctx, fontCss(item.font, fontSize, Boolean(item.italic)));
  const metrics = typeof ctx.measureText === "function" ? ctx.measureText(text) : { width: Math.max(24, text.length * fontSize * 0.55) };
  const textWidth = Math.max(12, metrics.width);
  const textHeight = Math.max(12, fontSize * 0.92);
  if (rotation) {
    bounds[key] = sideways
      ? {
        x: item.x - textHeight / 2,
        y: item.y - textWidth / 2,
        w: textHeight,
        h: textWidth
      }
      : {
        x: item.x - textWidth / 2,
        y: item.y - textHeight / 2,
        w: textWidth,
        h: textHeight
      };
    ctx.translate(item.x, item.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.textAlign = "center";
    ctx.fillText(text, 0, 0);
  } else {
    const actualRegion = {
      x: item.x - region.w / 2,
      y: item.y - region.h / 2,
      w: region.w,
      h: region.h
    };
    const board = (bounds && bounds.scorecard)
      || (model && model.templateId === "template4" ? scoreGeometry(TEMPLATES.template4, model).board : null);
    if (model && model.templateId === "template4" && board && (key === "extra" || key === "course" || key === "date")) {
      const right = board.x + board.w;
      actualRegion.x = right - actualRegion.w;
      actualRegion.y = item.y - region.h / 2;
    }
    bounds[key] = actualRegion;
    const drawX = align === "left"
      ? actualRegion.x
      : align === "right"
        ? actualRegion.x + actualRegion.w
        : item.x;
    ctx.fillText(text, drawX, item.y);
  }
  ctx.restore();
}

function drawIdentity(ctx, template, model, bounds) {
  const layout = template.layout;
  drawIdentityItem(ctx, layout.nickname, model.identity.nickname, model.identity.nickname.value, bounds, "nickname", model);
  if (drawIdentityMetaLine(ctx, template, model, bounds)) return;
  const courseParts = [model.identity.course.value].filter(Boolean);
  if (layout.course && layout.course.combinesDate && model.identity.date && !model.identity.date.hidden) {
    courseParts.push(formattedDate(model.identity.date.value, model.identity.date));
  }
  const courseJoiner = (layout.course && layout.course.dateJoiner) || " · ";
  drawIdentityItem(ctx, layout.course, model.identity.course, courseParts.join(courseJoiner), bounds, "course", model);
  if (layout.date) {
    drawIdentityItem(ctx, layout.date, model.identity.date, formattedDate(model.identity.date.value, model.identity.date), bounds, "date", model);
  }
  drawIdentityItem(ctx, layout.extra, model.identity.extra, model.identity.extra.value, bounds, "extra", model);
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
  const totalAbove = Boolean(model.total && model.total.aboveSubject);
  const scorecardAbove = !model.scorecard || model.scorecard.aboveSubject !== false;
  if (!totalAbove) {
    drawTotal(ctx, template, model, bounds);
    drawRelativeTotal(ctx, model, bounds);
  }
  if (!scorecardAbove) {
    drawScorecard(ctx, template, model, bounds);
  }
  drawSubject(ctx, template, model);
  if (totalAbove) {
    drawTotal(ctx, template, model, bounds);
    drawRelativeTotal(ctx, model, bounds);
  }
  drawIdentity(ctx, template, model, bounds);
  if (scorecardAbove) {
    drawScorecard(ctx, template, model, bounds);
  }
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
