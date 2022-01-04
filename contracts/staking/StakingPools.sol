// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "../interfaces/IStakingPoolRewarder.sol";
import "../interfaces/IStakingPools.sol";

/**
 * @title StakingPools
 *
 * @dev A contract for staking sniper tokens in exchange for locked DOB rewards.
 * No actual DOB tokens will be held or distributed by this contract. Only the amounts
 * are accumulated.
 *
 */
contract StakingPools is OwnableUpgradeable, IStakingPools {
    using SafeMathUpgradeable for uint256;

    event PoolCreated(
        uint256 indexed poolId,
        address indexed token,
        address indexed optionContract,
        uint256 startBlock,
        uint256 endBlock,
        uint256 rewardPerBlock
    );

    event PoolRewardRateChanged(uint256 indexed poolId, uint256 oldRewardPerBlock, uint256 newRewardPerBlock);
    event RewarderChanged(address oldRewarder, address newRewarder);
    event Staked(uint256 indexed poolId, address indexed staker, address token, uint256 amount);
    event Unstaked(uint256 indexed poolId, address indexed staker, address token, uint256 amount);
    event RewardRedeemed(uint256 indexed poolId, address indexed staker, address rewarder, uint256 amount);
    event FactoryChanged(address oldFactory, address newFactory);

    /**
     * @param startBlock the block from which reward accumulation starts
     * @param endBlock the block from which reward accumulation stops
     * @param rewardPerBlock total amount of token to be rewarded in a block
     * @param poolToken token to be staked
     */
    struct PoolInfo {
        uint256 startBlock;
        uint256 endBlock;
        uint256 rewardPerBlock;
        address poolToken;
        address optionContract;
    }
    /**
     * @param totalStakeAmount total amount of staked tokens
     * @param accuRewardPerShare accumulated rewards for a single unit of token staked, multiplied by `ACCU_REWARD_MULTIPLIER`
     * @param accuRewardLastUpdateBlock the block number at which the `accuRewardPerShare` field was last updated
     */
    struct PoolData {
        uint256 totalStakeAmount;
        uint256 accuRewardPerShare;
        uint256 accuRewardLastUpdateBlock;
    }
    /**
     * @param stakeAmount amount of token the user stakes
     * @param pendingReward amount of reward to be redeemed by the user up to the user's last action
     * @param entryAccuRewardPerShare the `accuRewardPerShare` value at the user's last stake/unstake action
     */
    struct UserData {
        uint256 stakeAmount;
        uint256 pendingReward;
        uint256 entryAccuRewardPerShare;
        uint256 entryTime;
    }

    address public optionFactory;

    uint256 public lastPoolId; // The first pool has ID of 1

    IStakingPoolRewarder public rewarder;

    mapping(uint256 => PoolInfo) public poolInfos;
    mapping(uint256 => PoolData) public poolData;
    mapping(uint256 => mapping(address => UserData)) public userData;

    uint256 private constant ACCU_REWARD_MULTIPLIER = 10**20; // Precision loss prevention

    bytes4 private constant TRANSFER_SELECTOR = bytes4(keccak256(bytes("transfer(address,uint256)")));
    bytes4 private constant APPROVE_SELECTOR = bytes4(keccak256(bytes("approve(address,uint256)")));
    bytes4 private constant TRANSFERFROM_SELECTOR = bytes4(keccak256(bytes("transferFrom(address,address,uint256)")));

    modifier onlyPoolExists(uint256 poolId) {
        require(poolInfos[poolId].endBlock > 0, "StakingPools: pool not found");
        _;
    }

    modifier onlyPoolActive(uint256 poolId) {
        require(
            block.number >= poolInfos[poolId].startBlock && block.number < poolInfos[poolId].endBlock,
            "StakingPools: pool not active"
        );
        _;
    }

    modifier onlyPoolNotEnded(uint256 poolId) {
        require(block.number < poolInfos[poolId].endBlock, "StakingPools: pool ended");
        _;
    }

    modifier onlyOptionContract(uint256 poolId) {
        require(msg.sender == poolInfos[poolId].optionContract, "StakingPools: only option contract");
        _;
    }

    modifier onlyOwnerOrFactory() {
        require(msg.sender == optionFactory || msg.sender == owner(), "Option: caller is not the optionFactory or owner");
        _;
    }

    function getReward(uint256 poolId, address staker) external view returns (uint256) {
        UserData memory currentUserData = userData[poolId][staker];
        PoolInfo memory currentPoolInfo = poolInfos[poolId];
        PoolData memory currentPoolData = poolData[poolId];

        uint256 latestAccuRewardPerShare = currentPoolData.totalStakeAmount > 0
            ? currentPoolData.accuRewardPerShare.add(
                MathUpgradeable
                .min(block.number, currentPoolInfo.endBlock)
                .sub(currentPoolData.accuRewardLastUpdateBlock)
                .mul(currentPoolInfo.rewardPerBlock)
                .mul(ACCU_REWARD_MULTIPLIER)
                .div(currentPoolData.totalStakeAmount)
            )
            : currentPoolData.accuRewardPerShare;

        return
            currentUserData.pendingReward.add(
                currentUserData.stakeAmount.mul(latestAccuRewardPerShare.sub(currentUserData.entryAccuRewardPerShare)).div(
                    ACCU_REWARD_MULTIPLIER
                )
            );
    }

    function getStakingAmountByPoolID(address user, uint256 poolId) external view override returns (uint256) {
        return userData[poolId][user].stakeAmount;
    }

    function __StakingPools_init() public initializer {
        __Ownable_init();
    }

    function createPool(
        address token,
        address optionContract,
        uint256 startBlock,
        uint256 endBlock,
        uint256 rewardPerBlock
    ) external override onlyOwnerOrFactory {
        require(token != address(0), "StakingPools: zero address");
        require(optionContract != address(0), "StakingPools: zero address");
        require(startBlock > block.number && endBlock > startBlock, "StakingPools: invalid block range");
        require(rewardPerBlock > 0, "StakingPools: reward must be positive");

        uint256 newPoolId = ++lastPoolId;

        poolInfos[newPoolId] = PoolInfo({
            startBlock: startBlock,
            endBlock: endBlock,
            rewardPerBlock: rewardPerBlock,
            poolToken: token,
            optionContract: optionContract
        });
        poolData[newPoolId] = PoolData({totalStakeAmount: 0, accuRewardPerShare: 0, accuRewardLastUpdateBlock: startBlock});

        emit PoolCreated(newPoolId, token, optionContract, startBlock, endBlock, rewardPerBlock);
    }

    function setPoolReward(uint256 poolId, uint256 newRewardPerBlock)
        external
        onlyOwner
        onlyPoolExists(poolId)
        onlyPoolNotEnded(poolId)
    {
        if (block.number >= poolInfos[poolId].startBlock) {
            // "Settle" rewards up to this block
            _updatePoolAccuReward(poolId);
        }

        // We're deliberately allowing setting the reward rate to 0 here. If it turns
        // out this, or even changing rates at all, is undesirable after deployment, the
        // ownership of this contract can be transferred to a contract incapable of making
        // calls to this function.
        uint256 currentRewardPerBlock = poolInfos[poolId].rewardPerBlock;
        poolInfos[poolId].rewardPerBlock = newRewardPerBlock;

        emit PoolRewardRateChanged(poolId, currentRewardPerBlock, newRewardPerBlock);
    }

    function setRewarder(address newRewarder) external onlyOwner {
        require(newRewarder != address(0), "StakingPools: zero address");

        address oldRewarder = address(rewarder);
        rewarder = IStakingPoolRewarder(newRewarder);

        emit RewarderChanged(oldRewarder, newRewarder);
    }

    function setFactory(address newFactory) external onlyOwner {
        require(newFactory != address(0), "StakingPools: zero address");

        address oldFactory = optionFactory;
        optionFactory = newFactory;

        emit FactoryChanged(oldFactory, optionFactory);
    }

    function stake(uint256 poolId, uint256 amount) external onlyPoolExists(poolId) onlyPoolActive(poolId) {
        _updatePoolAccuReward(poolId);
        _updateStakerReward(poolId, msg.sender);

        _stake(poolId, msg.sender, amount);
    }

    function unstake(uint256 poolId, uint256 amount) external onlyPoolExists(poolId) {
        _updatePoolAccuReward(poolId);
        _updateStakerReward(poolId, msg.sender);

        _unstake(poolId, msg.sender, amount);
    }

    function stakeFor(
        uint256 poolId,
        uint256 amount,
        address user
    ) external override onlyPoolExists(poolId) onlyPoolActive(poolId) onlyOptionContract(poolId) {
        require(user != address(0), "StakingPools: zero address");

        _updatePoolAccuReward(poolId);
        _updateStakerReward(poolId, user);

        require(amount > 0, "StakingPools: cannot stake zero amount");

        userData[poolId][user].stakeAmount = userData[poolId][user].stakeAmount.add(amount);
        poolData[poolId].totalStakeAmount = poolData[poolId].totalStakeAmount.add(amount);

        // settle pending rewards to rewarder with vesting so that entryTime can be updated
        _vestPendingRewards(poolId, user);
        userData[poolId][user].entryTime = block.timestamp;

        emit Staked(poolId, user, poolInfos[poolId].poolToken, amount);
    }

    function unstakeFor(
        uint256 poolId,
        uint256 amount,
        address user
    ) external override onlyPoolExists(poolId) onlyOptionContract(poolId) {
        require(user != address(0), "StakingPools: zero address");

        _updatePoolAccuReward(poolId);
        _updateStakerReward(poolId, user);

        require(amount > 0, "StakingPools: cannot unstake zero amount");

        // No sufficiency check required as sub() will throw anyways
        userData[poolId][user].stakeAmount = userData[poolId][user].stakeAmount.sub(amount);
        poolData[poolId].totalStakeAmount = poolData[poolId].totalStakeAmount.sub(amount);

        safeTransfer(poolInfos[poolId].poolToken, user, amount);

        emit Unstaked(poolId, user, poolInfos[poolId].poolToken, amount);
    }

    function emergencyUnstake(uint256 poolId) external onlyPoolExists(poolId) {
        _unstake(poolId, msg.sender, userData[poolId][msg.sender].stakeAmount);

        // Forfeit user rewards to avoid abuse
        userData[poolId][msg.sender].pendingReward = 0;
    }

    function redeemRewards(uint256 poolId) external {
        _redeemRewardsByAddress(poolId, msg.sender);
    }

    function redeemRewardsByAddress(uint256 poolId, address user) external {
        _redeemRewardsByAddress(poolId, user);
    }

    function _redeemRewardsByAddress(uint256 poolId, address user) private onlyPoolExists(poolId) {
        require(user != address(0), "StakingPools: zero address");

        _updatePoolAccuReward(poolId);
        _updateStakerReward(poolId, user);

        require(address(rewarder) != address(0), "StakingPools: rewarder not set");

        _vestPendingRewards(poolId, user);

        uint256 claimed = rewarder.claimVestedReward(poolId, user);

        emit RewardRedeemed(poolId, user, address(rewarder), claimed);
    }

    function _vestPendingRewards(uint256 poolId, address user) private onlyPoolExists(poolId) {
        uint256 rewardToVest = userData[poolId][user].pendingReward;
        userData[poolId][user].pendingReward = 0;
        rewarder.onReward(poolId, user, rewardToVest, userData[poolId][user].entryTime);
    }

    function _stake(
        uint256 poolId,
        address user,
        uint256 amount
    ) private {
        require(amount > 0, "StakingPools: cannot stake zero amount");

        userData[poolId][user].stakeAmount = userData[poolId][user].stakeAmount.add(amount);
        poolData[poolId].totalStakeAmount = poolData[poolId].totalStakeAmount.add(amount);

        safeTransferFrom(poolInfos[poolId].poolToken, user, address(this), amount);

        // settle pending rewards to rewarder with vesting so that entryTime can be updated
        _vestPendingRewards(poolId, user);
        userData[poolId][user].entryTime = block.timestamp;

        emit Staked(poolId, user, poolInfos[poolId].poolToken, amount);
    }

    function _unstake(
        uint256 poolId,
        address user,
        uint256 amount
    ) private {
        require(amount > 0, "StakingPools: cannot unstake zero amount");

        // No sufficiency check required as sub() will throw anyways
        userData[poolId][user].stakeAmount = userData[poolId][user].stakeAmount.sub(amount);
        poolData[poolId].totalStakeAmount = poolData[poolId].totalStakeAmount.sub(amount);

        safeTransfer(poolInfos[poolId].poolToken, user, amount);

        emit Unstaked(poolId, user, poolInfos[poolId].poolToken, amount);
    }

    function _updatePoolAccuReward(uint256 poolId) private {
        PoolInfo storage currentPoolInfo = poolInfos[poolId];
        PoolData storage currentPoolData = poolData[poolId];

        uint256 appliedUpdateBlock = MathUpgradeable.min(block.number, currentPoolInfo.endBlock);
        uint256 durationInBlocks = appliedUpdateBlock.sub(currentPoolData.accuRewardLastUpdateBlock);

        // This saves tx cost when being called multiple times in the same block
        if (durationInBlocks > 0) {
            // No need to update the rate if no one staked at all
            if (currentPoolData.totalStakeAmount > 0) {
                currentPoolData.accuRewardPerShare = currentPoolData.accuRewardPerShare.add(
                    durationInBlocks.mul(currentPoolInfo.rewardPerBlock).mul(ACCU_REWARD_MULTIPLIER).div(
                        currentPoolData.totalStakeAmount
                    )
                );
            }
            currentPoolData.accuRewardLastUpdateBlock = appliedUpdateBlock;
        }
    }

    function _updateStakerReward(uint256 poolId, address staker) private {
        UserData storage currentUserData = userData[poolId][staker];
        PoolData storage currentPoolData = poolData[poolId];

        uint256 stakeAmount = currentUserData.stakeAmount;
        uint256 stakerEntryRate = currentUserData.entryAccuRewardPerShare;
        uint256 accuDifference = currentPoolData.accuRewardPerShare.sub(stakerEntryRate);

        if (accuDifference > 0) {
            currentUserData.pendingReward = currentUserData.pendingReward.add(
                stakeAmount.mul(accuDifference).div(ACCU_REWARD_MULTIPLIER)
            );
            currentUserData.entryAccuRewardPerShare = currentPoolData.accuRewardPerShare;
        }
    }

    function safeApprove(
        address token,
        address spender,
        uint256 amount
    ) internal {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(APPROVE_SELECTOR, spender, amount));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "StakingPools: approve failed");
    }

    function safeTransfer(
        address token,
        address recipient,
        uint256 amount
    ) private {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(TRANSFER_SELECTOR, recipient, amount));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "StakingPools: transfer failed");
    }

    function safeTransferFrom(
        address token,
        address sender,
        address recipient,
        uint256 amount
    ) private {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(TRANSFERFROM_SELECTOR, sender, recipient, amount)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))), "StakingPools: transferFrom failed");
    }
}
