import { decodeFunctionData, parseAbi, type Address, type Hex } from "viem";

/** ArbRetryableTx precompile: same address on every Arbitrum chain. */
export const ARB_RETRYABLE_TX: Address = "0x000000000000000000000000000000000000006E";

export const retryableAbi = parseAbi([
  "event TicketCreated(bytes32 indexed ticketId)",
  "function getTimeout(bytes32 ticketId) view returns (uint256)",
  "function redeem(bytes32 ticketId) returns (bytes32)",
]);

export const gatewayFinalizeAbi = parseAbi([
  "function finalizeInboundTransfer(address token, address from, address to, uint256 amount, bytes data)",
]);

/** Token gateway deposit carried by a retryable, if its calldata is finalizeInboundTransfer. */
export function decodeGatewayDeposit(
  data: Hex,
): { l1Token: Address; from: Address; to: Address; amount: bigint } | null {
  try {
    const d = decodeFunctionData({ abi: gatewayFinalizeAbi, data });
    const [l1Token, from, to, amount] = d.args;
    return { l1Token, from, to, amount };
  } catch {
    return null;
  }
}
