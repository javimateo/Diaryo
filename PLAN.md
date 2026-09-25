# Plan de diaryo

Un diario infinito para PC: cada página es un lienzo sin límites donde dibujar, escribir,
rodear, seleccionar y conectar ideas. Libre, gratuito, rápido y agradable.

## Principios

- **Abrir y escribir en < 1 s.** La app arranca en la página de hoy, lista para dibujar.
- **Sin botón de guardar.** Todo se guarda solo.
- **Interfaz mínima.** Barra flotante; lo demás aparece solo cuando hace falta.
- **Todo por teclado**, al estilo Excalidraw.
- **Tus datos son tuyos.** Local primero y exportables a un formato abierto.
- **Pocas herramientas, muy bien hechas.**

## Decisiones

| Tema            | Decisión                            | Motivo                                                                                            |
| --------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| Motor           | **Propio** (TypeScript + Canvas 2D) | Control total, identidad propia, 100 % libre (tldraw pide licencia o marca de agua en producción) |
| Interfaz        | React 19 + Zustand                  | Solo para la UI; el lienzo no depende de React                                                    |
| Build           | Vite + TypeScript                   | Rápido y simple                                                                                   |
| Trazos          | `perfect-freehand` (MIT)            | Trazos suaves con grosor variable; presión simulada por velocidad con ratón                       |
| Índice espacial | `rbush` (MIT)                       | Dibujar solo lo visible, detectar clics y lazos rápido                                            |
| Guardado web    | IndexedDB con `dexie`               | Local, sin servidor                                                                               |
| Escritorio      | Tauri 2 (fase 9)                    | Ligero; guarda en archivos del disco                                                              |
| Texto           | `<textarea>` HTML sobre el canvas   | Editar texto dentro del canvas es muy costoso                                                     |

## Atajos

| Tecla     | Herramienta   |     | Tecla                                 | Acción                   |
| --------- | ------------- | --- | ------------------------------------- | ------------------------ |
| `H`       | Mano          |     | `Espacio` + arrastrar / botón central | Mover el lienzo          |
| `V` / `1` | Seleccionar   |     | Rueda / `Shift`+rueda                 | Desplazar                |
| `L` / `2` | Lazo (rodear) |     | `Ctrl`+rueda                          | Zoom                     |
| `P` / `3` | Lápiz         |     | `Ctrl +` / `Ctrl −` / `Ctrl 0`        | Acercar / alejar / 100 % |
| `M` / `4` | Marcador      |     | `Shift+1`                             | Ver todo                 |
| `E` / `5` | Borrador      |     | Doble clic                            | Escribir texto ahí       |
| `T` / `6` | Texto         |     | `Ctrl+Z` / `Ctrl+Shift+Z`             | Deshacer / rehacer       |
| `N` / `7` | Nota          |     | `Ctrl+D`                              | Duplicar                 |
| `A` / `8` | Flecha        |     | `Ctrl+→` / `Ctrl+←`                   | Pasar página             |
| `R` / `9` | Rectángulo    |     | `Ctrl+Inicio`                         | Ir a hoy                 |
| `O` / `0` | Elipse        |     | `Ctrl+K` / `Ctrl+F`                   | Buscar / comandos        |
|           |               |     | `Ctrl+B` / `Alt+N`                    | Índice / nueva página    |
|           |               |     | `?`                                   | Ver atajos               |
|           |               |     | `Alt+Shift+D`                         | Tema claro / oscuro      |

**Zoom semántico:** si sigues alejándote más allá de la página, se pasa a la **vista mapa**
con todas las páginas del diario.

## Arquitectura

```
src/
  lib/      Utilidades puras que usa cualquier capa (fechas, almacenamiento del navegador)
  engine/   Motor del lienzo en TypeScript puro (cámara, dibujo, entrada)
  i18n/     Textos de la app en español e inglés, y fechas en el idioma elegido
  storage/  Base de datos (Dexie), autoguardado y copias en archivo
  diary/    El diario: páginas por día, pasar página, la mesa, búsqueda
  store/    Estado de la interfaz (Zustand)
  desktop/  Puente con la app de escritorio (Tauri): modos, atajos, copias
  ui/       Componentes React (barra, paneles, diálogos; en ui/desktop, los de escritorio)
  styles/   Tokens de diseño (claro/oscuro) y estilos
src-tauri/  La app de escritorio en Rust
```

Cada capa solo usa las de arriba (en este orden). El motor no sabe nada de React, del
almacenamiento ni del diario.

### Modelo de datos

```
Diario   → nombre, ajustes (tema, fondo por defecto)
Página   → fecha/título, orden, fondo (liso/puntos/cuadrícula), cámara, miniatura
Elemento → tipo (trazo|texto|nota|flecha|forma|imagen), posición, tamaño,
           rotación, estilo, capa, enlaces (a otro elemento o a otra página)
```

### Claves de fluidez

- Redibujar solo cuando algo cambia (`requestAnimationFrame` + marca de "sucio").
- Dos capas: contenido estático y trazo en curso (canvas de baja latencia `desynchronized`).
- `getCoalescedEvents()` para capturar todos los puntos del ratón.
- Culling con índice espacial; caché de lo que no cambia.
- Zoom y desplazamiento suavizados, con inercia al soltar.
- Páginas cargadas bajo demanda; miniaturas en un Web Worker.

## Fases

- [x] **0. Base**: Vite + React + TS, ESLint, Prettier, Vitest, estructura
- [x] **1. Lienzo infinito**: cámara, zoom suave hacia el cursor, desplazamiento con inercia,
      rejilla de puntos infinita, alta densidad (HiDPI), tema claro/oscuro, barra de
      herramientas, atajos y ayuda
- [x] **2. Dibujo**: lápiz, marcador, borrador, colores y grosores, deshacer/rehacer.
      Grosor exacto en px (deslizador, campo numérico, 3 tamaños rápidos y teclas + / −).
      El grosor se ajusta al zoom al dibujar (se ve igual en pantalla: letra pequeña de
      cerca, títulos enormes de lejos). El borrador borra trazos completos.
- [x] **3. Selección**: clic, rectángulo, lazo, mover, escalar el marco, rotar, copiar/pegar.
      El lazo selecciona un trazo si queda dentro el 80 % de su longitud. Las esquinas
      escalan manteniendo la proporción (Shift para deformar); Alt escala desde el centro.
      Un elemento girado conserva su marco girado.
- [x] **4. Texto y notas**: doble clic para escribir, notas adhesivas, pegar imágenes.
      También: pegar texto normal, arrastrar imágenes, cambiar color y tamaño de lo
      seleccionado (y del texto mientras se escribe). El texto y las notas escalan en
      proporción; las imágenes se pueden estirar.
- [x] **4.5 Mejoras** (antes del guardado, porque cambian el formato de los datos):
  - [x] **A. Arreglos**: el rectángulo de selección iba a tirones; letras perdidas al
        escribir justo después de crear una nota; doble clic que cerraba el editor.
  - [x] **B. Panel de propiedades y estilo del texto**: panel lateral por secciones (como
        Excalidraw); color libre con selector propio; opacidad; fuentes (lista incluida con
        buscador + subir las tuyas); alineación; formato del texto dentro de las notas.
  - [x] **C. Estilos de post-it**: lisa, franja adhesiva, chincheta, celo, clip, esquina
        doblada.
  - [x] **D. Menú contextual**: cortar/copiar/pegar, duplicar, borrar, agrupar/desagrupar,
        capas (traer al frente, enviar al fondo…), voltear, bloquear, copiar y pegar estilos,
        copiar como PNG.
  - [x] **E. Figuras y contenedores**: rectángulo (R) y elipse (O) con aspecto a mano;
        los trazos cerrados admiten fondo; tipos de relleno (sólido, rayado, cuadriculado,
        puntos); texto dentro de figuras con alineación horizontal y vertical.
- [x] **5. Guardado**: autoguardado en IndexedDB, exportar/importar, exportar PNG.
      Solo se escribe lo que cambia (elementos, imágenes, fuentes subidas y cámara), 400 ms
      después del último cambio y siempre al ocultar o cerrar la ventana. Copias en archivo
      `.diaryo` (JSON legible con imágenes y fuentes); abrir una copia se puede deshacer.
- [x] **6. Diario**: páginas, pasar página con animación, "hoy", índice/calendario lateral.
      Cada página pertenece a un día (puede haber varias por día). La app abre la página de
      hoy (o la última que abriste, si fue hoy). Las páginas vacías y sin título no se
      guardan. Pie de página con la fecha y flechas; índice con calendario (puntos en los
      días con páginas), lista con miniaturas, títulos, borrar con "Deshacer". La copia
      `.diaryo` ahora es de todo el diario; al abrirla entra lo que falte o sea más nuevo.
- [ ] **6.5 Un diario de verdad** (que se sienta como rellenar un cuaderno):
  - [x] **A. Libro y papel**: cada día es una doble página de tamaño fijo con tapas,
        cinta en la página de
        hoy, fecha escrita a mano, título y números de página. Hoja de rayas, cuadrícula,
        puntos o lisa; anillas o cosido; color de las tapas; "papel de noche" en oscuro.
        Al pasar página gira la hoja sobre el lomo (por delante la página que se deja,
        por detrás la nueva) y cada página se abre viendo la doble página entera.
  - [x] **B. Pasar página con el ratón**: se arrastra la esquina (arriba o abajo) y la
        hoja se dobla siguiendo al ratón; debajo asoma la página siguiente y por detrás de
        la hoja, su otra cara. Soltada pasada la mitad, cae; si no, vuelve. La esquina se
        levanta al acercar el ratón. El teclado, los botones y el calendario usan la misma
        hoja, que pasa sola. Pendiente: sonido de papel opcional.
  - [x] **Mejoras de escritura**: el texto largo ya no desaparece al escribir; Tab
        sangra y las listas ("- ", "1. ", "[ ] ") continúan solas con Enter; cajas de
        texto de ancho fijo (arrastrando con T o estirando un texto por el lateral);
        figuras sin borde (cajas invisibles); se escribe dentro de cualquier figura,
        aunque no tenga fondo, y al crearla, como en un pósit; celo más visible;
        colores de hoja.
  - [x] **C. Pestañas de páginas importantes** (en vez de meses): se marca una página
        (botón del pie de página, Alt+M o el índice) y sale una pestaña de color en el
        canto con su título o su fecha. Las de páginas anteriores asoman por la izquierda
        y las siguientes por la derecha; al pulsarla, el diario pasa hasta esa página.
  - [x] **D. La mesa global**: lo que queda fuera del libro es común a todo el diario
        (pósits, tareas, cosas que recordar) y se queda al pasar página. Lo de dentro es
        de la página. Mover algo fuera o dentro del libro lo cambia de sitio.
  - [x] **Paso de página sin saltos**: la esquina nunca sale de la hoja (antes podía
        "levantarse" la página entera un instante), la cámara no se mueve al terminar,
        las sombras se desvanecen al posarse la hoja y el libro ya no cambia de grosor.
- [x] **7. Conexiones**:
  - [x] **A. Flechas (A)**: se arrastra de una cosa a otra; si empieza o acaba sobre una
        nota, un texto, una figura, una imagen o un trazo cerrado, se engancha a su borde
        y lo sigue al moverlo (también al deshacer). Seleccionada muestra tres puntos: los
        extremos (se mueven o enganchan a otra cosa) y el centro (curva). Puntas al
        final, en los dos lados, al principio o sin puntas; trazo limpio o a mano.
  - [x] **B. Enlaces entre páginas**: cualquier cosa (nota, texto, figura, imagen, flecha,
        también en la mesa) puede llevar a otra página: clic derecho › Enlazar, o el
        apartado "Enlace" del panel, con buscador por título o fecha. Lleva una etiqueta
        "→ 24 sept" que abre esa página; al llegar, un aviso ofrece "Volver".
  - [x] **C. Vista mapa**: todas las páginas de un vistazo, por meses, con sus
        miniaturas, pestañas y "hoy"; las conexiones entre páginas se dibujan como
        flechas curvas (se resaltan al pasar el ratón). Se abre alejándose mucho del
        libro (zoom semántico), con el botón junto al zoom o Shift+M; clic en una hoja
        la abre y Esc (o acercarse) vuelve al libro. Al entrar, la doble página abierta se
        encoge hasta su hoja; al salir, la hoja crece hasta ser el libro (las miniaturas
        son la doble página en pequeño; las antiguas se rehacen solas). Lo agrupado o
        superpuesto que enlaza a la misma página comparte una sola etiqueta.
- [ ] **8. Pulido**: paleta de comandos, búsqueda, más fondos, ajustes
  - [x] **A. Buscar y comandos** (`Ctrl+K`, `Ctrl+F` o la lupa de arriba): una sola caja
        para todo. Encuentra páginas por título o fecha, días escritos a mano ("ayer",
        "lunes", "el jueves pasado", "24 sept", "3/10"), lo escrito en cualquier página o
        en la mesa (textos, notas y figuras, con lo encontrado resaltado) y todas las
        acciones con sus atajos (herramientas, páginas, selección, vista, aspecto del
        diario, copias). Al elegir algo escrito, la hoja pasa hasta su página y se ilumina
        un momento. El título de la página se cambia en la misma caja.
  - [x] **B. Más fondos**: hojas nuevas **Cornell** (ideas clave, notas y resumen),
        **Agenda** (horas de 7:00 a 22:00 a la izquierda; tareas con casilla y notas a la
        derecha) e **Isométrica** (puntos en triángulo). La hoja es la de todo el diario,
        pero cada página puede tener la suya ("Esta página"). La **mesa** puede ser lisa,
        de madera, de corcho o de lino (texturas hechas por el programa, sin costuras,
        claras y oscuras), también de fondo en el mapa. Se eligen con miniaturas.
  - [x] **C. Ajustes** (engranaje arriba o `Ctrl+,`): tema claro, oscuro o como el
        sistema; aspecto del diario; la semana empieza en lunes o domingo; pasar página
        con animación, rápido o sin animación; si alejarse mucho abre el mapa; cuánto
        ocupa el diario, protegerlo para que el navegador no lo borre y guardar una
        copia; y los atajos.
  - [x] **D. Estética del diario**: tapas de verdad (con anillas, dos cartones
        separados en el lomo; cosido, una tapa con lomo de tela), con grosor, luz suave y
        material: **cuero** con pespunte (por defecto), tela, cartón o lisa. Menos margen
        alrededor de las hojas; canto de hojas en rayas finas (siempre igual, sin saltos
        al pasar página); la hoja se hunde hacia el lomo; anillas metálicas que entran por
        agujeros del papel; goma elástica que asoma arriba y abajo de la tapa de atrás
        (se puede quitar); sombra en dos capas. Mesa de **madera** por defecto. Sin cinta
        marcapáginas (ocupaba sitio útil).
- [x] **9. Escritorio** (Tauri 2, `src-tauri/`; `npm run desktop` y `npm run desktop:build`)
  - [x] **A. App de escritorio**: diaryo en su propia ventana, con icono (libreta de
        cuero con goma) e instalador para Windows (NSIS, sin permisos de administrador).
        El guardado sigue siendo el de dentro de la app. Una sola copia abierta: abrirla
        otra vez enseña la que ya estaba.
  - [x] **B. Copias automáticas** en una carpeta (`Documentos\diaryo` por defecto): una
        por día (se guardan las de las dos últimas semanas), al esconder o cerrar la app y
        cada media hora si hay cambios. En Ajustes: apagarlas, cambiar la carpeta, abrirla
        y copiar ahora.
  - [x] **C. Diario flotante**: `Ctrl+Alt+D` (se cambia en Ajustes pulsando el atajo
        nuevo) lo hace aparecer a pantalla completa sobre el escritorio, que hace de mesa
        (transparente, con un velo suave); `Esc`, el mismo atajo o pasar a otra app lo
        apartan. Icono en la bandeja (clic: la ventana; menú: diario flotante y salir).
        Cerrar la ventana deja diaryo en la bandeja; Salir guarda todo y hace la copia.
  - [x] **D. Arrancar con Windows**, escondido y listo para el atajo (se activa la
        primera vez; se puede quitar en Ajustes).
- [x] **10. Notas en el escritorio**
  - [x] **A. Tareas con casillas**: en textos, pósits y figuras (en el diario y en la
        mesa), una línea que empieza por `[ ]` es una tarea; al escribir, `[]` y espacio la
        crea y Enter sigue con otra. Se pinta como casilla y un clic la marca (se tacha) o
        la desmarca, y se puede deshacer. En `Ctrl+K`, "tareas" lista las pendientes.
  - [x] **B. La mesa en el escritorio de Windows**: toda la mesa (pósits, textos, dibujos)
        sobre el fondo del escritorio, detrás de las ventanas y en el mismo sitio que
        alrededor del diario flotante; se mueve, se escribe y se marcan tareas ahí mismo;
        los clics fuera llegan al escritorio. `Ctrl+Alt+N` (se cambia en Ajustes) la
        enseña o la esconde, y en Ajustes se desactiva. Es una segunda ventana transparente
        justo encima del fondo; mientras está el diario flotante se aparta (ya la enseña
        él). Las dos comparten la vista: la mesa del escritorio se queda como se dejó en
        el diario flotante (con su zoom), y este se vuelve a abrir así. Lo que se deja en la mesa donde luego se abre el libro sigue siendo de la
        mesa: algo solo pasa a la página (o a la mesa) al cruzar el borde del libro.
  - [x] **C. Mini diario en el escritorio**: la doble página de hoy en pequeño, con las
        tapas alrededor y cuántas tareas quedan (arriba a la derecha; se arrastra a otro
        sitio y lo recuerda); un clic abre el diario flotante en la página de hoy. Lo
        dibuja el diario (un poco después de cada cambio y al empezar un día nuevo) y va
        en la capa del escritorio, así que `Ctrl+Alt+N` también lo esconde.

- [ ] **11. Pulir para publicar**
  - [x] **A. Arreglos rápidos**: alejarse ya no abre el mapa (molesta al ordenar la mesa;
        el mapa sigue en su botón y en `Shift+M`); el diario flotante no ocupaba toda la
        pantalla si la ventana estaba maximizada.
  - [x] **B. Vista fijada**: un botón "Fijar vista" en el diario flotante guarda cómo se
        ve (zoom y sitio). El diario flotante se abre siempre así y la mesa del escritorio
        la usa siempre; si se mueve la vista un momento, un botón vuelve a la fijada.
  - [x] **C. Abrir y cerrar más suave**: el diario flotante aparece y se aparta con un
        fundido (también con el atajo o al pasar a otra app: la ventana espera a que
        acabe).
  - [x] **D. La ventana de la app**: sin el marco de Windows; minimizar, maximizar y
        cerrar (a la bandeja) van en el panel de arriba a la derecha, y la ventana se
        arrastra desde la franja de arriba, entre los paneles (doble clic: maximizar).
  - [x] **E. Revisión del código**: capas en una sola dirección (`lib` → `engine` →
        `storage` → `diary` → `store` → `desktop` → `ui`); `localStorage` en un solo
        módulo seguro; el puente de escritorio y la mesa del escritorio como clases; del
        motor salen los tipos, el estilo de la selección, el movimiento de la cámara y el
        fondo; el Rust en módulos (estado, atajos, bandeja, comandos); el panel de
        propiedades y los estilos, por partes; tests del guardado entre mesa y página y
        de la sincronización entre ventanas.
  - [x] **F. Inglés y español**: comentarios del código en inglés; la app en español (por
        defecto) o inglés, a elegir en Ajustes.
    - [x] **La app en dos idiomas**: `src/i18n` (`es.ts` manda, `en.ts` con la misma
          forma, comprobada por TypeScript); fechas con `Intl` en el idioma elegido; el
          motor no sabe de idiomas (le llegan los textos que pinta: "hoy", rótulos de las
          hojas, enlaces rotos); la búsqueda de fechas entiende los dos idiomas; la parte
          de Rust (bandeja, errores) sigue el idioma de la página. Se cambia en Ajustes
          → Apariencia y todo se vuelve a pintar al momento.
    - [x] **Comentarios en inglés** (TypeScript, CSS y Rust), nombres de los tests y
          mensajes para desarrolladores.
    - [x] **README** en inglés (`README.md`) con su versión en español (`README.es.md`).
  - [x] **G. Nombre**: se queda **diaryo** (se descartó dair.io).
  - [ ] **H. Página web**: presentación y descarga del instalador, en el VPS propio
        (Coolify, desde el repositorio de GitHub) con su dominio.
    - [x] **H1. Esqueleto**: carpeta `web/` con Astro 7 (páginas estáticas, islas de
          React para reutilizar el motor), en español (`/`, por defecto) e inglés
          (`/en/`). El nombre y el repositorio en `web/src/site.ts`; el dominio, en la
          variable `SITE_URL` al publicar. `npm --prefix web run dev` para verla.
    - [ ] **H2. Maqueta de la portada** (antes de hacerla): arriba, la demo; luego las
          funciones, la descarga, código abierto y privacidad, y preguntas frecuentes.
    - [ ] **H3. Demo en la portada**: el lienzo de verdad con un diario de ejemplo, para
          escribir, poner pósits y pasar la página sin instalar nada (no guarda). Usa el
          motor tal como quede tras la revisión del código (E).
    - [ ] **H4. Funciones**: cada una con una animación corta (las mismas del punto I).
    - [ ] **H5. Descarga**: los instaladores en las Releases de GitHub; la web enlaza a la
          última (versión, tamaño y novedades) y explica el aviso de SmartScreen mientras
          el instalador no esté firmado.
    - [ ] **H6. App web completa** en un subdominio (`app.`): la versión de navegador de
          siempre, guardando en el propio navegador.
    - [ ] **H7. Coolify**: dos recursos desde el repositorio (la web, con carpeta base
          `web/`, y la app web), cada uno con su dominio y HTTPS; se publican solos al
          subir a `main`.
    - [ ] **H8. Visitas sin cookies**: Umami como servicio de Coolify; visitas y
          descargas (como evento), sin rastrear a nadie.
    - **Pendiente de decidir** antes de publicar:
      - [x] **Nombre**: diaryo (ver G).
      - [ ] **Dominio**: cuál, y si la web va en el principal o en un subdominio.
      - [ ] **Repositorio público** en GitHub (lo necesitan las descargas de las Releases).
      - [ ] **Actualizaciones automáticas**: que la app avise y se actualice sola (plugin
            de Tauri con actualizaciones firmadas, desde las Releases). Sin ellas, cada
            versión nueva se baja a mano desde la web.
      - [ ] **Firma del instalador**: firmarlo (Azure Trusted Signing, unos 10 €/mes) o
            explicar en la web cómo pasar el aviso de SmartScreen.
  - [ ] **I. Enseñar a usarla**: recorrido la primera vez que se abre (pasos cortos con
        animaciones) y vídeos de cada función para la web, hechos con el mismo código.

Tras la fase 5 ya es una app usable para tomar notas.

## Riesgos

- **Perder notas**: autoguardado, exportación, `navigator.storage.persist()` y, en escritorio,
  archivos en disco.
- **Rendimiento con miles de trazos**: índice espacial y caché de capas.
- **Querer demasiado**: mantener pocas herramientas.
