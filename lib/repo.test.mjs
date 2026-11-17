import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  alGelijkOpGitHub,
  branchHerbouwbaar,
  checkoutTag,
  commit,
  gewijzigdePaden,
  gitIdentiteit,
  gitVoorKern,
  hoogsteTagVersie,
  kloonRepo,
  kloonTemplate,
  kloonUrl,
  maakBranch,
  openOfWerkPRBij,
  openPRVoorVersie,
  push,
  pushDroog,
  repoUitUrl,
  sh,
  sluitOuderePRs,
  versieOpAfstand,
  windowsAanroep,
} from "./repo.mjs";
import { branchVerwijderingen, commit as testCommit, git, maakKlantRepo, maakTemplateRepo, nepGh, opruimen, prAanmaken, prSluitingen, tijdelijkeMap, veldenVan } from "./test-hulp.mjs";

test("sh: een blokkerend subproces blijft begrensd, een eigen timeout wint van de standaard", () => {
  assert.throws(() => sh("sleep", ["5"], { timeout: 200 }), (fout) => fout.killed === true || fout.signal === "SIGTERM");
  assert.throws(() => sh("sleep", ["5"], { timeout: 50 }), (fout) => fout.killed === true || fout.signal === "SIGTERM");
  assert.equal(sh("sh", ["-c", "sleep 0.3; echo klaar"], { timeout: 5000 }), "klaar");
});

test("kloonUrl en repoUitUrl", () => {
  assert.equal(kloonUrl("Stage-Two-AI/app-template-tier2"), "https://github.com/Stage-Two-AI/app-template-tier2");
  assert.equal(kloonUrl("/tmp/x"), "/tmp/x");
  assert.equal(kloonUrl("https://github.com/a/b"), "https://github.com/a/b");
  assert.equal(repoUitUrl("https://github.com/Klant-BV/voorraad.git"), "Klant-BV/voorraad");
  assert.equal(repoUitUrl("git@github.com:Klant-BV/voorraad.git"), "Klant-BV/voorraad");
  assert.equal(repoUitUrl("https://github.com/a/b/"), "a/b");
  assert.equal(repoUitUrl("/tmp/klant-origin.git"), null);
});

test("template klonen: tags mee, hoogste tag is 9, checkout op de tag en niet op main", () => {
  const wortel = tijdelijkeMap();
  try {
    const bron = maakTemplateRepo(wortel);
    const doel = kloonTemplate({ repo: bron, doel: join(wortel, "kloon") });
    assert.equal(hoogsteTagVersie(doel), 9);
    assert.equal(versieOpAfstand(bron), 9);
    checkoutTag(doel, 9);
    assert.ok(readFileSync(join(doel, "CLAUDE.md"), "utf8").includes("versie 9"));
    assert.ok(!readFileSync(join(doel, "CLAUDE.md"), "utf8").includes("alleen op main"));
    const kern = gitVoorKern(doel, doel);
    assert.ok(kern.tonenOpTag("stack-v8", "CLAUDE.md").includes("versie 8"));
    assert.equal(kern.tonenOpTag("stack-v7", "CLAUDE.md"), null);
  } finally {
    opruimen(wortel);
  }
});

test("zonder tag stack-v9 is de hoogste tag 8; op afstand onbereikbaar geeft null", () => {
  const wortel = tijdelijkeMap();
  try {
    const bron = maakTemplateRepo(wortel, { tagV9: false });
    assert.equal(hoogsteTagVersie(kloonTemplate({ repo: bron, doel: join(wortel, "kloon") })), 8);
    assert.equal(versieOpAfstand(join(wortel, "bestaat-niet")), null);
  } finally {
    opruimen(wortel);
  }
});

test("branch, commit met trailer, herbouwbaar, boom vergelijken, droge en echte push", () => {
  const wortel = tijdelijkeMap();
  try {
    const { origin, checkout } = maakKlantRepo(wortel);
    const kloon = kloonRepo({ url: origin, doel: join(wortel, "kloon") });
    assert.deepEqual(gitIdentiteit(checkout), { naam: "Bart Klant", email: "bart@example.com" });
    // De kloon zelf heeft geen lokale identiteit; wat git daar terugvalt op de globale
    // config is bijzaak, want we geven altijd de identiteit uit de checkout mee.

    maakBranch(kloon, "stack-bijwerken/v9");
    assert.equal(git(kloon, "branch", "--show-current"), "stack-bijwerken/v9");
    assert.ok(pushDroog(kloon, "stack-bijwerken/v9"), "schrijfrecht op de origin");
    assert.equal(git(origin, "branch", "--list", "stack-bijwerken/v9"), "", "droge push maakt niets aan");

    writeFileSync(join(kloon, "CLAUDE.md"), "nieuw\n");
    assert.deepEqual(gewijzigdePaden(kloon), ["CLAUDE.md"]);
    commit({ map: kloon, identiteit: gitIdentiteit(checkout), bericht: "chore: stack-template naar versie 9", versie: 9 });
    assert.equal(git(kloon, "log", "-1", "--format=%an <%ae>"), "Bart Klant <bart@example.com>");
    assert.match(git(kloon, "log", "-1", "--format=%B"), /Stack-bijwerken: v9/);

    assert.equal(alGelijkOpGitHub(kloon, "stack-bijwerken/v9"), false);
    push(kloon, "stack-bijwerken/v9");
    assert.equal(alGelijkOpGitHub(kloon, "stack-bijwerken/v9"), true);
    assert.equal(branchHerbouwbaar(kloon, "stack-bijwerken/v9"), true);
    assert.equal(branchHerbouwbaar(kloon, "bestaat-niet"), true);

    // Iemand commit zelf op de branch: dan blijven we ervan af.
    const ander = kloonRepo({ url: origin, doel: join(wortel, "ander") });
    git(ander, "checkout", "-q", "stack-bijwerken/v9");
    writeFileSync(join(ander, "eigen.txt"), "van de klant\n");
    git(ander, "add", "-A");
    git(ander, "-c", "user.name=K", "-c", "user.email=k@k", "commit", "-q", "-m", "eigen werk");
    git(ander, "push", "-q", "origin", "stack-bijwerken/v9");
    assert.equal(branchHerbouwbaar(kloon, "stack-bijwerken/v9"), false);
    assert.equal(git(origin, "rev-parse", "main"), git(checkout, "rev-parse", "main"), "main onaangeroerd");
  } finally {
    opruimen(wortel);
  }
});

test("droge push zonder schrijfrecht geeft false", () => {
  const wortel = tijdelijkeMap();
  try {
    const { origin, checkout } = maakKlantRepo(wortel);
    git(checkout, "remote", "set-url", "--push", "origin", join(wortel, "bestaat-niet.git"));
    assert.equal(pushDroog(checkout, "x"), false);
    assert.ok(origin);
  } finally {
    opruimen(wortel);
  }
});

test("gh-stappen met een nep-gh: open PR's voor een versie, PR openen of bijwerken, oudere sluiten", () => {
  const wortel = tijdelijkeMap();
  const gh = nepGh(wortel, {
    "GET pulls": { stdout: [{ number: 4, headRefName: "stack-bijwerken/v9", url: "https://x/4" }, { number: 3, headRefName: "stack-bijwerken/v8", url: "https://x/3" }, { number: 2, headRefName: "stack-sync/v9", url: "https://x/2" }] },
    "GET repo": { stdout: "hoofd\n" },
    "POST pulls": { stdout: { number: 5, url: "https://github.com/o/r/pull/5" } },
    "PATCH pulls/N": { stdout: "" },
    "POST issues/N/comments": { stdout: "" },
    "DELETE git/refs/heads/*": { stdout: "" },
  });
  const oudPath = process.env.PATH;
  process.env.PATH = `${gh.pad}:${oudPath}`;
  try {
    assert.equal(openPRVoorVersie("o/r", 9).number, 4);
    assert.equal(openPRVoorVersie("o/r", 10), null);
    assert.deepEqual(openOfWerkPRBij({ repo: "o/r", branch: "stack-bijwerken/v10", titel: "t", tekst: "b" }), {
      url: "https://github.com/o/r/pull/5",
      number: 5,
      nieuw: true,
    });
    assert.deepEqual(openOfWerkPRBij({ repo: "o/r", branch: "stack-bijwerken/v9", titel: "t", tekst: "b2" }), {
      url: "https://x/4",
      number: 4,
      nieuw: false,
    });
    assert.deepEqual(sluitOuderePRs({ repo: "o/r", prefix: "stack-bijwerken", doelVersie: 9, tekst: "dicht" }), [
      { number: 3, branch: "stack-bijwerken/v8", verwijderd: true },
    ]);
    const aanroepen = gh.aanroepen();
    // Alles gaat via de REST-API: `gh pr` en `gh repo` (GraphQL) werken in een cloudsessie niet.
    assert.ok(aanroepen.every((a) => a[0] === "api"), "geen gh pr of gh repo");
    assert.deepEqual(prAanmaken(aanroepen), [{ repo: "o/r", title: "t", head: "stack-bijwerken/v10", base: "hoofd", body: "b" }]);
    assert.ok(aanroepen.some((a) => a[1] === "repos/o/r/pulls/4" && a.includes("PATCH") && veldenVan(a).body === "b2"));
    assert.ok(aanroepen.some((a) => a[1] === "repos/o/r/issues/3/comments" && veldenVan(a).body === "dicht"), "de uitleg staat als reactie bij de gesloten PR");
    assert.deepEqual(prSluitingen(aanroepen), ["3"]);
    assert.deepEqual(branchVerwijderingen(aanroepen), ["stack-bijwerken/v8"]);

    // In een cloudsessie weigert GitHub het weggooien van een branch: de PR gaat wel dicht.
    gh.zet({
      "GET pulls": { stdout: [{ number: 3, headRefName: "stack-bijwerken/v8", url: "https://x/3" }] },
      "PATCH pulls/N": { stdout: "" },
      "POST issues/N/comments": { stdout: "" },
      "DELETE git/refs/heads/*": { exit: 1, stderr: "gh: Write access to this GitHub API path is not permitted through this proxy. (HTTP 403)" },
    });
    assert.deepEqual(sluitOuderePRs({ repo: "o/r", prefix: "stack-bijwerken", doelVersie: 9, tekst: "dicht" }), [
      { number: 3, branch: "stack-bijwerken/v8", verwijderd: false, geweigerd: true },
    ]);
  } finally {
    process.env.PATH = oudPath;
    opruimen(wortel);
  }
});

test("oudere PR's sluiten met een kloon: alleen een branch die helemaal van ons is gaat weg", () => {
  const wortel = tijdelijkeMap();
  const gh = nepGh(wortel, {
    "GET pulls": {
      stdout: [
        { number: 4, headRefName: "stack-bijwerken/v9", url: "https://x/4" },
        { number: 3, headRefName: "stack-bijwerken/v8", url: "https://x/3" },
        { number: 2, headRefName: "stack-bijwerken/v7", url: "https://x/2" },
      ],
    },
    "PATCH pulls/N": { stdout: "" },
    "POST issues/N/comments": { stdout: "" },
    "DELETE git/refs/heads/*": { stdout: "" },
  });
  const oudPath = process.env.PATH;
  process.env.PATH = `${gh.pad}:${oudPath}`;
  try {
    const { origin, checkout } = maakKlantRepo(wortel);
    const identiteit = gitIdentiteit(checkout);
    const kloon = kloonRepo({ url: origin, doel: join(wortel, "kloon") });

    // v7: alleen onze commits (met trailer) -> branch mag weg.
    maakBranch(kloon, "stack-bijwerken/v7");
    writeFileSync(join(kloon, "CLAUDE.md"), "versie 7\n");
    commit({ map: kloon, identiteit, bericht: "chore: stack-template naar versie 7", versie: 7 });
    push(kloon, "stack-bijwerken/v7");

    // v8: onze commit plus een commit van een mens zonder trailer -> branch blijft staan.
    maakBranch(kloon, "stack-bijwerken/v8");
    writeFileSync(join(kloon, "CLAUDE.md"), "versie 8\n");
    commit({ map: kloon, identiteit, bericht: "chore: stack-template naar versie 8", versie: 8 });
    writeFileSync(join(kloon, "eigen.txt"), "van de klant\n");
    testCommit(kloon, "eigen werk op de branch");
    push(kloon, "stack-bijwerken/v8");

    assert.deepEqual(sluitOuderePRs({ repo: "o/r", prefix: "stack-bijwerken", doelVersie: 9, tekst: "dicht", map: kloon }), [
      { number: 3, branch: "stack-bijwerken/v8", verwijderd: false },
      { number: 2, branch: "stack-bijwerken/v7", verwijderd: true },
    ]);
    const aanroepen = gh.aanroepen();
    assert.deepEqual(prSluitingen(aanroepen), ["3", "2"], "v8 en v7 gaan dicht; de doelversie zelf blijft open");
    assert.ok(aanroepen.some((a) => a[1] === "repos/o/r/issues/3/comments" && veldenVan(a).body === "dicht"));
    assert.deepEqual(branchVerwijderingen(aanroepen), ["stack-bijwerken/v7"], "v8: branch laten staan; v7: branch opruimen");
  } finally {
    process.env.PATH = oudPath;
    opruimen(wortel);
  }
});

test("windowsAanroep: pnpm, npm en npx via cmd.exe op Windows, de rest en andere platforms rechtstreeks", () => {
  assert.deepEqual(windowsAanroep("pnpm", ["install", "--lockfile-only"], "linux"), {
    cmd: "pnpm",
    args: ["install", "--lockfile-only"],
    shell: false,
  });
  assert.deepEqual(windowsAanroep("git", ["commit", "-m", "een bericht"], "win32"), {
    cmd: "git",
    args: ["commit", "-m", "een bericht"],
    shell: false,
  });
  assert.deepEqual(windowsAanroep("pnpm", ["outdated", "--format", "json"], "win32"), {
    cmd: "pnpm",
    args: ["outdated", "--format", "json"],
    shell: true,
  });
  // Met een shell plakt Node de argumenten aan elkaar: spaties en tekens van cmd.exe tussen aanhalingstekens.
  assert.deepEqual(windowsAanroep("npx", ["iets", "met spatie", 'a"b', "x&y"], "win32").args, [
    "iets",
    '"met spatie"',
    '"a""b"',
    '"x&y"',
  ]);
});

test("kloonRepo: de kloon heeft core.autocrlf=false, zodat bestanden op schijf gelijk zijn aan git", () => {
  const wortel = tijdelijkeMap();
  try {
    const bron = join(wortel, "bron");
    sh("git", ["init", "-q", bron]);
    writeFileSync(join(bron, "a.txt"), "een\ntwee\n");
    sh("git", ["-C", bron, "add", "a.txt"]);
    sh("git", ["-C", bron, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "a"]);
    const doel = kloonRepo({ url: bron, doel: join(wortel, "kloon") });
    assert.equal(git(doel, "config", "--get", "core.autocrlf"), "false");
    assert.equal(readFileSync(join(doel, "a.txt"), "utf8"), "een\ntwee\n");
  } finally {
    opruimen(wortel);
  }
});
