import { useCallback, useEffect, useRef, useState } from 'react';
import { Direction } from './game/InputManager';

export type Action = 'a' | 'b';

interface MobileControlsProps {
  onPress: (dir: Direction) => void;
  onRelease: (dir: Direction) => void;
  onActionPress: (action: Action) => void;
  // True when App has force-rotated the game 90° CW into landscape (portrait
  // phone, no real orientation lock). The joystick anchors to that rotated root,
  // so pointer coordinates must be re-mapped to keep the stick under the finger
  // and the swipe directions aligned with the landscape view.
  forceLandscape: boolean;
}

// Re-express a screen-space point in the force-rotated root's local coordinate
// frame so a `fixed` child renders under the finger. The root is rotated 90° CW
// and anchored at left:100vw/top:0, which makes screen (x, y) → local
// (left: y, top: innerWidth − x). Identity when not rotated.
function screenPointToLocal(
  x: number,
  y: number,
  forceLandscape: boolean
): { left: number; top: number } {
  if (!forceLandscape) return { left: x, top: y };
  return { left: y, top: window.innerWidth - x };
}

// Map a screen-space displacement to the game frame (gx→right, gy→down). The
// same 90° CW rotation swaps the axes: screen (dx, dy) → game (dy, −dx), so a
// swipe toward the top of the landscape image registers as "up" in play.
function vectorToGameFrame(
  dx: number,
  dy: number,
  forceLandscape: boolean
): { gx: number; gy: number } {
  if (!forceLandscape) return { gx: dx, gy: dy };
  return { gx: dy, gy: -dx };
}

// --- Floating-joystick tuning (Task 4) ---------------------------------------
// Vampire-Survivors style: the joystick spawns wherever the finger first lands
// in the left touch zone, then the stick follows the finger clamped to a max
// radius. Movement stays on the existing cardinal contract — we translate the
// analog vector into up/down/left/right booleans via setVirtualInput, so
// InputManager and the auto-fire/LOS combat contract are untouched.
const JOYSTICK_BASE_PX = 128; // outer ring diameter
const JOYSTICK_STICK_PX = 52; // inner stick diameter
const JOYSTICK_MAX_RADIUS_PX = 52; // clamp for stick travel from the origin
const JOYSTICK_DEADZONE_PX = 14; // below this, register no direction
// Octant threshold on the unit vector. sin(22.5°) ≈ 0.383 carves eight even
// 45° sectors: one axis past the threshold → a cardinal; both past it → a
// diagonal (two booleans true at once, which the player already supports by
// combining axes).
const JOYSTICK_OCTANT_T = Math.sin(Math.PI / 8);

const NO_DIRS: Record<Direction, boolean> = {
  up: false,
  down: false,
  left: false,
  right: false,
};

// Map a raw stick displacement (screen-space px, +y down) to cardinal booleans.
function dirsFromVector(dx: number, dy: number): Record<Direction, boolean> {
  const mag = Math.hypot(dx, dy);
  if (mag < JOYSTICK_DEADZONE_PX) return NO_DIRS;
  const ux = dx / mag;
  const uy = dy / mag;
  return {
    up: uy < -JOYSTICK_OCTANT_T,
    down: uy > JOYSTICK_OCTANT_T,
    left: ux < -JOYSTICK_OCTANT_T,
    right: ux > JOYSTICK_OCTANT_T,
  };
}

interface JoystickZoneProps {
  onPress: (dir: Direction) => void;
  onRelease: (dir: Direction) => void;
  forceLandscape: boolean;
}

// The left portion of the screen is a touch zone. pointerdown spawns the
// floating joystick at the touch point; the stick follows the finger (clamped),
// and we keep pointer capture so drift off the origin (even onto the right half)
// keeps tracking until the finger lifts.
function JoystickZone({ onPress, onRelease, forceLandscape }: JoystickZoneProps) {
  const pointerIdRef = useRef<number | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  // Which cardinals are currently asserted, so we only emit press/release on
  // change (edge) rather than every move.
  const pressedRef = useRef<Record<Direction, boolean>>({ ...NO_DIRS });
  // Render state: origin (ox/oy) + clamped stick offset (sx/sy). null = hidden.
  const [stick, setStick] = useState<{
    ox: number;
    oy: number;
    sx: number;
    sy: number;
  } | null>(null);

  const applyDirections = useCallback(
    (next: Record<Direction, boolean>) => {
      (Object.keys(next) as Direction[]).forEach((d) => {
        if (next[d] !== pressedRef.current[d]) {
          pressedRef.current[d] = next[d];
          if (next[d]) onPress(d);
          else onRelease(d);
        }
      });
    },
    [onPress, onRelease]
  );

  const releaseAll = useCallback(() => {
    applyDirections(NO_DIRS);
  }, [applyDirections]);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    if (pointerIdRef.current !== null) return; // already tracking a finger
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerIdRef.current = e.pointerId;
    originRef.current = { x: e.clientX, y: e.clientY };
    setStick({ ox: e.clientX, oy: e.clientY, sx: 0, sy: 0 });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (pointerIdRef.current !== e.pointerId || !originRef.current) return;
    const dx = e.clientX - originRef.current.x;
    const dy = e.clientY - originRef.current.y;
    const mag = Math.hypot(dx, dy);
    const scale = mag > JOYSTICK_MAX_RADIUS_PX ? JOYSTICK_MAX_RADIUS_PX / mag : 1;
    // Directions are computed in the game frame so swipes match what the player
    // sees; the visual stick still tracks the raw screen displacement (sx/sy),
    // re-mapped to the rotated root only at render time.
    const { gx, gy } = vectorToGameFrame(dx, dy, forceLandscape);
    applyDirections(dirsFromVector(gx, gy));
    setStick((prev) =>
      prev ? { ...prev, sx: dx * scale, sy: dy * scale } : prev
    );
  };

  const endPointer = (e: React.PointerEvent) => {
    if (pointerIdRef.current !== e.pointerId) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    pointerIdRef.current = null;
    originRef.current = null;
    releaseAll();
    setStick(null);
  };

  // Release any held direction if the controls unmount mid-drag (e.g. the run
  // ends while a finger is down) so virtual input never stays stuck on.
  useEffect(() => {
    return () => releaseAll();
  }, [releaseAll]);

  return (
    <div
      aria-label="Movement joystick"
      className="fixed inset-y-0 left-0 w-1/2 z-40 touch-none select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onContextMenu={(e) => e.preventDefault()}
    >
      {stick && (() => {
        // ox/oy and the clamped sx/sy are stored in screen space; map both the
        // ring origin and the stick tip into the (possibly rotated) root frame
        // so they render under the finger in landscape and portrait alike.
        const base = screenPointToLocal(stick.ox, stick.oy, forceLandscape);
        const tip = screenPointToLocal(
          stick.ox + stick.sx,
          stick.oy + stick.sy,
          forceLandscape
        );
        return (
          <>
            <div
              className="fixed rounded-full border-2 border-amber-300/50 bg-amber-200/10 pointer-events-none"
              style={{
                left: base.left,
                top: base.top,
                width: JOYSTICK_BASE_PX,
                height: JOYSTICK_BASE_PX,
                transform: 'translate(-50%, -50%)',
              }}
            />
            <div
              className="fixed rounded-full bg-amber-400/60 border-2 border-amber-200/70 pointer-events-none"
              style={{
                left: tip.left,
                top: tip.top,
                width: JOYSTICK_STICK_PX,
                height: JOYSTICK_STICK_PX,
                transform: 'translate(-50%, -50%)',
              }}
            />
          </>
        );
      })()}
    </div>
  );
}

interface ActionButtonProps {
  action: Action;
  label: string;
  onActionPress: (action: Action) => void;
}

// One-shot action button. Fires onActionPress on pointer-down only — no
// release tracking, no held-state. Semi-transparent (Task 5) so it doesn't
// obscure gameplay while staying tappable.
function ActionButton({ action, label, onActionPress }: ActionButtonProps) {
  return (
    <button
      type="button"
      aria-label={`${label} button`}
      className="w-16 h-16 bg-amber-600/30 active:bg-amber-500/60 text-white/80 rounded-full flex items-center justify-center select-none touch-none border-2 border-amber-400/50 shadow-lg font-bold text-2xl backdrop-blur-sm"
      onPointerDown={(e) => {
        e.preventDefault();
        onActionPress(action);
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}

export function MobileControls({
  onPress,
  onRelease,
  onActionPress,
  forceLandscape,
}: MobileControlsProps) {
  return (
    <>
      {/* Movement: floating joystick over the left half of the screen (Task 4). */}
      <JoystickZone
        onPress={onPress}
        onRelease={onRelease}
        forceLandscape={forceLandscape}
      />

      {/* Actions: A (dash) / B (burst) pinned to the lower-right, semi-transparent
          (Task 5). z-50 keeps them above the mobile HUD (z-auto) and the
          "Reached Boss" banner (z-10, also pointer-events-none). When the root
          is force-rotated into landscape these `fixed` buttons re-anchor to that
          rotated frame, so "lower-right" stays lower-right of the landscape view.
          In the force-rotated frame the landscape's right edge maps to the
          physical bottom of the phone — where Safari's bottom toolbar / home
          indicator live — so we inset the right side generously (safe-area
          bottom inset + toolbar clearance) to keep both buttons fully on-screen
          instead of clipped under the browser chrome. */}
      <div
        className="fixed z-50 flex gap-3 select-none"
        style={{
          bottom: forceLandscape
            ? 'calc(env(safe-area-inset-left, 0px) + 1rem)'
            : '1.5rem',
          right: forceLandscape
            ? 'calc(env(safe-area-inset-bottom, 0px) + 5rem)'
            : '0.75rem',
        }}
      >
        <ActionButton action="a" label="A" onActionPress={onActionPress} />
        <ActionButton action="b" label="B" onActionPress={onActionPress} />
      </div>
    </>
  );
}
