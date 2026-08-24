import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { siteSettings, storeSpecialHours } from "@/db/schema";

export type SiteSettings = typeof siteSettings.$inferSelect;
export type StoreSpecialHours = typeof storeSpecialHours.$inferSelect;

export const WEEKDAYS = [
  { key: "monday", label: "segunda-feira", shortLabel: "Segunda" },
  { key: "tuesday", label: "terça-feira", shortLabel: "Terça" },
  { key: "wednesday", label: "quarta-feira", shortLabel: "Quarta" },
  { key: "thursday", label: "quinta-feira", shortLabel: "Quinta" },
  { key: "friday", label: "sexta-feira", shortLabel: "Sexta" },
  { key: "saturday", label: "sábado", shortLabel: "Sábado" },
  { key: "sunday", label: "domingo", shortLabel: "Domingo" },
] as const;

export type WeekdayKey = (typeof WEEKDAYS)[number]["key"];
export type DayHours = { opens: string; closes: string; closed: boolean };
export type WeeklySchedule = Record<WeekdayKey, DayHours>;

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function createEmptySchedule(): WeeklySchedule {
  return Object.fromEntries(WEEKDAYS.map((day) => [day.key, { opens: "", closes: "", closed: false }])) as WeeklySchedule;
}

export function parseWeeklySchedule(raw: string): WeeklySchedule {
  const schedule = createEmptySchedule();
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    WEEKDAYS.forEach(({ key }) => {
      const candidate = parsed[key] as Partial<DayHours> | undefined;
      if (!candidate || typeof candidate !== "object") return;
      const opens = typeof candidate.opens === "string" && timePattern.test(candidate.opens) ? candidate.opens : "";
      const closes = typeof candidate.closes === "string" && timePattern.test(candidate.closes) ? candidate.closes : "";
      schedule[key] = { opens, closes, closed: candidate.closed === true };
    });
    return schedule;
  } catch {
    const times = [...raw.matchAll(/\b([01]?\d|2[0-3])(?::([0-5]\d)|h([0-5]\d)?)\b/gi)]
      .map((match) => `${match[1].padStart(2, "0")}:${match[2] ?? match[3] ?? "00"}`);
    if (times?.length === 2) {
      const [opens, closes] = times;
      WEEKDAYS.forEach(({ key }) => { schedule[key] = { opens, closes, closed: false }; });
    }
    return schedule;
  }
}

export function serializeWeeklySchedule(schedule: WeeklySchedule) {
  return JSON.stringify(schedule);
}

export function formatDayHours(day: DayHours) {
  if (day.closed) return "Fechado";
  if (!day.opens || !day.closes) return "Horário a confirmar";
  return `${day.opens} – ${day.closes}`;
}

function minutes(time: string) {
  if (!timePattern.test(time)) return null;
  const [hours, minutesValue] = time.split(":").map(Number);
  return hours * 60 + minutesValue;
}

const englishDayToKey: Record<string, WeekdayKey> = {
  Monday: "monday",
  Tuesday: "tuesday",
  Wednesday: "wednesday",
  Thursday: "thursday",
  Friday: "friday",
  Saturday: "saturday",
  Sunday: "sunday",
};

export type StoreOpenStatus = {
  dayKey: WeekdayKey;
  isOpen: boolean | null;
  statusLabel: string;
  todayHours: string;
  isSpecial: boolean;
  specialNote: string;
};

function saoPauloDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return {
    dateKey: `${part("year")}-${part("month")}-${part("day")}`,
    dayKey: englishDayToKey[part("weekday")] ?? "monday",
    hour: Number(part("hour") || 0),
    minute: Number(part("minute") || 0),
  };
}

export function saoPauloDateKey(date = new Date()) {
  return saoPauloDateParts(date).dateKey;
}

export function formatSpecialHoursDate(date: string) {
  const parsed = new Date(`${date}T12:00:00-03:00`);
  return Number.isFinite(parsed.getTime())
    ? parsed.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit" })
    : date;
}

function specialDayHours(entry: StoreSpecialHours | undefined, fallback: DayHours) {
  return entry ? { opens: entry.opens, closes: entry.closes, closed: entry.closed } : fallback;
}

export function getStoreOpenStatus(schedule: WeeklySchedule, date: Date | null, specialHours: StoreSpecialHours[] = []): StoreOpenStatus | null {
  if (!date) return null;
  const current = saoPauloDateParts(date);
  const { dayKey } = current;
  const currentMinutes = current.hour * 60 + current.minute;
  const dayIndex = WEEKDAYS.findIndex((day) => day.key === dayKey);
  const todaySpecial = specialHours.find((entry) => entry.date === current.dateKey);
  const today = specialDayHours(todaySpecial, schedule[dayKey]);
  const opens = minutes(today.opens);
  const closes = minutes(today.closes);
  const previousDate = new Date(date.getTime() - 86_400_000);
  const previousParts = saoPauloDateParts(previousDate);
  const previousSpecial = specialHours.find((entry) => entry.date === previousParts.dateKey);
  const previous = specialDayHours(previousSpecial, schedule[WEEKDAYS[(dayIndex + WEEKDAYS.length - 1) % WEEKDAYS.length].key]);
  const previousOpens = minutes(previous.opens);
  const previousCloses = minutes(previous.closes);

  let isOpen = false;
  let hasKnownHours = today.closed || (opens !== null && closes !== null);
  if (!today.closed && opens !== null && closes !== null) {
    isOpen = opens < closes ? currentMinutes >= opens && currentMinutes < closes : currentMinutes >= opens;
  }
  if (!todaySpecial && !previous.closed && previousOpens !== null && previousCloses !== null && previousOpens > previousCloses && currentMinutes < previousCloses) {
    isOpen = true;
    hasKnownHours = true;
  }

  return {
    dayKey,
    isOpen: hasKnownHours ? isOpen : null,
    statusLabel: isOpen ? "Aberta agora" : hasKnownHours ? "Fechada agora" : "Horário a confirmar",
    todayHours: formatDayHours(today),
    isSpecial: Boolean(todaySpecial),
    specialNote: todaySpecial?.note ?? "",
  };
}

export function weekdaysStartingAt(dayKey: WeekdayKey | undefined) {
  const start = Math.max(0, WEEKDAYS.findIndex((day) => day.key === dayKey));
  return [...WEEKDAYS.slice(start), ...WEEKDAYS.slice(0, start)];
}

export const fallbackSiteSettings: SiteSettings = {
  id: 1,
  bannerActive: true,
  bannerEyebrow: "Oferta da semana",
  bannerTitle: "Economize cuidando de quem você ama.",
  bannerText: "Produtos selecionados com condições especiais por tempo limitado.",
  bannerCtaLabel: "Ver ofertas",
  bannerCtaHref: "#ofertas",
  store1Hours: "Horário a confirmar",
  store1ImageUrl: "",
  store2Hours: "Horário a confirmar",
  store2ImageUrl: "",
  updatedAt: "",
};

export async function getSiteSettings(): Promise<SiteSettings> {
  try {
    const [settings] = await getDb().select().from(siteSettings).where(eq(siteSettings.id, 1)).limit(1);
    return settings ?? fallbackSiteSettings;
  } catch {
    return fallbackSiteSettings;
  }
}

export async function listStoreSpecialHours(): Promise<StoreSpecialHours[]> {
  try {
    return await getDb().select().from(storeSpecialHours).orderBy(asc(storeSpecialHours.date), asc(storeSpecialHours.storeNumber));
  } catch {
    return [];
  }
}
