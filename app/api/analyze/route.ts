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

const SYSTEM_PROMPT = `あなたはプロのECデータアナリストです。
提供される「SNSの再生数データ」と「ECモール（Amazon、楽天、Qoo10等）の売上データ」を用いて、SNS運用が各モールの売上に与えた効果を正確に測定・分析してください。

ECの売上はプラットフォームのセール要因（外部要因）に大きく左右されるため、以下の【セールの定義】と【分析ルール】に厳密に従ってノイズを排除し、純粋なSNSの貢献度を算出してください。

### 1. セールの定義と格付けマップ
各モールのセール規模を以下のように定義します。
* 楽天
  * 【大】楽天スーパーSALE
  * 【中】お買い物マラソン、イーグルス感謝祭、ブラックフライデー等
  * 【小】5と0のつく日、1日（ワンダフルデー）、18日（ご愛顧感謝デー）等
* Amazon
  * 【大】プライムデー、ブラックフライデー
  * 【中】プライム感謝祭、新生活SALE等
  * 【小】タイムセール祭り等
* Qoo10
  * 【大】メガ割
  * 【小】20%メガポ、スーパーセール等

### 2. データ仕分けと分析・分岐ルール
日々のデータを以下の2つのモードに自動で仕分け、それぞれ異なるルールで比較・分析してください。
※欠損データがある期間は除外し、比較する「日数」を必ず揃えること。

【モードA：特需モード（いずれかのモールでセール開催中）】
* 処理：セールを開催しているモールの売上データのみを完全に独立させて分析すること。
* 比較対象：そのモールにおける「過去の同規模・同日数のセール期間」と比較すること。

【モードB：純粋SNSモード（全モールでセールが開催されていない通常期）】
* 処理：全モールの売上を「合算（ミックス）」して、総売上として扱うこと。
* 比較対象：直近の「同じく全モールでセールがなかった同日数」の合算総売上と比較すること。

### 3. SNS効果（スパイク）の測定ルール
SNSの効果は、再生数の絶対数ではなく「相対的な変化（波）」で測ります。
1. 直近7日間の「平均再生数」をベースラインとして算出する。
2. そのベースラインに対して「2倍以上」の再生数を記録した日を『SNSスパイク日』と定義する。
3. 『SNSスパイク日』の当日〜3日後までの期間において、比較対象期間のベースラインから売上がどれだけリフト（増加）したかを算出し、SNSの貢献度として評価する。

### 4. 出力形式
以下の構成でレポートを出力してください。マークダウン形式で記述してください。
1. **データ整理の前提確認**（どの期間をモードA、モードBに振り分けたかの明記）
2. **純粋SNSモード（通常期）の分析結果**（全モール合算でのSNSスパイクと売上リフトの効果検証）
3. **特需モード（セール期）のモール別分析結果**（各モール単体のセール時におけるSNSのブースト効果検証）
4. **分析からのファインディングス**（総括と今後のSNS運用・投稿タイミングへの示唆）

データが不足している場合はその旨を明記し、可能な範囲で分析してください。`;

export async function POST(req: NextRequest) {
  try {
    const { salesData, viewsData, flagsData, productName, startDate, endDate } = await req.json();

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
## 分析期間: ${startDate} 〜 ${endDate}

## 売上データ（日別・チャネル別）
\`\`\`json
${JSON.stringify(salesData, null, 2)}
\`\`\`

## 再生数データ（日別）
\`\`\`json
${JSON.stringify(viewsData, null, 2)}
\`\`\`

## イベントフラグ（セール期間等）
\`\`\`json
${JSON.stringify(flagsData, null, 2)}
\`\`\`

上記データに基づいて、指定のフォーマットで分析レポートを作成してください。`;

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
