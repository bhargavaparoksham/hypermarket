// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

import {Script} from "./utils/Script.sol";
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
