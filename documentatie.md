# Uitgebreide documentatie voor de Shopify ERP Connector

Welkom bij de uitgebreide documentatie van de Shopify ERP Connector. Dit project is ontstaan vanuit de behoefte om integraties tussen verschillende ERP-systemen en Shopify te stroomlijnen. In plaats van voor iedere klant opnieuw het wiel uit te vinden, biedt deze connector een generiek fundament waar we snel nieuwe koppelingen op kunnen configureren. Op basis van Node.js, Express en een aantal moderne libraries bouwen we zo een toekomstbestendige oplossing.

## Inhoudsopgave

1. [Achtergrond en doel](#achtergrond-en-doel)
2. [Architectuur en componenten](#architectuur-en-componenten)
3. [Belangrijkste packages](#belangrijkste-packages)
4. [Setup en eerste stappen](#setup-en-eerste-stappen)
5. [Werking van het synchronisatieproces](#werking-van-het-synchronisatieproces)
6. [Database en datamodellen](#database-en-datamodellen)
7. [Front-end integratie](#front-end-integratie)
8. [Deployment en schaalbaarheid](#deployment-en-schaalbaarheid)
9. [Beveiliging en best practices](#beveiliging-en-best-practices)
10. [Keuzes en overwegingen](#keuzes-en-overwegingen)
11. [Veelgestelde vragen](#veelgestelde-vragen)
12. [Bijlage: voorbeeldconfiguratie](#bijlage-voorbeeldconfiguratie)

## Achtergrond en doel

Binnen het bureau waar dit project is opgezet zagen we dat klanten regelmatig dezelfde integratieproblemen tegenkwamen. Iedere webshop heeft zijn eigen ERP of PIM, maar de basisbehoefte is vergelijkbaar: producten moeten gesynchroniseerd worden, voorraad moet kloppen en wijzigingen moeten snel zichtbaar zijn in Shopify. Traditioneel schreven we voor elke klant maatwerk. Dat kost tijd en vooral veel herhalend werk. Daarom ontstond het plan om een generieke connector te ontwikkelen die we kunnen hergebruiken. Het doel is simpel: minder uren kwijt zijn aan integraties en ze toch op maat kunnen aanbieden. Met deze documentatie krijg je inzicht in hoe het systeem is opgebouwd, welke keuzes we hebben gemaakt en hoe je zelf nieuwe koppelingen kunt configureren.

## Architectuur en componenten

De connector bestaat uit verschillende samenwerkende onderdelen. De belangrijkste componenten zijn:

### 1. API-server

De API-server draait op Express. Alle routes bevinden zich in `src/integrationRoutes.js`. Hier kun je configuraties aanmaken, bewerken, verwijderen en handmatig synchronisaties starten. De server is opgezet met standaard middleware als `compression`, `cors`, `helmet` en `morgan` voor logging. Zo houden we de API snel en veilig.

### 2. Scheduler

In `src/scheduler.js` draait een geplande taak die iedere minuut kijkt welke configuraties een synchronisatie nodig hebben. Met behulp van `node-cron` wordt voor elke configuratie een job ingepland. De scheduler zorgt er ook voor dat wijzigingen in de frequentie direct worden opgepikt. Actieve taken worden bijgehouden in een map zodat we ze eenvoudig kunnen bijwerken of verwijderen.

### 3. Worker

Het hart van de synchronisatie zit in `src/productSync.js`. Hier wordt een worker opgezet via BullMQ. Zodra de scheduler een job in de queue plaatst, pakt de worker deze op. Voor iedere configuratie worden de stappen van downloaden tot updaten of verwijderen van producten doorlopen. Alle logging gebeurt met kleurrijke output via `chalk` zodat het in de terminal overzichtelijk blijft.

### 4. Queue

We gebruiken BullMQ, aangestuurd door Redis, om taken asynchroon af te handelen. De queue maakt het mogelijk om meerdere workers naast elkaar te draaien. Bij hogere belasting kunnen we dus simpelweg meer workers starten zonder de code te wijzigen. In `src/queue.js` staan de helperfuncties om een queue en bijbehorende workers aan te maken.

### 5. Database

Voor opslag kiezen we PostgreSQL. Het is een robuuste open-source database die prima samenwerkt met Node.js. In `src/db.js` staat de databaseconnectie. We maken gebruik van connection pooling via `pg.Pool` waardoor het systeem efficiënt omgaat met verbindingsresources. Alle queries worden uitgevoerd via eenvoudige helperfuncties in `src/integrationRepo.js` of de services.

### 6. Shopify integratie

Via `graphql-request` en zelfgeschreven query- en mutationbestanden communiceren we met de Shopify GraphQL API. In `src/shopify.js` vind je een kleine helper die GraphQL-queries uitvoert op basis van het toegangstoken dat is ingesteld in de configuratie.

### 7. Mapping en data-transformatie

Omdat ieder ERP-systeem zijn eigen veldnamen gebruikt, hebben we een mappinglaag gebouwd (`src/mapping.js`). Daarin vertalen we velden van het ERP naar de juiste velden in Shopify. Ook verzorgen we de aanmaak van metafields. Het resultaat van deze mapping wordt vervolgens doorgegeven aan de daadwerkelijke synchronisatiestap.

## Belangrijkste packages

Het project maakt gebruik van een aantal externe packages. Hieronder een overzicht met korte toelichting:

- **express** – de basis van onze API. Bekend, betrouwbaar en heeft volop middleware.
- **bullmq** – voor het opzetten van de queue en de workers. Gebouwd bovenop Redis en geschikt voor grote workloads.
- **ioredis** – client voor Redis, nodig voor BullMQ.
- **pg** – PostgreSQL client. Hiermee voeren we queries uit en beheren we de databaseconnectie.
- **node-cron** – om geplande taken (zoals de scheduler) eenvoudig te definiëren met cron-expressies.
- **basic-ftp** – om productbestanden vanaf een FTP-server te downloaden. Werkt ook met SFTP.
- **graphql-request** – kleine library om GraphQL queries en mutaties naar Shopify te sturen.
- **p-limit** – begrenst het aantal gelijktijdige API-calls zodat we niet tegen Shopify’s rate limits aanlopen.
- **dotenv** – voor het inladen van omgevingsvariabelen uit een `.env`-bestand.
- **chalk** – kleurt console-uitvoer en maakt logs beter leesbaar.
- **morgan**, **helmet**, **compression**, **cors** – standaard middleware om onze API veilig en snel te houden.
- **nodemon** (dev dependency) – herstart de server automatisch tijdens development.

De combinatie van deze packages zorgt voor een solide basis. Ze zijn bewust gekozen omdat ze actief onderhouden worden en goed samen spelen met Node.js.

## Setup en eerste stappen

Het project is te clonen via Git. Zorg dat je de laatste versie van de branch hebt voordat je aanpassingen doet. Volg daarna de volgende stappen om lokaal te starten:

1. **Installatie van dependencies**
   ```bash
   npm install
   ```
   Hiermee worden alle packages uit `package.json` opgehaald.

2. **.env-bestand aanmaken**
   ```bash
   cp .env.example .env
   ```
   In dit bestand vul je de gegevens in voor je PostgreSQL-database, Redis-server en Shopify-shop. Denk aan `DATABASE_URL`, `REDIS_URL`, `SHOPIFY_SHOP` en het `SHOPIFY_ACCESS_TOKEN`.

3. **Database initialiseren**
   ```bash
   npm run setup-db
   ```
   Dit script maakt de nodige tabellen aan. Het SQL-schema staat in `sql/schema.sql` zodat je kunt zien welke velden er zijn.

4. **Ontwikkelomgeving starten**
   ```bash
   npm run dev
   ```
   De server start met Nodemon zodat wijzigingen direct worden opgepikt. De scheduler en worker worden automatisch meegestart.

5. **Handmatig synchronisaties uitvoeren**
   Met een POST-request naar `/sync/{configId}` kun je handmatig een synchronisatie starten. Dit is handig tijdens het testen.

## Werking van het synchronisatieproces

Om een goed beeld te krijgen van de flow lopen we stap voor stap door het proces heen.

### Stap 1: Configuratie ophalen

Elke synchronisatie begint met het ophalen van de juiste configuratie uit de database. In `product_sync_configs` staan onder andere de connectiegegevens van het ERP (bijvoorbeeld FTP-host, gebruikersnaam, wachtwoord) en de frequentie waarmee gesynchroniseerd moet worden.

### Stap 2: Data ophalen uit het ERP

Afhankelijk van de configuratie wordt er een bestand opgehaald via FTP of een API-call gedaan. In de meeste gevallen gebruiken we JSON-bestanden omdat die eenvoudig te parsen zijn in JavaScript. Met `basic-ftp` connecten we veilig naar de server. Het pad naar het bestand en eventuele extra opties staan in de credentials van de configuratie.

### Stap 3: Data parsen en voorbereiden

Het opgehaalde bestand wordt ingelezen en geparsed. Via de `dataPath`-instelling kunnen we aangeven welk deel van het JSON-bestand de daadwerkelijke productlijst bevat. Zo blijven we flexibel, ongeacht hoe het ERP zijn bestanden aanlevert. Na het parsen worden eventuele ontbrekende SKUs aangevuld en controleren we of de array niet leeg is.

### Stap 4: Mapping naar Shopify-velden

Met behulp van `mapping.js` vertalen we de velden naar het formaat dat Shopify verwacht. Dit bestand leest de mapping uit de configuratie en zet bijvoorbeeld `productName` om naar `title` en `price` naar `variant.price`. Ook worden eventuele metafields voorbereid. Alle producten krijgen daardoor het juiste formaat voor de volgende stap.

### Stap 5: Categoriseren van producten

In `productOperations.js` bepalen we voor elk product of het moet worden aangemaakt, bijgewerkt of verwijderd. Dit gebeurt door de SKUs te vergelijken met bestaande producten in Shopify én met wat er in onze eigen database staat. Het resultaat is een overzicht van drie lijsten: create, update en delete.

### Stap 6: Uitvoeren van de bewerkingen

Het daadwerkelijke aanmaken, updaten en verwijderen gebeurt in `syncOperations.js`. Hier maken we gebruik van zowel individuele GraphQL-calls als de bulk API van Shopify. Voor grote hoeveelheden producten is de bulk API ideaal omdat het veel sneller is. De resultaten van elke bewerking worden gelogd en in de database opgeslagen.

### Stap 7: Bijwerken van de database

Na een succesvolle bewerking updaten we de tabel `products`. Hierin houden we bij welke SKU gekoppeld is aan welk Shopify-product. Dat maakt het in de toekomst makkelijker om te bepalen welke producten verwijderd moeten worden of juist bijgewerkt moeten worden.

### Stap 8: Logging en foutafhandeling

Alle stappen loggen we uitgebreid naar de console én naar de tabel `sync_logs`. Mocht er iets misgaan, dan zien we in de logs precies welke stap faalde. Dankzij de retry-logica van BullMQ kunnen we mislukte jobs opnieuw proberen zonder data kwijt te raken.

## Database en datamodellen

De database bestaat uit een handvol tabellen die elk een duidelijk doel hebben:

- **product_sync_configs** – Hierin staat per integratie waar de data vandaan komt, wat de mapping is en hoe vaak er gesynchroniseerd moet worden.
- **products** – Houdt bij welke SKUs al naar Shopify zijn weggeschreven en welk product-ID daarbij hoort. Dit is belangrijk om updates en deletes goed uit te voeren.
- **sync_logs** – Iedere synchronisatie schrijft hier zijn start- en eindtijd, status en eventueel foutmeldingen weg. Zo kunnen we inzien hoe het verloop van de synchronisaties is.
- **ftp_config** – Bevat standaard FTP-instellingen die we kunnen hergebruiken voor nieuwe configuraties.

Het SQL-script `sql/schema.sql` laat precies zien hoe de tabellen zijn opgebouwd. Voel je vrij om de tabellen uit te breiden met eigen velden, bijvoorbeeld extra metadata bij producten.

## Front-end integratie

Een veelgestelde vraag is hoe deze backend samenwerkt met een front-end React-app of Shopify-app. Hieronder schetsen we een typische aanpak:

### React-app

1. **API-calls** – Alle routes in `integrationRoutes.js` zijn via HTTP bereikbaar. In je React-app kun je met `fetch` of een library als Axios een call maken naar bijvoorbeeld `/configs` om de beschikbare configuraties op te halen.
2. **Status tonen** – Door periodiek `/configs/{id}/logs` op te vragen, kun je de voortgang van een synchronisatie laten zien. Combineer dit met websockets of polling voor realtime updates.
3. **Authenticatie** – De backend bevat zelf geen uitgebreide authenticatie. Je kunt bijvoorbeeld JWT-tokens gebruiken om ervoor te zorgen dat alleen ingelogde gebruikers configuraties kunnen aanpassen. In de React-app verstuur je het token mee in de headers.
4. **CORS en proxy** – Mocht de React-app op een ander domein draaien dan de API, stel dan CORS goed in of gebruik een proxy. In `src/server.js` (niet besproken maar aanwezig) kun je CORS-specifieke middleware configureren.

### Shopify embedded app

1. **App Bridge** – Gebruik Shopify App Bridge om je React-app in de admin van Shopify te laden. De backend blijft hetzelfde; de frontend draait binnen de Shopify-omgeving.
2. **OAuth** – Voor productie-apps heb je OAuth nodig om toegang tot de winkel van de klant te krijgen. Deze connector gaat ervan uit dat je al een access token hebt. In een volledige app regel je de OAuth-flow aan de front-end kant en sla je het token op in de database.
3. **Webhook triggers** – Sommige shops willen automatisch synchroniseren zodra er iets in het ERP verandert. Je kunt dan webhooks gebruiken om het endpoint `/sync/{configId}` aan te roepen. Die webhooks configureer je vanuit je Shopify-app.
4. **UI** – Bouw in React een overzicht waar je configuraties kunt beheren. Denk aan formulieren voor mappings, frequenties en credentials. Omdat alle endpoints JSON teruggeven, is het vrij eenvoudig deze gegevens op te halen en weer te geven.

Op deze manier kun je een volledige integratieportaal bouwen waarin de gebruiker zelf synchronisaties kan starten en logs kan bekijken. De kracht van dit systeem is dat de backend generiek is; de front-end kan je volledig op maat maken.

## Deployment en schaalbaarheid

Deze connector draait prima op een enkele server, maar is ook ontworpen om horizontaal te schalen. Enkele tips:

- **Docker** – Door een Dockerfile toe te voegen kun je de service containeriseren. Start Redis en PostgreSQL als losse containers of gebruik managed versies in de cloud.
- **Meerdere workers** – Start meerdere Node-processen of zelfs meerdere servers die allemaal dezelfde Redis-queue gebruiken. BullMQ zorgt ervoor dat taken netjes verdeeld worden.
- **Monitoring** – Met het script `npm run monitor` zie je in realtime hoeveel jobs er in de queue zitten en hoe snel ze worden afgehandeld. Voor productie kun je tools als PM2 of Kubernetes inzetten om de processen te beheren.
- **Logging** – Stuur de console logs door naar een logaggregatiesysteem (bijv. Elastic, Datadog) zodat je ook terug in de tijd kunt zoeken naar fouten.

## Beveiliging en best practices

Beveiliging is van groot belang, zeker wanneer je met gevoelige productinformatie werkt. Een paar richtlijnen:

- **Environment variables** – Sla tokens en wachtwoorden alleen op in `.env` en nooit in versiebeheer.
- **HTTPS** – Zorg dat de API altijd via HTTPS wordt benaderd, zeker bij productie.
- **Rate limiting** – Shopify hanteert strikte limieten. Met `p-limit` beperken we het aantal gelijktijdige API-calls. Pas dit aan op basis van je eigen ervaringen.
- **Input validatie** – Controleer input van gebruikers in de API goed voordat je queries uitvoert. Express-validator of een vergelijkbare library kan hierbij helpen.
- **Database rechten** – Geef je databasegebruikers alleen de rechten die ze nodig hebben. Gebruik aparte gebruikers voor lezen en schrijven als extra beveiliging.
- **Backups** – Maak regelmatig backups van je database. Hoewel de meeste data opnieuw gegenereerd kan worden, scheelt het veel tijd bij problemen.

## Keuzes en overwegingen

Tijdens het ontwikkelen zijn er allerlei keuzes gemaakt. Enkele belangrijke zijn:

1. **Node.js**
   We kozen voor Node.js omdat het goed om kan gaan met I/O-intensieve taken en er veel kennis van is binnen het team. De asynchronous nature sluit aan bij het idee van queues en workers.

2. **PostgreSQL**
   Hoewel sommige alternatieven (bijv. MySQL, MongoDB) mogelijk waren, biedt PostgreSQL een rijke set features en is het stabiel voor relationele data. De meeste hostingproviders hebben het standaard beschikbaar.

3. **BullMQ**
   Voor het afhandelen van taken zijn er meerdere keuzes, zoals RabbitMQ of Agenda. BullMQ werkt echter zeer prettig met Redis en vraagt weinig setup. Het biedt de mogelijkheid om jobs te herstarten bij fouten en heeft een actieve community.

4. **GraphQL**
   Shopify heeft een REST API en een GraphQL API. We hebben gekozen voor GraphQL omdat het flexibeler is en je precies kunt opvragen welke velden je nodig hebt. Dit maakt de payloads kleiner en de code overzichtelijker.

5. **Mapping via configuratie**
   In plaats van hardcoded velden in de code te zetten, hebben we gekozen voor een dynamische mapping. Hierdoor kunnen we per klant bepalen welke velden uit het ERP naar welke Shopify-velden gaan. Dit maakt de connector breed inzetbaar.

Deze keuzes zijn gemaakt op basis van ervaring en feedback uit het team. Uiteraard staat het iedereen vrij om onderdelen aan te passen aan de eigen wensen.

## Veelgestelde vragen

**1. Kan ik meerdere configuraties naast elkaar draaien?**

Ja, de database ondersteunt meerdere configuraties. De scheduler loopt alle configuraties langs en zet per configuratie een job in de queue. Elke configuratie heeft zijn eigen frequentie en credentials.

**2. Hoe ga ik om met grote productbestanden?**

Voor bulkacties maken we gebruik van Shopify’s bulk API. Voor extreem grote datasets (denk aan tienduizenden producten) kun je overwegen de producten in deelbestanden op te knippen en meerdere jobs achter elkaar te plannen. BullMQ kan grote hoeveelheden prima verwerken zolang Redis genoeg geheugen heeft.

**3. Wat als een product geen SKU heeft?**

Een SKU is essentieel om producten te matchen. Mocht het ERP geen SKU leveren, voeg dan een uniek veld toe dat als SKU kan dienen. Zonder SKU kunnen we geen goede koppeling leggen en zal het product worden overgeslagen.

**4. Ondersteunt dit systeem ook voorraad- of prijsupdates los van productdata?**

De basis is gericht op productinformatie, maar je kunt dezelfde structuur hergebruiken voor voorraad of prijzen. Pas dan de mapping en de GraphQL-mutations aan zodat je alleen die specifieke velden doorstuurt.

**5. Hoe kan ik testen of alles werkt?**

Kijk in `TESTING_GUIDE.md` voor tips over het opstarten van meerdere workers en het uitvoeren van load tests. Er zijn geen unit tests aanwezig, maar je kunt via Postman of een vergelijkbare tool alle endpoints doorlopen.

## Bijlage: voorbeeldconfiguratie

Hieronder vind je een voorbeeld van hoe een configuratie eruit kan zien. Dit kun je via de API posten naar `/configs`.

```json
{
  "id": "demo-config",
  "name": "Demo integratie",
  "connection_type": "ftp",
  "credentials": {
    "host": "ftp.example.com",
    "username": "ftpuser",
    "password": "secret",
    "filePath": "/exports/products.json",
    "dataPath": "items"
  },
  "mapping": {
    "title": "productName",
    "description": "longDescription",
    "variant.price": "price",
    "variant.sku": "sku"
  },
  "metafield_mappings": [
    {
      "sourceKey": "brand",
      "metafieldNamespace": "custom",
      "metafieldKey": "brand",
      "metafieldType": "single_line_text_field"
    }
  ],
  "sync_frequency": "24"
}
```

Met deze configuratie zal het systeem dagelijks de products.json ophalen, de velden mappen en nieuwe producten aanmaken of bestaande bijwerken in Shopify.

---

Met dit document heb je een uitgebreid overzicht van de Shopify ERP Connector. Hopelijk geeft het voldoende handvatten om zelf aan de slag te gaan, nieuwe integraties op te zetten en de service verder uit te bouwen. Heb je vragen of loop je ergens tegenaan, kijk dan in de code of stel ze aan het ontwikkelteam. Succes!
