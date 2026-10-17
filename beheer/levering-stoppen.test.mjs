import assert from "node:assert/strict";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { API, STAGE_TWO_ORG, leesOpties, maakJwt, stopLevering, weigering } from "./levering-stoppen.mjs";
import { ALLEEN_IN_BRON } from "./uitleveren.mjs";

const HIER = dirname(fileURLToPath(import.meta.url));
// Een sleutel alleen voor deze test, gemaakt tijdens de run; er staat nooit een sleutel in de repo.
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const SLEUTEL = privateKey.export({ type: "pkcs1", format: "pem" });
const NU = 1_800_000_000;

/** Een nep-GitHub: per "METHODE pad" een antwoord { status, data }; onthoudt elke aanroep. */
function nepFetch(antwoorden) {
  const aanroepen = [];
  const fetchFn = async (url, init) => {
    const pad = url.slice(API.length);
    aanroepen.push({ methode: init.method, pad, auth: init.headers.Authorization });
    const a = antwoorden[`${init.method} ${pad}`] ?? { status: 404, data: { message: "Not Found" } };
    return { status: a.status, text: async () => (a.data === undefined ? "" : JSON.stringify(a.data)) };
  };
  return { fetchFn, aanroepen };
}

const GEVONDEN = { status: 200, data: { id: 4242, account: { login: "Richplant-BV" }, repository_selection: "selected" } };
const basis = (extra = {}) => ({ org: "Richplant-BV", appId: "123", sleutel: SLEUTEL, abonnees: [], nu: NU, ...extra });

test("JWT: RS256, iss is de App ID, geldig van een minuut terug tot negen minuten vooruit, en echt ondertekend", () => {
  const jwt = maakJwt({ appId: 123, sleutel: SLEUTEL, nu: NU });
  const [kop, inhoud, handtekening] = jwt.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(kop, "base64url")), { alg: "RS256", typ: "JWT" });
  assert.deepEqual(JSON.parse(Buffer.from(inhoud, "base64url")), { iat: NU - 60, exp: NU + 540, iss: "123" });
  const controle = createVerify("RSA-SHA256");
  controle.update(`${kop}.${inhoud}`);
  assert.ok(controle.verify(publicKey, Buffer.from(handtekening, "base64url")));
});

test("stoppen: installatie opzoeken met de JWT van de App en verwijderen", async () => {
  const w = nepFetch({ "GET /orgs/Richplant-BV/installation": GEVONDEN, "DELETE /app/installations/4242": { status: 204 } });
  const r = await stopLevering({ ...basis(), fetchFn: w.fetchFn });
  assert.equal(r.status, "gestopt", r.reden);
  assert.deepEqual(r.installatie, { id: 4242, account: "Richplant-BV", repos: "selected" });
  assert.deepEqual(w.aanroepen.map((a) => `${a.methode} ${a.pad}`), ["GET /orgs/Richplant-BV/installation", "DELETE /app/installations/4242"]);
  assert.ok(w.aanroepen.every((a) => a.auth === `Bearer ${maakJwt({ appId: "123", sleutel: SLEUTEL, nu: NU })}`));
});

test("droogloop: alleen opzoeken, niets verwijderen", async () => {
  const w = nepFetch({ "GET /orgs/Richplant-BV/installation": GEVONDEN });
  const r = await stopLevering({ ...basis({ droog: true }), fetchFn: w.fetchFn });
  assert.equal(r.status, "zou-stoppen");
  assert.equal(r.installatie.id, 4242);
  assert.deepEqual(w.aanroepen.map((a) => a.methode), ["GET"]);
});

test("App staat er al niet (de klant haalde hem zelf weg): niets te doen, geen fout", async () => {
  const w = nepFetch({});
  const r = await stopLevering({ ...basis(), fetchFn: w.fetchFn });
  assert.equal(r.status, "niet-geinstalleerd");
  assert.equal(w.aanroepen.length, 1);
});

test("weigert vóór elke aanroep: org nog in abonnees.json, de org van Stage Two, een ongeldige org, of geen sleutel", async () => {
  for (const [extra, patroon] of [
    [{ abonnees: ["richplant-bv"] }, /abonnees\.json/],
    [{ org: STAGE_TWO_ORG }, /Stage Two zelf/],
    [{ org: "geen org/x" }, /GitHub-org/],
    [{ sleutel: "" }, /LEVERING_APP_PRIVATE_KEY/],
    [{ sleutel: "geen pem" }, /App-sleutel/],
  ]) {
    const w = nepFetch({ "GET /orgs/Richplant-BV/installation": GEVONDEN });
    const r = await stopLevering({ ...basis(extra), fetchFn: w.fetchFn });
    assert.equal(r.status, "mislukt");
    assert.match(r.reden, patroon);
    assert.equal(w.aanroepen.length, 0, "niets naar GitHub");
  }
  assert.equal(weigering("Richplant-BV", ["Ander-BV"]), null);
});

test("fouten van GitHub komen als één zin terug", async () => {
  const w = nepFetch({ "GET /orgs/Richplant-BV/installation": { status: 401, data: { message: "Bad credentials" } } });
  assert.match((await stopLevering({ ...basis(), fetchFn: w.fetchFn })).reden, /HTTP 401: Bad credentials/);
  const w2 = nepFetch({ "GET /orgs/Richplant-BV/installation": GEVONDEN, "DELETE /app/installations/4242": { status: 403, data: { message: "Forbidden" } } });
  const r = await stopLevering({ ...basis(), fetchFn: w2.fetchFn });
  assert.equal(r.status, "mislukt");
  assert.match(r.reden, /verwijderen gaf HTTP 403/);
});

test("opdrachtregel: --org en --droog, iets anders is een fout", () => {
  assert.deepEqual(leesOpties(["--org", "Richplant-BV", "--droog"]), { org: "Richplant-BV", droog: true });
  assert.throws(() => leesOpties(["--alles"]), /onbekend argument/);
});

test("workflow Levering stoppen: alleen met de hand, invoer org en droogloop via env, zelfde geheimen als Uitleveren", () => {
  const yml = readFileSync(join(HIER, "..", ".github", "workflows", "levering-stoppen.yml"), "utf8");
  const aan = yml.slice(yml.indexOf("\non:"), yml.indexOf("\npermissions:"));
  assert.match(aan, /workflow_dispatch:/);
  assert.doesNotMatch(aan, /push:|pull_request|schedule/);
  assert.match(aan, /org:[\s\S]*required: true/);
  assert.match(aan, /droogloop:[\s\S]*type: boolean/);
  assert.match(yml, /ORG: \$\{\{ inputs\.org \}\}/);
  assert.doesNotMatch(yml.slice(yml.indexOf("run: |")), /\$\{\{/, "geen invoer rechtstreeks in het script");
  assert.match(yml, /LEVERING_APP_ID: \$\{\{ vars\.LEVERING_APP_ID \}\}/);
  assert.match(yml, /LEVERING_APP_PRIVATE_KEY: \$\{\{ secrets\.LEVERING_APP_PRIVATE_KEY \}\}/);
});

test("Levering stoppen gaat nooit mee naar een klant", () => {
  for (const pad of [".github/workflows/levering-stoppen.yml", "beheer/levering-stoppen.mjs", "beheer/levering-stoppen.test.mjs"]) {
    assert.ok(ALLEEN_IN_BRON.includes(pad), pad);
  }
});
