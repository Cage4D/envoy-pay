# Deployments

One table per network. These values must match `networks` in `src/config.ts`.

## Testnet

| Field | Value |
| --- | --- |
| Network | Arc Testnet |
| Chain ID | 5042002 |
| Vault address | `0x97f975915cd09eed8d6ff2d0eae3aecfad036de0` |
| Deployment tx hash | `0x75ee605c0d5e782eb38ac96451c070cf46ebc85167f7731a2a2b8fb3ca9f37c7` |
| Deployment block | 69661479 |
| Explorer (vault) | https://explorer.testnet.arc.io/address/0x97f975915cd09eed8d6ff2d0eae3aecfad036de0 |
| Explorer (deployment tx) | https://explorer.testnet.arc.io/tx/0x75ee605c0d5e782eb38ac96451c070cf46ebc85167f7731a2a2b8fb3ca9f37c7 |

## Mainnet

Not deployed. Every value is blank on purpose: fill them in yourself, after your own independent review.

| Field | Value |
| --- | --- |
| Network | |
| Chain ID | |
| Vault address | |
| Deployment tx hash | |
| Deployment block | |
| Explorer (vault) | |
| Explorer (deployment tx) | |

When you deploy to mainnet, also fill these in, all together:

- `networks.mainnet` in `src/config.ts` (all eight fields, including `rpcPath`, which is `/rpc/mainnet`).
- The `/rpc/mainnet` rewrite destination in `vercel.json`. It is a placeholder (`mainnet-rpc-upstream-todo.invalid`) until you replace it with the same value as `upstreamRpcUrl`.
- `agent/.env.mainnet`, copied from `agent/.env.mainnet.example`.
