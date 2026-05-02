# create-wpcalc-template.ps1
# Creates an empty WPCalc .calc template file (Access MDB) with the correct table schemas.
# Uses SQL DDL via ADO instead of ADOX to avoid COM type mapping issues.

$OutputPath = "$PSScriptRoot\..\src-tauri\resources\wpcalc-template.calc"

# Remove existing template
if (Test-Path $OutputPath) { Remove-Item $OutputPath -Force }

# Create a new empty MDB file via ADOX Catalog
$catalog = New-Object -ComObject ADOX.Catalog
$connStr = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$OutputPath;Jet OLEDB:Engine Type=5;"
$catalog.Create($connStr)
$conn = $catalog.ActiveConnection

# Use SQL DDL to create tables

# ── dbspecs ──
$conn.Execute("CREATE TABLE dbspecs (versie LONG)")

# ── calculaties ──
$conn.Execute(@"
CREATE TABLE calculaties (
    docnr LONG NOT NULL,
    projectnr LONG,
    calculator TEXT(50),
    calculatietitel TEXT(100),
    calculatiedatum DATETIME,
    offertenr TEXT(50),
    aangemaakt DATETIME,
    geopend DATETIME,
    gewijzigd DATETIME,
    naam MEMO,
    tav TEXT(50),
    adres TEXT(50),
    woonplaats TEXT(75),
    onderwerp MEMO,
    notitie MEMO,
    voorlooptekst MEMO,
    nalooptekst MEMO,
    bijlages MEMO,
    layoutfile MEMO,
    kostprijs DOUBLE,
    totaalmateriaal DOUBLE,
    totaalmaterieel DOUBLE,
    totaalloon DOUBLE,
    totaalonderaanneming DOUBLE,
    totaalvast DOUBLE,
    totaalstelposten DOUBLE,
    totaaluren DOUBLE,
    totaalexclbtw DOUBLE,
    totaalinclbtw DOUBLE,
    btw DOUBLE,
    btwhoog DOUBLE,
    btwlaag DOUBLE,
    btwgeen DOUBLE,
    btwcode LONG,
    btwmethode LONG,
    m2 DOUBLE,
    m3 DOUBLE,
    [readonly] BIT,
    docstatus SHORT,
    docstatusoverride TEXT(100),
    docstyle SHORT,
    docstyleoverride TEXT(100),
    calculatiestyle SHORT,
    refaantal BIT,
    percentage DOUBLE,
    nettoplus DOUBLE,
    brutomin DOUBLE,
    indeling SHORT,
    maxhfdst SHORT,
    loonkolommen BIT,
    oakolom BIT,
    adminkolom BIT,
    minkolom BIT,
    wfa DOUBLE,
    wfm DOUBLE,
    wfmta DOUBLE,
    wfmte DOUBLE,
    wfoda DOUBLE,
    wfstp DOUBLE,
    wfarb DOUBLE,
    valuta TEXT(2),
    koers DOUBLE,
    taal TEXT(5)
)
"@)

# ── data ──
$conn.Execute(@"
CREATE TABLE data (
    recnr LONG NOT NULL,
    docnr LONG NOT NULL,
    afdeling SHORT,
    groep SHORT,
    paragraaf SHORT,
    volgnr SHORT,
    tabs SHORT,
    rectype SHORT,
    recref TEXT(20),
    aktnr TEXT(20),
    artikelnr TEXT(50),
    elementnr TEXT(50),
    omschrijving MEMO,
    eenheid TEXT(10),
    aantal DOUBLE,
    prijs DOUBLE,
    kosteneh DOUBLE,
    minuten DOUBLE,
    norm DOUBLE,
    verbruik DOUBLE,
    tariefgroep TEXT(2),
    tarief DOUBLE,
    onderaanneming BIT,
    materieel BIT,
    stelpost BIT,
    vastbedrag BIT,
    rekenstring MEMO,
    code TEXT(50),
    postsoort TEXT(1)
)
"@)

# ── staart ──
$conn.Execute(@"
CREATE TABLE staart (
    recnr LONG NOT NULL,
    docnr LONG NOT NULL,
    volgnr SHORT,
    itemtype SHORT,
    itemstyle SHORT,
    aantal DOUBLE,
    ehprijs DOUBLE,
    omschrijving TEXT(200),
    percentage DOUBLE,
    loon DOUBLE,
    materiaal DOUBLE,
    materieel DOUBLE,
    stelpost DOUBLE,
    onderaanneming DOUBLE,
    bedrag DOUBLE,
    subtotaal DOUBLE,
    totaal DOUBLE,
    memotekst MEMO,
    stuurcode TEXT(20),
    code TEXT(100),
    markeer TEXT(50),
    markeringen MEMO,
    fontstyle SHORT
)
"@)

# ── tarieven ──
$conn.Execute(@"
CREATE TABLE tarieven (
    docnr LONG NOT NULL,
    asciinr LONG NOT NULL,
    tariefgroep TEXT(2),
    tarief DOUBLE,
    uurtarief BIT,
    omschrijving TEXT(100),
    memotekst MEMO,
    netto DOUBLE,
    toeslag DOUBLE,
    indirect BIT
)
"@)

# ── teksten ──
$conn.Execute(@"
CREATE TABLE teksten (
    recnr LONG NOT NULL,
    docnr LONG NOT NULL,
    txtref TEXT(20) NOT NULL,
    titel TEXT(80),
    bloktekst MEMO,
    filename MEMO
)
"@)

# ── uren ──
$conn.Execute(@"
CREATE TABLE uren (
    recnr LONG NOT NULL,
    docnr LONG NOT NULL,
    volgnr SHORT,
    omschrijving TEXT(80),
    tariefgroep TEXT(2),
    aantal DOUBLE,
    tarief DOUBLE,
    bedrag DOUBLE,
    memotekst MEMO,
    markeer TEXT(50),
    fontstyle SHORT
)
"@)

# ── uittrekstaten ──
$conn.Execute(@"
CREATE TABLE uittrekstaten (
    recnr LONG NOT NULL,
    docnr LONG NOT NULL,
    datarecnr LONG,
    volgnr SHORT,
    omschrijving TEXT(200),
    aantal DOUBLE,
    eenheid TEXT(10)
)
"@)

# Insert dbspecs version row
$conn.Execute("INSERT INTO dbspecs (versie) VALUES (29)")

# Close
$conn.Close()

Write-Host "Template created at: $OutputPath"
Write-Host "File size: $((Get-Item $OutputPath).Length) bytes"
