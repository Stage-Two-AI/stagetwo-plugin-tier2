#!/usr/bin/env node
/**
 * Het script achter het templatedeel van /stagetwo-tier2:updaten: brengt de app van de klant naar de nieuwste
 * versie van de Stage Two-template, als pull request van de klant zelf. Twee aanroepen
 * per ronde (KTD9), allebei vanuit de open checkout van de klant:
 *
 *   node bijwerken.mjs --json --droogloop [--repo <eigenaar>/<naam>]
 *       voorcontrole, tijdelijke kloon van de app en van de template (op de tag van de
 *       doelversie), branch stack-bijwerken/v<n>, de kern toepassen; niets gepusht.
 *       Het resultaat bevat `werkmap` voor de tweede aanroep.
 *
 *   node bijwerken.mjs --json --werkmap <map> [--los-op <pad> template|eigen]... [--kop <pad> <kop>]...
 *       keuzes voor overgeslagen bestanden toepassen, de koppen van de onderdelen invullen
 *       (alleen als de droogloop src/onderdelen.ts heeft neergezet), de A/B-tests die Claude
 *       tussen de twee aanroepen schreef toelaten (alleen de paden uit `abTests` van de
 *       droogloop; lib/abtests.mjs), committen met de identiteit uit de checkout, pushen als
 *       de boom verschilt, de verplichte controle "Droogloop migraties" in de ruleset zetten
 *       (lib/controles.mjs), de pull request openen of bijwerken.
 *
 * Met --repo werkt het script een andere app van de klant bij, zonder dat die op deze
 * computer staat: dezelfde route, alleen komt de kloon dan rechtstreeks van GitHub
 * (via de gh-login) in plaats van via de origin van de open map.
 *
 * Alleen voor de werkplaats van Stage Two (de skill noemt het niet voor bouwers):
 *
 *   node bijwerken.mjs --json --droogloop --template-ref <branch> [--repo <eigenaar>/<naam>]
 *       een proef van een uitgave die nog niet uit is: de template komt van die branch in
 *       plaats van de hoogste tag, het doel is .claude/stack-version op die branch, de branch
 *       in de app heet stack-proef/v<n> en de pull request zegt bovenaan dat hij na de merge
 *       van de uitgave vervangen wordt door de echte update. Het vorige manifest komt nog
 *       steeds uit de tag stack-v<van>. De tweede aanroep (--werkmap) is gelijk; die leest
 *       de proef uit de toestand van de droogloop.
 *
 * De open checkout van de klant wordt nooit gewijzigd (KTD4): alles gebeurt in een
 * tijdelijke map met rechten 0700, die na de tweede aanroep en bij elke mislukking
 * verdwijnt. Er komt geen token van Stage Two aan te pas: de kloon van de app loopt met
 * de eigen login van de klant (gh of ssh), de template komt anoniem binnen (KTD5).
 *
 * Elke uitkomst is één JSON-object op stdout met een `status`:
 *   bij            de app staat al op de nieuwste versie
 *   geen-template  deze repo is niet uit de template gebouwd
 *   klaar          (na --droogloop) de werkkopie staat klaar; zie bijgewerkt, overgeslagen
 *   gepusht        (na --werkmap) de branch staat op GitHub; zie pr of vergelijkUrl
 *   gestopt        er is een reden om niet door te gaan (bijvoorbeeld een branch waar
 *                  iemand zelf op heeft gecommit)
 *   mislukt        een voorwaarde ontbreekt; `reden` is één zin met één handeling
 * De reden bevat nooit een token: een URL met login wordt afgeplakt.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { controleer as controleerAbTests, openNaAntwoord, STACK_CONFIG as AB_CONFIG } from "../../../lib/abtests.mjs";
import { zetVerplichteControle } from "../../../lib/controles.mjs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isCloudflareManifest, leesManifest, toegestaan as toegestaneBestandenVan } from "../../../lib/manifest.mjs";
import { BEVESTIGING, branchNaam, prTekst, prTitel, sluitTekst } from "../../../lib/pr-tekst.mjs";
import { haalUpdates, uitgavenTussen } from "../../../lib/updates.mjs";
import {
  alGelijkOpGitHub,
  branchHerbouwbaar,
  checkoutTag,
  commit,
  eersteRegel,
  gewijzigdePaden,
  ghAanwezig,
  ghIngelogd,
  git,
  gitIdentiteit,
  gitVoorKern,
  hoogsteTagVersie,
  kloonRepo,
  kloonTemplate,
  maakBranch,
  openOfWerkPRBij,
  openPRVoorVersie,
  originPushUrl,
  originUrl,
  nodeVoorKern,
  pnpmVoorKern,
  push,
  pushDroog,
  repoUitUrl,
  sh,
  sluitOuderePRs,
  vergelijkUrl,
  versieOpAfstand,
} from "../../../lib/repo.mjs";
import { controleerOpenTabellen, controleerSmal, controleerTestrol, zetKoppen } from "../../../lib/projectbestanden.mjs";
import { LOCKFILE, MANIFEST_PAD, leesVersie, pasToe } from "../../../lib/toepassen.mjs";
import { LEVERING, TEMPLATE_GEWOON, TEMPLATE_OPENBAAR, manifestTemplate, openbaarNietBereikbaar, templateBron, templateOmschrijving, templateVan, variantVan } from "../../../lib/levering.mjs";

export const WERKMAP_PREFIX = "stack-bijwerken-";
const WERKMAP_MAX_LEEFTIJD_MS = 60 * 60 * 1000;
const TOESTAND = "toestand.json";

// ---------------------------------------------------------------- argumenten

export function leesArgumenten(argv) {
  const uit = { json: false, droogloop: false, werkmap: null, losOp: [], koppen: {}, checkout: null, repo: null, templateRef: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") uit.json = true;
    else if (a === "--droogloop") uit.droogloop = true;
    else if (a === "--werkmap") uit.werkmap = argv[++i] ?? null;
    else if (a === "--checkout") uit.checkout = argv[++i] ?? null;
    else if (a === "--repo") uit.repo = argv[++i] ?? null;
    else if (a === "--template-ref") uit.templateRef = argv[++i] ?? "";
    else if (a === "--los-op") {
      uit.losOp.push({ pad: argv[++i] ?? null, keuze: argv[++i] ?? null });
    } else if (a === "--kop") {
      const pad = argv[++i] ?? "";
      uit.koppen[pad] = argv[++i] ?? "";
    } else throw new Error(`onbekend argument: ${a}`);
  }
  return uit;
}

// ---------------------------------------------------------------- hulpjes

/** Een URL met login (https://gebruiker:token@host) mag nooit in een uitkomst staan. */
export function zonderLogin(tekst) {
  return String(tekst).replace(/(https?:\/\/)[^\s/@]+@/g, "$1***@");
}

function mislukt(reden) {
  return { status: "mislukt", reden: zonderLogin(reden) };
}

function gestopt(reden, extra = {}) {
  return { status: "gestopt", reden: zonderLogin(reden), ...extra };
}

function verwijderWerkmap(map) {
  if (!map) return;
  try {
    rmSync(map, { recursive: true, force: true });
  } catch {
    // niet erg: de tijdelijke map van de computer ruimt het op
  }
}

function leesToestand(werkmap) {
  return JSON.parse(readFileSync(join(werkmap, TOESTAND), "utf8"));
}

/**
 * Alleen een map die dit script zelf heeft gemaakt, en niet ouder dan een uur. Geeft
 * `{ fout, eigen }`: `fout` is de reden om te weigeren (of null), `eigen` is true zodra
 * vaststaat dat de map van dit script is; dan mag de aanroeper hem ook opruimen.
 */
export function controleerWerkmap(werkmap, { tmp = tmpdir(), nu = Date.now() } = {}) {
  if (typeof werkmap !== "string" || !werkmap) return { fout: "geef --werkmap de map uit de droogloop mee", eigen: false };
  const echt = echtPad(werkmap);
  const basis = echtPad(tmp);
  if (dirname(echt) !== basis || !echt.slice(basis.length + 1).startsWith(WERKMAP_PREFIX)) {
    return { fout: "de werkmap ligt niet in de tijdelijke map van deze computer; gebruik de map uit de droogloop", eigen: false };
  }
  if (!existsSync(join(echt, TOESTAND))) return { fout: "de werkmap is geen droogloop van dit script; draai eerst --droogloop", eigen: false };
  const leeftijd = nu - statSync(join(echt, TOESTAND)).mtimeMs;
  if (leeftijd > WERKMAP_MAX_LEEFTIJD_MS) return { fout: "de droogloop is ouder dan een uur; draai --droogloop opnieuw", eigen: true };
  return { fout: null, eigen: true };
}

/**
 * De echte padnaam, of het pad zoals het is als het niet bestaat. Op Windows is tmpdir() vaak de
 * korte vorm (C:\Users\BART-W~1\...), op macOS een symlink (/var naar /private/var); pnpm rekent
 * met de echte naam en zag de kopie anders als een tweede app (zie vreemdeImporters).
 */
function echtPad(pad) {
  try {
    return realpathSync.native(resolve(pad));
  } catch {
    return resolve(pad);
  }
}

/** Het verschil tussen het bestand in de app en dat in de template, als tekst voor de bouwer. */
function verschil(kloon, tmplMap, pad, maxRegels = 200) {
  try {
    git(kloon, "diff", "--no-index", "--", join(kloon, pad), join(tmplMap, pad));
    return "";
  } catch (fout) {
    const regels = String(fout.stdout ?? "").split("\n");
    return regels.length > maxRegels ? `${regels.slice(0, maxRegels).join("\n")}\n... (ingekort)` : regels.join("\n");
  }
}

// ---------------------------------------------------------------- de droogloop

const GEEN_TEMPLATE = {
  status: "geen-template",
  reden: "deze repo heeft geen .claude/stack-version en .claude/stack-manifest.json en is dus niet uit de Stage Two-template gebouwd",
};

function isTemplateApp(map) {
  return existsSync(join(map, MANIFEST_PAD)) && leesVersie(map) !== null;
}

/**
 * Een app van een ander spoor: zeg welke plugin hem wel bijwerkt. Geen `variant` is het
 * Vercel-spoor, `"light"` de template voor tier 1 (één Worker met D1 en R2).
 */
export function anderSpoor(manifest) {
  const variant = manifest && typeof manifest === "object" ? manifest.variant : undefined;
  const reden =
    variant === "light"
      ? "deze app komt uit de template voor tier 1 van Stage Two (één Cloudflare Worker met D1 en R2); die werk je bij met /stagetwo-tier1:updaten van de andere Stage Two-plugin, niet met deze"
      : variant === undefined || variant === null
        ? "deze app komt uit een oudere template van Stage Two die deze plugin niet bijwerkt; hij blijft werken zoals hij is. Overstappen naar tier 2 is herbouwen: zet het met Claude op een rij in /stagetwo-tier2:verder-werken (wie dat liever uitbesteedt, kan het als betaald werk door Stage Two laten doen)"
        : `deze app heeft variant ${JSON.stringify(variant)} in .claude/stack-manifest.json en is niet van tier 2; deze plugin werkt alleen apps uit de template voor tier 2 bij`;
  return { status: "ander-spoor", reden };
}

/**
 * Uit welke template de app in `map` komt (lib/levering.mjs, manifestTemplate): `{ template }` of
 * `{ fout }`. react-router.config.ts is het kenmerk van de openbare template.
 */
function templateVanApp(map) {
  return manifestTemplate(leesManifestRuw(map), { heeftServercode: existsSync(join(map, "react-router.config.ts")) });
}

function leesManifestRuw(map) {
  try {
    return JSON.parse(readFileSync(join(map, MANIFEST_PAD), "utf8"));
  } catch {
    return null;
  }
}

function alBij(versie, doel) {
  return { status: "bij", van: versie, naar: doel, reden: `deze app staat al op versie ${versie}` };
}

// ---------------------------------------------------------------- de proef (alleen de werkplaats)

export const PROEF_PREFIX = "stack-proef";

/** De branch in de app voor een proef; nooit stack-bijwerken, zodat hij niet lijkt op een echte update. */
export function proefBranchNaam(versie) {
  return `${PROEF_PREFIX}/v${versie}`;
}

/** Een gewone branchnaam van de template, zoals uitgave/43; geen optie, geen .. en geen spaties. */
export function geldigeTemplateRef(ref) {
  return typeof ref === "string" && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(ref) && !ref.includes("..") && !ref.endsWith("/") && !ref.endsWith(".lock");
}

/**
 * Kloont de template en zet hem op de branch `ref` in plaats van op een tag. Geeft
 * `{ versie }` (uit .claude/stack-version op die branch) of `{ fout }`. Staat die versie al
 * als tag, dan is de uitgave uit en is dit geen proef meer: dan de gewone weg.
 */
function kloonTemplateOpBranch({ repo, ref, doel, appTemplate = TEMPLATE_GEWOON }) {
  kloonTemplate({ repo, doel });
  try {
    git(doel, "rev-parse", "--verify", "--quiet", `refs/remotes/origin/${ref}^{commit}`);
  } catch {
    return { fout: `de template heeft geen branch ${ref}; controleer de naam en of de branch op ${repo} staat` };
  }
  git(doel, "checkout", "-q", "--detach", `refs/remotes/origin/${ref}`);
  const versie = leesVersie(doel);
  if (versie === null) return { fout: `de branch ${ref} van de template heeft geen leesbaar .claude/stack-version` };
  // Een branch van de andere tier (of een kapot manifest) zou bestanden van een ander spoor in deze app zetten.
  // Beide varianten van tier 2 komen hier door; welke van de twee bij de app past, toetst andereTemplate.
  const daar = leesManifestRuw(doel);
  if (!isCloudflareManifest(daar)) {
    return { fout: `de branch ${ref} van ${repo} heeft variant ${JSON.stringify(daar?.variant ?? null)} in .claude/stack-manifest.json en past dus niet bij deze app (variant ${JSON.stringify(variantVan(appTemplate))}, tier 2); deze plugin probeert alleen een uitgave van de template voor tier 2 uit. Kies een branch van de template voor tier 2` };
  }
  // Ook de goede template van tier 2: een branch van de openbare template hoort niet in een gewone app, en andersom.
  const anders = andereTemplate({ tmplMap: doel, tmplRepo: `de branch ${ref} van ${repo}`, appTemplate });
  if (anders) return { fout: anders };
  if (git(doel, "tag", "--list", `stack-v${versie}`) !== "") {
    return { fout: `versie ${versie} op ${ref} is al uitgebracht (de template heeft de tag stack-v${versie}); werk bij zonder --template-ref` };
  }
  return { versie };
}

/** Bovenaan de pull request van een proef. */
export function proefKop({ ref, naar }) {
  return [
    `**Proef, niet mergen.** Deze pull request probeert versie ${naar} van de template uit, een uitgave die nog niet uit is (branch \`${ref}\` van de template). Zo zien we vóór de uitgave of deze app groen blijft.`,
    `Na de merge van de uitgave wordt deze pull request gesloten en vervangen door de echte update (branch \`stack-bijwerken/v${naar}\`).`,
  ].join("\n\n");
}

export function proefTitel(naar) {
  return `Proef: template naar versie ${naar} (nog niet uitgebracht)`;
}

function proefSluitTekst(naar) {
  return `Achterhaald: er staat nu een proef voor versie ${naar} van de template open, die deze vervangt. Deze wordt daarom gesloten zonder merge.`;
}

/**
 * Zonder `opAfstand` de app in de open map (`checkout`); met `opAfstand` (eigenaar/naam)
 * een andere app van de klant, rechtstreeks van GitHub. Die kennen we pas na het klonen,
 * dus de controle op template en versie komt dan na de kloon.
 *
 * Sinds versie 43 heeft tier 2 twee templates (lib/levering.mjs): de gewone en de openbare. De
 * app zegt in zijn manifest uit welke hij komt (veld `template`, zonder veld de gewone), en
 * alleen die template werkt hem bij. Na het klonen van de template controleert het script dat
 * nog een keer aan het manifest van de template zelf, zodat ook STACK_TEMPLATE_REPO of een
 * proefbranch nooit de verkeerde template in een app zet.
 */
export function droogloop({ checkout, opAfstand = null, env = process.env, templateRef = null, levering = LEVERING }) {
  if (opAfstand !== null && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(opAfstand)) {
    return mislukt("geef --repo als eigenaar/naam, bijvoorbeeld Mijn-Bedrijf/voorraad");
  }
  if (templateRef !== null && !geldigeTemplateRef(templateRef)) {
    return mislukt("geef --template-ref als branch van de template, bijvoorbeeld uitgave/43");
  }
  if (opAfstand === null && !isTemplateApp(checkout)) return GEEN_TEMPLATE;
  if (opAfstand === null && !isCloudflareManifest(leesManifestRuw(checkout))) return anderSpoor(leesManifestRuw(checkout));
  // Uit welke template de open app komt; bij --repo pas na het klonen.
  const vanApp = opAfstand === null ? templateVanApp(checkout) : null;
  if (vanApp?.fout) return mislukt(vanApp.fout);
  let appTemplate = vanApp?.template ?? null;
  let bron = appTemplate === null ? null : templateBron({ template: appTemplate, env, levering });
  if (bron?.fout) return mislukt(bron.fout);

  const metGh = ghAanwezig();
  if (opAfstand !== null && !metGh) return mislukt("een andere app bijwerken kan alleen met de GitHub-opdrachtregel (gh); draai eerst /stagetwo-tier2:installatie");
  if (metGh && !ghIngelogd()) return mislukt("log eerst in bij GitHub met `gh auth login`, dan kan de pull request geopend worden");

  const origin = opAfstand !== null ? `https://github.com/${opAfstand}.git` : originUrl(checkout);
  if (!origin) return mislukt("deze checkout heeft geen origin op GitHub; voeg die toe met `git remote add origin <url>`");
  const repo = opAfstand ?? repoUitUrl(origin);

  let werkmap = null;
  const klaarMet = (uitkomst) => {
    verwijderWerkmap(werkmap);
    return uitkomst;
  };
  // Een andere app (--repo) eerst klonen: pas dan weten we uit welke template hij komt, en dus
  // welke template hem bijwerkt.
  let kloon = null;
  if (opAfstand !== null) {
    werkmap = echtPad(mkdtempSync(join(tmpdir(), WERKMAP_PREFIX)));
    try {
      kloon = kloonRepo({ url: origin, doel: join(werkmap, "app") });
    } catch (fout) {
      return klaarMet(mislukt(eersteRegel(fout)));
    }
    if (!isTemplateApp(kloon)) return klaarMet(GEEN_TEMPLATE);
    // Ook een andere app moet van dit spoor zijn: nooit bestanden van tier 2 in een app van
    // tier 1 of van het Vercel-spoor (gevonden bij de test van uitgave 40 op een app van tier 1).
    if (!isCloudflareManifest(leesManifestRuw(kloon))) return klaarMet(anderSpoor(leesManifestRuw(kloon)));
    const vanKloon = templateVanApp(kloon);
    if (vanKloon.fout) return klaarMet(mislukt(vanKloon.fout));
    appTemplate = vanKloon.template;
    bron = templateBron({ template: appTemplate, env, levering });
    if (bron.fout) return klaarMet(mislukt(bron.fout));
  }
  const tmplRepo = bron.repo;
  const appVersie = leesVersie(kloon ?? checkout);

  // Een proef (--template-ref) kent zijn doel pas na het klonen van de template; die kloon komt
  // dan al nu in de werkmap. Zonder proef blijft het zoals het was: eerst de tags op afstand.
  let doel;
  if (templateRef === null) {
    doel = versieOpAfstand(tmplRepo);
    // De openbare template uit de levering die niet bereikbaar is: zeggen wat er aan de hand is
    // en wat de owner doet (de levering in die repo kan mislukt zijn).
    if (doel === null && appTemplate === TEMPLATE_OPENBAAR && !env?.STACK_TEMPLATE_REPO) return klaarMet(mislukt(openbaarNietBereikbaar(tmplRepo)));
    if (doel === null) return klaarMet(mislukt(`de template is niet bereikbaar (${tmplRepo}): geen netwerk, nog geen versie-tag, of de repo bestaat niet of is niet openbaar; probeer het later opnieuw; lukt het dan nog niet, draai /stagetwo-tier2:installatie (die zet de plugin naar de kopie in de eigen organisatie)`));
  } else {
    werkmap ??= echtPad(mkdtempSync(join(tmpdir(), WERKMAP_PREFIX)));
    let proef;
    try {
      proef = kloonTemplateOpBranch({ repo: tmplRepo, ref: templateRef, doel: join(werkmap, "template"), appTemplate });
    } catch (fout) {
      proef = { fout: `de template is niet te klonen (${tmplRepo}): ${eersteRegel(fout)}` };
    }
    if (proef.fout) return klaarMet(mislukt(proef.fout));
    doel = proef.versie;
  }
  if (appVersie >= doel) return klaarMet(alBij(appVersie, doel));

  const branch = templateRef === null ? branchNaam(doel) : proefBranchNaam(doel);
  if (metGh && repo) {
    let andere = null;
    try {
      andere = openPRVoorVersie(repo, doel);
    } catch (fout) {
      return klaarMet(mislukt(`de open pull requests van ${repo} zijn niet op te vragen: ${eersteRegel(fout)}`));
    }
    if (andere && andere.headRefName !== branch) {
      return klaarMet(gestopt(`er staat al een pull request open voor versie ${doel}, geopend door Stage Two: ${andere.url}; merge die, of sluit hem zelf op GitHub (Close pull request) en draai dit opnieuw`, { pr: andere }));
    }
  }

  werkmap ??= echtPad(mkdtempSync(join(tmpdir(), WERKMAP_PREFIX)));
  try {
    if (kloon === null) {
      kloon = kloonRepo({ url: origin, doel: join(werkmap, "app") });
      const pushUrl = originPushUrl(checkout);
      if (pushUrl) git(kloon, "remote", "set-url", "--push", "origin", pushUrl);
    }
    if (!pushDroog(kloon, branch)) {
      return klaarMet(mislukt(`je hebt geen schrijfrecht op ${repo ?? "deze repo"}; vraag de eigenaar je toe te voegen als medewerker`));
    }
    if (!branchHerbouwbaar(kloon, branch)) {
      return klaarMet(gestopt(`op de branch ${branch} staat een commit die niet van /stagetwo-tier2:updaten is; bekijk de open pull request voor die branch of verwijder de branch, en draai dan opnieuw`));
    }

    const tmplMap = join(werkmap, "template");
    if (templateRef === null) {
      kloonTemplate({ repo: tmplRepo, doel: tmplMap });
      const hoogste = hoogsteTagVersie(tmplMap);
      if (hoogste !== doel) {
        return klaarMet(mislukt(`de template-kloon heeft geen tag stack-v${doel}; probeer het later opnieuw`));
      }
      checkoutTag(tmplMap, doel);
      const anders = andereTemplate({ tmplMap, tmplRepo, appTemplate });
      if (anders) return klaarMet(mislukt(anders));
    }
    // Een app van de openbare template op een versie die die template niet heeft (die begint bij
    // 43): er is geen vorig manifest om mee te vergelijken. Duidelijk stoppen, niet raden.
    if (appTemplate === TEMPLATE_OPENBAAR && git(tmplMap, "tag", "--list", `stack-v${appVersie}`) === "") {
      return klaarMet(gestopt(`deze app staat op versie ${appVersie} met het manifest van de openbare template, maar die template heeft geen versie ${appVersie} (hij begint bij versie 43). Dan is niet na te gaan welke bestanden nog van de template zijn, dus er wordt niets bijgewerkt en de app blijft zoals hij is. Dat gebeurt meestal als een app met de hand is omgezet; zet hem over volgens de route omzetten-naar-openbaar in docs/routes/ van de openbare template, die de app op een versie van die template zet`));
    }
    maakBranch(kloon, branch);

    const resultaat = pasToe({ map: kloon, tmplMap, git: gitVoorKern(kloon, tmplMap), pnpm: pnpmVoorKern(), node: nodeVoorKern() });
    if (resultaat.status !== "bijgewerkt") {
      return klaarMet({ ...resultaat, reden: resultaat.reden && zonderLogin(resultaat.reden) });
    }
    for (const s of resultaat.overgeslagen) s.verschil = verschil(kloon, tmplMap, s.pad);

    const proef = templateRef === null ? null : { ref: templateRef };
    const toestand = { checkout: opAfstand === null ? checkout : null, origin: zonderLogin(origin), repo, branch, metGh, resultaat, ...(proef ? { proef } : {}), tijdstip: new Date().toISOString() };
    writeFileSync(join(werkmap, TOESTAND), `${JSON.stringify(toestand, null, 2)}\n`);
    return { ...resultaat, status: "klaar", branch, repo, werkmap, ...(proef ? { proef } : {}), ...uitlegNaDroogloop(resultaat, proef) };
  } catch (fout) {
    return klaarMet(mislukt(eersteRegel(fout)));
  }
}

/**
 * Komt de gekloonde template overeen met de template van de app? Null als het klopt, anders de
 * reden in één zin. Zo komen er nooit bestanden van de ene template in een app van de andere,
 * ook niet als STACK_TEMPLATE_REPO of een leveringsrepo naar de verkeerde wijst.
 */
export function andereTemplate({ tmplMap, tmplRepo, appTemplate }) {
  const ruw = leesManifestRuw(tmplMap);
  const daar = templateVan(ruw);
  const vanTier2 = isCloudflareManifest(ruw);
  if (vanTier2 && daar !== null && daar === appTemplate) return null;
  const wat = vanTier2 ? templateOmschrijving(daar) : `variant ${JSON.stringify(ruw?.variant ?? null)}`;
  return `${tmplRepo} is ${wat}, maar deze app komt uit ${templateOmschrijving(appTemplate)}; bijwerken met de verkeerde template zet er bestanden in die niet bij deze app horen, dus er gebeurt niets. Werk de app bij vanuit zijn eigen template`;
}

function uitlegNaDroogloop(resultaat, proef = null) {
  const n = resultaat.bijgewerkt.length;
  const w = resultaat.verwijderd.length;
  const o = resultaat.overgeslagen.length;
  const eigen = resultaat.projectbestanden ?? [];
  return {
    samenvatting: [
      `Van versie ${resultaat.van} naar ${resultaat.naar}: ${n} bestand(en) bijgewerkt, ${w} verwijderd, ${o} overgeslagen.`,
      o > 0
        ? "Bij de overgeslagen bestanden is lokaal iets aangepast; kies per bestand: de template overnemen of de eigen versie houden."
        : eigen.length > 0
          ? "Verder alleen bestanden van de template."
          : "Alleen bestanden van de template zijn geraakt; je eigen code niet.",
      ...(eigen.length > 0
        ? [`Eenmalig voor deze versie ook in je eigen bestanden: ${eigen.join(", ")}.`]
        : []),
      ...(resultaat.abTests
        ? [`${resultaat.abTests.tabellen.length} tabel(len) zonder A/B-test (${resultaat.abTests.tabellen.join(", ")}); de tests komen in deze pull request.`]
        : []),
      ...((resultaat.openTabellen?.tabellen ?? []).length > 0
        ? [`Open tabellen zonder echte reden: ${resultaat.openTabellen.tabellen.join(", ")}; de redenen komen in deze pull request.`]
        : []),
      ...(resultaat.testrol ? [`${resultaat.testrol.pad} krijgt de testrol in deze pull request.`] : []),
      ...(proef ? [`Dit is een proef van branch ${proef.ref} van de template; versie ${resultaat.naar} is nog niet uitgebracht.`] : []),
      "Er is nog niets gepusht.",
    ],
  };
}

// ---------------------------------------------------------------- de tweede aanroep

export function voerUit({ werkmap, losOp, koppen = {}, updates = null }) {
  const controle = controleerWerkmap(werkmap);
  if (controle.fout) {
    // Een verouderde map van onszelf ruimen we op; een vreemde map laten we staan.
    if (controle.eigen) verwijderWerkmap(werkmap);
    return mislukt(controle.fout);
  }
  const kloon = join(werkmap, "app");
  const tmplMap = join(werkmap, "template");

  try {
    // Ook een kapotte toestand.json valt in de catch hieronder: reden in één regel, map weg.
    const { resultaat, branch, repo, metGh, checkout, proef = null } = leesToestand(werkmap);
    const manifest = leesManifest(readFileSync(join(tmplMap, MANIFEST_PAD), "utf8"));
    const opgelost = [];
    for (const { pad, keuze } of losOp) {
      const overgeslagen = resultaat.overgeslagen.find((s) => s.pad === pad);
      if (!overgeslagen) {
        verwijderWerkmap(werkmap);
        return mislukt(`--los-op ${pad}: dit bestand staat niet in de lijst overgeslagen bestanden van de droogloop`);
      }
      if (keuze !== "template" && keuze !== "eigen") {
        verwijderWerkmap(werkmap);
        return mislukt(`--los-op ${pad}: kies template of eigen`);
      }
      if (keuze === "template") {
        if (pad in manifest.markeringen) {
          verwijderWerkmap(werkmap);
          return mislukt(`--los-op ${pad}: dit bestand heeft een projectdeel; zet de markeringen terug in plaats van het hele bestand te vervangen`);
        }
        mkdirSync(dirname(join(kloon, pad)), { recursive: true });
        cpSync(join(tmplMap, pad), join(kloon, pad));
      }
      opgelost.push({ pad, keuze });
    }
    const kopFout = zetKoppen(kloon, resultaat.onderdelen ?? null, koppen);
    if (kopFout) {
      verwijderWerkmap(werkmap);
      return mislukt(kopFout);
    }
    const nogOvergeslagen = resultaat.overgeslagen.filter((s) => !opgelost.some((o) => o.pad === s.pad)).map(({ verschil: _, ...rest }) => rest);

    // De A/B-tests die Claude tussen de twee aanroepen schreef: alleen de paden uit de droogloop.
    // Zei de bouwer dat iedereen in de app een tabel mag zien, dan staat zijn antwoord nu als
    // reden in open_tabellen; alleen zo'n nieuwe regel mag erbij.
    const antwoord = openNaAntwoord({ map: kloon, abTests: resultaat.abTests ?? null, magReden: resultaat.openTabellen?.tabellen ?? [] });
    if (antwoord.fout) {
      verwijderWerkmap(werkmap);
      return gestopt(antwoord.fout);
    }
    const ab = controleerAbTests({ map: kloon, node: nodeVoorKern(), abTests: resultaat.abTests ?? null, open: antwoord.open });
    // De redenen in open_tabellen en de testrol in global-setup, ook van Claude: zo zitten ze in
    // de commit van updaten zelf, en stopt een volgende updaten niet op een vreemde commit.
    const open = controleerOpenTabellen(kloon, resultaat.openTabellen ?? null, antwoord.open.map((o) => o.tabel));
    if (open.fout) {
      verwijderWerkmap(werkmap);
      return gestopt(open.fout);
    }
    const testrol = controleerTestrol(kloon, resultaat.testrol ?? null);
    const smal = controleerSmal(kloon, resultaat.openTabellen ?? null);
    formatteer({ kloon, checkout, paden: [...ab.paden.filter((p) => p !== AB_CONFIG), ...(testrol?.gedaan ? [testrol.pad] : [])] });

    // De controle op zichzelf, nog een keer: ook na de keuzes mag alleen het manifest geraakt zijn.
    // Plus wat de droogloop zelf neerzette omdat het ontbrak (alsHetOntbreekt); die paden staan
    // niet in het manifest als van de template, maar de droogloop liet ze al toe. Zonder deze
    // regel stopte elke app die zo'n bestand miste hier (sinds versie 40).
    const ontbrak = resultaat.bijgewerkt.map((b) => b.pad).filter((pad) => manifest.alsHetOntbreekt.includes(pad));
    const magOok = new Set([...toegestaneBestandenVan(manifest), ...ontbrak, ...resultaat.verwijderd, ...(resultaat.projectbestanden ?? []), ...ab.paden, ...(testrol ? [testrol.pad] : []), ...(smal?.gedaan ? [smal.pad] : []), LOCKFILE]);
    const buiten = gewijzigdePaden(kloon).filter((pad) => !magOok.has(pad));
    if (buiten.length > 0) {
      verwijderWerkmap(werkmap);
      return gestopt("er zou iets buiten het manifest wijzigen", { buitenManifest: buiten });
    }

    // Zonder open map (--repo) geldt de globale git-naam; de verse kloon heeft geen eigen.
    const identiteit = gitIdentiteit(checkout ?? kloon);
    if (!identiteit.naam || !identiteit.email) {
      verwijderWerkmap(werkmap);
      return mislukt("git kent je naam en e-mailadres niet; stel ze in met `git config --global user.name` en `user.email`");
    }
    const eind = {
      ...resultaat,
      overgeslagen: nogOvergeslagen,
      opgelost,
      abTests: ab,
      openTabellen: open,
      testrol,
      smal,
      projectbestanden: [...(resultaat.projectbestanden ?? []), ...(testrol?.gedaan ? [testrol.pad] : []), ...(smal?.gedaan ? [smal.pad] : [])],
      voorDeBouwer: [...(resultaat.voorDeBouwer ?? [])],
    };
    const bericht = proef ? `chore: proef template naar versie ${resultaat.naar} (${proef.ref})` : `chore: template naar versie ${resultaat.naar}`;
    commit({ map: kloon, identiteit, bericht, versie: resultaat.naar });

    // Tussen de droogloop en nu kan iemand op de branch hebben gecommit; ook dan blijven we ervan af.
    if (!branchHerbouwbaar(kloon, branch)) {
      verwijderWerkmap(werkmap);
      return gestopt(`op de branch ${branch} staat sinds de droogloop een commit die niet van /stagetwo-tier2:updaten is; bekijk de open pull request voor die branch en draai dan opnieuw`);
    }
    const gepusht = !alGelijkOpGitHub(kloon, branch);
    if (gepusht) push(kloon, branch);

    // De verplichte controle "Droogloop migraties" op main, met de rechten van de bouwer. De
    // update-PR zelf krijgt die status van Droogloop aanvragen, ook zolang main hem nog niet heeft.
    const ruleset = metGh && repo ? zetVerplichteControle(repo, { gh: (args) => sh("gh", args) }) : null;
    if (ruleset?.regel) eind.voorDeBouwer.push(ruleset.regel);

    const uitgaven = uitgavenTussen(updates, { van: resultaat.van, tot: resultaat.naar });
    const tekst = proef ? `${proefKop({ ref: proef.ref, naar: resultaat.naar })}\n\n${prTekst({ resultaat: eind, uitgaven, proef })}` : prTekst({ resultaat: eind, uitgaven });
    let pr = null;
    if (metGh && repo) {
      pr = openOfWerkPRBij({ repo, branch, titel: proef ? proefTitel(resultaat.naar) : prTitel(resultaat.naar), tekst });
      // Een proef sluit alleen oudere proeven; echte update-PR's laat hij met rust.
      if (proef) sluitOuderePRs({ repo, prefix: PROEF_PREFIX, doelVersie: resultaat.naar, tekst: proefSluitTekst(resultaat.naar), map: kloon });
      else sluitOuderePRs({ repo, prefix: "stack-bijwerken", doelVersie: resultaat.naar, tekst: sluitTekst(resultaat.naar), map: kloon });
    }
    verwijderWerkmap(werkmap);
    return {
      status: "gepusht",
      van: resultaat.van,
      naar: resultaat.naar,
      branch,
      gepusht,
      pr,
      vergelijkUrl: repo && !pr ? vergelijkUrl(repo, branch) : null,
      bijgewerkt: eind.bijgewerkt,
      verwijderd: eind.verwijderd,
      overgeslagen: eind.overgeslagen,
      opgelost,
      projectbestanden: eind.projectbestanden ?? [],
      voorDeBouwer: eind.voorDeBouwer ?? [],
      abTests: ab,
      openTabellen: open,
      testrol,
      smal,
      ruleset,
      ...(proef ? { proef } : {}),
      samenvatting: uitlegNaPush({ gepusht, pr, repo, branch, resultaat: eind, proef }),
    };
  } catch (fout) {
    verwijderWerkmap(werkmap);
    return mislukt(eersteRegel(fout));
  }
}

function uitlegNaPush({ gepusht, pr, repo, branch, resultaat, proef = null }) {
  const regels = [];
  if (pr) regels.push(pr.nieuw ? `Pull request geopend: ${pr.url}` : `Bestaande pull request bijgewerkt: ${pr.url}`);
  else if (repo) regels.push(`De branch ${branch} staat op GitHub; open de pull request hier: ${vergelijkUrl(repo, branch)}`);
  else regels.push(`De branch ${branch} staat op je origin.`);
  if (!gepusht) regels.push("De inhoud stond al zo op GitHub; er is niets opnieuw gepusht.");
  if (proef) regels.push(`Dit is een proef van ${proef.ref}: niet mergen. Kijk of de checks groen worden; na de merge van de uitgave gaat deze pull request dicht en komt de echte update.`);
  else regels.push("Wacht tot de checks groen zijn en druk dan op Merge. Rood? Zet de check niet uit: los het op met /stagetwo-tier2:verder-werken (een eigen pull request) en draai daarna /stagetwo-tier2:updaten opnieuw.");
  if (resultaat.overgeslagen.length > 0) {
    regels.push(`${resultaat.overgeslagen.length} bestand(en) zijn niet bijgewerkt omdat ze lokaal afwijken; dat staat in de pull request.`);
  }
  if ((resultaat.voorDeBouwer ?? []).length > 0) {
    regels.push("Voor deze versie is er ook iets voor jou om na te lopen; dat staat in de pull request onder Voor jou.");
  }
  if ((resultaat.abTests?.geschreven ?? []).length > 0) {
    regels.push(`Voor ${resultaat.abTests.geschreven.length} tabel(len) staat er nu een A/B-test in de pull request; daar hoef je niets voor te doen.`);
  }
  return regels;
}

/**
 * De A/B-tests in de opmaak van de app zetten (biome, zoals pnpm lint), met de biome uit de
 * open checkout als die er is. Zonder checkout (--repo) of zonder biome gebeurt er niets; dan
 * moet Claude de opmaak zelf goed hebben (de skill zegt hoe). Een fout stopt niets.
 */
/**
 * Zet de opmaak van de bestanden die Claude schreef recht met Biome. Staat de app op deze
 * computer, dan de Biome uit zijn node_modules. Werkt updaten een andere app bij (`--repo`), dan
 * is die er niet: dan Biome in de versie uit de package.json van de app, via `pnpm dlx`. Zonder
 * die stap werd de update-PR rood op "Opmaak en lint" (gevonden bij de test van uitgave 40).
 */
export function formatteer({ kloon, checkout, paden }) {
  if (paden.length === 0) return;
  const biome = checkout ? join(checkout, "node_modules", "@biomejs", "biome", "bin", "biome") : null;
  try {
    if (biome && existsSync(biome)) {
      sh(process.execPath, [biome, "check", "--write", ...paden], { cwd: kloon });
      return;
    }
    const versie = biomeVersie(kloon);
    if (versie) sh("pnpm", ["dlx", `@biomejs/biome@${versie}`, "check", "--write", ...paden], { cwd: kloon, timeout: 180000 });
  } catch {
    // Een opmaakfout ziet de kwaliteitspoort; het bijwerken gaat door.
  }
}

/** De versie van Biome uit de package.json van de app, zonder ^ of ~; null als die er niet is. */
export function biomeVersie(map) {
  try {
    const pkg = JSON.parse(readFileSync(join(map, "package.json"), "utf8"));
    const ruw = pkg.devDependencies?.["@biomejs/biome"] ?? pkg.dependencies?.["@biomejs/biome"];
    const versie = typeof ruw === "string" ? ruw.replace(/^[\^~]/, "") : "";
    return /^\d+\.\d+\.\d+(-[\w.]+)?$/.test(versie) ? versie : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- draaien

export function hoofd(argv, { cwd = process.cwd(), env = process.env, updates = null, levering = LEVERING } = {}) {
  let args;
  try {
    args = leesArgumenten(argv);
  } catch (fout) {
    return { status: "mislukt", reden: fout.message };
  }
  const checkout = resolve(args.checkout ?? cwd);
  if (args.werkmap) return voerUit({ werkmap: args.werkmap, losOp: args.losOp, koppen: args.koppen, updates });
  if (args.droogloop) return droogloop({ checkout, opAfstand: args.repo, env, templateRef: args.templateRef, levering });
  return mislukt("geef --droogloop (eerste aanroep) of --werkmap <map> (tweede aanroep) mee");
}

function toon(uitkomst, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(uitkomst, null, 2)}\n`);
    return;
  }
  const regels = [`status: ${uitkomst.status}`];
  if (uitkomst.reden) regels.push(uitkomst.reden);
  for (const r of uitkomst.samenvatting ?? []) regels.push(r);
  if (uitkomst.werkmap) regels.push(`werkmap: ${uitkomst.werkmap}`);
  process.stdout.write(`${regels.join("\n")}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  let uitkomst;
  try {
    // Het changelog alleen voor de tweede aanroep, die de pull request schrijft; zonder antwoord geen kopje.
    const updates = argv.includes("--werkmap") ? await haalUpdates() : null;
    uitkomst = hoofd(argv, { updates });
  } catch (fout) {
    // Nooit een stack trace op het scherm: ook een onverwachte fout wordt één JSON-object.
    uitkomst = { status: "mislukt", reden: zonderLogin(eersteRegel(fout)) };
  }
  toon(uitkomst, argv.includes("--json"));
  process.exitCode = uitkomst.status === "mislukt" || uitkomst.status === "gestopt" ? 1 : 0;
}

export { BEVESTIGING };
