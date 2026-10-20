// Makes the README's animations (docs/media/<scene>.<lang>.webp) from the engine's scenes:
// `npm run media`. It serves /scenes.html with Vite, steps each scene's clock frame by
// frame in a headless Chromium and joins the screenshots into an animated WebP.
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { createServer } from 'vite';

const SCENES = ['draw', 'turn', 'tasks', 'style', 'cover', 'private', 'tools', 'desk'];
const LANGUAGES = ['en', 'es'];
const FPS = 25;
/** Still time at the end, to see how it ends before it starts again. */
const TAIL = 1500;
const OUT = 'docs/media';

const server = await createServer({ server: { port: 5199, strictPort: true } });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 450 }, deviceScaleFactor: 2 });
await mkdir(OUT, { recursive: true });

for (const lang of LANGUAGES) {
  for (const scene of SCENES) {
    await page.goto(`http://localhost:5199/scenes.html?capture&scene=${scene}&lang=${lang}`);
    await page.waitForFunction(() => window.__scene, null, { polling: 100 });
    const { duration } = await page.evaluate(() => window.__scene);
    const stage = page.locator('#stage');
    const frames = [];
    const step = 1000 / FPS;
    // Each step runs the clip's tick, then the engine's draw it asked for.
    const advance = (ms) => page.evaluate((ms) => (window.__advance(ms), window.__advance(0)), ms);
    await advance(0);
    for (let t = 0; t <= duration + 400; t += step) {
      frames.push(await stage.screenshot());
      await advance(step);
    }
    const last = frames.at(-1);
    for (let t = 0; t < TAIL; t += step) frames.push(last);
    const file = `${OUT}/${scene}.${lang}.webp`;
    await sharp(frames, { join: { animated: true } })
      .webp({ quality: 80, effort: 6, delay: Math.round(step), loop: 0 })
      .toFile(file);
    console.log(file, frames.length, 'frames');
  }
}

await browser.close();
await server.close();
