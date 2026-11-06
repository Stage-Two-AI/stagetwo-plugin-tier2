#!/usr/bin/env node
/**
 * Sentry koppelen in de beheer-repo van een klant: een stap van Stage Two in de projectfase,
 * geen actie voor de klant. Daarna geeft App inrichten elke app vanzelf een eigen
 * Sentry-project, zet de DSN en stuurt een proefmelding (sinds versie 39).
 *
 *   node sentry-koppelen.mjs --beheer <org>/<beheer-repo> --sentry-org <slug> [--app <naam>]... [--droogloop] [--json]
 *
 * Wat het doet, met de gh-login van wie het draait (owner of admin op de beheer-repo):
 *   1. het secret SENTRY_AUTH_TOKEN in de omgeving `beheer`. Het token plak je zelf: gh vraagt
 *      erom (`gh secret set`, de invoer blijft onzichtbaar). Dit script, Claude en de terminal
 *      zien de waarde nooit. Staat het secret er al, dan slaat het deze stap over (met
 *      --opnieuw vraagt gh het toch);
 *   2. de variabele SENTRY_ORG (de slug van de organisatie in Sentry) in dezelfde omgeving;
 *   3. App inrichten (`app-inrichten.yml`, droogloop uit) voor elke app in toegang.json van de
 *      beheer-repo, of alleen voor de apps achter --app.
 *
 * Omdat gh om het token vraagt, moet dit in een echte terminal draaien (Terminal, of het
 * terminalpaneel naast het gesprek), niet via een opdracht van Claude. Zonder terminal stopt
 * het met die uitleg, behalve als het secret er al staat.
 *
 * Uitkomst (met --json één object): `status` gekoppeld | proef | mislukt, met `stappen` en,
 * bij mislukt, `reden` in één zin.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SECRET = "SENTRY_AUTH_TOKEN";
export const VARIABELE = "SENTRY_ORG";
export const OMGEVING = "beheer";
export const WORKFLOW = "app-inrichten.yml";

const REPO = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/;
const SLUG = /^[a-z0-9][a-z0-9_-]{0,49}$/;
const APP = /^[a-z0-9][a-z0-9-]{0,40}$/;

export function leesArgumenten(argv) {
  const arg = { beheer: null, sentryOrg: null, apps: [], droogloop: false, opnieuw: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--beheer") arg.beheer = argv[++i] ?? null;
    else if (a === "--sentry-org") arg.sentryOrg = argv[++i] ?? null;
    else if (a === "--app") arg.apps.push(argv[++i] ?? "");
    else if (a === "--droogloop") arg.droogloop = true;
    else if (a === "--opnieuw") arg.opnieuw = true;
    else if (a === "--json") arg.json = true;
    else throw new Error(`onbekende optie ${a}`);
  }
  if (!REPO.test(arg.beheer ?? "")) throw new Error("geef --beheer als <organisatie>/<beheer-repo>, bijvoorbeeld Mijn-Bedrijf/stagetwo-beheer-tier2");
  if (!SLUG.test(arg.sentryOrg ?? "")) throw new Error("geef --sentry-org: de slug van de organisatie in Sentry (kleine letters, zoals in sentry.io/organizations/<slug>)");
  const fout = arg.apps.find((a) => !APP.test(a));
  if (fout !== undefined) throw new Error(`--app ${JSON.stringify(fout)}: alleen kleine letters, cijfers en streepjes`);
  return arg;
}

/**
 * gh als kindproces. Met `interactief` krijgt gh de terminal zelf (stdin, stdout, stderr), zodat
 * het om het token kan vragen zonder dat iets anders het ziet.
 */
export function standaardGh() {
  return (args, { interactief = false } = {}) => {
    const r = spawnSync("gh", args, interactief ? { stdio: "inherit" } : { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: r.status ?? 1, uit: interactief ? "" : String(r.stdout ?? ""), fout: interactief ? "" : String(r.stderr ?? "") };
  };
}

const eersteRegel = (t) => String(t ?? "").split("\n").map((r) => r.trim()).find(Boolean) ?? "";

/** De apps in toegang.json van de beheer-repo, op volgorde. */
function appsUitToegang(gh, beheer) {
  const r = gh(["api", `repos/${beheer}/contents/toegang.json`, "-H", "Accept: application/vnd.github.raw"]);
  if (r.code !== 0) throw new Error(`toegang.json van ${beheer} is niet te lezen: ${eersteRegel(r.fout)}`);
  return Object.keys(JSON.parse(r.uit).apps ?? {}).filter((a) => APP.test(a));
}

/** Staat het secret al in de omgeving? Alleen de naam wordt gelezen, nooit een waarde. */
function secretStaatEr(gh, beheer) {
  const r = gh(["secret", "list", "--env", OMGEVING, "--repo", beheer, "--json", "name"]);
  if (r.code !== 0) throw new Error(`de secrets van omgeving ${OMGEVING} in ${beheer} zijn niet op te vragen (ben je owner of admin?): ${eersteRegel(r.fout)}`);
  return JSON.parse(r.uit || "[]").some((s) => s.name === SECRET);
}

/**
 * Het hele werk. `d`: { gh, terminal } (terminal: is stdin een echte terminal?). Geeft één
 * uitkomst; gooit niet.
 */
export function koppel(arg, { gh = standaardGh(), terminal = Boolean(process.stdin.isTTY) } = {}) {
  const stappen = [];
  try {
    const apps = arg.apps.length ? arg.apps : appsUitToegang(gh, arg.beheer);
    const bekend = arg.apps.length ? appsUitToegang(gh, arg.beheer) : apps;
    const onbekend = apps.filter((a) => !bekend.includes(a));
    if (onbekend.length) return { status: "mislukt", reden: `${onbekend.join(", ")} staat niet in toegang.json van ${arg.beheer}`, stappen };

    const er = secretStaatEr(gh, arg.beheer);
    const vragen = !er || arg.opnieuw;
    if (arg.droogloop) {
      stappen.push(vragen ? `gepland: ${SECRET} in omgeving ${OMGEVING} (gh vraagt om het token)` : `${SECRET} staat er al`);
      stappen.push(`gepland: ${VARIABELE}=${arg.sentryOrg} in omgeving ${OMGEVING}`);
      stappen.push(apps.length ? `gepland: App inrichten voor ${apps.join(", ")}` : "geen apps in toegang.json; App inrichten hoeft niet");
      return { status: "proef", beheer: arg.beheer, apps, stappen };
    }

    if (vragen) {
      if (!terminal) {
        return {
          status: "mislukt",
          reden: "draai dit in een eigen terminal (Terminal, of het terminalpaneel naast het gesprek): gh vraagt daar om het Sentry-token, zodat niemand anders de waarde ziet, ook Claude niet",
          stappen,
        };
      }
      const r = gh(["secret", "set", SECRET, "--env", OMGEVING, "--repo", arg.beheer], { interactief: true });
      if (r.code !== 0) return { status: "mislukt", reden: `${SECRET} zetten mislukte; probeer het opnieuw (ben je owner of admin op ${arg.beheer}?)`, stappen };
      stappen.push(`${SECRET} gezet in omgeving ${OMGEVING}`);
    } else {
      stappen.push(`${SECRET} stond er al in omgeving ${OMGEVING}`);
    }

    const v = gh(["variable", "set", VARIABELE, "--env", OMGEVING, "--repo", arg.beheer, "--body", arg.sentryOrg]);
    if (v.code !== 0) return { status: "mislukt", reden: `${VARIABELE} zetten mislukte: ${eersteRegel(v.fout)}`, stappen };
    stappen.push(`${VARIABELE}=${arg.sentryOrg} in omgeving ${OMGEVING}`);

    const gestart = [];
    for (const app of apps) {
      const w = gh(["workflow", "run", WORKFLOW, "--repo", arg.beheer, "-f", `app=${app}`, "-f", "droogloop=false"]);
      if (w.code !== 0) return { status: "mislukt", reden: `App inrichten voor ${app} starten mislukte: ${eersteRegel(w.fout)}`, stappen, gestart };
      gestart.push(app);
    }
    stappen.push(apps.length ? `App inrichten gestart voor ${gestart.join(", ")}` : "geen apps in toegang.json; App inrichten hoeft niet");
    return {
      status: "gekoppeld",
      beheer: arg.beheer,
      apps: gestart,
      stappen,
      runs: `https://github.com/${arg.beheer}/actions/workflows/${WORKFLOW}`,
      daarna: "Kijk per run in de samenvatting of stap S Sentry heeft gekoppeld en de proefmelding is aangekomen.",
    };
  } catch (fout) {
    return { status: "mislukt", reden: fout.message, stappen };
  }
}

function toon(uitkomst, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(uitkomst, null, 2)}\n`);
    return;
  }
  const regels = [`status: ${uitkomst.status}`, ...(uitkomst.reden ? [uitkomst.reden] : []), ...(uitkomst.stappen ?? []).map((s) => `- ${s}`)];
  if (uitkomst.runs) regels.push(`De runs: ${uitkomst.runs}`, uitkomst.daarna);
  process.stdout.write(`${regels.join("\n")}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  let uitkomst;
  try {
    uitkomst = koppel(leesArgumenten(argv));
  } catch (fout) {
    uitkomst = { status: "mislukt", reden: fout.message };
  }
  toon(uitkomst, argv.includes("--json"));
  process.exitCode = uitkomst.status === "mislukt" ? 1 : 0;
}
