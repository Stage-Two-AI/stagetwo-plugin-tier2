---
name: nieuwe-app
description: Een nieuwe app starten op tier 2 van Stage Two, op Cloudflare en Supabase - eerst meedenken over wat de app moet doen, dan de app aanmaken uit de nieuwste template voor tier 2 van Stage Two (de gewone voor een werktuig achter een login, of de openbare voor een app die vindbaar is in Google of die klanten gebruiken) onder de organisatie van de gebruiker, en hosting, deur en database laten inrichten door de beheer-repo. Gebruik dit als de gebruiker /stagetwo-tier2:nieuwe-app typt of een nieuwe app wil beginnen. Gaat eerst na of het idee als nieuw onderdeel in een bestaande superapp van het bedrijf past; alleen bij een andere gebruikersgroep, een los geheel of een verzamelplek voor gegevens van buiten wordt het een nieuwe superapp.
---

Je helpt iemand die niet technisch is om een nieuwe app goed te beginnen. Het gesprek
is het belangrijkste deel: de keuzes hieronder zijn achteraf duur om te veranderen. Praat
in gewone taal, stel één vraag tegelijk, en geef bij elke keuze een advies met de reden.
De gebruiker beslist. Voer niets uit wat hier niet staat.

## Stap 1: hoort het bij een superapp die er al is?

Vraag wat de gebruiker wil maken, in één of twee zinnen. Ga daarna eerst na bij welke
bestaande app van het bedrijf het past. De apps van een bedrijf zijn **superapps**: één app
per gebruikersgroep, met één repo en één database, waarin elk onderdeel een eigen pad
(bijvoorbeeld `/planning`) en een tegel op de startpagina krijgt. Een nieuw idee is daarom
meestal een nieuw onderdeel, geen nieuwe app. Welke apps er zijn, vraag je de gebruiker of
lees je uit de organisatie:
`gh repo list <organisatie> --no-archived --json name,description -q '.[] | "\(.name): \(.description)"'`.
Heeft het bedrijf nog geen app, dan wordt dit de eerste superapp; ga door naar stap 2.

Toets het idee aan drie vragen: **wie gebruikt het** (eigen mensen of mensen van buiten),
**welke gegevens gebruikt het** (gegevens die al in een app zitten of daar naast horen), en
**is het een los geheel** (een ander bedrijf in de groep, of iets wat later apart verkocht
kan worden).

| Wat je hoort | Advies |
|---|---|
| Eigen mensen, ook als het een andere groep is dan nu (bijvoorbeeld de werkvloer naast kantoor) | nieuw onderdeel van de interne superapp |
| Gegevens die al in een app zitten, of die je daar later naast wilt zien | nieuw onderdeel van die app |
| Een scherm, een overzicht of een werktuig erbij | nieuw onderdeel |
| "Kan dit er ook nog bij?" | bijna altijd een nieuw onderdeel |
| Mensen van buiten: klanten, leveranciers, een webshop, links die naar klanten gaan | nieuwe superapp |
| Een los geheel: een ander bedrijf in de groep, of iets wat later apart verkocht kan worden | nieuwe superapp |
| Een verzamelplek voor gegevens van buiten, die andere apps alleen lezen | nieuwe superapp |

De regel erachter is simpel en de gebruiker mag hem horen: **één database per superapp,
en alleen die app verandert hem.** Gegevens die op twee plekken staan gaan uit elkaar lopen,
en twee apps die dezelfde tabellen veranderen zitten elkaar in de weg.

Elke database kost ook geld: bij Supabase betaalt het bedrijf per database per maand, en
elke app heeft er twee (echt en test). Een nieuwe app voor elk idee loopt dus op, terwijl
een onderdeel erbij niets extra kost.
Andere gebruikers zijn op zichzelf geen reden voor een nieuwe app: wie welk onderdeel mag
gebruiken, regel je binnen de app.

Past het bij een bestaande app? Zeg bij welke, en dat het een nieuw onderdeel wordt met een
eigen pad en een tegel. Een nieuw onderdeel krijgt een regel in `src/onderdelen.ts`; de
browsertest opent het dan vanzelf. Verwijs naar `/stagetwo-tier2:verder-werken` in de map van die app.
Stop dan hier.

Is een nieuwe superapp nodig? Zeg welke van de drie redenen het is (een andere
gebruikersgroep, een los geheel of een verzamelplek voor gegevens van buiten), en dat de app
een eigen database krijgt. Ga dan door.

Moet die nieuwe app gegevens van een bestaande app gebruiken, bijvoorbeeld een portaal waarin
klanten hun eigen orders zien? Dat kan: de nieuwe app leest dan mee en verandert niets aan de
opbouw van de database, want dat doet alleen de app die hem bezit. Maar het is een keuze met
een eigen beveiligingsopzet die App inrichten niet vanzelf maakt. Zeg dat en stop hier: zet de
opzet met de gebruiker op een rij in `/stagetwo-tier2:verder-werken`, in de app die de gegevens
bezit. Wie er hulp bij wil, kan het op verzoek als betaald werk door Stage Two laten doen.

Stel daarna één vraag, in deze woorden: **"Moet de app vindbaar zijn in Google of door klanten
gebruikt worden?"** Leg kort uit waarom je het vraagt: tier 2 heeft twee templates.

- **Nee** (een werktuig voor eigen mensen, achter een login): de gewone template van tier 2,
  zoals altijd. Ga door; laat `--template` hieronder weg.
- **Ja** (een website, een webshop, een pagina die mensen delen, een portaal voor klanten): de
  openbare template van tier 2. Daar maakt de server elke pagina, zodat Google, WhatsApp en
  AI-zoekers hem kunnen lezen, en kunnen klanten zelf inloggen met een code per mail. Vraag
  dan nog één ding: **moeten klanten kunnen inloggen?** Ja is een klantportaal (stap 5b);
  nee is een site die alleen bekeken wordt. Geef hieronder `--template openbaar` mee.

Twijfelt de gebruiker? Adviseer de gewone template als alleen eigen mensen de app gebruiken;
alleen voor mensen van buiten is de openbare nodig. Overstappen kan later, maar is een
verbouwing.

Zit de openbare template niet in de levering van deze organisatie, dan zegt de droogloop dat
(stap 5, `kanTier2`). Zeg het eerlijk en bied tier 2 aan: die app werkt meteen, achter de deur.
Wil het bedrijf de openbare template, dan zet de owner hem aan bij het abonnement; daarna kan
het met hetzelfde commando. Verzin geen andere weg.

## Stap 2: het idee scherp

Vraag door tot je op elk punt een concreet antwoord hebt. "Dat zien we later wel" is
het duurste antwoord.

1. **Wat kan iemand straks dat nu niet kan?** Eén zin, vanuit de gebruiker geschreven.
   Dit wordt de omschrijving van de app.
2. **Wie gaat het gebruiken?** Hoeveel mensen, en alleen eigen personeel of ook mensen
   van buiten.
3. **Welke gegevens gaan erin?** En of daar persoonsgegevens bij zitten.
4. **Wat is de eerste versie waar iemand echt iets aan heeft?** Het kleinste ding dat
   maandag al gebruikt zou worden.

## Stap 3: wat de app meekrijgt

Hier is niets te kiezen; zeg het in twee zinnen. Elke app van tier 2 staat eerst achter een
deur: alleen de mensen uit de toegangslijst van het bedrijf komen erin, en ze loggen in
met hun werkaccount (of met een code per mail). Bij de openbare template gaat die deur later
open voor bezoekers en klanten (stap 5b); medewerkers loggen dan nog steeds zo in. En elke app krijgt een eigen database bij
Supabase, want het inloggen loopt daar doorheen. Supabase kost het bedrijf ongeveer €22 per
maand, plus ongeveer €9 per maand per database; een app heeft er twee (echt en test). Die
bedragen staan ook op https://stagetwo.nl/#aanbod.

## Stap 4: naam en plek

- **Naam.** Stel er een voor: kort, kleine letters, streepjes. Het is een superapp, dus
  een naam voor het geheel en de gebruikersgroep (bijvoorbeeld `intern` of `klantportaal`),
  niet voor het eerste onderdeel. Laat de gebruiker kiezen.
- **Eigenaar.** Toon de organisaties van de gebruiker met `gh api user/orgs -q '.[].login'`.
  Kies de organisatie van het bedrijf: daar staat de beheer-repo die hosting en database
  inricht, en dan is de app van het bedrijf en niet van één persoon. Is er geen
  organisatie, zeg dan dat de app in een organisatie van het bedrijf hoort, dat de owner die eerst
aanmaakt (in de projectfase doet Stage Two dat), en stop hier.
- **Wie erbij mag.** Lees de groepen uit de toegangslijst:
  `gh api repos/<eigenaar>/stagetwo-beheer-tier2/contents/toegang.json -H "Accept: application/vnd.github.raw"`
  (bestaat die niet, dan heet de beheer-repo nog `stagetwo-beheer` of `stack-beheer`: gebruik dan die naam).
  Staat de naam van de app al onder `apps`, dan is dit al geregeld; zeg dat. Zo niet, toon
  dan de groepen (met wie erin zit, in gewone woorden) en laat de gebruiker kiezen. Zijn
  er geen groepen, dan maakt de owner van de organisatie die aan (tijdens het project
  Stage Two); ga gewoon door, stap 5b meldt het.
- **Testadres.** Vraag naar welk adres de testmails van deze app mogen. In de testdatabase en lokaal gaat
  elke mail van de app naar dat ene adres, wie er ook als ontvanger staat, want daar staat een
  kopie van echte gegevens. Stel het adres van de gebruiker voor (`git config user.email`).
  Het hoort bij de app, niet bij één persoon, dus een gedeeld adres mag ook.
- **Map.** De app komt als nieuwe submap met de naam van de app onder de map die nu open
  staat. Zeg dat.

## Stap 5: droogloop, dan aanmaken

Draai eerst de droogloop, met Bash, precies zo:

```sh
node "${CLAUDE_SKILL_DIR}/scripts/nieuwe-app.mjs" --json --droogloop --naam "<naam>" --eigenaar "<eigenaar>" --omschrijving "<omschrijving>" --organisatie "<bedrijfsnaam>" --testmail "<testadres>" [--template openbaar]
```

`--template openbaar` alleen als het antwoord in stap 1 "ja" was.

`<bedrijfsnaam>` is de naam van het bedrijf waarvoor de app is, zoals je die uit het gesprek of
de map kent (bijvoorbeeld "Richplant B.V."); die komt in de `LICENSE` van de app. Weet je hem
niet, laat `--organisatie` dan weg: het script neemt de naam van de organisatie op GitHub.

Het antwoord is één JSON-object met een `status`.

- `mislukt`: `reden` is één zin met wat de gebruiker moet doen. Geef die door en stop.
  Probeer het niet te omzeilen. Staat er `kanTier2: true` bij, dan is de openbare template er
  (nog) niet voor deze organisatie: zeg dat in gewone woorden en vraag of de app op tier 2 mag
  (dan dezelfde droogloop zonder `--template`).
- `klaar`: vat `plan` samen in hooguit vier regels: welke repo, waar op deze computer,
  en wie de reviewer is. Staat `githubPlan` op `free` en is de
  eigenaar een organisatie, zeg dan dat main straks niet beschermd kan worden op het
  gratis plan, en dat de owner dat oplost door de organisatie op het plan Team te zetten (in
  de projectfase regelt Stage Two dat); doorgaan mag.

Zeg dan: "Ik maak hem nu aan; dat duurt een paar minuten." Draai hetzelfde commando met
`--doe-het` in plaats van `--droogloop`. Vraag geen toestemming meer; het typen van
`/stagetwo-tier2:nieuwe-app` en de bevestiging van het plan waren de opdracht.

Het script zet zelf de `LICENSE` op naam van het bedrijf (het gebruiksrecht van Stage Two
blijft in `LICENSE-STAGE-TWO`) en laat `.claude/settings.json` naar de kopie van de plugin in
de eigen organisatie wijzen. Pas die bestanden niet zelf aan.

- `mislukt`: geef `reden` door (dat is de volledige foutmelding). Staat er een `repo` in
  het antwoord, dan is de repo al aangemaakt: **draai precies hetzelfde `--doe-het`-commando
  nog een keer**. Het script ziet dat de repo uit de template komt en maakt af wat er nog
  ontbreekt (invullen, installeren, committen, pushen, main beschermen, de omgevingen).
  Lukt het de tweede keer ook niet, stop dan, geef de melding in gewone taal door en zoek met
  de gebruiker uit wat er mis is (rechten in de organisatie, het GitHub-plan, het netwerk).
  Verzin geen omweg buiten het script.

  **Zet nooit zelf repo-instellingen met de hand**: geen `gh api .../rulesets`, geen
  omgevingen, geen secrets, geen `git push` naar main. Dat doet alleen het script. Claude
  Code houdt zo'n handmatige aanroep terecht tegen, en een half met de hand ingerichte
  repo laat later App inrichten vastlopen. Verwijder ook zelf niets.
- `gemaakt`: zeg waar de app staat (`url` en `map`). Ga dan door naar stap 5b; de
  `nogTeDoen` uit dit antwoord gebruik je alleen als stap 5b `geen-beheer` geeft.

## Stap 5b: hosting, deur en database laten inrichten

Hosting en deur (Cloudflare) en de database (Supabase) worden ingericht door de workflow
**App inrichten** in de beheer-repo van de organisatie (`<eigenaar>/stagetwo-beheer-tier2`, bij klanten die nog niet zijn omgezet `stagetwo-beheer` of `stack-beheer`), op
GitHub. Daar staan alle sleutels; op deze computer komt bewust geen Cloudflare- of
Supabase-toegang. Probeer dat nooit zelf te doen, ook niet als er een opdrachtregel voor
blijkt te staan (`wrangler`, `supabase`).

Draai:

```sh
node "${CLAUDE_SKILL_DIR}/scripts/nieuwe-app.mjs" --json --inrichten --naam "<naam>" --eigenaar "<eigenaar>" [--groepen "<groep1>,<groep2>"]
```

`--groepen` alleen als de app nog niet in de toegangslijst stond (stap 4). Zeg vooraf dat
dit tot een kwartier kan duren: een nieuwe database moet opstarten.

**Een klantportaal** (openbare template, klanten loggen in): dan staat de app in de
toegangslijst als klantportaal. Daarvoor regelt de owner een eigen domein voor de app, bij
Resend een geverifieerd domein voor de afzender van de inlogmail, en een Turnstile-widget
(captcha) voor het inlogscherm, met de geheime sleutels als secrets in de beheer-repo. Turnstile
is geen extraatje maar de standaard: een open inlogformulier zonder captcha kan door één persoon
worden platgelegd. Vraag of dat er al is.

- **Nog niet** (gebruikelijk bij een nieuwe app): richt de app eerst in zoals hierboven, achter
  de deur. Zo kan er meteen gebouwd en bekeken worden. Is het er later wel, draai dan hetzelfde
  commando met `--klantportaal` erbij (zie hieronder); dat zet de app om.
- **Ja**: voeg toe `--klantportaal --afzender "<Naam> <adres>" --turnstile-sitekey "<openbare
  sleutel>"`. Het adres staat op het domein dat bij Resend is geverifieerd, en de sleutel is de
  openbare (Site Key) van de widget, nooit de geheime; vraag beide aan de gebruiker, verzin ze
  niet. Alleen als de gebruiker uitdrukkelijk zonder captcha wil, geef je `--zonder-captcha` in
  plaats van de sleutel; zeg dan de `waarschuwing` uit het antwoord letterlijk door (die staat
  ook in de pull request).

Daarna gaat het in deze volgorde (het antwoord geeft ze in `nogTeDoen`; de details staan in de
README van de beheer-repo, hoofdstuk Klantportaal):

0. Vooraf: de app staat op versie 43 of later, heeft een eigen domein, en de regels in de
   database zijn nagelopen (bij een klantportaal de enige grens).
1. Resend-sleutel en Turnstile-widget; de geheime sleutels als secrets in de beheer-repo.
2. De pull request op `toegang.json` laten mergen.
3. App inrichten: zet alles klaar, de deur blijft nog staan.
4. De app opnieuw uitrollen en achter de deur testen (inloggen per mail, de widget).
5. App inrichten nog een keer, met het vinkje "Deur weghalen": nu gaat het domein open.
6. De knop "Controle van buitenaf" in de beheer-repo.

Het antwoord:

- `kies-groepen`: de app staat nog niet in de toegangslijst en er zijn geen groepen
  meegegeven. Toon `groepen`, laat kiezen, en draai opnieuw met `--groepen`. Is de lijst
  leeg, geef dan `reden` door: de owner maakt de groepen aan (tijdens het project Stage Two).
- `wacht-op-toegang`: er staat nu een pull request op de beheer-repo (`pr`) die de app
  aan de toegangslijst toevoegt (of, met `klantportaal: true`, als klantportaal neerzet of een
  bestaande app omzet; loop dan ook `nogTeDoen` langs: dat regelt de owner vóór App inrichten). Die wijzigt alleen `toegang.json`, dus de controle
  Toegang of review wordt vanzelf groen. Zeg dat de gebruiker hem zelf merget als hij in het
  team `toegangsbeheer` zit (anders de owner van de organisatie); zo beslist een mens wie
  bij een app mag. Zeg ook dat je daarna hetzelfde commando nog een keer draait, zonder
  `--groepen`. Je kunt intussen al bouwen.
- `klantportaal-anders`: de app staat al als klantportaal in de toegangslijst, met een andere
  afzender of captcha dan je meegaf. Er is niets gewijzigd. Geef `reden` door: een wijziging
  gaat via een pull request op `toegang.json`; inrichten met wat er staat kan met hetzelfde
  commando zonder `--klantportaal`.
- `geen-beheer`: deze organisatie heeft (nog) geen beheer-repo. Zeg dat die er aan het begin
  van het project komt (Stage Two zet hem klaar) en dat hij daarna hosting en database
  inricht; de app zelf is klaar. Loop de `nogTeDoen` van stap 5 langs.
- `mislukt`: geef `reden` door, met de `url` van de run als die er is. De app zelf is
  gewoon klaar; alleen de inrichting ontbreekt. Zoek met de gebruiker de oorzaak in de run
  (`url`); daarna start hij (of de owner) App inrichten opnieuw met hetzelfde commando.
- `ingericht`: deur, inloggen en database staan. Het adres van de app staat in `adres`;
  tot de eerste uitrol toont het "Deze app wordt ingericht.", al achter de deur. Loop
  `nogTeDoen` langs, elk punt in één zin.

## Stap 6: en nu verder

Zeg tot slot, in deze volgorde:

1. Draai in de huidige map `node "${CLAUDE_SKILL_DIR}/../installatie/scripts/werkmap.mjs"`,
   zodat de werkmap de nieuwe app kent (CLAUDE.md en de preview). De gebruiker kan hier
   blijven werken; de afspraken en de bewaker werken ook vanuit deze map. De nieuwe map
   apart openen in Claude Code (Bestand, map openen) mag ook.
2. Typ `/stagetwo-tier2:verder-werken` en beschrijf de eerste versie uit stap 2.
   Komen er gegevens in, dan begint dat werk met de eerste tabellen; die route zit in
   `/stagetwo-tier2:verder-werken` (met `docs/routes/databasewijziging.md`). Krijgt de app
   rollen, dan schrijft de assistent in die pull request ook één keer `supabase/testrol.sql`,
   zodat de testgebruiker dezelfde rol heeft als de bouwer. De eerste merge zet de app echt
   neer.
3. Hoeft niet: wil de gebruiker Stage Two later over deze app laten meedenken (binnen het
   abonnement), dan noemt hij de naam en waarvoor hij is. Een link naar de repo helpt alleen tijdens het
   project; na de overdracht kan Stage Two een privé-repo standaard niet openen. Toegang tot de app
   heeft Stage Two niet nodig: nieuwe versies van de werkwijze haalt de gebruiker zelf in de app
   binnen met `/stagetwo-tier2:updaten`.
