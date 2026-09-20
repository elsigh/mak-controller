import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prepareProxyHeaders } from "./proxy.ts";

describe("prepareProxyHeaders", () => {
  it("preserves the browser Host as x-forwarded-host when proxying to the web container", () => {
    const incoming = new Headers({
      host: "elsigh-studio",
      origin: "http://elsigh-studio",
      "content-length": "12",
      "accept-encoding": "gzip",
    });
    const headers = prepareProxyHeaders(incoming, new URL("http://elsigh-studio/"), "web:3000");

    assert.equal(headers.get("host"), "web:3000");
    assert.equal(headers.get("x-forwarded-host"), "elsigh-studio");
    assert.equal(headers.get("x-forwarded-proto"), "http");
    assert.equal(headers.get("origin"), "http://elsigh-studio");
    assert.equal(headers.has("content-length"), false);
    assert.equal(headers.has("accept-encoding"), false);
  });

  it("keeps an existing public x-forwarded-host instead of the container Host", () => {
    const incoming = new Headers({
      host: "makgrill-bridge",
      "x-forwarded-host": "grill.home",
      "x-forwarded-proto": "https",
    });
    const headers = prepareProxyHeaders(incoming, new URL("http://makgrill-bridge/"), "web:3000");

    assert.equal(headers.get("host"), "web:3000");
    assert.equal(headers.get("x-forwarded-host"), "grill.home");
    assert.equal(headers.get("x-forwarded-proto"), "https");
  });
});
