// Siembra la carta (platos con imagen) POR RESTAURANTE. Idempotente:
// - si el plato ya existe (mismo nombre, no eliminado) → actualiza imagen/precio,
// - si no existe → lo inserta.
// Uso:  node scripts/seed-menu.mjs        (desde Frontend/)
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = {}
for (const line of readFileSync('./.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2]
}
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

// Cartas por restaurante (nombre exacto en la tabla `restaurantes`).
const MENUS = {
  'Santa fe': [
    ['Ceviche mixto',   'Entrada',         28, '/menu/ceviche.jpg',        ['Pescado blanco', 'Camarones', 'Limón', 'Cebolla morada', 'Culantro']],
    ['Causa limeña',    'Entrada',         18, '/menu/causa-limena.svg',   ['Papa amarilla', 'Ají amarillo', 'Palta', 'Pollo']],
    ['Anticuchos',      'Entrada',         22, '/menu/anticuchos.jpg',     ['Corazón de res', 'Ají panca', 'Ajo', 'Papas']],
    ['Lomo saltado',    'Plato Principal', 32, '/menu/lomo-saltado.jpg',   ['Lomo de res', 'Cebolla', 'Tomate', 'Papas fritas', 'Arroz']],
    ['Ají de gallina',  'Plato Principal', 26, '/menu/aji-gallina.jpg',    ['Pollo', 'Ají amarillo', 'Pan', 'Leche', 'Nueces']],
    ['Arroz chaufa',    'Plato Principal', 24, '/menu/chaufa.jpg',         ['Arroz', 'Pollo', 'Huevo', 'Cebolla china', 'Sillao']],
    ['Suspiro limeño',  'Postre',          14, '/menu/suspiro-limeno.svg', ['Manjar blanco', 'Merengue', 'Oporto', 'Canela']],
    ['Chicha morada',   'Bebida',           8, '/menu/chicha-morada.svg',  ['Maíz morado', 'Piña', 'Canela', 'Clavo', 'Limón']],
  ],
  'Miami Bracho': [
    ['Tostones',            'Entrada',         9, '/menu/tostones.svg',           ['Plátano verde', 'Ajo', 'Sal']],
    ['Camarones al ajillo', 'Entrada',        16, '/menu/camarones-al-ajillo.svg',['Camarones', 'Ajo', 'Mantequilla', 'Perejil']],
    ['Ropa vieja',          'Plato Principal',24, '/menu/ropa-vieja.svg',         ['Falda de res', 'Pimientos', 'Tomate', 'Arroz', 'Frijoles']],
    ['Churrasco',           'Plato Principal',30, '/menu/churrasco.svg',          ['Bistec', 'Chimichurri', 'Yuca frita']],
    ['Mofongo',             'Plato Principal',22, '/menu/mofongo.svg',            ['Plátano', 'Chicharrón', 'Ajo', 'Caldo']],
    ['Flan de coco',        'Postre',         12, '/menu/flan-de-coco.svg',       ['Coco', 'Leche', 'Huevo', 'Caramelo']],
    ['Key lime pie',        'Postre',         13, '/menu/key-lime-pie.svg',       ['Limón', 'Leche condensada', 'Galleta']],
    ['Mojito',              'Bebida',         10, '/menu/mojito.svg',             ['Ron', 'Hierbabuena', 'Limón', 'Soda']],
  ],
}

const { data: restaurantes, error: eRest } = await sb.from('restaurantes').select('id, nombre')
if (eRest) { console.error('No se pudieron leer restaurantes:', eRest.message); process.exit(1) }

let insertados = 0, actualizados = 0, saltados = 0
for (const [nombreRest, platos] of Object.entries(MENUS)) {
  const rest = restaurantes.find(r => r.nombre.trim().toLowerCase() === nombreRest.toLowerCase())
  if (!rest) { console.warn(`⚠ Restaurante "${nombreRest}" no encontrado, se omite.`); continue }
  console.log(`\n🍽  ${nombreRest} (${rest.id})`)
  for (const [nombre, categoria, precio, imagen_url, ingredientes] of platos) {
    const { data: existente, error: eSel } = await sb.from('platos')
      .select('id').eq('restaurante_id', rest.id).eq('nombre', nombre).is('eliminado_en', null).maybeSingle()
    if (eSel) { console.warn('  ✗', nombre, eSel.message); saltados++; continue }
    if (existente) {
      const { error } = await sb.from('platos').update({ precio, imagen_url, categoria, ingredientes, disponible: true })
        .eq('id', existente.id)
      if (error) { console.warn('  ✗ update', nombre, error.message); saltados++ }
      else { console.log('  ↻', nombre, '→', imagen_url); actualizados++ }
    } else {
      const { error } = await sb.from('platos')
        .insert({ restaurante_id: rest.id, nombre, precio, imagen_url, categoria, ingredientes, disponible: true })
      if (error) { console.warn('  ✗ insert', nombre, error.message); saltados++ }
      else { console.log('  +', nombre, '→', imagen_url); insertados++ }
    }
  }
}
console.log(`\n✔ Listo — insertados: ${insertados}, actualizados: ${actualizados}, saltados: ${saltados}`)
