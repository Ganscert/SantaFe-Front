import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { WebSocketServer } from 'ws'

const defaultMesas = [
  { id: 'mesa-1', numeroMesa: 1, capacidad: 4, estado: 'disponible' },
  { id: 'mesa-2', numeroMesa: 2, capacidad: 2, estado: 'disponible' },
  { id: 'mesa-3', numeroMesa: 3, capacidad: 6, estado: 'disponible' },
  { id: 'mesa-4', numeroMesa: 4, capacidad: 4, estado: 'disponible' },
  { id: 'mesa-5', numeroMesa: 5, capacidad: 8, estado: 'disponible' },
  { id: 'mesa-6', numeroMesa: 6, capacidad: 2, estado: 'disponible' },
]

let syncState = {
  mesas: defaultMesas,
  pedidos: [],
  tokens: [],
}

const broadcastState = (wss) => {
  const payload = JSON.stringify({ type: 'sync:state', state: syncState })
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) client.send(payload)
  })
}

// Merge por id: incoming reemplaza/agrega; los actuales que no aparezcan se conservan.
// Necesario para acumular en multi-cliente — antes el último envío reemplazaba todo y se perdían pedidos previos.
const mergeById = (current, incoming) => {
  const map = new Map(current.map(x => [x.id, x]))
  for (const item of incoming) {
    if (item && item.id != null) map.set(item.id, item)
  }
  return [...map.values()]
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'live-sync-ws',
      configureServer(server) {
        const wss = new WebSocketServer({ noServer: true })

        server.httpServer.on('upgrade', (request, socket, head) => {
          if (request.url === '/live-sync') {
            wss.handleUpgrade(request, socket, head, (ws) => {
              wss.emit('connection', ws, request)
            })
          }
        })

        wss.on('connection', (ws) => {
          ws.send(JSON.stringify({ type: 'sync:state', state: syncState }))

          ws.on('message', (message) => {
            try {
              const data = JSON.parse(message.toString())

              if (data.type === 'sync:init' || data.type === 'sync:state') {
                if (data.state) {
                  syncState = {
                    mesas:   Array.isArray(data.state.mesas)   ? mergeById(syncState.mesas,   data.state.mesas)   : syncState.mesas,
                    pedidos: Array.isArray(data.state.pedidos) ? mergeById(syncState.pedidos, data.state.pedidos) : syncState.pedidos,
                    tokens:  Array.isArray(data.state.tokens)  ? mergeById(syncState.tokens,  data.state.tokens)  : syncState.tokens,
                  }
                  broadcastState(wss)
                }
              }

              if (data.type === 'sync:mesas' && Array.isArray(data.mesas)) {
                syncState = { ...syncState, mesas: mergeById(syncState.mesas, data.mesas) }
                broadcastState(wss)
              }

              if (data.type === 'sync:pedidos' && Array.isArray(data.pedidos)) {
                syncState = { ...syncState, pedidos: mergeById(syncState.pedidos, data.pedidos) }
                broadcastState(wss)
              }

              if (data.type === 'sync:tokens' && Array.isArray(data.tokens)) {
                syncState = { ...syncState, tokens: mergeById(syncState.tokens, data.tokens) }
                broadcastState(wss)
              }

              if (data.type === 'sync:reset') {
                syncState = { mesas: defaultMesas, pedidos: [], tokens: [] }
                broadcastState(wss)
              }
            } catch (error) {
              console.error('live-sync-ws error:', error)
            }
          })
        })
      },
    },
  ],
  server: {
    host: true,
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
    strictPort: !!process.env.PORT,
    allowedHosts: ['t42v4rjh-5173.use2.devtunnels.ms'],
  },
})