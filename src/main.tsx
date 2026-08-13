import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CleanupApp } from "../app/CleanupApp";
import "../app/globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("アプリの表示先が見つかりません。");
}

createRoot(root).render(
  <StrictMode>
    <CleanupApp />
  </StrictMode>,
);
