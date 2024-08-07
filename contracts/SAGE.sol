//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ERC20Burnable } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import { ERC20Votes } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import { IVotes } from "@openzeppelin/contracts/governance/utils/IVotes.sol";

import { IUniswapV2Router01 } from "./interfaces/IUniswapV2Router01.sol";
import { IUniswapV2Factory } from "./interfaces/IUniswapV2Factory.sol";
import { ITaxDistributor } from "./interfaces/ITaxDistributor.sol";

contract SAGE is IERC165, IERC20Metadata, Ownable, ERC20Burnable, ERC20Votes {
    event TokenLaunched(uint256 launchStartedAt, address lpRefillWallet, address marketingWallet, address vcWallet);

    event BuyFeePaid(address indexed from, uint256 amount);
    event SellFeePaid(address indexed from, uint256 amount);

    event LPPairSet(address indexed pair, bool enabled);
    event BlacklistSet(address indexed user, bool enabled);
    event TaxDistributorSet(address indexed taxDistributor);
    event TaxAndLimitEvaderSet(address indexed user, bool enabled);

    event FeesLockedForever();
    event BlacklistAddDisabledForever();
    event TaxDistributorLockedForever();

    event TradeTaxChanged(uint256 previousBuyFeeNumerator, uint256 buyFeeNumerator, uint256 previousSellFeeNumerator, uint256 sellFeeNumerator);

    string constant private _name = "SAGE";
    string constant private _symbol = "SAGE";
    uint256 constant private TOTAL_SUPPLY = 100_000_000 * (10 ** 18);

    uint256 constant private INITIAL_LP_PERCENTAGE = 75;
    uint256 constant private LP_REFILL_PERCENTAGE = 5;
    uint256 constant private MARKETING_PERCENTAGE = 10;
    uint256 constant private VC_PERCENTAGE = 10;

    uint256 constant public DENOMINATOR = 10000;
    uint256 constant public MAX_BUY_FEE_NUMERATOR = 500;  // 5%
    uint256 constant public MAX_SELL_FEE_NUMERATOR = 500;  // 5%

    uint256 constant public PRESALE_WHITELIST_DURATION = 5 * 60;
    uint256 constant public PRESALE_WHALE_PREVENTION_DURATION = 30 * 60;

    bool public feesLockedForever;
    bool public blackListAddLockedForever;
    bool public taxDistributorLockedForever;

    uint256 private buyFeeNumerator = MAX_BUY_FEE_NUMERATOR;
    uint256 private sellFeeNumerator = MAX_SELL_FEE_NUMERATOR;

    uint256 public launchStartedAt;

    ITaxDistributor public taxDistributor;

    struct AccountInfo {
        bool isAvoidingTaxAndLimits;
        bool isLPPool;
        bool isWhitelistedForPresale;
        bool isBlackListed;
    }
    mapping (address => AccountInfo) public accountInfo;

    constructor(ITaxDistributor _taxDistributor) Ownable(msg.sender) ERC20(_name, _symbol) EIP712(_name, "1") {
        _setTaxDistributor(_taxDistributor);
        _setTaxAndLimitEvader(address(this), true);
        _setTaxAndLimitEvader(address(msg.sender), true);

        _mint(address(this), TOTAL_SUPPLY);
    }

    function addPresaleWhitelist(address[] calldata accounts) external onlyOwner {
        require(launchStartedAt == 0, "Launch already started");
        for (uint256 i = 0; i < accounts.length; i++) {
            accountInfo[accounts[i]].isWhitelistedForPresale = true;
        }
    }

    function startLaunch(IUniswapV2Router01 uniswap, address lpRefillWallet, address marketingWallet, address vcWallet) external onlyOwner payable {
        require(launchStartedAt == 0, "Launch already started");
        launchStartedAt = block.timestamp;

        _transfer(address(this), lpRefillWallet, TOTAL_SUPPLY * LP_REFILL_PERCENTAGE / 100);
        _transfer(address(this), marketingWallet, TOTAL_SUPPLY * MARKETING_PERCENTAGE / 100);
        _transfer(address(this), vcWallet, TOTAL_SUPPLY * VC_PERCENTAGE / 100);

        IUniswapV2Factory factory = IUniswapV2Factory(uniswap.factory());
        address pair = factory.createPair(address(this), uniswap.WETH());
        _setLpPair(pair, true);

        _approve(address(this), address(uniswap), TOTAL_SUPPLY * INITIAL_LP_PERCENTAGE / 100);
        uniswap.addLiquidityETH{value: msg.value}({
            token: address(this),
            amountTokenDesired: TOTAL_SUPPLY * INITIAL_LP_PERCENTAGE / 100,
            amountTokenMin: 0,
            amountETHMin: 0,
            to: msg.sender,
            deadline: block.timestamp
        });

        emit TokenLaunched(launchStartedAt, lpRefillWallet, marketingWallet, vcWallet);
    }

    function lockFeesForever() external onlyOwner {
        require(!feesLockedForever, "Already locked");
        feesLockedForever = true;
        emit FeesLockedForever();
    }
    function lockBlackListForever() external onlyOwner {
        require(!blackListAddLockedForever, "Already locked");
        blackListAddLockedForever = true;
        emit BlacklistAddDisabledForever();
    }
    function lockTaxDistributor() external onlyOwner {
        require(!taxDistributorLockedForever, "Already locked");
        taxDistributorLockedForever = true;
        emit TaxDistributorLockedForever();
    }

    function setTaxDistributor(ITaxDistributor _taxDistributor) external onlyOwner {
        require(!taxDistributorLockedForever, "TaxDistributor is locked");
        _setTaxDistributor(_taxDistributor);
    }
    function _setTaxDistributor(ITaxDistributor _taxDistributor) internal {
        taxDistributor = _taxDistributor;
        emit TaxDistributorSet(address(taxDistributor));
    }

    function setTaxAndLimitEvader(address user, bool enabled) external onlyOwner {
        _setTaxAndLimitEvader(user, enabled);
    }
    function _setTaxAndLimitEvader(address user, bool enabled) internal {
        accountInfo[user].isAvoidingTaxAndLimits = enabled;
        emit TaxAndLimitEvaderSet(user, enabled);
    }

    function setLpPair(address pair, bool enabled) external onlyOwner {
        _setLpPair(pair, enabled);
    }
    function _setLpPair(address pair, bool enabled) internal {
        accountInfo[pair].isLPPool = enabled;
        emit LPPairSet(pair, enabled);
    }

    function setBlackList(address user, bool enabled) external onlyOwner {
        require(!blackListAddLockedForever || !enabled, "Blacklist add is locked");
        accountInfo[user].isBlackListed = enabled;
        emit BlacklistSet(user, enabled);
    }

    function setTradeTax(uint256 _buyFeeNumerator, uint256 _sellFeeNumerator) external onlyOwner {
        require(!feesLockedForever, "Fees are locked");
        require(_buyFeeNumerator <= MAX_BUY_FEE_NUMERATOR, "Buy fee too high");
        require(_sellFeeNumerator <= MAX_SELL_FEE_NUMERATOR, "Sell fee too high");

        emit TradeTaxChanged(buyFeeNumerator, _buyFeeNumerator, sellFeeNumerator, _sellFeeNumerator);

        buyFeeNumerator = _buyFeeNumerator;
        sellFeeNumerator = _sellFeeNumerator;
    }

    function _update(address from, address to, uint value) override(ERC20, ERC20Votes) internal {
        AccountInfo memory fromInfo = accountInfo[from];
        AccountInfo memory toInfo = accountInfo[to];

        require(!fromInfo.isBlackListed && !toInfo.isBlackListed, "Blacklisted");

        if (fromInfo.isAvoidingTaxAndLimits || toInfo.isAvoidingTaxAndLimits) {
            super._update(from, to, value);
            return;
        }

        require(launchStartedAt != 0, "Token not launched");

        if (launchStartedAt + PRESALE_WHALE_PREVENTION_DURATION > block.timestamp) {
            require(toInfo.isLPPool || balanceOf(to) + value < TOTAL_SUPPLY * 1 / 100, "Address supply limit hit");

            if (launchStartedAt + PRESALE_WHITELIST_DURATION > block.timestamp) {
                require(fromInfo.isLPPool && !toInfo.isLPPool, "No transfers during presale");
                require(toInfo.isWhitelistedForPresale, "Not whitelisted for presale");
            }
        }

        if (fromInfo.isLPPool) {
            if (toInfo.isLPPool) {
                super._update(from, to, value);
                return;
            }

            uint buyFeeValue = value * buyFeeNumerator / DENOMINATOR;
            super._update(from, address(taxDistributor), buyFeeValue);
            emit BuyFeePaid(from, buyFeeValue);

            unchecked {
                //Can't underflow, saves some gas
                value -= buyFeeValue;
            }
        } else if (toInfo.isLPPool) {
            uint sellFeeValue = value * sellFeeNumerator / DENOMINATOR;
            super._update(from, address(taxDistributor), sellFeeValue);
            emit SellFeePaid(from, sellFeeValue);

            unchecked {
                //Can't underflow, saves some gas
                value -= sellFeeValue;
            }
        } else {
            //No fees for usual transfers
        }

        super._update(from, to, value);
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IERC165).interfaceId ||
            interfaceId == type(IVotes).interfaceId ||
            interfaceId == type(IERC20).interfaceId;
    }
}