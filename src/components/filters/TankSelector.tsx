"use client";

interface TankSelectorProps {
  tanks: number[];
  selected: number[];
  onChange: (selected: number[]) => void;
}

export function TankSelector({ tanks, selected, onChange }: TankSelectorProps) {
  const sortedTanks = [...tanks].sort((a, b) => a - b);

  function toggleTank(tankNumber: number) {
    if (selected.includes(tankNumber)) {
      if (selected.length <= 1) {
        return;
      }
      onChange(selected.filter((value) => value !== tankNumber));
      return;
    }

    onChange([...selected, tankNumber].sort((a, b) => a - b));
  }

  return (
    <div className="min-w-0 w-full">
      <div className="grid grid-cols-5 gap-1 border border-ink/30 bg-white p-2">
        {sortedTanks.map((tank) => (
          <label
            key={tank}
            className="flex cursor-pointer items-center gap-1 border border-transparent px-1.5 py-1 text-xs hover:border-ink/20"
          >
            <input
              type="checkbox"
              checked={selected.includes(tank)}
              onChange={() => toggleTank(tank)}
              className="accent-ink"
            />
            T{tank}
          </label>
        ))}
      </div>
    </div>
  );
}
