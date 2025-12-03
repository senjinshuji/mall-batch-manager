"use client";

import { useState, useRef, useEffect } from "react";
import { Package, Plus, Trash2, Edit2, Save, X, Upload, Download, ChevronDown, RefreshCw } from "lucide-react";
import {
  RegisteredProduct,
  MallProduct,
} from "@/lib/mockData";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, orderBy } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";

const BACKEND_URL = "https://mall-batch-manager-983678294034.asia-northeast1.run.app";

// デモ用のモール商品データ
const demoAmazonProducts: MallProduct[] = [
  { code: "DEMO-AMZ-001", name: "デモAmazon商品A" },
  { code: "DEMO-AMZ-002", name: "デモAmazon商品B" },
  { code: "DEMO-AMZ-003", name: "デモAmazon商品C" },
];

const demoRakutenProducts: MallProduct[] = [
  { code: "DEMO-RKT-001", name: "デモ楽天商品A" },
  { code: "DEMO-RKT-002", name: "デモ楽天商品B" },
  { code: "DEMO-RKT-003", name: "デモ楽天商品C" },
];

const demoQoo10Products: MallProduct[] = [
  { code: "DEMO-Q10-001", name: "デモQoo10商品A" },
  { code: "DEMO-Q10-002", name: "デモQoo10商品B" },
  { code: "DEMO-Q10-003", name: "デモQoo10商品C" },
];

// デモ用の登録済み商品
const demoRegisteredProducts: RegisteredProduct[] = [
  { id: "demo-1", productName: "デモ商品A", amazonCode: "DEMO-AMZ-001", rakutenCode: "DEMO-RKT-001", qoo10Code: "DEMO-Q10-001" },
  { id: "demo-2", productName: "デモ商品B", amazonCode: "DEMO-AMZ-002", rakutenCode: "", qoo10Code: "DEMO-Q10-002" },
];

type NewProduct = {
  productName: string;
  amazonCode: string;
  rakutenCode: string;
  qoo10Code: string;
};

type Qoo10Product = {
  itemCode: string;
  sellerCode: string;
  itemTitle: string;
  itemPrice: string;
  itemQty: string;
  itemStatus: string;
};

export default function ProductsPage() {
  const { isRealDataUser } = useAuth();
  const [products, setProducts] = useState<RegisteredProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState<NewProduct>({
    productName: "",
    amazonCode: "",
    rakutenCode: "",
    qoo10Code: "",
  });
  const [editProduct, setEditProduct] = useState<NewProduct>({
    productName: "",
    amazonCode: "",
    rakutenCode: "",
    qoo10Code: "",
  });
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvSuccess, setCsvSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 各モール商品一覧をAPIから取得
  const [amazonProducts, setAmazonProducts] = useState<MallProduct[]>([]);
  const [amazonLoading, setAmazonLoading] = useState(true);
  const [amazonError, setAmazonError] = useState<string | null>(null);

  const [rakutenProducts, setRakutenProducts] = useState<MallProduct[]>([]);
  const [rakutenLoading, setRakutenLoading] = useState(true);
  const [rakutenError, setRakutenError] = useState<string | null>(null);

  const [qoo10Products, setQoo10Products] = useState<MallProduct[]>([]);
  const [qoo10Loading, setQoo10Loading] = useState(true);
  const [qoo10Error, setQoo10Error] = useState<string | null>(null);

  // Firestoreから商品一覧を取得（実データユーザーのみ）
  useEffect(() => {
    if (!isRealDataUser) {
      // デモユーザーはデモデータを表示
      setProducts(demoRegisteredProducts);
      setAmazonProducts(demoAmazonProducts);
      setRakutenProducts(demoRakutenProducts);
      setQoo10Products(demoQoo10Products);
      setIsLoading(false);
      setAmazonLoading(false);
      setRakutenLoading(false);
      setQoo10Loading(false);
      return;
    }

    fetchProducts();
    fetchAmazonProducts();
    fetchRakutenProducts();
    fetchQoo10Products();
  }, [isRealDataUser]);

  const fetchProducts = async () => {
    setIsLoading(true);
    try {
      const q = query(collection(db, "registered_products"), orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);
      const productsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as RegisteredProduct[];
      setProducts(productsData);
    } catch (error) {
      console.error("商品一覧取得エラー:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAmazonProducts = async () => {
    setAmazonLoading(true);
    setAmazonError(null);
    try {
      const response = await fetch(`${BACKEND_URL}/amazon/products`);
      const data = await response.json();
      if (data.success && data.products) {
        const formatted: MallProduct[] = data.products.map((p: { code: string; name: string; sku?: string }) => ({
          code: p.sku || p.code,
          name: p.name,
        }));
        setAmazonProducts(formatted);
      } else {
        setAmazonError(data.message || "Amazon商品の取得に失敗しました");
      }
    } catch (error) {
      console.error("Amazon商品取得エラー:", error);
      setAmazonError("Amazon商品の取得に失敗しました");
    } finally {
      setAmazonLoading(false);
    }
  };

  const fetchRakutenProducts = async () => {
    setRakutenLoading(true);
    setRakutenError(null);
    try {
      const response = await fetch(`${BACKEND_URL}/rakuten/products`);
      const data = await response.json();
      if (data.success && data.products) {
        const formatted: MallProduct[] = data.products.map((p: { code: string; name: string }) => ({
          code: p.code,
          name: p.name,
        }));
        setRakutenProducts(formatted);
      } else {
        setRakutenError(data.message || "楽天商品の取得に失敗しました");
      }
    } catch (error) {
      console.error("楽天商品取得エラー:", error);
      setRakutenError("楽天商品の取得に失敗しました");
    } finally {
      setRakutenLoading(false);
    }
  };

  const fetchQoo10Products = async () => {
    setQoo10Loading(true);
    setQoo10Error(null);
    try {
      const response = await fetch(`${BACKEND_URL}/qoo10/products-with-details`);
      const data = await response.json();
      if (data.success && data.products) {
        // MallProduct形式に変換（商品コードを先頭に表示）
        const formatted: MallProduct[] = data.products.map((p: Qoo10Product) => ({
          code: p.itemCode,
          name: `[${p.sellerCode}] ${p.itemTitle}`,
        }));
        setQoo10Products(formatted);
      } else {
        setQoo10Error(data.message || "Qoo10商品の取得に失敗しました");
      }
    } catch (error) {
      console.error("Qoo10商品取得エラー:", error);
      setQoo10Error("Qoo10商品の取得に失敗しました");
    } finally {
      setQoo10Loading(false);
    }
  };

  const handleAddProduct = async () => {
    if (!newProduct.productName) return;
    setIsSaving(true);

    try {
      if (!isRealDataUser) {
        // デモユーザーはローカルのみで追加
        const product: RegisteredProduct = {
          id: `demo-${Date.now()}`,
          ...newProduct,
        };
        setProducts([product, ...products]);
      } else {
        const docRef = await addDoc(collection(db, "registered_products"), {
          ...newProduct,
          createdAt: new Date(),
        });

        const product: RegisteredProduct = {
          id: docRef.id,
          ...newProduct,
        };

        setProducts([product, ...products]);
      }

      setNewProduct({
        productName: "",
        amazonCode: "",
        rakutenCode: "",
        qoo10Code: "",
      });
      setIsAdding(false);
    } catch (error) {
      console.error("商品登録エラー:", error);
      alert("商品の登録に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm("この商品を削除しますか？")) return;

    try {
      if (!isRealDataUser) {
        // デモユーザーはローカルのみで削除
        setProducts(products.filter((p) => p.id !== id));
      } else {
        await deleteDoc(doc(db, "registered_products", id));
        setProducts(products.filter((p) => p.id !== id));
      }
    } catch (error) {
      console.error("商品削除エラー:", error);
      alert("商品の削除に失敗しました");
    }
  };

  const handleStartEdit = (product: RegisteredProduct) => {
    setEditingId(product.id);
    setEditProduct({
      productName: product.productName,
      amazonCode: product.amazonCode,
      rakutenCode: product.rakutenCode,
      qoo10Code: product.qoo10Code,
    });
  };

  const handleSaveEdit = async (id: string) => {
    setIsSaving(true);
    try {
      if (!isRealDataUser) {
        // デモユーザーはローカルのみで更新
        setProducts(
          products.map((p) =>
            p.id === id
              ? {
                  ...p,
                  ...editProduct,
                }
              : p
          )
        );
      } else {
        await updateDoc(doc(db, "registered_products", id), {
          ...editProduct,
          updatedAt: new Date(),
        });

        setProducts(
          products.map((p) =>
            p.id === id
              ? {
                  ...p,
                  ...editProduct,
                }
              : p
          )
        );
      }
      setEditingId(null);
    } catch (error) {
      console.error("商品更新エラー:", error);
      alert("商品の更新に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  // CSVテンプレートダウンロード
  const handleDownloadTemplate = () => {
    const headers = ["商品名", "Amazon商品コード", "楽天商品コード", "Qoo10商品コード"];
    const sampleData = [
      ["オーガニックシャンプー", "AMZ-001", "RKT-001", "Q10-001"],
      ["ヘアトリートメント", "AMZ-002", "RKT-002", ""],
    ];

    const csvContent = [
      headers.join(","),
      ...sampleData.map(row => row.join(","))
    ].join("\n");

    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "商品登録テンプレート.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // CSVファイル読み込み
  const handleCsvImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setCsvError(null);
    setCsvSuccess(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split(/\r?\n/).filter(line => line.trim());

        if (lines.length < 2) {
          setCsvError("CSVファイルにデータがありません（ヘッダー行のみ）");
          return;
        }

        // ヘッダー行をスキップしてデータを解析
        const newProducts: RegisteredProduct[] = [];
        const errors: string[] = [];

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          const values = line.split(",").map(v => v.trim().replace(/^["']|["']$/g, ""));

          if (values.length < 1 || !values[0]) {
            errors.push(`${i + 1}行目: 商品名が空です`);
            continue;
          }

          newProducts.push({
            id: `prod-csv-${Date.now()}-${i}`,
            productName: values[0],
            amazonCode: values[1] || "",
            rakutenCode: values[2] || "",
            qoo10Code: values[3] || "",
          });
        }

        if (errors.length > 0) {
          setCsvError(errors.join("\n"));
        }

        if (newProducts.length > 0) {
          setProducts([...products, ...newProducts]);
          setCsvSuccess(`${newProducts.length}件の商品を追加しました`);
        }
      } catch {
        setCsvError("CSVファイルの解析に失敗しました");
      }
    };

    reader.onerror = () => {
      setCsvError("ファイルの読み込みに失敗しました");
    };

    reader.readAsText(file, "UTF-8");

    // ファイル入力をリセット
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const getProductNameByCode = (
    code: string,
    mallProducts: MallProduct[]
  ): string => {
    const product = mallProducts.find((p) => p.code === code);
    return product ? product.name : "";
  };

  // カスタムドロップダウンコンポーネント
  const ProductCodeDropdown = ({
    value,
    onChange,
    mallProducts,
    mallName,
    mallColor,
  }: {
    value: string;
    onChange: (value: string) => void;
    mallProducts: MallProduct[];
    mallName: string;
    mallColor: string;
  }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
          setIsOpen(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const selectedProduct = mallProducts.find((p) => p.code === value);
    const displayText = selectedProduct
      ? `${selectedProduct.code}: ${selectedProduct.name}`
      : "-- 選択してください --";

    const colorClasses: Record<string, string> = {
      orange: "focus:ring-orange-500 focus:border-orange-500",
      red: "focus:ring-red-500 focus:border-red-500",
      blue: "focus:ring-blue-500 focus:border-blue-500",
    };

    return (
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-500">{mallName}</label>
        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className={`w-full flex items-center justify-between px-3 py-2 border rounded-lg text-sm bg-white hover:bg-gray-50 ${colorClasses[mallColor] || ""}`}
          >
            <span className="truncate text-left">{displayText}</span>
            <ChevronDown className={`w-4 h-4 ml-2 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
          </button>
          {isOpen && (
            <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-48 overflow-auto">
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${value === "" ? "bg-blue-100 font-medium" : ""}`}
              >
                -- 選択してください --
              </button>
              {mallProducts.map((product) => (
                <button
                  key={product.code}
                  type="button"
                  onClick={() => {
                    onChange(product.code);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${value === product.code ? "bg-blue-100 font-medium" : ""}`}
                >
                  {product.code}: {product.name}
                </button>
              ))}
            </div>
          )}
        </div>
        {value && (
          <p className="text-xs text-gray-500 truncate">
            {getProductNameByCode(value, mallProducts)}
          </p>
        )}
      </div>
    );
  };

  // テーブル用の小さいドロップダウン
  const TableDropdown = ({
    value,
    onChange,
    mallProducts,
  }: {
    value: string;
    onChange: (value: string) => void;
    mallProducts: MallProduct[];
  }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
          setIsOpen(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
      <div ref={dropdownRef} className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between px-2 py-1 border rounded text-sm bg-white hover:bg-gray-50"
        >
          <span className="truncate">{value || "--"}</span>
          <ChevronDown className={`w-3 h-3 ml-1 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>
        {isOpen && (
          <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-48 overflow-auto">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setIsOpen(false);
              }}
              className={`w-full text-left px-2 py-1 text-sm hover:bg-blue-50 ${value === "" ? "bg-blue-100 font-medium" : ""}`}
            >
              --
            </button>
            {mallProducts.map((product) => (
              <button
                key={product.code}
                type="button"
                onClick={() => {
                  onChange(product.code);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-2 py-1 text-sm hover:bg-blue-50 ${value === product.code ? "bg-blue-100 font-medium" : ""}`}
              >
                {product.code}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Package className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-800">商品登録</h1>
          {!isRealDataUser && (
            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">
              デモモード
            </span>
          )}
        </div>
        <button
          onClick={() => setIsAdding(true)}
          disabled={isAdding}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="w-5 h-5" />
          新規登録
        </button>
      </div>

      <p className="text-gray-600 mb-6">
        商品名と各モールでの商品コードを紐付けて登録します。
        各モールの商品コードはプルダウンから選択できます。
      </p>

      {/* CSV入稿セクション */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">CSV一括登録</h2>
        <div className="flex flex-wrap gap-4 items-center">
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            <Download className="w-5 h-5" />
            テンプレートDL
          </button>

          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv"
              onChange={handleCsvImport}
              className="hidden"
              id="csv-upload"
            />
            <label
              htmlFor="csv-upload"
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors cursor-pointer"
            >
              <Upload className="w-5 h-5" />
              CSVアップロード
            </label>
          </div>
        </div>

        {csvError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm whitespace-pre-line">
            {csvError}
          </div>
        )}

        {csvSuccess && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            {csvSuccess}
          </div>
        )}

        <p className="mt-4 text-sm text-gray-500">
          CSVフォーマット: 商品名, Amazon商品コード, 楽天商品コード, Qoo10商品コード
        </p>
      </div>

      {/* 新規登録フォーム */}
      {isAdding && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">新規商品登録</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                商品名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newProduct.productName}
                onChange={(e) =>
                  setNewProduct({ ...newProduct, productName: e.target.value })
                }
                placeholder="例: オーガニックシャンプー"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Amazon */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-500">Amazon</label>
                  {amazonLoading && (
                    <RefreshCw className="w-3 h-3 text-orange-500 animate-spin" />
                  )}
                </div>
                {amazonError ? (
                  <div className="text-xs text-red-500 p-2 bg-red-50 rounded">
                    {amazonError}
                    <button
                      onClick={fetchAmazonProducts}
                      className="ml-2 text-blue-600 hover:underline"
                    >
                      再取得
                    </button>
                  </div>
                ) : (
                  <ProductCodeDropdown
                    value={newProduct.amazonCode}
                    onChange={(value) => setNewProduct({ ...newProduct, amazonCode: value })}
                    mallProducts={amazonProducts}
                    mallName=""
                    mallColor="orange"
                  />
                )}
              </div>

              {/* 楽天 */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-500">楽天</label>
                  {rakutenLoading && (
                    <RefreshCw className="w-3 h-3 text-red-500 animate-spin" />
                  )}
                </div>
                {rakutenError ? (
                  <div className="text-xs text-red-500 p-2 bg-red-50 rounded">
                    {rakutenError}
                    <button
                      onClick={fetchRakutenProducts}
                      className="ml-2 text-blue-600 hover:underline"
                    >
                      再取得
                    </button>
                  </div>
                ) : (
                  <ProductCodeDropdown
                    value={newProduct.rakutenCode}
                    onChange={(value) => setNewProduct({ ...newProduct, rakutenCode: value })}
                    mallProducts={rakutenProducts}
                    mallName=""
                    mallColor="red"
                  />
                )}
              </div>

              {/* Qoo10 */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-500">Qoo10</label>
                  {qoo10Loading && (
                    <RefreshCw className="w-3 h-3 text-blue-500 animate-spin" />
                  )}
                </div>
                {qoo10Error ? (
                  <div className="text-xs text-red-500 p-2 bg-red-50 rounded">
                    {qoo10Error}
                    <button
                      onClick={fetchQoo10Products}
                      className="ml-2 text-blue-600 hover:underline"
                    >
                      再取得
                    </button>
                  </div>
                ) : (
                  <ProductCodeDropdown
                    value={newProduct.qoo10Code}
                    onChange={(value) => setNewProduct({ ...newProduct, qoo10Code: value })}
                    mallProducts={qoo10Products}
                    mallName=""
                    mallColor="blue"
                  />
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleAddProduct}
                disabled={!newProduct.productName}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                登録する
              </button>
              <button
                onClick={() => {
                  setIsAdding(false);
                  setNewProduct({
                    productName: "",
                    amazonCode: "",
                    rakutenCode: "",
                    qoo10Code: "",
                  });
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 登録済み商品一覧 */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  商品名
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  <span className="text-orange-600">Amazon</span>
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  <span className="text-red-600">楽天</span>
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  <span className="text-blue-600">Qoo10</span>
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {products.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    登録されている商品はありません
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    {editingId === product.id ? (
                      <>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={editProduct.productName}
                            onChange={(e) =>
                              setEditProduct({
                                ...editProduct,
                                productName: e.target.value,
                              })
                            }
                            className="w-full px-2 py-1 border rounded focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <TableDropdown
                            value={editProduct.amazonCode}
                            onChange={(value) =>
                              setEditProduct({
                                ...editProduct,
                                amazonCode: value,
                              })
                            }
                            mallProducts={amazonProducts}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <TableDropdown
                            value={editProduct.rakutenCode}
                            onChange={(value) =>
                              setEditProduct({
                                ...editProduct,
                                rakutenCode: value,
                              })
                            }
                            mallProducts={rakutenProducts}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <TableDropdown
                            value={editProduct.qoo10Code}
                            onChange={(value) =>
                              setEditProduct({
                                ...editProduct,
                                qoo10Code: value,
                              })
                            }
                            mallProducts={qoo10Products}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => handleSaveEdit(product.id)}
                              className="p-1 text-green-600 hover:bg-green-100 rounded"
                              title="保存"
                            >
                              <Save className="w-5 h-5" />
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                              title="キャンセル"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {product.productName}
                        </td>
                        <td className="px-4 py-3">
                          {product.amazonCode ? (
                            <div>
                              <span className="text-sm font-mono text-orange-600">
                                {product.amazonCode}
                              </span>
                              <p className="text-xs text-gray-500 truncate max-w-[200px]">
                                {getProductNameByCode(
                                  product.amazonCode,
                                  amazonProducts
                                )}
                              </p>
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {product.rakutenCode ? (
                            <div>
                              <span className="text-sm font-mono text-red-600">
                                {product.rakutenCode}
                              </span>
                              <p className="text-xs text-gray-500 truncate max-w-[200px]">
                                {getProductNameByCode(
                                  product.rakutenCode,
                                  rakutenProducts
                                )}
                              </p>
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {product.qoo10Code ? (
                            <div>
                              <span className="text-sm font-mono text-blue-600">
                                {product.qoo10Code}
                              </span>
                              <p className="text-xs text-gray-500 truncate max-w-[200px]">
                                {getProductNameByCode(
                                  product.qoo10Code,
                                  qoo10Products
                                )}
                              </p>
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => handleStartEdit(product)}
                              className="p-1 text-blue-600 hover:bg-blue-100 rounded"
                              title="編集"
                            >
                              <Edit2 className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(product.id)}
                              className="p-1 text-red-600 hover:bg-red-100 rounded"
                              title="削除"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
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
