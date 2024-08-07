//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { ISAGEStaking, LockInfo, ClaimableReward, LockupDurationInfo } from "./interfaces/ISAGEStaking.sol";
import { IStakeEscrow } from "./interfaces/IStakeEscrow.sol";
import { StakeEscrow } from "./StakeEscrow.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { ISAGE } from "./interfaces/ISAGE.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

struct LockupFactor {
    uint256 factor;
    mapping(address => uint256) rewardPerShareSnapshot;
}

struct LockupDuration {
    uint32 currentFactorVersion;
    mapping(uint32 => LockupFactor) factors;

    uint256 stakedAmount;
    mapping(address => Lock) locks;
}

struct Lock {
    mapping(address => uint256) claimedRewardPerShare;
    uint32 lockupFactorVersion;

    uint256 stakedAmount;
    uint256 unstakingCompletedAt;
}

struct StreamingReward {
    address rewardAsset;
    uint256 amount;
    uint256 distributedAmount;

    uint256 startTime;
    uint256 duration;
}

contract SAGEStaking is AccessControl, ReentrancyGuard, ISAGEStaking {
    bytes32 public constant REWARDER_ROLE = keccak256("REWARDER_ROLE");
    bytes32 public constant LOCKUP_MANAGE_ROLE = keccak256("LOCKUP_MANAGE_ROLE");

    uint256 public constant FACTOR_DENOMINATOR = 10000; 
    uint256 public constant REWARD_DENOMINATOR = 10 ** 19;

    ISAGE public immutable SAGE;
    address public immutable ESCROW;

    address[] public rewardAssets;

    mapping(address => uint256) public totalRewardPerShare;

    uint256[] public allowedDurations;
    mapping(uint256 => LockupDuration) public lockupDurations;

    mapping(address => IStakeEscrow) public escrows;

    StreamingReward[] public streamingRewards;

    bool public stakingPaused = false;
    bool public assetRemovalPaused = false;
    bool public emergencyWithdrawalEnabled = false;

    event RewardAdded(address rewardAddress, uint256 amount, uint256 duration);
    event TokensStaked(address staker, uint256 amount, uint256 lockupDuration);
    event TokensUnstaked(address staker, uint256 amount, uint256 lockupDuration);
    event TokensWithdrawn(address staker, uint256 amount, uint256 lockupDuration, bool isEmergency);
    event RewardsClaimed(address staker, address rewardAddress, uint256 amount, uint256 factor, uint256 previousRewardPerShare, uint256 newRewardPerShare);
    event RewardPerShareUpdated(address rewardAddress, uint256 totalRewardShares, uint256 distributedAmount, uint256 previousRewardPerShare, uint256 newRewardPerShare);

    constructor(ISAGE sage) 
    {
        SAGE = sage;
        ESCROW = address(new StakeEscrow(sage));

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(REWARDER_ROLE, msg.sender);
        _grantRole(LOCKUP_MANAGE_ROLE, msg.sender);
    }

    function getLocks(address user) external view returns(LockInfo[] memory locks) {
        locks = new LockInfo[](allowedDurations.length);
        
        for(uint i = 0; i < allowedDurations.length; i++) {
            Lock storage lock = lockupDurations[allowedDurations[i]].locks[user];

            locks[i] = (LockInfo({
                duration: allowedDurations[i],
                stakedAmount: lock.stakedAmount,
                unstakingCompletedAt: lock.unstakingCompletedAt
            }));
        }   
    }

    function getClaimeableRewards(address user, uint256 duration) external view returns(ClaimableReward[] memory rewards) {
        rewards = new ClaimableReward[](rewardAssets.length);

        LockupDuration storage lockupDuration = lockupDurations[duration];
        LockupFactor storage currentFactor = lockupDuration.factors[lockupDuration.currentFactorVersion];
        Lock storage lock = lockupDuration.locks[user];

        if (lock.lockupFactorVersion == lockupDuration.currentFactorVersion) {
            for(uint i = 0; i < rewardAssets.length; i++) {
                address rewardAsset = rewardAssets[i];
                rewards[i].amount += _getClaimAmount(
                    lock.claimedRewardPerShare[rewardAsset], 
                    totalRewardPerShare[rewardAsset], 
                    lock.stakedAmount, 
                    currentFactor.factor);
            }
        } else {
            uint32 virtualLockVersion = lock.lockupFactorVersion + 1;

            for(uint i = 0; i < rewardAssets.length; i++) {
                address rewardAsset = rewardAssets[i];
                rewards[i].amount += _getClaimAmount(
                    lock.claimedRewardPerShare[rewardAsset], 
                    lockupDuration.factors[virtualLockVersion].rewardPerShareSnapshot[rewardAsset], 
                    lock.stakedAmount, 
                    lockupDuration.factors[virtualLockVersion - 1].factor);
            }

            while(virtualLockVersion < lockupDuration.currentFactorVersion) {
                LockupFactor storage lockFactor = lockupDuration.factors[virtualLockVersion];
                LockupFactor storage nextFactor = lockupDuration.factors[virtualLockVersion + 1];
                
                for(uint i = 0; i < rewardAssets.length; i++) {
                    address rewardAsset = rewardAssets[i];
                    rewards[i].amount += _getClaimAmount(
                        lockFactor.rewardPerShareSnapshot[rewardAsset], 
                        nextFactor.rewardPerShareSnapshot[rewardAsset], 
                        lock.stakedAmount, 
                        lockFactor.factor);
                }
                virtualLockVersion += 1;
            }

            for(uint i = 0; i < rewardAssets.length; i++) {
                address rewardAsset = rewardAssets[i];
                rewards[i].amount += _getClaimAmount(
                    lockupDuration.factors[virtualLockVersion].rewardPerShareSnapshot[rewardAsset], 
                    totalRewardPerShare[rewardAsset], 
                    lock.stakedAmount, 
                    currentFactor.factor);
            }
        }
    }

    function getDurations() external view returns(LockupDurationInfo[] memory durations) {
        durations = new LockupDurationInfo[](allowedDurations.length);

        for(uint i = 0; i < allowedDurations.length; i++) {
            
            durations[i] = LockupDurationInfo({
                duration: allowedDurations[i],
                stakedAmount: lockupDurations[allowedDurations[i]].stakedAmount,
                factor: lockupDurations[allowedDurations[i]].factors[lockupDurations[allowedDurations[i]].currentFactorVersion].factor
            });
        }
    }

    function setStakingPaused(bool _stakingPaused) external onlyRole(DEFAULT_ADMIN_ROLE) {
        stakingPaused = _stakingPaused;
    }
    function setAssetRemovalPaused(bool _assetRemovalPaused) external onlyRole(DEFAULT_ADMIN_ROLE) {
        assetRemovalPaused = _assetRemovalPaused;
    }
    function setEmergencyWithdrawalEnabled(bool _emergencyWithdrawalEnabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emergencyWithdrawalEnabled = _emergencyWithdrawalEnabled;
    }

    function stake(uint256 amount, uint256 duration) external {
        require(amount > 0, "You can't stake 0 SAGE");
        require(!stakingPaused, "Staking is currently paused");

        LockupDuration storage lockupDuration = lockupDurations[duration];
        Lock storage lock = lockupDuration.locks[msg.sender];

        require(lockupDuration.factors[lockupDuration.currentFactorVersion].factor != 0, "Lockup duration not allowed");
        require(lock.unstakingCompletedAt == 0, "Can't add to a lock while unstaking");

        if (address(escrows[msg.sender]) == address(0)) {
            escrows[msg.sender] = _createEscrow();
        }   

        distributeStreamingRewards();
        if (lock.stakedAmount > 0) {
            _claimForLock(lock, lockupDuration);
        } else {
            lock.lockupFactorVersion = lockupDuration.currentFactorVersion;
            for(uint i = 0; i < rewardAssets.length; i++) {
                lock.claimedRewardPerShare[rewardAssets[i]] = totalRewardPerShare[rewardAssets[i]];
            }
        }

        if (!SAGE.transferFrom(msg.sender, address(escrows[msg.sender]), amount)) {
            revert("SAGE: transferFrom failed");
        }

        lock.stakedAmount += amount;
        lockupDuration.stakedAmount += amount;

        emit TokensStaked(msg.sender, amount, duration);
    }
    function _createEscrow() private returns(IStakeEscrow escrow) {
        escrow = IStakeEscrow(Clones.clone(ESCROW));
        escrow.initialize(msg.sender);
    }

    function unstake(uint256 duration) external {
        LockupDuration storage lockupDuration = lockupDurations[duration];
        Lock storage lock = lockupDuration.locks[msg.sender];
        LockupFactor storage factor = lockupDuration.factors[lockupDuration.currentFactorVersion];

        require(lock.unstakingCompletedAt == 0, "Lock already unstaking");
        require(lock.stakedAmount > 0, "Nothing staked here");
        require(!assetRemovalPaused, "Asset removal is paused");

        distributeStreamingRewards();
        _claimForLock(lock, lockupDuration);

        lock.unstakingCompletedAt = block.timestamp + duration;

        lockupDuration.stakedAmount -= lock.stakedAmount;

        if (lockupDuration.stakedAmount == 0 && factor.factor == 0) {
            for(uint i = 0; i < allowedDurations.length; i++) {
                if (allowedDurations[i] != duration) {
                    continue;
                }

                allowedDurations[i] = allowedDurations[allowedDurations.length - 1];
                allowedDurations.pop();
                break;
            }
        }

        emit TokensUnstaked(msg.sender, lock.stakedAmount, duration);
    }
    function withdraw(uint256 duration) external {
        LockupDuration storage lockupDuration = lockupDurations[duration];
        Lock storage lock = lockupDuration.locks[msg.sender];

        require(lock.stakedAmount > 0, "Nothing staked here");
        require(lock.unstakingCompletedAt != 0, "Not unstaking");
        require(lock.unstakingCompletedAt <= block.timestamp, "Unstaking incomplete");
        require(!assetRemovalPaused, "Asset removal is paused");

        SAGE.transferFrom(address(escrows[msg.sender]), msg.sender, lock.stakedAmount);

        emit TokensWithdrawn(msg.sender, lock.stakedAmount, duration, false);

        lock.unstakingCompletedAt = 0;
        lock.stakedAmount = 0;
    }
    function emergencyWithdraw(uint256 duration) external {
        require(emergencyWithdrawalEnabled, "Emergency withdrawal not active");

        LockupDuration storage lockupDuration = lockupDurations[duration];
        Lock storage lock = lockupDuration.locks[msg.sender];

        require(lock.stakedAmount > 0, "Nothing staked here");

        SAGE.transferFrom(address(escrows[msg.sender]), msg.sender, lock.stakedAmount);

        emit TokensWithdrawn(msg.sender, lock.stakedAmount, duration, true);

        lock.unstakingCompletedAt = 0;
        lock.stakedAmount = 0;
    }

    function claim(uint256 duration) external {
        LockupDuration storage lockupDuration = lockupDurations[duration];
        Lock storage lock = lockupDuration.locks[msg.sender];

        require(lock.stakedAmount > 0, "Nothing staked here");
        require(lock.unstakingCompletedAt == 0, "No rewards while unstaking");
        require(!assetRemovalPaused, "Asset removal is paused");

        distributeStreamingRewards();
        _claimForLock(lockupDuration.locks[msg.sender], lockupDuration);
    }
    function _claimForLock(Lock storage lock, LockupDuration storage lockupDuration) private nonReentrant {
        LockupFactor storage currentFactor = lockupDuration.factors[lockupDuration.currentFactorVersion];

        while(lock.lockupFactorVersion < lockupDuration.currentFactorVersion) {
            LockupFactor storage previousFactor = lockupDuration.factors[lock.lockupFactorVersion];
            LockupFactor storage nextFactor = lockupDuration.factors[lock.lockupFactorVersion + 1];
            
            _claimToTarget(lock, previousFactor.factor, nextFactor.rewardPerShareSnapshot);
            lock.lockupFactorVersion += 1;
        }

        _claimToTarget(lock, currentFactor.factor, totalRewardPerShare);
    }

    function _claimToTarget(Lock storage lock, uint256 factor, mapping(address => uint256) storage shareValues) internal {
        for(uint i = 0; i < rewardAssets.length; i++) {
            address rewardAsset = rewardAssets[i];

            require(shareValues[rewardAsset] >= lock.claimedRewardPerShare[rewardAsset], "Claim ordering mismatch");

            uint256 outstandingReward = _getClaimAmount(
                lock.claimedRewardPerShare[rewardAsset],
                shareValues[rewardAsset],
                lock.stakedAmount,
                factor
            );

            if (outstandingReward == 0) {
                continue;
            }

            emit RewardsClaimed(rewardAsset, msg.sender, outstandingReward, factor, lock.claimedRewardPerShare[rewardAsset], shareValues[rewardAsset]);
            lock.claimedRewardPerShare[rewardAsset] = shareValues[rewardAsset];

            if (rewardAsset == address(0)) {
                (bool success,) = msg.sender.call{value: outstandingReward}("");

                if (!success) {
                    revert("Claim ETH transfer failed");
                }
            } else {
                IERC20(rewardAsset).transfer(msg.sender, outstandingReward);
            }
        }
    }

    function _getClaimAmount(uint256 currentRewardPerShare, uint256 nextRewardPerShare, uint256 amountStaked, uint256 factor) private pure returns (uint256 outstandingReward) {
        uint256 outstandingRewardsPerShare = nextRewardPerShare - currentRewardPerShare;
        outstandingReward = outstandingRewardsPerShare * amountStaked * factor / FACTOR_DENOMINATOR / REWARD_DENOMINATOR;
    }

    function addReward(IERC20 token, uint256 amount, uint256 duration) external onlyRole(REWARDER_ROLE) {
        require(amount > 0, "Cant add 0 reward");

        if (!token.transferFrom(msg.sender, address(this), amount)) {
            revert("Reward transfer failed");
        }
        if (totalRewardPerShare[address(token)] == 0) {
            rewardAssets.push(address(token));
        }

        if (duration == 0) {
            uint256 totalRewardShares = getTotalRewardShares();
            uint256 previousRewardPerShare = totalRewardPerShare[address(token)];
            uint256 newRewardPerShare = previousRewardPerShare + (REWARD_DENOMINATOR * amount) / totalRewardShares;
            emit RewardPerShareUpdated(address(token), totalRewardShares, amount, previousRewardPerShare, newRewardPerShare);
            totalRewardPerShare[address(token)] = newRewardPerShare;
        }
        else {
            streamingRewards.push(StreamingReward({
                rewardAsset: address(token),
                amount: amount,
                distributedAmount: 0,
                startTime: block.timestamp,
                duration: duration
            }));
        }

        emit RewardAdded(address(token), amount, duration);
    }
    function addRewardETH(uint256 duration) payable external onlyRole(REWARDER_ROLE) {
        require(msg.value > 0, "Cant add 0 reward");

        if (totalRewardPerShare[address(0)] == 0) {
            rewardAssets.push(address(0));
        }

        if (duration == 0) {
            uint256 totalRewardShares = getTotalRewardShares();
            uint256 previousRewardPerShare = totalRewardPerShare[address(0)];
            uint256 newRewardPerShare = previousRewardPerShare + (REWARD_DENOMINATOR * msg.value) / totalRewardShares;
            emit RewardPerShareUpdated(address(0), totalRewardShares, msg.value, previousRewardPerShare, newRewardPerShare);
            totalRewardPerShare[address(0)] = newRewardPerShare;
        }
        else {
            streamingRewards.push(StreamingReward({
                rewardAsset: address(0),
                amount: msg.value,
                distributedAmount: 0,
                startTime: block.timestamp,
                duration: duration
            }));
        }

        emit RewardAdded(address(0), msg.value, duration);
    }

    function setLockupDurationFactor(uint256 duration, uint256 factor) external onlyRole(LOCKUP_MANAGE_ROLE) {        
        distributeStreamingRewards();
        
        uint32 currentFactorVersion = lockupDurations[duration].currentFactorVersion;
        LockupFactor storage _factor = lockupDurations[duration].factors[currentFactorVersion];

        if (_factor.factor == 0 && lockupDurations[duration].stakedAmount == 0) {
            allowedDurations.push(duration);
        }
        
        lockupDurations[duration].currentFactorVersion += 1;

        _factor = lockupDurations[duration].factors[currentFactorVersion + 1];
        _factor.factor = factor;
        
        for(uint i = 0; i < rewardAssets.length; i++) {
            _factor.rewardPerShareSnapshot[rewardAssets[i]] = totalRewardPerShare[rewardAssets[i]];
        }    
    }

    function getTotalRewardShares() public view returns (uint256 totalShares) {
        for(uint i = 0; i < allowedDurations.length; i++) {
            LockupDuration storage lockupDuration = lockupDurations[allowedDurations[i]];
            LockupFactor storage factor = lockupDuration.factors[lockupDuration.currentFactorVersion];
            totalShares += lockupDuration.stakedAmount * factor.factor / FACTOR_DENOMINATOR;
        }
    }

    function distributeStreamingRewards() public {
        uint256 totalRewardShares = getTotalRewardShares();

        for(uint i = 0; i < streamingRewards.length; i++) {
            StreamingReward storage reward = streamingRewards[i];
            uint256 currentDuration = block.timestamp - reward.startTime;

            if (currentDuration > reward.duration) {
                currentDuration = reward.duration;
            }

            uint256 amountToDistribute = (reward.amount * currentDuration / reward.duration) - reward.distributedAmount;

            if (amountToDistribute == 0) {
                continue;
            }

            uint256 previousRewardPerShare = totalRewardPerShare[reward.rewardAsset];
            uint256 newRewardPerShare = previousRewardPerShare + REWARD_DENOMINATOR * amountToDistribute / totalRewardShares;
            
            emit RewardPerShareUpdated(reward.rewardAsset, totalRewardShares, amountToDistribute, previousRewardPerShare, newRewardPerShare);

            totalRewardPerShare[reward.rewardAsset] = newRewardPerShare;
            reward.distributedAmount += amountToDistribute;

            if (currentDuration == reward.duration) {
                streamingRewards[i] = streamingRewards[streamingRewards.length - 1];
                streamingRewards.pop();
            }
        }
    }
}