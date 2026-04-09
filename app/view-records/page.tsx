"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, Download } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, orderBy, where } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";

// 商材の型
type RegisteredProduct = {
  id: string;
  productName: string;
  skuName?: string;
};

// アカウント情報
type AccountInfo = {
  id: string;
  name: string;
  avatarUrl: string;
  operator: string;
};

// アカウント×日付の再生数マップ
type ViewCountMap = { [accountId: string]: { [day: number]: number } };

// 動画別の日次再生数データ（ローデータCSV用）
type VideoRawData = {
  videoId: string;
  accountName: string;
  operator: string;
  productName: string;
  createTime: string | null;
  platform: "tiktok" | "instagram";
  dailyViews: { [day: number]: number };
  permalink: string;
};

// 月の日数を取得
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// 数値をフォーマット（UI表示用）
function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toLocaleString();
}

export default function ViewRecordsPage() {
  const { allowedProductIds } = useAuth();
  const [products, setProducts] = useState<RegisteredProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // 年月管理（デフォルト: 今月）
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  // データ
  const [tiktokAccounts, setTiktokAccounts] = useState<AccountInfo[]>([]);
  const [instagramAccounts, setInstagramAccounts] = useState<AccountInfo[]>([]);
  const [tiktokViews, setTiktokViews] = useState<ViewCountMap>({});
  const [instagramViews, setInstagramViews] = useState<ViewCountMap>({});
  const [tiktokVideoRaw, setTiktokVideoRaw] = useState<VideoRawData[]>([]);
  const [instagramVideoRaw, setInstagramVideoRaw] = useState<VideoRawData[]>([]);
  const [isCsvDropdownOpen, setIsCsvDropdownOpen] = useState(false);

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
        productList.sort((a, b) => {
          const aIsDemo = a.productName.includes("デモ") || a.id.includes("demo") ? -1 : 0;
          const bIsDemo = b.productName.includes("デモ") || b.id.includes("demo") ? -1 : 0;
          return aIsDemo - bIsDemo;
        });
        if (allowedProductIds) {
          setProducts(productList.filter((p) => allowedProductIds.includes(p.id)));
        } else {
          setProducts(productList);
        }
      } catch (error) {
        console.error("商品一覧取得エラー:", error);
      }
    };
    fetchProducts();
  }, []);

  // 前月/次月
  const goToPrevMonth = () => {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else {
      setMonth(month - 1);
    }
  };
  const goToNextMonth = () => {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else {
      setMonth(month + 1);
    }
  };

  // データ取得
  useEffect(() => {
    if (!selectedProductId) return;
    fetchData();
  }, [selectedProductId, year, month]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const daysInMonth = getDaysInMonth(year, month);
      const startDateStr = `${year}-${String(month).padStart(2, "0")}-01`;
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      const endDateStr = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

      const [tiktokResult, instagramResult] = await Promise.all([
        fetchPlatformData("tiktok", startDateStr, endDateStr, daysInMonth),
        fetchPlatformData("instagram", startDateStr, endDateStr, daysInMonth),
      ]);

      setTiktokAccounts(tiktokResult.accounts);
      setTiktokViews(tiktokResult.viewMap);
      setTiktokVideoRaw(tiktokResult.videoRaw);
      setInstagramAccounts(instagramResult.accounts);
      setInstagramViews(instagramResult.viewMap);
      setInstagramVideoRaw(instagramResult.videoRaw);
    } catch (error) {
      console.error("データ取得エラー:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // プラットフォーム別のデータ取得
  const fetchPlatformData = async (
    platform: "tiktok" | "instagram",
    startDateStr: string,
    endDateStr: string,
    daysInMonth: number
  ): Promise<{ accounts: AccountInfo[]; viewMap: ViewCountMap; videoRaw: VideoRawData[] }> => {
    const accountsCol = platform === "tiktok" ? "tiktok_accounts" : "instagram_accounts";
    const snapshotsCol = platform === "tiktok" ? "tiktok_video_daily_snapshots" : "instagram_video_daily_snapshots";

    const accountsSnapshot = await getDocs(
      query(collection(db, accountsCol), where("productId", "==", selectedProductId))
    );
    const accounts: AccountInfo[] = accountsSnapshot.docs
      .filter((doc) => doc.data().hidden !== true)
      .map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          name: platform === "tiktok" ? (d.tiktokUserName || "Unknown") : (d.instagramUserName || "Unknown"),
          avatarUrl: platform === "tiktok" ? (d.tiktokAvatarUrl || "") : (d.instagramAvatarUrl || ""),
          operator: d.operator || "",
        };
      });

    if (accounts.length === 0) return { accounts, viewMap: {}, videoRaw: [] };

    // アカウント名マップ
    const accountNameMap: { [id: string]: { name: string; operator: string } } = {};
    for (const acc of accounts) {
      accountNameMap[acc.id] = { name: acc.name, operator: acc.operator };
    }

    const snapshotsSnapshot = await getDocs(
      query(collection(db, snapshotsCol), where("productId", "==", selectedProductId))
    );

    // アカウント×日付の累計（既存）
    const cumulativeByAccountDate: { [accountId: string]: { [date: string]: number } } = {};
    // 動画×日付の累計（ローデータ用）
    const cumulativeByVideoDate: { [videoId: string]: { [date: string]: number } } = {};
    // 動画メタ情報
    const videoMeta: { [videoId: string]: { accountId: string; accountName: string; operator: string; createTime: string | null } } = {};

    for (const doc of snapshotsSnapshot.docs) {
      const snap = doc.data();
      const date = snap.date as string;
      if (date < startDateStr || date > endDateStr) continue;

      const accountId = snap.accountId as string;
      const videoId = snap.videoId as string;

      // アカウント集約（既存ロジック）
      if (!cumulativeByAccountDate[accountId]) cumulativeByAccountDate[accountId] = {};
      if (!cumulativeByAccountDate[accountId][date]) cumulativeByAccountDate[accountId][date] = 0;
      cumulativeByAccountDate[accountId][date] += snap.viewCount || snap.reach || 0;

      // 動画集約（ローデータ用）
      if (!cumulativeByVideoDate[videoId]) cumulativeByVideoDate[videoId] = {};
      if (!cumulativeByVideoDate[videoId][date]) cumulativeByVideoDate[videoId][date] = 0;
      cumulativeByVideoDate[videoId][date] += snap.viewCount || snap.reach || 0;

      // 動画メタ情報（最新のスナップショットから取得）
      if (!videoMeta[videoId]) {
        const ct = snap.createTime;
        const createTimeStr = typeof ct === "string" ? ct : ct?.toDate?.()?.toISOString?.() || null;
        videoMeta[videoId] = {
          accountId,
          accountName: snap.accountName || accountNameMap[accountId]?.name || "Unknown",
          operator: snap.operator || accountNameMap[accountId]?.operator || "",
          createTime: createTimeStr,
        };
      }
    }

    // アカウント別viewMap（既存ロジック）
    const viewMap: ViewCountMap = {};
    for (const accountId of Object.keys(cumulativeByAccountDate)) {
      viewMap[accountId] = {};
      for (let day = 1; day <= daysInMonth; day++) {
        const todayStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const tomorrow = new Date(year, month - 1, day + 1);
        const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
        const todayVal = cumulativeByAccountDate[accountId][todayStr] || 0;
        const tomorrowVal = cumulativeByAccountDate[accountId][tomorrowStr] || 0;
        viewMap[accountId][day] = tomorrowVal > 0 ? Math.max(0, tomorrowVal - todayVal) : 0;
      }
    }

    // Instagramの場合はvideosコレクションからpermalinkを取得
    const permalinkMap: { [videoId: string]: string } = {};
    if (platform === "instagram") {
      const videosCol = "instagram_videos";
      for (const accountId of Object.keys(cumulativeByAccountDate)) {
        const videosSnapshot = await getDocs(
          query(collection(db, videosCol), where("accountId", "==", accountId))
        );
        for (const doc of videosSnapshot.docs) {
          const d = doc.data();
          if (d.permalink) permalinkMap[d.videoId || doc.id] = d.permalink;
        }
      }
    }

    // 動画別viewMap（ローデータ用）
    const productName = selectedProduct?.productName || "";
    const videoRaw: VideoRawData[] = Object.keys(cumulativeByVideoDate).map((videoId) => {
      const dailyViews: { [day: number]: number } = {};
      for (let day = 1; day <= daysInMonth; day++) {
        const todayStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const tomorrow = new Date(year, month - 1, day + 1);
        const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
        const todayVal = cumulativeByVideoDate[videoId][todayStr] || 0;
        const tomorrowVal = cumulativeByVideoDate[videoId][tomorrowStr] || 0;
        dailyViews[day] = tomorrowVal > 0 ? Math.max(0, tomorrowVal - todayVal) : 0;
      }
      const meta = videoMeta[videoId];
      return {
        videoId,
        accountName: meta?.accountName || "Unknown",
        operator: meta?.operator || "",
        productName,
        createTime: meta?.createTime || null,
        platform,
        dailyViews,
        permalink: permalinkMap[videoId] || "",
      };
    });

    return { accounts, viewMap, videoRaw };
  };

  // 日別合計を計算
  const calcDailyTotal = (viewMap: ViewCountMap, day: number): number => {
    let total = 0;
    for (const accountId of Object.keys(viewMap)) {
      total += viewMap[accountId][day] || 0;
    }
    return total;
  };

  // アカウントの月合計を計算
  const calcAccountTotal = (viewMap: ViewCountMap, accountId: string, daysInMonth: number): number => {
    let total = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      total += viewMap[accountId]?.[day] || 0;
    }
    return total;
  };

  // 全体月合計
  const calcGrandTotal = (viewMap: ViewCountMap, daysInMonth: number): number => {
    let total = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      total += calcDailyTotal(viewMap, day);
    }
    return total;
  };

  const daysInMonth = getDaysInMonth(year, month);
  const selectedProduct = products.find((p) => p.id === selectedProductId);

  // CSVエクスポート
  const exportCsv = () => {
    const days = daysInMonth;
    // CSVのセル値をエスケープ
    const esc = (v: string | number) => {
      const s = String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };

    // 日付ヘッダー（2026/04/01形式）
    const dateHeaders = Array.from({ length: days }, (_, i) => `${year}/${String(month).padStart(2, "0")}/${String(i + 1).padStart(2, "0")}`);
    const headerRow = ["", "運用者", "合計", ...dateHeaders];

    const rows: string[][] = [];
    rows.push(headerRow);

    // プラットフォームごとのCSVブロック生成
    const addPlatformBlock = (title: string, accounts: AccountInfo[], viewMap: ViewCountMap) => {
      // 空行 + タイトル
      rows.push([]);
      rows.push([title]);

      // 合計行
      const grandTotal = calcGrandTotal(viewMap, days);
      const totalRow = ["合計", "", String(grandTotal)];
      for (let day = 1; day <= days; day++) {
        totalRow.push(String(calcDailyTotal(viewMap, day)));
      }
      rows.push(totalRow);

      // アカウント行（運用者列付き1行）
      for (const account of accounts) {
        const accountTotal = calcAccountTotal(viewMap, account.id, days);
        const accountRow = [account.name, account.operator, String(accountTotal)];
        for (let day = 1; day <= days; day++) {
          accountRow.push(String(viewMap[account.id]?.[day] || 0));
        }
        rows.push(accountRow);
      }
    };

    addPlatformBlock("TikTok", tiktokAccounts, tiktokViews);
    addPlatformBlock("Instagram", instagramAccounts, instagramViews);

    const csvContent = rows.map((row) => row.map(esc).join(",")).join("\n");
    // BOM付きUTF-8でダウンロード
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const productName = selectedProduct?.productName || "再生数";
    a.download = `${productName}_再生数記録_${year}年${month}月.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 全商材ローデータCSVエクスポート
  const [isExportingAll, setIsExportingAll] = useState(false);
  const exportAllRawCsv = async () => {
    setIsExportingAll(true);
    setIsCsvDropdownOpen(false);
    try {
      const days = daysInMonth;
      const startDateStr = `${year}-${String(month).padStart(2, "0")}-01`;
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      const endDateStr = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

      const esc = (v: string | number) => {
        const s = String(v);
        return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const dateHeaders = Array.from({ length: days }, (_, i) => `${year}/${String(month).padStart(2, "0")}/${String(i + 1).padStart(2, "0")}`);
      const headerRow = ["動画リンク", "アカウント", "運用者", "商材", "投稿日", "合計", ...dateHeaders];
      const rows: string[][] = [headerRow];

      // 商材名マップ
      const productNameMap: { [id: string]: string } = {};
      for (const p of products) productNameMap[p.id] = p.productName;

      // アカウント名マップ（全商材）
      const accountNameMapAll: { [id: string]: { name: string; operator: string } } = {};

      // プラットフォーム単位で処理
      for (const platform of ["tiktok", "instagram"] as const) {
        const accountsCol = platform === "tiktok" ? "tiktok_accounts" : "instagram_accounts";
        const snapshotsCol = platform === "tiktok" ? "tiktok_video_daily_snapshots" : "instagram_video_daily_snapshots";

        // 全アカウント取得
        const accountsSnapshot = await getDocs(query(collection(db, accountsCol)));
        for (const doc of accountsSnapshot.docs) {
          const d = doc.data();
          if (d.hidden) continue;
          accountNameMapAll[doc.id] = {
            name: platform === "tiktok" ? (d.tiktokUserName || "Unknown") : (d.instagramUserName || "Unknown"),
            operator: d.operator || "",
          };
        }

        // Instagramの場合はpermalinkマップを構築
        const allPermalinkMap: { [videoId: string]: string } = {};
        if (platform === "instagram") {
          const igVideosSnapshot = await getDocs(collection(db, "instagram_videos"));
          for (const doc of igVideosSnapshot.docs) {
            const d = doc.data();
            if (d.permalink) allPermalinkMap[d.videoId || doc.id] = d.permalink;
          }
        }

        // 全スナップショット取得（productIdフィルターなし）
        const snapshotsSnapshot = await getDocs(collection(db, snapshotsCol));

        const cumulativeByVideoDate: { [videoId: string]: { [date: string]: number } } = {};
        const videoMeta: { [videoId: string]: { accountName: string; operator: string; productName: string; createTime: string | null } } = {};

        for (const doc of snapshotsSnapshot.docs) {
          const snap = doc.data();
          const date = snap.date as string;
          if (date < startDateStr || date > endDateStr) continue;

          const videoId = snap.videoId as string;
          if (!cumulativeByVideoDate[videoId]) cumulativeByVideoDate[videoId] = {};
          if (!cumulativeByVideoDate[videoId][date]) cumulativeByVideoDate[videoId][date] = 0;
          cumulativeByVideoDate[videoId][date] += snap.viewCount || snap.reach || 0;

          if (!videoMeta[videoId]) {
            const accInfo = accountNameMapAll[snap.accountId] || { name: snap.accountName || "Unknown", operator: snap.operator || "" };
            const ct = snap.createTime;
            videoMeta[videoId] = {
              accountName: snap.accountName || accInfo.name,
              operator: snap.operator || accInfo.operator,
              productName: productNameMap[snap.productId] || snap.productId || "",
              createTime: typeof ct === "string" ? ct : ct?.toDate?.()?.toISOString?.() || null,
            };
          }
        }

        // 動画行を生成
        if (Object.keys(cumulativeByVideoDate).length > 0) {
          rows.push([]);
          rows.push([platform === "tiktok" ? "TikTok" : "Instagram"]);

          for (const videoId of Object.keys(cumulativeByVideoDate)) {
            let total = 0;
            const dailyCells: string[] = [];
            for (let day = 1; day <= days; day++) {
              const todayStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const tomorrow = new Date(year, month - 1, day + 1);
              const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
              const todayVal = cumulativeByVideoDate[videoId][todayStr] || 0;
              const tomorrowVal = cumulativeByVideoDate[videoId][tomorrowStr] || 0;
              const diff = tomorrowVal > 0 ? Math.max(0, tomorrowVal - todayVal) : 0;
              total += diff;
              dailyCells.push(String(diff));
            }
            if (total === 0) continue;

            const meta = videoMeta[videoId];
            const url = allPermalinkMap[videoId]
              || (platform === "tiktok" ? `https://www.tiktok.com/@${meta?.accountName || ""}/video/${videoId}` : "");
            const postDate = meta?.createTime ? meta.createTime.split("T")[0] : "";
            rows.push([url, meta?.accountName || "", meta?.operator || "", meta?.productName || "", postDate, String(total), ...dailyCells]);
          }
        }
      }

      const csvContent = rows.map((row) => row.map(esc).join(",")).join("\n");
      const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = `全商材_ローデータ_${year}年${month}月.csv`;
      a.click();
      URL.revokeObjectURL(dlUrl);
    } catch (error) {
      console.error("全商材ローデータ出力エラー:", error);
    } finally {
      setIsExportingAll(false);
    }
  };

  // ローデータCSVエクスポート（動画単位）
  const exportRawCsv = () => {
    const days = daysInMonth;
    const esc = (v: string | number) => {
      const s = String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const dateHeaders = Array.from({ length: days }, (_, i) => `${year}/${String(month).padStart(2, "0")}/${String(i + 1).padStart(2, "0")}`);
    const headerRow = ["動画リンク", "アカウント", "運用者", "商材", "投稿日", "合計", ...dateHeaders];

    const rows: string[][] = [];
    rows.push(headerRow);

    // 動画URLを生成
    const buildVideoUrl = (video: VideoRawData): string => {
      if (video.permalink) return video.permalink;
      if (video.platform === "tiktok") return `https://www.tiktok.com/@${video.accountName}/video/${video.videoId}`;
      return "";
    };

    const addVideoRows = (videoRaw: VideoRawData[]) => {
      for (const video of videoRaw) {
        // 合計0の動画はスキップ
        let total = 0;
        for (let day = 1; day <= days; day++) {
          total += video.dailyViews[day] || 0;
        }
        if (total === 0) continue;

        const url = buildVideoUrl(video);
        const postDate = video.createTime ? video.createTime.split("T")[0] : "";
        const row = [url, video.accountName, video.operator, video.productName, postDate, String(total)];
        for (let day = 1; day <= days; day++) {
          row.push(String(video.dailyViews[day] || 0));
        }
        rows.push(row);
      }
    };

    // TikTok
    if (tiktokVideoRaw.length > 0) {
      rows.push([]);
      rows.push(["TikTok"]);
      addVideoRows(tiktokVideoRaw);
    }

    // Instagram
    if (instagramVideoRaw.length > 0) {
      rows.push([]);
      rows.push(["Instagram"]);
      addVideoRows(instagramVideoRaw);
    }

    const csvContent = rows.map((row) => row.map(esc).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const productName = selectedProduct?.productName || "再生数";
    a.download = `${productName}_ローデータ_${year}年${month}月.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // テーブルコンポーネント（合計列をアカウント名の右隣＝一番左に配置）
  const ViewTable = ({
    title,
    accounts,
    viewMap,
    color,
  }: {
    title: string;
    accounts: AccountInfo[];
    viewMap: ViewCountMap;
    color: string;
  }) => {
    if (accounts.length === 0) {
      return (
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <h3 className={`text-lg font-bold mb-2 ${color}`}>{title}</h3>
          <p className="text-gray-400 text-sm">アカウントが登録されていません</p>
        </div>
      );
    }

    return (
      <div className="bg-white rounded-lg shadow mb-4">
        <h3 className={`text-lg font-bold px-4 pt-4 ${color}`}>{title}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="sticky left-0 bg-gray-50 z-10 px-3 py-2 text-left font-medium text-gray-600 min-w-[140px]">
                  アカウント
                </th>
                <th className="px-2 py-2 text-center font-bold text-gray-700 min-w-[64px] bg-gray-100">
                  合計
                </th>
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => (
                  <th key={day} className="px-1.5 py-2 text-center font-medium text-gray-500 min-w-[48px]">
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* 集計行 */}
              <tr className="bg-blue-50 border-b-2 border-blue-200 font-bold">
                <td className="sticky left-0 bg-blue-50 z-10 px-3 py-2 text-gray-800">
                  合計
                </td>
                <td className="px-2 py-2 text-center text-gray-800 bg-blue-100">
                  {formatNumber(calcGrandTotal(viewMap, daysInMonth))}
                </td>
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                  const val = calcDailyTotal(viewMap, day);
                  return (
                    <td key={day} className="px-1.5 py-2 text-center text-gray-800">
                      {val > 0 ? formatNumber(val) : <span className="text-gray-300">-</span>}
                    </td>
                  );
                })}
              </tr>
              {/* アカウント行 */}
              {accounts.map((account) => (
                <tr key={account.id} className="border-b hover:bg-gray-50">
                  <td className="sticky left-0 bg-white z-10 px-3 py-2">
                    <div className="flex items-center gap-2">
                      {account.avatarUrl ? (
                        <img src={account.avatarUrl} alt="" className="w-5 h-5 rounded-full" />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-gray-200" />
                      )}
                      <div className="flex flex-col">
                        <span className="truncate max-w-[100px]" title={account.name}>
                          {account.name}
                        </span>
                        {account.operator && (
                          <span className="text-[10px] text-gray-400 truncate max-w-[100px]">
                            {account.operator}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center font-medium text-gray-700 bg-gray-50">
                    {formatNumber(calcAccountTotal(viewMap, account.id, daysInMonth))}
                  </td>
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                    const val = viewMap[account.id]?.[day] || 0;
                    return (
                      <td key={day} className="px-1.5 py-2 text-center text-gray-600">
                        {val > 0 ? formatNumber(val) : <span className="text-gray-300">-</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-full">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">再生数記録</h1>
        {/* CSVエクスポートプルダウン */}
        {selectedProductId && !isLoading && (
          <div className="relative">
            <button
              onClick={() => setIsCsvDropdownOpen(!isCsvDropdownOpen)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
            >
              <Download size={16} />
              CSV出力
              <ChevronDown size={14} />
            </button>
            {isCsvDropdownOpen && (
              <div className="absolute right-0 mt-1 w-44 bg-white border rounded-lg shadow-lg z-20">
                <button
                  onClick={() => { exportCsv(); setIsCsvDropdownOpen(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 rounded-t-lg"
                >
                  表形式
                </button>
                <button
                  onClick={() => { exportRawCsv(); setIsCsvDropdownOpen(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 border-t"
                >
                  ローデータ
                </button>
                <button
                  onClick={exportAllRawCsv}
                  disabled={isExportingAll}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 rounded-b-lg border-t disabled:opacity-50"
                >
                  {isExportingAll ? "出力中..." : "全商材ローデータ"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 商材セレクター + 年月セレクター */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        {/* 商材セレクター */}
        <div className="relative">
          <button
            onClick={() => setIsProductDropdownOpen(!isProductDropdownOpen)}
            className="flex items-center gap-2 px-4 py-2 bg-white border rounded-lg shadow-sm hover:bg-gray-50 min-w-[200px]"
          >
            <span className="text-sm truncate">
              {selectedProduct ? selectedProduct.productName : "商材を選択"}
            </span>
            <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />
          </button>
          {isProductDropdownOpen && (
            <div className="absolute z-20 mt-1 w-64 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {products.map((product) => (
                <button
                  key={product.id}
                  onClick={() => {
                    setSelectedProductId(product.id);
                    setIsProductDropdownOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-blue-50 ${
                    selectedProductId === product.id ? "bg-blue-100 font-medium" : ""
                  }`}
                >
                  {product.productName}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 年月セレクター */}
        <div className="flex items-center gap-2">
          <button
            onClick={goToPrevMonth}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-lg font-bold min-w-[120px] text-center">
            {year}年{month}月
          </span>
          <button
            onClick={goToNextMonth}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* ローディング */}
      {isLoading && (
        <div className="text-center py-8 text-gray-500">読み込み中...</div>
      )}

      {/* 未選択 */}
      {!selectedProductId && !isLoading && (
        <div className="text-center py-12 text-gray-400">商材を選択してください</div>
      )}

      {/* テーブル */}
      {selectedProductId && !isLoading && (
        <>
          <ViewTable
            title="TikTok"
            accounts={tiktokAccounts}
            viewMap={tiktokViews}
            color="text-gray-800"
          />
          <ViewTable
            title="Instagram"
            accounts={instagramAccounts}
            viewMap={instagramViews}
            color="text-pink-700"
          />
        </>
      )}
    </div>
  );
}
