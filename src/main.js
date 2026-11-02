const AIRPORTS = [
  { code: "ATL", city: "Atlanta", country: "United States", lat: 33.64, lon: -84.43, tz: -5 },
  { code: "JFK", city: "New York", country: "United States", lat: 40.64, lon: -73.78, tz: -5 },
  { code: "LAX", city: "Los Angeles", country: "United States", lat: 33.94, lon: -118.41, tz: -8 },
  { code: "ORD", city: "Chicago", country: "United States", lat: 41.98, lon: -87.91, tz: -6 },
  { code: "YYZ", city: "Toronto", country: "Canada", lat: 43.68, lon: -79.63, tz: -5 },
  { code: "MEX", city: "Mexico City", country: "Mexico", lat: 19.44, lon: -99.07, tz: -6 },
  { code: "GRU", city: "Sao Paulo", country: "Brazil", lat: -23.43, lon: -46.47, tz: -3 },
  { code: "EZE", city: "Buenos Aires", country: "Argentina", lat: -34.82, lon: -58.54, tz: -3 },
  { code: "SCL", city: "Santiago", country: "Chile", lat: -33.39, lon: -70.79, tz: -4 },
  { code: "BOG", city: "Bogota", country: "Colombia", lat: 4.7, lon: -74.15, tz: -5 },
  { code: "LHR", city: "London", country: "United Kingdom", lat: 51.47, lon: -0.45, tz: 0 },
  { code: "CDG", city: "Paris", country: "France", lat: 49.01, lon: 2.55, tz: 1 },
  { code: "AMS", city: "Amsterdam", country: "Netherlands", lat: 52.31, lon: 4.76, tz: 1 },
  { code: "FRA", city: "Frankfurt", country: "Germany", lat: 50.04, lon: 8.56, tz: 1 },
  { code: "MAD", city: "Madrid", country: "Spain", lat: 40.49, lon: -3.57, tz: 1 },
  { code: "FCO", city: "Rome", country: "Italy", lat: 41.8, lon: 12.25, tz: 1 },
  { code: "ZRH", city: "Zurich", country: "Switzerland", lat: 47.46, lon: 8.55, tz: 1 },
  { code: "CPH", city: "Copenhagen", country: "Denmark", lat: 55.62, lon: 12.65, tz: 1 },
  { code: "ARN", city: "Stockholm", country: "Sweden", lat: 59.65, lon: 17.92, tz: 1 },
  { code: "HEL", city: "Helsinki", country: "Finland", lat: 60.32, lon: 24.97, tz: 2 },
  { code: "DUB", city: "Dublin", country: "Ireland", lat: 53.43, lon: -6.25, tz: 0 },
  { code: "IST", city: "Istanbul", country: "Turkey", lat: 41.28, lon: 28.75, tz: 3 },
  { code: "DXB", city: "Dubai", country: "United Arab Emirates", lat: 25.25, lon: 55.36, tz: 4 },
  { code: "DOH", city: "Doha", country: "Qatar", lat: 25.27, lon: 51.61, tz: 3 },
  { code: "CAI", city: "Cairo", country: "Egypt", lat: 30.12, lon: 31.41, tz: 2 },
  { code: "JNB", city: "Johannesburg", country: "South Africa", lat: -26.14, lon: 28.25, tz: 2 },
  { code: "LOS", city: "Lagos", country: "Nigeria", lat: 6.58, lon: 3.32, tz: 1 },
  { code: "NBO", city: "Nairobi", country: "Kenya", lat: -1.32, lon: 36.93, tz: 3 },
  { code: "DEL", city: "Delhi", country: "India", lat: 28.56, lon: 77.1, tz: 5.5 },
  { code: "BOM", city: "Mumbai", country: "India", lat: 19.09, lon: 72.87, tz: 5.5 },
  { code: "BKK", city: "Bangkok", country: "Thailand", lat: 13.69, lon: 100.75, tz: 7 },
  { code: "SIN", city: "Singapore", country: "Singapore", lat: 1.36, lon: 103.99, tz: 8 },
  { code: "HKG", city: "Hong Kong", country: "Hong Kong", lat: 22.31, lon: 113.92, tz: 8 },
  { code: "PVG", city: "Shanghai", country: "China", lat: 31.14, lon: 121.81, tz: 8 },
  { code: "PEK", city: "Beijing", country: "China", lat: 40.08, lon: 116.58, tz: 8 },
  { code: "HND", city: "Tokyo", country: "Japan", lat: 35.55, lon: 139.78, tz: 9 },
  { code: "ICN", city: "Seoul", country: "South Korea", lat: 37.46, lon: 126.44, tz: 9 },
  { code: "SYD", city: "Sydney", country: "Australia", lat: -33.94, lon: 151.18, tz: 10 },
  { code: "MEL", city: "Melbourne", country: "Australia", lat: -37.67, lon: 144.84, tz: 10 },
  { code: "AKL", city: "Auckland", country: "New Zealand", lat: -37.01, lon: 174.79, tz: 12 }
];

const COUNTRY_ALIASES = new Map([
  ["usa", "United States"],
  ["us", "United States"],
  ["u.s.", "United States"],
  ["united states of america", "United States"],
  ["uk", "United Kingdom"],
  ["u.k.", "United Kingdom"],
  ["great britain", "United Kingdom"],
  ["england", "United Kingdom"],
  ["uae", "United Arab Emirates"],
  ["united arab emirates", "United Arab Emirates"],
  ["south korea", "South Korea"],
  ["korea", "South Korea"],
  ["new zealand", "New Zealand"],
  ["hong kong", "Hong Kong"]
]);

const SAMPLE_ROWS = [
  { location: "London", country: "United Kingdom", people: 42 },
  { location: "New York", country: "United States", people: 18 },
  { location: "Singapore", country: "Singapore", people: 9 },
  { location: "Delhi", country: "India", people: 14 },
  { location: "Sydney", country: "Australia", people: 7 },
  { location: "Sao Paulo", country: "Brazil", people: 11 }
];

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
  groupCount: document.querySelector("#groupCount"),
  peopleCount: document.querySelector("#peopleCount"),
  bestCity: document.querySelector("#bestCity"),
  bestEmissions: document.querySelector("#bestEmissions"),
  jetlagShare: document.querySelector("#jetlagShare"),
  reviewList: document.querySelector("#reviewList"),
  map: document.querySelector("#worldMap"),
  selectedName: document.querySelector("#selectedName"),
  selectedEmissions: document.querySelector("#selectedEmissions"),
  selectedPerPerson: document.querySelector("#selectedPerPerson"),
  selectedFlight: document.querySelector("#selectedFlight"),
  selectedJetlag: document.querySelector("#selectedJetlag"),
  topDrivers: document.querySelector("#topDrivers"),
  jetlagToggle: document.querySelector("#jetlagToggle"),
  routesToggle: document.querySelector("#routesToggle")
};

function normalize(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function canonicalCountry(value) {
  const key = normalize(value);
  if (!key) return "";
  return COUNTRY_ALIASES.get(key) || titleCase(key);
}

function titleCase(value) {
  return String(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function airportLabel(airport) {
  return `${airport.city} (${airport.code})`;
}

function getPolicy() {
  return {
    threshold: Number(els.threshold.value),
    economyFactor: Number(els.economyFactor.value) || 0.115,
    businessMultiplier: Number(els.businessMultiplier.value) || 2.8,
    nonCo2Multiplier: els.nonCo2.checked ? 1.9 : 1
  };
}

function guessAirport(row) {
  const explicit = String(row.airport || row.iata || "").trim().toUpperCase();
  if (explicit) {
    const match = AIRPORTS.find((airport) => airport.code === explicit);
    if (match) return { airport: match, confidence: "high", reason: "airport code" };
  }

  const location = normalize(row.location || row.city || row.place || "");
  const country = canonicalCountry(row.country || "");
  const combined = normalize(`${row.location || ""} ${row.country || ""}`);

  const cityMatch = AIRPORTS.find((airport) => {
    const city = normalize(airport.city);
    return city && (location === city || combined.includes(city));
  });
  if (cityMatch) return { airport: cityMatch, confidence: "high", reason: "city match" };

  const countryMatch = AIRPORTS.find((airport) => normalize(airport.country) === normalize(country || row.location));
  if (countryMatch) return { airport: countryMatch, confidence: "medium", reason: "country default" };

  const locationCountryMatch = AIRPORTS.find((airport) => normalize(airport.country) === location);
  if (locationCountryMatch) return { airport: locationCountryMatch, confidence: "medium", reason: "country default" };

  return { airport: AIRPORTS.find((airport) => airport.code === "LHR"), confidence: "low", reason: "fallback" };
}

function buildGroups(rows) {
  return rows
    .map((row, index) => {
      const people = Number(row.people || row.attendees || row.count || row.number || 0);
      if (!Number.isFinite(people) || people <= 0) return null;
      const guess = guessAirport(row);
      return {
        id: `group-${Date.now()}-${index}`,
        inputLocation: row.location || row.city || row.country || row.airport || "Unknown",
        country: canonicalCountry(row.country || ""),
        people,
        airportCode: guess.airport.code,
        confidence: guess.confidence,
        reason: guess.reason
      };
    })
    .filter(Boolean);
}

function airportByCode(code) {
  return AIRPORTS.find((airport) => airport.code === code) || AIRPORTS[0];
}

function haversineKm(a, b) {
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const radius = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function flightHours(distanceKm) {
  return distanceKm / 850 + 0.55;
}

function tzDifference(a, b) {
  const raw = Math.abs(a - b);
  return Math.min(raw, 24 - raw);
}

function emissionsForLeg(distanceKm, hours, people, policy) {
  const cabinMultiplier = hours > policy.threshold ? policy.businessMultiplier : 1;
  return distanceKm * people * policy.economyFactor * cabinMultiplier * policy.nonCo2Multiplier;
}

function scoreDestination(destination, policy) {
  let totalEmissionsKg = 0;
  let totalPeople = 0;
  let weightedHours = 0;
  let weightedJetlag = 0;
  let businessClassPeople = 0;
  const drivers = [];

  for (const group of state.groups) {
    const origin = airportByCode(group.airportCode);
    const distanceKm = haversineKm(origin, destination);
    const hours = flightHours(distanceKm);
    const emissionsKg = emissionsForLeg(distanceKm, hours, group.people, policy);
    const jetlag = tzDifference(origin.tz, destination.tz);
    totalEmissionsKg += emissionsKg;
    totalPeople += group.people;
    weightedHours += hours * group.people;
    weightedJetlag += jetlag * group.people;
    if (hours > policy.threshold) businessClassPeople += group.people;
    drivers.push({ origin, people: group.people, emissionsKg, hours, jetlag });
  }

  drivers.sort((a, b) => b.emissionsKg - a.emissionsKg);
  return {
    destination,
    totalEmissionsKg,
    totalPeople,
    averageEmissionsKg: totalPeople ? totalEmissionsKg / totalPeople : 0,
    averageHours: totalPeople ? weightedHours / totalPeople : 0,
    jetlagScore: totalPeople ? weightedJetlag / totalPeople : 0,
    businessClassPeople,
    drivers
  };
}

function calculateScores() {
  const policy = getPolicy();
  state.scores = AIRPORTS.map((airport) => scoreDestination(airport, policy));
  state.scores.sort((a, b) => a.totalEmissionsKg - b.totalEmissionsKg);
  if (!state.scores.some((score) => score.destination.code === state.selectedCode)) {
    state.selectedCode = state.scores[0]?.destination.code || "AMS";
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
  if (ratio < 0.33) return "#147d64";
  if (ratio < 0.62) return "#dd9f2c";
  if (ratio < 0.82) return "#d85f45";
  return "#7a4c73";
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

function renderReview() {
  els.reviewList.innerHTML = "";
  if (!state.groups.length) {
    els.reviewList.innerHTML = `<div class="message">Upload a file or load the demo data to review airport guesses.</div>`;
    return;
  }

  for (const group of state.groups) {
    const row = document.createElement("article");
    row.className = "review-row";
    const options = AIRPORTS.map((airport) => {
      const selected = airport.code === group.airportCode ? "selected" : "";
      return `<option value="${airport.code}" ${selected}>${airport.city}, ${airport.country} (${airport.code})</option>`;
    }).join("");
    row.innerHTML = `
      <strong>${escapeHtml(group.inputLocation)}</strong>
      <div class="review-meta">
        <span>${group.people} people</span>
        <span class="confidence ${group.confidence}">${group.confidence}</span>
      </div>
      <select aria-label="Assumed airport for ${escapeHtml(group.inputLocation)}">${options}</select>
    `;
    const select = row.querySelector("select");
    select.addEventListener("change", () => {
      group.airportCode = select.value;
      group.confidence = "high";
      updateAll();
    });
    els.reviewList.append(row);
  }
}

function renderMap() {
  const scores = state.scores;
  if (!scores.length || !state.mapReady) return;
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
      color: "#12384a",
      dashArray: index < 4 ? "" : "6 7",
      opacity: 0.84,
      weight
    }).addTo(state.mapLayers.routes);

    window.L.circleMarker([driver.origin.lat, driver.origin.lon], {
      pane: "routePane",
      className: "route-origin",
      color: "#ffffff",
      fillColor: "#12384a",
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
      markerElement.addEventListener("click", selectDestination);
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
  els.groupCount.textContent = `${state.groups.length} groups`;
  els.peopleCount.textContent = people.toLocaleString();
  els.bestCity.textContent = best ? `${best.destination.city}` : "-";
  els.bestEmissions.textContent = best ? formatTonnes(best.totalEmissionsKg) : "-";
  els.jetlagShare.textContent = state.scores.length ? `${Math.round((severe / state.scores.length) * 100)}%` : "-";
}

function renderSelected() {
  const selected =
    state.scores.find((score) => score.destination.code === state.selectedCode) ||
    state.scores[0];
  if (!selected) return;
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
  els.topDrivers.textContent = `Top contributors: ${drivers || "-"}. Business class policy affects ${businessShare}% of attendees for this destination.`;
}

function updatePolicyCopy() {
  const value = Number(els.threshold.value);
  els.policyValue.textContent = `${value} h`;
  els.policyText.textContent = `${value} ${value === 1 ? "hour" : "hours"}`;
}

function updateAll() {
  updatePolicyCopy();
  calculateScores();
  renderReview();
  renderSummary();
  if (state.mapReady) state.map.invalidateSize();
  renderMap();
  renderSelected();
}

function parseCsv(text) {
  const rows = [];
  const delimiter = text.includes("\t") ? "\t" : ",";
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return rows;
  const headers = splitRow(lines[0], delimiter).map((header) => normalize(header).replace(/\s+/g, ""));
  for (const line of lines.slice(1)) {
    const cells = splitRow(line, delimiter);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] || "";
    });
    rows.push(normalizeImportedRow(row));
  }
  return rows;
}

function splitRow(line, delimiter) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function normalizeImportedRow(row) {
  const pick = (...keys) => keys.map((key) => row[key]).find((value) => value !== undefined && value !== "");
  return {
    location: pick("location", "city", "place", "origin", "attendeelocation"),
    country: pick("country", "nation"),
    people: pick("people", "attendees", "count", "number", "quantity"),
    airport: pick("airport", "iata", "airportcode", "originairport")
  };
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
  const groups = buildGroups(rows);
  if (!groups.length) {
    els.fileMessage.textContent = "No usable attendee rows found. Check for location and people columns.";
    return;
  }
  state.groups = groups;
  els.fileMessage.textContent = `${sourceLabel}: loaded ${groups.length} attendee groups.`;
  updateAll();
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

  [els.threshold, els.economyFactor, els.businessMultiplier, els.nonCo2].forEach((input) => {
    input.addEventListener("input", updateAll);
    input.addEventListener("change", updateAll);
  });

  [
    [els.jetlagToggle, "jetlag"],
    [els.routesToggle, "routes"]
  ].forEach(([button, key]) => {
    button.addEventListener("click", () => {
      state.layers[key] = !state.layers[key];
      button.classList.toggle("active", state.layers[key]);
      renderMap();
      renderSelected();
    });
  });
}

initMap();
wireEvents();
setGroups(SAMPLE_ROWS.map((row) => ({ ...row })), "Demo data");
