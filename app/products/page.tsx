"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Package, Plus, Trash2, Edit2, Save, X, Upload, Download, ChevronDown, RefreshCw, FileSpreadsheet } from "lucide-react";
import {
  RegisteredProduct,
  MallProduct,
} from "@/lib/mockData";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, orderBy, where, writeBatch, Timestamp } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";

const BACKEND_URL = "https://mall-batch-manager-backend-983678294034.asia-northeast1.run.app";

// 全チャネル定義
const SALES_CHANNELS = {
  online: [
    { key: "Amazon", label: "Amazon", color: "#FF9900" },
    { key: "楽天", label: "楽天", color: "#BF0000" },
    { key: "Qoo10", label: "Qoo10", color: "#3266CC" },
    { key: "Yahoo", label: "Yahoo", color: "#FF0033" },
    { key: "自社サイト", label: "自社サイト", color: "#10B981" },
  ],
  store: [
    { key: "アインズ&トルペ", label: "アインズ&トルペ", color: "#8B5CF6" },
    { key: "LOFT", label: "LOFT", color: "#D97706" },
    { key: "ドンキ", label: "ドンキ", color: "#2563EB" },
    { key: "PLAZA", label: "PLAZA", color: "#EC4899" },
    { key: "東急ハンズ", label: "東急ハンズ", color: "#059669" },
    { key: "マツキヨ", label: "マツキヨ", color: "#7C3AED" },
    { key: "ツルハドラッグ", label: "ツルハドラッグ", color: "#0891B2" },
  ],
};

// デモ用データ（空）
const demoAmazonProducts: MallProduct[] = [];
const demoRakutenProducts: MallProduct[] = [];
const demoQoo10Products: MallProduct[] = [];
const demoRegisteredProducts: RegisteredProduct[] = [];

type NewProduct = {
  productName: string;
  skuName: string;
  brandName: string;
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
  const { isRealDataUser, isAuthLoading, allowedProductIds, isAdmin, user } = useAuth();
  const [products, setProducts] = useState<RegisteredProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState<NewProduct>({
    productName: "",
    skuName: "",
    brandName: "",
    amazonCode: "",
    rakutenCode: "",
    qoo10Code: "",
  });
  const [editProduct, setEditProduct] = useState<NewProduct>({
    productName: "",
    skuName: "",
    brandName: "",
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

  // 楽天商品手動追加用ステート
  const [showRakutenAddForm, setShowRakutenAddForm] = useState(false);
  const [newRakutenProduct, setNewRakutenProduct] = useState({ code: "", name: "" });
  const [rakutenAddLoading, setRakutenAddLoading] = useState(false);

  // Amazon売上入稿用ステート
  const [selectedProductForSales, setSelectedProductForSales] = useState<string | null>(null);
  const [amazonSalesUploading, setAmazonSalesUploading] = useState(false);
  const [amazonSalesError, setAmazonSalesError] = useState<string | null>(null);
  const [amazonSalesSuccess, setAmazonSalesSuccess] = useState<string | null>(null);
  const amazonSalesFileRef = useRef<HTMLInputElement>(null);

  // 楽天売上入稿用ステート
  const [selectedProductForRakutenSales, setSelectedProductForRakutenSales] = useState<string | null>(null);
  const [rakutenSalesUploading, setRakutenSalesUploading] = useState(false);
  const [rakutenSalesError, setRakutenSalesError] = useState<string | null>(null);
  const [rakutenSalesSuccess, setRakutenSalesSuccess] = useState<string | null>(null);
  const rakutenSalesFileRef = useRef<HTMLInputElement>(null);

  // Qoo10売上入稿用ステート
  const [selectedProductForQoo10Sales, setSelectedProductForQoo10Sales] = useState<string | null>(null);
  const [qoo10SalesUploading, setQoo10SalesUploading] = useState(false);
  const [qoo10SalesError, setQoo10SalesError] = useState<string | null>(null);
  const [qoo10SalesSuccess, setQoo10SalesSuccess] = useState<string | null>(null);
  const qoo10SalesFileRef = useRef<HTMLInputElement>(null);

  // 統合CSV入稿用ステート
  const [showUnifiedImport, setShowUnifiedImport] = useState(false);
  const [unifiedUploading, setUnifiedUploading] = useState(false);
  const [unifiedError, setUnifiedError] = useState<string | null>(null);
  const [unifiedSuccess, setUnifiedSuccess] = useState<string | null>(null);
  const unifiedFileRef = useRef<HTMLInputElement>(null);
  const [unifiedClients, setUnifiedClients] = useState<{ id: string; name: string; allowedProductIds: string[]; extraChannels: string[] }[]>([]);

  // チャネル別売上CSV入稿用ステート
  const [channelSalesUploading, setChannelSalesUploading] = useState(false);
  const [channelSalesError, setChannelSalesError] = useState<string | null>(null);
  const [channelSalesSuccess, setChannelSalesSuccess] = useState<string | null>(null);
  const channelSalesFileRef = useRef<HTMLInputElement>(null);
  const [selectedProductForChannelSales, setSelectedProductForChannelSales] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<string>("");

  // 再生数CSV入稿用ステート
  const [viewsUploading, setViewsUploading] = useState(false);
  const [viewsError, setViewsError] = useState<string | null>(null);
  const [viewsSuccess, setViewsSuccess] = useState<string | null>(null);
  const viewsFileRef = useRef<HTMLInputElement>(null);

  // Firestoreから商品一覧を取得（実データユーザーのみ）
  useEffect(() => {
    // 認証ロード中は何もしない
    if (isAuthLoading) return;

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
  }, [isRealDataUser, isAuthLoading]);

  // admin用: 統合CSV形式のクライアント情報を取得
  useEffect(() => {
    if (!isAdmin) return;
    const fetchUnifiedClients = async () => {
      try {
        const q2 = query(collection(db, "client_accounts"), where("salesFormat", "==", "unified"));
        const snap = await getDocs(q2);
        setUnifiedClients(snap.docs.map((d) => ({
          id: d.id,
          name: d.data().name || "",
          allowedProductIds: d.data().allowedProductIds || [],
          extraChannels: d.data().extraChannels || [],
        })));
      } catch (err) {
        console.error("統合クライアント取得エラー:", err);
      }
    };
    fetchUnifiedClients();
  }, [isAdmin]);

  const fetchProducts = async () => {
    setIsLoading(true);
    try {
      const q = query(collection(db, "registered_products"), orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);
      const productsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as RegisteredProduct[];
      // クライアントユーザーの場合は許可された商品のみ表示
      if (allowedProductIds) {
        setProducts(productsData.filter((p) => allowedProductIds.includes(p.id)));
      } else {
        setProducts(productsData);
      }
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

  // 保存済み楽天商品リストを取得
  const fetchRakutenProducts = async () => {
    setRakutenLoading(true);
    setRakutenError(null);
    try {
      const response = await fetch(`${BACKEND_URL}/rakuten/saved-products`);
      const data = await response.json();
      if (data.success) {
        if (data.products && data.products.length > 0) {
          const formatted: MallProduct[] = data.products.map((p: { code: string; name: string }) => ({
            code: p.code,
            name: p.name,
          }));
          setRakutenProducts(formatted);
        } else if (data.message) {
          setRakutenError(data.message);
        }
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

  // 楽天商品を手動で追加
  const addRakutenProductManually = async () => {
    if (!newRakutenProduct.code || !newRakutenProduct.name) return;
    setRakutenAddLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/rakuten/add-product`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRakutenProduct),
      });
      const data = await response.json();
      if (data.success) {
        const formatted: MallProduct[] = data.products.map((p: { code: string; name: string }) => ({
          code: p.code,
          name: p.name,
        }));
        setRakutenProducts(formatted);
        setNewRakutenProduct({ code: "", name: "" });
        setShowRakutenAddForm(false);
        setRakutenError(null);
      } else {
        alert(data.message || "商品の追加に失敗しました");
      }
    } catch (error) {
      console.error("楽天商品追加エラー:", error);
      alert("商品の追加に失敗しました");
    } finally {
      setRakutenAddLoading(false);
    }
  };

  // 楽天商品を削除
  const deleteRakutenProduct = async (code: string) => {
    if (!confirm("この商品を削除しますか？")) return;
    try {
      const response = await fetch(`${BACKEND_URL}/rakuten/delete-product/${encodeURIComponent(code)}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (data.success) {
        const formatted: MallProduct[] = data.products.map((p: { code: string; name: string }) => ({
          code: p.code,
          name: p.name,
        }));
        setRakutenProducts(formatted);
      } else {
        alert(data.message || "商品の削除に失敗しました");
      }
    } catch (error) {
      console.error("楽天商品削除エラー:", error);
      alert("商品の削除に失敗しました");
    }
  };

  // 過去の注文から楽天商品リストを抽出・更新
  const extractRakutenProductsFromOrders = async () => {
    setRakutenLoading(true);
    setRakutenError(null);
    try {
      const response = await fetch(`${BACKEND_URL}/rakuten/extract-products-from-orders`, {
        method: "POST",
      });
      const data = await response.json();
      if (data.success) {
        if (data.products && data.products.length > 0) {
          const formatted: MallProduct[] = data.products.map((p: { code: string; name: string }) => ({
            code: p.code,
            name: p.name,
          }));
          setRakutenProducts(formatted);
          alert(data.message || "商品リストを更新しました");
        } else {
          setRakutenError(data.message || "抽出できる商品がありませんでした");
        }
      } else {
        setRakutenError(data.message || "楽天商品の抽出に失敗しました");
      }
    } catch (error) {
      console.error("楽天商品抽出エラー:", error);
      setRakutenError("楽天商品の抽出に失敗しました");
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
        skuName: "",
        brandName: "",
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
      skuName: product.skuName || "",
      brandName: product.brandName || "",
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
  const handleCsvImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setCsvError(null);
    setCsvSuccess(null);

    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(line => line.trim());

      if (lines.length < 2) {
        setCsvError("CSVファイルにデータがありません（ヘッダー行のみ）");
        return;
      }

      // ヘッダー行をスキップしてデータを解析
      const errors: string[] = [];
      const savedProducts: RegisteredProduct[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const values = line.split(",").map(v => v.trim().replace(/^["']|["']$/g, ""));

        if (values.length < 1 || !values[0]) {
          errors.push(`${i + 1}行目: 商品名が空です`);
          continue;
        }

        const productData = {
          productName: values[0],
          amazonCode: values[1] || "",
          rakutenCode: values[2] || "",
          qoo10Code: values[3] || "",
          createdAt: new Date(),
        };

        // Firestoreに保存
        const docRef = await addDoc(collection(db, "registered_products"), productData);

        savedProducts.push({
          id: docRef.id,
          ...productData,
        });
      }

      if (errors.length > 0) {
        setCsvError(errors.join("\n"));
      }

      if (savedProducts.length > 0) {
        setProducts([...savedProducts, ...products]);
        setCsvSuccess(`${savedProducts.length}件の商品をFirestoreに保存しました`);
      }
    } catch (error) {
      console.error("CSV import error:", error);
      setCsvError("CSVファイルの処理に失敗しました");
    }

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

  // Amazon売上CSVテンプレートダウンロード
  const handleDownloadAmazonSalesTemplate = useCallback(() => {
    const headers = [
      "日付",
      "注文商品の売上額",
      "注文商品の売上額 - B2B",
      "注文された商品点数",
      "注文点数 - B2B",
      "注文品目総数",
      "注文品目総数 - B2B",
      "ページビュー - 合計",
      "ページビュー - 合計 - B2B",
      "セッション数 - 合計",
      "セッション数 - 合計 - B2B",
      "おすすめ出品（おすすめ商品）の獲得率",
      "おすすめ出品（おすすめ商品）の獲得率 - B2B",
      "ユニットセッション率",
      "ユニットセッション率 - B2B",
      "平均出品数",
      "親商品の平均数",
    ];

    const sampleData = [
      ["2025-12-01", "10000", "500", "5", "1", "5", "1", "100", "10", "80", "8", "0.95", "0.90", "0.05", "0.04", "1", "1"],
      ["2025-12-02", "15000", "750", "8", "2", "8", "2", "150", "15", "120", "12", "0.97", "0.92", "0.06", "0.05", "1", "1"],
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
    link.download = "Amazon売上データテンプレート.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  // Amazon売上CSVインポート（ヘッダー自動認識対応）
  const handleAmazonSalesCsvImport = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedProductForSales) return;

    setAmazonSalesError(null);
    setAmazonSalesSuccess(null);
    setAmazonSalesUploading(true);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split(/\r?\n/).filter(line => line.trim());

        if (lines.length < 2) {
          setAmazonSalesError("CSVファイルにデータがありません（ヘッダー行のみ）");
          setAmazonSalesUploading(false);
          return;
        }

        // ダブルクォートで囲まれたCSVを正しく分割
        const parseCSVLine = (line: string): string[] => {
          const result: string[] = [];
          let current = "";
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              result.push(current.trim().replace(/^["']|["']$/g, ""));
              current = "";
            } else {
              current += char;
            }
          }
          result.push(current.trim().replace(/^["']|["']$/g, ""));
          return result;
        };

        // 「注文商品の売上額」を含む行をヘッダーとして検出（1-2行目を優先検索）
        let headerLineIndex = 0;
        let salesColOverride: number | undefined;
        for (let i = 0; i < Math.min(lines.length, 5); i++) {
          const cols = parseCSVLine(lines[i]);
          const salesIdx = cols.findIndex(c => c.trim().replace(/^["']|["']$/g, "") === "注文商品の売上額");
          if (salesIdx !== -1) {
            headerLineIndex = i;
            salesColOverride = salesIdx;
            console.log("[CSVパース] ヘッダー行発見: 行", i, " 売上額列:", salesIdx);
            break;
          }
        }
        // フォールバック: 「日付」「売上」「ASIN」等のキーワードで検索
        if (salesColOverride === undefined) {
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes("日付") || lines[i].includes("売上") || lines[i].includes("ASIN") || lines[i].toLowerCase().includes("date")) {
              headerLineIndex = i;
              break;
            }
          }
        }

        // ヘッダー行を解析してカラムマッピングを作成
        const headerLine = lines[headerLineIndex];
        // ヘッダー正規化：全角スペース・全角ハイフン・複数スペースを正規化
        const normalizeHeader = (h: string) => {
          return h
            .trim()
            .replace(/^["']|["']$/g, "")
            .replace(/[\s\u3000]+/g, " ")  // 全角スペース・複数スペースを単一半角スペースに
            .replace(/[－―ー−]/g, "-")     // 全角ハイフン類を半角に
            .replace(/（/g, "(")           // 全角括弧を半角に
            .replace(/）/g, ")")
            .trim();
        };

        // 金額文字列をパース（"¥3,516,100" → "3516100"）
        const parseAmount = (val: string | undefined): string => {
          if (!val) return "0";
          // ¥記号、カンマ、スペースを除去して数値だけ取り出す
          const cleaned = val.replace(/[¥￥,\s]/g, "");
          // 数値以外の文字が含まれていたら0
          if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return "0";
          return cleaned || "0";
        };

        const headers = parseCSVLine(headerLine).map(normalizeHeader);
        console.log("[CSVパース] 正規化後ヘッダー:", headers);

        // ヘッダー名とフィールド名のマッピング（バリエーション対応）
        const headerMap: { [key: string]: string } = {
          // 日付
          "日付": "date",
          // 売上（複数バリエーション）
          "売上": "salesAmount",
          "売上額": "salesAmount",
          "注文商品の売上額": "salesAmount",
          "注文商品の売上": "salesAmount",
          // B2B売上
          "注文商品の売上額 - B2B": "salesAmountB2B",
          "注文商品の売上 - B2B": "salesAmountB2B",
          // 注文数
          "注文された商品点数": "orderedUnits",
          "注文商品点数": "orderedUnits",
          "注文点数 - B2B": "orderedUnitsB2B",
          // 注文品目
          "注文品目総数": "totalOrderItems",
          "注文品目総数 - B2B": "totalOrderItemsB2B",
          // ページビュー
          "ページビュー - 合計": "pageViews",
          "ページビュー": "pageViews",
          "ページビュー - 合計 - B2B": "pageViewsB2B",
          // セッション
          "セッション数 - 合計": "sessions",
          "セッション数": "sessions",
          "セッション数 - 合計 - B2B": "sessionsB2B",
          // カート獲得率
          "おすすめ出品(おすすめ商品)の獲得率": "buyBoxPercentage",
          "おすすめ出品（おすすめ商品）の獲得率": "buyBoxPercentage",
          "おすすめ出品の獲得率": "buyBoxPercentage",
          "おすすめ出品(おすすめ商品)の獲得率 - B2B": "buyBoxPercentageB2B",
          "おすすめ出品（おすすめ商品）の獲得率 - B2B": "buyBoxPercentageB2B",
          "おすすめ出品の獲得率 - B2B": "buyBoxPercentageB2B",
          // CVR
          "ユニットセッション率": "unitSessionPercentage",
          "ユニットセッション率 - B2B": "unitSessionPercentageB2B",
          // その他
          "平均出品数": "averageOfferCount",
          "親商品の平均数": "averageParentItems",
        };

        // カラムインデックスを特定
        const columnIndexes: { [field: string]: number } = {};
        headers.forEach((header, index) => {
          const fieldName = headerMap[header];
          if (fieldName) {
            columnIndexes[fieldName] = index;
          }
        });
        console.log("[CSVパース] マッピング結果:", columnIndexes);
        console.log("[CSVパース] salesAmountインデックス:", columnIndexes["salesAmount"]);

        // 日付は常にA列（0列目）
        columnIndexes["date"] = 0;

        // 売上額列: 完全一致で見つかった列を優先
        if (salesColOverride !== undefined) {
          columnIndexes["salesAmount"] = salesColOverride;
        }

        // ヘッダー行の次の行からデータ開始
        const dataStartIndex = headerLineIndex + 1;

        const isSimpleFormat = false; // 常にヘッダーベースで処理

        const parsedData = [];

        for (let i = dataStartIndex; i < lines.length; i++) {
          const line = lines[i];
          // ダブルクォートを考慮してCSVを正しく分割
          const values = parseCSVLine(line);

          if (values.length < 1 || !values[0]) {
            continue;
          }

          // 日付を正規化（YYYY/MM/DD → YYYY-MM-DD, M/DD/YYYY → YYYY-MM-DD, M/D → 今年のYYYY-MM-DD）
          const normalizeDate = (d: string): string => {
            const cleaned = d.trim();
            // YYYY/M/D or YYYY-M-D → ゼロ埋めしてYYYY-MM-DD
            const ymdMatch = cleaned.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
            if (ymdMatch) {
              return `${ymdMatch[1]}-${ymdMatch[2].padStart(2, "0")}-${ymdMatch[3].padStart(2, "0")}`;
            }
            // M/DD/YYYY or MM/DD/YYYY → YYYY-MM-DD
            const mdyMatch = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
            if (mdyMatch) {
              return `${mdyMatch[3]}-${mdyMatch[1].padStart(2, "0")}-${mdyMatch[2].padStart(2, "0")}`;
            }
            // M/D or MM/DD（年なし） → 今年を補完
            const mdMatch = cleaned.match(/^(\d{1,2})[/-](\d{1,2})$/);
            if (mdMatch) {
              const year = new Date().getFullYear();
              return `${year}-${mdMatch[1].padStart(2, "0")}-${mdMatch[2].padStart(2, "0")}`;
            }
            return cleaned.replace(/\//g, "-");
          };

          // 日付を取得（ヘッダーマッピングがあればそれを使う、なければ0列目）
          const dateColIdx = columnIndexes["date"] ?? 0;
          const date = normalizeDate(values[dateColIdx] || "");
          if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

          // 売上額を取得（ヘッダーマッピングがあればそれを使う）
          const salesColIdx = columnIndexes["salesAmount"];
          const salesAmount = salesColIdx !== undefined
            ? parseAmount(values[salesColIdx])
            : (isSimpleFormat ? parseAmount(values[1]) : parseAmount(values[1]));

          // 各フィールドをヘッダーから取得（あれば）、なければ"0"
          const getField = (field: string, fallbackIdx?: number): string => {
            if (columnIndexes[field] !== undefined) return parseAmount(values[columnIndexes[field]]);
            if (fallbackIdx !== undefined && values[fallbackIdx]) return parseAmount(values[fallbackIdx]);
            return "0";
          };
          const getFieldRaw = (field: string): string => {
            if (columnIndexes[field] !== undefined) return values[columnIndexes[field]] || "0";
            return "0";
          };

          parsedData.push({
            date,
            salesAmount,
            salesAmountB2B: getField("salesAmountB2B"),
            orderedUnits: getField("orderedUnits"),
            orderedUnitsB2B: getField("orderedUnitsB2B"),
            totalOrderItems: getField("totalOrderItems"),
            totalOrderItemsB2B: getField("totalOrderItemsB2B"),
            pageViews: getField("pageViews"),
            pageViewsB2B: getField("pageViewsB2B"),
            sessions: getField("sessions"),
            sessionsB2B: getField("sessionsB2B"),
            buyBoxPercentage: getFieldRaw("buyBoxPercentage"),
            buyBoxPercentageB2B: getFieldRaw("buyBoxPercentageB2B"),
            unitSessionPercentage: getFieldRaw("unitSessionPercentage"),
            unitSessionPercentageB2B: getFieldRaw("unitSessionPercentageB2B"),
            averageOfferCount: getField("averageOfferCount"),
            averageParentItems: getField("averageParentItems"),
          });
        }

        if (parsedData.length === 0) {
          setAmazonSalesError("有効なデータがありません");
          setAmazonSalesUploading(false);
          return;
        }

        // デバッグ：パースしたデータの最初の数行を出力
        console.log("[CSVパース] パースデータ件数:", parsedData.length);
        console.log("[CSVパース] 最初の3件:", parsedData.slice(0, 3));
        console.log("[CSVパース] isSimpleFormat:", isSimpleFormat, "columnIndexes['date']:", columnIndexes["date"]);

        // APIにPOST
        const response = await fetch(`${BACKEND_URL}/amazon/import-sales-csv/${selectedProductForSales}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: parsedData }),
        });

        const result = await response.json();

        if (result.success) {
          setAmazonSalesSuccess(result.message);
        } else {
          setAmazonSalesError(result.message || "データの保存に失敗しました");
        }
      } catch (err) {
        console.error("CSV parse error:", err);
        setAmazonSalesError("CSVファイルの解析に失敗しました");
      } finally {
        setAmazonSalesUploading(false);
        if (amazonSalesFileRef.current) {
          amazonSalesFileRef.current.value = "";
        }
      }
    };

    reader.onerror = () => {
      setAmazonSalesError("ファイルの読み込みに失敗しました");
      setAmazonSalesUploading(false);
    };

    // エンコーディング自動検出
    const tryReadWithEncoding = async (encoding: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = (e) => resolve(e.target?.result as string);
        r.onerror = () => reject(new Error("読み込みエラー"));
        r.readAsText(file, encoding);
      });
    };

    // BOMと先頭バイトを確認
    const arrayBufferReader = new FileReader();
    arrayBufferReader.onload = async (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      const bytes = new Uint8Array(buffer.slice(0, 4));
      console.log("[CSVパース] 先頭バイト:", Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' '));

      let encoding = "UTF-8";
      let skipBytes = 0;

      // BOM検出
      if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
        encoding = "UTF-16LE";
        skipBytes = 2;
        console.log("[CSVパース] UTF-16 LE BOM検出");
      } else if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
        encoding = "UTF-16BE";
        skipBytes = 2;
        console.log("[CSVパース] UTF-16 BE BOM検出");
      } else if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
        encoding = "UTF-8";
        skipBytes = 3;
        console.log("[CSVパース] UTF-8 BOM検出");
      }

      // 検出したエンコーディングで読み込み
      try {
        let text = await tryReadWithEncoding(encoding);

        // BOMをスキップ（テキストとして読んだ場合もBOM文字が残ることがある）
        if (text.charCodeAt(0) === 0xFEFF) {
          text = text.substring(1);
        }

        // ヘッダー検証（空行をスキップして実際のヘッダー行を探す）
        const allLines = text.split(/\r?\n/);
        console.log("[CSVパース] 最初の5行:", allLines.slice(0, 5));

        // 最初の有効な行（空カンマ行でない行）を探す
        let validLine = "";
        for (const line of allLines) {
          const values = line.split(",").filter(v => v.trim().replace(/^["']|["']$/g, "").length > 0);
          if (values.length > 0) {
            validLine = line;
            break;
          }
        }

        console.log("[CSVパース] 検出エンコーディング:", encoding, "有効な行:", validLine.substring(0, 50));

        // UTF-8で日本語が正しく読めているかチェック（文字化けしていないか）
        const hasValidJapanese = /[日付注文商品売上]/.test(validLine);
        const hasMojibake = /[\uFFFD]|譌･莉|豕ｨ譁/.test(validLine);

        console.log("[CSVパース] 日本語チェック: hasValidJapanese=", hasValidJapanese, "hasMojibake=", hasMojibake);

        if (hasValidJapanese && !hasMojibake) {
          // UTF-8で正しく読めている
          reader.onload?.({ target: { result: text } } as ProgressEvent<FileReader>);
        } else if (!hasMojibake && validLine.length > 0) {
          // 文字化けなし、日本語なし（英語CSVなど）
          reader.onload?.({ target: { result: text } } as ProgressEvent<FileReader>);
        } else {
          // Shift-JISで再試行
          console.log("[CSVパース] Shift-JISで再試行");
          const sjisText = await tryReadWithEncoding("Shift-JIS");
          reader.onload?.({ target: { result: sjisText } } as ProgressEvent<FileReader>);
        }
      } catch (err) {
        console.error("[CSVパース] エンコーディング検出失敗:", err);
        setAmazonSalesError("ファイルの読み込みに失敗しました");
        setAmazonSalesUploading(false);
      }
    };
    arrayBufferReader.readAsArrayBuffer(file);
  }, [selectedProductForSales]);

  // 楽天売上CSVテンプレートダウンロード
  const handleDownloadRakutenSalesTemplate = useCallback(() => {
    const headers = [
      "日付",
      "商品管理番号",
      "商品番号",
      "売上",
      "売上件数",
      "売上個数",
      "アクセス人数",
      "ユニークユーザー数",
      "転換率",
      "客単価",
      "総購入件数",
      "新規購入件数",
      "リピート購入件数",
      "未購入アクセス人数",
      "レビュー投稿数",
      "レビュー総合評価（点）",
      "総レビュー数",
      "滞在時間（秒）",
      "直帰数",
      "離脱数",
      "離脱率",
      "お気に入り登録ユーザ数",
      "お気に入り総ユーザ数",
      "在庫数",
    ];

    const sampleData = [
      ["2025-12-01", "ITEM001", "12345", "50000", "5", "10", "100", "80", "5.0", "10000", "5", "3", "2", "95", "1", "4.5", "10", "120", "20", "30", "30.0", "5", "50", "100"],
      ["2025-12-02", "ITEM001", "12345", "75000", "8", "15", "150", "120", "6.0", "9375", "8", "5", "3", "142", "2", "4.6", "12", "130", "25", "35", "28.0", "8", "58", "85"],
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
    link.download = "楽天売上データテンプレート.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  // 楽天売上CSVインポート
  const handleRakutenSalesCsvImport = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedProductForRakutenSales) return;

    setRakutenSalesError(null);
    setRakutenSalesSuccess(null);
    setRakutenSalesUploading(true);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split(/\r?\n/).filter(line => line.trim());

        if (lines.length < 2) {
          setRakutenSalesError("CSVファイルにデータがありません（ヘッダー行のみ）");
          setRakutenSalesUploading(false);
          return;
        }

        // 「日付」を含むヘッダー行を見つける
        let headerIdx = 0;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes("日付")) { headerIdx = i; break; }
        }

        // 日付正規化（M/D → YYYY-MM-DD, M/DD/YYYY → YYYY-MM-DD）
        const normalizeDate = (d: string): string => {
          const cleaned = d.trim();
          const ymdMatch = cleaned.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
          if (ymdMatch) return `${ymdMatch[1]}-${ymdMatch[2].padStart(2, "0")}-${ymdMatch[3].padStart(2, "0")}`;
          const mdyMatch = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
          if (mdyMatch) return `${mdyMatch[3]}-${mdyMatch[1].padStart(2, "0")}-${mdyMatch[2].padStart(2, "0")}`;
          const mdMatch = cleaned.match(/^(\d{1,2})[/-](\d{1,2})$/);
          if (mdMatch) {
            const year = new Date().getFullYear();
            return `${year}-${mdMatch[1].padStart(2, "0")}-${mdMatch[2].padStart(2, "0")}`;
          }
          return cleaned.replace(/\//g, "-");
        };

        const parsedData = [];

        for (let i = headerIdx + 1; i < lines.length; i++) {
          const line = lines[i];
          const values = line.split(",").map(v => v.trim().replace(/^["']|["']$/g, ""));

          if (values.length < 1 || !values[0]) {
            continue;
          }

          parsedData.push({
            date: normalizeDate(values[0]),
            productManagementCode: values[1] || "",
            productCode: values[2] || "",
            salesAmount: values[3] || "0",
            salesCount: values[4] || "0",
            salesUnits: values[5] || "0",
            accessUsers: values[6] || "0",
            uniqueUsers: values[7] || "0",
            conversionRate: values[8] || "0",
            averageOrderValue: values[9] || "0",
            totalPurchases: values[10] || "0",
            newPurchases: values[11] || "0",
            repeatPurchases: values[12] || "0",
            nonPurchaseAccess: values[13] || "0",
            reviewCount: values[14] || "0",
            reviewRating: values[15] || "0",
            totalReviews: values[16] || "0",
            stayTime: values[17] || "0",
            bounceCount: values[18] || "0",
            exitCount: values[19] || "0",
            exitRate: values[20] || "0",
            favoriteUsers: values[21] || "0",
            totalFavoriteUsers: values[22] || "0",
            stockCount: values[23] || "0",
          });
        }

        if (parsedData.length === 0) {
          setRakutenSalesError("有効なデータがありません");
          setRakutenSalesUploading(false);
          return;
        }

        const response = await fetch(`${BACKEND_URL}/rakuten/import-sales-csv/${selectedProductForRakutenSales}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: parsedData }),
        });

        const result = await response.json();

        if (result.success) {
          setRakutenSalesSuccess(result.message);
        } else {
          setRakutenSalesError(result.message || "データの保存に失敗しました");
        }
      } catch (err) {
        console.error("CSV parse error:", err);
        setRakutenSalesError("CSVファイルの解析に失敗しました");
      } finally {
        setRakutenSalesUploading(false);
        if (rakutenSalesFileRef.current) {
          rakutenSalesFileRef.current.value = "";
        }
      }
    };

    reader.onerror = () => {
      setRakutenSalesError("ファイルの読み込みに失敗しました");
      setRakutenSalesUploading(false);
    };

    reader.readAsText(file, "UTF-8");
  }, [selectedProductForRakutenSales]);

  // Qoo10売上CSVテンプレートダウンロード
  const handleDownloadQoo10SalesTemplate = useCallback(() => {
    const headers = [
      "日付",
      "売上",
      "売上個数",
    ];

    const sampleData = [
      ["2025-12-01", "30000", "5"],
      ["2025-12-02", "45000", "8"],
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
    link.download = "Qoo10売上データテンプレート.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  // Qoo10売上CSVインポート
  const handleQoo10SalesCsvImport = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedProductForQoo10Sales) return;

    setQoo10SalesError(null);
    setQoo10SalesSuccess(null);
    setQoo10SalesUploading(true);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split(/\r?\n/).filter(line => line.trim());

        if (lines.length < 2) {
          setQoo10SalesError("CSVファイルにデータがありません（ヘッダー行のみ）");
          setQoo10SalesUploading(false);
          return;
        }

        // ダブルクォート対応CSVパーサー
        const parseQoo10Line = (line: string): string[] => {
          const result: string[] = [];
          let current = "";
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') inQuotes = !inQuotes;
            else if (ch === ',' && !inQuotes) { result.push(current.trim().replace(/^["']|["']$/g, "")); current = ""; }
            else current += ch;
          }
          result.push(current.trim().replace(/^["']|["']$/g, ""));
          return result;
        };

        // ヘッダー行検出: 「受注金額」「開始日」「日付」を含む行を探す
        let qoo10HeaderIdx = 0;
        let salesColIdx = 1; // デフォルト: 2列目
        for (let i = 0; i < Math.min(lines.length, 5); i++) {
          const cols = parseQoo10Line(lines[i]);
          const idx = cols.findIndex(c => c === "受注金額");
          if (idx !== -1) {
            qoo10HeaderIdx = i;
            salesColIdx = idx;
            break;
          }
          if (cols.some(c => c === "開始日" || c === "日付" || c.toLowerCase() === "date")) {
            qoo10HeaderIdx = i;
            break;
          }
        }

        const normQoo10Date = (d: string): string => {
          const cleaned = d.trim();
          const ymdMatch = cleaned.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
          if (ymdMatch) return `${ymdMatch[1]}-${ymdMatch[2].padStart(2, "0")}-${ymdMatch[3].padStart(2, "0")}`;
          const mdyMatch = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
          if (mdyMatch) return `${mdyMatch[3]}-${mdyMatch[1].padStart(2, "0")}-${mdyMatch[2].padStart(2, "0")}`;
          const mdMatch = cleaned.match(/^(\d{1,2})[/-](\d{1,2})$/);
          if (mdMatch) {
            const year = new Date().getFullYear();
            return `${year}-${mdMatch[1].padStart(2, "0")}-${mdMatch[2].padStart(2, "0")}`;
          }
          return cleaned.replace(/\//g, "-");
        };

        const parseQoo10Amount = (val: string): string => {
          if (!val) return "0";
          return val.replace(/[¥￥,\s]/g, "") || "0";
        };

        const parsedData = [];

        for (let i = qoo10HeaderIdx + 1; i < lines.length; i++) {
          const values = parseQoo10Line(lines[i]);

          if (values.length < 1 || !values[0]) {
            continue;
          }

          parsedData.push({
            date: normQoo10Date(values[0]),
            sales: parseQoo10Amount(values[salesColIdx]),
            units: values[salesColIdx + 1] || "0",
          });
        }

        if (parsedData.length === 0) {
          setQoo10SalesError("有効なデータがありません");
          setQoo10SalesUploading(false);
          return;
        }

        // APIにPOST
        const response = await fetch(`${BACKEND_URL}/qoo10/import-sales-csv/${selectedProductForQoo10Sales}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: parsedData }),
        });

        const result = await response.json();

        if (result.success) {
          setQoo10SalesSuccess(result.message);
        } else {
          setQoo10SalesError(result.message || "データの保存に失敗しました");
        }
      } catch (err) {
        console.error("CSV parse error:", err);
        setQoo10SalesError("CSVファイルの解析に失敗しました");
      } finally {
        setQoo10SalesUploading(false);
        if (qoo10SalesFileRef.current) {
          qoo10SalesFileRef.current.value = "";
        }
      }
    };

    reader.onerror = () => {
      setQoo10SalesError("ファイルの読み込みに失敗しました");
      setQoo10SalesUploading(false);
    };

    reader.readAsText(file, "UTF-8");
  }, [selectedProductForQoo10Sales]);

  // 統合CSV入稿ハンドラ
  const handleUnifiedCsvImport = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUnifiedUploading(true);
    setUnifiedError(null);
    setUnifiedSuccess(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split(/\r?\n/).filter((l) => l.trim());

        if (lines.length < 2) {
          setUnifiedError("データがありません");
          setUnifiedUploading(false);
          return;
        }

        // ヘッダー解析
        const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
        const dateIdx = header.findIndex((h) => h === "order_date" || h === "date" || h === "日付");
        const storeIdx = header.findIndex((h) => h === "store_name" || h === "store" || h === "チャネル" || h === "モール");
        const brandIdx = header.findIndex((h) => h === "brand" || h === "ブランド");
        const itemCodeIdx = header.findIndex((h) => h === "item_code");
        const itemNameIdx = header.findIndex((h) => h === "item_name");
        const orderCountIdx = header.findIndex((h) => h === "order_count");
        const qtyIdx = header.findIndex((h) => h === "quantity" || h === "数量");
        const salesIdx = header.findIndex((h) => h === "sales_amount" || h === "売上" || h === "売上額");

        if (dateIdx === -1 || storeIdx === -1 || brandIdx === -1 || qtyIdx === -1 || salesIdx === -1) {
          setUnifiedError("CSVヘッダーが不正です。必要な列: order_date, store_name, brand, item_code, item_name, order_count, quantity, sales_amount");
          setUnifiedUploading(false);
          return;
        }

        // ブランド名→{productId, productName}マッピングを構築（大文字小文字不問）
        // brandName優先、未設定なら商品名でもマッチ
        const brandMap = new Map<string, { productId: string; productName: string }>();
        products.forEach((p) => {
          if (p.brandName) {
            brandMap.set(p.brandName.toLowerCase(), { productId: p.id, productName: p.productName });
          }
          // 商品名でもマッチ可能に（brandNameが優先）
          if (!brandMap.has(p.productName.toLowerCase())) {
            brandMap.set(p.productName.toLowerCase(), { productId: p.id, productName: p.productName });
          }
        });

        // データパース
        const unmatchedBrands = new Set<string>();
        const matchedProducts = new Set<string>();
        let savedCount = 0;

        const rows: { date: string; channel: string; productId: string; productName: string; orderCount: number; quantity: number; salesAmount: number }[] = [];

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(",").map((v) => v.trim());
          if (values.length < Math.max(dateIdx, storeIdx, brandIdx, qtyIdx, salesIdx) + 1) continue;

          const date = values[dateIdx];
          const store = values[storeIdx];
          const brand = values[brandIdx];
          const itemName = itemNameIdx !== -1 ? values[itemNameIdx] || "" : "";
          const orderCount = orderCountIdx !== -1 ? parseInt(values[orderCountIdx]) || 0 : 0;
          const quantity = parseInt(values[qtyIdx]) || 0;
          const salesAmount = parseInt(values[salesIdx]) || 0;

          // hirituブランドは item_name で商品を振り分け
          let matched = brandMap.get(brand.toLowerCase());
          if (brand.toLowerCase() === "hiritu" && itemName) {
            if (itemName.includes("柔軟剤")) {
              matched = brandMap.get("hiritu柔軟剤");
            } else if (itemName.includes("スクラブ")) {
              matched = brandMap.get("hirituスクラブ");
            }
          }

          if (!matched) {
            unmatchedBrands.add(brand);
            continue;
          }

          matchedProducts.add(matched.productName);
          rows.push({ date, channel: store, productId: matched.productId, productName: matched.productName, orderCount, quantity, salesAmount });
        }

        if (rows.length === 0) {
          const msg = unmatchedBrands.size > 0
            ? `マッチするブランド名がありません。未マッチ: ${Array.from(unmatchedBrands).join(", ")}。商品のブランド名を設定してください。`
            : "有効なデータがありません";
          setUnifiedError(msg);
          setUnifiedUploading(false);
          return;
        }

        // 同一(productId, channel, date)の複数行を合算（同ブランド内の複数SKUを集計）
        const aggMap = new Map<string, typeof rows[number]>();
        for (const r of rows) {
          const key = `${r.productId}|${r.channel}|${r.date}`;
          const existing = aggMap.get(key);
          if (existing) {
            existing.orderCount += r.orderCount;
            existing.quantity += r.quantity;
            existing.salesAmount += r.salesAmount;
          } else {
            aggMap.set(key, { ...r });
          }
        }
        const aggregatedRows = Array.from(aggMap.values());

        // Firestoreにバッチ書き込み（500件ずつ）
        const batchSize = 400;
        for (let i = 0; i < aggregatedRows.length; i += batchSize) {
          const batch = writeBatch(db);
          const chunk = aggregatedRows.slice(i, i + batchSize);

          for (const row of chunk) {
            // 決定論的docID: productId_channel_date で重複防止
            const docId = `${row.productId}_${row.channel}_${row.date}`;
            const docRef = doc(db, "unified_daily_sales", docId);
            batch.set(docRef, {
              productId: row.productId,
              date: row.date,
              channel: row.channel,
              productName: row.productName,
              orderCount: row.orderCount,
              quantity: row.quantity,
              salesAmount: row.salesAmount,
              createdAt: Timestamp.now(),
            });
          }

          await batch.commit();
          savedCount += chunk.length;
        }

        let msg = `${savedCount}件（${rows.length}行を集計）のデータを保存しました（${Array.from(matchedProducts).join(", ")}）`;
        if (unmatchedBrands.size > 0) {
          msg += `\n未マッチのブランド: ${Array.from(unmatchedBrands).join(", ")}`;
        }
        setUnifiedSuccess(msg);
      } catch (err: unknown) {
        console.error("統合CSVパースエラー:", err);
        const errMsg = err instanceof Error ? err.message : String(err);
        setUnifiedError(`エラー: ${errMsg}`);
      } finally {
        setUnifiedUploading(false);
        if (unifiedFileRef.current) {
          unifiedFileRef.current.value = "";
        }
      }
    };

    reader.onerror = () => {
      setUnifiedError("ファイルの読み込みに失敗しました");
      setUnifiedUploading(false);
    };

    reader.readAsText(file, "UTF-8");
  }, [products]);

  // 再生数CSV入稿ハンドラ
  // フォーマット: date, views（商品選択中の商品に紐づけ）
  const [selectedProductForViews, setSelectedProductForViews] = useState<string | null>(null);

  const handleViewsCsvImport = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedProductForViews) return;

    setViewsUploading(true);
    setViewsError(null);
    setViewsSuccess(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        let text = e.target?.result as string;
        // BOM除去
        if (text.charCodeAt(0) === 0xFEFF) text = text.substring(1);

        const lines = text.split(/\r?\n/).filter((l) => l.trim());
        if (lines.length < 2) {
          setViewsError("データがありません");
          setViewsUploading(false);
          return;
        }

        // CSVをカンマ分割（ダブルクォート内のカンマを考慮）
        const parseCsvLine = (line: string): string[] => {
          const result: string[] = [];
          let current = "";
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
              inQuotes = !inQuotes;
            } else if (ch === "," && !inQuotes) {
              result.push(current.trim());
              current = "";
            } else {
              current += ch;
            }
          }
          result.push(current.trim());
          return result;
        };

        const row1 = parseCsvLine(lines[0]);
        const row2 = parseCsvLine(lines[1]);

        // フォーマット自動判定
        const rows: { date: string; views: number }[] = [];

        // 横持ちフォーマット判定: 1行目に日付（YYYY/MM/DD等）が横に並んでいるか
        const datePattern = /^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/;
        const firstDateIdx = row1.findIndex((v) => datePattern.test(v));

        if (firstDateIdx !== -1) {
          // 横持ちフォーマット: 1行目=日付列、2行目=再生数
          for (let i = firstDateIdx; i < row1.length; i++) {
            if (!datePattern.test(row1[i])) continue;
            const date = row1[i].replace(/\//g, "-");
            const rawVal = (row2[i] || "").replace(/,/g, "").replace(/"/g, "");
            const views = parseInt(rawVal) || 0;
            if (views > 0) {
              rows.push({ date, views });
            }
          }
        } else {
          // 縦持ちフォーマット: date, views のヘッダー形式
          const header = row1.map((h) => h.toLowerCase());
          const dateIdx = header.findIndex((h) => h === "date" || h === "日付");
          const viewsIdx = header.findIndex((h) => h === "views" || h === "再生数" || h === "view_count");

          if (dateIdx === -1 || viewsIdx === -1) {
            setViewsError("CSVフォーマットを認識できません。横持ち（1行目に日付）または縦持ち（date, views列）に対応しています。");
            setViewsUploading(false);
            return;
          }

          for (let i = 1; i < lines.length; i++) {
            const values = parseCsvLine(lines[i]);
            if (values.length < Math.max(dateIdx, viewsIdx) + 1) continue;
            const date = values[dateIdx].replace(/\//g, "-");
            const rawVal = values[viewsIdx].replace(/,/g, "");
            const views = parseInt(rawVal) || 0;
            if (date && views > 0) {
              rows.push({ date, views });
            }
          }
        }

        if (rows.length === 0) {
          setViewsError("有効なデータがありません");
          setViewsUploading(false);
          return;
        }

        // Firestoreにバッチ書き込み
        let savedCount = 0;
        const batchSize = 400;
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = writeBatch(db);
          const chunk = rows.slice(i, i + batchSize);
          for (const row of chunk) {
            // 決定論的docID: productId_date で重複防止
            const docId = `${selectedProductForViews}_${row.date}`;
            const docRef = doc(db, "daily_views", docId);
            batch.set(docRef, {
              productId: selectedProductForViews,
              date: row.date,
              views: row.views,
              createdAt: Timestamp.now(),
            });
          }
          await batch.commit();
          savedCount += chunk.length;
        }

        const productName = products.find((p) => p.id === selectedProductForViews)?.productName || "";
        setViewsSuccess(`${productName}: ${savedCount}日分の再生数データを保存しました`);
      } catch (err: unknown) {
        console.error("再生数CSVパースエラー:", err);
        const errMsg = err instanceof Error ? err.message : String(err);
        setViewsError(`エラー: ${errMsg}`);
      } finally {
        setViewsUploading(false);
        if (viewsFileRef.current) viewsFileRef.current.value = "";
      }
    };

    reader.onerror = () => {
      setViewsError("ファイルの読み込みに失敗しました");
      setViewsUploading(false);
    };

    reader.readAsText(file, "UTF-8");
  }, [selectedProductForViews, products]);

  // チャネル別売上CSV入稿ハンドラ（汎用）
  const handleChannelSalesCsvImport = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedProductForChannelSales || !selectedChannel) return;

    setChannelSalesUploading(true);
    setChannelSalesError(null);
    setChannelSalesSuccess(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        let text = e.target?.result as string;
        if (text.charCodeAt(0) === 0xFEFF) text = text.substring(1);

        const lines = text.split(/\r?\n/).filter((l) => l.trim());
        if (lines.length < 2) {
          setChannelSalesError("データがありません");
          setChannelSalesUploading(false);
          return;
        }

        // ヘッダー行検出
        let headerIdx = 0;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes("日付") || lines[i].toLowerCase().includes("date")) { headerIdx = i; break; }
        }

        const parseCsvLine = (line: string): string[] => {
          const result: string[] = [];
          let current = "";
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') inQuotes = !inQuotes;
            else if (ch === "," && !inQuotes) { result.push(current.trim()); current = ""; }
            else current += ch;
          }
          result.push(current.trim());
          return result;
        };

        const normalizeDate = (d: string): string => {
          const cleaned = d.trim();
          const ymdMatch = cleaned.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
          if (ymdMatch) return `${ymdMatch[1]}-${ymdMatch[2].padStart(2, "0")}-${ymdMatch[3].padStart(2, "0")}`;
          const mdMatch = cleaned.match(/^(\d{1,2})[/-](\d{1,2})$/);
          if (mdMatch) {
            const year = new Date().getFullYear();
            return `${year}-${mdMatch[1].padStart(2, "0")}-${mdMatch[2].padStart(2, "0")}`;
          }
          return cleaned.replace(/\//g, "-");
        };

        // ヘッダー解析
        const header = parseCsvLine(lines[headerIdx]).map(h => h.replace(/^["']|["']$/g, "").trim().toLowerCase());
        const dateIdx = header.findIndex(h => h === "日付" || h === "date");
        const salesIdx = header.findIndex(h => h === "売上" || h === "売上額" || h === "sales" || h === "sales_amount" || h.includes("売上"));
        const qtyIdx = header.findIndex(h => h === "数量" || h === "個数" || h === "quantity" || h === "units" || h.includes("件数") || h.includes("個数"));

        if (dateIdx === -1) {
          setChannelSalesError("日付列が見つかりません。ヘッダーに「日付」または「date」を含めてください。");
          setChannelSalesUploading(false);
          return;
        }
        if (salesIdx === -1) {
          setChannelSalesError("売上列が見つかりません。ヘッダーに「売上」または「sales」を含めてください。");
          setChannelSalesUploading(false);
          return;
        }

        const rows: { date: string; salesAmount: number; quantity: number }[] = [];
        for (let i = headerIdx + 1; i < lines.length; i++) {
          const values = parseCsvLine(lines[i]);
          if (values.length <= dateIdx) continue;
          const date = normalizeDate(values[dateIdx].replace(/^["']|["']$/g, ""));
          if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
          const rawSales = (values[salesIdx] || "0").replace(/[¥￥,\s"]/g, "");
          const salesAmount = parseInt(rawSales) || 0;
          const rawQty = qtyIdx !== -1 ? (values[qtyIdx] || "0").replace(/[,\s"]/g, "") : "0";
          const quantity = parseInt(rawQty) || 0;
          rows.push({ date, salesAmount, quantity });
        }

        if (rows.length === 0) {
          setChannelSalesError("有効なデータがありません");
          setChannelSalesUploading(false);
          return;
        }

        // Firestoreにバッチ書き込み（unified_daily_sales）
        let savedCount = 0;
        const batchSize = 400;
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = writeBatch(db);
          const chunk = rows.slice(i, i + batchSize);
          for (const row of chunk) {
            // 決定論的docID: productId_channel_date で重複防止
            const docId = `${selectedProductForChannelSales}_${selectedChannel}_${row.date}`;
            const docRef = doc(db, "unified_daily_sales", docId);
            batch.set(docRef, {
              productId: selectedProductForChannelSales,
              date: row.date,
              channel: selectedChannel,
              quantity: row.quantity,
              salesAmount: row.salesAmount,
              createdAt: Timestamp.now(),
            });
          }
          await batch.commit();
          savedCount += chunk.length;
        }

        const productName = products.find(p => p.id === selectedProductForChannelSales)?.productName || "";
        setChannelSalesSuccess(`${productName}（${selectedChannel}）: ${savedCount}日分の売上データを保存しました`);
      } catch (err: unknown) {
        console.error("チャネル売上CSVエラー:", err);
        const errMsg = err instanceof Error ? err.message : String(err);
        setChannelSalesError(`エラー: ${errMsg}`);
      } finally {
        setChannelSalesUploading(false);
        if (channelSalesFileRef.current) channelSalesFileRef.current.value = "";
      }
    };

    reader.onerror = () => {
      setChannelSalesError("ファイルの読み込みに失敗しました");
      setChannelSalesUploading(false);
    };

    reader.readAsText(file, "UTF-8");
  }, [selectedProductForChannelSales, selectedChannel, products]);

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
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Package className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-800">商品登録</h1>
          {!isRealDataUser && (
            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">
              デモモード
            </span>
          )}
        </div>
        {isAdmin && (
          <button
            onClick={() => setIsAdding(true)}
            disabled={isAdding}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="w-5 h-5" />
            新規登録
          </button>
        )}
      </div>

      <p className="text-gray-600 mb-6">
        {isAdmin ? "商品名と各モールでの商品コードを紐付けて登録します。各モールの商品コードはプルダウンから選択できます。" : "売上データのCSV入稿ができます。"}
      </p>

      {/* CSV入稿セクション（admin only） */}
      {isAdmin && <div className="bg-white rounded-lg shadow-md p-6 mb-6">
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
      </div>}

      {/* 統合CSV売上入稿セクション（admin or unified形式のクライアント） */}
      {(isAdmin && unifiedClients.length > 0) || user?.salesFormat === "unified" ? (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6 border-l-4 border-purple-500">
          <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-purple-600" />
            統合CSV売上入稿
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            1つのCSVに全チャネル・全ブランドの売上データをまとめて入稿できます。
            {isAdmin && unifiedClients.length > 0 && (
              <span className="ml-1 text-purple-600">
                対象クライアント: {unifiedClients.map((c) => c.name).join(", ")}
              </span>
            )}
          </p>

          <div className="flex flex-wrap gap-4 items-center">
            <div>
              <input
                type="file"
                ref={unifiedFileRef}
                accept=".csv"
                onChange={handleUnifiedCsvImport}
                className="hidden"
                id="unified-csv-upload"
                disabled={unifiedUploading}
              />
              <label
                htmlFor="unified-csv-upload"
                className={`flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors cursor-pointer ${unifiedUploading ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {unifiedUploading ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <Upload className="w-5 h-5" />
                )}
                {unifiedUploading ? "アップロード中..." : "統合CSVアップロード"}
              </label>
            </div>
          </div>

          {unifiedError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {unifiedError}
            </div>
          )}

          {unifiedSuccess && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              {unifiedSuccess}
            </div>
          )}

          <div className="mt-4 bg-gray-50 p-4 rounded-lg text-sm text-gray-600">
            <p className="font-medium mb-1">CSVフォーマット:</p>
            <p className="text-xs font-mono">order_date, store_name, brand, item_code, item_name, order_count, quantity, sales_amount</p>
            <p className="text-xs mt-1 text-gray-400">store_name: Amazon, 楽天, Qoo10, 自社サイト, アインズ&トルペ 等</p>
            <p className="text-xs text-gray-400">brand: 商品に設定した「ブランド名」と一致させてください</p>
          </div>
        </div>
      ) : null}

      {/* 再生数CSV入稿セクション（admin only） */}
      {isAdmin && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6 border-l-4 border-pink-400">
          <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-pink-500" />
            再生数CSV入稿
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            商品ごとの日別再生数をCSVで入稿します。ダッシュボードの売上グラフに折れ線で表示されます。
          </p>

          <div className="flex flex-wrap gap-4 items-center">
            {/* 商品選択 */}
            <select
              value={selectedProductForViews || ""}
              onChange={(e) => setSelectedProductForViews(e.target.value || null)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none text-sm"
            >
              <option value="">商品を選択...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.productName}{p.skuName ? `（${p.skuName}）` : ""}
                </option>
              ))}
            </select>

            <div>
              <input
                type="file"
                ref={viewsFileRef}
                accept=".csv"
                onChange={handleViewsCsvImport}
                className="hidden"
                id="views-csv-upload"
                disabled={viewsUploading || !selectedProductForViews}
              />
              <label
                htmlFor="views-csv-upload"
                className={`flex items-center gap-2 px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors cursor-pointer ${(viewsUploading || !selectedProductForViews) ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {viewsUploading ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <Upload className="w-5 h-5" />
                )}
                {viewsUploading ? "アップロード中..." : "CSVアップロード"}
              </label>
            </div>
          </div>

          {viewsError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {viewsError}
            </div>
          )}

          {viewsSuccess && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              {viewsSuccess}
            </div>
          )}

          <div className="mt-4 bg-gray-50 p-4 rounded-lg text-sm text-gray-600">
            <p className="font-medium mb-1">対応フォーマット:</p>
            <p className="text-xs text-gray-400">横持ち: 1行目に日付、2行目に全体再生数（TTO共有シートの各媒体分析CSVそのまま対応）</p>
            <p className="text-xs text-gray-400">縦持ち: date, views の2列</p>
          </div>
        </div>
      )}

      {/* チャネル別売上CSV入稿モーダル */}
      {selectedProductForChannelSales && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-blue-500" />
                  その他チャネル売上入稿
                </h2>
                <button
                  onClick={() => {
                    setSelectedProductForChannelSales(null);
                    setChannelSalesError(null);
                    setChannelSalesSuccess(null);
                    setSelectedChannel("");
                  }}
                  className="p-1 text-gray-500 hover:bg-gray-100 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-gray-600 mb-4">
                商品: <span className="font-medium">{products.find(p => p.id === selectedProductForChannelSales)?.productName}</span>
              </p>

              <div className="space-y-4">
                {/* チャネル選択 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">チャネル</label>
                  <select
                    value={selectedChannel}
                    onChange={(e) => setSelectedChannel(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  >
                    <option value="">チャネルを選択...</option>
                    <optgroup label="オンライン">
                      {SALES_CHANNELS.online.map(ch => (
                        <option key={ch.key} value={ch.key}>{ch.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="店舗">
                      {SALES_CHANNELS.store.map(ch => (
                        <option key={ch.key} value={ch.key}>{ch.label}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                {/* アップロード */}
                <div>
                  <input
                    type="file"
                    ref={channelSalesFileRef}
                    accept=".csv"
                    onChange={handleChannelSalesCsvImport}
                    className="hidden"
                    id="channel-sales-csv-upload"
                    disabled={channelSalesUploading || !selectedChannel}
                  />
                  <label
                    htmlFor="channel-sales-csv-upload"
                    className={`flex items-center justify-center gap-2 w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors cursor-pointer ${(channelSalesUploading || !selectedChannel) ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    {channelSalesUploading ? (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : (
                      <Upload className="w-5 h-5" />
                    )}
                    {channelSalesUploading ? "アップロード中..." : "CSVアップロード"}
                  </label>
                </div>

                {channelSalesError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{channelSalesError}</div>
                )}
                {channelSalesSuccess && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{channelSalesSuccess}</div>
                )}

                <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-600">
                  <p className="font-medium mb-1">CSVフォーマット:</p>
                  <p className="text-xs font-mono">日付, 売上, 数量</p>
                  <p className="text-xs mt-1 text-gray-400">日付: YYYY/MM/DD, M/D 等対応。ヘッダー行に「日付」「売上」を含めてください。</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 新規登録フォーム（admin only） */}
      {isAdmin && isAdding && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">新規商品登録</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SKU名
                </label>
                <input
                  type="text"
                  value={newProduct.skuName}
                  onChange={(e) =>
                    setNewProduct({ ...newProduct, skuName: e.target.value })
                  }
                  placeholder="例: 500ml / 詰替用（複数SKUをまとめる場合に入力）"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ブランド名（統合CSV用）
                </label>
                <input
                  type="text"
                  value={newProduct.brandName}
                  onChange={(e) =>
                    setNewProduct({ ...newProduct, brandName: e.target.value })
                  }
                  placeholder="例: unu（CSVのbrand列と一致させる）"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
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
                  <div className="flex items-center gap-2">
                    {rakutenLoading && (
                      <RefreshCw className="w-3 h-3 text-red-500 animate-spin" />
                    )}
                    <button
                      onClick={() => setShowRakutenAddForm(true)}
                      className="text-xs text-green-600 hover:underline"
                      title="商品を手動で追加"
                    >
                      + 追加
                    </button>
                    <button
                      onClick={extractRakutenProductsFromOrders}
                      disabled={rakutenLoading}
                      className="text-xs text-red-600 hover:underline disabled:opacity-50"
                      title="過去30日の注文から商品を抽出"
                    >
                      注文から更新
                    </button>
                  </div>
                </div>
                {showRakutenAddForm && (
                  <div className="p-3 bg-gray-50 rounded border space-y-2">
                    <input
                      type="text"
                      placeholder="商品コード"
                      value={newRakutenProduct.code}
                      onChange={(e) => setNewRakutenProduct({ ...newRakutenProduct, code: e.target.value })}
                      className="w-full px-2 py-1 text-sm border rounded"
                    />
                    <input
                      type="text"
                      placeholder="商品名"
                      value={newRakutenProduct.name}
                      onChange={(e) => setNewRakutenProduct({ ...newRakutenProduct, name: e.target.value })}
                      className="w-full px-2 py-1 text-sm border rounded"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={addRakutenProductManually}
                        disabled={!newRakutenProduct.code || !newRakutenProduct.name || rakutenAddLoading}
                        className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                      >
                        {rakutenAddLoading ? "追加中..." : "追加"}
                      </button>
                      <button
                        onClick={() => {
                          setShowRakutenAddForm(false);
                          setNewRakutenProduct({ code: "", name: "" });
                        }}
                        className="px-3 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                )}
                {rakutenError ? (
                  <div className="text-xs text-red-500 p-2 bg-red-50 rounded whitespace-pre-wrap">
                    {rakutenError}
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={extractRakutenProductsFromOrders}
                        className="text-blue-600 hover:underline"
                      >
                        注文から取得
                      </button>
                      <button
                        onClick={() => setShowRakutenAddForm(true)}
                        className="text-green-600 hover:underline"
                      >
                        手動で追加
                      </button>
                    </div>
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
                    skuName: "",
                    brandName: "",
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
                {isAdmin && <>
                  <th className="hidden md:table-cell px-4 py-3 text-left text-sm font-semibold text-gray-700">SKU名</th>
                  <th className="hidden md:table-cell px-4 py-3 text-left text-sm font-semibold text-gray-700">ブランド名</th>
                  <th className="hidden md:table-cell px-4 py-3 text-left text-sm font-semibold text-gray-700"><span className="text-orange-600">Amazon</span></th>
                  <th className="hidden md:table-cell px-4 py-3 text-left text-sm font-semibold text-gray-700"><span className="text-red-600">楽天</span></th>
                  <th className="hidden md:table-cell px-4 py-3 text-left text-sm font-semibold text-gray-700"><span className="text-blue-600">Qoo10</span></th>
                  <th className="hidden md:table-cell px-4 py-3 text-center text-sm font-semibold text-gray-700">操作</th>
                </>}
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                  売上入稿
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {products.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    登録されている商品はありません
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    {isAdmin && editingId === product.id ? (
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
                          <input
                            type="text"
                            value={editProduct.skuName}
                            onChange={(e) =>
                              setEditProduct({
                                ...editProduct,
                                skuName: e.target.value,
                              })
                            }
                            className="w-full px-2 py-1 border rounded focus:ring-2 focus:ring-blue-500"
                            placeholder="SKU名"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={editProduct.brandName}
                            onChange={(e) =>
                              setEditProduct({
                                ...editProduct,
                                brandName: e.target.value,
                              })
                            }
                            className="w-full px-2 py-1 border rounded focus:ring-2 focus:ring-blue-500"
                            placeholder="ブランド名"
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
                        <td className="px-4 py-3 text-center">
                          <span className="text-gray-400">-</span>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {product.productName}
                        </td>
                        {isAdmin && <>
                          <td className="hidden md:table-cell px-4 py-3 text-gray-600 text-sm">{product.skuName || "-"}</td>
                          <td className="hidden md:table-cell px-4 py-3 text-gray-600 text-sm">{product.brandName || "-"}</td>
                          <td className="hidden md:table-cell px-4 py-3">
                            {product.amazonCode ? (
                              <div>
                                <span className="text-sm font-mono text-orange-600">{product.amazonCode}</span>
                                <p className="text-xs text-gray-500 truncate max-w-[200px]">{getProductNameByCode(product.amazonCode, amazonProducts)}</p>
                              </div>
                            ) : <span className="text-gray-400">-</span>}
                          </td>
                          <td className="hidden md:table-cell px-4 py-3">
                            {product.rakutenCode ? (
                              <div>
                                <span className="text-sm font-mono text-red-600">{product.rakutenCode}</span>
                                <p className="text-xs text-gray-500 truncate max-w-[200px]">{getProductNameByCode(product.rakutenCode, rakutenProducts)}</p>
                              </div>
                            ) : <span className="text-gray-400">-</span>}
                          </td>
                          <td className="hidden md:table-cell px-4 py-3">
                            {product.qoo10Code ? (
                              <div>
                                <span className="text-sm font-mono text-blue-600">{product.qoo10Code}</span>
                                <p className="text-xs text-gray-500 truncate max-w-[200px]">{getProductNameByCode(product.qoo10Code, qoo10Products)}</p>
                              </div>
                            ) : <span className="text-gray-400">-</span>}
                          </td>
                          <td className="hidden md:table-cell px-4 py-3">
                            <div className="flex justify-center gap-2">
                              <button onClick={() => handleStartEdit(product)} className="p-1 text-blue-600 hover:bg-blue-100 rounded" title="編集"><Edit2 className="w-5 h-5" /></button>
                              <button onClick={() => handleDeleteProduct(product.id)} className="p-1 text-red-600 hover:bg-red-100 rounded" title="削除"><Trash2 className="w-5 h-5" /></button>
                            </div>
                          </td>
                        </>}
                        <td className="px-4 py-3 text-center">
                          <div className="flex justify-center gap-1">
                            <button
                              onClick={() => setSelectedProductForSales(product.id)}
                              className="p-1 text-orange-600 hover:bg-orange-100 rounded"
                              title="Amazon売上入稿"
                            >
                              <FileSpreadsheet className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => setSelectedProductForRakutenSales(product.id)}
                              className="p-1 text-red-600 hover:bg-red-100 rounded"
                              title="楽天売上入稿"
                            >
                              <FileSpreadsheet className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => setSelectedProductForQoo10Sales(product.id)}
                              className="p-1 text-blue-600 hover:bg-blue-100 rounded"
                              title="Qoo10売上入稿"
                            >
                              <FileSpreadsheet className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => {
                                setSelectedProductForChannelSales(product.id);
                                setChannelSalesError(null);
                                setChannelSalesSuccess(null);
                              }}
                              className="p-1 text-gray-500 hover:bg-gray-100 rounded"
                              title="その他チャネル売上入稿"
                            >
                              <Plus className="w-4 h-4" />
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

      {/* Amazon売上データ入稿モーダル */}
      {selectedProductForSales && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-orange-600" />
                  Amazon売上データ入稿
                </h2>
                <button
                  onClick={() => {
                    setSelectedProductForSales(null);
                    setAmazonSalesError(null);
                    setAmazonSalesSuccess(null);
                  }}
                  className="p-1 text-gray-500 hover:bg-gray-100 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-gray-600 mb-4">
                商品: <span className="font-medium">{products.find(p => p.id === selectedProductForSales)?.productName}</span>
              </p>

              <div className="space-y-4">
                <div className="flex flex-wrap gap-4">
                  <div>
                    <input
                      type="file"
                      ref={amazonSalesFileRef}
                      accept=".csv"
                      onChange={handleAmazonSalesCsvImport}
                      className="hidden"
                      id="amazon-sales-csv-upload"
                      disabled={amazonSalesUploading}
                    />
                    <label
                      htmlFor="amazon-sales-csv-upload"
                      className={`flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors cursor-pointer ${amazonSalesUploading ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      {amazonSalesUploading ? (
                        <RefreshCw className="w-5 h-5 animate-spin" />
                      ) : (
                        <Upload className="w-5 h-5" />
                      )}
                      {amazonSalesUploading ? "アップロード中..." : "CSVアップロード"}
                    </label>
                  </div>
                </div>

                {amazonSalesError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {amazonSalesError}
                  </div>
                )}

                {amazonSalesSuccess && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                    {amazonSalesSuccess}
                  </div>
                )}

                <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-600">
                  <p className="font-medium mb-1">対応フォーマット:</p>
                  <p className="text-xs text-gray-500">A列に日付、ヘッダー行に「注文商品の売上額」を含むCSV</p>
                  <p className="text-xs text-gray-500">Amazon セラーセントラルのビジネスレポートCSVをそのままアップロードできます</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 楽天売上データ入稿モーダル */}
      {selectedProductForRakutenSales && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-red-600" />
                  楽天売上データ入稿
                </h2>
                <button
                  onClick={() => {
                    setSelectedProductForRakutenSales(null);
                    setRakutenSalesError(null);
                    setRakutenSalesSuccess(null);
                  }}
                  className="p-1 text-gray-500 hover:bg-gray-100 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-gray-600 mb-4">
                商品: <span className="font-medium">{products.find(p => p.id === selectedProductForRakutenSales)?.productName}</span>
              </p>

              <div className="space-y-4">
                <div className="flex flex-wrap gap-4">
                  <div>
                    <input
                      type="file"
                      ref={rakutenSalesFileRef}
                      accept=".csv"
                      onChange={handleRakutenSalesCsvImport}
                      className="hidden"
                      id="rakuten-sales-csv-upload"
                      disabled={rakutenSalesUploading}
                    />
                    <label
                      htmlFor="rakuten-sales-csv-upload"
                      className={`flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors cursor-pointer ${rakutenSalesUploading ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      {rakutenSalesUploading ? (
                        <RefreshCw className="w-5 h-5 animate-spin" />
                      ) : (
                        <Upload className="w-5 h-5" />
                      )}
                      {rakutenSalesUploading ? "アップロード中..." : "CSVアップロード"}
                    </label>
                  </div>
                </div>

                {rakutenSalesError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {rakutenSalesError}
                  </div>
                )}

                {rakutenSalesSuccess && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                    {rakutenSalesSuccess}
                  </div>
                )}

                <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-600">
                  <p className="font-medium mb-1">対応フォーマット:</p>
                  <p className="text-xs text-gray-500">ヘッダー行に「日付」を含むCSV（楽天RMSのアクセス流入分析CSVそのまま対応）</p>
                  <p className="text-xs text-gray-500">日付は M/D, YYYY/MM/DD, YYYY/M/D いずれも対応</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Qoo10売上データ入稿モーダル */}
      {selectedProductForQoo10Sales && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                  Qoo10売上データ入稿
                </h2>
                <button
                  onClick={() => {
                    setSelectedProductForQoo10Sales(null);
                    setQoo10SalesError(null);
                    setQoo10SalesSuccess(null);
                  }}
                  className="p-1 text-gray-500 hover:bg-gray-100 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-gray-600 mb-4">
                商品: <span className="font-medium">{products.find(p => p.id === selectedProductForQoo10Sales)?.productName}</span>
              </p>

              <div className="space-y-4">
                <div className="flex flex-wrap gap-4">
                  <div>
                    <input
                      type="file"
                      ref={qoo10SalesFileRef}
                      accept=".csv"
                      onChange={handleQoo10SalesCsvImport}
                      className="hidden"
                      id="qoo10-sales-csv-upload"
                      disabled={qoo10SalesUploading}
                    />
                    <label
                      htmlFor="qoo10-sales-csv-upload"
                      className={`flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer ${qoo10SalesUploading ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      {qoo10SalesUploading ? (
                        <RefreshCw className="w-5 h-5 animate-spin" />
                      ) : (
                        <Upload className="w-5 h-5" />
                      )}
                      {qoo10SalesUploading ? "アップロード中..." : "CSVアップロード"}
                    </label>
                  </div>
                </div>

                {qoo10SalesError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {qoo10SalesError}
                  </div>
                )}

                {qoo10SalesSuccess && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                    {qoo10SalesSuccess}
                  </div>
                )}

                <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-600">
                  <p className="font-medium mb-1">対応フォーマット:</p>
                  <p className="text-xs text-gray-500">A列に開始日（日付）、ヘッダーに「受注金額」を含むCSV</p>
                  <p className="text-xs text-gray-500">Qoo10の売上データCSVをそのままアップロードできます</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
