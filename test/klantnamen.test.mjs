/**
 * Alles in deze repo behalve ALLEEN_IN_BRON gaat met Uitleveren naar elke abonnee. Daar hoort
 * geen naam of domein van een andere klant in: niet in meldingen, README, SKILL.md's, tests of
 * voorbeelden. Voorbeelden gebruiken Klant-BV, "Voorbeeld B.V." en noreply@voorbeeld.nl.
 *
 * De namen komen uit abonnees.json (org en klant per abonnee); dat bestand gaat zelf niet mee.
 * Bij een klant staat het er dus niet, en daar slaat de test over. Bij een treffer drukt de test
 * bestand, regelnummer en de gevonden naam af.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { ALLEEN_IN_BRON } from "../beheer/uitleveren.mjs";

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), "..");
const ABONNEES = join(WORTEL, "abonnees.json");

/**
 * De namen om op te zoeken: de hele org en de klant per abonnee, en wat er per abonnee onder
 * `zoek` staat (een korte merknaam, bijvoorbeeld). Het eerste deel van een org zoekt hij niet
 * meer vanzelf: dat is vaak een gewoon woord (Stage, Data, Home) dat overal in de plugin staat.
 */
export function klantnamen(abonnees) {
  const namen = new Set();
  for (const a of abonnees?.abonnees ?? []) {
    const org = typeof a === "string" ? a : a?.org;
    const klant = typeof a === "object" && a !== null ? a.klant : null;
    const zoek = typeof a === "object" && a !== null && Array.isArray(a.zoek) ? a.zoek : [];
    for (const naam of [org, klant, ...zoek]) {
      if (typeof naam === "string" && naam.trim().length >= 4) namen.add(naam.trim().toLowerCase());
    }
  }
  return [...namen];
}

/** Elke regel waarin een van de namen voorkomt (hoofdletters tellen niet). */
export function zoekNamen(tekst, namen) {
  const treffers = [];
  tekst.split(/\r?\n/).forEach((regel, i) => {
    const klein = regel.toLowerCase();
    for (const naam of namen) if (klein.includes(naam)) treffers.push({ regel: i + 1, naam });
  });
  return treffers;
}

/** De bestanden die naar een klant gaan: wat git kent (ook nieuw, nog niet gecommit), zonder ALLEEN_IN_BRON. */
function meeNaarKlant() {
  const uit = execFileSync("git", ["-C", WORTEL, "ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" });
  return [...new Set(uit.split("\n").filter(Boolean))].filter((pad) => !ALLEEN_IN_BRON.includes(pad) && existsSync(join(WORTEL, pad)));
}

test("klantnamen: zoekNamen vindt een naam ongeacht hoofdletters, en klantnamen leest org, klant en zoek, niet het eerste deel van de org", () => {
  const namen = klantnamen({
    abonnees: ["Los-BV", { org: "Proef-Holland-B-V", klant: "Proefje" }, { org: "Data-Holland-BV", klant: "Voorbeeld", zoek: ["dhbv"] }],
  });
  assert.deepEqual(namen.sort(), ["data-holland-bv", "dhbv", "los-bv", "proef-holland-b-v", "proefje", "voorbeeld"]);
  // Een gewoon woord vooraan in een org (Stage, Data, Home) maakt de controle niet rood.
  assert.ok(!namen.includes("data"));
  assert.deepEqual(zoekNamen("a\nnoreply@proefapps.com\nb", ["proef"]), [{ regel: 2, naam: "proef" }]);
});

test("geen naam of domein van een abonnee in wat naar een klant gaat", { skip: !existsSync(ABONNEES) && "abonnees.json staat alleen in de bron" }, () => {
  const namen = klantnamen(JSON.parse(readFileSync(ABONNEES, "utf8")));
  assert.ok(namen.length > 0, "abonnees.json heeft namen");
  const treffers = [];
  for (const pad of meeNaarKlant()) {
    let tekst;
    try {
      tekst = readFileSync(join(WORTEL, pad), "utf8");
    } catch {
      continue;
    }
    for (const t of zoekNamen(tekst, namen)) treffers.push(`${pad}:${t.regel} (${t.naam})`);
  }
  assert.deepEqual(treffers, [], `klantnamen in bestanden die naar elke abonnee gaan:\n${treffers.join("\n")}`);
});
