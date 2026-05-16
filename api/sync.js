import Pusher from 'pusher'

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
  useTLS: true,
})

const CHANNEL = 'santa-fe-sync'
const ALLOWED = new Set([
  'sync:init',
  'sync:state',
  'sync:mesas',
  'sync:pedidos',
  'sync:tokens',
  'sync:reset',
])

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const body = req.body || {}
  const { type, socket_id, ...payload } = body

  if (!ALLOWED.has(type)) {
    return res.status(400).json({ error: 'Invalid event type' })
  }

  try {
    await pusher.trigger(CHANNEL, type, payload, socket_id ? { socket_id } : undefined)
    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('[api/sync] pusher.trigger failed:', e)
    return res.status(500).json({ error: 'Trigger failed' })
  }
}
