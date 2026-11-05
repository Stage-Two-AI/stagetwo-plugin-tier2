#!/usr/bin/env node
/**
 * De werkmap van de bouwer inrichten: de map waarin zijn apps staan (uitgave 39). Zo kan hij
 * Claude gewoon daar starten in plaats van in de map van één app.
 *
 *   node werkmap.mjs [--map <map>]
 *
 * Schrijft, alleen als er apps van tier 2 één niveau dieper staan:
 *   - CLAUDE.md: welke apps hier staan, dat wijzigingen via verder-werken gaan, in de map van
 *     de app. Alleen het blok tussen de markeringen; eigen tekst blijft staan.
 *   - .claude/launch.json: per app een preview met de naam van de app (andere configuraties
 *     blijven staan), en .claude/stagetwo-preview.mjs, dat naar de map van de app gaat en daar
 *     scripts/preview.mjs start.
 *
 * Uitkomst: één JSON-object op stdout, `status` is `klaar`, `geen-apps` of `mislukt`; bij klaar
 * per bestand `nieuw`, `bijgewerkt` of `gelijk`. Geen commit: de werkmap is geen repo.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  appsInWerkmap,
  claudeBlok,
  claudeMdBijwerken,
  eigenaarUitOrigin,
  launchBijwerken,
  originVan,
  STARTER,
  STARTER_TEKST,
} from "../../../lib/werkmap.mjs";

function lees(pad) {
  return existsSync(pad) ? readFileSync(pad, "utf8") : null;
}

/** Schrijft `inhoud` als die verschilt; geeft `nieuw`, `bijgewerkt` of `gelijk`. */
function schrijf(pad, inhoud) {
  const oud = lees(pad);
  if (oud === inhoud) return "gelijk";
  writeFileSync(pad, inhoud);
  return oud === null ? "nieuw" : "bijgewerkt";
}

export function richtWerkmapIn(map, { origin = originVan } = {}) {
  const apps = appsInWerkmap(map);
  if (apps.length === 0) return { status: "geen-apps", map };
  const eigenaren = [...new Set(apps.map((a) => eigenaarUitOrigin(origin(a.map))).filter(Boolean))];

  const claudePad = join(map, "CLAUDE.md");
  const claudeMd = schrijf(claudePad, claudeMdBijwerken(lees(claudePad), claudeBlok({ apps, eigenaren })));

  mkdirSync(join(map, ".claude"), { recursive: true });
  const launchPad = join(map, ".claude", "launch.json");
  let bestaand = null;
  const tekst = lees(launchPad);
  if (tekst !== null) {
    try {
      bestaand = JSON.parse(tekst);
    } catch {
      return { status: "mislukt", reden: `${launchPad} is geen geldige JSON; herstel of verwijder het bestand en probeer opnieuw` };
    }
  }
  const preview = schrijf(launchPad, `${JSON.stringify(launchBijwerken(bestaand, apps), null, 2)}\n`);
  const starter = schrijf(join(map, STARTER), STARTER_TEKST);

  return {
    status: "klaar",
    map,
    apps: apps.map((a) => a.naam),
    eigenaren,
    claudeMd,
    preview: preview === "gelijk" && starter !== "gelijk" ? "bijgewerkt" : preview,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--map");
  const map = resolve(i !== -1 && argv[i + 1] ? argv[i + 1] : process.cwd());
  let uit;
  try {
    uit = richtWerkmapIn(map);
  } catch (fout) {
    uit = { status: "mislukt", reden: fout.message };
  }
  console.log(JSON.stringify(uit));
  process.exitCode = uit.status === "mislukt" ? 1 : 0;
}
