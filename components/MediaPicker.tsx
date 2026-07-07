"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X, FileText, Music, Video as VideoIcon, Upload } from "lucide-react";
import { apiGetMediaLibrary, apiUploadToMediaLibrary } from "@/lib/api";
import type { MediaAsset, MediaAssetType } from "@/types";

export const ACCEPT_BY_TYPE: Record<MediaAssetType, string> = {
  IMAGE: "image/jpeg,image/png,image/gif,image/webp",
  VIDEO: "video/mp4,video/3gpp",
  AUDIO: "audio/aac,audio/mpeg,audio/ogg,audio/opus,audio/amr",
  DOCUMENT: "application/pdf,.doc,.docx,.xls,.xlsx",
};

function AssetThumb({ asset }: { asset: MediaAsset }) {
  if (asset.mediaType === "IMAGE") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={asset.url} alt={asset.filename ?? ""} className="w-full h-full object-cover" />
    );
  }
  const Icon = asset.mediaType === "VIDEO" ? VideoIcon : asset.mediaType === "AUDIO" ? Music : FileText;
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-gray-50">
      <Icon className="w-6 h-6 text-gray-300" />
      <span className="text-[9px] font-semibold text-gray-400 uppercase">{asset.format}</span>
    </div>
  );
}

// Reusable "pick from Media Library" modal, scoped to one media type — used
// by the template header picker (Image/Video/Document). Lets the user upload
// a new file on the spot instead of forcing a trip to the Media Library page.
export default function MediaPicker({
  mediaType,
  onCancel,
  onSelect,
}: {
  mediaType: MediaAssetType;
  onCancel: () => void;
  onSelect: (asset: MediaAsset) => void;
}) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGetMediaLibrary(mediaType);
      setAssets(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load media library");
    } finally {
      setLoading(false);
    }
  }, [mediaType]);

  useEffect(() => { load(); }, [load]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const res = await apiUploadToMediaLibrary(file, file.name);
      onSelect(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-[560px] max-w-full max-h-[80vh] flex flex-col">
        <div className="shrink-0 px-5 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-gray-900">Choose {mediaType.toLowerCase()}</h3>
          <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="shrink-0 px-5 pt-4">
          <input ref={fileRef} type="file" accept={ACCEPT_BY_TYPE[mediaType]} className="hidden" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-gray-200 hover:border-[#3B694C] hover:bg-[#EEF6F1] disabled:opacity-60 disabled:cursor-wait transition-colors cursor-pointer text-[13px] font-semibold text-gray-600 hover:text-[#3B694C]"
          >
            {uploading ? (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {uploading ? "Uploading…" : "Upload new"}
          </button>
          {error && <p className="text-[12px] text-red-500 mt-2">{error}</p>}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full">
          {loading ? (
            <div className="flex justify-center py-10">
              <svg className="w-5 h-5 animate-spin text-[#3B694C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
            </div>
          ) : assets.length === 0 ? (
            <p className="text-[13px] text-gray-400 text-center py-10">
              No {mediaType.toLowerCase()}s in your library yet — upload one above.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {assets.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onSelect(a)}
                  className="text-left border border-gray-200 rounded-xl overflow-hidden hover:border-[#3B694C] transition-colors cursor-pointer"
                >
                  <div className="aspect-square bg-gray-50">
                    <AssetThumb asset={a} />
                  </div>
                  <p className="text-[11px] text-gray-600 truncate px-2 py-1.5">
                    {a.filename || a.publicId.split("/").pop()}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
