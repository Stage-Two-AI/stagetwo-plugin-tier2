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
 *   zet dit het neer, gevuld uit de routes in src/ (de zoekregel van de template, scripts/lib/onderdelen.mjs, die ook die test gebruikt), en anders
 *   met alleen `/`. De kop per onderdeel kan dit niet weten; die geeft de skill mee met
 *   `--kop <pad> <kop>` (zie zetKoppen).
 * - `stack.config.json`: `scripts/open-tabellen-opnemen.mjs` (van de template, versie 39)
 *   neemt bewuste open policies (`using (true)`) die er al stonden op in `open_tabellen`,
 *   met de reden "nog nalopen". Anders maakt de nieuwe regel in guard:rls de update-PR rood.
 *   Die tabellen staan in `openTabellen`: Claude vult tussen de twee aanroepen per tabel de
 *   echte reden in (zie controleerOpenTabellen), en de PR toont ze onder een eigen kopje.
 * - `e2e/global-setup.ts`: van het project. Mist daar de testrol, dan staat hij in `testrol`
 *   en past Claude het bestand tussen de twee aanroepen aan, in de commit van updaten zelf
 *   (zie controleerTestrol). Zo staat er nooit een vreemde commit op de update-branch.
 *
 * Puur over de map van de app, op het draaien van een script na (callback `node`).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const ONDERDELEN_PAD = "src/onderdelen.ts";
export const STACK_CONFIG = "stack.config.json";
export const OPEN_TABELLEN_SCRIPT = "scripts/open-tabellen-opnemen.mjs";
export const GLOBAL_SETUP = "e2e/global-setup.ts";
export const VERSIE_ONDERDELEN = 39;

/** Paden die bewust geen onderdeel zijn: inloggen, de terugkeer van de inlog en de API. */
const GEEN_ONDERDEEL = /^\/(login|inloggen|logout|uitloggen|auth|callback|api)$/i;

/**
 * De zoekregel voor de hoofdpaden staat op één plek: `scripts/lib/onderdelen.mjs` van de
 * template (sinds versie 40). De test `tests/unit/onderdelen.test.ts` gebruikt hem, en updaten
 * draait hem in de werkkopie, waar hij na de templatebestanden al staat. Zo tellen plugin en
 * test nooit verschillend (bij stagetwo-site vond een eigen kopie hier alleen `/`).
 */
export const ONDERDELEN_SCRIPT = "scripts/lib/onderdelen.mjs";

/**
 * De hoofdpaden van de app volgens de template, gesorteerd. Null als het script er niet is, niet
 * draait of iets anders dan een lijst met paden geeft.
 */
export function routesVanTemplate(map, node) {
  if (!node || !existsSync(join(map, ONDERDELEN_SCRIPT))) return null;
  try {
    const lijst = JSON.parse(String(node.draai(map, ONDERDELEN_SCRIPT) ?? ""));
    if (!Array.isArray(lijst) || !lijst.every((p) => typeof p === "string" && p.startsWith("/"))) return null;
    return [...new Set(lijst)].sort();
  } catch {
    return null;
  }
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
  const uit = { bijgewerkt: [], paden: [], voorDeBouwer: [], onderdelen: null, openTabellen: null, testrol: null, reden: null };
  if (!kruist(van, naar, VERSIE_ONDERDELEN)) return uit;

  // src/onderdelen.ts, alleen als hij er nog niet is.
  if (!existsSync(join(map, ONDERDELEN_PAD))) {
    const gevonden = routesVanTemplate(map, node);
    const routes = gevonden ?? [];
    const voorstel = onderdelenVoorstel(routes);
    if (gevonden === null) {
      uit.voorDeBouwer.push(
        `\`${ONDERDELEN_PAD}\` heeft alleen \`/\`: de zoekregel van de template (\`${ONDERDELEN_SCRIPT}\`) draaide niet. Heeft de app meer schermen, dan zegt de test \`tests/unit/onderdelen.test.ts\` welke er missen; Claude vult ze aan in /stagetwo-tier2:verder-werken.`,
      );
    }
    mkdirSync(dirname(join(map, ONDERDELEN_PAD)), { recursive: true });
    writeFileSync(join(map, ONDERDELEN_PAD), onderdelenBestand(voorstel));
    uit.onderdelen = voorstel;
    uit.paden.push(ONDERDELEN_PAD);
    uit.bijgewerkt.push({
      pad: ONDERDELEN_PAD,
      hoe: routes.length > 0 ? "nieuw, eenmalig; gevuld uit de routes van de app" : "nieuw, eenmalig; alleen `/`, er zijn geen routes gevonden",
    });
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
    const na = readFileSync(join(map, STACK_CONFIG), "utf8");
    const nieuw = na !== voor ? nieuweOpenTabellen(voor, na) : [];
    if (na !== voor) {
      uit.paden.push(STACK_CONFIG);
      uit.bijgewerkt.push({ pad: STACK_CONFIG, hoe: "eenmalig: bestaande open policies opgenomen in open_tabellen" });
    }
    const nooit = /blijven rood/.test(uitvoer)
      ? uitvoer
          .split("\n")
          .filter((r) => /^\s+- .*\(policy /.test(r))
          .map((r) => r.trim().replace(/^- /, ""))
      : [];
    if (nieuw.length > 0 || nooit.length > 0) {
      uit.openTabellen = { tabellen: nieuw, nooit, config: na, migratie: nooit.length > 0 ? smalMigratiePad() : null };
    }
  }

  // e2e/global-setup.ts: van het project; Claude past hem aan tussen de twee aanroepen.
  if (existsSync(join(map, GLOBAL_SETUP)) && !readFileSync(join(map, GLOBAL_SETUP), "utf8").includes("testrol.sql")) {
    uit.testrol = { pad: GLOBAL_SETUP, voor: readFileSync(join(map, GLOBAL_SETUP), "utf8") };
  }
  return uit;
}

/**
 * Waar Claude het voorstel zet dat een regel voor iedereen op internet smaller maakt: een nieuwe
 * migratie, met de tijd van nu zodat hij na alle andere komt.
 */
export function smalMigratiePad(nu = new Date()) {
  const t = nu.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return `supabase/migrations/${t}_open_regels_smaller.sql`;
}

/**
 * Na Claude: staat het voorstel er? Geeft `{ pad, gedaan, uitleg: [regel] }` of null. De uitleg
 * zijn de regels `-- uitleg: ...` bovenin de migratie, in gewone taal voor de bouwer.
 */
export function controleerSmal(map, openTabellen) {
  if (!openTabellen?.migratie) return null;
  const pad = openTabellen.migratie;
  if (!existsSync(join(map, pad))) return { pad, gedaan: false, uitleg: [] };
  const tekst = readFileSync(join(map, pad), "utf8");
  const uitleg = [...tekst.matchAll(/^--\s*uitleg:\s*(.+)$/gim)].map((m) => m[1].trim());
  return { pad, gedaan: /\bpolicy\b/i.test(tekst), uitleg };
}

/** De reden die open-tabellen-opnemen.mjs schrijft; zo herken je een tabel zonder echte reden. */
export const NOG_NALOPEN = /nog nalopen/;

/** De tabellen die het script net in open_tabellen zette (ontbraken ervoor). */
function nieuweOpenTabellen(voor, na) {
  try {
    const oud = JSON.parse(voor).open_tabellen ?? {};
    const nieuw = JSON.parse(na).open_tabellen ?? {};
    return Object.keys(nieuw).filter((t) => !(t in oud));
  } catch {
    return [];
  }
}

/**
 * Na Claude: alleen de redenen van de tabellen uit `openTabellen` mogen veranderd zijn (een
 * niet-lege tekst); de rest van stack.config.json is gelijk aan na het script. Geeft
 * `{ fout }` of `{ redenen: [{tabel, reden}], zonder: [tabel], nooit }`.
 */
export function controleerOpenTabellen(map, openTabellen, uitAntwoord = []) {
  if (!openTabellen) return { redenen: [], zonder: [], nooit: [] };
  // Geen nieuwe open tabellen: dan valt er in stack.config.json niets in te vullen.
  if (!openTabellen.tabellen?.length) return { redenen: [], zonder: [], nooit: openTabellen.nooit ?? [] };
  let voor;
  let na;
  try {
    voor = JSON.parse(openTabellen.config);
    na = JSON.parse(readFileSync(join(map, STACK_CONFIG), "utf8"));
  } catch {
    return { fout: `${STACK_CONFIG} is geen geldige JSON meer` };
  }
  const { open_tabellen: oudOpen = {}, ...oudRest } = voor;
  // Regels die Claude met het antwoord van de bouwer bij een A/B-tabel zette (lib/abtests.mjs,
  // openNaAntwoord), tellen hier niet mee: die controleert openNaAntwoord.
  const { open_tabellen: alleNieuw = {}, ...nieuwRest } = na;
  const nieuwOpen = Object.fromEntries(Object.entries(alleNieuw).filter(([t]) => !(uitAntwoord.includes(t) && !(t in (voor.open_tabellen ?? {})))));
  const gelijk = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const sleutels = (o) => Object.keys(o).sort();
  if (!gelijk(oudRest, nieuwRest) || !gelijk(sleutels(oudOpen), sleutels(nieuwOpen))) {
    return { fout: `in ${STACK_CONFIG} mag alleen de reden van de nieuw opgenomen open tabellen veranderen` };
  }
  for (const [tabel, reden] of Object.entries(nieuwOpen)) {
    if (reden === oudOpen[tabel]) continue;
    if (!openTabellen.tabellen.includes(tabel) || typeof reden !== "string" || !reden.trim()) {
      return { fout: `in ${STACK_CONFIG} mag alleen de reden van de nieuw opgenomen open tabellen veranderen (${tabel})` };
    }
  }
  const redenen = [];
  const zonder = [];
  for (const tabel of openTabellen.tabellen) {
    const reden = nieuwOpen[tabel];
    if (typeof reden === "string" && !NOG_NALOPEN.test(reden)) redenen.push({ tabel, reden });
    else zonder.push(tabel);
  }
  return { redenen, zonder, nooit: openTabellen.nooit ?? [] };
}

/** Na Claude: heeft global-setup nu de testrol? Geeft `{ gedaan, pad }` of null. */
export function controleerTestrol(map, testrol) {
  if (!testrol) return null;
  const tekst = existsSync(join(map, testrol.pad)) ? readFileSync(join(map, testrol.pad), "utf8") : "";
  return { pad: testrol.pad, gedaan: tekst !== testrol.voor && tekst.includes("testrol.sql") && /geefTestrol\(\)/.test(tekst) };
}

/**
 * Een regel van open-tabellen-opnemen.mjs over een policy voor iedereen met de openbare sleutel,
 * zoals `prijzen (policy "iedereen", anon, for select)`: de tabel en waarvoor hij geldt. Zonder
 * `for` (een oudere uitvoer) telt hij als alles.
 */
export function leesNooit(regel) {
  const tabel = String(regel).trim().split(/[\s(]/)[0].replace(/^public\./, "");
  const opdracht = /\bfor (select|insert|update|delete|all)\)/i.exec(regel)?.[1]?.toLowerCase() ?? "all";
  return { tabel, opdracht };
}

/** Per tabel in gewone taal: "De tabel `x` is nu leesbaar voor iedereen op internet, ...". */
export function openVoorIedereen(nooit) {
  const perTabel = new Map();
  for (const { tabel, opdracht } of nooit.map(leesNooit)) {
    const soort = perTabel.get(tabel) ?? new Set();
    soort.add(opdracht === "select" ? "leesbaar" : "aan te passen");
    perTabel.set(tabel, soort);
  }
  return [...perTabel].map(([tabel, soort]) => {
    const wat = ["leesbaar", "aan te passen"].filter((x) => soort.has(x)).join(" en ");
    return `De tabel \`${tabel}\` is nu ${wat} voor iedereen op internet, ook zonder in te loggen.`;
  });
}

/**
 * Het kopje voor regels die open stonden voor iedereen op internet: het voorstel van updaten
 * (`smal`, uit controleerSmal), of een waarschuwing als er nog geen voorstel is. Nooit wachten op
 * iemand anders: de bouwer beslist met mergen, of laat Claude het opnieuw voorstellen.
 */
export function smalRegels(nooit, smal) {
  const zinnen = openVoorIedereen(nooit).join(" ");
  if (smal?.gedaan) {
    return [
      "",
      `**Regels die open stonden voor iedereen op internet** (voorstel van updaten, in \`${smal.pad}\`)`,
      "",
      `${zinnen.replaceAll(" is nu ", " was ")} Deze pull request maakt dat smaller:`,
      ...(smal.uitleg.length ? smal.uitleg.map((u) => `- ${u}`) : ["- zie de uitleg bovenin de migratie"]),
      "",
      "Klopt dit met wat je app nodig heeft, dan merge je. Moet het anders, zeg het dan in /stagetwo-tier2:verder-werken of draai /stagetwo-tier2:updaten opnieuw; Claude past het voorstel aan.",
    ];
  }
  return [
    "",
    "**Regels die open staan voor iedereen op internet**",
    "",
    `${zinnen} De kwaliteitspoort blijft daarom rood. Draai /stagetwo-tier2:updaten opnieuw: Claude stelt dan een smallere regel voor en vraagt je zo nodig wat de app nodig heeft.`,
  ];
}

/** De kopjes in de pull request voor open tabellen en de testrol, als regels. */
export function prRegelsProject({ open = null, testrol = null, smal = null } = {}) {
  const regels = [];
  if (open?.nooit?.length) regels.push(...smalRegels(open.nooit, smal));
  if (open && (open.redenen.length || open.zonder.length)) {
    regels.push(
      "",
      "**Open tabellen en waarom** (door updaten ingevuld; jij hoeft hier niets voor te doen)",
      "",
      "Deze tabellen hadden al een policy die iedereen binnen alle rijen laat zien (`using (true)`). Ze staan nu in `open_tabellen` in `stack.config.json`, met de reden die updaten uit de migratie en de code haalde. Kijk als reviewer of dat klopt:",
      ...open.redenen.map((r) => `- \`${r.tabel}\`: ${r.reden}`),
      ...open.zonder.map((t) => `- \`${t}\`: nog zonder reden (in \`stack.config.json\` staat "nog nalopen"); dat blokkeert niets, en Claude vraagt het je als je aan deze app werkt`),
    );
  }
  if (testrol) {
    regels.push(
      "",
      "**De testrol in de browsertest**",
      "",
      testrol.gedaan
        ? `\`${testrol.pad}\` geeft de e2e-gebruiker nu de rol uit \`supabase/testrol.sql\` (de functie \`geefTestrol\` uit de template, door updaten toegevoegd). Zonder dat bestand doet hij niets.`
        : `\`${testrol.pad}\` is niet aangepast. Heeft de app rollen, dan krijgt de e2e-gebruiker geen rol en opent de browsertest per onderdeel lege schermen (die test kan dan rood zijn). Zonder rollen werkt alles gewoon.`,
    );
  }
  return regels;
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
