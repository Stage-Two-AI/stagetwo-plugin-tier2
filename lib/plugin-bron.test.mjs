import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { STAGE_TWO, leesLevering } from "./levering.mjs";
import { MARKETPLACE, SETTINGS_PAD, kiesPluginBron, metPluginBron, pluginBron, zonderAutoUpdate, zonderPluginBron } from "./plugin-bron.mjs";
import { maakMappen, nepGit, nepPnpm, opruimen } from "./test-hulp.mjs";
import { pasToe } from "./toepassen.mjs";

const KLANT = "Richplant-BV/stagetwo-plugin-tier2";

/** Zoals .claude/settings.json in de template staat (sinds v26 zonder autoUpdate). */
function settings(repo = STAGE_TWO.plugin, extra = {}, regelExtra = {}) {
  return `${JSON.stringify(
    {
      extraKnownMarketplaces: { [MARKETPLACE]: { source: { source: "github", repo }, ...regelExtra } },
      enabledPlugins: { [`${MARKETPLACE}@${MARKETPLACE}`]: true },
      ...extra,
    },
    null,
    2,
  )}\n`;
}

test("pluginBron: de repo van de marketplace, of null", () => {
  assert.equal(pluginBron(settings()), STAGE_TWO.plugin);
  assert.equal(pluginBron(settings(KLANT)), KLANT);
  assert.equal(pluginBron("{ kapot"), null);
  assert.equal(pluginBron("{}"), null);
  assert.equal(pluginBron(JSON.stringify({ extraKnownMarketplaces: { [MARKETPLACE]: { source: { source: "git", url: "https://x" } } } })), null);
});

test("kiesPluginBron: leveringsrepo wint, anders een eigen leveringsrepo van de app, anders Stage Two", () => {
  assert.equal(kiesPluginBron(settings(), KLANT), KLANT, "abonnee: zijn eigen kopie");
  assert.equal(kiesPluginBron(null, KLANT), KLANT);
  assert.equal(kiesPluginBron(settings(KLANT), STAGE_TWO.plugin), KLANT, "beheerde run zonder levering.json zet een klant niet terug");
  assert.equal(kiesPluginBron(settings(), STAGE_TWO.plugin), STAGE_TWO.plugin, "eigen apps van Stage Two");
  assert.equal(kiesPluginBron(null, STAGE_TWO.plugin), STAGE_TWO.plugin);
  assert.equal(kiesPluginBron(settings(), "geen geldige repo"), STAGE_TWO.plugin);
});

test("metPluginBron: alleen de repo verandert, opmaak en andere sleutels blijven", () => {
  const oud = settings(STAGE_TWO.plugin, { permissions: { allow: ["Bash(pnpm test)"] } });
  const nieuw = metPluginBron(oud, KLANT);
  assert.equal(nieuw, oud.replace(`"repo": "${STAGE_TWO.plugin}"`, `"repo": "${KLANT}"`));
  assert.equal(pluginBron(nieuw), KLANT);
  assert.equal(metPluginBron(nieuw, KLANT), nieuw, "al goed: niets te doen");
});

test("metPluginBron: zonder marketplace-regel, met een git-bron of kapotte JSON blijft de tekst staan", () => {
  for (const tekst of ["{ kapot", "{}\n", JSON.stringify({ extraKnownMarketplaces: { [MARKETPLACE]: { source: { source: "git", url: "x" } } } })]) {
    assert.equal(metPluginBron(tekst, KLANT), tekst);
  }
  assert.equal(metPluginBron(settings(), "geen repo"), settings());
});

test("zonderPluginBron: een andere bron of autoUpdate is geen inhoudelijk verschil", () => {
  assert.equal(zonderPluginBron(settings(KLANT)), settings());
  assert.notEqual(zonderPluginBron(settings(KLANT, { permissions: {} })), settings());
  // Een app van vóór v26 heeft autoUpdate nog; levering-omzetten haalt het weg. Beide zijn geen eigen aanpassing.
  assert.equal(zonderPluginBron(settings(KLANT, {}, { autoUpdate: true })), settings());
});

test("zonderAutoUpdate: alleen autoUpdate op de regel van de plugin gaat weg", () => {
  assert.equal(zonderAutoUpdate(settings(KLANT, {}, { autoUpdate: true })), settings(KLANT));
  assert.equal(zonderAutoUpdate(settings(KLANT)), settings(KLANT), "al zonder: tekst blijft precies gelijk");
  const ander = JSON.stringify({ extraKnownMarketplaces: { ander: { source: { source: "github", repo: "x/y" }, autoUpdate: true } } });
  assert.equal(zonderAutoUpdate(ander), ander, "andere marketplaces blijven onaangeroerd");
  assert.equal(zonderAutoUpdate("{ kapot"), "{ kapot");
});

// ---------------------------------------------------------------- in het bijwerken

/** Template 8 en 9 en een app op 8, met .claude/settings.json in `vervangen`. */
function opzetMetSettings({ app = settings(), tmpl8 = settings(), tmpl9 = settings() } = {}) {
  const o = maakMappen();
  for (const [map, tekst] of [[o.tmpl8, tmpl8], [o.tmpl9, tmpl9], [o.app, app]]) {
    const pad = join(map, ".claude/stack-manifest.json");
    const m = JSON.parse(readFileSync(pad, "utf8"));
    m.vanDeTemplate.vervangen.push(SETTINGS_PAD);
    writeFileSync(pad, `${JSON.stringify(m, null, 2)}\n`);
    writeFileSync(join(map, SETTINGS_PAD), tekst);
  }
  const git = nepGit({ map: o.app, opTag: { "stack-v8": o.tmpl8 } });
  return { ...o, git };
}

test("bijwerken bij een abonnee: de bron in de app gaat naar de leveringsrepo", () => {
  const o = opzetMetSettings();
  try {
    const r = pasToe({ map: o.app, tmplMap: o.tmpl9, git: o.git, pnpm: nepPnpm.aanwezig, pluginLevering: KLANT });
    assert.equal(r.status, "bijgewerkt", r.reden);
    assert.deepEqual(r.overgeslagen, []);
    assert.ok(r.bijgewerkt.some((b) => b.pad === SETTINGS_PAD));
    assert.equal(pluginBron(readFileSync(join(o.app, SETTINGS_PAD), "utf8")), KLANT);
  } finally {
    opruimen(o.wortel);
  }
});

test("bijwerken: een app die al op de leveringsrepo staat, is geen lokale aanpassing", () => {
  // De app staat al op de kopie van de klant; de template (van Stage Two of uit de
  // leveringsrepo) heeft een andere bron. Dat mag de update niet tegenhouden.
  const o = opzetMetSettings({ app: settings(KLANT), tmpl9: settings(STAGE_TWO.plugin, { permissions: { allow: [] } }) });
  try {
    const r = pasToe({ map: o.app, tmplMap: o.tmpl9, git: o.git, pnpm: nepPnpm.aanwezig, pluginLevering: KLANT });
    assert.deepEqual(r.overgeslagen, []);
    const na = readFileSync(join(o.app, SETTINGS_PAD), "utf8");
    assert.equal(pluginBron(na), KLANT);
    assert.ok(na.includes('"permissions"'), "de nieuwe inhoud van de template komt wel mee");
  } finally {
    opruimen(o.wortel);
  }
});

test("beheerde run zonder levering.json: de leveringsrepo van de app blijft staan", () => {
  const o = opzetMetSettings({ app: settings(KLANT) });
  try {
    const r = pasToe({ map: o.app, tmplMap: o.tmpl9, git: o.git, pnpm: nepPnpm.aanwezig, pluginLevering: STAGE_TWO.plugin });
    assert.equal(r.status, "bijgewerkt", r.reden);
    assert.equal(pluginBron(readFileSync(join(o.app, SETTINGS_PAD), "utf8")), KLANT);
    assert.ok(!r.bijgewerkt.some((b) => b.pad === SETTINGS_PAD), "niets aan de settings te doen");
  } finally {
    opruimen(o.wortel);
  }
});

test("eigen app van Stage Two (geen levering.json): de bronrepo blijft", () => {
  const o = opzetMetSettings();
  try {
    pasToe({ map: o.app, tmplMap: o.tmpl9, git: o.git, pnpm: nepPnpm.aanwezig, pluginLevering: STAGE_TWO.plugin });
    assert.equal(pluginBron(readFileSync(join(o.app, SETTINGS_PAD), "utf8")), STAGE_TWO.plugin);
  } finally {
    opruimen(o.wortel);
  }
});

test("bijwerken naar v26: autoUpdate gaat uit de app, ook als levering-omzetten het al had weggehaald", () => {
  const oud = settings(STAGE_TWO.plugin, {}, { autoUpdate: true });
  for (const [i, app] of [oud, settings(KLANT)].entries()) {
    const o = opzetMetSettings({ app, tmpl8: oud, tmpl9: settings() });
    try {
      const r = pasToe({ map: o.app, tmplMap: o.tmpl9, git: o.git, pnpm: nepPnpm.aanwezig, pluginLevering: KLANT });
      assert.equal(r.status, "bijgewerkt", r.reden);
      assert.deepEqual(r.overgeslagen, [], `autoUpdate wel of niet in de app is geen lokale aanpassing (${i})`);
      assert.equal(readFileSync(join(o.app, SETTINGS_PAD), "utf8"), settings(KLANT), "geen autoUpdate meer op projectniveau");
    } finally {
      opruimen(o.wortel);
    }
  }
});

test("een echte lokale aanpassing in de settings blijft een afwijking", () => {
  const o = opzetMetSettings({ app: settings(STAGE_TWO.plugin, { env: { EIGEN: "1" } }) });
  try {
    const r = pasToe({ map: o.app, tmplMap: o.tmpl9, git: o.git, pnpm: nepPnpm.aanwezig, pluginLevering: KLANT });
    assert.deepEqual(r.overgeslagen.map((s) => s.pad), [SETTINGS_PAD]);
  } finally {
    opruimen(o.wortel);
  }
});

test("app van vóór versie 26, plugin uit de bronrepo: de instelling van de gebruiker zet de app om", () => {
  // De plugin draait zonder levering.json (de app wees naar de bronrepo, en die
  // projectinstelling wint). /installatie zette de marketplace op de computer wel op de
  // kopie van de klant; daaruit komt de leveringsrepo, en het bijwerken zet de app om.
  const plugin = mkdtempSync(join(tmpdir(), "plugin-bron-"));
  const o = opzetMetSettings();
  try {
    const gebruiker = join(plugin, "settings.json");
    writeFileSync(gebruiker, JSON.stringify({ extraKnownMarketplaces: { [MARKETPLACE]: { source: { source: "github", repo: KLANT }, autoUpdate: true } } }));
    const levering = leesLevering(plugin, gebruiker);
    assert.equal(levering.plugin, KLANT);
    const r = pasToe({ map: o.app, tmplMap: o.tmpl9, git: o.git, pnpm: nepPnpm.aanwezig, pluginLevering: levering.plugin });
    assert.equal(r.status, "bijgewerkt", r.reden);
    assert.equal(pluginBron(readFileSync(join(o.app, SETTINGS_PAD), "utf8")), KLANT);
  } finally {
    opruimen(o.wortel);
    rmSync(plugin, { recursive: true, force: true });
  }
});
