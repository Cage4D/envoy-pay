// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Vm} from "forge-std/Vm.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {EnvoyVault} from "../EnvoyVault.sol";
import {EnvoyVaultTestBase} from "./EnvoyVault.t.sol";

contract EnvoyVaultAdminTest is EnvoyVaultTestBase {
    // ---------------------------------------------------------------- withdraw
    function test_Withdraw_Partial() public {
        vm.expectEmit(false, false, false, true, address(vault));
        emit EnvoyVault.Withdrawn(stranger, 30 * U);
        vm.prank(owner);
        vault.withdraw(stranger, 30 * U);
        assertEq(usdc.balanceOf(stranger), 30 * U);
        assertEq(vault.balance(), FUNDS - 30 * U);
    }

    function test_Withdraw_ExactBalance() public {
        vm.prank(owner);
        vault.withdraw(owner, FUNDS);
        assertEq(vault.balance(), 0);
    }

    function test_Withdraw_RevertsToZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(EnvoyVault.ZeroAddress.selector);
        vault.withdraw(address(0), U);
    }

    function test_Withdraw_RevertsOnZeroAmount() public {
        vm.prank(owner);
        vm.expectRevert(EnvoyVault.ZeroAmount.selector);
        vault.withdraw(owner, 0);
    }

    function test_Withdraw_RevertsWhenInsufficient() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(EnvoyVault.InsufficientBalance.selector, FUNDS + 1, FUNDS));
        vault.withdraw(owner, FUNDS + 1);
    }

    function test_Withdraw_WorksAfterAgentRevoked() public {
        vm.startPrank(owner);
        vault.revokeAgent();
        vault.withdraw(owner, U);
        vm.stopPrank();
        assertEq(vault.balance(), FUNDS - U);
    }

    function test_WithdrawAll_SendsEverythingAndEmits() public {
        vm.expectEmit(false, false, false, true, address(vault));
        emit EnvoyVault.Withdrawn(stranger, FUNDS);
        vm.prank(owner);
        vault.withdrawAll(stranger);
        assertEq(usdc.balanceOf(stranger), FUNDS);
        assertEq(vault.balance(), 0);
    }

    function test_WithdrawAll_RevertsToZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(EnvoyVault.ZeroAddress.selector);
        vault.withdrawAll(address(0));
    }

    function test_WithdrawAll_RevertsWhenEmpty() public {
        vm.startPrank(owner);
        vault.withdrawAll(owner);
        vm.expectRevert(EnvoyVault.ZeroAmount.selector);
        vault.withdrawAll(owner);
        vm.stopPrank();
    }

    function test_Withdraw_DirectTransferIsWithdrawable() public {
        usdc.mint(stranger, 9 * U);
        vm.prank(stranger);
        usdc.transfer(address(vault), 9 * U);
        assertEq(vault.balance(), FUNDS + 9 * U);
        vm.prank(owner);
        vault.withdrawAll(owner);
        assertEq(vault.balance(), 0);
    }

    // ---------------------------------------------------------------- agent mgmt
    function test_SetAgent_EmitsAndSets() public {
        address newAgent = makeAddr("newAgent");
        vm.expectEmit(false, false, false, true, address(vault));
        emit EnvoyVault.AgentSet(newAgent);
        vm.prank(owner);
        vault.setAgent(newAgent);
        assertEq(vault.agent(), newAgent);
    }

    function test_SetAgent_RejectsZeroOwnerVault() public {
        vm.startPrank(owner);
        vm.expectRevert(abi.encodeWithSelector(EnvoyVault.InvalidAgent.selector, address(0)));
        vault.setAgent(address(0));
        vm.expectRevert(abi.encodeWithSelector(EnvoyVault.InvalidAgent.selector, owner));
        vault.setAgent(owner);
        vm.expectRevert(abi.encodeWithSelector(EnvoyVault.InvalidAgent.selector, address(vault)));
        vault.setAgent(address(vault));
        vm.stopPrank();
        assertEq(vault.agent(), agent);
    }

    function test_RevokeAgent_BlocksPayAndTryPay() public {
        _pay(U);
        vm.expectEmit(false, false, false, true, address(vault));
        emit EnvoyVault.AgentRevoked(agent);
        vm.prank(owner);
        vault.revokeAgent();
        assertEq(vault.agent(), address(0));
        assertEq(vault.windowStart(), 0);
        assertEq(vault.spent(), 0);

        vm.startPrank(agent);
        vm.expectRevert(abi.encodeWithSelector(EnvoyVault.NotAgent.selector, agent));
        vault.pay(payee, U);
        vm.expectRevert(abi.encodeWithSelector(EnvoyVault.NotAgent.selector, agent));
        vault.tryPay(payee, U);
        vm.stopPrank();
    }

    function test_RevokeAgent_RevertsWhenNoAgent() public {
        vm.startPrank(owner);
        vault.revokeAgent();
        vm.expectRevert(EnvoyVault.NoAgent.selector);
        vault.revokeAgent();
        vm.stopPrank();
    }

    function test_ReplaceAgent_OldBlockedNewWorksWindowResets() public {
        _pay(4 * U);
        address newAgent = makeAddr("newAgent");
        vm.prank(owner);
        vault.setAgent(newAgent);
        assertEq(vault.windowStart(), 0);
        assertEq(vault.spent(), 0);
        assertEq(vault.remainingInWindow(), CAP);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(EnvoyVault.NotAgent.selector, agent));
        vault.pay(payee, U);

        vm.prank(newAgent);
        vault.pay(payee, CAP); // full fresh cap available
        assertEq(usdc.balanceOf(payee), 4 * U + CAP);
    }

    // ---------------------------------------------------------------- access control
    function _expectUnauthorized() internal {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
    }

    function test_AccessControl_OwnerOnlyFunctionsRevertForStranger() public {
        address[] memory list = new address[](1);
        list[0] = payee2;
        vm.startPrank(stranger);
        _expectUnauthorized();
        vault.withdraw(stranger, 1);
        _expectUnauthorized();
        vault.withdrawAll(stranger);
        _expectUnauthorized();
        vault.setAgent(stranger);
        _expectUnauthorized();
        vault.revokeAgent();
        _expectUnauthorized();
        vault.setPayee(payee2, true);
        _expectUnauthorized();
        vault.setPayees(list, true);
        _expectUnauthorized();
        vault.setCap(1);
        _expectUnauthorized();
        vault.setWindowDuration(1);
        _expectUnauthorized();
        vault.pause();
        _expectUnauthorized();
        vault.unpause();
        _expectUnauthorized();
        vault.transferOwnership(stranger);
        _expectUnauthorized();
        vault.renounceOwnership();
        vm.stopPrank();
    }

    function test_AccessControl_AgentIsNotOwner() public {
        vm.startPrank(agent);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, agent));
        vault.withdrawAll(agent);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, agent));
        vault.setCap(1000 * U);
        vm.stopPrank();
    }

    function test_AccessControl_OwnerCannotPay() public {
        vm.startPrank(owner);
        vm.expectRevert(abi.encodeWithSelector(EnvoyVault.NotAgent.selector, owner));
        vault.pay(payee, U);
        vm.expectRevert(abi.encodeWithSelector(EnvoyVault.NotAgent.selector, owner));
        vault.tryPay(payee, U);
        vm.stopPrank();
    }

    function test_AccessControl_NonAgentRevertsAndEmitsNothing() public {
        vm.recordLogs();
        vm.startPrank(stranger);
        vm.expectRevert(abi.encodeWithSelector(EnvoyVault.NotAgent.selector, stranger));
        vault.pay(payee, U);
        vm.expectRevert(abi.encodeWithSelector(EnvoyVault.NotAgent.selector, stranger));
        vault.tryPay(payee, U);
        // even a would-be policy rejection (unlisted payee, zero amount) is not logged
        vm.expectRevert(abi.encodeWithSelector(EnvoyVault.NotAgent.selector, stranger));
        vault.tryPay(payee2, 0);
        vm.stopPrank();
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 0);
    }

    // ---------------------------------------------------------------- tryPay
    function _stateSnapshot() internal view returns (uint256, uint256, uint256, uint256) {
        return (vault.spent(), vault.windowStart(), vault.balance(), usdc.balanceOf(payee));
    }

    function _expectRejected(address to, uint256 amount, EnvoyVault.RejectReason r) internal {
        (uint256 s, uint256 w, uint256 b, uint256 p) = _stateSnapshot();
        vm.expectEmit(true, false, false, true, address(vault));
        emit EnvoyVault.PaymentRejected(agent, to, amount, r);
        assertFalse(_tryPay(to, amount));
        (uint256 s2, uint256 w2, uint256 b2, uint256 p2) = _stateSnapshot();
        assertEq(s2, s);
        assertEq(w2, w);
        assertEq(b2, b);
        assertEq(p2, p);
    }

    function test_TryPay_Reason0_Paused() public {
        vm.prank(owner);
        vault.pause();
        _expectRejected(payee, U, EnvoyVault.RejectReason.Paused);
    }

    function test_TryPay_Reason1_PayeeNotAllowed() public {
        _expectRejected(payee2, U, EnvoyVault.RejectReason.PayeeNotAllowed);
    }

    function test_TryPay_Reason2_ZeroAmount() public {
        _expectRejected(payee, 0, EnvoyVault.RejectReason.ZeroAmount);
    }

    function test_TryPay_Reason3_CapExceeded() public {
        _expectRejected(payee, CAP + 1, EnvoyVault.RejectReason.CapExceeded);
    }

    function test_TryPay_Reason4_InsufficientBalance() public {
        vm.startPrank(owner);
        vault.withdrawAll(owner);
        vault.deposit(U);
        vm.stopPrank();
        _expectRejected(payee, 2 * U, EnvoyVault.RejectReason.InsufficientBalance);
    }

    function test_Pay_InsufficientBalanceReverts() public {
        vm.startPrank(owner);
        vault.withdrawAll(owner);
        vault.deposit(U);
        vm.stopPrank();
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(EnvoyVault.InsufficientBalance.selector, 2 * U, U));
        vault.pay(payee, 2 * U);
    }

    function test_Pay_ZeroAmountReverts() public {
        vm.prank(agent);
        vm.expectRevert(EnvoyVault.ZeroAmount.selector);
        vault.pay(payee, 0);
    }

    function test_Pay_CheckOrderPauseThenPayeeThenAmount() public {
        // unlisted payee + zero amount -> PayeeNotAllowed first
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(EnvoyVault.PayeeNotAllowed.selector, payee2));
        vault.pay(payee2, 0);
        // paused + unlisted -> EnforcedPause first
        vm.prank(owner);
        vault.pause();
        vm.prank(agent);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.pay(payee2, 0);
    }

    function test_TryPay_SuccessReturnsTrueAndEmitsExecuted() public {
        uint256 t = block.timestamp;
        vm.expectEmit(true, false, false, true, address(vault));
        emit EnvoyVault.PaymentExecuted(agent, payee, 2 * U, 2 * U, t + DURATION);
        assertTrue(_tryPay(payee, 2 * U));
        assertEq(usdc.balanceOf(payee), 2 * U);
        assertEq(vault.spent(), 2 * U);
    }

    // ---------------------------------------------------------------- PaymentExecuted
    function test_Pay_EventFieldsCumulative() public {
        uint256 t = block.timestamp;
        vm.expectEmit(true, false, false, true, address(vault));
        emit EnvoyVault.PaymentExecuted(agent, payee, U, U, t + DURATION);
        _pay(U);

        vm.warp(t + 100);
        vm.expectEmit(true, false, false, true, address(vault));
        emit EnvoyVault.PaymentExecuted(agent, payee, 2 * U, 3 * U, t + DURATION); // window end unchanged
        _pay(2 * U);

        vm.warp(t + DURATION);
        vm.expectEmit(true, false, false, true, address(vault));
        emit EnvoyVault.PaymentExecuted(agent, payee, U, U, t + DURATION + DURATION); // fresh window
        _pay(U);
    }

    // ---------------------------------------------------------------- ownership
    function test_Ownership_TwoStepTransfer() public {
        address newOwner = makeAddr("newOwner");
        vm.prank(owner);
        vault.transferOwnership(newOwner);
        assertEq(vault.owner(), owner);
        assertEq(vault.pendingOwner(), newOwner);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        vault.acceptOwnership();

        vm.prank(newOwner);
        vault.acceptOwnership();
        assertEq(vault.owner(), newOwner);
        assertEq(vault.pendingOwner(), address(0));

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        vault.pause();
        vm.prank(newOwner);
        vault.pause();
    }

    function test_Ownership_RenounceReverts() public {
        vm.prank(owner);
        vm.expectRevert(EnvoyVault.OwnershipRenunciationDisabled.selector);
        vault.renounceOwnership();
        assertEq(vault.owner(), owner);
    }

    // ---------------------------------------------------------------- enum pinning
    function test_Enum_NumberingPinned() public pure {
        assertEq(uint8(EnvoyVault.RejectReason.Paused), 0);
        assertEq(uint8(EnvoyVault.RejectReason.PayeeNotAllowed), 1);
        assertEq(uint8(EnvoyVault.RejectReason.ZeroAmount), 2);
        assertEq(uint8(EnvoyVault.RejectReason.CapExceeded), 3);
        assertEq(uint8(EnvoyVault.RejectReason.InsufficientBalance), 4);
    }

    // ---------------------------------------------------------------- R1 cap lowered below spent
    function test_R1_CapLoweredBelowSpent() public {
        _pay(3 * U);
        vm.expectEmit(false, false, false, true, address(vault));
        emit EnvoyVault.CapUpdated(CAP, 2 * U);
        vm.prank(owner);
        vault.setCap(2 * U);

        assertEq(vault.remainingInWindow(), 0); // no underflow revert

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(EnvoyVault.CapExceeded.selector, 1, 0));
        vault.pay(payee, 1);

        vm.expectEmit(true, false, false, true, address(vault));
        emit EnvoyVault.PaymentRejected(agent, payee, 1, EnvoyVault.RejectReason.CapExceeded);
        assertFalse(_tryPay(payee, 1));

        assertEq(vault.spent(), 3 * U);
        assertEq(vault.remainingInWindow(), 0);
        assertEq(usdc.balanceOf(payee), 3 * U);
    }

    function test_R1_LoweredCapRecoversAfterWindowExpiry() public {
        _pay(3 * U);
        vm.prank(owner);
        vault.setCap(2 * U);
        vm.warp(vault.windowStart() + DURATION);
        assertEq(vault.remainingInWindow(), 2 * U);
        _pay(2 * U);
        assertEq(vault.spent(), 2 * U);
    }

    // ---------------------------------------------------------------- R4 setWindowDuration resets
    function test_R4_SetWindowDurationResets() public {
        _pay(3 * U);
        assertGt(vault.windowStart(), 0);

        vm.expectEmit(false, false, false, true, address(vault));
        emit EnvoyVault.WindowDurationUpdated(DURATION, 2 hours);
        vm.prank(owner);
        vault.setWindowDuration(2 hours);

        assertEq(vault.windowDuration(), 2 hours);
        assertEq(vault.windowStart(), 0);
        assertEq(vault.spent(), 0);
        assertEq(vault.remainingInWindow(), CAP);

        uint256 t = block.timestamp;
        _pay(CAP);
        assertEq(vault.windowStart(), t);
        assertEq(vault.windowEnd(), t + 2 hours);
        assertEq(vault.spent(), CAP);
    }

    function test_R4_SetWindowDurationSameValueStillResets() public {
        _pay(3 * U);
        vm.expectEmit(false, false, false, true, address(vault));
        emit EnvoyVault.WindowDurationUpdated(DURATION, DURATION);
        vm.prank(owner);
        vault.setWindowDuration(DURATION);

        assertEq(vault.windowStart(), 0);
        assertEq(vault.spent(), 0);
        assertEq(vault.remainingInWindow(), CAP);

        skip(10);
        _pay(CAP); // full cap again inside what would have been the old window
        assertEq(vault.windowStart(), block.timestamp);
        assertEq(vault.spent(), CAP);
    }

    function test_SetWindowDuration_RejectsInvalid() public {
        vm.startPrank(owner);
        vm.expectRevert(abi.encodeWithSelector(EnvoyVault.InvalidWindowDuration.selector, 0));
        vault.setWindowDuration(0);
        vm.expectRevert(abi.encodeWithSelector(EnvoyVault.InvalidWindowDuration.selector, 365 days + 1));
        vault.setWindowDuration(365 days + 1);
        vault.setWindowDuration(365 days);
        vm.stopPrank();
        assertEq(vault.windowDuration(), 365 days);
    }

    // ---------------------------------------------------------------- setCap
    function test_SetCap_DoesNotResetSpentOrWindow() public {
        _pay(3 * U);
        uint256 start = vault.windowStart();
        vm.prank(owner);
        vault.setCap(10 * U);
        assertEq(vault.cap(), 10 * U);
        assertEq(vault.spent(), 3 * U);
        assertEq(vault.windowStart(), start);
        assertEq(vault.remainingInWindow(), 7 * U);
    }

    function test_SetCap_RevertsOnZero() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(EnvoyVault.InvalidCap.selector, 0));
        vault.setCap(0);
    }
}
