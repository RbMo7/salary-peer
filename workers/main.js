const Hyperswarm = require('hyperswarm')
const Corestore = require('corestore')
const Autobase = require('autobase')
const Hyperbee = require('hyperbee')
const Protomux = require('protomux')
const c = require('compact-encoding')
const FramedStream = require('framed-stream')
const goodbye = require('graceful-goodbye')
const crypto = require('hypercore-crypto')
const path = require('bare-path')

console.log('Salary worker loading...')

const pipe = new FramedStream(Bare.IPC)

const argv = (i) => Bare.argv[i + 2]
const dir = argv(4) || path.join(require('bare-storage').persistent(), 'salary-tool')

let base = null
let swarm = null
let store = null

function randomId () {
  return crypto.randomBytes(16).toString('hex')
}

function send (msg) {
  pipe.write(JSON.stringify(msg))
}

function open (store) {
  return new Hyperbee(store.get('salary-view'), {
    keyEncoding: 'utf-8',
    valueEncoding: 'json'
  })
}

async function apply (nodes, view, host) {
  for (const node of nodes) {
    const val = node.value
    if (val.type === 'addWriter') {
      await host.addWriter(Buffer.from(val.key, 'hex'), { indexer: true })
    } else if (val.type === 'salary') {
      await view.put('salary/' + val.id, {
        role: val.role,
        level: val.level,
        location: val.location,
        salary: val.salary,
        currency: val.currency
      })
    }
  }
}

async function getStats (filters) {
  if (!base || !base.view) return send({ type: 'stats', data: null })

  await base.update()

  const entries = []
  for await (const entry of base.view.createReadStream({ gte: 'salary/', lt: 'salary0' })) {
    const v = entry.value
    if (filters.role && v.role.toLowerCase() !== filters.role.toLowerCase()) continue
    if (filters.level && v.level !== filters.level) continue
    if (filters.location && v.location.toLowerCase() !== filters.location.toLowerCase()) continue
    if (filters.currency && v.currency !== filters.currency) continue
    entries.push(v)
  }

  if (entries.length === 0) return send({ type: 'stats', data: { count: 0 } })

  const salaries = entries.map(e => e.salary).sort((a, b) => a - b)
  const count = salaries.length
  const sum = salaries.reduce((a, b) => a + b, 0)
  const avg = Math.round(sum / count)
  const median = count % 2 === 0
    ? Math.round((salaries[count / 2 - 1] + salaries[count / 2]) / 2)
    : salaries[Math.floor(count / 2)]
  const min = salaries[0]
  const max = salaries[count - 1]

  const roles = [...new Set(entries.map(e => e.role))]
  const levels = [...new Set(entries.map(e => e.level))]
  const locations = [...new Set(entries.map(e => e.location))]
  const currencies = [...new Set(entries.map(e => e.currency))]

  send({
    type: 'stats',
    data: { count, avg, median, min, max, roles, levels, locations, currencies }
  })
}

function setupWriterExchange (conn) {
  const mux = Protomux.from(conn)
  const channel = mux.createChannel({ protocol: 'salarypeer/writer-exchange' })
  const writerMsg = channel.addMessage({
    encoding: c.string,
    async onmessage (key) {
      // ponytail: if we're an indexer, add the requesting peer as a writer
      if (base && base.writable) {
        try {
          await base.append({ type: 'addWriter', key })
          console.log('Added writer:', key.slice(0, 8) + '...')
        } catch {}
      }
    }
  })
  channel.open()

  // announce our writer key to the peer
  if (base && base.local) {
    writerMsg.send(base.local.key.toString('hex'))
  }
}

async function start (bootstrapKey) {
  store = new Corestore(path.join(dir, 'salary-store'))
  swarm = new Hyperswarm()

  const bootstrap = bootstrapKey ? Buffer.from(bootstrapKey, 'hex') : null

  base = new Autobase(store, bootstrap, { open, apply, valueEncoding: 'json' })
  await base.ready()

  swarm.on('connection', (conn) => {
    store.replicate(conn)
    setupWriterExchange(conn)
  })

  swarm.join(base.discoveryKey)
  await swarm.flush()

  // creator adds self as first writer/indexer
  if (base.writable && !bootstrap) {
    await base.append({ type: 'addWriter', key: base.local.key.toString('hex') })
  }

  send({ type: 'ready', key: base.key.toString('hex'), writable: base.writable })
  console.log('Salary worker started. Key:', base.key.toString('hex'))

  // joiners: retry writable check after peers process the addWriter
  if (bootstrap && !base.writable) {
    const checkWritable = setInterval(async () => {
      try {
        await base.update()
        if (base.writable) {
          clearInterval(checkWritable)
          send({ type: 'writable' })
          console.log('Now writable!')
        }
      } catch {}
    }, 3000)
  }
}

console.log('Salary worker pipe ready, waiting for commands...')

pipe.on('data', async (data) => {
  try {
    console.log('Worker received:', data.toString())
    const cmd = JSON.parse(data.toString())

    if (cmd.type === 'create') {
      await start(null)
    } else if (cmd.type === 'join') {
      await start(cmd.key)
    } else if (cmd.type === 'submit') {
      if (!base) return send({ type: 'error', msg: 'Not connected' })
      await base.append({
        type: 'salary',
        id: randomId(),
        role: cmd.data.role,
        level: cmd.data.level,
        location: cmd.data.location,
        salary: Number(cmd.data.salary),
        currency: cmd.data.currency
      })
      send({ type: 'submitted' })
      await getStats({})
    } else if (cmd.type === 'getStats') {
      await getStats(cmd.filters || {})
    } else if (cmd.type === 'getKey') {
      if (base) send({ type: 'key', key: base.key.toString('hex') })
    }
  } catch (err) {
    console.error('Worker error:', err)
    send({ type: 'error', msg: err.message })
  }
})

goodbye(async () => {
  if (swarm) await swarm.destroy()
  if (base) await base.close()
  if (store) await store.close()
})
