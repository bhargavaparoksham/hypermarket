import { contracts } from "@hypermarket/shared";
import { decodeEventLog, createPublicClient, createWalletClient, http } from "viem";
import type { Address, Hex, TransactionReceipt } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygonAmoy } from "viem/chains";
import { EngineConfig } from "../types.js";

interface SettledEventData {
  walletAddress: string;
  pnl: bigint;
  currentBalance: bigint;
  finalBalance: bigint;
}

export interface SettlementReceipt {
  status: "pending" | "confirmed" | "reverted";
  blockNumber?: bigint;
  settledEvent?: SettledEventData;
}

export interface HyperVaultChainClient {
  submitSettlement(walletAddress: string, pnl: bigint): Promise<Hex>;
  getSettlementReceipt(transactionHash: Hex): Promise<SettlementReceipt>;
  readSettledBalance(walletAddress: string): Promise<bigint>;
}

function parsePrivateKey(privateKey: string): Hex {
  return (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as Hex;
}

function extractSettledEvent(receipt: TransactionReceipt): SettledEventData | undefined {
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: contracts.hyperVault.abi,
        data: log.data,
        topics: log.topics
      });

      if (decoded.eventName !== "Settled") {
        continue;
      }

      return {
        walletAddress: decoded.args.user,
        pnl: decoded.args.pnl,
        currentBalance: decoded.args.currentBalance,
        finalBalance: decoded.args.finalBalance
      };
    } catch {
      continue;
    }
  }

  return undefined;
}

export function createHyperVaultChainClient(
  config: Pick<EngineConfig, "polygonRpcUrl" | "vaultManagerPrivateKey" | "hyperVaultAddress">
): HyperVaultChainClient {
  const transport = http(config.polygonRpcUrl);
  const publicClient = createPublicClient({
    chain: polygonAmoy,
    transport
  });
  const walletClient = createWalletClient({
    account: privateKeyToAccount(parsePrivateKey(config.vaultManagerPrivateKey)),
    chain: polygonAmoy,
    transport
  });

  return {
    async submitSettlement(walletAddress, pnl) {
      return walletClient.writeContract({
        address: config.hyperVaultAddress as Address,
        abi: contracts.hyperVault.abi,
        functionName: "settle",
        args: [walletAddress as Address, pnl]
      });
    },

    async getSettlementReceipt(transactionHash) {
      const receipt = await publicClient
        .getTransactionReceipt({ hash: transactionHash })
        .catch((error: { name?: string }) => {
          if (error?.name === "TransactionReceiptNotFoundError") {
            return null;
          }

          throw error;
        });

      if (!receipt) {
        return {
          status: "pending"
        };
      }

      if (receipt.status !== "success") {
        return {
          status: "reverted",
          blockNumber: receipt.blockNumber
        };
      }

      return {
        status: "confirmed",
        blockNumber: receipt.blockNumber,
        settledEvent: extractSettledEvent(receipt)
      };
    },

    async readSettledBalance(walletAddress) {
      return publicClient.readContract({
        address: config.hyperVaultAddress as Address,
        abi: contracts.hyperVault.abi,
        functionName: "settledBalance",
        args: [walletAddress as Address]
      });
    }
  };
}
