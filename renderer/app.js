const bridge = window.bridge
const decoder = new TextDecoder('utf-8')
const WORKER = '/workers/main.js'

const $ = (id) => document.getElementById(id)

function sendCmd (cmd) {
  console.log('[sendCmd]', cmd)
  bridge.writeWorkerIPC(WORKER, JSON.stringify(cmd))
}

function showScreen (id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'))
  $(id).classList.add('active')
}

function renderStats (data) {
  const container = $('stats-container')

  if (!data || data.count === 0) {
    container.innerHTML = '<div class="min-entries-warning">No entries yet. Be the first to submit!</div>'
    return
  }


  container.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="value">${data.count}</div><div class="label">Entries</div></div>
      <div class="stat-card"><div class="value">${fmt(data.avg)}</div><div class="label">Average</div></div>
      <div class="stat-card"><div class="value">${fmt(data.median)}</div><div class="label">Median</div></div>
      <div class="stat-card"><div class="value">${fmt(data.min)}</div><div class="label">Minimum</div></div>
      <div class="stat-card"><div class="value">${fmt(data.max)}</div><div class="label">Maximum</div></div>
      <div class="stat-card"><div class="value">${fmt(data.max - data.min)}</div><div class="label">Range</div></div>
    </div>
  `

  updateFilterOptions(data)
}

function fmt (n) {
  if (n == null) return '-'
  return n.toLocaleString()
}

function updateFilterOptions (data) {
  populateSelect('filter-role', data.roles || [], 'All Roles')
  populateSelect('filter-level', data.levels || [], 'All Levels')
  populateSelect('filter-location', data.locations || [], 'All Locations')
  populateSelect('filter-currency', data.currencies || [], 'All Currencies')
}

function populateSelect (id, values, defaultLabel) {
  const el = $(id)
  const current = el.value
  el.innerHTML = '<option value="">' + defaultLabel + '</option>'
  for (const v of values.sort()) {
    el.innerHTML += '<option value="' + v + '"' + (v === current ? ' selected' : '') + '>' + v + '</option>'
  }
}

function getFilters () {
  return {
    role: $('filter-role').value,
    level: $('filter-level').value,
    location: $('filter-location').value,
    currency: $('filter-currency').value
  }
}

// Worker message handler
bridge.onWorkerIPC(WORKER, (data) => {
  const raw = decoder.decode(data)
  console.log('[IPC received]', raw)
  let msg
  try { msg = JSON.parse(raw) } catch (e) { console.log('[IPC parse error]', e); return }

  if (msg.type === 'ready') {
    $('channel-key').textContent = msg.key
    showScreen('main')
    sendCmd({ type: 'getStats', filters: {} })
  } else if (msg.type === 'stats') {
    renderStats(msg.data)
  } else if (msg.type === 'submitted') {
    $('submit-status').className = 'status success'
    $('submit-status').textContent = 'Submitted anonymously!'
    $('f-role').value = ''
    $('f-salary').value = ''
    $('f-location').value = ''
    setTimeout(() => { $('submit-status').textContent = '' }, 3000)
  } else if (msg.type === 'error') {
    $('submit-status').className = 'status error'
    $('submit-status').textContent = msg.msg
  }
})

bridge.onWorkerStdout(WORKER, (data) => {
  console.log('[worker]', decoder.decode(data))
})

bridge.onWorkerStderr(WORKER, (data) => {
  console.error('[worker]', decoder.decode(data))
})

// Start worker
bridge.startWorker(WORKER)

// Create channel
$('create-btn').onclick = () => {
  $('create-btn').disabled = true
  $('landing-status').textContent = 'Creating channel...'
  sendCmd({ type: 'create' })
}

// Join channel
$('join-btn').onclick = () => {
  const key = $('join-key').value.trim()
  if (!key) return
  $('join-btn').disabled = true
  $('landing-status').textContent = 'Joining channel...'
  sendCmd({ type: 'join', key })
}

// Submit salary
$('submit-btn').onclick = () => {
  const role = $('f-role').value.trim()
  const salary = $('f-salary').value.trim()
  const level = $('f-level').value
  const location = $('f-location').value.trim()
  const currency = $('f-currency').value

  if (!role || !salary || !location) {
    $('submit-status').className = 'status error'
    $('submit-status').textContent = 'Please fill in role, location, and salary.'
    return
  }

  sendCmd({ type: 'submit', data: { role, level, location, salary: Number(salary), currency } })
}

// Copy key
$('copy-btn').onclick = () => {
  const key = $('channel-key').textContent
  navigator.clipboard.writeText(key).then(() => {
    $('copy-btn').textContent = 'Copied!'
    setTimeout(() => { $('copy-btn').textContent = 'Copy' }, 2000)
  })
}

// Filter
$('filter-btn').onclick = () => {
  sendCmd({ type: 'getStats', filters: getFilters() })
}

// Refresh stats periodically
setInterval(() => {
  if ($('main').classList.contains('active')) {
    sendCmd({ type: 'getStats', filters: getFilters() })
  }
}, 10000)
