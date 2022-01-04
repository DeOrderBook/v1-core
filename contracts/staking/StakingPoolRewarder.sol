// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "../interfaces/IStakingPoolRewarder.sol";
import "../libraries/TransferHelper.sol";

/**
 * @title StakingPoolRewarder
 *
 * @dev An upgradeable rewarder contract for releasing Convergence tokens based on
 * schedule.
 */
contract StakingPoolRewarder is OwnableUpgradeable, IStakingPoolRewarder {
    using SafeMathUpgradeable for uint256;

    event VestingScheduleAdded(address indexed user, uint256 amount, uint256 startTime, uint256 endTime, uint256 step);
    event VestingSettingChanged(uint8 percentageToVestingSchedule, uint256 claimDuration, uint256 claimStep);
    event TokenVested(address indexed user, uint256 poolId, uint256 amount);

    /**
     * @param amount Total amount to be vested over the complete period
     * @param startTime Unix timestamp in seconds for the period start time
     * @param endTime Unix timestamp in seconds for the period end time
     * @param step Interval in seconds at which vestable amounts are accumulated
     * @param lastClaimTime Unix timestamp in seconds for the last claim time
     */
    struct VestingSchedule {
        uint128 amount;
        uint32 startTime;
        uint32 endTime;
        uint32 step;
        uint32 lastClaimTime;
    }

    mapping(address => mapping(uint256 => VestingSchedule)) public vestingSchedules;
    mapping(address => mapping(uint256 => uint256)) public claimableAmounts;
    address public stakingPools;
    address public rewardToken;
    address public rewardDispatcher;
    uint8 public percentageToVestingSchedule;
    uint256 public claimDuration;
    uint256 public claimStep;
    bool private locked;

    modifier blockReentrancy {
        require(!locked, "Reentrancy is blocked");
        locked = true;
        _;
        locked = false;
    }

    function __StakingPoolRewarder_init(
        address _stakingPools,
        address _rewardToken,
        address _rewardDispatcher,
        uint8 _percentageToVestingSchedule,
        uint256 _claimDuration,
        uint256 _claimStep
    ) public initializer {
        __Ownable_init();
        require(_stakingPools != address(0), "StakingPoolRewarder: stakingPools zero address");
        require(_rewardToken != address(0), "StakingPoolRewarder: rewardToken zero address");
        require(_rewardDispatcher != address(0), "StakingPoolRewarder: rewardDispatcher zero address");

        stakingPools = _stakingPools;
        rewardToken = _rewardToken;
        rewardDispatcher = _rewardDispatcher;

        percentageToVestingSchedule = _percentageToVestingSchedule;
        claimDuration = _claimDuration;
        claimStep = _claimStep;
    }

    modifier onlyStakingPools() {
        require(stakingPools == msg.sender, "StakingPoolRewarder: only stakingPool can call");
        _;
    }

    function updateVestingSetting(
        uint8 _percentageToVestingSchedule,
        uint256 _claimDuration,
        uint256 _claimStep
    ) external onlyOwner {
        percentageToVestingSchedule = _percentageToVestingSchedule;
        claimDuration = _claimDuration;
        claimStep = _claimStep;
        emit VestingSettingChanged(_percentageToVestingSchedule, _claimDuration, _claimStep);
    }

    function setRewardDispatcher(address _rewardDispatcher) external onlyOwner {
        rewardDispatcher = _rewardDispatcher;
    }

    function updateVestingSchedule(
        address user,
        uint256 poolId,
        uint256 amount,
        uint256 startTime,
        uint256 endTime,
        uint256 step
    ) private {
        require(user != address(0), "StakingPoolRewarder: zero address");
        require(amount > 0, "StakingPoolRewarder: zero amount");
        require(startTime < endTime, "StakingPoolRewarder: invalid time range");
        require(step > 0 && endTime.sub(startTime) % step == 0, "StakingPoolRewarder: invalid step");

        // Overflow checks
        require(uint256(uint128(amount)) == amount, "StakingPoolRewarder: amount overflow");
        require(uint256(uint32(startTime)) == startTime, "StakingPoolRewarder: startTime overflow");
        require(uint256(uint32(endTime)) == endTime, "StakingPoolRewarder: endTime overflow");
        require(uint256(uint32(step)) == step, "StakingPoolRewarder: step overflow");

        vestingSchedules[user][poolId] = VestingSchedule({
            amount: uint128(amount),
            startTime: uint32(startTime),
            endTime: uint32(endTime),
            step: uint32(step),
            lastClaimTime: uint32(startTime)
        });

        emit VestingScheduleAdded(user, amount, startTime, endTime, step);
    }

    function calculateTotalReward(address user, uint256 poolId) external view override returns (uint256) {
        (uint256 withdrawableFromVesting, , ) = _calculateWithdrawableFromVesting(user, poolId, block.timestamp);
        uint256 claimableAmount = claimableAmounts[user][poolId];
        uint256 unvestedAmount = _calculateUnvestedAmountAtCurrentStep(user, poolId, block.timestamp);
        return withdrawableFromVesting.add(unvestedAmount).add(claimableAmount);
    }

    function calculateWithdrawableReward(address user, uint256 poolId) external view override returns (uint256) {
        (uint256 withdrawableFromVesting, , ) = _calculateWithdrawableFromVesting(user, poolId, block.timestamp);
        uint256 claimableAmount = claimableAmounts[user][poolId];
        return withdrawableFromVesting.add(claimableAmount);
    }

    function calculateWithdrawableFromVesting(address user, uint256 poolId) external view returns (uint256) {
        (uint256 withdrawable, , ) = _calculateWithdrawableFromVesting(user, poolId, block.timestamp);
        return withdrawable;
    }

    function _calculateWithdrawableFromVesting(
        address user,
        uint256 poolId,
        uint256 timestamp
    )
        private
        view
        returns (
            uint256 amount,
            uint256 newClaimTime,
            bool allVested
        )
    {
        VestingSchedule memory vestingSchedule = vestingSchedules[user][poolId];
        if (vestingSchedule.amount == 0) return (0, 0, false);
        if (timestamp <= uint256(vestingSchedule.startTime)) return (0, 0, false);

        uint256 currentStepTime = MathUpgradeable.min(
            timestamp
            .sub(uint256(vestingSchedule.startTime))
            .div(uint256(vestingSchedule.step))
            .mul(uint256(vestingSchedule.step))
            .add(uint256(vestingSchedule.startTime)),
            uint256(vestingSchedule.endTime)
        );

        if (currentStepTime <= uint256(vestingSchedule.lastClaimTime)) return (0, 0, false);

        uint256 totalSteps = uint256(vestingSchedule.endTime).sub(uint256(vestingSchedule.startTime)).div(
            vestingSchedule.step
        );

        if (currentStepTime == uint256(vestingSchedule.endTime)) {
            // All vested

            uint256 stepsVested = uint256(vestingSchedule.lastClaimTime).sub(uint256(vestingSchedule.startTime)).div(
                vestingSchedule.step
            );
            uint256 amountToVest = uint256(vestingSchedule.amount).sub(
                uint256(vestingSchedule.amount).div(totalSteps).mul(stepsVested)
            );
            return (amountToVest, currentStepTime, true);
        } else {
            // Partially vested
            uint256 stepsToVest = currentStepTime.sub(uint256(vestingSchedule.lastClaimTime)).div(vestingSchedule.step);
            uint256 amountToVest = uint256(vestingSchedule.amount).div(totalSteps).mul(stepsToVest);
            return (amountToVest, currentStepTime, false);
        }
    }

    function _calculateUnvestedAmountAtCurrentStep(
        address user,
        uint256 poolId,
        uint256 timestamp
    ) private view returns (uint256) {
        if (timestamp < uint256(vestingSchedules[user][poolId].startTime) || vestingSchedules[user][poolId].amount == 0)
            return 0;
        uint256 currentStepTime = MathUpgradeable.min(
            timestamp
            .sub(uint256(vestingSchedules[user][poolId].startTime))
            .div(uint256(vestingSchedules[user][poolId].step))
            .mul(uint256(vestingSchedules[user][poolId].step))
            .add(uint256(vestingSchedules[user][poolId].startTime)),
            uint256(vestingSchedules[user][poolId].endTime)
        );
        return _calculateUnvestedAmount(user, poolId, currentStepTime);
    }

    function _calculateUnvestedAmount(
        address user,
        uint256 poolId,
        uint256 stepTime
    ) private view returns (uint256) {
        if (vestingSchedules[user][poolId].amount == 0) return 0;

        uint256 totalSteps = uint256(vestingSchedules[user][poolId].endTime)
        .sub(uint256(vestingSchedules[user][poolId].startTime))
        .div(vestingSchedules[user][poolId].step);
        uint256 stepsVested = stepTime.sub(uint256(vestingSchedules[user][poolId].startTime)).div(
            vestingSchedules[user][poolId].step
        );
        return
            uint256(vestingSchedules[user][poolId].amount).sub(
                uint256(vestingSchedules[user][poolId].amount).div(totalSteps).mul(stepsVested)
            );
    }

    function _withdrawFromVesting(
        address user,
        uint256 poolId,
        uint256 timestamp
    ) private returns (uint256) {
        (uint256 lastVestedAmount, uint256 newClaimTime, bool allVested) = _calculateWithdrawableFromVesting(
            user,
            poolId,
            timestamp
        );
        if (lastVestedAmount > 0) {
            if (allVested) {
                // Remove storage slot to save gas
                delete vestingSchedules[user][poolId];
            } else {
                vestingSchedules[user][poolId].lastClaimTime = uint32(newClaimTime);
            }
        }
        return lastVestedAmount;
    }

    function onReward(
        uint256 poolId,
        address user,
        uint256 amount,
        uint256 entryTime
    ) external override onlyStakingPools {
        _onReward(poolId, user, amount, entryTime);
    }

    function _onReward(
        uint256 poolId,
        address user,
        uint256 amount,
        uint256 entryTime
    ) private blockReentrancy {
        require(user != address(0), "StakingPoolRewarder: zero address");

        uint256 lastVestedAmount = _withdrawFromVesting(user, poolId, entryTime);

        uint256 newUnvestedAmount = 0;
        uint256 newVestedAmount = 0;
        if (amount > 0) {
            newUnvestedAmount = amount.div(100).mul(uint256(percentageToVestingSchedule));
            newVestedAmount = amount.sub(newUnvestedAmount);
        }

        if (newUnvestedAmount > 0) {
            uint256 lastUnvestedAmount = _calculateUnvestedAmountAtCurrentStep(user, poolId, entryTime);
            updateVestingSchedule(
                user,
                poolId,
                newUnvestedAmount.add(lastUnvestedAmount),
                entryTime,
                entryTime.add(claimDuration),
                claimStep
            );
        }

        uint256 newEntryVestedAmount = _withdrawFromVesting(user, poolId, block.timestamp);
        uint256 totalVested = lastVestedAmount.add(newVestedAmount).add(newEntryVestedAmount);
        claimableAmounts[user][poolId] = claimableAmounts[user][poolId].add(totalVested);
        emit TokenVested(user, poolId, totalVested);
    }

    function claimVestedReward(uint256 poolId, address user)
        external
        override
        onlyStakingPools
        blockReentrancy
        returns (uint256)
    {
        require(poolId > 0, "StakingPoolRewarder: poolId is 0");
        uint256 claimableAmount = claimableAmounts[user][poolId];
        require(claimableAmount > 0, "StakingPoolRewarder: claimable amount is 0");

        claimableAmounts[user][poolId] = 0;
        TransferHelper.safeTransferFrom(rewardToken, rewardDispatcher, user, claimableAmount);
        return claimableAmount;
    }
}
