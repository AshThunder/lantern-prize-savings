// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Mintable 6-decimal USDT stand-in for local tests (mirrors Sepolia mock faucet).
contract MockUSDT is ERC20 {
    uint256 public constant FAUCET_CAP = 1_000_000 * 1e6;

    constructor() ERC20("Tether USD Mock", "USDT") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        require(amount <= FAUCET_CAP, "faucet cap");
        _mint(to, amount);
    }
}
