#!/usr/bin/env node
/**
 * Het testadres van de app in de huidige map lezen of zetten (zie lib/testmail.mjs).
 *
 *   node testmail.mjs              → {"status":"ingesteld","adres":"..."} of {"status":"leeg"}
 *   node testmail.mjs --zet <adres> → {"status":"ingesteld","adres":"..."}
 *
 * Bij een fout: {"status":"mislukt","reden":"..."}. Geen commit: dat doet de route van updaten.
 */
import { leesTestadres, zetTestadres } from "../../../lib/testmail.mjs";

function uitkomst(argv, map = process.cwd()) {
  try {
    const i = argv.indexOf("--zet");
    if (i !== -1) {
      const adres = argv[i + 1];
      if (!adres) return { status: "mislukt", reden: "geef na --zet het mailadres mee" };
      zetTestadres(map, adres);
    }
    const adres = leesTestadres(map);
    return adres ? { status: "ingesteld", adres } : { status: "leeg" };
  } catch (fout) {
    return { status: "mislukt", reden: fout.message };
  }
}

const uit = uitkomst(process.argv.slice(2));
console.log(JSON.stringify(uit));
process.exitCode = uit.status === "mislukt" ? 1 : 0;
