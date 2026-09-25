# diaryo

Un diario infinito: cada página es un lienzo sin límites para dibujar, escribir, rodear y
conectar ideas. Libre, gratuito y pensado para tomar notas rápido desde el PC.

> En desarrollo. Consulta [PLAN.md](PLAN.md) para ver las fases y decisiones.

## Empezar

Requisitos: [Node.js](https://nodejs.org) 20 o superior.

```bash
npm install
npm run dev
```

Abre <http://localhost:5173>.

## App de escritorio (Windows)

La misma app en su propia ventana, con un **diario flotante** que aparece sobre el
escritorio con `Ctrl+Alt+D`, icono en la bandeja y copias automáticas en una carpeta.

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

## Atajos

Pulsa `?` dentro de la app para verlos todos.

## Licencia

[MIT](LICENSE)
