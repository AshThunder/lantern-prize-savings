// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";

/// @notice Trusted forwarder for gasless Lantern actions (same pattern as Carrot / PoolTogether gasless UX).
contract LanternForwarder is ERC2771Forwarder {
    constructor() ERC2771Forwarder("Lantern") {}
}
