const INVALID_PUBLIC_HOST_SUFFIXES = [".local", ".localhost", ".test", ".invalid"];

function isPublicHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!normalized || normalized === "localhost" || normalized === "0.0.0.0" || normalized === "::1") return false;
  if (INVALID_PUBLIC_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) return false;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized) || normalized.includes(":")) return false;
  return normalized.includes(".");
}

function validConfiguredSubject(value: string) {
  if (value.startsWith("mailto:")) {
    const address = value.slice("mailto:".length).split("?", 1)[0];
    const separator = address.lastIndexOf("@");
    return separator > 0 && isPublicHostname(address.slice(separator + 1));
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && isPublicHostname(url.hostname);
  } catch {
    return false;
  }
}

export function resolveVapidSubject(input: { configuredSubject?: string; appUrl?: string }) {
  const configuredSubject = input.configuredSubject?.trim();
  if (configuredSubject) {
    if (validConfiguredSubject(configuredSubject)) return configuredSubject;
    throw new Error("DODOBABY_VAPID_SUBJECT 必须是使用公开域名的 mailto: 或 HTTPS 地址");
  }

  const appUrl = input.appUrl?.trim();
  if (appUrl) {
    try {
      const url = new URL(appUrl);
      if (url.protocol === "https:" && !url.username && !url.password && isPublicHostname(url.hostname)) return url.origin;
    } catch {
      // The actionable configuration error below covers malformed APP_URL values.
    }
  }
  throw new Error("Web Push 需要公开 HTTPS 的 APP_URL，或单独配置 DODOBABY_VAPID_SUBJECT");
}
