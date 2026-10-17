import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { STAGE_TWO } from "../lib/levering.mjs";
import { pluginBron } from "../lib/plugin-bron.mjs";
import { leesAbonnees, leesOpties, leveringVoor, leverUit, templateVersies, uitleverenAanKlant } from "./uitleveren.mjs";

const git = (map, ...args) => execFileSync("git", ["-C", map, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function metMap(fn) {
  const map = mkdtempSync(join(tmpdir(), "uitleveren-test-"));
  try {
    return fn(map);
  } finally {
    rmSync(map, { recursive: true, force: true });
  }
}

function schrijf(map, bestanden) {
  for (const [pad, inhoud] of Object.entries(bestanden)) {
    mkdirSync(dirname(join(map, pad)), { recursive: true });
    writeFileSync(join(map, pad), inhoud);
  }
}

function repo(map, bestanden = {}) {
  mkdirSync(map, { recursive: true });
  git(map, "init", "-q", "-b", "main");
  git(map, "config", "user.name", "Test");
  git(map, "config", "user.email", "test@example.com");
  schrijf(map, bestanden);
  git(map, "add", "-A");
  git(map, "commit", "-q", "-m", "eerste");
  return map;
}

function commitAlles(map, bestanden, tag) {
  schrijf(map, bestanden);
  git(map, "add", "-A");
  git(map, "commit", "-q", "-m", "wijziging");
  if (tag) git(map, "tag", tag);
}

function kaal(map) {
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", map]);
  return map;
}

const toon = (map, ref, pad) => {
  try {
    return git(map, "show", `${ref}:${pad}`);
  } catch {
    return null;
  }
};

test("abonnees.json: orgs als tekst of als object; een vreemde naam is een fout", () => {
  metMap((map) => {
    writeFileSync(join(map, "abonnees.json"), JSON.stringify({ abonnees: ["Winco-Holland-B-V", { org: "Richplant-BV", klant: "Richplant" }] }));
    assert.deepEqual(leesAbonnees(map), ["Winco-Holland-B-V", "Richplant-BV"]);
    writeFileSync(join(map, "abonnees.json"), JSON.stringify({ abonnees: ["../evil"] }));
    assert.throws(() => leesAbonnees(map), /geen geldige GitHub-org/);
  });
});

test("de abonneelijst van deze repo is geldig", () => {
  assert.ok(Array.isArray(leesAbonnees()));
});

test("leveringVoor: dezelfde reponamen als bij Stage Two, in de org van de klant", () => {
  const l = leveringVoor("Richplant-BV");
  assert.equal(l.plugin, `Richplant-BV/${STAGE_TWO.plugin.split("/")[1]}`);
  assert.equal(l.template, `Richplant-BV/${STAGE_TWO.template.split("/")[1]}`);
});

test("plugin: zonder abonnees.json en workflow, met levering.json; tweede run doet niets; nieuwe versie komt erbovenop", () => {
  metMap((map) => {
    const bron = repo(join(map, "bron"), {
      ".claude-plugin/plugin.json": JSON.stringify({ version: "2.0.0" }),
      "abonnees.json": JSON.stringify({ abonnees: ["Geheim-BV"] }),
      ".github/workflows/uitleveren.yml": "name: Uitleveren\n",
      ".github/workflows/ci.yml": "name: CI\n",
      "beheer/uitleveren.mjs": "// alleen in de bron\n",
      "beheer/uitleveren.test.mjs": "// alleen in de bron\n",
      "lib/x.mjs": "export const x = 1;\n",
    });
    const doelPlugin = kaal(join(map, "Klant-BV", "stagetwo-plugin-tier2"));
    const doelTemplate = kaal(join(map, "Klant-BV", "app-template-tier2"));
    const tmpl = repo(join(map, "tmpl"), { "README.md": "v1\n" });
    git(tmpl, "tag", "stack-v1");
    const url = (r) => join(map, r);

    const r = uitleverenAanKlant({ org: "Klant-BV", pluginMap: bron, templateUrl: tmpl, url });
    assert.equal(r.plugin.status, "geleverd");
    assert.deepEqual(r.plugin.tags, ["v2.0.0"]);
    assert.equal(toon(doelPlugin, "main", "abonnees.json"), null, "de abonneelijst gaat nooit mee");
    assert.equal(toon(doelPlugin, "main", ".github/workflows/uitleveren.yml"), null);
    assert.equal(toon(doelPlugin, "main", "beheer/uitleveren.mjs"), null, "het uitleveren zelf blijft bij Stage Two");
    assert.equal(toon(doelPlugin, "main", ".github/workflows/ci.yml"), "name: CI");
    assert.deepEqual(JSON.parse(toon(doelPlugin, "v2.0.0", "levering.json")), leveringVoor("Klant-BV"));
    assert.equal(git(doelPlugin, "log", "--format=%an <%ae>|%s", "main"), "Stage Two <info@stagetwo.nl>|Plugin 2.0.0");
    assert.equal(git(doelPlugin, "rev-list", "--count", "main"), "1", "geen geschiedenis van de bron");

    assert.equal(uitleverenAanKlant({ org: "Klant-BV", pluginMap: bron, templateUrl: tmpl, url }).plugin.status, "al-bij");

    commitAlles(bron, { ".claude-plugin/plugin.json": JSON.stringify({ version: "2.1.0" }) });
    const r3 = uitleverenAanKlant({ org: "Klant-BV", pluginMap: bron, templateUrl: tmpl, url });
    assert.deepEqual(r3.plugin.tags, ["v2.1.0"]);
    assert.equal(git(doelPlugin, "rev-list", "--count", "main"), "2");
    assert.equal(git(doelPlugin, "rev-parse", "main^"), git(doelPlugin, "rev-parse", "v2.0.0^{commit}"));
  });
});

test("template: alle tags stack-v<n> op volgorde, main op de nieuwste, latere tag erbovenop", () => {
  metMap((map) => {
    const tmpl = repo(join(map, "tmpl"), { "README.md": "v1\n" });
    git(tmpl, "tag", "stack-v1");
    commitAlles(tmpl, { "README.md": "v2\n" }, "stack-v2");
    commitAlles(tmpl, { "README.md": "v10\n" }, "stack-v10");
    commitAlles(tmpl, { "README.md": "nog niet uit\n" });
    assert.deepEqual(templateVersies(tmpl).map((v) => v.tag), ["stack-v1", "stack-v2", "stack-v10"]);

    const doel = kaal(join(map, "doel"));
    const r = leverUit({ bronMap: tmpl, doelUrl: doel, versies: templateVersies(tmpl) });
    assert.deepEqual(r.tags, ["stack-v1", "stack-v2", "stack-v10"]);
    assert.equal(toon(doel, "main", "README.md"), "v10", "main is de nieuwste versie, niet wat nog op main van de bron staat");
    assert.equal(toon(doel, "stack-v2", "README.md"), "v2");
    assert.equal(git(doel, "log", "--format=%s", "main"), "Versie 10\nVersie 2\nVersie 1");

    assert.equal(leverUit({ bronMap: tmpl, doelUrl: doel, versies: templateVersies(tmpl) }).status, "al-bij");

    commitAlles(tmpl, { "README.md": "v11\n" }, "stack-v11");
    const droog = leverUit({ bronMap: tmpl, doelUrl: doel, versies: templateVersies(tmpl), droog: true });
    assert.deepEqual(droog, { status: "zou-leveren", repo: doel, tags: ["stack-v11"] });
    assert.equal(toon(doel, "main", "README.md"), "v10", "droog schrijft niets");
    leverUit({ bronMap: tmpl, doelUrl: doel, versies: templateVersies(tmpl) });
    assert.equal(toon(doel, "main", "README.md"), "v11");
  });
});

test("nooit forceren: staat er een vreemde commit op de leveringsrepo, dan komt de nieuwe versie erbovenop", () => {
  metMap((map) => {
    const tmpl = repo(join(map, "tmpl"), { "README.md": "v1\n" });
    git(tmpl, "tag", "stack-v1");
    const doel = kaal(join(map, "doel"));
    leverUit({ bronMap: tmpl, doelUrl: doel, versies: templateVersies(tmpl) });

    const ander = join(map, "ander");
    execFileSync("git", ["clone", "-q", doel, ander]);
    git(ander, "config", "user.name", "Iemand");
    git(ander, "config", "user.email", "iemand@example.com");
    commitAlles(ander, { "eigen.txt": "x\n" });
    git(ander, "push", "-q", "origin", "main");

    commitAlles(tmpl, { "README.md": "v2\n" }, "stack-v2");
    // De vreemde commit staat nu op main; de nieuwe versie komt erbovenop, want we bouwen
    // altijd verder op wat er staat. Zijn bestand verdwijnt dan wel uit de boom.
    leverUit({ bronMap: tmpl, doelUrl: doel, versies: templateVersies(tmpl) });
    assert.equal(git(doel, "log", "--format=%an", "-2", "main"), "Stage Two\nIemand", "de commit van iemand anders blijft in de geschiedenis");
  });
});

test("template bij de klant: .claude/settings.json wijst naar de plugin in zijn eigen org, de rest is gelijk", () => {
  metMap((map) => {
    const settings = (repo) =>
      `${JSON.stringify({ extraKnownMarketplaces: { "stagetwo-tier2": { source: { source: "github", repo }, autoUpdate: true } } }, null, 2)}\n`;
    const bron = repo(join(map, "bron"), { ".claude-plugin/plugin.json": JSON.stringify({ version: "2.4.0" }) });
    const tmpl = repo(join(map, "tmpl"), { "README.md": "v1\n" });
    git(tmpl, "tag", "stack-v1");
    commitAlles(tmpl, { "README.md": "v2\n", ".claude/settings.json": settings(STAGE_TWO.plugin) }, "stack-v2");
    kaal(join(map, "Klant-BV", "stagetwo-plugin-tier2"));
    const doelTemplate = kaal(join(map, "Klant-BV", "app-template-tier2"));
    const url = (r) => join(map, r);

    const r = uitleverenAanKlant({ org: "Klant-BV", pluginMap: bron, templateUrl: tmpl, url });
    assert.deepEqual(r.template.tags, ["stack-v1", "stack-v2"], "een versie zonder settings.json gaat gewoon mee");
    const geleverd = execFileSync("git", ["-C", doelTemplate, "show", "stack-v2:.claude/settings.json"], { encoding: "utf8" });
    assert.equal(pluginBron(geleverd), "Klant-BV/stagetwo-plugin-tier2");
    assert.equal(geleverd, settings("Klant-BV/stagetwo-plugin-tier2"), "alleen de bron verandert, de opmaak blijft");
    assert.equal(toon(doelTemplate, "stack-v2", "README.md"), "v2");
    assert.equal(uitleverenAanKlant({ org: "Klant-BV", pluginMap: bron, templateUrl: tmpl, url }).template.status, "al-bij");
  });
});

test("workflow Uitleveren: alleen bij een nieuwe versie, een nieuwe abonnee of met de hand, niet meer elk uur", () => {
  const yml = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", ".github", "workflows", "uitleveren.yml"), "utf8");
  const aan = yml.slice(yml.indexOf("\non:"), yml.indexOf("\npermissions:"));
  assert.doesNotMatch(aan, /schedule|cron/, "geen schema meer");
  assert.match(aan, /workflow_dispatch:/);
  assert.match(aan, /push:\s+branches: \[main\]\s+paths:/);
  assert.match(aan, /- "\.claude-plugin\/plugin\.json"/);
  assert.match(aan, /- "abonnees\.json"/);
});

test("opdrachtregel: --template geeft een eigen bron voor de template (afgeschermde bronrepo)", () => {
  assert.deepEqual(leesOpties(["--org", "Klant-BV"]), { org: "Klant-BV", droog: false });
  assert.deepEqual(leesOpties(["--org", "Klant-BV", "--template", "/w/.bron-template", "--droog"]), {
    org: "Klant-BV",
    droog: true,
    templateUrl: "/w/.bron-template",
  });
  assert.throws(() => leesOpties(["--org", "Klant-BV", "--template"]), /vraagt een waarde/);
});

test("template uit een eigen checkout (zoals de workflow die meegeeft) levert dezelfde tags", () => {
  metMap((map) => {
    const bron = repo(join(map, "bron"), { ".claude-plugin/plugin.json": JSON.stringify({ version: "2.4.0" }) });
    const checkout = repo(join(map, ".bron-template"), { "README.md": "v1\n" });
    git(checkout, "tag", "stack-v1");
    kaal(join(map, "Klant-BV", "stagetwo-plugin-tier2"));
    const doelTemplate = kaal(join(map, "Klant-BV", "app-template-tier2"));
    const r = uitleverenAanKlant({ ...leesOpties(["--org", "Klant-BV", "--template", checkout]), pluginMap: bron, url: (r) => join(map, r) });
    assert.deepEqual(r.template.tags, ["stack-v1"]);
    assert.equal(toon(doelTemplate, "stack-v1", "README.md"), "v1");
  });
});
