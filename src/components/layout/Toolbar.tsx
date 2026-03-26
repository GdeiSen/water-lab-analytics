'use client';

import { ChartControls } from '@/components/charts/ChartControls';
import { ObjectSelector } from '@/components/filters/ObjectSelector';
import { TestTypeSelect } from '@/components/filters/TestTypeSelect';
import type { TechnologicalObject, TestType } from '@/lib/types';

interface ToolbarProps {
  testTypes: TestType[];
  selectedTestIds: number[];
  onSelectTests: (ids: number[]) => void;
  availableObjects: TechnologicalObject[];
  selectedObjectKeys: string[];
  onChangeObjects: (keys: string[]) => void;
  showAverage: boolean;
  onToggleAverage: (show: boolean) => void;
}

export function Toolbar({
  testTypes,
  selectedTestIds,
  onSelectTests,
  availableObjects,
  selectedObjectKeys,
  onChangeObjects,
  showAverage,
  onToggleAverage
}: ToolbarProps) {
  return (
    <div className="space-y-3 border border-ink/20 bg-white p-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(280px,1.2fr)_minmax(280px,1fr)_auto]">
        <TestTypeSelect testTypes={testTypes} selectedTestIds={selectedTestIds} onChange={onSelectTests} />
        <ObjectSelector objects={availableObjects} selectedKeys={selectedObjectKeys} onChange={onChangeObjects} />
        <div className="flex items-end">
          <ChartControls showAverage={showAverage} onToggleAverage={onToggleAverage} />
        </div>
      </div>
    </div>
  );
}
