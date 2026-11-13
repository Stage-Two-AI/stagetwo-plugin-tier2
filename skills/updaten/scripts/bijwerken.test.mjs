import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { OPENBAAR, alleBestanden, git, insteadOfEnv, maakKlantRepo, maakTemplateRepo, nepGh, nepPnpm_opPad, openbareAppBestanden, opruimen, tijdelijkeMap } from "../../../lib/test-hulp.mjs";
import { NIET_IN_LEVERING } from "../../../lib/levering.mjs";
import { BEVESTIGING, WERKMAP_PREFIX, biomeVersie, controleerWerkmap, formatteer, hoofd, leesArgumenten, zonderLogin } from "./bijwerken.mjs";

const SCRIPT = fileURLToPath(import.meta.url).replace(/\.test\.mjs$/, ".mjs");

const GH_STANDAARD = {
  "--version": { stdout: "gh version 2.95.0\n" },
  "auth status": { stdout: "Logged in\n" },
  "pr list": { stdout: [] },
  "pr create": { stdout: "Creating pull request\nhttps://github.com/klant/app/pull/1\n" },
  "pr edit": { stdout: "" },
  "pr close": { stdout: "" },
};

/**
 * Eén wereld per test: template-repo met tags, klantrepo met kale origin en checkout,
 * nep-gh op het PATH, en een eigen TMPDIR zodat we kunnen zien wat er gekloond is.
 */
function wereld({ gh = GH_STANDAARD, tagV9 = true, app } = {}) {
  const wortel = tijdelijkeMap("bijwerken-wereld-");
  const tmp = join(wortel, "tmp");
  mkdirSync(tmp);
  const template = maakTemplateRepo(wortel, { tagV9 });
  // De tweede template van tier 2 (sinds versie 43), met dezelfde versies maar een eigen manifest.
  const openbaar = maakTemplateRepo(wortel, { tagV9, extraManifest: OPENBAAR, naam: "template-openbaar-repo" });
  const githubUrl = "https://github.com/klant/app.git";
  const klant = maakKlantRepo(wortel, { githubUrl, ...(app ? { app } : {}) });
  const nep = nepGh(wortel, gh);
  nepPnpm_opPad(nep.pad);
  const env = {
    ...process.env,
    ...insteadOfEnv(githubUrl, klant.origin),
    PATH: `${nep.pad}:${process.env.PATH}`,
    TMPDIR: tmp,
    STACK_TEMPLATE_REPO: template,
  };
  const draai = (argv, extra = {}, opties = {}) => {
    const oud = { ...process.env };
    Object.assign(process.env, env, extra);
    try {
      return hoofd(argv, { cwd: klant.checkout, env: process.env, ...opties });
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in oud)) delete process.env[k];
      Object.assign(process.env, oud);
    }
  };
  const werkmappen = () => (existsSync(tmp) ? readdirSync(tmp).filter((n) => n.startsWith(WERKMAP_PREFIX)) : []);
  return { wortel, tmp, template, openbaar, klant, nep, env, draai, werkmappen, opruimen: () => opruimen(wortel) };
}

test("argumenten en het afplakken van een login in een URL", () => {
  assert.deepEqual(leesArgumenten(["--json", "--droogloop"]), { json: true, droogloop: true, werkmap: null, losOp: [], koppen: {}, checkout: null, repo: null, templateRef: null });
  assert.deepEqual(leesArgumenten(["--werkmap", "/t/x", "--kop", "/", "Mijn lijst", "--kop", "/klanten", "Alle klanten"]).koppen, {
    "/": "Mijn lijst",
    "/klanten": "Alle klanten",
  });
  assert.equal(leesArgumenten(["--droogloop", "--repo", "klant/voorraad"]).repo, "klant/voorraad");
  assert.equal(leesArgumenten(["--droogloop", "--template-ref", "uitgave/43"]).templateRef, "uitgave/43");
  assert.deepEqual(leesArgumenten(["--werkmap", "/t/x", "--los-op", "a.yml", "template", "--los-op", "b.yml", "eigen"]).losOp, [
    { pad: "a.yml", keuze: "template" },
    { pad: "b.yml", keuze: "eigen" },
  ]);
  assert.throws(() => leesArgumenten(["--raar"]), /onbekend argument/);
  assert.equal(zonderLogin("fatal: https://bart:ghp_x@github.com/k/a"), "fatal: https://***@github.com/k/a");
});

test("controleerWerkmap weigert alles wat niet uit een droogloop komt", () => {
  const tmp = tijdelijkeMap("cw-");
  try {
    assert.equal(controleerWerkmap(null, { tmp }).eigen, false);
    assert.match(controleerWerkmap(null, { tmp }).fout, /--werkmap/);
    assert.match(controleerWerkmap("/etc", { tmp }).fout, /tijdelijke map/);
    const goed = join(tmp, `${WERKMAP_PREFIX}abc`);
    mkdirSync(goed);
    const zonderToestand = controleerWerkmap(goed, { tmp });
    assert.match(zonderToestand.fout, /geen droogloop/);
    assert.equal(zonderToestand.eigen, false, "zonder toestand.json is de map niet bewezen van ons");
    writeFileSync(join(goed, "toestand.json"), "{}");
    assert.deepEqual(controleerWerkmap(goed, { tmp }), { fout: null, eigen: true });
    const verouderd = controleerWerkmap(goed, { tmp, nu: Date.now() + 2 * 3600 * 1000 });
    assert.match(verouderd.fout, /ouder dan een uur/);
    assert.equal(verouderd.eigen, true, "een verouderde map is wel van ons en mag opgeruimd worden");
    assert.match(controleerWerkmap(join(tmp, "andere-abc"), { tmp }).fout, /tijdelijke map/);
    // Dezelfde map via een andere naam (zoals /var en /private/var, of BART-W~1 op Windows).
    const omweg = join(tmp, "..", `omweg-${WERKMAP_PREFIX}`);
    symlinkSync(tmp, omweg);
    try {
      assert.deepEqual(controleerWerkmap(goed, { tmp: omweg }), { fout: null, eigen: true });
      assert.deepEqual(controleerWerkmap(join(omweg, `${WERKMAP_PREFIX}abc`), { tmp }), { fout: null, eigen: true });
    } finally {
      opruimen(omweg);
    }
  } finally {
    opruimen(tmp);
  }
});

test("voorcontrole: gh niet ingelogd, geen netwerk, geen manifest, geen schrijfrecht; niets gekloond", () => {
  const w = wereld({ gh: { ...GH_STANDAARD, "auth status": { exit: 1, stderr: "not logged in" } } });
  try {
    const r = w.draai(["--json", "--droogloop"]);
    assert.equal(r.status, "mislukt");
    assert.match(r.reden, /gh auth login/);
    assert.deepEqual(w.werkmappen(), []);
  } finally {
    w.opruimen();
  }

  const n = wereld();
  try {
    // Ook hier de nep-gh op het PATH: anders zegt een niet-ingelogde echte gh (CI) iets anders.
    const r = n.draai(["--droogloop"], { STACK_TEMPLATE_REPO: join(n.wortel, "bestaat-niet") });
    assert.equal(r.status, "mislukt");
    assert.match(r.reden, /niet bereikbaar/);
    assert.deepEqual(n.werkmappen(), []);
  } finally {
    n.opruimen();
  }

  const m = wereld();
  try {
    git(m.klant.checkout, "rm", "-q", ".claude/stack-version");
    const r = m.draai(["--droogloop"]);
    assert.equal(r.status, "geen-template");
    assert.deepEqual(m.werkmappen(), []);
  } finally {
    m.opruimen();
  }

  const v = wereld();
  try {
    // Een app uit de Vercel-template: geen variant in het manifest. Die is van de andere plugin.
    const pad = join(v.klant.checkout, ".claude", "stack-manifest.json");
    const { variant, ...vercel } = JSON.parse(readFileSync(pad, "utf8"));
    assert.equal(variant, "cloudflare");
    writeFileSync(pad, JSON.stringify(vercel));
    const r = v.draai(["--droogloop"]);
    assert.equal(r.status, "ander-spoor");
    assert.match(r.reden, /oudere template/);
    assert.deepEqual(v.werkmappen(), []);
  } finally {
    v.opruimen();
  }

  const l = wereld();
  try {
    // Een app van tier 1: variant "light". Die werk je bij met de plugin van tier 1.
    const pad = join(l.klant.checkout, ".claude", "stack-manifest.json");
    writeFileSync(pad, JSON.stringify({ ...JSON.parse(readFileSync(pad, "utf8")), variant: "light" }));
    const r = l.draai(["--droogloop"]);
    assert.equal(r.status, "ander-spoor");
    assert.match(r.reden, /\/stagetwo-tier1:updaten/);
    assert.deepEqual(l.werkmappen(), []);
  } finally {
    l.opruimen();
  }

  const s = wereld();
  try {
    git(s.klant.checkout, "remote", "set-url", "--push", "origin", join(s.wortel, "alleen-lezen.git"));
    const r = s.draai(["--droogloop"]);
    assert.equal(r.status, "mislukt");
    assert.match(r.reden, /schrijfrecht/);
    assert.deepEqual(s.werkmappen(), [], "na een mislukte voorcontrole is er geen tijdelijke map meer");
  } finally {
    s.opruimen();
  }
});

test("gh pr list faalt: mislukt met een reden over de pull requests, niets gekloond", () => {
  const w = wereld({ gh: { ...GH_STANDAARD, "pr list": { exit: 1, stderr: "boom" } } });
  try {
    const r = w.draai(["--json", "--droogloop"]);
    assert.equal(r.status, "mislukt");
    assert.match(r.reden, /pull requests/);
    assert.match(r.reden, /boom/);
    assert.deepEqual(w.werkmappen(), [], "de fout valt vóór het klonen; er is geen werkmap");
  } finally {
    w.opruimen();
  }
});

test("droogloop zonder afwijkingen: resultaat noemt de paden, werkmap staat klaar, niets op origin (AE3)", () => {
  const w = wereld();
  try {
    const voor = alleBestanden(w.klant.checkout);
    const r = w.draai(["--json", "--droogloop"]);
    assert.equal(r.status, "klaar", r.reden);
    assert.equal(r.van, 8);
    assert.equal(r.naar, 9);
    assert.equal(r.branch, "stack-bijwerken/v9");
    assert.ok(r.bijgewerkt.some((b) => b.pad === "CLAUDE.md"));
    assert.deepEqual(r.verwijderd, ["scripts/guard-oud.mjs"]);
    assert.deepEqual(r.overgeslagen, []);
    assert.equal(r.samenvatting.length, 3);
    assert.ok(r.werkmap.startsWith(realpathSync.native(w.tmp)), "de werkmap heeft zijn echte padnaam");
    assert.equal(statSync(r.werkmap).mode & 0o777, 0o700);
    assert.equal(git(w.klant.origin, "branch", "--list", "stack-bijwerken/v9"), "", "droogloop pusht niets");
    assert.deepEqual(alleBestanden(w.klant.checkout), voor, "de checkout van de klant is onaangeroerd");
    // De template-kloon staat op de tag, niet op main.
    assert.ok(readFileSync(join(r.werkmap, "template", "CLAUDE.md"), "utf8").includes("versie 9"));
  } finally {
    w.opruimen();
  }
});

test("echte run: branch op origin met de identiteit van de klant, main onaangeroerd, PR met bevestigingsregel, werkmap weg (AE3)", () => {
  const w = wereld();
  try {
    const mainVoor = git(w.klant.origin, "rev-parse", "main");
    const d = w.draai(["--droogloop"]);
    assert.equal(d.status, "klaar", d.reden);
    const r = w.draai(["--json", "--werkmap", d.werkmap]);
    assert.equal(r.status, "gepusht", r.reden);
    assert.equal(r.gepusht, true);
    assert.deepEqual(r.pr, { url: "https://github.com/klant/app/pull/1", nieuw: true });
    assert.equal(r.vergelijkUrl, null);
    assert.ok(!existsSync(d.werkmap), "de tijdelijke map is opgeruimd");
    assert.equal(git(w.klant.origin, "rev-parse", "main"), mainVoor);
    assert.equal(git(w.klant.origin, "log", "-1", "--format=%an <%ae>", "stack-bijwerken/v9"), "Bart Klant <bart@example.com>");
    assert.match(git(w.klant.origin, "log", "-1", "--format=%B", "stack-bijwerken/v9"), /Stack-bijwerken: v9/);
    assert.equal(git(w.klant.origin, "show", "stack-bijwerken/v9:.claude/stack-version"), "9");
    const create = w.nep.aanroepen().find((a) => a[0] === "pr" && a[1] === "create");
    assert.equal(create[create.indexOf("--repo") + 1], "klant/app");
    const body = create[create.indexOf("--body") + 1];
    assert.ok(body.endsWith(BEVESTIGING));
    assert.ok(body.includes("/stagetwo-tier2:updaten"));
    assert.ok(!body.includes("Stage Two stack-sync"));
    // Geen commit als Stage Two in de klantrepo vanuit de skill.
    assert.ok(!git(w.klant.origin, "log", "--format=%an", "stack-bijwerken/v9").includes("Stage Two"));
  } finally {
    w.opruimen();
  }
});

/** Zoals de droogloop het zou vinden: één tabel zonder A/B-test (in toestand.json van de werkmap). */
function metAbTest(werkmap, tabel = "klanten") {
  const pad = join(werkmap, "toestand.json");
  const t = JSON.parse(readFileSync(pad, "utf8"));
  t.resultaat.abTests = { tabellen: [tabel], paden: { [tabel]: `tests/rls/afscherming/${tabel}.test.ts` }, hulp: "tests/rls/lib/afscherming.ts" };
  writeFileSync(pad, JSON.stringify(t));
  const test = join(werkmap, "app", "tests", "rls", "afscherming", `${tabel}.test.ts`);
  mkdirSync(join(test, ".."), { recursive: true });
  writeFileSync(test, `await controleerAfscherming({ tabel: "${tabel}" });\n`);
}

const RULESET_ZONDER = {
  id: 1,
  name: "main beschermen",
  target: "branch",
  enforcement: "active",
  conditions: { ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } },
  rules: [{ type: "required_status_checks", parameters: { strict_required_status_checks_policy: true, required_status_checks: [{ context: "Code" }] } }],
};

test("A/B-tests en ruleset: de test van Claude komt mee onder een eigen kopje, en main eist de droogloop", () => {
  const w = wereld({
    gh: {
      ...GH_STANDAARD,
      "api repos/klant/app/rulesets?includes_parents=false": { stdout: [{ id: 1, name: "main beschermen" }] },
      "api repos/klant/app/rulesets/1": { stdout: RULESET_ZONDER },
    },
  });
  try {
    const d = w.draai(["--droogloop"]);
    assert.equal(d.status, "klaar", d.reden);
    metAbTest(d.werkmap);
    const r = w.draai(["--json", "--werkmap", d.werkmap]);
    assert.equal(r.status, "gepusht", r.reden);
    assert.deepEqual(r.abTests.geschreven, [{ tabel: "klanten", pad: "tests/rls/afscherming/klanten.test.ts" }]);
    assert.match(git(w.klant.origin, "show", "stack-bijwerken/v9:tests/rls/afscherming/klanten.test.ts"), /tabel: "klanten"/);
    const create = w.nep.aanroepen().find((a) => a[0] === "pr" && a[1] === "create");
    const body = create[create.indexOf("--body") + 1];
    assert.match(body, /\*\*A\/B-tests voor tabellen die er nog geen hadden\*\*/);
    assert.match(body, /- `klanten`: `tests\/rls\/afscherming\/klanten\.test\.ts`/);
    assert.ok(body.endsWith(BEVESTIGING));
    assert.equal(r.ruleset.status, "bijgezet");
    const put = w.nep.aanroepen().find((a) => a[0] === "api" && a.includes("PUT"));
    assert.equal(put[1], "repos/klant/app/rulesets/1");
    assert.ok(!body.includes("beheerrechten"), "met rechten geen regel onder Voor jou");
  } finally {
    w.opruimen();
  }
});

test("testrol: de aanpassing van Claude in global-setup zit in de commit van updaten, dus een volgende updaten stopt niet", () => {
  const w = wereld();
  try {
    const d = w.draai(["--droogloop"]);
    const pad = join(d.werkmap, "toestand.json");
    const t = JSON.parse(readFileSync(pad, "utf8"));
    const voor = "export default async function globalSetup() {}\n";
    t.resultaat.testrol = { pad: "e2e/global-setup.ts", voor };
    writeFileSync(pad, JSON.stringify(t));
    mkdirSync(join(d.werkmap, "app", "e2e"), { recursive: true });
    writeFileSync(join(d.werkmap, "app", "e2e", "global-setup.ts"), 'export default async function globalSetup() {\n  geefTestrol();\n}\nfunction geefTestrol() { const b = "supabase/testrol.sql"; }\n');
    const r = w.draai(["--json", "--werkmap", d.werkmap]);
    assert.equal(r.status, "gepusht", r.reden);
    assert.deepEqual(r.testrol, { pad: "e2e/global-setup.ts", gedaan: true });
    assert.match(git(w.klant.origin, "show", "stack-bijwerken/v9:e2e/global-setup.ts"), /geefTestrol\(\)/);
    const create = w.nep.aanroepen().find((a) => a[0] === "pr" && a[1] === "create");
    const body = create[create.indexOf("--body") + 1];
    assert.match(body, /\*\*De testrol in de browsertest\*\*/);
    const opnieuw = w.draai(["--droogloop"]);
    assert.equal(opnieuw.status, "klaar", opnieuw.reden);
  } finally {
    w.opruimen();
  }
});

test("open voor iedereen: het voorstel van Claude (een nieuwe migratie) zit in de commit van updaten en staat in de PR", () => {
  const w = wereld();
  try {
    const d = w.draai(["--droogloop"]);
    const pad = join(d.werkmap, "toestand.json");
    const t = JSON.parse(readFileSync(pad, "utf8"));
    const migratie = "supabase/migrations/20261106120000_open_regels_smaller.sql";
    t.resultaat.openTabellen = { tabellen: [], nooit: ['prijzen (policy "iedereen", anon, for select)'], config: "{}", migratie };
    writeFileSync(pad, JSON.stringify(t));
    mkdirSync(join(d.werkmap, "app", "supabase", "migrations"), { recursive: true });
    writeFileSync(join(d.werkmap, "app", migratie), '-- uitleg: alleen wie is ingelogd ziet de prijzen\ndrop policy "iedereen" on public.prijzen;\n');
    const r = w.draai(["--json", "--werkmap", d.werkmap]);
    assert.equal(r.status, "gepusht", r.reden);
    assert.equal(r.smal.gedaan, true);
    assert.match(git(w.klant.origin, "show", `stack-bijwerken/v9:${migratie}`), /drop policy/);
    const create = w.nep.aanroepen().find((a) => a[0] === "pr" && a[1] === "create");
    const body = create[create.indexOf("--body") + 1];
    assert.match(body, /\*\*Regels die open stonden voor iedereen op internet\*\*/);
    assert.match(body, /- alleen wie is ingelogd ziet de prijzen/);
    assert.doesNotMatch(body, /Nog niet mergen/);
  } finally {
    w.opruimen();
  }
});

test("A/B-tests: zegt de bouwer dat iedereen de tabel mag zien, dan komt zijn antwoord in open_tabellen", () => {
  const w = wereld();
  try {
    const d = w.draai(["--droogloop"]);
    assert.equal(d.status, "klaar", d.reden);
    const toestand = join(d.werkmap, "toestand.json");
    const t = JSON.parse(readFileSync(toestand, "utf8"));
    const config = join(d.werkmap, "app", "stack.config.json");
    const voor = existsSync(config) ? readFileSync(config, "utf8") : null;
    t.resultaat.abTests = { tabellen: ["orders"], paden: { orders: "tests/rls/afscherming/orders.test.ts" }, hulp: "tests/rls/lib/afscherming.ts", config: voor };
    writeFileSync(toestand, JSON.stringify(t));
    const c = voor ? JSON.parse(voor) : {};
    c.open_tabellen = { ...(c.open_tabellen ?? {}), orders: "iedereen in het bedrijf mag alle orders zien (Piet, 06-11-2026)" };
    writeFileSync(config, `${JSON.stringify(c, null, 2)}\n`);
    const r = w.draai(["--json", "--werkmap", d.werkmap]);
    assert.equal(r.status, "gepusht", r.reden);
    assert.deepEqual(r.abTests.open, [{ tabel: "orders", reden: "iedereen in het bedrijf mag alle orders zien (Piet, 06-11-2026)" }]);
    assert.deepEqual(r.abTests.geschreven, []);
    assert.match(git(w.klant.origin, "show", "stack-bijwerken/v9:stack.config.json"), /"orders": "iedereen in het bedrijf/);
    const create = w.nep.aanroepen().find((a) => a[0] === "pr" && a[1] === "create");
    const body = create[create.indexOf("--body") + 1];
    assert.match(body, /\*\*Tabellen die iedereen in de app mag zien\*\*/);
    assert.doesNotMatch(body, /door updaten geschreven/);
  } finally {
    w.opruimen();
  }
});

test("A/B-tests: een andere wijziging in stack.config.json stopt de run", () => {
  const w = wereld();
  try {
    const d = w.draai(["--droogloop"]);
    const toestand = join(d.werkmap, "toestand.json");
    const t = JSON.parse(readFileSync(toestand, "utf8"));
    t.resultaat.abTests = { tabellen: ["orders"], paden: { orders: "tests/rls/afscherming/orders.test.ts" }, hulp: "tests/rls/lib/afscherming.ts", config: null };
    writeFileSync(toestand, JSON.stringify(t));
    writeFileSync(join(d.werkmap, "app", "stack.config.json"), JSON.stringify({ open_tabellen: { klanten: "zomaar" } }));
    const r = w.draai(["--json", "--werkmap", d.werkmap]);
    assert.equal(r.status, "gestopt");
    assert.match(r.reden, /open_tabellen/);
  } finally {
    w.opruimen();
  }
});

test("A/B-tests: alleen de voorspelde paden; een ander nieuw bestand stopt de run", () => {
  const w = wereld();
  try {
    const d = w.draai(["--droogloop"]);
    metAbTest(d.werkmap);
    writeFileSync(join(d.werkmap, "app", "src", "ook.ts"), "export const x = 1;\n");
    const r = w.draai(["--json", "--werkmap", d.werkmap]);
    assert.equal(r.status, "gestopt");
    assert.deepEqual(r.buitenManifest, ["src/ook.ts"]);
  } finally {
    w.opruimen();
  }
});

test("ruleset zonder beheerrechten: één regel onder Voor jou, en de pull request komt er gewoon", () => {
  const w = wereld({
    gh: {
      ...GH_STANDAARD,
      "api repos/klant/app/rulesets?includes_parents=false": { stdout: [] },
      "api repos/klant/app/rulesets": { exit: 1, stderr: "gh: Must have admin rights to Repository. (HTTP 403)" },
    },
  });
  try {
    const d = w.draai(["--droogloop"]);
    const r = w.draai(["--json", "--werkmap", d.werkmap]);
    assert.equal(r.status, "gepusht", r.reden);
    assert.equal(r.ruleset.status, "geen-rechten");
    const create = w.nep.aanroepen().find((a) => a[0] === "pr" && a[1] === "create");
    const body = create[create.indexOf("--body") + 1];
    assert.match(body, /\*\*Voor jou:\*\*\n(- .*\n)*- De controle "Droogloop migraties" staat nog niet verplicht op main van klant\/app/);
  } finally {
    w.opruimen();
  }
});

test("--repo: een andere app bijwerken zonder dat die op deze computer staat, met de globale git-naam", () => {
  const w = wereld();
  const leeg = tijdelijkeMap("lege-map-");
  // Geen open app: de naam komt uit de globale git-config (hier via de omgeving).
  const identiteit = {
    GIT_CONFIG_COUNT: "3",
    GIT_CONFIG_KEY_1: "user.name",
    GIT_CONFIG_VALUE_1: "Bart Globaal",
    GIT_CONFIG_KEY_2: "user.email",
    GIT_CONFIG_VALUE_2: "bart@globaal.example",
  };
  try {
    const mainVoor = git(w.klant.origin, "rev-parse", "main");
    const d = w.draai(["--json", "--droogloop", "--repo", "klant/app", "--checkout", leeg], identiteit);
    assert.equal(d.status, "klaar", d.reden);
    assert.equal(d.repo, "klant/app");
    assert.equal(d.van, 8);
    const r = w.draai(["--json", "--werkmap", d.werkmap], identiteit);
    assert.equal(r.status, "gepusht", r.reden);
    assert.equal(git(w.klant.origin, "rev-parse", "main"), mainVoor);
    assert.equal(git(w.klant.origin, "log", "-1", "--format=%an <%ae>", "stack-bijwerken/v9"), "Bart Globaal <bart@globaal.example>");
    const create = w.nep.aanroepen().find((a) => a[0] === "pr" && a[1] === "create");
    assert.equal(create[create.indexOf("--repo") + 1], "klant/app");
  } finally {
    opruimen(leeg);
    w.opruimen();
  }
});

test("--repo: ongeldige naam, al bij, en zonder gh; nooit een werkmap achtergelaten", () => {
  const w = wereld();
  try {
    const fout = w.draai(["--droogloop", "--repo", "geen-schuine-streep"]);
    assert.equal(fout.status, "mislukt");
    assert.match(fout.reden, /eigenaar\/naam/);

    // De app op GitHub op 9 zetten: dan staat hij al bij en blijft er niets achter.
    git(w.klant.checkout, "checkout", "-q", "main");
    writeFileSync(join(w.klant.checkout, ".claude/stack-version"), "9\n");
    git(w.klant.checkout, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qam", "v9");
    git(w.klant.checkout, "push", "-q", w.klant.origin, "main");
    const bij = w.draai(["--droogloop", "--repo", "klant/app"]);
    assert.equal(bij.status, "bij", bij.reden);
    assert.deepEqual(w.werkmappen(), []);
  } finally {
    w.opruimen();
  }

  const z = wereld({ gh: { "--version": { exit: 127 } } });
  try {
    const r = z.draai(["--droogloop", "--repo", "klant/app"]);
    assert.equal(r.status, "mislukt");
    assert.match(r.reden, /installatie/);
  } finally {
    z.opruimen();
  }
});

test("tweede run vóór de merge: dezelfde branch, geen tweede PR, geen push als de boom gelijk is", () => {
  const w = wereld();
  try {
    const d1 = w.draai(["--droogloop"]);
    assert.equal(w.draai(["--werkmap", d1.werkmap]).status, "gepusht");
    const shaVoor = git(w.klant.origin, "rev-parse", "stack-bijwerken/v9");
    w.nep.zet({ ...GH_STANDAARD, "pr list": { stdout: [{ number: 1, headRefName: "stack-bijwerken/v9", url: "https://github.com/klant/app/pull/1" }] } });
    const d2 = w.draai(["--droogloop"]);
    assert.equal(d2.status, "klaar", d2.reden);
    const r = w.draai(["--werkmap", d2.werkmap]);
    assert.equal(r.status, "gepusht");
    assert.equal(r.gepusht, false);
    assert.deepEqual(r.pr, { url: "https://github.com/klant/app/pull/1", number: 1, nieuw: false });
    assert.equal(git(w.klant.origin, "rev-parse", "stack-bijwerken/v9"), shaVoor, "niets gepusht: dezelfde commit");
    assert.equal(w.nep.aanroepen().filter((a) => a[0] === "pr" && a[1] === "create").length, 1);
  } finally {
    w.opruimen();
  }
});

test("run na de merge: status bij", () => {
  const w = wereld();
  try {
    const d = w.draai(["--droogloop"]);
    w.draai(["--werkmap", d.werkmap]);
    // De klant merget de PR: main op origin krijgt de branch; zijn checkout haalt hem op.
    git(w.klant.origin, "update-ref", "refs/heads/main", "refs/heads/stack-bijwerken/v9");
    git(w.klant.checkout, "pull", "-q", w.klant.origin, "main");
    const r = w.draai(["--droogloop"]);
    assert.equal(r.status, "bij");
    assert.deepEqual(w.werkmappen(), []);
  } finally {
    w.opruimen();
  }
});

/** Een wereld waarin versie 9 nog niet uit is: geen tag stack-v9, wel een branch uitgave/9 op de commit van versie 9. */
function wereldMetUitgave(opties = {}) {
  const w = wereld({ tagV9: false, ...opties });
  git(w.template, "branch", "uitgave/9", "HEAD~1");
  return w;
}

test("--template-ref: een branch zonder tag wordt als proef toegepast, met eigen branch en PR-tekst", () => {
  const w = wereldMetUitgave();
  try {
    const mainVoor = git(w.klant.origin, "rev-parse", "main");
    const d = w.draai(["--json", "--droogloop", "--template-ref", "uitgave/9"]);
    assert.equal(d.status, "klaar", d.reden);
    assert.equal(d.van, 8);
    assert.equal(d.naar, 9);
    assert.equal(d.branch, "stack-proef/v9");
    assert.deepEqual(d.proef, { ref: "uitgave/9" });
    assert.deepEqual(d.verwijderd, ["scripts/guard-oud.mjs"], "het vorige manifest komt nog uit de tag stack-v8");
    assert.ok(d.samenvatting.some((r) => r.includes("proef") && r.includes("uitgave/9")));
    // De template-kloon staat op de branch, niet op main (daar staat CLAUDE.md zonder versie).
    assert.ok(readFileSync(join(d.werkmap, "template", "CLAUDE.md"), "utf8").includes("versie 9"));

    const r = w.draai(["--json", "--werkmap", d.werkmap]);
    assert.equal(r.status, "gepusht", r.reden);
    assert.deepEqual(r.proef, { ref: "uitgave/9" });
    assert.equal(git(w.klant.origin, "rev-parse", "main"), mainVoor);
    assert.equal(git(w.klant.origin, "branch", "--list", "stack-bijwerken/v9"), "", "geen echte update-branch");
    assert.equal(git(w.klant.origin, "show", "stack-proef/v9:.claude/stack-version"), "9");
    assert.match(git(w.klant.origin, "log", "-1", "--format=%B", "stack-proef/v9"), /proef[\s\S]*Stack-bijwerken: v9/);
    const create = w.nep.aanroepen().find((a) => a[0] === "pr" && a[1] === "create");
    assert.equal(create[create.indexOf("--head") + 1], "stack-proef/v9");
    assert.match(create[create.indexOf("--title") + 1], /^Proef: /);
    const body = create[create.indexOf("--body") + 1];
    assert.ok(body.startsWith("**Proef, niet mergen.**"));
    assert.ok(body.includes("`uitgave/9`"));
    assert.ok(body.includes("vervangen door de echte update"));
    assert.ok(body.endsWith(BEVESTIGING), "de guards van de app lezen de bevestigingsregel ook bij een proef");
    // Eén verhaal: nergens een aansporing om te mergen, en de herkomst is de werkplaats.
    assert.doesNotMatch(body, /merget|op Merge|merge die/i);
    assert.doesNotMatch(body, /Aangemaakt met|eigen Claude Code-sessie/);
    assert.match(body, /^Aangemaakt door de werkplaats van Stage Two, als proef/m);
    assert.match(body, /^Cloudflare-preview: /m, "het PR-formulier vraagt de preview-regel ook bij een proef");
    assert.match(body, /^Geen tests nodig: /m, "guard:tests leest deze regel ook bij een proef");
    for (const regel of body.split("\n").filter((x) => /merge/i.test(x))) {
      assert.match(regel, /niet mergen|merge van de uitgave/, regel);
    }
    assert.ok(r.samenvatting.some((regel) => regel.includes("niet mergen")));
    assert.ok(!r.samenvatting.some((regel) => /op Merge/.test(regel)));
    assert.deepEqual(w.werkmappen(), []);
  } finally {
    w.opruimen();
  }
});

test("--template-ref: een proef sluit alleen oudere proeven, nooit een echte update-PR", () => {
  const w = wereldMetUitgave({
    gh: {
      ...GH_STANDAARD,
      "pr list": {
        stdout: [
          { number: 3, headRefName: "stack-bijwerken/v8", url: "https://github.com/klant/app/pull/3" },
          { number: 4, headRefName: "stack-proef/v8", url: "https://github.com/klant/app/pull/4" },
        ],
      },
    },
  });
  try {
    const d = w.draai(["--droogloop", "--template-ref", "uitgave/9"]);
    assert.equal(d.status, "klaar", d.reden);
    assert.equal(w.draai(["--werkmap", d.werkmap]).status, "gepusht");
    const gesloten = w.nep.aanroepen().filter((a) => a[0] === "pr" && a[1] === "close").map((a) => a[2]);
    assert.deepEqual(gesloten, ["4"]);
  } finally {
    w.opruimen();
  }
});

test("--template-ref met --repo: een andere app krijgt de proef ook", () => {
  const w = wereldMetUitgave();
  const leeg = tijdelijkeMap("lege-map-");
  try {
    const d = w.draai(["--droogloop", "--repo", "klant/app", "--checkout", leeg, "--template-ref", "uitgave/9"]);
    assert.equal(d.status, "klaar", d.reden);
    assert.equal(d.branch, "stack-proef/v9");
    const r = w.draai(["--werkmap", d.werkmap], { GIT_CONFIG_COUNT: "3", GIT_CONFIG_KEY_1: "user.name", GIT_CONFIG_VALUE_1: "Bart Globaal", GIT_CONFIG_KEY_2: "user.email", GIT_CONFIG_VALUE_2: "bart@globaal.example" });
    assert.equal(r.status, "gepusht", r.reden);
    assert.equal(git(w.klant.origin, "show", "stack-proef/v9:.claude/stack-version"), "9");
  } finally {
    opruimen(leeg);
    w.opruimen();
  }
});

test("--template-ref: onbekende branch, ongeldige naam, al uitgebracht of niet hoger dan de app; nooit een werkmap", () => {
  const w = wereldMetUitgave();
  try {
    const geen = w.draai(["--droogloop", "--template-ref", "uitgave/99"]);
    assert.equal(geen.status, "mislukt");
    assert.match(geen.reden, /geen branch uitgave\/99/);
    assert.deepEqual(w.werkmappen(), []);

    for (const raar of ["--json", "", "a..b", "-x"]) {
      const r = w.draai(["--droogloop", "--template-ref", raar]);
      assert.equal(r.status, "mislukt", raar);
      assert.match(r.reden, /--template-ref/);
    }
    assert.deepEqual(w.werkmappen(), []);

    // De branch wijst naar versie 8, en die is al uit (tag stack-v8): dan geen proef.
    git(w.template, "branch", "uitgave/8", "stack-v8");
    const uit = w.draai(["--droogloop", "--template-ref", "uitgave/8"]);
    assert.equal(uit.status, "mislukt");
    assert.match(uit.reden, /al uitgebracht/);
    assert.deepEqual(w.werkmappen(), []);

    // De app staat al op 9: de proef heeft niets te doen.
    writeFileSync(join(w.klant.checkout, ".claude/stack-version"), "9\n");
    const bij = w.draai(["--droogloop", "--template-ref", "uitgave/9"]);
    assert.equal(bij.status, "bij", bij.reden);
    assert.equal(bij.naar, 9);
    assert.deepEqual(w.werkmappen(), []);
  } finally {
    w.opruimen();
  }
});

test("--template-ref: de controle op open pull requests geldt ook voor een proef, en ruimt de werkmap op", () => {
  // gh pr list faalt: stoppen, en de werkmap met de template-kloon van de proef is weg.
  const f = wereldMetUitgave({ gh: { ...GH_STANDAARD, "pr list": { exit: 1, stderr: "HTTP 502" } } });
  try {
    const r = f.draai(["--droogloop", "--template-ref", "uitgave/9"]);
    assert.equal(r.status, "mislukt");
    assert.match(r.reden, /open pull requests van klant\/app zijn niet op te vragen: .*HTTP 502/);
    assert.deepEqual(f.werkmappen(), []);
  } finally {
    f.opruimen();
  }

  // Er staat al een echte update-PR open voor deze versie: niet ernaast een proef zetten.
  const echt = { number: 7, headRefName: "stack-bijwerken/v9", url: "https://github.com/klant/app/pull/7" };
  const o = wereldMetUitgave({ gh: { ...GH_STANDAARD, "pr list": { stdout: [echt] } } });
  try {
    const r = o.draai(["--droogloop", "--template-ref", "uitgave/9"]);
    assert.equal(r.status, "gestopt", r.reden);
    assert.match(r.reden, /er staat al een pull request open voor versie 9/);
    assert.deepEqual(r.pr, echt);
    assert.deepEqual(o.werkmappen(), []);
    assert.equal(git(o.klant.origin, "branch", "--list", "stack-proef/v9"), "", "niets gepusht");
  } finally {
    o.opruimen();
  }
});

test("--template-ref: een branch met een andere variant dan de app stopt, zonder werkmap", () => {
  const w = wereldMetUitgave();
  try {
    // Een branch van de template voor de andere tier: zelfde versie, ander spoor.
    git(w.template, "checkout", "-q", "-b", "uitgave/9-ander", "uitgave/9");
    const pad = join(w.template, ".claude", "stack-manifest.json");
    writeFileSync(pad, JSON.stringify({ ...JSON.parse(readFileSync(pad, "utf8")), variant: "light" }));
    git(w.template, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-q", "-am", "andere variant");
    git(w.template, "checkout", "-q", "main");

    const r = w.draai(["--droogloop", "--template-ref", "uitgave/9-ander"]);
    assert.equal(r.status, "mislukt");
    assert.match(r.reden, /variant "light"/);
    assert.match(r.reden, /past dus niet bij deze app \(variant "cloudflare", tier 2\)/);
    assert.deepEqual(w.werkmappen(), []);
    assert.equal(git(w.klant.origin, "branch", "--list", "stack-proef/*"), "");

    // Zonder de optie verandert er niets: de hoogste tag is stack-v8 en de app staat op 8.
    const zonder = w.draai(["--droogloop"]);
    assert.equal(zonder.status, "bij", zonder.reden);
    assert.equal(zonder.naar, 8);
  } finally {
    w.opruimen();
  }
});

/**
 * Wat een gewone update (zonder --template-ref) in deze wereld oplevert, letterlijk vastgelegd
 * vóór de proef zijn eigen PR-tekst kreeg: titel, tekst, commitbericht en samenvatting moeten
 * byte voor byte zo blijven.
 */
const ZONDER_PROEF = {
  titel: "Template naar versie 9",
  tekst: "Deze pull request brengt dit project van stack-versie 8 naar 9.\n\nAangemaakt met /stagetwo-tier2:updaten vanuit je eigen Claude Code-sessie. Hij raakt alleen bestanden die van de gedeelde template zijn, nooit je eigen code.\n\n**Voor jou:**\n- Of de controle \"Droogloop migraties\" verplicht staat op main van klant/app, kon niet worden nagekeken. Jij hoeft niets te doen: de volgende keer /stagetwo-tier2:updaten kijkt het opnieuw en zet hem.\n\n**Bijgewerkt:**\n- `.claude/stack-manifest.json` (vervangen)\n- `.claude/stack-version` (vervangen)\n- `CLAUDE.md` (vervangen)\n- `.github/workflows/ci.yml` (vervangen)\n- `scripts/guard-nieuw.mjs` (nieuw)\n- `package.json` (sleutels samengevoegd (scripts, devDependencies))\n- `AGENTS.md` (tussen de markeringen)\n- `pnpm-lock.yaml` (opnieuw berekend uit package.json)\n\n**Verwijderd, want dit zit niet meer in de template:**\n- `scripts/guard-oud.mjs`\n\nAlle checks horen groen te zijn. Zo niet, dan voldoet de code van dit project niet\naan een nieuwe regel. Zet de check niet uit: Claude zegt in /stagetwo-tier2:verder-werken wat de regel\nvraagt en past de code aan in een eigen pull request; draai daarna /stagetwo-tier2:updaten opnieuw.\n\nCloudflare-preview: de link komt als reactie van \"Preview uitrollen\" in deze pull request. Deze update raakt wat er online komt (`.github/workflows/ci.yml`, `package.json`, `pnpm-lock.yaml`): open die preview één keer voordat je merget.\n\nGeen tests nodig: dit is een update van de gedeelde template\n\nBevestigd: templatebestanden gewijzigd",
  bericht: "chore: template naar versie 9\n\nStack-bijwerken: v9",
  samenvatting: ["Pull request geopend: https://github.com/klant/app/pull/1", "Wacht tot de checks groen zijn en druk dan op Merge. Rood? Zet de check niet uit: los het op met /stagetwo-tier2:verder-werken (een eigen pull request) en draai daarna /stagetwo-tier2:updaten opnieuw.", "Voor deze versie is er ook iets voor jou om na te lopen; dat staat in de pull request onder Voor jou."],
};

test("zonder --template-ref verandert er niets: een branch zonder tag wordt genegeerd", () => {
  const w = wereldMetUitgave();
  try {
    // Hoogste tag is stack-v8 en de app staat op 8: bij, zoals altijd. De branch uitgave/9 telt niet.
    const r = w.draai(["--json", "--droogloop"]);
    assert.equal(r.status, "bij", r.reden);
    assert.equal(r.naar, 8);
    assert.equal(r.proef, undefined);
    assert.deepEqual(w.werkmappen(), []);
  } finally {
    w.opruimen();
  }
  const g = wereld();
  try {
    const d = g.draai(["--droogloop"]);
    assert.equal(d.status, "klaar", d.reden);
    assert.equal(d.branch, "stack-bijwerken/v9");
    assert.equal(d.proef, undefined);
    assert.ok(!d.samenvatting.some((r) => r.includes("proef")));
    const r = g.draai(["--werkmap", d.werkmap]);
    assert.equal(r.proef, undefined);
    const create = g.nep.aanroepen().find((a) => a[0] === "pr" && a[1] === "create");
    assert.equal(create[create.indexOf("--title") + 1], ZONDER_PROEF.titel);
    assert.equal(create[create.indexOf("--body") + 1], ZONDER_PROEF.tekst);
    assert.equal(git(g.klant.origin, "log", "-1", "--format=%B", "stack-bijwerken/v9"), ZONDER_PROEF.bericht);
    assert.deepEqual(r.samenvatting, ZONDER_PROEF.samenvatting);
  } finally {
    g.opruimen();
  }
});

test("kapotte toestand.json: mislukt zonder stack trace en de werkmap is weg", () => {
  const w = wereld();
  try {
    const d = w.draai(["--droogloop"]);
    assert.equal(d.status, "klaar", d.reden);
    writeFileSync(join(d.werkmap, "toestand.json"), "dit is geen json {{{\n");
    const r = w.draai(["--json", "--werkmap", d.werkmap]);
    assert.equal(r.status, "mislukt");
    assert.ok(r.reden.length > 0);
    assert.ok(!existsSync(d.werkmap), "de kapotte werkmap is opgeruimd");
    assert.deepEqual(w.werkmappen(), []);
  } finally {
    w.opruimen();
  }
});

test("droogloop ouder dan een uur: mislukt en de werkmap is opgeruimd", () => {
  const w = wereld();
  try {
    const d = w.draai(["--droogloop"]);
    assert.equal(d.status, "klaar", d.reden);
    const tweeUurTerug = new Date(Date.now() - 2 * 3600 * 1000);
    utimesSync(join(d.werkmap, "toestand.json"), tweeUurTerug, tweeUurTerug);
    const r = w.draai(["--json", "--werkmap", d.werkmap]);
    assert.equal(r.status, "mislukt");
    assert.match(r.reden, /ouder dan een uur/);
    assert.ok(!existsSync(d.werkmap), "de verouderde werkmap is opgeruimd");
    assert.deepEqual(w.werkmappen(), []);
  } finally {
    w.opruimen();
  }
});

test("afwijking: droogloop toont het verschil, --los-op template neemt over, eigen laat staan (AE5)", () => {
  const w = wereld();
  try {
    const co = w.klant.checkout;
    writeFileSync(join(co, "CLAUDE.md"), "@AGENTS.md\n<!-- eigen aanpassing -->\n");
    writeFileSync(join(co, ".github/workflows/ci.yml"), "name: CI\nsteps:\n  - run: echo eigen\n");
    git(co, "add", "-A");
    git(co, "-c", "user.name=B", "-c", "user.email=b@b", "commit", "-q", "-m", "eigen aanpassingen");
    git(co, "push", "-q", w.klant.origin, "HEAD:main");

    const d = w.draai(["--droogloop"]);
    assert.equal(d.status, "klaar", d.reden);
    assert.deepEqual(d.overgeslagen.map((s) => s.pad).sort(), [".github/workflows/ci.yml", "CLAUDE.md"]);
    assert.ok(d.overgeslagen.every((s) => s.verschil.includes("@@")));

    const fout = w.draai(["--werkmap", d.werkmap, "--los-op", "src/App.tsx", "template"]);
    assert.equal(fout.status, "mislukt");
    assert.match(fout.reden, /niet in de lijst/);
    assert.ok(!existsSync(d.werkmap));

    const d2 = w.draai(["--droogloop"]);
    const r = w.draai(["--werkmap", d2.werkmap, "--los-op", "CLAUDE.md", "template", "--los-op", ".github/workflows/ci.yml", "eigen"]);
    assert.equal(r.status, "gepusht", r.reden);
    assert.deepEqual(r.opgelost, [{ pad: "CLAUDE.md", keuze: "template" }, { pad: ".github/workflows/ci.yml", keuze: "eigen" }]);
    assert.deepEqual(r.overgeslagen, []);
    assert.ok(git(w.klant.origin, "show", "stack-bijwerken/v9:CLAUDE.md").includes("versie 9"));
    assert.ok(git(w.klant.origin, "show", "stack-bijwerken/v9:.github/workflows/ci.yml").includes("echo eigen"));
    const body = w.nep.aanroepen().find((a) => a[0] === "pr" && a[1] === "create").at(-1);
    assert.ok(body.includes("de eigen versie behouden"));
  } finally {
    w.opruimen();
  }
});

test("AGENTS.md zonder markeringen: overgeslagen met reden, --los-op template weigert (projectdeel), eigen slaagt", () => {
  const w = wereld();
  try {
    const co = w.klant.checkout;
    writeFileSync(join(co, "AGENTS.md"), "# Mijn app\nEen app voor de kwekerij.\n\nAfspraken versie 8, zonder markeringen\n");
    git(co, "add", "-A");
    git(co, "-c", "user.name=B", "-c", "user.email=b@b", "commit", "-q", "-m", "markeringen per ongeluk weggehaald");
    git(co, "push", "-q", w.klant.origin, "HEAD:main");

    const d = w.draai(["--droogloop"]);
    assert.equal(d.status, "klaar", d.reden);
    const agents = d.overgeslagen.find((s) => s.pad === "AGENTS.md");
    assert.ok(agents, "AGENTS.md staat bij overgeslagen");
    assert.match(agents.reden, /markeringen stack:begin en stack:end ontbreken/);

    const fout = w.draai(["--werkmap", d.werkmap, "--los-op", "AGENTS.md", "template"]);
    assert.equal(fout.status, "mislukt");
    assert.match(fout.reden, /projectdeel/);
    assert.ok(!existsSync(d.werkmap), "na de weigering is de werkmap weg");

    const d2 = w.draai(["--droogloop"]);
    assert.equal(d2.status, "klaar", d2.reden);
    const r = w.draai(["--werkmap", d2.werkmap, "--los-op", "AGENTS.md", "eigen"]);
    assert.equal(r.status, "gepusht", r.reden);
    assert.deepEqual(r.opgelost, [{ pad: "AGENTS.md", keuze: "eigen" }]);
    assert.ok(git(w.klant.origin, "show", "stack-bijwerken/v9:AGENTS.md").includes("zonder markeringen"), "de eigen versie staat op de branch");
    assert.ok(!existsSync(d2.werkmap));
  } finally {
    w.opruimen();
  }
});

test("branch op afstand met een vreemde commit: gestopt en onaangeroerd; alleen skill-commits: herbouwd", () => {
  const w = wereld();
  try {
    const d = w.draai(["--droogloop"]);
    w.draai(["--werkmap", d.werkmap]);
    const eerste = git(w.klant.origin, "rev-parse", "stack-bijwerken/v9");
    // Alleen skill-commits: een tweede droogloop bouwt de branch opnieuw op (zelfde boom).
    const d2 = w.draai(["--droogloop"]);
    assert.equal(d2.status, "klaar");
    assert.ok(!existsSync(join(d2.werkmap, "x")));
    // Nu commit iemand zelf op de branch.
    const ander = join(w.wortel, "ander");
    execFileSync("git", ["clone", "-q", w.klant.origin, ander]);
    git(ander, "checkout", "-q", "stack-bijwerken/v9");
    writeFileSync(join(ander, "eigen.txt"), "x\n");
    git(ander, "add", "-A");
    git(ander, "-c", "user.name=K", "-c", "user.email=k@k", "commit", "-q", "-m", "eigen werk op de branch");
    git(ander, "push", "-q", "origin", "stack-bijwerken/v9");
    const tweede = git(w.klant.origin, "rev-parse", "stack-bijwerken/v9");
    assert.notEqual(tweede, eerste);
    const r = w.draai(["--droogloop"]);
    assert.equal(r.status, "gestopt");
    assert.match(r.reden, /niet van \/stagetwo-tier2:updaten/);
    assert.equal(git(w.klant.origin, "rev-parse", "stack-bijwerken/v9"), tweede, "branch onaangeroerd");
    assert.deepEqual(w.werkmappen(), [d2.werkmap.split("/").pop()], "geen nieuwe werkmap; alleen die van de eerdere droogloop");
    // Ook de tweede aanroep van die eerdere droogloop mag de vreemde commit niet overschrijven.
    const laat = w.draai(["--werkmap", d2.werkmap]);
    assert.equal(laat.status, "gestopt");
    assert.equal(git(w.klant.origin, "rev-parse", "stack-bijwerken/v9"), tweede, "branch nog steeds onaangeroerd");
    assert.deepEqual(w.werkmappen(), []);
  } finally {
    w.opruimen();
  }
});

test("vuile checkout op een andere branch: de run slaagt en de checkout is byte-identiek na afloop", () => {
  const w = wereld();
  try {
    const co = w.klant.checkout;
    git(co, "checkout", "-q", "-b", "feature/iets");
    writeFileSync(join(co, "src/App.tsx"), "// half werk\n");
    writeFileSync(join(co, "nieuw.txt"), "los\n");
    const voor = alleBestanden(co);
    const statusVoor = git(co, "status", "--porcelain");
    const d = w.draai(["--droogloop"]);
    assert.equal(d.status, "klaar", d.reden);
    assert.equal(w.draai(["--werkmap", d.werkmap]).status, "gepusht");
    assert.deepEqual(alleBestanden(co), voor);
    assert.equal(git(co, "status", "--porcelain"), statusVoor);
    assert.equal(git(co, "branch", "--show-current"), "feature/iets");
  } finally {
    w.opruimen();
  }
});

test("zonder gh: geen PR maar wel de branch en de vergelijkings-URL", () => {
  const w = wereld({ gh: { "--version": { exit: 127 } } });
  try {
    git(w.klant.checkout, "remote", "set-url", "origin", w.klant.origin);
    const d = w.draai(["--droogloop"]);
    assert.equal(d.status, "klaar", d.reden);
    const r = w.draai(["--werkmap", d.werkmap]);
    assert.equal(r.status, "gepusht", r.reden);
    assert.equal(r.pr, null);
    assert.equal(r.vergelijkUrl, null, "een lokale origin heeft geen GitHub-URL");
    assert.equal(git(w.klant.origin, "show", "stack-bijwerken/v9:.claude/stack-version"), "9");
  } finally {
    w.opruimen();
  }
});

test("het script als opdracht: --json geeft één JSON-object en de exitcode volgt de status", () => {
  const w = wereld();
  try {
    const uit = execFileSync("node", [SCRIPT, "--json", "--droogloop"], { cwd: w.klant.checkout, env: w.env, encoding: "utf8" });
    const r = JSON.parse(uit);
    assert.equal(r.status, "klaar");
    let code = 0;
    let fout = null;
    try {
      execFileSync("node", [SCRIPT, "--json", "--werkmap", "/etc"], { cwd: w.klant.checkout, env: w.env, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch (e) {
      code = e.status;
      fout = JSON.parse(e.stdout);
    }
    assert.equal(code, 1);
    assert.equal(fout.status, "mislukt");
    w.draai(["--werkmap", r.werkmap]);
  } finally {
    w.opruimen();
  }
});

test("--repo: een andere app van een ander spoor wordt na het klonen geweigerd, zonder werkmap", () => {
  for (const [variant, plugin] of [["light", /\/stagetwo-tier1:updaten/], [undefined, /oudere template/]]) {
    const w = wereld();
    try {
      git(w.klant.checkout, "checkout", "-q", "main");
      const pad = join(w.klant.checkout, ".claude", "stack-manifest.json");
      const { variant: _weg, ...rest } = JSON.parse(readFileSync(pad, "utf8"));
      writeFileSync(pad, JSON.stringify(variant ? { ...rest, variant } : rest));
      git(w.klant.checkout, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qam", "ander spoor");
      git(w.klant.checkout, "push", "-q", w.klant.origin, "main");
      const leeg = tijdelijkeMap("lege-map-");
      const r = w.draai(["--droogloop", "--repo", "klant/app", "--checkout", leeg]);
      assert.equal(r.status, "ander-spoor", r.reden);
      assert.match(r.reden, plugin);
      assert.deepEqual(w.werkmappen(), [], "de kloon is opgeruimd");
      opruimen(leeg);
    } finally {
      w.opruimen();
    }
  }
});

test("biomeVersie: de versie uit package.json, zonder ^ of ~", () => {
  const map = tijdelijkeMap("biome-versie-");
  try {
    writeFileSync(join(map, "package.json"), JSON.stringify({ devDependencies: { "@biomejs/biome": "^2.6.2" } }));
    assert.equal(biomeVersie(map), "2.6.2");
    writeFileSync(join(map, "package.json"), JSON.stringify({ devDependencies: { "@biomejs/biome": "latest" } }));
    assert.equal(biomeVersie(map), null);
    writeFileSync(join(map, "package.json"), JSON.stringify({}));
    assert.equal(biomeVersie(map), null);
  } finally {
    opruimen(map);
  }
});

test("formatteer: zonder Biome op deze computer (--repo) via pnpm dlx in de versie van de app", () => {
  const kloon = tijdelijkeMap("formatteer-kloon-");
  const bin = tijdelijkeMap("formatteer-bin-");
  const pathVoor = process.env.PATH;
  try {
    writeFileSync(join(kloon, "package.json"), JSON.stringify({ devDependencies: { "@biomejs/biome": "2.6.2" } }));
    const log = join(bin, "aanroep.json");
    writeFileSync(join(bin, "pnpm"), `#!/usr/bin/env node\nrequire("node:fs").writeFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)));\n`);
    execFileSync("chmod", ["+x", join(bin, "pnpm")]);
    process.env.PATH = `${bin}:${pathVoor}`;
    formatteer({ kloon, checkout: null, paden: ["tests/rls/afscherming/deals.test.ts"] });
    assert.deepEqual(JSON.parse(readFileSync(log, "utf8")), ["dlx", "@biomejs/biome@2.6.2", "check", "--write", "tests/rls/afscherming/deals.test.ts"]);
  } finally {
    process.env.PATH = pathVoor;
    opruimen(kloon);
    opruimen(bin);
  }
});

// ---------------------------------------------------------------- twee templates (versie 43)

const ZET_IN = (w, pad, inhoud, bericht) => {
  git(w.klant.checkout, "checkout", "-q", "main");
  writeFileSync(join(w.klant.checkout, pad), inhoud);
  git(w.klant.checkout, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qam", bericht);
  git(w.klant.checkout, "push", "-q", w.klant.origin, "main");
};

test("twee templates: een app van de openbare template wordt nooit met de gewone bijgewerkt, ook niet via STACK_TEMPLATE_REPO", () => {
  const w = wereld({ app: openbareAppBestanden() });
  try {
    const mainVoor = git(w.klant.origin, "rev-parse", "main");
    const r = w.draai(["--json", "--droogloop"]); // STACK_TEMPLATE_REPO wijst naar de gewone template
    assert.equal(r.status, "mislukt");
    assert.match(r.reden, /is de gewone template van tier 2/);
    assert.match(r.reden, /deze app komt uit de openbare template/);
    assert.deepEqual(w.werkmappen(), [], "de klonen zijn opgeruimd");
    assert.equal(git(w.klant.origin, "branch", "--list", "stack-bijwerken/*"), "", "niets gepusht");
    assert.equal(git(w.klant.origin, "rev-parse", "main"), mainVoor);
  } finally {
    w.opruimen();
  }
});

test("twee templates: een gewone app wordt nooit met de openbare bijgewerkt", () => {
  const w = wereld();
  try {
    const r = w.draai(["--json", "--droogloop"], { STACK_TEMPLATE_REPO: w.openbaar });
    assert.equal(r.status, "mislukt");
    assert.match(r.reden, /is de openbare template van tier 2/);
    assert.match(r.reden, /deze app komt uit de gewone template/);
    assert.deepEqual(w.werkmappen(), []);
    assert.equal(git(w.klant.origin, "branch", "--list", "stack-bijwerken/*"), "");
  } finally {
    w.opruimen();
  }
});

test("twee templates: een openbare app met zijn eigen template gaat gewoon, en houdt zijn manifest", () => {
  const w = wereld({ app: openbareAppBestanden() });
  try {
    const d = w.draai(["--json", "--droogloop"], { STACK_TEMPLATE_REPO: w.openbaar });
    assert.equal(d.status, "klaar", d.reden);
    assert.equal(d.naar, 9);
    const r = w.draai(["--json", "--werkmap", d.werkmap], { STACK_TEMPLATE_REPO: w.openbaar });
    assert.equal(r.status, "gepusht", r.reden);
    const manifest = JSON.parse(git(w.klant.origin, "show", "stack-bijwerken/v9:.claude/stack-manifest.json"));
    assert.equal(manifest.template, "app-template-tier2-openbaar");
  } finally {
    w.opruimen();
  }
});

test("twee templates: zonder STACK_TEMPLATE_REPO kiest updaten de template uit de levering op het manifest van de app", () => {
  const zonderOverschrijven = { STACK_TEMPLATE_REPO: "" };
  const w = wereld({ app: openbareAppBestanden() });
  try {
    const levering = { plugin: "klant/stagetwo-plugin-tier2", template: w.template, templateOpenbaar: w.openbaar };
    const d = w.draai(["--json", "--droogloop"], zonderOverschrijven, { levering });
    assert.equal(d.status, "klaar", d.reden);
    assert.ok(readFileSync(join(d.werkmap, "template", ".claude", "stack-manifest.json"), "utf8").includes("app-template-tier2-openbaar"), "de openbare template gekloond");
    w.draai(["--werkmap", d.werkmap]);
  } finally {
    w.opruimen();
  }
  const g = wereld();
  try {
    const levering = { plugin: "klant/stagetwo-plugin-tier2", template: g.template, templateOpenbaar: g.openbaar };
    const d = g.draai(["--json", "--droogloop"], zonderOverschrijven, { levering });
    assert.equal(d.status, "klaar", d.reden);
    assert.ok(!readFileSync(join(d.werkmap, "template", ".claude", "stack-manifest.json"), "utf8").includes("openbaar"), "de gewone template gekloond");
    g.draai(["--werkmap", d.werkmap]);
  } finally {
    g.opruimen();
  }
});

test("twee templates: zit de openbare template niet in de levering, dan een duidelijke melding en geen terugval op de gewone", () => {
  const w = wereld({ app: openbareAppBestanden() });
  try {
    const levering = { plugin: "klant/stagetwo-plugin-tier2", template: w.template, templateOpenbaar: null };
    const r = w.draai(["--json", "--droogloop"], { STACK_TEMPLATE_REPO: "" }, { levering });
    assert.equal(r.status, "mislukt");
    assert.equal(r.reden, NIET_IN_LEVERING);
    assert.deepEqual(w.werkmappen(), [], "niets gekloond");
    // Met --repo hetzelfde, na het klonen van de app; de kloon is weer weg.
    const leeg = tijdelijkeMap("lege-map-");
    const a = w.draai(["--json", "--droogloop", "--repo", "klant/app", "--checkout", leeg], { STACK_TEMPLATE_REPO: "" }, { levering });
    opruimen(leeg);
    assert.equal(a.status, "mislukt");
    assert.equal(a.reden, NIET_IN_LEVERING);
    assert.deepEqual(w.werkmappen(), []);
    assert.equal(git(w.klant.origin, "branch", "--list", "stack-bijwerken/*"), "");
  } finally {
    w.opruimen();
  }
});

test("twee templates: --repo leest de template van de andere app na het klonen", () => {
  const w = wereld();
  const leeg = tijdelijkeMap("lege-map-");
  try {
    // De app op GitHub is van de openbare template; de open map doet er niet toe.
    ZET_IN(w, ".claude/stack-manifest.json", openbareAppBestanden()[".claude/stack-manifest.json"], "openbaar");
    const fout = w.draai(["--droogloop", "--repo", "klant/app", "--checkout", leeg]);
    assert.equal(fout.status, "mislukt");
    assert.match(fout.reden, /deze app komt uit de openbare template/);
    assert.deepEqual(w.werkmappen(), []);
    const goed = w.draai(["--droogloop", "--repo", "klant/app", "--checkout", leeg], { STACK_TEMPLATE_REPO: w.openbaar });
    assert.equal(goed.status, "klaar", goed.reden);
    w.draai(["--werkmap", goed.werkmap]);
  } finally {
    opruimen(leeg);
    w.opruimen();
  }
});

test("twee templates: een openbare app op een versie die zijn template niet heeft, stopt duidelijk zonder crash", () => {
  const w = wereld({ app: { ...openbareAppBestanden(), ".claude/stack-version": "7\n" } });
  try {
    const r = w.draai(["--json", "--droogloop"], { STACK_TEMPLATE_REPO: w.openbaar });
    assert.equal(r.status, "gestopt");
    assert.match(r.reden, /versie 7 met het manifest van de openbare template/);
    assert.match(r.reden, /omzetten-naar-openbaar/);
    assert.deepEqual(w.werkmappen(), []);
    assert.equal(git(w.klant.origin, "branch", "--list", "stack-bijwerken/*"), "");
  } finally {
    w.opruimen();
  }
});

test("twee templates: --template-ref op een branch van de andere template stopt, zonder werkmap", () => {
  const w = wereld({ tagV9: false, app: openbareAppBestanden() });
  try {
    git(w.template, "branch", "uitgave/9", "HEAD~1");
    const r = w.draai(["--droogloop", "--template-ref", "uitgave/9"]);
    assert.equal(r.status, "mislukt");
    assert.match(r.reden, /de branch uitgave\/9 van .* is de gewone template/);
    assert.deepEqual(w.werkmappen(), []);
    git(w.openbaar, "branch", "uitgave/9", "HEAD~1");
    const goed = w.draai(["--droogloop", "--template-ref", "uitgave/9"], { STACK_TEMPLATE_REPO: w.openbaar });
    assert.equal(goed.status, "klaar", goed.reden);
    w.draai(["--werkmap", goed.werkmap]);
  } finally {
    w.opruimen();
  }
});
