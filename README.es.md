# diaryo

[English](README.md) · **Español**

Un diario infinito para tu PC: cada día es una doble página sin bordes para escribir,
dibujar, pegar post-its, rodear cosas y unir ideas con flechas. Vive en tu ordenador,
aparece sobre el escritorio con un atajo y tus notas no salen de él.

**Web y descarga:** <https://diaryo.javiermateo.dev> · **App web:**
<https://app.diaryo.javiermateo.dev> · **Versiones:**
[GitHub](https://github.com/javimateo/Diaryo/releases/latest)

## Qué hace

- **Un diario de verdad**: una doble página por día, que se pasa tirando de la esquina,
  con índice, calendario, pestañas para las páginas importantes y un mapa de todo el
  diario.
- **Lienzo infinito**: lápiz, rotulador, goma, texto, post-its, rectángulos, elipses y
  flechas que se quedan enganchadas a lo que unen. Tareas con casilla (escribe `[]` y un
  espacio), enlaces entre páginas, imágenes, grupos y capas.
- **La mesa**: lo que queda fuera del libro es común a todas las páginas.
- **App de escritorio (Windows)**:
  - un diario flotante sobre el escritorio (`Ctrl+Alt+D`; el mismo atajo lo esconde);
  - la mesa y un mini diario de hoy en el propio escritorio de Windows (`Ctrl+Alt+N`);
  - icono en la bandeja, arranque con Windows y copias diarias automáticas en una carpeta;
  - se actualiza sola (se puede desactivar en Ajustes).
- **A tu gusto**: tapas de cuero, tela o cartón; papel de rayas, cuadrícula, puntos,
  Cornell o agenda; y mesa de madera, corcho o lino. Tema claro y oscuro.
- **Búsqueda** (`Ctrl+K`): cualquier palabra, día, tarea o comando.
- **En español o en inglés** (Ajustes → Apariencia).
- **También en el móvil**: la app web funciona con el dedo (dos dedos para hacer zoom y
  moverse, mantener pulsado para abrir el menú).
- **Privado**: todo se guarda en tu equipo (o en el navegador, en la app web), sin
  necesidad de cuenta. Se pueden guardar copias en un archivo y abrirlas en otro sitio.
- **Nube opcional**: con una cuenta, el diario se sincroniza entre dispositivos, cifrado de
  extremo a extremo: el servidor no puede leerlo.

Pulsa `?` dentro de la app para ver todos los atajos.

## Empezar

Requisitos: [Node.js](https://nodejs.org) 22 o superior.

```bash
npm install
npm run dev
```

Abre <http://localhost:5173>: es la versión web de la app.

### App de escritorio (Windows)

Además hacen falta [Rust](https://rustup.rs) y las herramientas de C++ de Visual Studio
(la carga de trabajo «Desarrollo para el escritorio con C++»).

```bash
npm run desktop
```

Para generar el instalador (queda en `src-tauri/target/release/bundle/nsis`):

```bash
npm run desktop:build
```

### Web

La web (presentación, demo en directo y descargas) está en `web/` y usa el código de la
app, así que hacen falta las dos instalaciones:

```bash
npm install
npm --prefix web install
npm --prefix web run dev
```

Abre <http://localhost:4321>.

## Comandos

| Comando                    | Qué hace                                           |
| -------------------------- | -------------------------------------------------- |
| `npm run dev`              | Servidor de desarrollo de la app                   |
| `npm run build`            | Comprueba los tipos y genera la app web en `dist/` |
| `npm run desktop`          | Abre la app de escritorio (desarrollo)             |
| `npm run desktop:build`    | Genera el instalador de escritorio                 |
| `npm test`                 | Ejecuta los tests (Vitest)                         |
| `npm run lint`             | Revisa el código (ESLint)                          |
| `npm run format`           | Da formato a todo (Prettier)                       |
| `npm --prefix web run dev` | Servidor de desarrollo de la web                   |

## Documentación

Está en inglés, como el código:

- [Arquitectura](docs/architecture.md): cómo está organizado el código (capas, el motor
  del lienzo, el diario, la app de escritorio y la web).
- [Tecnologías](docs/tech-stack.md): tecnologías, librerías y fuentes, con sus licencias.
- [Versiones](docs/releasing.md): números de versión, el flujo de publicación y las
  actualizaciones automáticas.
- [Despliegue](docs/deployment.md): la web y la app web en Coolify.
- [Colaborar](CONTRIBUTING.md): preparar el entorno, comprobaciones y convenciones.
- [PLAN.md](PLAN.md): las fases y decisiones del proyecto.

El código y los comentarios están en inglés; los textos de la app, en `src/i18n`.

## Licencia

diaryo tiene el **código disponible** bajo la
[PolyForm Noncommercial License 1.0.0](LICENSE): puedes leer, usar, cambiar y compartir
el código para cualquier fin **no comercial** (uso personal, estudio, investigación,
proyectos personales, ONG, educación…). No se permite el uso comercial: venderlo,
incluirlo en un producto o servicio de pago o usarlo para ganar dinero. Para cualquier
otra cosa, escríbeme.

Las librerías y fuentes que usa mantienen sus propias licencias (ver
[docs/tech-stack.md](docs/tech-stack.md)).

Copyright © 2026 Javier Mateo.
