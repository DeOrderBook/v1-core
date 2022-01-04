// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../interfaces/IOptionFactory.sol";
import "../interfaces/IBullet.sol";
import "../interfaces/ISniper.sol";
import "../interfaces/IStakingPools.sol";
import "./Distributions.sol";

contract Option is Ownable, ReentrancyGuard {
    using SafeMath for uint256;

    uint8 public optionType;
    uint256 public strikePrice;
    uint256 public exerciseTimestamp;
    uint256 public optionID;

    address public fund;
    address public optionFactory;
    address public stakingPool;
    address private baseToken;
    address private targetToken;
    IBullet public bullet;
    ISniper public sniper;

    uint256 private constant MULTIPLIER = 10**18; // Precision loss prevention

    event EnteredOption(uint256 optionID, address account, uint256 amount);
    event Exercised(uint256 optionID, uint256 timestamp, uint256 tokenAmount);
    event RedeemedToken(uint256 optionID, address account, uint256 baseTokenAmount, uint256 targetTokenAmount);

    modifier onlyFactory() {
        require(msg.sender == optionFactory, "Option: caller is not the optionFactory");
        _;
    }

    modifier onlyBeforeExerciseTime() {
        require(block.timestamp < exerciseTimestamp, "Option: only before exercise time");
        _;
    }

    modifier onlyInExerciseTime() {
        require(
            exerciseTimestamp < block.timestamp && block.timestamp < exerciseTimestamp + 1 days,
            "Option: only in exercise time"
        );
        _;
    }

    modifier onlyExitTime() {
        require(block.timestamp > exerciseTimestamp + 2 days, "Option: only in exit time");
        _;
    }

    constructor() {
        optionFactory = msg.sender;
    }

    // called once by the factory at time of deployment
    function initialize(
        uint256 _strikePrice,
        uint256 _exerciseTimestamp,
        uint8 _type
    ) external {
        require(_type <= 1, "OptionFactory: Illegal type");

        strikePrice = _strikePrice;
        exerciseTimestamp = _exerciseTimestamp;

        stakingPool = IOptionFactory(optionFactory).getStakingPools();

        optionType = _type;
    }

    function setup(
        uint256 _optionID,
        address _uHODLAddress,
        address _bHODLTokenAddress,
        address _fund,
        address _bullet,
        address _sniper
    ) external onlyFactory {
        require(_uHODLAddress != address(0), "OptionFactory: zero address");
        require(_bHODLTokenAddress != address(0), "OptionFactory: zero address");
        require(_bullet != address(0), "OptionFactory: zero address");
        require(_sniper != address(0), "OptionFactory: zero address");

        optionID = _optionID;

        //call
        if (optionType == 0) {
            baseToken = _uHODLAddress;
            targetToken = _bHODLTokenAddress;
        }
        //put
        if (optionType == 1) {
            baseToken = _bHODLTokenAddress;
            targetToken = _uHODLAddress;
        }

        fund = _fund;
        bullet = IBullet(_bullet);
        sniper = ISniper(_sniper);
    }

    function enter(uint256 _amount) external onlyBeforeExerciseTime {
        require(_amount > 0, "Option: zero amount");

        SafeERC20.safeTransferFrom(IERC20(targetToken), msg.sender, address(this), _amount);

        Distributions distributions = Distributions(IOptionFactory(optionFactory).distributions());
        uint256 bulletToReward = _amount.div(100).mul(distributions.bulletToRewardRatio());
        for (uint8 i = 0; i < distributions.bulletDistributionLength(); i++) {
            (uint8 percentage, address to) = distributions.bulletDistribution(i);
            bullet.mintFor(to, bulletToReward.div(100).mul(percentage));
        }

        bullet.mintFor(fund, _amount.sub(bulletToReward));

        sniper.mintFor(stakingPool, _amount);
        IStakingPools(stakingPool).stakeFor(optionID, _amount, msg.sender);

        emit EnteredOption(optionID, msg.sender, _amount);
    }

    function exercise(uint256 _targetAmount) external onlyInExerciseTime nonReentrant {
        require(_targetAmount > 0, "Option: zero target amount");
        require(bullet.balanceOf(msg.sender) >= _targetAmount, "Option: not enough bullet");

        uint256 baseAmount;
        //call
        if (optionType == 0) {
            baseAmount = uint256(strikePrice).mul(_targetAmount).div(MULTIPLIER);
        }
        //put
        if (optionType == 1) {
            baseAmount = _targetAmount.mul(MULTIPLIER).div(uint256(strikePrice));
        }

        SafeERC20.safeTransferFrom(IERC20(baseToken), msg.sender, address(this), baseAmount);

        bullet.burnFrom(msg.sender, _targetAmount);

        Distributions distributions = Distributions(IOptionFactory(optionFactory).distributions());
        uint256 exerciseFee = _targetAmount.div(100).mul(distributions.exerciseFeeRatio());
        for (uint8 i = 0; i < distributions.feeDistributionLength(); i++) {
            (uint8 percentage, address to) = distributions.feeDistribution(i);
            SafeERC20.safeTransfer(IERC20(targetToken), to, exerciseFee.div(100).mul(percentage));
        }
        SafeERC20.safeTransfer(IERC20(targetToken), msg.sender, _targetAmount.sub(exerciseFee));

        emit Exercised(optionID, block.timestamp, _targetAmount);
    }

    function exit(uint256 _amount) external onlyExitTime {
        unstake(_amount);

        redeemToken(_amount);
    }

    function withdrawTarget(uint256 _amount) external onlyBeforeExerciseTime {
        require(sniper.balanceOf(msg.sender) >= _amount, "Option: not enough sniper");
        require(bullet.balanceOf(msg.sender) >= _amount, "Option: not enough bullet");

        sniper.burnFrom(msg.sender, _amount);
        bullet.burnFrom(msg.sender, _amount);

        Distributions distributions = Distributions(IOptionFactory(optionFactory).distributions());
        uint256 withdrawFee = _amount.div(100).mul(distributions.withdrawFeeRatio());
        for (uint8 i = 0; i < distributions.feeDistributionLength(); i++) {
            (uint8 percentage, address to) = distributions.feeDistribution(i);
            SafeERC20.safeTransfer(IERC20(targetToken), to, withdrawFee.div(100).mul(percentage));
        }
        SafeERC20.safeTransfer(IERC20(targetToken), msg.sender, _amount.sub(withdrawFee));
    }

    function unstake(uint256 _amount) internal {
        require(_amount > 0, "Option: zero amount");
        uint256 stakingAmount = IStakingPools(stakingPool).getStakingAmountByPoolID(msg.sender, optionID);
        uint256 amountInWallet = sniper.balanceOf(msg.sender);
        require(_amount <= stakingAmount.add(amountInWallet), "Option: not enough staking amount");

        uint256 unstakeAmount;
        if (_amount > stakingAmount) {
            unstakeAmount = stakingAmount;
        } else {
            unstakeAmount = _amount;
        }
        IStakingPools(stakingPool).unstakeFor(optionID, unstakeAmount, msg.sender);
    }

    function redeemToken(uint256 _amount) internal nonReentrant {
        require(_amount > 0, "Option: zero amount");
        require(_amount <= sniper.balanceOf(msg.sender), "Option: not enough sniper");

        uint256 totalBaseToken = IERC20(baseToken).balanceOf(address(this));
        uint256 totalTargetToken = IERC20(targetToken).balanceOf(address(this));
        uint256 totalSupplyOfSniper = sniper.totalSupply();

        uint256 baseTokenAmount = _amount.mul(totalBaseToken).div(totalSupplyOfSniper);
        uint256 targetTokenAmount = _amount.mul(totalTargetToken).div(totalSupplyOfSniper);

        sniper.burnFrom(msg.sender, _amount);

        if (baseTokenAmount > 0) {
            SafeERC20.safeTransfer(IERC20(baseToken), msg.sender, baseTokenAmount);
        }

        if (targetTokenAmount > 0) {
            SafeERC20.safeTransfer(IERC20(targetToken), msg.sender, targetTokenAmount);
        }

        emit RedeemedToken(optionID, msg.sender, baseTokenAmount, targetTokenAmount);
    }
}
