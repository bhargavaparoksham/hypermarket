// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "../src/foundry/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract DeployMockUSDC is Script {
    function run() external returns (MockUSDC token) {
        vm.startBroadcast();
        token = new MockUSDC();
        vm.stopBroadcast();
    }
}
