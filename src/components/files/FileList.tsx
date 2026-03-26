'use client';

import { FileItem } from '@/components/files/FileItem';
import type { FileInfo } from '@/lib/types';

interface FileListProps {
  files: FileInfo[];
  selectedFileId: number | null;
  onSelect: (fileId: number) => void;
}

export function FileList({ files, selectedFileId, onSelect }: FileListProps) {
  if (!files.length) {
    return (
      <div className="h-full border border-dashed border-ink/20 p-4 text-sm text-ink/60">
        Список файлов пуст. Выберите архив для загрузки данных.
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto border border-ink/20 bg-white p-1.5">
      <div className="space-y-1.5">
        {files.map((file) => (
          <FileItem
            key={file.id}
            file={file}
            selected={selectedFileId === file.id}
            onClick={() => onSelect(file.id)}
          />
        ))}
      </div>
    </div>
  );
}
