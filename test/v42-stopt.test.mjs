/**
 * Bewijs met de echte code van plugin 42 (de tag v42.0.0, via git archive) dat die oudere plugin
 * een app van de openbare template met `"variant": "cloudflare-openbaar"` met rust laat: updaten
 * stopt als "ander spoor" (gewoon en met --repo), de hook zegt bij sessiestart niets, en zo'n app
 * staat niet in het lijstje andere apps die achterlopen. Plugin 42 kent het veld `template` niet;
 * zonder eigen variant zou hij de app bijwerken met de gewone template (lib/manifest.mjs).
 *
 * Ter controle draait dezelfde opzet ook met variant `cloudflare`: dan gaat v42 wel door (en dus
 * de verkeerde kant op). Zo is zeker dat de test niet stil slaagt omdat v42 nergens iets doet.
 *
 * Staat de tag niet in deze checkout (een ondiepe kloon in CI), dan slaat de test zichzelf over.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { appBestanden, git, insteadOfEnv, maakKlantRepo, maakTemplateRepo, nepGh, nepPnpm_opPad, opruimen, templateBestanden, tijdelijkeMap } from "../lib/test-hulp.mjs";

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), "..");
const TAG = "v42.0.0";

function heeftTag() {
  try {
    execFileSync("git", ["-C", WORTEL, "rev-parse", "-q", "--verify", `refs/tags/${TAG}^{commit}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
const OVERSLAAN = heeftTag() ? false : `de tag ${TAG} staat niet in deze checkout`;

/** De plugin van v42, uitgepakt in `map`. */
function pakV42Uit(map) {
  mkdirSync(map, { recursive: true });
  const tar = join(map, "..", "v42.tar");
  execFileSync("git", ["-C", WORTEL, "archive", "--output", tar, TAG]);
  execFileSync("tar", ["-xf", tar, "-C", map]);
  // Het echte pad: v42 draait zijn hoofdfunctie alleen als argv[1] gelijk is aan zijn eigen pad (op macOS is /var een omweg naar /private/var).
  return realpathSync(map);
}

/** Het manifest van de openbare template zoals de template-repo het na deze uitgave heeft. */
function openbaarManifest(variant = "cloudflare-openbaar") {
  const m = JSON.parse(templateBestanden(8)[".claude/stack-manifest.json"]);
  return `${JSON.stringify({ ...m, variant, manifestFormaat: 2, template: "app-template-tier2-openbaar" }, null, 2)}\n`;
}

function openbareApp(variant) {
  return { ...appBestanden(), ".claude/stack-manifest.json": openbaarManifest(variant), "react-router.config.ts": "export default {};\n" };
}

const GH = {
  "--version": { stdout: "gh version 2.95.0\n" },
  "auth status": { stdout: "Logged in\n" },
  "pr list": { stdout: [] },
};

/** Een wereld met een gewone template op 9 (STACK_TEMPLATE_REPO), de app van de klant en een nep-gh. */
function wereld(variant) {
  const wortel = tijdelijkeMap("v42-stopt-");
  const v42 = pakV42Uit(join(wortel, "v42"));
  const template = maakTemplateRepo(wortel);
  const githubUrl = "https://github.com/klant/shop.git";
  const klant = maakKlantRepo(wortel, { githubUrl, app: openbareApp(variant) });
  const nep = nepGh(wortel, GH);
  nepPnpm_opPad(nep.pad);
  const tmp = join(wortel, "tmp");
  mkdirSync(tmp);
  const thuis = join(wortel, "thuis");
  mkdirSync(thuis);
  const env = {
    PATH: `${nep.pad}:${process.env.PATH}`,
    HOME: thuis,
    CLAUDE_CONFIG_DIR: join(thuis, ".claude"),
    TMPDIR: tmp,
    STACK_TEMPLATE_REPO: template,
    ...insteadOfEnv(githubUrl, klant.origin),
  };
  const bijwerken = (argv, cwd = klant.checkout) => {
    const uit = spawnSync(process.execPath, [join(v42, "skills/updaten/scripts/bijwerken.mjs"), ...argv], { cwd, env, encoding: "utf8", timeout: 60000 });
    assert.ok(uit.stdout, `geen uitvoer van v42: ${uit.stderr}`);
    return { code: uit.status, uitkomst: JSON.parse(uit.stdout) };
  };
  const hook = (event, extra = {}) => {
    const uit = spawnSync(process.execPath, [join(v42, "hooks/stack-hook.mjs")], {
      input: JSON.stringify(event),
      env: { PATH: process.env.PATH, HOME: thuis, CLAUDE_PLUGIN_DATA: join(wortel, "data"), STAGETWO_UPDATES_TEST: "geen", STAGETWO_ANDERE_APPS_TEST: "geen", STACK_VERSIE_OP_AFSTAND_TEST: "43", ...extra },
      encoding: "utf8",
      timeout: 10000,
    });
    return { status: uit.status, stdout: uit.stdout, stderr: uit.stderr };
  };
  const werkmappen = () => readdirSync(tmp).filter((n) => n.startsWith("stack-bijwerken-"));
  return { wortel, klant, nep, bijwerken, hook, werkmappen, opruimen: () => opruimen(wortel) };
}

const start = (cwd) => ({ hook_event_name: "SessionStart", session_id: "t", cwd, source: "startup" });
const pre = (cwd, tool_name, tool_input) => ({ hook_event_name: "PreToolUse", session_id: "t", cwd, tool_name, tool_input });

/** De letterlijke reden van v42 voor een variant die hij niet kent. */
const ANDER_SPOOR =
  'deze app heeft variant "cloudflare-openbaar" in .claude/stack-manifest.json en is niet van tier 2; deze plugin werkt alleen apps uit de template voor tier 2 bij';

test("v42: updaten stopt op een app met variant cloudflare-openbaar, gewoon en met --repo, zonder werkmap", { skip: OVERSLAAN }, () => {
  const w = wereld("cloudflare-openbaar");
  try {
    const gewoon = w.bijwerken(["--json", "--droogloop"]);
    assert.deepEqual(gewoon.uitkomst, { status: "ander-spoor", reden: ANDER_SPOOR });
    assert.equal(gewoon.code, 0);

    const leeg = join(w.wortel, "leeg");
    mkdirSync(leeg);
    const opAfstand = w.bijwerken(["--json", "--droogloop", "--repo", "klant/shop", "--checkout", leeg], leeg);
    assert.deepEqual(opAfstand.uitkomst, { status: "ander-spoor", reden: ANDER_SPOOR });

    assert.deepEqual(w.werkmappen(), [], "geen werkmap achtergelaten");
    // Met --repo vraagt v42 vóór het klonen alleen de open pull requests op (lezen); verder niets.
    assert.ok(!w.nep.aanroepen().some((a) => a[0] === "pr" && a[1] !== "list"), "geen pull request aangeraakt");
    assert.equal(git(w.klant.checkout, "status", "--porcelain"), "", "de app is niet veranderd");
  } finally {
    w.opruimen();
  }
});

test("v42 ter controle: met variant cloudflare werkt hij dezelfde openbare app wel bij met de gewone template", { skip: OVERSLAAN }, () => {
  const w = wereld("cloudflare");
  try {
    const r = w.bijwerken(["--json", "--droogloop"]);
    assert.equal(r.uitkomst.status, "klaar", JSON.stringify(r.uitkomst));
    // Bestanden van de gewone template (STACK_TEMPLATE_REPO) staan klaar voor deze openbare app.
    assert.equal(r.uitkomst.naar, 9);
    assert.ok(r.uitkomst.bijgewerkt.some((b) => b.pad === "scripts/guard-nieuw.mjs"), JSON.stringify(r.uitkomst.bijgewerkt));
  } finally {
    w.opruimen();
  }
});

test("v42: de hook zegt niets bij sessiestart, bewaakt niets en noemt de app niet bij de andere apps", { skip: OVERSLAAN }, () => {
  const w = wereld("cloudflare-openbaar");
  try {
    const app = w.klant.checkout;
    assert.deepEqual(w.hook(start(app), { CLAUDE_PROJECT_DIR: app }), { status: 0, stdout: "", stderr: "" }, "sessiestart in de app");
    assert.deepEqual(
      w.hook(pre(app, "Edit", { file_path: join(app, "scripts/guard-oud.mjs") }), { CLAUDE_PROJECT_DIR: app }),
      { status: 0, stdout: "", stderr: "" },
      "PreToolUse in de app",
    );

    // Een werkmap met alleen deze app eronder: ook niets.
    const werkmap = join(w.wortel, "werkmap");
    mkdirSync(werkmap);
    cpSync(app, join(werkmap, "shop"), { recursive: true });
    assert.deepEqual(w.hook(start(werkmap), { CLAUDE_PROJECT_DIR: werkmap }), { status: 0, stdout: "", stderr: "" }, "sessiestart in de werkmap");

    // Vanuit een gewone app van tier 2 op 9: de openbare app op 8 telt niet als andere app die achterloopt.
    const gewoon = join(w.wortel, "gewoon");
    mkdirSync(join(gewoon, ".claude"), { recursive: true });
    writeFileSync(join(gewoon, ".claude", "stack-version"), "9\n");
    writeFileSync(join(gewoon, ".claude", "stack-manifest.json"), templateBestanden(9)[".claude/stack-manifest.json"]);
    git(gewoon, "init", "-q");
    git(gewoon, "remote", "add", "origin", "https://github.com/klant/gewoon.git");
    const node = (naam, manifest) => ({ nameWithOwner: `klant/${naam}`, viewerPermission: "WRITE", isTemplate: false, manifest: { text: manifest }, versie: { text: "8\n" } });
    const antwoord = (...nodes) => JSON.stringify({ data: { repositoryOwner: { repositories: { nodes } } } });
    const metOpenbaar = w.hook(start(gewoon), { CLAUDE_PROJECT_DIR: gewoon, STACK_VERSIE_OP_AFSTAND_TEST: "9", STAGETWO_ANDERE_APPS_TEST: antwoord(node("shop", openbaarManifest())) });
    assert.equal(metOpenbaar.stdout, "", "geen regel over de openbare app");
    // Ter controle: met variant cloudflare had v42 hem wel genoemd.
    const opslag = join(w.wortel, "data");
    for (const naam of readdirSync(opslag)) writeFileSync(join(opslag, naam), "{}");
    const metOud = w.hook(start(gewoon), { CLAUDE_PROJECT_DIR: gewoon, STACK_VERSIE_OP_AFSTAND_TEST: "9", STAGETWO_ANDERE_APPS_TEST: antwoord(node("shop", openbaarManifest("cloudflare"))) });
    assert.match(metOud.stdout, /shop \(versie 8\)/);
  } finally {
    w.opruimen();
  }
});
