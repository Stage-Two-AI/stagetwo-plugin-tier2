import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { controleer, GUARD, KOPJE, nodig, prRegels, tabellenUitGuard, testPad } from "./abtests.mjs";
import { nodeVoorKern } from "./repo.mjs";
import { opruimen, tijdelijkeMap } from "./test-hulp.mjs";

const WAARSCHUWING = `! 2 tabel(len) zonder A/B-test: klanten, orders
  Nu nog een waarschuwing; vanaf de volgende uitgave van Stage Two is dit rood.
  - klanten
  - orders

  Zet per tabel een A/B-test in tests/rls/ (de hulp staat in tests/rls/lib/afscherming.ts):

  it("<tabel>: B ziet de rij van A niet", async () => {
`;

/**
 * Een nagebootste guard van de template: elke tabel uit tabellen.txt zonder testbestand komt in
 * de lijst. Met ROOD=1 als fout (exit 1, op stderr), zoals de guard in een volgende uitgave.
 */
const NEP_GUARD = `import { existsSync, readFileSync } from "node:fs";
const tabellen = readFileSync("tabellen.txt", "utf8").split("\\n").filter(Boolean);
const zonder = tabellen.filter((t) => !existsSync(\`tests/rls/afscherming/\${t}.test.ts\`));
if (zonder.length === 0) { console.log("✓ alles gedekt"); process.exit(0); }
const regels = zonder.map((t) => \`  - \${t}\`).join("\\n");
if (existsSync("ROOD")) { console.error(\`\\n✗ Tabellen zonder A/B-test:\\n\\n\${regels}\\n\`); process.exit(1); }
console.log(\`! \${zonder.length} tabel(len) zonder A/B-test: \${zonder.join(", ")}\\n\${regels}\`);
`;

function app(tabellen, { rood = false } = {}) {
  const map = tijdelijkeMap("abtests-");
  mkdirSync(join(map, dirname(GUARD)), { recursive: true });
  writeFileSync(join(map, GUARD), NEP_GUARD);
  writeFileSync(join(map, "tabellen.txt"), `${tabellen.join("\n")}\n`);
  if (rood) writeFileSync(join(map, "ROOD"), "");
  return map;
}

function schrijfTest(map, tabel) {
  mkdirSync(join(map, dirname(testPad(tabel))), { recursive: true });
  writeFileSync(join(map, testPad(tabel)), `await controleerAfscherming({ tabel: "${tabel}" });\n`);
}

test("de tabellen uit de uitvoer van de guard: alleen de regels '- <tabel>'", () => {
  assert.deepEqual(tabellenUitGuard(WAARSCHUWING), ["klanten", "orders"]);
  assert.deepEqual(tabellenUitGuard("✓ 3 tabel(len): elk een A/B-test"), []);
  assert.deepEqual(tabellenUitGuard("  - Deze policies (policy x)\n  - <tabel>"), [], "geen andere opsommingen");
});

test("nodig: per tabel zonder test een pad naast de RLS-tests; zonder guard of node niets", () => {
  const map = app(["klanten", "orders"]);
  try {
    const r = nodig({ map, node: nodeVoorKern() });
    assert.deepEqual(r.tabellen, ["klanten", "orders"]);
    assert.equal(r.paden.klanten, "tests/rls/afscherming/klanten.test.ts");
    assert.equal(r.hulp, "tests/rls/lib/afscherming.ts");
    assert.equal(nodig({ map, node: null }), null);
    schrijfTest(map, "klanten");
    schrijfTest(map, "orders");
    assert.equal(nodig({ map, node: nodeVoorKern() }), null, "alles gedekt");
  } finally {
    opruimen(map);
  }
});

test("nodig: ook als de guard rood is (een volgende uitgave), en zonder guard niets", () => {
  const map = app(["klanten"], { rood: true });
  try {
    assert.deepEqual(nodig({ map, node: nodeVoorKern() }).tabellen, ["klanten"]);
    assert.equal(nodig({ map: tijdelijkeMap("leeg-"), node: nodeVoorKern() }), null);
  } finally {
    opruimen(map);
  }
});

test("controleer: wat Claude schreef telt mee, wat ontbreekt staat apart; alleen de voorspelde paden", () => {
  const map = app(["klanten", "orders"]);
  try {
    const ab = nodig({ map, node: nodeVoorKern() });
    schrijfTest(map, "klanten");
    const r = controleer({ map, node: nodeVoorKern(), abTests: ab });
    assert.deepEqual(r.geschreven, [{ tabel: "klanten", pad: "tests/rls/afscherming/klanten.test.ts" }]);
    assert.deepEqual(r.zonder, ["orders"]);
    assert.deepEqual(r.paden, ["tests/rls/afscherming/klanten.test.ts"]);
    assert.deepEqual(controleer({ map, node: nodeVoorKern(), abTests: null }), { geschreven: [], zonder: [], paden: [] });
  } finally {
    opruimen(map);
  }
});

test("het kopje in de pull request: eigen kopje, geen actie voor de bouwer, wat nog ontbreekt", () => {
  const tekst = prRegels({ geschreven: [{ tabel: "klanten", pad: testPad("klanten") }], zonder: ["orders"] }).join("\n");
  assert.match(tekst, new RegExp(`\\*\\*${KOPJE}\\*\\*`));
  assert.match(tekst, /jij hoeft hier niets voor te doen/);
  assert.match(tekst, /- `klanten`: `tests\/rls\/afscherming\/klanten\.test\.ts`/);
  assert.match(tekst, /Nog zonder test: `orders`\. Dat blokkeert nu niets; \/stagetwo-tier2:verder-werken schrijft die test met je mee/);
  assert.doesNotMatch(tekst, /Stage Two/);
  assert.doesNotMatch(tekst, /—/);
  assert.deepEqual(prRegels({ geschreven: [], zonder: [] }), []);
  assert.deepEqual(prRegels(null), []);
});
