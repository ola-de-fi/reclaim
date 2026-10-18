import { z } from "zod";

/**
 * Runtime check on everything an adapter returns. Adapters are the riskiest code we have
 * (third-party APIs, hand-written ABIs), so the engine never trusts their output blindly.
 */
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
/** Calldata cap: a real claim is a few KB; anything near this is junk or an attack. */
export const MAX_HEX_CHARS = 100_000;
const hex = z
  .string()
  .max(MAX_HEX_CHARS)
  .regex(/^0x[0-9a-fA-F]*$/);
const uintString = z.string().regex(/^\d+$/);

const step = z.object({
  label: z.string().min(1).max(80),
  chainId: z.number().int().positive(),
  to: address,
  data: hex,
  value: uintString.optional(),
});

export const claimActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("direct"),
    chainId: z.number().int().positive(),
    to: address,
    data: hex,
    value: uintString.optional(),
  }),
  z.object({ type: z.literal("external"), url: z.url({ protocol: /^https$/ }).max(2_000) }),
  z.object({ type: z.literal("multi_step"), steps: z.array(step).min(1).max(10) }),
  z.object({ type: z.literal("none") }),
]);

export const positionSchema = z.object({
  id: z.string().min(1).max(200),
  adapterId: z.string().min(1).max(200),
  protocol: z.string().min(1).max(80),
  chainId: z.number().int().positive(),
  kind: z.enum(["wallet_asset", "claimable", "pending"]),
  category: z.enum(["bridge", "yield", "airdrop", "pool", "lending", "dust"]),
  asset: z.object({
    symbol: z.string().min(1).max(16),
    address: z.union([address, z.literal("native")]),
    decimals: z.number().int().min(0).max(36),
  }),
  amountRaw: uintString.max(80),
  amountFormatted: z.string().max(40),
  estimatedUsdValue: z.number().finite().nonnegative().nullable(),
  estimatedGasUsd: z.number().finite().nonnegative().nullable().optional(),
  readyAt: z.number().int().positive().optional(),
  claimAction: claimActionSchema,
  risk: z.object({ verified: z.boolean(), notes: z.string().max(300).optional() }),
  source: z.string().min(1).max(300),
});
