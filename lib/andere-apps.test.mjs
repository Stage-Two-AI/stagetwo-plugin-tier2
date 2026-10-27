/**
 * Tests voor de andere apps die achterlopen (lib/andere-apps.mjs): het antwoord van GitHub
 * lezen, en de aanroep van `gh` met een exec-stub, dus zonder netwerk.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { achterlopersUitAntwoord, andereAppsAchter, repoUitOrigin } from "./andere-apps.mjs";

const MANIFEST = JSON.stringify({ variant: "cloudflare" });
const repo = (naam, versie, extra = {}) => ({
  nameWithOwner: `Org/${naam}`,
  viewerPermission: "WRITE",
  isTemplate: false,
  manifest: { text: MANIFEST },
  versie: versie === null ? null : { text: `${versie}\n` },
  ...extra,
});
const antwoord = (...nodes) => ({ data: { repositoryOwner: { repositories: { nodes } } } });

test("achterlopers: alleen apps van deze tier met schrijfrecht onder het doel, zonder de open app, oudste eerst", () => {
  const apps = achterlopersUitAntwoord(
    antwoord(
      repo("open", 20),
      repo("b", 29),
      repo("a", 28),
      repo("bij", 33),
      repo("lezen", 20, { viewerPermission: "READ" }),
      repo("template", 20, { isTemplate: true }),
      repo("tier1", 20, { manifest: { text: JSON.stringify({ variant: "light" }) } }),
      repo("kapot", 20, { manifest: { text: "{" } }),
      repo("geen-versie", null),
      repo("rare-versie", "x"),
    ),
    { huidige: "org/OPEN", doel: 33 },
  );
  assert.deepEqual(apps, [
    { repo: "Org/a", naam: "a", versie: 28 },
    { repo: "Org/b", naam: "b", versie: 29 },
  ]);
  assert.deepEqual(achterlopersUitAntwoord(antwoord(repo("bij", 33)), { huidige: null, doel: 33 }), []);
  assert.equal(achterlopersUitAntwoord({ errors: [{}] }, { huidige: null, doel: 33 }), null);
});

test("repoUitOrigin: https en ssh, met of zonder .git", () => {
  assert.equal(repoUitOrigin("https://github.com/Org/app.git"), "Org/app");
  assert.equal(repoUitOrigin("git@github.com:Org/app.git\n"), "Org/app");
  assert.equal(repoUitOrigin("https://github.com/Org/app"), "Org/app");
  assert.equal(repoUitOrigin("https://gitlab.com/Org/app"), null);
  assert.equal(repoUitOrigin(null), null);
});

test("andereAppsAchter: één gh-aanroep met de organisatie en de tijdslimiet", async () => {
  const aanroepen = [];
  const exec = async (cmd, args, opties) => {
    aanroepen.push({ cmd, args, opties });
    return JSON.stringify(antwoord(repo("a", 28)));
  };
  const apps = await andereAppsAchter({ eigenaar: "Org", huidige: "Org/open", doel: 33, timeoutMs: 1234, env: {}, exec });
  assert.deepEqual(apps.map((a) => a.naam), ["a"]);
  assert.equal(aanroepen.length, 1);
  assert.equal(aanroepen[0].cmd, "gh");
  assert.deepEqual(aanroepen[0].args.slice(0, 4), ["api", "graphql", "-f", "login=Org"]);
  assert.equal(aanroepen[0].opties.timeout, 1234);
});

test("andereAppsAchter: gh ontbreekt, niet ingelogd, time-out of kapot antwoord geeft null", async () => {
  const fout = (code) => async () => {
    throw Object.assign(new Error(code), { code });
  };
  for (const exec of [fout("ENOENT"), fout(4), fout("ETIMEDOUT"), async () => "geen json"]) {
    assert.equal(await andereAppsAchter({ eigenaar: "Org", huidige: null, doel: 33, env: {}, exec }), null);
  }
  assert.equal(await andereAppsAchter({ eigenaar: null, huidige: null, doel: 33, env: {} }), null);
  assert.equal(await andereAppsAchter({ eigenaar: "Org", huidige: null, doel: 33, env: { STAGETWO_ANDERE_APPS_TEST: "geen" } }), null);
});
