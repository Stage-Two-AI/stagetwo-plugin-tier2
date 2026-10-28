import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { schrijfBestanden, tijdelijkeMap } from "./test-hulp.mjs";
import { geldigTestadres, leesTestadres, zetTestadres } from "./testmail.mjs";

function app(config) {
  const map = tijdelijkeMap("testmail-");
  schrijfBestanden(map, { "stack.config.json": `${JSON.stringify(config, null, 2)}\n` });
  return map;
}

test("geldigTestadres: een gewoon adres wel, iets anders niet", () => {
  assert.equal(geldigTestadres("test@richplant.nl"), true);
  for (const fout of ["", "geen-adres", "a@b", "met spatie@x.nl", null, `${"a".repeat(250)}@x.nl`]) {
    assert.equal(geldigTestadres(fout), false, String(fout));
  }
});

test("leesTestadres: null zonder veld of met een lege waarde, anders het adres", () => {
  const zonder = app({ database: true });
  const leeg = app({ database: true, testmail: "" });
  const met = app({ database: true, testmail: "test@richplant.nl" });
  try {
    assert.equal(leesTestadres(zonder), null);
    assert.equal(leesTestadres(leeg), null);
    assert.equal(leesTestadres(met), "test@richplant.nl");
  } finally {
    for (const m of [zonder, leeg, met]) rmSync(m, { recursive: true, force: true });
  }
});

test("zetTestadres: zet testmail en laat de rest staan; weigert een ongeldig adres", () => {
  const map = app({ database: true, testdatabase: { project_ref: "abc" } });
  try {
    zetTestadres(map, "test@richplant.nl");
    const config = JSON.parse(readFileSync(join(map, "stack.config.json"), "utf8"));
    assert.deepEqual(config, { database: true, testdatabase: { project_ref: "abc" }, testmail: "test@richplant.nl" });
    assert.throws(() => zetTestadres(map, "geen adres"), /geen geldig mailadres/);
  } finally {
    rmSync(map, { recursive: true, force: true });
  }
});
