#!/usr/bin/env node
/**
 * Het werk achter de workflow Uitleveren (besluit 16-10-2026, levering per klant): zet de
 * nieuwe versies van plugin en template door naar de leveringsrepo's van een abonnee.
 *
 *   node beheer/uitleveren.mjs --lijst
 *       de orgs uit abonnees.json als JSON-lijst (voor de matrix van de workflow)
 *
 *   node beheer/uitleveren.mjs --getest <versie> --getest-template stack-v<n>
 *       stopt met een melding als <versie> niet de versie in plugin.json op HEAD is, of als
 *       de templatetag geen stack-v<n> is. De workflow vraagt beide als invoer (getest_versie
 *       en getest_template): zo bevestigt Stage Two bij elke run welke plugin en welke
 *       templateversie op de eigen apps draaien, voordat een klant ze krijgt.
 *
 *   node beheer/uitleveren.mjs --org <klantorg> --getest-template stack-v<n> [--template <pad of url>] [--droog]
 *       plugin:   deze checkout (HEAD) naar <klantorg>/stagetwo-plugin-tier2, getagd
 *                 v<versie uit plugin.json>, zonder abonnees.json en het uitleveren zelf, met
 *                 een levering.json die naar de leveringsrepo's van de klant wijst;
 *       template: elke tag stack-v<n> tot en met de geteste tag van Stage-Two-AI/app-template-tier2 die de klant nog
 *                 niet heeft, naar <klantorg>/app-template-tier2; main = de nieuwste. In
 *                 .claude/settings.json wijst de bron van de plugin daarbij naar
 *                 <klantorg>/stagetwo-plugin-tier2, zodat een app uit die kopie zijn plugin
 *                 ook uit de kopie van de klant haalt (lib/plugin-bron.mjs).
 *
 * De klant krijgt geen kopie van onze geschiedenis maar per versie één commit van Stage Two
 * bovenop zijn eigen main. Zo komt er nooit iets mee dat alleen in de bron hoort (de lijst
 * met abonnees, eerdere commits), en is een versie die er al staat meteen klaar: een
 * tweede run doet niets. Er wordt nooit geforceerd: heeft iemand anders op de main van de
 * leveringsrepo gezet, dan weigert de push en kijkt Stage Two ernaar.
 *
 * --template: waar de template van Stage Two vandaan komt (standaard de openbare https-url).
 * De workflow geeft een eigen checkout mee, zodat het ook werkt als de bronrepo is afgeschermd.
 *
 * Inloggen doet de workflow (gh auth setup-git met het token van de GitHub App
 * stagetwo-levering); dit script praat gewoon https tegen github.com.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { STAGE_TWO } from "../lib/levering.mjs";
import { SETTINGS_PAD, metPluginBron } from "../lib/plugin-bron.mjs";

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), "..");
export const IDENTITEIT = { naam: "Stage Two", email: "info@stagetwo.nl" };
/** Wat alleen in de bron hoort en nooit naar een klant gaat. */
export const ALLEEN_IN_BRON = [
  "abonnees.json",
  ".github/workflows/uitleveren.yml",
  "beheer/uitleveren.mjs",
  "beheer/uitleveren.test.mjs",
  "beheer/levering-omzetten.mjs",
  "beheer/levering-omzetten.test.mjs",
  ".github/workflows/levering-stoppen.yml",
  "beheer/levering-stoppen.mjs",
  "beheer/levering-stoppen.test.mjs",
];
const ORG_VORM = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

// ---------------------------------------------------------------- abonnees

/** De orgs uit abonnees.json; een ongeldige naam is een fout, geen stille overslag. */
export function leesAbonnees(wortel = WORTEL) {
  const data = JSON.parse(readFileSync(join(wortel, "abonnees.json"), "utf8"));
  const orgs = (data.abonnees ?? []).map((a) => (typeof a === "string" ? a : a?.org));
  for (const org of orgs) {
    if (!ORG_VORM.test(org ?? "")) throw new Error(`abonnees.json: "${org}" is geen geldige GitHub-org`);
  }
  return orgs;
}

/** De leveringsrepo's van een klant: dezelfde namen als bij Stage Two, in zijn eigen org. */
export function leveringVoor(org) {
  return {
    plugin: `${org}/${basename(STAGE_TWO.plugin)}`,
    template: `${org}/${basename(STAGE_TWO.template)}`,
  };
}

// ---------------------------------------------------------------- git

function gitIn(map, args, { input, env } = {}) {
  return execFileSync("git", ["-C", map, ...args], {
    encoding: "utf8",
    input,
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    timeout: 300000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...env },
  }).trim();
}

/** Alle refs op afstand als Map ref -> sha; een lege repo geeft een lege Map. */
export function refsOpAfstand(map, url) {
  const uit = gitIn(map, ["ls-remote", url]);
  return new Map(uit.split("\n").filter(Boolean).map((r) => r.split("\t").reverse()));
}

/** De inhoud van `pad` op `ref`, precies (zonder trim), of null als het bestand er niet is. */
function bestandOp(map, ref, pad) {
  try {
    return execFileSync("git", ["-C", map, "show", `${ref}:${pad}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

/**
 * De boom van `ref`, zonder de paden in `weglaten`, met de bestanden in `extra` erbij, en met
 * per pad in `bewerk` een functie die de inhoud op `ref` omzet (een ontbrekend bestand slaan
 * we over).
 */
export function maakBoom(map, ref, { weglaten = [], extra = {}, bewerk = {} } = {}) {
  const tijdelijk = mkdtempSync(join(tmpdir(), "uitleveren-"));
  const env = { GIT_INDEX_FILE: join(tijdelijk, "index") };
  try {
    gitIn(map, ["read-tree", ref], { env });
    for (const pad of weglaten) gitIn(map, ["rm", "--cached", "-q", "--ignore-unmatch", "--", pad], { env });
    const bewerkt = {};
    for (const [pad, omzetten] of Object.entries(bewerk)) {
      const oud = bestandOp(map, ref, pad);
      if (oud === null) continue;
      const nieuw = omzetten(oud);
      if (nieuw !== oud) bewerkt[pad] = nieuw;
    }
    for (const [pad, inhoud] of Object.entries({ ...bewerkt, ...extra })) {
      const blob = gitIn(map, ["hash-object", "-w", "--stdin"], { input: inhoud });
      gitIn(map, ["update-index", "--add", "--cacheinfo", `100644,${blob},${pad}`], { env });
    }
    return gitIn(map, ["write-tree"], { env });
  } finally {
    rmSync(tijdelijk, { recursive: true, force: true });
  }
}

function maakCommit(map, boom, ouder, bericht) {
  const env = {
    GIT_AUTHOR_NAME: IDENTITEIT.naam,
    GIT_AUTHOR_EMAIL: IDENTITEIT.email,
    GIT_COMMITTER_NAME: IDENTITEIT.naam,
    GIT_COMMITTER_EMAIL: IDENTITEIT.email,
  };
  return gitIn(map, ["commit-tree", boom, ...(ouder ? ["-p", ouder] : []), "-m", bericht], { env });
}

/**
 * Levert `versies` (oud naar nieuw, elk { ref, tag, bericht }) uit `bronMap` af in `doelUrl`.
 * Een tag die de klant al heeft, slaan we over; de rest komt als commit bovenop zijn main
 * (of op de bestaande main als de inhoud gelijk is) en krijgt zijn tag. Eén atomaire push.
 */
export function leverUit({ bronMap, doelUrl, versies, weglaten = [], extra = {}, bewerk = {}, droog = false }) {
  const opAfstand = refsOpAfstand(bronMap, doelUrl);
  let tip = opAfstand.get("refs/heads/main") ?? null;
  if (tip) gitIn(bronMap, ["fetch", "-q", "--no-tags", doelUrl, "+refs/heads/main:refs/uitleveren/main"]);
  const nieuw = [];
  for (const { ref, tag, bericht } of versies) {
    if (opAfstand.has(`refs/tags/${tag}`)) continue;
    const boom = maakBoom(bronMap, ref, { weglaten, extra, bewerk });
    if (!tip || gitIn(bronMap, ["rev-parse", `${tip}^{tree}`]) !== boom) tip = maakCommit(bronMap, boom, tip, bericht);
    nieuw.push({ tag, sha: tip });
  }
  if (nieuw.length === 0) return { status: "al-bij", repo: doelUrl };
  if (!droog) {
    const refs = [`${tip}:refs/heads/main`, ...nieuw.map(({ tag, sha }) => `${sha}:refs/tags/${tag}`)];
    gitIn(bronMap, ["push", "-q", "--atomic", doelUrl, ...refs]);
  }
  return { status: droog ? "zou-leveren" : "geleverd", repo: doelUrl, tags: nieuw.map((n) => n.tag) };
}

// ---------------------------------------------------------------- plugin en template

/** De plugin op HEAD van `bronMap`, met levering.json voor deze klant. */
export function pluginVersies(bronMap) {
  const versie = JSON.parse(gitIn(bronMap, ["show", "HEAD:.claude-plugin/plugin.json"])).version;
  if (!/^\d+\.\d+\.\d+$/.test(versie ?? "")) throw new Error(`plugin.json heeft geen geldige versie: ${versie}`);
  const sha = gitIn(bronMap, ["rev-parse", "HEAD"]);
  return [{ ref: "HEAD", tag: `v${versie}`, bericht: `Plugin ${versie}\n\nBron: ${STAGE_TWO.plugin}@${sha}` }];
}

/**
 * De bevestiging van de workflow (invoer getest_versie): de versie die Stage Two op de eigen
 * apps heeft gedraaid, moet de versie in plugin.json op HEAD zijn. Een `v` ervoor mag.
 * Geeft de versie terug, of gooit een fout met wat er moet gebeuren.
 */
export function controleerGetest(getest, bronMap = WORTEL) {
  const versie = JSON.parse(gitIn(bronMap, ["show", "HEAD:.claude-plugin/plugin.json"])).version;
  const opgegeven = String(getest ?? "").trim().replace(/^v/i, "");
  if (opgegeven === "" || opgegeven !== versie) {
    throw new Error(
      `getest_versie is "${String(getest ?? "").trim()}", maar plugin.json op main heeft versie ${versie}. ` +
        `Uitleveren levert alleen een versie die Stage Two eerst op de eigen apps heeft gedraaid: zet ${versie} ` +
        `op de eigen apps (README, "Een nieuwe versie uitbrengen", stap 4) en start de workflow opnieuw met getest_versie ${versie}.`,
    );
  }
  return versie;
}

/** Wat er per versie in de template van de klant anders is dan bij Stage Two: de bron van de plugin. */
export function templateBewerkingen(org) {
  const plugin = leveringVoor(org).plugin;
  return { [SETTINGS_PAD]: (tekst) => metPluginBron(tekst, plugin) };
}

export function leveringJson(org) {
  return `${JSON.stringify(leveringVoor(org), null, 2)}\n`;
}

/**
 * De invoer getest_template: de nieuwste templatetag die Stage Two op de eigen apps heeft
 * gedraaid, precies in de vorm stack-v<n>. Geeft n terug, of gooit een fout met wat er moet
 * gebeuren.
 */
export function leesGetestTemplate(tag) {
  const tekst = String(tag ?? "").trim();
  const n = /^stack-v(\d+)$/.exec(tekst)?.[1];
  if (!n) {
    throw new Error(
      `getest_template is "${tekst}", maar moet een tag van de template zijn, zoals stack-v25: de nieuwste ` +
        `templateversie die Stage Two op de eigen apps heeft gedraaid (README, "Een nieuwe versie uitbrengen", stap 4). ` +
        "Uitleveren levert alleen template-tags tot en met die tag.",
    );
  }
  return Number(n);
}

/**
 * Elke tag stack-v<n> van de template, van oud naar nieuw. Met `totEnMet` alleen de tags tot
 * en met stack-v<totEnMet>; bestaat die tag niet, dan een fout (een tikfout mag niet stilletjes
 * minder of meer leveren).
 */
export function templateVersies(bronMap, totEnMet) {
  const nummers = gitIn(bronMap, ["tag", "--list", "stack-v*"])
    .split("\n")
    .map((t) => /^stack-v(\d+)$/.exec(t)?.[1])
    .filter(Boolean)
    .map(Number)
    .sort((a, b) => a - b);
  if (totEnMet !== undefined && !nummers.includes(totEnMet)) {
    throw new Error(
      `getest_template is stack-v${totEnMet}, maar die tag bestaat niet in de template (nieuwste: ` +
        `${nummers.length ? `stack-v${nummers.at(-1)}` : "geen"}). Start de workflow opnieuw met de tag die op de eigen apps draait.`,
    );
  }
  return nummers
    .filter((n) => totEnMet === undefined || n <= totEnMet)
    .map((n) => ({ ref: `stack-v${n}`, tag: `stack-v${n}`, bericht: `Versie ${n}` }));
}

export function uitleverenAanKlant({ org, getestTemplate, pluginMap = WORTEL, templateUrl = `https://github.com/${STAGE_TWO.template}`, droog = false, url = (repo) => `https://github.com/${repo}.git` }) {
  if (!ORG_VORM.test(org ?? "")) throw new Error(`geen geldige GitHub-org: ${org}`);
  const tot = leesGetestTemplate(getestTemplate);
  const doel = leveringVoor(org);
  const kloon = mkdtempSync(join(tmpdir(), "uitleveren-template-"));
  try {
    // Eerst de template lezen en de geteste tag controleren: klopt die niet, dan gaat er ook
    // geen plugin naar de klant.
    execFileSync("git", ["clone", "--quiet", "--bare", templateUrl, kloon], { stdio: "ignore", timeout: 300000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
    const templateLijst = templateVersies(kloon, tot);
    const plugin = leverUit({
      bronMap: pluginMap,
      doelUrl: url(doel.plugin),
      versies: pluginVersies(pluginMap),
      weglaten: ALLEEN_IN_BRON,
      extra: { "levering.json": leveringJson(org) },
      droog,
    });
    const template = leverUit({
      bronMap: kloon,
      doelUrl: url(doel.template),
      versies: templateLijst,
      bewerk: templateBewerkingen(org),
      droog,
    });
    return { org, plugin, template };
  } finally {
    rmSync(kloon, { recursive: true, force: true });
  }
}

/** De opties van de opdrachtregel voor uitleverenAanKlant. */
export function leesOpties(argv) {
  const waarde = (vlag) => {
    const i = argv.indexOf(vlag);
    if (i < 0) return undefined;
    const w = argv[i + 1];
    if (w === undefined || w.startsWith("--")) throw new Error(`${vlag} vraagt een waarde`);
    return w;
  };
  const opties = { org: waarde("--org") ?? null, getestTemplate: waarde("--getest-template") ?? null, droog: argv.includes("--droog") };
  const template = waarde("--template");
  if (template !== undefined) opties.templateUrl = template;
  return opties;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  try {
    if (argv.includes("--lijst")) {
      process.stdout.write(`${JSON.stringify(leesAbonnees())}\n`);
    } else if (argv.includes("--getest")) {
      const versie = controleerGetest(argv[argv.indexOf("--getest") + 1]);
      const tot = leesGetestTemplate(leesOpties(argv).getestTemplate);
      process.stdout.write(`plugin ${versie} en template tot en met stack-v${tot} bevestigd: draaien op de eigen apps van Stage Two\n`);
    } else {
      const uitkomst = uitleverenAanKlant(leesOpties(argv));
      process.stdout.write(`${JSON.stringify(uitkomst, null, 2)}\n`);
    }
  } catch (fout) {
    process.stderr.write(`${String(fout?.stderr || fout?.message || fout).trim()}\n`);
    process.exitCode = 1;
  }
}
