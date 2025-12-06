"use client";

import { useState, useEffect, useMemo } from "react";
import { ChevronDown, ChevronUp, RefreshCw, User, Eye, Heart, MessageCircle, Share2, Play, ExternalLink, ArrowUpDown } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const BACKEND_URL = "https://mall-batch-manager-983678294034.asia-northeast1.run.app";

// 期間オプション
const PERIOD_OPTIONS = [
  { label: "過去7日間", value: "7days", days: 7 },
  { label: "過去14日間", value: "14days", days: 14 },
  { label: "過去30日間", value: "30days", days: 30 },
  { label: "今月", value: "this_month", days: 0 },
  { label: "先月", value: "last_month", days: 0 },
];

// アカウントごとの色
const ACCOUNT_COLORS = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7",
  "#DDA0DD", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E9",
];

interface RegisteredProduct {
  id: string;
  productName: string;
  skuName?: string;
}

interface AccountChartData {
  accountId: string;
  accountName: string;
  avatarUrl: string;
  dailyData: {
    date: string;
    views: number;
    likes: number;
    comments: number;
    shares: number;
  }[];
}

interface AccountSummary {
  accountId: string;
  accountName: string;
  avatarUrl: string;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  videoCount: number;
  engagementRate: number;
}

interface VideoData {
  videoId: string;
  title: string;
  coverImageUrl: string;
  shareUrl: string;
  createTime: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  accountId?: string;
  accountName?: string;
}

// ソート用の型
type SortField = "viewCount" | "likeCount" | "commentCount" | "shareCount" | "createTime";
type SortOrder = "asc" | "desc";

// 数値をフォーマット（K/M表記）
function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toLocaleString();
}

// 日付計算
function getDateRange(periodValue: string): { startDate: string; endDate: string } {
  const today = new Date();
  const endDate = today.toISOString().split("T")[0];

  if (periodValue === "this_month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { startDate: start.toISOString().split("T")[0], endDate };
  }

  if (periodValue === "last_month") {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 0);
    return {
      startDate: start.toISOString().split("T")[0],
      endDate: end.toISOString().split("T")[0],
    };
  }

  const option = PERIOD_OPTIONS.find((o) => o.value === periodValue);
  const days = option?.days || 7;
  const start = new Date();
  start.setDate(start.getDate() - days + 1);
  return { startDate: start.toISOString().split("T")[0], endDate };
}

export default function VideoAnalyticsPage() {
  const [products, setProducts] = useState<RegisteredProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);

  const [selectedPeriod, setSelectedPeriod] = useState("7days");
  const [isPeriodDropdownOpen, setIsPeriodDropdownOpen] = useState(false);

  const [chartData, setChartData] = useState<AccountChartData[]>([]);
  const [summaries, setSummaries] = useState<AccountSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 全動画一覧
  const [allVideos, setAllVideos] = useState<VideoData[]>([]);
  const [isLoadingAllVideos, setIsLoadingAllVideos] = useState(false);

  // ソート設定
  const [sortField, setSortField] = useState<SortField>("viewCount");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // 商品一覧を取得
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const q = query(collection(db, "registered_products"), orderBy("productName"));
        const snapshot = await getDocs(q);
        const productList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as RegisteredProduct[];
        setProducts(productList);
      } catch (error) {
        console.error("商品一覧取得エラー:", error);
      }
    };
    fetchProducts();
  }, []);

  // データ取得
  const fetchAnalyticsData = async () => {
    if (!selectedProductId) return;

    setIsLoading(true);
    setIsLoadingAllVideos(true);
    const { startDate, endDate } = getDateRange(selectedPeriod);

    try {
      // 日次データ、サマリー、全動画を並列取得
      const [chartRes, summaryRes, videosRes] = await Promise.all([
        fetch(`${BACKEND_URL}/tiktok/analytics/${selectedProductId}?startDate=${startDate}&endDate=${endDate}`),
        fetch(`${BACKEND_URL}/tiktok/analytics/summary/${selectedProductId}?startDate=${startDate}&endDate=${endDate}`),
        fetch(`${BACKEND_URL}/tiktok/analytics/all-videos/${selectedProductId}`),
      ]);

      const chartJson = await chartRes.json();
      const summaryJson = await summaryRes.json();
      const videosJson = await videosRes.json();

      if (chartJson.success) {
        setChartData(chartJson.accounts || []);
      }
      if (summaryJson.success) {
        setSummaries(summaryJson.summaries || []);
      }
      if (videosJson.success) {
        setAllVideos(videosJson.videos || []);
      }
    } catch (error) {
      console.error("分析データ取得エラー:", error);
    } finally {
      setIsLoading(false);
      setIsLoadingAllVideos(false);
    }
  };

  // 商品または期間が変わったらデータ再取得
  useEffect(() => {
    if (selectedProductId) {
      fetchAnalyticsData();
    }
  }, [selectedProductId, selectedPeriod]);

  // 統計計算
  const stats = useMemo(() => {
    const totalViews = allVideos.reduce((sum, v) => sum + v.viewCount, 0);
    const videos10k = allVideos.filter((v) => v.viewCount >= 10000);
    const videos30k = allVideos.filter((v) => v.viewCount >= 30000);
    const views10k = videos10k.reduce((sum, v) => sum + v.viewCount, 0);

    return {
      totalViews,
      videoCount: allVideos.length,
      views10k,
      videos10kCount: videos10k.length,
      videos30kCount: videos30k.length,
    };
  }, [allVideos]);

  // ソート済み動画一覧
  const sortedVideos = useMemo(() => {
    return [...allVideos].sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      if (sortField === "createTime") {
        aVal = a.createTime || "";
        bVal = b.createTime || "";
      } else {
        aVal = a[sortField] || 0;
        bVal = b[sortField] || 0;
      }

      if (sortOrder === "asc") {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
  }, [allVideos, sortField, sortOrder]);

  // ソートハンドラ
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  // グラフ用データを整形
  const formattedChartData = chartData.length > 0
    ? chartData[0].dailyData.map((d, index) => {
        const point: { [key: string]: string | number } = { date: d.date.slice(5) }; // MM-DD形式
        chartData.forEach((account) => {
          point[account.accountId] = account.dailyData[index]?.views || 0;
        });
        return point;
      })
    : [];

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const selectedPeriodLabel = PERIOD_OPTIONS.find((o) => o.value === selectedPeriod)?.label;

  // ソートアイコン
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown size={12} className="text-gray-400" />;
    }
    return sortOrder === "asc" ? (
      <ChevronUp size={12} className="text-blue-600" />
    ) : (
      <ChevronDown size={12} className="text-blue-600" />
    );
  };

  return (
    <div className="space-y-6">
      {/* ページヘッダー */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">動画分析</h1>
        <p className="text-gray-600 mt-1">
          TikTokアカウントごとのパフォーマンスを分析
        </p>
      </div>

      {/* フィルター */}
      <div className="flex flex-wrap gap-4">
        {/* 商品選択 */}
        <div className="relative">
          <button
            onClick={() => setIsProductDropdownOpen(!isProductDropdownOpen)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 min-w-[200px]"
          >
            <span className="text-sm text-gray-700">
              {selectedProduct ? selectedProduct.productName : "商品を選択"}
            </span>
            <ChevronDown size={16} className="ml-auto text-gray-500" />
          </button>
          {isProductDropdownOpen && (
            <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {products.map((product) => (
                <button
                  key={product.id}
                  onClick={() => {
                    setSelectedProductId(product.id);
                    setIsProductDropdownOpen(false);
                  }}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 ${
                    selectedProductId === product.id ? "bg-blue-50 text-blue-600" : "text-gray-700"
                  }`}
                >
                  {product.productName}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 期間選択 */}
        <div className="relative">
          <button
            onClick={() => setIsPeriodDropdownOpen(!isPeriodDropdownOpen)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 min-w-[150px]"
          >
            <span className="text-sm text-gray-700">{selectedPeriodLabel}</span>
            <ChevronDown size={16} className="ml-auto text-gray-500" />
          </button>
          {isPeriodDropdownOpen && (
            <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
              {PERIOD_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    setSelectedPeriod(option.value);
                    setIsPeriodDropdownOpen(false);
                  }}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 ${
                    selectedPeriod === option.value ? "bg-blue-50 text-blue-600" : "text-gray-700"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 更新ボタン */}
        <button
          onClick={fetchAnalyticsData}
          disabled={!selectedProductId || isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
          更新
        </button>
      </div>

      {!selectedProductId ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-500">
          <p>商品を選択してください</p>
        </div>
      ) : isLoading ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mx-auto" />
          <p className="mt-4 text-gray-600">データを読み込み中...</p>
        </div>
      ) : (
        <>
          {/* サマリーカード */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow-sm p-4">
              <div className="text-sm text-gray-500 mb-1">総再生数</div>
              <div className="text-2xl font-bold text-gray-800">{formatNumber(stats.totalViews)}</div>
              <div className="text-xs text-gray-400 mt-1">
                うち10K以上: {formatNumber(stats.views10k)}
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4">
              <div className="text-sm text-gray-500 mb-1">動画数</div>
              <div className="text-2xl font-bold text-gray-800">{stats.videoCount}</div>
              <div className="text-xs text-gray-400 mt-1">
                10K以上: {stats.videos10kCount} / 30K以上: {stats.videos30kCount}
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4">
              <div className="text-sm text-gray-500 mb-1">冒頭視聴維持率 1秒</div>
              <div className="text-2xl font-bold text-gray-400">-</div>
              <div className="text-xs text-gray-400 mt-1">（API未対応）</div>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4">
              <div className="text-sm text-gray-500 mb-1">冒頭視聴維持率 2秒</div>
              <div className="text-2xl font-bold text-gray-400">-</div>
              <div className="text-xs text-gray-400 mt-1">（API未対応）</div>
            </div>
          </div>

          {/* 日次再生数推移グラフ */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">
              アカウント別 Daily再生数推移
            </h2>
            {formattedChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={formattedChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => formatNumber(v)} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: number) => [formatNumber(value), "再生数"]}
                    labelFormatter={(label) => `日付: ${label}`}
                  />
                  <Legend />
                  {chartData.map((account, index) => (
                    <Line
                      key={account.accountId}
                      type="monotone"
                      dataKey={account.accountId}
                      name={account.accountName}
                      stroke={ACCOUNT_COLORS[index % ACCOUNT_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-500">
                データがありません
              </div>
            )}
          </div>

          {/* アカウント別サマリー表 */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">
              アカウント別サマリー
            </h2>
            {summaries.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                        アカウント
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">
                        <span className="flex items-center justify-end gap-1">
                          <Eye size={14} /> 総再生数
                        </span>
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">
                        <span className="flex items-center justify-end gap-1">
                          <Heart size={14} /> いいね
                        </span>
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">
                        <span className="flex items-center justify-end gap-1">
                          <MessageCircle size={14} /> コメント
                        </span>
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">
                        <span className="flex items-center justify-end gap-1">
                          <Share2 size={14} /> シェア
                        </span>
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">
                        <span className="flex items-center justify-end gap-1">
                          <Play size={14} /> 動画数
                        </span>
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">
                        ER%
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaries.map((summary, index) => (
                      <tr
                        key={summary.accountId}
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{
                                backgroundColor: ACCOUNT_COLORS[index % ACCOUNT_COLORS.length],
                              }}
                            />
                            {summary.avatarUrl ? (
                              <img
                                src={summary.avatarUrl}
                                alt={summary.accountName}
                                className="w-8 h-8 rounded-full"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                                <User size={16} className="text-gray-500" />
                              </div>
                            )}
                            <span className="font-medium text-gray-800">
                              {summary.accountName}
                            </span>
                          </div>
                        </td>
                        <td className="text-right py-3 px-4 text-gray-700 font-medium">
                          {formatNumber(summary.totalViews)}
                        </td>
                        <td className="text-right py-3 px-4 text-gray-700">
                          {formatNumber(summary.totalLikes)}
                        </td>
                        <td className="text-right py-3 px-4 text-gray-700">
                          {formatNumber(summary.totalComments)}
                        </td>
                        <td className="text-right py-3 px-4 text-gray-700">
                          {formatNumber(summary.totalShares)}
                        </td>
                        <td className="text-right py-3 px-4 text-gray-700">
                          {summary.videoCount}
                        </td>
                        <td className="text-right py-3 px-4 text-gray-700">
                          {summary.engagementRate.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-8 text-center text-gray-500">
                アカウントデータがありません
              </div>
            )}
          </div>

          {/* 動画一覧テーブル */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">
              動画一覧（{sortedVideos.length}件）
            </h2>
            {isLoadingAllVideos ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
              </div>
            ) : sortedVideos.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-2 text-sm font-medium text-gray-600 w-12">
                        #
                      </th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-gray-600">
                        動画
                      </th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-gray-600">
                        アカウント
                      </th>
                      <th
                        className="text-right py-3 px-2 text-sm font-medium text-gray-600 cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort("viewCount")}
                      >
                        <span className="flex items-center justify-end gap-1">
                          <Eye size={12} /> 再生数 <SortIcon field="viewCount" />
                        </span>
                      </th>
                      <th
                        className="text-right py-3 px-2 text-sm font-medium text-gray-600 cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort("likeCount")}
                      >
                        <span className="flex items-center justify-end gap-1">
                          <Heart size={12} /> いいね <SortIcon field="likeCount" />
                        </span>
                      </th>
                      <th
                        className="text-right py-3 px-2 text-sm font-medium text-gray-600 cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort("commentCount")}
                      >
                        <span className="flex items-center justify-end gap-1">
                          <MessageCircle size={12} /> コメント <SortIcon field="commentCount" />
                        </span>
                      </th>
                      <th
                        className="text-right py-3 px-2 text-sm font-medium text-gray-600 cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort("shareCount")}
                      >
                        <span className="flex items-center justify-end gap-1">
                          <Share2 size={12} /> シェア <SortIcon field="shareCount" />
                        </span>
                      </th>
                      <th className="text-center py-3 px-2 text-sm font-medium text-gray-600">
                        1秒維持
                      </th>
                      <th className="text-center py-3 px-2 text-sm font-medium text-gray-600">
                        2秒維持
                      </th>
                      <th
                        className="text-right py-3 px-2 text-sm font-medium text-gray-600 cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort("createTime")}
                      >
                        <span className="flex items-center justify-end gap-1">
                          投稿日 <SortIcon field="createTime" />
                        </span>
                      </th>
                      <th className="py-3 px-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedVideos.map((video, index) => (
                      <tr
                        key={video.videoId}
                        className={`border-b border-gray-100 hover:bg-gray-50 ${
                          video.viewCount >= 30000
                            ? "bg-yellow-50"
                            : video.viewCount >= 10000
                            ? "bg-blue-50"
                            : ""
                        }`}
                      >
                        <td className="py-2 px-2 text-sm text-gray-500">{index + 1}</td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-2">
                            {video.coverImageUrl ? (
                              <img
                                src={video.coverImageUrl}
                                alt=""
                                className="w-10 h-14 object-cover rounded"
                              />
                            ) : (
                              <div className="w-10 h-14 bg-gray-200 rounded flex items-center justify-center">
                                <Play size={16} className="text-gray-400" />
                              </div>
                            )}
                            <div className="min-w-0 max-w-[200px]">
                              <p className="text-sm font-medium text-gray-800 truncate">
                                {video.title || "（タイトルなし）"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-2 px-2 text-sm text-gray-600">
                          {video.accountName || "-"}
                        </td>
                        <td className="text-right py-2 px-2 text-sm font-medium text-gray-800">
                          {formatNumber(video.viewCount)}
                        </td>
                        <td className="text-right py-2 px-2 text-sm text-gray-700">
                          {formatNumber(video.likeCount)}
                        </td>
                        <td className="text-right py-2 px-2 text-sm text-gray-700">
                          {formatNumber(video.commentCount)}
                        </td>
                        <td className="text-right py-2 px-2 text-sm text-gray-700">
                          {formatNumber(video.shareCount)}
                        </td>
                        <td className="text-center py-2 px-2 text-sm text-gray-400">-</td>
                        <td className="text-center py-2 px-2 text-sm text-gray-400">-</td>
                        <td className="text-right py-2 px-2 text-xs text-gray-500">
                          {video.createTime
                            ? new Date(video.createTime).toLocaleDateString("ja-JP")
                            : "-"}
                        </td>
                        <td className="py-2 px-2">
                          {video.shareUrl && (
                            <a
                              href={video.shareUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 text-gray-400 hover:text-pink-500"
                            >
                              <ExternalLink size={14} />
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-8 text-center text-gray-500">
                動画データがありません
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
