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
 * Waarom: een app van vóór template versie 22 (tier 1: 25) wijst in `.claude/settings.json`
 * nog naar Stage-Two-AI/stagetwo-plugin-tier2. Die projectinstelling wint in Claude Code van
 * de instelling op de computer, dus de plugin draait voor die app uit de bronrepo. Na het
 * afschermen van de bronrepo komt daar niets meer binnen. De plugin zet de bron zelf om bij
 * de eerstvolgende /stagetwo-tier2:updaten (lib/levering.mjs, lib/plugin-bron.mjs); dit script
 * doet het vooraf, zodat het niet afhangt van wanneer een bouwer gaat updaten.
 *
 * Per app één pull request op de branch `stagetwo-levering-omzetten` die alleen de waarde van
 * `repo` in `.claude/settings.json` verandert, met de bevestigingsregel die guard:template
 * vraagt. Alles via de GitHub-API (gh), zonder kloon. Het script stopt als de leveringsrepo
 * nog geen levering.json heeft: dan heeft Uitleveren daar nog niets neergezet, en wijst een
 * app na de merge naar een lege repo.
 *
 * Zonder --doe-het verandert er niets. Met GH_TOKEN of GITHUB_TOKEN in de omgeving weigert het,
 * zoals beheerd.mjs: draaien met de eigen gh-sessie van Stage Two, niet met een klanttoken.
 * Dit script gaat niet mee naar een klant (ALLEEN_IN_BRON in uitleveren.mjs).
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BEVESTIGING } from "../lib/pr-tekst.mjs";
import { MARKETPLACE, SETTINGS_PAD, metPluginBron, pluginBron } from "../lib/plugin-bron.mjs";
import { leveringVoor } from "./uitleveren.mjs";

export const BRANCH = "stagetwo-levering-omzetten";
export const IDENTITEIT = Object.freeze({ name: "Stage Two", email: "info@stagetwo.nl" });
export const TITEL = "Plugin uit de eigen kopie van de werkwijze halen";
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

/** De tekst van de pull request in de app van de klant. */
export function prTekst({ van, naar }) {
  return [
    `Deze pull request laat deze app de Stage Two-plugin halen uit de kopie van de werkwijze in de eigen organisatie, \`${naar}\`, in plaats van uit \`${van}\`.`,
    "",
    "Een instelling in de app gaat in Claude Code voor op de instelling op de computer. Zolang hier de oude bron staat, komen nieuwe versies uit de eigen kopie niet in deze app aan.",
    "",
    "Wat er verandert: alleen de regel `repo` in `.claude/settings.json`. De schermen, de servercode en de gegevens blijven zoals ze zijn; de app werkt na de merge precies als nu.",
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

/** Eén app: kijken, en met doeHet de pull request openen. */
export function zetAppOm({ app, levering, doeHet, gh }) {
  let basis;
  try {
    basis = JSON.parse(gh(["api", `repos/${app}`])).default_branch;
  } catch (fout) {
    return { app, status: "mislukt", reden: `de repo is niet op te vragen: ${eersteRegel(fout)}` };
  }
  let bestand;
  try {
    bestand = JSON.parse(gh(["api", `repos/${app}/contents/${SETTINGS_PAD}?ref=${basis}`]));
  } catch (fout) {
    if (/404|not found/i.test(eersteRegel(fout))) return { app, status: "overgeslagen", reden: `geen ${SETTINGS_PAD}` };
    return { app, status: "mislukt", reden: `${SETTINGS_PAD} is niet op te vragen: ${eersteRegel(fout)}` };
  }
  const tekst = Buffer.from(bestand.content ?? "", "base64").toString("utf8");
  const van = pluginBron(tekst);
  if (!van) return { app, status: "overgeslagen", reden: `geen marketplace ${MARKETPLACE} in ${SETTINGS_PAD}` };
  if (van.toLowerCase() === levering.toLowerCase()) return { app, status: "al-goed" };
  const nieuw = metPluginBron(tekst, levering);
  if (pluginBron(nieuw) !== levering) return { app, status: "overgeslagen", reden: "de bron is niet veilig om te zetten" };

  let open = [];
  try {
    open = JSON.parse(gh(["pr", "list", "-R", app, "--head", BRANCH, "--state", "open", "--json", "url"]) || "[]");
  } catch (fout) {
    return { app, status: "mislukt", reden: `de open pull requests zijn niet op te vragen: ${eersteRegel(fout)}` };
  }
  if (open.length > 0) return { app, status: "staat-open", pr: open[0].url };
  if (!doeHet) return { app, status: "zou-omzetten", van, naar: levering };

  try {
    const sha = gh(["api", `repos/${app}/git/ref/heads/${basis}`, "--jq", ".object.sha"]);
    try {
      gh(["api", "-X", "POST", `repos/${app}/git/refs`, "-f", `ref=refs/heads/${BRANCH}`, "-f", `sha=${sha}`]);
    } catch {
      // De branch bestaat al, zonder open pull request: opnieuw op de basis zetten.
      gh(["api", "-X", "PATCH", `repos/${app}/git/refs/heads/${BRANCH}`, "-f", `sha=${sha}`, "-F", "force=true"]);
    }
    const inhoud = {
      message: `Plugin uit ${levering} halen`,
      content: Buffer.from(nieuw, "utf8").toString("base64"),
      sha: bestand.sha,
      branch: BRANCH,
      committer: IDENTITEIT,
      author: IDENTITEIT,
    };
    gh(["api", "-X", "PUT", `repos/${app}/contents/${SETTINGS_PAD}`, "--input", "-"], { input: JSON.stringify(inhoud) });
    const pr = gh(["pr", "create", "-R", app, "--base", basis, "--head", BRANCH, "--title", TITEL, "--body", prTekst({ van, naar: levering })]);
    return { app, status: "omgezet", van, naar: levering, pr };
  } catch (fout) {
    return { app, status: "mislukt", reden: eersteRegel(fout) };
  }
}

/** Alle apps van één klant. Stopt meteen als de leveringsrepo nog niet klaarstaat. */
export function omzetten({ org, apps, doeHet = false, gh = standaardGh }) {
  const levering = leveringVoor(org).plugin;
  if (!leveringStaat(gh, levering)) {
    return {
      levering,
      status: "gestopt",
      reden: `${levering} heeft nog geen levering.json; draai eerst Uitleveren voor ${org}`,
      apps: [],
    };
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
  for (const r of uit.apps) {
    const extra = r.pr ? ` ${r.pr}` : r.reden ? `: ${r.reden}` : r.van ? ` (nu ${r.van})` : "";
    log(`  ${r.app}: ${r.status}${extra}`);
  }
  if (!opties.doeHet && uit.apps.some((r) => r.status === "zou-omzetten")) log("Niets veranderd. Opnieuw met --doe-het om de pull requests te openen.");
  return uit.apps.some((r) => r.status === "mislukt") ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = hoofd(process.argv.slice(2));
  } catch (fout) {
    process.stderr.write(`${eersteRegel(fout)}\n`);
    process.exitCode = 1;
  }
}
