# diaryo

[English](README.md) · **Español**

Un diario infinito: cada página es un lienzo sin límites para dibujar, escribir, rodear y
conectar ideas. Libre, gratuito y pensado para tomar notas rápido desde el PC.

> En desarrollo. Consulta [PLAN.md](PLAN.md) para ver las fases y decisiones.

## Qué hace

- **Un diario de verdad**: una doble página por día, que se pasa arrastrando la esquina,
  con índice, calendario, pestañas para las páginas importantes y un mapa de todo el
  diario.
- **Lienzo infinito**: lápiz, marcador, texto, notas adhesivas, figuras y flechas que se
  enganchan a lo que conectan; tareas con casillas (`[]` y espacio).
- **La mesa**: lo que queda fuera del libro es común a todas las páginas.
- **App de escritorio (Windows)**: un diario flotante sobre el escritorio (`Ctrl+Alt+D`),
  la mesa y un mini diario de hoy en el propio escritorio de Windows (`Ctrl+Alt+N`),
  icono en la bandeja y copias automáticas en una carpeta.
- **En español o en inglés** (Ajustes → Apariencia).
- Todo se guarda solo en tu equipo; se pueden guardar y abrir copias.

## Empezar

Requisitos: [Node.js](https://nodejs.org) 20 o superior.

```bash
npm install
npm run dev
```

Abre <http://localhost:5173>.

## App de escritorio (Windows)

Requisitos, además de Node.js: [Rust](https://rustup.rs) y las herramientas de C++ de
Visual Studio (la carga de trabajo "Desarrollo para el escritorio con C++").

```bash
npm run desktop
```

Para generar el instalador (queda en `src-tauri/target/release/bundle/nsis`):

```bash
npm run desktop:build
```

## Scripts

| Comando                 | Qué hace                               |
| ----------------------- | -------------------------------------- |
| `npm run dev`           | Servidor de desarrollo                 |
| `npm run build`         | Comprueba tipos y genera `dist/`       |
| `npm run desktop`       | Abre la app de escritorio (desarrollo) |
| `npm run desktop:build` | Genera el instalador de escritorio     |
| `npm test`              | Ejecuta los tests                      |
| `npm run lint`          | Revisa el código con ESLint            |
| `npm run format`        | Formatea con Prettier                  |

## Código

TypeScript con un motor de lienzo propio (Canvas 2D, sin React) y React solo para la
interfaz; la app de escritorio usa [Tauri](https://tauri.app) (Rust). Las carpetas y el
orden de las capas están en [PLAN.md](PLAN.md#arquitectura). El código y sus comentarios
están en inglés; los textos de la app, en `src/i18n`.

## Atajos

Pulsa `?` dentro de la app para verlos todos.

## Licencia

[MIT](LICENSE)
