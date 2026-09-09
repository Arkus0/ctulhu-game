# Qué falta para que la noche de la mascarada sea un videojuego

La agenda del día 1 está completa y ya es jugable de punta a punta: `events/day1.json`
tiene 68 sucesos entre las 09:00 y las 07:00 del día siguiente, y desde el commit
«la noche de la mascarada deja de ser invisible» el jugador puede recorrerlos —el
muro de las 13:00 ha caído, el salón de baile está en el mapa y el epílogo lee dónde
amanece el Disco Solar.

Lo que queda no es agenda: es **densidad**. Este documento inventaría los huecos
medidos y termina cada apartado con un prompt copiable.

## Dos reglas que no se negocian

**1. El arte se dibuja, no se genera de fondo.** `src/ui/art.ts` cae a un tramado
EGA procedural cuando falta un PNG. Eso es una red de seguridad para poder jugar
durante el desarrollo, **no una entrega**. Ninguna tarea de este documento se da por
cerrada apoyándose en el procedural, ni compartiendo lámina entre salas que el
jugador visita por motivos distintos.

**2. Ninguna media hora sin nada que hacer.** La medición está más abajo: entre las
13:00 y el amanecer no hay una sola escena de decisión, y el salón de baile ofrece
**una interacción para nueve horas de fiesta**. Cuando un tramo se quede corto hay
que rellenarlo con sucesos, detalles de sala, diálogo o pistas nuevas. El módulo da
material de sobra; donde no llegue, se inventa dentro de su tono y se documenta.

## Lo que mide la auditoría

| | Mañana 09:00–13:00 | Tarde y noche 13:00–07:00 |
| --- | --- | --- |
| Sucesos | 18 | 50 |
| Escenas de decisión | 7 | **0** |
| Sucesos con lámina propia | 3 | **0** |
| Franjas de 30 min sin ningún suceso | 0 | 0 |

Y en el conjunto del hotel:

- **40 detalles de sala repartidos entre 40 salas.** El salón de baile tiene **uno**
  (`control_de_invitados`), y se consume al primer uso. `pasillo_habitaciones`, donde
  los esbirros de Selassie saquean durante siete horas, tiene **cero**. `hab_fuad`,
  donde se escribe el telegrama a Shakti, tiene **cero**.
- **14 habitaciones comparten `habitacion.png`.** La 407 de Weder, la 204 de los
  Lounpeen, la suite real y los aposentos de Selassie son la misma imagen.
- **9 retratos dibujados de 30 declarados** en `npcs.json`. De la noche faltan
  najir, fuad, selassie, aga_khan, ibrahim, belanger, murray, bulatovic, thornhill
  y rolland.
- **Fuad, Selassie y el Aga Khan no tienen ni un tema de diálogo.** Aparecen en 22
  sucesos entre los tres y no se les puede dirigir la palabra. Los catorce PNJ que sí
  tienen diálogo rondan 13–18 temas cada uno: esa es la vara de medir.
- **22 hechos huérfanos**: se aprenden por la noche y ningún tema, detalle ni
  conversación los menciona, así que no sirven para nada.
- **`interruptibleBy` sigue siendo un no-op**: los siete sucesos con escena declaran
  el mismo conjunto que su escena, así que el filtro nunca quita nada.

## Orden recomendado

1. Escenas de decisión de la tarde y la noche · 2. Densidad de sala · 3. Diálogos
de Fuad, Selassie y el Aga Khan · 4. Arte completo · 5. Diario y rastros en pantalla
· 6. Deuda menor.

Los apartados 1 y 2 son los que convierten la noche en juego. El 4 es el que la
convierte en producto.

---

## 1. Escenas de decisión para la tarde y la noche

Cero de los 50 sucesos posteriores a las 13:00 declaran `scene`. Todo lo que ocurre
—la venta del Disco, la cólera de Carter, la bronca del templo, el pacto con Fuad, el
telegrama, el encierro de Najir— el jugador lo **mira**. En la mañana decide siete
veces; en las dieciocho horas siguientes, ninguna.

Ocho escenas, en orden de valor:

| Escena | Suceso ancla | Hora | La decisión |
| --- | --- | --- | --- |
| La venta de la 407 | `d1_weder_vende_el_disco` | 16:00 | Interrumpir la venta, dejar que ocurra y seguir al comprador, o robar el disco en el momento de la descarga eléctrica |
| El saco que gotea | `d1_carter_sale_con_el_saco` | 16:00 | Seguirle, adelantarse por la ruta de servicio, o registrar la 362 mientras está vacía |
| La cólera de Carter | `d1_carter_descubre_el_robo` | 17:20 | Dejarse ver y ofrecerle ayuda, esconderse y escuchar a quién acusa, o usar su furia contra Weder |
| La bronca del templo | `d1_bronca_en_el_templo` | 18:40 | El módulo pide una tirada de Crédito por investigador para rebajar su furia un 10% cada éxito: eso es la escena |
| El control de invitados | `d1_mascarada_empieza` | 21:00 | Crédito en la puerta, la ruta de servicio por las cocinas, o entrar detrás del séquito de alguien |
| Los leones sueltos | `d1_rugidos_y_punetazos` | 22:00 | Proteger a alguien, aprovechar el caos para subir a las habitaciones, o sacar a Dieter del frigorífico |
| El telegrama | `d1_telegrama_a_correos` | 00:35 | Distraer a Thornhill, sobornarla, o esperar al cambio de turno |
| La puerta del corredor | `d1_najir_encerrado` | 01:00 | Reventar el pasador, buscar la llave en la cocina, o dejarle ahí |

Las tres últimas ya tienen media escena construida en forma de detalle de sala
(`control_de_invitados`, `telegrama_para_shakti`, `puerta_del_corredor`): la escena
debe **envolverlas**, no duplicarlas.

```text
Trabaja en el proyecto local «El Disco Egipcio» (juego ctulhu). Objetivo: escribir las
escenas de decisión que faltan entre las 13:00 del día 1 y el amanecer del día 2. Hoy
hay siete escenas y todas viven antes de las 12:30; los cincuenta sucesos de la tarde
y la noche son puramente presenciales y el jugador no decide nada en dieciocho horas.

Antes de tocar nada, lee completos:
- docs/DIRECCION-DE-DISENO.md
- docs/REFERENCIAS-LOCALES.md
- progress.md
- docs/NOCHE-DE-LA-MASCARADA.md (este documento)
Y comprueba que existe el PDF local pdfcoffee.com_la-broma-macabra-5-pdf-free.pdf.
Si no está, dilo en la entrega y no afirmes que has contrastado nada con el módulo.
Desfase de paginación: página PDF = página impresa + 4. La tarde y la noche del día 1
son las páginas impresas 54 a 60 (PDF 58 a 64). Extrae con
  pdftotext -layout -f 58 -l 64 "<pdf>" -
La capa de texto tiene glitches conocidos ("%" sale como "i" o "^!", "POD" como
"PCD", "1D6" como "106"), pero es legible. Si una frase parece corrupta más allá de
eso, dilo en vez de reconstruirla a ciegas.

Escribe OCHO escenas nuevas en src/content/scenes.json y engánchalas a su suceso en
src/content/events/day1.json mediante `scene` e `interruptibleBy`:

  d1_weder_vende_el_disco (16:00)   · d1_carter_sale_con_el_saco (16:00)
  d1_carter_descubre_el_robo (17:20) · d1_bronca_en_el_templo (18:40)
  d1_mascarada_empieza (21:00)      · d1_rugidos_y_punetazos (22:00)
  d1_telegrama_a_correos (00:35)    · d1_najir_encerrado (01:00)

CONTRATO DE UNA ESCENA (lo valida validate() en src/content/index.ts y lo comprueba
test/demo-polish.test.ts, así que no es opcional):
- id, art, title, objective, body, actions.
- objective: una línea, MÁXIMO 90 CARACTERES. Es una barra encima de la lámina.
- Entre DOS Y CUATRO acciones. Cada una: id, kind (act|talk|listen|inspect), label,
  hint, minutes, consequence; skill + difficulty si hay tirada; risk si el fallo
  cuesta algo.
- Toda acción necesita una consequence que SOBREVIVA a la escena: una bandera, un
  hecho, un cambio de custodia o de disposición. Una acción cuyo único efecto es
  texto no entra.
- La forma exacta de SceneDef está en src/engine/adventure.ts. Léela antes de escribir.

REGLAS DE DISEÑO:
- No inventes sucesos que contradigan la cronología del módulo. Las escenas ramifican
  lo que ya pasa; no cambian a qué hora pasa.
- La cadena de custodia del Disco Solar es sagrada: weder -> dieter -> (esbirros de
  Selassie, 20%). Si una acción se la lleva, tiene que hacerlo con moveCustody a
  'player', y los eslabones posteriores ya se descartan solos por sus requires.
- Tres escenas deben ENVOLVER un detalle de sala que ya existe y funciona, no
  duplicarlo: control_de_invitados (salon_baile), telegrama_para_shakti (correos) y
  puerta_del_corredor (sala_escombros). Léelos en src/content/locations.json y
  reutiliza sus textos de éxito y de fallo.
- La bronca del templo tiene una regla explícita en el módulo (impresa 54): cada
  investigador puede tirar Crédito y cada éxito rebaja la furia de Carter un 10%. Eso
  es exactamente la escena; escríbela así.
- interruptibleBy tiene que ser un SUBCONJUNTO PROPIO de las acciones de la escena en
  al menos la mitad de los casos: hoy los siete sucesos declaran el conjunto entero y
  el filtro no quita nada nunca. Usa el estado del mundo para que la lista de opciones
  dependa de lo que el grupo haya hecho antes.
- Voz: castellano peninsular, presente, frases cortas, humor negro seco. Lee el
  witnessText de los sucesos vecinos y escribe en ese mismo registro. Nada de
  florituras ni de adjetivos apilados.

ARTE: cada escena declara un art. Si la lámina no existe todavía, decláralo y anótalo
en la entrega para el apartado 4 de este documento; NO te apoyes en que src/ui/art.ts
dibuje un fondo procedural, y NO reutilices la lámina de otra escena para salir del
paso.

ENTREGA:
- npm test en verde (283 pruebas antes de empezar; añade las tuyas).
- npm run build limpio.
- Pruebas nuevas: cada escena se abre estando en su sala a su hora, y cada acción deja
  el rastro persistente que promete su consequence.
- Anota el pase en progress.md con el estilo del fichero.
- No añadas a Git el PDF, páginas extraídas ni nada derivado de él.
```

---

## 2. Densidad: que el hotel responda a todas horas

Es el hueco que más se nota jugando. Medido colocando al grupo en cada sala en cada
franja de 30 minutos y contando las acciones propias (descontando esperar, observar y
«hablar con alguien»):

- **`salon_baile`: 13 sucesos, 1 detalle.** Se entra a la mascarada, se falla o se
  supera el control, y a partir de ahí el salón no ofrece nada durante nueve horas,
  con doscientos invitados, cincuenta músicos, monos colgando de la lámpara y dos
  leones sueltos.
- **`pasillo_habitaciones`: 4 sucesos, 0 detalles.** Los esbirros saquean de 23:00 a
  06:00 y no hay forma de cruzarse con ellos, seguirlos ni sorprenderlos.
- **`hab_fuad`: 2 sucesos, 0 detalles.** El telegrama se escribe ahí, y el rastro del
  bloc calcado a contraluz existe como *trace*, no como algo que se pueda examinar.
- **`tienda_moda_mujer`: 1 suceso, 0 detalles**, y las otras cinco tiendas tampoco
  tienen nada dentro pese a estar en el mapa.

```text
Trabaja en el proyecto local «El Disco Egipcio» (juego ctulhu). Objetivo: que ninguna
media hora de la partida deje al jugador sin nada que hacer. Hoy el salón de baile
tiene UN detalle para las nueve horas que dura la mascarada, el pasillo de las
habitaciones tiene CERO mientras los esbirros de Selassie lo saquean durante siete, y
seis tiendas del hotel están en el mapa sin una sola cosa dentro.

Lee antes: docs/DIRECCION-DE-DISENO.md, docs/REFERENCIAS-LOCALES.md, progress.md y
docs/NOCHE-DE-LA-MASCARADA.md. Comprueba que existe el PDF local; desfase: página PDF
= impresa + 4. El capítulo 3 (el hotel sala por sala) son las impresas 96 a 104
(PDF 100 a 108) y la noche del día 1 las impresas 54 a 60 (PDF 58 a 64). Extrae con
  pdftotext -layout -f <inicio> -l <fin> "<pdf>" -

TRABAJO:

A) DETALLES DE SALA. Sube src/content/locations.json de 40 detalles a un mínimo de 90,
   con este reparto mínimo:
   - salon_baile: 10 detalles, y al menos seis vivos DURANTE la fiesta (con requires
     sobre mascarada_en_marcha). El módulo describe la sala en la impresa 55: cinco mil
     velas en candelabros de cobre con serpientes vivas, loros y papagayos colgando de
     los brazos; lianas desde la lámpara central con monos rojos, macacos, gibones,
     monos araña, capuchinos y babuinos; dos leones encadenados junto a la mesa real;
     cordero asado en mesas supletorias; escenario para cincuenta músicos; camareros
     nubios con jambias del Yemen. Todo eso es examinable y ninguno está escrito.
   - pasillo_habitaciones: 8 detalles, la mitad activos con habitaciones_saqueadas o
     esbirros_por_los_pasillos. Tiene que poderse pillar a un esbirro.
   - hab_fuad: 4, incluido el bloc de papel calcado a contraluz (hoy solo existe como
     rastro del suceso d1_fuad_escribe_el_telegrama, y merece ser examinable).
   - Las seis tiendas: 3 detalles cada una como mínimo. Le Petit France es la de
     Juliette Belanger, donde Olga se prueba el disfraz a las 19:30.
   - Ninguna sala del mapa se queda por debajo de 3.

B) SUCESOS DE RELLENO donde el reloj se afloja. Dos tramos lo piden:
   - 19:50 a 21:00, entre la pelea del templo y el arranque de la mascarada.
   - 02:30 a 05:30, cuando la fiesta se descompone y solo queda vivo el saqueo.
   Escribe entre 6 y 10 sucesos cortos en src/content/events/day1.json para esos
   tramos: invitados llegando disfrazados, el trasiego de los camareros, un esbirro
   forzando una cerradura, la orquesta cayéndose de sueño, alguien vomitando en una
   maceta de palmera, Gasparini bebiendo por fin. Mismo esquema que los existentes
   (id, at, until, location, actors, priority, witnessText, effects, traces, tags,
   note). No contradigan la cronología del módulo: son textura entre los hitos, no
   hitos nuevos.

C) PISTAS. leads() en src/engine/game.ts tiene seis pistas de mañana y seis de noche.
   Si un tramo se queda sin ninguna activa, el objetivo de la barra cae en el texto
   genérico «Buscar una nueva vía...». Añade las que hagan falta para que siempre haya
   al menos una pista activa entre las 09:00 y las 06:00, enganchadas a banderas y
   hechos que el contenido ya escriba.

CONTRATOS:
- LocationFeature está en src/engine/types.ts: id, name, description, y opcionalmente
  requires, check (skill + difficulty), onSuccess, onFailure, successText,
  failureText, minutes.
- Una tirada de detalle SOLO puede pedir una habilidad que algún investigador tenga en
  su ficha (src/content/investigators.json). La validación lo rechaza si no.
- Un detalle con tirada necesita las dos ramas escritas, éxito y fallo, y el fallo
  tiene que costar algo de verdad.
- Voz: la del proyecto. Lee media docena de detalles existentes antes de escribir.

COMPROBACIÓN OBLIGATORIA: escribe una prueba que recorra cada franja de 30 minutos
entre las 09:00 y las 07:00, coloque al grupo en cada sala del mapa y falle si alguna
franja se queda sin acciones propias (descontando esperar y observar). Esa prueba es
la definición operativa de «no hay huecos» y tiene que quedar en el repositorio.

ENTREGA: npm test en verde, npm run build limpio, progress.md anotado. Nada derivado
del PDF entra en Git.
```

---

## 3. Fuad, Selassie y el Aga Khan no tienen voz

Tres de los personajes más importantes de la noche aparecen en 22 sucesos entre los
tres y no se les puede dirigir la palabra: no existe `src/content/dialogue/fuad.json`,
ni `selassie.json`, ni `aga_khan.json`. También faltan `ibrahim`, `belanger`, `murray`
y `bulatovic`, que son menores pero salen en escena y hablan en los rastros.

Fichas en el módulo, ya localizadas:

| PNJ | Página impresa | PDF | Notas |
| --- | --- | --- | --- |
| Príncipe Fuad | 20 | 24 | Ficha completa con «Datos y pistas» y ganchos |
| Abebaberk Selassie | 28 | 32 | Ficha completa; una viñeta de «Datos y pistas» está corrupta en la capa de texto |
| Aga Khan (Mahomed Sha III) | 136 | 140 | Personaje secundario, entrada 11; ficha abreviada |
| Ibrahim ben Alí | 132 | 136 | Secretario del Aga Khan |

El Aga Khan trae su gancho ya escrito en el libro: le molesta que le hablen de
problemas, agradece que le hagan reír, y hablar con cualquiera en su compañía da un
dado de bonificación al Crédito.

```text
Trabaja en el proyecto local «El Disco Egipcio» (juego ctulhu). Objetivo: dar voz a los
PNJ de la noche que hoy aparecen en escena y no se pueden interrogar. Faltan por
completo los ficheros de diálogo del Príncipe Fuad, de Abebaberk Selassie y del Aga
Khan, y también los de Ibrahim ben Alí, Juliette Belanger, Murray y Bulatovic.

Lee antes: docs/DIRECCION-DE-DISENO.md, docs/REFERENCIAS-LOCALES.md, progress.md y
docs/NOCHE-DE-LA-MASCARADA.md. Comprueba que existe el PDF local. Desfase: página PDF
= impresa + 4. Fichas: Fuad impresa 20 (PDF 24), Selassie impresa 28 (PDF 32), Aga
Khan impresa 136 (PDF 140, entrada 11 de personajes secundarios), Ibrahim impresa 132
(PDF 136). Extrae con  pdftotext -layout -f <n> -l <n> "<pdf>" -
OJO: un gancho de interpretación sobre X vive a veces en la ficha de OTRO personaje.
Antes de dar un dato por inexistente, revisa las fichas de los PNJ que se mencionan en
su texto.

TRABAJO: un fichero por PNJ en src/content/dialogue/<id>.json, e impórtalos en
src/content/index.ts (hay una lista explícita de imports; añádelos ahí o no se cargan).
Volumen mínimo:
- fuad: 15 temas · selassie: 15 · aga_khan: 12
- ibrahim, belanger, murray, bulatovic: 8 cada uno
Los catorce PNJ que ya tienen diálogo rondan 13-18 temas: esa es la referencia.

CONTRATO DE UN TEMA (DialogueTopic, en src/engine/dialogue.ts; lo valida validate() en
src/content/index.ts):
- id, npc, label, y al menos una respuesta.
- Si el tema lleva check, necesita rama de ÉXITO (onSuccess/onHard/onExtreme/
  onCritical) y rama de FALLO (onFailure/onFumble). Las dos, o la validación falla.
- approaches solo admite las aproximaciones declaradas en APPROACHES.
- Todo unlocks tiene que apuntar a un id de tema existente.
- Los requires de tipo knows deben apuntar a hechos que el juego ENSEÑE de verdad.
  Comprueba en src/content/events/day1.json que el hecho se aprende en algún sitio.

ENGANCHA CON LA NOCHE. Estos 22 hechos se aprenden ya y hoy no los usa nadie:
conviértelos en temas de conversación.
  carter_alimenta_a_las_criaturas · disco_robado · esbirros_robaron_el_disco
  fuad_sabe_de_las_piezas · fuad_de_mal_humor · fuad_y_aga_khan_en_la_misma_sala
  najir_encerrado_abajo · najir_espera_fuera · olga_y_selassie · olga_sube_con_selassie
  habitaciones_desvalijadas · esbirros_por_los_pasillos · carros_a_la_suite_real
  carter_y_dieter_a_punetazos · carter_y_mahadni_se_conocen · carter_baja_con_el_saco
  carter_sabe_que_falta_el_disco · najir_avisa_a_dieter · olga_bebe_sola
  olga_y_belanger_son_amigas · mascarada_esta_noche · fuad_sale_de_los_sotanos

GANCHOS DE INTERPRETACIÓN (NpcHook en src/engine/types.ts). npcs.json ya tiene ficha
para los siete; añade o revisa sus hooks. Dos que el libro da explícitamente:
- Fuad: es Rey desde el 15 de marzo. Llamarle «Príncipe» o «Alteza» en vez de
  «Majestad» puede acabar en arresto. Y la bandera fuad_enojado (40% por el traje de
  faraón del Aga Khan) tiene que penalizar las tiradas sociales con él: hoy la escribe
  el suceso d1_fuad_se_enoja y no la lee nadie.
- Aga Khan: le molesta que le hablen de problemas y agradece que le hagan reír; hablar
  con cualquiera en su compañía da un dado de bonificación al Crédito.
La validación RECHAZA un gancho cuyo approach no sea una aproximación conocida ni una
etiqueta de alguno de sus propios temas: un gancho que no puede saltar nunca es
contenido muerto y el proyecto no lo admite.

VOZ: cada uno la suya y bien distinta. Fuad no pide, ordena, y se aburre. Selassie
disfruta del escándalo y habla como quien sabe que nadie va a echarle. El Aga Khan es
cortés, rico hasta lo abstracto y alérgico a los problemas ajenos. Castellano
peninsular, presente, frases cortas, humor negro seco.

ENTREGA: npm test en verde (test/_diag.test.ts comprueba que ninguna rama cae en el
texto genérico de reserva: tiene que seguir dando cero), npm run build limpio,
progress.md anotado. Nada derivado del PDF entra en Git.
```

---

## 4. Arte completo

No falta ningún fondo: los 22 PNG de localización existen. Lo que falta es que dejen
de repetirse y que la noche tenga imagen propia.

- **14 salas comparten `habitacion.png`**: hab_investigadores, hab_carter (362),
  hab_weder (407), hab_lounpeen (204), hab_fuad (suite real 415), hab_carnarvon,
  hab_shakti, hab_gasparini, hab_najir (487), hab_aga_khan (387), hab_selassie,
  habs_bohr y las dos de la fiesta. El jugador entra en la 407 a robar un artefacto de
  tres mil años y ve la misma imagen que en su propio cuarto.
- **Cero láminas de escena para la tarde y la noche.** Las siete que hay son de la
  mañana. Las ocho escenas del apartado 1 necesitan la suya.
- **9 retratos de 30 declarados.** Faltan los diez de la noche.
- **`salon_baile.png` es una sola imagen** para una sala que pasa de estar vacía y
  montada (18:00) a tener doscientas personas, monos y leones sueltos (22:00).
  `LocationDef.variants` admite `art` por variante, y el salón ya declara tres
  variantes de texto sin lámina propia.

Especificaciones exactas en `docs/ART-BIBLE.md`: 320×152 los fondos y las escenas,
72×96 los retratos, dieciséis tintas EGA y ninguna más, píxel cuadrado, sin suavizado,
sin canal alfa, por debajo de 40 KB.

```text
Trabaja en el proyecto local «El Disco Egipcio» (juego ctulhu). Objetivo: cerrar el
paquete de arte para que el juego no dependa nunca del fondo procedural ni de repetir
la misma lámina en salas distintas.

Lee antes y respeta al pie de la letra: docs/ART-BIBLE.md (formato, paleta y método),
docs/PROMPT-ARTE-ORIGINAL.md, docs/DIRECCION-DE-DISENO.md, docs/REFERENCIAS-LOCALES.md
y LICENSE-ART.md. Comprueba que existen el PDF local y art/raw/.

REGLA QUE MANDA SOBRE TODO LO DEMÁS: src/ui/art.ts dibuja un tramado EGA procedural
cuando falta un PNG. Es una red de desarrollo, NO una entrega. Ninguna tarea de aquí se
cierra dejando una sala, un retrato o una escena en procedural. Tampoco se cierra
compartiendo lámina entre dos salas que el jugador visita por motivos distintos.

Y la otra: ninguna lámina calca, recorta ni reencuadra el PDF del módulo. El PDF sirve
para verificar arquitectura, vestuario, tono y época. Todo lo que se dibuje es
original, y su procedencia y licencia se documentan en LICENSE-ART.md.

TRABAJO:

A) HABITACIONES. Hoy CATORCE salas comparten public/art/habitacion.png. Dibuja lámina
   propia, como mínimo, para las ocho que el jugador pisa por un motivo:
   - hab_weder (407): la caja fuerte junto al escritorio, la quemadura redonda del
     tamaño de un plato en la alfombra.
   - hab_lounpeen (204): dos camas, el colchón de la izquierda descentrado sobre el
     somier.
   - hab_fuad (suite real 415): el escritorio con el bloc de papel con membrete.
   - hab_carter (362): y el hedor que se le supone.
   - hab_najir (487): cuatro maletas abiertas y vacías en fila contra la pared, y un
     tarro grande de crema para quemaduras casi terminado.
   - hab_aga_khan (387), hab_selassie, hab_investigadores.
   Las descripciones de cada sala están en src/content/locations.json y son la
   referencia literal: dibuja lo que dicen.

B) LAS OCHO ESCENAS DE LA NOCHE (apartado 1 de docs/NOCHE-DE-LA-MASCARADA.md): la
   venta de la 407, el saco que gotea, la cólera de Carter, la bronca del templo, el
   control de invitados, los leones sueltos, el telegrama y la puerta del corredor.
   Nómbralas escena_<algo>, como las siete existentes.

C) RETRATOS QUE FALTAN, 72×96: najir (media cara quemada, brillante y tirante, que le
   tira del ojo hacia abajo), fuad, selassie, aga_khan, ibrahim, belanger, murray,
   bulatovic, thornhill y rolland. Las páginas de sus fichas están en el apartado 3 de
   este documento.

D) EL SALÓN DE BAILE EN DOS ESTADOS. salon_baile ya declara tres variants de texto y
   todas usan la misma imagen. LocationDef.variants admite art por variante: dibuja el
   salón montado y vacío (cinco mil velas sin encender, jaulas tapadas con paños, dos
   argollas de hierro atornilladas al suelo) y el salón en plena mascarada.

COMPROBACIÓN: npm run art:check y npm run art:contact tienen que pasar. Escribe además
una prueba que falle si alguna sala del mapa, alguna escena o algún PNJ con diálogo se
queda sin PNG propio: es la garantía de que el procedural no vuelve a tapar un hueco.

ENTREGA: los PNG en public/art/, LICENSE-ART.md actualizado con procedencia y licencia
de cada pieza nueva, progress.md anotado. No añadas a Git el PDF, páginas extraídas ni
ilustraciones derivadas de él.
```

---

## 5. El diario y los rastros están construidos y no llegan a pantalla

`unlockJournal` acumula 18 entradas —15 solo en la tarde y la noche— y `src/main.ts`
no menciona el diario en ninguna línea: los identificadores se apilan en un array que
nadie pinta. Con los rastros pasa lo mismo: hay 73 declarados, `view().traces` los
calcula y no se muestran. Una partida completa termina con 58 rastros pendientes que
el jugador nunca ha visto. `progress.md` ya lo tiene anotado como riesgo abierto.

```text
Trabaja en el proyecto local «El Disco Egipcio» (juego ctulhu). Objetivo: sacar a
pantalla dos sistemas que están construidos y no se ven.

Lee antes: docs/DIRECCION-DE-DISENO.md, progress.md, docs/NOCHE-DE-LA-MASCARADA.md, y
src/main.ts entero, para trabajar con el estilo de interfaz que ya existe (paneles,
openPanel, showCase, showMap, showTeam).

1. EL DIARIO. WorldState.journal es una lista de identificadores; view().journal ya la
   expone y nadie la pinta. Hacen falta tres cosas:
   - Un texto por entrada. Hoy solo existe el id. Decide dónde viven (un
     src/content/journal.json nuevo es lo más coherente con el resto del contenido) y
     escríbelos: son 18 entradas y sus ids están en los unlockJournal de
     src/content/events/day1.json y de src/content/locations.json.
   - Un panel que las muestre, en el mismo patrón que el Cuaderno del caso, ordenadas
     por el momento en que se desbloquearon.
   - Validación cruzada: un unlockJournal que apunte a una entrada sin texto tiene que
     hacer fallar validate() en src/content/index.ts. Hoy no se comprueba, y por eso
     nadie se dio cuenta de que el diario no existía.

2. LOS RASTROS. Un rastro es lo que queda de un suceso que el grupo NO presenció: el
   reguero en la alfombra, la caja abierta, la colilla contra la pared. Hay 73
   escritos, con textos excelentes, y una partida entera termina sin enseñar ninguno.
   view().traces ya filtra los del sitio donde está el grupo. Sácalos: como detalle
   examinable de la sala, o como línea de narración al entrar. Decide leyendo la
   dirección de diseño y explica la decisión en progress.md.
   Los que llevan teller los cuenta un PNJ concreto y solo valen si ese PNJ está
   delante: respétalo.

ENTREGA: npm test en verde con pruebas nuevas para las dos cosas, npm run build
limpio, progress.md anotado, y una comprobación en navegador de que una partida hasta
el amanecer termina con el diario lleno y con rastros vistos.
```

---

## 6. Deuda menor, ya localizada

**`interruptibleBy` es un no-op.** Los siete sucesos con escena declaran exactamente
el mismo conjunto de acciones que su escena, así que el filtro de `currentScene()`
nunca quita nada. Es la palanca más barata que hay para dar variedad. Ya está anotado
en `progress.md`.

**`restricted: true` no lo lee nadie.** Ocho habitaciones lo declaran en
`locations.json` y el motor lo ignora.

**La música del salón de baile es la del vestíbulo.** `musicZoneFor()` en
`src/ui/music.ts` decide por planta, `salon_baile` tiene `floor: "baja"` y cae en la
zona `hall`. La mascarada entera —trece sucesos, nueve horas, cincuenta músicos de
jazz tocando un dixie desquiciado— suena a recepción de hotel.

```text
Trabaja en el proyecto local «El Disco Egipcio» (juego ctulhu). Tres deudas pequeñas y
localizadas. Lee antes docs/DIRECCION-DE-DISENO.md, docs/DIRECCION-DE-AUDIO.md,
progress.md y docs/NOCHE-DE-LA-MASCARADA.md.

1. interruptibleBy no filtra nada. En src/content/events/day1.json los siete sucesos
   con escena declaran el mismo conjunto que su escena, así que el filtro de
   currentScene() (src/engine/game.ts) es un no-op. Haz que la lista de acciones
   dependa del estado del mundo: quién acompaña al grupo, qué sabe, qué hora es, si
   Weder está alertado. Que dos partidas distintas ofrezcan opciones distintas en la
   misma escena. Con prueba que lo demuestre.

2. restricted: true en las habitaciones de src/content/locations.json no lo lee nadie.
   Decide: o entrar en una habitación ajena pide una tirada (Cerrajería, Sigilo) o una
   llave, o el campo desaparece del esquema en src/engine/types.ts. Si lo implementas,
   ojo con no romper el acceso a la 407 y a la 204, que son dos de las salas donde la
   noche pone sus decisiones.

3. Música del salón de baile. musicZoneFor() en src/ui/music.ts decide por planta y
   salon_baile suena como el vestíbulo. Añade una zona nueva con su tema —jazz de los
   años veinte pasado por el sintetizador del juego, que suene distinto según la fiesta
   se esté montando o esté desatada— y su rama en musicZoneFor, que ya sabe distinguir
   por identificador (lo hace con las tiendas). Respeta docs/DIRECCION-DE-AUDIO.md y
   que tools/audio_check.mjs siga pasando.

ENTREGA: npm test en verde, npm run build limpio, progress.md anotado.
```

---

## Comprobación previa para cualquiera de estos prompts

El paquete de referencias locales no está en Git. Antes de afirmar que se ha
contrastado algo con el módulo hay que verificar que existen:

- `pdfcoffee.com_la-broma-macabra-5-pdf-free.pdf` (166 páginas)
- `art/raw/*.png`, `art/contacto.png`, `art/ega_preview.png`, `tools/crops.csv`

Si la sesión viene de un clon de GitHub, faltan, y hay que decirlo en la entrega: se
puede trabajar en código y diseño con los documentos versionados, pero no se puede
declarar fidelidad al módulo, comparar imágenes ni aprobar una sustitución artística.

Desfase de paginación confirmado: **página PDF = página impresa + 4**.
