// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Wrapper.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../option/Distributions.sol";

/**
 * @title HODLToken
 * @author DeOrderBook
 * @custom:license Copyright (c) DeOrderBook, 2023 — All Rights Reserved
 * @notice HODL tokens are wrappers for external tokens designed to incentivize holders to retain their position by offering special functionality, like the ability to check if a holder owns a certain NFT.
 * @dev Inherits from ERC20Wrapper and Ownable. Uses the SafeMath library for all mathematical operations to prevent overflow and underflow errors.
 */
contract HODLToken is ERC20Wrapper, Ownable {
    using SafeMath for uint256;

    /**
     * @notice An instance of the Distributions contract.
     * @dev This contract is responsible for managing the distribution of fees collected from HODL tokens.
     */
    Distributions public immutable distributions;

    /**
     * @notice A flag indicating whether NFT ownership checks are enabled or disabled.
     * @dev If true, the contract will check if a token holder owns a certain NFT before allowing certain operations.
     */
    bool public isCheckNFT;

    /**
     * @notice The address of the ERC721 token contract against which NFT ownership checks are to be performed.
     * @dev This address is set via the `setIsCheckNFT` function and is used in the `nftCheckSuccess` function.
     */
    ERC721 public NFTAddress;

    /**
     * @notice Constructs the HODLToken contract.
     * @dev Assigns the underlying ERC20 token that the HODL token wraps and the Distributions contract.
     * @param underlyingTokenAddress The address of the ERC20 token that the HODL token wraps.
     * @param distributionsAddress The address of the Distributions contract.
     * @param symbol_ The symbol of the HODL token.
     */
    constructor(
        address underlyingTokenAddress,
        address distributionsAddress,
        string memory symbol_
    ) ERC20("HODL Token", symbol_) ERC20Wrapper(IERC20(underlyingTokenAddress)) {
        require(underlyingTokenAddress != address(0), "HODLToken: zero address");
        distributions = Distributions(distributionsAddress);
    }

    /**
     * @notice Allows the contract owner to enable or disable NFT ownership checks and to set the NFT contract address.
     * @dev If NFT checks are enabled, the provided NFT contract address must be a valid contract address.
     * @param _isCheckNFT Indicates whether NFT checks are to be enabled or disabled.
     * @param _nftAddress The address of the NFT contract against which checks are to be performed.
     */
    function setIsCheckNFT(bool _isCheckNFT, ERC721 _nftAddress) public onlyOwner {
        if (_isCheckNFT) {
            require(address(_nftAddress) != address(0), "HODLToken: NFT zero address");
            uint256 size;
            assembly {
                size := extcodesize(_nftAddress)
            }
            require(size > 0, "Not a contract");
            NFTAddress = _nftAddress;
        }
        isCheckNFT = _isCheckNFT;
    }

    /**
     * @notice Checks whether the caller owns an NFT, if NFT checks are enabled.
     * @dev Returns true if NFT checks are disabled or if the caller owns an NFT.
     * @return Returns true if NFT checks are disabled or if the caller owns an NFT.
     */
    function nftCheckSuccess() private view returns (bool) {
        if (isCheckNFT) {
            uint256 userNft = NFTAddress.balanceOf(msg.sender);
            if (userNft > 0) {
                return true;
            } else {
                return false;
            }
        } else {
            return true;
        }
    }

    /**
     * @notice Allows a user to deposit a specified amount of the underlying token and mints them an equivalent amount of HODL tokens.
     * @dev The sender must own an NFT if NFT checks are enabled. The sender cannot be the zero address.
     * @param amount The amount of the underlying token to deposit.
     * @return Returns true upon success.
     */
    function deposit(uint256 amount) external returns (bool) {
        require(msg.sender != address(0), "HODLToken: zero address");
        require(amount > 0, "HODLToken: zero amount");
        require(nftCheckSuccess(), "HODLToken: you do not have NFT");
        depositFor(msg.sender, amount);
        return true;
    }

    /**
     * @notice Allows a user to withdraw a specified amount of the underlying token by burning an equivalent amount of HODL tokens.
     * @dev The sender cannot be the zero address.
     * @param amount The amount of the underlying token to withdraw.
     * @return Returns true upon success.
     */
    function withdraw(uint256 amount) external returns (bool) {
        require(msg.sender != address(0), "HODLToken: zero address");
        require(amount > 0, "HODLToken: zero amount");
        withdrawTo(msg.sender, amount);
        return true;
    }

    /**
     * @notice Burns a specified amount of HODL tokens from the sender's account and transfers the underlying tokens to a specified account.
     * @dev A withdrawal fee is charged, part of which is burned and part of which is distributed as per the rules in the Distributions contract.
     * @param account The account to receive the underlying tokens.
     * @param amount The amount of HODL tokens to burn.
     * @return Returns true upon success.
     */
    function withdrawTo(address account, uint256 amount) public override returns (bool) {
        uint256 feeAmount = amount.mul(distributions.hodlWithdrawFeeRatio()).div(10000);
        uint256 burnAmount = amount.sub(feeAmount);
        _burn(_msgSender(), burnAmount);

        for (uint8 i = 0; i < distributions.hodlWithdrawFeeDistributionLength(); i++) {
            (uint8 percentage, address to) = distributions.hodlWithdrawFeeDistribution(i);
            SafeERC20.safeTransferFrom(IERC20(address(this)), _msgSender(), to, feeAmount.mul(percentage).div(100));
        }
        SafeERC20.safeTransfer(underlying, account, amount.sub(feeAmount));
        return true;
    }
}
