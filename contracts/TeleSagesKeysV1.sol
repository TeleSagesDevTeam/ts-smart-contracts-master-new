//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

enum PriceCurve {
    //flatPriceParam
    Fixed,
    //supply * MultiPriceParam + FlatPriceParam 
    Linear,
    //supply * supply * MultiPriceParam + FlatPriceParam
    Quadratic
}

contract TeleSagesKeysV1 is Ownable {
    address public protocolFeeDestination;
    uint256 public protocolFeePercent;
    uint256 public subjectFeePercent;

    struct KeyPool {
        address owner;
        PriceCurve priceCurve;
        uint256 multiPriceParam;
        uint256 flatPriceParam;
        uint256 supply;

        // Holder => Balance
        mapping(address => uint256) balances;
    }

    event Trade(
        address trader, 
        address subject, 
        uint256 poolIndex, 
        bool isBuy, 
        uint256 keyAmount, 
        uint256 ethAmount, 
        uint256 protocolEthAmount, 
        uint256 subjectEthAmount, 
        uint256 supply
    );

    // keccak256(KeySubject, index) => KeyPool
    mapping(bytes32 => KeyPool) public pools;

    constructor(address _protocolFeeDestination, uint256 _protocolFeePercent, uint256 _subjectFeePercent) 
        Ownable(msg.sender)
    {
        protocolFeeDestination = _protocolFeeDestination;
        protocolFeePercent = _protocolFeePercent;
        subjectFeePercent = _subjectFeePercent;
    }

    function setFeeDestination(address _feeDestination) public onlyOwner {
        protocolFeeDestination = _feeDestination;
    }

    function setProtocolFeePercent(uint256 _feePercent) public onlyOwner {
        protocolFeePercent = _feePercent;
    }

    function setSubjectFeePercent(uint256 _feePercent) public onlyOwner {
        subjectFeePercent = _feePercent;
    }

    function createPool(uint256 poolIndex, PriceCurve priceCurve, uint256 multiPriceParam, uint256 flatPriceParam) public {
        bytes32 poolId = _getPoolId(msg.sender, poolIndex);
        KeyPool storage pool = pools[poolId];

        require(pool.owner == address(0), "Pool already created");
        require(priceCurve != PriceCurve.Fixed || multiPriceParam == 0, "MultiPriceParam not allowed for Fixed PriceCurve");

        pool.owner = msg.sender;
        pool.priceCurve = priceCurve;
        pool.flatPriceParam = flatPriceParam;
        pool.multiPriceParam = multiPriceParam;
        pool.supply = 1;
        pool.balances[msg.sender] = 1;

        emit Trade(msg.sender, msg.sender, poolIndex, true, 1, 0, 0, 0, 1);
    }

    function getBuyPrice(address keySubject, uint256 poolIndex, uint256 amount) public view returns (uint256) {
        bytes32 poolId = _getPoolId(keySubject, poolIndex);
        return _getBuyPrice(poolId, amount);
    }

    function _getBuyPrice(bytes32 poolId, uint256 amount) private view returns (uint256) {
        KeyPool storage pool = pools[poolId];
        require(pool.owner != address(0), "Pool does not exist");
        return getCurvePrice(pool.priceCurve, pool.multiPriceParam, pool.flatPriceParam, pool.supply, amount);
    }

    function getSellPrice(address keySubject, uint256 poolIndex, uint256 amount) public view returns (uint256) {
        bytes32 poolId = _getPoolId(keySubject, poolIndex);
        return _getSellPrice(poolId, amount);
    }

    function _getSellPrice(bytes32 poolId, uint256 amount) private view returns (uint256) {
        KeyPool storage pool = pools[poolId];
        require(pool.owner != address(0), "Pool does not exist");
        require(pool.priceCurve != PriceCurve.Fixed, "Selling keys in fixed price pools is not possible");
        return getCurvePrice(pool.priceCurve, pool.multiPriceParam, pool.flatPriceParam, pool.supply - amount, amount);
    }

    function getBuyPriceAfterFee(address keySubject, uint256 poolIndex, uint256 amount) public view returns (uint256) {
        bytes32 poolId = _getPoolId(keySubject, poolIndex);
        uint256 price = _getBuyPrice(poolId, amount);

        if (pools[poolId].priceCurve == PriceCurve.Fixed) {
            return price;
        }

        uint256 protocolFee = price * protocolFeePercent / 1 ether;
        uint256 subjectFee = price * subjectFeePercent / 1 ether;
        return price + protocolFee + subjectFee;
    }

    function getSellPriceAfterFee(address keySubject, uint256 poolIndex, uint256 amount) public view returns (uint256) {
        bytes32 poolId = _getPoolId(keySubject, poolIndex);       
        uint256 price = _getSellPrice(poolId, amount);

        uint256 protocolFee = price * protocolFeePercent / 1 ether;
        uint256 subjectFee = price * subjectFeePercent / 1 ether;
        return price - protocolFee - subjectFee;
    }

    function getBalance(address user, address keySubject, uint256 poolIndex) public view returns (uint256) {        
        bytes32 poolId = _getPoolId(keySubject, poolIndex);
        return pools[poolId].balances[user];
    }

    function getCurvePrice(PriceCurve priceCurve, uint256 multiPriceParam, uint256 flatPriceParam, uint256 supply, uint256 amount) public pure returns (uint256) {
        if (amount == 0) {
            return 0;
        }
        if (priceCurve == PriceCurve.Fixed) {
            return amount * flatPriceParam;
        }
        if (priceCurve == PriceCurve.Linear) {
            //Same as sum index i from 1 to amount over priceParam * (supply + i - 1)
            return 
                (multiPriceParam * (supply * amount + ((amount - 1) * amount / 2)))
                + amount * flatPriceParam;
        }
        if (priceCurve == PriceCurve.Quadratic) {
            uint256 sum1 = (supply - 1 )* (supply) * (2 * (supply - 1) + 1) / 6;
            uint256 sum2 = (supply - 1 + amount) * (supply + amount) * (2 * (supply - 1 + amount) + 1) / 6;
            uint256 summation = sum2 - sum1;
            return 
                multiPriceParam * summation
                + amount * flatPriceParam;
        }

        revert("Bad curve");
    }

    function buyKeys(address keySubject, uint256 poolIndex, uint256 amount) public payable {
        require(amount > 0, "Minimum 1 key");

        bytes32 poolId = _getPoolId(keySubject, poolIndex);
        KeyPool storage pool = pools[poolId];

        require(pool.owner != address(0), "Pool does not exist");

        uint256 supply = pool.supply;

        uint256 price = _getBuyPrice(poolId, amount);

        uint256 protocolFee;
        uint256 subjectFee;

        if (pool.priceCurve == PriceCurve.Fixed) {
            protocolFee = price * protocolFeePercent / 1 ether;
            subjectFee = price - protocolFee;

            require(msg.value >= protocolFee + subjectFee, "Insufficient payment");
            require(msg.value <= protocolFee + subjectFee, "Excess payment");
        } else {
            protocolFee = price * protocolFeePercent / 1 ether;
            subjectFee = price * subjectFeePercent / 1 ether;

            require(msg.value >= price + protocolFee + subjectFee, "Insufficient payment");
            require(msg.value <= price + protocolFee + subjectFee, "Excess payment");
        }

        pool.supply += amount;
        pool.balances[msg.sender] += amount;
        
        emit Trade(msg.sender, keySubject, poolIndex, true, amount, price, protocolFee, subjectFee, supply + amount);
        (bool success1, ) = protocolFeeDestination.call{value: protocolFee}("");
        (bool success2, ) = keySubject.call{value: subjectFee}("");
        require(success1 && success2, "Unable to send funds");
    }

    function sellKeys(
        address keySubject,
        uint256 poolIndex,
        uint256 amount,
        string[] memory keyIdentifiers
    ) public payable {
        require(amount > 0, "Minimum 1 key");

        bytes32 poolId = _getPoolId(keySubject, poolIndex);
        KeyPool storage pool = pools[poolId];

        require(pool.owner != address(0), "Pool does not exist");

        require(pool.priceCurve != PriceCurve.Fixed, "Selling keys is not allowed for Fixed PriceCurve");

        uint256 supply = pool.supply;

        require(pool.balances[msg.sender] >= amount, "Insufficient keys");
        require(supply > amount, "Cannot sell the last key");

        uint256 price = getCurvePrice(pool.priceCurve, pool.multiPriceParam, pool.flatPriceParam, supply - amount, amount);
        uint256 protocolFee = price * protocolFeePercent / 1 ether;
        uint256 subjectFee = price * subjectFeePercent / 1 ether;
        
        pool.supply -= amount;
        pool.balances[msg.sender] -= amount;

        emit Trade(msg.sender, keySubject, poolIndex, false, amount, price, protocolFee, subjectFee, pool.supply);
        (bool success1, ) = msg.sender.call{value: price - protocolFee - subjectFee}("");
        (bool success2, ) = protocolFeeDestination.call{value: protocolFee}("");
        (bool success3, ) = keySubject.call{value: subjectFee}("");
        require(success1 && success2 && success3, "Unable to send funds");
    }

    function _getPoolId(address keySubject, uint256 poolIndex) private pure returns (bytes32) {
        return keccak256(abi.encode(keySubject, poolIndex));
    }
}