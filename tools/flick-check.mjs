// The pad's right stick: which end of the deck each throw pops off.
//
// The player, twice, because the first reading was wrong: *"I want pushing up
// on the right analog to start a nollie and when you flick from up to down you
// do a nollie, the opposite of an ollie."* So the gesture is not "up then down
// finishes a nollie" — the UP ITSELF is the nollie, and an ollie is the throw
// that was loaded off the tail first (down, then up). Anything else is either
// the load (a down push on its own) or nothing.
//
// Run: node --experimental-strip-types tools/flick-check.mjs

import { register } from "node:module";

register(new URL("./ts-resolve.mjs", import.meta.url));

const clock = { now: 0 };
globalThis.performance = { now: () => clock.now };
const pad = {
  connected: true,
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  axes: [0, 0, 0, 0],
};
Object.defineProperty(globalThis, "navigator", { value: { getGamepads: () => [pad] }, configurable: true });

const { GamepadLayer } = await import("../src/skate/gamepad.ts");

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const log = [];
const sink = {
  padControl: (c, down) => { if (down) log.push(`key:${c}`); },
  padCrouch: () => {},
  padMarker: () => {},
  padNollie: () => log.push("NOLLIE"),
  padSteer: () => {},
};
const layer = new GamepadLayer({ input: sink, onPause: () => {} });
const step = (ms = 16) => { clock.now += ms; layer.poll(true, true); };
const rs = (x, y) => { pad.axes = [0, 0, x, y]; };
const settle = (ms = 320) => { rs(0, 0); step(16); step(16); step(ms); };

step(); step();
settle();

// DOWN THEN UP — loaded off the tail: an ollie, never a nollie.
rs(0, 0.9); step(16);
rs(0, -0.9); step(16); step(16); step(16); step(120);
check("down then up is an ollie", log.filter((e) => e === "key:Space").length === 1, log.join(","));
check("…and it is not a nollie", !log.includes("NOLLIE"));
log.length = 0;

// UP — no load: the nollie, which is what the player asked the up to do.
settle();
rs(0, -0.9); step(16); step(16); step(120);
check("up on its own is a nollie", log.filter((e) => e === "NOLLIE").length === 1, log.join(","));
check("…and it does not also tap Space", !log.includes("key:Space"));
log.length = 0;

// UP THEN DOWN — the same nollie, the down being follow-through, not a second pop.
settle();
rs(0, -0.9); step(16); step(16);
rs(0, 0.9); step(16); step(16); step(16); step(120);
check("up then down is one nollie", log.filter((e) => e === "NOLLIE").length === 1, log.join(","));
check("…and no second pop behind it", !log.includes("key:Space"));
log.length = 0;

// DOWN ALONE — the load and nothing else.
settle();
rs(0, 0.9); step(16); step(16); step(120);
check("a plain down push pops nothing", log.length === 0, log.join(","));
log.length = 0;

// UP-LEFT / UP-RIGHT name the nollie's flips, mirrored from the ollie's.
for (const [x, want] of [[-0.8, "key:KeyF"], [0.8, "key:KeyG"]]) {
  settle();
  rs(x, -0.9); step(16); step(16); step(10); step(120);
  check(`up ${x < 0 ? "left" : "right"} is a nollie ${x < 0 ? "kickflip" : "heelflip"}`, log.includes(want) && log.includes("NOLLIE"), log.join(","));
  log.length = 0;
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exitCode = failures === 0 ? 0 : 1;
