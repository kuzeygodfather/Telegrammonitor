"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("tg_theme") as "dark" | "light" | null;
    if (saved) {
      setTheme(saved);
      document.documentElement.setAttribute("data-theme", saved);
    }
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("tg_theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };

  if (!mounted) return null;

  return (
    <button
      onClick={toggle}
      className="p-2 rounded-lg transition-all hover:bg-gray-700/50"
      title={theme === "dark" ? "Acik Tema" : "Koyu Tema"}
    >
      {theme === "dark" ? (
        <Sun className="w-4 h-4 text-gray-400 hover:text-yellow-400 transition-colors" />
      ) : (
        <Moon className="w-4 h-4 text-gray-500 hover:text-blue-400 transition-colors" />
      )}
    </button>
  );
}
