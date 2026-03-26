'use client';

import { useMemo } from 'react';
import { AlertCircle, FolderOpen, RefreshCw } from 'lucide-react';

import { FileDetails } from '@/components/files/FileDetails';
import { FileList } from '@/components/files/FileList';
import { Button } from '@/components/ui/Button';
import type { FileDetails as FileDetailsType, FileInfo } from '@/lib/types';

interface SidebarProps {
  files: FileInfo[];
  selectedFileId: number | null;
  selectedFileDetails: FileDetailsType | null;
  searchQuery: string;
  onSearchQuery: (value: string) => void;
  onSelectFile: (fileId: number) => void;
  onPickArchive: () => Promise<void>;
  onRescan: () => Promise<void>;
}

export function Sidebar({
  files,
  selectedFileId,
  selectedFileDetails,
  searchQuery,
  onSearchQuery,
  onSelectFile,
  onPickArchive,
  onRescan
}: SidebarProps) {
  const counters = useMemo(() => {
    const acc = { total: files.length, ok: 0, warning: 0, error: 0 };
    for (const file of files) {
      if (file.status === 'ok') acc.ok += 1;
      if (file.status === 'warning') acc.warning += 1;
      if (file.status === 'error') acc.error += 1;
    }
    return acc;
  }, [files]);

  const filtered = useMemo(
    () => files.filter((file) => file.filename.toLowerCase().includes(searchQuery.toLowerCase())),
    [files, searchQuery]
  );

  return (
    <aside className="flex h-full min-h-0 w-full flex-col gap-2.5 border border-ink/20 bg-white p-2.5">
      <div className="flex items-center gap-2">
        <Button className="flex-1" onClick={onPickArchive}>
          <FolderOpen className="mr-2 h-4 w-4" />
          Выбрать архив
        </Button>
        <Button variant="secondary" onClick={onRescan} title="Пересканировать">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        <Metric title="Всего" value={String(counters.total)} tone="text-ink" />
        <Metric title="OK" value={String(counters.ok)} tone="text-leaf" />
        <Metric title="Warn" value={String(counters.warning)} tone="text-warning" />
        <Metric title="Err" value={String(counters.error)} tone="text-ember" />
      </div>

      <label className="flex items-center gap-2 border border-ink/30 bg-white px-3 py-2">
        <AlertCircle className="h-4 w-4 text-ink/50" />
        <input
          value={searchQuery}
          onChange={(event) => onSearchQuery(event.target.value)}
          placeholder="Фильтр файлов"
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink/40"
        />
      </label>

      <div className="min-h-0 flex-1">
        <FileList files={filtered} selectedFileId={selectedFileId} onSelect={onSelectFile} />
      </div>

      <div className="shrink-0 overflow-auto xl:max-h-[34%]">
        <FileDetails details={selectedFileDetails} />
      </div>
    </aside>
  );
}

function Metric({ title, value, tone }: { title: string; value: string; tone: string }) {
  return (
    <div className="border border-ink/20 bg-white p-1.5 text-center">
      <p className="text-[10px] uppercase tracking-wider text-ink/50">{title}</p>
      <p className={`text-sm font-bold ${tone}`}>{value}</p>
    </div>
  );
}
