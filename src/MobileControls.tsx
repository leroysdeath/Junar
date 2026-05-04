import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Direction } from './game/InputManager';

interface MobileControlsProps {
  onPress: (dir: Direction) => void;
  onRelease: (dir: Direction) => void;
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

export function MobileControls({ onPress, onRelease }: MobileControlsProps) {
  return (
    <div className="grid grid-cols-3 grid-rows-3 gap-2 w-56 h-56 mt-6 select-none">
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
  );
}
