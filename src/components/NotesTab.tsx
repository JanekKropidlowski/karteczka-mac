import { useCallback, useEffect, useRef, useState } from "react";
import { Notatka, dodajNotatke, listaNotatek, nasluchujZmian, odhaczNotatke } from "../lib/data";

const POLL_MS = 30_000;

export default function NotesTab({ userId }: { userId: string }) {
  const [notatki, setNotatki] = useState<Notatka[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nowa, setNowa] = useState("");
  const [busy, setBusy] = useState(false);
  const [znikajace, setZnikajace] = useState<string[]>([]);
  const timer = useRef<number>();
  const znikajaceRef = useRef<string[]>([]);

  const odswiez = useCallback(async () => {
    try {
      const lista = await listaNotatek();
      setNotatki((poprzednie) => {
        const trzymane = poprzednie.filter((n) => znikajaceRef.current.includes(n.id));
        return trzymane.length ? [...trzymane, ...lista] : lista;
      });
      setError(null);
    } catch (e) {
      setError("Nie udało się pobrać notatek");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    znikajaceRef.current = znikajace;
  }, [znikajace]);

  useEffect(() => {
    odswiez();
    const stop = nasluchujZmian(["reminders"], odswiez);
    timer.current = window.setInterval(odswiez, POLL_MS);
    return () => {
      stop();
      window.clearInterval(timer.current);
    };
  }, [odswiez]);

  const odhacz = async (id: string) => {
    if (znikajace.includes(id)) return;
    setZnikajace((z) => [...z, id]);
    window.setTimeout(() => {
      setNotatki((n) => n.filter((x) => x.id !== id));
      setZnikajace((z) => z.filter((x) => x !== id));
    }, 190);
    try {
      await odhaczNotatke(id);
    } catch (e) {
      console.error(e);
      odswiez();
    }
  };

  const dodaj = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = nowa.trim();
    if (!title || busy) return;
    setBusy(true);
    try {
      await dodajNotatke(title, userId);
      setNowa("");
      await odswiez();
    } catch (err) {
      console.error(err);
      setError("Nie udało się dodać notatki");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lista-wrap">
      {error && <p className="error">{error}</p>}
      {loading ? (
        <p className="muted">Ładowanie...</p>
      ) : notatki.length === 0 ? (
        <p className="muted empty">Brak notatek — dopisz coś poniżej</p>
      ) : (
        <ul className="lista">
          {notatki.map((n) => (
            <li
              key={n.id}
              className={znikajace.includes(n.id) ? "item znika-done" : "item"}
            >
              <div className="item-row">
                <button className="check" title="Zrobione" onClick={() => odhacz(n.id)} />
                <span className="item-name" title={n.title}>
                  {n.title}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form className="quick-add" onSubmit={dodaj}>
        <input
          placeholder="+ szybka notatka i Enter"
          value={nowa}
          onChange={(e) => setNowa(e.target.value)}
          disabled={busy}
        />
      </form>
    </div>
  );
}
