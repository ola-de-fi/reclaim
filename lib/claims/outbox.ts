import { decodeFunctionData, encodeFunctionData, parseAbi, type Address, type Hex } from "viem";
import { ALL_CHAINS, CHAINS } from "@/config/chains";

export const outboxAbi = parseAbi([
  "function isSpent(uint256 index) view returns (bool)",
  "function executeTransaction(bytes32[] proof, uint256 index, address l2Sender, address to, uint256 l2Block, uint256 l1Block, uint256 l2Timestamp, uint256 value, bytes data)",
]);

const gatewayAbi = parseAbi([
  "function finalizeInboundTransfer(address token, address from, address to, uint256 amount, bytes data)",
]);

export interface OutboxClaim {
  /** The verified Outbox being called, and which L2 it belongs to. */
  outbox: Address;
  l2ChainName: string;
  explorerUrl: string;
  /** Decoded from the calldata itself, never from display fields. */
  index: bigint;
  recipient: Address;
  value: bigint;
  /** Non-empty for token withdrawals (the L1 gateway call). */
  innerData: Hex;
  /** For token withdrawals: the token transfer the gateway will make. */
  token?: { address: Address; amount: bigint; recipient: Address };
}

/**
 * Checks a claim transaction before the user may sign it:
 * the target must be a verified canonical Outbox from our config, and the calldata must be
 * a well-formed executeTransaction. Returns what the transaction really does, decoded from
 * the calldata, so the preview can't be spoofed by a bad adapter or tampered API response.
 */
export function inspectOutboxClaim(
  to: Address,
  data: Hex,
  chainId: number,
): { ok: true; claim: OutboxClaim } | { ok: false; reason: string } {
  const owner = ALL_CHAINS.find((c) => {
    const outbox = c.contracts.canonicalBridge.outbox;
    return (
      outbox.status === "verified" &&
      outbox.value.toLowerCase() === to.toLowerCase() &&
      c.settlesTo !== undefined &&
      CHAINS[c.settlesTo].id === chainId
    );
  });
  if (!owner?.settlesTo)
    return { ok: false, reason: "Target is not a verified canonical bridge Outbox." };

  try {
    const decoded = decodeFunctionData({ abi: outboxAbi, data });
    if (decoded.functionName !== "executeTransaction") {
      return { ok: false, reason: "Calldata is not an Outbox executeTransaction call." };
    }
    if (encodeFunctionData({ abi: outboxAbi, ...decoded }).toLowerCase() !== data.toLowerCase()) {
      return { ok: false, reason: "Calldata has unexpected trailing bytes." };
    }
    const [, index, l2Sender, target, , , , value, innerData] = decoded.args;
    let token: OutboxClaim["token"];
    let recipient: Address = target;
    if (innerData !== "0x") {
      const pairs = owner.contracts.canonicalBridge.gatewayPairs;
      const pair =
        pairs.status === "verified"
          ? pairs.value.find((p) => p.l1.toLowerCase() === target.toLowerCase())
          : undefined;
      if (!pair || pair.l2.toLowerCase() !== l2Sender.toLowerCase()) {
        return { ok: false, reason: "Not a canonical token withdrawal." };
      }
      let inner;
      try {
        inner = decodeFunctionData({ abi: gatewayAbi, data: innerData });
      } catch {
        return { ok: false, reason: "Not a canonical token withdrawal." };
      }
      if (
        inner.functionName !== "finalizeInboundTransfer" ||
        encodeFunctionData({ abi: gatewayAbi, ...inner }).toLowerCase() !== innerData.toLowerCase()
      ) {
        return { ok: false, reason: "Not a canonical token withdrawal." };
      }
      const [address, , tokenRecipient, amount] = inner.args;
      token = { address, amount, recipient: tokenRecipient };
      recipient = tokenRecipient;
    }
    return {
      ok: true,
      claim: {
        outbox: to,
        l2ChainName: owner.name,
        explorerUrl: CHAINS[owner.settlesTo].explorer.url,
        index,
        recipient,
        value,
        innerData,
        token,
      },
    };
  } catch {
    return { ok: false, reason: "Calldata could not be decoded." };
  }
}
