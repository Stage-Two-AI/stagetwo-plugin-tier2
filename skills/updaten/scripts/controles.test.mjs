import assert from "node:assert/strict";
import { test } from "node:test";
import { controles, leesArgumenten } from "./controles.mjs";

const fout = (t) => Object.assign(new Error(t), { stderr: t });

function nepGh(antwoorden) {
  const log = [];
  const gh = (args) => {
    log.push(args);
    const methode = args.includes("-X") ? args[args.indexOf("-X") + 1] : "GET";
    const a = antwoorden[`${methode} ${args[1]}`];
    if (a === undefined) throw fout("gh: Not Found (HTTP 404)");
    return typeof a === "string" ? a : JSON.stringify(a);
  };
  return { gh, log };
}

test("argumenten: --repo als eigenaar/naam", () => {
  assert.equal(leesArgumenten(["--json", "--repo", "k/app"]).repo, "k/app");
  assert.throws(() => leesArgumenten(["--repo", "app"]), /eigenaar\/naam/);
});

test("controles: ruleset goed, en App inrichten aangeboden met de opdracht als de droogloop-sleutels ontbreken", () => {
  const { gh, log } = nepGh({
    "GET repos/k/app/rulesets?includes_parents=false": [{ id: 1, name: "main beschermen" }],
    "GET repos/k/app/rulesets/1": { name: "main beschermen", rules: [{ type: "required_status_checks", parameters: { required_status_checks: [{ context: "Droogloop migraties" }] } }] },
    "GET repos/k/stagetwo-beheer-tier2": {},
    "GET repos/k/app/contents/stack.config.json": JSON.stringify({ database: true }),
    "GET repos/k/app/environments/production": {},
    "GET repos/k/app/environments/preview/secrets": { secrets: [] },
    "GET repos/k/app/environments/preview/variables": { variables: [] },
    "GET repos/k/app/environments/production/variables/VITE_SENTRY_DSN": {},
    "GET repos/k/app/actions/variables/PREVIEW_VITE_SENTRY_DSN": {},
    "GET repos/k/stagetwo-beheer-tier2/contents/VERSIE": "39",
  });
  const r = controles({ repo: "k/app" }, { gh });
  assert.equal(r.status, "klaar");
  assert.equal(r.ruleset.status, "al-goed");
  assert.equal(r.inrichting.beheer, "k/stagetwo-beheer-tier2");
  assert.equal(r.inrichting.kanStarten, true);
  assert.match(r.inrichting.opdracht, /nieuwe-app\.mjs" --json --inrichten --eigenaar k --naam app$/);
  assert.ok(!log.some((a) => a.includes("workflow")), "starten doet de skill pas na een ja");
});
