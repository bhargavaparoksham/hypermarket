// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

import {Script} from "./utils/Script.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

contract DeployMockUSDC is Script {
    function run() external returns (MockUSDC token) {
        vm.startBroadcast();
        token = new MockUSDC();
        vm.stopBroadcast();
    }
}
