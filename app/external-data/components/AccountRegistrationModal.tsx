"use client";

import { useState, useEffect, useRef } from "react";
import { X, ChevronDown, Copy, CheckCircle, Upload, Download, FileText } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";

const BACKEND_URL = "https://mall-batch-manager-backend-983678294034.asia-northeast1.run.app";

type Platform = "tiktok" | "instagram";
type TabType = "manual" | "authCode" | "csv";

type RegisteredProduct = {
  id: string;
  productName: string;
  skuName?: string;
};

type AccountRegistrationModalProps = {
  isOpen: boolean;
  platform: Platform;
  onClose: () => void;
  onRegistered: () => void;
};

// プラットフォーム別CSVヘッダー
const TIKTOK_CSV_HEADERS = ["商材名", "プロフィールURL", "アカウント名", "オープンID", "アクセストークン", "リフレッシュトークン", "端末", "メアド", "PW", "運用者"];
const INSTAGRAM_CSV_HEADERS = ["商材名", "プロフィールURL", "アカウント名", "アクセストークン", "端末", "メアド", "PW", "運用者"];

export default function AccountRegistrationModal({ isOpen, platform, onClose, onRegistered }: AccountRegistrationModalProps) {
  const { allowedProductIds } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>("manual");
  const [products, setProducts] = useState<RegisteredProduct[]>([]);
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);

  // 共通フィールド
  const [selectedProductId, setSelectedProductId] = useState("");
  const [device, setDevice] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [operator, setOperator] = useState("");
  const [profileUrl, setProfileUrl] = useState("");

  // 手動入力フィールド
  const [accountName, setAccountName] = useState("");
  const [openId, setOpenId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");

  // 認証コードフィールド
  const [authCode, setAuthCode] = useState("");
  const [authUrlCopied, setAuthUrlCopied] = useState(false);

  // CSV
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<string[][]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // 状態
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; message: string; profile?: { displayName: string; avatarUrl: string } } | null>(null);

  const csvHeaders = platform === "tiktok" ? TIKTOK_CSV_HEADERS : INSTAGRAM_CSV_HEADERS;

  // 商品一覧取得
  useEffect(() => {
    if (!isOpen) return;
    const fetchProducts = async () => {
      const snapshot = await getDocs(collection(db, "registered_products"));
      const list: RegisteredProduct[] = [];
      snapshot.forEach(doc => { list.push({ id: doc.id, ...doc.data() } as RegisteredProduct); });
      // クライアントユーザーの場合は許可された商品のみ表示
      if (allowedProductIds) {
        setProducts(list.filter((p) => allowedProductIds.includes(p.id)));
      } else {
        setProducts(list);
      }
    };
    fetchProducts();
  }, [isOpen]);

  const handleClose = () => {
    setResult(null);
    setAccountName(""); setOpenId(""); setAccessToken(""); setRefreshToken("");
    setAuthCode(""); setDevice(""); setEmail(""); setPassword("");
    setOperator(""); setProfileUrl(""); setSelectedProductId("");
    setAuthUrlCopied(false); setCsvFile(null); setCsvPreview([]); setCsvErrors([]);
    onClose();
  };

  // 認証URL
  const getAuthUrl = () => {
    if (platform === "tiktok") {
      return "https://www.tiktok.com/v2/auth/authorize/?client_key=7457840155068465153&scope=user.info.basic,video.list&response_type=code&redirect_uri=https%3A%2F%2Fscript.google.com%2Fmacros%2Fs%2FAKfycbyhJNjd9bDrASLwvqW049k40QHZg29ggc_4zZfX_kgNitvD4zKJvb3SXD3CTCQyVm-v%2Fexec";
    }
    // Instagram（redirect_uriは後で設定）
    return "https://api.instagram.com/oauth/authorize?client_id=1516539189822981&redirect_uri={REDIRECT_URI}&scope=user_profile,user_media&response_type=code";
  };

  const handleCopyAuthUrl = () => {
    navigator.clipboard.writeText(getAuthUrl());
    setAuthUrlCopied(true);
    setTimeout(() => setAuthUrlCopied(false), 2000);
  };

  // CSVテンプレートダウンロード
  const handleDownloadTemplate = () => {
    const bom = "\uFEFF";
    const header = csvHeaders.join(",");
    const sample = platform === "tiktok"
      ? "ハッコウパンダ,https://www.tiktok.com/@username,さちか,-000wvn5sYx...,act.XXXXX...,rft.XXXXX...,A40,user@example.com,Pass123!,田中A"
      : "UNU,https://www.instagram.com/username,千聖,IGQV...,A40,user@example.com,Pass123!,田中A";
    const blob = new Blob([bom + header + "\n" + sample + "\n"], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${platform === "tiktok" ? "TikTok" : "Instagram"}アカウント一括登録テンプレート.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // CSVファイル読み込み
  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file); setCsvErrors([]); setResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      if (lines.length < 2) { setCsvErrors(["CSVにデータ行がありません"]); setCsvPreview([]); return; }

      const rows = lines.slice(1).map(line => {
        const result: string[] = [];
        let current = "";
        let inQuotes = false;
        for (const char of line) {
          if (char === '"') inQuotes = !inQuotes;
          else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ""; }
          else current += char;
        }
        result.push(current.trim());
        return result;
      });

      // バリデーション（新列順: 商材名, プロフィールURL, アカウント名, ...）
      const errors: string[] = [];
      const atCol = platform === "tiktok" ? 4 : 3; // アクセストークンの列
      rows.forEach((row, i) => {
        const rowNum = i + 2;
        if (!row[0]) errors.push(`${rowNum}行目: 商材名が空です`);
        if (!row[1]) errors.push(`${rowNum}行目: プロフィールURLが空です`);
        if (platform === "tiktok" && !row[3]) errors.push(`${rowNum}行目: オープンIDが空です`);
        if (!row[atCol]) errors.push(`${rowNum}行目: アクセストークンが空です`);
      });

      setCsvErrors(errors);
      setCsvPreview(rows.slice(0, 5));
    };
    reader.readAsText(file, "utf-8");
  };

  // 手動登録
  const handleManualSubmit = async () => {
    if (!selectedProductId || !profileUrl) {
      setResult({ type: "error", message: "商品とプロフィールURLは必須です" });
      return;
    }
    if (platform === "tiktok" && (!openId || !accessToken)) {
      setResult({ type: "error", message: "Open IDとAccess Tokenは必須です" });
      return;
    }
    if (platform === "instagram" && !accessToken) {
      setResult({ type: "error", message: "Access Tokenは必須です" });
      return;
    }

    setIsSubmitting(true); setResult(null);
    try {
      const body: Record<string, string | undefined> = {
        productId: selectedProductId,
        accessToken,
        userName: accountName || undefined,
        device: device || undefined,
        email: email || undefined,
        password: password || undefined,
        operator: operator || undefined,
        profileUrl: profileUrl || undefined,
      };
      if (platform === "tiktok") {
        body.openId = openId;
        body.refreshToken = refreshToken || undefined;
      }

      const response = await fetch(`${BACKEND_URL}/${platform}/accounts/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (data.success) {
        setResult({ type: "success", message: data.message, profile: data.profile });
        onRegistered();
      } else {
        setResult({ type: "error", message: data.message || "Registration failed" });
      }
    } catch (error) {
      setResult({ type: "error", message: "Server connection failed" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 認証コード登録
  const handleAuthCodeSubmit = async () => {
    if (!selectedProductId || !authCode) {
      setResult({ type: "error", message: "商品と認証コードは必須です" });
      return;
    }

    setIsSubmitting(true); setResult(null);
    try {
      const body: Record<string, string | undefined> = {
        authCode,
        productId: selectedProductId,
        device: device || undefined,
        email: email || undefined,
        password: password || undefined,
        operator: operator || undefined,
      };
      // Instagramの場合はredirectUriも必要
      if (platform === "instagram") {
        body.redirectUri = "{REDIRECT_URI}"; // TODO: 実際のredirect_uriを設定
      }

      const response = await fetch(`${BACKEND_URL}/${platform}/accounts/auth-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (data.success) {
        setResult({ type: "success", message: data.message, profile: data.profile });
        onRegistered();
      } else {
        setResult({ type: "error", message: data.message || "Registration failed" });
      }
    } catch (error) {
      setResult({ type: "error", message: "Server connection failed" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // CSV一括登録
  const handleCsvSubmit = async () => {
    if (!csvFile) { setResult({ type: "error", message: "CSVファイルを選択してください" }); return; }
    if (csvErrors.length > 0) { setResult({ type: "error", message: "CSVにエラーがあります" }); return; }

    setIsSubmitting(true); setResult(null);
    try {
      const text = await csvFile.text();
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      const rows = lines.slice(1);

      const productNameToId: Record<string, string> = {};
      products.forEach(p => { productNameToId[p.productName] = p.id; });

      const accounts = rows.map(line => {
        const cols: string[] = [];
        let current = "";
        let inQuotes = false;
        for (const char of line) {
          if (char === '"') inQuotes = !inQuotes;
          else if (char === ',' && !inQuotes) { cols.push(current.trim()); current = ""; }
          else current += char;
        }
        cols.push(current.trim());

        // 新列順: 商材名, プロフィールURL, アカウント名, ...
        if (platform === "tiktok") {
          return {
            productId: productNameToId[cols[0]] || "",
            profileUrl: cols[1] || "", userName: cols[2] || "",
            openId: cols[3] || "", accessToken: cols[4] || "",
            refreshToken: cols[5] || "", device: cols[6] || "",
            email: cols[7] || "", password: cols[8] || "", operator: cols[9] || "",
          };
        }
        // Instagram
        return {
          productId: productNameToId[cols[0]] || "",
          profileUrl: cols[1] || "", userName: cols[2] || "",
          accessToken: cols[3] || "", device: cols[4] || "",
          email: cols[5] || "", password: cols[6] || "", operator: cols[7] || "",
        };
      }).filter(a => a.productId && a.accessToken);

      if (accounts.length === 0) {
        setResult({ type: "error", message: "有効なデータ行がありません" });
        setIsSubmitting(false);
        return;
      }

      const response = await fetch(`${BACKEND_URL}/${platform}/accounts/bulk-register-v2`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accounts }),
      });
      const data = await response.json();
      if (data.success) {
        setResult({ type: "success", message: data.message });
        onRegistered();
      } else {
        setResult({ type: "error", message: data.message || "Bulk registration failed" });
      }
    } catch (error) {
      setResult({ type: "error", message: "Server connection failed" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedProductName = products.find(p => p.id === selectedProductId)?.productName || "";

  const handleSubmit = () => {
    if (activeTab === "manual") return handleManualSubmit();
    if (activeTab === "authCode") return handleAuthCodeSubmit();
    return handleCsvSubmit();
  };

  const submitLabel = isSubmitting ? "処理中..."
    : activeTab === "manual" ? "登録"
    : activeTab === "authCode" ? "取得"
    : "一括登録";

  const platformLabel = platform === "tiktok" ? "TikTok" : "Instagram";

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-bold">{platformLabel} アカウント登録</h2>
          <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
        </div>

        {/* タブ */}
        <div className="flex border-b">
          {(["manual", "authCode", "csv"] as TabType[]).map(tab => (
            <button key={tab}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50" : "text-gray-500 hover:text-gray-700"
              }`}
              onClick={() => { setActiveTab(tab); setResult(null); }}>
              {tab === "manual" ? "手動入力" : tab === "authCode" ? "認証コードで取得" : "CSV一括登録"}
            </button>
          ))}
        </div>

        {/* コンテンツ */}
        <div className="p-6 space-y-4">
          {/* 結果 */}
          {result && (
            <div className={`p-4 rounded-lg ${result.type === "success" ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
              <div className="flex items-center gap-2">
                {result.type === "success" && result.profile?.avatarUrl && (
                  <img src={result.profile.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
                )}
                <div>
                  <p className={`text-sm font-medium ${result.type === "success" ? "text-green-800" : "text-red-800"}`}>{result.message}</p>
                  {result.profile && <p className="text-xs text-green-600 mt-1">{result.profile.displayName}</p>}
                </div>
              </div>
            </div>
          )}

          {/* 商品選択（手動・認証コードのみ） */}
          {activeTab !== "csv" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">商品 *</label>
              <div className="relative">
                <button type="button" onClick={() => setIsProductDropdownOpen(!isProductDropdownOpen)}
                  className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg text-sm hover:border-gray-400 focus:ring-2 focus:ring-blue-500">
                  <span className={selectedProductName ? "text-gray-900" : "text-gray-400"}>{selectedProductName || "商品を選択してください"}</span>
                  <ChevronDown size={16} className={`transition-transform ${isProductDropdownOpen ? "rotate-180" : ""}`} />
                </button>
                {isProductDropdownOpen && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {products.map(p => (
                      <button key={p.id} onClick={() => { setSelectedProductId(p.id); setIsProductDropdownOpen(false); }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${selectedProductId === p.id ? "bg-blue-100 text-blue-700" : ""}`}>
                        {p.productName}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 手動入力タブ */}
          {activeTab === "manual" && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">プロフィールURL *</label>
                <input type="text" value={profileUrl} onChange={e => setProfileUrl(e.target.value)}
                  placeholder={platform === "tiktok" ? "例: https://www.tiktok.com/@username" : "例: https://www.instagram.com/username"}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">アカウント名</label>
                <input type="text" value={accountName} onChange={e => setAccountName(e.target.value)}
                  placeholder="空欄の場合は自動取得"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
              {platform === "tiktok" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Open ID *</label>
                  <input type="text" value={openId} onChange={e => setOpenId(e.target.value)}
                    placeholder="例: -000wvn5sYxtsybTHShygcP47hOdcVLnLiTQ"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Access Token *</label>
                <input type="text" value={accessToken} onChange={e => setAccessToken(e.target.value)}
                  placeholder={platform === "tiktok" ? "act.XXXXX..." : "EAA..."}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
              {platform === "tiktok" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Refresh Token</label>
                  <input type="text" value={refreshToken} onChange={e => setRefreshToken(e.target.value)}
                    placeholder="rft.XXXXX..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
              )}
              {platform === "instagram" && (
                <p className="text-xs text-blue-600">※ アクセストークンは自動で長期トークン（60日）に交換されます</p>
              )}
            </>
          )}

          {/* 認証コードタブ */}
          {activeTab === "authCode" && (
            <>
              {platform === "instagram" ? (
                <>
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-purple-800 mb-2">Instagram認証</h3>
                    <p className="text-xs text-purple-700 mb-3">
                      下のボタンをクリックするとFacebookログイン画面が開きます。認可すると自動でアカウントが登録されます。
                    </p>
                    {!selectedProductId ? (
                      <p className="text-xs text-red-600">※ 先に商品を選択してください</p>
                    ) : (
                      <button
                        onClick={() => {
                          window.location.href = `${BACKEND_URL}/auth/instagram/login?productId=${selectedProductId}`;
                        }}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-medium hover:from-purple-600 hover:to-pink-600 transition-all"
                      >
                        Instagramで認証する
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-blue-800 mb-2">手順</h3>
                    <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
                      <li>下のURLをブラウザで開いてTikTokにログイン・認可する</li>
                      <li>リダイレクト後のURLから <code className="bg-blue-100 px-1 rounded">code=</code> パラメータの値をコピー</li>
                      <li>下の認証コード欄にペーストして「取得」ボタンを押す</li>
                    </ol>
                    <div className="mt-3">
                      <p className="text-xs text-blue-600 mb-1">認証URL:</p>
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-white px-2 py-1 rounded border border-blue-200 flex-1 break-all">{getAuthUrl()}</code>
                        <button onClick={handleCopyAuthUrl} className="p-1.5 text-blue-600 hover:bg-blue-100 rounded transition-colors flex-shrink-0" title="コピー">
                          {authUrlCopied ? <CheckCircle size={16} /> : <Copy size={16} />}
                        </button>
                      </div>
                      <p className="text-xs text-blue-500 mt-1">※ 認証後、リダイレクト先URLのパラメータから code の値をコピーしてください</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">認証コード *</label>
                    <input type="text" value={authCode} onChange={e => setAuthCode(e.target.value)}
                      placeholder="リダイレクトURLから取得したcodeの値を貼り付け"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  </div>
                </>
              )}
            </>
          )}

          {/* CSV一括登録タブ */}
          {activeTab === "csv" && (
            <>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-800 mb-2">CSV形式（{platformLabel}）</h3>
                <p className="text-xs text-gray-600 mb-2">1行目はヘッダーとしてスキップされます。</p>
                <div className="overflow-x-auto">
                  <table className="text-xs border border-gray-300 w-full">
                    <thead>
                      <tr className="bg-gray-100">
                        {csvHeaders.map(h => (
                          <th key={h} className="px-2 py-1 border-r border-gray-300 whitespace-nowrap font-medium">
                            {h}{(h === "商材名" || h === "アクセストークン" || (platform === "tiktok" && h === "オープンID")) && <span className="text-red-500">*</span>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                  </table>
                </div>
                <button onClick={handleDownloadTemplate}
                  className="mt-3 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors">
                  <Download size={14} /> テンプレートCSVをダウンロード
                </button>
              </div>

              <div>
                <input type="file" ref={csvInputRef} accept=".csv" onChange={handleCsvFileChange} className="hidden" />
                <button onClick={() => csvInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors">
                  {csvFile ? (
                    <><FileText size={20} className="text-blue-600" /><span className="text-sm text-blue-600 font-medium">{csvFile.name}</span><span className="text-xs text-gray-500">（クリックで変更）</span></>
                  ) : (
                    <><Upload size={20} className="text-gray-400" /><span className="text-sm text-gray-500">CSVファイルを選択</span></>
                  )}
                </button>
              </div>

              {csvErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-xs font-medium text-red-800 mb-1">エラー ({csvErrors.length}件)</p>
                  <ul className="text-xs text-red-700 space-y-0.5 max-h-24 overflow-y-auto">
                    {csvErrors.map((err, i) => <li key={i}>・{err}</li>)}
                  </ul>
                </div>
              )}

              {csvPreview.length > 0 && csvErrors.length === 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">プレビュー（先頭{csvPreview.length}件）</p>
                  <div className="overflow-x-auto">
                    <table className="text-xs border border-gray-200 w-full">
                      <thead>
                        <tr className="bg-gray-50">
                          {csvHeaders.map(h => (
                            <th key={h} className="px-2 py-1 border-r border-gray-200 whitespace-nowrap text-left font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvPreview.map((row, i) => (
                          <tr key={i} className="border-t border-gray-200">
                            {csvHeaders.map((_, j) => (
                              <td key={j} className="px-2 py-1 border-r border-gray-200 max-w-[120px] truncate">{row[j] || ""}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* オプション情報（手動・認証コードのみ） */}
          {activeTab !== "csv" && (
            <div className="border-t pt-4 mt-4">
              <p className="text-xs text-gray-500 mb-3">オプション情報</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">端末</label>
                  <input type="text" value={device} onChange={e => setDevice(e.target.value)} placeholder="例: A40, iPhone 15"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">運用者</label>
                  <input type="text" value={operator} onChange={e => setOperator(e.target.value)} placeholder="例: 田中A, 松元"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">メアド</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="例: user@example.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">パスワード</label>
                  <input type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="例: Pass123!"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="flex justify-end gap-3 p-6 border-t">
          <button onClick={handleClose} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">閉じる</button>
          <button onClick={handleSubmit} disabled={isSubmitting}
            className="px-6 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
