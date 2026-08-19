import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { register, isRegistered } from "@tauri-apps/plugin-global-shortcut";
import { enable as enableAutostart, isEnabled as autostartEnabled } from "@tauri-apps/plugin-autostart";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { supabase } from "./lib/supabase";
import { dzisIso, liczbaNaDzis, listaZadan, przeterminowane } from "./lib/data";
import Login from "./components/Login";
import TaskList from "./components/TaskList";
import NotesTab from "./components/NotesTab";

const PANEL_URL = "https://task.kropidlowscy.pl";
const SHORTCUT = "Alt+Space";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState<"zadania" | "notatki">("zadania");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        if (!(await isRegistered(SHORTCUT))) {
          await register(SHORTCUT, async (event) => {
            if (event.state !== "Pressed") return;
            const win = getCurrentWindow();
            if (await win.isVisible()) await win.hide();
            else {
              await win.show();
              await win.setFocus();
            }
          });
        }
      } catch (e) {
        console.error("global shortcut:", e);
      }
      try {
        if (!(await autostartEnabled())) await enableAutostart();
      } catch (e) {
        console.error("autostart:", e);
      }
    })();
  }, []);

  // Poranne powiadomienie systemowe ok. 8:00 (lokalne, zero maili):
  // "X zadan na dzis, Y po terminie". Raz dziennie, tylko gdy jest co pokazac.
  useEffect(() => {
    if (!session) return;
    const sprawdz = async () => {
      const teraz = new Date();
      if (teraz.getHours() !== 8 || teraz.getMinutes() > 4) return;
      if (localStorage.getItem("ostatniePowiadomienie") === dzisIso()) return;
      try {
        let ok = await isPermissionGranted();
        if (!ok) ok = (await requestPermission()) === "granted";
        if (!ok) return;
        const zadania = await listaZadan();
        const naDzis = liczbaNaDzis(zadania);
        const poTerminie = zadania.filter(przeterminowane).length;
        if (naDzis === 0) return;
        localStorage.setItem("ostatniePowiadomienie", dzisIso());
        sendNotification({
          title: "Karteczka",
          body: `${naDzis} zadań na dziś${poTerminie ? `, w tym ${poTerminie} po terminie` : ""}`,
        });
      } catch (e) {
        console.error("powiadomienie:", e);
      }
    };
    sprawdz();
    const t = window.setInterval(sprawdz, 60_000);
    return () => window.clearInterval(t);
  }, [session]);

  const wyloguj = useCallback(() => supabase.auth.signOut(), []);

  return (
    <div className="karteczka">
      <header className="titlebar" data-tauri-drag-region>
        <span className="title" data-tauri-drag-region>
          Karteczka
        </span>
        <div className="titlebar-actions">
          {session && (
            <button className="icon-btn" title="Wyloguj" onClick={wyloguj}>
              ⎋
            </button>
          )}
          <button
            className="icon-btn"
            title="Ukryj (Option+Spacja przywraca)"
            onClick={() => getCurrentWindow().hide()}
          >
            —
          </button>
        </div>
      </header>

      {authLoading ? (
        <main className="content center">
          <span className="muted">Łączenie...</span>
        </main>
      ) : !session ? (
        <Login />
      ) : (
        <>
          <nav className="tabs">
            <button className={tab === "zadania" ? "tab active" : "tab"} onClick={() => setTab("zadania")}>
              Zadania
            </button>
            <button className={tab === "notatki" ? "tab active" : "tab"} onClick={() => setTab("notatki")}>
              Notatki
            </button>
          </nav>
          <main className="content">
            {tab === "zadania" ? (
              <TaskList userId={session.user.id} />
            ) : (
              <NotesTab userId={session.user.id} />
            )}
          </main>
        </>
      )}

      <footer className="footer">
        <button onClick={() => openUrl(PANEL_URL)}>Panel</button>
        <button onClick={() => openUrl(`${PANEL_URL}/kalkulator`)}>Kalkulator</button>
        <button onClick={() => openUrl(`${PANEL_URL}/clients`)}>Klienci</button>
      </footer>
    </div>
  );
}
