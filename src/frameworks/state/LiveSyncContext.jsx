/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import Pusher from 'pusher-js'
import { authToken } from '../../adapters/db.js'

const LiveSyncContext = createContext(null)

export const useLiveSync = () => useContext(LiveSyncContext)

const PUSHER_KEY = import.meta.env.VITE_PUSHER_KEY
const PUSHER_CLUSTER = import.meta.env.VITE_PUSHER_CLUSTER
const CHANNEL = 'santa-fe-sync'

export const LiveSyncProvider = ({ children }) => {
  const [connected, setConnected] = useState(false)
  const [serverState, setServerState] = useState(null)
  const socketIdRef = useRef(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!PUSHER_KEY || !PUSHER_CLUSTER) {
      console.warn('[LiveSync] VITE_PUSHER_KEY/VITE_PUSHER_CLUSTER no definidos — sync desactivado.')
      return
    }

    const pusher = new Pusher(PUSHER_KEY, { cluster: PUSHER_CLUSTER })

    pusher.connection.bind('connected', () => {
      socketIdRef.current = pusher.connection.socket_id
      setConnected(true)
    })
    pusher.connection.bind('disconnected', () => setConnected(false))
    pusher.connection.bind('error', () => setConnected(false))
    pusher.connection.bind('unavailable', () => setConnected(false))

    const channel = pusher.subscribe(CHANNEL)

    // sync:init y sync:state traen el objeto state completo
    const handleStateEvent = (data) => {
      if (data?.state) setServerState((prev) => ({ ...(prev || {}), ...data.state }))
    }
    channel.bind('sync:init', handleStateEvent)
    channel.bind('sync:state', handleStateEvent)

    channel.bind('sync:mesas', (data) => {
      if (Array.isArray(data?.mesas)) {
        setServerState((prev) => ({ ...(prev || {}), mesas: data.mesas }))
      }
    })
    channel.bind('sync:pedidos', (data) => {
      if (Array.isArray(data?.pedidos)) {
        setServerState((prev) => ({ ...(prev || {}), pedidos: data.pedidos }))
      }
    })
    channel.bind('sync:tokens', (data) => {
      if (Array.isArray(data?.tokens)) {
        setServerState((prev) => ({ ...(prev || {}), tokens: data.tokens }))
      }
    })
    channel.bind('sync:platos', (data) => {
      if (Array.isArray(data?.platos)) {
        setServerState((prev) => ({ ...(prev || {}), platos: data.platos }))
      }
    })
    channel.bind('sync:reset', () => {
      setServerState({ mesas: [], pedidos: [], tokens: [] })
    })
    // Notifica a clientes/cajero que se registró un cobro para una mesa.
    // Se usa para que la vista del cliente haga hard-reset sin esperar polling.
    channel.bind('sync:pago', (data) => {
      if (!data?.mesa_id) return
      setServerState((prev) => ({
        ...(prev || {}),
        lastPago: { mesa_id: data.mesa_id, at: data.at || Date.now() },
      }))
    })

    return () => {
      channel.unbind_all()
      pusher.unsubscribe(CHANNEL)
      pusher.disconnect()
    }
  }, [])

  const sendMessage = useCallback(async (message) => {
    if (!PUSHER_KEY) return
    try {
      const token = authToken()
      await fetch('/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ...message, socket_id: socketIdRef.current }),
        keepalive: true,
      })
    } catch (e) {
      console.error('[LiveSync] send failed:', e)
    }
  }, [])

  return (
    <LiveSyncContext.Provider value={{ connected, serverState, sendMessage }}>
      {children}
    </LiveSyncContext.Provider>
  )
}
