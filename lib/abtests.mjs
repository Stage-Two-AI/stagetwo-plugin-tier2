/**
 * A/B-tests voor tabellen die er nog geen hebben, in de update-PR van /stagetwo-tier2:updaten.
 *
 * Sinds versie 39 meldt `guard:rls-tests` van de template elke tabel zonder A/B-test (gebruiker
 * B ziet, wijzigt en verwijdert de rij van gebruiker A niet), eerst als waarschuwing; een
 * volgende uitgave maakt het rood. Zodat die uitgave niets van de bouwer vraagt, schrijft
 * Claude bij elke update de ontbrekende tests in de werkkopie, zonder het te vragen, en staan
 * ze in de pull request onder een eigen kopje (besluit Christijn 06-11-2026).
 *
 * De taakverdeling:
 * - de eerste aanroep (droogloop) draait de guard van de template in de werkkopie en geeft de
 *   tabellen zonder test, met per tabel het pad waar de test hoort (`nodig`);
 * - Claude schrijft die bestanden in de werkkopie (de skill zegt hoe);
 * - zegt de bouwer op de vraag van Claude dat iedereen in de app alle rijen van een tabel mag
 *   zien, dan zet Claude dat antwoord als reden in `open_tabellen` in stack.config.json, in
 *   plaats van een test (versie 40);
 * - de tweede aanroep laat alleen die nieuwe bestanden en die nieuwe regels in open_tabellen toe
 *   naast de template (`openNaAntwoord`), draait de guard opnieuw en zegt welke tabellen nu een
 *   test hebben, welke open zijn en welke nog niets hebben (`controleer`).
 *
 * De lijst komt uit de guard zelf, zodat plugin en template nooit verschillend tellen. De guard
 * schrijft de tabellen als regels `  - <tabel>`, als waarschuwing (exit 0) en als fout (exit 1).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const GUARD = "scripts/guard-rls-tests.mjs";
export const HULP = "tests/rls/lib/afscherming.ts";
export const KOPJE = "A/B-tests voor tabellen die er nog geen hadden";
export const STACK_CONFIG = "stack.config.json";
/** De voorlopige reden die versie 39 schreef; dat is geen antwoord van de bouwer. */
const NOG_NALOPEN = /nog nalopen/i;

/** Waar de test van een tabel komt: één bestand per tabel, naast de andere RLS-tests. */
export function testPad(tabel) {
  return `tests/rls/afscherming/${tabel}.test.ts`;
}

/** De tabellen uit de uitvoer van de guard (leeg als alles gedekt is). */
export function tabellenUitGuard(uitvoer) {
  const tabellen = [];
  for (const regel of String(uitvoer ?? "").split("\n")) {
    const m = /^\s*- ([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(regel);
    if (m && !tabellen.includes(m[1].toLowerCase())) tabellen.push(m[1].toLowerCase());
  }
  return tabellen;
}

/** De guard draaien en zijn uitvoer geven, ook als hij rood is (exit 1). */
function draaiGuard(map, node) {
  try {
    return String(node.draai(map, GUARD) ?? "");
  } catch (fout) {
    const uit = `${fout?.stdout ?? ""}\n${fout?.stderr ?? ""}`;
    if (tabellenUitGuard(uit).length > 0) return uit;
    throw fout;
  }
}

/**
 * Na de template: welke tabellen hebben nog geen A/B-test? Geeft null als er niets te doen is
 * (geen guard, geen node, alles gedekt), anders `{ tabellen, paden: {tabel: pad}, hulp }`.
 */
export function nodig({ map, node }) {
  if (!node || !existsSync(join(map, GUARD))) return null;
  let uitvoer;
  try {
    uitvoer = draaiGuard(map, node);
  } catch {
    return null;
  }
  const tabellen = tabellenUitGuard(uitvoer).filter((t) => !existsSync(join(map, testPad(t))));
  if (tabellen.length === 0) return null;
  // stack.config.json zoals hij nu is: in de tweede aanroep mag er alleen een regel in
  // open_tabellen bij voor een van deze tabellen (zie openNaAntwoord).
  const config = existsSync(join(map, STACK_CONFIG)) ? readFileSync(join(map, STACK_CONFIG), "utf8") : null;
  return { tabellen, paden: Object.fromEntries(tabellen.map((t) => [t, testPad(t)])), hulp: HULP, config };
}

/**
 * Na Claude: de tabellen die met het antwoord van de bouwer in `open_tabellen` kwamen. Alleen een
 * nieuwe regel voor een tabel uit `abTests.tabellen`, met een echte reden; verder mag er in
 * stack.config.json niets veranderen (bestaande redenen van `magReden` uitgezonderd, tier 2).
 * Geeft `{ open: [{tabel, reden}] }` of `{ fout }`.
 */
export function openNaAntwoord({ map, abTests, magReden = [] }) {
  if (!abTests || !existsSync(join(map, STACK_CONFIG))) return { open: [] };
  let voor;
  let na;
  try {
    voor = JSON.parse(abTests.config ?? "{}");
    na = JSON.parse(readFileSync(join(map, STACK_CONFIG), "utf8"));
  } catch {
    return { fout: `${STACK_CONFIG} is geen geldige JSON meer` };
  }
  const { open_tabellen: oud = {}, ...oudRest } = voor ?? {};
  const { open_tabellen: nieuw = {}, ...nieuwRest } = na ?? {};
  const regel = `in ${STACK_CONFIG} mag updaten alleen een tabel uit de A/B-tests in open_tabellen zetten, met het antwoord van de bouwer als reden`;
  if (JSON.stringify(oudRest) !== JSON.stringify(nieuwRest)) return { fout: regel };
  for (const [tabel, reden] of Object.entries(oud)) {
    if (!(tabel in nieuw)) return { fout: `${regel} (${tabel} is weg)` };
    if (nieuw[tabel] !== reden && !magReden.includes(tabel)) return { fout: `${regel} (${tabel})` };
  }
  const open = [];
  for (const [tabel, reden] of Object.entries(nieuw)) {
    if (tabel in oud) continue;
    if (!abTests.tabellen.includes(tabel)) return { fout: `${regel} (${tabel})` };
    if (typeof reden !== "string" || !reden.trim() || NOG_NALOPEN.test(reden)) {
      return { fout: `${regel}: geef bij ${tabel} het antwoord van de bouwer` };
    }
    open.push({ tabel, reden: reden.trim() });
  }
  return { open };
}

/**
 * Na het schrijven door Claude: welke tests staan er, welke tabellen staan met het antwoord van de
 * bouwer in open_tabellen (`open`, uit openNaAntwoord), en welke hebben nog niets? `abTests` is
 * de uitkomst van `nodig` uit de eerste aanroep. Geeft
 * `{ geschreven: [{tabel, pad}], open: [{tabel, reden}], zonder: [tabel], paden: [pad] }`;
 * `paden` mogen wijzigen.
 */
export function controleer({ map, node, abTests, open = [] }) {
  if (!abTests) return { geschreven: [], open: [], zonder: [], paden: [] };
  const isOpen = (t) => open.some((o) => o.tabel === t);
  const paden = [...Object.values(abTests.paden).filter((p) => existsSync(join(map, p))), ...(open.length > 0 ? [STACK_CONFIG] : [])];
  let nog = abTests.tabellen;
  try {
    const lijst = tabellenUitGuard(draaiGuard(map, node));
    nog = abTests.tabellen.filter((t) => lijst.includes(t));
  } catch {
    // De guard draait niet meer: tel dan alleen de bestanden.
    nog = abTests.tabellen.filter((t) => !existsSync(join(map, abTests.paden[t])));
  }
  const geschreven = abTests.tabellen
    .filter((t) => !nog.includes(t) && !isOpen(t))
    .map((tabel) => ({ tabel, pad: abTests.paden[tabel] }));
  return { geschreven, open, zonder: nog.filter((t) => !isOpen(t)), paden };
}

/**
 * De kopjes in de pull request, als regels (leeg als er niets was). Elk kopje alleen als er iets
 * onder staat: "door updaten geschreven" alleen bij tests die er echt bij kwamen.
 */
export function prRegels(ab) {
  if (!ab) return [];
  const geschreven = ab.geschreven ?? [];
  const open = ab.open ?? [];
  const zonder = ab.zonder ?? [];
  const regels = [];
  if (geschreven.length > 0) {
    regels.push(
      "",
      `**${KOPJE}** (door updaten geschreven; jij hoeft hier niets voor te doen)`,
      "",
      "Elke tabel hoort een test te hebben die nagaat dat gebruiker B de rij van gebruiker A niet ziet, wijzigt of verwijdert. Nu is een tabel zonder zo'n test nog een waarschuwing; in een volgende versie is hij rood. Zo staan deze tabellen dan al goed:",
      ...geschreven.map((g) => `- \`${g.tabel}\`: \`${g.pad}\``),
      "",
      "Is de kwaliteitspoort rood op een van deze tests, dan komt B toch bij de rij van A, of klopt de test niet. Vraag Claude in /stagetwo-tier2:verder-werken welke van de twee het is: een lek maak je eerst dicht, een verkeerde test past Claude aan.",
    );
  }
  if (open.length > 0) {
    regels.push(
      "",
      "**Tabellen die iedereen in de app mag zien** (jouw antwoord, door updaten in `open_tabellen` in `stack.config.json` gezet)",
      "",
      "Een A/B-test hoort hier niet bij: iedereen die in de app is, mag alle rijen zien. Klopt dat niet, haal de regel dan weg in /stagetwo-tier2:verder-werken; Claude schrijft dan de test.",
      ...open.map((o) => `- \`${o.tabel}\`: ${o.reden}`),
    );
  }
  if (zonder.length > 0) {
    regels.push(
      "",
      "**Tabellen nog zonder A/B-test**",
      "",
      `${zonder.map((t) => `\`${t}\``).join(", ")}: hier staat nog geen test die nagaat dat gebruiker B de rij van gebruiker A niet ziet, en ook geen reden in \`open_tabellen\`. Dat blokkeert nu niets (een waarschuwing); in een volgende versie is het rood. /stagetwo-tier2:verder-werken schrijft die test met je mee als je aan deze app werkt.`,
    );
  }
  return regels;
}
