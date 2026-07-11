#!/usr/bin/env node
/**
 * SalaryPeer blind relay — stores and serves encrypted blocks, reads nothing.
 * Usage: node relay/index.js <discovery-key>
 */
const Hyperswarm = require('hyperswarm')
const Corestore = require('corestore')
const path = require('path')
const os = require('os')

const discoveryKeyHex = process.argv[2]

if (!discoveryKeyHex || discoveryKeyHex.length !== 64) {
  console.error('Usage: node relay/index.js <discovery-key-hex>')
  console.error('Get the discovery key from the "Copy Relay Command" button in the app.')
  process.exit(1)
}

const discoveryKey = Buffer.from(discoveryKeyHex, 'hex')
const storageDir = path.join(os.homedir(), '.salarypeer-relay', discoveryKeyHex.slice(0, 8))

const store = new Corestore(storageDir)
const swarm = new Hyperswarm()

swarm.on('connection', (conn) => {
  console.log('Peer connected:', conn.remotePublicKey.toString('hex').slice(0, 8) + '...')
  store.replicate(conn)
  conn.on('close', () => console.log('Peer disconnected'))
})

swarm.join(discoveryKey, { client: true, server: true })

swarm.flush().then(() => {
  console.log('Relay active. Discovery key:', discoveryKeyHex.slice(0, 16) + '...')
  console.log('Storage:', storageDir)
  console.log('Waiting for peers...')
})

process.on('SIGINT', async () => {
  console.log('\nShutting down relay...')
  await swarm.destroy()
  await store.close()
  process.exit(0)
})
