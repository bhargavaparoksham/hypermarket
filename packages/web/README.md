# @hypermarket/web

Web package for Hypermarket.

Current scope:

- Next.js App Router scaffold
- Tailwind CSS setup
- app-level wallet and React Query providers
- environment loader for engine URL, chain ID, and vault address
- core trading terminal layout
- live engine-backed market watchlist and market detail reads
- read-only account summary, positions, and order ticket shells

Current runtime envs:

- `NEXT_PUBLIC_ENGINE_URL`
- `NEXT_PUBLIC_CHAIN_ID`
- `NEXT_PUBLIC_VAULT_ADDRESS`
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`

Current caveats:

- deposit and withdraw flows are not wired yet
- account and positions engine endpoints are not exposed yet
- order submission is not wired yet
- live wallet UX is injected-wallet only for now
- there is still no dedicated automated web test suite
