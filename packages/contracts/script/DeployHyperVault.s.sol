// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "../src/foundry/Script.sol";
import {HyperVault} from "../src/HyperVault.sol";

contract DeployHyperVault is Script {
    function run(address usdcAddress, address ownerAddress, address managerAddress)
        external
        returns (HyperVault vault)
    {
        vm.startBroadcast();
        vault = new HyperVault(usdcAddress, ownerAddress, managerAddress);
        vm.stopBroadcast();
    }
}
