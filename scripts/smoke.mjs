// End-to-end smoke: builds must already exist in dist/ (`pnpm build`).
// It opens the actual browser game, moves Hollow, exercises the note/noise/Rest puzzle,
// enters the Evening Minute and reaches the playable slice ending. Screenshots go to ./shots/.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const port = 4300 + Math.floor(Math.random() * 500)
const url = `http://127.0.0.1:${port}/`
const out = process.env.SHOTS_DIR ?? 'shots'
mkdirSync(out, { recursive: true })
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' })
let browser
const guard = setTimeout(() => fail('timed out'), 120_000)
function cleanup() { clearTimeout(guard); try { server.kill('SIGTERM') } catch {} }
async function fail(message) {
  console.error(`smoke: FAIL — ${message}`)
  await browser?.close().catch(() => {}); cleanup(); process.exit(1)
}
async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try { if ((await fetch(url)).ok) return } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('preview server did not start')
}
async function openGame(context, errors) {
  const page = await context.newPage()
  page.on('console', message => message.type() === 'error' && errors.push(message.text()))
  page.on('pageerror', error => errors.push(String(error)))
  page.on('response', response => response.status() >= 400 && errors.push(`HTTP ${response.status()} ${response.url()}`))
  await page.goto(url)
  await page.waitForSelector('[data-screen="title"].is-active', { timeout: 30_000 })
  await page.evaluate(async () => {
    await document.fonts.ready
    const family = getComputedStyle(document.querySelector('.wordmark h1')).fontFamily
    if (!family.startsWith('ManusCC0')) throw new Error(`Unexpected game font: ${family}`)
    if (document.documentElement.lang !== 'en') throw new Error(`Expected the prototype to stay in English, got ${document.documentElement.lang}`)
  })
  await page.waitForTimeout(500)
  return page
}
const state = page => page.evaluate(() => {
  const { game } = window.__game
  const p = game.player.position
  return { mode: game.mode, progress: game.puzzleProgress, noise: game.puzzleNoise, pos: { x: p.x, y: p.y, z: p.z } }
})
const settle = ms => new Promise(resolve => setTimeout(resolve, ms))
async function pressAction(page, action) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.evaluate(action => window.__game.input.setTouchButton(action, true), action)
    await page.waitForTimeout(300)
    const pending = await page.evaluate(action => window.__game.input.pressed(action), action)
    await page.evaluate(action => window.__game.input.setTouchButton(action, false), action)
    if (!pending) { await page.waitForTimeout(160); return }
    await page.waitForTimeout(180)
  }
  throw new Error(`the ${action} edge was not consumed by the game loop`)
}

try {
  await waitForServer()
  const executablePath = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].find(existsSync)
  if (!executablePath) throw new Error('No Chromium executable found')
  browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'] })
  const errors = []
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US' })
  const page = await openGame(desktop, errors)
  await page.screenshot({ path: `${out}/01-title.png` })

  await page.click('[data-action="settings"]')
  await page.waitForSelector('[data-screen="settings"].is-active')
  await page.locator('input[name="masterVolume"]').evaluate(el => { el.value = '0.45'; el.dispatchEvent(new Event('input', { bubbles: true })) })
  await page.click('.toggle[data-setting="muted"]')
  const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('game3d.save')))
  if (settings.masterVolume !== 0.45 || settings.muted !== true) throw new Error('master volume/mute did not persist')
  await page.screenshot({ path: `${out}/02-settings.png` })
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-screen="title"].is-active')

  await page.click('[data-action="play"]')
  await page.waitForSelector('[data-screen="hud"].is-active')
  const before = await state(page)
  await page.evaluate(() => window.__game.input.setTouchMove(0, 1)); await page.waitForTimeout(850)
  await page.evaluate(() => window.__game.input.setTouchMove(0, 0))
  await page.waitForTimeout(200)
  const after = await state(page)
  if (after.mode !== 'playing') throw new Error(`expected playing, got ${after.mode}`)
  if (Math.hypot(after.pos.x - before.pos.x, after.pos.z - before.pos.z) < 2) throw new Error('Hollow barely moved')
  await page.screenshot({ path: `${out}/03-strung-district.png` })

  // Fast deterministic interaction placement after the real walk test, using the project's own
  // teleport helper; all prompts, input presses, game rules and object responses still run live.
  await page.evaluate(() => {
    const game = window.__game.game
    const source = game.world.interactables.find(item => item.id === 'source')
    game.player.teleport({ x: source.position.x, y: 1.25, z: source.position.z })
  })
  await page.waitForSelector('.interaction-prompt.is-visible')
  await pressAction(page, 'interact')
  const noteText = await page.locator('[data-slot="note"]').textContent()
  if (!noteText?.includes('Sa')) {
    const debug = await page.evaluate(() => {
      const game = window.__game.game, p = game.player.position
      return { mode: game.mode, progress: game.puzzleProgress, noise: game.puzzleNoise, pos: { x: p.x, y: p.y, z: p.z }, note: document.querySelector('[data-slot="note"]')?.textContent, prompt: document.querySelector('.interaction-prompt')?.textContent }
    })
    throw new Error(`the note source did not lend Sa: ${JSON.stringify(debug)}`)
  }

  await page.evaluate(() => {
    const game = window.__game.game
    game.player.teleport({ x: 2.6, y: 1.25, z: -4.7 })
  })
  await pressAction(page, 'interact')
  await pressAction(page, 'interact')
  const latchState = await state(page)
  if (latchState.progress !== 2) {
    const prompt = await page.locator('.interaction-prompt').textContent()
    throw new Error(`forced latch strikes did not advance progress: ${JSON.stringify({ ...latchState, prompt })}`)
  }
  if ((await state(page)).noise < 0.58) throw new Error('forced resonance failed to accumulate strain')
  await page.screenshot({ path: `${out}/04-strained-latch.png` })
  await pressAction(page, 'interact')
  if ((await state(page)).progress !== 2) throw new Error('an unstable latch accepted another forced strike')
  await pressAction(page, 'rest')
  if ((await state(page)).noise > 0.05) throw new Error('Rest did not clear local noise')
  await pressAction(page, 'interact')
  if (!(await page.locator('.resonance-caption').textContent()).includes('open')) throw new Error('the latch did not open after recovery')

  await page.evaluate(() => window.__game.game.player.teleport({ x: 2.2, y: 1.25, z: -19 }))
  await page.waitForTimeout(13_000)
  const quietState = await page.evaluate(() => {
    const game = window.__game.game
    return { mode: game.mode, quietStarted: game.quietStarted, quietDone: game.narrativeComplete, timer: game.quietTimer, objective: document.querySelector('[data-slot="objective"]')?.textContent }
  })
  if (!quietState.objective?.includes('Inspect the broken resonance trace')) throw new Error(`the Evening Minute did not return control with its objective: ${JSON.stringify(quietState)}`)
  await page.screenshot({ path: `${out}/05-evening-minute.png` })
  await page.evaluate(() => window.__game.game.player.teleport({ x: 0, y: 1.25, z: -26.2 }))
  await page.waitForSelector('.interaction-prompt.is-visible')
  await pressAction(page, 'interact')
  await page.waitForSelector('[data-screen="ending"].is-active')
  await page.screenshot({ path: `${out}/06-ending.png` })
  if ((await state(page)).mode !== 'ended') throw new Error('prototype ending did not complete')

  await page.click('[data-screen="ending"] [data-action="restart"]')
  await page.waitForSelector('[data-screen="hud"].is-active')
  if ((await state(page)).progress !== 0) throw new Error('restarting did not reset the puzzle')
  await page.click('[data-screen="hud"] [data-action="pause"]')
  await page.waitForSelector('[data-screen="pause"].is-active')
  await page.screenshot({ path: `${out}/07-pause.png` })
  await page.click('[data-screen="pause"] [data-action="resume"]')
  await page.waitForSelector('[data-screen="hud"].is-active')
  await desktop.close()

  const mobile = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-GB' })
  const phone = await openGame(mobile, errors)
  await phone.tap('[data-action="play"]')
  await phone.waitForSelector('[data-screen="hud"].is-active')
  await phone.waitForTimeout(700)
  await phone.screenshot({ path: `${out}/08-mobile-hud.png` })
  if (errors.length) throw new Error(`browser errors:\n  ${errors.join('\n  ')}`)
  await mobile.close(); await browser.close(); cleanup()
  console.log(`smoke: OK — movement, settings, Sa, strain/Rest recovery, Evening Minute, ending and restart; screenshots in ${out}/`)
} catch (error) { await fail(error?.message ?? String(error)) }
