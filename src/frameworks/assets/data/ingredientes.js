const ingredientes = [
  {
    nombre: 'Ceviche mixto',
    precio: 28.00,
    categoria: 'Entrada',
    imagen: new URL('../menu/ceviche.jpg', import.meta.url).href,
    ingredientes: [
      'Pescado blanco fresco', 'Camarones', 'Jugo de limón',
      'Ají limo', 'Cebolla morada', 'Culantro', 'Choclo'
    ]
  },
  {
    nombre: 'Lomo saltado',
    precio: 32.00,
    categoria: 'Plato Principal',
    imagen: new URL('../menu/lomo-saltado.jpg', import.meta.url).href,
    ingredientes: [
      'Lomo de res', 'Cebolla roja', 'Tomate', 'Salsa de soja',
      'Ají amarillo', 'Papas fritas', 'Cilantro'
    ]
  },
  {
    nombre: 'Ají de gallina',
    precio: 26.00,
    categoria: 'Plato Principal',
    imagen: new URL('../menu/aji-gallina.jpg', import.meta.url).href,
    ingredientes: [
      'Pechuga de pollo', 'Ají amarillo', 'Pan remojado',
      'Leche evaporada', 'Queso fresco', 'Nuez moscada', 'Huevos duros'
    ]
  },
  {
    nombre: 'Anticuchos',
    precio: 22.00,
    categoria: 'Entrada',
    imagen: new URL('../menu/anticuchos.jpg', import.meta.url).href,
    ingredientes: [
      'Corazón de res', 'Ajo', 'Ají panca',
      'Vinagre', 'Comino', 'Papas', 'Salsa de ají'
    ]
  },
  {
    nombre: 'Arroz chaufa',
    precio: 24.00,
    categoria: 'Plato Principal',
    imagen: new URL('../menu/chaufa.jpg', import.meta.url).href,
    ingredientes: [
      'Arroz cocido', 'Pollo', 'Huevo', 'Cebolla china',
      'Salsa de soja', 'Jengibre', 'Aceite de ajonjolí'
    ]
  }
]

export default ingredientes
