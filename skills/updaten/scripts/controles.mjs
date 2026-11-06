#!/usr/bin/env node
/**
 * Deel 3e van /stagetwo-tier2:updaten: zet een bestaande app goed buiten zijn bestanden om,
 * met de gh-login van de bouwer (zie lib/controles.mjs).
 *
 *   node controles.mjs --json [--repo <eigenaar>/<naam>]
 *
 * 1. De ruleset van main krijgt de verplichte controle "Droogloop migraties" (meteen, zonder
 *    vraag: het typen van updaten is de toestemming). Zonder beheerrechten: `ruleset.regel`.
 * 2. Mist de inrichting de sleutels voor de droogloop of Sentry, dan zegt `inrichting` of de
 *    bouwer App inrichten zelf kan starten (`kanStarten`, met `opdracht`), of wat Stage Two doet
 *    (`stageTwo`). Starten doet dit script niet: de skill vraagt het eerst.
 *
 * Eén JSON-object met `status`: klaar | mislukt (`reden`).
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { watMistDeInrichting, zetVerplichteControle } from "../../../lib/controles.mjs";
import { eersteRegel, ghAanwezig, ghIngelogd, originUrl, repoUitUrl, sh } from "../../../lib/repo.mjs";
import { kiesBeheerRepo } from "../../nieuwe-app/scripts/nieuwe-app.mjs";

export function leesArgumenten(argv) {
  const arg = { repo: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--repo") arg.repo = argv[++i] ?? null;
    else if (argv[i] === "--json") arg.json = true;
    else throw new Error(`onbekende optie ${argv[i]}`);
  }
  if (arg.repo !== null && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(arg.repo)) throw new Error("geef --repo als eigenaar/naam");
  return arg;
}

const ghStandaard = (args) => sh("gh", args);

function repoBestaat(gh, repo) {
  try {
    gh(["api", `repos/${repo}`, "--silent"]);
    return true;
  } catch {
    return false;
  }
}

/** `d`: { gh, cwd } (voor de tests). */
export function controles(arg, { gh = ghStandaard, cwd = process.cwd() } = {}) {
  const repo = arg.repo ?? repoUitUrl(originUrl(cwd) ?? "");
  if (!repo) return { status: "mislukt", reden: "deze map heeft geen origin op GitHub; geef --repo eigenaar/naam mee" };
  const [eigenaar, naam] = repo.split("/");
  const ruleset = zetVerplichteControle(repo, { gh });
  const beheer = kiesBeheerRepo(eigenaar, (r) => repoBestaat(gh, r));
  const inrichting = watMistDeInrichting(repo, { gh, beheer });
  return {
    status: "klaar",
    repo,
    ruleset,
    inrichting: {
      ...inrichting,
      opdracht: inrichting.kanStarten
        ? `node "\${CLAUDE_SKILL_DIR}/../nieuwe-app/scripts/nieuwe-app.mjs" --json --inrichten --eigenaar ${eigenaar} --naam ${naam}`
        : null,
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let uitkomst;
  try {
    const arg = leesArgumenten(process.argv.slice(2));
    if (!ghAanwezig()) uitkomst = { status: "mislukt", reden: "de GitHub-opdrachtregel (gh) ontbreekt; draai eerst /stagetwo-tier2:installatie" };
    else if (!ghIngelogd()) uitkomst = { status: "mislukt", reden: "log eerst in bij GitHub met `gh auth login`" };
    else uitkomst = controles(arg);
  } catch (fout) {
    uitkomst = { status: "mislukt", reden: eersteRegel(fout) };
  }
  process.stdout.write(`${JSON.stringify(uitkomst, null, 2)}\n`);
  process.exitCode = uitkomst.status === "mislukt" ? 1 : 0;
}
