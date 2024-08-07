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
    const [owner, rewarder, stakerAccount66, stakerAccount33, otherAccount] =
      await ethers.getSigners();

    const MockSage = await ethers.getContractFactory("MockSAGE");
    const sage = await MockSage.deploy();

    const Staking = await ethers.getContractFactory("SAGEStaking");
    const staking = await Staking.deploy(await sage.getAddress());

    await staking.setLockupDurationFactor(
      60 * 60,
      await staking.FACTOR_DENOMINATOR()
    );

    await staking.grantRole(await staking.REWARDER_ROLE(), rewarder.address);

    await sage.mint(owner.address, ethers.parseEther("100000"));
    await sage.mint(rewarder.address, ethers.parseEther("100000"));
    await sage.mint(stakerAccount66.address, ethers.parseEther("100000"));
    await sage.mint(stakerAccount33.address, ethers.parseEther("100000"));

    await sage.approve(await staking.getAddress(), ethers.parseEther("100000"));
    await sage
      .connect(rewarder)
      .approve(await staking.getAddress(), ethers.parseEther("100000"));
    await sage
      .connect(stakerAccount66)
      .approve(await staking.getAddress(), ethers.parseEther("100000"));
    await sage
      .connect(stakerAccount33)
      .approve(await staking.getAddress(), ethers.parseEther("100000"));

    await staking
      .connect(stakerAccount66)
      .stake(ethers.parseEther("66"), 60 * 60);
    await staking
      .connect(stakerAccount33)
      .stake(ethers.parseEther("33"), 60 * 60);

    return {
      owner,
      rewarder,
      stakerAccount33,
      stakerAccount66,
      otherAccount,
      sage,
      staking,
    };
  }

  describe("claim", function () {
    it("Should revert when claiming for an empty lock", async function () {
      const { staking, otherAccount } = await loadFixture(deployStakingFixture);

      await expect(
        staking.connect(otherAccount).claim(60 * 60)
      ).to.be.revertedWith("Nothing staked here");
    });

    it("Should revert when claiming for an unstaking lock", async function () {
      const { staking, stakerAccount33 } = await loadFixture(
        deployStakingFixture
      );

      await staking.connect(stakerAccount33).unstake(60 * 60);

      await expect(
        staking.connect(stakerAccount33).claim(60 * 60)
      ).to.be.revertedWith("No rewards while unstaking");
    });

    it("Should do nothing when no rewards were added", async function () {
      const { sage, staking, stakerAccount33 } = await loadFixture(
        deployStakingFixture
      );

      await expect(
        staking.connect(stakerAccount33).claim(60 * 60)
      ).to.changeTokenBalances(
        sage,
        [await staking.getAddress(), stakerAccount33.address],
        [0, 0]
      );

      await expect(
        staking.connect(stakerAccount33).claim(60 * 60)
      ).to.changeEtherBalances(
        [await staking.getAddress(), stakerAccount33.address],
        [0, 0]
      );
    });

    it("Should send ETH to user if rewards were added", async function () {
      const { sage, staking, rewarder, stakerAccount33 } = await loadFixture(
        deployStakingFixture
      );

      const amount = ethers.parseEther("10");

      await staking.connect(rewarder).addRewardETH(0, { value: amount });

      await expect(
        staking.connect(stakerAccount33).claim(60 * 60)
      ).to.changeEtherBalances(
        [await staking.getAddress(), stakerAccount33.address],
        [-amount / 3n, amount / 3n]
      );
    });

    it("Should send SAGE to user if rewards were added", async function () {
      const { sage, staking, rewarder, stakerAccount33 } = await loadFixture(
        deployStakingFixture
      );

      const amount = ethers.parseEther("10");

      await staking
        .connect(rewarder)
        .addReward(await sage.getAddress(), ethers.parseEther("10"), 0);

      await expect(
        staking.connect(stakerAccount33).claim(60 * 60)
      ).to.changeTokenBalances(
        sage,
        [await staking.getAddress(), stakerAccount33.address],
        [-amount / 3n, amount / 3n]
      );
    });

    it("Should match claimed amount with getClaimeableRewards", async function () {
      const { sage, staking, rewarder, stakerAccount33 } = await loadFixture(
        deployStakingFixture
      );

      await staking
        .connect(rewarder)
        .addReward(await sage.getAddress(), ethers.parseEther("10"), 0);

      const claimeable = await staking.getClaimeableRewards(
        stakerAccount33.address,
        60 * 60
      );

      await expect(
        staking.connect(stakerAccount33).claim(60 * 60)
      ).to.changeTokenBalances(
        sage,
        [await staking.getAddress(), stakerAccount33.address],
        [-claimeable[0].amount, claimeable[0].amount]
      );
    });
  });
});
