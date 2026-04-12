"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Flag, Plus, Trash2, Edit2, Save, X, Calendar, RefreshCw, Upload, Download, Globe, Package, Zap } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, orderBy, writeBatch, Timestamp } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";

type FlagScope = "global" | "product";

type EventFlag = {
  id: string;
  name: string;
  date: string;
  endDate?: string;
  description: string;
  scope: FlagScope;
  productId?: string;
  mall?: string;
};

type RegisteredProduct = {
  id: string;
  productName: string;
  skuName?: string;
};

// デモ用データ（空）
const demoFlags: EventFlag[] = [];

// 2026年の媒体セールプリセット
const SALE_PRESETS: Omit<EventFlag, "id">[] = [
  // Amazon
  { name: "Amazon 初売りセール", date: "2026-01-03", endDate: "2026-01-07", description: "Amazon初売り", scope: "global", mall: "Amazon" },
  { name: "Amazon 新生活セール", date: "2026-03-01", endDate: "2026-03-05", description: "Amazon新生活セール", scope: "global", mall: "Amazon" },
  { name: "Amazon 新生活FINAL", date: "2026-04-03", endDate: "2026-04-06", description: "Amazon新生活セールFINAL", scope: "global", mall: "Amazon" },
  { name: "Amazon スマイルSALE GW", date: "2026-04-25", endDate: "2026-04-28", description: "Amazon GWセール（スマイルSALE）", scope: "global", mall: "Amazon" },
  { name: "Amazon プライムデー", date: "2026-07-14", endDate: "2026-07-15", description: "Amazon最大のセール", scope: "global", mall: "Amazon" },
  { name: "Amazon 季節先取りセール", date: "2026-09-01", endDate: "2026-09-04", description: "Amazon季節先取りセール", scope: "global", mall: "Amazon" },
  { name: "Amazon プライム感謝祭", date: "2026-10-13", endDate: "2026-10-14", description: "Amazonプライム感謝祭", scope: "global", mall: "Amazon" },
  { name: "Amazon ブラックフライデー", date: "2026-11-27", endDate: "2026-12-01", description: "Amazonブラックフライデー", scope: "global", mall: "Amazon" },

  // 楽天
  { name: "楽天スーパーSALE", date: "2026-03-04", endDate: "2026-03-11", description: "楽天スーパーSALE（3月）", scope: "global", mall: "楽天" },
  { name: "楽天スーパーSALE", date: "2026-06-04", endDate: "2026-06-11", description: "楽天スーパーSALE（6月）", scope: "global", mall: "楽天" },
  { name: "楽天スーパーSALE", date: "2026-09-04", endDate: "2026-09-11", description: "楽天スーパーSALE（9月）", scope: "global", mall: "楽天" },
  { name: "楽天スーパーSALE", date: "2026-12-04", endDate: "2026-12-11", description: "楽天スーパーSALE（12月）", scope: "global", mall: "楽天" },

  // 楽天お買い物マラソン（主要月のみ）
  { name: "楽天お買い物マラソン", date: "2026-01-09", endDate: "2026-01-16", description: "1月お買い物マラソン", scope: "global", mall: "楽天" },
  { name: "楽天お買い物マラソン", date: "2026-02-04", endDate: "2026-02-11", description: "2月お買い物マラソン", scope: "global", mall: "楽天" },
  { name: "楽天お買い物マラソン", date: "2026-04-04", endDate: "2026-04-10", description: "4月お買い物マラソン第1弾", scope: "global", mall: "楽天" },
  { name: "楽天お買い物マラソン", date: "2026-05-09", endDate: "2026-05-16", description: "5月お買い物マラソン", scope: "global", mall: "楽天" },
  { name: "楽天お買い物マラソン", date: "2026-07-04", endDate: "2026-07-11", description: "7月お買い物マラソン", scope: "global", mall: "楽天" },
  { name: "楽天お買い物マラソン", date: "2026-08-04", endDate: "2026-08-11", description: "8月お買い物マラソン", scope: "global", mall: "楽天" },
  { name: "楽天お買い物マラソン", date: "2026-10-04", endDate: "2026-10-11", description: "10月お買い物マラソン", scope: "global", mall: "楽天" },
  { name: "楽天お買い物マラソン", date: "2026-11-04", endDate: "2026-11-11", description: "11月お買い物マラソン", scope: "global", mall: "楽天" },

  // Qoo10
  { name: "Qoo10 メガ割（第1回）", date: "2026-02-27", endDate: "2026-03-11", description: "Qoo10メガ割 2〜3月", scope: "global", mall: "Qoo10" },
  { name: "Qoo10 メガ割（第2回）", date: "2026-05-30", endDate: "2026-06-11", description: "Qoo10メガ割 5〜6月", scope: "global", mall: "Qoo10" },
  { name: "Qoo10 メガ割（第3回）", date: "2026-08-28", endDate: "2026-09-09", description: "Qoo10メガ割 8〜9月", scope: "global", mall: "Qoo10" },
  { name: "Qoo10 メガ割（第4回）", date: "2026-11-20", endDate: "2026-12-02", description: "Qoo10メガ割 11〜12月", scope: "global", mall: "Qoo10" },
];

const MALL_COLORS: Record<string, string> = {
  "Amazon": "#FF9900",
  "楽天": "#BF0000",
  "Qoo10": "#3266CC",
};

export default function FlagsPage() {
  const { isRealDataUser, isAuthLoading, isAdmin, allowedProductIds } = useAuth();
  const [globalFlags, setGlobalFlags] = useState<EventFlag[]>([]);
  const [productFlags, setProductFlags] = useState<EventFlag[]>([]);
  const [products, setProducts] = useState<RegisteredProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FlagScope>(isAdmin ? "global" : "product");

  const [newFlag, setNewFlag] = useState({
    name: "",
    date: "",
    endDate: "",
    description: "",
    scope: "global" as FlagScope,
    productId: "",
    mall: "",
  });

  const [editFlag, setEditFlag] = useState({
    name: "",
    date: "",
    endDate: "",
    description: "",
    scope: "global" as FlagScope,
    productId: "",
    mall: "",
  });

  // CSV入稿用
  const csvFileRef = useRef<HTMLInputElement>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvSuccess, setCsvSuccess] = useState<string | null>(null);

  // プリセット登録用
  const [presetLoading, setPresetLoading] = useState(false);

  // Firestoreからフラグ一覧と商品一覧を取得
  useEffect(() => {
    if (isAuthLoading) return;

    if (!isRealDataUser) {
      setGlobalFlags(demoFlags.filter((f) => f.scope === "global"));
      setProductFlags(demoFlags.filter((f) => f.scope === "product"));
      setIsLoading(false);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [flagsSnap, productsSnap] = await Promise.all([
          getDocs(collection(db, "event_flags")),
          getDocs(query(collection(db, "registered_products"), orderBy("createdAt", "desc"))),
        ]);

        const allFlags = flagsSnap.docs.map((doc) => ({
          id: doc.id,
          name: doc.data().name || "",
          date: doc.data().date || "",
          endDate: doc.data().endDate || "",
          description: doc.data().description || "",
          scope: (doc.data().scope || "global") as FlagScope,
          productId: doc.data().productId || "",
          mall: doc.data().mall || "",
        }));

        allFlags.sort((a, b) => b.date.localeCompare(a.date));

        // クライアントユーザーは自分のallowedProductIdsに紐づく個別フラグのみ閲覧可
        const allowedSet = allowedProductIds ? new Set(allowedProductIds) : null;
        const visibleProductFlags = allFlags.filter((f) => {
          if (f.scope !== "product") return false;
          if (!allowedSet) return true; // admin/管理者
          return f.productId ? allowedSet.has(f.productId) : false;
        });

        setGlobalFlags(allFlags.filter((f) => f.scope === "global"));
        setProductFlags(visibleProductFlags);

        // 商品一覧もクライアントの許可商品だけに絞る
        const allProducts = productsSnap.docs.map((d) => ({
          id: d.id,
          productName: d.data().productName || "",
          skuName: d.data().skuName || "",
        }));
        setProducts(
          allowedSet ? allProducts.filter((p) => allowedSet.has(p.id)) : allProducts
        );
      } catch (error) {
        console.error("フラグ取得エラー:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [isRealDataUser, isAuthLoading, allowedProductIds]);

  const currentFlags = activeTab === "global" ? globalFlags : productFlags;
  const setCurrentFlags = activeTab === "global" ? setGlobalFlags : setProductFlags;

  const handleAddFlag = async () => {
    if (!newFlag.name || !newFlag.date) return;
    setIsSaving(true);

    try {
      const flagData = {
        name: newFlag.name,
        date: newFlag.date,
        endDate: newFlag.endDate || "",
        description: newFlag.description,
        scope: activeTab,
        productId: activeTab === "product" ? newFlag.productId : "",
        mall: activeTab === "global" ? newFlag.mall : "",
      };

      if (!isRealDataUser) {
        const flag: EventFlag = { id: `demo-${Date.now()}`, ...flagData };
        setCurrentFlags((prev) => [flag, ...prev]);
      } else {
        const docRef = await addDoc(collection(db, "event_flags"), {
          ...flagData,
          createdAt: new Date(),
        });
        const flag: EventFlag = { id: docRef.id, ...flagData };
        setCurrentFlags((prev) => [flag, ...prev]);
      }

      setNewFlag({ name: "", date: "", endDate: "", description: "", scope: activeTab, productId: "", mall: "" });
      setIsAdding(false);
    } catch (error) {
      console.error("フラグ登録エラー:", error);
      alert("フラグの登録に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteFlag = async (id: string) => {
    if (!confirm("このフラグを削除しますか？")) return;

    try {
      if (isRealDataUser) {
        await deleteDoc(doc(db, "event_flags", id));
      }
      setGlobalFlags((prev) => prev.filter((f) => f.id !== id));
      setProductFlags((prev) => prev.filter((f) => f.id !== id));
    } catch (error) {
      console.error("フラグ削除エラー:", error);
      alert("フラグの削除に失敗しました");
    }
  };

  const handleStartEdit = (flag: EventFlag) => {
    setEditingId(flag.id);
    setEditFlag({
      name: flag.name,
      date: flag.date,
      endDate: flag.endDate || "",
      description: flag.description,
      scope: flag.scope,
      productId: flag.productId || "",
      mall: flag.mall || "",
    });
  };

  const handleSaveEdit = async (id: string) => {
    setIsSaving(true);
    try {
      const updatedData = {
        name: editFlag.name,
        date: editFlag.date,
        endDate: editFlag.endDate,
        description: editFlag.description,
        scope: editFlag.scope,
        productId: editFlag.productId,
        mall: editFlag.mall,
      };

      if (isRealDataUser) {
        await updateDoc(doc(db, "event_flags", id), { ...updatedData, updatedAt: new Date() });
      }

      const updateList = (prev: EventFlag[]) =>
        prev.map((f) => (f.id === id ? { ...f, ...updatedData } : f));
      setGlobalFlags(updateList);
      setProductFlags(updateList);
      setEditingId(null);
    } catch (error) {
      console.error("フラグ更新エラー:", error);
      alert("フラグの更新に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  // 2026年セールプリセット一括登録
  const handleLoadPresets = async () => {
    if (!confirm("2026年の媒体セールスケジュール（Amazon/楽天/Qoo10）を一括登録しますか？既存の同名フラグがある場合は重複する可能性があります。")) return;
    setPresetLoading(true);

    try {
      const newFlags: EventFlag[] = [];
      const batchSize = 400;

      for (let i = 0; i < SALE_PRESETS.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = SALE_PRESETS.slice(i, i + batchSize);
        for (const preset of chunk) {
          const docRef = doc(collection(db, "event_flags"));
          batch.set(docRef, { ...preset, createdAt: Timestamp.now() });
          newFlags.push({ id: docRef.id, ...preset });
        }
        await batch.commit();
      }

      setGlobalFlags((prev) => [...newFlags, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
      alert(`${SALE_PRESETS.length}件のセールスケジュールを登録しました`);
    } catch (err) {
      console.error("プリセット登録エラー:", err);
      alert("登録に失敗しました");
    } finally {
      setPresetLoading(false);
    }
  };

  // CSVテンプレートダウンロード
  const handleDownloadTemplate = useCallback(() => {
    const csvContent = [
      "日付,終了日,イベント名,詳細,種別,商品ID,媒体",
      "2025-12-01,2025-12-05,セール開始,ブラックフライデーセール,global,,Amazon",
      "2025-12-15,,広告開始,TikTok広告キャンペーン,product,product-id-here,",
    ].join("\n");

    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "フラグ登録テンプレート.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  // CSVインポート
  const handleCsvImport = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setCsvError(null);
    setCsvSuccess(null);
    setCsvUploading(true);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split(/\r?\n/).filter(line => line.trim());

        if (lines.length < 2) {
          setCsvError("CSVファイルにデータがありません");
          setCsvUploading(false);
          return;
        }

        const newGlobal: EventFlag[] = [];
        const newProduct: EventFlag[] = [];
        let savedCount = 0;

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          const values = line.split(",").map(v => v.trim().replace(/^["']|["']$/g, ""));

          if (values.length < 3 || !values[0] || !values[2]) continue;

          const dateStr = values[0].replace(/\//g, "-");
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;

          const flagData = {
            date: dateStr,
            endDate: values[1]?.replace(/\//g, "-") || "",
            name: values[2],
            description: values[3] || "",
            scope: (values[4] === "product" ? "product" : "global") as FlagScope,
            productId: values[5] || "",
            mall: values[6] || "",
          };

          if (isRealDataUser) {
            const docRef = await addDoc(collection(db, "event_flags"), {
              ...flagData,
              createdAt: new Date(),
            });
            const flag = { id: docRef.id, ...flagData };
            if (flag.scope === "global") newGlobal.push(flag);
            else newProduct.push(flag);
          } else {
            const flag = { id: `demo-csv-${Date.now()}-${i}`, ...flagData };
            if (flag.scope === "global") newGlobal.push(flag);
            else newProduct.push(flag);
          }
          savedCount++;
        }

        if (savedCount === 0) {
          setCsvError("有効なデータがありません");
        } else {
          if (newGlobal.length > 0) setGlobalFlags(prev => [...newGlobal, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
          if (newProduct.length > 0) setProductFlags(prev => [...newProduct, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
          setCsvSuccess(`${savedCount}件のフラグを登録しました`);
        }
      } catch (err) {
        console.error("CSV parse error:", err);
        setCsvError("CSVファイルの解析に失敗しました");
      } finally {
        setCsvUploading(false);
        if (csvFileRef.current) csvFileRef.current.value = "";
      }
    };

    reader.onerror = () => {
      setCsvError("ファイルの読み込みに失敗しました");
      setCsvUploading(false);
    };

    reader.readAsText(file, "UTF-8");
  }, [isRealDataUser]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  };

  const getProductName = (productId: string) => {
    const p = products.find((pr) => pr.id === productId);
    return p ? (p.skuName ? `${p.productName}（${p.skuName}）` : p.productName) : productId;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-600">読み込み中...</span>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Flag className="w-8 h-8 text-purple-600" />
          <h1 className="text-2xl font-bold text-gray-800">フラグ登録</h1>
          {!isRealDataUser && (
            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">
              デモモード
            </span>
          )}
        </div>
        {(isAdmin || activeTab === "product") && (
          <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
            {isAdmin && (
              <>
                <button
                  onClick={handleDownloadTemplate}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm"
                >
                  <Download className="w-4 h-4" />
                  テンプレートDL
                </button>
                <div>
                  <input
                    type="file"
                    ref={csvFileRef}
                    accept=".csv"
                    onChange={handleCsvImport}
                    className="hidden"
                    id="flag-csv-upload"
                    disabled={csvUploading}
                  />
                  <label
                    htmlFor="flag-csv-upload"
                    className={`flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors cursor-pointer text-sm ${csvUploading ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    {csvUploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {csvUploading ? "登録中..." : "CSV一括登録"}
                  </label>
                </div>
              </>
            )}
            <button
              onClick={() => { setIsAdding(true); setNewFlag({ ...newFlag, scope: activeTab }); }}
              disabled={isAdding}
              className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              新規登録
            </button>
          </div>
        )}
      </div>

      <p className="text-gray-600 mb-4">
        イベントやキャンペーンのフラグを登録すると、ダッシュボードのグラフ上に表示されます。
      </p>

      {/* タブ */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-full sm:w-fit">
        <button
          onClick={() => setActiveTab("global")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "global" ? "bg-white text-purple-700 shadow-sm" : "text-gray-600 hover:text-gray-800"
          }`}
        >
          <Globe className="w-4 h-4" />
          全体共通（{globalFlags.length}）
        </button>
        <button
          onClick={() => setActiveTab("product")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "product" ? "bg-white text-purple-700 shadow-sm" : "text-gray-600 hover:text-gray-800"
          }`}
        >
          <Package className="w-4 h-4" />
          商品別（{productFlags.length}）
        </button>
      </div>

      {/* 全体共通タブ: セールプリセット一括登録 */}
      {activeTab === "global" && isAdmin && isRealDataUser && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-orange-800">2026年 媒体セールスケジュール一括登録</p>
            <p className="text-xs text-orange-600">Amazon / 楽天 / Qoo10 の主要セール（{SALE_PRESETS.length}件）を一括登録します</p>
          </div>
          <button
            onClick={handleLoadPresets}
            disabled={presetLoading}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm disabled:opacity-50"
          >
            {presetLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {presetLoading ? "登録中..." : "一括登録"}
          </button>
        </div>
      )}

      {/* CSVインポート結果 */}
      {csvError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">{csvError}</div>
      )}
      {csvSuccess && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm mb-4">{csvSuccess}</div>
      )}

      {/* 新規登録フォーム */}
      {isAdding && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">新規フラグ登録（{activeTab === "global" ? "全体共通" : "商品別"}）</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">イベント名 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={newFlag.name}
                  onChange={(e) => setNewFlag({ ...newFlag, name: e.target.value })}
                  placeholder="例: セール開始"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
              {activeTab === "global" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">媒体</label>
                  <select
                    value={newFlag.mall}
                    onChange={(e) => setNewFlag({ ...newFlag, mall: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  >
                    <option value="">共通</option>
                    <option value="Amazon">Amazon</option>
                    <option value="楽天">楽天</option>
                    <option value="Qoo10">Qoo10</option>
                  </select>
                </div>
              )}
              {activeTab === "product" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">対象商品</label>
                  <select
                    value={newFlag.productId}
                    onChange={(e) => setNewFlag({ ...newFlag, productId: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  >
                    <option value="">選択してください</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.productName}{p.skuName ? `（${p.skuName}）` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">開始日 <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={newFlag.date}
                  onChange={(e) => setNewFlag({ ...newFlag, date: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">終了日</label>
                <input
                  type="date"
                  value={newFlag.endDate}
                  onChange={(e) => setNewFlag({ ...newFlag, endDate: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">詳細</label>
              <textarea
                value={newFlag.description}
                onChange={(e) => setNewFlag({ ...newFlag, description: e.target.value })}
                placeholder="イベントの詳細説明（任意）"
                rows={2}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleAddFlag}
                disabled={!newFlag.name || !newFlag.date || isSaving}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? "登録中..." : "登録する"}
              </button>
              <button
                onClick={() => { setIsAdding(false); setNewFlag({ name: "", date: "", endDate: "", description: "", scope: activeTab, productId: "", mall: "" }); }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* フラグ一覧 */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  <span className="flex items-center gap-1"><Calendar className="w-4 h-4" />期間</span>
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">イベント名</th>
                {activeTab === "global" && (
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">媒体</th>
                )}
                {activeTab === "product" && (
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">対象商品</th>
                )}
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">詳細</th>
                {(isAdmin || activeTab === "product") && (
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">操作</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {currentFlags.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    登録されているフラグはありません
                  </td>
                </tr>
              ) : (
                currentFlags.map((flag) => (
                  <tr key={flag.id} className="hover:bg-gray-50">
                    {editingId === flag.id ? (
                      <>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 items-center">
                            <input type="date" value={editFlag.date} onChange={(e) => setEditFlag({ ...editFlag, date: e.target.value })} className="px-2 py-1 border rounded text-sm focus:ring-2 focus:ring-purple-500" />
                            <span className="text-gray-400">〜</span>
                            <input type="date" value={editFlag.endDate} onChange={(e) => setEditFlag({ ...editFlag, endDate: e.target.value })} className="px-2 py-1 border rounded text-sm focus:ring-2 focus:ring-purple-500" />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <input type="text" value={editFlag.name} onChange={(e) => setEditFlag({ ...editFlag, name: e.target.value })} className="w-full px-2 py-1 border rounded focus:ring-2 focus:ring-purple-500" />
                        </td>
                        {activeTab === "global" && (
                          <td className="px-4 py-3">
                            <select value={editFlag.mall} onChange={(e) => setEditFlag({ ...editFlag, mall: e.target.value })} className="px-2 py-1 border rounded text-sm">
                              <option value="">共通</option>
                              <option value="Amazon">Amazon</option>
                              <option value="楽天">楽天</option>
                              <option value="Qoo10">Qoo10</option>
                            </select>
                          </td>
                        )}
                        {activeTab === "product" && (
                          <td className="px-4 py-3">
                            <select value={editFlag.productId} onChange={(e) => setEditFlag({ ...editFlag, productId: e.target.value })} className="px-2 py-1 border rounded text-sm">
                              <option value="">-</option>
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>{p.productName}</option>
                              ))}
                            </select>
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <input type="text" value={editFlag.description} onChange={(e) => setEditFlag({ ...editFlag, description: e.target.value })} className="w-full px-2 py-1 border rounded focus:ring-2 focus:ring-purple-500" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center gap-2">
                            <button onClick={() => handleSaveEdit(flag.id)} disabled={isSaving} className="p-1 text-green-600 hover:bg-green-100 rounded" title="保存"><Save className="w-5 h-5" /></button>
                            <button onClick={handleCancelEdit} className="p-1 text-gray-600 hover:bg-gray-100 rounded" title="キャンセル"><X className="w-5 h-5" /></button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-medium text-gray-900 text-sm whitespace-nowrap">
                          {formatDate(flag.date)}
                          {flag.endDate && <span className="text-gray-400"> 〜 {formatDate(flag.endDate)}</span>}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">{flag.name}</td>
                        {activeTab === "global" && (
                          <td className="px-4 py-3">
                            {flag.mall ? (
                              <span className="px-2 py-0.5 text-xs rounded-full font-medium text-white" style={{ backgroundColor: MALL_COLORS[flag.mall] || "#6B7280" }}>
                                {flag.mall}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                        )}
                        {activeTab === "product" && (
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {flag.productId ? getProductName(flag.productId) : "-"}
                          </td>
                        )}
                        <td className="px-4 py-3 text-gray-600 text-sm">{flag.description || "-"}</td>
                        {(isAdmin || activeTab === "product") && (
                          <td className="px-4 py-3">
                            <div className="flex justify-center gap-2">
                              <button onClick={() => handleStartEdit(flag)} className="p-1 text-blue-600 hover:bg-blue-100 rounded" title="編集"><Edit2 className="w-5 h-5" /></button>
                              <button onClick={() => handleDeleteFlag(flag.id)} className="p-1 text-red-600 hover:bg-red-100 rounded" title="削除"><Trash2 className="w-5 h-5" /></button>
                            </div>
                          </td>
                        )}
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
