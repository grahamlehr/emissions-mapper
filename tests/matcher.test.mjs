import "./helpers/dataset.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  airportByCode,
  allAirports,
  canonicalCountry,
  findAirport,
  guessAirport,
  haversineKm,
  normalize,
  placesInstalled
} from "../src/model.js";

const guess = (location, country, extra = {}) => guessAirport({ location, country, ...extra });
const code = (location, country, extra) => guess(location, country, extra).airport?.code ?? null;

test("places are installed by the test helper", () => {
  assert.equal(placesInstalled(), true);
  assert.ok(allAirports().length > 3000);
});

// ---- 1. Airport column ----------------------------------------------------------------------

test("airport column: IATA code, any case, any airport in the full list", () => {
  for (const value of ["BER", "ber", " Ber "]) {
    const result = guess("", "", { airport: value });
    assert.equal(result.airport.code, "BER");
    assert.equal(result.confidence, "high");
    assert.equal(result.reason, "airport code");
  }
  assert.equal(code("", "", { airport: "INV" }), "INV"); // not a host
});

test("airport column: ICAO and metro codes", () => {
  assert.equal(code("", "", { airport: "EGLL" }), "LHR");
  assert.equal(code("", "", { airport: "kjfk" }), "JFK");
  assert.equal(code("", "", { airport: "LON" }), "LHR");
  assert.equal(code("", "", { airport: "NYC" }), "JFK");
  assert.equal(guess("", "", { airport: "TYO" }).confidence, "high");
});

test("airport column: an unknown code falls through to the location", () => {
  const result = guess("Paris", "France", { airport: "XYZ" });
  assert.equal(result.airport.code, "CDG");
  assert.notEqual(result.reason, "airport code");
  assert.equal(code("", "", { airport: "ZZZZ" }), null);
});

// ---- 2. Normalising -------------------------------------------------------------------------

test("normalise folds diacritics and letters that don't decompose", () => {
  assert.equal(normalize("São Paulo"), "sao paulo");
  assert.equal(normalize("Zürich"), "zurich");
  assert.equal(normalize("Kraków"), "krakow");
  assert.equal(normalize("Łódź"), "lodz");
  assert.equal(normalize("Malmö"), "malmo");
  assert.equal(normalize("Århus"), "arhus");
  assert.equal(normalize("Straße"), "strasse");
});

test("diacritics and exonyms match", () => {
  assert.equal(code("São Paulo", "Brasil"), "GRU");
  assert.equal(code("Zürich", "Schweiz"), "ZRH");
  assert.equal(code("Kraków", "Poland"), "KRK");
  assert.equal(code("Łódź", "Poland"), "LCJ");
  assert.equal(code("München", "Deutschland"), "MUC");
});

// ---- 3. Constraints: country column, then trailing country and region tokens ---------------

test("country resolver knows codes, names, native names and aliases", () => {
  assert.equal(canonicalCountry("DE"), "Germany");
  assert.equal(canonicalCountry("GBR"), "United Kingdom");
  assert.equal(canonicalCountry("Schweiz"), "Switzerland");
  assert.equal(canonicalCountry("U.S.A."), "United States");
  assert.equal(canonicalCountry("Narnia"), "Narnia");
});

test("the country column decides between places with the same name", () => {
  assert.equal(code("Valencia", "Spain"), "VLC");
  assert.equal(code("Valencia", "Venezuela"), "VLN");
  assert.equal(code("Santiago", "Chile"), "SCL");
  assert.ok(["KHI", "HDD"].includes(code("Hyderabad", "Pakistan")));
  assert.equal(code("Hyderabad", "India"), "HYD");
});

test("CA means California in the US and Canada in a country slot", () => {
  assert.ok(["SJC", "SFO"].includes(code("Palo Alto, CA", "United States")));
  assert.equal(code("Palo Alto, CA"), code("Palo Alto, CA", "United States"));
  assert.equal(code("Ottawa, CA"), "YOW");
});

test("SA means South Australia, South Africa or Saudi Arabia, whichever the place is in", () => {
  assert.equal(code("Adelaide, SA"), "ADL");
  assert.equal(code("Cape Town, SA"), "CPT");
  assert.equal(code("Riyadh, SA"), "RUH");
});

test("WA means Washington State or Western Australia", () => {
  assert.equal(code("Perth, WA"), "PER");
  assert.equal(code("Tacoma, WA", "United States"), "SEA");
  assert.equal(code("Perth, Scotland"), "EDI");
});

test("GA, IN, DE and CO are region or country, never both for one candidate", () => {
  assert.equal(code("Atlanta, GA"), "ATL");
  assert.equal(code("Tbilisi, Georgia"), "TBS");
  assert.equal(code("Atlanta, Georgia"), "ATL");
  assert.equal(code("Berlin, DE"), "BER");
  assert.equal(code("Mumbai, IN"), "BOM");
  assert.equal(code("Boulder, CO"), "DEN");
});

test("a state or province tells same-named towns apart", () => {
  assert.equal(code("Portland, OR"), "PDX");
  assert.equal(code("Portland, Maine"), "PWM");
  assert.equal(code("London, ON"), "YXU");
  assert.equal(code("Birmingham, AL"), "BHM");
  assert.equal(code("Birmingham, UK"), "BHX");
  assert.equal(code("Paris, TX"), "DFW");
  assert.equal(code("Springfield, MO"), "SGF");
});

test("a trailing region without a comma is a constraint too", () => {
  assert.equal(code("Sydney NSW"), "SYD");
  assert.equal(code("Perth Western Australia"), "PER");
  assert.equal(code("Portland Maine"), "PWM");
  assert.equal(code("Dublin Ohio"), "CMH");
});

test("unknown trailing parts are ignored, not fatal", () => {
  assert.equal(code("Chicago, Illinois, USA"), "ORD");
  assert.equal(code("Chicago, Loop district"), "ORD");
  assert.equal(code("Edinburgh, Midlothian, Scotland"), "EDI");
});

test("a country token that contradicts the place does not match it", () => {
  assert.equal(guess("Atlanta", "Germany").airport?.code === "ATL", false);
});

// ---- 4. Aliases -----------------------------------------------------------------------------

test("aliases: known names are high confidence", () => {
  for (const [text, expected] of [
    ["NYC", "JFK"],
    ["Bay Area", "SFO"],
    ["SF Bay Area", "SFO"],
    ["Silicon Valley", "SJC"],
    ["Greater London", "LHR"],
    ["Manhattan, NY", "JFK"],
    ["Washington, D.C.", "IAD"],
    ["Bombay", "BOM"]
  ]) {
    const result = guess(text);
    assert.equal(result.airport?.code, expected, text);
    assert.equal(result.confidence, "high", text);
    assert.equal(result.reason, "known name", text);
  }
});

test("aliases do not override a contradicting country", () => {
  assert.notEqual(code("LA", "Bolivia"), "LAX");
  assert.notEqual(code("Bay Area", "Germany"), "SFO");
});

// ---- 5. Place lookup and ranking ------------------------------------------------------------

test("a single clear place is high confidence, with its place and distance", () => {
  const result = guess("Utrecht", "Netherlands");
  assert.equal(result.airport.code, "AMS");
  assert.equal(result.confidence, "high");
  assert.equal(result.place.name, "Utrecht");
  assert.equal(result.place.country, "Netherlands");
  assert.ok(result.place.population > 100000);
  assert.ok(Number.isInteger(result.distanceKm));
  assert.match(result.reason, /airport, \d+ km/);
});

test("ratio rule: a place at least 10x the next one is high confidence", () => {
  const result = guess("Paris");
  assert.equal(result.airport.code, "CDG");
  assert.equal(result.confidence, "high");
  assert.equal(code("London"), "LHR");
});

test("same-airport rule: rivals that map to the same airport do not lower confidence", () => {
  const result = guess("Utrecht");
  assert.equal(result.confidence, "high");
});

test("ambiguous names are medium and say how many places there were", () => {
  const result = guess("Springfield", "United States");
  assert.equal(result.confidence, "medium");
  assert.match(result.reason, /^\d+ places called Springfield in United States: picked the largest$/);
  assert.ok(["SGF", "SPI", "BDL"].includes(result.airport.code));
  assert.equal(guess("Portland", "United States").confidence, "medium");
  assert.equal(guess("Birmingham").confidence, "medium");
  assert.equal(guess("Hyderabad").confidence, "medium");
});

test("a place only known as an airport municipality is found", () => {
  const result = guess("Kiruna", "Sweden");
  assert.equal(result.airport.code, "KRN");
});

// ---- 7. Place to airport (a to g) -----------------------------------------------------------

test("a) a large airport within 50 km", () => {
  const result = guess("Berlin", "Germany");
  assert.equal(result.airport.code, "BER");
  assert.equal(result.airport.size, "L");
});

test("a) hosts are preferred to a slightly nearer large airport (Leiden uses Schiphol)", () => {
  assert.equal(code("Leiden", "Netherlands"), "AMS");
});

test("b) a medium airport within 10 km is the city's own airport", () => {
  const result = guess("A Coruña", "Spain");
  assert.equal(result.airport.code, "LCG");
  assert.equal(result.airport.size, "M");
});

test("c) a large airport within 100 km beats a nearer regional one", () => {
  assert.equal(code("Heidelberg", "Germany"), "FRA");
  assert.equal(code("Boulder, CO"), "DEN");
});

test("d) a medium airport within 50 km when there is no large one in 100 km", () => {
  assert.equal(code("Inverness", "United Kingdom"), "INV");
});

test("e) a large airport 100 to 150 km away", () => {
  const result = guess("Toledo", "Spain");
  assert.equal(result.airport.code, "MAD");
  assert.equal(result.confidence, "high");
  assert.ok(result.distanceKm > 50 && result.distanceKm <= 150);
});

test("a to f can cross a border", () => {
  const result = guess("Malmo", "Sweden");
  assert.equal(result.airport.code, "CPH");
  assert.equal(code("Annecy", "France"), "GVA");
});

test("g) otherwise the nearest large airport in the country, flagged for checking", () => {
  const result = guess("Sumbe", "Angola");
  assert.equal(result.confidence, "medium");
  assert.equal(result.airport.countryCode, "AO");
  assert.ok(result.distanceKm > 150);
  assert.equal(result.reason, `nearest major airport is ${result.distanceKm} km away`);
});

test("two large airports both close to the place are flagged", () => {
  const result = guess("Princeton, NJ", "United States");
  assert.equal(result.airport.code, "EWR");
  assert.equal(result.confidence, "medium");
  assert.match(result.reason, /also close/);
});

// ---- 6. Typos -------------------------------------------------------------------------------

test("typos: one edit for 5 to 8 characters, two for longer, always medium", () => {
  const near = guess("Edinbrugh", "United Kingdom");
  assert.equal(near.airport.code, "EDI");
  assert.equal(near.confidence, "medium");
  assert.equal(near.reason, "possible typo for Edinburgh");
  assert.equal(code("Chicagoo", "United States"), "ORD");
  assert.equal(code("Manchster", "United Kingdom"), "MAN");
  assert.equal(guess("Frankfrut", "Germany").reason, "possible typo for Frankfurt am Main");
});

test("typos: too many edits, or too short a name, are not corrected", () => {
  assert.equal(guess("Exxnbxxgh", "United Kingdom").reason, "country only");
  assert.equal(guess("Nic", "France").reason, "country only"); // too short for a typo
});

test("typos without a country only consider big places", () => {
  const result = guess("Amsterdm");
  assert.equal(result.airport.code, "AMS");
  assert.equal(result.confidence, "medium");
});

test("typos never beat an exact match", () => {
  assert.equal(guess("Berlin", "Germany").reason.startsWith("possible typo"), false);
});

// ---- 8. Country only ------------------------------------------------------------------------

test("country only: a hub host, flagged", () => {
  for (const [text, expected] of [["Germany", "FRA"], ["USA", "JFK"], ["Japan", null], ["UK", "LHR"]]) {
    const result = guess(text);
    assert.ok(result.airport, text);
    if (expected) assert.equal(result.airport.code, expected, text);
    assert.equal(result.confidence, "medium", text);
    assert.equal(result.reason, "country only", text);
  }
});

test("country only: the country column with no location", () => {
  assert.equal(code("", "Spain"), "MAD");
  assert.equal(guess("", "Spain").confidence, "medium");
});

test("country only: a country with no host uses the largest place's nearest large airport", () => {
  const result = guess("", "Peru");
  assert.equal(result.airport.code, "LIM");
  assert.equal(result.reason, "country only");
});

test("country only: a place that isn't found falls back to the country column", () => {
  const result = guess("Narnia", "Germany");
  assert.equal(result.airport.code, "FRA");
  assert.equal(result.confidence, "medium");
});

// ---- 9. Junk --------------------------------------------------------------------------------

test("junk stays unplaced", () => {
  for (const text of ["Remote", "TBC", "N/A", "Online", "Europe", "EMEA", "123", "", "Home office", "Various", "Anywhere"]) {
    const result = guess(text);
    assert.equal(result.airport, null, text);
    assert.equal(result.confidence, "unplaced", text);
    assert.equal(result.reason, "no match", text);
  }
});

test("N/A in the country column is not Namibia", () => {
  assert.equal(code("Paris", "N/A"), "CDG");
});

// ---- findAirport ----------------------------------------------------------------------------

test("findAirport accepts any airport by code, and a confident city match", () => {
  assert.equal(findAirport("INV").code, "INV");
  assert.equal(findAirport("egll").code, "LHR");
  assert.equal(findAirport("Utrecht").code, "AMS");
  assert.equal(findAirport("Springfield"), null); // ambiguous
  assert.equal(findAirport("Germany"), null); // country only
  assert.equal(findAirport("Narnia"), null);
});

test("hosts and the full list share record objects", () => {
  assert.equal(airportByCode("LHR"), guess("", "", { airport: "LHR" }).airport);
  assert.ok(haversineKm(airportByCode("LHR"), airportByCode("JFK")) > 5000);
});

// ---- Golden set -----------------------------------------------------------------------------

test("the golden set meets the target: no confident wrong answers, at least 95% correct", async () => {
  const { readFileSync } = await import("node:fs");
  const { classify, summarise, meetsTarget } = await import("../tools/scoring.mjs");
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/locations.json", import.meta.url), "utf8"));
  const rows = fixture.cases.map((testCase) => {
    const result = guessAirport(testCase.row);
    const outcome = classify(testCase, { code: result.airport?.code ?? null, confidence: result.confidence });
    return { testCase, result, outcome };
  });
  const summary = summarise(rows);
  assert.equal(summary.confidentWrong, 0);
  assert.ok(meetsTarget(summary), `accuracy ${(summary.accuracy * 100).toFixed(1)}%`);
});

// ---- Minor airports and region-only locations -------------------------------------------------

test("minorAirports are treated as medium, so the city's main airport wins", () => {
  for (const code of ["ADJ", "RML", "YQG"]) assert.equal(airportByCode(code).size, "M", code);
  assert.equal(airportByCode("AMM").size, "L");
  assert.equal(code("Colombo", "Sri Lanka"), "CMB");
  assert.equal(guess("Colombo", "Sri Lanka").confidence, "high");
});

test("a region's full name maps to its largest city, flagged", () => {
  const bali = guess("Bali", "Indonesia");
  assert.equal(bali.confidence, "medium");
  assert.equal(bali.reason, "region only: largest city is Denpasar");
  assert.equal(bali.airport.code, "DPS");
  assert.equal(guess("Bavaria", "Germany").reason, "region only: largest city is Munich");
  assert.equal(code("Bavaria", "Germany"), "MUC");
  assert.equal(guess("California").confidence, "medium");
  assert.equal(code("California"), "LAX");
  assert.equal(code("Ontario, Canada"), "YYZ");
  assert.equal(code("Queensland"), "BNE");
});

test("region-only never uses a bare abbreviation, and places win over regions", () => {
  assert.notEqual(guess("CA").reason.startsWith("region only"), true);
  assert.equal(guess("WA").reason.startsWith("region only"), false);
  assert.equal(code("Georgia"), "TBS"); // the country
  assert.equal(guess("Georgia").reason, "country only");
  assert.equal(code("Victoria", "Canada"), "YYJ"); // the city
  assert.equal(guess("Victoria", "Canada").reason.startsWith("region only"), false);
  assert.equal(guess("Paris", "France").reason.startsWith("region only"), false);
});
