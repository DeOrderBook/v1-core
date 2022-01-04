// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

interface IStakingPools {
    function createPool(
        address token,
        address optionContract,
        uint256 startBlock,
        uint256 endBlock,
        uint256 rewardPerBlock
    ) external;

    function getStakingAmountByPoolID(address user, uint256 poolId) external returns (uint256);

    function stakeFor(
        uint256 poolId,
        uint256 amount,
        address user
    ) external;

    function unstakeFor(
        uint256 poolId,
        uint256 amount,
        address user
    ) external;
}
