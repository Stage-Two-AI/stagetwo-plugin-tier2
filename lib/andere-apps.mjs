/**
 * De andere apps van het bedrijf die achterlopen, voor de melding bij sessiestart: zo blijft
 * geen app ongemerkt op een oude versie staan als de bouwer hem nooit meer opent.
 *
 * Eén GraphQL-vraag via `gh` per organisatie (repo's, schrijfrecht, manifest en versie in één
 * keer), met een tijdslimiet, zodat de sessiestart er niet merkbaar op wacht. Dezelfde regels
 * als het overzicht van /stagetwo-tier2:updaten: alleen repo's met een manifest van deze
 * tier en schrijfrecht tellen mee. Een template-repo (de kopie van de template zelf) is geen
 * app. Zonder `gh`, zonder login, bij een time-out of een vreemd antwoord: null, en dan
 * zegt de melding hier niets over.
 */
import { execFile } from "node:child_process";
import { isCloudflareManifest } from "./manifest.mjs";

const SCHRIJVERS = new Set(["ADMIN", "MAINTAIN", "WRITE"]);

const VRAAG = `query($login: String!) {
  repositoryOwner(login: $login) {
    repositories(first: 100, isArchived: false, orderBy: { field: PUSHED_AT, direction: DESC }) {
      nodes {
        nameWithOwner
        viewerPermission
        isTemplate
        manifest: object(expression: "HEAD:.claude/stack-manifest.json") { ... on Blob { text } }
        versie: object(expression: "HEAD:.claude/stack-version") { ... on Blob { text } }
      }
    }
  }
}`;

/** `eigenaar/repo` uit een origin-URL van GitHub (https of ssh), of null. */
export function repoUitOrigin(origin) {
  const m = /github\.com[/:]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?\s*$/.exec(origin ?? "");
  return m ? `${m[1]}/${m[2]}` : null;
}

/**
 * Uit het antwoord van GitHub: de apps van deze tier, behalve de open app, die onder `doel`
 * staan, oudste eerst. Een kapot antwoord geeft null.
 */
export function achterlopersUitAntwoord(antwoord, { huidige, doel }) {
  const nodes = antwoord?.data?.repositoryOwner?.repositories?.nodes;
  if (!Array.isArray(nodes) || !Number.isSafeInteger(doel)) return null;
  const apps = [];
  for (const r of nodes) {
    if (!r || typeof r.nameWithOwner !== "string" || r.isTemplate) continue;
    if (r.nameWithOwner.toLowerCase() === (huidige ?? "").toLowerCase()) continue;
    if (!SCHRIJVERS.has(r.viewerPermission)) continue;
    let manifest;
    try {
      manifest = JSON.parse(r.manifest?.text ?? "null");
    } catch {
      continue;
    }
    if (!isCloudflareManifest(manifest)) continue;
    const tekst = (r.versie?.text ?? "").trim();
    if (!/^\d{1,6}$/.test(tekst)) continue;
    const versie = Number(tekst);
    if (versie < doel) apps.push({ repo: r.nameWithOwner, naam: r.nameWithOwner.split("/")[1], versie });
  }
  apps.sort((a, b) => a.versie - b.versie || a.naam.localeCompare(b.naam));
  return apps;
}

function standaardExec(cmd, args, opties) {
  return new Promise((klaar, fout) => {
    execFile(cmd, args, opties, (err, stdout) => (err ? fout(err) : klaar(stdout)));
  });
}

/**
 * De achterlopers in de organisatie `eigenaar`, of null als dat niet binnen `timeoutMs` lukt.
 * Gooit nooit. Testhaak: STAGETWO_ANDERE_APPS_TEST vervangt het antwoord van GitHub ("geen"
 * is geen antwoord, anders JSON-tekst).
 */
export async function andereAppsAchter({ eigenaar, huidige, doel, timeoutMs = 3000, env = process.env, exec = standaardExec }) {
  if (!eigenaar || !Number.isSafeInteger(doel)) return null;
  const test = env.STAGETWO_ANDERE_APPS_TEST;
  try {
    let antwoord;
    if (test !== undefined) {
      if (test === "geen") return null;
      antwoord = JSON.parse(test);
    } else {
      const uit = await exec("gh", ["api", "graphql", "-f", `login=${eigenaar}`, "-f", `query=${VRAAG}`], {
        encoding: "utf8",
        timeout: timeoutMs,
        maxBuffer: 16 * 1024 * 1024,
        env: { ...env, GH_PROMPT_DISABLED: "1" },
      });
      antwoord = JSON.parse(String(uit));
    }
    return achterlopersUitAntwoord(antwoord, { huidige, doel });
  } catch {
    return null;
  }
}
