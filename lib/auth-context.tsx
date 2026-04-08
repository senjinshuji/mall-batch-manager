"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";

type UserRole = "admin" | "client" | "demo";

type SalesFormat = "standard" | "unified";

type User = {
  loginId: string;
  isRealDataUser: boolean;
  role: UserRole;
  allowedProductIds?: string[];
  salesFormat?: SalesFormat;
  extraChannels?: string[];
  accountId?: string;
};

type AuthContextType = {
  user: User | null;
  login: (loginId: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isRealDataUser: boolean;
  isAdmin: boolean;
  isAuthLoading: boolean;
  allowedProductIds: string[] | null;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 管理者アカウント
const ADMIN_CREDENTIALS = {
  loginId: "admin",
  password: "senjin4649",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // ページロード時にセッションストレージから復元
  useEffect(() => {
    const storedUser = sessionStorage.getItem("mall_manager_user");
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setIsAuthLoading(false);
  }, []);

  const login = async (loginId: string, password: string): Promise<{ success: boolean; error?: string }> => {
    // 1. 管理者チェック
    if (loginId === ADMIN_CREDENTIALS.loginId && password === ADMIN_CREDENTIALS.password) {
      const newUser: User = { loginId, isRealDataUser: true, role: "admin" };
      setUser(newUser);
      sessionStorage.setItem("mall_manager_user", JSON.stringify(newUser));
      return { success: true };
    }

    // 2. クライアントアカウントをFirestoreで照合
    try {
      const q = query(collection(db, "client_accounts"), where("loginId", "==", loginId));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        const data = doc.data();

        if (data.password !== password) {
          return { success: false, error: "パスワードが正しくありません" };
        }

        const newUser: User = {
          loginId,
          isRealDataUser: true,
          role: "client",
          allowedProductIds: data.allowedProductIds || [],
          salesFormat: data.salesFormat || "standard",
          extraChannels: data.extraChannels || [],
          accountId: doc.id,
        };
        setUser(newUser);
        sessionStorage.setItem("mall_manager_user", JSON.stringify(newUser));
        return { success: true };
      }
    } catch (err) {
      console.error("クライアントアカウント照合エラー:", err);
    }

    // 3. デモユーザー
    const newUser: User = { loginId, isRealDataUser: false, role: "demo" };
    setUser(newUser);
    sessionStorage.setItem("mall_manager_user", JSON.stringify(newUser));
    return { success: true };
  };

  const logout = () => {
    setUser(null);
    sessionStorage.removeItem("mall_manager_user");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        isRealDataUser: user?.isRealDataUser ?? false,
        isAdmin: user?.role === "admin",
        isAuthLoading,
        allowedProductIds: user?.role === "client" ? (user.allowedProductIds ?? []) : null,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
