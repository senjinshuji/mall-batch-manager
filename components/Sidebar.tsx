"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Settings, LogOut, Menu, X, Package } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const menuItems = [
  {
    name: "ダッシュボード",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    name: "商品登録",
    href: "/products",
    icon: Package,
  },
  {
    name: "媒体設定",
    href: "/settings",
    icon: Settings,
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    router.push("/");
  };

  return (
    <>
      {/* モバイル用ハンバーガーメニューボタン */}
      <button
        className="fixed top-4 left-4 z-50 p-2 bg-gray-800 text-white rounded-lg md:hidden"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      >
        {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* オーバーレイ（モバイル時） */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* サイドバー */}
      <aside
        className={cn(
          "fixed top-0 left-0 h-full w-64 bg-gray-900 text-white z-40 transform transition-transform duration-300 ease-in-out",
          "md:translate-x-0",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* タイトル */}
        <div className="p-6 border-b border-gray-700">
          <h1 className="text-xl font-bold text-center">
            モール一括管理くん
          </h1>
        </div>

        {/* ナビゲーションメニュー */}
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                      isActive
                        ? "bg-blue-600 text-white"
                        : "text-gray-300 hover:bg-gray-800 hover:text-white"
                    )}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <Icon size={20} />
                    <span>{item.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* ログアウトボタン */}
        <div className="p-4 border-t border-gray-700">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 w-full text-gray-300 hover:bg-gray-800 hover:text-white rounded-lg transition-colors"
          >
            <LogOut size={20} />
            <span>ログアウト</span>
          </button>
        </div>
      </aside>
    </>
  );
}
