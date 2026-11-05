import assert from "node:assert/strict";
import { test } from "node:test";
import { BEVESTIGING, branchNaam, prTekst, prTitel, sluitTekst } from "./pr-tekst.mjs";

const resultaat = {
  status: "bijgewerkt",
  van: 8,
  naar: 9,
  bijgewerkt: [{ pad: "CLAUDE.md", hoe: "vervangen" }, { pad: "package.json", hoe: "sleutels samengevoegd (scripts)" }],
  verwijderd: ["scripts/guard-oud.mjs"],
  overgeslagen: [{ pad: ".github/workflows/ci.yml", reden: "wijkt af van de template op versie 8; hier is lokaal iets aangepast" }],
};

test("de PR-tekst bevat de bevestigingsregel, elk bestand en elke reden, zonder em-dashes", () => {
  {
    const tekst = prTekst({ resultaat });
    assert.ok(tekst.endsWith(BEVESTIGING));
    assert.ok(tekst.includes("van stack-versie 8 naar 9"));
    assert.ok(tekst.includes("`CLAUDE.md` (vervangen)"));
    assert.ok(tekst.includes("`scripts/guard-oud.mjs`"));
    assert.ok(tekst.includes("`.github/workflows/ci.yml`: wijkt af"));
    assert.ok(tekst.includes("Geen tests nodig:"));
    assert.ok(tekst.includes("Cloudflare-preview: niet van toepassing"));
    assert.ok(!tekst.includes("—"), "geen em-dash");
  }
  assert.ok(prTekst({ resultaat }).includes("/stagetwo-tier2:updaten"));
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

test("titel, branchnaam en sluittekst", () => {
  assert.equal(prTitel(9), "Template naar versie 9");
  assert.equal(branchNaam(9), "stack-bijwerken/v9");
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
  const tekst = prTekst({ resultaat, uitgaven });
  assert.ok(tekst.indexOf("**Wat er nieuw is**") < tekst.indexOf("**Bijgewerkt:**"), "vóór de lijst met bestanden");
  assert.ok(tekst.includes("Versie 9: Negen"));
  assert.ok(tekst.includes("- **Actie nodig (vóór 30-11-2026):** Werk bij."));
  assert.ok(tekst.includes("- Nieuw: Iets nieuws."));
  assert.ok(tekst.includes("- Opgelost: Iets opgelost."));
  assert.ok(tekst.includes("https://stagetwo.nl/plugin"));
  assert.ok(tekst.endsWith(BEVESTIGING), "de vaste regels blijven onderaan");
  assert.ok(!tekst.includes("—"), "geen em-dash");
  assert.equal(prTekst({ resultaat, uitgaven: [] }), prTekst({ resultaat }));
  assert.ok(!prTekst({ resultaat }).includes("Wat er nieuw is"));
});

test("projectbestanden en uitleg voor de bouwer staan in de tekst, de belofte over eigen code past zich aan", () => {
  const zonder = prTekst({ resultaat });
  assert.ok(zonder.includes("nooit je eigen code"));
  assert.ok(!zonder.includes("**Voor jou:**"));
  const tekst = prTekst({
    resultaat: {
      ...resultaat,
      projectbestanden: ["src/onderdelen.ts", "stack.config.json"],
      voorDeBouwer: ["`src/onderdelen.ts` is nieuw en van jou."],
    },
  });
  assert.ok(tekst.includes("eenmalig voor deze versie `src/onderdelen.ts` en `stack.config.json`"));
  assert.ok(!tekst.includes("nooit je eigen code"));
  assert.ok(tekst.includes("**Voor jou:**\n- `src/onderdelen.ts` is nieuw en van jou."));
  assert.ok(tekst.endsWith(BEVESTIGING));
  assert.ok(!tekst.includes("—"), "geen em-dash");
});
