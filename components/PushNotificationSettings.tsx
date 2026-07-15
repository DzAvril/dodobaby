"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Check, Save, Send, Smartphone } from "lucide-react";
import { jsonRequest, jsonRequestWithTimeout } from "@/lib/client-api";
import type { PushNotificationSettings as Settings } from "@/lib/push-notifications";

type DeviceStatus = "checking" | "unsupported" | "insecure" | "ios-install-required" | "denied" | "unsubscribed" | "subscribed";
const TEST_NOTIFICATION_TIMEOUT_MS = 15_000;

function applicationServerKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replaceAll("-", "+").replaceAll("_", "/");
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  return bytes.buffer;
}

function serializedSubscription(subscription: PushSubscription) {
  const value = subscription.toJSON();
  if (!value.endpoint || !value.keys?.p256dh || !value.keys.auth) throw new Error("浏览器返回的通知订阅不完整");
  return {
    endpoint: value.endpoint,
    expirationTime: value.expirationTime ?? null,
    keys: { p256dh: value.keys.p256dh, auth: value.keys.auth },
  };
}

function isAppleMobileDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandaloneApp() {
  return window.matchMedia("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function hasDifferentApplicationServerKey(subscription: PushSubscription, publicKey: string) {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const actual = new Uint8Array(current);
  const expected = new Uint8Array(applicationServerKey(publicKey));
  return actual.length !== expected.length || actual.some((value, index) => value !== expected[index]);
}

function deviceStatusText(status: DeviceStatus) {
  if (status === "checking") return "正在检查";
  if (status === "unsupported") return "当前浏览器不支持";
  if (status === "insecure") return "需要 HTTPS 安全连接";
  if (status === "ios-install-required") return "请先添加到主屏幕";
  if (status === "denied") return "通知权限已关闭";
  if (status === "subscribed") return "当前设备已开启";
  return "当前设备未开启";
}

function deviceStatusHelp(status: DeviceStatus) {
  if (status === "ios-install-required") return "iPhone 或 iPad 需先在浏览器分享菜单中选择“添加到主屏幕”，再从桌面打开小芽日记。";
  if (status === "insecure") return "通知只能在 HTTPS 网站或本机 localhost 环境中使用。";
  if (status === "denied") return "请在系统或浏览器的网站设置中重新允许通知。";
  if (status === "unsupported") return "请更新系统和浏览器，或换用支持 Web Push 的浏览器。";
  return "";
}

export function PushNotificationSettings({ initialSettings }: { initialSettings: Settings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [enabled, setEnabled] = useState(initialSettings.feedingReminderEnabled);
  const [hours, setHours] = useState(String(initialSettings.feedingReminderMinutes / 60));
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>("checking");
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [pending, setPending] = useState<"save" | "subscribe" | "unsubscribe" | "test" | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [testSent, setTestSent] = useState(false);

  useEffect(() => {
    let active = true;
    async function inspectDevice() {
      if (!window.isSecureContext) {
        if (active) setDeviceStatus("insecure");
        return;
      }
      if (isAppleMobileDevice() && !isStandaloneApp()) {
        if (active) setDeviceStatus("ios-install-required");
        return;
      }
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (active) setDeviceStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (active) setDeviceStatus("denied");
        return;
      }
      const registration = await navigator.serviceWorker.getRegistration();
      const current = await registration?.pushManager.getSubscription() ?? null;
      if (!active) return;
      setSubscription(current);
      setDeviceStatus(current ? "subscribed" : "unsubscribed");
    }
    inspectDevice().catch(() => { if (active) setDeviceStatus("unsupported"); });
    return () => { active = false; };
  }, []);

  async function refreshSettings() {
    const data = await jsonRequest<{ settings: Settings }>("/api/notifications");
    setSettings(data.settings);
    setEnabled(data.settings.feedingReminderEnabled);
    setHours(String(data.settings.feedingReminderMinutes / 60));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const parsedHours = Number(hours);
    const feedingReminderMinutes = Math.round(parsedHours * 60);
    if (!Number.isFinite(parsedHours) || feedingReminderMinutes < 15 || feedingReminderMinutes > 720) {
      setError("提醒间隔需在 0.25 到 12 小时之间");
      return;
    }
    setPending("save");
    setError("");
    setSaved(false);
    try {
      const data = await jsonRequest<{ settings: Settings }>("/api/notifications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ feedingReminderEnabled: enabled, feedingReminderMinutes }),
      });
      setSettings(data.settings);
      setHours(String(data.settings.feedingReminderMinutes / 60));
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败，请稍后重试");
    } finally {
      setPending(null);
    }
  }

  async function subscribe() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
    setPending("subscribe");
    setError("");
    setTestSent(false);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setDeviceStatus(permission === "denied" ? "denied" : "unsubscribed");
        throw new Error("未获得通知权限");
      }
      const registered = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await registered.update().catch(() => undefined);
      const registration = await navigator.serviceWorker.ready;
      let current = await registration.pushManager.getSubscription();
      if (current && hasDifferentApplicationServerKey(current, settings.vapidPublicKey)) {
        await current.unsubscribe();
        current = null;
      }
      current ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(settings.vapidPublicKey) });
      await jsonRequest("/api/notifications/subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(serializedSubscription(current)),
      });
      setSubscription(current);
      setDeviceStatus("subscribed");
      await refreshSettings();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "通知开启失败");
    } finally {
      setPending(null);
    }
  }

  async function unsubscribe() {
    if (!subscription) return;
    setPending("unsubscribe");
    setError("");
    setTestSent(false);
    try {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await jsonRequest("/api/notifications/subscriptions", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });
      setSubscription(null);
      setDeviceStatus("unsubscribed");
      await refreshSettings();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "通知关闭失败");
    } finally {
      setPending(null);
    }
  }

  async function sendTest() {
    if (!subscription) return;
    setPending("test");
    setError("");
    setTestSent(false);
    try {
      if (Notification.permission !== "granted") {
        setDeviceStatus(Notification.permission === "denied" ? "denied" : "unsubscribed");
        throw new Error("当前设备尚未允许通知，请重新开启设备通知");
      }
      await jsonRequestWithTimeout("/api/notifications/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      }, TEST_NOTIFICATION_TIMEOUT_MS, "推送服务响应超时，请稍后重试");
      setTestSent(true);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "测试通知发送失败";
      if (message.includes("订阅已失效")) {
        await subscription.unsubscribe().catch(() => undefined);
        setSubscription(null);
        setDeviceStatus("unsubscribed");
      }
      setError(message);
    } finally {
      setPending(null);
    }
  }

  const deviceReady = deviceStatus === "subscribed";
  const supportHelp = deviceStatusHelp(deviceStatus);
  return (
    <form className="settings-section push-notification-settings" onSubmit={save}>
      <div className="settings-heading"><p className="eyebrow">PWA NOTIFICATIONS</p><h3>喂奶提醒</h3><p>按最后一条喂养记录计时，并向已开启通知的设备发送提醒。</p></div>
      <div className="push-notification-overview">
        <label className="agent-access-toggle"><input type="checkbox" role="switch" aria-label="启用喂奶提醒" checked={enabled} disabled={pending !== null} onChange={(event) => { setEnabled(event.target.checked); setSaved(false); }} /><span className="agent-toggle-track" aria-hidden="true"><i /></span><span><strong>喂奶提醒</strong><small>{enabled ? "已启用" : "已停用"}</small></span></label>
        <div className={`push-device-status ${deviceReady ? "configured" : "empty"}`}>{deviceReady ? <BellRing /> : deviceStatus === "denied" ? <BellOff /> : <Smartphone />}<div><span>当前设备</span><strong>{deviceStatusText(deviceStatus)}</strong><small>共 {settings.subscriptionCount} 台设备已订阅</small></div></div>
      </div>
      <label className="feeding-reminder-interval"><span>距上次喂奶</span><span><input type="number" inputMode="decimal" min="0.25" max="12" step="0.25" value={hours} disabled={pending !== null} onChange={(event) => { setHours(event.target.value); setSaved(false); }} aria-label="喂奶提醒间隔小时数" /><b>小时后提醒</b></span></label>
      {supportHelp && <p className="push-support-note" role="status">{supportHelp}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {saved && <p className="form-success" role="status">喂奶提醒设置已保存</p>}
      {testSent && <p className="form-success" role="status"><Check />测试通知已发送</p>}
      <div className="push-notification-actions">
        <button type="submit" className="secondary-button" disabled={pending !== null}><Save />{pending === "save" ? "保存中…" : "保存提醒设置"}</button>
        {deviceReady ? <button type="button" className="secondary-button" disabled={pending !== null} onClick={sendTest}><Send />{pending === "test" ? "发送中…" : "发送测试通知"}</button> : <button type="button" className="primary-button" disabled={pending !== null || ["unsupported", "insecure", "ios-install-required", "denied"].includes(deviceStatus)} onClick={subscribe}><Bell />{pending === "subscribe" ? "开启中…" : "开启当前设备通知"}</button>}
        {deviceReady && <button type="button" className="secondary-button danger" disabled={pending !== null} onClick={unsubscribe}><BellOff />{pending === "unsubscribe" ? "关闭中…" : "关闭当前设备通知"}</button>}
      </div>
    </form>
  );
}
