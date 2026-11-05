// Makes the website's link preview (web/public/og.<lang>.png, 1200×630, what LinkedIn and
// others show when the site is shared): `npm run og`. The page in it is the last frame of
// the engine's "draw" scene, taken like scripts/media.mjs does; the texts are the site's.
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const LANGUAGES = ['es', 'en'];
const STEP = 1000 / 25;

const server = await createServer({ server: { port: 5199, strictPort: true } });
await server.listen();
const { texts } = await server.ssrLoadModule('/web/src/i18n/index.ts');
const { BrandMark } = await server.ssrLoadModule('/src/ui/BrandMark.tsx');
const mark = renderToStaticMarkup(createElement(BrandMark, { size: 52 }));

// Embedded, because the card is set as the page's content (no address to load them from).
const font = async (path) =>
  `data:font/woff2;base64,${(await readFile(`node_modules/@fontsource-variable/${path}`)).toString('base64')}`;
const fonts = {
  title: await font('lora/files/lora-latin-wght-normal.woff2'),
  hand: await font('caveat/files/caveat-latin-wght-normal.woff2'),
  body: await font('nunito-sans/files/nunito-sans-latin-wght-normal.woff2'),
};

const browser = await chromium.launch();
const stage = await browser.newPage({
  viewport: { width: 800, height: 450 },
  deviceScaleFactor: 2,
});
const card = await browser.newPage({ viewport: { width: 1200, height: 630 } });

for (const lang of LANGUAGES) {
  await stage.goto(`http://localhost:5199/scenes.html?capture&scene=draw&lang=${lang}`);
  await stage.waitForFunction(() => window.__scene, null, { polling: 100 });
  const { duration } = await stage.evaluate(() => window.__scene);
  // Stepped like a recording: some of the scene's moves only happen frame by frame.
  for (let t = 0; t <= duration + 400; t += STEP) {
    await stage.evaluate((ms) => (window.__advance(ms), window.__advance(0)), STEP);
  }
  const page = (await stage.locator('#stage').screenshot()).toString('base64');
  const t = texts(lang);
  await card.setContent(html(t, page));
  await card.evaluate(() => document.fonts.ready);
  const file = `web/public/og.${lang}.png`;
  await card.screenshot({ path: file });
  console.log(file);
}

await browser.close();
await server.close();

/** The card: the website's hero (its wood and fonts, web/src/styles/global.css) and the page. */
function html(t, page) {
  return `<!doctype html>
<meta charset="utf-8" />
<style>
  @font-face { font-family: Lora; src: url(${fonts.title}); font-weight: 400 700; }
  @font-face { font-family: Caveat; src: url(${fonts.hand}); font-weight: 400 700; }
  @font-face { font-family: Nunito Sans; src: url(${fonts.body}); font-weight: 200 1000; }
  body {
    position: relative; width: 1200px; height: 630px; margin: 0; overflow: hidden;
    box-sizing: border-box; padding: 64px 0 0 72px;
    font-family: 'Nunito Sans'; color: #1d130a;
    background-color: rgb(202, 168, 126);
    background-image:
      repeating-linear-gradient(0deg, rgb(156 116 78 / 45%) 0 2px, transparent 2px 132px),
      repeating-linear-gradient(0deg, rgb(156 116 78 / 14%) 0 1px, transparent 1px 7px),
      repeating-linear-gradient(0deg, rgb(156 116 78 / 10%) 0 2px, transparent 2px 23px);
  }
  .brand { display: flex; align-items: center; gap: 14px; font: 600 40px Lora; letter-spacing: -0.02em; }
  .hand { margin-top: 44px; font: 500 40px Caveat; transform: rotate(-2deg); transform-origin: left; }
  h1 { width: 520px; margin: 6px 0 0; font: 500 68px/1.04 Lora; letter-spacing: -0.02em; }
  .chips { position: absolute; left: 72px; bottom: 56px; display: flex; gap: 12px; font-size: 21px; font-weight: 700; }
  .chips span { padding: 8px 16px; border-radius: 999px; background: rgb(255 250 242 / 88%); color: #23211d; }
  /* The scene's left page, from the cover's edge down (the desk above it is cut off). */
  .page {
    position: absolute; left: 640px; top: 96px; width: 720px; height: 448px;
    border-radius: 14px; transform: rotate(-4deg);
    box-shadow: 0 24px 40px rgb(40 20 5 / 38%);
    background: url(data:image/png;base64,${page}) 0 -52px / 900px auto no-repeat;
  }
</style>
<div class="brand">${mark}diaryo</div>
<div class="hand">${t.hero.tagline}</div>
<h1>${t.hero.title}</h1>
<div class="chips">${t.meta.image.chips.map((chip) => `<span>${chip}</span>`).join('')}</div>
<div class="page"></div>`;
}
