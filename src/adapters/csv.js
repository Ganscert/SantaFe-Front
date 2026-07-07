// Utilidad CSV compartida (Dashboard, Historial de cobros, Plataforma).
// Separador ';' + BOM UTF-8: abre bien en Excel es-PE/es-DO sin asistente.
const SEP = ';'

export function csvEscape(value) {
  const s = value == null ? '' : String(value)
  if (s.includes('"') || s.includes(SEP) || s.includes('\n') || s.includes(',')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/** Construye el texto CSV a partir de headers[] y rows[][]. */
export function buildCSV(headers, rows) {
  return [headers, ...rows]
    .map((r) => r.map(csvEscape).join(SEP))
    .join('\n')
}

/** Dispara la descarga del CSV en el navegador (con BOM para Excel). */
export function downloadCSV(filename, csv) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Nombre de archivo con fecha: `prefijo-2026-07-06.csv` */
export function csvFilename(prefix) {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`
}
