import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CONTROLE, heeftControle, metControle, regelZonderRechten, standaardRuleset, watMistDeInrichting, zetVerplichteControle } from "./controles.mjs";

const fout = (tekst) => Object.assign(new Error(tekst), { stderr: tekst });

/** Een nagebootste gh: per pad een antwoord (tekst, object of een fout), en een log. */
function nepGh(antwoorden) {
  const log = [];
  const gh = (args) => {
    const i = args.indexOf("--input");
    log.push({ args, body: i >= 0 ? JSON.parse(readFileSync(args[i + 1], "utf8")) : null });
    const methode = args.includes("-X") ? args[args.indexOf("-X") + 1] : "GET";
    const sleutel = `${methode} ${args[1]}`;
    const a = antwoorden[sleutel];
    if (a === undefined) throw fout(`gh: Not Found (HTTP 404) ${sleutel}`);
    if (a instanceof Error) throw a;
    return typeof a === "string" ? a : JSON.stringify(a);
  };
  return { gh, log };
}

const OUD = {
  id: 7,
  name: "main beschermen",
  target: "branch",
  enforcement: "active",
  conditions: { ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } },
  bypass_actors: [],
  rules: [
    { type: "deletion" },
    { type: "required_status_checks", parameters: { strict_required_status_checks_policy: true, required_status_checks: [{ context: "Code" }, { context: "Database en end-to-end", integration_id: 15368 }] } },
  ],
};

test("de ruleset van nieuwe-app eist de droogloop al", () => {
  assert.ok(heeftControle(standaardRuleset()));
  assert.ok(!heeftControle(OUD));
});

test("metControle: de check erbij, de rest precies zoals het was", () => {
  const body = metControle(OUD);
  assert.deepEqual(body.rules[1].parameters.required_status_checks, [{ context: "Code" }, { context: "Database en end-to-end", integration_id: 15368 }, { context: CONTROLE }]);
  assert.deepEqual(body.rules[0], { type: "deletion" });
  assert.equal(body.id, undefined, "geen alleen-lezen velden in de body");
  assert.deepEqual(OUD.rules[1].parameters.required_status_checks.length, 2, "het origineel blijft heel");
  const zonderRegel = metControle({ ...OUD, rules: [{ type: "deletion" }] });
  assert.deepEqual(zonderRegel.rules[1].parameters.required_status_checks, [{ context: CONTROLE }]);
});

test("zetVerplichteControle: bijzetten met PUT, en een tweede keer al goed", () => {
  const { gh, log } = nepGh({ "GET repos/k/app/rulesets?includes_parents=false": [{ id: 7, name: "main beschermen" }], "GET repos/k/app/rulesets/7": OUD, "PUT repos/k/app/rulesets/7": {} });
  assert.deepEqual(zetVerplichteControle("k/app", { gh }), { status: "bijgezet" });
  const put = log.find((l) => l.args.includes("PUT"));
  assert.ok(heeftControle(put.body));
  const tweede = nepGh({ "GET repos/k/app/rulesets?includes_parents=false": [{ id: 7, name: "main beschermen" }], "GET repos/k/app/rulesets/7": put.body });
  assert.deepEqual(zetVerplichteControle("k/app", { gh: tweede.gh }), { status: "al-goed" });
  assert.ok(!tweede.log.some((l) => l.args.includes("PUT")));
});

test("zetVerplichteControle: geen ruleset, dan die van nieuwe-app; zonder beheerrechten één regel en door", () => {
  const nieuw = nepGh({ "GET repos/k/app/rulesets?includes_parents=false": [], "POST repos/k/app/rulesets": {} });
  assert.deepEqual(zetVerplichteControle("k/app", { gh: nieuw.gh }), { status: "aangemaakt" });
  assert.deepEqual(nieuw.log.find((l) => l.args.includes("POST")).body, standaardRuleset());
  const zonder = nepGh({
    "GET repos/k/app/rulesets?includes_parents=false": [{ id: 7, name: "main beschermen" }],
    "GET repos/k/app/rulesets/7": OUD,
    "PUT repos/k/app/rulesets/7": fout("gh: Must have admin rights to Repository. (HTTP 403)"),
  });
  const r = zetVerplichteControle("k/app", { gh: zonder.gh });
  assert.equal(r.status, "geen-rechten");
  assert.equal(r.regel, regelZonderRechten("k/app"));
  assert.match(r.regel, /Jij hoeft niets te doen/);
  assert.doesNotMatch(r.regel, /—/);
});

const INGERICHT = {
  "GET repos/k/app/contents/stack.config.json": JSON.stringify({ database: true }),
  "GET repos/k/app/environments/production": {},
  "GET repos/k/app/environments/preview/secrets": { secrets: [{ name: "SUPABASE_TEST_DB_PASSWORD" }, { name: "CLOUDFLARE_API_TOKEN" }] },
  "GET repos/k/app/environments/preview/variables": { variables: [{ name: "SUPABASE_TEST_POOLER_HOST" }] },
  "GET repos/k/app/environments/production/variables/VITE_SENTRY_DSN": {},
  "GET repos/k/app/actions/variables/PREVIEW_VITE_SENTRY_DSN": {},
  "GET repos/k/stagetwo-beheer-tier2/contents/VERSIE": "39\n",
  "GET repos/k/stagetwo-beheer-tier2/environments/beheer/secrets": { secrets: [{ name: "SENTRY_AUTH_TOKEN" }] },
};
const zonder = (...sleutels) => Object.fromEntries(Object.entries(INGERICHT).filter(([k]) => !sleutels.some((s) => k.includes(s))));
const BEHEER = "k/stagetwo-beheer-tier2";

test("inrichting: alles staat, dan niets te doen", () => {
  const r = watMistDeInrichting("k/app", { gh: nepGh(INGERICHT).gh, beheer: BEHEER });
  assert.deepEqual(r.redenen, []);
  assert.equal(r.kanStarten, false);
});

test("inrichting: droogloop-sleutels of Sentry ontbreken, dan kan de bouwer App inrichten starten", () => {
  const a = watMistDeInrichting("k/app", { gh: nepGh({ ...INGERICHT, "GET repos/k/app/environments/preview/secrets": { secrets: [] } }).gh, beheer: BEHEER });
  assert.deepEqual(a.redenen, ["de sleutels voor de droogloop van migraties staan nog niet in omgeving preview"]);
  assert.equal(a.kanStarten, true);
  const b = watMistDeInrichting("k/app", { gh: nepGh(zonder("PREVIEW_VITE_SENTRY_DSN")).gh, beheer: BEHEER });
  assert.deepEqual(b.redenen, ["de foutmeldingen (Sentry) zijn nog niet gekoppeld"]);
  assert.equal(b.kanStarten, true);
});

test("inrichting: wat de bouwer niet kan, doet Stage Two (geen beheer-repo, oude beheer-repo, Sentry nog niet gekoppeld)", () => {
  const sleutels = { ...INGERICHT, "GET repos/k/app/environments/preview/variables": { variables: [] } };
  const geen = watMistDeInrichting("k/app", { gh: nepGh(sleutels).gh, beheer: null });
  assert.equal(geen.kanStarten, false);
  assert.match(geen.stageTwo[0], /Stage Two richt dat in/);
  const oud = watMistDeInrichting("k/app", { gh: nepGh({ ...sleutels, "GET repos/k/stagetwo-beheer-tier2/contents/VERSIE": "38\n" }).gh, beheer: BEHEER });
  assert.equal(oud.kanStarten, false);
  assert.match(oud.stageTwo[0], /versie 39 staat \(nu 38\); Stage Two brengt hem bij/);
  const sentry = watMistDeInrichting("k/app", {
    gh: nepGh({ ...zonder("VITE_SENTRY_DSN"), "GET repos/k/stagetwo-beheer-tier2/environments/beheer/secrets": { secrets: [] } }).gh,
    beheer: BEHEER,
  });
  assert.equal(sentry.kanStarten, false, "zonder token in de beheer-repo helpt App inrichten niet");
  assert.match(sentry.stageTwo[0], /Stage Two koppelt Sentry/);
});

test("inrichting: een app die nog niet is ingericht, of zonder eigen database", () => {
  const niet = watMistDeInrichting("k/app", { gh: nepGh(zonder("environments/production")).gh, beheer: BEHEER });
  assert.equal(niet.ingericht, false);
  assert.deepEqual(niet.redenen, []);
  const geenDb = watMistDeInrichting("k/app", {
    gh: nepGh({ ...INGERICHT, "GET repos/k/app/contents/stack.config.json": "{}", "GET repos/k/app/environments/preview/secrets": { secrets: [] } }).gh,
    beheer: BEHEER,
  });
  assert.deepEqual(geenDb.redenen, [], "geen eigen database: geen droogloop");
});
