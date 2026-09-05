// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {IERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IPrizeHooks} from "./interfaces/IPrizeHooks.sol";

interface IWinningRandom {
    function getWinningRandomNumber() external view returns (uint256);
}

/// @notice PoolTogether V5 "NFT Prize Sweepstakes" hook: redirect a vault prize to a random NFT holder.
/// @dev Origin: https://dev.pooltogether.com/protocol/guides/integrate/prize-incentives#nft-prize-sweepstakes
///      Example: GenerationSoftware/pt-v5-builder-code-examples `prize-to-nft-holder`.
///      Vault-winner selection stays encrypted; this only picks the public NFT recipient from draw entropy.
contract PrizeToNftHolderHook is IPrizeHooks {
    error TokenNotERC721Enumerable();
    error PrizePoolAddressZero();

    IERC721Enumerable public immutable enumerableToken;
    IWinningRandom public immutable prizePool;

    constructor(IERC721Enumerable enumerableToken_, IWinningRandom prizePool_) {
        if (address(prizePool_) == address(0)) revert PrizePoolAddressZero();
        if (!IERC165(address(enumerableToken_)).supportsInterface(type(IERC721Enumerable).interfaceId)) {
            revert TokenNotERC721Enumerable();
        }
        enumerableToken = enumerableToken_;
        prizePool = prizePool_;
    }

    function beforeClaimPrize(
        address winner,
        uint8 tier,
        uint32 prizeIndex,
        uint96,
        address
    ) external view returns (address prizeRecipient, bytes memory data) {
        uint256 supply = enumerableToken.totalSupply();
        if (supply == 0) {
            return (winner, "");
        }
        uint256 entropy = uint256(keccak256(abi.encode(prizePool.getWinningRandomNumber(), tier, prizeIndex)));
        uint256 index = entropy % supply;
        prizeRecipient = enumerableToken.ownerOf(enumerableToken.tokenByIndex(index));
        data = "";
    }

    function afterClaimPrize(address, uint8, uint32, uint256, address, bytes memory) external pure {}
}
