// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./Token.sol";

contract HyperVault {
    IERC20 public immutable usdc;

    address public owner;
    address public manager;
    bool public paused;

    mapping(address => uint256) public settledBalance;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event Settled(address indexed user, int256 pnl, uint256 newBalance);
    event ManagerUpdated(address indexed oldManager, address indexed newManager);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);
    event PauseUpdated(bool paused);

    error Unauthorized();
    error InvalidAddress();
    error InvalidAmount();
    error InsufficientBalance();
    error ContractPaused();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyManager() {
        if (msg.sender != manager) revert Unauthorized();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    constructor(address usdcAddress, address ownerAddress, address managerAddress) {
        if (usdcAddress == address(0) || ownerAddress == address(0) || managerAddress == address(0)) {
            revert InvalidAddress();
        }

        usdc = IERC20(usdcAddress);
        owner = ownerAddress;
        manager = managerAddress;
    }

    function deposit(uint256 amount) external whenNotPaused {
        if (amount == 0) revert InvalidAmount();

        bool success = usdc.transferFrom(msg.sender, address(this), amount);
        require(success, "TRANSFER_FROM_FAILED");

        settledBalance[msg.sender] += amount;

        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external whenNotPaused {
        if (amount == 0) revert InvalidAmount();
        if (settledBalance[msg.sender] < amount) revert InsufficientBalance();

        settledBalance[msg.sender] -= amount;

        bool success = usdc.transfer(msg.sender, amount);
        require(success, "TRANSFER_FAILED");

        emit Withdrawn(msg.sender, amount);
    }

    function settle(address user, int256 pnl) external onlyManager whenNotPaused {
        if (user == address(0)) revert InvalidAddress();

        uint256 currentBalance = settledBalance[user];

        if (pnl >= 0) {
            settledBalance[user] = currentBalance + uint256(pnl);
        } else {
            uint256 loss = uint256(-pnl);
            if (loss > currentBalance) revert InsufficientBalance();
            settledBalance[user] = currentBalance - loss;
        }

        emit Settled(user, pnl, settledBalance[user]);
    }

    function setManager(address newManager) external onlyOwner {
        if (newManager == address(0)) revert InvalidAddress();

        address oldManager = manager;
        manager = newManager;

        emit ManagerUpdated(oldManager, newManager);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();

        address oldOwner = owner;
        owner = newOwner;

        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function setPaused(bool nextPaused) external onlyOwner {
        paused = nextPaused;
        emit PauseUpdated(nextPaused);
    }
}
