// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

/// @author Bhargava Paroksham
contract HyperVault is ReentrancyGuard {
    IERC20 public immutable usdc;

    address public owner;
    address public manager;
    bool public paused;
    uint256 public totalSettledBalance;

    mapping(address => uint256) public settledBalance;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event Settled(address indexed user, int256 pnl, uint256 currentBalance, uint256 finalBalance);
    event ProtocolLiquidityFunded(address indexed funder, uint256 amount);
    event ProtocolLiquidityWithdrawn(address indexed recipient, uint256 amount);
    event ManagerUpdated(address indexed oldManager, address indexed newManager);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);
    event PauseUpdated(bool paused);

    error Unauthorized();
    error InvalidAddress();
    error InvalidAmount();
    error InsufficientBalance();
    error InsufficientProtocolLiquidity();
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

    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert InvalidAmount();

        uint256 balanceBefore = usdc.balanceOf(address(this));
        bool success = usdc.transferFrom(msg.sender, address(this), amount);
        require(success, "TRANSFER_FROM_FAILED");
        uint256 received = usdc.balanceOf(address(this)) - balanceBefore;
        if (received == 0) revert InvalidAmount();

        // Credit only the amount actually received so fee-on-transfer tokens
        // cannot create insolvent accounting. Native USDC should transfer 1:1.
        settledBalance[msg.sender] += received;
        totalSettledBalance += received;

        emit Deposited(msg.sender, received);
    }

    function withdraw(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert InvalidAmount();
        if (settledBalance[msg.sender] < amount) revert InsufficientBalance();

        settledBalance[msg.sender] -= amount;
        totalSettledBalance -= amount;

        bool success = usdc.transfer(msg.sender, amount);
        require(success, "TRANSFER_FAILED");

        emit Withdrawn(msg.sender, amount);
    }

    function settle(address user, int256 pnl) external onlyManager whenNotPaused {
        if (user == address(0)) revert InvalidAddress();

        uint256 currentBalance = settledBalance[user];
        uint256 finalBalance;

        if (pnl >= 0) {
            uint256 profit = uint256(pnl);
            if (protocolLiquidity() < profit) revert InsufficientProtocolLiquidity();

            finalBalance = currentBalance + profit;
            settledBalance[user] = finalBalance;
            totalSettledBalance += profit;
        } else {
            uint256 loss = uint256(-pnl);
            if (loss >= currentBalance) {
                finalBalance = 0;
                settledBalance[user] = 0;
                totalSettledBalance -= currentBalance;
            } else {
                finalBalance = currentBalance - loss;
                settledBalance[user] = finalBalance;
                totalSettledBalance -= loss;
            }
        }

        emit Settled(user, pnl, currentBalance, finalBalance);
    }

    function fundProtocolLiquidity(uint256 amount) external nonReentrant onlyOwner {
        if (amount == 0) revert InvalidAmount();

        uint256 balanceBefore = usdc.balanceOf(address(this));
        bool success = usdc.transferFrom(msg.sender, address(this), amount);
        require(success, "TRANSFER_FROM_FAILED");
        uint256 received = usdc.balanceOf(address(this)) - balanceBefore;
        if (received == 0) revert InvalidAmount();

        emit ProtocolLiquidityFunded(msg.sender, received);
    }

    function withdrawProtocolLiquidity(address recipient, uint256 amount)
        external
        nonReentrant
        onlyOwner
    {
        if (recipient == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (protocolLiquidity() < amount) revert InsufficientProtocolLiquidity();

        bool success = usdc.transfer(recipient, amount);
        require(success, "TRANSFER_FAILED");

        emit ProtocolLiquidityWithdrawn(recipient, amount);
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

    function protocolLiquidity() public view returns (uint256) {
        uint256 vaultBalance = usdc.balanceOf(address(this));
        if (vaultBalance <= totalSettledBalance) {
            return 0;
        }

        return vaultBalance - totalSettledBalance;
    }
}
