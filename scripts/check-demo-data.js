const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs, query, where, doc, getDoc } = require("firebase/firestore");

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

const PRODUCT_ID = "demo-product-skincare-001";

async function check() {
  // 1. 商品
  const productDoc = await getDoc(doc(db, "registered_products", PRODUCT_ID));
  console.log("=== registered_products ===");
  console.log("存在:", productDoc.exists(), productDoc.data()?.productName);

  // 2. アカウント
  const accountsSnap = await getDocs(query(collection(db, "tiktok_accounts"), where("productId", "==", PRODUCT_ID)));
  console.log("\n=== tiktok_accounts ===");
  console.log("件数:", accountsSnap.size);
  accountsSnap.docs.forEach(d => console.log("  ", d.id, d.data().tiktokUserName));

  // 3. 動画
  const accountIds = accountsSnap.docs.map(d => d.id);
  let videoCount = 0;
  for (const accId of accountIds) {
    const vSnap = await getDocs(query(collection(db, "tiktok_videos"), where("accountId", "==", accId)));
    console.log(`\n=== tiktok_videos (${accId}) ===`);
    console.log("件数:", vSnap.size);
    vSnap.docs.slice(0, 2).forEach(d => console.log("  ", d.data().title, "views:", d.data().viewCount));
    videoCount += vSnap.size;
  }
  console.log("\n動画合計:", videoCount);

  // 4. スナップショット
  const snapSnap = await getDocs(query(
    collection(db, "tiktok_video_daily_snapshots"),
    where("productId", "==", PRODUCT_ID),
    where("date", ">=", "2025-12-01"),
    where("date", "<=", "2026-01-01")
  ));
  console.log("\n=== tiktok_video_daily_snapshots (12月分) ===");
  console.log("件数:", snapSnap.size);
  if (snapSnap.size > 0) {
    const first = snapSnap.docs[0].data();
    console.log("  サンプル:", first.date, "views:", first.viewCount);
  }

  // 5. 売上
  const amazonSnap = await getDocs(query(collection(db, "amazon_daily_sales"), where("productId", "==", PRODUCT_ID)));
  console.log("\n=== amazon_daily_sales ===");
  console.log("件数:", amazonSnap.size);

  const rakutenSnap = await getDocs(query(collection(db, "rakuten_daily_sales"), where("productId", "==", PRODUCT_ID)));
  console.log("\n=== rakuten_daily_sales ===");
  console.log("件数:", rakutenSnap.size);

  const qoo10Snap = await getDocs(query(collection(db, "product_sales"), where("productId", "==", PRODUCT_ID)));
  console.log("\n=== product_sales (qoo10) ===");
  console.log("件数:", qoo10Snap.size);

  process.exit(0);
}

check().catch(e => { console.error(e); process.exit(1); });
