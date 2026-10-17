#!/usr/bin/env node
/**
 * Zet automatisch bijwerken van de Stage Two-plugin aan, op gebruikersniveau, zodat de klant
 * nooit zelf een commando hoeft te typen. Of uit, als de klant dat wil.
 *
 *   node automatisch-bijwerken.mjs --json [--controle]
 *   node automatisch-bijwerken.mjs --json --uit     automatisch bijwerken uitzetten
 *   node automatisch-bijwerken.mjs --json --aan     weer aanzetten na --uit
 *
 * Hoe Claude Code beslist of een marketplace zichzelf bijwerkt (documentatie, gecontroleerd
 * 17-10-2026 op code.claude.com/docs/en/plugins/loading, "When auto-update runs", en
 * settings-reference, "extraKnownMarketplaces"):
 *   1. `autoUpdate` op de regel in extraKnownMarketplaces. Staat dezelfde marketplace in meer
 *      instellingenbestanden, dan geldt de regel uit het bestand met de hoogste voorrang in
 *      zijn geheel (projectinstellingen gaan voor gebruikersinstellingen); hij erft geen
 *      velden van de andere. Een app met `autoUpdate` in zijn .claude/settings.json wint dus
 *      altijd van de keuze van de gebruiker. Daarom staat `autoUpdate` sinds template v22
 *      (tier 1: v25) niet meer in de app.
 *   2. Staat het daar niet, dan `autoUpdate` in ~/.claude/plugins/known_marketplaces.json
 *      (wat de schakelaar in /plugin, tabblad Marketplaces, schrijft). Dat is wat geldt in een
 *      app, want de regel van de app heeft geen autoUpdate.
 *   3. Anders de standaard: uit, voor elke marketplace die niet van Anthropic is.
 *   Met DISABLE_AUTOUPDATER=1 (zo start de desktop-app Claude Code) slaat Claude Code het
 *   bijwerken van alle plugins over, tenzij FORCE_AUTOUPDATE_PLUGINS=1 er ook staat.
 *
 * Aan (gewone run en --aan) zet daarom drie dingen en laat de rest staan:
 *   env.FORCE_AUTOUPDATE_PLUGINS = "1"                          in ~/.claude/settings.json
 *   extraKnownMarketplaces.stagetwo-tier2 = { source: github <plugin uit levering.json>, autoUpdate: true }
 *   autoUpdate: true op stagetwo-tier2 in known_marketplaces.json (alleen als Claude Code die
 *     regel al heeft; het script maakt daar nooit zelf een regel aan)
 * Uit (--uit) zet autoUpdate op beide plekken op false en haalt FORCE_AUTOUPDATE_PLUGINS weg.
 * Dat laatste raakt alle plugins op deze computer: in de desktop-app werken dan ook andere
 * plugins zich niet meer vanzelf bij. Het zorgt ook dat een oudere app die nog
 * `autoUpdate: true` meebrengt, in de desktop-app niets meer bijwerkt. --aan zet alles terug.
 * Een gewone run (ook die in /stagetwo-tier2:updaten) respecteert --uit en zet het niet
 * stilletjes terug. De plugin bijwerken gaat dan met de hand, met /stagetwo-tier2:updaten
 * (deel 1).
 *
 * De bron is de leveringsrepo van de klant (levering.json, zie lib/levering.mjs), anders
 * Stage-Two-AI/stagetwo-plugin-tier2. Wijst een bestaande regel nog naar die van Stage Two
 * terwijl de klant een eigen leveringsrepo heeft, dan gaat de bron naar die leveringsrepo.
 * Een bestaande stagetwo-tier2-regel houdt zijn eigen velden; alleen autoUpdate (en een
 * ontbrekende source) wordt aangevuld. De regels van de plugin onder zijn oude naam
 * (marketplace stagetwo-cloudflare, plugin stack-cloudflare, tot 15-10-2026) haalt het weg, zodat de
 * oude plugin niet terugkomt. Andere marketplaces (zoals stagetwo-tier1) blijven onaangeroerd.
 * Is een bestand geen geldige JSON, dan raakt het script het niet aan.
 *
 * Uitkomst: één JSON-object met `status`:
 *   al-goed   alles stond er al
 *   uit       automatisch bijwerken staat bewust uit; er is niets geschreven
 *   uitgezet  (alleen met --uit) het staat nu uit; `gewijzigd` zegt wat
 *   gezet     het is aangevuld; `gewijzigd` zegt wat (werkt vanaf de volgende start)
 *   ontbreekt (alleen met --controle) wat er nog mist, in `ontbreekt`; er is niets geschreven
 *   mislukt   `reden` in één zin
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
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

/** Wat --uit nog moet doen in de gebruikersinstellingen; leeg = staat al uit. */
export function watNogAanStaat(instellingen) {
  const aan = [];
  if (!staatUit(instellingen)) aan.push(`extraKnownMarketplaces.${MARKETPLACE}.autoUpdate = false`);
  if (instellingen?.env && "FORCE_AUTOUPDATE_PLUGINS" in instellingen.env) aan.push("weg: env.FORCE_AUTOUPDATE_PLUGINS");
  return aan;
}

/**
 * De instellingen met automatisch bijwerken uit: autoUpdate false (de bron wordt zo nodig
 * aangevuld zoals bij aanvullen) en FORCE_AUTOUPDATE_PLUGINS weg. Dat laatste geldt voor alle
 * plugins op de computer; zie de uitleg bovenaan.
 */
export function uitzetten(instellingen, bron = BRON) {
  const markten = { ...(instellingen.extraKnownMarketplaces ?? {}) };
  const regel = { ...(markten[MARKETPLACE] ?? {}) };
  if (bronMoetWeg(regel, bron)) regel.source = { ...bron };
  regel.autoUpdate = false;
  markten[MARKETPLACE] = regel;
  const uit = { ...instellingen, extraKnownMarketplaces: markten };
  if (instellingen.env && "FORCE_AUTOUPDATE_PLUGINS" in instellingen.env) {
    const { FORCE_AUTOUPDATE_PLUGINS: _weg, ...rest } = instellingen.env;
    if (Object.keys(rest).length === 0) delete uit.env;
    else uit.env = rest;
  }
  return uit;
}

/** ~/.claude/plugins/known_marketplaces.json, of die in CLAUDE_CONFIG_DIR. */
export function bekendePad(env = process.env) {
  return join(dirname(instellingenPad(env)), "plugins", "known_marketplaces.json");
}

/**
 * Moet autoUpdate in known_marketplaces.json naar `waarde`? Alleen als Claude Code daar al een
 * regel voor de marketplace heeft; het script maakt er nooit een aan.
 */
export function bekendeMoetNaar(bekend, waarde) {
  const regel = bekend?.[MARKETPLACE];
  return regel !== null && typeof regel === "object" && !Array.isArray(regel) && regel.autoUpdate !== waarde;
}

/** known_marketplaces.json met autoUpdate op `waarde` voor de marketplace; de rest blijft staan. */
export function bekendeMet(bekend, waarde) {
  return { ...bekend, [MARKETPLACE]: { ...bekend[MARKETPLACE], autoUpdate: waarde } };
}

/** Schrijft eerst naar een tijdelijk bestand en vervangt dan in één keer: nooit een half bestand. */
function schrijf(pad, instellingen) {
  mkdirSync(dirname(pad), { recursive: true });
  const tijdelijk = `${pad}.stack-${process.pid}.tmp`;
  writeFileSync(tijdelijk, `${JSON.stringify(instellingen, null, 2)}\n`);
  renameSync(tijdelijk, pad);
}

/** Leest een JSON-object; { data } of { fout }. Geen of een leeg bestand is {}. */
function leesObject(pad) {
  if (!existsSync(pad)) return { data: {} };
  const tekst = readFileSync(pad, "utf8");
  if (tekst.trim() === "") return { data: {} };
  let data;
  try {
    data = JSON.parse(tekst);
  } catch {
    return { fout: `${pad} is geen geldige JSON; dat bestand raak ik niet aan. Vraag Stage Two ernaar.` };
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { fout: `${pad} bevat geen JSON-object; dat bestand raak ik niet aan. Vraag Stage Two ernaar.` };
  }
  return { data };
}

const BEKEND_VELD = `known_marketplaces.${MARKETPLACE}.autoUpdate`;

export function automatischBijwerken({ controle = false, uit = false, aan = false, env = process.env } = {}) {
  const pad = instellingenPad(env);
  const gelezen = leesObject(pad);
  if (gelezen.fout) return { status: "mislukt", pad, reden: gelezen.fout };
  const instellingen = gelezen.data;
  // known_marketplaces.json is van Claude Code zelf: kapot of afwezig is geen fout, dan blijft het staan.
  const bekendPad = bekendePad(env);
  const bekend = existsSync(bekendPad) ? (leesObject(bekendPad).data ?? null) : null;

  const schrijfAlles = (nieuweInstellingen, bekendWaarde) => {
    try {
      if (nieuweInstellingen) schrijf(pad, nieuweInstellingen);
      if (bekend && bekendeMoetNaar(bekend, bekendWaarde)) schrijf(bekendPad, bekendeMet(bekend, bekendWaarde));
      return null;
    } catch (fout) {
      return { status: "mislukt", pad, reden: `kon de instellingen niet schrijven: ${String(fout?.message ?? fout).split("\n")[0]}` };
    }
  };

  if (uit) {
    const nogAan = watNogAanStaat(instellingen);
    if (bekendeMoetNaar(bekend, false)) nogAan.push(`${BEKEND_VELD} = false`);
    if (nogAan.length === 0) return { status: "uit", pad };
    if (controle) return { status: "ontbreekt", pad, ontbreekt: nogAan };
    const mislukt = schrijfAlles(watNogAanStaat(instellingen).length ? uitzetten(instellingen) : null, false);
    return mislukt ?? { status: "uitgezet", pad, gewijzigd: nogAan };
  }
  if (staatUit(instellingen) && !aan) return { status: "uit", pad };
  const ontbreekt = watOntbreekt(instellingen);
  const bekendOntbreekt = bekendeMoetNaar(bekend, true);
  if (ontbreekt.length === 0 && !bekendOntbreekt) return { status: "al-goed", pad };
  const gewijzigd = bekendOntbreekt ? [...ontbreekt, BEKEND_VELD] : ontbreekt;
  if (controle) return { status: "ontbreekt", pad, ontbreekt: gewijzigd };
  const mislukt = schrijfAlles(ontbreekt.length ? aanvullen(instellingen) : null, true);
  return mislukt ?? { status: "gezet", pad, gewijzigd };
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
