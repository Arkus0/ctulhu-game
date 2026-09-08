# Dirección de diseño de La Broma Macabra

Este documento es la referencia de producto para las siguientes sesiones de desarrollo. Si una idea nueva entra en conflicto con él, debe discutirse y actualizarse aquí antes de implementarla.

## 1. Visión

La Broma Macabra debe convertirse en una aventura gráfica narrativa y sistémica para un jugador. No es una novela visual, un lector del módulo ni una sucesión de párrafos con botones. Es una investigación contrarreloj donde el jugador:

1. Interpreta una situación visible.
2. Elige una intención concreta.
3. Decide quién del grupo se ocupa de cada frente.
4. Paga tiempo, riesgo o recursos.
5. Ve una reacción del hotel.
6. Actualiza su teoría del caso.

El referente de Sierra se toma por su claridad escénica, personalidad, peligros y sensación de estar dentro de un lugar, no por el píxel invisible, la muerte arbitraria o el parser caprichoso.

La promesa en una frase:

> Tres investigadores, cuatro horas y demasiadas conspiraciones: decide dónde estar cuando el Hotel Shepheard’s empiece a moverse.

## 2. Pilares irrenunciables

### El reloj es el antagonista

Cada acción significativa consume minutos. Los personajes no jugadores siguen su agenda aunque Edith no esté delante. El tiempo debe mostrarse antes de confirmar una acción y sus consecuencias deben sentirse después.

El reloj no puede convertirse en una espera repetitiva. Cada bloque de 15 a 30 minutos debe contener al menos una de estas cosas: una decisión, una reacción, un informe, una oportunidad que se abre o una oportunidad que se pierde.

### Elegir dónde estar es el juego

No se puede verlo todo. Perderse una escena no bloquea la partida, pero cambia lo que el jugador sabe y el precio de averiguarlo después. Todo suceso importante debe tener:

- una forma de presenciarlo;
- al menos un rastro posterior;
- una fuente alternativa parcial, como un testigo o un informe;
- una consecuencia aunque nadie lo observe.

### El grupo multiplica posibilidades, no pantallas

Edith Harker es la protagonista y el punto de vista fijo. Nadia Farouk y Samuel Vance son compañeros autónomos a los que se asignan misiones claras. No se alterna entre tres interfaces ni se recibe conocimiento telepático.

Un compañero separado puede presenciar sucesos, fallar, exponerse o volver con información incompleta. Sus descubrimientos solo entran en el caso cuando se reúne con Edith y entrega su informe.

### La conversación es una acción

Hablar debe tener propósito, tono y coste. **La única elección que se le pide al jugador es el tema: la línea que se dice.** Preguntar es un clic, y la tirada se resuelve sola.

La aproximación —adular, presionar, untar, fingir, ir de frente— sigue existiendo por debajo, pero la elige el motor: mira los ganchos de carácter del personaje no jugador, la habilidad de quien está delante y el coste social de cada registro, y escoge la mejor. Elegir el tono a mano antes de cada pregunta es una decisión de mesa; repetida cuarenta veces en una partida se convierte en un peaje.

Lo que sí debe verse siempre es **por qué** una pregunta salió como salió: quién del grupo la formula, en qué registro, y qué gancho del personaje se ha activado. Esa es la textura que sustituye al menú.

La interfaz enseña cinco temas y pagina el resto. Un tema que ya se ha preguntado y admite repetición baja al final de la lista y se marca como tal. Las respuestas extensas del módulo se conservan, pero pueden presentarse por párrafos o golpes de diálogo sin mutilar el texto.

Los fallos sociales nunca producen una pared muda. Deben revelar carácter, crear sospecha, consumir una oportunidad o entregar una pista más cara.

Los ganchos de carácter son el alma de los personajes del módulo y por eso viven en `npcs.json` como datos. Un gancho que el motor no sepa activar es contenido muerto: la validación de contenido rechaza cualquier gancho que no corresponda a una aproximación, a un alias de aproximación o a una etiqueta declarada por algún tema de diálogo.

### El sistema debe producir escenas

Reloj, agenda, Cordura, tiradas y custodia de objetos son infraestructura. Solo tienen valor cuando producen un momento jugable con anticipación, decisión y consecuencia.

Los eventos importantes usan `scene` e `interruptibleBy`. Una escena interactiva debe declarar:

- contexto inmediato;
- entre dos y cuatro acciones distintas;
- requisitos visibles;
- coste temporal;
- apuesta de cada tirada;
- resultado de éxito, fallo y, cuando proceda, gasto de Suerte;
- cambios posteriores en agenda, relaciones o custodia.

## 3. Bucle de juego

El bucle normal debe poder leerse así:

**Escena actual → objetivo → acción contextual → coste → reacción → caso actualizado → nueva decisión**

Las herramientas superiores tienen responsabilidades separadas:

- **Mapa:** desplazamiento y rutas conocidas. Nunca revela una zona secreta antes de descubrirla.
- **Caso:** pistas activas, resueltas, perdidas o bloqueadas, con ventanas temporales cuando existan.
- **Equipo:** estado de Edith, encargos de Nadia y Vance, lugar donde están e informes pendientes.
- **Guardar:** tres ranuras manuales. Sin rebobinado ni autoguardado que neutralice el riesgo.
- **Historial:** relectura de lo ya visto. Nunca contiene sucesos ocultos.

La raíz ofrece un máximo de cinco acciones contextuales. El mapa absorbe los desplazamientos; los submenús absorben las listas de diálogo. El jugador debe entender en pocos segundos qué puede hacer y por qué podría importarle.

## 4. Arco de la demo 09:00–13:00

La demo debe durar aproximadamente entre 20 y 30 minutos en una primera partida y tener un arco completo.

### 09:00–10:00. Llegada y orientación

- Presentar a Edith, Nadia y Vance mediante acciones, no mediante tres fichas enciclopédicas.
- Registrar al grupo y confirmar la cita con Behler.
- Enseñar Mapa, Caso y Equipo con una intervención mínima.
- Permitir el primer reparto del grupo.
- Sembrar dos anomalías: los Lounpeen y la actividad discreta del personal.

### 10:00–11:00. Preparación

- Explorar un frente personal y delegar otro.
- Descubrir que el hotel tiene rutas y espacios no públicos.
- Introducir una primera decisión sobre información frente a puntualidad.
- Hacer que una conversación breve entre los investigadores exprese desacuerdo sobre el método.

### 11:00–12:00. La terraza

- Behler ofrece el encargo y puede firmar una autorización.
- Carter y Weder hablan al mismo tiempo en otra mesa.
- El jugador no debe poder agotar cómodamente las dos escenas y todos los diálogos.
- Espiar produce fragmentos, no una transcripción completa.
- El resultado debe señalar a Weder y al sótano sin convertirlo en una flecha obligatoria.

### 12:00–12:30. Persecución y horror

- Weder cruza cocina y baja con Mahadni.
- El jardín de Isis mantiene una ruta alternativa centrada en Gasparini y Olga.
- Las orejas constituyen el primer golpe de horror y la primera factura de Cordura.
- Un informe de compañero puede abrir la ruta sin regalar lo que está ocurriendo allí.

### 12:30–13:00. El Disco Solar

- Escena de cierre con tres decisiones: observar, invocar la autoridad de Behler o arrebatar el disco.
- Las tiradas son visibles y muestran sus apuestas antes de confirmar.
- Gastar Suerte puede convertir un fallo comprable.
- El cierre explica qué cambió, qué se perdió y qué amenaza queda abierta.

## 5. Personajes jugadores

### Edith Harker

Líder fija y voz del jugador. Su terreno natural es la entrevista, la improvisación social y la lectura de una habitación. Su defecto dramático es la necesidad de acercarse demasiado a una buena historia.

### Nadia Farouk

No es una enciclopedia ambulante. Interpreta objetos, contexto histórico, idiomas y la relación colonial alrededor de las excavaciones. Debe disentir cuando la prensa o los huéspedes europeos tratan Egipto como decorado.

### Samuel Vance

Entiende hoteles como máquinas sociales: llaves, turnos, excusas, pasillos y gente que no desea ser vista. Su pragmatismo puede chocar con el riesgo que Edith acepta y con el respeto que Nadia exige.

### Conversaciones del grupo

El grupo necesita intercambios breves y reactivos, no una tertulia continua. Dos o tres líneas, nunca un debate. Se disparan al:

- aceptar o perder una pista importante;
- separarse por primera vez;
- reunirse con un informe;
- entrar en una zona peligrosa;
- sufrir Cordura o daño;
- decidir qué hacer con el Disco Solar.

Cada intercambio debe hacer al menos dos trabajos: caracterizar, interpretar una pista, anticipar un riesgo o plantear una decisión. No debe repetir la información que ya aparece en el cuaderno.

Tres reglas de escritura, porque es donde el texto se echa a perder más deprisa:

- **Solo habla quien está en la sala.** Un compañero separado en un encargo no puede replicar desde otra planta.
- **Cada uno habla como es.** Edith pregunta y titula; Nadia corrige el dato y señala de quién es lo que se está tocando; Vance habla de puertas, turnos y de lo que va a costar. Si una réplica se le puede dar a cualquiera de los tres, está mal escrita.
- **Nada de aforismos simétricos.** Una frase ingeniosa contestada por otra frase ingeniosa del mismo tamaño no es una conversación: es un lema partido en dos. Que alguien interrumpa, que alguien no conteste, que alguien conteste a otra cosa.

## 6. Tiradas, fallo y dificultad

- La habilidad, dificultad, resultado y coste de Suerte deben ser legibles.
- Ese aparato **no va en el botón**. Una opción se lee por su intención: qué se dice o qué se hace. La habilidad, la dificultad y lo que está en juego aparecen con la tirada, que es el momento en que el jugador puede hacer algo con ese dato: aceptarla o comprarla con Suerte. Un botón que arrastra habilidad, riesgo y consecuencia se convierte en un párrafo de reglamento y hay cuatro por pantalla.
- La única excepción es la opción que no se puede tomar: ahí sí hay que decir qué falta, y en una línea.
- Se muestran las apuestas, no el resultado exacto de cada rama.
- El fracaso cambia el estado: alerta a un personaje, consume tiempo, empeora una relación, causa daño o entrega una versión incompleta.
- La Cordura no es una barra decorativa. Una crisis roba tiempo y altera escenas posteriores.
- La muerte o bloqueo total no debe surgir de una elección inocente sin advertencia.

## 7. Sonido y música

El sonido debe sostener el ritmo, no cubrir la lectura.

- Ambiente por espacio: hall, terraza, cocina, jardín y sótano.
- Efectos diegéticos breves: campanilla, pasos, vajilla, ascensor, papel, puerta, dados y reloj.
- Música en capas, con pocos temas y cambios por tensión.
- Un motivo elegante y colonialmente incómodo para el hotel; otro grave y casi sin pulso para el subsuelo.
- Silencio deliberado antes de una revelación y golpe sonoro corto después.
- Controles de música, ambiente y efectos, además de silencio total.
- Ningún audio comienza antes del primer gesto del usuario.
- Solo recursos originales o con licencia compatible, documentados en `LICENSE-AUDIO.md`.

La música continua no es obligatoria. En una aventura de lectura, treinta segundos de silencio bien situados pueden valer más que otro bucle.

## 8. Dirección visual

- Resolución lógica de 320×152 para las escenas.
- Paleta EGA estricta de 16 colores y tramado deliberado.
- Composiciones panorámicas con una silueta clara, un foco narrativo y espacio para los rótulos de interfaz.
- El Cairo de 1922 debe sentirse concreto: arquitectura, ropa, iluminación y jerarquía social investigadas.
- Las imágenes deben ser originales. El PDF sirve como referencia de hechos y atmósfera, nunca como fuente para calcar personajes, encuadres o ilustraciones.
- Los personajes recurrentes necesitan rasgos y vestuario consistentes entre escenas.

El arte nuevo no se limita a reemplazar fondos. También debe cubrir los momentos que ahora comparten una imagen genérica: llegada, reunión con Behler, conspiración en la terraza, descenso por cocina, escena de las orejas, aparición del Disco Solar, informes de los compañeros y desenlaces.

## 9. Métricas de calidad

Una iteración se considera mejor solo si mejora una de estas métricas sin dañar las demás:

- Primera decisión interesante antes de dos minutos.
- Primer reparto del grupo antes de cinco minutos.
- Máximo de cinco acciones en la raíz.
- Ninguna pista crítica depende de un único éxito de dados.
- Cada pista principal tiene al menos dos vías de acceso.
- Una escena interactiva o reacción significativa cada 20–30 minutos del reloj ficticio.
- Ningún informe de compañero se filtra antes de la reunión.
- La demo ofrece al menos tres cierres materialmente distintos.
- La partida completa se puede manejar con ratón, teclado y pantalla móvil.
- Cero errores de consola y toda la suite automatizada en verde.

## 10. Orden de trabajo recomendado

1. Afilar la demo actual antes de ampliar el horario.
2. Sustituir el material visual de terceros por un paquete original coherente.
3. Construir escenas interactivas reutilizables y diálogos reactivos del grupo.
4. Extender la estructura probada a 13:00–19:00.
5. Añadir mascarada y noche del día 1.
6. Completar el día 2 y sus cascadas de custodia.

No se debe añadir volumen de texto a una franja horaria que todavía no resulte entretenida al jugarla.

## 11. Protocolo para futuras sesiones

Antes de modificar el juego:

1. Leer este documento, `progress.md` y el prompt de la tarea en curso.
2. Definir qué experiencia concreta mejorará para el jugador.
3. Implementar en incrementos pequeños.
4. Añadir o actualizar pruebas del comportamiento.
5. Ejecutar `npm test` y `npm run build`.
6. Recorrer en navegador el flujo completo afectado, inspeccionar capturas, estado textual y consola.
7. Actualizar `progress.md` con decisiones, comprobaciones y trabajo pendiente.

Si una sesión solo aumenta el número de palabras, eventos o ilustraciones sin mejorar decisiones, ritmo o consecuencias, no ha avanzado el juego.
