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
await page.waitForSelector(".exam-card", { timeout: 8000 });
await shot("1-home");

// Entrar a configuración
await page.click(".exam-card");
await page.waitForSelector(".mode-grid");
// modo práctica (feedback inmediato) — ya viene por defecto; elegir específica
await page.click('.segment button:has-text("Específica")');
await shot("2-setup");

// Empezar
await page.click(".btn-primary");
await page.waitForSelector(".q-stem");
await shot("3-runner");

// Responder la primera opción y ver feedback
await page.click(".options .opt >> nth=0");
await page.waitForSelector(".feedback");
await shot("4-feedback");

// Abrir rejilla
await page.click('.icon-btn');
await page.waitForSelector(".answer-grid");
await shot("5-grid");
// Finalizar desde la rejilla
await page.click('.grid-sheet .btn-ghost');
await page.waitForSelector(".score-big");
await shot("6-results");

const scoreText = await page.textContent(".score-big");
const gridCells = await page.$$eval(".answer-grid .cell", (els) => els.length);

console.log(JSON.stringify({
  ok: errors.length === 0,
  errors,
  scoreText,
  gridCells,
}, null, 2));

await browser.close();
