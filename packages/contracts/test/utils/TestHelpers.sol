// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

abstract contract TestHelpers {
    function assertEq(uint256 left, uint256 right) internal pure {
        require(left == right, "assertEq failed");
    }
}
