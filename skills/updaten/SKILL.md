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
gebruiker. Mergen doet de gebruiker zelf.

De gebruiker bouwt zelf; Stage Two richt in en begeleidt. Nieuwe versies komen uit de kopie
van plugin en template die Stage Two bij de start in de GitHub-organisatie van de klant
klaarzet (`levering.json`); Stage Two zet daar nieuwe versies in zolang het abonnement loopt, en test elke versie eerst op zijn
eigen apps. Na de overdracht heeft Stage Two zelf geen toegang tot de apps en zet het daar
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

Eerst zorgen dat de plugin zichzelf voortaan bijwerkt (dit staat bij klanten van vóór
plugin 2.1.0 nog niet aan, en de desktop-app zet het standaard uit):

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
binnengekomen: die werkt pas na het opnieuw openen van de app (zie deel 6). Bestaat het
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

- `bij`: de app staat al op de nieuwste versie. Zeg dat en ga door naar deel 4.
- `geen-template`: deze repo is niet uit de template gebouwd. Zeg dat en ga door naar
  deel 5.
- `mislukt` of `gestopt`: `reden` is één zin met wat de gebruiker moet doen. Geef die
  door en ga door naar deel 4. Probeer het niet te omzeilen en verzin geen andere weg.
- `klaar`: de werkkopie staat klaar. Ga door naar 3b.

### 3b: alleen bij overgeslagen bestanden een vraag

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
wat er nu werkt. Wil de gebruiker dat Stage Two ernaar kijkt: tijdens het project volstaat
de link naar de pull request; na de overdracht kan Stage Two een privé-repo niet openen, dus
dan een beschrijving of schermafbeelding, of de owner geeft Stage Two tijdelijk leestoegang.

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

Zonder keuzes laat je `--los-op` weg. Het script commit met de git-naam en het
e-mailadres van de gebruiker, pusht de branch `stack-bijwerken/v<versie>` naar zijn
eigen GitHub en opent de pull request, of werkt een bestaande bij.

Komt hier `mislukt` of `gestopt` terug, dan handel je dat net zo af als in 3a:
geef `reden` door en ga door naar deel 4. De tijdelijke kopie is dan al opgeruimd; wil
de gebruiker het opnieuw proberen, dan draait hij later `/stagetwo-tier2:updaten` opnieuw. Ga bij `gepusht` door naar 3d.

### 3d: wat je onthoudt voor het eind

Onthoud voor de samenvatting aan het eind (deel 6), in gewone taal:

1. wat er is bijgewerkt en waarom (een nieuwere versie van de gedeelde werkwijze), en
   wat er niet is bijgewerkt (de bestanden waarvoor hij **eigen** koos);
2. waar de pull request staat (`pr.url`, of anders `vergelijkUrl` om hem zelf te openen);
3. wat hij nu doet: de pull request bekijken, wachten tot de checks groen zijn en op
   Merge drukken. Zijn de checks rood, dan voldoet de app niet aan een nieuwe regel;
   dan neemt hij contact op met Stage Two en zet hij de check niet uit (tijdens het project
   met de link; na de overdracht met een beschrijving of schermafbeelding, want dan kan Stage
   Two de privé-repo niet openen, tenzij de owner tijdelijk leestoegang geeft).
   Meekijken en meedenken vallen binnen het abonnement; meer werk aan de app doet Stage Two
   op nacalculatie.

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
door, met jouw hulp, als een gewone wijziging via `/stagetwo-tier2:verder-werken`, of
Stage Two doet het op verzoek tegen nacalculatie (€120 per uur exclusief btw). Wijzigingen
aan apps vallen buiten het abonnement. Begin er niet zelf aan zonder dat de gebruiker
erom vraagt. `dependabot`: voorstellen van Dependabot die nog openstaan; noem ze en zeg dat de
gebruiker ze kan mergen als de checks groen zijn.

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
Overgeslagen bestanden leg je net zo voor als bij deze app.

## Deel 6: samenvatting

Sluit af met één overzicht, in gewone taal:

1. Per app de pull requests (template en afhankelijkheden) met hun link, en wat er voor
   de template is bijgewerkt en wat niet (de bestanden waarvoor **eigen** is gekozen).
2. Wat de gebruiker nu doet: per pull request wachten tot de checks groen zijn en op
   Merge drukken. Zijn de checks rood, dan voldoet de app niet aan een nieuwe regel; dan
   neemt hij contact op met Stage Two en zet hij de check niet uit (tijdens het project
   met de link; na de overdracht met een beschrijving of schermafbeelding, want dan kan Stage
   Two de privé-repo niet openen, tenzij de owner tijdelijk leestoegang geeft).
   Meekijken en meedenken vallen binnen het abonnement; meer werk aan de app doet Stage Two
   op nacalculatie.
3. Is in deel 1 of 2 iets bijgewerkt, zeg dan dat de app opnieuw moet starten, met deze
   uitleg: sluit de Claude-app helemaal af (Windows: rechtsonder in het systeemvak op het
   pijltje **^**, rechtermuisknop op het Claude-icoon, **Afsluiten**; macOS: cmd+Q), open
   hem opnieuw, klik dit gesprek aan in de linkerzijbalk en typ **ga verder**.

## Wat je niet doet

- Je wijzigt geen bestanden in deze checkout, ook niet als de gebruiker dat vraagt om
  "het even snel op te lossen": de update loopt altijd via de pull request.
- Je voegt niets toe aan de commando's hierboven: geen `cd`, geen omgevingsvariabelen,
  geen token, geen `pass` of `gpg`. Het script vindt alles zelf.
- Je merget geen pull request; dat doet de gebruiker zelf.
- Je werkt geen andere app bij zonder dat de gebruiker die in deel 5 heeft gekozen.
