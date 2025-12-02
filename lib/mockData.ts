export type DailySales = {
  date: string; // "YYYY-MM-DD"
  amazon: number;
  rakuten: number;
  qoo10: number;
  // モール内広告費
  amazonAd: number;
  rakutenAd: number;
  qoo10Ad: number;
  // 外部広告費
  xAd: number;
  tiktokAd: number;
};

// 指定した範囲のランダムな整数を生成
function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 日付をYYYY-MM-DD形式にフォーマット
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// シード値を使用した疑似乱数生成（同じ日付で同じ値を返す）
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// 日付文字列からシード値を生成
function dateToSeed(dateStr: string): number {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    const char = dateStr.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash;
}

// シード値を使用したランダム整数生成
function seededRandomInt(seed: number, min: number, max: number): number {
  return Math.floor(seededRandom(seed) * (max - min + 1)) + min;
}

// モック売上データを生成
export function getMockSalesData(
  startDate: string,
  endDate: string
): DailySales[] {
  const data: DailySales[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  // 日付の妥当性チェック
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return [];
  }

  // 開始日から終了日まで1日ずつ処理
  const current = new Date(start);
  while (current <= end) {
    const dateStr = formatDate(current);
    const baseSeed = dateToSeed(dateStr);

    // 各モールの売上を生成（シード値を使用して一貫性を保つ）
    // Amazon: 50,000〜300,000円
    // 楽天: 30,000〜250,000円
    // Qoo10: 10,000〜150,000円
    const amazonSales = seededRandomInt(baseSeed + 1, 50000, 300000);
    const rakutenSales = seededRandomInt(baseSeed + 2, 30000, 250000);
    const qoo10Sales = seededRandomInt(baseSeed + 3, 10000, 150000);

    // 各モールの広告費を生成（売上の5〜15%程度）
    const amazonAd = seededRandomInt(baseSeed + 4, Math.floor(amazonSales * 0.05), Math.floor(amazonSales * 0.15));
    const rakutenAd = seededRandomInt(baseSeed + 5, Math.floor(rakutenSales * 0.05), Math.floor(rakutenSales * 0.15));
    const qoo10Ad = seededRandomInt(baseSeed + 6, Math.floor(qoo10Sales * 0.05), Math.floor(qoo10Sales * 0.15));

    // 外部広告費を生成（5,000〜30,000円程度）
    const xAd = seededRandomInt(baseSeed + 7, 5000, 30000);
    const tiktokAd = seededRandomInt(baseSeed + 8, 5000, 25000);

    data.push({
      date: dateStr,
      amazon: amazonSales,
      rakuten: rakutenSales,
      qoo10: qoo10Sales,
      amazonAd,
      rakutenAd,
      qoo10Ad,
      xAd,
      tiktokAd,
    });

    // 次の日へ
    current.setDate(current.getDate() + 1);
  }

  return data;
}

// デフォルトの期間（直近30日）を取得
export function getDefaultDateRange(): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 29); // 30日間

  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
  };
}

// 合計売上を計算
export function calculateTotalSales(
  data: DailySales[],
  selectedMalls: { amazon: boolean; rakuten: boolean; qoo10: boolean }
): number {
  return data.reduce((total, day) => {
    let dayTotal = 0;
    if (selectedMalls.amazon) dayTotal += day.amazon;
    if (selectedMalls.rakuten) dayTotal += day.rakuten;
    if (selectedMalls.qoo10) dayTotal += day.qoo10;
    return total + dayTotal;
  }, 0);
}

// 合計広告費を計算
export function calculateTotalAdCost(
  data: DailySales[],
  selectedMalls: { amazon: boolean; rakuten: boolean; qoo10: boolean }
): number {
  return data.reduce((total, day) => {
    let dayTotal = 0;
    if (selectedMalls.amazon) dayTotal += day.amazonAd;
    if (selectedMalls.rakuten) dayTotal += day.rakutenAd;
    if (selectedMalls.qoo10) dayTotal += day.qoo10Ad;
    return total + dayTotal;
  }, 0);
}

// 外部広告費合計を計算
export function calculateTotalExternalAdCost(
  data: DailySales[],
  selectedPlatforms: { x: boolean; tiktok: boolean }
): number {
  return data.reduce((total, day) => {
    let dayTotal = 0;
    if (selectedPlatforms.x) dayTotal += day.xAd;
    if (selectedPlatforms.tiktok) dayTotal += day.tiktokAd;
    return total + dayTotal;
  }, 0);
}

// 金額をフォーマット（カンマ区切り）
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(amount);
}

// モール内商品（アカウントから取得される商品リスト）
export type MallProduct = {
  code: string;
  name: string;
};

// 登録商品
export type RegisteredProduct = {
  id: string;
  productName: string;
  amazonCode: string;
  rakutenCode: string;
  qoo10Code: string;
};

// 各モールのモック商品リスト（アカウント内の商品）
export const mockAmazonProducts: MallProduct[] = [
  { code: "AMZ-001", name: "【Amazon】オーガニックシャンプー 500ml" },
  { code: "AMZ-002", name: "【Amazon】ヘアトリートメント 300ml" },
  { code: "AMZ-003", name: "【Amazon】ボディソープ 600ml" },
  { code: "AMZ-004", name: "【Amazon】ハンドクリーム 50g" },
  { code: "AMZ-005", name: "【Amazon】フェイスウォッシュ 150ml" },
  { code: "AMZ-006", name: "【Amazon】リップバーム 10g" },
  { code: "AMZ-007", name: "【Amazon】ヘアオイル 100ml" },
  { code: "AMZ-008", name: "【Amazon】ボディローション 200ml" },
];

export const mockRakutenProducts: MallProduct[] = [
  { code: "RKT-001", name: "オーガニックシャンプー【楽天限定】500ml" },
  { code: "RKT-002", name: "ヘアトリートメント【楽天限定】300ml" },
  { code: "RKT-003", name: "ボディソープ 詰替用 1200ml" },
  { code: "RKT-004", name: "ハンドクリーム ギフトセット" },
  { code: "RKT-005", name: "フェイスウォッシュ 泡タイプ 150ml" },
  { code: "RKT-006", name: "リップバーム 3本セット" },
  { code: "RKT-007", name: "ヘアオイル 大容量 200ml" },
];

export const mockQoo10Products: MallProduct[] = [
  { code: "Q10-001", name: "シャンプー&トリートメントセット" },
  { code: "Q10-002", name: "ボディケア3点セット" },
  { code: "Q10-003", name: "ハンドクリーム ミニ 30g" },
  { code: "Q10-004", name: "フェイスウォッシュ 150ml" },
  { code: "Q10-005", name: "リップバーム セット" },
  { code: "Q10-006", name: "ヘアオイル 50ml" },
];

// 登録済み商品のモックデータ
export const mockRegisteredProducts: RegisteredProduct[] = [
  {
    id: "prod-001",
    productName: "オーガニックシャンプー",
    amazonCode: "AMZ-001",
    rakutenCode: "RKT-001",
    qoo10Code: "Q10-001",
  },
  {
    id: "prod-002",
    productName: "ヘアトリートメント",
    amazonCode: "AMZ-002",
    rakutenCode: "RKT-002",
    qoo10Code: "",
  },
  {
    id: "prod-003",
    productName: "ボディソープ",
    amazonCode: "AMZ-003",
    rakutenCode: "RKT-003",
    qoo10Code: "Q10-002",
  },
];
