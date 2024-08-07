//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { ISAGE } from "../interfaces/ISAGE.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Votes } from "@openzeppelin/contracts/governance/utils/Votes.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

contract MockSAGE is ERC20, EIP712, Votes, ISAGE {
    constructor() ERC20("SAGE", "SAGE") EIP712("SAGE", "1") {
        
    }

    function _getVotingUnits(address user) internal view override returns (uint256) {
        return balanceOf(user);
    }

    function mint(address target, uint256 amount) external {
        _mint(target, amount);
    }
}