import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { APP_CONFIG } from "./config";
import "./index.css";

document.title = APP_CONFIG.name;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
