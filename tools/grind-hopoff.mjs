// Can he get OFF a line he is already on?
// — `node --experimental-strip-types tools/grind-hopoff.mjs`
//
// The player's report: *"when you hop on a rail, i need to be able to hop off
// of it without getting stuck to the rail."* The pop itself is `olliePressed`
// while grinding, and that path is live — so the suspicion is not the key, it is
// the CATCHER: `Grinder.cleared` re-arms the line he just left once he is 0.7 m
// above the spot he left it at, which is exactly where a normal ollie puts him.
// So he pops, clears the guard at the apex, and the line takes him back on the
// way down.
//
// Every line in the spot is ridden onto, ground for a few frames, popped off,
// and then watched: a catch of the SAME line before he lands is the defect.

import { register } from "node:module";

register(new URL("./ts-resolve.mjs", import.meta.url));
const { SkateModel, EMPTY_INPUT } = await import("../src/skate/skate-model.ts");
const { STREET_SPOT } = await import("../src/world/spot.ts");

const STEP = 1 / 60;
const RAILS = STREET_SPOT.rails();
const axisOf = (l) => Math.atan2(l.b.x - l.a.x, l.b.z - l.a.z);
const pointAt = (l, t) => ({
  x: l.a.x + (l.b.x - l.a.x) * t,
  y: l.a.y + (l.b.y - l.a.y) * t,
  z: l.a.z + (l.b.z - l.a.z) * t,
});

function probe(l, v = 8, lead = 0.45) {
  const axis = axisOf(l);
  const p = pointAt(l, 0.15);
  const events = [];
  const model = new SkateModel(
    {
      onGrindStart: (kind, line) => events.push({ kind: "catch", id: line.id }),
      onGrindEnd: () => events.push({ kind: "leave" }),
      onBail: () => events.push({ kind: "bail" }),
    },
    STREET_SPOT,
  );
  const sx = p.x - Math.sin(axis) * v * lead;
  const sz = p.z - Math.cos(axis) * v * lead;
  model.position.set(sx, STREET_SPOT.height(sx, sz), sz);
  model.heading = axis;
  model.speed = v;

  let on = -1;
  let poppedAt = -1;
  let recatch = false;
  let airFrames = 0;
  for (let i = 0; i < 600; i++) {
    let ollie = i === 0;
    if (on >= 0 && poppedAt < 0 && i === on + 5) ollie = true;
    model.update({ ...EMPTY_INPUT, olliePressed: ollie }, STEP);
    if (on < 0 && model.state === "grind") on = i;
    if (on >= 0 && poppedAt < 0 && i === on + 5) poppedAt = i;
    if (poppedAt >= 0) {
      if (model.state === "air") airFrames++;
      const last = events[events.length - 1];
      if (last?.kind === "catch" && last.id === l.id && events.length > 1) recatch = true;
    }
  }
  // Landed or bailed, the ban is over: the line must be willing to take him
  // again next time he rides onto it. (`ban` is the model's own field; a fresh
  // approach cannot be trusted here — the ride he lands with is not the ride a
  // new model starts with — so the cleared flag is what gets asserted.)
  const ban = model.hopOff ?? null;
  return {
    id: l.id,
    ban,
    caught: on >= 0,
    popped: poppedAt >= 0,
    recatch,
    airFrames,
    final: model.state,
  };
}

let notRearmed = 0;
let stuck = 0;
let onRails = 0;
for (const l of RAILS) {
  const r = probe(l);
  if (r.caught) {
    onRails++;
    if (r.recatch) stuck++;
    if (r.popped && r.ban !== null) notRearmed++;
  }
  console.log(
    `${r.caught ? (r.recatch ? "STUCK  " : "clean  ") : "no-catch"} ${r.id.padEnd(18)} ` +
      `popped=${r.popped} air=${r.airFrames} final=${r.final} rearmed=${r.ban === null}`,
  );
}
console.log(
  `\n${stuck} of ${onRails} rideable lines took him back after he hopped off; ` +
    `${notRearmed} stayed banned after he landed`,
);
process.exitCode = stuck || notRearmed ? 1 : 0;
