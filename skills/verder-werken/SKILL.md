---
name: verder-werken
description: De vaste route voor een wijziging aan deze app - branch maken, bouwen, testen, pull request openen met preview-link. Gebruik dit bij elk verzoek om iets toe te voegen, te wijzigen of te repareren aan deze applicatie, ook als het een kleinigheid lijkt, ook als er een tabel, kolom of policy bij komt (databasewijziging), ook als de gebruiker tijdens het bouwen wil meekijken, en ook als de gebruiker zegt dat het goed is of live mag (dan gaat de PR van concept naar klaar).
---

Deze route staat uitgeschreven in `docs/routes/verder-werken.md`. Lees dat bestand nu in
zijn geheel en loop de stappen in volgorde af.

Hier staat bewust geen kopie van de tekst. De route is voor elke agent dezelfde, en
`docs/routes/` is de enige plek waar hij staat, zodat er nooit twee versies zijn die
uit elkaar lopen. Deze skill is alleen de aansluiting voor Claude Code.

Het ritme van een wijziging (template-versie 21 en nieuwer; bij een oudere versie geldt wat
in de route van de app staat):

- **Een PR begint als concept** (`gh pr create --draft`). Dan draaien alleen de snelle
  checks en wordt de preview bijgewerkt. Push per afgerond stukje, niet per kleine wijziging.
- **Kijk eerst zelf, lokaal, met echte gegevens** (template 34 en nieuwer). De preview in de
  Claude-app start de app op deze computer tegen de testdatabase, waar elke nacht een kopie
  van productie in komt, en logt in als de testgebruiker `testgebruiker@stagetwo.nl` (het
  wachtwoord haalt `pnpm testlogin` zelf op). Loop de wijziging daar na in het paneel, voordat
  je de gebruiker vraagt te kijken. Ziet de testgebruiker niets, kijk dan eerst naar
  `supabase/testrol.sql` (hieronder).
- **De rol van de testgebruiker.** Heeft de app rollen en staat er nog geen
  `supabase/testrol.sql`, schrijf dat bestand dan één keer en laat het meegaan in de pull
  request van dit werk. Het geeft `testgebruiker@stagetwo.nl` dezelfde rol als de bouwer: zoek
  in de migraties hoe de app rollen bijhoudt en welke rol de bouwer heeft, en vraag het alleen
  bij twijfel. Schrijf het zo dat het vaker mag draaien (bijvoorbeeld `on conflict do nothing`).
  Na de merge voert het nachtelijke verversen van de testdatabase het uit; de gebruiker hoeft
  niemand een rol te geven.
- **De Cloudflare-preview is voor de gebruiker.** Geef hem één keer het vaste adres van de app
  (`actueel-...`, staat in de reactie van Preview uitrollen): daar logt hij met zijn eigen
  account in, en dat kan hij open laten staan. Daar krijgt hij een apart testaccount; de
  eerste keer moet iemand hem daar een rol geven. Wil je zelf in de Cloudflare-preview kijken
  en zie je het inlogscherm van Access, vraag de gebruiker dan één keer in te loggen in het
  paneel (de tools `Claude_Browser`; zijn die er niet, dan Claude in Chrome).
- **Een fout uit productie?** Kijk eerst in Sentry, via de koppeling Sentry in claude.ai. Staat
  die niet aan, zeg dan dat Stage Two hem in een kort gesprek koppelt, en vraag de gebruiker
  intussen de foutmelding of een schermafbeelding.
- **Het testadres.** Draai één keer per app
  `node "${CLAUDE_SKILL_DIR}/scripts/testmail.mjs"`. Geeft dat `leeg`, vraag dan naar welk
  adres de testmails van deze app mogen (stel het adres van de gebruiker voor), zet het met
  `--zet "<adres>"` en laat het meegaan in de pull request van dit werk. Zonder testadres
  verstuurt de app buiten productie geen mail.
- **Zegt de gebruiker dat het goed is**, zet de PR dan op klaar (`gh pr ready`), wacht zelf op
  alle checks (`gh pr checks --watch`) en repareer wat rood is, net zo lang tot alles groen
  is. Vraag de gebruiker nooit wat hij met een rode check moet; leg alleen iets voor als een
  check om een besluit vraagt (zoals `guard:migrations`), met jouw advies.
- **Geen Docker.** De databasetests draaien in GitHub. Een PR met een migratie begint
  daarom niet als concept, en de types haal je met `pnpm db:types:uit-ci` uit de run.

Wat verder bij deze route hoort, en wat de route zelf ook noemt:

- **Raakt de wijziging de database** (een tabel, kolom, index of policy), lees dan ook
  `docs/routes/databasewijziging.md` in zijn geheel en volg die stappen. De hook van de
  plugin herinnert je eraan zodra je in `supabase/migrations/` schrijft.
- **Meekijken tijdens het bouwen** gaat in de Claude-app via de preview: die start de app
  op deze computer volgens `.claude/launch.json`, tegen de testdatabase en nooit tegen
  productie. Start geen dev-server in Bash. Opleveren blijft altijd de pull request met
  de Cloudflare-preview (de workflow Preview uitrollen zet de link in de PR).
- **Raakt de wijziging `supabase/functions/`**, dan zet je na de merge de functies live met de
  workflow Functies uitrollen in de beheer-repo (stap "Na de merge" in de route). Zelf
  `supabase functions deploy` draaien kan en mag niet: op deze computer is geen Supabase-toegang.
  Wil je een functie vóór de merge proberen, start dan dezelfde workflow met je branch:
  `gh workflow run functies-uitrollen.yml --repo <org>/stagetwo-beheer-tier2 -f app=<app> -f tak=<branch>`.
  Die zet hem alleen op de testdatabase. Alle previews zien die versie tot de volgende
  uitrol; zeg dat tegen de gebruiker als er meer mensen tegelijk bouwen.
