"use client";

import { useState, useRef } from "react";
import { Upload, FileText, CheckCircle, AlertCircle, X } from "lucide-react";

type UploadStatus = {
  type: "idle" | "uploading" | "success" | "error";
  message: string;
};

type UploadedFile = {
  name: string;
  size: number;
  uploadedAt: Date;
};

export default function ExternalDataPage() {
  // X広告データ
  const [xAdFile, setXAdFile] = useState<File | null>(null);
  const [xAdStatus, setXAdStatus] = useState<UploadStatus>({ type: "idle", message: "" });
  const [xAdHistory, setXAdHistory] = useState<UploadedFile[]>([]);
  const xAdInputRef = useRef<HTMLInputElement>(null);

  // TikTok広告データ
  const [tiktokAdFile, setTiktokAdFile] = useState<File | null>(null);
  const [tiktokAdStatus, setTiktokAdStatus] = useState<UploadStatus>({ type: "idle", message: "" });
  const [tiktokAdHistory, setTiktokAdHistory] = useState<UploadedFile[]>([]);
  const tiktokAdInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (
    event: React.ChangeEvent<HTMLInputElement>,
    setFile: (file: File | null) => void,
    setStatus: (status: UploadStatus) => void
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.endsWith(".csv")) {
        setStatus({ type: "error", message: "CSVファイルのみアップロード可能です" });
        return;
      }
      setFile(file);
      setStatus({ type: "idle", message: "" });
    }
  };

  const handleUpload = async (
    file: File | null,
    type: "x" | "tiktok",
    setStatus: (status: UploadStatus) => void,
    setHistory: React.Dispatch<React.SetStateAction<UploadedFile[]>>,
    setFile: (file: File | null) => void
  ) => {
    if (!file) return;

    setStatus({ type: "uploading", message: "アップロード中..." });

    // TODO: 実際のアップロード処理を実装
    // 現在はダミーの遅延を入れてシミュレート
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // 成功として処理
    setHistory((prev) => [
      { name: file.name, size: file.size, uploadedAt: new Date() },
      ...prev,
    ]);
    setStatus({ type: "success", message: "アップロードが完了しました" });
    setFile(null);

    // 3秒後にステータスをリセット
    setTimeout(() => {
      setStatus({ type: "idle", message: "" });
    }, 3000);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  // アップロードセクションのコンポーネント
  const UploadSection = ({
    title,
    color,
    bgColor,
    borderColor,
    file,
    setFile,
    status,
    setStatus,
    history,
    setHistory,
    inputRef,
    type,
  }: {
    title: string;
    color: string;
    bgColor: string;
    borderColor: string;
    file: File | null;
    setFile: (file: File | null) => void;
    status: UploadStatus;
    setStatus: (status: UploadStatus) => void;
    history: UploadedFile[];
    setHistory: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
    inputRef: React.RefObject<HTMLInputElement | null>;
    type: "x" | "tiktok";
  }) => (
    <div className={`bg-white rounded-xl shadow-sm border-2 ${borderColor} overflow-hidden`}>
      <div className={`${bgColor} px-6 py-4 border-b ${borderColor}`}>
        <h3 className="text-lg font-bold" style={{ color }}>
          {title}
        </h3>
      </div>
      <div className="p-6">
        {/* ドロップゾーン */}
        <div
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            file ? "border-green-300 bg-green-50" : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            onChange={(e) => handleFileSelect(e, setFile, setStatus)}
            className="hidden"
          />
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <FileText className="w-8 h-8 text-green-600" />
              <div className="text-left">
                <p className="font-medium text-gray-800">{file.name}</p>
                <p className="text-sm text-gray-500">{formatFileSize(file.size)}</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                }}
                className="ml-2 p-1 hover:bg-gray-200 rounded"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
          ) : (
            <>
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 font-medium">CSVファイルをクリックして選択</p>
              <p className="text-sm text-gray-400 mt-1">またはドラッグ＆ドロップ</p>
            </>
          )}
        </div>

        {/* アップロードボタン */}
        <div className="mt-4 flex items-center gap-4">
          <button
            onClick={() => handleUpload(file, type, setStatus, setHistory, setFile)}
            disabled={!file || status.type === "uploading"}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload size={18} />
            {status.type === "uploading" ? "アップロード中..." : "アップロード"}
          </button>

          {status.type === "success" && (
            <span className="flex items-center gap-1 text-green-600 font-medium">
              <CheckCircle size={18} />
              {status.message}
            </span>
          )}
          {status.type === "error" && (
            <span className="flex items-center gap-1 text-red-600 font-medium">
              <AlertCircle size={18} />
              {status.message}
            </span>
          )}
        </div>

        {/* アップロード履歴 */}
        {history.length > 0 && (
          <div className="mt-6">
            <h4 className="text-sm font-medium text-gray-600 mb-2">アップロード履歴</h4>
            <div className="space-y-2">
              {history.slice(0, 5).map((item, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-700">{item.name}</span>
                    <span className="text-gray-400">({formatFileSize(item.size)})</span>
                  </div>
                  <span className="text-gray-500">{formatDate(item.uploadedAt)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* フォーマット説明 */}
        <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 mt-4">
          <p className="font-medium mb-1">CSVフォーマット（暫定）:</p>
          <p className="text-gray-500">
            ※ フォーマットは今後変更される可能性があります
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ページタイトル */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">外部データ入稿</h1>
        <p className="text-gray-600 mt-1">
          外部広告プラットフォームのデータをCSVでアップロードします
        </p>
      </div>

      {/* アップロードセクション */}
      <div className="grid gap-6">
        {/* X広告データ */}
        <UploadSection
          title="X（Twitter）広告データ"
          color="#000000"
          bgColor="bg-gray-100"
          borderColor="border-gray-300"
          file={xAdFile}
          setFile={setXAdFile}
          status={xAdStatus}
          setStatus={setXAdStatus}
          history={xAdHistory}
          setHistory={setXAdHistory}
          inputRef={xAdInputRef}
          type="x"
        />

        {/* TikTok広告データ */}
        <UploadSection
          title="TikTok広告データ"
          color="#000000"
          bgColor="bg-pink-50"
          borderColor="border-pink-200"
          file={tiktokAdFile}
          setFile={setTiktokAdFile}
          status={tiktokAdStatus}
          setStatus={setTiktokAdStatus}
          history={tiktokAdHistory}
          setHistory={setTiktokAdHistory}
          inputRef={tiktokAdInputRef}
          type="tiktok"
        />
      </div>
    </div>
  );
}
