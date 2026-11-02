import {
  AIRPORTS,
  SAMPLE_ROWS,
  buildGroups,
  normalizeImportedRow,
  normalize,
  parseCsv,
  scoreAll
} from "./model.js";

// Heat and marker colours, lowest to highest emissions. These mirror Signal's tokens
// (green-500, amber-500, red-500, red-800); Leaflet needs literal colours, so they live here.
// Keep the legend swatches in src/styles.css in step.
const DATA_COLOURS = ["#1fe070", "#ffb000", "#ff3b1f", "#8f1a08"];


const state = {
  groups: [],
  scores: [],
  selectedCode: "AMS",
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
  }
};

const els = {
  file: document.querySelector("#attendeeFile"),
  fileMessage: document.querySelector("#fileMessage"),
  loadDemo: document.querySelector("#loadDemoButton"),
  threshold: document.querySelector("#businessThreshold"),
  policyValue: document.querySelector("#policyValue"),
  policyText: document.querySelector("#policyText"),
  economyFactor: document.querySelector("#economyFactor"),
  businessMultiplier: document.querySelector("#businessMultiplier"),
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
  routesToggle: document.querySelector("#routesToggle")
};

function getPolicy() {
  return {
    threshold: Number(els.threshold.value),
    economyFactor: Number(els.economyFactor.value) || 0.115,
    businessMultiplier: Number(els.businessMultiplier.value) || 2.8,
    nonCo2Multiplier: els.nonCo2.checked ? 1.9 : 1,
    returnTrip: els.returnTrip.checked
  };
}

function placedGroups() {
  return state.groups.filter((group) => group.airportCode);
}

// With nothing placed there is nothing to rank, so the scores stay empty.
function calculateScores() {
  state.scores = placedGroups().length ? scoreAll(state.groups, getPolicy()) : [];
  if (state.scores.length && !state.scores.some((score) => score.destination.code === state.selectedCode)) {
    state.selectedCode = state.scores[0].destination.code;
  }
}

function formatTonnes(kg) {
  if (!Number.isFinite(kg)) return "-";
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)} t`;
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
    maxZoom: 19
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
  requestAnimationFrame(() => state.map.invalidateSize());
}


const CONFIDENCE_TAGS = {
  unplaced: { className: "sg-tag sg-tag--danger", label: "not placed" },
  medium: { className: "sg-tag sg-tag--warning", label: "country only" },
  high: { className: "sg-tag sg-tag--muted", label: "matched" },
  manual: { className: "sg-tag sg-tag--muted", label: "chosen" }
};

const CONFIDENCE_ORDER = { unplaced: 0, medium: 1, high: 2, manual: 2 };

const AIRPORT_OPTIONS = [...AIRPORTS]
  .sort((a, b) => a.city.localeCompare(b.city))
  .map((airport) => `<option value="${airport.code}">${airport.city}, ${airport.country} (${airport.code})</option>`)
  .join("");

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
  const countryOnly = state.groups.filter((group) => group.airportCode && group.confidence === "medium");
  const parts = [];
  if (unplaced.length) {
    const people = unplaced.reduce((sum, group) => sum + group.people, 0);
    parts.push({
      level: "danger",
      text: `${unplaced.length} of ${plural(state.groups.length, "group", "groups")} couldn't be placed (${plural(people, "person", "people")}). They're left out of the totals until you pick an airport.`
    });
  }
  if (countryOnly.length) {
    parts.push({
      level: "warning",
      text: `${plural(countryOnly.length, "group was", "groups were")} placed by country only, check ${countryOnly.length === 1 ? "it" : "them"}.`
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
        </div>
        <span></span>
      </div>
      <select class="sg-select" aria-label="Assumed airport for ${escapeHtml(group.inputLocation)}">
        ${group.airportCode ? "" : `<option value="">Choose an airport…</option>`}${AIRPORT_OPTIONS}
      </select>
    `;
    const tag = row.querySelector(".review-head > span:last-child");
    const select = row.querySelector("select");
    select.value = group.airportCode || "";
    applyConfidenceTag(tag, group.confidence);
    select.addEventListener("change", () => {
      group.airportCode = select.value || null;
      group.confidence = select.value ? "manual" : "unplaced";
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
        className: `airport-marker ${isSelected ? "selected" : ""}`,
        html: `<span class="airport-dot" style="--marker-color: ${fill}"></span><span class="airport-code">${score.destination.code}</span>`,
        iconSize: [58, 28],
        iconAnchor: [9, 14]
      })
    }).addTo(state.mapLayers.airports);

    const selectDestination = () => {
      state.selectedCode = score.destination.code;
      renderMap();
      renderSelected();
    };
    marker.on("click", selectDestination);

    const markerElement = marker.getElement();
    if (markerElement) {
      markerElement.dataset.code = score.destination.code;
      markerElement.setAttribute("role", "button");
      markerElement.setAttribute("tabindex", "0");
      markerElement.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectDestination();
        }
      });
    }
  }
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
    els.selectedName.textContent = "No groups placed yet";
    for (const el of [els.selectedEmissions, els.selectedPerPerson, els.selectedFlight, els.selectedJetlag]) {
      el.textContent = "-";
    }
    els.topDrivers.textContent = "Pick an airport for at least one group to see the ranking.";
    return;
  }
  state.selectedCode = selected.destination.code;
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

function updatePolicyCopy() {
  const value = Number(els.threshold.value);
  els.policyValue.textContent = `${value} h`;
  els.policyText.textContent = `${value} ${value === 1 ? "hour" : "hours"}`;
}

function updateAll() {
  updatePolicyCopy();
  calculateScores();
  renderNotices();
  renderSummary();
  if (state.mapReady) state.map.invalidateSize();
  renderMap();
  renderSelected();
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
    els.fileMessage.textContent = `Reading ${file.name}...`;
    try {
      const rows = await parseFile(file);
      setGroups(rows, file.name);
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
  els.economyFactor.addEventListener("input", debouncedUpdate);
  els.businessMultiplier.addEventListener("input", debouncedUpdate);

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

initMap();
wireEvents();
setGroups(SAMPLE_ROWS.map((row) => ({ ...row })), "Demo data");
