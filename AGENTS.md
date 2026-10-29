# Project notes

## Deployed contracts

- EnvoyVault on Arc Testnet (5042002): `0x97f975915cd09eed8d6ff2d0eae3aecfad036de0`
  - Deploy tx: `0x75ee605c0d5e782eb38ac96451c070cf46ebc85167f7731a2a2b8fb3ca9f37c7`
  - Constructor args: usdc `0x3600000000000000000000000000000000000000`, owner `0x3764A7aB2Ad4fee2d98904eEf4fe227232D49206`, windowDuration `3600`, cap `5000000`
  - Deployed by the shared Arc Studio deployer, which holds no role. The owner is the address above.

## Decisions

- Immutable vault, Ownable2Step, renounce disabled.
- Native-precision dust below 0.000001 USDC is unrecoverable by design (accepted).
- Foundry setup: forge-std v1.9.7 is cloned into node_modules (not tracked); see README.
