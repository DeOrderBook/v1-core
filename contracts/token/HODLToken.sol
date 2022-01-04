// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Wrapper.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../option/Distributions.sol";

/**
 * @title HOLDToken
 *
 * @dev A minimal ERC20 token contract for the HOLD token.
 */
contract HODLToken is ERC20Wrapper, Ownable {
    using SafeMath for uint256;
    Distributions public immutable distributions;

    constructor(
        address underlyingTokenAddress,
        address distributionsAddress,
        string memory symbol_
    ) ERC20("Hodl Token", symbol_) ERC20Wrapper(IERC20(underlyingTokenAddress)) {
        require(underlyingTokenAddress != address(0), "HODLToken: zero address");
        distributions = Distributions(distributionsAddress);
    }

    function deposit(uint256 amount) external returns (bool) {
        require(msg.sender != address(0), "HODLToken: zero address");
        require(amount > 0, "HODLToken: zero amount");
        depositFor(msg.sender, amount);
        return true;
    }

    function withdraw(uint256 amount) external returns (bool) {
        require(msg.sender != address(0), "HODLToken: zero address");
        require(amount > 0, "HODLToken: zero amount");
        withdrawTo(msg.sender, amount);
        return true;
    }

    function withdrawTo(address account, uint256 amount) public override returns (bool) {
        _burn(_msgSender(), amount);
        uint256 feeAmount = amount.div(1000).mul(distributions.hodlWithdrawFeeRatio());

        for (uint8 i = 0; i < distributions.hodlWithdrawFeeDistributionLength(); i++) {
            (uint8 percentage, address to) = distributions.hodlWithdrawFeeDistribution(i);
            SafeERC20.safeTransfer(underlying, to, feeAmount.div(100).mul(percentage));
        }
        SafeERC20.safeTransfer(underlying, account, amount.sub(feeAmount));
        return true;
    }
}
