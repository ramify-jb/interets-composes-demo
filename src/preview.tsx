import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CompoundInterestSimulator } from "./components/CompoundInterestSimulator";
import "./globals.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <main
      style={{
        maxWidth: "1200px",
        margin: "40px auto",
        padding: "0 20px",
        fontFamily:
          '"PP Fragment Sans Regular", "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif',
        color: "#1e1e1e",
      }}
    >
      <h1 style={{ fontSize: "1.6rem", marginBottom: "1.5rem" }}>Preview local - Simulateur intérêts composés</h1>
      <CompoundInterestSimulator />
    </main>
  </StrictMode>,
);
