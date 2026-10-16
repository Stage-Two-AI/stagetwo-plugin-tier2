/**
 * Waar plugin en template van deze klant vandaan komen (besluit 16-10-2026, levering per
 * klant). Een abonnee krijgt de plugin uit zijn eigen GitHub-org, bijvoorbeeld
 * Richplant-BV/stagetwo-plugin-tier2, en de workflow Uitleveren schrijft daarbij een
 * `levering.json` in de root van de plugin:
 *
 *   { "plugin": "<klantorg>/stagetwo-plugin-tier2", "template": "<klantorg>/app-template-tier2" }
 *
 * Zonder dat bestand (de bronrepo zelf, de eigen apps van Stage Two) of met een waarde die
 * geen `eigenaar/repo` is, geldt per veld de repo van Stage Two.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const STAGE_TWO = Object.freeze({
  plugin: "Stage-Two-AI/stagetwo-plugin-tier2",
  template: "Stage-Two-AI/app-template-tier2",
});

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_VORM = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** De leveringsrepo's uit `<wortel>/levering.json`, per veld terugvallend op Stage Two. */
export function leesLevering(wortel = WORTEL) {
  let data = null;
  try {
    data = JSON.parse(readFileSync(join(wortel, "levering.json"), "utf8"));
  } catch {
    // geen bestand of geen geldige JSON: alles van Stage Two
  }
  const kies = (veld) => (typeof data?.[veld] === "string" && REPO_VORM.test(data[veld]) ? data[veld] : STAGE_TWO[veld]);
  return { plugin: kies("plugin"), template: kies("template") };
}

export const LEVERING = Object.freeze(leesLevering());
