"use client";

import { useState, useEffect, useMemo } from "react";
import { ChevronDown, ChevronUp, RefreshCw, User, Eye, Heart, MessageCircle, Share2, Play, ExternalLink, ArrowUpDown, X, Flag } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, orderBy, where } from "firebase/firestore";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Area,
} from "recharts";

const BACKEND_URL = "https://mall-batch-manager-backend-983678294034.asia-northeast1.run.app";

// デフォルト開始日を取得（スナップショット保存開始日）
function getDefaultStartDate(): string {
  return "2025-12-01";
}

// デフォルト終了日を取得（本日）
function getDefaultEndDate(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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
  retention1s: number | null;
  retention2s: number | null;
  fullVideoWatchedRate: number | null;
  accountId?: string;
  accountName?: string;
}

interface DailyTrendData {
  date: string;
  views: number;
  videoCount: number;
  engagementRate: number;
  qoo10Sales: number;
  rakutenSales: number;
  amazonSales: number;
  totalSales: number;
}

// イベントフラグの型
interface EventFlag {
  id: string;
  name: string;
  date: string;
  description: string;
}

// ソート用の型
type SortField = "viewCount" | "retention1s" | "retention2s" | "fullVideoWatchedRate" | "engagementRate" | "likeCount" | "commentCount" | "shareCount" | "createTime";
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

export default function VideoAnalyticsPage() {
  const [products, setProducts] = useState<RegisteredProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);

  // 日付範囲（初期値は当月）
  const [startDate, setStartDate] = useState(getDefaultStartDate);
  const [endDate, setEndDate] = useState(getDefaultEndDate);

  const [chartData, setChartData] = useState<AccountChartData[]>([]);
  const [summaries, setSummaries] = useState<AccountSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 日次推移データ
  const [dailyTrendData, setDailyTrendData] = useState<DailyTrendData[]>([]);

  // 全動画一覧
  const [allVideos, setAllVideos] = useState<VideoData[]>([]);
  const [isLoadingAllVideos, setIsLoadingAllVideos] = useState(false);

  // ソート設定
  const [sortField, setSortField] = useState<SortField>("viewCount");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // 動画詳細モーダル
  const [selectedVideo, setSelectedVideo] = useState<VideoData | null>(null);
  const [videoDetailRawData, setVideoDetailRawData] = useState<{ date: string; views: number; likes: number; comments: number; shares: number }[]>([]);
  const [isLoadingVideoDetail, setIsLoadingVideoDetail] = useState(false);
  const [showMallSales, setShowMallSales] = useState(false);
  const [showEngagement, setShowEngagement] = useState(false);
  const [videoSalesData, setVideoSalesData] = useState<{ [date: string]: { amazon: number; rakuten: number; qoo10: number } }>({});
  const [videoDetailStartDate, setVideoDetailStartDate] = useState("");
  const [videoDetailEndDate, setVideoDetailEndDate] = useState("");

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
        // デモ商品を先頭にソート
        productList.sort((a, b) => {
          const aIsDemo = a.productName.includes("デモ") || a.id.includes("demo") ? -1 : 0;
          const bIsDemo = b.productName.includes("デモ") || b.id.includes("demo") ? -1 : 0;
          return aIsDemo - bIsDemo;
        });
        setProducts(productList);
      } catch (error) {
        console.error("商品一覧取得エラー:", error);
      }
    };
    fetchProducts();
  }, []);

  // イベントフラグ取得
  useEffect(() => {
    const fetchFlags = async () => {
      try {
        const snapshot = await getDocs(collection(db, "event_flags"));
        const flags = snapshot.docs.map((doc) => ({
          id: doc.id,
          name: doc.data().name || "",
          date: doc.data().date || "",
          description: doc.data().description || "",
        })) as EventFlag[];
        flags.sort((a, b) => b.date.localeCompare(a.date));
        setEventFlags(flags);
      } catch (err) {
        console.error("フラグ取得エラー:", err);
      }
    };
    fetchFlags();
  }, []);

  // データ取得（Firestoreから直接読み取り）
  const fetchAnalyticsData = async () => {
    if (!selectedProductId) return;

    setIsLoading(true);
    setIsLoadingAllVideos(true);

    try {
      // 1. アカウント取得
      const accountsSnapshot = await getDocs(
        query(collection(db, "tiktok_accounts"), where("productId", "==", selectedProductId))
      );
      const accounts = accountsSnapshot.docs
        .filter((doc) => doc.data().hidden !== true)
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

      const accountsMap = new Map<string, { name: string; avatar: string }>();
      for (const acc of accounts) {
        accountsMap.set(acc.id, {
          name: (acc as any).tiktokUserName || "Unknown",
          avatar: (acc as any).tiktokAvatarUrl || "",
        });
      }

      // 2. 全動画取得
      const videosAll: VideoData[] = [];
      for (const [accountId, accountInfo] of Array.from(accountsMap)) {
        const videosSnapshot = await getDocs(
          query(collection(db, "tiktok_videos"), where("accountId", "==", accountId))
        );
        for (const doc of videosSnapshot.docs) {
          const d = doc.data();
          videosAll.push({
            videoId: d.videoId || doc.id,
            title: d.title || "",
            coverImageUrl: d.coverImageUrl || "",
            shareUrl: d.shareUrl || "",
            createTime: typeof d.createTime === "string" ? d.createTime : d.createTime?.toDate?.()?.toISOString() || null,
            viewCount: d.viewCount || 0,
            likeCount: d.likeCount || 0,
            commentCount: d.commentCount || 0,
            shareCount: d.shareCount || 0,
            retention1s: d.retention1s ?? null,
            retention2s: d.retention2s ?? null,
            fullVideoWatchedRate: d.fullVideoWatchedRate ?? null,
            accountId,
            accountName: accountInfo.name,
          });
        }
      }
      videosAll.sort((a, b) => b.viewCount - a.viewCount);
      setAllVideos(videosAll);

      // 3. アカウント別サマリー計算
      const summaryList: AccountSummary[] = [];
      for (const [accountId, accountInfo] of Array.from(accountsMap)) {
        const accountVideos = videosAll.filter((v) => v.accountId === accountId);
        const totalViews = accountVideos.reduce((s, v) => s + v.viewCount, 0);
        const totalLikes = accountVideos.reduce((s, v) => s + v.likeCount, 0);
        const totalComments = accountVideos.reduce((s, v) => s + v.commentCount, 0);
        const totalShares = accountVideos.reduce((s, v) => s + v.shareCount, 0);
        summaryList.push({
          accountId,
          accountName: accountInfo.name,
          avatarUrl: accountInfo.avatar,
          totalViews,
          totalLikes,
          totalComments,
          totalShares,
          videoCount: accountVideos.length,
          engagementRate: totalViews > 0 ? ((totalLikes + totalComments + totalShares) / totalViews) * 100 : 0,
        });
      }
      setSummaries(summaryList);

      // 4. 日次推移データ（スナップショットから差分計算）
      const prevDay = new Date(startDate);
      prevDay.setDate(prevDay.getDate() - 1);
      const prevDayStr = prevDay.toISOString().split("T")[0];

      // productIdのみでクエリし、日付はクライアント側でフィルタ（複合インデックス不要）
      const snapshotsSnapshot = await getDocs(
        query(
          collection(db, "tiktok_video_daily_snapshots"),
          where("productId", "==", selectedProductId)
        )
      );

      const snapshotsByDate: { [date: string]: { views: number; likes: number; comments: number; shares: number } } = {};
      for (const doc of snapshotsSnapshot.docs) {
        const snap = doc.data();
        const date = snap.date;
        if (date < prevDayStr || date > endDate) continue;
        if (!snapshotsByDate[date]) {
          snapshotsByDate[date] = { views: 0, likes: 0, comments: 0, shares: 0 };
        }
        snapshotsByDate[date].views += snap.viewCount || 0;
        snapshotsByDate[date].likes += snap.likeCount || 0;
        snapshotsByDate[date].comments += snap.commentCount || 0;
        snapshotsByDate[date].shares += snap.shareCount || 0;
      }

      // 投稿日別の動画数
      const videoPostsByDate: { [date: string]: number } = {};
      for (const v of videosAll) {
        if (v.createTime) {
          const postDate = v.createTime.split("T")[0];
          if (postDate >= startDate && postDate <= endDate) {
            videoPostsByDate[postDate] = (videoPostsByDate[postDate] || 0) + 1;
          }
        }
      }

      // 売上データ取得
      const salesDailyMap: { [date: string]: { qoo10Sales: number; rakutenSales: number; amazonSales: number; totalSales: number } } = {};

      try {
        const amazonSnapshot = await getDocs(
          query(collection(db, "amazon_daily_sales"), where("productId", "==", selectedProductId))
        );
        for (const doc of amazonSnapshot.docs) {
          const d = doc.data();
          if (d.date >= startDate && d.date <= endDate) {
            if (!salesDailyMap[d.date]) salesDailyMap[d.date] = { qoo10Sales: 0, rakutenSales: 0, amazonSales: 0, totalSales: 0 };
            salesDailyMap[d.date].amazonSales += d.sales || d.salesAmount || 0;
          }
        }
      } catch (e) { console.log("amazon sales error:", e); }

      try {
        const rakutenSnapshot = await getDocs(
          query(collection(db, "rakuten_daily_sales"), where("productId", "==", selectedProductId))
        );
        for (const doc of rakutenSnapshot.docs) {
          const d = doc.data();
          if (d.date >= startDate && d.date <= endDate) {
            if (!salesDailyMap[d.date]) salesDailyMap[d.date] = { qoo10Sales: 0, rakutenSales: 0, amazonSales: 0, totalSales: 0 };
            salesDailyMap[d.date].rakutenSales += d.sales || d.salesAmount || 0;
          }
        }
      } catch (e) { console.log("rakuten sales error:", e); }

      try {
        const qoo10Snapshot = await getDocs(
          query(collection(db, "product_sales"), where("productId", "==", selectedProductId))
        );
        for (const doc of qoo10Snapshot.docs) {
          const d = doc.data();
          if (d.date >= startDate && d.date <= endDate) {
            if (!salesDailyMap[d.date]) salesDailyMap[d.date] = { qoo10Sales: 0, rakutenSales: 0, amazonSales: 0, totalSales: 0 };
            salesDailyMap[d.date].qoo10Sales += d.sales || 0;
          }
        }
      } catch (e) { console.log("qoo10 sales error:", e); }

      for (const date of Object.keys(salesDailyMap)) {
        const s = salesDailyMap[date];
        s.totalSales = s.qoo10Sales + s.rakutenSales + s.amazonSales;
      }

      // 日付リスト生成
      const dateList: string[] = [];
      const cur = new Date(startDate);
      const endObj = new Date(endDate);
      while (cur <= endObj) {
        dateList.push(cur.toISOString().split("T")[0]);
        cur.setDate(cur.getDate() + 1);
      }

      // 差分計算
      const dailyData: DailyTrendData[] = dateList.map((date, index) => {
        const prevDate = index === 0 ? prevDayStr : dateList[index - 1];
        const todaySnap = snapshotsByDate[date] || { views: 0, likes: 0, comments: 0, shares: 0 };
        const prevSnap = snapshotsByDate[prevDate] || { views: 0, likes: 0, comments: 0, shares: 0 };

        const diffViews = Math.max(0, todaySnap.views - prevSnap.views);
        const diffLikes = Math.max(0, todaySnap.likes - prevSnap.likes);
        const diffComments = Math.max(0, todaySnap.comments - prevSnap.comments);
        const diffShares = Math.max(0, todaySnap.shares - prevSnap.shares);
        const er = diffViews > 0 ? ((diffLikes + diffComments + diffShares) / diffViews) * 100 : 0;

        const sales = salesDailyMap[date] || { qoo10Sales: 0, rakutenSales: 0, amazonSales: 0, totalSales: 0 };

        return {
          date,
          views: diffViews,
          videoCount: videoPostsByDate[date] || 0,
          engagementRate: parseFloat(er.toFixed(2)),
          qoo10Sales: sales.qoo10Sales,
          rakutenSales: sales.rakutenSales,
          amazonSales: sales.amazonSales,
          totalSales: sales.totalSales,
        };
      });

      setDailyTrendData(dailyData);
    } catch (error) {
      console.error("分析データ取得エラー:", error);
    } finally {
      setIsLoading(false);
      setIsLoadingAllVideos(false);
    }
  };

  // 商品または日付が変わったらデータ再取得
  useEffect(() => {
    if (selectedProductId) {
      fetchAnalyticsData();
    }
  }, [selectedProductId, startDate, endDate]);

  // イベントフラグ
  const [eventFlags, setEventFlags] = useState<EventFlag[]>([]);
  const [showFlags, setShowFlags] = useState(true);
  const [selectedFlag, setSelectedFlag] = useState<EventFlag | null>(null);

  // Daily推移の表示トグル
  const [showDailyMetrics, setShowDailyMetrics] = useState({
    views: true,
    videoCount: true,
    er: true,
    amazon: false,
    rakuten: false,
    qoo10: false,
  });

  // エンゲージメント同期中フラグ
  const [isSyncingEngagements, setIsSyncingEngagements] = useState(false);

  // エンゲージメント同期
  const handleSyncEngagements = async () => {
    if (!selectedProductId || isSyncingEngagements) return;
    setIsSyncingEngagements(true);
    try {
      const res = await fetch(`${BACKEND_URL}/tiktok/sync-all-engagements/${selectedProductId}`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.success) {
        alert(`${json.totalUpdated}件のエンゲージメントを同期しました`);
        fetchAnalyticsData(); // データ再取得
      } else {
        alert(`同期エラー: ${json.message}`);
      }
    } catch (error) {
      console.error("Sync error:", error);
      alert("同期に失敗しました");
    } finally {
      setIsSyncingEngagements(false);
    }
  };

  // 動画詳細を開く
  const handleVideoClick = async (video: VideoData) => {
    setSelectedVideo(video);
    setIsLoadingVideoDetail(true);
    setShowMallSales(false);
    setShowEngagement(false);
    setVideoSalesData({});

    // デフォルト期間: 投稿日〜今日
    const postDate = video.createTime ? video.createTime.split("T")[0] : "2025-12-01";
    const today = new Date().toISOString().split("T")[0];
    setVideoDetailStartDate(postDate);
    setVideoDetailEndDate(today);

    try {
      // この動画のスナップショットを取得
      const snapshotsSnapshot = await getDocs(
        query(
          collection(db, "tiktok_video_daily_snapshots"),
          where("videoId", "==", video.videoId)
        )
      );

      // 日付順にソート（フルの日付を保持）
      const snapsByDate: { [date: string]: { views: number; likes: number; comments: number; shares: number } } = {};
      for (const doc of snapshotsSnapshot.docs) {
        const d = doc.data();
        snapsByDate[d.date] = {
          views: d.viewCount || 0,
          likes: d.likeCount || 0,
          comments: d.commentCount || 0,
          shares: d.shareCount || 0,
        };
      }

      // 日付順にソートして差分計算（フル日付を保持）
      const dates = Object.keys(snapsByDate).sort();
      const dailyDiffs: { date: string; views: number; likes: number; comments: number; shares: number }[] = [];

      for (let i = 0; i < dates.length; i++) {
        const date = dates[i];
        const todaySnap = snapsByDate[date];
        const prev = i > 0 ? snapsByDate[dates[i - 1]] : { views: 0, likes: 0, comments: 0, shares: 0 };

        dailyDiffs.push({
          date, // YYYY-MM-DD
          views: Math.max(0, todaySnap.views - prev.views),
          likes: Math.max(0, todaySnap.likes - prev.likes),
          comments: Math.max(0, todaySnap.comments - prev.comments),
          shares: Math.max(0, todaySnap.shares - prev.shares),
        });
      }

      setVideoDetailRawData(dailyDiffs);

      // 売上データも事前に取得
      if (selectedProductId) {
        const salesMap: { [date: string]: { amazon: number; rakuten: number; qoo10: number } } = {};

        try {
          const [amazonSnap, rakutenSnap, qoo10Snap] = await Promise.all([
            getDocs(query(collection(db, "amazon_daily_sales"), where("productId", "==", selectedProductId))),
            getDocs(query(collection(db, "rakuten_daily_sales"), where("productId", "==", selectedProductId))),
            getDocs(query(collection(db, "product_sales"), where("productId", "==", selectedProductId))),
          ]);

          for (const doc of amazonSnap.docs) {
            const d = doc.data();
            if (!salesMap[d.date]) salesMap[d.date] = { amazon: 0, rakuten: 0, qoo10: 0 };
            salesMap[d.date].amazon += d.sales || d.salesAmount || 0;
          }
          for (const doc of rakutenSnap.docs) {
            const d = doc.data();
            if (!salesMap[d.date]) salesMap[d.date] = { amazon: 0, rakuten: 0, qoo10: 0 };
            salesMap[d.date].rakuten += d.sales || d.salesAmount || 0;
          }
          for (const doc of qoo10Snap.docs) {
            const d = doc.data();
            if (!salesMap[d.date]) salesMap[d.date] = { amazon: 0, rakuten: 0, qoo10: 0 };
            salesMap[d.date].qoo10 += d.sales || 0;
          }
        } catch (e) {
          console.log("Sales fetch error:", e);
        }

        setVideoSalesData(salesMap);
      }
    } catch (error) {
      console.error("動画詳細取得エラー:", error);
    } finally {
      setIsLoadingVideoDetail(false);
    }
  };

  // モーダル用グラフデータ（期間フィルタ適用）
  const videoDetailChartData = useMemo(() => {
    return videoDetailRawData
      .filter((d) => d.date >= videoDetailStartDate && d.date <= videoDetailEndDate)
      .map((d) => {
        const sales = videoSalesData[d.date];
        return {
          label: d.date.slice(5), // MM-DD表示用
          views: d.views,
          likes: d.likes,
          comments: d.comments,
          shares: d.shares,
          amazon: sales?.amazon || 0,
          rakuten: sales?.rakuten || 0,
          qoo10: sales?.qoo10 || 0,
        };
      });
  }, [videoDetailRawData, videoSalesData, videoDetailStartDate, videoDetailEndDate]);

  // 統計計算
  const stats = useMemo(() => {
    const totalViews = allVideos.reduce((sum, v) => sum + v.viewCount, 0);
    const videos10k = allVideos.filter((v) => v.viewCount >= 10000);
    const videos30k = allVideos.filter((v) => v.viewCount >= 30000);
    const views10k = videos10k.reduce((sum, v) => sum + v.viewCount, 0);

    // 視聴完了率計算（データがあるものだけ - 0も有効な値として扱う）
    const videosWithFullWatchedRate = allVideos.filter((v) => v.fullVideoWatchedRate !== null && v.fullVideoWatchedRate !== undefined);
    const avgFullVideoWatchedRate = videosWithFullWatchedRate.length > 0
      ? videosWithFullWatchedRate.reduce((sum, v) => sum + (v.fullVideoWatchedRate ?? 0), 0) / videosWithFullWatchedRate.length
      : null;

    // エンゲージメント率計算: (likes + comments + shares) / views
    const totalLikes = allVideos.reduce((sum, v) => sum + v.likeCount, 0);
    const totalComments = allVideos.reduce((sum, v) => sum + v.commentCount, 0);
    const totalShares = allVideos.reduce((sum, v) => sum + v.shareCount, 0);
    const avgEngagementRate = totalViews > 0
      ? ((totalLikes + totalComments + totalShares) / totalViews) * 100
      : 0;

    return {
      totalViews,
      videoCount: allVideos.length,
      views10k,
      videos10kCount: videos10k.length,
      videos30kCount: videos30k.length,
      avgFullVideoWatchedRate,
      avgEngagementRate,
    };
  }, [allVideos]);

  // エンゲージメント率を計算するヘルパー関数
  const calcEngagementRate = (video: VideoData): number => {
    if (video.viewCount <= 0) return 0;
    return ((video.likeCount + video.commentCount + video.shareCount) / video.viewCount) * 100;
  };

  // ソート済み動画一覧
  const sortedVideos = useMemo(() => {
    return [...allVideos].sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      if (sortField === "createTime") {
        aVal = a.createTime || "";
        bVal = b.createTime || "";
      } else if (sortField === "engagementRate") {
        aVal = calcEngagementRate(a);
        bVal = calcEngagementRate(b);
      } else if (sortField === "retention1s" || sortField === "retention2s" || sortField === "fullVideoWatchedRate") {
        aVal = a[sortField] ?? -1;
        bVal = b[sortField] ?? -1;
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

  // グラフ用データを整形（日次推移データ）
  // 再生数・ER%は日次スナップショットの差分（当日-前日）、投稿数は投稿日にカウント
  const formattedTrendData = useMemo(() => {
    return dailyTrendData.map((d) => ({
      date: d.date.slice(5), // MM-DD形式
      fullDate: d.date, // YYYY-MM-DD（フラグマッチ用）
      views: d.views,
      videoCount: d.videoCount,
      engagementRate: d.engagementRate,
      amazonSales: d.amazonSales || 0,
      rakutenSales: d.rakutenSales || 0,
      qoo10Sales: d.qoo10Sales || 0,
      totalSales: d.totalSales,
    }));
  }, [dailyTrendData]);

  const selectedProduct = products.find((p) => p.id === selectedProductId);

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
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700"
          />
          <span className="text-gray-500">〜</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700"
          />
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
              <div className="text-sm text-gray-500 mb-1">視聴完了率</div>
              <div className="text-2xl font-bold text-gray-800">
                {stats.avgFullVideoWatchedRate !== null ? `${stats.avgFullVideoWatchedRate.toFixed(1)}%` : "-"}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {stats.avgFullVideoWatchedRate !== null ? "全動画平均" : "同期が必要"}
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4">
              <div className="text-sm text-gray-500 mb-1">エンゲージメント率</div>
              <div className="text-2xl font-bold text-gray-800">
                {stats.avgEngagementRate.toFixed(2)}%
              </div>
              <div className="text-xs text-gray-400 mt-1">
                (いいね+コメント+シェア)÷再生数
              </div>
            </div>
          </div>

          {/* エンゲージメント同期ボタン */}
          <div className="flex justify-end">
            <button
              onClick={handleSyncEngagements}
              disabled={!selectedProductId || isSyncingEngagements}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              <RefreshCw size={16} className={isSyncingEngagements ? "animate-spin" : ""} />
              {isSyncingEngagements ? "同期中..." : "維持率データを同期"}
            </button>
          </div>

          {/* 日次推移グラフ（統合） */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">
              Daily推移
            </h2>

            {/* トグルチェックボックス群 */}
            <div className="flex flex-col md:flex-row gap-6 flex-wrap mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">
                  指標（折れ線）
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showDailyMetrics.views}
                      onChange={() => setShowDailyMetrics((p) => ({ ...p, views: !p.views }))}
                      className="w-4 h-4 rounded"
                      style={{ accentColor: "#3B82F6" }}
                    />
                    <span className="font-medium text-sm" style={{ color: "#3B82F6" }}>再生数</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showDailyMetrics.videoCount}
                      onChange={() => setShowDailyMetrics((p) => ({ ...p, videoCount: !p.videoCount }))}
                      className="w-4 h-4 rounded"
                      style={{ accentColor: "#82ca9d" }}
                    />
                    <span className="font-medium text-sm" style={{ color: "#82ca9d" }}>投稿数</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showDailyMetrics.er}
                      onChange={() => setShowDailyMetrics((p) => ({ ...p, er: !p.er }))}
                      className="w-4 h-4 rounded"
                      style={{ accentColor: "#FF6B6B" }}
                    />
                    <span className="font-medium text-sm" style={{ color: "#FF6B6B" }}>ER%</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">
                  売上（棒グラフ）
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showDailyMetrics.amazon}
                      onChange={() => setShowDailyMetrics((p) => ({ ...p, amazon: !p.amazon }))}
                      className="w-4 h-4 rounded"
                      style={{ accentColor: "#FF9900" }}
                    />
                    <span className="font-medium text-sm" style={{ color: "#FF9900" }}>Amazon</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showDailyMetrics.rakuten}
                      onChange={() => setShowDailyMetrics((p) => ({ ...p, rakuten: !p.rakuten }))}
                      className="w-4 h-4 rounded"
                      style={{ accentColor: "#BF0000" }}
                    />
                    <span className="font-medium text-sm" style={{ color: "#BF0000" }}>楽天</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showDailyMetrics.qoo10}
                      onChange={() => setShowDailyMetrics((p) => ({ ...p, qoo10: !p.qoo10 }))}
                      className="w-4 h-4 rounded"
                      style={{ accentColor: "#3266CC" }}
                    />
                    <span className="font-medium text-sm" style={{ color: "#3266CC" }}>Qoo10</span>
                  </label>
                </div>
              </div>
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

            {formattedTrendData.length > 0 ? (
              <div className="h-72 relative">
              {/* フラグマーカー（グラフの上に重ねて表示） */}
              {showFlags && eventFlags
                .filter(flag => flag.date >= startDate && flag.date <= endDate)
                .map((flag) => {
                  const dataIndex = formattedTrendData.findIndex(d => d.fullDate === flag.date);
                  if (dataIndex === -1) return null;
                  const graphLeftMargin = 55;
                  const graphRightMargin = 55;
                  const position = ((dataIndex + 0.5) / formattedTrendData.length) * 100;
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
                  data={formattedTrendData}
                  margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#6b7280", fontSize: 10 }}
                    interval={0}
                    angle={-45}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis
                    yAxisId="views"
                    tickFormatter={(v) => formatNumber(v)}
                    tick={{ fill: "#6b7280", fontSize: 12 }}
                    orientation="left"
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fill: "#9ca3af", fontSize: 12 }}
                    tickFormatter={(v) => {
                      if (showDailyMetrics.er && !showDailyMetrics.amazon && !showDailyMetrics.rakuten && !showDailyMetrics.qoo10) return `${v}%`;
                      if ((showDailyMetrics.amazon || showDailyMetrics.rakuten || showDailyMetrics.qoo10) && !showDailyMetrics.er) return `¥${formatNumber(v)}`;
                      return `${v}`;
                    }}
                  />
                  <Tooltip
                    content={({ active, payload, label }: any) => {
                      if (!active || !payload || !payload.length) return null;
                      return (
                        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                          <p className="font-semibold text-gray-700 mb-2">日付: {label}</p>
                          {showDailyMetrics.views && (() => {
                            const item = payload.find((p: any) => p.dataKey === "views");
                            return item ? <p style={{ color: "#3B82F6" }} className="text-sm">再生数: {formatNumber(item.value)}</p> : null;
                          })()}
                          {showDailyMetrics.videoCount && (() => {
                            const item = payload.find((p: any) => p.dataKey === "videoCount");
                            return item ? <p style={{ color: "#82ca9d" }} className="text-sm">投稿数: {item.value}本</p> : null;
                          })()}
                          {showDailyMetrics.er && (() => {
                            const item = payload.find((p: any) => p.dataKey === "engagementRate");
                            return item ? <p style={{ color: "#FF6B6B" }} className="text-sm">ER%: {item.value.toFixed(2)}%</p> : null;
                          })()}
                          {(showDailyMetrics.amazon || showDailyMetrics.rakuten || showDailyMetrics.qoo10) && (
                            <div className="mt-2 pt-2 border-t border-gray-100">
                              <p className="text-xs text-gray-500 mb-1">売上</p>
                              {showDailyMetrics.amazon && (() => {
                                const item = payload.find((p: any) => p.dataKey === "amazonSales");
                                return item ? <p style={{ color: "#FF9900" }} className="text-sm">Amazon: ¥{item.value.toLocaleString()}</p> : null;
                              })()}
                              {showDailyMetrics.rakuten && (() => {
                                const item = payload.find((p: any) => p.dataKey === "rakutenSales");
                                return item ? <p style={{ color: "#BF0000" }} className="text-sm">楽天: ¥{item.value.toLocaleString()}</p> : null;
                              })()}
                              {showDailyMetrics.qoo10 && (() => {
                                const item = payload.find((p: any) => p.dataKey === "qoo10Sales");
                                return item ? <p style={{ color: "#3266CC" }} className="text-sm">Qoo10: ¥{item.value.toLocaleString()}</p> : null;
                              })()}
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />

                  {/* 売上棒グラフ（積み上げ） */}
                  <Bar
                    yAxisId="right"
                    dataKey="amazonSales"
                    stackId="sales"
                    fill="#FF9900"
                    barSize={30}
                    hide={!showDailyMetrics.amazon}
                  />
                  <Bar
                    yAxisId="right"
                    dataKey="rakutenSales"
                    stackId="sales"
                    fill="#BF0000"
                    barSize={30}
                    hide={!showDailyMetrics.rakuten}
                  />
                  <Bar
                    yAxisId="right"
                    dataKey="qoo10Sales"
                    stackId="sales"
                    fill="#3266CC"
                    barSize={30}
                    radius={[4, 4, 0, 0]}
                    hide={!showDailyMetrics.qoo10}
                  />

                  {/* 再生数 */}
                  {showDailyMetrics.views && (
                    <Line
                      yAxisId="views"
                      type="monotone"
                      dataKey="views"
                      stroke="#3B82F6"
                      strokeWidth={3}
                      dot={{ fill: "#3B82F6", strokeWidth: 0, r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  )}
                  {/* 投稿数 */}
                  {showDailyMetrics.videoCount && (
                    <Line
                      yAxisId="views"
                      type="monotone"
                      dataKey="videoCount"
                      stroke="#82ca9d"
                      strokeWidth={2}
                      dot={{ fill: "#82ca9d", strokeWidth: 0, r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  )}
                  {/* ER% */}
                  {showDailyMetrics.er && (
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="engagementRate"
                      stroke="#FF6B6B"
                      strokeWidth={2}
                      dot={{ fill: "#FF6B6B", strokeWidth: 0, r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>

              {/* カスタム凡例 */}
              <div className="flex flex-wrap justify-center gap-4 mt-2 text-sm">
                {showDailyMetrics.views && (
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-0.5" style={{ backgroundColor: "#3B82F6" }} />
                    <span>再生数</span>
                  </div>
                )}
                {showDailyMetrics.videoCount && (
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-0.5" style={{ backgroundColor: "#82ca9d" }} />
                    <span>投稿数</span>
                  </div>
                )}
                {showDailyMetrics.er && (
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-0.5" style={{ backgroundColor: "#FF6B6B" }} />
                    <span>ER%</span>
                  </div>
                )}
                {showDailyMetrics.amazon && (
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "#FF9900" }} />
                    <span>Amazon</span>
                  </div>
                )}
                {showDailyMetrics.rakuten && (
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "#BF0000" }} />
                    <span>楽天</span>
                  </div>
                )}
                {showDailyMetrics.qoo10 && (
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "#3266CC" }} />
                    <span>Qoo10</span>
                  </div>
                )}
              </div>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-500">
                データがありません
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
                        className="text-center py-3 px-2 text-sm font-medium text-gray-600 cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort("retention1s")}
                      >
                        <span className="flex items-center justify-center gap-1">
                          1秒維持 <SortIcon field="retention1s" />
                        </span>
                      </th>
                      <th
                        className="text-center py-3 px-2 text-sm font-medium text-gray-600 cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort("retention2s")}
                      >
                        <span className="flex items-center justify-center gap-1">
                          2秒維持 <SortIcon field="retention2s" />
                        </span>
                      </th>
                      <th
                        className="text-center py-3 px-2 text-sm font-medium text-gray-600 cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort("fullVideoWatchedRate")}
                      >
                        <span className="flex items-center justify-center gap-1">
                          完了率 <SortIcon field="fullVideoWatchedRate" />
                        </span>
                      </th>
                      <th
                        className="text-center py-3 px-2 text-sm font-medium text-gray-600 cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort("engagementRate")}
                      >
                        <span className="flex items-center justify-center gap-1">
                          ER% <SortIcon field="engagementRate" />
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
                        onClick={() => handleVideoClick(video)}
                        className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${
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
                                onError={(e) => {
                                  // 画像読み込みエラー時はプレースホルダーに置き換え
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                  target.nextElementSibling?.classList.remove('hidden');
                                }}
                              />
                            ) : null}
                            <div className={`w-10 h-14 bg-gray-200 rounded flex items-center justify-center ${video.coverImageUrl ? 'hidden' : ''}`}>
                              <Play size={16} className="text-gray-400" />
                            </div>
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
                        <td className="text-center py-2 px-2 text-sm text-gray-700">
                          {video.retention1s !== null ? `${video.retention1s.toFixed(1)}%` : "-"}
                        </td>
                        <td className="text-center py-2 px-2 text-sm text-gray-700">
                          {video.retention2s !== null ? `${video.retention2s.toFixed(1)}%` : "-"}
                        </td>
                        <td className="text-center py-2 px-2 text-sm text-gray-700">
                          {video.fullVideoWatchedRate !== null && video.fullVideoWatchedRate !== undefined
                            ? `${video.fullVideoWatchedRate.toFixed(1)}%`
                            : "-"}
                        </td>
                        <td className="text-center py-2 px-2 text-sm text-gray-700">
                          {video.viewCount > 0
                            ? `${(((video.likeCount + video.commentCount + video.shareCount) / video.viewCount) * 100).toFixed(2)}%`
                            : "-"}
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
                              onClick={(e) => e.stopPropagation()}
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

      {/* 動画詳細モーダル */}
      {selectedVideo && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedVideo(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* ヘッダー */}
            <div className="flex items-start justify-between p-6 border-b border-gray-200">
              <div className="flex items-center gap-4 min-w-0">
                {selectedVideo.coverImageUrl ? (
                  <img src={selectedVideo.coverImageUrl} alt="" className="w-12 h-16 object-cover rounded" />
                ) : (
                  <div className="w-12 h-16 bg-gray-200 rounded flex items-center justify-center">
                    <Play size={20} className="text-gray-400" />
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-gray-800 truncate">
                    {selectedVideo.title || "（タイトルなし）"}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {selectedVideo.accountName} / 投稿日: {selectedVideo.createTime ? new Date(selectedVideo.createTime).toLocaleDateString("ja-JP") : "-"}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedVideo(null)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                <X size={20} />
              </button>
            </div>

            {/* サマリー */}
            <div className="grid grid-cols-4 gap-3 p-6 pb-0">
              <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-100">
                <div className="text-xs text-blue-600 mb-1 font-medium">再生数</div>
                <div className="text-xl font-bold text-blue-700">{formatNumber(selectedVideo.viewCount)}</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">いいね</div>
                <div className="text-lg font-bold text-gray-800">{formatNumber(selectedVideo.likeCount)}</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">コメント</div>
                <div className="text-lg font-bold text-gray-800">{formatNumber(selectedVideo.commentCount)}</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">シェア</div>
                <div className="text-lg font-bold text-gray-800">{formatNumber(selectedVideo.shareCount)}</div>
              </div>
            </div>

            {/* グラフ */}
            <div className="p-6">
              {/* 期間選択 + トグルボタン */}
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={videoDetailStartDate}
                    onChange={(e) => setVideoDetailStartDate(e.target.value)}
                    className="px-2 py-1.5 bg-white border border-gray-300 rounded-lg text-xs text-gray-700"
                  />
                  <span className="text-gray-400 text-xs">〜</span>
                  <input
                    type="date"
                    value={videoDetailEndDate}
                    onChange={(e) => setVideoDetailEndDate(e.target.value)}
                    className="px-2 py-1.5 bg-white border border-gray-300 rounded-lg text-xs text-gray-700"
                  />
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    onClick={() => setShowEngagement(!showEngagement)}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                      showEngagement
                        ? "bg-pink-50 border-pink-300 text-pink-700"
                        : "bg-white border-gray-300 text-gray-500 hover:border-gray-400"
                    }`}
                  >
                    <Heart size={12} className="inline mr-1" />
                    エンゲージメント
                  </button>
                  <button
                    onClick={() => setShowMallSales(!showMallSales)}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                      showMallSales
                        ? "bg-orange-50 border-orange-300 text-orange-700"
                        : "bg-white border-gray-300 text-gray-500 hover:border-gray-400"
                    }`}
                  >
                    モール売上
                  </button>
                </div>
              </div>

              {isLoadingVideoDetail ? (
                <div className="h-80 flex items-center justify-center">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                </div>
              ) : videoDetailChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <ComposedChart data={videoDetailChartData}>
                    <defs>
                      <linearGradient id="viewsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis
                      yAxisId="views"
                      tickFormatter={(v) => formatNumber(v)}
                      tick={{ fontSize: 11 }}
                      orientation="left"
                      label={{ value: "再生数", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#3B82F6" } }}
                    />
                    {showEngagement && (
                      <YAxis
                        yAxisId="engagement"
                        tickFormatter={(v) => formatNumber(v)}
                        tick={{ fontSize: 11 }}
                        orientation="right"
                      />
                    )}
                    {showMallSales && (
                      <YAxis
                        yAxisId="sales"
                        tickFormatter={(v) => `¥${formatNumber(v)}`}
                        tick={{ fontSize: 11 }}
                        orientation="right"
                        hide={showEngagement}
                      />
                    )}
                    <Tooltip
                      formatter={(value: number, name: string) => {
                        if (name === "再生数") return [formatNumber(value), name];
                        if (name === "いいね" || name === "コメント" || name === "シェア") return [formatNumber(value), name];
                        if (name === "Amazon" || name === "楽天" || name === "Qoo10") return [`¥${value.toLocaleString()}`, name];
                        return [value, name];
                      }}
                      labelFormatter={(label) => `日付: ${label}`}
                    />
                    <Legend />
                    {showMallSales && (
                      <>
                        <Bar yAxisId={showEngagement ? "engagement" : "sales"} dataKey="amazon" name="Amazon" stackId="sales" fill="#FF9900" opacity={0.7} />
                        <Bar yAxisId={showEngagement ? "engagement" : "sales"} dataKey="rakuten" name="楽天" stackId="sales" fill="#BF0000" opacity={0.7} />
                        <Bar yAxisId={showEngagement ? "engagement" : "sales"} dataKey="qoo10" name="Qoo10" stackId="sales" fill="#3266CC" opacity={0.7} />
                      </>
                    )}
                    <Area yAxisId="views" type="monotone" dataKey="views" name="再生数" stroke="#3B82F6" strokeWidth={2.5} fill="url(#viewsGradient)" dot={{ r: 2, fill: "#3B82F6" }} />
                    {showEngagement && (
                      <>
                        <Line yAxisId="engagement" type="monotone" dataKey="likes" name="いいね" stroke="#FF6B6B" strokeWidth={1.5} dot={false} />
                        <Line yAxisId="engagement" type="monotone" dataKey="comments" name="コメント" stroke="#45B7D1" strokeWidth={1.5} dot={false} />
                        <Line yAxisId="engagement" type="monotone" dataKey="shares" name="シェア" stroke="#96CEB4" strokeWidth={1.5} dot={false} />
                      </>
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-80 flex items-center justify-center text-gray-500">
                  スナップショットデータがありません
                </div>
              )}
            </div>

            {/* TikTokリンク */}
            {selectedVideo.shareUrl && (
              <div className="px-6 pb-6">
                <a
                  href={selectedVideo.shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 text-sm"
                >
                  <ExternalLink size={14} />
                  TikTokで見る
                </a>
              </div>
            )}
          </div>
        </div>
      )}

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
          </div>
        </div>
      )}
    </div>
  );
}
