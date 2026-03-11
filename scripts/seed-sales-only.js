const { initializeApp } = require("firebase/app");
const { getFirestore, doc, setDoc } = require("firebase/firestore");

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

const DEMO_PRODUCT_ID = "demo-product-skincare-001";

async function seedSales() {
  console.log("売上デモデータを投入中...");

  const salesStart = new Date("2025-12-01");
  const salesEnd = new Date("2026-03-10");
  let count = 0;
  let currentDate = new Date(salesStart);

  while (currentDate <= salesEnd) {
    const dateStr = currentDate.toISOString().split("T")[0];
    const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;
    const multiplier = isWeekend ? 1.3 : 1.0;

    await setDoc(doc(db, "amazon_daily_sales", `${DEMO_PRODUCT_ID}_${dateStr}`), {
      productId: DEMO_PRODUCT_ID,
      date: dateStr,
      sales: Math.floor((8000 + Math.random() * 12000) * multiplier),
      units: Math.floor((3 + Math.random() * 8) * multiplier),
    });

    await setDoc(doc(db, "rakuten_daily_sales", `${DEMO_PRODUCT_ID}_${dateStr}`), {
      productId: DEMO_PRODUCT_ID,
      date: dateStr,
      sales: Math.floor((5000 + Math.random() * 10000) * multiplier),
      units: Math.floor((2 + Math.random() * 6) * multiplier),
    });

    await setDoc(doc(db, "product_sales", `qoo10_${DEMO_PRODUCT_ID}_${dateStr}`), {
      productId: DEMO_PRODUCT_ID,
      date: dateStr,
      mall: "qoo10",
      sales: Math.floor((3000 + Math.random() * 8000) * multiplier),
      units: Math.floor((1 + Math.random() * 5) * multiplier),
    });

    count++;
    if (count % 30 === 0) console.log(`  ${count} 日分完了...`);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  console.log(`完了！${count} 日分の売上データを投入しました。`);
  process.exit(0);
}

seedSales().catch((e) => { console.error(e); process.exit(1); });
