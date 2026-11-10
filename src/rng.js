// mulberry32 — эталонная реализация: бит-в-бит порт референса
// tools/spec_fp002_probe.py (числа спеки FP-002 сняты именно с него).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t) >>> 0;
    t = (((t ^ (t + 0x1d872b41)) >>> 0) ^ (t >>> 7)) >>> 0;
    t = (t ^ (t >>> 14)) >>> 0;
    return t / 4294967296;
  };
}
