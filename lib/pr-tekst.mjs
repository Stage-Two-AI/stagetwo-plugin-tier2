/**
 * De tekst van de pull request, in gewone taal, als zuivere functie van het
 * resultaatobject van de kern, voor de skill /stagetwo-tier2:updaten. De vaste regels onderaan zijn
 * geen opsmuk: de guards in de CI van elke app lezen ze (guard:template eist de
 * bevestigingsregel, guard:tests de regel over tests, de PR-sjabloon de preview-regel).
 *
 * `uitgaven` (uit lib/updates.mjs, uitgavenTussen) geeft bovenaan het kopje "Wat er nieuw is":
 * per uitgave de titel en de punten voor deze tier, een eventuele actie met datum, en de link
 * naar het changelog. Zonder uitgaven (site onbereikbaar) ontbreekt dat kopje.
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

export function prTitel(naar) {
  return `Template naar versie ${naar}`;
}

export function branchNaam(versie) {
  return `stack-bijwerken/v${versie}`;
}

export function prTekst({ resultaat, uitgaven = [] }) {
  const { van, naar, bijgewerkt, verwijderd, overgeslagen, opgelost = [], projectbestanden = [], voorDeBouwer = [], abTests = null, openTabellen = null, testrol = null } = resultaat;
  const metTests = (abTests?.geschreven ?? []).length > 0 ? " Daarnaast schreef hij A/B-tests voor tabellen die er nog geen hadden (zie hieronder)." : "";
  const regels = [
    `Deze pull request brengt dit project van stack-versie ${van} naar ${naar}.`,
    ...watErNieuwIs(uitgaven),
    "",
    projectbestanden.length > 0
      ? `Aangemaakt met /stagetwo-tier2:updaten vanuit je eigen Claude Code-sessie. Hij raakt bestanden die van de gedeelde template zijn, en eenmalig voor deze versie ${projectbestanden.map((p) => `\`${p}\``).join(" en ")} (zie hieronder). Verder niets van je eigen code.${metTests}`
      : `Aangemaakt met /stagetwo-tier2:updaten vanuit je eigen Claude Code-sessie. Hij raakt alleen bestanden die van de gedeelde template zijn, nooit je eigen code.${metTests}`,
  ];
  if (voorDeBouwer.length > 0) {
    regels.push("", "**Voor jou:**", ...voorDeBouwer.map((t) => `- ${t}`));
  }
  regels.push(...prRegelsProject({ open: openTabellen, testrol }));
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
      "**Overgeslagen, want hier is lokaal iets aangepast.** Deze bestanden zijn niet bijgewerkt; kijk er zelf naar of vraag Stage Two mee te kijken:",
      ...overgeslagen.map((s) => `- \`${s.pad}\`: ${s.reden}`),
    );
  }
  regels.push(
    "",
    "Alle checks horen groen te zijn. Zo niet, dan voldoet de code van dit project niet",
    "aan een nieuwe regel; neem dan contact op met Stage Two in plaats van de check uit",
    "te zetten.",
    "",
    "Cloudflare-preview: niet van toepassing, deze wijziging raakt de app zelf niet",
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
