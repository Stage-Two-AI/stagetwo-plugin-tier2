import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  GLOBAL_SETUP,
  controleerOpenTabellen,
  controleerTestrol,
  controleerSmal,
  leesNooit,
  openVoorIedereen,
  smalMigratiePad,
  smalRegels,
  prRegelsProject,
  ONDERDELEN_PAD,
  OPEN_TABELLEN_SCRIPT,
  STACK_CONFIG,
  naamUitPad,
  onderdelenBestand,
  onderdelenVoorstel,
  projectbestanden,
  routesVanTemplate,
  ONDERDELEN_SCRIPT,
  zetKoppen,
} from "./projectbestanden.mjs";
import { alleBestanden, appBestanden, nepGit, nepPnpm, opruimen, schrijfBestanden, templateBestanden, tijdelijkeMap } from "./test-hulp.mjs";
import { pasToe } from "./toepassen.mjs";

const ROUTER = `import { Route, Routes } from "react-router-dom";
export function App() {
  return (
    <Routes>
      <Route path="/" element={<Start />} />
      <Route path="/klanten" element={<Klanten />} />
      <Route path="/klanten/:id" element={<Klant />} />
      <Route path="/nieuwe-order" element={<Order />} />
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<NietGevonden />} />
    </Routes>
  );
}
`;

/** Een nep van scripts/open-tabellen-opnemen.mjs: schrijft open_tabellen en print zoals het echte script. */
const NEP_SCRIPT = `import { readFileSync, writeFileSync } from "node:fs";
const c = JSON.parse(readFileSync("stack.config.json", "utf8"));
c.open_tabellen = { ...(c.open_tabellen ?? {}), feestdagen: "bestond al vóór versie 39, nog nalopen" };
writeFileSync("stack.config.json", JSON.stringify(c, null, 2) + "\\n");
console.log("✓ 1 tabel(len) opgenomen in open_tabellen:\\n  - feestdagen");
console.log("");
console.log("! Deze policies staan open voor iedereen met de openbare sleutel en blijven rood:");
console.log('  - public.prijzen (policy "iedereen", anon)');
`;

const echteNode = {
  draai(map, script) {
    return execFileSync(process.execPath, [script], { cwd: map, encoding: "utf8" });
  },
};


/**
 * Een nep van scripts/lib/onderdelen.mjs uit de template: de zoekregel zelf staat daar (en wordt
 * daar getest); hier telt alleen dat de plugin zijn uitkomst gebruikt.
 */
const NEP_ONDERDELEN = `process.stdout.write(JSON.stringify(["/", "/klanten", "/login", "/nieuwe-order"]) + "\\n");\n`;

test("routesVanTemplate: de hoofdpaden uit scripts/lib/onderdelen.mjs van de template, of null", () => {
  const map = tijdelijkeMap("pb-routes-");
  try {
    assert.equal(routesVanTemplate(map, echteNode), null, "zonder script");
    schrijfBestanden(map, { [ONDERDELEN_SCRIPT]: NEP_ONDERDELEN });
    assert.deepEqual(routesVanTemplate(map, echteNode), ["/", "/klanten", "/login", "/nieuwe-order"]);
    assert.equal(routesVanTemplate(map, null), null, "zonder node");
    schrijfBestanden(map, { [ONDERDELEN_SCRIPT]: 'console.log(JSON.stringify({ paden: ["/"] }));\n' });
    assert.equal(routesVanTemplate(map, echteNode), null, "geen lijst");
    schrijfBestanden(map, { [ONDERDELEN_SCRIPT]: "process.exit(1);\n" });
    assert.equal(routesVanTemplate(map, echteNode), null, "script faalt");
  } finally {
    opruimen(map);
  }
});

test("zonder zoekregel van de template: alleen / en een regel voor de bouwer, geen wachten", () => {
  const map = tijdelijkeMap("pb-zonder-");
  try {
    const r = projectbestanden({ map, van: 38, naar: 40, node: echteNode });
    assert.equal(r.reden, null);
    assert.deepEqual(r.onderdelen.onderdelen, [{ pad: "/", naam: "Start" }]);
    assert.equal(r.voorDeBouwer.length, 1);
    assert.match(r.voorDeBouwer[0], /verder-werken/);
    assert.doesNotMatch(r.voorDeBouwer[0], /Stage Two/);
  } finally {
    opruimen(map);
  }
});

test("de API is nooit een onderdeel", () => {
  assert.deepEqual(onderdelenVoorstel(["/", "/api", "/plugin"]).geen, ["/api"]);
});

test("het voorstel: inloggen is geen onderdeel, zonder routes alleen /", () => {
  assert.equal(naamUitPad("/"), "Start");
  assert.equal(naamUitPad("/nieuwe-order"), "Nieuwe order");
  assert.deepEqual(onderdelenVoorstel(["/", "/klanten", "/login"]), {
    onderdelen: [
      { pad: "/", naam: "Start" },
      { pad: "/klanten", naam: "Klanten" },
    ],
    geen: ["/login"],
  });
  assert.deepEqual(onderdelenVoorstel([]), { onderdelen: [{ pad: "/", naam: "Start" }], geen: [] });
  assert.deepEqual(onderdelenVoorstel(["/login"]).onderdelen, [{ pad: "/", naam: "Start" }]);
});

test("onderdelenBestand heeft de vorm die de template verwacht, met een kop alleen als die anders is", () => {
  const inhoud = onderdelenBestand(
    { onderdelen: [{ pad: "/", naam: "Start" }, { pad: "/klanten", naam: "Klanten" }], geen: ["/login"] },
    { "/": "Mijn lijst", "/klanten": "Klanten" },
  );
  assert.match(inhoud, /export type Onderdeel = \{ pad: string; naam: string; kop\?: string \};/);
  assert.match(inhoud, /\{ pad: "\/", naam: "Start", kop: "Mijn lijst" \},/);
  assert.match(inhoud, /\{ pad: "\/klanten", naam: "Klanten" \},/);
  assert.match(inhoud, /export const GEEN_ONDERDEEL: string\[\] = \["\/login"\];/);
  assert.ok(!inhoud.includes("—"), "geen em-dash");
});

test("versie 39: onderdelen.ts uit de routes, open_tabellen via het script, uitleg voor global-setup", () => {
  const map = tijdelijkeMap("pb-39-");
  try {
    schrijfBestanden(map, {
      "src/App.tsx": ROUTER, [ONDERDELEN_SCRIPT]: NEP_ONDERDELEN,
      [STACK_CONFIG]: `${JSON.stringify({ database: true }, null, 2)}\n`,
      [OPEN_TABELLEN_SCRIPT]: NEP_SCRIPT,
      [GLOBAL_SETUP]: "export default async function globalSetup() {}\n",
    });
    const r = projectbestanden({ map, van: 38, naar: 39, node: echteNode });
    assert.equal(r.reden, null);
    assert.deepEqual(r.paden, [ONDERDELEN_PAD, STACK_CONFIG]);
    assert.deepEqual(
      r.onderdelen.onderdelen.map((o) => o.pad),
      ["/", "/klanten", "/nieuwe-order"],
    );
    assert.deepEqual(r.onderdelen.geen, ["/login"]);
    assert.match(readFileSync(join(map, ONDERDELEN_PAD), "utf8"), /pad: "\/nieuwe-order", naam: "Nieuwe order"/);
    assert.equal(JSON.parse(readFileSync(join(map, STACK_CONFIG), "utf8")).open_tabellen.feestdagen, "bestond al vóór versie 39, nog nalopen");
    assert.deepEqual(r.voorDeBouwer, [], "niets meer voor de bouwer: Claude doet het in de werkkopie");
    assert.deepEqual(r.openTabellen.tabellen, ["feestdagen"]);
    assert.deepEqual(r.openTabellen.nooit, ['public.prijzen (policy "iedereen", anon)']);
    assert.equal(r.testrol.pad, GLOBAL_SETUP);
  } finally {
    opruimen(map);
  }
});

test("versie 39: een bestaand onderdelen.ts en een global-setup met testrol blijven ongemoeid", () => {
  const map = tijdelijkeMap("pb-bestaat-");
  try {
    const eigen = 'export const ONDERDELEN = [{ pad: "/", naam: "Eigen" }];\n';
    schrijfBestanden(map, {
      [ONDERDELEN_PAD]: eigen,
      [GLOBAL_SETUP]: 'const bestand = "supabase/testrol.sql";\n',
    });
    const r = projectbestanden({ map, van: 38, naar: 40, node: echteNode });
    assert.deepEqual(r.paden, []);
    assert.deepEqual(r.voorDeBouwer, []);
    assert.equal(r.onderdelen, null);
    assert.equal(readFileSync(join(map, ONDERDELEN_PAD), "utf8"), eigen);
  } finally {
    opruimen(map);
  }
});

test("alleen bij de overgang naar 39: daarvoor en daarna niets", () => {
  const map = tijdelijkeMap("pb-niet-");
  try {
    schrijfBestanden(map, { "src/App.tsx": ROUTER, [ONDERDELEN_SCRIPT]: NEP_ONDERDELEN, [STACK_CONFIG]: "{}\n", [OPEN_TABELLEN_SCRIPT]: NEP_SCRIPT });
    const voor = alleBestanden(map);
    for (const [van, naar] of [[37, 38], [39, 40]]) {
      const r = projectbestanden({ map, van, naar, node: echteNode });
      assert.deepEqual(r, { bijgewerkt: [], paden: [], voorDeBouwer: [], onderdelen: null, openTabellen: null, testrol: null, reden: null }, `${van} naar ${naar}`);
    }
    assert.deepEqual(alleBestanden(map), voor);
  } finally {
    opruimen(map);
  }
});

test("een fout in open-tabellen-opnemen wordt een reden om te stoppen", () => {
  const map = tijdelijkeMap("pb-fout-");
  try {
    schrijfBestanden(map, { [ONDERDELEN_PAD]: "x\n", [STACK_CONFIG]: "{}\n", [OPEN_TABELLEN_SCRIPT]: "throw new Error('kapot');\n" });
    const r = projectbestanden({ map, van: 38, naar: 39, node: echteNode });
    assert.match(r.reden, /open-tabellen-opnemen\.mjs gaf een fout/);
  } finally {
    opruimen(map);
  }
});

test("zetKoppen: alleen voor een lijst die deze ronde is neergezet, en alleen bekende paden", () => {
  const map = tijdelijkeMap("pb-kop-");
  try {
    const voorstel = { onderdelen: [{ pad: "/", naam: "Start" }, { pad: "/klanten", naam: "Klanten" }], geen: [] };
    schrijfBestanden(map, { [ONDERDELEN_PAD]: onderdelenBestand(voorstel) });
    assert.equal(zetKoppen(map, voorstel, {}), null, "zonder koppen niets te doen");
    assert.match(zetKoppen(map, null, { "/": "Hoi" }), /niet neergezet/);
    assert.match(zetKoppen(map, voorstel, { "/raar": "Hoi" }), /--kop \/raar/);
    assert.match(zetKoppen(map, voorstel, { "/": " " }), /geef de kop/);
    assert.equal(zetKoppen(map, voorstel, { "/": "Mijn lijst" }), null);
    assert.match(readFileSync(join(map, ONDERDELEN_PAD), "utf8"), /\{ pad: "\/", naam: "Start", kop: "Mijn lijst" \}/);
  } finally {
    opruimen(map);
  }
});

test("pasToe van 38 naar 39: de projectbestanden mogen wijzigen en staan in het resultaat", () => {
  const wortel = tijdelijkeMap("pb-kern-");
  try {
    const app = join(wortel, "app");
    const tmpl38 = join(wortel, "t38");
    const tmpl39 = join(wortel, "t39");
    schrijfBestanden(tmpl38, { ...templateBestanden(8), ".claude/stack-version": "38\n" });
    schrijfBestanden(tmpl39, { ...templateBestanden(9), ".claude/stack-version": "39\n" });
    schrijfBestanden(app, { ...appBestanden(), ".claude/stack-version": "38\n", "src/App.tsx": ROUTER, [ONDERDELEN_SCRIPT]: NEP_ONDERDELEN });
    const r = pasToe({ map: app, tmplMap: tmpl39, git: nepGit({ map: app, opTag: { "stack-v38": tmpl38 } }), pnpm: nepPnpm.aanwezig, node: echteNode });
    assert.equal(r.status, "bijgewerkt", r.reden);
    assert.deepEqual(r.projectbestanden, [ONDERDELEN_PAD]);
    assert.ok(r.gewijzigd.includes(ONDERDELEN_PAD));
    assert.ok(r.bijgewerkt.some((b) => b.pad === ONDERDELEN_PAD && /eenmalig/.test(b.hoe)));
    assert.ok(existsSync(join(app, ONDERDELEN_PAD)));
    assert.deepEqual(r.voorDeBouwer, []);
  } finally {
    opruimen(wortel);
  }
});

test("open tabellen: Claude mag alleen de reden van de nieuwe tabellen invullen; de PR toont ze onder een eigen kopje", () => {
  const map = tijdelijkeMap("pb-open-");
  try {
    const config = { database: true, open_tabellen: { items: "voorbeeld", feestdagen: "bestond al vóór versie 39, nog nalopen", kalender: "bestond al vóór versie 39, nog nalopen" } };
    const tekst = `${JSON.stringify(config, null, 2)}\n`;
    const open = { tabellen: ["feestdagen", "kalender"], nooit: [], config: tekst };
    schrijfBestanden(map, { [STACK_CONFIG]: tekst.replace("nog nalopen\",\n    \"kalender", "x\",\n    \"kalender").replace('"feestdagen": "bestond al vóór versie 39, x"', '"feestdagen": "kalender voor iedereen binnen, geen persoonsgegevens"') });
    const r = controleerOpenTabellen(map, open);
    assert.equal(r.fout, undefined);
    assert.deepEqual(r.redenen, [{ tabel: "feestdagen", reden: "kalender voor iedereen binnen, geen persoonsgegevens" }]);
    assert.deepEqual(r.zonder, ["kalender"]);
    const pr = prRegelsProject({ open: r }).join("\n");
    assert.match(pr, /\*\*Open tabellen en waarom\*\*/);
    assert.match(pr, /- `feestdagen`: kalender voor iedereen binnen, geen persoonsgegevens/);
    assert.match(pr, /- `kalender`: nog zonder reden .*dat blokkeert niets/);
    assert.doesNotMatch(pr, /Stage Two/);
    assert.doesNotMatch(pr, /Zet per tabel/);
    schrijfBestanden(map, { [STACK_CONFIG]: JSON.stringify({ ...config, open_tabellen: { ...config.open_tabellen, items: "anders" } }) });
    assert.match(controleerOpenTabellen(map, open).fout, /alleen de reden/);
    schrijfBestanden(map, { [STACK_CONFIG]: JSON.stringify({ ...config, database: false }) });
    assert.match(controleerOpenTabellen(map, open).fout, /alleen de reden/);
    schrijfBestanden(map, { [STACK_CONFIG]: JSON.stringify({ ...config, open_tabellen: { ...config.open_tabellen, nieuw: "x" } }) });
    assert.match(controleerOpenTabellen(map, open).fout, /alleen de reden/);
  } finally {
    opruimen(map);
  }
});

test("testrol: Claude past global-setup aan; zonder aanpassing zegt de PR wat er dan niet werkt", () => {
  const map = tijdelijkeMap("pb-rol-");
  try {
    const voor = "export default async function globalSetup() {}\n";
    schrijfBestanden(map, { [GLOBAL_SETUP]: voor });
    const testrol = { pad: GLOBAL_SETUP, voor };
    assert.deepEqual(controleerTestrol(map, testrol), { pad: GLOBAL_SETUP, gedaan: false });
    const niet = prRegelsProject({ testrol: { pad: GLOBAL_SETUP, gedaan: false } }).join("\n");
    assert.match(niet, /lege schermen/);
    assert.doesNotMatch(niet, /Stage Two/);
    schrijfBestanden(map, { [GLOBAL_SETUP]: 'export default async function globalSetup() {\n  geefTestrol();\n}\nfunction geefTestrol() { const b = "supabase/testrol.sql"; }\n' });
    assert.deepEqual(controleerTestrol(map, testrol), { pad: GLOBAL_SETUP, gedaan: true });
    assert.match(prRegelsProject({ testrol: { pad: GLOBAL_SETUP, gedaan: true } }).join("\n"), /door updaten toegevoegd/);
    assert.equal(controleerTestrol(map, null), null);
  } finally {
    opruimen(map);
  }
});

test("open voor iedereen: Claude stelt een smallere regel voor; zonder voorstel een waarschuwing, nooit wachten op Stage Two", () => {
  assert.deepEqual(leesNooit('public.prijzen (policy "iedereen", anon, for select)'), { tabel: "prijzen", opdracht: "select" });
  assert.deepEqual(leesNooit('prijzen (policy "iedereen", anon)'), { tabel: "prijzen", opdracht: "all" });
  assert.deepEqual(openVoorIedereen(['prijzen (policy "a", anon, for select)', 'prijzen (policy "b", public, for all)', 'orders (policy "c", anon, for insert)']), [
    "De tabel `prijzen` is nu leesbaar en aan te passen voor iedereen op internet, ook zonder in te loggen.",
    "De tabel `orders` is nu aan te passen voor iedereen op internet, ook zonder in te loggen.",
  ]);
  assert.match(smalMigratiePad(new Date("2026-11-06T10:20:30Z")), /^supabase\/migrations\/20261106102030_open_regels_smaller\.sql$/);
  const map = tijdelijkeMap("pb-smal-");
  try {
    const open = { tabellen: [], nooit: ['prijzen (policy "iedereen", anon, for select)'], config: "{}", migratie: smalMigratiePad() };
    const zonder = controleerSmal(map, open);
    assert.equal(zonder.gedaan, false);
    const waarschuwing = smalRegels(open.nooit, zonder).join("\n");
    assert.match(waarschuwing, /De tabel `prijzen` is nu leesbaar voor iedereen op internet/);
    assert.match(waarschuwing, /Draai \/stagetwo-tier2:updaten opnieuw/);
    schrijfBestanden(map, {
      [open.migratie]: '-- uitleg: alleen wie is ingelogd ziet de prijzen\ndrop policy "iedereen" on public.prijzen;\ncreate policy "binnen" on public.prijzen for select to authenticated using (true);\n',
    });
    const met = controleerSmal(map, open);
    assert.deepEqual(met, { pad: open.migratie, gedaan: true, uitleg: ["alleen wie is ingelogd ziet de prijzen"] });
    const voorstel = smalRegels(open.nooit, met).join("\n");
    assert.match(voorstel, /De tabel `prijzen` was leesbaar voor iedereen op internet, ook zonder in te loggen\. Deze pull request maakt dat smaller:/);
    assert.match(voorstel, /- alleen wie is ingelogd ziet de prijzen/);
    assert.match(voorstel, /dan merge je/);
    for (const t of [waarschuwing, voorstel]) {
      assert.doesNotMatch(t, /Stage Two|Nog niet mergen|—/);
    }
  } finally {
    opruimen(map);
  }
});
