// The session marker, driven headless over the REAL street spot.
//
// The marker is `reset`'s teleport to a point of the player's choosing, so this
// file answers the only questions that makes it a feature rather than a second
// reset: does it come back to the exact place and heading, does it carry the
// stance, does it stand him up (speed zero, no line, no ragdoll), and does it
// refuse to plant in mid-air?
//
// Run: node --experimental-strip-types tools/marker-check.mjs

import { register } from "node:module";
import * as THREE from "three";

register(new URL("./ts-resolve.mjs", import.meta.url));
const { SkateModel, EMPTY_INPUT } = await import("../src/skate/skate-model.ts");
const { STREET_SPOT } = await import("../src/world/spot.ts");

const STEP = 1 / 60;
let failures = 0;

function harness(stance = "regular") {
  const events = { stance: [] };
  const model = new SkateModel(
    { onStance: (s) => events.stance.push(s) },
    STREET_SPOT,
  );
  return { model, events };
}

function frame(model, input, dt = STEP) {
  model.update({ ...EMPTY_INPUT, ...input }, dt);
}

function check(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

// --- 1. it comes back to the exact place, heading included -------------------
{
  const { model } = harness();
  frame(model, { throttle: true });
  for (let i = 0; i < 90; i++) frame(model, { throttle: true });
  const point = {
    x: model.position.x,
    y: model.position.y,
    z: model.position.z,
    heading: model.heading + 0.7,
    stance: "regular",
  };
  // Ride away in a different direction, on the throttle, for a while.
  for (let i = 0; i < 120; i++) frame(model, { throttle: true, steer: 1 });
  const moved = Math.hypot(model.position.x - point.x, model.position.z - point.z);
  model.respawnAt(point);
  const back = Math.hypot(model.position.x - point.x, model.position.z - point.z);
  check(
    "comes back to the marker, not near it",
    back < 1e-9 && Math.abs(model.position.y - point.y) < 1e-9 && Math.abs(model.heading - point.heading) < 1e-9,
    `rode ${moved.toFixed(1)} m away, returned to ${back.toExponential(1)} m at the same heading`,
  );
  check("…standing still, on the floor", model.speed === 0 && model.state === "rolling", `speed ${model.speed}, state ${model.state}`);
}

// --- 2. the stance comes with it -------------------------------------------
{
  const { model, events } = harness();
  for (let i = 0; i < 30; i++) frame(model, {});
  const point = { x: model.position.x, y: model.position.y, z: model.position.z, heading: model.heading, stance: "switch" };
  events.stance.length = 0;
  model.respawnAt(point);
  check(
    "a switch marker puts him back switch, and says so",
    model.stance === "switch" && events.stance.at(-1) === "switch",
    `stance ${model.stance}, event ${events.stance.at(-1) ?? "none"}`,
  );
}

// --- 3. it ends the run, like every other teleport --------------------------
{
  const { model } = harness();
  frame(model, { throttle: true });
  for (let i = 0; i < 40; i++) frame(model, { throttle: true });
  // A pop puts him in the air; a marker return must bring him down onto the
  // point instead of leaving the air state holding the old flight.
  frame(model, { olliePressed: true });
  frame(model, {});
  check("the harness got him airborne", model.state === "air", `state ${model.state}`);
  model.respawnAt({ x: 4, y: model.position.y, z: -2, heading: 1.2, stance: "regular" });
  check(
    "…and a marker return lands him, wheels down",
    model.state === "rolling" && model.speed === 0 && Math.abs(model.position.x - 4) < 1e-9 && Math.abs(model.position.z + 2) < 1e-9,
    `state ${model.state}, speed ${model.speed}`,
  );
}

// --- 4. a marker is somewhere he can stand ---------------------------------
// This is main.ts's rule, restated as the model's contract: the ride refuses to
// plant while `airborne`, so the model must report that truthfully at the lip.
{
  const { model } = harness();
  frame(model, { throttle: true });
  for (let i = 0; i < 40; i++) frame(model, { throttle: true });
  frame(model, { olliePressed: true });
  frame(model, {});
  check("`airborne` is true off a pop, so no marker is planted there", model.airborne === true, `airborne ${model.airborne}`);
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exitCode = failures === 0 ? 0 : 1;
