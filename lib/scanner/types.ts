import type { Address, Hex, PublicClient } from "viem";

/**
 * Scanner data model. Types only: no scanning logic lives here yet (Phase 1).
 *
 * `kind` keeps three things apart so the headline number stays honest:
 * - wallet_asset: already in the wallet (e.g. dust). Never counted as "recoverable".
 * - claimable:    can be claimed right now.
 * - pending:      will become claimable later (e.g. a bridge withdrawal in its challenge period).
 */
export type PositionKind = "wallet_asset" | "claimable" | "pending";

export type PositionCategory = "bridge" | "yield" | "airdrop" | "pool" | "lending" | "dust";

export interface PositionAsset {
  symbol: string;
  address: Address | "native";
  decimals: number;
}

export type ClaimAction =
  | { type: "direct"; chainId: number; to: Address; data: Hex; value?: string }
  | { type: "external"; url: string }
  | {
      type: "multi_step";
      steps: Array<{ label: string; chainId: number; to: Address; data: Hex; value?: string }>;
    }
  | { type: "none" };

export interface ClaimablePosition {
  id: string;
  adapterId: string;
  protocol: string;
  chainId: number;
  kind: PositionKind;
  category: PositionCategory;
  asset: PositionAsset;
  /** bigint serialised as a decimal string */
  amountRaw: string;
  amountFormatted: string;
  estimatedUsdValue: number | null;
  /** Estimated gas cost to recover, so the UI can show net value. */
  estimatedGasUsd?: number | null;
  /** Unix seconds when a pending position becomes claimable. */
  readyAt?: number;
  claimAction: ClaimAction;
  risk: { verified: boolean; notes?: string };
  /** Link to the contract / explorer / docs this position was derived from. */
  source: string;
}

export interface ScanLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
}

export interface ScanContext {
  getClient(chainId: number): PublicClient;
  signal: AbortSignal;
  logger: ScanLogger;
}

export interface ProtocolAdapter {
  id: string;
  name: string;
  category: PositionCategory;
  supportedChainIds: number[];
  /** Overrides the engine default, for adapters that walk long histories. */
  timeoutMs?: number;
  scanAddress(address: Address, ctx: ScanContext): Promise<ClaimablePosition[]>;
}
