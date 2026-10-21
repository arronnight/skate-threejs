// The nollie: the same pop, off the other end of the deck.
//
// The player's sentence — *"pushing up on the right analog starts a nollie and
// when you flick from up to down you do a nollie, the opposite of an ollie and
// you can do all the same types of tricks but nollie"* — makes two claims this
// file can hold to: the pop is the same size as an ollie's, and every trick that
// follows an ollie follows a nollie with "Nollie" in front of it.
//
// Run: node --experimental-strip-types tools/nollie-check.mjs

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

function pop(nollie, extra = {}) {
  const pops = [];
  const lands = [];
  const m = new SkateModel(
    { onPop: (t, air) => pops.push([t, air]), onLand: (t) => lands.push(t) },
    STREET_SPOT,
  );
  m.update({ ...EMPTY_INPUT, olliePressed: true, nolliePressed: nollie, ...extra }, STEP);
  return { m, pops, lands };
}

const ollie = pop(false);
const nollie = pop(true);
check(
  "a nollie is the same pop as an ollie",
  Math.abs(ollie.pops[0][1] - nollie.pops[0][1]) < 1e-9,
  `air ollie ${ollie.pops[0][1].toFixed(3)} s vs nollie ${nollie.pops[0][1].toFixed(3)} s`,
);
check("…and it is called Nollie", nollie.m.trick === "Nollie", `trick ${nollie.m.trick}`);
check(
  "…the nose comes up instead of the tail",
  nollie.m.boardPitch > 0 && ollie.m.boardPitch < 0,
  `ollie ${ollie.m.boardPitch.toFixed(2)} vs nollie ${nollie.m.boardPitch.toFixed(2)}`,
);

// Every flick the pad can name, nollie and not.
const names = [
  ["KeyF", "Kickflip", "Nollie Kickflip"],
  ["KeyG", "Heelflip", "Nollie Heelflip"],
  ["KeyC", "Shove-it", "Nollie Shove-it"],
];
for (const [key, plain, prefixed] of names) {
  const a = pop(false, { [key === "KeyF" ? "kickflipPressed" : key === "KeyG" ? "heelflipPressed" : "shoveitPressed"]: true });
  const b = pop(true, { [key === "KeyF" ? "kickflipPressed" : key === "KeyG" ? "heelflipPressed" : "shoveitPressed"]: true });
  // The flick's own key arrives a beat after the pop; a same-frame press is the
  // late-flick path, which names the trick on the spot.
  check(`nollie takes a ${plain}`, b.m.trick === prefixed, `${plain} ${a.m.trick} → ${b.m.trick}`);
}

// …and a nollie does not outlive the air it was popped into.
{
  const { m } = pop(true);
  for (let i = 0; i < 240 && m.state === "air"; i++) m.update({ ...EMPTY_INPUT }, STEP);
  check("…and the nollie belongs to that air, not the next", m.state === "rolling", `state ${m.state}`);
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exitCode = failures === 0 ? 0 : 1;
