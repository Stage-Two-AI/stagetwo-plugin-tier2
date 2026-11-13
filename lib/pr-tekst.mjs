/**
 * De tekst van de pull request, in gewone taal, als zuivere functie van het
 * resultaatobject van de kern, voor de skill /stagetwo-tier2:updaten. De vaste regels onderaan zijn
 * geen opsmuk: de guards in de CI van elke app lezen ze (guard:template eist de
 * bevestigingsregel, guard:tests de regel over tests, de PR-sjabloon de preview-regel).
 *
 * `uitgaven` (uit lib/updates.mjs, uitgavenTussen) geeft bovenaan het kopje "Wat er nieuw is":
 * per uitgave de titel en de punten voor deze tier, een eventuele actie met datum, en de link
 * naar het changelog. Zonder uitgaven (site onbereikbaar) ontbreekt dat kopje.
 *
 * `proef` ({ ref }) is een proef van de werkplaats van Stage Two (bijwerken.mjs --template-ref):
 * dan zegt de herkomstregel dat, en staat er nergens een aansporing om te mergen. Zonder `proef`
 * is de tekst precies zoals hij altijd was.
 */
import { prRegels as abTestRegels } from "./abtests.mjs";
import { prRegelsProject } from "./projectbestanden.mjs";
import { datumNL, PAGINA_URL } from "./updates.mjs";

const SOORT_LABEL = { nieuw: "Nieuw", verbeterd: "Verbeterd", opgelost: "Opgelost", veiligheid: "Veiligheid" };

/** Het kopje "Wat er nieuw is" als regels, of een lege lijst. */
export function watErNieuwIs(uitgaven) {
  const lijst = Array.isArray(uitgaven) ? uitgaven.filter((u) => u && typeof u.titel === "string") : [];
  if (lijst.length === 0) return [];
  const regels = ["", "**Wat er nieuw is**"];
  for (const u of lijst) {
    regels.push("", `Versie ${u.versie}: ${u.titel}`);
    if (u.actieNodig) {
      const wanneer = u.actieNodig.voor ? ` (vóór ${datumNL(u.actieNodig.voor)})` : "";
      regels.push(`- **Actie nodig${wanneer}:** ${u.actieNodig.wat}`);
    }
    for (const p of u.punten ?? []) regels.push(`- ${SOORT_LABEL[p.soort] ?? "Nieuw"}: ${p.tekst}`);
  }
  regels.push("", `Alles over deze versies: ${PAGINA_URL}`);
  return regels;
}

export const BEVESTIGING = "Bevestigd: templatebestanden gewijzigd";

/**
 * Raakt deze update wat er online komt? Workflows (die bouwen en uitrollen), servercode en
 * schermen, de bouwinstellingen en de pakketten. Dan is de preview wel van toepassing.
 */
const RAAKT_DE_APP = /^(\.github\/workflows\/|src\/|worker\/|supabase\/functions\/|public\/)|^(package\.json|pnpm-lock\.yaml|index\.html|vite\.config\.ts|wrangler\.jsonc)$/;

/** De regel `Cloudflare-preview:` voor het PR-formulier. */
export function previewRegel(paden, { proef = null } = {}) {
  const raakt = [...new Set(paden)].filter((p) => RAAKT_DE_APP.test(p)).sort();
  if (raakt.length === 0) return "Cloudflare-preview: niet van toepassing, deze wijziging raakt de app zelf niet";
  const voorbeeld = raakt.slice(0, 3).map((p) => `\`${p}\``).join(", ") + (raakt.length > 3 ? " en meer" : "");
  if (proef) return `Cloudflare-preview: de link komt als reactie van "Preview uitrollen" in deze pull request. Deze proef raakt wat er online komt (${voorbeeld}): in de preview is te zien of de app met de nieuwe versie goed blijft werken.`;
  return `Cloudflare-preview: de link komt als reactie van "Preview uitrollen" in deze pull request. Deze update raakt wat er online komt (${voorbeeld}): open die preview één keer voordat je merget.`;
}

export function prTitel(naar) {
  return `Template naar versie ${naar}`;
}

export function branchNaam(versie) {
  return `stack-bijwerken/v${versie}`;
}

export function prTekst({ resultaat, uitgaven = [], proef = null }) {
  const { van, naar, bijgewerkt, verwijderd, overgeslagen, opgelost = [], projectbestanden = [], voorDeBouwer = [], abTests = null, openTabellen = null, testrol = null, smal = null } = resultaat;
  // Bestanden van het project die ontbraken en waar code van de template op leunt (alsHetOntbreekt).
  const ontbrak = bijgewerkt.filter((b) => b.hoe.startsWith("nieuw, want het ontbrak")).map((b) => `\`${b.pad}\``);
  const metOntbrak = ontbrak.length > 0 ? ` Ook zette hij ${ontbrak.join(" en ")} neer: code van de template leunt erop en het ontbrak hier; voortaan is het van je project.` : "";
  const metTests = (abTests?.geschreven ?? []).length > 0 ? " Daarnaast schreef hij A/B-tests voor tabellen die er nog geen hadden (zie hieronder)." : "";
  const metOpen = (abTests?.open ?? []).length > 0 ? " Op jouw antwoord zette hij tabellen die iedereen in de app mag zien in `open_tabellen` in `stack.config.json` (zie hieronder)." : "";
  const herkomst = proef
    ? `Aangemaakt door de werkplaats van Stage Two, als proef van een uitgave die nog niet uit is (branch \`${proef.ref}\` van de template).`
    : "Aangemaakt met /stagetwo-tier2:updaten vanuit je eigen Claude Code-sessie.";
  const regels = [
    `Deze pull request brengt dit project van stack-versie ${van} naar ${naar}.`,
    ...watErNieuwIs(uitgaven),
    "",
    projectbestanden.length > 0
      ? `${herkomst} Hij raakt bestanden die van de gedeelde template zijn, en eenmalig voor deze versie ${projectbestanden.map((p) => `\`${p}\``).join(" en ")} (zie hieronder). Verder niets van je eigen code.${metOntbrak}${metTests}${metOpen}`
      : `${herkomst} Hij raakt alleen bestanden die van de gedeelde template zijn, nooit je eigen code.${metOntbrak}${metTests}${metOpen}`,
  ];
  if (voorDeBouwer.length > 0) {
    regels.push("", "**Voor jou:**", ...voorDeBouwer.map((t) => `- ${t}`));
  }
  regels.push(...prRegelsProject({ open: openTabellen, testrol, smal }));
  regels.push(...abTestRegels(abTests));
  if (bijgewerkt.length > 0) {
    regels.push("", "**Bijgewerkt:**", ...bijgewerkt.map((b) => `- \`${b.pad}\` (${b.hoe})`));
  }
  if (verwijderd.length > 0) {
    regels.push("", "**Verwijderd, want dit zit niet meer in de template:**", ...verwijderd.map((pad) => `- \`${pad}\``));
  }
  if (opgelost.length > 0) {
    regels.push(
      "",
      "**Samen opgelost tijdens het bijwerken:**",
      ...opgelost.map((o) =>
        o.keuze === "template"
          ? `- \`${o.pad}\`: de versie van de template overgenomen; de lokale aanpassing is hiermee weg`
          : `- \`${o.pad}\`: de eigen versie behouden; dit bestand wijkt dus bewust af van de template`,
      ),
    );
  }
  if (overgeslagen.length > 0) {
    regels.push(
      "",
      "**Overgeslagen, want hier is lokaal iets aangepast.** Deze bestanden zijn niet bijgewerkt; kijk er samen met Claude naar in /stagetwo-tier2:verder-werken:",
      ...overgeslagen.map((s) => `- \`${s.pad}\`: ${s.reden}`),
    );
  }
  regels.push(
    "",
    ...(proef
      ? [
          "Alle checks horen groen te zijn; daarvoor is deze proef. Rood? Dan zoekt de werkplaats van Stage Two",
          "uit of het aan de nieuwe versie ligt of aan een nieuwe regel waar de code van dit project nog niet aan",
          "voldoet, voordat de versie uitkomt.",
        ]
      : [
          "Alle checks horen groen te zijn. Zo niet, dan voldoet de code van dit project niet",
          "aan een nieuwe regel. Zet de check niet uit: Claude zegt in /stagetwo-tier2:verder-werken wat de regel",
          "vraagt en past de code aan in een eigen pull request; draai daarna /stagetwo-tier2:updaten opnieuw.",
        ]),
    "",
    previewRegel([...bijgewerkt.map((b) => b.pad), ...verwijderd, ...projectbestanden], { proef }),
    "",
    "Geen tests nodig: dit is een update van de gedeelde template",
    "",
    BEVESTIGING,
  );
  return regels.join("\n");
}

export function sluitTekst(naar) {
  return `Achterhaald: de template staat inmiddels op versie ${naar} en daar staat een nieuwe pull request voor open, die alles van deze bevat. Deze wordt daarom gesloten zonder merge.`;
}
