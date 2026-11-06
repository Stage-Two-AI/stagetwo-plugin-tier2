import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { eigenaarVan, laatsteRegels, leesLogboek } from "./logboek.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "logboek.mjs");
const LOGBOEK = ["# Logboek", "", "## 2026-11-03", "- intern #12: handmatig: secret X gezet", "", "## 2026-11-04", "- crm #7: besluit: geen export"].join("\n");

test("logboek: de laatste regels met inhoud", () => {
  assert.deepEqual(laatsteRegels(LOGBOEK, 2), ["## 2026-11-04", "- crm #7: besluit: geen export"]);
  assert.deepEqual(laatsteRegels("", 5), []);
  assert.equal(eigenaarVan("git@github.com:Klant/intern.git"), "Klant");
});

test("logboek: eerst via gh uit <eigenaar>/architectuur", () => {
  const aanroepen = [];
  const exec = (cmd, args) => {
    aanroepen.push([cmd, ...args]);
    if (cmd === "git") return "https://github.com/Klant/intern.git\n";
    return LOGBOEK;
  };
  const uit = leesLogboek({ map: "/w/intern", regels: 3, exec, lees: () => null });
  assert.equal(uit.bron, "Klant/architectuur");
  assert.equal(uit.regels.length, 3);
  assert.ok(aanroepen.some((a) => a[0] === "gh" && a.includes("repos/Klant/architectuur/contents/docs/logboek.md")));
});

test("logboek: zonder gh een kopie naast de app, anders in de werkmap, anders niets", () => {
  const w = mkdtempSync(join(tmpdir(), "logboek-"));
  mkdirSync(join(w, "intern"));
  mkdirSync(join(w, "architectuur", "docs"), { recursive: true });
  writeFileSync(join(w, "architectuur", "docs", "logboek.md"), LOGBOEK);
  const geenNet = () => {
    throw new Error("geen gh");
  };
  assert.equal(leesLogboek({ map: join(w, "intern"), exec: geenNet }).bron, join(w, "architectuur", "docs", "logboek.md"));
  assert.equal(leesLogboek({ map: w, exec: geenNet }).regels.at(-1), "- crm #7: besluit: geen export", "vanuit de werkmap zelf");
  assert.equal(leesLogboek({ map: mkdtempSync(join(tmpdir(), "logboek-leeg-")), exec: geenNet }), null);
});

test("logboek: als proces stil zonder logboek, met exit 0", () => {
  const leeg = mkdtempSync(join(tmpdir(), "logboek-proces-"));
  const uit = spawnSync(process.execPath, [SCRIPT, "--map", leeg], { encoding: "utf8", env: { PATH: "/nergens" } });
  assert.equal(uit.status, 0);
  assert.equal(uit.stdout, "");
});
