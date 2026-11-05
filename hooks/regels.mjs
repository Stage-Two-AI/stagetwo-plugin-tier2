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
 * Sinds uitgave 39 kijkt de bewaker ook naar schrijven via Bash: een omleiding (`>`, `>>`),
 * `tee`, `sed -i`, `perl -i`, `cp`, `mv`, `rm`, `touch`, `truncate`, `dd of=`, `git rm` en
 * `git mv`, en een korte `node -e` of `python -c` die een beschermd pad noemt én schrijft.
 * Dat is een vroege waarschuwing, geen volledige shell: wat hier doorglipt, zet guard:template
 * alsnog rood. Terugzetten mag altijd (`git checkout`, `git restore`).
 *
 * En één regel dwingt een afspraak af die eerder alleen in de route stond: een pull request
 * begint als concept (`gh pr create --draft`). Een volle Kwaliteitspoort bij elke tussenstap
 * kost GitHub-minuten (meting oktober 2026: de grootste post).
 *
 * Werkmap (uitgave 39): staat er in de projectmap geen manifest, maar wel apps één niveau
 * dieper, dan beoordeelt beoordeelWerkmap elk bestand in de map van de app waar het in staat,
 * en de Bash-regels alleen als de opdracht in een app draait (cwd, `cd <app>`, `git -C <app>`,
 * `--repo <eigenaar>/<app>`). Zo werkt de bewaker ook als de bouwer boven zijn apps start.
 *
 * Bewust openlaten kan met STACK_ALLOW_POLICY_EDIT=1 (padbewerkingen, ook via Bash), voor
 * wanneer je met opzet aan het vangnet zelf werkt. De dev-server heeft zijn eigen, kleinere
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
    // Ook `git -C <map> push`, zoals vanuit een werkmap boven de apps.
    patroon: /git\s+(?:-C\s+\S+\s+)?push\b[^&|;]*\b(?:main|master)\b/,
    reden: [
      "Rechtstreeks naar main pushen kan niet, en hoeft niet.",
      "",
      "Alles gaat via een pull request, ook het werk van de bouwer. Deployen = mergen.",
      "Maak een branch, open een PR en laat de checks hun werk doen.",
    ].join("\n"),
  },
  {
    patroon: /git\s+(?:-C\s+\S+\s+)?push\b[^&|;]*(?:--force\b|--force-with-lease\b|\s-f\b)/,
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
  {
    // Snoeipunt 1 van de meting van oktober 2026: concept afdwingen in plaats van vragen. De
    // tekst kan "gh pr create" ook in een commitbericht noemen; daarom kijkt `tenzij` naar de
    // echte opdrachten in de regel, niet naar de tekst.
    patroon: /\bgh\s+pr\s+create\b/,
    tenzij: (commando) => !segmenten(lexeer(commando)).some((seg) => isPrZonderConcept(woordenVan(seg))),
    reden: [
      "Een pull request begint altijd als concept: `gh pr create --draft`.",
      "",
      "Waarom: bij een concept draaien alleen de snelle controles. De zware database- en",
      "browsertest wachten tot de pull request op klaar staat. Zonder concept draait bij elke",
      "push de volle Kwaliteitspoort, en dat kost de klant GitHub-minuten voor tussenstappen",
      "die nog niemand hoeft te beoordelen. Dat geldt ook voor een pull request met een migratie.",
      "",
      "Op klaar zetten doe je later, als de gebruiker het werk goed vindt (stap 7 van",
      "docs/routes/verder-werken.md): vul in de PR-tekst het kopje \"Voor de architectuur\" in,",
      "draai `pnpm check`, en dan `gh pr ready <nummer>` en `gh pr checks --watch`.",
    ].join("\n"),
  },
];

/** `gh pr create` zonder `--draft` (of `-d`) in deze woorden van één opdracht. */
function isPrZonderConcept(woorden) {
  const start = woorden.findIndex((w, i) => naamVan(w) === "gh" && woorden[i + 1] === "pr" && woorden[i + 2] === "create");
  if (start === -1) return false;
  const vlaggen = woorden.slice(start + 3);
  return !vlaggen.some((w) => w === "--draft" || w === "-d" || w === "--draft=true");
}

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

function weigerPad(relatief, { viaBash = false } = {}) {
  return {
    weiger: true,
    reden: [
      "Dit bestand hoort bij de gedeelde Stage Two-template en wordt niet per project gewijzigd.",
      "",
      `Bestand: ${relatief}`,
      ...(viaBash
        ? ["", "Dat geldt ook via de opdrachtregel (een omleiding met >, sed -i, cp, mv, rm en dergelijke)."]
        : []),
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
  "policies en een A/B-test met `controleerAfscherming` (tests/rls/lib/afscherming.ts) in tests/rls/,",
  "of staat met een reden in `open_tabellen` van stack.config.json, en daarna `pnpm db:types`.",
  "Raakt de migratie bestaande rijen (UPDATE of DELETE), zet dan bovenin per tabel één regel",
  "`-- verwacht: <tabel> <min>-<max> rijen`.",
].join("\n");

/**
 * Beoordeelt één gereedschapsaanroep: `{weiger, reden, context}`. Zonder manifest (geen
 * stack-repo) wordt nooit geweigerd. Bash gaat langs BASH_REGELS en daarna langs het
 * schrijven op templatebestanden; de padgereedschappen langs de beschermde paden, tenzij
 * env.STACK_ALLOW_POLICY_EDIT === "1". `cwd` is de map waarin een Bash-opdracht start
 * (standaard de projectmap); relatieve paden in de opdracht gelden vanaf daar. `context` is
 * een herinnering die de agent bij een toegestane aanroep meekrijgt (nu alleen voor
 * migraties).
 */
export function beoordeelTool({ projectmap, manifest, toolName, toolInput, env = {}, cwd = null }) {
  const toe = { weiger: false, reden: null };
  if (!manifest || typeof manifest !== "object") return toe;
  if (!toolInput || typeof toolInput !== "object") return toe;

  if (toolName === "Bash") {
    const commando = toolInput.command;
    if (typeof commando !== "string") return toe;
    const regel = bashRegel(commando, env);
    if (regel) return regel;
    const geraakt = schrijftOpTemplate({ commando, cwd: cwd ?? projectmap, projectmap, manifest, env });
    return geraakt ? weigerPad(geraakt, { viaBash: true }) : toe;
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

/** De eerste regel uit BASH_REGELS die deze opdracht weigert, als `{weiger, reden}`; anders null. */
export function bashRegel(commando, env = {}) {
  for (const regel of BASH_REGELS) {
    if (!regel.patroon.test(commando)) continue;
    if (regel.tenzij?.(commando, env ?? {})) continue;
    return { weiger: true, reden: regel.reden };
  }
  return null;
}

/**
 * Het eerste templatebestand (relatief pad) waar deze Bash-opdracht in schrijft, of null.
 * `cd <map>` en `pushd <map>` verleggen de map voor de opdrachten erna.
 */
export function schrijftOpTemplate({ commando, cwd, projectmap, manifest, env = {} }) {
  if (env?.STACK_ALLOW_POLICY_EDIT === "1" || /\bSTACK_ALLOW_POLICY_EDIT=1\b/.test(commando)) return null;
  const beschermd = beschermdePaden(manifest);
  let map = cwd;
  for (const seg of segmenten(lexeer(commando))) {
    const woorden = woordenVan(seg);
    if (woorden[0] === "cd" || woorden[0] === "pushd") {
      map = volgendeMap(map, woorden[1]);
      continue;
    }
    const { paden, code } = schrijfdoelen(seg);
    for (const p of paden) {
      const relatief = padVanuit(projectmap, map, p);
      if (relatief && !relatief.startsWith(".claude/worktrees/") && isBeschermd(relatief, beschermd)) return relatief;
    }
    for (const stuk of code) {
      const relatief = beschermdInCode(stuk, beschermd, projectmap);
      if (relatief) return relatief;
    }
  }
  return null;
}

function volgendeMap(map, doel) {
  if (typeof doel !== "string" || !doel || doel === "-" || doel.startsWith("~") || doel.includes("$")) return null;
  const los = doel.replaceAll("\\", "/");
  if (isAbsoluut(los)) return pad.normalize(los);
  return map ? pad.join(map, los) : null;
}

/** Het pad `p` uit een opdracht die in `map` draait, relatief aan de projectmap; of null. */
function padVanuit(projectmap, map, p) {
  if (typeof p !== "string" || !p || p.startsWith("~") || p.includes("$")) return null;
  const los = p.replaceAll("\\", "/");
  if (isAbsoluut(los)) return normaliseerPad(projectmap, los);
  if (!map) return null;
  return normaliseerPad(projectmap, pad.join(map.replaceAll("\\", "/"), los));
}

/** Een stukje code (node -e, python -c) dat schrijft én een beschermd pad noemt. */
const SCHRIJFT_IN_CODE =
  /\b(?:writeFile(?:Sync)?|appendFile(?:Sync)?|copyFile(?:Sync)?|rename(?:Sync)?|unlink(?:Sync)?|rmSync|createWriteStream|write_text|write_bytes|shutil\.(?:copy\w*|move)|os\.(?:remove|rename|replace|unlink))\b|\bopen\([^)]*,\s*['"][wax]/;

function beschermdInCode(code, { exact, prefixen }, projectmap) {
  if (!SCHRIJFT_IN_CODE.test(code)) return null;
  const voor = `(?:^|['"\`]|${escape(`${String(projectmap).replace(/\/+$/, "")}/`)})(?:\\./)?`;
  for (const p of exact) if (new RegExp(`${voor}${escape(p)}['"\`]`).test(code)) return p;
  for (const p of prefixen) if (new RegExp(`${voor}${escape(p)}`).test(code)) return p;
  return null;
}

function escape(tekst) {
  return tekst.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------- de opdrachtregel lezen

/**
 * Een kleine lezer voor één Bash-opdracht: woorden (met de aanhalingstekens eraf),
 * omleidingen (`>`, `>>`, `2>`, `&>`, `<<`) en scheidingstekens (`&&`, `||`, `;`, `|`,
 * een nieuwe regel). De tekst van een here-document slaat hij over, zodat een `>` in een
 * commitbericht geen omleiding wordt. Geen volledige shell: genoeg om te zien wat er
 * geschreven wordt.
 */
export function lexeer(tekst) {
  const tokens = [];
  const n = tekst.length;
  const heredocs = [];
  let woord = null;
  let i = 0;
  const sluit = () => {
    if (woord !== null) tokens.push({ soort: "woord", waarde: woord });
    woord = null;
  };
  while (i < n) {
    const c = tekst[i];
    if (c === "\n") {
      sluit();
      tokens.push({ soort: "scheiding", waarde: "\n" });
      i++;
      while (heredocs.length > 0) {
        const { tag, tabs } = heredocs.shift();
        while (i < n) {
          const eind = tekst.indexOf("\n", i);
          const regel = tekst.slice(i, eind === -1 ? n : eind);
          i = eind === -1 ? n : eind + 1;
          if ((tabs ? regel.replace(/^\t+/, "") : regel) === tag) break;
        }
      }
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      sluit();
      i++;
      continue;
    }
    if (c === "#" && woord === null) {
      while (i < n && tekst[i] !== "\n") i++;
      continue;
    }
    if (c === "\\") {
      if (tekst[i + 1] !== "\n") woord = (woord ?? "") + (tekst[i + 1] ?? "");
      i += 2;
      continue;
    }
    if (c === "'") {
      const eind = tekst.indexOf("'", i + 1);
      woord = (woord ?? "") + tekst.slice(i + 1, eind === -1 ? n : eind);
      i = eind === -1 ? n : eind + 1;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let stuk = "";
      while (j < n && tekst[j] !== '"') {
        if (tekst[j] === "\\" && j + 1 < n && '"\\$`'.includes(tekst[j + 1])) {
          stuk += tekst[j + 1];
          j += 2;
        } else {
          stuk += tekst[j];
          j++;
        }
      }
      woord = (woord ?? "") + stuk;
      i = j + 1;
      continue;
    }
    if (c === ">" || c === "<" || (c === "&" && tekst[i + 1] === ">")) {
      const m = /^(?:&>>|&>|>>|>\||>&|>|<<<|<<-|<<|<&|<>|<)/.exec(tekst.slice(i));
      if (woord !== null && /^\d+$/.test(woord)) woord = null;
      else sluit();
      tokens.push({ soort: "omleiding", waarde: m[0] });
      i += m[0].length;
      if (m[0] === "<<" || m[0] === "<<-") {
        while (tekst[i] === " " || tekst[i] === "\t") i++;
        const d = /^(['"]?)([^\s'";&|<>()]+)\1/.exec(tekst.slice(i));
        if (d) {
          heredocs.push({ tag: d[2], tabs: m[0] === "<<-" });
          i += d[0].length;
        }
      }
      continue;
    }
    const scheiding = ["&&", "||", ";;", ";", "|&", "|", "&", "(", ")"].find((s) => tekst.startsWith(s, i));
    if (scheiding) {
      sluit();
      tokens.push({ soort: "scheiding", waarde: scheiding });
      i += scheiding.length;
      continue;
    }
    woord = (woord ?? "") + c;
    i++;
  }
  sluit();
  return tokens;
}

/** De tokens per losse opdracht (gesplitst op scheidingstekens), zonder lege. */
export function segmenten(tokens) {
  const uit = [[]];
  for (const t of tokens) {
    if (t.soort === "scheiding") uit.push([]);
    else uit.at(-1).push(t);
  }
  return uit.filter((s) => s.length > 0);
}

/** De woorden van een opdracht, zonder omleidingen en hun doel. */
export function woordenVan(seg) {
  const woorden = [];
  for (let k = 0; k < seg.length; k++) {
    if (seg[k].soort === "omleiding") {
      if (seg[k + 1]?.soort === "woord") k++;
      continue;
    }
    woorden.push(seg[k].waarde);
  }
  return woorden;
}

function naamVan(woord) {
  return String(woord).replaceAll("\\", "/").split("/").pop();
}

const SCHRIJF_OMLEIDING = new Set([">", ">>", ">|", "&>", "&>>", "<>"]);
const VOORVOEGSELS = new Set(["sudo", "env", "command", "exec", "nohup", "time", "builtin"]);
const SCHRIJVERS = new Set(["rm", "unlink", "truncate", "touch", "shred", "tee"]);
const INTERPRETERS = new Set(["node", "python", "python3", "ruby", "deno", "bun"]);

/**
 * Waar één opdracht in schrijft: `paden` (zoals ze in de opdracht staan) en `code` (een
 * stukje node -e of python -c, dat beschermdInCode leest).
 */
export function schrijfdoelen(seg) {
  const paden = [];
  const code = [];
  for (let k = 0; k < seg.length; k++) {
    const t = seg[k];
    if (t.soort !== "omleiding" || seg[k + 1]?.soort !== "woord") continue;
    const doel = seg[k + 1].waarde;
    if (SCHRIJF_OMLEIDING.has(t.waarde) || (t.waarde === ">&" && !/^(?:\d+|-)$/.test(doel))) paden.push(doel);
  }
  const alle = woordenVan(seg);
  let s = 0;
  while (s < alle.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(alle[s]) || VOORVOEGSELS.has(alle[s]))) s++;
  if (s >= alle.length) return { paden, code };
  const naam = naamVan(alle[s]);
  const args = alle.slice(s + 1);
  const isVlag = (a) => a.startsWith("-") && a !== "-";
  const gewoon = args.filter((a) => !isVlag(a) && a !== "");

  if (SCHRIJVERS.has(naam)) paden.push(...gewoon);
  else if (naam === "sed" || naam === "gsed") {
    if (args.some((a) => /^-[A-Za-z]*i/.test(a) || a.startsWith("--in-place"))) paden.push(...gewoon);
  } else if (naam === "perl") {
    if (args.some((a) => /^-[A-Za-z]*i/.test(a))) paden.push(...gewoon);
    else code.push(...naVlag(args, ["-e", "-E"]));
  } else if (naam === "cp" || naam === "install" || naam === "ln" || naam === "mv") {
    const t = args.indexOf("-t");
    const doel = t !== -1 ? args[t + 1] : gewoon.at(-1);
    const bronnen = gewoon.filter((a) => a !== doel);
    if (doel) paden.push(doel, ...bronnen.map((b) => `${doel.replace(/\/+$/, "")}/${naamVan(b)}`));
    if (naam === "mv") paden.push(...bronnen);
  } else if (naam === "dd") {
    for (const a of args) if (a.startsWith("of=")) paden.push(a.slice(3));
  } else if (naam === "git") {
    let k = 0;
    let basis = "";
    while (k < args.length && args[k].startsWith("-")) {
      if (args[k] === "-C") {
        basis = `${args[k + 1] ?? ""}/`;
        k += 2;
      } else k++;
    }
    if (args[k] === "rm" || args[k] === "mv") paden.push(...args.slice(k + 1).filter((a) => !isVlag(a)).map((a) => `${basis}${a}`));
  } else if (INTERPRETERS.has(naam)) {
    code.push(...naVlag(args, ["-e", "-c", "-p", "--eval", "--print"]));
  }
  return { paden, code };
}

function naVlag(args, vlaggen) {
  const uit = [];
  for (let k = 0; k < args.length - 1; k++) if (vlaggen.includes(args[k])) uit.push(args[k + 1]);
  return uit;
}

// ---------------------------------------------------------------- werkmap

/**
 * Beoordeelt een gereedschapsaanroep in een werkmap (de map boven de apps, zonder eigen
 * manifest; zie lib/werkmap.mjs). `apps` is de lijst uit appsInWerkmap. Een pad wordt
 * beoordeeld in de app waar het in staat; buiten een app is alles toegestaan. Een
 * Bash-opdracht valt onder BASH_REGELS als hij in een app draait (de cwd ligt in een app,
 * of de opdracht noemt er een met `cd`, `git -C`, `pnpm --dir` of `--repo`/`-R`), en het
 * schrijven op templatebestanden wordt voor elke app bekeken.
 */
export function beoordeelWerkmap({ werkmap, apps, toolName, toolInput, env = {}, cwd = null }) {
  const toe = { weiger: false, reden: null };
  if (!Array.isArray(apps) || apps.length === 0 || !toolInput || typeof toolInput !== "object") return toe;

  if (Object.hasOwn(PAD_VELD, toolName)) {
    const veld = PAD_VELD[toolName];
    const relatief = normaliseerPad(werkmap, toolInput[veld]);
    const app = appVanRelatief(relatief, apps);
    if (!app) return toe;
    // Het pad als absoluut pad doorgeven: relatief is het ten opzichte van de werkmap, niet van de app.
    const absoluut = pad.join(pad.normalize(werkmap.replaceAll("\\", "/")), relatief);
    return beoordeelTool({ projectmap: app.map, manifest: app.manifest, toolName, toolInput: { ...toolInput, [veld]: absoluut }, env });
  }

  if (toolName === "Bash") {
    const commando = toolInput.command;
    if (typeof commando !== "string") return toe;
    const start = cwd && normaliseerPad(werkmap, cwd) ? cwd : werkmap;
    if (appsInOpdracht({ commando, werkmap, cwd: start, apps }).length > 0) {
      const regel = bashRegel(commando, env);
      if (regel) return regel;
    }
    for (const app of apps) {
      const geraakt = schrijftOpTemplate({ commando, cwd: start, projectmap: app.map, manifest: app.manifest, env });
      if (geraakt) return weigerPad(`${app.naam}/${geraakt}`, { viaBash: true });
    }
  }
  return toe;
}

function appVanRelatief(relatief, apps) {
  if (!relatief) return null;
  const eerste = relatief.split("/")[0];
  return apps.find((a) => a.naam === eerste) ?? null;
}

/** De apps waarin deze opdracht draait of die hij met naam aanwijst. */
export function appsInOpdracht({ commando, werkmap, cwd, apps }) {
  const gevonden = new Set();
  const opPad = (map) => {
    const app = appVanRelatief(map ? normaliseerPad(werkmap, map) : null, apps);
    if (app) gevonden.add(app);
  };
  opPad(cwd);
  let map = cwd;
  for (const seg of segmenten(lexeer(commando))) {
    const woorden = woordenVan(seg);
    if (woorden[0] === "cd" || woorden[0] === "pushd") {
      map = volgendeMap(map, woorden[1]);
      opPad(map);
      continue;
    }
    for (let k = 0; k < woorden.length - 1; k++) {
      const w = woorden[k];
      const volgende = woorden[k + 1];
      if (w === "-C" || w === "--dir" || w === "--prefix") opPad(volgendeMap(map, volgende));
      if (w === "--repo" || w === "-R") {
        const app = apps.find((a) => a.naam === String(volgende).split("/").pop());
        if (app) gevonden.add(app);
      }
    }
  }
  return [...gevonden];
}

/**
 * De ene regel bij sessiestart in een werkmap: welke apps hier staan, dat wijzigingen via
 * verder-werken in de map van de app gaan, en alleen als er apps achterlopen ook welke. Niets
 * uit een logboek of geschiedenis: dat gaat vervelen (Christijn 29-10).
 */
export function meldingWerkmap({ apps, eigenaren = [], versieOpAfstand = null }) {
  if (!Array.isArray(apps) || apps.length === 0) return null;
  const van = eigenaren.length > 0 ? ` van ${opsomming(eigenaren)}` : "";
  let regel = `stack: je staat boven de apps${van}: ${opsomming(apps.map((a) => a.naam))}; wijzigingen gaan via /stagetwo-tier2:verder-werken in de map van de app.`;
  const achter = isKleinGetal(versieOpAfstand) ? apps.filter((a) => isKleinGetal(a.versie) && a.versie < versieOpAfstand) : [];
  if (achter.length > 0) {
    regel += ` Achter op de nieuwste template (versie ${versieOpAfstand}): ${opsomming(achter.map((a) => `${a.naam} (versie ${a.versie})`))}; noem dat één keer en bied /stagetwo-tier2:updaten aan, zonder het uit te voeren.`;
  }
  return regel;
}

function opsomming(namen) {
  return namen.length <= 1 ? (namen[0] ?? "") : `${namen.slice(0, -1).join(", ")} en ${namen.at(-1)}`;
}

/** De bestandsnaam (zonder .json) van de stempel van een werkmap. */
export function werkmapStempelNaam(werkmap) {
  return `werkmap_${veilig(werkmap ?? "onbekend") || "onbekend"}`;
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
