import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import { STAGE_TWO } from "../lib/levering.mjs";
import { pluginBron } from "../lib/plugin-bron.mjs";
import { ALLEEN_IN_BRON, controleerToegepast, hoogstePluginVersie, leesAbonnees, leesAbonneesMetKeuzes, leesOptiesOpenbaar, leesToegepastTemplate, leesOpties, leveringVoor, leverUit, meldingBron, meldingKlant, openbaarVoor, pluginVersies, templateVersies, uitleverenAanKlant, uitleverenOpenbaar } from "./uitleveren.mjs";

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

test("plugin: vanaf de tag, zonder abonnees.json en workflow, met levering.json; tweede run doet niets; nieuwe versie komt erbovenop", () => {
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
    git(bron, "tag", "v2.0.0");
    // Een commit na de tag: niet toegepast, mag nooit naar de klant.
    commitAlles(bron, { "lib/x.mjs": "export const x = 'niet-toegepast';\n" });
    const doelPlugin = kaal(join(map, "Klant-BV", "stagetwo-plugin-tier2"));
    const doelTemplate = kaal(join(map, "Klant-BV", "app-template-tier2"));
    const tmpl = repo(join(map, "tmpl"), { "README.md": "v1\n" });
    git(tmpl, "tag", "stack-v1");
    const url = (r) => join(map, r);

    const r = uitleverenAanKlant({ org: "Klant-BV", toegepastVersie: "2.0.0", toegepastTemplate: "stack-v1", pluginMap: bron, templateUrl: tmpl, url });
    assert.equal(r.plugin.status, "geleverd");
    assert.equal(git(doelPlugin, "tag", "--list"), "v2.0.0", "bij de klant dezelfde tag als in de bron");
    assert.equal(toon(doelPlugin, "v2.0.0", "lib/x.mjs"), "export const x = 1;", "de inhoud van de tag, niet van HEAD van main");
    assert.match(git(doelPlugin, "log", "-1", "--format=%b", "main"), new RegExp(`@${git(bron, "rev-parse", "v2.0.0^{commit}")} \\(tag v2\\.0\\.0\\)`));
    assert.deepEqual(r.plugin.tags, ["v2.0.0"]);
    assert.equal(toon(doelPlugin, "main", "abonnees.json"), null, "de abonneelijst gaat nooit mee");
    assert.equal(toon(doelPlugin, "main", ".github/workflows/uitleveren.yml"), null);
    assert.equal(toon(doelPlugin, "main", "beheer/uitleveren.mjs"), null, "het uitleveren zelf blijft bij Stage Two");
    assert.equal(toon(doelPlugin, "main", ".github/workflows/ci.yml"), "name: CI");
    assert.deepEqual(JSON.parse(toon(doelPlugin, "v2.0.0", "levering.json")), leveringVoor("Klant-BV"));
    assert.equal(git(doelPlugin, "log", "--format=%an <%ae>|%s", "main"), "Stage Two <info@stagetwo.nl>|Plugin 2.0.0");
    assert.equal(git(doelPlugin, "rev-list", "--count", "main"), "1", "geen geschiedenis van de bron");

    assert.equal(uitleverenAanKlant({ org: "Klant-BV", toegepastVersie: "2.0.0", toegepastTemplate: "stack-v1", pluginMap: bron, templateUrl: tmpl, url }).plugin.status, "al-bij");

    commitAlles(bron, { ".claude-plugin/plugin.json": JSON.stringify({ version: "2.1.0" }) }, "v2.1.0");
    const r3 = uitleverenAanKlant({ org: "Klant-BV", toegepastVersie: "v2.1.0", toegepastTemplate: "stack-v1", pluginMap: bron, templateUrl: tmpl, url });
    assert.deepEqual(r3.plugin.tags, ["v2.1.0"]);
    assert.equal(toon(doelPlugin, "v2.1.0", "lib/x.mjs"), "export const x = 'niet-toegepast';", "die commit zat wel in de getagde 2.1.0");
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
    const bron = repo(join(map, "bron"), { ".claude-plugin/plugin.json": JSON.stringify({ version: "26.0.0" }) });
    git(bron, "tag", "v26.0.0");
    const tmpl = repo(join(map, "tmpl"), { "README.md": "v1\n" });
    git(tmpl, "tag", "stack-v1");
    commitAlles(tmpl, { "README.md": "v2\n", ".claude/settings.json": settings(STAGE_TWO.plugin) }, "stack-v2");
    kaal(join(map, "Klant-BV", "stagetwo-plugin-tier2"));
    const doelTemplate = kaal(join(map, "Klant-BV", "app-template-tier2"));
    const url = (r) => join(map, r);

    const r = uitleverenAanKlant({ org: "Klant-BV", toegepastVersie: "26.0.0", toegepastTemplate: "stack-v2", pluginMap: bron, templateUrl: tmpl, url });
    assert.deepEqual(r.template.tags, ["stack-v1", "stack-v2"], "een versie zonder settings.json gaat gewoon mee");
    const geleverd = execFileSync("git", ["-C", doelTemplate, "show", "stack-v2:.claude/settings.json"], { encoding: "utf8" });
    assert.equal(pluginBron(geleverd), "Klant-BV/stagetwo-plugin-tier2");
    assert.equal(geleverd, settings("Klant-BV/stagetwo-plugin-tier2"), "alleen de bron verandert, de opmaak blijft");
    assert.equal(toon(doelTemplate, "stack-v2", "README.md"), "v2");
    assert.equal(uitleverenAanKlant({ org: "Klant-BV", toegepastVersie: "26.0.0", toegepastTemplate: "stack-v2", pluginMap: bron, templateUrl: tmpl, url }).template.status, "al-bij");
  });
});

test("plugin: een abonnee die na de tag op de lijst kwam, blokkeert het uitleveren niet", () => {
  metMap((map) => {
    const bron = repo(join(map, "bron"), {
      ".claude-plugin/plugin.json": JSON.stringify({ version: "2.0.0" }),
      "abonnees.json": JSON.stringify({ abonnees: [] }),
      "lib/x.mjs": "export const x = 1;\n",
    });
    git(bron, "tag", "v2.0.0");
    commitAlles(bron, { "abonnees.json": JSON.stringify({ abonnees: ["Klant-BV"] }) });
    const doelPlugin = kaal(join(map, "Klant-BV", "stagetwo-plugin-tier2"));
    kaal(join(map, "Klant-BV", "app-template-tier2"));
    const tmpl = repo(join(map, "tmpl"), { "README.md": "v1\n" });
    git(tmpl, "tag", "stack-v1");

    const r = uitleverenAanKlant({ org: "Klant-BV", toegepastVersie: "2.0.0", toegepastTemplate: "stack-v1", pluginMap: bron, templateUrl: tmpl, url: (r) => join(map, r) });
    assert.equal(r.plugin.status, "geleverd");
    assert.equal(toon(doelPlugin, "main", "abonnees.json"), null);
    assert.equal(git(bron, "status", "--porcelain"), "", "de werkmap van de bron blijft ongemoeid");
  });
});

test("workflow Uitleveren: een omschrijving met een dubbele punt staat tussen aanhalingstekens (anders is het bestand ongeldig)", () => {
  const yml = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", ".github", "workflows", "uitleveren.yml"), "utf8");
  for (const regel of yml.split("\n").filter((r) => /^\s+description: /.test(r))) {
    const waarde = regel.replace(/^\s+description: /, "");
    if (waarde.includes(": ")) assert.match(waarde, /^['"]/, regel.trim());
  }
});

test("workflow Uitleveren: alleen met de hand, niet bij een merge en niet elk uur", () => {
  const yml = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", ".github", "workflows", "uitleveren.yml"), "utf8");
  const aan = yml.slice(yml.indexOf("\non:"), yml.indexOf("\npermissions:"));
  assert.doesNotMatch(aan, /schedule|cron/, "geen schema meer");
  assert.match(aan, /workflow_dispatch:/);
  assert.doesNotMatch(aan, /push:|pull_request|release:|tags:/, "een merge naar main levert niets aan klanten: eerst controleert Stage Two de versie op de eigen apps");
});

test("opdrachtregel: --template geeft een eigen bron voor de template (afgeschermde bronrepo)", () => {
  assert.deepEqual(leesOpties(["--org", "Klant-BV"]), { org: "Klant-BV", toegepastVersie: null, toegepastTemplate: null, droog: false });
  assert.deepEqual(leesOpties(["--org", "Klant-BV", "--toegepast", "26.0.0", "--toegepast-template", "stack-v3", "--template", "/w/.bron-template", "--droog"]), {
    org: "Klant-BV",
    toegepastVersie: "26.0.0",
    toegepastTemplate: "stack-v3",
    droog: true,
    templateUrl: "/w/.bron-template",
  });
  assert.throws(() => leesOpties(["--org", "Klant-BV", "--template"]), /vraagt een waarde/);
});

test("template uit een eigen checkout (zoals de workflow die meegeeft) levert dezelfde tags", () => {
  metMap((map) => {
    const bron = repo(join(map, "bron"), { ".claude-plugin/plugin.json": JSON.stringify({ version: "26.0.0" }) });
    git(bron, "tag", "v26.0.0");
    const checkout = repo(join(map, ".bron-template"), { "README.md": "v1\n" });
    git(checkout, "tag", "stack-v1");
    kaal(join(map, "Klant-BV", "stagetwo-plugin-tier2"));
    const doelTemplate = kaal(join(map, "Klant-BV", "app-template-tier2"));
    const r = uitleverenAanKlant({ ...leesOpties(["--org", "Klant-BV", "--toegepast", "26.0.0", "--toegepast-template", "stack-v1", "--template", checkout]), pluginMap: bron, url: (r) => join(map, r) });
    assert.deepEqual(r.template.tags, ["stack-v1"]);
    assert.equal(toon(doelTemplate, "stack-v1", "README.md"), "v1");
  });
});

test("controleerToegepast: de tag v<versie> moet bestaan en plugin.json op die tag dezelfde versie hebben", () => {
  metMap((map) => {
    const bron = repo(join(map, "bron"), { ".claude-plugin/plugin.json": JSON.stringify({ version: "26.0.0" }) });
    assert.throws(() => controleerToegepast("26.0.0", bron), /de tag v26\.0\.0 bestaat niet in de bronrepo.*eigen apps.*git tag v<versie>/);
    git(bron, "tag", "v26.0.0");
    assert.equal(controleerToegepast("26.0.0", bron), "26.0.0");
    assert.equal(controleerToegepast(" v26.0.0 ", bron), "26.0.0");
    for (const fout of ["", undefined, "26", "2.4", "laatste"]) {
      assert.throws(() => controleerToegepast(fout, bron), /toegepast_versie is .*moet een pluginversie zijn, zoals 26\.0\.0/);
    }
    assert.throws(() => controleerToegepast("2.3.0", bron), /de tag v2\.3\.0 bestaat niet/);

    // Een latere commit op main met een hogere versie verandert niets aan wat de tag levert.
    commitAlles(bron, { ".claude-plugin/plugin.json": JSON.stringify({ version: "27.0.0" }) });
    assert.equal(controleerToegepast("26.0.0", bron), "26.0.0");
    assert.throws(() => controleerToegepast("27.0.0", bron), /de tag v27\.0\.0 bestaat niet/, "nog niet getagd, dus nog niet toegepast");

    // Een tag op de verkeerde commit (plugin.json heeft daar een andere versie).
    git(bron, "tag", "v28.0.0");
    assert.throws(() => controleerToegepast("28.0.0", bron), /plugin\.json op de tag v28\.0\.0 heeft versie 27\.0\.0.*niets naar een klant/);
  });
});

test("pluginVersies: de commit achter de tag, bij de klant dezelfde tag v<versie>", () => {
  metMap((map) => {
    const bron = repo(join(map, "bron"), { ".claude-plugin/plugin.json": JSON.stringify({ version: "26.0.0" }) });
    git(bron, "tag", "-a", "v26.0.0", "-m", "Versie 26.0.0");
    commitAlles(bron, { "na-de-tag.txt": "x\n" });
    const [v] = pluginVersies(bron, "26.0.0");
    assert.equal(v.tag, "v26.0.0");
    assert.equal(v.ref, git(bron, "rev-parse", "v26.0.0^{commit}"), "ook bij een geannoteerde tag de commit");
    assert.notEqual(v.ref, git(bron, "rev-parse", "HEAD"));
  });
});

test("uitleverenAanKlant: zonder tag of met een verkeerde toegepast_versie gaat er niets naar de klant", () => {
  metMap((map) => {
    const bron = repo(join(map, "bron"), { ".claude-plugin/plugin.json": JSON.stringify({ version: "26.0.0" }) });
    const tmpl = repo(join(map, "tmpl"), { "README.md": "v1\n" });
    git(tmpl, "tag", "stack-v1");
    const doelPlugin = kaal(join(map, "Klant-BV", "stagetwo-plugin-tier2"));
    const doelTemplate = kaal(join(map, "Klant-BV", "app-template-tier2"));
    const url = (r) => join(map, r);
    const leeg = (doel) => git(doel, "for-each-ref").length === 0;
    assert.throws(() => uitleverenAanKlant({ org: "Klant-BV", toegepastVersie: "26.0.0", toegepastTemplate: "stack-v1", pluginMap: bron, templateUrl: tmpl, url }), /de tag v26\.0\.0 bestaat niet/);
    assert.throws(() => uitleverenAanKlant({ org: "Klant-BV", toegepastTemplate: "stack-v1", pluginMap: bron, templateUrl: tmpl, url }), /toegepast_versie is ""/);
    assert.ok(leeg(doelPlugin) && leeg(doelTemplate), "ook de template blijft staan");
  });
});

test("uitleverenAanKlant: een oudere versie gaat nooit over een nieuwere bij de klant heen", () => {
  metMap((map) => {
    const bron = repo(join(map, "bron"), { ".claude-plugin/plugin.json": JSON.stringify({ version: "2.3.0" }) });
    git(bron, "tag", "v2.3.0");
    commitAlles(bron, { ".claude-plugin/plugin.json": JSON.stringify({ version: "26.0.0" }) }, "v26.0.0");
    const tmpl = repo(join(map, "tmpl"), { "README.md": "v1\n" });
    git(tmpl, "tag", "stack-v1");
    const doelPlugin = kaal(join(map, "Klant-BV", "stagetwo-plugin-tier2"));
    kaal(join(map, "Klant-BV", "app-template-tier2"));
    const url = (r) => join(map, r);
    uitleverenAanKlant({ org: "Klant-BV", toegepastVersie: "26.0.0", toegepastTemplate: "stack-v1", pluginMap: bron, templateUrl: tmpl, url });
    const voor = git(doelPlugin, "rev-parse", "main");
    assert.throws(
      () => uitleverenAanKlant({ org: "Klant-BV", toegepastVersie: "2.3.0", toegepastTemplate: "stack-v1", pluginMap: bron, templateUrl: tmpl, url }),
      /toegepast_versie is 2\.3\.0, maar Klant-BV\/stagetwo-plugin-tier2 heeft al v26\.0\.0/,
    );
    assert.equal(git(doelPlugin, "rev-parse", "main"), voor);
    assert.equal(hoogstePluginVersie(new Map([["refs/tags/v2.10.0", "a"], ["refs/tags/v2.9.1", "b"], ["refs/heads/main", "c"]])), "2.10.0");
    assert.equal(hoogstePluginVersie(new Map()), null);
  });
});

test("workflow Uitleveren: verplichte invoer toegepast_versie, gecontroleerd vóór de lijst en vóór elke klant", () => {
  const yml = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", ".github", "workflows", "uitleveren.yml"), "utf8");
  const aan = yml.slice(yml.indexOf("\non:"), yml.indexOf("\npermissions:"));
  assert.match(aan, /inputs:\n\s+toegepast_versie:\n\s+description: [^\n]+\n\s+required: true\n\s+type: string/);
  const stap = yml.indexOf("--toegepast");
  assert.ok(stap > 0 && stap < yml.indexOf("--lijst"), "eerst de bevestiging, dan de abonnees");
  assert.ok(stap < yml.indexOf("klant:"), "vóór de job die naar klanten schrijft (die hangt aan abonnees)");
  assert.equal(yml.match(/TOEGEPAST: \$\{\{ inputs\.toegepast_versie \}\}/g)?.length, 2, "in beide jobs");
  assert.doesNotMatch(yml.replace(/TOEGEPAST: \$\{\{ inputs\.toegepast_versie \}\}/g, ""), /inputs\.toegepast_versie/, "invoer alleen via env");
  assert.match(yml, /--org "\$ORG" --toegepast "\$TOEGEPAST" --toegepast-template/, "elke klant krijgt de plugin vanaf de tag van de toegepaste versie");
  const abonnees = yml.slice(yml.indexOf("  abonnees:"), yml.indexOf("  klant:"));
  assert.match(abonnees, /actions\/checkout@v5\n\s+with:\n\s+fetch-depth: 0/, "de controle heeft de tags nodig");
  assert.match(yml, /echo "::error::\$uit"; exit 1/);
});

test("toegepast_template: alleen stack-v<n>, anders een duidelijke melding", () => {
  assert.equal(leesToegepastTemplate("stack-v26"), 26);
  assert.equal(leesToegepastTemplate(" stack-v7 "), 7);
  for (const fout of ["", undefined, null, "26", "v26", "stack-v", "stack-v2x", "stack-v1 stack-v2"]) {
    assert.throws(() => leesToegepastTemplate(fout), /toegepast_template is .*moet een tag van de template zijn, zoals stack-v26.*tot en met die tag/);
  }
});

test("template: alleen tags tot en met toegepast_template; een nieuwere tag gaat niet mee, een onbekende tag is een fout", () => {
  metMap((map) => {
    const tmpl = repo(join(map, "tmpl"), { "README.md": "v1\n" });
    git(tmpl, "tag", "stack-v1");
    commitAlles(tmpl, { "README.md": "v2\n" }, "stack-v2");
    commitAlles(tmpl, { "README.md": "v10\n" }, "stack-v10");
    assert.deepEqual(templateVersies(tmpl, 2).map((v) => v.tag), ["stack-v1", "stack-v2"]);
    assert.deepEqual(templateVersies(tmpl, 10).map((v) => v.tag), ["stack-v1", "stack-v2", "stack-v10"]);
    assert.throws(() => templateVersies(tmpl, 3), /stack-v3, maar die tag bestaat niet in de template \(nieuwste: stack-v10\)/);
  });
});

test("uitleverenAanKlant: zonder of met een onbekende toegepast_template gaat er niets naar de klant, ook geen plugin", () => {
  metMap((map) => {
    const bron = repo(join(map, "bron"), { ".claude-plugin/plugin.json": JSON.stringify({ version: "26.0.0" }) });
    git(bron, "tag", "v26.0.0");
    const tmpl = repo(join(map, "tmpl"), { "README.md": "v1\n" });
    git(tmpl, "tag", "stack-v1");
    commitAlles(tmpl, { "README.md": "v2\n" }, "stack-v2");
    const doelPlugin = kaal(join(map, "Klant-BV", "stagetwo-plugin-tier2"));
    const doelTemplate = kaal(join(map, "Klant-BV", "app-template-tier2"));
    const url = (r) => join(map, r);
    const leeg = (doel) => git(doel, "for-each-ref").length === 0;

    assert.throws(() => uitleverenAanKlant({ org: "Klant-BV", toegepastVersie: "26.0.0", pluginMap: bron, templateUrl: tmpl, url }), /toegepast_template is ""/);
    assert.throws(() => uitleverenAanKlant({ org: "Klant-BV", toegepastVersie: "26.0.0", toegepastTemplate: "stack-v9", pluginMap: bron, templateUrl: tmpl, url }), /bestaat niet/);
    assert.ok(leeg(doelPlugin) && leeg(doelTemplate), "na een fout staat er niets bij de klant");

    const r = uitleverenAanKlant({ org: "Klant-BV", toegepastVersie: "26.0.0", toegepastTemplate: "stack-v1", pluginMap: bron, templateUrl: tmpl, url });
    assert.deepEqual(r.template.tags, ["stack-v1"], "stack-v2 is nog niet toegepast en gaat niet mee");
    assert.equal(toon(doelTemplate, "main", "README.md"), "v1");
    assert.equal(git(doelTemplate, "tag", "--list"), "stack-v1");
  });
});

test("workflow Uitleveren: verplichte invoer toegepast_template, gecontroleerd vóór de lijst en meegegeven aan elke klant", () => {
  const yml = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", ".github", "workflows", "uitleveren.yml"), "utf8");
  const aan = yml.slice(yml.indexOf("\non:"), yml.indexOf("\npermissions:"));
  assert.match(aan, /\n\s+toegepast_template:\n\s+description: [^\n]+\n\s+required: true\n\s+type: string/);
  assert.match(yml, /--toegepast "\$TOEGEPAST" --toegepast-template "\$TOEGEPAST_TEMPLATE"/);
  assert.ok(yml.indexOf("--toegepast-template") < yml.indexOf("--lijst"), "eerst de bevestiging, dan de abonnees");
  assert.match(yml, /--org "\$ORG" --toegepast "\$TOEGEPAST" --toegepast-template "\$TOEGEPAST_TEMPLATE"/);
  assert.equal(yml.match(/TOEGEPAST_TEMPLATE: \$\{\{ inputs\.toegepast_template \}\}/g)?.length, 3, "in beide jobs en bij de openbare template, alleen via env");
  assert.equal(yml.match(/inputs\.toegepast_template/g)?.length, 3);
});

test("versie 26: een klant met plugin 2.2.0 krijgt 26.0.0 als nieuwere versie; terug naar 2.x weigert", () => {
  metMap((map) => {
    const bron = repo(join(map, "bron"), { ".claude-plugin/plugin.json": JSON.stringify({ version: "2.2.0" }) });
    git(bron, "tag", "v2.2.0");
    commitAlles(bron, { ".claude-plugin/plugin.json": JSON.stringify({ version: "26.0.0" }) }, "v26.0.0");
    const tmpl = repo(join(map, "tmpl"), { "README.md": "v1\n" });
    git(tmpl, "tag", "stack-v1");
    const doelPlugin = kaal(join(map, "Klant-BV", "stagetwo-plugin-tier2"));
    kaal(join(map, "Klant-BV", "app-template-tier2"));
    const url = (r) => join(map, r);

    uitleverenAanKlant({ org: "Klant-BV", toegepastVersie: "2.2.0", toegepastTemplate: "stack-v1", pluginMap: bron, templateUrl: tmpl, url });
    const r = uitleverenAanKlant({ org: "Klant-BV", toegepastVersie: "26.0.0", toegepastTemplate: "stack-v1", pluginMap: bron, templateUrl: tmpl, url });
    assert.equal(r.plugin.status, "geleverd");
    assert.deepEqual(r.plugin.tags, ["v26.0.0"]);
    assert.equal(JSON.parse(toon(doelPlugin, "main", ".claude-plugin/plugin.json")).version, "26.0.0");
    assert.throws(
      () => uitleverenAanKlant({ org: "Klant-BV", toegepastVersie: "2.2.0", toegepastTemplate: "stack-v1", pluginMap: bron, templateUrl: tmpl, url }),
      /toegepast_versie is 2\.2\.0, maar Klant-BV\/stagetwo-plugin-tier2 heeft al v26\.0\.0/,
    );
    const refs = new Map([["refs/tags/v2.2.0", "a"], ["refs/tags/v26.0.0", "b"], ["refs/tags/v2.10.0", "c"], ["refs/tags/v3.0.0", "d"]]);
    assert.equal(hoogstePluginVersie(refs), "26.0.0", "getallen, geen tekstvolgorde");
  });
});

test("versie 26: overgeslagen templatenummers; de klant krijgt alleen wat hij nog niet heeft", () => {
  metMap((map) => {
    const bron = repo(join(map, "bron"), { ".claude-plugin/plugin.json": JSON.stringify({ version: "26.0.0" }) });
    git(bron, "tag", "v26.0.0");
    const tmpl = repo(join(map, "tmpl"), { "README.md": "v21\n" });
    git(tmpl, "tag", "stack-v21");
    commitAlles(tmpl, { "README.md": "v24\n" }, "stack-v24");
    commitAlles(tmpl, { "README.md": "v26\n" }, "stack-v26");
    kaal(join(map, "Klant-BV", "stagetwo-plugin-tier2"));
    const doelTemplate = kaal(join(map, "Klant-BV", "app-template-tier2"));
    const url = (r) => join(map, r);

    assert.deepEqual(templateVersies(tmpl, 26).map((v) => v.tag), ["stack-v21", "stack-v24", "stack-v26"]);
    assert.throws(() => templateVersies(tmpl, 25), /stack-v25, maar die tag bestaat niet in de template \(nieuwste: stack-v26\)/);
    assert.deepEqual(uitleverenAanKlant({ org: "Klant-BV", toegepastVersie: "26.0.0", toegepastTemplate: "stack-v21", pluginMap: bron, templateUrl: tmpl, url }).template.tags, ["stack-v21"]);
    const r = uitleverenAanKlant({ org: "Klant-BV", toegepastVersie: "26.0.0", toegepastTemplate: "stack-v26", pluginMap: bron, templateUrl: tmpl, url });
    assert.deepEqual(r.template.tags, ["stack-v24", "stack-v26"]);
    assert.equal(toon(doelTemplate, "main", "README.md"), "v26");
  });
});

// ---------------------------------------------------------------- de openbare template (versie 43)

const HIER = dirname(fileURLToPath(import.meta.url));
const YML = () => readFileSync(join(HIER, "..", ".github", "workflows", "uitleveren.yml"), "utf8");

test("abonnees.json: openbaar is per abonnee, alleen true telt, een vreemde waarde is een fout", () => {
  metMap((map) => {
    writeFileSync(join(map, "abonnees.json"), JSON.stringify({ abonnees: ["Oud-BV", { org: "Winco-Holland-B-V", klant: "Winco", openbaar: true }, { org: "Richplant-BV", openbaar: false }] }));
    assert.deepEqual(leesAbonnees(map), ["Oud-BV", "Winco-Holland-B-V", "Richplant-BV"], "de lijst voor de matrix blijft alleen orgs");
    assert.deepEqual(leesAbonneesMetKeuzes(map), [
      { org: "Oud-BV", openbaar: false },
      { org: "Winco-Holland-B-V", openbaar: true },
      { org: "Richplant-BV", openbaar: false },
    ]);
    assert.equal(openbaarVoor("winco-holland-b-v", map), true);
    assert.equal(openbaarVoor("Richplant-BV", map), false);
    assert.equal(openbaarVoor("Onbekend", map), false);
    writeFileSync(join(map, "abonnees.json"), JSON.stringify({ abonnees: [{ org: "Winco-Holland-B-V", openbaar: "ja" }] }));
    assert.throws(() => leesAbonneesMetKeuzes(map), /bij "Winco-Holland-B-V" is openbaar "ja"; dat is true of false/);
  });
});

test("de abonneelijst van deze repo: niemand staat op openbaar (dat beslist de eigenaar)", () => {
  assert.ok(leesAbonneesMetKeuzes().every((a) => a.openbaar === false));
});

test("leveringVoor: met openbaar een derde repo; zonder precies de twee van versie 42", () => {
  assert.deepEqual(Object.keys(leveringVoor("Klant-BV")), ["plugin", "template"]);
  assert.deepEqual(leveringVoor("Klant-BV", { openbaar: true }), {
    plugin: "Klant-BV/stagetwo-plugin-tier2",
    template: "Klant-BV/app-template-tier2",
    templateOpenbaar: "Klant-BV/app-template-tier2-openbaar",
  });
});

/** Een wereld met plugin (v26.0.0), gewone template en openbare template (stack-v1 en stack-v2). */
function openbareWereld(map, { klantRepo = true } = {}) {
  const bron = repo(join(map, "bron"), { ".claude-plugin/plugin.json": JSON.stringify({ version: "26.0.0" }), "abonnees.json": "{}" });
  git(bron, "tag", "v26.0.0");
  const tmpl = repo(join(map, "tmpl"), { "README.md": "gewoon v1\n" });
  git(tmpl, "tag", "stack-v1");
  commitAlles(tmpl, { "README.md": "gewoon v2\n" }, "stack-v2");
  const settings = `${JSON.stringify({ extraKnownMarketplaces: { "stagetwo-tier2": { source: { source: "github", repo: STAGE_TWO.plugin } } } }, null, 2)}\n`;
  const openbaar = repo(join(map, "openbaar"), { "README.md": "openbaar v2\n", ".claude/settings.json": settings });
  git(openbaar, "tag", "stack-v2");
  kaal(join(map, "Klant-BV", "stagetwo-plugin-tier2"));
  kaal(join(map, "Klant-BV", "app-template-tier2"));
  const doelOpenbaar = klantRepo ? kaal(join(map, "Klant-BV", "app-template-tier2-openbaar")) : null;
  return { bron, tmpl, openbaar, doelOpenbaar, url: (r) => join(map, r) };
}

test("openbaar: levering.json krijgt templateOpenbaar, en de openbare template komt per tag zoals de gewone", () => {
  metMap((map) => {
    const w = openbareWereld(map);
    const r = uitleverenAanKlant({ org: "Klant-BV", toegepastVersie: "26.0.0", toegepastTemplate: "stack-v2", pluginMap: w.bron, templateUrl: w.tmpl, url: w.url, openbaar: true });
    assert.deepEqual(Object.keys(r), ["org", "plugin", "template"], "de gewone levering zelf verandert niet");
    assert.deepEqual(JSON.parse(toon(join(map, "Klant-BV", "stagetwo-plugin-tier2"), "v26.0.0", "levering.json")), leveringVoor("Klant-BV", { openbaar: true }));

    const o = uitleverenOpenbaar({ org: "Klant-BV", toegepastTemplate: "stack-v2", templateOpenbaarUrl: w.openbaar, url: w.url });
    assert.deepEqual(o.templateOpenbaar.tags, ["stack-v2"], "begint bij de eerste tag van de openbare template, er zijn geen oudere");
    assert.equal(toon(w.doelOpenbaar, "stack-v2", "README.md"), "openbaar v2");
    assert.equal(pluginBron(toon(w.doelOpenbaar, "stack-v2", ".claude/settings.json")), "Klant-BV/stagetwo-plugin-tier2", "de bron van de plugin in de eigen org, net als bij de gewone template");
    assert.equal(git(w.doelOpenbaar, "log", "--format=%an <%ae>|%s", "main"), "Stage Two <info@stagetwo.nl>|Versie 2");
    assert.equal(uitleverenOpenbaar({ org: "Klant-BV", toegepastTemplate: "stack-v2", templateOpenbaarUrl: w.openbaar, url: w.url }).templateOpenbaar.status, "al-bij");
  });
});

test("openbaar: geen repo bij de klant, geen schrijfrecht of geen bron geeft een melding voor de owner; de rest is al geleverd", () => {
  metMap((map) => {
    const w = openbareWereld(map, { klantRepo: false });
    uitleverenAanKlant({ org: "Klant-BV", toegepastVersie: "26.0.0", toegepastTemplate: "stack-v2", pluginMap: w.bron, templateUrl: w.tmpl, url: w.url, openbaar: true });
    assert.equal(git(join(map, "Klant-BV", "app-template-tier2"), "tag", "--list"), "stack-v1\nstack-v2", "de gewone template staat er");
    assert.throws(
      () => uitleverenOpenbaar({ org: "Klant-BV", toegepastTemplate: "stack-v2", templateOpenbaarUrl: w.openbaar, url: w.url }),
      (fout) => {
        assert.match(fout.message, /^De openbare template kon niet naar Klant-BV\/app-template-tier2-openbaar/);
        assert.match(fout.message, /Plugin en gewone template zijn wel geleverd/);
        assert.match(fout.message, /owner van Klant-BV doet: 1\. .*Public, en leeg.*2\. .*Template repository.*3\. .*stagetwo-levering, Configure/);
        assert.doesNotMatch(fout.message, /\u2014/);
        return true;
      },
    );
    assert.throws(() => uitleverenOpenbaar({ org: "Klant-BV", toegepastTemplate: "stack-v2", templateOpenbaarUrl: join(map, "bestaat-niet"), url: w.url }), /niet te lezen.*Plugin en gewone template zijn wel geleverd.*deel A/);
    assert.throws(() => uitleverenOpenbaar({ org: "Klant-BV", toegepastTemplate: "stack-v2", geenToegang: "klant", url: w.url }), new RegExp(meldingKlant("Klant-BV", "de workflow kreeg geen token voor die repo").slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.throws(() => uitleverenOpenbaar({ org: "Klant-BV", toegepastTemplate: "stack-v2", geenToegang: "bron", url: w.url }), (f) => f.message === meldingBron("de workflow kreeg geen token voor die repo"));
    // Een toegepaste tag van vóór de openbare template (die begint bij 43, hier bij 2): ook alleen dit onderdeel.
    assert.throws(() => uitleverenOpenbaar({ org: "Klant-BV", toegepastTemplate: "stack-v1", templateOpenbaarUrl: w.openbaar, url: w.url }), /^Error: openbare template: toegepast_template is stack-v1, maar die tag bestaat niet/);
  });
});

test("opdrachtregel: --alleen-openbaar met --template-openbaar en --geen-toegang", () => {
  assert.deepEqual(leesOptiesOpenbaar(["--org", "K", "--alleen-openbaar", "--toegepast-template", "stack-v43", "--template-openbaar", "/w/.bron-template-openbaar"]), {
    org: "K",
    toegepastTemplate: "stack-v43",
    droog: false,
    geenToegang: null,
    templateOpenbaarUrl: "/w/.bron-template-openbaar",
  });
  assert.equal(leesOptiesOpenbaar(["--org", "K", "--geen-toegang", "bron"]).geenToegang, "bron");
  assert.throws(() => leesOptiesOpenbaar(["--org", "K", "--template-openbaar"]), /vraagt een waarde/);
});

test("workflow Uitleveren: de openbare template is een eigen stap met eigen tokens die alleen dat onderdeel rood maakt", () => {
  const yml = YML();
  const klant = yml.slice(yml.indexOf("  klant:"));
  const hoofd = klant.indexOf("--org \"$ORG\" --toegepast \"$TOEGEPAST\"");
  const openbaar = klant.indexOf("--alleen-openbaar");
  assert.ok(hoofd > 0 && openbaar > hoofd, "eerst plugin en gewone template, dan de openbare");
  assert.match(klant, /repositories: stagetwo-plugin-tier2,app-template-tier2\n/, "het token van de gewone levering vraagt niet meer repo's dan op 42");
  for (const id of ["token-openbaar", "bron-openbaar-token", "bron-openbaar"]) {
    const stap = klant.slice(klant.indexOf(`- id: ${id}\n`), klant.indexOf("\n      - ", klant.indexOf(`- id: ${id}\n`) + 5));
    assert.match(stap, /if: steps\.openbaar\.outputs\.aan == 'true'/, id);
    assert.match(stap, /continue-on-error: true/, `${id}: een ontbrekende installatie stopt de job niet`);
  }
  assert.match(klant, /--openbaar-voor "\$ORG"/);
  assert.match(klant, /--geen-toegang bron/);
  assert.match(klant, /--geen-toegang klant/);
  assert.match(klant, /repositories: app-template-tier2-openbaar/);
  assert.match(klant, /echo "::error::\$uit"; exit 1/);
});

test("de levering-scripts blijven bij Stage Two", () => {
  for (const pad of ["abonnees.json", "beheer/uitleveren.mjs", "beheer/levering-stoppen.mjs", "beheer/levering-omzetten.mjs"]) assert.ok(ALLEEN_IN_BRON.includes(pad), pad);
});

// ---------------------------------------------------------------- harde eis: zonder "openbaar" precies versie 42

/**
 * Een abonnee zonder "openbaar" krijgt bij Uitleveren exact wat hij op versie 42 kreeg. Bewijs:
 * de code van de tag v42.0.0 (git archive in een tijdelijke map) en de code van nu draaien
 * hetzelfde scenario, elk in een eigen, gelijk opgebouwde wereld, met vaste datums. Dan moeten
 * gelijk zijn: elke git-aanroep (via een git op het PATH die meeschrijft), de uitkomsten, en
 * alle refs bij de klant (met vaste datums is een gelijke sha ook een gelijke boom, auteur en
 * bericht). Ontbreekt de tag (een ondiepe kloon), dan slaat de test over; de CI van deze repo
 * haalt de hele geschiedenis op.
 */
const WORTEL_REPO = join(HIER, "..");
const V42 = "v42.0.0";
const heeftV42 = (() => {
  try {
    execFileSync("git", ["-C", WORTEL_REPO, "rev-parse", "--verify", "-q", `${V42}^{commit}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

function codeVan42(map) {
  const doel = join(map, "code-42");
  mkdirSync(doel, { recursive: true });
  const tar = execFileSync("git", ["-C", WORTEL_REPO, "archive", "--format=tar", V42]);
  execFileSync("tar", ["-x", "-C", doel], { input: tar });
  return doel;
}

/** Een git op het PATH die elke aanroep in `log` schrijft en dan de echte git start. */
function meeschrijvendeGit(map) {
  const bin = join(map, "bin");
  mkdirSync(bin, { recursive: true });
  const echt = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
  const log = join(map, "git-log");
  writeFileSync(log, "");
  writeFileSync(join(bin, "git"), `#!/bin/sh\n{ for a in "$@"; do printf '%s\\037' "$a"; done; printf '\\036'; } >> "${log}"\nexec "${echt}" "$@"\n`);
  execFileSync("chmod", ["+x", join(bin, "git")]);
  return { bin, log };
}

/** Eén wereld en het scenario: eerste levering, een droge en een tweede run, dan een nieuwe versie. */
async function scenario(wereldMap, moduleUrl, git) {
  const { uitleverenAanKlant: lever } = await import(moduleUrl);
  const settings = (repo) => `${JSON.stringify({ extraKnownMarketplaces: { "stagetwo-tier2": { source: { source: "github", repo } } } }, null, 2)}\n`;
  const bron = repo(join(wereldMap, "bron"), {
    ".claude-plugin/plugin.json": JSON.stringify({ version: "42.0.0" }),
    "abonnees.json": JSON.stringify({ abonnees: [{ org: "Klant-BV", klant: "Klant" }] }),
    ".github/workflows/uitleveren.yml": "name: Uitleveren\n",
    "beheer/uitleveren.mjs": "// alleen in de bron\n",
    "lib/x.mjs": "export const x = 1;\n",
  });
  git(bron, "tag", "v42.0.0");
  const tmpl = repo(join(wereldMap, "tmpl"), { "README.md": "v41\n" });
  git(tmpl, "tag", "stack-v41");
  commitAlles(tmpl, { "README.md": "v42\n", ".claude/settings.json": settings(STAGE_TWO.plugin) }, "stack-v42");
  const doelen = ["stagetwo-plugin-tier2", "app-template-tier2"].map((r) => kaal(join(wereldMap, "Klant-BV", r)));
  const url = (r) => join(wereldMap, r);
  const log = git.log;
  writeFileSync(log, "");
  const uitkomsten = [];
  const opties = { org: "Klant-BV", pluginMap: bron, templateUrl: tmpl, url };
  uitkomsten.push(lever({ ...opties, toegepastVersie: "42.0.0", toegepastTemplate: "stack-v42", droog: true }));
  uitkomsten.push(lever({ ...opties, toegepastVersie: "42.0.0", toegepastTemplate: "stack-v42" }));
  uitkomsten.push(lever({ ...opties, toegepastVersie: "42.0.0", toegepastTemplate: "stack-v42" }));
  commitAlles(bron, { ".claude-plugin/plugin.json": JSON.stringify({ version: "42.1.0" }), "lib/x.mjs": "export const x = 2;\n" }, "v42.1.0");
  commitAlles(tmpl, { "README.md": "v43\n" }, "stack-v43");
  uitkomsten.push(lever({ ...opties, toegepastVersie: "42.1.0", toegepastTemplate: "stack-v43" }));
  const aanroepen = readFileSync(log, "utf8").split("\x1e").filter(Boolean).map((r) => r.split("\x1f").slice(0, -1));
  const refs = doelen.map((d) => git(d, "for-each-ref", "--format=%(refname) %(objectname)"));
  const levering = git(doelen[0], "show", "main:levering.json");
  return { uitkomsten, aanroepen, refs, levering };
}

test("harde eis: een abonnee zonder openbaar krijgt bij Uitleveren exact wat hij op versie 42 kreeg", { skip: !heeftV42 && `de tag ${V42} ontbreekt in deze kloon` }, async () => {
  const map = mkdtempSync(join(tmpdir(), "uitleveren-42-"));
  const oud = { ...process.env };
  try {
    const code42 = codeVan42(map);
    const meeschrijver = meeschrijvendeGit(map);
    Object.assign(process.env, {
      PATH: `${meeschrijver.bin}:${process.env.PATH}`,
      GIT_AUTHOR_DATE: "2026-11-13T12:00:00+01:00",
      GIT_COMMITTER_DATE: "2026-11-13T12:00:00+01:00",
    });
    const metLog = Object.assign((...a) => git(...a), { log: meeschrijver.log });
    const wereld42 = join(map, "w42");
    const wereldNu = join(map, "wnu");
    const op42 = await scenario(wereld42, pathToFileURL(join(code42, "beheer", "uitleveren.mjs")).href, metLog);
    const nu = await scenario(wereldNu, pathToFileURL(join(HIER, "uitleveren.mjs")).href, metLog);

    const tmp = tmpdir().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const gelijk = (waarde, wereld) =>
      JSON.parse(
        JSON.stringify(waarde)
          .replaceAll(wereld, "<wereld>")
          .replace(new RegExp(`(?:/private)?${tmp}/?uitleveren-(?:template-)?[A-Za-z0-9]{6}`, "g"), "<tmp>"),
      );
    assert.ok(op42.aanroepen.length > 20, "de meeschrijvende git zag de aanroepen");
    assert.deepEqual(gelijk(nu.aanroepen, wereldNu), gelijk(op42.aanroepen, wereld42), "dezelfde git-aanroepen, in dezelfde volgorde");
    assert.deepEqual(gelijk(nu.uitkomsten, wereldNu), gelijk(op42.uitkomsten, wereld42), "dezelfde uitkomsten");
    assert.deepEqual(nu.refs, op42.refs, "dezelfde commits en tags bij de klant, dus dezelfde bestanden");
    assert.equal(nu.levering, op42.levering, "dezelfde levering.json");
    assert.deepEqual(JSON.parse(nu.levering), { plugin: "Klant-BV/stagetwo-plugin-tier2", template: "Klant-BV/app-template-tier2" });
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in oud)) delete process.env[k];
    Object.assign(process.env, oud);
    rmSync(map, { recursive: true, force: true });
  }
});
