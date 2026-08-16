'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink, FileText, Pencil, Plus, Trash2, X } from 'lucide-react';
import clsx from 'clsx';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/tauri-api';
import type { DocumentCategory, DocumentInfo } from '@/lib/types';
import { useAuthStore } from '@/stores/auth-store';

interface DocumentsModalProps {
  open: boolean;
  onClose: () => void;
}

const PREVIEWABLE_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);

/**
 * Import/browse/edit container for reference documentation (methodologies,
 * report forms, standards) — see the project plan, part 5. Built on the
 * existing Modal/Button/Input primitives and the same list+details layout
 * pattern as Sidebar's file browser, adapted to documents instead of
 * archive files.
 */
export function DocumentsModal({ open, onClose }: DocumentsModalProps) {
  const session = useAuthStore((state) => state.session);
  const [categories, setCategories] = useState<DocumentCategory[]>([]);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | 'all'>('all');
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [draftCategoryId, setDraftCategoryId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!session) {
      return;
    }
    setLoading(true);
    try {
      const [nextCategories, nextDocuments] = await Promise.all([
        api.listDocumentCategories(session.token),
        api.listAllDocuments(session.token)
      ]);
      setCategories(nextCategories);
      setDocuments(nextDocuments);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось загрузить документы');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (open) {
      void refresh();
    } else {
      setSelectedDocumentId(null);
      setPreviewUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return null;
      });
    }
  }, [open, refresh]);

  const visibleDocuments = useMemo(() => {
    if (selectedCategoryId === 'all') {
      return documents;
    }
    return documents.filter((doc) => doc.categoryId === selectedCategoryId);
  }, [documents, selectedCategoryId]);

  const selectedDocument = useMemo(
    () => documents.find((doc) => doc.id === selectedDocumentId) ?? null,
    [documents, selectedDocumentId]
  );

  useEffect(() => {
    if (!selectedDocument) {
      setDraftTitle('');
      setDraftNotes('');
      setDraftCategoryId(null);
      return;
    }
    setDraftTitle(selectedDocument.title);
    setDraftNotes(selectedDocument.notes ?? '');
    setDraftCategoryId(selectedDocument.categoryId);
  }, [selectedDocument]);

  useEffect(() => {
    if (!session || !selectedDocument) {
      setPreviewUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return null;
      });
      return;
    }

    const extension = selectedDocument.extension.toLowerCase();
    const isPdf = extension === 'pdf';
    const isImage = PREVIEWABLE_IMAGE_EXTENSIONS.has(extension);
    if (!isPdf && !isImage) {
      setPreviewUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return null;
      });
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const bytes = await api.readDocumentBytes(session.token, selectedDocument.id);
        if (cancelled) {
          return;
        }
        const blob = new Blob([new Uint8Array(bytes)], { type: isPdf ? 'application/pdf' : `image/${extension}` });
        const url = URL.createObjectURL(blob);
        setPreviewUrl((current) => {
          if (current) {
            URL.revokeObjectURL(current);
          }
          return url;
        });
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Не удалось загрузить предпросмотр');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedDocument, session]);

  const handleAddCategory = async () => {
    if (!session || !newCategoryName.trim()) {
      return;
    }
    try {
      await api.createDocumentCategory(session.token, newCategoryName.trim());
      setNewCategoryName('');
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось создать категорию');
    }
  };

  const handleRenameCategory = async (categoryId: number) => {
    if (!session || !editingCategoryName.trim()) {
      setEditingCategoryId(null);
      return;
    }
    try {
      await api.renameDocumentCategory(session.token, categoryId, editingCategoryName.trim());
      setEditingCategoryId(null);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось переименовать категорию');
    }
  };

  const handleDeleteCategory = async (categoryId: number) => {
    if (!session) {
      return;
    }
    try {
      await api.deleteDocumentCategory(session.token, categoryId);
      if (selectedCategoryId === categoryId) {
        setSelectedCategoryId('all');
      }
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось удалить категорию');
    }
  };

  const handleImportDocument = async () => {
    if (!session) {
      return;
    }
    try {
      const sourcePath = await api.pickDocumentFile();
      if (!sourcePath) {
        return;
      }
      const categoryId = selectedCategoryId === 'all' ? null : selectedCategoryId;
      const created = await api.importDocument(session.token, sourcePath, categoryId, null);
      toast.success('Документ добавлен');
      await refresh();
      setSelectedDocumentId(created.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось добавить документ');
    }
  };

  const handleSaveDocument = async () => {
    if (!session || !selectedDocument || !draftTitle.trim()) {
      return;
    }
    try {
      await api.updateDocument(
        session.token,
        selectedDocument.id,
        draftTitle.trim(),
        draftCategoryId,
        draftNotes.trim() ? draftNotes.trim() : null
      );
      toast.success('Документ сохранён');
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось сохранить документ');
    }
  };

  const handleDeleteDocument = async () => {
    if (!session || !selectedDocument) {
      return;
    }
    try {
      await api.deleteDocument(session.token, selectedDocument.id);
      setSelectedDocumentId(null);
      toast.success('Документ удалён');
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось удалить документ');
    }
  };

  const handleRevealDocument = async () => {
    if (!session || !selectedDocument) {
      return;
    }
    try {
      await api.revealDocument(session.token, selectedDocument.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось открыть документ');
    }
  };

  return (
    <Modal title="Документация" open={open} onClose={onClose} widthClassName="max-w-5xl">
      <div className="grid min-h-[420px] grid-cols-1 gap-3 md:grid-cols-[200px_260px_1fr]">
        <div className="space-y-2 border border-ink/15 p-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/60">Категории</p>
          <button
            type="button"
            onClick={() => setSelectedCategoryId('all')}
            className={clsx(
              'block w-full border px-2 py-1.5 text-left text-sm transition',
              selectedCategoryId === 'all' ? 'border-ink bg-ink/5' : 'border-transparent hover:bg-ink/5'
            )}
          >
            Все документы
          </button>
          <div className="space-y-1">
            {categories.map((category) => (
              <div
                key={category.id}
                className={clsx(
                  'group flex items-center gap-1 border px-1.5 py-1 text-sm transition',
                  selectedCategoryId === category.id ? 'border-ink bg-ink/5' : 'border-transparent hover:bg-ink/5'
                )}
              >
                {editingCategoryId === category.id ? (
                  <>
                    <input
                      autoFocus
                      value={editingCategoryName}
                      onChange={(event) => setEditingCategoryName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          void handleRenameCategory(category.id);
                        }
                        if (event.key === 'Escape') {
                          setEditingCategoryId(null);
                        }
                      }}
                      className="h-7 min-w-0 flex-1 border border-ink/30 px-1.5 text-sm"
                    />
                    <button type="button" onClick={() => void handleRenameCategory(category.id)} title="Сохранить">
                      <Check className="h-3.5 w-3.5 text-leaf" />
                    </button>
                    <button type="button" onClick={() => setEditingCategoryId(null)} title="Отмена">
                      <X className="h-3.5 w-3.5 text-ink/50" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setSelectedCategoryId(category.id)}
                      className="min-w-0 flex-1 truncate text-left"
                    >
                      {category.name}
                    </button>
                    <button
                      type="button"
                      className="opacity-0 transition group-hover:opacity-100"
                      onClick={() => {
                        setEditingCategoryId(category.id);
                        setEditingCategoryName(category.name);
                      }}
                      title="Переименовать"
                    >
                      <Pencil className="h-3.5 w-3.5 text-ink/50" />
                    </button>
                    <button
                      type="button"
                      className="opacity-0 transition hover:text-ember group-hover:opacity-100"
                      onClick={() => void handleDeleteCategory(category.id)}
                      title="Удалить категорию"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-ink/50" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1 pt-1">
            <input
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void handleAddCategory();
                }
              }}
              placeholder="Новая категория"
              className="h-8 min-w-0 flex-1 border border-ink/30 px-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void handleAddCategory()}
              disabled={!newCategoryName.trim()}
              className="flex h-8 w-8 shrink-0 items-center justify-center border border-ink/30 disabled:opacity-40"
              title="Добавить категорию"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-2 border border-ink/15 p-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/60">Документы</p>
            <Button size="sm" onClick={() => void handleImportDocument()}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Добавить
            </Button>
          </div>
          {loading ? (
            <p className="text-sm text-ink/50">Загрузка...</p>
          ) : visibleDocuments.length === 0 ? (
            <p className="border border-dashed border-ink/20 p-3 text-sm text-ink/50">Документов пока нет.</p>
          ) : (
            <div className="max-h-[380px] space-y-1 overflow-auto">
              {visibleDocuments.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => setSelectedDocumentId(doc.id)}
                  className={clsx(
                    'flex w-full items-center gap-2 border px-2 py-1.5 text-left text-sm transition',
                    selectedDocumentId === doc.id ? 'border-ink bg-ink/5' : 'border-ink/10 hover:border-ink/30'
                  )}
                >
                  <FileText className="h-4 w-4 shrink-0 text-ink/40" />
                  <span className="min-w-0 flex-1 truncate">{doc.title}</span>
                  <span className="shrink-0 text-[10px] uppercase text-ink/40">{doc.extension}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border border-ink/15 p-3">
          {!selectedDocument ? (
            <div className="flex h-full items-center justify-center text-sm text-ink/50">
              Выберите документ для просмотра.
            </div>
          ) : (
            <div className="space-y-3">
              <Input label="Название" value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />

              <label className="flex flex-col gap-1.5 text-sm font-medium text-ink/80">
                Категория
                <select
                  className="h-10 border border-ink/30 bg-white px-3 text-sm text-ink"
                  value={draftCategoryId ?? ''}
                  onChange={(event) => setDraftCategoryId(event.target.value ? Number(event.target.value) : null)}
                >
                  <option value="">Без категории</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5 text-sm font-medium text-ink/80">
                Заметки
                <textarea
                  value={draftNotes}
                  onChange={(event) => setDraftNotes(event.target.value)}
                  rows={3}
                  className="border border-ink/30 bg-white p-2 text-sm text-ink"
                />
              </label>

              <div className="flex flex-wrap items-center gap-2 text-xs text-ink/50">
                <span>{selectedDocument.originalName}</span>
                <span>·</span>
                <span>{formatFileSize(selectedDocument.sizeBytes)}</span>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void handleSaveDocument()}>
                  Сохранить
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void handleRevealDocument()}>
                  <ExternalLink className="mr-1 h-3.5 w-3.5" />
                  Открыть во внешнем приложении
                </Button>
                <Button size="sm" variant="danger" onClick={() => void handleDeleteDocument()}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Удалить
                </Button>
              </div>

              {previewUrl && selectedDocument.extension.toLowerCase() === 'pdf' && (
                <iframe title={selectedDocument.title} src={previewUrl} className="h-[320px] w-full border border-ink/15" />
              )}
              {previewUrl && selectedDocument.extension.toLowerCase() !== 'pdf' && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt={selectedDocument.title}
                  className="max-h-[320px] w-full border border-ink/15 object-contain"
                />
              )}
              {!previewUrl && (
                <p className="border border-dashed border-ink/20 p-3 text-xs text-ink/50">
                  Предпросмотр недоступен для формата .{selectedDocument.extension || '?'} — откройте файл во внешнем
                  приложении.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} Б`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} КБ`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
