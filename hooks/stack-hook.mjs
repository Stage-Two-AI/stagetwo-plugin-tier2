#!/usr/bin/env node
/**
 * De hook van de plugin (U3 en U4, KTD6 en KTD7): één bestand voor PreToolUse en
 * SessionStart. hooks.json registreert hem voor beide; de regels staan in regels.mjs
 * (zuiver, getest) en de netwerkvraag in versie-op-afstand.mjs.
 *
 * De plugin draait in elke sessie van de klant, ook buiten stack-repo's. Daarom is de
 * eerste vraag altijd: heeft deze projectmap een .claude/stack-manifest.json? Zo niet,
 * dan exit 0 zonder uitvoer (R4, AE7). Staat er in dat manifest geen `variant: "cloudflare"`,
 * dan is het een app van het Vercel-spoor en doet deze plugin ook niets. Kapotte invoer is ook een no-op: een hook die
 * crasht mag nooit de sessie in de weg zitten.
 *
 * PreToolUse: beoordeelTool weigert templatebestanden en riskante Bash-opdrachten; een
 * weigering gaat als JSON (permissionDecision: deny) naar stdout, exit 0.
 *
 * SessionStart: de lokale versie komt uit .claude/stack-version; zonder versienummer
 * gebeurt er niets (geen netwerkvraag). Daarna de stempel lezen uit
 * ${CLAUDE_PLUGIN_DATA}/<eigenaar>_<repo>.json (of ~/.cache/stagetwo-tier2/); alleen
 * als de regels zeggen dat er gekeken moet worden (geen stempel of ouder dan 24 uur)
 * volgt de netwerkvraag, met een tijdslimiet van drie seconden. De melding gaat als
 * gewone tekst naar stdout en wordt zo context voor de agent; de stempel wordt alleen
 * geschreven als er een antwoord van afstand was, of als GitHub de repo weigert (dan
 * volgt een melding daarover, hooguit één keer per dag).
 *
 * Bij dezelfde dagelijkse controle, tegelijk en elk met een eigen tijdslimiet (samen binnen de
 * tien seconden van hooks.json):
 *   - is er een nieuwere versie, dan het changelog van stagetwo.nl (lib/updates.mjs), zodat de
 *     melding zegt wat er nieuw is en of er iets moet vóór een datum; zonder antwoord blijft
 *     het de melding zonder changelog;
 *   - hooguit één keer per dag per organisatie (stempel org_<eigenaar>.json) de andere apps
 *     van het bedrijf die achterlopen (lib/andere-apps.mjs, via `gh`); zonder antwoord binnen
 *     de limiet ontbreekt die regel, en morgen volgt een nieuwe poging.
 *
 * Testhaak: is STACK_VERSIE_OP_AFSTAND_TEST gezet, dan vervangt die waarde de
 * netwerkvraag ("10" telt als versie 10, "geen-toegang" als een repo die GitHub weigert,
 * elke andere waarde als null). Alleen voor de
 * tests van deze plugin; het enige wat een verkeerd gebruik oplevert is een onjuiste
 * melding in de eigen sessie. STAGETWO_UPDATES_TEST en STAGETWO_ANDERE_APPS_TEST doen
 * hetzelfde voor het changelog en de andere apps.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { andereAppsAchter, repoUitOrigin } from "../lib/andere-apps.mjs";
import { isCloudflareManifest } from "../lib/manifest.mjs";
import { haalUpdates, uitgavenTussen } from "../lib/updates.mjs";
import { beoordeelStart, beoordeelTool, meldingAndereApps, moetControleren, orgStempelNaam, stempelNaam } from "./regels.mjs";
import { bronOpAfstand } from "./versie-op-afstand.mjs";

const GIT_TIMEOUT_MS = 2000;

function leesEvent() {
  try {
    const event = JSON.parse(readFileSync(0, "utf8"));
    return event && typeof event === "object" ? event : null;
  } catch {
    return null;
  }
}

function leesJson(pad) {
  try {
    const waarde = JSON.parse(readFileSync(pad, "utf8"));
    return waarde && typeof waarde === "object" ? waarde : null;
  } catch {
    return null;
  }
}

/** De lokale versie uit .claude/stack-version als klein geheel getal, anders null. */
function leesVersie(projectmap) {
  try {
    const tekst = readFileSync(join(projectmap, ".claude", "stack-version"), "utf8").trim();
    return /^\d{1,6}$/.test(tekst) ? Number(tekst) : null;
  } catch {
    return null;
  }
}

function originUrl(projectmap) {
  try {
    return execFileSync("git", ["-C", projectmap, "remote", "get-url", "origin"], {
      encoding: "utf8",
      timeout: GIT_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

function stempelMap() {
  return process.env.CLAUDE_PLUGIN_DATA || join(process.env.HOME || homedir(), ".cache", "stagetwo-tier2");
}

function bronOpAfstandOfTesthaak() {
  const test = process.env.STACK_VERSIE_OP_AFSTAND_TEST;
  if (test !== undefined) {
    if (test === "geen-toegang") return { repo: "Test/template", versie: null, fout: "geen-toegang" };
    return { repo: "Test/template", versie: /^\d{1,6}$/.test(test) ? Number(test) : null, fout: null };
  }
  return bronOpAfstand();
}

function schrijfStempel(map, pad, stempel) {
  try {
    mkdirSync(map, { recursive: true });
    writeFileSync(pad, `${JSON.stringify(stempel)}\n`);
  } catch {
    // Geen stempel kunnen schrijven betekent hooguit morgen nog een keer kijken.
  }
}

/** De andere apps die achterlopen, hooguit één keer per dag per organisatie; anders null. */
async function andereApps({ map, origin, doel, nu }) {
  const huidige = repoUitOrigin(origin);
  if (!huidige) return null;
  const eigenaar = huidige.split("/")[0];
  const pad = join(map, `${orgStempelNaam(eigenaar)}.json`);
  if (!moetControleren({ stempel: leesJson(pad), nu })) return null;
  // De stempel komt er ook als het niet lukt: morgen opnieuw, niet bij elke sessie.
  schrijfStempel(map, pad, { tijdstip: nu.toISOString() });
  return andereAppsAchter({ eigenaar, huidige, doel });
}

async function sessieStart(projectmap) {
  const versieLokaal = leesVersie(projectmap);
  if (versieLokaal === null) return;

  const map = stempelMap();
  const origin = originUrl(projectmap);
  const stempelPad = join(map, `${stempelNaam({ origin, projectmap })}.json`);
  const stempel = leesJson(stempelPad);
  const nu = new Date();
  if (!moetControleren({ stempel, nu })) return;

  const opAfstand = bronOpAfstandOfTesthaak();
  const doel = opAfstand.versie;
  const nieuwer = Number.isSafeInteger(doel) && doel > versieLokaal;
  const [updates, achter] = await Promise.all([
    nieuwer ? haalUpdates() : null,
    Number.isSafeInteger(doel) ? andereApps({ map, origin, doel, nu }) : null,
  ]);
  const { melding, nieuweStempel } = beoordeelStart({
    versieLokaal,
    versieOpAfstand: doel,
    bronFout: opAfstand.fout,
    bron: opAfstand.repo,
    stempel,
    nu,
    uitgaven: uitgavenTussen(updates, { van: versieLokaal, tot: doel }),
  });
  if (nieuweStempel) schrijfStempel(map, stempelPad, nieuweStempel);
  const regels = [melding, meldingAndereApps({ apps: achter, dezeAppBij: !nieuwer })].filter(Boolean);
  if (regels.length > 0) process.stdout.write(`${regels.join("\n\n")}\n`);
}

function preToolUse(projectmap, manifest, event) {
  const { weiger, reden, context } = beoordeelTool({
    projectmap,
    manifest,
    toolName: event.tool_name,
    toolInput: event.tool_input,
    env: process.env,
  });
  if (!weiger) {
    // Alleen context, geen permissionDecision: de gewone toestemmingsvraag blijft staan.
    if (context) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: context } }));
    return;
  }
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reden,
      },
    }),
  );
}

async function main() {
  const event = leesEvent();
  if (!event) return;
  const projectmap = process.env.CLAUDE_PROJECT_DIR || event.cwd;
  if (typeof projectmap !== "string" || !projectmap) return;
  const manifest = leesJson(join(projectmap, ".claude", "stack-manifest.json"));
  if (!manifest) return;
  // Een app van het Vercel-spoor is voor de andere Stage Two-plugin, niet voor deze.
  if (!isCloudflareManifest(manifest)) return;

  if (event.hook_event_name === "SessionStart") await sessieStart(projectmap);
  else if (event.hook_event_name === "PreToolUse") preToolUse(projectmap, manifest, event);
}

try {
  await main();
} catch {
  // Nooit in de weg lopen: elke onverwachte fout is een no-op.
}
process.exitCode = 0;
