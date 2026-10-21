// The deck he leaves behind is ON the ground, BESIDE him.
//
// A park that floats or lands inside his shins looks like a bug from the only
// angle the game ever shows it — over his shoulder. This asks the rig the same
// question the camera does: where is the parked deck in world space, and is it
// where the ride says the board was left?
//
// Run: node --experimental-strip-types tools/park-check.mjs

import { register } from "node:module";

register(new URL("./ts-resolve.mjs", import.meta.url));
const THREE = await import("three");
const { SkateModel, EMPTY_INPUT } = await import("../src/skate/skate-model.ts");
const { SkaterRig } = await import("../src/skate/skater-rig.ts");
const { STREET_SPOT } = await import("../src/world/spot.ts");

const STEP = 1 / 60;
let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const scene = new THREE.Scene();
const rig = new SkaterRig(scene);
const m = new SkateModel({}, STREET_SPOT);
for (let i = 0; i < 30; i++) m.update({ ...EMPTY_INPUT, throttle: true }, STEP);
m.update({ ...EMPTY_INPUT, boardPressed: true }, STEP);
rig.sync(m, STEP);

const park = m.boardPark;
check("he is walking", m.walking === true);
check("…and the ride remembers the deck", park !== null);

const ridden = scene.children.find((c) => c !== rig.root && c.type !== "Scene");
check("…and the rig put a deck in the world", !!ridden, ridden ? ridden.type : "nothing");
if (ridden) {
  const box = new THREE.Box3().setFromObject(ridden);
  const ground = STREET_SPOT.height(park.x, park.z);
  check("…standing on the ground, not floating", Math.abs(box.min.y - ground) < 0.08, `deck bottom ${(box.min.y - ground).toFixed(3)} m off the floor`);
  const flat = Math.hypot(box.getCenter(new THREE.Vector3()).x - park.x, box.getCenter(new THREE.Vector3()).z - park.z);
  check("…where the ride left it", flat < 0.05, `${flat.toFixed(3)} m off the park point`);
  const fromHim = Math.hypot(m.position.x - park.x, m.position.z - park.z);
  check("…a step away, not under his shoes", fromHim > 0.35 && fromHim < 1.2, `${fromHim.toFixed(2)} m from him`);
  check("…and the ridden deck is hidden", rig.boardFlip.visible === false);
}

// Back on: the copy goes, the ridden deck returns.
for (let i = 0; i < 240; i++) {
  const dx = park.x - m.position.x;
  const dz = park.z - m.position.z;
  if (Math.hypot(dx, dz) < 0.6) break;
  const want = Math.atan2(dx, dz);
  const diff = ((want - m.heading + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  m.update({ ...EMPTY_INPUT, throttle: Math.abs(diff) < 0.5, steer: Math.max(-1, Math.min(1, -diff * 2)) }, STEP);
}
m.update({ ...EMPTY_INPUT, boardPressed: true }, STEP);
rig.sync(m, STEP);
check("stepping back on takes the copy away", scene.children.filter((c) => c !== rig.root && c.type !== "Scene").length === 0);
check("…and the deck under him is drawn again", rig.boardFlip.visible === true);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exitCode = failures === 0 ? 0 : 1;
