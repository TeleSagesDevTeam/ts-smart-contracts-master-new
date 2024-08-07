//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { IStakeEscrow } from "./interfaces/IStakeEscrow.sol";
import { Initializable } from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import { ISAGE } from "./interfaces/ISAGE.sol";

contract StakeEscrow is IStakeEscrow, Initializable {
    uint256 constant private MAX_INT = 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;
    ISAGE public immutable SAGE;

    address public staker;

    constructor(ISAGE sage) {
        SAGE = sage;
    }

    function initialize(address _staker) external initializer {
        staker = _staker;

        SAGE.approve(msg.sender, MAX_INT);
        SAGE.delegate(_staker);
    }
}