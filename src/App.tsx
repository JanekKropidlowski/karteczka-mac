import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { register, isRegistered } from "@tauri-apps/plugin-global-shortcut";
import { enable as enableAutostart, isEnabled as autostartEnabled } from "@tauri-apps/plugin-autostart";
import { openUrl } from "@tauri-apps/plugin-opener";

const PANEL_URL = "https://task.kropidlowscy.pl";
const SHORTCUT = "Alt+Space"; // Option+Spacja na macOS

export default function App() {
  const [shortcutOk, setShortcutOk] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      try {
        if (!(await isRegistered(SHORTCUT))) {
          await register(SHORTCUT, async (event) => {
            if (event.state !== "Pressed") return;
            const win = getCurrentWindow();
            if (await win.isVisible()) {
              await win.hide();
            } else {
              await win.show();
              await win.setFocus();
            }
          });
        }
        setShortcutOk(true);
      } catch (e) {
        console.error("global shortcut:", e);
        setShortcutOk(false);
      }
      try {
        if (!(await autostartEnabled())) await enableAutostart();
      } catch (e) {
        console.error("autostart:", e);
      }
    })();
  }, []);

  return (
    <div className="karteczka">
      <header className="titlebar" data-tauri-drag-region>
        <span className="title" data-tauri-drag-region>Karteczka</span>
        <button
          className="hide-btn"
          title="Ukryj (Option+Spacja przywraca)"
          onClick={() => getCurrentWindow().hide()}
        >
          —
        </button>
      </header>

      <main className="content">
        <p className="placeholder">
          Szkielet działa. Logowanie i lista zadań dojdą w następnym kroku.
        </p>
        <p className="hint">
          Option+Spacja chowa i przywołuje karteczkę
          {shortcutOk === false && " (skrót nie zadziałał — zgłoś to)"}.
        </p>
      </main>

      <footer className="footer">
        <button onClick={() => openUrl(PANEL_URL)}>Panel</button>
        <button onClick={() => openUrl(`${PANEL_URL}/kalkulator`)}>Kalkulator</button>
        <button onClick={() => openUrl(`${PANEL_URL}/clients`)}>Klienci</button>
      </footer>
    </div>
  );
}
