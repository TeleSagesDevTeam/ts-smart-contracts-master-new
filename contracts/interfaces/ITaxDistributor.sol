//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface ITaxDistributor {
        function distributeTax(address token) external returns(bool);
}