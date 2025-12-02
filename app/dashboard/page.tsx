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
import { TrendingUp, Megaphone, Share2, ChevronDown, RefreshCw } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, onSnapshot, Timestamp, getDocs } from "firebase/firestore";
import { formatCurrency } from "@/lib/mockData";

// 登録商品の型
interface RegisteredProduct {
  id: string;
  productName: string;
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

const BACKEND_URL = "https://mall-batch-manager-983678294034.asia-northeast1.run.app";

// 商品別売上データの型
interface ProductSalesData {
  date: string;
  sales: number;
  quantity: number;
}

export default function DashboardPage() {
  const [salesData, setSalesData] = useState<SalesData[]>([]);
  const [registeredProducts, setRegisteredProducts] = useState<RegisteredProduct[]>([]);
  const [productSalesData, setProductSalesData] = useState<ProductSalesData[]>([]);
  const [loading, setLoading] = useState(true);
  const [productLoading, setProductLoading] = useState(false);
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
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Firestoreから登録商品を取得
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const q = query(collection(db, "registered_products"), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        const products = snapshot.docs.map((doc) => ({
          id: doc.id,
          productName: doc.data().productName || "",
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
  }, []);

  // Firestoreからリアルタイムでデータを取得
  useEffect(() => {
    setLoading(true);
    setError(null);

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
  }, []);

  // ドロップダウン外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProductDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 商品選択時にQoo10 APIから売上データを取得
  const fetchProductSales = async (product: RegisteredProduct) => {
    if (!product.qoo10Code) {
      setProductSalesData([]);
      return;
    }

    setProductLoading(true);
    try {
      const response = await fetch(
        `${BACKEND_URL}/qoo10/product-sales/${encodeURIComponent(product.qoo10Code)}?startDate=${startDate}&endDate=${endDate}`
      );
      const data = await response.json();

      if (data.success && data.dailySales) {
        setProductSalesData(data.dailySales);
      } else {
        setProductSalesData([]);
      }
    } catch (err) {
      console.error("商品別売上取得エラー:", err);
      setProductSalesData([]);
    } finally {
      setProductLoading(false);
    }
  };

  // 商品選択時の処理
  const handleProductSelect = (productId: string) => {
    setSelectedProduct(productId);
    setIsProductDropdownOpen(false);

    if (productId) {
      const product = registeredProducts.find(p => p.id === productId);
      if (product) {
        fetchProductSales(product);
      }
    } else {
      // ダミー商品選択時はクリア
      setProductSalesData([]);
    }
  };

  // 日付変更時に商品別売上を再取得
  useEffect(() => {
    if (selectedProduct && registeredProducts.length > 0) {
      const product = registeredProducts.find(p => p.id === selectedProduct);
      if (product && product.qoo10Code) {
        setProductLoading(true);
        fetch(
          `${BACKEND_URL}/qoo10/product-sales/${encodeURIComponent(product.qoo10Code)}?startDate=${startDate}&endDate=${endDate}`
        )
          .then(res => res.json())
          .then(data => {
            if (data.success && data.dailySales) {
              setProductSalesData(data.dailySales);
            } else {
              setProductSalesData([]);
            }
          })
          .catch(err => {
            console.error("商品別売上取得エラー:", err);
            setProductSalesData([]);
          })
          .finally(() => {
            setProductLoading(false);
          });
      }
    }
  }, [startDate, endDate, selectedProduct, registeredProducts]);

  // 選択中の商品名を取得
  const selectedProductName = selectedProduct
    ? registeredProducts.find((p) => p.id === selectedProduct)?.productName || ""
    : "ダミー商品";

  // 期間フィルタ済みデータ
  const filteredData = useMemo(() => {
    return salesData
      .filter((item) => {
        if (!item.date) return false;
        return item.date >= startDate && item.date <= endDate;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [salesData, startDate, endDate]);

  // グラフ用データ（広告費合計を追加）
  const chartData = useMemo(() => {
    return filteredData.map((day) => {
      let totalAd = 0;
      if (showAdCost.amazon) totalAd += day.amazonAd;
      if (showAdCost.rakuten) totalAd += day.rakutenAd;
      if (showAdCost.qoo10) totalAd += day.qoo10Ad;
      return {
        ...day,
        totalAd,
      };
    });
  }, [filteredData, showAdCost]);

  // 合計売上を計算（商品選択時はproductSalesDataを使用）
  const totalSales = useMemo(() => {
    if (selectedProduct && productSalesData.length > 0) {
      // 商品選択時：productSalesDataから合計
      return productSalesData.reduce((sum, day) => sum + day.sales, 0);
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
        <h1 className="text-xl font-bold text-gray-800">ダッシュボード</h1>
        <div className="text-sm text-gray-500">
          Firestoreデータ: {salesData.length}件
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
                <span className="truncate">{selectedProductName}</span>
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
                  {registeredProducts.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => handleProductSelect(product.id)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${selectedProduct === product.id ? "bg-blue-100 font-medium" : ""}`}
                    >
                      {product.productName}
                      {product.qoo10Code && (
                        <span className="ml-2 text-xs text-blue-500">Qoo10</span>
                      )}
                    </button>
                  ))}
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
          </div>
        </div>
      </div>

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
          {selectedProduct ? `${selectedProductName} - 日次売上推移` : "日次売上・広告費推移"}
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
                    <p className="text-sm mt-2">Qoo10コードが設定されていないか、指定期間に注文がありません</p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={productSalesData}
                  margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#6b7280", fontSize: 12 }}
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      return `${date.getMonth() + 1}/${date.getDate()}`;
                    }}
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
                        return (
                          <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                            <p className="font-semibold text-gray-700 mb-2">{label}</p>
                            <p style={{ color: MALL_COLORS.qoo10 }} className="text-sm">
                              Qoo10: {formatCurrency(payload[0]?.value as number || 0)}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar
                    dataKey="sales"
                    fill={MALL_COLORS.qoo10}
                    barSize={30}
                    radius={[4, 4, 0, 0]}
                  />
                </ComposedChart>
              </ResponsiveContainer>

              {/* カスタム凡例 */}
              <div className="flex flex-wrap justify-center gap-4 mt-2 text-sm">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: MALL_COLORS.qoo10 }} />
                  <span>Qoo10</span>
                </div>
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
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#6b7280", fontSize: 12 }}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return `${date.getMonth() + 1}/${date.getDate()}`;
                  }}
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

                {/* 売上棒グラフ（積み上げ式）- 凡例の順: Amazon, 楽天, Qoo10 */}
                {selectedMalls.amazon && (
                  <Bar
                    yAxisId="sales"
                    dataKey="amazon"
                    stackId="sales"
                    fill={MALL_COLORS.amazon}
                    barSize={30}
                  />
                )}
                {selectedMalls.rakuten && (
                  <Bar
                    yAxisId="sales"
                    dataKey="rakuten"
                    stackId="sales"
                    fill={MALL_COLORS.rakuten}
                    barSize={30}
                  />
                )}
                {selectedMalls.qoo10 && (
                  <Bar
                    yAxisId="sales"
                    dataKey="qoo10"
                    stackId="sales"
                    fill={MALL_COLORS.qoo10}
                    barSize={30}
                    radius={[4, 4, 0, 0]}
                  />
                )}

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
      </div>
    </div>
  );
}
