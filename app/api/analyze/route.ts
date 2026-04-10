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
  - 良い例: 「楽天の今回マラソン期間（4/4〜4/10）売上は¥523,000（前回マラソン3/4〜3/10 ¥312,000 → +67.6%）」
  - 悪い例: 「売上が大幅に増加しました」
- **売れていない場合は正直に「売れていない」と書くこと。** 無理にポジティブな解釈をしない。
- データが0円の日が続く場合、それは「安定」ではなく「売上なし」と表現すること。
- セール比較では**必ず前回セールの開催日付**（例: 「前回マラソン 3/4〜3/10」）を明記すること。

## セールの定義
* 楽天: 【大】楽天スーパーSALE / 【中】お買い物マラソン、ブラックフライデー等 / 【小】5と0のつく日、ワンダフルデー等
* Amazon: 【大】プライムデー、ブラックフライデー / 【中】プライム感謝祭、新生活SALE等 / 【小】タイムセール祭り等
* Qoo10: 【大】メガ割 / 【小】メガポ、スーパーセール等

---

## 分析手順（必ずこの順で実行）

### Step 1: データの実態把握
当期間データを見て以下を算出:
- 各モールの売上合計額・1日平均
- 再生数の合計・1日平均
- 売上が0の日数 / データがある日数

### Step 2: 注目日の特定（重要）
以下の3つの方法で**「注目日」**を特定し、和集合を分析対象とする:

**方法1: 売上トップ5日**
- 当期間で全モール合計売上が最も高い日トップ5を抽出
- それぞれの日付・売上額・その日の再生数を記載

**方法2: 再生数トップ5日**
- 当期間で再生数が最も高い日トップ5を抽出
- それぞれの日付・再生数・その日の全モール売上を記載

**方法3: 移動平均バズ日**
- 各日について直近7日間の平均再生数を算出
- 平均の2倍以上の日を抽出

**和集合をすべて「注目日」として、各日について分析:**
- 当日の再生数と各モール売上の数値
- 前1〜3日と当日〜+3日の売上の動き（数値で）
- SNSが売上に効いた可能性の評価

**重要**: 売上トップ5の日に再生数が高ければ、それは「SNSが直接売上に貢献した可能性」を示唆する強い証拠。必ず言及すること。

### Step 3: セール期間の特定と前回比較
**当期間のフラグからセールを抽出**:
- 当期間に重なる全てのセール期間を特定
- 各セールについて以下を算出:
  - 当回セール期間の該当モール売上合計（X月Y日〜X月Y日）
  - **historicalDataから同名セールの前回出現を検索**
  - 前回セール期間の該当モール売上合計（前回 X月Y日〜X月Y日）
  - 差分（金額・%）
- 過去90日内に該当セールがなければ「過去90日内に該当セールなし」と明記
- **必ず日付付きで記載**: 「前回 3/4〜3/10 のお買い物マラソン: ¥XXX → 今回 4/4〜4/10: ¥YYY（+ZZ%）」

### Step 4: 通常期 vs セール期の比較
- セール期間を除外した通常期の1日平均売上
- セール期間中の1日平均売上
- 比率を算出

---

## 出力形式（マークダウン）

### 1. サマリー
3〜5行。各モール売上合計・再生数合計・注目すべき事実を数値で。最も売上が高かった日と、それが何によるものかを必ず1行で言及。

### 2. 注目日の分析
Step 2で特定した注目日について、表または箇条書きで詳細を記載:
- 売上トップ5日（日付・売上・再生数）
- 再生数トップ5日（日付・再生数・売上）
- それぞれの日について「SNSが効いたか」の判定

### 3. Amazon分析
- 期間売上合計、1日平均、売上が0の日数
- セール期間がある場合: 「今回 X月Y日〜X月Y日: ¥AAA vs 前回 X月Y日〜X月Y日: ¥BBB（+CC%）」
- 注目日のうちAmazon売上が高かった日と再生数の関係

### 4. 楽天分析
- 期間売上合計、1日平均、売上が0の日数
- セール期間がある場合: 「今回 X月Y日〜X月Y日 のマラソン: ¥AAA vs 前回 X月Y日〜X月Y日 のマラソン: ¥BBB（+CC%）」
- 注目日のうち楽天売上が高かった日と再生数の関係

### 5. Qoo10分析
- 期間売上合計、1日平均、売上が0の日数
- セール期間がある場合: 「今回 X月Y日〜X月Y日 のメガ割: ¥AAA vs 前回 X月Y日〜X月Y日 のメガ割: ¥BBB（+CC%）」
- 注目日のうちQoo10売上が高かった日と再生数の関係

### 6. ファインディングスと提言
- SNSが売上に効いた/効かなかった、の結論を数値根拠で
- **最も売上に貢献した日とその理由**（注目日の分析から導出）
- 今後のSNS運用への具体的提言（投稿タイミング・頻度）

※データがないモールはスキップ。その他チャネル（自社サイト、Yahoo、店舗等）がある場合は個別に言及。
※前回セールのデータが提供データ内にない場合は「過去90日内に該当セールなし」と明記。`;

export async function POST(req: NextRequest) {
  try {
    const { currentPeriod, historicalData, flagsData, productName } = await req.json();

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

    const userMessage = `以下のデータを分析してください。

## 対象商品: ${productName}

## 【当期間】 ${currentPeriod.startDate} 〜 ${currentPeriod.endDate}
日別データ（viewsが再生数、それ以外のキーはチャネル別売上額）:
\`\`\`json
${JSON.stringify(currentPeriod.dailyData, null, 2)}
\`\`\`

## 【過去90日】 ${historicalData.startDate} 〜 ${historicalData.endDate}
前回セール比較用の過去データ:
\`\`\`json
${JSON.stringify(historicalData.dailyData, null, 2)}
\`\`\`

## イベントフラグ（当期間+過去90日のセール情報）
\`\`\`json
${JSON.stringify(flagsData, null, 2)}
\`\`\`

【重要】
- 過去90日間のフラグから「同名セールの前回出現」を必ず探して比較すること。
- 前回セール比較では必ず日付（X月Y日〜X月Y日）を明記すること。
- 当期間の売上トップ5日と再生数トップ5日を必ず特定し、両者の関係を分析すること。`;

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
