/**
 * Waar plugin en template van deze klant vandaan komen (besluit 16-10-2026, levering per
 * klant). Een abonnee krijgt de plugin uit zijn eigen GitHub-org, bijvoorbeeld
 * Richplant-BV/stagetwo-plugin-tier2, en de workflow Uitleveren schrijft daarbij een
 * `levering.json` in de root van de plugin:
 *
 *   { "plugin": "<klantorg>/stagetwo-plugin-tier2", "template": "<klantorg>/app-template-tier2" }
 *
 * Sinds versie 43 heeft tier 2 een tweede template, app-template-tier2-openbaar (de server maakt
 * de pagina's: vindbare sites, shops en klantportalen). Die levert Stage Two per abonnee
 * (`"openbaar": true` in abonnees.json); dan staat er een derde veld in levering.json:
 *
 *   "templateOpenbaar": "<klantorg>/app-template-tier2-openbaar"
 *
 * Zonder dat veld zit de openbare template niet in de levering van deze klant
 * (`templateOpenbaar: null`). Dan valt de plugin nooit terug op de gewone template: een app van
 * de openbare template krijgt dan een duidelijke melding (templateBron hieronder).
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
 * (de eigen apps van Stage Two). Voor `templateOpenbaar` alleen als er geen levering is (geen
 * levering.json en geen leveringsrepo in de instellingen): een levering zonder dat veld heeft
 * de openbare template niet, en dan is het null.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { KEND_FORMAAT } from "./manifest.mjs";

export const STAGE_TWO = Object.freeze({
  plugin: "Stage-Two-AI/stagetwo-plugin-tier2",
  template: "Stage-Two-AI/app-template-tier2",
});
/** De openbare template van Stage Two (sinds versie 43); apart van STAGE_TWO, dat de levering van versie 42 beschrijft. */
export const STAGE_TWO_OPENBAAR = "Stage-Two-AI/app-template-tier2-openbaar";

/** De twee templates van tier 2, zoals het veld `template` in .claude/stack-manifest.json ze noemt. */
export const TEMPLATE_GEWOON = "app-template-tier2";
export const TEMPLATE_OPENBAAR = "app-template-tier2-openbaar";
export const TEMPLATES = Object.freeze([TEMPLATE_GEWOON, TEMPLATE_OPENBAAR]);
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
  const openbaar = data?.templateOpenbaar;
  const templateOpenbaar =
    typeof openbaar === "string" && REPO_VORM.test(openbaar) ? openbaar : data === null || data === undefined ? STAGE_TWO_OPENBAAR : null;
  return { plugin: kies("plugin"), template: kies("template"), templateOpenbaar };
}

export const LEVERING = Object.freeze(leesLevering());

/**
 * Uit welke template een app komt, gecontroleerd aan zijn manifest (het ruwe JSON-object):
 * `{ template }` met een naam uit TEMPLATES, of `{ fout }` met één zin in gewone taal.
 *
 * - `manifestFormaat` ontbreekt: formaat 1. Een formaat dat deze plugin niet kent: werk de plugin bij.
 * - Formaat 1: zonder veld `template` is het de gewone template (zo staat het in elke app van
 *   vóór versie 43); met het veld moet het een bekende naam zijn.
 * - Formaat 2 (sinds versie 43): het veld `template` is verplicht.
 * - Alleen een ONTBREKEND veld is de gewone template. null, een lege tekst, een getal, een lijst
 *   of een onbekende naam is een fout: dan is niet zeker uit welke template de app komt, en
 *   bijwerken met de verkeerde zet er bestanden in die niet bij de app horen.
 * - `heeftServercode`: de app heeft react-router.config.ts, het kenmerk van de openbare template.
 *   Staat er dan geen veld `template`, dan heeft iemand het weggehaald; niet bijwerken met de
 *   gewone template, maar stoppen met uitleg.
 */
export function manifestTemplate(ruw, { heeftServercode = false } = {}) {
  if (!ruw || typeof ruw !== "object" || Array.isArray(ruw)) {
    return { fout: "het manifest van deze app (.claude/stack-manifest.json) is niet te lezen" };
  }
  const formaat = ruw.manifestFormaat ?? 1;
  if (!Number.isInteger(formaat) || formaat < 1 || formaat > KEND_FORMAAT) {
    return {
      fout: `het manifest van deze app heeft manifestFormaat ${JSON.stringify(formaat)}, en deze plugin kent tot en met formaat ${KEND_FORMAAT}. Werk eerst de plugin bij met /stagetwo-tier2:updaten; er is niets veranderd`,
    };
  }
  if (!Object.hasOwn(ruw, "template")) {
    if (formaat >= 2) {
      return {
        fout: `het manifest van deze app (.claude/stack-manifest.json) heeft manifestFormaat ${formaat} maar geen veld "template", en dat is bij dat formaat verplicht. Dan is niet zeker uit welke template de app komt, dus er wordt niets bijgewerkt. Zet het veld terug zoals het in de template staat ("template": "${TEMPLATE_GEWOON}" of "${TEMPLATE_OPENBAAR}"), in een eigen pull request`,
      };
    }
    if (heeftServercode) {
      return {
        fout: `deze app heeft react-router.config.ts, het kenmerk van de openbare template (${TEMPLATE_OPENBAAR}), maar in het manifest (.claude/stack-manifest.json) staat geen veld "template". Waarschijnlijk is dat veld weggehaald. Bijwerken met de gewone template zou bestanden van de verkeerde template in de app zetten, dus er gebeurt niets. Zet "template": "${TEMPLATE_OPENBAAR}" terug in het manifest, in een eigen pull request`,
      };
    }
    return { template: TEMPLATE_GEWOON };
  }
  const naam = ruw.template;
  if (typeof naam === "string" && TEMPLATES.includes(naam)) return { template: naam };
  return {
    fout: `in het manifest van deze app (.claude/stack-manifest.json) staat "template": ${JSON.stringify(naam)}; dat is geen template die deze plugin kent (${TEMPLATES.join(" of ")}). Dan is niet zeker uit welke template de app komt, dus er wordt niets bijgewerkt. Klopt de naam niet, zet hem dan goed in een eigen pull request; is het een nieuwe template, werk dan eerst de plugin bij met /stagetwo-tier2:updaten`,
  };
}

/**
 * De naam van de template van een app (zie manifestTemplate), of null als het manifest dat niet
 * eenduidig zegt. Voor tellingen en meldingen; wie bijwerkt, gebruikt manifestTemplate en meldt de fout.
 */
export function templateVan(manifestRuw) {
  return manifestTemplate(manifestRuw).template ?? null;
}

/** Een gewone zin over welke template het is, voor meldingen. */
export function templateOmschrijving(naam) {
  if (naam === TEMPLATE_OPENBAAR) return "de openbare template van tier 2 (app-template-tier2-openbaar, de server maakt de pagina's)";
  if (naam === TEMPLATE_GEWOON) return "de gewone template van tier 2 (app-template-tier2)";
  return `een template die deze plugin niet kent (${JSON.stringify(naam)})`;
}

/**
 * Waar de template van een app vandaan komt: `{ repo }`, of `{ fout }` met één zin in gewone
 * taal. STACK_TEMPLATE_REPO (de werkplaats, tests) gaat voor; wie daarmee de verkeerde template
 * aanwijst, wordt na het klonen tegengehouden (zie updaten). Zonder die variabele: de gewone
 * template uit de levering, of de openbare. Zit de openbare niet in de levering, dan een fout,
 * nooit de gewone template als vervanger: dan kwamen er bestanden van de verkeerde template in
 * de app.
 */
export function templateBron({ template = TEMPLATE_GEWOON, env = process.env, levering = LEVERING } = {}) {
  if (!TEMPLATES.includes(template)) {
    return { fout: `deze app komt uit ${templateOmschrijving(template)}; deze plugin werkt alleen apps uit de templates van tier 2 bij (${TEMPLATES.join(" en ")}). Werk de plugin bij met /stagetwo-tier2:updaten; kent ook de nieuwste plugin hem niet, dan hoort de app bij een andere plugin` };
  }
  if (env?.STACK_TEMPLATE_REPO) return { repo: env.STACK_TEMPLATE_REPO };
  if (template === TEMPLATE_GEWOON) return { repo: levering.template };
  if (levering.templateOpenbaar) return { repo: levering.templateOpenbaar };
  return { fout: NIET_IN_LEVERING, nietInLevering: true };
}

/** De melding als een app van de openbare template is, maar die template niet in de levering zit. */
export const NIET_IN_LEVERING =
  "deze app komt uit de openbare template van tier 2 (app-template-tier2-openbaar), maar die zit niet in de levering van jullie organisatie, dus de plugin weet niet waar de nieuwste versie staat. " +
  "Bijwerken met de gewone template kan niet: dan komen er bestanden in die niet bij deze app horen. De app werkt gewoon door en je kunt verder bouwen; alleen bijwerken naar een nieuwe versie kan nu niet. " +
  "De openbare template komt in de levering als de owner van de organisatie hem bij het abonnement aanzet; de levering zet hem dan in <organisatie>/app-template-tier2-openbaar, en daarna werkt bijwerken vanzelf";

/**
 * De melding als de openbare template wel in de levering staat (`templateOpenbaar` in
 * levering.json), maar niet bereikbaar is: geen netwerk, of de levering in die repo is (nog) niet
 * gelukt. Wat er aan de hand is en wat de owner doet; de bouwer kan intussen gewoon verder.
 */
export function openbaarNietBereikbaar(repo) {
  return (
    `de openbare template staat in de levering van jullie organisatie (${repo}), maar is niet bereikbaar. Of er is geen netwerk, of die repo bestaat nog niet, is leeg of niet openbaar: dan is de levering van de openbare template daarin (nog) niet gelukt. ` +
    "Je kunt gewoon verder bouwen. Lukt het later nog niet, dan kijkt de owner van de organisatie op GitHub of " +
    `${repo} bestaat en openbaar is, of bij die repo (Settings) het vinkje Template repository aanstaat, en of de GitHub App stagetwo-levering er toegang toe heeft (instellingen van de organisatie, GitHub Apps, stagetwo-levering, Configure). ` +
    "Staat dat goed, dan vraagt hij Stage Two de levering opnieuw te starten"
  );
}
