export async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (response.status === 401) {
    window.location.assign("/login");
    throw new Error("请先登录");
  }
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "请求失败，请稍后重试");
  return data;
}
