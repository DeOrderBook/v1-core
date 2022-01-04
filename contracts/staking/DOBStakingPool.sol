// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "../interfaces/IStakingPoolRewarder.sol";
import "../interfaces/IDOBStakingPool.sol";

/**
 * @title DOBStakingPools
 *
 * @dev A contract for staking DOB tokens for fee revenue (uHODL & bHODL) and bullets rewards.
 * 30 days lock period is extended for every new DOB Staking
 *
 */
contract DOBStakingPool is OwnableUpgradeable, PausableUpgradeable, ReentrancyGuardUpgradeable, IDOBStakingPool {
    using SafeMathUpgradeable for uint256;

    address public DOB;
    address public feeCollector;
    address public bulletCollector;
    address public rewardDispatcher; //need the same as the reward dispatcher setting in uHODLRewarder and bHODLRewarder
    address public worker;
    address public optionFactory;

    address public uHODL;
    address public bHODL;
    address[] public bullets;

    uint256 public bulletRewardThreshold;
    uint256 public extendLockDays;

    uint256 private constant ACCU_REWARD_MULTIPLIER = 10**20; // Precision loss prevention

    struct UserData {
        uint256 totalStakingAmount;
        // uint256 uHODLPendingReward;  //we can handle it in rewarder
        // uint256 bHODLPendingReward;  //we can handle it in rewarder
        uint256 uHODLEntryAccuReward;
        uint256 bHODLEntryAccuReward;
        uint256 lastEntryTime;
    }
    struct PoolData {
        uint256 stakingAmount;
        uint256 uHODLAccuReward;
        uint256 bHODLAccuReward;
    }

    mapping(address => UserData) public userDatas;

    uint256 public dailyTotalShareBullet; // for bullet reward. ACCU daily stake more than bulletRewardThreshold
    address[] public dailyStakers;
    mapping(address => uint256) public dailyStaking;

    PoolData public poolData;
    IStakingPoolRewarder public uHODLRewarder;
    IStakingPoolRewarder public bHODLRewarder;

    event Staked(address indexed staker, uint256 amount);
    event Unstaked(address indexed staker, uint256 amount);
    event WorkerChanged(address oldWorker, address newWorker);
    event FactoryChanged(address oldFactory, address newFactory);
    event RewarderChanged(address oldRewarder, address newRewarder);
    event RewardRedeemed(address indexed staker, address rewarder, uint256 amount);
    event BulletRewardThresholdChanged(uint256 oldThreshold, uint256 newThreshold);
    event ExtendLockDaysChanged(uint256 oldDays, uint256 newDays);

    modifier onlyWorker() {
        require(msg.sender == worker, "DOBStaking: caller is not the worker");
        _;
    }

    modifier onlyFactory() {
        require(msg.sender == optionFactory, "DOBStaking: caller is not the option factory");
        _;
    }

    function __DOBStakingPool_init(
        address _feeCollector,
        address _bulletCollector,
        address _rewardDispatcher,
        address _uHODl,
        address _bHODL,
        address _DOB
    ) public initializer {
        require(_feeCollector != address(0), "DOBStakingPool: zero address");
        require(_bulletCollector != address(0), "DOBStakingPool: zero address");
        require(_rewardDispatcher != address(0), "DOBStakingPool: zero address");
        require(_uHODl != address(0), "DOBStakingPool: zero address");
        require(_bHODL != address(0), "DOBStakingPool: zero address");
        require(_DOB != address(0), "DOBStakingPool: zero address");

        __Ownable_init();
        __Pausable_init();
        __ReentrancyGuard_init();

        feeCollector = _feeCollector;
        bulletCollector = _bulletCollector;
        rewardDispatcher = _rewardDispatcher;
        uHODL = _uHODl;
        bHODL = _bHODL;
        DOB = _DOB;

        bulletRewardThreshold = 100e18;
        extendLockDays = 30 days;
    }

    function setWorker(address _worker) external onlyOwner {
        require(_worker != address(0), "DOBStakingPool: zero address");

        address oldWorker = worker;
        worker = _worker;

        emit WorkerChanged(oldWorker, worker);
    }

    function setFactory(address newFactory) external onlyOwner {
        require(newFactory != address(0), "DOBStakingPool: zero address");

        address oldFactory = optionFactory;
        optionFactory = newFactory;

        emit FactoryChanged(oldFactory, optionFactory);
    }

    function setuHODLRewarder(address _uHODLRewarder) external onlyOwner {
        require(_uHODLRewarder != address(0), "DOBStakingPool: zero address");

        address olduHODLRewarder = address(_uHODLRewarder);
        uHODLRewarder = IStakingPoolRewarder(_uHODLRewarder);

        emit RewarderChanged(olduHODLRewarder, _uHODLRewarder);
    }

    function setbHODLRewarder(address _bHODLRewarder) external onlyOwner {
        require(_bHODLRewarder != address(0), "DOBStakingPool: zero address");

        address olduHODLRewarder = address(_bHODLRewarder);
        bHODLRewarder = IStakingPoolRewarder(_bHODLRewarder);

        emit RewarderChanged(olduHODLRewarder, _bHODLRewarder);
    }

    function setBulletRewardThreshold(uint256 _threshold) external onlyOwner {
        require(_threshold > 0, "DOBStakingPool: zero threshold");

        uint256 oldThreshold = bulletRewardThreshold;
        bulletRewardThreshold = _threshold;

        emit BulletRewardThresholdChanged(oldThreshold, _threshold);
    }

    function setExtendLockDays(uint256 _days) external onlyOwner {
        require(_days > 0, "DOBStakingPool: zero days");

        uint256 oldDays = extendLockDays;
        extendLockDays = _days;

        emit ExtendLockDaysChanged(oldDays, _days);
    }

    function addBullet(address _bulletAddress) external override onlyFactory {
        require(_bulletAddress != address(0), "DOBStakingPool: zero address");

        bullets.push(_bulletAddress);
    }

    function removeBullet(address _bulletAddress) external override onlyFactory {
        require(_bulletAddress != address(0), "DOBStakingPool: zero address");
        uint8 popTimes;
        for (uint8 i = 0; i < bullets.length; i++) {
            if (bullets[i] == _bulletAddress) {
                bullets[i] = bullets[bullets.length - 1];
                popTimes = popTimes + 1;
            }
        }
        for (uint8 j = 1; j <= popTimes; j++) {
            bullets.pop();
        }
    }

    function bullesLength() external view returns (uint256) {
        return bullets.length;
    }

    function stake(uint256 amount) external whenNotPaused {
        require(amount > 0, "DOBStaking: cannot stake zero amount");
        // calculate pending reward
        uint256 uHODLRewardToVest = poolData
        .uHODLAccuReward
        .sub(userDatas[msg.sender].uHODLEntryAccuReward)
        .mul(userDatas[msg.sender].totalStakingAmount)
        .div(ACCU_REWARD_MULTIPLIER);
        uint256 bHODLRewardToVest = poolData
        .bHODLAccuReward
        .sub(userDatas[msg.sender].bHODLEntryAccuReward)
        .mul(userDatas[msg.sender].totalStakingAmount)
        .div(ACCU_REWARD_MULTIPLIER);

        userDatas[msg.sender].totalStakingAmount = userDatas[msg.sender].totalStakingAmount.add(amount);
        poolData.stakingAmount = poolData.stakingAmount.add(amount);

        userDatas[msg.sender].uHODLEntryAccuReward = poolData.uHODLAccuReward;
        userDatas[msg.sender].bHODLEntryAccuReward = poolData.bHODLAccuReward;

        SafeERC20Upgradeable.safeTransferFrom(IERC20Upgradeable(DOB), msg.sender, address(this), amount);

        // settle pending rewards to rewarder with vesting
        uHODLRewarder.onReward(1, msg.sender, uHODLRewardToVest, userDatas[msg.sender].lastEntryTime);
        bHODLRewarder.onReward(1, msg.sender, bHODLRewardToVest, userDatas[msg.sender].lastEntryTime);

        userDatas[msg.sender].lastEntryTime = block.timestamp;

        //handle daily staking for bullet reward
        dailyStakers.push(msg.sender);
        uint256 oldDailyStakingAmount = dailyStaking[msg.sender];
        dailyStaking[msg.sender] = dailyStaking[msg.sender].add(amount);
        if (oldDailyStakingAmount >= bulletRewardThreshold) {
            dailyTotalShareBullet = dailyTotalShareBullet.sub(oldDailyStakingAmount).add(dailyStaking[msg.sender]);
        } else if (dailyStaking[msg.sender] >= bulletRewardThreshold) {
            dailyTotalShareBullet = dailyTotalShareBullet.add(dailyStaking[msg.sender]);
        }

        emit Staked(msg.sender, amount);
    }

    function unstake(uint256 amount) external whenNotPaused {
        require(
            block.timestamp >= userDatas[msg.sender].lastEntryTime + extendLockDays,
            "DOBStaking: Less than unlock time"
        );
        // calculate pending reward
        uint256 uHODLRewardToVest = poolData
        .uHODLAccuReward
        .sub(userDatas[msg.sender].uHODLEntryAccuReward)
        .mul(userDatas[msg.sender].totalStakingAmount)
        .div(ACCU_REWARD_MULTIPLIER);
        uint256 bHODLRewardToVest = poolData
        .bHODLAccuReward
        .sub(userDatas[msg.sender].bHODLEntryAccuReward)
        .mul(userDatas[msg.sender].totalStakingAmount)
        .div(ACCU_REWARD_MULTIPLIER);

        userDatas[msg.sender].totalStakingAmount = userDatas[msg.sender].totalStakingAmount.sub(amount);
        poolData.stakingAmount = poolData.stakingAmount.sub(amount);

        userDatas[msg.sender].uHODLEntryAccuReward = poolData.uHODLAccuReward;
        userDatas[msg.sender].bHODLEntryAccuReward = poolData.bHODLAccuReward;

        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(DOB), msg.sender, amount);
        // settle pending rewards to rewarder with vesting
        uHODLRewarder.onReward(1, msg.sender, uHODLRewardToVest, userDatas[msg.sender].lastEntryTime);
        bHODLRewarder.onReward(1, msg.sender, bHODLRewardToVest, userDatas[msg.sender].lastEntryTime);

        emit Unstaked(msg.sender, amount);
    }

    function drawReward() external onlyWorker whenNotPaused nonReentrant {
        //Settle the daily renewal fee and transfer the token from feeCollector to rewardDispatcher
        uint256 uAmountForReward = IERC20Upgradeable(uHODL).balanceOf(feeCollector);
        uint256 bAmountForReward = IERC20Upgradeable(bHODL).balanceOf(feeCollector);

        SafeERC20Upgradeable.safeTransferFrom(IERC20Upgradeable(uHODL), feeCollector, rewardDispatcher, uAmountForReward);
        SafeERC20Upgradeable.safeTransferFrom(IERC20Upgradeable(bHODL), feeCollector, rewardDispatcher, bAmountForReward);

        require(poolData.stakingAmount > 0, "DOBStakingPool: zero staking amount");
        poolData.uHODLAccuReward = uAmountForReward.mul(ACCU_REWARD_MULTIPLIER).div(poolData.stakingAmount).add(
            poolData.uHODLAccuReward
        );
        poolData.bHODLAccuReward = bAmountForReward.mul(ACCU_REWARD_MULTIPLIER).div(poolData.stakingAmount).add(
            poolData.bHODLAccuReward
        );
        uint256[] memory bulletBalance = new uint256[](bullets.length);
        for (uint8 k = 0; k < bullets.length; k++) {
            uint256 bulletRewardAmount = IERC20Upgradeable(bullets[k]).balanceOf(bulletCollector);
            bulletBalance[k] = bulletRewardAmount;
        }
        for (uint8 i = 0; i < dailyStakers.length; i++) {
            address user = dailyStakers[i];

            if (dailyStaking[user] >= bulletRewardThreshold) {
                for (uint8 j = 0; j < bullets.length; j++) {
                    uint256 bulletAmount = bulletBalance[j].mul(dailyStaking[user]).div(dailyTotalShareBullet);
                    SafeERC20Upgradeable.safeTransferFrom(
                        IERC20Upgradeable(bullets[j]),
                        bulletCollector,
                        user,
                        bulletAmount
                    );
                }
            }

            delete dailyStaking[user];
        }
        dailyTotalShareBullet = 0;
        delete dailyStakers;
    }

    function getReward(address user) external view returns (uint256 uHODLReward, uint256 bHODLReward) {
        // calculate pending reward
        uint256 uHODlpendingReward = poolData
        .uHODLAccuReward
        .sub(userDatas[user].uHODLEntryAccuReward)
        .mul(userDatas[user].totalStakingAmount)
        .div(ACCU_REWARD_MULTIPLIER);
        uint256 bHODlpendingReward = poolData
        .bHODLAccuReward
        .sub(userDatas[user].bHODLEntryAccuReward)
        .mul(userDatas[user].totalStakingAmount)
        .div(ACCU_REWARD_MULTIPLIER);
        // get reard in rewarder.(vested and vesting)
        uint256 uHODLRewardInRewarder = uHODLRewarder.calculateTotalReward(user, 0);
        uint256 bHODLRewardInRewarder = bHODLRewarder.calculateTotalReward(user, 0);

        uHODLReward = uHODlpendingReward.add(uHODLRewardInRewarder);
        bHODLReward = bHODlpendingReward.add(bHODLRewardInRewarder);
    }

    function redeemReward() external nonReentrant {
        // calculate pending reward
        uint256 uHODLRewardToVest = poolData
        .uHODLAccuReward
        .sub(userDatas[msg.sender].uHODLEntryAccuReward)
        .mul(userDatas[msg.sender].totalStakingAmount)
        .div(ACCU_REWARD_MULTIPLIER);
        uint256 bHODLRewardToVest = poolData
        .bHODLAccuReward
        .sub(userDatas[msg.sender].bHODLEntryAccuReward)
        .mul(userDatas[msg.sender].totalStakingAmount)
        .div(ACCU_REWARD_MULTIPLIER);
        // settle pending rewards to rewarder with vesting
        uHODLRewarder.onReward(1, msg.sender, uHODLRewardToVest, userDatas[msg.sender].lastEntryTime);
        bHODLRewarder.onReward(1, msg.sender, bHODLRewardToVest, userDatas[msg.sender].lastEntryTime);

        // claim withdrawable from rewarder
        uint256 uHODLClaimable = uHODLRewarder.calculateWithdrawableReward(msg.sender, 1);
        uint256 bHODLClaimable = bHODLRewarder.calculateWithdrawableReward(msg.sender, 1);
        require(uHODLClaimable > 0 || bHODLClaimable > 0, "DOBStaking: haven't withdrawable reward");
        if (uHODLClaimable > 0) {
            uint256 claimed = uHODLRewarder.claimVestedReward(1, msg.sender);
            emit RewardRedeemed(msg.sender, address(uHODLRewarder), claimed);
        }

        if (bHODLClaimable > 0) {
            uint256 claimed = bHODLRewarder.claimVestedReward(1, msg.sender);
            emit RewardRedeemed(msg.sender, address(bHODLRewarder), claimed);
        }
    }

    function emergencyUnstake() external whenPaused {
        uint256 amount = userDatas[msg.sender].totalStakingAmount;
        poolData.stakingAmount = poolData.stakingAmount.sub(amount);

        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(DOB), msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    function pause() external onlyOwner {
        _pause();
    }
}
