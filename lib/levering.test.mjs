import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { STAGE_TWO, leesLevering } from "./levering.mjs";

function metMap(fn) {
  const map = mkdtempSync(join(tmpdir(), "levering-"));
  try {
    return fn(map);
  } finally {
    rmSync(map, { recursive: true, force: true });
  }
}

test("zonder levering.json: alles van Stage Two", () => {
  metMap((map) => assert.deepEqual(leesLevering(map), { ...STAGE_TWO }));
});

test("met levering.json: de repo's van de klant", () => {
  metMap((map) => {
    writeFileSync(
      join(map, "levering.json"),
      JSON.stringify({ plugin: "Richplant-BV/stagetwo-plugin-tier2", template: "Richplant-BV/app-template-tier2" }),
    );
    assert.deepEqual(leesLevering(map), {
      plugin: "Richplant-BV/stagetwo-plugin-tier2",
      template: "Richplant-BV/app-template-tier2",
    });
  });
});

test("per veld terug op Stage Two als de waarde ontbreekt of geen eigenaar/repo is", () => {
  metMap((map) => {
    writeFileSync(join(map, "levering.json"), JSON.stringify({ template: "https://evil.example/x y", plugin: "Klant/plugin" }));
    assert.deepEqual(leesLevering(map), { plugin: "Klant/plugin", template: STAGE_TWO.template });
  });
});

test("geen geldige JSON: alles van Stage Two", () => {
  metMap((map) => {
    writeFileSync(join(map, "levering.json"), "{ kapot");
    assert.deepEqual(leesLevering(map), { ...STAGE_TWO });
  });
});
