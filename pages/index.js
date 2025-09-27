import { FaGithub, FaLinkedin, FaTwitter, FaInstagram, FaGlobe } from "react-icons/fa";
import { useEffect, useRef, useState } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { FaBolt, FaBatteryFull, FaWaveSquare, FaExchangeAlt, FaMinusCircle, FaUndo, FaRedo, FaProjectDiagram, FaArrowRight } from "react-icons/fa";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

export default function Home() {
  // responsive container ref
  const containerRef = useRef(null);

  // responsive canvas size state
  const [canvasWidth, setCanvasWidth] = useState(1100);
  const [canvasHeight, setCanvasHeight] = useState(650);

  // grid size (scales with canvas width)
  const gridSize = Math.max(28, Math.floor(canvasWidth / 30));

  // Core data
  const [components, setComponents] = useState([]);
  const [wires, setWires] = useState([]);

  // Interaction state
  const [selectedComponent, setSelectedComponent] = useState("resistor"); // tool selection
  const [addingWire, setAddingWire] = useState(false);
  const [wireStart, setWireStart] = useState(null);
  const [draggingIndex, setDraggingIndex] = useState(null);
  const [hoverIndex, setHoverIndex] = useState(null);

  // Multimeter (probe) tool state
  const [probeMode, setProbeMode] = useState(false);
  const [probePoints, setProbePoints] = useState([]); // stores indices of two nodes
  const [probeResult, setProbeResult] = useState(null);

  const componentOptions = [
    { type: "resistor", icon: <FaWaveSquare />, label: "Resistor" },
    { type: "capacitor", icon: <FaExchangeAlt />, label: "Capacitor" },
    { type: "inductor", icon: <FaMinusCircle />, label: "Inductor" },
    { type: "battery", icon: <FaBatteryFull />, label: "Battery" },
    { type: "switch", icon: <FaBolt />, label: "Switch" },
    { type: "diode", icon: <FaArrowRight />, label: "Diode" },
    { type: "probe", icon: <FaGlobe />, label: "Probe" },
  ];

  // Right-click
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [menuTarget, setMenuTarget] = useState(null);

  // Simulation & animation
  const [electronOffset, setElectronOffset] = useState(0);
  const [time, setTime] = useState(0);
  const [frequency, setFrequency] = useState(1); // Hz
  const [currentAmp, setCurrentAmp] = useState(0); // computed current amplitude
  const [badCircuit, setBadCircuit] = useState(false);

  // Speed controllers
  const [currentSpeed, setCurrentSpeed] = useState(5);
  const [voltageSpeed, setVoltageSpeed] = useState(5);
  const [resistanceSpeed, setResistanceSpeed] = useState(5);
  const [capacitanceSpeed, setCapacitanceSpeed] = useState(5);
  const [inductanceSpeed, setInductanceSpeed] = useState(5);

  // History for undo/redo
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // UI data
  const units = {
    resistor: "Ω",
    capacitor: "µF",
    inductor: "mH",
    battery: "V",
    switch: "",
    led: "V",
    diode: "V",
    voltage: "V",
  };
  const defaultValues = {
    resistor: "100",
    capacitor: "10",
    inductor: "10",
    battery: "5",
    switch: "ON",
    led: "5",
    diode: "->", // diode direction; use '->' or '<-'
    voltage: "5",
  };

  // --- Responsive resize ---
  useEffect(() => {
    const handleResize = () => {
      const w = containerRef.current ? containerRef.current.clientWidth : window.innerWidth * 0.9;
      const newW = Math.min(1200, Math.max(360, Math.floor(w - 32)));
      const newH = Math.min(900, Math.max(300, Math.floor(newW * 0.55)));
      setCanvasWidth(newW);
      setCanvasHeight(newH);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // --- Initialize a prebuilt LCR circuit if empty (only on first load) ---
  useEffect(() => {
    if (components.length === 0 && wires.length === 0) {
      const lcrComponents = [
        { x: 100, y: 250, type: "battery", value: "5" },
        { x: 300, y: 250, type: "resistor", value: "100" },
        { x: 500, y: 250, type: "inductor", value: "10" },
        { x: 700, y: 250, type: "capacitor", value: "10" },
        { x: 900, y: 250, type: "switch", value: "ON" },
      ];
      const lcrWires = [
        { from: 0, to: 1 },
        { from: 1, to: 2 },
        { from: 2, to: 3 },
        { from: 3, to: 4 },
        { from: 4, to: 0 },
      ];
      setComponents(lcrComponents);
      setWires(lcrWires);
      pushHistory(lcrComponents, lcrWires);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------
  // History (undo/redo)
  // -------------------------
  function pushHistory(comps, ws) {
    setHistory((prev) => {
      const h = prev.slice(0, historyIndex + 1);
      h.push({ comps: JSON.parse(JSON.stringify(comps)), ws: JSON.parse(JSON.stringify(ws)) });
      setHistoryIndex(h.length - 1);
      return h;
    });
  }
  function undo() {
    setHistory((h) => {
      if (historyIndex <= 0) return h;
      const prev = h[historyIndex - 1];
      if (prev) {
        setComponents(prev.comps);
        setWires(prev.ws);
        setHistoryIndex((i) => i - 1);
      }
      return h;
    });
  }
  function redo() {
    setHistory((h) => {
      if (historyIndex >= h.length - 1) return h;
      const next = h[historyIndex + 1];
      if (next) {
        setComponents(next.comps);
        setWires(next.ws);
        setHistoryIndex((i) => i + 1);
      }
      return h;
    });
  }

  // -------------------------
  // Graph helpers & validation
  // -------------------------
  const buildAdj = () => {
    const adj = {};
    components.forEach((_, i) => (adj[i] = []));
    wires.forEach((w) => {
      if (w.from === w.to) return;
      if (!adj[w.from]) adj[w.from] = [];
      if (!adj[w.to]) adj[w.to] = [];
      adj[w.from].push(w.to);
      adj[w.to].push(w.from);
    });
    return adj;
  };

  const findCycleContainingBattery = () => {
    const adj = buildAdj();
    const n = components.length;
    const visited = new Array(n).fill(false);
    const parent = new Array(n).fill(-1);

    const reconstruct = (u, v) => {
      const path = [v];
      let cur = u;
      while (cur !== v && cur !== -1) {
        path.push(cur);
        cur = parent[cur];
      }
      return path.reverse();
    };

    for (let start = 0; start < n; start++) {
      if (!components[start] || components[start].type !== "battery") continue;
      visited.fill(false);
      parent.fill(-1);
      let stack = [start];
      visited[start] = true;
      while (stack.length) {
        const u = stack.pop();
        for (const v of adj[u] || []) {
          if (!visited[v]) {
            visited[v] = true;
            parent[v] = u;
            stack.push(v);
          } else if (v !== parent[u]) {
            const cycle = reconstruct(u, v);
            if (cycle.includes(start)) return cycle;
          }
        }
      }
    }
    return null;
  };

  // Enhanced impedance: supports parallel branches between same node pairs
  const impedanceOfComponent = (c) => {
    if (!c) return { re: 0, im: 0 };
    if (c.type === "resistor") return { re: Number(c.value) || 0, im: 0 };
    if (c.type === "inductor") {
      const L = (Number(c.value) || 0) / 1000;
      const XL = 2 * Math.PI * frequency * L;
      return { re: 0, im: XL };
    }
    if (c.type === "capacitor") {
      const C = (Number(c.value) || 0) * 1e-6;
      const XC = C > 0 ? 1 / (2 * Math.PI * frequency * C) : Infinity;
      return { re: 0, im: -XC };
    }
    if (c.type === "switch") {
      return c.value === "OFF" ? { re: 1e12, im: 0 } : { re: 0, im: 0 };
    }
    if (c.type === "diode") {
      // ideal diode: forward drop ~0.7V approximate; we'll treat as small resistance when forward
      return { re: 0.5, im: 0 };
    }
    return { re: 0, im: 0 };
  };

  // compute impedance for sequence of nodes in cycle; handle simple parallel edges between same nodes
  const computeSeriesImpedance = (nodeIndices) => {
    // nodeIndices: ordered nodes along a closed loop
    const Ztotal = { re: 0, im: 0 };
    const n = nodeIndices.length;
    for (let i = 0; i < n; i++) {
      const a = nodeIndices[i];
      const b = nodeIndices[(i + 1) % n];
      // find wires that connect a and b (both directions)
      const connecting = wires.filter((w) => (w.from === a && w.to === b) || (w.from === b && w.to === a));
      if (connecting.length === 0) continue;
      // for each connecting wire, find the component sitting at its midpoint (heuristic: components whose index equals from or to)
      const branchZs = connecting.map((w) => {
        // pick both nodes components as series? We'll approximate by taking the component at 'to' if it's not battery
        const comp = components[w.to] && components[w.to].type !== 'battery' ? components[w.to] : components[w.from];
        return impedanceOfComponent(comp);
      });
      // combine branchZs in parallel
      if (branchZs.length === 1) {
        Ztotal.re += branchZs[0].re;
        Ztotal.im += branchZs[0].im;
      } else {
        // admittance sum
        let Yre = 0,
          Yim = 0;
        branchZs.forEach((z) => {
          const denom = z.re * z.re + z.im * z.im;
          if (!isFinite(denom) || denom === 0) return;
          Yre += z.re / denom;
          Yim += -z.im / denom;
        });
        // invert Y to Z
        const denomY = Yre * Yre + Yim * Yim;
        if (denomY === 0) {
          Ztotal.re += 1e12; // open
        } else {
          const Zre = Yre / denomY;
          const Zim = -Yim / denomY;
          Ztotal.re += Zre;
          Ztotal.im += Zim;
        }
      }
    }
    return Ztotal;
  };

  const getBatteryVoltageForCycle = (nodeIndices) => {
    for (const idx of nodeIndices) {
      const c = components[idx];
      if (c && c.type === "battery") return Number(c.value) || 0;
    }
    const anyB = components.find((c) => c.type === "battery");
    return anyB ? Number(anyB.value) || 0 : 0;
  };

  // -------------------------
  // Simulation: compute current & badCircuit
  // -------------------------
  useEffect(() => {
    const cycle = findCycleContainingBattery();
    if (!cycle) {
      setBadCircuit(true);
      setCurrentAmp(0);
      return;
    }
    // Diode handling: if diode present and oriented against assumed direction, block
    const hasBlockingDiode = cycle.some((i) => components[i]?.type === "diode" && components[i].value === "<-" );
    if (hasBlockingDiode) {
      setBadCircuit(true);
      setCurrentAmp(0);
      return;
    }

    const hasOpenSwitch = cycle.some((i) => components[i]?.type === "switch" && components[i].value === "OFF");
    if (hasOpenSwitch) {
      setBadCircuit(true);
      setCurrentAmp(0);
      return;
    }

    const V = getBatteryVoltageForCycle(cycle);
    if (!V) {
      setBadCircuit(true);
      setCurrentAmp(0);
      return;
    }

    const Z = computeSeriesImpedance(cycle);
    const Zmag = Math.sqrt(Z.re * Z.re + Z.im * Z.im);
    if (!isFinite(Zmag) || Zmag <= 0) {
      setBadCircuit(true);
      setCurrentAmp(0);
      return;
    }

    const I = V / Zmag;
    setBadCircuit(false);
    setCurrentAmp(I);
  }, [components, wires, frequency]);

  // -------------------------
  // Multimeter probe measurement helpers
  // -------------------------
  const measureBetween = (i, j) => {
    // If both on same cycle, approximate voltage difference by summing impedances along cycle between nodes
    const cycle = findCycleContainingBattery();
    if (!cycle) return { ok: false, reason: "No closed loop" };
    const idxA = cycle.indexOf(i);
    const idxB = cycle.indexOf(j);
    if (idxA === -1 || idxB === -1) return { ok: false, reason: "Nodes not on same loop" };
    // Choose path A->B along cycle
    const n = cycle.length;
    let path = [];
    let k = idxA;
    while (k !== idxB) {
      path.push(cycle[k]);
      k = (k + 1) % n;
    }
    path.push(cycle[idxB]);
    // compute impedance along path
    const Zpath = computeSeriesImpedance(path);
    const Zmag = Math.sqrt(Zpath.re * Zpath.re + Zpath.im * Zpath.im);
    const Vdrop = currentAmp * Zmag; // approximate
    return { ok: true, V: Vdrop, I: currentAmp };
  };

  // -------------------------
  // Animation tick
  // -------------------------
  useEffect(() => {
    let id = null;
    const tick = () => {
      if (currentAmp > 0) {
        setElectronOffset((p) => p + currentSpeed);
        setTime((t) => t + 0.02 * Math.max(0.2, voltageSpeed / 5));
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [currentAmp, currentSpeed, voltageSpeed]);

  // -------------------------
  // Canvas drawing
  // -------------------------
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvasWidth * devicePixelRatio;
    canvas.height = canvasHeight * devicePixelRatio;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // background
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // grid
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 1;
    for (let x = 0; x < canvasWidth; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasHeight);
      ctx.stroke();
    }
    for (let y = 0; y < canvasHeight; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasWidth, y);
      ctx.stroke();
    }

    // draw wires & electrons
    wires.forEach((wire) => {
      const s = components[wire.from];
      const e = components[wire.to];
      if (!s || !e) return;
      const sx = s.x + gridSize / 2,
        sy = s.y + gridSize / 2,
        ex = e.x + gridSize / 2,
        ey = e.y + gridSize / 2;
      ctx.strokeStyle = "#00e5ff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      // draw arrow for diode direction if either end is diode
      if (s.type === 'diode' || e.type === 'diode') {
        // draw a small arrow in middle
        const mx = (sx + ex) / 2;
        const my = (sy + ey) / 2;
        ctx.fillStyle = '#ffcc00';
        ctx.beginPath();
        ctx.moveTo(mx - 6, my - 4);
        ctx.lineTo(mx + 6, my);
        ctx.lineTo(mx - 6, my + 4);
        ctx.fill();
      }

      if (currentAmp > 0) {
        const dx = ex - sx;
        const dy = ey - sy;
        const length = Math.sqrt(dx * dx + dy * dy);
        const baseCount = 6;
        const dotCount = Math.max(2, Math.floor(baseCount + currentAmp * 12));
        for (let i = 0; i < dotCount; i++) {
          const spacing = (electronOffset + i * (length / dotCount)) % length;
          const t = spacing / length;
          const x = sx + dx * t,
            y = sy + dy * t;
          ctx.fillStyle = "#ffea00";
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });

    // draw components and labels
    components.forEach((c, idx) => {
      const cx = c.x + gridSize / 2,
        cy = c.y + gridSize / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#ffcc00";
      ctx.fillStyle = c.type === "switch" && c.value === "ON" ? "#00ff88" : "#888";

      switch (c.type) {
        case "resistor":
          ctx.beginPath();
          ctx.moveTo(-28, 0);
          ctx.lineTo(-20, -8);
          ctx.lineTo(-10, 8);
          ctx.lineTo(0, -8);
          ctx.lineTo(10, 8);
          ctx.lineTo(20, -8);
          ctx.lineTo(28, 0);
          ctx.stroke();
          break;
        case "capacitor":
          ctx.beginPath();
          ctx.moveTo(-15, -15);
          ctx.lineTo(-15, 15);
          ctx.moveTo(15, -15);
          ctx.lineTo(15, 15);
          ctx.stroke();
          break;
        case "inductor":
          ctx.beginPath();
          ctx.arc(-12, 0, 8, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, 0, 8, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(12, 0, 8, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case "battery":
          ctx.beginPath();
          ctx.moveTo(-10, -18);
          ctx.lineTo(-10, 18);
          ctx.fillRect(6, -12, 4, 24);
          ctx.stroke();
          break;
        case "switch":
          ctx.beginPath();
          ctx.moveTo(-18, 0);
          ctx.lineTo(0, 0);
          ctx.lineTo(18, c.value === "ON" ? -8 : 8);
          ctx.stroke();
          break;
        case "diode":
          // triangle + line
          ctx.beginPath();
          ctx.moveTo(-14, -10);
          ctx.lineTo(6, 0);
          ctx.lineTo(-14, 10);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(8, -12);
          ctx.lineTo(8, 12);
          ctx.stroke();
          break;
        default:
          ctx.fillRect(-12, -8, 24, 16);
      }

      if (c.value !== undefined) {
        ctx.font = "13px Inter, Arial";
        ctx.fillStyle = "#fff";
        const text = `${c.value}${units[c.type] || ""}`;
        const tw = ctx.measureText(text).width + 12;
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.fillRect(-tw / 2, -36, tw, 20);
        ctx.fillStyle = "#fff";
        ctx.fillText(text, -tw / 2 + 6, -22);
      }

      // LED-like glow if current passes through (component in a loop and current > 0)
      const cycle = findCycleContainingBattery();
      const isInLoop = cycle && cycle.includes(idx) && currentAmp > 0 && !badCircuit;
      if (isInLoop) {
        ctx.shadowColor = "rgba(255,200,50,0.9)";
        ctx.shadowBlur = 16;
        ctx.strokeStyle = "#ffd200";
      }

      if (hoverIndex === idx) {
        ctx.strokeStyle = "rgba(0,255,255,0.45)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 36, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    });
  }, [components, wires, electronOffset, hoverIndex, currentAmp, frequency, canvasWidth, canvasHeight]);

  // -------------------------
  // Mouse / UI handlers
  // -------------------------
  const gridSnap = (x, y) => ({
    x: Math.floor(x / gridSize) * gridSize,
    y: Math.floor(y / gridSize) * gridSize,
  });

  const findComponentAt = (x, y) => components.findIndex((c) => x >= c.x && x <= c.x + gridSize && y >= c.y && y <= c.y + gridSize);

  const handleCanvasClick = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { x: px, y: py } = gridSnap(x, y);

    // If probe mode: collect two nodes
    if (probeMode) {
      const idx = findComponentAt(x, y);
      if (idx !== -1) {
        const next = [...probePoints, idx];
        if (next.length === 2) {
          setProbePoints([]);
          setProbeMode(false);
          const res = measureBetween(next[0], next[1]);
          setProbeResult(res);
        } else {
          setProbePoints(next);
        }
      }
      return;
    }

    // If not in wire mode: add component at grid
    if (!addingWire) {
      // The "wire" tool is a mode, not a component
      if (selectedComponent === "wire") {
        setAddingWire(true);
        setWireStart(null);
        return;
      }
      // If selected component is 'probe' it's handled above
      if (selectedComponent === "probe") {
        setProbeMode(true);
        setProbePoints([]);
        setProbeResult(null);
        return;
      }

      const newComp = { x: px, y: py, type: selectedComponent, value: defaultValues[selectedComponent] };
      const newComps = [...components, newComp];
      setComponents(newComps);
      pushHistory(newComps, wires);
    } else {
      // Wire mode: click an existing component to set start/finish
      const index = findComponentAt(x, y);
      if (index !== -1) {
        if (wireStart === null) setWireStart(index);
        else if (wireStart !== index) {
          // avoid duplicates
          const exists = wires.some((w) => (w.from === wireStart && w.to === index) || (w.from === index && w.to === wireStart));
          if (!exists) {
            const newWires = [...wires, { from: wireStart, to: index }];
            setWires(newWires);
            pushHistory(components, newWires);
          }
          setWireStart(null);
          setAddingWire(false);
        }
      }
    }
  };

  const handleMouseDown = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const index = findComponentAt(x, y);
    if (index !== -1) {
      setDraggingIndex(index);
    }
  };

  const handleMouseMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setHoverIndex(findComponentAt(x, y));

    if (draggingIndex !== null) {
      const { x: px, y: py } = gridSnap(x, y);
      const newComps = components.map((c, i) => (i === draggingIndex ? { ...c, x: px, y: py } : c));
      setComponents(newComps);
    }
  };

  const handleMouseUp = () => {
    if (draggingIndex !== null) {
      pushHistory(components, wires);
    }
    setDraggingIndex(null);
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const index = findComponentAt(x, y);
    if (index !== -1) {
      setMenuTarget(index);
      setMenuPos({ x: e.clientX, y: e.clientY });
      setMenuVisible(true);
    } else {
      setMenuVisible(false);
    }
  };

  const handleMenuAction = (action) => {
    const idx = menuTarget;
    if (action === "delete") {
      const newComps = components.filter((_, i) => i !== idx);
      const remap = (id) => (id > idx ? id - 1 : id);
      const newWires = wires
        .filter((w) => w.from !== idx && w.to !== idx)
        .map((w) => ({ from: remap(w.from), to: remap(w.to) }));
      setComponents(newComps);
      setWires(newWires);
      pushHistory(newComps, newWires);
    } else if (action === "toggle" && components[idx].type === "switch") {
      const newComps = components.map((c, i) => (i === idx ? { ...c, value: c.value === "ON" ? "OFF" : "ON" } : c));
      setComponents(newComps);
      pushHistory(newComps, wires);
    } else if (action === "change") {
      const c = components[idx];
      const val = prompt(`Enter value for ${c.type.toUpperCase()} (${units[c.type] || ""}):`, String(c.value));
      if (val !== null) {
        const newComps = components.map((comp, i) => (i === idx ? { ...comp, value: val } : comp));
        setComponents(newComps);
        pushHistory(newComps, wires);
      }
    }
    setMenuVisible(false);
  };

  // -------------------------
  // Waveform helpers (moved before usage)
  // -------------------------
  function getBatteryVoltageForChart() {
    const cyc = findCycleContainingBattery();
    if (cyc && cyc.length) {
      for (const idx of cyc) {
        if (components[idx] && components[idx].type === "battery") return Number(components[idx].value) || 0;
      }
    }
    const anyB = components.find((c) => c.type === "battery");
    return anyB ? Number(anyB.value) || 0 : 0;
  }

  const waveformLabels = Array.from({ length: 100 }, (_, i) => i);
  const V0 = getBatteryVoltageForChart();
  const waveformVoltage = waveformLabels.map((i) => V0 * Math.sin(2 * Math.PI * frequency * (time + i * 0.01)));
  const waveformCurrent = waveformLabels.map((i) => currentAmp * Math.sin(2 * Math.PI * frequency * (time + i * 0.01)));

  const waveformData = {
    labels: waveformLabels,
    datasets: [
      { label: "Voltage (V)", data: waveformVoltage, borderColor: "#00e5ff", backgroundColor: "rgba(0,229,255,0.12)", tension: 0.25 },
      { label: "Current (A)", data: waveformCurrent, borderColor: "#ffd200", backgroundColor: "rgba(255,210,0,0.12)", tension: 0.25 },
    ],
  };
  const waveformOptions = { responsive: true, animation: { duration: 0 }, scales: { y: { min: -Math.max(10, V0), max: Math.max(10, V0) } } };

  // -------------------------
  // Prebuilt circuits insertion
  // -------------------------
  function insertSeriesRLC() {
    const baseX = 120;
    const baseY = 260;
    const comps = [
      { x: baseX, y: baseY, type: "battery", value: "5" },
      { x: baseX + 220, y: baseY, type: "resistor", value: "100" },
      { x: baseX + 440, y: baseY, type: "inductor", value: "10" },
      { x: baseX + 660, y: baseY, type: "capacitor", value: "10" },
      { x: baseX + 880, y: baseY, type: "switch", value: "ON" },
    ];
    const offset = components.length;
    const newWires = [
      { from: offset + 0, to: offset + 1 },
      { from: offset + 1, to: offset + 2 },
      { from: offset + 2, to: offset + 3 },
      { from: offset + 3, to: offset + 4 },
      { from: offset + 4, to: offset + 0 },
    ];
    const newComps = [...components, ...comps];
    const allWires = [...wires, ...newWires];
    setComponents(newComps);
    setWires(allWires);
    pushHistory(newComps, allWires);
  }

  function insertParallelRLC() {
    const offset = components.length;
    const comps = [
      { x: 100, y: 300, type: "battery", value: "5" },
      { x: 300, y: 300, type: "resistor", value: "50" },
      { x: 300, y: 180, type: "inductor", value: "10" },
      { x: 500, y: 300, type: "switch", value: "ON" },
    ];
    const newWires = [
      { from: offset + 0, to: offset + 1 },
      { from: offset + 1, to: offset + 3 },
      { from: offset + 0, to: offset + 2 },
      { from: offset + 2, to: offset + 3 },
      { from: offset + 3, to: offset + 0 },
    ];
    const newComps = [...components, ...comps];
    const allWires = [...wires, ...newWires];
    setComponents(newComps);
    setWires(allWires);
    pushHistory(newComps, allWires);
  }

  // -------------------------
  // Reset
  // -------------------------
  function resetAll() {
    setComponents([]);
    setWires([]);
    setCurrentAmp(0);
    setBadCircuit(false);
    pushHistory([], []);
  }

  // -------------------------
  // Small circuit preview (list)
  // -------------------------
  const circuitPreview = components.map((c, i) => ({ idx: i, type: c.type, value: c.value }));

  return (
    <div ref={containerRef} className="min-h-screen text-white flex flex-col items-center py-6 bg-gradient-to-br from-gray-900 via-black to-gray-800 relative overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-20 left-8 w-56 h-56 bg-purple-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-8 w-80 h-80 bg-cyan-500/16 rounded-full blur-3xl" />
      </div>

      {/* Updated heading as requested */}
      <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-white mb-4">AshikFlux Simulation</h1>

      <div className="flex flex-col md:flex-row flex-wrap gap-3 mb-4 items-center w-full max-w-6xl px-4">
        <div className="p-3 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 flex items-center gap-3 flex-wrap">
          <div className="flex gap-2">
            <button onClick={() => { setSelectedComponent("resistor"); setProbeMode(false); }} className={`p-2 rounded ${selectedComponent === "resistor" ? "bg-cyan-500/30" : "bg-white/6"}`}><FaWaveSquare /></button>
            <button onClick={() => { setSelectedComponent("capacitor"); setProbeMode(false); }} className={`p-2 rounded ${selectedComponent === "capacitor" ? "bg-cyan-500/30" : "bg-white/6"}`}><FaExchangeAlt /></button>
            <button onClick={() => { setSelectedComponent("inductor"); setProbeMode(false); }} className={`p-2 rounded ${selectedComponent === "inductor" ? "bg-cyan-500/30" : "bg-white/6"}`}><FaMinusCircle /></button>
            <button onClick={() => { setSelectedComponent("battery"); setProbeMode(false); }} className={`p-2 rounded ${selectedComponent === "battery" ? "bg-cyan-500/30" : "bg-white/6"}`}><FaBatteryFull /></button>
            <button onClick={() => { setSelectedComponent("switch"); setProbeMode(false); }} className={`p-2 rounded ${selectedComponent === "switch" ? "bg-cyan-500/30" : "bg-white/6"}`}><FaBolt /></button>
            <button onClick={() => { setSelectedComponent("diode"); setProbeMode(false); }} className={`p-2 rounded ${selectedComponent === "diode" ? "bg-cyan-500/30" : "bg-white/6"}`}><FaArrowRight /></button>
          </div>

          <div className="h-6 w-px bg-white/10 mx-2" />

          <button onClick={() => { setSelectedComponent("wire"); setAddingWire(true); setWireStart(null); setProbeMode(false); }} className={`p-2 rounded ${addingWire ? "bg-green-500/30" : "bg-white/6"}`}>Wire</button>

          <div className="h-6 w-px bg-white/10 mx-2" />

          <button onClick={() => { setSelectedComponent("probe"); setProbeMode(true); setProbePoints([]); setProbeResult(null); }} className={`p-2 rounded ${probeMode ? "bg-yellow-500/30" : "bg-white/6"}`}>Probe</button>

          <div className="h-6 w-px bg-white/10 mx-2" />

          <button title="Undo" onClick={() => undo()} className="p-2 rounded bg-white/6"><FaUndo /></button>
          <button title="Redo" onClick={() => redo()} className="p-2 rounded bg-white/6"><FaRedo /></button>
          <button title="Reset" onClick={() => { resetAll(); }} className="p-2 rounded bg-red-600/80 text-white">Reset</button>
        </div>

        <div className="p-3 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 flex items-center gap-3">
          <button className="p-2 rounded bg-white/6"><FaProjectDiagram /></button>
          <div className="flex gap-2">
            <button onClick={insertSeriesRLC} className="px-2 py-1 rounded bg-white/6">Insert Series RLC</button>
            <button onClick={insertParallelRLC} className="px-2 py-1 rounded bg-white/6">Insert Parallel Demo</button>
          </div>
        </div>

        <div className="ml-auto text-sm text-gray-300 flex items-center gap-4">
          <div>Loop Current: <span className="font-mono">{badCircuit ? "0 A" : `${currentAmp.toFixed(3)} A`}</span></div>
          <div className="text-xs text-gray-400">Frequency: <span className="font-mono">{frequency} Hz</span></div>
        </div>
      </div>

      <div className="w-full max-w-6xl flex flex-col lg:flex-row gap-6 px-4">
        <div className="flex-1 flex flex-col items-center gap-4">
          <div className="relative w-full flex justify-center">
            <canvas
              ref={canvasRef}
              width={canvasWidth}
              height={canvasHeight}
              onClick={handleCanvasClick}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onContextMenu={handleContextMenu}
              className="border-2 border-cyan-600 shadow-2xl cursor-pointer rounded-lg"
            />

            {addingWire && wireStart !== null && components[wireStart] && (
              <div style={{
                position: "absolute",
                left: components[wireStart].x + gridSize / 2 - 8,
                top: components[wireStart].y + gridSize / 2 - 8,
                width: 16, height: 16, borderRadius: 8, background: "#00ffdd",
                boxShadow: "0 0 12px #00ffdd"
              }} />
            )}

            {menuVisible && menuTarget !== null && (
              <div style={{ position: "fixed", top: menuPos.y, left: menuPos.x, zIndex: 60 }}>
                <div className="bg-white/6 backdrop-blur-md border border-white/10 rounded-md p-2 text-white">
                  <button onClick={() => handleMenuAction("change")} className="block px-4 py-1 rounded hover:bg-white/10">Change Value</button>
                  <button onClick={() => handleMenuAction("delete")} className="block px-4 py-1 rounded hover:bg-red-200">Delete</button>
                  {components[menuTarget]?.type === "switch" && (
                    <button onClick={() => handleMenuAction("toggle")} className="block px-4 py-1 rounded hover:bg-green-200">Toggle Switch ({components[menuTarget]?.value})</button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="w-full max-w-4xl mt-2 rounded-lg bg-white/4 p-3 border border-white/8">
            <Line data={waveformData} options={waveformOptions} />
          </div>

          <div className="mt-6 w-full max-w-4xl p-3 text-center text-gray-300">
            <div className="mb-2 text-white font-semibold">Connect with Developer</div>
            <div className="flex justify-center gap-4 text-2xl">
              <a href="https://github.com/ashiik7" target="_blank" rel="noopener noreferrer" className="hover:text-cyan-400 transition-colors">
                <FaGithub />
              </a>
              <a href="https://x.com/kishorashik" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors">
                <FaTwitter />
              </a>
              <a href="https://www.instagram.com/ashiik_7?igsh=MXZjM2xlbWJoemR2aw%3D%3D&utm_source=qr" target="_blank" rel="noopener noreferrer" className="hover:text-pink-500 transition-colors">
                <FaInstagram />
              </a>
              <a href="https://ashik-kishor.vercel.app/" target="_blank" rel="noopener noreferrer" className="hover:text-green-400 transition-colors">
                <FaGlobe />
              </a>
            </div>
          </div>
        </div>

        <div className="w-full lg:w-72 p-4 rounded-2xl bg-white/6 backdrop-blur-md border border-white/10 shadow-lg flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-gray-200">Controls / Tools</h3>

          <div className="flex flex-col gap-2">
            <div className="text-xs text-gray-300">Selected Tool: <span className="font-mono">{probeMode ? 'Probe' : selectedComponent}</span></div>
            {probeResult && probeResult.ok && (
              <div className="text-sm bg-black/30 p-2 rounded">Probe: V = {probeResult.V.toFixed(3)} V • I = {probeResult.I.toFixed(5)} A</div>
            )}
            {probeResult && !probeResult.ok && (
              <div className="text-sm bg-black/30 p-2 rounded">Probe: {probeResult.reason}</div>
            )}
          </div>

          <div>
            <label className="text-xs text-gray-300">Electron Speed</label>
            <input type="range" min="1" max="20" value={currentSpeed} onChange={(e) => setCurrentSpeed(Number(e.target.value))} className="w-full" />
            <div className="text-xs text-gray-400">Value: {currentSpeed}</div>
          </div>

          <div>
            <label className="text-xs text-gray-300">Voltage Time Scale</label>
            <input type="range" min="1" max="20" value={voltageSpeed} onChange={(e) => setVoltageSpeed(Number(e.target.value))} className="w-full" />
            <div className="text-xs text-gray-400">Value: {voltageSpeed}</div>
          </div>

          <div>
            <label className="text-xs text-gray-300">AC Frequency (Hz)</label>
            <input type="range" min="0.2" max="50" step="0.1" value={frequency} onChange={(e) => setFrequency(Number(e.target.value))} className="w-full" />
            <div className="text-xs text-gray-400">Value: {frequency} Hz</div>
          </div>

          <div className="mt-2 text-xs text-gray-300">
            Tip: Add a <b>BATTERY</b> and create a closed loop (cycle) to see current flow. 
                 Diodes are one-way (use {'->'} or {'<-'}). 
                 Use Probe to click two nodes and measure.

          </div>

          <div className="mt-3">
            <h4 className="text-xs text-gray-300 mb-1">Circuit Preview</h4>
            <div className="max-h-40 overflow-auto bg-black/20 p-2 rounded">
              {circuitPreview.length === 0 ? <div className="text-xs text-gray-400">No components</div> : (
                circuitPreview.map((p) => (
                  <div key={p.idx} className="text-xs text-gray-200">{p.idx}: {p.type.toUpperCase()} {p.value ? `(${p.value})` : ''}</div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>

      <div className="h-6" />
    </div>
  );
}



















