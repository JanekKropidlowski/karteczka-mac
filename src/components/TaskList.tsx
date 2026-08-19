import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Klient,
  Podzadanie,
  Zadanie,
  dodajZadanie,
  etykietaTerminu,
  liczbaLzsDoZrobienia,
  liczbaNaDzis,
  listaKlientow,
  listaPodzadan,
  listaZadan,
  nasluchujZmian,
  odhaczPodzadanie,
  odhaczZadanie,
  parsujWpis,
  ustawPriorytet,
  usunZadanie,
  zapiszKolejnosc,
} from "../lib/data";

const POLL_MS = 60_000; // fallback, realtime robi robote na biezaco
const PRIORYTETY = ["zwykłe", "ważne", "PILNE"];
const PANEL_URL = "https://task.kropidlowscy.pl";

export default function TaskList({ userId }: { userId: string }) {
  const [zadania, setZadania] = useState<Zadanie[]>([]);
  const [klienci, setKlienci] = useState<Klient[]>([]);
  const [lzs, setLzs] = useState<number>(0);
  const [podzadania, setPodzadania] = useState<Record<string, Podzadanie[]>>({});
  const [rozwiniete, setRozwiniete] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nowe, setNowe] = useState("");
  const [dlaKogo, setDlaKogo] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const odswiez = useCallback(async () => {
    try {
      const lista = await listaZadan();
      setZadania(lista);
      setError(null);
      invoke("set_tray_count", { count: liczbaNaDzis(lista) }).catch(() => {});
      liczbaLzsDoZrobienia().then(setLzs).catch(() => {});
    } catch (e) {
      setError("Nie udało się pobrać zadań");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    odswiez();
    listaKlientow().then(setKlienci).catch(console.error);
    const stop = nasluchujZmian(["projects", "tasks", "lzs_submissions"], odswiez);
    const timer = window.setInterval(odswiez, POLL_MS);
    const onFocus = () => odswiez();
    window.addEventListener("focus", onFocus);
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      stop();
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("keydown", onKey);
    };
  }, [odswiez]);

  useEffect(() => {
    if (!confirmId) return;
    const t = window.setTimeout(() => setConfirmId(null), 3000);
    return () => window.clearTimeout(t);
  }, [confirmId]);

  // Plynny drag&drop na pointer events (HTML5 DnD w webview jest toporne):
  // lapiesz za uchwyt, wiersze przestawiaja sie na zywo, puszczenie zapisuje.
  const startDrag = (e: React.PointerEvent, id: string) => {
    e.preventDefault();
    setDragId(id);
    const move = (ev: PointerEvent) => {
      const el = document
        .elementFromPoint(ev.clientX, ev.clientY)
        ?.closest("li[data-id]") as HTMLElement | null;
      const overId = el?.dataset.id;
      if (!overId || overId === id) return;
      setZadania((lista) => {
        const from = lista.findIndex((z) => z.id === id);
        const to = lista.findIndex((z) => z.id === overId);
        if (from < 0 || to < 0 || from === to) return lista;
        const kopia = [...lista];
        const [x] = kopia.splice(from, 1);
        kopia.splice(to, 0, x);
        return kopia;
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDragId(null);
      setZadania((lista) => {
        zapiszKolejnosc(lista.map((z) => z.id)).catch(() => odswiez());
        return lista;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const odhacz = async (id: string) => {
    setZadania((z) => z.filter((x) => x.id !== id));
    try {
      await odhaczZadanie(id);
    } catch (e) {
      console.error(e);
      odswiez();
    }
  };

  const usun = async (id: string) => {
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    setConfirmId(null);
    setZadania((z) => z.filter((x) => x.id !== id));
    try {
      await usunZadanie(id);
    } catch (e) {
      console.error(e);
      odswiez();
    }
  };

  const cyklPriorytetu = async (z: Zadanie) => {
    const nowy = ((z.priority ?? 0) + 1) % 3;
    setZadania((lista) =>
      lista.map((x) => (x.id === z.id ? { ...x, priority: nowy } : x))
    );
    try {
      await ustawPriorytet(z.id, nowy);
      odswiez();
    } catch (e) {
      console.error(e);
      odswiez();
    }
  };

  const rozwin = async (id: string) => {
    if (rozwiniete === id) {
      setRozwiniete(null);
      return;
    }
    setRozwiniete(id);
    if (!podzadania[id]) {
      try {
        const p = await listaPodzadan(id);
        setPodzadania((s) => ({ ...s, [id]: p }));
      } catch (e) {
        console.error(e);
      }
    }
  };

  const odhaczPod = async (projectId: string, pod: Podzadanie) => {
    setPodzadania((s) => ({
      ...s,
      [projectId]: s[projectId].map((p) =>
        p.id === pod.id ? { ...p, completed: !p.completed } : p
      ),
    }));
    try {
      await odhaczPodzadanie(pod.id, !pod.completed);
    } catch (e) {
      console.error(e);
    }
  };

  const dodaj = async (e: React.FormEvent) => {
    e.preventDefault();
    const { name, deadline, priority } = parsujWpis(nowe);
    if (!name || busy) return;
    setBusy(true);
    try {
      await dodajZadanie(name, userId, dlaKogo || null, deadline, priority);
      setNowe("");
      setDlaKogo("");
      await odswiez();
    } catch (err) {
      console.error(err);
      setError("Nie udało się dodać zadania");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lista-wrap">
      {error && <p className="error">{error}</p>}
      {loading ? (
        <p className="muted">Ładowanie...</p>
      ) : zadania.length === 0 && lzs === 0 ? (
        <p className="muted empty">Wszystko zrobione 🎉</p>
      ) : (
        <ul className="lista">
          {zadania.map((z) => {
            const termin = etykietaTerminu(z.deadline);
            const pody = podzadania[z.id];
            const otwarte = rozwiniete === z.id;
            return (
              <li
                key={z.id}
                data-id={z.id}
                className={dragId === z.id ? "item dragging" : "item"}
              >
                <div className="item-row">
                  <span
                    className="handle"
                    title="Przeciągnij, aby zmienić kolejność"
                    onPointerDown={(e) => startDrag(e, z.id)}
                  >
                    ⠿
                  </span>
                  <button className="check" title="Zrobione" onClick={() => odhacz(z.id)} />
                  <span className="item-name" title={z.name} onClick={() => rozwin(z.id)}>
                    {z.name}
                  </span>
                  {z.clients?.name && <span className="chip">{z.clients.name}</span>}
                  {termin && (
                    <span className={termin.overdue ? "chip chip-red" : "chip"}>
                      {termin.text}
                    </span>
                  )}
                  <button
                    className={`prio-dot p${z.priority ?? 0}`}
                    title={`Priorytet: ${PRIORYTETY[z.priority ?? 0]} (klik zmienia)`}
                    onClick={() => cyklPriorytetu(z)}
                  />
                  <button
                    className={confirmId === z.id ? "trash confirm" : "trash"}
                    title={confirmId === z.id ? "Kliknij ponownie" : "Usuń (do Archiwum)"}
                    onClick={() => usun(z.id)}
                  >
                    {confirmId === z.id ? "?" : "×"}
                  </button>
                </div>
                {otwarte && (
                  <ul className="podzadania">
                    {!pody ? (
                      <li className="muted">Ładowanie...</li>
                    ) : pody.length === 0 ? (
                      <li className="muted">Brak podzadań</li>
                    ) : (
                      pody.map((p) => (
                        <li key={p.id} className={p.completed ? "pod done" : "pod"}>
                          <button
                            className={p.completed ? "check mini checked" : "check mini"}
                            onClick={() => odhaczPod(z.id, p)}
                          />
                          <span>{p.name}</span>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </li>
            );
          })}
          {lzs > 0 && (
            <li className="item lzs-item" onClick={() => openUrl(`${PANEL_URL}/posty-lzs`)}>
              <div className="item-row">
                <span className="lzs-dot" />
                <span className="item-name">Posty LZS do zrobienia</span>
                <span className="chip chip-green">{lzs}</span>
                <span className="lzs-go">→</span>
              </div>
            </li>
          )}
        </ul>
      )}

      <form className="quick-add" onSubmit={dodaj}>
        <input
          ref={inputRef}
          placeholder="+ zadanie   !jutro !pt !15.09 !pilne"
          value={nowe}
          onChange={(e) => setNowe(e.target.value)}
          disabled={busy}
        />
        <select value={dlaKogo} onChange={(e) => setDlaKogo(e.target.value)} disabled={busy}>
          <option value="">dla kogo? (opcjonalnie)</option>
          {klienci.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
      </form>
    </div>
  );
}
