# SalaryPeer

Anonymous, peer-to-peer salary transparency. No servers. No accounts. No one can shut it down.

Workers at the same company share a secret channel key. Everyone submits their salary anonymously. Everyone sees the stats. No HR department can subpoena it, no company can take it down — because there's nothing to take down.

## How it works

```
You  ←──P2P──→  Colleague A  ←──P2P──→  Colleague B
         ↓
   Encrypted DHT (Hyperswarm)
   No central server
   Data lives on peers only
```

1. **Create a channel** — generates a unique key
2. **Share the key** privately (Signal, Slack DM, in person)
3. **Submit your salary** — role, level, location, compensation
4. **See aggregate stats** — average, median, min, max, range
5. **Filter** by role, level, location, or currency

Every submission is anonymous. No identity is attached to entries. Data syncs directly between peers over encrypted connections using the [Holepunch](https://holepunch.to) stack.

## Tech stack

- **Electron** — desktop app shell
- **Pear Runtime** — embedded P2P runtime ([Bare](https://github.com/nicolo-ribaudo/bare) under the hood)
- **Autobase** — multi-writer consensus (every peer can write, deterministic merge)
- **Hyperbee** — P2P key-value database (stores salary entries)
- **Hyperswarm** — peer discovery over DHT (finds peers by channel key)
- **Corestore** — manages Hypercore storage and replication

No servers. No databases. No cloud. Just peers.

## Quick start

```bash
git clone https://github.com/RbMo7/salarypeer.git
cd salarypeer
npm install
pear touch          # generates an upgrade key (one-time)
npm start
```

## Test with two peers locally

```bash
# Terminal 1
npm start

# Terminal 2 — simulates a second peer
npx electron-forge start -- --no-updates --storage /tmp/peer2
```

Create a channel in one instance, copy the key, join from the other.

## Architecture

```
┌─────────────────────────────────────────────┐
│ Renderer (browser, sandboxed)               │
│  Landing screen → Create / Join channel     │
│  Main screen → Submit salary, view stats    │
└──────────────────┬──────────────────────────┘
                   │ Electron IPC
┌──────────────────▼──────────────────────────┐
│ Main Process                                │
│  Spawns worker, forwards IPC                │
└──────────────────┬──────────────────────────┘
                   │ FramedStream (stdin/stdout)
┌──────────────────▼──────────────────────────┐
│ Worker (Bare runtime)                       │
│  Autobase + Hyperbee + Hyperswarm           │
│  Handles salary CRUD + stats aggregation    │
└──────────────────┬──────────────────────────┘
                   │ Hyperswarm DHT
              P2P network
```

## Privacy model

- No accounts, no login, no identity
- Entries contain only: role, level, location, salary, currency
- Random IDs — not derived from writer keys
- No timestamps shown in UI
- Data never touches a server — peers sync directly

## Based on

Forked from [hello-pear-electron](https://github.com/holepunchto/hello-pear-electron) — the official Pear + Electron boilerplate by Holepunch.

## License

Apache-2.0
