// Installs the real airport data and place names from disk, the way the browser does after
// fetching them. Import this first in any test that needs airports.
import { readFileSync } from "node:fs";
import { installDataset, installPlaces } from "../../src/model.js";

const load = (name) => JSON.parse(readFileSync(new URL(`../../data/${name}`, import.meta.url), "utf8"));

installDataset({ airports: load("airports.json"), overrides: load("overrides.json") });
installPlaces(load("places.json"));
