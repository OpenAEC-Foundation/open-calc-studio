# macOS: Open Calc Studio does not open

[User guide](user-guide.md) · [Nederlandse handleiding](gebruikershandleiding.md)

Local builds default to an ad-hoc signature. The [signed desktop workflow](desktop-builds.md) now requires a Developer ID certificate and Apple notarization credentials, and checks the delivered app before upload. That configuration alone does not prove an existing download is notarized: check the release's successful build results. Older or locally built downloads can still be blocked by Gatekeeper, as tracked in [issue #2](https://github.com/OpenAEC-Foundation/open-calc-studio/issues/2).

## Open a trusted download

1. Obtain a fresh DMG for your processor from the [project releases](https://github.com/OpenAEC-Foundation/open-calc-studio/releases), then copy Open Calc Studio to Applications.
2. Try opening it once, dismiss the message, and open System Settings → Privacy & Security.
3. If Open Anyway is offered for this app, select it and confirm. Only override the warning if you trust the downloaded copy. See [Apple's instructions](https://support.apple.com/102445).

A “damaged” message alone does not establish the cause or prove that the release is old. If a fresh trusted copy is still blocked and the normal override is unavailable, the issue reports removal of the quarantine attribute as a workaround:

```sh
xattr -dr com.apple.quarantine "/Applications/Open Calc Studio.app"
```

Adjust the path if you installed elsewhere. This removes the quarantine flag only from that app and its contents; it does not notarize the app or repair a broken binary. Do not disable Gatekeeper globally. If macOS reports detected malware or revoked authorization, do not use this workaround. If the command fails or the app still will not open, report the exact error, macOS version, processor and app version in the issue.

## Nederlands

Download eerst een nieuwe passende DMG via de releases en plaats de app in Programma's. Probeer de app te starten en ga daarna naar Systeeminstellingen → Privacy en beveiliging → Toch openen, als die optie voor deze app verschijnt. Doe dit alleen voor een vertrouwde download.

De melding “beschadigd” bewijst niet dat het om een oude release gaat. De opdracht hierboven verwijdert uitsluitend de quarantainemarkering van deze app. Het is een workaround, geen volledige oplossing voor ondertekening of notarisation. Gebruik deze niet bij een melding over aangetroffen malware of ingetrokken autorisatie. Meld blijvende problemen met de exacte foutmelding en versies.

## Remaining release work

The pipeline is configured, but issue #2 still needs a successful run with provisioned Apple credentials and a check of a fresh quarantined download on macOS. Do not put credentials in the repository. The signed workflow's Gatekeeper and stapled-ticket checks are blocking; local Linux checks cannot establish that a DMG has passed them.
