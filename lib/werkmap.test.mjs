import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tijdelijkeMap } from "./test-hulp.mjs";
import { BEGIN, EINDE, STARTER, appsInWerkmap, claudeBlok, claudeMdBijwerken, eigenaarUitOrigin, launchBijwerken } from "./werkmap.mjs";

const MANIFEST = JSON.stringify({ variant: "cloudflare", vanDeTemplate: { vervangen: [] } });

function app(werkmap, naam, { manifest = MANIFEST, versie = "38", worktree = false } = {}) {
  mkdirSync(join(werkmap, naam, ".claude"), { recursive: true });
  if (manifest !== null) writeFileSync(join(werkmap, naam, ".claude", "stack-manifest.json"), manifest);
  if (versie !== null) writeFileSync(join(werkmap, naam, ".claude", "stack-version"), `${versie}\n`);
  if (worktree) writeFileSync(join(werkmap, naam, ".git"), "gitdir: /ergens\n");
}

test("werkmap: alleen apps van deze tier, één niveau dieper, op naam, zonder worktrees", () => {
  const w = tijdelijkeMap("werkmap-");
  app(w, "crm");
  app(w, "intern", { versie: "37" });
  app(w, "intern-wt", { worktree: true });
  app(w, "licht", { manifest: JSON.stringify({ variant: "light" }) });
  app(w, "kapot", { manifest: "{" });
  app(w, "zonder-versie", { versie: null });
  mkdirSync(join(w, "architectuur"));
  mkdirSync(join(w, "node_modules", "x", ".claude"), { recursive: true });
  writeFileSync(join(w, "node_modules", "x", ".claude", "stack-manifest.json"), MANIFEST);
  assert.deepEqual(
    appsInWerkmap(w).map((a) => [a.naam, a.versie]),
    [
      ["crm", 38],
      ["intern", 37],
      ["zonder-versie", null],
    ],
  );
  assert.deepEqual(appsInWerkmap(join(w, "bestaat-niet")), []);
});

test("werkmap: eigenaar uit een origin op GitHub", () => {
  assert.equal(eigenaarUitOrigin("https://github.com/Klant-BV/intern.git"), "Klant-BV");
  assert.equal(eigenaarUitOrigin("git@github.com:Klant/crm.git"), "Klant");
  assert.equal(eigenaarUitOrigin(null), null);
  assert.equal(eigenaarUitOrigin("https://gitlab.com/a/b"), null);
});

test("werkmap: het blok voor CLAUDE.md vervangt alleen tussen de markeringen", () => {
  const blok = claudeBlok({ apps: [{ naam: "intern", versie: 37 }, { naam: "crm", versie: null }], eigenaren: ["Klant"] });
  assert.ok(blok.startsWith(BEGIN) && blok.endsWith(EINDE));
  assert.match(blok, /- `intern\/` \(template-versie 37\)/);
  assert.match(blok, /- `crm\/`\n/);
  assert.match(blok, /\/stagetwo-tier2:verder-werken/);
  assert.match(blok, /van Klant/);
  assert.doesNotMatch(blok, /—/);
  assert.equal(claudeMdBijwerken(null, blok), `${blok}\n`);
  const eigen = `# Mijn aantekeningen\n\nblijft staan\n`;
  const eerst = claudeMdBijwerken(eigen, blok);
  assert.ok(eerst.startsWith(eigen.trimEnd()));
  assert.ok(eerst.includes(blok));
  const nieuwBlok = claudeBlok({ apps: [{ naam: "crm", versie: 39 }] });
  const daarna = claudeMdBijwerken(`${eerst}\nonder\n`, nieuwBlok);
  assert.ok(daarna.includes("blijft staan") && daarna.includes("onder"));
  assert.ok(!daarna.includes("intern"));
  assert.equal(daarna.split(BEGIN).length, 2, "één blok");
});

test("werkmap: launch.json krijgt per app een preview; eigen configuraties blijven, verdwenen apps gaan weg", () => {
  const bestaand = {
    version: "0.0.1",
    configurations: [
      { name: "eigen", runtimeExecutable: "pnpm", runtimeArgs: ["dev"], port: 3000 },
      { name: "weg", runtimeExecutable: "node", runtimeArgs: [STARTER, "weg"], port: 5173 },
    ],
  };
  const uit = launchBijwerken(bestaand, [{ naam: "crm" }, { naam: "intern" }]);
  assert.deepEqual(
    uit.configurations.map((c) => c.name),
    ["eigen", "crm", "intern"],
  );
  assert.deepEqual(uit.configurations[1], { name: "crm", runtimeExecutable: "node", runtimeArgs: [STARTER, "crm"], port: 5173, autoPort: true });
  assert.equal(launchBijwerken(null, [{ naam: "a" }]).configurations.length, 1);
});
