import { describe, expect, it, vi } from "vitest";
import { readMany, withRetry, type ReadCall } from "@/lib/scanner/multicall";

const call = (n: number) =>
  ({
    address: "0x0000000000000000000000000000000000000001",
    abi: [],
    functionName: `f${n}`,
  }) as unknown as ReadCall;

describe("readMany", () => {
  it("uses Multicall3 in chunks when the chain has it", async () => {
    const multicall = vi.fn(async ({ contracts }: { contracts: unknown[] }) =>
      contracts.map((_, i) => ({ status: "success" as const, result: i })),
    );
    const client = {
      chain: {
        contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
      },
      multicall,
      readContract: vi.fn(),
    };
    const res = await readMany(client as never, [call(1), call(2), call(3)], { chunkSize: 2 });
    expect(multicall).toHaveBeenCalledTimes(2);
    expect(client.readContract).not.toHaveBeenCalled();
    expect(res).toHaveLength(3);
    expect(res.every((r) => r.status === "success")).toBe(true);
  });

  it("falls back to individual reads without Multicall3, keeping order and isolating failures", async () => {
    const readContract = vi.fn(async (c: { functionName: string }) => {
      if (c.functionName === "f2") throw new Error("reverted");
      return c.functionName;
    });
    const client = { chain: { contracts: {} }, multicall: vi.fn(), readContract };
    const res = await readMany(client as never, [call(1), call(2), call(3)], { retries: 0 });
    expect(client.multicall).not.toHaveBeenCalled();
    expect(res[0]).toEqual({ status: "success", result: "f1" });
    expect(res[1]).toMatchObject({ status: "failure" });
    expect(res[2]).toEqual({ status: "success", result: "f3" });
  });

  it("returns nothing for no calls", async () => {
    expect(await readMany({} as never, [])).toEqual([]);
  });
});

describe("withRetry", () => {
  it("retries rate limits, then succeeds", async () => {
    let n = 0;
    const result = await withRetry(
      async () => {
        if (n++ < 2) throw Object.assign(new Error("Too many requests"), { status: 429 });
        return "ok";
      },
      2,
      1,
    );
    expect(result).toBe("ok");
    expect(n).toBe(3);
  });

  it("does not retry a revert", async () => {
    let n = 0;
    await expect(
      withRetry(
        async () => {
          n++;
          throw new Error("execution reverted");
        },
        3,
        1,
      ),
    ).rejects.toThrow("reverted");
    expect(n).toBe(1);
  });
});
