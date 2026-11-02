// Draws a shareable PNG of the current comparison with the Canvas 2D API. No libraries, and
// nothing leaves the browser: the map is redrawn from the tile images Leaflet has already loaded.
import { exportTableRows, fitRect, tableRowHeight, truncateText, wrapText } from "./layout.js";

const WIDTH = 1600;
const HEIGHT = 1000;
const PIXEL_RATIO = 2;
const MARGIN = 40;
const INK = "#0e0e0c";
const MUTED = "#55554f";
const WHITE = "#ffffff";
const PAPER = "#f5f5f2";
const ATTRIBUTION =
  "Map data © OpenStreetMap contributors · Factors: UK Government GHG conversion factors 2026 (DESNZ) · grahamlehr.github.io/emissions-mapper";
const TILE_FILTER = "grayscale(1) contrast(1.05) brightness(1.04)";

const fonts = {
  sans: (size, weight = 400) => `${weight} ${size}px Geist, "Helvetica Neue", Helvetica, Arial, sans-serif`,
  mono: (size, weight = 400) => `${weight} ${size}px "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace`
};

function measurer(ctx, font) {
  return (text) => {
    ctx.font = font;
    return ctx.measureText(text).width;
  };
}

// Reports whether the canvas honours ctx.filter (Safari does not).
function supportsFilter(ctx) {
  if (!("filter" in ctx)) return false;
  const before = ctx.filter;
  ctx.filter = "grayscale(1)";
  const sticks = ctx.filter === "grayscale(1)";
  ctx.filter = before;
  return sticks;
}

// Fallback greyscale for browsers without ctx.filter: contrast then brightness, as in TILE_FILTER.
function greyscaleRegion(ctx, x, y, width, height) {
  const image = ctx.getImageData(x, y, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    let grey = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    grey = (grey - 128) * 1.05 + 128;
    grey *= 1.04;
    data[i] = data[i + 1] = data[i + 2] = Math.max(0, Math.min(255, grey));
  }
  ctx.putImageData(image, x, y);
}

// Tile images Leaflet has loaded, lowest zoom level first so detail draws over the top.
function loadedTiles(map) {
  const pane = map.getPane("tilePane");
  const tiles = [...pane.querySelectorAll("img.leaflet-tile")].filter(
    (img) => img.complete && img.naturalWidth > 0
  );
  const level = (img) => Number(img.closest(".leaflet-tile-container")?.style.zIndex) || 0;
  return tiles.sort((a, b) => level(a) - level(b));
}

function drawTiles(ctx, map, mapRect, scale) {
  const container = map.getContainer().getBoundingClientRect();
  const tiles = loadedTiles(map);
  if (!tiles.length) return 0;
  const useFilter = supportsFilter(ctx);
  ctx.save();
  ctx.beginPath();
  ctx.rect(mapRect.x, mapRect.y, mapRect.width, mapRect.height);
  ctx.clip();
  if (useFilter) ctx.filter = TILE_FILTER;
  for (const img of tiles) {
    const rect = img.getBoundingClientRect();
    // A hairline of overlap hides seams between tiles at fractional scales.
    ctx.drawImage(
      img,
      mapRect.x + (rect.left - container.left) * scale - 0.25,
      mapRect.y + (rect.top - container.top) * scale - 0.25,
      rect.width * scale + 0.5,
      rect.height * scale + 0.5
    );
  }
  ctx.restore();
  if (!useFilter) {
    // getImageData works in device pixels and throws if a tile tainted the canvas.
    const r = PIXEL_RATIO;
    greyscaleRegion(ctx, Math.round(mapRect.x * r), Math.round(mapRect.y * r), Math.round(mapRect.width * r), Math.round(mapRect.height * r));
  }
  return tiles.length;
}

function drawHeat(ctx, map, scores, colourFor, radiusFor, toPoint, scale) {
  ctx.save();
  ctx.globalCompositeOperation = "multiply"; // the screen uses mix-blend-mode: multiply
  for (const score of scores) {
    const { lat, lon } = score.destination;
    const centre = toPoint(lat, lon);
    const metres = radiusFor(score);
    // Same conversion as Leaflet: metres to degrees of latitude, then to pixels.
    const north = toPoint(lat + (metres / 6371000) * (180 / Math.PI), lon);
    const radius = Math.abs(centre.y - north.y);
    const colour = colourFor(score);
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = colour;
    ctx.lineWidth = scale;
    ctx.stroke();
  }
  ctx.restore();
}

// Matches .jetlag-zone: a circle of size 46 + 8 per hour of jetlag (capped at 12 h), hatched at 45 degrees.
function drawJetlag(ctx, scores, toPoint, scale) {
  ctx.save();
  ctx.globalAlpha = 0.48;
  for (const score of scores.filter((item) => item.jetlagScore >= 6)) {
    const size = Math.round(46 + Math.min(score.jetlagScore, 12) * 8) * scale;
    const centre = toPoint(score.destination.lat, score.destination.lon);
    ctx.save();
    ctx.translate(centre.x, centre.y);
    ctx.beginPath();
    ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = INK;
    // 5px gap and 2px stripe, as in the CSS gradient.
    for (let x = -size; x < size; x += 7 * scale) ctx.fillRect(x + 5 * scale, -size, 2 * scale, size * 2);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, size / 2 - 0.5 * scale, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(14, 14, 12, 0.28)";
    ctx.lineWidth = scale;
    ctx.stroke();
  }
  ctx.restore();
}

function drawRoutes(ctx, routes, toPoint, scale) {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const trace = (points) => {
    ctx.beginPath();
    points.forEach(([lat, lon], i) => {
      const p = toPoint(lat, lon);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
  };
  routes.forEach((route, index) => {
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.72;
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 2.4 * scale;
    trace(route.points);
    ctx.stroke();
    ctx.globalAlpha = 0.84;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.1 * scale;
    if (index >= 4) ctx.setLineDash([6 * scale, 7 * scale]);
    trace(route.points);
    ctx.stroke();
  });
  ctx.setLineDash([]);
  for (const route of routes) {
    const p = toPoint(route.origin[0], route.origin[1]);
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4 * scale, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 2 * scale;
    ctx.stroke();
  }
  ctx.restore();
}

// Square dot per destination, with a code label unless the on-screen layout hid it.
function drawAirports(ctx, map, scores, selectedCode, colourFor, toPoint, scale) {
  const hidden = new Set(
    [...map.getContainer().querySelectorAll(".airport-marker.label-hidden")].map((el) => el.dataset.code)
  );
  const placed = scores
    .map((score) => ({ score, point: toPoint(score.destination.lat, score.destination.lon) }))
    .sort((a, b) => (a.score.destination.code === selectedCode) - (b.score.destination.code === selectedCode) || a.point.y - b.point.y);
  const labelFont = fonts.mono(11 * scale, 500);
  const measure = measurer(ctx, labelFont);
  for (const { score, point } of placed) {
    const code = score.destination.code;
    const selected = code === selectedCode;
    const size = (selected ? 18 : 14) * scale;
    ctx.fillStyle = selected ? INK : WHITE;
    ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size);
    const inner = size - 4 * scale;
    ctx.fillStyle = colourFor(score);
    ctx.fillRect(point.x - inner / 2, point.y - inner / 2, inner, inner);
    if (hidden.has(code) && !selected) continue;
    const height = 19 * scale;
    const width = measure(code) + 12 * scale;
    const left = point.x + 11 * scale;
    ctx.fillStyle = selected ? INK : WHITE;
    ctx.fillRect(left, point.y - height / 2, width, height);
    ctx.strokeStyle = INK;
    ctx.lineWidth = scale;
    ctx.strokeRect(left + 0.5 * scale, point.y - height / 2 + 0.5 * scale, width - scale, height - scale);
    ctx.font = labelFont;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = selected ? WHITE : INK;
    ctx.fillText(code, left + 6 * scale, point.y + 0.5 * scale);
  }
}

function drawMap(ctx, options, area, withTiles) {
  const { map, scores, selectedCode, layers, colourFor, radiusFor, routes } = options;
  const size = map.getSize();
  const rect = fitRect(size.x, size.y, area);
  const scale = rect.scale;
  const toPoint = (lat, lon) => {
    const p = map.latLngToContainerPoint([lat, lon]);
    return { x: rect.x + p.x * scale, y: rect.y + p.y * scale };
  };
  ctx.fillStyle = "#e6e6e2";
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  const tileCount = withTiles ? drawTiles(ctx, map, rect, scale) : 0;

  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  if (layers.heat) drawHeat(ctx, map, scores, colourFor, radiusFor, toPoint, scale);
  if (layers.jetlag) drawJetlag(ctx, scores, toPoint, scale);
  if (layers.routes) drawRoutes(ctx, routes, toPoint, scale);
  drawAirports(ctx, map, scores, selectedCode, colourFor, toPoint, scale);
  ctx.restore();

  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.x - 0.5, rect.y - 0.5, rect.width + 1, rect.height + 1);
  return { tilesDrawn: tileCount, rect };
}

function drawHeader(ctx, { date, policyLines }) {
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK;
  ctx.font = fonts.sans(30, 600);
  ctx.textAlign = "left";
  ctx.fillText("Host city comparison", MARGIN, 62);
  ctx.font = fonts.mono(14);
  ctx.fillStyle = MUTED;
  ctx.textAlign = "right";
  ctx.fillText(date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), WIDTH - MARGIN, 60);
  ctx.textAlign = "left";
  const font = fonts.mono(13);
  const lines = wrapText(policyLines.join(" · "), WIDTH - MARGIN * 2, measurer(ctx, font), { maxLines: 2 });
  ctx.font = font;
  lines.forEach((line, i) => ctx.fillText(line, MARGIN, 92 + i * 20));
  ctx.fillStyle = INK;
  ctx.fillRect(MARGIN, 128, WIDTH - MARGIN * 2, 2);
}

function drawTable(ctx, { scores, selectedCode, formatTonnes }, area) {
  const { x, y, width, height } = area;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.font = fonts.sans(18, 600);
  ctx.fillText("Top 10 by total flight emissions", x, y + 14);

  const headY = y + 52;
  ctx.font = fonts.mono(11, 500);
  ctx.fillStyle = MUTED;
  const cols = { rank: x + 10, city: x + 52, total: x + width - 118, person: x + width - 10 };
  ctx.fillText("RANK", cols.rank, headY);
  ctx.fillText("CITY", cols.city, headY);
  ctx.textAlign = "right";
  ctx.fillText("TOTAL", cols.total, headY);
  ctx.fillText("PER PERSON", cols.person, headY);
  ctx.fillStyle = INK;
  ctx.fillRect(x, headY + 14, width, 1);

  const rows = exportTableRows(scores, selectedCode, 10);
  const top = headY + 15;
  const rowHeight = tableRowHeight(y + height - top, rows.length);
  let cursor = top;
  for (const row of rows) {
    if (row.separated) cursor += 10;
    const d = row.score.destination;
    const mid = cursor + rowHeight / 2;
    if (row.selected) {
      ctx.fillStyle = INK;
      ctx.fillRect(x, cursor, width, rowHeight);
    } else {
      ctx.fillStyle = "#d9d9d3";
      ctx.fillRect(x, cursor + rowHeight - 1, width, 1);
    }
    const fg = row.selected ? WHITE : INK;
    const sub = row.selected ? "#d9d9d3" : MUTED;
    ctx.textAlign = "left";
    ctx.fillStyle = sub;
    ctx.font = fonts.mono(14, 500);
    ctx.fillText(String(row.rank), cols.rank, mid);
    const codeFont = fonts.mono(12);
    const codeWidth = measurer(ctx, codeFont)(d.code);
    const cityFont = fonts.sans(16, 500);
    const cityRoom = cols.total - 80 - cols.city - codeWidth - 8;
    const city = truncateText(d.city, cityRoom, measurer(ctx, cityFont));
    ctx.font = cityFont;
    ctx.fillStyle = fg;
    ctx.fillText(city, cols.city, mid);
    const cityWidth = ctx.measureText(city).width;
    ctx.font = codeFont;
    ctx.fillStyle = sub;
    ctx.fillText(d.code, cols.city + cityWidth + 8, mid);
    ctx.textAlign = "right";
    ctx.font = fonts.mono(14, 500);
    ctx.fillStyle = fg;
    ctx.fillText(formatTonnes(row.score.totalEmissionsKg), cols.total, mid);
    ctx.fillStyle = sub;
    ctx.fillText(formatTonnes(row.score.averageEmissionsKg), cols.person, mid);
    cursor += rowHeight;
  }
}

function drawFooter(ctx, { dataColours, attribution }) {
  ctx.fillStyle = INK;
  ctx.fillRect(MARGIN, 918, WIDTH - MARGIN * 2, 1);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const y = 946;
  let x = MARGIN;
  ctx.font = fonts.mono(12, 500);
  ctx.fillStyle = MUTED;
  ctx.fillText("LOWER", x, y);
  x += ctx.measureText("LOWER").width + 12;
  for (const colour of dataColours) {
    ctx.fillStyle = colour;
    ctx.fillRect(x, y - 8, 16, 16);
    x += 18;
  }
  x += 10;
  ctx.fillStyle = MUTED;
  ctx.fillText("HIGHER", x, y);
  x += ctx.measureText("HIGHER").width + 28;
  // Hatch key: 28 x 16, 45 degree stripes, as on screen.
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y - 8, 28, 16);
  ctx.clip();
  ctx.fillStyle = INK;
  ctx.translate(x, y + 8);
  ctx.rotate(-Math.PI / 4);
  for (let i = -30; i < 60; i += 6) ctx.fillRect(i + 4, -60, 2, 120);
  ctx.restore();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y - 7.5, 27, 15);
  x += 40;
  ctx.fillStyle = MUTED;
  ctx.fillText("HIGH JETLAG", x, y);

  const font = fonts.mono(11);
  const lines = wrapText(attribution, WIDTH - MARGIN * 2, measurer(ctx, font), { maxLines: 2 });
  ctx.font = font;
  ctx.fillStyle = MUTED;
  lines.forEach((line, i) => ctx.fillText(line, MARGIN, 972 + i * 16));
}

function toBlob(canvas) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG encoding failed"))), "image/png");
    } catch (error) {
      reject(error);
    }
  });
}

function paint(options, withTiles) {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * PIXEL_RATIO;
  canvas.height = HEIGHT * PIXEL_RATIO;
  const ctx = canvas.getContext("2d");
  ctx.scale(PIXEL_RATIO, PIXEL_RATIO);
  ctx.fillStyle = WHITE;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  drawHeader(ctx, options);
  const gap = 32;
  const bodyTop = 152;
  const bodyHeight = 748;
  const inner = WIDTH - MARGIN * 2 - gap;
  const mapWidth = Math.round(inner * 0.62);
  const mapArea = { x: MARGIN, y: bodyTop, width: mapWidth, height: bodyHeight };
  const { tilesDrawn } = drawMap(ctx, options, mapArea, withTiles);
  drawTable(ctx, options, { x: MARGIN + mapWidth + gap, y: bodyTop, width: inner - mapWidth, height: bodyHeight });
  const tilesMissing = !withTiles || tilesDrawn === 0;
  drawFooter(ctx, {
    dataColours: options.dataColours,
    attribution: tilesMissing ? `${ATTRIBUTION} · (map tiles unavailable)` : ATTRIBUTION
  });
  return canvas;
}

// Options: { map, scores, selectedCode, layers: { heat, jetlag, routes }, policyLines, colourFor(score),
// radiusFor(score) (metres), routes: [{ points: [[lat, lon]...], origin: [lat, lon] }], dataColours,
// formatTonnes(kg), date }. Resolves with a 3200 x 2000 PNG Blob. If the tiles taint the canvas
// the map is drawn without them rather than failing.
export async function renderComparisonPng(options) {
  const opts = { date: new Date(), routes: [], ...options };
  try {
    if (document.fonts?.load) {
      await Promise.all([
        document.fonts.load(fonts.sans(16, 500)),
        document.fonts.load(fonts.sans(30, 600)),
        document.fonts.load(fonts.mono(12, 500))
      ]).catch(() => {});
    }
    return await toBlob(paint(opts, true));
  } catch (error) {
    // Typically a SecurityError from a tainted canvas. Redraw with a plain background.
    return toBlob(paint(opts, false));
  }
}
