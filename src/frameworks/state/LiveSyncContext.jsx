/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useRef, useState } from 'react'

const LiveSyncContext = createContext(null)

export const useLiveSync = () => useContext(LiveSyncContext)

export const LiveSyncProvider = ({ children }) => {
  const [connected, setConnected] = useState(false)
  const [serverState, setServerState] = useState(null)
  const wsRef = useRef(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${protocol}://${window.location.host}/live-sync`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.addEventListener('open', () => setConnected(true))
    ws.addEventListener('close', () => setConnected(false))
    ws.addEventListener('error', () => setConnected(false))

    ws.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data)
        if (message.type === 'sync:state' && message.state) {
          setServerState(message.state)
        }
      } catch {
        // ignore invalid websocket payloads
      }
    })

    return () => {
      ws.close()
    }
  }, [])

  const sendMessage = (message) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify(message))
  }

  return (
    <LiveSyncContext.Provider value={{ connected, serverState, sendMessage }}>
      {children}
    </LiveSyncContext.Provider>
  )
}
