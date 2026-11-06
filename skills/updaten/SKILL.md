---
name: updaten
description: Werkt alles bij zoals een update van een besturingssysteem - de Stage Two-plugin zelf, de programma's op deze computer (Git, Node, pnpm, gh), deze app naar de nieuwste Stage Two-template en haar afhankelijkheden (elk als eigen pull request), en daarna desgewenst de andere apps van de klant. Gebruik dit als de gebruiker vraagt om bij te werken, te updaten, de nieuwste versie op te halen, of als de melding bij sessiestart zei dat er een nieuwere template is en de gebruiker daarop ingaat. Ook als de gebruiker het automatisch bijwerken van de plugin uit of weer aan wil zetten.
---

Je werkt alles bij, zoals een update van een besturingssysteem: eerst wat op deze
computer staat, dan deze app, dan desgewenst de andere apps. Praat in gewone taal en
zeg per deel in één regel wat er gebeurt. Het typen van `/stagetwo-tier2:updaten` is de
toestemming voor deel 1 tot en met 4; vraag die niet nog een keer. Voor deel 5 (andere
apps) vraag je het wel.

Jij wijzigt zelf niets in de bestanden van een app. Alles wat een app verandert, loopt
via de scripts hieronder, in een tijdelijke kopie, en komt als pull request bij de
gebruiker. De uitzonderingen zijn wat jij in 3b in de tijdelijke kopie schrijft (de A/B-tests,
de redenen in `open_tabellen` en de testrol in `e2e/global-setup.ts`, alleen op de paden die
het script noemt; het komt in de commit van updaten zelf) en deel 4b (één bestand, als eigen
pull request). Mergen doet de gebruiker zelf.

De gebruiker bouwt zelf; in de projectfase richt Stage Two in en begeleidt het. Nieuwe versies komen uit de kopie
van plugin en template die Stage Two bij de start in de GitHub-organisatie van de klant
klaarzet (`levering.json`); Stage Two zet daar nieuwe versies in zolang het abonnement loopt, en past elke versie eerst toe op zijn
eigen apps. Na de overdracht heeft Stage Two standaard zelf geen toegang tot de apps en zet het daar
geen voorstellen klaar; een app verandert nooit vanzelf: dit commando is de weg waarlangs een nieuwe versie in een app komt.
Houd twee dingen apart als je het uitlegt: de plugin op deze computer werkt zichzelf bij uit
de kopie (deel 1), en een app verandert alleen via een voorstel dat een bouwer goedkeurt
(deel 3 tot en met 5). Stopt het abonnement, dan blijft die kopie op de laatste versie staan
en meldt dit commando dat alles bij is. Wat de klant bouwt en zijn gegevens zijn van hem;
plugin en template mag hij blijven gebruiken, en ze blijven werken, ook zonder Stage Two.

Staat er geen app open (geen `.claude/stack-manifest.json` in deze map), sla dan deel 3
en 4 over en ga na deel 2 naar deel 5.

## Alleen automatisch bijwerken uit- of aanzetten

De plugin is software van Stage Two die op deze computer draait met de rechten van de
gebruiker, en zichzelf bijwerkt uit de kopie in de eigen organisatie. Vraagt de gebruiker om
dat automatisch bijwerken uit te zetten (of weer aan), doe dan alleen dit en stop daarna:

```sh
node "${CLAUDE_SKILL_DIR}/../installatie/scripts/automatisch-bijwerken.mjs" --json --uit
```

Met `--aan` in plaats van `--uit` gaat het weer aan. Bij `uitgezet` of `uit`: zeg dat de
plugin zich vanaf de volgende start niet meer vanzelf bijwerkt, en dat de gebruiker hem zelf
bijwerkt met `/stagetwo-tier2:updaten` wanneer hij dat wil. Zeg er bij `uitgezet` ook bij dat
in de Claude-app daarmee ook andere plugins op deze computer zich niet meer vanzelf bijwerken
(het script haalt `FORCE_AUTOUPDATE_PLUGINS` weg, en de app regelt dat voor alle plugins
samen); `--aan` zet ook dat terug. Apps veranderen in beide gevallen
nooit vanzelf, alleen via een voorstel dat een bouwer goedkeurt.

## Deel 1: de plugin zelf

Eerst zorgen dat de plugin zichzelf voortaan bijwerkt. Dat staat pas aan als dit script op
deze computer heeft gedraaid (hier of in `/stagetwo-tier2:installatie`): de plugin toevoegen,
of ja zeggen als Claude Code in een app vraagt de plugin te installeren, zet het niet aan, want
voor een marketplace die niet van Anthropic is staat het standaard uit, en de desktop-app zet
het bijwerken van plugins helemaal uit zolang het script het niet terugzet:

```sh
node "${CLAUDE_SKILL_DIR}/../installatie/scripts/automatisch-bijwerken.mjs" --json
```

`gezet` of `al-goed` is goed. `uit` betekent dat de gebruiker het automatisch bijwerken
bewust heeft uitgezet: laat dat zo en zeg het in één regel; de stap hieronder is dan de
manier waarop de plugin bijgewerkt wordt. Bij `mislukt` geef je `reden` door en ga je door.
Werk de plugin daarna nu meteen bij:

```sh
claude plugin marketplace update stagetwo-tier2 && claude plugin update stagetwo-tier2@stagetwo-tier2
```

Haal daarna de plugin onder zijn oude naam weg (tot 15-10-2026 heette hij `stack-cloudflare`,
uit de marketplace `stagetwo-cloudflare`). Staat die er niet, dan doen deze regels niets:

```sh
claude plugin uninstall stack-cloudflare@stagetwo-cloudflare 2>/dev/null; claude plugin marketplace remove stagetwo-cloudflare 2>/dev/null; true
```

Lukt dat (ook "already up to date" is goed), onthoud dan of er een nieuwe versie is
binnengekomen: die werkt pas na het opnieuw openen van de app of na `/reload-plugins` (zie
deel 6). Bestaat het
commando `claude` hier niet, sla dit dan over: met de instelling hierboven werkt de
plugin zichzelf bij, kort nadat de app de volgende keer gestart is.

## Deel 2: de programma's op deze computer

Kijk eerst wat er staat:

```sh
bash "${CLAUDE_SKILL_DIR}/../installatie/scripts/controle.sh"
```

Ontbreekt er iets, of is `gh_ingelogd=nee`, stop dan en zeg dat de gebruiker eerst
`/stagetwo-tier2:installatie` draait. Staat alles er, werk het dan bij. Zeg vooraf dat Windows een
paar keer vraagt of een programma wijzigingen mag aanbrengen, en dat "Ja" het antwoord is.

Windows (`os=windows`):

```sh
winget upgrade -e --id Git.Git --accept-source-agreements --accept-package-agreements
winget upgrade -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
winget upgrade -e --id GitHub.cli --accept-source-agreements --accept-package-agreements
npm install -g pnpm@latest
```

macOS (`os=macos`):

```sh
brew upgrade git node gh pnpm
```

"Geen update beschikbaar" (bij winget: *No available upgrade found*) is geen fout: dat
programma was al bij. Gaat een upgrade echt mis, noem dan het programma en de melding,
en ga door met de rest. Verzin geen andere installatieweg. Zijn Git, Node of gh echt
bijgewerkt, dan kent deze sessie de nieuwe versie pas na het opnieuw openen van de app;
onthoud dat voor deel 6.

## Deel 3: deze app naar de nieuwste template

Het script doet het werk in een tijdelijke kopie van de repo; jij wijzigt zelf niets in
deze checkout.

### 3a: de droogloop

Draai dit commando precies zo, met Bash, vanuit de map van de app (in deel 5 met
`--repo` erachter):

```sh
node "${CLAUDE_SKILL_DIR}/scripts/bijwerken.mjs" --json --droogloop
```

Het antwoord is één JSON-object met een `status`. Vertel de gebruiker in gewone taal wat
het betekent, in hooguit drie regels; gebruik daarvoor `samenvatting` als die er is.

- `bij`: de app staat al op de nieuwste versie. Zeg dat en ga door naar 3e.
- `geen-template`: deze repo is niet uit de template gebouwd. Zeg dat en ga door naar
  deel 5.
- `mislukt` of `gestopt`: `reden` is één zin met wat de gebruiker moet doen. Geef die
  door en ga door naar 3e. Probeer het niet te omzeilen en verzin geen andere weg.
- `klaar`: de werkkopie staat klaar. Ga door naar 3b.

Het script raakt alleen bestanden van de template, met één uitzondering: een versie die
eenmalig iets in een bestand van het project nodig heeft, anders is de pull request zelf rood.
Die bestanden staan in `projectbestanden`. Bij de overstap naar versie 39 zijn dat:

- `src/onderdelen.ts`, als hij ontbreekt: de lijst met onderdelen die de nieuwe browsertest één
  voor één opent, gevuld uit de routes van de app (`onderdelen`), of met alleen `/`. Zie 3b.
- `stack.config.json`: tabellen die al een bewust open policy (`using (true)`) hadden, staan dan
  in `open_tabellen` met de reden "nog nalopen" (het script `scripts/open-tabellen-opnemen.mjs`
  van de template). Anders maakt de nieuwe regel in de Kwaliteitspoort de pull request rood.
  Die tabellen staan in `openTabellen.tabellen`; de echte reden vul jij in 3b in.
- `e2e/global-setup.ts`: mist daar de testrol, dan staat hij in `testrol` en pas jij hem in 3b
  aan.

### 3b: alleen bij overgeslagen bestanden een vraag

**Eerst de koppen van de onderdelen** (alleen als `onderdelen` in het antwoord staat). De
browsertest zoekt per onderdeel de kop (h1) van het hoofdscherm, en die kan het script niet
weten. Zoek per pad in `onderdelen.onderdelen` in de code van de app (alleen lezen, niets
wijzigen) welk scherm daar opent en wat zijn h1 is, en geef die in 3c mee met
`--kop "<pad>" "<kop>"`. Is de kop gelijk aan de `naam`, of vind je geen vaste kop (hij komt
uit de gegevens), laat `--kop` voor dat pad dan weg en noem het in deel 6. Bij een andere app
(deel 5, `--repo`) staat de code niet op deze computer: laat `--kop` dan weg en noem het ook.
Dit is geen vraag aan de gebruiker.

**Dan de A/B-tests** (alleen als `abTests` in het antwoord staat). Dit doe je zelf, zonder het
de gebruiker te vragen en zonder het als keuze voor te leggen: het typen van updaten is de
toestemming, en de bouwer hoeft er niets voor te doen. Een volgende versie maakt een tabel
zonder A/B-test rood; door ze nu in de update-PR te zetten, vraagt die versie niets van de
bouwer. Per tabel in `abTests.tabellen` schrijf je één bestand, precies op het pad uit
`abTests.paden` en onder `<werkmap>/app/` (dus in de tijdelijke kopie, nooit in deze checkout):

- Lees eerst hoe de tabel werkt, in `<werkmap>/app/supabase/migrations/`: de kolommen, welke
  kolom de eigenaar is (bijvoorbeeld `owner_id` of `user_id`, vaak met default `auth.uid()`),
  verplichte kolommen en verwijzingen naar andere tabellen, en de policies.
- Gebruik `controleerAfscherming` uit `abTests.hulp` (vanuit het testbestand:
  `../lib/afscherming`), zoals het voorbeeld bovenin dat bestand en `tests/rls/items.test.ts`.
  `maakRijAlsA` voegt als gebruiker A één geldige rij toe (met wat er verplicht is; een rij in
  een andere tabel die nodig is, maak je eerst ook als A) en geeft zijn id terug.
- Eén `describe` of `it` per bestand, met in de titel `<tabel>: B ziet de rij van A niet`. De
  opmaak zoals de rest van de app (biome: twee spaties, dubbele aanhalingstekens, puntkomma's);
  staat de app op deze computer, dan zet het script de opmaak in 3c zelf recht.
- Schrijf niets anders en wijzig geen bestaand bestand. Het script laat in 3c alleen deze paden
  toe en zet ze in de pull request onder een eigen kopje ("A/B-tests voor tabellen die er nog
  geen hadden"), los van de templatebestanden. Kun je voor een tabel echt geen rij maken (je
  begrijpt de tabel niet), vraag het de gebruiker dan in één vraag (bijvoorbeeld "wie mag een
  rij in `<tabel>` maken?"). Weet hij het ook niet, sla de tabel dan over: het script noemt hem
  in de pull request als waarschuwing "nog zonder test", en `/stagetwo-tier2:verder-werken`
  schrijft hem met hem mee als hij aan deze app werkt. Dat blokkeert niets. Zet een tabel nooit zelf in
  `open_tabellen`: dat is een keuze over wie wat mag zien.

Noem dit in deel 6 in één regel; het is geen vraag aan de gebruiker.

**Dan de redenen in `open_tabellen`** (alleen als `openTabellen.tabellen` niet leeg is). Ook dit
doe je zelf, zonder te vragen. Lees per tabel in `<werkmap>/app/supabase/migrations/` wat erin
staat, en in `<werkmap>/app/src/` hoe de app hem gebruikt, en vervang in
`<werkmap>/app/stack.config.json` bij die tabel de tekst "nog nalopen" door de echte reden in
één korte zin, bijvoorbeeld "kalender voor iedereen binnen, geen persoonsgegevens". Raak verder
niets aan in dat bestand (het script controleert dat). Kun je geen reden bedenken, vraag het de
gebruiker dan in één zin ("Waarom mag iedereen die binnen is alles in `<tabel>` zien?") en zet
zijn antwoord erin. Weet hij het niet, laat de tekst dan staan: de pull request noemt de tabel
als "nog zonder reden", en dat blokkeert niets.
Het script zet de lijst onder een eigen kopje in de pull request, zodat de reviewer hem ziet.
Lijkt een tabel juist níet voor iedereen bedoeld (persoonsgegevens, iets per gebruiker), schrijf
dat dan als reden ("nog nalopen: bevat adressen per klant") in plaats van iets te verzinnen.
**Dan de regels die open staan voor iedereen op internet** (alleen als `openTabellen.nooit`
niet leeg is: een policy voor `anon` of `public` met `true`, dus leesbaar of aan te passen ook
zonder in te loggen). Die houden de kwaliteitspoort rood, dus jij stelt de smallere regel voor,
in één nieuwe migratie precies op `openTabellen.migratie` (onder `<werkmap>/app/`). Lees eerst
in de migraties en in `<werkmap>/app/src/` wat de app met die tabel doet, en kies:

- alleen wie is ingelogd: `drop policy` en dezelfde policy opnieuw met `to authenticated`;
- alleen de eigen rijen: `to authenticated using (<eigenaarkolom> = auth.uid())`;
- echt iets voor bezoekers zonder account (een publieke pagina): dezelfde policy alleen nog voor
  `authenticated`, plus een functie voor `anon` (`security definer`, `set search_path = ''`) die
  alleen de gekozen velden teruggeeft, zoals `docs/WERKWIJZE.md` van de template beschrijft.

Maak na elke `drop policy` direct een `create policy` met dezelfde naam op dezelfde tabel; dan
ziet `guard:migrations` het niet als een destructieve migratie.

Weet je niet wat de app nodig heeft, vraag het de gebruiker dan in één vraag, bijvoorbeeld
"Moeten bezoekers zonder account de prijzen zien, of alleen mensen die zijn ingelogd?". Zet
bovenin de migratie per verandering een regel `-- uitleg: <wat er verandert, in gewone taal>`;
het script zet die in de pull request onder een eigen kopje. De gebruiker beslist met mergen.
Schrijf je geen migratie, dan zegt de pull request in gewone taal dat de tabel open staat en
dat `/stagetwo-tier2:updaten` het opnieuw voorstelt.

**Dan de testrol** (alleen als `testrol` in het antwoord staat). Pas `<werkmap>/app/<testrol.pad>`
zelf aan, zonder te vragen: neem de functie `geefTestrol` over uit
`<werkmap>/template/e2e/global-setup.ts` (met de imports die ze nodig heeft) en roep haar aan
direct na het aanmaken van de e2e-gebruiker. Zonder `supabase/testrol.sql` doet ze niets, dus
het mag ook in een app zonder rollen. Laat de rest van het bestand zoals het is. Wijkt het
bestand zo af dat je niet ziet waar het hoort, los het dan samen met de gebruiker op: laat hem
in één zin zien wat je wilt toevoegen en waar, en doe het na zijn ja. Lukt het niet, dan zegt de
pull request alleen wat er dan niet werkt.

Is `overgeslagen` leeg, dan is er niets te kiezen: ga meteen naar 3c. Het typen van
`/stagetwo-tier2:updaten` was de toestemming voor de pull request; vraag die niet nog een keer.

Staat er wel iets in `overgeslagen`, dan is dat bestand van de template, maar wijkt het
hier lokaal af: iemand heeft er iets aan veranderd. Leg dat per bestand in gewone taal
uit: geef de `reden` door (waarom het script het bestand heeft overgeslagen) en laat
`verschil` zien (dat is het verschil tussen de versie hier en de versie in de template).
Vraag daarna per bestand één keuze:

- **template**: de versie van de template overnemen; de lokale aanpassing verdwijnt;
- **eigen**: het bestand laten zoals het is; het blijft dan afwijken van de template en
  komt zo in de pull request te staan.

Weet de gebruiker het niet, dan is **eigen** de veilige keuze: dat verandert niets aan
wat er nu werkt. Twijfelt de gebruiker, kijk dan samen met hem naar het verschil en wat de
lokale aanpassing deed; hij hoeft hier op niemand te wachten.

Let op bij een bestand met een projectdeel, zoals `AGENTS.md`. Zegt de `reden` dat de
markeringen (`stack:begin` en `stack:end`) ontbreken, dan is **template** geen geldige
keuze: het script weigert die, omdat het hele bestand vervangen ook het eigen deel van
de gebruiker zou wissen. Bied dan alleen **eigen** aan. Wil de gebruiker toch de versie
van de template, dan zet hij eerst zelf de markeringen terug in dat bestand (je mag
uitleggen waar ze horen: als commentaarregels om het stuk dat van de template komt) en
draait hij daarna `/stagetwo-tier2:updaten` opnieuw.

### 3c: uitvoeren

Draai het script opnieuw met de `werkmap` uit 3a en per gekozen bestand een
`--los-op`:

```sh
node "${CLAUDE_SKILL_DIR}/scripts/bijwerken.mjs" --json --werkmap "<werkmap uit 3a>" --los-op "<pad>" template --los-op "<ander pad>" eigen
```

Met koppen uit 3b komt er per onderdeel `--kop "<pad>" "<kop>"` bij. Zonder keuzes laat je
`--los-op` weg. De A/B-tests uit 3b hoef je niet te noemen: het script vindt ze op hun pad. Het
script commit met de git-naam en het
e-mailadres van de gebruiker, pusht de branch `stack-bijwerken/v<versie>` naar zijn
eigen GitHub, zet de verplichte controle "Droogloop migraties" in de ruleset van `main` (met
de rechten van de gebruiker; lukt dat niet, dan staat er één regel onder **Voor jou** in de
pull request en gaat de rest door) en opent de pull request, of werkt een bestaande bij.

Komt hier `mislukt` of `gestopt` terug, dan handel je dat net zo af als in 3a:
geef `reden` door en ga door naar 3e. De tijdelijke kopie is dan al opgeruimd; wil
de gebruiker het opnieuw proberen, dan draait hij later `/stagetwo-tier2:updaten` opnieuw. Ga bij `gepusht` door naar 3d.

### 3d: wat je onthoudt voor het eind

Onthoud voor de samenvatting aan het eind (deel 6), in gewone taal:

1. wat er is bijgewerkt en waarom (een nieuwere versie van de gedeelde werkwijze), en
   wat er niet is bijgewerkt (de bestanden waarvoor hij **eigen** koos); en of er eenmalig
   een eigen bestand bij zat (`projectbestanden`) en wat er in `voorDeBouwer` staat; en
   voor welke tabellen er een A/B-test bij kwam (`abTests.geschreven`);
2. waar de pull request staat (`pr.url`, of anders `vergelijkUrl` om hem zelf te openen);
3. wat hij nu doet: de pull request bekijken, wachten tot de checks groen zijn en op
   Merge drukken. Zijn de checks rood, dan voldoet de app niet aan een nieuwe regel.
   Hij zet de check niet uit, en wacht ook niet: je lost het samen met hem op met
   `/stagetwo-tier2:verder-werken` (een eigen pull request; zeg welke check rood is en wat die
   vraagt), en daarna draait hij `/stagetwo-tier2:updaten` opnieuw. Meekijken door Stage Two
   valt binnen het abonnement (ongeveer een uur per maand); meer werk aan de app doet Stage Two
   op nacalculatie. Dat is een keuze, geen voorwaarde om door te kunnen.

### 3e: de controles en de inrichting van deze app

Ook als de app al `bij` was, en zonder het te vragen:

```sh
node "${CLAUDE_SKILL_DIR}/scripts/controles.mjs" --json
```

(in deel 5 met `--repo "<eigenaar>/<naam>"` erachter). Het script zet de verplichte controle
"Droogloop migraties" in de ruleset van `main` als die er nog niet staat (`ruleset.status`:
`al-goed`, `bijgezet`, `aangemaakt`; bij `geen-rechten` of `onbekend` geef je `ruleset.regel`
door, er hoeft niemand iets voor te doen). Daarna zegt `inrichting` wat de beheer-repo nog voor
deze app moet zetten (`redenen`: de sleutels voor de droogloop van migraties in omgeving
preview, of de foutmeldingen van Sentry) en wat er tot dan niet werkt (`gevolgen`). Niets
hiervan blokkeert de gebruiker:

- `kanStarten: true`: bied het aan, in één vraag: "Zal ik App inrichten starten in
  `<inrichting.beheer>`? Dat zet <redenen>." Dit is een workflow in de beheer-repo die de
  gebruiker zelf mag starten; er komt geen sleutel op deze computer. Bij ja draai je
  `inrichting.opdracht` precies zo (het wacht op de run, een paar minuten) en geef je de uitkomst
  door zoals in `/stagetwo-tier2:nieuwe-app` (bij `ingericht` in één regel wat er staat; een
  waarschuwing uit het resultaat leg je in gewone taal uit). Mislukt het starten omdat hij geen
  rechten heeft, of zegt hij nee: zeg de `gevolgen`, en dat de owner van de beheer-repo het met
  `inrichting.ownerOpdracht` start (geef die opdracht letterlijk).
- `owner` niet leeg: zeg per regel de `gevolgen` en wat de owner van de beheer-repo doet, met
  de opdracht erbij (vul bij `<plugin>` het pad `${CLAUDE_SKILL_DIR}/..` in). Na de overdracht is
  dat iemand in de eigen organisatie; de gebruiker kan intussen gewoon door.
- `redenen` leeg: niets zeggen.

## Deel 4: de afhankelijkheden van deze app

Een eigen pull request, los van die van de template (één PR = één onderwerp):

```sh
node "${CLAUDE_SKILL_DIR}/scripts/afhankelijkheden.mjs" --json
```

Het script werkt de pakketten bij binnen de versiegrenzen uit `package.json`; alleen
`pnpm-lock.yaml` verandert. Het antwoord:

- `gepusht`: de pull request staat open (`pr.url`). Onthoud hem voor deel 6.
- `bij`: niets bij te werken. Zeg dat in één regel.
- `gestopt`: geef `reden` door (meestal: er staat al zo'n pull request open; die moet
  eerst gemerged of gesloten worden).
- `mislukt`: geef `reden` door en ga door met deel 5.

Bij `gepusht` en `bij` staan er twee lijsten bij. `hoofdversies`: pakketten met een
nieuwe hoofdversie, die bewust niet zijn meegenomen; noem ze. Zeg erbij: Dependabot stelt
in elke app updates van de npm-pakketten voor, ook zonder abonnement (de versies van de
GitHub-workflows komen met een nieuwe templateversie); een grote versie van een pakket van de app zet de bouwer zelf
door, met jouw hulp, als een gewone wijziging via `/stagetwo-tier2:verder-werken`; wie het liever uitbesteedt, kan
het op verzoek door Stage Two laten doen, tegen nacalculatie (€120 per uur exclusief btw). Wijzigingen
aan apps vallen buiten het abonnement. Begin er niet zelf aan zonder dat de gebruiker
erom vraagt. `dependabot`: voorstellen van Dependabot die nog openstaan; noem ze en zeg dat de
gebruiker ze kan mergen als de checks groen zijn.

## Deel 4b: de rol van de testgebruiker

Heeft deze app rollen en staat er op `main` nog geen `supabase/testrol.sql`, schrijf dat
bestand dan één keer, als eigen pull request zoals elke wijziging (de route van
`/stagetwo-tier2:verder-werken`, op een nieuwe branch vanaf `main`). Het geeft
`testgebruiker@stagetwo.nl` dezelfde rol als de bouwer: zoek in de migraties hoe de app rollen
bijhoudt en welke rol de bouwer heeft, en vraag het alleen bij twijfel. Schrijf het zo dat het
vaker mag draaien (bijvoorbeeld `on conflict do nothing`); het nachtelijke verversen van de
testdatabase voert het uit. Geen rollen, of staat het bestand er al: sla dit deel over.
Onthoud de pull request voor deel 6. Bij de andere apps in deel 5 doe je dit niet.

## Deel 5: de andere apps (vraag het eerst)

```sh
node "${CLAUDE_SKILL_DIR}/scripts/overzicht.mjs" --json
```

`apps` is de lijst met apps uit de template waar de gebruiker naar mag schrijven, met
per app de `versie`, of hij `achter` loopt op `doel`, en een `openPR` als er al een
update klaarstaat. Laat de app die open staat (`huidige: true`) weg; die is al gedaan.

- Loopt er geen andere app achter, zeg dat in één regel en ga naar deel 6.
- Anders: toon de achterlopers als korte lijst (naam, van welke versie naar `doel`, en
  "staat al klaar" met de link als er een `openPR` is). Vraag welke de gebruiker nu wil
  bijwerken: een paar, allemaal of geen. Leg uit dat elke app een eigen pull request
  krijgt die iemand moet nakijken en mergen. Werk nooit apps bij die niet gekozen zijn.

Voor elke gekozen app zonder `openPR`, één voor één: loop deel 3 door met `--repo` erbij
(de app hoeft niet op deze computer te staan), en daarna deel 4 met `--repo`:

```sh
node "${CLAUDE_SKILL_DIR}/scripts/bijwerken.mjs" --json --droogloop --repo "<eigenaar>/<naam>"
node "${CLAUDE_SKILL_DIR}/scripts/afhankelijkheden.mjs" --json --repo "<eigenaar>/<naam>"
```

De tweede aanroep van deel 3 (`--werkmap`) blijft gelijk; `--repo` hoeft daar niet bij.
Overgeslagen bestanden leg je net zo voor als bij deze app, en de A/B-tests schrijf je net zo
(de migraties staan in `<werkmap>/app/`). Daarna 3e met `--repo`.

## Deel 6: samenvatting

Sluit af met één overzicht, in gewone taal:

1. Per app de pull requests (template, afhankelijkheden en de rol uit deel 4b) met hun
   link, en wat er voor de template is bijgewerkt en wat niet (de bestanden waarvoor
   **eigen** is gekozen); in één regel de A/B-tests die erbij kwamen; en uit 3e of de controle
   op `main` staat, en wat App inrichten nog zet en wie in de organisatie dat start.
2. Wat de gebruiker nu doet: per pull request wachten tot de checks groen zijn en op
   Merge drukken. Zijn de checks rood, dan voldoet de app niet aan een nieuwe regel.
   Hij zet de check niet uit, en wacht ook niet: je lost het samen met hem op met
   `/stagetwo-tier2:verder-werken` (een eigen pull request; zeg welke check rood is en wat die
   vraagt), en daarna draait hij `/stagetwo-tier2:updaten` opnieuw. Meekijken door Stage Two
   valt binnen het abonnement (ongeveer een uur per maand); meer werk aan de app doet Stage Two
   op nacalculatie. Dat is een keuze, geen voorwaarde om door te kunnen.
3. Is in deel 1 of 2 iets bijgewerkt, zeg dan dat de app opnieuw moet starten, met deze
   uitleg: sluit de Claude-app helemaal af (Windows: rechtsonder in het systeemvak op het
   pijltje **^**, rechtermuisknop op het Claude-icoon, **Afsluiten**; macOS: cmd+Q), open
   hem opnieuw, klik dit gesprek aan in de linkerzijbalk en typ **ga verder**. Is alleen de
   plugin bijgewerkt (deel 2 niet), dan is `/reload-plugins` in dit gesprek ook genoeg.
4. Staat er iets in `voorDeBouwer`, zeg het in gewone taal; het staat ook in de pull request
   onder **Voor jou**. Daar staat nooit iets waarop de gebruiker moet wachten: wat updaten niet
   zelf kan, los je in deze sessie met hem op, of het is een waarschuwing die niets blokkeert.
   Wat je in 3b schreef (A/B-tests, redenen in `open_tabellen`, de testrol) noem je in één
   regel; de gebruiker hoeft er niets mee.
5. Gaat een app naar template 34 of nieuwer, zeg dan in één zin wat er nieuw is: de
   assistent kijkt voortaan zelf in de app op deze computer, met een kopie van de echte
   gegevens van vannacht, en mail buiten productie gaat naar één testadres. Bij het
   eerstvolgende werk aan die app vraagt de assistent één keer naar dat adres; de testgebruiker
   krijgt vanzelf dezelfde rol als de bouwer.

## Wat je niet doet

- Buiten deel 4b wijzig je geen bestanden in deze checkout (wat je in 3b schrijft, staat in de
  tijdelijke kopie), ook niet als de gebruiker dat
  vraagt om "het even snel op te lossen": de update loopt altijd via de pull request.
- Je voegt niets toe aan de commando's hierboven: geen `cd`, geen omgevingsvariabelen,
  geen token, geen `pass` of `gpg`. Het script vindt alles zelf.
- Je merget geen pull request; dat doet de gebruiker zelf.
- Je zet geen ruleset, secret of variabele met de hand (`gh api .../rulesets`, `gh secret`):
  dat doen `bijwerken.mjs` en `controles.mjs`, en wat zij niet kunnen, doet App inrichten,
  gestart door de gebruiker of de owner van de beheer-repo.
- Je werkt geen andere app bij zonder dat de gebruiker die in deel 5 heeft gekozen.
