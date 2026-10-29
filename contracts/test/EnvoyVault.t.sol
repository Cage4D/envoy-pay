// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {EnvoyVault} from "../EnvoyVault.sol";

/// @dev 6-decimal USDC stand-in.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

abstract contract EnvoyVaultTestBase is Test {
    EnvoyVault internal vault;
    MockUSDC internal usdc;

    address internal owner = makeAddr("owner");
    address internal agent = makeAddr("agent");
    address internal payee = makeAddr("payee");
    address internal payee2 = makeAddr("payee2");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant U = 1e6; // 1 USDC
    uint256 internal constant CAP = 5 * U;
    uint256 internal constant DURATION = 1 hours;
    uint256 internal constant FUNDS = 100 * U;

    function setUp() public virtual {
        vm.warp(1_000_000);
        usdc = new MockUSDC();
        vault = new EnvoyVault(address(usdc), owner, DURATION, CAP);

        usdc.mint(owner, 1_000_000 * U);
        vm.startPrank(owner);
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(FUNDS);
        vault.setAgent(agent);
        vault.setPayee(payee, true);
        vm.stopPrank();
    }

    function _pay(uint256 amount) internal {
        vm.prank(agent);
        vault.pay(payee, amount);
    }

    function _tryPay(address to, uint256 amount) internal returns (bool ok) {
        vm.prank(agent);
        ok = vault.tryPay(to, amount);
    }
}

contract EnvoyVaultTest is EnvoyVaultTestBase {
    // ---------------------------------------------------------------- constructor
    function test_Constructor_SetsState() public view {
        assertEq(address(vault.usdc()), address(usdc));
        assertEq(vault.owner(), owner);
        assertEq(vault.windowDuration(), DURATION);
        assertEq(vault.cap(), CAP);
        assertEq(vault.windowStart(), 0);
        assertEq(vault.spent(), 0);
        assertEq(vault.agent(), agent);
        assertFalse(vault.paused());
        assertEq(vault.balance(), FUNDS);
        assertEq(vault.remainingInWindow(), CAP);
        assertEq(vault.windowEnd(), 0);
    }

    function test_Constructor_FreshVaultHasNoAgent() public {
        EnvoyVault v = new EnvoyVault(address(usdc), owner, DURATION, CAP);
        assertEq(v.agent(), address(0));
        assertEq(v.balance(), 0);
    }

    function test_Constructor_RevertsOnZeroUsdc() public {
        vm.expectRevert(EnvoyVault.ZeroAddress.selector);
        new EnvoyVault(address(0), owner, DURATION, CAP);
    }

    function test_Constructor_RevertsOnZeroOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new EnvoyVault(address(usdc), address(0), DURATION, CAP);
    }

    function test_Constructor_RevertsOnZeroDuration() public {
        vm.expectRevert(abi.encodeWithSelector(EnvoyVault.InvalidWindowDuration.selector, 0));
        new EnvoyVault(address(usdc), owner, 0, CAP);
    }

    function test_Constructor_RevertsOnDurationAboveYear() public {
        vm.expectRevert(abi.encodeWithSelector(EnvoyVault.InvalidWindowDuration.selector, 365 days + 1));
        new EnvoyVault(address(usdc), owner, 365 days + 1, CAP);
    }

    function test_Constructor_AcceptsBoundaryDurations() public {
        EnvoyVault a = new EnvoyVault(address(usdc), owner, 1, CAP);
        EnvoyVault b = new EnvoyVault(address(usdc), owner, 365 days, CAP);
        assertEq(a.windowDuration(), 1);
        assertEq(b.windowDuration(), 365 days);
    }

    function test_Constructor_RevertsOnZeroCap() public {
        vm.expectRevert(abi.encodeWithSelector(EnvoyVault.InvalidCap.selector, 0));
        new EnvoyVault(address(usdc), owner, DURATION, 0);
    }

    // ---------------------------------------------------------------- deposit
    function test_Deposit_IncreasesBalanceAndEmits() public {
        vm.expectEmit(false, false, false, true, address(vault));
        emit EnvoyVault.Deposited(owner, 7 * U);
        vm.prank(owner);
        vault.deposit(7 * U);
        assertEq(vault.balance(), FUNDS + 7 * U);
    }

    function test_Deposit_RevertsForNonOwner() public {
        usdc.mint(stranger, U);
        vm.startPrank(stranger);
        usdc.approve(address(vault), U);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        vault.deposit(U);
        vm.stopPrank();
    }

    function test_Deposit_RevertsOnZeroAmount() public {
        vm.prank(owner);
        vm.expectRevert(EnvoyVault.ZeroAmount.selector);
        vault.deposit(0);
    }

    function test_Deposit_WorksWhilePaused() public {
        vm.startPrank(owner);
        vault.pause();
        vault.deposit(U);
        vm.stopPrank();
        assertEq(vault.balance(), FUNDS + U);
    }

    // ---------------------------------------------------------------- cap boundary
    function test_Cap_ExactlyCapPasses() public {
        _pay(CAP);
        assertEq(vault.spent(), CAP);
        assertEq(vault.remainingInWindow(), 0);
        assertEq(usdc.balanceOf(payee), CAP);
    }

    function test_Cap_CapPlusOneReverts() public {
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(EnvoyVault.CapExceeded.selector, CAP + 1, CAP));
        vault.pay(payee, CAP + 1);
    }

    function test_Cap_CumulativePaymentsToCap() public {
        _pay(2 * U);
        _pay(3 * U);
        assertEq(vault.spent(), CAP);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(EnvoyVault.CapExceeded.selector, 1, 0));
        vault.pay(payee, 1);
    }

    function test_Cap_CumulativeOverCapReverts() public {
        _pay(4 * U);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(EnvoyVault.CapExceeded.selector, U + 1, U));
        vault.pay(payee, U + 1);
        assertEq(vault.spent(), 4 * U);
    }

    // ---------------------------------------------------------------- window
    function test_Window_FirstPaymentStartsWindow() public {
        uint256 t = block.timestamp;
        _pay(U);
        assertEq(vault.windowStart(), t);
        assertEq(vault.windowEnd(), t + DURATION);
    }

    function test_Window_NoResetOneSecondBeforeEnd() public {
        _pay(CAP);
        uint256 start = vault.windowStart();
        vm.warp(start + DURATION - 1);
        assertEq(vault.remainingInWindow(), 0);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(EnvoyVault.CapExceeded.selector, 1, 0));
        vault.pay(payee, 1);
    }

    function test_Window_ResetsExactlyAtDuration() public {
        _pay(CAP);
        uint256 start = vault.windowStart();
        vm.warp(start + DURATION);
        assertEq(vault.remainingInWindow(), CAP);
        assertEq(vault.windowEnd(), 0);
        _pay(CAP);
        assertEq(vault.windowStart(), start + DURATION);
        assertEq(vault.spent(), CAP);
        assertEq(usdc.balanceOf(payee), 2 * CAP);
    }

    // ---------------------------------------------------------------- allowlist
    function test_Allowlist_NotAllowedReverts() public {
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(EnvoyVault.PayeeNotAllowed.selector, payee2));
        vault.pay(payee2, U);
    }

    function test_Allowlist_AddAndRemove() public {
        vm.expectEmit(true, false, false, true, address(vault));
        emit EnvoyVault.PayeeUpdated(payee2, true);
        vm.prank(owner);
        vault.setPayee(payee2, true);
        assertTrue(vault.isPayee(payee2));
        vm.prank(agent);
        vault.pay(payee2, U);
        assertEq(usdc.balanceOf(payee2), U);

        vm.expectEmit(true, false, false, true, address(vault));
        emit EnvoyVault.PayeeUpdated(payee2, false);
        vm.prank(owner);
        vault.setPayee(payee2, false);
        assertFalse(vault.isPayee(payee2));
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(EnvoyVault.PayeeNotAllowed.selector, payee2));
        vault.pay(payee2, U);
    }

    function test_Allowlist_RejectsZeroAndVault() public {
        vm.startPrank(owner);
        vm.expectRevert(abi.encodeWithSelector(EnvoyVault.InvalidPayee.selector, address(0)));
        vault.setPayee(address(0), true);
        vm.expectRevert(abi.encodeWithSelector(EnvoyVault.InvalidPayee.selector, address(vault)));
        vault.setPayee(address(vault), true);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- pause
    function test_Pause_PayRevertsEnforcedPause() public {
        vm.prank(owner);
        vault.pause();
        assertTrue(vault.paused());
        vm.prank(agent);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.pay(payee, U);
    }

    function test_Pause_TryPayEmitsRejectedReason0() public {
        vm.prank(owner);
        vault.pause();
        vm.expectEmit(true, false, false, true, address(vault));
        emit EnvoyVault.PaymentRejected(agent, payee, U, EnvoyVault.RejectReason.Paused);
        assertFalse(_tryPay(payee, U));
        assertEq(usdc.balanceOf(payee), 0);
        assertEq(vault.spent(), 0);
        assertEq(vault.windowStart(), 0);
    }

    function test_Pause_UnpauseRestoresPayments() public {
        vm.startPrank(owner);
        vault.pause();
        vault.unpause();
        vm.stopPrank();
        assertFalse(vault.paused());
        _pay(U);
        assertEq(usdc.balanceOf(payee), U);
    }

    function test_Pause_PauseAndUnpauseDoNotResetWindow() public {
        _pay(2 * U);
        uint256 start = vault.windowStart();
        vm.startPrank(owner);
        vault.pause();
        vault.unpause();
        vm.stopPrank();
        assertEq(vault.windowStart(), start);
        assertEq(vault.spent(), 2 * U);
    }

    function test_Pause_WithdrawWorksWhilePaused() public {
        vm.startPrank(owner);
        vault.pause();
        vault.withdraw(owner, U);
        vault.withdrawAll(owner);
        vm.stopPrank();
        assertEq(vault.balance(), 0);
    }
}
