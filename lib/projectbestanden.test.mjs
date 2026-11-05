import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  GLOBAL_SETUP,
  ONDERDELEN_PAD,
  OPEN_TABELLEN_SCRIPT,
  STACK_CONFIG,
  naamUitPad,
  onderdelenBestand,
  onderdelenVoorstel,
  projectbestanden,
  routesUitSrc,
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

test("routesUitSrc leest de hoofdpaden zoals tests/unit/onderdelen.test.ts", () => {
  const map = tijdelijkeMap("pb-routes-");
  try {
    schrijfBestanden(map, {
      "src/App.tsx": ROUTER,
      "src/menu.ts": `export const menu = [{ path: "/rapporten/maand" }];\n`,
      "src/App.test.tsx": `const x = { path: "/alleen-in-test" };\n`,
    });
    assert.deepEqual(routesUitSrc(map), ["/", "/klanten", "/login", "/nieuwe-order", "/rapporten"]);
    assert.deepEqual(routesUitSrc(tijdelijkeMap("pb-leeg-")), []);
  } finally {
    opruimen(map);
  }
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
      "src/App.tsx": ROUTER,
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
    const uitleg = r.voorDeBouwer.join("\n");
    assert.match(uitleg, /src\/onderdelen\.ts` is nieuw en van jou/);
    assert.match(uitleg, /open_tabellen/);
    assert.match(uitleg, /public\.prijzen \(policy "iedereen", anon\)/);
    assert.match(uitleg, /e2e\/global-setup\.ts` is van jou/);
    assert.match(uitleg, /geefTestrol/);
    assert.ok(!uitleg.includes("—"), "geen em-dash");
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
    schrijfBestanden(map, { "src/App.tsx": ROUTER, [STACK_CONFIG]: "{}\n", [OPEN_TABELLEN_SCRIPT]: NEP_SCRIPT });
    const voor = alleBestanden(map);
    for (const [van, naar] of [[37, 38], [39, 40]]) {
      const r = projectbestanden({ map, van, naar, node: echteNode });
      assert.deepEqual(r, { bijgewerkt: [], paden: [], voorDeBouwer: [], onderdelen: null, reden: null }, `${van} naar ${naar}`);
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
    schrijfBestanden(app, { ...appBestanden(), ".claude/stack-version": "38\n", "src/App.tsx": ROUTER });
    const r = pasToe({ map: app, tmplMap: tmpl39, git: nepGit({ map: app, opTag: { "stack-v38": tmpl38 } }), pnpm: nepPnpm.aanwezig, node: echteNode });
    assert.equal(r.status, "bijgewerkt", r.reden);
    assert.deepEqual(r.projectbestanden, [ONDERDELEN_PAD]);
    assert.ok(r.gewijzigd.includes(ONDERDELEN_PAD));
    assert.ok(r.bijgewerkt.some((b) => b.pad === ONDERDELEN_PAD && /eenmalig/.test(b.hoe)));
    assert.ok(existsSync(join(app, ONDERDELEN_PAD)));
    assert.equal(r.voorDeBouwer.length, 1);
  } finally {
    opruimen(wortel);
  }
});
