import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { getLastNtfyAlert, resetNtfyStatusForTests, sendNtfy } from "./ntfy.ts";

type Call = { url: string; init: RequestInit };

function fakeFetch(responses: Array<number | Error>, calls: Call[]): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift() ?? 200;
    if (next instanceof Error) throw next;
    return new Response(next === 200 ? "{}" : "nope", { status: next });
  }) as typeof fetch;
}

const noSleep = async () => {};

describe("sendNtfy", () => {
  beforeEach(() => resetNtfyStatusForTests());

  it("posts title and priority headers to ntfy.sh/<topic> and records success", async () => {
    const calls: Call[] = [];
    const result = await sendNtfy("my-topic", "Hello", "Body", "urgent", {
      fetchImpl: fakeFetch([200], calls),
      sleep: noSleep,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "https://ntfy.sh/my-topic");
    assert.deepEqual(calls[0]?.init.headers, { Title: "Hello", Priority: "urgent" });
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(result.attempts, 1);
    assert.equal(getLastNtfyAlert()?.ok, true);
    assert.equal(getLastNtfyAlert()?.title, "Hello");
  });

  it("retries network errors and 5xx/429 with backoff, then succeeds", async () => {
    const calls: Call[] = [];
    const sleeps: number[] = [];
    const result = await sendNtfy("t", "Retry", "b", "urgent", {
      fetchImpl: fakeFetch([new TypeError("fetch failed"), 503, 429, 200], calls),
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      baseDelayMs: 100,
    });
    assert.equal(calls.length, 4);
    assert.deepEqual(sleeps, [100, 200, 400]);
    assert.equal(result.ok, true);
    assert.equal(result.attempts, 4);
  });

  it("gives up after the attempt budget and records the error", async () => {
    const calls: Call[] = [];
    const result = await sendNtfy("t", "Down", "b", "urgent", {
      fetchImpl: fakeFetch([new TypeError("getaddrinfo EAI_AGAIN ntfy.sh"), 502, 502, 502], calls),
      sleep: noSleep,
    });
    assert.equal(calls.length, 4);
    assert.equal(result.ok, false);
    assert.equal(result.status, 502);
    assert.match(result.error ?? "", /HTTP 502/);
    assert.equal(getLastNtfyAlert()?.ok, false);
  });

  it("does not retry a 4xx other than 429", async () => {
    const calls: Call[] = [];
    const result = await sendNtfy("t", "Bad", "b", "urgent", { fetchImpl: fakeFetch([403], calls), sleep: noSleep });
    assert.equal(calls.length, 1);
    assert.equal(result.ok, false);
    assert.equal(result.attempts, 1);
  });

  it("records a failure (and does not fetch) when no topic is configured", async () => {
    const calls: Call[] = [];
    const result = await sendNtfy("  ", "Nowhere", "b", "urgent", { fetchImpl: fakeFetch([], calls), sleep: noSleep });
    assert.equal(calls.length, 0);
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /No ntfy topic/);
    assert.equal(getLastNtfyAlert()?.ok, false);
  });
});
