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
import { TrendingUp, Megaphone, Share2, ChevronDown } from "lucide-react";
import {
  getMockSalesData,
  getDefaultDateRange,
  calculateTotalSales,
  calculateTotalAdCost,
  calculateTotalExternalAdCost,
  formatCurrency,
  mockRegisteredProducts,
} from "@/lib/mockData";

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

export default function DashboardPage() {
  const defaultRange = getDefaultDateRange();

  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
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

  // 選択中の商品名を取得
  const selectedProductName = selectedProduct
    ? mockRegisteredProducts.find((p) => p.id === selectedProduct)?.productName || ""
    : "全商品";

  // 売上データを取得
  const salesData = useMemo(() => {
    return getMockSalesData(startDate, endDate);
  }, [startDate, endDate]);

  // グラフ用データ（広告費合計を追加）
  const chartData = useMemo(() => {
    return salesData.map((day) => {
      let totalAd = 0;
      if (showAdCost.amazon) totalAd += day.amazonAd;
      if (showAdCost.rakuten) totalAd += day.rakutenAd;
      if (showAdCost.qoo10) totalAd += day.qoo10Ad;
      return {
        ...day,
        totalAd,
      };
    });
  }, [salesData, showAdCost]);

  // 合計売上を計算
  const totalSales = useMemo(() => {
    return calculateTotalSales(salesData, selectedMalls);
  }, [salesData, selectedMalls]);

  // 合計広告費を計算
  const totalAdCost = useMemo(() => {
    return calculateTotalAdCost(salesData, showAdCost);
  }, [salesData, showAdCost]);

  // 外部広告費合計を計算
  const totalExternalAdCost = useMemo(() => {
    return calculateTotalExternalAdCost(salesData, showExternalAd);
  }, [salesData, showExternalAd]);

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

  return (
    <div className="space-y-4">
      {/* ページタイトル */}
      <div>
        <h1 className="text-xl font-bold text-gray-800">ダッシュボード</h1>
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
                    onClick={() => {
                      setSelectedProduct("");
                      setIsProductDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${selectedProduct === "" ? "bg-blue-100 font-medium" : ""}`}
                  >
                    全商品
                  </button>
                  {mockRegisteredProducts.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => {
                        setSelectedProduct(product.id);
                        setIsProductDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${selectedProduct === product.id ? "bg-blue-100 font-medium" : ""}`}
                    >
                      {product.productName}
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
          日次売上・広告費推移
        </h2>

        {chartData.length === 0 ? (
          <div className="h-72 flex items-center justify-center text-gray-500">
            データがありません
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
