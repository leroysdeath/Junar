import { useCallback, useEffect, useRef, useState } from 'react';
import { Direction } from './game/InputManager';

export type Action = 'a' | 'b';

interface MobileControlsProps {
  onPress: (dir: Direction) => void;
  onRelease: (dir: Direction) => void;
  onActionPress: (action: Action) => void;
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
}

// The left portion of the screen is a touch zone. pointerdown spawns the
// floating joystick at the touch point; the stick follows the finger (clamped),
// and we keep pointer capture so drift off the origin (even onto the right half)
// keeps tracking until the finger lifts.
function JoystickZone({ onPress, onRelease }: JoystickZoneProps) {
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
    applyDirections(dirsFromVector(dx, dy));
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
      {stick && (
        <>
          <div
            className="fixed rounded-full border-2 border-amber-300/50 bg-amber-200/10 pointer-events-none"
            style={{
              left: stick.ox,
              top: stick.oy,
              width: JOYSTICK_BASE_PX,
              height: JOYSTICK_BASE_PX,
              transform: 'translate(-50%, -50%)',
            }}
          />
          <div
            className="fixed rounded-full bg-amber-400/60 border-2 border-amber-200/70 pointer-events-none"
            style={{
              left: stick.ox + stick.sx,
              top: stick.oy + stick.sy,
              width: JOYSTICK_STICK_PX,
              height: JOYSTICK_STICK_PX,
              transform: 'translate(-50%, -50%)',
            }}
          />
        </>
      )}
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
}: MobileControlsProps) {
  return (
    <>
      {/* Movement: floating joystick over the left half of the screen (Task 4). */}
      <JoystickZone onPress={onPress} onRelease={onRelease} />

      {/* Actions: A (dash) / B (burst) pinned to the upper-right, semi-transparent
          (Task 5). z-50 keeps them above the mobile HUD (z-auto) and the
          "Reached Boss" banner (z-10, also pointer-events-none); the top offset
          clears the top HUD bar. The rotate-device overlay (z-60) still covers
          them in portrait, which is intended. */}
      <div className="fixed top-24 right-3 z-50 flex gap-3 select-none">
        <ActionButton action="a" label="A" onActionPress={onActionPress} />
        <ActionButton action="b" label="B" onActionPress={onActionPress} />
      </div>
    </>
  );
}
