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

const SYSTEM_PROMPT = `あなたはプロのECデータアナリストです。数値に基づいた厳密な分析を行います。

## 絶対ルール
- **全ての主張に具体的な数値（円額・件数・%）を必ず添えること。** 数値のない考察は禁止。
- **「増加した」「貢献した」等の主張は、必ず比較対象の数値とセットで記述すること。**
  - 良い例: 「楽天の今回マラソン期間売上は¥523,000（前回マラソン¥312,000 → +67.6%）」
  - 悪い例: 「売上が大幅に増加しました」
- **売れていない場合は正直に「売れていない」と書くこと。** 無理にポジティブな解釈をしない。
- データが0円の日が続く場合、それは「安定」ではなく「売上なし」と表現すること。

## セールの定義
* 楽天: 【大】楽天スーパーSALE / 【中】お買い物マラソン、ブラックフライデー等 / 【小】5と0のつく日、ワンダフルデー等
* Amazon: 【大】プライムデー、ブラックフライデー / 【中】プライム感謝祭、新生活SALE等 / 【小】タイムセール祭り等
* Qoo10: 【大】メガ割 / 【小】メガポ、スーパーセール等

## 分析手順

### Step 1: データの実態把握
まずデータを見て以下を算出すること（レポートには「サマリー」として記載）:
- 各モールの売上合計額
- 再生数の合計
- 売上が0の日数 / データがある日数
- 1日平均売上（各モール別）

### Step 2: セール期間の特定と前回比較
イベントフラグからセール期間を特定し、**必ず以下の比較を行うこと**:
- 今回のセール期間中のそのモール売上合計
- 前回の同種セール期間中のそのモール売上合計（データがあれば）
- 差分（金額と%）
- データがない場合は「前回比較データなし」と明記

### Step 3: 通常期（非セール期間）の分析
セール期間を除いた通常期について:
- 全モール合算の1日平均売上
- 再生数が多い日（上位5日）の翌日〜3日後の売上変動を具体的に記載
- 再生数と売上に相関が見られるか、見られないかを正直に判定

### Step 4: SNS再生数と売上の相関判定
- 再生数の7日移動平均を算出し、平均の2倍以上を「バズ日」と定義
- バズ日の当日〜3日後の売上と、バズ日でない同日数の売上を比較
- 差分が有意（+20%以上）なら「相関あり」、そうでなければ「相関は確認できず」と記載

## 出力形式（マークダウン）

### 1. サマリー
3〜5行。各モール売上合計・再生数合計・最も注目すべき事実を数値で。

### 2. 全体分析
- 期間中の全モール合算売上推移（前半/後半の比較等）
- 通常期 vs セール期の1日平均売上比較（数値必須）
- 再生数と全体売上の相関有無（数値根拠付き）

### 3. Amazon分析
- 期間売上合計、1日平均、売上が0の日数
- セール期間がある場合: 今回セール売上 vs 前回同種セール売上（数値比較必須）
- 再生数との相関: バズ日前後のAmazon売上の具体的な数値変動

### 4. 楽天分析
- 期間売上合計、1日平均、売上が0の日数
- セール期間がある場合: 今回セール売上 vs 前回同種セール売上（数値比較必須）
- 再生数との相関: バズ日前後の楽天売上の具体的な数値変動

### 5. Qoo10分析
- 期間売上合計、1日平均、売上が0の日数
- セール期間がある場合: 今回セール売上 vs 前回同種セール売上（数値比較必須）
- 再生数との相関: バズ日前後のQoo10売上の具体的な数値変動

### 6. ファインディングスと提言
- SNSが売上に効いた/効かなかった、の結論を数値根拠で
- 最も売上に貢献したチャネルとタイミング
- 今後のSNS運用への具体的提言（投稿タイミング・頻度）

※データがないモールはスキップ。その他チャネル（自社サイト、Yahoo、店舗等）がある場合は個別に言及。
※前回セールのデータが提供データ内にない場合は「比較データなし」と明記し、推測で補わないこと。`;

export async function POST(req: NextRequest) {
  try {
    const { salesData, prevSalesData, flagsData, productName, startDate, endDate } = await req.json();

    // 環境変数 → Firestoreのsettingsコレクションからフォールバック
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

    const client = new OpenAI({ apiKey });

    // 前期間の算出
    const daysDiff = Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1;
    const prevEnd = new Date(startDate);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - daysDiff + 1);

    const userMessage = `以下のデータを分析してください。

## 対象商品: ${productName}
## 分析期間: ${startDate} 〜 ${endDate}（${daysDiff}日間）
## 前期間: ${prevStart.toISOString().split("T")[0]} 〜 ${prevEnd.toISOString().split("T")[0]}（同${daysDiff}日間）

## 【当期間】売上・再生数データ（日別。viewsが再生数、それ以外のキーがチャネル別売上額）
\`\`\`json
${JSON.stringify(salesData, null, 2)}
\`\`\`

## 【前期間】売上・再生数データ（前回セール比較用）
\`\`\`json
${JSON.stringify(prevSalesData, null, 2)}
\`\`\`

## イベントフラグ（セール期間等。当期間+前期間を含む）
\`\`\`json
${JSON.stringify(flagsData, null, 2)}
\`\`\`

【重要】前期間のデータも提供しています。セール（お買い物マラソン等）が当期間と前期間の両方にある場合は、必ず今回 vs 前回の売上を数値で比較してください。`;

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
