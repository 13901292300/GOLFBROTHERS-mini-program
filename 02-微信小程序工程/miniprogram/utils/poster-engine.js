const {
  POSTER_WIDTH,
  POSTER_HEIGHT,
  BRAND_HEIGHT,
  TEMPLATES,
  FONT_OPTIONS
} = require("./poster-data");
const {
  parseRelativeScore,
  parseStrokeScore,
  formatRelativeScore
} = require("./score");

function fontFamily(id) {
  const font = FONT_OPTIONS.find((item) => item.id === id);
  return font ? font.family : "Arial";
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

function fitFont(ctx, text, maxWidth, startSize, minSize, fontId, weight, italic) {
  let size = startSize;
  const style = italic ? "italic " : "";
  const fontWeight = weight || 900;
  while (size > minSize) {
    ctx.font = `${style}${fontWeight} ${size}px "${fontFamily(fontId)}"`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  ctx.font = `${style}${fontWeight} ${size}px "${fontFamily(fontId)}"`;
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

function scorecardTextColor(style) {
  return style.scoreText || "#ffffff";
}

function drawCover(ctx, asset, model, offsetX, offsetY) {
  if (!asset) return;
  const sourceWidth = asset.width || asset.naturalWidth || 1;
  const sourceHeight = asset.height || asset.naturalHeight || 1;
  const areaHeight = POSTER_HEIGHT - BRAND_HEIGHT;
  const coverScale = Math.max(POSTER_WIDTH / sourceWidth, areaHeight / sourceHeight);
  const scale = coverScale * model.image.scale;
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const x = (POSTER_WIDTH - width) / 2 + model.image.x + (offsetX || 0);
  const y = BRAND_HEIGHT + (areaHeight - height) / 2 + model.image.y + (offsetY || 0);
  ctx.drawImage(asset, x, y, width, height);
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

function drawBackground(ctx, template, model) {
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
  ctx.font = 'italic 900 37px "Arial"';
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

function drawSubject(ctx, template, model) {
  if (model.previewSubject) {
    drawPreviewSubject(ctx, template);
  } else if (model.subject && model.segmentationStatus === "person") {
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
  ctx.font = `900 ${model.total.size}px "${fontFamily(fontId)}"`;
  const metrics = ctx.measureText(model.total.value);
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
  ctx.font = `700 ${item.size}px "${fontFamily(item.font || "bodoni")}"`;
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

function drawScoreMarker(ctx, x, y, radius, difference, scoringStyle, style, scale) {
  const normalColor = scorecardTextColor(style);
  if (difference === 0) return normalColor;

  ctx.save();
  const lineWidth = Math.max(2, 2.5 * scale);

  if (scoringStyle === "dp") {
    let markerColor;
    if (difference <= -2) markerColor = style.eagleMarker || "#f2b321";
    else if (difference === -1) markerColor = style.underMarker || "#dc3f4d";
    else if (difference === 1) markerColor = style.overMarker || "#101820";
    else markerColor = style.doubleBogeyMarker || "#1c75bc";
    ctx.fillStyle = markerColor;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return readableColor(markerColor, "#ffffff");
  }

  let markerColor;
  if (difference <= -2) markerColor = style.eagleMarker || "#dc3f4d";
  else if (difference === -1) markerColor = style.underMarker || "#dc3f4d";
  else if (difference === 1) markerColor = style.overMarker || "#6b7280";
  else markerColor = style.doubleBogeyMarker || "#6b7280";

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
  return normalColor;
}

function drawScorecard(ctx, template, model, bounds) {
  const geometry = scoreGeometry(template, model);
  const board = geometry.board;
  const columns = geometry.columns;
  const scale = geometry.scale;
  bounds.scorecard = board;
  ctx.save();
  ctx.globalAlpha = template.scoreStyle === "grid" ? 0.16 : template.scoreStyle === "sidebar" ? 0.68 : 0.88;
  ctx.fillStyle = model.style.card;
  ctx.fillRect(board.x, board.y, board.w, board.h);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = model.style.line;
  ctx.fillStyle = model.style.line;

  const vertical = geometry.base.direction === "vertical";
  const padX = (geometry.base.padX != null ? geometry.base.padX : (vertical ? 12 : 28)) * scale;
  const contentX = board.x + padX;
  const contentW = Math.max(48, board.w - padX * 2);

  if (vertical) {
    const dividerWidth = (geometry.base.dividerWidth || 4) * scale;
    ctx.fillRect(board.x + board.w / 2 - dividerWidth / 2, board.y, dividerWidth, board.h);
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
  console.log("[poster-engine] drawScorecard 接收 model.scoreSets =", JSON.stringify(model.scoreSets));
  console.log("[poster-engine] drawScorecard 使用的 scoreMode =", model.scoreMode);
  console.log("[poster-engine] drawScorecard 读取的 scores =", JSON.stringify(scores));

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
    let scoreColor = scorecardTextColor(model.style);
    if (model.scoreMode === "relative") {
      const difference = parseRelativeScore(score);
      if (difference === null) return;
      markerDifference = difference;
      scoreColor = drawScoreMarker(ctx, x, y, radius, difference, model.scoringStyle, model.style, scale);
      label = hole === 1 && model.badge ? model.badge : formatRelativeScore(difference);
    } else {
      const strokes = parseStrokeScore(score);
      if (strokes === null) return;
      const pars = Array.isArray(model.holePars) ? model.holePars : [];
      const par = Number(pars[index]);
      const holePar = Number.isFinite(par) && par > 0 ? par : 4;
      const difference = strokes - holePar;
      markerDifference = difference;
      scoreColor = drawScoreMarker(ctx, x, y, radius, difference, model.scoringStyle, model.style, scale);
      label = hole === 1 && model.badge ? model.badge : String(strokes);
    }

    const adjustedSize = label.length >= 3 ? fontSize * 0.72 : fontSize;
    const maxWidth = markerDifference !== null && markerDifference !== 0
      ? Math.max(20, (radius - Math.max(4, 5 * scale)) * 1.55)
      : cellWidth * 0.78;
    fitFont(ctx, label, maxWidth, Math.floor(adjustedSize), Math.max(14, Math.floor(fontSize * 0.5)), model.fonts.score, 900);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = scoreColor;
    const nudge = scoreLabelOffset(label);
    ctx.fillText(label, x + nudge.offsetX, y + nudge.offsetY);
  });
  ctx.restore();
}

function formattedDate(value) {
  return value ? String(value).replace(/-/g, ".") : "";
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
    key === "nickname" ? 800 : 700,
    Boolean(region.italic)
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
  if (layout.course && layout.course.combinesDate && model.identity.date.value) {
    courseParts.push(formattedDate(model.identity.date.value));
  }
  drawIdentityItem(ctx, layout.course, model.identity.course, courseParts.join(" · "), bounds, "course");
  if (layout.date) {
    drawIdentityItem(ctx, layout.date, model.identity.date, formattedDate(model.identity.date.value), bounds, "date");
  }
  drawIdentityItem(ctx, layout.extra, model.identity.extra, model.identity.extra.value, bounds, "extra");
}

function drawStickers(ctx, model, bounds) {
  model.stickers.forEach((sticker) => {
    if (!sticker.image) return;
    const width = sticker.baseWidth * sticker.scale;
    const height = sticker.baseHeight * sticker.scale;
    ctx.drawImage(sticker.image, sticker.x - width / 2, sticker.y - height / 2, width, height);
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
  const template = TEMPLATES[model.templateId];
  const bounds = {};
  ctx.clearRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
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
  isLightNeutralBoard,
  scorecardTextColor,
  transformedRect
};
