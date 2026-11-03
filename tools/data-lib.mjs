// Pure helpers for tools/build-data.mjs. No file access, so they can be unit-tested directly.
import { normalize } from "../src/model.js";

// RFC 4180 CSV: quoted fields may hold commas, doubled quotes and newlines. Returns an array of
// rows (arrays of strings). A trailing newline does not produce an empty final row.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let fieldStarted = false;
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const endField = () => {
    row.push(field);
    field = "";
    fieldStarted = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"' && !fieldStarted) {
      inQuotes = true;
      fieldStarted = true;
    } else if (char === ",") {
      endField();
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      endRow();
    } else {
      field += char;
      fieldStarted = true;
    }
  }
  if (fieldStarted || field !== "" || row.length) endRow();
  return rows;
}

// Turns parsed CSV rows into objects keyed by the header row.
export function csvObjects(rows) {
  const [header, ...body] = rows;
  return body
    .filter((cells) => cells.length > 1 || cells[0] !== "")
    .map((cells) => Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ""])));
}

// One line of a tab-separated file. GeoNames does not quote, so a plain split is correct.
export function splitTsv(line) {
  return line.replace(/\r$/, "").split("\t");
}

function offsetHours(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(date);
  const name = parts.find((part) => part.type === "timeZoneName")?.value ?? "";
  if (name === "GMT") return 0;
  const match = /^GMT([+\-−])(\d{1,2})(?::(\d{2}))?$/.exec(name);
  if (!match) throw new Error(`Unexpected offset "${name}" for ${timeZone}`);
  const sign = match[1] === "+" ? 1 : -1;
  return sign * (Number(match[2]) + Number(match[3] || 0) / 60);
}

// Standard-time offset from UTC in hours: the smaller of the 1 January and 1 July offsets, which
// is the winter offset in either hemisphere.
export function standardOffsetHours(ianaZone, year = 2026) {
  const january = offsetHours(new Date(Date.UTC(year, 0, 1, 12)), ianaZone);
  const july = offsetHours(new Date(Date.UTC(year, 6, 1, 12)), ianaZone);
  return Math.min(january, july);
}

const LATIN_NAME = /^[\p{Script=Latin}\p{M}\s\-'’.()]+$/u;

// The alternate names worth keeping: written wholly in Latin script, short, free of digits, and
// not just the main name again once accents and punctuation are folded away.
export function latinAlternateNames(name, asciiname, alternates) {
  const list = Array.isArray(alternates) ? alternates : String(alternates ?? "").split(",");
  const seen = new Set([normalize(name), normalize(asciiname)]);
  const kept = [];
  for (const raw of list) {
    const candidate = raw.trim();
    if (!candidate || candidate.length > 40 || /\d/.test(candidate) || !LATIN_NAME.test(candidate)) continue;
    const key = normalize(candidate);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    kept.push(candidate);
  }
  return kept;
}
