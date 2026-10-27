/**
 * De beslisregels van de plugin-hook (U3 en U4, KTD6 en KTD7): zuivere functies, zonder
 * bestandssysteem, zonder netwerk en zonder process.env. Alles komt als argument binnen;
 * stack-hook.mjs voert ze uit en de tests roepen ze rechtstreeks aan.
 *
 * Het onderliggende principe (uit de vorige hook in de template): een afspraak die de
 * agent moet ónthouden, breekt uiteindelijk; een afspraak die de tooling afdwingt, niet.
 * Er staat hier geen regel die niet óók zonder deze hook wordt afgedwongen: `pnpm dev`
 * weigert zelf (scripts/dev.mjs), pushen naar main en force-pushen weigert de ruleset,
 * en wijzigingen aan templatebestanden laat de check guard:template rood staan. De hook
 * maakt dat alleen eerder merkbaar: bij de toetsaanslag in plaats van bij een rode check.
 *
 * Welke paden van de template zijn, komt uit .claude/stack-manifest.json van de repo
 * zelf (R4): de lijst `vervangen`, plus expliciet .github/CODEOWNERS en de twee
 * prefixen .github/workflows/ en .claude/ (nieuwe bestanden daar zijn even gevoelig).
 * De bestanden uit `sleutelsSamenvoegen` (package.json) en `tussenMarkeringen`
 * (AGENTS.md) zijn níet beschermd: het projectdeel daarvan mag bewerkt worden en de
 * CI-check bewaakt het templatedeel.
 *
 * Eén regel weigert niets maar herinnert: wie in supabase/migrations/ schrijft, krijgt de
 * route docs/routes/databasewijziging.md voorgehouden (`context`). Die route was eerder
 * een eigen skill; nu komt hij precies op het moment dat het ertoe doet.
 *
 * Bewust openlaten kan met STACK_ALLOW_POLICY_EDIT=1 (padbewerkingen), voor wanneer je
 * met opzet aan het vangnet zelf werkt. De dev-server heeft zijn eigen, kleinere
 * ontsnapping: STACK_ALLOW_DEV=1, voor lokaal kijken voor jezelf.
 */
import { posix as pad } from "node:path";
import { actieUit, datumNL, PAGINA_URL } from "../lib/updates.mjs";

/** De gereedschappen die de hook beoordeelt; hooks.json gebruikt dezelfde tekst. */
export const MATCHER = "Edit|Write|MultiEdit|NotebookEdit|Bash";

/** Per padgereedschap het veld in tool_input dat het pad draagt. */
const PAD_VELD = {
  Edit: "file_path",
  Write: "file_path",
  MultiEdit: "file_path",
  NotebookEdit: "notebook_path",
};

/** Mappen waarin elk bestand, ook een nieuw, bij de template hoort. */
export const BESCHERMDE_PREFIXEN = [".github/workflows/", ".claude/"];

/**
 * De vier Bash-regels uit de vorige hook in de template (.claude/hooks/guard.mjs),
 * letterlijk overgenomen. `tenzij(commando, env)` is de ontsnapping van een regel.
 */
export const BASH_REGELS = [
  {
    patroon: /\b(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?dev\b|\bvite\s*$|\bvite\s+(?!build|preview)/,
    // Lokaal kijken voor jezelf mag, mits expliciet: met STACK_ALLOW_DEV=1 vóór het
    // commando (of in de omgeving van de sessie). Dezelfde ontsnapping als scripts/dev.mjs,
    // zodat de hook nooit strenger is dan de kern. In de Claude-app hoeft dit niet: daar
    // start de preview via .claude/launch.json, buiten de Bash-tool om.
    tenzij: (commando, env) => /\bSTACK_ALLOW_DEV=1\b/.test(commando) || env?.STACK_ALLOW_DEV === "1",
    reden: [
      "Geen dev-server om werk te laten zien.",
      "",
      "Previews gaan via de preview van je pull request (de Cloudflare-preview, de link staat in de PR): dat is de enige",
      "omgeving die de klant kan openen en die is wat er ook echt live gaat.",
      "Zie docs/WERKWIJZE.md, hoofdstuk Werkafspraken.",
      "",
      "Wil je iets controleren zonder browser? Draai `pnpm test` of `pnpm test:e2e`.",
      "Wil je voor jezelf zien wat je gemaakt hebt? In de Claude-app gaat dat via de",
      "preview (de knop boven het gesprek, ingesteld in .claude/launch.json); start die in",
      "plaats van een dev-server in Bash. Buiten de Claude-app mag het expliciet:",
      "`STACK_ALLOW_DEV=1 pnpm dev`, volgens de route docs/routes/lokaal-kijken.md.",
    ].join("\n"),
  },
  {
    patroon: /git\s+push\b[^&|;]*\b(?:main|master)\b/,
    reden: [
      "Rechtstreeks naar main pushen kan niet, en hoeft niet.",
      "",
      "Alles gaat via een pull request, ook het werk van de bouwer. Deployen = mergen.",
      "Maak een branch, open een PR en laat de checks hun werk doen.",
    ].join("\n"),
  },
  {
    patroon: /git\s+push\b[^&|;]*(?:--force\b|--force-with-lease\b|\s-f\b)/,
    reden: [
      "Force pushen is uitgezet op deze repo.",
      "",
      "Het herschrijft historie die anderen al hebben opgehaald. Los het op met een",
      "extra commit of een revert.",
    ].join("\n"),
  },
  {
    patroon: /\b(?:vercel|wrangler)\s+(?:deploy|--prod|versions\s+(?:upload|deploy))|\bsupabase\s+(?:db\s+push|functions\s+deploy|link)\b/,
    reden: [
      "Niet met de hand deployen of aan de database van een omgeving zitten.",
      "",
      "Deployen gebeurt door te mergen: Actions past de migraties toe en rolt de",
      "nieuwe versie uit naar Cloudflare. Een handmatige ingreep laat de repo uit de pas lopen",
      "met de werkelijkheid, en dan is de historie waardeloos.",
      "",
      "Databasewijziging nodig? Schrijf een migratie in supabase/migrations/.",
      "Een migratie test je door hem te pushen: de Kwaliteitspoort draait hem in een eigen Supabase.",
    ].join("\n"),
  },
];

// ---------------------------------------------------------------- paden

/**
 * De beschermde paden uit een manifest: `exact` (een Set van relatieve paden) en
 * `prefixen` (mappen). CODEOWNERS staat in het manifest onder vanHetProject (het
 * opzetscript bewerkt het), maar bepaalt wie een melding krijgt en is daarom hier
 * expliciet beschermd, net als in de vorige hook.
 */
export function beschermdePaden(manifest) {
  const lijst = manifest?.vanDeTemplate?.vervangen;
  const exact = new Set();
  if (Array.isArray(lijst)) {
    for (const p of lijst) {
      const n = typeof p === "string" ? pad.normalize(p.replaceAll("\\", "/")) : "";
      if (n && n !== "." && !n.startsWith("../")) exact.add(n);
    }
  }
  exact.add(".github/CODEOWNERS");
  return { exact, prefixen: [...BESCHERMDE_PREFIXEN] };
}

/** Een Windows-pad met stationsletter (C:/...) is ook absoluut, al ziet posix dat niet. */
function isAbsoluut(p) {
  return p.startsWith("/") || /^[A-Za-z]:\//.test(p);
}

/**
 * Het pad relatief aan de projectmap, met `/` als scheiding, of null als het buiten de
 * projectmap ligt (of geen bruikbaar pad is). Buiten is niet beschermd: wat niet in deze
 * repo staat, kan geen templatebestand van deze repo zijn.
 */
export function normaliseerPad(projectmap, p) {
  if (typeof projectmap !== "string" || typeof p !== "string" || !projectmap || !p) return null;
  const map = pad.normalize(projectmap.replaceAll("\\", "/")).replace(/\/+$/, "") || "/";
  const los = p.replaceAll("\\", "/");
  const absoluut = isAbsoluut(los) ? pad.normalize(los) : pad.join(map, los);
  const relatief = pad.relative(map, absoluut);
  if (!relatief || relatief === ".." || relatief.startsWith("../") || isAbsoluut(relatief)) return null;
  return relatief;
}

function isBeschermd(relatief, { exact, prefixen }) {
  if (exact.has(relatief)) return true;
  return prefixen.some((prefix) => relatief.startsWith(prefix));
}

function weigerPad(relatief) {
  return {
    weiger: true,
    reden: [
      "Dit bestand hoort bij de gedeelde Stage Two-template en wordt niet per project gewijzigd.",
      "",
      `Bestand: ${relatief}`,
      "",
      "Wil je de nieuwste versie van dit bestand? Draai dan /stagetwo-tier2:updaten: dat brengt",
      "de hele app naar de nieuwste template, als pull request.",
      "Wil je dat het anders werkt? Dan is dat een vraag aan Stage Two: zij passen het in",
      "de template aan en iedereen krijgt de verbetering.",
      "",
      "Omzeil dit niet. Wijzig je het hier toch, dan zet de check guard:template de pull",
      "request rood en zet de volgende bijwerkronde het terug.",
    ].join("\n"),
  };
}

// ---------------------------------------------------------------- beoordeelTool

/** De map met migraties; wie daarin schrijft, krijgt de databaseroute voorgehouden. */
export const MIGRATIEMAP = "supabase/migrations/";

export const MIGRATIE_CONTEXT = [
  "stack: dit is een databasewijziging. Lees vóór je verder schrijft docs/routes/databasewijziging.md",
  "in zijn geheel en loop die stappen af (stap 0: bezit deze app de database wel?), naast de",
  "route verder-werken. Migraties zijn aanvullend, elke nieuwe tabel krijgt RLS, een grant,",
  "policies en een test in tests/rls/, en daarna `pnpm db:types`.",
].join("\n");

/**
 * Beoordeelt één gereedschapsaanroep: `{weiger, reden, context}`. Zonder manifest (geen
 * stack-repo) wordt nooit geweigerd. Bash gaat langs BASH_REGELS; de padgereedschappen
 * langs de beschermde paden, tenzij env.STACK_ALLOW_POLICY_EDIT === "1". `context` is
 * een herinnering die de agent bij een toegestane aanroep meekrijgt (nu alleen voor
 * migraties).
 */
export function beoordeelTool({ projectmap, manifest, toolName, toolInput, env = {} }) {
  const toe = { weiger: false, reden: null };
  if (!manifest || typeof manifest !== "object") return toe;
  if (!toolInput || typeof toolInput !== "object") return toe;

  if (toolName === "Bash") {
    const commando = toolInput.command;
    if (typeof commando !== "string") return toe;
    for (const regel of BASH_REGELS) {
      if (!regel.patroon.test(commando)) continue;
      if (regel.tenzij?.(commando, env ?? {})) continue;
      return { weiger: true, reden: regel.reden };
    }
    return toe;
  }

  if (Object.hasOwn(PAD_VELD, toolName)) {
    if (env?.STACK_ALLOW_POLICY_EDIT === "1") return toe;
    const relatief = normaliseerPad(projectmap, toolInput[PAD_VELD[toolName]]);
    if (!relatief) return toe;
    if (isBeschermd(relatief, beschermdePaden(manifest))) return weigerPad(relatief);
    if (relatief.startsWith(MIGRATIEMAP)) return { ...toe, context: MIGRATIE_CONTEXT };
    return toe;
  }

  return toe;
}

// ---------------------------------------------------------------- sessiestart

const DAG_MS = 24 * 60 * 60 * 1000;

/**
 * Moet de hook op afstand kijken? Alleen zonder stempel, met een onleesbare stempel of
 * als de vorige controle 24 uur of langer geleden is (R6: hooguit één keer per dag per
 * repo). De hook vraagt dit vóór de netwerkvraag, zodat een tweede sessie op dezelfde
 * dag GitHub niet aanraakt.
 */
export function moetControleren({ stempel, nu }) {
  const t = Date.parse(stempel?.tijdstip ?? "");
  if (Number.isNaN(t)) return true;
  return nu.getTime() - t >= DAG_MS;
}

function isKleinGetal(n) {
  return Number.isSafeInteger(n) && n >= 0 && n < 1_000_000;
}

/**
 * De beslissing bij sessiestart: `{melding, nieuweStempel}`. Geen melding zonder lokale
 * versie, zonder versie op afstand (geen netwerk, geen tag), bij een gelijke of lagere
 * versie op afstand (wel een stempel, want de controle is gedaan) of binnen 24 uur na de
 * vorige controle (dan ook geen nieuwe stempel: er is niet gekeken). De melding is
 * context met een instructie aan de agent (KTD7).
 *
 * Uitzondering op "geen versie op afstand": met `bronFout` "geen-toegang" (GitHub weigert of
 * kent de repo `bron` niet, zie versie-op-afstand.mjs) volgt wel een melding, met een stempel,
 * dus hooguit één keer per dag. Dat gebeurt als een app na het afschermen van de bronrepo
 * nog niet op de kopie van de klant staat; stil blijven zou betekenen dat er nooit meer een
 * nieuwe versie gemeld wordt zonder dat iemand het merkt.
 *
 * `uitgaven` komt uit het changelog op stagetwo.nl (lib/updates.mjs, uitgavenTussen): de
 * uitgaven tussen de lokale versie en die op afstand, nieuwste eerst. Dan noemt de melding wat
 * er nieuw is (hooguit drie titels) en, als een uitgave `actieNodig` heeft, wat er moet en vóór
 * wanneer, met de vraag het nadrukkelijk aan te bieden. Een lege lijst (site onbereikbaar,
 * onbekend formaat) geeft de melding zonder changelog.
 */
export function beoordeelStart({ versieLokaal, versieOpAfstand, stempel, nu, bronFout = null, bron = null, uitgaven = [] }) {
  const niets = { melding: null, nieuweStempel: null };
  if (!isKleinGetal(versieLokaal)) return niets;
  if (!isKleinGetal(versieOpAfstand)) {
    if (bronFout !== "geen-toegang" || !moetControleren({ stempel, nu })) return niets;
    const melding = [
      `stack: de plugin kan de nieuwste versie van de Stage Two-template niet opvragen bij ${bron ?? "de template"}`,
      "(GitHub kent die repo niet of geeft geen toegang). Daardoor komt een nieuwe versie hier niet als melding",
      "binnen. Zeg dit één keer aan de gebruiker, in gewone taal, en vraag hem dit aan Stage Two door te geven:",
      "meestal moet deze computer of deze app nog naar de kopie van de werkwijze in de eigen organisatie.",
      "Voer zelf niets uit.",
    ].join("\n");
    return { melding, nieuweStempel: { versieOpAfstand: null, tijdstip: nu.toISOString() } };
  }
  if (!moetControleren({ stempel, nu })) return niets;
  const nieuweStempel = { versieOpAfstand, tijdstip: nu.toISOString() };
  if (versieOpAfstand <= versieLokaal) return { melding: null, nieuweStempel };
  const lijst = Array.isArray(uitgaven) ? uitgaven.filter((u) => u && typeof u.titel === "string") : [];
  if (lijst.length === 0) {
    const melding = [
      `stack: er is een nieuwere versie van de Stage Two-template. Deze app staat op versie ${versieLokaal},`,
      `de template is op versie ${versieOpAfstand}. Zeg dit één keer aan de gebruiker, in gewone taal, en`,
      "bied /stagetwo-tier2:updaten aan om de app bij te werken (dat opent een pull request). Voer het",
      "niet uit zonder dat hij erom vraagt.",
    ].join("\n");
    return { melding, nieuweStempel };
  }
  const regels = [
    `stack: er is een nieuwere versie van de Stage Two-template. Deze app staat op versie ${versieLokaal},`,
    `de template is op versie ${versieOpAfstand}. Wat er nieuw is (nieuwste eerst):`,
    ...lijst.slice(0, MAX_TITELS).map((u) => `- versie ${u.versie}: ${u.titel}`),
  ];
  if (lijst.length > MAX_TITELS) regels.push(`- en ${lijst.length - MAX_TITELS} eerdere uitgave(n)`);
  regels.push(`Alles staat op ${PAGINA_URL}.`);
  const actie = actieUit(lijst);
  if (actie) {
    const wanneer = actie.voor ? ` vóór ${datumNL(actie.voor)}` : "";
    regels.push(
      `Deze update is nodig${wanneer}: ${actie.wat}`,
      "Zeg dit duidelijk aan de gebruiker, met de datum, en bied /stagetwo-tier2:updaten nadrukkelijk aan",
      "(dat opent een pull request), niet terloops. Voer het niet uit zonder dat de gebruiker erom vraagt.",
    );
  } else {
    regels.push(
      "Zeg dit één keer aan de gebruiker, in gewone taal, met wat er nieuw is, en bied /stagetwo-tier2:updaten",
      "aan om de app bij te werken (dat opent een pull request). Voer het niet uit zonder dat de gebruiker erom vraagt.",
    );
  }
  return { melding: regels.join("\n"), nieuweStempel };
}

const MAX_TITELS = 3;

// ---------------------------------------------------------------- andere apps

/**
 * De regel over andere apps van het bedrijf die achterlopen (lib/andere-apps.mjs), of null
 * als er geen zijn. `dezeAppBij` zegt of de open app zelf op de nieuwste versie staat; ook
 * dan volgt de regel, want anders hoort niemand over een app die nooit meer open gaat.
 */
export function meldingAndereApps({ apps, dezeAppBij }) {
  if (!Array.isArray(apps) || apps.length === 0) return null;
  const MAX = 5;
  const namen = apps.slice(0, MAX).map((a) => `${a.naam} (versie ${a.versie})`);
  if (apps.length > MAX) namen.push(`nog ${apps.length - MAX} andere`);
  const opsomming = namen.length === 1 ? namen[0] : `${namen.slice(0, -1).join(", ")} en ${namen.at(-1)}`;
  const aantal = apps.length === 1 ? "1 andere app loopt" : `${apps.length} andere apps lopen`;
  return [
    dezeAppBij
      ? `stack: deze app is bij, maar ${aantal} achter: ${opsomming}.`
      : `stack: ook ${aantal} achter: ${opsomming}.`,
    "Noem dit één keer aan de gebruiker en bied /stagetwo-tier2:updaten aan; dat werkt ook apps bij die",
    "niet op deze computer staan. Voer het niet uit zonder dat de gebruiker erom vraagt.",
  ].join("\n");
}

/** De bestandsnaam (zonder .json) van de stempel voor de andere apps: één per organisatie. */
export function orgStempelNaam(eigenaar) {
  return `org_${veilig(eigenaar ?? "onbekend") || "onbekend"}`;
}

// ---------------------------------------------------------------- stempelnaam

function veilig(tekst) {
  return String(tekst).replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
}

/**
 * De bestandsnaam (zonder .json) van de stempel: `<eigenaar>_<repo>` uit de origin-URL
 * (https, ssh met git@host:pad, of ssh://), anders een veilige naam uit de projectmap.
 * Zo krijgen twee repo's van dezelfde klant twee stempels, ook zonder origin.
 */
export function stempelNaam({ origin, projectmap }) {
  if (typeof origin === "string") {
    const url = origin.trim().replace(/\.git$/, "");
    const m = /^(?:[a-z+]+:\/\/[^/]+\/|[^/@:]+@[^/:]+:|)(?:.*\/)?([^/:]+)\/([^/:]+)$/.exec(url);
    if (m && /[:/]/.test(url)) {
      const naam = `${veilig(m[1])}_${veilig(m[2])}`;
      if (naam.length > 1 && !naam.startsWith("_") && !naam.endsWith("_")) return naam;
    }
  }
  return `map_${veilig(projectmap ?? "onbekend") || "onbekend"}`;
}
