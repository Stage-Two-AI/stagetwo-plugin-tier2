# Stage Two-plugin voor Claude Code (tier 2)

Je bouwt zelf apps voor je bedrijf met Claude Code, in de omgeving die Stage Two voor je
heeft ingericht. Deze versie van de plugin is voor **tier 2**: apps die op **Cloudflare**
draaien, met hun gegevens bij **Supabase**. Stage Two vertelt je bij de start welke plugin
bij jouw bedrijf hoort.
Deze plugin zorgt dat Claude Code daarbij de werkwijze van Stage Two kent en bewaakt.

Wat je bouwt en je gegevens zijn van jou. De plugin en de template mag je blijven gebruiken
voor je eigen apps, en ze blijven werken, ook zonder Stage Two; de rechten op plugin en
template zelf blijven bij Stage Two (zie `LICENSE`). Bij de start zet Stage Two in de GitHub
van je eigen organisatie een kopie van deze plugin en van de template klaar
(`stagetwo-plugin-tier2` en `app-template-tier2`). Zolang je bedrijf een abonnement bij
Stage Two heeft, zet Stage Two daar nieuwe versies in. Stage Two test elke versie eerst op
zijn eigen apps. Stopt het abonnement, dan blijven die kopieën op de laatste versie staan;
er komt alleen niets nieuws bij, en vragen en meedenken stoppen ook.

Een nieuwe versie raakt twee dingen, en die gaan elk op hun eigen manier:

- **De plugin op je computer** (het gereedschap) werkt zichzelf bij uit de kopie in je eigen
  organisatie. Daar hoef je niets voor te doen; uitzetten kan wel (zie hieronder).
- **Je apps** veranderen alleen via een voorstel (een pull request) dat een bouwer
  goedkeurt. Open je een app en is er een nieuwe versie, dan meldt je assistent dat; met
  `/stagetwo-tier2:updaten` zet de plugin per app het voorstel klaar. Je keurt het goed of
  laat het liggen. Stage Two zet na de overdracht zelf geen voorstellen in je apps klaar.

Het abonnement kost €150 per maand per bedrijf, ongeacht het aantal apps, exclusief btw. Het
loopt vanaf de oplevering, het moment waarop Stage Two de omgeving aan je bedrijf overdraagt,
en is per maand opzegbaar, met een opzegtermijn van één kalendermaand. Daarin zitten nieuwe
versies van template en plugin, die Stage Two eerst op zijn eigen apps test, een nieuwe
versie als een leverancier iets verandert, een nieuwe versie van de beheer-repo als dat nodig
is, en vragen en meedenken. Het abonnement houdt de omgeving niet bij: beheer en werking
blijven na de overdracht bij je bedrijf. Niet in het abonnement zitten systeembeheer, een garantie op beschikbaarheid en meer
werk aan je apps; dat laatste doet Stage Two op verzoek, op nacalculatie tegen €120 per uur
exclusief btw. Dependabot, een dienst van GitHub, stelt in elke app updates van de
npm-pakketten voor, ook zonder abonnement, als pull request die een bouwer goedkeurt; de versies
van de GitHub-workflows komen met een nieuwe templateversie.

Na de overdracht heeft Stage Two geen eigen account, geen beheerrechten en zelf geen toegang
tot je apps in de GitHub-organisatie van je bedrijf, en heeft die ook niet nodig. Je apps
veranderen nooit vanzelf. De plugin wel: dat is software van Stage Two die op de computers
van je bouwers draait met hun rechten, en die zichzelf bijwerkt uit de kopie waar Stage Two
met een abonnement nieuwe versies in zet. Wil je zelf bepalen wanneer dat gebeurt, vraag je
assistent dan "zet het automatisch bijwerken van de plugin uit"; vanaf de volgende start werk
je de plugin zelf bij met `/stagetwo-tier2:updaten`, en "zet het weer aan" draait het terug.
In de Claude-app werken daarna ook je andere plugins zich op die computer niet meer vanzelf
bij, omdat de app dat voor alle plugins tegelijk regelt. Met een
abonnement komen nieuwe versies binnen via de GitHub App `stagetwo-levering`. Stage Two
installeert hem bij de start namens je bedrijf, op alleen de twee kopieën (`stagetwo-plugin-tier2`
en `app-template-tier2`, "Only select repositories"); je bedrijf kan hem altijd zelf
verwijderen. Die App kan alleen daar schrijven, niet in je apps. Heeft de
beheer-repo een nieuwe versie nodig, dan vraagt Stage Two dat; de owner van je organisatie
geeft Stage Two daarvoor tijdelijk toegang tot de beheer-repo en haalt die daarna weer weg.
Dat valt binnen het abonnement. Zeg je op, dan haalt Stage Two je bedrijf uit de lijst van
abonnees en haalt het de App `stagetwo-levering` uit je organisatie. Meer staat op
[stagetwo.nl/aanbod](https://stagetwo.nl/aanbod).

Je hoeft geen programmeur te zijn om dit te gebruiken. De eerste keer loopt Stage Two het
met je door; daarna merk je er weinig van, behalve dat je assistent af en toe iets uitlegt
en je zelf nieuwe apps kunt beginnen.

## Wat de plugin doet

Vier commando's, en een bewaker op de achtergrond:

- **Een begin op een nieuwe computer.** Typ `/stagetwo-tier2:installatie` en je assistent kijkt wat
  er op je computer ontbreekt, installeert het, helpt je inloggen bij GitHub en vraagt
  daarna wat je wilt doen. Zie hieronder.
- **Zelf een nieuwe app beginnen.** Typ `/stagetwo-tier2:nieuwe-app`. Je assistent denkt eerst
  met je mee (wat moet de app doen en voor wie) en maakt hem daarna aan uit de nieuwste
  Stage Two-template, onder het GitHub-account van je bedrijf. De beheer-repo van je
  bedrijf zet hem daarna online, achter de deur. Zie hieronder.
- **Verder werken aan een app.** `/stagetwo-tier2:verder-werken` is de vaste route voor elke
  wijziging, ook aan de database. Je hoeft het commando niet te typen: gewoon vragen wat
  je wilt werkt ook. De route staat ook in je app beschreven (`docs/routes/`).
- **Meekijken terwijl je bouwt.** In de Claude-app start je assistent de app vanzelf op
  je eigen computer en laat hij hem zien in het venster naast het gesprek (de preview).
  Hij kijkt daar zelf ook mee om zijn werk te controleren. De preview praat met de
  testdatabase, nooit met de echte gegevens. Opleveren gaat altijd via een pull request.
- **Een bewaker.** Een deel van de bestanden in je app is niet van jou maar van de
  gedeelde werkwijze: de automatische controles, de afspraken, de routes. Vraag je je
  assistent om daar iets in te wijzigen, dan houdt de plugin dat tegen en legt hij uit
  waarom. Zonder plugin houdt de controle op GitHub het alsnog tegen; met plugin hoor je
  het meteen.
- **Een melding als er een nieuwere werkwijze is.** Open je je app en heeft Stage Two de
  gedeelde werkwijze verbeterd, dan zegt je assistent dat één keer, hooguit één keer per
  dag. Meer niet: hij doet niets zonder dat jij het vraagt.
- **Alles updaten met één commando.** Typ `/stagetwo-tier2:updaten`, en je assistent werkt alles
  bij zoals een update van je computer: de plugin, de programma's op je computer, je app
  naar de nieuwste werkwijze en de pakketten van je app. Wat je app verandert komt als
  voorstel (een pull request) dat jij bekijkt en goedkeurt. Daarna vraagt hij of je
  andere apps ook mee moeten. Je eigen werk raakt hij nooit aan.

Er komt geen wachtwoord, sleutel of computer van Stage Two aan te pas. Alles loopt via je
eigen GitHub-account en je eigen computer.

## Installeren

Je hebt Claude Code nodig: het tabblad **Code** in de Claude-app op je computer, of
Claude Code in een terminal. Op Windows heb je daarnaast **Git** nodig, en dat moet er
eerst zijn: zonder Git kan de plugin niet worden toegevoegd.

**Op Windows, vóór je de Claude-app installeert:** druk op de Windows-toets, typ
`PowerShell`, open het en plak deze regel:

```powershell
winget install -e --id Git.Git
```

Klik op **Ja** als Windows vraagt of dit programma wijzigingen mag aanbrengen. Doe dit
vóór de Claude-app, dan hoeft die daarna niet opnieuw te starten. Op een Mac hoeft dit
niet.

Je installeert de plugin altijd uit de kopie in de GitHub van je eigen organisatie. Die
kopie zet Stage Two bij de start voor je klaar; daarna geeft Stage Two je de precieze regel.
Alleen via die kopie komen nieuwe versies bij jou binnen.

Installeer daarna de Claude-app (claude.ai/download) en log in. Open in het tabblad
**Code** een map (leeg mag, bijvoorbeeld `Documenten\Apps`) en typ in het chatvenster,
met de naam van de GitHub-organisatie van je bedrijf in plaats van `<jouw-organisatie>`:

```text
/plugin marketplace add <jouw-organisatie>/stagetwo-plugin-tier2
```

Er verschijnt een klein venster met de vraag of je deze bron vertrouwt. Bevestig dat.
Daarna opent een scherm met plugins waarin `stagetwo-tier2` al klaarstaat: klik op het **plusje**
ernaast om hem te installeren. Dat is alles.

Werk je in een terminal en verschijnt dat scherm niet, typ dan ook nog:

```text
/plugin install stagetwo-tier2@stagetwo-tier2
```

**Controleren dat het werkt.** Typ `/stagetwo-tier2:` en kijk of de vier commando's verschijnen
(installatie, nieuwe-app, verder-werken en updaten). Zie je ze niet, sluit Claude Code dan en open de map opnieuw.

**Bijwerken van de plugin zelf.** Dat gaat vanzelf, maar pas als
`/stagetwo-tier2:installatie` (of het eerste deel van `/stagetwo-tier2:updaten`) één keer op
deze computer heeft gedraaid; dat werkt in elke map. De plugin toevoegen zoals hierboven,
of ja zeggen als Claude Code bij het openen van een app vraagt of het de plugin mag
installeren, is niet genoeg: voor een bron die niet van Anthropic is, staat automatisch
bijwerken in Claude Code standaard uit, en alleen de installatie zet het aan. Daarna gaat het
zo: kort nadat je de Claude-app hebt geopend en je eerste bericht hebt gestuurd (binnen
ongeveer tien minuten), kijkt Claude Code op de achtergrond of er een nieuwe versie is en
zet die op je computer. Het gesprek dat al open is, houdt de versie waarmee het begon;
Claude Code meldt dan dat de plugin is bijgewerkt. Typ `/reload-plugins` om de nieuwe versie
meteen te gebruiken, of laat het: bij de volgende start van de app werkt hij vanzelf. Dat
gaat alleen over de plugin op je computer; je apps veranderen pas als een bouwer het
voorstel goedkeurt (zie "Alles updaten").

## Beginnen op een nieuwe computer

Typ `/stagetwo-tier2:installatie`, op elke nieuwe computer, ook als de plugin er al staat.
Je assistent kijkt wat er ontbreekt (Git, Node, pnpm en de GitHub-opdrachtregel) en
installeert dat, en zet aan dat de plugin zich voortaan vanzelf bijwerkt (zonder deze stap
gebeurt dat niet). Twee dingen om te weten:

- **Windows vraagt een paar keer om toestemming.** Er verschijnt dan een venster of dit
  programma wijzigingen mag aanbrengen. Klik op **Ja**. Op een Mac kan om je wachtwoord
  worden gevraagd.
- **Inloggen bij GitHub doe je zelf, één keer, in een terminal.** Je assistent legt het
  precies uit: je opent Git Bash (Windows) of Terminal (Mac), typt `gh auth login`,
  kiest GitHub.com, HTTPS, Yes en "Login with a web browser", en typt een code over in
  de browser. **Onthoud die code; kopieer hem niet:** Ctrl+C breekt in dat venster het
  inloggen af. Daarna zeg je "klaar" in het chatvenster.

Soms kent Claude Code een net geïnstalleerd programma nog niet. Je assistent vraagt je
dan de app opnieuw te starten. Dat is normaal en gebeurt maar één keer. Twee dingen
die je daarbij niet vanzelf ziet:

- **Het kruisje sluit de app niet af.** Op Windows blijft hij rechtsonder in het
  systeemvak draaien. Klik daar op het pijltje **^**, klik met de rechtermuisknop op het
  Claude-icoon en kies **Afsluiten**. Open de app daarna opnieuw.
- **Je gesprek opent niet vanzelf.** Klik het aan in de linkerzijbalk en typ
  **ga verder**.

Tot slot zet je assistent je naam in Git, zodat later zichtbaar blijft welke wijziging
van jou is, welke van een collega en welke van Stage Two. Daarna vraagt hij wat je wilt:
een nieuwe app beginnen, verder werken aan een bestaande app, of alles updaten.

## Een nieuwe app beginnen

Typ `/stagetwo-tier2:nieuwe-app`. Het eerste deel is een gesprek, en dat is bewust: de keuzes
daar zijn achteraf duur om te veranderen.

1. Is het echt een nieuwe app, of past het bij een app die je al hebt? De regel is: één
   app per verzameling gegevens. Gaat het over gegevens die al in een app zitten, dan is
   het een uitbreiding van die app, en die maak je met `/stagetwo-tier2:verder-werken`.
2. Wat moet de app doen, voor wie, met welke gegevens, en wat is de eerste versie waar
   iemand echt iets aan heeft?
3. Een naam, de plek (onder het GitHub-account van je bedrijf, in een nieuwe map op je
   computer) en wie erbij mag (een of meer groepen uit de toegangslijst van je bedrijf).

Elke app krijgt een deur (alleen wie op de toegangslijst staat komt erin) en een eigen
database bij Supabase, want het inloggen loopt daar doorheen. Daar hoef je niets voor te
kiezen.

Daarna maakt je assistent de app aan uit de nieuwste template, zet de eerste versie op
GitHub en beschermt de hoofdtak. Hij eindigt met wat er nog open staat en met de
volgende stap: open de nieuwe map in Claude Code en typ `/stagetwo-tier2:verder-werken`.

Hosting, deur en database worden daarna ingericht door de workflow **App inrichten** op
GitHub, in de beheer-repo van je bedrijf (`stagetwo-beheer-tier2`, Stage Two zet die bij de start
neer). Staat de app nog niet op de toegangslijst, dan opent je assistent eerst een
pull request op die beheer-repo die alleen de toegangslijst (`toegang.json`) wijzigt.
Daarvoor is geen goedkeuring nodig: de controle **Toegang of review** wordt vanzelf
groen, en wie in het team `toegangsbeheer` zit merget hem zelf (anders doet de owner van
de organisatie dat). Daarna gaat het verder. Je assistent start de workflow en wacht op
het resultaat. Dat is bewust zo
gebouwd: de toegang tot Cloudflare en Supabase hoort niet op een werkcomputer te staan.
GitHub is de enige plek waar de regels worden afgedwongen, en zo blijft dat. Heeft je
bedrijf nog geen beheer-repo, dan richt Stage Two de hosting en de database in.

Laat Stage Two weten dat de app bestaat (de naam en waarvoor hij is), zodat Stage Two bij
vragen weet over welke app het gaat. Een link naar de repo helpt alleen tijdens het project;
na de overdracht kan Stage Two een privé-repo niet openen. Stage Two heeft geen toegang tot de
app nodig: nieuwe versies van de werkwijze haal je zelf in de app binnen met
`/stagetwo-tier2:updaten`.

## Alles updaten

Zegt je assistent dat er een nieuwere versie van de werkwijze is, of wil je het gewoon
bij de tijd houden, typ dan in de map van je app:

```text
/stagetwo-tier2:updaten
```

Dit is de weg waarlangs een nieuwe versie van de werkwijze in je apps komt. Stage Two zet na de
overdracht zelf geen voorstellen in je apps klaar; Stage Two test elke versie eerst op zijn
eigen apps en zet hem daarna in de kopie die het bij de start in je eigen organisatie heeft
klaargezet. De plugin op je computer
werkt zichzelf al bij; je apps veranderen pas als een bouwer het voorstel goedkeurt.

Wat er dan gebeurt, in deze volgorde:

1. **De plugin zelf** wordt bijgewerkt, voor het geval dat nog niet vanzelf is gebeurd, en
   het automatisch bijwerken gaat aan als dat op deze computer nog niet zo was (tenzij je
   het bewust hebt uitgezet). Een nieuwe versie werkt na het opnieuw openen van de app, of
   meteen na `/reload-plugins`.
2. **De programma's op je computer** (Git, Node, pnpm en de GitHub-opdrachtregel) worden
   bijgewerkt. Op Windows vraagt Windows een paar keer of dat mag; klik op **Ja**.
3. **Je app naar de nieuwste werkwijze.** Je assistent maakt in een tijdelijke kopie van
   je app een voorstel klaar; je eigen bestanden en je lopende werk blijven
   onaangeraakt. Alleen als een bestand van de werkwijze bij jou anders is dan verwacht
   (omdat iemand het ooit heeft aangepast) stelt hij een vraag: de nieuwe versie
   overnemen, of jouw versie houden. Twijfel je? Kies "houden"; dat verandert niets aan
   wat nu werkt. Stage Two kan er daarna naar kijken: tijdens het project met de link naar
   de pull request, na de overdracht met een beschrijving of schermafbeelding (Stage Two kan
   je privé-repo's dan niet openen).
4. **De pakketten van je app** worden bijgewerkt, binnen de grenzen die in je app
   staan, als een tweede, los voorstel. Daarnaast stelt Dependabot in elke app updates van
   de npm-pakketten voor, ook zonder abonnement; de versies van de GitHub-workflows komen met
   een nieuwe templateversie. Een pakket met een nieuwe hoofdversie (een grote
   sprong, zoals een nieuwe React) noemt je assistent alleen. Die zet je zelf door, met hulp
   van je assistent, als een gewone wijziging aan je app; of Stage Two doet het op verzoek,
   op nacalculatie (€120 per uur exclusief btw). Wijzigingen aan je apps vallen buiten het
   abonnement.
5. **Je andere apps.** Je assistent laat zien welke andere apps van je bedrijf nog op
   een oudere werkwijze staan, en vraagt welke je nu wilt bijwerken. Die hoeven niet op
   je computer te staan. Elke gekozen app krijgt zijn eigen voorstellen.

Elk voorstel staat op GitHub als pull request, onder jouw naam, met een uitleg in
gewone taal. Daarna is het aan jou, precies zoals bij elke andere wijziging: open de
pull request, wacht tot de controles groen zijn en klik op **Merge**. Zijn de controles rood, dan
voldoet je app niet aan een nieuwe regel. Neem dan contact op met Stage Two en zet de
controle niet uit. Tijdens het project stuur je de link naar de pull request; na de overdracht
kan Stage Two je privé-repo's niet openen, dus stuur dan een beschrijving of een
schermafbeelding van de rode controle.
Meekijken en meedenken valt binnen het abonnement; moet er meer aan je
app gebeuren, dan doet Stage Two dat op nacalculatie (€120 per uur exclusief btw).

## Als iets niet lukt

| Je ziet | Wat er aan de hand is | Wat je doet |
|---|---|---|
| "log eerst in bij GitHub met `gh auth login`" | Je computer is niet ingelogd bij GitHub | Typ `gh auth login` in een terminal en volg de stappen |
| "de template is niet bereikbaar" | Geen internet, GitHub is even niet bereikbaar, of de template staat niet (meer) waar de plugin hem zoekt | Later opnieuw proberen; lukt het dan nog niet, geef de melding door aan Stage Two |
| "je hebt geen schrijfrecht" | Je account mag niet in deze app schrijven | Vraag de eigenaar van de app je toe te voegen |
| "installeer pnpm" | `pnpm` ontbreekt op je computer | Vraag Stage Two, of installeer het zoals bij de start is uitgelegd |
| "er staat al een pull request open" | Er ligt al een voorstel voor deze versie | Bekijk die pull request en merge hem, of vraag Stage Two |
| Je assistent weigert een bestand te wijzigen | Dat bestand hoort bij de gedeelde werkwijze | Wil je de nieuwste versie: `/stagetwo-tier2:updaten`. Wil je het anders: vraag het Stage Two |
| "er staat al een voorstel voor de afhankelijkheden open" | De pakketten-PR van een vorige keer is nog niet gemerged | Merge die eerst (als de controles groen zijn), of sluit hem, en typ dan opnieuw `/stagetwo-tier2:updaten` |
| De preview toont geen gegevens | Deze app heeft nog geen testdatabase ingesteld | Vraag Stage Two; het opleveren via de pull request werkt gewoon |
| Na installeren zegt `/stagetwo-tier2:installatie` nog steeds dat iets ontbreekt | Claude Code kent het nieuwe programma nog niet | De app helemaal afsluiten (Windows: systeemvak rechtsonder, rechtermuisknop op Claude, Afsluiten), opnieuw openen, het gesprek aanklikken in de linkerzijbalk en **ga verder** typen |
| `/plugin marketplace add` lukt niet op Windows | Git ontbreekt | Git installeren zoals onder "Installeren", de app afsluiten via het systeemvak en opnieuw openen |
| `gh auth login` stopt halverwege | Ctrl+C gedrukt om de code te kopiëren; dat breekt het af | Opnieuw `gh auth login` typen en de nieuwe code onthouden in plaats van kopiëren |
| "de repo bestaat al" bij `/stagetwo-tier2:nieuwe-app` | Er is al een app met die naam | Kies een andere naam |
| "main is nog niet beschermd" na `/stagetwo-tier2:nieuwe-app` | Het GitHub-account staat op het gratis plan | Vraag Stage Two; de app werkt, alleen de bescherming ontbreekt nog |

Kom je er niet uit, dan is de vraag altijd welkom bij Stage Two. Vertel wat je typte en
wat er terugkwam; de melding is bedoeld om door te geven. Vragen en meedenken vallen binnen
het abonnement; meer werk doet Stage Two op nacalculatie (€120 per uur exclusief btw).

## Voor Stage Two

Alles hieronder is voor wie de plugin en de template onderhoudt.

### Tier 1 en tier 2

Stage Two heeft twee varianten van de stack, elk met een eigen template en een eigen plugin
(besluit 15-10-2026, `Stack/docs/besluiten/2026-10-15-tier1-en-tier2.md`):

| Variant | Template | Plugin (deze repo voor tier 2) | Marketplace |
|---|---|---|---|
| tier 1: alleen Cloudflare (D1, R2) | `Stage-Two-AI/app-template-tier1` | `Stage-Two-AI/stagetwo-plugin-tier1` (`stagetwo-tier1`) | `stagetwo-tier1` |
| tier 2: Cloudflare met Supabase | `Stage-Two-AI/app-template-tier2` | `Stage-Two-AI/stagetwo-plugin-tier2` (`stagetwo-tier2`) | `stagetwo-tier2` |

Tot 15-10-2026 heette deze plugin `stack-cloudflare` (repo `stack-plugin-cloudflare`,
marketplace `stagetwo-cloudflare`). Die repo blijft bevroren staan zodat computers die nog
niet zijn omgezet blijven werken; `installatie` en `updaten` halen de oude plugin weg.

Wat deze plugin anders doet dan die van tier 1:

- de template is `Stage-Two-AI/app-template-tier2` (melding, updaten, nieuwe-app);
- de hook, `updaten` en het overzicht doen alleen iets bij een app met
  `"variant": "cloudflare"` in `.claude/stack-manifest.json` (interne naam, blijft zo);
- `nieuwe-app` haalt de paden uit `nietMeenemen` weg, zet de Worker-naam in
  `wrangler.jsonc` op de appnaam, geeft elke app een eigen database, en `--inrichten`
  controleert eerst `toegang.json` van `<org>/stagetwo-beheer-tier2` (oude namen
  `stagetwo-beheer` en `stack-beheer` werken nog), zo nodig met een pull request, en start
  dan **App inrichten** (inputs `app` en `droogloop`);
- `automatisch-bijwerken.mjs` zet de marketplace `stagetwo-tier2` en haalt de oude weg.

Een verbetering die voor beide varianten geldt, doe je in beide repo's.

### Wat waar staat

```text
.claude-plugin/    plugin.json (naam stagetwo-tier2, versie) en marketplace.json (naam stagetwo-tier2)
hooks/             de bewaker (PreToolUse) en de melding bij sessiestart (SessionStart)
skills/            de vier skills; met een script: updaten (bijwerken.mjs voor de
                   template, afhankelijkheden.mjs, overzicht.mjs), installatie
                   (controle.sh, shell omdat Node kan ontbreken) en nieuwe-app
                   (nieuwe-app.mjs: aanmaken, en --inrichten start de workflow in de
                   beheer-repo van de klant; plus ruleset.json voor main)
lib/               de kern: manifest lezen, toepassen, PR-tekst, git- en PR-stappen
beheer/            alleen voor Stage Two, geen skill: de beheerde run over het register,
                   Uitleveren en levering-omzetten.mjs (bestaande apps naar de kopie)
test/              de geheimenscan over boom en geschiedenis
```

`beheer/beheerd.mjs` staat bewust niet onder `bin/`: die map zet Claude Code op het
PATH van elke sessie waarin de plugin aanstaat, ook bij klanten. De beheerde run wordt
gestart vanuit `Stack/bin/stack-sync.mjs`, dat het register en de ruleset meegeeft.

### Hoe het werkt, in het kort

- De bewaker leest de beschermde paden uit `.claude/stack-manifest.json` van de repo
  (de lijst `vervangen`, plus `.github/CODEOWNERS` en alles onder `.github/workflows/`
  en `.claude/`). Zonder manifest doet hij niets. `STACK_ALLOW_POLICY_EDIT=1` laat
  padbewerkingen door, voor onderhoud aan de template zelf.
- De melding vergelijkt `.claude/stack-version` met de hoogste tag `stack-v<n>` op de
  template van de klant (zie "Levering per bedrijf"; zonder levering die van Stage Two), met
  één `git ls-remote` zonder login (drie seconden) en een dagstempel per repo in
  `${CLAUDE_PLUGIN_DATA}`. Weigert GitHub de repo, dan zegt hij dat; zonder netwerk niets.
- Het templatedeel van `/stagetwo-tier2:updaten` (`bijwerken.mjs`) draait in twee stappen: `--droogloop` (voorcontrole, tijdelijke
  kloon, kern toepassen, resultaat als JSON) en `--werkmap <map>` (keuzes toepassen,
  committen met de identiteit van de gebruiker, pushen als de boom verschilt, PR openen
  of bijwerken). Elke commit draagt de trailer `Stack-bijwerken: v<n>`; een branch met
  een commit zonder die trailer wordt nooit opnieuw opgebouwd. De tijdelijke map
  verdwijnt na de tweede aanroep en bij elke mislukking. Met `--repo eigenaar/naam`
  werkt het een app bij die niet op de computer staat (kloon via de gh-login). De
  branchnaam `stack-bijwerken/v<n>` en de trailer blijven zo heten: de beheerde run en
  de bestaande pull requests van klanten leunen erop.
- `afhankelijkheden.mjs`: `pnpm update --no-save` in een tijdelijke kloon (alleen het
  lockfile verandert, de grenzen in package.json zijn deels van de template), PR op de
  vaste branch `stack-afhankelijkheden`; staat die PR al open, dan stopt hij. Noemt de
  hoofdversies uit `pnpm outdated` en de open Dependabot-PR's.
- `overzicht.mjs`: de apps uit de template met schrijfrecht, per eigenaar via
  `gh repo list` en de inhoud van `.claude/stack-version`; wijzigt niets.
- De hook geeft bij schrijven in `supabase/migrations/` de databaseroute mee als
  `additionalContext` (geen weigering, de gewone toestemmingsvraag blijft). Dat
  vervangt de vroegere skill databasewijziging.
- De kern (`lib/toepassen.mjs`) controleert zichzelf: raakt er iets buiten het manifest,
  dan stopt hij. Een eigen bestand van de klant wordt nooit stil overschreven of
  verwijderd; het komt in `overgeslagen` met een reden en een keuze.

### Een klant aansluiten (checklist)

Vooraf: de template is publiek, de tag `stack-v<n>` van de nieuwste versie staat, de
accounts van de klant staan (GitHub-organisatie op een betaald plan, Cloudflare met Zero
Trust, Supabase) en `<klantorg>/stagetwo-beheer-tier2` is ingericht met de tier 2-variant
(`bin/klant-inrichten.sh --variant cloudflare` in Stage-Two-AI/beheer-template), met minstens
één groep in `toegang.json`. De klant heeft Write op stagetwo-beheer-tier2, zodat hij de workflow
mag starten; de sleutels staan in de omgeving `beheer` en zijn voor hem niet te lezen.

1. Op Windows eerst Git (`winget install -e --id Git.Git` in PowerShell), dán de
   Claude-app. Plugin installeren zoals hierboven onder "Installeren" (desktop-app: één
   commando, vertrouwen bevestigen, plusje). Getest 22-09-2026 en, van een kale VM af,
   01-10-2026 op Windows in de desktop-app.
2. `/stagetwo-tier2:installatie` samen doorlopen: installaties, de terminalstap voor `gh auth login`,
   de git-identiteit. Leg vooraf uit: de UAC-vensters, dat de code van `gh auth login`
   overgetypt wordt (Ctrl+C breekt af), en dat een herstart via het systeemvak gaat en
   het gesprek daarna via de linkerzijbalk terugkomt ("ga verder").
3. Controleer dat de vier skills verschijnen als `/stagetwo-tier2:<naam>`.
4. Open een app op versie 9 of nieuwer en controleer dat de bewaker vuurt: vraag de agent
   één regel te wijzigen in `.github/workflows/ci.yml`; dat moet geweigerd worden.
5. Controleer dat de plugin zichzelf bijwerkt. `/stagetwo-tier2:installatie` (stap 5) zet dat op
   gebruikersniveau aan: in `~/.claude/settings.json` `env.FORCE_AUTOUPDATE_PLUGINS = "1"` en
   `extraKnownMarketplaces.stagetwo-tier2.autoUpdate = true`, en in
   `~/.claude/plugins/known_marketplaces.json` `autoUpdate = true` op de regel van
   `stagetwo-tier2`. Alle drie zijn nodig. De desktop-app start Claude Code met
   `DISABLE_AUTOUPDATER=1`, en dat zet het bijwerken van alle plugins uit, tenzij
   `FORCE_AUTOUPDATE_PLUGINS=1` er ook staat. Een marketplace die niet van Anthropic is, werkt
   zich standaard niet bij. En staat dezelfde marketplace in de `.claude/settings.json` van een
   app, dan geldt in die app alleen die regel, in zijn geheel; de regel op de computer telt
   daar niet mee, en Claude Code valt dan terug op `known_marketplaces.json` (wat de
   schakelaar in `/plugin`, tabblad Marketplaces, ook schrijft). Bron:
   code.claude.com/docs/en/plugins/loading ("When auto-update runs") en
   code.claude.com/docs/en/settings-reference ("extraKnownMarketplaces"), gelezen 17-10-2026.
   Daarom staat `autoUpdate` sinds template v22 niet meer in de app: anders wint de app altijd
   van de keuze van de bouwer. Gevolg: de plugin toevoegen met `/plugin marketplace add`, of
   ja zeggen als Claude Code in een app vraagt de plugin te installeren, zet automatisch
   bijwerken niet aan. Pas `/stagetwo-tier2:installatie` (stap 5) of deel 1 van
   `/stagetwo-tier2:updaten` doet dat, op elke computer apart. Vastgesteld op 02-10-2026 op de
   Windows-VM: na de instelling, één herstart en één bericht stond 2.0.0 op de computer,
   zonder nog een herstart. Een lopende sessie houdt wel de versie die hij bij de start laadde;
   de nieuwe laadt bij de volgende start of na `/reload-plugins` (zelfde bron, "When
   auto-update runs"). Controle: vraag de assistent
   `~/.claude/plugins/installed_plugins.json` te tonen.
   Wil de klant dat niet, dan zet `automatisch-bijwerken.mjs --uit` `autoUpdate = false` op
   beide plekken en haalt het `FORCE_AUTOUPDATE_PLUGINS` weg. Dat laatste raakt in de
   desktop-app alle plugins op die computer, en houdt ook een oudere app (met `autoUpdate` nog
   in zijn instellingen) tegen. Een gewone run (ook vanuit `/stagetwo-tier2:updaten`) laat
   dat staan, alleen `--aan` zet het terug. De plugin bijwerken gaat dan met
   `/stagetwo-tier2:updaten`.
6. Loop de melding en `/stagetwo-tier2:updaten` één keer samen door, en `/stagetwo-tier2:nieuwe-app` als
   de klant zelf apps gaat starten. Cloudflare en Supabase richt de workflow "App
   inrichten" in `<klantorg>/stagetwo-beheer-tier2` in (recept: Stage-Two-AI/beheer-template,
   `klant-tier2/`); die toegang komt nooit op de computer van de klant (besluit
   22-09-2026).
7. Zet in `Stack/projecten.json` de `route` van het project op `plugin`; een app die de
   klant zelf met `/stagetwo-tier2:nieuwe-app` maakte, voeg je toe zodra hij hem meldt.

### Een nieuwe versie uitbrengen

Volgorde bij elke release: eerst de plugin, dan de template. Een oude plugin stopt op
een nieuwer manifestformaat; een nieuwe plugin kan altijd met een oudere template
overweg.

1. Plugin: versie in `.claude-plugin/plugin.json` ophogen, pull request, groene check,
   merge naar `main`. Alleen een hoger versienummer laat een computer een update zien.
2. Na die merge de bronrepo taggen, zoals bij de template: op de merge-commit
   `git tag v<versie> && git push origin v<versie>` (bijvoorbeeld `v2.3.0`). Die tag is de
   versie die klanten later krijgen; een commit die daarna op `main` komt, gaat pas mee met
   een volgende versie en een volgende tag. Een tag wordt nooit verplaatst. Na de merge
   krijgen alleen de eigen apps en computers van Stage Two de nieuwe versie: die installeren
   uit deze bronrepo. Klanten krijgen nog niets (stap 6).
3. Template: wijzigingen als pull request op `app-template-tier2`, met
   `.claude/stack-version` en `stackVersion` in het manifest opgehoogd. Een bestand uit
   `vervangen` wijzigt alleen samen met zo'n versieverhoging.
4. Na de merge de tag zetten: `git tag stack-v<n> && git push origin stack-v<n>`. Pas
   dan bestaat de versie voor de melding en de skill. Een tag wordt nooit verplaatst;
   de ruleset op de template weigert dat.
5. Eerst de eigen apps bijwerken. Registerprojecten (de eigen apps van Stage Two):
   `node bin/stack-sync.mjs --status` in Stack, dan de droogloop, dan `--doe-het`. Zo test
   Stage Two elke versie eerst op de eigen apps, vóór een abonnee hem krijgt.
6. Dan Uitleveren aan abonnees: pas als plugin en template op de eigen apps goed werken,
   start je de workflow **Uitleveren** met de hand: `gh workflow run uitleveren.yml -R
   Stage-Two-AI/stagetwo-plugin-tier2 -f getest_versie=<versie> -f getest_template=stack-v<n>`,
   of op de pagina van de workflow **Run workflow**. Beide invoeren zijn verplicht: daarmee
   bevestig je welke pluginversie en welke templatetag op de eigen apps draaien. De plugin
   gaat naar de klant vanaf de tag `v<versie>` uit stap 2, niet vanaf `main`, en heet bij de
   klant ook `v<versie>`. Bestaat die tag niet, heeft `.claude-plugin/plugin.json` op die tag
   een ander versienummer, of is `getest_template` geen tag `stack-v<n>`, dan stopt de run met
   een melding, vóór er iets naar een klant gaat; bestaat de templatetag niet in de template,
   of heeft een klant al een nieuwere pluginversie, dan stopt de job van die klant voordat er
   iets naar die klant gaat. Hij start nooit vanzelf, ook niet bij een merge of een nieuwe
   abonnee. Elke run levert de getagde pluginversie en de template-tags tot en met
   `getest_template` die een klant nog niet heeft (zie hieronder); een nieuwere tag die nog niet
   op de eigen apps draait, gaat niet mee.

### Levering per bedrijf

Een abonnee krijgt plugin en template in zijn eigen GitHub-org, als openbare kopie
(besluit 16-10-2026, `Stack/docs/besluiten/2026-10-16-levering-per-klant.md`):
`<klantorg>/stagetwo-plugin-tier2` en `<klantorg>/app-template-tier2`. Een klant installeert
de plugin altijd uit die kopie (`/plugin marketplace add <klantorg>/stagetwo-plugin-tier2`);
alleen daar staat `levering.json`. Alleen de eigen apps van Stage Two installeren uit deze
bronrepo.

- `levering.json` in de root van de plugin wijst naar die twee repo's. De plugin leest het
  (`lib/levering.mjs`) voor de template (melding, updaten, nieuwe-app) en voor de bron van
  de marketplace (`automatisch-bijwerken.mjs`). Zonder bestand geldt `Stage-Two-AI`. In
  deze bronrepo staat het nooit; de workflow schrijft het per abonnee.
- `abonnees.json` is de lijst met abonnees (GitHub-orgs). Erin = nieuwe versies; eruit =
  de leveringsrepo blijft op de laatste versie staan en er komt niets meer bij.
- De workflow **Uitleveren** (`.github/workflows/uitleveren.yml`, script
  `beheer/uitleveren.mjs`) draait alleen met de hand, nadat Stage Two een versie op de eigen
  apps heeft gecontroleerd; ook na een nieuwe abonnee in `abonnees.json`. Elke run levert de
  pluginversie `getest_versie` vanaf de tag `v<versie>` in deze bronrepo en de template-tags
  tot en met `getest_template` die de klant nog niet heeft. Per abonnee zet hij een nieuwe
  pluginversie neer als dezelfde tag `v<versie>` en elke
  nieuwe template-tag `stack-v<n>` tot en met die tag, elk als één commit van Stage Two bovenop de main van de klant.
  Onze geschiedenis, `abonnees.json` en het uitleveren zelf gaan niet mee.
- In de template van de klant wijst `.claude/settings.json` naar zijn eigen kopie van de
  plugin (de workflow zet dat per versie). `/nieuwe-app` en het bijwerken zetten dezelfde
  bron in de app (`lib/plugin-bron.mjs`): een instelling in de app wint in Claude Code van de
  instelling op gebruikersniveau die `/installatie` zet. Een andere bron telt bij het
  bijwerken niet als lokale aanpassing.
- Bestaande apps (van vóór template versie 22) wijzen nog naar deze bronrepo. Die
  projectinstelling wint, dus de plugin draait voor zo'n app uit de bronrepo, zonder
  `levering.json`. Twee dingen vangen dat op. De plugin leest dan de bron uit de
  instellingen van de gebruiker (`~/.claude/settings.json`, gezet door `/installatie`): wijst
  die naar `<klantorg>/stagetwo-plugin-tier2`, dan gelden die kopie en
  `<klantorg>/app-template-tier2` (`lib/levering.mjs`), en zet de eerste `/updaten` de app om.
  En Stage Two zet bestaande apps in de projectfase vooraf om, met één pull request per app:

  ```sh
  node beheer/levering-omzetten.mjs --org <klantorg> <app> [<app> ...]            # droogloop
  node beheer/levering-omzetten.mjs --org <klantorg> <app> [<app> ...] --doe-het  # pull requests
  ```

  Het script verandert alleen `.claude/settings.json` (branch `stagetwo-levering-omzetten`,
  met de regel `Bevestigd: templatebestanden gewijzigd` voor guard:template): bij de huidige
  naam de waarde van `repo`, en een `autoUpdate` op die regel gaat eruit (die zou in de app
  de keuze van de bouwer op zijn computer overschrijven). Een app van vóór 15-10-2026 met de plugin onder zijn oude
  naam (marketplace `stagetwo-cloudflare`, bron `Stage-Two-AI/stack-plugin-cloudflare`, plugin
  `stack-cloudflare@stagetwo-cloudflare`) gaat naar `stagetwo-tier2` met de kopie als bron, inclusief de
  sleutel in `enabledPlugins`. Daarnaast zet het per app de beveiligingsupdates van
  Dependabot aan als die uit staan (`vulnerability-alerts` en `automated-security-fixes`;
  vraagt beheerdersrechten op de app-repo, anders noemt het de handstap). Met `--doe-het`
  stopt het als de kopie nog geen `levering.json` heeft; de droogloop kijkt dan toch en
  waarschuwt. Het draait met de eigen gh-sessie van Stage Two en gaat niet mee naar een klant.
- Kan de melding bij sessiestart de template niet lezen omdat GitHub de repo weigert of niet
  kent (na het afschermen van de bronrepo: een app of computer die nog niet is omgezet), dan
  zegt de assistent dat één keer per dag en vraagt hij de gebruiker het aan Stage Two door te
  geven (`hooks/versie-op-afstand.mjs`). Zonder netwerk blijft hij stil.
- `/nieuwe-app` zet een `LICENSE` op naam van de organisatie (`--organisatie`, anders de naam
  van de org op GitHub); het gebruiksrecht van Stage Two staat in `LICENSE-STAGE-TWO`, dat
  met elke template-versie meekomt (vanaf template versie 22).
- Schrijfrecht bij de klant gaat via de GitHub App `stagetwo-levering`, alleen op de twee
  leveringsrepo's. Rechten: Contents en Workflows `Read and write`, Metadata `Read-only`,
  verder niets (geen Pull requests, geen apps, geen beheer-repo). Recept in
  `Stack/docs/recepten/github-app-levering.md`.
- Na de overdracht (voorstel 17-10-2026, abonnement zonder toegang): Stage Two houdt geen
  persoonlijk account, geen beheerrechten en geen toegang tot apps in de org van de klant, en
  `.github/CODEOWNERS` gaat naar de klant. Daarom zet `/stagetwo-tier2:nieuwe-app` nooit
  `StageTwoAI` in CODEOWNERS van een klant-app: start Stage Two in de projectfase zelf een app,
  dan wordt het bedrijfsaccount de reviewer (de andere eigenaar in CODEOWNERS van de
  beheer-repo); staat daar geen ander account, dan stopt het script met een melding. Stage Two installeert `stagetwo-levering` bij de
  start namens de klant, op alleen de twee leveringsrepo's ("Only select repositories"); de
  klant kan hem altijd zelf verwijderen. Update-voorstellen in apps zet de bouwer zelf klaar met
  `/stagetwo-tier2:updaten`; Stage Two opent geen pull requests bij de klant. De beheerde
  run (`beheer/beheerd.mjs`) is alleen voor de eigen apps van Stage Two en voor een klant die
  nog in de projectfase zit. Een nieuwe versie van de beheer-repo alleen op verzoek: de owner
  geeft Stage Two tijdelijk toegang en haalt die daarna weer weg. Opzeggen: zie hieronder.

### Een abonnement stoppen

Bij het einde van een abonnement haalt Stage Two zijn eigen toegang weg (voorwaarden 1.1,
art. 18.6). Twee stappen, in deze volgorde:

1. Haal de org van de klant uit `abonnees.json` (pull request, merge). Daarna krijgt hij
   niets nieuws meer; zijn kopieën blijven op de laatste versie staan.
2. Start de workflow **Levering stoppen** (Actions, Levering stoppen, Run workflow) met als
   invoer `org` de GitHub-org van de klant. Die verwijdert de installatie van de App
   `stagetwo-levering` in die org (`beheer/levering-stoppen.mjs`, met dezelfde variabele en
   hetzelfde geheim als Uitleveren). Vink `droogloop` aan om eerst alleen te zien welke
   installatie weg zou gaan.

Staat de org nog in `abonnees.json`, of is het `Stage-Two-AI`, dan stopt de workflow voordat
er iets gebeurt. Heeft de klant de App al zelf weggehaald, dan meldt hij
`niet-geinstalleerd` en is er niets te doen. Let op: dezelfde App levert tier 1 en tier 2.
Heeft een klant beide, haal hem dan eerst uit beide `abonnees.json`-bestanden.

### De repo beschermen

De ruleset op `main` (`.github/ruleset.json`) staat: geen directe push, pull request
met de check `Tests` groen. Opnieuw zetten na een herinrichting:

```sh
gh api repos/Stage-Two-AI/stagetwo-plugin-tier2/rulesets -X POST --input .github/ruleset.json
```

### Tests

```sh
npm test
claude plugin validate .
```

Licentie: vanaf versie 2.3.0 een eigen gebruiksrecht van Stage Two (zie `LICENSE`): klanten
mogen de plugin gebruiken en aanpassen voor hun eigen apps, maar niet los doorgeven of doorverkopen.
Versies tot en met 2.2.0 zijn onder MIT uitgebracht en blijven MIT. De naam Stage Two en de
huisstijl vallen er niet onder.
