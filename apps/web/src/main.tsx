import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { AppLayout } from "@workspace/ui/layout/app-layout"

import "@workspace/ui/globals.css"
import { App } from "./App.tsx"
import { ThemeProvider } from "@workspace/ui/theme-provider"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <AppLayout>
        <App />
      </AppLayout>
    </ThemeProvider>
  </StrictMode>
)
