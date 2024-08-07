import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("SAGEStaking", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployStakingFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, userA, userB, userC, userD, userE, otherAccount] =
      await ethers.getSigners();
    const users = [userA, userB, userC, userD, userE];

    const MockSage = await ethers.getContractFactory("MockSAGE");
    const sage = await MockSage.deploy();

    const Staking = await ethers.getContractFactory("SAGEStaking");
    const staking = await Staking.deploy(await sage.getAddress());

    await staking.setLockupDurationFactor(
      60 * 60,
      await staking.FACTOR_DENOMINATOR()
    );

    for (let i = 0; i < users.length; i++) {
      await sage.mint(users[i].address, ethers.parseEther("10000"));
      await sage
        .connect(users[i])
        .approve(await staking.getAddress(), ethers.parseEther("100000"));
    }

    await sage.mint(owner.address, ethers.parseEther("10000"));
    await sage.approve(await staking.getAddress(), ethers.parseEther("100000"));

    return {
      owner,
      users,
      otherAccount,
      sage,
      staking,
    };
  }

  describe("Scenarios", function () {
    it("Should behave as expected in complex scenario", async function () {
      const { sage, staking, users } = await loadFixture(deployStakingFixture);

      const FACTOR_DENOMINATOR = await staking.FACTOR_DENOMINATOR();
      const REWARD_DENOMINATOR = await staking.REWARD_DENOMINATOR();

      const SHORT_DURATION = 60 * 60;
      const MID_DURATION = SHORT_DURATION * 24;
      const LONG_DURATION = MID_DURATION * 7;

      await staking.setLockupDurationFactor(
        SHORT_DURATION,
        FACTOR_DENOMINATOR / 4n
      );
      await staking.setLockupDurationFactor(
        MID_DURATION,
        FACTOR_DENOMINATOR / 2n
      );
      await staking.setLockupDurationFactor(LONG_DURATION, FACTOR_DENOMINATOR);

      await staking
        .connect(users[0])
        .stake(ethers.parseEther("50"), SHORT_DURATION);
      await staking
        .connect(users[1])
        .stake(ethers.parseEther("100"), SHORT_DURATION);
      await staking
        .connect(users[2])
        .stake(ethers.parseEther("50"), MID_DURATION);
      await staking
        .connect(users[3])
        .stake(ethers.parseEther("100"), MID_DURATION);
      await staking
        .connect(users[4])
        .stake(ethers.parseEther("200"), LONG_DURATION);

      const totalEffectiveStake =
        ethers.parseEther("100") / 4n +
        ethers.parseEther("150") / 2n +
        ethers.parseEther("200");

      expect(await staking.getTotalRewardShares()).to.eq(
        totalEffectiveStake + ethers.parseEther("50") / 4n,
        "TotalRewardShares mismatch #2"
      );

      await staking.connect(users[0]).unstake(SHORT_DURATION);

      expect(await staking.getTotalRewardShares()).to.eq(
        totalEffectiveStake,
        "TotalRewardShares mismatch #2"
      );

      await staking.addReward(
        await sage.getAddress(),
        ethers.parseEther("100"),
        0
      );

      const stakeShareValue =
        (REWARD_DENOMINATOR * ethers.parseEther("100")) / totalEffectiveStake;
      expect(
        await staking.totalRewardPerShare(await sage.getAddress())
      ).to.be.eq(stakeShareValue, "Total reward share mismatch #1");

      await expect(
        staking.connect(users[3]).unstake(MID_DURATION)
      ).to.changeTokenBalance(
        sage,
        users[3].address,
        (stakeShareValue * ethers.parseEther("100")) / 2n / REWARD_DENOMINATOR
      );
      await staking.addReward(
        await sage.getAddress(),
        ethers.parseEther("100"),
        0
      );

      expect(
        await staking.totalRewardPerShare(await sage.getAddress())
      ).to.be.eq(
        (REWARD_DENOMINATOR * ethers.parseEther("100")) / totalEffectiveStake +
          (REWARD_DENOMINATOR * ethers.parseEther("100")) /
            (totalEffectiveStake - ethers.parseEther("100") / 2n),
        "Total reward share mismatch #2"
      );

      await time.increase(MID_DURATION);
      await staking.connect(users[3]).withdraw(MID_DURATION);
      await staking
        .connect(users[3])
        .stake(ethers.parseEther("100"), MID_DURATION);

      const claimeableRewards = await staking.getClaimeableRewards(
        users[4].address,
        LONG_DURATION
      );

      expect(await staking.getTotalRewardShares()).to.eq(
        300000000000000000000n
      );

      await staking.setLockupDurationFactor(
        LONG_DURATION,
        2n * FACTOR_DENOMINATOR
      );

      expect(await staking.getTotalRewardShares()).to.eq(
        500000000000000000000n
      );

      await expect(
        staking.connect(users[4]).claim(LONG_DURATION)
      ).to.changeTokenBalance(
        sage,
        users[4].address,
        claimeableRewards[0].amount
      );

      await staking.addReward(
        await sage.getAddress(),
        ethers.parseEther("100"),
        0
      );

      await staking.setLockupDurationFactor(LONG_DURATION, FACTOR_DENOMINATOR);

      await staking.addReward(
        await sage.getAddress(),
        ethers.parseEther("100"),
        0
      );

      await expect(
        staking.connect(users[4]).claim(LONG_DURATION)
      ).to.changeTokenBalance(
        sage,
        users[4].address,
        (8n * ethers.parseEther("100")) / 10n +
          (6666666666666666666n * ethers.parseEther("100")) /
            10000000000000000000n
      );
    });
  });
});
