// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

interface IOptionFactory {
    function getLastOptionId() external view returns (uint);

    function createOption(
        uint256 _strikePrice,
        uint256 _exerciseTimpstamp,
        uint8 _optionType
    ) external returns (uint256 optionID);

    function getOptionByID(uint256 _optionID) external view returns (address);

    function getOptionIDs(address _fund) external view returns (uint256[] memory);

    function getStakingPools() external view returns (address);

    function distributions() external view returns (address);
}
