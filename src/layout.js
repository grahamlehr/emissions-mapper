// Pure layout maths for the PNG export. No DOM access, so it can be tested with node:test.

// Fits a source of srcWidth x srcHeight into `area` ({ x, y, width, height }), keeping its
// aspect ratio. The result is centred horizontally and aligned to the top of the area.
export function fitRect(srcWidth, srcHeight, area) {
  if (!(srcWidth > 0) || !(srcHeight > 0)) return { x: area.x, y: area.y, width: 0, height: 0, scale: 0 };
  const scale = Math.min(area.width / srcWidth, area.height / srcHeight);
  const width = srcWidth * scale;
  const height = srcHeight * scale;
  return { x: area.x + (area.width - width) / 2, y: area.y, width, height, scale };
}

// Splits text into lines no wider than maxWidth, breaking at spaces. `measure` returns the
// width of a string. A single word wider than maxWidth is kept whole on its own line.
// With maxLines set, any text that does not fit ends the last line with an ellipsis.
export function wrapText(text, maxWidth, measure, { maxLines = Infinity } = {}) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || measure(candidate) <= maxWidth) current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = truncateText(`${kept[maxLines - 1]} ${lines.slice(maxLines).join(" ")}`, maxWidth, measure);
    return kept;
  }
  return lines;
}

// Shortens text with an ellipsis so that it fits in maxWidth.
export function truncateText(text, maxWidth, measure) {
  const value = String(text);
  if (measure(value) <= maxWidth) return value;
  let end = value.length;
  while (end > 0 && measure(`${value.slice(0, end).trimEnd()}…`) > maxWidth) end -= 1;
  return end > 0 ? `${value.slice(0, end).trimEnd()}…` : "…";
}

// Rows for the exported table: the first `limit` cities (scores arrive lowest total first, so
// a city's rank is its position) plus the selected city if it ranks lower, so the image always
// shows the destination being discussed.
export function exportTableRows(scores, selectedCode, limit = 10) {
  const rows = scores.slice(0, limit).map((score, index) => ({
    rank: index + 1,
    score,
    selected: score.destination.code === selectedCode
  }));
  const extraIndex = scores.findIndex((score, index) => index >= limit && score.destination.code === selectedCode);
  if (extraIndex >= 0) rows.push({ rank: extraIndex + 1, score: scores[extraIndex], selected: true, separated: true });
  return rows;
}

// Row height so that `rowCount` rows (plus a small gap before a separated row) fill `height`,
// capped at maxRowHeight.
export function tableRowHeight(height, rowCount, { maxRowHeight = 56, gap = 10 } = {}) {
  if (rowCount <= 0) return maxRowHeight;
  return Math.min(maxRowHeight, Math.floor((height - gap) / rowCount));
}
