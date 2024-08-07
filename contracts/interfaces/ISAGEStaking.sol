//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

struct LockInfo {
    uint256 duration;
    uint256 stakedAmount;
    uint256 unstakingCompletedAt;
}

struct ClaimableReward {
    address rewardAsset;
    uint256 amount;
}

struct LockupDurationInfo {
    uint256 duration;
    uint256 stakedAmount;
    uint256 factor;
}

interface ISAGEStaking {
    function getTotalRewardShares() external view returns (uint256 totalShares);
    function getClaimeableRewards(address user, uint256 duration) external view returns(ClaimableReward[] memory rewards);
    function getLocks(address user) external view returns(LockInfo[] memory locks);
    function getDurations() external view returns(LockupDurationInfo[] memory durations);

    function stake(uint256 amount, uint256 duration) external;
    function unstake(uint256 duration) external;
    function withdraw(uint256 duration) external;
    function emergencyWithdraw(uint256 duration) external;

    function claim(uint256 duration) external;

    function addReward(IERC20 token, uint256 amount, uint256 duration) external;
    function addRewardETH(uint256 duration) payable external;

    function setLockupDurationFactor(uint256 duration, uint256 factor) external;

    function distributeStreamingRewards() external;


}