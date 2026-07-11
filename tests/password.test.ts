import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPasswordHash } from "../lib/password";

test("家庭密码哈希可以验证正确密码", () => {
  const encoded = hashPassword("a-secure-family-password");
  assert.equal(verifyPasswordHash("a-secure-family-password", encoded), true);
  assert.equal(verifyPasswordHash("wrong-password", encoded), false);
});

test("每次生成的家庭密码哈希使用不同盐值", () => {
  const first = hashPassword("same-password");
  const second = hashPassword("same-password");
  assert.notEqual(first, second);
  assert.equal(verifyPasswordHash("same-password", first), true);
  assert.equal(verifyPasswordHash("same-password", second), true);
});
