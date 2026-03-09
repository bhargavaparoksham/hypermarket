# @hypermarket/web

Web package for Hypermarket.

Current scope:

- Next.js App Router scaffold
- Tailwind CSS setup
- app-level wallet and React Query providers
- environment loader for engine URL, chain ID, and vault address
- initial landing shell for the upcoming trading terminal

Current runtime envs:

- `NEXT_PUBLIC_ENGINE_URL`
- `NEXT_PUBLIC_CHAIN_ID`
- `NEXT_PUBLIC_VAULT_ADDRESS`
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`

Current caveats:

- the trading terminal itself is not built yet
- deposit and withdraw flows are not wired yet
- live wallet UX is injected-wallet only for now
- there is still no dedicated automated web test suite
