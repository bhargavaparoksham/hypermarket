// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockUSDC} from "../src/MockUSDC.sol";
import {TestHelpers} from "./utils/TestHelpers.sol";
import {Vm} from "./utils/Vm.sol";

contract MockUSDCTest is TestHelpers {
    address internal constant ALICE = address(0x3000);
    address internal constant BOB = address(0x4000);

    MockUSDC internal token;

    function setUp() external {
        token = new MockUSDC();
    }

    function testMint() external {
        token.mint(address(this), 1_000_000);

        assertEq(token.balanceOf(address(this)), 1_000_000);
        assertEq(token.totalSupply(), 1_000_000);
    }

    function testTransfer() external {
        Vm vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

        token.mint(ALICE, 1_000_000);

        vm.prank(ALICE);
        token.transfer(BOB, 250_000);

        assertEq(token.balanceOf(ALICE), 750_000);
        assertEq(token.balanceOf(BOB), 250_000);
    }
}
