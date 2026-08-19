import { useCallback, useEffect, useRef, useState } from "react";
import {
  Zadanie,
  dodajZadanie,
  etykietaTerminu,
  listaZadan,
  odhaczZadanie,
} from "../lib/data";

const POLL_MS = 30_000;

export default function TaskList({ userId }: { userId: string }) {
  const [zadania, setZadania] = useState<Zadanie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nowe, setNowe] = useState("");
  const [busy, setBusy] = useState(false);
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
    timer.current = window.setInterval(odswiez, POLL_MS);
    const onFocus = () => odswiez();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer.current);
      window.removeEventListener("focus", onFocus);
    };
  }, [odswiez]);

  const odhacz = async (id: string) => {
    setZadania((z) => z.filter((x) => x.id !== id)); // optymistycznie
    try {
      await odhaczZadanie(id);
    } catch (e) {
      console.error(e);
      odswiez(); // przywroc stan z serwera
    }
  };

  const dodaj = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = nowe.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await dodajZadanie(name, userId);
      setNowe("");
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
                <span className="item-name">{z.name}</span>
                {termin && (
                  <span className={termin.overdue ? "badge badge-red" : "badge"}>
                    {termin.text}
                  </span>
                )}
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
      </form>
    </div>
  );
}
