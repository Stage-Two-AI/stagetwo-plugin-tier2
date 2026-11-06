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
 * - de tweede aanroep laat alleen die nieuwe bestanden toe naast de template, draait de guard
 *   opnieuw en zegt welke tabellen nu een test hebben en welke nog niet (`controleer`).
 *
 * De lijst komt uit de guard zelf, zodat plugin en template nooit verschillend tellen. De guard
 * schrijft de tabellen als regels `  - <tabel>`, als waarschuwing (exit 0) en als fout (exit 1).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

export const GUARD = "scripts/guard-rls-tests.mjs";
export const HULP = "tests/rls/lib/afscherming.ts";
export const KOPJE = "A/B-tests voor tabellen die er nog geen hadden";

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
  return { tabellen, paden: Object.fromEntries(tabellen.map((t) => [t, testPad(t)])), hulp: HULP };
}

/**
 * Na het schrijven door Claude: welke tests staan er, en welke tabellen hebben nog geen test?
 * `abTests` is de uitkomst van `nodig` uit de eerste aanroep. Geeft
 * `{ geschreven: [{tabel, pad}], zonder: [tabel], paden: [pad] }`; `paden` mogen wijzigen.
 */
export function controleer({ map, node, abTests }) {
  if (!abTests) return { geschreven: [], zonder: [], paden: [] };
  const paden = Object.values(abTests.paden).filter((p) => existsSync(join(map, p)));
  let nog = abTests.tabellen;
  try {
    const lijst = tabellenUitGuard(draaiGuard(map, node));
    nog = abTests.tabellen.filter((t) => lijst.includes(t));
  } catch {
    // De guard draait niet meer: tel dan alleen de bestanden.
    nog = abTests.tabellen.filter((t) => !existsSync(join(map, abTests.paden[t])));
  }
  const geschreven = abTests.tabellen.filter((t) => !nog.includes(t)).map((tabel) => ({ tabel, pad: abTests.paden[tabel] }));
  return { geschreven, zonder: nog, paden };
}

/** Het kopje in de pull request, als regels (leeg als er niets was). */
export function prRegels(ab) {
  if (!ab || (ab.geschreven.length === 0 && ab.zonder.length === 0)) return [];
  const regels = [
    "",
    `**${KOPJE}** (door updaten geschreven; jij hoeft hier niets voor te doen)`,
    "",
    "Elke tabel hoort een test te hebben die nagaat dat gebruiker B de rij van gebruiker A niet ziet, wijzigt of verwijdert. Nu is een tabel zonder zo'n test nog een waarschuwing; in een volgende versie is hij rood. Zo staan deze tabellen dan al goed:",
    ...ab.geschreven.map((g) => `- \`${g.tabel}\`: \`${g.pad}\``),
  ];
  if (ab.zonder.length > 0) {
    regels.push(`- Nog zonder test: ${ab.zonder.map((t) => `\`${t}\``).join(", ")}. Stage Two kijkt daarnaar vóór de versie die dit rood maakt (een tabel die iedereen binnen helemaal mag zien, hoort met een reden in \`open_tabellen\`); jij hoeft niets te doen, en de volgende keer /stagetwo-tier2:updaten probeert het opnieuw.`);
  }
  regels.push(
    "",
    "Is de kwaliteitspoort rood op een van deze tests, dan komt B toch bij de rij van A, of klopt de test niet. Merge dan niet en neem contact op met Stage Two.",
  );
  return regels;
}
