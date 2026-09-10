# LinkedIn — Open Calc Studio v0.11.0 (español)

**Screenshots**: `docs/screenshots/es/` — gebruik `2-presupuesto.png` als
hoofdbeeld (Spaanse interface met een echte .bc3-begroting) en eventueel
`4-idiomas.png` (de taalinstelling met 39 talen).

**Privacy**: versie A noemt Rubén bij naam. Vraag hem eerst toestemming —
hij schreef via het contactformulier, niet om publiek geciteerd te worden.
Versie B houdt hem anoniem.

---

## Versie A (met naam, na toestemming)

Hace unas semanas recibí un correo de Rubén M., arquitecto técnico. Había
probado Open Calc Studio, nuestro programa libre de presupuestos y
mediciones, y su mensaje era directo: la interfaz le parecía prometedora,
pero no encontraba cómo cambiar el idioma. Y añadía una petición concreta:
soporte para .bc3, el formato FIEBDC que en España usa todo el sector.

Tenía razón en las dos cosas. Así que las hemos arreglado.

**El idioma, en serio**
La interfaz está ahora disponible en 39 idiomas, del árabe al vietnamita,
con soporte de derecha a izquierda para árabe, farsi, hebreo y urdu. El
problema de fondo no eran unas cuantas etiquetas olvidadas: el idioma
estaba fijado internamente en neerlandés, así que la detección automática
nunca llegaba a ejecutarse. Más de 500 textos estaban además escritos
directamente en el código. Todo eso se ha corregido, y la terminología de
cada idioma sigue la que se usa de verdad en el sector: capítulo, partida,
descompuesto, rendimiento, precio de coste, presupuesto de contrata.

**FIEBDC-3 (.bc3), importación y exportación**
Capítulos, partidas con sus mediciones y descompuestos que entran como
líneas de cálculo, distinguiendo mano de obra, maquinaria y materiales. Y
también exportación a .bc3, para seguir trabajando en Presto, Arquímedes,
Menfis o TCQ.

No lo hemos dado por bueno con un fichero de prueba: lo hemos verificado
con 21 ficheros .bc3 reales, incluido el Banco de Costes de la
Construcción de Andalucía 2023 (46.215 líneas, importadas en 250 ms), y
exportaciones de Presto 7 a 25, Arquímedes, TCQ y ARPO, cubriendo las
versiones del formato de /95 a /2020 y los juegos de caracteres ANSI,
CP850 y UTF-8. Ese contraste sacó a la luz diez errores que un fichero
sintético jamás habría revelado: saltos de línea dentro de un registro,
ficheros que declaran ANSI pero escriben UTF-8, capítulos sin sufijo #,
porcentajes de costes indirectos, códigos de capítulo repetidos... De los
doce ficheros con un total verificable, ocho reproducen el importe exacto.

**Por qué importa**
Open Calc Studio es software libre (GPL). Que una herramienta abierta
hable el formato estándar del sector español significa que presupuestar
deja de depender de una licencia concreta. Los datos siguen siendo tuyos.

Gracias, Rubén, por tomarte el tiempo de escribir. Las mejores mejoras
llegan casi siempre de quien usa el programa de verdad.

Descarga y código: github.com/OpenAEC-Foundation/open-calc-studio

#Construcción #Presupuestos #FIEBDC #BC3 #OpenSource #AEC #Arquitectura
#Mediciones #BIM

---

## Versie B (anoniem) — vervang de eerste twee alinea's door:

Hace unas semanas nos escribió un arquitecto técnico español. Había
probado Open Calc Studio, nuestro programa libre de presupuestos y
mediciones, y su mensaje era directo: la interfaz le parecía prometedora,
pero no encontraba cómo cambiar el idioma. Y añadía una petición concreta:
soporte para .bc3, el formato FIEBDC que en España usa todo el sector.

Tenía razón en las dos cosas. Así que las hemos arreglado.

…en la despedida:

Gracias a quien se tomó el tiempo de escribir. Las mejores mejoras llegan
casi siempre de quien usa el programa de verdad.

---

## Kortere variant (als de post te lang is)

Un arquitecto técnico nos escribió: la interfaz de Open Calc Studio le
parecía prometedora, pero no encontraba cómo cambiar el idioma — y pedía
soporte para .bc3.

Ya está: interfaz en 39 idiomas (con derecha a izquierda para árabe,
farsi, hebreo y urdu) e importación y exportación de FIEBDC-3, verificada
con 21 ficheros reales, incluido el Banco de Costes de Andalucía 2023.
Software libre, GPL.

github.com/OpenAEC-Foundation/open-calc-studio

#Construcción #Presupuestos #FIEBDC #BC3 #OpenSource #AEC
