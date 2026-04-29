'use client';

import { ChartControls } from '@/components/charts/ChartControls';
import { ObjectSelector } from '@/components/filters/ObjectSelector';
import { TestTypeSelect } from '@/components/filters/TestTypeSelect';
import type { ChartGuideMode, ParameterLink, TechnologicalObject, TestType } from '@/lib/types';

interface ToolbarProps {
  testTypes: TestType[];
  selectedTestIds: number[];
  onSelectTests: (ids: number[]) => void;
  parameterLinks?: ParameterLink[];
  pendingLinkTestId?: number | null;
  onToggleParameterLink?: (testId: number) => void;
  availableObjects: TechnologicalObject[];
  selectedObjectKeys: string[];
  onChangeObjects: (keys: string[]) => void;
  showAverage: boolean;
  guideMode: ChartGuideMode;
  onToggleAverage: (show: boolean) => void;
  onGuideModeChange: (mode: ChartGuideMode) => void;
}

export function Toolbar({
  testTypes,
  selectedTestIds,
  onSelectTests,
  parameterLinks = [],
  pendingLinkTestId = null,
  onToggleParameterLink,
  availableObjects,
  selectedObjectKeys,
  onChangeObjects,
  showAverage,
  guideMode,
  onToggleAverage,
  onGuideModeChange
}: ToolbarProps) {
  return (
    <div className="space-y-3 border border-ink/20 bg-white p-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(280px,1.2fr)_minmax(280px,1fr)_auto]">
        <TestTypeSelect
          testTypes={testTypes}
          selectedTestIds={selectedTestIds}
          onChange={onSelectTests}
          parameterLinks={parameterLinks}
          pendingLinkTestId={pendingLinkTestId}
          onToggleParameterLink={onToggleParameterLink}
        />
        <ObjectSelector objects={availableObjects} selectedKeys={selectedObjectKeys} onChange={onChangeObjects} />
        <div className="flex items-end">
          <ChartControls
            showAverage={showAverage}
            guideMode={guideMode}
            onToggleAverage={onToggleAverage}
            onGuideModeChange={onGuideModeChange}
          />
        </div>
      </div>
    </div>
  );
}
