import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DiaperRecordForm, DiaperTracker } from "../components/DiaperTracker";

const baby = { id: "baby-1", name: "DoDo", birthDate: "2026-01-01", timezone: "Asia/Shanghai" };

test("尿布模块首次渲染只显示加载状态并保留三种快速入口", () => {
  const html = renderToStaticMarkup(createElement(DiaperTracker, { baby }));
  assert.match(html, /DoDo的尿布记录/);
  assert.match(html, /正在整理今日尿布记录/);
  assert.match(html, /快速选择尿布类型/);
  assert.match(html, /小便/);
  assert.match(html, /大便/);
  assert.match(html, /两者都有/);
  assert.doesNotMatch(html, /diaper-summary-grid/);
  assert.doesNotMatch(html, /记录今天第一次换尿布/);
  assert.match(html, /aria-labelledby="diaper-dialog-title"/);
});

test("大便预选表单只展开相关观察且皮肤默认未记录", () => {
  const html = renderToStaticMarkup(createElement(DiaperRecordForm, {
    baby,
    date: "2026-07-11",
    record: null,
    preset: "dirty",
    onSaved: () => undefined,
    onCancel: () => undefined,
  }));
  assert.match(html, /尿布类型/);
  assert.match(html, /大便观察/);
  assert.doesNotMatch(html, /小便观察/);
  assert.match(html, /颜色/);
  assert.match(html, /性状/);
  assert.match(html, /皮肤观察/);
  assert.match(html, /未记录/);
  assert.match(html, /不作医疗判断/);
  assert.match(html, /maxLength="300"/);
});
