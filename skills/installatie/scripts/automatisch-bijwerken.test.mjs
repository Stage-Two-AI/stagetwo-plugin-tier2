import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { STAGE_TWO } from "../../../lib/levering.mjs";
import { BRON, aanvullen, automatischBijwerken, instellingenPad, isBronVanStageTwo, watOntbreekt } from "./automatisch-bijwerken.mjs";

const SCRIPT = fileURLToPath(import.meta.url).replace(/\.test\.mjs$/, ".mjs");

function metMap(fn) {
  const map = mkdtempSync(join(tmpdir(), "auto-bijwerken-"));
  try {
    return fn(map, { CLAUDE_CONFIG_DIR: map });
  } finally {
    rmSync(map, { recursive: true, force: true });
  }
}

const lees = (map) => JSON.parse(readFileSync(join(map, "settings.json"), "utf8"));

test("pad: CLAUDE_CONFIG_DIR gaat voor, anders .claude in de gebruikersmap", () => {
  assert.equal(instellingenPad({ CLAUDE_CONFIG_DIR: "/x" }), join("/x", "settings.json"));
  assert.equal(instellingenPad({}), join(homedir(), ".claude", "settings.json"));
});

test("geen bestand: wordt aangemaakt met precies de twee instellingen", () => {
  metMap((map, env) => {
    const r = automatischBijwerken({ env });
    assert.equal(r.status, "gezet");
    assert.deepEqual(lees(map), {
      env: { FORCE_AUTOUPDATE_PLUGINS: "1" },
      extraKnownMarketplaces: { "stagetwo-tier2": { source: BRON, autoUpdate: true } },
    });
    assert.equal(automatischBijwerken({ env }).status, "al-goed", "tweede keer: niets te doen");
  });
});

test("bestaand bestand: alles van de gebruiker blijft staan, ook de stagetwo-regel van het Vercel-spoor en een eigen stagetwo-tier2-regel", () => {
  metMap((map, env) => {
    const voor = {
      theme: "dark",
      env: { EIGEN: "ja" },
      enabledPlugins: { "stack@stagetwo": true },
      extraKnownMarketplaces: {
        ander: { source: { source: "github", repo: "x/y" } },
        stagetwo: { source: { source: "github", repo: "Stage-Two-AI/stack-plugin" } },
        "stagetwo-tier2": { source: { source: "git", url: "https://github.com/Eigen-Org/stagetwo-plugin-tier2.git" } },
      },
    };
    writeFileSync(join(map, "settings.json"), JSON.stringify(voor));
    const r = automatischBijwerken({ env });
    assert.equal(r.status, "gezet");
    assert.deepEqual(r.gewijzigd, ["env.FORCE_AUTOUPDATE_PLUGINS", "extraKnownMarketplaces.stagetwo-tier2.autoUpdate"]);
    const na = lees(map);
    assert.equal(na.theme, "dark");
    assert.deepEqual(na.env, { EIGEN: "ja", FORCE_AUTOUPDATE_PLUGINS: "1" });
    assert.deepEqual(na.enabledPlugins, voor.enabledPlugins);
    assert.deepEqual(na.extraKnownMarketplaces.ander, voor.extraKnownMarketplaces.ander);
    assert.deepEqual(na.extraKnownMarketplaces.stagetwo, voor.extraKnownMarketplaces.stagetwo, "het Vercel-spoor blijft onaangeroerd");
    assert.deepEqual(na.extraKnownMarketplaces["stagetwo-tier2"], {
      source: voor.extraKnownMarketplaces["stagetwo-tier2"].source,
      autoUpdate: true,
    });
  });
});

test("de plugin onder zijn oude naam (stack-cloudflare@stagetwo-cloudflare) gaat eruit, de rest blijft", () => {
  metMap((map, env) => {
    const voor = {
      env: { FORCE_AUTOUPDATE_PLUGINS: "1" },
      enabledPlugins: { "stack-cloudflare@stagetwo-cloudflare": true, "ander@markt": true },
      extraKnownMarketplaces: {
        "stagetwo-cloudflare": { source: { source: "github", repo: "Stage-Two-AI/stack-plugin-cloudflare" }, autoUpdate: true },
        "stagetwo-tier2": { source: BRON, autoUpdate: true },
      },
    };
    writeFileSync(join(map, "settings.json"), JSON.stringify(voor));
    const r = automatischBijwerken({ env });
    assert.equal(r.status, "gezet");
    assert.deepEqual(r.gewijzigd, ["weg: extraKnownMarketplaces.stagetwo-cloudflare", "weg: enabledPlugins.stack-cloudflare@stagetwo-cloudflare"]);
    const na = lees(map);
    assert.deepEqual(na.enabledPlugins, { "ander@markt": true });
    assert.deepEqual(Object.keys(na.extraKnownMarketplaces), ["stagetwo-tier2"]);
    assert.equal(automatischBijwerken({ env }).status, "al-goed", "tweede keer: niets te doen");
  });
});

test("--controle schrijft niets; kapotte JSON wordt nooit aangeraakt", () => {
  metMap((map, env) => {
    const c = automatischBijwerken({ env, controle: true });
    assert.equal(c.status, "ontbreekt");
    assert.equal(c.ontbreekt.length, 3);
    assert.ok(!existsSync(join(map, "settings.json")));

    writeFileSync(join(map, "settings.json"), "{ dit is geen json");
    const r = automatischBijwerken({ env });
    assert.equal(r.status, "mislukt");
    assert.match(r.reden, /geen geldige JSON/);
    assert.equal(readFileSync(join(map, "settings.json"), "utf8"), "{ dit is geen json");
  });
});

test("zuivere functies: watOntbreekt en aanvullen laten het origineel staan", () => {
  const leeg = {};
  assert.equal(watOntbreekt(leeg).length, 3);
  const aangevuld = aanvullen(leeg);
  assert.deepEqual(leeg, {});
  assert.deepEqual(watOntbreekt(aangevuld), []);
});

test("als opdracht: één JSON-object, exitcode 0 bij gezet", () => {
  metMap((map) => {
    mkdirSync(map, { recursive: true });
    const uit = execFileSync(process.execPath, [SCRIPT, "--json"], { env: { ...process.env, CLAUDE_CONFIG_DIR: map }, encoding: "utf8" });
    assert.equal(JSON.parse(uit).status, "gezet");
  });
});

test("levering: een bron van Stage Two gaat naar de leveringsrepo van de klant, een eigen bron blijft", () => {
  const klant = { source: "github", repo: "Richplant-BV/stagetwo-plugin-tier2" };
  for (const oud of [
    { source: "github", repo: STAGE_TWO.plugin },
    { source: "git", url: `https://github.com/${STAGE_TWO.plugin}.git` },
  ]) {
    const voor = { env: { FORCE_AUTOUPDATE_PLUGINS: "1" }, extraKnownMarketplaces: { "stagetwo-tier2": { source: oud, autoUpdate: true } } };
    assert.deepEqual(watOntbreekt(voor, klant), ["extraKnownMarketplaces.stagetwo-tier2.source"]);
    const na = aanvullen(voor, klant);
    assert.deepEqual(na.extraKnownMarketplaces["stagetwo-tier2"], { source: klant, autoUpdate: true });
    assert.deepEqual(watOntbreekt(na, klant), []);
  }
  const eigen = { env: { FORCE_AUTOUPDATE_PLUGINS: "1" }, extraKnownMarketplaces: { "stagetwo-tier2": { source: { source: "github", repo: "x/y" }, autoUpdate: true } } };
  assert.deepEqual(watOntbreekt(eigen, klant), [], "een bron die niet van Stage Two is, blijft staan");
});

test("levering: zonder leveringsrepo blijft een bron van Stage Two gewoon staan", () => {
  const stageTwo = { source: "github", repo: STAGE_TWO.plugin };
  const voor = { env: { FORCE_AUTOUPDATE_PLUGINS: "1" }, extraKnownMarketplaces: { "stagetwo-tier2": { source: { source: "git", url: `https://github.com/${STAGE_TWO.plugin}` }, autoUpdate: true } } };
  assert.deepEqual(watOntbreekt(voor, stageTwo), []);
});

test("isBronVanStageTwo herkent de github- en de git-vorm, en niets anders", () => {
  assert.ok(isBronVanStageTwo({ source: "github", repo: STAGE_TWO.plugin.toUpperCase() }));
  assert.ok(isBronVanStageTwo({ source: "git", url: `git@github.com:${STAGE_TWO.plugin}.git` }));
  assert.ok(!isBronVanStageTwo({ source: "github", repo: "Richplant-BV/stagetwo-plugin-tier2" }));
  assert.ok(!isBronVanStageTwo({ source: "directory", path: "/x" }));
  assert.ok(!isBronVanStageTwo(undefined));
});

test("--uit zet autoUpdate op false en laat de rest staan; een gewone run zet het daarna niet terug, --aan wel", () => {
  metMap((map, env) => {
    writeFileSync(join(map, "settings.json"), JSON.stringify({ theme: "dark", env: { FORCE_AUTOUPDATE_PLUGINS: "1" }, extraKnownMarketplaces: { "stagetwo-tier2": { source: BRON, autoUpdate: true }, ander: { source: { source: "github", repo: "x/y" }, autoUpdate: true } } }));
    assert.equal(automatischBijwerken({ env, uit: true }).status, "uitgezet");
    const na = lees(map);
    assert.equal(na.theme, "dark");
    assert.deepEqual(na.extraKnownMarketplaces["stagetwo-tier2"], { source: BRON, autoUpdate: false });
    assert.equal(na.extraKnownMarketplaces.ander.autoUpdate, true, "andere marketplaces blijven onaangeroerd");
    assert.equal(automatischBijwerken({ env, uit: true }).status, "uit", "tweede keer: niets te doen");
    assert.equal(automatischBijwerken({ env }).status, "uit", "een gewone run (ook vanuit updaten) respecteert de keuze");
    assert.equal(automatischBijwerken({ env, controle: true }).status, "uit");
    assert.equal(lees(map).extraKnownMarketplaces["stagetwo-tier2"].autoUpdate, false);
    assert.equal(automatischBijwerken({ env, aan: true }).status, "gezet");
    assert.equal(lees(map).extraKnownMarketplaces["stagetwo-tier2"].autoUpdate, true);
  });
});

test("--uit zonder bestand maakt de marketplace-regel aan met autoUpdate false; --uit met --controle schrijft niets", () => {
  metMap((map, env) => {
    assert.equal(automatischBijwerken({ env, uit: true, controle: true }).status, "ontbreekt");
    assert.equal(existsSync(join(map, "settings.json")), false);
    const uit = execFileSync(process.execPath, [SCRIPT, "--json", "--uit"], { env: { ...process.env, CLAUDE_CONFIG_DIR: map }, encoding: "utf8" });
    assert.equal(JSON.parse(uit).status, "uitgezet");
    assert.deepEqual(lees(map), { extraKnownMarketplaces: { "stagetwo-tier2": { source: BRON, autoUpdate: false } } });
  });
});

test("--uit haalt ook FORCE_AUTOUPDATE_PLUGINS weg (andere env blijft); --aan zet het terug", () => {
  metMap((map, env) => {
    writeFileSync(join(map, "settings.json"), JSON.stringify({ env: { EIGEN: "ja", FORCE_AUTOUPDATE_PLUGINS: "1" }, extraKnownMarketplaces: { "stagetwo-tier2": { source: BRON, autoUpdate: true } } }));
    const r = automatischBijwerken({ env, uit: true });
    assert.equal(r.status, "uitgezet");
    assert.deepEqual(r.gewijzigd, ["extraKnownMarketplaces.stagetwo-tier2.autoUpdate = false", "weg: env.FORCE_AUTOUPDATE_PLUGINS"]);
    assert.deepEqual(lees(map).env, { EIGEN: "ja" });
    assert.equal(automatischBijwerken({ env, aan: true }).status, "gezet");
    assert.deepEqual(lees(map).env, { EIGEN: "ja", FORCE_AUTOUPDATE_PLUGINS: "1" });
  });
});

test("--uit met alleen FORCE_AUTOUPDATE_PLUGINS in env: env verdwijnt helemaal", () => {
  metMap((map, env) => {
    writeFileSync(join(map, "settings.json"), JSON.stringify({ env: { FORCE_AUTOUPDATE_PLUGINS: "1" }, extraKnownMarketplaces: { "stagetwo-tier2": { source: BRON, autoUpdate: false } } }));
    const r = automatischBijwerken({ env, uit: true });
    assert.equal(r.status, "uitgezet", "autoUpdate stond al uit, maar FORCE stond er nog (van een oudere versie van dit script)");
    assert.deepEqual(r.gewijzigd, ["weg: env.FORCE_AUTOUPDATE_PLUGINS"]);
    assert.equal("env" in lees(map), false);
  });
});

const BEKEND = (map) => join(map, "plugins", "known_marketplaces.json");
function zetBekend(map, data) {
  mkdirSync(join(map, "plugins"), { recursive: true });
  writeFileSync(BEKEND(map), JSON.stringify(data));
}
const leesBekend = (map) => JSON.parse(readFileSync(BEKEND(map), "utf8"));

test("known_marketplaces.json: aan en uit volgen daar ook, want in een app geldt die (de regel van de app heeft geen autoUpdate)", () => {
  metMap((map, env) => {
    const regel = { source: { source: "github", repo: STAGE_TWO.plugin }, installLocation: "/x", lastUpdated: "2026-10-16T00:00:00.000Z" };
    zetBekend(map, { "stagetwo-tier2": regel, ander: { installLocation: "/y" } });
    const r = automatischBijwerken({ env });
    assert.equal(r.status, "gezet");
    assert.ok(r.gewijzigd.includes("known_marketplaces.stagetwo-tier2.autoUpdate"));
    assert.deepEqual(leesBekend(map), { "stagetwo-tier2": { ...regel, autoUpdate: true }, ander: { installLocation: "/y" } });
    assert.equal(automatischBijwerken({ env }).status, "al-goed");

    const uit = automatischBijwerken({ env, uit: true });
    assert.equal(uit.status, "uitgezet");
    assert.ok(uit.gewijzigd.includes("known_marketplaces.stagetwo-tier2.autoUpdate = false"));
    assert.equal(leesBekend(map)["stagetwo-tier2"].autoUpdate, false);
    assert.equal(leesBekend(map)["stagetwo-tier2"].installLocation, "/x", "de velden van Claude Code blijven staan");
    assert.equal(automatischBijwerken({ env, uit: true }).status, "uit");

    // De schakelaar in /plugin zette hem weer aan, maar de gebruikersinstelling zegt uit: --uit zet hem terug.
    zetBekend(map, { "stagetwo-tier2": { ...regel, autoUpdate: true } });
    const opnieuw = automatischBijwerken({ env, uit: true });
    assert.equal(opnieuw.status, "uitgezet");
    assert.deepEqual(opnieuw.gewijzigd, ["known_marketplaces.stagetwo-tier2.autoUpdate = false"]);
  });
});

test("known_marketplaces.json: zonder regel of bestand maakt het script niets aan; kapotte JSON blijft onaangeroerd", () => {
  metMap((map, env) => {
    assert.equal(automatischBijwerken({ env }).status, "gezet");
    assert.equal(existsSync(BEKEND(map)), false, "geen bestand: niets aangemaakt");
    zetBekend(map, { ander: { installLocation: "/y" } });
    assert.equal(automatischBijwerken({ env }).status, "al-goed", "geen regel voor stagetwo-tier2: niets te doen");
    assert.deepEqual(leesBekend(map), { ander: { installLocation: "/y" } });
    writeFileSync(BEKEND(map), "{ kapot");
    assert.equal(automatischBijwerken({ env, uit: true }).status, "uitgezet");
    assert.equal(readFileSync(BEKEND(map), "utf8"), "{ kapot");
  });
});
