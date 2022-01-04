// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

interface IDOBStakingPool {
    function addBullet(address _bulletAddress) external;

    function removeBullet(address _bulletAddress) external;
}
