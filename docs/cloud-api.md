# Headless rekenservice: REST en HTTP-MCP

Deze service gebruikt `src/lib/core.ts`, dezelfde pure rekenlogica als de
app en de embedbibliotheek. Er draait geen Tauri-venster. De lokale desktop
API op 9742 is een ander productoppervlak: zie [desktop API](api/README.md).

## Contract

| Route | Authenticatie | Resultaat |
| --- | --- | --- |
| `GET /v1/health` | publiek | status en productversie |
| `GET /v1/openapi.json` | publiek | OpenAPI 3.1 uit de tooldefinities |
| `GET /v1/tools` | Bearer | tools en JSON-inputschema's |
| `POST /v1/tools/calculate_project` | Bearer | herberekend project en totalen |
| `POST /v1/tools/get_project_totals` | Bearer | totalen |
| `POST /mcp` | Bearer | stateless MCP Streamable HTTP met JSON-responses |

Beide rekentools nemen `{ "project": <native-project-object> }` aan. Ze lezen
geen serverpaden, benaderen geen desktop en bewaren geen bestanden. MCP biedt
dezelfde twee tools; desktopmutaties en bestandsconversie horen bij de aparte
stdio-server. Er is geen claim dat alle desktopfunctionaliteit via deze
cloudservice beschikbaar is.

De sleutels worden door de beheerder verstrekt. `OPENAEC_API_SLEUTELS` bevat
uitsluitend SHA-256-digests, gescheiden door komma, puntkomma of witruimte.
De client stuurt de oorspronkelijke sleutel als `Authorization: Bearer ...`.
De server vergelijkt hashes met een timingbestendige vergelijking en weigert
zonder geldige digestconfiguratie te starten. Gebruik minstens 32 willekeurige
bytes voor sleutels en zet TLS op de load balancer. Logboeken bevatten alleen
request-id, methode, pad en status; geen headers of begrotingsinhoud.

Voor een lokale rooktest met een tijdelijke sleutel:

```sh
npm ci
npm run build:server
node --input-type=module -e 'import fs from "node:fs"; import {randomBytes,createHash} from "node:crypto"; const key=randomBytes(32).toString("hex"); fs.writeFileSync("/tmp/ocs-api-key",key,{mode:0o600}); console.log(createHash("sha256").update(key).digest("hex"));'
# Zet de afgedrukte hash in OPENAEC_API_SLEUTELS voordat je start.
OPENAEC_API_SLEUTELS=<SHA256_DIGEST> npm run start:server
```

Gebruik in een tweede terminal `curl http://127.0.0.1:8080/v1/health`. Stuur
daarna het voorbeeldproject ingepakt in `{"project": ...}` naar de rekentool.
`npm run test:server` voert dit automatisch uit, inclusief een externe officiële
MCP SDK-client en exacte vergelijking met de pure kern. Deel nooit de
tijdelijke sleutel; verwijder `/tmp/ocs-api-key` na de test.

## Limieten en fouten

Standaard: 5 MiB requestbody, 20.000 regels, maximaal 256 niveaus, vier
gelijktijdige workerthreads en 300 seconden per berekening. Configuratie:
`OPENAEC_API_MAX_CONCURRENT`, `OPENAEC_API_TIMEOUT_MS`, `PORT` en `HOST`.
Een volle service retourneert direct 503 met `Retry-After: 1`; er is geen
onbegrensde wachtrij. Een timeout termineert de worker. Ongeldige JSON of
boomstructuren geven 400, te grote input 413, numerieke overflow 422 en
timeouts 504. REST-fouten bevatten `error_code`, `melding`, `remedie` en
`request_id`. MCP-toolfouten hebben `isError: true` met dezelfde foutinhoud;
protocolfouten volgen de MCP SDK.

Browser-origins worden standaard geweigerd. `OPENAEC_ALLOWED_ORIGINS` is een
optionele komma-gescheiden toelating voor de origincontrole, geen algemene
CORS-proxy. De bedoelde route is server-naar-server via SuperCloud.

## Container en AWS

`Dockerfile` levert een Node.js 22-container met twee gebundelde modules,
notices, healthcheck en de niet-rootgebruiker `node`. De CI bouwt en test de
container met een alleen-lezen bestandssysteem. Op een releasetag pusht zij
het geteste image naar
`ghcr.io/openaec-foundation/open-calc-studio-api:<jaar.week.patch>` en bewaart
de registrydigest plus commit als releasebewijs. OCI-labels bevatten versie,
commit, bron en licentie. Lokaal kan dit met `docker build -t ocs-api .`;
zonder ingestelde digests stopt de container.

`deploy/aws/fargate.json` beschrijft ECS/Fargate, private taken zonder publiek
IP, HTTPS-ALB met ACM-certificaat, healthcheck, beperkte security groups,
CloudWatch-retentie, Secrets Manager en een taakrol zonder extra bevoegdheden.
De execution role krijgt alleen het genoemde secret naast de ECS-execution
rechten. Lever bestaande VPC/subnets, een certificaat, een digest-pinned
image-URI en een secret-ARN met de digestlijst aan. Private subnets vereisen
uitgaand registry-/Secrets Manager-/loggingverkeer via NAT of endpoints;
gebruik een openbaar containerimage of spiegel het image naar ECR. Privé-GHCR
vereist extra registrycredentials, die dit template niet instelt. Een eigen
KMS-key voor het secret vereist aanvullende, gericht ingestelde
decryptrechten. De ALB-hostnaam moet bij het certificaat en je DNS passen.

Dit is geen automatische productiedeploy. Het template slaagt voor
`cfn-lint deploy/aws/fargate.json`; een echte AWS-uitrol, TLS/DNS-configuratie,
IAM-controle en rooktest op de AWS-URL staan nog open. Docker en AWS CLI waren
hier lokaal niet beschikbaar; containeruitvoering moet door CI worden
bevestigd. Zie [acceptatiestatus](issue-readiness.md).
