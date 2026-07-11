export type DiaperSummaryRecord = {
  diaperType: "wet" | "dirty" | "both";
  skinObservation: "clear" | "red" | "broken" | null;
};

export function summarizeDiapers(records: DiaperSummaryRecord[]) {
  return records.reduce((summary, record) => {
    summary.totalCount += 1;
    if (record.diaperType === "wet" || record.diaperType === "both") summary.wetCount += 1;
    if (record.diaperType === "dirty" || record.diaperType === "both") summary.dirtyCount += 1;
    if (record.skinObservation) summary.skinObservedCount += 1;
    if (record.skinObservation === "red" || record.skinObservation === "broken") summary.skinConcernCount += 1;
    return summary;
  }, { totalCount: 0, wetCount: 0, dirtyCount: 0, skinObservedCount: 0, skinConcernCount: 0 });
}
