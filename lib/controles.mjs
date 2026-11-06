/**
 * Bestaande apps goedzetten bij /stagetwo-tier2:updaten, buiten de bestanden van de app om
 * (besluit Christijn 06-11-2026: een klant hoeft na een uitgave zelf niets te doen).
 *
 * 1. De ruleset `main beschermen` van de app krijgt de verplichte controle "Droogloop
 *    migraties" (sinds versie 39), met de rechten van de bouwer via gh. Ontbreekt de ruleset
 *    helemaal, dan zet dit hem zoals /stagetwo-tier2:nieuwe-app dat doet. Zonder beheerrechten
 *    lukt dat niet; dan één regel voor de pull request, en de rest gaat door.
 * 2. Wat de inrichting van de app nog mist en App inrichten in de beheer-repo zet: de sleutels
 *    voor de droogloop in omgeving preview, en de foutmeldingen (Sentry). Alleen namen, nooit
 *    een waarde.
 *
 * `gh(args)` geeft de uitvoer als tekst en gooit bij een fout (zoals `sh("gh", args)` in
 * lib/repo.mjs); zo kunnen de tests zonder GitHub.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const CONTROLE = "Droogloop migraties";
export const VERSIE_CONTROLE = 39;
const RULESET_PAD = join(dirname(fileURLToPath(import.meta.url)), "..", "skills", "nieuwe-app", "ruleset.json");

/** De ruleset die /stagetwo-tier2:nieuwe-app op een nieuwe app zet. */
export function standaardRuleset() {
  return JSON.parse(readFileSync(RULESET_PAD, "utf8"));
}

/** Staat de controle al in de regel required_status_checks van deze ruleset? */
export function heeftControle(ruleset, context = CONTROLE) {
  return (ruleset?.rules ?? []).some(
    (r) => r.type === "required_status_checks" && (r.parameters?.required_status_checks ?? []).some((c) => c.context === context),
  );
}

/**
 * De body voor PUT op de ruleset, met de controle erbij. Alles wat er al stond, blijft staan
 * (ook een integration_id bij een bestaande check en de bypass-lijst).
 */
export function metControle(ruleset, context = CONTROLE) {
  const rules = structuredClone(ruleset.rules ?? []);
  let regel = rules.find((r) => r.type === "required_status_checks");
  if (!regel) {
    regel = { type: "required_status_checks", parameters: { strict_required_status_checks_policy: true, required_status_checks: [] } };
    rules.push(regel);
  }
  regel.parameters.required_status_checks = [...(regel.parameters.required_status_checks ?? []), { context }];
  const body = { name: ruleset.name, target: ruleset.target, enforcement: ruleset.enforcement, conditions: ruleset.conditions, rules };
  if (Array.isArray(ruleset.bypass_actors)) body.bypass_actors = ruleset.bypass_actors;
  return body;
}

function metInvoer(gh, args, body) {
  const map = mkdtempSync(join(tmpdir(), "stagetwo-ruleset-"));
  try {
    const pad = join(map, "ruleset.json");
    writeFileSync(pad, JSON.stringify(body));
    return gh([...args, "--input", pad]);
  } finally {
    rmSync(map, { recursive: true, force: true });
  }
}

const kort = (fout) => String(fout?.stderr || fout?.message || fout).split("\n").map((r) => r.trim()).find(Boolean) ?? "";

/** De regel voor de pull request (onder Voor jou) als de bouwer geen beheerrechten heeft. */
export function regelZonderRechten(repo) {
  return `De controle "${CONTROLE}" staat nog niet verplicht op main van ${repo}: daarvoor zijn beheerrechten op de repo nodig, en die heb jij niet. Jij hoeft niets te doen: wie wel beheerrechten heeft (de owner, of Stage Two in de projectfase) draait één keer /stagetwo-tier2:updaten, en dat zet hem.`;
}

/** De regel als de ruleset niet na te kijken was (netwerk, of de API gaf geen antwoord). */
export function regelOnbekend(repo) {
  return `Of de controle "${CONTROLE}" verplicht staat op main van ${repo}, kon niet worden nagekeken. Jij hoeft niets te doen: de volgende keer /stagetwo-tier2:updaten kijkt het opnieuw en zet hem.`;
}

/**
 * Zorgt dat de ruleset van `repo` de controle verplicht stelt. Geeft
 * `{ status: "al-goed" | "bijgezet" | "aangemaakt" | "geen-rechten" | "onbekend", reden?, regel? }`;
 * `regel` is de tekst voor de pull request als het niet lukte.
 */
export function zetVerplichteControle(repo, { gh }) {
  let lijst;
  try {
    lijst = JSON.parse(gh(["api", `repos/${repo}/rulesets?includes_parents=false`]));
  } catch (fout) {
    return { status: "onbekend", reden: `de rulesets van ${repo} zijn niet op te vragen: ${kort(fout)}`, regel: regelOnbekend(repo) };
  }
  const naam = standaardRuleset().name;
  const eigen = (Array.isArray(lijst) ? lijst : []).find((r) => r.name === naam);
  if (!eigen) {
    try {
      metInvoer(gh, ["api", `repos/${repo}/rulesets`, "-X", "POST"], standaardRuleset());
      return { status: "aangemaakt" };
    } catch (fout) {
      return { status: "geen-rechten", reden: kort(fout), regel: regelZonderRechten(repo) };
    }
  }
  let volledig;
  try {
    volledig = JSON.parse(gh(["api", `repos/${repo}/rulesets/${eigen.id}`]));
  } catch (fout) {
    return { status: "onbekend", reden: kort(fout), regel: regelOnbekend(repo) };
  }
  if (heeftControle(volledig)) return { status: "al-goed" };
  try {
    metInvoer(gh, ["api", `repos/${repo}/rulesets/${eigen.id}`, "-X", "PUT"], metControle(volledig));
    return { status: "bijgezet" };
  } catch (fout) {
    return { status: "geen-rechten", reden: kort(fout), regel: regelZonderRechten(repo) };
  }
}

/** true als de API-aanroep slaagt, false bij 404, null als het niet te zien is (rechten, netwerk). */
function bestaat(gh, pad) {
  try {
    gh(["api", pad, "--silent"]);
    return true;
  } catch (fout) {
    return /\b404\b|Not Found/i.test(String(fout?.stderr ?? fout?.message ?? "")) ? false : null;
  }
}

function namen(gh, pad, veld) {
  try {
    return JSON.parse(gh(["api", pad]))?.[veld]?.map((x) => x.name) ?? [];
  } catch {
    return null;
  }
}

function raw(gh, pad) {
  try {
    return gh(["api", pad, "-H", "Accept: application/vnd.github.raw"]);
  } catch {
    return null;
  }
}

/**
 * Wat App inrichten voor deze app nog moet zetten. `beheer`: de beheer-repo (of null).
 * Geeft `{ redenen: [tekst], stageTwo: [tekst], kanStarten, beheer, beheerVersie }`:
 * `redenen` is wat er mist; `kanStarten` zegt of de bouwer App inrichten zelf kan starten om
 * het te zetten; anders staat in `stageTwo` wat Stage Two doet.
 */
export function watMistDeInrichting(repo, { gh, beheer }) {
  const redenen = [];
  const stageTwo = [];
  let config = {};
  try {
    config = JSON.parse(raw(gh, `repos/${repo}/contents/stack.config.json`) ?? "{}");
  } catch {}
  const ingericht = bestaat(gh, `repos/${repo}/environments/production`);
  if (ingericht === false) {
    return { redenen: [], stageTwo: [], kanStarten: false, beheer, beheerVersie: null, ingericht: false };
  }

  let droogloopMist = false;
  if (config.database === true) {
    const secrets = namen(gh, `repos/${repo}/environments/preview/secrets`, "secrets");
    const variabelen = namen(gh, `repos/${repo}/environments/preview/variables`, "variables");
    const wachtwoord = secrets === null ? null : secrets.includes("SUPABASE_TEST_DB_PASSWORD");
    const pooler = variabelen === null ? null : variabelen.some((n) => n === "SUPABASE_TEST_POOLER_HOST" || n === "SUPABASE_POOLER_HOST");
    if (wachtwoord === false || pooler === false) {
      droogloopMist = true;
      redenen.push("de sleutels voor de droogloop van migraties staan nog niet in omgeving preview");
    }
  }
  const dsnProductie = bestaat(gh, `repos/${repo}/environments/production/variables/VITE_SENTRY_DSN`);
  const dsnPreview = bestaat(gh, `repos/${repo}/actions/variables/PREVIEW_VITE_SENTRY_DSN`);
  const sentryMist = dsnProductie === false || dsnPreview === false;
  if (sentryMist) redenen.push("de foutmeldingen (Sentry) zijn nog niet gekoppeld");
  if (redenen.length === 0) return { redenen, stageTwo, kanStarten: false, beheer, beheerVersie: null, ingericht: true };

  if (!beheer) {
    stageTwo.push(...redenen.map((r) => `${r}: Stage Two richt dat in (er is geen beheer-repo die jij kunt starten)`));
    return { redenen, stageTwo, kanStarten: false, beheer, beheerVersie: null, ingericht: true };
  }
  const versie = Number.parseInt(String(raw(gh, `repos/${beheer}/contents/VERSIE`) ?? "").trim(), 10);
  const beheerVersie = Number.isInteger(versie) ? versie : null;
  if (beheerVersie !== null && beheerVersie < VERSIE_CONTROLE) {
    stageTwo.push(`${redenen.join(" en ")}: dat kan pas als de beheer-repo op versie ${VERSIE_CONTROLE} staat (nu ${beheerVersie}); Stage Two brengt hem bij en start dan App inrichten`);
    return { redenen, stageTwo, kanStarten: false, beheer, beheerVersie, ingericht: true };
  }
  let starten = droogloopMist;
  if (sentryMist) {
    const beheerSecrets = namen(gh, `repos/${beheer}/environments/beheer/secrets`, "secrets");
    if (beheerSecrets !== null && !beheerSecrets.includes("SENTRY_AUTH_TOKEN")) {
      stageTwo.push("de foutmeldingen (Sentry): Stage Two koppelt Sentry één keer in de beheer-repo; daarna start dat App inrichten voor elke app");
    } else {
      starten = true;
    }
  }
  return { redenen, stageTwo, kanStarten: starten, beheer, beheerVersie, ingericht: true };
}
