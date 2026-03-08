// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

import {HyperVault} from "../src/HyperVault.sol";
import {FeeOnTransferMockUSDC} from "../src/mocks/FeeOnTransferMockUSDC.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {TestHelpers} from "./utils/TestHelpers.sol";
import {Vm} from "./utils/Vm.sol";

contract HyperVaultTest is TestHelpers {
    Vm internal constant vm =
        Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address internal constant OWNER = address(0x1000);
    address internal constant MANAGER = address(0x2000);
    address internal constant ALICE = address(0x3000);
    address internal constant BOB = address(0x4000);

    MockUSDC internal usdc;
    HyperVault internal vault;

    function setUp() external {
        usdc = new MockUSDC();
        vault = new HyperVault(address(usdc), OWNER, MANAGER);

        usdc.mint(ALICE, 1_000_000);
        usdc.mint(BOB, 1_000_000);
    }

    function testDeposit() external {
        vm.startPrank(ALICE);
        usdc.approve(address(vault), 500_000);
        vault.deposit(500_000);
        vm.stopPrank();

        assertEq(vault.settledBalance(ALICE), 500_000);
        assertEq(vault.totalSettledBalance(), 500_000);
        assertEq(usdc.balanceOf(address(vault)), 500_000);
    }

    function testWithdraw() external {
        vm.startPrank(ALICE);
        usdc.approve(address(vault), 500_000);
        vault.deposit(500_000);
        vault.withdraw(200_000);
        vm.stopPrank();

        assertEq(vault.settledBalance(ALICE), 300_000);
        assertEq(vault.totalSettledBalance(), 300_000);
        assertEq(usdc.balanceOf(ALICE), 700_000);
    }

    function testSettleCredit() external {
        vm.startPrank(OWNER);
        usdc.mint(OWNER, 100_000);
        usdc.approve(address(vault), 100_000);
        vault.fundProtocolLiquidity(100_000);
        vm.stopPrank();

        vm.startPrank(ALICE);
        usdc.approve(address(vault), 400_000);
        vault.deposit(400_000);
        vm.stopPrank();

        vm.prank(MANAGER);
        vault.settle(ALICE, 50_000);

        assertEq(vault.settledBalance(ALICE), 450_000);
        assertEq(vault.totalSettledBalance(), 450_000);
        assertEq(vault.protocolLiquidity(), 50_000);
    }

    function testSettleDebit() external {
        vm.startPrank(ALICE);
        usdc.approve(address(vault), 400_000);
        vault.deposit(400_000);
        vm.stopPrank();

        vm.prank(MANAGER);
        vault.settle(ALICE, -125_000);

        assertEq(vault.settledBalance(ALICE), 275_000);
        assertEq(vault.totalSettledBalance(), 275_000);
    }

    function testOnlyManagerCanSettle() external {
        vm.expectRevert(HyperVault.Unauthorized.selector);
        vault.settle(ALICE, 1);
    }

    function testCannotOverdrawOnWithdraw() external {
        vm.startPrank(ALICE);
        usdc.approve(address(vault), 100_000);
        vault.deposit(100_000);
        vm.expectRevert(HyperVault.InsufficientBalance.selector);
        vault.withdraw(100_001);
        vm.stopPrank();
    }

    function testSettleBadDebtZerosBalanceWithoutRevert() external {
        vm.startPrank(ALICE);
        usdc.approve(address(vault), 100_000);
        vault.deposit(100_000);
        vm.stopPrank();

        vm.prank(MANAGER);
        vault.settle(ALICE, -100_001);

        assertEq(vault.settledBalance(ALICE), 0);
        assertEq(vault.totalSettledBalance(), 0);
    }

    function testPositiveSettlementRequiresProtocolLiquidity() external {
        vm.startPrank(ALICE);
        usdc.approve(address(vault), 100_000);
        vault.deposit(100_000);
        vm.stopPrank();

        vm.prank(MANAGER);
        vm.expectRevert(HyperVault.InsufficientProtocolLiquidity.selector);
        vault.settle(ALICE, 1);
    }

    function testCannotUseZeroAmount() external {
        vm.startPrank(ALICE);
        usdc.approve(address(vault), 100_000);
        vm.expectRevert(HyperVault.InvalidAmount.selector);
        vault.deposit(0);
        vm.expectRevert(HyperVault.InvalidAmount.selector);
        vault.withdraw(0);
        vm.stopPrank();
    }

    function testOwnerCanUpdateManager() external {
        vm.prank(OWNER);
        vault.setManager(BOB);

        assertEq(uint256(uint160(vault.manager())), uint256(uint160(BOB)));
    }

    function testOnlyOwnerCanUpdateManager() external {
        vm.prank(ALICE);
        vm.expectRevert(HyperVault.Unauthorized.selector);
        vault.setManager(BOB);
    }

    function testOnlyOwnerCanPause() external {
        vm.prank(ALICE);
        vm.expectRevert(HyperVault.Unauthorized.selector);
        vault.setPaused(true);
    }

    function testOnlyOwnerCanTransferOwnership() external {
        vm.prank(ALICE);
        vm.expectRevert(HyperVault.Unauthorized.selector);
        vault.transferOwnership(BOB);
    }

    function testPausedVaultBlocksDepositWithdrawAndSettle() external {
        vm.startPrank(ALICE);
        usdc.approve(address(vault), 100_000);
        vault.deposit(100_000);
        vm.stopPrank();

        vm.prank(OWNER);
        vault.setPaused(true);

        vm.startPrank(ALICE);
        vm.expectRevert(HyperVault.ContractPaused.selector);
        vault.deposit(1);
        vm.expectRevert(HyperVault.ContractPaused.selector);
        vault.withdraw(1);
        vm.stopPrank();

        vm.prank(MANAGER);
        vm.expectRevert(HyperVault.ContractPaused.selector);
        vault.settle(ALICE, -1);
    }

    function testConstructorRejectsZeroAddresses() external {
        vm.expectRevert(HyperVault.InvalidAddress.selector);
        new HyperVault(address(0), OWNER, MANAGER);

        vm.expectRevert(HyperVault.InvalidAddress.selector);
        new HyperVault(address(usdc), address(0), MANAGER);

        vm.expectRevert(HyperVault.InvalidAddress.selector);
        new HyperVault(address(usdc), OWNER, address(0));
    }

    function testAdminFunctionsRejectZeroAddresses() external {
        vm.prank(OWNER);
        vm.expectRevert(HyperVault.InvalidAddress.selector);
        vault.setManager(address(0));

        vm.prank(OWNER);
        vm.expectRevert(HyperVault.InvalidAddress.selector);
        vault.transferOwnership(address(0));
    }

    function testOwnerCanFundAndWithdrawProtocolLiquidity() external {
        vm.startPrank(OWNER);
        usdc.mint(OWNER, 200_000);
        usdc.approve(address(vault), 200_000);
        vault.fundProtocolLiquidity(200_000);

        assertEq(vault.protocolLiquidity(), 200_000);

        vault.withdrawProtocolLiquidity(BOB, 75_000);
        vm.stopPrank();

        assertEq(vault.protocolLiquidity(), 125_000);
        assertEq(usdc.balanceOf(BOB), 1_075_000);
    }

    function testDepositCreditsActualReceivedForFeeOnTransferToken() external {
        FeeOnTransferMockUSDC feeToken = new FeeOnTransferMockUSDC();
        HyperVault feeVault = new HyperVault(address(feeToken), OWNER, MANAGER);

        feeToken.mint(ALICE, 1_000_000);

        vm.startPrank(ALICE);
        feeToken.approve(address(feeVault), 100_000);
        feeVault.deposit(100_000);
        vm.stopPrank();

        assertEq(feeVault.settledBalance(ALICE), 99_000);
        assertEq(feeVault.totalSettledBalance(), 99_000);
        assertEq(feeVault.protocolLiquidity(), 0);
    }

    function testProtocolFundingCreditsActualReceivedForFeeOnTransferToken() external {
        FeeOnTransferMockUSDC feeToken = new FeeOnTransferMockUSDC();
        HyperVault feeVault = new HyperVault(address(feeToken), OWNER, MANAGER);

        feeToken.mint(OWNER, 1_000_000);

        vm.startPrank(OWNER);
        feeToken.approve(address(feeVault), 100_000);
        feeVault.fundProtocolLiquidity(100_000);
        vm.stopPrank();

        assertEq(feeVault.protocolLiquidity(), 99_000);
    }

    function testOnlyOwnerCanManageProtocolLiquidity() external {
        vm.prank(ALICE);
        vm.expectRevert(HyperVault.Unauthorized.selector);
        vault.fundProtocolLiquidity(1);

        vm.prank(ALICE);
        vm.expectRevert(HyperVault.Unauthorized.selector);
        vault.withdrawProtocolLiquidity(BOB, 1);
    }

    function testCannotWithdrawMoreThanProtocolLiquidity() external {
        vm.startPrank(OWNER);
        usdc.mint(OWNER, 100_000);
        usdc.approve(address(vault), 100_000);
        vault.fundProtocolLiquidity(100_000);
        vm.expectRevert(HyperVault.InsufficientProtocolLiquidity.selector);
        vault.withdrawProtocolLiquidity(BOB, 100_001);
        vm.stopPrank();
    }
}
