import "server-only";

import { and, eq, inArray, lt, sql } from "drizzle-orm";
import webPush from "web-push";
import { getDb } from "@/db";
import { appSettings, feedingReminderDeliveries, pushSubscriptions, type PushSubscriptionRecord } from "@/db/schema";
import { elapsedFeedingText, minutesSinceFeeding } from "@/lib/feeding-elapsed";
import { getLatestFeedingRecord } from "@/lib/feedings";
import { getCurrentBaby } from "@/lib/meals";
import { resolveVapidSubject } from "@/lib/vapid";

const VAPID_PUBLIC_KEY = "push_vapid_public_key";
const VAPID_PRIVATE_KEY = "push_vapid_private_key";
const REMINDER_ENABLED_KEY = "feeding_reminder_enabled";
const REMINDER_MINUTES_KEY = "feeding_reminder_minutes";
const SETTING_KEYS = [VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, REMINDER_ENABLED_KEY, REMINDER_MINUTES_KEY];
const PUSH_REQUEST_TIMEOUT_MS = 10_000;

export const DEFAULT_FEEDING_REMINDER_MINUTES = 180;
export const MIN_FEEDING_REMINDER_MINUTES = 15;
export const MAX_FEEDING_REMINDER_MINUTES = 720;

export type PushNotificationSettings = {
  feedingReminderEnabled: boolean;
  feedingReminderMinutes: number;
  vapidPublicKey: string;
  subscriptionCount: number;
};

export type BrowserPushSubscription = {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
};

function readSettings() {
  const rows = getDb()
    .select({ key: appSettings.key, value: appSettings.value })
    .from(appSettings)
    .where(inArray(appSettings.key, SETTING_KEYS))
    .all();
  return new Map(rows.map((row) => [row.key, row.value]));
}

function writeSettings(settings: Array<{ key: string; value: string }>) {
  if (!settings.length) return;
  const updatedAt = new Date();
  getDb()
    .insert(appSettings)
    .values(settings.map((setting) => ({ ...setting, updatedAt })))
    .onConflictDoUpdate({ target: appSettings.key, set: { value: sql`excluded.value`, updatedAt } })
    .run();
}

function ensureVapidKeys(values: Map<string, string>) {
  const publicKey = values.get(VAPID_PUBLIC_KEY);
  const privateKey = values.get(VAPID_PRIVATE_KEY);
  if (publicKey && privateKey) return { publicKey, privateKey };
  const generated = webPush.generateVAPIDKeys();
  writeSettings([
    { key: VAPID_PUBLIC_KEY, value: generated.publicKey },
    { key: VAPID_PRIVATE_KEY, value: generated.privateKey },
  ]);
  return generated;
}

function reminderMinutes(value?: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= MIN_FEEDING_REMINDER_MINUTES && parsed <= MAX_FEEDING_REMINDER_MINUTES
    ? parsed
    : DEFAULT_FEEDING_REMINDER_MINUTES;
}

function vapidSubject() {
  return resolveVapidSubject({
    configuredSubject: process.env.DODOBABY_VAPID_SUBJECT,
    appUrl: process.env.APP_URL,
  });
}

function configureWebPush() {
  const keys = ensureVapidKeys(readSettings());
  webPush.setVapidDetails(vapidSubject(), keys.publicKey, keys.privateKey);
}

export function getPushNotificationSettings(): PushNotificationSettings {
  const values = readSettings();
  const keys = ensureVapidKeys(values);
  const [{ count }] = getDb().select({ count: sql<number>`count(*)` }).from(pushSubscriptions).all();
  return {
    feedingReminderEnabled: values.get(REMINDER_ENABLED_KEY) === "true",
    feedingReminderMinutes: reminderMinutes(values.get(REMINDER_MINUTES_KEY)),
    vapidPublicKey: keys.publicKey,
    subscriptionCount: Number(count),
  };
}

export function updatePushNotificationSettings(input: {
  feedingReminderEnabled: boolean;
  feedingReminderMinutes: number;
}): PushNotificationSettings {
  if (!Number.isInteger(input.feedingReminderMinutes)
    || input.feedingReminderMinutes < MIN_FEEDING_REMINDER_MINUTES
    || input.feedingReminderMinutes > MAX_FEEDING_REMINDER_MINUTES) {
    throw new Error("提醒间隔需在 15 分钟到 12 小时之间");
  }
  writeSettings([
    { key: REMINDER_ENABLED_KEY, value: String(input.feedingReminderEnabled) },
    { key: REMINDER_MINUTES_KEY, value: String(input.feedingReminderMinutes) },
  ]);
  return getPushNotificationSettings();
}

export function savePushSubscription(input: BrowserPushSubscription): PushSubscriptionRecord {
  const now = new Date();
  const id = crypto.randomUUID();
  getDb()
    .insert(pushSubscriptions)
    .values({
      id,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      expirationTime: input.expirationTime == null ? null : new Date(input.expirationTime),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        expirationTime: input.expirationTime == null ? null : new Date(input.expirationTime),
        failureCount: 0,
        updatedAt: now,
      },
    })
    .run();
  return getPushSubscription(input.endpoint)!;
}

export function getPushSubscription(endpoint: string): PushSubscriptionRecord | null {
  const [subscription] = getDb()
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .limit(1)
    .all();
  return subscription ?? null;
}

export function deletePushSubscription(endpoint: string) {
  return getDb().delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).run().changes > 0;
}

function webPushSubscription(subscription: PushSubscriptionRecord) {
  return {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime?.getTime() ?? null,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  };
}

function pushStatusCode(error: unknown) {
  if (!error || typeof error !== "object" || !("statusCode" in error)) return null;
  return typeof error.statusCode === "number" ? error.statusCode : null;
}

function pushErrorReason(error: unknown) {
  if (!error || typeof error !== "object" || !("body" in error) || typeof error.body !== "string") return null;
  try {
    const parsed = JSON.parse(error.body) as { reason?: unknown; error?: { status?: unknown; message?: unknown } };
    if (typeof parsed.reason === "string") return parsed.reason;
    if (typeof parsed.error?.status === "string") return parsed.error.status;
    if (typeof parsed.error?.message === "string") return parsed.error.message;
  } catch {
    return error.body.trim().slice(0, 160) || null;
  }
  return null;
}

function pushEndpointHost(endpoint: string) {
  try {
    return new URL(endpoint).host;
  } catch {
    return "invalid-endpoint";
  }
}

function logPushFailure(context: string, subscription: PushSubscriptionRecord, error: unknown) {
  console.error(context, {
    subscriptionId: subscription.id,
    pushHost: pushEndpointHost(subscription.endpoint),
    statusCode: pushStatusCode(error),
    reason: pushErrorReason(error),
    message: error instanceof Error ? error.message : "Unknown push error",
  });
}

function pushErrorMessage(error: unknown, statusCode: number | null) {
  if (pushErrorReason(error) === "BadJwtToken") return "推送服务身份配置无效，请更新服务端配置后重试";
  if (statusCode === 404 || statusCode === 410) return "当前设备订阅已失效，请重新开启通知";
  if (statusCode === 400 || statusCode === 401 || statusCode === 403) return "推送服务拒绝了当前订阅，请关闭后重新开启通知";
  const message = error instanceof Error ? error.message : "";
  if (/timeout|timed out|ETIMEDOUT/i.test(message)) return "连接推送服务超时，请稍后重试";
  return "推送服务暂时不可用，请稍后重试";
}

export async function sendTestPush(endpoint: string) {
  const subscription = getPushSubscription(endpoint);
  if (!subscription) throw new Error("当前设备尚未订阅通知");
  configureWebPush();
  try {
    await webPush.sendNotification(webPushSubscription(subscription), JSON.stringify({
      title: "小芽日记通知已开启",
      body: "这台设备可以接收喂奶提醒。",
      tag: "dodobaby-notification-test",
      url: "/settings",
    }), { TTL: 60, urgency: "high", timeout: PUSH_REQUEST_TIMEOUT_MS });
    getDb().update(pushSubscriptions).set({ failureCount: 0, lastSuccessAt: new Date(), updatedAt: new Date() })
      .where(eq(pushSubscriptions.id, subscription.id)).run();
  } catch (error) {
    logPushFailure("Test push delivery failed", subscription, error);
    const statusCode = pushStatusCode(error);
    if (statusCode === 404 || statusCode === 410) deletePushSubscription(endpoint);
    else getDb().update(pushSubscriptions).set({ failureCount: sql`${pushSubscriptions.failureCount} + 1`, updatedAt: new Date() })
      .where(eq(pushSubscriptions.id, subscription.id)).run();
    throw new Error(pushErrorMessage(error, statusCode));
  }
}

export async function dispatchFeedingReminders(now = new Date()) {
  const settings = getPushNotificationSettings();
  if (!settings.feedingReminderEnabled) return { sent: 0, skipped: "disabled" };
  const subscriptions = getDb().select().from(pushSubscriptions).all();
  if (!subscriptions.length) return { sent: 0, skipped: "no-subscriptions" };
  const baby = await getCurrentBaby();
  if (!baby) return { sent: 0, skipped: "no-baby" };
  const feeding = await getLatestFeedingRecord(baby.id);
  if (!feeding) return { sent: 0, skipped: "no-feeding" };
  const elapsedMinutes = minutesSinceFeeding(feeding, baby.timezone, now);
  if (elapsedMinutes < settings.feedingReminderMinutes) return { sent: 0, skipped: "not-due" };

  configureWebPush();
  let sent = 0;
  for (const subscription of subscriptions) {
    const [existing] = getDb().select({ id: feedingReminderDeliveries.id })
      .from(feedingReminderDeliveries)
      .where(and(
        eq(feedingReminderDeliveries.subscriptionId, subscription.id),
        eq(feedingReminderDeliveries.feedingRecordId, feeding.id),
      ))
      .limit(1)
      .all();
    if (existing) continue;
    try {
      await webPush.sendNotification(webPushSubscription(subscription), JSON.stringify({
        title: `${baby.name}该喂奶了`,
        body: `距离上次喂奶已经 ${elapsedFeedingText(elapsedMinutes)}。`,
        tag: `feeding-reminder-${baby.id}`,
        url: "/feeding",
      }), { TTL: 1_800, urgency: "high", timeout: PUSH_REQUEST_TIMEOUT_MS });
      getDb().insert(feedingReminderDeliveries).values({
        id: crypto.randomUUID(),
        subscriptionId: subscription.id,
        feedingRecordId: feeding.id,
        sentAt: now,
      }).onConflictDoNothing().run();
      getDb().update(pushSubscriptions).set({ failureCount: 0, lastSuccessAt: now, updatedAt: now })
        .where(eq(pushSubscriptions.id, subscription.id)).run();
      sent += 1;
    } catch (error) {
      logPushFailure("Feeding reminder delivery failed", subscription, error);
      const statusCode = pushStatusCode(error);
      if (statusCode === 404 || statusCode === 410) deletePushSubscription(subscription.endpoint);
      else getDb().update(pushSubscriptions).set({ failureCount: sql`${pushSubscriptions.failureCount} + 1`, updatedAt: now })
        .where(eq(pushSubscriptions.id, subscription.id)).run();
    }
  }
  getDb().delete(feedingReminderDeliveries)
    .where(lt(feedingReminderDeliveries.sentAt, new Date(now.getTime() - 180 * 86_400_000)))
    .run();
  return { sent, skipped: null };
}
