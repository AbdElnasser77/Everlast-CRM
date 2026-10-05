"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Lock, Images, FileText, Music, Video as VideoIcon, Trash2, Copy, Check, Pencil, ExternalLink } from "lucide-react";
import { apiGetMediaLibrary, apiUploadToMediaLibrary, apiUpdateMediaAsset, apiDeleteMediaAsset } from "@/lib/api";
import type { MediaAsset, MediaAssetType } from "@/types";
import { useCurrentUser } from "@/components/CurrentUserProvider";
import { PageSpinner } from "@/components/ui/spinner";

const FILTERS: (MediaAssetType | "ALL")[] = ["ALL", "IMAGE", "VIDEO", "DOCUMENT", "AUDIO"];
const FILTER_LABELS: Record<MediaAssetType | "ALL", string> = {
  ALL: "All",
  IMAGE: "Images",
  VIDEO: "Videos",
  DOCUMENT: "Documents",
  AUDIO: "Audio",
};

const ACCEPT = "image/jpeg,image/png,image/gif,image/webp,video/mp4,video/3gpp,audio/aac,audio/mpeg,audio/ogg,audio/opus,audio/amr,application/pdf,.doc,.docx,.xls,.xlsx";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function AssetThumb({ asset }: { asset: MediaAsset }) {
  if (asset.mediaType === "IMAGE") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={asset.url} alt={asset.filename ?? ""} className="w-full h-full object-cover" />
    );
  }
  const Icon = asset.mediaType === "VIDEO" ? VideoIcon : asset.mediaType === "AUDIO" ? Music : FileText;
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 bg-gray-50">
      <Icon className="w-7 h-7 text-gray-300" />
      <span className="text-[10px] font-semibold text-gray-400 uppercase">{asset.format}</span>
    </div>
  );
}

export default function MediaLibraryPage() {
  // Access comes from the server's permission list, never from the role
  // name: see CurrentUserProvider. `ready` is false until /users/me answers.
  const { ready, can } = useCurrentUser();
  const allowed = can("media:write");
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<MediaAssetType | "ALL">("ALL");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaAsset | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [savingName, setSavingName] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedAsset = assets.find((a) => a.id === selectedId) ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGetMediaLibrary(filter === "ALL" ? undefined : filter);
      setAssets(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load media library");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (allowed) load();
    else if (ready) setLoading(false);
  }, [allowed, ready, load]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const res = await apiUploadToMediaLibrary(file, file.name);
      await load();
      setSelectedId(res.data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDeleteMediaAsset(deleteTarget.id);
      setAssets((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      if (selectedId === deleteTarget.id) setSelectedId(null);
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  async function copyUrl(asset: MediaAsset) {
    try {
      await navigator.clipboard.writeText(asset.url);
      setCopiedId(asset.id);
      setTimeout(() => setCopiedId((id) => (id === asset.id ? null : id)), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  function startRename() {
    if (!selectedAsset) return;
    setRenameValue(selectedAsset.filename ?? "");
    setRenaming(true);
  }

  async function saveRename() {
    if (!selectedAsset) return;
    const trimmed = renameValue.trim();
    setRenaming(false);
    if (!trimmed || trimmed === (selectedAsset.filename ?? "")) return;
    setSavingName(true);
    try {
      const res = await apiUpdateMediaAsset(selectedAsset.id, { filename: trimmed });
      setAssets((prev) => prev.map((a) => (a.id === res.data.id ? res.data : a)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setSavingName(false);
    }
  }

  if (!ready) return <PageSpinner />;

  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full gap-3">
        <Lock className="w-10 h-10 text-gray-300" />
        <h1 className="text-lg font-semibold text-gray-500">Admin access only</h1>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">Media Library</h1>
          <p className="text-[13px] text-gray-400 mt-0.5">Upload images, videos, and documents to reuse in template headers</p>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Main grid */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full">
          {/* Full-width upload button */}
          <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full flex flex-col items-center justify-center gap-2 py-8 mb-6 rounded-2xl border-2 border-dashed border-gray-200 hover:border-[#3B694C] hover:bg-[#EEF6F1] disabled:opacity-60 disabled:cursor-wait transition-colors cursor-pointer group"
          >
            <div className="w-11 h-11 rounded-2xl bg-[#DCF2E3] group-hover:bg-white flex items-center justify-center transition-colors">
              {uploading ? (
                <svg className="w-5 h-5 animate-spin text-[#3B694C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
              ) : (
                <svg className="w-5 h-5 text-[#3B694C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              )}
            </div>
            <p className="text-[14px] font-semibold text-gray-700 group-hover:text-[#3B694C]">
              {uploading ? "Uploading…" : "Upload Media"}
            </p>
            <p className="text-[11px] text-gray-400">Images, video, audio, PDF/Word/Excel — up to 16 MB</p>
          </button>

          {error && <p className="text-[13px] text-red-500 text-center mb-4">{error}</p>}

          {/* Filter tabs */}
          <div className="flex gap-2 mb-5 flex-wrap">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`px-3.5 py-1.5 rounded-full text-[13px] border transition-colors cursor-pointer font-medium ${
                  filter === f
                    ? "bg-[#DCF2E3] border-[#3B694C] text-[#3B694C]"
                    : "border-gray-200 text-gray-500 hover:bg-gray-50 bg-white"
                }`}
              >
                {FILTER_LABELS[f]}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <svg className="w-6 h-6 animate-spin text-[#3B694C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
            </div>
          ) : assets.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-14 h-14 rounded-2xl bg-[#EEF6F1] flex items-center justify-center mx-auto mb-4">
                <Images className="w-6 h-6 text-[#3B694C]" />
              </div>
              <h2 className="text-[16px] font-semibold text-gray-800">No media yet</h2>
              <p className="text-[13.5px] text-gray-400 mt-1.5">Upload an image, video, or document to use in a template header.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {assets.map((a) => {
                const isSelected = a.id === selectedId;
                return (
                  <div
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    className={`relative rounded-2xl border hover:shadow-sm bg-white transition-all overflow-hidden group cursor-pointer ${
                      isSelected ? "border-2 border-[#3B694C]" : "border border-gray-100 hover:border-gray-200"
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute top-2 left-2 z-10 w-5 h-5 rounded-full bg-[#3B694C] flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" strokeWidth={3} />
                      </div>
                    )}
                    <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); copyUrl(a); }}
                        className="p-1.5 rounded-lg bg-white/90 text-gray-500 hover:text-[#3B694C] hover:bg-white shadow-sm cursor-pointer"
                        title="Copy URL"
                      >
                        {copiedId === a.id ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(a); }}
                        className="p-1.5 rounded-lg bg-white/90 text-gray-500 hover:text-red-500 hover:bg-white shadow-sm cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="aspect-square bg-gray-50">
                      <AssetThumb asset={a} />
                    </div>
                    <div className="p-2.5">
                      <p className="text-[12px] font-medium text-gray-800 truncate" title={a.filename ?? undefined}>
                        {a.filename || a.publicId.split("/").pop()}
                      </p>
                      <p className="text-[10.5px] text-gray-400 mt-0.5">
                        {formatBytes(a.bytes)} · {formatDate(a.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedAsset && (
          <div className="w-[300px] shrink-0 border-l border-gray-100 bg-white overflow-y-auto p-5 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full">
            <div className="aspect-video rounded-xl overflow-hidden bg-gray-50 mb-4 border border-gray-100">
              <AssetThumb asset={selectedAsset} />
            </div>

            {renaming ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") setRenaming(false); }}
                onBlur={saveRename}
                className="w-full text-[14px] font-semibold text-gray-900 border border-gray-200 rounded-lg px-2 py-1 mb-4 outline-none focus:border-[#3B694C]"
              />
            ) : (
              <div className="flex items-center gap-1.5 mb-4">
                <h3 className="text-[14px] font-semibold text-gray-900 truncate flex-1" title={selectedAsset.filename ?? undefined}>
                  {selectedAsset.filename || selectedAsset.publicId.split("/").pop()}
                </h3>
                <button type="button" onClick={startRename} disabled={savingName} className="text-gray-300 hover:text-gray-600 disabled:opacity-50 cursor-pointer shrink-0">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="space-y-2.5 text-[12.5px]">
              <div className="flex justify-between">
                <span className="text-gray-400">Type</span>
                <span className="text-gray-700 font-medium">{FILTER_LABELS[selectedAsset.mediaType].replace(/s$/, "")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Format</span>
                <span className="text-gray-700 font-medium uppercase">{selectedAsset.format}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Size</span>
                <span className="text-gray-700 font-medium">{formatBytes(selectedAsset.bytes)}</span>
              </div>
              {selectedAsset.width && selectedAsset.height && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Dimensions</span>
                  <span className="text-gray-700 font-medium">{selectedAsset.width} × {selectedAsset.height}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-400">Uploaded</span>
                <span className="text-gray-700 font-medium">{formatDate(selectedAsset.createdAt)}</span>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-[11px] font-semibold text-gray-500 mb-1.5">URL</p>
              <div className="flex items-center gap-1.5">
                <input readOnly value={selectedAsset.url} className="flex-1 min-w-0 text-[11px] text-gray-500 border border-gray-200 rounded-lg px-2 py-1.5 truncate outline-none bg-gray-50" />
                <button type="button" onClick={() => copyUrl(selectedAsset)} className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-[#3B694C] hover:bg-gray-50 cursor-pointer shrink-0" title="Copy URL">
                  {copiedId === selectedAsset.id ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <a href={selectedAsset.url} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-[#3B694C] hover:bg-gray-50 cursor-pointer shrink-0" title="Open in new tab">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-[12px] text-gray-400">
                {selectedAsset.usageCount > 0
                  ? `Used in ${selectedAsset.usageCount} template${selectedAsset.usageCount !== 1 ? "s" : ""}.`
                  : "Not used in any template yet."}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setDeleteTarget(selectedAsset)}
              className="w-full flex items-center justify-center gap-1.5 mt-5 py-2.5 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 text-[13px] font-semibold transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete media
            </button>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl px-6 py-6 w-[380px] max-w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-gray-900">Delete this file?</h3>
                <p className="text-[12px] text-gray-400 mt-0.5">
                  {deleteTarget.usageCount > 0
                    ? `Used in ${deleteTarget.usageCount} template${deleteTarget.usageCount !== 1 ? "s" : ""} — they'll keep showing it until edited.`
                    : "Templates already using this URL will keep showing it until edited."}
                </p>
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setDeleteTarget(null)} disabled={deleting} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-60 transition-colors cursor-pointer">
                Cancel
              </button>
              <button type="button" onClick={confirmDelete} disabled={deleting} className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-60 text-[13px] font-semibold text-white transition-colors cursor-pointer">
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
