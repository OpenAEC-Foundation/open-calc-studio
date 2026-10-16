# Mobiele webapp

Open Calc Studio heeft een compacte weergave voor smalle schermen en telefoons in liggende stand. Open dezelfde webapp op een Android-telefoon of iPhone. De mobiele weergave gebruikt hetzelfde `.ifcCalc`-projectformaat en dezelfde berekeningen als de desktopapp.

## Begroting bewerken

1. Tik op **Openen** om een bestaand `.ifcCalc`-bestand van je telefoon te kiezen, of op **Nieuw** voor een lege begroting.
2. Gebruik **Toevoegen** voor een hoofdstuk, begrotingspost of rekenregel. Tik op een kaart om omschrijving, code, hoeveelheid, eenheid, prijs en notities te wijzigen. Bij een rekenregel kun je ook de productienorm invoeren.
3. Gebruik **Bladen** om een deelblad te maken en cellen of formules te wijzigen. Met **Prompt** open je Prompt & Begroot.
4. Tik op **Opslaan**. De browser downloadt een nieuw `.ifcCalc`-bestand; de webapp overschrijft het oorspronkelijke bestand op je telefoon niet rechtstreeks. Bewaar of deel dit bestand via de bestandsapp van je telefoon.

De laatste actieve begroting wordt bovendien als lokaal concept in de opslag van deze browser bewaard. Bij een volgende opening op hetzelfde toestel wordt dat concept hersteld. Wis je browsergegevens, gebruik je een privévenster of loopt de browseropslag vol, dan kan dit concept verdwijnen. Gebruik **Opslaan** voor een overdraagbare kopie.

## Build en toegang op een telefoon

```bash
npm install
npm run build
```

De webbuild staat in `dist/`. Plaats die map op een HTTPS-webserver en open het adres op je telefoon. De webapp bevat een manifest en pictogrammen om haar aan het beginscherm toe te voegen. De lokale `npm run preview`-server is bedoeld om de build op dezelfde computer te controleren. Een telefoon heeft voor deze app een HTTPS-adres nodig; de app gebruikt browserfuncties die op een onbeveiligd LAN-HTTP-adres niet beschikbaar zijn.

De mobiele werkruimte richt zich op het bewerken van begrotingen, deelbladen en Prompt & Begroot. Voor uitgebreide rapportopmaak, IFC/3D en PDF-metingen gebruik je voorlopig de desktopweergave.
