// THE PAD, and the layout is Skate 3's own control page — not the keyboard
// remapped onto a controller, which is what this file used to be.
//
//   LS               carve · UP PUMPS (crouch) · DOWN POWERSLIDES · and the
//                    same axis SPINS him in the air
//   RS               FLICK-IT — the whole trick vocabulary, thrown as a
//                    direction rather than pressed as a button
//   LT / RT          PUMP on the ground (a half pull is the crouch) and GRAB
//                    in the air — one trigger, two jobs, exactly as printed
//   A / X            push, right foot and left foot (one push verb here)
//   B                brake
//   LB/BACK + D-pad  the session-marker jump — this game's reset (Skate 3 puts
//                    the mode on LB, Skate 2 on BACK; both work)
//   START            pause
//   Y                get on/off board → nothing: there is no on-foot state
//   RB               skitch → nothing to skitch behind
//   BACK             session marker / cell phone (Skate 2) or instant replay
//                    (Skate 3) → the marker half is the reset above; no phone,
//                    no replay editor
//   D-pad alone      hand gestures → no gestures here
//
// Sources, in order of weight: the Skate 3 manual's COMPLETE CONTROLS table
// (`Pump/Grab LT/RT`, `Push A/X`, `Brake B`, `Get on/off board Y`, `Steer,
// powerslide, revert, body rotation/flips LS`, `Flickit tricks, grinds, tweaks,
// manuals, bail moves RS`, `Session marker mode LB` + D-pad, `Skitch RB`,
// `Instant replay BACK`), and its FLICKIT page: "Just move [RS] in a specific
// direction or pattern" — Ollie, Nollie, Kickflip, Pop Shuvit, FS Pop Shuvit,
// 360 Pop Shuvit, 360 Flip.
//
// ── FLICK-IT, AS THE GAME DEFINES IT ────────────────────────────────────────
//
//   up                    ollie
//   up-right              kickflip
//   up-left               heelflip
//   right / left          BS / FS pop-shuvit (this game has one shove-it)
//   pull back, then up    the same ollie with the load behind it
//   hold down/up part way manual / nose manual — the manual meter's own words
//                         are "where you need to move [RS]", and Skate's
//                         manual is "down, but not completely down"
//
// The pull DOWN never pops anything by itself, and it never crouches: in this
// game the crouch is Space, which is the LS pump and the trigger, so the load
// for a big ollie comes from the hand that is pumping — the flick just throws
// the trick. A flick the sheet does not name does nothing rather than lying.
//
// ── WHAT THIS STILL CANNOT DO, HONESTLY ─────────────────────────────────────
// No nollies (down-flicks), no varials or 360 flips (multi-flick patterns), no
// revert, no tweaks while grabbing, no skitching, no off-board anything, no
// instant replay, no hand gestures, no Hall of Meat. Each is a gameplay feature
// this game does not have, not a missing binding.
//
// The pad is POLLED from inside the frame and feeds `padControl`/`padSteer`,
// the same doors the keyboard and thumbs use, so it inherits the ride's rules
// without a second copy of them. `padControl` skips the staleness clock on
// purpose: a poll taken inside the reading frame cannot be stale, and the clock
// refused presses on exactly the slow frames they landed on.

import type { TouchControlCode } from "../ui/touch-controls";

/** What this layer needs of the ride's input source. */
export interface GamepadSink {
  /** Press or release the control the keyboard reaches with `code`. */
  padControl(code: TouchControlCode, down: boolean): void;
  /**
   * The pad's crouch — LT/RT and the left stick. It is NOT the game's wind-up:
   * Skate's pop is the right-stick flick, so a trigger can bend his legs and
   * pump without ever being able to launch him.
   */
  padCrouch(down: boolean): void;
  /** The session-marker jump — set the marker, then go back to it. */
  padMarker(): void;
  /** The right stick's up-then-down flick: the pop comes off the NOSE. */
  padNollie(): void;
  /** Carve axis, −1 screen-LEFT … +1 screen-RIGHT. */
  padSteer(x: number): void;
}

export interface GamepadLayerOptions {
  input: GamepadSink;
  /** Start. The same intent Escape and the touch pause button raise. */
  onPause: () => void;
}

/** Left stick carve dead zone, rescaled so full deflection still reaches 1. */
const STICK_DEADZONE = 0.18;
/** LS up/down bands — the pump and the powerslide, with a release hysteresis. */
const LS_BAND_ON = 0.5;
const LS_BAND_OFF = 0.3;
/** A trigger has to move this far to count as pulled at all. */
const TRIGGER_ON = 0.2;

/** Right stick: partial down/up hold — Skate's manual band, "not completely down". */
const RS_MANUAL_LO = 0.32;
const RS_MANUAL_HI = 0.72;
/** How fast the stick has to travel, in stick-units per second, to be a flick. */
const FLICK_SPEED = 2.4;
/** …and how far out it has to be before the direction means anything. */
const FLICK_MAG = 0.55;
/** A flick that starts but never slows is closed after this long and read. */
const FLICK_MAX_MS = 240;
/** Two flicks closer than this are one — the game has no doubles to give. */
const FLICK_COOLDOWN_MS = 260;
/** A partial hold has to last this long before it is a manual, not a pass-through. */
const MANUAL_DELAY_MS = 220;
/** The pop lands this frame; the flip the flick asked for fires just after it. */
const TRICK_DELAY_MS = 90;
/** A pop this recent means the flick has already been popped — do not tap twice. */
const POP_DOUBLE_MS = 260;

/** Standard-mapping button indices. */
const BTN = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  BACK: 8,
  START: 9,
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
} as const;

function pressed(pad: Gamepad, index: number): boolean {
  const b = pad.buttons[index];
  return b !== undefined && (b.pressed || b.value > 0.5);
}

/** An analogue trigger's travel, 0…1, for a pad that reports it as a button. */
function trigger(pad: Gamepad, index: number): number {
  const b = pad.buttons[index];
  if (!b) return 0;
  return Math.max(b.value, b.pressed ? 1 : 0);
}

/** Hysteresis on one axis: latched on past `on`, released under `off`. */
function band(was: boolean, value: number): boolean {
  return was ? value > LS_BAND_OFF : value > LS_BAND_ON;
}

type Flick = "ollie" | "kickflip" | "heelflip" | "shoveit";

/**
 * Read a finished flick. The DESTINATION decides, because that is where the
 * player put the stick — a pull-down-then-up passes through the middle and ends
 * at the top, and it is the top that names the trick.
 */
function readFlick(x: number, y: number): Flick | null {
  // Standard mapping: y is −1 up, +1 down.
  if (y < -0.45) {
    if (x > 0.32) return "kickflip";
    if (x < -0.32) return "heelflip";
    if (Math.abs(x) < 0.5) return "ollie";
    return null;
  }
  if (y > -0.2 && Math.abs(y) < 0.5) {
    if (x > 0.55) return "shoveit";
    if (x < -0.55) return "shoveit";
  }
  return null;
}

export class GamepadLayer {
  private readonly sink: GamepadSink;
  private readonly onPause: () => void;
  /** Every control this layer is currently holding. */
  private readonly down = new Set<TouchControlCode>();
  private steer = 0;
  /** LS up / LS down, latched with hysteresis — pump and powerslide. */
  private lsUp = false;
  private lsDown = false;
  /** Right stick, last frame — the flick detector reads its velocity. */
  private rsX = 0;
  private rsY = 0;
  private rsT = 0;
  /**
   * The flick in progress: where it started, where the stick is now, and the
   * furthest UP it has been. The peak is what separates a nollie from a plain
   * push-down: the nollie's load is the stick going up first, so a throw that
   * never went up cannot be one.
   */
  /**
   * The flick in progress. `up` is the furthest up the stick has been; `down`
   * the furthest down. Both ends matter: DOWN is the load of an ollie, and a
   * throw that ends UP is an ollie only if it was loaded down first — otherwise
   * the up motion IS the nollie, which is the player's own sentence.
   */
  private flick: { start: number; x: number; y: number; up: number; down: number } | null = null;
  /**
   * The most recent time the stick was pulled fully DOWN, and how far.
   *
   * This has to live outside the flick session: a down-then-up throw can begin
   * and end inside one poll at 30 fps, so the session that ends at the top may
   * never have seen the bottom — and reading that as "no load" is what turned
   * every fast ollie into a nollie. Cleared whenever a trick fires, so a nollie
   * thrown a moment later cannot borrow the previous ollie's load.
   */
  private downAt = Number.NEGATIVE_INFINITY;
  /** How far down the stick has been in the last `FLICK_MAX_MS`. */
  private downPeak = 0;
  /** When the stick last came to rest in the middle, 0 while it is not there. */
  private neutralSince = 0;
  private lastFlick = Number.NEGATIVE_INFINITY;
  /** When the pull's release last popped him, so a flick cannot pop him twice. */
  private lastPop = Number.NEGATIVE_INFINITY;
  /** When the partial hold began, per band — 0 when the band is empty. */
  private manualSince = 0;
  private noseSince = 0;
  /** A flip the pop has already started; fired once the body is in the air. */
  private pending: { code: TouchControlCode; at: number } | null = null;
  /** Buttons already down last frame — a button HELD is one press, not sixty. */
  private readonly wasDown = new Set<number>();
  /** LB + D-pad: the session-marker jump, one reset per press. */
  private resetDown = false;
  /** The pad's crouch is down (see the poll's pump block). */
  private crouched = false;
  /** Y: on/off the board, one press per push. */
  private boardDown = false;
  /** No pad last poll — used to avoid re-releasing every frame. */
  private idle = true;

  constructor(options: GamepadLayerOptions) {
    this.sink = options.input;
    this.onPause = options.onPause;
  }

  /** The first connected pad, or null. Polled every frame; cheap when absent. */
  private pad(): Gamepad | null {
    try {
      const pads = navigator.getGamepads?.() ?? [];
      for (const pad of pads) if (pad && pad.connected) return pad;
    } catch {
      /* a browser that throws here simply has no pad */
    }
    return null;
  }

  /** Emit a transition for a HELD control. */
  private hold(code: TouchControlCode, want: boolean): void {
    if (want === this.down.has(code)) return;
    if (want) {
      this.down.add(code);
      this.sink.padControl(code, true);
    } else {
      this.down.delete(code);
      this.sink.padControl(code, false);
    }
  }

  /** Press and release in one frame — for the edge-triggered tricks and reset. */
  private tap(code: TouchControlCode): void {
    this.sink.padControl(code, true);
    this.sink.padControl(code, false);
  }

  /** True once per physical press. */
  private edge(pad: Gamepad, index: number): boolean {
    const now = pressed(pad, index);
    const was = this.wasDown.has(index);
    if (now && !was) {
      this.wasDown.add(index);
      return true;
    }
    if (!now && was) this.wasDown.delete(index);
    return false;
  }

  /** Drop the ride's holds. `wasDown` is kept, so a held Start cannot re-fire. */
  private releaseHolds(): void {
    for (const code of this.down) this.sink.padControl(code, false);
    this.down.clear();
    if (this.crouched) {
      this.crouched = false;
      this.sink.padCrouch(false);
    }
    this.sink.padSteer(0);
    this.steer = 0;
    this.lsUp = false;
    this.lsDown = false;
    this.flick = null;
    this.manualSince = 0;
    this.noseSince = 0;
    this.pending = null;
  }

  /** Drop everything, the way a lost window does — a pad that is gone. */
  private releaseAll(): void {
    this.releaseHolds();
    this.wasDown.clear();
    this.resetDown = false;
  }

  /** The pop, and the flip behind it. A flick made in the air has no pop in it. */
  private flicked(kind: Flick, nollie: boolean, now: number, grounded: boolean): void {
    // THE FLICK IS THE ONLY POP. Nothing else on this pad loads Space — the
    // crouch buttons set `padCrouch` and cannot launch him — so a flick that
    // ends up always taps the pop itself. `lastPop` stops a fast double throw from
    // buying two ollies. In the air the flick is only a flip: the board is
    // already up there.
    if (grounded && now - this.lastPop > POP_DOUBLE_MS) {
      if (nollie) this.sink.padNollie();
      else this.tap("Space");
      this.lastPop = now;
    }

    const code: TouchControlCode | null =
      kind === "kickflip" ? "KeyF" : kind === "heelflip" ? "KeyG" : kind === "shoveit" ? "KeyC" : null;
    // The model only flips with the wheels off the deck, and the pop was this
    // frame — so the flick that named the trick rides in just behind it.
    if (code) this.pending = { code, at: now + TRICK_DELAY_MS };
  }

  /**
   * One poll per frame, before `input.consume()`.
   *
   * `rideInput` is the boot saying whether the ride is reading this frame
   * (false at the title, on the pause card, in a hidden tab). `grounded` is the
   * ride's own answer, and the pad uses it for the one place Skate's sheet cares:
   * the pump and the manuals are ground moves, the trigger is a grab in the air,
   * and the flick-it itself works in the air because that is where flips live.
   */
  poll(rideInput: boolean, grounded = true): void {
    const pad = this.pad();
    if (!pad) {
      if (!this.idle) {
        this.idle = true;
        this.releaseAll();
      }
      return;
    }
    this.idle = false;

    // Start is the one input that has to work with the world stopped, and the
    // frame it lands on ends the ride's reading: a trick still in the air of the
    // flick detector must not queue behind the pause card.
    if (this.edge(pad, BTN.START)) {
      this.onPause();
      this.releaseHolds();
      return;
    }

    if (!rideInput) {
      this.releaseHolds();
      return;
    }

    const now = performance.now();
    const ax = pad.axes;
    const lx = ax[0] ?? 0;
    const ly = ax[1] ?? 0;
    const rx = ax[2] ?? 0;
    const ry = ax[3] ?? 0;

    // --- the buttons, exactly as the sheet has them --------------------------
    // A and X are both "push" (right foot, left foot); this game kicks with one
    // rhythm, so both hands reach the same door.
    const push = pressed(pad, BTN.A) || pressed(pad, BTN.X);
    const leftHand = trigger(pad, BTN.LT);
    const rightHand = trigger(pad, BTN.RT);
    const held = leftHand > TRIGGER_ON || rightHand > TRIGGER_ON;

    // --- left stick: carve, pump, powerslide ---------------------------------
    const mag = Math.abs(lx);
    const steer =
      mag > STICK_DEADZONE
        ? Math.sign(lx) * Math.min(1, (mag - STICK_DEADZONE) / (1 - STICK_DEADZONE))
        : 0;
    if (steer !== this.steer) {
      this.steer = steer;
      this.sink.padSteer(steer);
    }
    this.lsUp = band(this.lsUp, -ly);
    this.lsDown = band(this.lsDown, ly);

    // --- right stick: the flick-it system -----------------------------------
    const rawDt = this.rsT === 0 ? 1 : Math.max(1, now - this.rsT) / 1000;
    // …and judge the throw by the DISTANCE the stick covered, not by the
    // renderer's frame time: at 0.4 fps (software WebGL, and a slow laptop) one
    // real flick spans a 2.5 s frame, which divides down to 0.4 u/s and would
    // never register. Capping the frame's contribution at 50 ms keeps the
    // threshold honest at 60 fps and survivable below it.
    const dt = Math.min(0.05, rawDt);
    const dx = rx - this.rsX;
    const dy = ry - this.rsY;
    const speed = Math.hypot(dx, dy) / dt;
    const rsMag = Math.hypot(rx, ry);
    if (ry > 0.45) {
      this.downPeak = Math.max(this.downPeak, ry);
      this.downAt = now;
    }
    // A stick that has been RESTING in the middle for a moment has let go of
    // whatever load it was holding: the next throw starts from neutral, so a
    // restore-to-centre between two flicks makes the second one a fresh nollie
    // instead of borrowing the last ollie's down. A fast down-then-up passes
    // through the middle in a frame or two and keeps its load.
    if (Math.abs(ry) < 0.2) {
      if (this.neutralSince === 0) this.neutralSince = now;
      else if (now - this.neutralSince > 120) {
        this.downPeak = 0;
        this.downAt = Number.NEGATIVE_INFINITY;
      }
    } else {
      this.neutralSince = 0;
    }
    this.rsX = rx;
    this.rsY = ry;
    this.rsT = now;

    // A flick opens when the stick is thrown, and closes when it slows down —
    // the far end of the throw is the direction that names the trick. The pull
    // DOWN never opens one: it is the load, and letting it start a session would
    // put the pop 200 ms later inside its own cooldown and swallow the flick.
    const readable = ry < 0.4;
    if (
      !this.flick &&
      readable &&
      now - this.lastFlick > FLICK_COOLDOWN_MS &&
      rsMag > FLICK_MAG &&
      speed > FLICK_SPEED
    ) {
      this.flick = { start: now, x: rx, y: ry, up: ry, down: ry };
    } else if (this.flick) {
      this.flick.x = rx;
      this.flick.y = ry;
      this.flick.up = Math.min(this.flick.up, ry);
      this.flick.down = Math.max(this.flick.down, ry);
      const spent = now - this.flick.start > FLICK_MAX_MS;
      if (speed < FLICK_SPEED * 0.5 || spent) {
        // WHICH END OF THE DECK THIS POP COMES OFF.
        //
        // The player's sentence is the rule, and it has two halves that read
        // like one: *"pushing up on the right analog starts a nollie and when
        // you flick from up to down you do a nollie, the opposite of an
        // ollie."* So:
        //
        //   down … up   the stick was LOADED off the tail — an ollie
        //   up          no load first — the up motion IS the nollie
        //   down        a push-down on its own — nothing, it is the load
        //
        // That is also why the down end never fires: it is the first half of an
        // ollie, or the follow-through of a nollie that already popped at the
        // top. Reading it the other way (nollie at the bottom, deflected by a
        // one-frame park) is what the player could not get to work — the tail of
        // a flick is not a separate gesture, it is the same flick.
        const end = this.flick.y;
        const loaded =
          this.flick.down >= 0.45 ||
          (this.downPeak >= 0.45 && now - this.downAt < FLICK_MAX_MS * 2);
        const nollie = end < -0.45 && !loaded;
        const kind = nollie
          ? readFlick(-this.flick.x, end)
          : end < -0.45
            ? readFlick(this.flick.x, end)
            : null;
        this.flick = null;
        this.lastFlick = now;
        this.downPeak = 0;
        this.downAt = Number.NEGATIVE_INFINITY;
        if (kind) this.flicked(kind, nollie, now, grounded);
      }
    }

    // --- the pump: a crouch, and never the ollie ----------------------------
    // LS up pumps; a trigger pumps too (a half pull is the crouch, a full pull
    // is that hand's grab). Ground only: in the air the same trigger reaches for
    // the board instead — "Pull either LT or RT while airborne to grab".
    // This does not touch Space. Space is the keyboard's wind-up and its release
    // is the pop; the pad's crouch is `padCrouch`, which bends the legs and
    // feeds the pump impulse and cannot fire an ollie. RT/LT are NOT the ollie.
    const crouching = grounded && (this.lsUp || held);
    if (crouching !== this.crouched) {
      this.crouched = crouching;
      this.sink.padCrouch(crouching);
    }
    this.hold("KeyX", !grounded && held);

    // The powerslide is the LS pushed down — "steer, powerslide, revert" is the
    // left stick's whole job on the sheet. In this game the deck laid sideways
    // is E, so that is the door it goes through.
    this.hold("KeyE", this.lsDown);

    // Manuals: Skate's "down, but not completely" and its mirror up front. A
    // hold, not a flick — the speed test is what keeps a passing flick from
    // being caught here, and the delay keeps the stick's transit out of it.
    const inManualBand = grounded && ry > RS_MANUAL_LO && ry < RS_MANUAL_HI && speed < FLICK_SPEED;
    const inNoseBand = grounded && -ry > RS_MANUAL_LO && -ry < RS_MANUAL_HI && speed < FLICK_SPEED;
    if (inManualBand) {
      if (this.manualSince === 0) this.manualSince = now;
    } else {
      this.manualSince = 0;
    }
    if (inNoseBand) {
      if (this.noseSince === 0) this.noseSince = now;
    } else {
      this.noseSince = 0;
    }
    this.hold("ShiftLeft", this.manualSince !== 0 && now - this.manualSince > MANUAL_DELAY_MS);
    this.hold("KeyQ", this.noseSince !== 0 && now - this.noseSince > MANUAL_DELAY_MS);

    // The flip the last flick asked for, once the pop has had its frame.
    if (this.pending && now >= this.pending.at) {
      const { code } = this.pending;
      this.pending = null;
      this.tap(code);
    }

    this.hold("KeyW", push);
    this.hold("KeyS", pressed(pad, BTN.B));

    // Y — GET ON/OFF THE BOARD, exactly as the sheet has it. A press, not a
    // hold: it is a mode toggle, and a held key would flip him in and out every
    // frame. The ride ignores it mid-air and mid-grind.
    const board = pressed(pad, BTN.Y);
    if (board && !this.boardDown) this.tap("KeyY");
    this.boardDown = board;

    // The session-marker jump — a marker button plus a D-pad direction — is on
    // both Skate control pages, and this game can honour it: the first press
    // sets the marker where he stands, the next takes him back to it. The two
    // books disagree on WHICH button opens the marker (3 puts the mode on LB, 2
    // puts the phone-and-marker on BACK), so both open it here. A press, not a
    // hold, so it cannot machine-gun the marker.
    const markerHeld = pressed(pad, BTN.LB) || pressed(pad, BTN.BACK);
    const marker =
      markerHeld &&
      (pressed(pad, BTN.DPAD_UP) ||
        pressed(pad, BTN.DPAD_DOWN) ||
        pressed(pad, BTN.DPAD_LEFT) ||
        pressed(pad, BTN.DPAD_RIGHT));
    if (marker && !this.resetDown) this.sink.padMarker();
    this.resetDown = marker;
  }

  dispose(): void {
    this.boardDown = false;
    this.releaseAll();
  }
}
