"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { Upload, FileText, CheckCircle, AlertCircle, X, Plus, Trash2, User, RefreshCw, ChevronDown, Download } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { useSearchParams } from "next/navigation";

const BACKEND_URL = "https://mall-batch-manager-api-983678294034.asia-northeast1.run.app";

type UploadStatus = {
  type: "idle" | "uploading" | "success" | "error";
  message: string;
};

type UploadedFile = {
  name: string;
  size: number;
  uploadedAt: Date;
};

// 登録商品の型
interface RegisteredProduct {
  id: string;
  productName: string;
  skuName?: string;
  amazonCode: string;
  rakutenCode: string;
  qoo10Code: string;
}

// TikTokアカウントの型
interface TikTokAccount {
  id: string;
  tiktokUserId: string;
  tiktokUserName: string;
  tiktokAvatarUrl: string;
  connectedAt: string | null;
}


function ExternalDataContent() {
  const searchParams = useSearchParams();

  // X広告データ
  const [xAdFile, setXAdFile] = useState<File | null>(null);
  const [xAdStatus, setXAdStatus] = useState<UploadStatus>({ type: "idle", message: "" });
  const [xAdHistory, setXAdHistory] = useState<UploadedFile[]>([]);
  const xAdInputRef = useRef<HTMLInputElement>(null!);

  // TikTok広告データ
  const [tiktokAdFile, setTiktokAdFile] = useState<File | null>(null);
  const [tiktokAdStatus, setTiktokAdStatus] = useState<UploadStatus>({ type: "idle", message: "" });
  const [tiktokAdHistory, setTiktokAdHistory] = useState<UploadedFile[]>([]);
  const tiktokAdInputRef = useRef<HTMLInputElement>(null!);

  // 商品一覧
  const [products, setProducts] = useState<RegisteredProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);

  // TikTokアカウント
  const [tiktokAccounts, setTiktokAccounts] = useState<TikTokAccount[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);

  // TikTokアカウント登録フォーム
  const [tiktokOpenId, setTiktokOpenId] = useState("");
  const [tiktokAccessToken, setTiktokAccessToken] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);

  // CSV一括登録
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isCsvUploading, setIsCsvUploading] = useState(false);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [csvResult, setCsvResult] = useState<{ registered: number; updated: number; failed: number } | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null!);

  // 通知メッセージ
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // URLパラメータから結果を取得
  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");
    const productId = searchParams.get("productId");

    if (success === "true") {
      setNotification({ type: "success", message: "TikTokアカウントを連携しました" });
      if (productId) {
        setSelectedProductId(productId);
      }
      // URLパラメータをクリア
      window.history.replaceState({}, "", "/external-data");
    } else if (error) {
      const errorMessages: { [key: string]: string } = {
        auth_denied: "認証がキャンセルされました",
        missing_params: "認証パラメータが不足しています",
        invalid_state: "無効な認証状態です",
        invalid_csrf: "セキュリティ検証に失敗しました",
        missing_config: "TikTok OAuth設定が不完全です",
        token_error: "アクセストークンの取得に失敗しました",
        callback_error: "認証コールバックでエラーが発生しました",
      };
      setNotification({ type: "error", message: errorMessages[error] || "認証に失敗しました" });
      window.history.replaceState({}, "", "/external-data");
    }

    // 通知を5秒後に消す
    if (success || error) {
      setTimeout(() => setNotification(null), 5000);
    }
  }, [searchParams]);

  // 商品一覧を取得
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const q = query(collection(db, "registered_products"), orderBy("productName"));
        const snapshot = await getDocs(q);
        const productList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as RegisteredProduct[];
        setProducts(productList);

        // URLパラメータでproductIdが指定されていたら選択
        const productIdFromUrl = searchParams.get("productId");
        if (productIdFromUrl && productList.some(p => p.id === productIdFromUrl)) {
          setSelectedProductId(productIdFromUrl);
        }
      } catch (error) {
        console.error("商品一覧取得エラー:", error);
      }
    };
    fetchProducts();
  }, [searchParams]);

  // 選択された商品のTikTokアカウントを取得
  useEffect(() => {
    const fetchTikTokAccounts = async () => {
      if (!selectedProductId) {
        setTiktokAccounts([]);
        return;
      }

      setIsLoadingAccounts(true);
      try {
        const response = await fetch(`${BACKEND_URL}/tiktok/accounts/${selectedProductId}`);
        const data = await response.json();
        if (data.success) {
          setTiktokAccounts(data.accounts);
        }
      } catch (error) {
        console.error("TikTokアカウント取得エラー:", error);
      } finally {
        setIsLoadingAccounts(false);
      }
    };
    fetchTikTokAccounts();
  }, [selectedProductId]);

  // TikTokアカウント登録（open_id, access_token手動入力）
  const handleTikTokRegister = async () => {
    if (!selectedProductId) {
      setNotification({ type: "error", message: "商品を選択してください" });
      setTimeout(() => setNotification(null), 3000);
      return;
    }
    if (!tiktokOpenId || !tiktokAccessToken) {
      setNotification({ type: "error", message: "Open IDとAccess Tokenを入力してください" });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    setIsRegistering(true);
    try {
      const response = await fetch(`${BACKEND_URL}/tiktok/accounts/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId: selectedProductId,
          openId: tiktokOpenId,
          accessToken: tiktokAccessToken,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setNotification({
          type: "success",
          message: data.updated ? "アカウントを更新しました" : "アカウントを登録しました"
        });
        // フォームをクリア
        setTiktokOpenId("");
        setTiktokAccessToken("");
        // アカウント一覧を再取得
        const accountsRes = await fetch(`${BACKEND_URL}/tiktok/accounts/${selectedProductId}`);
        const accountsData = await accountsRes.json();
        if (accountsData.success) {
          setTiktokAccounts(accountsData.accounts);
        }
      } else {
        setNotification({ type: "error", message: data.message || "登録に失敗しました" });
      }
      setTimeout(() => setNotification(null), 3000);
    } catch (error) {
      console.error("TikTokアカウント登録エラー:", error);
      setNotification({ type: "error", message: "登録に失敗しました" });
      setTimeout(() => setNotification(null), 3000);
    } finally {
      setIsRegistering(false);
    }
  };

  // CSVテンプレートダウンロード
  const handleDownloadTemplate = () => {
    const header = "商品名,open_id,access_token";
    const sampleRows = products.slice(0, 3).map(p => `${p.productName},,`).join('\n');
    const csvContent = header + '\n' + (sampleRows || "サンプル商品名,,");

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tiktok_accounts_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // CSV一括登録
  const handleCsvUpload = async () => {
    if (!csvFile) return;

    setIsCsvUploading(true);
    setCsvErrors([]);
    setCsvResult(null);

    try {
      const text = await csvFile.text();
      const lines = text.split('\n').filter(line => line.trim());

      // ヘッダー行をスキップ（商品名というヘッダーがある場合）
      const startIndex = lines[0]?.includes('商品名') ? 1 : 0;

      // 商品名からproductIdへのマップを作成
      const productNameToId: { [name: string]: string } = {};
      products.forEach(p => {
        productNameToId[p.productName] = p.id;
      });

      const accounts: { productId: string; openId: string; accessToken: string }[] = [];
      const errors: string[] = [];

      for (let i = startIndex; i < lines.length; i++) {
        const lineNum = i + 1;
        const parts = lines[i].split(',').map(s => s.trim());

        if (parts.length < 3) {
          errors.push(`${lineNum}行目: 列が不足しています（商品名,open_id,access_token が必要）`);
          continue;
        }

        const [productName, openId, accessToken] = parts;

        if (!productName || !openId || !accessToken) {
          errors.push(`${lineNum}行目: 空のフィールドがあります`);
          continue;
        }

        const productId = productNameToId[productName];
        if (!productId) {
          errors.push(`${lineNum}行目: 「${productName}」は登録されていない商品名です`);
          continue;
        }

        accounts.push({ productId, openId, accessToken });
      }

      if (accounts.length === 0) {
        setCsvErrors(errors.length > 0 ? errors : ["有効なアカウントデータがありません"]);
        return;
      }

      const response = await fetch(`${BACKEND_URL}/tiktok/accounts/bulk-register-v2`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accounts }),
      });

      const data = await response.json();
      if (data.success) {
        setCsvResult({
          registered: data.registered,
          updated: data.updated,
          failed: data.failed,
        });
        if (errors.length > 0) {
          setCsvErrors(errors);
        }
        setCsvFile(null);
        // 選択中の商品があれば再取得
        if (selectedProductId) {
          const accountsRes = await fetch(`${BACKEND_URL}/tiktok/accounts/${selectedProductId}`);
          const accountsData = await accountsRes.json();
          if (accountsData.success) {
            setTiktokAccounts(accountsData.accounts);
          }
        }
      } else {
        setCsvErrors([data.message || "一括登録に失敗しました"]);
      }
    } catch (error) {
      console.error("CSV一括登録エラー:", error);
      setCsvErrors(["一括登録に失敗しました"]);
    } finally {
      setIsCsvUploading(false);
    }
  };

  // TikTokアカウント削除
  const handleDeleteTikTokAccount = async (accountId: string) => {
    if (!confirm("このTikTokアカウントの連携を解除しますか？")) return;

    try {
      const response = await fetch(`${BACKEND_URL}/tiktok/accounts/${accountId}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (data.success) {
        setTiktokAccounts(prev => prev.filter(a => a.id !== accountId));
        setNotification({ type: "success", message: "アカウントを削除しました" });
        setTimeout(() => setNotification(null), 3000);
      }
    } catch (error) {
      console.error("TikTokアカウント削除エラー:", error);
      setNotification({ type: "error", message: "削除に失敗しました" });
      setTimeout(() => setNotification(null), 3000);
    }
  };

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

  const formatDate = (date: Date | string) => {
    const d = typeof date === "string" ? new Date(date) : date;
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  };

  const selectedProduct = products.find(p => p.id === selectedProductId);

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
    inputRef: React.RefObject<HTMLInputElement>;
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
      {/* 通知メッセージ */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 ${
          notification.type === "success" ? "bg-green-500 text-white" : "bg-red-500 text-white"
        }`}>
          {notification.type === "success" ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          {notification.message}
        </div>
      )}

      {/* ページタイトル */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">外部データ入稿</h1>
        <p className="text-gray-600 mt-1">
          外部広告プラットフォームのデータをCSVでアップロード、またはアカウント連携で自動取得します
        </p>
      </div>

      {/* TikTokアカウント連携セクション */}
      <div className="bg-white rounded-xl shadow-sm border-2 border-pink-200 overflow-hidden">
        <div className="bg-pink-50 px-6 py-4 border-b border-pink-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-pink-600">TikTokアカウント連携</h3>
            <span className="px-2 py-0.5 bg-pink-600 text-white text-xs rounded-full">OAuth</span>
          </div>
        </div>
        <div className="p-6">
          {/* 商品選択 */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              対象商品を選択
            </label>
            <div className="relative">
              <button
                onClick={() => setIsProductDropdownOpen(!isProductDropdownOpen)}
                className="w-full md:w-96 px-4 py-3 border border-gray-300 rounded-lg text-left flex items-center justify-between hover:border-gray-400 transition-colors"
              >
                <span className={selectedProduct ? "text-gray-800" : "text-gray-400"}>
                  {selectedProduct ? selectedProduct.productName : "商品を選択してください"}
                </span>
                <ChevronDown size={20} className={`text-gray-400 transition-transform ${isProductDropdownOpen ? "rotate-180" : ""}`} />
              </button>

              {isProductDropdownOpen && (
                <div className="absolute z-10 w-full md:w-96 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {products.length === 0 ? (
                    <div className="px-4 py-3 text-gray-500 text-sm">
                      商品が登録されていません
                    </div>
                  ) : (
                    products.map(product => (
                      <button
                        key={product.id}
                        onClick={() => {
                          setSelectedProductId(product.id);
                          setIsProductDropdownOpen(false);
                        }}
                        className={`w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0 ${
                          selectedProductId === product.id ? "bg-pink-50" : ""
                        }`}
                      >
                        <span className="font-medium text-gray-800">{product.productName}</span>
                        {product.skuName && (
                          <span className="text-sm text-gray-500 ml-2">({product.skuName})</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 連携済みアカウント一覧 */}
          {selectedProductId && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-gray-700">
                  連携済みアカウント
                  {tiktokAccounts.length > 0 && (
                    <span className="ml-2 px-2 py-0.5 bg-pink-100 text-pink-600 text-xs rounded-full">
                      {tiktokAccounts.length}件
                    </span>
                  )}
                </h4>
                <button
                  onClick={() => {
                    setIsLoadingAccounts(true);
                    fetch(`${BACKEND_URL}/tiktok/accounts/${selectedProductId}`)
                      .then(res => res.json())
                      .then(data => {
                        if (data.success) setTiktokAccounts(data.accounts);
                      })
                      .finally(() => setIsLoadingAccounts(false));
                  }}
                  className="text-gray-400 hover:text-gray-600"
                  title="更新"
                >
                  <RefreshCw size={16} className={isLoadingAccounts ? "animate-spin" : ""} />
                </button>
              </div>

              {isLoadingAccounts ? (
                <div className="flex items-center justify-center py-8 text-gray-400">
                  <RefreshCw size={24} className="animate-spin mr-2" />
                  読み込み中...
                </div>
              ) : tiktokAccounts.length === 0 ? (
                <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
                  <User size={32} className="mx-auto mb-2 text-gray-300" />
                  <p>連携済みのアカウントはありません</p>
                  <p className="text-sm mt-1">下のボタンからTikTokアカウントを追加してください</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {tiktokAccounts.map(account => (
                    <div
                      key={account.id}
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        {account.tiktokAvatarUrl ? (
                          <img
                            src={account.tiktokAvatarUrl}
                            alt={account.tiktokUserName}
                            className="w-10 h-10 rounded-full"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-pink-200 flex items-center justify-center">
                            <User size={20} className="text-pink-600" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-gray-800">{account.tiktokUserName}</p>
                          {account.connectedAt && (
                            <p className="text-xs text-gray-500">
                              連携日: {formatDate(account.connectedAt)}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteTikTokAccount(account.id)}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="連携解除"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* アカウント登録フォーム */}
          <div className="border border-pink-200 rounded-lg p-4 bg-pink-50/50">
            <h4 className="text-sm font-medium text-gray-700 mb-3">アカウント登録</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Open ID <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={tiktokOpenId}
                  onChange={(e) => setTiktokOpenId(e.target.value)}
                  placeholder="TikTok Open ID"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none text-sm font-mono"
                  disabled={!selectedProductId}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Access Token <span className="text-red-500">*</span></label>
                <input
                  type="password"
                  value={tiktokAccessToken}
                  onChange={(e) => setTiktokAccessToken(e.target.value)}
                  placeholder="TikTok Access Token"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none text-sm font-mono"
                  disabled={!selectedProductId}
                />
              </div>
              <button
                onClick={handleTikTokRegister}
                disabled={!selectedProductId || !tiktokOpenId || !tiktokAccessToken || isRegistering}
                className="flex items-center gap-2 px-6 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRegistering ? (
                  <RefreshCw size={18} className="animate-spin" />
                ) : (
                  <Plus size={18} />
                )}
                {isRegistering ? "登録中..." : "アカウントを登録"}
              </button>
            </div>
          </div>

          {/* CSV一括登録セクション */}
          <div className="border border-pink-200 rounded-lg p-4 bg-pink-50/50 mt-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-gray-700">CSV一括登録</h4>
              <button
                onClick={handleDownloadTemplate}
                className="flex items-center gap-1 px-3 py-1 text-xs text-pink-600 hover:text-pink-700 hover:bg-pink-100 rounded transition-colors"
              >
                <Download size={14} />
                テンプレートをダウンロード
              </button>
            </div>
            <div className="space-y-3">
              <div
                onClick={() => csvInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                  csvFile ? "border-green-300 bg-green-50" : "border-gray-300 hover:border-pink-400 hover:bg-pink-50"
                }`}
              >
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setCsvFile(file);
                      setCsvErrors([]);
                      setCsvResult(null);
                    }
                  }}
                  className="hidden"
                />
                {csvFile ? (
                  <div className="flex items-center justify-center gap-3">
                    <FileText className="w-6 h-6 text-green-600" />
                    <div className="text-left">
                      <p className="font-medium text-gray-800 text-sm">{csvFile.name}</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCsvFile(null);
                        setCsvErrors([]);
                        setCsvResult(null);
                      }}
                      className="ml-2 p-1 hover:bg-gray-200 rounded"
                    >
                      <X className="w-4 h-4 text-gray-500" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-600 text-sm">CSVファイルをクリックして選択</p>
                  </>
                )}
              </div>
              <div className="bg-white rounded p-2 text-xs text-gray-500">
                <p className="font-medium">CSVフォーマット:</p>
                <code className="block mt-1 bg-gray-100 p-2 rounded">商品名,open_id,access_token</code>
                <p className="mt-1 text-gray-400">※ 商品名は登録済みの商品と完全一致する必要があります</p>
              </div>
              <button
                onClick={handleCsvUpload}
                disabled={!csvFile || isCsvUploading}
                className="flex items-center gap-2 px-6 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCsvUploading ? (
                  <RefreshCw size={18} className="animate-spin" />
                ) : (
                  <Upload size={18} />
                )}
                {isCsvUploading ? "登録中..." : "一括登録"}
              </button>

              {/* 結果表示 */}
              {csvResult && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                  <div className="flex items-center gap-2 text-green-700 font-medium mb-1">
                    <CheckCircle size={16} />
                    登録完了
                  </div>
                  <p className="text-green-600">
                    新規登録: {csvResult.registered}件 / 更新: {csvResult.updated}件
                    {csvResult.failed > 0 && ` / 失敗: ${csvResult.failed}件`}
                  </p>
                </div>
              )}

              {/* エラー表示 */}
              {csvErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
                  <div className="flex items-center gap-2 text-red-700 font-medium mb-2">
                    <AlertCircle size={16} />
                    エラー ({csvErrors.length}件)
                  </div>
                  <ul className="space-y-1 text-red-600 text-xs max-h-32 overflow-y-auto">
                    {csvErrors.map((err, idx) => (
                      <li key={idx}>・{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {!selectedProductId && (
            <p className="text-sm text-gray-500 mt-2">
              ※ 個別登録するには、まず対象商品を選択してください
            </p>
          )}

          {/* 説明 */}
          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 mt-6">
            <p className="font-medium mb-1">TikTokアカウント連携について:</p>
            <ul className="list-disc list-inside space-y-1 text-gray-500">
              <li>TikTok Developer PortalでOpen IDとAccess Tokenを取得してください</li>
              <li>1つの商品に対して、複数のTikTokアカウントを紐付けることができます</li>
              <li>連携すると、TikTokの動画再生数やいいね数を自動で取得できます</li>
            </ul>
          </div>
        </div>
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

        {/* TikTok広告データ（CSV） */}
        <UploadSection
          title="TikTok広告データ（CSV手動アップロード）"
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

export default function ExternalDataPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin text-blue-500" /></div>}>
      <ExternalDataContent />
    </Suspense>
  );
}
