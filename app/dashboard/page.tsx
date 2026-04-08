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
import { TrendingUp, Megaphone, Share2, ChevronDown, RefreshCw, Flag, X, Eye, Package } from "lucide-react";
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

// チャネル定義（表示名・色・カテゴリ）
type ChannelCategory = "online" | "store";
interface ChannelDef {
  key: string;
  label: string;
  color: string;
  category: ChannelCategory;
}

const ALL_CHANNELS: ChannelDef[] = [
  // オンライン
  { key: "Amazon", label: "Amazon", color: "#FF9900", category: "online" },
  { key: "楽天", label: "楽天", color: "#BF0000", category: "online" },
  { key: "Qoo10", label: "Qoo10", color: "#3266CC", category: "online" },
  { key: "Yahoo", label: "Yahoo", color: "#FF0033", category: "online" },
  { key: "自社サイト", label: "自社サイト", color: "#10B981", category: "online" },
  // 店舗
  { key: "アインズ&トルペ", label: "アインズ&トルペ", color: "#8B5CF6", category: "store" },
  { key: "LOFT", label: "LOFT", color: "#D97706", category: "store" },
  { key: "ドンキ", label: "ドンキ", color: "#2563EB", category: "store" },
  { key: "PLAZA", label: "PLAZA", color: "#EC4899", category: "store" },
  { key: "東急ハンズ", label: "東急ハンズ", color: "#059669", category: "store" },
  { key: "マツキヨ", label: "マツキヨ", color: "#7C3AED", category: "store" },
  { key: "ツルハドラッグ", label: "ツルハドラッグ", color: "#0891B2", category: "store" },
];

const CHANNEL_MAP = Object.fromEntries(ALL_CHANNELS.map(c => [c.key, c]));
const CHANNEL_COLOR = (key: string) => CHANNEL_MAP[key]?.color || "#6B7280";

// 旧互換
const MALL_COLORS: Record<string, string> = Object.fromEntries(ALL_CHANNELS.map(c => [c.key, c.color]));

// 広告費の色
const AD_TOTAL_COLOR = "#10B981"; // エメラルドグリーン（モール内広告費合計）

// 外部広告費の色
const EXTERNAL_AD_COLORS = {
  x: "#000000",       // X（黒）
  tiktok: "#FF0050",  // TikTok（ピンク）
};

const BACKEND_URL = "https://mall-batch-manager-backend-983678294034.asia-northeast1.run.app";

// 商品別売上データの型（動的チャネル対応）
interface ProductSalesData {
  date: string;
  totalViews: number;
  [key: string]: number | string; // ${channelKey}_sales, ${channelKey}_qty
}

// イベントフラグの型
interface EventFlag {
  id: string;
  name: string;
  date: string;
  endDate?: string;
  description: string;
  scope?: string;
  productId?: string;
  mall?: string;
}

// デモ用データ（空）
const demoFlags: EventFlag[] = [];
const demoProducts: RegisteredProduct[] = [];
const generateDemoData = (): SalesData[] => [];

export default function DashboardPage() {
  const { isRealDataUser, isAuthLoading, allowedProductIds } = useAuth();
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
  const DEFAULT_ON_CHANNELS = new Set(["Amazon", "楽天", "Qoo10"]);
  const [selectedChannels, setSelectedChannels] = useState<Record<string, boolean>>(
    Object.fromEntries(ALL_CHANNELS.map(c => [c.key, DEFAULT_ON_CHANNELS.has(c.key)]))
  );
  const [showViews, setShowViews] = useState(true);
  // 旧互換エイリアス
  const selectedMalls = { amazon: selectedChannels["Amazon"], rakuten: selectedChannels["楽天"], qoo10: selectedChannels["Qoo10"] };
  const [showAdCost, setShowAdCost] = useState({
    amazon: false,
    rakuten: false,
    qoo10: false,
  });
  const [showExternalAd, setShowExternalAd] = useState({
    x: false,
    tiktok: false,
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
          endDate: doc.data().endDate || "",
          description: doc.data().description || "",
          scope: doc.data().scope || "global",
          productId: doc.data().productId || "",
          mall: doc.data().mall || "",
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
        // クライアントユーザーの場合は許可された商品のみ表示
        if (allowedProductIds) {
          setRegisteredProducts(products.filter((p) => allowedProductIds.includes(p.id)));
        } else {
          setRegisteredProducts(products);
        }
      } catch (err) {
        console.error("商品取得エラー:", err);
      }
    };
    fetchProducts();
  }, [isRealDataUser, isAuthLoading, allowedProductIds]);

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

    // 有効な商品をフィルタリング（登録されていればOK - amazonCodeが空でもCSV入稿データがある可能性）
    const validProducts = products.filter(p => p.id);
    if (validProducts.length === 0) {
      setProductSalesData([]);
      return;
    }

    setProductLoading(true);
    try {
      const allSalesData: { [date: string]: Record<string, number> } = {};
      const ensureDate = (date: string) => {
        if (!allSalesData[date]) allSalesData[date] = { totalViews: 0 };
      };
      const addSales = (date: string, channel: string, sales: number, qty: number) => {
        ensureDate(date);
        allSalesData[date][`${channel}_sales`] = (allSalesData[date][`${channel}_sales`] || 0) + sales;
        allSalesData[date][`${channel}_qty`] = (allSalesData[date][`${channel}_qty`] || 0) + qty;
      };

      console.log("fetchMultipleProductSales対象商品:", validProducts.map(p => ({ id: p.id, name: p.productName, amazon: p.amazonCode, qoo10: p.qoo10Code, rakuten: p.rakutenCode })));

      // すべての商品の売上を取得して合算
      for (const product of validProducts) {
        // Amazonのデータを取得
        // productIdベースで取得（amazonCodeが空でもCSV入稿データを表示可能に）
        try {
          console.log(`[Amazon売上取得] productId: ${product.id}, 日付範囲: ${startDate} 〜 ${endDate}`);
          let amazonDataFound = false;

          // 1. まずamazon_daily_salesコレクションからproductIdで取得（CSV入稿データ）
          const amazonDailySalesQuery = query(
            collection(db, "amazon_daily_sales"),
            where("productId", "==", product.id)
          );
          const amazonDailySalesSnapshot = await getDocs(amazonDailySalesQuery);
          console.log(`[Amazon売上取得] amazon_daily_salesクエリ結果: ${amazonDailySalesSnapshot.size}件`);

          if (!amazonDailySalesSnapshot.empty) {
            amazonDailySalesSnapshot.docs.forEach((doc) => {
              const data = doc.data();
              // 日付範囲内をフィルタ
              if (data.date >= startDate && data.date <= endDate) {
                amazonDataFound = true;
                ensureDate(data.date);
                addSales(data.date, "Amazon", data.salesAmount || 0, data.orderedUnits || 0);
              }
            });
            console.log(`[Amazon売上取得] amazon_daily_salesからデータ取得完了`);
          }

          // 2. amazon_daily_salesになければproduct_salesコレクションも確認
          if (!amazonDataFound) {
            const productSalesQuery = query(
              collection(db, "product_sales"),
              where("productId", "==", product.id)
            );
            const productSalesSnapshot = await getDocs(productSalesQuery);
            console.log(`[Amazon売上取得] product_salesクエリ結果: ${productSalesSnapshot.size}件`);

            if (!productSalesSnapshot.empty) {
              productSalesSnapshot.docs.forEach((doc) => {
                const data = doc.data();
                // mall === "amazon" かつ 日付範囲内をフィルタ
                if (data.mall === "amazon" && data.date >= startDate && data.date <= endDate) {
                  ensureDate(data.date);
                  addSales(data.date, "Amazon", data.sales || 0, data.quantity || 0);
                }
              });
            }
          }
        } catch (err) {
          console.error("Amazon売上取得エラー:", err);
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
                ensureDate(item.date);
                addSales(item.date, "Qoo10", item.qoo10Sales || 0, item.qoo10Quantity || 0);
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
                    allSalesData[item.date] = { amazonSales: 0, amazonQuantity: 0, qoo10Sales: 0, qoo10Quantity: 0, rakutenSales: 0, rakutenQuantity: 0, ownSiteSales: 0, ownSiteQuantity: 0, ainsTolpeSales: 0, ainsTolpeQuantity: 0, totalViews: 0 };
                  }
                  addSales(item.date, "Qoo10", item.sales, item.quantity);
                }
              }
            }
          } catch (err) {
            console.error("Qoo10売上取得エラー:", err);
          }
        }

        // 楽天のデータを取得
        // 1. まずrakuten_daily_salesコレクションからproductIdで取得（CSV入稿データ）
        try {
          let rakutenDataFound = false;
          const rakutenDailySalesQuery = query(
            collection(db, "rakuten_daily_sales"),
            where("productId", "==", product.id),
          );
          const rakutenDailySalesSnapshot = await getDocs(rakutenDailySalesQuery);
          if (!rakutenDailySalesSnapshot.empty) {
            rakutenDailySalesSnapshot.docs.forEach((doc) => {
              const data = doc.data();
              if (data.date >= startDate && data.date <= endDate) {
                rakutenDataFound = true;
                addSales(data.date, "楽天", data.salesAmount || 0, data.salesCount || data.orderedUnits || 0);
              }
            });
          }

          // 2. CSV入稿データがなければバックエンドAPIから取得
          if (!rakutenDataFound && product.rakutenCode) {
            const cacheResponse = await fetch(
              `${BACKEND_URL}/product-sales/${encodeURIComponent(product.rakutenCode)}?startDate=${startDate}&endDate=${endDate}`
            );
            const cacheData = await cacheResponse.json();
            if (cacheData.success && cacheData.dailySales && cacheData.dailySales.length > 0) {
              for (const item of cacheData.dailySales) {
                addSales(item.date, "楽天", item.rakutenSales || 0, item.rakutenQuantity || 0);
              }
            } else {
              const rakutenResponse = await fetch(
                `${BACKEND_URL}/rakuten/product-sales/${encodeURIComponent(product.rakutenCode)}?startDate=${startDate}&endDate=${endDate}`
              );
              const rakutenData = await rakutenResponse.json();
              if (rakutenData.success && rakutenData.dailySales) {
                for (const item of rakutenData.dailySales) {
                  addSales(item.date, "楽天", item.sales, item.quantity);
                }
              }
            }
          }
        } catch (err) {
          console.error("楽天売上取得エラー:", err);
        }
      }

      // unified_daily_salesからデータを取得（統合CSV入稿分）
      for (const product of validProducts) {
        try {
          const unifiedQuery = query(
            collection(db, "unified_daily_sales"),
            where("productId", "==", product.id),
          );
          const unifiedSnap = await getDocs(unifiedQuery);
          unifiedSnap.forEach((doc) => {
            const d = doc.data();
            if (d.date < startDate || d.date > endDate) return;
            addSales(d.date, d.channel, d.salesAmount || 0, d.quantity || 0);
          });
        } catch (err) {
          console.error("統合売上取得エラー:", err);
        }
      }

      // daily_viewsから再生数を取得
      for (const product of validProducts) {
        try {
          const viewsQuery = query(
            collection(db, "daily_views"),
            where("productId", "==", product.id),
          );
          const viewsSnap = await getDocs(viewsQuery);
          viewsSnap.forEach((doc) => {
            const d = doc.data();
            if (d.date < startDate || d.date > endDate) return;
            ensureDate(d.date);
            allSalesData[d.date].totalViews = (allSalesData[d.date].totalViews || 0) + (d.views || 0);
          });
        } catch (err) {
          console.error("再生数取得エラー:", err);
        }
      }

      // startDate〜endDateの全日付を生成し、データがない日は0埋め
      const allDates: string[] = [];
      const cur = new Date(startDate);
      const end = new Date(endDate);
      while (cur <= end) {
        allDates.push(cur.toISOString().split("T")[0]);
        cur.setDate(cur.getDate() + 1);
      }
      for (const date of allDates) {
        ensureDate(date);
      }

      // 配列に変換してソート
      const salesArray = Object.entries(allSalesData)
        .map(([date, data]) => ({
          date,
          ...data,
        } as ProductSalesData))
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

    // 対象商品を決定（登録されていればOK - amazonCodeが空でもCSV入稿データがある可能性）
    const targetProducts = selectedSkuProducts.filter(p => p.id);
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

  // フラグを媒体選択でフィルタリング
  const filteredFlags = useMemo(() => {
    return eventFlags.filter((flag) => {
      if (flag.mall && selectedChannels[flag.mall] === false) return false;
      return true;
    });
  }, [eventFlags, selectedChannels]);

  // グラフ用データ（広告費合計を追加 + フラグ日付も含める）
  const chartData = useMemo(() => {
    // 既存データの日付セット
    const existingDates = new Set(filteredData.map(d => d.date));

    // フラグの日付で、既存データにない日付を追加
    const flagDates = filteredFlags
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
  }, [filteredData, showAdCost, filteredFlags, startDate, endDate, selectedMalls]);

  // 合計売上を計算（商品選択時のみ）
  const totalSales = useMemo(() => {
    if (!selectedProduct) return 0;
    return productSalesData.reduce((sum, day) => {
      let dayTotal = 0;
      ALL_CHANNELS.forEach(ch => {
        if (selectedChannels[ch.key]) dayTotal += (day[`${ch.key}_sales`] as number) || 0;
      });
      return sum + dayTotal;
    }, 0);
  }, [selectedChannels, selectedProduct, productSalesData]);

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

  // 合計再生数
  const totalViews = useMemo(() => {
    if (selectedProduct && productSalesData.length > 0) {
      return productSalesData.reduce((sum, day) => sum + (day.totalViews || 0), 0);
    }
    return 0;
  }, [selectedProduct, productSalesData]);

  // 広告費が1つでも選択されているか
  const isAnyAdSelected = showAdCost.amazon || showAdCost.rakuten || showAdCost.qoo10;

  // チェックボックスの変更ハンドラ
  const handleChannelToggle = (channelKey: string) => {
    setSelectedChannels((prev) => ({ ...prev, [channelKey]: !prev[channelKey] }));
  };
  // 旧互換
  const handleMallChange = (mall: string) => {
    const keyMap: Record<string, string> = { amazon: "Amazon", rakuten: "楽天", qoo10: "Qoo10" };
    handleChannelToggle(keyMap[mall] || mall);
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
                <span className={`truncate ${!selectedProduct ? "text-gray-400" : ""}`}>{selectedProduct || "商品を選択してください"}</span>
                <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${isProductDropdownOpen ? "rotate-180" : ""}`} />
              </button>
              {isProductDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-60 overflow-auto">
                  <button
                    type="button"
                    onClick={() => handleProductSelect("")}
                    className={`w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-blue-50 ${selectedProduct === "" ? "bg-blue-100" : ""}`}
                  >
                    選択解除
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
            {/* オンライン売上 */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">オンライン</label>
              <div className="flex gap-3 flex-wrap">
                {ALL_CHANNELS.filter(c => c.category === "online").map(ch => (
                  <label key={ch.key} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={selectedChannels[ch.key]} onChange={() => handleChannelToggle(ch.key)} className="w-4 h-4 rounded" style={{ accentColor: ch.color }} />
                    <span className="font-medium text-sm" style={{ color: ch.color }}>{ch.label}</span>
                  </label>
                ))}
              </div>
            </div>
            {/* 店舗売上 */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">店舗</label>
              <div className="flex gap-3 flex-wrap">
                {ALL_CHANNELS.filter(c => c.category === "store").map(ch => (
                  <label key={ch.key} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={selectedChannels[ch.key]} onChange={() => handleChannelToggle(ch.key)} className="w-4 h-4 rounded" style={{ accentColor: ch.color }} />
                    <span className="font-medium text-sm" style={{ color: ch.color }}>{ch.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* 再生数トグル */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                動画再生数（折れ線）
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showViews}
                    onChange={() => setShowViews(!showViews)}
                    className="w-4 h-4 rounded"
                    style={{ accentColor: "#F472B6" }}
                  />
                  <span className="font-medium text-sm" style={{ color: "#F472B6" }}>
                    再生数
                  </span>
                </label>
              </div>
            </div>

            {/* モール内広告費選択 */}
            <div className="opacity-70">
              <label className="block text-xs font-medium text-gray-400 mb-2">
                モール内広告費（緑線）
              </label>
              <div className="flex gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showAdCost.amazon}
                    onChange={() => handleAdCostChange("amazon")}
                    className="w-3.5 h-3.5 rounded"
                    style={{ accentColor: MALL_COLORS.amazon }}
                  />
                  <span className="text-xs" style={{ color: MALL_COLORS.amazon }}>Amazon</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showAdCost.rakuten}
                    onChange={() => handleAdCostChange("rakuten")}
                    className="w-3.5 h-3.5 rounded"
                    style={{ accentColor: MALL_COLORS.rakuten }}
                  />
                  <span className="text-xs" style={{ color: MALL_COLORS.rakuten }}>楽天</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showAdCost.qoo10}
                    onChange={() => handleAdCostChange("qoo10")}
                    className="w-3.5 h-3.5 rounded"
                    style={{ accentColor: MALL_COLORS.qoo10 }}
                  />
                  <span className="text-xs" style={{ color: MALL_COLORS.qoo10 }}>Qoo10</span>
                </label>
              </div>
            </div>

            {/* 外部広告費選択 */}
            <div className="opacity-70">
              <label className="block text-xs font-medium text-gray-400 mb-2">
                外部広告費（個別線）
              </label>
              <div className="flex gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showExternalAd.x}
                    onChange={() => handleExternalAdChange("x")}
                    className="w-3.5 h-3.5 rounded"
                    style={{ accentColor: EXTERNAL_AD_COLORS.x }}
                  />
                  <span className="text-xs" style={{ color: EXTERNAL_AD_COLORS.x }}>X</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showExternalAd.tiktok}
                    onChange={() => handleExternalAdChange("tiktok")}
                    className="w-3.5 h-3.5 rounded"
                    style={{ accentColor: EXTERNAL_AD_COLORS.tiktok }}
                  />
                  <span className="text-xs" style={{ color: EXTERNAL_AD_COLORS.tiktok }}>TikTok</span>
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

      {/* KPIカード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
        {totalViews > 0 && (
          <div className="bg-gradient-to-r from-pink-400 to-pink-500 rounded-lg shadow-sm p-3 text-white">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-white/20 rounded-lg">
                <Eye size={18} />
              </div>
              <div>
                <p className="text-pink-100 text-xs">合計再生数</p>
                <p className="text-lg font-bold">{totalViews.toLocaleString()}</p>
              </div>
            </div>
          </div>
        )}
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
              {showFlags && filteredFlags
                .filter(flag => {
                  const end = flag.endDate || flag.date;
                  return flag.date <= endDate && end >= startDate;
                })
                .map((flag) => {
                  const startIdx = productSalesData.findIndex(d => d.date >= flag.date);
                  if (startIdx === -1) return null;
                  const endIdx = flag.endDate
                    ? productSalesData.findLastIndex(d => d.date <= flag.endDate!)
                    : startIdx;
                  if (endIdx === -1) return null;
                  const graphLeftMargin = 55;
                  const graphRightMargin = 55;
                  const startPos = ((startIdx + 0.5) / productSalesData.length) * 100;
                  const endPos = ((endIdx + 0.5) / productSalesData.length) * 100;
                  const hasRange = flag.endDate && endIdx > startIdx;
                  const mallColor = flag.mall ? ({"Amazon":"#FF9900","楽天":"#BF0000","Qoo10":"#3266CC"} as Record<string,string>)[flag.mall] || "#9333EA" : "#9333EA";
                  return (
                    <div key={flag.id}>
                      {hasRange && (
                        <div
                          className="absolute z-5 opacity-15 rounded"
                          style={{
                            top: '20px',
                            height: '220px',
                            backgroundColor: mallColor,
                            left: `calc(${graphLeftMargin}px + (100% - ${graphLeftMargin + graphRightMargin}px) * ${startPos / 100})`,
                            width: `calc((100% - ${graphLeftMargin + graphRightMargin}px) * ${(endPos - startPos) / 100})`,
                          }}
                        />
                      )}
                      <div
                        className="absolute z-10 cursor-pointer"
                        style={{
                          top: '20px',
                          left: `calc(${graphLeftMargin}px + (100% - ${graphLeftMargin + graphRightMargin}px) * ${startPos / 100})`,
                          transform: 'translateX(-50%)',
                        }}
                        onClick={() => setSelectedFlag(flag)}
                      >
                        <div className="flex flex-col items-center">
                          <span className="text-xs font-bold whitespace-nowrap bg-white/90 px-1 rounded shadow-sm border" style={{ color: mallColor, borderColor: mallColor + '40' }}>
                            {flag.name}
                          </span>
                          <div className="w-0.5 h-44 opacity-80" style={{ background: `repeating-linear-gradient(to bottom, ${mallColor} 0, ${mallColor} 4px, transparent 4px, transparent 8px)` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={productSalesData}
                  margin={{ top: 20, right: 60, left: 20, bottom: 5 }}
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
                    domain={[0, 'dataMax']}
                    type="number"
                    scale="linear"
                    padding={{ top: 20 }}
                  />
                  <YAxis
                    yAxisId="views"
                    orientation="right"
                    tick={showViews && productSalesData.some(d => d.totalViews > 0) ? { fill: "#F472B6", fontSize: 12 } : false}
                    tickFormatter={(value) =>
                      value >= 10000 ? `${(value / 10000).toFixed(0)}万` : value.toLocaleString()
                    }
                    domain={[0, 'dataMax']}
                    type="number"
                    scale="linear"
                    padding={{ top: 20 }}
                    hide={!showViews || !productSalesData.some(d => d.totalViews > 0)}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const getVal = (key: string) => (payload.find((p: any) => p.dataKey === key)?.value as number) || 0;
                        const viewsVal = getVal('totalViews');
                        return (
                          <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                            <p className="font-semibold text-gray-700 mb-2">{label}</p>
                            {ALL_CHANNELS.map(ch => {
                              const val = getVal(`${ch.key}_sales`);
                              if (!selectedChannels[ch.key] || val <= 0) return null;
                              return (
                                <p key={ch.key} style={{ color: ch.color }} className="text-sm">
                                  {ch.label}: {formatCurrency(val)}
                                </p>
                              );
                            })}
                            {viewsVal > 0 && (
                              <p style={{ color: "#F472B6" }} className="text-sm">
                                再生数: {viewsVal.toLocaleString()}回
                              </p>
                            )}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  {/* チャネル別売上（積み上げ棒グラフ） */}
                  {ALL_CHANNELS.map((ch, idx) => {
                    const salesKey = `${ch.key}_sales`;
                    if (!selectedChannels[ch.key]) return null;
                    if (!productSalesData.some(d => (d[salesKey] as number) > 0)) return null;
                    return (
                      <Bar
                        key={ch.key}
                        yAxisId="sales"
                        dataKey={salesKey}
                        stackId="productSales"
                        fill={ch.color}
                        barSize={30}
                        radius={idx === ALL_CHANNELS.length - 1 ? [4, 4, 0, 0] : undefined}
                      />
                    );
                  })}
                  {/* 再生数（折れ線グラフ・右軸） */}
                  {showViews && productSalesData.some(d => d.totalViews > 0) && (
                    <Line
                      yAxisId="views"
                      type="monotone"
                      dataKey="totalViews"
                      stroke="#F472B6"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "#F472B6" }}
                      activeDot={{ r: 5 }}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>

              {/* カスタム凡例 */}
              <div className="flex flex-wrap justify-center gap-4 mt-2 text-sm">
                {ALL_CHANNELS.map(ch => {
                  if (!selectedChannels[ch.key]) return null;
                  if (!productSalesData.some(d => ((d[`${ch.key}_sales`] as number) || 0) > 0)) return null;
                  return (
                    <div key={ch.key} className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: ch.color }} />
                      <span>{ch.label}</span>
                    </div>
                  );
                })}
                {showViews && productSalesData.some(d => d.totalViews > 0) && (
                  <div className="flex items-center gap-1">
                    <div className="w-6 h-0.5 rounded" style={{ backgroundColor: "#F472B6" }} />
                    <span>再生数</span>
                  </div>
                )}
              </div>
            </div>
          )
        ) : (
          <div className="h-72 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <p>商品が選択されていません</p>
              <p className="text-sm mt-2">上のドロップダウンから商品を選択してください</p>
            </div>
          </div>
        )}

        {false && (
          <div className="h-72 relative hidden">
            {/* 旧メインチャート（未使用） */}
            {showFlags && filteredFlags
              .filter(flag => {
                const end = flag.endDate || flag.date;
                return flag.date <= endDate && end >= startDate;
              })
              .map((flag) => {
                const startIdx = chartData.findIndex(d => d.date >= flag.date);
                if (startIdx === -1) return null;
                const endIdx = flag.endDate
                  ? chartData.findLastIndex(d => d.date <= flag.endDate!)
                  : startIdx;
                if (endIdx === -1) return null;
                const graphLeftMargin = 55;
                const graphRightMargin = 55;
                const startPos = ((startIdx + 0.5) / chartData.length) * 100;
                const endPos = ((endIdx + 0.5) / chartData.length) * 100;
                const hasRange = flag.endDate && endIdx > startIdx;
                const mallColor = flag.mall ? ({"Amazon":"#FF9900","楽天":"#BF0000","Qoo10":"#3266CC"} as Record<string,string>)[flag.mall] || "#9333EA" : "#9333EA";
                return (
                  <div key={flag.id}>
                    {hasRange && (
                      <div
                        className="absolute z-5 opacity-15 rounded"
                        style={{
                          top: '20px',
                          height: '220px',
                          backgroundColor: mallColor,
                          left: `calc(${graphLeftMargin}px + (100% - ${graphLeftMargin + graphRightMargin}px) * ${startPos / 100})`,
                          width: `calc((100% - ${graphLeftMargin + graphRightMargin}px) * ${(endPos - startPos) / 100})`,
                        }}
                      />
                    )}
                    <div
                      className="absolute z-10 cursor-pointer"
                      style={{
                        top: '20px',
                        left: `calc(${graphLeftMargin}px + (100% - ${graphLeftMargin + graphRightMargin}px) * ${startPos / 100})`,
                        transform: 'translateX(-50%)',
                      }}
                      onClick={() => setSelectedFlag(flag)}
                    >
                      <div className="flex flex-col items-center">
                        <span className="text-xs font-bold whitespace-nowrap bg-white/90 px-1 rounded shadow-sm border" style={{ color: mallColor, borderColor: mallColor + '40' }}>
                          {flag.name}
                        </span>
                        <div className="w-0.5 h-44 opacity-80" style={{ background: `repeating-linear-gradient(to bottom, ${mallColor} 0, ${mallColor} 4px, transparent 4px, transparent 8px)` }} />
                      </div>
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
        {showFlags && filteredFlags.filter(flag => {
          const end = flag.endDate || flag.date;
          return flag.date <= endDate && end >= startDate;
        }).length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-600 mb-2 flex items-center gap-1">
              <Flag className="w-4 h-4 text-purple-600" />
              期間内のイベント
            </h3>
            <div className="flex flex-wrap gap-2">
              {filteredFlags
                .filter(flag => {
                  const end = flag.endDate || flag.date;
                  return flag.date <= endDate && end >= startDate;
                })
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((flag) => {
                  const mallColor = flag.mall ? ({"Amazon":"#FF9900","楽天":"#BF0000","Qoo10":"#3266CC"} as Record<string,string>)[flag.mall] || "#9333EA" : "#9333EA";
                  const d = new Date(flag.date);
                  const dateLabel = `${d.getMonth() + 1}/${d.getDate()}`;
                  const endLabel = flag.endDate ? (() => { const ed = new Date(flag.endDate); return `〜${ed.getMonth() + 1}/${ed.getDate()}`; })() : "";
                  return (
                    <button
                      key={flag.id}
                      onClick={() => setSelectedFlag(flag)}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm hover:opacity-80 transition-colors"
                      style={{ backgroundColor: mallColor + '20', color: mallColor }}
                    >
                      <Flag className="w-3 h-3" />
                      <span className="font-medium">{flag.name}</span>
                      <span className="text-xs opacity-70">({dateLabel}{endLabel})</span>
                    </button>
                  );
                })}
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
