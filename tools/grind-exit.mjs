// Popping OUT of a grind has to get you out of it.
//
// The player: *"grinds are sticking and not popping off."* Measured: popping
// straight up off the flat bar at 6 m/s, he re-locked onto the same bar 47
// frames later — three approaches out of three. The pop is mostly vertical, the
// bar is right underneath him, and the landing rule that takes any line under
// the wheels took that one too. From the player's seat that is a grind that will
// not let go.
//
// So: every line he pops out of is off his menu until his feet are down. This
// file rides onto a spread of lines, pops out of each, and asks the two things
// a player can see — did he leave, and did he finish the air somewhere else?
//
// Run: node --experimental-strip-types tools/grind-exit.mjs

import { register } from "node:module";

register(new URL("./ts-resolve.mjs", import.meta.url));
const { SkateModel, EMPTY_INPUT } = await import("../src/skate/skate-model.ts");
const { STREET_SPOT } = await import("../src/world/spot.ts");

const STEP = 1 / 60;
const RAILS = STREET_SPOT.rails();
let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const rows = [];
for (const id of ["flat-bar", "handrail-3", "handrail-6", "hubba-6"]) {
  const line = RAILS.find((r) => r.id === id);
  if (!line) continue;
  const axis = Math.atan2(line.b.x - line.a.x, line.b.z - line.a.z);
  const p = {
    x: line.a.x + (line.b.x - line.a.x) * 0.15,
    z: line.a.z + (line.b.z - line.a.z) * 0.15,
  };
  for (const v of [6, 10]) {
    for (const lead of [0.3, 0.6, 0.9]) {
      const m = new SkateModel({}, STREET_SPOT);
      const sx = p.x - Math.sin(axis) * v * lead;
      const sz = p.z - Math.cos(axis) * v * lead;
      m.position.set(sx, STREET_SPOT.height(sx, sz), sz);
      m.heading = axis;
      m.speed = v;
      let entry = -1, popped = -1, back = -1, landed = -1;
      for (let i = 0; i < 420; i++) {
        const pop = popped < 0 && m.state === "grind" && i > entry + 10;
        m.update({ ...EMPTY_INPUT, olliePressed: pop || i === 0 }, STEP);
        if (m.state === "grind" && entry < 0) entry = i;
        if (pop) popped = i;
        if (popped >= 0 && m.state === "grind" && i > popped + 2) back = i;
        if (popped >= 0 && m.state === "rolling" && landed < 0) landed = i;
      }
      if (entry < 0 || popped < 0) continue;
      rows.push({ id, v, lead, popped, back, landed });
    }
  }
}

check("every approach that caught a line could pop out of it", rows.length > 0, `${rows.length} rides`);
const stuck = rows.filter((r) => r.back > 0 || r.landed < 0);
check(
  "…and no pop out of a line takes that same line again",
  stuck.length === 0,
  stuck.length ? stuck.map((r) => `${r.id}@${r.v} back on ${r.back}, landed ${r.landed}`).join(" · ") : `${rows.length}/${rows.length} landed rolling on something else`,
);
check(
  "…and he is back on the ground inside the air, not left in the grind",
  rows.every((r) => r.landed > r.popped && r.landed - r.popped < 150),
  rows.map((r) => `${r.id}@${r.v}: ${r.landed - r.popped} frames`).slice(0, 4).join(" · "),
);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exitCode = failures === 0 ? 0 : 1;
