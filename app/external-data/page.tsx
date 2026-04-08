"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, AlertCircle, CheckCircle, X, ChevronDown } from "lucide-react";
import AccountTable from "./components/AccountTable";
import AccountRegistrationModal from "./components/AccountRegistrationModal";

const BACKEND_URL = "https://mall-batch-manager-backend-983678294034.asia-northeast1.run.app";

// プラットフォーム種別
type Platform = "tiktok" | "instagram";

// 共通アカウント型（TikTok/Instagram両対応）
type AccountData = {
  id: string;
  productId: string;
  productName: string;
  userName: string;
  accountId: string;
  avatarUrl: string;
  device: string;
  email: string;
  password: string;
  profileUrl: string;
  operator: string;
  accessToken: string;
  refreshToken?: string;
  tiktokUserId?: string;
  accessTokenExpiresAt: string | null;
  connectedAt: string | null;
  updatedAt: string | null;
};

// 通知型
type Notification = {
  type: "success" | "error";
  message: string;
};

// TikTokレスポンスを共通型に変換
function normalizeTikTokAccount(a: Record<string, unknown>): AccountData {
  return {
    id: a.id as string,
    productId: a.productId as string || "",
    productName: a.productName as string || "",
    userName: a.tiktokUserName as string || "",
    accountId: a.tiktokAccountId as string || "",
    avatarUrl: a.tiktokAvatarUrl as string || "",
    device: a.device as string || "",
    email: a.email as string || "",
    password: a.password as string || "",
    profileUrl: a.profileUrl as string || "",
    operator: a.operator as string || "",
    accessToken: a.accessToken as string || "",
    refreshToken: a.refreshToken as string || "",
    tiktokUserId: a.tiktokUserId as string || "",
    accessTokenExpiresAt: a.accessTokenExpiresAt as string | null,
    connectedAt: a.connectedAt as string | null,
    updatedAt: a.updatedAt as string | null,
  };
}

// Instagramレスポンスを共通型に変換
function normalizeInstagramAccount(a: Record<string, unknown>): AccountData {
  return {
    id: a.id as string,
    productId: a.productId as string || "",
    productName: a.productName as string || "",
    userName: a.userName as string || "",
    accountId: a.accountId as string || "",
    avatarUrl: a.avatarUrl as string || "",
    device: a.device as string || "",
    email: a.email as string || "",
    password: a.password as string || "",
    profileUrl: a.profileUrl as string || "",
    operator: a.operator as string || "",
    accessToken: a.accessToken as string || "",
    accessTokenExpiresAt: a.accessTokenExpiresAt as string | null,
    connectedAt: a.connectedAt as string | null,
    updatedAt: a.updatedAt as string | null,
  };
}

export default function AccountListPage() {
  const [platform, setPlatform] = useState<Platform>("tiktok");
  const [accounts, setAccounts] = useState<AccountData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [notification, setNotification] = useState<Notification | null>(null);

  // 全アカウント取得
  const fetchAccounts = useCallback(async () => {
    setIsLoading(true);
    try {
      const endpoint = platform === "tiktok" ? "/tiktok/all-accounts" : "/instagram/all-accounts";
      const response = await fetch(`${BACKEND_URL}${endpoint}`);
      const data = await response.json();
      if (data.success) {
        const normalized = data.accounts.map((a: Record<string, unknown>) =>
          platform === "tiktok" ? normalizeTikTokAccount(a) : normalizeInstagramAccount(a)
        );
        setAccounts(normalized);
      } else {
        setNotification({ type: "error", message: "アカウント一覧の取得に失敗しました" });
      }
    } catch (error) {
      setNotification({ type: "error", message: "サーバーに接続できません" });
    } finally {
      setIsLoading(false);
    }
  }, [platform]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // Instagram OAuth成功/エラーのURLパラメータ処理
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("igSuccess") === "true") {
      setPlatform("instagram");
      setNotification({ type: "success", message: "Instagramアカウントを連携しました" });
      window.history.replaceState({}, "", "/external-data");
    } else if (params.get("igError")) {
      setPlatform("instagram");
      setNotification({ type: "error", message: `Instagram認証エラー: ${params.get("igError")}` });
      window.history.replaceState({}, "", "/external-data");
    }
  }, []);

  // 通知の自動消去
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), 5000);
    return () => clearTimeout(timer);
  }, [notification]);

  // トークンリフレッシュ
  const handleRefreshToken = async (accountId: string) => {
    try {
      const response = await fetch(`${BACKEND_URL}/${platform}/accounts/${accountId}/refresh`, {
        method: "POST",
      });
      const data = await response.json();
      if (data.success) {
        setNotification({ type: "success", message: "トークンをリフレッシュしました" });
        await fetchAccounts();
      } else {
        setNotification({ type: "error", message: data.message || "Token refresh failed" });
      }
    } catch (error) {
      setNotification({ type: "error", message: "サーバーに接続できません" });
    }
  };

  // アカウント削除
  const handleDelete = async (accountId: string, accountName: string) => {
    try {
      const response = await fetch(`${BACKEND_URL}/${platform}/accounts/${accountId}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (data.success) {
        setNotification({ type: "success", message: `${accountName} を削除しました` });
        setAccounts(prev => prev.filter(a => a.id !== accountId));
      } else {
        setNotification({ type: "error", message: data.message || "Deletion failed" });
      }
    } catch (error) {
      setNotification({ type: "error", message: "サーバーに接続できません" });
    }
  };

  // 登録完了時
  const handleRegistered = () => {
    setNotification({ type: "success", message: "アカウントを登録しました" });
    fetchAccounts();
  };

  const platformLabel = platform === "tiktok" ? "TikTok" : "Instagram";

  return (
    <div className="p-6 md:p-8 max-w-[1400px] mx-auto">
      {/* 通知 */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg ${
          notification.type === "success" ? "bg-green-500 text-white" : "bg-red-500 text-white"
        }`}>
          {notification.type === "success" ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span className="text-sm">{notification.message}</span>
          <button onClick={() => setNotification(null)} className="ml-2 hover:opacity-80">
            <X size={16} />
          </button>
        </div>
      )}

      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">アカウントリスト</h1>
            <p className="text-sm text-gray-500 mt-1">{platformLabel}アカウントの管理・登録</p>
          </div>
          {/* プラットフォーム切替 */}
          <select
            value={platform}
            onChange={e => setPlatform(e.target.value as Platform)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="tiktok">TikTok</option>
            <option value="instagram">Instagram</option>
          </select>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus size={18} />
          <span className="text-sm font-medium">アカウント登録</span>
        </button>
      </div>

      {/* テーブル */}
      <AccountTable
        accounts={accounts}
        isLoading={isLoading}
        platform={platform}
        onRefreshToken={handleRefreshToken}
        onDelete={handleDelete}
        onUpdated={fetchAccounts}
      />

      {/* 登録モーダル */}
      <AccountRegistrationModal
        isOpen={isModalOpen}
        platform={platform}
        onClose={() => setIsModalOpen(false)}
        onRegistered={handleRegistered}
      />
    </div>
  );
}
