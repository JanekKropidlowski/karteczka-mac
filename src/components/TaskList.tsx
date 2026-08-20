import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Klient,
  Podzadanie,
  Zadanie,
  dodajPodzadanie,
  dodajZadanie,
  etykietaTerminu,
  liczbaLzsDoZrobienia,
  liczbaNaDzis,
  liczbyPodzadan,
  listaKlientow,
  listaPodzadan,
  listaZadan,
  nasluchujZmian,
  odhaczPodzadanie,
  odhaczZadanie,
  parsujWpis,
  ustawPriorytet,
  usunPodzadanie,
  usunZadanie,
  zapiszKolejnosc,
} from "../lib/data";

const POLL_MS = 60_000; // fallback, realtime robi robote na biezaco
const PRIORYTETY = ["zwykłe", "ważne", "PILNE"];
const PANEL_URL = "https://task.kropidlowscy.pl";

// Wspolny jezyk ruchu: jedno easing i dwa czasy, zeby wszystko (przestawianie,
// znikanie, rozwijanie) chodzilo w tym samym rytmie. Szanujemy systemowe
// "ogranicz ruch" z macOS - wtedy zmiany sa natychmiastowe.
const EASE = "cubic-bezier(.2,.8,.2,1)";
const RUCH = 220;
const ZNIKANIE = 190;
const RUCH_OK =
  typeof window !== "undefined" &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Kontener o animowanej wysokosci (podzadania) - mierzy zawartosc, wiec
 *  dziala bez znanej z gory wysokosci i doliczaja sie nowo dodane wiersze. */
function Rozwijane({
  otwarte,
  children,
}: {
  otwarte: boolean;
  children: React.ReactNode;
}) {
  const wnetrze = useRef<HTMLDivElement>(null);
  const [wysokosc, setWysokosc] = useState(0);

  useLayoutEffect(() => {
    const el = wnetrze.current;
    if (!el) return;
    const zmierz = () => setWysokosc(el.scrollHeight);
    zmierz();
    const ro = new ResizeObserver(zmierz);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);

  return (
    <div
      className={otwarte ? "rozwijane otwarte" : "rozwijane"}
      style={{ height: otwarte ? wysokosc : 0 }}
      aria-hidden={!otwarte}
    >
      <div ref={wnetrze}>{children}</div>
    </div>
  );
}

export default function TaskList({ userId }: { userId: string }) {
  const [zadania, setZadania] = useState<Zadanie[]>([]);
  const [klienci, setKlienci] = useState<Klient[]>([]);
  const [lzs, setLzs] = useState<number>(0);
  const [podzadania, setPodzadania] = useState<Record<string, Podzadanie[]>>({});
  const [liczniki, setLiczniki] = useState<
    Record<string, { razem: number; zrobione: number }>
  >({});
  const [rozwiniete, setRozwiniete] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nowe, setNowe] = useState("");
  const [nowePod, setNowePod] = useState("");
  const [dlaKogo, setDlaKogo] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  // Wiersze w trakcie animacji wyjscia: id -> powod (zrobione / usuniete).
  const [znikajace, setZnikajace] = useState<Record<string, "done" | "del">>({});
  const [swieze, setSwieze] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const podInputRef = useRef<HTMLInputElement>(null);
  const znikajaceRef = useRef<Record<string, "done" | "del">>({});
  const rozwinieteRef = useRef<string | null>(null);
  const widziane = useRef<Set<string>>(new Set());

  const odswiez = useCallback(async () => {
    try {
      const lista = await listaZadan();
      // Wiersz, ktory wlasnie odlatuje, trzymamy na liscie do konca animacji -
      // inaczej realtime zabralby go w pol drogi i mrugaloby.
      setZadania((poprzednie) => {
        const trzymane = poprzednie.filter((z) => znikajaceRef.current[z.id]);
        if (trzymane.length === 0) return lista;
        const scalone = [...lista];
        for (const z of trzymane) {
          const gdzie = poprzednie.findIndex((x) => x.id === z.id);
          scalone.splice(Math.min(gdzie, scalone.length), 0, z);
        }
        return scalone;
      });
      setError(null);
      invoke("set_tray_count", { count: liczbaNaDzis(lista) }).catch(() => {});
      liczbaLzsDoZrobienia().then(setLzs).catch(() => {});
      liczbyPodzadan(lista.map((z) => z.id)).then(setLiczniki).catch(() => {});
      // Otwarty wiersz dostaje swiezy stan podzadan - inaczej zmiana zrobiona
      // w panelu byla widoczna dopiero po zwinieciu i rozwinieciu.
      const otwarty = rozwinieteRef.current;
      if (otwarty) {
        listaPodzadan(otwarty)
          .then((p) => setPodzadania((s) => ({ ...s, [otwarty]: p })))
          .catch(() => {});
      }
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
      if (e.key === "Escape") setRozwiniete(null);
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
    rozwinieteRef.current = rozwiniete;
    if (!rozwiniete) return;
    const t = window.setTimeout(() => podInputRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [rozwiniete]);

  useEffect(() => {
    if (!confirmId) return;
    const t = window.setTimeout(() => setConfirmId(null), 3000);
    return () => window.clearTimeout(t);
  }, [confirmId]);

  // Nowe wiersze (dodane recznie albo przyniesione przez realtime) wjezdzaja
  // z gory; klasa schodzi po animacji, zeby nie wchodzila w droge FLIP-owi.
  useEffect(() => {
    const nieznane = zadania
      .filter((z) => !widziane.current.has(z.id))
      .map((z) => z.id);
    if (nieznane.length === 0) return;
    nieznane.forEach((id) => widziane.current.add(id));
    setSwieze((s) => [...s, ...nieznane]);
    const t = window.setTimeout(
      () => setSwieze((s) => s.filter((id) => !nieznane.includes(id))),
      RUCH + 120
    );
    return () => window.clearTimeout(t);
  }, [zadania]);

  // FLIP: po kazdej zmianie kolejnosci/skladu listy wiersze dojezdzaja na nowe
  // miejsca zamiast przeskakiwac. Pomijamy render, w ktorym zmienil sie stan
  // rozwiniecia - tam wysokosc animuje juz sam kontener podzadan.
  const listaRef = useRef<HTMLUListElement>(null);
  const pozycje = useRef<Map<string, number>>(new Map());
  const podpis = rozwiniete
    ? `${rozwiniete}:${podzadania[rozwiniete]?.length ?? -1}`
    : "";
  const podpisRef = useRef(podpis);

  useLayoutEffect(() => {
    const ul = listaRef.current;
    const ukladSzedl = podpisRef.current !== podpis;
    podpisRef.current = podpis;
    if (!ul) return;
    const teraz = new Map<string, number>();
    ul.querySelectorAll<HTMLElement>("li[data-id]").forEach((el) => {
      const id = el.dataset.id as string;
      const gora = el.offsetTop;
      teraz.set(id, gora);
      const stara = pozycje.current.get(id);
      if (
        !RUCH_OK ||
        ukladSzedl ||
        id === dragId || // przeciagany trzyma sie kursora, nie animujemy go
        stara === undefined ||
        Math.abs(stara - gora) < 1
      )
        return;
      el.animate(
        [
          { transform: `translateY(${stara - gora}px)` },
          { transform: "translateY(0px)" },
        ],
        { duration: RUCH, easing: EASE }
      );
    });
    pozycje.current = teraz;
  });

  // Plynny drag&drop na pointer events (HTML5 DnD w webview jest toporne):
  // lapiesz za uchwyt, wiersze przestawiaja sie na zywo, puszczenie zapisuje.
  const startDrag = (e: React.PointerEvent, id: string) => {
    e.preventDefault();
    setDragId(id);
    setRozwiniete(null); // rozwinięte podzadania psulyby pomiar wierszy
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

  /** Wiersz najpierw odlatuje, dopiero potem znika z listy (i reszta dojezdza). */
  const zdejmij = (id: string, powod: "done" | "del") => {
    znikajaceRef.current = { ...znikajaceRef.current, [id]: powod };
    setZnikajace({ ...znikajaceRef.current });
    window.setTimeout(() => {
      const { [id]: _, ...reszta } = znikajaceRef.current;
      znikajaceRef.current = reszta;
      setZnikajace({ ...reszta });
      setZadania((z) => z.filter((x) => x.id !== id));
    }, ZNIKANIE);
  };

  const odhacz = async (id: string) => {
    if (znikajace[id]) return;
    zdejmij(id, "done");
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
    zdejmij(id, "del");
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
    setNowePod("");
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
    const stan = !pod.completed;
    setPodzadania((s) => ({
      ...s,
      [projectId]: s[projectId].map((p) =>
        p.id === pod.id ? { ...p, completed: stan } : p
      ),
    }));
    setLiczniki((l) => {
      const w = l[projectId];
      if (!w) return l;
      return {
        ...l,
        [projectId]: { ...w, zrobione: w.zrobione + (stan ? 1 : -1) },
      };
    });
    try {
      await odhaczPodzadanie(pod.id, stan);
    } catch (e) {
      console.error(e);
    }
  };

  const dodajPod = async (e: React.FormEvent, projectId: string) => {
    e.preventDefault();
    const name = nowePod.trim();
    if (!name) return;
    const lista = podzadania[projectId] ?? [];
    setNowePod("");
    try {
      const dodane = await dodajPodzadanie(projectId, name, (lista.length + 1) * 10);
      setPodzadania((s) => ({ ...s, [projectId]: [...(s[projectId] ?? []), dodane] }));
      setLiczniki((l) => {
        const w = l[projectId] ?? { razem: 0, zrobione: 0 };
        return { ...l, [projectId]: { ...w, razem: w.razem + 1 } };
      });
      podInputRef.current?.focus(); // seria podzadań jednym ciągiem
    } catch (err) {
      console.error(err);
      setError("Nie udało się dodać podzadania");
      setNowePod(name);
    }
  };

  const usunPod = async (projectId: string, id: string) => {
    setPodzadania((s) => ({
      ...s,
      [projectId]: (s[projectId] ?? []).filter((p) => p.id !== id),
    }));
    setLiczniki((l) => {
      const w = l[projectId];
      if (!w) return l;
      return { ...l, [projectId]: { ...w, razem: Math.max(0, w.razem - 1) } };
    });
    try {
      await usunPodzadanie(id);
    } catch (e) {
      console.error(e);
      const p = await listaPodzadan(projectId).catch(() => null);
      if (p) setPodzadania((s) => ({ ...s, [projectId]: p }));
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
        <ul className="lista" ref={listaRef}>
          {zadania.map((z) => {
            const termin = etykietaTerminu(z.deadline);
            const pody = podzadania[z.id];
            const otwarte = rozwiniete === z.id;
            const licznik = liczniki[z.id];
            const znika = znikajace[z.id];
            const klasy = ["item"];
            if (dragId === z.id) klasy.push("dragging");
            if (otwarte) klasy.push("otwarty");
            if (znika) klasy.push(znika === "done" ? "znika-done" : "znika-del");
            if (swieze.includes(z.id)) klasy.push("wchodzi");
            return (
              <li key={z.id} data-id={z.id} className={klasy.join(" ")}>
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
                    className={[
                      "chevron",
                      otwarte ? "open" : "",
                      licznik?.razem ? "" : "pusty", // bez podzadan wychodzi dopiero pod kursorem
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    title={otwarte ? "Zwiń podzadania" : "Podzadania"}
                    onClick={() => rozwin(z.id)}
                  >
                    {licznik?.razem ? (
                      <span className="pod-licznik">
                        {licznik.zrobione}/{licznik.razem}
                      </span>
                    ) : null}
                    <span className="strzalka">›</span>
                  </button>
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
                {(otwarte || pody) && (
                  <Rozwijane otwarte={otwarte}>
                    <ul className="podzadania">
                      {!pody ? (
                        <li className="muted">Ładowanie...</li>
                      ) : (
                        pody.map((p) => (
                          <li key={p.id} className={p.completed ? "pod done" : "pod"}>
                            <button
                              className={p.completed ? "check mini checked" : "check mini"}
                              title={p.completed ? "Odznacz" : "Zrobione"}
                              onClick={() => odhaczPod(z.id, p)}
                            />
                            <span className="pod-name">{p.name}</span>
                            <button
                              className="pod-trash"
                              title="Usuń podzadanie"
                              onClick={() => usunPod(z.id, p.id)}
                            >
                              ×
                            </button>
                          </li>
                        ))
                      )}
                      {otwarte && (
                        <li className="pod-add-row">
                          <form onSubmit={(e) => dodajPod(e, z.id)}>
                            <input
                              ref={podInputRef}
                              className="pod-add"
                              placeholder="+ podzadanie i Enter"
                              value={nowePod}
                              onChange={(e) => setNowePod(e.target.value)}
                            />
                          </form>
                        </li>
                      )}
                    </ul>
                  </Rozwijane>
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
