"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
      Switch to {theme === "dark" ? "light" : "dark"}
    </button>
  );
}
