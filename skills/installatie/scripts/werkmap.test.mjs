import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { richtWerkmapIn } from "./werkmap.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "werkmap.mjs");
const MANIFEST = JSON.stringify({ variant: "cloudflare", vanDeTemplate: { vervangen: [] } });

function werkmapMet(...namen) {
  const w = mkdtempSync(join(tmpdir(), "werkmap-script-"));
  for (const naam of namen) {
    mkdirSync(join(w, naam, ".claude"), { recursive: true });
    writeFileSync(join(w, naam, ".claude", "stack-manifest.json"), MANIFEST);
    writeFileSync(join(w, naam, ".claude", "stack-version"), "38\n");
  }
  return w;
}

test("werkmap-script: CLAUDE.md, launch.json en het startbestand; een tweede keer is alles gelijk", () => {
  const w = werkmapMet("intern", "crm");
  writeFileSync(join(w, "CLAUDE.md"), "# Eigen\n");
  const origin = (map) => (map.endsWith("intern") ? "git@github.com:Klant/intern.git" : null);
  const eerste = richtWerkmapIn(w, { origin });
  assert.equal(eerste.status, "klaar");
  assert.deepEqual(eerste.apps, ["crm", "intern"]);
  assert.deepEqual(eerste.eigenaren, ["Klant"]);
  assert.equal(eerste.claudeMd, "bijgewerkt");
  assert.equal(eerste.preview, "nieuw");
  const claude = readFileSync(join(w, "CLAUDE.md"), "utf8");
  assert.ok(claude.startsWith("# Eigen"));
  assert.match(claude, /`crm\/`/);
  const launch = JSON.parse(readFileSync(join(w, ".claude", "launch.json"), "utf8"));
  assert.deepEqual(launch.configurations.map((c) => c.name), ["crm", "intern"]);
  assert.ok(existsSync(join(w, ".claude", "stagetwo-preview.mjs")));
  const tweede = richtWerkmapIn(w, { origin });
  assert.equal(tweede.claudeMd, "gelijk");
  assert.equal(tweede.preview, "gelijk");
});

test("werkmap-script: zonder apps schrijft hij niets", () => {
  const w = mkdtempSync(join(tmpdir(), "werkmap-leeg-"));
  assert.deepEqual(richtWerkmapIn(w), { status: "geen-apps", map: w });
  assert.ok(!existsSync(join(w, "CLAUDE.md")));
});

test("werkmap-script: een kapotte launch.json laat hij staan, met een reden", () => {
  const w = werkmapMet("intern");
  mkdirSync(join(w, ".claude"), { recursive: true });
  writeFileSync(join(w, ".claude", "launch.json"), "{ kapot");
  const uit = richtWerkmapIn(w, { origin: () => null });
  assert.equal(uit.status, "mislukt");
  assert.match(uit.reden, /launch\.json/);
  assert.equal(readFileSync(join(w, ".claude", "launch.json"), "utf8"), "{ kapot");
});

test("werkmap-script: het startbestand gaat naar de map van de app en start daar scripts/preview.mjs", () => {
  const w = werkmapMet("intern");
  mkdirSync(join(w, "intern", "scripts"), { recursive: true });
  writeFileSync(join(w, "intern", "scripts", "preview.mjs"), "console.log(process.cwd());\n");
  richtWerkmapIn(w, { origin: () => null });
  const uit = spawnSync(process.execPath, [join(".claude", "stagetwo-preview.mjs"), "intern"], { cwd: w, encoding: "utf8" });
  assert.equal(uit.status, 0, uit.stderr);
  assert.ok(uit.stdout.trim().endsWith(join("intern")), uit.stdout);
  const fout = spawnSync(process.execPath, [join(".claude", "stagetwo-preview.mjs"), "../x"], { cwd: w, encoding: "utf8" });
  assert.equal(fout.status, 1);
});

test("werkmap-script: als proces één JSON-regel", () => {
  const w = werkmapMet("intern");
  const uit = spawnSync(process.execPath, [SCRIPT, "--map", w], { encoding: "utf8" });
  assert.equal(uit.status, 0, uit.stderr);
  assert.equal(JSON.parse(uit.stdout).status, "klaar");
});
