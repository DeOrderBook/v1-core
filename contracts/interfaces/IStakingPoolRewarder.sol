// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

interface IStakingPoolRewarder {
    function calculateTotalReward(address user, uint256 poolId) external view returns (uint256);

    function calculateWithdrawableReward(address user, uint256 poolId) external view returns (uint256);

    function onReward(
        uint256 poolId,
        address user,
        uint256 amount,
        uint256 entryTime
    ) external;

    function claimVestedReward(uint256 poolId, address user) external returns (uint256);
}
