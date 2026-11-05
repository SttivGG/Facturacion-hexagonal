import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppearanceProvider } from "./appearance";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppearanceProvider>
      <App />
    </AppearanceProvider>
  </StrictMode>,
);
