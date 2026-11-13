import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { NIET_IN_LEVERING, STAGE_TWO, STAGE_TWO_OPENBAAR, TEMPLATE_GEWOON, TEMPLATE_OPENBAAR, instellingenPad, leesLevering, leveringUitGebruiker, templateBron, templateVan } from "./levering.mjs";

const ALLES_VAN_STAGE_TWO = { ...STAGE_TWO, templateOpenbaar: STAGE_TWO_OPENBAAR };

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
  metMap((map) => assert.deepEqual(leesLevering(map, GEEN), ALLES_VAN_STAGE_TWO));
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
      templateOpenbaar: null,
    }, "zonder veld templateOpenbaar zit de openbare template niet in de levering");
  });
});

test("met levering.json en templateOpenbaar: de openbare template van de klant", () => {
  metMap((map) => {
    writeFileSync(
      join(map, "levering.json"),
      JSON.stringify({ plugin: "Winco-Holland-B-V/stagetwo-plugin-tier2", template: "Winco-Holland-B-V/app-template-tier2", templateOpenbaar: "Winco-Holland-B-V/app-template-tier2-openbaar" }),
    );
    assert.equal(leesLevering(map, GEEN).templateOpenbaar, "Winco-Holland-B-V/app-template-tier2-openbaar");
    writeFileSync(join(map, "levering.json"), JSON.stringify({ plugin: "Klant/p", template: "Klant/t", templateOpenbaar: "geen repo" }));
    assert.equal(leesLevering(map, GEEN).templateOpenbaar, null, "een ongeldige waarde is geen levering, en zeker niet die van Stage Two");
  });
});

test("per veld terug op Stage Two als de waarde ontbreekt of geen eigenaar/repo is", () => {
  metMap((map) => {
    writeFileSync(join(map, "levering.json"), JSON.stringify({ template: "https://evil.example/x y", plugin: "Klant/plugin" }));
    assert.deepEqual(leesLevering(map, GEEN), { plugin: "Klant/plugin", template: STAGE_TWO.template, templateOpenbaar: null });
  });
});

test("geen geldige JSON: alles van Stage Two", () => {
  metMap((map) => {
    writeFileSync(join(map, "levering.json"), "{ kapot");
    assert.deepEqual(leesLevering(map, GEEN), ALLES_VAN_STAGE_TWO);
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
      templateOpenbaar: null,
    }, "of de klant de openbare template heeft, staat niet in de instellingen; dus niet raden");
    writeFileSync(pad, gebruiker(STAGE_TWO.plugin));
    assert.deepEqual(leesLevering(map, pad), ALLES_VAN_STAGE_TWO, "de eigen computers van Stage Two");
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

// ---------------------------------------------------------------- welke template (sinds versie 43)

test("templateVan: zonder veld de gewone template, anders wat er staat", () => {
  assert.equal(templateVan({ variant: "cloudflare" }), TEMPLATE_GEWOON, "elke app van vóór versie 43");
  assert.equal(templateVan({ variant: "cloudflare", template: "app-template-tier2" }), TEMPLATE_GEWOON);
  assert.equal(templateVan({ variant: "cloudflare", template: "app-template-tier2-openbaar" }), TEMPLATE_OPENBAAR);
  assert.equal(templateVan(null), TEMPLATE_GEWOON);
});

test("templateBron: elke template uit zijn eigen levering, nooit de gewone als vervanger van de openbare", () => {
  const klant = { plugin: "K/stagetwo-plugin-tier2", template: "K/app-template-tier2", templateOpenbaar: "K/app-template-tier2-openbaar" };
  const zonder = { ...klant, templateOpenbaar: null };
  assert.deepEqual(templateBron({ template: TEMPLATE_GEWOON, env: {}, levering: klant }), { repo: "K/app-template-tier2" });
  assert.deepEqual(templateBron({ template: TEMPLATE_OPENBAAR, env: {}, levering: klant }), { repo: "K/app-template-tier2-openbaar" });
  assert.deepEqual(templateBron({ template: TEMPLATE_GEWOON, env: {}, levering: zonder }), { repo: "K/app-template-tier2" }, "tier 2 zoals altijd");
  const geen = templateBron({ template: TEMPLATE_OPENBAAR, env: {}, levering: zonder });
  assert.equal(geen.repo, undefined, "geen terugval op de gewone template");
  assert.equal(geen.fout, NIET_IN_LEVERING);
  assert.match(geen.fout, /niet in de levering/);
  assert.match(geen.fout, /owner/);
  assert.match(templateBron({ template: "app-template-tier9", env: {}, levering: klant }).fout, /niet kent/);
  // De werkplaats wijst de template zelf aan; updaten controleert na het klonen of het de goede is.
  assert.deepEqual(templateBron({ template: TEMPLATE_OPENBAAR, env: { STACK_TEMPLATE_REPO: "/tmp/x" }, levering: zonder }), { repo: "/tmp/x" });
});
