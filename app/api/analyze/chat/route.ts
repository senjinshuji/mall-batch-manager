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

const SYSTEM_PROMPT = `あなたはプロのECデータアナリストです。ユーザーがあなたが先ほど作成した分析レポートについてフォローアップ質問をしてきます。

## 重要な制約
- **数値はファクトシートに記載されているものだけを使うこと。** ファクトシートに無い数字を勝手に計算したり推測したりしてはいけない。
- **🚨 ファクトシートの「売上データがあるチャネル」セクションに記載されていないチャネルについて、絶対に言及しないこと。**
- 推測や予想を語るときは「〜と考えられる」「〜の可能性がある」と明示すること。
- 質問が曖昧な場合は、何を聞かれているか明確化を求めても良い。
- 簡潔に答えること（必要なら箇条書き、不要なら2〜3行で）。`;

export async function POST(req: NextRequest) {
  try {
    const { factsMarkdown, messages, productName } = await req.json();

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

    // 1番目のユーザーメッセージにファクトシートを埋め込む
    const enhancedMessages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      {
        role: "user" as const,
        content: `以下が ${productName} の計算済みファクトシートです。これを元に質問に答えてください。\n\n${factsMarkdown}`,
      },
      { role: "assistant" as const, content: "了解しました。ファクトシートを確認しました。質問をどうぞ。" },
      ...messages,
    ];

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 2048,
      messages: enhancedMessages,
    });

    const responseText = response.choices[0]?.message?.content || "応答を取得できませんでした。";

    return NextResponse.json({ reply: responseText });
  } catch (error: unknown) {
    console.error("チャットAPIエラー:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
