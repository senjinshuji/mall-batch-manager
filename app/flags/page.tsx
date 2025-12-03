"use client";

import { useState, useEffect } from "react";
import { Flag, Plus, Trash2, Edit2, Save, X, Calendar, RefreshCw } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, orderBy } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";

type EventFlag = {
  id: string;
  name: string;
  date: string;
  description: string;
};

// デモ用のフラグデータ
const demoFlags: EventFlag[] = [
  { id: "demo-1", name: "セール開始", date: "2025-11-01", description: "ブラックフライデーセール開始日" },
  { id: "demo-2", name: "新商品発売", date: "2025-11-15", description: "オーガニックシャンプー新発売" },
  { id: "demo-3", name: "広告開始", date: "2025-11-20", description: "TikTok広告キャンペーン開始" },
];

export default function FlagsPage() {
  const { isRealDataUser, isAuthLoading } = useAuth();
  const [flags, setFlags] = useState<EventFlag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [newFlag, setNewFlag] = useState({
    name: "",
    date: "",
    description: "",
  });

  const [editFlag, setEditFlag] = useState({
    name: "",
    date: "",
    description: "",
  });

  // Firestoreからフラグ一覧を取得
  useEffect(() => {
    if (isAuthLoading) return;

    if (!isRealDataUser) {
      setFlags(demoFlags);
      setIsLoading(false);
      return;
    }

    const fetchFlags = async () => {
      setIsLoading(true);
      try {
        // インデックスなしで取得し、クライアント側でソート
        const snapshot = await getDocs(collection(db, "event_flags"));
        const flagsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          name: doc.data().name || "",
          date: doc.data().date || "",
          description: doc.data().description || "",
        })) as EventFlag[];
        // 日付降順でソート
        flagsData.sort((a, b) => b.date.localeCompare(a.date));
        setFlags(flagsData);
      } catch (error) {
        console.error("フラグ取得エラー:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFlags();
  }, [isRealDataUser, isAuthLoading]);

  const handleAddFlag = async () => {
    if (!newFlag.name || !newFlag.date) return;
    setIsSaving(true);

    try {
      if (!isRealDataUser) {
        const flag: EventFlag = {
          id: `demo-${Date.now()}`,
          ...newFlag,
        };
        setFlags([flag, ...flags]);
      } else {
        const docRef = await addDoc(collection(db, "event_flags"), {
          ...newFlag,
          createdAt: new Date(),
        });

        const flag: EventFlag = {
          id: docRef.id,
          ...newFlag,
        };
        setFlags([flag, ...flags]);
      }

      setNewFlag({ name: "", date: "", description: "" });
      setIsAdding(false);
    } catch (error) {
      console.error("フラグ登録エラー:", error);
      alert("フラグの登録に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteFlag = async (id: string) => {
    if (!confirm("このフラグを削除しますか？")) return;

    try {
      if (!isRealDataUser) {
        setFlags(flags.filter((f) => f.id !== id));
      } else {
        await deleteDoc(doc(db, "event_flags", id));
        setFlags(flags.filter((f) => f.id !== id));
      }
    } catch (error) {
      console.error("フラグ削除エラー:", error);
      alert("フラグの削除に失敗しました");
    }
  };

  const handleStartEdit = (flag: EventFlag) => {
    setEditingId(flag.id);
    setEditFlag({
      name: flag.name,
      date: flag.date,
      description: flag.description,
    });
  };

  const handleSaveEdit = async (id: string) => {
    setIsSaving(true);
    try {
      if (!isRealDataUser) {
        setFlags(
          flags.map((f) =>
            f.id === id ? { ...f, ...editFlag } : f
          )
        );
      } else {
        await updateDoc(doc(db, "event_flags", id), {
          ...editFlag,
          updatedAt: new Date(),
        });

        setFlags(
          flags.map((f) =>
            f.id === id ? { ...f, ...editFlag } : f
          )
        );
      }
      setEditingId(null);
    } catch (error) {
      console.error("フラグ更新エラー:", error);
      alert("フラグの更新に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-600">読み込み中...</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Flag className="w-8 h-8 text-purple-600" />
          <h1 className="text-2xl font-bold text-gray-800">フラグ登録</h1>
          {!isRealDataUser && (
            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">
              デモモード
            </span>
          )}
        </div>
        <button
          onClick={() => setIsAdding(true)}
          disabled={isAdding}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="w-5 h-5" />
          新規登録
        </button>
      </div>

      <p className="text-gray-600 mb-6">
        イベントやキャンペーンのフラグを登録すると、ダッシュボードのグラフ上に表示されます。
      </p>

      {/* 新規登録フォーム */}
      {isAdding && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">新規フラグ登録</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  イベント名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newFlag.name}
                  onChange={(e) => setNewFlag({ ...newFlag, name: e.target.value })}
                  placeholder="例: セール開始"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  日付 <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={newFlag.date}
                  onChange={(e) => setNewFlag({ ...newFlag, date: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                詳細
              </label>
              <textarea
                value={newFlag.description}
                onChange={(e) => setNewFlag({ ...newFlag, description: e.target.value })}
                placeholder="イベントの詳細説明（任意）"
                rows={3}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleAddFlag}
                disabled={!newFlag.name || !newFlag.date || isSaving}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? "登録中..." : "登録する"}
              </button>
              <button
                onClick={() => {
                  setIsAdding(false);
                  setNewFlag({ name: "", date: "", description: "" });
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* フラグ一覧 */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    日付
                  </span>
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  イベント名
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  詳細
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {flags.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                    登録されているフラグはありません
                  </td>
                </tr>
              ) : (
                flags.map((flag) => (
                  <tr key={flag.id} className="hover:bg-gray-50">
                    {editingId === flag.id ? (
                      <>
                        <td className="px-4 py-3">
                          <input
                            type="date"
                            value={editFlag.date}
                            onChange={(e) => setEditFlag({ ...editFlag, date: e.target.value })}
                            className="w-full px-2 py-1 border rounded focus:ring-2 focus:ring-purple-500"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={editFlag.name}
                            onChange={(e) => setEditFlag({ ...editFlag, name: e.target.value })}
                            className="w-full px-2 py-1 border rounded focus:ring-2 focus:ring-purple-500"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={editFlag.description}
                            onChange={(e) => setEditFlag({ ...editFlag, description: e.target.value })}
                            className="w-full px-2 py-1 border rounded focus:ring-2 focus:ring-purple-500"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => handleSaveEdit(flag.id)}
                              disabled={isSaving}
                              className="p-1 text-green-600 hover:bg-green-100 rounded"
                              title="保存"
                            >
                              <Save className="w-5 h-5" />
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                              title="キャンセル"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {formatDate(flag.date)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
                            <Flag className="w-3 h-3" />
                            {flag.name}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-sm">
                          {flag.description || "-"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => handleStartEdit(flag)}
                              className="p-1 text-blue-600 hover:bg-blue-100 rounded"
                              title="編集"
                            >
                              <Edit2 className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleDeleteFlag(flag.id)}
                              className="p-1 text-red-600 hover:bg-red-100 rounded"
                              title="削除"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
