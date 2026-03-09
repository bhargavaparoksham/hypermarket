const DEFAULT_ENGINE_URL = "http://localhost:4000";
const DEFAULT_CHAIN_ID = 80002;

function parseChainId(rawValue: string | undefined): number {
  if (!rawValue) {
    return DEFAULT_CHAIN_ID;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid NEXT_PUBLIC_CHAIN_ID value: ${rawValue}`);
  }

  return parsed;
}

export interface WebEnv {
  engineUrl: string;
  chainId: number;
  vaultAddress: `0x${string}` | null;
  walletConnectProjectId: string | null;
}

export function loadWebEnv(): WebEnv {
  const engineUrl = process.env.NEXT_PUBLIC_ENGINE_URL || DEFAULT_ENGINE_URL;
  const chainId = parseChainId(process.env.NEXT_PUBLIC_CHAIN_ID);
  const vaultAddress = process.env.NEXT_PUBLIC_VAULT_ADDRESS;
  const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

  return {
    engineUrl,
    chainId,
    vaultAddress:
      vaultAddress && /^0x[a-fA-F0-9]{40}$/.test(vaultAddress)
        ? (vaultAddress as `0x${string}`)
        : null,
    walletConnectProjectId: walletConnectProjectId?.trim() || null
  };
}

export const webEnv = loadWebEnv();
