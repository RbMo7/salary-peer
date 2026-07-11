# Blind Peer (Relay) — Concept Plan

## Problem

Both peers must be online simultaneously for data to sync. If Alice submits at 9am and Bob opens the app at 6pm, Bob gets nothing — Alice's machine is off.

## Solution

A "blind peer" — a relay node that stays online 24/7, replicates all data, but **cannot read any of it**. It's an encrypted blob relay.

## How it works

```
Alice (online 9am)                    Blind Peer (always on)                Bob (online 6pm)
       │                                     │                                    │
       ├── submits salary ──────────────────→ │                                    │
       │   (encrypted Hypercore blocks)       │ stores encrypted blocks            │
       │                                      │                                    │
       │                                      │ ←──────────────── Bob connects ────┤
       │                                      │ ── serves encrypted blocks ──────→ │
       │                                      │                                    │
       │                                      │              Bob decrypts locally  │
```

The blind peer has **no encryption key**. It stores and serves raw encrypted Hypercore blocks. Only peers with the Autobase key + encryption key can read the data.

## Architecture

### What the blind peer IS
- A Node.js script (NOT Electron, NOT Bare)
- Runs on any VPS ($5/mo DigitalOcean, free Oracle Cloud, a Raspberry Pi)
- Joins the Hyperswarm topic for a given channel
- Replicates Corestore data (receives + serves blocks)
- Has NO Autobase, NO Hyperbee, NO `apply()` — it doesn't understand the data
- Stores blocks on disk in a local Corestore

### What the blind peer CANNOT do
- Read salary entries (no encryption key)
- Write salary entries (not an Autobase writer)
- Identify who submitted what (no writer key mapping)
- Modify data (Hypercore is append-only, cryptographically signed)

## Implementation

### File: `relay/index.js` (~20 lines)

```js
const Hyperswarm = require('hyperswarm')
const Corestore = require('corestore')

const key = Buffer.from(process.argv[2], 'hex')
const store = new Corestore('./relay-storage/' + process.argv[2].slice(0, 8))
const swarm = new Hyperswarm()

swarm.on('connection', conn => store.replicate(conn))
swarm.join(Buffer.alloc(32, key), { client: true, server: true })  // discoveryKey

process.on('SIGINT', async () => {
  await swarm.destroy()
  await store.close()
})
```

### Usage

```bash
# On any VPS or always-on machine
node relay/index.js <channel-discovery-key>
```

### What needs to change in the app

1. **Autobase encryption** — enable block-level encryption so the blind peer can't read data:
   ```js
   const base = new Autobase(store, bootstrap, {
     open, apply,
     valueEncoding: 'json',
     encryptionKey: derivedKey  // derived from channel key or a passphrase
   })
   ```

2. **Share discovery key, not base key** — the blind peer only needs the discovery key (topic to join on DHT). It never needs the Autobase key or encryption key.

3. **Relay command in the app** — add a UI button: "Copy relay command" → copies `node relay/index.js <discovery-key>` for the user to run on their server.

### Discovery key vs base key vs encryption key

| Key | Who has it | What it does |
|-----|-----------|-------------|
| Base key (`base.key`) | All peers who join the channel | Identifies the Autobase, needed to join |
| Discovery key (`base.discoveryKey`) | Everyone including blind peer | Topic for DHT lookup, derived from base key |
| Encryption key | Only real peers, NOT the blind peer | Encrypts/decrypts Hypercore blocks |

The blind peer only gets the discovery key → finds peers → replicates encrypted blocks → serves them. Zero knowledge of content.

## Dependencies

The relay script uses only:
- `hyperswarm` (already in project)
- `corestore` (already in project)

Can be published as a tiny standalone npm package or just a single file in the repo.

## Deployment options

| Option | Cost | Setup |
|--------|------|-------|
| DigitalOcean droplet | $4/mo | `npm install hyperswarm corestore && node relay.js <key>` |
| Oracle Cloud free tier | Free | Same |
| Raspberry Pi at home | One-time | Same |
| Docker container | Varies | Dockerfile: FROM node, COPY relay.js, CMD node relay.js |

## Security model

- Blind peer is **untrusted by design**
- Compromise of blind peer → attacker gets encrypted blobs, useless without encryption key
- Blind peer going offline → peers fall back to direct sync (existing behavior)
- Multiple blind peers → more availability, data stays synced across all
- Blind peer cannot inject fake salary entries → not an Autobase writer, Hypercore signatures prevent tampering

## Sequence of changes

1. Add `encryptionKey` to Autobase constructor in `workers/main.js`
2. Derive encryption key from a passphrase or from the channel key (both peers need same key)
3. Create `relay/index.js` — the blind peer script
4. Add `relay/package.json` with just hyperswarm + corestore deps
5. Add "Copy relay command" button to the UI
6. Update README with relay setup instructions
