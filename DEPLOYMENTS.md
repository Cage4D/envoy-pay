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

| Field | Value |
| --- | --- |
| Network | Arc Mainnet |
| Chain ID | 5042 |
| Vault address | `0x093617F3BD39dbc31D6bF7265B73B99dE36f8e50` |
| Deployment tx hash | `0x3ebb66e6f60bdfe7920ebd48d5cc5997902e215fcff7a600199e85974eca05bb` |
| Deployment block | 28660448 |
| Explorer (vault) | https://explorer.arc.io/address/0x093617F3BD39dbc31D6bF7265B73B99dE36f8e50 |
| Explorer (deployment tx) | https://explorer.arc.io/tx/0x3ebb66e6f60bdfe7920ebd48d5cc5997902e215fcff7a600199e85974eca05bb |

These mainnet values were supplied by the owner. Arc Studio did not deploy this vault and has not verified these values onchain: confirm them yourself on the explorer before relying on them.

If you change either network, keep these places in sync:

- `networks` in `src/config.ts`.
- The matching rewrite destination in `vercel.json`.
- `agent/.env.testnet` or `agent/.env.mainnet`, copied from the `.example` files.
