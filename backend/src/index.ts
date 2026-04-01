import express, { Request, Response } from "express";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { chromium } from "playwright";
import { BigQuery } from "@google-cloud/bigquery";

// Firebase Admin初期化
// Cloud Run上ではADC（Application Default Credentials）を使用
if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();

// BigQuery初期化
const bigquery = new BigQuery({ projectId: "mall-batch-manager" });
const BQ_DATASET = "tiktok_analytics";
const BQ_TABLE_SNAPSHOTS = "video_daily_snapshots";
const BQ_TABLE_VIDEOS = "videos";
const BQ_TABLE_ACCOUNTS = "accounts";

// BigQueryへ動画スナップショットを書き込む
async function insertSnapshotsToBigQuery(
  snapshots: Array<{
    videoId: string;
    accountId: string;
    productId: string;
    productName: string;
    accountName: string;
    date: string;
    viewCount: number;
    likeCount: number;
    commentCount: number;
    shareCount: number;
    createTime: string | null;
  }>
): Promise<void> {
  if (snapshots.length === 0) return;

  const rows = snapshots.map(s => ({
    video_id: s.videoId,
    account_id: s.accountId,
    product_id: s.productId,
    product_name: s.productName,
    account_name: s.accountName,
    snapshot_date: s.date,
    view_count: s.viewCount,
    like_count: s.likeCount,
    comment_count: s.commentCount,
    share_count: s.shareCount,
    create_time: s.createTime || null,
    collected_at: new Date().toISOString(),
  }));

  // 500件ずつバッチ挿入
  const BATCH_SIZE = 500;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await bigquery.dataset(BQ_DATASET).table(BQ_TABLE_SNAPSHOTS).insert(batch);
  }
  console.log(`Inserted ${rows.length} snapshots to BigQuery`);
}

// BigQueryへ動画情報を書き込む（upsert的にMERGE）
async function upsertVideosToBigQuery(
  videos: Array<{
    videoId: string;
    accountId: string;
    productId: string;
    tiktokUserId: string;
    title: string;
    coverImageUrl: string;
    shareUrl: string;
    createTime: string | null;
    duration: number;
    viewCount: number;
    likeCount: number;
    commentCount: number;
    shareCount: number;
  }>
): Promise<void> {
  if (videos.length === 0) return;

  // 一時テーブルに挿入してからMERGE
  const tempTable = `_temp_videos_${Date.now()}`;
  const rows = videos.map(v => ({
    video_id: v.videoId,
    account_id: v.accountId,
    product_id: v.productId,
    tiktok_user_id: v.tiktokUserId,
    title: v.title || "",
    cover_image_url: v.coverImageUrl || "",
    share_url: v.shareUrl || "",
    create_time: v.createTime || null,
    duration: v.duration || 0,
    view_count: v.viewCount || 0,
    like_count: v.likeCount || 0,
    comment_count: v.commentCount || 0,
    share_count: v.shareCount || 0,
    updated_at: new Date().toISOString(),
  }));

  // 直接挿入（重複は最新のupdated_atで判断可能）
  const BATCH_SIZE = 500;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await bigquery.dataset(BQ_DATASET).table(BQ_TABLE_VIDEOS).insert(batch);
  }
  console.log(`Inserted ${rows.length} videos to BigQuery`);
}
const app = express();
const PORT = process.env.PORT || 8080;

// CORS設定 - Vercelからのリクエストを許可
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '10mb' }));

// ヘルスチェック用エンドポイント
app.get("/", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    message: "Mall Batch Manager Backend is running",
    timestamp: new Date().toISOString(),
  });
});

// 設定更新用エンドポイント（POST /settings/amazon）
app.post("/settings/amazon", async (req: Request, res: Response) => {
  try {
    const { lwaClientId, lwaClientSecret, refreshToken, awsAccessKey, awsSecretKey } = req.body;

    const docRef = db.collection("settings").doc("mall_credentials");
    const doc = await docRef.get();
    const existingData = doc.exists ? doc.data() : {};

    await docRef.set({
      ...existingData,
      amazon: {
        lwaClientId: lwaClientId || existingData?.amazon?.lwaClientId || "",
        lwaClientSecret: lwaClientSecret || existingData?.amazon?.lwaClientSecret || "",
        refreshToken: refreshToken || existingData?.amazon?.refreshToken || "",
        awsAccessKey: awsAccessKey || existingData?.amazon?.awsAccessKey || "",
        awsSecretKey: awsSecretKey || existingData?.amazon?.awsSecretKey || "",
      },
      updatedAt: new Date(),
    }, { merge: true });

    res.json({
      success: true,
      message: "Amazon認証情報を更新しました",
    });
  } catch (error: any) {
    console.error("設定更新エラー:", error);
    res.status(500).json({
      success: false,
      message: "設定の更新に失敗しました",
      error: error.message,
    });
  }
});

// スクレイピングエンドポイント
app.get("/scrape", async (req: Request, res: Response) => {
  console.log("Scrape endpoint triggered at:", new Date().toISOString());

  let browser = null;

  try {
    // Playwrightでブラウザを起動
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();

    // テスト用にexample.comにアクセス
    await page.goto("https://example.com", { waitUntil: "domcontentloaded" });

    // ページタイトルを取得
    const pageTitle = await page.title();
    console.log("Scraped page title:", pageTitle);

    await browser.close();
    browser = null;

    // 今日の日付を取得
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0]; // YYYY-MM-DD

    // ランダムな売上データを生成（0〜50000）
    const randomValue = () => Math.floor(Math.random() * 50001);

    const salesData = {
      date: dateStr,
      amazon: randomValue(),
      rakuten: randomValue(),
      qoo10: randomValue(),
      amazonAd: Math.floor(randomValue() / 5), // 広告費は売上の約1/5程度
      rakutenAd: Math.floor(randomValue() / 5),
      qoo10Ad: Math.floor(randomValue() / 5),
      xAd: Math.floor(randomValue() / 10),
      tiktokAd: Math.floor(randomValue() / 10),
      status: `Scraping Success: ${pageTitle}`,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      source: "playwright-scraper",
    };

    // Firestoreに書き込み
    const docRef = await db.collection("sales_data").add(salesData);
    console.log(`Successfully wrote scraped data with ID: ${docRef.id}`);

    res.json({
      success: true,
      message: "Scraping completed and data saved to Firestore",
      documentId: docRef.id,
      scrapedTitle: pageTitle,
      data: salesData,
    });
  } catch (error) {
    console.error("Error in scrape process:", error);

    // ブラウザが開いていれば閉じる
    if (browser) {
      await browser.close();
    }

    res.status(500).json({
      success: false,
      message: "Scraping failed",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// テストデータ書き込みエンドポイント
app.post("/write-test-data", async (req: Request, res: Response) => {
  try {
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0]; // YYYY-MM-DD

    // テスト用の売上データ
    const testSalesData = {
      date: dateStr,
      amazon: 150000,
      rakuten: 120000,
      qoo10: 80000,
      amazonAd: 15000,
      rakutenAd: 10000,
      qoo10Ad: 5000,
      xAd: 20000,
      tiktokAd: 15000,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      source: "test-batch",
    };

    // Firestoreに書き込み
    const docRef = await db.collection("sales_data").add(testSalesData);

    console.log(`Successfully wrote test data with ID: ${docRef.id}`);

    res.json({
      success: true,
      message: "Test data written to Firestore",
      documentId: docRef.id,
      data: testSalesData,
    });
  } catch (error) {
    console.error("Error writing to Firestore:", error);
    res.status(500).json({
      success: false,
      message: "Failed to write test data",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// 売上データ取得エンドポイント（確認用）
app.get("/sales-data", async (req: Request, res: Response) => {
  try {
    const snapshot = await db
      .collection("sales_data")
      .orderBy("createdAt", "desc")
      .limit(10)
      .get();

    const data = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error("Error reading from Firestore:", error);
    res.status(500).json({
      success: false,
      message: "Failed to read sales data",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// 過去30日分のサンプルデータを生成
app.get("/generate-sample-data", async (req: Request, res: Response) => {
  try {
    console.log("Generating sample data for past 30 days...");

    const batch = db.batch();
    const today = new Date();
    const addedDocs: string[] = [];

    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];

      // リアルな売上データを生成（基準値 + ランダム変動）
      const baseAmazon = 120000 + Math.floor(Math.random() * 60000);
      const baseRakuten = 100000 + Math.floor(Math.random() * 50000);
      const baseQoo10 = 60000 + Math.floor(Math.random() * 40000);

      const salesData = {
        date: dateStr,
        amazon: baseAmazon,
        rakuten: baseRakuten,
        qoo10: baseQoo10,
        amazonAd: Math.floor(baseAmazon * 0.08 + Math.random() * 5000),
        rakutenAd: Math.floor(baseRakuten * 0.07 + Math.random() * 4000),
        qoo10Ad: Math.floor(baseQoo10 * 0.06 + Math.random() * 3000),
        xAd: 3000 + Math.floor(Math.random() * 7000),
        tiktokAd: 2000 + Math.floor(Math.random() * 8000),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        source: "sample-data",
      };

      const docRef = db.collection("sales_data").doc();
      batch.set(docRef, salesData);
      addedDocs.push(dateStr);
    }

    await batch.commit();
    console.log(`Successfully generated ${addedDocs.length} sample data entries`);

    res.json({
      success: true,
      message: `Generated ${addedDocs.length} days of sample data`,
      dates: addedDocs,
    });
  } catch (error) {
    console.error("Error generating sample data:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate sample data",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// 11月分のデモデータを生成
app.get("/generate-november-data", async (req: Request, res: Response) => {
  try {
    console.log("Generating November 2025 demo data...");

    const batch = db.batch();
    const year = 2025;
    const month = 11; // November
    const addedDocs: string[] = [];

    for (let day = 1; day <= 30; day++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

      // 週末は少し売上高め
      const date = new Date(year, month - 1, day);
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      const multiplier = isWeekend ? 1.2 : 1.0;

      const baseAmazon = Math.floor((100000 + Math.random() * 80000) * multiplier);
      const baseRakuten = Math.floor((80000 + Math.random() * 60000) * multiplier);
      const baseQoo10 = Math.floor((50000 + Math.random() * 40000) * multiplier);

      const salesData = {
        date: dateStr,
        amazon: baseAmazon,
        rakuten: baseRakuten,
        qoo10: baseQoo10,
        amazonAd: Math.floor(baseAmazon * 0.08 + Math.random() * 5000),
        rakutenAd: Math.floor(baseRakuten * 0.07 + Math.random() * 4000),
        qoo10Ad: Math.floor(baseQoo10 * 0.06 + Math.random() * 3000),
        xAd: 3000 + Math.floor(Math.random() * 7000),
        tiktokAd: 2000 + Math.floor(Math.random() * 8000),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        source: "demo-data-november",
      };

      const docRef = db.collection("sales_data").doc();
      batch.set(docRef, salesData);
      addedDocs.push(dateStr);
    }

    await batch.commit();
    console.log(`Successfully generated ${addedDocs.length} November data entries`);

    res.json({
      success: true,
      message: `Generated ${addedDocs.length} days of November 2025 data`,
      dates: addedDocs,
    });
  } catch (error) {
    console.error("Error generating November data:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate November data",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// ==================== Qoo10 API連携 ====================

// Qoo10 API設定
// メソッド名はURLパスに含める形式
const QOO10_API_BASE = "https://api.qoo10.jp/GMKT.INC.Front.QAPIService/ebayjapan.qapi";

// 日付をYYYYMMDD形式に変換
function formatDateForQoo10(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

// 日付をYYYY-MM-DD形式に変換
function formatDateForFirestore(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Qoo10 APIから注文データを取得（公式ドキュメント仕様）
// ヘッダー: GiosisCertificationKey (SAK/APIキー)
// Content-Type: application/x-www-form-urlencoded

// 単一ステータス・単一ページでQoo10 APIを呼び出す内部関数
async function fetchQoo10OrdersByStatusAndPage(
  apiKey: string,
  startDate: string,
  endDate: string,
  shippingStatus: string,
  page: number = 1
): Promise<any> {
  // 日付形式をYYYYMMDD形式に変換（APIが要求する形式）
  const formatDate = (dateStr: string) => {
    // YYYY-MM-DD -> YYYYMMDD
    if (dateStr.includes("-")) {
      return dateStr.replace(/-/g, "");
    }
    return dateStr;
  };

  const formattedStartDate = formatDate(startDate);
  const formattedEndDate = formatDate(endDate);

  // URLにメソッド名を含める
  const url = `${QOO10_API_BASE}/ShippingBasic.GetShippingInfo_v3`;

  // URLSearchParamsを使用してform-urlencoded形式のボディを作成
  const params = new URLSearchParams();
  params.append("returnType", "application/json");
  params.append("ShippingStatus", shippingStatus);
  params.append("SearchStartDate", formattedStartDate);
  params.append("SearchEndDate", formattedEndDate);
  params.append("SearchCondition", "1"); // 1: 注文日ベース
  params.append("Page", page.toString()); // ページ番号

  console.log(`Fetching Qoo10 orders (Status=${shippingStatus}, Page=${page}) from ${formattedStartDate} to ${formattedEndDate}...`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "GiosisCertificationKey": apiKey,
      "QAPIVersion": "1.0",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`Qoo10 API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as any;
  const orderCount = data.ResultObject?.length || 0;
  console.log(`Qoo10 API (Status=${shippingStatus}, Page=${page}) ResultCode: ${data.ResultCode}, Orders: ${orderCount}`);
  return data;
}

// 単一ステータスで全ページを取得する関数（ページネーション対応）
async function fetchQoo10OrdersByStatus(
  apiKey: string,
  startDate: string,
  endDate: string,
  shippingStatus: string
): Promise<any[]> {
  const allOrders: any[] = [];
  const seenPackNos = new Set<string>(); // 重複チェック用
  let page = 1;
  const maxPages = 500; // 無限ループ防止（増加）
  let lastOrderCount = -1;

  while (page <= maxPages) {
    const response = await fetchQoo10OrdersByStatusAndPage(apiKey, startDate, endDate, shippingStatus, page);

    if (response.ResultCode !== 0 && response.ResultCode !== "0") {
      // エラーまたはデータなし
      break;
    }

    const orders = response.ResultObject || [];
    if (!Array.isArray(orders) || orders.length === 0) {
      // データがなくなったら終了
      break;
    }

    // 重複チェックしながら追加
    let newOrdersAdded = 0;
    for (const order of orders) {
      const packNo = order.PackNo || order.OrderNo || "";
      if (packNo && !seenPackNos.has(packNo)) {
        seenPackNos.add(packNo);
        allOrders.push(order);
        newOrdersAdded++;
      }
    }

    console.log(`Status ${shippingStatus} Page ${page}: ${orders.length} orders received, ${newOrdersAdded} new, total: ${allOrders.length}`);

    // 新しい注文が追加されなかった場合は終了（同じデータが繰り返されている）
    if (newOrdersAdded === 0) {
      console.log(`Status ${shippingStatus}: No new orders on page ${page}, stopping pagination`);
      break;
    }

    // 前回と同じ件数が返ってきて新規追加が0なら終了
    if (orders.length === lastOrderCount && newOrdersAdded === 0) {
      break;
    }
    lastOrderCount = orders.length;

    page++;
  }

  console.log(`Status ${shippingStatus}: Total ${allOrders.length} unique orders from ${page - 1} pages`);
  return allOrders;
}

// 複数ステータス(1〜5)を網羅して注文データを取得（ページネーション対応済み）
async function fetchQoo10Orders(apiKey: string, startDate: string, endDate: string): Promise<any> {
  // 取得対象のステータス
  // 1: 入金待ち
  // 2: 配送要請（入金済み）
  // 3: 配送中
  // 4: 配送完了
  // 5: 受取確認済（購入決定）
  const statuses = ["1", "2", "3", "4", "5"];

  const allOrders: any[] = [];
  const seenOrderNos = new Set<string>(); // 重複排除用

  for (const status of statuses) {
    try {
      // ページネーション対応版：配列が直接返ってくる
      const orders = await fetchQoo10OrdersByStatus(apiKey, startDate, endDate, status);

      if (Array.isArray(orders) && orders.length > 0) {
        for (const order of orders) {
          // PackNo（注文番号）で重複チェック
          const orderKey = order.PackNo || order.OrderNo || JSON.stringify(order);
          if (!seenOrderNos.has(orderKey)) {
            seenOrderNos.add(orderKey);
            allOrders.push(order);
          }
        }
        console.log(`Status ${status}: ${orders.length} orders fetched (all pages), total unique: ${allOrders.length}`);
      } else {
        console.log(`Status ${status}: No data`);
      }
    } catch (err) {
      console.error(`Error fetching status ${status}:`, err);
      // 1つのステータスが失敗しても続行
    }
  }

  console.log(`Total unique orders from all statuses: ${allOrders.length}`);

  // 統一されたレスポンス形式で返す
  return {
    ResultCode: 0,
    ResultMsg: `SUCCESS (${allOrders.length} orders from statuses 1-5)`,
    ResultObject: allOrders,
  };
}

// 注文データを日次売上に集計（GMVベース）
function aggregateOrdersByDate(orders: any[]): Map<string, number> {
  const dailySales = new Map<string, number>();

  for (const order of orders) {
    // 注文日を取得（OrderDate形式: "2025-11-01 12:34:56" など）
    const orderDateStr = order.OrderDate || order.orderDate || "";
    const dateMatch = orderDateStr.match(/^(\d{4})-?(\d{2})-?(\d{2})/);

    if (dateMatch) {
      const dateKey = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
      // GMV（流通総額）ベースで計算: (OrderPrice + OptionPrice) * OrderQty
      const orderPrice = parseFloat(order.OrderPrice || order.orderPrice || 0);
      const optionPrice = parseFloat(order.OptionPrice || order.optionPrice || 0);
      const qty = parseInt(order.OrderQty || order.orderQty || 1);
      const amount = (orderPrice + optionPrice) * qty;

      if (dailySales.has(dateKey)) {
        dailySales.set(dateKey, dailySales.get(dateKey)! + amount);
      } else {
        dailySales.set(dateKey, amount);
      }
    }
  }

  return dailySales;
}

// Qoo10売上データ取得エンドポイント
app.get("/qoo10/fetch-orders", async (req: Request, res: Response) => {
  try {
    console.log("Qoo10 fetch orders endpoint triggered");

    // FirestoreからAPIキーを取得
    const settingsDoc = await db.collection("settings").doc("mall_credentials").get();

    if (!settingsDoc.exists) {
      return res.status(400).json({
        success: false,
        message: "APIキーが設定されていません。媒体設定画面でQoo10のAPIキーを登録してください。",
      });
    }

    const settings = settingsDoc.data();
    const apiKey = settings?.qoo10?.apiKey;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        message: "Qoo10のAPIキーが設定されていません。",
      });
    }

    // 日付範囲を設定（デフォルト: 過去30日）
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 30);

    // クエリパラメータから日付を取得（オプション）
    const queryStartDate = req.query.startDate as string;
    const queryEndDate = req.query.endDate as string;

    const sDate = queryStartDate || formatDateForQoo10(startDate);
    const eDate = queryEndDate || formatDateForQoo10(endDate);

    // Qoo10 APIから注文データを取得
    const apiResponse = await fetchQoo10Orders(apiKey, sDate, eDate);

    console.log("Qoo10 API Response:", JSON.stringify(apiResponse, null, 2).slice(0, 500));

    // APIレスポンスの検証
    if (apiResponse.ResultCode !== 0 && apiResponse.ResultCode !== "0") {
      return res.status(400).json({
        success: false,
        message: `Qoo10 API Error: ${apiResponse.ResultMsg || "Unknown error"}`,
        resultCode: apiResponse.ResultCode,
      });
    }

    // 注文データを取得
    const orders = apiResponse.ResultObject || apiResponse.result || [];

    if (!Array.isArray(orders) || orders.length === 0) {
      return res.json({
        success: true,
        message: "指定期間に注文データがありません",
        orders: [],
        aggregated: {},
      });
    }

    // 日次売上に集計
    const dailySalesMap = aggregateOrdersByDate(orders);

    // 指定期間のすべての日付を生成（売上0の日も含める）
    const parseDate = (dateStr: string) => {
      // YYYYMMDD または YYYY-MM-DD 形式に対応
      if (dateStr.includes("-")) {
        return new Date(dateStr);
      }
      return new Date(`${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`);
    };

    const allDates: string[] = [];
    const currentDate = parseDate(sDate);
    const endDateObj = parseDate(eDate);
    while (currentDate <= endDateObj) {
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const day = String(currentDate.getDate()).padStart(2, '0');
      allDates.push(`${year}-${month}-${day}`);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // すべての日付に対してデータを生成（売上がない日は0）
    const aggregatedWithZeros: { [key: string]: number } = {};
    for (const date of allDates) {
      aggregatedWithZeros[date] = dailySalesMap.get(date) || 0;
    }

    // 結果を返す（デバッグ用に最初の注文も含める）
    res.json({
      success: true,
      message: `${orders.length}件の注文データを取得しました`,
      period: { startDate: sDate, endDate: eDate },
      orderCount: orders.length,
      aggregated: aggregatedWithZeros,
      sampleOrder: orders.length > 0 ? orders[0] : null,
    });

  } catch (error) {
    console.error("Error fetching Qoo10 orders:", error);
    res.status(500).json({
      success: false,
      message: "Qoo10データの取得に失敗しました",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Qoo10売上データを取得してFirestoreに保存
app.post("/qoo10/sync-sales", async (req: Request, res: Response) => {
  try {
    console.log("Qoo10 sync sales endpoint triggered");

    // FirestoreからAPIキーを取得
    const settingsDoc = await db.collection("settings").doc("mall_credentials").get();

    if (!settingsDoc.exists) {
      return res.status(400).json({
        success: false,
        message: "APIキーが設定されていません。",
      });
    }

    const settings = settingsDoc.data();
    const apiKey = settings?.qoo10?.apiKey;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        message: "Qoo10のAPIキーが設定されていません。",
      });
    }

    // 日付範囲を設定
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 30);

    const sDate = formatDateForQoo10(startDate);
    const eDate = formatDateForQoo10(endDate);

    // Qoo10 APIから注文データを取得
    const apiResponse = await fetchQoo10Orders(apiKey, sDate, eDate);

    if (apiResponse.ResultCode !== 0 && apiResponse.ResultCode !== "0") {
      return res.status(400).json({
        success: false,
        message: `Qoo10 API Error: ${apiResponse.ResultMsg || "Unknown error"}`,
      });
    }

    const orders = apiResponse.ResultObject || apiResponse.result || [];

    if (!Array.isArray(orders) || orders.length === 0) {
      return res.json({
        success: true,
        message: "指定期間に注文データがありません",
        savedCount: 0,
      });
    }

    // 日次売上に集計
    const dailySales = aggregateOrdersByDate(orders);

    // Firestoreに保存/更新
    const batch = db.batch();
    const savedDates: string[] = [];

    for (const [dateStr, amount] of dailySales) {
      // 既存のデータを検索
      const existingSnapshot = await db
        .collection("sales_data")
        .where("date", "==", dateStr)
        .where("source", "==", "qoo10-api")
        .limit(1)
        .get();

      if (existingSnapshot.empty) {
        // 新規作成
        const docRef = db.collection("sales_data").doc();
        batch.set(docRef, {
          date: dateStr,
          amazon: 0,
          rakuten: 0,
          qoo10: Math.round(amount),
          amazonAd: 0,
          rakutenAd: 0,
          qoo10Ad: 0,
          xAd: 0,
          tiktokAd: 0,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          source: "qoo10-api",
        });
      } else {
        // 既存データを更新
        const docRef = existingSnapshot.docs[0].ref;
        batch.update(docRef, {
          qoo10: Math.round(amount),
          updatedAt: Timestamp.now(),
        });
      }
      savedDates.push(dateStr);
    }

    await batch.commit();

    res.json({
      success: true,
      message: `${savedDates.length}日分のQoo10売上データを同期しました`,
      savedDates,
      orderCount: orders.length,
    });

  } catch (error) {
    console.error("Error syncing Qoo10 sales:", error);
    res.status(500).json({
      success: false,
      message: "Qoo10売上データの同期に失敗しました",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Qoo10 API接続テスト
app.get("/qoo10/test-connection", async (req: Request, res: Response) => {
  try {
    console.log("Qoo10 connection test endpoint triggered");

    // FirestoreからAPIキーを取得
    const settingsDoc = await db.collection("settings").doc("mall_credentials").get();

    if (!settingsDoc.exists) {
      return res.status(400).json({
        success: false,
        message: "APIキーが設定されていません。",
      });
    }

    const settings = settingsDoc.data();
    const apiKey = settings?.qoo10?.apiKey;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        message: "Qoo10のAPIキーが設定されていません。",
      });
    }

    // 過去7日間で接続テスト
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 7);

    const startDateStr = formatDateForQoo10(startDate);
    const endDateStr = formatDateForQoo10(endDate);

    const apiResponse = await fetchQoo10Orders(apiKey, startDateStr, endDateStr);

    if (apiResponse.ResultCode === 0 || apiResponse.ResultCode === "0") {
      res.json({
        success: true,
        message: "Qoo10 API接続成功",
        resultCode: apiResponse.ResultCode,
        resultMsg: apiResponse.ResultMsg,
      });
    } else {
      res.json({
        success: false,
        message: `Qoo10 API接続失敗: ${apiResponse.ResultMsg || "Unknown error"}`,
        resultCode: apiResponse.ResultCode,
      });
    }

  } catch (error) {
    console.error("Error testing Qoo10 connection:", error);
    res.status(500).json({
      success: false,
      message: "Qoo10 API接続テストに失敗しました",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Qoo10 商品一覧取得
app.get("/qoo10/products", async (req: Request, res: Response) => {
  try {
    console.log("Qoo10 products endpoint triggered");

    // FirestoreからAPIキーを取得
    const settingsDoc = await db.collection("settings").doc("mall_credentials").get();

    if (!settingsDoc.exists) {
      return res.status(400).json({
        success: false,
        message: "APIキーが設定されていません。",
      });
    }

    const settings = settingsDoc.data();
    const apiKey = settings?.qoo10?.apiKey;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        message: "Qoo10のAPIキーが設定されていません。",
      });
    }

    // ページ番号（デフォルト: 1）
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    // ItemStatus: S0=未確認, S1=待機, S2=販売中, S3=一時停止, S5/S8=制限
    const itemStatus = (req.query.status as string) || "S2";

    const url = `${QOO10_API_BASE}/ItemsLookup.GetAllGoodsInfo`;

    const params = new URLSearchParams();
    params.append("returnType", "application/json");
    params.append("SellerCode", ""); // 空文字で全商品
    params.append("ItemStatus", itemStatus);
    params.append("Page", String(page));

    console.log(`Fetching Qoo10 products (page: ${page}, status: ${itemStatus})...`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "GiosisCertificationKey": apiKey,
        "QAPIVersion": "1.0",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(`Qoo10 API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as any;
    console.log(`Qoo10 Products API Response ResultCode: ${data.ResultCode}, ResultMsg: ${data.ResultMsg}`);

    if (data.ResultCode !== 0 && data.ResultCode !== "0") {
      return res.status(400).json({
        success: false,
        message: `Qoo10 API Error: ${data.ResultMsg || "Unknown error"}`,
        resultCode: data.ResultCode,
      });
    }

    // 商品リストを取得（APIレスポンス形式に応じて対応）
    let products = data.ResultObject;

    // ResultObjectがオブジェクトの場合、その中の配列を探す
    if (products && !Array.isArray(products)) {
      // ItemsやGoods等のキーで配列が返される可能性
      products = products.Items || products.Goods || products.ItemList ||
                 products.items || products.goods || [products];
    }

    if (!products) {
      products = [];
    }

    // 配列でない場合は配列に変換
    if (!Array.isArray(products)) {
      products = [products];
    }

    const formattedProducts = products.map((p: any) => ({
      itemCode: p.ItemCode || p.itemCode || p.GdNo || p.gdNo,
      sellerCode: p.SellerCode || p.sellerCode || p.SellerGdNo || p.sellerGdNo,
      itemTitle: p.ItemTitle || p.itemTitle || p.GdNm || p.gdNm || p.Title || p.title,
      itemPrice: p.ItemPrice || p.itemPrice || p.Price || p.price || p.SellerPrice || p.sellerPrice,
      itemQty: p.ItemQty || p.itemQty || p.Qty || p.qty || p.StockQty || p.stockQty,
      itemStatus: p.ItemStatus || p.itemStatus || p.Status || p.status,
    }));

    res.json({
      success: true,
      message: `${formattedProducts.length}件の商品を取得しました`,
      page,
      status: itemStatus,
      count: formattedProducts.length,
      products: formattedProducts,
    });

  } catch (error) {
    console.error("Error fetching Qoo10 products:", error);
    res.status(500).json({
      success: false,
      message: "Qoo10商品一覧の取得に失敗しました",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Qoo10 商品詳細取得（商品名、価格なども取得）
app.get("/qoo10/product/:itemCode", async (req: Request, res: Response) => {
  try {
    const itemCode = req.params.itemCode;
    console.log(`Qoo10 product detail endpoint triggered for: ${itemCode}`);

    // FirestoreからAPIキーを取得
    const settingsDoc = await db.collection("settings").doc("mall_credentials").get();

    if (!settingsDoc.exists) {
      return res.status(400).json({
        success: false,
        message: "APIキーが設定されていません。",
      });
    }

    const settings = settingsDoc.data();
    const apiKey = settings?.qoo10?.apiKey;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        message: "Qoo10のAPIキーが設定されていません。",
      });
    }

    const url = `${QOO10_API_BASE}/ItemsLookup.GetItemDetailInfo`;

    const params = new URLSearchParams();
    params.append("returnType", "application/json");
    params.append("ItemCode", itemCode);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "GiosisCertificationKey": apiKey,
        "QAPIVersion": "1.0",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(`Qoo10 API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as any;

    if (data.ResultCode !== 0 && data.ResultCode !== "0") {
      return res.status(400).json({
        success: false,
        message: `Qoo10 API Error: ${data.ResultMsg || "Unknown error"}`,
        resultCode: data.ResultCode,
      });
    }

    res.json({
      success: true,
      product: data.ResultObject,
    });

  } catch (error) {
    console.error("Error fetching Qoo10 product detail:", error);
    res.status(500).json({
      success: false,
      message: "Qoo10商品詳細の取得に失敗しました",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Qoo10 商品一覧（詳細情報付き）- プルダウン用
app.get("/qoo10/products-with-details", async (req: Request, res: Response) => {
  try {
    console.log("Qoo10 products with details endpoint triggered");

    // FirestoreからAPIキーを取得
    const settingsDoc = await db.collection("settings").doc("mall_credentials").get();

    if (!settingsDoc.exists) {
      return res.status(400).json({
        success: false,
        message: "APIキーが設定されていません。",
      });
    }

    const settings = settingsDoc.data();
    const apiKey = settings?.qoo10?.apiKey;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        message: "Qoo10のAPIキーが設定されていません。",
      });
    }

    // まず商品一覧を取得
    const listUrl = `${QOO10_API_BASE}/ItemsLookup.GetAllGoodsInfo`;
    const listParams = new URLSearchParams();
    listParams.append("returnType", "application/json");
    listParams.append("SellerCode", "");
    listParams.append("ItemStatus", "S2"); // 販売中
    listParams.append("Page", "1");

    const listResponse = await fetch(listUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "GiosisCertificationKey": apiKey,
        "QAPIVersion": "1.0",
      },
      body: listParams.toString(),
    });

    const listData = await listResponse.json() as any;

    if (listData.ResultCode !== 0 && listData.ResultCode !== "0") {
      return res.status(400).json({
        success: false,
        message: `Qoo10 API Error: ${listData.ResultMsg || "Unknown error"}`,
      });
    }

    const items = listData.ResultObject?.Items || [];

    // 各商品の詳細を取得
    const productsWithDetails = await Promise.all(
      items.map(async (item: any) => {
        try {
          const detailUrl = `${QOO10_API_BASE}/ItemsLookup.GetItemDetailInfo`;
          const detailParams = new URLSearchParams();
          detailParams.append("returnType", "application/json");
          detailParams.append("ItemCode", item.ItemCode);

          const detailResponse = await fetch(detailUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "GiosisCertificationKey": apiKey,
              "QAPIVersion": "1.0",
            },
            body: detailParams.toString(),
          });

          const detailData = await detailResponse.json() as any;

          if (detailData.ResultCode === 0 || detailData.ResultCode === "0") {
            // ResultObjectは配列で返される
            const details = detailData.ResultObject || [];
            const detail = Array.isArray(details) ? details[0] : details;
            if (detail) {
              return {
                itemCode: item.ItemCode,
                sellerCode: item.SellerCode,
                itemTitle: detail.ItemTitle || detail.GdNm || item.SellerCode,
                itemPrice: detail.SellPrice || detail.ItemPrice || detail.SellerPrice || 0,
                itemQty: detail.ItemQty || detail.StockQty || 0,
                itemStatus: item.ItemStatus,
              };
            }
          }
        } catch (err) {
          console.error(`Error fetching detail for ${item.ItemCode}:`, err);
        }
        // 詳細取得失敗時はSellerCodeを名前として使用
        return {
          itemCode: item.ItemCode,
          sellerCode: item.SellerCode,
          itemTitle: item.SellerCode, // フォールバック
          itemPrice: 0,
          itemQty: 0,
          itemStatus: item.ItemStatus,
        };
      })
    );

    res.json({
      success: true,
      message: `${productsWithDetails.length}件の商品を取得しました`,
      count: productsWithDetails.length,
      products: productsWithDetails,
    });

  } catch (error) {
    console.error("Error fetching Qoo10 products with details:", error);
    res.status(500).json({
      success: false,
      message: "Qoo10商品一覧の取得に失敗しました",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Qoo10 商品別売上データ取得
app.get("/qoo10/product-sales/:itemCode", async (req: Request, res: Response) => {
  try {
    const itemCode = req.params.itemCode;
    console.log(`Qoo10 product sales endpoint triggered for: ${itemCode}`);

    // FirestoreからAPIキーを取得
    const settingsDoc = await db.collection("settings").doc("mall_credentials").get();

    if (!settingsDoc.exists) {
      return res.status(400).json({
        success: false,
        message: "APIキーが設定されていません。",
      });
    }

    const settings = settingsDoc.data();
    const apiKey = settings?.qoo10?.apiKey;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        message: "Qoo10のAPIキーが設定されていません。",
      });
    }

    // 日付範囲を設定（クエリパラメータから取得、デフォルトは過去30日）
    const queryStartDate = req.query.startDate as string;
    const queryEndDate = req.query.endDate as string;

    const endDate = queryEndDate ? new Date(queryEndDate) : new Date();
    const startDate = queryStartDate ? new Date(queryStartDate) : new Date();
    if (!queryStartDate) {
      startDate.setDate(endDate.getDate() - 30);
    }

    const sDate = formatDateForQoo10(startDate);
    const eDate = formatDateForQoo10(endDate);

    // Qoo10 APIから注文データを取得
    const apiResponse = await fetchQoo10Orders(apiKey, sDate, eDate);

    if (apiResponse.ResultCode !== 0 && apiResponse.ResultCode !== "0") {
      return res.status(400).json({
        success: false,
        message: `Qoo10 API Error: ${apiResponse.ResultMsg || "Unknown error"}`,
      });
    }

    const orders = apiResponse.ResultObject || [];

    if (!Array.isArray(orders) || orders.length === 0) {
      return res.json({
        success: true,
        message: "指定期間に注文データがありません",
        itemCode,
        dailySales: [],
      });
    }

    // 指定商品コードでフィルタリング
    // 注文データのItemNo（Qoo10商品番号）またはSellerItemCode（販売者商品コード）でマッチング
    const filteredOrders = orders.filter((order: any) => {
      const orderItemNo = order.ItemNo || order.itemNo || "";
      const orderSellerItemCode = order.SellerItemCode || order.sellerItemCode || "";
      return orderItemNo === itemCode || orderSellerItemCode === itemCode;
    });

    console.log(`Filtering orders for itemCode: ${itemCode}`);
    console.log(`Total orders: ${orders.length}, Filtered: ${filteredOrders.length}`);
    if (orders.length > 0) {
      console.log(`Sample order ItemNo: ${orders[0].ItemNo}, SellerItemCode: ${orders[0].SellerItemCode}`);
    }

    // 日次売上に集計
    const dailySalesMap = new Map<string, { sales: number; quantity: number }>();

    for (const order of filteredOrders) {
      // 注文日を取得
      const orderDateStr = order.OrderDate || order.orderDate || order.PayDate || "";
      const dateMatch = orderDateStr.match(/^(\d{4})-?(\d{2})-?(\d{2})/);

      if (dateMatch) {
        const dateKey = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
        // GMV（流通総額）ベースで計算: (OrderPrice + OptionPrice) * OrderQty
        // 割引は減算しない（アナリティクス定義に合わせる）
        const orderPrice = parseFloat(order.OrderPrice || order.orderPrice || 0);
        const optionPrice = parseFloat(order.OptionPrice || order.optionPrice || 0);
        const qty = parseInt(order.OrderQty || order.orderQty || 1);
        const amount = (orderPrice + optionPrice) * qty;

        if (dailySalesMap.has(dateKey)) {
          const existing = dailySalesMap.get(dateKey)!;
          dailySalesMap.set(dateKey, {
            sales: existing.sales + amount,
            quantity: existing.quantity + qty,
          });
        } else {
          dailySalesMap.set(dateKey, { sales: amount, quantity: qty });
        }
      }
    }

    // 指定期間のすべての日付を生成（売上0の日も含める）
    const allDates: string[] = [];
    const currentDate = new Date(startDate);
    const endDateObj = new Date(endDate);
    while (currentDate <= endDateObj) {
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const day = String(currentDate.getDate()).padStart(2, '0');
      allDates.push(`${year}-${month}-${day}`);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // すべての日付に対してデータを生成（売上がない日は0）
    const dailySales = allDates.map(date => {
      const data = dailySalesMap.get(date);
      return {
        date,
        sales: data ? Math.round(data.sales) : 0,
        quantity: data ? data.quantity : 0,
      };
    });

    res.json({
      success: true,
      message: `${filteredOrders.length}件の注文を取得しました`,
      itemCode,
      period: { startDate: sDate, endDate: eDate },
      orderCount: filteredOrders.length,
      dailySales,
    });

  } catch (error) {
    console.error("Error fetching product sales:", error);
    res.status(500).json({
      success: false,
      message: "商品別売上データの取得に失敗しました",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// ==================== End Qoo10 API連携 ====================

// ==================== Amazon SP-API連携 ====================

// 文字列のデバッグ情報を取得
function getStringDebugInfo(str: string, name: string): object {
  const trimmed = str.trim();
  return {
    name,
    originalLength: str.length,
    trimmedLength: trimmed.length,
    byteLength: Buffer.byteLength(str, 'utf8'),
    trimmedByteLength: Buffer.byteLength(trimmed, 'utf8'),
    hasLeadingWhitespace: str !== str.trimStart(),
    hasTrailingWhitespace: str !== str.trimEnd(),
    firstCharCode: str.charCodeAt(0),
    lastCharCode: str.charCodeAt(str.length - 1),
    first10Chars: str.substring(0, 10),
    last10Chars: str.substring(str.length - 10),
    // 制御文字の検出
    hasControlChars: /[\x00-\x1F\x7F]/.test(str),
  };
}

// Amazon SP-APIアクセストークン取得（デバッグ情報付き）
async function getAmazonAccessTokenDebug(credentials: {
  lwaClientId: string;
  lwaClientSecret: string;
  refreshToken: string;
}): Promise<{ accessToken?: string; debugInfo: any; error?: any }> {
  const axios = (await import('axios')).default;

  // トリミング処理
  const clientId = credentials.lwaClientId.trim();
  const clientSecret = credentials.lwaClientSecret.trim();
  const refreshToken = credentials.refreshToken.trim();

  // リクエストボディを構築
  const requestBody = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  }).toString();

  // LWAエンドポイント（Production）
  // Sandbox: https://api.amazon.com/auth/O2/token (大文字O)
  // Production: https://api.amazon.com/auth/o2/token (小文字o)
  const lwaEndpoint = 'https://api.amazon.com/auth/o2/token';

  const debugInfo = {
    credentials: {
      clientId: getStringDebugInfo(credentials.lwaClientId, 'lwaClientId'),
      clientSecret: getStringDebugInfo(credentials.lwaClientSecret, 'lwaClientSecret'),
      refreshToken: getStringDebugInfo(credentials.refreshToken, 'refreshToken'),
    },
    trimmedCredentials: {
      clientIdLength: clientId.length,
      clientSecretLength: clientSecret.length,
      refreshTokenLength: refreshToken.length,
    },
    request: {
      endpoint: lwaEndpoint,
      method: 'POST',
      contentType: 'application/x-www-form-urlencoded',
      bodyLength: requestBody.length,
      // 機密情報をマスク
      bodyPreview: requestBody.replace(/client_secret=[^&]+/, 'client_secret=***MASKED***')
        .replace(/refresh_token=[^&]+/, 'refresh_token=***MASKED***'),
    },
    spApiEndpoints: {
      production: 'https://sellingpartnerapi-fe.amazon.com',
      sandbox: 'https://sandbox.sellingpartnerapi-fe.amazon.com',
      note: 'Japan uses Far East (fe) endpoint',
    },
  };

  try {
    const response = await axios.post(lwaEndpoint, requestBody, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    return {
      accessToken: response.data.access_token,
      debugInfo: {
        ...debugInfo,
        response: {
          status: response.status,
          hasAccessToken: !!response.data.access_token,
          tokenType: response.data.token_type,
          expiresIn: response.data.expires_in,
        },
      },
    };
  } catch (error: any) {
    return {
      debugInfo: {
        ...debugInfo,
        error: {
          message: error.message,
          responseStatus: error.response?.status,
          responseData: error.response?.data,
          requestHeaders: error.config?.headers,
        },
      },
      error: error.response?.data || error.message,
    };
  }
}

// Exponential Backoff付きリクエスト関数
async function fetchWithRetry<T>(
  requestFn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
  } = {}
): Promise<T> {
  const {
    maxRetries = 5,
    initialDelayMs = 1000,
    maxDelayMs = 60000,
    backoffMultiplier = 2,
  } = options;

  let lastError: any;
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await requestFn();
    } catch (error: any) {
      lastError = error;
      const status = error?.response?.status;
      const errorMessage = error?.response?.data?.errors?.[0]?.message || error?.message || '';

      // 429 (Too Many Requests) または quota exceeded の場合はリトライ
      const isRateLimited = status === 429 ||
        errorMessage.toLowerCase().includes('quota') ||
        errorMessage.toLowerCase().includes('rate') ||
        errorMessage.toLowerCase().includes('throttl');

      if (!isRateLimited || attempt === maxRetries) {
        throw error;
      }

      console.log(`Rate limited (attempt ${attempt + 1}/${maxRetries + 1}). Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));

      // 次回の遅延時間を計算（Exponential Backoff + jitter）
      const jitter = Math.random() * 0.3 * delay; // 0-30%のジッター
      delay = Math.min(delay * backoffMultiplier + jitter, maxDelayMs);
    }
  }

  throw lastError;
}

// Amazon SP-APIアクセストークン取得
async function getAmazonAccessToken(credentials: {
  lwaClientId: string;
  lwaClientSecret: string;
  refreshToken: string;
}): Promise<string> {
  const axios = (await import('axios')).default;

  // トリミング処理を追加
  const clientId = credentials.lwaClientId.trim();
  const clientSecret = credentials.lwaClientSecret.trim();
  const refreshToken = credentials.refreshToken.trim();

  const response = await axios.post(
    'https://api.amazon.com/auth/o2/token',
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  return response.data.access_token;
}

// Amazon SP-API デバッグエンドポイント
app.get("/amazon/debug", async (req: Request, res: Response) => {
  try {
    console.log("Amazon debug endpoint triggered");

    // FirestoreからAPI認証情報を取得
    const settingsDoc = await db.collection("settings").doc("mall_credentials").get();

    if (!settingsDoc.exists) {
      return res.status(400).json({
        success: false,
        message: "API認証情報が設定されていません。",
      });
    }

    const settings = settingsDoc.data();
    const amazonCreds = settings?.amazon;

    if (!amazonCreds?.lwaClientId || !amazonCreds?.lwaClientSecret || !amazonCreds?.refreshToken) {
      return res.status(400).json({
        success: false,
        message: "Amazon SP-APIの認証情報が不完全です。",
        debug: {
          hasClientId: !!amazonCreds?.lwaClientId,
          hasClientSecret: !!amazonCreds?.lwaClientSecret,
          hasRefreshToken: !!amazonCreds?.refreshToken,
        },
      });
    }

    // デバッグ情報付きでアクセストークン取得を試行
    const result = await getAmazonAccessTokenDebug({
      lwaClientId: amazonCreds.lwaClientId,
      lwaClientSecret: amazonCreds.lwaClientSecret,
      refreshToken: amazonCreds.refreshToken,
    });

    if (result.error) {
      return res.status(400).json({
        success: false,
        message: "LWA認証に失敗しました",
        debugInfo: result.debugInfo,
        error: result.error,
      });
    }

    // 認証成功した場合、SP-APIエンドポイントもテスト
    const axios = (await import('axios')).default;
    let spApiTest = null;

    try {
      const testResponse = await axios.get(
        'https://sellingpartnerapi-fe.amazon.com/sellers/v1/marketplaceParticipations',
        {
          headers: {
            'x-amz-access-token': result.accessToken,
            'Content-Type': 'application/json',
          },
        }
      );
      spApiTest = {
        success: true,
        status: testResponse.status,
        participations: testResponse.data?.payload?.length || 0,
      };
    } catch (spError: any) {
      spApiTest = {
        success: false,
        error: spError.response?.data || spError.message,
        status: spError.response?.status,
      };
    }

    res.json({
      success: true,
      message: "LWA認証成功",
      debugInfo: result.debugInfo,
      spApiTest,
    });

  } catch (error: any) {
    console.error("Amazon debug error:", error);
    res.status(500).json({
      success: false,
      message: "デバッグ中にエラーが発生しました",
      error: error.message,
    });
  }
});

// Amazon商品一覧取得エンドポイント（キャッシュ付き）
app.get("/amazon/products", async (req: Request, res: Response) => {
  try {
    console.log("Amazon products endpoint triggered");
    const forceRefresh = req.query.refresh === 'true';

    // まずキャッシュをチェック（refresh=trueでない場合）
    if (!forceRefresh) {
      const cacheDoc = await db.collection("settings").doc("amazon_products_cache").get();
      if (cacheDoc.exists) {
        const cacheData = cacheDoc.data();
        const cachedAt = cacheData?.cachedAt?.toDate?.() || new Date(cacheData?.cachedAt);
        const hoursSinceCache = (Date.now() - cachedAt.getTime()) / (1000 * 60 * 60);

        // 24時間以内のキャッシュがあれば返す
        if (hoursSinceCache < 24 && cacheData?.products) {
          console.log(`Returning cached Amazon products (${cacheData.products.length} items, cached ${hoursSinceCache.toFixed(1)}h ago)`);
          return res.json({
            success: true,
            products: cacheData.products,
            count: cacheData.products.length,
            cached: true,
            cachedAt: cachedAt.toISOString(),
          });
        }
      }
    }

    const axios = (await import('axios')).default;

    // FirestoreからAPI認証情報を取得
    const settingsDoc = await db.collection("settings").doc("mall_credentials").get();

    if (!settingsDoc.exists) {
      return res.status(400).json({
        success: false,
        message: "API認証情報が設定されていません。",
      });
    }

    const settings = settingsDoc.data();
    const amazonCreds = settings?.amazon;

    if (!amazonCreds?.lwaClientId || !amazonCreds?.lwaClientSecret || !amazonCreds?.refreshToken) {
      return res.status(400).json({
        success: false,
        message: "Amazon SP-APIの認証情報が不完全です。",
      });
    }

    // アクセストークン取得
    const accessToken = await getAmazonAccessToken({
      lwaClientId: amazonCreds.lwaClientId,
      lwaClientSecret: amazonCreds.lwaClientSecret,
      refreshToken: amazonCreds.refreshToken,
    });

    // SP-API: Sellers API を使って自分のSeller IDを取得
    const sellersResponse = await axios.get(
      'https://sellingpartnerapi-fe.amazon.com/sellers/v1/marketplaceParticipations',
      {
        headers: {
          'x-amz-access-token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );

    // 最初のマーケットプレイス参加情報からSeller IDを取得
    const participations = sellersResponse.data?.payload || [];
    const jpParticipation = participations.find(
      (p: any) => p.marketplace?.id === 'A1VC38T7YXB528' // Amazon.co.jp
    ) || participations[0];

    if (!jpParticipation) {
      return res.status(400).json({
        success: false,
        message: "Amazon マーケットプレイス参加情報が見つかりません。",
      });
    }

    const sellerId = jpParticipation.seller?.sellerId;
    console.log("Amazon Seller ID:", sellerId);

    // SP-API: Reports API を使用して出品レポートを取得
    // まずレポート作成をリクエスト
    const reportResponse = await axios.post(
      'https://sellingpartnerapi-fe.amazon.com/reports/2021-06-30/reports',
      {
        reportType: 'GET_MERCHANT_LISTINGS_ALL_DATA',
        marketplaceIds: ['A1VC38T7YXB528'], // Amazon.co.jp
      },
      {
        headers: {
          'x-amz-access-token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );

    const reportId = reportResponse.data?.reportId;
    console.log("Report ID:", reportId);

    // レポートの生成完了を待つ（最大30秒）
    let reportStatus = 'IN_QUEUE';
    let reportDocumentId = null;
    let attempts = 0;
    const maxAttempts = 15;

    while (reportStatus !== 'DONE' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;

      const statusResponse = await axios.get(
        `https://sellingpartnerapi-fe.amazon.com/reports/2021-06-30/reports/${reportId}`,
        {
          headers: {
            'x-amz-access-token': accessToken,
          },
        }
      );

      reportStatus = statusResponse.data?.processingStatus;
      reportDocumentId = statusResponse.data?.reportDocumentId;
      console.log(`Report status (attempt ${attempts}):`, reportStatus);

      if (reportStatus === 'FATAL' || reportStatus === 'CANCELLED') {
        throw new Error(`Report generation failed: ${reportStatus}`);
      }
    }

    if (!reportDocumentId) {
      return res.status(500).json({
        success: false,
        message: "レポート生成がタイムアウトしました。しばらく待ってから再試行してください。",
      });
    }

    // レポートドキュメントのダウンロードURL取得
    const docResponse = await axios.get(
      `https://sellingpartnerapi-fe.amazon.com/reports/2021-06-30/documents/${reportDocumentId}`,
      {
        headers: {
          'x-amz-access-token': accessToken,
        },
      }
    );

    const downloadUrl = docResponse.data?.url;

    // レポートをダウンロード（バイナリとして取得してShift_JISからデコード）
    const reportDataResponse = await axios.get(downloadUrl, {
      responseType: 'arraybuffer',
    });

    // Shift_JIS（CP932）からUTF-8にデコード
    const iconv = await import('iconv-lite');
    const decodedData = iconv.decode(Buffer.from(reportDataResponse.data), 'CP932');

    // TSVをパース
    const lines = decodedData.split('\n');
    const headers = lines[0].split('\t');

    // デバッグ: ヘッダーの内容をログ出力
    console.log("Report headers:", headers);
    console.log("First data line:", lines[1]?.split('\t'));

    // 日本語ヘッダーに対応したカラム検索
    const skuIndex = headers.findIndex((h: string) =>
      h === '出品者SKU' || h.toLowerCase() === 'seller-sku' || h.toLowerCase() === 'sku'
    );
    const titleIndex = headers.findIndex((h: string) =>
      h === '商品名' || h.toLowerCase() === 'item-name' || h.toLowerCase() === 'product-name'
    );
    const asinIndex = headers.findIndex((h: string) =>
      h === '商品ID' || h === 'ASIN' || h.toLowerCase() === 'asin1' || h.toLowerCase() === 'asin'
    );

    console.log("Column indices - SKU:", skuIndex, "Title:", titleIndex, "ASIN:", asinIndex);

    const products = lines.slice(1).filter((line: string) => line.trim()).map((line: string) => {
      const cols = line.split('\t');
      return {
        code: cols[skuIndex] || '',
        name: titleIndex >= 0 && cols[titleIndex] ? cols[titleIndex] : (cols[skuIndex] || 'Unknown'),
        asin: asinIndex >= 0 ? (cols[asinIndex] || '') : '',
        sku: cols[skuIndex] || '',
      };
    }).filter((p: any) => p.code);

    // キャッシュに保存
    await db.collection("settings").doc("amazon_products_cache").set({
      products,
      cachedAt: Timestamp.now(),
      count: products.length,
    });
    console.log(`Cached ${products.length} Amazon products`);

    res.json({
      success: true,
      products,
      count: products.length,
      cached: false,
    });

  } catch (error: any) {
    console.error("Error fetching Amazon products:", error?.response?.data || error);
    res.status(500).json({
      success: false,
      message: "Amazon商品一覧の取得に失敗しました",
      error: error?.response?.data?.errors?.[0]?.message || error?.message || "Unknown error",
    });
  }
});

// Amazon売上データ取得エンドポイント（Orders API使用）
app.get("/amazon/sales", async (req: Request, res: Response) => {
  try {
    console.log("Amazon sales endpoint triggered");
    const axios = (await import('axios')).default;

    // クエリパラメータから期間を取得（デフォルト: 過去30日）
    const endDate = req.query.endDate as string || new Date().toISOString().split('T')[0];
    const startDateParam = req.query.startDate as string;

    let startDate: string;
    if (startDateParam) {
      startDate = startDateParam;
    } else {
      const start = new Date();
      start.setDate(start.getDate() - 30);
      startDate = start.toISOString().split('T')[0];
    }

    console.log(`Fetching Amazon sales from ${startDate} to ${endDate}`);

    // FirestoreからAPI認証情報を取得
    const settingsDoc = await db.collection("settings").doc("mall_credentials").get();

    if (!settingsDoc.exists) {
      return res.status(400).json({
        success: false,
        message: "API認証情報が設定されていません。",
      });
    }

    const settings = settingsDoc.data();
    const amazonCreds = settings?.amazon;

    if (!amazonCreds?.lwaClientId || !amazonCreds?.lwaClientSecret || !amazonCreds?.refreshToken) {
      return res.status(400).json({
        success: false,
        message: "Amazon SP-APIの認証情報が不完全です。",
      });
    }

    // アクセストークン取得
    const accessToken = await getAmazonAccessToken({
      lwaClientId: amazonCreds.lwaClientId,
      lwaClientSecret: amazonCreds.lwaClientSecret,
      refreshToken: amazonCreds.refreshToken,
    });

    // SP-API: Orders API を使用して注文を取得
    // 注文を取得（ページネーション対応）
    let allOrders: any[] = [];
    let nextToken: string | null = null;
    let pageCount = 0;
    const maxPages = 10; // 最大10ページ（1000件）

    // CreatedBeforeは現在時刻の2分前以前にする必要がある
    const now = new Date();
    const twoMinutesAgo = new Date(now.getTime() - 3 * 60 * 1000); // 3分前に設定（安全マージン）
    const endDateObj = new Date(`${endDate}T23:59:59Z`);
    const createdBefore = endDateObj > twoMinutesAgo ? twoMinutesAgo.toISOString() : `${endDate}T23:59:59Z`;

    do {
      const params: any = {
        MarketplaceIds: 'A1VC38T7YXB528', // Amazon.co.jp
        CreatedAfter: `${startDate}T00:00:00Z`,
        CreatedBefore: createdBefore,
        OrderStatuses: 'Shipped,Unshipped,PartiallyShipped',
        MaxResultsPerPage: 100,
      };

      if (nextToken) {
        params.NextToken = nextToken;
      }

      console.log(`Fetching orders page ${pageCount + 1}...`);

      // Exponential Backoff付きでOrders APIを呼び出し
      const ordersResponse = await fetchWithRetry(
        () => axios.get(
          'https://sellingpartnerapi-fe.amazon.com/orders/v0/orders',
          {
            params,
            headers: {
              'x-amz-access-token': accessToken,
              'Content-Type': 'application/json',
            },
          }
        ),
        { maxRetries: 5, initialDelayMs: 2000, maxDelayMs: 60000 }
      );

      const orders = ordersResponse.data?.payload?.Orders || [];
      allOrders = allOrders.concat(orders);
      nextToken = ordersResponse.data?.payload?.NextToken || null;
      pageCount++;

      console.log(`Got ${orders.length} orders, total: ${allOrders.length}`);

      // レート制限対策
      if (nextToken && pageCount < maxPages) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

    } while (nextToken && pageCount < maxPages);

    console.log(`Total orders fetched: ${allOrders.length}`);

    // 日別集計とSKU別集計
    const dailySales: { [date: string]: { sales: number; quantity: number; orderCount: number } } = {};
    const orderDetails: any[] = [];

    for (const order of allOrders) {
      const purchaseDate = order.PurchaseDate;
      const orderTotal = parseFloat(order.OrderTotal?.Amount || '0');

      // 日付を YYYY-MM-DD 形式に変換
      let dateKey = '';
      if (purchaseDate) {
        try {
          const d = new Date(purchaseDate);
          dateKey = d.toISOString().split('T')[0];
        } catch (e) {
          dateKey = purchaseDate.split('T')[0];
        }
      }

      // 日別集計
      if (dateKey) {
        if (!dailySales[dateKey]) {
          dailySales[dateKey] = { sales: 0, quantity: 0, orderCount: 0 };
        }
        dailySales[dateKey].sales += orderTotal;
        dailySales[dateKey].quantity += order.NumberOfItemsShipped || order.NumberOfItemsUnshipped || 1;
        dailySales[dateKey].orderCount += 1;
      }

      orderDetails.push({
        orderId: order.AmazonOrderId,
        purchaseDate: dateKey,
        orderStatus: order.OrderStatus,
        orderTotal,
        currency: order.OrderTotal?.CurrencyCode || 'JPY',
        numberOfItems: order.NumberOfItemsShipped || order.NumberOfItemsUnshipped || 0,
      });
    }

    // 日別売上を配列に変換（日付順）
    const dailySalesArray = Object.entries(dailySales)
      .map(([date, data]) => ({
        date,
        sales: Math.round(data.sales),
        quantity: data.quantity,
        orderCount: data.orderCount,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // 合計計算
    const totalSales = dailySalesArray.reduce((sum, d) => sum + d.sales, 0);
    const totalQuantity = dailySalesArray.reduce((sum, d) => sum + d.quantity, 0);
    const totalOrderCount = dailySalesArray.reduce((sum, d) => sum + d.orderCount, 0);

    // Firestoreにキャッシュ保存
    await db.collection("settings").doc("amazon_sales_cache").set({
      startDate,
      endDate,
      dailySales: dailySalesArray,
      totalSales,
      totalQuantity,
      orderCount: totalOrderCount,
      cachedAt: Timestamp.now(),
    });

    res.json({
      success: true,
      period: { startDate, endDate },
      summary: {
        totalSales,
        totalQuantity,
        orderCount: totalOrderCount,
        daysCount: dailySalesArray.length,
      },
      dailySales: dailySalesArray,
    });

  } catch (error: any) {
    console.error("Error fetching Amazon sales:", error?.response?.data || error);
    res.status(500).json({
      success: false,
      message: "Amazon売上データの取得に失敗しました",
      error: error?.response?.data?.errors?.[0]?.message || error?.message || "Unknown error",
    });
  }
});

// Amazon売上をFirestoreのsales_dataに同期するエンドポイント
app.post("/amazon/sync-sales", async (req: Request, res: Response) => {
  try {
    console.log("Amazon sync-sales endpoint triggered");
    const axios = (await import('axios')).default;

    // クエリパラメータまたはボディから期間を取得
    const endDate = req.body.endDate || req.query.endDate as string || new Date().toISOString().split('T')[0];
    const startDateParam = req.body.startDate || req.query.startDate as string;

    let startDate: string;
    if (startDateParam) {
      startDate = startDateParam;
    } else {
      const start = new Date();
      start.setDate(start.getDate() - 30);
      startDate = start.toISOString().split('T')[0];
    }

    console.log(`Syncing Amazon sales from ${startDate} to ${endDate}`);

    // FirestoreからAPI認証情報を取得
    const settingsDoc = await db.collection("settings").doc("mall_credentials").get();

    if (!settingsDoc.exists) {
      return res.status(400).json({
        success: false,
        message: "API認証情報が設定されていません。",
      });
    }

    const settings = settingsDoc.data();
    const amazonCreds = settings?.amazon;

    if (!amazonCreds?.lwaClientId || !amazonCreds?.lwaClientSecret || !amazonCreds?.refreshToken) {
      return res.status(400).json({
        success: false,
        message: "Amazon SP-APIの認証情報が不完全です。",
      });
    }

    // アクセストークン取得
    const accessToken = await getAmazonAccessToken({
      lwaClientId: amazonCreds.lwaClientId,
      lwaClientSecret: amazonCreds.lwaClientSecret,
      refreshToken: amazonCreds.refreshToken,
    });

    // Orders API で注文を取得
    let allOrders: any[] = [];
    let nextToken: string | null = null;
    let pageCount = 0;
    const maxPages = 20; // より多くのデータを取得

    const now = new Date();
    const twoMinutesAgo = new Date(now.getTime() - 3 * 60 * 1000);
    const endDateObj = new Date(`${endDate}T23:59:59Z`);
    const createdBefore = endDateObj > twoMinutesAgo ? twoMinutesAgo.toISOString() : `${endDate}T23:59:59Z`;

    do {
      const params: any = {
        MarketplaceIds: 'A1VC38T7YXB528',
        CreatedAfter: `${startDate}T00:00:00Z`,
        CreatedBefore: createdBefore,
        OrderStatuses: 'Shipped,Unshipped,PartiallyShipped',
        MaxResultsPerPage: 100,
      };

      if (nextToken) {
        params.NextToken = nextToken;
      }

      // Exponential Backoff付きでOrders APIを呼び出し
      const ordersResponse = await fetchWithRetry(
        () => axios.get(
          'https://sellingpartnerapi-fe.amazon.com/orders/v0/orders',
          {
            params,
            headers: {
              'x-amz-access-token': accessToken,
              'Content-Type': 'application/json',
            },
          }
        ),
        { maxRetries: 5, initialDelayMs: 2000, maxDelayMs: 60000 }
      );

      const orders = ordersResponse.data?.payload?.Orders || [];
      allOrders = allOrders.concat(orders);
      nextToken = ordersResponse.data?.payload?.NextToken || null;
      pageCount++;

      if (nextToken && pageCount < maxPages) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 基本待機時間を増加
      }

    } while (nextToken && pageCount < maxPages);

    console.log(`Total orders fetched: ${allOrders.length}`);

    // 日別に集計
    const dailySales: { [date: string]: { sales: number; quantity: number; orderCount: number } } = {};

    for (const order of allOrders) {
      const purchaseDate = order.PurchaseDate;
      const orderTotal = parseFloat(order.OrderTotal?.Amount || '0');

      let dateKey = '';
      if (purchaseDate) {
        try {
          const d = new Date(purchaseDate);
          dateKey = d.toISOString().split('T')[0];
        } catch (e) {
          dateKey = purchaseDate.split('T')[0];
        }
      }

      if (dateKey) {
        if (!dailySales[dateKey]) {
          dailySales[dateKey] = { sales: 0, quantity: 0, orderCount: 0 };
        }
        dailySales[dateKey].sales += orderTotal;
        dailySales[dateKey].quantity += order.NumberOfItemsShipped || order.NumberOfItemsUnshipped || 1;
        dailySales[dateKey].orderCount += 1;
      }
    }

    // Firestoreのsales_dataに保存（日付をドキュメントIDとして使用）
    let syncedCount = 0;
    for (const [date, data] of Object.entries(dailySales)) {
      const docRef = db.collection("sales_data").doc(date);
      const existingDoc = await docRef.get();

      const updateData: any = {
        date,
        amazon: Math.round(data.sales),
        updatedAt: Timestamp.now(),
      };

      if (existingDoc.exists) {
        // 既存のドキュメントがあればAmazonのデータだけ更新
        await docRef.update(updateData);
      } else {
        // 新規作成（他のモールは0で初期化）
        await docRef.set({
          ...updateData,
          rakuten: 0,
          qoo10: 0,
          amazonAd: 0,
          rakutenAd: 0,
          qoo10Ad: 0,
          xAd: 0,
          tiktokAd: 0,
          createdAt: Timestamp.now(),
        });
      }
      syncedCount++;
    }

    res.json({
      success: true,
      message: `Amazon売上データを${syncedCount}日分同期しました`,
      period: { startDate, endDate },
      syncedDays: syncedCount,
      totalOrders: allOrders.length,
      totalSales: Object.values(dailySales).reduce((sum, d) => sum + d.sales, 0),
    });

  } catch (error: any) {
    console.error("Error syncing Amazon sales:", error?.response?.data || error);
    res.status(500).json({
      success: false,
      message: "Amazon売上データの同期に失敗しました",
      error: error?.response?.data?.errors?.[0]?.message || error?.message || "Unknown error",
    });
  }
});

// Amazon商品別売上データ取得エンドポイント
app.get("/amazon/product-sales/:sku", async (req: Request, res: Response) => {
  try {
    const sku = req.params.sku;
    const startDate = req.query.startDate as string || (() => {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return d.toISOString().split('T')[0];
    })();
    const endDate = req.query.endDate as string || new Date().toISOString().split('T')[0];
    const forceRefresh = req.query.forceRefresh === 'true';

    console.log(`Amazon product sales for SKU: ${sku}, period: ${startDate} to ${endDate}, forceRefresh: ${forceRefresh}`);

    // まずFirestoreのproduct_salesからキャッシュを確認（forceRefreshがfalseの場合のみ）
    if (!forceRefresh) {
      const cacheDoc = await db.collection("settings").doc(`product_sales_cache_${sku}`).get();

      if (cacheDoc.exists) {
        const cacheData = cacheDoc.data();
        const cachedAt = cacheData?.cachedAt?.toDate?.() || new Date(cacheData?.cachedAt);
        const hoursSinceCache = (Date.now() - cachedAt.getTime()) / (1000 * 60 * 60);

        if (hoursSinceCache < 6 && cacheData?.dailySales) {
          console.log(`Returning cached Amazon product sales for ${sku}`);
          return res.json({
            success: true,
            sku,
            dailySales: cacheData.dailySales,
            cached: true,
          });
        }
      }
    } else {
      console.log(`Force refresh requested for ${sku}, skipping cache`);
    }

    const axios = (await import('axios')).default;

    // FirestoreからAPI認証情報を取得
    const settingsDoc = await db.collection("settings").doc("mall_credentials").get();
    if (!settingsDoc.exists) {
      return res.status(400).json({ success: false, message: "API認証情報が設定されていません" });
    }

    const settings = settingsDoc.data();
    const amazonCreds = settings?.amazon;
    if (!amazonCreds?.lwaClientId || !amazonCreds?.lwaClientSecret || !amazonCreds?.refreshToken) {
      return res.status(400).json({ success: false, message: "Amazon SP-APIの認証情報が不完全です" });
    }

    // アクセストークン取得
    const accessToken = await getAmazonAccessToken({
      lwaClientId: amazonCreds.lwaClientId,
      lwaClientSecret: amazonCreds.lwaClientSecret,
      refreshToken: amazonCreds.refreshToken,
    });

    // Orders API で注文を取得
    let allOrders: any[] = [];
    let nextToken: string | null = null;
    let pageCount = 0;
    const maxPages = 10;

    const now = new Date();
    const twoMinutesAgo = new Date(now.getTime() - 3 * 60 * 1000);
    const endDateObj = new Date(`${endDate}T23:59:59Z`);
    const createdBefore = endDateObj > twoMinutesAgo ? twoMinutesAgo.toISOString() : `${endDate}T23:59:59Z`;

    do {
      const params: any = {
        MarketplaceIds: 'A1VC38T7YXB528',
        CreatedAfter: `${startDate}T00:00:00Z`,
        CreatedBefore: createdBefore,
        OrderStatuses: 'Shipped,Unshipped,PartiallyShipped',
        MaxResultsPerPage: 100,
      };

      if (nextToken) {
        params.NextToken = nextToken;
      }

      // Exponential Backoff付きでOrders APIを呼び出し
      const ordersResponse = await fetchWithRetry(
        () => axios.get(
          'https://sellingpartnerapi-fe.amazon.com/orders/v0/orders',
          {
            params,
            headers: {
              'x-amz-access-token': accessToken,
              'Content-Type': 'application/json',
            },
          }
        ),
        { maxRetries: 5, initialDelayMs: 2000, maxDelayMs: 60000 }
      );

      const orders = ordersResponse.data?.payload?.Orders || [];
      allOrders = allOrders.concat(orders);
      nextToken = ordersResponse.data?.payload?.NextToken || null;
      pageCount++;

      if (nextToken && pageCount < maxPages) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 基本待機時間を増加
      }
    } while (nextToken && pageCount < maxPages);

    // 各注文のアイテムを取得してSKUでフィルタリング
    const dailySales: { [date: string]: { sales: number; quantity: number } } = {};
    let processedOrders = 0;

    for (const order of allOrders) {
      try {
        // Exponential Backoff付きで注文アイテムを取得
        const itemsResponse = await fetchWithRetry(
          () => axios.get(
            `https://sellingpartnerapi-fe.amazon.com/orders/v0/orders/${order.AmazonOrderId}/orderItems`,
            {
              headers: {
                'x-amz-access-token': accessToken,
                'Content-Type': 'application/json',
              },
            }
          ),
          { maxRetries: 5, initialDelayMs: 1000, maxDelayMs: 30000 }
        );

        const items = itemsResponse.data?.payload?.OrderItems || [];

        for (const item of items) {
          if (item.SellerSKU === sku) {
            const purchaseDate = order.PurchaseDate;
            let dateKey = '';
            if (purchaseDate) {
              try {
                dateKey = new Date(purchaseDate).toISOString().split('T')[0];
              } catch (e) {
                dateKey = purchaseDate.split('T')[0];
              }
            }

            if (dateKey) {
              if (!dailySales[dateKey]) {
                dailySales[dateKey] = { sales: 0, quantity: 0 };
              }
              const itemPrice = parseFloat(item.ItemPrice?.Amount || '0');
              const quantity = item.QuantityOrdered || 1;
              dailySales[dateKey].sales += itemPrice;
              dailySales[dateKey].quantity += quantity;
            }
          }
        }

        processedOrders++;
        // レート制限対策
        if (processedOrders % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (itemError: any) {
        console.error(`Error fetching items for order ${order.AmazonOrderId}:`, itemError.message);
      }
    }

    // 日別売上を配列に変換
    const dailySalesArray = Object.entries(dailySales)
      .map(([date, data]) => ({
        date,
        sales: Math.round(data.sales),
        quantity: data.quantity,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // SKUからproductIdを取得（ダッシュボード用）
    let productId: string | null = null;
    try {
      const productSnapshot = await db.collection("registered_products")
        .where("amazonCode", "==", sku)
        .limit(1)
        .get();
      if (!productSnapshot.empty) {
        productId = productSnapshot.docs[0].id;
      }
    } catch (e) {
      console.log("Could not find productId for SKU:", sku);
    }

    // product_salesコレクションに永続的に保存（日付ごとにドキュメント）
    for (const daySales of dailySalesArray) {
      const docId = `amazon_${sku}_${daySales.date}`;
      await db.collection("product_sales").doc(docId).set({
        productCode: sku,
        productId: productId || undefined,
        mall: 'amazon',
        date: daySales.date,
        sales: daySales.sales,
        quantity: daySales.quantity,
        updatedAt: Timestamp.now(),
      }, { merge: true });

      // amazon_daily_salesコレクションにも保存（ダッシュボードがこちらを参照）
      if (productId) {
        const amazonDocId = `${sku}_${daySales.date}`;
        await db.collection("amazon_daily_sales").doc(amazonDocId).set({
          productId,
          amazonCode: sku,
          date: daySales.date,
          salesAmount: daySales.sales,
          orderedUnits: daySales.quantity,
          source: 'sp_api',
          importedAt: new Date(),
        }, { merge: true });
      }
    }

    // キャッシュにも保存（API呼び出し削減用）
    await db.collection("settings").doc(`product_sales_cache_${sku}`).set({
      sku,
      productId: productId || undefined,
      dailySales: dailySalesArray,
      startDate,
      endDate,
      cachedAt: Timestamp.now(),
    });

    res.json({
      success: true,
      sku,
      productId: productId || undefined,
      dailySales: dailySalesArray,
      totalSales: dailySalesArray.reduce((sum, d) => sum + d.sales, 0),
      totalQuantity: dailySalesArray.reduce((sum, d) => sum + d.quantity, 0),
      savedToAmazonDailySales: !!productId,
      cached: false,
    });

  } catch (error: any) {
    console.error("Error fetching Amazon product sales:", error?.response?.data || error);
    res.status(500).json({
      success: false,
      message: "Amazon商品別売上の取得に失敗しました",
      error: error?.response?.data?.errors?.[0]?.message || error?.message || "Unknown error",
    });
  }
});

// Amazon全SKU売上一括取得エンドポイント（効率化版）
// 1回のAPI呼び出しで全注文を取得し、全SKUの売上を一括でFirestoreに保存
app.post("/amazon/sync-all-product-sales", async (req: Request, res: Response) => {
  try {
    const startDate = req.body.startDate || (() => {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return d.toISOString().split('T')[0];
    })();
    const endDate = req.body.endDate || new Date().toISOString().split('T')[0];

    console.log(`Amazon sync all product sales: ${startDate} to ${endDate}`);

    const axios = (await import('axios')).default;

    // FirestoreからAPI認証情報を取得
    const settingsDoc = await db.collection("settings").doc("mall_credentials").get();
    if (!settingsDoc.exists) {
      return res.status(400).json({ success: false, message: "API認証情報が設定されていません" });
    }

    const settings = settingsDoc.data();
    const amazonCreds = settings?.amazon;
    if (!amazonCreds?.lwaClientId || !amazonCreds?.lwaClientSecret || !amazonCreds?.refreshToken) {
      return res.status(400).json({ success: false, message: "Amazon SP-APIの認証情報が不完全です" });
    }

    // アクセストークン取得
    const accessToken = await getAmazonAccessToken({
      lwaClientId: amazonCreds.lwaClientId,
      lwaClientSecret: amazonCreds.lwaClientSecret,
      refreshToken: amazonCreds.refreshToken,
    });

    // 1. GetOrders APIで全注文を取得（ページネーションあり）
    let allOrders: any[] = [];
    let nextToken: string | null = null;
    let pageCount = 0;
    const maxPages = 20; // 最大2000件の注文

    const now = new Date();
    const twoMinutesAgo = new Date(now.getTime() - 3 * 60 * 1000);
    const endDateObj = new Date(`${endDate}T23:59:59Z`);
    const createdBefore = endDateObj > twoMinutesAgo ? twoMinutesAgo.toISOString() : `${endDate}T23:59:59Z`;

    console.log("Fetching all orders...");

    do {
      const params: any = {
        MarketplaceIds: 'A1VC38T7YXB528',
        CreatedAfter: `${startDate}T00:00:00Z`,
        CreatedBefore: createdBefore,
        OrderStatuses: 'Shipped,Unshipped,PartiallyShipped',
        MaxResultsPerPage: 100,
      };

      if (nextToken) {
        params.NextToken = nextToken;
      }

      const ordersResponse = await fetchWithRetry(
        () => axios.get(
          'https://sellingpartnerapi-fe.amazon.com/orders/v0/orders',
          {
            params,
            headers: {
              'x-amz-access-token': accessToken,
              'Content-Type': 'application/json',
            },
          }
        ),
        { maxRetries: 5, initialDelayMs: 2000, maxDelayMs: 60000 }
      );

      const orders = ordersResponse.data?.payload?.Orders || [];
      allOrders = allOrders.concat(orders);
      nextToken = ordersResponse.data?.payload?.NextToken || null;
      pageCount++;

      console.log(`Fetched page ${pageCount}: ${orders.length} orders (total: ${allOrders.length})`);

      if (nextToken && pageCount < maxPages) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } while (nextToken && pageCount < maxPages);

    console.log(`Total orders fetched: ${allOrders.length}`);

    // 2. 各注文のOrderItemsを取得（これが最もAPIを消費する）
    // SKU → 日付 → {sales, quantity} のマップ
    const skuSalesMap: { [sku: string]: { [date: string]: { sales: number; quantity: number } } } = {};
    let processedOrders = 0;
    let apiCallCount = 0;

    for (const order of allOrders) {
      try {
        apiCallCount++;
        const itemsResponse = await fetchWithRetry(
          () => axios.get(
            `https://sellingpartnerapi-fe.amazon.com/orders/v0/orders/${order.AmazonOrderId}/orderItems`,
            {
              headers: {
                'x-amz-access-token': accessToken,
                'Content-Type': 'application/json',
              },
            }
          ),
          { maxRetries: 5, initialDelayMs: 1000, maxDelayMs: 30000 }
        );

        const items = itemsResponse.data?.payload?.OrderItems || [];

        for (const item of items) {
          const sku = item.SellerSKU;
          if (!sku) continue;

          const purchaseDate = order.PurchaseDate;
          let dateKey = '';
          if (purchaseDate) {
            try {
              dateKey = new Date(purchaseDate).toISOString().split('T')[0];
            } catch (e) {
              dateKey = purchaseDate.split('T')[0];
            }
          }

          if (dateKey) {
            if (!skuSalesMap[sku]) {
              skuSalesMap[sku] = {};
            }
            if (!skuSalesMap[sku][dateKey]) {
              skuSalesMap[sku][dateKey] = { sales: 0, quantity: 0 };
            }
            const itemPrice = parseFloat(item.ItemPrice?.Amount || '0');
            const quantity = item.QuantityOrdered || 1;
            skuSalesMap[sku][dateKey].sales += itemPrice;
            skuSalesMap[sku][dateKey].quantity += quantity;
          }
        }

        processedOrders++;

        // レート制限対策：10件ごとに200ms待機
        if (processedOrders % 10 === 0) {
          console.log(`Processed ${processedOrders}/${allOrders.length} orders...`);
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (itemError: any) {
        console.error(`Error fetching items for order ${order.AmazonOrderId}:`, itemError.message);
      }
    }

    console.log(`Finished processing. API calls: ${apiCallCount}, SKUs found: ${Object.keys(skuSalesMap).length}`);

    // 3. SKUからproductIdのマッピングを取得
    const skuToProductId: { [sku: string]: string } = {};
    const productsSnapshot = await db.collection("registered_products").get();
    for (const doc of productsSnapshot.docs) {
      const data = doc.data();
      if (data.amazonCode) {
        skuToProductId[data.amazonCode] = doc.id;
      }
    }
    console.log(`Found ${Object.keys(skuToProductId).length} SKU-to-productId mappings`);

    // 4. Firestoreに一括保存（バッチ書き込み）
    const batch = db.batch();
    let batchCount = 0;
    const maxBatchSize = 400; // Firestoreバッチの最大サイズ（余裕を持たせる）

    for (const [sku, dateMap] of Object.entries(skuSalesMap)) {
      const productId = skuToProductId[sku];

      for (const [date, data] of Object.entries(dateMap)) {
        // product_salesコレクションに保存
        const docId = `amazon_${sku}_${date}`;
        const docRef = db.collection("product_sales").doc(docId);
        const productSalesData: any = {
          productCode: sku,
          mall: 'amazon',
          date,
          sales: Math.round(data.sales),
          quantity: data.quantity,
          updatedAt: Timestamp.now(),
        };
        if (productId) {
          productSalesData.productId = productId;
        }
        batch.set(docRef, productSalesData, { merge: true });
        batchCount++;

        // amazon_daily_salesコレクションにも保存（ダッシュボード用）
        if (productId) {
          const amazonDocRef = db.collection("amazon_daily_sales").doc(`${sku}_${date}`);
          batch.set(amazonDocRef, {
            productId,
            amazonCode: sku,
            date,
            salesAmount: Math.round(data.sales),
            orderedUnits: data.quantity,
            source: 'sp_api',
            importedAt: new Date(),
          }, { merge: true });
          batchCount++;
        }

        // バッチサイズ制限に達したらコミット
        if (batchCount >= maxBatchSize) {
          await batch.commit();
          console.log(`Committed batch of ${batchCount} documents`);
          batchCount = 0;
        }
      }
    }

    // 残りをコミット
    if (batchCount > 0) {
      await batch.commit();
      console.log(`Committed final batch of ${batchCount} documents`);
    }

    // 同期完了時刻を記録
    await db.collection("settings").doc("amazon_sync_status").set({
      lastSyncAt: Timestamp.now(),
      startDate,
      endDate,
      ordersProcessed: allOrders.length,
      skusFound: Object.keys(skuSalesMap).length,
      apiCallCount,
    });

    res.json({
      success: true,
      message: "Amazon全商品売上を同期しました",
      ordersProcessed: allOrders.length,
      skusFound: Object.keys(skuSalesMap).length,
      apiCallCount,
      skuList: Object.keys(skuSalesMap),
    });

  } catch (error: any) {
    console.error("Error syncing Amazon all product sales:", error?.response?.data || error);
    res.status(500).json({
      success: false,
      message: "Amazon全商品売上の同期に失敗しました",
      error: error?.response?.data?.errors?.[0]?.message || error?.message || "Unknown error",
    });
  }
});

// ==================== End Amazon SP-API連携 ====================

// ==================== 楽天RMS API連携 ====================

// 楽天RMS API認証ヘッダー生成
function getRakutenAuthHeader(serviceSecret: string, licenseKey: string): string {
  // 余分な空白やタブ文字をトリム
  const cleanServiceSecret = serviceSecret.trim();
  const cleanLicenseKey = licenseKey.trim();
  const authString = `${cleanServiceSecret}:${cleanLicenseKey}`;
  return `ESA ${Buffer.from(authString).toString('base64')}`;
}

// 楽天商品一覧取得エンドポイント
app.get("/rakuten/products", async (req: Request, res: Response) => {
  try {
    console.log("Rakuten products endpoint triggered");
    const axios = (await import('axios')).default;

    // FirestoreからAPI認証情報を取得
    const settingsDoc = await db.collection("settings").doc("mall_credentials").get();

    if (!settingsDoc.exists) {
      return res.status(400).json({
        success: false,
        message: "API認証情報が設定されていません。",
      });
    }

    const settings = settingsDoc.data();
    const rakutenCreds = settings?.rakuten;

    if (!rakutenCreds?.serviceSecret || !rakutenCreds?.licenseKey) {
      return res.status(400).json({
        success: false,
        message: "楽天RMS APIの認証情報が不完全です。",
      });
    }

    // 認証ヘッダー生成
    const authHeader = getRakutenAuthHeader(rakutenCreds.serviceSecret, rakutenCreds.licenseKey);

    // 楽天RMS API 2.0は商品API利用にはRMSへの申請が必要
    // 一旦、認証情報が設定されていることを確認してメッセージを返す
    console.log("Rakuten credentials found, API integration pending");

    // TODO: 楽天RMSの商品一括登録オプション契約と商品API 2.0の利用申請が必要
    // 現時点では空の商品リストを返す
    res.json({
      success: true,
      products: [],
      count: 0,
      message: "楽天RMS商品APIは準備中です。商品一括登録オプションの契約と商品API 2.0の利用申請が必要です。",
    });

  } catch (error: any) {
    console.error("Error fetching Rakuten products:", error?.response?.data || error);
    res.status(500).json({
      success: false,
      message: "楽天商品一覧の取得に失敗しました",
      error: error?.response?.data?.error?.message || error?.message || "Unknown error",
    });
  }
});

// 楽天受注データから商品リストを抽出するエンドポイント
app.post("/rakuten/extract-products-from-orders", async (req: Request, res: Response) => {
  try {
    console.log("Rakuten extract products from orders endpoint triggered");
    const axios = (await import('axios')).default;

    // FirestoreからAPI認証情報を取得
    const settingsDoc = await db.collection("settings").doc("mall_credentials").get();

    if (!settingsDoc.exists) {
      return res.status(400).json({
        success: false,
        message: "API認証情報が設定されていません。",
      });
    }

    const settings = settingsDoc.data();
    const rakutenCreds = settings?.rakuten;

    if (!rakutenCreds?.serviceSecret || !rakutenCreds?.licenseKey) {
      return res.status(400).json({
        success: false,
        message: "楽天RMS APIの認証情報が不完全です。",
      });
    }

    // 認証ヘッダー生成
    console.log("Rakuten credentials check:");
    console.log("  serviceSecret length:", rakutenCreds.serviceSecret?.length);
    console.log("  serviceSecret first 10 chars:", rakutenCreds.serviceSecret?.substring(0, 10));
    console.log("  licenseKey length:", rakutenCreds.licenseKey?.length);
    console.log("  licenseKey first 10 chars:", rakutenCreds.licenseKey?.substring(0, 10));

    const authHeader = getRakutenAuthHeader(rakutenCreds.serviceSecret, rakutenCreds.licenseKey);
    console.log("  Full auth header:", authHeader);

    // 30日前の日付を計算（より短い期間で試す）
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    // 楽天RMS APIの日付フォーマット: yyyy-MM-dd'T'HH:mm:ss+0900
    const formatDate = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}T00:00:00+0900`;
    };

    console.log("Search date range:", formatDate(startDate), "to", formatDate(endDate));

    // 楽天RMS 受注API (searchOrder) を呼び出し
    // エンドポイント: https://api.rms.rakuten.co.jp/es/2.0/order/searchOrder/
    // PHP サンプルに倣った最小限のリクエスト
    const requestBody = {
      dateType: 1, // 1: 注文日
      startDatetime: formatDate(startDate),
      endDatetime: formatDate(endDate),
      orderProgressList: [100, 200, 300, 400, 500, 600, 700, 800, 900],
      PaginationRequestModel: {
        requestRecordsAmount: 1000,
        requestPage: 1,
      },
    };

    console.log("searchOrder request URL:", 'https://api.rms.rakuten.co.jp/es/2.0/order/searchOrder/');
    console.log("searchOrder auth header:", authHeader.substring(0, 20) + '...');
    console.log("searchOrder request body:", JSON.stringify(requestBody, null, 2));

    const searchResponse = await axios.post(
      'https://api.rms.rakuten.co.jp/es/2.0/order/searchOrder/',
      requestBody,
      {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json; charset=utf-8',
        },
      }
    );

    console.log("searchOrder raw response:", JSON.stringify(searchResponse.data, null, 2).substring(0, 1000));

    console.log("Rakuten searchOrder response status:", searchResponse.status);

    const orderNumbers = searchResponse.data?.orderNumberList || [];
    console.log(`Found ${orderNumbers.length} orders`);

    if (orderNumbers.length === 0) {
      return res.json({
        success: true,
        products: [],
        count: 0,
        message: "直近60日間の注文がありません。",
      });
    }

    // 注文詳細を取得して商品を抽出
    const productMap = new Map<string, { code: string; name: string }>();

    // 注文番号を100件ずつ分割して詳細を取得
    const chunkSize = 100;
    for (let i = 0; i < orderNumbers.length; i += chunkSize) {
      const chunk = orderNumbers.slice(i, i + chunkSize);

      const detailResponse = await axios.post(
        'https://api.rms.rakuten.co.jp/es/2.0/order/getOrder',
        {
          orderNumberList: chunk,
          version: 7,
        },
        {
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json; charset=utf-8',
          },
        }
      );

      const orders = detailResponse.data?.OrderModelList || [];

      for (const order of orders) {
        const items = order.PackageModelList?.[0]?.ItemModelList || [];
        for (const item of items) {
          const itemUrl = item.itemUrl || item.manageNumber || item.itemNumber || '';
          const itemName = item.itemName || 'Unknown';

          if (itemUrl && !productMap.has(itemUrl)) {
            productMap.set(itemUrl, {
              code: itemUrl,
              name: itemName,
            });
          }
        }
      }
    }

    const products = Array.from(productMap.values());

    // Firestoreに保存
    await db.collection("rakuten_products").doc("list").set({
      products,
      updatedAt: Timestamp.now(),
      source: "orders",
    });

    res.json({
      success: true,
      products,
      count: products.length,
      message: `${orderNumbers.length}件の注文から${products.length}件の商品を抽出しました。`,
    });

  } catch (error: any) {
    console.error("Error extracting Rakuten products from orders:", JSON.stringify(error?.response?.data, null, 2) || error);
    console.error("Error status:", error?.response?.status);
    console.error("Error headers:", JSON.stringify(error?.response?.headers, null, 2));

    // APIレスポンスのエラー詳細を取得
    const apiError = error?.response?.data;
    let errorMessage = "Unknown error";

    if (apiError?.MessageModelList?.[0]?.messageContent) {
      errorMessage = apiError.MessageModelList[0].messageContent;
    } else if (apiError?.Results?.message) {
      errorMessage = apiError.Results.message + " (" + apiError.Results.errorCode + ")";
    } else if (error?.message) {
      errorMessage = error.message;
    }

    // ES04-01エラーの場合は、RMSでAPIが有効になっていない可能性を伝える
    let helpMessage = "";
    if (apiError?.Results?.errorCode === "ES04-01") {
      helpMessage = "\n\n【対処法】RMSで楽天ペイ受注APIの利用設定を確認してください：\n" +
        "RMS > 店舗様向け情報・サービス > 5 WEB APIサービス > 2-1 WEB API > 利用機能編集\n" +
        "→「楽天ペイ受注API（RakutenPay_OrderAPI）」の「rpay.order.searchOrder」「rpay.order.getOrder」を「利用する」に設定";
    }

    res.status(500).json({
      success: false,
      message: "楽天受注データからの商品抽出に失敗しました" + helpMessage,
      error: errorMessage,
      details: apiError,
    });
  }
});

// 保存済み楽天商品リストを取得するエンドポイント
app.get("/rakuten/saved-products", async (req: Request, res: Response) => {
  try {
    const doc = await db.collection("rakuten_products").doc("list").get();

    if (!doc.exists) {
      return res.json({
        success: true,
        products: [],
        count: 0,
        message: "商品リストがまだ作成されていません。「過去の注文から商品リストを更新」ボタンを押してください。",
      });
    }

    const data = doc.data();
    res.json({
      success: true,
      products: data?.products || [],
      count: data?.products?.length || 0,
      updatedAt: data?.updatedAt?.toDate?.() || null,
    });

  } catch (error: any) {
    console.error("Error fetching saved Rakuten products:", error);
    res.status(500).json({
      success: false,
      message: "保存済み商品リストの取得に失敗しました",
      error: error?.message || "Unknown error",
    });
  }
});

// 楽天商品を手動で追加するエンドポイント
app.post("/rakuten/add-product", async (req: Request, res: Response) => {
  try {
    const { code, name } = req.body;

    if (!code || !name) {
      return res.status(400).json({
        success: false,
        message: "商品コードと商品名は必須です",
      });
    }

    // 既存の商品リストを取得
    const doc = await db.collection("rakuten_products").doc("list").get();
    let products = doc.exists ? doc.data()?.products || [] : [];

    // 重複チェック
    if (products.find((p: any) => p.code === code)) {
      return res.status(400).json({
        success: false,
        message: "この商品コードは既に登録されています",
      });
    }

    // 新しい商品を追加
    products.push({ code, name });

    // Firestoreに保存
    await db.collection("rakuten_products").doc("list").set({
      products,
      updatedAt: Timestamp.now(),
      source: "manual",
    });

    res.json({
      success: true,
      message: "商品を追加しました",
      products,
      count: products.length,
    });

  } catch (error: any) {
    console.error("Error adding Rakuten product:", error);
    res.status(500).json({
      success: false,
      message: "商品の追加に失敗しました",
      error: error?.message || "Unknown error",
    });
  }
});

// 楽天商品を削除するエンドポイント
app.delete("/rakuten/delete-product/:code", async (req: Request, res: Response) => {
  try {
    const code = req.params.code;

    // 既存の商品リストを取得
    const doc = await db.collection("rakuten_products").doc("list").get();
    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        message: "商品リストが見つかりません",
      });
    }

    let products = doc.data()?.products || [];
    const initialLength = products.length;
    products = products.filter((p: any) => p.code !== code);

    if (products.length === initialLength) {
      return res.status(404).json({
        success: false,
        message: "指定された商品が見つかりません",
      });
    }

    // Firestoreに保存
    await db.collection("rakuten_products").doc("list").set({
      products,
      updatedAt: Timestamp.now(),
      source: "manual",
    });

    res.json({
      success: true,
      message: "商品を削除しました",
      products,
      count: products.length,
    });

  } catch (error: any) {
    console.error("Error deleting Rakuten product:", error);
    res.status(500).json({
      success: false,
      message: "商品の削除に失敗しました",
      error: error?.message || "Unknown error",
    });
  }
});

// 楽天受注から日別売上を取得するエンドポイント
app.get("/rakuten/daily-sales", async (req: Request, res: Response) => {
  try {
    console.log("Rakuten daily sales endpoint triggered");
    const axios = (await import('axios')).default;

    // クエリパラメータから日数を取得（デフォルト30日）
    const days = parseInt(req.query.days as string) || 30;

    // FirestoreからAPI認証情報を取得
    const settingsDoc = await db.collection("settings").doc("mall_credentials").get();

    if (!settingsDoc.exists) {
      return res.status(400).json({
        success: false,
        message: "API認証情報が設定されていません。",
      });
    }

    const settings = settingsDoc.data();
    const rakutenCreds = settings?.rakuten;

    if (!rakutenCreds?.serviceSecret || !rakutenCreds?.licenseKey) {
      return res.status(400).json({
        success: false,
        message: "楽天RMS APIの認証情報が不完全です。",
      });
    }

    const authHeader = getRakutenAuthHeader(rakutenCreds.serviceSecret, rakutenCreds.licenseKey);

    // 日付範囲を計算
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const formatDate = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}T00:00:00+0900`;
    };

    console.log("Fetching orders from", formatDate(startDate), "to", formatDate(endDate));

    // 注文番号を全ページ取得（ページネーション対応）
    let allOrderNumbers: string[] = [];
    let currentPage = 1;
    let hasMorePages = true;

    while (hasMorePages) {
      const searchResponse = await axios.post(
        'https://api.rms.rakuten.co.jp/es/2.0/order/searchOrder/',
        {
          dateType: 1, // 注文日
          startDatetime: formatDate(startDate),
          endDatetime: formatDate(endDate),
          orderProgressList: [100, 200, 300, 400, 500, 600, 700, 800, 900],
          PaginationRequestModel: {
            requestRecordsAmount: 1000,
            requestPage: currentPage,
          },
        },
        {
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json; charset=utf-8',
          },
        }
      );

      const pageOrderNumbers = searchResponse.data?.orderNumberList || [];
      const paginationResponse = searchResponse.data?.PaginationResponseModel;

      allOrderNumbers = allOrderNumbers.concat(pageOrderNumbers);
      console.log(`Page ${currentPage}: ${pageOrderNumbers.length} orders (total: ${allOrderNumbers.length})`);

      // 次のページがあるかチェック
      if (paginationResponse) {
        const totalPages = paginationResponse.totalPages || 1;
        if (currentPage >= totalPages || pageOrderNumbers.length === 0) {
          hasMorePages = false;
        } else {
          currentPage++;
        }
      } else {
        hasMorePages = false;
      }
    }

    const orderNumbers = allOrderNumbers;
    console.log(`Found ${orderNumbers.length} orders total`);

    if (orderNumbers.length === 0) {
      return res.json({
        success: true,
        dailySales: {},
        totalOrders: 0,
        message: "指定期間の注文がありません。",
      });
    }

    // 日別売上を集計するMap
    const dailySales: { [date: string]: number } = {};

    // 注文詳細を100件ずつ取得
    const chunkSize = 100;
    for (let i = 0; i < orderNumbers.length; i += chunkSize) {
      const chunk = orderNumbers.slice(i, i + chunkSize);

      const detailResponse = await axios.post(
        'https://api.rms.rakuten.co.jp/es/2.0/order/getOrder/',
        {
          orderNumberList: chunk,
          version: 7,
        },
        {
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json; charset=utf-8',
          },
        }
      );

      const orders = detailResponse.data?.OrderModelList || [];

      for (const order of orders) {
        // 注文日を取得 (orderDatetime)
        const orderDatetime = order.orderDatetime;
        if (!orderDatetime) continue;

        // 日付部分のみ抽出 (YYYY-MM-DD)
        const dateStr = orderDatetime.split('T')[0];

        // 合計金額を取得 (totalPrice: 商品合計 + 送料 + ラッピング料 - クーポン - ポイント)
        // goodsPrice: 商品金額合計
        // postagePrice: 送料
        // totalPrice: 請求金額
        const totalPrice = order.totalPrice || 0;

        // 日別に集計
        if (!dailySales[dateStr]) {
          dailySales[dateStr] = 0;
        }
        dailySales[dateStr] += totalPrice;
      }
    }

    // 日付順にソート
    const sortedDailySales: { [date: string]: number } = {};
    Object.keys(dailySales).sort().forEach(key => {
      sortedDailySales[key] = dailySales[key];
    });

    // Firestoreに保存（sales_dataコレクションに楽天データを追加）
    for (const [date, amount] of Object.entries(sortedDailySales)) {
      const docRef = db.collection("sales_data").doc(date);
      const existingDoc = await docRef.get();

      if (existingDoc.exists) {
        await docRef.update({
          rakuten: amount,
          updatedAt: Timestamp.now(),
        });
      } else {
        await docRef.set({
          date,
          rakuten: amount,
          amazon: 0,
          qoo10: 0,
          amazonAd: 0,
          rakutenAd: 0,
          qoo10Ad: 0,
          xAd: 0,
          tiktokAd: 0,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          source: "rakuten-order-api",
        });
      }
    }

    res.json({
      success: true,
      dailySales: sortedDailySales,
      totalOrders: orderNumbers.length,
      totalSales: Object.values(sortedDailySales).reduce((a, b) => a + b, 0),
      message: `${orderNumbers.length}件の注文から日別売上を集計しました。`,
    });

  } catch (error: any) {
    console.error("Error fetching Rakuten daily sales:", JSON.stringify(error?.response?.data, null, 2) || error);
    res.status(500).json({
      success: false,
      message: "楽天売上データの取得に失敗しました",
      error: error?.response?.data?.Results?.message || error?.message || "Unknown error",
    });
  }
});

// 楽天商品別売上を取得するエンドポイント
app.get("/rakuten/product-sales/:productCode", async (req: Request, res: Response) => {
  try {
    const productCode = req.params.productCode;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    console.log(`Rakuten product sales endpoint: productCode=${productCode}, startDate=${startDate}, endDate=${endDate}`);
    const axios = (await import('axios')).default;

    // FirestoreからAPI認証情報を取得
    const settingsDoc = await db.collection("settings").doc("mall_credentials").get();

    if (!settingsDoc.exists) {
      return res.status(400).json({
        success: false,
        message: "API認証情報が設定されていません。",
      });
    }

    const settings = settingsDoc.data();
    const rakutenCreds = settings?.rakuten;

    if (!rakutenCreds?.serviceSecret || !rakutenCreds?.licenseKey) {
      return res.status(400).json({
        success: false,
        message: "楽天RMS APIの認証情報が不完全です。",
      });
    }

    const authHeader = getRakutenAuthHeader(rakutenCreds.serviceSecret, rakutenCreds.licenseKey);

    // 日付範囲を設定
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();
    // 終了日を翌日に設定（その日の注文も含めるため）
    end.setDate(end.getDate() + 1);

    const formatDate = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}T00:00:00+0900`;
    };

    console.log("Fetching orders from", formatDate(start), "to", formatDate(end));

    // 注文番号を全ページ取得（ページネーション対応）
    let allOrderNumbers: string[] = [];
    let currentPage = 1;
    let hasMorePages = true;

    while (hasMorePages) {
      const searchResponse = await axios.post(
        'https://api.rms.rakuten.co.jp/es/2.0/order/searchOrder/',
        {
          dateType: 1,
          startDatetime: formatDate(start),
          endDatetime: formatDate(end),
          orderProgressList: [100, 200, 300, 400, 500, 600, 700, 800, 900],
          PaginationRequestModel: {
            requestRecordsAmount: 1000,
            requestPage: currentPage,
          },
        },
        {
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json; charset=utf-8',
          },
        }
      );

      const pageOrderNumbers = searchResponse.data?.orderNumberList || [];
      const paginationResponse = searchResponse.data?.PaginationResponseModel;

      allOrderNumbers = allOrderNumbers.concat(pageOrderNumbers);
      console.log(`Page ${currentPage}: ${pageOrderNumbers.length} orders (total: ${allOrderNumbers.length})`);

      // 次のページがあるかチェック
      if (paginationResponse) {
        const totalRecords = paginationResponse.totalRecordsAmount || 0;
        const totalPages = paginationResponse.totalPages || 1;
        if (currentPage >= totalPages || pageOrderNumbers.length === 0) {
          hasMorePages = false;
        } else {
          currentPage++;
        }
      } else {
        hasMorePages = false;
      }
    }

    const orderNumbers = allOrderNumbers;
    console.log(`Found ${orderNumbers.length} orders total`);

    if (orderNumbers.length === 0) {
      return res.json({
        success: true,
        productCode,
        dailySales: [],
        totalSales: 0,
        totalQuantity: 0,
        message: "指定期間の注文がありません。",
      });
    }

    // 日別売上を集計するMap
    const dailySales: { [date: string]: { sales: number; quantity: number } } = {};

    // 注文詳細を100件ずつ取得
    const chunkSize = 100;
    for (let i = 0; i < orderNumbers.length; i += chunkSize) {
      const chunk = orderNumbers.slice(i, i + chunkSize);

      const detailResponse = await axios.post(
        'https://api.rms.rakuten.co.jp/es/2.0/order/getOrder/',
        {
          orderNumberList: chunk,
          version: 7,
        },
        {
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json; charset=utf-8',
          },
        }
      );

      const orders = detailResponse.data?.OrderModelList || [];

      for (const order of orders) {
        const orderDatetime = order.orderDatetime;
        if (!orderDatetime) continue;

        const dateStr = orderDatetime.split('T')[0];

        // 各パッケージ内のアイテムをチェック
        const packages = order.PackageModelList || [];
        for (const pkg of packages) {
          const items = pkg.ItemModelList || [];
          for (const item of items) {
            // 商品コードをチェック（itemUrl, manageNumber, itemNumberのいずれかにマッチ）
            const itemCode = item.itemUrl || item.manageNumber || item.itemNumber || '';

            if (itemCode === productCode) {
              // この商品の売上を集計
              const itemPrice = item.price || 0;
              const itemQuantity = item.units || 1;
              const itemTotal = itemPrice * itemQuantity;

              if (!dailySales[dateStr]) {
                dailySales[dateStr] = { sales: 0, quantity: 0 };
              }
              dailySales[dateStr].sales += itemTotal;
              dailySales[dateStr].quantity += itemQuantity;
            }
          }
        }
      }
    }

    // 配列形式に変換してソート
    const salesArray = Object.entries(dailySales)
      .map(([date, data]) => ({
        date,
        sales: data.sales,
        quantity: data.quantity,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const totalSales = salesArray.reduce((sum, d) => sum + d.sales, 0);
    const totalQuantity = salesArray.reduce((sum, d) => sum + d.quantity, 0);

    res.json({
      success: true,
      productCode,
      dailySales: salesArray,
      totalSales,
      totalQuantity,
      message: `${orderNumbers.length}件の注文から商品別売上を集計しました。`,
    });

  } catch (error: any) {
    console.error("Error fetching Rakuten product sales:", JSON.stringify(error?.response?.data, null, 2) || error);
    res.status(500).json({
      success: false,
      message: "楽天商品別売上の取得に失敗しました",
      error: error?.response?.data?.Results?.message || error?.message || "Unknown error",
    });
  }
});

// ==================== End 楽天RMS API連携 ====================

// ==================== 売上データ同期・取得 ====================

// Firestoreから商品別売上データを取得（キャッシュされたデータ）
app.get("/product-sales/:productCode", async (req: Request, res: Response) => {
  try {
    const productCode = req.params.productCode;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const mall = req.query.mall as string; // 'rakuten' or 'qoo10' or undefined (both)

    console.log(`Fetching cached product sales: productCode=${productCode}, startDate=${startDate}, endDate=${endDate}, mall=${mall}`);

    // Firestoreから売上データを取得
    let query = db.collection("product_sales")
      .where("productCode", "==", productCode);

    if (startDate) {
      query = query.where("date", ">=", startDate);
    }
    if (endDate) {
      query = query.where("date", "<=", endDate);
    }

    const snapshot = await query.get();

    if (snapshot.empty) {
      return res.json({
        success: true,
        productCode,
        dailySales: [],
        totalSales: 0,
        totalQuantity: 0,
        message: "保存された売上データがありません。同期を実行してください。",
      });
    }

    // 日付ごとに集計
    const dailyMap: { [date: string]: { qoo10Sales: number; qoo10Quantity: number; rakutenSales: number; rakutenQuantity: number } } = {};

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const date = data.date;
      const source = data.mall; // 'rakuten' or 'qoo10'

      if (!dailyMap[date]) {
        dailyMap[date] = { qoo10Sales: 0, qoo10Quantity: 0, rakutenSales: 0, rakutenQuantity: 0 };
      }

      if (source === 'rakuten' && (!mall || mall === 'rakuten')) {
        dailyMap[date].rakutenSales += data.sales || 0;
        dailyMap[date].rakutenQuantity += data.quantity || 0;
      } else if (source === 'qoo10' && (!mall || mall === 'qoo10')) {
        dailyMap[date].qoo10Sales += data.sales || 0;
        dailyMap[date].qoo10Quantity += data.quantity || 0;
      }
    });

    const dailySales = Object.entries(dailyMap)
      .map(([date, data]) => ({
        date,
        qoo10Sales: data.qoo10Sales,
        qoo10Quantity: data.qoo10Quantity,
        rakutenSales: data.rakutenSales,
        rakutenQuantity: data.rakutenQuantity,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const totalSales = dailySales.reduce((sum, d) => sum + d.qoo10Sales + d.rakutenSales, 0);
    const totalQuantity = dailySales.reduce((sum, d) => sum + d.qoo10Quantity + d.rakutenQuantity, 0);

    res.json({
      success: true,
      productCode,
      dailySales,
      totalSales,
      totalQuantity,
      message: `${dailySales.length}日分のデータを取得しました。`,
    });

  } catch (error: any) {
    console.error("Error fetching cached product sales:", error);
    res.status(500).json({
      success: false,
      message: "売上データの取得に失敗しました",
      error: error?.message || "Unknown error",
    });
  }
});

// 特定商品の売上データをFirestoreに保存（フロントエンドから呼び出し用）
app.post("/sync/save-product-sales", async (req: Request, res: Response) => {
  try {
    const { productCode, productName, mall, dailySales } = req.body;

    if (!productCode || !mall || !dailySales) {
      return res.status(400).json({
        success: false,
        message: "productCode, mall, dailySalesが必要です。",
      });
    }

    console.log(`Saving ${dailySales.length} sales records for ${productCode} (${mall})`);

    const batch = db.batch();
    let batchCount = 0;

    for (const sale of dailySales) {
      const docId = `${productCode}_${mall}_${sale.date}`;
      const docRef = db.collection("product_sales").doc(docId);
      batch.set(docRef, {
        productCode,
        productName: productName || '',
        mall,
        date: sale.date,
        sales: sale.sales || 0,
        quantity: sale.quantity || 0,
        updatedAt: Timestamp.now(),
      }, { merge: true });
      batchCount++;
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    res.json({
      success: true,
      synced: batchCount,
      message: `${batchCount}件の売上データを保存しました。`,
    });

  } catch (error: any) {
    console.error("Error saving product sales:", error);
    res.status(500).json({
      success: false,
      message: "売上データの保存に失敗しました",
      error: error?.message || "Unknown error",
    });
  }
});

// 登録商品一覧を取得するエンドポイント
app.get("/registered-products", async (req: Request, res: Response) => {
  try {
    const productsSnapshot = await db.collection("registered_products").get();
    const products = productsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    res.json({ success: true, products, count: products.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message });
  }
});

// 商品売上をFirestoreに同期（初回/履歴用）- 管理者用
app.post("/sync/product-sales", async (req: Request, res: Response) => {
  try {
    const { days = 365 } = req.body;
    console.log(`Syncing product sales for ${days} days`);
    const axios = (await import('axios')).default;

    // 登録商品一覧を取得
    const productsSnapshot = await db.collection("registered_products").get();
    const products = productsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    if (products.length === 0) {
      return res.json({
        success: false,
        message: "登録商品がありません。",
      });
    }

    // API認証情報を取得
    const settingsDoc = await db.collection("settings").doc("mall_credentials").get();
    const settings = settingsDoc.data();
    const rakutenCreds = settings?.rakuten;
    const qoo10Creds = settings?.qoo10;

    const formatDateStr = (d: Date) => d.toISOString().split('T')[0];

    let totalSynced = 0;
    const results: any[] = [];

    // Cloud Run環境ではK_SERVICE環境変数が設定されている
    const baseUrl = process.env.K_SERVICE
      ? `https://mall-batch-manager-983678294034.asia-northeast1.run.app`
      : `http://localhost:${process.env.PORT || 8080}`;

    // 月単位で期間を分割（APIの期間制限を回避）
    const generateMonthlyRanges = (days: number): Array<{start: string, end: string}> => {
      const ranges: Array<{start: string, end: string}> = [];
      const endDate = new Date();
      let currentEnd = new Date(endDate);

      for (let d = 0; d < days; d += 30) {
        const currentStart = new Date(currentEnd);
        currentStart.setDate(currentStart.getDate() - 30);

        if (d + 30 >= days) {
          // 最後の期間
          currentStart.setTime(endDate.getTime() - days * 24 * 60 * 60 * 1000);
        }

        ranges.push({
          start: formatDateStr(currentStart),
          end: formatDateStr(currentEnd)
        });

        currentEnd = new Date(currentStart);
        currentEnd.setDate(currentEnd.getDate() - 1);
      }

      return ranges;
    };

    const monthlyRanges = generateMonthlyRanges(days);
    console.log(`Generated ${monthlyRanges.length} monthly ranges for ${days} days`);

    for (const product of products) {
      const productCode = (product as any).rakutenCode || (product as any).qoo10Code;
      const productName = (product as any).productName;

      // 楽天売上を同期（月単位で分割）
      if ((product as any).rakutenCode && rakutenCreds?.serviceSecret && rakutenCreds?.licenseKey) {
        let rakutenBatchCount = 0;
        const rakutenErrors: string[] = [];

        for (const range of monthlyRanges) {
          try {
            console.log(`Fetching Rakuten ${(product as any).rakutenCode}: ${range.start} to ${range.end}`);
            const rakutenResponse = await axios.get(
              `${baseUrl}/rakuten/product-sales/${encodeURIComponent((product as any).rakutenCode)}?startDate=${range.start}&endDate=${range.end}`,
              { timeout: 180000 }
            );

            if (rakutenResponse.data.success && rakutenResponse.data.dailySales) {
              const dailySales = rakutenResponse.data.dailySales;

              // Firestoreバッチは500件が上限なので400件ずつ分割
              for (let i = 0; i < dailySales.length; i += 400) {
                const batch = db.batch();
                const chunk = dailySales.slice(i, i + 400);

                for (const sale of chunk) {
                  const docId = `${(product as any).rakutenCode}_rakuten_${sale.date}`;
                  const docRef = db.collection("product_sales").doc(docId);
                  batch.set(docRef, {
                    productCode: (product as any).rakutenCode,
                    productName,
                    mall: 'rakuten',
                    date: sale.date,
                    sales: sale.sales,
                    quantity: sale.quantity,
                    updatedAt: Timestamp.now(),
                  }, { merge: true });
                  rakutenBatchCount++;
                }

                await batch.commit();
              }
            }
          } catch (err: any) {
            console.error(`Error syncing Rakuten for ${productName} (${range.start}-${range.end}):`, err.message);
            rakutenErrors.push(`${range.start}-${range.end}: ${err.message}`);
          }
        }

        totalSynced += rakutenBatchCount;
        results.push({
          product: productName,
          mall: 'rakuten',
          synced: rakutenBatchCount,
          errors: rakutenErrors.length > 0 ? rakutenErrors : undefined,
        });
      }

      // Qoo10売上を同期（月単位で分割）
      if ((product as any).qoo10Code && qoo10Creds?.apiKey) {
        let qoo10BatchCount = 0;
        const qoo10Errors: string[] = [];

        for (const range of monthlyRanges) {
          try {
            console.log(`Fetching Qoo10 ${(product as any).qoo10Code}: ${range.start} to ${range.end}`);
            const qoo10Response = await axios.get(
              `${baseUrl}/qoo10/product-sales/${encodeURIComponent((product as any).qoo10Code)}?startDate=${range.start}&endDate=${range.end}`,
              { timeout: 180000 }
            );

            if (qoo10Response.data.success && qoo10Response.data.dailySales) {
              const dailySales = qoo10Response.data.dailySales;

              // Firestoreバッチは500件が上限なので400件ずつ分割
              for (let i = 0; i < dailySales.length; i += 400) {
                const batch = db.batch();
                const chunk = dailySales.slice(i, i + 400);

                for (const sale of chunk) {
                  const docId = `${(product as any).qoo10Code}_qoo10_${sale.date}`;
                  const docRef = db.collection("product_sales").doc(docId);
                  batch.set(docRef, {
                    productCode: (product as any).qoo10Code,
                    productName,
                    mall: 'qoo10',
                    date: sale.date,
                    sales: sale.sales,
                    quantity: sale.quantity,
                    updatedAt: Timestamp.now(),
                  }, { merge: true });
                  qoo10BatchCount++;
                }

                await batch.commit();
              }
            }
          } catch (err: any) {
            console.error(`Error syncing Qoo10 for ${productName} (${range.start}-${range.end}):`, err.message);
            qoo10Errors.push(`${range.start}-${range.end}: ${err.message}`);
          }
        }

        totalSynced += qoo10BatchCount;
        results.push({
          product: productName,
          mall: 'qoo10',
          synced: qoo10BatchCount,
          errors: qoo10Errors.length > 0 ? qoo10Errors : undefined,
        });
      }
    }

    res.json({
      success: true,
      totalSynced,
      results,
      message: `${totalSynced}件の売上データを同期しました。`,
    });

  } catch (error: any) {
    console.error("Error syncing product sales:", error);
    res.status(500).json({
      success: false,
      message: "売上データの同期に失敗しました",
      error: error?.message || "Unknown error",
    });
  }
});

// 前日分の売上を同期（毎朝の定期実行用）
app.post("/sync/daily", async (req: Request, res: Response) => {
  try {
    console.log("Daily sync triggered");
    const axios = (await import('axios')).default;

    // 登録商品一覧を取得
    const productsSnapshot = await db.collection("registered_products").get();
    const products = productsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    if (products.length === 0) {
      return res.json({
        success: false,
        message: "登録商品がありません。",
      });
    }

    // API認証情報を取得
    const settingsDoc = await db.collection("settings").doc("mall_credentials").get();
    const settings = settingsDoc.data();
    const rakutenCreds = settings?.rakuten;
    const qoo10Creds = settings?.qoo10;

    // 昨日の日付
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // 今日の日付（念のため今日も取得）
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    let totalSynced = 0;
    const results: any[] = [];

    // Cloud Run環境ではK_SERVICE環境変数が設定されている
    const baseUrl = process.env.K_SERVICE
      ? `https://mall-batch-manager-983678294034.asia-northeast1.run.app`
      : `http://localhost:${process.env.PORT || 8080}`;

    for (const product of products) {
      const productName = (product as any).productName;

      // 楽天売上を同期
      if ((product as any).rakutenCode && rakutenCreds?.serviceSecret && rakutenCreds?.licenseKey) {
        try {
          const rakutenResponse = await axios.get(
            `${baseUrl}/rakuten/product-sales/${encodeURIComponent((product as any).rakutenCode)}?startDate=${yesterdayStr}&endDate=${todayStr}`
          );

          if (rakutenResponse.data.success && rakutenResponse.data.dailySales) {
            const batch = db.batch();
            let batchCount = 0;

            for (const sale of rakutenResponse.data.dailySales) {
              const docId = `${(product as any).rakutenCode}_rakuten_${sale.date}`;
              const docRef = db.collection("product_sales").doc(docId);
              batch.set(docRef, {
                productCode: (product as any).rakutenCode,
                productName,
                mall: 'rakuten',
                date: sale.date,
                sales: sale.sales,
                quantity: sale.quantity,
                updatedAt: Timestamp.now(),
              }, { merge: true });
              batchCount++;
            }

            if (batchCount > 0) {
              await batch.commit();
              totalSynced += batchCount;
            }

            results.push({
              product: productName,
              mall: 'rakuten',
              synced: batchCount,
            });
          }
        } catch (err: any) {
          console.error(`Daily sync error (Rakuten) for ${productName}:`, err.message);
        }
      }

      // Qoo10売上を同期
      if ((product as any).qoo10Code && qoo10Creds?.apiKey) {
        try {
          const qoo10Response = await axios.get(
            `${baseUrl}/qoo10/product-sales/${encodeURIComponent((product as any).qoo10Code)}?startDate=${yesterdayStr}&endDate=${todayStr}`
          );

          if (qoo10Response.data.success && qoo10Response.data.dailySales) {
            const batch = db.batch();
            let batchCount = 0;

            for (const sale of qoo10Response.data.dailySales) {
              const docId = `${(product as any).qoo10Code}_qoo10_${sale.date}`;
              const docRef = db.collection("product_sales").doc(docId);
              batch.set(docRef, {
                productCode: (product as any).qoo10Code,
                productName,
                mall: 'qoo10',
                date: sale.date,
                sales: sale.sales,
                quantity: sale.quantity,
                updatedAt: Timestamp.now(),
              }, { merge: true });
              batchCount++;
            }

            if (batchCount > 0) {
              await batch.commit();
              totalSynced += batchCount;
            }

            results.push({
              product: productName,
              mall: 'qoo10',
              synced: batchCount,
            });
          }
        } catch (err: any) {
          console.error(`Daily sync error (Qoo10) for ${productName}:`, err.message);
        }
      }
    }

    // 同期ログを保存
    await db.collection("sync_logs").add({
      type: 'daily',
      syncedAt: Timestamp.now(),
      totalSynced,
      results,
    });

    res.json({
      success: true,
      totalSynced,
      results,
      message: `${totalSynced}件の売上データを同期しました。`,
    });

  } catch (error: any) {
    console.error("Error in daily sync:", error);
    res.status(500).json({
      success: false,
      message: "日次同期に失敗しました",
      error: error?.message || "Unknown error",
    });
  }
});

// ==================== End 売上データ同期・取得 ====================

// TikTokトークンリフレッシュ関数
async function refreshTikTokAccessToken(accountId: string, refreshToken: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number } | null> {
  try {
    const config = await getTikTokOAuthConfig();
    if (!config?.clientKey || !config?.clientSecret) {
      console.error("TikTok OAuth config not found");
      return null;
    }

    const axios = (await import('axios')).default;

    const response = await axios.post(
      'https://open.tiktokapis.com/v2/oauth/token/',
      new URLSearchParams({
        client_key: config.clientKey,
        client_secret: config.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const tokenData = response.data;
    if (tokenData.error) {
      console.error(`Token refresh error for account ${accountId}:`, tokenData);
      return null;
    }

    // Firestoreのアカウント情報を更新
    await db.collection("tiktok_accounts").doc(accountId).update({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || refreshToken, // 新しいリフレッシュトークンがない場合は既存を維持
      expiresAt: Timestamp.fromMillis(Date.now() + (tokenData.expires_in || 86400) * 1000),
      lastTokenRefreshAt: Timestamp.now(),
    });

    console.log(`Token refreshed for account ${accountId}`);

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || refreshToken,
      expiresIn: tokenData.expires_in || 86400,
    };

  } catch (error: any) {
    console.error(`Failed to refresh token for account ${accountId}:`, error?.response?.data || error?.message);
    return null;
  }
}

// TikTok OAuth設定（Firestoreから取得）- 前方宣言用
async function getTikTokOAuthConfig() {
  const settingsDoc = await db.collection("settings").doc("tiktok_oauth").get();
  if (!settingsDoc.exists) {
    return null;
  }
  return settingsDoc.data();
}

// バッチ処理トリガー（毎朝8時に実行 - Cloud Scheduler用）
app.post("/trigger-batch", async (req: Request, res: Response) => {
  const startTime = Date.now();
  console.log("=== Daily Batch Process Started ===", new Date().toISOString());

  const batchLog: {
    triggeredAt: any;
    status: string;
    steps: any[];
    totalDuration?: number;
    error?: string;
  } = {
    triggeredAt: Timestamp.now(),
    status: "running",
    steps: [],
  };

  try {
    // 商品マスタを取得（BQ書き込み用）
    const productsSnapshot = await db.collection("registered_products").get();
    const productNameMap: Record<string, string> = {};
    productsSnapshot.docs.forEach(doc => {
      productNameMap[doc.id] = doc.data().productName || "";
    });

    // Step 1: 全TikTokアカウントの動画データを同期
    console.log("Step 1: Syncing all TikTok videos...");
    const accountsSnapshot = await db.collection("tiktok_accounts").get();

    if (!accountsSnapshot.empty) {
      let videoSyncSuccess = 0;
      let videoSyncError = 0;

      for (const accountDoc of accountsSnapshot.docs) {
        const accountId = accountDoc.id;
        let account = accountDoc.data();

        if (!account.accessToken) {
          console.warn(`Skipping account ${accountId}: No access token`);
          continue;
        }

        // リフレッシュトークンがあれば、バッチ実行前にトークンを更新
        if (account.refreshToken) {
          console.log(`Refreshing token for account ${accountId}...`);
          const refreshResult = await refreshTikTokAccessToken(accountId, account.refreshToken);
          if (refreshResult) {
            account = { ...account, accessToken: refreshResult.accessToken, refreshToken: refreshResult.refreshToken };
            console.log(`Token refreshed successfully for account ${accountId}`);
          } else {
            console.warn(`Token refresh failed for account ${accountId}, trying with existing token`);
          }
        }

        try {
          // ユーザー情報を取得してアバターURLを更新
          const userInfo = await fetchTikTokUserInfo(account.accessToken, account.tiktokUserId);
          if (userInfo && userInfo.avatarUrl) {
            await db.collection("tiktok_accounts").doc(accountId).update({
              tiktokAvatarUrl: userInfo.avatarUrl,
              tiktokUserName: userInfo.displayName || account.tiktokUserName,
            });
            console.log(`Updated avatar for account ${accountId}`);
          }

          // 動画リストを取得（アカウントIDでoEmbed取得も実行）
          // tiktokAccountIdがなければprofileUrlから抽出
          let accountUsername = account.tiktokAccountId || "";
          if (!accountUsername && account.profileUrl) {
            const urlMatch = account.profileUrl.match(/@([^/?]+)/);
            if (urlMatch) accountUsername = urlMatch[1];
          }
          const videos = await fetchAllTikTokVideos(account.accessToken, account.tiktokUserId, accountUsername);

          // Firestoreに保存（サムネイルURLも更新される）
          await saveTikTokVideosToFirestore(
            accountId,
            account.tiktokUserId,
            account.productId,
            videos
          );

          // アカウントの最終同期日時を更新
          await db.collection("tiktok_accounts").doc(accountId).update({
            lastVideoSyncAt: Timestamp.now(),
            totalVideos: videos.length,
          });

          // 日次統計も保存
          await saveDailyStats(accountId, account.tiktokUserId, account.productId, videos);

          videoSyncSuccess++;
          console.log(`Synced account ${account.tiktokUserName}: ${videos.length} videos`);
        } catch (accountError: any) {
          console.error(`Error syncing account ${accountId}:`, accountError?.message);
          videoSyncError++;
        }

        // レート制限対策
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      batchLog.steps.push({
        step: "sync_videos",
        success: videoSyncSuccess,
        error: videoSyncError,
        totalAccounts: accountsSnapshot.size,
      });
    } else {
      batchLog.steps.push({
        step: "sync_videos",
        message: "No TikTok accounts found",
      });
    }

    // Step 2: 全商品の日次スナップショットを保存（Firestore + BigQuery）
    console.log("Step 2: Saving daily snapshots...");
    // JSTで今日の日付を取得（UTC+9）
    const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const today = nowJST.toISOString().split('T')[0];
    let totalSnapshots = 0;
    const allBqSnapshots: Array<{
      videoId: string; accountId: string; productId: string; productName: string;
      accountName: string; date: string; viewCount: number; likeCount: number;
      commentCount: number; shareCount: number; createTime: string | null;
    }> = [];
    const allBqVideos: Array<{
      videoId: string; accountId: string; productId: string; tiktokUserId: string;
      title: string; coverImageUrl: string; shareUrl: string; createTime: string | null;
      duration: number; viewCount: number; likeCount: number; commentCount: number; shareCount: number;
    }> = [];

    for (const accountDoc of accountsSnapshot.docs) {
      const accountData = accountDoc.data();
      const accountId = accountDoc.id;
      const productId = accountData.productId;
      const productName = productNameMap[productId] || "";
      const accountName = accountData.tiktokUserName || "";

      const videosSnapshot = await db.collection("tiktok_videos")
        .where("accountId", "==", accountId)
        .get();

      const batch = db.batch();

      for (const videoDoc of videosSnapshot.docs) {
        const video = videoDoc.data();
        const videoId = videoDoc.id;
        const snapshotId = `${videoId}_${today}`;

        const snapshotRef = db.collection("tiktok_video_daily_snapshots").doc(snapshotId);
        batch.set(snapshotRef, {
          videoId,
          accountId,
          productId,
          date: today,
          viewCount: video.viewCount || 0,
          likeCount: video.likeCount || 0,
          commentCount: video.commentCount || 0,
          shareCount: video.shareCount || 0,
          createTime: video.createTime,
          savedAt: new Date(),
        }, { merge: true });
        totalSnapshots++;

        // BQ用データを蓄積
        allBqSnapshots.push({
          videoId, accountId, productId, productName, accountName, date: today,
          viewCount: video.viewCount || 0, likeCount: video.likeCount || 0,
          commentCount: video.commentCount || 0, shareCount: video.shareCount || 0,
          createTime: video.createTime?.toDate?.()?.toISOString() || video.createTime || null,
        });

        allBqVideos.push({
          videoId, accountId, productId, tiktokUserId: accountData.tiktokUserId || "",
          title: video.title || "", coverImageUrl: video.coverImageUrl || "",
          shareUrl: video.shareUrl || "",
          createTime: video.createTime?.toDate?.()?.toISOString() || video.createTime || null,
          duration: video.duration || 0, viewCount: video.viewCount || 0,
          likeCount: video.likeCount || 0, commentCount: video.commentCount || 0,
          shareCount: video.shareCount || 0,
        });
      }

      await batch.commit();
    }

    // Step 3: BigQueryに書き込み
    console.log("Step 3: Writing to BigQuery...");
    let bqSnapshotsInserted = 0;
    let bqVideosInserted = 0;
    try {
      await insertSnapshotsToBigQuery(allBqSnapshots);
      bqSnapshotsInserted = allBqSnapshots.length;
    } catch (bqError: any) {
      console.error("BigQuery snapshot insert error:", bqError?.message);
      batchLog.steps.push({ step: "bq_snapshots", error: bqError?.message });
    }
    try {
      await upsertVideosToBigQuery(allBqVideos);
      bqVideosInserted = allBqVideos.length;
    } catch (bqError: any) {
      console.error("BigQuery video insert error:", bqError?.message);
      batchLog.steps.push({ step: "bq_videos", error: bqError?.message });
    }

    batchLog.steps.push({
      step: "save_snapshots",
      date: today,
      totalSnapshots,
      bqSnapshotsInserted,
      bqVideosInserted,
    });

    // 完了
    const duration = Date.now() - startTime;
    batchLog.status = "completed";
    batchLog.totalDuration = duration;

    await db.collection("batch_logs").add(batchLog);

    console.log(`=== Daily Batch Process Completed in ${duration}ms ===`);

    res.json({
      success: true,
      message: "Daily batch process completed successfully",
      result: batchLog,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error("Error in batch process:", error);

    batchLog.status = "failed";
    batchLog.error = error instanceof Error ? error.message : "Unknown error";
    batchLog.totalDuration = duration;

    await db.collection("batch_logs").add(batchLog);

    res.status(500).json({
      success: false,
      message: "Batch process failed",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// ==================== TikTok OAuth連携 ====================

// TikTok認証開始エンドポイント
// productIdをstateに埋め込んでTikTokにリダイレクト
app.get("/auth/tiktok/login", async (req: Request, res: Response) => {
  try {
    const productId = req.query.productId as string;
    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "productIdが必要です",
      });
    }

    const config = await getTikTokOAuthConfig();
    if (!config?.clientKey) {
      return res.status(400).json({
        success: false,
        message: "TikTok OAuth設定が登録されていません。設定画面で登録してください。",
      });
    }

    // コールバックURLはハードコード
    const redirectUri = "https://mall-batch-manager-api-983678294034.asia-northeast1.run.app/auth/tiktok/callback";

    // stateにproductIdとCSRF対策用のランダム文字列を埋め込む
    const csrfToken = Math.random().toString(36).substring(2, 15);
    const stateData = {
      productId,
      csrfToken,
      timestamp: Date.now(),
    };
    const state = Buffer.from(JSON.stringify(stateData)).toString('base64');

    // Firestoreに一時保存（コールバック時の検証用）
    await db.collection("tiktok_oauth_states").doc(csrfToken).set({
      productId,
      createdAt: Timestamp.now(),
      expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000), // 10分後に期限切れ
    });

    // TikTok認証URLを生成
    // https://developers.tiktok.com/doc/login-kit-web/
    const scope = 'user.info.basic,video.list';
    const authUrl = `https://www.tiktok.com/v2/auth/authorize/?` +
      `client_key=${encodeURIComponent(config.clientKey)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(state)}`;

    console.log(`TikTok OAuth: Redirecting to TikTok for productId=${productId}`);
    res.redirect(authUrl);

  } catch (error: any) {
    console.error("TikTok OAuth login error:", error);
    res.status(500).json({
      success: false,
      message: "認証開始に失敗しました",
      error: error?.message || "Unknown error",
    });
  }
});

// TikTok認証コールバックエンドポイント
app.get("/auth/tiktok/callback", async (req: Request, res: Response) => {
  try {
    const code = req.query.code as string;
    const state = req.query.state as string;
    const error = req.query.error as string;

    // エラーチェック
    if (error) {
      console.error("TikTok OAuth error:", error, req.query.error_description);
      return res.redirect(`${process.env.FRONTEND_URL || 'https://mall-batch-manager.vercel.app'}/external-data?error=auth_denied`);
    }

    if (!code || !state) {
      return res.redirect(`${process.env.FRONTEND_URL || 'https://mall-batch-manager.vercel.app'}/external-data?error=missing_params`);
    }

    // stateをデコードしてproductIdを取り出す
    let stateData: { productId: string; csrfToken: string; timestamp: number };
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
    } catch (e) {
      console.error("Invalid state parameter");
      return res.redirect(`${process.env.FRONTEND_URL || 'https://mall-batch-manager.vercel.app'}/external-data?error=invalid_state`);
    }

    // CSRF検証
    const storedState = await db.collection("tiktok_oauth_states").doc(stateData.csrfToken).get();
    if (!storedState.exists) {
      console.error("CSRF token not found");
      return res.redirect(`${process.env.FRONTEND_URL || 'https://mall-batch-manager.vercel.app'}/external-data?error=invalid_csrf`);
    }

    // 使用済みトークンを削除
    await db.collection("tiktok_oauth_states").doc(stateData.csrfToken).delete();

    const config = await getTikTokOAuthConfig();
    if (!config?.clientKey || !config?.clientSecret) {
      return res.redirect(`${process.env.FRONTEND_URL || 'https://mall-batch-manager.vercel.app'}/external-data?error=missing_config`);
    }

    // コールバックURLはハードコード
    const redirectUri = "https://mall-batch-manager-api-983678294034.asia-northeast1.run.app/auth/tiktok/callback";

    const axios = (await import('axios')).default;

    // アクセストークンを取得
    const tokenResponse = await axios.post(
      'https://open.tiktokapis.com/v2/oauth/token/',
      new URLSearchParams({
        client_key: config.clientKey,
        client_secret: config.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const tokenData = tokenResponse.data;
    if (tokenData.error) {
      console.error("TikTok token error:", tokenData);
      return res.redirect(`${process.env.FRONTEND_URL || 'https://mall-batch-manager.vercel.app'}/external-data?error=token_error`);
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const openId = tokenData.open_id;
    const expiresIn = tokenData.expires_in;

    // ユーザー情報を取得
    let userInfo = { display_name: 'Unknown', avatar_url: '' };
    try {
      const userResponse = await axios.get(
        'https://open.tiktokapis.com/v2/user/info/',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
          params: {
            fields: 'open_id,display_name,avatar_url',
          },
        }
      );
      if (userResponse.data?.data?.user) {
        userInfo = userResponse.data.data.user;
      }
    } catch (userError) {
      console.error("Failed to fetch TikTok user info:", userError);
    }

    // Firestoreにアカウント情報を保存
    const accountDoc = await db.collection("tiktok_accounts").add({
      productId: stateData.productId,
      tiktokUserId: openId,
      tiktokUserName: userInfo.display_name,
      tiktokAvatarUrl: userInfo.avatar_url || '',
      accessToken: accessToken, // 本番環境では暗号化推奨
      refreshToken: refreshToken || '',
      expiresAt: Timestamp.fromMillis(Date.now() + (expiresIn || 86400) * 1000),
      connectedAt: Timestamp.now(),
    });

    console.log(`TikTok account connected: ${userInfo.display_name} for product ${stateData.productId}`);

    // フロントエンドにリダイレクト
    res.redirect(`${process.env.FRONTEND_URL || 'https://mall-batch-manager.vercel.app'}/external-data?success=true&productId=${stateData.productId}`);

  } catch (error: any) {
    console.error("TikTok OAuth callback error:", error?.response?.data || error);
    res.redirect(`${process.env.FRONTEND_URL || 'https://mall-batch-manager.vercel.app'}/external-data?error=callback_error`);
  }
});

// 全TikTok動画一覧取得（デバッグ用）
app.get("/tiktok/all-videos", async (req: Request, res: Response) => {
  try {
    const snapshot = await db.collection("tiktok_videos").get();

    const videos = snapshot.docs.map(doc => ({
      id: doc.id,
      accountId: doc.data().accountId,
      videoId: doc.data().videoId,
      title: doc.data().title,
      viewCount: doc.data().viewCount,
      likeCount: doc.data().likeCount,
      commentCount: doc.data().commentCount,
      shareCount: doc.data().shareCount,
    }));

    res.json({
      success: true,
      videos,
      count: videos.length,
    });
  } catch (error: any) {
    console.error("Error fetching all TikTok videos:", error);
    res.status(500).json({
      success: false,
      message: "TikTok動画一覧の取得に失敗しました",
      error: error?.message || "Unknown error",
    });
  }
});

// スナップショット確認用API
app.get("/tiktok/snapshots/:date", async (req: Request, res: Response) => {
  try {
    const date = req.params.date;
    const snapshot = await db.collection("tiktok_video_daily_snapshots")
      .where("date", "==", date)
      .get();

    const docs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({ success: true, date, count: docs.length, snapshots: docs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message });
  }
});

// 全TikTokアカウント一覧取得（商品名結合済み）
app.get("/tiktok/all-accounts", async (req: Request, res: Response) => {
  try {
    // 商品マスタを取得してID→名前マッピングを作成
    const productsSnapshot = await db.collection("registered_products").get();
    const productMap: Record<string, string> = {};
    productsSnapshot.docs.forEach(doc => {
      productMap[doc.id] = doc.data().productName || "";
    });

    const snapshot = await db.collection("tiktok_accounts").get();

    const accounts = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        productId: data.productId || "",
        productName: productMap[data.productId] || "",
        tiktokUserId: data.tiktokUserId || "",
        tiktokUserName: data.tiktokUserName || "",
        tiktokAccountId: data.tiktokAccountId || "",
        tiktokAvatarUrl: data.tiktokAvatarUrl || "",
        device: data.device || "",
        email: data.email || "",
        password: data.password || "",
        profileUrl: data.profileUrl || "",
        operator: data.operator || "",
        accessToken: data.accessToken || "",
        refreshToken: data.refreshToken || "",
        followerCount: data.followerCount || null,
        likeCount: data.likeCount || null,
        accessTokenExpiresAt: data.accessTokenExpiresAt?.toDate?.() || data.expiresAt?.toDate?.() || null,
        refreshTokenExpiresAt: data.refreshTokenExpiresAt?.toDate?.() || null,
        connectedAt: data.connectedAt?.toDate?.() || null,
        updatedAt: data.updatedAt?.toDate?.() || null,
      };
    });

    res.json({
      success: true,
      accounts,
      count: accounts.length,
    });
  } catch (error: any) {
    console.error("Error fetching all TikTok accounts:", error);
    res.status(500).json({
      success: false,
      message: "TikTokアカウント一覧の取得に失敗しました",
      error: error?.message || "Unknown error",
    });
  }
});

// 商品に紐付くTikTokアカウント一覧取得
app.get("/tiktok/accounts/:productId", async (req: Request, res: Response) => {
  try {
    const productId = req.params.productId;

    const snapshot = await db.collection("tiktok_accounts")
      .where("productId", "==", productId)
      .orderBy("connectedAt", "desc")
      .get();

    const accounts = snapshot.docs.map(doc => ({
      id: doc.id,
      tiktokUserId: doc.data().tiktokUserId,
      tiktokUserName: doc.data().tiktokUserName,
      tiktokAvatarUrl: doc.data().tiktokAvatarUrl,
      connectedAt: doc.data().connectedAt?.toDate?.() || null,
    }));

    res.json({
      success: true,
      productId,
      accounts,
      count: accounts.length,
    });

  } catch (error: any) {
    console.error("Error fetching TikTok accounts:", error);
    res.status(500).json({
      success: false,
      message: "TikTokアカウントの取得に失敗しました",
      error: error?.message || "Unknown error",
    });
  }
});

// TikTokアカウント手動登録（open_id, access_tokenを直接入力）
// TikTok UserInfo APIを呼び出してプロフィール情報を取得するヘルパー関数
// 参照: https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info
async function fetchTikTokUserInfo(accessToken: string, openId: string): Promise<{
  displayName: string;
  avatarUrl: string;
} | null> {
  try {
    // GETリクエストでfieldsをクエリパラメータに指定
    const fields = "open_id,union_id,avatar_url,display_name";
    const url = `https://open.tiktokapis.com/v2/user/info/?fields=${fields}`;

    console.log("Calling TikTok UserInfo API:", url);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
      },
    });

    const data = await response.json() as {
      error?: { code: string; message: string; log_id?: string };
      data?: { user: { open_id?: string; union_id?: string; display_name?: string; avatar_url?: string } };
    };
    console.log("TikTok UserInfo response:", JSON.stringify(data, null, 2));

    // エラーチェック（code が "ok" 以外はエラー）
    if (data.error && data.error.code !== "ok") {
      console.error("TikTok UserInfo API error:", data.error);
      return null;
    }

    const user = data.data?.user;
    if (user) {
      return {
        displayName: user.display_name || "Unknown",
        avatarUrl: user.avatar_url || "",
      };
    }

    return null;
  } catch (error) {
    console.error("Error fetching TikTok UserInfo:", error);
    return null;
  }
}

app.post("/tiktok/accounts/register", async (req: Request, res: Response) => {
  try {
    const { productId, openId, accessToken, userName, refreshToken, device, email, password, operator, profileUrl } = req.body;

    // バリデーション
    if (!productId || !openId || !accessToken) {
      return res.status(400).json({
        success: false,
        message: "productId, openId, accessTokenは必須です",
      });
    }

    // UserInfo APIでプロフィール情報を自動取得
    let displayName = userName || "Unknown";
    let avatarUrl = "";

    const userInfo = await fetchTikTokUserInfo(accessToken, openId);
    if (userInfo) {
      displayName = userInfo.displayName;
      avatarUrl = userInfo.avatarUrl;
      console.log(`Fetched TikTok profile: ${displayName}, avatar: ${avatarUrl}`);
    }

    // 追加フィールド（指定されたもののみ保存）
    const extraFields: Record<string, unknown> = {};
    if (refreshToken) extraFields.refreshToken = refreshToken;
    if (device) extraFields.device = device;
    if (email) extraFields.email = email;
    if (password) extraFields.password = password;
    if (operator) extraFields.operator = operator;
    if (profileUrl) extraFields.profileUrl = profileUrl;
    // URLからアカウントIDを自動抽出
    if (profileUrl) {
      const match = profileUrl.match(/@([^/?]+)/);
      if (match) extraFields.tiktokAccountId = match[1];
    }

    // 重複チェック（同じproductIdとopenIdの組み合わせがないか）
    const existingSnapshot = await db.collection("tiktok_accounts")
      .where("productId", "==", productId)
      .where("tiktokUserId", "==", openId)
      .get();

    if (!existingSnapshot.empty) {
      // 既存アカウントのトークンを更新（プロフィール情報も更新）
      const existingDoc = existingSnapshot.docs[0];
      await existingDoc.ref.update({
        accessToken: accessToken,
        tiktokUserName: displayName,
        tiktokAvatarUrl: avatarUrl,
        updatedAt: Timestamp.now(),
        ...extraFields,
      });

      return res.json({
        success: true,
        message: "既存アカウントのトークンを更新しました",
        accountId: existingDoc.id,
        updated: true,
        profile: { displayName, avatarUrl },
      });
    }

    // 新規登録
    const accountDoc = await db.collection("tiktok_accounts").add({
      productId: productId,
      tiktokUserId: openId,
      tiktokUserName: displayName,
      tiktokAvatarUrl: avatarUrl,
      accessToken: accessToken,
      connectedAt: Timestamp.now(),
      registeredManually: true,
      ...extraFields,
    });

    // 動画同期を自動実行
    let videoCount = 0;
    try {
      console.log(`Auto-syncing videos for new account: ${accountDoc.id}`);
      const videos = await fetchAllTikTokVideos(accessToken, openId);
      if (videos.length > 0) {
        await saveTikTokVideosToFirestore(accountDoc.id, openId, productId, videos);
        await db.collection("tiktok_accounts").doc(accountDoc.id).update({
          lastVideoSyncAt: Timestamp.now(),
          totalVideos: videos.length,
        });
        videoCount = videos.length;
        console.log(`Synced ${videos.length} videos for new account: ${accountDoc.id}`);
      }
    } catch (syncErr) {
      console.error(`Error syncing videos for new account ${openId}:`, syncErr);
    }

    res.json({
      success: true,
      message: `TikTokアカウントを登録しました（動画${videoCount}件を同期）`,
      accountId: accountDoc.id,
      updated: false,
      profile: { displayName, avatarUrl },
      videoCount,
    });

  } catch (error: any) {
    console.error("Error registering TikTok account:", error);
    res.status(500).json({
      success: false,
      message: "TikTokアカウントの登録に失敗しました",
      error: error?.message || "Unknown error",
    });
  }
});

// TikTokアカウント一括登録（CSV用）
app.post("/tiktok/accounts/bulk-register", async (req: Request, res: Response) => {
  try {
    const { productId, accounts } = req.body;

    // バリデーション
    if (!productId || !accounts || !Array.isArray(accounts)) {
      return res.status(400).json({
        success: false,
        message: "productIdとaccounts配列は必須です",
      });
    }

    let registered = 0;
    let updated = 0;
    let failed = 0;

    for (const account of accounts) {
      const { openId, accessToken, refreshToken } = account;
      if (!openId || !accessToken) {
        failed++;
        continue;
      }

      try {
        // UserInfo APIでプロフィール情報を自動取得
        let displayName = "Unknown";
        let avatarUrl = "";

        const userInfo = await fetchTikTokUserInfo(accessToken, openId);
        if (userInfo) {
          displayName = userInfo.displayName;
          avatarUrl = userInfo.avatarUrl;
        }

        // 重複チェック
        const existingSnapshot = await db.collection("tiktok_accounts")
          .where("productId", "==", productId)
          .where("tiktokUserId", "==", openId)
          .get();

        if (!existingSnapshot.empty) {
          // 既存アカウントのトークンを更新
          const existingDoc = existingSnapshot.docs[0];
          await existingDoc.ref.update({
            accessToken: accessToken,
            refreshToken: refreshToken || '',
            tiktokUserName: displayName,
            tiktokAvatarUrl: avatarUrl,
            updatedAt: Timestamp.now(),
          });
          updated++;
        } else {
          // 新規登録
          await db.collection("tiktok_accounts").add({
            productId: productId,
            tiktokUserId: openId,
            tiktokUserName: displayName,
            tiktokAvatarUrl: avatarUrl,
            accessToken: accessToken,
            refreshToken: refreshToken || '',
            connectedAt: Timestamp.now(),
            registeredManually: true,
          });
          registered++;
        }
      } catch (err) {
        console.error(`Error registering account ${openId}:`, err);
        failed++;
      }
    }

    res.json({
      success: true,
      message: `${registered + updated}件のアカウントを処理しました（新規: ${registered}, 更新: ${updated}, 失敗: ${failed}）`,
      registered,
      updated,
      failed,
    });

  } catch (error: any) {
    console.error("Error bulk registering TikTok accounts:", error);
    res.status(500).json({
      success: false,
      message: "TikTokアカウントの一括登録に失敗しました",
      error: error?.message || "Unknown error",
    });
  }
});

// TikTokアカウント一括登録V2（各行にproductIdを含む形式）
app.post("/tiktok/accounts/bulk-register-v2", async (req: Request, res: Response) => {
  try {
    const { accounts } = req.body;

    // バリデーション
    if (!accounts || !Array.isArray(accounts)) {
      return res.status(400).json({
        success: false,
        message: "accounts配列は必須です",
      });
    }

    let registered = 0;
    let updated = 0;
    let failed = 0;

    // TikTok OAuth設定を取得（トークンリフレッシュ用）
    const tiktokConfig = await getTikTokOAuthConfig();

    for (const account of accounts) {
      const { productId, openId, accessToken: originalAccessToken, refreshToken, userName, device, email, password, operator, profileUrl } = account;
      if (!productId || !openId || !originalAccessToken) {
        failed++;
        continue;
      }

      // 追加フィールド
      const extraFields: Record<string, unknown> = {};
      if (device) extraFields.device = device;
      if (email) extraFields.email = email;
      if (password) extraFields.password = password;
      if (operator) extraFields.operator = operator;
      if (profileUrl) extraFields.profileUrl = profileUrl;
      // URLからアカウントIDを自動抽出
      if (profileUrl) {
        const match = profileUrl.match(/@([^/?]+)/);
        if (match) extraFields.tiktokAccountId = match[1];
      }

      try {
        // UserInfo APIでプロフィール情報を自動取得（userNameが指定されていればフォールバックとして使用）
        let displayName = userName || "Unknown";
        let avatarUrl = "";
        let currentAccessToken = originalAccessToken;
        let currentRefreshToken = refreshToken || '';

        // まずオリジナルのアクセストークンで試行
        let userInfo = await fetchTikTokUserInfo(currentAccessToken, openId);

        // アクセストークンが無効でリフレッシュトークンがある場合、トークンをリフレッシュ
        if (!userInfo && refreshToken && tiktokConfig?.clientKey && tiktokConfig?.clientSecret) {
          console.log(`Access token invalid for ${openId}, attempting refresh...`);
          try {
            const axios = (await import('axios')).default;
            const tokenResponse = await axios.post(
              'https://open.tiktokapis.com/v2/oauth/token/',
              new URLSearchParams({
                client_key: tiktokConfig.clientKey,
                client_secret: tiktokConfig.clientSecret,
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
              }),
              {
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
              }
            );

            const tokenData = tokenResponse.data;
            if (!tokenData.error && tokenData.access_token) {
              currentAccessToken = tokenData.access_token;
              currentRefreshToken = tokenData.refresh_token || refreshToken;
              console.log(`Token refreshed successfully for ${openId}`);

              // 新しいアクセストークンで再試行
              userInfo = await fetchTikTokUserInfo(currentAccessToken, openId);
            } else {
              console.error(`Token refresh failed for ${openId}:`, tokenData.error);
            }
          } catch (refreshErr: any) {
            console.error(`Token refresh error for ${openId}:`, refreshErr?.response?.data || refreshErr?.message);
          }
        }

        if (userInfo) {
          displayName = userInfo.displayName;
          avatarUrl = userInfo.avatarUrl;
        }

        // 重複チェック
        const existingSnapshot = await db.collection("tiktok_accounts")
          .where("productId", "==", productId)
          .where("tiktokUserId", "==", openId)
          .get();

        let accountDocId: string;
        if (!existingSnapshot.empty) {
          // 既存アカウントのトークンを更新
          const existingDoc = existingSnapshot.docs[0];
          await existingDoc.ref.update({
            accessToken: currentAccessToken,
            refreshToken: currentRefreshToken,
            tiktokUserName: displayName,
            tiktokAvatarUrl: avatarUrl,
            updatedAt: Timestamp.now(),
            ...extraFields,
          });
          accountDocId = existingDoc.id;
          updated++;
        } else {
          // 新規登録
          const newDoc = await db.collection("tiktok_accounts").add({
            productId: productId,
            tiktokUserId: openId,
            tiktokUserName: displayName,
            tiktokAvatarUrl: avatarUrl,
            accessToken: currentAccessToken,
            refreshToken: currentRefreshToken,
            connectedAt: Timestamp.now(),
            registeredManually: true,
            ...extraFields,
          });
          accountDocId = newDoc.id;
          registered++;
        }

        // 動画同期は一括登録時はスキップ（タイムアウト防止）
        // 動画同期は後から手動で行う or バッチで行う
        console.log(`Registered account: ${accountDocId}, name: ${displayName} (video sync skipped)`);
      } catch (err) {
        console.error(`Error registering account ${openId}:`, err);
        failed++;
      }
    }

    res.json({
      success: true,
      message: `${registered + updated}件のアカウントを処理しました（新規: ${registered}, 更新: ${updated}, 失敗: ${failed}）`,
      registered,
      updated,
      failed,
    });

  } catch (error: any) {
    console.error("Error bulk registering TikTok accounts v2:", error);
    res.status(500).json({
      success: false,
      message: "TikTokアカウントの一括登録に失敗しました",
      error: error?.message || "Unknown error",
    });
  }
});

// Unknownアカウントのプロフィール再取得
app.post("/tiktok/accounts/refresh-unknown", async (req: Request, res: Response) => {
  try {
    // Unknownのアカウントを全件取得
    const unknownSnapshot = await db.collection("tiktok_accounts")
      .where("tiktokUserName", "==", "Unknown")
      .get();

    if (unknownSnapshot.empty) {
      return res.json({
        success: true,
        message: "Unknownのアカウントはありません",
        processed: 0,
        success_count: 0,
        failed: 0,
      });
    }

    console.log(`Found ${unknownSnapshot.size} Unknown accounts to refresh`);

    // TikTok OAuth設定を取得
    const tiktokConfig = await getTikTokOAuthConfig();

    let processed = 0;
    let successCount = 0;
    let failedCount = 0;

    for (const doc of unknownSnapshot.docs) {
      const account = doc.data();
      const accountId = doc.id;
      const { accessToken, refreshToken, tiktokUserId } = account;

      processed++;
      console.log(`Processing account ${processed}/${unknownSnapshot.size}: ${accountId}`);

      try {
        let currentAccessToken = accessToken;
        let currentRefreshToken = refreshToken || '';

        // まず現在のアクセストークンで試行
        let userInfo = await fetchTikTokUserInfo(currentAccessToken, tiktokUserId);

        // 失敗した場合、リフレッシュトークンで更新を試みる
        if (!userInfo && refreshToken && tiktokConfig?.clientKey && tiktokConfig?.clientSecret) {
          console.log(`Attempting token refresh for account ${accountId}...`);
          try {
            const axios = (await import('axios')).default;
            const tokenResponse = await axios.post(
              'https://open.tiktokapis.com/v2/oauth/token/',
              new URLSearchParams({
                client_key: tiktokConfig.clientKey,
                client_secret: tiktokConfig.clientSecret,
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
              }),
              {
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
              }
            );

            const tokenData = tokenResponse.data;
            if (!tokenData.error && tokenData.access_token) {
              currentAccessToken = tokenData.access_token;
              currentRefreshToken = tokenData.refresh_token || refreshToken;
              console.log(`Token refreshed for account ${accountId}`);

              // 新しいアクセストークンで再試行
              userInfo = await fetchTikTokUserInfo(currentAccessToken, tiktokUserId);
            } else {
              console.error(`Token refresh failed for ${accountId}:`, tokenData.error);
            }
          } catch (refreshErr: any) {
            console.error(`Token refresh error for ${accountId}:`, refreshErr?.response?.data || refreshErr?.message);
          }
        }

        if (userInfo && userInfo.displayName !== "Unknown") {
          // プロフィール取得成功 - Firestoreを更新
          await doc.ref.update({
            tiktokUserName: userInfo.displayName,
            tiktokAvatarUrl: userInfo.avatarUrl,
            accessToken: currentAccessToken,
            refreshToken: currentRefreshToken,
            updatedAt: Timestamp.now(),
          });
          console.log(`Updated account ${accountId}: ${userInfo.displayName}`);
          successCount++;
        } else {
          console.log(`Could not get profile for account ${accountId}`);
          failedCount++;
        }
      } catch (err) {
        console.error(`Error processing account ${accountId}:`, err);
        failedCount++;
      }
    }

    res.json({
      success: true,
      message: `${successCount}件のアカウントを更新しました（失敗: ${failedCount}）`,
      processed,
      success_count: successCount,
      failed: failedCount,
    });

  } catch (error: any) {
    console.error("Error refreshing Unknown accounts:", error);
    res.status(500).json({
      success: false,
      message: "Unknownアカウントの再取得に失敗しました",
      error: error?.message || "Unknown error",
    });
  }
});

// 認証コードでTikTokアカウント登録（GASのAuthorizeByAuthCodeと同等）
app.post("/tiktok/accounts/auth-code", async (req: Request, res: Response) => {
  try {
    const { authCode, productId, device, email, password, operator } = req.body;

    if (!authCode || !productId) {
      return res.status(400).json({
        success: false,
        message: "authCodeとproductIdは必須です",
      });
    }

    // GASと同じBusiness API credentials を使用
    const TIKTOK_CLIENT_ID = "7457840155068465153";
    const TIKTOK_CLIENT_SECRET = "49b99b63fb90d9e328de292c21157ee20b616a1e";
    const TIKTOK_REDIRECT_URI = "https://script.google.com/macros/s/AKfycbyhJNjd9bDrASLwvqW049k40QHZg29ggc_4zZfX_kgNitvD4zKJvb3SXD3CTCQyVm-v/exec";

    const axios = (await import('axios')).default;

    // GASと同じBusiness API v1.3 でトークン交換
    const tokenResponse = await axios.post(
      'https://business-api.tiktok.com/open_api/v1.3/tt_user/oauth2/token/',
      {
        client_id: TIKTOK_CLIENT_ID,
        client_secret: TIKTOK_CLIENT_SECRET,
        grant_type: 'authorization_code',
        auth_code: authCode,
        redirect_uri: TIKTOK_REDIRECT_URI,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const responseData = tokenResponse.data;
    console.log("TikTok Business API token response:", JSON.stringify(responseData));

    if (responseData.code !== 0 || !responseData.data?.access_token) {
      console.error("TikTok token error:", responseData);
      return res.status(400).json({
        success: false,
        message: `Token exchange failed: ${responseData.message || JSON.stringify(responseData)}`,
      });
    }

    const tokenData = responseData.data;
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const openId = tokenData.open_id;
    const expiresIn = tokenData.expires_in;
    const refreshExpiresIn = tokenData.refresh_token_expires_in;

    // GASと同じAPIでユーザー情報を取得
    let displayName = "Unknown";
    let avatarUrl = "";
    try {
      const userResponse = await axios.get('https://open-api.tiktok.com/oauth/userinfo/', {
        params: {
          access_token: accessToken,
          open_id: openId,
        },
      });
      const userData = userResponse.data;
      if (userData.message === "success" && userData.data) {
        displayName = userData.data.display_name || "Unknown";
        avatarUrl = userData.data.avatar_url || "";
      }
    } catch (userErr: any) {
      console.error("Failed to fetch user info:", userErr?.message);
      // フォールバック: fetchTikTokUserInfo（Open API v2）も試す
      const userInfo = await fetchTikTokUserInfo(accessToken, openId);
      if (userInfo) {
        displayName = userInfo.displayName;
        avatarUrl = userInfo.avatarUrl;
      }
    }

    // 追加フィールド
    const extraFields: Record<string, unknown> = {};
    if (device) extraFields.device = device;
    if (email) extraFields.email = email;
    if (password) extraFields.password = password;
    if (operator) extraFields.operator = operator;

    // 有効期限を計算
    const now = Date.now();
    const accessTokenExpiresAt = expiresIn ? Timestamp.fromMillis(now + expiresIn * 1000) : null;
    const refreshTokenExpiresAt = refreshExpiresIn ? Timestamp.fromMillis(now + refreshExpiresIn * 1000) : null;

    // 重複チェック（同じproductIdとopenIdの組み合わせ）
    const existingSnapshot = await db.collection("tiktok_accounts")
      .where("productId", "==", productId)
      .where("tiktokUserId", "==", openId)
      .get();

    if (!existingSnapshot.empty) {
      const existingDoc = existingSnapshot.docs[0];
      const updateData: Record<string, unknown> = {
        accessToken,
        refreshToken: refreshToken || "",
        tiktokUserName: displayName,
        tiktokAvatarUrl: avatarUrl,
        updatedAt: Timestamp.now(),
        ...extraFields,
      };
      if (accessTokenExpiresAt) updateData.accessTokenExpiresAt = accessTokenExpiresAt;
      if (refreshTokenExpiresAt) updateData.refreshTokenExpiresAt = refreshTokenExpiresAt;

      await existingDoc.ref.update(updateData);

      return res.json({
        success: true,
        message: "既存アカウントを更新しました",
        accountId: existingDoc.id,
        updated: true,
        profile: { displayName, avatarUrl },
      });
    }

    // 新規登録
    const newData: Record<string, unknown> = {
      productId,
      tiktokUserId: openId,
      tiktokUserName: displayName,
      tiktokAvatarUrl: avatarUrl,
      accessToken,
      refreshToken: refreshToken || "",
      connectedAt: Timestamp.now(),
      ...extraFields,
    };
    if (accessTokenExpiresAt) newData.accessTokenExpiresAt = accessTokenExpiresAt;
    if (refreshTokenExpiresAt) newData.refreshTokenExpiresAt = refreshTokenExpiresAt;

    const accountDoc = await db.collection("tiktok_accounts").add(newData);

    // 動画同期を自動実行
    let videoCount = 0;
    try {
      const videos = await fetchAllTikTokVideos(accessToken, openId);
      if (videos.length > 0) {
        await saveTikTokVideosToFirestore(accountDoc.id, openId, productId, videos);
        await db.collection("tiktok_accounts").doc(accountDoc.id).update({
          lastVideoSyncAt: Timestamp.now(),
          totalVideos: videos.length,
        });
        videoCount = videos.length;
      }
    } catch (syncErr) {
      console.error(`Error syncing videos for auth-code account ${openId}:`, syncErr);
    }

    res.json({
      success: true,
      message: `アカウントを登録しました（動画${videoCount}件を同期）`,
      accountId: accountDoc.id,
      updated: false,
      profile: { displayName, avatarUrl },
      videoCount,
    });

  } catch (error: any) {
    console.error("Error registering TikTok account by auth code:", error?.response?.data || error);
    res.status(500).json({
      success: false,
      message: "認証コードによるアカウント登録に失敗しました",
      error: error?.response?.data?.error_description || error?.message || "Unknown error",
    });
  }
});

// TikTokアカウントのトークンリフレッシュ（GASのRefreshAuthorizationと同等）
app.post("/tiktok/accounts/:accountId/refresh", async (req: Request, res: Response) => {
  try {
    const accountId = req.params.accountId;

    // Firestoreからアカウント情報を取得
    const accountDoc = await db.collection("tiktok_accounts").doc(accountId).get();
    if (!accountDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Account not found",
      });
    }

    const accountData = accountDoc.data()!;
    const currentRefreshToken = accountData.refreshToken;
    if (!currentRefreshToken) {
      return res.status(400).json({
        success: false,
        message: "リフレッシュトークンが登録されていません",
      });
    }

    // GASと同じBusiness API credentials
    const TIKTOK_CLIENT_ID = "7457840155068465153";
    const TIKTOK_CLIENT_SECRET = "49b99b63fb90d9e328de292c21157ee20b616a1e";

    const axios = (await import('axios')).default;

    // GASと同じBusiness API v1.3 でリフレッシュ
    const tokenResponse = await axios.post(
      'https://business-api.tiktok.com/open_api/v1.3/tt_user/oauth2/refresh_token/',
      {
        client_id: TIKTOK_CLIENT_ID,
        client_secret: TIKTOK_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: currentRefreshToken,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const responseData = tokenResponse.data;
    if (responseData.code !== 0 || !responseData.data?.access_token) {
      console.error("TikTok refresh token error:", responseData);
      return res.status(400).json({
        success: false,
        message: `Token refresh failed: ${responseData.message || JSON.stringify(responseData)}`,
      });
    }

    const tokenData = responseData.data;
    const now = Date.now();
    const updateData: Record<string, unknown> = {
      accessToken: tokenData.access_token,
      updatedAt: Timestamp.now(),
    };
    if (tokenData.refresh_token) {
      updateData.refreshToken = tokenData.refresh_token;
    }
    if (tokenData.expires_in) {
      updateData.accessTokenExpiresAt = Timestamp.fromMillis(now + tokenData.expires_in * 1000);
    }
    if (tokenData.refresh_token_expires_in) {
      updateData.refreshTokenExpiresAt = Timestamp.fromMillis(now + tokenData.refresh_token_expires_in * 1000);
    }

    await db.collection("tiktok_accounts").doc(accountId).update(updateData);

    res.json({
      success: true,
      message: "トークンをリフレッシュしました",
      accessTokenExpiresAt: tokenData.expires_in ? new Date(now + tokenData.expires_in * 1000).toISOString() : null,
    });

  } catch (error: any) {
    console.error("Error refreshing TikTok token:", error?.response?.data || error);
    res.status(500).json({
      success: false,
      message: "トークンのリフレッシュに失敗しました",
      error: error?.response?.data?.error_description || error?.message || "Unknown error",
    });
  }
});

// TikTokデータ全削除（アカウント+動画+スナップショット）
app.post("/tiktok/delete-all", async (req: Request, res: Response) => {
  try {
    const { includeProducts } = req.body || {};
    const collections = ["tiktok_accounts", "tiktok_videos", "tiktok_video_daily_snapshots"];
    if (includeProducts) collections.push("registered_products");
    const results: Record<string, number> = {};

    for (const colName of collections) {
      let deleted = 0;
      let hasMore = true;
      while (hasMore) {
        const snapshot = await db.collection(colName).limit(500).get();
        if (snapshot.empty) {
          hasMore = false;
          break;
        }
        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        deleted += snapshot.size;
        console.log(`${colName}: ${deleted} deleted so far`);
      }
      results[colName] = deleted;
    }

    console.log("All TikTok data deleted:", results);
    res.json({ success: true, message: "全データを削除しました", results });
  } catch (error: any) {
    console.error("Error deleting all TikTok data:", error);
    res.status(500).json({ success: false, message: "Deletion failed", error: error?.message });
  }
});

// TikTokアカウント削除
app.delete("/tiktok/accounts/:accountId", async (req: Request, res: Response) => {
  try {
    const accountId = req.params.accountId;

    await db.collection("tiktok_accounts").doc(accountId).delete();

    res.json({
      success: true,
      message: "TikTokアカウントを削除しました",
    });

  } catch (error: any) {
    console.error("Error deleting TikTok account:", error);
    res.status(500).json({
      success: false,
      message: "TikTokアカウントの削除に失敗しました",
      error: error?.message || "Unknown error",
    });
  }
});

// TikTokアカウントのトークン更新（リフレッシュトークンを手動登録）
app.put("/tiktok/accounts/:accountId/tokens", async (req: Request, res: Response) => {
  try {
    const accountId = req.params.accountId;
    const { accessToken, refreshToken, tiktokUserId, device, email, password, operator, profileUrl } = req.body;

    const updateData: Record<string, unknown> = {
      updatedAt: Timestamp.now(),
    };

    if (tiktokUserId) updateData.tiktokUserId = tiktokUserId;
    if (accessToken) updateData.accessToken = accessToken;
    if (refreshToken) updateData.refreshToken = refreshToken;
    if (device !== undefined) updateData.device = device;
    if (email !== undefined) updateData.email = email;
    if (password !== undefined) updateData.password = password;
    if (operator !== undefined) updateData.operator = operator;
    if (profileUrl !== undefined) {
      updateData.profileUrl = profileUrl;
      // URLからアカウントIDを自動抽出
      const match = profileUrl.match(/@([^/?]+)/);
      if (match) updateData.tiktokAccountId = match[1];
    }

    // 更新するフィールドがupdatedAtだけなら何もしない
    if (Object.keys(updateData).length <= 1) {
      return res.status(400).json({
        success: false,
        message: "更新するフィールドがありません",
      });
    }

    await db.collection("tiktok_accounts").doc(accountId).update(updateData);

    res.json({
      success: true,
      message: "トークンを更新しました",
    });

  } catch (error: any) {
    console.error("Error updating TikTok tokens:", error);
    res.status(500).json({
      success: false,
      message: "トークンの更新に失敗しました",
      error: error?.message || "Unknown error",
    });
  }
});

// TikTokアカウントの一括トークン更新
app.post("/tiktok/accounts/bulk-update-tokens", async (req: Request, res: Response) => {
  try {
    const { accounts } = req.body;

    if (!accounts || !Array.isArray(accounts)) {
      return res.status(400).json({
        success: false,
        message: "accounts配列が必要です",
      });
    }

    let updated = 0;
    let failed = 0;
    const results: any[] = [];

    for (const account of accounts) {
      const { tiktokUserId, accessToken, refreshToken } = account;
      if (!tiktokUserId) {
        failed++;
        results.push({ tiktokUserId, status: 'failed', reason: 'Missing tiktokUserId' });
        continue;
      }

      try {
        // tiktokUserIdでアカウントを検索
        const snapshot = await db.collection("tiktok_accounts")
          .where("tiktokUserId", "==", tiktokUserId)
          .get();

        if (snapshot.empty) {
          failed++;
          results.push({ tiktokUserId, status: 'failed', reason: 'Account not found' });
          continue;
        }

        const updateData: any = {
          updatedAt: Timestamp.now(),
        };
        if (accessToken) updateData.accessToken = accessToken;
        if (refreshToken) updateData.refreshToken = refreshToken;

        for (const doc of snapshot.docs) {
          await doc.ref.update(updateData);
        }

        updated++;
        results.push({ tiktokUserId, status: 'updated' });

      } catch (e: any) {
        failed++;
        results.push({ tiktokUserId, status: 'failed', reason: e?.message });
      }
    }

    res.json({
      success: true,
      message: `${updated}件更新、${failed}件失敗`,
      data: { updated, failed, results },
    });

  } catch (error: any) {
    console.error("Error bulk updating tokens:", error);
    res.status(500).json({
      success: false,
      message: "一括トークン更新に失敗しました",
      error: error?.message || "Unknown error",
    });
  }
});

// TikTok OAuth設定保存
app.post("/settings/tiktok-oauth", async (req: Request, res: Response) => {
  try {
    const { clientKey, clientSecret, redirectUri } = req.body;

    await db.collection("settings").doc("tiktok_oauth").set({
      clientKey: clientKey || '',
      clientSecret: clientSecret || '',
      redirectUri: redirectUri || '',
      updatedAt: Timestamp.now(),
    });

    res.json({
      success: true,
      message: "TikTok OAuth設定を保存しました",
    });

  } catch (error: any) {
    console.error("Error saving TikTok OAuth settings:", error);
    res.status(500).json({
      success: false,
      message: "設定の保存に失敗しました",
      error: error?.message || "Unknown error",
    });
  }
});

// TikTok OAuth設定取得
app.get("/settings/tiktok-oauth", async (req: Request, res: Response) => {
  try {
    const doc = await db.collection("settings").doc("tiktok_oauth").get();

    if (!doc.exists) {
      return res.json({
        success: true,
        settings: {
          clientKey: '',
          clientSecret: '',
          redirectUri: '',
        },
      });
    }

    const data = doc.data();
    res.json({
      success: true,
      settings: {
        clientKey: data?.clientKey || '',
        clientSecret: data?.clientSecret ? '********' : '', // マスク表示
        redirectUri: data?.redirectUri || '',
        hasSecret: !!data?.clientSecret,
      },
    });

  } catch (error: any) {
    console.error("Error fetching TikTok OAuth settings:", error);
    res.status(500).json({
      success: false,
      message: "設定の取得に失敗しました",
      error: error?.message || "Unknown error",
    });
  }
});

// ==================== TikTok動画取得バッチ ====================

// TikTok動画リストを取得する関数（ページネーション対応）
async function fetchAllTikTokVideos(
  accessToken: string,
  openId: string,
  tiktokAccountId?: string
): Promise<any[]> {
  const axios = (await import('axios')).default;
  const allVideos: any[] = [];

  // GASと同じBusiness API を使用してエンゲージメント付き動画一覧を取得
  // video_view_retention を含める（GASのengagementFieldsと同じ）
  const fields = [
    "item_id", "likes", "comments", "shares", "favorites",
    "video_duration", "reach", "video_views",
    "total_time_watched", "average_time_watched",
    "full_video_watched_rate", "new_followers", "profile_views",
    "video_view_retention"
  ];

  let cursor = "";
  let hasMore = true;

  while (hasMore) {
    try {
      console.log(`Fetching TikTok videos via Business API: cursor=${cursor || 'start'}`);

      // Business API: GET /business/video/list/
      const params: Record<string, string> = {
        business_id: openId,
        fields: JSON.stringify(fields),
      };
      if (cursor) {
        params.cursor = cursor;
      }

      const response = await axios.get(
        'https://business-api.tiktok.com/open_api/v1.3/business/video/list/',
        {
          headers: {
            'Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
          params,
        }
      );

      const json = response.data;

      if (json.code !== 0) {
        console.error('Business API error:', json);
        hasMore = false;
        break;
      }

      const data = json.data;
      if (data?.videos && Array.isArray(data.videos)) {
        // Business APIのレスポンスを変換
        const converted = data.videos.map((v: any) => {
          // 視聴維持率の抽出（GASと同じ方式）
          const retentionData = v.video_view_retention || [];
          const retention1s = retentionData.find((r: any) => r.second === "1" || r.second === 1);
          const retention2s = retentionData.find((r: any) => r.second === "2" || r.second === 2);

          // videoIdからcreate_timeを抽出（Snowflake形式: 上位32ビット = Unixタイムスタンプ）
          let createTimeISO: string | null = null;
          try {
            const videoIdBigInt = BigInt(v.item_id);
            const unixTimestamp = Number(videoIdBigInt >> 32n);
            createTimeISO = new Date(unixTimestamp * 1000).toISOString();
          } catch (e) {
            // BigInt変換失敗時はnullのまま
          }

          return {
            id: v.item_id,
            videoId: v.item_id,
            title: "",
            cover_image_url: "",
            share_url: `https://www.tiktok.com/video/${v.item_id}`,
            create_time: createTimeISO,
            duration: v.video_duration || 0,
            view_count: v.video_views || 0,
            like_count: v.likes || 0,
            comment_count: v.comments || 0,
            share_count: v.shares || 0,
            favorites: v.favorites || 0,
            reach: v.reach || 0,
            total_time_watched: v.total_time_watched || 0,
            average_time_watched: v.average_time_watched || 0,
            full_video_watched_rate: v.full_video_watched_rate || 0,
            new_followers: v.new_followers || 0,
            profile_views: v.profile_views || 0,
            // 視聴維持率
            retention1s: retention1s ? retention1s.percentage : null,
            retention2s: retention2s ? retention2s.percentage : null,
          };
        });
        allVideos.push(...converted);
        console.log(`Fetched ${data.videos.length} videos, total: ${allVideos.length}`);
      }

      // ページネーション
      hasMore = data?.has_more === true;
      if (hasMore && data?.cursor) {
        cursor = data.cursor;
      } else {
        hasMore = false;
      }

      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error: any) {
      console.error('Error fetching TikTok videos:', error?.response?.data || error?.message);
      hasMore = false;
    }
  }

  // oEmbed APIでタイトル・サムネ・share_urlを取得
  if (tiktokAccountId && allVideos.length > 0) {
    console.log(`Fetching oEmbed data for ${allVideos.length} videos (@${tiktokAccountId})...`);
    for (const video of allVideos) {
      try {
        const videoUrl = `https://www.tiktok.com/@${tiktokAccountId}/video/${video.id}`;
        const oembedRes = await axios.get('https://www.tiktok.com/oembed', {
          params: { url: videoUrl },
          timeout: 5000,
        });
        const oembed = oembedRes.data;
        if (oembed) {
          video.title = oembed.title || "";
          video.cover_image_url = oembed.thumbnail_url || "";
          video.share_url = videoUrl;
        }
      } catch (err: any) {
        // oEmbed失敗は無視（動画が非公開等）
        video.share_url = `https://www.tiktok.com/@${tiktokAccountId}/video/${video.id}`;
        console.log(`oEmbed failed for ${video.id}: ${err?.message}`);
      }
      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    console.log(`oEmbed data fetched for ${allVideos.length} videos`);
  }

  return allVideos;
}

// 動画データをFirestoreに保存（Upsert）
async function saveTikTokVideosToFirestore(
  accountId: string,
  tiktokUserId: string,
  productId: string,
  videos: any[]
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  const batch = db.batch();
  const batchSize = 500; // Firestoreのバッチ上限
  let batchCount = 0;

  for (const video of videos) {
    const videoId = video.id;
    if (!videoId) continue;

    const docRef = db.collection("tiktok_videos").doc(videoId);
    const existingDoc = await docRef.get();

    const videoData = {
      videoId: videoId,
      accountId: accountId,
      tiktokUserId: tiktokUserId,
      productId: productId,
      title: video.title || '',
      coverImageUrl: video.cover_image_url || '',
      embedHtml: video.embed_html || '',
      embedLink: video.embed_link || '',
      shareUrl: video.share_url || '',
      duration: video.duration || 0,
      createTime: video.create_time ? (typeof video.create_time === 'string' ? new Date(video.create_time) : new Date(video.create_time * 1000)) : null,
      // 統計データ
      viewCount: video.view_count || 0,
      likeCount: video.like_count || 0,
      commentCount: video.comment_count || 0,
      shareCount: video.share_count || 0,
      // 視聴維持率
      retention1s: video.retention1s != null ? (video.retention1s > 1 ? video.retention1s : video.retention1s * 100) : null,
      retention2s: video.retention2s != null ? (video.retention2s > 1 ? video.retention2s : video.retention2s * 100) : null,
      fullVideoWatchedRate: video.full_video_watched_rate != null ? (video.full_video_watched_rate > 1 ? video.full_video_watched_rate : video.full_video_watched_rate * 100) : null,
      // 公開設定
      visibility: video.visibility || 'PUBLIC_TO_EVERYONE',
      // メタデータ
      lastFetchedAt: Timestamp.now(),
    };

    if (existingDoc.exists) {
      // 既存の場合は統計データ + メタデータを更新
      batch.update(docRef, {
        title: videoData.title || existingDoc.data()?.title || '',
        coverImageUrl: videoData.coverImageUrl || existingDoc.data()?.coverImageUrl || '',
        shareUrl: videoData.shareUrl || existingDoc.data()?.shareUrl || '',
        createTime: videoData.createTime || existingDoc.data()?.createTime || null,
        viewCount: videoData.viewCount,
        likeCount: videoData.likeCount,
        commentCount: videoData.commentCount,
        shareCount: videoData.shareCount,
        retention1s: videoData.retention1s,
        retention2s: videoData.retention2s,
        fullVideoWatchedRate: videoData.fullVideoWatchedRate,
        lastFetchedAt: videoData.lastFetchedAt,
      });
      updated++;
    } else {
      // 新規の場合は全データを保存
      batch.set(docRef, {
        ...videoData,
        createdAt: Timestamp.now(),
      });
      created++;
    }

    batchCount++;

    // バッチサイズに達したらコミット
    if (batchCount >= batchSize) {
      await batch.commit();
      batchCount = 0;
    }
  }

  // 残りをコミット
  if (batchCount > 0) {
    await batch.commit();
  }

  return { created, updated };
}

// 単一アカウントの動画を取得・保存
app.post("/tiktok/sync-videos/:accountId", async (req: Request, res: Response) => {
  try {
    const accountId = req.params.accountId;

    // アカウント情報を取得
    const accountDoc = await db.collection("tiktok_accounts").doc(accountId).get();
    if (!accountDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "アカウントが見つかりません",
      });
    }

    const account = accountDoc.data();
    if (!account?.accessToken) {
      return res.status(400).json({
        success: false,
        message: "アクセストークンがありません",
      });
    }

    console.log(`Syncing videos for account: ${accountId}, user: ${account.tiktokUserName}`);

    // 動画リストを取得
    const videos = await fetchAllTikTokVideos(account.accessToken, account.tiktokUserId);
    console.log(`Total videos fetched: ${videos.length}`);

    // Firestoreに保存
    const result = await saveTikTokVideosToFirestore(
      accountId,
      account.tiktokUserId,
      account.productId,
      videos
    );

    // アカウントの最終同期日時を更新
    await db.collection("tiktok_accounts").doc(accountId).update({
      lastVideoSyncAt: Timestamp.now(),
      totalVideos: videos.length,
    });

    // 日次統計も保存
    await saveDailyStats(accountId, account.tiktokUserId, account.productId, videos);

    res.json({
      success: true,
      message: `動画を同期しました`,
      data: {
        totalVideos: videos.length,
        created: result.created,
        updated: result.updated,
      },
    });

  } catch (error: any) {
    console.error("Error syncing TikTok videos:", error);
    res.status(500).json({
      success: false,
      message: "動画の同期に失敗しました",
      error: error?.message || "Unknown error",
    });
  }
});

// 全アカウントの動画を一括同期（バッチ処理）
app.post("/tiktok/sync-all-videos", async (req: Request, res: Response) => {
  try {
    console.log("Starting TikTok video sync for all accounts...");

    // 全連携済みアカウントを取得
    const accountsSnapshot = await db.collection("tiktok_accounts").get();

    if (accountsSnapshot.empty) {
      return res.json({
        success: true,
        message: "連携済みアカウントがありません",
        data: { processed: 0 },
      });
    }

    const results: any[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const accountDoc of accountsSnapshot.docs) {
      const accountId = accountDoc.id;
      const account = accountDoc.data();

      if (!account.accessToken) {
        console.warn(`Skipping account ${accountId}: No access token`);
        results.push({
          accountId,
          userName: account.tiktokUserName,
          status: 'skipped',
          reason: 'No access token',
        });
        continue;
      }

      try {
        console.log(`Processing account: ${account.tiktokUserName}`);

        // ユーザー情報を取得してアバターURLを更新
        const userInfo = await fetchTikTokUserInfo(account.accessToken, account.tiktokUserId);
        if (userInfo && userInfo.avatarUrl) {
          await db.collection("tiktok_accounts").doc(accountId).update({
            tiktokAvatarUrl: userInfo.avatarUrl,
            tiktokUserName: userInfo.displayName || account.tiktokUserName,
          });
        }

        // 動画リストを取得
        const videos = await fetchAllTikTokVideos(account.accessToken, account.tiktokUserId);

        // Firestoreに保存
        const saveResult = await saveTikTokVideosToFirestore(
          accountId,
          account.tiktokUserId,
          account.productId,
          videos
        );

        // アカウントの最終同期日時を更新
        await db.collection("tiktok_accounts").doc(accountId).update({
          lastVideoSyncAt: Timestamp.now(),
          totalVideos: videos.length,
        });

        // 日次統計も保存
        await saveDailyStats(accountId, account.tiktokUserId, account.productId, videos);

        results.push({
          accountId,
          userName: account.tiktokUserName,
          status: 'success',
          totalVideos: videos.length,
          created: saveResult.created,
          updated: saveResult.updated,
        });
        successCount++;

      } catch (accountError: any) {
        console.error(`Error processing account ${accountId}:`, accountError?.message);
        results.push({
          accountId,
          userName: account.tiktokUserName,
          status: 'error',
          error: accountError?.message,
        });
        errorCount++;
      }

      // アカウント間でレート制限対策
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    res.json({
      success: true,
      message: `全アカウントの動画同期が完了しました`,
      data: {
        totalAccounts: accountsSnapshot.size,
        successCount,
        errorCount,
        results,
      },
    });

  } catch (error: any) {
    console.error("Error in batch video sync:", error);
    res.status(500).json({
      success: false,
      message: "バッチ処理に失敗しました",
      error: error?.message || "Unknown error",
    });
  }
});

// 特定商品に紐づく動画一覧を取得
app.get("/tiktok/videos/:productId", async (req: Request, res: Response) => {
  try {
    const productId = req.params.productId;

    const videosSnapshot = await db.collection("tiktok_videos")
      .where("productId", "==", productId)
      .orderBy("createTime", "desc")
      .get();

    const videos = videosSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createTime: doc.data().createTime?.toDate?.()?.toISOString() || null,
      lastFetchedAt: doc.data().lastFetchedAt?.toDate?.()?.toISOString() || null,
    }));

    res.json({
      success: true,
      videos,
      count: videos.length,
    });

  } catch (error: any) {
    console.error("Error fetching TikTok videos:", error);
    res.status(500).json({
      success: false,
      message: "動画一覧の取得に失敗しました",
      error: error?.message || "Unknown error",
    });
  }
});

// 特定アカウントに紐づく動画一覧を取得
app.get("/tiktok/account-videos/:accountId", async (req: Request, res: Response) => {
  try {
    const accountId = req.params.accountId;

    const videosSnapshot = await db.collection("tiktok_videos")
      .where("accountId", "==", accountId)
      .orderBy("createTime", "desc")
      .get();

    const videos = videosSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createTime: doc.data().createTime?.toDate?.()?.toISOString() || null,
      lastFetchedAt: doc.data().lastFetchedAt?.toDate?.()?.toISOString() || null,
    }));

    res.json({
      success: true,
      videos,
      count: videos.length,
    });

  } catch (error: any) {
    console.error("Error fetching TikTok videos:", error);
    res.status(500).json({
      success: false,
      message: "動画一覧の取得に失敗しました",
      error: error?.message || "Unknown error",
    });
  }
});

// ==================== End TikTok動画取得バッチ ====================

// ==================== TikTok動画分析API ====================

// 日次統計データを保存（動画同期時に呼び出される）
async function saveDailyStats(
  accountId: string,
  tiktokUserId: string,
  productId: string,
  videos: any[]
): Promise<void> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // 動画ごとにDaily統計を記録
  for (const video of videos) {
    const videoId = video.id || video.videoId;
    if (!videoId) continue;

    const docId = `${videoId}_${today}`;
    const docRef = db.collection("tiktok_daily_stats").doc(docId);

    await docRef.set({
      videoId,
      accountId,
      tiktokUserId,
      productId,
      date: today,
      viewCount: video.view_count || video.viewCount || 0,
      likeCount: video.like_count || video.likeCount || 0,
      commentCount: video.comment_count || video.commentCount || 0,
      shareCount: video.share_count || video.shareCount || 0,
      recordedAt: Timestamp.now(),
    }, { merge: true });
  }
}

// 商品に紐づくアカウント別日次統計を取得
app.get("/tiktok/analytics/:productId", async (req: Request, res: Response) => {
  try {
    const productId = req.params.productId;
    const { startDate, endDate } = req.query;

    // デフォルト期間（過去7日）
    const end = endDate ? String(endDate) : new Date().toISOString().split('T')[0];
    const start = startDate ? String(startDate) : (() => {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      return d.toISOString().split('T')[0];
    })();

    // まずアカウント情報を取得
    const accountsSnapshot = await db.collection("tiktok_accounts")
      .where("productId", "==", productId)
      .get();

    const accounts = accountsSnapshot.docs.map(doc => ({
      id: doc.id,
      tiktokUserId: doc.data().tiktokUserId,
      tiktokUserName: doc.data().tiktokUserName || 'Unknown',
      tiktokAvatarUrl: doc.data().tiktokAvatarUrl || '',
    }));

    // まずtiktok_daily_statsを試す
    let statsSnapshot: FirebaseFirestore.QuerySnapshot | null = null;
    let useFallback = false;

    try {
      statsSnapshot = await db.collection("tiktok_daily_stats")
        .where("productId", "==", productId)
        .where("date", ">=", start)
        .where("date", "<=", end)
        .get();
    } catch (indexError: any) {
      console.log("tiktok_daily_stats query failed (index may be building), using fallback:", indexError?.message);
      useFallback = true;
    }

    // アカウント別・日別に集計
    const dailyByAccount: { [accountId: string]: { [date: string]: any } } = {};

    // daily_statsがある場合はそれを使用
    if (statsSnapshot && !statsSnapshot.empty && !useFallback) {
      for (const doc of statsSnapshot.docs) {
        const data = doc.data();
        const accountId = data.accountId;
        const date = data.date;

        if (!dailyByAccount[accountId]) {
          dailyByAccount[accountId] = {};
        }
        if (!dailyByAccount[accountId][date]) {
          dailyByAccount[accountId][date] = {
            totalViews: 0,
            totalLikes: 0,
            totalComments: 0,
            totalShares: 0,
            videoCount: 0,
          };
        }

        dailyByAccount[accountId][date].totalViews += data.viewCount || 0;
        dailyByAccount[accountId][date].totalLikes += data.likeCount || 0;
        dailyByAccount[accountId][date].totalComments += data.commentCount || 0;
        dailyByAccount[accountId][date].totalShares += data.shareCount || 0;
        dailyByAccount[accountId][date].videoCount += 1;
      }
    } else {
      // daily_statsがない場合は、tiktok_videosから最新データを使用（今日のデータとして表示）
      const today = new Date().toISOString().split('T')[0];
      for (const account of accounts) {
        const videosSnapshot = await db.collection("tiktok_videos")
          .where("accountId", "==", account.id)
          .get();

        if (!videosSnapshot.empty) {
          if (!dailyByAccount[account.id]) {
            dailyByAccount[account.id] = {};
          }
          dailyByAccount[account.id][today] = {
            totalViews: 0,
            totalLikes: 0,
            totalComments: 0,
            totalShares: 0,
            videoCount: 0,
          };

          for (const doc of videosSnapshot.docs) {
            const video = doc.data();
            dailyByAccount[account.id][today].totalViews += video.viewCount || 0;
            dailyByAccount[account.id][today].totalLikes += video.likeCount || 0;
            dailyByAccount[account.id][today].totalComments += video.commentCount || 0;
            dailyByAccount[account.id][today].totalShares += video.shareCount || 0;
            dailyByAccount[account.id][today].videoCount += 1;
          }
        }
      }
    }

    // グラフ用データを整形
    const chartData: {
      accountId: string;
      accountName: string;
      avatarUrl: string;
      dailyData: { date: string; views: number; likes: number; comments: number; shares: number; }[];
    }[] = [];

    // 日付リストを生成
    const dateList: string[] = [];
    const currentDate = new Date(start);
    const endDateObj = new Date(end);
    while (currentDate <= endDateObj) {
      dateList.push(currentDate.toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    for (const account of accounts) {
      const accountStats = dailyByAccount[account.id] || {};
      const dailyData = dateList.map(date => ({
        date,
        views: accountStats[date]?.totalViews || 0,
        likes: accountStats[date]?.totalLikes || 0,
        comments: accountStats[date]?.totalComments || 0,
        shares: accountStats[date]?.totalShares || 0,
      }));

      chartData.push({
        accountId: account.id,
        accountName: account.tiktokUserName,
        avatarUrl: account.tiktokAvatarUrl,
        dailyData,
      });
    }

    res.json({
      success: true,
      productId,
      period: { startDate: start, endDate: end },
      accounts: chartData,
    });

  } catch (error: any) {
    console.error("Error fetching TikTok analytics:", error);
    res.status(500).json({
      success: false,
      message: "分析データの取得に失敗しました",
      error: error?.message || "Unknown error",
    });
  }
});

// アカウント別サマリー統計
app.get("/tiktok/analytics/summary/:productId", async (req: Request, res: Response) => {
  try {
    const productId = req.params.productId;
    const { startDate, endDate } = req.query;

    // デフォルト期間（過去30日）
    const end = endDate ? String(endDate) : new Date().toISOString().split('T')[0];
    const start = startDate ? String(startDate) : (() => {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      return d.toISOString().split('T')[0];
    })();

    // アカウント情報を取得（非表示アカウントを除外）
    const accountsSnapshot = await db.collection("tiktok_accounts")
      .where("productId", "==", productId)
      .get();

    const accounts = accountsSnapshot.docs
      .filter(doc => doc.data().hidden !== true)  // 非表示アカウントを除外
      .map(doc => ({
        id: doc.id,
        tiktokUserId: doc.data().tiktokUserId,
        tiktokUserName: doc.data().tiktokUserName || 'Unknown',
        tiktokAvatarUrl: doc.data().tiktokAvatarUrl || '',
      }));

    // 各アカウントのサマリーを計算
    const summaries: any[] = [];

    for (const account of accounts) {
      let totalViews = 0;
      let totalLikes = 0;
      let totalComments = 0;
      let totalShares = 0;
      const videoIds = new Set<string>();

      // まずdaily_statsを試す（インデックスエラーの可能性あり）
      let useFallback = false;
      try {
        const statsSnapshot = await db.collection("tiktok_daily_stats")
          .where("accountId", "==", account.id)
          .where("date", ">=", start)
          .where("date", "<=", end)
          .get();

        if (statsSnapshot.docs.length > 0) {
          // 日次統計がある場合
          for (const doc of statsSnapshot.docs) {
            const data = doc.data();
            totalViews += data.viewCount || 0;
            totalLikes += data.likeCount || 0;
            totalComments += data.commentCount || 0;
            totalShares += data.shareCount || 0;
            videoIds.add(data.videoId);
          }
        } else {
          useFallback = true;
        }
      } catch (indexError: any) {
        console.log("tiktok_daily_stats summary query failed, using fallback:", indexError?.message);
        useFallback = true;
      }

      // daily_statsがない場合またはエラーの場合は、tiktok_videosから直接取得
      if (useFallback) {
        const videosSnapshot = await db.collection("tiktok_videos")
          .where("accountId", "==", account.id)
          .get();

        for (const doc of videosSnapshot.docs) {
          const data = doc.data();
          totalViews += data.viewCount || 0;
          totalLikes += data.likeCount || 0;
          totalComments += data.commentCount || 0;
          totalShares += data.shareCount || 0;
          videoIds.add(data.videoId || doc.id);
        }
      }

      // エンゲージメント率を計算
      const totalEngagements = totalLikes + totalComments + totalShares;
      const engagementRate = totalViews > 0 ? (totalEngagements / totalViews) * 100 : 0;

      summaries.push({
        accountId: account.id,
        accountName: account.tiktokUserName,
        avatarUrl: account.tiktokAvatarUrl,
        totalViews,
        totalLikes,
        totalComments,
        totalShares,
        videoCount: videoIds.size,
        engagementRate: Math.round(engagementRate * 100) / 100, // 小数2位
      });
    }

    // 総再生数でソート
    summaries.sort((a, b) => b.totalViews - a.totalViews);

    res.json({
      success: true,
      productId,
      period: { startDate: start, endDate: end },
      summaries,
    });

  } catch (error: any) {
    console.error("Error fetching TikTok analytics summary:", error);
    res.status(500).json({
      success: false,
      message: "サマリーの取得に失敗しました",
      error: error?.message || "Unknown error",
    });
  }
});

// 動画別ランキングを取得（アカウント指定）
app.get("/tiktok/analytics/videos/:accountId", async (req: Request, res: Response) => {
  try {
    const accountId = req.params.accountId;
    const { startDate, endDate, sortBy = 'views', limit = '20' } = req.query;

    // デフォルト期間（過去30日）
    const end = endDate ? String(endDate) : new Date().toISOString().split('T')[0];
    const start = startDate ? String(startDate) : (() => {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      return d.toISOString().split('T')[0];
    })();

    // 動画一覧を取得
    const videosSnapshot = await db.collection("tiktok_videos")
      .where("accountId", "==", accountId)
      .get();

    const videos: any[] = [];

    for (const doc of videosSnapshot.docs) {
      const videoData = doc.data();

      // tiktok_videosのデータを直接使用（daily_statsはインデックス問題があるため）
      videos.push({
        videoId: videoData.videoId,
        title: videoData.title || '',
        coverImageUrl: videoData.coverImageUrl || '',
        shareUrl: videoData.shareUrl || '',
        createTime: videoData.createTime?.toDate?.()?.toISOString() || null,
        viewCount: videoData.viewCount || 0,
        likeCount: videoData.likeCount || 0,
        commentCount: videoData.commentCount || 0,
        shareCount: videoData.shareCount || 0,
      });
    }

    // ソート
    const sortField = sortBy === 'likes' ? 'likeCount'
      : sortBy === 'comments' ? 'commentCount'
      : sortBy === 'shares' ? 'shareCount'
      : 'viewCount';
    videos.sort((a, b) => b[sortField] - a[sortField]);

    // 上位N件に制限
    const limitNum = Math.min(parseInt(String(limit)), 100);
    const topVideos = videos.slice(0, limitNum);

    res.json({
      success: true,
      accountId,
      period: { startDate: start, endDate: end },
      sortBy: sortField,
      videos: topVideos,
      totalCount: videos.length,
    });

  } catch (error: any) {
    console.error("Error fetching video rankings:", error);
    res.status(500).json({
      success: false,
      message: "動画ランキングの取得に失敗しました",
      error: error?.message || "Unknown error",
    });
  }
});

// 商品に紐づく全動画一覧を取得（全アカウント横断）
app.get("/tiktok/analytics/all-videos/:productId", async (req: Request, res: Response) => {
  try {
    const productId = req.params.productId;

    // アカウント情報を取得（非表示アカウントを除外）
    const accountsSnapshot = await db.collection("tiktok_accounts")
      .where("productId", "==", productId)
      .get();

    const accountsMap = new Map<string, { name: string; avatar: string }>();
    for (const doc of accountsSnapshot.docs) {
      const data = doc.data();
      // 非表示アカウントはスキップ
      if (data.hidden === true) {
        continue;
      }
      accountsMap.set(doc.id, {
        name: data.tiktokUserName || 'Unknown',
        avatar: data.tiktokAvatarUrl || '',
      });
    }

    // 各アカウントの動画を取得
    const allVideos: any[] = [];

    for (const [accountId, accountInfo] of accountsMap) {
      const videosSnapshot = await db.collection("tiktok_videos")
        .where("accountId", "==", accountId)
        .get();

      for (const doc of videosSnapshot.docs) {
        const videoData = doc.data();
        allVideos.push({
          videoId: videoData.videoId || doc.id,
          title: videoData.title || '',
          coverImageUrl: videoData.coverImageUrl || '',
          shareUrl: videoData.shareUrl || '',
          createTime: typeof videoData.createTime === 'string'
            ? videoData.createTime
            : videoData.createTime?.toDate?.()?.toISOString() || null,
          viewCount: videoData.viewCount || 0,
          likeCount: videoData.likeCount || 0,
          commentCount: videoData.commentCount || 0,
          shareCount: videoData.shareCount || 0,
          // 視聴維持率
          retention1s: videoData.retention1s ?? null,
          retention2s: videoData.retention2s ?? null,
          fullVideoWatchedRate: videoData.fullVideoWatchedRate ?? null,
          accountId,
          accountName: accountInfo.name,
          accountAvatar: accountInfo.avatar,
        });
      }
    }

    // 再生数でソート（降順）
    allVideos.sort((a, b) => b.viewCount - a.viewCount);

    res.json({
      success: true,
      productId,
      videos: allVideos,
      totalCount: allVideos.length,
    });

  } catch (error: any) {
    console.error("Error fetching all videos for product:", error);
    res.status(500).json({
      success: false,
      message: "動画一覧の取得に失敗しました",
      error: error?.message || "Unknown error",
    });
  }
});

// ==================== TikTok Business API エンゲージメント取得 ====================

// TikTok Business APIのエンゲージメントフィールド
const ENGAGEMENT_FIELDS = [
  "item_id",
  "likes",
  "comments",
  "shares",
  "favorites",
  "video_duration",
  "reach",
  "video_views",
  "total_time_watched",
  "average_time_watched",
  "full_video_watched_rate",
  "new_followers",
  "profile_views",
  "video_view_retention",
];

// Business APIでエンゲージメントデータを取得する関数
async function fetchBusinessApiEngagements(
  accessToken: string,
  businessId: string,
  videoIds: string[]
): Promise<any[]> {
  const axios = (await import('axios')).default;

  // クエリパラメータを構築
  const params = new URLSearchParams();
  params.append('business_id', businessId);
  params.append('fields', JSON.stringify(ENGAGEMENT_FIELDS));
  params.append('filters', JSON.stringify({ video_ids: videoIds }));

  const url = `https://business-api.tiktok.com/open_api/v1.3/business/video/list/?${params.toString()}`;

  try {
    const response = await axios.get(url, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Token': accessToken,
      },
    });

    if (response.data?.code !== 0 || !response.data?.data) {
      console.error('Business API error:', response.data);
      return [];
    }

    const videos = response.data.data.videos || [];
    // デバッグ: video_view_retentionの内容を確認
    if (videos.length > 0 && videos[0].video_view_retention) {
      console.log('Sample video_view_retention:', JSON.stringify(videos[0].video_view_retention));
    }
    return videos;
  } catch (error: any) {
    console.error('Error fetching Business API engagements:', error?.response?.data || error?.message);
    return [];
  }
}

// エンゲージメントデータを同期するエンドポイント
app.post("/tiktok/sync-engagements/:accountId", async (req: Request, res: Response) => {
  try {
    const accountId = req.params.accountId;

    // アカウント情報を取得
    const accountDoc = await db.collection("tiktok_accounts").doc(accountId).get();
    if (!accountDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "アカウントが見つかりません",
      });
    }

    const account = accountDoc.data();
    if (!account?.accessToken || !account?.openId) {
      return res.status(400).json({
        success: false,
        message: "認証情報が不足しています",
      });
    }

    // このアカウントの動画一覧を取得
    const videosSnapshot = await db.collection("tiktok_videos")
      .where("accountId", "==", accountId)
      .get();

    if (videosSnapshot.empty) {
      return res.json({
        success: true,
        message: "同期対象の動画がありません",
        updated: 0,
      });
    }

    const videoIds = videosSnapshot.docs.map(doc => doc.data().videoId);

    // 10件ずつチャンクに分割して処理
    const chunkSize = 10;
    let totalUpdated = 0;

    for (let i = 0; i < videoIds.length; i += chunkSize) {
      const chunk = videoIds.slice(i, i + chunkSize);

      // Business APIからエンゲージメントデータを取得
      const engagements = await fetchBusinessApiEngagements(
        account.accessToken,
        account.openId, // business_id = open_id
        chunk
      );

      // 結果をFirestoreに保存
      for (const engagement of engagements) {
        const videoId = engagement.item_id;
        if (!videoId) continue;

        // retention率を抽出（TikTok APIでは second が数値の場合と文字列の場合がある）
        // percentageは0〜1の小数値なので100倍してパーセント表示にする
        const retention1sRaw = engagement.video_view_retention?.find((r: any) => r.second === "1" || r.second === 1)?.percentage ?? null;
        const retention2sRaw = engagement.video_view_retention?.find((r: any) => r.second === "2" || r.second === 2)?.percentage ?? null;
        const retention1s = retention1sRaw !== null ? retention1sRaw * 100 : null;
        const retention2s = retention2sRaw !== null ? retention2sRaw * 100 : null;
        // fullVideoWatchedRateも0〜1の小数なので100倍
        const fullVideoWatchedRateRaw = engagement.full_video_watched_rate ?? null;
        const fullVideoWatchedRate = fullVideoWatchedRateRaw !== null ? fullVideoWatchedRateRaw * 100 : 0;

        const updateData: any = {
          // Business APIからの追加データ
          reach: engagement.reach || 0,
          favorites: engagement.favorites || 0,
          totalTimeWatched: engagement.total_time_watched || 0,
          averageTimeWatched: engagement.average_time_watched || 0,
          fullVideoWatchedRate: fullVideoWatchedRate,
          newFollowers: engagement.new_followers || 0,
          profileViews: engagement.profile_views || 0,
          // 視聴維持率
          retention1s: retention1s,
          retention2s: retention2s,
          // 既存データも更新
          viewCount: engagement.video_views || 0,
          likeCount: engagement.likes || 0,
          commentCount: engagement.comments || 0,
          shareCount: engagement.shares || 0,
          duration: engagement.video_duration || 0,
          // メタデータ
          lastEngagementSyncAt: Timestamp.now(),
        };

        await db.collection("tiktok_videos").doc(videoId).update(updateData);
        totalUpdated++;
      }

      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    res.json({
      success: true,
      message: `${totalUpdated}件のエンゲージメントデータを同期しました`,
      updated: totalUpdated,
    });

  } catch (error: any) {
    console.error("Error syncing engagements:", error);
    res.status(500).json({
      success: false,
      message: "エンゲージメント同期に失敗しました",
      error: error?.message || "Unknown error",
    });
  }
});

// 商品配下の全アカウントのエンゲージメントを同期
app.post("/tiktok/sync-all-engagements/:productId", async (req: Request, res: Response) => {
  try {
    const productId = req.params.productId;

    // 商品に紐づくアカウント一覧を取得
    const accountsSnapshot = await db.collection("tiktok_accounts")
      .where("productId", "==", productId)
      .get();

    if (accountsSnapshot.empty) {
      return res.json({
        success: true,
        message: "同期対象のアカウントがありません",
        results: [],
      });
    }

    const results: any[] = [];

    for (const accountDoc of accountsSnapshot.docs) {
      const account = accountDoc.data();
      const accountId = accountDoc.id;

      // tiktokUserIdがopenIdとして保存されている（Firestore上のフィールド名はtiktokUserId）
      const businessId = account.tiktokUserId || account.openId;
      if (!account.accessToken || !businessId) {
        results.push({
          accountId,
          accountName: account.tiktokUserName || 'Unknown',
          success: false,
          message: "認証情報なし",
        });
        continue;
      }

      // このアカウントの動画一覧を取得
      const videosSnapshot = await db.collection("tiktok_videos")
        .where("accountId", "==", accountId)
        .get();

      if (videosSnapshot.empty) {
        results.push({
          accountId,
          accountName: account.tiktokUserName || 'Unknown',
          success: true,
          updated: 0,
        });
        continue;
      }

      const videoIds = videosSnapshot.docs.map(doc => doc.data().videoId);
      let accountUpdated = 0;

      // 10件ずつチャンクに分割
      const chunkSize = 10;
      for (let i = 0; i < videoIds.length; i += chunkSize) {
        const chunk = videoIds.slice(i, i + chunkSize);

        const engagements = await fetchBusinessApiEngagements(
          account.accessToken,
          businessId,
          chunk
        );

        for (const engagement of engagements) {
          const videoId = engagement.item_id;
          if (!videoId) continue;

          // TikTok APIでは second が数値の場合と文字列の場合がある
          // percentageは0〜1の小数値なので100倍してパーセント表示にする
          const retention1sRaw = engagement.video_view_retention?.find((r: any) => r.second === "1" || r.second === 1)?.percentage ?? null;
          const retention2sRaw = engagement.video_view_retention?.find((r: any) => r.second === "2" || r.second === 2)?.percentage ?? null;
          const retention1s = retention1sRaw !== null ? retention1sRaw * 100 : null;
          const retention2s = retention2sRaw !== null ? retention2sRaw * 100 : null;
          // fullVideoWatchedRateも0〜1の小数なので100倍
          const fullVideoWatchedRateRaw = engagement.full_video_watched_rate ?? null;
          const fullVideoWatchedRate = fullVideoWatchedRateRaw !== null ? fullVideoWatchedRateRaw * 100 : 0;

          await db.collection("tiktok_videos").doc(videoId).update({
            reach: engagement.reach || 0,
            favorites: engagement.favorites || 0,
            totalTimeWatched: engagement.total_time_watched || 0,
            averageTimeWatched: engagement.average_time_watched || 0,
            fullVideoWatchedRate: fullVideoWatchedRate,
            newFollowers: engagement.new_followers || 0,
            profileViews: engagement.profile_views || 0,
            retention1s: retention1s,
            retention2s: retention2s,
            viewCount: engagement.video_views || 0,
            likeCount: engagement.likes || 0,
            commentCount: engagement.comments || 0,
            shareCount: engagement.shares || 0,
            duration: engagement.video_duration || 0,
            lastEngagementSyncAt: Timestamp.now(),
          });
          accountUpdated++;
        }

        await new Promise(resolve => setTimeout(resolve, 500));
      }

      results.push({
        accountId,
        accountName: account.tiktokUserName || 'Unknown',
        success: true,
        updated: accountUpdated,
      });
    }

    const totalUpdated = results.reduce((sum, r) => sum + (r.updated || 0), 0);

    res.json({
      success: true,
      message: `${totalUpdated}件のエンゲージメントデータを同期しました`,
      totalUpdated,
      results,
    });

  } catch (error: any) {
    console.error("Error syncing all engagements:", error);
    res.status(500).json({
      success: false,
      message: "エンゲージメント同期に失敗しました",
      error: error?.message || "Unknown error",
    });
  }
});

// createTimeを1年戻す（2024年→2025年に修正）
app.post("/tiktok/fix-createtime-to-2025", async (req: Request, res: Response) => {
  try {
    const videosSnapshot = await db.collection("tiktok_videos").get();
    let updated = 0;

    for (const doc of videosSnapshot.docs) {
      const video = doc.data();
      const createTime = video.createTime;

      if (typeof createTime === 'string' && createTime.includes('2024')) {
        const fixedTime = createTime.replace('2024', '2025');
        await db.collection("tiktok_videos").doc(doc.id).update({
          createTime: fixedTime
        });
        updated++;
      }
    }

    res.json({
      success: true,
      message: `${updated}件のcreateTimeを2025年に修正しました`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message });
  }
});

// デバッグ用：全TikTokアカウントを取得
app.get("/tiktok/debug/all-accounts", async (req: Request, res: Response) => {
  try {
    const accountsSnapshot = await db.collection("tiktok_accounts").get();
    const accounts = accountsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json({ success: true, accounts, count: accounts.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message });
  }
});

// 商品全体の日次推移データ（TikTok + モール売上）
app.get("/tiktok/analytics/daily-trend/:productId", async (req: Request, res: Response) => {
  try {
    const productId = req.params.productId;
    const { startDate, endDate } = req.query;

    // デフォルト期間（過去7日）
    const end = endDate ? String(endDate) : new Date().toISOString().split('T')[0];
    const start = startDate ? String(startDate) : (() => {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      return d.toISOString().split('T')[0];
    })();

    // 日付リストを生成
    const dateList: string[] = [];
    const currentDate = new Date(start);
    const endDateObj = new Date(end);
    while (currentDate <= endDateObj) {
      dateList.push(currentDate.toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // 商品情報を取得
    const productDoc = await db.collection("registered_products").doc(productId).get();
    if (!productDoc.exists) {
      return res.status(404).json({ success: false, message: "商品が見つかりません" });
    }
    const productData = productDoc.data();
    const productCode = productData?.productCode || productId;

    // 1. TikTok日次統計を取得（スナップショットの差分から計算）
    const tiktokDailyMap: { [date: string]: { views: number; likes: number; comments: number; shares: number; videoCount: number } } = {};

    // アカウントIDリストを取得（非表示アカウントを除外）
    const accountsSnapshot = await db.collection("tiktok_accounts")
      .where("productId", "==", productId)
      .get();
    const accountIds = accountsSnapshot.docs
      .filter(doc => doc.data().hidden !== true)  // 非表示アカウントを除外
      .map(doc => doc.id);

    // 日次スナップショットから差分を計算
    if (accountIds.length > 0) {
      // 前日のデータも必要なので、start-1日からのスナップショットを取得
      const prevDay = new Date(start);
      prevDay.setDate(prevDay.getDate() - 1);
      const prevDayStr = prevDay.toISOString().split('T')[0];

      // videoIdごとに日別のスナップショットを取得
      const videoSnapshots: { [videoId: string]: { [date: string]: { viewCount: number; likeCount: number; commentCount: number; shareCount: number } } } = {};

      for (const accountId of accountIds) {
        const snapshotsQuery = await db.collection("tiktok_video_daily_snapshots")
          .where("accountId", "==", accountId)
          .where("date", ">=", prevDayStr)
          .where("date", "<=", end)
          .get();

        for (const doc of snapshotsQuery.docs) {
          const snap = doc.data();
          const videoId = snap.videoId;
          const date = snap.date;

          if (!videoSnapshots[videoId]) {
            videoSnapshots[videoId] = {};
          }
          videoSnapshots[videoId][date] = {
            viewCount: snap.viewCount || 0,
            likeCount: snap.likeCount || 0,
            commentCount: snap.commentCount || 0,
            shareCount: snap.shareCount || 0,
          };
        }
      }

      // 各日のビューを差分で計算
      for (const date of dateList) {
        if (!tiktokDailyMap[date]) {
          tiktokDailyMap[date] = { views: 0, likes: 0, comments: 0, shares: 0, videoCount: 0 };
        }

        const prevDate = new Date(date);
        prevDate.setDate(prevDate.getDate() - 1);
        const prevDateStr = prevDate.toISOString().split('T')[0];

        for (const videoId in videoSnapshots) {
          const todaySnap = videoSnapshots[videoId][date];
          const prevSnap = videoSnapshots[videoId][prevDateStr];

          if (todaySnap) {
            // 当日のスナップショットがある場合
            if (prevSnap) {
              // 前日もある場合は差分を計算
              const viewDiff = Math.max(0, todaySnap.viewCount - prevSnap.viewCount);
              const likeDiff = Math.max(0, todaySnap.likeCount - prevSnap.likeCount);
              const commentDiff = Math.max(0, todaySnap.commentCount - prevSnap.commentCount);
              const shareDiff = Math.max(0, todaySnap.shareCount - prevSnap.shareCount);

              tiktokDailyMap[date].views += viewDiff;
              tiktokDailyMap[date].likes += likeDiff;
              tiktokDailyMap[date].comments += commentDiff;
              tiktokDailyMap[date].shares += shareDiff;
              if (viewDiff > 0 || likeDiff > 0 || commentDiff > 0 || shareDiff > 0) {
                tiktokDailyMap[date].videoCount += 1;
              }
            }
            // 前日がない場合は差分計算不可なのでスキップ（初日のデータ）
          }
        }
      }
    }

    // 2. モール売上データを取得
    const salesDailyMap: { [date: string]: { qoo10Sales: number; rakutenSales: number; totalSales: number } } = {};

    try {
      const salesSnapshot = await db.collection("product_sales")
        .where("productCode", "==", productCode)
        .where("date", ">=", start)
        .where("date", "<=", end)
        .get();

      for (const doc of salesSnapshot.docs) {
        const data = doc.data();
        const date = data.date;
        const mall = data.mall;

        if (!salesDailyMap[date]) {
          salesDailyMap[date] = { qoo10Sales: 0, rakutenSales: 0, totalSales: 0 };
        }

        if (mall === 'qoo10') {
          salesDailyMap[date].qoo10Sales += data.sales || 0;
        } else if (mall === 'rakuten') {
          salesDailyMap[date].rakutenSales += data.sales || 0;
        }
        salesDailyMap[date].totalSales = salesDailyMap[date].qoo10Sales + salesDailyMap[date].rakutenSales;
      }
    } catch (err: any) {
      console.log("product_sales query error (index may be building):", err?.message);
    }

    // 3. 日付ごとのデータを整形
    const dailyData = dateList.map(date => {
      const tiktok = tiktokDailyMap[date] || { views: 0, likes: 0, comments: 0, shares: 0, videoCount: 0 };
      const sales = salesDailyMap[date] || { qoo10Sales: 0, rakutenSales: 0, totalSales: 0 };

      const engagementRate = tiktok.views > 0
        ? ((tiktok.likes + tiktok.comments + tiktok.shares) / tiktok.views) * 100
        : 0;

      return {
        date,
        views: tiktok.views,
        videoCount: tiktok.videoCount,
        engagementRate: parseFloat(engagementRate.toFixed(2)),
        qoo10Sales: sales.qoo10Sales,
        rakutenSales: sales.rakutenSales,
        totalSales: sales.totalSales,
      };
    });

    res.json({
      success: true,
      productId,
      productCode,
      period: { startDate: start, endDate: end },
      dailyData,
    });

  } catch (error: any) {
    console.error("Error fetching daily trend:", error);
    res.status(500).json({
      success: false,
      message: "日次推移データの取得に失敗しました",
      error: error?.message || "Unknown error",
    });
  }
});

// 動画の日次スナップショットを保存（毎日実行用）
// Firestoreコレクション: tiktok_video_daily_snapshots/{videoId}_{date}
app.post("/tiktok/save-daily-snapshots/:productId", async (req: Request, res: Response) => {
  try {
    const productId = req.params.productId;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // アカウントIDリストを取得（非表示アカウントを除外）
    const accountsSnapshot = await db.collection("tiktok_accounts")
      .where("productId", "==", productId)
      .get();
    const accountIds = accountsSnapshot.docs
      .filter(doc => doc.data().hidden !== true)  // 非表示アカウントを除外
      .map(doc => doc.id);

    if (accountIds.length === 0) {
      return res.status(404).json({ success: false, message: "TikTokアカウントが見つかりません" });
    }

    let savedCount = 0;
    const batch = db.batch();

    // 各動画の現在のデータをスナップショットとして保存
    for (const accountId of accountIds) {
      const videosSnapshot = await db.collection("tiktok_videos")
        .where("accountId", "==", accountId)
        .get();

      for (const doc of videosSnapshot.docs) {
        const video = doc.data();
        const videoId = doc.id;
        const snapshotId = `${videoId}_${today}`;

        const snapshotRef = db.collection("tiktok_video_daily_snapshots").doc(snapshotId);
        batch.set(snapshotRef, {
          videoId,
          accountId,
          productId,
          date: today,
          viewCount: video.viewCount || 0,
          likeCount: video.likeCount || 0,
          commentCount: video.commentCount || 0,
          shareCount: video.shareCount || 0,
          createTime: video.createTime,
          savedAt: new Date(),
        }, { merge: true });
        savedCount++;
      }
    }

    await batch.commit();

    res.json({
      success: true,
      message: `${savedCount}件の動画スナップショットを保存しました`,
      date: today,
      productId,
    });
  } catch (error: any) {
    console.error("Error saving daily snapshots:", error);
    res.status(500).json({
      success: false,
      message: "日次スナップショットの保存に失敗しました",
      error: error?.message,
    });
  }
});

// 全商品の日次スナップショットを保存（cron用）
app.post("/tiktok/save-all-daily-snapshots", async (req: Request, res: Response) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // 全TikTokアカウントを取得
    const accountsSnapshot = await db.collection("tiktok_accounts").get();

    let totalSaved = 0;
    const productResults: { productId: string; count: number }[] = [];

    for (const accountDoc of accountsSnapshot.docs) {
      const accountData = accountDoc.data();
      const accountId = accountDoc.id;
      const productId = accountData.productId;

      const videosSnapshot = await db.collection("tiktok_videos")
        .where("accountId", "==", accountId)
        .get();

      const batch = db.batch();
      let productCount = 0;

      for (const videoDoc of videosSnapshot.docs) {
        const video = videoDoc.data();
        const videoId = videoDoc.id;
        const snapshotId = `${videoId}_${today}`;

        const snapshotRef = db.collection("tiktok_video_daily_snapshots").doc(snapshotId);
        batch.set(snapshotRef, {
          videoId,
          accountId,
          productId,
          date: today,
          viewCount: video.viewCount || 0,
          likeCount: video.likeCount || 0,
          commentCount: video.commentCount || 0,
          shareCount: video.shareCount || 0,
          createTime: video.createTime,
          savedAt: new Date(),
        }, { merge: true });
        productCount++;
      }

      await batch.commit();
      totalSaved += productCount;
      productResults.push({ productId, count: productCount });
    }

    res.json({
      success: true,
      message: `${totalSaved}件の動画スナップショットを保存しました`,
      date: today,
      details: productResults,
    });
  } catch (error: any) {
    console.error("Error saving all daily snapshots:", error);
    res.status(500).json({
      success: false,
      message: "日次スナップショットの保存に失敗しました",
      error: error?.message,
    });
  }
});

// 差分計算の日次推移データ取得
app.get("/tiktok/analytics/daily-trend-v2/:productId", async (req: Request, res: Response) => {
  try {
    const productId = req.params.productId;
    const { startDate, endDate } = req.query;

    // デフォルト期間（過去7日）
    const end = endDate ? String(endDate) : new Date().toISOString().split('T')[0];
    const start = startDate ? String(startDate) : (() => {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      return d.toISOString().split('T')[0];
    })();

    // 日付リストを生成
    const dateList: string[] = [];
    const currentDate = new Date(start);
    const endDateObj = new Date(end);
    while (currentDate <= endDateObj) {
      dateList.push(currentDate.toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // 商品情報を取得
    const productDoc = await db.collection("registered_products").doc(productId).get();
    if (!productDoc.exists) {
      return res.status(404).json({ success: false, message: "商品が見つかりません" });
    }
    const productData = productDoc.data();
    const productCode = productData?.productCode || productId;

    // アカウントIDリストを取得（非表示アカウントを除外）
    const accountsSnapshot = await db.collection("tiktok_accounts")
      .where("productId", "==", productId)
      .get();
    const accountIds = accountsSnapshot.docs
      .filter(doc => doc.data().hidden !== true)  // 非表示アカウントを除外
      .map(doc => doc.id);

    // 日付リストを生成（startDateの前日も含める、差分計算用）
    const prevDay = new Date(start);
    prevDay.setDate(prevDay.getDate() - 1);
    const prevDayStr = prevDay.toISOString().split('T')[0];

    // スナップショットデータを取得（startDate-1日からendDateまで）
    const snapshotsByDate: { [date: string]: { views: number; likes: number; comments: number; shares: number } } = {};
    const videoPostsByDate: { [date: string]: number } = {}; // 投稿日別の動画数

    if (accountIds.length > 0) {
      // 動画のcreateTime（投稿日）を取得
      for (const accountId of accountIds) {
        const videosSnapshot = await db.collection("tiktok_videos")
          .where("accountId", "==", accountId)
          .get();

        for (const doc of videosSnapshot.docs) {
          const video = doc.data();
          const createTime = video.createTime;
          if (createTime) {
            let postDate: string;
            if (typeof createTime === 'string') {
              postDate = createTime.split('T')[0];
            } else if (typeof createTime === 'number') {
              postDate = new Date(createTime * 1000).toISOString().split('T')[0];
            } else if (createTime?.toDate) {
              postDate = createTime.toDate().toISOString().split('T')[0];
            } else {
              continue;
            }
            // 期間内の投稿をカウント
            if (postDate >= start && postDate <= end) {
              videoPostsByDate[postDate] = (videoPostsByDate[postDate] || 0) + 1;
            }
          }
        }
      }

      // スナップショットを取得
      const snapshotsQuery = await db.collection("tiktok_video_daily_snapshots")
        .where("productId", "==", productId)
        .where("date", ">=", prevDayStr)
        .where("date", "<=", end)
        .get();

      for (const doc of snapshotsQuery.docs) {
        const snap = doc.data();
        const date = snap.date;
        if (!snapshotsByDate[date]) {
          snapshotsByDate[date] = { views: 0, likes: 0, comments: 0, shares: 0 };
        }
        snapshotsByDate[date].views += snap.viewCount || 0;
        snapshotsByDate[date].likes += snap.likeCount || 0;
        snapshotsByDate[date].comments += snap.commentCount || 0;
        snapshotsByDate[date].shares += snap.shareCount || 0;
      }

      // スナップショットデータがない場合、tiktok_videosから今日の累計データを取得
      const today = new Date().toISOString().split('T')[0];
      if (Object.keys(snapshotsByDate).length === 0 || !snapshotsByDate[today]) {
        // tiktok_videosから現在の累計値を取得して今日のスナップショットとして使う
        let totalViews = 0;
        let totalLikes = 0;
        let totalComments = 0;
        let totalShares = 0;

        for (const accountId of accountIds) {
          const videosSnapshot = await db.collection("tiktok_videos")
            .where("accountId", "==", accountId)
            .get();

          for (const doc of videosSnapshot.docs) {
            const video = doc.data();
            totalViews += video.viewCount || 0;
            totalLikes += video.likeCount || 0;
            totalComments += video.commentCount || 0;
            totalShares += video.shareCount || 0;
          }
        }

        // 今日の日付が期間内であれば、累計値を今日のデータとして設定
        if (today >= start && today <= end) {
          snapshotsByDate[today] = {
            views: totalViews,
            likes: totalLikes,
            comments: totalComments,
            shares: totalShares,
          };
          console.log(`[daily-trend-v2] Using tiktok_videos total as today's data: views=${totalViews}`);
        }
      }
    }

    // モール売上データを取得
    const salesDailyMap: { [date: string]: { qoo10Sales: number; rakutenSales: number; amazonSales: number; totalSales: number } } = {};
    try {
      const salesSnapshot = await db.collection("product_sales")
        .where("productCode", "==", productCode)
        .where("date", ">=", start)
        .where("date", "<=", end)
        .get();

      for (const doc of salesSnapshot.docs) {
        const data = doc.data();
        const date = data.date;
        const mall = data.mall;

        if (!salesDailyMap[date]) {
          salesDailyMap[date] = { qoo10Sales: 0, rakutenSales: 0, amazonSales: 0, totalSales: 0 };
        }

        if (mall === 'qoo10') {
          salesDailyMap[date].qoo10Sales += data.sales || 0;
        } else if (mall === 'rakuten') {
          salesDailyMap[date].rakutenSales += data.sales || 0;
        }
      }
    } catch (err: any) {
      console.log("product_sales query error:", err?.message);
    }

    // Amazon売上データを取得（amazon_daily_salesコレクションから）
    // 複合インデックスを避けるため、productIdのみでクエリしてからクライアント側で日付フィルタ
    try {
      const amazonSalesSnapshot = await db.collection("amazon_daily_sales")
        .where("productId", "==", productId)
        .get();

      console.log(`[daily-trend-v2] amazon_daily_sales query: ${amazonSalesSnapshot.size} docs for productId=${productId}`);

      for (const doc of amazonSalesSnapshot.docs) {
        const data = doc.data();
        const date = data.date;

        // 日付範囲チェック
        if (date < start || date > end) {
          continue;
        }

        if (!salesDailyMap[date]) {
          salesDailyMap[date] = { qoo10Sales: 0, rakutenSales: 0, amazonSales: 0, totalSales: 0 };
        }

        // salesAmountを数値として取得（既に数値型で保存されている場合も対応）
        const salesAmount = typeof data.salesAmount === 'number' ? data.salesAmount : (parseFloat(data.salesAmount) || 0);
        salesDailyMap[date].amazonSales += salesAmount;
        console.log(`[daily-trend-v2] Amazon ${date}: salesAmount=${salesAmount}`);
      }
    } catch (err: any) {
      console.log("amazon_daily_sales query error:", err?.message);
    }

    // 楽天売上データも取得（rakuten_daily_salesコレクションから）
    try {
      const rakutenSalesSnapshot = await db.collection("rakuten_daily_sales")
        .where("productId", "==", productId)
        .get();

      for (const doc of rakutenSalesSnapshot.docs) {
        const data = doc.data();
        const date = data.date;

        // 日付範囲チェック
        if (date < start || date > end) {
          continue;
        }

        if (!salesDailyMap[date]) {
          salesDailyMap[date] = { qoo10Sales: 0, rakutenSales: 0, amazonSales: 0, totalSales: 0 };
        }

        // salesAmountを数値として取得
        const salesAmount = typeof data.salesAmount === 'number' ? data.salesAmount : (parseFloat(data.salesAmount) || 0);
        salesDailyMap[date].rakutenSales += salesAmount;
      }
    } catch (err: any) {
      console.log("rakuten_daily_sales query error:", err?.message);
    }

    // totalSalesを計算
    for (const date of Object.keys(salesDailyMap)) {
      const s = salesDailyMap[date];
      s.totalSales = s.qoo10Sales + s.rakutenSales + s.amazonSales;
    }

    // 日付ごとの差分データを計算
    const dailyData = dateList.map((date, index) => {
      // 前日の日付
      const prevDate = index === 0 ? prevDayStr : dateList[index - 1];

      const todaySnap = snapshotsByDate[date] || { views: 0, likes: 0, comments: 0, shares: 0 };
      const prevSnap = snapshotsByDate[prevDate] || { views: 0, likes: 0, comments: 0, shares: 0 };

      // 差分計算（当日 - 前日）
      // 前日のスナップショットがない場合は、当日の値をそのまま使用
      const viewsDiff = prevSnap.views === 0 ? todaySnap.views : Math.max(0, todaySnap.views - prevSnap.views);
      const likesDiff = prevSnap.likes === 0 ? todaySnap.likes : Math.max(0, todaySnap.likes - prevSnap.likes);
      const commentsDiff = prevSnap.comments === 0 ? todaySnap.comments : Math.max(0, todaySnap.comments - prevSnap.comments);
      const sharesDiff = prevSnap.shares === 0 ? todaySnap.shares : Math.max(0, todaySnap.shares - prevSnap.shares);

      // ER% = (いいね + コメント + シェア) / 再生数 * 100
      const engagementRate = viewsDiff > 0
        ? ((likesDiff + commentsDiff + sharesDiff) / viewsDiff) * 100
        : 0;

      const sales = salesDailyMap[date] || { qoo10Sales: 0, rakutenSales: 0, amazonSales: 0, totalSales: 0 };
      const videoCount = videoPostsByDate[date] || 0;

      return {
        date,
        views: viewsDiff, // 日次増分（前日のスナップショットがなければ累計値）
        videoCount, // 投稿日にカウント
        engagementRate: parseFloat(engagementRate.toFixed(2)),
        qoo10Sales: sales.qoo10Sales,
        rakutenSales: sales.rakutenSales,
        amazonSales: sales.amazonSales,
        totalSales: sales.totalSales,
      };
    });

    res.json({
      success: true,
      productId,
      productCode,
      period: { startDate: start, endDate: end },
      dailyData,
      hasSnapshotData: Object.keys(snapshotsByDate).length > 0,
    });

  } catch (error: any) {
    console.error("Error fetching daily trend v2:", error);
    res.status(500).json({
      success: false,
      message: "日次推移データの取得に失敗しました",
      error: error?.message || "Unknown error",
    });
  }
});

// デバッグ用：TikTokスナップショットを確認
app.get("/debug/tiktok-snapshots/:productId", async (req: Request, res: Response) => {
  try {
    const productId = req.params.productId;
    const today = new Date().toISOString().split('T')[0];
    const yesterday = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return d.toISOString().split('T')[0];
    })();

    // アカウント取得
    const accountsSnapshot = await db.collection("tiktok_accounts")
      .where("productId", "==", productId)
      .get();

    const accountIds = accountsSnapshot.docs.map(doc => doc.id);

    // 今日と昨日のスナップショットを取得
    const todaySnapshots = await db.collection("tiktok_daily_stats")
      .where("productId", "==", productId)
      .where("date", "==", today)
      .limit(10)
      .get();

    const yesterdaySnapshots = await db.collection("tiktok_daily_stats")
      .where("productId", "==", productId)
      .where("date", "==", yesterday)
      .limit(10)
      .get();

    res.json({
      success: true,
      productId,
      today,
      yesterday,
      accountCount: accountIds.length,
      todaySnapshotCount: todaySnapshots.size,
      yesterdaySnapshotCount: yesterdaySnapshots.size,
      todaySamples: todaySnapshots.docs.slice(0, 3).map(d => d.data()),
      yesterdaySamples: yesterdaySnapshots.docs.slice(0, 3).map(d => d.data()),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message });
  }
});

// デバッグ用：amazon_daily_salesのデータを確認
app.get("/debug/amazon-daily-sales/:productId", async (req: Request, res: Response) => {
  try {
    const productId = req.params.productId;
    const { startDate, endDate } = req.query;

    const start = startDate ? String(startDate) : "2025-09-01";
    const end = endDate ? String(endDate) : "2025-09-10";

    const snapshot = await db.collection("amazon_daily_sales")
      .where("productId", "==", productId)
      .get();

    const allData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    // 日付範囲内のデータ
    const filteredData = allData.filter((d: any) => d.date >= start && d.date <= end);

    res.json({
      success: true,
      productId,
      totalCount: allData.length,
      filteredCount: filteredData.length,
      sampleDates: allData.slice(0, 5).map((d: any) => d.date),
      sampleData: filteredData.slice(0, 5),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error?.message || "Unknown error",
    });
  }
});

// 既存の動画データから過去のスナップショットを生成（初期データ投入用）
app.post("/tiktok/backfill-snapshots/:productId", async (req: Request, res: Response) => {
  try {
    const productId = req.params.productId;
    const { days = 30 } = req.body; // デフォルト30日分

    // アカウントIDリストを取得（非表示アカウントを除外）
    const accountsSnapshot = await db.collection("tiktok_accounts")
      .where("productId", "==", productId)
      .get();
    const accountIds = accountsSnapshot.docs
      .filter(doc => doc.data().hidden !== true)  // 非表示アカウントを除外
      .map(doc => doc.id);

    if (accountIds.length === 0) {
      return res.status(404).json({ success: false, message: "TikTokアカウントが見つかりません" });
    }

    // 現在の動画データを取得
    const allVideos: { id: string; data: any }[] = [];
    for (const accountId of accountIds) {
      const videosSnapshot = await db.collection("tiktok_videos")
        .where("accountId", "==", accountId)
        .get();

      for (const doc of videosSnapshot.docs) {
        allVideos.push({ id: doc.id, data: doc.data() });
      }
    }

    // 過去N日分のスナップショットを生成
    // 注意: これは現在の累計値をそのまま各日に入れるので、差分は0になる
    // 実際の運用では、本日から毎日スナップショットを保存していく
    const today = new Date();
    let savedCount = 0;

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const batch = db.batch();
      for (const video of allVideos) {
        const snapshotId = `${video.id}_${dateStr}`;
        const snapshotRef = db.collection("tiktok_video_daily_snapshots").doc(snapshotId);

        batch.set(snapshotRef, {
          videoId: video.id,
          accountId: video.data.accountId,
          productId,
          date: dateStr,
          viewCount: video.data.viewCount || 0,
          likeCount: video.data.likeCount || 0,
          commentCount: video.data.commentCount || 0,
          shareCount: video.data.shareCount || 0,
          createTime: video.data.createTime,
          savedAt: new Date(),
          isBackfilled: true, // バックフィルデータであることを示すフラグ
        }, { merge: true });
        savedCount++;
      }
      await batch.commit();
    }

    res.json({
      success: true,
      message: `${savedCount}件のスナップショットを生成しました`,
      days,
      videoCount: allVideos.length,
      productId,
    });
  } catch (error: any) {
    console.error("Error backfilling snapshots:", error);
    res.status(500).json({
      success: false,
      message: "スナップショットの生成に失敗しました",
      error: error?.message,
    });
  }
});

// スナップショットを削除（特定日以外）
app.delete("/tiktok/delete-snapshots-except/:productId/:keepDate", async (req: Request, res: Response) => {
  try {
    const { productId, keepDate } = req.params;

    const snapshotsQuery = await db.collection("tiktok_video_daily_snapshots")
      .where("productId", "==", productId)
      .get();

    let deletedCount = 0;
    const batch = db.batch();

    for (const doc of snapshotsQuery.docs) {
      const snap = doc.data();
      if (snap.date !== keepDate) {
        batch.delete(doc.ref);
        deletedCount++;
      }
    }

    await batch.commit();

    res.json({
      success: true,
      message: `${deletedCount}件のスナップショットを削除しました（${keepDate}以外）`,
      keepDate,
      productId,
    });
  } catch (error: any) {
    console.error("Error deleting snapshots:", error);
    res.status(500).json({
      success: false,
      message: "スナップショットの削除に失敗しました",
      error: error?.message,
    });
  }
});

// スナップショットのデバッグ用エンドポイント
app.get("/tiktok/debug-snapshots/:productId", async (req: Request, res: Response) => {
  try {
    const productId = req.params.productId;

    // アカウントIDリストを取得
    const accountsSnapshot = await db.collection("tiktok_accounts")
      .where("productId", "==", productId)
      .get();
    const accountIds = accountsSnapshot.docs.map(doc => doc.id);

    // スナップショットを日付でグループ化して取得
    const dateStats: { [date: string]: { count: number; totalViews: number } } = {};

    for (const accountId of accountIds) {
      const snapshotsQuery = await db.collection("tiktok_video_daily_snapshots")
        .where("accountId", "==", accountId)
        .get();

      for (const doc of snapshotsQuery.docs) {
        const snap = doc.data();
        const date = snap.date;
        if (!dateStats[date]) {
          dateStats[date] = { count: 0, totalViews: 0 };
        }
        dateStats[date].count++;
        dateStats[date].totalViews += snap.viewCount || 0;
      }
    }

    // 日付でソート
    const sortedDates = Object.keys(dateStats).sort();

    res.json({
      success: true,
      productId,
      accountIds,
      snapshotsByDate: sortedDates.map(date => ({
        date,
        ...dateStats[date]
      })),
      totalDates: sortedDates.length,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message });
  }
});

// 非公開動画をチェックして削除するエンドポイント
app.post("/tiktok/cleanup-private-videos", async (req: Request, res: Response) => {
  try {
    console.log("Starting cleanup of private videos...");

    // 全アカウントを取得
    const accountsSnapshot = await db.collection("tiktok_accounts").get();

    let totalChecked = 0;
    let totalDeleted = 0;
    let totalErrors = 0;
    const deletedVideos: string[] = [];

    for (const accountDoc of accountsSnapshot.docs) {
      const account = accountDoc.data();
      const accountId = accountDoc.id;

      if (!account.accessToken || !account.tiktokUserId) {
        continue;
      }

      try {
        // TikTok APIから現在の動画リストを取得（visibility含む）
        const axios = (await import('axios')).default;
        let cursor = 0;
        let hasMore = true;
        const publicVideoIds = new Set<string>();

        while (hasMore) {
          const response = await axios.post(
            'https://open.tiktokapis.com/v2/video/list/',
            { max_count: 20, cursor },
            {
              headers: {
                'Authorization': `Bearer ${account.accessToken}`,
                'Content-Type': 'application/json',
              },
              params: {
                fields: 'id,visibility',
              },
            }
          );

          const data = response.data?.data;
          if (data?.videos && Array.isArray(data.videos)) {
            for (const video of data.videos) {
              // 公開動画のIDを記録
              if (video.visibility === 'PUBLIC_TO_EVERYONE' || !video.visibility) {
                publicVideoIds.add(video.id);
              }
            }
          }

          hasMore = data?.has_more === true;
          if (hasMore && data?.cursor !== undefined) {
            cursor = data.cursor;
          } else {
            hasMore = false;
          }

          await new Promise(resolve => setTimeout(resolve, 300));
        }

        // Firestoreにある動画で、APIにない or 非公開の動画を削除
        const videosSnapshot = await db.collection("tiktok_videos")
          .where("accountId", "==", accountId)
          .get();

        for (const videoDoc of videosSnapshot.docs) {
          totalChecked++;
          const videoId = videoDoc.id;

          // APIから取得した公開動画リストにない = 非公開か削除された動画
          if (!publicVideoIds.has(videoId)) {
            await videoDoc.ref.delete();
            deletedVideos.push(videoId);
            totalDeleted++;
            console.log(`Deleted private/removed video: ${videoId} from account ${accountId}`);
          }
        }

      } catch (accountError: any) {
        console.error(`Error checking account ${accountId}:`, accountError?.message);
        totalErrors++;
      }

      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    res.json({
      success: true,
      message: `非公開動画のクリーンアップが完了しました`,
      totalChecked,
      totalDeleted,
      totalErrors,
      deletedVideos: deletedVideos.slice(0, 100), // 最大100件まで表示
    });

  } catch (error: any) {
    console.error("Error cleaning up private videos:", error);
    res.status(500).json({
      success: false,
      message: "非公開動画のクリーンアップに失敗しました",
      error: error?.message || "Unknown error",
    });
  }
});

// ==================== End TikTok Business API ====================

// ==================== Amazon売上データ手動入稿 ====================

// Amazon売上データCSV入稿
app.post("/amazon/import-sales-csv/:productId", async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const { data } = req.body; // CSVパース済みのデータ配列

    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({
        success: false,
        message: "データが空です",
      });
    }

    // 商品情報を取得
    const productDoc = await db.collection("registered_products").doc(productId).get();
    if (!productDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "商品が見つかりません",
      });
    }

    const productData = productDoc.data();
    // amazonCodeがなくてもproductIdをキーとして保存可能に
    const amazonCode = productData?.amazonCode || productId;

    let savedCount = 0;
    const batch = db.batch();

    for (const row of data) {
      // 日付をパース (YYYY-MM-DD または YYYY/MM/DD 形式を想定)
      const dateStr = row.date?.replace(/\//g, "-");
      if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        continue;
      }

      const docId = `${amazonCode}_${dateStr}`;
      const docRef = db.collection("amazon_daily_sales").doc(docId);

      batch.set(docRef, {
        productId,
        amazonCode,
        date: dateStr,
        // 売上データ
        salesAmount: parseFloat(row.salesAmount) || 0,
        salesAmountB2B: parseFloat(row.salesAmountB2B) || 0,
        orderedUnits: parseInt(row.orderedUnits) || 0,
        orderedUnitsB2B: parseInt(row.orderedUnitsB2B) || 0,
        totalOrderItems: parseInt(row.totalOrderItems) || 0,
        totalOrderItemsB2B: parseInt(row.totalOrderItemsB2B) || 0,
        // トラフィックデータ
        pageViews: parseInt(row.pageViews) || 0,
        pageViewsB2B: parseInt(row.pageViewsB2B) || 0,
        sessions: parseInt(row.sessions) || 0,
        sessionsB2B: parseInt(row.sessionsB2B) || 0,
        // カート獲得率
        buyBoxPercentage: parseFloat(row.buyBoxPercentage) || 0,
        buyBoxPercentageB2B: parseFloat(row.buyBoxPercentageB2B) || 0,
        // CVR
        unitSessionPercentage: parseFloat(row.unitSessionPercentage) || 0,
        unitSessionPercentageB2B: parseFloat(row.unitSessionPercentageB2B) || 0,
        // その他
        averageOfferCount: parseFloat(row.averageOfferCount) || 0,
        averageParentItems: parseFloat(row.averageParentItems) || 0,
        // メタデータ
        importedAt: new Date(),
        source: "manual_csv",
      }, { merge: true });

      // ダッシュボードで参照しているproduct_salesにも書き込む
      // productIdベースで保存（amazonCodeが空でも動作するように）
      const productSalesRef = db.collection("product_sales").doc(`amazon_${productId}_${dateStr}`);
      batch.set(productSalesRef, {
        productId,
        productCode: amazonCode || productId, // amazonCodeがあれば使用、なければproductId
        mall: "amazon",
        date: dateStr,
        sales: parseFloat(row.salesAmount) || 0,
        quantity: parseInt(row.orderedUnits) || 0,
        updatedAt: Timestamp.now(),
      }, { merge: true });

      savedCount++;
    }

    await batch.commit();

    res.json({
      success: true,
      message: `${savedCount}件のAmazon売上データを保存しました`,
      productId,
      amazonCode,
      savedCount,
    });
  } catch (error: any) {
    console.error("Error importing Amazon sales CSV:", error);
    res.status(500).json({
      success: false,
      message: "Amazon売上データの保存に失敗しました",
      error: error?.message,
    });
  }
});

// Amazon売上データ取得
app.get("/amazon/daily-sales/:productId", async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const { startDate, endDate } = req.query;

    // 商品情報を取得
    const productDoc = await db.collection("registered_products").doc(productId).get();
    if (!productDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "商品が見つかりません",
      });
    }

    const productData = productDoc.data();
    const amazonCode = productData?.amazonCode;
    if (!amazonCode) {
      return res.json({
        success: true,
        data: [],
        message: "この商品にはAmazon商品コードが設定されていません",
      });
    }

    let query = db.collection("amazon_daily_sales")
      .where("amazonCode", "==", amazonCode);

    if (startDate) {
      query = query.where("date", ">=", startDate);
    }
    if (endDate) {
      query = query.where("date", "<=", endDate);
    }

    const snapshot = await query.orderBy("date", "asc").get();

    const salesData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({
      success: true,
      data: salesData,
      count: salesData.length,
    });
  } catch (error: any) {
    console.error("Error fetching Amazon daily sales:", error);
    res.status(500).json({
      success: false,
      message: "Amazon売上データの取得に失敗しました",
      error: error?.message,
    });
  }
});

// デバッグ用: amazon_daily_sales全データ取得
app.get("/debug/amazon-daily-sales", async (req: Request, res: Response) => {
  try {
    const snapshot = await db.collection("amazon_daily_sales").limit(20).get();
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json({ success: true, count: data.length, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message });
  }
});

// 既存の amazon_daily_sales を product_sales にバックフィル
app.post("/amazon/backfill-product-sales", async (req: Request, res: Response) => {
  try {
    const { productId, startDate, endDate } = req.body || {};

    let query = db.collection("amazon_daily_sales") as FirebaseFirestore.Query<FirebaseFirestore.DocumentData>;
    if (productId) {
      query = query.where("productId", "==", productId);
    }
    if (startDate) {
      query = query.where("date", ">=", startDate);
    }
    if (endDate) {
      query = query.where("date", "<=", endDate);
    }

    // 範囲クエリを使う場合は orderBy が必要
    query = query.orderBy("date", "asc");

    const snapshot = await query.get();
    if (snapshot.empty) {
      return res.json({ success: true, message: "対象データがありません", migrated: 0 });
    }

    let migrated = 0;
    let batch = db.batch();
    let ops = 0;

    const commitBatch = async () => {
      if (ops > 0) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    };

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const dateStr = data.date;
      if (!dateStr) continue;

      const amazonCode = data.amazonCode || data.productCode || data.productId || productId || "unknown";
      const docId = `amazon_${amazonCode}_${dateStr}`;
      const productSalesRef = db.collection("product_sales").doc(docId);

      batch.set(productSalesRef, {
        productId: data.productId || productId || "",
        productCode: amazonCode,
        mall: "amazon",
        date: dateStr,
        sales: parseFloat(data.salesAmount) || 0,
        quantity: parseInt(data.orderedUnits) || 0,
        updatedAt: Timestamp.now(),
      }, { merge: true });

      migrated++;
      ops++;

      // Firestore batch は最大500件
      if (ops >= 450) {
        await commitBatch();
      }
    }

    await commitBatch();

    res.json({
      success: true,
      message: `${migrated}件をproduct_salesへ移行しました`,
      migrated,
      filter: { productId: productId || null, startDate: startDate || null, endDate: endDate || null },
    });
  } catch (error: any) {
    console.error("Backfill amazon_daily_sales -> product_sales error:", error);
    res.status(500).json({
      success: false,
      message: "バックフィルに失敗しました",
      error: error?.message || "Unknown error",
    });
  }
});

// ==================== End Amazon売上データ手動入稿 ====================

// ==================== 楽天売上データ手動入稿 ====================

// 楽天売上データCSV入稿
app.post("/rakuten/import-sales-csv/:productId", async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const { data } = req.body; // CSVパース済みのデータ配列

    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({
        success: false,
        message: "データが空です",
      });
    }

    // 商品情報を取得
    const productDoc = await db.collection("registered_products").doc(productId).get();
    if (!productDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "商品が見つかりません",
      });
    }

    const productData = productDoc.data();
    // rakutenCodeがなくてもproductIdをキーとして保存可能に
    const rakutenCode = productData?.rakutenCode || productId;

    let savedCount = 0;
    const batch = db.batch();

    for (const row of data) {
      // 日付をパース (YYYY-MM-DD または YYYY/MM/DD 形式を想定)
      const dateStr = row.date?.replace(/\//g, "-");
      if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        continue;
      }

      // 商品管理番号または商品番号をキーに使用
      const itemCode = row.productManagementCode || row.productCode || rakutenCode;
      const docId = `${productId}_${itemCode}_${dateStr}`;
      const docRef = db.collection("rakuten_daily_sales").doc(docId);

      batch.set(docRef, {
        productId,
        rakutenCode,
        itemCode,
        date: dateStr,
        // 商品識別情報
        productManagementCode: row.productManagementCode || "",
        productCode: row.productCode || "",
        // 売上データ
        salesAmount: parseInt(row.salesAmount) || 0,
        salesCount: parseInt(row.salesCount) || 0,
        salesUnits: parseInt(row.salesUnits) || 0,
        // アクセスデータ
        accessUsers: parseInt(row.accessUsers) || 0,
        uniqueUsers: parseInt(row.uniqueUsers) || 0,
        conversionRate: parseFloat(row.conversionRate) || 0,
        averageOrderValue: parseInt(row.averageOrderValue) || 0,
        // 購入データ
        totalPurchases: parseInt(row.totalPurchases) || 0,
        newPurchases: parseInt(row.newPurchases) || 0,
        repeatPurchases: parseInt(row.repeatPurchases) || 0,
        nonPurchaseAccess: parseInt(row.nonPurchaseAccess) || 0,
        // レビューデータ
        reviewCount: parseInt(row.reviewCount) || 0,
        reviewRating: parseFloat(row.reviewRating) || 0,
        totalReviews: parseInt(row.totalReviews) || 0,
        // 行動データ
        stayTime: parseInt(row.stayTime) || 0,
        bounceCount: parseInt(row.bounceCount) || 0,
        exitCount: parseInt(row.exitCount) || 0,
        exitRate: parseFloat(row.exitRate) || 0,
        // お気に入りデータ
        favoriteUsers: parseInt(row.favoriteUsers) || 0,
        totalFavoriteUsers: parseInt(row.totalFavoriteUsers) || 0,
        // 在庫データ
        stockCount: parseInt(row.stockCount) || 0,
        // メタデータ
        importedAt: new Date(),
        source: "manual_csv",
      }, { merge: true });

      savedCount++;
    }

    await batch.commit();

    res.json({
      success: true,
      message: `${savedCount}件の楽天売上データを保存しました`,
      productId,
      rakutenCode,
      savedCount,
    });
  } catch (error: any) {
    console.error("Error importing Rakuten sales CSV:", error);
    res.status(500).json({
      success: false,
      message: "楽天売上データの保存に失敗しました",
      error: error?.message,
    });
  }
});

// 楽天売上データ取得
app.get("/rakuten/daily-sales/:productId", async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const { startDate, endDate } = req.query;

    let query = db.collection("rakuten_daily_sales")
      .where("productId", "==", productId);

    if (startDate) {
      query = query.where("date", ">=", startDate);
    }
    if (endDate) {
      query = query.where("date", "<=", endDate);
    }

    const snapshot = await query.orderBy("date", "asc").get();

    const salesData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({
      success: true,
      data: salesData,
      count: salesData.length,
    });
  } catch (error: any) {
    console.error("Error fetching Rakuten daily sales:", error);
    res.status(500).json({
      success: false,
      message: "楽天売上データの取得に失敗しました",
      error: error?.message,
    });
  }
});

// ==================== End 楽天売上データ手動入稿 ====================

// ==================== Qoo10売上データ手動入稿 ====================

// Qoo10売上CSVインポート
app.post("/qoo10/import-sales-csv/:productId", async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const { data } = req.body;

    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({
        success: false,
        message: "データが空です",
      });
    }

    const productDoc = await db.collection("registered_products").doc(productId).get();
    if (!productDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "商品が見つかりません",
      });
    }

    let savedCount = 0;
    const batch = db.batch();

    for (const row of data) {
      const dateStr = row.date?.replace(/\//g, "-");
      if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        continue;
      }

      const docId = `qoo10_${productId}_${dateStr}`;
      const docRef = db.collection("product_sales").doc(docId);

      batch.set(docRef, {
        productId,
        date: dateStr,
        mall: "qoo10",
        sales: parseInt(row.sales) || 0,
        units: parseInt(row.units) || 0,
        importedAt: new Date(),
        source: "manual_csv",
      }, { merge: true });

      savedCount++;
    }

    await batch.commit();

    res.json({
      success: true,
      message: `${savedCount}件のQoo10売上データを保存しました`,
      productId,
      savedCount,
    });
  } catch (error: any) {
    console.error("Error importing Qoo10 sales CSV:", error);
    res.status(500).json({
      success: false,
      message: "Qoo10売上データの保存に失敗しました",
      error: error?.message,
    });
  }
});

// ==================== End Qoo10売上データ手動入稿 ====================

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/`);
  console.log(`Scrape: GET http://localhost:${PORT}/scrape`);
  console.log(`Write test data: POST http://localhost:${PORT}/write-test-data`);
  console.log(`Get sales data: GET http://localhost:${PORT}/sales-data`);
});
