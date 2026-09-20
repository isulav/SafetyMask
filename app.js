// ─────────────────────────────────────────
//  CONFIGURATION
// ─────────────────────────────────────────
const CONFIG = {
  auth:        "n50c3tuwopv9uGU3NJgCT3U5mn-_aji6",
  base:        "https://blynk.cloud/external/api/get",
  interval:    2000,   // ms between fetches
  maxPoints:   30,     // history length on charts
  gasThresh:   1200,   // matches firmware GAS_THRESHOLD
  bpmLow:      50,     // matches firmware LOW_BPM_THRESHOLD

  // ── CORS NOTE ────────────────────────────────────────────────────────────
  // Browsers block direct fetch() calls to blynk.cloud from a local/hosted
  // web page (CORS policy).  If you see "CORS" errors in DevTools Console,
  // you have two options:
  //
  //  Option A – Run a tiny proxy server locally (recommended):
  //    1. Install Node.js, then: npm install -g local-cors-proxy
  //    2. lcp --proxyUrl https://blynk.cloud
  //    3. Change CONFIG.base below to: "http://localhost:8010/proxy/external/api/get"
  //
  //  Option B – Deploy the proxy to a server (e.g. Render, Railway):
  //    Any HTTP server that forwards /blynk/* → https://blynk.cloud/*
  //    and sets Access-Control-Allow-Origin: * on the response.
  //
  //  Option C – Open the HTML file via a browser extension that disables
  //    CORS (for local development only — never in production).
  // ─────────────────────────────────────────────────────────────────────────
};

const PINS = {
  bpm:    "V0",   // heart rate (beatAvg)
  finger: "V1",   // finger detected (0/1)
  motion: "V2",   // motion detected (0/1)
  ir:     "V3",   // raw IR value
  gas:    "V4",   // gas value
  alert:  "V5",   // vibrator alert (0/1) — NOT a text string
};

// ─────────────────────────────────────────
//  DOM REFERENCES
// ─────────────────────────────────────────
const dom = {
  liveDot:      document.getElementById("live-dot"),
  liveLabel:    document.getElementById("live-label"),
  lastUpdated:  document.getElementById("last-updated"),

  alertBanner:  document.getElementById("alert-banner"),
  alertIcon:    document.getElementById("alert-icon"),
  alertText:    document.getElementById("alert-text"),

  gasValue:     document.getElementById("gas-value"),
  gasBar:       document.getElementById("gas-bar"),
  gasStatus:    document.getElementById("gas-status"),
  cardGas:      document.getElementById("card-gas"),

  bpmValue:     document.getElementById("bpm-value"),
  bpmStatus:    document.getElementById("bpm-status"),
  cardBpm:      document.getElementById("card-bpm"),

  motionValue:  document.getElementById("motion-value"),
  motionStatus: document.getElementById("motion-status"),
  cardMotion:   document.getElementById("card-motion"),

  fingerValue:  document.getElementById("finger-value"),
  fingerStatus: document.getElementById("finger-status"),
  cardFinger:   document.getElementById("card-finger"),

  axVal:        document.getElementById("ax-val"),
  ayVal:        document.getElementById("ay-val"),
  azVal:        document.getElementById("az-val"),
  axFill:       document.getElementById("ax-fill"),
  ayFill:       document.getElementById("ay-fill"),
  azFill:       document.getElementById("az-fill"),
};

// ─────────────────────────────────────────
//  CHART SETUP
// ─────────────────────────────────────────
const chartDefaults = {
  responsive:          true,
  maintainAspectRatio: false,
  animation:           { duration: 300 },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: "#1a1e1e",
      borderColor:     "#2a3030",
      borderWidth:     1,
      titleColor:      "#7a9090",
      bodyColor:       "#c8e8e0",
      titleFont:       { family: "'Share Tech Mono', monospace", size: 11 },
      bodyFont:        { family: "'Share Tech Mono', monospace", size: 12 },
      padding:         8,
    },
  },
  scales: {
    x: {
      display: false,
    },
    y: {
      ticks: {
        color:         "#445555",
        font:          { family: "'Share Tech Mono', monospace", size: 11 },
        maxTicksLimit: 4,
      },
      grid: {
        color: "rgba(42,48,48,0.8)",
      },
      border: {
        color: "#2a3030",
      },
    },
  },
};

function createLineChart(canvasId, color, label, yMin, yMax) {
  const ctx = document.getElementById(canvasId).getContext("2d");
  return new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [{
        label,
        data:            [],
        borderColor:     color,
        backgroundColor: color + "18",
        borderWidth:     1.5,
        pointRadius:     0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: color,
        tension:         0.4,
        fill:            true,
      }],
    },
    options: {
      ...chartDefaults,
      scales: {
        ...chartDefaults.scales,
        y: {
          ...chartDefaults.scales.y,
          min: yMin,
          max: yMax,
        },
      },
    },
  });
}

const bpmChart = createLineChart("bpm-chart", "#1fcfaa", "BPM",  30,  160);
const gasChart = createLineChart("gas-chart",  "#f0a030", "Gas",   0, 4095);

// ─────────────────────────────────────────
//  CHART DATA PUSH
// ─────────────────────────────────────────
function pushToChart(chart, timeLabel, value) {
  const d = chart.data;
  d.labels.push(timeLabel);
  d.datasets[0].data.push(value);
  if (d.labels.length > CONFIG.maxPoints) {
    d.labels.shift();
    d.datasets[0].data.shift();
  }
  chart.update("none");
}

// ─────────────────────────────────────────
//  ACCELEROMETER BAR HELPER
//  Maps -2g…+2g range to a left/width fill
//  that grows from the center of the track
// ─────────────────────────────────────────
function setAccelBar(fillEl, value) {
  const clamped = Math.max(-2, Math.min(2, value));
  const center  = 50;
  const half    = (clamped / 2) * 50;

  if (half >= 0) {
    fillEl.style.left  = center + "%";
    fillEl.style.width = half + "%";
  } else {
    fillEl.style.left  = (center + half) + "%";
    fillEl.style.width = Math.abs(half) + "%";
  }
}

// ─────────────────────────────────────────
//  STATUS HELPERS
// ─────────────────────────────────────────
function setStatus(el, cardEl, level, text) {
  el.textContent   = text;
  el.className     = "metric-status " + level;
  cardEl.className = "metric-card "   + level;
}

function setConnectionState(state) {
  dom.liveDot.className     = "live-dot " + state;
  dom.liveLabel.textContent = state === "connected"
    ? "Live"
    : state === "error"
    ? "Error"
    : "Connecting…";
}

// ─────────────────────────────────────────
//  ALERT BANNER UPDATE
// ─────────────────────────────────────────
function updateAlertBanner(msg) {
  const text = (msg || "").trim().toUpperCase();

  dom.alertText.textContent = text || "ALL SYSTEMS OK";

  if (text === "" || text === "OK") {
    dom.alertBanner.className = "alert-banner ok";
    dom.alertIcon.textContent = "◉";
  } else if (text.includes("GAS")) {
    dom.alertBanner.className = "alert-banner danger";
    dom.alertIcon.textContent = "⚠";
  } else {
    dom.alertBanner.className = "alert-banner warning";
    dom.alertIcon.textContent = "◈";
  }
}

// ─────────────────────────────────────────
//  SINGLE PIN FETCH
//  FIX: use &pin=Vx  (was incorrectly &Vx)
// ─────────────────────────────────────────
async function fetchPin(pin) {
  const url = `${CONFIG.base}?token=${CONFIG.auth}&pin=${pin}`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${pin}`);
  return (await res.text()).trim();
}

// ─────────────────────────────────────────
//  FETCH ALL PINS IN PARALLEL
// ─────────────────────────────────────────
async function fetchAll() {
  const keys   = Object.keys(PINS);
  const values = await Promise.all(keys.map(k => fetchPin(PINS[k])));
  const result = {};
  keys.forEach((k, i) => result[k] = values[i]);
  return result;
}

// ─────────────────────────────────────────
//  MAIN UPDATE FUNCTION
// ─────────────────────────────────────────
async function update() {
  try {
    const data = await fetchAll();
    const now  = new Date().toLocaleTimeString();

    setConnectionState("connected");
    dom.lastUpdated.textContent = now;

    // ── GAS ──
    const gasVal = parseInt(data.gas, 10);
    const gasPct = Math.min(100, (gasVal / 4095) * 100).toFixed(1);
    dom.gasValue.textContent    = isNaN(gasVal) ? "—" : gasVal;
    dom.gasBar.style.width      = gasPct + "%";
    dom.gasBar.style.background = gasVal > CONFIG.gasThresh ? "#f04848" : "#1fcfaa";

    if (isNaN(gasVal)) {
      setStatus(dom.gasStatus, dom.cardGas, "", "NO DATA");
    } else if (gasVal > CONFIG.gasThresh) {
      setStatus(dom.gasStatus, dom.cardGas, "danger", "DANGER");
    } else if (gasVal > CONFIG.gasThresh * 0.75) {
      setStatus(dom.gasStatus, dom.cardGas, "warn", "ELEVATED");
    } else {
      setStatus(dom.gasStatus, dom.cardGas, "ok", "CLEAR");
    }

    if (!isNaN(gasVal)) pushToChart(gasChart, now, gasVal);

    // ── BPM ── (now correctly reading V0)
    const bpmVal = parseFloat(data.bpm);
    dom.bpmValue.textContent = bpmVal > 0 ? bpmVal.toFixed(0) : "—";

    if (isNaN(bpmVal) || bpmVal <= 0) {
      setStatus(dom.bpmStatus, dom.cardBpm, "", "NO FINGER");
    } else if (bpmVal < CONFIG.bpmLow) {
      setStatus(dom.bpmStatus, dom.cardBpm, "danger", "LOW BPM");
    } else if (bpmVal > 120) {
      setStatus(dom.bpmStatus, dom.cardBpm, "warn", "ELEVATED");
    } else {
      setStatus(dom.bpmStatus, dom.cardBpm, "ok", "NORMAL");
    }

    if (!isNaN(bpmVal) && bpmVal > 0) pushToChart(bpmChart, now, bpmVal);

    // ── MOTION ──
    const moving = data.motion.trim() === "1";
    dom.motionValue.textContent = moving ? "MOVING" : "STILL";
    setStatus(dom.motionStatus, dom.cardMotion, moving ? "ok" : "warn",
      moving ? "ACTIVE" : "STATIONARY");

    // ── FINGER ──
    const finger = data.finger.trim() === "1";
    dom.fingerValue.textContent = finger ? "YES" : "NO";
    setStatus(dom.fingerStatus, dom.cardFinger, finger ? "ok" : "",
      finger ? "DETECTED" : "ABSENT");

    // ── ALERT BANNER (now boolean, not text) ──
    updateAlertBanner(data.alert);

    // NOTE: ax/ay/az block removed — firmware doesn't send it.
    // If you want the axis bars back, see the firmware addition below.

  } catch (err) {
    console.error("Fetch error:", err);
    if (err instanceof TypeError && err.message.includes("fetch")) {
      dom.lastUpdated.textContent = "CORS error — see console";
    } else {
      dom.lastUpdated.textContent = "fetch failed";
    }
    setConnectionState("error");
  }
}

// ─────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────
update();
setInterval(update, CONFIG.interval);