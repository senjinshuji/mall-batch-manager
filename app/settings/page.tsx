"use client";

import { useState, useEffect } from "react";
import { Save, Eye, EyeOff, Key, RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

// 楽天RMS認証情報
type RakutenCredentials = {
  serviceSecret: string;
  licenseKey: string;
};

// Amazon SP-API認証情報
type AmazonCredentials = {
  lwaClientId: string;
  lwaClientSecret: string;
  refreshToken: string;
  awsAccessKey: string;
  awsSecretKey: string;
};

// Qoo10認証情報
type Qoo10Credentials = {
  apiKey: string;
};

type Credentials = {
  amazon: AmazonCredentials;
  rakuten: RakutenCredentials;
  qoo10: Qoo10Credentials;
};

const MALL_INFO = {
  amazon: {
    name: "Amazon",
    color: "#FF9900",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
  },
  rakuten: {
    name: "楽天",
    color: "#BF0000",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
  },
  qoo10: {
    name: "Qoo10",
    color: "#3266CC",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
  },
};

const initialCredentials: Credentials = {
  amazon: {
    lwaClientId: "",
    lwaClientSecret: "",
    refreshToken: "",
    awsAccessKey: "",
    awsSecretKey: "",
  },
  rakuten: {
    serviceSecret: "",
    licenseKey: "",
  },
  qoo10: {
    apiKey: "",
  },
};

export default function SettingsPage() {
  const [credentials, setCredentials] = useState<Credentials>(initialCredentials);

  const [showSecrets, setShowSecrets] = useState({
    // Amazon
    lwaClientSecret: false,
    refreshToken: false,
    awsSecretKey: false,
    // Rakuten
    serviceSecret: false,
    licenseKey: false,
    // Qoo10
    qoo10ApiKey: false,
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
            amazon: data.amazon || initialCredentials.amazon,
            rakuten: data.rakuten || initialCredentials.rakuten,
            qoo10: data.qoo10 || initialCredentials.qoo10,
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

  const handleAmazonChange = (field: keyof AmazonCredentials, value: string) => {
    setCredentials((prev) => ({
      ...prev,
      amazon: {
        ...prev.amazon,
        [field]: value,
      },
    }));
  };

  const handleRakutenChange = (field: keyof RakutenCredentials, value: string) => {
    setCredentials((prev) => ({
      ...prev,
      rakuten: {
        ...prev.rakuten,
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

  const toggleVisibility = (field: keyof typeof showSecrets) => {
    setShowSecrets((prev) => ({
      ...prev,
      [field]: !prev[field],
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

  // 秘密情報入力フィールドのコンポーネント
  const SecretInput = ({
    id,
    label,
    value,
    onChange,
    showKey,
    placeholder,
  }: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    showKey: keyof typeof showSecrets;
    placeholder: string;
  }) => (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-600 mb-1">
        <span className="flex items-center gap-1">
          <Key size={14} />
          {label}
        </span>
      </label>
      <div className="relative">
        <input
          type={showSecrets[showKey] ? "text" : "password"}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono text-sm"
        />
        <button
          type="button"
          onClick={() => toggleVisibility(showKey)}
          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          {showSecrets[showKey] ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );

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
          各モールのAPI認証情報を登録してください
        </p>
      </div>

      {/* モール設定カード */}
      <div className="grid gap-6">
        {/* Amazon SP-API */}
        <div className={`bg-white rounded-xl shadow-sm border-2 ${MALL_INFO.amazon.borderColor} overflow-hidden`}>
          <div className={`${MALL_INFO.amazon.bgColor} px-6 py-4 border-b ${MALL_INFO.amazon.borderColor}`}>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold" style={{ color: MALL_INFO.amazon.color }}>
                {MALL_INFO.amazon.name}
              </h3>
              <span className="px-2 py-0.5 bg-orange-600 text-white text-xs rounded-full">
                SP-API
              </span>
            </div>
          </div>
          <div className="p-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* LWA Client ID */}
              <div>
                <label htmlFor="amazon-lwa-client-id" className="block text-sm font-medium text-gray-600 mb-1">
                  LWA Client ID
                </label>
                <input
                  type="text"
                  id="amazon-lwa-client-id"
                  value={credentials.amazon.lwaClientId}
                  onChange={(e) => handleAmazonChange("lwaClientId", e.target.value)}
                  placeholder="amzn1.application-oa2-client.xxx"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono text-sm"
                />
              </div>

              {/* LWA Client Secret */}
              <SecretInput
                id="amazon-lwa-client-secret"
                label="LWA Client Secret"
                value={credentials.amazon.lwaClientSecret}
                onChange={(v) => handleAmazonChange("lwaClientSecret", v)}
                showKey="lwaClientSecret"
                placeholder="クライアントシークレットを入力"
              />

              {/* Refresh Token */}
              <SecretInput
                id="amazon-refresh-token"
                label="Refresh Token"
                value={credentials.amazon.refreshToken}
                onChange={(v) => handleAmazonChange("refreshToken", v)}
                showKey="refreshToken"
                placeholder="リフレッシュトークンを入力"
              />

              {/* AWS Access Key */}
              <div>
                <label htmlFor="amazon-aws-access-key" className="block text-sm font-medium text-gray-600 mb-1">
                  AWS Access Key
                </label>
                <input
                  type="text"
                  id="amazon-aws-access-key"
                  value={credentials.amazon.awsAccessKey}
                  onChange={(e) => handleAmazonChange("awsAccessKey", e.target.value)}
                  placeholder="AKIAXXXXXXXXXXXXXXXX"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono text-sm"
                />
              </div>

              {/* AWS Secret Key */}
              <SecretInput
                id="amazon-aws-secret-key"
                label="AWS Secret Key"
                value={credentials.amazon.awsSecretKey}
                onChange={(v) => handleAmazonChange("awsSecretKey", v)}
                showKey="awsSecretKey"
                placeholder="AWSシークレットキーを入力"
              />
            </div>

            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 mt-4">
              <p className="font-medium mb-1">SP-API認証情報の取得方法:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Amazon Seller Centralにログイン</li>
                <li>アプリとサービス → アプリの開発 でアプリを作成</li>
                <li>AWS IAMでSP-API用のユーザーを作成</li>
                <li>上記の情報を入力してください</li>
              </ol>
            </div>
          </div>
        </div>

        {/* 楽天 RMS */}
        <div className={`bg-white rounded-xl shadow-sm border-2 ${MALL_INFO.rakuten.borderColor} overflow-hidden`}>
          <div className={`${MALL_INFO.rakuten.bgColor} px-6 py-4 border-b ${MALL_INFO.rakuten.borderColor}`}>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold" style={{ color: MALL_INFO.rakuten.color }}>
                {MALL_INFO.rakuten.name}
              </h3>
              <span className="px-2 py-0.5 bg-red-600 text-white text-xs rounded-full">
                RMS API
              </span>
            </div>
          </div>
          <div className="p-6">
            <div className="grid gap-4 md:grid-cols-2">
              {/* Service Secret */}
              <SecretInput
                id="rakuten-service-secret"
                label="serviceSecret (サービスシークレット)"
                value={credentials.rakuten.serviceSecret}
                onChange={(v) => handleRakutenChange("serviceSecret", v)}
                showKey="serviceSecret"
                placeholder="サービスシークレットを入力"
              />

              {/* License Key */}
              <SecretInput
                id="rakuten-license-key"
                label="licenseKey (ライセンスキー)"
                value={credentials.rakuten.licenseKey}
                onChange={(v) => handleRakutenChange("licenseKey", v)}
                showKey="licenseKey"
                placeholder="ライセンスキーを入力"
              />
            </div>

            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 mt-4">
              <p className="font-medium mb-1">RMS API認証情報の取得方法:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>RMS (楽天市場店舗管理システム) にログイン</li>
                <li>店舗様向け情報・サービス → 6:WEB APIサービス</li>
                <li>サービスシークレットとライセンスキーを取得</li>
              </ol>
            </div>
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
          <div className="p-6">
            <div className="max-w-md">
              <SecretInput
                id="qoo10-apikey"
                label="APIキー"
                value={credentials.qoo10.apiKey}
                onChange={handleQoo10Change}
                showKey="qoo10ApiKey"
                placeholder="Qoo10 APIキーを入力"
              />
            </div>

            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 mt-4">
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
