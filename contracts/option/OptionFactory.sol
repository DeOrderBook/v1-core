// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../interfaces/IOptionFactory.sol";
import "../interfaces/IStakingPools.sol";
import "../interfaces/IDOBStakingPool.sol";
import "./Option.sol";
import "../token/Bullet.sol";
import "../token/Sniper.sol";

contract OptionFactory is Ownable, IOptionFactory {
    using SafeMath for uint256;

    uint256 public stakingRewardPerBlock;
    address public stakingPools;
    address public DOBStakingPool;
    address public immutable bHODL;
    address public immutable uHODL;
    address public override distributions;

    uint256 private lastOptionId; //first option id is 1, because staking pool first id is 1
    mapping(uint256 => address) private allOptions;

    mapping(address => uint256[]) private fundOptions;

    event OptionCreated(
        address indexed option,
        address indexed bullet,
        address indexed sniper,
        uint256 strikePrice,
        uint256 exerciseTimestamp,
        uint256 optionType
    );

    event StakingRewardPerBlockChanged(uint256 oldReward, uint256 newReward);
    event StakingPoolChanged(address oldStakingPool, address newStakingPool);
    event DOBStakingChanged(address oldDOBStaking, address newDOBStaking);
    event DistribuionsChanged(address oldDDistribuions, address newDistribuions);

    constructor(address _bHodlAddress, address _uHodlAddress) {
        require(_bHodlAddress != address(0), "OptionFactory: zero address");
        require(_uHodlAddress != address(0), "OptionFactory: zero address");

        bHODL = _bHodlAddress;
        uHODL = _uHodlAddress;
    }

    function setStakingPools(address _stakingPools) external onlyOwner {
        require(_stakingPools != address(0), "OptionFactory: zero address");
        address oldStakingPools = stakingPools;
        stakingPools = _stakingPools;
        emit StakingPoolChanged(oldStakingPools, stakingPools);
    }

    function setDOBStakingPool(address _DOBstaking) external onlyOwner {
        require(_DOBstaking != address(0), "OptionFactory: zero address");
        address oldDOBStaking = DOBStakingPool;
        DOBStakingPool = _DOBstaking;
        emit DOBStakingChanged(oldDOBStaking, DOBStakingPool);
    }

    function setDistributions(address _distributions) external onlyOwner {
        require(_distributions != address(0), "OptionFactory: zero address");
        address oldistributions = distributions;
        distributions = _distributions;
        emit DistribuionsChanged(oldistributions, _distributions);
    }

    function setStakingRewardPerBlock(uint256 _reward) external onlyOwner {
        uint256 oldReward = stakingRewardPerBlock;
        stakingRewardPerBlock = _reward;
        emit StakingRewardPerBlockChanged(oldReward, stakingRewardPerBlock);
    }

    function bulletCodeHash() external pure returns (bytes32) {
        return keccak256(type(Bullet).creationCode);
    }

    function sniperCodeHash() external pure returns (bytes32) {
        return keccak256(type(Sniper).creationCode);
    }

    function getLastOptionId() external view override returns (uint256) {
        return lastOptionId;
    }

    function getOptionByID(uint256 _optionID) external view override returns (address) {
        return allOptions[_optionID];
    }

    function getOptionIDs(address _fund) external view override returns (uint256[] memory) {
        return fundOptions[_fund];
    }

    function getStakingPools() external view override returns (address) {
        return stakingPools;
    }

    function createOption(
        uint256 _strikePrice,
        uint256 _exerciseTimestamp,
        uint8 _optionType
    ) external override returns (uint256 optionID) {
        require(_strikePrice > 0, "OptionFactory: zero strike price");
        require(_exerciseTimestamp > block.timestamp + 1 days, "OptionFactory: Illegal exercise time");
        require(_optionType <= 1, "OptionFactory: Illegal type");

        address option;
        address bullet;
        address sniper;

        optionID = ++lastOptionId;

        bytes32 optionSalt = keccak256(abi.encodePacked(_strikePrice, _exerciseTimestamp, _optionType));

        bytes memory optionBytecode = type(Option).creationCode;
        assembly {
            option := create2(0, add(optionBytecode, 32), mload(optionBytecode), optionSalt)
        }
        Option(option).initialize(_strikePrice, _exerciseTimestamp, _optionType);

        bytes32 salt = keccak256(abi.encodePacked(optionID, option));

        bytes memory bulletBytecode = type(Bullet).creationCode;
        assembly {
            bullet := create2(0, add(bulletBytecode, 32), mload(bulletBytecode), salt)
        }

        bytes memory sniperBytecode = type(Sniper).creationCode;
        assembly {
            sniper := create2(0, add(sniperBytecode, 32), mload(sniperBytecode), salt)
        }

        allOptions[optionID] = option;

        Bullet(bullet).initialize(optionID, option);
        Sniper(sniper).initialize(optionID, option);

        Option(option).setup(optionID, uHODL, bHODL, msg.sender, bullet, sniper);

        {
            uint256 exerciseTimestamp = _exerciseTimestamp;
            uint256 endBlock = exerciseTimestamp.sub(block.timestamp).div(uint256(15)).add(block.number);
            IStakingPools(stakingPools).createPool(sniper, option, block.number.add(1), endBlock, stakingRewardPerBlock);
        }
        {
            IDOBStakingPool(DOBStakingPool).addBullet(bullet);
        }
        emit OptionCreated(option, bullet, sniper, _strikePrice, _exerciseTimestamp, _optionType);
    }

    function notifyRemoveBullet(address _bulletAddress) external onlyOwner {
        IDOBStakingPool(DOBStakingPool).removeBullet(_bulletAddress);
    }
}
