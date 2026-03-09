import { injected } from "@wagmi/core";
import { createConfig, fallback, http } from "wagmi";
import { polygonAmoy } from "viem/chains";
import { webEnv } from "./env";

const chain = polygonAmoy;

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors: [
    injected({
      shimDisconnect: true
    })
  ],
  transports: {
    [chain.id]: fallback([http()])
  }
});

export const engineUrl = webEnv.engineUrl;
