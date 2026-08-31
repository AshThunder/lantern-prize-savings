// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";
import {ERC7984ERC20Wrapper} from "@openzeppelin/confidential-contracts/token/ERC7984/extensions/ERC7984ERC20Wrapper.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @notice Local ERC-7984 wrapper used in Hardhat tests.
contract MockConfidentialUSDT is ZamaEthereumConfig, ERC7984ERC20Wrapper {
    constructor(
        IERC20 underlying_
    ) ERC7984("Confidential USDT Mock", "cUSDT", "") ERC7984ERC20Wrapper(underlying_) {}
}
