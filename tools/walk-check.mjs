// Off the board and back on.
//
// The player: *"I need a way to get off the board and get back on so I can just
// walk around."* What "walking" has to mean for that to be true is small and
// exact: he can step off the deck where he stands, the deck stays where he left
// it, he can move around without the ride doing anything else to him, he cannot
// step back on from across the plaza, and when he does step back on it is the
// same deck in the same place down the same line.
//
// Run: node --experimental-strip-types tools/walk-check.mjs

import { register } from "node:module";

register(new URL("./ts-resolve.mjs", import.meta.url));
const { SkateModel, EMPTY_INPUT } = await import("../src/skate/skate-model.ts");
const { STREET_SPOT } = await import("../src/world/spot.ts");

const STEP = 1 / 60;
let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
const events = [];
function make() {
  return new SkateModel(
    {
      onPop: () => events.push("pop"),
      onLand: () => {},
      onBoard: (riding) => events.push(riding ? "on" : "off"),
    },
    STREET_SPOT,
  );
}
function tap(m, key) {
  m.update({ ...EMPTY_INPUT, [key]: true }, STEP);
  m.update({ ...EMPTY_INPUT }, STEP);
}
function walk(m, seconds, o = {}) {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i++) m.update({ ...EMPTY_INPUT, ...o }, STEP);
}

{
  const m = make();
  walk(m, 0.5, { throttle: true }); // get rolling first
  check("he can ride, so there is something to step off", m.speed > 1, `${m.speed.toFixed(2)} m/s`);
  const at = { x: m.position.x, z: m.position.z };
  tap(m, "boardPressed");
  check("Y steps him off the board", m.walking === true);
  check("…the deck stays where he left it", m.boardPark !== null && m.boardPark.x === at.x && m.boardPark.z === at.z);
  check("…and the ground under him is his", Math.abs(m.position.y - STREET_SPOT.height(m.position.x, m.position.z)) < 0.02);

  const start = m.position.clone();
  walk(m, 1.2, { throttle: true });
  const moved = m.position.distanceTo(start);
  check("he walks", moved > 1.2 && moved < 3.2, `${moved.toFixed(2)} m in 1.2 s`);

  const popsBefore = events.filter((e) => e === "pop").length;
  tap(m, "olliePressed");
  check("no pop while walking", events.filter((e) => e === "pop").length === popsBefore);

  check("and Y from out of reach does not mount it", (tap(m, "boardPressed"), m.walking === true), `${m.position.distanceTo(start).toFixed(1)} m away`);

  // Walk back.
  const park = m.boardPark;
  const back = Math.hypot(m.position.x - park.x, m.position.z - park.z);
  walk(m, 1.1, { throttle: true, steer: m.heading > 0 ? 1 : -1 });
  // Actually point him home: turn in place, then walk.
  for (let i = 0; i < 240; i++) {
    const dx = park.x - m.position.x;
    const dz = park.z - m.position.z;
    if (Math.hypot(dx, dz) < 0.6) break;
    const want = Math.atan2(dx, dz);
    let diff = ((want - m.heading + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    m.update({ ...EMPTY_INPUT, throttle: Math.abs(diff) < 0.5, steer: Math.max(-1, Math.min(1, -diff * 2)) }, STEP);
  }
  check("he can walk back to it", Math.hypot(m.position.x - park.x, m.position.z - park.z) < 2.5, `back ${back.toFixed(1)} m`);
  tap(m, "boardPressed");
  check("Y within reach puts him back on", m.walking === false);
  check(
    "…on the deck, down the line he left",
    Math.abs(m.position.x - park.x) < 0.05 && Math.abs(m.position.z - park.z) < 0.05 && Math.abs(m.heading - park.heading) < 0.01,
    `off by ${Math.hypot(m.position.x - park.x, m.position.z - park.z).toFixed(3)} m, ${(m.heading - park.heading).toFixed(3)} rad`,
  );
  check("…and the ride is live again", (walk(m, 0.4, { throttle: true }), m.speed > 0.5), `${m.speed.toFixed(2)} m/s`);
}

// No stepping off in the air.
{
  const m = make();
  walk(m, 0.4, { throttle: true });
  m.update({ ...EMPTY_INPUT, olliePressed: true }, STEP);
  check("the pop is in the air", m.state === "air");
  tap(m, "boardPressed");
  check("Y in the air is refused", m.walking === false);
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exitCode = failures === 0 ? 0 : 1;
