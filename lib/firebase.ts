import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC1yeHPptvV1t-3eNquE-_ElABNQC73lxc",
  authDomain: "mall-batch-manager.firebaseapp.com",
  projectId: "mall-batch-manager",
  storageBucket: "mall-batch-manager.firebasestorage.app",
  messagingSenderId: "983678294034",
  appId: "1:983678294034:web:3c78b39d9265c0774820cb",
};

// Initialize Firebase (prevent duplicate initialization)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const db = getFirestore(app);
