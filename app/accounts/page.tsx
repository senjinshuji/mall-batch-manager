"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  updateDoc,
  doc,
  query,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { UserCog, Plus, Trash2, Edit2, X, Check, Eye, EyeOff } from "lucide-react";

interface ClientAccount {
  id: string;
  loginId: string;
  password: string;
  name: string;
  allowedProductIds: string[];
  createdAt?: Timestamp;
}

interface RegisteredProduct {
  id: string;
  productName: string;
  skuName?: string;
}

export default function AccountsPage() {
  const { isAdmin, isAuthLoading } = useAuth();
  const router = useRouter();
  const [accounts, setAccounts] = useState<ClientAccount[]>([]);
  const [products, setProducts] = useState<RegisteredProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ loginId: "", password: "", name: "" });
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());

  // admin以外はリダイレクト
  useEffect(() => {
    if (!isAuthLoading && !isAdmin) {
      router.push("/dashboard");
    }
  }, [isAdmin, isAuthLoading, router]);

  // アカウント一覧と商品一覧を取得
  useEffect(() => {
    if (!isAdmin) return;

    const fetchData = async () => {
      try {
        const [accountsSnap, productsSnap] = await Promise.all([
          getDocs(collection(db, "client_accounts")),
          getDocs(query(collection(db, "registered_products"), orderBy("createdAt", "desc"))),
        ]);

        setAccounts(
          accountsSnap.docs.map((d) => ({
            id: d.id,
            loginId: d.data().loginId || "",
            password: d.data().password || "",
            name: d.data().name || "",
            allowedProductIds: d.data().allowedProductIds || [],
            createdAt: d.data().createdAt,
          }))
        );

        setProducts(
          productsSnap.docs.map((d) => ({
            id: d.id,
            productName: d.data().productName || "",
            skuName: d.data().skuName || "",
          }))
        );
      } catch (err) {
        console.error("データ取得エラー:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isAdmin]);

  const resetForm = () => {
    setFormData({ loginId: "", password: "", name: "" });
    setSelectedProductIds(new Set());
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (account: ClientAccount) => {
    setFormData({ loginId: account.loginId, password: account.password, name: account.name });
    setSelectedProductIds(new Set(account.allowedProductIds));
    setEditingId(account.id);
    setShowForm(true);
  };

  const toggleProduct = (productId: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!formData.loginId || !formData.password || !formData.name) return;
    setSaving(true);

    try {
      const data = {
        loginId: formData.loginId,
        password: formData.password,
        name: formData.name,
        allowedProductIds: Array.from(selectedProductIds),
      };

      if (editingId) {
        await updateDoc(doc(db, "client_accounts", editingId), data);
        setAccounts((prev) =>
          prev.map((a) => (a.id === editingId ? { ...a, ...data } : a))
        );
      } else {
        const docRef = await addDoc(collection(db, "client_accounts"), {
          ...data,
          createdAt: Timestamp.now(),
        });
        setAccounts((prev) => [
          { id: docRef.id, ...data, createdAt: Timestamp.now() },
          ...prev,
        ]);
      }
      resetForm();
    } catch (err) {
      console.error("保存エラー:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("このクライアントを削除しますか？")) return;
    try {
      await deleteDoc(doc(db, "client_accounts", id));
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error("削除エラー:", err);
    }
  };

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getProductLabel = (productId: string) => {
    const p = products.find((pr) => pr.id === productId);
    if (!p) return productId;
    return p.skuName ? `${p.productName}（${p.skuName}）` : p.productName;
  };

  if (isAuthLoading || !isAdmin) return null;

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <UserCog className="text-blue-600" size={28} />
          <h1 className="text-2xl font-bold text-gray-800">マスター機能</h1>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={18} />
          新規クライアント
        </button>
      </div>

      {/* 新規・編集フォーム */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">
            {editingId ? "クライアント編集" : "新規クライアント作成"}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">表示名</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="クライアント名"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">ID</label>
              <input
                type="text"
                value={formData.loginId}
                onChange={(e) => setFormData({ ...formData, loginId: e.target.value })}
                placeholder="ログインID"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">パスワード</label>
              <input
                type="text"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="パスワード"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          {/* 商品選択 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-600 mb-2">
              表示可能な商品（{selectedProductIds.size}件選択中）
            </label>
            {products.length === 0 ? (
              <p className="text-sm text-gray-400">登録済み商品がありません</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-60 overflow-y-auto border rounded-lg p-3">
                {products.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedProductIds.has(p.id)}
                      onChange={() => toggleProduct(p.id)}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">
                      {p.skuName ? `${p.productName}（${p.skuName}）` : p.productName}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !formData.loginId || !formData.password || !formData.name}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check size={18} />
              {saving ? "保存中..." : "保存"}
            </button>
            <button
              onClick={resetForm}
              className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              <X size={18} />
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* クライアント一覧 */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
          <UserCog className="mx-auto text-gray-300 mb-4" size={48} />
          <p className="text-gray-500">クライアントがまだ登録されていません</p>
          <p className="text-gray-400 text-sm mt-1">「新規クライアント」ボタンから作成してください</p>
        </div>
      ) : (
        <div className="space-y-4">
          {accounts.map((account) => (
            <div key={account.id} className="bg-white rounded-xl shadow-sm border p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-bold text-gray-800">{account.name}</h3>
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                      クライアント
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600 mb-3">
                    <div>
                      <span className="text-gray-400">ID:</span> {account.loginId}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">パスワード:</span>
                      <span className="font-mono">
                        {visiblePasswords.has(account.id) ? account.password : "••••••••"}
                      </span>
                      <button
                        onClick={() => togglePasswordVisibility(account.id)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        {visiblePasswords.has(account.id) ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                  {/* 割り当て商品 */}
                  <div>
                    <span className="text-xs text-gray-400">表示可能商品:</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {account.allowedProductIds.length === 0 ? (
                        <span className="text-xs text-gray-400">未設定</span>
                      ) : (
                        account.allowedProductIds.map((pid) => (
                          <span
                            key={pid}
                            className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded"
                          >
                            {getProductLabel(pid)}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => startEdit(account)}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(account.id)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
