// Warstwa danych karteczki: te same tabele co panel (projects = glowna lista
// to-do, reminders = notatki). Wzorce insertow 1:1 z panelu (QuickAddTask,
// CreateReminderForm), zeby panel widzial wpisy normalnie.
import { supabase } from "./supabase";

export interface Zadanie {
  id: string;
  name: string;
  status: string;
  deadline: string | null; // ISO date
  sort_order: number | null;
  priority: number; // 0 zwykle, 1 wazne, 2 pilne
  clients: { name: string } | null; // przypisany klient ("dla kogo")
}

export interface Podzadanie {
  id: string;
  name: string;
  completed: boolean;
}

export interface Klient {
  id: string;
  name: string;
}

export interface Notatka {
  id: string;
  title: string;
  is_completed: boolean;
  scheduled_date: string;
}

const OTWARTE = ["completed", "archived", "cancelled", "delivered"];

export function dzisIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function przeterminowane(z: Zadanie): boolean {
  return !!z.deadline && z.deadline < dzisIso();
}

/**
 * Sortowanie: priorytet (pilne > wazne) -> reczna kolejnosc (drag&drop,
 * sort_order jak w panelu) -> deadline. Przeterminowanie sygnalizuje
 * czerwona ramka i badge, nie wymusza kolejnosci (user rzadzi kolejnoscia).
 */
export function sortujZadania(zadania: Zadanie[]): Zadanie[] {
  return [...zadania].sort((a, b) => {
    if ((b.priority ?? 0) !== (a.priority ?? 0)) return (b.priority ?? 0) - (a.priority ?? 0);
    if ((a.sort_order ?? 9999) !== (b.sort_order ?? 9999))
      return (a.sort_order ?? 9999) - (b.sort_order ?? 9999);
    if (a.deadline && b.deadline && a.deadline !== b.deadline)
      return a.deadline < b.deadline ? -1 : 1;
    return !!a.deadline === !!b.deadline ? 0 : a.deadline ? -1 : 1;
  });
}

/** Zapis kolejnosci po drag&drop: sort_order wg nowej kolejnosci widocznej listy */
export async function zapiszKolejnosc(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map((id, i) =>
      supabase.from("projects").update({ sort_order: (i + 1) * 10 }).eq("id", id)
    )
  );
}

/** Zadania wymagajace uwagi dzis: przeterminowane + z terminem na dzis */
export function liczbaNaDzis(zadania: Zadanie[]): number {
  const dzis = dzisIso();
  return zadania.filter((z) => z.deadline && z.deadline <= dzis).length;
}

const DNI: Record<string, number> = {
  pon: 1, wt: 2, sr: 3, "śr": 3, czw: 4, pt: 5, sob: 6, nd: 0, niedz: 0,
};

/**
 * Parser szybkiego wpisu: "faktura dla Redy !pt !pilne" ->
 * { name: "faktura dla Redy", deadline: najblizszy piatek, priority: 2 }.
 * Tokeny: !dzis/!dziś, !jutro, !pojutrze, !pon..!nd, !DD.MM, !pilne, !wazne/!ważne
 */
export function parsujWpis(tekst: string): {
  name: string;
  deadline: string | null;
  priority: number;
} {
  let deadline: string | null = null;
  let priority = 0;
  const isoZaDni = (dni: number) =>
    new Date(Date.now() + dni * 86400000).toISOString().slice(0, 10);

  const name = tekst
    .replace(/!(\S+)/g, (calosc, tokenRaw: string) => {
      const token = tokenRaw.toLowerCase();
      if (token === "pilne") { priority = 2; return ""; }
      if (token === "wazne" || token === "ważne") { priority = Math.max(priority, 1); return ""; }
      if (token === "dzis" || token === "dziś") { deadline = isoZaDni(0); return ""; }
      if (token === "jutro") { deadline = isoZaDni(1); return ""; }
      if (token === "pojutrze") { deadline = isoZaDni(2); return ""; }
      if (token in DNI) {
        const cel = DNI[token];
        const dzisDzien = new Date().getDay();
        const delta = (cel - dzisDzien + 7) % 7 || 7; // najblizszy taki dzien (nie dzis)
        deadline = isoZaDni(delta);
        return "";
      }
      const m = token.match(/^(\d{1,2})\.(\d{1,2})\.?$/);
      if (m) {
        const teraz = new Date();
        let rok = teraz.getFullYear();
        const data = new Date(rok, Number(m[2]) - 1, Number(m[1]));
        if (data.getTime() < Date.now() - 86400000) rok += 1; // data z przeszlosci -> przyszly rok
        deadline = `${rok}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
        return "";
      }
      return calosc; // nieznany token zostaje w nazwie
    })
    .replace(/\s+/g, " ")
    .trim();

  return { name, deadline, priority };
}

export async function listaZadan(): Promise<Zadanie[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, status, deadline, sort_order, priority, clients(name)")
    .not("status", "in", `(${OTWARTE.join(",")})`);
  if (error) throw error;
  return sortujZadania((data ?? []) as unknown as Zadanie[]);
}

export async function ustawPriorytet(id: string, priority: number): Promise<void> {
  const { error } = await supabase.from("projects").update({ priority }).eq("id", id);
  if (error) throw error;
}

export async function ustawTermin(id: string, deadline: string | null): Promise<void> {
  const { error } = await supabase.from("projects").update({ deadline }).eq("id", id);
  if (error) throw error;
}

export async function listaPodzadan(projectId: string): Promise<Podzadanie[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("id, name, completed")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Podzadanie[];
}

export async function odhaczPodzadanie(id: string, completed: boolean): Promise<void> {
  const { error } = await supabase.from("tasks").update({ completed }).eq("id", id);
  if (error) throw error;
}

/**
 * Realtime: natychmiastowe odswiezanie po zmianach w bazie (publikacja
 * supabase_realtime wlaczona migracja 20260819210000). Zwraca funkcje sprzatajaca.
 */
export function nasluchujZmian(tabele: string[], onChange: () => void): () => void {
  const channel = supabase.channel(`karteczka-${tabele.join("-")}`);
  for (const table of tabele) {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, onChange);
  }
  channel.subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export async function listaKlientow(): Promise<Klient[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return (data ?? []) as Klient[];
}

export async function dodajZadanie(
  name: string,
  userId: string,
  clientId?: string | null,
  deadline?: string | null,
  priority?: number
): Promise<void> {
  const { error } = await supabase.from("projects").insert({
    user_id: userId,
    name,
    date: dzisIso(),
    status: "pending",
    tags: [],
    client_id: clientId || null,
    deadline: deadline || null,
    priority: priority ?? 0,
  });
  if (error) throw error;
}

/**
 * "Usuniecie" = archiwizacja (status archived): znika z listy i z dashboardu
 * panelu, ale zostaje w Archiwum panelu z mozliwoscia przywrocenia.
 */
export async function usunZadanie(id: string): Promise<void> {
  const { error } = await supabase
    .from("projects")
    .update({ status: "archived" })
    .eq("id", id);
  if (error) throw error;
}

export async function odhaczZadanie(id: string): Promise<void> {
  const { error } = await supabase
    .from("projects")
    .update({ status: "completed" })
    .eq("id", id);
  if (error) throw error;
}

export async function listaNotatek(): Promise<Notatka[]> {
  const { data, error } = await supabase
    .from("reminders")
    .select("id, title, is_completed, scheduled_date")
    .eq("is_completed", false)
    .order("scheduled_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Notatka[];
}

export async function dodajNotatke(title: string, userId: string): Promise<void> {
  const { error } = await supabase.from("reminders").insert({
    user_id: userId,
    title,
    type: "custom",
    scheduled_date: new Date().toISOString(),
    is_completed: false,
  });
  if (error) throw error;
}

export async function odhaczNotatke(id: string): Promise<void> {
  const { error } = await supabase
    .from("reminders")
    .update({ is_completed: true })
    .eq("id", id);
  if (error) throw error;
}

/** Etykieta terminu po polsku: Dziś / Jutro / data / ile dni po terminie */
export function etykietaTerminu(deadline: string | null): { text: string; overdue: boolean } | null {
  if (!deadline) return null;
  const dzis = dzisIso();
  if (deadline === dzis) return { text: "dziś", overdue: false };
  const jutro = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  if (deadline === jutro) return { text: "jutro", overdue: false };
  if (deadline < dzis) {
    const dni = Math.round((Date.parse(dzis) - Date.parse(deadline)) / 86400000);
    return { text: `${dni} dni po terminie`, overdue: true };
  }
  const d = new Date(deadline);
  return {
    text: d.toLocaleDateString("pl-PL", { day: "numeric", month: "short" }),
    overdue: false,
  };
}
