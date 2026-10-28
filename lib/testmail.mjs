/**
 * Het testadres van een app: in de testomgeving en lokaal gaat elke mail van de app naar dit
 * ene adres, wie er ook als ontvanger staat (uitgave 34). Met een kopie van echte gegevens in de
 * testdatabase zou de app anders echte klanten mailen. Zonder testadres verstuurt de app in de
 * testomgeving niets.
 *
 * Het adres hoort bij de app, niet bij de bouwer: de preview is van iedereen samen. Het staat
 * in `stack.config.json` als `testmail` (geen geheim, gewoon in git). Functies uitrollen zet het
 * daarvandaan als secret `TESTMAIL_ADRES` op de testdatabase.
 *
 * /stagetwo-tier2:nieuwe-app vraagt het bij het aanmaken, /stagetwo-tier2:updaten één keer bij
 * een app die het nog niet heeft.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const CONFIG = "stack.config.json";

/** Een gewoon mailadres: iets@iets.iets, zonder spaties, hooguit 254 tekens. */
export function geldigTestadres(adres) {
  return typeof adres === "string" && adres.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adres);
}

/** Het testadres van de app in `map`, of null als het er (nog) niet staat. */
export function leesTestadres(map) {
  const pad = join(map, CONFIG);
  if (!existsSync(pad)) return null;
  const waarde = JSON.parse(readFileSync(pad, "utf8")).testmail;
  return typeof waarde === "string" && waarde.trim() ? waarde.trim() : null;
}

/** Zet het testadres in `stack.config.json`; de rest van het bestand blijft staan. */
export function zetTestadres(map, adres) {
  if (!geldigTestadres(adres)) throw new Error(`"${adres}" is geen geldig mailadres`);
  const pad = join(map, CONFIG);
  if (!existsSync(pad)) throw new Error(`${CONFIG} ontbreekt; staat de app op de template van tier 2?`);
  const config = JSON.parse(readFileSync(pad, "utf8"));
  config.testmail = adres;
  writeFileSync(pad, `${JSON.stringify(config, null, 2)}\n`);
}
