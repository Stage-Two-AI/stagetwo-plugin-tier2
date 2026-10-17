import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { STAGE_TWO } from "../lib/levering.mjs";
import { MARKETPLACE, pluginBron } from "../lib/plugin-bron.mjs";
import { BRANCH, TITEL, hoofd, leesArgumenten, omzetten, prTekst } from "./levering-omzetten.mjs";
import { ALLEEN_IN_BRON } from "./uitleveren.mjs";

const ORG = "Richplant-BV";
const LEVERING = `${ORG}/stagetwo-plugin-tier2`;
const b64 = (tekst) => Buffer.from(tekst, "utf8").toString("base64");

function settings(repo) {
  return `${JSON.stringify(
    {
      extraKnownMarketplaces: { [MARKETPLACE]: { source: { source: "github", repo }, autoUpdate: true } },
      enabledPlugins: { [`${MARKETPLACE}@${MARKETPLACE}`]: true },
    },
    null,
    2,
  )}\n`;
}

/**
 * Een nep-gh over een kleine wereld: per app de settings-tekst (of null) en open PR's.
 * Elke aanroep komt in `aanroepen`; schrijvende aanroepen herken je aan -X of `pr create`.
 */
function nepGh({ apps = {}, levering = { plugin: LEVERING }, open = {} } = {}) {
  const aanroepen = [];
  const gh = (args, { input } = {}) => {
    aanroepen.push({ args, input });
    const [a, b] = args;
    if (a === "api" && b === `repos/${LEVERING}/contents/levering.json`) {
      if (!levering) throw Object.assign(new Error("gh: Not Found (HTTP 404)"), { stderr: "gh: Not Found (HTTP 404)" });
      return JSON.stringify({ content: b64(JSON.stringify(levering)) });
    }
    if (a === "api" && args.includes("-X")) return "{}";
    if (a === "api" && /^repos\/[^/]+\/[^/]+$/.test(b)) {
      if (!(b.slice(6) in apps)) throw Object.assign(new Error("gh: Not Found (HTTP 404)"), { stderr: "gh: Not Found (HTTP 404)" });
      return JSON.stringify({ default_branch: "main" });
    }
    const m = /^repos\/([^/]+\/[^/]+)\/contents\/\.claude\/settings\.json\?ref=main$/.exec(b ?? "");
    if (a === "api" && m) {
      const tekst = apps[m[1]];
      if (tekst == null) throw Object.assign(new Error("gh: Not Found (HTTP 404)"), { stderr: "gh: Not Found (HTTP 404)" });
      return JSON.stringify({ content: b64(tekst), sha: "blob-sha" });
    }
    if (a === "api" && /\/git\/ref\/heads\/main$/.test(b)) return "basis-sha";
    if (a === "pr" && b === "list") return JSON.stringify(open[args[args.indexOf("-R") + 1]] ?? []);
    if (a === "pr" && b === "create") return `https://github.com/${args[args.indexOf("-R") + 1]}/pull/1`;
    throw new Error(`onverwacht: gh ${args.join(" ")}`);
  };
  const schrijvend = () => aanroepen.filter(({ args }) => args.includes("-X") || (args[0] === "pr" && args[1] === "create"));
  return { gh, aanroepen, schrijvend };
}

test("argumenten: org verplicht, apps als naam of eigenaar/naam, --doe-het", () => {
  assert.deepEqual(leesArgumenten(["--org", ORG, "plantas", "Ander/x"]), { org: ORG, apps: [`${ORG}/plantas`, "Ander/x"], doeHet: false });
  assert.equal(leesArgumenten(["--org", ORG, "a", "--doe-het"]).doeHet, true);
  assert.throws(() => leesArgumenten(["a"]), /--org/);
  assert.throws(() => leesArgumenten(["--org", ORG]), /minstens één app/);
  assert.throws(() => leesArgumenten(["--org", ORG, "a", "--wat"]), /onbekend argument/);
});

test("droogloop: zegt per app wat er zou gebeuren en schrijft niets", () => {
  const w = nepGh({ apps: { [`${ORG}/plantas`]: settings(STAGE_TWO.plugin), [`${ORG}/nieuw`]: settings(LEVERING), [`${ORG}/los`]: null } });
  const uit = omzetten({ org: ORG, apps: [`${ORG}/plantas`, `${ORG}/nieuw`, `${ORG}/los`], gh: w.gh });
  assert.equal(uit.status, "klaar");
  assert.equal(uit.levering, LEVERING);
  assert.deepEqual(
    uit.apps.map((r) => [r.app, r.status]),
    [
      [`${ORG}/plantas`, "zou-omzetten"],
      [`${ORG}/nieuw`, "al-goed"],
      [`${ORG}/los`, "overgeslagen"],
    ],
  );
  assert.equal(uit.apps[0].van, STAGE_TWO.plugin);
  assert.deepEqual(w.schrijvend(), []);
});

test("doe-het: branch, één commit met alleen de bron, pull request met de bevestigingsregel", () => {
  const voor = settings(STAGE_TWO.plugin);
  const w = nepGh({ apps: { [`${ORG}/plantas`]: voor } });
  const uit = omzetten({ org: ORG, apps: [`${ORG}/plantas`], doeHet: true, gh: w.gh });
  assert.equal(uit.apps[0].status, "omgezet", uit.apps[0].reden);
  assert.equal(uit.apps[0].pr, `https://github.com/${ORG}/plantas/pull/1`);

  const [ref, put, pr] = w.schrijvend();
  assert.deepEqual(ref.args.slice(0, 4), ["api", "-X", "POST", `repos/${ORG}/plantas/git/refs`]);
  assert.ok(ref.args.includes(`ref=refs/heads/${BRANCH}`) && ref.args.includes("sha=basis-sha"));

  assert.deepEqual(put.args.slice(0, 4), ["api", "-X", "PUT", `repos/${ORG}/plantas/contents/.claude/settings.json`]);
  const inhoud = JSON.parse(put.input);
  assert.equal(inhoud.branch, BRANCH);
  assert.equal(inhoud.sha, "blob-sha");
  assert.deepEqual(inhoud.author, { name: "Stage Two", email: "info@stagetwo.nl" });
  assert.deepEqual(inhoud.committer, inhoud.author);
  const na = Buffer.from(inhoud.content, "base64").toString("utf8");
  assert.equal(na, voor.replace(`"repo": "${STAGE_TWO.plugin}"`, `"repo": "${LEVERING}"`), "alleen de waarde van repo verandert");
  assert.equal(pluginBron(na), LEVERING);

  assert.deepEqual(pr.args.slice(0, 2), ["pr", "create"]);
  assert.equal(pr.args[pr.args.indexOf("--head") + 1], BRANCH);
  assert.equal(pr.args[pr.args.indexOf("--title") + 1], TITEL);
  const tekst = pr.args[pr.args.indexOf("--body") + 1];
  // Dezelfde regel als in scripts/guard-template.mjs van de template.
  assert.match(tekst, /^\s*Bevestigd:\s*templatebestanden gewijzigd\s*$/im);
  assert.match(tekst, /^\s*Geen tests nodig:\s*\S.*$/im, "guard:tests");
  assert.ok(tekst.includes(LEVERING) && tekst.includes(STAGE_TWO.plugin));
  assert.doesNotMatch(tekst, /—/, "geen em-dashes");
});

test("doe-het: een bestaande branch zonder open pull request wordt op de basis gezet", () => {
  const w = nepGh({ apps: { [`${ORG}/plantas`]: settings(STAGE_TWO.plugin) } });
  const gh = (args, opties) => {
    if (args.includes("POST")) throw new Error("gh: Reference already exists (HTTP 422)");
    return w.gh(args, opties);
  };
  const uit = omzetten({ org: ORG, apps: [`${ORG}/plantas`], doeHet: true, gh });
  assert.equal(uit.apps[0].status, "omgezet");
  assert.ok(w.aanroepen.some(({ args }) => args.includes("PATCH") && args.includes("force=true")));
});

test("een open pull request op de branch: niets nieuws", () => {
  const w = nepGh({ apps: { [`${ORG}/plantas`]: settings(STAGE_TWO.plugin) }, open: { [`${ORG}/plantas`]: [{ url: "https://x/pull/3" }] } });
  const uit = omzetten({ org: ORG, apps: [`${ORG}/plantas`], doeHet: true, gh: w.gh });
  assert.deepEqual(uit.apps[0], { app: `${ORG}/plantas`, status: "staat-open", pr: "https://x/pull/3" });
  assert.deepEqual(w.schrijvend(), []);
});

test("zonder levering.json in de leveringsrepo: stoppen vóór er iets gebeurt", () => {
  for (const levering of [null, { plugin: "Ander/stagetwo-plugin-tier2" }]) {
    const w = nepGh({ apps: { [`${ORG}/plantas`]: settings(STAGE_TWO.plugin) }, levering });
    const uit = omzetten({ org: ORG, apps: [`${ORG}/plantas`], doeHet: true, gh: w.gh });
    assert.equal(uit.status, "gestopt");
    assert.match(uit.reden, /Uitleveren/);
    assert.deepEqual(w.schrijvend(), []);
    assert.equal(w.aanroepen.length, 1, "geen enkele app aangeraakt");
  }
});

test("een app zonder marketplace-regel of een onbekende repo", () => {
  const w = nepGh({ apps: { [`${ORG}/kaal`]: "{}\n" } });
  const uit = omzetten({ org: ORG, apps: [`${ORG}/kaal`, `${ORG}/bestaat-niet`], doeHet: true, gh: w.gh });
  assert.equal(uit.apps[0].status, "overgeslagen");
  assert.match(uit.apps[0].reden, /marketplace/);
  assert.equal(uit.apps[1].status, "mislukt");
  assert.deepEqual(w.schrijvend(), []);
});

test("hoofd: weigert met een klanttoken, en de droogloop zegt hoe het verder moet", () => {
  const regels = [];
  assert.equal(hoofd(["--org", ORG, "plantas"], { env: { GH_TOKEN: "x" }, log: (r) => regels.push(r) }), 1);
  assert.match(regels[0], /klanttoken/);
  const w = nepGh({ apps: { [`${ORG}/plantas`]: settings(STAGE_TWO.plugin) } });
  const uit = [];
  assert.equal(hoofd(["--org", ORG, "plantas"], { env: {}, log: (r) => uit.push(r), gh: w.gh }), 0);
  assert.match(uit.join("\n"), /zou-omzetten/);
  assert.match(uit.join("\n"), /--doe-het/);
  assert.deepEqual(w.schrijvend(), []);
});

test("prTekst: zonder em-dashes, met beide bronnen", () => {
  const tekst = prTekst({ van: STAGE_TWO.plugin, naar: LEVERING });
  assert.ok(tekst.endsWith("Bevestigd: templatebestanden gewijzigd"));
  assert.doesNotMatch(tekst, /—/);
});

test("dit script gaat niet mee naar een klant", () => {
  assert.ok(ALLEEN_IN_BRON.includes("beheer/levering-omzetten.mjs"));
  assert.ok(ALLEEN_IN_BRON.includes("beheer/levering-omzetten.test.mjs"));
  const hier = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "levering-omzetten.mjs"), "utf8");
  assert.match(hier, /ALLEEN_IN_BRON/);
});
