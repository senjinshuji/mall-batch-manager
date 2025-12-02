import express, { Request, Response } from "express";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { chromium } from "playwright";

// Firebase Admin初期化
// Cloud Run上ではADC（Application Default Credentials）を使用
if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();
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

app.use(express.json());

// ヘルスチェック用エンドポイント
app.get("/", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    message: "Mall Batch Manager Backend is running",
    timestamp: new Date().toISOString(),
  });
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

// バッチ処理トリガー（将来のスクレイピング用）
app.post("/trigger-batch", async (req: Request, res: Response) => {
  try {
    console.log("Batch process triggered at:", new Date().toISOString());

    // Phase 3で実際のスクレイピング処理を実装予定
    // 現在はダミーデータを書き込む
    const batchResult = {
      triggeredAt: Timestamp.now(),
      status: "completed",
      message: "Batch process placeholder - actual scraping will be implemented in Phase 3",
    };

    await db.collection("batch_logs").add(batchResult);

    res.json({
      success: true,
      message: "Batch process triggered successfully",
      result: batchResult,
    });
  } catch (error) {
    console.error("Error in batch process:", error);
    res.status(500).json({
      success: false,
      message: "Batch process failed",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/`);
  console.log(`Scrape: GET http://localhost:${PORT}/scrape`);
  console.log(`Write test data: POST http://localhost:${PORT}/write-test-data`);
  console.log(`Get sales data: GET http://localhost:${PORT}/sales-data`);
});
