#!/usr/bin/env node
/**
 * Bestaande apps van een klant omzetten naar zijn leveringsrepo (besluit 16-10-2026, levering
 * per klant). Voor Stage Two, in de projectfase, vóór het afschermen van de bronrepo.
 *
 *   node beheer/levering-omzetten.mjs --org <klantorg> <app> [<app> ...]            droogloop
 *   node beheer/levering-omzetten.mjs --org <klantorg> <app> [<app> ...] --doe-het  pull requests
 *
 * <app> is `naam` (in <klantorg>) of `eigenaar/naam`.
 *
 * Waarom: een app van vóór template versie 26 wijst in `.claude/settings.json`
 * nog naar Stage-Two-AI/stagetwo-plugin-tier2. Die projectinstelling wint in Claude Code van
 * de instelling op de computer, dus de plugin draait voor die app uit de bronrepo. Na het
 * afschermen van de bronrepo komt daar niets meer binnen. De plugin zet de bron zelf om bij
 * de eerstvolgende /stagetwo-tier2:updaten (lib/levering.mjs, lib/plugin-bron.mjs); dit script
 * doet het vooraf, zodat het niet afhangt van wanneer een bouwer gaat updaten.
 *
 * Oudere apps (template tot 15-10-2026, zoals Richplant teeltplanning) hebben de plugin nog
 * onder zijn oude naam: marketplace `stagetwo-cloudflare` met bron
 * `Stage-Two-AI/stack-plugin-cloudflare`, plugin `stack-cloudflare@stagetwo-cloudflare`.
 * Dezelfde oude namen die /stagetwo-tier2:installatie op de computer opruimt
 * (OUDE_MARKETPLACES en OUDE_PLUGINS in automatisch-bijwerken.mjs). Zo'n regel gaat naar de
 * huidige naam `stagetwo-tier2` met de leveringsrepo als bron, en de sleutel in
 * `enabledPlugins` gaat mee. Een app met de marketplace van tier 1 slaat dit script over.
 *
 * Per app één pull request op de branch `stagetwo-levering-omzetten` die alleen
 * `.claude/settings.json` verandert (bij een huidige naam alleen de waarde van `repo`, en een
 * `autoUpdate` op de regel gaat eruit: die zou de keuze van de bouwer op zijn computer
 * overschrijven, zie lib/plugin-bron.mjs), met
 * de bevestigingsregel die guard:template vraagt. Alles via de GitHub-API (gh), zonder kloon.
 * Met --doe-het stopt het script als de leveringsrepo nog geen levering.json heeft: dan
 * heeft Uitleveren daar nog niets neergezet, en wijst een app na de merge naar een lege repo.
 * De droogloop kijkt dan toch per app en meldt het.
 *
 * Daarnaast zet het per app de beveiligingsupdates van Dependabot aan (vulnerability-alerts
 * en automated-security-fixes), als die nog uit staan. Het aanbod belooft dat Dependabot in
 * elke app updates voorstelt, ook zonder abonnement; bij apps van vóór 17-10-2026 staat dat
 * uit (nieuwe apps krijgen het van App inrichten in de beheer-repo). Dat vraagt
 * beheerdersrechten op de app-repo, die de gh-sessie van Stage Two in de projectfase heeft.
 * Lukt het niet, dan zegt het script wat er met de hand moet.
 *
 * Zonder --doe-het verandert er niets. Met GH_TOKEN of GITHUB_TOKEN in de omgeving weigert het,
 * zoals beheerd.mjs: draaien met de eigen gh-sessie van Stage Two, niet met een klanttoken.
 * Dit script gaat niet mee naar een klant (ALLEEN_IN_BRON in uitleveren.mjs).
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BEVESTIGING } from "../lib/pr-tekst.mjs";
import { MARKETPLACE, SETTINGS_PAD, metPluginBron, pluginBron, zonderAutoUpdate } from "../lib/plugin-bron.mjs";
import { OUDE_MARKETPLACES, OUDE_PLUGINS } from "../skills/installatie/scripts/automatisch-bijwerken.mjs";
import { leveringVoor } from "./uitleveren.mjs";

export const BRANCH = "stagetwo-levering-omzetten";
export const IDENTITEIT = Object.freeze({ name: "Stage Two", email: "info@stagetwo.nl" });
export const TITEL = "Plugin uit de eigen kopie van de werkwijze halen";
/** Repo-namen van de plugin onder zijn oude naam (tot 15-10-2026), bij elke eigenaar. */
export const OUDE_BRONNEN = Object.freeze(["stack-plugin-cloudflare"]);
/** Marketplaces van de andere variant: die app hoort bij het script van stagetwo-plugin-tier1. */
export const ANDERE_TIER = Object.freeze({ marketplaces: ["stagetwo-tier1", "stagetwo-light"], plugin: "stagetwo-plugin-tier1" });
const HANDSTAP_DEPENDABOT = "zet het met de hand aan: Settings, Code security, Dependabot alerts en Dependabot security updates op Enable";
const ORG_VORM = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_VORM = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function standaardGh(args, { input } = {}) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    input,
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    timeout: 120000,
  }).trim();
}

function eersteRegel(fout) {
  return String(fout?.stderr || fout?.message || fout).trim().split("\n")[0];
}

export function leesArgumenten(argv) {
  const uit = { org: null, apps: [], doeHet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--doe-het") uit.doeHet = true;
    else if (a === "--org") uit.org = argv[++i] ?? null;
    else if (a.startsWith("--")) throw new Error(`onbekend argument: ${a}`);
    else uit.apps.push(a);
  }
  if (!ORG_VORM.test(uit.org ?? "")) throw new Error("geef de org van de klant mee: --org <klantorg>");
  if (uit.apps.length === 0) throw new Error("geef minstens één app mee: naam of eigenaar/naam");
  uit.apps = uit.apps.map((app) => (app.includes("/") ? app : `${uit.org}/${app}`));
  for (const app of uit.apps) {
    if (!REPO_VORM.test(app)) throw new Error(`"${app}" is geen eigenaar/naam`);
  }
  return uit;
}

/** De tekst van de pull request in de app van de klant. `oud`: de oude marketplace-naam, als die er stond. */
export function prTekst({ van, naar, oud = null }) {
  const naam = oud
    ? [
        `De plugin staat in deze app nog onder zijn oude naam (marketplace \`${oud}\`, tot 15-10-2026). Die gaat naar de huidige naam \`${MARKETPLACE}\`, met dezelfde werking.`,
        "",
      ]
    : [];
  const wat = oud
    ? "Wat er verandert: alleen `.claude/settings.json`, de naam en de bron van de plugin."
    : "Wat er verandert: alleen de bron van de plugin in `.claude/settings.json`.";
  return [
    `Deze pull request laat deze app de Stage Two-plugin halen uit de kopie van de werkwijze in de eigen organisatie, \`${naar}\`, in plaats van uit \`${van}\`.`,
    "",
    ...naam,
    "Een instelling in de app gaat in Claude Code voor op de instelling op de computer. Zolang hier de oude bron staat, komen nieuwe versies uit de eigen kopie niet in deze app aan.",
    "",
    "Of de plugin zichzelf bijwerkt, staat voortaan niet meer in de app maar alleen op de computer van elke bouwer; zo kan iemand die dat niet wil, het daar uitzetten.",
    "",
    `${wat} De schermen, de servercode en de gegevens blijven zoals ze zijn; de app werkt na de merge precies als nu.`,
    "",
    "Wat je doet: wacht tot de controles groen zijn en klik op **Merge**. Open de app daarna opnieuw in Claude Code.",
    "",
    "Aangemaakt door Stage Two. Dit bestand hoort bij de werkwijze; de laatste regel laat de controle weten dat deze wijziging bewust is.",
    "",
    "Cloudflare-preview: niet van toepassing, deze wijziging raakt de app zelf niet",
    "",
    "Geen tests nodig: alleen de bron van de plugin in de instellingen verandert",
    "",
    BEVESTIGING,
  ].join("\n");
}

const REPO_NAAM = (repo) => String(repo ?? "").split("/")[1]?.toLowerCase() ?? "";

/** Is deze marketplace-regel de plugin onder zijn oude naam (op naam of op bron)? */
function isOudeRegel(naam, regel) {
  if (naam === MARKETPLACE) return false;
  if (OUDE_MARKETPLACES.includes(naam)) return true;
  return regel?.source?.source === "github" && OUDE_BRONNEN.includes(REPO_NAAM(regel.source.repo));
}

/**
 * Wat er in de settings-tekst van een app staat:
 *   { soort: "huidig", van }          marketplace stagetwo-tier2 (bron `van`)
 *   { soort: "oud", van, oud }        de plugin onder zijn oude naam `oud` (bron `van`)
 *   { soort: "andere-tier", naam }    de marketplace van de andere variant
 *   { soort: "geen", namen }          geen van alle (`namen`: wat er wel staat)
 *   { soort: "onleesbaar" }           geen geldige JSON
 */
export function leesInstellingen(tekst) {
  let instellingen;
  try {
    instellingen = JSON.parse(tekst);
  } catch {
    return { soort: "onleesbaar" };
  }
  const markten = instellingen?.extraKnownMarketplaces ?? {};
  const oud = Object.keys(markten).find((naam) => isOudeRegel(naam, markten[naam]));
  if (oud) return { soort: "oud", van: markten[oud]?.source?.repo ?? oud, oud };
  const van = pluginBron(tekst);
  if (van) return { soort: "huidig", van };
  const ander = Object.keys(markten).find((naam) => ANDERE_TIER.marketplaces.includes(naam));
  if (ander) return { soort: "andere-tier", naam: ander };
  return { soort: "geen", namen: Object.keys(markten) };
}

/**
 * De settings-tekst met de plugin uit `levering`. Een oude marketplace-regel wordt de regel
 * `stagetwo-tier2` (op dezelfde plek), en elke `<plugin>@<oude marketplace>` in enabledPlugins
 * wordt `stagetwo-tier2@stagetwo-tier2` met dezelfde waarde. Bij een huidige naam verandert
 * alleen de waarde van `repo` (metPluginBron). In beide gevallen gaat `autoUpdate` van de regel
 * af (zonderAutoUpdate). Wat niets met de plugin te maken heeft, blijft.
 */
export function naarLevering(tekst, levering) {
  const gelezen = leesInstellingen(tekst);
  if (gelezen.soort === "huidig") return zonderAutoUpdate(metPluginBron(tekst, levering));
  if (gelezen.soort !== "oud") return tekst;
  const instellingen = JSON.parse(tekst);
  const markten = instellingen.extraKnownMarketplaces;
  const oude = Object.keys(markten).filter((naam) => isOudeRegel(naam, markten[naam]));
  const { autoUpdate: _niet, ...huidigeRegel } = markten[MARKETPLACE] ?? {};
  const nieuweRegel = { ...huidigeRegel, source: { source: "github", repo: levering } };
  const nieuweMarkten = {};
  for (const [naam, regel] of Object.entries(markten)) {
    if (oude.includes(naam) || naam === MARKETPLACE) {
      if (!(MARKETPLACE in nieuweMarkten)) nieuweMarkten[MARKETPLACE] = nieuweRegel;
    } else {
      nieuweMarkten[naam] = regel;
    }
  }
  instellingen.extraKnownMarketplaces = nieuweMarkten;
  if (instellingen.enabledPlugins && typeof instellingen.enabledPlugins === "object") {
    const sleutel = `${MARKETPLACE}@${MARKETPLACE}`;
    const isOud = (p) => OUDE_PLUGINS.includes(p) || oude.some((naam) => p.endsWith(`@${naam}`));
    const plugins = {};
    for (const [p, aan] of Object.entries(instellingen.enabledPlugins)) {
      if (isOud(p) || p === sleutel) {
        if (!(sleutel in plugins)) plugins[sleutel] = instellingen.enabledPlugins[sleutel] ?? aan;
      } else {
        plugins[p] = aan;
      }
    }
    instellingen.enabledPlugins = plugins;
  }
  return `${JSON.stringify(instellingen, null, 2)}\n`;
}

/** Heeft de leveringsrepo een levering.json die naar zichzelf wijst? */
function leveringStaat(gh, levering) {
  try {
    const bestand = JSON.parse(gh(["api", `repos/${levering}/contents/levering.json`]));
    const data = JSON.parse(Buffer.from(bestand.content ?? "", "base64").toString("utf8"));
    return String(data.plugin ?? "").toLowerCase() === levering.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * De beveiligingsupdates van Dependabot in deze app: "aan", "zou-aanzetten" (droogloop),
 * "aangezet" (met doeHet), of "niet gelukt: <reden>; <handstap>".
 */
export function dependabotBeveiliging({ app, doeHet, gh }) {
  let aan;
  try {
    aan = JSON.parse(gh(["api", `repos/${app}/automated-security-fixes`])).enabled === true;
  } catch (fout) {
    // 404: de waarschuwingen (vulnerability-alerts) staan ook uit; dan geldt het als uit.
    if (!/404|not found/i.test(eersteRegel(fout))) return `niet op te vragen: ${eersteRegel(fout)}; ${HANDSTAP_DEPENDABOT}`;
    aan = false;
  }
  if (aan) return "aan";
  if (!doeHet) return "zou-aanzetten";
  try {
    // Eerst de waarschuwingen: zonder die weigert GitHub de beveiligingsupdates.
    gh(["api", "-X", "PUT", `repos/${app}/vulnerability-alerts`]);
    gh(["api", "-X", "PUT", `repos/${app}/automated-security-fixes`]);
    return "aangezet";
  } catch (fout) {
    return `niet gelukt: ${eersteRegel(fout)}; ${HANDSTAP_DEPENDABOT}`;
  }
}

/** De bron van de plugin in één app: kijken, en met doeHet de pull request openen. */
function zetBronOm({ app, basis, levering, doeHet, gh }) {
  let bestand;
  try {
    bestand = JSON.parse(gh(["api", `repos/${app}/contents/${SETTINGS_PAD}?ref=${basis}`]));
  } catch (fout) {
    if (/404|not found/i.test(eersteRegel(fout))) return { app, status: "overgeslagen", reden: `geen ${SETTINGS_PAD}` };
    return { app, status: "mislukt", reden: `${SETTINGS_PAD} is niet op te vragen: ${eersteRegel(fout)}` };
  }
  const tekst = Buffer.from(bestand.content ?? "", "base64").toString("utf8");
  const gelezen = leesInstellingen(tekst);
  if (gelezen.soort === "andere-tier") {
    return { app, status: "overgeslagen", reden: `marketplace ${gelezen.naam} hoort bij de andere variant; gebruik beheer/levering-omzetten.mjs uit ${ANDERE_TIER.plugin}` };
  }
  if (gelezen.soort === "onleesbaar") return { app, status: "overgeslagen", reden: `${SETTINGS_PAD} is geen geldige JSON` };
  if (gelezen.soort === "geen") {
    const wel = gelezen.namen.length > 0 ? ` (wel: ${gelezen.namen.join(", ")})` : "";
    return { app, status: "overgeslagen", reden: `geen marketplace ${[MARKETPLACE, ...OUDE_MARKETPLACES].join(" of ")} in ${SETTINGS_PAD}${wel}` };
  }
  const { van } = gelezen;
  const oud = gelezen.soort === "oud" ? gelezen.oud : null;
  if (!oud && van.toLowerCase() === levering.toLowerCase()) return { app, status: "al-goed" };
  const nieuw = naarLevering(tekst, levering);
  const na = leesInstellingen(nieuw);
  if (na.soort !== "huidig" || na.van !== levering) return { app, status: "overgeslagen", reden: "de bron is niet veilig om te zetten" };
  const wat = oud ? { van, oud, naar: levering } : { van, naar: levering };

  let open = [];
  try {
    open = JSON.parse(gh(["pr", "list", "-R", app, "--head", BRANCH, "--state", "open", "--json", "url"]) || "[]");
  } catch (fout) {
    return { app, status: "mislukt", reden: `de open pull requests zijn niet op te vragen: ${eersteRegel(fout)}` };
  }
  if (open.length > 0) return { app, status: "staat-open", pr: open[0].url };
  if (!doeHet) return { app, status: "zou-omzetten", ...wat };

  try {
    const sha = gh(["api", `repos/${app}/git/ref/heads/${basis}`, "--jq", ".object.sha"]);
    try {
      gh(["api", "-X", "POST", `repos/${app}/git/refs`, "-f", `ref=refs/heads/${BRANCH}`, "-f", `sha=${sha}`]);
    } catch {
      // De branch bestaat al, zonder open pull request: opnieuw op de basis zetten.
      gh(["api", "-X", "PATCH", `repos/${app}/git/refs/heads/${BRANCH}`, "-f", `sha=${sha}`, "-F", "force=true"]);
    }
    const inhoud = {
      message: oud ? `Plugin onder de naam ${MARKETPLACE} uit ${levering} halen` : `Plugin uit ${levering} halen`,
      content: Buffer.from(nieuw, "utf8").toString("base64"),
      sha: bestand.sha,
      branch: BRANCH,
      committer: IDENTITEIT,
      author: IDENTITEIT,
    };
    gh(["api", "-X", "PUT", `repos/${app}/contents/${SETTINGS_PAD}`, "--input", "-"], { input: JSON.stringify(inhoud) });
    const pr = gh(["pr", "create", "-R", app, "--base", basis, "--head", BRANCH, "--title", TITEL, "--body", prTekst({ van, naar: levering, oud })]);
    return { app, status: "omgezet", ...wat, pr };
  } catch (fout) {
    return { app, status: "mislukt", reden: eersteRegel(fout) };
  }
}

/** Eén app: de bron van de plugin en de beveiligingsupdates van Dependabot. */
export function zetAppOm({ app, levering, doeHet, gh }) {
  let basis;
  try {
    basis = JSON.parse(gh(["api", `repos/${app}`])).default_branch;
  } catch (fout) {
    return { app, status: "mislukt", reden: `de repo is niet op te vragen: ${eersteRegel(fout)}` };
  }
  const uit = zetBronOm({ app, basis, levering, doeHet, gh });
  return { ...uit, dependabot: dependabotBeveiliging({ app, doeHet, gh }) };
}

/**
 * Alle apps van één klant. Met doeHet stopt het meteen als de leveringsrepo nog niet
 * klaarstaat; de droogloop kijkt dan toch en geeft de reden mee als `waarschuwing`.
 */
export function omzetten({ org, apps, doeHet = false, gh = standaardGh }) {
  const levering = leveringVoor(org).plugin;
  if (!leveringStaat(gh, levering)) {
    const reden = `${levering} heeft nog geen levering.json; draai eerst Uitleveren voor ${org}`;
    if (doeHet) return { levering, status: "gestopt", reden, apps: [] };
    return { levering, status: "klaar", waarschuwing: reden, apps: apps.map((app) => zetAppOm({ app, levering, doeHet, gh })) };
  }
  return { levering, status: "klaar", apps: apps.map((app) => zetAppOm({ app, levering, doeHet, gh })) };
}

export function hoofd(argv, { env = process.env, log = console.log, gh = standaardGh } = {}) {
  if (env.GH_TOKEN || env.GITHUB_TOKEN) {
    log("draai dit vanuit /home/claude met je eigen gh-sessie, niet met een klanttoken");
    return 1;
  }
  const opties = leesArgumenten(argv);
  const uit = omzetten({ ...opties, gh });
  log(`${opties.doeHet ? "Omzetten" : "Droogloop"} naar ${uit.levering}`);
  if (uit.status === "gestopt") {
    log(`  gestopt: ${uit.reden}`);
    return 1;
  }
  if (uit.waarschuwing) log(`  let op: ${uit.waarschuwing}; met --doe-het stopt het script tot dan`);
  for (const r of uit.apps) {
    const oud = r.oud ? `, oude naam ${r.oud}` : "";
    const extra = r.pr ? ` ${r.pr}` : r.reden ? `: ${r.reden}` : r.van ? ` (nu ${r.van}${oud})` : "";
    log(`  ${r.app}: ${r.status}${extra}`);
    if (r.dependabot) log(`    beveiligingsupdates van Dependabot: ${r.dependabot}`);
  }
  if (!opties.doeHet && uit.apps.some((r) => r.status === "zou-omzetten" || r.dependabot === "zou-aanzetten")) {
    log("Niets veranderd. Opnieuw met --doe-het om de pull requests te openen en Dependabot aan te zetten.");
  }
  return uit.apps.some((r) => r.status === "mislukt" || /^niet /.test(r.dependabot ?? "")) ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = hoofd(process.argv.slice(2));
  } catch (fout) {
    process.stderr.write(`${eersteRegel(fout)}\n`);
    process.exitCode = 1;
  }
}
