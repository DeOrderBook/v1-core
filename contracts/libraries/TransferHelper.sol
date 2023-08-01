// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

/**
 * @title TransferHelper library
 * @author DeOrderBook
 * @custom:license Copyright (c) DeOrderBook, 2023 — All Rights Reserved
 * @notice Helper methods for interacting with ERC20 tokens and sending ETH that do not consistently return true/false
 * @dev This library provides safe wrappers around ERC20 token operations and ETH transfers, checking for success and throwing appropriate errors if needed.
 */
library TransferHelper {
    /**
     * @notice Approve spending of an ERC20 token by another address
     * @dev Approves spending of an ERC20 token by another address, checking the return value and handling potential errors
     * @param token The address of the ERC20 token
     * @param to The address to approve spending for
     * @param value The amount to approve spending for
     */
    function safeApprove(address token, address to, uint value) internal {
        // bytes4(keccak256(bytes('approve(address,uint256)')));
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0x095ea7b3, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "TransferHelper: APPROVE_FAILED");
    }

    /**
     * @notice Transfer ERC20 tokens to another address
     * @dev Transfers ERC20 tokens to another address, checking the return value and handling potential errors
     * @param token The address of the ERC20 token
     * @param to The address to transfer tokens to
     * @param value The amount of tokens to transfer
     */
    function safeTransfer(address token, address to, uint value) internal {
        // bytes4(keccak256(bytes('transfer(address,uint256)')));
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0xa9059cbb, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "TransferHelper: TRANSFER_FAILED");
    }

    /**
     * @notice Transfer ERC20 tokens from one address to another
     * @dev Transfers ERC20 tokens from one address to another, checking the return value and handling potential errors
     * @param token The address of the ERC20 token
     * @param from The address to transfer tokens from
     * @param to The address to transfer tokens to
     * @param value The amount of tokens to transfer
     */
    function safeTransferFrom(address token, address from, address to, uint value) internal {
        // bytes4(keccak256(bytes('transferFrom(address,address,uint256)')));
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0x23b872dd, from, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "TransferHelper: TRANSFER_FROM_FAILED");
    }

    /**
     * @notice Transfer ETH to another address
     * @dev Transfers ETH to another address, checking for success and handling potential errors, such as out-of-gas or revert
     * @param to The address to transfer ETH to
     * @param value The amount of ETH to transfer
     */
    function safeTransferETH(address to, uint value) internal {
        (bool success, ) = to.call{value: value}(new bytes(0));
        require(success, "TransferHelper: ETH_TRANSFER_FAILED");
    }
}
