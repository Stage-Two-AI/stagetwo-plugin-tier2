import assert from "node:assert/strict";
import { test } from "node:test";
import { koppel, leesArgumenten, SECRET, VARIABELE } from "./sentry-koppelen.mjs";

const ARG = ["--beheer", "Klant-BV/stagetwo-beheer-tier2", "--sentry-org", "klant-bv"];

/** Een nagebootste gh die elke aanroep onthoudt. */
function nepGh({ apps = ["intern", "direct"], secretEr = false, faalt = null } = {}) {
  const log = [];
  const gh = (args, opties = {}) => {
    log.push({ args, interactief: Boolean(opties.interactief) });
    const tekst = args.join(" ");
    if (faalt && tekst.includes(faalt)) return { code: 1, uit: "", fout: "HTTP 403: Must have admin rights" };
    if (tekst.includes("contents/toegang.json")) return { code: 0, uit: JSON.stringify({ groepen: {}, apps: Object.fromEntries(apps.map((a) => [a, ["g"]])) }), fout: "" };
    if (args[0] === "secret" && args[1] === "list") return { code: 0, uit: JSON.stringify(secretEr ? [{ name: SECRET }] : []), fout: "" };
    return { code: 0, uit: "", fout: "" };
  };
  return { gh, log };
}

test("argumenten: beheer-repo en Sentry-organisatie zijn verplicht, apps alleen met geldige naam", () => {
  assert.deepEqual(leesArgumenten([...ARG, "--app", "intern"]).apps, ["intern"]);
  assert.throws(() => leesArgumenten(["--sentry-org", "klant-bv"]), /--beheer/);
  assert.throws(() => leesArgumenten(["--beheer", "Klant-BV/beheer"]), /--sentry-org/);
  assert.throws(() => leesArgumenten([...ARG, "--app", "Intern!"]), /--app/);
  assert.throws(() => leesArgumenten([...ARG, "--token", "x"]), /onbekende optie --token/, "een token als argument kan niet");
});

test("koppelen: gh vraagt zelf om het token, dan SENTRY_ORG, dan App inrichten per app", () => {
  const { gh, log } = nepGh();
  const r = koppel(leesArgumenten(ARG), { gh, terminal: true });
  assert.equal(r.status, "gekoppeld");
  assert.deepEqual(r.apps, ["intern", "direct"]);
  const zet = log.find((l) => l.args[0] === "secret" && l.args[1] === "set");
  assert.deepEqual(zet.args, ["secret", "set", SECRET, "--env", "beheer", "--repo", "Klant-BV/stagetwo-beheer-tier2"]);
  assert.equal(zet.interactief, true, "gh krijgt de terminal: alleen gh ziet de invoer");
  assert.ok(!zet.args.includes("--body"), "de waarde gaat nooit als argument mee");
  const variabele = log.find((l) => l.args[0] === "variable");
  assert.deepEqual(variabele.args, ["variable", "set", VARIABELE, "--env", "beheer", "--repo", "Klant-BV/stagetwo-beheer-tier2", "--body", "klant-bv"]);
  const runs = log.filter((l) => l.args[0] === "workflow").map((l) => l.args);
  assert.deepEqual(runs, [
    ["workflow", "run", "app-inrichten.yml", "--repo", "Klant-BV/stagetwo-beheer-tier2", "-f", "app=intern", "-f", "droogloop=false"],
    ["workflow", "run", "app-inrichten.yml", "--repo", "Klant-BV/stagetwo-beheer-tier2", "-f", "app=direct", "-f", "droogloop=false"],
  ]);
});

test("zonder terminal stopt het voordat er iets wordt gezet, met de uitleg waarom", () => {
  const { gh, log } = nepGh();
  const r = koppel(leesArgumenten(ARG), { gh, terminal: false });
  assert.equal(r.status, "mislukt");
  assert.match(r.reden, /eigen terminal/);
  assert.match(r.reden, /ook Claude niet/);
  assert.ok(!log.some((l) => ["set", "run"].includes(l.args[1])), "niets gezet of gestart");
});

test("staat het secret er al, dan geen vraag (ook zonder terminal) en gewoon door", () => {
  const { gh, log } = nepGh({ secretEr: true });
  const r = koppel(leesArgumenten([...ARG, "--app", "direct"]), { gh, terminal: false });
  assert.equal(r.status, "gekoppeld");
  assert.deepEqual(r.apps, ["direct"]);
  assert.ok(!log.some((l) => l.args[0] === "secret" && l.args[1] === "set"));
  assert.match(r.stappen[0], /stond er al/);
});

test("droogloop: zegt wat er zou gebeuren en zet niets", () => {
  const { gh, log } = nepGh();
  const r = koppel(leesArgumenten([...ARG, "--droogloop"]), { gh, terminal: false });
  assert.equal(r.status, "proef");
  assert.match(r.stappen.join("\n"), /gepland: App inrichten voor intern, direct/);
  assert.ok(!log.some((l) => ["set", "run"].includes(l.args[1])));
});

test("een app die niet in toegang.json staat, of geen rechten: mislukt met één zin", () => {
  const a = koppel(leesArgumenten([...ARG, "--app", "weg"]), { gh: nepGh().gh, terminal: true });
  assert.equal(a.status, "mislukt");
  assert.match(a.reden, /weg staat niet in toegang\.json/);
  const b = koppel(leesArgumenten(ARG), { gh: nepGh({ faalt: "secret list" }).gh, terminal: true });
  assert.equal(b.status, "mislukt");
  assert.match(b.reden, /owner of admin/);
});
