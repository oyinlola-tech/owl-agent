import React from "react";
import ReactDOM from "react-dom/client";
import "./shared/styles/tokens.style.css";
import { AppRoot } from "./appRoot.component";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppRoot />
  </React.StrictMode>,
);
