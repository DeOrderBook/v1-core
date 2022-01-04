// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract Distributions is OwnableUpgradeable {
    uint8 public exerciseFeeRatio;
    uint8 public withdrawFeeRatio;
    uint8 public bulletToRewardRatio;
    uint8 public hodlWithdrawFeeRatio; //thousands

    struct Distribution {
        uint8 percentage;
        address to;
    }

    Distribution[] public feeDistribution;
    Distribution[] public bulletDistribution;
    Distribution[] public hodlWithdrawFeeDistribution;

    uint256 public feeDistributionLength;
    uint256 public bulletDistributionLength;
    uint256 public hodlWithdrawFeeDistributionLength;

    event ExerciseFeeRatioChanged(uint8 oldExerciseFeeRatio, uint8 newExerciseFeeRatio);
    event WithdrawFeeRatioChanged(uint8 oldWithdrawFeeRatio, uint8 newWithdrawFeeRatio);
    event HodlWithdrawFeeRatioChanged(uint8 oldHodlWithdrawFeeRatio, uint8 newHodlWithdrawFeeRatio);
    event BulletToRewardRatioChanged(uint8 oldBulletToRewardRatio, uint8 newBulletToRewardRatio);
    event FeeDistributionSetted(uint8[] percentage, address[] to);
    event BulletDistributionSetted(uint8[] percentage, address[] to);
    event HodlWithdrawFeeDistributionSetted(uint8[] percentage, address[] to);

    function __Distributions_init() public initializer {
        __Ownable_init();
        bulletToRewardRatio = 80;
    }

    function setExerciseFee(uint8 _feeRatio) external onlyOwner {
        require(0 <= _feeRatio && _feeRatio < 100, "OptionFactory: Illegal value range");

        uint8 oldFeeRatio = exerciseFeeRatio;
        exerciseFeeRatio = _feeRatio;
        emit ExerciseFeeRatioChanged(oldFeeRatio, exerciseFeeRatio);
    }

    function setWithdrawFee(uint8 _feeRatio) external onlyOwner {
        require(0 <= _feeRatio && _feeRatio < 100, "OptionFactory: Illegal value range");

        uint8 oldFeeRatio = withdrawFeeRatio;
        withdrawFeeRatio = _feeRatio;
        emit WithdrawFeeRatioChanged(oldFeeRatio, withdrawFeeRatio);
    }

    function setHodlWithdrawFee(uint8 _feeRatio) external onlyOwner {
        require(0 <= _feeRatio && _feeRatio < 100, "OptionFactory: Illegal value range");

        uint8 oldFeeRatio = hodlWithdrawFeeRatio;
        hodlWithdrawFeeRatio = _feeRatio;
        emit HodlWithdrawFeeRatioChanged(oldFeeRatio, hodlWithdrawFeeRatio);
    }

    function setBulletToRewardRatio(uint8 _bulletToRewardRatio) external onlyOwner {
        require(0 <= _bulletToRewardRatio && _bulletToRewardRatio <= 80, "OptionFactory: Illegal value range");

        uint8 oldBulletToRewardRatio = bulletToRewardRatio;
        bulletToRewardRatio = _bulletToRewardRatio;
        emit BulletToRewardRatioChanged(oldBulletToRewardRatio, bulletToRewardRatio);
    }

    function setFeeDistribution(uint8[] memory _percentage, address[] memory _to) external onlyOwner {
        require(_percentage.length == _to.length, "Distributions: array length not match");
        uint8 sum;
        for (uint8 i = 0; i < _percentage.length; i++) {
            sum += _percentage[i];
        }
        require(sum == 100, "Distributions: sum of percentage not 100");
        delete feeDistribution;
        for (uint8 j = 0; j < _percentage.length; j++) {
            uint8 percentage = _percentage[j];
            address to = _to[j];
            Distribution memory distribution = Distribution({percentage: percentage, to: to});
            feeDistribution.push(distribution);
        }
        feeDistributionLength = _percentage.length;
        emit FeeDistributionSetted(_percentage, _to);
    }

    function setBulletDistribution(uint8[] memory _percentage, address[] memory _to) external onlyOwner {
        require(_percentage.length == _to.length, "Distributions: array length not match");
        uint8 sum;
        for (uint8 i = 0; i < _percentage.length; i++) {
            sum += _percentage[i];
        }
        require(sum == 100, "Distributions: sum of percentage not 100");
        delete bulletDistribution;
        for (uint8 j = 0; j < _percentage.length; j++) {
            uint8 percentage = _percentage[j];
            address to = _to[j];
            Distribution memory distribution = Distribution({percentage: percentage, to: to});
            bulletDistribution.push(distribution);
        }
        bulletDistributionLength = _percentage.length;
        emit BulletDistributionSetted(_percentage, _to);
    }

    function setHodlWithdrawFeeDistribution(uint8[] memory _percentage, address[] memory _to) external onlyOwner {
        require(_percentage.length == _to.length, "Distributions: array length not match");
        uint8 sum;
        for (uint8 i = 0; i < _percentage.length; i++) {
            sum += _percentage[i];
        }
        require(sum == 100, "Distributions: sum of percentage not 100");
        delete hodlWithdrawFeeDistribution;
        for (uint8 j = 0; j < _percentage.length; j++) {
            uint8 percentage = _percentage[j];
            address to = _to[j];
            Distribution memory distribution = Distribution({percentage: percentage, to: to});
            hodlWithdrawFeeDistribution.push(distribution);
        }
        hodlWithdrawFeeDistributionLength = _percentage.length;
        emit HodlWithdrawFeeDistributionSetted(_percentage, _to);
    }
}
