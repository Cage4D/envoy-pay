// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title EnvoyVault
/// @notice Owner-controlled USDC vault with one spending agent and a fixed lazy window.
/// @dev Non-upgradeable. Amounts use the configured USDC token's six-decimal units.
/// Direct USDC transfers are included in the withdrawable balance; recorded deposits
/// need not equal the balance plus recorded outflows. No native-value entry point exists.
/// Reverting payments cannot retain rejection events: use tryPay for policy rejection logs.
contract EnvoyVault is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Stable rejection codes: 0 Paused, 1 PayeeNotAllowed, 2 ZeroAmount,
    /// 3 CapExceeded, 4 InsufficientBalance. There is deliberately no success member.
    enum RejectReason {
        Paused,
        PayeeNotAllowed,
        ZeroAmount,
        CapExceeded,
        InsufficientBalance
    }

    /// @notice Caller is not the currently registered agent.
    /// @param caller Address attempting the payment.
    error NotAgent(address caller);
    /// @notice Recipient is not allowlisted.
    /// @param payee Requested recipient.
    error PayeeNotAllowed(address payee);
    /// @notice A positive token amount is required.
    error ZeroAmount();
    /// @notice Payment exceeds the current window's remaining allowance.
    /// @param requested Requested USDC payment amount.
    /// @param remaining Remaining USDC allowance in the current window.
    error CapExceeded(uint256 requested, uint256 remaining);
    /// @notice Vault lacks sufficient USDC for the requested outflow.
    /// @param requested Requested USDC outflow amount.
    /// @param available Current USDC balance of the vault.
    error InsufficientBalance(uint256 requested, uint256 available);
    /// @notice A required nonzero address was zero.
    error ZeroAddress();
    /// @notice Agent cannot be zero, the current owner, or this vault.
    /// @param candidate Rejected agent address.
    error InvalidAgent(address candidate);
    /// @notice There is no agent to revoke.
    error NoAgent();
    /// @notice A payee cannot be zero or this vault.
    /// @param candidate Rejected payee address.
    error InvalidPayee(address candidate);
    /// @notice A batch may contain at most 100 payees.
    /// @param count Rejected number of payees in the batch.
    error TooManyPayees(uint256 count);
    /// @notice Window duration must be greater than zero and at most 365 days.
    /// @param duration Rejected window duration in seconds.
    error InvalidWindowDuration(uint256 duration);
    /// @notice Spending cap must be greater than zero.
    /// @param cap Rejected spending cap.
    error InvalidCap(uint256 cap);
    /// @notice Ownership cannot be renounced.
    error OwnershipRenunciationDisabled();

    /// @notice Emitted after an owner deposit.
    /// @param from Owner supplying USDC.
    /// @param amount USDC deposited.
    event Deposited(address from, uint256 amount);
    /// @notice Emitted after an owner withdrawal.
    /// @param to Recipient selected by the owner.
    /// @param amount USDC withdrawn.
    event Withdrawn(address to, uint256 amount);
    /// @notice Emitted when the agent is set and the window resets.
    /// @param agent Newly registered agent.
    event AgentSet(address agent);
    /// @notice Emitted when the agent is cleared and the window resets.
    /// @param agent Previously registered agent.
    event AgentRevoked(address agent);
    /// @notice Emitted for each allowlist update, including batch entries.
    /// @param payee Recipient whose permission was updated.
    /// @param allowed Whether payments to the recipient are allowed.
    event PayeeUpdated(address indexed payee, bool allowed);
    /// @notice Emitted when the spending cap changes without resetting accounting.
    /// @param oldCap Previous cap.
    /// @param newCap New cap.
    event CapUpdated(uint256 oldCap, uint256 newCap);
    /// @notice Emitted when the duration changes and the window resets.
    /// @param oldDuration Previous duration in seconds.
    /// @param newDuration New duration in seconds.
    event WindowDurationUpdated(uint256 oldDuration, uint256 newDuration);
    /// @notice Emitted after a successful payment.
    /// @param agent Agent executing the payment.
    /// @param payee Allowlisted recipient.
    /// @param amount USDC paid.
    /// @param spentInWindow Cumulative spending after this payment.
    /// @param windowEnd Timestamp at which this payment's window expires.
    event PaymentExecuted(
        address agent,
        address indexed payee,
        uint256 amount,
        uint256 spentInWindow,
        uint256 windowEnd
    );
    /// @notice Emitted only for a tryPay policy rejection, never for unauthorized callers.
    /// @param agent Registered agent attempting the payment.
    /// @param payee Requested recipient.
    /// @param amount Requested USDC amount.
    /// @param reason Stable rejection code defined by RejectReason.
    event PaymentRejected(address agent, address indexed payee, uint256 amount, RejectReason reason);

    /// @notice USDC ERC-20 interface, fixed at construction.
    IERC20 public immutable usdc;
    /// @notice Registered spending agent; zero means none.
    address public agent;
    /// @notice Maximum USDC spending in one window.
    uint256 public cap;
    /// @notice Fixed window length in seconds.
    uint256 public windowDuration;
    /// @notice Stored window start; zero means no window has started since reset.
    uint256 public windowStart;
    /// @notice Stored spending; may be stale after expiry or exceed a lowered cap.
    uint256 public spent;
    /// @notice Whether a recipient is currently allowlisted.
    mapping(address => bool) public isPayee;

    /// @notice Restricts payment entry points to the registered agent.
    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent(msg.sender);
        _;
    }

    /// @notice Creates a vault with no agent, payees, or active window.
    /// @param usdc_ USDC ERC-20 address, supplied rather than hardcoded.
    /// @param owner_ Initial owner; validated by OpenZeppelin Ownable.
    /// @param windowDuration_ Window duration, from 1 second through 365 days.
    /// @param cap_ Positive spending cap in six-decimal USDC units.
    constructor(address usdc_, address owner_, uint256 windowDuration_, uint256 cap_)
        Ownable(owner_)
    {
        if (usdc_ == address(0)) revert ZeroAddress();
        if (windowDuration_ == 0 || windowDuration_ > 365 days) revert InvalidWindowDuration(windowDuration_);
        if (cap_ == 0) revert InvalidCap(cap_);
        usdc = IERC20(usdc_);
        windowDuration = windowDuration_;
        cap = cap_;
    }

    /// @notice Deposits USDC from the owner, including while paused.
    /// @dev The owner must first approve this vault on USDC.
    /// @param amount Positive USDC amount to deposit.
    function deposit(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert ZeroAmount();
        emit Deposited(msg.sender, amount);
        usdc.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Withdraws USDC regardless of pause state or agent configuration.
    /// @param to Nonzero recipient chosen by the owner.
    /// @param amount Positive amount not exceeding the vault balance.
    function withdraw(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (amount > balance()) revert InsufficientBalance(amount, balance());
        emit Withdrawn(to, amount);
        usdc.safeTransfer(to, amount);
    }

    /// @notice Withdraws the full USDC balance, including direct transfers, even while paused.
    /// @param to Nonzero recipient chosen by the owner.
    function withdrawAll(address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 amount = balance();
        if (amount == 0) revert ZeroAmount();
        emit Withdrawn(to, amount);
        usdc.safeTransfer(to, amount);
    }

    /// @notice Registers or replaces the agent and resets window start and spending.
    /// @param newAgent Nonzero address other than the current owner or this vault.
    function setAgent(address newAgent) external onlyOwner {
        if (newAgent == address(0) || newAgent == owner() || newAgent == address(this)) {
            revert InvalidAgent(newAgent);
        }
        agent = newAgent;
        _resetWindow();
        emit AgentSet(newAgent);
    }

    /// @notice Revokes the existing agent and resets window start and spending.
    function revokeAgent() external onlyOwner {
        address oldAgent = agent;
        if (oldAgent == address(0)) revert NoAgent();
        agent = address(0);
        _resetWindow();
        emit AgentRevoked(oldAgent);
    }

    /// @notice Updates one recipient's allowlist status.
    /// @param payee Recipient other than zero or this vault.
    /// @param allowed New allowlist status.
    function setPayee(address payee, bool allowed) external onlyOwner {
        _setPayee(payee, allowed);
    }

    /// @notice Atomically updates up to 100 recipients, emitting one event per entry.
    /// @param payees Recipients other than zero or this vault; empty batches are permitted.
    /// @param allowed New allowlist status for every entry.
    function setPayees(address[] calldata payees, bool allowed) external onlyOwner {
        if (payees.length > 100) revert TooManyPayees(payees.length);
        for (uint256 i = 0; i < payees.length; ++i) {
            _setPayee(payees[i], allowed);
        }
    }

    /// @notice Changes the spending cap without changing stored spending or window start.
    /// @dev Lowering the cap below spent leaves zero allowance until expiry or reset.
    /// @param newCap Positive USDC spending cap.
    function setCap(uint256 newCap) external onlyOwner {
        if (newCap == 0) revert InvalidCap(newCap);
        uint256 oldCap = cap;
        cap = newCap;
        emit CapUpdated(oldCap, newCap);
    }

    /// @notice Changes duration and deliberately resets windowStart and spent to zero.
    /// @dev This grants a fresh full allowance on the next successful payment, even
    /// if the previous window had not expired or the duration value is unchanged.
    /// @param newDuration New duration in seconds, greater than zero and at most 365 days.
    function setWindowDuration(uint256 newDuration) external onlyOwner {
        if (newDuration == 0 || newDuration > 365 days) revert InvalidWindowDuration(newDuration);
        uint256 oldDuration = windowDuration;
        windowDuration = newDuration;
        _resetWindow();
        emit WindowDurationUpdated(oldDuration, newDuration);
    }

    /// @notice Pauses agent payments without blocking deposits, withdrawals, or administration.
    function pause() public onlyOwner {
        _pause();
    }

    /// @notice Resumes agent payments without resetting window accounting.
    function unpause() public onlyOwner {
        _unpause();
    }

    /// @notice Always reverts to preserve an owner capable of recovering USDC.
    function renounceOwnership() public override onlyOwner {
        revert OwnershipRenunciationDisabled();
    }

    /// @notice Pays an allowlisted recipient or reverts with the first policy error.
    /// @dev Check order: pause, allowlist, zero amount, cap, balance. A revert cannot
    /// retain a rejection event. Token errors bubble and roll back all accounting.
    /// @param payee Requested recipient.
    /// @param amount USDC amount to pay.
    function pay(address payee, uint256 amount) external onlyAgent nonReentrant {
        (bool ok, RejectReason reason) = _checkPayment(payee, amount);
        if (!ok) {
            if (reason == RejectReason.Paused) revert EnforcedPause();
            if (reason == RejectReason.PayeeNotAllowed) revert PayeeNotAllowed(payee);
            if (reason == RejectReason.ZeroAmount) revert ZeroAmount();
            if (reason == RejectReason.CapExceeded) revert CapExceeded(amount, remainingInWindow());
            revert InsufficientBalance(amount, balance());
        }
        _executePayment(payee, amount);
    }

    /// @notice Attempts a payment, logging and returning false on a policy rejection.
    /// @dev Rejected attempts never change window accounting. Unauthorized callers
    /// and token call failures still revert; external token errors are not caught.
    /// @param payee Requested recipient.
    /// @param amount USDC amount to pay.
    /// @return success True only after a successful token transfer.
    function tryPay(address payee, uint256 amount) external onlyAgent nonReentrant returns (bool success) {
        (bool ok, RejectReason reason) = _checkPayment(payee, amount);
        if (!ok) {
            emit PaymentRejected(msg.sender, payee, amount, reason);
            return false;
        }
        _executePayment(payee, amount);
        return true;
    }

    /// @notice Returns available spending, treating expired or unstarted windows as fresh.
    /// @return remaining Full cap if expired/unstarted, otherwise saturating cap minus spent.
    function remainingInWindow() public view returns (uint256 remaining) {
        if (_windowExpired()) return cap;
        if (spent >= cap) return 0;
        return cap - spent;
    }

    /// @notice Returns the active window's end timestamp, or zero if expired or unstarted.
    /// @return endTimestamp Active window end, or zero when no window is active.
    function windowEnd() public view returns (uint256 endTimestamp) {
        if (_windowExpired()) return 0;
        return windowStart + windowDuration;
    }

    /// @notice Returns the vault's current USDC balance, including direct token transfers.
    /// @return amount Current ERC-20 USDC balance.
    function balance() public view returns (uint256 amount) {
        return usdc.balanceOf(address(this));
    }

    /// @notice Checks payment policy without writing any state, using effective lazy accounting.
    /// @param payee Requested recipient.
    /// @param amount Requested USDC amount.
    /// @return ok Whether every policy check passed.
    /// @return reason First failure code; ignored when ok is true (there is no success enum).
    function _checkPayment(address payee, uint256 amount) internal view returns (bool ok, RejectReason reason) {
        if (paused()) return (false, RejectReason.Paused);
        if (!isPayee[payee]) return (false, RejectReason.PayeeNotAllowed);
        if (amount == 0) return (false, RejectReason.ZeroAmount);
        if (amount > remainingInWindow()) return (false, RejectReason.CapExceeded);
        if (amount > balance()) return (false, RejectReason.InsufficientBalance);
        return (true, RejectReason.Paused);
    }

    /// @notice Commits a validated payment's accounting before transferring tokens.
    /// @dev Called only after the shared check under a nonReentrant payment entry point.
    /// @param payee Validated allowlisted recipient.
    /// @param amount Validated positive USDC amount within the remaining allowance.
    function _executePayment(address payee, uint256 amount) internal {
        if (_windowExpired()) {
            windowStart = block.timestamp;
            spent = 0;
        }
        spent += amount;
        emit PaymentExecuted(msg.sender, payee, amount, spent, windowStart + windowDuration);
        usdc.safeTransfer(payee, amount);
    }

    /// @notice Reports whether stored window accounting should be treated as fresh.
    /// @return expired True if no window has started or its duration has elapsed.
    function _windowExpired() internal view returns (bool expired) {
        return windowStart == 0 || block.timestamp >= windowStart + windowDuration;
    }

    /// @notice Clears stored window start and spending without starting a new window.
    function _resetWindow() internal {
        windowStart = 0;
        spent = 0;
    }

    /// @notice Validates and writes one allowlist entry.
    /// @param payee Recipient other than zero or this vault.
    /// @param allowed New allowlist status.
    function _setPayee(address payee, bool allowed) internal {
        if (payee == address(0) || payee == address(this)) revert InvalidPayee(payee);
        isPayee[payee] = allowed;
        emit PayeeUpdated(payee, allowed);
    }
}
