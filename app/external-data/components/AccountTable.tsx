"use client";

import { useState } from "react";
import { Trash2, RefreshCw, ExternalLink, Search, ChevronUp, ChevronDown, Edit2, X, Save } from "lucide-react";

const BACKEND_URL = "https://mall-batch-manager-backend-983678294034.asia-northeast1.run.app";

type Platform = "tiktok" | "instagram";

// 共通アカウント型
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

type SortKey = "userName" | "productName" | "operator" | "accessTokenExpiresAt";
type SortOrder = "asc" | "desc";

type AccountTableProps = {
  accounts: AccountData[];
  isLoading: boolean;
  platform: Platform;
  onRefreshToken: (accountId: string) => Promise<void>;
  onDelete: (accountId: string, accountName: string) => Promise<void>;
  onUpdated: () => void;
};

// URLからアカウントIDを抽出
function extractAccountId(url: string, platform: Platform): string {
  if (platform === "tiktok") {
    const match = url.match(/@([^/?]+)/);
    return match ? match[1] : "";
  }
  const match = url.match(/instagram\.com\/([^/?]+)/);
  return match ? match[1] : "";
}

// トークン有効期限バッジ
function TokenExpiryBadge({ expiresAt }: { expiresAt: string | null }) {
  if (!expiresAt) return <span className="text-xs text-gray-400">未設定</span>;
  const now = new Date();
  const expiry = new Date(expiresAt);
  const diffMs = expiry.getTime() - now.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMs <= 0) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">期限切れ</span>;
  if (diffHours < 24) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">残り{diffHours}時間</span>;
  if (diffDays < 7) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">残り{diffDays}日</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">有効（残り{diffDays}日）</span>;
}

// 編集モーダル
function EditModal({ account, platform, onClose, onSaved }: { account: AccountData; platform: Platform; onClose: () => void; onSaved: () => void }) {
  const [openId, setOpenId] = useState(account.tiktokUserId || "");
  const [accessToken, setAccessToken] = useState(account.accessToken || "");
  const [refreshToken, setRefreshToken] = useState(account.refreshToken || "");
  const [device, setDevice] = useState(account.device);
  const [email, setEmail] = useState(account.email);
  const [password, setPassword] = useState(account.password || "");
  const [operator, setOperator] = useState(account.operator);
  const [profileUrl, setProfileUrl] = useState(account.profileUrl);
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const handleSave = async () => {
    setIsSaving(true);
    setResult(null);
    try {
      const updateData: Record<string, string> = {};
      if (accessToken !== account.accessToken) updateData.accessToken = accessToken;
      if (platform === "tiktok") {
        if (refreshToken !== (account.refreshToken || "")) updateData.refreshToken = refreshToken;
        if (openId !== (account.tiktokUserId || "")) updateData.tiktokUserId = openId;
      }
      if (device !== account.device) updateData.device = device;
      if (email !== account.email) updateData.email = email;
      if (password !== (account.password || "")) updateData.password = password;
      if (operator !== account.operator) updateData.operator = operator;
      if (profileUrl !== account.profileUrl) updateData.profileUrl = profileUrl;

      if (Object.keys(updateData).length > 0) {
        const res = await fetch(`${BACKEND_URL}/${platform}/accounts/${account.id}/tokens`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updateData),
        });
        const resData = await res.json();
        if (!resData.success) {
          setResult({ type: "error", message: resData.message || "Update failed" });
          setIsSaving(false);
          return;
        }
      }
      setResult({ type: "success", message: "更新しました" });
      onSaved();
    } catch (error) {
      setResult({ type: "error", message: "Server connection failed" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-3">
            {account.avatarUrl ? (
              <img src={account.avatarUrl} alt="" className="w-10 h-10 rounded-full" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500">
                {account.userName.charAt(0)}
              </div>
            )}
            <div>
              <h2 className="text-lg font-bold">{account.userName}</h2>
              <p className="text-xs text-gray-500">{account.productName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4">
          {result && (
            <div className={`p-3 rounded-lg text-sm ${result.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
              {result.message}
            </div>
          )}

          {/* オープンID（TikTokのみ） */}
          {platform === "tiktok" && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">オープンID</label>
              <input type="text" value={openId} onChange={e => setOpenId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
          )}

          {/* トークン */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Access Token</label>
            <input type="text" value={accessToken} onChange={e => setAccessToken(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          </div>
          {platform === "tiktok" && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Refresh Token</label>
              <input type="text" value={refreshToken} onChange={e => setRefreshToken(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
          )}
          <div className="flex gap-4 text-xs text-gray-500">
            <div><span className="font-medium">AT期限: </span><TokenExpiryBadge expiresAt={account.accessTokenExpiresAt} /></div>
          </div>

          <div className="border-t pt-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">端末</label>
                <input type="text" value={device} onChange={e => setDevice(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">運用者</label>
                <input type="text" value={operator} onChange={e => setOperator(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">メアド</label>
                <input type="text" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">パスワード</label>
                <input type="text" value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">プロフィールURL</label>
                <input type="text" value={profileUrl} onChange={e => setProfileUrl(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 p-5 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">閉じる</button>
          <button onClick={handleSave} disabled={isSaving}
            className="flex items-center gap-1 px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
            <Save size={14} />{isSaving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AccountTable({ accounts, isLoading, platform, onRefreshToken, onDelete, onUpdated }: AccountTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("userName");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingAccount, setEditingAccount] = useState<AccountData | null>(null);

  const filteredAccounts = accounts.filter(account => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      account.userName.toLowerCase().includes(q) ||
      account.accountId.toLowerCase().includes(q) ||
      account.productName.toLowerCase().includes(q) ||
      account.operator.toLowerCase().includes(q) ||
      account.email.toLowerCase().includes(q)
    );
  });

  const sortedAccounts = [...filteredAccounts].sort((a, b) => {
    const aVal = a[sortKey] ?? "";
    const bVal = b[sortKey] ?? "";
    const cmp = String(aVal).localeCompare(String(bVal), "ja");
    return sortOrder === "asc" ? cmp : -cmp;
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortOrder(prev => (prev === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortOrder("asc"); }
  };

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortKey !== columnKey) return null;
    return sortOrder === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
  };

  const handleRefresh = async (accountId: string) => {
    setRefreshingId(accountId);
    try { await onRefreshToken(accountId); } finally { setRefreshingId(null); }
  };

  const handleDelete = async (account: AccountData) => {
    if (!confirm(`${account.userName} を削除しますか？`)) return;
    setDeletingId(account.id);
    try { await onDelete(account.id, account.userName); } finally { setDeletingId(null); }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
        <div className="animate-spin inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mb-4" />
        <p className="text-gray-500">アカウント情報を読み込み中...</p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input type="text" placeholder="アカウント名、商材名、運用者で検索..."
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" />
          </div>
          <p className="text-xs text-gray-500 mt-2">{filteredAccounts.length} / {accounts.length} 件表示</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-3 py-3 font-medium text-gray-600 cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                  onClick={() => handleSort("userName")}>
                  <span className="flex items-center gap-1">アカウント名 <SortIcon columnKey="userName" /></span>
                </th>
                <th className="text-left px-3 py-3 font-medium text-gray-600 whitespace-nowrap">アカウントID</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600 cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                  onClick={() => handleSort("productName")}>
                  <span className="flex items-center gap-1">商材名 <SortIcon columnKey="productName" /></span>
                </th>
                <th className="text-left px-3 py-3 font-medium text-gray-600 whitespace-nowrap">端末</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600 whitespace-nowrap">URL</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600 whitespace-nowrap">メアド</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600 whitespace-nowrap">PW</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600 cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                  onClick={() => handleSort("operator")}>
                  <span className="flex items-center gap-1">運用者 <SortIcon columnKey="operator" /></span>
                </th>
                <th className="text-left px-3 py-3 font-medium text-gray-600 cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                  onClick={() => handleSort("accessTokenExpiresAt")}>
                  <span className="flex items-center gap-1">AT期限 <SortIcon columnKey="accessTokenExpiresAt" /></span>
                </th>
                <th className="text-center px-3 py-3 font-medium text-gray-600 whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              {sortedAccounts.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-500">
                    {searchQuery ? "検索結果がありません" : "アカウントが登録されていません"}
                  </td>
                </tr>
              ) : (
                sortedAccounts.map(account => {
                  const displayAccountId = account.accountId || extractAccountId(account.profileUrl, platform);
                  return (
                    <tr key={account.id} className="border-b hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {account.avatarUrl ? (
                            <img src={account.avatarUrl} alt={account.userName} className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs">
                              {account.userName.charAt(0)}
                            </div>
                          )}
                          <span className="font-medium">{account.userName}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-gray-600">
                        {displayAccountId ? `@${displayAccountId}` : "-"}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">{account.productName || "-"}</td>
                      <td className="px-3 py-3 whitespace-nowrap text-gray-600">{account.device || "-"}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {account.profileUrl ? (
                          <a href={account.profileUrl.startsWith("http") ? account.profileUrl : `https://${account.profileUrl}`}
                            target="_blank" rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 flex items-center gap-1">
                            <ExternalLink size={14} />
                            <span className="max-w-[100px] truncate">{account.profileUrl.replace(/https?:\/\/(www\.)?/, "")}</span>
                          </a>
                        ) : <span className="text-gray-400">-</span>}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-gray-600 max-w-[120px] truncate">{account.email || "-"}</td>
                      <td className="px-3 py-3 whitespace-nowrap text-gray-600 max-w-[80px] truncate">{account.password || "-"}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{account.operator || "-"}</td>
                      <td className="px-3 py-3 whitespace-nowrap"><TokenExpiryBadge expiresAt={account.accessTokenExpiresAt} /></td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setEditingAccount(account)}
                            className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" title="編集">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => handleRefresh(account.id)} disabled={refreshingId === account.id}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50" title="トークンリフレッシュ">
                            <RefreshCw size={16} className={refreshingId === account.id ? "animate-spin" : ""} />
                          </button>
                          <button onClick={() => handleDelete(account)} disabled={deletingId === account.id}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50" title="削除">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editingAccount && (
        <EditModal account={editingAccount} platform={platform} onClose={() => setEditingAccount(null)}
          onSaved={() => { setEditingAccount(null); onUpdated(); }} />
      )}
    </>
  );
}
