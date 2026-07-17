"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { MealEditor, type Baby, type FoodCatalogItem } from "@/components/DiaryApp";
import { DiaperRecordForm, type DiaperType } from "@/components/DiaperTracker";
import { FeedingRecordForm, type FeedingRecord } from "@/components/FeedingTracker";
import { GrowthRecordForm } from "@/components/GrowthTracker";
import { MedicationRecordForm } from "@/components/MedicationTracker";
import { SleepRecordForm } from "@/components/SleepTracker";
import { VaccinationRecordForm, type VaccinationRecord } from "@/components/VaccinationTracker";

export type HomeQuickEditor =
  | { kind: "meal" }
  | { kind: "feeding" }
  | { kind: "sleep" }
  | { kind: "diaper"; preset: DiaperType }
  | { kind: "medication" }
  | { kind: "growth" }
  | { kind: "vaccine"; record: VaccinationRecord | null; markCompleted: boolean };

type QuickSection = HomeQuickEditor["kind"];

const TITLES: Record<QuickSection, { eyebrow: string; title: string }> = {
  meal: { eyebrow: "QUICK MEAL", title: "安排今日辅食" },
  feeding: { eyebrow: "QUICK FEEDING", title: "记录一次喂养" },
  sleep: { eyebrow: "QUICK SLEEP", title: "补录睡眠" },
  diaper: { eyebrow: "QUICK DIAPER", title: "详细记录尿布" },
  medication: { eyebrow: "QUICK MEDICATION", title: "补记临时用药" },
  growth: { eyebrow: "QUICK GROWTH", title: "添加生长测量" },
  vaccine: { eyebrow: "QUICK VACCINE", title: "登记疫苗记录" },
};

function editorKey(editor: HomeQuickEditor) {
  if (editor.kind === "diaper") return `${editor.kind}-${editor.preset}`;
  if (editor.kind === "vaccine") return `${editor.kind}-${editor.record?.id ?? "new"}-${editor.markCompleted}`;
  return editor.kind;
}

export function HomeQuickActionDialog({
  baby,
  date,
  editor,
  foods,
  previousFeeding,
  onClose,
  onSaved,
}: {
  baby: Baby;
  date: string;
  editor: HomeQuickEditor | null;
  foods: FoodCatalogItem[];
  previousFeeding?: FeedingRecord | null;
  onClose: () => void;
  onSaved: (section: QuickSection) => void | Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (editor && !dialog.open) dialog.showModal();
    if (!editor && dialog.open) dialog.close();
  }, [editor]);

  async function finish(section: QuickSection) {
    await onSaved(section);
    onClose();
  }

  const heading = editor ? TITLES[editor.kind] : TITLES.feeding;
  return (
    <dialog
      ref={dialogRef}
      className={`home-quick-dialog ${editor?.kind ?? ""}`}
      aria-labelledby="home-quick-dialog-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const outsideDialog = event.clientX < bounds.left || event.clientX > bounds.right
          || event.clientY < bounds.top || event.clientY > bounds.bottom;
        if (outsideDialog) onClose();
      }}
      onClose={onClose}
    >
      <div className="home-quick-dialog-header">
        <div><p className="eyebrow">{heading.eyebrow}</p><h2 id="home-quick-dialog-title">{heading.title}</h2></div>
        <button type="button" className="icon-button" aria-label="关闭快捷记录" onClick={onClose}><X /></button>
      </div>
      {editor && <div className="home-quick-dialog-body" key={editorKey(editor)}>
        {editor.kind === "meal" && <MealEditor date={date} meal={null} foods={foods} onCancel={onClose} onSaved={() => finish("meal")} />}
        {editor.kind === "feeding" && <FeedingRecordForm baby={baby} date={date} record={null} previousRecord={previousFeeding} onCancel={onClose} onSaved={() => finish("feeding")} />}
        {editor.kind === "sleep" && <SleepRecordForm baby={baby} date={date} mode="manual" record={null} onCancel={onClose} onSaved={() => finish("sleep")} />}
        {editor.kind === "diaper" && <DiaperRecordForm baby={baby} date={date} record={null} preset={editor.preset} onCancel={onClose} onSaved={() => finish("diaper")} />}
        {editor.kind === "medication" && <MedicationRecordForm baby={baby} date={date} editor={{ plan: null, scheduledTime: null }} onCancel={onClose} onSaved={() => finish("medication")} />}
        {editor.kind === "growth" && <GrowthRecordForm baby={baby} record={null} onCancel={onClose} onSaved={() => finish("growth")} />}
        {editor.kind === "vaccine" && <VaccinationRecordForm baby={baby} record={editor.record} markCompleted={editor.markCompleted} onCancel={onClose} onSaved={() => finish("vaccine")} />}
      </div>}
    </dialog>
  );
}
