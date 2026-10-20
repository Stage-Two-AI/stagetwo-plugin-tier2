/**
 * Waar plugin en template van deze klant vandaan komen (besluit 16-10-2026, levering per
 * klant). Een abonnee krijgt de plugin uit zijn eigen GitHub-org, bijvoorbeeld
 * Richplant-BV/stagetwo-plugin-tier2, en de workflow Uitleveren schrijft daarbij een
 * `levering.json` in de root van de plugin:
 *
 *   { "plugin": "<klantorg>/stagetwo-plugin-tier2", "template": "<klantorg>/app-template-tier2" }
 *
 * Zonder dat bestand kijkt de plugin naar de instellingen van de gebruiker
 * (~/.claude/settings.json, de marketplace stagetwo-tier2 die /stagetwo-tier2:installatie
 * zet). Wijst die naar `<org>/stagetwo-plugin-tier2` van een andere org dan Stage-Two-AI,
 * dan is dat de leveringsrepo, en de template `<org>/app-template-tier2`. Dat is nodig voor
 * een app van vóór template versie 26: daarin wijst `.claude/settings.json` nog naar de
 * bronrepo, en die projectinstelling wint in Claude Code. De plugin draait dan uit de
 * bronrepo, zonder levering.json, en zou de app anders nooit naar de kopie van de klant
 * zetten (zie lib/plugin-bron.mjs).
 *
 * Anders, of met een waarde die geen `eigenaar/repo` is, geldt per veld de repo van Stage Two
 * (de eigen apps van Stage Two).
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const STAGE_TWO = Object.freeze({
  plugin: "Stage-Two-AI/stagetwo-plugin-tier2",
  template: "Stage-Two-AI/app-template-tier2",
});
const MARKETPLACE = "stagetwo-tier2";
const PLUGIN_NAAM = STAGE_TWO.plugin.split("/")[1];
const TEMPLATE_NAAM = STAGE_TWO.template.split("/")[1];

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_VORM = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** ~/.claude/settings.json, of die in CLAUDE_CONFIG_DIR: dezelfde plek als Claude Code. */
export function instellingenPad(env = process.env) {
  // homedir() en niet $HOME: in Git Bash op Windows wijst $HOME soms ergens anders heen
  // dan de map die Claude Code zelf gebruikt (die volgt de Windows-gebruikersmap).
  const map = env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
  return join(map, "settings.json");
}

/**
 * De leveringsrepo's uit de instellingen van de gebruiker (tekst van settings.json), of null.
 * Alleen een github-bron `<org>/stagetwo-plugin-tier2` van een andere org dan Stage Two telt.
 */
export function leveringUitGebruiker(tekst) {
  let source;
  try {
    source = JSON.parse(tekst)?.extraKnownMarketplaces?.[MARKETPLACE]?.source;
  } catch {
    return null;
  }
  if (source?.source !== "github" || !REPO_VORM.test(source.repo ?? "")) return null;
  const [org, naam] = source.repo.split("/");
  if (naam.toLowerCase() !== PLUGIN_NAAM.toLowerCase()) return null;
  if (org.toLowerCase() === STAGE_TWO.plugin.split("/")[0].toLowerCase()) return null;
  return { plugin: source.repo, template: `${org}/${TEMPLATE_NAAM}` };
}

function leesTekst(pad) {
  try {
    return readFileSync(pad, "utf8");
  } catch {
    return null;
  }
}

/**
 * De leveringsrepo's: uit `<wortel>/levering.json`, anders uit de instellingen van de
 * gebruiker, per veld terugvallend op Stage Two.
 */
export function leesLevering(wortel = WORTEL, gebruikersPad = instellingenPad()) {
  let data = null;
  const tekst = leesTekst(join(wortel, "levering.json"));
  if (tekst !== null) {
    try {
      data = JSON.parse(tekst);
    } catch {
      // geen geldige JSON: alles van Stage Two
    }
  } else {
    const gebruiker = gebruikersPad ? leesTekst(gebruikersPad) : null;
    data = gebruiker === null ? null : leveringUitGebruiker(gebruiker);
  }
  const kies = (veld) => (typeof data?.[veld] === "string" && REPO_VORM.test(data[veld]) ? data[veld] : STAGE_TWO[veld]);
  return { plugin: kies("plugin"), template: kies("template") };
}

export const LEVERING = Object.freeze(leesLevering());
