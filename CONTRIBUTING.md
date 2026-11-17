# Bidra med uppgifter om ditt län

Vet du något om MeshCore i ditt län som saknas på sidan? Du kan enkelt bidra med mer information:
kanaler, grupper och platser där en repeater behövs.

Varje län har en egen fil i `data/lan/`, med länets SCB-kod som namn (`08.toml` är Kalmar län).
En pull request ändrar en fil. Vem som helst kan föreslå en ändring; sidans ansvarige godkänner.

## Det som redan finns och inte skrivs här

Länets namn och region (scope) kommer från
[meshcore-se-regioner](https://github.com/zombiefredrik/meshcore-se-regioner), grannlänen från
samma lista och länets gräns från kartdata. Testkanalen (`#test-<scope>`) och namnprefixet (som
`SE-KAL` eller `SE08`) räknas fram ur regionen. Vill du ändra regionen, gör det i
meshcore-se-regioner: sidan följer listan inom ett dygn.

## Nycklarna

| nyckel | krävs | vad |
|---|---|---|
| `scb` | ja | SCB-koden, samma som filnamnet |
| `slug` | ja | adressen, `meshcoresverige.se/<slug>/`: länets namn utan "län", med å, ä, ö och bindestreck |
| `short` | ja | kort namn i rubriker, som "Kalmar" |
| `checked` | ja | dagen någon senast kontrollerade filen, `ÅÅÅÅ-MM-DD`; visas på länets sida |
| `site` | nej | länets egen MeshCore-sida (`https://…/`). Med en egen sida visar meshcoresverige.se inga egna sidor för länet utan länkar dit |
| `iata` | nej | kartområdets kod, om den skiljer sig från mallens lista |
| `center`, `zoom` | nej | kartans start, om länets gräns ger fel utsnitt |
| `place` | nej | en välkänd plats i länet, för namnexemplet (`SE-KAL-<place>`) |
| `meshmapper` | nej | länets MeshMapper-karta |
| `text` | nej | ett eget stycke på länets sida, utan "vi" (läsaren vet inte vilka "vi" är) |
| `text_by` | med `text` | vem som skrev stycket; visas som "Skrivet av …" |
| `community` | nej | länets samlade gemenskapssida, `{ name = "…", url = "https://…" }`: en knapp bredvid "Se kartan" på länets sida, och länets enda rad i Sverige-vyns Gemenskap-kolumn |

Listor, en per post:

```toml
[[channels]]          # chattkanaler som används i länet (testkanalen räknas fram)
  name = "#kalmar"
  purpose = "Länets chattkanal"

[[groups]]            # grupper och chattar för länet
  name = "Gruppens namn"
  url  = "https://…"

[[wanted]]            # platser där en repeater skulle göra störst skillnad
  name = "Platsens namn"
  lat  = 57.1
  lon  = 16.2
  note = "varför platsen behövs"
```

## Kontroll

`npm test` kontrollerar filerna: okända nycklar, fel SCB-kod, en adress som redan används och
positioner utanför Sverige stoppas. Samma kontroll körs på varje pull request.
