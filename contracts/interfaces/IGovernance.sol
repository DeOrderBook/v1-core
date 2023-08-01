// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.4;

/**
 * @title Governance interface.
 * @author DeOrderBook
 * @custom:license Copyright (c) DeOrderBook, 2023 — All Rights Reserved
 * @dev Interface for managing the governance process.
 */
interface IGovernance {
    /**
     * @notice Get the receipt for a given voter on a given proposal
     * @dev Returns the receipt for the specified voter on the specified proposal
     * @param proposalId The ID of the proposal to retrieve the receipt for
     * @param voter The address of the voter to retrieve the receipt for
     * @return The receipt as a tuple (votes, status)
     */
    function getReceipt(uint256 proposalId, address voter) external view returns (uint256, uint8);

    /**
     * @notice Check if a given proposal has been successful
     * @dev Returns a boolean indicating if the specified proposal has been successful
     * @param proposalId The ID of the proposal to check
     * @return A boolean indicating if the proposal was successful
     */
    function isProposalSuccessful(uint256 proposalId) external view returns (bool);

    /**
     * @notice Get the snapshot block number for a given proposal
     * @dev Returns the snapshot block number for the specified proposal
     * @param proposalId The ID of the proposal to retrieve the snapshot for
     * @return The snapshot block number for the proposal
     */
    function proposalSnapshot(uint256 proposalId) external view returns (uint256);

    /**
     * @notice Get the address of the governance executor
     * @dev Returns the address of the governance executor
     * @return The address of the governance executor
     */
    function executor() external view returns (address);
}
