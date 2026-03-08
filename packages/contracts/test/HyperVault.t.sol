// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {HyperVault} from "../src/HyperVault.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
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
        assertEq(usdc.balanceOf(address(vault)), 500_000);
    }

    function testWithdraw() external {
        vm.startPrank(ALICE);
        usdc.approve(address(vault), 500_000);
        vault.deposit(500_000);
        vault.withdraw(200_000);
        vm.stopPrank();

        assertEq(vault.settledBalance(ALICE), 300_000);
        assertEq(usdc.balanceOf(ALICE), 700_000);
    }

    function testSettleCredit() external {
        vm.startPrank(ALICE);
        usdc.approve(address(vault), 400_000);
        vault.deposit(400_000);
        vm.stopPrank();

        vm.prank(MANAGER);
        vault.settle(ALICE, 50_000);

        assertEq(vault.settledBalance(ALICE), 450_000);
    }

    function testSettleDebit() external {
        vm.startPrank(ALICE);
        usdc.approve(address(vault), 400_000);
        vault.deposit(400_000);
        vm.stopPrank();

        vm.prank(MANAGER);
        vault.settle(ALICE, -125_000);

        assertEq(vault.settledBalance(ALICE), 275_000);
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

    function testCannotOverdrawOnSettlementDebit() external {
        vm.startPrank(ALICE);
        usdc.approve(address(vault), 100_000);
        vault.deposit(100_000);
        vm.stopPrank();

        vm.prank(MANAGER);
        vm.expectRevert(HyperVault.InsufficientBalance.selector);
        vault.settle(ALICE, -100_001);
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
}
