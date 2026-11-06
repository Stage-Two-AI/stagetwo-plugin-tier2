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

/** Wat er niet werkt zolang iets ontbreekt, in gewone taal. */
export const GEVOLG = {
  droogloop:
    "zolang de sleutels voor de testdatabase ontbreken, oefent de droogloop een migratie die gegevens omzet niet; zo'n pull request kan toch door met de regel `Bevestigd: droogloop zonder testdatabase` in de PR-tekst",
  sentry: "fouten uit productie komen niet in Sentry, dus niemand ziet ze vanzelf",
};

/** De opdracht waarmee iemand met rechten op de beheer-repo App inrichten start. */
export function inrichtOpdracht(beheer, app) {
  return `gh workflow run app-inrichten.yml --repo ${beheer} -f app=${app} -f droogloop=false`;
}

/**
 * Wat App inrichten voor deze app nog moet zetten. `beheer`: de beheer-repo (of null).
 * Geeft `{ redenen, gevolgen, owner, kanStarten, beheer, beheerVersie, ingericht }`:
 * `redenen` is wat er mist en `gevolgen` wat er dan niet werkt; `kanStarten` zegt of App
 * inrichten het oplost (de bouwer start het, of de owner met `ownerOpdracht`); `owner` zegt
 * wat de owner van de eigen beheer-repo daarvoor nog moet doen. Niets hiervan blokkeert.
 */
export function watMistDeInrichting(repo, { gh, beheer }) {
  const app = repo.split("/")[1];
  const redenen = [];
  const gevolgen = [];
  const owner = [];
  const uit = (extra) => ({ redenen, gevolgen, owner, beheer, beheerVersie: null, ingericht: true, ownerOpdracht: beheer ? inrichtOpdracht(beheer, app) : null, ...extra });
  let config = {};
  try {
    config = JSON.parse(raw(gh, `repos/${repo}/contents/stack.config.json`) ?? "{}");
  } catch {}
  const ingericht = bestaat(gh, `repos/${repo}/environments/production`);
  if (ingericht === false) return uit({ kanStarten: false, ingericht: false });

  let droogloopMist = false;
  if (config.database === true) {
    const secrets = namen(gh, `repos/${repo}/environments/preview/secrets`, "secrets");
    const variabelen = namen(gh, `repos/${repo}/environments/preview/variables`, "variables");
    const wachtwoord = secrets === null ? null : secrets.includes("SUPABASE_TEST_DB_PASSWORD");
    const pooler = variabelen === null ? null : variabelen.some((n) => n === "SUPABASE_TEST_POOLER_HOST" || n === "SUPABASE_POOLER_HOST");
    if (wachtwoord === false || pooler === false) {
      droogloopMist = true;
      redenen.push("de sleutels voor de droogloop van migraties staan nog niet in omgeving preview");
      gevolgen.push(GEVOLG.droogloop);
    }
  }
  const dsnProductie = bestaat(gh, `repos/${repo}/environments/production/variables/VITE_SENTRY_DSN`);
  const dsnPreview = bestaat(gh, `repos/${repo}/actions/variables/PREVIEW_VITE_SENTRY_DSN`);
  const sentryMist = dsnProductie === false || dsnPreview === false;
  if (sentryMist) {
    redenen.push("de foutmeldingen (Sentry) zijn nog niet gekoppeld");
    gevolgen.push(GEVOLG.sentry);
  }
  if (redenen.length === 0) return uit({ kanStarten: false });

  if (!beheer) {
    owner.push("er is geen beheer-repo gevonden waar jij bij kunt; de owner van de organisatie start App inrichten voor deze app in de beheer-repo (Actions, App inrichten, Run workflow)");
    return uit({ kanStarten: false });
  }
  const versie = Number.parseInt(String(raw(gh, `repos/${beheer}/contents/VERSIE`) ?? "").trim(), 10);
  const beheerVersie = Number.isInteger(versie) ? versie : null;
  if (beheerVersie !== null && beheerVersie < VERSIE_CONTROLE) {
    owner.push(
      `de beheer-repo ${beheer} staat op versie ${beheerVersie}; App inrichten zet dit pas vanaf versie ${VERSIE_CONTROLE}. Met een abonnement levert Stage Two die versie (de owner geeft daarvoor tijdelijk toegang); daarna start de owner App inrichten: ${inrichtOpdracht(beheer, app)}`,
    );
    return uit({ kanStarten: false, beheerVersie });
  }
  let starten = droogloopMist;
  if (sentryMist) {
    const beheerSecrets = namen(gh, `repos/${beheer}/environments/beheer/secrets`, "secrets");
    if (beheerSecrets !== null && !beheerSecrets.includes("SENTRY_AUTH_TOKEN")) {
      owner.push(
        `Sentry is nog niet gekoppeld in ${beheer}. De owner doet dat één keer met zijn eigen Sentry-account, in een eigen terminal: node <plugin>/skills/installatie/scripts/sentry-koppelen.mjs --beheer ${beheer} --sentry-org <slug>; dat start daarna App inrichten voor elke app`,
      );
    } else {
      starten = true;
    }
  }
  return uit({ kanStarten: starten, beheerVersie });
}
