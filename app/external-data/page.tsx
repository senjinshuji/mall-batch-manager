"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, AlertCircle, CheckCircle, X } from "lucide-react";
import AccountTable from "./components/AccountTable";
import AccountRegistrationModal from "./components/AccountRegistrationModal";

const BACKEND_URL = "https://mall-batch-manager-backend-983678294034.asia-northeast1.run.app";

// アカウント型定義
type TikTokAccount = {
  id: string;
  productId: string;
  productName: string;
  tiktokUserId: string;
  tiktokUserName: string;
  tiktokAccountId: string;
  tiktokAvatarUrl: string;
  device: string;
  email: string;
  password: string;
  profileUrl: string;
  operator: string;
  accessToken: string;
  refreshToken: string;
  followerCount: number | null;
  likeCount: number | null;
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  connectedAt: string | null;
  updatedAt: string | null;
};

// 通知型
type Notification = {
  type: "success" | "error";
  message: string;
};

export default function AccountListPage() {
  const [accounts, setAccounts] = useState<TikTokAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [notification, setNotification] = useState<Notification | null>(null);

  // 全アカウント取得
  const fetchAccounts = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/tiktok/all-accounts`);
      const data = await response.json();
      if (data.success) {
        setAccounts(data.accounts);
      } else {
        setNotification({ type: "error", message: "アカウント一覧の取得に失敗しました" });
      }
    } catch (error) {
      setNotification({ type: "error", message: "サーバーに接続できません" });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // 通知の自動消去
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), 5000);
    return () => clearTimeout(timer);
  }, [notification]);

  // トークンリフレッシュ
  const handleRefreshToken = async (accountId: string) => {
    try {
      const response = await fetch(`${BACKEND_URL}/tiktok/accounts/${accountId}/refresh`, {
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
      const response = await fetch(`${BACKEND_URL}/tiktok/accounts/${accountId}`, {
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
        <div>
          <h1 className="text-2xl font-bold text-gray-900">アカウントリスト</h1>
          <p className="text-sm text-gray-500 mt-1">TikTokアカウントの管理・登録</p>
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
        onRefreshToken={handleRefreshToken}
        onDelete={handleDelete}
        onUpdated={fetchAccounts}
      />

      {/* 登録モーダル */}
      <AccountRegistrationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onRegistered={handleRegistered}
      />
    </div>
  );
}
