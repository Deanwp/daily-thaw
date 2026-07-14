import {requestExpandedMode} from '@devvit/web/client'
import {fetchDaily} from './fetch.ts'
import {ART} from './atlas.ts'

// Start button -> expand into the game entrypoint
const startBtn = document.getElementById('start-btn') as HTMLButtonElement
startBtn.addEventListener('click', ev => requestExpandedMode(ev, 'game'))

// penguin sprite from the shared atlas
const peng = document.getElementById('peng') as HTMLImageElement
peng.src = (ART as Record<string, string>).penguin

// Pull today's puzzle number + ice tier so the splash sells the daily hook.
const names = ['', 'STIFF', 'FIRM', 'GLASSY', 'SLICK', 'GREASED']
void (async () => {
  const rsp = await fetchDaily()
  if (!rsp) return
  const p = document.getElementById('puzzle')
  const ice = document.getElementById('ice')
  if (p) p.textContent = '#' + String(rsp.puzzle).padStart(3, '0')
  if (ice) {
    const lvl = rsp.board.iceLvl
    ice.textContent = 'ICE ' + '\u2588'.repeat(lvl) + '\u2591'.repeat(5 - lvl) + '  ' + (names[lvl] || '')
  }
})()