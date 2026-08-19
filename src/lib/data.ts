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
  clients: { name: string } | null; // przypisany klient ("dla kogo")
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

/** Sortowanie jak TasksMainView panelu: przeterminowane -> deadline -> sort_order */
export function sortujZadania(zadania: Zadanie[]): Zadanie[] {
  return [...zadania].sort((a, b) => {
    const aOver = przeterminowane(a) ? 0 : 1;
    const bOver = przeterminowane(b) ? 0 : 1;
    if (aOver !== bOver) return aOver - bOver;
    if (a.deadline && b.deadline && a.deadline !== b.deadline)
      return a.deadline < b.deadline ? -1 : 1;
    if (!!a.deadline !== !!b.deadline) return a.deadline ? -1 : 1;
    return (a.sort_order ?? 9999) - (b.sort_order ?? 9999);
  });
}

export async function listaZadan(): Promise<Zadanie[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, status, deadline, sort_order, clients(name)")
    .not("status", "in", `(${OTWARTE.join(",")})`);
  if (error) throw error;
  return sortujZadania((data ?? []) as unknown as Zadanie[]);
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
  clientId?: string | null
): Promise<void> {
  const { error } = await supabase.from("projects").insert({
    user_id: userId,
    name,
    date: dzisIso(),
    status: "pending",
    tags: [],
    client_id: clientId || null,
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
