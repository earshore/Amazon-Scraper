import { useTheme } from "./hooks/useTheme";
import ScraperPage from "./ScraperPage";

export default function App() {
  const { theme, toggleTheme } = useTheme();

  return <ScraperPage theme={theme} onToggleTheme={toggleTheme} />;
}
