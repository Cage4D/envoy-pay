// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {EnvoyVault} from "../EnvoyVault.sol";
import {EnvoyVaultTestBase, MockUSDC} from "./EnvoyVault.t.sol";

/// @dev Batch setPayees + fuzz tests.
contract EnvoyVaultBatchFuzzTest is EnvoyVaultTestBase {
    function _list(uint256 n) internal pure returns (address[] memory a) {
        a = new address[](n);
        for (uint256 i = 0; i < n; ++i) {
            a[i] = address(uint160(0x10000 + i));
        }
    }

    function test_SetPayees_Exactly100Succeeds() public {
        address[] memory a = _list(100);
        vm.prank(owner);
        vault.setPayees(a, true);
        for (uint256 i = 0; i < 100; ++i) {
            assertTrue(vault.isPayee(a[i]));
        }
    }

    function test_SetPayees_101Reverts() public {
        address[] memory a = _list(101);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(EnvoyVault.TooManyPayees.selector, 101));
        vault.setPayees(a, true);
        assertFalse(vault.isPayee(a[0]));
    }

    function test_SetPayees_EmitsEventPerEntry() public {
        address[] memory a = _list(3);
        for (uint256 i = 0; i < 3; ++i) {
            vm.expectEmit(true, false, false, true, address(vault));
            emit EnvoyVault.PayeeUpdated(a[i], true);
        }
        vm.prank(owner);
        vault.setPayees(a, true);
    }

    function test_SetPayees_BatchRemove() public {
        address[] memory a = _list(3);
        vm.startPrank(owner);
        vault.setPayees(a, true);
        for (uint256 i = 0; i < 3; ++i) {
            vm.expectEmit(true, false, false, true, address(vault));
            emit EnvoyVault.PayeeUpdated(a[i], false);
        }
        vault.setPayees(a, false);
        vm.stopPrank();
        for (uint256 i = 0; i < 3; ++i) {
            assertFalse(vault.isPayee(a[i]));
        }
    }

    function test_SetPayees_EmptyBatchOk() public {
        address[] memory a = new address[](0);
        vm.prank(owner);
        vault.setPayees(a, true);
    }

    function test_SetPayees_InvalidEntryRevertsAtomically() public {
        address[] memory a = new address[](3);
        a[0] = payee2;
        a[1] = address(vault);
        a[2] = stranger;
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(EnvoyVault.InvalidPayee.selector, address(vault)));
        vault.setPayees(a, true);
        assertFalse(vault.isPayee(payee2));
        assertFalse(vault.isPayee(stranger));
    }

    function test_SetPayees_ZeroEntryReverts() public {
        address[] memory a = new address[](1);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(EnvoyVault.InvalidPayee.selector, address(0)));
        vault.setPayees(a, true);
    }

    /// PROPERTY: with no time passing, successful tryPay amounts never sum past the cap.
    function testFuzz_TotalPaidInOneWindowNeverExceedsCap(uint256 a, uint256 b, uint256 c, uint256 d) public {
        uint256 total;
        uint256[4] memory xs = [a, b, c, d];
        for (uint256 i = 0; i < 4; ++i) {
            uint256 amt = bound(xs[i], 0, 2 * CAP);
            if (_tryPay(payee, amt)) total += amt;
            assertLe(total, CAP);
        }
        assertEq(usdc.balanceOf(payee), total);
        assertLe(vault.spent(), CAP);
        assertEq(vault.remainingInWindow(), CAP - total);
    }

    /// PROPERTY: across warps, paid within each distinct window never exceeds the cap.
    function testFuzz_PaidPerWindowNeverExceedsCapWithWarps(uint256[6] memory amts, uint256[6] memory dts) public {
        uint256 windowPaid;
        uint256 lastStart;
        for (uint256 i = 0; i < 6; ++i) {
            skip(bound(dts[i], 0, 2 * DURATION));
            uint256 amt = bound(amts[i], 1, 2 * CAP);
            if (_tryPay(payee, amt)) {
                if (vault.windowStart() != lastStart) {
                    lastStart = vault.windowStart();
                    windowPaid = 0;
                }
                windowPaid += amt;
                assertLe(windowPaid, CAP);
                assertEq(windowPaid, vault.spent());
            }
        }
    }
}

/// @dev Handler driving random owner/agent/donor actions against the vault.
contract EnvoyVaultHandler is Test {
    EnvoyVault public vault;
    MockUSDC public usdc;
    address public owner;
    address public agent;
    address public payee;

    uint256 public totalDeposits;
    uint256 public totalPayments;
    uint256 public totalWithdrawals;
    uint256 public totalDonations;
    uint256 public windowPaid;
    uint256 public lastWindowStart;

    constructor(EnvoyVault v, MockUSDC t, address o, address a, address p) {
        vault = v;
        usdc = t;
        owner = o;
        agent = a;
        payee = p;
    }

    function deposit(uint256 amount) external {
        amount = bound(amount, 1, 1_000e6);
        usdc.mint(owner, amount);
        vm.startPrank(owner);
        usdc.approve(address(vault), amount);
        vault.deposit(amount);
        vm.stopPrank();
        totalDeposits += amount;
    }

    function donate(uint256 amount) external {
        amount = bound(amount, 1, 1_000e6);
        usdc.mint(address(this), amount);
        usdc.transfer(address(vault), amount); // direct transfer, bypasses deposit()
        totalDonations += amount;
    }

    function withdraw(uint256 amount) external {
        uint256 bal = vault.balance();
        if (bal == 0) return;
        amount = bound(amount, 1, bal);
        vm.prank(owner);
        vault.withdraw(owner, amount);
        totalWithdrawals += amount;
    }

    function pay(uint256 amount) external {
        amount = bound(amount, 0, 12e6);
        vm.prank(agent);
        if (vault.tryPay(payee, amount)) {
            totalPayments += amount;
            if (vault.windowStart() != lastWindowStart) {
                lastWindowStart = vault.windowStart();
                windowPaid = 0;
            }
            windowPaid += amount;
        }
    }

    function warpTime(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 0, 2 hours));
    }

    /// Never lowers the cap below what is already spent in the live window.
    function setCap(uint256 newCap) external {
        uint256 floor = vault.spent() == 0 ? 1 : vault.spent();
        newCap = bound(newCap, floor, 20e6);
        vm.prank(owner);
        vault.setCap(newCap);
    }

    function togglePause(bool p) external {
        vm.startPrank(owner);
        if (p && !vault.paused()) vault.pause();
        if (!p && vault.paused()) vault.unpause();
        vm.stopPrank();
    }
}

contract EnvoyVaultInvariantTest is EnvoyVaultTestBase {
    EnvoyVaultHandler internal handler;

    function setUp() public override {
        super.setUp();
        handler = new EnvoyVaultHandler(vault, usdc, owner, agent, payee);
        // the base setUp already deposited FUNDS via vault.deposit
        // (handler ghost totals start at zero, so account for it below)
        targetContract(address(handler));
    }

    /// PROPERTY: balance never falls below deposits - payments - withdrawals (donations only add).
    function invariant_BalanceCoversAccounting() public view {
        uint256 inflow = FUNDS + handler.totalDeposits();
        uint256 outflow = handler.totalPayments() + handler.totalWithdrawals();
        assertGe(vault.balance() + outflow, inflow);
        // stronger: exact once donations are counted
        assertEq(vault.balance(), inflow + handler.totalDonations() - outflow);
    }

    /// PROPERTY: paid in the current window never exceeds the cap.
    function invariant_PaidInWindowWithinCap() public view {
        assertLe(handler.windowPaid(), vault.cap());
        assertLe(vault.spent(), vault.cap());
    }
}
