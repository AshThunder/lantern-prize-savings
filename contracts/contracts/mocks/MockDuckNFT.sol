// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";

/// @notice Enumerable duck NFT for the PoolTogether-style NFT prize sweepstakes demo.
contract MockDuckNFT is ERC721Enumerable, ERC2771Context {
    uint256 private _nextId;

    constructor(address trustedForwarder_) ERC721("Lantern Duck", "LDUCK") ERC2771Context(trustedForwarder_) {}

    function mint() external returns (uint256 tokenId) {
        tokenId = ++_nextId;
        _mint(_msgSender(), tokenId);
    }

    function _msgSender() internal view override(Context, ERC2771Context) returns (address) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }

    function _contextSuffixLength() internal view override(Context, ERC2771Context) returns (uint256) {
        return ERC2771Context._contextSuffixLength();
    }
}
