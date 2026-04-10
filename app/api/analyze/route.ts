import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC1yeHPptvV1t-3eNquE-_ElABNQC73lxc",
  projectId: "mall-batch-manager",
};
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);

// =====================================================================
// 事前計算ロジック - 全ての数値はここで計算する。GPTには計算済みの事実のみ渡す
// =====================================================================

type DailyData = { date: string; views?: number; [channel: string]: number | string | undefined };
type Flag = { name: string; date: string; endDate?: string; mall?: string; scope?: string; description?: string };

const formatYen = (n: number) => `¥${n.toLocaleString()}`;
const formatNum = (n: number) => n.toLocaleString();

function getChannelKeys(data: DailyData[]): string[] {
  const keys = new Set<string>();
  for (const d of data) {
    for (const k of Object.keys(d)) {
      if (k !== "date" && k !== "views") keys.add(k);
    }
  }
  return Array.from(keys);
}

function getDayTotalSales(d: DailyData, channels: string[]): number {
  return channels.reduce((sum, ch) => sum + ((d[ch] as number) || 0), 0);
}

function computeChannelStats(data: DailyData[], channels: string[]) {
  const stats: Record<string, { total: number; daysWithSales: number; avgPerDay: number; zerodays: number }> = {};
  for (const ch of channels) {
    const total = data.reduce((s, d) => s + ((d[ch] as number) || 0), 0);
    const daysWithSales = data.filter(d => ((d[ch] as number) || 0) > 0).length;
    stats[ch] = {
      total,
      daysWithSales,
      avgPerDay: data.length > 0 ? Math.round(total / data.length) : 0,
      zerodays: data.length - daysWithSales,
    };
  }
  return stats;
}

function computeViewStats(data: DailyData[]) {
  const totalViews = data.reduce((s, d) => s + (d.views || 0), 0);
  const daysWithViews = data.filter(d => (d.views || 0) > 0).length;
  return {
    totalViews,
    daysWithViews,
    avgPerDay: data.length > 0 ? Math.round(totalViews / data.length) : 0,
  };
}

function getTopSalesDays(data: DailyData[], channels: string[], n: number) {
  return [...data]
    .map(d => ({
      date: d.date,
      total: getDayTotalSales(d, channels),
      views: d.views || 0,
      channels: Object.fromEntries(channels.map(ch => [ch, (d[ch] as number) || 0])),
    }))
    .filter(d => d.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, n);
}

function getTopViewDays(data: DailyData[], channels: string[], n: number) {
  return [...data]
    .map(d => ({
      date: d.date,
      views: d.views || 0,
      total: getDayTotalSales(d, channels),
      channels: Object.fromEntries(channels.map(ch => [ch, (d[ch] as number) || 0])),
    }))
    .filter(d => d.views > 0)
    .sort((a, b) => b.views - a.views)
    .slice(0, n);
}

function getMovingAvgSpikeDays(data: DailyData[], windowDays: number = 7, multiplier: number = 2) {
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const spikes: { date: string; views: number; movingAvg: number; ratio: number }[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const views = sorted[i].views || 0;
    if (views === 0) continue;
    const start = Math.max(0, i - windowDays);
    const window = sorted.slice(start, i);
    if (window.length < 3) continue;
    const avg = window.reduce((s, d) => s + (d.views || 0), 0) / window.length;
    if (avg > 0 && views >= avg * multiplier) {
      spikes.push({ date: sorted[i].date, views, movingAvg: Math.round(avg), ratio: Math.round((views / avg) * 10) / 10 });
    }
  }
  return spikes;
}

// セール期間中のデータを抽出
function getDataInPeriod(data: DailyData[], from: string, to: string) {
  return data.filter(d => d.date >= from && d.date <= to);
}

// セール期間の売上を集計
function computeSalePeriodSales(data: DailyData[], channels: string[], from: string, to: string) {
  const inPeriod = getDataInPeriod(data, from, to);
  return Object.fromEntries(channels.map(ch => [ch, inPeriod.reduce((s, d) => s + ((d[ch] as number) || 0), 0)]));
}

// 当期間のセールに対して、過去90日のフラグから同名セールを検索
function findPreviousSale(currentSale: Flag, allFlags: Flag[]) {
  // 当期間のセールより前で、同じnameのフラグを探す
  const candidates = allFlags
    .filter(f => f.name === currentSale.name && f.date < currentSale.date)
    .sort((a, b) => b.date.localeCompare(a.date));
  return candidates[0] || null;
}

// セール期間の前後 N 日の売上から、SNS効果を計算
function computeFactsForSale(allData: DailyData[], channels: string[], sale: Flag) {
  const start = sale.date;
  const end = sale.endDate || sale.date;
  const inPeriod = getDataInPeriod(allData, start, end);
  const channelTotals = computeSalePeriodSales(allData, channels, start, end);
  const totalSales = Object.values(channelTotals).reduce((s, v) => s + v, 0);
  const viewsTotal = inPeriod.reduce((s, d) => s + (d.views || 0), 0);
  return { start, end, days: inPeriod.length, channelTotals, totalSales, viewsTotal };
}

// 商品別フラグの影響を計算（フラグ前 N 日 vs フラグ後 N 日の売上比較）
function computeProductFlagImpact(allData: DailyData[], channels: string[], flag: Flag, windowDays: number = 7) {
  const flagStart = new Date(flag.date);
  const flagEnd = new Date(flag.endDate || flag.date);

  // フラグ前 windowDays日
  const beforeStart = new Date(flagStart);
  beforeStart.setDate(beforeStart.getDate() - windowDays);
  const beforeEnd = new Date(flagStart);
  beforeEnd.setDate(beforeEnd.getDate() - 1);

  // フラグ期間（含む）
  const duringStart = flagStart;
  const duringEnd = flagEnd;

  // フラグ後 windowDays日
  const afterStart = new Date(flagEnd);
  afterStart.setDate(afterStart.getDate() + 1);
  const afterEnd = new Date(flagEnd);
  afterEnd.setDate(afterEnd.getDate() + windowDays);

  const toStr = (d: Date) => d.toISOString().split("T")[0];

  const sumInRange = (from: string, to: string) => {
    const inRange = allData.filter(d => d.date >= from && d.date <= to);
    const total = inRange.reduce((s, d) => s + getDayTotalSales(d, channels), 0);
    return { total, days: inRange.length, avgPerDay: inRange.length > 0 ? Math.round(total / inRange.length) : 0 };
  };

  const before = sumInRange(toStr(beforeStart), toStr(beforeEnd));
  const during = sumInRange(toStr(duringStart), toStr(duringEnd));
  const after = sumInRange(toStr(afterStart), toStr(afterEnd));

  return { before, during, after };
}

// 通常期 vs セール期の比較
function computePeriodComparison(data: DailyData[], channels: string[], saleDateRanges: { start: string; end: string }[]) {
  const isInSale = (date: string) => saleDateRanges.some(r => date >= r.start && date <= r.end);
  const saleData = data.filter(d => isInSale(d.date));
  const normalData = data.filter(d => !isInSale(d.date));

  const saleTotal = saleData.reduce((s, d) => s + getDayTotalSales(d, channels), 0);
  const normalTotal = normalData.reduce((s, d) => s + getDayTotalSales(d, channels), 0);

  return {
    saleDays: saleData.length,
    saleTotal,
    saleAvgPerDay: saleData.length > 0 ? Math.round(saleTotal / saleData.length) : 0,
    normalDays: normalData.length,
    normalTotal,
    normalAvgPerDay: normalData.length > 0 ? Math.round(normalTotal / normalData.length) : 0,
  };
}

// =====================================================================
// 全ての事実を計算してテキスト化
// =====================================================================

function computeAllFacts(currentDailyData: DailyData[], historicalDailyData: DailyData[], flags: Flag[], currentStart: string, currentEnd: string) {
  const channels = getChannelKeys(currentDailyData);
  const allData = [...historicalDailyData, ...currentDailyData];

  // 1. 当期間の基本統計
  const currentChannelStats = computeChannelStats(currentDailyData, channels);
  const currentViewStats = computeViewStats(currentDailyData);

  // 2. 売上トップ5日と再生数トップ5日
  const topSalesDays = getTopSalesDays(currentDailyData, channels, 5);
  const topViewDays = getTopViewDays(currentDailyData, channels, 5);
  const spikeDays = getMovingAvgSpikeDays(currentDailyData);

  // 3. 注目日（和集合）
  const attentionDates = new Set([
    ...topSalesDays.map(d => d.date),
    ...topViewDays.map(d => d.date),
    ...spikeDays.map(d => d.date),
  ]);

  // 4. 各注目日の詳細（前後3日の売上トレンドも含む）
  const sortedData = [...currentDailyData].sort((a, b) => a.date.localeCompare(b.date));
  const dateIndexMap = new Map(sortedData.map((d, i) => [d.date, i]));
  const attentionDayDetails = Array.from(attentionDates).sort().map(date => {
    const idx = dateIndexMap.get(date) ?? -1;
    const day = sortedData[idx];
    if (!day) return null;
    const prev3 = sortedData.slice(Math.max(0, idx - 3), idx).map(d => ({ date: d.date, total: getDayTotalSales(d, channels), views: d.views || 0 }));
    const next3 = sortedData.slice(idx + 1, idx + 4).map(d => ({ date: d.date, total: getDayTotalSales(d, channels), views: d.views || 0 }));
    return {
      date,
      views: day.views || 0,
      totalSales: getDayTotalSales(day, channels),
      channels: Object.fromEntries(channels.map(ch => [ch, (day[ch] as number) || 0])),
      prev3DaysAvgSales: prev3.length > 0 ? Math.round(prev3.reduce((s, d) => s + d.total, 0) / prev3.length) : 0,
      next3DaysAvgSales: next3.length > 0 ? Math.round(next3.reduce((s, d) => s + d.total, 0) / next3.length) : 0,
    };
  }).filter((d): d is NonNullable<typeof d> => d !== null);

  // データがあるチャネル（売上が1円以上ある）
  const channelsWithData = channels.filter(ch => (currentChannelStats[ch]?.total || 0) > 0);

  // モール名 → チャネルキーのマッピング
  const mallToChannel: Record<string, string> = {
    "Amazon": "Amazon",
    "楽天": "楽天",
    "Qoo10": "Qoo10",
    "Yahoo": "Yahoo",
  };

  // 5. 当期間のグローバルセール（モール共通）と前回セール比較
  // 該当モールのデータがある場合のみ
  const currentGlobalSales = flags.filter(f => {
    if ((f.scope || "global") !== "global") return false;
    if (!(f.date <= currentEnd && (f.endDate || f.date) >= currentStart)) return false;
    // モール指定がある場合、そのモールのデータがあるかチェック
    if (f.mall) {
      const channelKey = mallToChannel[f.mall];
      if (channelKey && !channelsWithData.includes(channelKey)) return false;
    }
    return true;
  });
  const saleComparisons = currentGlobalSales.map(sale => {
    const current = computeFactsForSale(allData, channels, sale);
    const prev = findPreviousSale(sale, flags);
    const previous = prev ? computeFactsForSale(allData, channels, prev) : null;
    return { saleName: sale.name, mall: sale.mall || "", current, previous };
  });

  // 6. 当期間の商品別フラグ（売上への影響を前後比較）
  const currentProductFlags = flags.filter(f =>
    f.scope === "product" &&
    f.date <= currentEnd && (f.endDate || f.date) >= currentStart
  );
  const productFlagImpacts = currentProductFlags.map(flag => ({
    name: flag.name,
    description: flag.description || "",
    date: flag.date,
    endDate: flag.endDate || flag.date,
    impact: computeProductFlagImpact(allData, channels, flag, 7),
  }));

  // 7. 通常期 vs セール期
  const saleRanges = currentGlobalSales.map(s => ({ start: s.date, end: s.endDate || s.date }));
  const periodComparison = computePeriodComparison(currentDailyData, channels, saleRanges);

  return {
    channels,
    channelsWithData,
    currentChannelStats,
    currentViewStats,
    topSalesDays,
    topViewDays,
    spikeDays,
    attentionDayDetails,
    saleComparisons,
    productFlagImpacts,
    periodComparison,
  };
}

// 計算結果をマークダウンの「事実シート」として整形
function factsToMarkdown(facts: ReturnType<typeof computeAllFacts>, productName: string, currentStart: string, currentEnd: string) {
  const lines: string[] = [];
  lines.push(`# 計算済みファクトシート`);
  lines.push(``);
  lines.push(`商品: ${productName}`);
  lines.push(`期間: ${currentStart} 〜 ${currentEnd}`);
  lines.push(``);

  // 売上データがあるチャネル（重要）
  lines.push(`## ⚠️ 重要: この商品で売上データがあるチャネル`);
  if (facts.channelsWithData.length === 0) {
    lines.push(`- **売上データなし**`);
  } else {
    lines.push(`- **${facts.channelsWithData.join(" / ")}**`);
    lines.push(`- 上記以外のチャネル（例: 楽天、Qoo10、Yahoo、自社サイト等）には**売上データが一切ありません**。レポートでは絶対に言及しないこと。`);
  }
  lines.push(``);

  // チャネル別統計
  lines.push(`## 1. チャネル別売上統計（当期間）`);
  for (const [ch, s] of Object.entries(facts.currentChannelStats)) {
    if (s.total === 0) continue; // 0のチャネルは表示しない
    lines.push(`- **${ch}**: 合計 ${formatYen(s.total)} / 1日平均 ${formatYen(s.avgPerDay)} / 売上のあった日数 ${s.daysWithSales}日 / 売上0の日数 ${s.zerodays}日`);
  }
  lines.push(``);

  // 再生数統計
  lines.push(`## 2. 再生数統計（当期間）`);
  lines.push(`- 合計: ${formatNum(facts.currentViewStats.totalViews)}回`);
  lines.push(`- 1日平均: ${formatNum(facts.currentViewStats.avgPerDay)}回`);
  lines.push(`- 再生数のあった日数: ${facts.currentViewStats.daysWithViews}日`);
  lines.push(``);

  // 売上トップ5日
  lines.push(`## 3. 売上トップ5日（当期間）`);
  if (facts.topSalesDays.length === 0) {
    lines.push(`- データなし`);
  } else {
    facts.topSalesDays.forEach((d, i) => {
      const chDetail = Object.entries(d.channels).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${formatYen(v)}`).join(", ");
      lines.push(`${i + 1}. **${d.date}**: 売上合計 ${formatYen(d.total)} (${chDetail}) / 再生数 ${formatNum(d.views)}回`);
    });
  }
  lines.push(``);

  // 再生数トップ5日
  lines.push(`## 4. 再生数トップ5日（当期間）`);
  if (facts.topViewDays.length === 0) {
    lines.push(`- データなし`);
  } else {
    facts.topViewDays.forEach((d, i) => {
      const chDetail = Object.entries(d.channels).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${formatYen(v)}`).join(", ") || "売上なし";
      lines.push(`${i + 1}. **${d.date}**: 再生数 ${formatNum(d.views)}回 / 売上合計 ${formatYen(d.total)} (${chDetail})`);
    });
  }
  lines.push(``);

  // 移動平均バズ日
  lines.push(`## 5. 移動平均バズ日（直近7日平均の2倍以上）`);
  if (facts.spikeDays.length === 0) {
    lines.push(`- 該当なし`);
  } else {
    facts.spikeDays.forEach(d => {
      lines.push(`- **${d.date}**: 再生数 ${formatNum(d.views)}回（直近7日平均 ${formatNum(d.movingAvg)}回 → ${d.ratio}倍）`);
    });
  }
  lines.push(``);

  // 注目日の前後トレンド
  lines.push(`## 6. 注目日の詳細（売上トップ5 ∪ 再生数トップ5 ∪ 移動平均バズ日の和集合）`);
  if (facts.attentionDayDetails.length === 0) {
    lines.push(`- データなし`);
  } else {
    facts.attentionDayDetails.forEach(d => {
      lines.push(`- **${d.date}**: 売上 ${formatYen(d.totalSales)} / 再生数 ${formatNum(d.views)}回 / 前3日平均売上 ${formatYen(d.prev3DaysAvgSales)} / 翌3日平均売上 ${formatYen(d.next3DaysAvgSales)}`);
    });
  }
  lines.push(``);

  // セール比較（売上データがあるチャネルのセールのみ）
  lines.push(`## 7. セール期間と前回比較`);
  if (facts.saleComparisons.length === 0) {
    lines.push(`- 売上データのあるチャネルのセールは当期間に該当なし`);
  } else {
    facts.saleComparisons.forEach(s => {
      lines.push(`### ${s.saleName}${s.mall ? `（${s.mall}）` : ""}`);
      lines.push(`- **今回**: ${s.current.start} 〜 ${s.current.end}（${s.current.days}日間）`);
      // 売上があるチャネルのみ表示
      const currentChannelsWithSales = Object.entries(s.current.channelTotals).filter(([, v]) => (v as number) > 0);
      if (currentChannelsWithSales.length === 0) {
        lines.push(`  - 売上データなし`);
      } else {
        const channelTotal = currentChannelsWithSales.reduce((sum, [, v]) => sum + (v as number), 0);
        lines.push(`  - 売上合計: ${formatYen(channelTotal)}`);
        currentChannelsWithSales.forEach(([ch, v]) => {
          lines.push(`  - ${ch}: ${formatYen(v as number)}`);
        });
      }
      lines.push(`  - 期間内再生数合計: ${formatNum(s.current.viewsTotal)}回`);
      if (s.previous) {
        const prevChannelsWithSales = Object.entries(s.previous.channelTotals).filter(([, v]) => (v as number) > 0);
        lines.push(`- **前回**: ${s.previous.start} 〜 ${s.previous.end}（${s.previous.days}日間）`);
        if (prevChannelsWithSales.length === 0) {
          lines.push(`  - 売上データなし`);
        } else {
          const prevTotal = prevChannelsWithSales.reduce((sum, [, v]) => sum + (v as number), 0);
          lines.push(`  - 売上合計: ${formatYen(prevTotal)}`);
          prevChannelsWithSales.forEach(([ch, v]) => {
            lines.push(`  - ${ch}: ${formatYen(v as number)}`);
          });
          const currentTotal = Object.entries(s.current.channelTotals).reduce((sum, [, v]) => sum + (v as number), 0);
          const diff = currentTotal - prevTotal;
          const pct = prevTotal > 0 ? Math.round((diff / prevTotal) * 1000) / 10 : 0;
          lines.push(`- **差分**: ${diff >= 0 ? "+" : ""}${formatYen(diff)}（${diff >= 0 ? "+" : ""}${pct}%）`);
        }
      } else {
        lines.push(`- **前回**: 過去90日内に該当セールなし`);
      }
    });
  }
  lines.push(``);

  // 商品別フラグの影響
  lines.push(`## 8. 商品別フラグと売上影響（フラグ前7日 vs 期間中 vs フラグ後7日）`);
  if (facts.productFlagImpacts.length === 0) {
    lines.push(`- 当期間に商品別フラグなし`);
  } else {
    facts.productFlagImpacts.forEach(f => {
      lines.push(`### ${f.name}（${f.date}${f.endDate !== f.date ? ` 〜 ${f.endDate}` : ""}）`);
      if (f.description) lines.push(`- 詳細: ${f.description}`);
      lines.push(`- フラグ前7日: 1日平均 ${formatYen(f.impact.before.avgPerDay)} / 合計 ${formatYen(f.impact.before.total)}`);
      lines.push(`- フラグ期間中: 1日平均 ${formatYen(f.impact.during.avgPerDay)} / 合計 ${formatYen(f.impact.during.total)}`);
      lines.push(`- フラグ後7日: 1日平均 ${formatYen(f.impact.after.avgPerDay)} / 合計 ${formatYen(f.impact.after.total)}`);
      // 影響度の判定（前7日と期間中+後7日の平均比）
      const beforeAvg = f.impact.before.avgPerDay;
      const afterAvg = Math.round((f.impact.during.total + f.impact.after.total) / Math.max(f.impact.during.days + f.impact.after.days, 1));
      if (beforeAvg > 0) {
        const lift = Math.round(((afterAvg - beforeAvg) / beforeAvg) * 1000) / 10;
        lines.push(`- フラグ前後の比率: ${lift >= 0 ? "+" : ""}${lift}%（フラグ後7日+期間中の1日平均 vs フラグ前7日の1日平均）`);
      }
    });
  }
  lines.push(``);

  // 通常期 vs セール期
  lines.push(`## 9. 通常期 vs セール期の比較`);
  lines.push(`- セール期間: ${facts.periodComparison.saleDays}日 / 1日平均 ${formatYen(facts.periodComparison.saleAvgPerDay)} / 合計 ${formatYen(facts.periodComparison.saleTotal)}`);
  lines.push(`- 通常期間: ${facts.periodComparison.normalDays}日 / 1日平均 ${formatYen(facts.periodComparison.normalAvgPerDay)} / 合計 ${formatYen(facts.periodComparison.normalTotal)}`);

  return lines.join("\n");
}

// =====================================================================
// プロンプト
// =====================================================================

const SYSTEM_PROMPT = `あなたはプロのECデータアナリストです。

## 重要な制約
- **数値は計算済みファクトシートに記載されているものだけを使うこと。** ファクトシートに無い数字を勝手に計算したり推測したりしてはいけない。
- ファクトシートの数値はサーバー側で正確に計算されています。これを唯一の真実として扱ってください。
- レポート内の全ての数値は、ファクトシートからそのまま引用すること。
- **🚨 絶対禁止: ファクトシート冒頭の「売上データがあるチャネル」セクションに記載されていないチャネル（楽天、Qoo10、Yahoo、自社サイト等）について、レポートで一切言及してはいけません。** たとえセール情報（楽天マラソン等）が他のセクションに見えても、そのモールの売上データがなければ「楽天マラソンの影響」のような考察は絶対に書かないこと。データがないのに推測で語ることは厳禁です。
- **モール別分析は、データがあるモールだけ実施すること。** Amazonしかデータがなければ、Amazon分析だけを書く。「楽天分析」「Qoo10分析」のセクションは一切作らないこと。

## あなたの仕事
ファクトシートを読み、以下のレポートを書いてください:

1. **サマリー**（3〜5行）: 期間全体の概況
2. **注目日の分析**: ファクトシートの「注目日」セクションから、特に重要な日を取り上げ、SNSが売上に効いた可能性を考察
3. **モール別分析（売上データがあるチャネルのみ）**: ファクトシート冒頭の「売上データがあるチャネル」に記載されているモールだけ個別に分析する。データがないモールのセクションは絶対に作らない。
4. **商品別フラグの影響分析**（該当する場合のみ）: 商品別フラグがある場合、フラグ前後の売上変化から「売上に影響があったか」を判定。影響が見られないフラグ（フラグ前後で売上に有意な変化なし）はレポートから除外して構わない。**売上に明確な影響が見られた場合のみ言及すること。**
5. **ファインディングスと提言**: SNSが売上に効いた/効かなかったの結論、最も売上に貢献した日とその理由、今後のSNS運用への提言

## 注意事項
- 売上トップ5日の中に再生数が高い日があれば、SNSが売上に貢献した強い証拠として言及すること
- 売上0の日が多い場合は「売上なし」と正直に書くこと
- 前回セール比較は必ずファクトシートの「### XXX」セクションから日付付きで引用すること
- 推測や予想を語るときは「〜と考えられる」「〜の可能性がある」と明示
- 商品別フラグの影響を判定する際の目安: フラグ前後の比率が±20%以上変化していれば「影響あり」と評価する。それ未満なら「影響は見られない」として言及をスキップしてよい。`;

// =====================================================================
// API ハンドラ
// =====================================================================

export async function POST(req: NextRequest) {
  try {
    const { currentPeriod, historicalData, flagsData, productName } = await req.json();

    let apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      try {
        const settingsDoc = await getDoc(doc(db, "settings", "openai"));
        apiKey = settingsDoc.data()?.apiKey;
      } catch (e) {
        console.error("Firestore settings取得エラー:", e);
      }
    }
    if (!apiKey) {
      return NextResponse.json({ error: "OpenAI APIキーが設定されていません。" }, { status: 500 });
    }

    // ===== サーバー側で全ての数値を事前計算 =====
    const facts = computeAllFacts(
      currentPeriod.dailyData,
      historicalData.dailyData,
      flagsData,
      currentPeriod.startDate,
      currentPeriod.endDate
    );
    const factsMarkdown = factsToMarkdown(facts, productName, currentPeriod.startDate, currentPeriod.endDate);

    const client = new OpenAI({ apiKey });

    const userMessage = `以下の計算済みファクトシートを元に、分析レポートを作成してください。

${factsMarkdown}

---

【厳守】上記のファクトシートに記載された数値だけを使ってレポートを書いてください。
ファクトシートに無い数字を計算・推測してはいけません。`;

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 4096,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
    });

    const responseText = response.choices[0]?.message?.content || "分析結果を取得できませんでした。";

    return NextResponse.json({ analysis: responseText });
  } catch (error: unknown) {
    console.error("AI分析エラー:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
