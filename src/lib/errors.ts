import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from 'viem'
import { formatUsdc } from './format'

/**
 * Turns a failed action into one plain sentence.
 * Returns null when the user simply cancelled in their wallet (not an error).
 */
export function describeError(err: unknown): string | null {
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) return null

    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError)
    if (revert instanceof ContractFunctionRevertedError && revert.data) {
      const args = revert.data.args ?? []
      switch (revert.data.errorName) {
        case 'OwnableUnauthorizedAccount':
          return 'Only the vault owner can do this. Connect the owner wallet.'
        case 'EnforcedPause':
          return 'The vault is paused.'
        case 'ExpectedPause':
          return 'The vault is not paused.'
        case 'ZeroAmount':
          return 'Amount must be greater than zero.'
        case 'ZeroAddress':
          return 'The address cannot be the zero address.'
        case 'InsufficientBalance':
          return `Not enough USDC in the vault: asked for ${formatUsdc(args[0] as bigint)}, only ${formatUsdc(args[1] as bigint)} available.`
        case 'InvalidAgent':
          return 'The agent cannot be the zero address, the owner, or the vault itself.'
        case 'InvalidPayee':
          return 'That address cannot be a payee.'
        case 'NoAgent':
          return 'There is no agent to revoke.'
        case 'InvalidCap':
          return 'The cap must be greater than zero.'
        case 'InvalidWindowDuration':
          return 'The window length must be between 1 second and 365 days.'
        case 'OwnershipRenunciationDisabled':
          return 'Ownership cannot be renounced.'
        default:
          return `The vault rejected the action (${revert.data.errorName}).`
      }
    }

    const message = err.shortMessage || err.message
    if (/insufficient funds/i.test(message)) {
      return 'Your wallet does not have enough USDC to pay the network fee.'
    }
    if (/allowance/i.test(message)) {
      return 'USDC allowance is too low. Approve the vault first.'
    }
    if (/exceeds balance|transfer amount/i.test(message)) {
      return 'Your wallet does not have enough USDC for this amount.'
    }
    if (/http|network|fetch|timeout/i.test(message)) {
      return 'Network problem reaching the RPC. Check your connection and try again.'
    }
    return message
  }
  return 'Something went wrong. Please try again.'
}
