import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { AuthProvider } from "./features/auth/AuthProvider.jsx";
import { ThemeProvider } from "./features/theme/ThemeProvider.jsx";
import { ToastProvider } from "./features/toasts/ToastProvider.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
);
