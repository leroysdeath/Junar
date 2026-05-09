import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Direction } from './game/InputManager';

export type Action = 'a' | 'b';

interface MobileControlsProps {
  onPress: (dir: Direction) => void;
  onRelease: (dir: Direction) => void;
  onActionPress: (action: Action) => void;
}

interface PadButtonProps {
  dir: Direction;
  position: string;
  icon: React.ReactNode;
  onPress: (dir: Direction) => void;
  onRelease: (dir: Direction) => void;
}

// Single D-pad button. Uses pointer capture so press tracking stays
// stable even when the finger drifts off the button — pointerup fires
// on the originating button regardless of where the finger lifts.
function PadButton({ dir, position, icon, onPress, onRelease }: PadButtonProps) {
  return (
    <button
      type="button"
      aria-label={`Move ${dir}`}
      className={`${position} bg-amber-700/90 active:bg-amber-500 hover:bg-amber-600 text-white rounded-xl flex items-center justify-center select-none touch-none border-2 border-amber-500 shadow-lg`}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        onPress(dir);
      }}
      onPointerUp={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        onRelease(dir);
      }}
      onPointerCancel={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        onRelease(dir);
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {icon}
    </button>
  );
}

interface ActionButtonProps {
  action: Action;
  label: string;
  disabled: boolean;
  onActionPress: (action: Action) => void;
}

// One-shot action button. Fires onActionPress on pointer-down only — no
// release tracking, no held-state. When disabled, renders a non-button
// div with pointer-events-none so taps pass through (no ghost handler).
function ActionButton({ action, label, disabled, onActionPress }: ActionButtonProps) {
  if (disabled) {
    return (
      <div
        aria-label={`${label} (unassigned)`}
        className="w-20 h-20 bg-amber-700/90 text-white rounded-full flex items-center justify-center select-none border-2 border-amber-500/60 shadow-lg pointer-events-none opacity-40 font-bold text-2xl"
      >
        {label}
      </div>
    );
  }
  return (
    <button
      type="button"
      aria-label={`${label} button`}
      className="w-20 h-20 bg-amber-700/90 active:bg-amber-500 hover:bg-amber-600 text-white rounded-full flex items-center justify-center select-none touch-none border-2 border-amber-500 shadow-lg font-bold text-2xl"
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

export function MobileControls({ onPress, onRelease, onActionPress }: MobileControlsProps) {
  return (
    <div className="flex justify-between items-end w-full max-w-[640px] mt-6 px-4 select-none gap-4">
      <div className="grid grid-cols-3 grid-rows-3 gap-2 w-56 h-56">
        <PadButton
          dir="up"
          position="col-start-2 row-start-1"
          icon={<ChevronUp size={36} />}
          onPress={onPress}
          onRelease={onRelease}
        />
        <PadButton
          dir="left"
          position="col-start-1 row-start-2"
          icon={<ChevronLeft size={36} />}
          onPress={onPress}
          onRelease={onRelease}
        />
        <PadButton
          dir="right"
          position="col-start-3 row-start-2"
          icon={<ChevronRight size={36} />}
          onPress={onPress}
          onRelease={onRelease}
        />
        <PadButton
          dir="down"
          position="col-start-2 row-start-3"
          icon={<ChevronDown size={36} />}
          onPress={onPress}
          onRelease={onRelease}
        />
      </div>
      <div className="flex gap-3 items-center pb-4">
        <ActionButton action="a" label="A" disabled onActionPress={onActionPress} />
        <ActionButton action="b" label="B" disabled={false} onActionPress={onActionPress} />
      </div>
    </div>
  );
}
