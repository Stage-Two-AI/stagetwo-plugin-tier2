import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { STAGE_TWO, instellingenPad, leesLevering, leveringUitGebruiker } from "./levering.mjs";

/** Een pad zonder bestand: geen instellingen van de gebruiker. */
const GEEN = join(tmpdir(), "bestaat-niet-levering", "settings.json");

function metMap(fn) {
  const map = mkdtempSync(join(tmpdir(), "levering-"));
  try {
    return fn(map);
  } finally {
    rmSync(map, { recursive: true, force: true });
  }
}

test("zonder levering.json: alles van Stage Two", () => {
  metMap((map) => assert.deepEqual(leesLevering(map, GEEN), { ...STAGE_TWO }));
});

test("met levering.json: de repo's van de klant", () => {
  metMap((map) => {
    writeFileSync(
      join(map, "levering.json"),
      JSON.stringify({ plugin: "Richplant-BV/stagetwo-plugin-tier2", template: "Richplant-BV/app-template-tier2" }),
    );
    assert.deepEqual(leesLevering(map, GEEN), {
      plugin: "Richplant-BV/stagetwo-plugin-tier2",
      template: "Richplant-BV/app-template-tier2",
    });
  });
});

test("per veld terug op Stage Two als de waarde ontbreekt of geen eigenaar/repo is", () => {
  metMap((map) => {
    writeFileSync(join(map, "levering.json"), JSON.stringify({ template: "https://evil.example/x y", plugin: "Klant/plugin" }));
    assert.deepEqual(leesLevering(map, GEEN), { plugin: "Klant/plugin", template: STAGE_TWO.template });
  });
});

test("geen geldige JSON: alles van Stage Two", () => {
  metMap((map) => {
    writeFileSync(join(map, "levering.json"), "{ kapot");
    assert.deepEqual(leesLevering(map, GEEN), { ...STAGE_TWO });
  });
});

// ---------------------------------------------------------------- instellingen van de gebruiker

/** settings.json zoals /stagetwo-tier2:installatie hem zet, met de marketplace op `repo`. */
function gebruiker(repo, soort = "github") {
  const source = soort === "github" ? { source: "github", repo } : { source: "git", url: `https://github.com/${repo}.git` };
  return JSON.stringify({ env: { FORCE_AUTOUPDATE_PLUGINS: "1" }, extraKnownMarketplaces: { "stagetwo-tier2": { source, autoUpdate: true } } });
}

test("leveringUitGebruiker: een leveringsrepo van een klant geeft plugin en template van die org", () => {
  assert.deepEqual(leveringUitGebruiker(gebruiker("Richplant-BV/stagetwo-plugin-tier2")), {
    plugin: "Richplant-BV/stagetwo-plugin-tier2",
    template: "Richplant-BV/app-template-tier2",
  });
});

test("leveringUitGebruiker: Stage Two zelf, een andere repo, een git-bron of kapotte JSON tellen niet", () => {
  assert.equal(leveringUitGebruiker(gebruiker(STAGE_TWO.plugin)), null);
  assert.equal(leveringUitGebruiker(gebruiker("stage-two-ai/stagetwo-plugin-tier2")), null, "ook niet in andere hoofdletters");
  assert.equal(leveringUitGebruiker(gebruiker("Richplant-BV/iets-anders")), null);
  assert.equal(leveringUitGebruiker(gebruiker("Richplant-BV/stagetwo-plugin-tier2", "git")), null);
  assert.equal(leveringUitGebruiker("{ kapot"), null);
  assert.equal(leveringUitGebruiker("{}"), null);
});

test("zonder levering.json: de leveringsrepo uit de instellingen van de gebruiker", () => {
  metMap((map) => {
    const pad = join(map, "settings.json");
    writeFileSync(pad, gebruiker("Richplant-BV/stagetwo-plugin-tier2"));
    assert.deepEqual(leesLevering(map, pad), {
      plugin: "Richplant-BV/stagetwo-plugin-tier2",
      template: "Richplant-BV/app-template-tier2",
    });
    writeFileSync(pad, gebruiker(STAGE_TWO.plugin));
    assert.deepEqual(leesLevering(map, pad), { ...STAGE_TWO }, "de eigen computers van Stage Two");
  });
});

test("levering.json gaat voor de instellingen van de gebruiker", () => {
  metMap((map) => {
    const pad = join(map, "settings.json");
    writeFileSync(pad, gebruiker("Ander-BV/stagetwo-plugin-tier2"));
    writeFileSync(join(map, "levering.json"), JSON.stringify({ plugin: "Klant/stagetwo-plugin-tier2", template: "Klant/app-template-tier2" }));
    assert.equal(leesLevering(map, pad).plugin, "Klant/stagetwo-plugin-tier2");
  });
});

test("instellingenPad: CLAUDE_CONFIG_DIR gaat voor de thuismap", () => {
  assert.equal(instellingenPad({ CLAUDE_CONFIG_DIR: "/x" }), join("/x", "settings.json"));
  assert.match(instellingenPad({}), /\.claude[\\/]settings\.json$/);
});
