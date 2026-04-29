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
  const activeObjects = sortedObjects.filter((object) => object.active !== false);
  const inactiveObjects = sortedObjects.filter((object) => object.active === false);

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
        {activeObjects.map((object) => (
          <ObjectOption
            key={object.key}
            object={object}
            checked={selectedKeys.includes(object.key)}
            onToggle={() => toggleObject(object.key)}
          />
        ))}
        {inactiveObjects.length > 0 && (
          <div className="mt-2 border-t border-ink/15 pt-2">
            <div className="mb-1 px-1.5 text-[11px] uppercase tracking-wide text-ink/45">
              Деактивированные
            </div>
            <div className="grid grid-cols-1 gap-1">
              {inactiveObjects.map((object) => (
                <ObjectOption
                  key={object.key}
                  object={object}
                  checked={selectedKeys.includes(object.key)}
                  onToggle={() => toggleObject(object.key)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface ObjectOptionProps {
  object: TechnologicalObject;
  checked: boolean;
  onToggle: () => void;
}

function ObjectOption({ object, checked, onToggle }: ObjectOptionProps) {
  return (
    <label className="flex cursor-pointer items-center gap-2 border border-transparent px-1.5 py-1 text-xs hover:border-ink/20">
      <input type="checkbox" checked={checked} onChange={onToggle} className="accent-ink" />
      <span className="min-w-0 flex-1 truncate">{object.label}</span>
    </label>
  );
}
