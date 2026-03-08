// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

interface Vm {
    function startBroadcast() external;
    function stopBroadcast() external;
}

abstract contract Script {
    Vm internal constant vm =
        Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
}
