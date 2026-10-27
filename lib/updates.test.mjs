/**
 * Tests voor het changelog van stagetwo.nl (lib/updates.mjs): welke uitgaven een app krijgt,
 * de datum, de eerstvolgende actie en de netwerkvraag (met een fetch-stub, dus zonder netwerk).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { actieUit, datumNL, haalUpdates, leesUpdates, uitgavenTussen } from "./updates.mjs";

const UPDATES = {
  formaat: 1,
  pagina: "https://stagetwo.nl/plugin",
  uitgaven: [
    {
      id: "2026-11-09",
      datum: "2026-11-09",
      titel: "Drie",
      samenvatting: "s3",
      versies: { plugin: "33.0.0", tier1: 33, tier2: 33, beheer: 33 },
      punten: [
        { soort: "nieuw", tiers: [1, 2], tekst: "voor beide" },
        { soort: "opgelost", tiers: [1], tekst: "alleen tier 1" },
      ],
    },
    { id: "x", datum: "x", titel: "Alleen tier 1", samenvatting: "", versies: { tier1: 30 }, punten: [] },
    {
      id: "2026-10-23",
      datum: "2026-10-23",
      titel: "Twee",
      samenvatting: "s2",
      versies: { tier2: 31 },
      actieNodig: { wat: "Doe iets.", voor: "2026-11-30" },
      punten: [{ soort: "opgelost", tiers: [2], tekst: "alleen tier 2" }],
    },
  ],
};

test("uitgavenTussen: alleen van < versie ≤ tot, alleen deze tier, nieuwste eerst, punten gefilterd", () => {
  const lijst = uitgavenTussen(UPDATES, { van: 28, tot: 33 });
  assert.deepEqual(lijst.map((u) => [u.versie, u.titel]), [[33, "Drie"], [31, "Twee"]]);
  assert.deepEqual(lijst[0].punten.map((p) => p.tekst), ["voor beide"]);
  assert.deepEqual(lijst[1].actieNodig, { wat: "Doe iets.", voor: "2026-11-30" });
  assert.deepEqual(uitgavenTussen(UPDATES, { van: 31, tot: 33 }).map((u) => u.versie), [33], "31 heeft de app al");
  assert.deepEqual(uitgavenTussen(UPDATES, { van: 33, tot: 33 }), [], "niets nieuws");
});

test("uitgavenTussen: geen updates of een onbekend formaat geeft een lege lijst", () => {
  assert.deepEqual(uitgavenTussen(null, { van: 1, tot: 33 }), []);
  assert.deepEqual(uitgavenTussen({ ...UPDATES, formaat: 2 }, { van: 1, tot: 33 }), []);
  assert.deepEqual(uitgavenTussen({ formaat: 1 }, { van: 1, tot: 33 }), []);
  assert.equal(leesUpdates("tekst"), null);
});

test("datumNL en actieUit: 30-11-2026, en de vroegste datum eerst", () => {
  assert.equal(datumNL("2026-11-30"), "30-11-2026");
  assert.equal(datumNL("binnenkort"), "binnenkort");
  const actie = actieUit([
    { actieNodig: { wat: "later", voor: "2026-12-31" } },
    { actieNodig: null },
    { actieNodig: { wat: "eerst", voor: "2026-11-30" } },
    { actieNodig: { wat: "zonder datum" } },
  ]);
  assert.equal(actie.wat, "eerst");
  assert.equal(actieUit([{ actieNodig: null }]), null);
});

test("haalUpdates: antwoord, fout, time-out en onbekend formaat; gooit nooit", async () => {
  const ok = (json) => async () => ({ ok: true, json: async () => json });
  assert.deepEqual(await haalUpdates({ env: {}, fetchFn: ok(UPDATES) }), UPDATES);
  assert.equal(await haalUpdates({ env: {}, fetchFn: ok({ ...UPDATES, formaat: 2 }) }), null);
  assert.equal(await haalUpdates({ env: {}, fetchFn: async () => ({ ok: false }) }), null);
  assert.equal(await haalUpdates({ env: {}, fetchFn: async () => { throw new Error("offline"); } }), null);
  const traag = (_url, { signal }) => new Promise((_, nee) => signal.addEventListener("abort", () => nee(signal.reason)));
  assert.equal(await haalUpdates({ env: {}, fetchFn: traag, timeoutMs: 20 }), null);
});

test("haalUpdates: de testhaak vervangt de netwerkvraag", async () => {
  assert.equal(await haalUpdates({ env: { STAGETWO_UPDATES_TEST: "geen" } }), null);
  assert.equal(await haalUpdates({ env: { STAGETWO_UPDATES_TEST: "{kapot" } }), null);
  assert.deepEqual(await haalUpdates({ env: { STAGETWO_UPDATES_TEST: JSON.stringify(UPDATES) } }), UPDATES);
});
