"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, Megaphone, Share2, ChevronDown, RefreshCw, Flag, X } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, onSnapshot, Timestamp, getDocs, where } from "firebase/firestore";
import { formatCurrency } from "@/lib/mockData";
import { useAuth } from "@/lib/auth-context";

// 登録商品の型
interface RegisteredProduct {
  id: string;
  productName: string;
  skuName?: string;
  amazonCode: string;
  rakutenCode: string;
  qoo10Code: string;
}

// Firestoreのデータ型
interface SalesData {
  id: string;
  date: string;
  amazon: number;
  rakuten: number;
  qoo10: number;
  amazonAd: number;
  rakutenAd: number;
  qoo10Ad: number;
  xAd: number;
  tiktokAd: number;
  status?: string;
  createdAt?: Timestamp;
}

// モールのテーマカラー
const MALL_COLORS = {
  amazon: "#FF9900",
  rakuten: "#BF0000",
  qoo10: "#3266CC",
};

// 広告費の色
const AD_TOTAL_COLOR = "#10B981"; // エメラルドグリーン（モール内広告費合計）

// 外部広告費の色
const EXTERNAL_AD_COLORS = {
  x: "#000000",       // X（黒）
  tiktok: "#FF0050",  // TikTok（ピンク）
};

const BACKEND_URL = "https://mall-batch-manager-api-983678294034.asia-northeast1.run.app";

// 商品別売上データの型（媒体別）
interface ProductSalesData {
  date: string;
  amazonSales: number;
  amazonQuantity: number;
  qoo10Sales: number;
  qoo10Quantity: number;
  rakutenSales: number;
  rakutenQuantity: number;
}

// イベントフラグの型
interface EventFlag {
  id: string;
  name: string;
  date: string;
  description: string;
}

// デモ用のフラグデータ
const demoFlags: EventFlag[] = [
  { id: "demo-1", name: "セール開始", date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split("T")[0], description: "ブラックフライデーセール開始" },
  { id: "demo-2", name: "広告開始", date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0], description: "TikTok広告キャンペーン開始" },
];

// デモ用のダミーデータ
const generateDemoData = (): SalesData[] => {
  const data: SalesData[] = [];
  const today = new Date();
  for (let i = 30; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];
    data.push({
      id: `demo-${i}`,
      date: dateStr,
      amazon: Math.floor(Math.random() * 50000) + 10000,
      rakuten: Math.floor(Math.random() * 40000) + 8000,
      qoo10: Math.floor(Math.random() * 30000) + 5000,
      amazonAd: Math.floor(Math.random() * 5000) + 1000,
      rakutenAd: Math.floor(Math.random() * 4000) + 800,
      qoo10Ad: Math.floor(Math.random() * 3000) + 500,
      xAd: Math.floor(Math.random() * 2000) + 300,
      tiktokAd: Math.floor(Math.random() * 2500) + 400,
    });
  }
  return data;
};

// デモ用の商品データ
const demoProducts: RegisteredProduct[] = [
  { id: "demo-1", productName: "デモ商品A", skuName: "1本", amazonCode: "DEMO-A", rakutenCode: "DEMO-A", qoo10Code: "" },
  { id: "demo-2", productName: "デモ商品A", skuName: "3本セット", amazonCode: "DEMO-A2", rakutenCode: "DEMO-A2", qoo10Code: "" },
  { id: "demo-3", productName: "デモ商品B", amazonCode: "DEMO-B", rakutenCode: "DEMO-B", qoo10Code: "" },
];

export default function DashboardPage() {
  const { isRealDataUser, isAuthLoading } = useAuth();
  const [salesData, setSalesData] = useState<SalesData[]>([]);
  const [registeredProducts, setRegisteredProducts] = useState<RegisteredProduct[]>([]);
  const [productSalesData, setProductSalesData] = useState<ProductSalesData[]>([]);
  const [eventFlags, setEventFlags] = useState<EventFlag[]>([]);
  const [showFlags, setShowFlags] = useState(true);
  const [selectedFlag, setSelectedFlag] = useState<EventFlag | null>(null);
  const [loading, setLoading] = useState(true);
  const [productLoading, setProductLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [amazonSyncLoading, setAmazonSyncLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const [startDate, setStartDate] = useState(thirtyDaysAgo.toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split("T")[0]);
  const [selectedMalls, setSelectedMalls] = useState({
    amazon: true,
    rakuten: true,
    qoo10: true,
  });
  const [showAdCost, setShowAdCost] = useState({
    amazon: true,
    rakuten: true,
    qoo10: true,
  });
  const [showExternalAd, setShowExternalAd] = useState({
    x: true,
    tiktok: true,
  });
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const [isSkuDropdownOpen, setIsSkuDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const skuDropdownRef = useRef<HTMLDivElement>(null);

  // Firestoreからイベントフラグを取得
  useEffect(() => {
    if (isAuthLoading) return;

    if (!isRealDataUser) {
      setEventFlags(demoFlags);
      return;
    }

    const fetchFlags = async () => {
      try {
        // インデックスなしで取得し、クライアント側でソート
        const snapshot = await getDocs(collection(db, "event_flags"));
        const flags = snapshot.docs.map((doc) => ({
          id: doc.id,
          name: doc.data().name || "",
          date: doc.data().date || "",
          description: doc.data().description || "",
        })) as EventFlag[];
        // 日付降順でソート
        flags.sort((a, b) => b.date.localeCompare(a.date));
        setEventFlags(flags);
      } catch (err) {
        console.error("フラグ取得エラー:", err);
      }
    };
    fetchFlags();
  }, [isRealDataUser, isAuthLoading]);

  // Firestoreから登録商品を取得（実データユーザーのみ）
  useEffect(() => {
    if (isAuthLoading) return;

    if (!isRealDataUser) {
      // デモユーザーはデモ商品を表示
      setRegisteredProducts(demoProducts);
      return;
    }

    const fetchProducts = async () => {
      try {
        const q = query(collection(db, "registered_products"), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        const products = snapshot.docs.map((doc) => ({
          id: doc.id,
          productName: doc.data().productName || "",
          skuName: doc.data().skuName || "",
          amazonCode: doc.data().amazonCode || "",
          rakutenCode: doc.data().rakutenCode || "",
          qoo10Code: doc.data().qoo10Code || "",
        })) as RegisteredProduct[];
        setRegisteredProducts(products);
      } catch (err) {
        console.error("商品取得エラー:", err);
      }
    };
    fetchProducts();
  }, [isRealDataUser, isAuthLoading]);

  // Firestoreからリアルタイムでデータを取得（実データユーザーのみ）
  useEffect(() => {
    if (isAuthLoading) return;

    setLoading(true);
    setError(null);

    if (!isRealDataUser) {
      // デモユーザーはデモデータを表示
      setSalesData(generateDemoData());
      setLoading(false);
      return;
    }

    const salesRef = collection(db, "sales_data");
    const q = query(salesRef, orderBy("date", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data: SalesData[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          date: doc.data().date || "",
          amazon: doc.data().amazon || 0,
          rakuten: doc.data().rakuten || 0,
          qoo10: doc.data().qoo10 || 0,
          amazonAd: doc.data().amazonAd || 0,
          rakutenAd: doc.data().rakutenAd || 0,
          qoo10Ad: doc.data().qoo10Ad || 0,
          xAd: doc.data().xAd || 0,
          tiktokAd: doc.data().tiktokAd || 0,
          status: doc.data().status,
          createdAt: doc.data().createdAt,
        }));
        setSalesData(data);
        setLoading(false);
      },
      (err) => {
        console.error("Firestore error:", err);
        setError("データの取得に失敗しました");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isRealDataUser, isAuthLoading]);

  // ドロップダウン外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProductDropdownOpen(false);
      }
      if (skuDropdownRef.current && !skuDropdownRef.current.contains(event.target as Node)) {
        setIsSkuDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 選択中の商品の売上データをAPIから取得してFirestoreに同期
  const syncProductSalesData = async () => {
    if (!isRealDataUser || !selectedProduct) return;

    const product = registeredProducts.find(p => p.id === selectedProduct);
    if (!product) return;

    setSyncLoading(true);
    try {
      let totalSynced = 0;
      const results: string[] = [];

      // Qoo10のデータを取得してFirestoreに保存
      if (product.qoo10Code) {
        const qoo10Response = await fetch(
          `${BACKEND_URL}/qoo10/product-sales/${encodeURIComponent(product.qoo10Code)}?startDate=${startDate}&endDate=${endDate}`
        );
        const qoo10Data = await qoo10Response.json();
        if (qoo10Data.success && qoo10Data.dailySales) {
          // Firestoreに保存するAPIを呼び出す
          const syncResponse = await fetch(`${BACKEND_URL}/sync/save-product-sales`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productCode: product.qoo10Code,
              productName: product.productName,
              mall: 'qoo10',
              dailySales: qoo10Data.dailySales,
            }),
          });
          const syncResult = await syncResponse.json();
          if (syncResult.success) {
            totalSynced += syncResult.synced || 0;
            results.push(`Qoo10: ${syncResult.synced}件`);
          }
        }
      }

      // 楽天のデータを取得してFirestoreに保存
      if (product.rakutenCode) {
        const rakutenResponse = await fetch(
          `${BACKEND_URL}/rakuten/product-sales/${encodeURIComponent(product.rakutenCode)}?startDate=${startDate}&endDate=${endDate}`
        );
        const rakutenData = await rakutenResponse.json();
        if (rakutenData.success && rakutenData.dailySales) {
          // Firestoreに保存するAPIを呼び出す
          const syncResponse = await fetch(`${BACKEND_URL}/sync/save-product-sales`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productCode: product.rakutenCode,
              productName: product.productName,
              mall: 'rakuten',
              dailySales: rakutenData.dailySales,
            }),
          });
          const syncResult = await syncResponse.json();
          if (syncResult.success) {
            totalSynced += syncResult.synced || 0;
            results.push(`楽天: ${syncResult.synced}件`);
          }
        }
      }

      if (totalSynced > 0) {
        alert(`売上データを同期しました\n${results.join('\n')}`);
        // データを再取得
        fetchProductSales(product);
      } else {
        alert("同期するデータがありませんでした");
      }
    } catch (err) {
      console.error("売上データ同期エラー:", err);
      alert("売上データの同期に失敗しました");
    } finally {
      setSyncLoading(false);
    }
  };

  // Amazon売上データを同期
  const syncAmazonSales = async () => {
    if (!isRealDataUser) return;

    setAmazonSyncLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/amazon/sync-sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate }),
      });
      const result = await response.json();

      if (result.success) {
        alert(`Amazon売上を同期しました！\n${result.syncedDays}日分、合計 ¥${result.totalSales.toLocaleString()}`);
      } else {
        alert(`同期エラー: ${result.message || result.error}`);
      }
    } catch (err) {
      console.error("Amazon売上同期エラー:", err);
      alert("Amazon売上の同期に失敗しました");
    } finally {
      setAmazonSyncLoading(false);
    }
  };

  // 単一商品または複数商品の売上データを取得（実データユーザーのみ）
  const fetchProductSales = async (product: RegisteredProduct) => {
    await fetchMultipleProductSales([product]);
  };

  // 複数商品の売上データを取得して合算
  const fetchMultipleProductSales = async (products: RegisteredProduct[]) => {
    if (!isRealDataUser) {
      setProductSalesData([]);
      return;
    }

    // 有効な商品をフィルタリング（Amazon、Qoo10、楽天のいずれかがあればOK）
    const validProducts = products.filter(p => p.amazonCode || p.qoo10Code || p.rakutenCode);
    if (validProducts.length === 0) {
      setProductSalesData([]);
      return;
    }

    setProductLoading(true);
    try {
      const allSalesData: { [date: string]: { amazonSales: number; amazonQuantity: number; qoo10Sales: number; qoo10Quantity: number; rakutenSales: number; rakutenQuantity: number } } = {};

      // すべての商品の売上を取得して合算
      for (const product of validProducts) {
        // Amazonのデータを取得（Firestoreのproduct_salesから直接取得のみ - APIは呼ばない）
        // データがない場合は、管理画面から「Amazon同期」を実行してもらう
        if (product.amazonCode) {
          try {
            // Firestoreのproduct_salesから直接取得
            const amazonSalesQuery = query(
              collection(db, "product_sales"),
              where("productCode", "==", product.amazonCode),
              where("mall", "==", "amazon"),
              where("date", ">=", startDate),
              where("date", "<=", endDate)
            );
            const amazonSnapshot = await getDocs(amazonSalesQuery);

            if (!amazonSnapshot.empty) {
              // Firestoreにデータがある場合
              amazonSnapshot.docs.forEach((doc) => {
                const data = doc.data();
                if (!allSalesData[data.date]) {
                  allSalesData[data.date] = { amazonSales: 0, amazonQuantity: 0, qoo10Sales: 0, qoo10Quantity: 0, rakutenSales: 0, rakutenQuantity: 0 };
                }
                allSalesData[data.date].amazonSales += data.sales || 0;
                allSalesData[data.date].amazonQuantity += data.quantity || 0;
              });
            }
            // Firestoreにデータがない場合はAPIを呼ばない（クォータ節約）
            // バックエンドの「Amazon同期」機能で一括取得してもらう
          } catch (err) {
            console.error("Amazon売上取得エラー:", err);
          }
        }

        // Qoo10のデータを取得
        if (product.qoo10Code) {
          try {
            const cacheResponse = await fetch(
              `${BACKEND_URL}/product-sales/${encodeURIComponent(product.qoo10Code)}?startDate=${startDate}&endDate=${endDate}`
            );
            const cacheData = await cacheResponse.json();
            if (cacheData.success && cacheData.dailySales && cacheData.dailySales.length > 0) {
              for (const item of cacheData.dailySales) {
                if (!allSalesData[item.date]) {
                  allSalesData[item.date] = { amazonSales: 0, amazonQuantity: 0, qoo10Sales: 0, qoo10Quantity: 0, rakutenSales: 0, rakutenQuantity: 0 };
                }
                allSalesData[item.date].qoo10Sales += item.qoo10Sales || 0;
                allSalesData[item.date].qoo10Quantity += item.qoo10Quantity || 0;
              }
            } else {
              // キャッシュがなければAPIから直接取得
              const qoo10Response = await fetch(
                `${BACKEND_URL}/qoo10/product-sales/${encodeURIComponent(product.qoo10Code)}?startDate=${startDate}&endDate=${endDate}`
              );
              const qoo10Data = await qoo10Response.json();
              if (qoo10Data.success && qoo10Data.dailySales) {
                for (const item of qoo10Data.dailySales) {
                  if (!allSalesData[item.date]) {
                    allSalesData[item.date] = { amazonSales: 0, amazonQuantity: 0, qoo10Sales: 0, qoo10Quantity: 0, rakutenSales: 0, rakutenQuantity: 0 };
                  }
                  allSalesData[item.date].qoo10Sales += item.sales;
                  allSalesData[item.date].qoo10Quantity += item.quantity;
                }
              }
            }
          } catch (err) {
            console.error("Qoo10売上取得エラー:", err);
          }
        }

        // 楽天のデータを取得
        if (product.rakutenCode) {
          try {
            const cacheResponse = await fetch(
              `${BACKEND_URL}/product-sales/${encodeURIComponent(product.rakutenCode)}?startDate=${startDate}&endDate=${endDate}`
            );
            const cacheData = await cacheResponse.json();
            if (cacheData.success && cacheData.dailySales && cacheData.dailySales.length > 0) {
              for (const item of cacheData.dailySales) {
                if (!allSalesData[item.date]) {
                  allSalesData[item.date] = { amazonSales: 0, amazonQuantity: 0, qoo10Sales: 0, qoo10Quantity: 0, rakutenSales: 0, rakutenQuantity: 0 };
                }
                allSalesData[item.date].rakutenSales += item.rakutenSales || 0;
                allSalesData[item.date].rakutenQuantity += item.rakutenQuantity || 0;
              }
            } else {
              // キャッシュがなければAPIから直接取得
              const rakutenResponse = await fetch(
                `${BACKEND_URL}/rakuten/product-sales/${encodeURIComponent(product.rakutenCode)}?startDate=${startDate}&endDate=${endDate}`
              );
              const rakutenData = await rakutenResponse.json();
              if (rakutenData.success && rakutenData.dailySales) {
                for (const item of rakutenData.dailySales) {
                  if (!allSalesData[item.date]) {
                    allSalesData[item.date] = { amazonSales: 0, amazonQuantity: 0, qoo10Sales: 0, qoo10Quantity: 0, rakutenSales: 0, rakutenQuantity: 0 };
                  }
                  allSalesData[item.date].rakutenSales += item.sales;
                  allSalesData[item.date].rakutenQuantity += item.quantity;
                }
              }
            }
          } catch (err) {
            console.error("楽天売上取得エラー:", err);
          }
        }
      }

      // 配列に変換してソート
      const salesArray = Object.entries(allSalesData)
        .map(([date, data]) => ({
          date,
          amazonSales: data.amazonSales,
          amazonQuantity: data.amazonQuantity,
          qoo10Sales: data.qoo10Sales,
          qoo10Quantity: data.qoo10Quantity,
          rakutenSales: data.rakutenSales,
          rakutenQuantity: data.rakutenQuantity,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      setProductSalesData(salesArray);
    } catch (err) {
      console.error("商品別売上取得エラー:", err);
      setProductSalesData([]);
    } finally {
      setProductLoading(false);
    }
  };

  // ユニークな商品名リストを取得
  const uniqueProductNames = useMemo(() => {
    const names = new Set<string>();
    registeredProducts.forEach(p => names.add(p.productName));
    return Array.from(names);
  }, [registeredProducts]);

  // 現在表示対象のSKU商品リスト（商品選択時はその商品名のみ、未選択時は全商品）
  const availableSkuProducts = useMemo(() => {
    if (selectedProduct) {
      return registeredProducts.filter(p => p.productName === selectedProduct);
    }
    return registeredProducts;
  }, [registeredProducts, selectedProduct]);

  // 選択されたSKUに該当する商品リスト
  const selectedSkuProducts = useMemo(() => {
    if (selectedSkus.size === 0) {
      // 何も選択されていなければ全SKUを対象
      return availableSkuProducts;
    }
    // 選択されているSKUの商品を返す
    return availableSkuProducts.filter(p => selectedSkus.has(p.skuName || p.id));
  }, [availableSkuProducts, selectedSkus]);

  // 全選択状態かどうか
  const isAllSkusSelected = useMemo(() => {
    if (availableSkuProducts.length === 0) return false;
    return availableSkuProducts.every(p => selectedSkus.has(p.skuName || p.id));
  }, [availableSkuProducts, selectedSkus]);

  // 商品選択時の処理（商品名で選択）
  const handleProductSelect = (productName: string) => {
    setSelectedProduct(productName);
    setSelectedSkus(new Set()); // SKU選択をリセット
    setIsProductDropdownOpen(false);

    if (productName) {
      // 選択された商品名のすべてのSKUを取得
      const products = registeredProducts.filter(p => p.productName === productName);
      if (products.length > 0) {
        fetchMultipleProductSales(products);
      }
    } else {
      // ダミー商品選択時はクリア
      setProductSalesData([]);
    }
  };

  // SKUチェックボックス変更時の処理
  const handleSkuToggle = (skuIdentifier: string) => {
    const newSelectedSkus = new Set(selectedSkus);
    if (newSelectedSkus.has(skuIdentifier)) {
      newSelectedSkus.delete(skuIdentifier);
    } else {
      newSelectedSkus.add(skuIdentifier);
    }
    setSelectedSkus(newSelectedSkus);
  };

  // 全選択チェックボックス変更時の処理
  const handleSelectAllSkus = () => {
    if (isAllSkusSelected) {
      // 全選択解除
      setSelectedSkus(new Set());
    } else {
      // 全選択
      const allSkuIds = new Set(availableSkuProducts.map(p => p.skuName || p.id));
      setSelectedSkus(allSkuIds);
    }
  };

  // 日付変更時・SKU選択変更時に商品別売上を再取得（実データユーザーのみ）
  useEffect(() => {
    if (!isRealDataUser) return;
    if (registeredProducts.length === 0) return;

    // 対象商品を決定（Amazon、Qoo10、楽天のいずれかがあればOK）
    const targetProducts = selectedSkuProducts.filter(p => p.amazonCode || p.qoo10Code || p.rakutenCode);
    if (targetProducts.length > 0) {
      fetchMultipleProductSales(targetProducts);
    } else if (!selectedProduct) {
      // ダミー商品選択時
      setProductSalesData([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, selectedProduct, selectedSkus, registeredProducts, isRealDataUser]);

  // 選択中の商品名を取得
  const selectedProductDisplayName = useMemo(() => {
    if (!selectedProduct && selectedSkus.size === 0) return "ダミー商品";
    if (!selectedProduct && selectedSkus.size > 0) {
      // ダミー商品時にSKU選択している場合
      return `選択SKU (${selectedSkus.size}件)`;
    }
    if (selectedSkus.size === 0 || isAllSkusSelected) {
      return `${selectedProduct}（全SKU合計）`;
    }
    if (selectedSkus.size === 1) {
      const skuName = Array.from(selectedSkus)[0];
      return `${selectedProduct} - ${skuName}`;
    }
    return `${selectedProduct}（${selectedSkus.size}件のSKU）`;
  }, [selectedProduct, selectedSkus, isAllSkusSelected]);

  // 期間フィルタ済みデータ
  const filteredData = useMemo(() => {
    return salesData
      .filter((item) => {
        if (!item.date) return false;
        return item.date >= startDate && item.date <= endDate;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [salesData, startDate, endDate]);

  // グラフ用データ（広告費合計を追加 + フラグ日付も含める）
  const chartData = useMemo(() => {
    // 既存データの日付セット
    const existingDates = new Set(filteredData.map(d => d.date));

    // フラグの日付で、既存データにない日付を追加
    const flagDates = eventFlags
      .filter(flag => flag.date >= startDate && flag.date <= endDate && !existingDates.has(flag.date))
      .map(flag => ({
        id: `flag-${flag.id}`,
        date: flag.date,
        amazon: 0,
        rakuten: 0,
        qoo10: 0,
        amazonAd: 0,
        rakutenAd: 0,
        qoo10Ad: 0,
        xAd: 0,
        tiktokAd: 0,
      }));

    // 既存データとフラグ日付を結合
    const allData = [...filteredData, ...flagDates].sort((a, b) => a.date.localeCompare(b.date));

    return allData.map((day) => {
      let totalAd = 0;
      if (showAdCost.amazon) totalAd += day.amazonAd;
      if (showAdCost.rakuten) totalAd += day.rakutenAd;
      if (showAdCost.qoo10) totalAd += day.qoo10Ad;
      return {
        ...day,
        // 選択されていないモールの売上は0にする（積み上げ順序を固定するため）
        amazon: selectedMalls.amazon ? day.amazon : 0,
        rakuten: selectedMalls.rakuten ? day.rakuten : 0,
        qoo10: selectedMalls.qoo10 ? day.qoo10 : 0,
        totalAd,
      };
    });
  }, [filteredData, showAdCost, eventFlags, startDate, endDate, selectedMalls]);

  // 合計売上を計算（商品選択時はproductSalesDataを使用、チェックボックスで媒体選択）
  const totalSales = useMemo(() => {
    if (selectedProduct && productSalesData.length > 0) {
      // 商品選択時：productSalesDataから合計（チェックボックスで媒体選択）
      return productSalesData.reduce((sum, day) => {
        let dayTotal = 0;
        if (selectedMalls.amazon) dayTotal += day.amazonSales;
        if (selectedMalls.rakuten) dayTotal += day.rakutenSales;
        if (selectedMalls.qoo10) dayTotal += day.qoo10Sales;
        return sum + dayTotal;
      }, 0);
    }
    // ダミー商品時：filteredDataから合計
    return filteredData.reduce((sum, day) => {
      let dayTotal = 0;
      if (selectedMalls.amazon) dayTotal += day.amazon;
      if (selectedMalls.rakuten) dayTotal += day.rakuten;
      if (selectedMalls.qoo10) dayTotal += day.qoo10;
      return sum + dayTotal;
    }, 0);
  }, [filteredData, selectedMalls, selectedProduct, productSalesData]);

  // 合計広告費を計算（商品選択時は0）
  const totalAdCost = useMemo(() => {
    if (selectedProduct) {
      // 商品選択時：広告費データなし
      return 0;
    }
    return filteredData.reduce((sum, day) => {
      let dayTotal = 0;
      if (showAdCost.amazon) dayTotal += day.amazonAd;
      if (showAdCost.rakuten) dayTotal += day.rakutenAd;
      if (showAdCost.qoo10) dayTotal += day.qoo10Ad;
      return sum + dayTotal;
    }, 0);
  }, [filteredData, showAdCost, selectedProduct]);

  // 外部広告費合計を計算（商品選択時は0）
  const totalExternalAdCost = useMemo(() => {
    if (selectedProduct) {
      // 商品選択時：外部広告費データなし
      return 0;
    }
    return filteredData.reduce((sum, day) => {
      let dayTotal = 0;
      if (showExternalAd.x) dayTotal += day.xAd;
      if (showExternalAd.tiktok) dayTotal += day.tiktokAd;
      return sum + dayTotal;
    }, 0);
  }, [filteredData, showExternalAd, selectedProduct]);

  // 広告費が1つでも選択されているか
  const isAnyAdSelected = showAdCost.amazon || showAdCost.rakuten || showAdCost.qoo10;

  // チェックボックスの変更ハンドラ
  const handleMallChange = (mall: keyof typeof selectedMalls) => {
    setSelectedMalls((prev) => ({
      ...prev,
      [mall]: !prev[mall],
    }));
  };

  // 広告費チェックボックスの変更ハンドラ
  const handleAdCostChange = (mall: keyof typeof showAdCost) => {
    setShowAdCost((prev) => ({
      ...prev,
      [mall]: !prev[mall],
    }));
  };

  // 外部広告費チェックボックスの変更ハンドラ
  const handleExternalAdChange = (platform: keyof typeof showExternalAd) => {
    setShowExternalAd((prev) => ({
      ...prev,
      [platform]: !prev[platform],
    }));
  };

  // カスタムTooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      // 売上と広告費を分けて表示
      const salesItems = payload.filter(
        (p: any) => !p.dataKey.includes("Ad") && p.dataKey !== "totalAd"
      );
      const adItem = payload.find((p: any) => p.dataKey === "totalAd");
      const xAdItem = payload.find((p: any) => p.dataKey === "xAd");
      const tiktokAdItem = payload.find((p: any) => p.dataKey === "tiktokAd");

      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold text-gray-700 mb-2">{label}</p>
          {salesItems.length > 0 && (
            <div className="mb-2">
              <p className="text-xs text-gray-500 mb-1">売上</p>
              {salesItems.map((entry: any, index: number) => (
                <p
                  key={index}
                  style={{ color: entry.color }}
                  className="text-sm"
                >
                  {entry.name}: {formatCurrency(entry.value)}
                </p>
              ))}
            </div>
          )}
          {adItem && (
            <div className="mb-2">
              <p className="text-xs text-gray-500 mb-1">モール内広告費</p>
              <p style={{ color: adItem.color }} className="text-sm">
                合計: {formatCurrency(adItem.value)}
              </p>
            </div>
          )}
          {(xAdItem || tiktokAdItem) && (
            <div>
              <p className="text-xs text-gray-500 mb-1">外部広告費</p>
              {xAdItem && (
                <p style={{ color: xAdItem.color }} className="text-sm">
                  X: {formatCurrency(xAdItem.value)}
                </p>
              )}
              {tiktokAdItem && (
                <p style={{ color: tiktokAdItem.color }} className="text-sm">
                  TikTok: {formatCurrency(tiktokAdItem.value)}
                </p>
              )}
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-600">データを読み込み中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-500 mb-2">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            再読み込み
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ページタイトル */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-800">ダッシュボード</h1>
          {!isRealDataUser && (
            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">
              デモモード
            </span>
          )}
        </div>
        <div className="text-sm text-gray-500">
          {isRealDataUser ? `Firestoreデータ: ${salesData.length}件` : "デモデータ表示中"}
        </div>
      </div>

      {/* フィルターエリア */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="flex flex-col gap-4">
          {/* 期間選択・商品選択 */}
          <div className="flex flex-col sm:flex-row gap-4 flex-wrap">
            <div>
              <label
                htmlFor="startDate"
                className="block text-sm font-medium text-gray-600 mb-1"
              >
                開始日
              </label>
              <input
                type="date"
                id="startDate"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="endDate"
                className="block text-sm font-medium text-gray-600 mb-1"
              >
                終了日
              </label>
              <input
                type="date"
                id="endDate"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
              />
            </div>
            <div ref={dropdownRef} className="relative">
              <label className="block text-sm font-medium text-gray-600 mb-1">
                商品
              </label>
              <button
                type="button"
                onClick={() => setIsProductDropdownOpen(!isProductDropdownOpen)}
                className="flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none min-w-[180px] text-sm"
              >
                <span className="truncate">{selectedProduct || "ダミー商品"}</span>
                <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${isProductDropdownOpen ? "rotate-180" : ""}`} />
              </button>
              {isProductDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-60 overflow-auto">
                  <button
                    type="button"
                    onClick={() => handleProductSelect("")}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${selectedProduct === "" ? "bg-blue-100 font-medium" : ""}`}
                  >
                    ダミー商品
                  </button>
                  {uniqueProductNames.map((productName) => {
                    const hasMultipleSku = registeredProducts.filter(p => p.productName === productName && p.skuName).length > 1;
                    return (
                      <button
                        key={productName}
                        type="button"
                        onClick={() => handleProductSelect(productName)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${selectedProduct === productName ? "bg-blue-100 font-medium" : ""}`}
                      >
                        <span>{productName}</span>
                        {hasMultipleSku && (
                          <span className="ml-2 text-xs text-gray-400">(複数SKU)</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {/* SKUチェックボックス式ドロップダウン（常に表示） */}
            <div ref={skuDropdownRef} className="relative">
              <label className="block text-sm font-medium text-gray-600 mb-1">
                SKU
              </label>
              <button
                type="button"
                onClick={() => setIsSkuDropdownOpen(!isSkuDropdownOpen)}
                className="flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none min-w-[160px] text-sm"
              >
                <span className="truncate">
                  {selectedSkus.size === 0 || isAllSkusSelected
                    ? "すべて"
                    : selectedSkus.size === 1
                    ? Array.from(selectedSkus)[0]
                    : `${selectedSkus.size}件選択中`}
                </span>
                <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${isSkuDropdownOpen ? "rotate-180" : ""}`} />
              </button>
              {isSkuDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-60 overflow-auto min-w-[200px]">
                  {/* 全て選択チェックボックス */}
                  <label className="flex items-center gap-2 px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-200">
                    <input
                      type="checkbox"
                      checked={isAllSkusSelected}
                      onChange={handleSelectAllSkus}
                      className="w-4 h-4 rounded accent-purple-600"
                    />
                    <span className="text-sm font-medium text-purple-600">全て選択</span>
                  </label>
                  {/* 個別SKUチェックボックス */}
                  {availableSkuProducts.map((product) => {
                    const skuId = product.skuName || product.id;
                    const isChecked = selectedSkus.has(skuId);
                    return (
                      <label
                        key={product.id}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-blue-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleSkuToggle(skuId)}
                          className="w-4 h-4 rounded accent-blue-600"
                        />
                        <span className="text-sm">{product.skuName || `SKU ${product.id.slice(-4)}`}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-6 flex-wrap">
            {/* 売上（媒体選択） */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                売上（棒グラフ）
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedMalls.amazon}
                    onChange={() => handleMallChange("amazon")}
                    className="w-4 h-4 rounded accent-amazon"
                  />
                  <span
                    className="font-medium text-sm"
                    style={{ color: MALL_COLORS.amazon }}
                  >
                    Amazon
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedMalls.rakuten}
                    onChange={() => handleMallChange("rakuten")}
                    className="w-4 h-4 rounded accent-rakuten"
                  />
                  <span
                    className="font-medium text-sm"
                    style={{ color: MALL_COLORS.rakuten }}
                  >
                    楽天
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedMalls.qoo10}
                    onChange={() => handleMallChange("qoo10")}
                    className="w-4 h-4 rounded accent-qoo10"
                  />
                  <span
                    className="font-medium text-sm"
                    style={{ color: MALL_COLORS.qoo10 }}
                  >
                    Qoo10
                  </span>
                </label>
              </div>
            </div>

            {/* モール内広告費選択 */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                モール内広告費（緑線）
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showAdCost.amazon}
                    onChange={() => handleAdCostChange("amazon")}
                    className="w-4 h-4 rounded"
                    style={{ accentColor: MALL_COLORS.amazon }}
                  />
                  <span
                    className="font-medium text-sm"
                    style={{ color: MALL_COLORS.amazon }}
                  >
                    Amazon
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showAdCost.rakuten}
                    onChange={() => handleAdCostChange("rakuten")}
                    className="w-4 h-4 rounded"
                    style={{ accentColor: MALL_COLORS.rakuten }}
                  />
                  <span
                    className="font-medium text-sm"
                    style={{ color: MALL_COLORS.rakuten }}
                  >
                    楽天
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showAdCost.qoo10}
                    onChange={() => handleAdCostChange("qoo10")}
                    className="w-4 h-4 rounded"
                    style={{ accentColor: MALL_COLORS.qoo10 }}
                  />
                  <span
                    className="font-medium text-sm"
                    style={{ color: MALL_COLORS.qoo10 }}
                  >
                    Qoo10
                  </span>
                </label>
              </div>
            </div>

            {/* 外部広告費選択 */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                外部広告費（個別線）
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showExternalAd.x}
                    onChange={() => handleExternalAdChange("x")}
                    className="w-4 h-4 rounded"
                    style={{ accentColor: EXTERNAL_AD_COLORS.x }}
                  />
                  <span
                    className="font-medium text-sm"
                    style={{ color: EXTERNAL_AD_COLORS.x }}
                  >
                    X
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showExternalAd.tiktok}
                    onChange={() => handleExternalAdChange("tiktok")}
                    className="w-4 h-4 rounded"
                    style={{ accentColor: EXTERNAL_AD_COLORS.tiktok }}
                  />
                  <span
                    className="font-medium text-sm"
                    style={{ color: EXTERNAL_AD_COLORS.tiktok }}
                  >
                    TikTok
                  </span>
                </label>
              </div>
            </div>

            {/* フラグ表示 */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                イベントフラグ
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showFlags}
                    onChange={() => setShowFlags(!showFlags)}
                    className="w-4 h-4 rounded"
                    style={{ accentColor: "#9333EA" }}
                  />
                  <span className="font-medium text-sm text-purple-600">
                    <Flag className="inline w-4 h-4 mr-1" />
                    フラグ表示
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Amazon売上同期ボタン */}
      {isRealDataUser && (
        <div className="flex gap-2 items-center flex-wrap">
          <button
            onClick={syncAmazonSales}
            disabled={amazonSyncLoading}
            className="flex items-center gap-2 px-4 py-2 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
            style={{ backgroundColor: amazonSyncLoading ? '#999' : '#FF9900' }}
          >
            {amazonSyncLoading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Amazon売上を同期
          </button>
          <span className="text-xs text-gray-500">
            {startDate} 〜 {endDate} の売上をAmazonから取得
          </span>
        </div>
      )}

      {/* 売上データ同期ボタン（商品選択時のみ表示） */}
      {isRealDataUser && selectedProduct && (
        <div className="flex gap-2 items-center">
          <button
            onClick={syncProductSalesData}
            disabled={syncLoading}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
          >
            {syncLoading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            売上データを更新
          </button>
          <span className="text-xs text-gray-500">
            ※ {startDate} 〜 {endDate} の売上をAPIから取得してDBに保存します
          </span>
        </div>
      )}

      {/* KPIカード */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg shadow-sm p-3 text-white">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-white/20 rounded-lg">
              <TrendingUp size={18} />
            </div>
            <div>
              <p className="text-blue-100 text-xs">合計売上</p>
              <p className="text-lg font-bold">{formatCurrency(totalSales)}</p>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-lg shadow-sm p-3 text-white">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-white/20 rounded-lg">
              <Megaphone size={18} />
            </div>
            <div>
              <p className="text-emerald-100 text-xs">モール内広告費</p>
              <p className="text-lg font-bold">{formatCurrency(totalAdCost)}</p>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-r from-pink-500 to-pink-600 rounded-lg shadow-sm p-3 text-white">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-white/20 rounded-lg">
              <Share2 size={18} />
            </div>
            <div>
              <p className="text-pink-100 text-xs">外部広告費</p>
              <p className="text-lg font-bold">{formatCurrency(totalExternalAdCost)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* グラフエリア */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <h2 className="text-base font-semibold text-gray-700 mb-2">
          {selectedProduct ? `${selectedProductDisplayName} - 日次売上推移` : "日次売上・広告費推移"}
          {productLoading && (
            <RefreshCw className="inline-block ml-2 w-4 h-4 animate-spin text-blue-500" />
          )}
        </h2>

        {/* 商品選択時は商品別グラフを表示 */}
        {selectedProduct ? (
          productSalesData.length === 0 ? (
            <div className="h-72 flex items-center justify-center text-gray-500">
              <div className="text-center">
                {productLoading ? (
                  <p>データを取得中...</p>
                ) : (
                  <>
                    <p>この商品の売上データがありません</p>
                    <p className="text-sm mt-2">Amazonコード、Qoo10コード、または楽天コードが設定されていないか、指定期間に注文がありません</p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="h-72 relative">
              {/* フラグマーカー（グラフの上に重ねて表示） */}
              {showFlags && eventFlags
                .filter(flag => flag.date >= startDate && flag.date <= endDate)
                .map((flag) => {
                  const dataIndex = productSalesData.findIndex(d => d.date === flag.date);
                  if (dataIndex === -1) return null;
                  const graphLeftMargin = 55;
                  const graphRightMargin = 55;
                  const position = ((dataIndex + 0.5) / productSalesData.length) * 100;
                  return (
                    <div
                      key={flag.id}
                      className="absolute z-10 cursor-pointer"
                      style={{
                        top: '20px',
                        left: `calc(${graphLeftMargin}px + (100% - ${graphLeftMargin + graphRightMargin}px) * ${position / 100})`,
                        transform: 'translateX(-50%)',
                      }}
                      onClick={() => setSelectedFlag(flag)}
                    >
                      <div className="flex flex-col items-center">
                        <span className="text-purple-600 text-xs font-bold whitespace-nowrap bg-white/90 px-1 rounded shadow-sm border border-purple-200">
                          🚩 {flag.name}
                        </span>
                        <div className="w-0.5 h-44 opacity-80" style={{ background: 'repeating-linear-gradient(to bottom, #9333EA 0, #9333EA 4px, transparent 4px, transparent 8px)' }} />
                      </div>
                    </div>
                  );
                })}
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={productSalesData}
                  margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#6b7280", fontSize: 10 }}
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      return `${date.getMonth() + 1}/${date.getDate()}`;
                    }}
                    interval={0}
                    angle={-45}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis
                    tick={{ fill: "#6b7280", fontSize: 12 }}
                    tickFormatter={(value) =>
                      `¥${(value / 10000).toFixed(0)}万`
                    }
                    domain={[0, 'dataMax']}
                    type="number"
                    scale="linear"
                    padding={{ top: 20 }}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const amazonVal = payload.find((p: any) => p.dataKey === 'amazonSales')?.value as number || 0;
                        const rakutenVal = payload.find((p: any) => p.dataKey === 'rakutenSales')?.value as number || 0;
                        const qoo10Val = payload.find((p: any) => p.dataKey === 'qoo10Sales')?.value as number || 0;
                        return (
                          <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                            <p className="font-semibold text-gray-700 mb-2">{label}</p>
                            {selectedMalls.amazon && amazonVal > 0 && (
                              <p style={{ color: MALL_COLORS.amazon }} className="text-sm">
                                Amazon: {formatCurrency(amazonVal)}
                              </p>
                            )}
                            {selectedMalls.rakuten && rakutenVal > 0 && (
                              <p style={{ color: MALL_COLORS.rakuten }} className="text-sm">
                                楽天: {formatCurrency(rakutenVal)}
                              </p>
                            )}
                            {selectedMalls.qoo10 && qoo10Val > 0 && (
                              <p style={{ color: MALL_COLORS.qoo10 }} className="text-sm">
                                Qoo10: {formatCurrency(qoo10Val)}
                              </p>
                            )}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  {/* Amazon売上（積み上げ） */}
                  {selectedMalls.amazon && (
                    <Bar
                      dataKey="amazonSales"
                      stackId="productSales"
                      fill={MALL_COLORS.amazon}
                      barSize={30}
                    />
                  )}
                  {/* 楽天売上（積み上げ） */}
                  {selectedMalls.rakuten && (
                    <Bar
                      dataKey="rakutenSales"
                      stackId="productSales"
                      fill={MALL_COLORS.rakuten}
                      barSize={30}
                    />
                  )}
                  {/* Qoo10売上（積み上げ） */}
                  {selectedMalls.qoo10 && (
                    <Bar
                      dataKey="qoo10Sales"
                      stackId="productSales"
                      fill={MALL_COLORS.qoo10}
                      barSize={30}
                      radius={[4, 4, 0, 0]}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>

              {/* カスタム凡例 */}
              <div className="flex flex-wrap justify-center gap-4 mt-2 text-sm">
                {selectedMalls.amazon && (
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: MALL_COLORS.amazon }} />
                    <span>Amazon</span>
                  </div>
                )}
                {selectedMalls.rakuten && (
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: MALL_COLORS.rakuten }} />
                    <span>楽天</span>
                  </div>
                )}
                {selectedMalls.qoo10 && (
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: MALL_COLORS.qoo10 }} />
                    <span>Qoo10</span>
                  </div>
                )}
              </div>
            </div>
          )
        ) : chartData.length === 0 ? (
          <div className="h-72 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <p>データがありません</p>
              <p className="text-sm mt-2">バックエンドの /scrape エンドポイントを呼び出してデータを追加してください</p>
            </div>
          </div>
        ) : (
          <div className="h-72 relative">
            {/* フラグマーカー（グラフの上に重ねて表示） */}
            {showFlags && eventFlags
              .filter(flag => flag.date >= startDate && flag.date <= endDate)
              .map((flag) => {
                const dataIndex = chartData.findIndex(d => d.date === flag.date);
                if (dataIndex === -1) return null;
                // ComposedChartのmargin: { top: 20, right: 30, left: 20, bottom: 5 }
                // 左Y軸ラベル幅 + margin.left ≈ 55px, 右Y軸ラベル幅 + margin.right ≈ 55px
                const graphLeftMargin = 55;
                const graphRightMargin = 55;
                // 棒グラフの中心位置を計算
                const position = ((dataIndex + 0.5) / chartData.length) * 100;
                return (
                  <div
                    key={flag.id}
                    className="absolute z-10 cursor-pointer"
                    style={{
                      top: '20px', // グラフのtop marginに合わせる
                      left: `calc(${graphLeftMargin}px + (100% - ${graphLeftMargin + graphRightMargin}px) * ${position / 100})`,
                      transform: 'translateX(-50%)',
                    }}
                    onClick={() => setSelectedFlag(flag)}
                  >
                    <div className="flex flex-col items-center">
                      <span className="text-purple-600 text-xs font-bold whitespace-nowrap bg-white/90 px-1 rounded shadow-sm border border-purple-200">
                        🚩 {flag.name}
                      </span>
                      <div className="w-0.5 h-44 opacity-80" style={{ background: 'repeating-linear-gradient(to bottom, #9333EA 0, #9333EA 4px, transparent 4px, transparent 8px)' }} />
                    </div>
                  </div>
                );
              })}
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#6b7280", fontSize: 10 }}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return `${date.getMonth() + 1}/${date.getDate()}`;
                  }}
                  interval={0}
                  angle={-45}
                  textAnchor="end"
                  height={50}
                />
                <YAxis
                  yAxisId="sales"
                  tick={{ fill: "#6b7280", fontSize: 12 }}
                  tickFormatter={(value) =>
                    `¥${(value / 10000).toFixed(0)}万`
                  }
                />
                <YAxis
                  yAxisId="ad"
                  orientation="right"
                  tick={{ fill: "#9ca3af", fontSize: 12 }}
                  tickFormatter={(value) =>
                    `¥${(value / 10000).toFixed(0)}万`
                  }
                />
                <Tooltip content={<CustomTooltip />} />

                {/* 売上棒グラフ（積み上げ式）- 常に下からAmazon→楽天→Qoo10の順 */}
                <Bar
                  yAxisId="sales"
                  dataKey="amazon"
                  stackId="sales"
                  fill={MALL_COLORS.amazon}
                  barSize={30}
                  hide={!selectedMalls.amazon}
                />
                <Bar
                  yAxisId="sales"
                  dataKey="rakuten"
                  stackId="sales"
                  fill={MALL_COLORS.rakuten}
                  barSize={30}
                  hide={!selectedMalls.rakuten}
                />
                <Bar
                  yAxisId="sales"
                  dataKey="qoo10"
                  stackId="sales"
                  fill={MALL_COLORS.qoo10}
                  barSize={30}
                  radius={[4, 4, 0, 0]}
                  hide={!selectedMalls.qoo10}
                />

                {/* モール内広告費合計の折れ線グラフ（1本） */}
                {isAnyAdSelected && (
                  <Line
                    yAxisId="ad"
                    type="monotone"
                    dataKey="totalAd"
                    stroke={AD_TOTAL_COLOR}
                    strokeWidth={3}
                    dot={{ fill: AD_TOTAL_COLOR, strokeWidth: 0, r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                )}

                {/* X広告費の折れ線グラフ */}
                {showExternalAd.x && (
                  <Line
                    yAxisId="ad"
                    type="monotone"
                    dataKey="xAd"
                    stroke={EXTERNAL_AD_COLORS.x}
                    strokeWidth={2}
                    dot={{ fill: EXTERNAL_AD_COLORS.x, strokeWidth: 0, r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                )}

                {/* TikTok広告費の折れ線グラフ */}
                {showExternalAd.tiktok && (
                  <Line
                    yAxisId="ad"
                    type="monotone"
                    dataKey="tiktokAd"
                    stroke={EXTERNAL_AD_COLORS.tiktok}
                    strokeWidth={2}
                    dot={{ fill: EXTERNAL_AD_COLORS.tiktok, strokeWidth: 0, r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                )}

              </ComposedChart>
            </ResponsiveContainer>

            {/* カスタム凡例 */}
            <div className="flex flex-wrap justify-center gap-4 mt-2 text-sm">
              {selectedMalls.amazon && (
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: MALL_COLORS.amazon }} />
                  <span>Amazon</span>
                </div>
              )}
              {selectedMalls.rakuten && (
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: MALL_COLORS.rakuten }} />
                  <span>楽天</span>
                </div>
              )}
              {selectedMalls.qoo10 && (
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: MALL_COLORS.qoo10 }} />
                  <span>Qoo10</span>
                </div>
              )}
              {isAnyAdSelected && (
                <div className="flex items-center gap-1">
                  <div className="w-4 h-0.5" style={{ backgroundColor: AD_TOTAL_COLOR }} />
                  <span>モール内広告費</span>
                </div>
              )}
              {showExternalAd.x && (
                <div className="flex items-center gap-1">
                  <div className="w-4 h-0.5" style={{ backgroundColor: EXTERNAL_AD_COLORS.x }} />
                  <span>X広告費</span>
                </div>
              )}
              {showExternalAd.tiktok && (
                <div className="flex items-center gap-1">
                  <div className="w-4 h-0.5" style={{ backgroundColor: EXTERNAL_AD_COLORS.tiktok }} />
                  <span>TikTok広告費</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* フラグリスト（グラフ下に表示） */}
        {showFlags && eventFlags.filter(flag => flag.date >= startDate && flag.date <= endDate).length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-600 mb-2 flex items-center gap-1">
              <Flag className="w-4 h-4 text-purple-600" />
              期間内のイベント
            </h3>
            <div className="flex flex-wrap gap-2">
              {eventFlags
                .filter(flag => flag.date >= startDate && flag.date <= endDate)
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((flag) => (
                  <button
                    key={flag.id}
                    onClick={() => setSelectedFlag(flag)}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm hover:bg-purple-200 transition-colors"
                  >
                    <Flag className="w-3 h-3" />
                    <span className="font-medium">{flag.name}</span>
                    <span className="text-purple-500 text-xs">
                      ({new Date(flag.date).getMonth() + 1}/{new Date(flag.date).getDate()})
                    </span>
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* フラグ詳細モーダル */}
      {selectedFlag && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Flag className="w-6 h-6 text-purple-600" />
                <h3 className="text-lg font-bold text-gray-800">{selectedFlag.name}</h3>
              </div>
              <button
                onClick={() => setSelectedFlag(null)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">日付</p>
                <p className="font-medium">
                  {new Date(selectedFlag.date).getFullYear()}年
                  {new Date(selectedFlag.date).getMonth() + 1}月
                  {new Date(selectedFlag.date).getDate()}日
                </p>
              </div>
              {selectedFlag.description && (
                <div>
                  <p className="text-sm text-gray-500">詳細</p>
                  <p className="text-gray-700">{selectedFlag.description}</p>
                </div>
              )}
            </div>
            <button
              onClick={() => setSelectedFlag(null)}
              className="mt-6 w-full py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
