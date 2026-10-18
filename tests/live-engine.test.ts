import { describe, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
describe.skipIf(process.env.LIVE !== "1")("live engine", () => {
  it("runs all adapters together", async () => {
    const { createClientFactory } = await import("@/lib/scanner/clients");
    const { getAdapters, runScan } = await import("@/lib/scanner");
    const getClient = createClientFactory();
    const t = Date.now();
    for await (const e of runScan(
      "0x380c87712Bd7bF34F8645d5674aB065Ca249de79",
      getAdapters({}),
      (signal) => ({ getClient, signal, logger: { info() {}, warn: console.warn } }),
    )) {
      console.log(
        ((Date.now() - t) / 1000).toFixed(1) + "s",
        e.type,
        "adapterId" in e ? e.adapterId : "",
        e.type === "adapter_failed" ? e.error.slice(0, 600) : "",
      );
    }
  }, 150_000);
});
