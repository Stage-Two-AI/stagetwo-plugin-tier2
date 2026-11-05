/**
 * Projectbestanden die een nieuwe versie van de template eenmalig nodig heeft. De kern
 * (lib/toepassen.mjs) raakt alleen bestanden van de template. Een paar overgangen vragen
 * daarnaast iets in een bestand van het project, anders is de update-PR zelf rood. Dat staat
 * hier, per versie, en nergens anders. Wat dit niet veilig zelf kan, wordt uitleg voor de
 * bouwer (`voorDeBouwer`), in de uitkomst en in de pull request.
 *
 * Versie 39:
 * - `src/onderdelen.ts`: de test `tests/unit/onderdelen.test.ts` en de browsertest
 *   `e2e/onderdelen.spec.ts` (allebei van de template) lezen dat bestand. Ontbreekt het, dan
 *   zet dit het neer, gevuld uit de routes in src/ (zelfde zoekregel als die test), en anders
 *   met alleen `/`. De kop per onderdeel kan dit niet weten; die geeft de skill mee met
 *   `--kop <pad> <kop>` (zie zetKoppen).
 * - `stack.config.json`: `scripts/open-tabellen-opnemen.mjs` (van de template, versie 39)
 *   neemt bewuste open policies (`using (true)`) die er al stonden op in `open_tabellen`,
 *   met de reden "nog nalopen". Anders maakt de nieuwe regel in guard:rls de update-PR rood.
 * - `e2e/global-setup.ts`: van het project, en dit raakt het niet. Mist daar de testrol, dan
 *   zegt de uitleg wat erbij moet.
 *
 * Puur over de map van de app, op het draaien van een script na (callback `node`).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const ONDERDELEN_PAD = "src/onderdelen.ts";
export const STACK_CONFIG = "stack.config.json";
export const OPEN_TABELLEN_SCRIPT = "scripts/open-tabellen-opnemen.mjs";
export const GLOBAL_SETUP = "e2e/global-setup.ts";
export const VERSIE_ONDERDELEN = 39;

/** Paden die bewust geen onderdeel zijn: inloggen en de terugkeer van de inlog. */
const GEEN_ONDERDEEL = /^\/(login|inloggen|logout|uitloggen|auth|callback)$/i;
/** Hetzelfde patroon als tests/unit/onderdelen.test.ts in de template. */
const ROUTE = /\bpath(?:=\{?|:\s*)["'`](\/[^"'`]*)["'`]/g;

function bestanden(map) {
  if (!existsSync(map)) return [];
  return readdirSync(map).flatMap((naam) => {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) return bestanden(pad);
    return /\.tsx?$/.test(naam) && !/\.test\.tsx?$/.test(naam) ? [pad] : [];
  });
}

/** Het hoofdpad zoals de test het telt: `/klanten/:id` hoort bij `/klanten`. */
export function hoofdpad(pad) {
  const eerste = pad.split("/").filter(Boolean)[0];
  if (eerste === undefined) return "/";
  if (eerste.startsWith(":") || eerste === "*") return null;
  return `/${eerste}`;
}

/** De hoofdpaden in de router van de app (src/), gesorteerd. */
export function routesUitSrc(map) {
  const paden = new Set();
  for (const bestand of bestanden(join(map, "src"))) {
    for (const m of readFileSync(bestand, "utf8").matchAll(ROUTE)) {
      const pad = hoofdpad(m[1] ?? "");
      if (pad) paden.add(pad);
    }
  }
  return [...paden].sort();
}

/** Een naam uit het pad: `/` wordt "Start", `/nieuwe-order` wordt "Nieuwe order". */
export function naamUitPad(pad) {
  if (pad === "/") return "Start";
  const woorden = pad.slice(1).replace(/[-_]+/g, " ").trim();
  return woorden.charAt(0).toUpperCase() + woorden.slice(1);
}

/** Het voorstel: `{ onderdelen: [{pad, naam}], geen: [pad] }`. Zonder routes alleen `/`. */
export function onderdelenVoorstel(routes) {
  const geen = routes.filter((p) => GEEN_ONDERDEEL.test(p));
  const onderdelen = routes.filter((p) => !GEEN_ONDERDEEL.test(p)).map((pad) => ({ pad, naam: naamUitPad(pad) }));
  if (onderdelen.length === 0) onderdelen.push({ pad: "/", naam: naamUitPad("/") });
  return { onderdelen, geen };
}

const tekst = (s) => JSON.stringify(s);

/** De inhoud van src/onderdelen.ts. `koppen`: { pad: kop } voor de kop van het hoofdscherm. */
export function onderdelenBestand({ onderdelen, geen }, koppen = {}) {
  const regels = onderdelen.map(({ pad, naam }) => {
    const kop = koppen[pad];
    return kop && kop !== naam
      ? `  { pad: ${tekst(pad)}, naam: ${tekst(naam)}, kop: ${tekst(kop)} },`
      : `  { pad: ${tekst(pad)}, naam: ${tekst(naam)} },`;
  });
  return [
    "/**",
    " * De onderdelen van deze app: elk hoofdscherm met zijn eigen pad. De startpagina (tegels of",
    " * een menu) kan deze lijst lezen, en de browsertest `e2e/onderdelen.spec.ts` opent elk",
    " * onderdeel en kijkt of het zonder fout opent en zijn kop toont.",
    " *",
    " * Een nieuw onderdeel krijgt hier een regel; de browsertest opent het dan vanzelf. Vergeet je",
    " * dat, dan wordt `tests/unit/onderdelen.test.ts` rood: die vergelijkt deze lijst met de routes",
    " * in src/.",
    " *",
    " * - `pad`: waar het onderdeel woont, bijvoorbeeld \"/klanten\".",
    " * - `naam`: hoe het onderdeel heet, zoals op de startpagina.",
    " * - `kop`: de kop (h1) van het hoofdscherm, als die anders is dan de naam.",
    " *",
    ` * Neergezet bij het bijwerken naar versie ${VERSIE_ONDERDELEN}, uit de routes van deze app. Dit bestand is`,
    " * van het project: pas de namen gerust aan.",
    " */",
    "export type Onderdeel = { pad: string; naam: string; kop?: string };",
    "",
    "export const ONDERDELEN: Onderdeel[] = [",
    ...regels,
    "];",
    "",
    "/**",
    " * Paden in de router die bewust geen onderdeel zijn: inloggen, een terugkeeradres van de",
    " * inlog, een scherm dat je alleen via een ander onderdeel bereikt.",
    " */",
    `export const GEEN_ONDERDEEL: string[] = [${geen.map(tekst).join(", ")}];`,
    "",
  ].join("\n");
}

const kruist = (van, naar, versie) => van < versie && naar >= versie;

/**
 * Alles voor de overgang van `van` naar `naar`. Geeft
 * `{ bijgewerkt: [{pad, hoe}], paden: [pad], voorDeBouwer: [tekst], onderdelen, reden }`:
 * `reden` is gezet als het mislukte (dan is de werkkopie niet te vertrouwen).
 * `node`: { draai(map, script) -> uitvoer } (gooit bij een fout).
 */
export function projectbestanden({ map, van, naar, node = null }) {
  const uit = { bijgewerkt: [], paden: [], voorDeBouwer: [], onderdelen: null, reden: null };
  if (!kruist(van, naar, VERSIE_ONDERDELEN)) return uit;

  // src/onderdelen.ts, alleen als hij er nog niet is.
  if (!existsSync(join(map, ONDERDELEN_PAD))) {
    const routes = routesUitSrc(map);
    const voorstel = onderdelenVoorstel(routes);
    mkdirSync(dirname(join(map, ONDERDELEN_PAD)), { recursive: true });
    writeFileSync(join(map, ONDERDELEN_PAD), onderdelenBestand(voorstel));
    uit.onderdelen = voorstel;
    uit.paden.push(ONDERDELEN_PAD);
    uit.bijgewerkt.push({
      pad: ONDERDELEN_PAD,
      hoe: routes.length > 0 ? "nieuw, eenmalig; gevuld uit de routes van de app" : "nieuw, eenmalig; alleen `/`, er zijn geen routes gevonden",
    });
    uit.voorDeBouwer.push(
      `\`${ONDERDELEN_PAD}\` is nieuw en van jou: de lijst met onderdelen (${voorstel.onderdelen.map((o) => o.pad).join(", ")}) die de browsertest één voor één opent. Kloppen een naam of kop niet, pas ze dan aan.`,
    );
  }

  // stack.config.json: bestaande open policies in open_tabellen.
  if (existsSync(join(map, OPEN_TABELLEN_SCRIPT)) && existsSync(join(map, STACK_CONFIG)) && node) {
    const voor = readFileSync(join(map, STACK_CONFIG), "utf8");
    let uitvoer;
    try {
      uitvoer = String(node.draai(map, OPEN_TABELLEN_SCRIPT) ?? "");
    } catch (fout) {
      return { ...uit, reden: `${OPEN_TABELLEN_SCRIPT} gaf een fout: ${String(fout.message ?? fout).split("\n")[0]}` };
    }
    if (readFileSync(join(map, STACK_CONFIG), "utf8") !== voor) {
      uit.paden.push(STACK_CONFIG);
      uit.bijgewerkt.push({ pad: STACK_CONFIG, hoe: "eenmalig: bestaande open policies opgenomen in open_tabellen" });
      uit.voorDeBouwer.push(
        `In \`${STACK_CONFIG}\` staan bij \`open_tabellen\` de tabellen die al een open policy (\`using (true)\`) hadden, met de reden "nog nalopen". Zet per tabel de echte reden, of maak de policy smal in een nieuwe migratie.`,
      );
    }
    if (/blijven rood/.test(uitvoer)) {
      const tabellen = uitvoer
        .split("\n")
        .filter((r) => /^\s+- .*\(policy /.test(r))
        .map((r) => r.trim().replace(/^- /, ""));
      uit.voorDeBouwer.push(
        `Deze policies staan open voor iedereen met de openbare sleutel en houden guard:rls rood: ${tabellen.join("; ")}. Maak ze smal (\`to authenticated\`, liefst met een eigen voorwaarde) in een nieuwe migratie.`,
      );
    }
  }

  // e2e/global-setup.ts: van het project; alleen uitleg.
  if (existsSync(join(map, GLOBAL_SETUP)) && !readFileSync(join(map, GLOBAL_SETUP), "utf8").includes("testrol.sql")) {
    uit.voorDeBouwer.push(
      `\`${GLOBAL_SETUP}\` is van jou en is niet bijgewerkt. Heeft de app rollen (\`supabase/testrol.sql\`), zet daar dan na het aanmaken van de e2e-gebruiker een aanroep \`geefTestrol()\` en neem de functie \`geefTestrol\` over uit \`${GLOBAL_SETUP}\` van de template (versie ${VERSIE_ONDERDELEN}): die draait \`supabase/testrol.sql\` met het adres van de e2e-gebruiker. Zonder rol opent de browsertest per onderdeel lege of afgeschermde schermen en wordt hij rood. Zonder rollen hoeft er niets.`,
    );
  }
  return uit;
}

/**
 * De koppen die de skill meegeeft (`--kop <pad> <kop>`) in src/onderdelen.ts zetten. Alleen
 * voor een bestand dat deze ronde zelf heeft neergezet (`onderdelen` uit projectbestanden).
 * Geeft een fout als tekst, of null.
 */
export function zetKoppen(map, onderdelen, koppen) {
  const paden = Object.keys(koppen);
  if (paden.length === 0) return null;
  if (!onderdelen) return `--kop: ${ONDERDELEN_PAD} is deze ronde niet neergezet; pas het aan met /stagetwo-tier2:verder-werken`;
  const onbekend = paden.filter((p) => !onderdelen.onderdelen.some((o) => o.pad === p));
  if (onbekend.length > 0) return `--kop ${onbekend[0]}: dit pad staat niet in de lijst met onderdelen van de droogloop`;
  const leeg = paden.find((p) => !String(koppen[p] ?? "").trim());
  if (leeg) return `--kop ${leeg}: geef de kop van het hoofdscherm mee`;
  writeFileSync(join(map, ONDERDELEN_PAD), onderdelenBestand(onderdelen, koppen));
  return null;
}
