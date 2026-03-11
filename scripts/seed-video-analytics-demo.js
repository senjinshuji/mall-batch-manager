const { initializeApp } = require("firebase/app");
const { getFirestore, collection, doc, setDoc, addDoc } = require("firebase/firestore");

const firebaseConfig = {
  apiKey: "AIzaSyC1yeHPptvV1t-3eNquE-_ElABNQC73lxc",
  authDomain: "mall-batch-manager.firebaseapp.com",
  projectId: "mall-batch-manager",
  storageBucket: "mall-batch-manager.firebasestorage.app",
  messagingSenderId: "983678294034",
  appId: "1:983678294034:web:3c78b39d9265c0774820cb",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// デモ商品ID
const DEMO_PRODUCT_ID = "demo-product-skincare-001";

// デモTikTokアカウント
const DEMO_ACCOUNTS = [
  {
    id: "demo-account-001",
    tiktokUserId: "demo_beauty_tokyo",
    tiktokUserName: "beauty_tokyo_official",
    tiktokAvatarUrl: "",
    productId: DEMO_PRODUCT_ID,
    hidden: false,
    connectedAt: new Date(),
  },
  {
    id: "demo-account-002",
    tiktokUserId: "demo_skincare_guru",
    tiktokUserName: "skincare_guru_jp",
    tiktokAvatarUrl: "",
    productId: DEMO_PRODUCT_ID,
    hidden: false,
    connectedAt: new Date(),
  },
  {
    id: "demo-account-003",
    tiktokUserId: "demo_cosme_review",
    tiktokUserName: "cosme_review_ch",
    tiktokAvatarUrl: "",
    productId: DEMO_PRODUCT_ID,
    hidden: false,
    connectedAt: new Date(),
  },
];

// 動画タイトルテンプレート
const VIDEO_TITLES = [
  "【衝撃】この化粧水がすごすぎた...",
  "朝のスキンケアルーティン紹介します",
  "ドラコス超えのクオリティ！話題の美容液レビュー",
  "1週間使ってみた結果が想像以上だった",
  "肌荒れに悩む人に試してほしいスキンケア",
  "プロが教える正しい保湿の方法",
  "【比較】人気化粧水5つ使い比べてみた",
  "夜のスキンケアルーティン完全版",
  "乾燥肌さん必見！冬のスキンケア対策",
  "【ガチレビュー】SNSで話題のあの商品を検証",
  "毛穴が消える！？話題のスキンケアを試してみた",
  "3日で肌が変わった神アイテム",
  "美容部員が本気でおすすめするスキンケア",
  "コスパ最強スキンケア見つけた",
  "【Before/After】2週間使い続けた結果",
  "敏感肌でも使える優秀スキンケア",
  "韓国で爆売れしてる美容液が日本上陸",
  "ニキビ跡に効くスキンケアランキング",
  "30代からの本気スキンケア始めました",
  "【保存版】スキンケアの順番と選び方",
  "ズボラさん向け時短スキンケア3選",
  "美肌の秘訣は〇〇だった！",
  "200円で買える最強スキンケアアイテム",
  "【暴露】美容業界の裏側教えます",
  "冬の乾燥対策スキンケアまとめ",
  "ツヤ肌になれるスキンケアテクニック",
  "肌診断してもらったら衝撃の結果に...",
  "話題のCICA配合クリームを1ヶ月使ってみた",
  "メンズスキンケアの正解はこれ！",
  "40代でも遅くない！エイジングケア入門",
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

// 動画データ生成
function generateVideos() {
  const videos = [];
  const startDate = new Date("2025-12-01");

  for (let i = 0; i < 30; i++) {
    const account = DEMO_ACCOUNTS[i % DEMO_ACCOUNTS.length];
    // 投稿日をランダムに分散（12月〜2月）
    const daysOffset = randomInt(0, 89);
    const createDate = new Date(startDate);
    createDate.setDate(createDate.getDate() + daysOffset);

    // バズった動画（10K+）を数本混ぜる
    let viewCount;
    if (i < 3) {
      viewCount = randomInt(50000, 200000); // バズ動画
    } else if (i < 8) {
      viewCount = randomInt(10000, 50000); // 中ヒット
    } else {
      viewCount = randomInt(500, 10000); // 通常
    }

    const engagementMultiplier = randomFloat(0.02, 0.08);
    const likeCount = Math.floor(viewCount * randomFloat(0.02, 0.06));
    const commentCount = Math.floor(viewCount * randomFloat(0.001, 0.01));
    const shareCount = Math.floor(viewCount * randomFloat(0.005, 0.02));

    videos.push({
      videoId: `demo-video-${String(i + 1).padStart(3, "0")}`,
      title: VIDEO_TITLES[i],
      coverImageUrl: "",
      shareUrl: `https://www.tiktok.com/@${account.tiktokUserName}/video/${7000000000000000000 + i}`,
      createTime: createDate.toISOString(),
      viewCount,
      likeCount,
      commentCount,
      shareCount,
      retention1s: parseFloat(randomFloat(55, 85).toFixed(1)),
      retention2s: parseFloat(randomFloat(35, 65).toFixed(1)),
      fullVideoWatchedRate: parseFloat(randomFloat(5, 35).toFixed(1)),
      duration: randomInt(15, 60),
      accountId: account.id,
      accountName: account.tiktokUserName,
      productId: DEMO_PRODUCT_ID,
    });
  }

  return videos;
}

// 日次スナップショット生成
function generateDailySnapshots(videos) {
  const snapshots = [];
  const startDate = new Date("2025-12-01");
  const endDate = new Date("2026-03-10");

  for (const video of videos) {
    const videoCreateDate = new Date(video.createTime);
    let currentDate = new Date(Math.max(videoCreateDate.getTime(), startDate.getTime()));

    // 累計値を徐々に増やす
    let cumulativeViews = 0;
    let cumulativeLikes = 0;
    let cumulativeComments = 0;
    let cumulativeShares = 0;

    const totalDays = Math.floor((endDate - videoCreateDate) / (1000 * 60 * 60 * 24));
    if (totalDays <= 0) continue;

    while (currentDate <= endDate) {
      const daysSincePost = Math.floor((currentDate - videoCreateDate) / (1000 * 60 * 60 * 24));
      if (daysSincePost < 0) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      // 初日に多く、徐々に減衰するパターン
      const decayFactor = Math.exp(-daysSincePost * 0.05);
      const dailyViewGain = Math.floor(video.viewCount * 0.15 * decayFactor * randomFloat(0.5, 1.5));

      cumulativeViews += dailyViewGain;
      cumulativeLikes += Math.floor(dailyViewGain * randomFloat(0.02, 0.06));
      cumulativeComments += Math.floor(dailyViewGain * randomFloat(0.001, 0.01));
      cumulativeShares += Math.floor(dailyViewGain * randomFloat(0.005, 0.02));

      // 累計値がfinal値を超えないよう制限
      cumulativeViews = Math.min(cumulativeViews, video.viewCount);
      cumulativeLikes = Math.min(cumulativeLikes, video.likeCount);
      cumulativeComments = Math.min(cumulativeComments, video.commentCount);
      cumulativeShares = Math.min(cumulativeShares, video.shareCount);

      const dateStr = currentDate.toISOString().split("T")[0];

      snapshots.push({
        videoId: video.videoId,
        accountId: video.accountId,
        productId: DEMO_PRODUCT_ID,
        date: dateStr,
        viewCount: cumulativeViews,
        likeCount: cumulativeLikes,
        commentCount: cumulativeComments,
        shareCount: cumulativeShares,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  return snapshots;
}

async function seedData() {
  console.log("=== 動画分析デモデータ投入開始 ===\n");

  // 1. デモ商品を登録
  console.log("1. デモ商品を登録...");
  await setDoc(doc(db, "registered_products", DEMO_PRODUCT_ID), {
    productName: "【デモ】モイスチャー美容液セット",
    skuName: "DEMO-SKU-001",
    createdAt: new Date(),
    source: "demo-data",
  });
  console.log("   -> 商品登録完了\n");

  // 2. TikTokアカウントを登録
  console.log("2. TikTokアカウントを登録...");
  for (const account of DEMO_ACCOUNTS) {
    await setDoc(doc(db, "tiktok_accounts", account.id), account);
    console.log(`   -> ${account.tiktokUserName}`);
  }
  console.log("");

  // 3. 動画データを生成・登録
  console.log("3. 動画データを生成・登録（30件）...");
  const videos = generateVideos();
  for (const video of videos) {
    await setDoc(doc(db, "tiktok_videos", video.videoId), video);
    console.log(`   -> ${video.title.slice(0, 30)}... (${video.viewCount.toLocaleString()} views)`);
  }
  console.log("");

  // 4. 日次スナップショットを生成・登録
  console.log("4. 日次スナップショットを生成・登録...");
  const snapshots = generateDailySnapshots(videos);
  console.log(`   ${snapshots.length}件のスナップショットを投入中...`);

  let count = 0;
  for (const snapshot of snapshots) {
    const snapshotId = `${snapshot.videoId}_${snapshot.date}`;
    await setDoc(doc(db, "tiktok_video_daily_snapshots", snapshotId), snapshot);
    count++;
    if (count % 100 === 0) {
      console.log(`   ${count}/${snapshots.length} 件完了...`);
    }
  }
  console.log(`   -> 全 ${count} 件の日次スナップショット登録完了\n`);

  // 5. 売上デモデータ（Amazon/楽天/Qoo10）
  console.log("5. 売上デモデータを生成・登録...");
  const salesStart = new Date("2025-12-01");
  const salesEnd = new Date("2026-03-10");
  let salesCount = 0;
  let currentDate = new Date(salesStart);

  while (currentDate <= salesEnd) {
    const dateStr = currentDate.toISOString().split("T")[0];
    const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;
    const multiplier = isWeekend ? 1.3 : 1.0;

    // Amazon
    await setDoc(doc(db, "amazon_daily_sales", `${DEMO_PRODUCT_ID}_${dateStr}`), {
      productId: DEMO_PRODUCT_ID,
      date: dateStr,
      sales: Math.floor((8000 + Math.random() * 12000) * multiplier),
      units: Math.floor((3 + Math.random() * 8) * multiplier),
    });

    // 楽天
    await setDoc(doc(db, "rakuten_daily_sales", `${DEMO_PRODUCT_ID}_${dateStr}`), {
      productId: DEMO_PRODUCT_ID,
      date: dateStr,
      sales: Math.floor((5000 + Math.random() * 10000) * multiplier),
      units: Math.floor((2 + Math.random() * 6) * multiplier),
    });

    // Qoo10
    await setDoc(doc(db, "product_sales", `qoo10_${DEMO_PRODUCT_ID}_${dateStr}`), {
      productId: DEMO_PRODUCT_ID,
      date: dateStr,
      mall: "qoo10",
      sales: Math.floor((3000 + Math.random() * 8000) * multiplier),
      units: Math.floor((1 + Math.random() * 5) * multiplier),
    });

    salesCount++;
    currentDate.setDate(currentDate.getDate() + 1);

    if (salesCount % 30 === 0) {
      console.log(`   ${salesCount} 日分完了...`);
    }
  }
  console.log(`   -> ${salesCount} 日分の売上データ登録完了\n`);

  console.log("=== デモデータ投入完了！ ===");
  console.log(`商品名: 【デモ】モイスチャー美容液セット`);
  console.log(`アカウント数: ${DEMO_ACCOUNTS.length}`);
  console.log(`動画数: ${videos.length}`);
  console.log(`日次スナップショット: ${snapshots.length}件`);
  console.log(`売上データ: ${salesCount}日分`);
  console.log("\nアプリで「【デモ】モイスチャー美容液セット」を選択してください。");

  process.exit(0);
}

seedData().catch((error) => {
  console.error("エラー:", error);
  process.exit(1);
});
