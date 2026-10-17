#!/usr/bin/env node
/**
 * Het werk achter de workflow Levering stoppen: haalt bij het einde van een abonnement de GitHub
 * App `stagetwo-levering` weg uit de org van de klant. Zo heeft Stage Two daarna ook geen
 * schrijfrecht meer op de twee leveringsrepo's van de klant (voorwaarden 1.1, art. 18.6).
 *
 *   node beheer/levering-stoppen.mjs --org <klantorg> [--droog]
 *
 * Volgorde bij opzeggen: eerst de klant uit abonnees.json (pull request, merge), dan deze
 * workflow. Staat de org nog in abonnees.json, dan stopt het script vóór er iets gebeurt;
 * anders zou de volgende run van Uitleveren mislukken op een klant zonder App. De org van
 * Stage Two zelf weigert het ook: daar leest Uitleveren de template mee.
 *
 * Hoe: met de App-sleutel (LEVERING_APP_ID en LEVERING_APP_PRIVATE_KEY in de omgeving, dezelfde
 * variabele en hetzelfde geheim als Uitleveren) maakt het script een JWT van de App. Uitleveren
 * gebruikt actions/create-github-app-token, maar dat geeft alleen een token voor één
 * installatie; deze twee aanroepen vragen de App zelf (JWT, RS256, tien minuten geldig):
 *   GET    /orgs/{org}/installation           de installatie in die org
 *   DELETE /app/installations/{id}            de installatie verwijderen
 * Met --droog alleen de eerste: het zegt wat er weg zou gaan.
 *
 * De leveringsrepo's zelf blijven staan, op de laatste versie: die zijn van de klant. Een App die
 * er al niet meer staat (de klant haalde hem zelf weg) is goed: status `niet-geinstalleerd`.
 * Dezelfde App levert tier 1 en tier 2; heeft een klant beide, dan gaat hij voor beide weg.
 *
 * Uitkomst: één JSON-object met `status`:
 *   gestopt              de installatie is verwijderd
 *   zou-stoppen          (--droog) de installatie die weg zou gaan
 *   niet-geinstalleerd   de App staat niet in die org; niets te doen
 *   mislukt              `reden` in één zin
 * Dit script gaat niet mee naar een klant (ALLEEN_IN_BRON in uitleveren.mjs).
 */
import { createSign } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { STAGE_TWO } from "../lib/levering.mjs";
import { leesAbonnees } from "./uitleveren.mjs";

export const API = "https://api.github.com";
export const STAGE_TWO_ORG = STAGE_TWO.plugin.split("/")[0];
const ORG_VORM = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

const base64url = (data) => Buffer.from(data).toString("base64url");

/** Een JWT van de App: iat een minuut terug (klokverschil), exp na negen minuten (GitHub: hooguit tien). */
export function maakJwt({ appId, sleutel, nu = Math.floor(Date.now() / 1000) }) {
  const kop = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const inhoud = base64url(JSON.stringify({ iat: nu - 60, exp: nu + 540, iss: String(appId) }));
  const ondertekenaar = createSign("RSA-SHA256");
  ondertekenaar.update(`${kop}.${inhoud}`);
  return `${kop}.${inhoud}.${ondertekenaar.sign(sleutel, "base64url")}`;
}

export function leesOpties(argv) {
  const uit = { org: null, droog: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--droog") uit.droog = true;
    else if (a === "--org") uit.org = argv[++i] ?? null;
    else throw new Error(`onbekend argument: ${a}`);
  }
  return uit;
}

/** Waarom deze org niet mag, of null. */
export function weigering(org, abonnees) {
  if (!ORG_VORM.test(org ?? "")) return "geef de GitHub-org van de klant mee (invoer org), bijvoorbeeld Richplant-BV";
  if (org.toLowerCase() === STAGE_TWO_ORG.toLowerCase()) return `${STAGE_TWO_ORG} is de org van Stage Two zelf; daar blijft de App staan`;
  if (abonnees.some((a) => String(a).toLowerCase() === org.toLowerCase())) {
    return `${org} staat nog in abonnees.json; haal de klant daar eerst uit (pull request, merge) en start daarna Levering stoppen opnieuw`;
  }
  return null;
}

async function vraag(fetchFn, methode, pad, jwt) {
  const antwoord = await fetchFn(`${API}${pad}`, {
    method: methode,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${jwt}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "stagetwo-levering-stoppen",
    },
  });
  const tekst = await antwoord.text();
  let data = null;
  try {
    data = tekst ? JSON.parse(tekst) : null;
  } catch {
    data = null;
  }
  return { status: antwoord.status, data };
}

export async function stopLevering({ org, droog = false, appId, sleutel, abonnees, fetchFn = fetch, nu } = {}) {
  const nee = weigering(org, abonnees);
  if (nee) return { status: "mislukt", org, reden: nee };
  if (!appId || !sleutel) {
    return { status: "mislukt", org, reden: "LEVERING_APP_ID of LEVERING_APP_PRIVATE_KEY ontbreekt; zet ze zoals voor Uitleveren (recept github-app-levering, deel A)" };
  }
  let jwt;
  try {
    jwt = maakJwt({ appId, sleutel, nu });
  } catch (fout) {
    return { status: "mislukt", org, reden: `de App-sleutel is niet te gebruiken: ${String(fout?.message ?? fout).split("\n")[0]}` };
  }
  let gevonden;
  try {
    gevonden = await vraag(fetchFn, "GET", `/orgs/${org}/installation`, jwt);
  } catch (fout) {
    return { status: "mislukt", org, reden: `GitHub is niet te bereiken: ${String(fout?.message ?? fout).split("\n")[0]}` };
  }
  if (gevonden.status === 404) return { status: "niet-geinstalleerd", org };
  if (gevonden.status !== 200 || !Number.isInteger(gevonden.data?.id)) {
    return { status: "mislukt", org, reden: `de installatie opvragen gaf HTTP ${gevonden.status}${gevonden.data?.message ? `: ${gevonden.data.message}` : ""}` };
  }
  const installatie = {
    id: gevonden.data.id,
    account: gevonden.data.account?.login ?? org,
    repos: gevonden.data.repository_selection ?? null,
  };
  if (droog) return { status: "zou-stoppen", org, installatie };
  let weg;
  try {
    weg = await vraag(fetchFn, "DELETE", `/app/installations/${installatie.id}`, jwt);
  } catch (fout) {
    return { status: "mislukt", org, installatie, reden: `GitHub is niet te bereiken: ${String(fout?.message ?? fout).split("\n")[0]}` };
  }
  if (weg.status !== 204) {
    return { status: "mislukt", org, installatie, reden: `verwijderen gaf HTTP ${weg.status}${weg.data?.message ? `: ${weg.data.message}` : ""}` };
  }
  return { status: "gestopt", org, installatie };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let uitkomst;
  try {
    const opties = leesOpties(process.argv.slice(2));
    uitkomst = await stopLevering({
      ...opties,
      appId: process.env.LEVERING_APP_ID,
      sleutel: process.env.LEVERING_APP_PRIVATE_KEY,
      abonnees: leesAbonnees(),
    });
  } catch (fout) {
    uitkomst = { status: "mislukt", reden: String(fout?.message ?? fout).split("\n")[0] };
  }
  process.stdout.write(`${JSON.stringify(uitkomst)}\n`);
  process.exitCode = uitkomst.status === "mislukt" ? 1 : 0;
}
