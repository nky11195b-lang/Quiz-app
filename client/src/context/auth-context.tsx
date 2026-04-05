import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { authFetch, ACCESS_TOKEN_KEY } from "@/lib/auth-fetch";

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  coins: number;
  totalScore: number;
  aiUsageCount: number;
};

type AuthContextType = {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(ACCESS_TOKEN_KEY));
  const [isLoading, setIsLoading] = useState(true);
  const [, navigate] = useLocation();

  const saveToken = (t: string) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, t);
    setToken(t);
  };

  const clearAuth = useCallback(() => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const t = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!t) {
      // No access token — try the refresh cookie silently
      try {
        const refreshRes = await fetch("/api/auth/refresh", {
          method: "POST",
          credentials: "include",
        });
        if (!refreshRes.ok) { setIsLoading(false); return; }
        const data = await refreshRes.json();
        saveToken(data.accessToken);
      } catch {
        setIsLoading(false);
        return;
      }
    }

    // Now we should have a valid access token (either existing or just refreshed)
    try {
      const res = await authFetch("/api/auth/me");
      if (!res.ok) {
        clearAuth();
        setIsLoading(false);
        return;
      }
      const u = await res.json();
      setUser(u);
      setToken(localStorage.getItem(ACCESS_TOKEN_KEY));
    } catch {
      clearAuth();
    } finally {
      setIsLoading(false);
    }
  }, [clearAuth]);

  // Bootstrap — run once on mount.
  // First check for ?token= in the URL (set after Google OAuth redirect).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");
    if (urlToken) {
      localStorage.setItem(ACCESS_TOKEN_KEY, urlToken);
      setToken(urlToken);
      // Clean the token out of the URL without a full reload
      params.delete("token");
      const clean = params.toString();
      const newUrl = window.location.pathname + (clean ? `?${clean}` : "");
      window.history.replaceState({}, "", newUrl);
    }
    refreshUser();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for token rotation events fired by authFetch
  useEffect(() => {
    const onRefreshed = (e: Event) => {
      const newToken = (e as CustomEvent<string>).detail;
      setToken(newToken);
    };
    const onLogoutRequired = () => {
      clearAuth();
      navigate("/auth");
    };
    window.addEventListener("token-refreshed", onRefreshed);
    window.addEventListener("auth-logout-required", onLogoutRequired);
    return () => {
      window.removeEventListener("token-refreshed", onRefreshed);
      window.removeEventListener("auth-logout-required", onLogoutRequired);
    };
  }, [clearAuth, navigate]);

  const login = async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      credentials: "include",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Login failed");
    saveToken(data.accessToken);
    setUser(data.user);
    navigate("/");
  };

  const signup = async (name: string, email: string, password: string) => {
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
      credentials: "include",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Signup failed");
    saveToken(data.accessToken);
    setUser(data.user);
    navigate("/");
  };

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch { /* best-effort — clear local state regardless */ }
    clearAuth();
    navigate("/auth");
  }, [clearAuth, navigate]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, signup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
