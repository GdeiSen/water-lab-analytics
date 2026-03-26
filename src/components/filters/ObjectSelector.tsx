"use client";

import type { TechnologicalObject } from "@/lib/types";

interface ObjectSelectorProps {
  objects: TechnologicalObject[];
  selectedKeys: string[];
  onChange: (selected: string[]) => void;
}

export function ObjectSelector({
  objects,
  selectedKeys,
  onChange,
}: ObjectSelectorProps) {
  const sortedObjects = [...objects].sort(
    (left, right) => left.order - right.order,
  );

  function toggleObject(objectKey: string) {
    if (selectedKeys.includes(objectKey)) {
      onChange(selectedKeys.filter((key) => key !== objectKey));
      return;
    }

    onChange([...selectedKeys, objectKey]);
  }

  if (sortedObjects.length === 0) {
    return (
      <div className="border border-ink/30 bg-white px-2 py-2 text-sm text-ink/60">
        Нет объектов
      </div>
    );
  }

  return (
    <div className="max-h-44 overflow-auto border border-ink/30 bg-white p-1.5">
      <div className="grid grid-cols-1 gap-1">
        {sortedObjects.map((object) => (
          <label
            key={object.key}
            className="flex cursor-pointer items-center gap-2 border border-transparent px-1.5 py-1 text-xs hover:border-ink/20"
          >
            <input
              type="checkbox"
              checked={selectedKeys.includes(object.key)}
              onChange={() => toggleObject(object.key)}
              className="accent-ink"
            />
            <span className="min-w-0 truncate">{object.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
