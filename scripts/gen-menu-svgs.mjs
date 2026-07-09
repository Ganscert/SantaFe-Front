// Genera imágenes SVG autocontenidas para platos sin fotografía real.
// Cada tarjeta = degradado por categoría + emoji grande + nombre del plato.
// Salida: public/menu/<slug>.svg   (uso: node scripts/gen-menu-svgs.mjs)
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'menu')
mkdirSync(OUT, { recursive: true })

const GRAD = {
  Entrada:          ['#0EA5E9', '#0F766E'],
  'Plato Principal':['#6366F1', '#4338CA'],
  Postre:           ['#F472B6', '#B45309'],
  Bebida:           ['#22D3EE', '#2563EB'],
}
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

// [nombre, categoria, emoji]
const DISHES = [
  // Santa fe (peruano) — complementos sin foto
  ['Causa limeña', 'Entrada', '🥔'],
  ['Suspiro limeño', 'Postre', '🍮'],
  ['Chicha morada', 'Bebida', '🥤'],
  // Miami Bracho — carta caribeña/internacional
  ['Ropa vieja', 'Plato Principal', '🥩'],
  ['Churrasco', 'Plato Principal', '🍖'],
  ['Mofongo', 'Plato Principal', '🍲'],
  ['Tostones', 'Entrada', '🍌'],
  ['Camarones al ajillo', 'Entrada', '🦐'],
  ['Flan de coco', 'Postre', '🍮'],
  ['Key lime pie', 'Postre', '🥧'],
  ['Mojito', 'Bebida', '🍹'],
]

function svg(nombre, categoria, emoji) {
  const [a, b] = GRAD[categoria] || GRAD['Plato Principal']
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400" role="img" aria-label="${esc(nombre)}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${a}"/>
      <stop offset="1" stop-color="${b}"/>
    </linearGradient>
  </defs>
  <rect width="600" height="400" fill="url(#g)"/>
  <circle cx="500" cy="70" r="120" fill="#ffffff" opacity="0.10"/>
  <circle cx="90" cy="330" r="90" fill="#ffffff" opacity="0.08"/>
  <text x="300" y="215" font-size="150" text-anchor="middle" dominant-baseline="middle">${emoji}</text>
  <rect x="0" y="315" width="600" height="85" fill="#0f172a" opacity="0.28"/>
  <text x="300" y="368" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif"
        font-size="34" font-weight="700" fill="#ffffff" letter-spacing="0.5">${esc(nombre)}</text>
</svg>`
}

for (const [nombre, categoria, emoji] of DISHES) {
  const file = resolve(OUT, `${slug(nombre)}.svg`)
  writeFileSync(file, svg(nombre, categoria, emoji))
  console.log('✓', `public/menu/${slug(nombre)}.svg`)
}
console.log(`\n${DISHES.length} imágenes generadas en public/menu/`)
