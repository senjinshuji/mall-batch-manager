const { initializeApp } = require("firebase/app");
const { getFirestore, collection, addDoc, Timestamp } = require("firebase/firestore");

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

async function generateNovemberData() {
  console.log("Generating November 2025 demo data...");

  const year = 2025;
  const month = 11; // November

  // 11月1日から30日まで
  for (let day = 1; day <= 30; day++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    // リアルな売上データを生成（週末は少し高め）
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
      createdAt: new Date(),
      source: "demo-data-november",
    };

    try {
      const docRef = await addDoc(collection(db, "sales_data"), salesData);
      console.log(`Added ${dateStr}: Amazon ¥${baseAmazon.toLocaleString()}, Rakuten ¥${baseRakuten.toLocaleString()}, Qoo10 ¥${baseQoo10.toLocaleString()}`);
    } catch (error) {
      console.error(`Error adding ${dateStr}:`, error);
    }
  }

  console.log("\nDone! Generated 30 days of November data.");
  process.exit(0);
}

generateNovemberData();
