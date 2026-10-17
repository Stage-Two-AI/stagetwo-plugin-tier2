#!/usr/bin/env node
/**
 * Zet automatisch bijwerken van de Stage Two-plugin aan, op gebruikersniveau
 * (~/.claude/settings.json), zodat de klant nooit zelf een commando hoeft te typen.
 *
 *   node automatisch-bijwerken.mjs --json [--controle]
 *   node automatisch-bijwerken.mjs --json --uit     automatisch bijwerken uitzetten
 *   node automatisch-bijwerken.mjs --json --aan     weer aanzetten na --uit
 *
 * De plugin is software van Stage Two die met de rechten van de bouwer draait. Wil een klant
 * zelf bepalen wanneer er een nieuwe versie op zijn computer komt, dan zet --uit
 * `autoUpdate: false` op de marketplace. Een gewone run (ook die in /stagetwo-tier2:updaten)
 * respecteert dat en zet het niet stilletjes terug; alleen --aan doet dat. De plugin bijwerken
 * gaat dan met de hand, met /stagetwo-tier2:updaten (deel 1).
 *
 * Waarom dit nodig is (vastgesteld 02-10-2026 op Windows, Claude desktop-app):
 *   - De desktop-app start Claude Code met DISABLE_AUTOUPDATER=1. Dat zet ook het
 *     bijwerken van plugins uit, tenzij FORCE_AUTOUPDATE_PLUGINS=1 er ook staat.
 *   - Een marketplace die de klant zelf toevoegt, krijgt geen autoUpdate; voor een
 *     marketplace die niet van Anthropic is, staat dat standaard uit.
 * `autoUpdate` in de .claude/settings.json van een app helpt daarom niet in de
 * desktop-app, en ook niet in een lege map. Op gebruikersniveau geldt het overal.
 *
 * Het script zet precies twee dingen en laat de rest van het bestand staan:
 *   env.FORCE_AUTOUPDATE_PLUGINS = "1"
 *   extraKnownMarketplaces.stagetwo-tier2 = { source: github <plugin uit levering.json>, autoUpdate: true }
 * De bron is de leveringsrepo van de klant (levering.json, zie lib/levering.mjs), anders
 * Stage-Two-AI/stagetwo-plugin-tier2. Wijst een bestaande regel nog naar die van Stage Two
 * terwijl de klant een eigen leveringsrepo heeft, dan gaat de bron naar die leveringsrepo.
 * Een bestaande stagetwo-tier2-regel houdt zijn eigen velden; alleen autoUpdate (en een
 * ontbrekende source) wordt aangevuld. De regels van de plugin onder zijn oude naam
 * (marketplace stagetwo-cloudflare, plugin stack-cloudflare, tot 15-10-2026) haalt het weg,
 * zodat de oude plugin niet terugkomt; de rest van het bestand blijft staan. Is het bestand geen geldige JSON, dan raakt het
 * script het niet aan.
 *
 * Uitkomst: één JSON-object met `status`:
 *   al-goed   alles stond er al
 *   uit       automatisch bijwerken staat bewust uit (autoUpdate: false); er is niets geschreven
 *   uitgezet  (alleen met --uit) autoUpdate staat nu op false
 *   gezet     het bestand is aangevuld; `gewijzigd` zegt wat (werkt vanaf de volgende start)
 *   ontbreekt (alleen met --controle) wat er nog mist, in `ontbreekt`; er is niets geschreven
 *   mislukt   `reden` in één zin
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LEVERING, STAGE_TWO, instellingenPad } from "../../../lib/levering.mjs";

export const MARKETPLACE = "stagetwo-tier2";
export const BRON = Object.freeze({ source: "github", repo: LEVERING.plugin });
/** De plugin onder zijn naam van vóór 15-10-2026 (besluit tier 1 en tier 2). */
export const OUDE_MARKETPLACES = ["stagetwo-cloudflare"];
export const OUDE_PLUGINS = ["stack-cloudflare@stagetwo-cloudflare"];

/** Dezelfde plek die lib/levering.mjs leest als er geen levering.json is. */
export { instellingenPad };

/** Wijst deze bron naar de bronrepo van Stage Two (github- of git-vorm)? */
export function isBronVanStageTwo(source) {
  const doel = STAGE_TWO.plugin.toLowerCase();
  if (source?.source === "github") return String(source.repo ?? "").toLowerCase() === doel;
  if (source?.source === "git") return /github\.com[/:](.+?)(?:\.git)?\/?$/i.exec(String(source.url ?? ""))?.[1]?.toLowerCase() === doel;
  return false;
}

/** Moet de bron naar `bron` toe: ontbreekt hij, of wijst hij nog naar Stage Two terwijl er een leveringsrepo is. */
function bronMoetWeg(regel, bron) {
  if (!regel?.source) return true;
  return bron.repo.toLowerCase() !== STAGE_TWO.plugin.toLowerCase() && isBronVanStageTwo(regel.source);
}

/** Wat er aan deze instellingen ontbreekt; leeg = alles staat goed. `bron` alleen anders in tests. */
export function watOntbreekt(instellingen, bron = BRON) {
  const mist = [];
  if (instellingen?.env?.FORCE_AUTOUPDATE_PLUGINS !== "1") mist.push("env.FORCE_AUTOUPDATE_PLUGINS");
  const regel = instellingen?.extraKnownMarketplaces?.[MARKETPLACE];
  if (bronMoetWeg(regel, bron)) mist.push(`extraKnownMarketplaces.${MARKETPLACE}.source`);
  if (regel?.autoUpdate !== true) mist.push(`extraKnownMarketplaces.${MARKETPLACE}.autoUpdate`);
  for (const oud of OUDE_MARKETPLACES) {
    if (instellingen?.extraKnownMarketplaces?.[oud] !== undefined) mist.push(`weg: extraKnownMarketplaces.${oud}`);
  }
  for (const oud of OUDE_PLUGINS) {
    if (instellingen?.enabledPlugins?.[oud] !== undefined) mist.push(`weg: enabledPlugins.${oud}`);
  }
  return mist;
}

/** De aangevulde instellingen; het origineel blijft onaangeroerd. `bron` alleen anders in tests. */
export function aanvullen(instellingen, bron = BRON) {
  const uit = { ...instellingen };
  uit.env = { ...(instellingen.env ?? {}), FORCE_AUTOUPDATE_PLUGINS: "1" };
  const markten = { ...(instellingen.extraKnownMarketplaces ?? {}) };
  const regel = { ...(markten[MARKETPLACE] ?? {}) };
  if (bronMoetWeg(regel, bron)) regel.source = { ...bron };
  regel.autoUpdate = true;
  markten[MARKETPLACE] = regel;
  for (const oud of OUDE_MARKETPLACES) delete markten[oud];
  uit.extraKnownMarketplaces = markten;
  if (instellingen.enabledPlugins && OUDE_PLUGINS.some((p) => p in instellingen.enabledPlugins)) {
    const plugins = { ...instellingen.enabledPlugins };
    for (const oud of OUDE_PLUGINS) delete plugins[oud];
    uit.enabledPlugins = plugins;
  }
  return uit;
}

/** Staat automatisch bijwerken bewust uit (met --uit gezet, of door de klant zelf)? */
export function staatUit(instellingen) {
  return instellingen?.extraKnownMarketplaces?.[MARKETPLACE]?.autoUpdate === false;
}

/** De instellingen met automatisch bijwerken uit; de bron wordt zo nodig aangevuld zoals bij aanvullen. */
export function uitzetten(instellingen, bron = BRON) {
  const markten = { ...(instellingen.extraKnownMarketplaces ?? {}) };
  const regel = { ...(markten[MARKETPLACE] ?? {}) };
  if (bronMoetWeg(regel, bron)) regel.source = { ...bron };
  regel.autoUpdate = false;
  markten[MARKETPLACE] = regel;
  return { ...instellingen, extraKnownMarketplaces: markten };
}

/** Schrijft eerst naar een tijdelijk bestand en vervangt dan in één keer: nooit een half bestand. */
function schrijf(pad, instellingen) {
  mkdirSync(dirname(pad), { recursive: true });
  const tijdelijk = `${pad}.stack-${process.pid}.tmp`;
  writeFileSync(tijdelijk, `${JSON.stringify(instellingen, null, 2)}\n`);
  renameSync(tijdelijk, pad);
}

export function automatischBijwerken({ controle = false, uit = false, aan = false, env = process.env } = {}) {
  const pad = instellingenPad(env);
  let instellingen = {};
  if (existsSync(pad)) {
    const tekst = readFileSync(pad, "utf8");
    if (tekst.trim() !== "") {
      try {
        instellingen = JSON.parse(tekst);
      } catch {
        return { status: "mislukt", pad, reden: `${pad} is geen geldige JSON; dat bestand raak ik niet aan. Vraag Stage Two ernaar.` };
      }
      if (instellingen === null || typeof instellingen !== "object" || Array.isArray(instellingen)) {
        return { status: "mislukt", pad, reden: `${pad} bevat geen JSON-object; dat bestand raak ik niet aan. Vraag Stage Two ernaar.` };
      }
    }
  }
  if (uit) {
    if (staatUit(instellingen)) return { status: "uit", pad };
    if (controle) return { status: "ontbreekt", pad, ontbreekt: [`extraKnownMarketplaces.${MARKETPLACE}.autoUpdate = false`] };
    try {
      schrijf(pad, uitzetten(instellingen));
    } catch (fout) {
      return { status: "mislukt", pad, reden: `kon ${pad} niet schrijven: ${String(fout?.message ?? fout).split("\n")[0]}` };
    }
    return { status: "uitgezet", pad };
  }
  if (staatUit(instellingen) && !aan) return { status: "uit", pad };
  const ontbreekt = watOntbreekt(instellingen);
  if (ontbreekt.length === 0) return { status: "al-goed", pad };
  if (controle) return { status: "ontbreekt", pad, ontbreekt };

  try {
    schrijf(pad, aanvullen(instellingen));
  } catch (fout) {
    return { status: "mislukt", pad, reden: `kon ${pad} niet schrijven: ${String(fout?.message ?? fout).split("\n")[0]}` };
  }
  return { status: "gezet", pad, gewijzigd: ontbreekt };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv.includes("--uit") && argv.includes("--aan")) {
    process.stdout.write(`${JSON.stringify({ status: "mislukt", reden: "--uit en --aan tegelijk kan niet" })}\n`);
    process.exit(1);
  }
  const uitkomst = automatischBijwerken({ controle: argv.includes("--controle"), uit: argv.includes("--uit"), aan: argv.includes("--aan") });
  process.stdout.write(`${JSON.stringify(uitkomst, null, 2)}\n`);
  process.exitCode = uitkomst.status === "mislukt" ? 1 : 0;
}
