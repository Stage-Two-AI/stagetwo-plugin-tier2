/**
 * Waar een app de plugin vandaan haalt: de marketplace in `.claude/settings.json` van de app
 * (besluit 16-10-2026, levering per klant).
 *
 * De template draagt de bronrepo van Stage Two (Stage-Two-AI/stagetwo-plugin-tier2). Bij een
 * abonnee moet daar zijn eigen leveringsrepo staan (`<klantorg>/stagetwo-plugin-tier2`, uit
 * levering.json): de bronrepo wordt afgeschermd, en een projectinstelling wint in Claude Code
 * van wat /stagetwo-tier2:installatie op gebruikersniveau zet. Daarom zetten /nieuwe-app en
 * het bijwerken (lib/toepassen.mjs) de bron in de app op de leveringsrepo.
 *
 * Welke bron (kiesPluginBron):
 *   1. de leveringsrepo van de klant (LEVERING.plugin): uit levering.json, of, als de plugin
 *      zonder levering.json draait, uit de instellingen van de gebruiker. Dat tweede is er
 *      voor een app van vóór template versie 22: die wijst nog naar de bronrepo, die
 *      projectinstelling wint, en dan draait de plugin uit de bronrepo zonder levering.json.
 *      De marketplace die /stagetwo-tier2:installatie op de computer zette, wijst wel naar
 *      de kopie van de klant; zo gaat de bron in de app bij de eerste update alsnog om
 *      (lib/levering.mjs). Bestaande apps zet Stage Two vóór het afschermen ook om met
 *      beheer/levering-omzetten.mjs;
 *   2. anders de bron die de app al heeft, als dat een leveringsrepo is (de beheerde run van
 *      Stage Two draait zonder levering.json en mag een klant niet terugzetten);
 *   3. anders de bronrepo van Stage Two (de eigen apps van Stage Two).
 *
 * Alleen de waarde van `repo` verandert; opmaak en de rest van het bestand blijven staan.
 */
import { LEVERING, STAGE_TWO } from "./levering.mjs";

export const SETTINGS_PAD = ".claude/settings.json";
export const MARKETPLACE = "stagetwo-tier2";
const REPO_VORM = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function isStageTwo(repo) {
  return String(repo ?? "").toLowerCase() === STAGE_TWO.plugin.toLowerCase();
}

function bronRegel(instellingen) {
  const source = instellingen?.extraKnownMarketplaces?.[MARKETPLACE]?.source;
  return source?.source === "github" && REPO_VORM.test(source.repo ?? "") ? source : null;
}

/** De repo (`eigenaar/naam`) waar de marketplace in deze settings-tekst naar wijst, of null. */
export function pluginBron(tekst) {
  try {
    return bronRegel(JSON.parse(tekst))?.repo ?? null;
  } catch {
    return null;
  }
}

/** De bron die een app krijgt; `huidigeTekst` is de settings.json die de app nu heeft (of null). */
export function kiesPluginBron(huidigeTekst, levering = LEVERING.plugin) {
  if (REPO_VORM.test(levering ?? "") && !isStageTwo(levering)) return levering;
  const huidig = huidigeTekst == null ? null : pluginBron(huidigeTekst);
  if (huidig && !isStageTwo(huidig)) return huidig;
  return STAGE_TWO.plugin;
}

/**
 * De settings-tekst met de bron op `repo`. Zonder marketplace-regel, met een andere soort bron
 * of zonder geldige JSON blijft de tekst zoals hij is: dan valt er niets veilig te zetten.
 */
export function metPluginBron(tekst, repo) {
  if (!REPO_VORM.test(repo ?? "")) return tekst;
  let instellingen;
  try {
    instellingen = JSON.parse(tekst);
  } catch {
    return tekst;
  }
  const bron = bronRegel(instellingen);
  if (!bron || bron.repo === repo) return tekst;
  // Eerst tekstueel, zodat de opmaak gelijk blijft aan die van de template.
  const oud = new RegExp(`("repo"\\s*:\\s*)${JSON.stringify(bron.repo).replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}`, "g");
  const treffers = tekst.match(oud) ?? [];
  if (treffers.length === 1) {
    const nieuw = tekst.replace(oud, `$1${JSON.stringify(repo)}`);
    if (pluginBron(nieuw) === repo) return nieuw;
  }
  bron.repo = repo;
  return `${JSON.stringify(instellingen, null, 2)}\n`;
}

/** Voor de vergelijking met de template: de bron telt niet mee als afwijking. */
export function zonderPluginBron(tekst) {
  return metPluginBron(tekst, STAGE_TWO.plugin);
}
