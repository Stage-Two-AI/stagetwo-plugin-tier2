import assert from "node:assert/strict";
import { test } from "node:test";
import { BEVESTIGING, branchNaam, prTekst, prTitel, sluitTekst, spiegelTekst } from "./pr-tekst.mjs";

const resultaat = {
  status: "bijgewerkt",
  van: 8,
  naar: 9,
  bijgewerkt: [{ pad: "CLAUDE.md", hoe: "vervangen" }, { pad: "package.json", hoe: "sleutels samengevoegd (scripts)" }],
  verwijderd: ["scripts/guard-oud.mjs"],
  overgeslagen: [{ pad: ".github/workflows/ci.yml", reden: "wijkt af van de template op versie 8; hier is lokaal iets aangepast" }],
};

test("de PR-tekst bevat de bevestigingsregel, elk bestand en elke reden, zonder em-dashes", () => {
  for (const afzender of ["klantsessie", "beheerd"]) {
    const tekst = prTekst({ resultaat, afzender });
    assert.ok(tekst.endsWith(BEVESTIGING));
    assert.ok(tekst.includes("van stack-versie 8 naar 9"));
    assert.ok(tekst.includes("`CLAUDE.md` (vervangen)"));
    assert.ok(tekst.includes("`scripts/guard-oud.mjs`"));
    assert.ok(tekst.includes("`.github/workflows/ci.yml`: wijkt af"));
    assert.ok(tekst.includes("Geen tests nodig:"));
    assert.ok(tekst.includes("Cloudflare-preview: niet van toepassing"));
    assert.ok(!tekst.includes("—"), "geen em-dash");
  }
  assert.ok(prTekst({ resultaat, afzender: "klantsessie" }).includes("/stagetwo-tier2:updaten"));
  assert.ok(prTekst({ resultaat, afzender: "beheerd" }).includes("beheerde run van Stage Two"));
});

test("opgeloste botsingen staan in de tekst met de gemaakte keuze", () => {
  const tekst = prTekst({
    resultaat: { ...resultaat, overgeslagen: [], opgelost: [{ pad: "a.yml", keuze: "template" }, { pad: "b.yml", keuze: "eigen" }] },
    afzender: "klantsessie",
  });
  assert.ok(tekst.includes("`a.yml`: de versie van de template overgenomen"));
  assert.ok(tekst.includes("`b.yml`: de eigen versie behouden"));
  assert.ok(!tekst.includes("Overgeslagen"));
});

test("titel, branchnamen, spiegel- en sluittekst", () => {
  assert.equal(prTitel(9), "Template naar versie 9");
  assert.equal(branchNaam("klantsessie", 9), "stack-bijwerken/v9");
  assert.equal(branchNaam("beheerd", 9), "stack-sync/v9");
  assert.ok(spiegelTekst({ van: 8, naar: 9, gewijzigd: ["a"], verwijderd: ["b"] }).includes("- `b`"));
  assert.ok(sluitTekst(9).includes("versie 9"));
});

test("wat er nieuw is: bovenaan, per uitgave titel, actie met datum en punten, plus de link; zonder uitgaven geen kopje", () => {
  const uitgaven = [
    {
      versie: 9,
      titel: "Negen",
      actieNodig: { wat: "Werk bij.", voor: "2026-11-30" },
      punten: [
        { soort: "nieuw", tiers: [2], tekst: "Iets nieuws." },
        { soort: "opgelost", tiers: [1, 2], tekst: "Iets opgelost." },
      ],
    },
  ];
  const tekst = prTekst({ resultaat, afzender: "klantsessie", uitgaven });
  assert.ok(tekst.indexOf("**Wat er nieuw is**") < tekst.indexOf("**Bijgewerkt:**"), "vóór de lijst met bestanden");
  assert.ok(tekst.includes("Versie 9: Negen"));
  assert.ok(tekst.includes("- **Actie nodig (vóór 30-11-2026):** Werk bij."));
  assert.ok(tekst.includes("- Nieuw: Iets nieuws."));
  assert.ok(tekst.includes("- Opgelost: Iets opgelost."));
  assert.ok(tekst.includes("https://stagetwo.nl/plugin"));
  assert.ok(tekst.endsWith(BEVESTIGING), "de vaste regels blijven onderaan");
  assert.ok(!tekst.includes("—"), "geen em-dash");
  assert.equal(prTekst({ resultaat, afzender: "klantsessie", uitgaven: [] }), prTekst({ resultaat, afzender: "klantsessie" }));
  assert.ok(!prTekst({ resultaat, afzender: "klantsessie" }).includes("Wat er nieuw is"));
});
