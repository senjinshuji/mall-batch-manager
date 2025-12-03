"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type User = {
  email: string;
  isRealDataUser: boolean;
};

type AuthContextType = {
  user: User | null;
  login: (email: string, password: string) => boolean;
  logout: () => void;
  isRealDataUser: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 実データを表示するユーザー
const REAL_DATA_CREDENTIALS = {
  email: "yoh.masuda@senjinholdings.com",
  password: "senjin4649",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  // ページロード時にセッションストレージから復元
  useEffect(() => {
    const storedUser = sessionStorage.getItem("mall_manager_user");
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const login = (email: string, password: string): boolean => {
    const isRealDataUser =
      email === REAL_DATA_CREDENTIALS.email &&
      password === REAL_DATA_CREDENTIALS.password;

    const newUser: User = {
      email,
      isRealDataUser,
    };

    setUser(newUser);
    sessionStorage.setItem("mall_manager_user", JSON.stringify(newUser));
    return true;
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
