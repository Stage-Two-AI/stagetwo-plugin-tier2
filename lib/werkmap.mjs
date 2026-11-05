/**
 * De werkmap van een bouwer: de map waarin zijn apps staan (uitgave 39). Bouwers starten
 * Claude vaak in die bovenliggende map in plaats van in de map van één app. Dan heeft de
 * projectmap zelf geen .claude/stack-manifest.json, maar de mappen eronder wel.
 *
 * Dit bestand kijkt precies één niveau dieper en geeft de apps van deze tier terug. De hook
 * gebruikt het bij sessiestart (één regel: welke apps hier staan en welke achterlopen) en bij
 * PreToolUse (de bewaker beoordeelt een bestand in de map van de app waar het in staat). Het
 * script werkmap.mjs van de installatie gebruikt het voor de CLAUDE.md en de preview van de
 * werkmap.
 *
 * Alleen lezen, geen netwerk. Een map die er raar uitziet (geen leesbaar manifest, een ander
 * spoor) telt niet mee. Een git-worktree (`.git` is daar een bestand) ook niet: dat is een
 * tweede checkout van een app die er al staat.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { isCloudflareManifest } from "./manifest.mjs";

/** Mappen die nooit een app zijn. */
const OVERSLAAN = new Set(["node_modules"]);

function leesJson(pad) {
  try {
    const waarde = JSON.parse(readFileSync(pad, "utf8"));
    return waarde && typeof waarde === "object" ? waarde : null;
  } catch {
    return null;
  }
}

/** Het manifest van deze tier in `map`, of null. */
export function manifestVan(map) {
  const manifest = leesJson(join(map, ".claude", "stack-manifest.json"));
  return manifest && isCloudflareManifest(manifest) ? manifest : null;
}

function leesVersie(map) {
  try {
    const tekst = readFileSync(join(map, ".claude", "stack-version"), "utf8").trim();
    return /^\d{1,6}$/.test(tekst) ? Number(tekst) : null;
  } catch {
    return null;
  }
}

function isWorktree(map) {
  try {
    return statSync(join(map, ".git")).isFile();
  } catch {
    return false;
  }
}

/**
 * De apps van deze tier direct onder `werkmap`, op naam gesorteerd:
 * `[{ naam, map, versie, manifest }]`. Een lege lijst als er niets is (of de map niet bestaat).
 */
export function appsInWerkmap(werkmap) {
  let namen;
  try {
    namen = readdirSync(werkmap, { withFileTypes: true });
  } catch {
    return [];
  }
  const apps = [];
  for (const d of namen) {
    if (!d.isDirectory() || d.name.startsWith(".") || OVERSLAAN.has(d.name)) continue;
    const map = join(werkmap, d.name);
    const manifest = manifestVan(map);
    if (!manifest || isWorktree(map)) continue;
    apps.push({ naam: d.name, map, versie: leesVersie(map), manifest });
  }
  return apps.sort((a, b) => a.naam.localeCompare(b.naam));
}

/** De origin van de app in `map`, of null (geen git, geen origin, te traag). */
export function originVan(map) {
  try {
    return execFileSync("git", ["-C", map, "remote", "get-url", "origin"], {
      encoding: "utf8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/** `eigenaar` uit een origin op GitHub (https of ssh), of null. */
export function eigenaarUitOrigin(origin) {
  const m = /github\.com[/:]([A-Za-z0-9_.-]+)\/[A-Za-z0-9_.-]+?(?:\.git)?\/?\s*$/.exec(origin ?? "");
  return m ? m[1] : null;
}

// ---------------------------------------------------------------- CLAUDE.md en preview

export const BEGIN = "<!-- stagetwo:werkmap begin -->";
export const EINDE = "<!-- stagetwo:werkmap einde -->";

/** Het blok voor de CLAUDE.md van de werkmap (tussen de markeringen, die er zelf bij horen). */
export function claudeBlok({ apps, eigenaren = [] }) {
  const van = eigenaren.length > 0 ? ` van ${eigenaren.join(" en ")}` : "";
  return [
    BEGIN,
    `# Werkmap met de apps${van}`,
    "",
    "Deze tekst zet de Stage Two-plugin hier neer (/stagetwo-tier2:installatie). Wat tussen de",
    "markeringen staat, schrijft hij bij een volgende keer opnieuw; schrijf eigen aantekeningen",
    "erbuiten.",
    "",
    "Hier staan de apps, elk in een eigen map:",
    "",
    ...apps.map((a) => `- \`${a.naam}/\`${a.versie !== null ? ` (template-versie ${a.versie})` : ""}`),
    "",
    "Elke wijziging aan een app gaat via `/stagetwo-tier2:verder-werken`, ook vanuit deze map.",
    "Kies de app uit de vraag van de gebruiker (vraag alleen als het er echt meer kunnen zijn) en",
    "draai alles in de map van die app: `cd <app> && ...` of `git -C <app>`. Lees daar eerst",
    "`docs/routes/verder-werken.md`. Elke app krijgt zijn eigen branch en zijn eigen",
    "concept-PR. De preview in de Claude-app start per app (de namen hierboven, uit",
    "`.claude/launch.json` van deze map).",
    EINDE,
  ].join("\n");
}

/**
 * De nieuwe inhoud van CLAUDE.md: het blok vervangen als het er al staat, anders onderaan
 * toevoegen (of het hele bestand als er nog niets was). Eigen tekst blijft staan.
 */
export function claudeMdBijwerken(bestaand, blok) {
  if (typeof bestaand !== "string" || bestaand.trim() === "") return `${blok}\n`;
  const begin = bestaand.indexOf(BEGIN);
  const einde = bestaand.indexOf(EINDE);
  if (begin !== -1 && einde > begin) {
    return `${bestaand.slice(0, begin)}${blok}${bestaand.slice(einde + EINDE.length)}`;
  }
  return `${bestaand.replace(/\s*$/, "")}\n\n${blok}\n`;
}

/** Het startbestand van de preview in de werkmap: gaat naar de map van de app en start zijn preview. */
export const STARTER = ".claude/stagetwo-preview.mjs";

export const STARTER_TEKST = `// Gemaakt door de Stage Two-plugin (werkmap.mjs). Start de preview van één app uit deze
// werkmap: node .claude/stagetwo-preview.mjs <app>. Gaat naar de map van de app en draait daar
// scripts/preview.mjs, precies zoals de preview in de map van de app zelf.
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const app = process.argv[2];
if (!app || app.includes("/") || app.includes("\\\\") || app.startsWith(".")) {
  console.error("Geef de naam van de app mee, bijvoorbeeld: node .claude/stagetwo-preview.mjs intern");
  process.exit(1);
}
process.chdir(join(dirname(fileURLToPath(import.meta.url)), "..", app));
await import(pathToFileURL(join(process.cwd(), "scripts", "preview.mjs")).href);
`;

/**
 * De nieuwe .claude/launch.json van de werkmap: per app een configuratie met de naam van de
 * app. Configuraties die de plugin niet maakte, blijven staan; een configuratie van de plugin
 * voor een app die er niet meer is, verdwijnt.
 */
export function launchBijwerken(bestaand, apps) {
  const configuraties = Array.isArray(bestaand?.configurations) ? bestaand.configurations : [];
  const vanOns = (c) => Array.isArray(c?.runtimeArgs) && c.runtimeArgs[0] === STARTER;
  const namen = new Set(apps.map((a) => a.naam));
  const eigen = configuraties.filter((c) => !vanOns(c) && !namen.has(c?.name));
  const nieuw = apps.map((a) => ({
    name: a.naam,
    runtimeExecutable: "node",
    runtimeArgs: [STARTER, a.naam],
    port: 5173,
    autoPort: true,
  }));
  return { ...(bestaand && typeof bestaand === "object" ? bestaand : {}), version: "0.0.1", configurations: [...eigen, ...nieuw] };
}
