import { db } from "./db";
import { currentUserId } from "./session";
import { today } from "./recurring";

export interface Streak {
  days: number;
  active: boolean;
  lastDate: string | null;
}

export async function getUserStreak(): Promise<Streak> {
  const user = currentUserId();
  const records = await db.streaks
    .where("userId")
    .equals(user)
    .and((r) => r.kind === "streak" && r.categoryId === null)
    .toArray();

  const dates = records.map((r) => r.date).sort();
  const todayStr = today();
  const yesterday = records.some((r) => r.date === yesterdayISO(todayStr));
  const isToday = records.some((r) => r.date === todayStr);

  if (dates.length === 0) {
    return { days: 0, active: false, lastDate: null };
  }

  let streak = 0;
  const lastDate = dates[dates.length - 1];
  if (lastDate === todayStr) {
    streak = 1;
  }
  for (let i = dates.length - 2; i >= 0; i--) {
    if (dates[i] === prevISO(dates[i + 1])) {
      streak++;
    } else {
      break;
    }
  }

  return {
    days: streak,
    active: isToday || yesterday,
    lastDate: lastDate ?? null,
  };
}

function yesterdayISO(todayStr: string): string {
  const [y, m, d] = todayStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().split("T")[0];
}

function prevISO(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().split("T")[0];
}

export async function logStreak(date?: string): Promise<void> {
  const user = currentUserId();
  const todayStr = date ?? today();
  const exists = await db.streaks
    .where("userId")
    .equals(user)
    .and((r) => r.kind === "streak" && r.categoryId === null && r.date === todayStr)
    .first();

  if (exists) return;

  await db.streaks.add({
    id: `${user}-${todayStr}`,
    userId: user,
    kind: "streak",
    categoryId: null,
    date: todayStr,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}
