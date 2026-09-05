import { Outlet, Route, Routes } from "react-router-dom"
import { AppLayout } from "@workspace/ui/layout/app-layout"
import AuthPage from "./pages/auth.tsx"
import { HomePage } from "./pages/home-page.tsx"

export function App() {
  return (
    <Routes>
      <Route
        element={
          <AppLayout>
            <Outlet />
          </AppLayout>
        }
      >
        <Route path="/" element={<HomePage />} />
        <Route path="*" element={<HomePage />} />
      </Route>
      <Route path="/auth" element={<AuthPage />} />
    </Routes>
  )
}
