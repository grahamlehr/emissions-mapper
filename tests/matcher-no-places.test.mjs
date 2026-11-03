// Matching before the place names have loaded: hosts, aliases, airport municipalities and
// countries only. This file installs the airport data but never the places.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findAirport, guessAirport, installDataset, placesInstalled } from "../src/model.js";

const load = (name) => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), "utf8"));
installDataset({ airports: load("airports.json"), overrides: load("overrides.json") });

const guess = (location, country, extra = {}) => guessAirport({ location, country, ...extra });

test("places are not installed in this file", () => {
  assert.equal(placesInstalled(), false);
});

test("host cities, aliases and airport towns match without places", () => {
  assert.equal(guess("London", "United Kingdom").airport.code, "LHR");
  assert.equal(guess("London", "United Kingdom").confidence, "high");
  assert.equal(guess("Paris", "France").airport.code, "CDG");
  assert.equal(guess("NYC").airport.code, "JFK");
  assert.equal(guess("Bay Area, CA").airport.code, "SFO");
  assert.equal(guess("Sydney NSW").airport.code, "SYD");
  assert.equal(guess("Inverness", "United Kingdom").airport.code, "INV");
});

test("region constraints work from airport regions alone", () => {
  assert.equal(guess("Portland, OR").airport.code, "PDX");
  assert.equal(guess("London, ON").airport.code, "YXU");
});

test("airport codes, country only and junk work without places", () => {
  assert.equal(guess("", "", { airport: "EGLL" }).airport.code, "LHR");
  assert.equal(guess("Germany").airport.code, "FRA");
  assert.equal(guess("", "Spain").confidence, "medium");
  for (const text of ["Remote", "TBC", "N/A", "Europe", ""]) assert.equal(guess(text).airport, null, text);
});

test("unknown towns are unplaced rather than guessed, and typos need places", () => {
  const oxford = guess("Oxford", "United Kingdom");
  assert.equal(oxford.reason, "country only"); // not placed as a town, only as the country
  assert.equal(oxford.confidence, "medium");
  assert.equal(guess("Edinbrugh", "United Kingdom").reason.startsWith("possible typo"), false);
});

test("findAirport still works", () => {
  assert.equal(findAirport("LIS").code, "LIS");
  assert.equal(findAirport("INV").code, "INV");
  assert.equal(findAirport("Lisbon, Portugal").code, "LIS");
  assert.equal(findAirport("France"), null);
});
