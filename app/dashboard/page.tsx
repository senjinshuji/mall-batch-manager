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
import { TrendingUp, Megaphone, Share2, ChevronDown, RefreshCw, Flag, X, Eye, Package, Sparkles } from "lucide-react";
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
  const [prevProductSalesData, setPrevProductSalesData] = useState<ProductSalesData[]>([]);
  const [eventFlags, setEventFlags] = useState<EventFlag[]>([]);
  const [showFlags, setShowFlags] = useState(true);
  const [selectedFlag, setSelectedFlag] = useState<EventFlag | null>(null);
  const [loading, setLoading] = useState(true);
  const [productLoading, setProductLoading] = useState(false);
  const fetchGenRef = useRef(0); // フェッチ世代カウンター

  // AI分析用
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiFactsMarkdown, setAiFactsMarkdown] = useState<string | null>(null);
  // チャット用
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
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
  const [displayMode, setDisplayMode] = useState<'sales' | 'count'>('sales');
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

  // 単一商品または複数商品の売上データを取得（実データユーザーのみ）
  const fetchProductSales = async (product: RegisteredProduct) => {
    await fetchMultipleProductSales([product]);
  };

  // 複数商品の売上データを取得して合算（Firestoreのみ）
  const fetchMultipleProductSales = async (products: RegisteredProduct[]) => {
    if (!isRealDataUser) {
      setProductSalesData([]);
      return;
    }

    const validProducts = products.filter(p => p.id);
    if (validProducts.length === 0) {
      setProductSalesData([]);
      return;
    }

    const thisGen = ++fetchGenRef.current;
    setProductLoading(true);

    // 前期間を計算（同じ日数分、startDateの直前）
    const daysDiff = Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / (86400000)) + 1;
    const prevEnd = new Date(startDate);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - daysDiff + 1);
    const prevStartStr = prevStart.toISOString().split("T")[0];
    const prevEndStr = prevEnd.toISOString().split("T")[0];

    // 重複除外のため、(productId, date, channel) ごとに「優先度が高いソース」のデータのみ採用
    // 優先度: unified_daily_sales > amazon_daily_sales / rakuten_daily_sales > product_sales
    type RawRow = { productId: string; date: string; channel: string; sales: number; qty: number; orderCount: number; views?: number; source: string };
    const rawRows: RawRow[] = [];

    const safeQuery = async (colName: string, productId: string) => {
      try {
        return await getDocs(query(collection(db, colName), where("productId", "==", productId)));
      } catch (err) {
        console.error(`[safeQuery] ${colName} (productId=${productId}) failed:`, err);
        return null;
      }
    };

    try {
      const allPromises: Promise<void>[] = [];

      for (const product of validProducts) {
        allPromises.push(
          safeQuery("amazon_daily_sales", product.id).then(snap => {
            snap?.docs.forEach(doc => {
              const d = doc.data();
              if (d.date >= prevStartStr && d.date <= endDate) {
                rawRows.push({ productId: product.id, date: d.date, channel: "Amazon", sales: d.salesAmount || 0, qty: d.orderedUnits || 0, orderCount: d.orderCount || 0, source: "amazon_daily_sales" });
              }
            });
          })
        );
        allPromises.push(
          safeQuery("rakuten_daily_sales", product.id).then(snap => {
            snap?.docs.forEach(doc => {
              const d = doc.data();
              if (d.date >= prevStartStr && d.date <= endDate) {
                rawRows.push({ productId: product.id, date: d.date, channel: "楽天", sales: d.salesAmount || 0, qty: d.salesCount || d.orderedUnits || 0, orderCount: d.orderCount || 0, source: "rakuten_daily_sales" });
              }
            });
          })
        );
        allPromises.push(
          safeQuery("product_sales", product.id).then(snap => {
            snap?.docs.forEach(doc => {
              const d = doc.data();
              if (d.date >= prevStartStr && d.date <= endDate) {
                const ch = d.mall === "amazon" ? "Amazon" : d.mall === "qoo10" ? "Qoo10" : d.mall === "rakuten" ? "楽天" : null;
                if (ch) rawRows.push({ productId: product.id, date: d.date, channel: ch, sales: d.sales || 0, qty: d.quantity || 0, orderCount: d.orderCount || 0, source: "product_sales" });
              }
            });
          })
        );
        allPromises.push(
          safeQuery("unified_daily_sales", product.id).then(snap => {
            snap?.docs.forEach(doc => {
              const d = doc.data();
              if (d.date >= prevStartStr && d.date <= endDate) {
                rawRows.push({ productId: product.id, date: d.date, channel: d.channel, sales: d.salesAmount || 0, qty: d.quantity || 0, orderCount: d.orderCount || 0, source: "unified_daily_sales" });
              }
            });
          })
        );
        allPromises.push(
          safeQuery("daily_views", product.id).then(snap => {
            snap?.docs.forEach(doc => {
              const d = doc.data();
              if (d.date >= prevStartStr && d.date <= endDate) {
                rawRows.push({ productId: product.id, date: d.date, channel: "__views__", sales: 0, qty: 0, orderCount: 0, views: d.views || 0, source: "daily_views" });
              }
            });
          })
        );
      }

      await Promise.allSettled(allPromises);

      // 重複除外: (productId, date, channel) ごとに優先度が高いソースのみ残す
      const sourcePriority: Record<string, number> = {
        unified_daily_sales: 100,
        amazon_daily_sales: 90,
        rakuten_daily_sales: 90,
        daily_views: 80,
        product_sales: 10,
      };
      const dedupMap = new Map<string, RawRow>();
      for (const row of rawRows) {
        const key = `${row.productId}|${row.date}|${row.channel}`;
        const existing = dedupMap.get(key);
        if (!existing || (sourcePriority[row.source] || 0) > (sourcePriority[existing.source] || 0)) {
          dedupMap.set(key, row);
        }
      }
      const dedupedRows = Array.from(dedupMap.values());

      // 現在期間と前期間に分けて集計
      const aggregate = (fromDate: string, toDate: string) => {
        const data: { [date: string]: Record<string, number> } = {};
        const c = new Date(fromDate);
        const e = new Date(toDate);
        while (c <= e) { data[c.toISOString().split("T")[0]] = { totalViews: 0 }; c.setDate(c.getDate() + 1); }
        for (const row of dedupedRows) {
          if (row.date < fromDate || row.date > toDate) continue;
          if (!data[row.date]) data[row.date] = { totalViews: 0 };
          if (row.channel === "__views__") {
            data[row.date].totalViews = (data[row.date].totalViews || 0) + (row.views || 0);
          } else {
            data[row.date][`${row.channel}_sales`] = (data[row.date][`${row.channel}_sales`] || 0) + row.sales;
            data[row.date][`${row.channel}_qty`] = (data[row.date][`${row.channel}_qty`] || 0) + row.qty;
          }
        }
        return Object.entries(data).map(([date, d]) => ({ date, ...d } as ProductSalesData)).sort((a, b) => a.date.localeCompare(b.date));
      };

      const salesArray = aggregate(startDate, endDate);
      const prevSalesArray = aggregate(prevStartStr, prevEndStr);

      if (thisGen !== fetchGenRef.current) return;
      setProductSalesData(salesArray);
      setPrevProductSalesData(prevSalesArray);
    } catch (err) {
      console.error("商品別売上取得エラー:", err);
      if (thisGen === fetchGenRef.current) setProductSalesData([]);
    } finally {
      if (thisGen === fetchGenRef.current) setProductLoading(false);
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

  // フラグを媒体選択＋商品スコープでフィルタリング
  // - global: モールフィルタのみ
  // - product: 現在表示中の商品(selectedSkuProducts)に紐づくものだけ表示
  //   selectedSkuProductsはクライアントの場合allowedProductIdsで既に絞られているため、
  //   他クライアントの個別フラグが漏れることも防げる
  const filteredFlags = useMemo(() => {
    const visibleProductIds = new Set(selectedSkuProducts.map((p) => p.id));
    return eventFlags.filter((flag) => {
      if (flag.mall && selectedChannels[flag.mall] === false) return false;
      if (flag.scope === "product") {
        if (!flag.productId) return false;
        return visibleProductIds.has(flag.productId);
      }
      return true;
    });
  }, [eventFlags, selectedChannels, selectedSkuProducts]);

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

  // 前期間の合計売上
  const prevTotalSales = useMemo(() => {
    if (!selectedProduct) return 0;
    return prevProductSalesData.reduce((sum, day) => {
      let dayTotal = 0;
      ALL_CHANNELS.forEach(ch => {
        if (selectedChannels[ch.key]) dayTotal += (day[`${ch.key}_sales`] as number) || 0;
      });
      return sum + dayTotal;
    }, 0);
  }, [selectedChannels, selectedProduct, prevProductSalesData]);

  // 前期間の合計再生数
  const prevTotalViews = useMemo(() => {
    if (selectedProduct && prevProductSalesData.length > 0) {
      return prevProductSalesData.reduce((sum, day) => sum + (day.totalViews || 0), 0);
    }
    return 0;
  }, [selectedProduct, prevProductSalesData]);

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

  // AI分析実行
  const handleAiAnalysis = async () => {
    if (!selectedProduct || productSalesData.length === 0) return;
    setAiAnalyzing(true);
    setAiError(null);
    setAiResult(null);
    setAiFactsMarkdown(null);
    setChatMessages([]);

    try {
      // 商品IDを特定
      const targetProducts = registeredProducts.filter(p => p.productName === selectedProduct);
      const productIds = targetProducts.map(p => p.id);

      // 過去90日分の起点
      const historicalStart = new Date(startDate);
      historicalStart.setDate(historicalStart.getDate() - 90);
      const historicalStartStr = historicalStart.toISOString().split("T")[0];

      // 5コレクションから過去90日分の生データを並列取得
      type RawRow = { date: string; channel: string; sales: number; qty: number; views?: number };
      const rawRows: RawRow[] = [];
      const safeQuery = async (colName: string, productId: string) => {
        try { return await getDocs(query(collection(db, colName), where("productId", "==", productId))); }
        catch { return null; }
      };

      const promises: Promise<void>[] = [];
      for (const pid of productIds) {
        promises.push(
          safeQuery("amazon_daily_sales", pid).then(snap => {
            snap?.docs.forEach(d => {
              const data = d.data();
              if (data.date >= historicalStartStr && data.date <= endDate) {
                rawRows.push({ date: data.date, channel: "Amazon", sales: data.salesAmount || 0, qty: data.orderedUnits || 0 });
              }
            });
          })
        );
        promises.push(
          safeQuery("rakuten_daily_sales", pid).then(snap => {
            snap?.docs.forEach(d => {
              const data = d.data();
              if (data.date >= historicalStartStr && data.date <= endDate) {
                rawRows.push({ date: data.date, channel: "楽天", sales: data.salesAmount || 0, qty: data.salesCount || data.orderedUnits || 0 });
              }
            });
          })
        );
        promises.push(
          safeQuery("product_sales", pid).then(snap => {
            snap?.docs.forEach(d => {
              const data = d.data();
              if (data.date >= historicalStartStr && data.date <= endDate) {
                const ch = data.mall === "amazon" ? "Amazon" : data.mall === "qoo10" ? "Qoo10" : data.mall === "rakuten" ? "楽天" : null;
                if (ch) rawRows.push({ date: data.date, channel: ch, sales: data.sales || 0, qty: data.quantity || 0 });
              }
            });
          })
        );
        promises.push(
          safeQuery("unified_daily_sales", pid).then(snap => {
            snap?.docs.forEach(d => {
              const data = d.data();
              if (data.date >= historicalStartStr && data.date <= endDate) {
                rawRows.push({ date: data.date, channel: data.channel, sales: data.salesAmount || 0, qty: data.quantity || 0 });
              }
            });
          })
        );
        promises.push(
          safeQuery("daily_views", pid).then(snap => {
            snap?.docs.forEach(d => {
              const data = d.data();
              if (data.date >= historicalStartStr && data.date <= endDate) {
                rawRows.push({ date: data.date, channel: "__views__", sales: 0, qty: 0, views: data.views || 0 });
              }
            });
          })
        );
      }
      await Promise.allSettled(promises);

      // 集計: 日付ごとにチャネル別売上 + 再生数
      const aggregated: Record<string, Record<string, number>> = {};
      for (const row of rawRows) {
        if (!aggregated[row.date]) aggregated[row.date] = { views: 0 };
        if (row.channel === "__views__") {
          aggregated[row.date].views = (aggregated[row.date].views || 0) + (row.views || 0);
        } else {
          aggregated[row.date][row.channel] = (aggregated[row.date][row.channel] || 0) + row.sales;
        }
      }

      // 配列化してソート
      const allDailyData = Object.entries(aggregated)
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // 当期間と過去のデータに分割
      const currentDailyData = allDailyData.filter(d => d.date >= startDate && d.date <= endDate);
      const historicalDailyData = allDailyData.filter(d => d.date < startDate);

      // フラグデータ（過去90日分も含めて全て送る）
      // 商品別フラグは選択中商品に紐づくものだけに絞る
      const productIdSet = new Set(productIds);
      const allFlags = eventFlags
        .filter(f => f.date <= endDate && (f.endDate || f.date) >= historicalStartStr)
        .filter(f => {
          if (f.scope !== "product") return true; // global flagsは全て
          return f.productId && productIdSet.has(f.productId); // 商品別は紐づくものだけ
        })
        .map(f => ({
          name: f.name,
          date: f.date,
          endDate: f.endDate || "",
          mall: f.mall || "",
          scope: f.scope || "global",
          description: f.description || "",
        }));

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPeriod: { startDate, endDate, dailyData: currentDailyData },
          historicalData: { startDate: historicalStartStr, endDate: (() => { const d = new Date(startDate); d.setDate(d.getDate() - 1); return d.toISOString().split("T")[0]; })(), dailyData: historicalDailyData },
          flagsData: allFlags,
          productName: selectedProduct,
        }),
      });

      const data = await response.json();
      if (data.error) {
        setAiError(data.error);
      } else {
        setAiResult(data.analysis);
        setAiFactsMarkdown(data.factsMarkdown || null);
      }
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : "分析に失敗しました");
    } finally {
      setAiAnalyzing(false);
    }
  };

  // チャット送信
  const handleChatSend = async () => {
    const text = chatInput.trim();
    if (!text || !aiFactsMarkdown || chatLoading) return;

    const newMessages: { role: "user" | "assistant"; content: string }[] = [...chatMessages, { role: "user", content: text }];
    setChatMessages(newMessages);
    setChatInput("");
    setChatLoading(true);

    try {
      const response = await fetch("/api/analyze/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factsMarkdown: aiFactsMarkdown,
          messages: newMessages,
          productName: selectedProduct,
        }),
      });
      const data = await response.json();
      if (data.error) {
        setChatMessages([...newMessages, { role: "assistant", content: `エラー: ${data.error}` }]);
      } else {
        setChatMessages([...newMessages, { role: "assistant", content: data.reply }]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "通信エラー";
      setChatMessages([...newMessages, { role: "assistant", content: `エラー: ${msg}` }]);
    } finally {
      setChatLoading(false);
    }
  };

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
                className="flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none min-w-0 w-full sm:min-w-[180px] sm:w-auto text-sm"
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
                className="flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none min-w-0 w-full sm:min-w-[160px] sm:w-auto text-sm"
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

          <div className="flex flex-col gap-4 sm:gap-6 flex-wrap">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg shadow-sm p-3 text-white">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-white/20 rounded-lg">
              <TrendingUp size={18} />
            </div>
            <div>
              <p className="text-blue-100 text-xs">合計売上</p>
              <p className="text-lg font-bold">{formatCurrency(totalSales)}</p>
              {totalSales > 0 && prevTotalSales > 0 && (() => {
                const diff = totalSales - prevTotalSales;
                const pct = Math.round((diff / prevTotalSales) * 100);
                return (
                  <p className={`text-xs ${diff >= 0 ? "text-green-200" : "text-red-200"}`}>
                    前期比 {diff >= 0 ? "+" : ""}{formatCurrency(diff)}（{diff >= 0 ? "+" : ""}{pct}%）
                  </p>
                );
              })()}
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
                {prevTotalViews > 0 && (() => {
                  const diff = totalViews - prevTotalViews;
                  const pct = Math.round((diff / prevTotalViews) * 100);
                  return (
                    <p className={`text-xs ${diff >= 0 ? "text-green-200" : "text-red-200"}`}>
                      前期比 {diff >= 0 ? "+" : ""}{diff.toLocaleString()}（{diff >= 0 ? "+" : ""}{pct}%）
                    </p>
                  );
                })()}
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
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-semibold text-gray-700">
            {selectedProduct ? `${selectedProductDisplayName} - 日次${displayMode === 'sales' ? '売上' : '件数'}推移` : "日次売上・広告費推移"}
            {productLoading && (
              <RefreshCw className="inline-block ml-2 w-4 h-4 animate-spin text-blue-500" />
            )}
          </h2>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setDisplayMode('sales')}
              className={`px-3 py-1 text-sm rounded-md font-medium transition-colors ${displayMode === 'sales' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              金額
            </button>
            <button
              onClick={() => setDisplayMode('count')}
              className={`px-3 py-1 text-sm rounded-md font-medium transition-colors ${displayMode === 'count' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              件数
            </button>
          </div>
        </div>

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
            <div className="h-56 sm:h-72 relative">
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
                      displayMode === 'sales'
                        ? `¥${(value / 10000).toFixed(0)}万`
                        : value.toLocaleString()
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
                        const dataKeySuffix = displayMode === 'sales' ? '_sales' : '_qty';
                        return (
                          <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                            <p className="font-semibold text-gray-700 mb-2">{label}</p>
                            {ALL_CHANNELS.map(ch => {
                              const val = getVal(`${ch.key}${dataKeySuffix}`);
                              if (!selectedChannels[ch.key] || val <= 0) return null;
                              return (
                                <p key={ch.key} style={{ color: ch.color }} className="text-sm">
                                  {ch.label}: {displayMode === 'sales' ? formatCurrency(val) : `${val.toLocaleString()}件`}
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
                  {/* チャネル別売上/件数（積み上げ棒グラフ） */}
                  {ALL_CHANNELS.map((ch, idx) => {
                    const dataKey = displayMode === 'sales' ? `${ch.key}_sales` : `${ch.key}_qty`;
                    if (!selectedChannels[ch.key]) return null;
                    if (!productSalesData.some(d => (d[dataKey] as number) > 0)) return null;
                    return (
                      <Bar
                        key={ch.key}
                        yAxisId="sales"
                        dataKey={dataKey}
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
                  const legendKey = displayMode === 'sales' ? `${ch.key}_sales` : `${ch.key}_qty`;
                  if (!productSalesData.some(d => ((d[legendKey] as number) || 0) > 0)) return null;
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
          <div className="h-56 sm:h-72 relative hidden">
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
      {/* AI分析（β版） */}
      {selectedProduct && productSalesData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-600" />
              <h2 className="text-base font-semibold text-gray-700">AI分析（β版）</h2>
            </div>
            <button
              onClick={handleAiAnalysis}
              disabled={aiAnalyzing}
              className="flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-lg hover:from-violet-600 hover:to-purple-700 disabled:opacity-50 transition-all text-sm"
            >
              {aiAnalyzing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {aiAnalyzing ? "分析中..." : aiResult ? "再分析" : "分析する"}
            </button>
          </div>

          {!aiResult && !aiAnalyzing && !aiError && (
            <p className="text-sm text-gray-400 py-6 text-center">「分析する」ボタンを押すと、SNS再生数と売上の相関をAIが分析します</p>
          )}

          {aiAnalyzing && (
            <div className="flex items-center justify-center py-8 gap-3">
              <RefreshCw className="w-6 h-6 text-purple-500 animate-spin" />
              <p className="text-gray-500 text-sm">データを解析しています。30秒ほどお待ちください...</p>
            </div>
          )}

          {aiError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{aiError}</div>
          )}

          {aiResult && (
            <>
              <div className="prose prose-sm max-w-none text-gray-700 max-h-[400px] sm:max-h-[600px] overflow-y-auto">
                {aiResult.split("\n").map((line, i) => {
                  if (line.startsWith("# ")) return <h1 key={i} className="text-xl font-bold text-gray-900 mt-4 mb-2">{line.slice(2)}</h1>;
                  if (line.startsWith("## ")) return <h2 key={i} className="text-lg font-bold text-gray-800 mt-4 mb-2">{line.slice(3)}</h2>;
                  if (line.startsWith("### ")) return <h3 key={i} className="text-base font-bold text-gray-700 mt-3 mb-1">{line.slice(4)}</h3>;
                  if (line.startsWith("#### ")) return <h4 key={i} className="text-sm font-bold text-gray-700 mt-2 mb-1">{line.slice(5)}</h4>;
                  if (line.startsWith("- ") || line.startsWith("* ")) return <li key={i} className="ml-4 text-sm">{line.slice(2)}</li>;
                  if (line.startsWith("|")) return <pre key={i} className="text-xs bg-gray-50 px-2 py-0.5 rounded overflow-x-auto">{line}</pre>;
                  if (line.startsWith("```")) return null;
                  if (line.trim() === "") return <br key={i} />;
                  if (line.startsWith("**") && line.endsWith("**")) return <p key={i} className="font-bold text-sm mt-2">{line.slice(2, -2)}</p>;
                  return <p key={i} className="text-sm leading-relaxed">{line}</p>;
                })}
              </div>

              {/* チャット */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-purple-500" />
                  <h3 className="text-sm font-semibold text-gray-700">フォローアップ質問</h3>
                </div>

                {chatMessages.length > 0 && (
                  <div className="space-y-3 mb-3 max-h-[250px] sm:max-h-[400px] overflow-y-auto pr-2">
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${msg.role === "user" ? "bg-purple-100 text-purple-900" : "bg-gray-100 text-gray-700"}`}>
                          {msg.content.split("\n").map((line, j) => {
                            if (line.startsWith("- ") || line.startsWith("* ")) return <li key={j} className="ml-4 text-sm">{line.slice(2)}</li>;
                            if (line.startsWith("**") && line.endsWith("**")) return <p key={j} className="font-bold">{line.slice(2, -2)}</p>;
                            if (line.trim() === "") return <br key={j} />;
                            return <p key={j} className="leading-relaxed">{line}</p>;
                          })}
                        </div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="flex justify-start">
                        <div className="px-3 py-2 rounded-lg bg-gray-100 flex items-center gap-2">
                          <RefreshCw className="w-3 h-3 animate-spin text-gray-500" />
                          <span className="text-xs text-gray-500">考えています...</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleChatSend(); } }}
                    disabled={chatLoading}
                    placeholder="例: 3/22のバズについて詳しく / もっと深掘りして"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm disabled:opacity-50"
                  />
                  <button
                    onClick={handleChatSend}
                    disabled={chatLoading || !chatInput.trim()}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    送信
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

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
