export type TrackerViewState = "loading" | "error" | "empty" | "content";

export function trackerViewState({ loading, error, hasCurrentData, itemCount }: {
  loading: boolean;
  error: boolean;
  hasCurrentData: boolean;
  itemCount: number;
}): TrackerViewState {
  if (!hasCurrentData) {
    if (error) return "error";
    if (loading) return "loading";
    return "empty";
  }
  return itemCount === 0 ? "empty" : "content";
}
