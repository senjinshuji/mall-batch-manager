"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, Mail, Lock, Store } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // ダミーのログイン処理（少し待機してから遷移）
    await new Promise((resolve) => setTimeout(resolve, 500));

    console.log("ログイン情報:", { email, password });
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* ロゴ・タイトルエリア */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl shadow-lg mb-4">
            <Store className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-white">
            モール一括管理くん
          </h1>
          <p className="text-blue-100 mt-2">
            Amazon・楽天・Qoo10の売上を一元管理
          </p>
        </div>

        {/* ログインカード */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-xl font-bold text-gray-800 text-center mb-6">
            ログイン
          </h2>

          <form onSubmit={handleLogin} className="space-y-5">
            {/* メールアドレス */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-600 mb-1"
              >
                メールアドレス
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                  <Mail size={18} />
                </div>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@mail.com"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  required
                />
              </div>
            </div>

            {/* パスワード */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-600 mb-1"
              >
                パスワード
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                  <Lock size={18} />
                </div>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="パスワードを入力"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  required
                />
              </div>
            </div>

            {/* ログインボタン */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn size={18} />
                  ログイン
                </>
              )}
            </button>
          </form>

          {/* デモモード注記 */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500 text-center">
              ※ デモモード: 任意のメールアドレス・パスワードでログインできます
            </p>
          </div>
        </div>

        {/* フッター */}
        <p className="text-center text-blue-100 text-sm mt-6">
          &copy; 2024 モール一括管理くん
        </p>
      </div>
    </div>
  );
}
