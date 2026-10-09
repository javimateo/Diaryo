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
    - [x] **H2. Portada**: mezcla de las dos maquetas. Mesa de madera, diario con letra a
          mano (Caveat), títulos en Lora y pósits con los colores de la app; tema claro y
          oscuro. Secciones: portada con el diario, cuatro ventajas, funciones (dos
          grandes en el escritorio de Windows y cuatro pequeñas), descarga con el aviso de
          SmartScreen (en el móvil, copiar el enlace), privacidad con preguntas
          frecuentes y la app web (solo si `APP_URL` está puesta).
    - [x] **H3. Demo en la portada**: el motor y el diario de la app ocupan toda la
          portada (la madera es la mesa de verdad) y el libro aparece donde estaba el
          dibujo. Diario de ejemplo de hoy y de ayer, pósits en la mesa y la esquina para
          pasar la página; su propia base de datos, que se vacía en cada visita. La web
          importa el código de la app con el alias `@app` (`../src`). En el motor, la
          opción `embedded` (la rueda desplaza la página; solo Ctrl+rueda hace zoom),
          `noteSize` y `frameInto`; el editor de texto, sin el estado de la app
          (`TextEditorView`). Solo en ordenadores (pantalla ancha y ratón, `client:media`):
          en el móvil queda la imagen y la demo ni se descarga. El texto va sobre la mesa, a
          la izquierda, y el libro a la derecha con la vista fija (la rueda desplaza la
          página); debajo del texto no se puede dibujar.
    - [x] **Tema de la web**: claro por defecto; botón en la cabecera para pasar a
          oscuro (se recuerda en el navegador) y la demo lo sigue.
    - [x] **H4. Funciones**: cada una con una animación corta en bucle, solo con CSS, sobre
          el escritorio de Windows o la mesa del diario (atajo y diario flotante, post-its
          en el escritorio, pasar la página, rodear y unir ideas, tareas y días, buscar con
          Ctrl+K y tapas, papel y mesa). Solo se animan a la vista; con «reducir
          movimiento», quietas en su estado final. Servirán para el punto I.
    - [x] **H5. Descarga y versiones**: al subir una etiqueta `vX.Y.Z`, GitHub Actions
          (`.github/workflows/release.yml`) compila el instalador, lo firma para el
          actualizador y deja un borrador de Release con `latest.json` y notas automáticas;
          al publicarlo llega a las apps instaladas. La web lee la última Release al
          compilarse (versión, tamaño y enlace directo) y explica el aviso de SmartScreen.
          Primera versión pública: 0.2.0.
    - [x] **H6. App web completa** en `app.diaryo.javiermateo.dev`: la misma app, guardando
          en el propio navegador (`deploy/app.Dockerfile`, nginx con la página sin caché
          y los archivos con huella para siempre).
          En el móvil: deshacer y acciones arriba, la navegación de páginas y las
          herramientas (deslizables) abajo, el panel de estilo como hoja inferior, sin
          botones de zoom. El motor entiende dos dedos (pellizcar y mover) y mantener
          pulsado abre el menú contextual (copiar, pegar…). Nuevo «Insertar imagen» en el
          menú (galería o cámara en el móvil).
    - [ ] **H7. Coolify**: dos recursos desde el repositorio, rama `main`, tipo Dockerfile
          y carpeta base la raíz: la web (`deploy/web.Dockerfile`, en
          `diaryo.javiermateo.dev`) y la app (`deploy/app.Dockerfile`, en
          `app.diaryo.javiermateo.dev`), puerto 80, HTTPS de Coolify y despliegue al
          subir a `main`. La web se vuelve a desplegar al publicar cada versión (lee la
          última Release al compilarse).
    - [ ] **H8. Visitas sin cookies**: Umami como servicio de Coolify; visitas y
          descargas (como evento), sin rastrear a nadie. La web ya está preparada
          (`UMAMI_SRC` y `UMAMI_ID` al compilar; eventos `download`, `open-web-app` y
          `copy-download-link`); falta montar Umami en Coolify (docs/deployment.md).
          Los botones de descarga bajan el instalador directamente (en el móvil llevan a
          la sección de descarga).
    - **Pendiente de decidir** antes de publicar:
      - [x] **Nombre**: diaryo (ver G).
      - [x] **Dominio**: `diaryo.javiermateo.dev` (web) y `app.diaryo.javiermateo.dev` (app).
      - [x] **Repositorio público** en GitHub.
      - [x] **Licencia**: PolyForm Noncommercial 1.0.0 (código disponible, sin uso
            comercial). Documentación en `docs/` (arquitectura, tecnologías, versiones,
            despliegue) y `CONTRIBUTING.md`.
      - [x] **Actualizaciones automáticas**: plugin de Tauri con actualizaciones firmadas
            (clave en `~/.tauri/diaryo.key`, secreto `TAURI_SIGNING_PRIVATE_KEY` en
            GitHub). Ajuste «Actualizar automáticamente» (activado por defecto): se
            descargan solas y se instalan mientras el diario está escondido; si no, un
            aviso con «Actualizar».
      - [ ] **Firma del instalador**: firmarlo (Azure Trusted Signing, unos 10 €/mes) o
            explicar en la web cómo pasar el aviso de SmartScreen.
  - [ ] **I. Enseñar a usarla**: recorrido la primera vez que se abre (pasos cortos con
        animaciones) y vídeos de cada función para la web, hechos con el mismo código.

- [ ] **12. Hacia la versión 1.0.0**. Primero los arreglos y lo que no cambia el modelo
      de datos; lo grande (nube, macOS, recordatorios) con su propuesta antes. Orden:
      A, B (instalador), C (nube), D (privacidad, sobre la nube), E (macOS), F (tareas
      y citas), G (marca y diseño).
  - [x] **A. Arreglos**
    - [x] **Contenedores dibujados a mano**: no era un fallo: el contenedor, dibujado
          después, quedaba encima de lo que rodea y su relleno lo tapaba. Ahora, al
          ponerle relleno a una figura o trazo cerrado, pasa detrás de lo que tiene dentro
          (`fillBehind`), en el mismo paso de deshacer.
    - [x] **Límite de zoom**: alejarse se para cuando el libro y todo lo que hay en la
          mesa ocupan una cuarta parte de lo que ocupan encuadrados (`minZoomFor`), sin
          impedir nunca bajar al 25 %; igual con la rueda, los botones y el pellizco.
    - [x] **La mesa salta al frente un momento**: al moverse por el explorador de
          archivos (sobre todo cuando tarda, como al cambiar de disco), los post-its del
          escritorio aparecían un segundo por encima de las ventanas. El explorador
          reordena un instante las ventanas del escritorio al recargar y
          `follow_show_desktop` lo tomaba por `Win+D`. Ahora solo sube la mesa si el
          escritorio además es la ventana activa y dura dos comprobaciones (~200 ms).
    - [x] **Abrir una copia mezclaba los diarios**: abrir una copia del diario entero la
          combinaba siempre con el actual (páginas y mesa sumadas). Ahora pregunta:
          «Reemplazar mi diario por esta copia» (antes guarda una copia del actual: en la
          carpeta de copias en el escritorio, descargada en la web) o «Combinar con mi
          diario» (lo de antes). Test del viaje de la mesa por el archivo `.diaryo`.
  - [ ] **B. Instalador**
    - [x] **Licencia en el instalador**: el instalador muestra la licencia (PolyForm
          Noncommercial) y hay que aceptarla (`bundle.licenseFile`).
    - [ ] **Firma de código** (aplazada): quitaría el aviso de SmartScreen solo con el
          tiempo (la reputación se gana con descargas, también firmando). Opciones
          revisadas (septiembre de 2026):
      - SignPath Foundation: no, exige una licencia aprobada por la OSI.
      - Azure Artifact Signing (~10 €/mes): particulares solo de EE. UU. y Canadá; en la
        UE, solo organizaciones (serviría si hubiera una empresa o autónomo).
      - Un certificado de una autoridad (Certum, Sectigo…, ~100–300 €/año, con token o
        HSM en la nube): posible para particulares, sin reputación inmediata.
      - Mientras tanto, la web explica cómo pasar el aviso.
  - [ ] **C. Nube (inicio de sesión)**: sincronizar el diario entre dispositivos
        (escritorio, web, móvil vía web). La nube es opcional: sin cuenta y sin conexión
        todo sigue funcionando; el diario local sigue siendo el que se usa y la nube es
        su copia sincronizada. Decidido (octubre de 2026):
    - **Servidor**: PocketBase en el VPS (Coolify), con sus migraciones y ganchos en el
      repositorio (imagen propia), para que el esquema y las reglas sean reproducibles.
    - **Acceso**: email y contraseña (con verificación y recuperación) y Google.
    - **Cifrado de extremo a extremo**: todo se cifra en el dispositivo (AES-GCM) con
      una clave del diario; esa clave va envuelta con una **contraseña del diario**
      (distinta de la de la cuenta: con Google no hay contraseña) y con una **clave de
      recuperación** que se imprime o se guarda. El servidor solo ve datos ilegibles.
      Sin contraseña ni clave de recuperación, la nube no se recupera.
    - **Sincronización por elemento**: cada elemento, página e imagen es un registro
      cifrado con su fecha de cambio; gana el cambio más reciente del mismo elemento; lo
      borrado deja una marca. Identificadores opacos (no dejan ver qué es cada cosa).
    - **Espacio**: 100 MB gratis por cuenta; un plan de pago con más espacio, más
      adelante (necesita alta como autónomo y un servicio de pagos que gestione el IVA,
      como Paddle o Lemon Squeezy).
    - **Primer inicio de sesión** con diario local y diario en la nube: el diálogo de
      reemplazar o combinar.
    - Fases (cada una en su rama):
      - [x] **C1. Diseño y servidor**: `docs/cloud.md` (cifrado, esquema y protocolo
            de sincronización); PocketBase (`cloud/`: migraciones y ganchos;
            `deploy/cloud.Dockerfile`) con colecciones `vaults` e `items`, reglas (cada
            uno solo ve lo suyo), cuota de 100 MB y «gana el cambio más reciente».
            `cloud/check.mjs` comprueba todo eso contra un servidor. Montado en
            Coolify (`cloud.diaryo.javiermateo.dev`, correo por Resend).
      - [x] **C2. Cuenta**: «Cuenta y nube» en Ajustes y el diálogo para entrar o
            crear la cuenta (email y contraseña, o Google: ventana en la web, navegador
            en el escritorio); salir; confirmar el email y recuperar la contraseña con
            enlaces que abren la web app; la sesión dura 30 días desde el último uso.
            Google está en modo de prueba hasta la C7 (política de privacidad).
      - [x] **C3. Cifrado**: contraseña del diario (distinta de la de la cuenta), clave
            de recuperación de 12 bloques (descargar, imprimir o copiar; se muestra una
            vez), desbloqueo en cada dispositivo (las llaves quedan en IndexedDB, no
            exportables), recuperar con la clave, cambiar la contraseña y crear otra
            clave; en Ajustes y al entrar en la cuenta. `src/cloud/crypto.ts`, con tests.
      - [ ] **Más adelante: desbloquear con biometría** (Windows Hello, Touch ID, huella
            del móvil) en vez de escribir la contraseña en cada dispositivo nuevo, con
            WebAuthn PRF (una passkey que además da una llave para envolver el secreto).
      - [x] **C4. Sincronización** (con las imágenes y las fuentes): cada página,
            elemento, imagen y fuente es un registro cifrado; la base local anota cada
            cambio en la misma operación; subir y bajar, marcas de borrado, gana el más
            reciente, sin conexión, aviso en tiempo real entre dispositivos y recarga de
            la página abierta. Modo automático (por defecto), manual o manual con
            contraseña (no guarda la llave). Primera vez con diario en los dos lados:
            combinar o usar el de la nube guardando el local en un archivo. Espacio
            lleno: se para la subida, el diario sigue y lo pendiente sube al haber
            sitio. La vista y las miniaturas no se suben. Con tests (servidor falso y
            dos dispositivos).
      - [x] **C5. Imágenes grandes**: al insertarlas, 2048 px como mucho y WebP (salvo
            las ligeras, los GIF y los SVG); las ya guardadas se reducen una vez antes de
            subirlas. Un registro que el servidor rechaza no frena el resto. Las
            imágenes que ya no usa nada se limpian (aquí y en la nube; deshacer las
            recupera) y los archivos se cifran como bytes (un 25 % menos de espacio).
      - [x] **C6. Espacio**: aviso al 80 % y al 95 % (una vez cada uno) y, en Ajustes,
            cuánto queda, con la barra en ámbar.
      - [ ] **Revisión de la nube** antes de abrirla: casos límite y pulido.
        - [x] Revisión del código y pruebas (octubre de 2026): cambios guardados tarde
              que se perdían al bajar, bucle entre pestañas, cortar a quien escribe,
              elementos huérfanos de páginas borradas, relojes desajustados, sesión
              caducada, cerrar sesión con cambios pendientes, varias pestañas y diario
              grande. Todo en docs/cloud.md («Edge cases»), con tests.
        - [ ] Pruebas en la app de escritorio, con dos dispositivos reales y con los
              correos reales.
        - [x] Cambiar de cuenta (octubre de 2026): al entrar con un diario en el
              dispositivo se pregunta siempre (subirlo o empezar uno nuevo si la cuenta
              está vacía; combinar o usar el de la nube si no), y al cerrar sesión, si
              dejar el diario o quitarlo del dispositivo.
      - [x] **C7. RGPD y web**: borrar la cuenta, exportar los datos, política de
            privacidad y condiciones; la web explica la nube (opcional, cifrada).
        - [x] En Ajustes → Cuenta y nube: «Tus datos» (un JSON con lo que el servidor
              sabe de la cuenta; el diario legible es «Guardar una copia») y «Borrar la
              cuenta» (escribiendo el email; se borran la cuenta, la bóveda y los
              elementos; el diario local se queda). Con Google ya no se guardan el nombre
              ni la foto (migración `1790900002_privacy.js`).
        - [x] Política de privacidad y condiciones en la web (`/privacidad`,
              `/condiciones`, `/en/privacy`, `/en/terms`), enlazadas al entrar en la
              cuenta y en Ajustes. Contacto: `privacidad@javiermateo.dev`.
        - [x] La web explica la nube: sección «Nube», textos que decían «sin nube» y
              preguntas nuevas.
        - [x] Tras publicar: el reenvío de `privacidad@javiermateo.dev` (Cloudflare
              Email Routing) y la app de Google publicada (`docs/deployment.md`).
              Probado: entrar con Google, descargar los datos y borrar la cuenta.
      - [ ] **Revisión legal** de la política de privacidad y las condiciones, por
            alguien que sepa: sobre todo si la LSSI pide el domicilio o el NIF del
            responsable (ahora solo están el nombre y el email).
      - [ ] **C8. Pagos** (más adelante).
  - [x] **D. Privacidad del diario**, después de la nube: el cifrado y la contraseña
        dependen de cómo se sincronice. Decidido (octubre de 2026):
    - **Una sola contraseña del diario**, la misma en el dispositivo y en la nube, con
      la misma clave de recuperación (también sin cuenta: se muestra siempre al ponerla).
      Lo local se cifra con una llave local aleatoria, envuelta con el secreto del
      diario: cambiar de cuenta solo la vuelve a envolver, nunca se recifra todo. Sin
      cuenta, la bóveda vive en el dispositivo y, al activar la nube, se sube esa.
    - **Cifrar es opcional y por niveles**: nada; solo ciertos post-its o páginas
      (privados, p. ej. contraseñas en un post-it de la mesa); o todo el diario, que
      pide la contraseña al abrir. Solo cifrado de verdad (sin candado que no cifre).
    - **Lo que queda en claro**: los ids y el día de cada página (son índices); el
      contenido, las miniaturas, las imágenes y las fuentes van cifrados, con un filtro
      de Dexie que cifra dentro de las transacciones (síncrono: WebCrypto no puede ir
      dentro). La búsqueda lee los textos descifrados, como antes.
    - **Olvidar la contraseña y la clave**: no hay forma de abrirlo, tampoco en la nube
      (va cifrada con el mismo secreto); sigue en los dispositivos donde está abierto. La
      pantalla de bloqueo ofrece borrarlo de este dispositivo y empezar uno nuevo.
    - Fases (cada una en su rama), en este orden: D1, D4, D2, D3.
    - [x] **D1. Contraseña y cifrado local** (`docs/privacy.md`): un filtro de Dexie
          cifra cada fila con XChaCha20 (`@noble/ciphers`, síncrono para ir dentro de las
          transacciones; solo quedan en claro los índices); activarlo cifra lo que hay y
          quitarlo lo descifra, por tandas y reanudable; pantalla de bloqueo (con la
          clave de recuperación y «borrar el diario» si se olvidan las dos); Ajustes →
          Privacidad y «Bloquear el diario» en la paleta; la bóveda local sigue a la de
          la nube; las llaves de la nube ya no quedan en el disco; el secreto pasa entre
          pestañas y a la mesa por `BroadcastChannel`; copias `.diaryo` cifradas (las
          diarias, y «Guardar una copia» pregunta cifrada o legible); el mini diario
          solo enseña la portada. Tests: los de `storage`, el diario y la sincronización
          otra vez con todo cifrado (proyecto `sealed` de Vitest) y `lock.test.ts`.
          Probado en la app de escritorio y contra un PocketBase local (dos dispositivos).
    - [x] **D4. Post-its privados**: Ajustes → Privacidad pasa a tres niveles (nada,
          solo lo privado, todo el diario). Un post-it privado (menú contextual o paleta)
          guarda su texto y su enlace cifrados aparte con una llave del secreto del
          diario, la misma en todos los dispositivos. **Cada uno se abre por separado**:
          doble clic o «Mostrar este post-it» pide la contraseña y enseña solo ese; abrir
          otro la vuelve a pedir. «Mostrar todo lo privado» es un atajo. El que está a la
          vista lleva un candado abierto en la esquina: pulsarlo lo vuelve a bloquear; y
          cada uno se oculta solo a los 30 s, al minuto (por defecto) o a los 5 min de
          abrirlo (mientras se edita, espera); además, todos al esconder el diario
          (minimizarlo, otra pestaña, o a la bandeja en el escritorio), con un
          interruptor. En la mesa del escritorio, el doble clic pide la contraseña allí
          mismo, con el diario escondido.
          **Oculto, nada lo cambia**: cuenta como bloqueado (no se selecciona, ni con su
          grupo, ni se mueve o borra, ni con el borrador ni seleccionando todo).
          **Borrar un privado siempre pide la contraseña**, a la vista u oculto (también
          cortar o borrar la página que lo tiene; el borrador no lo toca). Copiar uno a la
          vista copia su texto legible (decidido así). Viaja a la nube y a las copias `.diaryo` (también las legibles) con el
          texto cifrado. Las miniaturas y el mini diario siempre lo dibujan con candado;
          la búsqueda solo encuentra los que están a la vista. Al quitar la contraseña,
          se elige: dejarlos como post-its normales o borrarlos. Con la contraseña de
          otra cuenta, su texto pasa a la llave nueva (si están ocultos, pide mostrarlos
          antes). Tests en `sealing.test.ts`, `lock.test.ts`, `sync.test.ts` y
          `privateNotes.test.ts`.
      - [ ] Más adelante: **páginas privadas** (índice, mapa, miniaturas, pasar página).
    - [x] **D2. Qué se ve en el escritorio** (`docs/privacy.md`, «The Windows desktop»):
          con «Todo el diario», la mesa queda fuera del cifrado por defecto y se ve (y se
          usa) con el diario bloqueado: sus post-its normales, sus imágenes y las fuentes
          se guardan legibles; sus privados siguen cifrados. En Ajustes → Escritorio se
          elige «Visible» u «Oculta hasta abrir». El mini diario, con el diario abierto,
          recibe la página de hoy en memoria (nunca en el disco); bloqueado, la portada u
          oculto. Para cualquier nivel: los privados en el escritorio «Con candado» o «No
          se ven». La llave llega a la mesa por `BroadcastChannel` (probado en WebView2) y
          abrir un privado desde la mesa ya está hecho en D4.
    - [x] **D3. Ordenadores compartidos** (`docs/privacy.md`): con «Todo el diario»,
          «Bloquear solo» tras 5, 15 o 60 min sin usarlo (por defecto, nunca) y
          «Bloquear al esconderlo» (otra pestaña, minimizar o la bandeja), como «Bloquear
          ahora». Al cerrar sesión, una tercera opción: «Dejarlo cifrado y bloqueado» (si
          no lo estaba, se cifra con la contraseña del diario de la nube). En la web,
          «Mantener la sesión en este navegador»: apagado, la sesión vive en el
          `sessionStorage` de la pestaña y las llaves de la nube solo en memoria.
  - [ ] **E. macOS**: Tauri compila para macOS casi sin cambios; lo que es solo de
        Windows (la mesa en el escritorio, `windows-sys`) necesita su versión o quedarse
        fuera al principio. Para distribuirlo hace falta la cuenta de desarrollador de
        Apple (99 $/año) para firmar y notarizar; si no, macOS lo bloquea. Compilar en
        GitHub Actions (`macos-latest`) y un segundo `latest.json` para las
        actualizaciones.
  - [ ] **F. Tareas y citas**: tareas con fecha y hora, citas (médico…), vista de
        calendario, recordatorios (notificación del sistema en el escritorio; por correo
        necesitaría la nube de C) e importar/exportar calendarios (.ics, Google Calendar).
  - [ ] **G. Marca y diseño**, lo último antes de publicar la 1.0.0 (con maqueta antes de
        cada cambio):
    - [x] **Marca**: logo, icono, colores y tipografía coherentes en la app, la web y el
          instalador. Elegida la dirección «Cuaderno» (octubre de 2026) entre tres
          maquetas: el cuaderno terracota con goma es el símbolo (app, bandeja, favicon,
          instalador con imagen lateral y de cabecera; a 16 y 24 px, sin el trazo de la
          tapa); el índigo se retira y el acento es el terracota de la tapa; el nombre en
          Lora y la interfaz en Nunito Sans, como la web; borrar y los errores pasan a un
          carmesí que no se confunde con el terracota. Cómo regenerar el icono, en
          `docs/releasing.md`.
    - [ ] **Portada del diario editable**: que cada uno personalice la suya (no solo el
          color). Es también lo que enseña el mini diario cuando el diario está
          bloqueado (D2).
    - [ ] **Diario de demostración**: al empezar, una plantilla o demo que enseñe lo que
          se puede hacer (dibujo, post-its, conexiones, páginas, la mesa…), fácil de
          borrar o de empezar en blanco.
    - [ ] **Mejorar la web**: qué es diaryo, capturas o vídeo, descargas, la nube.
    - [ ] **Ventana de ajustes**: ha crecido demasiado y es densa; reorganizarla
          (secciones o pestañas, lo avanzado aparte) para que se encuentre todo. También
          los botones de arriba a la derecha (buscar, menú, tema, ajustes): maqueta
          propuesta con siete secciones (General, Aspecto del diario, Escritorio,
          Privacidad, Cuenta y nube, Copias y datos, Ayuda), «Buscar» con su nombre y el
          tema dentro del menú.
    - [ ] **Explicar mejor las funciones**: ayuda dentro de la app y en la web (atajos,
          gestos, para qué sirve cada herramienta).

Tras la fase 5 ya es una app usable para tomar notas.

## Riesgos

- **Perder notas**: autoguardado, exportación, `navigator.storage.persist()` y, en escritorio,
  archivos en disco.
- **Rendimiento con miles de trazos**: índice espacial y caché de capas.
- **Querer demasiado**: mantener pocas herramientas.
