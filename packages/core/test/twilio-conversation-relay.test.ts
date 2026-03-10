import test from "node:test";
import assert from "node:assert/strict";

import { buildRelayTextTokenMessages, parseConversationRelayMessage } from "../src/lib/twilio/conversation-relay";

test("parseConversationRelayMessage parses setup payload", () => {
  const payload = JSON.stringify({
    type: "setup",
    call: { sid: "CA123", from: "+15550001111" }
  });

  const parsed = parseConversationRelayMessage(payload);
  assert.deepEqual(parsed, {
    type: "setup",
    callSid: "CA123",
    from: "+15550001111"
  });
});

test("parseConversationRelayMessage parses prompt payload variants", () => {
  const payload = JSON.stringify({
    type: "prompt",
    call_sid: "CA456",
    prompt: { transcript: "ship it" }
  });

  const parsed = parseConversationRelayMessage(payload);
  assert.deepEqual(parsed, {
    type: "prompt",
    callSid: "CA456",
    text: "ship it"
  });
});

test("parseConversationRelayMessage rejects invalid payload", () => {
  const parsed = parseConversationRelayMessage("{ bad json");
  assert.equal(parsed, null);
});

test("buildRelayTextTokenMessages preserves token boundaries", () => {
  const messages = buildRelayTextTokenMessages("hello world");
  assert.equal(messages.length, 2);
  assert.equal(messages[0]?.token, "hello ");
  assert.equal(messages[1]?.token, "world");
  assert.equal(messages[1]?.last, true);
});
