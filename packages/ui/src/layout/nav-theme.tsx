import { MoonIcon, SunIcon } from "lucide-react"
// import { useEffect, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { useTheme } from "@workspace/ui/theme-provider"

export const NavTheme = () => {
  // const [mounted, setMounted] = useState(false)
  const { resolvedTheme, setTheme } = useTheme()

  // useEffect(() => {
  //   setMounted(true)
  // }, [])

  // // Prevent SSR flicker and hydration mismatch
  // if (!mounted) {
  //   return <Button className="rounded-full" size="icon" />
  // }

  return (
    <Button
      className="rounded-full"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      size="icon"
      // variant="ghost"
      aria-label="Toggle theme"
    >
      {resolvedTheme === "dark" ? <SunIcon /> : <MoonIcon />}
    </Button>
  )
}
