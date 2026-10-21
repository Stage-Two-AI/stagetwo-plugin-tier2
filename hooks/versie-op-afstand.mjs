/**
 * De netwerkvraag van de sessiehook (U4, KTD5): de nieuwste versie van de template is de
 * hoogste tag `stack-v<n>`, gelezen met één anonieme `git ls-remote --tags`. Dit staat
 * apart van regels.mjs zodat de regels zuiver blijven; `exec` is injecteerbaar zodat de
 * tests geen netwerk nodig hebben.
 *
 * GIT_TERMINAL_PROMPT=0 zorgt dat git nooit om een login vraagt (een privé template of
 * een verkeerde reponaam geeft dan meteen een fout). Een credential helper (zoals die van
 * `gh auth setup-git`) werkt wel; zo leest Stage Two zijn eigen afgeschermde template.
 *
 * Twee soorten fout (bronOpAfstand):
 *   geen-toegang     GitHub weigert of kent de repo niet (privé, weg, verkeerde naam). Dat
 *                    gaat niet vanzelf over: na het afschermen van de bronrepo is dit een app
 *                    die nog niet op de kopie van de klant staat. De hook meldt het, één keer
 *                    per dag (hooks/regels.mjs), in plaats van stil te blijven.
 *   geen-verbinding  geen netwerk, een time-out of iets onbekends: stil, morgen opnieuw.
 * Een antwoord zonder stack-tag geeft versie null zonder fout.
 */
import { execFileSync } from "node:child_process";
import { LEVERING } from "../lib/levering.mjs";

/** De tags van de leveringsrepo van de klant: stopt het abonnement, dan komt er niets meer bij. */
export const STANDAARD_REPO = LEVERING.template;

/** Alleen `eigenaar/repo`, zodat een vreemde waarde in STACK_TEMPLATE_REPO geen rare URL wordt. */
const REPO_VORM = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/**
 * De hoogste `n` uit regels `<sha>\trefs/tags/stack-v<n>` (ook met `^{}` erachter, de
 * ontdane vorm van een geannoteerde tag), als klein geheel getal; anders null.
 */
export function hoogsteStackVersie(uitvoer) {
  if (typeof uitvoer !== "string") return null;
  let hoogste = null;
  for (const regel of uitvoer.split(/\r?\n/)) {
    const m = /\trefs\/tags\/stack-v(\d{1,6})(?:\^\{\})?$/.exec(regel);
    if (!m) continue;
    const n = Number(m[1]);
    if (hoogste === null || n > hoogste) hoogste = n;
  }
  return hoogste;
}

function standaardExec(cmd, args, opties) {
  return execFileSync(cmd, args, opties);
}

/** GitHub weigert of kent de repo niet: dat gaat niet vanzelf over. */
const GEEN_TOEGANG = /repository not found|could not read username|terminal prompts disabled|authentication failed|returned error: (?:401|403|404)/i;

/** Welke soort fout: `geen-toegang` of `geen-verbinding` (ook voor een time-out en onbekend). */
export function soortFout(fout) {
  if (fout?.code === "ETIMEDOUT" || fout?.signal) return "geen-verbinding";
  const tekst = `${fout?.stderr ?? ""}\n${fout?.message ?? ""}`;
  return GEEN_TOEGANG.test(tekst) ? "geen-toegang" : "geen-verbinding";
}

/**
 * De versie op afstand met de reden als hij er niet is: `{ repo, versie, fout }`, met `fout`
 * null, "geen-toegang" of "geen-verbinding". `repo` komt standaard uit STACK_TEMPLATE_REPO
 * (alleen voor tests en de bewijsronde bedoeld); `timeoutMs` is de tijdslimiet van de hele
 * git-aanroep (KTD7: drie seconden).
 */
export function bronOpAfstand({
  repo = process.env.STACK_TEMPLATE_REPO ?? STANDAARD_REPO,
  timeoutMs = 3000,
  exec = standaardExec,
} = {}) {
  if (!REPO_VORM.test(repo)) return { repo, versie: null, fout: null };
  try {
    const uit = exec("git", ["ls-remote", "--tags", `https://github.com/${repo}`], {
      encoding: "utf8",
      timeout: timeoutMs,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    return { repo, versie: hoogsteStackVersie(String(uit)), fout: null };
  } catch (fout) {
    return { repo, versie: null, fout: soortFout(fout) };
  }
}

/** Alleen de versie, of null. */
export function versieOpAfstand(opties = {}) {
  return bronOpAfstand(opties).versie;
}
