// Prueba de humo end-to-end con Playwright (tamaño iPhone).
import { chromium } from "playwright";

const OUT = process.env.OUT || "/tmp/shots";
const BASE = "http://localhost:4173/";

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

async function shot(name) { await page.screenshot({ path: `${OUT}/${name}.png` }); }

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector(".big-mode", { timeout: 8000 });
await shot("1-landing");

// La lista de exámenes cuelga del modo "Examen" de la landing.
await page.click('.big-mode:has-text("Examen")');
await page.waitForSelector(".exam-card");
await shot("2-examenes");

// Entrar a configuración
await page.click(".exam-card");
await page.waitForSelector(".mode-grid");
// modo práctica (feedback inmediato) ya viene por defecto. Si el examen tiene
// parte específica se elige; los de una sola parte no ofrecen ese botón.
const especifica = await page.$('.segment button:has-text("Específica")');
if (especifica) await especifica.click();
await shot("3-setup");

// Empezar
await page.click(".btn-primary");
await page.waitForSelector(".q-stem");
await shot("4-runner");

// Responder la primera opción y ver feedback
await page.click(".options .opt >> nth=0");
await page.waitForSelector(".feedback");
await shot("5-feedback");

// Abrir rejilla
await page.click('.icon-btn');
await page.waitForSelector(".answer-grid");
await shot("6-grid");
// Finalizar desde la rejilla
await page.click('.grid-sheet .btn-ghost');
await page.waitForSelector(".score-big");
await shot("7-results");

const scoreText = await page.textContent(".score-big");
const gridCells = await page.$$eval(".answer-grid .cell", (els) => els.length);

console.log(JSON.stringify({
  ok: errors.length === 0,
  errors,
  scoreText,
  gridCells,
}, null, 2));

await browser.close();
