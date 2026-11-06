#!/usr/bin/env node
/**
 * De laatste regels van het logboek van het bedrijf (uitgave 39): `docs/logboek.md` in de
 * architectuur-repo (`<eigenaar>/architectuur`). Daar komt na elke merge te staan wat er voor
 * het grotere plaatje veranderde (het kopje "Voor de architectuur" van de pull request).
 *
 *   node logboek.mjs [--regels <n>] [--map <map van de app>]
 *
 * Voor Claude, als achtergrond bij de start van een klus; niet om voor te lezen. Eerst via
 * `gh` (de nieuwste stand), anders een kopie op deze computer naast de app
 * (`../architectuur/docs/logboek.md`) of in de werkmap (`architectuur/docs/logboek.md`).
 * Geen logboek, geen gh, geen netwerk: geen uitvoer, en exit 0. Nooit in de weg.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const STANDAARD_REGELS = 20;
const LOGBOEK = join("docs", "logboek.md");

function standaardExec(cmd, args) {
  return execFileSync(cmd, args, {
    encoding: "utf8",
    timeout: 5000,
    stdio: ["ignore", "pipe", "ignore"],
    env: { ...process.env, GH_PROMPT_DISABLED: "1", GIT_TERMINAL_PROMPT: "0" },
  });
}

/** `eigenaar` uit een origin op GitHub, of null. */
export function eigenaarVan(origin) {
  const m = /github\.com[/:]([A-Za-z0-9_.-]+)\/[A-Za-z0-9_.-]+?(?:\.git)?\/?\s*$/.exec(origin ?? "");
  return m ? m[1] : null;
}

/** De laatste `n` regels met inhoud. */
export function laatsteRegels(tekst, n) {
  const regels = String(tekst).split(/\r?\n/).filter((r) => r.trim() !== "");
  return regels.slice(-n);
}

/**
 * `{ bron, regels }` of null. `exec` en `lees` zijn injecteerbaar voor de tests.
 */
export function leesLogboek({ map, regels = STANDAARD_REGELS, exec = standaardExec, lees = leesBestand } = {}) {
  let eigenaar = null;
  try {
    eigenaar = eigenaarVan(exec("git", ["-C", map, "remote", "get-url", "origin"]).trim());
  } catch {
    // geen git of geen origin: dan alleen een kopie op deze computer
  }
  if (eigenaar) {
    try {
      const tekst = exec("gh", ["api", `repos/${eigenaar}/architectuur/contents/docs/logboek.md`, "-H", "Accept: application/vnd.github.raw"]);
      const uit = laatsteRegels(tekst, regels);
      if (uit.length > 0) return { bron: `${eigenaar}/architectuur`, regels: uit };
    } catch {
      // geen gh, geen login, geen logboek op GitHub: verder met een kopie op deze computer
    }
  }
  for (const pad of [join(dirname(map), "architectuur", LOGBOEK), join(map, "architectuur", LOGBOEK)]) {
    const tekst = lees(pad);
    if (tekst === null) continue;
    const uit = laatsteRegels(tekst, regels);
    if (uit.length > 0) return { bron: pad, regels: uit };
  }
  return null;
}

function leesBestand(pad) {
  try {
    return existsSync(pad) ? readFileSync(pad, "utf8") : null;
  } catch {
    return null;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const argv = process.argv.slice(2);
  const waarde = (vlag) => {
    const i = argv.indexOf(vlag);
    return i !== -1 ? argv[i + 1] : undefined;
  };
  const n = Number(waarde("--regels"));
  try {
    const uit = leesLogboek({
      map: resolve(waarde("--map") ?? process.cwd()),
      regels: Number.isSafeInteger(n) && n > 0 ? n : STANDAARD_REGELS,
    });
    if (uit) console.log([`Logboek (${uit.bron}), de laatste ${uit.regels.length} regels:`, ...uit.regels].join("\n"));
  } catch {
    // nooit in de weg
  }
  process.exitCode = 0;
}
