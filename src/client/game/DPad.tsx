/**
 * On-screen D-pad for touch play: four direction buttons plus a central
 * Wait button. Large targets, warm stone styling, amber on press.
 */
type Props = {
  onMove: (dx: number, dy: number) => void;
  onWait: () => void;
  disabled: boolean;
};

function ArrowIcon({ direction }: { direction: 'up' | 'down' | 'left' | 'right' }) {
  const rotation =
    direction === 'up'
      ? 'rotate(0deg)'
      : direction === 'right'
        ? 'rotate(90deg)'
        : direction === 'down'
          ? 'rotate(180deg)'
          : 'rotate(270deg)';
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      style={{ transform: rotation }}
      aria-hidden="true"
    >
      <path
        d="M12 4 L20 14 L16.5 14 L16.5 20 L7.5 20 L7.5 14 L4 14 Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function DPad({ onMove, onWait, disabled }: Props) {
  const btn =
    'flex items-center justify-center rounded-xl bg-[#3a2b1c] text-[#f4e3c8] shadow-[0_2px_0_#17120e] transition active:translate-y-px active:bg-[#4a3826] disabled:opacity-40 disabled:pointer-events-none select-none';
  return (
    <div
      className="grid grid-cols-3 gap-2 w-[172px] mx-auto"
      role="group"
      aria-label="Movement controls"
    >
      <span />
      <button
        type="button"
        className={`${btn} h-14`}
        disabled={disabled}
        onClick={() => onMove(0, -1)}
        aria-label="Move up"
      >
        <ArrowIcon direction="up" />
      </button>
      <span />
      <button
        type="button"
        className={`${btn} h-14`}
        disabled={disabled}
        onClick={() => onMove(-1, 0)}
        aria-label="Move left"
      >
        <ArrowIcon direction="left" />
      </button>
      <button
        type="button"
        className={`${btn} h-14 text-[11px] font-bold tracking-widest`}
        disabled={disabled}
        onClick={onWait}
        aria-label="Wait a turn"
      >
        WAIT
      </button>
      <button
        type="button"
        className={`${btn} h-14`}
        disabled={disabled}
        onClick={() => onMove(1, 0)}
        aria-label="Move right"
      >
        <ArrowIcon direction="right" />
      </button>
      <span />
      <button
        type="button"
        className={`${btn} h-14`}
        disabled={disabled}
        onClick={() => onMove(0, 1)}
        aria-label="Move down"
      >
        <ArrowIcon direction="down" />
      </button>
      <span />
    </div>
  );
}
