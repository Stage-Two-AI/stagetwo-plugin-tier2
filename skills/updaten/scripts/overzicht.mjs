#!/usr/bin/env node
/**
 * Het overzicht achter /stagetwo-tier2:updaten: welke apps van de klant zijn uit de Stage Two-template
 * gebouwd, op welke versie staan ze, en welke lopen achter?
 *
 *   node overzicht.mjs --json [--eigenaar <organisatie of account>]...
 *
 * Zonder --eigenaar kijkt het script naar de eigenaar van de open map (de origin op
 * GitHub); staat er geen app open, dan naar het eigen account en alle organisaties van
 * de gebruiker. Alleen repo's waar de gebruiker naar mag schrijven tellen mee: een app
 * die je niet kunt bijwerken, hoort niet in de vraag "welke wil je bijwerken?".
 *
 * In een cloudsessie (claude.ai) mag het script de repo's van een organisatie niet bij GitHub
 * opvragen: zo'n sessie ziet alleen de repo's van het Project, en die staan er als mappen naast
 * elkaar. Dan komt de lijst uit die mappen (`bron: "mappen"`) en zegt `letOp` dat erbij.
 *
 * Het script wijzigt niets. De skill toont het overzicht en vraagt welke apps mee
 * moeten; bijwerken gaat daarna per app met `bijwerken.mjs --repo`.
 *
 * Tier 2 heeft sinds versie 43 twee templates (lib/levering.mjs). `doel` is de nieuwste versie
 * van de gewone template; een app van de openbare template krijgt `template` en zijn eigen
 * `doel` in zijn regel, gemeten aan de openbare template uit de levering. Zit die niet in de
 * levering (of is hij niet bereikbaar), dan staat de app er met `achter: false` en een `reden`:
 * bijwerken kan dan niet, en met de gewone template mag het nooit.
 *
 * Uitkomst: één JSON-object met `status`:
 *   ok        `apps` (achterlopers eerst), `doel`, `huidige` (de open app of null), `bron`
 *             ("github" of "mappen") en bij "mappen" een `letOp` voor de gebruiker
 *   mislukt   een voorwaarde ontbreekt; `reden` is één zin met één handeling
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LEVERING, TEMPLATE_GEWOON, TEMPLATE_OPENBAAR, manifestTemplate, openbaarNietBereikbaar, templateBron } from "../../../lib/levering.mjs";
import { isCloudflareManifest } from "../../../lib/manifest.mjs";
import {
  eersteRegel,
  ghAanwezig,
  ghApi,
  ghIngelogd,
  git,
  inDeCloud,
  openPRVoorVersie,
  originUrl,
  repoUitUrl,
  sh,
  templateOnbereikbaar,
  versieOpAfstand,
} from "../../../lib/repo.mjs";
import { appsInWerkmap } from "../../../lib/werkmap.mjs";

const SCHRIJVERS = new Set(["ADMIN", "MAINTAIN", "WRITE"]);

export function leesArgumenten(argv) {
  const uit = { json: false, eigenaren: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") uit.json = true;
    else if (a === "--eigenaar") {
      const e = argv[++i];
      if (!e) throw new Error("--eigenaar zonder naam");
      uit.eigenaren.push(e);
    } else throw new Error(`onbekend argument: ${a}`);
  }
  return uit;
}

/**
 * Versie en template van een repo op GitHub (`{ versie, template }`), of null als hij niet uit
 * een template voor tier 2 komt.
 */
export function appVanRepo(repo) {
  try {
    const manifest = JSON.parse(sh("gh", ["api", `repos/${repo}/contents/.claude/stack-manifest.json`, "-H", "Accept: application/vnd.github.raw"]));
    if (!isCloudflareManifest(manifest)) return null;
    const tekst = sh("gh", ["api", `repos/${repo}/contents/.claude/stack-version`, "-H", "Accept: application/vnd.github.raw"]);
    const n = Number.parseInt(tekst.trim(), 10);
    if (!(Number.isSafeInteger(n) && n > 0)) return null;
    // Zegt het manifest niet eenduidig uit welke template de app komt, dan staat er in `fout` wat er mis is.
    const keuze = manifestTemplate(manifest);
    return keuze.fout ? { versie: n, template: null, fout: keuze.fout } : { versie: n, template: keuze.template };
  } catch {
    return null;
  }
}

/** De templateversie van een repo op GitHub, of null als hij niet uit een template voor tier 2 komt. */
export function versieVanRepo(repo) {
  return appVanRepo(repo)?.versie ?? null;
}

function eigenarenVanGebruiker() {
  const login = ghApi("user", { jq: ".login" }).trim();
  const orgs = ghApi("user/orgs", { jq: ".[].login" })
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean);
  return [...orgs, login].filter(Boolean);
}

/**
 * De repo's van een organisatie of account opvragen is het enige wat geen REST-vorm heeft die
 * voor allebei werkt, dus dit blijft `gh repo list`. Een cloudsessie weigert het; zie
 * `alleenMappen`.
 */
function reposVan(eigenaar) {
  const lijst = JSON.parse(
    sh("gh", ["repo", "list", eigenaar, "--no-archived", "--limit", "300", "--json", "nameWithOwner,viewerPermission"]),
  );
  return lijst.filter((r) => SCHRIJVERS.has(r.viewerPermission)).map((r) => r.nameWithOwner);
}

/** Weigert GitHub de vraag omdat dit een cloudsessie is? Die ziet alleen de repo's van het Project. */
function alleenMappen(fout, env) {
  return inDeCloud(env) || /GraphQL is not available|bound to their configured repositories/i.test(String(fout?.stderr ?? fout?.message ?? ""));
}

/**
 * De apps die als map naast de open app staan (of in de open map, als dat de map boven de
 * apps is): `eigenaar/naam` uit hun origin. Alleen lezen, geen netwerk.
 */
export function reposInMappen(cwd) {
  let werkmap = cwd;
  try {
    werkmap = dirname(git(cwd, "rev-parse", "--show-toplevel"));
  } catch {
    // geen git-map: dan is dit de map boven de apps
  }
  return appsInWerkmap(werkmap)
    .map((app) => repoUitUrl(originUrl(app.map)))
    .filter(Boolean);
}

const LET_OP_MAPPEN =
  "In de cloud zijn alleen de apps te zien die in dit Project staan. Mist er een app, zet hem dan in het Project en begin een nieuwe thread, of draai dit op een computer.";

export function overzicht({ cwd = process.cwd(), eigenaren = [], env = process.env, levering = LEVERING } = {}) {
  if (!ghAanwezig()) return { status: "mislukt", reden: "de GitHub-opdrachtregel (gh) ontbreekt; draai eerst /stagetwo-tier2:installatie" };
  if (!ghIngelogd()) return { status: "mislukt", reden: "log eerst in bij GitHub met `gh auth login` (zie /stagetwo-tier2:installatie)" };

  const gewoon = templateBron({ template: TEMPLATE_GEWOON, env, levering }).repo;
  const doel = versieOpAfstand(gewoon);
  if (doel === null) return { status: "mislukt", reden: templateOnbereikbaar(gewoon, { tier: 2, env }) };
  // De openbare template pas opvragen als er een app van is (de meeste klanten hebben er geen).
  let openbaar;
  const doelOpenbaar = () => {
    if (openbaar === undefined) {
      const bron = templateBron({ template: TEMPLATE_OPENBAAR, env, levering });
      if (bron.fout) openbaar = { reden: bron.fout };
      else {
        const versie = versieOpAfstand(bron.repo);
        openbaar = versie === null ? { reden: env?.STACK_TEMPLATE_REPO ? `de openbare template is niet bereikbaar (${bron.repo}); probeer het later opnieuw` : openbaarNietBereikbaar(bron.repo) } : { versie };
      }
    }
    return openbaar;
  };

  const huidige = repoUitUrl(originUrl(cwd));
  const zelfde = (x, y) => x.toLowerCase() === y.toLowerCase();
  let inMappen = null;
  let welke = eigenaren;
  try {
    if (welke.length === 0) welke = huidige ? [huidige.split("/")[0]] : eigenarenVanGebruiker();
  } catch (fout) {
    if (!alleenMappen(fout, env)) return { status: "mislukt", reden: `je organisaties zijn niet op te vragen: ${eersteRegel(fout)}` };
    inMappen = reposInMappen(cwd);
    welke = [...new Set(inMappen.map((repo) => repo.split("/")[0]))];
    if (welke.length === 0) return { status: "mislukt", reden: "in de cloud zijn alleen de apps van dit Project te zien, en hier staat er geen; zet de apps in het Project, of draai dit op een computer" };
  }

  const apps = [];
  const gezien = new Set();
  for (const eigenaar of welke) {
    let repos;
    try {
      repos = inMappen ? null : reposVan(eigenaar);
    } catch (fout) {
      if (!alleenMappen(fout, env)) return { status: "mislukt", reden: `de repo's van ${eigenaar} zijn niet op te vragen: ${eersteRegel(fout)}` };
      inMappen = reposInMappen(cwd);
    }
    repos ??= inMappen.filter((repo) => zelfde(repo.split("/")[0], eigenaar));
    for (const repo of repos) {
      if (gezien.has(repo)) continue;
      gezien.add(repo);
      const app = appVanRepo(repo);
      if (app === null) continue;
      const { versie } = app;
      // Een app van de openbare template meet zich aan die template, nooit aan de gewone.
      const eigen = app.fout
        ? { reden: app.fout }
        : app.template === TEMPLATE_GEWOON
          ? { versie: doel }
          : app.template === TEMPLATE_OPENBAAR
            ? doelOpenbaar()
            : { reden: `deze app komt uit een template die deze plugin niet kent (${app.template})` };
      const achter = eigen.versie !== undefined && versie < eigen.versie;
      let openPR = null;
      if (achter) {
        try {
          openPR = openPRVoorVersie(repo, eigen.versie)?.url ?? null;
        } catch {
          openPR = null;
        }
      }
      const extra = app.template === TEMPLATE_GEWOON ? {} : { template: app.template, ...(eigen.versie !== undefined ? { doel: eigen.versie } : { reden: eigen.reden }) };
      apps.push({ repo, versie, achter, openPR, huidige: repo === huidige, ...extra });
    }
  }
  apps.sort((a, b) => Number(b.achter) - Number(a.achter) || a.versie - b.versie || a.repo.localeCompare(b.repo));
  return { status: "ok", doel, huidige, eigenaren: welke, apps, bron: inMappen ? "mappen" : "github", ...(inMappen ? { letOp: LET_OP_MAPPEN } : {}) };
}

export function hoofd(argv, { cwd = process.cwd(), env = process.env, levering = LEVERING } = {}) {
  let args;
  try {
    args = leesArgumenten(argv);
  } catch (fout) {
    return { status: "mislukt", reden: fout.message };
  }
  return overzicht({ cwd, eigenaren: args.eigenaren, env, levering });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  let uitkomst;
  try {
    uitkomst = hoofd(argv);
  } catch (fout) {
    uitkomst = { status: "mislukt", reden: eersteRegel(fout) };
  }
  process.stdout.write(`${JSON.stringify(uitkomst, null, 2)}\n`);
  process.exitCode = uitkomst.status === "ok" ? 0 : 1;
}
