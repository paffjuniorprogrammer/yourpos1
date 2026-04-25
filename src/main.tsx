import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { NotificationProvider } from "./context/NotificationContext";
import { PosDataProvider } from "./context/PosDataContext";
import "./styles/index.css";
import "./i18n";


ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <NotificationProvider>
      <AuthProvider>
        <PosDataProvider>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <App />
          </BrowserRouter>
        </PosDataProvider>
      </AuthProvider>
    </NotificationProvider>
  </React.StrictMode>,
);
