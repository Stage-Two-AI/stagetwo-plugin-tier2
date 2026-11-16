/**
 * Het manifest (.claude/stack-manifest.json in elke app) zegt welke bestanden van de
 * gedeelde template zijn en hoe ze bijgewerkt worden:
 *
 *   vervangen            in zijn geheel overschrijven
 *   sleutelsSamenvoegen  alleen de genoemde sleutels van een JSON-bestand samenvoegen
 *   tussenMarkeringen    alleen het deel tussen <!-- naam:begin --> en <!-- naam:end -->
 *   alsHetOntbreekt      bestanden van het project waar code van de template op leunt: staat
 *                        zo'n bestand niet in de app, dan zet updaten de versie van de template
 *                        neer; staat het er wel, dan blijft het van het project (sinds versie 40)
 *
 * Alles wat hier niet in staat, is van het project en wordt nooit aangeraakt. Deze
 * module leest en interpreteert het manifest; ze schrijft niets.
 */

/**
 * Het hoogste formaat dat deze plugin kent (KTD11). Een template of app met een hoger nummer
 * vraagt iets wat deze plugin niet begrijpt; dan stopt de plugin in plaats van half werk te doen.
 *
 *   1  (of geen nummer) alle manifesten tot en met versie 42; het veld `template` mag
 *      ontbreken (dan is het de gewone template van tier 2)
 *   2  (sinds plugin 43) dezelfde inhoud, plus het verplichte veld `template` (lib/levering.mjs,
 *      manifestTemplate). De openbare template staat op formaat 2.
 */
export const KEND_FORMAAT = 2;

/** Sleutels waarbij niet de template wint maar de hoogste versie. */
const VERSIESLEUTELS = new Set(["dependencies", "devDependencies"]);

export function leesManifest(tekst) {
  const ruw = JSON.parse(tekst);
  const van = ruw.vanDeTemplate ?? {};
  return {
    formaat: ruw.manifestFormaat ?? 1,
    variant: ruw.variant ?? null,
    stackVersion: ruw.stackVersion ?? null,
    vervangen: van.vervangen ?? [],
    sleutels: van.sleutelsSamenvoegen ?? {},
    markeringen: van.tussenMarkeringen ?? {},
    alsHetOntbreekt: van.alsHetOntbreekt ?? [],
    vanHetProject: ruw.vanHetProject ?? [],
  };
}

/**
 * Deze plugin hoort bij het Cloudflare-spoor. Een app uit de Vercel-template heeft geen
 * `variant` in het manifest; die laat deze plugin aan de andere Stage Two-plugin
 * (`stack@stagetwo`) over, zodat er nooit Cloudflare-bestanden in een Vercel-app komen.
 *
 * Tier 2 is sinds versie 43 een familie van twee varianten: `cloudflare` (de gewone template,
 * app-template-tier2) en `cloudflare-openbaar` (de openbare template, app-template-tier2-openbaar).
 * Waarom de openbare template een eigen variant heeft: een oudere plugin (versie 42 en eerder)
 * kent het veld `template` niet en kijkt alleen naar `variant`. Stond er in een openbare app
 * gewoon `cloudflare`, dan werkte zo'n oudere plugin hem bij met de gewone template, en dan
 * komen er bestanden in die niet bij de app horen. Met een eigen variant ziet de oudere plugin
 * een app van een ander spoor en stopt hij, zonder iets te veranderen. Welke variant bij welke
 * template hoort, controleert lib/levering.mjs (manifestTemplate).
 */
export const VARIANT = "cloudflare";
export const VARIANT_OPENBAAR = "cloudflare-openbaar";
export const VARIANTEN = Object.freeze([VARIANT, VARIANT_OPENBAAR]);

/** Is dit het manifest van een app (of template) van tier 2, gewoon of openbaar? */
export function isCloudflareManifest(ruw) {
  return Boolean(ruw && typeof ruw === "object" && VARIANTEN.includes(ruw.variant));
}

export function formaatOndersteund(manifest) {
  return Number.isInteger(manifest.formaat) && manifest.formaat <= KEND_FORMAAT;
}

/** Alle paden die de kern mag aanraken. */
export function toegestaan(manifest) {
  return new Set([
    ...manifest.vervangen,
    ...Object.keys(manifest.sleutels),
    ...Object.keys(manifest.markeringen),
  ]);
}

/** Vervangt de inhoud tussen <!-- naam:begin --> en <!-- naam:end -->. Null als een van beide de markeringen mist. */
export function tussenMarkeringen(bestaand, nieuw, naam) {
  const begin = `<!-- ${naam}:begin -->`;
  const eind = `<!-- ${naam}:end -->`;
  const knip = (tekst) => {
    const a = tekst.indexOf(begin);
    const b = tekst.indexOf(eind);
    return a === -1 || b === -1 || b < a ? null : { a, b: b + eind.length };
  };
  const hier = knip(bestaand);
  const daar = knip(nieuw);
  if (!hier || !daar) return null;
  return bestaand.slice(0, hier.a) + nieuw.slice(daar.a, daar.b) + bestaand.slice(hier.b);
}

/**
 * Voegt alleen de genoemde sleutels samen. Eigen extra's van het project blijven. Bij
 * een sleutel die beide hebben wint de template, behalve bij dependencies en
 * devDependencies: daar wint de hoogste versie, zodat een Dependabot-bump in het
 * project overleeft en een hogere eis van de template toch doorkomt.
 */
export function voegSleutelsSamen(bestaandJson, nieuwJson, welke) {
  const uit = JSON.parse(bestaandJson);
  const van = JSON.parse(nieuwJson);
  for (const sleutel of welke) {
    if (!van[sleutel]) continue;
    const samen = { ...(uit[sleutel] ?? {}) };
    for (const [naam, waarde] of Object.entries(van[sleutel])) {
      const eigen = samen[naam];
      samen[naam] =
        VERSIESLEUTELS.has(sleutel) && eigen !== undefined && hogereVersie(eigen, waarde)
          ? eigen
          : waarde;
    }
    uit[sleutel] = Object.fromEntries(
      Object.keys(samen)
        .sort()
        .map((k) => [k, samen[k]]),
    );
  }
  return `${JSON.stringify(uit, null, 2)}\n`;
}

/** Is a hoger dan b? Alleen gewone versies (met ^ of ~ ervoor) zijn vergelijkbaar; anders wint b, de template. */
function hogereVersie(a, b) {
  const va = versieNummers(a);
  const vb = versieNummers(b);
  if (!va || !vb) return false;
  for (let i = 0; i < 3; i += 1) {
    if (va[i] !== vb[i]) return va[i] > vb[i];
  }
  return false;
}

function versieNummers(tekst) {
  const m = /^[\^~]?(\d+)\.(\d+)\.(\d+)$/.exec(String(tekst).trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
