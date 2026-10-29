# Envoy Pay

Envoy Pay lets an owner fund a USDC vault and give a single agent (a bot or wallet) a tightly limited allowance to pay approved recipients on Arc.

Built with [Arc Studio](https://studio.arc.io)

## Tech stack

- Solidity 0.8.28 (Paris EVM target), OpenZeppelin Contracts 5.1.0
- Foundry (forge) for build and tests
- Owner dashboard: Vite, React, TypeScript, wagmi and viem (browser wallet only, no keys in the frontend)
- Agent demo script: Node.js (20.6 or newer) with TypeScript, run through `tsx`
- Target network: Arc Testnet (chain ID 5042002), USDC at `0x3600000000000000000000000000000000000000` (6 decimals)

## EnvoyVault

`contracts/EnvoyVault.sol` is a USDC vault with one owner and one agent.

- The owner deposits USDC, registers one agent address, and keeps an allowlist of payees.
- The owner sets a spending cap per time window (for example 5 USDC per hour). Cap and window length are set when the contract is deployed and the owner can change them later.
- The agent can pay only allowlisted payees, and only up to the cap in the current window. The window starts at the agent's first payment and the spent amount resets automatically once the window length has passed.
- The owner can pause payments, revoke or replace the agent, and withdraw unspent USDC at any time, including while paused.
- Ownership transfers in two steps and can never be renounced.

### Paying and rejected payments

- `pay(payee, amount)` reverts with a clear error when a rule is broken.
- `tryPay(payee, amount)` never reverts on a rule break. It emits `PaymentRejected` and returns `false`, so rejected attempts stay visible in the event log. A reverting call would erase its own events, which is why this is a separate function.
- Only the registered agent can use either function. Anyone else always reverts and never writes events.
- Every successful payment emits `PaymentExecuted`.

`PaymentRejected` reason codes are fixed and will not be renumbered:

| Code | Reason |
| --- | --- |
| 0 | Paused |
| 1 | PayeeNotAllowed |
| 2 | ZeroAmount |
| 3 | CapExceeded |
| 4 | InsufficientBalance |

Checks run in that order. If the owner lowers the cap below what was already spent in the window, the remaining allowance reads as 0 and payments are rejected as `CapExceeded` until the window ends.

### Behaviours to know about

- **Changing the window length resets the window.** `setWindowDuration` deliberately sets the spent amount back to zero, so the agent gets a fresh full cap on its next payment. Changing the agent also resets the window. Changing only the cap does not.
- **Immutable.** The contract cannot be upgraded. A fix means deploying a new vault and withdrawing from the old one.
- **Fixed-window boundary burst (known limitation).** An agent can spend a full cap at the end of one window and another full cap right after it resets, so up to 2x the cap can leave the vault in a short span. Keep the cap small enough that this is acceptable. Rolling windows are a possible future improvement.
- **Stray USDC.** Anyone can send USDC directly to the vault. It counts toward the balance and the owner can withdraw it. Because Arc USDC is also the gas coin with more decimals, a force-sent remainder smaller than 0.000001 USDC cannot be withdrawn. This was reviewed and accepted.
- **USDC blocklist.** If a payee is blocked by USDC, payments to it revert. Remove that payee from the allowlist.

## Development

Prerequisites: [Foundry](https://book.getfoundry.sh/) and [Bun](https://bun.sh/).

Install dependencies:

```bash
bun install
git clone --depth 1 --branch v1.9.7 https://github.com/foundry-rs/forge-std node_modules/forge-std
```

Build and test:

```bash
forge build
forge test
```

The tests cover the cap, window reset, allowlist, pause, revoke and replace agent, withdraw, access control, events, and rejection reasons, plus fuzz and invariant tests. The invariant checks that the vault balance is at least deposits minus payments minus withdrawals, because direct USDC transfers can raise the balance.

A static analysis run (Slither) reported no serious findings. Its two medium notes are the intentional zero-value checks and the window-start sentinel.

### Environment variables

The dashboard reads none. All of its chain details live in `src/config.ts`.

The agent demo script reads `agent/.env` (gitignored; copy `agent/.env.example`):

| Variable | Purpose |
| --- | --- |
| `AGENT_PRIVATE_KEY` | Key of the registered agent. Use a dedicated test key. |
| `RPC_URL`, `CHAIN_ID`, `CHAIN_NAME`, `EXPLORER_BASE_URL`, `USDC_DECIMALS` | Network details |
| `VAULT_ADDRESS` | The deployed EnvoyVault |
| `ALLOWED_PAYEE` | An address the owner has allowlisted |
| `NOT_ALLOWED_PAYEE` | Optional. An address that is not a payee (defaults to the `0x...dEaD` burn address) |
| `PAY_AMOUNT_USDC` | Optional. Amount for the first demo step (default 0.01). The script stops before sending anything if it exceeds the remaining allowance or the vault balance. |

## Owner dashboard

A static single-page app for the vault owner.

```bash
bun install
bun run dev        # http://localhost:5173
bun run build      # production build in dist/
```

- Connect the owner wallet (a browser wallet; the app never handles a private key).
- It shows the vault balance, agent, payees, cap, window length, spent, remaining and time until the window resets, in 6-decimal USDC.
- Owner actions: approve and deposit, withdraw, set or revoke the agent, add or remove payees, set the cap, set the window length, and pause or unpause. If you connect a wallet that is not the owner, the actions stay disabled.
- A live feed lists `PaymentExecuted` and `PaymentRejected` events with the reason label and a link to each transaction. It reads recent blocks in small ranges every few seconds.
- The payee list is rebuilt from the vault's `PayeeUpdated` events, starting at the deployment block, and checked against the chain.

### How the dashboard reaches the RPC

Browsers such as Firefox and Brave can block a direct request to the RPC from a web page. So the dashboard only ever calls a same-origin path, `/rpc`, and the server forwards it:

- in development (`bun run dev`, `bun run preview`) the Vite proxy in `vite.config.ts` forwards `/rpc`
- on Vercel, the rewrite in `vercel.json` forwards `/rpc` (POST requests pass through)

All reads (vault state, balances, payees, event logs) use this path through a plain HTTP client. The wallet is only used to sign transactions. If the vault cannot be read, the page shows the underlying error under "Show error details".

The agent script is separate: it runs locally and calls the RPC directly, using `RPC_URL` from `agent/.env`.

### Pointing it at another network or vault

Edit `src/config.ts`: chain ID, RPC, explorer, vault and USDC addresses, and the vault's deployment block. Keep `upstreamRpcUrl` in `src/config.ts` and the rewrite destination in `vercel.json` identical: change them together.

### Deploy to Vercel

Import the repository in Vercel and use: framework preset Vite, build command `bun run build` (or `npm run build`), output directory `dist`. No environment variables are needed. `vercel.json` already contains the `/rpc` rewrite, so reads work without any extra setup.

## Agent demo script

Runs on your machine only. It is not part of the deployed site.

1. The owner sets your agent address as the agent and allowlists a payee (from the dashboard), then deposits some USDC.
2. Fund the agent wallet with a little testnet USDC for gas (Arc pays gas in USDC).
3. Set it up and run:

```bash
cp agent/.env.example agent/.env   # then fill in AGENT_PRIVATE_KEY and ALLOWED_PAYEE
bun run agent
```

The script checks the setup, then runs three `tryPay` calls and prints each transaction hash and explorer link:

- (a) pay the allowlisted payee, which logs `PaymentExecuted`
- (b) try a payee that is not allowlisted, which logs `PaymentRejected` with reason 1
- (c) try to pay more than the cap, which logs `PaymentRejected` with reason 3

Other scripts: `bun run typecheck` checks the dashboard and agent code.

## Testnet deployment

EnvoyVault is deployed on Arc Testnet at `0x97f975915cd09eed8d6ff2d0eae3aecfad036de0` ([explorer](https://explorer.testnet.arc.io/address/0x97f975915cd09eed8d6ff2d0eae3aecfad036de0)), with a 5 USDC cap per 3600-second window.

## Design

The full design is in `contracts/EnvoyVault-design.md`.
