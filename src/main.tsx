import "@fontsource/source-sans-pro/latin-400.css";
import "@fontsource/source-sans-pro/latin-600.css";
import "@fontsource/source-sans-pro/latin-700.css";
import "@fontsource/source-sans-pro/latin-900.css";
import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./components/App";

const root = document.getElementById("root");
if (!root) throw new Error("Missing the root element.");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
