import { useCallback, useEffect, useRef, useState } from "react";
import {
  Klient,
  Zadanie,
  dodajZadanie,
  etykietaTerminu,
  listaKlientow,
  listaZadan,
  odhaczZadanie,
  usunZadanie,
} from "../lib/data";

const POLL_MS = 30_000;

export default function TaskList({ userId }: { userId: string }) {
  const [zadania, setZadania] = useState<Zadanie[]>([]);
  const [klienci, setKlienci] = useState<Klient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nowe, setNowe] = useState("");
  const [dlaKogo, setDlaKogo] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const timer = useRef<number>();

  const odswiez = useCallback(async () => {
    try {
      setZadania(await listaZadan());
      setError(null);
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
    timer.current = window.setInterval(odswiez, POLL_MS);
    const onFocus = () => odswiez();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer.current);
      window.removeEventListener("focus", onFocus);
    };
  }, [odswiez]);

  // klik "usun" wymaga potwierdzenia drugim klikiem w ciagu 3 s
  useEffect(() => {
    if (!confirmId) return;
    const t = window.setTimeout(() => setConfirmId(null), 3000);
    return () => window.clearTimeout(t);
  }, [confirmId]);

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

  const dodaj = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = nowe.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await dodajZadanie(name, userId, dlaKogo || null);
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
      ) : zadania.length === 0 ? (
        <p className="muted empty">Wszystko zrobione 🎉</p>
      ) : (
        <ul className="lista">
          {zadania.map((z) => {
            const termin = etykietaTerminu(z.deadline);
            return (
              <li key={z.id} className={termin?.overdue ? "item overdue" : "item"}>
                <button
                  className="check"
                  title="Oznacz jako zrobione"
                  onClick={() => odhacz(z.id)}
                />
                <span className="item-body">
                  <span className="item-name">{z.name}</span>
                  <span className="item-meta">
                    {z.clients?.name && <span className="badge badge-client">{z.clients.name}</span>}
                    {termin && (
                      <span className={termin.overdue ? "badge badge-red" : "badge"}>
                        {termin.text}
                      </span>
                    )}
                  </span>
                </span>
                <button
                  className={confirmId === z.id ? "trash confirm" : "trash"}
                  title={confirmId === z.id ? "Kliknij ponownie, aby usunąć" : "Usuń (do Archiwum panelu)"}
                  onClick={() => usun(z.id)}
                >
                  {confirmId === z.id ? "na pewno?" : "×"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form className="quick-add" onSubmit={dodaj}>
        <input
          placeholder="+ dodaj zadanie i Enter"
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
