import { describe, expect, it } from "vitest";
import { buildShare, formatUsd } from "@/components/share-button";

describe("share", () => {
  it("builds text, url and intent", () => {
    const s = buildShare("https://r.app", "0xabc", 100, 23.5);
    expect(s.text).toBe("I found $124 of forgotten crypto on Robinhood Chain with Reclaim");
    expect(s.url).toBe("https://r.app/scan/0xabc");
    expect(s.intent).toContain("https://x.com/intent/post?text=I%20found");
    expect(s.intent).toContain("&url=https%3A%2F%2Fr.app%2Fscan%2F0xabc");
  });
  it("formats small and invalid values", () => {
    expect(formatUsd(1.5)).toBe("$1.50");
    expect(formatUsd(NaN)).toBe("$0.00");
  });
});
