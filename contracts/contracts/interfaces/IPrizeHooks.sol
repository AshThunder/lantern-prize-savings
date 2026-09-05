// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice PoolTogether V5 prize-hook wiring (pt-v5-vault).
struct PrizeHooks {
    bool useBeforeClaimPrize;
    bool useAfterClaimPrize;
    IPrizeHooks implementation;
}

/// @title PoolTogether V5 Prize Hooks
/// @notice Winners attach hooks that redirect or decorate prize claims.
/// @dev Origin: https://github.com/GenerationSoftware/pt-v5-vault/blob/main/src/interfaces/IPrizeHooks.sol
///      Guide: https://dev.pooltogether.com/protocol/guides/integrate/prize-incentives
interface IPrizeHooks {
    function beforeClaimPrize(
        address winner,
        uint8 tier,
        uint32 prizeIndex,
        uint96 reward,
        address rewardRecipient
    ) external returns (address prizeRecipient, bytes memory data);

    function afterClaimPrize(
        address winner,
        uint8 tier,
        uint32 prizeIndex,
        uint256 prize,
        address prizeRecipient,
        bytes memory data
    ) external;
}
