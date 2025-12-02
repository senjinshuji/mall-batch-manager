"use client";

import { useState, useEffect } from "react";
import { Save, Eye, EyeOff, Key, RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

type MallCredentials = {
  id: string;
  password: string;
};

type Qoo10Credentials = {
  apiKey: string;
};

type Credentials = {
  amazon: MallCredentials;
  rakuten: MallCredentials;
  qoo10: Qoo10Credentials;
};

const MALL_INFO = {
  amazon: {
    name: "Amazon",
    color: "#FF9900",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
    authType: "id_password" as const,
  },
  rakuten: {
    name: "楽天",
    color: "#BF0000",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    authType: "id_password" as const,
  },
  qoo10: {
    name: "Qoo10",
    color: "#3266CC",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    authType: "api_key" as const,
  },
};

export default function SettingsPage() {
  const [credentials, setCredentials] = useState<Credentials>({
    amazon: { id: "", password: "" },
    rakuten: { id: "", password: "" },
    qoo10: { apiKey: "" },
  });

  const [showPasswords, setShowPasswords] = useState({
    amazon: false,
    rakuten: false,
    qoo10: false,
  });

  const [saveStatus, setSaveStatus] = useState<{
    type: "success" | "error" | null;
    message: string;
  }>({ type: null, message: "" });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Firestoreから設定を読み込む
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const docRef = doc(db, "settings", "mall_credentials");
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          setCredentials({
            amazon: data.amazon || { id: "", password: "" },
            rakuten: data.rakuten || { id: "", password: "" },
            qoo10: data.qoo10 || { apiKey: "" },
          });
        }
      } catch (error) {
        console.error("設定の読み込みに失敗:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  const handleChange = (
    mall: "amazon" | "rakuten",
    field: keyof MallCredentials,
    value: string
  ) => {
    setCredentials((prev) => ({
      ...prev,
      [mall]: {
        ...prev[mall],
        [field]: value,
      },
    }));
  };

  const handleQoo10Change = (value: string) => {
    setCredentials((prev) => ({
      ...prev,
      qoo10: { apiKey: value },
    }));
  };

  const togglePasswordVisibility = (mall: keyof typeof showPasswords) => {
    setShowPasswords((prev) => ({
      ...prev,
      [mall]: !prev[mall],
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus({ type: null, message: "" });

    try {
      const docRef = doc(db, "settings", "mall_credentials");
      await setDoc(docRef, {
        amazon: credentials.amazon,
        rakuten: credentials.rakuten,
        qoo10: credentials.qoo10,
        updatedAt: new Date(),
      });

      setSaveStatus({ type: "success", message: "設定を保存しました" });
      setTimeout(() => setSaveStatus({ type: null, message: "" }), 3000);
    } catch (error) {
      console.error("保存エラー:", error);
      setSaveStatus({ type: "error", message: "保存に失敗しました" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-600">設定を読み込み中...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ページタイトル */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">媒体設定</h1>
        <p className="text-gray-600 mt-1">
          各モールの認証情報を登録してください
        </p>
      </div>

      {/* 注意書き */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-blue-800 text-sm">
          <strong>Qoo10:</strong> APIキーを入力することで、注文データを自動取得できます。
          APIキーはQoo10セラー管理画面から取得してください。
        </p>
      </div>

      {/* モール設定カード */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Amazon */}
        <div className={`bg-white rounded-xl shadow-sm border-2 ${MALL_INFO.amazon.borderColor} overflow-hidden`}>
          <div className={`${MALL_INFO.amazon.bgColor} px-6 py-4 border-b ${MALL_INFO.amazon.borderColor}`}>
            <h3 className="text-lg font-bold" style={{ color: MALL_INFO.amazon.color }}>
              {MALL_INFO.amazon.name}
            </h3>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label htmlFor="amazon-id" className="block text-sm font-medium text-gray-600 mb-1">
                ID
              </label>
              <input
                type="text"
                id="amazon-id"
                value={credentials.amazon.id}
                onChange={(e) => handleChange("amazon", "id", e.target.value)}
                placeholder="ログインIDを入力"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label htmlFor="amazon-password" className="block text-sm font-medium text-gray-600 mb-1">
                パスワード
              </label>
              <div className="relative">
                <input
                  type={showPasswords.amazon ? "text" : "password"}
                  id="amazon-password"
                  value={credentials.amazon.password}
                  onChange={(e) => handleChange("amazon", "password", e.target.value)}
                  placeholder="パスワードを入力"
                  className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility("amazon")}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPasswords.amazon ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-400">
              ※ Amazon/楽天のスクレイピングは今後実装予定
            </p>
          </div>
        </div>

        {/* 楽天 */}
        <div className={`bg-white rounded-xl shadow-sm border-2 ${MALL_INFO.rakuten.borderColor} overflow-hidden`}>
          <div className={`${MALL_INFO.rakuten.bgColor} px-6 py-4 border-b ${MALL_INFO.rakuten.borderColor}`}>
            <h3 className="text-lg font-bold" style={{ color: MALL_INFO.rakuten.color }}>
              {MALL_INFO.rakuten.name}
            </h3>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label htmlFor="rakuten-id" className="block text-sm font-medium text-gray-600 mb-1">
                ID
              </label>
              <input
                type="text"
                id="rakuten-id"
                value={credentials.rakuten.id}
                onChange={(e) => handleChange("rakuten", "id", e.target.value)}
                placeholder="ログインIDを入力"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label htmlFor="rakuten-password" className="block text-sm font-medium text-gray-600 mb-1">
                パスワード
              </label>
              <div className="relative">
                <input
                  type={showPasswords.rakuten ? "text" : "password"}
                  id="rakuten-password"
                  value={credentials.rakuten.password}
                  onChange={(e) => handleChange("rakuten", "password", e.target.value)}
                  placeholder="パスワードを入力"
                  className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility("rakuten")}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPasswords.rakuten ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-400">
              ※ Amazon/楽天のスクレイピングは今後実装予定
            </p>
          </div>
        </div>

        {/* Qoo10 - APIキー方式 */}
        <div className={`bg-white rounded-xl shadow-sm border-2 ${MALL_INFO.qoo10.borderColor} overflow-hidden`}>
          <div className={`${MALL_INFO.qoo10.bgColor} px-6 py-4 border-b ${MALL_INFO.qoo10.borderColor}`}>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold" style={{ color: MALL_INFO.qoo10.color }}>
                {MALL_INFO.qoo10.name}
              </h3>
              <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                API連携
              </span>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label htmlFor="qoo10-apikey" className="block text-sm font-medium text-gray-600 mb-1">
                <span className="flex items-center gap-1">
                  <Key size={14} />
                  APIキー
                </span>
              </label>
              <div className="relative">
                <input
                  type={showPasswords.qoo10 ? "text" : "password"}
                  id="qoo10-apikey"
                  value={credentials.qoo10.apiKey}
                  onChange={(e) => handleQoo10Change(e.target.value)}
                  placeholder="Qoo10 APIキーを入力"
                  className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility("qoo10")}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPasswords.qoo10 ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600">
              <p className="font-medium mb-1">APIキーの取得方法:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Qoo10セラー管理画面にログイン</li>
                <li>設定 → API設定を開く</li>
                <li>APIキーをコピー</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      {/* 保存ボタン */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? (
            <RefreshCw size={20} className="animate-spin" />
          ) : (
            <Save size={20} />
          )}
          {isSaving ? "保存中..." : "保存"}
        </button>
        {saveStatus.type && (
          <span className={`flex items-center gap-1 font-medium ${
            saveStatus.type === "success" ? "text-green-600" : "text-red-600"
          }`}>
            {saveStatus.type === "success" ? (
              <CheckCircle size={18} />
            ) : (
              <AlertCircle size={18} />
            )}
            {saveStatus.message}
          </span>
        )}
      </div>
    </div>
  );
}
