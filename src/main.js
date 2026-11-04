import { panPadding, pickVisibleLabels } from "./labels.js";
import { renderComparisonPng } from "./snapshot.js";
import {
  AIRPORTS,
  DESNZ_2026,
  SAMPLE_ROWS,
  assumptionLines,
  airportByCode,
  hostByCode,
  comparisonCsv,
  installDataset,
  installPlaces,
  placesInstalled,
  guessAirport,
  findAirport,
  buildGroups,
  normalizeImportedRow,
  normalize,
  parseCsv,
  scoreAll,
  sortScores
} from "./model.js";

// Heat and marker colours, lowest to highest emissions. These mirror Signal's tokens
// (green-500, amber-500, red-500, red-800); Leaflet needs literal colours, so they live here.
// Keep the legend swatches in src/styles.css in step.
const DATA_COLOURS = ["#1fe070", "#ffb000", "#ff3b1f", "#8f1a08"];


const state = {
  groups: [],
  scores: [],
  selectedCode: "AMS",
  shortlist: { codes: [], only: false },
  fittedShortlist: "",
  mapReady: false,
  map: null,
  mapLayers: {
    heat: null,
    jetlag: null,
    routes: null,
    airports: null
  },
  layers: {
    heat: true,
    jetlag: true,
    routes: false
  },
  view: "map",
  pendingReveal: false,
  labelFrame: 0,
  table: { sortKey: "total", direction: "asc", showAll: false }
};

const TABLE_LIMIT = 10;

// Holds shortlisted airport codes and the "only" switch, never attendee data.
const SHORTLIST_KEY = "emissionsMapper.shortlist";

function loadShortlist() {
  try {
    const saved = JSON.parse(localStorage.getItem(SHORTLIST_KEY));
    if (!saved || !Array.isArray(saved.codes)) return;
    const codes = [];
    for (const code of saved.codes) {
      if (typeof code === "string" && hostByCode(code) && !codes.includes(code)) codes.push(code);
    }
    state.shortlist.codes = codes;
    state.shortlist.only = Boolean(saved.only) && codes.length > 0;
  } catch {
    // Storage can be blocked or hold junk; start with an empty shortlist.
  }
}

function saveShortlist() {
  try {
    localStorage.setItem(SHORTLIST_KEY, JSON.stringify({ codes: state.shortlist.codes, only: state.shortlist.only }));
  } catch {
    // Not being able to remember the shortlist is not worth interrupting anyone for.
  }
}

// findAirport now accepts any airport, but the shortlist only scores hosts until PR D widens it.
function hostOnly(airport) {
  return airport ? hostByCode(airport.code) : null;
}

function isFiltering() {
  return state.shortlist.only && state.shortlist.codes.length > 0;
}

function shortlistCityNames() {
  return isFiltering() ? state.shortlist.codes.map((code) => airportByCode(code).city) : [];
}

// Columns of the comparison table. `text` columns sort A to Z first; numbers sort lowest first.
const TABLE_COLUMNS = [
  { key: "city", label: "City", numeric: false },
  { key: "total", label: "Total t CO2e", numeric: true },
  { key: "perPerson", label: "Per person", numeric: true },
  { key: "hours", label: "Avg flight", numeric: true },
  { key: "jetlag", label: "Avg jetlag", numeric: true },
  { key: "severeJetlag", label: "\u2265 6 h jetlag", numeric: true },
  { key: "business", label: "Business class", numeric: true }
];

const els = {
  file: document.querySelector("#attendeeFile"),
  fileMessage: document.querySelector("#fileMessage"),
  loadDemo: document.querySelector("#loadDemoButton"),
  threshold: document.querySelector("#businessThreshold"),
  policyValue: document.querySelector("#policyValue"),
  policyText: document.querySelector("#policyText"),
  factorInputs: [...document.querySelectorAll("[data-factor]")],
  resetFactors: document.querySelector("#resetFactors"),
  customTag: document.querySelector("#customTag"),
  methodFactors: document.querySelector("#methodFactors tbody"),
  methodNonCo2: document.querySelector("#methodNonCo2"),
  methodTrips: document.querySelector("#methodTrips"),
  nonCo2: document.querySelector("#nonCo2Toggle"),
  returnTrip: document.querySelector("#returnTripToggle"),
  groupCount: document.querySelector("#groupCount"),
  peopleCount: document.querySelector("#peopleCount"),
  bestCity: document.querySelector("#bestCity"),
  bestEmissions: document.querySelector("#bestEmissions"),
  jetlagShare: document.querySelector("#jetlagShare"),
  notices: [...document.querySelectorAll("[data-notice]")],
  reviewList: document.querySelector("#reviewList"),
  map: document.querySelector("#worldMap"),
  selectedName: document.querySelector("#selectedName"),
  selectedEmissions: document.querySelector("#selectedEmissions"),
  selectedPerPerson: document.querySelector("#selectedPerPerson"),
  selectedFlight: document.querySelector("#selectedFlight"),
  selectedJetlag: document.querySelector("#selectedJetlag"),
  topDrivers: document.querySelector("#topDrivers"),
  heatToggle: document.querySelector("#heatToggle"),
  jetlagToggle: document.querySelector("#jetlagToggle"),
  routesToggle: document.querySelector("#routesToggle"),
  mapTab: document.querySelector("#mapTab"),
  tableTab: document.querySelector("#tableTab"),
  mapControls: document.querySelector("#mapControls"),
  mapPanel: document.querySelector("#mapPanel"),
  destinationCard: document.querySelector("#destinationCard"),
  tablePanel: document.querySelector("#tablePanel"),
  tableMeta: document.querySelector("#tableMeta"),
  tableScroll: document.querySelector("#tableScroll"),
  tableToggle: document.querySelector("#tableToggle"),
  downloadCsv: document.querySelector("#downloadCsv"),
  downloadPng: document.querySelector("#downloadPng"),
  printTable: document.querySelector("#printTable"),
  printDate: document.querySelector("#printDate"),
  printAssumptions: document.querySelector("#printAssumptions"),
  shortlistForm: document.querySelector("#shortlistForm"),
  shortlistInput: document.querySelector("#shortlistInput"),
  shortlistOptions: document.querySelector("#shortlistOptions"),
  shortlistMessage: document.querySelector("#shortlistMessage"),
  shortlistEmpty: document.querySelector("#shortlistEmpty"),
  shortlistChips: document.querySelector("#shortlistChips"),
  shortlistOnly: document.querySelector("#shortlistOnlyToggle"),
  hostValue: document.querySelector("#hostValue"),
  shortlistToggle: document.querySelector("#shortlistToggle"),
  tableTitle: document.querySelector("#tableTitle")
};

const DEFAULT_TABLE_TITLE = "Candidate host cities, ranked by total flight emissions";

// Factor inputs hold g CO2 per passenger-km and carry a path such as "shortHaul.economy".
function factorPath(input) {
  return input.dataset.factor.split(".");
}

function defaultFactorG(path) {
  const kg = path.reduce((node, key) => node[key], DESNZ_2026.factorsKgPerPkm);
  return Math.round(kg * 1e4) / 10; // kg to g, tidied of floating-point noise
}

// A blank, negative or non-numeric entry falls back to the DESNZ default for that field.
function factorFromInput(input) {
  const path = factorPath(input);
  const raw = input.value.trim();
  const grams = raw === "" ? NaN : Number(raw);
  return Number.isFinite(grams) && grams >= 0 ? grams / 1000 : defaultFactorG(path) / 1000;
}

function readFactors() {
  const factors = { domestic: 0, shortHaul: {}, longHaul: {} };
  for (const input of els.factorInputs) {
    const path = factorPath(input);
    const value = factorFromInput(input);
    if (path.length === 1) factors[path[0]] = value;
    else factors[path[0]][path[1]] = value;
  }
  return factors;
}

function factorsAreCustom(factors) {
  return els.factorInputs.some((input) => {
    const path = factorPath(input);
    const kg = path.reduce((node, key) => node[key], factors);
    return Math.abs(kg * 1000 - defaultFactorG(path)) > 1e-9;
  });
}

function fillFactorInputs() {
  for (const input of els.factorInputs) input.value = String(defaultFactorG(factorPath(input)));
}

function getPolicy() {
  return {
    threshold: Number(els.threshold.value),
    factors: readFactors(),
    distanceUplift: DESNZ_2026.distanceUplift,
    nonCo2Multiplier: els.nonCo2.checked ? DESNZ_2026.nonCo2Multiplier : 1,
    returnTrip: els.returnTrip.checked
  };
}

function placedGroups() {
  return state.groups.filter((group) => group.airportCode);
}

// With nothing placed there is nothing to rank, so the scores stay empty.
function calculateScores() {
  state.scores = placedGroups().length
    ? scoreAll(state.groups, getPolicy(), isFiltering() ? state.shortlist.codes : undefined)
    : [];
  if (state.scores.length && !state.scores.some((score) => score.destination.code === state.selectedCode)) {
    state.selectedCode = state.scores[0].destination.code;
  }
}

function formatTonnes(kg) {
  if (!Number.isFinite(kg)) return "-";
  if (kg >= 1000) {
    return `${(kg / 1000).toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} t`;
  }
  return `${Math.round(kg)} kg`;
}

function formatHours(hours) {
  return `${hours.toFixed(1)} h`;
}

function colorForScore(score, min, max) {
  const ratio = max === min ? 0 : (score.totalEmissionsKg - min) / (max - min);
  if (ratio < 0.33) return DATA_COLOURS[0];
  if (ratio < 0.62) return DATA_COLOURS[1];
  if (ratio < 0.82) return DATA_COLOURS[2];
  return DATA_COLOURS[3];
}

function initMap() {
  if (!window.L) {
    els.fileMessage.textContent = "Map library could not load. Check your connection and refresh.";
    return;
  }

  state.map = window.L.map(els.map, {
    worldCopyJump: true,
    zoomControl: true,
    minZoom: 2,
    maxZoom: 7
  }).setView([24, 8], 2);

  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    // OSM sends Access-Control-Allow-Origin: *, so the PNG export can read the tiles untainted.
    crossOrigin: "anonymous"
  }).addTo(state.map);

  state.map.createPane("heatPane").style.zIndex = 420;
  state.map.createPane("jetlagPane").style.zIndex = 520;
  state.map.createPane("routePane").style.zIndex = 650;
  state.map.createPane("airportPane").style.zIndex = 700;
  state.map.getPane("routePane").style.pointerEvents = "none";
  state.map.getPane("jetlagPane").style.pointerEvents = "none";

  state.mapLayers.heat = window.L.layerGroup().addTo(state.map);
  state.mapLayers.jetlag = window.L.layerGroup().addTo(state.map);
  state.mapLayers.routes = window.L.layerGroup().addTo(state.map);
  state.mapLayers.airports = window.L.layerGroup().addTo(state.map);
  state.mapReady = true;
  // Zooming moves every marker relative to its neighbours; resizing changes the visible area.
  state.map.on("zoomend resize", scheduleLabelLayout);
  requestAnimationFrame(() => state.map.invalidateSize());
}

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// Pans the map just enough to bring the selected airport into the part of the map the
// destination card does not cover. Does nothing while the map is hidden (Table view).
function revealSelected({ animate = true } = {}) {
  if (!state.mapReady || els.mapPanel.hidden) return;
  const selected = state.scores.find((score) => score.destination.code === state.selectedCode);
  if (!selected) return;
  const container = els.map.getBoundingClientRect();
  if (!container.width || !container.height) return;
  const card = els.destinationCard.getBoundingClientRect();
  const padding = panPadding(container, card);
  // The marker's code label extends to the right of the anchor point, so leave room for it.
  state.map.panInside([selected.destination.lat, selected.destination.lon], {
    paddingTopLeft: padding.topLeft,
    paddingBottomRight: [padding.bottomRight[0] + 40, padding.bottomRight[1]],
    animate: animate && !reducedMotion.matches
  });
}

// Zooms the map to the shortlisted cities whenever the set being compared changes, keeping
// them clear of the destination card. Waits until the map is visible (not in Table view).
function fitShortlist({ animate = true } = {}) {
  if (!state.mapReady || els.mapPanel.hidden) return;
  const key = isFiltering() ? state.shortlist.codes.join(",") : "";
  if (key === state.fittedShortlist) return;
  state.fittedShortlist = key;
  if (!key) return;
  const container = els.map.getBoundingClientRect();
  if (!container.width || !container.height) return;
  const padding = panPadding(container, els.destinationCard.getBoundingClientRect());
  // Clearing the card both ways leaves too small a box, so fit the cities into whichever is
  // bigger: the strip left of the card or the strip above it. The extra 40 px is label room.
  const [edge] = padding.topLeft;
  const right = padding.bottomRight[0] + 40;
  const bottom = padding.bottomRight[1];
  const leftStrip = (container.width - edge - right) * (container.height - 2 * edge);
  const topStrip = (container.width - edge - 40) * (container.height - edge - bottom);
  const points = state.scores.map((score) => [score.destination.lat, score.destination.lon]);
  state.map.fitBounds(points, {
    paddingTopLeft: padding.topLeft,
    paddingBottomRight: leftStrip >= topStrip ? [right, edge] : [40, bottom],
    maxZoom: 5,
    animate: animate && !reducedMotion.matches
  });
}

function scheduleLabelLayout() {
  if (state.labelFrame) return;
  state.labelFrame = requestAnimationFrame(() => {
    state.labelFrame = 0;
    layoutLabels();
  });
}

// Hides the code labels that would overlap a more important one. Dots are never hidden, and
// a hidden label comes back on hover or keyboard focus (see styles.css). Reads are batched
// before writes so the pass causes a single layout.
function layoutLabels() {
  if (!state.mapReady || els.mapPanel.hidden) return;
  const markers = [...els.map.querySelectorAll(".airport-marker")];
  for (const marker of markers) marker.classList.remove("label-hidden");
  const rank = new Map(state.scores.map((score, index) => [score.destination.code, index]));
  const items = markers.map((marker) => {
    const rect = marker.querySelector(".airport-code").getBoundingClientRect();
    const code = marker.dataset.code;
    return {
      id: marker,
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      priority: code === state.selectedCode ? -1 : rank.get(code) ?? Infinity
    };
  });
  const visible = pickVisibleLabels(items, { margin: 2 });
  for (const marker of markers) {
    if (!visible.has(marker)) marker.classList.add("label-hidden");
  }
}


const CONFIDENCE_TAGS = {
  unplaced: { className: "sg-tag sg-tag--danger", label: "not placed" },
  medium: { className: "sg-tag sg-tag--warning", label: "check" },
  high: { className: "sg-tag sg-tag--muted", label: "matched" },
  manual: { className: "sg-tag sg-tag--muted", label: "chosen" }
};

const CONFIDENCE_ORDER = { unplaced: 0, medium: 1, high: 2, manual: 2 };

// Built by buildAirportLists() once the airport data has loaded.
let AIRPORT_OPTIONS = "";

// The list above holds only host cities, so a group matched to any other airport gets its own
// option at the top; otherwise the select would show nothing.
function matchedAirportOption(group) {
  if (!group.airportCode || hostByCode(group.airportCode)) return "";
  const airport = airportByCode(group.airportCode);
  if (!airport) return "";
  return `<option value="${airport.code}">${escapeHtml(airport.name)}, ${escapeHtml(airport.country)} (${airport.code})</option>`;
}

function applyConfidenceTag(tag, confidence) {
  const info = CONFIDENCE_TAGS[confidence] || CONFIDENCE_TAGS.high;
  tag.className = info.className;
  tag.textContent = info.label;
}

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

// Warns about groups that are missing from the totals (not placed) or only roughly placed.
function renderNotices() {
  const unplaced = state.groups.filter((group) => !group.airportCode);
  const toCheck = state.groups.filter((group) => group.airportCode && group.confidence === "medium");
  const parts = [];
  if (unplaced.length) {
    const people = unplaced.reduce((sum, group) => sum + group.people, 0);
    parts.push({
      level: "danger",
      text: `${unplaced.length} of ${plural(state.groups.length, "group", "groups")} couldn't be placed (${plural(people, "person", "people")}). They're left out of the totals until you pick an airport.`
    });
  }
  if (toCheck.length) {
    parts.push({
      level: "warning",
      text: `${plural(toCheck.length, "group was", "groups were")} placed with some doubt, check ${toCheck.length === 1 ? "it" : "them"}.`
    });
  }
  for (const element of els.notices) {
    element.replaceChildren();
    element.hidden = !parts.length;
    for (const part of parts) {
      const paragraph = document.createElement("p");
      paragraph.className = `notice notice--${part.level}`;
      paragraph.textContent = part.text;
      element.append(paragraph);
    }
  }
}

// Rebuilt only when new groups are loaded, never on a recalculation, so focus stays put while
// someone works down the list.
function renderReview() {
  els.reviewList.innerHTML = "";
  if (!state.groups.length) {
    els.reviewList.innerHTML = `<div class="message">Upload a file or load the demo data to review airport guesses.</div>`;
    return;
  }

  const ordered = state.groups
    .map((group, index) => ({ group, index }))
    .sort((a, b) => CONFIDENCE_ORDER[a.group.confidence] - CONFIDENCE_ORDER[b.group.confidence] || a.index - b.index);

  for (const { group } of ordered) {
    const row = document.createElement("article");
    row.className = "review-row";
    row.innerHTML = `
      <div class="review-head">
        <div class="review-place">
          <strong>${escapeHtml(group.inputLocation)}</strong>
          <span class="review-people">${group.people.toLocaleString()} people</span>
          ${group.reason ? `<span class="review-reason">${escapeHtml(group.reason)}</span>` : ""}
        </div>
        <span></span>
      </div>
      <select class="sg-select" aria-label="Assumed airport for ${escapeHtml(group.inputLocation)}">
        ${group.airportCode ? "" : `<option value="">Choose an airport…</option>`}${matchedAirportOption(group)}${AIRPORT_OPTIONS}
      </select>
    `;
    const tag = row.querySelector(".review-head > span:last-child");
    const select = row.querySelector("select");
    select.value = group.airportCode || "";
    applyConfidenceTag(tag, group.confidence);
    select.addEventListener("change", () => {
      group.airportCode = select.value || null;
      group.confidence = select.value ? "manual" : "unplaced";
      group.reason = select.value ? "chosen by you" : "no match";
      const reason = row.querySelector(".review-reason");
      if (reason) reason.textContent = group.reason;
      applyConfidenceTag(tag, group.confidence);
      updateAll();
    });
    els.reviewList.append(row);
  }
}

function renderMap() {
  const scores = state.scores;
  if (!state.mapReady) return;
  if (!scores.length) {
    state.mapLayers.heat.clearLayers();
    state.mapLayers.jetlag.clearLayers();
    state.mapLayers.routes.clearLayers();
    state.mapLayers.airports.clearLayers();
    return;
  }
  const min = Math.min(...scores.map((score) => score.totalEmissionsKg));
  const max = Math.max(...scores.map((score) => score.totalEmissionsKg));

  state.mapLayers.heat.clearLayers();
  state.mapLayers.jetlag.clearLayers();
  state.mapLayers.airports.clearLayers();

  if (state.layers.heat) {
    for (const score of scores) {
      const ratio = max === min ? 0.2 : (score.totalEmissionsKg - min) / (max - min);
      window.L.circle([score.destination.lat, score.destination.lon], {
        pane: "heatPane",
        radius: 180000 + ratio * 760000,
        className: "heat-spot",
        color: colorForScore(score, min, max),
        fillColor: colorForScore(score, min, max),
        fillOpacity: 0.42,
        opacity: 0.18,
        weight: 1
      }).addTo(state.mapLayers.heat);
    }
  }

  if (state.layers.jetlag) {
    for (const score of scores.filter((item) => item.jetlagScore >= 6)) {
      const size = Math.round(46 + Math.min(score.jetlagScore, 12) * 8);
      window.L.marker([score.destination.lat, score.destination.lon], {
        pane: "jetlagPane",
        interactive: false,
        icon: window.L.divIcon({
          className: "jetlag-zone",
          html: "",
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2]
        })
      }).addTo(state.mapLayers.jetlag);
    }
  }

  renderRoutes();
  renderAirports(min, max);
}

function renderRoutes() {
  const selected = state.scores.find((score) => score.destination.code === state.selectedCode);
  if (!state.mapReady) return;
  state.mapLayers.routes.clearLayers();
  if (!state.layers.routes || !selected) {
    return;
  }

  selected.drivers.slice(0, 8).forEach((driver, index) => {
    const route = interpolateRoute(driver.origin, selected.destination);
    const weight = 1.1;

    window.L.polyline(route, {
      pane: "routePane",
      className: "route-line route-line-casing",
      color: "#ffffff",
      opacity: 0.72,
      weight: 2.4
    }).addTo(state.mapLayers.routes);

    window.L.polyline(route, {
      pane: "routePane",
      className: "route-line",
      color: "#0e0e0c",
      dashArray: index < 4 ? "" : "6 7",
      opacity: 0.84,
      weight
    }).addTo(state.mapLayers.routes);

    window.L.circleMarker([driver.origin.lat, driver.origin.lon], {
      pane: "routePane",
      className: "route-origin",
      color: "#ffffff",
      fillColor: "#0e0e0c",
      fillOpacity: 0.9,
      opacity: 0.95,
      radius: 4,
      weight: 2
    }).addTo(state.mapLayers.routes);
  });
}

function interpolateRoute(origin, destination) {
  const points = [];
  const steps = 48;
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const toDeg = (radians) => (radians * 180) / Math.PI;
  const lat1 = toRad(origin.lat);
  const lon1 = toRad(origin.lon);
  const lat2 = toRad(destination.lat);
  const lon2 = toRad(destination.lon);
  const delta = 2 * Math.asin(Math.sqrt(
    Math.sin((lat2 - lat1) / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2
  ));

  if (!Number.isFinite(delta) || delta === 0) {
    return [[origin.lat, origin.lon], [destination.lat, destination.lon]];
  }

  for (let i = 0; i <= steps; i += 1) {
    const fraction = i / steps;
    const a = Math.sin((1 - fraction) * delta) / Math.sin(delta);
    const b = Math.sin(fraction * delta) / Math.sin(delta);
    const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
    const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
    const z = a * Math.sin(lat1) + b * Math.sin(lat2);
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lon = Math.atan2(y, x);
    points.push([toDeg(lat), toDeg(lon)]);
  }

  return points;
}

function renderAirports(min, max) {
  if (!state.mapReady) return;
  for (const score of state.scores) {
    const isSelected = score.destination.code === state.selectedCode;
    const fill = colorForScore(score, min, max);
    const marker = window.L.marker([score.destination.lat, score.destination.lon], {
      pane: "airportPane",
      title: `${score.destination.city} (${score.destination.code})`,
      icon: window.L.divIcon({
        className: `airport-marker ${isSelected ? "selected" : ""} ${!isFiltering() && state.shortlist.codes.includes(score.destination.code) ? "shortlisted" : ""}`,
        html: `<span class="airport-dot" style="--marker-color: ${fill}"></span><span class="airport-code">${score.destination.code}</span>`,
        iconSize: [58, 28],
        iconAnchor: [9, 14]
      })
    }).addTo(state.mapLayers.airports);

    const selectDestination = ({ restoreFocus = false } = {}) => {
      state.selectedCode = score.destination.code;
      renderMap();
      renderSelected();
      revealSelected();
      if (restoreFocus) els.map.querySelector(`.airport-marker[data-code="${score.destination.code}"]`)?.focus();
    };
    marker.on("click", selectDestination);

    const markerElement = marker.getElement();
    if (markerElement) {
      markerElement.dataset.code = score.destination.code;
      markerElement.setAttribute("role", "button");
      markerElement.setAttribute("tabindex", "0");
      markerElement.setAttribute(
        "aria-label",
        `${score.destination.city} (${score.destination.code}), ${formatTonnes(score.totalEmissionsKg)} total`
      );
      markerElement.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectDestination({ restoreFocus: true });
        }
      });
    }
  }
  layoutLabels();
}

function renderSummary() {
  const people = state.groups.reduce((sum, group) => sum + group.people, 0);
  const best = state.scores[0];
  const severe = state.scores.filter((score) => score.jetlagScore >= 6).length;
  els.groupCount.textContent = plural(state.groups.length, "group", "groups");
  els.peopleCount.textContent = people.toLocaleString();
  els.bestCity.textContent = best ? best.destination.city : "-";
  els.bestEmissions.textContent = best ? formatTonnes(best.totalEmissionsKg) : "-";
  els.jetlagShare.textContent = state.scores.length ? `${Math.round((severe / state.scores.length) * 100)}%` : "-";
}

function renderSelected() {
  const selected =
    state.scores.find((score) => score.destination.code === state.selectedCode) ||
    state.scores[0];
  if (!selected) {
    els.shortlistToggle.hidden = true;
    els.selectedName.textContent = "No groups placed yet";
    for (const el of [els.selectedEmissions, els.selectedPerPerson, els.selectedFlight, els.selectedJetlag]) {
      el.textContent = "-";
    }
    els.topDrivers.textContent = "Pick an airport for at least one group to see the ranking.";
    return;
  }
  state.selectedCode = selected.destination.code;
  const onShortlist = state.shortlist.codes.includes(selected.destination.code);
  els.shortlistToggle.hidden = false;
  els.shortlistToggle.setAttribute("aria-pressed", String(onShortlist));
  els.shortlistToggle.textContent = onShortlist ? "On shortlist \u2713" : "Add to shortlist";
  els.selectedName.textContent = `${selected.destination.city}, ${selected.destination.country}`;
  els.selectedEmissions.textContent = formatTonnes(selected.totalEmissionsKg);
  els.selectedPerPerson.textContent = formatTonnes(selected.averageEmissionsKg);
  els.selectedFlight.textContent = formatHours(selected.averageHours);
  els.selectedJetlag.textContent = `${selected.jetlagScore.toFixed(1)} h avg`;
  const businessShare = selected.totalPeople
    ? Math.round((selected.businessClassPeople / selected.totalPeople) * 100)
    : 0;
  const drivers = selected.drivers
    .slice(0, 3)
    .map((driver) => `${driver.origin.city}: ${formatTonnes(driver.emissionsKg)}`)
    .join(" / ");
  const trips = els.returnTrip.checked ? "return journeys" : "one-way journeys";
  els.topDrivers.textContent = `Top contributors: ${drivers || "-"}. Figures are for ${trips}. Business class policy affects ${businessShare}% of attendees for this destination.`;
}

function formatPercent(share) {
  return `${Math.round(share * 100)}%`;
}

function renderTable() {
  const scores = state.scores;
  const { sortKey, direction, showAll } = state.table;
  const policy = getPolicy();
  const people = scores.length ? scores[0].totalPeople : 0;
  const hours = policy.threshold;
  els.tableMeta.textContent = scores.length
    ? `${plural(people, "attendee", "attendees")} placed${isFiltering() ? ` \u00b7 shortlist of ${state.shortlist.codes.length}` : ""} \u00b7 ${policy.returnTrip ? "return journeys" : "one-way journeys"} \u00b7 business class over ${hours} ${hours === 1 ? "hour" : "hours"} \u00b7 ${els.nonCo2.checked ? `non-CO2 \u00d7${DESNZ_2026.nonCo2Multiplier}` : "non-CO2 off"}${factorsAreCustom(policy.factors) ? " \u00b7 custom factors" : ""}`
    : "";

  els.tableTitle.textContent = isFiltering() ? "Your shortlist, ranked by total flight emissions" : DEFAULT_TABLE_TITLE;
  els.downloadCsv.disabled = !scores.length;
  els.printTable.disabled = !scores.length;
  if (!state.exporting) els.downloadPng.disabled = !scores.length;
  els.printDate.textContent = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  els.printAssumptions.innerHTML = scores.length
    ? assumptionLines(policy, {
        placedPeople: people,
        placedGroups: placedGroups().length,
        unplacedGroups: state.groups.length - placedGroups().length,
        shortlist: shortlistCityNames()
      })
        .map((line) => `<li>${escapeHtml(line)}</li>`)
        .join("")
    : "";

  if (!scores.length) {
    els.tableScroll.innerHTML = `<div class="message">No groups are placed yet. Upload a file, load the demo data or pick an airport for at least one group to see the ranking.</div>`;
    els.tableToggle.hidden = true;
    return;
  }

  // scoreAll returns lowest total first, so a city's rank is its position there.
  const rank = new Map(scores.map((score, index) => [score.destination.code, index + 1]));
  const sorted = sortScores(scores, sortKey, direction);
  const visible = showAll ? sorted : sorted.slice(0, TABLE_LIMIT);

  const headers = [`<th scope="col" class="num">Rank</th>`]
    .concat(
      TABLE_COLUMNS.map((column) => {
        const active = column.key === sortKey;
        const ariaSort = active ? (direction === "asc" ? "ascending" : "descending") : "none";
        const arrow = active ? (direction === "asc" ? "\u25b2" : "\u25bc") : "";
        return `<th scope="col" class="${column.numeric ? "num" : ""}" aria-sort="${ariaSort}"><button type="button" class="sort-button" data-sort="${column.key}">${column.label}<span class="sort-arrow" aria-hidden="true">${arrow}</span></button></th>`;
      })
    )
    .join("");

  const rows = visible
    .map((score) => {
      const d = score.destination;
      const selected = d.code === state.selectedCode;
      return `<tr class="${selected ? "selected" : ""}" data-code="${d.code}" tabindex="0"${selected ? ` aria-current="true"` : ""}>
        <td class="num">${rank.get(d.code)}</td>
        <td><span class="city-name">${escapeHtml(d.city)}</span>, ${escapeHtml(d.country)} <span class="city-code">${d.code}</span>${!isFiltering() && state.shortlist.codes.includes(d.code) ? ` <span class="sg-tag sg-tag--muted shortlist-tag">Shortlist</span>` : ""}</td>
        <td class="num">${formatTonnes(score.totalEmissionsKg)}</td>
        <td class="num">${formatTonnes(score.averageEmissionsKg)}</td>
        <td class="num">${formatHours(score.averageHours)}</td>
        <td class="num">${score.jetlagScore.toFixed(1)} h</td>
        <td class="num">${formatPercent(score.severeJetlagShare)}</td>
        <td class="num">${formatPercent(score.businessShare)}</td>
      </tr>`;
    })
    .join("");

  els.tableScroll.innerHTML = `<table class="sg-table comparison-table" aria-labelledby="tableTitle"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;

  els.tableToggle.hidden = scores.length <= TABLE_LIMIT;
  els.tableToggle.textContent = showAll ? `Show top ${TABLE_LIMIT}` : `Show all ${scores.length} cities`;
  els.tableToggle.setAttribute("aria-expanded", String(showAll));
}

function localDateStamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Saves every scored city, in the current sort order, as a CSV file. Built and downloaded in the
// browser; nothing is uploaded. The byte-order mark lets Excel read accented city names correctly.
function downloadComparisonCsv() {
  if (!state.scores.length) return;
  const { sortKey, direction } = state.table;
  const blob = new Blob(["\ufeff", comparisonCsv(state.scores, { sortKey, direction })], {
    type: "text/csv;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `host-city-comparison-${localDateStamp()}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Waits for the map's tiles to finish loading, or for the timeout, whichever comes first.
function whenTilesLoaded(map, timeout = 1500) {
  return new Promise((resolve) => {
    const timer = setTimeout(done, timeout);
    function done() {
      clearTimeout(timer);
      map.eachLayer((layer) => layer.off?.("load", done));
      resolve();
    }
    let loading = false;
    map.eachLayer((layer) => {
      if (layer._loading) {
        loading = true;
        layer.once("load", done);
      }
    });
    if (!loading) done();
  });
}

function airportRadiusMetres(score, min, max) {
  const ratio = max === min ? 0.2 : (score.totalEmissionsKg - min) / (max - min);
  return 180000 + ratio * 760000;
}

// Saves the current comparison as a PNG: the map as it is now plus the top 10 table. In Table view
// the map panel is shown off-screen and invisible just long enough to draw it, then hidden again.
async function downloadComparisonPng() {
  if (!state.scores.length || !state.mapReady || state.exporting) return;
  state.exporting = true;
  const button = els.downloadPng;
  const label = button.textContent;
  button.disabled = true;
  button.textContent = "Preparing\u2026";
  const wasHidden = els.mapPanel.hidden;
  const saved = els.mapPanel.getAttribute("style");
  try {
    if (wasHidden) {
      const size = state.lastMapSize || els.tablePanel.getBoundingClientRect();
      els.mapPanel.hidden = false;
      Object.assign(els.mapPanel.style, {
        position: "fixed",
        left: "0",
        top: "0",
        width: `${Math.round(size.width)}px`,
        height: `${Math.round(size.height)}px`,
        visibility: "hidden",
        pointerEvents: "none"
      });
      state.map.invalidateSize({ animate: false });
      layoutLabels();
      await whenTilesLoaded(state.map);
    }
    const scores = state.scores;
    const min = Math.min(...scores.map((score) => score.totalEmissionsKg));
    const max = Math.max(...scores.map((score) => score.totalEmissionsKg));
    const selected = scores.find((score) => score.destination.code === state.selectedCode);
    const policy = getPolicy();
    const placed = placedGroups();
    const people = scores[0].totalPeople;
    const blob = await renderComparisonPng({
      map: state.map,
      scores,
      selectedCode: state.selectedCode,
      layers: { ...state.layers },
      policyLines: assumptionLines(policy, {
        placedPeople: people,
        placedGroups: placed.length,
        unplacedGroups: state.groups.length - placed.length,
        shortlist: shortlistCityNames()
      }),
      colourFor: (score) => colorForScore(score, min, max),
      radiusFor: (score) => airportRadiusMetres(score, min, max),
      routes: selected
        ? selected.drivers.slice(0, 8).map((driver) => ({
            points: interpolateRoute(driver.origin, selected.destination),
            origin: [driver.origin.lat, driver.origin.lon]
          }))
        : [],
      dataColours: DATA_COLOURS,
      formatTonnes,
      tableTitle: isFiltering() ? "Your shortlist by total flight emissions" : undefined,
      date: new Date()
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `host-city-comparison-${localDateStamp()}.png`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    console.error("PNG export failed", error);
    els.fileMessage.textContent = "Could not create the PNG. Try again, or use Print instead.";
  } finally {
    if (wasHidden) {
      els.mapPanel.hidden = true;
      if (saved === null) els.mapPanel.removeAttribute("style");
      else els.mapPanel.setAttribute("style", saved);
      state.map.invalidateSize({ animate: false });
    }
    state.exporting = false;
    button.textContent = label;
    button.disabled = !state.scores.length;
  }
}

// Printing always shows the whole table, whichever view is open. Whatever was showing is put back after.
let printRestore = null;

function beforePrint() {
  if (printRestore) return;
  printRestore = { view: state.view, showAll: state.table.showAll };
  state.table.showAll = true;
  if (state.view !== "table") setView("table");
  else renderTable();
}

function afterPrint() {
  if (!printRestore) return;
  const { view, showAll } = printRestore;
  printRestore = null;
  state.table.showAll = showAll;
  if (view !== "table") setView(view);
  else renderTable();
}

// Marks the selected row in place, so a click doesn't rebuild the table and drop keyboard focus.
function markSelectedRow() {
  for (const row of els.tableScroll.querySelectorAll("tbody tr")) {
    const selected = row.dataset.code === state.selectedCode;
    row.classList.toggle("selected", selected);
    if (selected) row.setAttribute("aria-current", "true");
    else row.removeAttribute("aria-current");
  }
}

function selectDestinationByCode(code) {
  state.selectedCode = code;
  markSelectedRow();
  renderMap();
  renderSelected();
  // In Table view the map is hidden, so wait until the planner switches back to it.
  if (state.view === "table") state.pendingReveal = true;
  else revealSelected();
}

function setView(view, { focus = false } = {}) {
  state.view = view;
  const isTable = view === "table";
  // Remember how big the map was, so the PNG export can recreate it from Table view.
  if (isTable && !els.mapPanel.hidden) {
    const box = els.map.getBoundingClientRect();
    if (box.width) state.lastMapSize = { width: box.width, height: box.height };
  }
  els.mapTab.setAttribute("aria-selected", String(!isTable));
  els.tableTab.setAttribute("aria-selected", String(isTable));
  els.mapTab.tabIndex = isTable ? -1 : 0;
  els.tableTab.tabIndex = isTable ? 0 : -1;
  els.mapPanel.hidden = isTable;
  els.tablePanel.hidden = !isTable;
  els.mapControls.hidden = isTable;
  if (focus) (isTable ? els.tableTab : els.mapTab).focus();
  if (isTable) {
    renderTable();
  } else if (state.mapReady) {
    state.map.invalidateSize();
    renderMap();
    fitShortlist();
    if (state.pendingReveal) {
      state.pendingReveal = false;
      revealSelected();
    }
  }
}

function updatePolicyCopy() {
  const value = Number(els.threshold.value);
  els.policyValue.textContent = `${value} h`;
  els.policyText.textContent = `${value} ${value === 1 ? "hour" : "hours"}`;
  const policy = getPolicy();
  els.customTag.hidden = !factorsAreCustom(policy.factors);
  renderMethod(policy);
}

function formatGrams(kg) {
  return (Math.round(kg * 1e4) / 10).toLocaleString("en-GB", { maximumFractionDigits: 1 });
}

// Keeps the "How this is calculated" note in step with the current policy.
function renderMethod(policy) {
  const f = policy.factors;
  const cut = `${DESNZ_2026.domesticMaxKm.toLocaleString("en-GB")}`;
  const short = `${DESNZ_2026.shortHaulMaxKm.toLocaleString("en-GB")}`;
  els.methodFactors.innerHTML = `
    <tr><th scope="row">Domestic (under ${cut} km)</th><td class="num" colspan="2">${formatGrams(f.domestic)}</td></tr>
    <tr><th scope="row">Short-haul (under ${short} km)</th><td class="num">${formatGrams(f.shortHaul.economy)}</td><td class="num">${formatGrams(f.shortHaul.business)}</td></tr>
    <tr><th scope="row">Long-haul</th><td class="num">${formatGrams(f.longHaul.economy)}</td><td class="num">${formatGrams(f.longHaul.business)}</td></tr>`;
  els.methodNonCo2.textContent = els.nonCo2.checked
    ? `Multiplied by ${DESNZ_2026.nonCo2Multiplier}, DESNZ's central estimate for contrails, nitrogen oxides and water vapour. It is uncertain.`
    : "Switched off, so only direct CO2 is counted. When on, CO2 is multiplied by 1.7 (DESNZ's central estimate, which is uncertain).";
  els.methodTrips.textContent = policy.returnTrip
    ? "Return journeys count both ways (\u00d72). Switch off Return trips for one-way figures."
    : "One-way journeys are counted. Switch on Return trips to count both ways (\u00d72).";
}

let SHORTLIST_OPTIONS = [];

function buildAirportLists() {
  const sorted = [...AIRPORTS].sort((a, b) => a.city.localeCompare(b.city));
  AIRPORT_OPTIONS = sorted
    .map((airport) => `<option value="${airport.code}">${airport.city}, ${airport.country} (${airport.code})</option>`)
    .join("");
  SHORTLIST_OPTIONS = sorted.map((airport) => ({ airport, label: `${airport.city}, ${airport.country} (${airport.code})` }));
}

function fillShortlistOptions() {
  for (const { label } of SHORTLIST_OPTIONS) {
    const option = document.createElement("option");
    option.value = label;
    els.shortlistOptions.append(option);
  }
}

// Updates everything about the shortlist except the input, so typing is never interrupted.
function renderShortlist() {
  const { codes, only } = state.shortlist;
  els.hostValue.textContent = isFiltering() ? `Shortlist \u00b7 ${codes.length}` : `All ${AIRPORTS.length}`;
  els.shortlistEmpty.hidden = codes.length > 0;
  els.shortlistOnly.disabled = codes.length === 0;
  els.shortlistOnly.checked = only && codes.length > 0;
  els.shortlistChips.replaceChildren(
    ...codes.map((code) => {
      const airport = airportByCode(code);
      const item = document.createElement("li");
      item.className = "shortlist-chip";
      const name = document.createElement("span");
      name.append(`${airport.city} `);
      const codeEl = document.createElement("span");
      codeEl.className = "city-code";
      codeEl.textContent = code;
      name.append(codeEl);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.dataset.code = code;
      remove.setAttribute("aria-label", `Remove ${airport.city} from shortlist`);
      remove.textContent = "\u00d7";
      item.append(name, remove);
      return item;
    })
  );
}

function addToShortlist(code) {
  const { shortlist } = state;
  if (shortlist.codes.includes(code)) return false;
  shortlist.codes.push(code);
  if (shortlist.codes.length === 1) shortlist.only = true;
  saveShortlist();
  updateAll();
  return true;
}

function removeFromShortlist(code) {
  const { shortlist } = state;
  const index = shortlist.codes.indexOf(code);
  if (index < 0) return;
  shortlist.codes.splice(index, 1);
  if (!shortlist.codes.length) shortlist.only = false;
  saveShortlist();
  updateAll();
}

function submitShortlist() {
  const value = els.shortlistInput.value.trim();
  if (!value) return;
  const listed = SHORTLIST_OPTIONS.find((option) => option.label.toLowerCase() === value.toLowerCase());
  const codeInLabel = value.match(/\(([A-Za-z]{3})\)\s*$/);
  const airport = (codeInLabel && hostByCode(codeInLabel[1].toUpperCase())) || listed?.airport || hostOnly(findAirport(value));
  if (!airport) {
    els.shortlistMessage.textContent = `Couldn't find "${value}". Pick a city from the list.`;
    return;
  }
  if (state.shortlist.codes.includes(airport.code)) {
    els.shortlistMessage.textContent = `${airport.city} is already on the shortlist.`;
    return;
  }
  els.shortlistMessage.textContent = "";
  els.shortlistInput.value = "";
  addToShortlist(airport.code);
}

function updateAll() {
  updatePolicyCopy();
  calculateScores();
  renderShortlist();
  renderNotices();
  renderSummary();
  if (state.mapReady) state.map.invalidateSize();
  renderMap();
  renderSelected();
  fitShortlist();
  renderTable();
}

async function parseFile(file) {
  const extension = file.name.split(".").pop().toLowerCase();
  if (extension === "csv" || extension === "tsv") {
    return parseCsv(await file.text());
  }

  if (!window.XLSX) {
    throw new Error("Excel parsing is still loading. Try again in a moment, or export the sheet as CSV.");
  }

  const buffer = await file.arrayBuffer();
  const workbook = window.XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return window.XLSX.utils.sheet_to_json(firstSheet, { defval: "" }).map((row) => {
    const normalized = {};
    Object.entries(row).forEach(([key, value]) => {
      normalized[normalize(key).replace(/\s+/g, "")] = value;
    });
    return normalizeImportedRow(normalized);
  });
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value);
  return div.innerHTML;
}

function setGroups(rows, sourceLabel) {
  const { groups, skipped } = buildGroups(rows);
  const skippedNote = skipped ? `, skipped ${plural(skipped, "row", "rows")} with no valid people count` : "";
  if (!groups.length) {
    els.fileMessage.textContent = `No usable attendee rows found${skippedNote}. Check for location and people columns.`;
    return;
  }
  state.groups = groups;
  els.fileMessage.textContent = `${sourceLabel}: loaded ${groups.length} attendee groups${skippedNote}`;
  renderReview();
  updateAll();
}

function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function wireEvents() {
  els.file.addEventListener("change", async () => {
    const file = els.file.files?.[0];
    if (!file) return;
    try {
      let placesNote = "";
      if (!placesInstalled()) {
        els.fileMessage.textContent = "Loading place names\u2026";
        if (!(await loadPlaces())) placesNote = " (place names didn't load, so small towns may not be placed)";
      }
      els.fileMessage.textContent = `Reading ${file.name}...`;
      const rows = await parseFile(file);
      setGroups(rows, file.name + placesNote);
    } catch (error) {
      els.fileMessage.textContent = error.message;
    }
  });

  els.loadDemo.addEventListener("click", () => {
    els.file.value = "";
    state.selectedCode = "AMS";
    setGroups(SAMPLE_ROWS.map((row) => ({ ...row })), "Demo data reset");
  });

  // Checkboxes and the range slider fire `input` as well, so `input` alone is enough.
  const debouncedUpdate = debounce(updateAll, 150);
  els.threshold.addEventListener("input", updateAll);
  els.nonCo2.addEventListener("input", updateAll);
  els.returnTrip.addEventListener("input", updateAll);
  for (const input of els.factorInputs) input.addEventListener("input", debouncedUpdate);
  els.resetFactors.addEventListener("click", () => {
    fillFactorInputs();
    updateAll();
  });

  els.shortlistForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitShortlist();
  });
  els.shortlistInput.addEventListener("input", () => {
    els.shortlistMessage.textContent = "";
  });
  els.shortlistChips.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-code]");
    if (!button) return;
    const buttons = [...els.shortlistChips.querySelectorAll("button[data-code]")];
    const index = buttons.indexOf(button);
    removeFromShortlist(button.dataset.code);
    const remaining = [...els.shortlistChips.querySelectorAll("button[data-code]")];
    (remaining[index] || remaining[index - 1] || els.shortlistInput).focus();
  });
  els.shortlistOnly.addEventListener("change", () => {
    state.shortlist.only = els.shortlistOnly.checked && state.shortlist.codes.length > 0;
    saveShortlist();
    updateAll();
  });
  els.shortlistToggle.addEventListener("click", () => {
    const code = state.selectedCode;
    if (state.shortlist.codes.includes(code)) removeFromShortlist(code);
    else addToShortlist(code);
    els.shortlistToggle.focus();
    revealSelected({ animate: false });
  });

  for (const tab of [els.mapTab, els.tableTab]) {
    tab.addEventListener("click", () => setView(tab === els.tableTab ? "table" : "map"));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? "map" : event.key === "End" ? "table" : tab === els.mapTab ? "table" : "map";
      setView(next, { focus: true });
    });
  }

  els.tableScroll.addEventListener("click", (event) => {
    const sortButton = event.target.closest("[data-sort]");
    if (sortButton) {
      const key = sortButton.dataset.sort;
      const table = state.table;
      if (table.sortKey === key) {
        table.direction = table.direction === "asc" ? "desc" : "asc";
      } else {
        table.sortKey = key;
        table.direction = "asc";
      }
      renderTable();
      els.tableScroll.querySelector(`[data-sort="${key}"]`)?.focus();
      return;
    }
    const row = event.target.closest("tbody tr");
    if (row) selectDestinationByCode(row.dataset.code);
  });

  els.tableScroll.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest("tbody tr");
    if (!row || event.target !== row) return;
    event.preventDefault();
    selectDestinationByCode(row.dataset.code);
  });

  els.downloadCsv.addEventListener("click", downloadComparisonCsv);
  els.downloadPng.addEventListener("click", downloadComparisonPng);
  els.printTable.addEventListener("click", () => window.print());
  window.addEventListener("beforeprint", beforePrint);
  window.addEventListener("afterprint", afterPrint);

  els.tableToggle.addEventListener("click", () => {
    state.table.showAll = !state.table.showAll;
    renderTable();
  });

  [
    [els.heatToggle, "heat"],
    [els.jetlagToggle, "jetlag"],
    [els.routesToggle, "routes"]
  ].forEach(([button, key]) => {
    button.addEventListener("click", () => {
      state.layers[key] = !state.layers[key];
      button.classList.toggle("active", state.layers[key]);
      button.classList.toggle("sg-btn--ink", state.layers[key]);
      button.setAttribute("aria-pressed", String(state.layers[key]));
      renderMap();
      renderSelected();
    });
  });
}

// The place names are the bigger download, so they are fetched on the first upload rather than at
// start-up. Matching still works without them (airport cities and countries only); if the
// download fails, the upload carries on that way and says so.
let placesPromise = null;

function loadPlaces() {
  if (placesInstalled()) return Promise.resolve(true);
  if (!placesPromise) {
    placesPromise = fetch("data/places.json")
      .then((response) => {
        if (!response.ok) throw new Error(`data/places.json: ${response.status}`);
        return response.json();
      })
      .then((json) => {
        installPlaces(json);
        rematchGroups();
        return true;
      })
      .catch((error) => {
        console.error(error);
        placesPromise = null;
        return false;
      });
  }
  return placesPromise;
}

// Groups loaded before the place names arrived are matched again, except any the user chose.
function rematchGroups() {
  let changed = false;
  for (const group of state.groups) {
    if (group.confidence === "manual" || !group.row) continue;
    const guess = guessAirport(group.row);
    const code = guess.airport ? guess.airport.code : null;
    if (code !== group.airportCode || guess.confidence !== group.confidence || guess.reason !== group.reason) changed = true;
    group.airportCode = code;
    group.confidence = guess.confidence;
    group.reason = guess.reason;
    group.place = guess.place || null;
    group.distanceKm = guess.distanceKm ?? null;
  }
  if (changed) {
    renderReview();
    updateAll();
  }
}

async function loadDataset() {
  const [airports, overrides] = await Promise.all(
    ["data/airports.json", "data/overrides.json"].map(async (path) => {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`${path}: ${response.status}`);
      return response.json();
    })
  );
  installDataset({ airports, overrides });
}

// Attendee input waits for the airport data, because matching needs it.
function setLoading(loading) {
  els.file.disabled = loading;
  els.loadDemo.disabled = loading;
}

async function start() {
  els.fileMessage.textContent = "Loading airport data\u2026";
  setLoading(true);
  try {
    await loadDataset();
  } catch (error) {
    console.error(error);
    els.fileMessage.textContent = "Couldn't load the airport data. Check your connection and reload the page.";
    return;
  }
  els.fileMessage.textContent = "";
  buildAirportLists();
  fillFactorInputs();
  fillShortlistOptions();
  loadShortlist();
  initMap();
  wireEvents();
  setLoading(false);
  setGroups(SAMPLE_ROWS.map((row) => ({ ...row })), "Demo data");
  requestAnimationFrame(settleMap);
  document.fonts?.ready.then(settleMap);
}

// Once layout has settled, make sure the default selection isn't hidden behind the card. Web
// fonts can resize the card after the first frame, so this runs again once they've loaded.
function settleMap() {
  if (!state.mapReady) return;
  state.map.invalidateSize();
  // A saved shortlist is fitted again now the map and card have their real sizes.
  state.fittedShortlist = null;
  if (isFiltering()) fitShortlist({ animate: false });
  else revealSelected({ animate: false });
  layoutLabels();
}
start();
