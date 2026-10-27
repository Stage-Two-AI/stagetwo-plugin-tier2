/**
 * Wat er nieuw is: het changelog van Stage Two als JSON op stagetwo.nl/plugin/updates.json
 * (bron: stagetwo-site, src/features/plugin/uitgaven.ts). De melding bij sessiestart en de
 * pull request van /stagetwo-tier2:updaten noemen er de uitgaven uit die een app krijgt.
 *
 * De site is nooit een voorwaarde: geen verbinding, een time-out, kapotte JSON of een onbekend
 * `formaat` geeft null, en dan valt alles stil terug op de tekst zonder changelog. De
 * netwerkvraag (haalUpdates) staat los van de zuivere functies, zodat die zonder netwerk te
 * testen zijn.
 */

export const UPDATES_URL = "https://stagetwo.nl/plugin/updates.json";
export const PAGINA_URL = "https://stagetwo.nl/plugin";

/** Het formaat dat deze plugin kent; een hoger formaat telt als geen antwoord. */
export const KEND_FORMAAT = 1;

const TIER = 2;

/** Het antwoord van de site als het bruikbaar is, anders null. */
export function leesUpdates(waarde) {
  if (!waarde || typeof waarde !== "object") return null;
  if (waarde.formaat !== KEND_FORMAAT || !Array.isArray(waarde.uitgaven)) return null;
  return waarde;
}

/**
 * De uitgaven die een app van versie `van` naar versie `tot` meekrijgt (alleen die met een
 * nummer voor deze tier, `van` < nummer ≤ `tot`), nieuwste eerst, met alleen de punten voor
 * deze tier. Zonder bruikbare updates een lege lijst.
 */
export function uitgavenTussen(updates, { van, tot }) {
  const bruikbaar = leesUpdates(updates);
  if (!bruikbaar || !Number.isSafeInteger(van) || !Number.isSafeInteger(tot)) return [];
  return bruikbaar.uitgaven
    .filter((u) => u && typeof u.titel === "string")
    .map((u) => ({ uitgave: u, versie: u.versies?.[`tier${TIER}`] }))
    .filter(({ versie }) => Number.isSafeInteger(versie) && versie > van && versie <= tot)
    .sort((a, b) => b.versie - a.versie)
    .map(({ uitgave, versie }) => ({
      versie,
      titel: uitgave.titel,
      samenvatting: typeof uitgave.samenvatting === "string" ? uitgave.samenvatting : "",
      actieNodig: uitgave.actieNodig && typeof uitgave.actieNodig.wat === "string" ? uitgave.actieNodig : null,
      punten: (Array.isArray(uitgave.punten) ? uitgave.punten : []).filter(
        (p) => p && typeof p.tekst === "string" && Array.isArray(p.tiers) && p.tiers.includes(TIER),
      ),
    }));
}

/** 2026-11-30 wordt 30-11-2026; iets anders blijft zoals het is. */
export function datumNL(datum) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datum ?? "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : datum;
}

/** De eerstvolgende actie uit een lijst uitgaven (vroegste datum eerst, zonder datum achteraan). */
export function actieUit(uitgaven) {
  const acties = uitgaven.map((u) => u.actieNodig).filter(Boolean);
  acties.sort((a, b) => (a.voor ?? "9999").localeCompare(b.voor ?? "9999"));
  return acties[0] ?? null;
}

/**
 * Haalt updates.json op, met een tijdslimiet. Geeft het object of null; gooit nooit.
 * Testhaak: STAGETWO_UPDATES_TEST vervangt de netwerkvraag ("geen" is geen antwoord, anders
 * JSON-tekst).
 */
export async function haalUpdates({ timeoutMs = 2000, env = process.env, fetchFn = globalThis.fetch } = {}) {
  const test = env.STAGETWO_UPDATES_TEST;
  if (test !== undefined) {
    try {
      return test === "geen" ? null : leesUpdates(JSON.parse(test));
    } catch {
      return null;
    }
  }
  if (typeof fetchFn !== "function") return null;
  // Een eigen timer in plaats van AbortSignal.timeout: die houdt het proces niet open, en dan
  // kan een hangende vraag de hook stil laten eindigen zonder melding.
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), timeoutMs);
  try {
    const antwoord = await fetchFn(UPDATES_URL, { signal: stop.signal });
    if (!antwoord.ok) return null;
    return leesUpdates(await antwoord.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
