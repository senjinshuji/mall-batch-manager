"use client";

import { useState } from "react";
import { Save, Eye, EyeOff } from "lucide-react";

type MallCredentials = {
  id: string;
  password: string;
};

type Credentials = {
  amazon: MallCredentials;
  rakuten: MallCredentials;
  qoo10: MallCredentials;
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

export default function SettingsPage() {
  const [credentials, setCredentials] = useState<Credentials>({
    amazon: { id: "", password: "" },
    rakuten: { id: "", password: "" },
    qoo10: { id: "", password: "" },
  });

  const [showPasswords, setShowPasswords] = useState({
    amazon: false,
    rakuten: false,
    qoo10: false,
  });

  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const handleChange = (
    mall: keyof Credentials,
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

  const togglePasswordVisibility = (mall: keyof typeof showPasswords) => {
    setShowPasswords((prev) => ({
      ...prev,
      [mall]: !prev[mall],
    }));
  };

  const handleSave = () => {
    console.log("保存されたクレデンシャル:", credentials);
    setSaveStatus("保存しました（デモモード）");
    setTimeout(() => setSaveStatus(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* ページタイトル */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">媒体設定</h1>
        <p className="text-gray-600 mt-1">
          各モールのログイン情報を登録してください
        </p>
      </div>

      {/* 注意書き */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-yellow-800 text-sm">
          ※ フェーズ1（デモモード）: 入力したID/パスワードはコンソールに出力されるのみで、実際には保存されません。
        </p>
      </div>

      {/* モール設定カード */}
      <div className="grid gap-6 md:grid-cols-3">
        {(Object.keys(MALL_INFO) as Array<keyof typeof MALL_INFO>).map(
          (mall) => {
            const info = MALL_INFO[mall];
            return (
              <div
                key={mall}
                className={`bg-white rounded-xl shadow-sm border-2 ${info.borderColor} overflow-hidden`}
              >
                {/* カードヘッダー */}
                <div
                  className={`${info.bgColor} px-6 py-4 border-b ${info.borderColor}`}
                >
                  <h3
                    className="text-lg font-bold"
                    style={{ color: info.color }}
                  >
                    {info.name}
                  </h3>
                </div>

                {/* カードボディ */}
                <div className="p-6 space-y-4">
                  {/* ID入力 */}
                  <div>
                    <label
                      htmlFor={`${mall}-id`}
                      className="block text-sm font-medium text-gray-600 mb-1"
                    >
                      ID
                    </label>
                    <input
                      type="text"
                      id={`${mall}-id`}
                      value={credentials[mall].id}
                      onChange={(e) =>
                        handleChange(mall, "id", e.target.value)
                      }
                      placeholder="ログインIDを入力"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>

                  {/* パスワード入力 */}
                  <div>
                    <label
                      htmlFor={`${mall}-password`}
                      className="block text-sm font-medium text-gray-600 mb-1"
                    >
                      パスワード
                    </label>
                    <div className="relative">
                      <input
                        type={showPasswords[mall] ? "text" : "password"}
                        id={`${mall}-password`}
                        value={credentials[mall].password}
                        onChange={(e) =>
                          handleChange(mall, "password", e.target.value)
                        }
                        placeholder="パスワードを入力"
                        className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => togglePasswordVisibility(mall)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPasswords[mall] ? (
                          <EyeOff size={18} />
                        ) : (
                          <Eye size={18} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          }
        )}
      </div>

      {/* 保存ボタン */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          <Save size={20} />
          保存
        </button>
        {saveStatus && (
          <span className="text-green-600 font-medium">{saveStatus}</span>
        )}
      </div>
    </div>
  );
}
