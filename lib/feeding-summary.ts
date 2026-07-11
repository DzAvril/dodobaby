export type FeedingSummary = {
  sessionCount: number;
  directMinutes: number;
  expressedMilkMl: number;
  formulaMl: number;
  bottleMl: number;
};

type FeedingAmounts = {
  leftDurationMinutes: number | null;
  rightDurationMinutes: number | null;
  expressedMilkMl: number | null;
  formulaMl: number | null;
};

export function summarizeFeedings(records: FeedingAmounts[]): FeedingSummary {
  const totals = records.reduce(
    (summary, record) => ({
      directMinutes: summary.directMinutes + (record.leftDurationMinutes ?? 0) + (record.rightDurationMinutes ?? 0),
      expressedMilkMl: summary.expressedMilkMl + (record.expressedMilkMl ?? 0),
      formulaMl: summary.formulaMl + (record.formulaMl ?? 0),
    }),
    { directMinutes: 0, expressedMilkMl: 0, formulaMl: 0 },
  );
  return {
    sessionCount: records.length,
    ...totals,
    bottleMl: totals.expressedMilkMl + totals.formulaMl,
  };
}
